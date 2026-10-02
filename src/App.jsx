import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useYouTubePlayer } from './hooks/useYouTubePlayer.js';
import { parseYouTubeInput, formatTime } from './lib/youtube.js';
import { defaultPreferences, readPreferences, savePreferences } from './lib/preferences.js';
import Icon, { RecordMark } from './components/Icon.jsx';
import QueuePanel from './components/QueuePanel.jsx';
import { useQueueLibrary } from './hooks/useQueueLibrary.js';
import { MAX_TRACKS, trackSource } from '../shared/queue.mjs';
import PixelRoom from './components/PixelRoom.jsx';

export default function App() {
  const [prefs, setPrefs] = useState(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [input, setInput] = useState('');
  const [source, setSource] = useState(null);
  const [inputError, setInputError] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [notice, setNotice] = useState('');
  const library = useQueueLibrary(setNotice);
  const [queueOpen, setQueueOpen] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const currentIdRef = useRef(null);
  const transition = useRef(0);
  const endedFor = useRef(null);
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

  function selectCurrent(id) { currentIdRef.current = id; setCurrentId(id); }
  async function showQueue(open) {
    try { if (desktop) await window.haru.setQueuePanel(open); setQueueOpen(open); }
    catch { setNotice('Could not resize the queue panel.'); }
  }
  async function playQueued(track, autoplay = true) {
    if (!track) return;
    const request = ++transition.current;
    selectCurrent(track.id);
    const next = trackSource(track);
    setSource(next); setInputError(''); setNotice(''); setSeekDraft(null);
    const prepared = await video.load(next, autoplay);
    if (request !== transition.current) return;
    if (!prepared) setNotice('This queued track is unavailable. Retry it or choose the next song.');
  }
  function nextQueued() {
    const queue = library.current.current.queue;
    const index = queue.findIndex(track => track.id === currentIdRef.current);
    if (index >= 0 && queue[index + 1]) playQueued(queue[index + 1]);
  }
  function previousQueued() {
    if (video.currentTime > 3) { video.seek(0); return; }
    const index = library.queue.findIndex(track => track.id === currentId);
    if (index > 0) playQueued(library.queue[index - 1]); else video.seek(0);
  }
  useEffect(() => {
    if (video.status !== 'ended') { endedFor.current = null; return; }
    const track = library.current.current.queue.find(item => item.id === currentIdRef.current);
    if (!track || track.videoId !== video.videoId || endedFor.current === track.id) return;
    endedFor.current = track.id;
    nextQueued();
  }, [video.status, video.videoId]);
  async function addToQueue() {
    if (!library.ready) return;
    let parsed;
    try { parsed = parseYouTubeInput(input); if (!parsed.videoId) throw new Error('Add an individual video link. Use Load for YouTube playlists.'); }
    catch (error) { setInputError(error.message); return; }
    if (library.current.current.queue.length >= MAX_TRACKS) { setNotice('Your queue is full (500 songs).'); return; }
    const track = { id: crypto.randomUUID(), videoId: parsed.videoId, startSeconds: parsed.startSeconds, title: '', author: '' };
    library.change(value => ({ ...value, queue: [...value.queue, track] }));
    setInput(''); setInputError(''); setNotice('Added to your queue.');
    await showQueue(true);
    if (desktop) window.haru.getVideoMetadata(track.videoId).then(data => {
      if (data) library.change(value => ({ ...value, queue: value.queue.map(item => item.id === track.id ? { ...item, ...data } : item) }));
    }).catch(() => {});
  }
  function clearQueue() {
    transition.current++; video.pause(); selectCurrent(null);
    library.change(value => ({ ...value, queue: [] }));
  }
  function removeQueued(id) {
    const queue = library.current.current.queue;
    const index = queue.findIndex(item => item.id === id);
    const next = queue[index + 1];
    library.change(value => ({ ...value, queue: value.queue.filter(item => item.id !== id) }));
    if (id === currentIdRef.current) {
      if (next) playQueued(next, playing);
      else { transition.current++; video.pause(); selectCurrent(null); }
    }
  }
  function loadSaved(list, append) {
    const tracks = list.tracks.map(item => ({ ...item, id: crypto.randomUUID() }));
    if (!append) { transition.current++; video.pause(); selectCurrent(null); }
    library.change(value => ({ ...value, queue: append ? [...value.queue, ...tracks] : tracks }));
    setNotice(append ? 'Playlist appended to your queue.' : 'Playlist loaded. Select Play queue to begin.');
  }

  async function changeMode() {
    const mode = prefs.mode === 'mini' ? 'cozy' : 'mini';
    if (mode === 'mini' && queueOpen) await showQueue(false);
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
    transition.current++; selectCurrent(null);
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
    await video.load(source, Boolean(currentId));
  }

  const statusText = { idle: 'READY WHEN YOU ARE', loading: 'CONNECTING', cued: 'PRESS PLAY', playing: 'PLAYING', paused: 'PAUSED', buffering: 'BUFFERING', ended: 'FINISHED', error: 'UNAVAILABLE' }[video.status];
  const currentTrack = library.queue.find(item => item.id === currentId);
  const queueIndex = library.queue.findIndex(item => item.id === currentId);
  const trackTitle = metadata?.title || currentTrack?.title || (source ? source.kind === 'playlist' ? 'YouTube playlist' : 'YouTube video' : 'A little music. A little room.');

  return <div className={`app-window ${queueOpen ? 'queue-open' : ''} ${prefs.mode} ${playing ? 'is-playing' : ''} ${prefs.animations ? '' : 'still'}`}>
    <header className="titlebar">
      <span className="brand"><RecordMark /> Haru.fm <span className="brand-frequency">FM</span></span>
      <div className="window-actions">
        <button className="window-button queue-toggle" aria-label="Show queue" aria-expanded={queueOpen} title={`Queue · ${library.queue.length} songs`} disabled={!library.ready} onClick={() => showQueue(!queueOpen)}>≡</button>
        <button className="window-button" title={prefs.alwaysOnTop ? 'Unpin window' : 'Always on top'} onClick={pin} aria-label={prefs.alwaysOnTop ? 'Unpin window' : 'Pin window'} aria-pressed={prefs.alwaysOnTop}><Icon name="pin" size={17} /></button>
        <button className="window-button" title={prefs.mode === 'mini' ? 'Cozy Mode' : 'Mini Mode'} onClick={changeMode} aria-label={prefs.mode === 'mini' ? 'Switch to Cozy Mode' : 'Switch to Mini Mode'}><Icon name={prefs.mode === 'mini' ? 'cozy' : 'mini'} size={17} /></button>
        {desktop && <><button className="window-button" aria-label="Minimize window" title="Minimize" onClick={() => window.haru.minimize().catch(() => setNotice('Could not minimize the window.'))}><Icon name="minus" size={18} /></button><button className="window-button close-button" aria-label="Close window" title="Close" onClick={() => window.haru.close()}><Icon name="close" size={18} /></button></>}
      </div>
    </header>
    <div className="app-body"><main>
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
          <button onClick={currentId ? previousQueued : video.previous} disabled={!video.ready || !source} aria-label="Previous track or restart" title="Previous / restart"><Icon name="previous" size={23} /></button>
          <button className="play-button" onClick={playing ? video.pause : video.play} disabled={!video.ready || !source || video.status === 'error'} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause · Space' : 'Play · Space'}><Icon name={playing ? 'pause' : 'play'} size={27} /></button>
          <button onClick={currentId ? nextQueued : video.next} disabled={currentId ? busy || queueIndex < 0 || queueIndex >= library.queue.length - 1 : !video.ready || !video.playlist.length || video.playlistIndex >= video.playlist.length - 1} aria-label="Next track" title="Next track"><Icon name="next" size={23} /></button>
        </div>
        <label className="seek"><span className="sr-only">Seek</span><input aria-label="Seek" aria-valuetext={`${formatTime(seekDraft ?? video.currentTime)} of ${formatTime(video.duration)}`} style={{ '--range-progress': `${video.duration ? (seekDraft ?? video.currentTime) / video.duration * 100 : 0}%` }} type="range" min="0" max={Math.max(1, video.duration)} step="1" value={seekDraft ?? Math.min(video.currentTime, video.duration)} disabled={!video.ready || video.duration <= 0} onChange={(event) => setSeekDraft(Number(event.target.value))} onPointerUp={(event) => { video.seek(Number(event.currentTarget.value)); setSeekDraft(null); }} onKeyUp={(event) => { video.seek(Number(event.currentTarget.value)); setSeekDraft(null); }} onPointerCancel={() => setSeekDraft(null)} onBlur={() => { if (seekDraft !== null) video.seek(seekDraft); setSeekDraft(null); }} /></label>
        <div className="time-volume"><span className="time-display">{formatTime(seekDraft ?? video.currentTime)} <span className="time-divider">/</span> {video.duration ? formatTime(video.duration) : '—:—'}</span><div className="volume"><button onClick={toggleMute} aria-label={silent ? 'Unmute' : 'Mute'} title={silent ? 'Unmute' : 'Mute'} aria-pressed={silent}><Icon name={silent ? 'muted' : 'volume'} size={17} /></button><input aria-label="Volume" style={{ '--range-progress': `${prefs.volume}%` }} type="range" min="0" max="100" value={prefs.volume} onChange={(event) => setPrefs((previous) => ({ ...previous, volume: Number(event.target.value), muted: Number(event.target.value) === 0 }))} /><span>{prefs.volume}%</span></div></div>
      </section>
      <form className="link-form" onSubmit={submit}>
        <Icon name="link" size={18} />
        <label className="sr-only" htmlFor="youtube-link">YouTube video or playlist link</label>
        <input id="youtube-link" type="text" value={input} maxLength="2048" placeholder="Paste a YouTube or playlist link" onChange={(event) => { setInput(event.target.value); setInputError(''); }} autoComplete="off" spellCheck="false" disabled={!preferencesReady} aria-invalid={Boolean(inputError)} />
        <button type="button" onClick={addToQueue} disabled={!library.ready} title="Add individual video to queue">Add</button>
        <button type="submit" disabled={busy || !preferencesReady}>{busy ? 'Loading…' : 'Load'}</button>
      </form>
      {(inputError || video.error || notice) && <div className="message" role={inputError || video.status === 'error' ? 'alert' : 'status'}><span>{inputError || video.error || notice}</span>{video.status === 'error' && source && <button className="retry-button" onClick={retry} disabled={busy}>Retry</button>}{!video.error && <button aria-label="Dismiss notice" onClick={() => { setInputError(''); setNotice(''); }}><Icon name="close" size={15} /></button>}</div>}
      {!desktop && <p className="preview-note">Browser preview · floating and pinning are available in the desktop app.</p>}
    </main>{queueOpen && <QueuePanel library={library} currentId={currentId} errorId={video.status === 'error' ? currentId : null} onPlay={playQueued} onRemove={removeQueued} onClear={clearQueue} onLoad={loadSaved} onClose={() => showQueue(false)} onNotice={setNotice} />}</div>
    <footer><span>MUSIC · FOCUS · A BETTER DAY</span><button title={prefs.animations ? 'Room animations on' : 'Room animations off'} aria-label={prefs.animations ? 'Turn off room animations' : 'Turn on room animations'} aria-pressed={prefs.animations} onClick={() => setPrefs((previous) => ({ ...previous, animations: !previous.animations }))}><Icon name="motion" size={15} /><span>{prefs.animations ? 'ON' : 'OFF'}</span></button></footer>
  </div>;
}
