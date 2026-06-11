import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const PACKAGE_RE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const ACTIVITY_RE = /^\.?[A-Za-z][\w$]*(\.[A-Za-z][\w$]*)*$/;

function validatePackage(name: string): void {
  if (!PACKAGE_RE.test(name)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid Android package name: "${name}". Expected dotted identifier like com.example.app.`
    );
  }
}

function validateActivity(activity: string): void {
  if (!ACTIVITY_RE.test(activity)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid activity name: "${activity}". Expected a class name like MainActivity, .MainActivity, or com.example.MainActivity.`
    );
  }
}

export function registerLaunchApp(server: McpServer): void {
  server.registerTool(
    "launch_app",
    {
      title: "Launch an Android app",
      description:
        "Start an installed app on the device. If `activity` is omitted, the default " +
        "launcher activity is started (via `monkey`). If `activity` is given, it is " +
        "passed to `am start -n <package>/<activity>` directly.",
      inputSchema: {
        package_name: z
          .string()
          .min(1)
          .describe("App package name (e.g. com.example.app)."),
        activity: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional activity. Use a leading dot for relative (e.g. .MainActivity) " +
              "or a fully-qualified class name."
          ),
        device_id: deviceIdInput,
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
    async ({ package_name, activity, device_id }) => {
      try {
        validatePackage(package_name);
        if (activity) validateActivity(activity);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);

        const shellCmd = activity
          ? ["shell", "am", "start", "-W", "-n", `${package_name}/${activity}`]
          : [
              "shell",
              "monkey",
              "-p",
              package_name,
              "-c",
              "android.intent.category.LAUNCHER",
              "1",
            ];

        const { stdout, stderr } = await runAdb([...deviceArgs, ...shellCmd]);
        const combined = `${stdout}\n${stderr}`;

        const launchedFailureRe =
          /No activities found to run|Monkey aborted|Error: (?:Activity class|Activity not started)|java\.lang\.SecurityException/;
        const launchedSuccessRe = activity
          ? /Status:\s*ok/i
          : /Events injected:\s*1/;

        if (launchedFailureRe.test(combined) || !launchedSuccessRe.test(combined)) {
          const reason = combined.trim().split(/\r?\n/).slice(0, 8).join("\n");
          const message = `Launch failed for ${package_name} on ${serial}.\n\n${reason}`;
          return {
            content: [{ type: "text" as const, text: message }],
            structuredContent: {
              device_id: serial,
              package_name,
              activity,
              success: false,
              message,
            },
            isError: true,
          };
        }

        const text = activity
          ? `Launched ${package_name}/${activity} on ${serial}.`
          : `Launched ${package_name} (default activity) on ${serial}.`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            device_id: serial,
            package_name,
            activity,
            success: true,
            message: text,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
