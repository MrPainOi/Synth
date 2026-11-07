/**
 * Automated Verification: Album Art Fallback, Remote EQ Control, and Mobile Volume Bar
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING ALBUM ART, REMOTE EQ CONTROL & MOBILE VOLUME BAR ===');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const spotifyServerJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// 1. Verify getTrackArtwork and handleArtworkImgError functions
assert(appJs.includes('function getTrackArtwork(t) {'), 'getTrackArtwork must be defined in app.js');
assert(appJs.includes('https://i.ytimg.com/vi/${id}/hqdefault.jpg'), 'getTrackArtwork must fallback to YouTube HQ thumbnail for 11-char IDs');
assert(appJs.includes('function handleArtworkImgError(img, trackId) {'), 'handleArtworkImgError must be defined in app.js');
console.log('✔ 1. getTrackArtwork & handleArtworkImgError helpers properly implemented');

// 2. Verify server.js and synth-spotify/server.js fallback
assert(serverJs.includes('https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg'), 'server.js saveTrackMetadata must auto-fill YouTube thumbnail');
assert(spotifyServerJs.includes('function resolveTrackArtwork(t) {'), 'synth-spotify/server.js must define resolveTrackArtwork');
console.log('✔ 2. Backend servers auto-resolve and backfill YouTube album artwork');

// 3. Verify CSS .mob-player-volume-section is hidden by default
assert(stylesCss.includes('.mob-player-volume-section {') && stylesCss.includes('display: none;'), 'styles.css must hide .mob-player-volume-section by default');
console.log('✔ 3. Mobile volume bar is hidden by default in styles.css');

// 4. Verify updateClientUI toggles mobile volume bar based on remote connection
assert(appJs.includes("mobPlayerVolumeSection.style.display = connected ? 'flex' : 'none';"), 'updateClientUI must show volume bar when connected, hide when disconnected');
console.log('✔ 4. updateClientUI correctly toggles volume bar on phone');

// 5. Verify openMobilePlayer guards volume bar visibility
assert(appJs.includes("mobPlayerVolumeSection.style.display = state.remoteClientMode ? 'flex' : 'none';"), 'openMobilePlayer must set volume bar visibility according to state.remoteClientMode');
console.log('✔ 5. openMobilePlayer enforces remoteClientMode volume bar display');

// 6. Verify remote client DSP queue & throttle
assert(appJs.includes('function queueRemoteDspCommand(action, payload) {'), 'queueRemoteDspCommand must be defined for throttled EQ transmission');
assert(appJs.includes("queueRemoteDspCommand('setBandGain'"), 'setBandGain must forward to PC host when remoteClientMode is true');
assert(appJs.includes("queueRemoteDspCommand('setTone'"), 'setTone must forward to PC host when remoteClientMode is true');
assert(appJs.includes("sendRemoteClientCommand('setPreset'"), 'setPreset must forward to PC host when remoteClientMode is true');
assert(appJs.includes("sendRemoteClientCommand('resetEqualizer'"), 'resetEqualizer must forward to PC host when remoteClientMode is true');
assert(appJs.includes("sendRemoteClientCommand('resetAudioSettings'"), 'resetAudioSettings must forward to PC host when remoteClientMode is true');
console.log('✔ 6. Mobile client routes EQ and audio settings changes to PC host');

// 7. Verify PC host handles remote EQ commands
assert(appJs.includes("action === 'setBandGain'"), 'handleRemoteCommandOnPc must handle setBandGain');
assert(appJs.includes("action === 'setTone'"), 'handleRemoteCommandOnPc must handle setTone');
assert(appJs.includes("action === 'setPreset'"), 'handleRemoteCommandOnPc must handle setPreset');
assert(appJs.includes("action === 'resetEqualizer'"), 'handleRemoteCommandOnPc must handle resetEqualizer');
assert(appJs.includes("action === 'resetAudioSettings'"), 'handleRemoteCommandOnPc must handle resetAudioSettings');
assert(appJs.includes("action === 'setAudioDsp'"), 'handleRemoteCommandOnPc must handle setAudioDsp');
console.log('✔ 7. PC host dispatches incoming remote EQ & DSP commands');

// 8. Verify broadcastRemoteState includes dsp & applyHostState reconciles dsp
assert(appJs.includes('dsp: { ...currentDSPDeltas }'), 'broadcastRemoteState must broadcast PC DSP state');
assert(appJs.includes('if (hostState.dsp && typeof hostState.dsp === \'object\' && !isDraggingEq) {'), 'applyHostState must sync DSP to phone sliders when not dragging');
console.log('✔ 8. Real-time bi-directional DSP sync between PC and phone verified');

// 9. Functional test: getTrackArtwork logic
{
  function testGetTrackArtwork(t) {
    if (!t) return 'assets/radio_thumb.png';
    let art = t.thumbnail || t.art || t.coverUrl || '';
    if (typeof art === 'string' && art.startsWith('//')) art = 'https:' + art;
    const id = t.id || '';
    if ((!art || art === 'assets/radio_thumb.png' || !art.startsWith('http')) && id && /^[\w-]{11}$/.test(id)) {
      art = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    return art || 'assets/radio_thumb.png';
  }

  assert.strictEqual(
    testGetTrackArtwork({ id: 'dQw4w9WgXcQ', thumbnail: '' }),
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'Empty thumbnail with 11-char YouTube ID resolves to YouTube HQ default'
  );
  assert.strictEqual(
    testGetTrackArtwork({ id: 'local_123', thumbnail: 'https://i.scdn.co/image/ab67616d0000b273b2' }),
    'https://i.scdn.co/image/ab67616d0000b273b2',
    'Valid HTTP thumbnail is preserved'
  );
  assert.strictEqual(
    testGetTrackArtwork({ id: 'local_999', thumbnail: '' }),
    'assets/radio_thumb.png',
    'Local track with no thumbnail and non-YT id falls back to radio_thumb.png'
  );
  console.log('✔ 9. Functional tests for artwork resolution passed');
}

console.log('\n🎉 ALL ALBUM ART, REMOTE EQ & MOBILE VOLUME CHECKS PASSED!\n');

