import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const PANEL_TO_SUFFIX: Record<string, string> = {
  wifi: "WIFI_SETTINGS",
  bluetooth: "BLUETOOTH_SETTINGS",
  apps: "APPLICATION_SETTINGS",
  display: "DISPLAY_SETTINGS",
  sound: "SOUND_SETTINGS",
  battery: "BATTERY_SAVER_SETTINGS",
  storage: "INTERNAL_STORAGE_SETTINGS",
  location: "LOCATION_SOURCE_SETTINGS",
  security: "SECURITY_SETTINGS",
  developer: "APPLICATION_DEVELOPMENT_SETTINGS",
  about: "DEVICE_INFO_SETTINGS",
  date: "DATE_SETTINGS",
  language: "LOCALE_SETTINGS",
  accessibility: "ACCESSIBILITY_SETTINGS",
  notifications: "NOTIFICATION_SETTINGS",
};

const PANEL_NAMES = Object.keys(PANEL_TO_SUFFIX) as [string, ...string[]];

const ACTION_PREFIX = "android.settings.";
const SUFFIX_RE = /^[A-Z][A-Z0-9_]*$/;
const DATA_URI_RE = /^package:[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/;

// Standard android.provider.Settings.ACTION_* values that point at a built-in
// Settings screen reachable via `am start -a android.settings.<X>`. Restricted
// to a known set to avoid arbitrary intent dispatch through this tool.
export const SETTINGS_ACTION_ALLOWLIST: ReadonlySet<string> = new Set([
  "ACCESSIBILITY_SETTINGS",
  "AIRPLANE_MODE_SETTINGS",
  "APN_SETTINGS",
  "APPLICATION_DETAILS_SETTINGS",
  "APPLICATION_DEVELOPMENT_SETTINGS",
  "APPLICATION_SETTINGS",
  "APP_NOTIFICATION_SETTINGS",
  "BATTERY_SAVER_SETTINGS",
  "BLUETOOTH_SETTINGS",
  "CAPTIONING_SETTINGS",
  "CAST_SETTINGS",
  "DATA_ROAMING_SETTINGS",
  "DATE_SETTINGS",
  "DEVICE_INFO_SETTINGS",
  "DISPLAY_SETTINGS",
  "DREAM_SETTINGS",
  "HARD_KEYBOARD_SETTINGS",
  "HOME_SETTINGS",
  "IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
  "INPUT_METHOD_SETTINGS",
  "INPUT_METHOD_SUBTYPE_SETTINGS",
  "INTERNAL_STORAGE_SETTINGS",
  "LOCALE_SETTINGS",
  "LOCATION_SOURCE_SETTINGS",
  "MANAGE_ALL_APPLICATIONS_SETTINGS",
  "MANAGE_APPLICATIONS_SETTINGS",
  "MEMORY_CARD_SETTINGS",
  "NETWORK_OPERATOR_SETTINGS",
  "NFC_PAYMENT_SETTINGS",
  "NFC_SETTINGS",
  "NFCSHARING_SETTINGS",
  "NOTIFICATION_SETTINGS",
  "PRIVACY_SETTINGS",
  "QUICK_LAUNCH_SETTINGS",
  "SEARCH_SETTINGS",
  "SECURITY_SETTINGS",
  "SETTINGS",
  "SOUND_SETTINGS",
  "SYNC_SETTINGS",
  "TETHER_SETTINGS",
  "USAGE_ACCESS_SETTINGS",
  "USER_DICTIONARY_SETTINGS",
  "VOICE_INPUT_SETTINGS",
  "VPN_SETTINGS",
  "WIFI_IP_SETTINGS",
  "WIFI_SETTINGS",
  "WIRELESS_SETTINGS",
]);

export function panelToAction(panel: string): string {
  const suffix = PANEL_TO_SUFFIX[panel];
  if (!suffix) {
    throw new FlingError("INVALID_INPUT", `Unknown settings panel: ${panel}`);
  }
  return `android.settings.${suffix}`;
}

/**
 * Accepts either the bare suffix (e.g. "WIFI_SETTINGS") or the fully qualified
 * action (e.g. "android.settings.WIFI_SETTINGS") and returns the fully
 * qualified form. Throws FlingError("INVALID_INPUT") on anything else — most
 * importantly, on actions outside the allowlist, which is the guard against
 * using this tool to fire arbitrary intents.
 */
export function normalizeSettingsAction(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new FlingError("INVALID_INPUT", "Settings action is required.");
  }
  const suffix = trimmed.startsWith(ACTION_PREFIX)
    ? trimmed.slice(ACTION_PREFIX.length)
    : trimmed;

  if (!SUFFIX_RE.test(suffix)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid settings action: "${input}". Expected an uppercase suffix like WIFI_SETTINGS, optionally prefixed with android.settings..`
    );
  }
  if (!SETTINGS_ACTION_ALLOWLIST.has(suffix)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Settings action "${suffix}" is not in the allowlist. Known actions: ${[...SETTINGS_ACTION_ALLOWLIST].sort().join(", ")}.`
    );
  }
  return ACTION_PREFIX + suffix;
}

/**
 * Strictly validates the `-d` payload. The only documented use for a data URI
 * on a built-in settings intent is APPLICATION_DETAILS_SETTINGS, which expects
 * `package:<dotted-android-id>`. Anything else is rejected to prevent arbitrary
 * URI dispatch via this tool.
 */
export function validateSettingsDataUri(uri: string): void {
  if (!DATA_URI_RE.test(uri)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid data_uri: "${uri}". Only package:<dotted-android-id> is accepted (e.g. package:com.example.app).`
    );
  }
}

export interface BuildSettingsAmArgsParams {
  action: string;
  dataUri?: string;
  deviceArgs: string[];
}

export function buildSettingsAmArgs(params: BuildSettingsAmArgsParams): string[] {
  // -W makes `am start` wait for the activity to come up and print Status: ok;
  // without it the success line is suppressed and we can't tell whether the
  // dispatch actually resolved an activity.
  const argv = [
    ...params.deviceArgs,
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    params.action,
  ];
  if (params.dataUri) {
    argv.push("-d", params.dataUri);
  }
  return argv;
}

export interface SettingsLaunchResult {
  success: boolean;
  message: string;
  raw: string;
}

/**
 * Interpret `am start` output. The activity manager merges device-side stderr
 * into adb stdout in some Android builds, so we concatenate both and look for
 * known failure markers OR the absence of `Status: ok` (which `am start -W`
 * always emits on success).
 */
export function interpretSettingsResult(
  stdout: string,
  stderr: string
): SettingsLaunchResult {
  const combined = `${stdout}\n${stderr}`;
  const failureRe =
    /Error: (?:Activity (?:class|not started)|Intent does not match|.+ not found)|java\.lang\.SecurityException|No Activity found to handle/;
  const successRe = /Status:\s*ok/i;

  if (failureRe.test(combined) || !successRe.test(combined)) {
    const reason = combined.trim().split(/\r?\n/).slice(0, 8).join("\n");
    return {
      success: false,
      message: "Settings launch dispatch failed.",
      raw: reason,
    };
  }
  return {
    success: true,
    message: "Settings launch dispatched.",
    raw: combined.trim(),
  };
}

export interface PerformOpenSettingParams {
  action: string;
  dataUri?: string;
  deviceArgs: string[];
}

export async function performOpenSetting(
  params: PerformOpenSettingParams
): Promise<SettingsLaunchResult> {
  const { stdout, stderr } = await runAdb(buildSettingsAmArgs(params));
  return interpretSettingsResult(stdout, stderr);
}

export interface ResolveOpenSettingActionInput {
  panel?: string;
  action?: string;
}

/**
 * Resolve the user's panel-or-action input into the fully qualified
 * android.settings.* action string. Enforces XOR — exactly one of
 * {panel, action} must be set. Delegates value validation to panelToAction
 * (unknown panel) and normalizeSettingsAction (unknown / malformed /
 * non-allowlisted action), each of which throws INVALID_INPUT on rejection.
 */
export function resolveOpenSettingAction(
  input: ResolveOpenSettingActionInput
): string {
  if (!input.panel && !input.action) {
    throw new FlingError(
      "INVALID_INPUT",
      "Provide either `panel` or `action`."
    );
  }
  if (input.panel && input.action) {
    throw new FlingError(
      "INVALID_INPUT",
      "Provide either `panel` or `action`, not both."
    );
  }
  return input.panel
    ? panelToAction(input.panel)
    : normalizeSettingsAction(input.action!);
}

export function registerOpenSetting(server: McpServer): void {
  server.registerTool(
    "open_setting",
    {
      title: "Open an Android Settings screen by intent",
      description:
        "Open a built-in Android Settings screen via `am start -a android.settings.<ACTION>`. " +
        "Pass either `panel` (friendly name: wifi, bluetooth, apps, display, sound, " +
        "battery, storage, location, security, developer, about, date, language, " +
        "accessibility, notifications) OR `action` (an allowlisted Settings action like " +
        "WIFI_SETTINGS or the fully qualified android.settings.WIFI_SETTINGS). " +
        "`data_uri` is for actions that need a target, currently restricted to " +
        "package:<dotted-android-id> (the canonical form for APPLICATION_DETAILS_SETTINGS). " +
        "Much faster than tap-walking the Settings UI — one adb call vs ~10 round-trips.",
      inputSchema: {
        device_id: deviceIdInput,
        panel: z
          .enum(PANEL_NAMES)
          .optional()
          .describe("Friendly panel name. Mutually exclusive with `action`."),
        action: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Allowlisted Settings action. Bare suffix (WIFI_SETTINGS) or fully qualified (android.settings.WIFI_SETTINGS). Mutually exclusive with `panel`."
          ),
        data_uri: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional `-d` payload. Must be of the form package:<dotted-id>, e.g. package:com.example.app for APPLICATION_DETAILS_SETTINGS."
          ),
      },
      outputSchema: {
        device_id: z.string(),
        action: z.string(),
        data_uri: z.string().optional(),
        success: z.boolean(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ device_id, panel, action, data_uri }) => {
      try {
        const fullAction = resolveOpenSettingAction({ panel, action });
        if (data_uri !== undefined) validateSettingsDataUri(data_uri);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const result = await performOpenSetting({
          action: fullAction,
          dataUri: data_uri,
          deviceArgs,
        });

        const text = result.success
          ? `${result.message} (${fullAction}) on ${serial}.`
          : `${result.message} (${fullAction} on ${serial})\n\n${result.raw}`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            device_id: serial,
            action: fullAction,
            data_uri,
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
