import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadFlingConfig, resolveBuildCwd } from "../config.js";
import { resolveApk } from "../apkResolver.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { resolveBuildCommand, runBuild } from "../gradle.js";
import { toolErrorFrom } from "../toolResult.js";
import { performInstall } from "./install-app.js";
import { performLaunch, validateActivity, validatePackage } from "./launch-app.js";
import { exposeCdp, type ExposeCdpResult } from "../cdp.js";
import { globalCdpForwards } from "../cdpForwards.js";

interface StepResult {
  name: string;
  success: boolean;
  duration_ms: number;
  message: string;
}

export type CdpOutcome =
  | { ok: true; value: ExposeCdpResult }
  | { ok: false; error: unknown };

export function buildCdpFieldFromOutcome(outcome: CdpOutcome) {
  if (outcome.ok) {
    return { success: true as const, ...outcome.value };
  }
  const err = outcome.error;
  if (err instanceof FlingError) {
    return { success: false as const, error_code: err.code, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { success: false as const, error_code: "UNKNOWN", message };
}

async function timedStep<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ step: StepResult; value?: T; error?: unknown }> {
  const start = Date.now();
  try {
    const value = await fn();
    return {
      step: { name, success: true, duration_ms: Date.now() - start, message: "ok" },
      value,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      step: { name, success: false, duration_ms: Date.now() - start, message },
      error: err,
    };
  }
}

export function registerDeployAndRun(server: McpServer): void {
  server.registerTool(
    "deploy_and_run",
    {
      title: "Build, install, and launch an Android app",
      description:
        "Convenience tool: build (gradle), find the APK, install on the connected device, " +
        "and start the app. Honors fling.config.json defaults. Stops at the first failed " +
        "step and reports which step broke. Use `skip_build: true` to reuse an existing APK.",
      inputSchema: {
        cwd: z.string().optional().describe("Starting directory for config lookup. Defaults to the MCP server's cwd."),
        skip_build: z
          .boolean()
          .optional()
          .describe("Skip the build step and use an existing APK. Default false."),
        apk_path: z
          .string()
          .optional()
          .describe("Override the APK to install. Falls back to config.apkPath / apkGlob."),
        package_name: z
          .string()
          .optional()
          .describe("Override the package to launch. Falls back to config.packageName."),
        activity: z
          .string()
          .optional()
          .describe("Override the activity to launch. Falls back to config.mainActivity."),
        device_id: z
          .string()
          .optional()
          .describe("Target device serial (required when multiple ready devices are connected)."),
        reinstall: z.boolean().optional(),
        grant_runtime_permissions: z.boolean().optional(),
        expose_cdp: z
          .boolean()
          .optional()
          .describe(
            "After a successful launch, also expose the app's WebView over CDP and return a Crabby-compatible connect URL. Default false."
          ),
      },
      outputSchema: {
        success: z.boolean(),
        device_id: z.string().optional(),
        apk_path: z.string().optional(),
        package_name: z.string().optional(),
        steps: z.array(
          z.object({
            name: z.string(),
            success: z.boolean(),
            duration_ms: z.number().int().nonnegative(),
            message: z.string(),
          })
        ),
        cdp: z
          .union([
            z.object({
              success: z.literal(true),
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
            }),
            z.object({
              success: z.literal(false),
              error_code: z.string(),
              message: z.string(),
            }),
          ])
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const steps: StepResult[] = [];
      let serial: string | undefined;
      let apkPath: string | undefined;
      let pkg: string | undefined;

      try {
        const loaded = await loadFlingConfig(input.cwd ?? process.cwd());
        const buildCwd = resolveBuildCwd(loaded);

        pkg = input.package_name ?? loaded.config.packageName;
        if (!pkg) {
          throw new FlingError(
            "CONFIG_MISSING",
            "deploy_and_run needs a package_name (argument or config.packageName)."
          );
        }
        validatePackage(pkg);

        const activity = input.activity ?? loaded.config.mainActivity;
        if (activity) validateActivity(activity);

        if (!input.skip_build) {
          const build = await timedStep("build", async () => {
            const command = await resolveBuildCommand(buildCwd, loaded.config);
            const printable = [command.command, ...command.args].join(" ");
            const outcome = await runBuild(buildCwd, command);
            return { printable, outcome };
          });
          if (build.value) {
            build.step.message = `Built via ${build.value.printable} in ${(build.value.outcome.durationMs / 1000).toFixed(1)}s`;
          }
          steps.push(build.step);
          if (!build.step.success) throw build.error ?? new Error("build step failed");
        }

        const apkResolution = await timedStep("resolve_apk", async () => {
          return await resolveApk(input.apk_path, loaded.config, buildCwd);
        });
        if (apkResolution.value) {
          apkResolution.step.message = `Using APK ${apkResolution.value.path} (${apkResolution.value.source})`;
          apkPath = apkResolution.value.path;
        }
        steps.push(apkResolution.step);
        if (!apkResolution.step.success) throw apkResolution.error ?? new Error("apk resolution failed");

        const deviceStep = await timedStep("resolve_device", async () => {
          return await resolveDeviceArgs(input.device_id);
        });
        if (deviceStep.value) {
          serial = deviceStep.value.serial;
          deviceStep.step.message = `Targeting ${serial}`;
        }
        steps.push(deviceStep.step);
        if (!deviceStep.step.success) throw deviceStep.error ?? new Error("device resolution failed");

        const installStep = await timedStep("install", async () => {
          return await performInstall({
            apkPath: apkResolution.value!.path,
            deviceArgs: deviceStep.value!.args,
            reinstall: input.reinstall !== false,
            grantRuntimePermissions: !!input.grant_runtime_permissions,
          });
        });
        if (installStep.value) {
          installStep.step.success = installStep.value.success;
          installStep.step.message = installStep.value.message;
        }
        steps.push(installStep.step);
        if (!installStep.step.success) {
          throw installStep.error ?? new FlingError("INSTALL_FAILED", installStep.step.message);
        }

        const launchStep = await timedStep("launch", async () => {
          return await performLaunch({
            packageName: pkg!,
            activity,
            deviceArgs: deviceStep.value!.args,
          });
        });
        if (launchStep.value) {
          launchStep.step.success = launchStep.value.success;
          launchStep.step.message = launchStep.value.message;
        }
        steps.push(launchStep.step);
        if (!launchStep.step.success) {
          throw launchStep.error ?? new FlingError("LAUNCH_FAILED", launchStep.step.message);
        }

        let cdpField: ReturnType<typeof buildCdpFieldFromOutcome> | undefined;
        if (input.expose_cdp) {
          let outcome: CdpOutcome;
          try {
            const value = await exposeCdp(
              {
                deviceArgs: deviceStep.value!.args,
                deviceId: serial!,
                packageName: pkg!,
                prefer: "webview",
              },
              globalCdpForwards
            );
            outcome = { ok: true, value };
          } catch (cdpErr) {
            outcome = { ok: false, error: cdpErr };
          }
          cdpField = buildCdpFieldFromOutcome(outcome);
        }

        const totalMs = steps.reduce((acc, s) => acc + s.duration_ms, 0);
        const summary = [
          `✓ Deployed ${pkg} to ${serial} in ${(totalMs / 1000).toFixed(1)}s`,
          ...steps.map((s) => `  • ${s.name}: ${s.message} (${s.duration_ms}ms)`),
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            success: true,
            device_id: serial,
            apk_path: apkPath,
            package_name: pkg,
            steps,
            cdp: cdpField,
          },
        };
      } catch (err) {
        const failedStep = steps.find((s) => !s.success);
        const detail = err instanceof Error ? err.message : String(err);
        const summary = [
          `✗ deploy_and_run failed${failedStep ? ` at step "${failedStep.name}"` : ""}.`,
          ...steps.map((s) => `  • ${s.name}: ${s.success ? "ok" : "FAILED — " + s.message} (${s.duration_ms}ms)`),
          "",
          detail,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            success: false,
            device_id: serial,
            apk_path: apkPath,
            package_name: pkg,
            steps,
          },
          isError: true,
        };
      }
    }
  );
}
