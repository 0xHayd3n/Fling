import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clampOpacity,
  loadWindowPrefs,
  saveWindowPrefs,
  DEFAULT_PREFS,
} from "../src/renderer/lib/windowPrefs.ts";

// Minimal localStorage shim for the test environment.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe("clampOpacity", () => {
  it("passes through values in [0.3, 1.0]", () => {
    assert.equal(clampOpacity(0.5), 0.5);
    assert.equal(clampOpacity(0.3), 0.3);
    assert.equal(clampOpacity(1.0), 1.0);
  });
  it("clamps below-min to 0.3", () => {
    assert.equal(clampOpacity(0), 0.3);
    assert.equal(clampOpacity(-1), 0.3);
  });
  it("clamps above-max to 1.0", () => {
    assert.equal(clampOpacity(1.5), 1.0);
    assert.equal(clampOpacity(99), 1.0);
  });
  it("falls back to 1.0 for NaN", () => {
    assert.equal(clampOpacity(NaN), 1.0);
    assert.equal(clampOpacity("not a number"), 1.0);
  });
});

describe("loadWindowPrefs", () => {
  beforeEach(installLocalStorage);

  it("returns defaults when no value is stored", () => {
    assert.deepEqual(loadWindowPrefs(), DEFAULT_PREFS);
  });
  it("returns defaults when stored JSON is malformed", () => {
    localStorage.setItem("fling.window", "{not json");
    assert.deepEqual(loadWindowPrefs(), DEFAULT_PREFS);
  });
  it("clamps stored opacity to [0.3, 1.0]", () => {
    localStorage.setItem("fling.window", JSON.stringify({ isPinned: false, opacity: 0.1 }));
    assert.equal(loadWindowPrefs().opacity, 0.3);
    localStorage.setItem("fling.window", JSON.stringify({ isPinned: false, opacity: 2 }));
    assert.equal(loadWindowPrefs().opacity, 1.0);
  });
  it("passes through valid stored values", () => {
    localStorage.setItem("fling.window", JSON.stringify({ isPinned: true, opacity: 0.7 }));
    assert.deepEqual(loadWindowPrefs(), { isPinned: true, opacity: 0.7 });
  });
  it("returns defaults when localStorage is undefined", () => {
    // Simulate non-renderer env (e.g. node test importing types.ts indirectly).
    delete globalThis.localStorage;
    assert.deepEqual(loadWindowPrefs(), DEFAULT_PREFS);
  });
});

describe("saveWindowPrefs", () => {
  beforeEach(installLocalStorage);

  it("writes JSON under the fling.window key", () => {
    saveWindowPrefs({ isPinned: true, opacity: 0.6 });
    assert.deepEqual(
      JSON.parse(localStorage.getItem("fling.window")),
      { isPinned: true, opacity: 0.6 },
    );
  });
  it("no-ops when localStorage is undefined", () => {
    delete globalThis.localStorage;
    assert.doesNotThrow(() => saveWindowPrefs({ isPinned: true, opacity: 0.5 }));
  });
});
