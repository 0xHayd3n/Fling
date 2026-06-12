import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { loadFlingConfig, resolveBuildCwd } from "../config.js";
import { resolveApk } from "../apkResolver.js";
import { resolveDeviceArgs } from "../devices.js";
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

export function extractInstallFailure(stdout: string, stderr: string): { code?: string; raw: string } {
  const haystack = `${stdout}\n${stderr}`.trim();
  const codeMatch = haystack.match(/INSTALL_(?:FAILED|PARSE_FAILED)_[A-Z_]+/);

  const lines = haystack.split(/\r?\n/);
  const markerIdx = lines.findIndex((l) =>
    /adb: failed|^Failure\b|INSTALL_(?:FAILED|PARSE_FAILED)_/.test(l)
  );
  const raw =
    markerIdx >= 0
      ? lines.slice(markerIdx, markerIdx + 3).join("\n").trim()
      : haystack;

  return { code: codeMatch?.[0], raw };
}

export interface PerformInstallParams {
  apkPath: string;
  deviceArgs: string[];
  reinstall: boolean;
  grantRuntimePermissions: boolean;
}

export interface InstallResult {
  success: boolean;
  failureCode?: string;
  rawFailure?: string;
  message: string;
}

/**
 * Run `adb install` and parse the result. Caller is responsible for verifying
 * the apk exists and resolving device args.
 */
export async function performInstall(params: PerformInstallParams): Promise<InstallResult> {
  const installArgs = ["install"];
  if (params.reinstall) installArgs.push("-r");
  if (params.grantRuntimePermissions) installArgs.push("-g");
  installArgs.push(params.apkPath);

  const { stdout, stderr } = await runAdb([...params.deviceArgs, ...installArgs], {
    timeoutMs: INSTALL_TIMEOUT_MS,
  });

  const combined = `${stdout}\n${stderr}`;
  if (/^Success\b/m.test(combined)) {
    return { success: true, message: `Installed ${params.apkPath}` };
  }

  const { code, raw } = extractInstallFailure(stdout, stderr);
  const hint = code ? INSTALL_FAILURE_HINTS[code] : undefined;
  const message = `Install failed: ${raw}${hint ? `\n\n→ ${hint}` : ""}`;
  return { success: false, failureCode: code, rawFailure: raw, message };
}

export function registerInstallApp(server: McpServer): void {
  server.registerTool(
    "install_app",
    {
      title: "Install an APK on a device",
      description:
        "Push an .apk file to a connected Android device and install it via `adb install`. " +
        "By default the install is a reinstall (-r) which preserves existing app data. " +
        "When `apk_path` is omitted, Fling resolves it from fling.config.json (apkPath / apkGlob).",
      inputSchema: {
        apk_path: z
          .string()
          .min(1)
          .optional()
          .describe("Path to the .apk file on the host machine. If omitted, falls back to fling.config.json."),
        device_id: deviceIdInput,
        reinstall: z
          .boolean()
          .optional()
          .describe("Pass -r (reinstall keeping data). Default true."),
        grant_runtime_permissions: z
          .boolean()
          .optional()
          .describe("Pass -g (grant all runtime permissions on install). Default false."),
        cwd: z
          .string()
          .optional()
          .describe("Starting directory for config lookup. Defaults to the MCP server's cwd."),
      },
      outputSchema: {
        device_id: z.string(),
        apk_path: z.string(),
        apk_source: z.string(),
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
    async ({ apk_path, device_id, reinstall, grant_runtime_permissions, cwd }) => {
      try {
        const loaded = await loadFlingConfig(cwd ?? process.cwd());
        const buildCwd = resolveBuildCwd(loaded);
        const apk = await resolveApk(apk_path, loaded.config, buildCwd);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);

        const result = await performInstall({
          apkPath: apk.path,
          deviceArgs,
          reinstall: reinstall !== false,
          grantRuntimePermissions: !!grant_runtime_permissions,
        });

        const text = result.success
          ? `Installed ${apk.path} on ${serial}. (apk source: ${apk.source})`
          : `Install failed on ${serial}.\n\n${result.message}`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            device_id: serial,
            apk_path: apk.path,
            apk_source: apk.source,
            success: result.success,
            failure_code: result.failureCode,
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
