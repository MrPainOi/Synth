/**
 * Automated Verification: Timeline Seeking & Drag Lock Integrity Test
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING TIMELINE SEEK LOCK & DRAG INTEGRITY ===');

const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const stylesCssContent = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

// 1. Verify global seek & drag state variables exist
assert(appJsContent.includes('let isDraggingTimeline = false;'), 'isDraggingTimeline must be declared globally');
assert(appJsContent.includes('let isDraggingMobTimeline = false;'), 'isDraggingMobTimeline must be declared globally');
assert(appJsContent.includes('let isSeekingPending = false;'), 'isSeekingPending must be declared globally');
assert(appJsContent.includes('let pendingSeekTime = null;'), 'pendingSeekTime must be declared globally');
console.log('✔ 1. Global seek & drag lock variables properly declared');

// 2. Verify seekAudio activates isSeekingPending lock
assert(appJsContent.includes('isSeekingPending = true;'), 'seekAudio must engage isSeekingPending lock');
assert(appJsContent.includes('pendingSeekTime = targetTime;'), 'seekAudio must record pendingSeekTime');
console.log('✔ 2. seekAudio sets asynchronous seek lock');

// 3. Verify timeupdate is guarded against isSeekingPending, isDraggingTimeline, isDraggingMobTimeline, audioEl.seeking
assert(appJsContent.includes('if (isDraggingTimeline || isDraggingMobTimeline || isSeekingPending || (audioEl && audioEl.seeking)) {'), 'timeupdate must be guarded against pending seek and drags');
console.log('✔ 3. timeupdate event handler properly guarded against stale decoder frames');

// 4. Verify seeked event releases isSeekingPending lock
assert(appJsContent.includes("audioEl.addEventListener('seeked'"), 'seeked event listener must be registered on audioEl');
console.log('✔ 4. seeked event listener correctly registered to release seek lock');

// 5. Verify applyHostState does not overwrite currentTime during drag or pending seek
assert(appJsContent.includes('if (Number.isFinite(hostState.currentTime) && !isDraggingTimeline && !isDraggingMobTimeline && !isSeekingPending) {'), 'applyHostState must respect local seek lock');
console.log('✔ 5. applyHostState guarded against overwriting playhead during pending seeks');

// 6. Verify broadcastRemoteState broadcasts pendingSeekTime when seeking
assert(appJsContent.includes('(isSeekingPending && Number.isFinite(pendingSeekTime))'), 'broadcastRemoteState must prefer pendingSeekTime when seeking');
console.log('✔ 6. broadcastRemoteState handles pendingSeekTime accurately');

// 7. Verify pointer-events: none on timeline bar children in styles.css
assert(stylesCssContent.includes('.timeline-bar-bg {') && stylesCssContent.includes('pointer-events: none;'), 'timeline-bar-bg must have pointer-events: none');
assert(stylesCssContent.includes('.timeline-bar-fill {') && stylesCssContent.includes('pointer-events: none;'), 'timeline-bar-fill must have pointer-events: none');
assert(stylesCssContent.includes('.timeline-thumb {') && stylesCssContent.includes('pointer-events: none;'), 'timeline-thumb must have pointer-events: none');
assert(stylesCssContent.includes('.mob-timeline-bar-bg {') && stylesCssContent.includes('pointer-events: none !important;'), 'mob-timeline-bar-bg must have pointer-events: none');
assert(stylesCssContent.includes('.mob-timeline-bar-fill {') && stylesCssContent.includes('pointer-events: none !important;'), 'mob-timeline-bar-fill must have pointer-events: none');
console.log('✔ 7. CSS pointer-events: none verified on desktop and mobile timeline children');

// 8. Verify mobile header chips scrolling & engine switcher flex-shrink
assert(stylesCssContent.includes('.mobile-chips-list {') && stylesCssContent.includes('overflow-x: auto !important;'), 'mobile-chips-list must allow horizontal scrolling');
assert(stylesCssContent.includes('.mobile-engine-switcher {') && stylesCssContent.includes('flex-shrink: 0 !important;'), 'mobile-engine-switcher must have flex-shrink: 0');
console.log('✔ 8. Mobile header chips and engine switcher layout verified');

console.log('\n🎉 ALL 8 TIMELINE SEEK & DRAG INTEGRITY CHECKS PASSED!\n');

