import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFramedCommand,
  makeFrameMatcher,
  newToken,
} from "../dist/shellFraming.js";

describe("newToken", () => {
  it("returns an 8-char lowercase hex string", () => {
    const t = newToken();
    assert.match(t, /^[0-9a-f]{8}$/);
  });

  it("returns different tokens on repeated calls", () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(newToken());
    assert.ok(seen.size > 95, `expected near-100 unique tokens, got ${seen.size}`);
  });
});

describe("buildFramedCommand", () => {
  it("appends a printf sentinel with token, seq, and exit code", () => {
    const out = buildFramedCommand("ls /sdcard", "abc12345", 7);
    assert.equal(
      out,
      "ls /sdcard ; printf '\\n__FLING_RC_abc12345_7__%d\\n' $?"
    );
  });

  it("does not escape the inner command (caller's responsibility)", () => {
    const out = buildFramedCommand("echo 'hi'", "tok", 0);
    assert.ok(out.startsWith("echo 'hi' ; printf"));
  });
});

describe("makeFrameMatcher", () => {
  it("matches a sentinel line with the right token and seq", () => {
    const m = makeFrameMatcher("abc12345");
    const r = m.matchLine("__FLING_RC_abc12345_3__0", 3);
    assert.deepEqual(r, { matched: true, exitCode: 0 });
  });

  it("does not match a different token", () => {
    const m = makeFrameMatcher("abc12345");
    const r = m.matchLine("__FLING_RC_zzzzzzzz_3__0", 3);
    assert.deepEqual(r, { matched: false });
  });

  it("does not match a different seq", () => {
    const m = makeFrameMatcher("abc12345");
    const r = m.matchLine("__FLING_RC_abc12345_99__0", 3);
    assert.deepEqual(r, { matched: false });
  });

  it("extracts non-zero exit codes", () => {
    const m = makeFrameMatcher("abc12345");
    const r = m.matchLine("__FLING_RC_abc12345_3__127", 3);
    assert.deepEqual(r, { matched: true, exitCode: 127 });
  });

  it("ignores trailing CR", () => {
    const m = makeFrameMatcher("abc12345");
    const r = m.matchLine("__FLING_RC_abc12345_3__0\r", 3);
    assert.deepEqual(r, { matched: true, exitCode: 0 });
  });
});
