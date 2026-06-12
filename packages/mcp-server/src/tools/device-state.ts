import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

export interface DeviceStateResult {
  foreground_package: string | null;
  foreground_activity: string | null;
  screen_on: boolean | null;
  orientation: number | null;
  logcat_tail: string[];
}

function splitSections(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = stdout.split(/\r?\n/);
  let current: string | null = null;
  for (const line of lines) {
    const m = /^##([A-Z]+)$/.exec(line);
    if (m) {
      current = m[1];
      out[current] = "";
      continue;
    }
    if (current !== null) {
      out[current] += (out[current] ? "\n" : "") + line;
    }
  }
  return out;
}

export function parseDeviceState(stdout: string): DeviceStateResult {
  const sections = splitSections(stdout);

  // Foreground activity. Format from `dumpsys activity activities`:
  //   mResumedActivity: ActivityRecord{<hash> u0 <package>/<activity> t<task>}
  let pkg: string | null = null;
  let activity: string | null = null;
  const fg = sections["FOREGROUND"] ?? "";
  const fgMatch = /ActivityRecord\{\S+\s+\S+\s+([^\s/]+)\/([^\s}]+)/.exec(fg);
  if (fgMatch) {
    pkg = fgMatch[1];
    activity = `${fgMatch[1]}/${fgMatch[2]}`;
  }

  // Screen on/off. `mWakefulness` is the source of truth on modern AOSP; the
  // legacy `Display Power: state=ON|OFF` line stopped being emitted somewhere
  // around Android 13 (modern builds print the PowerManagerService object ref
  // there instead), so check it first and fall back to the legacy format.
  let screenOn: boolean | null = null;
  const screen = sections["SCREEN"] ?? "";
  if (/mWakefulness=Awake\b/.test(screen)) screenOn = true;
  else if (/mWakefulness=(Asleep|Dozing)\b/.test(screen)) screenOn = false;
  else if (/Display Power: state=ON\b/i.test(screen)) screenOn = true;
  else if (/Display Power: state=OFF\b/i.test(screen)) screenOn = false;

  // Orientation. Modern AOSP exposes `mCurrentOrientation=N` via `dumpsys
  // display`; older devices used `SurfaceOrientation: N` via `dumpsys input`.
  // We source from `dumpsys display` (see buildDeviceStateCommand) but accept
  // either format for forward/backward compatibility.
  let orientation: number | null = null;
  const orient = sections["ORIENTATION"] ?? "";
  const oMatch =
    /mCurrentOrientation=(\d+)/.exec(orient) ??
    /SurfaceOrientation:\s*(\d+)/.exec(orient);
  if (oMatch) orientation = Number(oMatch[1]);

  // Logcat tail — non-empty lines only.
  const logcat = (sections["LOGCAT"] ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  return {
    foreground_package: pkg,
    foreground_activity: activity,
    screen_on: screenOn,
    orientation,
    logcat_tail: logcat,
  };
}

export function buildDeviceStateCommand(): string {
  // Section markers MUST be single-quoted: Android's sh (mksh/toybox) treats
  // an unquoted `#` as the start of a comment, which swallows the marker and
  // every subsequent token on the line. Without the quotes `echo ##FOREGROUND`
  // emits an empty string and parseDeviceState sees no sections at all.
  return [
    "echo '##FOREGROUND'",
    // `ResumedActivity` substring catches `mResumedActivity`,
    // `topResumedActivity`, and `ResumedActivity:` across Android versions.
    // `mFocusedApp` is the modern equivalent of the legacy `mFocusedActivity`.
    "dumpsys activity activities | grep -E 'ResumedActivity|mFocusedApp|mFocusedActivity' || true",
    "echo '##SCREEN'",
    "dumpsys power | grep -E 'Display Power|mWakefulness' || true",
    "echo '##ORIENTATION'",
    "dumpsys display | grep -E 'mCurrentOrientation|SurfaceOrientation' || true",
    "echo '##LOGCAT'",
    "logcat -d -t 50",
  ].join(" ; ");
}

export function registerDeviceState(server: McpServer): void {
  server.registerTool(
    "device_state",
    {
      title: "Batched device status probe",
      description:
        "One MCP call returns foreground package + activity, screen on/off, " +
        "orientation, and the last 50 logcat lines. All four checks are " +
        "chained into a single shell invocation, sectioned by ##MARKER " +
        "lines. Prefer over running dumpsys / logcat separately when you " +
        "need 'what's happening on the device right now?'",
      inputSchema: {
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        foreground_package: z.string().nullable(),
        foreground_activity: z.string().nullable(),
        screen_on: z.boolean().nullable(),
        orientation: z.number().int().nullable(),
        logcat_tail: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { stdout } = await runAdb([
          ...deviceArgs,
          "shell",
          buildDeviceStateCommand(),
        ]);
        const state = parseDeviceState(stdout);
        const fg = state.foreground_package ?? "?";
        return {
          content: [
            {
              type: "text" as const,
              text: `${serial}: foreground=${fg} screen_on=${state.screen_on} orientation=${state.orientation} logcat=${state.logcat_tail.length} line(s)`,
            },
          ],
          structuredContent: { device_id: serial, ...state },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
