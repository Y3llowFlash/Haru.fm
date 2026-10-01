let pending;

export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    let settled = false;
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.id = 'haru-youtube-api';
    let timeout;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.onYouTubeIframeAPIReady = previous;
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.YT);
    };
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } catch { /* Do not let another callback block initialization. */ }
      if (window.YT?.Player) finish();
      else finish(new Error('YouTube did not finish loading. Please try again.'));
    };
    script.onerror = () => finish(new Error('Could not reach YouTube. Check your connection and try again.'));
    timeout = setTimeout(() => finish(new Error('YouTube is taking too long to load. Check your connection and try again.')), 20000);
    document.head.appendChild(script);
  }).catch((error) => { pending = null; throw error; });
  return pending;
}
