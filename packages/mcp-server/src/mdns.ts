export interface MdnsService {
  serviceName: string;
  host: string;
  port: number;
}

export interface ParsedMdns {
  pairing: MdnsService[];
  connect: MdnsService[];
  daemonAvailable: boolean;
}

const PAIRING_TYPE = "_adb-tls-pairing._tcp.";
const CONNECT_TYPE = "_adb-tls-connect._tcp.";

export function parseMdnsServices(stdout: string): ParsedMdns {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().startsWith("ERROR")) {
      return { pairing: [], connect: [], daemonAvailable: false };
    }
  }

  const pairing: MdnsService[] = [];
  const connect: MdnsService[] = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith("List of discovered")) continue;
    const parts = line.split(/\t+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 3) continue;
    const [serviceName, type, hostPort] = parts;
    const m = /^([0-9.]+):(\d+)$/.exec(hostPort);
    if (!m) continue;
    const entry = { serviceName, host: m[1], port: parseInt(m[2], 10) };
    if (type === PAIRING_TYPE) pairing.push(entry);
    else if (type === CONNECT_TYPE) connect.push(entry);
  }

  return { pairing, connect, daemonAvailable: true };
}

import { runAdb } from "./adb.js";
import { FlingError } from "./errors.js";

type RunAdbFn = (args: string[]) => Promise<{ stdout: string; stderr: string }>;
let runAdbImpl: RunAdbFn = runAdb;

export function __setRunAdbForTest(fn: RunAdbFn | null): void {
  runAdbImpl = fn ?? runAdb;
}

async function pollMdns(): Promise<ParsedMdns> {
  const { stdout } = await runAdbImpl(["mdns", "services"]);
  return parseMdnsServices(stdout);
}

export async function discoverPairingPort(
  serviceName: string,
  timeoutMs: number,
  pollIntervalMs = 500
): Promise<MdnsService> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pollMdns();
    if (!r.daemonAvailable) {
      throw new FlingError("MDNS_UNAVAILABLE", "adb mdns daemon is not available.");
    }
    const match = r.pairing.find((s) => s.serviceName === serviceName);
    if (match) return match;
    await new Promise((res) => setTimeout(res, pollIntervalMs));
  }
  throw new FlingError(
    "PAIRING_TIMEOUT",
    `No mDNS pairing service '${serviceName}' within ${timeoutMs}ms.`
  );
}

export async function discoverConnectByHost(
  host: string,
  timeoutMs: number,
  pollIntervalMs = 500
): Promise<MdnsService> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pollMdns();
    if (!r.daemonAvailable) {
      throw new FlingError("MDNS_UNAVAILABLE", "adb mdns daemon is not available.");
    }
    const match = r.connect.find((s) => s.host === host);
    if (match) return match;
    await new Promise((res) => setTimeout(res, pollIntervalMs));
  }
  throw new FlingError(
    "PAIRING_TIMEOUT",
    `No mDNS connect service on host '${host}' within ${timeoutMs}ms.`
  );
}
