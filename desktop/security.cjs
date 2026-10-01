const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);

function isSafeYouTubeURL(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && youtubeHosts.has(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function isTrustedIPC(event, window, origin) {
  try {
    return event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === origin;
  } catch { return false; }
}

function isDevelopmentURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

module.exports = { isSafeYouTubeURL, isTrustedIPC, isDevelopmentURL };
