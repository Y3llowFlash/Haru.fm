# MVP verification

- Production renderer build: passed.
- Core checks: 9 passing tests covering URL formats and timestamps, deceptive hosts, persistence/restart behavior, privileged IPC sender validation, and packaged-server security.
- Electron UI checks: 22 passed using an isolated application-data directory and a deterministic YouTube player double. Covered loading without autoplay, play/pause animation state, seeking, volume/mute, playlist next/previous, mode switching without player recreation, minimum player dimensions, native resizing, minimizing, unavailable-video errors, Node.js isolation, and restart persistence.
- Linux headless verification checks the requested pin preference. Its compositor has no stacking order; the Windows workflow additionally verifies the real native always-on-top flag.
- Live YouTube attempt: the execution environment returned `net::ERR_EMPTY_RESPONSE` for `https://www.youtube.com/iframe_api`. The app showed its connection error correctly. Live audio/video streaming was therefore **not verified here**.

## Windows acceptance

After downloading or running the app on Windows:

1. Paste an embeddable YouTube video link, click Load, then Play. Confirm visible video and audible sound.
2. Pause, seek, change volume, mute and unmute.
3. Load a playlist and use Next/Previous.
4. Switch Cozy/Mini while playing. Confirm playback continues and the video remains visible.
5. Pin the app, switch to another application, and confirm Haru.fm remains above it. Drag the title bar and resize the window.
6. Minimize and restore. Confirm playback pauses and requires a fresh Play action.
7. Close and reopen. Confirm preferences restore and playback does not start automatically.

The GitHub Windows workflow builds the installer/portable downloads after these automated checks. It does not replace the live streaming acceptance above.
