const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,200}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function parseYouTubeInput(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Paste a YouTube video or playlist link.');
  if (input.length > 2048) throw new Error('That link is too long.');
  if (VIDEO_ID.test(input)) return { kind: 'video', videoId: input, startSeconds: 0, canonicalURL: `https://www.youtube.com/watch?v=${input}` };
  let url;
  try { url = new URL(/^(?:www\.|youtube\.com|youtu\.be|music\.youtube\.com|m\.youtube\.com)/i.test(input) ? `https://${input}` : input); }
  catch { throw new Error('Use a YouTube video or playlist link.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    throw new Error('Use a link from youtube.com or youtu.be.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  let videoId = ['youtu.be', 'www.youtu.be'].includes(url.hostname) ? parts[0] : url.searchParams.get('v');
  if (['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1];
  const playlistId = url.searchParams.get('list');
  const startSeconds = parseTimestamp(url.searchParams.get('t') || url.searchParams.get('start') || url.hash.slice(1).replace(/^t=/, ''));
  if (playlistId && PLAYLIST_ID.test(playlistId)) {
    const rawIndex = Number(url.searchParams.get('index'));
    const index = Number.isInteger(rawIndex) && rawIndex >= 1 ? Math.min(rawIndex - 1, 9999) : 0;
    return { kind: 'playlist', playlistId, videoId: VIDEO_ID.test(videoId || '') ? videoId : null, index, startSeconds, canonicalURL: `https://www.youtube.com/playlist?list=${playlistId}` };
  }
  if (videoId && VIDEO_ID.test(videoId)) return { kind: 'video', videoId, startSeconds, canonicalURL: `https://www.youtube.com/watch?v=${videoId}` };
  throw new Error('This link does not contain a valid video or playlist.');
}

export function parseTimestamp(value) {
  if (!value) return 0;
  if (/^\d+s?$/.test(value)) return Math.min(Number(value.replace('s', '')), 604800);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match[0]) return 0;
  return Math.min(Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0), 604800);
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const time = Math.floor(seconds);
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const remainder = String(time % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

export function playerErrorMessage(code) {
  const messages = {
    2: 'YouTube could not read this link. Try another video.',
    5: 'YouTube could not play this video. Reload it or open it on YouTube.',
    100: 'This video is private, removed, or unavailable.',
    101: 'The owner does not allow embedded playback. Open this video on YouTube.',
    150: 'The owner does not allow embedded playback. Open this video on YouTube.',
    153: 'YouTube could not identify the app. Try the desktop build or open this video on YouTube.',
  };
  return messages[code] || 'This video could not be played. Try another link or open YouTube.';
}
