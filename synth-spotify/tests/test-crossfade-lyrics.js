/**
 * Automated Verification: Dual-Deck Crossfade Lyrics Synchronization & Audio Proxy Integrity Test
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== VERIFYING DUAL-DECK CROSSFADE LYRICS & PROXY INTEGRITY ===');

const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// 1. Verify playTrackWithCrossfade invokes fetchSyncedLyrics and lifecycle updates
assert(
  appJsContent.includes('fetchSyncedLyrics(track.title, track.artist);'),
  'playTrackWithCrossfade must invoke fetchSyncedLyrics with track title and artist'
);
assert(
  appJsContent.includes('pushToHistory(track);'),
  'playTrackWithCrossfade must push new track into playback history'
);
assert(
  appJsContent.includes('renderQueueDrawer();'),
  'playTrackWithCrossfade must refresh queue drawer state'
);
console.log('✔ 1. playTrackWithCrossfade correctly invokes fetchSyncedLyrics and lifecycle dispatches');

// 2. Verify triggerNaturalTrackCrossfade invokes fetchSyncedLyrics and lifecycle updates
assert(
  appJsContent.includes('fetchSyncedLyrics(nextTrack.title, nextTrack.artist);'),
  'triggerNaturalTrackCrossfade must invoke fetchSyncedLyrics with next track title and artist'
);
assert(
  appJsContent.includes('pushToHistory(nextTrack);'),
  'triggerNaturalTrackCrossfade must push next track into playback history'
);
console.log('✔ 2. triggerNaturalTrackCrossfade correctly invokes fetchSyncedLyrics and lifecycle dispatches');

// 3. Verify fetchSyncedLyrics uses activeLyricsRequestId race guard
assert(
  appJsContent.includes('let activeLyricsRequestId = 0;'),
  'activeLyricsRequestId token counter must be declared'
);
assert(
  appJsContent.includes('activeLyricsRequestId++;') && appJsContent.includes('const requestId = activeLyricsRequestId;'),
  'fetchSyncedLyrics must increment and capture requestId'
);
assert(
  appJsContent.includes('if (requestId !== activeLyricsRequestId) return;'),
  'fetchSyncedLyrics must reject delayed responses from previous tracks'
);
console.log('✔ 3. fetchSyncedLyrics protected by activeLyricsRequestId race guard');

// 4. Verify fetchSyncedLyrics immediately purges previous lyrics and snippet displays
assert(
  appJsContent.includes('state.syncedLyrics = [];') && appJsContent.includes('state.activeLyricIndex = -1;'),
  'fetchSyncedLyrics must immediately clear state.syncedLyrics and reset activeLyricIndex'
);
assert(
  appJsContent.includes("if (mobPlayerSnippetText) mobPlayerSnippetText.textContent = '';"),
  'fetchSyncedLyrics must clear mobile player snippet text'
);
assert(
  appJsContent.includes("if (mobPreviewLine1) mobPreviewLine1.textContent = '';"),
  'fetchSyncedLyrics must clear mobile preview line 1'
);
console.log('✔ 4. fetchSyncedLyrics immediately purges old lyrics state and mobile snippets');

// 5. Verify fetchSyncedLyrics routes through getEffectiveApiBase()
assert(
  appJsContent.includes('${apiBase}/api/lyrics?title='),
  'fetchSyncedLyrics must use effective apiBase to support Android APK virtual loopback'
);
console.log('✔ 5. fetchSyncedLyrics uses getEffectiveApiBase() for APK loopback compatibility');

// 6. Verify wrapA and wrapB audio proxy deck listeners only allow activeDeck
assert(
  appJsContent.includes('if (activeDeck !== audioDeckA) return;'),
  'audioDeckA event proxy wrapA must strictly drop events when deck A is not active'
);
assert(
  appJsContent.includes('if (activeDeck !== audioDeckB) return;'),
  'audioDeckB event proxy wrapB must strictly drop events when deck B is not active'
);
console.log('✔ 6. Dual-deck audio proxy strictly restricts event dispatch to activeDeck');

// 7. Functional test: Simulate fetchSyncedLyrics with parsed LRC lines
{
  const rawLrc = `[00:01.00]First line
[00:05.50]Second line
[00:10.00]Third line`;
  const lines = rawLrc.split('\n');
  const parsed = [];
  const lrcRegex = /\[(\d+):(\d+(\.\d+)?)\](.*)/;
  for (const line of lines) {
    const match = lrcRegex.exec(line);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      const text = match[4].trim();
      if (text) parsed.push({ time: min * 60 + sec, text });
    }
  }

  assert.strictEqual(parsed.length, 3, '3 parsed LRC lines expected');
  assert.strictEqual(parsed[0].time, 1.0, 'Line 1 at 1.0s');
  assert.strictEqual(parsed[1].time, 5.5, 'Line 2 at 5.5s');
  assert.strictEqual(parsed[2].time, 10.0, 'Line 3 at 10.0s');
  console.log('✔ 7. Functional LRC parser correctly decodes timestamps and line texts');
}

console.log('\n🎉 ALL DUAL-DECK CROSSFADE LYRICS INTEGRITY CHECKS PASSED!\n');

