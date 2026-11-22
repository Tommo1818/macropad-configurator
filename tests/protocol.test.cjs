"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const P = require("../docs/protocol.js");

const bytes = (hex) => Uint8Array.from(hex.trim().split(/\s+/).map((part) => parseInt(part, 16)));
const array = (value) => Array.from(value);

function record(hex, total = 64) {
  const source = bytes(hex);
  const output = new Uint8Array(total);
  output.set(source);
  return output;
}

test("identify request is FB FB FB", () => {
  assert.deepEqual(array(P.identifyRequest()).slice(0, 3), [0xfb, 0xfb, 0xfb]);
});

test("identify reply is FB keys knobs", () => {
  assert.deepEqual(P.parseIdentify(record("fb 03 00")), { keys: 3, knobs: 0 });
});

test("read request carries keys, knobs and layer", () => {
  assert.deepEqual(array(P.readRequest(3, 0, 2)).slice(0, 4), [0xfa, 3, 0, 2]);
});

test("encode a key binding", () => {
  const result = P.encodeBinding(
    { kind: "key", steps: [{ mods: 1, code: 0x06 }], delay: 0 },
    2,
    1,
  );
  assert.equal(result.length, 64);
  assert.deepEqual(array(result).slice(0, 4), [0xfe, 2, 1, 1]);
  assert.equal(result[9], 1);
  assert.deepEqual(array(result).slice(10, 12), [1, 0x06]);
});

test("encode a macro binding", () => {
  const result = P.encodeBinding(
    {
      kind: "macro",
      steps: [
        { mods: 0, code: 0x04 },
        { mods: 2, code: 0x05 },
        { mods: 0, code: 0x06 },
      ],
    },
    1,
    2,
  );
  assert.equal(result[3], P.TYPE_KEYBOARD);
  assert.equal(result[9], 3);
  assert.deepEqual(array(result).slice(10, 16), [0, 0x04, 2, 0x05, 0, 0x06]);
});

test("macros are capped at 18 steps", () => {
  const steps = Array.from({ length: 25 }, () => ({ mods: 0, code: 0x04 }));
  const normalized = P.canonicalBinding({ kind: "macro", steps });
  assert.equal(normalized.steps.length, 18);
});

test("encode an empty binding", () => {
  const result = P.encodeBinding({ kind: "none" }, 3, 1);
  assert.deepEqual(array(result).slice(0, 4), [0xfe, 3, 1, 1]);
  assert.equal(result[9], 1);
  assert.deepEqual(array(result).slice(10, 12), [0, 0]);
});

test("encode media and mouse bindings", () => {
  const media = P.encodeBinding({ kind: "media", media: 0x00e9 }, 1, 1);
  assert.equal(media[3], P.TYPE_MEDIA);
  assert.deepEqual(array(media).slice(10, 12), [0xe9, 0x00]);

  const click = P.encodeBinding(
    { kind: "mouse", mouse: { action: "click", buttons: 1 } },
    1,
    1,
  );
  assert.equal(click[3], P.TYPE_MOUSE);
  assert.equal(click[9], P.MOUSE_CLICK);
  assert.equal(click[11], 1);

  const scroll = P.encodeBinding(
    { kind: "mouse", mouse: { action: "scroll", wheel: -2 } },
    1,
    1,
  );
  assert.equal(scroll[9], P.MOUSE_WHEEL);
  assert.equal(scroll[14], 0xfe);
});

test("delay is written little-endian", () => {
  const result = P.encodeDelay(2, 3, 1500);
  assert.deepEqual(array(result).slice(0, 6), [0xfe, 2, 3, 5, 0xdc, 0x05]);
  assert.equal(result[4] | (result[5] << 8), 1500);
});

test("delay is clamped to 6000 ms", () => {
  const result = P.encodeDelay(1, 1, 99999);
  assert.equal(result[4] | (result[5] << 8), P.MAX_DELAY);
});

test("LED record packs colour and mode", () => {
  const result = P.encodeLed(2, 4, 6);
  assert.deepEqual(array(result).slice(0, 4), [0xfe, 0xb0, 2, 8]);
  assert.equal(result[9], 1);
  assert.equal(result[10], 0);
  assert.equal(result[11], (6 << 4) | 4);
});

test("invalid lighting values are rejected", () => {
  assert.throws(() => P.encodeLed(1, 9, 1), /mode/);
  assert.throws(() => P.encodeLed(1, 1, 8), /colour/);
});

test("commit and separator bytes", () => {
  assert.deepEqual(array(P.commit()).slice(0, 3), [0xfd, 0xfe, 0xff]);
  assert.deepEqual(array(P.separator()).slice(0, 2), [0xaa, 0xaa]);
});

test("decode the hardware read vector", () => {
  const payload = record("fa 01 01 01 00 00 00 00 00 01 00 04");
  assert.deepEqual(P.decodeRecord(payload), {
    slot: 1,
    layer: 1,
    type: "binding",
    binding: { kind: "key", steps: [{ mods: 0, code: 4 }], delay: 0 },
  });
});

test("decode an empty binding", () => {
  const payload = record("fa 02 01 01 00 00 00 00 00 01 00 00");
  assert.equal(P.decodeRecord(payload).binding.kind, "none");
});

test("decode the inline delay as big-endian", () => {
  // Captured from hardware after writing 120 ms: bytes 4-5 are 00 78.
  const payload = record("fa 02 01 01 00 78 00 00 00 03 00 04 00 05 00 06");
  const decoded = P.decodeRecord(payload);
  assert.equal(decoded.binding.kind, "macro");
  assert.equal(decoded.binding.delay, 120);
  assert.equal(decoded.binding.steps.length, 3);
});

test("decode media with an inline delay", () => {
  // Hardware stores 300 ms as big-endian 01 2c.
  const payload = record("fa 03 01 02 01 2c 00 00 00 01 e9 00");
  const decoded = P.decodeRecord(payload);
  assert.equal(decoded.binding.kind, "media");
  assert.equal(decoded.binding.media, 0x00e9);
  assert.equal(decoded.binding.delay, 300);
});

test("decode a mouse scroll with a signed wheel value", () => {
  const payload = record("fa 01 01 03 00 00 00 00 00 04 00 00 00 00 fe");
  const decoded = P.decodeRecord(payload);
  assert.equal(decoded.binding.kind, "mouse");
  assert.equal(decoded.binding.mouse.action, "scroll");
  assert.equal(decoded.binding.mouse.wheel, -2);
});

test("decode a separate delay record (fallback layout)", () => {
  const payload = record("fa 01 01 05 dc 05 00 00 00 00 00 00");
  assert.deepEqual(P.decodeRecord(payload), { slot: 1, layer: 1, type: "delay", delay: 1500 });
});

test("binding signature ignores delay and normalizes key/macro", () => {
  const first = { kind: "key", steps: [{ mods: 0, code: 4 }], delay: 0 };
  const second = { kind: "key", steps: [{ mods: 0, code: 4 }], delay: 500 };
  const third = { kind: "macro", steps: [{ mods: 0, code: 4 }], delay: 0 };
  assert.equal(P.bindingSignature(first), P.bindingSignature(second));
  assert.equal(P.bindingSignature(first), P.bindingSignature(third));
});

test("mouse defaults match the action", () => {
  assert.equal(P.canonicalBinding({ kind: "mouse", mouse: { action: "click" } }).mouse.buttons, 1);
  assert.equal(P.canonicalBinding({ kind: "mouse", mouse: { action: "click", buttons: 0 } }).mouse.buttons, 1);
  assert.equal(P.canonicalBinding({ kind: "mouse", mouse: { action: "move" } }).mouse.buttons, 0);
  assert.equal(P.canonicalBinding({ kind: "mouse", mouse: { action: "scroll" } }).mouse.buttons, 0);
});

test("unknown kinds become none", () => {
  assert.deepEqual(P.canonicalBinding({ kind: "nope" }), { kind: "none", delay: 0 });
});

test("toHex is useful for logs", () => {
  assert.equal(P.toHex(Uint8Array.from([0, 15, 16, 255])), "00 0f 10 ff");
});
