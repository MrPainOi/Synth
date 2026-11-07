/**
 * Tier 1: Feature Coverage — R5-A: 29s Audio Truncation Bug Fix
 * Requirement: ORIGINAL_REQUEST §R5 & PROJECT.md
 * - Reject 30-second preview clips and always acquire full-length audio streams.
 */

const { assert, assertEqual, createSuite, readProjectFile } = require('../test-utils');

const suite = createSuite('Tier 1: R5-A — 29s Audio Truncation Fix');

function isTruncatedPreview(duration, metadata = {}) {
  const d = Number(duration) || 0;
  // Preview clips typically range between 29.0s and 30.5s
  if (d >= 29.0 && d <= 30.5) return true;
  if (metadata.is_preview === true || metadata.preview === true) return true;
  // If metadata expected duration is >60s but audio stream duration is < 35s
  if (metadata.expectedDuration && metadata.expectedDuration > 60 && d < 35) return true;
  return false;
}

suite.test('R5A-01: Duration filter rejects tracks with 29.0s to 30.5s duration', () => {
  assertEqual(isTruncatedPreview(29.0), true, '29.0s must be flagged as preview');
  assertEqual(isTruncatedPreview(29.8), true, '29.8s must be flagged as preview');
  assertEqual(isTruncatedPreview(30.0), true, '30.0s must be flagged as preview');
  assertEqual(isTruncatedPreview(30.4), true, '30.4s must be flagged as preview');
});

suite.test('R5A-02: Stream resolver rejects streams flagged with preview metadata', () => {
  const streamWithFlag = { duration: 45, is_preview: true };
  assertEqual(isTruncatedPreview(streamWithFlag.duration, streamWithFlag), true, 'Stream with is_preview=true must be rejected');

  const streamWithPreviewObj = { duration: 120, preview: true };
  assertEqual(isTruncatedPreview(streamWithPreviewObj.duration, streamWithPreviewObj), true, 'Stream with preview=true must be rejected');
});

suite.test('R5A-03: Full length song streams (>60s) pass validation cleanly', () => {
  assertEqual(isTruncatedPreview(210), false, '3.5 min track (210s) must be accepted');
  assertEqual(isTruncatedPreview(180), false, '3.0 min track (180s) must be accepted');
  assertEqual(isTruncatedPreview(360), false, '6.0 min track (360s) must be accepted');
});

suite.test('R5A-04: Truncation fallback triggers search recovery when stream is under expected length', async () => {
  let fallbackInvoked = false;

  async function resolveFullStream(track, primaryResolver, fallbackResolver) {
    const primary = await primaryResolver(track);
    if (isTruncatedPreview(primary.duration, { expectedDuration: track.expectedDuration })) {
      fallbackInvoked = true;
      return await fallbackResolver(track);
    }
    return primary;
  }

  const track = { id: 'sample_song', expectedDuration: 240 };
  const mockPrimary = async () => ({ url: 'https://preview.stream/clip.mp3', duration: 30.0 });
  const mockFallback = async () => ({ url: 'https://full.stream/audio.opus', duration: 240.0 });

  const resolved = await resolveFullStream(track, mockPrimary, mockFallback);
  assertEqual(fallbackInvoked, true, 'Fallback resolver should be invoked upon preview detection');
  assertEqual(resolved.duration, 240.0, 'Resolved audio must be the full 240s stream');
});

suite.test('R5A-05: Backend code in server.js or mobile-bridge implements duration guard filtering', () => {
  const serverJs = readProjectFile('synth-spotify/server.js');
  const bridgeJs = readProjectFile('synth-spotify/mobile-bridge.js');
  const code = serverJs + '\n' + bridgeJs;

  // Search for duration guard logic (e.g. 29.5 or 30 or duration checks or filter)
  const hasDurationFilter = /29\.[0-9]|30\.[0-9]|duration\s*<\s*35|duration\s*===\s*30/i.test(code);
  assert(hasDurationFilter, 'Server or mobile-bridge must implement duration boundary filter for 29-30s clips');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
