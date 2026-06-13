import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseMdnsServices } from "../dist/mdns.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFile(resolve(__dirname, "fixtures", "mdns", name), "utf8");

describe("parseMdnsServices", () => {
  it("returns empty arrays for an empty service list", async () => {
    const r = parseMdnsServices(await fx("empty.txt"));
    assert.deepEqual(r.pairing, []);
    assert.deepEqual(r.connect, []);
    assert.equal(r.daemonAvailable, true);
  });

  it("parses a single pairing service", async () => {
    const r = parseMdnsServices(await fx("pairing-only.txt"));
    assert.equal(r.pairing.length, 1);
    assert.equal(r.pairing[0].serviceName, "fling-debug-7f3a");
    assert.equal(r.pairing[0].host, "192.168.1.42");
    assert.equal(r.pairing[0].port, 43581);
    assert.deepEqual(r.connect, []);
  });

  it("parses a single connect service", async () => {
    const r = parseMdnsServices(await fx("connect-only.txt"));
    assert.equal(r.connect.length, 1);
    assert.equal(r.connect[0].serviceName, "adb-RFCN1234ABC-AbCdEf");
    assert.equal(r.connect[0].host, "192.168.1.42");
    assert.equal(r.connect[0].port, 38291);
  });

  it("parses both service types and ignores unrelated services", async () => {
    const r = parseMdnsServices(await fx("both.txt"));
    assert.equal(r.pairing.length, 1);
    assert.equal(r.connect.length, 1);
  });

  it("flags daemonAvailable=false on the ERROR line", async () => {
    const r = parseMdnsServices(await fx("daemon-unavailable.txt"));
    assert.equal(r.daemonAvailable, false);
    assert.deepEqual(r.pairing, []);
    assert.deepEqual(r.connect, []);
  });

  it("handles malformed lines gracefully", () => {
    const r = parseMdnsServices("List of discovered mdns services\ngarbage\n\nsvc _missing_tabs\n");
    assert.deepEqual(r.pairing, []);
    assert.deepEqual(r.connect, []);
  });
});
