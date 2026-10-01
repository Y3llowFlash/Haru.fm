// Deterministic IFrame API fixture. This verifies integration, not live media delivery.
window.__haruCalls = [];
window.__playerCreations = 0;
window.YT = { Player: class {
  constructor(node, options) {
    this.options = options; this.time = 0; this.duration = 210; this.list = []; this.index = -1; this.id = null;
    this.volume = 100; this.muted = false;
    this.iframe = document.createElement('iframe');
    this.iframe.srcdoc = '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0d1522;color:#9baac0;font:14px monospace">Automated playback fixture</body>';
    node.replaceWith(this.iframe);
    window.__playerCreations++;
    window.__fakePlayer = this;
    if (!window.__holdPlayerReady) setTimeout(() => options.events.onReady({ target: this }), 0);
  }
  state(code) { this.options.events.onStateChange({ target: this, data: code }); }
  cueVideoById(source) { this.id = source.videoId; this.time = source.startSeconds || 0; this.list = []; this.index = -1; window.__haruCalls.push(['cueVideo', this.id]); if (window.__holdCueState) window.__completeCue = () => this.state(5); else this.state(5); }
  cuePlaylist(source) { this.list = ['jfKfPfyJRdk', '5qap5aO4i9A', 'DWcJFNfaw9c']; this.index = source.index || 0; this.id = this.list[this.index]; this.time = 0; window.__haruCalls.push(['cuePlaylist', this.index, source.list]); if (window.__holdCueState) window.__completeCue = () => this.state(5); else this.state(5); }
  playVideo() { window.__haruCalls.push(['play']); this.state(1); }
  pauseVideo() { window.__haruCalls.push(['pause']); this.state(2); }
  seekTo(value) { this.time = value; window.__haruCalls.push(['seek', value]); }
  setVolume(value) { this.volume = value; window.__haruCalls.push(['volume', value]); }
  getVolume() { return this.volume; }
  mute() { this.muted = true; window.__haruCalls.push(['mute']); }
  unMute() { this.muted = false; window.__haruCalls.push(['unmute']); }
  isMuted() { return this.muted; }
  nextVideo() { this.index = Math.min(this.index + 1, this.list.length - 1); this.id = this.list[this.index]; this.time = 0; window.__haruCalls.push(['next']); this.state(1); }
  previousVideo() { this.index = Math.max(0, this.index - 1); this.id = this.list[this.index]; this.time = 0; window.__haruCalls.push(['previous']); this.state(1); }
  getVideoUrl() { return this.id ? `https://www.youtube.com/watch?v=${this.id}` : ''; }
  getPlaylist() { return this.list; }
  getPlaylistIndex() { return this.index; }
  getCurrentTime() { return this.time; }
  getDuration() { return this.duration; }
  getIframe() { return this.iframe; }
  destroy() { this.iframe.remove(); }
} };
window.onYouTubeIframeAPIReady?.();
