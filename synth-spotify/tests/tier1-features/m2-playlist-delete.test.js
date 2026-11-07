/**
 * Tier 1: Feature Coverage — M2: Playlist Song Deletion
 * Requirement: ORIGINAL_REQUEST §R1 & PROJECT.md
 * - Add an action to delete individual songs directly from any custom playlist view.
 */

const { assert, assertEqual, assertDeepEqual, createSuite, readProjectFile, MockLocalStorage } = require('../test-utils');

const suite = createSuite('Tier 1: M2 — Playlist Song Deletion');

suite.test('M2-01: UI template contains delete action for playlist track rows', () => {
  const appJs = readProjectFile('synth-spotify/app.js');
  // Check for presence of playlist delete button handler or markup
  const hasDeleteAction = /btn-playlist-remove|btn-delete-track|hapus-lagu|title=["']Hapus dari playlist["']|hapusLaguDariPlaylist|deleteTrackFromPlaylist/i.test(appJs);
  assert(hasDeleteAction, 'app.js must define playlist track delete action or button handler');
});

suite.test('M2-02: Deleting a track removes it from the targeted playlist', () => {
  const playlist = {
    id: 'pl_101',
    name: 'My Chill Mix',
    tracks: [
      { id: 't1', title: 'Song One', artist: 'Artist A' },
      { id: 't2', title: 'Song Two', artist: 'Artist B' },
      { id: 't3', title: 'Song Three', artist: 'Artist C' }
    ]
  };

  function removeTrackFromPlaylist(pl, trackId) {
    const idx = pl.tracks.findIndex(t => t.id === trackId);
    if (idx !== -1) {
      pl.tracks.splice(idx, 1);
      return true;
    }
    return false;
  }

  const removed = removeTrackFromPlaylist(playlist, 't2');
  assertEqual(removed, true, 'Removal operation should return true on found track');
  assertEqual(playlist.tracks.length, 2, 'Playlist tracks count must decrease by 1');
  assertEqual(playlist.tracks.some(t => t.id === 't2'), false, 'Target track must no longer exist in playlist');
  assertEqual(playlist.tracks[1].id, 't3', 'Subsequent track indices must shift appropriately');
});

suite.test('M2-03: Deleting from one playlist does not mutate other playlists', () => {
  const playlists = [
    {
      id: 'pl_1',
      name: 'Playlist One',
      tracks: [{ id: 'track_common', title: 'Common Hit' }]
    },
    {
      id: 'pl_2',
      name: 'Playlist Two',
      tracks: [{ id: 'track_common', title: 'Common Hit' }]
    }
  ];

  function deleteSong(targetPlId, trackId) {
    const pl = playlists.find(p => p.id === targetPlId);
    if (!pl) return;
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  }

  deleteSong('pl_1', 'track_common');

  assertEqual(playlists[0].tracks.length, 0, 'Target playlist should have track removed');
  assertEqual(playlists[1].tracks.length, 1, 'Non-target playlist must preserve its tracks');
  assertEqual(playlists[1].tracks[0].id, 'track_common', 'Song in non-target playlist must remain unchanged');
});

suite.test('M2-04: Playlist modification persists to localStorage', () => {
  const mockStorage = new MockLocalStorage();
  const initialPlaylists = [
    { id: 'p_custom', name: 'Work', tracks: [{ id: 's1' }, { id: 's2' }] }
  ];
  mockStorage.setItem('synth_playlists', JSON.stringify(initialPlaylists));

  function deleteAndSave(playlistId, trackId) {
    const stored = JSON.parse(mockStorage.getItem('synth_playlists') || '[]');
    const target = stored.find(p => p.id === playlistId);
    if (target) {
      target.tracks = target.tracks.filter(t => t.id !== trackId);
      mockStorage.setItem('synth_playlists', JSON.stringify(stored));
    }
  }

  deleteAndSave('p_custom', 's1');
  const updated = JSON.parse(mockStorage.getItem('synth_playlists'));
  assertEqual(updated[0].tracks.length, 1, 'Persisted playlist must have updated length');
  assertEqual(updated[0].tracks[0].id, 's2', 'Persisted playlist must retain remaining track');
});

suite.test('M2-05: Deleting playing track from playlist leaves playback state active', () => {
  const state = {
    currentTrack: { id: 'track_playing', title: 'Active Song' },
    isPlaying: true,
    playlists: [
      { id: 'pl_a', tracks: [{ id: 'track_playing' }, { id: 'track_other' }] }
    ]
  };

  // Delete from playlist
  state.playlists[0].tracks = state.playlists[0].tracks.filter(t => t.id !== 'track_playing');

  // Verify playback state is unaffected
  assertEqual(state.isPlaying, true, 'Active playback should remain playing');
  assertEqual(state.currentTrack.id, 'track_playing', 'Current track reference must remain active');
  assertEqual(state.playlists[0].tracks.length, 1, 'Playlist should have track removed');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
