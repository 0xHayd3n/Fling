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
  socket: Socket;
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
      "tunnel_forward=true",
      "control=true",
      "audio=false",
      "video_codec=h264",
      `max_size=${opts.maxResolution}`,
      `video_bit_rate=${opts.bitrate}`,
      "video_codec_options=profile=1",
    ];
    const proc = spawn("adb", args);
    proc.stderr.on("data", (d) => process.stderr.write(`[scrcpy:${deviceId}] ${d}`));
    return proc;
  }

  let nextLocalPort = 27183;
  const allocPort = () => nextLocalPort++;

  emitter.start = async (deviceId, opts) => {
    const mirrorId = randomUUID();
    const maxResolution = opts?.maxResolution ?? 1080;
    const bitrate = opts?.bitrate ?? 4_000_000;
    const scId = randomUUID().replace(/-/g, "").slice(0, 8);
    const localPort = allocPort();

    await pushJar(deviceId);
    await adbForward(deviceId, localPort, `scrcpy_${scId}`);

    const serverProc = startServerOnDevice(deviceId, { maxResolution, bitrate, scId });

    // The server needs a moment to bind the abstract socket inside the device.
    let socket: Socket | null = null;
    const startConnect = Date.now();
    while (Date.now() - startConnect < 5000) {
      try {
        socket = await new Promise<Socket>((resolve, reject) => {
          const s = createConnection({ host: "127.0.0.1", port: localPort });
          s.once("connect", () => resolve(s));
          s.once("error", reject);
        });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    if (!socket) {
      try { serverProc.kill(); } catch {}
      await adbUnforward(localPort);
      throw new Error("scrcpy connect timeout");
    }

    let metaBuf = new Uint8Array(0);
    const splitter = createNalSplitter();
    let meta: { deviceName: string; width: number; height: number } | null = null;

    const onData = (chunk: Buffer) => {
      const u8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      if (!meta) {
        const next = new Uint8Array(metaBuf.length + u8.length);
        next.set(metaBuf, 0); next.set(u8, metaBuf.length);
        metaBuf = next;
        if (metaBuf.length < 69) return;
        meta = decodeDeviceMeta(metaBuf.subarray(1, 69));
        const remainder = metaBuf.subarray(69);
        metaBuf = new Uint8Array(0);
        if (remainder.length === 0) return;
        const frames = splitter.push(remainder);
        for (const f of frames) emitter.emit("frame", mirrorId, f.nal, f.pts);
        return;
      }
      const frames = splitter.push(u8);
      for (const f of frames) emitter.emit("frame", mirrorId, f.nal, f.pts);
    };

    socket.on("data", onData);
    socket.on("close", () => {
      emitter.emit("ended", mirrorId, "socket-closed");
      sessions.delete(mirrorId);
      void adbUnforward(localPort);
    });
    socket.on("error", (err) => emitter.emit("ended", mirrorId, `socket-error: ${err.message}`));

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const i = setInterval(() => {
        if (meta) { clearInterval(i); resolve(); }
        else if (Date.now() - start > 5000) { clearInterval(i); reject(new Error("scrcpy meta timeout")); }
      }, 25);
    });

    const session: ScrcpySession = {
      mirrorId,
      deviceId,
      width: meta!.width,
      height: meta!.height,
      deviceName: meta!.deviceName,
      socket,
      serverProc,
      stop: async () => {
        try { socket!.destroy(); } catch {}
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
    s.socket.write(bytes);
  };

  emitter.active = () => Array.from(sessions.values());
  return emitter;
}
