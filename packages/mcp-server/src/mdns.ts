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
