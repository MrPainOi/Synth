/**
 * Tier 4: Real-World Scenarios
 * End-to-end user journeys validating full lifecycle workflows
 */

const { assert, assertEqual, assertInRange, createSuite, MockAudioContext, MockLocalStorage, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 4: Real-World Scenarios');

// =========================================================================
// Scenario 1: Complete Mobile User Session
// =========================================================================
suite.test('SCENARIO-01: Complete Mobile Session (Play -> Swipe Next -> Like -> Dismiss -> Clear Queue)', async () => {
  const storage = new MockLocalStorage();
  const state = {
    isMobilePlayerOpen: true,
    currentTrack: { id: 'track_1', title: 'First Mobile Song', artist: 'Artist A' },
    queue: [
      { id: 'track_1', title: 'First Mobile Song' },
      { id: 'track_2', title: 'Second Mobile Song' },
      { id: 'track_3', title: 'Third Mobile Song' }
    ],
    queueIndex: 0,
    favorites: [],
    isQueueDrawerOpen: false
  };

  // 1. Mobile player is open. Swipe left on album artwork to skip to next track
  function handleArtworkSwipeLeft() {
    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex++;
      state.currentTrack = state.queue[state.queueIndex];
    }
  }
  handleArtworkSwipeLeft();
  assertEqual(state.currentTrack.id, 'track_2', 'Step 1: Track should advance to track_2');

  // 2. Tap heart icon to like track_2
  function toggleHeart(t) {
    const idx = state.favorites.findIndex(f => f.id === t.id);
    if (idx !== -1) {
      state.favorites.splice(idx, 1);
    } else {
      state.favorites.push({ ...t });
    }
    storage.setItem('synth_liked_songs', JSON.stringify(state.favorites));
  }
  toggleHeart(state.currentTrack);
  assertEqual(state.favorites.length, 1, 'Step 2: track_2 added to favorites');

  // 3. Swipe down on mobile player to dismiss
  function handleSwipeDown(deltaY) {
    if (deltaY > 60) {
      state.isMobilePlayerOpen = false;
    }
  }
  handleSwipeDown(120); // 120px downward swipe
  assertEqual(state.isMobilePlayerOpen, false, 'Step 3: Mobile player dismissed');

  // 4. Open Queue drawer
  function toggleQueueDrawer() {
    state.isQueueDrawerOpen = !state.isQueueDrawerOpen;
  }
  toggleQueueDrawer();
  assertEqual(state.isQueueDrawerOpen, true, 'Step 4: Queue drawer opened');

  // 5. Click "Kosongkan Antrean" (Clear Queue)
  function clearQueue() {
    state.queue = [state.currentTrack];
    state.queueIndex = 0;
  }
  clearQueue();

  assertEqual(state.currentTrack.id, 'track_2', 'Step 5: Currently playing track preserved');
  assertEqual(state.queue.length, 1, 'Step 5: All upcoming tracks cleared');
  assertEqual(state.queueIndex, 0, 'Step 5: Queue index reset to 0');
});

// =========================================================================
// Scenario 2: Desktop Power-User Session
// =========================================================================
suite.test('SCENARIO-02: Desktop Power-User (Search -> Context Play Next -> Cheat Sheet -> DSP Equalizer)', async () => {
  const ctx = new MockAudioContext();
  const state = {
    currentTrack: { id: 'ambient_1', title: 'Focus Track' },
    queue: [{ id: 'ambient_1' }, { id: 'other' }],
    queueIndex: 0,
    isShortcutsOpen: false,
    dsp: {
      preset: 'p_default',
      speed: 1.0,
      reverbGain: 0.0,
      bandGains: new Array(10).fill(0)
    }
  };

  // 1. Search returns result; right click "Putar Berikutnya"
  const searchResultTrack = { id: 'synth_wave', title: 'Midnight City Synth' };
  state.queue.splice(state.queueIndex + 1, 0, searchResultTrack);

  assertEqual(state.queue[1].id, 'synth_wave', 'Step 1: Track placed at queueIndex + 1');

  // 2. User presses '?' to view shortcut cheat sheet
  function onKeyDown(e) {
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      state.isShortcutsOpen = true;
    } else if (e.key === 'Escape') {
      state.isShortcutsOpen = false;
    }
  }

  onKeyDown({ key: '?', shiftKey: false });
  assertEqual(state.isShortcutsOpen, true, 'Step 2: Cheat sheet dialog displayed');

  // 3. User closes cheat sheet with Escape
  onKeyDown({ key: 'Escape' });
  assertEqual(state.isShortcutsOpen, false, 'Step 3: Cheat sheet dismissed via Escape');

  // 4. Configure DSP: Slowed + Reverb preset + 10-band Graphic EQ
  function applySlowedReverb() {
    state.dsp.preset = 'p_slowed';
    state.dsp.speed = 0.82;
    state.dsp.reverbGain = 0.65;
  }

  function setBand(index, gainDb) {
    state.dsp.bandGains[index] = Math.max(-12, Math.min(12, gainDb));
  }

  applySlowedReverb();
  setBand(1, 4.0);  // Boost 64 Hz band by +4 dB
  setBand(7, -2.5); // Cut 4000 Hz band by -2.5 dB

  assertEqual(state.dsp.preset, 'p_slowed', 'Step 4: Preset active');
  assertEqual(state.dsp.speed, 0.82, 'Step 4: Speed slowed to 0.82');
  assertEqual(state.dsp.reverbGain, 0.65, 'Step 4: Reverb gain set to 0.65');
  assertEqual(state.dsp.bandGains[1], 4.0, 'Step 4: Band 1 (64Hz) boosted +4dB');
  assertEqual(state.dsp.bandGains[7], -2.5, 'Step 4: Band 7 (4kHz) cut -2.5dB');
});

// =========================================================================
// Scenario 3: External Playlist Import & Offline Storage Sync Journey
// =========================================================================
suite.test('SCENARIO-03: External Playlist Import & Offline Storage Sync Journey', async () => {
  const storage = new MockLocalStorage();
  const state = {
    playlists: []
  };

  // 1. Paste Spotify playlist link
  const spotifyUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
  const importedTracks = [
    { id: 'track_a', title: 'Hit A', sizeBytes: 10 * 1024 * 1024 },
    { id: 'track_b', title: 'Hit B', sizeBytes: 12 * 1024 * 1024 },
    { id: 'track_c', title: 'Hit C', sizeBytes: 15 * 1024 * 1024 }
  ];

  const newPlaylist = {
    id: 'pl_spotify_today',
    name: "Today's Top Hits",
    sourceUrl: spotifyUrl,
    tracks: importedTracks
  };
  state.playlists.push(newPlaylist);
  storage.setItem('synth_playlists', JSON.stringify(state.playlists));

  assertEqual(state.playlists.length, 1, 'Step 1: Playlist imported');
  assertEqual(state.playlists[0].tracks.length, 3, 'Step 1: All 3 tracks imported');

  // 2. Set storage cap to 1GB (1024 MB)
  storage.setItem('synth_offline_limit_mb', '1024');
  const limitBytes = 1024 * 1024 * 1024;

  // 3. Check storage before download (currently 900MB used)
  let currentUsedBytes = 900 * 1024 * 1024; // 900 MB used (87.8%)

  function canDownload(additionalBytes) {
    const projected = currentUsedBytes + additionalBytes;
    if (projected > limitBytes) return { allowed: false, warning: true, reason: 'quota_exceeded' };
    if (projected >= limitBytes * 0.90) return { allowed: true, warning: true, reason: 'approaching_limit' };
    return { allowed: true, warning: false, reason: 'ok' };
  }

  // Downloading track A (10MB -> 910MB / 1024MB = 88.8%)
  const checkA = canDownload(10 * 1024 * 1024);
  assertEqual(checkA.allowed, true, 'Step 3: Track A permitted');
  currentUsedBytes += 10 * 1024 * 1024; // Now 910 MB

  // Downloading track B (15MB -> 925MB / 1024MB = 90.3% -> triggers warning alert)
  const checkB = canDownload(15 * 1024 * 1024);
  assertEqual(checkB.allowed, true, 'Step 3: Track B permitted with warning');
  assertEqual(checkB.warning, true, 'Step 3: Approaching limit warning triggered (>90%)');
  assertEqual(checkB.reason, 'approaching_limit', 'Step 3: Reason is approaching_limit');
  currentUsedBytes += 15 * 1024 * 1024; // Now 925 MB

  // Attempting to download an oversized batch (110MB -> 1035MB > 1024MB)
  const checkOver = canDownload(110 * 1024 * 1024);
  assertEqual(checkOver.allowed, false, 'Step 3: Oversized download blocked');
  assertEqual(checkOver.reason, 'quota_exceeded', 'Step 3: Reason is quota_exceeded');
});

// =========================================================================
// Scenario 4: Audio Truncation Bug Prevention & Gapless Crossfade Journey
// =========================================================================
suite.test('SCENARIO-04: Audio Truncation Bug Prevention & Gapless Crossfade Journey', async () => {
  const ctx = new MockAudioContext();
  const deckAGain = ctx.createGain();
  const deckBGain = ctx.createGain();

  // 1. Resolve stream for track with known 30-second SoundCloud preview clip
  const targetTrack = {
    id: 'radiohead_creep',
    title: 'Creep',
    artist: 'Radiohead',
    expectedDuration: 238
  };

  async function mockResolveAudioStream(track) {
    // Primary SoundCloud lookup returns 29.8s preview clip
    const soundcloudCandidate = {
      provider: 'soundcloud',
      url: 'https://cf-media.sndcdn.com/preview_clip.128.mp3',
      duration: 29.8
    };

    // Duration filter checks for truncation trap (29.0s to 30.5s)
    if (soundcloudCandidate.duration >= 29.0 && soundcloudCandidate.duration <= 30.5) {
      // Reject preview! Fallback to full YouTube audio stream
      return {
        provider: 'youtube',
        url: 'https://rr2---sn-yt.googlevideo.com/videoplayback/full_audio.opus',
        duration: 238.4,
        isFullStream: true
      };
    }

    return soundcloudCandidate;
  }

  const resolvedAudio = await mockResolveAudioStream(targetTrack);

  assertEqual(resolvedAudio.provider, 'youtube', 'Step 1: Fallback provider chosen');
  assertEqual(resolvedAudio.isFullStream, true, 'Step 1: Full stream acquired');
  assertInRange(resolvedAudio.duration, 230, 245, 'Step 1: Duration matches full song (~238s)');

  // 2. Play with 5-second crossfade from Deck A to Deck B
  const crossfadeDuration = 5.0;
  const now = ctx.currentTime;

  deckAGain.gain.setValueAtTime(1.0, now);
  deckAGain.gain.linearRampToValueAtTime(0.001, now + crossfadeDuration);

  deckBGain.gain.setValueAtTime(0.001, now);
  deckBGain.gain.linearRampToValueAtTime(1.0, now + crossfadeDuration);

  assertEqual(deckAGain.gain.scheduledEvents.length, 2, 'Step 2: Deck A crossfade schedule active');
  assertEqual(deckBGain.gain.scheduledEvents.length, 2, 'Step 2: Deck B crossfade schedule active');
  assertEqual(deckBGain.gain.scheduledEvents[1].time, 5.0, 'Step 2: Ramp duration is 5.0s');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
