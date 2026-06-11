import { stat } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { FlingConfig } from "./config.js";
import { DEFAULT_APK_GLOB, findNewestApk } from "./apkFinder.js";
import { FlingError } from "./errors.js";

export interface ResolvedApk {
  path: string;
  source: "explicit" | "config-path" | "config-glob" | "auto-discover";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve which APK to install. Priority:
 *   1. Explicit `explicitPath` argument (from the tool call)
 *   2. config.apkPath
 *   3. Glob search using config.apkGlob (or default) under buildCwd
 *
 * Throws FlingError("APK_NOT_FOUND") with the actual locations tried.
 */
export async function resolveApk(
  explicitPath: string | undefined,
  config: FlingConfig,
  buildCwd: string
): Promise<ResolvedApk> {
  if (explicitPath) {
    // Relative paths resolve against buildCwd, matching how config.apkPath
    // resolves. The previous behavior used process.cwd() which surprised
    // users who passed relative paths from inside a project directory.
    const abs = isAbsolute(explicitPath)
      ? explicitPath
      : resolvePath(buildCwd, explicitPath);
    if (!(await fileExists(abs))) {
      throw new FlingError(
        "APK_NOT_FOUND",
        `APK not found at ${abs}.`
      );
    }
    return { path: abs, source: "explicit" };
  }

  if (config.apkPath) {
    const abs = isAbsolute(config.apkPath)
      ? config.apkPath
      : resolvePath(buildCwd, config.apkPath);
    if (!(await fileExists(abs))) {
      throw new FlingError(
        "APK_NOT_FOUND",
        `config.apkPath points to ${abs} but no file is there. ` +
          "Build first, or update the apkPath in your fling.config.json."
      );
    }
    return { path: abs, source: "config-path" };
  }

  const pattern = config.apkGlob ?? DEFAULT_APK_GLOB;
  const found = await findNewestApk(buildCwd, pattern);
  if (!found) {
    throw new FlingError(
      "APK_NOT_FOUND",
      `No APK matched ${pattern} under ${buildCwd}. ` +
        "Build the project first, or set apkPath in fling.config.json."
    );
  }
  return {
    path: found.path,
    source: config.apkGlob ? "config-glob" : "auto-discover",
  };
}
