import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { createNalSplitter, decodeDeviceMeta } from "./scrcpyNalParser";

const SCRCPY_VERSION = "2.7";
const REMOTE_JAR = "/data/local/tmp/scrcpy-server.jar";

export interface ScrcpySession {
  mirrorId: string;
  deviceId: string;
  width: number;
  height: number;
  deviceName: string;
  configNal: Uint8Array;
  firstKeyNal: Uint8Array;
  firstKeyPts: number;
  videoSocket: Socket;
  controlSocket: Socket;
  serverProc: ChildProcess;
  stop: () => Promise<void>;
}

export interface ScrcpyManager extends EventEmitter {
  start(deviceId: string, opts?: { maxResolution?: number; bitrate?: number }): Promise<ScrcpySession>;
  stop(mirrorId: string): Promise<void>;
  send(mirrorId: string, bytes: Uint8Array): void;
  active(): ScrcpySession[];
}

export function createScrcpyManager(): ScrcpyManager {
  const emitter = new EventEmitter() as ScrcpyManager;
  const sessions = new Map<string, ScrcpySession>();
  const jarPath = path.join(
    app.isPackaged ? process.resourcesPath : path.join(__dirname, "../../resources"),
    "scrcpy-server.jar"
  );

  async function pushJar(deviceId: string) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("adb", ["-s", deviceId, "push", jarPath, REMOTE_JAR]);
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("error", reject);
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`adb push failed: ${stderr}`))));
    });
  }

  async function adbForward(deviceId: string, localPort: number, remoteSocket: string) {
    await new Promise<void>((resolve, reject) => {
      const f = spawn("adb", ["-s", deviceId, "forward", `tcp:${localPort}`, `localabstract:${remoteSocket}`]);
      f.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("adb forward failed"))));
    });
  }

  async function adbUnforward(localPort: number) {
    await new Promise<void>((resolve) => {
      const f = spawn("adb", ["forward", "--remove", `tcp:${localPort}`]);
      f.on("exit", () => resolve());
    });
  }

  function startServerOnDevice(deviceId: string, opts: { maxResolution: number; bitrate: number; scId: string }) {
    const args = [
      "-s", deviceId, "shell",
      `CLASSPATH=${REMOTE_JAR} app_process / com.genymobile.scrcpy.Server ${SCRCPY_VERSION}`,
      `scid=${opts.scId}`,
      "log_level=verbose",
      "tunnel_forward=true",
      "control=true",
      "audio=false",
      "video=true",
      "video_codec=h264",
      `max_size=${opts.maxResolution}`,
      `video_bit_rate=${opts.bitrate}`,
      "send_device_meta=true",
      "send_codec_meta=true",
      "send_frame_meta=true",
      "send_dummy_byte=true",
    ];
    const proc = spawn("adb", args);
    proc.stderr.on("data", (d) => process.stderr.write(`[scrcpy:${deviceId}:stderr] ${d}`));
    proc.stdout.on("data", (d) => process.stderr.write(`[scrcpy:${deviceId}:stdout] ${d}`));
    proc.on("exit", (code, sig) => process.stderr.write(`[scrcpy:${deviceId}] proc exited code=${code} sig=${sig}\n`));

    // Resolves once scrcpy has logged the device line — at that point Options.parse has
    // succeeded and we know the server process is alive. Bind of the abstract socket
    // follows immediately after. With this signal we avoid the race where our TCP
    // connect arrives before scrcpy's LocalServerSocket exists, which produces an
    // adb-side "success" that never gets delivered to scrcpy's accept().
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("scrcpy didn't reach Device: log within 5s")), 5000);
      const onChunk = (d: Buffer) => {
        if (d.toString().includes("INFO: Device:")) {
          clearTimeout(timeout);
          proc.stdout.off("data", onChunk);
          proc.stderr.off("data", onChunk);
          resolve();
        }
      };
      proc.stdout.on("data", onChunk);
      proc.stderr.on("data", onChunk);
    });

    return { proc, ready };
  }

  let nextLocalPort = 27183;
  const allocPort = () => nextLocalPort++;

  emitter.start = async (deviceId, opts) => {
    const mirrorId = randomUUID();
    const maxResolution = opts?.maxResolution ?? 1080;
    const bitrate = opts?.bitrate ?? 4_000_000;
    // scrcpy parses `scid` as a Java signed Int32 in radix 16 — max 0x7fffffff.
    // randomUUID slices can land beyond that; force the leading hex digit to 0-7
    // (top bit zero) so the result always fits.
    const scId = (Math.floor(Math.random() * 0x80000000)).toString(16).padStart(8, "0");
    const localPort = allocPort();

    await pushJar(deviceId);
    await adbForward(deviceId, localPort, `scrcpy_${scId}`);

    const { proc: serverProc, ready } = startServerOnDevice(deviceId, { maxResolution, bitrate, scId });

    const log = (m: string) => process.stderr.write(`[scrcpy:${deviceId}:${mirrorId.slice(0, 4)}] ${m}\n`);

    // Don't try to connect until scrcpy is past Options.parse. Connecting before the
    // device-side LocalServerSocket binds produces an adb-side "success" that never
    // reaches scrcpy's accept().
    try {
      await ready;
      log("scrcpy server ready (Device: log seen)");
    } catch (err) {
      try { serverProc.kill(); } catch {}
      await adbUnforward(localPort);
      throw err;
    }
    await new Promise((r) => setTimeout(r, 200));

    // scrcpy 2.x with tunnel_forward + control=true requires TWO TCP connections
    // to the same forwarded port: the first is the video socket (server writes
    // dummy byte + meta + frames), the second is the control socket (we write
    // touch events). The server's second accept() blocks until the second
    // connect, and only then does it send the 68-byte device-meta header.
    const connectOnce = async (timeoutMs: number) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          return await new Promise<Socket>((resolve, reject) => {
            const s = createConnection({ host: "127.0.0.1", port: localPort });
            s.once("connect", () => resolve(s));
            s.once("error", reject);
          });
        } catch {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      return null;
    };

    const videoSocket = await connectOnce(5000);
    if (!videoSocket) {
      try { serverProc.kill(); } catch {}
      await adbUnforward(localPort);
      throw new Error("scrcpy video connect timeout");
    }
    log("video socket connected");

    // Server's second accept() should be unblocked by the next connect.
    const controlSocket = await connectOnce(5000);
    if (!controlSocket) {
      try { videoSocket.destroy(); } catch {}
      try { serverProc.kill(); } catch {}
      await adbUnforward(localPort);
      throw new Error("scrcpy control connect timeout");
    }
    log("control socket connected");

    let metaBuf = new Uint8Array(0);
    const splitter = createNalSplitter();
    let meta: { deviceName: string; width: number; height: number } | null = null;
    let configNal: Uint8Array | null = null;
    let firstKeyNal: Uint8Array | null = null;
    let firstKeyPts = 0;
    let videoBytesTotal = 0;
    let controlBytesTotal = 0;

    const onVideoData = (chunk: Buffer) => {
      videoBytesTotal += chunk.length;
      if (!meta) log(`video chunk ${chunk.length}B; total ${videoBytesTotal}B; first 16: ${Array.from(chunk.subarray(0, Math.min(16, chunk.length))).map((b) => b.toString(16).padStart(2, "0")).join(" ")}`);
      const u8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      let frames: { nal: Uint8Array; pts: number; isConfig: boolean; isKey: boolean }[] = [];
      if (!meta) {
        const next = new Uint8Array(metaBuf.length + u8.length);
        next.set(metaBuf, 0); next.set(u8, metaBuf.length);
        metaBuf = next;
        if (metaBuf.length < 77) return;
        meta = decodeDeviceMeta(metaBuf.subarray(1, 77));
        log(`meta resolved: name="${meta.deviceName}" ${meta.width}x${meta.height}`);
        const remainder = metaBuf.subarray(77);
        metaBuf = new Uint8Array(0);
        if (remainder.length > 0) frames = splitter.push(remainder);
      } else {
        frames = splitter.push(u8);
      }
      for (const f of frames) {
        if (f.isConfig && !configNal) {
          configNal = f.nal;
          log(`captured CONFIG packet (${f.nal.length}B)`);
          continue;
        }
        if (!firstKeyNal && f.isKey) {
          firstKeyNal = f.nal;
          firstKeyPts = f.pts;
          log(`captured first IDR (${f.nal.length}B, pts=${f.pts})`);
          continue;
        }
        // Only stream frames AFTER the renderer has had a chance to subscribe.
        // The first key+config are returned via mirror.start(); subsequent frames
        // flow through the IPC channel. We emit nothing during the buffering
        // window because the renderer can't be listening yet.
        if (firstKeyNal !== null) {
          emitter.emit("frame", mirrorId, f.nal, f.pts, f.isConfig, f.isKey);
        }
      }
    };
    const onControlData = (chunk: Buffer) => {
      controlBytesTotal += chunk.length;
      log(`control chunk ${chunk.length}B; total ${controlBytesTotal}B (unexpected — control is supposed to be write-only from client)`);
    };

    videoSocket.on("data", onVideoData);
    videoSocket.on("close", () => {
      log(`video socket closed (received ${videoBytesTotal}B total)`);
      emitter.emit("ended", mirrorId, "video-socket-closed");
      sessions.delete(mirrorId);
      try { controlSocket.destroy(); } catch {}
      void adbUnforward(localPort);
    });
    videoSocket.on("error", (err) => emitter.emit("ended", mirrorId, `video-socket-error: ${err.message}`));
    controlSocket.on("data", onControlData);
    controlSocket.on("close", () => log(`control socket closed (received ${controlBytesTotal}B total)`));
    controlSocket.on("error", (err) => emitter.emit("ended", mirrorId, `control-socket-error: ${err.message}`));

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const i = setInterval(() => {
        if (meta && configNal && firstKeyNal) { clearInterval(i); resolve(); }
        else if (Date.now() - start > 8000) {
          clearInterval(i);
          reject(new Error(
            !meta ? "scrcpy meta timeout"
            : !configNal ? "scrcpy CONFIG timeout (got meta but no SPS/PPS)"
            : "scrcpy first-IDR timeout (got meta + config but no key frame)"
          ));
        }
      }, 25);
    });

    const session: ScrcpySession = {
      mirrorId,
      deviceId,
      width: meta!.width,
      height: meta!.height,
      deviceName: meta!.deviceName,
      configNal: configNal!,
      firstKeyNal: firstKeyNal!,
      firstKeyPts,
      videoSocket,
      controlSocket,
      serverProc,
      stop: async () => {
        try { videoSocket.destroy(); } catch {}
        try { controlSocket.destroy(); } catch {}
        try { serverProc.kill(); } catch {}
        await adbUnforward(localPort);
      },
    };
    sessions.set(mirrorId, session);
    return session;
  };

  emitter.stop = async (mirrorId) => {
    const s = sessions.get(mirrorId);
    if (!s) return;
    await s.stop();
    sessions.delete(mirrorId);
  };

  emitter.send = (mirrorId, bytes) => {
    const s = sessions.get(mirrorId);
    if (!s) return;
    s.controlSocket.write(bytes);
  };

  emitter.active = () => Array.from(sessions.values());
  return emitter;
}
