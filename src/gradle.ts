import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { promisify } from "node:util";
import { FlingError } from "./errors.js";
import type { FlingConfig } from "./config.js";

const execFileAsync = promisify(execFile);

const DEFAULT_GRADLE_TASK = "assembleDebug";
const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BUILD_BUFFER_BYTES = 50 * 1024 * 1024;

const IS_WINDOWS = process.platform === "win32";

const TASK_NAME_RE = /^[A-Za-z][\w:.\-]*$/;

export interface BuildCommand {
  command: string;
  args: string[];
  source: "config" | "wrapper" | "path";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function splitBuildCommand(cmd: string | string[]): string[] {
  if (Array.isArray(cmd)) return cmd;
  return cmd.trim().split(/\s+/).filter(Boolean);
}

/**
 * Wrap an invocation through cmd.exe so we can run .bat/.cmd safely on
 * Windows without enabling `shell: true` (which would be injectable).
 */
function wrapForWindowsBatch(command: string, args: string[]): { command: string; args: string[] } {
  return { command: "cmd.exe", args: ["/c", command, ...args] };
}

function looksLikeBatch(command: string): boolean {
  const lower = command.toLowerCase();
  return lower.endsWith(".bat") || lower.endsWith(".cmd");
}

/**
 * Resolve the command Fling should run for a build, given a buildCwd and
 * the user's (possibly empty) config.
 *
 * Order of preference:
 *   1. config.buildCommand (string split on whitespace, or array)
 *   2. gradle wrapper at buildCwd (gradlew.bat on Windows, gradlew otherwise)
 *   3. `gradle` on PATH
 */
export async function resolveBuildCommand(
  buildCwd: string,
  config: FlingConfig
): Promise<BuildCommand> {
  if (config.buildCommand) {
    const tokens = splitBuildCommand(config.buildCommand);
    if (tokens.length === 0) {
      throw new FlingError(
        "INVALID_INPUT",
        "buildCommand in fling config is empty."
      );
    }
    return { command: tokens[0], args: tokens.slice(1), source: "config" };
  }

  const task = config.gradleTask ?? DEFAULT_GRADLE_TASK;
  if (!TASK_NAME_RE.test(task)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid gradleTask "${task}". Expected a gradle task identifier.`
    );
  }

  const wrapperName = IS_WINDOWS ? "gradlew.bat" : "gradlew";
  const wrapperPath = resolvePath(buildCwd, wrapperName);
  if (await fileExists(wrapperPath)) {
    return { command: wrapperPath, args: [task], source: "wrapper" };
  }

  return { command: "gradle", args: [task], source: "path" };
}

export interface RunBuildOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface BuildOutcome {
  command: BuildCommand;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Run a build command synchronously (no streaming) and return the captured
 * output. Throws FlingError on non-zero exit, timeout, or missing tool.
 */
export async function runBuild(
  cwd: string,
  command: BuildCommand,
  options: RunBuildOptions = {}
): Promise<BuildOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_BUILD_BUFFER_BYTES;

  let invocation = { command: command.command, args: command.args };
  if (IS_WINDOWS && looksLikeBatch(command.command)) {
    invocation = wrapForWindowsBatch(command.command, command.args);
  }

  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(invocation.command, invocation.args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true,
    });
    return { command, stdout, stderr, durationMs: Date.now() - start };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals | null;
      code?: string | number;
    };

    if (e.code === "ENOENT") {
      throw new FlingError(
        "BUILD_TOOL_NOT_FOUND",
        command.source === "wrapper"
          ? `Gradle wrapper not found at ${command.command}.`
          : command.source === "path"
            ? "`gradle` was not found on PATH and no wrapper exists at the build cwd. " +
              "Either commit a gradle wrapper to the project or install Gradle and add it to PATH."
            : `Build command ${command.command} was not found.`
      );
    }

    if (e.killed) {
      throw new FlingError(
        "BUILD_TIMEOUT",
        `Build timed out after ${timeoutMs}ms`,
        { stdout: e.stdout, stderr: e.stderr }
      );
    }

    const reason = extractBuildFailureReason(e.stdout ?? "", e.stderr ?? "");
    const exitCode = typeof e.code === "number" ? e.code : undefined;
    throw new FlingError(
      "BUILD_FAILED",
      `Build failed${exitCode !== undefined ? ` (exit ${exitCode})` : ""}:\n${reason}`,
      { stdout: e.stdout, stderr: e.stderr, exitCode }
    );
  }
}

/**
 * Pull the most useful failure block out of a verbose gradle log. Falls
 * back to the last 25 non-empty lines if no marker is found.
 */
export function extractBuildFailureReason(stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`.replace(/\r\n/g, "\n");
  const whatWentWrong = combined.match(
    /\* What went wrong:[\s\S]*?(?=\n\* Try:|\n\* Exception|\nBUILD FAILED|\n\* Get more help|$)/
  );
  if (whatWentWrong) return whatWentWrong[0].trim();

  const buildFailedIdx = combined.lastIndexOf("BUILD FAILED");
  if (buildFailedIdx >= 0) {
    const tail = combined.slice(Math.max(0, buildFailedIdx - 4000));
    return tail.trim();
  }

  const lines = combined.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(-25).join("\n").trim() || "(no output)";
}

export { DEFAULT_GRADLE_TASK, join as joinPath };
