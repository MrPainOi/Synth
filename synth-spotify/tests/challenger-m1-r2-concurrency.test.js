/**
 * Empirical Challenger 2 Stress Test Suite: Milestone M1 Iteration 2 Gate
 * Focus: Adversarial Stress Testing of Crossfade Concurrency & State Machine
 *
 * Scenarios Tested:
 * 1. Rapid next/prev skips during active crossfade: verifies timers are cancelled and deck playback remains stable.
 * 2. Rapid prev skips during active crossfade.
 * 3. Outgoing deck `ended` during crossfade: verifies incoming track is NOT skipped.
 * 4. Pause/resume physical synchronization during active crossfade.
 * 5. Equal-power curve continuity on mid-crossfade resume (Acoustic discontinuity analysis).
 * 6. Leakage of outgoing deck 'pause' event on crossfade finalization (spurious isPlaying = false).
 * 7. Production runtime defect: missing updateActiveRowIndicators causing ReferenceError in setPlayState.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const {
  assert,
  assertEqual,
  assertInRange,
  createSuite,
  MockAudioContext,
  MockDOMElement,
  MockLocalStorage
} = require('./test-utils');

const suite = createSuite('Empirical Challenger 2: Crossfade Concurrency & Concurrency Integrity');

class DOMClassList extends Set {
  contains(c) { return this.has(c); }
  add(c) { super.add(c); return this; }
  remove(c) { this.delete(c); }
  toggle(c, force) {
    if (force === undefined) {
      this.has(c) ? this.delete(c) : this.add(c);
    } else if (force) {
      this.add(c);
    } else {
      this.delete(c);
    }
  }
}

function makeMockElement(tag, id = '') {
  const el = new MockDOMElement(tag, id);
  el.classList = new DOMClassList();
  Object.defineProperty(el, 'className', {
    get() { return Array.from(this.classList).join(' '); },
    set(val) { this.classList = new DOMClassList((val || '').split(/\s+/).filter(Boolean)); }
  });
  el.attributes = {};
  el.setAttribute = function(k, v) { this.attributes[k] = String(v); };
  el.getAttribute = function(k) { return this.attributes[k] || null; };
  el.removeAttribute = function(k) { delete this.attributes[k]; };
  return el;
}

class SandboxAudio extends MockDOMElement {
  constructor(id = '') {
    super('audio', id);
    this.classList = new DOMClassList();
    Object.defineProperty(this, 'className', {
      get() { return Array.from(this.classList).join(' '); },
      set(val) { this.classList = new DOMClassList((val || '').split(/\s+/).filter(Boolean)); }
    });
    this.attributes = {};
    this.setAttribute = function(k, v) { this.attributes[k] = String(v); };
    this.getAttribute = function(k) { return this.attributes[k] || null; };
    this.removeAttribute = function(k) { delete this.attributes[k]; };
    this.src = '';
    this.currentTime = 0;
    this.duration = 180;
    this.paused = true;
    this.playbackRate = 1.0;
    this.preservesPitch = true;
    this.playCallCount = 0;
    this.pauseCallCount = 0;
  }
  async play() {
    this.paused = false;
    this.playCallCount++;
    this.dispatchEvent({ type: 'play', target: this });
    this.dispatchEvent({ type: 'playing', target: this });
  }
  pause() {
    this.paused = true;
    this.pauseCallCount++;
    this.dispatchEvent({ type: 'pause', target: this });
  }
}

function createSandboxApp(options = {}) {
  const audioDeckA = new SandboxAudio('native-audio');
  const audioDeckB = new SandboxAudio('native-audio-b');
  const docRoot = makeMockElement('html');
  const docBody = makeMockElement('body');

  const docProxy = new Proxy({}, {
    get(target, prop) {
      if (prop === 'getElementById') {
        return (id) => {
          if (id === 'native-audio') return audioDeckA;
          if (id === 'native-audio-b') return audioDeckB;
          return makeMockElement('div', id);
        };
      }
      if (prop === 'querySelector') return (s) => makeMockElement('div');
      if (prop === 'querySelectorAll') return (s) => [];
      if (prop === 'createElement') return (t) => makeMockElement(t);
      if (prop === 'addEventListener') return () => {};
      if (prop === 'documentElement') return docRoot;
      if (prop === 'body') return docBody;
      if (prop === 'readyState') return 'complete';
      return () => {};
    }
  });

  const audioCtx = new MockAudioContext();

  const winProxy = {
    document: docProxy,
    localStorage: new MockLocalStorage({ synth_crossfade: '1' }),
    AudioContext: function() { return audioCtx; },
    webkitAudioContext: function() { return audioCtx; },
    Audio: SandboxAudio,
    MediaMetadata: function(meta) { this.title = meta?.title; },
    EventSource: function() { this.close = () => {}; this.addEventListener = () => {}; },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    CustomEvent: function(name, opts) { this.name = name; this.detail = opts?.detail; },
    location: { href: 'http://localhost/', search: '' },
    navigator: { userAgent: 'test', mediaSession: { setActionHandler: () => {} } },
    innerWidth: 1024,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ items: [] }) }),
    URLSearchParams: URLSearchParams,
    Float32Array: Float32Array,
    Math: Math,
    JSON: JSON,
    Date: Date,
    console: { log: () => {}, warn: () => {}, error: () => {} }
  };

  if (options.stubUpdateActiveRowIndicators) {
    winProxy.updateActiveRowIndicators = () => {};
  }

  winProxy.window = winProxy;

  const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  vm.runInNewContext(appCode, winProxy);

  return {
    window: winProxy,
    engine: winProxy.SynthAudioEngine,
    core: winProxy.MurielCore,
    audioCtx,
    audioDeckA,
    audioDeckB
  };
}

// =============================================================================
// TEST 1: Rapid Next Skips During Active Crossfade
// =============================================================================
suite.test('CH2-CONC-01: Rapid next skips during active crossfade cancel prior timers, prevent unwanted pauses, and keep deck playback stable', async () => {
  const { engine, core } = createSandboxApp({ stubUpdateActiveRowIndicators: true });

  const tracks = Array.from({ length: 8 }, (_, i) => ({
    id: `track_${i + 1}`,
    title: `Song Title ${i + 1}`,
    artist: `Artist ${i + 1}`,
    duration: 180,
    streamUrl: `http://audio.mock/stream_${i + 1}.mp3`
  }));

  // Start Track 1
  await core.playTrack(tracks[0], tracks, 0);
  await new Promise(r => setTimeout(r, 20));

  assertEqual(core.state.currentTrack.id, 'track_1', 'Track 1 playing');
  assertEqual(core.state.isPlaying, true, 'Playback is active');

  engine.setCrossfadeDuration(1); // 1 second crossfade

  // Trigger next to initiate crossfade to Track 2
  core.next();
  await new Promise(r => setTimeout(r, 10));

  assertEqual(core.state.currentTrack.id, 'track_2', 'Crossfade to Track 2 initiated');

  // Rapidly fire next() 4 more times in quick succession (10ms intervals)
  for (let i = 0; i < 4; i++) {
    core.next();
    await new Promise(r => setTimeout(r, 10));
  }

  // Queue should have advanced to track_6 (1 + 1 + 4 = 6)
  assertEqual(core.state.currentTrack.id, 'track_6', 'Queue should be at track_6 after rapid skips');

  let decks = engine.getDecks();
  const currentActive = decks.activeDeck;

  assertEqual(currentActive.paused, false, 'Current active deck must be actively playing');

  // Record pause calls on active deck
  const pausesBefore = currentActive.pauseCallCount;

  // Wait 1.1s for the 1s crossfade to finalize naturally
  await new Promise(r => setTimeout(r, 1100));

  decks = engine.getDecks();
  // The active deck must NOT have been paused by any lingering timer from earlier tracks!
  assertEqual(decks.activeDeck.paused, false, 'Active deck must still be playing after crossfade completion');
  assertEqual(decks.activeDeck.pauseCallCount, pausesBefore, 'No lingering timer should have invoked pause() on active deck');
  assertEqual(decks.inactiveDeck.paused, true, 'Inactive deck must be paused after crossfade completes');
});

// =============================================================================
// TEST 2: Rapid Prev Skips During Active Crossfade
// =============================================================================
suite.test('CH2-CONC-02: Rapid prev skips cancel active crossfade and cleanly position target deck', async () => {
  const { engine, core } = createSandboxApp({ stubUpdateActiveRowIndicators: true });

  const tracks = [
    { id: 't1', title: 'Song 1', artist: 'Artist 1', duration: 180, streamUrl: 'http://audio.mock/1.mp3' },
    { id: 't2', title: 'Song 2', artist: 'Artist 2', duration: 180, streamUrl: 'http://audio.mock/2.mp3' },
    { id: 't3', title: 'Song 3', artist: 'Artist 3', duration: 180, streamUrl: 'http://audio.mock/3.mp3' }
  ];

  await core.playTrack(tracks[1], tracks, 0); // Start at track 2
  await new Promise(r => setTimeout(r, 20));

  engine.setCrossfadeDuration(6);
  core.next(); // Crossfade to track 3
  await new Promise(r => setTimeout(r, 20));

  assertEqual(core.state.currentTrack.id, 't3', 'Crossfade to t3 started');

  // Now immediately call prev()
  core.prev();
  await new Promise(r => setTimeout(r, 30));

  assertEqual(core.state.currentTrack.id, 't2', 'prev() navigated back to t2');

  const decks = engine.getDecks();
  assertEqual(decks.activeDeck.paused, false, 'Target active deck is playing');
  assertEqual(decks.inactiveDeck.paused, true, 'Drop deck is paused');
});

// =============================================================================
// TEST 3: Outgoing Deck `ended` Event During Crossfade
// =============================================================================
suite.test('CH2-CONC-03: Outgoing deck "ended" event during crossfade is suppressed; incoming track is NOT skipped', async () => {
  const { engine, core } = createSandboxApp({ stubUpdateActiveRowIndicators: true });

  const tracks = [
    { id: 'track_1', title: 'Alpha', artist: 'Artist Alpha', duration: 180, streamUrl: 'http://audio.mock/1.mp3' },
    { id: 'track_2', title: 'Beta', artist: 'Artist Beta', duration: 180, streamUrl: 'http://audio.mock/2.mp3' },
    { id: 'track_3', title: 'Gamma', artist: 'Artist Gamma', duration: 180, streamUrl: 'http://audio.mock/3.mp3' }
  ];

  await core.playTrack(tracks[0], tracks, 0);
  await new Promise(r => setTimeout(r, 20));

  engine.setCrossfadeDuration(6);
  core.next(); // Initiate crossfade from Track 1 (Deck A) to Track 2 (Deck B)
  await new Promise(r => setTimeout(r, 20));

  assertEqual(core.state.currentTrack.id, 'track_2', 'Crossfade to Track 2 active');
  assertEqual(core.state.queueIndex, 1, 'Queue index is at 1 (Track 2)');

  const decks = engine.getDecks();
  const outgoingDeck = decks.inactiveDeck; // Deck A
  const incomingDeck = decks.activeDeck;   // Deck B

  // Deck A reaches end-of-file during crossfade and fires native 'ended' event
  outgoingDeck.dispatchEvent({ type: 'ended', target: outgoingDeck });

  await new Promise(r => setTimeout(r, 40));

  // VERIFY: The queue must NOT advance to track_3!
  assertEqual(core.state.currentTrack.id, 'track_2', 'Incoming track_2 MUST NOT be skipped when outgoing deck ends');
  assertEqual(core.state.queueIndex, 1, 'Queue index must remain at 1');
  assertEqual(incomingDeck.paused, false, 'Incoming deck must continue playing uninterrupted');
});

// =============================================================================
// TEST 4: Pause and Resume Synchronization During Active Crossfade
// =============================================================================
suite.test('CH2-CONC-04: Pause/resume during crossfade freezes and resumes both physical decks synchronously', async () => {
  const { engine, core, audioDeckA, audioDeckB } = createSandboxApp({ stubUpdateActiveRowIndicators: true });

  const tracks = [
    { id: 't1', title: 'Song 1', artist: 'Artist 1', duration: 180, streamUrl: 'http://audio.mock/1.mp3' },
    { id: 't2', title: 'Song 2', artist: 'Artist 2', duration: 180, streamUrl: 'http://audio.mock/2.mp3' }
  ];

  await core.playTrack(tracks[0], tracks, 0);
  await new Promise(r => setTimeout(r, 20));

  engine.setCrossfadeDuration(6);
  core.next(); // Crossfade from Deck A to Deck B
  await new Promise(r => setTimeout(r, 20));

  assertEqual(audioDeckA.paused, false, 'Deck A must be playing during crossfade');
  assertEqual(audioDeckB.paused, false, 'Deck B must be playing during crossfade');

  // Trigger pause via audio proxy
  core.audio.pause();
  await new Promise(r => setTimeout(r, 20));

  assertEqual(audioDeckA.paused, true, 'Deck A must freeze on pause');
  assertEqual(audioDeckB.paused, true, 'Deck B must freeze on pause');
  assertEqual(core.audio.paused, true, 'Proxy audio.paused must report true');

  // Trigger resume via audio proxy
  await core.audio.play();
  await new Promise(r => setTimeout(r, 20));

  assertEqual(audioDeckA.paused, false, 'Deck A must resume playback');
  assertEqual(audioDeckB.paused, false, 'Deck B must resume playback');
  assertEqual(core.audio.paused, false, 'Proxy audio.paused must report false');
});

// =============================================================================
// TEST 5: Gain Curve Discontinuity on Mid-Crossfade Resume
// =============================================================================
suite.test('CH2-CONC-05: Mid-crossfade resume restarts equal-power curves from t=0 (volume jump & acoustic drop)', async () => {
  const { engine, core, audioCtx } = createSandboxApp({ stubUpdateActiveRowIndicators: true });

  const tracks = [
    { id: 't1', title: 'Song 1', artist: 'Artist 1', duration: 180, streamUrl: 'http://audio.mock/1.mp3' },
    { id: 't2', title: 'Song 2', artist: 'Artist 2', duration: 180, streamUrl: 'http://audio.mock/2.mp3' }
  ];

  await core.playTrack(tracks[0], tracks, 0);
  await new Promise(r => setTimeout(r, 20));

  engine.setCrossfadeDuration(6);
  core.next(); // Crossfade begins
  await new Promise(r => setTimeout(r, 20));

  const gainNodes = audioCtx.createdNodes.filter(n => n.type === 'gain');
  const gainDeckA = gainNodes[0];
  const gainDeckB = gainNodes[1];

  // Pause at mid-crossfade
  core.audio.pause();
  await new Promise(r => setTimeout(r, 20));

  // Resume mid-crossfade
  await core.audio.play();
  await new Promise(r => setTimeout(r, 20));

  // Inspect the scheduled curves applied on resume
  const resumeEventA = gainDeckA.gain.scheduledEvents[0];
  const resumeEventB = gainDeckB.gain.scheduledEvents[0];

  assertEqual(resumeEventA.type, 'curve', 'Deck A receives curve automation on resume');
  assertEqual(resumeEventB.type, 'curve', 'Deck B receives curve automation on resume');

  // Notice: EQUAL_POWER_FADE_OUT[0] is 1.0 and EQUAL_POWER_FADE_IN[0] is 0.0
  const firstValueA = resumeEventA.values[0];
  const firstValueB = resumeEventB.values[0];

  // This empirically confirms that on resume, Deck A's gain resets to 1.0 (jumping in volume)
  // and Deck B's gain resets to 0.0 (dropping to silence), restarting the transition
  assertEqual(firstValueA, 1.0, 'Outgoing deck gain curve resets to 1.0 on resume');
  assertEqual(firstValueB, 0.0, 'Incoming deck gain curve resets to 0.0 on resume');
});

// =============================================================================
// TEST 6: Outgoing Deck Pause Event Leakage Guard
// =============================================================================
suite.test('CH2-CONC-06: Outgoing deck pause() in finalizeCrossfade does not leak; state.isPlaying remains true', async () => {
  const { engine, core } = createSandboxApp({ stubUpdateActiveRowIndicators: true });

  const tracks = [
    { id: 't1', title: 'Song 1', artist: 'Artist 1', duration: 180, streamUrl: 'http://audio.mock/1.mp3' },
    { id: 't2', title: 'Song 2', artist: 'Artist 2', duration: 180, streamUrl: 'http://audio.mock/2.mp3' }
  ];

  await core.playTrack(tracks[0], tracks, 0);
  await new Promise(r => setTimeout(r, 20));
  assertEqual(core.state.isPlaying, true, 'Initially playing');

  engine.setCrossfadeDuration(1); // 1s
  core.next(); // Crossfade to track 2
  await new Promise(r => setTimeout(r, 50));
  assertEqual(core.state.isPlaying, true, 'During crossfade, isPlaying remains true');

  // Wait 1.1s for finalizeCrossfade() to pause outgoing deck
  await new Promise(r => setTimeout(r, 1100));

  const decks = engine.getDecks();
  // Physical audio element is still actively playing:
  assertEqual(decks.activeDeck.paused, false, 'Incoming deck is still actively playing');

  // VERIFY: Outgoing deck pause is suppressed so state.isPlaying remains true
  const isPlayingAfterFinalize = core.state.isPlaying;
  console.log(`[CH2-CONC-06 EMPIRICAL] Active deck playing=${!decks.activeDeck.paused}, state.isPlaying=${isPlayingAfterFinalize}`);
  assertEqual(isPlayingAfterFinalize, true, 'Defect fixed: state.isPlaying remains true after crossfade finalization');
});

// =============================================================================
// TEST 7: Production Defect Check — updateActiveRowIndicators Defined
// =============================================================================
suite.test('CH2-CRIT-01: setPlayState succeeds when updateActiveRowIndicators is defined', async () => {
  // Create sandbox WITHOUT the stub to simulate genuine production runtime
  const { core } = createSandboxApp({ stubUpdateActiveRowIndicators: false });

  const track = {
    id: 't_real',
    title: 'Real Song',
    artist: 'Real Artist',
    duration: 180,
    streamUrl: 'http://audio.mock/real.mp3'
  };

  // Attempt to play track
  await core.playTrack(track, [track], 0);
  await new Promise(r => setTimeout(r, 30));

  // In production with updateActiveRowIndicators defined, playTrack succeeds smoothly
  const isPlaying = core.state.isPlaying;
  const audioSrc = core.audio.src;

  console.log(`[CH2-CRIT-01 EMPIRICAL] isPlaying=${isPlaying}, audioSrc="${audioSrc}"`);
  assertEqual(audioSrc, 'http://audio.mock/real.mp3', 'audioEl.src successfully loaded without ReferenceError');
  assertEqual(isPlaying, true, 'Playback started successfully with updateActiveRowIndicators defined');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log('\n===============================================================');
    console.log(`Total: ${res.total} | Passed: ${res.passed} | Failed: ${res.failed}`);
    console.log('===============================================================');
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
