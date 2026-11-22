/* HID keyboard usage catalog, media usages, and browser-code mapping. */

const MODIFIERS = [
  { bit: 1, name: "Ctrl", short: "Ctrl" },
  { bit: 2, name: "Shift", short: "Shift" },
  { bit: 4, name: "Alt", short: "Alt" },
  { bit: 8, name: "Win", short: "Win" },
];

const KEYCODES = [];
const KEY_GROUP_ORDER = [
  "Letters",
  "Numbers",
  "Function",
  "Navigation",
  "Punctuation",
  "Numpad",
  "System",
  "International",
];

function addKey(code, name, group, symbol) {
  KEYCODES.push({ code, name, group, symbol: symbol || null });
}

for (let i = 0; i < 26; i += 1) {
  addKey(0x04 + i, String.fromCharCode(65 + i), "Letters");
}
for (let i = 1; i <= 9; i += 1) {
  addKey(0x1d + i, String(i), "Numbers");
}
addKey(0x27, "0", "Numbers");

addKey(0x28, "Enter", "System", "Enter");
addKey(0x29, "Escape", "System", "Esc");
addKey(0x2a, "Backspace", "System", "Backspace");
addKey(0x2b, "Tab", "System", "Tab");
addKey(0x2c, "Space", "System", "Space");
addKey(0x2d, "Minus", "Punctuation", "-");
addKey(0x2e, "Equals", "Punctuation", "=");
addKey(0x2f, "Left Bracket", "Punctuation", "[");
addKey(0x30, "Right Bracket", "Punctuation", "]");
addKey(0x31, "Backslash", "Punctuation", "\\");
addKey(0x32, "Non-US Hash", "Punctuation", "#");
addKey(0x33, "Semicolon", "Punctuation", ";");
addKey(0x34, "Quote", "Punctuation", "'");
addKey(0x35, "Backquote", "Punctuation", "`");
addKey(0x36, "Comma", "Punctuation", ",");
addKey(0x37, "Period", "Punctuation", ".");
addKey(0x38, "Slash", "Punctuation", "/");
addKey(0x39, "Caps Lock", "System");

for (let i = 1; i <= 12; i += 1) addKey(0x39 + i, `F${i}`, "Function");
for (let i = 13; i <= 24; i += 1) addKey(0x68 + (i - 13), `F${i}`, "Function");

addKey(0x46, "Print Screen", "System");
addKey(0x47, "Scroll Lock", "System");
addKey(0x48, "Pause", "System");
addKey(0x49, "Insert", "Navigation");
addKey(0x4a, "Home", "Navigation");
addKey(0x4b, "Page Up", "Navigation");
addKey(0x4c, "Delete", "Navigation", "Del");
addKey(0x4d, "End", "Navigation");
addKey(0x4e, "Page Down", "Navigation");
addKey(0x4f, "Arrow Right", "Navigation", "→");
addKey(0x50, "Arrow Left", "Navigation", "←");
addKey(0x51, "Arrow Down", "Navigation", "↓");
addKey(0x52, "Arrow Up", "Navigation", "↑");

addKey(0x53, "Num Lock", "System");
addKey(0x54, "Numpad /", "Numpad");
addKey(0x55, "Numpad *", "Numpad");
addKey(0x56, "Numpad -", "Numpad");
addKey(0x57, "Numpad +", "Numpad");
addKey(0x58, "Numpad Enter", "Numpad");
for (let i = 1; i <= 9; i += 1) addKey(0x58 + i, `Numpad ${i}`, "Numpad");
addKey(0x62, "Numpad 0", "Numpad");
addKey(0x63, "Numpad .", "Numpad");
addKey(0x67, "Numpad =", "Numpad");
addKey(0x85, "Numpad ,", "Numpad");

addKey(0x64, "Non-US Backslash", "International");
addKey(0x65, "Menu", "System");
addKey(0x66, "Power", "System");
addKey(0x74, "Execute", "System");
addKey(0x75, "Help", "System");
addKey(0x76, "Menu (Alt)", "System");
addKey(0x77, "Select", "System");
addKey(0x78, "Stop", "System");
addKey(0x79, "Again", "System");
addKey(0x7a, "Undo", "System");
addKey(0x7b, "Cut", "System");
addKey(0x7c, "Copy", "System");
addKey(0x7d, "Paste", "System");
addKey(0x7e, "Find", "System");
addKey(0x7f, "Mute", "System");
addKey(0x80, "Volume Up", "System");
addKey(0x81, "Volume Down", "System");
addKey(0x87, "Intl Ro", "International");
addKey(0x88, "Kana Mode", "International");
addKey(0x89, "Intl Yen", "International");
addKey(0x8a, "Convert", "International");
addKey(0x8b, "NonConvert", "International");
for (let i = 1; i <= 5; i += 1) addKey(0x8f + i, `Lang ${i}`, "International");

const KEY_BY_CODE = new Map(KEYCODES.map((key) => [key.code, key]));

const MEDIA_KEYS = [
  { usage: 0x00cd, name: "Play / Pause", glyph: "⏯" },
  { usage: 0x00b7, name: "Stop", glyph: "⏹" },
  { usage: 0x00b5, name: "Next Track", glyph: "⏭" },
  { usage: 0x00b6, name: "Previous Track", glyph: "⏮" },
  { usage: 0x00b3, name: "Fast Forward", glyph: "⏩" },
  { usage: 0x00b4, name: "Rewind", glyph: "⏪" },
  { usage: 0x00e2, name: "Mute", glyph: "🔇" },
  { usage: 0x00e9, name: "Volume Up", glyph: "🔊" },
  { usage: 0x00ea, name: "Volume Down", glyph: "🔉" },
  { usage: 0x00b8, name: "Eject", glyph: "⏏" },
  { usage: 0x0192, name: "Calculator", glyph: "🧮" },
  { usage: 0x018a, name: "Mail", glyph: "✉" },
  { usage: 0x0183, name: "Media Select", glyph: "🎛" },
  { usage: 0x0223, name: "Browser Home", glyph: "🏠" },
  { usage: 0x0224, name: "Browser Back", glyph: "◀" },
  { usage: 0x0225, name: "Browser Forward", glyph: "▶" },
  { usage: 0x0227, name: "Browser Refresh", glyph: "⟳" },
  { usage: 0x0226, name: "Browser Stop", glyph: "■" },
  { usage: 0x0221, name: "Browser Search", glyph: "🔎" },
  { usage: 0x022a, name: "Browser Favorites", glyph: "★" },
  { usage: 0x006f, name: "Brightness Up", glyph: "☀" },
  { usage: 0x0070, name: "Brightness Down", glyph: "🌙" },
  { usage: 0x0032, name: "Sleep", glyph: "💤" },
];

const MEDIA_BY_USAGE = new Map(MEDIA_KEYS.map((key) => [key.usage, key]));

const EVENT_CODE_TO_USAGE = {
  KeyA: 0x04, KeyB: 0x05, KeyC: 0x06, KeyD: 0x07, KeyE: 0x08, KeyF: 0x09,
  KeyG: 0x0a, KeyH: 0x0b, KeyI: 0x0c, KeyJ: 0x0d, KeyK: 0x0e, KeyL: 0x0f,
  KeyM: 0x10, KeyN: 0x11, KeyO: 0x12, KeyP: 0x13, KeyQ: 0x14, KeyR: 0x15,
  KeyS: 0x16, KeyT: 0x17, KeyU: 0x18, KeyV: 0x19, KeyW: 0x1a, KeyX: 0x1b,
  KeyY: 0x1c, KeyZ: 0x1d,
  Digit1: 0x1e, Digit2: 0x1f, Digit3: 0x20, Digit4: 0x21, Digit5: 0x22,
  Digit6: 0x23, Digit7: 0x24, Digit8: 0x25, Digit9: 0x26, Digit0: 0x27,
  Enter: 0x28, NumpadEnter: 0x58,
  Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c,
  Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f, BracketRight: 0x30,
  Backslash: 0x31, IntlHash: 0x32, Semicolon: 0x33, Quote: 0x34,
  Backquote: 0x35, Comma: 0x36, Period: 0x37, Slash: 0x38,
  CapsLock: 0x39,
  F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
  F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
  PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d,
  PageDown: 0x4e, ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51,
  ArrowUp: 0x52, NumLock: 0x53,
  NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56,
  NumpadAdd: 0x57,
  Numpad1: 0x59, Numpad2: 0x5a, Numpad3: 0x5b, Numpad4: 0x5c,
  Numpad5: 0x5d, Numpad6: 0x5e, Numpad7: 0x5f, Numpad8: 0x60,
  Numpad9: 0x61, Numpad0: 0x62, NumpadDecimal: 0x63,
  IntlBackslash: 0x64, ContextMenu: 0x65, Power: 0x66,
  NumpadEqual: 0x67, NumpadComma: 0x85,
  IntlRo: 0x87, KanaMode: 0x88, IntlYen: 0x89, Convert: 0x8a,
  NonConvert: 0x8b,
  Lang1: 0x90, Lang2: 0x91, Lang3: 0x92, Lang4: 0x93, Lang5: 0x94,
  F13: 0x68, F14: 0x69, F15: 0x6a, F16: 0x6b, F17: 0x6c, F18: 0x6d,
  F19: 0x6e, F20: 0x6f, F21: 0x70, F22: 0x71, F23: 0x72, F24: 0x73,
  Execute: 0x74, Help: 0x75, Select: 0x77, Stop: 0x78, Again: 0x79,
  Undo: 0x7a, Cut: 0x7b, Copy: 0x7c, Paste: 0x7d, Find: 0x7e,
  AudioVolumeMute: 0x7f, AudioVolumeUp: 0x80, AudioVolumeDown: 0x81,
  Eject: 0xb8,
};

/* Browser media codes live on the consumer page, not the keyboard page. */
const EVENT_CODE_TO_MEDIA = {
  MediaPlayPause: 0x00cd,
  MediaStop: 0x00b7,
  MediaTrackNext: 0x00b5,
  MediaTrackPrevious: 0x00b6,
  MediaFastForward: 0x00b3,
  MediaRewind: 0x00b4,
  AudioVolumeMute: 0x00e2,
  AudioVolumeUp: 0x00e9,
  AudioVolumeDown: 0x00ea,
  LaunchMail: 0x018a,
  LaunchApp2: 0x0192,
  BrowserHome: 0x0223,
  BrowserBack: 0x0224,
  BrowserForward: 0x0225,
  BrowserRefresh: 0x0227,
  BrowserStop: 0x0226,
  BrowserSearch: 0x0221,
  BrowserFavorites: 0x022a,
  Eject: 0x00b8,
  Sleep: 0x0032,
};

const MODIFIER_EVENT_CODES = new Set([
  "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight",
]);

function shortcutFromEvent(event) {
  const media = EVENT_CODE_TO_MEDIA[event.code];
  if (media != null) {
    return { type: "media", usage: media };
  }
  const code = EVENT_CODE_TO_USAGE[event.code];
  if (code == null) return null;
  let mods = 0;
  if (event.ctrlKey) mods |= 1;
  if (event.shiftKey) mods |= 2;
  if (event.altKey) mods |= 4;
  if (event.metaKey) mods |= 8;
  return { type: "key", mods, code };
}

function keyName(code) {
  const key = KEY_BY_CODE.get(code);
  if (!key) return `Key 0x${Number(code).toString(16).padStart(2, "0").toUpperCase()}`;
  return key.symbol || key.name;
}

function formatShortcut(step) {
  if (!step) return "Unassigned";
  const parts = [];
  for (const modifier of MODIFIERS) {
    if ((step.mods || 0) & modifier.bit) parts.push(modifier.short);
  }
  parts.push(keyName(step.code));
  return parts.join(" + ");
}

function mediaName(usage) {
  const known = MEDIA_BY_USAGE.get(usage);
  if (known) return known.name;
  return `Media 0x${Number(usage).toString(16).padStart(4, "0").toUpperCase()}`;
}

function mouseButtonName(buttons) {
  if (buttons === 1) return "Left click";
  if (buttons === 2) return "Right click";
  if (buttons === 4) return "Middle click";
  if (!buttons) return "Mouse click";
  return "Mouse click";
}

function formatBinding(binding, options = {}) {
  if (!binding) return "Nothing";
  const short = options.short === true;
  switch (binding.kind) {
    case "none":
      return "Nothing";
    case "key":
      return binding.steps && binding.steps[0] ? formatShortcut(binding.steps[0]) : "Unassigned";
    case "macro": {
      const steps = binding.steps || [];
      if (short) return `${steps.length} steps`;
      return steps.map(formatShortcut).join(" → ");
    }
    case "media":
      return mediaName(binding.media);
    case "mouse": {
      const mouse = binding.mouse || {};
      if (mouse.action === "scroll") {
        const direction = (mouse.wheel || 0) >= 0 ? "up" : "down";
        return `Scroll ${direction} ×${Math.abs(mouse.wheel || 0) || 1}`;
      }
      if (mouse.action === "move") {
        return `Move ${mouse.dx || 0}, ${mouse.dy || 0}`;
      }
      return mouseButtonName(mouse.buttons || 1);
    }
    default:
      return "Unknown";
  }
}
