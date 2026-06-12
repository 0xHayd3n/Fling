import type { UiBounds, UiNode } from "./uiDump.js";

export type Selector =
  | { by: "text"; value: string; exact?: boolean }
  | { by: "resource_id"; value: string }
  | { by: "content_desc"; value: string; exact?: boolean };

export function containsBounds(outer: UiBounds, inner: UiBounds): boolean {
  return (
    outer.x1 <= inner.x1 &&
    outer.y1 <= inner.y1 &&
    outer.x2 >= inner.x2 &&
    outer.y2 >= inner.y2
  );
}

function area(b: UiBounds): number {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
}

export function findNodes(nodes: UiNode[], selector: Selector): UiNode[] {
  if (selector.by === "resource_id") {
    return nodes.filter((n) => n.resource_id === selector.value);
  }
  const field = selector.by === "text" ? "text" : "content_desc";
  const exact = selector.exact === true;
  return nodes.filter((n) => {
    const haystack = n[field];
    if (!haystack) return false;
    return exact ? haystack === selector.value : haystack.includes(selector.value);
  });
}

export interface PickBestResult {
  node: UiNode;
  fellBackToMatch: boolean;
}

export function pickBest(
  matches: UiNode[],
  allNodes: UiNode[]
): PickBestResult | undefined {
  if (matches.length === 0) return undefined;
  const match = matches[0]; // first in document order

  if (match.clickable) {
    return { node: match, fellBackToMatch: false };
  }

  // Find all clickable nodes whose bounds contain the match.
  const clickableAncestors = allNodes.filter(
    (n) => n.clickable && n !== match && containsBounds(n.bounds, match.bounds)
  );

  if (clickableAncestors.length === 0) {
    return { node: match, fellBackToMatch: true };
  }

  // Smallest by area.
  let best = clickableAncestors[0];
  let bestArea = area(best.bounds);
  for (let i = 1; i < clickableAncestors.length; i++) {
    const a = area(clickableAncestors[i].bounds);
    if (a < bestArea) {
      best = clickableAncestors[i];
      bestArea = a;
    }
  }
  return { node: best, fellBackToMatch: false };
}

export const DENY_LABELS: readonly string[] = [
  "Don’t allow",              // U+2019 RIGHT SINGLE QUOTATION MARK (Android's actual rendering)
  "Don’t allow & don’t ask again",
  "Don't allow",                   // ASCII apostrophe fallback
  "Don't allow & don't ask again",
  "Not now",
  "Skip",
  "Cancel",
  "Dismiss",
  "No thanks",
  "Maybe later",
  "Deny",
  "Close",
  "No",
];
