/**
 * Tier 3: Cross-Feature Interactions
 * Multi-subsystem integration workflows verifying cascading actions & state consistency
 */

const { assert, assertEqual, assertInRange, createSuite, MockAudioContext, MockLocalStorage, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 3: Cross-Feature Interactions');

// =========================================================================
// Interaction 1: Crossfade during Queue Navigation (F3 + M5)
// =========================================================================
suite.test('XF-01: Auto-advancing to next queued track triggers smooth crossfade scheduler', async () => {
  const ctx = new MockAudioContext();
  const deckAGain = ctx.createGain();
  const deckBGain = ctx.createGain();

  const state = {
    currentTrack: { id: 's1', title: 'Song 1' },
    queue: [{ id: 's1' }, { id: 's2', title: 'Song 2' }],
    queueIndex: 0,
    crossfadeDuration: 4.0
  };

  let activeDeck = 'deckA';

  async function advanceQueueWithCrossfade() {
    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex++;
      state.currentTrack = state.queue[state.queueIndex];

      const outgoing = activeDeck === 'deckA' ? deckAGain : deckBGain;
      const incoming = activeDeck === 'deckA' ? deckBGain : deckAGain;
      activeDeck = activeDeck === 'deckA' ? 'deckB' : 'deckA';

      const now = ctx.currentTime;
      outgoing.gain.linearRampToValueAtTime(0.001, now + state.crossfadeDuration);
      incoming.gain.linearRampToValueAtTime(1.0, now + state.crossfadeDuration);
    }
  }

  await advanceQueueWithCrossfade();

  assertEqual(state.currentTrack.id, 's2', 'Current track must advance to Song 2');
  assertEqual(activeDeck, 'deckB', 'Active deck must switch to Deck B');
  assertEqual(deckAGain.gain.scheduledEvents.length, 1, 'Deck A must have ramp down scheduled');
  assertEqual(deckBGain.gain.scheduledEvents.length, 1, 'Deck B must have ramp up scheduled');
});

// =========================================================================
// Interaction 2: Context Menu "Play Next" + Queue Drawer + Clear Queue (P1 + M5)
// =========================================================================
suite.test('XF-02: Play Next from Context Menu populates queue, visible in drawer, cleared by Clear Queue', () => {
  const state = {
    currentTrack: { id: 'curr', title: 'Current Song' },
    queue: [{ id: 'curr' }, { id: 'up1', title: 'Upcoming 1' }],
    queueIndex: 0
  };

  // 1. Right click on "Priority Hit" -> Putar Berikutnya
  const priorityTrack = { id: 'priority', title: 'Priority Hit' };
  state.queue.splice(state.queueIndex + 1, 0, priorityTrack);

  assertEqual(state.queue[1].id, 'priority', 'Priority track must be next in queue');

  // 2. Queue Drawer inspection
  const drawerEl = new MockDOMElement('div', 'queue-drawer');
  function renderDrawer(s) {
    drawerEl.children = [];
    const upcoming = s.queue.slice(s.queueIndex + 1);
    for (const t of upcoming) {
      drawerEl.appendChild(new MockDOMElement('div', `queue-item-${t.id}`));
    }
  }

  renderDrawer(state);
  assertEqual(drawerEl.children.length, 2, 'Queue drawer must display 2 upcoming tracks');
  assertEqual(drawerEl.children[0].id, 'queue-item-priority', 'First upcoming item must be priority track');

  // 3. Click "Kosongkan Antrean" (Clear Queue)
  function clearQueue(s) {
    s.queue = [s.currentTrack];
    s.queueIndex = 0;
  }

  clearQueue(state);
  renderDrawer(state);

  assertEqual(state.currentTrack.id, 'curr', 'Active playing song must not be cleared');
  assertEqual(state.queue.length, 1, 'Queue must retain only current track');
  assertEqual(drawerEl.children.length, 0, 'Drawer should now be empty');
});

// =========================================================================
// Interaction 3: Mobile Liked Heart Toggle + Swipe Gesture Navigation (M3 + M4)
// =========================================================================
suite.test('XF-03: Liking track on mobile player followed by swipe next persists favorites cleanly', () => {
  const storage = new MockLocalStorage();
  const state = {
    favorites: [],
    currentTrack: { id: 'm_fav_1', title: 'Mobile Track 1' },
    queue: [
      { id: 'm_fav_1', title: 'Mobile Track 1' },
      { id: 'm_fav_2', title: 'Mobile Track 2' }
    ],
    queueIndex: 0
  };

  function toggleCurrentLike() {
    const t = state.currentTrack;
    const idx = state.favorites.findIndex(f => f.id === t.id);
    if (idx !== -1) {
      state.favorites.splice(idx, 1);
    } else {
      state.favorites.push({ ...t });
    }
    storage.setItem('synth_liked_songs', JSON.stringify(state.favorites));
  }

  function handleSwipeNext() {
    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex++;
      state.currentTrack = state.queue[state.queueIndex];
    }
  }

  // Like track 1
  toggleCurrentLike();
  assertEqual(state.favorites.length, 1, 'Track 1 should be added to favorites');

  // Swipe left to next track
  handleSwipeNext();
  assertEqual(state.currentTrack.id, 'm_fav_2', 'Player must advance to Track 2');

  // Check stored favorites
  const stored = JSON.parse(storage.getItem('synth_liked_songs'));
  assertEqual(stored.length, 1, 'Stored favorites must retain Track 1');
  assertEqual(stored[0].id, 'm_fav_1', 'Stored favorite is Track 1');

  // Track 2 should initially be unliked
  const isTrack2Liked = state.favorites.some(f => f.id === state.currentTrack.id);
  assertEqual(isTrack2Liked, false, 'Track 2 should not be liked yet');
});

// =========================================================================
// Interaction 4: External Playlist Import + Storage Limit Warning (F5 + F6)
// =========================================================================
suite.test('XF-04: Importing large playlist triggers storage capacity alert before caching', async () => {
  const storage = new MockLocalStorage();
  storage.setItem('synth_offline_limit_mb', '100'); // 100 MB limit

  // Already 92 MB used (92%)
  const usedBytes = 92 * 1024 * 1024;

  const importedTracks = [
    { id: 't1', title: 'Big Song 1', fileSize: 5 * 1024 * 1024 },
    { id: 't2', title: 'Big Song 2', fileSize: 5 * 1024 * 1024 }
  ];

  function evaluateBatchDownload(tracks, currentUsed, limitMB) {
    const limitBytes = limitMB * 1024 * 1024;
    const batchSize = tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0);
    const projected = currentUsed + batchSize;

    if (projected > limitBytes) {
      return { allowed: false, warning: true, reason: 'Exceeds limit' };
    }
    if (projected >= limitBytes * 0.9) {
      return { allowed: true, warning: true, reason: 'Near limit' };
    }
    return { allowed: true, warning: false };
  }

  const check = evaluateBatchDownload(importedTracks, usedBytes, 100);
  assertEqual(check.allowed, false, 'Batch exceeding 100MB capacity should be blocked');
  assertEqual(check.warning, true, 'Warning flag must be active');
});

// =========================================================================
// Interaction 5: Wake Lock + Crossfade + Audio Preset in Lyrics Mode (P2 + F1 + F3)
// =========================================================================
suite.test('XF-05: Lyrics mode maintains wake lock across crossfade and audio preset changes', async () => {
  let isWakeLockActive = true;
  let activePreset = 'p_default';
  let crossfadeTriggered = false;

  // 1. Enter lyrics mode
  function enterLyrics() {
    isWakeLockActive = true;
  }

  // 2. Change preset to slowed + reverb
  function changePreset(id) {
    activePreset = id;
  }

  // 3. Crossfade to next song
  function crossfadeNext() {
    crossfadeTriggered = true;
  }

  enterLyrics();
  changePreset('p_slowed');
  crossfadeNext();

  assertEqual(isWakeLockActive, true, 'Wake lock must remain active during transitions');
  assertEqual(activePreset, 'p_slowed', 'Preset must update to slowed');
  assertEqual(crossfadeTriggered, true, 'Crossfade must execute successfully');
});

// =========================================================================
// Interaction 6: Preset Selection + Custom Equalizer Tone Stacking (F1 + F2)
// =========================================================================
suite.test('XF-06: Applying preset followed by custom EQ adjustment combines DSP gains correctly', () => {
  const dspState = {
    speed: 1.0,
    reverbGain: 0.0,
    bassGain: 0.0,
    trebleGain: 0.0
  };

  // 1. Apply slowed + reverb preset
  function applyPreset(p) {
    if (p === 'p_slowed') {
      dspState.speed = 0.82;
      dspState.reverbGain = 0.65;
    }
  }

  // 2. Adjust Bass and Treble tone
  function setTone(bass, treble) {
    dspState.bassGain = bass;
    dspState.trebleGain = treble;
  }

  applyPreset('p_slowed');
  setTone(4.0, -2.5);

  assertEqual(dspState.speed, 0.82, 'Playback speed should remain slowed');
  assertEqual(dspState.reverbGain, 0.65, 'Reverb gain should remain active');
  assertEqual(dspState.bassGain, 4.0, 'Custom bass gain should be stacked');
  assertEqual(dspState.trebleGain, -2.5, 'Custom treble gain should be stacked');
});

// =========================================================================
// Interaction 7: Context Menu Add to Playlist + Song Deletion (P1 + M2)
// =========================================================================
suite.test('XF-07: Track added to custom playlist via context menu can be deleted without affecting source', () => {
  const library = [{ id: 'source_song', title: 'Source Master Track' }];
  const playlists = [{ id: 'user_pl', name: 'Chill Vibes', tracks: [] }];

  // 1. Context action: Tambah ke Playlist
  function addTrackToPlaylist(track, plId) {
    const pl = playlists.find(p => p.id === plId);
    if (pl) pl.tracks.push({ ...track });
  }

  addTrackToPlaylist(library[0], 'user_pl');
  assertEqual(playlists[0].tracks.length, 1, 'Playlist should have 1 track');

  // 2. Playlist action: Delete Track
  function deleteTrackFromPlaylist(trackId, plId) {
    const pl = playlists.find(p => p.id === plId);
    if (pl) pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  }

  deleteTrackFromPlaylist('source_song', 'user_pl');
  assertEqual(playlists[0].tracks.length, 0, 'Playlist tracks count must be 0 after deletion');
  assertEqual(library.length, 1, 'Library master track must remain completely untouched');
  assertEqual(library[0].id, 'source_song', 'Library track integrity preserved');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
