import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AdbErrorCode =
  | "ADB_NOT_FOUND"
  | "ADB_TIMEOUT"
  | "ADB_FAILED";

export class AdbError extends Error {
  readonly code: AdbErrorCode;
  readonly stderr?: string;
  readonly stdout?: string;
  readonly exitCode?: number;

  constructor(
    code: AdbErrorCode,
    message: string,
    extras: { stderr?: string; stdout?: string; exitCode?: number } = {}
  ) {
    super(message);
    this.name = "AdbError";
    this.code = code;
    this.stderr = extras.stderr;
    this.stdout = extras.stdout;
    this.exitCode = extras.exitCode;
  }
}

export interface RunAdbOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface AdbResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

const ADB_INSTALL_HINT =
  "adb (Android Platform Tools) is required but was not found on PATH. " +
  "Install it via `winget install Google.PlatformTools` (Windows), " +
  "`brew install --cask android-platform-tools` (macOS), " +
  "or your distro's package manager (Linux), then restart this MCP server.";

export async function runAdb(
  args: string[],
  options: RunAdbOptions = {}
): Promise<AdbResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER;

  try {
    const { stdout, stderr } = await execFileAsync("adb", args, {
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true,
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals | null;
      code?: string | number;
    };

    if (e.code === "ENOENT") {
      throw new AdbError("ADB_NOT_FOUND", ADB_INSTALL_HINT);
    }

    if (e.killed && e.signal === "SIGTERM") {
      throw new AdbError(
        "ADB_TIMEOUT",
        `adb ${args.join(" ")} timed out after ${timeoutMs}ms`,
        { stdout: e.stdout, stderr: e.stderr }
      );
    }

    const exitCode = typeof e.code === "number" ? e.code : undefined;
    throw new AdbError(
      "ADB_FAILED",
      `adb ${args.join(" ")} failed${exitCode !== undefined ? ` (exit ${exitCode})` : ""}: ${
        (e.stderr || e.message || "unknown error").trim()
      }`,
      { stdout: e.stdout, stderr: e.stderr, exitCode }
    );
  }
}
