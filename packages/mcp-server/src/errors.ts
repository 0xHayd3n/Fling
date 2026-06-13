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
  | "UI_ELEMENT_NOT_FOUND"
  | "UI_WAIT_TIMEOUT"
  | "ADB_SHELL_SHUT_DOWN"
  | "ADB_SHELL_DIED"
  | "ADB_SHELL_RECYCLED"
  | "BUILD_TOOL_NOT_FOUND"
  | "BUILD_TIMEOUT"
  | "BUILD_FAILED"
  | "CONFIG_MISSING"
  | "PAIRING_TIMEOUT"
  | "ADB_PAIR_FAILED"
  | "ADB_CONNECT_FAILED"
  | "MDNS_UNAVAILABLE"
  | "UNKNOWN_SERVICE"
  | "PAIRING_IN_PROGRESS"
  | "CDP_APP_NOT_RUNNING"
  | "CDP_NO_TARGETS"
  | "CDP_WEBVIEW_NOT_DEBUGGABLE"
  | "CDP_FORWARD_FAILED"
  | "CDP_PROBE_FAILED";

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
