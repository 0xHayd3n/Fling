import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsBounds,
  findNodes,
  pickBest,
  DENY_LABELS,
} from "../dist/uiSelector.js";

// Helper: build a synthetic UiNode with defaults.
function node(overrides = {}) {
  return {
    text: "",
    content_desc: "",
    resource_id: "",
    class: "android.view.View",
    package: "com.example",
    bounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
    center: { x: 50, y: 50 },
    clickable: false,
    long_clickable: false,
    scrollable: false,
    focusable: false,
    focused: false,
    enabled: true,
    selected: false,
    checkable: false,
    checked: false,
    ...overrides,
  };
}

describe("containsBounds", () => {
  it("returns true when outer strictly contains inner", () => {
    assert.equal(
      containsBounds(
        { x1: 0, y1: 0, x2: 100, y2: 100 },
        { x1: 10, y1: 10, x2: 50, y2: 50 }
      ),
      true
    );
  });

  it("returns true when outer equals inner (edges touch)", () => {
    assert.equal(
      containsBounds(
        { x1: 0, y1: 0, x2: 100, y2: 100 },
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      ),
      true
    );
  });

  it("returns false when inner extends past outer's right edge", () => {
    assert.equal(
      containsBounds(
        { x1: 0, y1: 0, x2: 100, y2: 100 },
        { x1: 50, y1: 0, x2: 110, y2: 50 }
      ),
      false
    );
  });

  it("returns false for completely disjoint bounds", () => {
    assert.equal(
      containsBounds(
        { x1: 0, y1: 0, x2: 50, y2: 50 },
        { x1: 100, y1: 100, x2: 150, y2: 150 }
      ),
      false
    );
  });

  it("handles negative coordinates (offscreen elements)", () => {
    assert.equal(
      containsBounds(
        { x1: -50, y1: -50, x2: 50, y2: 50 },
        { x1: -10, y1: -10, x2: 10, y2: 10 }
      ),
      true
    );
  });
});

describe("findNodes — text selector", () => {
  it("matches substring by default (case-sensitive)", () => {
    const nodes = [
      node({ text: "Get started" }),
      node({ text: "Settings" }),
    ];
    const matches = findNodes(nodes, { by: "text", value: "started" });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].text, "Get started");
  });

  it("substring is case-sensitive", () => {
    const nodes = [node({ text: "Settings" })];
    assert.equal(
      findNodes(nodes, { by: "text", value: "settings" }).length,
      0
    );
  });

  it("matches exact when exact:true", () => {
    const nodes = [
      node({ text: "Photos" }),
      node({ text: "Photos (3)" }),
    ];
    const matches = findNodes(nodes, {
      by: "text",
      value: "Photos",
      exact: true,
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].text, "Photos");
  });

  it("returns empty array when nothing matches", () => {
    const nodes = [node({ text: "Hello" })];
    assert.deepEqual(findNodes(nodes, { by: "text", value: "World" }), []);
  });

  it("preserves document order across matches", () => {
    const nodes = [
      node({ text: "Photos top", bounds: { x1: 0, y1: 0, x2: 100, y2: 50 } }),
      node({ text: "Photos bottom", bounds: { x1: 0, y1: 100, x2: 100, y2: 150 } }),
    ];
    const matches = findNodes(nodes, { by: "text", value: "Photos" });
    assert.equal(matches.length, 2);
    assert.equal(matches[0].text, "Photos top");
    assert.equal(matches[1].text, "Photos bottom");
  });
});

describe("findNodes — resource_id selector", () => {
  it("requires exact match (no substring)", () => {
    const nodes = [
      node({ resource_id: "com.foo:id/search" }),
      node({ resource_id: "com.foo:id/search_bar" }),
    ];
    const matches = findNodes(nodes, {
      by: "resource_id",
      value: "com.foo:id/search",
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].resource_id, "com.foo:id/search");
  });

  it("returns empty when resource_id absent", () => {
    const nodes = [node({ text: "Hi" })];
    assert.deepEqual(
      findNodes(nodes, { by: "resource_id", value: "com.foo:id/nope" }),
      []
    );
  });
});

describe("findNodes — content_desc selector", () => {
  it("substring match by default", () => {
    const nodes = [
      node({ content_desc: "Search button" }),
      node({ content_desc: "Back arrow" }),
    ];
    const matches = findNodes(nodes, { by: "content_desc", value: "Search" });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].content_desc, "Search button");
  });

  it("exact:true requires equality", () => {
    const nodes = [
      node({ content_desc: "Dismiss" }),
      node({ content_desc: "Dismiss dialog" }),
    ];
    const matches = findNodes(nodes, {
      by: "content_desc",
      value: "Dismiss",
      exact: true,
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].content_desc, "Dismiss");
  });
});

describe("pickBest", () => {
  it("returns the match itself when no clickable ancestor exists", () => {
    const matched = node({ text: "Hi", clickable: false });
    const all = [matched];
    const result = pickBest([matched], all);
    assert.ok(result);
    assert.equal(result.node, matched);
    assert.equal(result.fellBackToMatch, true);
  });

  it("walks up to the smallest clickable ancestor when one exists", () => {
    const label = node({
      text: "Get started",
      clickable: false,
      bounds: { x1: 421, y1: 2195, x2: 799, y2: 2355 },
    });
    const button = node({
      class: "android.widget.Button",
      clickable: true,
      bounds: { x1: 400, y1: 2150, x2: 820, y2: 2400 },
    });
    const all = [button, label];
    const result = pickBest([label], all);
    assert.ok(result);
    assert.equal(result.node, button);
    assert.equal(result.fellBackToMatch, false);
  });

  it("picks the smallest clickable ancestor when multiple wrap the match", () => {
    const label = node({
      text: "OK",
      bounds: { x1: 100, y1: 100, x2: 200, y2: 150 },
    });
    const smallButton = node({
      clickable: true,
      bounds: { x1: 90, y1: 90, x2: 210, y2: 160 },
    });
    const bigContainer = node({
      clickable: true,
      bounds: { x1: 0, y1: 0, x2: 500, y2: 500 },
    });
    const all = [bigContainer, smallButton, label];
    const result = pickBest([label], all);
    assert.ok(result);
    assert.equal(result.node, smallButton);
    assert.equal(result.fellBackToMatch, false);
  });

  it("when multiple matches exist, picks the first in document order", () => {
    const first = node({
      text: "Photos",
      clickable: true,
      bounds: { x1: 0, y1: 0, x2: 100, y2: 50 },
    });
    const second = node({
      text: "Photos",
      clickable: true,
      bounds: { x1: 0, y1: 100, x2: 100, y2: 150 },
    });
    const all = [first, second];
    const result = pickBest([first, second], all);
    assert.ok(result);
    assert.equal(result.node, first);
  });

  it("returns undefined when matches is empty", () => {
    assert.equal(pickBest([], []), undefined);
  });
});

describe("DENY_LABELS", () => {
  it("contains the canonical deny labels", () => {
    for (const label of [
      "Don’t allow",
      "Don't allow",
      "Cancel",
      "Skip",
      "Dismiss",
      "No thanks",
    ]) {
      assert.ok(
        DENY_LABELS.some((l) => l === label),
        `expected DENY_LABELS to contain "${label}"`
      );
    }
  });

  it("is non-empty and frozen-shaped", () => {
    assert.ok(DENY_LABELS.length >= 8);
  });
});
