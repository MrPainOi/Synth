/**
 * Tier 1: Feature Coverage — M1: Fullscreen Mobile Share Removal
 * Requirement: ORIGINAL_REQUEST §R1 & PROJECT.md
 * - Remove the share button (`btn-mob-share`) from the fullscreen mobile player in `synth-spotify/index.html`.
 */

const { assert, assertEqual, createSuite, readProjectFile } = require('../test-utils');

const suite = createSuite('Tier 1: M1 — Mobile Share Removal');

suite.test('M1-01: btn-mob-share element must NOT exist in synth-spotify/index.html', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const hasShareButton = /id=["']btn-mob-share["']/i.test(html);
  assertEqual(hasShareButton, false, 'btn-mob-share must be completely removed from index.html');
});

suite.test('M1-02: #mobile-fullscreen-player retains essential action buttons (connect & queue)', () => {
  const html = readProjectFile('synth-spotify/index.html');
  assert(html.includes('id="mobile-fullscreen-player"'), '#mobile-fullscreen-player must be present in index.html');
  assert(html.includes('id="btn-mob-connect"'), '#btn-mob-connect must remain present in mobile bottom actions');
  assert(html.includes('id="btn-mob-queue"'), '#btn-mob-queue must remain present in mobile bottom actions');
});

suite.test('M1-03: app.js safely handles missing btn-mob-share without throwing ReferenceError', () => {
  const appJs = readProjectFile('synth-spotify/app.js');
  // Check that any reference to btn-mob-share checks for existence or uses optional chaining
  const unsafeAccess = /document\.getElementById\(['"]btn-mob-share['"]\)\.(addEventListener|onclick)/i.test(appJs);
  assertEqual(unsafeAccess, false, 'app.js must not perform unsafe direct access on removed btn-mob-share');
});

suite.test('M1-04: Mobile action bar DOM structure maintains valid layout hierarchy', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const match = html.match(/<div class="mob-player-bottom-actions">([\s\S]*?)<\/div>\s*<!--/);
  assert(match, 'mob-player-bottom-actions container must exist');
  const actionsContent = match[1];
  assert(!actionsContent.includes('btn-mob-share'), 'mob-player-bottom-actions must not contain btn-mob-share');
  assert(actionsContent.includes('mob-action-tool-btn'), 'mob-player-bottom-actions must contain action buttons');
});

suite.test('M1-05: Mobile player view has no orphaned "Bagikan Lagu" title or tooltip', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const mobPlayerIndex = html.indexOf('id="mobile-fullscreen-player"');
  assert(mobPlayerIndex !== -1, 'Mobile fullscreen player must exist');
  const mobPlayerSection = html.slice(mobPlayerIndex, html.indexOf('<!-- End Mobile Fullscreen Player -->') !== -1 ? html.indexOf('<!-- End Mobile Fullscreen Player -->') : mobPlayerIndex + 3000);
  assert(!mobPlayerSection.includes('title="Bagikan Lagu"'), 'Orphaned share tooltip "Bagikan Lagu" should not exist in mobile player');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
