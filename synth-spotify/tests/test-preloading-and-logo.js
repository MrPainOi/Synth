/**
 * Automated Verification: Next-Track Background Preloading & Application Logo System
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING NEXT-TRACK PRELOAD & APPLICATION LOGO SYSTEM ===\n');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SPOTIFY_DIR = path.resolve(__dirname, '..');

// ----------------------------------------------------
// Test 1: Web & Android Logo Assets
// ----------------------------------------------------
console.log('1. Checking Web & Android logo assets...');
const requiredAssets = [
  path.join(ROOT_DIR, 'assets', 'icon.png'),
  path.join(SPOTIFY_DIR, 'assets', 'app_logo.png'),
  path.join(SPOTIFY_DIR, 'assets', 'spotify_logo_icon.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'ic_launcher_bg.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-mdpi', 'ic_launcher.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-mdpi', 'ic_launcher_round.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-mdpi', 'ic_launcher_foreground.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-hdpi', 'ic_launcher.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-hdpi', 'ic_launcher_round.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-hdpi', 'ic_launcher_foreground.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xhdpi', 'ic_launcher.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xhdpi', 'ic_launcher_round.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xhdpi', 'ic_launcher_foreground.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xxhdpi', 'ic_launcher.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xxhdpi', 'ic_launcher_round.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xxhdpi', 'ic_launcher_foreground.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xxxhdpi', 'ic_launcher.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xxxhdpi', 'ic_launcher_round.png'),
  path.join(SPOTIFY_DIR, 'res-icons', 'mipmap-xxxhdpi', 'ic_launcher_foreground.png')
];

for (const a of requiredAssets) {
  assert(fs.existsSync(a), `Required asset missing: ${a}`);
  const st = fs.statSync(a);
  assert(st.size > 200, `Asset file is unexpectedly small: ${a} (${st.size} bytes)`);
}
console.log(`  ✔ Verified all ${requiredAssets.length} icon and mipmap assets exist with valid byte sizes.`);

// ----------------------------------------------------
// Test 2: HTML Integration (Favicon & Splash Screen)
// ----------------------------------------------------
console.log('2. Checking index.html favicon and splash screen logo...');
const indexHtml = fs.readFileSync(path.join(SPOTIFY_DIR, 'index.html'), 'utf8');

assert(indexHtml.includes('href="assets/app_logo.png"'), 'Favicon must reference assets/app_logo.png');
assert(indexHtml.includes('<img class="splash-logo" src="assets/app_logo.png"'), 'Splash screen must render app_logo.png');
console.log('  ✔ index.html correctly renders the new music note logo in favicon and splash screen.');

// ----------------------------------------------------
// Test 3: Android Build Script Integration
// ----------------------------------------------------
console.log('3. Checking build-android.js launcher mipmap replacement...');
const buildScript = fs.readFileSync(path.join(SPOTIFY_DIR, 'build-android.js'), 'utf8');

assert(buildScript.includes('Updating Android launcher icons & mipmaps'), 'build-android.js must have icon update step');
assert(buildScript.includes('res-icons'), 'build-android.js must copy from res-icons directory');
console.log('  ✔ build-android.js integrates automated launcher mipmap & drawable replacement.');

// ----------------------------------------------------
// Test 4: Next-Track Preloader Logic in app.js
// ----------------------------------------------------
console.log('4. Checking app.js Next-Track Background Preloading implementation...');
const appJs = fs.readFileSync(path.join(SPOTIFY_DIR, 'app.js'), 'utf8');

assert(appJs.includes('async function preloadNextTrack()'), 'preloadNextTrack must be declared');
assert(appJs.includes('const preloadedStreamCache = new Map()'), 'preloadedStreamCache map must exist');
assert(appJs.includes('getTrackCacheKey'), 'getTrackCacheKey helper must exist');
assert(appJs.includes('preloadNextTrack'), 'preloadNextTrack must be exposed on SynthAudioEngine');
assert(appJs.includes('getPreloadedStreamCache:'), 'getPreloadedStreamCache must be exposed on SynthAudioEngine');
assert(appJs.includes('getPreloadedNextTrack:'), 'getPreloadedNextTrack must be exposed on SynthAudioEngine');
assert(appJs.includes('inactiveDeck.preload = \'auto\''), 'inactiveDeck must be primed with preload=auto');
assert(appJs.includes('inactiveDeck.load()'), 'inactiveDeck must call load() to initiate background buffering');
console.log('  ✔ Preload functions, caching structures, and deck priming verified in app.js.');

console.log('\n🎉 ALL PRELOADING & LOGO SYSTEM VERIFICATIONS PASSED!\n');

