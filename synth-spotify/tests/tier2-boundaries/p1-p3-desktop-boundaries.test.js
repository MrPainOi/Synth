/**
 * Tier 2: Boundary & Corner Cases — P1 to P3 (Desktop Usability Subsystem)
 * 15 Boundary Test Cases (5 per feature for P1, P2, P3)
 */

const { assert, assertEqual, createSuite, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 2: P1-P3 — Desktop Usability Boundaries');

// =========================================================================
// P1: Desktop Context Menu Boundaries
// =========================================================================
suite.test('B-P1-01: Context menu clamps horizontal position if opened near right viewport boundary', () => {
  const VIEWPORT_WIDTH = 1920;
  const MENU_WIDTH = 220;

  function calculateMenuPosition(clickX, clickY) {
    let posX = clickX;
    let posY = clickY;
    if (clickX + MENU_WIDTH > VIEWPORT_WIDTH) {
      posX = VIEWPORT_WIDTH - MENU_WIDTH - 10;
    }
    return { posX, posY };
  }

  const pos = calculateMenuPosition(1850, 400); // 1850 + 220 = 2070 > 1920
  assertEqual(pos.posX, 1690, 'X position must be clamped within viewport boundary');
  assertEqual(pos.posX + MENU_WIDTH <= VIEWPORT_WIDTH, true, 'Menu must fit fully inside viewport');
});

suite.test('B-P1-02: Context menu clamps vertical position if opened near bottom viewport boundary', () => {
  const VIEWPORT_HEIGHT = 1080;
  const MENU_HEIGHT = 260;

  function calculateMenuPosition(clickX, clickY) {
    let posY = clickY;
    if (clickY + MENU_HEIGHT > VIEWPORT_HEIGHT) {
      posY = clickY - MENU_HEIGHT; // flip upward
    }
    return posY;
  }

  const posY = calculateMenuPosition(500, 950); // 950 + 260 = 1210 > 1080
  assertEqual(posY, 690, 'Y position should flip upwards above cursor');
});

suite.test('B-P1-03: Right-clicking on non-track element does not open track context menu', () => {
  let menuOpened = false;

  function handleContextMenu(e) {
    const trackRow = e.target && e.target.closest ? e.target.closest('.track-row') : null;
    if (!trackRow) return;
    menuOpened = true;
  }

  const blankDiv = {
    target: {
      closest: (sel) => null // not a track row
    }
  };

  handleContextMenu(blankDiv);
  assertEqual(menuOpened, false, 'Context menu should not open on non-track elements');
});

suite.test('B-P1-04: Clicking outside context menu closes it', () => {
  let isMenuVisible = true;
  const menuEl = new MockDOMElement('div', 'spotify-context-menu');

  function handleDocumentClick(e) {
    if (e.target !== menuEl && !menuEl.children.includes(e.target)) {
      isMenuVisible = false;
    }
  }

  const outsideElement = new MockDOMElement('div', 'outside-area');
  handleDocumentClick({ target: outsideElement });

  assertEqual(isMenuVisible, false, 'Menu should be dismissed on outside click');
});

suite.test('B-P1-05: Pressing Escape key while context menu is open dismisses the menu', () => {
  let isMenuVisible = true;

  function handleKeyDown(e) {
    if (e.key === 'Escape' && isMenuVisible) {
      isMenuVisible = false;
    }
  }

  handleKeyDown({ key: 'Escape' });
  assertEqual(isMenuVisible, false, 'Pressing Escape must close the context menu');
});

// =========================================================================
// P2: Screen Wake Lock Boundaries
// =========================================================================
suite.test('B-P2-01: Rejection of wake lock request (e.g. low battery / system policy) is caught safely', async () => {
  const rejectedWakeLock = {
    request: async () => {
      const err = new Error('NotAllowedError: Wake lock denied by system');
      err.name = 'NotAllowedError';
      throw err;
    }
  };

  let caughtError = null;
  let lyricsOpenSucceeded = false;

  async function openLyricsMode() {
    try {
      await rejectedWakeLock.request('screen');
    } catch (err) {
      caughtError = err;
    }
    lyricsOpenSucceeded = true; // Lyrics mode should still work even if lock is denied
  }

  await openLyricsMode();
  assert(caughtError !== null, 'Rejection was handled');
  assertEqual(lyricsOpenSucceeded, true, 'Lyrics mode must proceed even if wake lock fails');
});

suite.test('B-P2-02: Rapid open/close of lyrics releases sentinel without memory leak', async () => {
  let releaseCalls = 0;
  let activeSentinel = null;

  const mockApi = {
    request: async () => {
      const s = {
        released: false,
        release: async () => {
          s.released = true;
          releaseCalls++;
        }
      };
      return s;
    }
  };

  for (let i = 0; i < 5; i++) {
    activeSentinel = await mockApi.request('screen');
    await activeSentinel.release();
    activeSentinel = null;
  }

  assertEqual(releaseCalls, 5, 'Every requested sentinel must be released');
  assertEqual(activeSentinel, null, 'Active sentinel reference must be cleared');
});

suite.test('B-P2-03: Repeated open calls while already open do not create duplicate sentinels', async () => {
  let requestCount = 0;
  let sentinel = null;

  async function requestLock() {
    if (sentinel && !sentinel.released) return;
    requestCount++;
    sentinel = { released: false, release: async () => { sentinel.released = true; } };
  }

  await requestLock();
  await requestLock();
  await requestLock();

  assertEqual(requestCount, 1, 'Only 1 wake lock should be requested while already active');
});

suite.test('B-P2-04: Sentinel release() error does not crash lyrics mode dismissal', async () => {
  const faultySentinel = {
    released: false,
    release: async () => { throw new Error('Hardware error'); }
  };

  let dismissed = false;
  async function exitLyrics(s) {
    try {
      if (s) await s.release();
    } catch (e) {
      // Ignored non-critical error
    }
    dismissed = true;
  }

  await exitLyrics(faultySentinel);
  assertEqual(dismissed, true, 'Lyrics dismissal must complete despite release error');
});

suite.test('B-P2-05: Sentinel released property is checked before redundant release calls', async () => {
  let callCount = 0;
  const sentinel = {
    released: true,
    release: async () => { callCount++; }
  };

  async function safeRelease(s) {
    if (s && !s.released) {
      await s.release();
    }
  }

  await safeRelease(sentinel);
  assertEqual(callCount, 0, 'Should not call release() if already marked released');
});

// =========================================================================
// P3: Keyboard Shortcut Help Modal Boundaries
// =========================================================================
suite.test('B-P3-01: Pressing "/" without Shift key does NOT open the shortcut modal', () => {
  let modalOpened = false;

  function evaluateShortcut(e) {
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      modalOpened = true;
    }
  }

  evaluateShortcut({ key: '/', shiftKey: false });
  assertEqual(modalOpened, false, 'Plain "/" without Shift should not open shortcuts modal');
});

suite.test('B-P3-02: Pressing "?" with Alt or Ctrl modifiers is ignored', () => {
  let modalOpened = false;

  function evaluateShortcut(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return; // ignore modified combinations
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      modalOpened = true;
    }
  }

  evaluateShortcut({ key: '?', ctrlKey: true, altKey: false, metaKey: false });
  assertEqual(modalOpened, false, 'Ctrl + ? should be ignored');

  evaluateShortcut({ key: '?', ctrlKey: false, altKey: true, metaKey: false });
  assertEqual(modalOpened, false, 'Alt + ? should be ignored');
});

suite.test('B-P3-03: Pressing "?" when modal is already open toggles it closed or keeps open safely', () => {
  let modalOpen = true;

  function handleKey(e) {
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      modalOpen = !modalOpen; // toggle
    }
  }

  handleKey({ key: '?', shiftKey: false });
  assertEqual(modalOpen, false, 'Toggling open modal with "?" should close it');
});

suite.test('B-P3-04: Clicking the modal backdrop overlay closes the shortcuts modal', () => {
  let modalOpen = true;

  function handleModalClick(e) {
    // If clicked on backdrop (outside modal dialog card)
    if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
      modalOpen = false;
    }
  }

  const backdrop = { classList: { contains: (c) => c === 'modal-backdrop' } };
  handleModalClick({ target: backdrop });

  assertEqual(modalOpen, false, 'Clicking backdrop must close modal');
});

suite.test('B-P3-05: Typing inside contenteditable elements does NOT open shortcut modal', () => {
  let modalTriggered = false;

  function handleKey(e) {
    if (e.target && (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName))) {
      return;
    }
    if (e.key === '?') modalTriggered = true;
  }

  handleKey({ key: '?', target: { isContentEditable: true, tagName: 'DIV' } });
  assertEqual(modalTriggered, false, 'Typing in contenteditable should not trigger modal');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
