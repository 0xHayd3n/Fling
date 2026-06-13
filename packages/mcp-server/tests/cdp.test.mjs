import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProcNetUnix } from "../dist/cdp.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");

describe("parseProcNetUnix", () => {
  it("extracts webview and chrome sockets from a hybrid-app capture", () => {
    const sockets = parseProcNetUnix(fixture("proc-net-unix-with-webview.txt"));
    assert.deepEqual(sockets, [
      { kind: "chrome", name: "chrome_devtools_remote" },
      { kind: "webview", pid: 12345, name: "webview_devtools_remote_12345" },
      { kind: "webview", pid: 67890, name: "webview_devtools_remote_67890" },
    ]);
  });

  it("returns only chrome when no webview is debuggable", () => {
    const sockets = parseProcNetUnix(fixture("proc-net-unix-without-webview.txt"));
    assert.deepEqual(sockets, [
      { kind: "chrome", name: "chrome_devtools_remote" },
    ]);
  });

  it("tolerates legacy chrome_devtools_remote_<pid> entries", () => {
    const sockets = parseProcNetUnix(fixture("proc-net-unix-chrome-only.txt"));
    assert.deepEqual(sockets, [
      { kind: "chrome", name: "chrome_devtools_remote" },
      { kind: "chrome", pid: 88888, name: "chrome_devtools_remote_88888" },
    ]);
  });

  it("returns an empty array when no _devtools_remote lines exist", () => {
    const sockets = parseProcNetUnix("Num RefCount Protocol\n");
    assert.deepEqual(sockets, []);
  });

  it("ignores malformed lines without crashing", () => {
    const sockets = parseProcNetUnix("not a real proc/net/unix output\n@webview_devtools_remote_42\n");
    assert.deepEqual(sockets, [
      { kind: "webview", pid: 42, name: "webview_devtools_remote_42" },
    ]);
  });
});

import { pickTarget } from "../dist/cdp.js";

const webview = (pid) => ({ kind: "webview", pid, name: `webview_devtools_remote_${pid}` });
const chrome = (pid) => pid
  ? { kind: "chrome", pid, name: `chrome_devtools_remote_${pid}` }
  : { kind: "chrome", name: "chrome_devtools_remote" };

describe("pickTarget", () => {
  it("prefers a webview socket matching one of the package PIDs", () => {
    const target = pickTarget([webview(100), webview(200), chrome()], [200], "webview");
    assert.deepEqual(target, webview(200));
  });

  it("returns null when prefer=webview but no socket matches the PIDs", () => {
    const target = pickTarget([webview(100), chrome()], [999], "webview");
    assert.equal(target, null);
  });

  it("returns null when prefer=webview and there are no webview sockets at all", () => {
    const target = pickTarget([chrome()], [100], "webview");
    assert.equal(target, null);
  });

  it("returns the first chrome socket when prefer=chrome", () => {
    const target = pickTarget([webview(100), chrome(), chrome(7)], [100], "chrome");
    assert.deepEqual(target, chrome());
  });

  it("ignores package PIDs in chrome mode (process-agnostic)", () => {
    const target = pickTarget([chrome()], [], "chrome");
    assert.deepEqual(target, chrome());
  });

  it("falls back from webview to chrome when prefer=any", () => {
    const target = pickTarget([webview(100), chrome()], [999], "any");
    assert.deepEqual(target, chrome());
  });

  it("picks webview first when prefer=any and a match exists", () => {
    const target = pickTarget([webview(100), chrome()], [100], "any");
    assert.deepEqual(target, webview(100));
  });

  it("returns null when nothing matches under any mode", () => {
    assert.equal(pickTarget([], [100], "webview"), null);
    assert.equal(pickTarget([], [100], "chrome"), null);
    assert.equal(pickTarget([], [100], "any"), null);
  });
});
