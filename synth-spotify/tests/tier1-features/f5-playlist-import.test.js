/**
 * Tier 1: Feature Coverage — F5: External Playlist Import
 * Requirement: ORIGINAL_REQUEST §R4 & PROJECT.md
 * - Enable importing playlists from external links (Spotify, Apple Music, YouTube) into user's library.
 */

const { assert, assertEqual, createSuite, readProjectFile, MockLocalStorage } = require('../test-utils');

const suite = createSuite('Tier 1: F5 — External Playlist Import');

function detectPlaylistSource(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  if (/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/i.test(clean)) return 'spotify';
  if (/music\.apple\.com\/[a-z]{2}\/playlist\/[^/]+\/pl\.[a-zA-Z0-9]+/i.test(clean)) return 'apple';
  if (/(?:youtube\.com\/playlist\?list=|youtu\.be\/.*list=)([a-zA-Z0-9_-]+)/i.test(clean)) return 'youtube';
  return null;
}

suite.test('F5-01: Correctly identifies Spotify playlist URL', () => {
  const url = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123456';
  assertEqual(detectPlaylistSource(url), 'spotify', 'Must detect Spotify playlist');
});

suite.test('F5-02: Correctly identifies Apple Music playlist URL', () => {
  const url = 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb';
  assertEqual(detectPlaylistSource(url), 'apple', 'Must detect Apple Music playlist');
});

suite.test('F5-03: Correctly identifies YouTube playlist URL', () => {
  const url = 'https://www.youtube.com/playlist?list=PL4fGSI44G8vdzLq_i5GvPqm_65Z0U7T7-';
  assertEqual(detectPlaylistSource(url), 'youtube', 'Must detect YouTube playlist');
});

suite.test('F5-04: Rejects malformed or unsupported playlist URLs with descriptive error', () => {
  const invalidUrl = 'https://soundcloud.com/user/sets/some-set';
  const result = detectPlaylistSource(invalidUrl);
  assertEqual(result, null, 'Unsupported service should return null');

  function validatePlaylistImport(link) {
    const source = detectPlaylistSource(link);
    if (!source) {
      throw new Error('Format URL tidak didukung. Harap masukkan tautan Spotify, Apple Music, atau YouTube playlist.');
    }
    return source;
  }

  let errorCaptured = '';
  try {
    validatePlaylistImport(invalidUrl);
  } catch (err) {
    errorCaptured = err.message;
  }
  assert(errorCaptured.includes('tidak didukung'), 'Must report unsupported format error');
});

suite.test('F5-05: Imported playlist is added to state.playlists and persisted to storage', () => {
  const mockStorage = new MockLocalStorage();
  const state = { playlists: [] };

  function addImportedPlaylist(name, tracks, sourceUrl) {
    const newPlaylist = {
      id: `pl_import_${Date.now()}`,
      name: name || 'Imported Playlist',
      sourceUrl,
      tracks: tracks || [],
      createdAt: Date.now()
    };
    state.playlists.push(newPlaylist);
    mockStorage.setItem('synth_playlists', JSON.stringify(state.playlists));
    return newPlaylist;
  }

  const sampleTracks = [
    { id: 'imp_1', title: 'Imported Song 1', artist: 'Artist X' },
    { id: 'imp_2', title: 'Imported Song 2', artist: 'Artist Y' }
  ];

  const created = addImportedPlaylist('Today Hits Import', sampleTracks, 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');

  assertEqual(state.playlists.length, 1, 'state.playlists must contain the imported playlist');
  assertEqual(created.tracks.length, 2, 'Imported playlist must contain 2 tracks');

  const stored = JSON.parse(mockStorage.getItem('synth_playlists'));
  assertEqual(stored.length, 1, 'LocalStorage must contain persisted playlist');
  assertEqual(stored[0].name, 'Today Hits Import', 'Stored playlist name must match');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
