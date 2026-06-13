import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, type UiNode } from "../uiDump.js";
import { findNodes, type Selector } from "../uiSelector.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

export interface PollUntilFoundOptions {
  timeoutMs: number;
  pollIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface PollUntilFoundResult {
  found: true;
  attempts: number;
  elapsed_ms: number;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  center: { x: number; y: number };
}

const defaultNow = () => Date.now();
const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function pollUntilFound(
  dumpFn: () => Promise<UiNode[]>,
  selector: Selector,
  options: PollUntilFoundOptions
): Promise<PollUntilFoundResult> {
  const now = options.now ?? defaultNow;
  const sleep = options.sleep ?? defaultSleep;
  const start = now();
  let attempts = 0;

  while (true) {
    attempts++;
    const nodes = await dumpFn();
    const matches = findNodes(nodes, selector);
    if (matches.length > 0) {
      return {
        found: true,
        attempts,
        elapsed_ms: now() - start,
        bounds: matches[0].bounds,
        center: matches[0].center,
      };
    }
    if (now() - start + options.pollIntervalMs >= options.timeoutMs) {
      throw new FlingError(
        "UI_WAIT_TIMEOUT",
        `wait_for timed out after ${options.timeoutMs}ms (${attempts} attempts) looking for ${selector.by}="${selector.value}".`
      );
    }
    await sleep(options.pollIntervalMs);
  }
}

export function registerWaitFor(server: McpServer): void {
  server.registerTool(
    "wait_for",
    {
      title: "Wait for a UI element to appear",
      description:
        "Polls dump_ui at the given interval until the selector matches, or " +
        "throws UI_WAIT_TIMEOUT after timeout_ms elapses. Use after launching " +
        "an app or triggering an async transition. Costs roughly one dump every " +
        "poll_interval_ms (default 500ms) until found.",
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
        timeout_ms: z
          .number()
          .int()
          .positive()
          .max(60_000)
          .optional()
          .default(5000)
          .describe("Maximum total wait, milliseconds (default 5000)."),
        poll_interval_ms: z
          .number()
          .int()
          .positive()
          .max(5000)
          .optional()
          .default(500)
          .describe("Wait between dumps, milliseconds (default 500)."),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        found_after_ms: z.number().int().nonnegative(),
        attempts: z.number().int().positive(),
        bounds: z.object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
        }),
        center: z.object({ x: z.number(), y: z.number() }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ by, value, exact, timeout_ms, poll_interval_ms, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const selector: Selector =
          by === "resource_id" ? { by, value } : { by, value, exact };

        const result = await pollUntilFound(
          async () => (await fetchUiDump(deviceArgs)).nodes,
          selector,
          { timeoutMs: timeout_ms, pollIntervalMs: poll_interval_ms }
        );

        const msg = `Found ${by}="${value}" after ${result.elapsed_ms}ms (${result.attempts} dumps) on ${serial}.`;
        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: {
            device_id: serial,
            found_after_ms: result.elapsed_ms,
            attempts: result.attempts,
            bounds: result.bounds,
            center: result.center,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
