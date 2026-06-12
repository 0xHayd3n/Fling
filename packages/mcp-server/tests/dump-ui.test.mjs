import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUiHierarchy, isInteresting } from "../dist/tools/dump-ui.js";

const HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n' +
  '<hierarchy rotation="0">';
const FOOTER = "</hierarchy>";

function wrap(inner) {
  return `${HEADER}${inner}${FOOTER}`;
}

describe("parseUiHierarchy", () => {
  it("returns [] for empty / non-hierarchy input", () => {
    assert.deepEqual(parseUiHierarchy(""), []);
    assert.deepEqual(parseUiHierarchy("not xml"), []);
    assert.deepEqual(parseUiHierarchy(wrap("")), []);
  });

  it("parses a single self-closing node and computes its center", () => {
    const xml = wrap(
      '<node index="0" text="Settings" resource-id="com.android.settings:id/title" ' +
        'class="android.widget.TextView" package="com.android.settings" content-desc="" ' +
        'checkable="false" checked="false" clickable="true" enabled="true" focusable="true" ' +
        'focused="false" scrollable="false" long-clickable="false" password="false" ' +
        'selected="false" bounds="[100,200][400,300]"/>'
    );
    const [n] = parseUiHierarchy(xml);
    assert.equal(n.text, "Settings");
    assert.equal(n.resource_id, "com.android.settings:id/title");
    assert.equal(n.class, "android.widget.TextView");
    assert.equal(n.package, "com.android.settings");
    assert.deepEqual(n.bounds, { x1: 100, y1: 200, x2: 400, y2: 300 });
    assert.deepEqual(n.center, { x: 250, y: 250 });
    assert.equal(n.clickable, true);
    assert.equal(n.focusable, true);
    assert.equal(n.scrollable, false);
  });

  it("parses an opening <node> tag (parent in the hierarchy), not just self-closing leaves", () => {
    const xml = wrap(
      '<node index="0" text="" bounds="[0,0][1080,2400]" clickable="false" class="android.widget.FrameLayout">' +
        '<node index="0" text="Child" bounds="[10,20][30,40]" clickable="true"/>' +
        "</node>"
    );
    const nodes = parseUiHierarchy(xml);
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].class, "android.widget.FrameLayout");
    assert.equal(nodes[1].text, "Child");
    assert.deepEqual(nodes[1].center, { x: 20, y: 30 });
  });

  it("skips nodes without parseable bounds", () => {
    const xml = wrap(
      '<node text="ok" bounds="[0,0][10,10]"/>' +
        '<node text="bad" bounds="not-bounds"/>' +
        "<node text=\"nobounds\"/>"
    );
    const nodes = parseUiHierarchy(xml);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].text, "ok");
  });

  it("decodes XML entities in attribute values", () => {
    const xml = wrap(
      '<node text="Tom &amp; Jerry &lt;3" content-desc="&quot;Wifi&quot;" ' +
        'bounds="[0,0][10,10]"/>'
    );
    const [n] = parseUiHierarchy(xml);
    assert.equal(n.text, "Tom & Jerry <3");
    assert.equal(n.content_desc, '"Wifi"');
  });

  it("treats missing boolean attrs as false, not undefined", () => {
    const xml = wrap('<node text="x" bounds="[0,0][10,10]"/>');
    const [n] = parseUiHierarchy(xml);
    assert.equal(n.clickable, false);
    assert.equal(n.scrollable, false);
    assert.equal(n.focusable, false);
    assert.equal(n.long_clickable, false);
    assert.equal(n.checked, false);
  });

  it("rounds the center to integer pixels", () => {
    const xml = wrap('<node text="x" bounds="[0,0][3,5]"/>');
    const [n] = parseUiHierarchy(xml);
    // (0+3)/2 = 1.5 → 2 (rounded), (0+5)/2 = 2.5 → 3 (rounded)
    assert.equal(Number.isInteger(n.center.x), true);
    assert.equal(Number.isInteger(n.center.y), true);
    assert.equal(n.center.x, 2);
    assert.equal(n.center.y, 3);
  });

  it("handles negative bounds (offscreen elements)", () => {
    const xml = wrap('<node text="x" bounds="[-10,-20][30,40]"/>');
    const [n] = parseUiHierarchy(xml);
    assert.deepEqual(n.bounds, { x1: -10, y1: -20, x2: 30, y2: 40 });
    assert.deepEqual(n.center, { x: 10, y: 10 });
  });

  it("parses many siblings on one line", () => {
    const xml = wrap(
      '<node text="a" bounds="[0,0][10,10]"/>' +
        '<node text="b" bounds="[10,0][20,10]"/>' +
        '<node text="c" bounds="[20,0][30,10]"/>'
    );
    const nodes = parseUiHierarchy(xml);
    assert.equal(nodes.length, 3);
    assert.deepEqual(
      nodes.map((n) => n.text),
      ["a", "b", "c"]
    );
  });

  it("does not stop at a raw '>' that appears inside an attribute value", () => {
    // WebView-sourced content-desc on some Android versions emits unescaped
    // `>` characters. The regex must consume the full attribute string and
    // still arrive at the proper closing `/>` of the node.
    const xml = wrap(
      '<node content-desc="a > b" text="next" bounds="[0,0][50,50]"/>'
    );
    const [n] = parseUiHierarchy(xml);
    assert.ok(n, "expected the node to parse despite raw > in content-desc");
    assert.equal(n.content_desc, "a > b");
    assert.equal(n.text, "next");
    assert.deepEqual(n.bounds, { x1: 0, y1: 0, x2: 50, y2: 50 });
  });
});

describe("isInteresting", () => {
  const base = {
    text: "",
    content_desc: "",
    resource_id: "",
    class: "android.widget.FrameLayout",
    package: "com.android.settings",
    bounds: { x1: 0, y1: 0, x2: 10, y2: 10 },
    center: { x: 5, y: 5 },
    clickable: false,
    long_clickable: false,
    scrollable: false,
    focusable: false,
    focused: false,
    enabled: true,
    selected: false,
    checkable: false,
    checked: false,
  };

  it("drops pure layout containers (no text, no IDs, no interactivity)", () => {
    assert.equal(isInteresting(base), false);
  });

  it("keeps clickable / long-clickable / scrollable nodes", () => {
    assert.equal(isInteresting({ ...base, clickable: true }), true);
    assert.equal(isInteresting({ ...base, long_clickable: true }), true);
    assert.equal(isInteresting({ ...base, scrollable: true }), true);
  });

  it("does NOT keep a node that is only focusable (D-pad noise in dense lists)", () => {
    // Every TextView in a RecyclerView row is focusable but most are pure
    // decoration. Truly tap-targetable nodes are also clickable, so dropping
    // focusable-alone keeps results actionable.
    assert.equal(isInteresting({ ...base, focusable: true }), false);
  });

  it("keeps nodes with text, content-desc, or resource-id even if non-interactive", () => {
    assert.equal(isInteresting({ ...base, text: "Hello" }), true);
    assert.equal(isInteresting({ ...base, content_desc: "Settings icon" }), true);
    assert.equal(
      isInteresting({ ...base, resource_id: "android:id/title" }),
      true
    );
  });
});
