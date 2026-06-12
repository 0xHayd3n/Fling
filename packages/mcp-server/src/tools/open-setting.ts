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

export function panelToAction(panel: string): string {
  const suffix = PANEL_TO_SUFFIX[panel];
  if (!suffix) {
    throw new FlingError("INVALID_INPUT", `Unknown settings panel: ${panel}`);
  }
  return `android.settings.${suffix}`;
}

export function registerOpenSetting(server: McpServer): void {
  server.registerTool(
    "open_setting",
    {
      title: "Open an Android Settings panel by friendly name",
      description:
        "Launch a built-in Settings panel via intent. Prefer this over " +
        "tap-walking through the Settings UI for any known panel " +
        "(wifi, bluetooth, apps, display, sound, battery, storage, " +
        "location, security, developer, about, date, language, " +
        "accessibility, notifications).",
      inputSchema: {
        device_id: deviceIdInput,
        panel: z.enum(PANEL_NAMES).describe("Friendly panel name."),
      },
      outputSchema: {
        device_id: z.string(),
        action: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ device_id, panel }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const action = panelToAction(panel);
        await runAdb([...deviceArgs, "shell", "am", "start", "-a", action]);
        return {
          content: [
            { type: "text" as const, text: `Opened ${action} on ${serial}.` },
          ],
          structuredContent: { device_id: serial, action },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
