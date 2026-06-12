import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPersistentShellEnabled } from "../dist/featureFlags.js";

describe("isPersistentShellEnabled", () => {
  it("returns false when FLING_PERSISTENT_SHELL is unset", () => {
    delete process.env.FLING_PERSISTENT_SHELL;
    assert.equal(isPersistentShellEnabled(), false);
  });

  it("returns true for truthy aliases (1, true, yes, on; case-insensitive)", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", "On"]) {
      process.env.FLING_PERSISTENT_SHELL = v;
      assert.equal(isPersistentShellEnabled(), true, `value=${v}`);
    }
    delete process.env.FLING_PERSISTENT_SHELL;
  });

  it("returns false for explicit off values", () => {
    for (const v of ["0", "false", "no", "off", ""]) {
      process.env.FLING_PERSISTENT_SHELL = v;
      assert.equal(isPersistentShellEnabled(), false, `value=${v}`);
    }
    delete process.env.FLING_PERSISTENT_SHELL;
  });

  it("trims surrounding whitespace", () => {
    process.env.FLING_PERSISTENT_SHELL = "  yes  ";
    assert.equal(isPersistentShellEnabled(), true);
    delete process.env.FLING_PERSISTENT_SHELL;
  });
});
