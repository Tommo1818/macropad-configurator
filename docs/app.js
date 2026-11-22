/* Macropad Configurator - browser app. */

(() => {
  "use strict";

  const P = window.MacroProtocol;
  const hid = new window.MacropadHID();
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const VIEW_META = {
    bindings: {
      title: "Key bindings",
      subtitle: "Assign shortcuts, macros, media and mouse actions.",
    },
    lighting: {
      title: "Lighting",
      subtitle: "Pick an effect and colour for each layer.",
    },
    backup: {
      title: "Backups",
      subtitle: "Snapshots and restore points for your pad.",
    },
  };

  const KIND_LABELS = {
    key: "Key",
    macro: "Macro",
    media: "Media",
    mouse: "Mouse",
    none: "Unused",
  };

  const COLOURS = [
    { id: 1, name: "Red", hex: "#ff0000" },
    { id: 2, name: "Orange", hex: "#ff803c" },
    { id: 3, name: "Yellow", hex: "#ffff3c" },
    { id: 4, name: "Green", hex: "#00ff00" },
    { id: 5, name: "Cyan", hex: "#00ffff" },
    { id: 6, name: "Blue", hex: "#0000ff" },
    { id: 7, name: "Purple", hex: "#800080" },
    { id: 0, name: "White", hex: "#ffffff" },
  ];

  const COLOUR_BY_ID = new Map(COLOURS.map((colour) => [colour.id, colour]));

  const EFFECTS = [
    {
      id: 0,
      name: "Off",
      headline: "Backlight off",
      description: "The keys stay dark until you choose another effect.",
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M5.5 18.5 18.5 5.5"/></svg>',
    },
    {
      id: 1,
      name: "Solid",
      headline: "Steady colour",
      description: "All three keys stay lit in the selected colour.",
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/></svg>',
    },
    {
      id: 2,
      name: "Wave forward",
      tag: "Press + release",
      headline: "Forward wave",
      description: "Firmware wave. It fires on both key-down and key-up.",
      icon: '<svg viewBox="0 0 24 24"><path d="M3 15c2.5-5 4.5-5 7 0s4.5 5 7 0"/><path d="M17 5.5 20.5 9 17 12.5"/></svg>',
    },
    {
      id: 3,
      name: "Wave backward",
      tag: "Press + release",
      headline: "Reverse wave",
      description: "The same firmware wave, running right to left. It fires on press and release.",
      icon: '<svg viewBox="0 0 24 24"><path d="M21 15c-2.5-5-4.5-5-7 0s-4.5 5-7 0"/><path d="M7 5.5 3.5 9 7 12.5"/></svg>',
    },
    {
      id: 4,
      name: "Reactive (firmware)",
      tag: "Press + release",
      headline: "Reactive lighting",
      description: "Firmware reactive mode. On this pad it can also flash when the key is released.",
      icon: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3"/><path d="M12 9.5v3M12 15.5h.01"/></svg>',
    },
    {
      id: 5,
      name: "White",
      headline: "Steady white",
      description: "All keys lit white. The colour setting is ignored.",
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
    },
  ];

  const BACKUP_KEY = "macropad-configurator.backups.v1";
  const BACKUP_LIMIT = 30;

  const state = {
    data: blankData(),
    view: "bindings",
    layer: 1,
    selectedSlot: null,
    draft: null,
    capturing: false,
    identify: false,
    lightingDraft: {},
    modal: null,
    confirmResolver: null,
    busy: false,
  };

  // ------------------------------------------------------------------ helpers

  function blankData(error = null) {
    return { connected: false, cached: false, device: {}, layers: {}, error };
  }

  function canonical(binding) {
    return P.canonicalBinding(binding);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        default: return "&#39;";
      }
    });
  }

  function clampNumber(value, minimum, maximum, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function bindingAt(layer, slot) {
    const layers = state.data?.layers || {};
    const layerData = layers[String(layer)] || layers[layer] || {};
    return canonical(layerData[String(slot)] || layerData[slot] || { kind: "none" });
  }

  function setBindingLocal(layer, slot, binding) {
    if (!state.data.layers) state.data.layers = {};
    const layerKey = String(layer);
    if (!state.data.layers[layerKey]) state.data.layers[layerKey] = {};
    state.data.layers[layerKey][String(slot)] = canonical(binding);
  }

  function isConnected() {
    return Boolean(state.data?.connected);
  }

  function keyCount() {
    return Number(state.data?.device?.keys || 3);
  }

  function knobCount() {
    return Number(state.data?.device?.knobs || 0);
  }

  function safeProductName(info) {
    const raw = String(info?.product || info?.productName || "").replace(/[^\x20-\x7e]/g, "").trim();
    if (!raw || /^usb keyboard/i.test(raw)) return "USB Keyboard";
    return raw;
  }

  function hexId(value, fallback) {
    return Number(value ?? fallback).toString(16).padStart(4, "0").toUpperCase();
  }

  function isDirty() {
    if (!state.draft || state.selectedSlot == null) return false;
    return JSON.stringify(canonical(state.draft)) !== JSON.stringify(bindingAt(state.layer, state.selectedSlot));
  }

  function kindLabel(kind) {
    return KIND_LABELS[kind] || "Unknown";
  }

  function toast(message, type = "info") {
    const stack = $("#toast-stack");
    if (!stack) return;
    const element = document.createElement("div");
    element.className = `toast ${type}`;
    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = type === "success" ? "✓" : type === "error" ? "!" : "i";
    const text = document.createElement("span");
    text.textContent = message;
    element.append(icon, text);
    stack.append(element);
    window.setTimeout(() => {
      element.classList.add("leaving");
      window.setTimeout(() => element.remove(), 230);
    }, 4800);
  }

  function setBusy(button, busy) {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.classList.add("busy");
      button.disabled = true;
    } else {
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
      button.classList.remove("busy");
      button.disabled = false;
    }
  }

  function formatDate(value) {
    if (!value) return "Unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  function resetLightingState() {
    for (let layer = 1; layer <= 3; layer += 1) {
      state.lightingDraft[layer] = { mode: 1, colour: 1, known: false, touched: false };
    }
  }

  // -------------------------------------------------------------- connection

  function updateConnectButton() {
    const button = $("#connect-btn");
    if (!button) return;
    const problem = webHidProblem();
    if (problem) {
      button.textContent = window.isSecureContext === false ? "HTTPS needed" : "Unsupported";
      button.classList.remove("primary");
      button.classList.add("ghost");
      button.disabled = true;
      return;
    }
    const connected = isConnected();
    button.textContent = connected ? "Refresh" : "Connect";
    button.classList.toggle("primary", !connected);
    button.classList.toggle("ghost", connected);
    button.disabled = state.busy;
  }

  function webHidProblem() {
    if (window.isSecureContext === false) {
      return "WebHID needs a secure context. Open this page over HTTPS or localhost (run start.py for local use).";
    }
    if (typeof navigator === "undefined" || !navigator.hid) {
      return "WebHID isn't available in this browser. Open the page in Chrome or Edge on a desktop.";
    }
    return null;
  }

  function markOffline(message) {
    state.data.connected = false;
    state.data.cached = Boolean(state.data.layers && Object.keys(state.data.layers).length);
    state.data.error = message || "The macropad is not connected.";
    state.capturing = false;
    renderDeviceCard();
    renderConnection();
    renderEditor();
    updateConnectButton();
  }

  async function connectDevice(showAll = false) {
    const problem = webHidProblem();
    if (problem) {
      toast(problem, "error");
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const button = $("#connect-btn");
    setBusy(button, true);
    try {
      const info = await hid.requestDevice({ showAll });
      const layers = await hid.readAll();
      state.data = { connected: true, cached: false, device: info, layers, error: null };
      resetLightingState();
      ensureSelection();
      resetDraft();
      renderAll();
      toast(`Connected: ${safeProductName(info)} · ${info.keys} keys.`, "success");
      if (state.view === "backup") loadBackups();
    } catch (error) {
      if (error.name === "NotFoundError" || /no device selected/i.test(error.message || "")) {
        toast("No device selected.", "info");
      } else {
        toast(error.message, "error");
        markOffline(error.message);
      }
    } finally {
      state.busy = false;
      setBusy(button, false);
      updateConnectButton();
    }
  }

  async function refreshDevice(silent = false) {
    if (!isConnected()) {
      await connectDevice(false);
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const button = $("#connect-btn");
    setBusy(button, true);
    try {
      const layers = await hid.readAll();
      state.data.layers = layers;
      state.data.connected = true;
      state.data.error = null;
      ensureSelection();
      resetDraft();
      renderAll();
      if (!silent) toast("Configuration re-read from the pad.", "success");
      if (state.view === "backup") loadBackups();
    } catch (error) {
      toast(error.message, "error");
      if (!hid.connected) markOffline(error.message);
    } finally {
      state.busy = false;
      setBusy(button, false);
      updateConnectButton();
    }
  }

  async function boot() {
    // Keep the Connect button disabled while the silent auto-connect runs so a
    // click cannot start a second device request mid-read.
    state.busy = true;
    updateConnectButton();
    try {
      const problem = webHidProblem();
      if (problem) {
        state.data = blankData(problem);
        renderAll();
        return;
      }
      try {
        const info = await hid.autoConnect();
        if (info) {
          const layers = await hid.readAll();
          state.data = { connected: true, cached: false, device: info, layers, error: null };
          resetLightingState();
          ensureSelection();
          resetDraft();
          renderAll();
          toast("Macropad connected.", "success");
        } else {
          state.data = blankData();
          renderAll();
        }
      } catch (error) {
        state.data = blankData(error.message);
        renderAll();
      }
    } finally {
      state.busy = false;
      updateConnectButton();
    }
  }

  // ---------------------------------------------------------------- rendering

  function renderAll() {
    renderDeviceCard();
    renderConnection();
    renderLayer();
    renderBindings();
    renderLighting();
    renderRawConfig();
    updateConnectButton();
  }

  function renderDeviceCard() {
    const data = state.data || blankData();
    const info = data.device || {};
    const problem = webHidProblem();
    const card = $("#device-card");
    if (!card) return;

    card.classList.toggle("connected", Boolean(data.connected));
    card.classList.toggle("error", Boolean(!data.connected && data.error));
    card.title = data.connected ? "Connected" : "Connect the macropad";

    let name;
    if (data.connected) name = safeProductName(info);
    else if (problem) name = "Browser unsupported";
    else if (data.cached) name = "Macropad offline";
    else name = "Macropad not connected";

    let meta;
    if (data.connected) {
      meta = `${hexId(info.vendorId, 0x514c)}:${hexId(info.productId, 0x8851)} · ${keyCount()} keys${knobCount() ? ` · ${knobCount()} knobs` : ""}`;
    } else if (problem) {
      meta = window.isSecureContext === false ? "Open over HTTPS or localhost" : "Use Chrome or Edge on desktop";
    } else if (data.cached) {
      meta = "Showing the last configuration read";
    } else {
      meta = "WebHID · usage page 0xFF00";
    }

    $("#device-name").textContent = name;
    $("#device-meta").textContent = meta;
    $("#version-label").textContent = "WebHID";
  }

  function renderConnection() {
    const pill = $("#connection-pill");
    const text = $("#connection-text");
    if (!pill || !text) return;
    const problem = webHidProblem();
    let className = "connection-pill";
    let label = "Not connected";
    if (problem) {
      className += " error";
      label = window.isSecureContext === false ? "HTTPS needed" : "Chrome/Edge needed";
    } else if (state.data?.connected) {
      className += " connected";
      label = "Connected";
    } else if (state.data?.error) {
      className += " error";
      label = state.data?.cached ? "Disconnected" : "Not connected";
    }
    pill.className = className;
    text.textContent = label;
  }

  function renderLayer() {
    $$("#layer-tabs button").forEach((button) => {
      const active = Number(button.dataset.layer) === state.layer;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    const lightingLayer = $("#lighting-layer-label");
    const applyLayer = $("#apply-layer-label");
    if (lightingLayer) lightingLayer.textContent = state.layer;
    if (applyLayer) applyLayer.textContent = state.layer;
    const note = $("#layer-note");
    if (note) note.textContent = `Editing layer ${state.layer} · the pad's hardware button chooses the live layer`;
    const caption = $("#pad-caption");
    if (caption) caption.textContent = `Layer ${state.layer} · click a key to edit`;
  }

  function ensureSelection() {
    const count = keyCount();
    if (!count) {
      state.selectedSlot = null;
      return;
    }
    if (state.selectedSlot == null || state.selectedSlot < 1 || state.selectedSlot > count) {
      state.selectedSlot = 1;
    }
  }

  function resetDraft() {
    if (state.selectedSlot == null) {
      state.draft = null;
      return;
    }
    state.draft = canonical(bindingAt(state.layer, state.selectedSlot));
  }

  function renderBindings() {
    ensureSelection();
    const keys = keyCount();
    const container = $("#pad-keys");
    if (!container) return;

    let html = "";
    const offlinePlaceholder = !isConnected() && !state.data.cached;
    for (let slot = 1; slot <= keys; slot += 1) {
      const binding = bindingAt(state.layer, slot);
      const selected = state.selectedSlot === slot;
      const label = offlinePlaceholder ? "—" : formatBinding(binding, { short: true });
      const kindText = offlinePlaceholder ? "Connect" : kindLabel(binding.kind);
      html += `
        <button type="button" class="keycap ${selected ? "selected" : ""} ${offlinePlaceholder || binding.kind === "none" ? "empty" : ""}"
          data-slot="${slot}" title="${escapeHtml(offlinePlaceholder ? "Connect to read this key" : formatBinding(binding))}" aria-pressed="${selected ? "true" : "false"}">
          <span class="cap-index">${slot}</span>
          <span class="cap-label">${escapeHtml(label)}</span>
          <span class="cap-kind">${kindText}</span>
        </button>`;
    }
    container.innerHTML = html;

    const badge = $("#pad-badge");
    if (badge) badge.textContent = `${keys} keys${knobCount() ? ` · ${knobCount()} knobs` : ""}`;

    renderEditor();
  }

  function renderEditor() {
    const panel = $("#editor-panel");
    if (!panel) return;

    const problem = webHidProblem();
    if (problem) {
      panel.innerHTML = `
        <div class="offline-card">
          <h3>This browser can't talk to HID devices</h3>
          <p>${escapeHtml(problem)}</p>
          <p>The app is fully client-side, so on GitHub Pages it talks to the macropad without a server.</p>
        </div>`;
      return;
    }

    if (!isConnected()) {
      const error = state.data?.error || "Plug the macropad in, then connect.";
      panel.innerHTML = `
        <div class="offline-card">
          <h3>Macropad not connected</h3>
          <p>${escapeHtml(error)}</p>
          <p>These pads need a data cable; many fail to enumerate with a C-to-C cable. An A-to-C cable is the reliable choice.</p>
          <div class="row">
            <button type="button" class="btn primary tiny" id="editor-connect">Connect</button>
            <button type="button" class="btn ghost tiny" id="editor-show-all">Show all HID devices</button>
          </div>
        </div>`;
      $("#editor-connect")?.addEventListener("click", () => connectDevice(false));
      $("#editor-show-all")?.addEventListener("click", () => connectDevice(true));
      return;
    }

    if (state.selectedSlot == null) {
      panel.innerHTML = `
        <div class="empty-editor">
          <div class="empty-icon">⌨</div>
          <h3>Select a key</h3>
          <p class="muted">Choose one of the keys above to change what it does.</p>
        </div>`;
      return;
    }

    if (!state.draft) resetDraft();
    const draft = state.draft;
    const dirty = isDirty();
    const current = bindingAt(state.layer, state.selectedSlot);

    panel.innerHTML = `
      <div class="editor-head">
        <div class="key-chip">${state.selectedSlot}</div>
        <div>
          <h3>Key ${state.selectedSlot}</h3>
          <p id="editor-status">Layer ${state.layer} · ${dirty ? "Unsaved changes" : "Saved on the pad"}</p>
        </div>
      </div>
      <div class="kind-tabs" role="tablist" aria-label="Binding type">
        ${["key", "macro", "media", "mouse", "none"].map((kind) => `
          <button type="button" data-kind="${kind}" class="${draft.kind === kind ? "active" : ""}" role="tab" aria-selected="${draft.kind === kind ? "true" : "false"}">${kindLabel(kind)}</button>
        `).join("")}
      </div>
      ${renderKindEditor()}
      ${draft.kind === "none" ? "" : renderDelayField()}
      <div class="editor-actions">
        <button type="button" class="btn ghost" data-action="revert" ${dirty ? "" : "disabled"}>Revert</button>
        <button type="button" class="btn primary" id="save-binding" data-action="save" ${dirty ? "" : "disabled"}>Save to macropad</button>
      </div>`;

    wireEditorEvents();
    if (!dirty) {
      const status = $("#editor-status");
      if (status && current.kind !== "none") {
        status.textContent = `Layer ${state.layer} · Saved · ${formatBinding(current)}`;
      }
    }
  }

  function renderKindEditor() {
    const draft = state.draft;
    if (!draft) return "";

    if (draft.kind === "key") {
      const step = draft.steps?.[0] || { mods: 0, code: 0x04 };
      return `
        <div class="field">
          <label>Shortcut</label>
          <button type="button" class="shortcut-button ${state.capturing ? "capturing" : ""}" data-action="toggle-capture">
            <span class="shortcut-text">${state.capturing ? "Listening…" : escapeHtml(formatShortcut(step))}</span>
            <span class="shortcut-sub">${state.capturing ? "Press the key combination on your keyboard" : "Click to record a shortcut"}</span>
          </button>
        </div>
        <div class="row">
          <button type="button" class="btn ghost tiny" data-action="browse-keys">Browse all keys</button>
        </div>`;
    }

    if (draft.kind === "macro") {
      const steps = draft.steps || [];
      const rows = steps.map((step, index) => `
        <div class="macro-step">
          <span class="step-index">${index + 1}</span>
          <span class="step-key">${escapeHtml(formatShortcut(step))}</span>
          <button type="button" class="btn ghost tiny" data-action="edit-step" data-index="${index}" title="Edit this step">Edit</button>
          <button type="button" class="btn ghost tiny" data-action="remove-step" data-index="${index}" title="Remove this step">×</button>
        </div>`).join("");
      return `
        <div class="field">
          <label>Macro steps <span class="muted">(${steps.length}/18)</span></label>
          <div class="macro-steps">${rows || '<div class="macro-empty">No steps yet. Add the first one below.</div>'}</div>
          <div class="row">
            <button type="button" class="btn ghost tiny" data-action="add-step" ${steps.length >= 18 ? "disabled" : ""}>+ Add step</button>
          </div>
        </div>
        <p class="help">The pad types up to 18 key combinations in order.</p>`;
    }

    if (draft.kind === "media") {
      const current = Number(draft.media ?? 0x00e9);
      const known = MEDIA_BY_USAGE.has(current);
      const options = MEDIA_KEYS.map((media) => `
        <option value="${media.usage}" ${current === media.usage ? "selected" : ""}>${escapeHtml(media.name)}</option>
      `).join("");
      const custom = known ? "" : `<option value="${current}" selected>Usage 0x${current.toString(16).padStart(4, "0").toUpperCase()}</option>`;
      return `
        <div class="field">
          <label>Media action</label>
          <select data-role="media-select">${custom}${options}</select>
        </div>
        <div class="row"><span class="badge">${escapeHtml(mediaName(current))}</span></div>`;
    }

    if (draft.kind === "mouse") {
      const mouse = draft.mouse;
      const actionButtons = ["click", "scroll", "move"].map((action) => `
        <button type="button" data-action="mouse-action" data-mouse-action="${action}" class="${mouse.action === action ? "active" : ""}">
          ${action[0].toUpperCase() + action.slice(1)}
        </button>`).join("");

      let options = "";
      if (mouse.action === "click") {
        const custom = [1, 2, 4].includes(mouse.buttons)
          ? ""
          : `<option value="${mouse.buttons}" selected>Buttons ${mouse.buttons}</option>`;
        options = `
          <div class="field">
            <label>Button</label>
            <select data-role="mouse-buttons">
              ${custom}
              <option value="1" ${mouse.buttons === 1 ? "selected" : ""}>Left</option>
              <option value="2" ${mouse.buttons === 2 ? "selected" : ""}>Right</option>
              <option value="4" ${mouse.buttons === 4 ? "selected" : ""}>Middle</option>
            </select>
          </div>`;
      } else if (mouse.action === "scroll") {
        const amount = Math.abs(mouse.wheel) || 1;
        options = `
          <div class="row">
            <div class="field" style="flex:1;margin:0">
              <label>Direction</label>
              <select data-role="mouse-direction">
                <option value="up" ${mouse.wheel >= 0 ? "selected" : ""}>Up</option>
                <option value="down" ${mouse.wheel < 0 ? "selected" : ""}>Down</option>
              </select>
            </div>
            <div class="field" style="flex:1;margin:0">
              <label>Amount</label>
              <input type="number" data-role="mouse-amount" min="1" max="10" value="${amount}">
            </div>
          </div>`;
      } else {
        options = `
          <div class="row">
            <div class="field" style="flex:1;margin:0">
              <label>X distance</label>
              <input type="number" data-role="mouse-dx" min="-127" max="127" value="${mouse.dx}">
            </div>
            <div class="field" style="flex:1;margin:0">
              <label>Y distance</label>
              <input type="number" data-role="mouse-dy" min="-127" max="127" value="${mouse.dy}">
            </div>
          </div>`;
      }

      return `
        <div class="field">
          <label>Mouse action</label>
          <div class="segmented wide">${actionButtons}</div>
        </div>
        ${options}`;
    }

    return `<div class="macro-empty">This key will send nothing when pressed.</div>`;
  }

  function renderDelayField() {
    const delay = Number(state.draft?.delay || 0);
    return `
      <div class="field">
        <label for="delay-input">Delay after action</label>
        <div class="delay-row">
          <div class="input-suffix">
            <input id="delay-input" type="number" min="0" max="6000" step="50" value="${delay}">
            <span>ms</span>
          </div>
          <span class="help">Wait after this binding runs (0–6000 ms).</span>
        </div>
      </div>`;
  }

  function wireEditorEvents() {
    const panel = $("#editor-panel");
    if (!panel || !state.draft) return;

    $$(".kind-tabs button", panel).forEach((button) => {
      button.addEventListener("click", () => setKind(button.dataset.kind));
    });

    panel.querySelector('[data-action="toggle-capture"]')?.addEventListener("click", () => {
      state.capturing = !state.capturing;
      renderEditor();
      if (state.capturing) toast("Press the key combination you want on this key.", "info");
    });

    panel.querySelector('[data-action="browse-keys"]')?.addEventListener("click", () => {
      const step = state.draft.steps?.[0] || { mods: 0, code: 0x04 };
      openKeyModal({ mode: "replace", mods: step.mods, code: step.code, allowMedia: true });
    });

    panel.querySelector('[data-action="add-step"]')?.addEventListener("click", () => {
      openKeyModal({ mode: "append", mods: 0, code: 0x04, allowMedia: false });
    });

    $$('[data-action="edit-step"]', panel).forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        const step = state.draft.steps[index];
        openKeyModal({
          mode: "replaceStep",
          index,
          mods: step.mods,
          code: step.code,
          allowMedia: false,
        });
      });
    });

    $$('[data-action="remove-step"]', panel).forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        state.draft.steps.splice(index, 1);
        if (!state.draft.steps.length) {
          state.draft = { kind: "none", delay: 0 };
        } else {
          state.draft.kind = state.draft.steps.length === 1 ? "key" : "macro";
        }
        renderEditor();
      });
    });

    const mediaSelect = panel.querySelector('[data-role="media-select"]');
    mediaSelect?.addEventListener("change", () => {
      state.draft.media = Number(mediaSelect.value);
      renderEditor();
    });

    $$('[data-action="mouse-action"]', panel).forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.mouseAction;
        state.draft.mouse.action = action;
        if (action === "click") {
          if (!state.draft.mouse.buttons) state.draft.mouse.buttons = 1;
        } else {
          state.draft.mouse.buttons = 0;
        }
        if (action === "scroll" && !state.draft.mouse.wheel) {
          state.draft.mouse.wheel = 1;
        }
        renderEditor();
      });
    });

    const mouseButtons = panel.querySelector('[data-role="mouse-buttons"]');
    mouseButtons?.addEventListener("change", () => {
      state.draft.mouse.buttons = Number(mouseButtons.value);
      updateSaveState();
    });

    const direction = panel.querySelector('[data-role="mouse-direction"]');
    const amount = panel.querySelector('[data-role="mouse-amount"]');
    const syncScroll = () => {
      const magnitude = clampNumber(amount?.value, 1, 10, 1);
      const sign = direction?.value === "down" ? -1 : 1;
      state.draft.mouse.wheel = sign * magnitude;
      if (amount) amount.value = magnitude;
      updateSaveState();
    };
    direction?.addEventListener("change", syncScroll);
    amount?.addEventListener("input", syncScroll);

    const dx = panel.querySelector('[data-role="mouse-dx"]');
    const dy = panel.querySelector('[data-role="mouse-dy"]');
    dx?.addEventListener("input", () => {
      state.draft.mouse.dx = clampNumber(dx.value, -127, 127, 0);
      updateSaveState();
    });
    dy?.addEventListener("input", () => {
      state.draft.mouse.dy = clampNumber(dy.value, -127, 127, 0);
      updateSaveState();
    });

    const delayInput = panel.querySelector("#delay-input");
    delayInput?.addEventListener("input", () => {
      state.draft.delay = clampNumber(delayInput.value, 0, 6000, 0);
      updateSaveState();
    });
    delayInput?.addEventListener("change", () => {
      delayInput.value = clampNumber(delayInput.value, 0, 6000, 0);
    });

    panel.querySelector('[data-action="revert"]')?.addEventListener("click", () => {
      state.capturing = false;
      resetDraft();
      renderEditor();
    });

    panel.querySelector('[data-action="save"]')?.addEventListener("click", saveBinding);
  }

  function updateSaveState() {
    const dirty = isDirty();
    const save = $("#save-binding");
    if (save) save.disabled = state.busy || !dirty;
    const revert = $('[data-action="revert"]');
    if (revert) revert.disabled = state.busy || !dirty;
    const status = $("#editor-status");
    if (status) {
      status.textContent = dirty
        ? `Layer ${state.layer} · Unsaved changes`
        : `Layer ${state.layer} · Saved on the pad`;
    }
  }

  function setKind(kind) {
    if (!state.draft || state.draft.kind === kind) return;
    const delay = Number(state.draft.delay || 0);
    const existingSteps = (state.draft.steps || []).slice();
    state.capturing = false;

    if (kind === "key") {
      state.draft = {
        kind: "key",
        steps: [existingSteps[0] || { mods: 0, code: 0x04 }],
        delay,
      };
    } else if (kind === "macro") {
      state.draft = {
        kind: "macro",
        steps: existingSteps.length ? existingSteps : [{ mods: 0, code: 0x04 }],
        delay,
      };
    } else if (kind === "media") {
      state.draft = { kind: "media", media: state.draft.media || 0x00e9, delay };
    } else if (kind === "mouse") {
      state.draft = {
        kind: "mouse",
        mouse: state.draft.mouse || {
          action: "click",
          buttons: 1,
          mods: 0,
          dx: 0,
          dy: 0,
          wheel: 1,
        },
        delay,
      };
    } else {
      state.draft = { kind: "none", delay: 0 };
    }
    renderEditor();
  }

  async function saveBinding() {
    if (!isConnected()) {
      toast("Connect the macropad before saving.", "error");
      return;
    }
    if (!isDirty()) return;
    if (state.busy) return;

    state.busy = true;
    const button = $("#save-binding");
    setBusy(button, true);
    storeBackup("before-write");
    try {
      const payload = canonical(state.draft);
      const result = await hid.writeBinding(state.layer, state.selectedSlot, payload);
      setBindingLocal(state.layer, state.selectedSlot, result);
      resetDraft();
      if (result.delayVerified === false) {
        toast(
          `Key ${state.selectedSlot} saved, but the delay did not read back. Check the value and try again.`,
          "error",
        );
      } else {
        toast(`Key ${state.selectedSlot} saved and verified.`, "success");
      }
      renderBindings();
      renderRawConfig();
      loadBackups();
    } catch (error) {
      toast(error.message, "error");
      if (!hid.connected) markOffline(error.message);
    } finally {
      state.busy = false;
      setBusy(button, false);
      updateSaveState();
      updateConnectButton();
    }
  }

  // -------------------------------------------------------------- keyboard

  function selectSlot(slot) {
    if (!slot || slot < 1) return;
    state.selectedSlot = slot;
    state.capturing = false;
    resetDraft();
    renderBindings();
  }

  function setLayer(layer) {
    if (layer === state.layer) return;
    state.layer = layer;
    state.capturing = false;
    if (state.selectedSlot != null) resetDraft();
    renderLayer();
    renderBindings();
    renderLighting();
    renderRawConfig();
  }

  function toggleIdentify() {
    state.identify = !state.identify;
    const button = $("#identify-btn");
    const banner = $("#identify-banner");
    button?.classList.toggle("active", state.identify);
    if (banner) {
      banner.hidden = !state.identify;
      banner.classList.toggle("active", state.identify);
    }
    if (state.identify) {
      toast("Press a key on the macropad to select it.", "info");
    }
  }

  function identifyKey(event) {
    event.preventDefault();
    event.stopPropagation();
    const shortcut = shortcutFromEvent(event);
    if (!shortcut || shortcut.type !== "key") {
      toast("That key can't be identified this way.", "info");
      return;
    }
    let match = null;
    for (let slot = 1; slot <= keyCount(); slot += 1) {
      const binding = bindingAt(state.layer, slot);
      if (
        binding.kind === "key" &&
        binding.steps?.[0] &&
        binding.steps[0].code === shortcut.code &&
        (binding.steps[0].mods & 0x0f) === shortcut.mods
      ) {
        match = slot;
        break;
      }
    }
    if (match == null) {
      for (let slot = 1; slot <= keyCount(); slot += 1) {
        const binding = bindingAt(state.layer, slot);
        if (binding.kind === "key" && binding.steps?.[0]?.code === shortcut.code) {
          match = slot;
          break;
        }
      }
    }
    if (match != null) {
      selectSlot(match);
      toast(`That was key ${match}.`, "success");
    } else {
      toast("No key on this layer sends that shortcut.", "info");
    }
  }

  function captureInlineKey(event) {
    event.preventDefault();
    event.stopPropagation();
    if (MODIFIER_EVENT_CODES.has(event.code)) return;
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) {
      toast("This key can't be captured; use Browse all keys.", "info");
      return;
    }
    if (shortcut.type === "media") {
      state.draft = { kind: "media", media: shortcut.usage, delay: state.draft.delay || 0 };
    } else {
      state.draft = {
        kind: "key",
        steps: [{ mods: shortcut.mods, code: shortcut.code }],
        delay: state.draft.delay || 0,
      };
    }
    state.capturing = false;
    renderEditor();
    toast("Shortcut captured. Press Save to write it.", "success");
  }

  // ---------------------------------------------------------------- modal

  function openKeyModal({ mode = "replace", index = null, mods = 0, code = 0x04, allowMedia = true }) {
    state.capturing = false;
    state.modal = {
      open: true,
      mode,
      index,
      mods,
      code,
      media: 0x00cd,
      allowMedia,
      tab: "keyboard",
      capture: false,
      search: "",
    };
    $("#key-modal").hidden = false;
    renderKeyModal();
  }

  function closeKeyModal() {
    const modal = $("#key-modal");
    if (modal) modal.hidden = true;
    if (state.modal) state.modal.capture = false;
    state.modal = null;
  }

  function renderKeyModal() {
    const modal = state.modal;
    if (!modal) return;
    const append = modal.mode === "append";
    const title = append ? "Add a macro step" : modal.mode === "replaceStep" ? "Edit macro step" : "Choose a shortcut";
    $("#key-modal-title").textContent = title;
    $("#key-modal-tabs").hidden = !modal.allowMedia;
    $$("#key-modal-tabs button").forEach((button) => {
      button.classList.toggle("active", button.dataset.modalTab === modal.tab);
    });
    const use = $("#key-modal-use");
    use.textContent = append ? "Add step" : "Use shortcut";

    const body = $("#key-modal-body");
    if (modal.tab === "media" && modal.allowMedia) {
      body.innerHTML = renderMediaPicker(modal);
    } else {
      body.innerHTML = renderKeyboardPicker(modal);
    }
    wireKeyModalEvents();
  }

  function renderKeyboardPicker(modal) {
    const groups = KEY_GROUP_ORDER.map((group) => {
      const keys = KEYCODES.filter((key) => key.group === group);
      const options = keys.map((key) => `
        <button type="button" class="key-option ${key.code === modal.code ? "selected" : ""}"
          data-code="${key.code}" data-search="${escapeHtml(`${key.name} ${key.symbol || ""}`.toLowerCase())}"
          title="${escapeHtml(key.name)}">${escapeHtml(key.symbol || key.name)}</button>`).join("");
      return `<div class="key-group" data-group="${escapeHtml(group)}"><h4>${escapeHtml(group)}</h4><div class="key-grid">${options}</div></div>`;
    }).join("");

    return `
      <button type="button" class="modal-capture ${modal.capture ? "capturing" : ""}" id="modal-capture">
        <span>
          <span class="capture-main">${modal.capture ? "Listening…" : escapeHtml(formatShortcut({ mods: modal.mods, code: modal.code }))}</span>
          <span class="capture-sub">${modal.capture ? "Press a key combination now" : "Click, then press a key combination"}</span>
        </span>
        <span class="capture-badge">${modal.capture ? "Press keys" : "Record"}</span>
      </button>
      <div class="mod-toggles">
        ${MODIFIERS.map((modifier) => `
          <label class="mod-toggle ${modal.mods & modifier.bit ? "on" : ""}">
            <input type="checkbox" data-mod="${modifier.bit}" ${modal.mods & modifier.bit ? "checked" : ""}>
            ${modifier.name}
          </label>`).join("")}
      </div>
      <div class="picker-search">
        <input type="text" id="key-search" placeholder="Search keys…" value="${escapeHtml(modal.search)}" autocomplete="off">
      </div>
      <div class="key-list" id="key-list">${groups}</div>
      <p class="modal-note">Some browser-reserved shortcuts (like Ctrl+W) can't be recorded. Pick them from the list instead.</p>`;
  }

  function renderMediaPicker(modal) {
    const options = MEDIA_KEYS.map((media) => `
      <button type="button" class="media-option ${media.usage === modal.media ? "selected" : ""}"
        data-media="${media.usage}" data-search="${escapeHtml(media.name.toLowerCase())}">
        <span class="media-glyph">${media.glyph}</span><span>${escapeHtml(media.name)}</span>
      </button>`).join("");
    return `
      <div class="picker-search">
        <input type="text" id="media-search" placeholder="Search media keys…" value="${escapeHtml(modal.search)}" autocomplete="off">
      </div>
      <div class="media-grid" id="media-list">${options}</div>
      <p class="modal-note">Media actions are sent as consumer-control usages.</p>`;
  }

  function wireKeyModalEvents() {
    const modal = state.modal;
    if (!modal) return;
    const body = $("#key-modal-body");
    if (!body) return;

    $("#modal-capture")?.addEventListener("click", () => {
      modal.capture = !modal.capture;
      renderKeyModal();
    });

    $$("[data-mod]", body).forEach((input) => {
      input.addEventListener("change", () => {
        const bit = Number(input.dataset.mod);
        if (input.checked) modal.mods |= bit;
        else modal.mods &= ~bit;
        input.closest(".mod-toggle")?.classList.toggle("on", input.checked);
        const display = $("#modal-capture .capture-main");
        if (display) display.textContent = formatShortcut({ mods: modal.mods, code: modal.code });
      });
    });

    const keySearch = $("#key-search");
    if (keySearch) {
      keySearch.addEventListener("input", () => {
        modal.search = keySearch.value;
        filterPicker(keySearch.value, "#key-list", ".key-option", ".key-group");
      });
      if (modal.search) filterPicker(modal.search, "#key-list", ".key-option", ".key-group");
    }

    const mediaSearch = $("#media-search");
    if (mediaSearch) {
      mediaSearch.addEventListener("input", () => {
        modal.search = mediaSearch.value;
        filterPicker(mediaSearch.value, "#media-list", ".media-option", null);
      });
      if (modal.search) filterPicker(modal.search, "#media-list", ".media-option", null);
    }

    $$("[data-code]", body).forEach((button) => {
      button.addEventListener("click", () => {
        modal.code = Number(button.dataset.code);
        modal.capture = false;
        renderKeyModal();
      });
    });

    $$("[data-media]", body).forEach((button) => {
      button.addEventListener("click", () => {
        modal.media = Number(button.dataset.media);
        modal.capture = false;
        renderKeyModal();
      });
    });
  }

  function filterPicker(query, listSelector, itemSelector, groupSelector) {
    const needle = query.trim().toLowerCase();
    const list = $(listSelector);
    if (!list) return;
    if (groupSelector) {
      $$(groupSelector, list).forEach((group) => {
        let visible = 0;
        $$(itemSelector, group).forEach((item) => {
          const matches = !needle || (item.dataset.search || "").includes(needle);
          item.hidden = !matches;
          if (matches) visible += 1;
        });
        group.hidden = visible === 0;
      });
    } else {
      $$(itemSelector, list).forEach((item) => {
        const matches = !needle || (item.dataset.search || "").includes(needle);
        item.hidden = !matches;
      });
    }
  }

  function applyKeyModal() {
    const modal = state.modal;
    if (!modal || !state.draft) return;

    if (modal.tab === "media" && modal.allowMedia) {
      state.draft = {
        kind: "media",
        media: modal.media,
        delay: Number(state.draft.delay || 0),
      };
    } else {
      const step = { mods: modal.mods & 0x0f, code: modal.code };
      const steps = (state.draft.steps || []).slice();
      if (modal.mode === "append") {
        if (steps.length >= 18) {
          toast("A macro can hold at most 18 steps.", "error");
          return;
        }
        steps.push(step);
      } else if (modal.mode === "replaceStep") {
        steps[modal.index] = step;
      } else {
        steps.length = 0;
        steps.push(step);
      }
      state.draft.steps = steps;
      state.draft.kind = steps.length === 1 ? "key" : "macro";
    }

    closeKeyModal();
    renderEditor();
  }

  function setModalTab(tab) {
    if (!state.modal) return;
    if (tab === "media" && !state.modal.allowMedia) return;
    state.modal.tab = tab;
    state.modal.capture = false;
    renderKeyModal();
  }

  function captureModalKey(event) {
    event.preventDefault();
    event.stopPropagation();
    if (MODIFIER_EVENT_CODES.has(event.code)) return;
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) {
      toast("This browser can't capture that key; pick it from the list.", "info");
      return;
    }
    if (shortcut.type === "media") {
      if (!state.modal.allowMedia) {
        toast("That key is a media action, so it can't be used as a macro step.", "info");
        return;
      }
      state.modal.media = shortcut.usage;
      state.modal.tab = "media";
    } else {
      state.modal.mods = shortcut.mods;
      state.modal.code = shortcut.code;
      state.modal.tab = "keyboard";
    }
    state.modal.capture = false;
    renderKeyModal();
  }

  // --------------------------------------------------------------- lighting

  function renderLighting() {
    const layer = state.layer;
    if (!state.lightingDraft[layer]) {
      state.lightingDraft[layer] = { mode: 1, colour: 1, known: false, touched: false };
    }
    const draft = state.lightingDraft[layer];
    const mode = safeNumber(draft.mode, 1);
    const colourId = safeNumber(draft.colour, 1);
    const effect = EFFECTS.find((item) => item.id === mode) || EFFECTS[1];
    const colour = COLOUR_BY_ID.get(colourId) || COLOUR_BY_ID.get(1);

    $("#lighting-layer-label").textContent = layer;
    $("#apply-layer-label").textContent = layer;
    $("#lighting-headline").textContent = effect.headline;
    $("#lighting-description").textContent = effect.description;

    const known = $("#lighting-known");
    if (known) {
      let label = "Current lighting isn't readable — choose an effect and apply";
      let className = "known-pill";
      if (draft.known && draft.touched) {
        label = "Pending changes — press Apply";
        className += " known";
      } else if (draft.known) {
        label = `Applied to layer ${layer} this session`;
        className += " known";
      }
      known.innerHTML = `<span class="${className}">${escapeHtml(label)}</span>`;
    }

    $("#effect-grid").innerHTML = EFFECTS.map((item) => `
      <button type="button" class="effect-card ${item.id === mode ? "active" : ""}" data-mode="${item.id}">
        <span class="effect-icon">${item.icon}</span>
        <span class="effect-head">
          <span class="effect-name">${escapeHtml(item.name)}</span>
          ${item.tag ? `<span class="effect-tag">${escapeHtml(item.tag)}</span>` : ""}
        </span>
        <span class="effect-desc">${escapeHtml(item.description)}</span>
      </button>`).join("");

    $("#swatches").innerHTML = COLOURS.map((item) => `
      <button type="button" class="swatch ${item.id === colourId ? "selected" : ""}"
        data-colour="${item.id}" style="--swatch:${item.hex}" title="${escapeHtml(item.name)}"
        aria-label="${escapeHtml(item.name)}" aria-pressed="${item.id === colourId ? "true" : "false"}"></button>`).join("");

    const colourHelp = $("#colour-help");
    if (colourHelp) {
      if (mode === 0) colourHelp.textContent = "Choose an effect to bring the colour back.";
      else if (mode === 5) colourHelp.textContent = "The white effect is always white; the colour is ignored.";
      else colourHelp.textContent = "Colour applies to solid, wave and reactive effects.";
    }

    const glow = mode === 0 ? "transparent" : mode === 5 ? "#ffffff" : colour.hex;
    const preview = $("#light-preview-body");
    if (preview) {
      preview.className = "pad-body mini";
      if (mode === 0) preview.classList.add("off");
      else preview.classList.add("glow");
      if (mode === 2) preview.classList.add("wave");
      if (mode === 3) preview.classList.add("wave", "reverse");
      if (mode === 4) preview.classList.add("reactive");
      if (mode === 5) preview.classList.add("white");
      preview.style.setProperty("--glow", glow);
      preview.style.setProperty("--glow-border", mode === 0 ? "rgba(255,255,255,0.08)" : `${glow}66`);
    }

    const previewKeys = $("#light-preview-keys");
    if (previewKeys) {
      const slots = Array.from({ length: keyCount() }, (_, index) => index + 1);
      previewKeys.innerHTML = slots.map((slot) => `
        <div class="keycap" aria-hidden="true">
          <span class="cap-label">${escapeHtml(formatBinding(bindingAt(layer, slot), { short: true }))}</span>
        </div>`).join("");
    }

  }

  function safeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function setLightingEffect(mode) {
    const draft = state.lightingDraft[state.layer];
    if (!draft) return;
    draft.mode = mode;
    draft.touched = true;
    renderLighting();
  }

  function setLightingColour(colour) {
    const draft = state.lightingDraft[state.layer];
    if (!draft) return;
    draft.colour = colour;
    draft.touched = true;
    renderLighting();
  }

  async function applyLighting() {
    if (!isConnected()) {
      toast("Connect the macropad before applying lighting.", "error");
      return;
    }
    if (state.busy) return;
    const draft = state.lightingDraft[state.layer];
    if (!draft) return;

    state.busy = true;
    const button = $("#apply-lighting");
    setBusy(button, true);
    storeBackup("before-lighting");
    try {
      const result = await hid.writeLighting(state.layer, draft.mode, draft.colour);
      state.lightingDraft[state.layer] = {
        mode: result.mode,
        colour: result.colour,
        known: true,
        touched: false,
      };
      toast(`Lighting applied to layer ${state.layer}.`, "success");
      renderLighting();
      renderRawConfig();
      loadBackups();
    } catch (error) {
      toast(error.message, "error");
      if (!hid.connected) markOffline(error.message);
    } finally {
      state.busy = false;
      setBusy(button, false);
      updateConnectButton();
    }
  }

  // ---------------------------------------------------------------- backups

  function renderRawConfig() {
    const container = $("#raw-config");
    if (!container) return;
    const layers = state.data?.layers || {};
    if (!Object.keys(layers).length) {
      container.innerHTML = '<p class="muted">No configuration has been read yet.</p>';
      return;
    }

    const keys = keyCount();
    let html = "";
    for (let layer = 1; layer <= 3; layer += 1) {
      const rows = [];
      for (let slot = 1; slot <= keys; slot += 1) {
        const binding = bindingAt(layer, slot);
        const delay = binding.delay ? ` · ${binding.delay} ms delay` : "";
        rows.push(`<tr><td>Key ${slot}</td><td>${escapeHtml(formatBinding(binding))}${delay}</td></tr>`);
      }
      const draft = state.lightingDraft[layer];
      let lighting = "Not read from the pad";
      let swatch = "#4b5265";
      if (draft?.known) {
        const colour = COLOUR_BY_ID.get(draft.colour) || COLOUR_BY_ID.get(1);
        const effect = EFFECTS.find((item) => item.id === draft.mode) || EFFECTS[1];
        lighting = `${effect.name} · ${colour.name}${draft.touched ? " (pending)" : ""}`;
        swatch = draft.mode === 5 ? "#ffffff" : colour.hex;
      }
      html += `
        <div class="raw-layer">
          <h4>Layer ${layer}</h4>
          <table class="raw-table">
            <thead><tr><th>Control</th><th>Binding</th></tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
          <div class="raw-light" style="margin-top:8px"><i style="--swatch:${swatch};background:${swatch}"></i>${escapeHtml(lighting)}</div>
        </div>`;
    }
    container.innerHTML = html;
  }

  function getBackupStore() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.filter((item) => item && item.data);
    } catch (error) {
      return [];
    }
  }

  function setBackupStore(list) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, BACKUP_LIMIT)));
    } catch (error) {
      throw new Error("Browser storage is full or unavailable. Export a backup instead.");
    }
  }

  function backupStamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function makeBackup(reason) {
    const layers = {};
    for (const [layer, slots] of Object.entries(state.data.layers || {})) {
      layers[layer] = {};
      for (const [slot, binding] of Object.entries(slots || {})) {
        layers[layer][slot] = canonical(binding);
      }
    }
    const lighting = {};
    for (let layer = 1; layer <= 3; layer += 1) {
      const draft = state.lightingDraft[layer];
      if (draft?.known) {
        lighting[String(layer)] = {
          mode: Number(draft.mode),
          colour: Number(draft.colour),
          known: true,
        };
      }
    }
    return {
      format: "macropad-configurator/v1",
      savedAt: new Date().toISOString(),
      reason,
      device: clone(state.data.device || {}),
      layers,
      lighting,
    };
  }

  function storeBackup(reason) {
    if (!isConnected() || !state.data.layers || !Object.keys(state.data.layers).length) return;
    try {
      const data = makeBackup(reason);
      const list = getBackupStore();
      list.unshift({
        name: `${backupStamp()}-${reason}.json`,
        savedAt: data.savedAt,
        reason,
        data,
      });
      setBackupStore(list);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function backupReasonLabel(reason) {
    const labels = {
      "before-write": "Automatic · before an edit",
      "before-lighting": "Automatic · before a lighting change",
      "before-restore": "Automatic · before a restore",
      manual: "Manual export",
    };
    return labels[reason] || reason || "Snapshot";
  }

  function loadBackups() {
    const label = $("#backup-dir-label");
    if (label) label.textContent = "Automatic snapshots live in this browser (localStorage).";
    renderBackups();
  }

  function renderBackups() {
    const list = $("#backup-list");
    if (!list) return;
    const store = getBackupStore();
    if (!store.length) {
      list.innerHTML = '<div class="backup-empty">No backups yet. One is saved automatically before every change.</div>';
      return;
    }
    list.innerHTML = store.map((backup) => `
      <div class="backup-row">
        <div class="backup-main">
          <strong>${escapeHtml(backupReasonLabel(backup.reason))}</strong>
          <small>${escapeHtml(formatDate(backup.savedAt))} · ${escapeHtml(backup.name)}</small>
        </div>
        <button type="button" class="btn ghost tiny" data-restore="${escapeHtml(backup.name)}">Restore</button>
        <button type="button" class="btn ghost tiny" data-delete="${escapeHtml(backup.name)}" title="Delete this backup">×</button>
      </div>`).join("");
  }

  function validateBackup(data) {
    if (!data || typeof data !== "object" || !data.layers || typeof data.layers !== "object") {
      throw new Error("That doesn't look like a macropad backup.");
    }
    const keys = keyCount();
    const plan = [];
    for (let layer = 1; layer <= 3; layer += 1) {
      const slots = data.layers[String(layer)] ?? data.layers[layer] ?? {};
      if (!slots || typeof slots !== "object") {
        throw new Error(`Layer ${layer} in this backup is malformed.`);
      }
      for (const [slotKey, binding] of Object.entries(slots)) {
        const slot = Number(slotKey);
        if (!Number.isInteger(slot) || slot < 1) {
          throw new Error(`Layer ${layer} has an invalid key number.`);
        }
        if (slot > keys) {
          throw new Error(`This backup targets key ${slot}, but this pad has ${keys} keys.`);
        }
        if (!binding || !["key", "macro", "media", "mouse", "none"].includes(binding.kind)) {
          throw new Error(`Layer ${layer} key ${slot} has an invalid binding.`);
        }
        plan.push({ layer, slot, binding: canonical(binding) });
      }
    }

    const lighting = [];
    for (let layer = 1; layer <= 3; layer += 1) {
      const entry = data.lighting?.[String(layer)] ?? data.lighting?.[layer];
      if (!entry?.known) continue;
      const mode = Number(entry.mode);
      const colour = Number(entry.colour);
      if (Number.isInteger(mode) && mode >= 0 && mode <= 5 && Number.isInteger(colour) && colour >= 0 && colour <= 7) {
        lighting.push({ layer, mode, colour });
      }
    }

    if (!plan.length && !lighting.length) {
      throw new Error("This backup contains nothing to restore.");
    }
    return { plan, lighting };
  }

  async function applyBackup(data, { label = "backup", triggerButton = null } = {}) {
    if (!isConnected()) {
      toast("Connect the macropad before restoring a backup.", "error");
      return;
    }
    if (state.busy) return;

    let parsed;
    try {
      parsed = validateBackup(data);
    } catch (error) {
      toast(error.message, "error");
      return;
    }

    const bindingCount = parsed.plan.length;
    const lightingCount = parsed.lighting.length;
    const detail = [
      bindingCount ? `${bindingCount} binding${bindingCount === 1 ? "" : "s"}` : null,
      lightingCount ? `${lightingCount} lighting layer${lightingCount === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" and ");

    const accepted = await confirmDialog(
      "Restore this backup?",
      `This writes ${detail} from "${label}" to the pad. A snapshot of the current configuration is saved first.`,
      "Restore backup",
    );
    if (!accepted) return;

    state.busy = true;
    if (triggerButton) setBusy(triggerButton, true);
    storeBackup("before-restore");
    try {
      for (const item of parsed.plan) {
        await hid.writeBinding(item.layer, item.slot, item.binding, { verify: false });
      }

      const restored = await hid.readAll();
      for (const item of parsed.plan) {
        const current = restored[item.layer]?.[item.slot];
        if (!current || P.bindingSignature(current) !== P.bindingSignature(item.binding)) {
          throw new Error(`Layer ${item.layer} key ${item.slot} did not verify after restore.`);
        }
        if (item.binding.delay && Number(current.delay || 0) !== Number(item.binding.delay)) {
          throw new Error(`Layer ${item.layer} key ${item.slot} delay did not verify after restore.`);
        }
      }

      for (const item of parsed.lighting) {
        await hid.writeLighting(item.layer, item.mode, item.colour);
        state.lightingDraft[item.layer] = {
          mode: item.mode,
          colour: item.colour,
          known: true,
          touched: false,
        };
      }

      state.data.layers = restored;
      state.data.connected = true;
      state.data.error = null;
      ensureSelection();
      resetDraft();
      renderAll();
      loadBackups();
      toast(`Restored ${bindingCount} binding${bindingCount === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      toast(error.message, "error");
      if (!hid.connected) markOffline(error.message);
    } finally {
      state.busy = false;
      if (triggerButton) setBusy(triggerButton, false);
      updateConnectButton();
    }
  }

  async function restoreBackup(name, button) {
    const item = getBackupStore().find((backup) => backup.name === name);
    if (!item) {
      toast("That backup is no longer available.", "error");
      renderBackups();
      return;
    }
    await applyBackup(item.data, { label: name, triggerButton: button });
  }

  async function deleteBackup(name, button) {
    const accepted = await confirmDialog(
      "Delete this backup?",
      "This only removes the snapshot from this browser. The macropad is not changed.",
      "Delete backup",
    );
    if (!accepted) return;
    try {
      const list = getBackupStore().filter((backup) => backup.name !== name);
      setBackupStore(list);
      renderBackups();
      toast("Backup deleted.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
    if (button) button.disabled = false;
  }

  function exportBackup() {
    if (!state.data.layers || !Object.keys(state.data.layers).length) {
      toast("Connect and read the macropad before exporting.", "error");
      return;
    }
    try {
      const data = makeBackup("manual");
      const body = JSON.stringify(data, null, 2);
      const blob = new Blob([body], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `macropad-backup-${backupStamp()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Backup downloaded.", "success");
    } catch (error) {
      toast(`Could not create the backup: ${error.message}`, "error");
    }
  }

  async function handleImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const button = $("#import-btn");
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error("That file is not valid JSON.");
      }
      await applyBackup(data, { label: file.name, triggerButton: button });
    } catch (error) {
      toast(error.message, "error");
    } finally {
      input.value = "";
    }
  }

  // ---------------------------------------------------------------- confirm

  function confirmDialog(title, message, confirmLabel = "Continue") {
    return new Promise((resolve) => {
      state.confirmResolver = resolve;
      $("#confirm-title").textContent = title;
      $("#confirm-message").textContent = message;
      $("#confirm-ok").textContent = confirmLabel;
      $("#confirm-modal").hidden = false;
      $("#confirm-ok").focus();
    });
  }

  function resolveConfirm(value) {
    const modal = $("#confirm-modal");
    if (modal) modal.hidden = true;
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    if (resolver) resolver(value);
  }

  // --------------------------------------------------------------- events

  function handleGlobalKeydown(event) {
    if (state.confirmResolver) {
      if (event.key === "Escape") {
        event.preventDefault();
        resolveConfirm(false);
      }
      return;
    }

    if (state.modal?.open) {
      if (state.modal.capture) {
        captureModalKey(event);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeKeyModal();
      }
      return;
    }

    if (state.capturing) {
      captureInlineKey(event);
      return;
    }

    if (state.identify && !isTypingTarget(event.target)) {
      identifyKey(event);
    }
  }

  function switchView(view) {
    if (view !== "bindings" && state.identify) toggleIdentify();
    state.view = view;
    state.capturing = false;
    const meta = VIEW_META[view] || VIEW_META.bindings;
    $("#view-title").textContent = meta.title;
    $("#view-subtitle").textContent = meta.subtitle;
    $$(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    $$(".view").forEach((section) => {
      section.classList.toggle("active", section.id === `${view}-view`);
    });
    const layerBar = $("#layer-bar");
    if (layerBar) layerBar.hidden = view === "backup";

    if (view === "bindings") renderBindings();
    if (view === "lighting") renderLighting();
    if (view === "backup") {
      renderRawConfig();
      loadBackups();
    }
  }

  function bindStaticEvents() {
    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    $("#layer-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-layer]");
      if (button) setLayer(Number(button.dataset.layer));
    });

    $("#connect-btn").addEventListener("click", () => {
      if (isConnected()) refreshDevice(false);
      else connectDevice(false);
    });

    $("#device-card").addEventListener("click", () => {
      if (!isConnected() && !webHidProblem()) connectDevice(false);
    });

    $("#identify-btn").addEventListener("click", toggleIdentify);

    $("#pad-keys").addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot]");
      if (button) selectSlot(Number(button.dataset.slot));
    });

    $("#effect-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (button) setLightingEffect(Number(button.dataset.mode));
    });

    $("#swatches").addEventListener("click", (event) => {
      const button = event.target.closest("[data-colour]");
      if (button) setLightingColour(Number(button.dataset.colour));
    });

    $("#apply-lighting").addEventListener("click", applyLighting);

    $("#export-btn").addEventListener("click", exportBackup);
    $("#import-btn").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", handleImportFile);
    $("#reload-backups").addEventListener("click", loadBackups);

    $("#backup-list").addEventListener("click", (event) => {
      const restore = event.target.closest("[data-restore]");
      if (restore) {
        restoreBackup(restore.dataset.restore, restore);
        return;
      }
      const remove = event.target.closest("[data-delete]");
      if (remove) deleteBackup(remove.dataset.delete, remove);
    });

    $("#key-modal-close").addEventListener("click", closeKeyModal);
    $("#key-modal-cancel").addEventListener("click", closeKeyModal);
    $("#key-modal-use").addEventListener("click", applyKeyModal);
    $("#key-modal-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-modal-tab]");
      if (button) setModalTab(button.dataset.modalTab);
    });
    $("#key-modal").addEventListener("click", (event) => {
      if (event.target === $("#key-modal")) closeKeyModal();
    });

    $("#confirm-cancel").addEventListener("click", () => resolveConfirm(false));
    $("#confirm-ok").addEventListener("click", () => resolveConfirm(true));
    $("#confirm-modal").addEventListener("click", (event) => {
      if (event.target === $("#confirm-modal")) resolveConfirm(false);
    });

    document.addEventListener("keydown", handleGlobalKeydown, true);
  }

  async function init() {
    bindStaticEvents();
    renderLayer();
    hid.onStatus = ({ connected, error }) => {
      if (!connected) {
        markOffline(error || "The macropad was disconnected.");
        updateConnectButton();
      }
    };
    await boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
