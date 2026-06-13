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
