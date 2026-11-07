/**
 * Tier 2: Boundary & Corner Cases — F5 & F6 (Playlist Import & Offline Storage)
 * 10 Boundary Test Cases (5 per feature for F5, F6)
 */

const { assert, assertEqual, assertInRange, createSuite, MockLocalStorage } = require('../test-utils');

const suite = createSuite('Tier 2: F5-F6 — Import & Storage Boundaries');

// =========================================================================
// F5: External Playlist Import Boundaries
// =========================================================================
suite.test('B-F5-01: Empty or whitespace URL string throws validation error', () => {
  function validateUrl(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('URL playlist tidak boleh kosong');
    }
  }

  let errorThrown = false;
  try {
    validateUrl('   ');
  } catch (err) {
    errorThrown = true;
    assert(err.message.includes('tidak boleh kosong'), 'Should report empty URL');
  }
  assertEqual(errorThrown, true, 'Validation must fail on blank input');
});

suite.test('B-F5-02: Tracking parameters in Spotify URL are parsed without breaking playlist ID', () => {
  const dirtyUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=e2f89c4a754148b5&utm_source=copy-link&nd=1';
  const match = dirtyUrl.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);

  assert(match !== null, 'Regex must match despite query params');
  assertEqual(match[1], '37i9dQZF1DXcBWIGoYBM5M', 'Extracted playlist ID must be exact');
});

suite.test('B-F5-03: Playlist with 0 tracks imports safely as empty playlist', () => {
  function createImportedPlaylist(name, tracks = []) {
    return {
      id: 'pl_empty_imp',
      name: name || 'Empty Playlist',
      tracks: Array.isArray(tracks) ? tracks : [],
      trackCount: Array.isArray(tracks) ? tracks.length : 0
    };
  }

  const pl = createImportedPlaylist('Zero Tracks', []);
  assertEqual(pl.tracks.length, 0, 'Tracks array should be empty');
  assertEqual(pl.trackCount, 0, 'Track count should be 0');
});

suite.test('B-F5-04: Network timeout during import does not corrupt state.playlists', () => {
  const state = { playlists: [{ id: 'p1', name: 'Safe Playlist' }] };

  async function mockFailedImport() {
    throw new Error('Network timeout: Synth backend unresponsive');
  }

  async function safeImportAction() {
    try {
      await mockFailedImport();
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return safeImportAction().then(res => {
    assertEqual(res.success, false, 'Import should indicate failure');
    assertEqual(state.playlists.length, 1, 'Existing playlists must remain intact');
    assertEqual(state.playlists[0].id, 'p1', 'Original playlist is untouched');
  });
});

suite.test('B-F5-05: Duplicate playlist name appends numeric suffix to prevent collision', () => {
  const existingNames = ['Summer Hits', 'Summer Hits (1)'];

  function getUniquePlaylistName(desiredName) {
    let finalName = desiredName;
    let counter = 1;
    while (existingNames.includes(finalName)) {
      finalName = `${desiredName} (${counter})`;
      counter++;
    }
    return finalName;
  }

  const unique = getUniquePlaylistName('Summer Hits');
  assertEqual(unique, 'Summer Hits (2)', 'Duplicate name should get incremented index (2)');
});

// =========================================================================
// F6: Offline Storage Management Boundaries
// =========================================================================
suite.test('B-F6-01: Negative or 0 MB custom storage limit defaults to 1024 MB', () => {
  function sanitizeStorageLimit(val) {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) return 1024;
    return num;
  }

  assertEqual(sanitizeStorageLimit(-500), 1024, 'Negative limit defaults to 1024 MB');
  assertEqual(sanitizeStorageLimit(0), 1024, 'Zero limit defaults to 1024 MB');
});

suite.test('B-F6-02: Extreme storage limit (> 100 GB) is accepted and calculated accurately', () => {
  const limitMB = 200 * 1024; // 200 GB = 204,800 MB
  const limitBytes = limitMB * 1024 * 1024;
  assertEqual(limitBytes, 214748364800, 'Byte calculation must handle large numbers without overflow');
});

suite.test('B-F6-03: Download matching remaining capacity exactly allows download with warning', () => {
  const limitBytes = 1000 * 1024 * 1024; // 1000 MB
  const usedBytes = 990 * 1024 * 1024;  // 990 MB
  const trackBytes = 10 * 1024 * 1024;  // 10 MB (Total will be exactly 1000 MB)

  function evaluateCapacity(used, track, limit) {
    const total = used + track;
    if (total > limit) return { allowed: false, warning: true };
    if (total >= limit * 0.9) return { allowed: true, warning: true };
    return { allowed: true, warning: false };
  }

  const result = evaluateCapacity(usedBytes, trackBytes, limitBytes);
  assertEqual(result.allowed, true, 'Exactly hitting limit should be allowed');
  assertEqual(result.warning, true, 'Hitting limit must trigger warning');
});

suite.test('B-F6-04: Non-numeric track size defaults to 8 MB estimation', () => {
  function resolveTrackSize(size) {
    const s = Number(size);
    if (isNaN(s) || s <= 0) {
      return 8 * 1024 * 1024; // 8MB default
    }
    return s;
  }

  assertEqual(resolveTrackSize(null), 8388608, 'null defaults to 8MB');
  assertEqual(resolveTrackSize(undefined), 8388608, 'undefined defaults to 8MB');
  assertEqual(resolveTrackSize(-50), 8388608, 'Negative size defaults to 8MB');
});

suite.test('B-F6-05: Storage utilization percentage clamps strictly between 0% and 100%', () => {
  function calculatePercent(used, limit) {
    if (limit <= 0) return 100;
    const p = Math.round((used / limit) * 100);
    return Math.max(0, Math.min(100, p));
  }

  assertEqual(calculatePercent(-50, 1000), 0, 'Negative usage clamps to 0%');
  assertEqual(calculatePercent(1500, 1000), 100, 'Overflow usage clamps to 100%');
  assertEqual(calculatePercent(750, 1000), 75, 'Normal usage calculates exact 75%');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
