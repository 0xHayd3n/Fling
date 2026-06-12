import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { FlingError } from "./errors.js";
import { makeFrameMatcher, newToken } from "./shellFraming.js";

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

export class AdbShell {
  private child: ChildProcess | null = null;
  private readonly token: string = newToken();
  private readonly matcher = makeFrameMatcher(this.token);
  private seq = 0;
  private shutDown = false;
  private readonly spawnImpl: (cmd: string, args: string[]) => ChildProcess;

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

  exec(_cmd: string, _opts: ExecOptions = {}): Promise<ExecResult> {
    if (this.shutDown) {
      return Promise.reject(
        new FlingError(
          "ADB_SHELL_SHUT_DOWN",
          `Shell for ${this.serial} has been shut down.`
        )
      );
    }
    // Stub — real implementation lands in T1.3 (sentinel-framed read loop).
    return Promise.reject(
      new Error("AdbShell.exec(): pending implementation in T1.3")
    );
  }

  shutdown(): void {
    this.shutDown = true;
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
  }
}
