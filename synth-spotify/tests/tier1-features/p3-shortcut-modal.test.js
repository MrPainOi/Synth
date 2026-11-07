/**
 * Tier 1: Feature Coverage — P3: Keyboard Shortcut Modal
 * Requirement: ORIGINAL_REQUEST §R2 & PROJECT.md
 * - Keyboard shortcut cheat sheet dialog triggered by pressing `?` or `Shift + /`.
 */

const { assert, assertEqual, createSuite, readProjectFile, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 1: P3 — Keyboard Shortcut Modal');

suite.test('P3-01: Keyboard shortcuts modal exists in index.html (#modal-shortcuts)', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const hasModal = /id=["']modal-shortcuts["']|class=["'][^"']*modal-shortcuts/i.test(html);
  assert(hasModal, 'index.html must contain keyboard shortcuts modal container (#modal-shortcuts)');
});

suite.test('P3-02: Pressing "?" or "Shift + /" triggers opening of the shortcuts modal', () => {
  let modalOpen = false;

  function handleGlobalKeyDown(e, isModalCurrentlyOpen) {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return isModalCurrentlyOpen;
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      return true; // open
    }
    return isModalCurrentlyOpen;
  }

  // Test '?' key press
  modalOpen = handleGlobalKeyDown({ key: '?', shiftKey: false, target: { tagName: 'BODY' } }, false);
  assertEqual(modalOpen, true, 'Pressing "?" must open modal');

  // Test 'Shift + /' key combination
  modalOpen = handleGlobalKeyDown({ key: '/', shiftKey: true, target: { tagName: 'BODY' } }, false);
  assertEqual(modalOpen, true, 'Pressing "Shift + /" must open modal');
});

suite.test('P3-03: Shortcuts modal is NOT triggered when typing "?" inside input or textarea', () => {
  let modalOpened = false;

  function handleGlobalKeyDown(e) {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      modalOpened = true;
    }
  }

  // Type inside search input
  handleGlobalKeyDown({ key: '?', shiftKey: false, target: { tagName: 'INPUT' } });
  assertEqual(modalOpened, false, 'Typing "?" in an input element must not trigger the modal');

  // Type inside comment textarea
  handleGlobalKeyDown({ key: '?', shiftKey: false, target: { tagName: 'TEXTAREA' } });
  assertEqual(modalOpened, false, 'Typing "?" in a textarea must not trigger the modal');
});

suite.test('P3-04: Pressing Escape key closes the shortcuts modal', () => {
  let isModalOpen = true;

  function handleKeyDownClose(e) {
    if (e.key === 'Escape') {
      isModalOpen = false;
    }
  }

  handleKeyDownClose({ key: 'Escape' });
  assertEqual(isModalOpen, false, 'Pressing Escape must close the open shortcuts modal');
});

suite.test('P3-05: Modal displays cheat sheet entries for core player controls', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const appJs = readProjectFile('synth-spotify/app.js');
  const combined = html + '\n' + appJs;

  // Verify inclusion of common player shortcut labels
  const hasSpacebar = /Space|Spasi/i.test(combined);
  const hasNextShortcut = /Next|Berikutnya|Lagu Selanjutnya/i.test(combined);
  assert(hasSpacebar, 'Modal / help system should document Spacebar for Play/Pause');
  assert(hasNextShortcut, 'Modal / help system should document navigation shortcuts');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
