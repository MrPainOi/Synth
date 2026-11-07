/**
 * Empirical Challenger 1 Stress Test Suite: Milestone M1 Iteration 2 Gate
 * Focus:
 *  1. Universal preview clip guard `isAudioPreviewClip`: comprehensive edge cases and boundary testing.
 *  2. Equal-power crossfade curve: mathematical acoustic power ($cos^2 + sin^2 \equiv 1.0$), monotonicity, float precision, continuous interpolation.
 *  3. Static call-site audit and public interface contract verification.
 */

const fs = require('fs');
const path = require('path');
const {
  assert,
  assertEqual,
  assertInRange,
  createSuite,
  MockAudioContext,
  readProjectFile
} = require('./test-utils');

const suite = createSuite('Empirical Challenger 1: M1 Iteration 2 Gate Stress Tests');

// Read production app.js code
const appJsPath = path.resolve(__dirname, '../app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Extract the exact production isAudioPreviewClip implementation from app.js
const previewFuncMatch = appJsContent.match(/function\s+isAudioPreviewClip\s*\([\s\S]*?\)\s*\{[\s\S]*?\n  \}/);
if (!previewFuncMatch) {
  throw new Error('Could not find isAudioPreviewClip definition in synth-spotify/app.js');
}
const isAudioPreviewClip = new Function(`
  ${previewFuncMatch[0]}
  return isAudioPreviewClip;
`)();

// Extract the exact production equal-power curve initialization logic from app.js
const curveInitMatch = appJsContent.match(/const\s+CROSSFADE_CURVE_SIZE\s*=\s*\d+;[\s\S]*?initEqualPowerCurves\(\)\s*\{[\s\S]*?\}\)\(\);/);
if (!curveInitMatch) {
  throw new Error('Could not find equal-power curves definition in synth-spotify/app.js');
}
const { EQUAL_POWER_FADE_OUT, EQUAL_POWER_FADE_IN, CROSSFADE_CURVE_SIZE } = new Function(`
  ${curveInitMatch[0]}
  return { EQUAL_POWER_FADE_OUT, EQUAL_POWER_FADE_IN, CROSSFADE_CURVE_SIZE };
`)();

// =========================================================================
// SECTION 1: EQUAL-POWER CROSSFADE CURVE ACOUSTIC POWER VERIFICATION
// =========================================================================

suite.test('EP-01: Analytical acoustic power P = cos^2(theta) + sin^2(theta) == 1.0 at specified test points', () => {
  // Test points: t = 0.0, 0.25, 0.50, 0.75, 1.0
  const testPoints = [
    { t: 0.0, name: 't=0.0 (Start)', expectedCos: 1.0, expectedSin: 0.0 },
    { t: 0.25, name: 't=0.25 (Quarter)', expectedCos: Math.cos(0.25 * 0.5 * Math.PI), expectedSin: Math.sin(0.25 * 0.5 * Math.PI) },
    { t: 0.50, name: 't=0.50 (Midpoint)', expectedCos: Math.cos(0.50 * 0.5 * Math.PI), expectedSin: Math.sin(0.50 * 0.5 * Math.PI) },
    { t: 0.75, name: 't=0.75 (Three-quarters)', expectedCos: Math.cos(0.75 * 0.5 * Math.PI), expectedSin: Math.sin(0.75 * 0.5 * Math.PI) },
    { t: 1.0, name: 't=1.0 (End)', expectedCos: 0.0, expectedSin: 1.0 }
  ];

  for (const pt of testPoints) {
    const angle = pt.t * 0.5 * Math.PI;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const power = c * c + s * s;
    const dbLoss = 10 * Math.log10(power);

    assertInRange(c, pt.expectedCos - 1e-12, pt.expectedCos + 1e-12, `${pt.name} cos value accurate`);
    assertInRange(s, pt.expectedSin - 1e-12, pt.expectedSin + 1e-12, `${pt.name} sin value accurate`);
    assert(Math.abs(power - 1.0) < 1e-12, `${pt.name} acoustic power must be exactly 1.0 (got ${power})`);
    assert(Math.abs(dbLoss) < 1e-12, `${pt.name} dB loss must be 0.0 dB (got ${dbLoss})`);
  }
});

suite.test('EP-02: Production Float32Array curves have length 64 and exact [1->0] and [0->1] boundaries', () => {
  assertEqual(CROSSFADE_CURVE_SIZE, 64, 'CROSSFADE_CURVE_SIZE must be exactly 64');
  assertEqual(EQUAL_POWER_FADE_OUT.length, 64, 'EQUAL_POWER_FADE_OUT must have 64 elements');
  assertEqual(EQUAL_POWER_FADE_IN.length, 64, 'EQUAL_POWER_FADE_IN must have 64 elements');

  // Exact boundary values
  assertEqual(EQUAL_POWER_FADE_OUT[0], 1.0, 'Fade-out at t=0 must be exactly 1.0');
  assertEqual(EQUAL_POWER_FADE_OUT[63], 0.0, 'Fade-out at t=1 must be exactly 0.0');
  assertEqual(EQUAL_POWER_FADE_IN[0], 0.0, 'Fade-in at t=0 must be exactly 0.0');
  assertEqual(EQUAL_POWER_FADE_IN[63], 1.0, 'Fade-in at t=1 must be exactly 1.0');
});

suite.test('EP-03: Production curves maintain strict monotonicity without spikes or inversions', () => {
  // EQUAL_POWER_FADE_OUT must strictly decrease
  for (let i = 1; i < CROSSFADE_CURVE_SIZE; i++) {
    assert(
      EQUAL_POWER_FADE_OUT[i] < EQUAL_POWER_FADE_OUT[i - 1],
      `Fade-out curve must strictly decrease: index ${i} (${EQUAL_POWER_FADE_OUT[i]}) vs ${i-1} (${EQUAL_POWER_FADE_OUT[i-1]})`
    );
  }

  // EQUAL_POWER_FADE_IN must strictly increase
  for (let i = 1; i < CROSSFADE_CURVE_SIZE; i++) {
    assert(
      EQUAL_POWER_FADE_IN[i] > EQUAL_POWER_FADE_IN[i - 1],
      `Fade-in curve must strictly increase: index ${i} (${EQUAL_POWER_FADE_IN[i]}) vs ${i-1} (${EQUAL_POWER_FADE_IN[i-1]})`
    );
  }
});

suite.test('EP-04: Float32 single-precision acoustic power P = out^2 + in^2 across all 64 points', () => {
  let maxPowerErr = 0;
  let maxDbErr = 0;

  for (let i = 0; i < CROSSFADE_CURVE_SIZE; i++) {
    const out = EQUAL_POWER_FADE_OUT[i];
    const inn = EQUAL_POWER_FADE_IN[i];
    const power = out * out + inn * inn;
    const powerErr = Math.abs(power - 1.0);
    const dbErr = Math.abs(10 * Math.log10(power));

    if (powerErr > maxPowerErr) maxPowerErr = powerErr;
    if (dbErr > maxDbErr) maxDbErr = dbErr;

    assert(
      powerErr < 1e-6,
      `Step ${i}: acoustic power deviation ${powerErr} exceeds float single-precision tolerance 1e-6 (power=${power})`
    );
    assert(
      dbErr < 1e-5,
      `Step ${i}: dB loss deviation ${dbErr} exceeds tolerance 1e-5 dB`
    );
  }

  // Confirm error is on order of ~5.9e-8 (float32 machine epsilon)
  assert(maxPowerErr < 1e-6, `Maximum power error across all 64 steps (${maxPowerErr}) must be < 1e-6`);
  assert(maxDbErr < 1e-5, `Maximum dB deviation across all 64 steps (${maxDbErr} dB) must be < 1e-5 dB`);
});

suite.test('EP-05: Continuous piecewise linear interpolation simulates Web Audio rendering (< 0.001 dB loss)', () => {
  // Web Audio API setValueCurveAtTime renders via linear interpolation between adjacent array points
  const SAMPLES = 10000;
  let maxInterpPowerErr = 0;
  let maxInterpDbErr = 0;

  for (let s = 0; s <= SAMPLES; s++) {
    const t = s / SAMPLES;
    const virtualIdx = t * (CROSSFADE_CURVE_SIZE - 1);
    const i0 = Math.floor(virtualIdx);
    const i1 = Math.min(CROSSFADE_CURVE_SIZE - 1, i0 + 1);
    const frac = virtualIdx - i0;

    const outInterp = EQUAL_POWER_FADE_OUT[i0] * (1 - frac) + EQUAL_POWER_FADE_OUT[i1] * frac;
    const inInterp = EQUAL_POWER_FADE_IN[i0] * (1 - frac) + EQUAL_POWER_FADE_IN[i1] * frac;

    const p = outInterp * outInterp + inInterp * inInterp;
    const pErr = Math.abs(p - 1.0);
    const dbErr = Math.abs(10 * Math.log10(p));

    if (pErr > maxInterpPowerErr) maxInterpPowerErr = pErr;
    if (dbErr > maxInterpDbErr) maxInterpDbErr = dbErr;
  }

  // The maximum power dip under piecewise linear interpolation of 64 points is ~0.000155 (< 0.0007 dB)
  assert(
    maxInterpDbErr < 0.001,
    `Piecewise linear interpolation max dB error ${maxInterpDbErr} dB must remain under 0.001 dB (virtually 0 dB)`
  );
  assert(
    maxInterpPowerErr < 0.001,
    `Piecewise linear interpolation max power error ${maxInterpPowerErr} must remain under 0.001`
  );
});

suite.test('EP-06: Web Audio MockAudioParam records setValueCurveAtTime with Float32Array curves', () => {
  const ctx = new MockAudioContext();
  const gainOut = ctx.createGain();
  const gainIn = ctx.createGain();

  const now = 10.0;
  const fadeSeconds = 6;

  gainOut.gain.cancelScheduledValues(now);
  gainIn.gain.cancelScheduledValues(now);
  gainOut.gain.setValueCurveAtTime(EQUAL_POWER_FADE_OUT, now, fadeSeconds);
  gainIn.gain.setValueCurveAtTime(EQUAL_POWER_FADE_IN, now, fadeSeconds);

  assertEqual(gainOut.gain.scheduledEvents.length, 1, 'gainOut must have 1 scheduled event');
  assertEqual(gainIn.gain.scheduledEvents.length, 1, 'gainIn must have 1 scheduled event');
  assertEqual(gainOut.gain.scheduledEvents[0].type, 'curve', 'gainOut event must be curve');
  assertEqual(gainIn.gain.scheduledEvents[0].type, 'curve', 'gainIn event must be curve');
  assertEqual(gainOut.gain.scheduledEvents[0].values, EQUAL_POWER_FADE_OUT, 'gainOut values must equal EQUAL_POWER_FADE_OUT');
  assertEqual(gainIn.gain.scheduledEvents[0].values, EQUAL_POWER_FADE_IN, 'gainIn values must equal EQUAL_POWER_FADE_IN');
  assertEqual(gainOut.gain.scheduledEvents[0].duration, 6, 'gainOut duration must be 6s');
  assertEqual(gainIn.gain.scheduledEvents[0].duration, 6, 'gainIn duration must be 6s');
});

// =========================================================================
// SECTION 2: UNIVERSAL DURATION GUARD (isAudioPreviewClip) STRESS MATRIX
// =========================================================================

suite.test('GUARD-01: Dispatch Core Matrix: actualDur in [28, 33]s with unknown vs known metadata', () => {
  // Test durations in window [28, 33]: 28, 29, 30, 31, 32, 33
  const windowDurations = [28.0, 29.0, 29.8, 30.0, 30.2, 31.0, 32.5, 33.0];

  for (const d of windowDurations) {
    // 1. expectedDur is 0 -> preview clip
    assertEqual(isAudioPreviewClip(d, 0), true, `Duration ${d}s with expectedDur=0 must be classified as preview`);

    // 2. expectedDur is NaN -> preview clip
    assertEqual(isAudioPreviewClip(d, NaN), true, `Duration ${d}s with expectedDur=NaN must be classified as preview`);

    // 3. expectedDur is null -> preview clip
    assertEqual(isAudioPreviewClip(d, null), true, `Duration ${d}s with expectedDur=null must be classified as preview`);

    // 4. expectedDur is undefined -> preview clip
    assertEqual(isAudioPreviewClip(d, undefined), true, `Duration ${d}s with expectedDur=undefined must be classified as preview`);

    // 5. expectedDur is empty string "" -> preview clip
    assertEqual(isAudioPreviewClip(d, ""), true, `Duration ${d}s with expectedDur="" must be classified as preview`);

    // 6. expectedDur is 240 (full track) -> preview clip (30s stream for 240s song!)
    assertEqual(isAudioPreviewClip(d, 240), true, `Duration ${d}s with expectedDur=240 must be classified as preview`);
    assertEqual(isAudioPreviewClip(d, "240"), true, `Duration ${d}s with expectedDur="240" must be classified as preview`);
  }

  // 7. 30s interlude with expectedDur === 30 -> must NOT be classified as preview!
  assertEqual(isAudioPreviewClip(30.0, 30), false, '30s clip for 30s interlude must be preserved');
  assertEqual(isAudioPreviewClip(30.0, "30"), false, '30s clip for "30" string interlude must be preserved');
  assertEqual(isAudioPreviewClip(29.0, 29), false, '29s clip for 29s interlude must be preserved');
  assertEqual(isAudioPreviewClip(33.0, 33), false, '33s clip for 33s interlude must be preserved');
});

suite.test('GUARD-02: Boundary precision of actualDur window [28.0, 33.0]', () => {
  // Lower boundary
  assertEqual(isAudioPreviewClip(27.999, 240), false, '27.999s is below preview window [28, 33]');
  assertEqual(isAudioPreviewClip(27.999, 0), false, '27.999s with expected=0 is below preview window');
  assertEqual(isAudioPreviewClip(28.000, 240), true, '28.000s is at exact lower bound of preview window');
  assertEqual(isAudioPreviewClip(28.000, 0), true, '28.000s with expected=0 is in preview window');

  // Upper boundary
  assertEqual(isAudioPreviewClip(33.000, 240), true, '33.000s is at exact upper bound of preview window');
  assertEqual(isAudioPreviewClip(33.000, 0), true, '33.000s with expected=0 is in preview window');
  assertEqual(isAudioPreviewClip(33.001, 240), false, '33.001s is above preview window [28, 33]');
  assertEqual(isAudioPreviewClip(33.001, 0), false, '33.001s with expected=0 is above preview window');
});

suite.test('GUARD-03: Legitimate full tracks and non-preview lengths (> 33s and < 28s)', () => {
  const normalLengths = [0, 5, 10, 15, 25, 27, 34, 45, 60, 120, 180, 210, 240, 300, 600];
  for (const len of normalLengths) {
    assertEqual(isAudioPreviewClip(len, len), false, `Legitimate track length ${len}s must return false`);
    assertEqual(isAudioPreviewClip(len, 0), false, `Track length ${len}s with 0 expected must return false (not in 28-33s window)`);
    assertEqual(isAudioPreviewClip(len, 240), false, `Track length ${len}s with 240 expected must return false (not in 28-33s window)`);
  }
});

suite.test('GUARD-04: Adversarial, malformed, and non-numeric inputs', () => {
  // Non-numeric actualDur must safely return false without throwing
  assertEqual(isAudioPreviewClip(null, 240), false, 'actualDur=null safely returns false');
  assertEqual(isAudioPreviewClip(undefined, 240), false, 'actualDur=undefined safely returns false');
  assertEqual(isAudioPreviewClip(NaN, 240), false, 'actualDur=NaN safely returns false');
  assertEqual(isAudioPreviewClip(Infinity, 240), false, 'actualDur=Infinity safely returns false');
  assertEqual(isAudioPreviewClip(-Infinity, 240), false, 'actualDur=-Infinity safely returns false');
  assertEqual(isAudioPreviewClip("30", 240), false, 'actualDur="30" (string) safely returns false');
  assertEqual(isAudioPreviewClip({}, 240), false, 'actualDur={} safely returns false');
  assertEqual(isAudioPreviewClip([], 240), false, 'actualDur=[] safely returns false');
  assertEqual(isAudioPreviewClip(-30, 240), false, 'actualDur=-30 safely returns false');

  // Adversarial expectedDuration with actualDur = 30
  assertEqual(isAudioPreviewClip(30, -50), true, 'negative expectedDuration treated as unknown -> true');
  assertEqual(isAudioPreviewClip(30, "invalid_str"), true, 'invalid string expectedDuration treated as unknown -> true');
  assertEqual(isAudioPreviewClip(30, "   "), true, 'whitespace expectedDuration treated as unknown -> true');
  assertEqual(isAudioPreviewClip(30, {}), true, 'object expectedDuration treated as unknown -> true');
  assertEqual(isAudioPreviewClip(30, []), true, 'array expectedDuration treated as unknown -> true');
  assertEqual(isAudioPreviewClip(30, false), true, 'false expectedDuration treated as unknown -> true');
});

suite.test('GUARD-05: Expected duration threshold boundary around 45 seconds', () => {
  // Cutoff rule: num > 45 || isUnknown
  // When expected duration is near 45s:
  assertEqual(isAudioPreviewClip(30, 44), false, 'expectedDur=44s is <= 45s and not unknown -> false');
  assertEqual(isAudioPreviewClip(30, 45), false, 'expectedDur=45s is <= 45s and not unknown -> false');
  assertEqual(isAudioPreviewClip(30, 45.1), true, 'expectedDur=45.1s is > 45s -> true (preview detected)');
  assertEqual(isAudioPreviewClip(30, 46), true, 'expectedDur=46s is > 45s -> true (preview detected)');
  assertEqual(isAudioPreviewClip(30, 60), true, 'expectedDur=60s is > 45s -> true (preview detected)');
  assertEqual(isAudioPreviewClip(30, 180), true, 'expectedDur=180s is > 45s -> true (preview detected)');
});

// =========================================================================
// SECTION 3: CODE AUDIT & CALL-SITE VERIFICATION
// =========================================================================

suite.test('AUDIT-01: isAudioPreviewClip is defined and exported in window.SynthAudioEngine', () => {
  assert(appJsContent.includes('function isAudioPreviewClip(actualDur, expectedDuration)'), 'app.js defines isAudioPreviewClip');
  assert(appJsContent.includes('isAudioPreviewClip,'), 'window.SynthAudioEngine exports isAudioPreviewClip');
});

suite.test('AUDIT-02: All duration checkpoints across app.js invoke isAudioPreviewClip', () => {
  const matches = appJsContent.match(/isAudioPreviewClip\(/g) || [];
  // There should be at least 7 call sites in app.js
  assert(
    matches.length >= 7,
    `Expected at least 7 occurrences of isAudioPreviewClip in app.js, found ${matches.length}`
  );
});

suite.test('AUDIT-03: Equal-power curves are applied in playTrackWithCrossfade and resume', () => {
  assert(
    appJsContent.includes('setValueCurveAtTime(EQUAL_POWER_FADE_OUT'),
    'app.js must call setValueCurveAtTime with EQUAL_POWER_FADE_OUT'
  );
  assert(
    appJsContent.includes('setValueCurveAtTime(EQUAL_POWER_FADE_IN'),
    'app.js must call setValueCurveAtTime with EQUAL_POWER_FADE_IN'
  );
});

// Run suite if executed directly
if (require.main === module) {
  suite.run().then(res => {
    console.log('\n===============================================================');
    console.log(`EMPIRICAL CHALLENGER 1 RESULTS: ${res.passed}/${res.total} tests passed (${res.failed} failed)`);
    console.log('===============================================================');
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
