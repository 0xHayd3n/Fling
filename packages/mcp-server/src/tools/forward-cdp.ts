import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadFlingConfig } from "../config.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import { exposeCdp } from "../cdp.js";
import { globalCdpForwards } from "../cdpForwards.js";
import { validatePackage } from "./launch-app.js";

const PREFER_VALUES = ["webview", "chrome", "any"] as const;

export interface ValidateForwardCdpInputs {
  prefer: (typeof PREFER_VALUES)[number];
  packageName?: string;
  packageNameFromConfig?: string;
  localPort?: number;
}

export interface ValidatedForwardCdpInputs {
  prefer: (typeof PREFER_VALUES)[number];
  packageName?: string;
  localPort?: number;
}

export function validateForwardCdpInputs(
  input: ValidateForwardCdpInputs
): ValidatedForwardCdpInputs {
  if (input.localPort !== undefined) {
    if (
      !Number.isInteger(input.localPort) ||
      input.localPort < 1024 ||
      input.localPort > 65535
    ) {
      throw new FlingError(
        "INVALID_INPUT",
        `local_port must be an integer in [1024, 65535]; got ${input.localPort}.`
      );
    }
  }

  let packageName = input.packageName ?? input.packageNameFromConfig;
  if (input.prefer !== "chrome") {
    if (!packageName) {
      throw new FlingError(
        "CONFIG_MISSING",
        "package_name is required when prefer is 'webview' or 'any'. Pass it explicitly or set packageName in fling.config.json."
      );
    }
    validatePackage(packageName);
  } else {
    // chrome mode ignores package
    packageName = undefined;
  }

  return { prefer: input.prefer, packageName, localPort: input.localPort };
}

export function registerForwardCdp(server: McpServer): void {
  server.registerTool(
    "forward_cdp",
    {
      title: "Expose an app's WebView (or Chrome) over CDP for Crabby etc.",
      description:
        "Set up an adb forward from a local port to a debuggable Chromium target on the device, " +
        "returning a connect URL suitable for Crabby's `connect` tool or any CDP-aware client. " +
        "For hybrid Android apps (Capacitor, Ionic, Cordova, RN-WebView), Fling matches the " +
        "WebView socket by the app's PIDs (requires WebView.setWebContentsDebuggingEnabled). " +
        "Pass prefer='chrome' to target Chrome browser instead (process-agnostic). " +
        "The forwarded port persists until server shutdown or until a subsequent call replaces it.",
      inputSchema: {
        package_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "App package whose WebView to expose. Required for prefer=webview/any; ignored for prefer=chrome. Falls back to fling.config.json packageName."
          ),
        prefer: z
          .enum(PREFER_VALUES)
          .optional()
          .describe("Which kind of CDP target to expose. Default 'webview'."),
        local_port: z
          .number()
          .int()
          .optional()
          .describe("Local port to forward. Default: an OS-allocated ephemeral port."),
        device_id: deviceIdInput,
        cwd: z
          .string()
          .optional()
          .describe("Starting directory for config lookup. Defaults to the MCP server's cwd."),
      },
      outputSchema: {
        cdp_url: z.string(),
        ws_url: z.string().optional(),
        target: z.object({
          type: z.enum(["webview", "chrome"]),
          title: z.string().optional(),
          url: z.string().optional(),
          pid: z.number().int().optional(),
        }),
        local_port: z.number().int(),
        socket_name: z.string(),
        device_id: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ package_name, prefer, local_port, device_id, cwd }) => {
      try {
        const loaded = await loadFlingConfig(cwd ?? process.cwd());
        const validated = validateForwardCdpInputs({
          prefer: prefer ?? "webview",
          packageName: package_name,
          packageNameFromConfig: loaded.config.packageName,
          localPort: local_port,
        });

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);

        const result = await exposeCdp(
          {
            deviceArgs,
            deviceId: serial,
            packageName: validated.packageName,
            prefer: validated.prefer,
            localPort: validated.localPort,
          },
          globalCdpForwards
        );

        const text =
          `Exposed ${result.target.type} target on ${serial} at ${result.cdp_url}\n` +
          `  socket: ${result.socket_name}\n` +
          (result.ws_url ? `  ws:     ${result.ws_url}\n` : "") +
          (result.target.title ? `  title:  ${result.target.title}\n` : "");

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { ...result },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
