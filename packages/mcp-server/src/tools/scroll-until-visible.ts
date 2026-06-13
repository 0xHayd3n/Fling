import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, type UiNode } from "../uiDump.js";
import { findNodes, type Selector } from "../uiSelector.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const SWIPE_DURATION_MS = 500;

export function buildSwipeArgs(
  deviceArgs: string[],
  direction: "up" | "down",
  screenWidth: number,
  screenHeight: number
): string[] {
  const x = Math.round(screenWidth / 2);
  const high = Math.round(screenHeight * 0.8);
  const low = Math.round(screenHeight * 0.2);
  const [y1, y2] = direction === "down" ? [high, low] : [low, high];
  return [
    ...deviceArgs,
    "shell",
    "input",
    "swipe",
    String(x),
    String(y1),
    String(x),
    String(y2),
    String(SWIPE_DURATION_MS),
  ];
}

export interface ScrollAndSearchOptions {
  maxScrolls: number;
}

export interface ScrollAndSearchResult {
  found: boolean;
  scrolls_performed: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
  center?: { x: number; y: number };
}

export async function scrollAndSearch(
  dumpFn: () => Promise<UiNode[]>,
  swipeFn: () => Promise<void>,
  selector: Selector,
  options: ScrollAndSearchOptions
): Promise<ScrollAndSearchResult> {
  let scrolls = 0;
  for (let i = 0; i <= options.maxScrolls; i++) {
    const nodes = await dumpFn();
    const matches = findNodes(nodes, selector);
    if (matches.length > 0) {
      return {
        found: true,
        scrolls_performed: scrolls,
        bounds: matches[0].bounds,
        center: matches[0].center,
      };
    }
    if (scrolls >= options.maxScrolls) break;
    await swipeFn();
    scrolls++;
  }
  return { found: false, scrolls_performed: scrolls };
}

async function getScreenSize(
  deviceArgs: string[]
): Promise<{ width: number; height: number }> {
  // `wm size` returns "Physical size: WxH" and possibly "Override size: WxH".
  // Override wins when present (matches what uiautomator sees).
  const { stdout } = await runAdb([...deviceArgs, "shell", "wm", "size"]);
  const lines = stdout.split(/\r?\n/);
  const override = lines.find((l) => /^Override size:/i.test(l));
  const physical = lines.find((l) => /^Physical size:/i.test(l));
  const line = override ?? physical;
  if (!line) {
    // Fallback: assume the resolution this device showed in dump_ui — 1220x2712.
    return { width: 1220, height: 2712 };
  }
  const m = /(\d+)x(\d+)/.exec(line);
  if (!m) return { width: 1220, height: 2712 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

export function registerScrollUntilVisible(server: McpServer): void {
  server.registerTool(
    "scroll_until_visible",
    {
      title: "Scroll the screen until a UI element becomes visible",
      description:
        "Dump UI; if the selector matches, return immediately. Otherwise swipe " +
        "in the given direction (default \"down\") and redump, up to max_scrolls " +
        "times. Returns {found: false} when exhausted — NOT an error. The AI " +
        "decides whether to keep trying or change strategy.",
      inputSchema: {
        by: z
          .enum(["text", "resource_id", "content_desc"])
          .describe("Which attribute to match on."),
        value: z.string().min(1).describe("Value to look up."),
        exact: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Exact match (ignored for resource_id which is always exact)."
          ),
        direction: z
          .enum(["up", "down"])
          .optional()
          .default("down")
          .describe("Which way to swipe between dumps."),
        max_scrolls: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .default(10)
          .describe("Stop after this many swipes (default 10)."),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        found: z.boolean(),
        scrolls_performed: z.number().int().nonnegative(),
        bounds: z
          .object({
            x1: z.number(),
            y1: z.number(),
            x2: z.number(),
            y2: z.number(),
          })
          .optional(),
        center: z
          .object({ x: z.number(), y: z.number() })
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ by, value, exact, direction, max_scrolls, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const selector: Selector =
          by === "resource_id" ? { by, value } : { by, value, exact };
        const { width, height } = await getScreenSize(deviceArgs);

        const result = await scrollAndSearch(
          async () => (await fetchUiDump(deviceArgs)).nodes,
          async () => {
            await runAdb(buildSwipeArgs(deviceArgs, direction, width, height));
          },
          selector,
          { maxScrolls: max_scrolls }
        );

        const msg = result.found
          ? `Found ${by}="${value}" after ${result.scrolls_performed} scroll${result.scrolls_performed === 1 ? "" : "s"} on ${serial}.`
          : `Did not find ${by}="${value}" after ${result.scrolls_performed} scrolls on ${serial}.`;

        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: { device_id: serial, ...result },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
