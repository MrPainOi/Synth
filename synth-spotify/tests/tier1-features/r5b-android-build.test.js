/**
 * Tier 1: Feature Coverage — R5-B: Android Build Verification
 * Requirement: ORIGINAL_REQUEST §R5 & PROJECT.md
 * - Verify Android APK build script and Synth-Spotify.apk binary integrity.
 */

const fs = require('fs');
const path = require('path');
const { assert, assertEqual, createSuite, readProjectFile, projectFileExists, SPOTIFY_DIR, ROOT_DIR } = require('../test-utils');

const suite = createSuite('Tier 1: R5-B — Android Build Verification');

suite.test('R5B-01: build-android.js script exists in synth-spotify/', () => {
  assert(projectFileExists('synth-spotify/build-android.js'), 'build-android.js must exist');
  const script = readProjectFile('synth-spotify/build-android.js');
  assert(script.includes('runBuild'), 'build-android.js must define runBuild pipeline');
});

suite.test('R5B-02: Base APK container exists at project root', () => {
  const baseApkPath = path.join(ROOT_DIR, 'Synth.apk');
  assert(fs.existsSync(baseApkPath), 'Base APK Synth.apk must exist at root');
  const stat = fs.statSync(baseApkPath);
  assert(stat.size > 1024 * 1024, 'Synth.apk size must exceed 1MB');
});

suite.test('R5B-03: build-android.js enforces zipalign 4-byte alignment and APK signing', () => {
  const script = readProjectFile('synth-spotify/build-android.js');
  assert(script.includes('zipalign'), 'Script must invoke zipalign');
  assert(script.includes('apksigner'), 'Script must invoke apksigner');
  assert(script.includes('-f 4'), 'Zipalign must enforce 4-byte boundary');
});

suite.test('R5B-04: Synth-Spotify.apk binary artifact exists and is non-empty', () => {
  const apkPath = path.join(SPOTIFY_DIR, 'Synth-Spotify.apk');
  assert(fs.existsSync(apkPath), 'Synth-Spotify.apk must exist in synth-spotify/');
  const stat = fs.statSync(apkPath);
  assert(stat.size > 2 * 1024 * 1024, `Synth-Spotify.apk must be >2MB, found ${stat.size} bytes`);
});

suite.test('R5B-05: build script correctly stages assets/public with core web bundle', () => {
  const script = readProjectFile('synth-spotify/build-android.js');
  assert(script.includes('assets/public'), 'Script must bundle web files into assets/public');
  assert(script.includes('styles.css'), 'Bundle must copy styles.css');
  assert(script.includes('app.js'), 'Bundle must copy app.js');
  assert(script.includes('mobile-bridge.js'), 'Bundle must inject mobile-bridge.js');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
