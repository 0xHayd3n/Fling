import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { z } from "zod";
import { FlingError } from "./errors.js";

export const flingConfigSchema = z.object({
  buildCommand: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      "Override for the build command. String form is split on whitespace. " +
        "If omitted, the gradle wrapper at projectRoot/gradlew[.bat] is run with gradleTask."
    ),
  gradleTask: z
    .string()
    .optional()
    .describe('Gradle task to run when buildCommand is not set. Default "assembleDebug".'),
  buildCwd: z
    .string()
    .optional()
    .describe(
      "Directory to run the build from. Relative paths resolve against the config file's directory. Defaults to the config directory."
    ),
  apkPath: z
    .string()
    .optional()
    .describe(
      "Explicit path to the APK to install. Resolved relative to buildCwd. Takes precedence over apkGlob."
    ),
  apkGlob: z
    .string()
    .optional()
    .describe(
      'Glob (relative to buildCwd) for locating the build output. Default "**/outputs/apk/**/*.apk". Newest match by mtime wins.'
    ),
  packageName: z
    .string()
    .optional()
    .describe("Default Android package for launch_app and install_app."),
  mainActivity: z
    .string()
    .optional()
    .describe(
      "Optional default activity for launch_app. Use a leading dot for a package-relative class (e.g. .MainActivity)."
    ),
});

export type FlingConfig = z.infer<typeof flingConfigSchema>;

export interface LoadedConfig {
  config: FlingConfig;
  configPath: string | null;
  projectRoot: string;
}

const CONFIG_FILENAMES = ["fling.config.json"];
const PACKAGE_JSON = "package.json";

async function tryReadJson(path: string): Promise<unknown | null> {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return null;
    if (e instanceof SyntaxError) {
      throw new FlingError(
        "INVALID_INPUT",
        `Failed to parse ${path}: ${e.message}`
      );
    }
    throw err;
  }
}

function validateConfig(raw: unknown, source: string): FlingConfig {
  const parsed = flingConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid Fling config at ${source}: ${issues}`
    );
  }
  return parsed.data;
}

/**
 * Walk up from `startDir` looking for fling.config.json or a "fling" key in
 * package.json. The first hit wins. Returns the loaded (possibly empty) config
 * and the project root (the directory of the config file, or `startDir` if
 * none was found).
 */
export async function loadFlingConfig(startDir: string): Promise<LoadedConfig> {
  let dir = resolvePath(startDir);
  const seen = new Set<string>();

  while (!seen.has(dir)) {
    seen.add(dir);

    for (const name of CONFIG_FILENAMES) {
      const candidate = resolvePath(dir, name);
      const raw = await tryReadJson(candidate);
      if (raw !== null) {
        return {
          config: validateConfig(raw, candidate),
          configPath: candidate,
          projectRoot: dir,
        };
      }
    }

    const pkgPath = resolvePath(dir, PACKAGE_JSON);
    const pkgRaw = await tryReadJson(pkgPath);
    if (pkgRaw && typeof pkgRaw === "object" && "fling" in pkgRaw) {
      return {
        config: validateConfig((pkgRaw as { fling: unknown }).fling, pkgPath),
        configPath: pkgPath,
        projectRoot: dir,
      };
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { config: {}, configPath: null, projectRoot: resolvePath(startDir) };
}

/**
 * Resolve the build working directory: explicit config.buildCwd (relative to
 * the config file's directory) or the project root if not set.
 */
export function resolveBuildCwd(loaded: LoadedConfig): string {
  const { config, projectRoot } = loaded;
  if (!config.buildCwd) return projectRoot;
  if (isAbsolute(config.buildCwd)) return config.buildCwd;
  return resolvePath(projectRoot, config.buildCwd);
}
