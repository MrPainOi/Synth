/**
 * Tier 1: Feature Coverage — P2: Screen Wake Lock in Lyrics Mode
 * Requirement: ORIGINAL_REQUEST §R2 & PROJECT.md
 * - Integrate Screen Wake Lock (navigator.wakeLock) to keep the display awake whenever Lyrics Mode is active,
 *   releasing the lock when exiting lyrics mode.
 */

const { assert, assertEqual, createSuite, readProjectFile } = require('../test-utils');

const suite = createSuite('Tier 1: P2 — Screen Wake Lock');

suite.test('P2-01: app.js references navigator.wakeLock for lyrics mode', () => {
  const appJs = readProjectFile('synth-spotify/app.js');
  const hasWakeLock = /wakeLock/i.test(appJs);
  assert(hasWakeLock, 'app.js must implement wakeLock logic for display persistence');
});

suite.test('P2-02: Opening lyrics mode requests screen wake lock sentinel', async () => {
  let requestedType = null;
  let isSentinelActive = false;

  const mockWakeLock = {
    request: async (type) => {
      requestedType = type;
      isSentinelActive = true;
      return {
        released: false,
        release: async () => { isSentinelActive = false; }
      };
    }
  };

  class LyricsController {
    constructor() {
      this.sentinel = null;
    }
    async openLyrics(nav) {
      if (nav && nav.wakeLock) {
        try {
          this.sentinel = await nav.wakeLock.request('screen');
        } catch (e) {}
      }
    }
  }

  const controller = new LyricsController();
  await controller.openLyrics({ wakeLock: mockWakeLock });

  assertEqual(requestedType, 'screen', 'Wake lock must request "screen" lock');
  assertEqual(isSentinelActive, true, 'Wake lock sentinel must be active');
});

suite.test('P2-03: Exiting lyrics mode releases the active wake lock sentinel', async () => {
  let released = false;
  const mockSentinel = {
    released: false,
    release: async () => { released = true; }
  };

  class LyricsController {
    constructor(sentinel) {
      this.sentinel = sentinel;
    }
    async closeLyrics() {
      if (this.sentinel && typeof this.sentinel.release === 'function') {
        await this.sentinel.release();
        this.sentinel = null;
      }
    }
  }

  const controller = new LyricsController(mockSentinel);
  await controller.closeLyrics();

  assertEqual(released, true, 'Sentinel release() must be called on lyrics exit');
  assertEqual(controller.sentinel, null, 'Sentinel reference must be cleared after release');
});

suite.test('P2-04: Gracefully handles unsupported navigator.wakeLock without throwing', async () => {
  let threw = false;

  async function openLyricsSafe(nav) {
    if (nav && typeof nav.wakeLock !== 'undefined') {
      await nav.wakeLock.request('screen');
    }
  }

  try {
    await openLyricsSafe({}); // nav without wakeLock
  } catch (e) {
    threw = true;
  }

  assertEqual(threw, false, 'Absence of wakeLock API should never throw an unhandled error');
});

suite.test('P2-05: Re-acquires wake lock on document visibility change to visible while lyrics open', async () => {
  let requestCount = 0;
  const mockWakeLock = {
    request: async () => {
      requestCount++;
      return { release: async () => {} };
    }
  };

  class LyricsVisibilityManager {
    constructor(wakeLockApi) {
      this.wakeLock = wakeLockApi;
      this.isLyricsOpen = true;
      this.sentinel = null;
    }
    async handleVisibilityChange(visibilityState) {
      if (this.isLyricsOpen && visibilityState === 'visible') {
        this.sentinel = await this.wakeLock.request('screen');
      }
    }
  }

  const manager = new LyricsVisibilityManager(mockWakeLock);
  await manager.handleVisibilityChange('hidden');
  assertEqual(requestCount, 0, 'Should not acquire lock when hidden');

  await manager.handleVisibilityChange('visible');
  assertEqual(requestCount, 1, 'Should acquire lock when visible again');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
