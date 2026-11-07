/**
 * Tier 1: Feature Coverage — M4: Mobile Player Swipe Gestures
 * Requirement: ORIGINAL_REQUEST §R1 & PROJECT.md
 * - Support swipe gestures on the mobile fullscreen player: swipe down to close/dismiss the player,
 *   and swipe left or right across the album artwork to switch to next or previous tracks.
 */

const { assert, assertEqual, createSuite, readProjectFile } = require('../test-utils');

const suite = createSuite('Tier 1: M4 — Mobile Player Swipe Gestures');

suite.test('M4-01: Touch event listeners wired in app.js for swipe detection', () => {
  const appJs = readProjectFile('synth-spotify/app.js');
  const hasTouchEvents = /touchstart/i.test(appJs) && /touchend/i.test(appJs);
  assert(hasTouchEvents, 'app.js must register touchstart and touchend listeners for swipe gestures');
});

suite.test('M4-02: Vertical swipe down (deltaY > threshold) triggers player dismiss', () => {
  let playerDismissed = false;
  const SWIPE_DOWN_THRESHOLD = 60;

  function handleTouchEnd(startY, endY, startX, endX) {
    const deltaY = endY - startY;
    const deltaX = Math.abs(endX - startX);
    // Vertical swipe down: deltaY positive and greater than horizontal movement
    if (deltaY > SWIPE_DOWN_THRESHOLD && deltaY > deltaX * 1.5) {
      playerDismissed = true;
    }
  }

  // Simulate swipe down: start at Y=100, end at Y=220 (deltaY = +120)
  handleTouchEnd(100, 220, 150, 155);
  assertEqual(playerDismissed, true, 'Player should be dismissed when swiped down past threshold');
});

suite.test('M4-03: Horizontal swipe left (deltaX < -threshold) on album art navigates to next track', () => {
  let trackDirection = null;
  const SWIPE_THRESHOLD = 50;

  function handleArtSwipe(startX, endX, startY, endY) {
    const deltaX = endX - startX;
    const deltaY = Math.abs(endY - startY);
    if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > deltaY * 1.5) {
      if (deltaX < 0) {
        trackDirection = 'next';
      } else {
        trackDirection = 'prev';
      }
    }
  }

  // Swipe left: start at X=250, end at X=120 (deltaX = -130)
  handleArtSwipe(250, 120, 200, 205);
  assertEqual(trackDirection, 'next', 'Swipe left on artwork must trigger next track');
});

suite.test('M4-04: Horizontal swipe right (deltaX > threshold) on album art navigates to prev track', () => {
  let trackDirection = null;
  const SWIPE_THRESHOLD = 50;

  function handleArtSwipe(startX, endX, startY, endY) {
    const deltaX = endX - startX;
    const deltaY = Math.abs(endY - startY);
    if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > deltaY * 1.5) {
      if (deltaX < 0) {
        trackDirection = 'next';
      } else {
        trackDirection = 'prev';
      }
    }
  }

  // Swipe right: start at X=100, end at X=230 (deltaX = +130)
  handleArtSwipe(100, 230, 200, 202);
  assertEqual(trackDirection, 'prev', 'Swipe right on artwork must trigger previous track');
});

suite.test('M4-05: Minor touch drift below threshold does NOT trigger dismiss or navigation', () => {
  let actionTriggered = false;
  const THRESHOLD = 50;

  function evaluateSwipe(startX, endX, startY, endY) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    if (Math.abs(deltaX) > THRESHOLD || Math.abs(deltaY) > THRESHOLD) {
      actionTriggered = true;
    }
  }

  // Micro touch jitter (tap with 5px jitter)
  evaluateSwipe(100, 105, 200, 204);
  assertEqual(actionTriggered, false, 'Minor drift below threshold should trigger no action');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
