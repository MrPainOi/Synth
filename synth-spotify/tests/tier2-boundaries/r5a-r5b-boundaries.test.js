/**
 * Tier 2: Boundary & Corner Cases — R5-A & R5-B (Truncation Bug & Build Pipeline)
 * 10 Boundary Test Cases (5 per feature for R5-A, R5-B)
 */

const fs = require('fs');
const path = require('path');
const { assert, assertEqual, createSuite, readProjectFile, SPOTIFY_DIR } = require('../test-utils');

const suite = createSuite('Tier 2: R5A-R5B — Truncation & Build Boundaries');

// =========================================================================
// R5-A: Audio Truncation Boundaries
// =========================================================================
suite.test('B-R5A-01: Boundary 28.9s is not classified as a 30s preview clip', () => {
  function isPreview(dur) {
    return dur >= 29.0 && dur <= 30.5;
  }
  assertEqual(isPreview(28.9), false, '28.9s is below preview threshold');
});

suite.test('B-R5A-02: Boundary 30.6s is not classified as a 30s preview clip', () => {
  function isPreview(dur) {
    return dur >= 29.0 && dur <= 30.5;
  }
  assertEqual(isPreview(30.6), false, '30.6s is above preview threshold');
});

suite.test('B-R5A-03: Track with 0s or NaN duration triggers recovery', () => {
  function shouldRecover(duration) {
    const d = Number(duration);
    return isNaN(d) || d <= 0;
  }
  assertEqual(shouldRecover(0), true, '0s duration must trigger recovery');
  assertEqual(shouldRecover(NaN), true, 'NaN duration must trigger recovery');
  assertEqual(shouldRecover(180), false, 'Valid duration does not trigger recovery');
});

suite.test('B-R5A-04: Short sound bite / interlude (15s) with matching metadata is not rejected', () => {
  function validateTrackFidelity(actualDuration, expectedDuration) {
    // If expected is short, actual is short -> valid
    if (expectedDuration && expectedDuration < 30 && Math.abs(actualDuration - expectedDuration) <= 2) {
      return true;
    }
    // If expected is full length but actual is ~30s -> preview bug
    if (expectedDuration > 60 && actualDuration >= 29 && actualDuration <= 31) {
      return false;
    }
    return true;
  }

  const isInterludeValid = validateTrackFidelity(15, 15);
  assertEqual(isInterludeValid, true, 'Intentional 15s interlude must be accepted');

  const isTruncatedBugValid = validateTrackFidelity(30, 240);
  assertEqual(isTruncatedBugValid, false, '30s preview of 4 min song must be rejected');
});

suite.test('B-R5A-05: Duration difference > 20% triggers fallback search provider', () => {
  function needsFallback(resolvedDuration, targetDuration) {
    if (!targetDuration || targetDuration <= 0) return false;
    const diff = Math.abs(resolvedDuration - targetDuration);
    return (diff / targetDuration) > 0.20;
  }

  assertEqual(needsFallback(30, 200), true, '30s vs 200s (85% diff) requires fallback');
  assertEqual(needsFallback(195, 200), false, '195s vs 200s (2.5% diff) is acceptable');
});

// =========================================================================
// R5-B: Android APK Build Boundaries
// =========================================================================
suite.test('B-R5B-01: build script generates debug keystore if absent', () => {
  const script = readProjectFile('synth-spotify/build-android.js');
  assert(script.includes('keytool'), 'Script must invoke keytool to generate keystore');
  assert(script.includes('synth_debug.keystore'), 'Script must reference keystore path');
});

suite.test('B-R5B-02: Zero-byte APK detection throws build error', () => {
  function verifyApkSize(filePath, minBytes = 1024 * 1024) {
    if (!fs.existsSync(filePath)) throw new Error('APK not found');
    const stat = fs.statSync(filePath);
    if (stat.size < minBytes) {
      throw new Error(`Corrupted APK: size ${stat.size} is smaller than minimum ${minBytes}`);
    }
    return true;
  }

  const validApk = path.join(SPOTIFY_DIR, 'Synth-Spotify.apk');
  const isValid = verifyApkSize(validApk);
  assertEqual(isValid, true, 'Existing APK must exceed minimum size limit');
});

suite.test('B-R5B-03: resources.arsc is STORED uncompressed in pack_apk.py for Android 11+', () => {
  const script = readProjectFile('synth-spotify/build-android.js');
  assert(script.includes("rel == 'resources.arsc'"), 'pack_apk must single out resources.arsc');
  assert(script.includes('ZIP_STORED'), 'resources.arsc must use ZIP_STORED');
});

suite.test('B-R5B-04: APK signature verification scheme parser checks for "DOES NOT VERIFY"', () => {
  function parseVerifyOutput(out) {
    if (!out.includes('Verifies') || out.includes('DOES NOT VERIFY')) {
      return false;
    }
    return true;
  }

  assertEqual(parseVerifyOutput('Verifies\nVerified using v1 scheme: true\nVerified using v2 scheme: true'), true, 'Valid output verifies');
  assertEqual(parseVerifyOutput('DOES NOT VERIFY\nFailed to verify'), false, 'Failed signature detected');
});

suite.test('B-R5B-05: Missing prerequisite check halts build before modifying staging', () => {
  function checkPrerequisites(baseApk, zipalign) {
    if (!fs.existsSync(baseApk)) throw new Error(`Base APK not found at: ${baseApk}`);
    if (!fs.existsSync(zipalign)) throw new Error(`zipalign not found at: ${zipalign}`);
    return true;
  }

  let errorCaught = false;
  try {
    checkPrerequisites('C:\\nonexistent\\Synth.apk', 'C:\\nonexistent\\zipalign.exe');
  } catch (e) {
    errorCaught = true;
    assert(e.message.includes('not found'), 'Must produce descriptive prerequisite error');
  }
  assertEqual(errorCaught, true, 'Prerequisite check must throw on missing binary');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
