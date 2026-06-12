import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { loadFlingConfig } from "../config.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import { validatePackage } from "./launch-app.js";

export function registerUninstallApp(server: McpServer): void {
  server.registerTool(
    "uninstall_app",
    {
      title: "Uninstall an Android app",
      description:
        "Remove an installed app via `adb uninstall`. Pass `keep_data: true` to keep the " +
        "app's data and cache directories (adb's -k flag). When `package_name` is omitted, " +
        "falls back to fling.config.json packageName.",
      inputSchema: {
        package_name: z
          .string()
          .min(1)
          .optional()
          .describe("App package name. Optional if set in fling.config.json."),
        keep_data: z
          .boolean()
          .optional()
          .describe("Pass -k (keep data and cache directories). Default false."),
        device_id: deviceIdInput,
        cwd: z
          .string()
          .optional()
          .describe("Starting directory for config lookup. Defaults to the MCP server's cwd."),
      },
      outputSchema: {
        device_id: z.string(),
        package_name: z.string(),
        success: z.boolean(),
        already_absent: z.boolean(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ package_name, keep_data, device_id, cwd }) => {
      try {
        const loaded = await loadFlingConfig(cwd ?? process.cwd());
        const pkg = package_name ?? loaded.config.packageName;
        if (!pkg) {
          throw new FlingError(
            "CONFIG_MISSING",
            "uninstall_app needs a package_name (argument or config.packageName)."
          );
        }
        validatePackage(pkg);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const uninstallArgs = ["uninstall"];
        if (keep_data) uninstallArgs.push("-k");
        uninstallArgs.push(pkg);

        const { stdout, stderr } = await runAdb([...deviceArgs, ...uninstallArgs]);
        const combined = `${stdout}\n${stderr}`;

        if (/^Success\b/m.test(combined)) {
          const text = `Uninstalled ${pkg} from ${serial}.`;
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: {
              device_id: serial,
              package_name: pkg,
              success: true,
              already_absent: false,
              message: text,
            },
          };
        }

        // Modern adb (Android 9+) returns "Failure [DELETE_FAILED_INTERNAL_ERROR]"
        // when the package isn't installed. Older clients used "Unknown package".
        // The verbose API 30+ exception form catches future variants.
        const alreadyAbsent =
          /DELETE_FAILED_INTERNAL_ERROR|Unknown package|Exception occurred while executing 'uninstall'/i.test(
            combined
          );
        const text = alreadyAbsent
          ? `${pkg} was not installed on ${serial} — nothing to uninstall.`
          : `Uninstall failed on ${serial}: ${combined.trim()}`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            device_id: serial,
            package_name: pkg,
            success: false,
            already_absent: alreadyAbsent,
            message: text,
          },
          isError: !alreadyAbsent,
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
