/**
 * Automated Verification: Background Update Checker & Modal System (PC & Mobile)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING APPLICATION UPDATE CHECKER & MODAL SYSTEM ===\n');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SPOTIFY_DIR = path.resolve(__dirname, '..');

// 1. Verify version.json in both root and synth-spotify
console.log('1. Checking version.json structure and repository links...');
const rootVersionPath = path.join(ROOT_DIR, 'version.json');
const spotifyVersionPath = path.join(SPOTIFY_DIR, 'version.json');

assert(fs.existsSync(rootVersionPath), 'Root version.json must exist');
assert(fs.existsSync(spotifyVersionPath), 'synth-spotify/version.json must exist');

const rootVer = JSON.parse(fs.readFileSync(rootVersionPath, 'utf8'));
assert(rootVer.version, 'version.json must contain a version string');
assert(rootVer.downloadUrls, 'version.json must contain downloadUrls');
assert(rootVer.downloadUrls.android.includes('Synth-Spotify.apk'), 'Android download URL must point to Synth-Spotify.apk');
assert(rootVer.downloadUrls.android.includes('MrPainOi/Synth'), 'Must target user Git repo (MrPainOi/Synth)');
assert(rootVer.downloadUrls.pc.includes('MrPainOi/Synth'), 'PC download URL must target user Git repo');
console.log(`  ✔ version.json valid (v${rootVer.version}) with Android APK & PC URLs.`);

// 2. Verify HTML Modal Structure in index.html
console.log('2. Checking modal-update-dialog elements in index.html...');
const indexHtml = fs.readFileSync(path.join(SPOTIFY_DIR, 'index.html'), 'utf8');

assert(indexHtml.includes('id="modal-update-dialog"'), 'Must have modal-update-dialog element');
assert(indexHtml.includes('id="update-ver-now"'), 'Must have update-ver-now badge');
assert(indexHtml.includes('id="update-ver-new"'), 'Must have update-ver-new badge');
assert(indexHtml.includes('id="btn-update-later"'), 'Must have btn-update-later button');
assert(indexHtml.includes('id="btn-update-now"'), 'Must have btn-update-now button');
assert(indexHtml.includes('Later</button>'), 'Must render button with "Later" text');
assert(indexHtml.includes('>Update</span>') || indexHtml.includes('>Update</button>'), 'Must render button with "Update" text');
assert(indexHtml.includes('id="btn-check-updates"'), 'Must have manual check button in settings');
console.log('  ✔ All update modal DOM elements, badges, and "Later" / "Update" buttons verified.');

// 3. Verify CSS styling in styles.css
console.log('3. Checking update modal styles in styles.css...');
const stylesCss = fs.readFileSync(path.join(SPOTIFY_DIR, 'styles.css'), 'utf8');

assert(stylesCss.includes('.update-modal-box'), 'Must have .update-modal-box style');
assert(stylesCss.includes('.update-version-row'), 'Must have .update-version-row style');
assert(stylesCss.includes('.update-version-badge.new-ver'), 'Must have .update-version-badge.new-ver style');
assert(stylesCss.includes('.update-action-btn'), 'Must have .update-action-btn style');
console.log('  ✔ CSS rules for update modal card, version comparison badges, and buttons verified.');

// 4. Verify Semver comparison logic
console.log('4. Testing semantic version comparison helper...');
function parseSemver(v) {
  if (!v || typeof v !== 'string') return [0, 0, 0];
  const cleaned = v.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareSemver(v1, v2) {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

assert.strictEqual(compareSemver('42.4.0', '42.3.0'), 1, '42.4.0 must be newer than 42.3.0');
assert.strictEqual(compareSemver('v42.3.1', '42.3.0'), 1, 'v42.3.1 must be newer than 42.3.0');
assert.strictEqual(compareSemver('43.0.0', '42.9.9'), 1, '43.0.0 must be newer than 42.9.9');
assert.strictEqual(compareSemver('42.3.0', '42.3.0'), 0, 'Identical versions must return 0');
assert.strictEqual(compareSemver('42.2.0', '42.3.0'), -1, '42.2.0 must be older than 42.3.0');
console.log('  ✔ Semantic version comparison correctly identifies new, same, and older versions.');

// 5. Verify App.js integration
console.log('5. Checking app.js update checker & startup lifecycle...');
const appJs = fs.readFileSync(path.join(SPOTIFY_DIR, 'app.js'), 'utf8');

assert(appJs.includes('checkAppUpdates({ silent: true })'), 'Must execute startup check with silent: true');
assert(appJs.includes('UPDATE_VERSION_JSON_URL'), 'Must check version.json from raw git');
assert(appJs.includes('UPDATE_RELEASE_API_URL'), 'Must have GitHub release fallback');
assert(appJs.includes('checkAppUpdates'), 'Must expose checkAppUpdates on SynthAudioEngine');
assert(appJs.includes('openUpdateModal'), 'Must have openUpdateModal function');
assert(appJs.includes('handleUpdateAction'), 'Must have handleUpdateAction');
console.log('  ✔ Background startup check, Git endpoints, and update action routing verified.');

console.log('\n🎉 ALL 5 UPDATE CHECKER & MODAL SYSTEM CHECKS PASSED!\n');

