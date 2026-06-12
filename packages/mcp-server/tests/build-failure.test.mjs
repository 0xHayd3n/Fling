import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractBuildFailureReason } from "../dist/gradle.js";

describe("extractBuildFailureReason", () => {
  it("extracts the 'What went wrong' block", () => {
    const stdout = [
      "> Task :app:compileDebugKotlin",
      "",
      "FAILURE: Build failed with an exception.",
      "",
      "* What went wrong:",
      "Execution failed for task ':app:compileDebugKotlin'.",
      "> Compilation error. See log for more details",
      "",
      "* Try:",
      "> Run with --stacktrace option to get the stack trace.",
      "",
      "BUILD FAILED in 7s",
    ].join("\n");
    const reason = extractBuildFailureReason(stdout, "");
    assert.match(reason, /What went wrong/);
    assert.match(reason, /Compilation error/);
    assert.ok(
      !/Try:/.test(reason),
      "should stop before the * Try: block"
    );
  });

  it("falls back to the BUILD FAILED tail when no 'What went wrong' marker", () => {
    const stdout = [
      "> Task :app:assembleDebug",
      "Some weird gradle output",
      "BUILD FAILED in 12s",
      "1 actionable task: 1 executed",
    ].join("\n");
    const reason = extractBuildFailureReason(stdout, "");
    assert.match(reason, /BUILD FAILED/);
  });

  it("falls back to last 25 lines when there is no recognised marker", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
    const reason = extractBuildFailureReason(lines.join("\n"), "");
    const tail = reason.split("\n");
    assert.equal(tail.length, 25);
    assert.equal(tail[0], "line 36");
    assert.equal(tail[24], "line 60");
  });

  it("handles CRLF line endings", () => {
    const stdout = [
      "FAILURE: Build failed with an exception.",
      "",
      "* What went wrong:",
      "Boom",
      "",
      "* Try:",
      "stuff",
    ].join("\r\n");
    const reason = extractBuildFailureReason(stdout, "");
    assert.match(reason, /What went wrong/);
    assert.match(reason, /Boom/);
    assert.ok(!/stuff/.test(reason));
  });

  it("returns '(no output)' for completely empty input", () => {
    assert.equal(extractBuildFailureReason("", ""), "(no output)");
  });
});
