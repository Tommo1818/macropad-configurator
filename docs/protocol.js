/*
 * CH57x / 514c:8851 wire protocol, ch57x-1 dialect.
 *
 * Payload offsets here follow the WebHID convention: byte 0 is the command
 * byte and there is no report id (the report id is passed separately to
 * sendReport). This is the same protocol documented for 1189:88xx pads.
 *
 * Only safe commands are implemented. The hardware-variant command (0xFC) and
 * the firmware-update command (0xEF) are intentionally absent.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MacroProtocol = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REPORT_ID = 0x03;
  const REPORT_SIZE = 64;

  const CMD_READ = 0xfa;
  const CMD_IDENTIFY = 0xfb;
  const CMD_COMMIT = 0xfd;
  const CMD_WRITE = 0xfe;
  const CMD_SEPARATOR = 0xaa;

  const TYPE_KEYBOARD = 1;
  const TYPE_MEDIA = 2;
  const TYPE_MOUSE = 3;
  const TYPE_DELAY = 5;
  const TYPE_LED = 8;

  const LED_SLOT = 0xb0;
  const MAX_STEPS = 18;
  const MAX_DELAY = 6000;
  const LAYER_COUNT = 3;

  const MOUSE_CLICK = 1;
  const MOUSE_WHEEL = 3;
  const MOUSE_WHEEL_READ = 4;
  const MOUSE_MOVE = 5;

  const LIGHT_MODES = {
    0: "Off",
    1: "Solid",
    2: "Wave forward",
    3: "Wave backward",
    4: "Reactive",
    5: "White",
  };

  const LIGHT_COLOURS = {
    0: "White",
    1: "Red",
    2: "Orange",
    3: "Yellow",
    4: "Green",
    5: "Cyan",
    6: "Blue",
    7: "Purple",
  };

  function clampInt(value, minimum, maximum, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
  }

  function signedByte(value) {
    return value > 127 ? value - 256 : value;
  }

  function byte(value) {
    return value & 0xff;
  }

  function canonicalBinding(binding) {
    if (!binding || !binding.kind || binding.kind === "none") {
      return { kind: "none", delay: 0 };
    }

    const delay = clampInt(binding.delay, 0, MAX_DELAY, 0);

    if (binding.kind === "key" || binding.kind === "macro") {
      const steps = (Array.isArray(binding.steps) ? binding.steps : [])
        .slice(0, MAX_STEPS)
        .map((step) => ({
          mods: clampInt(step?.mods, 0, 255, 0),
          code: clampInt(step?.code, 0, 255, 0),
        }))
        .filter((step) => step.code > 0);
      if (!steps.length) return { kind: "none", delay: 0 };
      return {
        kind: steps.length === 1 ? "key" : "macro",
        steps,
        delay,
      };
    }

    if (binding.kind === "media") {
      return {
        kind: "media",
        media: clampInt(binding.media, 0, 0xffff, 0),
        delay,
      };
    }

    if (binding.kind === "mouse") {
      const source = binding.mouse || {};
      const action = ["click", "scroll", "move"].includes(source.action) ? source.action : "click";
      let buttons = clampInt(source.buttons, 0, 7, action === "click" ? 1 : 0);
      if (action === "click" && buttons === 0) buttons = 1;
      return {
        kind: "mouse",
        mouse: {
          action,
          buttons,
          mods: clampInt(source.mods, 0, 255, 0),
          dx: clampInt(source.dx, -127, 127, 0),
          dy: clampInt(source.dy, -127, 127, 0),
          wheel: clampInt(source.wheel, -127, 127, 1),
        },
        delay,
      };
    }

    return { kind: "none", delay: 0 };
  }

  function emptyRecord(command) {
    const record = new Uint8Array(REPORT_SIZE);
    record[0] = command;
    return record;
  }

  function encodeBinding(binding, slot, layer) {
    const normalized = canonicalBinding(binding);
    const record = emptyRecord(CMD_WRITE);
    record[1] = clampInt(slot, 0, 255, 1);
    record[2] = clampInt(layer, 1, LAYER_COUNT, 1);

    if (normalized.kind === "none") {
      record[3] = TYPE_KEYBOARD;
      record[9] = 1;
      record[10] = 0;
      record[11] = 0;
      return record;
    }

    if (normalized.kind === "key" || normalized.kind === "macro") {
      record[3] = TYPE_KEYBOARD;
      record[9] = normalized.steps.length;
      normalized.steps.forEach((step, index) => {
        record[10 + index * 2] = step.mods;
        record[11 + index * 2] = step.code;
      });
      return record;
    }

    if (normalized.kind === "media") {
      record[3] = TYPE_MEDIA;
      record[9] = 0;
      record[10] = normalized.media & 0xff;
      record[11] = (normalized.media >> 8) & 0xff;
      return record;
    }

    const mouse = normalized.mouse;
    record[3] = TYPE_MOUSE;
    record[10] = mouse.mods;
    record[11] = mouse.buttons;
    if (mouse.action === "click") {
      record[9] = MOUSE_CLICK;
    } else if (mouse.action === "scroll") {
      record[9] = MOUSE_WHEEL;
      record[14] = byte(mouse.wheel);
    } else {
      record[9] = MOUSE_MOVE;
      record[12] = byte(mouse.dx);
      record[13] = byte(mouse.dy);
    }
    return record;
  }

  function encodeDelay(slot, layer, milliseconds) {
    const value = clampInt(milliseconds, 0, MAX_DELAY, 0);
    const record = emptyRecord(CMD_WRITE);
    record[1] = clampInt(slot, 0, 255, 1);
    record[2] = clampInt(layer, 1, LAYER_COUNT, 1);
    record[3] = TYPE_DELAY;
    // Write side is little-endian; the firmware stores it big-endian and
    // returns it inline in the binding record (see decodeRecord).
    record[4] = value & 0xff;
    record[5] = (value >> 8) & 0xff;
    return record;
  }

  function encodeLed(layer, mode, colour) {
    const modeNumber = Number(mode);
    const colourNumber = Number(colour);
    if (!(modeNumber in LIGHT_MODES)) throw new Error("lighting mode must be 0-5");
    if (!(colourNumber in LIGHT_COLOURS)) throw new Error("lighting colour must be 0-7");
    const record = emptyRecord(CMD_WRITE);
    record[1] = LED_SLOT;
    record[2] = clampInt(layer, 1, LAYER_COUNT, 1);
    record[3] = TYPE_LED;
    record[9] = 1;
    record[10] = 0;
    record[11] = (colourNumber << 4) | modeNumber;
    return record;
  }

  function separator() {
    const record = emptyRecord(CMD_SEPARATOR);
    record[1] = CMD_SEPARATOR;
    return record;
  }

  function commit() {
    const record = emptyRecord(CMD_COMMIT);
    record[1] = 0xfe;
    record[2] = 0xff;
    return record;
  }

  function identifyRequest() {
    const record = emptyRecord(CMD_IDENTIFY);
    record[1] = CMD_IDENTIFY;
    record[2] = CMD_IDENTIFY;
    return record;
  }

  function readRequest(keys, knobs, layer) {
    const record = emptyRecord(CMD_READ);
    record[1] = clampInt(keys, 0, 255, 0);
    record[2] = clampInt(knobs, 0, 255, 0);
    record[3] = clampInt(layer, 1, LAYER_COUNT, 1);
    return record;
  }

  function parseIdentify(payload) {
    if (!payload || payload.length < 3 || payload[0] !== CMD_IDENTIFY) {
      throw new Error("The device did not answer the identify command.");
    }
    return { keys: payload[1], knobs: payload[2] };
  }

  function decodeRecord(payload) {
    if (!payload || payload.length < 12 || payload[0] !== CMD_READ) return null;

    const slot = payload[1];
    const layer = payload[2];
    const type = payload[3];
    // Measured on hardware: the firmware returns the delay inline as a
    // big-endian 16-bit value at bytes 4-5, even though it is written
    // little-endian in a separate type-5 record.
    const inlineDelay = (payload[4] << 8) | payload[5];

    if (type === TYPE_DELAY) {
      // Fallback for firmware that reports a separate delay record. The
      // documented read layout is little-endian.
      return { slot, layer, type: "delay", delay: payload[4] | (payload[5] << 8) };
    }

    if (type === TYPE_KEYBOARD) {
      const count = payload[9];
      const steps = [];
      for (let index = 0; index < Math.min(count, MAX_STEPS); index += 1) {
        const offset = 10 + index * 2;
        if (offset + 1 >= payload.length) break;
        steps.push({ mods: payload[offset], code: payload[offset + 1] });
      }
      let binding;
      if (!steps.length || (steps.length === 1 && steps[0].code === 0 && steps[0].mods === 0)) {
        binding = { kind: "none", delay: inlineDelay };
      } else if (steps.length === 1) {
        binding = { kind: "key", steps, delay: inlineDelay };
      } else {
        binding = { kind: "macro", steps, delay: inlineDelay };
      }
      return { slot, layer, type: "binding", binding };
    }

    if (type === TYPE_MEDIA) {
      return {
        slot,
        layer,
        type: "binding",
        binding: {
          kind: "media",
          media: payload[10] | (payload[11] << 8),
          delay: inlineDelay,
        },
      };
    }

    if (type === TYPE_MOUSE) {
      const action = payload[9];
      const mouse = {
        buttons: payload[11] & 0x07,
        mods: payload[10],
        dx: signedByte(payload[12]),
        dy: signedByte(payload[13]),
        wheel: signedByte(payload[14]),
      };
      if (action === MOUSE_WHEEL || action === MOUSE_WHEEL_READ) mouse.action = "scroll";
      else if (action === MOUSE_MOVE) mouse.action = "move";
      else mouse.action = "click";
      return {
        slot,
        layer,
        type: "binding",
        binding: { kind: "mouse", mouse, delay: inlineDelay },
      };
    }

    if (type === TYPE_LED) {
      return {
        slot,
        layer,
        type: "led",
        mode: payload[11] & 0x0f,
        colour: (payload[11] >> 4) & 0x0f,
      };
    }

    return { slot, layer, type: "unknown", rawKind: type };
  }

  function bindingSignature(binding) {
    const normalized = canonicalBinding(binding);
    delete normalized.delay;
    return JSON.stringify(normalized);
  }

  function toHex(payload) {
    return Array.from(payload || [], (value) => value.toString(16).padStart(2, "0")).join(" ");
  }

  return {
    REPORT_ID,
    REPORT_SIZE,
    CMD_READ,
    CMD_IDENTIFY,
    CMD_COMMIT,
    CMD_WRITE,
    CMD_SEPARATOR,
    TYPE_KEYBOARD,
    TYPE_MEDIA,
    TYPE_MOUSE,
    TYPE_DELAY,
    TYPE_LED,
    LED_SLOT,
    MAX_STEPS,
    MAX_DELAY,
    LAYER_COUNT,
    MOUSE_CLICK,
    MOUSE_WHEEL,
    MOUSE_MOVE,
    LIGHT_MODES,
    LIGHT_COLOURS,
    canonicalBinding,
    encodeBinding,
    encodeDelay,
    encodeLed,
    separator,
    commit,
    identifyRequest,
    readRequest,
    parseIdentify,
    decodeRecord,
    bindingSignature,
    toHex,
  };
});
