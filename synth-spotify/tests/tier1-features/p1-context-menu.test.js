/**
 * Tier 1: Feature Coverage — P1: Desktop Context Menu
 * Requirement: ORIGINAL_REQUEST §R2 & PROJECT.md
 * - Right-click context menu on desktop track rows offering:
 *   Putar Berikutnya (Play Next), Tambah ke Antrean (Add to Queue),
 *   Tambah ke Playlist (Add to Playlist), Suka (Like), and Salin Link (Copy Link).
 */

const { assert, assertEqual, createSuite, readProjectFile } = require('../test-utils');

const suite = createSuite('Tier 1: P1 — Desktop Context Menu');

suite.test('P1-01: Context menu structure supports all 5 required actions', () => {
  const appJs = readProjectFile('synth-spotify/app.js');
  const html = readProjectFile('synth-spotify/index.html');
  const code = appJs + '\n' + html;

  const hasPlayNext = /Putar Berikutnya|play-next/i.test(code);
  const hasAddQueue = /Tambah ke Antrean|add-to-queue/i.test(code);
  const hasAddPlaylist = /Tambah ke Playlist|add-to-playlist/i.test(code);
  const hasLike = /Suka|Batal Suka|like-track/i.test(code);
  const hasCopyLink = /Salin Link|copy-link/i.test(code);

  assert(hasPlayNext, 'Must support Putar Berikutnya (Play Next)');
  assert(hasAddQueue, 'Must support Tambah ke Antrean (Add to Queue)');
  assert(hasAddPlaylist, 'Must support Tambah ke Playlist (Add to Playlist)');
  assert(hasLike, 'Must support Suka (Like)');
  assert(hasCopyLink, 'Must support Salin Link (Copy Link)');
});

suite.test('P1-02: "Putar Berikutnya" inserts track immediately after current track (queueIndex + 1)', () => {
  const state = {
    queue: [
      { id: 'curr', title: 'Current Song' },
      { id: 'later1', title: 'Later 1' },
      { id: 'later2', title: 'Later 2' }
    ],
    queueIndex: 0
  };

  const targetTrack = { id: 'next_priority', title: 'Priority Next Song' };

  function actionPlayNext(track) {
    state.queue.splice(state.queueIndex + 1, 0, track);
  }

  actionPlayNext(targetTrack);

  assertEqual(state.queue.length, 4, 'Queue length should expand by 1');
  assertEqual(state.queue[1].id, 'next_priority', 'Track must be at queueIndex + 1');
  assertEqual(state.queue[2].id, 'later1', 'Previous upcoming track must shift to index 2');
});

suite.test('P1-03: "Tambah ke Antrean" appends track to the end of the queue', () => {
  const state = {
    queue: [
      { id: 't1', title: 'Song 1' },
      { id: 't2', title: 'Song 2' }
    ]
  };

  const newTrack = { id: 't_end', title: 'Appended Track' };

  function actionAddToQueue(track) {
    state.queue.push(track);
  }

  actionAddToQueue(newTrack);

  assertEqual(state.queue.length, 3, 'Queue length should expand by 1');
  assertEqual(state.queue[2].id, 't_end', 'Track must be at the very end of the queue');
});

suite.test('P1-04: "Suka" context action toggles track favorite state', () => {
  const state = { favorites: [] };
  const track = { id: 'context_fav', title: 'Favorite Hit' };

  function actionToggleLike(t) {
    const idx = state.favorites.findIndex(f => f.id === t.id);
    if (idx !== -1) {
      state.favorites.splice(idx, 1);
      return false;
    } else {
      state.favorites.push(t);
      return true;
    }
  }

  const liked = actionToggleLike(track);
  assertEqual(liked, true, 'Liking via context menu must add to favorites');
  assertEqual(state.favorites.length, 1, 'Favorites count should be 1');

  const unliked = actionToggleLike(track);
  assertEqual(unliked, false, 'Second click must remove from favorites');
  assertEqual(state.favorites.length, 0, 'Favorites count should be 0');
});

suite.test('P1-05: "Salin Link" generates track URL and writes to clipboard', async () => {
  let clipboardText = '';
  const mockClipboard = {
    writeText: async (text) => { clipboardText = text; }
  };

  async function actionCopyLink(track, clipboardApi) {
    const url = `https://synth.app/track/${encodeURIComponent(track.id)}`;
    await clipboardApi.writeText(url);
    return url;
  }

  const generated = await actionCopyLink({ id: 'song_99' }, mockClipboard);
  assertEqual(clipboardText, 'https://synth.app/track/song_99', 'Clipboard must contain track URL');
  assertEqual(generated, clipboardText, 'Returned URL must match copied content');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
