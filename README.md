# Haru.fm

A tiny floating music companion for your desktop. Midnight pixel art, warm lamp light, and a real YouTube player.

## What it does

- Frameless, draggable, resizable Electron window with an always-on-top pin.
- **Cozy Mode:** a pixel listening room with a rotating vinyl, moving tonearm, soft lamp animation, and a visible CRT-framed YouTube player.
- **Mini Mode:** the same player and controls with the decorative room removed. Switching modes preserves playback.
- YouTube video and playlist links, including short, Shorts, live, Music, and timestamped links.
- Play/pause, seeking, volume, mute, previous/restart, and playlist next. Press **Space** outside an input or focused button to play/pause.
- Local persistence for your last link, volume, layout, pin state, motion preference, and each layout's window position and size.
- Playback-linked animations with a motion toggle and support for the system's reduced-motion preference.
- Actionable errors for unavailable videos and blocked embeds, with an **Open on YouTube** button.

The YouTube player stays visible and unobstructed in both modes. Loading a link cues it; press Play to begin. Minimizing, hiding the window, system suspend, or scrolling most of the player out of view pauses playback. Restoring the window does not autoplay.

## Windows download

Open the repository's **Actions → Windows app** page. After a successful run, download the **Haru.fm-Windows** artifact and extract it:

- `Haru.fm-0.1.0-x64-setup.exe`: installer with a desktop shortcut.
- `Haru.fm-0.1.0-x64-portable.exe`: portable version.

These development builds are unsigned. Windows may show a publisher/SmartScreen prompt. No certificate or signing credentials are configured in this repository.

## Run from source

Use Node.js **22.12 or later**. On Windows, open a terminal in this repository:

```sh
npm ci
npm run dev
```

`npm run dev` starts Vite, waits for it to listen, and opens Electron. Closing the app stops both processes.

For the built desktop app:

```sh
npm run build
npm start
```

For a browser-only layout preview:

```sh
npm run dev:web
```

Browser previews support playback and layouts but cannot provide native desktop pinning, dragging, minimizing, or app metadata lookup.

## Verify and package

```sh
npm run check
npm run dist:win
```

`check` runs the parser/preferences/security/static-server tests, builds the renderer, and launches an isolated Electron instance for deterministic UI and native-window checks. Its YouTube test double verifies integration behavior; it does not prove live YouTube audio/video delivery. The Windows workflow runs these checks and packages both download formats.

The Windows build is the primary target. The source can run on other desktop platforms with Electron, but macOS/Linux installers and platform-specific acceptance are outside this MVP.

## Playback and privacy

Haru.fm uses the **official YouTube IFrame Player API**. It does not download videos, extract audio, hide the player, or bypass ads or video restrictions. An internet connection is required, and video owners can prohibit embedding. Search, YouTube account sign-in, downloads, and cloud sync are not included.

No API key is required for this MVP. Links and preferences are saved on your device. The embedded player and thumbnails contact YouTube/Google, and the desktop app requests public video titles/channel names through YouTube's oEmbed endpoint. See [PRIVACY.md](PRIVACY.md).

## Project layout

```text
desktop/       Native window, validated IPC, preferences, local asset server
src/           React interface and YouTube player lifecycle
public/art/    Pixel room artwork
scripts/       Development runner and Electron UI verification
tests/         URL, persistence, server, and security checks
```

The renderer uses context isolation and sandboxing, has no Node.js access, and receives only a small named preload bridge. The packaged UI is served from a loopback-only asset server with a strict Content Security Policy. Native actions validate the calling main frame; external links are limited to HTTPS YouTube domains. YouTube requests carry the desktop app identifier `fm.haru.desktop` as their referrer.
