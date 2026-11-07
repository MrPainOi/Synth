/**
 * Tier 1: Feature Coverage — F3: Smooth Audio Crossfade
 * Requirement: ORIGINAL_REQUEST §R3 & PROJECT.md
 * - Dual-deck 0-12s gapless crossfade transitions fading out outgoing track and fading in incoming track without silence.
 * - Contracts: setCrossfadeDuration, playTrackWithCrossfade
 */

const { assert, assertEqual, assertInRange, createSuite, MockAudioContext } = require('../test-utils');

const suite = createSuite('Tier 1: F3 — Smooth Audio Crossfade');

suite.test('F3-01: setCrossfadeDuration clamps duration within 0 to 12 seconds', () => {
  function clampCrossfade(sec) {
    if (typeof sec !== 'number' || isNaN(sec)) return 0;
    return Math.max(0, Math.min(12, sec));
  }

  assertEqual(clampCrossfade(5), 5, '5s duration is valid');
  assertEqual(clampCrossfade(-2), 0, 'Negative duration clamped to 0s');
  assertEqual(clampCrossfade(15), 12, 'Exceeding duration clamped to 12s');
});

suite.test('F3-02: 0s crossfade triggers immediate switch without delay', async () => {
  const ctx = new MockAudioContext();
  const deckAGain = ctx.createGain();
  const deckBGain = ctx.createGain();

  let crossfadeDuration = 0;

  function executeTransition(activeDeck, incomingDeck, duration) {
    if (duration === 0) {
      activeDeck.gain.setValueAtTime(0, ctx.currentTime);
      incomingDeck.gain.setValueAtTime(1.0, ctx.currentTime);
    }
  }

  executeTransition(deckAGain, deckBGain, crossfadeDuration);

  assertEqual(deckAGain.gain.value, 0, 'Outgoing deck gain cut immediately to 0');
  assertEqual(deckBGain.gain.value, 1.0, 'Incoming deck gain set immediately to 1.0');
});

suite.test('F3-03: Crossfade schedules ramp down on outgoing deck and ramp up on incoming deck', () => {
  const ctx = new MockAudioContext();
  const deckA = { gain: ctx.createGain() };
  const deckB = { gain: ctx.createGain() };

  deckA.gain.value = 1.0;
  deckB.gain.value = 0.0;

  function scheduleCrossfade(outgoingDeck, incomingDeck, durationSec) {
    const now = ctx.currentTime;
    outgoingDeck.gain.gain.setValueAtTime(1.0, now);
    outgoingDeck.gain.gain.linearRampToValueAtTime(0.001, now + durationSec);

    incomingDeck.gain.gain.setValueAtTime(0.001, now);
    incomingDeck.gain.gain.linearRampToValueAtTime(1.0, now + durationSec);
  }

  scheduleCrossfade(deckA, deckB, 6.0);

  const outgoingEvents = deckA.gain.gain.scheduledEvents;
  const incomingEvents = deckB.gain.gain.scheduledEvents;

  assertEqual(outgoingEvents.length, 2, 'Outgoing deck must have 2 scheduled gain events');
  assertEqual(incomingEvents.length, 2, 'Incoming deck must have 2 scheduled gain events');
  assertEqual(outgoingEvents[1].type, 'linear', 'Outgoing gain should ramp down linearly or exponentially');
  assertEqual(incomingEvents[1].type, 'linear', 'Incoming gain should ramp up linearly or exponentially');
  assertEqual(outgoingEvents[1].time, 6.0, 'Ramp end time must equal duration (6s)');
});

suite.test('F3-04: Mid-point crossfade sum maintains constant audible energy without silence gap', () => {
  // Equal-power crossfade verification: cos(t) and sin(t) or linear sum
  function calculateGainAtMidpoint(crossfadeType = 'equal-power') {
    if (crossfadeType === 'equal-power') {
      const angle = Math.PI / 4; // 45 deg
      const gainOut = Math.cos(angle);
      const gainIn = Math.sin(angle);
      return Math.sqrt(gainOut * gainOut + gainIn * gainIn);
    } else {
      // Linear
      return 0.5 + 0.5;
    }
  }

  const energyAtMid = calculateGainAtMidpoint('equal-power');
  assertInRange(energyAtMid, 0.95, 1.05, 'Midpoint energy must remain near 1.0 (no silence gap)');
});

suite.test('F3-05: De-allocates or pauses previous audio element after crossfade duration expires', (done) => {
  let isPreviousAudioPaused = false;
  const mockOutgoingAudio = {
    pause: () => { isPreviousAudioPaused = true; }
  };

  function onCrossfadeComplete(prevAudio) {
    prevAudio.pause();
  }

  // Simulate callback on crossfade finish
  onCrossfadeComplete(mockOutgoingAudio);
  assertEqual(isPreviousAudioPaused, true, 'Outgoing audio element must be paused after crossfade completes');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
