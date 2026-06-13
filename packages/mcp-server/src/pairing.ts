import { randomBytes } from "node:crypto";
import { runAdb } from "./adb.js";
import { FlingError } from "./errors.js";
import { buildQrText } from "./qrText.js";
import {
  discoverPairingPort as realDiscoverPairing,
  discoverConnectByHost as realDiscoverConnect,
} from "./mdns.js";

export type PairStatus =
  | { kind: "waiting" }
  | { kind: "pairing" }
  | { kind: "connecting" }
  | { kind: "success"; serial: string; model: string }
  | { kind: "error"; reason: string; rawAdbError?: string }
  | { kind: "timeout" };

export interface StartPairQrOptions {
  onStatus?: (s: PairStatus) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StartPairQrResult {
  qrText: string;
  serviceName: string;
  done: Promise<PairStatus>;
}

export interface PairWithCodeOptions {
  host: string;
  port: number;
  code: string;
  onStatus?: (s: PairStatus) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

type RunAdbFn = (args: string[], opts?: { stdin?: string; timeoutMs?: number }) => Promise<{ stdout: string; stderr: string }>;
let runAdbImpl: RunAdbFn = (args) => runAdb(args);
export function __setRunAdbForTest(fn: RunAdbFn | null): void {
  runAdbImpl = fn ?? ((args) => runAdb(args));
}

interface Discover {
  discoverPairingPort: typeof realDiscoverPairing;
  discoverConnectByHost: typeof realDiscoverConnect;
}
let discoverImpl: Discover = {
  discoverPairingPort: realDiscoverPairing,
  discoverConnectByHost: realDiscoverConnect,
};
export function __setDiscoverForTest(d: Discover | null): void {
  discoverImpl = d ?? {
    discoverPairingPort: realDiscoverPairing,
    discoverConnectByHost: realDiscoverConnect,
  };
}

const DEFAULT_TIMEOUT_MS = 60_000;

function genServiceName(): string {
  return `fling-debug-${randomBytes(2).toString("hex")}`;
}

function genPassword(): string {
  return randomBytes(12).toString("base64").replace(/[=+/]/g, "");
}

function emit(cb: ((s: PairStatus) => void) | undefined, s: PairStatus): void {
  if (cb) {
    try {
      cb(s);
    } catch {
      // Listener errors must not break the state machine.
    }
  }
}

async function parseDevicesForSerial(serial: string): Promise<{ serial: string; model: string } | null> {
  const { stdout } = await runAdbImpl(["devices", "-l"]);
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes(serial)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    if (parts[1] !== "device") continue;
    const modelMatch = parts.find((p) => p.startsWith("model:"));
    return { serial: parts[0], model: modelMatch ? modelMatch.slice("model:".length) : "Unknown" };
  }
  return null;
}

async function waitForDeviceReady(serial: string, timeoutMs: number): Promise<{ serial: string; model: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const d = await parseDevicesForSerial(serial);
    if (d) return d;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new FlingError("ADB_CONNECT_FAILED", `Device ${serial} did not become ready within ${timeoutMs}ms.`);
}

/**
 * Build an abort-aware race promise that rejects with "Cancelled." when the
 * signal fires. Returns a no-op promise (never resolves/rejects) when no
 * signal is provided, making Promise.race safe to call unconditionally.
 */
function abortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (!signal) return; // never resolves
    if (signal.aborted) {
      reject(new Error("Cancelled."));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("Cancelled.")), { once: true });
  });
}

export function startPairQr(opts: StartPairQrOptions = {}): StartPairQrResult {
  const serviceName = genServiceName();
  const password = genPassword();
  const qrText = buildQrText({ serviceName, password });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const done = (async (): Promise<PairStatus> => {
    if (opts.signal?.aborted) {
      const s: PairStatus = { kind: "error", reason: "Cancelled before start." };
      emit(opts.onStatus, s);
      return s;
    }
    emit(opts.onStatus, { kind: "waiting" });

    const abort = abortPromise(opts.signal);

    let pairingHost: string;
    let pairingPort: number;
    try {
      const r = await Promise.race([
        discoverImpl.discoverPairingPort(serviceName, timeoutMs),
        abort,
      ]);
      pairingHost = r.host;
      pairingPort = r.port;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (opts.signal?.aborted) {
        const s: PairStatus = { kind: "error", reason: "Cancelled." };
        emit(opts.onStatus, s);
        return s;
      }
      if (code === "PAIRING_TIMEOUT") {
        const s: PairStatus = { kind: "timeout" };
        emit(opts.onStatus, s);
        return s;
      }
      const s: PairStatus = { kind: "error", reason: (err as Error).message };
      emit(opts.onStatus, s);
      return s;
    }

    emit(opts.onStatus, { kind: "pairing" });
    try {
      await runAdbImpl(["pair", `${pairingHost}:${pairingPort}`, password]);
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      const s: PairStatus = {
        kind: "error",
        reason: (e.stderr && e.stderr.trim()) || e.message || "adb pair failed",
        rawAdbError: e.stderr,
      };
      emit(opts.onStatus, s);
      return s;
    }

    emit(opts.onStatus, { kind: "connecting" });
    let connectInfo: { host: string; port: number };
    try {
      // After pair, the phone advertises _adb-tls-connect on a fresh port.
      // We don't know the device's serial yet (we get it from `adb devices`
      // post-connect), so match by host — connect service is on the same
      // host as pairing.
      const r = await Promise.race([
        discoverImpl.discoverConnectByHost(pairingHost, 10_000),
        abort,
      ]);
      connectInfo = r;
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      const s: PairStatus = {
        kind: "error",
        reason: (e.message ?? "Couldn't find connect service after pairing"),
        rawAdbError: e.stderr,
      };
      emit(opts.onStatus, s);
      return s;
    }

    try {
      await runAdbImpl(["connect", `${connectInfo.host}:${connectInfo.port}`]);
      const dev = await waitForDeviceReady(`${connectInfo.host}:${connectInfo.port}`, 5_000);
      const s: PairStatus = { kind: "success", serial: dev.serial, model: dev.model };
      emit(opts.onStatus, s);
      return s;
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      const s: PairStatus = {
        kind: "error",
        reason: (e.stderr && e.stderr.trim()) || e.message || "adb connect failed",
        rawAdbError: e.stderr,
      };
      emit(opts.onStatus, s);
      return s;
    }
  })();

  return { qrText, serviceName, done };
}

export async function pairWithCode(opts: PairWithCodeOptions): Promise<PairStatus> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  emit(opts.onStatus, { kind: "pairing" });
  try {
    await runAdbImpl(["pair", `${opts.host}:${opts.port}`, opts.code]);
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const s: PairStatus = {
      kind: "error",
      reason: (e.stderr && e.stderr.trim()) || e.message || "adb pair failed",
      rawAdbError: e.stderr,
    };
    emit(opts.onStatus, s);
    return s;
  }

  emit(opts.onStatus, { kind: "connecting" });
  try {
    const r = await discoverImpl.discoverConnectByHost(opts.host, timeoutMs);
    await runAdbImpl(["connect", `${r.host}:${r.port}`]);
    const dev = await waitForDeviceReady(`${r.host}:${r.port}`, 5_000);
    const s: PairStatus = { kind: "success", serial: dev.serial, model: dev.model };
    emit(opts.onStatus, s);
    return s;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const s: PairStatus = {
      kind: "error",
      reason: (e.stderr && e.stderr.trim()) || e.message || "adb connect failed",
      rawAdbError: e.stderr,
    };
    emit(opts.onStatus, s);
    return s;
  }
}
