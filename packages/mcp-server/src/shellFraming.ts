import { randomBytes } from "node:crypto";

/**
 * Per-shell random token used to namespace sentinel lines. 8 hex chars =
 * 2^32 possibilities — far below a credible accidental collision with
 * legitimate command output.
 */
export function newToken(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Append a printf sentinel to the user's command. The sentinel encodes the
 * per-shell token and a per-call sequence number, plus the command's exit
 * code via $?. Reader strips the marker line and exposes everything before
 * it as stdout.
 *
 * Uses printf rather than echo for consistent newline handling across
 * Android's toybox sh.
 */
export function buildFramedCommand(
  cmd: string,
  token: string,
  seq: number
): string {
  return `${cmd} ; printf '\\n__FLING_RC_${token}_${seq}__%d\\n' $?`;
}

export interface FrameMatch {
  matched: boolean;
  exitCode?: number;
}

/**
 * Pre-compile a per-shell matcher. The token is baked into a regex so we
 * don't recompile per line. matchLine is invoked once per CR/LF-delimited
 * stdout line.
 */
export function makeFrameMatcher(token: string): {
  matchLine: (line: string, expectedSeq: number) => FrameMatch;
} {
  const re = new RegExp(`^__FLING_RC_${token}_(\\d+)__(\\d+)$`);
  return {
    matchLine(line: string, expectedSeq: number): FrameMatch {
      const trimmed = line.replace(/\r$/, "");
      const m = re.exec(trimmed);
      if (!m) return { matched: false };
      const seq = Number(m[1]);
      const exitCode = Number(m[2]);
      if (seq !== expectedSeq) return { matched: false };
      return { matched: true, exitCode };
    },
  };
}
