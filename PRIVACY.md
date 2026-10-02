# Haru.fm privacy notes

Haru.fm does not create an account, run analytics, or sync your listening history to an app backend.

Your device stores your last pasted link, volume, window position and size, layout, pin state, and animation preference in Electron's application-data directory. The queue and saved playlists (names, video IDs, start timestamps, and public titles/channel names) are stored locally in `library.json` under the same directory. They are not synced to a Haru.fm server. The embedded player also uses its own browser session storage/cookies under that directory.

No YouTube player is loaded automatically when the app starts. Clicking Load or playing a queued song initializes the official YouTube embedded player. YouTube/Google receive the requests needed to display and play the video and may use their own cookies and service data. The desktop app also requests the video's public title and author from YouTube's oEmbed endpoint; displayed thumbnails are retrieved from YouTube. Adding a queue entry can request its public title/channel name before you play it.

YouTube's normal advertising, content availability, and regional restrictions apply. The full embedded video player remains loaded if you minimize the desktop window or cover it with another window; Haru.fm does not extract audio or guarantee access to every video. This requested background playback behavior is restricted by [YouTube's API developer policies](https://developers.google.com/youtube/terms/developer-policies#i.-additional-prohibitions), as explained in the README.

See [Google Privacy Policy](https://policies.google.com/privacy) and [YouTube Terms of Service](https://www.youtube.com/t/terms).
