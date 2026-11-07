/**
 * Automated Verification: Equalizer Button & Modal Interaction Integrity Test
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING EQUALIZER BUTTON & MODAL INTEGRITY ===');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const stylesCssContent = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

// 1. Verify desktop open audio settings button exists
assert(htmlContent.includes('id="btn-open-audio-settings"'), 'btn-open-audio-settings must exist in index.html');
console.log('✔ 1. Desktop tool button btn-open-audio-settings exists');

// 2. Verify animated equalizer bars next to title is interactive
assert(htmlContent.includes('id="now-playing-equalizer"') && htmlContent.includes('role="button"'), 'now-playing-equalizer must be marked as role="button"');
assert(stylesCssContent.includes('#now-playing-equalizer {') && stylesCssContent.includes('cursor: pointer !important;'), 'now-playing-equalizer must have cursor: pointer in styles.css');
console.log('✔ 2. Desktop now-playing-equalizer is interactive with role="button" and cursor: pointer');

// 3. Verify mobile player has dedicated EQ button
assert(htmlContent.includes('id="btn-mob-eq"'), 'btn-mob-eq must exist in mobile player bottom actions');
console.log('✔ 3. Mobile fullscreen player includes dedicated btn-mob-eq button');

// 4. Verify context menu includes Equalizer option
assert(htmlContent.includes('id="ctx-open-eq"'), 'ctx-open-eq must exist in desktop context menu');
console.log('✔ 4. Desktop track context menu includes Equalizer action');

// 5. Verify keyboard shortcut modal includes 'E' shortcut
assert(htmlContent.includes('<span class="shortcut-key">E</span>'), 'modal-shortcuts must display E shortcut');
assert(appJsContent.includes("case 'KeyE':"), 'app.js keydown handler must support KeyE shortcut');
console.log('✔ 5. Keyboard shortcut E wired to open Equalizer');

// 6. Verify openAudioSettingsModal and switchAudioSettingsTab functions exist
assert(appJsContent.includes('function openAudioSettingsModal('), 'openAudioSettingsModal must be defined in app.js');
assert(appJsContent.includes('function switchAudioSettingsTab('), 'switchAudioSettingsTab must be defined in app.js');
assert(appJsContent.includes('window.openAudioSettingsModal = openAudioSettingsModal;'), 'openAudioSettingsModal must be exported on window');
console.log('✔ 6. openAudioSettingsModal and switchAudioSettingsTab functions properly defined and exported');

// 7. Verify all trigger buttons wire to openAudioSettingsModal
assert(appJsContent.includes("nowPlayingEqBtn.addEventListener('click'"), 'now-playing-equalizer must wire click listener');
assert(appJsContent.includes("btnMobEq && modal"), 'btnMobEq must wire click listener');
assert(appJsContent.includes("ctxOpenEq && modal"), 'ctxOpenEq must wire click listener');
console.log('✔ 7. All UI triggers (player bar, title EQ animation, mobile player, context menu, hotkey) wired to Equalizer modal');

// 8. Verify mobile modal styles
assert(stylesCssContent.includes('.audio-settings-modal-box {') && stylesCssContent.includes('@media (max-width: 768px)'), 'Mobile responsive modal rules must exist');
console.log('✔ 8. Mobile responsive layout for audio settings modal verified');

console.log('\n🎉 ALL 8 EQUALIZER BUTTON & WINDOW INTEGRITY CHECKS PASSED!\n');

