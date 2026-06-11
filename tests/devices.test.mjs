import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDevicesOutput } from "../dist/devices.js";

describe("parseDevicesOutput", () => {
  it("returns [] when the header is missing", () => {
    assert.deepEqual(parseDevicesOutput(""), []);
    assert.deepEqual(parseDevicesOutput("garbage\n"), []);
  });

  it("returns [] when only the header is present", () => {
    assert.deepEqual(parseDevicesOutput("List of devices attached\n"), []);
  });

  it("skips the daemon banner lines", () => {
    const out = [
      "* daemon not running; starting now at tcp:5037",
      "* daemon started successfully",
      "List of devices attached",
      "emulator-5554          device product:sdk model:Pixel_6 device:emu transport_id:1",
      "",
    ].join("\n");
    const devs = parseDevicesOutput(out);
    assert.equal(devs.length, 1);
    assert.equal(devs[0].serial, "emulator-5554");
    assert.equal(devs[0].state, "device");
  });

  it("parses every key:value tail field", () => {
    const out =
      "List of devices attached\n" +
      "RFCN12345     device product:redfin model:Pixel_5 device:redfin transport_id:3 usb:1-2\n";
    const [d] = parseDevicesOutput(out);
    assert.equal(d.product, "redfin");
    assert.equal(d.model, "Pixel_5");
    assert.equal(d.device, "redfin");
    assert.equal(d.transportId, "3");
    assert.equal(d.usb, "1-2");
  });

  it("recognises every documented state", () => {
    const out = [
      "List of devices attached",
      "AAA device transport_id:1",
      "BBB unauthorized usb:1-2 transport_id:2",
      "CCC offline",
      "DDD recovery",
      "EEE sideload",
      "FFF bootloader",
      "GGG no permissions",
      "HHH something-weird",
    ].join("\n");
    const devs = parseDevicesOutput(out);
    assert.equal(devs.length, 8);
    assert.equal(devs.find((d) => d.serial === "AAA").state, "device");
    assert.equal(devs.find((d) => d.serial === "BBB").state, "unauthorized");
    assert.equal(devs.find((d) => d.serial === "CCC").state, "offline");
    assert.equal(devs.find((d) => d.serial === "DDD").state, "recovery");
    assert.equal(devs.find((d) => d.serial === "EEE").state, "sideload");
    assert.equal(devs.find((d) => d.serial === "FFF").state, "bootloader");
    assert.equal(devs.find((d) => d.serial === "GGG").state, "no permissions");
    assert.equal(devs.find((d) => d.serial === "HHH").state, "unknown");
  });

  it("preserves the raw line for surprising output", () => {
    const out = "List of devices attached\nXYZ something-weird extra junk\n";
    const [d] = parseDevicesOutput(out);
    assert.equal(d.state, "unknown");
    assert.match(d.raw, /something-weird extra junk/);
  });

  it("handles CRLF line endings", () => {
    const out =
      "List of devices attached\r\nAAA device transport_id:1\r\nBBB unauthorized transport_id:2\r\n";
    const devs = parseDevicesOutput(out);
    assert.equal(devs.length, 2);
    assert.equal(devs[0].state, "device");
    assert.equal(devs[1].state, "unauthorized");
  });

  it("does not match 'no' alone as a state", () => {
    // Edge: a line starting with "no" but where the second word isn't "permissions".
    const out = "List of devices attached\nXYZ no rotation device\n";
    const [d] = parseDevicesOutput(out);
    assert.equal(d.state, "unknown");
  });
});
