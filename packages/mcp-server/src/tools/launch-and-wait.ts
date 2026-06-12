import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { fetchUiDump } from "../uiDump.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import type { UiNode } from "../uiDump.js";

export type ReadySelector = { by: "text" | "resource_id"; value: string };

export interface LaunchAndWaitInput {
  packageName: string;
  readyWhen: ReadySelector;
  timeoutMs?: number;
  pollIntervalMs?: number;
  launchFn: (pkg: string) => Promise<void>;
  dumpFn: () => Promise<UiNode[]>;
  sleepFn: (ms: number) => Promise<void>;
  nowFn: () => number;
}

export interface LaunchAndWaitResult {
  ready: boolean;
  attempts: number;
}

function matchesSelector(nodes: UiNode[], sel: ReadySelector): boolean {
  if (sel.by === "text") return nodes.some((n) => n.text.includes(sel.value));
  return nodes.some((n) => n.resource_id === sel.value);
}

/**
 * Launch a package via monkey, then poll the UI hierarchy until the
 * readyWhen selector appears (or timeout). Saves the launch → wait →
 * screenshot → check round-trip loop.
 */
export async function launchAndWait(
  input: LaunchAndWaitInput
): Promise<LaunchAndWaitResult> {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const pollIntervalMs = input.pollIntervalMs ?? 250;

  await input.launchFn(input.packageName);
  const start = input.nowFn();
  let attempts = 0;
  while (input.nowFn() - start < timeoutMs) {
    attempts++;
    const dump = await input.dumpFn();
    if (matchesSelector(dump, input.readyWhen)) {
      return { ready: true, attempts };
    }
    await input.sleepFn(pollIntervalMs);
  }
  throw new FlingError(
    "UI_WAIT_TIMEOUT",
    `Ready selector ${input.readyWhen.by}="${input.readyWhen.value}" did not appear within ${timeoutMs}ms after launching ${input.packageName}.`
  );
}

export function registerLaunchAndWait(server: McpServer): void {
  server.registerTool(
    "launch_and_wait",
    {
      title: "Launch an app and wait until it's ready",
      description:
        "Launch the package via monkey then poll dump_ui until a ready " +
        "selector (text or resource_id) appears. Prefer over " +
        "launch_app + repeated dump_ui calls when you need to wait for the " +
        "UI to become interactive.",
      inputSchema: {
        device_id: deviceIdInput,
        package_name: z.string().min(1),
        ready_when_text: z.string().optional(),
        ready_when_resource_id: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
      },
      outputSchema: {
        device_id: z.string(),
        ready: z.boolean(),
        attempts: z.number().int().nonnegative(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      device_id,
      package_name,
      ready_when_text,
      ready_when_resource_id,
      timeout_ms,
    }) => {
      try {
        if (!ready_when_text && !ready_when_resource_id) {
          throw new FlingError(
            "INVALID_INPUT",
            "Provide either ready_when_text or ready_when_resource_id."
          );
        }
        const readyWhen: ReadySelector = ready_when_text
          ? { by: "text", value: ready_when_text }
          : { by: "resource_id", value: ready_when_resource_id! };
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const result = await launchAndWait({
          packageName: package_name,
          readyWhen,
          timeoutMs: timeout_ms,
          launchFn: async (pkg) => {
            await runAdb([
              ...deviceArgs,
              "shell",
              "monkey",
              "-p",
              pkg,
              "-c",
              "android.intent.category.LAUNCHER",
              "1",
            ]);
          },
          dumpFn: async () => (await fetchUiDump(deviceArgs)).nodes,
          sleepFn: (ms) => new Promise((r) => setTimeout(r, ms)),
          nowFn: () => Date.now(),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Launched ${package_name} on ${serial}; ready after ${result.attempts} dump(s).`,
            },
          ],
          structuredContent: { device_id: serial, ...result },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
