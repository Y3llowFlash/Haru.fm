import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYouTubeAPI } from '../lib/youtube-api.js';
import { playerErrorMessage } from '../lib/youtube.js';

const initial = { status: 'idle', ready: false, error: '', videoId: null, currentTime: 0, duration: 0, playlist: [], playlistIndex: -1 };
const states = { '-1': 'loading', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };

export function useYouTubePlayer(hostRef, viewportRef, volume, muted, onAudioChange) {
  const [playback, setPlayback] = useState(initial);
  const playerRef = useRef(null);
  const initializationRef = useRef(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const audioRef = useRef({ volume, muted });
  const onAudioChangeRef = useRef(onAudioChange);
  const audioSettlingUntil = useRef(0);
  const instanceGeneration = useRef(0);
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
      // Native YouTube controls can change audio without a player-state event.
      // Let our asynchronous commands settle before reading the frame's cached values.
      if (Date.now() >= audioSettlingUntil.current) {
        const rawVolume = player.getVolume();
        if (Number.isFinite(rawVolume)) {
          const audio = { volume: Math.round(Math.max(0, Math.min(100, rawVolume))), muted: player.isMuted() };
          if (audio.volume !== audioRef.current.volume || audio.muted !== audioRef.current.muted) {
            audioRef.current = audio;
            onAudioChangeRef.current?.(audio);
          }
        }
      }
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
      const instance = ++instanceGeneration.current;
      return new Promise((resolve, reject) => {
        let settled = false;
        const isCurrent = (target) => mounted.current && instance === instanceGeneration.current && target === playerRef.current;
        const node = document.createElement('div');
        hostRef.current.replaceChildren(node);
        let timeout;
        const rejectReady = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          rejectReadyRef.current = null;
          if (instance === instanceGeneration.current) {
            instanceGeneration.current++;
            readyRef.current = false;
            const failed = playerRef.current;
            playerRef.current = null;
            failed?.destroy();
          }
          reject(error);
        };
        timeout = setTimeout(() => rejectReady(new Error('The YouTube player did not respond. Check your connection and try again.')), 20000);
        rejectReadyRef.current = rejectReady;
        try { playerRef.current = new YT.Player(node, {
          width: '100%', height: '100%',
          playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, origin: window.location.origin, widget_referrer: 'https://fm.haru.desktop/' },
          events: {
            onReady(event) {
              if (!isCurrent(event.target)) { event.target.destroy(); return; }
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              rejectReadyRef.current = null;
              readyRef.current = true;
              event.target.setVolume(audioRef.current.volume);
              audioRef.current.muted ? event.target.mute() : event.target.unMute();
              audioSettlingUntil.current = Date.now() + 1000;
              const iframe = event.target.getIframe();
              iframe.title = 'YouTube video player';
              iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              update({ ready: true });
              resolve(event.target);
            },
            onStateChange(event) {
              if (!isCurrent(event.target)) return;
              const status = states[event.data] || 'loading';
              if (event.data === 1 && (!visibilityRef.current || !nativeVisibilityRef.current || document.hidden)) { event.target.pauseVideo(); return; }
              update({ status, error: '' });
              sync();
            },
            onError(event) {
              if (!isCurrent(event.target)) return;
              const message = playerErrorMessage(event.data);
              update({ status: 'error', error: message });
              if (!readyRef.current) rejectReady(new Error(message));
            },
            onAutoplayBlocked(event) { if (isCurrent(event.target)) update({ status: 'cued', error: 'Press Play, or use the play button inside the YouTube video.' }); },
          },
        }); } catch (error) { rejectReady(error); }
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

  useEffect(() => { onAudioChangeRef.current = onAudioChange; }, [onAudioChange]);
  useEffect(() => {
    const previous = audioRef.current;
    audioRef.current = { volume, muted };
    if (!readyRef.current || !playerRef.current) return;
    if (volume !== previous.volume) playerRef.current.setVolume(volume);
    if (muted !== previous.muted) muted ? playerRef.current.mute() : playerRef.current.unMute();
    if (volume !== previous.volume || muted !== previous.muted) audioSettlingUntil.current = Date.now() + 1000;
  }, [volume, muted]);
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
      instanceGeneration.current++;
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
