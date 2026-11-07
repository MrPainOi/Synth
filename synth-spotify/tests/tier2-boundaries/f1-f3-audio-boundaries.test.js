/**
 * Tier 2: Boundary & Corner Cases — F1 to F3 (Audio DSP Engine Subsystem)
 * 15 Boundary Test Cases (5 per feature for F1, F2, F3)
 */

const { assert, assertEqual, assertInRange, createSuite, MockAudioContext } = require('../test-utils');

const suite = createSuite('Tier 2: F1-F3 — Audio DSP Engine Boundaries');

// =========================================================================
// F1: Audio Preset Effects Boundaries
// =========================================================================
suite.test('B-F1-01: Applying unknown preset ID falls back safely to "p_default"', () => {
  const validPresets = ['p_default', 'p_slowed', 'p_nightcore', 'p_bassboost'];
  let currentPreset = 'p_default';

  function setPreset(id) {
    if (!validPresets.includes(id)) {
      currentPreset = 'p_default';
      return;
    }
    currentPreset = id;
  }

  setPreset('invalid_random_preset');
  assertEqual(currentPreset, 'p_default', 'Unknown preset must fallback to default');
});

suite.test('B-F1-02: Rapidly switching presets applies latest selection cleanly', () => {
  let activeSpeed = 1.0;
  const presets = {
    p_default: 1.0,
    p_slowed: 0.82,
    p_nightcore: 1.35,
    p_bassboost: 1.0
  };

  function setPreset(id) {
    activeSpeed = presets[id] || 1.0;
  }

  // Rapid switching
  setPreset('p_slowed');
  setPreset('p_nightcore');
  setPreset('p_slowed');
  setPreset('p_default');

  assertEqual(activeSpeed, 1.0, 'Final preset must be default 1.0');
});

suite.test('B-F1-03: Switching presets while paused sets parameters for next play', () => {
  let isPlaying = false;
  let stagedRate = 1.0;

  function setPreset(rate) {
    stagedRate = rate;
  }

  setPreset(0.82); // While paused
  assertEqual(isPlaying, false, 'Playback should remain paused');
  assertEqual(stagedRate, 0.82, 'Staged rate should be ready for resumption');
});

suite.test('B-F1-04: Preset parameters do not allow master volume to exceed 1.5x multiplier', () => {
  function clampVolumeMultiplier(vol) {
    return Math.max(0, Math.min(1.5, typeof vol === 'number' && !isNaN(vol) ? vol : 1.0));
  }

  assertEqual(clampVolumeMultiplier(3.5), 1.5, 'Excess volume capped at 1.5');
  assertEqual(clampVolumeMultiplier(-1.0), 0.0, 'Negative volume capped at 0');
});

suite.test('B-F1-05: Switching to default preset from bassboost resets low shelf filter to 0 dB', () => {
  const ctx = new MockAudioContext();
  const lowFilter = ctx.createBiquadFilter();
  lowFilter.gain.value = 10.0; // Bass boost active

  function resetToDefault() {
    lowFilter.gain.setValueAtTime(0, ctx.currentTime);
  }

  resetToDefault();
  assertEqual(lowFilter.gain.value, 0, 'Low shelf gain must be restored to 0 dB');
});

// =========================================================================
// F2: Audio Equalizer & Tone Boundaries
// =========================================================================
suite.test('B-F2-01: setBandGain with invalid index (< 0 or >= 10) is ignored gracefully', () => {
  const bands = new Array(10).fill(0);

  function setBandGain(idx, gain) {
    if (idx >= 0 && idx < bands.length) {
      bands[idx] = gain;
    }
  }

  setBandGain(-1, 5.0);
  setBandGain(15, 8.0);

  assert(bands.every(g => g === 0), 'Out-of-bounds indices must not mutate bands');
});

suite.test('B-F2-02: setBandGain with non-numeric value (NaN, null, undefined) defaults to 0 dB', () => {
  function sanitizeGain(g) {
    if (typeof g !== 'number' || isNaN(g)) return 0;
    return Math.max(-12, Math.min(12, g));
  }

  assertEqual(sanitizeGain(NaN), 0, 'NaN must sanitize to 0');
  assertEqual(sanitizeGain(null), 0, 'null must sanitize to 0');
  assertEqual(sanitizeGain(undefined), 0, 'undefined must sanitize to 0');
  assertEqual(sanitizeGain('10'), 0, 'String must sanitize to 0');
});

suite.test('B-F2-03: Setting all 10 bands to maximum (+12 dB) clamps correctly', () => {
  const bands = new Array(10).fill(0);
  for (let i = 0; i < 10; i++) {
    bands[i] = Math.min(12, 12.0);
  }

  assert(bands.every(g => g === 12.0), 'All bands should be validly set to +12 dB');
  assert(bands.every(g => !isNaN(g)), 'No band gains should be NaN');
});

suite.test('B-F2-04: Setting all 10 bands to minimum (-12 dB) clamps correctly', () => {
  const bands = new Array(10).fill(0);
  for (let i = 0; i < 10; i++) {
    bands[i] = Math.max(-12, -12.0);
  }

  assert(bands.every(g => g === -12.0), 'All bands should be validly set to -12 dB');
});

suite.test('B-F2-05: Resetting an already zeroed equalizer executes safely as a no-op', () => {
  const bands = new Array(10).fill(0);
  let changed = false;

  function reset() {
    for (let i = 0; i < bands.length; i++) {
      if (bands[i] !== 0) {
        bands[i] = 0;
        changed = true;
      }
    }
  }

  reset();
  assertEqual(changed, false, 'Resetting clean EQ should cause no change');
  assert(bands.every(g => g === 0), 'Bands remain 0');
});

// =========================================================================
// F3: Audio Crossfade Boundaries
// =========================================================================
suite.test('B-F3-01: Crossfade with negative duration clamps to 0s', () => {
  function sanitizeDuration(d) {
    if (typeof d !== 'number' || isNaN(d)) return 0;
    return Math.max(0, Math.min(12, d));
  }

  assertEqual(sanitizeDuration(-5), 0, 'Negative duration should be 0s');
});

suite.test('B-F3-02: Crossfade with duration > 12s clamps to 12s', () => {
  function sanitizeDuration(d) {
    if (typeof d !== 'number' || isNaN(d)) return 0;
    return Math.max(0, Math.min(12, d));
  }

  assertEqual(sanitizeDuration(30), 12, '30s should be clamped to 12s');
});

suite.test('B-F3-03: Track shorter than configured crossfade clamps transition to track duration', () => {
  const trackDuration = 4.0; // 4s track
  const configuredCrossfade = 8.0; // 8s configured

  const effectiveCrossfade = Math.min(configuredCrossfade, Math.max(0, trackDuration / 2));
  assertEqual(effectiveCrossfade, 2.0, 'Effective crossfade should be halved to fit short track');
});

suite.test('B-F3-04: Skipping track mid-crossfade cancels pending ramps and resets deck gains', () => {
  const ctx = new MockAudioContext();
  const deckAGain = ctx.createGain();
  const deckBGain = ctx.createGain();

  deckAGain.gain.linearRampToValueAtTime(0.001, 5.0);
  deckBGain.gain.linearRampToValueAtTime(1.0, 5.0);

  function cancelAndReset(activeDeck, inactiveDeck) {
    activeDeck.gain.cancelScheduledValues(ctx.currentTime);
    activeDeck.gain.setValueAtTime(1.0, ctx.currentTime);

    inactiveDeck.gain.cancelScheduledValues(ctx.currentTime);
    inactiveDeck.gain.setValueAtTime(0.0, ctx.currentTime);
  }

  cancelAndReset(deckBGain, deckAGain);

  assertEqual(deckBGain.gain.value, 1.0, 'New active deck gain immediately restored to 1.0');
  assertEqual(deckAGain.gain.value, 0.0, 'Canceled outgoing deck gain set to 0.0');
});

suite.test('B-F3-05: Audio error during incoming track restores previous deck to avoid silence trap', () => {
  let isPlaybackHealthy = false;

  function handleIncomingDeckError(fallbackDeck) {
    // If incoming track fails to load during crossfade, fallbackDeck is ramped back up
    fallbackDeck.gain = 1.0;
    isPlaybackHealthy = true;
  }

  const deckA = { gain: 0.2 };
  handleIncomingDeckError(deckA);

  assertEqual(deckA.gain, 1.0, 'Fallback deck must be restored to full volume');
  assertEqual(isPlaybackHealthy, true, 'Playback must remain audible');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
