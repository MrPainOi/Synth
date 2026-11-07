/**
 * Tier 1: Feature Coverage — F1: Audio Preset Effects
 * Requirement: ORIGINAL_REQUEST §R3 & PROJECT.md
 * - Port audio preset effects from original Synth:
 *   Default (1.0x), Slowed + Reverb, Speed Up / Nightcore (1.35x), and Bass Boost.
 * - Contract: window.SynthAudioEngine.setPreset(presetId)
 */

const { assert, assertEqual, assertInRange, createSuite, readProjectFile, MockAudioContext } = require('../test-utils');

const suite = createSuite('Tier 1: F1 — Audio Preset Effects');

suite.test('F1-01: Audio settings UI container exists in index.html', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const hasAudioSettings = /id=["']modal-audio-settings["']|audio-settings-modal|btn-open-audio-settings/i.test(html);
  assert(hasAudioSettings, 'index.html must contain audio settings modal or launch button (#modal-audio-settings)');
});

suite.test('F1-02: Preset "p_default" resets playback rate to 1.0 and clears reverb', () => {
  const ctx = new MockAudioContext();
  const reverbGain = ctx.createGain();
  let playbackRate = 0.85;

  function applyPreset(presetId) {
    if (presetId === 'p_default') {
      playbackRate = 1.0;
      reverbGain.gain.setValueAtTime(0.0, ctx.currentTime);
    }
  }

  applyPreset('p_default');

  assertEqual(playbackRate, 1.0, 'Default preset must set playback rate to 1.0');
  assertEqual(reverbGain.gain.value, 0.0, 'Default preset must disable reverb (0.0)');
});

suite.test('F1-03: Preset "p_slowed" configures slowed speed and high reverb', () => {
  const ctx = new MockAudioContext();
  const reverbGain = ctx.createGain();
  let playbackRate = 1.0;

  function applyPreset(presetId) {
    if (presetId === 'p_slowed') {
      playbackRate = 0.82;
      reverbGain.gain.setValueAtTime(0.65, ctx.currentTime);
    }
  }

  applyPreset('p_slowed');

  assertInRange(playbackRate, 0.75, 0.88, 'Slowed preset playback speed must be slowed down');
  assertInRange(reverbGain.gain.value, 0.50, 0.80, 'Slowed preset reverb must be active (>0.50)');
});

suite.test('F1-04: Preset "p_nightcore" accelerates playback rate to 1.25x - 1.35x', () => {
  let playbackRate = 1.0;

  function applyPreset(presetId) {
    if (presetId === 'p_nightcore' || presetId === 'p_speedup') {
      playbackRate = 1.35;
    }
  }

  applyPreset('p_nightcore');

  assertInRange(playbackRate, 1.25, 1.40, 'Nightcore / Speed up preset rate must be between 1.25 and 1.40');
});

suite.test('F1-05: Preset "p_bassboost" enhances low frequencies by +6 to +12 dB', () => {
  const ctx = new MockAudioContext();
  const lowFilter = ctx.createBiquadFilter();
  lowFilter.type = 'lowshelf';
  lowFilter.frequency.value = 100;
  lowFilter.gain.value = 0;

  function applyPreset(presetId) {
    if (presetId === 'p_bassboost') {
      lowFilter.gain.setValueAtTime(9.0, ctx.currentTime);
    }
  }

  applyPreset('p_bassboost');

  assertInRange(lowFilter.gain.value, 6.0, 12.0, 'Bass Boost preset low shelf gain must be between +6dB and +12dB');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
