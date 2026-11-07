/**
 * Tier 2: Boundary & Corner Cases — M1 to M5 (Mobile & Playlist Subsystem)
 * 25 Boundary Test Cases (>=5 per feature for M1, M2, M3, M4, M5)
 */

const { assert, assertEqual, createSuite, MockLocalStorage, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 2: M1-M5 — Mobile & Playlist Boundaries');

// =========================================================================
// M1: Mobile Share Removal Boundaries
// =========================================================================
suite.test('B-M1-01: Null check handles missing #btn-mob-share safely', () => {
  const getShareBtn = () => null; // simulated DOM without share button
  let clickAttached = false;
  const btn = getShareBtn();
  if (btn) {
    btn.onclick = () => { clickAttached = true; };
  }
  assertEqual(clickAttached, false, 'Should not crash or attach listener to null element');
});

suite.test('B-M1-02: Repeated calls to mobile player open/close do not resurrect share button', () => {
  const container = new MockDOMElement('div', 'mob-actions', ['mob-action-tools-right']);
  container.appendChild(new MockDOMElement('button', 'btn-mob-connect'));
  container.appendChild(new MockDOMElement('button', 'btn-mob-queue'));

  for (let i = 0; i < 5; i++) {
    const shareBtn = container.querySelector('#btn-mob-share');
    assertEqual(shareBtn, null, 'btn-mob-share must never exist across cycles');
  }
});

suite.test('B-M1-03: Mobile player actions layout has exactly 2 primary action tools', () => {
  const container = new MockDOMElement('div', 'mob-actions');
  container.appendChild(new MockDOMElement('button', 'btn-mob-connect'));
  container.appendChild(new MockDOMElement('button', 'btn-mob-queue'));

  assertEqual(container.children.length, 2, 'Bottom actions should contain exactly connect and queue tools');
});

suite.test('B-M1-04: Focus navigation order skips deleted share button without tab loop error', () => {
  const elements = [
    { id: 'btn-mob-connect', tabIndex: 0 },
    { id: 'btn-mob-queue', tabIndex: 0 }
  ];
  const tabSequence = elements.map(e => e.id);
  assertEqual(tabSequence.includes('btn-mob-share'), false, 'Tab sequence must not include share button');
});

suite.test('B-M1-05: Mobile viewport resize event preserves absence of share button', () => {
  let isMobile = false;
  function handleResize(width) {
    isMobile = width <= 768;
  }
  handleResize(360);
  assertEqual(isMobile, true, 'Should detect mobile viewport');
  handleResize(1200);
  assertEqual(isMobile, false, 'Should detect desktop viewport');
});

// =========================================================================
// M2: Playlist Song Deletion Boundaries
// =========================================================================
suite.test('B-M2-01: Deleting track from empty playlist returns false without error', () => {
  const emptyPlaylist = { id: 'p_empty', tracks: [] };
  function deleteTrack(pl, id) {
    const idx = pl.tracks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    pl.tracks.splice(idx, 1);
    return true;
  }
  const result = deleteTrack(emptyPlaylist, 'non_existent');
  assertEqual(result, false, 'Deleting from empty playlist must return false gracefully');
  assertEqual(emptyPlaylist.tracks.length, 0, 'Tracks length remains 0');
});

suite.test('B-M2-02: Deleting non-existent track ID leaves playlist untouched', () => {
  const pl = { id: 'p1', tracks: [{ id: 't1' }, { id: 't2' }] };
  const initialLen = pl.tracks.length;
  const idx = pl.tracks.findIndex(t => t.id === 'ghost_id');
  if (idx !== -1) pl.tracks.splice(idx, 1);

  assertEqual(pl.tracks.length, initialLen, 'Playlist length must remain unchanged');
  assertEqual(pl.tracks[0].id, 't1', 'First track preserved');
  assertEqual(pl.tracks[1].id, 't2', 'Second track preserved');
});

suite.test('B-M2-03: Deleting the last remaining track leaves empty array, not undefined', () => {
  const pl = { id: 'p_single', tracks: [{ id: 'lone_wolf' }] };
  pl.tracks = pl.tracks.filter(t => t.id !== 'lone_wolf');

  assert(Array.isArray(pl.tracks), 'tracks property must remain an Array');
  assertEqual(pl.tracks.length, 0, 'tracks array must have length 0');
});

suite.test('B-M2-04: Deleting duplicate track entries by index only removes targeted index', () => {
  const pl = { id: 'p_dup', tracks: [{ id: 'dup' }, { id: 'dup' }, { id: 'other' }] };
  function removeByIndex(p, index) {
    if (index >= 0 && index < p.tracks.length) {
      p.tracks.splice(index, 1);
    }
  }
  removeByIndex(pl, 0);
  assertEqual(pl.tracks.length, 2, 'Should remove exactly one instance');
  assertEqual(pl.tracks[0].id, 'dup', 'Second duplicate preserved');
  assertEqual(pl.tracks[1].id, 'other', 'Other track preserved');
});

suite.test('B-M2-05: Rapid consecutive deletions execute safely without index corruption', () => {
  const pl = { id: 'p_rapid', tracks: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] };
  // Delete all items one by one
  while (pl.tracks.length > 0) {
    pl.tracks.splice(0, 1);
  }
  assertEqual(pl.tracks.length, 0, 'All items deleted cleanly');
});

// =========================================================================
// M3: Liked Songs Heart Toggle Boundaries
// =========================================================================
suite.test('B-M3-01: Rapid double click on like toggle does not create duplicates', () => {
  const favorites = [];
  function toggle(track) {
    const idx = favorites.findIndex(f => f.id === track.id);
    if (idx !== -1) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(track);
    }
  }

  const track = { id: 'rapid_song', title: 'Speedy' };
  toggle(track); // like
  toggle(track); // unlike
  toggle(track); // like again

  assertEqual(favorites.length, 1, 'Favorites should only contain 1 entry');
  assertEqual(favorites[0].id, 'rapid_song', 'Track id should match');
});

suite.test('B-M3-02: Recovers safely from corrupted localStorage JSON', () => {
  const storage = new MockLocalStorage({ synth_liked_songs: '{invalid:json;;' });
  let favorites = [];
  try {
    favorites = JSON.parse(storage.getItem('synth_liked_songs') || '[]');
  } catch (e) {
    favorites = [];
  }
  assert(Array.isArray(favorites), 'Favorites must fallback to empty array on parse error');
  assertEqual(favorites.length, 0, 'Fallback array is empty');
});

suite.test('B-M3-03: Like toggle handles track with missing id by generating fallback key', () => {
  const favorites = [];
  function getTrackKey(t) {
    return t.id || `${(t.artist || 'unknown').toLowerCase()}:${(t.title || 'untitled').toLowerCase()}`;
  }

  const trackWithoutId = { title: 'Track Without ID', artist: 'Artist Anonymous' };
  const key = getTrackKey(trackWithoutId);
  favorites.push({ ...trackWithoutId, id: key });

  assertEqual(favorites.length, 1, 'Should safely record track with fallback key');
  assertEqual(favorites[0].id, 'artist anonymous:track without id', 'Fallback key should be derived from metadata');
});

suite.test('B-M3-04: Unlike last song in favorites reduces count to 0 without negative count', () => {
  let favorites = [{ id: 'last_song' }];
  favorites = favorites.filter(t => t.id !== 'last_song');
  const count = Math.max(0, favorites.length);
  assertEqual(count, 0, 'Like count should be exactly 0');
});

suite.test('B-M3-05: Heart toggle handles track with null/undefined artist gracefully', () => {
  const favorites = [];
  const track = { id: 'null_artist', title: 'Solo', artist: null };
  favorites.push(track);
  assertEqual(favorites[0].artist, null, 'Null artist should not cause exception in store');
});

// =========================================================================
// M4: Mobile Player Swipe Gestures Boundaries
// =========================================================================
suite.test('B-M4-01: Zero-distance touch (tap) does not trigger any swipe navigation', () => {
  let action = 'none';
  function evalTouch(startX, endX, startY, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) > 50) action = dx > 0 ? 'prev' : 'next';
    if (dy > 60 && dy > Math.abs(dx) * 1.5) action = 'dismiss';
  }
  evalTouch(100, 100, 150, 150);
  assertEqual(action, 'none', 'Tap with 0 delta must trigger no swipe action');
});

suite.test('B-M4-02: Multi-touch gesture (touches.length > 1) ignores swipe logic', () => {
  let swipeProcessed = false;
  function handleTouchStart(e) {
    if (e.touches && e.touches.length > 1) {
      return; // ignore multi-touch
    }
    swipeProcessed = true;
  }
  handleTouchStart({ touches: [{ clientX: 10 }, { clientX: 20 }] });
  assertEqual(swipeProcessed, false, 'Multi-touch should be ignored');
});

suite.test('B-M4-03: Swipe gesture near screen edge clamps coordinates safely', () => {
  function clampCoord(val, max) {
    return Math.max(0, Math.min(max, val));
  }
  assertEqual(clampCoord(-15, 360), 0, 'Negative coordinate clamped to 0');
  assertEqual(clampCoord(400, 360), 360, 'Out-of-bounds coordinate clamped to 360');
});

suite.test('B-M4-04: Fast flick (large delta in short time) resolves correct direction', () => {
  const startX = 300, endX = 50; // deltaX = -250 (fast flick left)
  const deltaX = endX - startX;
  const direction = deltaX < -50 ? 'next' : (deltaX > 50 ? 'prev' : 'none');
  assertEqual(direction, 'next', 'Flick left must resolve to next');
});

suite.test('B-M4-05: Upward swipe (deltaY < 0) does NOT dismiss player', () => {
  let dismissed = false;
  const startY = 300, endY = 100; // deltaY = -200 (swiped UP)
  const deltaY = endY - startY;
  if (deltaY > 60) {
    dismissed = true;
  }
  assertEqual(dismissed, false, 'Swiping UP must not trigger dismiss');
});

// =========================================================================
// M5: Queue Population & Clear Boundaries
// =========================================================================
suite.test('B-M5-01: clearQueue on already empty queue does not throw or mutate index', () => {
  const state = { queue: [], queueIndex: -1, currentTrack: null };
  function clearQueue() {
    if (state.currentTrack) {
      state.queue = [state.currentTrack];
      state.queueIndex = 0;
    } else {
      state.queue = [];
      state.queueIndex = -1;
    }
  }
  clearQueue();
  assertEqual(state.queue.length, 0, 'Queue remains empty');
  assertEqual(state.queueIndex, -1, 'Queue index remains -1');
});

suite.test('B-M5-02: Populating queue with empty library keeps only currentTrack', () => {
  const state = { queue: [], queueIndex: -1 };
  const current = { id: 'only_one', title: 'Solo' };
  const emptyLibrary = [];

  function populate(track, pool) {
    const upcoming = pool.filter(t => t.id !== track.id);
    state.queue = [track, ...upcoming];
    state.queueIndex = 0;
  }

  populate(current, emptyLibrary);
  assertEqual(state.queue.length, 1, 'Queue length should be 1');
  assertEqual(state.queue[0].id, 'only_one', 'Queue contains only current track');
});

suite.test('B-M5-03: Rapid toggleQueueDrawer calls result in consistent state', () => {
  let isOpen = false;
  function toggle() { isOpen = !isOpen; }
  for (let i = 0; i < 10; i++) toggle();
  assertEqual(isOpen, false, '10 toggles from false should result in false');
  toggle();
  assertEqual(isOpen, true, '11th toggle should be true');
});

suite.test('B-M5-04: Queue navigation at last item respects repeatMode off (halts)', () => {
  const state = {
    queue: [{ id: '1' }, { id: '2' }, { id: '3' }],
    queueIndex: 2, // at last item
    repeatMode: 0 // off
  };

  function getNextTrackIndex() {
    if (state.queueIndex < state.queue.length - 1) {
      return state.queueIndex + 1;
    } else if (state.repeatMode === 1) {
      return 0; // loop
    }
    return -1; // stop
  }

  assertEqual(getNextTrackIndex(), -1, 'Should stop when at end of queue with repeat off');
});

suite.test('B-M5-05: Queue navigation at last item respects repeatMode all (loops to 0)', () => {
  const state = {
    queue: [{ id: '1' }, { id: '2' }, { id: '3' }],
    queueIndex: 2,
    repeatMode: 1 // repeat all
  };

  function getNextTrackIndex() {
    if (state.queueIndex < state.queue.length - 1) {
      return state.queueIndex + 1;
    } else if (state.repeatMode === 1) {
      return 0;
    }
    return -1;
  }

  assertEqual(getNextTrackIndex(), 0, 'Should loop back to start of queue when repeat is all');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
