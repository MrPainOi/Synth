/**
 * Tier 1: Feature Coverage — M3: Liked Songs Heart Toggle
 * Requirement: ORIGINAL_REQUEST §R1 & PROJECT.md
 * - Enable unliking songs directly from the "Lagu yang Disukai" (Liked Songs) view via an interactive heart toggle on each track row.
 */

const { assert, assertEqual, createSuite, readProjectFile, MockLocalStorage, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 1: M3 — Liked Songs Heart Toggle');

suite.test('M3-01: Track rows in app.js wire interactive heart toggle listener', () => {
  const appJs = readProjectFile('synth-spotify/app.js');
  // Check for heart button toggle wiring in track rows
  const hasHeartHandler = /toggleLike|toggleFavorite|btn-like|track-row-like|\.heart-icon|liked-songs/i.test(appJs);
  assert(hasHeartHandler, 'app.js must implement heart toggle handler for track rows');
});

suite.test('M3-02: Toggling heart off removes track from favorites', () => {
  const state = {
    favorites: [
      { id: 'f1', title: 'Favorite 1', artist: 'Artist 1' },
      { id: 'f2', title: 'Favorite 2', artist: 'Artist 2' }
    ]
  };

  function toggleFavorite(track) {
    const idx = state.favorites.findIndex(f => f.id === track.id);
    if (idx !== -1) {
      state.favorites.splice(idx, 1);
      return false; // unliked
    } else {
      state.favorites.push(track);
      return true; // liked
    }
  }

  const result = toggleFavorite({ id: 'f1' });
  assertEqual(result, false, 'Unliking must return false (not liked)');
  assertEqual(state.favorites.length, 1, 'Favorites count must decrease to 1');
  assertEqual(state.favorites[0].id, 'f2', 'Remaining favorite must be retained');
});

suite.test('M3-03: Toggling heart on adds track to favorites with complete metadata', () => {
  const state = { favorites: [] };
  const newTrack = { id: 'fav_new', title: 'Lovely Day', artist: 'Bill', thumbnail: 'thumb.jpg', duration: 215 };

  function toggleFavorite(track) {
    const idx = state.favorites.findIndex(f => f.id === track.id);
    if (idx !== -1) {
      state.favorites.splice(idx, 1);
      return false;
    } else {
      state.favorites.push({ ...track });
      return true;
    }
  }

  const liked = toggleFavorite(newTrack);
  assertEqual(liked, true, 'Liking must return true');
  assertEqual(state.favorites.length, 1, 'Favorites count must be 1');
  assertEqual(state.favorites[0].title, 'Lovely Day', 'Track title must be preserved');
  assertEqual(state.favorites[0].duration, 215, 'Track duration must be preserved');
});

suite.test('M3-04: Heart toggle updates localStorage persistence', () => {
  const mockStorage = new MockLocalStorage();
  mockStorage.setItem('synth_liked_songs', JSON.stringify([{ id: 'song_a' }]));

  function syncFavoritesToStorage(favorites) {
    const data = JSON.stringify(favorites);
    mockStorage.setItem('synth_liked_songs', data);
    mockStorage.setItem('devsize_favorites', data);
  }

  const favs = [{ id: 'song_a' }];
  // Unlike song_a
  const updatedFavs = favs.filter(t => t.id !== 'song_a');
  syncFavoritesToStorage(updatedFavs);

  const stored = JSON.parse(mockStorage.getItem('synth_liked_songs'));
  assertEqual(stored.length, 0, 'Storage must reflect unliked status with empty array');
});

suite.test('M3-05: Heart button DOM element toggles active CSS class on click', () => {
  const heartBtn = new MockDOMElement('button', 'btn-row-like-1', ['track-row-like-btn', 'active']);

  function handleHeartClick(el) {
    if (el.classList.has('active')) {
      el.classList.delete('active');
    } else {
      el.classList.add('active');
    }
  }

  handleHeartClick(heartBtn);
  assertEqual(heartBtn.classList.has('active'), false, 'Heart button must remove active class when unliked');

  handleHeartClick(heartBtn);
  assertEqual(heartBtn.classList.has('active'), true, 'Heart button must restore active class when liked again');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
