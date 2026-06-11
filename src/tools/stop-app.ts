import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { loadFlingConfig } from "../config.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import { validatePackage } from "./launch-app.js";

export function registerStopApp(server: McpServer): void {
  server.registerTool(
    "stop_app",
    {
      title: "Force-stop an Android app",
      description:
        "Issue `adb shell am force-stop <package>` to terminate every process of the named app. " +
        "Force-stopping an already-stopped app is a no-op (idempotent). " +
        "When `package_name` is omitted, falls back to fling.config.json packageName.",
      inputSchema: {
        package_name: z
          .string()
          .min(1)
          .optional()
          .describe("App package name. Optional if set in fling.config.json."),
        device_id: deviceIdInput,
        cwd: z
          .string()
          .optional()
          .describe("Starting directory for config lookup. Defaults to the MCP server's cwd."),
      },
      outputSchema: {
        device_id: z.string(),
        package_name: z.string(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ package_name, device_id, cwd }) => {
      try {
        const loaded = await loadFlingConfig(cwd ?? process.cwd());
        const pkg = package_name ?? loaded.config.packageName;
        if (!pkg) {
          throw new FlingError(
            "CONFIG_MISSING",
            "stop_app needs a package_name (argument or config.packageName)."
          );
        }
        validatePackage(pkg);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        await runAdb([...deviceArgs, "shell", "am", "force-stop", pkg]);

        const text = `Force-stopped ${pkg} on ${serial}.`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { device_id: serial, package_name: pkg, message: text },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
