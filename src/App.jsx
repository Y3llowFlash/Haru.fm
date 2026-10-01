import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useYouTubePlayer } from './hooks/useYouTubePlayer.js';
import { parseYouTubeInput, formatTime } from './lib/youtube.js';
import { defaultPreferences, readPreferences, savePreferences } from './lib/preferences.js';
import Icon, { RecordMark } from './components/Icon.jsx';
import PixelRoom from './components/PixelRoom.jsx';

export default function App() {
  const [prefs, setPrefs] = useState(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [input, setInput] = useState('');
  const [source, setSource] = useState(null);
  const [inputError, setInputError] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [notice, setNotice] = useState('');
  const [seekDraft, setSeekDraft] = useState(null);
  const lastVolume = useRef(65);
  const host = useRef(null);
  const viewport = useRef(null);
  const updateAudio = useCallback((audio) => setPrefs((previous) => ({ ...previous, ...audio })), []);
  const video = useYouTubePlayer(host, viewport, prefs.volume, prefs.muted, updateAudio);
  const desktop = Boolean(window.haru);
  const playing = video.status === 'playing';
  const busy = video.status === 'loading';
  const silent = prefs.muted || prefs.volume === 0;

  useEffect(() => {
    let alive = true;
    readPreferences().then((next) => {
      if (!alive) return;
      setPrefs(next); setInput(next.lastInput || ''); setPreferencesReady(true);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    // Persist immediately so closing after a mute/volume change cannot lose it.
    savePreferences({ volume: prefs.volume, muted: prefs.muted, animations: prefs.animations }).catch(() => setNotice('Your preferences could not be saved.'));
  }, [prefs.volume, prefs.muted, prefs.animations, preferencesReady]);
  useEffect(() => { if (prefs.volume > 0) lastVolume.current = prefs.volume; }, [prefs.volume]);
  useEffect(() => {
    let alive = true;
    setMetadata(null);
    if (video.videoId && window.haru) window.haru.getVideoMetadata(video.videoId).then((data) => { if (alive) setMetadata(data); }).catch(() => {});
    return () => { alive = false; };
  }, [video.videoId]);
  useEffect(() => {
    const handleKey = (event) => {
      if (event.code !== 'Space' || /INPUT|TEXTAREA|BUTTON|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault();
      if (video.ready) playing ? video.pause() : video.play();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [video.ready, playing, video.pause, video.play]);

  async function changeMode() {
    const mode = prefs.mode === 'mini' ? 'cozy' : 'mini';
    try {
      if (desktop) await window.haru.setMode(mode);
      else await savePreferences({ mode });
      setPrefs((previous) => ({ ...previous, mode }));
    } catch { setNotice('Could not change the window size. Please try again.'); }
  }
  async function pin() {
    if (!desktop) { setNotice('Pinning works in the desktop app.'); return; }
    try {
      const alwaysOnTop = await window.haru.setPinned(!prefs.alwaysOnTop);
      setPrefs((previous) => ({ ...previous, alwaysOnTop }));
    } catch { setNotice('Could not pin the window. Please try again.'); }
  }
  async function submit(event) {
    event.preventDefault();
    setInputError(''); setNotice('');
    let next;
    try { next = parseYouTubeInput(input); }
    catch (error) { setInputError(error.message); return; }
    setSource(next);
    setSeekDraft(null);
    savePreferences({ lastInput: input.trim() }).catch(() => {});
    await video.load(next);
  }
  function openYouTube() {
    const url = video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : source?.canonicalURL;
    if (!url) return;
    if (desktop) window.haru.openYouTube(url).catch(() => setNotice('Could not open YouTube.'));
    else window.open(url, '_blank', 'noopener');
  }

  function toggleMute() {
    setPrefs((previous) => silent
      ? { ...previous, muted: false, volume: previous.volume || lastVolume.current || 65 }
      : { ...previous, muted: true });
  }

  async function retry() {
    if (!source || busy) return;
    setInputError(''); setNotice(''); setSeekDraft(null);
    await video.load(source);
  }

  const statusText = { idle: 'READY WHEN YOU ARE', loading: 'CONNECTING', cued: 'PRESS PLAY', playing: 'PLAYING', paused: 'PAUSED', buffering: 'BUFFERING', ended: 'FINISHED', error: 'UNAVAILABLE' }[video.status];
  const trackTitle = metadata?.title || (source ? source.kind === 'playlist' ? 'YouTube playlist' : 'YouTube video' : 'A little music. A little room.');

  return <div className={`app-window ${prefs.mode} ${playing ? 'is-playing' : ''} ${prefs.animations ? '' : 'still'}`}>
    <header className="titlebar">
      <span className="brand"><RecordMark /> Haru.fm <span className="brand-frequency">FM</span></span>
      <div className="window-actions">
        <button className="window-button" title={prefs.alwaysOnTop ? 'Unpin window' : 'Always on top'} onClick={pin} aria-label={prefs.alwaysOnTop ? 'Unpin window' : 'Pin window'} aria-pressed={prefs.alwaysOnTop}><Icon name="pin" size={17} /></button>
        <button className="window-button" title={prefs.mode === 'mini' ? 'Cozy Mode' : 'Mini Mode'} onClick={changeMode} aria-label={prefs.mode === 'mini' ? 'Switch to Cozy Mode' : 'Switch to Mini Mode'}><Icon name={prefs.mode === 'mini' ? 'cozy' : 'mini'} size={17} /></button>
        {desktop && <><button className="window-button" aria-label="Minimize window" title="Minimize" onClick={() => { video.pause(); window.haru.minimize(); }}><Icon name="minus" size={18} /></button><button className="window-button close-button" aria-label="Close window" title="Close" onClick={() => window.haru.close()}><Icon name="close" size={18} /></button></>}
      </div>
    </header>
    <main>
      {prefs.mode === 'cozy' && <div className="room-space"><PixelRoom /></div>}
      <section className="monitor" aria-label="YouTube playback">
        <div className="monitor-label"><span className="youtube-brand"><Icon name="youtube" size={15} /> YouTube</span><span>{statusText}</span></div>
        <div className="player-space"><div className="player-viewport" ref={viewport}>
          <div className="player-host" ref={host} />
          {video.status === 'idle' && <div className="empty-player"><RecordMark size={56} /><span>Make yourself at home.</span><p>Paste a YouTube link below to begin.</p></div>}
        </div></div>
        <div className="monitor-bottom"><span className="speaker-grille" /><span>HARU.FM · STEREO</span><span className={`monitor-led ${playing ? 'lit' : ''}`} /></div>
      </section>
      <section className="transport" aria-label="Playback controls">
        <div className="track-info">
          <div className="track-art">{video.videoId ? <img key={video.videoId} src={`https://i.ytimg.com/vi/${video.videoId}/default.jpg`} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /> : <RecordMark size={42} />}</div>
          <div><span className="eyebrow">{playing ? 'NOW PLAYING' : video.ready ? 'ON THE TURNTABLE' : 'YOUR NEXT GOOD SONG'}</span><h1 title={trackTitle}>{trackTitle}</h1><p>{metadata?.author || (video.playlist.length ? `Track ${video.playlistIndex + 1} of ${video.playlist.length}` : 'Powered by YouTube')}</p></div>
          <button className="youtube-link" disabled={!source} onClick={openYouTube} title="Open on YouTube" aria-label="Open current video on YouTube"><Icon name="external" size={17} /></button>
        </div>
        <div className="transport-buttons">
          <button onClick={video.previous} disabled={!video.ready || !source} aria-label="Previous track or restart" title="Previous / restart"><Icon name="previous" size={23} /></button>
          <button className="play-button" onClick={playing ? video.pause : video.play} disabled={!video.ready || !source || video.status === 'error'} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause · Space' : 'Play · Space'}><Icon name={playing ? 'pause' : 'play'} size={27} /></button>
          <button onClick={video.next} disabled={!video.ready || !video.playlist.length || video.playlistIndex >= video.playlist.length - 1} aria-label="Next track" title="Next track"><Icon name="next" size={23} /></button>
        </div>
        <label className="seek"><span className="sr-only">Seek</span><input aria-label="Seek" aria-valuetext={`${formatTime(seekDraft ?? video.currentTime)} of ${formatTime(video.duration)}`} style={{ '--range-progress': `${video.duration ? (seekDraft ?? video.currentTime) / video.duration * 100 : 0}%` }} type="range" min="0" max={Math.max(1, video.duration)} step="1" value={seekDraft ?? Math.min(video.currentTime, video.duration)} disabled={!video.ready || video.duration <= 0} onChange={(event) => setSeekDraft(Number(event.target.value))} onPointerUp={(event) => { video.seek(Number(event.currentTarget.value)); setSeekDraft(null); }} onKeyUp={(event) => { video.seek(Number(event.currentTarget.value)); setSeekDraft(null); }} onPointerCancel={() => setSeekDraft(null)} onBlur={() => { if (seekDraft !== null) video.seek(seekDraft); setSeekDraft(null); }} /></label>
        <div className="time-volume"><span className="time-display">{formatTime(seekDraft ?? video.currentTime)} <span className="time-divider">/</span> {video.duration ? formatTime(video.duration) : '—:—'}</span><div className="volume"><button onClick={toggleMute} aria-label={silent ? 'Unmute' : 'Mute'} title={silent ? 'Unmute' : 'Mute'} aria-pressed={silent}><Icon name={silent ? 'muted' : 'volume'} size={17} /></button><input aria-label="Volume" style={{ '--range-progress': `${prefs.volume}%` }} type="range" min="0" max="100" value={prefs.volume} onChange={(event) => setPrefs((previous) => ({ ...previous, volume: Number(event.target.value), muted: Number(event.target.value) === 0 }))} /><span>{prefs.volume}%</span></div></div>
      </section>
      <form className="link-form" onSubmit={submit}>
        <Icon name="link" size={18} />
        <label className="sr-only" htmlFor="youtube-link">YouTube video or playlist link</label>
        <input id="youtube-link" type="text" value={input} maxLength="2048" placeholder="Paste a YouTube or playlist link" onChange={(event) => { setInput(event.target.value); setInputError(''); }} autoComplete="off" spellCheck="false" disabled={!preferencesReady} aria-invalid={Boolean(inputError)} />
        <button type="submit" disabled={busy || !preferencesReady}>{busy ? 'Loading…' : 'Load'}</button>
      </form>
      {(inputError || video.error || notice) && <div className="message" role={inputError || video.status === 'error' ? 'alert' : 'status'}><span>{inputError || video.error || notice}</span>{video.status === 'error' && source && <button className="retry-button" onClick={retry} disabled={busy}>Retry</button>}{!video.error && <button aria-label="Dismiss notice" onClick={() => { setInputError(''); setNotice(''); }}><Icon name="close" size={15} /></button>}</div>}
      {!desktop && <p className="preview-note">Browser preview · floating and pinning are available in the desktop app.</p>}
    </main>
    <footer><span>MUSIC · FOCUS · A BETTER DAY</span><button title={prefs.animations ? 'Room animations on' : 'Room animations off'} aria-label={prefs.animations ? 'Turn off room animations' : 'Turn on room animations'} aria-pressed={prefs.animations} onClick={() => setPrefs((previous) => ({ ...previous, animations: !previous.animations }))}><Icon name="motion" size={15} /><span>{prefs.animations ? 'ON' : 'OFF'}</span></button></footer>
  </div>;
}
