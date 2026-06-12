import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, type UiNode } from "../uiDump.js";
import { DENY_LABELS } from "../uiSelector.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import { buildTapArgs } from "./tap-by-text.js";

export interface DenyButton {
  label: string;
  tap_x: number;
  tap_y: number;
  bounds: { x1: number; y1: number; x2: number; y2: number };
}

const LOWER_DENY_LABELS = new Set(DENY_LABELS.map((l) => l.toLowerCase()));

export function selectDenyButton(nodes: UiNode[]): DenyButton | null {
  for (const n of nodes) {
    if (!n.clickable || !n.enabled) continue;
    const lowered = n.text.toLowerCase();
    if (LOWER_DENY_LABELS.has(lowered)) {
      return {
        label: n.text,
        tap_x: n.center.x,
        tap_y: n.center.y,
        bounds: n.bounds,
      };
    }
  }
  return null;
}

export function registerDismissDialog(server: McpServer): void {
  server.registerTool(
    "dismiss_dialog",
    {
      title: "Dismiss a dialog by tapping its deny / cancel / skip button",
      description:
        "Dump UI, find the first clickable button whose text matches one of the " +
        "known dismissal labels (Don't allow, Cancel, Skip, Dismiss, No thanks, " +
        "Maybe later, Deny, Close, No, Not now, and their variants), and tap it. " +
        "Case-insensitive. Single-purpose — dismisses one dialog per call. " +
        "If multiple stacked dialogs are open, call again. " +
        "Designed cheap enough that the inner navigation loop can run on a " +
        "smaller/cheaper model (Haiku, Sonnet).",
      inputSchema: {
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        dismissed: z.boolean(),
        dismissed_with: z.string().optional(),
        button_bounds: z
          .object({
            x1: z.number(),
            y1: z.number(),
            x2: z.number(),
            y2: z.number(),
          })
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { nodes } = await fetchUiDump(deviceArgs);
        const button = selectDenyButton(nodes);

        if (!button) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No dialog to dismiss on ${serial}.`,
              },
            ],
            structuredContent: { device_id: serial, dismissed: false },
          };
        }

        await runAdb(buildTapArgs(deviceArgs, button.tap_x, button.tap_y));

        const msg = `Dismissed dialog by tapping "${button.label}" on ${serial}.`;
        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: {
            device_id: serial,
            dismissed: true,
            dismissed_with: button.label,
            button_bounds: button.bounds,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
