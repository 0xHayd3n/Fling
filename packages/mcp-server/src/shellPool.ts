import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { FlingError } from "./errors.js";
import { buildFramedCommand, makeFrameMatcher, newToken } from "./shellFraming.js";

export interface AdbShellOptions {
  /**
   * Injection seam for tests: a function returning a ChildProcess-shaped
   * object. Defaults to node:child_process.spawn.
   */
  spawnImpl?: (cmd: string, args: string[]) => ChildProcess;
}

export interface ExecOptions {
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  exitCode: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

interface QueueEntry {
  cmd: string;
  seq: number;
  resolve: (r: ExecResult) => void;
  reject: (e: unknown) => void;
}

interface InFlight {
  seq: number;
  resolve: (r: ExecResult) => void;
  reject: (e: unknown) => void;
  stdoutLines: string[];
}

export class AdbShell {
  private child: ChildProcess | null = null;
  private readonly token: string = newToken();
  private readonly matcher = makeFrameMatcher(this.token);
  private seq = 0;
  private shutDown = false;
  private readonly spawnImpl: (cmd: string, args: string[]) => ChildProcess;
  private buffer = "";
  private queue: QueueEntry[] = [];
  private inFlight: InFlight | null = null;
  private readersAttached = false;

  constructor(
    public readonly serial: string,
    options: AdbShellOptions = {}
  ) {
    this.spawnImpl = options.spawnImpl ?? nodeSpawn;
  }

  /** @internal — test seam. Real callers go through exec(). */
  _ensureSpawned(): ChildProcess {
    if (this.child) return this.child;
    if (this.shutDown) {
      throw new FlingError(
        "ADB_SHELL_SHUT_DOWN",
        `Shell for ${this.serial} has been shut down.`
      );
    }
    this.child = this.spawnImpl("adb", ["-s", this.serial, "shell"]);
    return this.child;
  }

  exec(cmd: string, _opts: ExecOptions = {}): Promise<ExecResult> {
    if (this.shutDown) {
      return Promise.reject(
        new FlingError(
          "ADB_SHELL_SHUT_DOWN",
          `Shell for ${this.serial} has been shut down.`
        )
      );
    }
    this.seq += 1;
    const seq = this.seq;
    return new Promise<ExecResult>((resolve, reject) => {
      this.queue.push({ cmd, seq, resolve, reject });
      this._pump();
    });
  }

  private _pump(): void {
    if (this.inFlight) return;
    const next = this.queue.shift();
    if (!next) return;
    const child = this._ensureSpawned();
    this._attachReadersOnce(child);
    this.inFlight = {
      seq: next.seq,
      resolve: next.resolve,
      reject: next.reject,
      stdoutLines: [],
    };
    const framed = buildFramedCommand(next.cmd, this.token, next.seq);
    child.stdin!.write(framed + "\n");
  }

  private _attachReadersOnce(child: ChildProcess): void {
    if (this.readersAttached) return;
    this.readersAttached = true;
    child.stdout!.on("data", (chunk: Buffer | string) => this._onStdout(chunk));
  }

  private _onStdout(chunk: Buffer | string): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split(/\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const call = this.inFlight;
      if (!call) continue;
      const m = this.matcher.matchLine(line, call.seq);
      if (m.matched) {
        this.inFlight = null;
        // The framing's printf prepends a literal \n so the sentinel lines
        // up at column 0 even if the user's command emitted no trailing
        // newline. That separator surfaces as a trailing empty entry in
        // stdoutLines — discard it so we don't tack a spurious blank line
        // onto every command's stdout.
        if (
          call.stdoutLines.length > 0 &&
          call.stdoutLines[call.stdoutLines.length - 1] === ""
        ) {
          call.stdoutLines.pop();
        }
        const stdout =
          call.stdoutLines.length === 0
            ? ""
            : call.stdoutLines.join("\n") + "\n";
        call.resolve({ stdout, exitCode: m.exitCode! });
        this._pump();
      } else {
        call.stdoutLines.push(line);
      }
    }
  }

  shutdown(): void {
    this.shutDown = true;
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
  }
}
