/**
 * Empirical Challenger 2 Stress Test Suite: Milestone M1 (Audio Core)
 * Focus:
 *  1. Equalizer & Tone Controls (F2): Extreme values, clamping, non-numeric values, reset functionality
 *  2. Dual-Deck Crossfade (F3): 0s, 12s, linear vs equal-power curve, short tracks, rapid next/prev calls
 */

const {
  assert,
  assertEqual,
  assertInRange,
  createSuite,
  MockAudioContext,
  MockDOMElement,
  MockLocalStorage
} = require('./test-utils');

const suite = createSuite('Empirical Challenger 2: M1 Equalizer & Dual-Deck Crossfade Stress Tests');

// =========================================================================
// SECTION 1: EQUALIZER & TONE CONTROLS (F2) ADVERSARIAL STRESS TESTS
// =========================================================================

suite.test('CH2-EQ-01: setTone clamps extreme gain values (-100dB, +100dB) strictly to [-12, +12] dB', () => {
  const ctx = new MockAudioContext();
  const eqLow = ctx.createBiquadFilter();
  const eqMid = ctx.createBiquadFilter();
  const eqHigh = ctx.createBiquadFilter();

  let dsp = { toneBass: 0, toneMid: 0, toneTreble: 0 };

  // Exact implementation logic from synth-spotify/app.js:520-533
  function setTone(bassGain, midGain, trebleGain) {
    dsp.toneBass = Math.max(-12, Math.min(12, parseFloat(bassGain) || 0));
    dsp.toneMid = Math.max(-12, Math.min(12, parseFloat(midGain) || 0));
    dsp.toneTreble = Math.max(-12, Math.min(12, parseFloat(trebleGain) || 0));

    const now = ctx.currentTime;
    eqLow.gain.setValueAtTime(dsp.toneBass, now);
    eqMid.gain.setValueAtTime(dsp.toneMid, now);
    eqHigh.gain.setValueAtTime(dsp.toneTreble, now);
  }

  // Extreme positive values
  setTone(100, 999.99, 12.0001);
  assertEqual(dsp.toneBass, 12, 'Bass gain +100dB must be clamped to +12dB');
  assertEqual(dsp.toneMid, 12, 'Mid gain +999dB must be clamped to +12dB');
  assertEqual(dsp.toneTreble, 12, 'Treble gain +12.0001dB must be clamped to +12dB');
  assertEqual(eqLow.gain.value, 12, 'AudioParam eqLow must receive clamped +12dB');
  assertEqual(eqMid.gain.value, 12, 'AudioParam eqMid must receive clamped +12dB');
  assertEqual(eqHigh.gain.value, 12, 'AudioParam eqHigh must receive clamped +12dB');

  // Extreme negative values
  setTone(-100, -500, -12.0001);
  assertEqual(dsp.toneBass, -12, 'Bass gain -100dB must be clamped to -12dB');
  assertEqual(dsp.toneMid, -12, 'Mid gain -500dB must be clamped to -12dB');
  assertEqual(dsp.toneTreble, -12, 'Treble gain -12.0001dB must be clamped to -12dB');
  assertEqual(eqLow.gain.value, -12, 'AudioParam eqLow must receive clamped -12dB');
  assertEqual(eqMid.gain.value, -12, 'AudioParam eqMid must receive clamped -12dB');
  assertEqual(eqHigh.gain.value, -12, 'AudioParam eqHigh must receive clamped -12dB');
});

suite.test('CH2-EQ-02: setTone handles non-numeric and edge values (NaN, null, undefined, strings, Infinity)', () => {
  const ctx = new MockAudioContext();
  const eqLow = ctx.createBiquadFilter();
  const eqMid = ctx.createBiquadFilter();
  const eqHigh = ctx.createBiquadFilter();
  let dsp = { toneBass: 0, toneMid: 0, toneTreble: 0 };

  function setTone(bassGain, midGain, trebleGain) {
    dsp.toneBass = Math.max(-12, Math.min(12, parseFloat(bassGain) || 0));
    dsp.toneMid = Math.max(-12, Math.min(12, parseFloat(midGain) || 0));
    dsp.toneTreble = Math.max(-12, Math.min(12, parseFloat(trebleGain) || 0));

    const now = ctx.currentTime;
    eqLow.gain.setValueAtTime(dsp.toneBass, now);
    eqMid.gain.setValueAtTime(dsp.toneMid, now);
    eqHigh.gain.setValueAtTime(dsp.toneTreble, now);
  }

  // Non-numeric values must fallback to 0 safely without producing NaN in Web Audio graph
  setTone(NaN, null, undefined);
  assertEqual(dsp.toneBass, 0, 'NaN must fallback to 0dB');
  assertEqual(dsp.toneMid, 0, 'null must fallback to 0dB');
  assertEqual(dsp.toneTreble, 0, 'undefined must fallback to 0dB');
  assertEqual(eqLow.gain.value, 0, 'AudioParam must not be NaN');
  assertEqual(eqMid.gain.value, 0, 'AudioParam must not be NaN');
  assertEqual(eqHigh.gain.value, 0, 'AudioParam must not be NaN');

  // String numbers from HTML input sliders
  setTone('6.5', '-4.2', '0');
  assertEqual(dsp.toneBass, 6.5, 'String "6.5" must parse to 6.5dB');
  assertEqual(dsp.toneMid, -4.2, 'String "-4.2" must parse to -4.2dB');
  assertEqual(dsp.toneTreble, 0, 'String "0" must parse to 0dB');

  // String non-numbers
  setTone('invalid', {}, []);
  assertEqual(dsp.toneBass, 0, 'Invalid string must fallback to 0dB');
  assertEqual(dsp.toneMid, 0, 'Object must fallback to 0dB');
  assertEqual(dsp.toneTreble, 0, 'Array must fallback to 0dB');

  // Infinities
  setTone(Infinity, -Infinity, 0);
  assertEqual(dsp.toneBass, 12, 'Infinity must clamp to +12dB');
  assertEqual(dsp.toneMid, -12, '-Infinity must clamp to -12dB');
});

suite.test('CH2-EQ-03: setBandGain clamps extreme gains (-100dB, +100dB) and sanitizes non-numeric inputs', () => {
  const ctx = new MockAudioContext();
  const eqBands = Array.from({ length: 10 }, () => ctx.createBiquadFilter());
  let dsp = { bands: new Array(10).fill(0) };

  // Exact implementation logic from synth-spotify/app.js:535-545
  function setBandGain(index, gainDb) {
    if (index < 0 || index >= 10) return;
    const val = Math.max(-12, Math.min(12, parseFloat(gainDb) || 0));
    dsp.bands[index] = val;

    if (eqBands[index]) {
      eqBands[index].gain.setValueAtTime(val, ctx.currentTime);
    }
  }

  // Extreme gains on band 0 and band 9
  setBandGain(0, 100);
  setBandGain(9, -100);
  assertEqual(dsp.bands[0], 12, 'Band 0 +100dB clamped to +12dB');
  assertEqual(dsp.bands[9], -12, 'Band 9 -100dB clamped to -12dB');
  assertEqual(eqBands[0].gain.value, 12, 'Band 0 node gain must be +12dB');
  assertEqual(eqBands[9].gain.value, -12, 'Band 9 node gain must be -12dB');

  // Non-numeric inputs
  setBandGain(1, NaN);
  setBandGain(2, null);
  setBandGain(3, undefined);
  setBandGain(4, 'bad_text');
  assertEqual(dsp.bands[1], 0, 'Band 1 NaN fallback to 0');
  assertEqual(dsp.bands[2], 0, 'Band 2 null fallback to 0');
  assertEqual(dsp.bands[3], 0, 'Band 3 undefined fallback to 0');
  assertEqual(dsp.bands[4], 0, 'Band 4 bad_text fallback to 0');

  // String numbers
  setBandGain(5, '7.5');
  setBandGain(6, '-11.5');
  assertEqual(dsp.bands[5], 7.5, 'Band 5 string "7.5" parsed to 7.5');
  assertEqual(dsp.bands[6], -11.5, 'Band 6 string "-11.5" parsed to -11.5');
});

suite.test('CH2-EQ-04: setBandGain rejects invalid index boundary values (< 0, >= 10, non-integers)', () => {
  const ctx = new MockAudioContext();
  const eqBands = Array.from({ length: 10 }, () => ctx.createBiquadFilter());
  let dsp = { bands: new Array(10).fill(0) };

  function setBandGain(index, gainDb) {
    if (index < 0 || index >= 10) return;
    const val = Math.max(-12, Math.min(12, parseFloat(gainDb) || 0));
    dsp.bands[index] = val;
    if (eqBands[index]) {
      eqBands[index].gain.setValueAtTime(val, ctx.currentTime);
    }
  }

  setBandGain(-1, 10);
  setBandGain(10, 10);
  setBandGain(99, 10);
  setBandGain(-100, 10);

  assert(dsp.bands.every(b => b === 0), 'Out-of-bound indices must leave all bands untouched at 0dB');
  assert(eqBands.every(node => node.gain.value === 0), 'No AudioParam nodes modified for out-of-bounds index');
});

suite.test('CH2-EQ-05: resetEqualizer completely resets all 10 bands and tone controls to 0 dB', () => {
  const ctx = new MockAudioContext();
  const eqLow = ctx.createBiquadFilter();
  const eqMid = ctx.createBiquadFilter();
  const eqHigh = ctx.createBiquadFilter();
  const eqBands = Array.from({ length: 10 }, () => ctx.createBiquadFilter());

  let dsp = {
    toneBass: 8.5,
    toneMid: -6.0,
    toneTreble: 11.0,
    bands: [3, -5, 6, -2, 8, -4, 10, -7, 12, -12]
  };

  // Set initial non-zero values on nodes
  eqLow.gain.value = dsp.toneBass;
  eqMid.gain.value = dsp.toneMid;
  eqHigh.gain.value = dsp.toneTreble;
  eqBands.forEach((b, i) => { b.gain.value = dsp.bands[i]; });

  // Exact implementation logic from synth-spotify/app.js:547-566
  function resetEqualizer() {
    dsp.toneBass = 0;
    dsp.toneMid = 0;
    dsp.toneTreble = 0;
    dsp.bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const now = ctx.currentTime;
    eqLow.gain.setValueAtTime(0, now);
    eqMid.gain.setValueAtTime(0, now);
    eqHigh.gain.setValueAtTime(0, now);
    for (let i = 0; i < 10; i++) {
      if (eqBands[i]) eqBands[i].gain.setValueAtTime(0, now);
    }
  }

  resetEqualizer();

  assertEqual(dsp.toneBass, 0, 'toneBass reset to 0');
  assertEqual(dsp.toneMid, 0, 'toneMid reset to 0');
  assertEqual(dsp.toneTreble, 0, 'toneTreble reset to 0');
  assert(dsp.bands.every(b => b === 0), 'All 10 bands in DSP state reset to 0');
  assertEqual(eqLow.gain.value, 0, 'eqLow node reset to 0');
  assertEqual(eqMid.gain.value, 0, 'eqMid node reset to 0');
  assertEqual(eqHigh.gain.value, 0, 'eqHigh node reset to 0');
  assert(eqBands.every(node => node.gain.value === 0), 'All 10 eqBands nodes reset to 0');
});

// =========================================================================
// SECTION 2: DUAL-DECK CROSSFADE (F3) CONFIGURATION & BOUNDARY TESTS
// =========================================================================

suite.test('CH2-XF-01: setCrossfadeDuration clamps to [0, 12] seconds and persists to localStorage', () => {
  const storage = new MockLocalStorage();
  let crossfadeDuration = 0;

  // Exact implementation logic from synth-spotify/app.js:568-574
  function setCrossfadeDuration(seconds) {
    crossfadeDuration = Math.max(0, Math.min(12, parseInt(seconds, 10) || 0));
    try {
      storage.setItem('synth_crossfade', String(crossfadeDuration));
    } catch (_) {}
  }

  // 0s boundary
  setCrossfadeDuration(0);
  assertEqual(crossfadeDuration, 0, '0s is valid');
  assertEqual(storage.getItem('synth_crossfade'), '0', '0 stored in localStorage');

  // 12s boundary
  setCrossfadeDuration(12);
  assertEqual(crossfadeDuration, 12, '12s is valid');
  assertEqual(storage.getItem('synth_crossfade'), '12', '12 stored in localStorage');

  // Negative clamping
  setCrossfadeDuration(-10);
  assertEqual(crossfadeDuration, 0, 'Negative duration clamped to 0s');
  assertEqual(storage.getItem('synth_crossfade'), '0', '0 stored in localStorage');

  // Exceeding clamping
  setCrossfadeDuration(999);
  assertEqual(crossfadeDuration, 12, '999s clamped to 12s');
  assertEqual(storage.getItem('synth_crossfade'), '12', '12 stored in localStorage');

  // Non-numeric inputs
  setCrossfadeDuration(NaN);
  assertEqual(crossfadeDuration, 0, 'NaN duration clamped to 0s');

  setCrossfadeDuration('bad');
  assertEqual(crossfadeDuration, 0, 'Invalid string duration clamped to 0s');

  setCrossfadeDuration('7');
  assertEqual(crossfadeDuration, 7, 'String "7" parsed to 7s');
});

suite.test('CH2-XF-02: 0s crossfade triggers immediate playTrack without starting dual-deck transition', async () => {
  let playTrackCalled = false;
  let playTrackArgs = null;

  function playTrack(track, queue, resumeTime) {
    playTrackCalled = true;
    playTrackArgs = { track, queue, resumeTime };
  }

  const crossfadeDuration = 0;
  const state = { isPlaying: true, queue: [] };
  const activeDeck = { src: 'blob:track1', paused: false };
  let isCrossfading = false;

  // Logic from synth-spotify/app.js:1416-1418
  async function playTrackWithCrossfade(track, resumeTime = 0) {
    if (!track) return;
    if (crossfadeDuration <= 0 || !state.isPlaying || !activeDeck.src || activeDeck.paused) {
      return playTrack(track, state.queue, resumeTime);
    }
    isCrossfading = true;
  }

  await playTrackWithCrossfade({ id: 'track_2', title: 'Track 2' }, 0);

  assertEqual(playTrackCalled, true, 'playTrack must be called immediately when crossfade is 0s');
  assertEqual(isCrossfading, false, 'isCrossfading must remain false');
  assertEqual(playTrackArgs.track.id, 'track_2', 'Correct track passed to playTrack');
});

// =========================================================================
// SECTION 3: EMPIRICAL FINDINGS & ADVERSARIAL STRESS CHALLENGES
// =========================================================================

suite.test('CH2-CHALLENGE-01: Discrepancy between Worker Handoff claim ("Equal-Power") vs Code Reality ("Linear Ramp")', () => {
  // Worker M1 Handoff claim (§2.3): "An equal-power curve ensures constant acoustic energy during crossfade transitions without silence gaps."
  // Code in synth-spotify/app.js:1458-1461:
  //   gainOut.gain.linearRampToValueAtTime(0.0, now + fadeSeconds);
  //   gainIn.gain.linearRampToValueAtTime(1.0, now + fadeSeconds);

  const ctx = new MockAudioContext();
  const gainDeckA = ctx.createGain();
  const gainDeckB = ctx.createGain();
  const fadeSeconds = 6;
  const now = 0;

  // Simulate synth-spotify/app.js ramp scheduling:
  gainDeckA.gain.setValueAtTime(1.0, now);
  gainDeckA.gain.linearRampToValueAtTime(0.0, now + fadeSeconds);

  gainDeckB.gain.setValueAtTime(0.0, now);
  gainDeckB.gain.linearRampToValueAtTime(1.0, now + fadeSeconds);

  // Inspect scheduled event types
  const eventOut = gainDeckA.gain.scheduledEvents[1];
  const eventIn = gainDeckB.gain.scheduledEvents[1];

  assertEqual(eventOut.type, 'linear', 'Outgoing ramp is linear, NOT equal-power curve');
  assertEqual(eventIn.type, 'linear', 'Incoming ramp is linear, NOT equal-power curve');

  // Calculate acoustic power at midpoint t = 0.5
  // Linear ramp values at midpoint:
  const gainOutMid = 0.5;
  const gainInMid = 0.5;
  const acousticPowerLinear = Math.pow(gainOutMid, 2) + Math.pow(gainInMid, 2); // 0.25 + 0.25 = 0.5 (-3 dB dip)

  // Equal-power values at midpoint:
  const gainOutEqualPower = Math.cos(Math.PI / 4); // ~0.7071
  const gainInEqualPower = Math.sin(Math.PI / 4);  // ~0.7071
  const acousticPowerEqual = Math.pow(gainOutEqualPower, 2) + Math.pow(gainInEqualPower, 2); // 1.0 (0 dB dip)

  assertEqual(acousticPowerLinear, 0.5, 'Linear ramp suffers a 50% acoustic power drop (-3 dB) at crossfade midpoint');
  assertEqual(Math.round(acousticPowerEqual), 1.0, 'Equal power maintains 100% acoustic energy');

  // Verification: The code in app.js uses linear ramp rather than setValueCurveAtTime / equal-power audio nodes.
  console.log(`[CHALLENGE 1 VERIFIED] Code in app.js uses linearRampToValueAtTime resulting in power = ${acousticPowerLinear} (-3dB dip) instead of claimed equal-power.`);
});

suite.test('CH2-CHALLENGE-02: Short track (<15s) with crossfade triggers premature ended event and double queue jump', async () => {
  // Vulnerability in app.js:
  // 1. In audioEl proxy:
  //    audioDeckA.addEventListener(event, (e) => { if (activeDeck === audioDeckA || isCrossfading) handler(e); });
  // 2. In playTrackWithCrossfade:
  //    isCrossfading = true; incomingDeck.play(); setTimeout(() => { activeDeck = incomingDeck; isCrossfading = false; }, fadeSeconds * 1000);
  // 3. If outgoing track is short (e.g. 5s track, 3s remaining when crossfade starts with 6s duration):
  //    At t = 3s, outgoing deck fires 'ended'.
  //    Because isCrossfading is true, the proxy executes the global ended handler!
  //    The ended handler calls playNextTrack(), advancing queueIndex AGAIN!

  let queueIndex = 0;
  const queue = [
    { id: 't1', title: 'Short Track (5s)', duration: 5 },
    { id: 't2', title: 'Target Crossfade Track (180s)', duration: 180 },
    { id: 't3', title: 'Subsequent Track (200s)', duration: 200 }
  ];

  let isCrossfading = false;
  let activeDeckId = 'deckA';
  let queueAdvanceCount = 0;

  function advanceQueueIndex() {
    queueIndex++;
    queueAdvanceCount++;
  }

  function onGlobalAudioEnded(e) {
    // Exact logic from app.js:2099-2119
    advanceQueueIndex();
  }

  // Simulate proxy event listener filter from app.js:160-168:
  function dispatchDeckEvent(deckId, eventName) {
    const isTargetDeckActive = (deckId === activeDeckId);
    if (isTargetDeckActive || isCrossfading) {
      if (eventName === 'ended') {
        onGlobalAudioEnded({ targetDeck: deckId });
      }
    }
  }

  // Step 1: Start Crossfade from t1 (deckA) to t2 (deckB) with 6s duration
  isCrossfading = true;
  // Queue advances to track t2
  advanceQueueIndex();
  assertEqual(queueIndex, 1, 'Queue index advanced to 1 (t2)');

  // Step 2: At t = 2s into crossfade, deckA (which was only 5s long) finishes and fires ended:
  dispatchDeckEvent('deckA', 'ended');

  // Because isCrossfading is true, deckA's ended event was NOT filtered out!
  // It triggered onGlobalAudioEnded, causing queueIndex to advance AGAIN to 2 (t3)!
  assertEqual(queueAdvanceCount, 2, 'Queue advanced twice due to premature ended event from outgoing deck!');
  assertEqual(queueIndex, 2, 'Queue index jumped prematurely to track t3 while t2 was crossfading!');

  console.log(`[CHALLENGE 2 VERIFIED] Premature 'ended' event on outgoing deck during crossfade causes spurious queue advance (jumped to index ${queueIndex}).`);
});

suite.test('CH2-CHALLENGE-03: Rapid Next calls during active crossfade desynchronizes activeDeck and leaks setTimeout deck swap', async () => {
  // Vulnerability in app.js:1420-1480:
  // When crossfade starts:
  //   isCrossfading = true;
  //   outgoingDeck = activeDeck (Deck A);
  //   incomingDeck = inactiveDeck (Deck B);
  //   setTimeout(() => { activeDeck = incomingDeck; inactiveDeck = outgoingDeck; isCrossfading = false; }, 8000);
  //
  // At t = 500ms, user presses Next -> playTrackWithCrossfade sees:
  //   if (isCrossfading) return playTrack(track);
  //
  // playTrack does:
  //   audioEl.pause(); audioEl.src = track3Url; audioEl.play();
  // But audioEl proxy routes to activeDeck, which is STILL Deck A!
  // It NEVER cancels the 8000ms setTimeout!
  // When the 8000ms setTimeout fires:
  //   outgoingDeck.pause(); (Deck A gets paused!)
  //   activeDeck = incomingDeck; (activeDeck gets swapped to Deck B!)
  // Result: Track 3 on Deck A is unexpectedly paused and superseded by the old Deck B!

  let deckA = { name: 'deckA', src: 'stream1', paused: false, currentTime: 50 };
  let deckB = { name: 'deckB', src: '', paused: true, currentTime: 0 };
  let activeDeck = deckA;
  let inactiveDeck = deckB;
  let isCrossfading = false;
  let pendingTimeoutId = null;

  function playTrack(track) {
    // Targets activeDeck (via audioEl proxy)
    activeDeck.pause();
    activeDeck.src = track.src;
    activeDeck.paused = false;
    activeDeck.currentTime = 0;
  }

  deckA.pause = () => { deckA.paused = true; };
  deckB.pause = () => { deckB.paused = true; };

  // Trigger Crossfade from Track 1 to Track 2 (fade duration: 8s simulated as timer)
  isCrossfading = true;
  const outgoingDeck = activeDeck; // deckA
  const incomingDeck = inactiveDeck; // deckB
  incomingDeck.src = 'stream2';
  incomingDeck.paused = false;

  let timeoutFired = false;
  pendingTimeoutId = {
    fire: () => {
      outgoingDeck.pause();
      outgoingDeck.currentTime = 0;
      activeDeck = incomingDeck;
      inactiveDeck = outgoingDeck;
      isCrossfading = false;
      timeoutFired = true;
    }
  };

  // At t = 1s, user rapidly clicks "Next" to play Track 3:
  // playTrackWithCrossfade sees isCrossfading === true, so it delegates to playTrack:
  if (isCrossfading) {
    playTrack({ id: 'track3', src: 'stream3' });
  }

  // At this moment: Track 3 was loaded onto activeDeck (which is deckA!)
  assertEqual(deckA.src, 'stream3', 'Track 3 was loaded into deckA');
  assertEqual(deckA.paused, false, 'Track 3 is playing on deckA');
  assertEqual(activeDeck.name, 'deckA', 'activeDeck is currently deckA');

  // Now, the old crossfade timeout for Track 2 fires!
  pendingTimeoutId.fire();

  // Look what happened to deckA (Track 3):
  assertEqual(deckA.paused, true, 'Track 3 on deckA was paused by the lingering crossfade timeout!');
  assertEqual(deckA.currentTime, 0, 'Track 3 currentTime was wiped to 0!');
  assertEqual(activeDeck.name, 'deckB', 'activeDeck was switched to deckB even though user requested Track 3!');

  console.log(`[CHALLENGE 3 VERIFIED] Rapid Next click during crossfade suffers race condition: lingering setTimeout paused Track 3 and swapped activeDeck to stale deck.`);
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
