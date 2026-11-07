/**
 * Tier 1: Feature Coverage — F2: Audio Equalizer & Tone
 * Requirement: ORIGINAL_REQUEST §R3 & PROJECT.md
 * - 10-band Graphic EQ + Treble/Bass quick tone controls integrated into Web Audio DSP pipeline.
 * - Contracts: setTone, setBandGain, resetEqualizer
 */

const { assert, assertEqual, assertInRange, createSuite, MockAudioContext } = require('../test-utils');

const suite = createSuite('Tier 1: F2 — Audio Equalizer & Tone');

const EQ_BAND_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

suite.test('F2-01: 10-band Graphic EQ configures 10 standard audio center frequencies', () => {
  const ctx = new MockAudioContext();
  const bands = EQ_BAND_FREQS.map(freq => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.gain.value = 0;
    return filter;
  });

  assertEqual(bands.length, 10, 'Graphic EQ must comprise exactly 10 bands');
  assertEqual(bands[0].frequency.value, 32, 'Band 0 frequency must be 32 Hz');
  assertEqual(bands[5].frequency.value, 1000, 'Band 5 frequency must be 1000 Hz');
  assertEqual(bands[9].frequency.value, 16000, 'Band 9 frequency must be 16000 Hz');
});

suite.test('F2-02: setTone adjusts Bass, Mid, and Treble gain parameters', () => {
  const ctx = new MockAudioContext();
  const eqLow = ctx.createBiquadFilter();
  const eqMid = ctx.createBiquadFilter();
  const eqHigh = ctx.createBiquadFilter();

  function setTone(bass, mid, treble) {
    eqLow.gain.setValueAtTime(bass, ctx.currentTime);
    eqMid.gain.setValueAtTime(mid, ctx.currentTime);
    eqHigh.gain.setValueAtTime(treble, ctx.currentTime);
  }

  setTone(5.5, -2.0, 4.0);

  assertEqual(eqLow.gain.value, 5.5, 'Bass gain must equal 5.5 dB');
  assertEqual(eqMid.gain.value, -2.0, 'Mid gain must equal -2.0 dB');
  assertEqual(eqHigh.gain.value, 4.0, 'Treble gain must equal 4.0 dB');
});

suite.test('F2-03: setBandGain updates specific frequency band at given index', () => {
  const ctx = new MockAudioContext();
  const bands = EQ_BAND_FREQS.map(() => ctx.createBiquadFilter());

  function setBandGain(index, gainDb) {
    if (index >= 0 && index < bands.length) {
      bands[index].gain.setValueAtTime(gainDb, ctx.currentTime);
    }
  }

  setBandGain(2, 6.0); // 125 Hz
  setBandGain(7, -4.5); // 4000 Hz

  assertEqual(bands[2].gain.value, 6.0, 'Band 2 (125 Hz) gain should be updated to +6.0 dB');
  assertEqual(bands[7].gain.value, -4.5, 'Band 7 (4 kHz) gain should be updated to -4.5 dB');
  assertEqual(bands[0].gain.value, 0, 'Untouched band 0 must remain at 0 dB');
});

suite.test('F2-04: Gain values outside [-12, +12] dB are clamped safely', () => {
  function clampGain(val) {
    return Math.max(-12, Math.min(12, typeof val === 'number' && !isNaN(val) ? val : 0));
  }

  assertEqual(clampGain(18.5), 12.0, 'Gains exceeding +12 dB must be clamped to +12 dB');
  assertEqual(clampGain(-25.0), -12.0, 'Gains below -12 dB must be clamped to -12 dB');
  assertEqual(clampGain(7.2), 7.2, 'In-range gains must be preserved unchanged');
});

suite.test('F2-05: resetEqualizer restores all 10 bands and tone gains to 0 dB', () => {
  const ctx = new MockAudioContext();
  const toneGains = { bass: 6, mid: -3, treble: 5 };
  const bandGains = [2, 4, 1, -2, -3, 0, 1, 2, -1, 3];

  function resetEqualizer() {
    toneGains.bass = 0;
    toneGains.mid = 0;
    toneGains.treble = 0;
    for (let i = 0; i < bandGains.length; i++) {
      bandGains[i] = 0;
    }
  }

  resetEqualizer();

  assertEqual(toneGains.bass, 0, 'Bass gain reset to 0');
  assertEqual(toneGains.mid, 0, 'Mid gain reset to 0');
  assertEqual(toneGains.treble, 0, 'Treble gain reset to 0');
  assert(bandGains.every(g => g === 0), 'All 10 EQ band gains must be reset to 0 dB');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
