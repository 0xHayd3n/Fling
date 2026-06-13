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
