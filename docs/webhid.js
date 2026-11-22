/*
 * WebHID transport for the CH57x macropad.
 *
 * WebHID only exists in Chromium-based desktop browsers and requires a secure
 * context (HTTPS, localhost, or 127.0.0.1). GitHub Pages is HTTPS, so the
 * deployed page can talk to the pad directly without a server.
 */
(function (root) {
  "use strict";

  const P = root.MacroProtocol;
  if (!P) throw new Error("protocol.js must be loaded before webhid.js");

  const VENDOR_ID = 0x514c;
  const PRODUCT_ID = 0x8851;
  const USAGE_PAGE = 0xff00;
  const USAGE = 0x01;
  const REPORT_ID = P.REPORT_ID;

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function clean(value) {
    return String(value || "").replace(/[^\x20-\x7e]/g, "").trim();
  }

  function bytesFromDataView(data) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  }

  class MacropadHID {
    constructor() {
      this.device = null;
      this.keys = 0;
      this.knobs = 0;
      this.info = {};
      this.onStatus = null;
      this._onDisconnect = null;
      this._lastLightWrite = 0;
    }

    static supported() {
      if (typeof navigator === "undefined" || !navigator.hid) return false;
      if (typeof window !== "undefined" && window.isSecureContext === false) return false;
      return true;
    }

    static get filters() {
      return [
        { vendorId: VENDOR_ID, productId: PRODUCT_ID, usagePage: USAGE_PAGE, usage: USAGE },
        { vendorId: VENDOR_ID, productId: PRODUCT_ID },
      ];
    }

    static isMacropad(device) {
      if (!device) return false;
      if (device.vendorId !== VENDOR_ID || device.productId !== PRODUCT_ID) return false;
      const collections = device.collections || [];
      if (!collections.length) return true;
      return collections.some((collection) => collection.usagePage === USAGE_PAGE);
    }

    get connected() {
      return Boolean(this.device && this.device.opened);
    }

    async grantedDevices() {
      if (!MacropadHID.supported()) return [];
      try {
        return await navigator.hid.getDevices();
      } catch (error) {
        return [];
      }
    }

    async requestDevice({ showAll = false } = {}) {
      if (!MacropadHID.supported()) {
        throw new Error("WebHID is not available. Open this page in Chrome or Edge on a desktop.");
      }
      const devices = await navigator.hid.requestDevice({
        filters: showAll ? [] : MacropadHID.filters,
      });
      if (!devices || !devices.length) {
        throw new Error("No device selected.");
      }
      const device = devices.find((item) => MacropadHID.isMacropad(item)) || devices[0];
      await this.connect(device);
      return this.info;
    }

    async autoConnect() {
      const devices = await this.grantedDevices();
      const device = devices.find((item) => MacropadHID.isMacropad(item));
      if (!device) return null;
      await this.connect(device);
      return this.info;
    }

    async connect(device) {
      if (!device) throw new Error("No device selected.");
      await this.disconnect();

      if (!device.opened) {
        try {
          await device.open();
        } catch (error) {
          throw new Error(
            `Could not open the macropad (${error.message || error.name}). ` +
              "Close any other tab or app that is using it and try again.",
          );
        }
      }

      this.device = device;
      this.info = {
        vendorId: device.vendorId,
        productId: device.productId,
        product: clean(device.productName) || "USB Keyboard",
        manufacturer: clean(device.manufacturerName) || "Generic",
        serial: clean(device.serialNumber),
        keys: 0,
        knobs: 0,
      };

      this._onDisconnect = () => {
        this.device = null;
        this.keys = 0;
        this.knobs = 0;
        if (this.onStatus) {
          this.onStatus({ connected: false, error: "The macropad was disconnected." });
        }
      };
      device.addEventListener("disconnect", this._onDisconnect);

      try {
        const identity = await this.identify();
        this.keys = identity.keys;
        this.knobs = identity.knobs;
        this.info.keys = identity.keys;
        this.info.knobs = identity.knobs;
      } catch (error) {
        await this.disconnect();
        throw error;
      }
      return this.info;
    }

    async disconnect() {
      const device = this.device;
      if (device) {
        try {
          if (this._onDisconnect) device.removeEventListener("disconnect", this._onDisconnect);
        } catch (error) {
          /* ignore */
        }
        try {
          await device.close();
        } catch (error) {
          /* already closed */
        }
      }
      this.device = null;
      this.keys = 0;
      this.knobs = 0;
      this._onDisconnect = null;
    }

    async send(payload) {
      if (!this.device) throw new Error("Macropad is not connected.");
      if (!payload || payload.length !== P.REPORT_SIZE) {
        throw new Error("Internal error: report must be 64 bytes.");
      }
      try {
        await this.device.sendReport(REPORT_ID, payload);
      } catch (error) {
        if (
          error.name === "NetworkError" ||
          error.name === "InvalidStateError" ||
          /not open|closed|disconnect/i.test(error.message || "")
        ) {
          this._onDisconnect?.();
        }
        throw new Error(`The macropad rejected the report: ${error.message || error.name}`);
      }
    }

    _startCollector(settle = 330, total = 2400) {
      const device = this.device;
      if (!device) throw new Error("Macropad is not connected.");

      const records = [];
      let resolvePromise;
      let finished = false;
      let timer = null;
      let last = performance.now();
      const started = last;

      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const onReport = (event) => {
        if (event.reportId !== REPORT_ID) return;
        records.push(bytesFromDataView(event.data));
        last = performance.now();
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try {
          device.removeEventListener("inputreport", onReport);
        } catch (error) {
          /* ignore */
        }
        resolvePromise(records);
      };

      const tick = () => {
        if (finished) return;
        const now = performance.now();
        if (this.device !== device || now - last >= settle || now - started >= total) {
          finish();
          return;
        }
        timer = setTimeout(tick, 25);
      };

      device.addEventListener("inputreport", onReport);
      timer = setTimeout(tick, 25);
      return { promise, cancel: finish };
    }

    async transact(payload, settle = 330, total = 2400) {
      const collector = this._startCollector(settle, total);
      try {
        await this.send(payload);
      } catch (error) {
        collector.cancel();
        throw error;
      }
      return collector.promise;
    }

    async identify() {
      const records = await this.transact(P.identifyRequest(), 250, 1200);
      for (const payload of records) {
        if (payload[0] === P.CMD_IDENTIFY) return P.parseIdentify(payload);
      }
      throw new Error(
        "The macropad did not answer. Check that it is plugged in, and that no other tab or app is using it.",
      );
    }

    async readLayer(layer) {
      if (!this.keys) throw new Error("The macropad reported no keys.");
      const records = await this.transact(P.readRequest(this.keys, this.knobs, layer), 330, 2400);
      const bindings = {};
      const delays = {};

      for (const payload of records) {
        if (payload[0] !== P.CMD_READ) continue;
        const record = P.decodeRecord(payload);
        if (!record || record.layer !== layer || record.slot > this.keys) continue;
        if (record.type === "delay") {
          delays[record.slot] = record.delay;
        } else if (record.type === "binding") {
          bindings[record.slot] = record.binding;
        }
      }

      for (const [slot, binding] of Object.entries(bindings)) {
        // Prefer the inline delay; the separate reply is a fallback.
        if (!binding.delay && delays[slot]) binding.delay = delays[slot];
      }
      return bindings;
    }

    async readAll() {
      const layers = {};
      for (let layer = 1; layer <= P.LAYER_COUNT; layer += 1) {
        layers[layer] = await this.readLayer(layer);
        if (layer < P.LAYER_COUNT) await sleep(60);
      }
      return layers;
    }

    async _commitSequence() {
      await this.send(P.separator());
      await sleep(15);
      await this.send(P.commit());
      await sleep(15);
      await this.send(P.separator());
    }

    async writeBinding(layer, slot, binding, { verify = true } = {}) {
      const normalized = P.canonicalBinding(binding);
      if (slot < 1 || slot > this.keys) {
        throw new Error(`Key ${slot} is outside this pad's ${this.keys} keys.`);
      }

      await this.send(P.encodeBinding(normalized, slot, layer));
      await sleep(15);
      await this.send(P.encodeDelay(slot, layer, normalized.delay || 0));
      await sleep(15);
      await this._commitSequence();
      await sleep(300);

      if (!verify) return { ...normalized, verified: false };

      const expected = P.bindingSignature(normalized);
      let lastSeen = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt) await sleep(220);
        const current = (await this.readLayer(layer))[slot];
        if (!current) continue;
        lastSeen = current;
        if (P.bindingSignature(current) === expected) {
          return {
            ...P.canonicalBinding(current),
            verified: true,
            delayVerified:
              !normalized.delay || Number(current.delay || 0) === Number(normalized.delay),
          };
        }
      }

      throw new Error(
        "The pad accepted the write, but reading it back gave a different binding. Nothing else was changed.",
      );
    }

    async writeLighting(layer, mode, colour) {
      P.encodeLed(layer, mode, colour); // validate before touching hardware
      const wait = 450 - (performance.now() - this._lastLightWrite);
      if (wait > 0) await sleep(wait);
      await this.send(P.encodeLed(layer, mode, colour));
      await sleep(15);
      await this.send(P.commit());
      this._lastLightWrite = performance.now();
      await sleep(160);
      return { mode: Number(mode), colour: Number(colour), known: true };
    }
  }

  root.MacropadHID = MacropadHID;
})(typeof globalThis !== "undefined" ? globalThis : this);
