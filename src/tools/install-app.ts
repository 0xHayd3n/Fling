import { stat } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const INSTALL_TIMEOUT_MS = 180_000;

const INSTALL_FAILURE_HINTS: Record<string, string> = {
  INSTALL_FAILED_INSUFFICIENT_STORAGE:
    "The device is out of free space. Uninstall unused apps or clear caches and retry.",
  INSTALL_FAILED_UPDATE_INCOMPATIBLE:
    "An app with the same package name is already installed with a different signing certificate. Uninstall it first (`uninstall_app`), then retry.",
  INSTALL_FAILED_VERSION_DOWNGRADE:
    "The installed version is newer than the APK you're trying to install. Either bump the APK's versionCode or uninstall the existing app first.",
  INSTALL_PARSE_FAILED_NO_CERTIFICATES:
    "The APK is unsigned. Sign it with apksigner (or build a signed variant) before installing.",
  INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES:
    "The APK's signing certificates are inconsistent. Rebuild and re-sign.",
  INSTALL_FAILED_MISSING_SHARED_LIBRARY:
    "The app depends on a shared library that isn't present on this device.",
  INSTALL_FAILED_OLDER_SDK:
    "The APK requires a newer Android version than the device runs.",
  INSTALL_FAILED_NEWER_SDK:
    "The APK targets an older Android version than the device supports.",
  INSTALL_FAILED_NO_MATCHING_ABIS:
    "The APK doesn't include native libraries for the device's CPU architecture.",
  INSTALL_FAILED_USER_RESTRICTED:
    "Installation was blocked by the user or a device policy.",
};

function extractInstallFailure(stdout: string, stderr: string): { code?: string; raw: string } {
  const haystack = `${stdout}\n${stderr}`;
  const match = haystack.match(/(?:Failure|INSTALL_FAILED_[A-Z_]+|INSTALL_PARSE_FAILED_[A-Z_]+)[^\n]*/);
  const raw = (match?.[0] ?? haystack.trim()).trim();
  const codeMatch = raw.match(/INSTALL_(?:FAILED|PARSE_FAILED)_[A-Z_]+/);
  return { code: codeMatch?.[0], raw };
}

export function registerInstallApp(server: McpServer): void {
  server.registerTool(
    "install_app",
    {
      title: "Install an APK on a device",
      description:
        "Push an .apk file to a connected Android device and install it via `adb install`. " +
        "By default the install is a reinstall (-r) which preserves existing app data.",
      inputSchema: {
        apk_path: z
          .string()
          .min(1)
          .describe("Path to the .apk file on the host machine. Absolute or relative to the server's cwd."),
        device_id: deviceIdInput,
        reinstall: z
          .boolean()
          .optional()
          .describe("Pass -r (reinstall keeping data). Default true."),
        grant_runtime_permissions: z
          .boolean()
          .optional()
          .describe("Pass -g (grant all runtime permissions on install). Default false."),
      },
      outputSchema: {
        device_id: z.string(),
        apk_path: z.string(),
        success: z.boolean(),
        failure_code: z.string().optional(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ apk_path, device_id, reinstall, grant_runtime_permissions }) => {
      try {
        const absoluteApk = resolvePath(apk_path);
        try {
          const s = await stat(absoluteApk);
          if (!s.isFile()) {
            throw new FlingError(
              "APK_NOT_FOUND",
              `Path is not a regular file: ${absoluteApk}`
            );
          }
        } catch (err) {
          if (err instanceof FlingError) throw err;
          throw new FlingError(
            "APK_NOT_FOUND",
            `APK not found at ${absoluteApk}. Pass an absolute path or one relative to the MCP server's cwd.`
          );
        }

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);

        const installArgs = ["install"];
        if (reinstall !== false) installArgs.push("-r");
        if (grant_runtime_permissions) installArgs.push("-g");
        installArgs.push(absoluteApk);

        const { stdout, stderr } = await runAdb([...deviceArgs, ...installArgs], {
          timeoutMs: INSTALL_TIMEOUT_MS,
        });

        const combined = `${stdout}\n${stderr}`;
        if (/^Success\b/m.test(combined)) {
          const text = `Installed ${absoluteApk} on ${serial}.`;
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: {
              device_id: serial,
              apk_path: absoluteApk,
              success: true,
              message: text,
            },
          };
        }

        const { code, raw } = extractInstallFailure(stdout, stderr);
        const hint = code ? INSTALL_FAILURE_HINTS[code] : undefined;
        const message =
          `Install failed on ${serial}: ${raw}` +
          (hint ? `\n\n→ ${hint}` : "");
        return {
          content: [{ type: "text" as const, text: message }],
          structuredContent: {
            device_id: serial,
            apk_path: absoluteApk,
            success: false,
            failure_code: code,
            message,
          },
          isError: true,
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
