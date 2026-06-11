export type FlingErrorCode =
  | "ADB_NOT_FOUND"
  | "ADB_TIMEOUT"
  | "ADB_FAILED"
  | "NO_DEVICE"
  | "NO_READY_DEVICE"
  | "MULTIPLE_DEVICES"
  | "APK_NOT_FOUND"
  | "INSTALL_FAILED"
  | "LAUNCH_FAILED"
  | "APP_NOT_RUNNING"
  | "INVALID_INPUT"
  | "BUILD_TOOL_NOT_FOUND"
  | "BUILD_TIMEOUT"
  | "BUILD_FAILED"
  | "CONFIG_MISSING";

export class FlingError extends Error {
  readonly code: FlingErrorCode;
  readonly stderr?: string;
  readonly stdout?: string;
  readonly exitCode?: number;

  constructor(
    code: FlingErrorCode,
    message: string,
    extras: { stderr?: string; stdout?: string; exitCode?: number } = {}
  ) {
    super(message);
    this.name = "FlingError";
    this.code = code;
    this.stderr = extras.stderr;
    this.stdout = extras.stdout;
    this.exitCode = extras.exitCode;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof FlingError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
