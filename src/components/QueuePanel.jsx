import React, { useState } from 'react';
import { MAX_PLAYLISTS, MAX_TRACKS, moveTrack, playNext } from '../../shared/queue.mjs';

export default function QueuePanel({ library, currentId, errorId, onPlay, onRemove, onClear, onLoad, onClose, onNotice }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = library.playlists.find(item => item.id === selected);
  function save(event) {
    event.preventDefault();
    if (!name.trim() || !library.queue.length || library.playlists.length >= MAX_PLAYLISTS) return;
    const id = crypto.randomUUID();
    library.change(value => ({ ...value, playlists: [...value.playlists, { id, name: name.trim(), tracks: value.queue }] }));
    setSelected(id); setName(''); onNotice('Playlist saved on this computer.');
  }
  return <aside className="queue-panel" aria-label="Queue and saved playlists">
    <div className="queue-heading"><h2>YOUR QUEUE <span>{library.queue.length}/{MAX_TRACKS}</span></h2><button onClick={onClose} aria-label="Close queue">×</button></div>
    <p className="queue-hint">Add individual video links below the player. Select a song to play it.</p>
    <div className="queue-toolbar"><button disabled={!library.ready || !library.queue.length} onClick={() => onPlay(library.queue[0])}>Play queue</button><button disabled={!library.queue.length} onClick={onClear}>Clear queue</button></div>
    <ol className="queue-tracks" aria-label="Music queue">
      {library.queue.map((track, index) => <li key={track.id} className={`${track.id === currentId ? 'current-track' : ''} ${track.id === errorId ? 'unavailable-track' : ''}`} data-track-id={track.id}>
        <button className="queue-track" aria-label={`Play queued track ${index + 1}`} aria-current={track.id === currentId ? 'true' : undefined} onClick={() => onPlay(track)}>
          <span className="queue-number">{track.id === currentId ? '▶' : index + 1}</span><span><strong title={track.title || track.videoId}>{track.title || `YouTube · ${track.videoId}`}</strong><small>{track.id === errorId ? 'Unavailable · Retry or skip' : track.author || 'YouTube video'}</small></span>
        </button>
        <div className="queue-row-actions">
          <button aria-label={`Move track ${index + 1} up`} disabled={index === 0} onClick={() => library.change(value => ({ ...value, queue: moveTrack(value.queue, track.id, index - 1) }))}>↑</button>
          <button aria-label={`Move track ${index + 1} down`} disabled={index === library.queue.length - 1} onClick={() => library.change(value => ({ ...value, queue: moveTrack(value.queue, track.id, index + 1) }))}>↓</button>
          <button disabled={track.id === currentId} onClick={() => library.change(value => ({ ...value, queue: playNext(value.queue, track.id, currentId) }))}>Play next</button>
          <button aria-label={`Remove track ${index + 1}`} onClick={() => onRemove(track.id)}>Remove</button>
        </div>
      </li>)}
      {!library.queue.length && <li className="queue-empty">Your next good songs go here.</li>}
    </ol>
    <section className="saved-playlists" aria-label="Saved playlists">
      <h3>SAVED PLAYLISTS <span>{library.playlists.length}/{MAX_PLAYLISTS}</span></h3>
      <form className="playlist-save" onSubmit={save}><input aria-label="Playlist name" value={name} maxLength={80} placeholder="Name your playlist" onChange={event => setName(event.target.value)} /><button disabled={!library.ready || !name.trim() || !library.queue.length || library.playlists.length >= MAX_PLAYLISTS}>Save new</button></form>
      <select aria-label="Saved playlist" value={list ? selected : ''} onChange={event => { setSelected(event.target.value); setConfirmDelete(false); setName(''); }}><option value="">Choose a playlist</option>{library.playlists.map(item => <option key={item.id} value={item.id}>{item.name} ({item.tracks.length})</option>)}</select>
      <div className="playlist-actions"><button disabled={!list} onClick={() => onLoad(list, false)}>Replace queue</button><button disabled={!list || library.queue.length + list.tracks.length > MAX_TRACKS} onClick={() => onLoad(list, true)}>Append</button></div>
      <div className="playlist-actions"><button disabled={!list || !name.trim()} onClick={() => { library.change(value => ({ ...value, playlists: value.playlists.map(item => item.id === list.id ? { ...item, name: name.trim() } : item) })); setName(''); }}>Rename</button><button disabled={!list} onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } library.change(value => ({ ...value, playlists: value.playlists.filter(item => item.id !== list.id) })); setSelected(''); setConfirmDelete(false); }}>{confirmDelete ? 'Confirm delete' : 'Delete playlist'}</button>{confirmDelete && <button onClick={() => setConfirmDelete(false)}>Cancel</button>}</div>
      <p className="queue-hint">Replace pauses playback. Appending keeps your current song. Saved lists stay after clearing the queue.</p>
    </section>
  </aside>;
}
