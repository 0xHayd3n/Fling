import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { loadFlingConfig } from "../config.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const PACKAGE_RE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const ACTIVITY_RE = /^\.?[A-Za-z][\w$]*(\.[A-Za-z][\w$]*)*$/;

export function validatePackage(name: string): void {
  if (!PACKAGE_RE.test(name)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid Android package name: "${name}". Expected dotted identifier like com.example.app.`
    );
  }
}

export function validateActivity(activity: string): void {
  if (!ACTIVITY_RE.test(activity)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid activity name: "${activity}". Expected a class name like MainActivity, .MainActivity, or com.example.MainActivity.`
    );
  }
}

export interface PerformLaunchParams {
  packageName: string;
  activity?: string;
  deviceArgs: string[];
}

export interface LaunchResult {
  success: boolean;
  message: string;
  raw: string;
}

/**
 * Start an app on the device. With activity: `am start -W -n pkg/activity`.
 * Without: `monkey -p pkg -c LAUNCHER 1`. Note: success means the launch
 * intent was dispatched, not that the app is stable.
 */
export async function performLaunch(params: PerformLaunchParams): Promise<LaunchResult> {
  const shellCmd = params.activity
    ? ["shell", "am", "start", "-W", "-n", `${params.packageName}/${params.activity}`]
    : [
        "shell",
        "monkey",
        "-p",
        params.packageName,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
      ];

  const { stdout, stderr } = await runAdb([...params.deviceArgs, ...shellCmd]);
  const combined = `${stdout}\n${stderr}`;

  const failureRe =
    /No activities found to run|Monkey aborted|Error: (?:Activity class|Activity not started)|java\.lang\.SecurityException/;
  const successRe = params.activity ? /Status:\s*ok/i : /Events injected:\s*1/;

  if (failureRe.test(combined) || !successRe.test(combined)) {
    const reason = combined.trim().split(/\r?\n/).slice(0, 8).join("\n");
    return {
      success: false,
      message: `Launch dispatch failed for ${params.packageName}.`,
      raw: reason,
    };
  }

  return {
    success: true,
    message: params.activity
      ? `Launched ${params.packageName}/${params.activity}`
      : `Launched ${params.packageName} (default activity)`,
    raw: combined.trim(),
  };
}

export function registerLaunchApp(server: McpServer): void {
  server.registerTool(
    "launch_app",
    {
      title: "Launch an Android app",
      description:
        "Start an installed app on the device. If `activity` is omitted, the default " +
        "launcher activity is started (via `monkey`). If `activity` is given, it is " +
        "passed to `am start -n <package>/<activity>` directly. " +
        "When `package_name` is omitted, falls back to fling.config.json (packageName, mainActivity). " +
        "Note: success means the launch intent was dispatched, not that the app is " +
        "stable — an app that crashes immediately after onCreate still returns success. " +
        "When you need to wait for a specific UI element before proceeding, prefer " +
        "`launch_and_wait` which polls dump_ui internally.",
      inputSchema: {
        package_name: z
          .string()
          .min(1)
          .optional()
          .describe("App package name (e.g. com.example.app). Optional if set in fling.config.json."),
        activity: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional activity. Use a leading dot for relative (e.g. .MainActivity) or a fully-qualified class name."
          ),
        device_id: deviceIdInput,
        cwd: z
          .string()
          .optional()
          .describe("Starting directory for config lookup. Defaults to the MCP server's cwd."),
      },
      outputSchema: {
        device_id: z.string(),
        package_name: z.string(),
        activity: z.string().optional(),
        success: z.boolean(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ package_name, activity, device_id, cwd }) => {
      try {
        const loaded = await loadFlingConfig(cwd ?? process.cwd());
        const pkg = package_name ?? loaded.config.packageName;
        if (!pkg) {
          throw new FlingError(
            "CONFIG_MISSING",
            "package_name was not provided and no packageName is set in fling.config.json."
          );
        }
        const act = activity ?? loaded.config.mainActivity;

        validatePackage(pkg);
        if (act) validateActivity(act);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const result = await performLaunch({ packageName: pkg, activity: act, deviceArgs });

        const text = result.success
          ? `${result.message} on ${serial}.`
          : `${result.message} (on ${serial})\n\n${result.raw}`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            device_id: serial,
            package_name: pkg,
            activity: act,
            success: result.success,
            message: text,
          },
          isError: !result.success,
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
