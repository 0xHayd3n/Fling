import { runAdb } from "./adb.js";
import { FlingError } from "./errors.js";

const DUMP_TIMEOUT_MS = 15_000;
const DEVICE_DUMP_PATH = "/sdcard/window_dump.xml";

export interface UiBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface UiNode {
  text: string;
  content_desc: string;
  resource_id: string;
  class: string;
  package: string;
  bounds: UiBounds;
  center: { x: number; y: number };
  clickable: boolean;
  long_clickable: boolean;
  scrollable: boolean;
  focusable: boolean;
  focused: boolean;
  enabled: boolean;
  selected: boolean;
  checkable: boolean;
  checked: boolean;
}

// uiautomator emits each node as a single self-closing tag OR a paired opening
// tag whose attributes live entirely on one line, e.g.
//   <node bounds="[0,0][1080,200]" text="Settings" clickable="true" .../>
// The attribute matcher is quoted-value aware so it doesn't stop at a `>` that
// appears inside an attribute value (WebView content-desc can contain raw `>`
// on some Android versions). Closing tags `</node>` start with `</` and are
// not matched.
const NODE_OPEN_RE = /<node((?:\s+[\w-]+="[^"]*")*)\s*\/?>/g;
const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

function decodeXmlAttr(s: string): string {
  // Order matters: &amp; last so we don't double-decode entities that contain
  // an ampersand in their replacement.
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Fresh regex per call so a future early-return inside the loop can't leave
  // stale `lastIndex` state across calls. Compile cost is negligible.
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrStr)) !== null) {
    out[m[1]] = decodeXmlAttr(m[2]);
  }
  return out;
}

function parseBool(v: string | undefined): boolean {
  return v === "true";
}

export function parseUiHierarchy(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  NODE_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NODE_OPEN_RE.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1]);
    const boundsMatch = attrs.bounds ? BOUNDS_RE.exec(attrs.bounds) : null;
    // A node without parseable bounds isn't tappable — skip it. This also
    // protects downstream callers that compute taps from `center` without
    // re-checking.
    if (!boundsMatch) continue;
    const x1 = Number(boundsMatch[1]);
    const y1 = Number(boundsMatch[2]);
    const x2 = Number(boundsMatch[3]);
    const y2 = Number(boundsMatch[4]);
    nodes.push({
      text: attrs.text ?? "",
      content_desc: attrs["content-desc"] ?? "",
      resource_id: attrs["resource-id"] ?? "",
      class: attrs.class ?? "",
      package: attrs.package ?? "",
      bounds: { x1, y1, x2, y2 },
      center: {
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2),
      },
      clickable: parseBool(attrs.clickable),
      long_clickable: parseBool(attrs["long-clickable"]),
      scrollable: parseBool(attrs.scrollable),
      focusable: parseBool(attrs.focusable),
      focused: parseBool(attrs.focused),
      enabled: parseBool(attrs.enabled),
      selected: parseBool(attrs.selected),
      checkable: parseBool(attrs.checkable),
      checked: parseBool(attrs.checked),
    });
  }
  return nodes;
}

export function isInteresting(node: UiNode): boolean {
  // `focusable` alone is intentionally NOT a qualifier: in dense lists almost
  // every TextView is focusable for D-pad navigation, which drowns the result
  // in noise. Anything truly tap-targetable will be clickable; anything with
  // semantic meaning will have text / content-desc / resource-id.
  return (
    node.clickable ||
    node.long_clickable ||
    node.scrollable ||
    node.text !== "" ||
    node.content_desc !== "" ||
    node.resource_id !== ""
  );
}

export interface UiDumpResult {
  nodes: UiNode[];
  raw_xml: string;
}

export async function fetchUiDump(deviceArgs: string[]): Promise<UiDumpResult> {
  // uiautomator prints "ERROR: could not get idle state" (and similar) when
  // the foreground app blocks accessibility traversal. adb merges device-side
  // stderr into the shell's stdout, so we have to inspect the combined output
  // — but only at the start of a line. Anchoring to ^ERROR: avoids matching a
  // node attribute like text="ERROR: connection refused" that lives inside an
  // XML payload, since uiautomator's status lines always start in column 0.
  const { stdout: dumpOut, stderr: dumpErr } = await runAdb(
    [...deviceArgs, "shell", "uiautomator", "dump", DEVICE_DUMP_PATH],
    { timeoutMs: DUMP_TIMEOUT_MS }
  );
  const combined = `${dumpOut}\n${dumpErr}`;
  if (/^ERROR:/m.test(combined)) {
    throw new FlingError(
      "ADB_FAILED",
      `uiautomator dump failed: ${combined.trim()}`
    );
  }

  const { stdout: xml } = await runAdb(
    [...deviceArgs, "shell", "cat", DEVICE_DUMP_PATH],
    { timeoutMs: DUMP_TIMEOUT_MS }
  );
  if (!xml.includes("<hierarchy") && !xml.includes("<node")) {
    throw new FlingError(
      "ADB_FAILED",
      `uiautomator dump produced no XML hierarchy. Got: ${xml.slice(0, 200)}`
    );
  }
  return { nodes: parseUiHierarchy(xml), raw_xml: xml };
}
