# Macropad Configurator

A browser-based editor for cheap CH57x-family mini macropads. It edits key
bindings, macros, media/mouse actions, per-layer firmware lighting effects and
backups.

The app is **fully static** — no backend, no install, no build step. It talks to
the macropad through **WebHID**, so it runs directly on GitHub Pages (HTTPS) or
from a local server on `localhost`.

Tested on a `514c:8851` 3-key pad with 3 layers and 0 knobs, exposing the
configuration interface at usage page `0xFF00`, usage `0x01`.

![3-key macropad](https://img.shields.io/badge/device-514c%3A8851-8266ff)

**Live app:** https://tommo1818.github.io/macropad-configurator/

## Features

- **Key bindings** — record a shortcut, browse the full HID key catalog, or
  assign media and mouse actions.
- **Macros** — up to 18 key combinations per key, with an optional delay of up
  to 6000 ms after the binding runs.
- **Lighting** — six firmware effects (off, solid, forward wave, reverse wave,
  reactive, white) and the eight palette colours, stored per layer. The app
  deliberately exposes only what the firmware actually offers: no fake custom
  colours and no app-side animations.
- **Three layers** — edit all layers; the physical button on the pad chooses
  which layer is live.
- **Verify on write** — after saving, the app reads the pad back and reports a
  mismatch instead of pretending it worked.
- **Backups** — automatic snapshots in `localStorage` before every write, plus
  portable JSON export/import.
- **Identify keys** — press a key on the pad to select it in the app, useful when
  the physical order is not obvious.

## Run it on GitHub Pages

This repository is published from the **`docs/`** folder on the `main` branch.

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to
   **Deploy from a branch**.
3. Choose branch **`main`** and folder **`/docs`**, then save.

The app uses only relative paths, so it works from the project subpath
`https://<your-user>.github.io/<repo>/`.

> WebHID requires a secure context. GitHub Pages is HTTPS, so it works. Opening
> `docs/index.html` directly from disk (`file://`) does **not** count as a secure
> context and will not work.

## Run it locally

Windows:

```text
start.bat
```

macOS / Linux:

```sh
sh start.sh
```

Or:

```sh
python start.py
```

Any static server works too, for example
`python -m http.server 8000 --directory docs` or `npx serve docs`.

Then open the printed `http://127.0.0.1:8000/` URL. The local server is a tiny
Python stdlib server that only serves `docs/`; it does not touch the device.

Requirements:

- **Chrome or Edge on desktop** (WebHID). Firefox, Safari and mobile browsers do
  not expose WebHID.
- A data cable. Many of these pads omit the USB-C CC resistors, so a **C-to-C
  cable may not enumerate at all**. An **A-to-C** cable is the reliable choice.

## Using the app

1. Click **Connect** and pick the keyboard / macropad in the browser's HID
   device picker. Permission is remembered for this origin.
2. Pick a layer (1–3) and click one of the three keys.
3. Choose a binding type:
   - **Key** — click the shortcut box and press a key combination, or browse the
     full key list.
   - **Macro** — add up to 18 steps; each step is a key combination.
   - **Media** — play/pause, volume, track, calculator, browser and other
     consumer-control usages.
   - **Mouse** — click, scroll or move.
   - **None** — make the key do nothing.
4. Optionally set a **delay after the action** (0–6000 ms).
5. Click **Save to macropad**. The app writes the binding, commits it and reads
   that layer back to verify it.

Lighting:

- Open **Lighting**, choose a firmware effect and palette colour, then click
  **Apply to layer N**. The setting is stored per layer in the pad's flash.
- **Wave modes are animated by the firmware and fire on both key-down and
  key-up.** The same applies to the Reactive mode on this pad. That cannot be
  changed from the host. Only **Solid**, **White** and **Off** avoid the
  release flash.
- White is available as the dedicated **White** effect or palette colour 0.
- There is **no per-key RGB** and **no custom-RGB mode** on this firmware. The
  app does not fake either with host-side animation. The experimental RGB-table
  packet used by newer SIKAI software was tested on this unit and ignored.
- Effects are applied per layer; the pad's hardware button chooses the live
  layer.

Backups:

- A snapshot is saved in this browser **before every binding write, lighting
  change and restore**.
- **Backups → Download backup** exports a JSON file.
- **Restore** writes a snapshot back (and verifies it).
- Local snapshots are stored in `localStorage` for the current origin. Clearing
  site data removes them; export anything important.

## Device support and limits

- Supports the **ch57x-1** dialect, which includes the tested `514c:8851` and
  several `1189:88xx` pads. Other dialects (`ch57x-2`, `ch57x-3`, LCTECH) are
  not implemented.
- The UI currently edits **keys** only. If your pad has knobs, they are reported
  in the device line but knob bindings are not exposed by this app.
- Three layers, 18 macro steps, 6000 ms maximum delay.
- The firmware supports **eight palette colours** and **six fixed effects**.
  There is no custom RGB and no per-key RGB in this firmware generation.
- All animated firmware modes, including Reactive and the wave modes, can fire
  on both press and release; only Solid, White and Off are release-free.
- The app never sends the hardware-variant command (`0xFC`) or the firmware
  update command (`0xEF`). Both are hazardous and are not needed for normal use.

## Custom firmware?

The LEDs are individually addressable, but the stock firmware only exposes
eight global palette colours and drives the animations from the key matrix.
Both the lack of custom/per-key RGB and the key-up flash are firmware limits,
not LED limits. A replacement firmware could fix them, but it is a significant
reverse-engineering project with a real bricking risk and no published firmware
image. See **[FIRMWARE.md](FIRMWARE.md)** for the full feasibility assessment and
a safe investigation plan.

## Protocol reference

The browser speaks the documented CH57x keypad protocol:

- Device: vendor `0x514C`, product `0x8851`, usage page `0xFF00`, usage `0x01`.
- Report ID `0x03`, 64-byte payloads.
- Commands: `0xFA` read, `0xFB` identify, `0xFE` write, `0xFD` commit,
  `0xAA` separator. `0xFC` and `0xEF` are intentionally not implemented.
- Identify reply: `FB <keys> <knobs>`.
- A write is `record → delay record → AA AA → FD FE FF → AA AA`.
- The firmware returns the delay **inline in the binding record**, big-endian at
  bytes 4–5, even though it is written little-endian in a separate type-5
  record. This was measured on hardware and is handled in
  `docs/protocol.js`.
- LED record: `FE B0 <layer> 08 00 00 00 00 00 01 00 <(colour << 4) | mode>`.
  The app uses only this compact palette record for saved lighting.
- The newer SIKAI RGB-table packet
  (`FE B0 <zero-based-layer> <mode> <16 × RGB>`) was also tried on this unit; it
  wrote without changing the visible LEDs, so it is not used.

The implementation is independent; it follows the publicly documented protocol
and byte vectors, plus hardware observations from the tested pad.

## Project layout

```text
docs/                  static site published to GitHub Pages
  index.html
  styles.css
  keycodes.js          HID key/media catalogs and browser-code mapping
  protocol.js          encoding/decoding for the ch57x-1 protocol
  webhid.js            WebHID transport, read/write/verify
  app.js               UI, editor, firmware lighting, local backups
tests/
  protocol.test.cjs    protocol vectors (Node test runner)
start.py / start.bat   local static server (Python stdlib)
```

## Development

```sh
npm test
python start.py
```

No build step and no dependencies. Everything is plain HTML/CSS/JS. The tests use
Node's built-in test runner (Node 18 or newer).

## Credits

The protocol was cross-checked against the public notes and implementations in
the CH57x keypad ecosystem, including
[jvspier/macropad-rebind](https://github.com/jvspier/macropad-rebind),
[kriomant/ch57x-keyboard-tool](https://github.com/kriomant/ch57x-keyboard-tool),
[civcode/ch57x-keyboard-tool-cpp](https://github.com/civcode/ch57x-keyboard-tool-cpp),
[GialloInteractive/ch57x-mini-keyboard-configurator](https://github.com/GialloInteractive/ch57x-mini-keyboard-configurator),
and the public WebHID protocol documentation. No code from those projects is
bundled here.

## License

MIT.
