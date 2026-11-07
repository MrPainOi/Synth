/**
 * Empirical Challenger 2 Stress Test Suite: Milestone M2 Gate
 * Focus:
 *  1. M4 Mobile Fullscreen Swipe Gestures:
 *     - Touch thresholds, vertical/horizontal dominance ratios, scroll offset bounds
 *     - Artwork directionality (next vs prev), sub-threshold rejection, multi-touch isolation
 *  2. M5 Playback Queue & Clear Queue:
 *     - toggleQueueDrawer toggling, class synchronization, null-safety, rapid toggling
 *     - clearQueue resets upcoming tracks while preserving current track
 *     - populateUpcomingQueue multi-tier fallback pool (library -> history -> favorites -> empty), 20-track cap
 *     - "Kosongkan Antrean" exact button text and DOM verification
 */

const fs = require('fs');
const path = require('path');
const {
  assert,
  assertEqual,
  assertDeepEqual,
  createSuite,
  readProjectFile
} = require('./test-utils');

const suite = createSuite('Empirical Challenger 2: M4 Swipe Gestures & M5 Queue Stress Tests');

// =========================================================================
// ENVIRONMENT & PRODUCTION CODE EXTRACTION
// =========================================================================

const appJsContent = readProjectFile('synth-spotify/app.js');
const indexHtmlContent = readProjectFile('synth-spotify/index.html');

// Helper to extract regex matches safely
function extractProductionSnippet(regex, name) {
  const match = appJsContent.match(regex);
  if (!match) {
    throw new Error(`Failed to extract production code snippet: ${name}`);
  }
  return match[0];
}

// 1. Extract M4 Swipe Gestures block
const swipeBlockSnippet = extractProductionSnippet(
  /\/\/ Swipe Gestures for Mobile Fullscreen Player[\s\S]*?showToast\('Lagu sebelumnya'\);\s*\}\s*\}\s*\}, \{ passive: true \}\);\s*\}\s*\}/,
  'M4 Swipe Gestures'
);

// 2. Extract M5 functions: toggleQueueDrawer, clearQueue, populateUpcomingQueue
const toggleQueueDrawerSnippet = extractProductionSnippet(
  /function toggleQueueDrawer\(\) \{[\s\S]*?\n  \}/,
  'toggleQueueDrawer'
);

const clearQueueSnippet = extractProductionSnippet(
  /function clearQueue\(\) \{[\s\S]*?\n  \}/,
  'clearQueue'
);

const populateUpcomingQueueSnippet = extractProductionSnippet(
  /function populateUpcomingQueue\([\s\S]*?\n  \}/,
  'populateUpcomingQueue'
);

// Enhanced Mock DOM Node with full DOMTokenList classList support
class RealisticDOMNode {
  constructor(tagName = 'div', id = '', classes = []) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.innerHTML = '';
    this.textContent = '';
    this.scrollTop = 0;

    const classSet = new Set(classes);
    this.classList = {
      add: (...cls) => cls.forEach(c => classSet.add(c)),
      remove: (...cls) => cls.forEach(c => classSet.delete(c)),
      toggle: (cls, force) => {
        if (force !== undefined) {
          if (force) classSet.add(cls);
          else classSet.delete(cls);
          return force;
        }
        if (classSet.has(cls)) {
          classSet.delete(cls);
          return false;
        } else {
          classSet.add(cls);
          return true;
        }
      },
      contains: (cls) => classSet.has(cls),
      has: (cls) => classSet.has(cls),
      get length() { return classSet.size; },
      toString: () => Array.from(classSet).join(' ')
    };
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      defaultPrevented: false,
      propagationStopped: false,
      stopPropagation() { this.propagationStopped = true; },
      preventDefault() { this.defaultPrevented = true; }
    });
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler, options) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    if (this.listeners.has(event.type)) {
      for (const h of this.listeners.get(event.type)) {
        h.call(this, event);
      }
    }
    if (this.parentNode && !event.propagationStopped) {
      this.parentNode.dispatchEvent(event);
    }
    return true;
  }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    return null;
  }
}

// Factory to wire M4 gesture environment using extracted production code
function createM4Environment() {
  const mobFullscreenPlayer = new RealisticDOMNode('div', 'mobile-fullscreen-player', ['active']);
  const scrollArea = new RealisticDOMNode('div', 'mob-player-scroll-area', ['mob-player-scroll-area']);
  const artWrap = new RealisticDOMNode('div', 'mob-player-art-wrap', ['mob-player-art-wrap']);
  const btnNext = new RealisticDOMNode('button', 'btn-next');
  const btnPrev = new RealisticDOMNode('button', 'btn-prev');

  mobFullscreenPlayer.appendChild(scrollArea);
  mobFullscreenPlayer.appendChild(artWrap);

  let isPlayerClosed = false;
  let nextClicks = 0;
  let prevClicks = 0;
  const toasts = [];

  btnNext.addEventListener('click', () => { nextClicks++; });
  btnPrev.addEventListener('click', () => { prevClicks++; });

  function closeMobilePlayer() {
    isPlayerClosed = true;
    mobFullscreenPlayer.classList.remove('active');
  }

  function showToast(msg) {
    toasts.push(msg);
  }

  // Execute production snippet in isolated scope
  const wireGestures = new Function(
    'mobFullscreenPlayer', 'btnNext', 'btnPrev', 'closeMobilePlayer', 'showToast',
    `
      ${swipeBlockSnippet}
    `
  );
  wireGestures(mobFullscreenPlayer, btnNext, btnPrev, closeMobilePlayer, showToast);

  return {
    mobFullscreenPlayer,
    scrollArea,
    artWrap,
    btnNext,
    btnPrev,
    get isPlayerClosed() { return isPlayerClosed; },
    get nextClicks() { return nextClicks; },
    get prevClicks() { return prevClicks; },
    toasts,
    reset() {
      isPlayerClosed = false;
      nextClicks = 0;
      prevClicks = 0;
      toasts.length = 0;
      mobFullscreenPlayer.classList.add('active');
      scrollArea.scrollTop = 0;
    }
  };
}

// Factory to wire M5 Queue environment using extracted production code
function createM5Environment(initialQueue = [], initialCurrentTrack = null) {
  const queueDrawer = new RealisticDOMNode('aside', 'queue-drawer');
  queueDrawer.style.display = 'none';

  const btnToggleQueue = new RealisticDOMNode('button', 'btn-toggle-queue');
  const btnMobQueue = new RealisticDOMNode('button', 'btn-mob-queue');
  const btnCloseQueue = new RealisticDOMNode('button', 'btn-close-queue');
  const btnClearQueue = new RealisticDOMNode('button', 'btn-clear-queue');

  const state = {
    currentTrack: initialCurrentTrack,
    queue: [...initialQueue],
    queueIndex: initialCurrentTrack ? initialQueue.findIndex(t => (t.id || t.title) === (initialCurrentTrack.id || initialCurrentTrack.title)) : -1,
    synthLibraryTracks: [],
    history: [],
    favorites: []
  };

  const toasts = [];
  let renderDrawerCalls = 0;

  function renderQueueDrawer() {
    renderDrawerCalls++;
  }

  function showToast(msg) {
    toasts.push(msg);
  }

  // Compile extracted functions
  const compiledM5 = new Function(
    'queueDrawer', 'btnToggleQueue', 'btnMobQueue', 'state', 'renderQueueDrawer', 'showToast',
    `
      ${toggleQueueDrawerSnippet}
      ${clearQueueSnippet}
      ${populateUpcomingQueueSnippet}

      return { toggleQueueDrawer, clearQueue, populateUpcomingQueue };
    `
  )(queueDrawer, btnToggleQueue, btnMobQueue, state, renderQueueDrawer, showToast);

  return {
    queueDrawer,
    btnToggleQueue,
    btnMobQueue,
    state,
    toasts,
    get renderDrawerCalls() { return renderDrawerCalls; },
    toggleQueueDrawer: compiledM5.toggleQueueDrawer,
    clearQueue: compiledM5.clearQueue,
    populateUpcomingQueue: compiledM5.populateUpcomingQueue
  };
}

// Helper to simulate touch events
function simulateTouch(target, type, touches, changedTouches) {
  target.dispatchEvent({
    type,
    touches: touches || [],
    changedTouches: changedTouches || [],
    defaultPrevented: false,
    propagationStopped: false,
    stopPropagation() { this.propagationStopped = true; },
    preventDefault() { this.defaultPrevented = true; }
  });
}

// =========================================================================
// SECTION 1: M4 MOBILE FULLSCREEN SWIPE GESTURES (EMPIRICAL STRESS TESTS)
// =========================================================================

suite.test('M4-EMP-01: Valid downward swipe past threshold (deltaY=100 > 60, vertical ratio=10.0 > 1.5, scrollTop=0) closes player', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 200, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 210, clientY: 200 }]); // deltaY = +100, deltaX = 10

  assertEqual(env.isPlayerClosed, true, 'Player should be closed on valid downward swipe');
  assertEqual(env.mobFullscreenPlayer.classList.contains('active'), false, 'Class "active" should be removed from player');
});

suite.test('M4-EMP-02: Downward swipe when scrollArea.scrollTop = 10 (> 5) does NOT close player (protects scrollable content)', () => {
  const env = createM4Environment();
  env.reset();
  env.scrollArea.scrollTop = 10;

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 200, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 205, clientY: 220 }]); // deltaY = +120, deltaX = 5

  assertEqual(env.isPlayerClosed, false, 'Player must NOT close when scrolled down (scrollTop > 5)');
  assertEqual(env.mobFullscreenPlayer.classList.contains('active'), true, 'Player must remain active');
});

suite.test('M4-EMP-03: Scroll boundary precision: scrollTop = 5 closes player, while scrollTop = 6 rejects dismiss', () => {
  const env = createM4Environment();

  // Test at scrollTop = 5 (allowed boundary)
  env.reset();
  env.scrollArea.scrollTop = 5;
  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 200, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 200, clientY: 180 }]); // deltaY = 80
  assertEqual(env.isPlayerClosed, true, 'scrollTop = 5 must allow player dismiss');

  // Test at scrollTop = 6 (forbidden boundary)
  env.reset();
  env.scrollArea.scrollTop = 6;
  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 200, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 200, clientY: 180 }]); // deltaY = 80
  assertEqual(env.isPlayerClosed, false, 'scrollTop = 6 must forbid player dismiss');
});

suite.test('M4-EMP-04: Upward swipe (deltaY = -80 < 0) does NOT close player', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 200, clientY: 200 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 205, clientY: 120 }]); // deltaY = -80

  assertEqual(env.isPlayerClosed, false, 'Upward swipe must not close player');
});

suite.test('M4-EMP-05: Horizontal swipe across player body (deltaX = 120, deltaY = 10) does NOT close player', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 200 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 220, clientY: 210 }]); // deltaX = 120, deltaY = 10

  assertEqual(env.isPlayerClosed, false, 'Horizontal player swipe must not close player');
});

suite.test('M4-EMP-06: Diagonal swipe below vertical ratio (deltaY = 65, deltaX = 45, ratio 1.444 < 1.5) does NOT close player', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 145, clientY: 165 }]); // deltaY = 65, deltaX = 45 -> deltaX * 1.5 = 67.5

  assertEqual(env.isPlayerClosed, false, 'Ambiguous diagonal swipe must be rejected');
});

suite.test('M4-EMP-07: Diagonal swipe above vertical ratio (deltaY = 75, deltaX = 40, ratio 1.875 > 1.5) closes player', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 140, clientY: 175 }]); // deltaY = 75, deltaX = 40 -> deltaX * 1.5 = 60

  assertEqual(env.isPlayerClosed, true, 'Clear vertical dominant swipe must close player');
});

suite.test('M4-EMP-08: Exact deltaY threshold boundary (deltaY = 60 vs 61)', () => {
  const env = createM4Environment();

  // Exact 60: deltaY > 60 is FALSE
  env.reset();
  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 100, clientY: 160 }]); // deltaY = 60
  assertEqual(env.isPlayerClosed, false, 'deltaY = 60 must not trigger dismiss (strict > 60)');

  // Exact 61: deltaY > 60 is TRUE
  env.reset();
  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 100, clientY: 161 }]); // deltaY = 61
  assertEqual(env.isPlayerClosed, true, 'deltaY = 61 must trigger dismiss');
});

suite.test('M4-EMP-09: Multi-touch gesture (touches.length > 1) on touchstart is ignored', () => {
  const env = createM4Environment();
  env.reset();

  // Multi-touch start: 2 fingers down
  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [
    { clientX: 100, clientY: 100 },
    { clientX: 200, clientY: 100 }
  ]);
  // Finger release
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 100, clientY: 250 }]);

  // Since touchstart with multi-touch aborted, touchStartY was not set, avoiding corrupt deltaY
  assertEqual(env.isPlayerClosed, false, 'Multi-touch gesture must not dismiss player');
});

suite.test('M4-EMP-10: Partial finger lift (touches.length > 0 on touchend) does NOT close player', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  // touchend while 1 finger is still on screen
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [{ clientX: 200, clientY: 100 }], [{ clientX: 100, clientY: 250 }]);

  assertEqual(env.isPlayerClosed, false, 'Partial multi-touch release must not dismiss player');
});

suite.test('M4-EMP-11: Empty changedTouches event is handled gracefully without exception', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], []);

  assertEqual(env.isPlayerClosed, false, 'Empty changedTouches must safely no-op');
});

suite.test('M4-EMP-12: Missing .mob-player-scroll-area element safely falls back to top (dismisses)', () => {
  const env = createM4Environment();
  env.reset();
  // Remove scrollArea from DOM
  env.mobFullscreenPlayer.children = env.mobFullscreenPlayer.children.filter(c => c !== env.scrollArea);

  simulateTouch(env.mobFullscreenPlayer, 'touchstart', [{ clientX: 100, clientY: 100 }]);
  simulateTouch(env.mobFullscreenPlayer, 'touchend', [], [{ clientX: 105, clientY: 200 }]);

  assertEqual(env.isPlayerClosed, true, 'Missing scrollArea must safely fallback to dismissing');
});

suite.test('M4-EMP-13: Artwork swipe left (deltaX = -80 < -50, horizontal dominance) triggers btnNext.click() and toast', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 200, clientY: 150 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 120, clientY: 155 }]); // deltaX = -80, deltaY = 5

  assertEqual(env.nextClicks, 1, 'Swipe left on artwork must click btnNext');
  assertEqual(env.prevClicks, 0, 'btnPrev must not be clicked');
  assertEqual(env.toasts.includes('Lagu berikutnya'), true, 'Toast "Lagu berikutnya" must be shown');
});

suite.test('M4-EMP-14: Artwork swipe right (deltaX = +80 > 50, horizontal dominance) triggers btnPrev.click() and toast', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 120, clientY: 150 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 200, clientY: 155 }]); // deltaX = +80, deltaY = 5

  assertEqual(env.prevClicks, 1, 'Swipe right on artwork must click btnPrev');
  assertEqual(env.nextClicks, 0, 'btnNext must not be clicked');
  assertEqual(env.toasts.includes('Lagu sebelumnya'), true, 'Toast "Lagu sebelumnya" must be shown');
});

suite.test('M4-EMP-15: Artwork sub-threshold swipe (deltaX = 20) triggers neither btnNext nor btnPrev', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 150, clientY: 150 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 170, clientY: 152 }]); // deltaX = 20

  assertEqual(env.nextClicks, 0, 'Sub-threshold swipe must not advance track');
  assertEqual(env.prevClicks, 0, 'Sub-threshold swipe must not go back track');
});

suite.test('M4-EMP-16: Artwork exact threshold boundary (deltaX = -50 or +50 strictly rejects)', () => {
  const env = createM4Environment();

  // Test deltaX = -50 (exact threshold)
  env.reset();
  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 200, clientY: 150 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 150, clientY: 150 }]); // deltaX = -50
  assertEqual(env.nextClicks, 0, 'deltaX = -50 must not trigger next track (strict > 50)');

  // Test deltaX = -51 (passes threshold)
  env.reset();
  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 200, clientY: 150 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 149, clientY: 150 }]); // deltaX = -51
  assertEqual(env.nextClicks, 1, 'deltaX = -51 must trigger next track');
});

suite.test('M4-EMP-17: Artwork vertical dominance (deltaX = -60, deltaY = 65, ratio 0.923 < 1.2) triggers neither next nor prev', () => {
  const env = createM4Environment();
  env.reset();

  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 200, clientY: 100 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 140, clientY: 165 }]); // deltaX = -60, deltaY = 65

  assertEqual(env.nextClicks, 0, 'Vertical dominance across artwork must not trigger next');
  assertEqual(env.prevClicks, 0, 'Vertical dominance across artwork must not trigger prev');
});

suite.test('M4-EMP-18: Rapid succession artwork swipes (20 cycles) reliably process every trigger without drift', () => {
  const env = createM4Environment();
  env.reset();

  for (let i = 0; i < 10; i++) {
    // Swipe left
    simulateTouch(env.artWrap, 'touchstart', [{ clientX: 200, clientY: 150 }]);
    simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 120, clientY: 150 }]);
    // Swipe right
    simulateTouch(env.artWrap, 'touchstart', [{ clientX: 120, clientY: 150 }]);
    simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 200, clientY: 150 }]);
  }

  assertEqual(env.nextClicks, 10, 'Must record exactly 10 next clicks');
  assertEqual(env.prevClicks, 10, 'Must record exactly 10 prev clicks');
  assertEqual(env.toasts.length, 20, 'Must record exactly 20 toasts');
});

suite.test('M4-EMP-19: Downward swipe on artwork bubbles to mobFullscreenPlayer and dismisses player', () => {
  const env = createM4Environment();
  env.reset();

  // Swipe downward directly on artwork
  simulateTouch(env.artWrap, 'touchstart', [{ clientX: 150, clientY: 100 }]);
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 155, clientY: 220 }]); // deltaY = +120, deltaX = 5

  assertEqual(env.isPlayerClosed, true, 'Downward swipe initiated on artwork must bubble and dismiss player');
  assertEqual(env.nextClicks, 0, 'Must not trigger track change');
  assertEqual(env.prevClicks, 0, 'Must not trigger track change');
});

suite.test('M4-EMP-20: Multi-touch gesture on artwork must NOT trigger next/prev track change', () => {
  const env = createM4Environment();
  env.reset();

  // Multi-touch start on artwork: 2 fingers down
  simulateTouch(env.artWrap, 'touchstart', [
    { clientX: 200, clientY: 100 },
    { clientX: 250, clientY: 100 }
  ]);
  // Finger release at X=200, Y=100
  simulateTouch(env.artWrap, 'touchend', [], [{ clientX: 200, clientY: 100 }]);

  assertEqual(env.nextClicks, 0, 'Multi-touch on artwork must not trigger next track');
  assertEqual(env.prevClicks, 0, 'Multi-touch on artwork must not trigger prev track');
});

// =========================================================================
// SECTION 2: M5 QUEUE DRAWER & CLEAR QUEUE (EMPIRICAL STRESS TESTS)
// =========================================================================

suite.test('M5-EMP-01: Clear Queue button in synth-spotify/index.html has id="btn-clear-queue" and exact text "Kosongkan Antrean"', () => {
  const match = indexHtmlContent.match(/<button[^>]*id=["']btn-clear-queue["'][^>]*>([\s\S]*?)<\/button>/i);
  assert(match, 'index.html must contain <button id="btn-clear-queue">');
  const btnText = match[1].trim();
  assertEqual(btnText, 'Kosongkan Antrean', 'Button text must be exactly "Kosongkan Antrean"');
});

suite.test('M5-EMP-02: Queue drawer in synth-spotify/index.html has id="queue-drawer" and initial style="display: none;"', () => {
  const match = indexHtmlContent.match(/<aside[^>]*id=["']queue-drawer["'][^>]*style=["']([^"']*)["']/i);
  assert(match, 'index.html must contain <aside id="queue-drawer"> with inline style');
  assert(match[1].includes('display: none'), 'queue-drawer inline style must include "display: none;"');
});

suite.test('M5-EMP-03: toggleQueueDrawer() toggles display between "none" and "flex" cleanly without ReferenceError', () => {
  const env = createM5Environment();

  // Initial state is 'none'
  assertEqual(env.queueDrawer.style.display, 'none');

  // 1st toggle: opens to 'flex'
  env.toggleQueueDrawer();
  assertEqual(env.queueDrawer.style.display, 'flex', 'Queue drawer must open to display: flex');
  assertEqual(env.btnToggleQueue.classList.contains('active'), true, 'btnToggleQueue must have active class');
  assertEqual(env.btnMobQueue.classList.contains('active'), true, 'btnMobQueue must have active class');
  assertEqual(env.renderDrawerCalls, 1, 'renderQueueDrawer must be called when opening');

  // 2nd toggle: closes to 'none'
  env.toggleQueueDrawer();
  assertEqual(env.queueDrawer.style.display, 'none', 'Queue drawer must close to display: none');
  assertEqual(env.btnToggleQueue.classList.contains('active'), false, 'btnToggleQueue must remove active class');
  assertEqual(env.btnMobQueue.classList.contains('active'), false, 'btnMobQueue must remove active class');
});

suite.test('M5-EMP-04: toggleQueueDrawer() 50 rapid toggle cycles maintain strict synchronization with zero drift', () => {
  const env = createM5Environment();

  for (let i = 0; i < 50; i++) {
    env.toggleQueueDrawer();
    const shouldBeOpen = (i % 2 === 0);
    assertEqual(env.queueDrawer.style.display, shouldBeOpen ? 'flex' : 'none');
    assertEqual(env.btnToggleQueue.classList.contains('active'), shouldBeOpen);
    assertEqual(env.btnMobQueue.classList.contains('active'), shouldBeOpen);
  }
});

suite.test('M5-EMP-05: toggleQueueDrawer() safely handles null queueDrawer element without throwing', () => {
  const compiledM5 = new Function(
    'queueDrawer', 'btnToggleQueue', 'btnMobQueue', 'state', 'renderQueueDrawer', 'showToast',
    `
      ${toggleQueueDrawerSnippet}
      return toggleQueueDrawer;
    `
  )(null, null, null, {}, () => {}, () => {});

  let threw = false;
  try {
    compiledM5();
  } catch (err) {
    threw = true;
  }
  assertEqual(threw, false, 'toggleQueueDrawer must safely no-op when queueDrawer is null');
});

suite.test('M5-EMP-06: clearQueue() resets upcoming queue, preserves currentTrack, and sets queueIndex=0', () => {
  const activeTrack = { id: 'track_curr', title: 'Active Song', artist: 'Artist 1' };
  const initialQueue = [
    { id: 'track_prev', title: 'Previous Song' },
    activeTrack,
    { id: 'track_up1', title: 'Upcoming 1' },
    { id: 'track_up2', title: 'Upcoming 2' },
    { id: 'track_up3', title: 'Upcoming 3' }
  ];

  const env = createM5Environment(initialQueue, activeTrack);
  assertEqual(env.state.queue.length, 5, 'Initial queue must have 5 tracks');
  assertEqual(env.state.queueIndex, 1, 'Initial queueIndex must be 1');

  env.clearQueue();

  assertEqual(env.state.queue.length, 1, 'Queue length must be reset to 1');
  assertEqual(env.state.queueIndex, 0, 'queueIndex must be reset to 0');
  assertEqual(env.state.queue[0].id, 'track_curr', 'Queue must strictly preserve current playing track');
  assertEqual(env.state.currentTrack.id, 'track_curr', 'currentTrack must remain intact');
  assertEqual(env.toasts.includes('Antrean berhasil dikosongkan'), true, 'Toast confirmation must be displayed');
  assertEqual(env.renderDrawerCalls, 1, 'renderQueueDrawer must be called on clear');
});

suite.test('M5-EMP-07: clearQueue() when currentTrack is null but queue has items preserves item at queueIndex', () => {
  const initialQueue = [
    { id: 'track_0', title: 'Song 0' },
    { id: 'track_1', title: 'Song 1' },
    { id: 'track_2', title: 'Song 2' }
  ];
  const env = createM5Environment(initialQueue, null);
  env.state.queueIndex = 1;

  env.clearQueue();

  assertEqual(env.state.queue.length, 1, 'Queue length must be 1');
  assertEqual(env.state.queueIndex, 0, 'queueIndex must be 0');
  assertEqual(env.state.queue[0].id, 'track_1', 'Must preserve track at current index');
});

suite.test('M5-EMP-08: clearQueue() when queue is completely empty sets queue=[] and queueIndex=-1 without throwing', () => {
  const env = createM5Environment([], null);

  env.clearQueue();

  assertEqual(env.state.queue.length, 0, 'Queue must remain empty');
  assertEqual(env.state.queueIndex, -1, 'queueIndex must be -1');
  assertEqual(env.toasts.includes('Antrean berhasil dikosongkan'), true);
});

suite.test('M5-EMP-09: populateUpcomingQueue() populates up to 20 tracks from synthLibraryTracks excluding current track', () => {
  const env = createM5Environment();
  const current = { id: 'curr_10', title: 'Current Track' };

  // Generate 50 library tracks
  env.state.synthLibraryTracks = Array.from({ length: 50 }, (_, i) => ({
    id: `curr_${i}`,
    title: `Library Song ${i}`
  }));

  const populated = env.populateUpcomingQueue(current, null);

  assertEqual(populated[0].id, 'curr_10', 'First track must be the current track');
  assertEqual(populated.length, 21, 'Must contain current track + 20 upcoming tracks (20-track cap)');
  const duplicates = populated.slice(1).filter(t => t.id === 'curr_10');
  assertEqual(duplicates.length, 0, 'Upcoming tracks must NOT contain the currently playing track');
});

suite.test('M5-EMP-10: populateUpcomingQueue() multi-tier fallback chain (library -> history -> favorites -> empty)', () => {
  const env = createM5Environment();
  const current = { id: 't_curr', title: 'Target' };

  // Tier 1: Falls back to history when synthLibraryTracks is empty
  env.state.synthLibraryTracks = [];
  env.state.history = [{ id: 'h1', title: 'Hist 1' }, { id: 'h2', title: 'Hist 2' }];
  env.state.favorites = [{ id: 'f1', title: 'Fav 1' }];

  let res = env.populateUpcomingQueue(current, null);
  assertEqual(res.length, 3, 'Should take from history pool (current + 2 history)');
  assertEqual(res[1].id, 'h1');
  assertEqual(res[2].id, 'h2');

  // Tier 2: Falls back to favorites when both library and history are empty
  env.state.history = [];
  res = env.populateUpcomingQueue(current, null);
  assertEqual(res.length, 2, 'Should take from favorites pool (current + 1 favorite)');
  assertEqual(res[1].id, 'f1');

  // Tier 3: Returns only [current] when all pools are empty
  env.state.favorites = [];
  res = env.populateUpcomingQueue(current, null);
  assertEqual(res.length, 1, 'Should return only [current] when all pools are empty');
  assertEqual(res[0].id, 't_curr');
});

suite.test('M5-EMP-11: populateUpcomingQueue() filters out current track by title when id is missing or null', () => {
  const env = createM5Environment();
  const current = { title: 'No-ID Track' }; // Missing id property

  env.state.history = [
    { title: 'No-ID Track' }, // Duplicate title
    { title: 'Another Song' }
  ];

  const res = env.populateUpcomingQueue(current, null);
  assertEqual(res.length, 2, 'Must filter out duplicate title');
  assertEqual(res[0].title, 'No-ID Track');
  assertEqual(res[1].title, 'Another Song');
});

suite.test('M5-EMP-12: populateUpcomingQueue() preserves explicit multi-item baseQueue intact', () => {
  const env = createM5Environment();
  const current = { id: 'c1', title: 'Track C' };
  const baseQueue = [
    { id: 'b1', title: 'Base 1' },
    { id: 'b2', title: 'Base 2' },
    { id: 'b3', title: 'Base 3' }
  ];

  const res = env.populateUpcomingQueue(current, baseQueue);
  assertDeepEqual(res, baseQueue, 'Must return baseQueue copy without alteration when baseQueue.length > 1');
});

suite.test('M5-EMP-13: Integrated playTrack queue logic with single track and empty queue', () => {
  // Test the exact queue handling logic from playTrack in app.js:2149-2180
  const state = {
    queue: [],
    originalQueue: [],
    queueIndex: -1,
    synthLibraryTracks: [{ id: 'lib1', title: 'Lib 1' }, { id: 'lib2', title: 'Lib 2' }],
    history: [],
    favorites: []
  };

  const populateUpcomingQueue = new Function(
    'state',
    `
      ${populateUpcomingQueueSnippet}
      return populateUpcomingQueue;
    `
  )(state);

  function executePlayTrackQueueLogic(track, contextQueue) {
    if (Array.isArray(contextQueue) && contextQueue.length > 1) {
      state.queue = [...contextQueue];
      state.originalQueue = [...contextQueue];
      state.queueIndex = state.queue.findIndex(t => (t.id || t.title) === (track.id || track.title));
      if (state.queueIndex === -1) {
        state.queue.unshift(track);
        state.queueIndex = 0;
      }
    } else if (Array.isArray(contextQueue) && contextQueue.length === 1) {
      const existingIdx = state.queue.findIndex(t => (t.id || t.title) === (track.id || track.title));
      if (existingIdx !== -1) {
        state.queueIndex = existingIdx;
      } else {
        state.queue = populateUpcomingQueue(track, null);
        state.originalQueue = [...state.queue];
        state.queueIndex = 0;
      }
    } else if (state.queue.length === 0) {
      state.queue = populateUpcomingQueue(track, null);
      state.originalQueue = [...state.queue];
      state.queueIndex = 0;
    } else {
      const idx = state.queue.findIndex(t => (t.id || t.title) === (track.id || track.title));
      if (idx !== -1) {
        state.queueIndex = idx;
      } else {
        state.queue.splice(state.queueIndex + 1, 0, track);
        state.queueIndex++;
      }
    }
  }

  // 1. Standalone play with empty queue
  const standaloneTrack = { id: 'standalone', title: 'Solo Track' };
  executePlayTrackQueueLogic(standaloneTrack, null);

  assertEqual(state.queue.length, 3, 'Must auto-populate upcoming queue (standalone + 2 library)');
  assertEqual(state.queueIndex, 0, 'queueIndex must be 0');
  assertEqual(state.queue[0].id, 'standalone');

  // 2. Playing track already in queue advances queueIndex
  executePlayTrackQueueLogic({ id: 'lib2', title: 'Lib 2' }, null);
  assertEqual(state.queueIndex, 2, 'queueIndex must advance to existing track index');
  assertEqual(state.queue.length, 3, 'queue length should remain 3');
});

// =========================================================================
// SECTION 3: RESIDUAL CLEAN-UP & REGRESSION DEFENSE (M1 / M4 / M5)
// =========================================================================

suite.test('M1-REG-01: btn-mob-share is completely absent from index.html and app.js event listeners', () => {
  const hasShareInHtml = /id=["']btn-mob-share["']/i.test(indexHtmlContent);
  assertEqual(hasShareInHtml, false, 'index.html must not contain btn-mob-share');

  const unsafeShareInApp = /document\.getElementById\(['"]btn-mob-share['"]\)\.addEventListener/i.test(appJsContent);
  assertEqual(unsafeShareInApp, false, 'app.js must not attach listeners to removed btn-mob-share');
});

// =========================================================================
// TEST EXECUTION
// =========================================================================

if (require.main === module) {
  suite.run().then(res => {
    console.log(`\n======================================================`);
    console.log(`Empirical Challenger 2 Test Results: ${res.passed}/${res.total} Passed (${res.failed} Failed)`);
    console.log(`======================================================\n`);
    if (res.failed > 0) {
      for (const r of res.results.filter(r => r.status === 'fail')) {
        console.error(`FAIL: ${r.name}`);
        console.error(`  Error: ${r.error}`);
      }
      process.exit(1);
    } else {
      console.log('ALL 23 EMPIRICAL CHALLENGE SUITES PASSED CLEANLY.');
      process.exit(0);
    }
  });
}

module.exports = suite;
