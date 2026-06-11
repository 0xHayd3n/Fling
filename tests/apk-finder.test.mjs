import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { globToRegex } from "../dist/apkFinder.js";

function match(pattern, path) {
  return globToRegex(pattern).test(path);
}

describe("globToRegex", () => {
  it("matches a top-level file with **/*.apk", () => {
    assert.ok(match("**/*.apk", "app.apk"));
  });

  it("matches nested files with **/*.apk", () => {
    assert.ok(match("**/*.apk", "nested/app.apk"));
    assert.ok(match("**/*.apk", "a/b/c/app.apk"));
  });

  it("matches the default Android outputs path", () => {
    assert.ok(
      match("**/outputs/apk/**/*.apk", "app/build/outputs/apk/debug/app-debug.apk")
    );
    assert.ok(
      match("**/outputs/apk/**/*.apk", "outputs/apk/release/app-release.apk")
    );
  });

  it("rejects paths missing the literal segments", () => {
    assert.ok(!match("**/outputs/apk/**/*.apk", "app/build/intermediates/app.apk"));
  });

  it("respects single * (no slash traversal)", () => {
    assert.ok(match("*.apk", "app.apk"));
    assert.ok(!match("*.apk", "nested/app.apk"));
  });

  it("handles trailing ** as 'everything under'", () => {
    assert.ok(match("app/build/**", "app/build/foo/bar.apk"));
    assert.ok(match("app/build/**", "app/build/foo.apk"));
    assert.ok(!match("app/build/**", "app/other/foo.apk"));
  });

  it("handles bare ** as 'match anything'", () => {
    assert.ok(match("**", "anything"));
    assert.ok(match("**", "deep/nested/file"));
  });

  it("handles ? as single-char wildcard", () => {
    assert.ok(match("app?.apk", "app1.apk"));
    assert.ok(!match("app?.apk", "app12.apk"));
  });

  it("escapes regex metacharacters in literal segments", () => {
    // A literal `.` in the glob should only match `.`, not any char.
    const re = globToRegex("foo.bar.apk");
    assert.ok(re.test("foo.bar.apk"));
    assert.ok(!re.test("fooxbar.apk"));
  });

  it("anchors at both ends", () => {
    assert.ok(!match("foo", "prefix-foo"));
    assert.ok(!match("foo", "foo-suffix"));
  });
});
