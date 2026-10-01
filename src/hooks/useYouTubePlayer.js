import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYouTubeAPI } from '../lib/youtube-api.js';
import { playerErrorMessage } from '../lib/youtube.js';

const initial = { status: 'idle', ready: false, error: '', videoId: null, currentTime: 0, duration: 0, playlist: [], playlistIndex: -1 };
const states = { '-1': 'loading', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };

export function useYouTubePlayer(hostRef, viewportRef, volume) {
  const [playback, setPlayback] = useState(initial);
  const playerRef = useRef(null);
  const initializationRef = useRef(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const volumeRef = useRef(volume);
  const readyRef = useRef(false);
  const rejectReadyRef = useRef(null);
  const visibilityRef = useRef(true);
  const nativeVisibilityRef = useRef(true);
  const sourceRef = useRef(null);
  const pendingPlaylistVideo = useRef(null);

  const update = useCallback((patch) => { if (mounted.current) setPlayback((previous) => ({ ...previous, ...patch })); }, []);
  const pause = useCallback(() => { if (readyRef.current) playerRef.current?.pauseVideo(); }, []);

  const sync = useCallback(() => {
    const player = playerRef.current;
    if (!readyRef.current || !player) return;
    try {
      const url = player.getVideoUrl();
      const videoId = url ? new URL(url).searchParams.get('v') : null;
      const playlist = sourceRef.current?.kind === 'playlist' ? player.getPlaylist() || [] : [];
      const playlistIndex = playlist.length ? player.getPlaylistIndex() : -1;
      // A watch URL with a playlist but no index should start at its requested video.
      const desired = pendingPlaylistVideo.current;
      if (desired && playlist.length) {
        pendingPlaylistVideo.current = null;
        const index = playlist.indexOf(desired);
        if (index >= 0 && index !== playlistIndex) {
          player.cuePlaylist({ listType: 'playlist', list: sourceRef.current.playlistId, index, startSeconds: sourceRef.current.startSeconds });
          return;
        }
      }
      update({
        videoId: /^[A-Za-z0-9_-]{11}$/.test(videoId || '') ? videoId : null,
        currentTime: Math.max(0, player.getCurrentTime() || 0),
        duration: Math.max(0, player.getDuration() || 0),
        playlist, playlistIndex,
      });
    } catch { /* The embedded frame can briefly be unavailable while changing videos. */ }
  }, [update]);

  const ensurePlayer = useCallback(async () => {
    if (readyRef.current && playerRef.current) return playerRef.current;
    if (initializationRef.current) return initializationRef.current;
    initializationRef.current = (async () => {
      const YT = await loadYouTubeAPI();
      if (!mounted.current || !hostRef.current) throw new Error('Player closed.');
      return new Promise((resolve, reject) => {
        rejectReadyRef.current = reject;
        const node = document.createElement('div');
        hostRef.current.replaceChildren(node);
        const timeout = setTimeout(() => {
          rejectReadyRef.current = null;
          playerRef.current?.destroy();
          playerRef.current = null;
          reject(new Error('The YouTube player did not respond. Check your connection and load the link again.'));
        }, 20000);
        const rejectReady = (error) => { clearTimeout(timeout); rejectReadyRef.current = null; reject(error); };
        rejectReadyRef.current = rejectReady;
        playerRef.current = new YT.Player(node, {
          width: '100%', height: '100%',
          playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, origin: window.location.origin, widget_referrer: 'https://fm.haru.desktop/' },
          events: {
            onReady(event) {
              clearTimeout(timeout);
              rejectReadyRef.current = null;
              if (!mounted.current) { event.target.destroy(); reject(new Error('Player closed.')); return; }
              readyRef.current = true;
              event.target.setVolume(volumeRef.current);
              const iframe = event.target.getIframe();
              iframe.title = 'YouTube video player';
              iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              update({ ready: true });
              resolve(event.target);
            },
            onStateChange(event) {
              const status = states[event.data] || 'loading';
              if (event.data === 1 && (!visibilityRef.current || !nativeVisibilityRef.current || document.hidden)) { event.target.pauseVideo(); return; }
              update({ status, error: '' });
              sync();
            },
            onError(event) {
              const message = playerErrorMessage(event.data);
              update({ status: 'error', error: message });
              if (!readyRef.current) { rejectReady(new Error(message)); event.target.destroy(); playerRef.current = null; }
            },
            onAutoplayBlocked() { update({ status: 'cued', error: 'Press Play, or use the play button inside the YouTube video.' }); },
          },
        });
      });
    })().catch((error) => { initializationRef.current = null; throw error; });
    return initializationRef.current;
  }, [hostRef, update, sync]);

  const load = useCallback(async (source) => {
    const request = ++generation.current;
    sourceRef.current = source;
    pendingPlaylistVideo.current = source.kind === 'playlist' && source.videoId && source.index === 0 ? source.videoId : null;
    update({ status: 'loading', error: '', currentTime: 0, duration: 0, videoId: source.videoId || null, playlist: [], playlistIndex: -1 });
    try {
      const player = await ensurePlayer();
      if (request !== generation.current || !mounted.current) return false;
      if (source.kind === 'playlist') player.cuePlaylist({ listType: 'playlist', list: source.playlistId, index: source.index, startSeconds: source.startSeconds });
      else player.cueVideoById({ videoId: source.videoId, startSeconds: source.startSeconds });
      update({ ready: true, status: 'cued' });
      return true;
    } catch (error) {
      if (request === generation.current) update({ status: 'error', error: error.message, ready: readyRef.current });
      return false;
    }
  }, [ensurePlayer, update]);

  const play = useCallback(() => {
    if (!readyRef.current || !visibilityRef.current || !nativeVisibilityRef.current || document.hidden) return;
    update({ error: '' });
    playerRef.current.playVideo();
  }, [update]);
  const seek = useCallback((seconds) => {
    if (!readyRef.current || !Number.isFinite(seconds)) return;
    playerRef.current.seekTo(Math.max(0, Math.min(seconds, playerRef.current.getDuration() || 0)), true);
    sync();
  }, [sync]);
  const next = useCallback(() => { if (readyRef.current && sourceRef.current?.kind === 'playlist' && playerRef.current.getPlaylist()?.length) { update({ error: '' }); playerRef.current.nextVideo(); } }, [update]);
  const previous = useCallback(() => {
    if (!readyRef.current) return;
    if (playerRef.current.getCurrentTime() > 3 || sourceRef.current?.kind !== 'playlist' || !playerRef.current.getPlaylist()?.length) seek(0);
    else playerRef.current.previousVideo();
  }, [seek]);

  useEffect(() => { volumeRef.current = volume; if (readyRef.current) playerRef.current?.setVolume(volume); }, [volume]);
  useEffect(() => {
    mounted.current = true;
    const interval = setInterval(sync, 500);
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    const removeNative = window.haru?.onVisibilityChange((visible) => { nativeVisibilityRef.current = visible; if (!visible) pause(); });
    const observer = new IntersectionObserver(([entry]) => {
      visibilityRef.current = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      if (!visibilityRef.current) pause();
    }, { threshold: [0, 0.5, 1] });
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      removeNative?.();
      observer.disconnect();
      rejectReadyRef.current?.(new Error('Player closed.'));
      rejectReadyRef.current = null;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      initializationRef.current = null;
    };
  }, [pause, sync, viewportRef]);

  return { ...playback, load, play, pause, seek, next, previous };
}
