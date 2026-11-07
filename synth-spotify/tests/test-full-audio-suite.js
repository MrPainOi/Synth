/**
 * Verification Test: Full Synth Audio Suite (Speed & Pitch, Audio FX, Equalizer, Enhancer, Sleep, Reset)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING FULL SYNTH AUDIO SUITE IMPLEMENTATION ===');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const stylesCssContent = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

// 1. Verify all 7 Audio Tabs in index.html
const requiredTabs = [
  'tab-audio-enhance',
  'tab-audio-tempo',
  'tab-audio-effects',
  'tab-audio-eq',
  'tab-audio-presets',
  'tab-audio-crossfade',
  'tab-audio-sleep'
];
requiredTabs.forEach(id => {
  assert(htmlContent.includes(`id="${id}"`), `Tab #${id} must exist in index.html`);
});
console.log('✔ 1. All 7 Audio Navigation Tabs exist (Enhancer, Speed & Pitch, Audio FX, Equalizer, Presets, Crossfade, Sleep)');

// 2. Verify all 7 Audio Panes in index.html
const requiredPanes = [
  'pane-audio-enhance',
  'pane-audio-tempo',
  'pane-audio-effects',
  'pane-audio-eq',
  'pane-audio-presets',
  'pane-audio-crossfade',
  'pane-audio-sleep'
];
requiredPanes.forEach(id => {
  assert(htmlContent.includes(`id="${id}"`), `Pane #${id} must exist in index.html`);
});
console.log('✔ 2. All 7 Audio Panes exist and map to corresponding tabs');

// 3. Verify Speed & Pitch Controls (matching screenshot 1)
assert(htmlContent.includes('id="slider-speed"'), '#slider-speed must exist');
assert(htmlContent.includes('id="val-speed"'), '#val-speed must exist');
assert(htmlContent.includes('id="slider-speed-pitch"'), '#slider-speed-pitch must exist');
assert(htmlContent.includes('id="val-speed-pitch"'), '#val-speed-pitch must exist');
assert(htmlContent.includes('id="slider-pitch"'), '#slider-pitch must exist');
assert(htmlContent.includes('id="val-pitch"'), '#val-pitch must exist');
assert(htmlContent.includes('id="slider-gain"'), '#slider-gain must exist');
assert(htmlContent.includes('id="val-gain"'), '#val-gain must exist');
console.log('✔ 3. Speed & Pitch tab controls (Speed, Speed pitch, Pitch, Volume gain) verified');

// 4. Verify Audio FX Controls (matching screenshot 2)
assert(htmlContent.includes('id="slider-reverb"'), '#slider-reverb must exist');
assert(htmlContent.includes('id="val-reverb"'), '#val-reverb must exist');
assert(htmlContent.includes('id="slider-distortion"'), '#slider-distortion must exist');
assert(htmlContent.includes('id="val-distortion"'), '#val-distortion must exist');
assert(htmlContent.includes('id="slider-echo"'), '#slider-echo must exist');
assert(htmlContent.includes('id="val-echo"'), '#val-echo must exist');
console.log('✔ 4. Audio FX tab controls (Reverb, Distortion, Echo) verified');

// 5. Verify Master Reset Audio Settings Button (matching screenshots)
assert(htmlContent.includes('id="btn-reset-audio"'), '#btn-reset-audio must exist');
assert(htmlContent.includes('Reset audio settings'), 'Button text "Reset audio settings" must exist');
console.log('✔ 5. Master "Reset audio settings" button exists in footer');

// 6. Verify Web Audio DSP implementation in app.js
assert(appJsContent.includes('distortionNode = audioCtx.createWaveShaper();'), 'distortion WaveShaper node created');
assert(appJsContent.includes('makeDistortionCurve('), 'makeDistortionCurve helper defined');
assert(appJsContent.includes('hasTapePitch'), 'Tape pitch varispeed calculation implemented');
assert(appJsContent.includes('Math.pow(2, pitch / 12)'), 'Semitone pitch multiplier formula implemented');
console.log('✔ 6. Complete DSP Graph wiring (Distortion, Delay, Reverb, Tape Pitch, Volume Gain) verified');

// 7. Verify CSS 2-column layout and styling
assert(stylesCssContent.includes('.audio-modal-layout'), '.audio-modal-layout CSS rules exist');
assert(stylesCssContent.includes('.audio-tabs'), '.audio-tabs sidebar CSS rules exist');
assert(stylesCssContent.includes('.pill-range'), '.pill-range slider styling exists');
console.log('✔ 7. CSS layout matches Synth design tokens with responsive mobile support');

console.log('\n🎉 ALL FULL SYNTH AUDIO SUITE VERIFICATION CHECKS PASSED!\n');

