import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".vscode",
  "node_modules",
]);

export const DEFAULT_APK_GLOB = "**/outputs/apk/**/*.apk";

/**
 * Convert a glob to a regex. Supports:
 *   `**` — any number of path segments (including zero)
 *   `*`  — any chars except `/`
 *   `?`  — any single char except `/`
 * All other regex metacharacters are escaped.
 */
export function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++;
    } else if (c === "*") {
      re += "[^/]*";
      i++;
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (/[.+^$|(){}[\]\\]/.test(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

export async function findFiles(
  rootDir: string,
  pattern: string
): Promise<string[]> {
  const regex = globToRegex(pattern);
  const found: string[] = [];

  async function walk(dir: string, relPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absChild = join(dir, entry.name);
      const relChild = relPath ? `${relPath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(absChild, relChild);
      } else if (entry.isFile()) {
        if (regex.test(relChild)) {
          found.push(absChild);
        }
      }
    }
  }

  await walk(rootDir, "");
  return found;
}

export interface FoundApk {
  path: string;
  mtimeMs: number;
}

/**
 * Find the newest file matching the pattern under rootDir.
 * Returns null when no match exists.
 */
export async function findNewestApk(
  rootDir: string,
  pattern: string = DEFAULT_APK_GLOB
): Promise<FoundApk | null> {
  const matches = await findFiles(rootDir, pattern);
  if (matches.length === 0) return null;

  const withMtime = await Promise.all(
    matches.map(async (p) => {
      try {
        const s = await stat(p);
        return { path: p, mtimeMs: s.mtimeMs };
      } catch {
        return null;
      }
    })
  );

  const valid = withMtime.filter((x): x is FoundApk => x !== null);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return valid[0];
}
