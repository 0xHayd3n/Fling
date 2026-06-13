import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CdpForwards } from "../dist/cdpForwards.js";

const noopTeardown = async () => {};

describe("CdpForwards", () => {
  let registry;
  beforeEach(() => {
    registry = new CdpForwards();
  });

  it("registers and retrieves an entry by device+socket", () => {
    const entry = { deviceId: "abc", socket: "webview_devtools_remote_1", port: 9223 };
    registry.register(entry, noopTeardown);
    assert.deepEqual(registry.get("abc", "webview_devtools_remote_1"), entry);
  });

  it("replace tears down the prior entry for the same key and installs the new one", async () => {
    const torn = [];
    const oldEntry = { deviceId: "abc", socket: "s", port: 9001 };
    const newEntry = { deviceId: "abc", socket: "s", port: 9002 };
    registry.register(oldEntry, async () => { torn.push(oldEntry.port); });
    await registry.replace(newEntry, async () => { torn.push(newEntry.port); });
    assert.deepEqual(torn, [9001]);
    assert.deepEqual(registry.get("abc", "s"), newEntry);
  });

  it("teardownAll tears down every entry and clears the registry", async () => {
    const torn = [];
    registry.register({ deviceId: "a", socket: "s1", port: 1 }, async () => { torn.push(1); });
    registry.register({ deviceId: "a", socket: "s2", port: 2 }, async () => { torn.push(2); });
    registry.register({ deviceId: "b", socket: "s1", port: 3 }, async () => { torn.push(3); });
    await registry.teardownAll();
    assert.deepEqual(torn.sort(), [1, 2, 3]);
    assert.equal(registry.get("a", "s1"), undefined);
  });

  it("teardownAll swallows teardown errors so a bad entry can't block cleanup", async () => {
    const torn = [];
    registry.register({ deviceId: "a", socket: "s1", port: 1 }, async () => {
      throw new Error("boom");
    });
    registry.register({ deviceId: "a", socket: "s2", port: 2 }, async () => { torn.push(2); });
    await registry.teardownAll();
    assert.deepEqual(torn, [2]);
  });

  it("remove deletes an entry by device+socket without running its teardown", async () => {
    const torn = [];
    registry.register({ deviceId: "a", socket: "s", port: 1 }, async () => { torn.push(1); });
    registry.remove("a", "s");
    assert.equal(registry.get("a", "s"), undefined);
    await registry.teardownAll();
    assert.deepEqual(torn, []);
  });

  it("replace works correctly when no prior entry exists (no-op then install)", async () => {
    const torn = [];
    await registry.replace(
      { deviceId: "a", socket: "s", port: 1 },
      async () => { torn.push(1); }
    );
    assert.deepEqual(torn, []);
    assert.deepEqual(registry.get("a", "s"), { deviceId: "a", socket: "s", port: 1 });
  });
});
