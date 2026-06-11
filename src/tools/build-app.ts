import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadFlingConfig, resolveBuildCwd } from "../config.js";
import { resolveApk } from "../apkResolver.js";
import { FlingError } from "../errors.js";
import { resolveBuildCommand, runBuild } from "../gradle.js";
import { toolErrorFrom } from "../toolResult.js";

export function registerBuildApp(server: McpServer): void {
  server.registerTool(
    "build_app",
    {
      title: "Build the Android app",
      description:
        "Run the project's build (default: gradle wrapper + assembleDebug). On success " +
        "returns the discovered APK path. Honors fling.config.json fields: buildCommand, " +
        "gradleTask, buildCwd, apkPath, apkGlob.",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe(
            "Starting directory for config lookup and (when not overridden) the build. " +
              "Defaults to the MCP server's cwd."
          ),
      },
      outputSchema: {
        success: z.boolean(),
        command_run: z.string(),
        build_cwd: z.string(),
        duration_ms: z.number().int().nonnegative(),
        apk_path: z.string().optional(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ cwd }) => {
      try {
        const loaded = await loadFlingConfig(cwd ?? process.cwd());
        const buildCwd = resolveBuildCwd(loaded);
        const command = await resolveBuildCommand(buildCwd, loaded.config);
        const printable = [command.command, ...command.args].join(" ");

        const outcome = await runBuild(buildCwd, command);

        let apkPath: string | undefined;
        try {
          const apk = await resolveApk(undefined, loaded.config, buildCwd);
          apkPath = apk.path;
        } catch (err) {
          if (!(err instanceof FlingError) || err.code !== "APK_NOT_FOUND") {
            throw err;
          }
        }

        const text = [
          `✓ Build succeeded in ${(outcome.durationMs / 1000).toFixed(1)}s`,
          `  Command: ${printable}`,
          `  cwd: ${buildCwd}`,
          apkPath ? `  APK: ${apkPath}` : "  APK: (not auto-located — set apkPath or check apkGlob)",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            success: true,
            command_run: printable,
            build_cwd: buildCwd,
            duration_ms: outcome.durationMs,
            apk_path: apkPath,
            message: text,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
