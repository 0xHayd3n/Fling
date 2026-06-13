import { runAdb } from "./adb.js";
import { FlingError } from "./errors.js";
import { createServer } from "node:net";

export type CdpSocket =
  | { kind: "webview"; pid: number; name: string }
  | { kind: "chrome"; pid?: number; name: string };

const SOCKET_RE = /@(webview_devtools_remote_(\d+)|chrome_devtools_remote(?:_(\d+))?)\b/g;

export function parseProcNetUnix(output: string): CdpSocket[] {
  const sockets: CdpSocket[] = [];
  for (const line of output.split(/\r?\n/)) {
    SOCKET_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SOCKET_RE.exec(line)) !== null) {
      const name = match[1];
      if (name.startsWith("webview_devtools_remote_")) {
        sockets.push({ kind: "webview", pid: Number(match[2]), name });
      } else if (name === "chrome_devtools_remote") {
        sockets.push({ kind: "chrome", name });
      } else {
        sockets.push({ kind: "chrome", pid: Number(match[3]), name });
      }
    }
  }
  return sockets;
}

export type Prefer = "webview" | "chrome" | "any";

export function pickTarget(
  sockets: CdpSocket[],
  packagePids: number[],
  prefer: Prefer
): CdpSocket | null {
  const pidSet = new Set(packagePids);

  if (prefer === "webview" || prefer === "any") {
    const webviewMatch = sockets.find(
      (s) => s.kind === "webview" && pidSet.has(s.pid)
    );
    if (webviewMatch) return webviewMatch;
    if (prefer === "webview") return null;
  }

  // prefer === "chrome" or "any" with no webview match.
  const chromeMatch = sockets.find((s) => s.kind === "chrome");
  return chromeMatch ?? null;
}

export interface CdpTarget {
  id: string;
  type: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export function parseCdpTargets(json: string): CdpTarget[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((p: Record<string, unknown>) => ({
    id: String(p.id ?? ""),
    type: String(p.type ?? ""),
    title: typeof p.title === "string" ? p.title : undefined,
    url: typeof p.url === "string" ? p.url : undefined,
    webSocketDebuggerUrl:
      typeof p.webSocketDebuggerUrl === "string" ? p.webSocketDebuggerUrl : undefined,
  }));
}

export async function pidofPackage(
  deviceArgs: string[],
  packageName: string
): Promise<number[]> {
  const { stdout } = await runAdb([...deviceArgs, "shell", "pidof", packageName]);
  return stdout
    .trim()
    .split(/\s+/)
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

export async function readProcNetUnix(deviceArgs: string[]): Promise<string> {
  const { stdout } = await runAdb([...deviceArgs, "shell", "cat", "/proc/net/unix"]);
  return stdout;
}

export async function setupForward(
  deviceArgs: string[],
  localPort: number,
  socketName: string
): Promise<void> {
  try {
    await runAdb([
      ...deviceArgs,
      "forward",
      `tcp:${localPort}`,
      `localabstract:${socketName}`,
    ]);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new FlingError(
      "CDP_FORWARD_FAILED",
      `adb forward tcp:${localPort} localabstract:${socketName} failed. Port ${localPort} may be in use — pass a different local_port or omit it for auto-allocation. Cause: ${cause}`
    );
  }
}

export async function teardownForward(
  deviceArgs: string[],
  localPort: number
): Promise<void> {
  try {
    await runAdb([...deviceArgs, "forward", "--remove", `tcp:${localPort}`]);
  } catch {
    // Best-effort cleanup; ignore failures.
  }
}

export async function probeVersion(localPort: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`http://127.0.0.1:${localPort}/json/version`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FlingError(
        "CDP_PROBE_FAILED",
        `CDP probe at /json/version returned ${res.status} ${res.statusText}. The WebView may still be initializing — retry in a moment.`
      );
    }
    await res.text();
  } catch (err) {
    if (err instanceof FlingError) throw err;
    const cause = err instanceof Error ? err.message : String(err);
    throw new FlingError(
      "CDP_PROBE_FAILED",
      `CDP probe at /json/version failed: ${cause}. The WebView may still be initializing — retry in a moment.`
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function listTargets(localPort: number): Promise<CdpTarget[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`http://127.0.0.1:${localPort}/json/list`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseCdpTargets(text);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function allocateEphemeralPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const { port } = address;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate ephemeral port")));
      }
    });
  });
}
