import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { AdbShell } from "../dist/shellPool.js";

// Minimal fake ChildProcess. Tests push data into stdout and call
// .emit('exit', code) to simulate the real adb shell process lifecycle.
function makeFakeChild() {
  const child = new EventEmitter();
  child.stdin = {
    written: "",
    write(chunk) {
      this.written += String(chunk);
      return true;
    },
    end() {},
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = function () {
    child.killed = true;
    setImmediate(() => child.emit("exit", null, "SIGTERM"));
  };
  return child;
}

describe("AdbShell — lifecycle", () => {
  it("does not spawn until the first exec / _ensureSpawned", () => {
    let spawned = 0;
    const shell = new AdbShell("SERIAL", {
      spawnImpl: () => {
        spawned++;
        return makeFakeChild();
      },
    });
    assert.equal(spawned, 0);
  });

  it("_ensureSpawned spawns once and returns the same child on repeat", () => {
    const childs = [];
    const shell = new AdbShell("SERIAL", {
      spawnImpl: () => {
        const c = makeFakeChild();
        childs.push(c);
        return c;
      },
    });
    const a = shell._ensureSpawned();
    const b = shell._ensureSpawned();
    assert.equal(childs.length, 1);
    assert.equal(a, b);
  });

  it("shutdown() kills the child and rejects further execs with ADB_SHELL_SHUT_DOWN", async () => {
    const child = makeFakeChild();
    const shell = new AdbShell("SERIAL", { spawnImpl: () => child });
    shell._ensureSpawned();
    shell.shutdown();
    assert.equal(child.killed, true);
    await assert.rejects(() => shell.exec("ls"), (err) => err.code === "ADB_SHELL_SHUT_DOWN");
  });

  it("shutdown() before any spawn is a no-op for the child and still blocks exec", async () => {
    let spawned = 0;
    const shell = new AdbShell("SERIAL", {
      spawnImpl: () => {
        spawned++;
        return makeFakeChild();
      },
    });
    shell.shutdown();
    assert.equal(spawned, 0);
    await assert.rejects(() => shell.exec("ls"), (err) => err.code === "ADB_SHELL_SHUT_DOWN");
  });
});
