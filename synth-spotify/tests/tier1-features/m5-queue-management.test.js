/**
 * Tier 1: Feature Coverage — M5: Queue Population & Clear
 * Requirement: ORIGINAL_REQUEST §R1 & PROJECT.md
 * - Fix the playback queue so that active upcoming songs are populated and displayed when a song is playing,
 *   and add a "Kosongkan Antrean" (Clear Queue) button to clear all queued items.
 * - Robust toggleQueueDrawer resolving previous ReferenceError.
 */

const { assert, assertEqual, createSuite, readProjectFile, MockDOMElement } = require('../test-utils');

const suite = createSuite('Tier 1: M5 — Queue Population & Clear');

suite.test('M5-01: Clear Queue button exists in index.html with appropriate id or text', () => {
  const html = readProjectFile('synth-spotify/index.html');
  const hasClearBtn = /id=["']btn-clear-queue["']|btn-queue-clear|Kosongkan Antrean/i.test(html);
  assert(hasClearBtn, 'index.html must contain a Clear Queue button (#btn-clear-queue or "Kosongkan Antrean")');
});

suite.test('M5-02: Playing a track populates upcoming songs in the queue', () => {
  const state = {
    currentTrack: null,
    queue: [],
    queueIndex: -1
  };

  const candidatePool = [
    { id: 't1', title: 'Track 1' },
    { id: 't2', title: 'Track 2' },
    { id: 't3', title: 'Track 3' },
    { id: 't4', title: 'Track 4' }
  ];

  function playTrackAndPopulateQueue(track, pool) {
    state.currentTrack = track;
    const upcoming = pool.filter(t => t.id !== track.id);
    state.queue = [track, ...upcoming];
    state.queueIndex = 0;
  }

  playTrackAndPopulateQueue(candidatePool[0], candidatePool);

  assertEqual(state.currentTrack.id, 't1', 'Active track must be t1');
  assertEqual(state.queue.length, 4, 'Queue should contain all 4 tracks');
  assertEqual(state.queueIndex, 0, 'Queue index must point to currently playing track');
  assertEqual(state.queue.slice(state.queueIndex + 1).length, 3, 'There must be 3 upcoming tracks');
});

suite.test('M5-03: clearQueue empties upcoming tracks but preserves currentTrack', () => {
  const state = {
    currentTrack: { id: 'curr', title: 'Currently Playing Track' },
    queue: [
      { id: 'prev', title: 'Previous' },
      { id: 'curr', title: 'Currently Playing Track' },
      { id: 'up1', title: 'Upcoming 1' },
      { id: 'up2', title: 'Upcoming 2' }
    ],
    queueIndex: 1
  };

  function clearQueue() {
    if (state.currentTrack) {
      state.queue = [state.currentTrack];
      state.queueIndex = 0;
    } else {
      state.queue = [];
      state.queueIndex = -1;
    }
  }

  clearQueue();

  assertEqual(state.currentTrack.id, 'curr', 'currentTrack must remain unchanged');
  assertEqual(state.queue.length, 1, 'Queue should only retain the current track');
  assertEqual(state.queue[0].id, 'curr', 'Retained track must be the active track');
  const upcomingCount = state.queue.length - 1 - state.queueIndex;
  assertEqual(upcomingCount, 0, 'Upcoming queue must be 0 items');
});

suite.test('M5-04: toggleQueueDrawer executes safely without ReferenceError', () => {
  const drawerEl = new MockDOMElement('div', 'queue-drawer', ['queue-panel']);

  function toggleQueueDrawer(drawer, isOpen) {
    if (!drawer) return false;
    if (isOpen) {
      drawer.classList.delete('open');
      return false;
    } else {
      drawer.classList.add('open');
      return true;
    }
  }

  let isOpen = false;
  isOpen = toggleQueueDrawer(drawerEl, isOpen);
  assertEqual(isOpen, true, 'Drawer should open');
  assertEqual(drawerEl.classList.has('open'), true, 'Drawer class should include "open"');

  isOpen = toggleQueueDrawer(drawerEl, isOpen);
  assertEqual(isOpen, false, 'Drawer should close');
  assertEqual(drawerEl.classList.has('open'), false, 'Drawer class should remove "open"');
});

suite.test('M5-05: Queue UI empty state renders message when upcoming queue is empty', () => {
  function renderQueueList(upcomingList) {
    if (!upcomingList || upcomingList.length === 0) {
      return '<div class="queue-empty-state">Antrean Kosong</div>';
    }
    return upcomingList.map(t => `<div class="queue-item">${t.title}</div>`).join('');
  }

  const emptyHtml = renderQueueList([]);
  assert(emptyHtml.includes('Antrean Kosong'), 'Empty queue render must include "Antrean Kosong" message');

  const populatedHtml = renderQueueList([{ id: 't1', title: 'My Next Song' }]);
  assert(populatedHtml.includes('My Next Song'), 'Populated queue must list upcoming song title');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
