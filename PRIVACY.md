# Haru.fm privacy notes

Haru.fm does not create an account, run analytics, or sync your listening history to an app backend.

Your device stores your last pasted link, volume, window position and size, layout, pin state, and animation preference in Electron's application-data directory. The embedded player also uses its own browser session storage/cookies under that directory.

No YouTube player is loaded automatically when the app starts. Clicking Load initializes the official YouTube embedded player. YouTube/Google receive the requests needed to display and play the video and may use their own cookies and service data. The desktop app also requests the video's public title and author from YouTube's oEmbed endpoint; displayed thumbnails are retrieved from YouTube.

YouTube's normal advertising, content availability, regional restrictions, and embedding rules apply. Haru.fm cannot offer hidden audio-only playback or guaranteed access to every video.

See [Google Privacy Policy](https://policies.google.com/privacy) and [YouTube Terms of Service](https://www.youtube.com/t/terms).
