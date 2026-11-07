/**
 * Synth 2 - Spotify Edition
 * Complete Spotify Music Player Application
 * Incorporating all Synth core features: Online streaming, HLS, Queue, Synced Lyrics,
 * Liked Songs, Custom Playlists, Artist Profiles, History, and Navigation.
 */

function initApp() {
  // Check for forced mobile mode via URL parameters (?mode=mobile or ?device=mobile)
  const urlParams = new URLSearchParams(window.location.search);
  const isForcedMobile = urlParams.get('mode') === 'mobile' || urlParams.get('device') === 'mobile';
  const isNativeAndroid = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const isPhone = isNativeAndroid || isForcedMobile || window.innerWidth <= 768;
  if (isPhone) {
    document.documentElement.classList.add('is-mobile');
  }

  // Ensure initial body data-view is set to 'home' for mobile header visibility
  document.body.dataset.view = 'home';
  document.body.setAttribute('data-view', 'home');

  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================
  const state = {
    currentView: 'home', // 'home', 'search', 'liked-songs', 'playlist-detail', 'artist', 'lyrics'
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: parseFloat(localStorage.getItem('synth_volume') || '0.75'),
    isMuted: localStorage.getItem('synth_muted') === '1',
    isShuffle: localStorage.getItem('synth_shuffle') === '1',
    repeatMode: parseInt(localStorage.getItem('synth_repeat') || '0', 10), // 0: off, 1: all, 2: one

    // Queue system
    queue: [],
    queueIndex: -1,
    queueHistory: [],
    originalQueue: [],

    // Favorites / Liked Songs
    favorites: JSON.parse(localStorage.getItem('devsize_favorites') || localStorage.getItem('synth_liked_songs') || '[]'),

    // User Playlists
    playlists: JSON.parse(localStorage.getItem('devsize_playlists') || localStorage.getItem('synth_playlists') || '[]'),

    // History (Recently Played)
    history: JSON.parse(localStorage.getItem('devsize_history') || localStorage.getItem('synth_history') || '[]'),

    // Local Synth library tracks (loaded from /api/synth-tracks)
    synthLibraryTracks: [],

    // Recommendations (Rekomendasi Untukmu - Persisted for 0ms instant display)
    recommendations: JSON.parse(localStorage.getItem('synth_recommendations') || '[]'),

    // Lyrics
    syncedLyrics: [],
    activeLyricIndex: -1,
    isLyricsOpen: false,
    isMobilePlayerOpen: false,

    // Active Playlist / Artist detail
    activePlaylistData: null,
    activeArtistData: null,

    // Navigation Stack
    historyStack: [{ view: 'home' }],
    historyIndex: 0,

    // Music Engine Selector (youtube / ytmusic / soundcloud)
    currentPlatform: localStorage.getItem('synth_platform') || 'youtube',

    // Remote Control State (Spotify Connect Phone <-> PC)
    // On PC desktop browser (!isPhone), never inherit remoteClientMode from shared localStorage left by mobile simulator
    remoteClientMode: isPhone ? (localStorage.getItem('synth_remote_client_mode') === 'true') : false,
    remoteHostIp: localStorage.getItem('synth_remote_host_ip') || '',
    remoteHostPin: localStorage.getItem('synth_remote_host_pin') || '5311',
    remoteHostToken: localStorage.getItem('synth_remote_host_token') || '',
    remotePendingTrackId: null,
    remotePendingTime: 0
  };

  // =========================================================================
  // SANITIZE MOCK / FAKE / CORRUPT TRACKS
  // =========================================================================
  function isFakeMockTrack(t) {
    if (!t) return true;
    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();
    const art = (t.thumbnail || t.art || '').toLowerCase();
    if (artist === 'spotify') return true;
    if (title.includes('daily mix')) return true;
    if (title.includes('mix santai')) return true;
    if (title.includes('sleep call bareng niki')) return true;
    if (title.includes('aura farming')) return true;
    if (art.includes('ray_dailymix') || art.includes('rec_niki') || art.includes('rec_aura')) return true;
    return false;
  }

  function isCorruptTrack(t) {
    if (!t || typeof t !== 'object') return true;
    const title = (t.title || '').trim().toLowerCase();
    const artist = (t.artist || '').trim().toLowerCase();
    const art = (t.thumbnail || t.art || '').toLowerCase();
    if (!title || title === 'untitled' || title === 'untitled track' || title === 'pilih lagu untuk memutar') return true;
    if (!artist || artist === 'unknown artist' || artist === 'undefined' || artist === 'synth 2') return true;
    if (art.includes('open.sp') || art.includes('undefined') || art.includes('null')) return true;
    return isFakeMockTrack(t);
  }

  function sanitizeList(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(t => !isCorruptTrack(t));
  }

  // Purge any stored fake or corrupted tracks immediately from state & localStorage
  state.favorites = sanitizeList(state.favorites);
  state.history = sanitizeList(state.history);
  state.recommendations = sanitizeList(state.recommendations);
  state.playlists = (state.playlists || []).map(pl => ({
    ...pl,
    tracks: sanitizeList(pl.tracks || [])
  }));
  localStorage.setItem('synth_history', JSON.stringify(state.history));
  localStorage.setItem('devsize_history', JSON.stringify(state.history));
  localStorage.setItem('synth_liked_songs', JSON.stringify(state.favorites));
  localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
  localStorage.setItem('synth_playlists', JSON.stringify(state.playlists));
  localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));

  // Purge any recommendations that the user has already heard or liked
  if (state.recommendations.length > 0) {
    const heardBootKeys = new Set([
      ...(state.history || []).map(t => (t.id || t.title || '').toLowerCase()),
      ...(state.favorites || []).map(t => (t.id || t.title || '').toLowerCase())
    ]);
    state.recommendations = state.recommendations.filter(t => {
      const k = (t.id || t.title || '').toLowerCase();
      return !heardBootKeys.has(k);
    });
    localStorage.setItem('synth_recommendations', JSON.stringify(state.recommendations));
  }

  // =========================================================================
  // DUAL-DECK WEB AUDIO DSP ENGINE (DECK A/B, PRESETS, EQUALIZER, CROSSFADE)
  // =========================================================================
  function getEffectiveApiBase() {
    return isNativeAndroid ? 'http://127.0.0.1:38472' : '';
  }

  function getTrackArtwork(t) {
    if (!t) return 'assets/radio_thumb.png';
    let art = t.thumbnail || t.art || t.coverUrl || '';
    if (typeof art === 'string' && art.startsWith('//')) {
      art = 'https:' + art;
    }
    const id = t.id || '';
    if ((!art || art === 'assets/radio_thumb.png' || !art.startsWith('http')) && id && /^[\w-]{11}$/.test(id)) {
      art = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    return art || 'assets/radio_thumb.png';
  }

  function handleArtworkImgError(img, trackId) {
    if (!img) return;
    const tid = trackId || img.dataset.trackId || '';
    if (tid && /^[\w-]{11}$/.test(tid) && img.dataset.triedYt !== '1') {
      img.dataset.triedYt = '1';
      img.src = `https://i.ytimg.com/vi/${tid}/hqdefault.jpg`;
      return;
    }
    img.onerror = null;
    img.src = 'assets/radio_thumb.png';
  }
  window.handleArtworkImgError = handleArtworkImgError;

  let isDraggingEq = false;
  let remoteDspThrottleTimer = null;
  let pendingRemoteDspCommand = null;

  function queueRemoteDspCommand(action, payload) {
    if (!state.remoteClientMode) return;
    pendingRemoteDspCommand = { action, payload };
    if (!remoteDspThrottleTimer) {
      sendRemoteClientCommand(action, payload);
      pendingRemoteDspCommand = null;
      remoteDspThrottleTimer = setTimeout(() => {
        remoteDspThrottleTimer = null;
        if (pendingRemoteDspCommand) {
          const p = pendingRemoteDspCommand;
          pendingRemoteDspCommand = null;
          sendRemoteClientCommand(p.action, p.payload);
        }
      }, 50);
    }
  }

  // Evaluates whether an audio duration represents a 28-33s preview clip.
  // Returns true if duration is 28-33s AND expected duration is unknown (0, null, NaN, undefined) OR > 45s.
  // Explicitly preserves legitimate short songs (e.g. expectedDur === 30).
  function isAudioPreviewClip(actualDur, expectedDuration) {
    if (typeof actualDur !== 'number' || isNaN(actualDur) || !isFinite(actualDur)) {
      return false;
    }
    const isPreviewWindow = actualDur >= 28 && actualDur <= 33;
    if (!isPreviewWindow) return false;
    const num = Number(expectedDuration);
    const isUnknown = !expectedDuration || isNaN(num) || num <= 0;
    return num > 45 || isUnknown;
  }

  const audioDeckA = document.getElementById('native-audio') || new Audio();
  const audioDeckB = document.getElementById('native-audio-b') || new Audio();
  audioDeckA.preload = 'auto';
  audioDeckB.preload = 'auto';
  audioDeckA.crossOrigin = 'anonymous';
  audioDeckB.crossOrigin = 'anonymous';

  let activeDeck = audioDeckA;
  let inactiveDeck = audioDeckB;
  let isCrossfading = false;
  let isCrossfadePaused = false;
  let crossfadeTimerId = null;
  let crossfadeOutgoingDeck = null;
  let crossfadeIncomingDeck = null;
  let crossfadeEndTime = 0;
  let crossfadeRemainingMs = 0;

  // Precomputed 64-point Equal-Power Crossfade curves (cos^2 + sin^2 = 1.0, 0 dB loss)
  const CROSSFADE_CURVE_SIZE = 64;
  const EQUAL_POWER_FADE_OUT = new Float32Array(CROSSFADE_CURVE_SIZE);
  const EQUAL_POWER_FADE_IN = new Float32Array(CROSSFADE_CURVE_SIZE);

  (function initEqualPowerCurves() {
    const halfPi = 0.5 * Math.PI;
    for (let i = 0; i < CROSSFADE_CURVE_SIZE; i++) {
      const t = i / (CROSSFADE_CURVE_SIZE - 1);
      const angle = t * halfPi;
      EQUAL_POWER_FADE_OUT[i] = Math.cos(angle);
      EQUAL_POWER_FADE_IN[i] = Math.sin(angle);
    }
    // Guarantee exact boundary values
    EQUAL_POWER_FADE_OUT[0] = 1.0;
    EQUAL_POWER_FADE_OUT[CROSSFADE_CURVE_SIZE - 1] = 0.0;
    EQUAL_POWER_FADE_IN[0] = 0.0;
    EQUAL_POWER_FADE_IN[CROSSFADE_CURVE_SIZE - 1] = 1.0;
  })();

  // =========================================================================
  // DUAL-DECK CROSSFADE STATE MACHINE HELPERS
  // =========================================================================

  /**
   * Normal finalization when crossfade timer naturally completes.
   */
  function finalizeCrossfade() {
    if (crossfadeTimerId) {
      clearTimeout(crossfadeTimerId);
      crossfadeTimerId = null;
    }
    const outgoing = crossfadeOutgoingDeck;
    const incoming = crossfadeIncomingDeck;

    if (incoming) {
      activeDeck = incoming;
      inactiveDeck = outgoing || ((incoming === audioDeckA) ? audioDeckB : audioDeckA);
    }

    const gainOut = (outgoing === audioDeckA) ? gainDeckA : gainDeckB;
    const gainIn = (incoming === audioDeckA) ? gainDeckA : gainDeckB;

    if (audioCtx && gainOut && gainIn) {
      const now = audioCtx.currentTime;
      gainOut.gain.cancelScheduledValues(now);
      gainIn.gain.cancelScheduledValues(now);
      gainOut.gain.setValueAtTime(0.0, now);
      gainIn.gain.setValueAtTime(1.0, now);
    }

    isCrossfading = false;
    isCrossfadePaused = false;
    crossfadeOutgoingDeck = null;
    crossfadeIncomingDeck = null;
    crossfadeRemainingMs = 0;

    if (outgoing) {
      outgoing.pause();
      outgoing.currentTime = 0;
    }
    setTimeout(preloadNextTrack, 400);
  }

  /**
   * Aborts or cancels active crossfade on track change, track skip, seek, pause, or error.
   * Preserves target deck at full volume (1.0) and silences the drop deck (0.0).
   */
  function cancelActiveCrossfade(targetActiveDeck = null) {
    if (crossfadeTimerId) {
      clearTimeout(crossfadeTimerId);
      crossfadeTimerId = null;
    }
    if (!isCrossfading && !isCrossfadePaused && !crossfadeOutgoingDeck) return;

    const outgoing = crossfadeOutgoingDeck;
    const incoming = crossfadeIncomingDeck;
    const keepDeck = targetActiveDeck || incoming || activeDeck;
    const dropDeck = (keepDeck === audioDeckA) ? audioDeckB : audioDeckA;

    if (dropDeck) {
      dropDeck.pause();
      dropDeck.currentTime = 0;
    }

    const gainKeep = (keepDeck === audioDeckA) ? gainDeckA : gainDeckB;
    const gainDrop = (dropDeck === audioDeckA) ? gainDeckA : gainDeckB;

    if (audioCtx && gainKeep && gainDrop) {
      const now = audioCtx.currentTime;
      gainKeep.gain.cancelScheduledValues(now);
      gainDrop.gain.cancelScheduledValues(now);
      gainKeep.gain.setValueAtTime(1.0, now);
      gainDrop.gain.setValueAtTime(0.0, now);
    }

    activeDeck = keepDeck;
    inactiveDeck = dropDeck;
    isCrossfading = false;
    isCrossfadePaused = false;
    crossfadeOutgoingDeck = null;
    crossfadeIncomingDeck = null;
    crossfadeRemainingMs = 0;
  }
  const cancelCrossfade = cancelActiveCrossfade;

  /**
   * Pauses both decks synchronously during an active crossfade and captures remaining time.
   */
  function pauseBothDecksDuringCrossfade() {
    if (crossfadeTimerId) {
      clearTimeout(crossfadeTimerId);
      crossfadeTimerId = null;
    }
    isCrossfadePaused = true;
    crossfadeRemainingMs = Math.max(200, crossfadeEndTime - Date.now());

    audioDeckA.pause();
    audioDeckB.pause();

    if (audioCtx && gainDeckA && gainDeckB) {
      const now = audioCtx.currentTime;
      gainDeckA.gain.cancelScheduledValues(now);
      gainDeckB.gain.cancelScheduledValues(now);
    }
  }

  /**
   * Resumes both decks synchronously from mid-crossfade pause and reschedules gain ramps.
   */
  async function resumeBothDecksDuringCrossfade() {
    if (!isCrossfadePaused) return;
    isCrossfadePaused = false;
    const remainingSec = Math.max(0.2, crossfadeRemainingMs / 1000);
    crossfadeEndTime = Date.now() + (remainingSec * 1000);

    const outgoing = crossfadeOutgoingDeck;
    const incoming = crossfadeIncomingDeck;
    const gainOut = (outgoing === audioDeckA) ? gainDeckA : gainDeckB;
    const gainIn = (incoming === audioDeckA) ? gainDeckA : gainDeckB;

    if (audioCtx && gainOut && gainIn) {
      const now = audioCtx.currentTime;
      gainOut.gain.cancelScheduledValues(now);
      gainIn.gain.cancelScheduledValues(now);

      if (typeof gainOut.gain.setValueCurveAtTime === 'function' && typeof gainIn.gain.setValueCurveAtTime === 'function') {
        gainOut.gain.setValueCurveAtTime(EQUAL_POWER_FADE_OUT, now, remainingSec);
        gainIn.gain.setValueCurveAtTime(EQUAL_POWER_FADE_IN, now, remainingSec);
      } else {
        const curOut = gainOut.gain.value;
        const curIn = gainIn.gain.value;
        gainOut.gain.setValueAtTime(curOut, now);
        gainOut.gain.linearRampToValueAtTime(0.0, now + remainingSec);
        gainIn.gain.setValueAtTime(curIn, now);
        gainIn.gain.linearRampToValueAtTime(1.0, now + remainingSec);
      }
    }

    crossfadeTimerId = setTimeout(() => {
      finalizeCrossfade();
    }, remainingSec * 1000);

    try {
      await Promise.all([
        outgoing ? outgoing.play().catch(() => {}) : Promise.resolve(),
        incoming ? incoming.play().catch(() => {}) : Promise.resolve()
      ]);
    } catch (_) {}
  }

  // Event listener registry for audioEl Proxy to support removeEventListener & dual-deck isolation
  const proxyListenerMap = new Map();

  // Dynamic Audio Element Proxy targeting activeDeck transparently for 100% backward compatibility
  const audioEl = new Proxy(audioDeckA, {
    get(target, prop) {
      if (prop === '__deckA') return audioDeckA;
      if (prop === '__deckB') return audioDeckB;
      if (prop === '__activeDeck') return activeDeck;
      if (prop === 'paused') {
        if (isCrossfadePaused) return true;
        return activeDeck.paused;
      }
      if (prop === 'pause') {
        return function () {
          if (isCrossfading || isCrossfadePaused) {
            pauseBothDecksDuringCrossfade();
          } else {
            activeDeck.pause();
          }
        };
      }
      if (prop === 'play') {
        return function () {
          if (isCrossfadePaused && isCrossfading) {
            return resumeBothDecksDuringCrossfade();
          }
          return activeDeck.play();
        };
      }
      if (prop === 'addEventListener') {
        return function (event, handler, options) {
          if (typeof handler !== 'function' && (!handler || typeof handler.handleEvent !== 'function')) {
            return;
          }
          const useCapture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
          const isOnce = Boolean(options && typeof options === 'object' && options.once);

          let eventMap = proxyListenerMap.get(handler);
          if (!eventMap) {
            eventMap = new Map();
            proxyListenerMap.set(handler, eventMap);
          }
          let list = eventMap.get(event);
          if (!list) {
            list = [];
            eventMap.set(event, list);
          }

          const existing = list.find(item => item.capture === useCapture);
          if (existing) return;

          const invokeHandler = (e) => {
            if (typeof handler === 'function') {
              handler.call(audioEl, e);
            } else if (handler && typeof handler.handleEvent === 'function') {
              handler.handleEvent(e);
            }
          };

          const cleanupOnce = () => {
            if (isOnce) {
              audioEl.removeEventListener(event, handler, options);
            }
          };

          const wrapA = (e) => {
            // Guard: Only the currently active deck emits events through the proxy
            if (activeDeck !== audioDeckA) return;
            cleanupOnce();
            invokeHandler(e);
          };

          const wrapB = (e) => {
            // Guard: Only the currently active deck emits events through the proxy
            if (activeDeck !== audioDeckB) return;
            cleanupOnce();
            invokeHandler(e);
          };

          const entry = { wrapA, wrapB, capture: useCapture, options };
          list.push(entry);

          audioDeckA.addEventListener(event, wrapA, options);
          audioDeckB.addEventListener(event, wrapB, options);
        };
      }

      if (prop === 'removeEventListener') {
        return function (event, handler, options) {
          if (!handler) return;
          const useCapture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
          const eventMap = proxyListenerMap.get(handler);
          if (!eventMap) return;
          const list = eventMap.get(event);
          if (!list) return;

          const idx = list.findIndex(item => item.capture === useCapture);
          if (idx !== -1) {
            const entry = list[idx];
            audioDeckA.removeEventListener(event, entry.wrapA, options);
            audioDeckB.removeEventListener(event, entry.wrapB, options);
            list.splice(idx, 1);
            if (list.length === 0) {
              eventMap.delete(event);
            }
            if (eventMap.size === 0) {
              proxyListenerMap.delete(handler);
            }
          }
        };
      }

      const val = activeDeck[prop];
      if (typeof val === 'function') {
        return val.bind(activeDeck);
      }
      return val;
    },
    set(target, prop, value) {
      if (prop === 'currentTime') {
        if (isCrossfading || isCrossfadePaused) {
          cancelActiveCrossfade(crossfadeIncomingDeck || activeDeck);
        }
        activeDeck.currentTime = value;
        return true;
      }
      activeDeck[prop] = value;
      return true;
    }
  });

  audioEl.volume = state.isMuted ? 0 : state.volume;
  audioEl.preload = 'auto';
  let hlsInstance = null;
  let activeLoadToken = 0;

  // Web Audio Context & Graph Nodes
  let audioCtx = null;
  let sourceDeckA = null;
  let sourceDeckB = null;
  let gainDeckA = null;
  let gainDeckB = null;
  let dspBus = null;

  // 3-band tone filters: Bass (200Hz), Mid (1kHz), Treble (4kHz) (-12dB to +12dB)
  let eqLow = null;    // 200 Hz lowshelf
  let eqMid = null;    // 1000 Hz peaking (Q=0.9)
  let eqHigh = null;   // 4000 Hz highshelf

  // 10-band graphic equalizer: 32Hz to 16kHz peaking filters, Q=1.1, -12dB to +12dB
  const EQ_BAND_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  let eqBands = [];

  // Effects bus: Dry, Reverb, Echo / Delay, Distortion
  let dryGain = null;
  let convolverNode = null;
  let reverbGain = null;
  let delayNode = null;
  let delayFeedback = null;
  let delayGain = null;
  let distortionNode = null;
  let distortionGain = null;
  let masterGain = null;
  let analyserNode = null;
  let isAudioGraphInitialized = false;

  // Crossfade configuration (0 to 12s, stored in localStorage.getItem('synth_crossfade'))
  let crossfadeDuration = 0;
  try {
    const savedXf = localStorage.getItem('synth_crossfade');
    if (savedXf !== null) {
      crossfadeDuration = Math.max(0, Math.min(12, parseInt(savedXf, 10) || 0));
    }
  } catch (_) {}

  // 4 Presets definition (F1)
  const AUDIO_PRESETS = {
    p_default: {
      id: 'p_default',
      name: 'Default',
      speed: 1.0,
      speedPitch: 1.0,
      pitch: 0,
      playbackRate: 1.0,
      preservesPitch: true,
      reverb: 0,
      distortion: 0,
      echo: 0,
      volumeGain: 1.0,
      toneBass: 0,
      toneMid: 0,
      toneTreble: 0,
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    p_slowed: {
      id: 'p_slowed',
      name: 'Slowed + Reverb',
      speed: 1.0,
      speedPitch: 0.82,
      pitch: 0,
      playbackRate: 0.82,
      preservesPitch: false, // Tape pitch drop
      reverb: 65,            // 65% reverb
      distortion: 0,
      echo: 15,              // 15% echo
      volumeGain: 1.0,
      toneBass: 2.0,
      toneMid: -1.0,
      toneTreble: -2.0,
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    p_nightcore: {
      id: 'p_nightcore',
      name: 'Speed Up / Nightcore',
      speed: 1.0,
      speedPitch: 1.35,
      pitch: 0,
      playbackRate: 1.35,
      preservesPitch: false, // Tape pitch rise (Nightcore chipmunk)
      reverb: 20,            // 20% reverb
      distortion: 0,
      echo: 0,
      volumeGain: 1.0,
      toneBass: 1.0,
      toneMid: 0.5,
      toneTreble: 2.5,
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    p_bassboost: {
      id: 'p_bassboost',
      name: 'Bass Boost',
      speed: 1.0,
      speedPitch: 1.0,
      pitch: 0,
      playbackRate: 1.0,
      preservesPitch: true,
      reverb: 0,
      distortion: 0,
      echo: 0,
      volumeGain: 1.0,
      toneBass: 8.5, // +8.5dB low shelf 200Hz
      toneMid: -1.5,
      toneTreble: 1.0,
      bands: [9.0, 8.5, 6.0, 0, 0, 0, 0, 0, 0, 0] // +9dB 32Hz, +8.5dB 64Hz, +6dB 125Hz
    }
  };

  let currentActivePresetId = 'p_default';
  let currentDSPDeltas = {
    speed: 1.0,
    speedPitch: 1.0,
    pitch: 0,
    playbackRate: 1.0,
    reverb: 0,
    distortion: 0,
    echo: 0,
    volumeGain: 1.0,
    toneBass: 0,
    toneMid: 0,
    toneTreble: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  function makeDistortionCurve(amount = 0) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = amount * 2.5;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      if (k <= 0) {
        curve[i] = x;
      } else {
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
      }
    }
    return curve;
  }

  function createReverbImpulse(ctx) {
    const rate = ctx.sampleRate || 44100;
    const len = Math.floor(rate * 0.6);
    const impulse = ctx.createBuffer(2, len, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < len; i++) {
      const decay = Math.exp(-i / (rate * 0.15));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    return impulse;
  }

  function initWebAudioGraph() {
    if (isAudioGraphInitialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      audioCtx = new AudioContextClass({ latencyHint: 'playback' });

      audioDeckA.crossOrigin = 'anonymous';
      audioDeckB.crossOrigin = 'anonymous';

      sourceDeckA = audioCtx.createMediaElementSource(audioDeckA);
      sourceDeckB = audioCtx.createMediaElementSource(audioDeckB);

      gainDeckA = audioCtx.createGain();
      gainDeckB = audioCtx.createGain();
      gainDeckA.gain.value = 1.0;
      gainDeckB.gain.value = 0.0;

      sourceDeckA.connect(gainDeckA);
      sourceDeckB.connect(gainDeckB);

      dspBus = audioCtx.createGain();
      gainDeckA.connect(dspBus);
      gainDeckB.connect(dspBus);

      // 3-Band Tone Controls: Bass (200Hz), Mid (1kHz), Treble (4kHz)
      eqLow = audioCtx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 200;
      eqLow.gain.value = currentDSPDeltas.toneBass;

      eqMid = audioCtx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 0.9;
      eqMid.gain.value = currentDSPDeltas.toneMid;

      eqHigh = audioCtx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 4000;
      eqHigh.gain.value = currentDSPDeltas.toneTreble;

      dspBus.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      // 10-Band Graphic EQ (peaking filters, Q=1.1, -12 to +12 dB)
      eqBands = EQ_BAND_FREQUENCIES.map((freq, idx) => {
        const band = audioCtx.createBiquadFilter();
        band.type = 'peaking';
        band.frequency.value = freq;
        band.Q.value = 1.1;
        band.gain.value = currentDSPDeltas.bands[idx] || 0;
        return band;
      });

      eqHigh.connect(eqBands[0]);
      for (let i = 0; i < eqBands.length - 1; i++) {
        eqBands[i].connect(eqBands[i + 1]);
      }
      const lastEqNode = eqBands[eqBands.length - 1];

      // Master Gain & Analyser
      masterGain = audioCtx.createGain();
      masterGain.gain.value = state.isMuted ? 0 : state.volume;

      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.8;

      masterGain.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);

      // Dry Gain Path
      dryGain = audioCtx.createGain();
      dryGain.gain.value = 1.0;
      lastEqNode.connect(dryGain);
      dryGain.connect(masterGain);

      // Reverb Path (Convolver + Reverb Gain)
      convolverNode = audioCtx.createConvolver();
      convolverNode.buffer = createReverbImpulse(audioCtx);
      reverbGain = audioCtx.createGain();
      reverbGain.gain.value = (currentDSPDeltas.reverb / 100) * 0.95;
      lastEqNode.connect(convolverNode);
      convolverNode.connect(reverbGain);
      reverbGain.connect(masterGain);

      // Echo / Delay Path
      delayNode = audioCtx.createDelay(1.0);
      delayNode.delayTime.value = 0.3;
      delayFeedback = audioCtx.createGain();
      delayFeedback.gain.value = 0.35;
      delayGain = audioCtx.createGain();
      delayGain.gain.value = ((currentDSPDeltas.echo || 0) / 100) * 0.75;

      lastEqNode.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayGain);
      delayGain.connect(masterGain);

      // Distortion Path (WaveShaper + Gain)
      distortionNode = audioCtx.createWaveShaper();
      distortionNode.oversample = 'none';
      distortionNode.curve = makeDistortionCurve(currentDSPDeltas.distortion || 0);
      distortionGain = audioCtx.createGain();
      distortionGain.gain.value = 0.0;
      lastEqNode.connect(distortionNode);
      distortionNode.connect(distortionGain);
      distortionGain.connect(masterGain);

      isAudioGraphInitialized = true;
      if (audioCtx) {
        audioCtx.onstatechange = () => {
          if (audioCtx.state === 'suspended' && state.isPlaying) {
            console.warn('[WebAudio] AudioContext auto-suspended by browser while playing. Auto-resuming...');
            audioCtx.resume().catch(() => {});
          }
        };
      }
    } catch (e) {
      console.warn('[WebAudio] Graph initialization error:', e);
    }
  }

  function ensureAudioContextRunning() {
    if (!audioCtx) {
      initWebAudioGraph();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((err) => {
        console.warn('[WebAudio] AudioContext resume error:', err);
      });
    }

    // Always guarantee the active deck's gain node is at full volume (1.0) and drop deck is (0.0)
    const gainActive = (activeDeck === audioDeckA) ? gainDeckA : gainDeckB;
    const gainDrop = (activeDeck === audioDeckA) ? gainDeckB : gainDeckA;
    if (audioCtx && gainActive && gainDrop && !isCrossfading && !isCrossfadePaused) {
      const now = audioCtx.currentTime;
      gainActive.gain.cancelScheduledValues(now);
      gainActive.gain.setValueAtTime(1.0, now);
      gainDrop.gain.cancelScheduledValues(now);
      gainDrop.gain.setValueAtTime(0.0, now);
    }
    return Promise.resolve();
  }

  // Smooth 400ms polynomial parameter tweening: k * k * (3 - 2 * k)
  let activePresetTweenRaf = null;
  function tweenDSPParameters(from, to, durationMs, onApply) {
    if (activePresetTweenRaf) cancelAnimationFrame(activePresetTweenRaf);
    const t0 = performance.now();

    function step(now) {
      const k = Math.min(1, (now - t0) / durationMs);
      const e = k * k * (3 - 2 * k);

      const cur = {
        speed: (from.speed || 1.0) + ((to.speed || 1.0) - (from.speed || 1.0)) * e,
        speedPitch: (from.speedPitch || 1.0) + ((to.speedPitch || 1.0) - (from.speedPitch || 1.0)) * e,
        pitch: Math.round((from.pitch || 0) + ((to.pitch || 0) - (from.pitch || 0)) * e),
        playbackRate: from.playbackRate + (to.playbackRate - from.playbackRate) * e,
        reverb: from.reverb + (to.reverb - from.reverb) * e,
        distortion: (from.distortion || 0) + ((to.distortion || 0) - (from.distortion || 0)) * e,
        echo: from.echo + (to.echo - from.echo) * e,
        volumeGain: (from.volumeGain || 1.0) + ((to.volumeGain || 1.0) - (from.volumeGain || 1.0)) * e,
        toneBass: from.toneBass + (to.toneBass - from.toneBass) * e,
        toneMid: from.toneMid + (to.toneMid - from.toneMid) * e,
        toneTreble: from.toneTreble + (to.toneTreble - from.toneTreble) * e,
        bands: to.bands.map((val, i) => from.bands[i] + (val - from.bands[i]) * e)
      };

      onApply(cur);

      if (k < 1) {
        activePresetTweenRaf = requestAnimationFrame(step);
      } else {
        activePresetTweenRaf = null;
      }
    }

    activePresetTweenRaf = requestAnimationFrame(step);
  }

  function applyDSPParameters(params, preservesPitch = true) {
    currentDSPDeltas = { ...currentDSPDeltas, ...params };

    const speed = (params.speed !== undefined) ? params.speed : 1.0;
    const speedPitch = (params.speedPitch !== undefined) ? params.speedPitch : 1.0;
    const pitch = (params.pitch !== undefined) ? params.pitch : 0;
    const hasTapePitch = (speedPitch !== 1.0 || pitch !== 0);
    const pitchMultiplier = Math.pow(2, pitch / 12);
    const effectiveRate = hasTapePitch 
      ? (speedPitch * pitchMultiplier) 
      : ((params.speed !== undefined && params.speed !== 1.0) ? params.speed : (params.playbackRate !== undefined ? params.playbackRate : speed));
    const effectivePitchMode = (preservesPitch !== undefined && !hasTapePitch) ? preservesPitch : !hasTapePitch;

    [audioDeckA, audioDeckB].forEach((deck) => {
      if (!deck) return;
      deck.preservesPitch = effectivePitchMode;
      deck.mozPreservesPitch = effectivePitchMode;
      deck.webkitPreservesPitch = effectivePitchMode;
      deck.playbackRate = Math.max(0.25, Math.min(4.0, effectiveRate));
    });

    if (audioEl) {
      try {
        audioEl.preservesPitch = effectivePitchMode;
        audioEl.playbackRate = Math.max(0.25, Math.min(4.0, effectiveRate));
      } catch (_) {}
    }

    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    if (eqLow) eqLow.gain.setValueAtTime(params.toneBass || 0, now);
    if (eqMid) eqMid.gain.setValueAtTime(params.toneMid || 0, now);
    if (eqHigh) eqHigh.gain.setValueAtTime(params.toneTreble || 0, now);

    if (eqBands && eqBands.length === 10) {
      for (let i = 0; i < 10; i++) {
        const bGain = (params.bands && params.bands[i] !== undefined) ? params.bands[i] : (currentDSPDeltas.bands ? currentDSPDeltas.bands[i] : 0);
        eqBands[i].gain.setValueAtTime(bGain || 0, now);
      }
    }

    if (reverbGain) {
      reverbGain.gain.setValueAtTime(((params.reverb || 0) / 100) * 0.95, now);
    }
    if (delayGain) {
      delayGain.gain.setValueAtTime(((params.echo || 0) / 100) * 0.75, now);
    }
    if (distortionNode && distortionGain) {
      const dist = params.distortion || 0;
      if (dist > 0) {
        distortionNode.curve = makeDistortionCurve(dist);
        distortionGain.gain.setValueAtTime((dist / 100) * 0.75, now);
      } else {
        distortionGain.gain.setValueAtTime(0.0, now);
      }
    }
    if (dryGain) {
      const dist = params.distortion || 0;
      const wetness = Math.max((params.reverb || 0) / 100, (params.echo || 0) / 100, dist / 100);
      const dry = Math.max(0.3, 1.0 - wetness * 0.45);
      dryGain.gain.setValueAtTime(dry, now);
    }
    if (masterGain) {
      const volGain = (params.volumeGain !== undefined) ? params.volumeGain : 1.0;
      const baseVol = state.isMuted ? 0 : state.volume;
      masterGain.gain.setValueAtTime(baseVol * volGain, now);
    }

    if (state.remoteClientMode) {
      queueRemoteDspCommand('setAudioDsp', { dsp: currentDSPDeltas, preservesPitch });
    }
  }

  function setPreset(presetId) {
    const target = AUDIO_PRESETS[presetId] || AUDIO_PRESETS.p_default;
    currentActivePresetId = target.id;
    ensureAudioContextRunning();

    const from = { ...currentDSPDeltas };
    const to = {
      speed: target.speed,
      speedPitch: target.speedPitch,
      pitch: target.pitch,
      playbackRate: target.playbackRate,
      reverb: target.reverb,
      distortion: target.distortion || 0,
      echo: target.echo,
      volumeGain: target.volumeGain || 1.0,
      toneBass: target.toneBass,
      toneMid: target.toneMid,
      toneTreble: target.toneTreble,
      bands: [...target.bands]
    };

    tweenDSPParameters(from, to, 400, (cur) => {
      applyDSPParameters(cur, target.preservesPitch);
      syncEqualizerSlidersToDSP(cur);
    });

    updatePresetChipsUI(target.id);
    if (state.remoteClientMode) {
      sendRemoteClientCommand('setPreset', { presetId: target.id });
    }
  }

  function setTone(bassGain, midGain, trebleGain) {
    ensureAudioContextRunning();
    currentDSPDeltas.toneBass = Math.max(-12, Math.min(12, parseFloat(bassGain) || 0));
    currentDSPDeltas.toneMid = Math.max(-12, Math.min(12, parseFloat(midGain) || 0));
    currentDSPDeltas.toneTreble = Math.max(-12, Math.min(12, parseFloat(trebleGain) || 0));

    if (audioCtx) {
      const now = audioCtx.currentTime;
      if (eqLow) eqLow.gain.setValueAtTime(currentDSPDeltas.toneBass, now);
      if (eqMid) eqMid.gain.setValueAtTime(currentDSPDeltas.toneMid, now);
      if (eqHigh) eqHigh.gain.setValueAtTime(currentDSPDeltas.toneTreble, now);
    }
    syncEqualizerSlidersToDSP(currentDSPDeltas);
    if (state.remoteClientMode) {
      queueRemoteDspCommand('setTone', {
        bass: currentDSPDeltas.toneBass,
        mid: currentDSPDeltas.toneMid,
        treble: currentDSPDeltas.toneTreble
      });
    }
  }

  function setBandGain(index, gainDb) {
    if (index < 0 || index >= 10) return;
    ensureAudioContextRunning();
    const val = Math.max(-12, Math.min(12, parseFloat(gainDb) || 0));
    currentDSPDeltas.bands[index] = val;

    if (audioCtx && eqBands[index]) {
      eqBands[index].gain.setValueAtTime(val, audioCtx.currentTime);
    }
    syncEqualizerSlidersToDSP(currentDSPDeltas);
    if (state.remoteClientMode) {
      queueRemoteDspCommand('setBandGain', { index, gain: val });
    }
  }

  function resetEqualizer() {
    ensureAudioContextRunning();
    currentDSPDeltas.toneBass = 0;
    currentDSPDeltas.toneMid = 0;
    currentDSPDeltas.toneTreble = 0;
    currentDSPDeltas.bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    if (audioCtx) {
      const now = audioCtx.currentTime;
      if (eqLow) eqLow.gain.setValueAtTime(0, now);
      if (eqMid) eqMid.gain.setValueAtTime(0, now);
      if (eqHigh) eqHigh.gain.setValueAtTime(0, now);
      if (eqBands) {
        for (let i = 0; i < 10; i++) {
          if (eqBands[i]) eqBands[i].gain.setValueAtTime(0, now);
        }
      }
    }
    syncEqualizerSlidersToDSP(currentDSPDeltas);
    if (state.remoteClientMode) {
      sendRemoteClientCommand('resetEqualizer');
    }
  }

  function setCrossfadeDuration(seconds) {
    crossfadeDuration = Math.max(0, Math.min(12, parseInt(seconds, 10) || 0));
    try {
      localStorage.setItem('synth_crossfade', String(crossfadeDuration));
    } catch (_) {}
    updateCrossfadeUI();
    if (state.remoteClientMode) {
      sendRemoteClientCommand('setCrossfade', { duration: crossfadeDuration });
    }
  }

  // Track pending track for add-to-playlist modal
  let trackToAddToPlaylist = null;

  // =========================================================================
  // DOM REFERENCES
  // =========================================================================
  const mainView = document.getElementById('main-view');
  const mainContentScroll = document.getElementById('main-content-scroll');
  const ambientGlow = document.getElementById('ambient-glow-header');

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Views
  const homeView = document.getElementById('home-view-wrapper');
  const searchView = document.getElementById('search-view-wrapper');
  const likedSongsView = document.getElementById('liked-songs-view');
  const playlistDetailView = document.getElementById('playlist-detail-view');
  const albumDetailView = document.getElementById('album-detail-view');
  const artistView = document.getElementById('artist-view');
  const lyricsView = document.getElementById('lyrics-view');
  const queueDrawer = document.getElementById('queue-drawer');

  // Top Nav
  const btnNavBack = document.getElementById('btn-nav-back');
  const btnNavForward = document.getElementById('btn-nav-forward');
  const btnHome = document.getElementById('btn-home');
  const searchInput = document.getElementById('search-input');
  const searchBoxPill = document.getElementById('search-box-pill');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const btnTopCreatePl = document.getElementById('btn-top-create-pl');
  const searchBrowseBtn = document.getElementById('search-browse-btn');
  const btnTopDownload = document.getElementById('btn-top-download');

  // Search Elements (Real Synth Architecture)
  const searchLoadingBar = document.getElementById('search-loading-bar');
  const searchIdleState = document.getElementById('search-idle-state');
  const searchArtistContainer = document.getElementById('search-artist-container');
  const searchAlbumsContainer = document.getElementById('search-albums-container');
  const searchTracksContainer = document.getElementById('search-tracks-container');
  const searchTracksHeader = document.getElementById('search-tracks-header');
  const searchTracksList = document.getElementById('search-tracks-list');

  // Home Filters & Containers
  const filterChips = document.querySelectorAll('.filter-chip');
  const qcLikedSongs = document.getElementById('qc-liked-songs');
  const qcLikedCount = document.getElementById('qc-liked-count');
  const qcLikedPlayBtn = document.getElementById('qc-liked-play-btn');
  const quickPlaylistsContainer = document.getElementById('quick-playlists-container');
  const recentPlayedContainer = document.getElementById('recent-played-container');
  const recommendationsContainer = document.getElementById('recommendations-container');
  const btnRefreshRecs = document.getElementById('btn-refresh-recs');
  const synthTracksContainer = document.getElementById('synth-tracks-container');
  const synthTrackCount = document.getElementById('synth-track-count');
  const userPlaylistsContainer = document.getElementById('user-playlists-container');
  const sectionUserPlaylists = document.getElementById('section-user-playlists');
  const btnCreatePlBanner = document.getElementById('btn-create-pl-banner');

  // Player Bar
  const trackArt = document.getElementById('current-track-art');
  const trackTitle = document.getElementById('current-track-title');
  const trackArtist = document.getElementById('current-track-artist');
  const nowPlayingEq = document.getElementById('now-playing-equalizer');
  const btnLike = document.getElementById('btn-like-track');
  const heartEmpty = btnLike?.querySelector('.heart-empty');
  const heartFilled = btnLike?.querySelector('.heart-filled');
  const btnPlayerAddPl = document.getElementById('btn-player-add-pl');
  const btnPlayerAddPlControls = document.getElementById('btn-player-add-pl-controls');
  const btnPlayerConnect = document.getElementById('btn-player-connect');
  const btnDesktopConnect = document.getElementById('btn-desktop-connect');
  const modalSpotifyConnect = document.getElementById('modal-spotify-connect');
  const btnCloseConnectModal = document.getElementById('btn-close-connect-modal');
  const btnSpConnectAction = document.getElementById('btn-sp-connect-action');
  const spConnectStatusPill = document.getElementById('sp-connect-status-pill');

  // Spotify Connect Tabs & Panes
  const tabBtnRemoteHost = document.getElementById('tab-btn-remote-host');
  const tabBtnRemoteClient = document.getElementById('tab-btn-remote-client');
  const tabBtnRemoteSpotify = document.getElementById('tab-btn-remote-spotify');
  const paneRemoteHost = document.getElementById('pane-remote-host');
  const paneRemoteClient = document.getElementById('pane-remote-client');
  const paneRemoteSpotify = document.getElementById('pane-remote-spotify');

  // Host QR & URL elements
  const spRemoteQrImg = document.getElementById('sp-remote-qr-img');
  const spRemoteQrLoading = document.getElementById('sp-remote-qr-loading');
  const spRemoteUrlText = document.getElementById('sp-remote-url-text');
  const btnCopyRemoteUrl = document.getElementById('btn-copy-remote-url');
  const spRemotePinText = document.getElementById('sp-remote-pin-text');
  const spRemoteClientsCount = document.getElementById('sp-remote-clients-count');

  // Client Phone Form elements
  const inputSpRemoteIp = document.getElementById('input-sp-remote-ip');
  const inputSpRemotePin = document.getElementById('input-sp-remote-pin');
  const btnSpRemoteConnect = document.getElementById('btn-sp-remote-connect');
  const btnSpRemoteDisconnect = document.getElementById('btn-sp-remote-disconnect');
  const spRemoteClientStatus = document.getElementById('sp-remote-client-status');

  // Remote connection state handles
  let lastRemoteBroadcastTime = 0;
  let clientSse = null;
  let hostPcEventSource = null;

  const btnShuffle = document.getElementById('btn-shuffle');
  const btnPrev = document.getElementById('btn-prev');
  const btnMainPlay = document.getElementById('btn-main-play');
  const playPauseIcon = document.getElementById('play-pause-icon');
  const btnNext = document.getElementById('btn-next');
  const btnRepeat = document.getElementById('btn-repeat');

  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  const timelineWrap = document.getElementById('timeline-wrap');
  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');
  const timelineTooltip = document.getElementById('timeline-tooltip');

  // Global Timeline Seeking & Dragging State Locks (Prevents playhead snapback & race conditions)
  let isDraggingTimeline = false;
  let isDraggingMobTimeline = false;
  let isSeekingPending = false;
  let pendingSeekTime = null;
  let seekLockTimeoutId = null;

  const btnToggleLyrics = document.getElementById('btn-toggle-lyrics');
  const btnToggleQueue = document.getElementById('btn-toggle-queue');
  const btnVolumeIcon = document.getElementById('btn-volume-icon');
  const volumeIconSvg = document.getElementById('volume-icon-svg');
  const volumeWrap = document.getElementById('volume-wrap');
  const volumeFill = document.getElementById('volume-fill');
  const volumeThumb = document.getElementById('volume-thumb');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  // Queue Drawer
  const btnCloseQueue = document.getElementById('btn-close-queue');
  const btnClearQueue = document.getElementById('btn-clear-queue');
  const qNowArt = document.getElementById('q-now-art');
  const qNowTitle = document.getElementById('q-now-title');
  const qNowArtist = document.getElementById('q-now-artist');
  const queueItemsList = document.getElementById('queue-items-list');

  // Expanded Player / Lyrics Elements
  const btnCollapseLyrics = document.getElementById('btn-collapse-lyrics');
  const lyricsLargeArt = document.getElementById('lyrics-large-art');
  const lyricsHeaderTitle = document.getElementById('lyrics-header-title');
  const lyricsHeaderArtist = document.getElementById('lyrics-header-artist');
  const lyricsScrollBox = document.getElementById('lyrics-scroll-box');
  const lyricsLinesContainer = document.getElementById('lyrics-lines-container');
  const btnLyricsLike = document.getElementById('btn-lyrics-like');
  const lyricsHeartEmpty = btnLyricsLike?.querySelector('.heart-empty');
  const lyricsHeartFilled = btnLyricsLike?.querySelector('.heart-filled');
  const btnLyricsAddPl = document.getElementById('btn-lyrics-add-pl');

  // Mobile Fullscreen Media Player Elements (Pin #1 & Pin #2)
  const mobFullscreenPlayer = document.getElementById('mobile-fullscreen-player');
  const btnMobPlayerClose = document.getElementById('btn-mob-player-close');
  const mobPlayerSubtitle = document.getElementById('mob-player-header-subtitle');
  const mobPlayerArt = document.getElementById('mob-player-art');
  const mobPlayerTitle = document.getElementById('mob-player-title');
  const mobPlayerArtist = document.getElementById('mob-player-artist');
  const mobPlayerSnippet = document.getElementById('mob-player-lyric-snippet');
  const mobPlayerSnippetText = document.getElementById('mob-player-snippet-text');
  const btnMobPlayerAdd = document.getElementById('btn-mob-player-add');
  const mobTimelineWrap = document.getElementById('mob-timeline-wrap');
  const mobTimelineFill = document.getElementById('mob-timeline-fill');
  const mobTimelineThumb = document.getElementById('mob-timeline-thumb');
  const mobTimeCurrent = document.getElementById('mob-time-current');
  const mobTimeDuration = document.getElementById('mob-time-duration');
  const btnMobShuffle = document.getElementById('btn-mob-shuffle');
  const btnMobPrev = document.getElementById('btn-mob-prev');
  const btnMobPlay = document.getElementById('btn-mob-play');
  const mobPlayIcon = document.getElementById('mob-play-icon');
  const mobPauseIcon = document.getElementById('mob-pause-icon');
  const btnMobNext = document.getElementById('btn-mob-next');
  const btnMobRepeat = document.getElementById('btn-mob-repeat');
  const btnMobConnect = document.getElementById('btn-mob-connect');
  const btnMobQueue = document.getElementById('btn-mob-queue');
  const mobPlayerLyricsCard = document.getElementById('mob-player-lyrics-card');
  const mobPreviewLine1 = document.getElementById('mob-preview-line-1');

  // Liked Songs Page
  const likedCountLabel = document.getElementById('liked-count-label');
  const btnPlayAllLiked = document.getElementById('btn-play-all-liked');
  const likedTracksTbody = document.getElementById('liked-tracks-tbody');

  // Playlist Detail Page
  const plDetailCoverImg = document.getElementById('pl-detail-cover-img');
  const plDetailTitle = document.getElementById('pl-detail-title');
  const plDetailDesc = document.getElementById('pl-detail-desc');
  const plDetailCount = document.getElementById('pl-detail-count');
  const btnPlayCustomPl = document.getElementById('btn-play-custom-pl');
  const btnDeleteCustomPl = document.getElementById('btn-delete-custom-pl');
  const plDetailTbody = document.getElementById('pl-detail-tbody');

  // Artist Page
  const artistBackdrop = document.getElementById('artist-backdrop');
  const artistName = document.getElementById('artist-name');
  const artistListeners = document.getElementById('artist-listeners');
  const btnPlayArtistTop = document.getElementById('btn-play-artist-top');
  const btnArtistFollow = document.getElementById('btn-artist-follow');
  const artistTopTracks = document.getElementById('artist-top-tracks');
  const artistBioText = document.getElementById('artist-bio-text');

  // Modals & Toast
  const modalCreatePlaylist = document.getElementById('modal-create-playlist');
  const btnCloseCreatePlModal = document.getElementById('btn-close-create-pl-modal');
  const btnCancelCreatePl = document.getElementById('btn-cancel-create-pl');
  const btnConfirmCreatePl = document.getElementById('btn-confirm-create-pl');
  const inputNewPlName = document.getElementById('input-new-pl-name');
  const inputNewPlDesc = document.getElementById('input-new-pl-desc');

  const modalAddToPl = document.getElementById('modal-add-to-pl');
  const btnCloseAddPlModal = document.getElementById('btn-close-add-pl-modal');
  const btnModalCreateNewPl = document.getElementById('btn-modal-create-new-pl');
  const modalPlList = document.getElementById('modal-pl-list');
  const toast = document.getElementById('toast-notification');

  // Electron Window Controls
  const btnWinMin = document.getElementById('btn-win-min');
  const btnWinMax = document.getElementById('btn-win-max');
  const btnWinClose = document.getElementById('btn-win-close');

  if (window.electronAPI && window.electronAPI.isElectron) {
    btnWinMin?.addEventListener('click', () => window.electronAPI.minimizeWindow());
    btnWinMax?.addEventListener('click', () => window.electronAPI.maximizeWindow());
    btnWinClose?.addEventListener('click', () => window.electronAPI.closeWindow());
  } else {
    if (btnWinMin) btnWinMin.style.display = 'none';
    if (btnWinClose) btnWinClose.style.display = 'none';
    btnWinMax?.addEventListener('click', toggleFullscreen);
  }

  // =========================================================================
  // TOAST NOTIFICATION
  // =========================================================================
  let toastTimer = null;
  function showToast(message, isSuccess = false, autoHideMs = 2800) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast-notification show ${isSuccess === true ? 'success' : ''}`;
    toast.style.display = 'flex';

    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    if (autoHideMs && autoHideMs > 0) {
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.style.display = 'none'; }, 250);
      }, autoHideMs);
    }
  }

  function hideToast() {
    if (!toast) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toast.classList.remove('show');
    setTimeout(() => { toast.style.display = 'none'; }, 250);
  }

  // =========================================================================
  // TIME FORMATTER
  // =========================================================================
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // =========================================================================
  // NAVIGATION STACK (< and >)
  // =========================================================================
  function navigate(viewName, data = null, pushToStack = true) {
    if (pushToStack) {
      // Truncate any forward history
      state.historyStack = state.historyStack.slice(0, state.historyIndex + 1);
      state.historyStack.push({ view: viewName, data });
      state.historyIndex = state.historyStack.length - 1;
    }

    updateNavButtons();

    // Hide all view wrappers
    const views = [homeView, searchView, likedSongsView, playlistDetailView, albumDetailView, artistView, lyricsView];
    views.forEach(v => { if (v) v.style.display = 'none'; });

    state.currentView = viewName;
    document.body.dataset.view = viewName;
    document.body.setAttribute('data-view', viewName);
    btnToggleLyrics?.classList.toggle('active', viewName === 'lyrics');

    if (viewName === 'lyrics') {
      if (typeof acquireLyricsWakeLock === 'function') acquireLyricsWakeLock();
    } else {
      if (typeof releaseLyricsWakeLock === 'function') releaseLyricsWakeLock();
    }

    // Update mobile bottom nav active tab
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      const v = btn.dataset.view;
      if (v === 'home' && viewName === 'home') btn.classList.add('active');
      else if (v === 'search' && viewName === 'search') btn.classList.add('active');
      else if (v === 'library' && (viewName === 'liked-songs' || viewName === 'playlist-detail' || viewName === 'album-detail')) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    // Update mobile top navbar visibility based on active view
    const isMobileNav = window.innerWidth <= 768 || document.documentElement.classList.contains('is-mobile');
    const topNavbarEl = document.getElementById('top-navbar');
    const mobTopBarEl = document.getElementById('mobile-top-bar');

    if (isMobileNav) {
      if (viewName === 'home') {
        if (topNavbarEl) topNavbarEl.style.display = 'flex';
        if (mobTopBarEl) mobTopBarEl.style.display = 'flex';
        if (mainContentScroll) mainContentScroll.style.paddingTop = 'calc(52px + var(--safe-top) + 8px)';
      } else {
        if (topNavbarEl) topNavbarEl.style.display = 'none';
        if (mainContentScroll) mainContentScroll.style.paddingTop = 'calc(var(--safe-top) + 8px)';
      }
    } else {
      if (topNavbarEl) topNavbarEl.style.display = 'flex';
      if (mainContentScroll) mainContentScroll.style.paddingTop = '';
    }

    // Scroll to top and suppress main view overflow in lyrics mode
    if (mainView) {
      mainView.scrollTop = 0;
      mainView.scrollLeft = 0;
      mainView.classList.toggle('is-lyrics-active', viewName === 'lyrics');
    }

    switch (viewName) {
      case 'home':
        if (homeView) homeView.style.display = 'block';
        if (searchInput) searchInput.value = '';
        if (searchClearBtn) searchClearBtn.style.display = 'none';
        renderHomeQuickCards();
        renderRecentlyPlayed();
        renderRecommendations();
        renderUserPlaylistsSection();
        break;

      case 'search':
        if (searchView) searchView.style.display = 'block';
        if (data && data.query && searchInput) {
          searchInput.value = data.query;
          performSearch(data.query);
        } else if (!searchInput?.value.trim()) {
          if (searchIdleState) searchIdleState.style.display = 'flex';
          if (searchArtistContainer) searchArtistContainer.innerHTML = '';
          if (searchAlbumsContainer) searchAlbumsContainer.innerHTML = '';
          if (searchTracksList) searchTracksList.innerHTML = '';
          if (searchTracksHeader) searchTracksHeader.style.display = 'none';
        }
        break;

      case 'album-detail':
        if (albumDetailView) albumDetailView.style.display = 'block';
        if (data) renderAlbumDetailView(data);
        break;

      case 'liked-songs':
        if (likedSongsView) likedSongsView.style.display = 'block';
        renderLikedSongsView();
        break;

      case 'playlist-detail':
        if (playlistDetailView) playlistDetailView.style.display = 'block';
        if (data) renderPlaylistDetailView(data);
        break;

      case 'artist':
        if (artistView) artistView.style.display = 'block';
        if (data) renderArtistView(data);
        break;

      case 'lyrics':
        if (lyricsView) lyricsView.style.display = 'block';
        renderLyricsView();
        break;
    }
  }

  function updateNavButtons() {
    if (btnNavBack) btnNavBack.disabled = state.historyIndex <= 0;
    if (btnNavForward) btnNavForward.disabled = state.historyIndex >= state.historyStack.length - 1;
  }

  btnNavBack?.addEventListener('click', () => {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      const target = state.historyStack[state.historyIndex];
      navigate(target.view, target.data, false);
    }
  });

  btnNavForward?.addEventListener('click', () => {
    if (state.historyIndex < state.historyStack.length - 1) {
      state.historyIndex++;
      const target = state.historyStack[state.historyIndex];
      navigate(target.view, target.data, false);
    }
  });

  btnHome?.addEventListener('click', () => {
    navigate('home');
  });

  // Music Engine Platform Selector (YouTube / YouTube Music / SoundCloud)
  function setMusicPlatform(platform, showFeedback = true) {
    if (!platform) return;
    state.currentPlatform = platform;
    state.activePlatform = platform;
    localStorage.setItem('synth_platform', platform);

    // Sync Desktop platform buttons
    document.querySelectorAll('.platform-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.platform === platform);
    });

    // Sync Mobile Top Bar engine switcher buttons
    document.querySelectorAll('.mobile-engine-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.platform === platform);
    });

    // Sync Mobile Search platform pills
    document.querySelectorAll('.mob-platform-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.platform === platform);
    });

    // Sync Mobile engine toggle if present
    const mobileEngineName = document.getElementById('mobile-engine-name');
    const platformNames = { youtube: 'YT', ytmusic: 'YTM', soundcloud: 'SC' };
    if (mobileEngineName) {
      mobileEngineName.textContent = platformNames[platform] || 'YT';
    }

    const platformFullNames = { youtube: 'YouTube', ytmusic: 'YouTube Music', soundcloud: 'SoundCloud' };
    if (showFeedback) {
      showToast(`Mesin Musik: ${platformFullNames[platform] || platform}`, true);
    }

    // Re-run search if active in search view
    const q = (document.getElementById('mobile-search-field')?.value || searchInput?.value || '').trim();
    if (q && state.currentView === 'search') {
      performSearch(q);
    }
  }

  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setMusicPlatform(btn.dataset.platform || 'youtube', true);
    });
  });

  document.querySelectorAll('.mobile-engine-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMusicPlatform(btn.dataset.platform || 'youtube', true);
    });
  });

  setMusicPlatform(state.currentPlatform || 'youtube', false);

  // =========================================================================
  // ROBUST AUDIO PLAYBACK ENGINE (HLS, PROXY, LOCAL, ERROR AUTO-RECOVERY)
  // =========================================================================
  function updateActiveRowIndicators() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('.spotify-table-row, .spotify-track-row, .search-track-row').forEach(row => {
      const t = row && (row.__trackData || (row.dataset && row.dataset.trackId ? { id: row.dataset.trackId } : null));
      const isCurrent = Boolean(
        t && state.currentTrack && (
          (t.id && state.currentTrack.id && String(t.id) === String(state.currentTrack.id)) ||
          (t.title && state.currentTrack.title && t.title === state.currentTrack.title && t.artist === state.currentTrack.artist)
        )
      );
      if (row.classList) {
        if (isCurrent) {
          row.classList.add('playing');
          row.classList.add('is-active');
        } else {
          row.classList.remove('playing');
          row.classList.remove('is-active');
        }
      }
    });
  }

  function setPlayState(playing) {
    state.isPlaying = playing;
    if (btnMainPlay) {
      btnMainPlay.setAttribute('title', playing ? 'Jeda (Spasi)' : 'Putar (Spasi)');
      btnMainPlay.innerHTML = playing
        ? '<svg id="play-pause-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
        : '<svg id="play-pause-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
    if (mobPlayIcon && mobPauseIcon) {
      mobPlayIcon.style.display = playing ? 'none' : 'block';
      mobPauseIcon.style.display = playing ? 'block' : 'none';
    }
    if (nowPlayingEq) {
      if (playing) nowPlayingEq.classList.add('animating');
      else nowPlayingEq.classList.remove('animating');
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      } catch (e) {}
    }
    updateActiveRowIndicators();
    renderQueueDrawer();
    if (typeof syncRemoteTicker === 'function') {
      syncRemoteTicker();
    }
  }

  // =========================================================================
  // SEEK & MEDIASESSION POSITION SYNC
  // =========================================================================
  function syncMediaSessionPosition() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    try {
      const dur = (audioEl && audioEl.duration && !isNaN(audioEl.duration) && isFinite(audioEl.duration) && audioEl.duration > 0)
        ? audioEl.duration
        : (state.duration || 0);
      const pos = (audioEl && audioEl.currentTime && !isNaN(audioEl.currentTime) && isFinite(audioEl.currentTime) && audioEl.currentTime >= 0)
        ? audioEl.currentTime
        : (state.currentTime || 0);
      if (dur > 0 && pos >= 0 && pos <= dur) {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: audioEl.playbackRate || 1.0,
          position: pos
        });
      }
    } catch (e) {}
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (!track) {
        navigator.mediaSession.playbackState = 'none';
        return;
      }
      const artworkSrc = track.thumbnail || track.art || 'assets/radio_thumb.png';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Synth Track',
        artist: track.artist || 'Synth',
        album: track.album || 'Synth Spotify Edition',
        artwork: [
          { src: artworkSrc, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '128x128', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '192x192', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '256x256', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      syncMediaSessionPosition();
    } catch (e) {
      console.warn('Failed to update mediaSession metadata:', e);
    }
  }

  function seekAudio(targetTime) {
    if (!Number.isFinite(targetTime)) return;
    targetTime = Math.max(0, Math.min(targetTime, state.duration || 0));
    state.currentTime = targetTime;

    // Set asynchronous seek lock so stale timeupdate or SSE packets cannot overwrite the playhead
    isSeekingPending = true;
    pendingSeekTime = targetTime;
    if (seekLockTimeoutId) clearTimeout(seekLockTimeoutId);
    seekLockTimeoutId = setTimeout(() => {
      isSeekingPending = false;
      pendingSeekTime = null;
    }, 1200);

    if (isCrossfading || isCrossfadePaused || crossfadeTimerId) {
      cancelActiveCrossfade(crossfadeIncomingDeck || activeDeck);
    }
    if (state.remoteClientMode) {
      sendRemoteClientCommand('seek', { time: targetTime });
    } else {
      if (audioEl) {
        try {
          audioEl.currentTime = targetTime;
        } catch (e) {
          console.warn('Seek audio error:', e);
        }
        ensureAudioContextRunning();
        broadcastRemoteState(true);
      }
    }
    updateTimelineDisplay();
    updateLyricsActiveLine(targetTime);
    syncMediaSessionPosition();
  }

  function initMediaSessionActionHandlers() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        btnMainPlay?.click();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        btnMainPlay?.click();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        btnPrev?.click();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        btnNext?.click();
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          seekAudio(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        seekAudio(Math.max((audioEl.currentTime || state.currentTime || 0) - skip, 0));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skip = details.seekOffset || 10;
        seekAudio(Math.min((audioEl.currentTime || state.currentTime || 0) + skip, state.duration || 0));
      });
    } catch (e) {
      console.warn('MediaSession handler registration warning:', e);
    }
  }

  function updateTimelineDisplay() {
    timeCurrent.textContent = formatTime(state.currentTime);
    timeDuration.textContent = formatTime(state.duration);
    const pct = Math.min(100, Math.max(0, (state.currentTime / (state.duration || 1)) * 100));
    timelineFill.style.width = `${pct}%`;
    timelineThumb.style.left = `${pct}%`;
    const miniFill = document.getElementById('mini-progress-fill');
    if (miniFill) miniFill.style.width = `${pct}%`;

    // Mobile Fullscreen Player Timeline
    if (mobTimeCurrent) mobTimeCurrent.textContent = formatTime(state.currentTime);
    if (mobTimeDuration) mobTimeDuration.textContent = formatTime(state.duration);
    if (mobTimelineFill) mobTimelineFill.style.width = `${pct}%`;
    if (mobTimelineThumb) mobTimelineThumb.style.left = `${pct}%`;
  }

  function restoreLastPlayedTrack(track) {
    if (!track || isCorruptTrack(track)) return;
    if (state.remoteClientMode) return; // Prevent local track restore from stomping synced PC track
    state.currentTrack = { ...track };
    if (trackTitle) trackTitle.textContent = track.title;
    if (trackArtist) trackArtist.textContent = track.artist || 'Synth';
    const coverUrl = getTrackArtwork(track);
    if (trackArt) {
      trackArt.src = coverUrl;
      trackArt.onerror = function() { handleArtworkImgError(this, track.id); };
    }
    if (mobPlayerTitle) mobPlayerTitle.textContent = track.title;
    if (mobPlayerArtist) mobPlayerArtist.textContent = track.artist || 'Synth';
    if (mobPlayerArt) {
      mobPlayerArt.src = coverUrl;
      mobPlayerArt.onerror = function() { handleArtworkImgError(this, track.id); };
    }
    if (lyricsLargeArt) {
      lyricsLargeArt.src = coverUrl;
      lyricsLargeArt.onerror = function() { handleArtworkImgError(this, track.id); };
    }
    if (lyricsHeaderTitle) lyricsHeaderTitle.textContent = track.title;
    if (lyricsHeaderArtist) lyricsHeaderArtist.textContent = track.artist || 'Synth';

    state.currentTime = 0;
    state.duration = parseFloat(track.duration) || 240;
    updateTimelineDisplay();
    updateLikeButtonState();

    if (state.queue.length === 0) {
      state.queue = state.history.length > 0 ? [...state.history] : [track];
      state.originalQueue = [...state.queue];
      state.queueIndex = 0;
    }
    renderQueueDrawer();
  }

  function updateCurrentTrackUI(track) {
    if (!track) return;
    if (trackTitle) trackTitle.textContent = track.title;
    if (trackArtist) trackArtist.textContent = track.artist || 'Synth';
    const coverUrl = getTrackArtwork(track);
    if (trackArt) {
      trackArt.src = coverUrl;
      trackArt.onerror = function () { handleArtworkImgError(this, track.id); };
    }
    if (mobPlayerTitle) mobPlayerTitle.textContent = track.title;
    if (mobPlayerArtist) mobPlayerArtist.textContent = track.artist || 'Synth';
    if (mobPlayerArt) {
      mobPlayerArt.src = coverUrl;
      mobPlayerArt.onerror = function () { handleArtworkImgError(this, track.id); };
    }
    if (lyricsLargeArt) {
      lyricsLargeArt.src = coverUrl;
      lyricsLargeArt.onerror = function () { handleArtworkImgError(this, track.id); };
    }
    if (lyricsHeaderTitle) lyricsHeaderTitle.textContent = track.title;
    if (lyricsHeaderArtist) lyricsHeaderArtist.textContent = track.artist || 'Synth';
    updateLikeButtonState();
    updateMediaSession(track);
  }

  async function resolveStreamForTrack(track) {
    if (!track) return null;
    const apiBase = getEffectiveApiBase();

    if (track.platform === 'local' || String(track.id).startsWith('local_')) {
      return { success: true, isLocal: true, streamUrl: `${apiBase}/api/library-file?id=${encodeURIComponent(track.id)}` };
    }

    let resolvedUrl = track.url || '';
    let resolvedId = track.id || '';
    const isDirectYoutube = resolvedUrl && resolvedUrl.includes('watch?v=');
    const isDirectYtId = resolvedId && /^[a-zA-Z0-9_-]{11}$/.test(resolvedId);

    if (!isDirectYoutube && !isDirectYtId) {
      const searchQuery = track.searchQuery || `${track.artist || ''} ${track.title || ''}`.trim();
      if (searchQuery) {
        try {
          const sRes = await fetch(`${apiBase}/api/search?q=${encodeURIComponent(searchQuery)}&platform=youtube&limit=5`);
          if (sRes.ok) {
            const sData = await sRes.json();
            const items = sData.items || sData.tracks || [];
            const expectedDur = Number(track.duration) || 0;
            const validItems = items.filter((it) => {
              const d = Number(it.duration) || 0;
              if (isAudioPreviewClip(d, track.duration)) return false;
              if (expectedDur > 45 && d > 0 && d < 45) return false;
              return true;
            });

            let match = validItems.find((it) => {
              const d = Number(it.duration) || 0;
              return expectedDur > 45 && d > 45 && Math.abs(d - expectedDur) <= 20 && it.url && it.url.includes('watch?v=');
            });

            if (!match) {
              match = validItems.find((it) => it.type === 'Lagu' && it.id && it.url && it.url.includes('watch?v='));
            }
            if (!match && validItems.length > 0) {
              match = validItems.find((it) => it.id && !it.id.startsWith('pl-') && !it.id.startsWith('art-'));
            }

            if (match) {
              resolvedUrl = match.url;
              resolvedId = match.id;
            }
          }
        } catch (e) {
          console.warn('[StreamResolve] Fallback search error:', e);
        }
      }
    }

    try {
      const params = new URLSearchParams({
        id: resolvedId || track.id || '',
        url: resolvedUrl || '',
        platform: track.platform || 'youtube',
        title: track.title || '',
        artist: track.artist || '',
        duration: String(track.duration || 0),
        thumbnail: track.thumbnail || track.art || '',
        minDuration: '45'
      });

      const res = await fetch(`${apiBase}/api/stream-info?${params.toString()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[StreamResolve] Stream info fetch error:', err);
    }
    return null;
  }

  let isRecoveringTruncation = false;
  async function resolveFullStreamFallback(track) {
    if (isRecoveringTruncation || !track) return;
    isRecoveringTruncation = true;
    try {
      const apiBase = getEffectiveApiBase();
      const title = track.title || '';
      const artist = track.artist || '';
      const expectedDur = Number(track.duration) || 0;

      const fallbackQueries = [
        `${artist} ${title} audio`,
        `${artist} ${title} official audio`,
        `${artist} ${title} full song`
      ];

      let fallbackItem = null;
      for (const q of fallbackQueries) {
        try {
          const sRes = await fetch(`${apiBase}/api/search?q=${encodeURIComponent(q)}&platform=youtube&limit=5`);
          if (sRes.ok) {
            const sData = await sRes.json();
            const items = sData.items || sData.tracks || [];
            fallbackItem = items.find((it) => {
              const d = Number(it.duration) || 0;
              if (isAudioPreviewClip(d, track.duration)) return false;
              if (expectedDur > 45 && d > 0 && d < 45) return false;
              return it.id && (it.url || it.id.length === 11);
            });
            if (fallbackItem) break;
          }
        } catch (_) {}
      }

      if (fallbackItem) {
        console.log(`[StreamGuard] Recovered full song via fallback search: ${fallbackItem.title} (${fallbackItem.id})`);
        showToast(`Memulihkan audio penuh: ${track.title}`, true);
        const updated = {
          ...track,
          id: fallbackItem.id,
          url: fallbackItem.url || `https://www.youtube.com/watch?v=${fallbackItem.id}`,
          streamUrl: ''
        };
        state.currentTrack = updated;
        playTrack(updated, state.queue, 0);
      } else {
        const params = new URLSearchParams({
          id: track.id || '',
          title: track.title || '',
          artist: track.artist || '',
          duration: String(track.duration || 0),
          minDuration: '45',
          fallback: '1'
        });
        const res = await fetch(`${apiBase}/api/stream-info?${params.toString()}`);
        if (res.ok) {
          const info = await res.json();
          if (info.success && (info.proxyUrl || info.streamUrl)) {
            const streamUrl = isNativeAndroid ? info.streamUrl : (info.proxyUrl || info.streamUrl);
            audioEl.src = streamUrl;
            audioEl.play().catch((e) => console.warn('Playback error after fallback:', e));
          }
        }
      }
    } catch (err) {
      console.warn('[StreamGuard] Full stream fallback recovery error:', err);
    } finally {
      isRecoveringTruncation = false;
    }
  }

  function getNextTrackToPlay() {
    if (state.queue.length === 0) return null;
    if (state.queueIndex < state.queue.length - 1) {
      return state.queue[state.queueIndex + 1];
    } else if (state.repeatMode === 1) {
      return state.queue[0];
    }
    return null;
  }

  function advanceQueueIndex() {
    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex++;
    } else if (state.repeatMode === 1) {
      state.queueIndex = 0;
    }
  }

  // ================= NEXT-TRACK BACKGROUND PRELOADER (0ms Buffer Delay) =================
  const preloadedStreamCache = new Map();
  let preloadedNextTrack = null;
  let preloadingInProgress = false;
  let preloadDeckTrack = null;

  function getTrackCacheKey(track) {
    if (!track) return '';
    return track.id ? String(track.id) : `${track.title || ''}_${track.artist || ''}`.toLowerCase().trim();
  }

  async function preloadNextTrack() {
    if (preloadingInProgress) return;
    const nextTrack = getNextTrackToPlay();
    if (!nextTrack || isCorruptTrack(nextTrack)) {
      preloadedNextTrack = null;
      return;
    }

    const trackKey = getTrackCacheKey(nextTrack);
    if (preloadedNextTrack && getTrackCacheKey(preloadedNextTrack) === trackKey && nextTrack.streamUrl) {
      return;
    }

    preloadingInProgress = true;
    try {
      const isNativeAndroid = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
      let streamUrl = nextTrack.streamUrl || '';
      let streamInfoResult = nextTrack._streamInfoResult || null;
      let isHls = !!nextTrack._isHls;

      if (!streamUrl && preloadedStreamCache.has(trackKey)) {
        const cached = preloadedStreamCache.get(trackKey);
        if (Date.now() - cached.timestamp < 1800000) {
          streamUrl = cached.streamUrl;
          streamInfoResult = cached.streamInfoResult;
          isHls = cached.isHls;
        }
      }

      if (!streamUrl) {
        const resolved = await resolveStreamForTrack(nextTrack);
        if (resolved && (resolved.proxyUrl || resolved.streamUrl)) {
          if (resolved.isHls && window.Hls && Hls.isSupported()) {
            streamUrl = resolved.streamUrl;
            isHls = true;
          } else {
            streamUrl = isNativeAndroid ? resolved.streamUrl : (resolved.proxyUrl || resolved.streamUrl);
            isHls = false;
          }
          streamInfoResult = resolved;
          preloadedStreamCache.set(trackKey, {
            streamUrl,
            streamInfoResult,
            isHls,
            timestamp: Date.now()
          });
        }
      }

      if (streamUrl) {
        nextTrack.streamUrl = streamUrl;
        nextTrack._streamInfoResult = streamInfoResult;
        nextTrack._isHls = isHls;
        preloadedNextTrack = nextTrack;

        // If inactiveDeck is available and not in active crossfade, prime its audio buffer silently
        if (!isCrossfading && !isCrossfadePaused && inactiveDeck && (!inactiveDeck.src || !inactiveDeck.src.includes(streamUrl))) {
          try {
            inactiveDeck.pause();
            inactiveDeck.src = streamUrl;
            inactiveDeck.preload = 'auto';
            inactiveDeck.currentTime = 0;
            inactiveDeck.playbackRate = activeDeck.playbackRate || 1.0;
            inactiveDeck.preservesPitch = activeDeck.preservesPitch;
            inactiveDeck.load();
            preloadDeckTrack = nextTrack;
            console.log(`[Preload] Primed upcoming track "${nextTrack.title}" into inactive deck buffer.`);
          } catch (e) {
            console.warn('[Preload] Inactive deck buffer priming error:', e);
          }
        }
      }
    } catch (err) {
      console.warn('[Preload] Background preload failed:', err);
    } finally {
      preloadingInProgress = false;
    }
  }

  async function playTrackWithCrossfade(track, resumeTime = 0) {
    if (!track) return;
    await ensureAudioContextRunning();

    if (crossfadeDuration <= 0 || !state.isPlaying || !activeDeck.src || activeDeck.paused) {
      if (isCrossfading || isCrossfadePaused) cancelActiveCrossfade();
      return playTrack(track, state.queue, resumeTime);
    }

    if (isCrossfading || isCrossfadePaused) {
      cancelActiveCrossfade();
      return playTrack(track, state.queue, resumeTime);
    }

    isCrossfading = true;
    isCrossfadePaused = false;
    const outgoingDeck = activeDeck;
    const incomingDeck = inactiveDeck;
    crossfadeOutgoingDeck = outgoingDeck;
    crossfadeIncomingDeck = incomingDeck;
    const fadeSeconds = Math.max(1, Math.min(12, crossfadeDuration));
    const durationMs = fadeSeconds * 1000;
    crossfadeEndTime = Date.now() + durationMs;
    crossfadeRemainingMs = durationMs;

    try {
      let streamUrl = track.streamUrl || '';
      if (!streamUrl) {
        const trackKey = getTrackCacheKey(track);
        if (preloadedStreamCache.has(trackKey)) {
          const cached = preloadedStreamCache.get(trackKey);
          if (Date.now() - cached.timestamp < 1800000) {
            streamUrl = cached.streamUrl;
          }
        }
      }
      if (!streamUrl) {
        const resolved = await resolveStreamForTrack(track);
        if (resolved && (resolved.proxyUrl || resolved.streamUrl)) {
          streamUrl = isNativeAndroid ? resolved.streamUrl : (resolved.proxyUrl || resolved.streamUrl);
        }
      }

      if (!streamUrl) {
        cancelActiveCrossfade();
        return playTrack(track, state.queue, resumeTime);
      }

      incomingDeck.pause();
      incomingDeck.src = streamUrl;
      incomingDeck.currentTime = resumeTime || 0;
      incomingDeck.playbackRate = outgoingDeck.playbackRate || 1.0;
      incomingDeck.preservesPitch = outgoingDeck.preservesPitch;

      const gainOut = (outgoingDeck === audioDeckA) ? gainDeckA : gainDeckB;
      const gainIn = (incomingDeck === audioDeckA) ? gainDeckA : gainDeckB;

      if (audioCtx && gainOut && gainIn) {
        const now = audioCtx.currentTime;
        gainOut.gain.cancelScheduledValues(now);
        gainIn.gain.cancelScheduledValues(now);

        if (typeof gainOut.gain.setValueCurveAtTime === 'function' && typeof gainIn.gain.setValueCurveAtTime === 'function') {
          gainOut.gain.setValueCurveAtTime(EQUAL_POWER_FADE_OUT, now, fadeSeconds);
          gainIn.gain.setValueCurveAtTime(EQUAL_POWER_FADE_IN, now, fadeSeconds);
        } else {
          gainOut.gain.setValueAtTime(1.0, now);
          gainOut.gain.linearRampToValueAtTime(0.0, now + fadeSeconds);
          gainIn.gain.setValueAtTime(0.0, now);
          gainIn.gain.linearRampToValueAtTime(1.0, now + fadeSeconds);
        }
      }

      await incomingDeck.play();

      // Immediately designate incomingDeck as activeDeck for state and UI consistency
      activeDeck = incomingDeck;
      inactiveDeck = outgoingDeck;

      state.currentTrack = track;
      updateCurrentTrackUI(track);
      setPlayState(true);

      const startPos = (resumeTime !== null && !isNaN(resumeTime) && resumeTime > 0) ? parseFloat(resumeTime) : 0;
      state.currentTime = startPos;
      state.duration = parseFloat(track.duration) || state.duration || 240;
      updateTimelineDisplay();
      pushToHistory(track);
      renderQueueDrawer();
      fetchSyncedLyrics(track.title, track.artist);
      broadcastRemoteState(true);
      window.dispatchEvent(new CustomEvent('muriel:track', { detail: track }));

      if (crossfadeTimerId) clearTimeout(crossfadeTimerId);
      crossfadeTimerId = setTimeout(() => {
        finalizeCrossfade();
      }, durationMs);
    } catch (err) {
      console.warn('[Crossfade] playTrackWithCrossfade error:', err);
      cancelActiveCrossfade();
      playTrack(track, state.queue, resumeTime);
    }
  }

  const crossfadeToTrack = playTrackWithCrossfade;

  async function triggerNaturalTrackCrossfade() {
    if (isCrossfading || isCrossfadePaused || state.repeatMode === 2) return;
    const nextTrack = getNextTrackToPlay();
    if (!nextTrack) return;

    isCrossfading = true;
    isCrossfadePaused = false;
    const outgoingDeck = activeDeck;
    const incomingDeck = inactiveDeck;
    crossfadeOutgoingDeck = outgoingDeck;
    crossfadeIncomingDeck = incomingDeck;

    try {
      let streamUrl = nextTrack.streamUrl || '';
      if (!streamUrl) {
        const trackKey = getTrackCacheKey(nextTrack);
        if (preloadedStreamCache.has(trackKey)) {
          const cached = preloadedStreamCache.get(trackKey);
          if (Date.now() - cached.timestamp < 1800000) {
            streamUrl = cached.streamUrl;
          }
        }
      }
      if (!streamUrl) {
        const resolved = await resolveStreamForTrack(nextTrack);
        if (resolved && (resolved.proxyUrl || resolved.streamUrl)) {
          streamUrl = isNativeAndroid ? resolved.streamUrl : (resolved.proxyUrl || resolved.streamUrl);
        }
      }

      if (!streamUrl) {
        cancelActiveCrossfade();
        return;
      }

      // Re-evaluate remaining audio duration on activeDeck after async network resolution
      const actualRemaining = (outgoingDeck.duration && outgoingDeck.currentTime)
        ? Math.max(0.5, outgoingDeck.duration - outgoingDeck.currentTime)
        : (state.duration > 0 && state.currentTime > 0)
          ? Math.max(0.5, state.duration - state.currentTime)
          : crossfadeDuration;
      const effectiveFadeSeconds = Math.max(0.5, Math.min(crossfadeDuration, actualRemaining));
      const durationMs = effectiveFadeSeconds * 1000;
      crossfadeEndTime = Date.now() + durationMs;
      crossfadeRemainingMs = durationMs;

      incomingDeck.pause();
      incomingDeck.src = streamUrl;
      incomingDeck.currentTime = 0;
      incomingDeck.playbackRate = outgoingDeck.playbackRate || 1.0;
      incomingDeck.preservesPitch = outgoingDeck.preservesPitch;

      const gainOut = (outgoingDeck === audioDeckA) ? gainDeckA : gainDeckB;
      const gainIn = (incomingDeck === audioDeckA) ? gainDeckA : gainDeckB;

      if (audioCtx && gainOut && gainIn) {
        const now = audioCtx.currentTime;
        gainOut.gain.cancelScheduledValues(now);
        gainIn.gain.cancelScheduledValues(now);

        if (typeof gainOut.gain.setValueCurveAtTime === 'function' && typeof gainIn.gain.setValueCurveAtTime === 'function') {
          gainOut.gain.setValueCurveAtTime(EQUAL_POWER_FADE_OUT, now, effectiveFadeSeconds);
          gainIn.gain.setValueCurveAtTime(EQUAL_POWER_FADE_IN, now, effectiveFadeSeconds);
        } else {
          gainOut.gain.setValueAtTime(1.0, now);
          gainOut.gain.linearRampToValueAtTime(0.0, now + effectiveFadeSeconds);
          gainIn.gain.setValueAtTime(0.0, now);
          gainIn.gain.linearRampToValueAtTime(1.0, now + effectiveFadeSeconds);
        }
      }

      await incomingDeck.play();

      advanceQueueIndex();
      state.currentTrack = nextTrack;
      updateCurrentTrackUI(nextTrack);
      setPlayState(true);

      // Designate incomingDeck as activeDeck
      activeDeck = incomingDeck;
      inactiveDeck = outgoingDeck;

      state.currentTime = 0;
      state.duration = parseFloat(nextTrack.duration) || state.duration || 240;
      updateTimelineDisplay();
      pushToHistory(nextTrack);
      renderQueueDrawer();
      fetchSyncedLyrics(nextTrack.title, nextTrack.artist);
      broadcastRemoteState(true);
      window.dispatchEvent(new CustomEvent('muriel:track', { detail: nextTrack }));

      if (crossfadeTimerId) clearTimeout(crossfadeTimerId);
      crossfadeTimerId = setTimeout(() => {
        finalizeCrossfade();
      }, durationMs);
    } catch (e) {
      console.warn('[Crossfade] Natural crossfade error:', e);
      cancelActiveCrossfade();
    }
  }

  function renderGraphicEQFaders() {
    const container = document.getElementById('graphic-eq-container');
    if (!container) return;
    container.innerHTML = '';

    EQ_BAND_FREQUENCIES.forEach((freq, idx) => {
      const col = document.createElement('div');
      col.className = 'eq-fader-col';

      const gainLabel = document.createElement('div');
      gainLabel.className = 'eq-fader-gain';
      const currentGain = (currentDSPDeltas.bands && currentDSPDeltas.bands[idx] !== undefined)
        ? currentDSPDeltas.bands[idx]
        : 0;
      gainLabel.textContent = `${currentGain > 0 ? '+' : ''}${currentGain.toFixed(1)}`;
      gainLabel.id = `label-eq-band-${idx}`;

      const wrap = document.createElement('div');
      wrap.className = 'eq-fader-slider-wrap';

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'eq-fader-input';
      input.min = '-12';
      input.max = '12';
      input.step = '0.5';
      input.value = String(currentGain);
      input.id = `slider-eq-band-${idx}`;
      input.title = `${formatFreq(freq)}: ${currentGain}dB`;

      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        gainLabel.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}`;
        setBandGain(idx, val);
      });

      wrap.appendChild(input);

      const freqLabel = document.createElement('div');
      freqLabel.className = 'eq-fader-freq';
      freqLabel.textContent = formatFreq(freq);

      col.appendChild(gainLabel);
      col.appendChild(wrap);
      col.appendChild(freqLabel);
      container.appendChild(col);
    });
  }

  function formatFreq(f) {
    if (f >= 1000) return `${(f / 1000).toFixed(0)}k`;
    return `${f}Hz`;
  }

  function syncEqualizerSlidersToDSP(params) {
    if (!params) return;

    // 1. Tone controls: Low, Mid, High
    const sBass = document.getElementById('slider-tone-bass');
    const sMid = document.getElementById('slider-tone-mid');
    const sTreble = document.getElementById('slider-tone-treble');
    const lBass = document.getElementById('label-tone-bass');
    const lMid = document.getElementById('label-tone-mid');
    const lTreble = document.getElementById('label-tone-treble');

    if (sBass && lBass) {
      const bVal = params.toneBass || 0;
      sBass.value = bVal;
      lBass.textContent = `${bVal > 0 ? '+' : ''}${bVal.toFixed(1)} dB`;
    }
    if (sMid && lMid) {
      const mVal = params.toneMid || 0;
      sMid.value = mVal;
      lMid.textContent = `${mVal > 0 ? '+' : ''}${mVal.toFixed(1)} dB`;
    }
    if (sTreble && lTreble) {
      const tVal = params.toneTreble || 0;
      sTreble.value = tVal;
      lTreble.textContent = `${tVal > 0 ? '+' : ''}${tVal.toFixed(1)} dB`;
    }

    // 2. 10-Band Graphic EQ
    if (params.bands) {
      for (let i = 0; i < params.bands.length; i++) {
        const bSlider = document.getElementById(`slider-eq-band-${i}`);
        const bLabel = document.getElementById(`label-eq-band-${i}`);
        if (bSlider) bSlider.value = params.bands[i];
        if (bLabel) bLabel.textContent = `${params.bands[i] > 0 ? '+' : ''}${params.bands[i].toFixed(1)}`;
      }
    }

    // 3. Speed & Pitch Tab
    const sSpeed = document.getElementById('slider-speed');
    const lSpeed = document.getElementById('val-speed');
    if (sSpeed) {
      const spd = (params.speed !== undefined) ? params.speed : 1.0;
      sSpeed.value = spd;
      if (lSpeed) lSpeed.textContent = `${Number(spd).toFixed(2)}x`;
    }

    const sSpeedPitch = document.getElementById('slider-speed-pitch');
    const lSpeedPitch = document.getElementById('val-speed-pitch');
    if (sSpeedPitch) {
      const sp = (params.speedPitch !== undefined) ? params.speedPitch : 1.0;
      sSpeedPitch.value = sp;
      if (lSpeedPitch) lSpeedPitch.textContent = `${Number(sp).toFixed(2)}x`;
    }

    const sPitch = document.getElementById('slider-pitch');
    const lPitch = document.getElementById('val-pitch');
    if (sPitch) {
      const pt = (params.pitch !== undefined) ? params.pitch : 0;
      sPitch.value = pt;
      if (lPitch) lPitch.textContent = `${pt > 0 ? '+' : ''}${pt} st`;
    }

    const sGain = document.getElementById('slider-gain') || document.getElementById('slider-volume-gain');
    const lGain = document.getElementById('val-gain');
    if (sGain) {
      const gPct = (params.volumeGain !== undefined) ? Math.round(params.volumeGain * 100) : 100;
      sGain.value = gPct;
      if (lGain) lGain.textContent = `${gPct}%`;
    }

    // 4. Audio FX Tab
    const sRev = document.getElementById('slider-reverb');
    const lRev = document.getElementById('val-reverb');
    if (sRev) {
      const rev = (params.reverb !== undefined) ? Math.round(params.reverb) : 0;
      sRev.value = rev;
      if (lRev) lRev.textContent = `${rev}%`;
    }

    const sDist = document.getElementById('slider-distortion');
    const lDist = document.getElementById('val-distortion');
    if (sDist) {
      const dist = (params.distortion !== undefined) ? Math.round(params.distortion) : 0;
      sDist.value = dist;
      if (lDist) lDist.textContent = `${dist}%`;
    }

    const sEcho = document.getElementById('slider-echo');
    const lEcho = document.getElementById('val-echo');
    if (sEcho) {
      const ech = (params.echo !== undefined) ? Math.round(params.echo) : 0;
      sEcho.value = ech;
      if (lEcho) lEcho.textContent = `${ech}%`;
    }
  }

  function updatePresetChipsUI(presetId) {
    const chips = document.querySelectorAll('.preset-chip');
    chips.forEach((chip) => {
      const isTarget = chip.getAttribute('data-preset') === presetId;
      chip.classList.toggle('active', isTarget);
    });
  }

  function updateCrossfadeUI() {
    const lbl = document.getElementById('crossfade-duration-label');
    const slider = document.getElementById('slider-crossfade-duration');
    if (slider) slider.value = String(crossfadeDuration);
    if (lbl) {
      lbl.textContent = crossfadeDuration === 0 ? 'Mati (0s)' : `${crossfadeDuration} detik`;
    }
  }

  function switchAudioSettingsTab(targetTab = 'tempo') {
    let resolvedTab = targetTab;
    if (targetTab === 'speed-pitch' || targetTab === 'speed' || targetTab === 'pitch') resolvedTab = 'tempo';
    if (targetTab === 'audio-fx' || targetTab === 'fx') resolvedTab = 'effects';
    if (targetTab === 'enhancer') resolvedTab = 'enhance';
    if (targetTab === 'equalizer') resolvedTab = 'eq';

    const tabs = document.querySelectorAll('.audio-settings-tabs .connect-tab-btn, .audio-settings-tabs .audio-tab');
    tabs.forEach((tab) => {
      const tabKey = tab.getAttribute('data-tab') || tab.getAttribute('data-audio-tab');
      const isTarget = (tabKey === resolvedTab || tabKey === targetTab);
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    const panes = document.querySelectorAll('.audio-pane, .audio-panel');
    panes.forEach((p) => {
      p.style.display = 'none';
      p.classList.remove('active');
    });

    const activePane = document.getElementById(`pane-audio-${resolvedTab}`) ||
                       document.querySelector(`.audio-panel[data-audio-panel="${resolvedTab}"]`);
    if (activePane) {
      activePane.style.display = 'flex';
      activePane.classList.add('active');
    }
  }

  function openAudioSettingsModal(defaultTab = 'tempo') {
    const modal = document.getElementById('modal-audio-settings');
    if (!modal) return;
    try {
      ensureAudioContextRunning();
    } catch (e) {
      console.warn('ensureAudioContextRunning warning:', e);
    }
    modal.style.display = 'flex';
    renderGraphicEQFaders();
    syncEqualizerSlidersToDSP(currentDSPDeltas);
    updatePresetChipsUI(currentActivePresetId);
    updateCrossfadeUI();
    updateSleepTimerUI();
    switchAudioSettingsTab(defaultTab);
  }

  function closeAudioSettingsModal() {
    const modal = document.getElementById('modal-audio-settings');
    if (modal) modal.style.display = 'none';
  }

  let sleepTimerInterval = null;

  function updateSleepTimerUI() {
    const lbl = document.getElementById('sleep-timer-status');
    if (!lbl) return;
    if (!state.sleepTimer) {
      lbl.textContent = 'Off';
      document.querySelectorAll('.sleep-opt-btn, [data-sleep-minutes]').forEach(b => b.classList.remove('active'));
      return;
    }
    if (state.sleepTimer.mode === 'end') {
      lbl.textContent = 'End of track';
      document.querySelectorAll('.sleep-opt-btn, [data-sleep-minutes]').forEach(b => {
        b.classList.toggle('active', b.dataset.sleepMinutes === 'end');
      });
      return;
    }
    document.querySelectorAll('.sleep-opt-btn, [data-sleep-minutes]').forEach(b => {
      b.classList.toggle('active', b.dataset.sleepMinutes === String(state.sleepTimer.minutes));
    });
    const left = Math.max(0, state.sleepTimer.endsAt - Date.now());
    const mins = Math.floor(left / 60000);
    const secs = Math.floor((left % 60000) / 1000);
    lbl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function setSleepTimer(val) {
    if (sleepTimerInterval) {
      clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
    }
    if (val === 'off') {
      state.sleepTimer = null;
      updateSleepTimerUI();
      showToast('Sleep timer dinonaktifkan', true);
      return;
    }
    if (val === 'end') {
      state.sleepTimer = { mode: 'end' };
      updateSleepTimerUI();
      showToast('Sleep timer: berhenti di akhir lagu', true);
      return;
    }
    const minutes = parseInt(val, 10);
    if (isNaN(minutes) || minutes <= 0) return;
    state.sleepTimer = { mode: 'minutes', minutes, endsAt: Date.now() + minutes * 60000 };
    updateSleepTimerUI();
    showToast(`Sleep timer diatur: ${minutes} menit`, true);

    sleepTimerInterval = setInterval(() => {
      if (!state.sleepTimer || state.sleepTimer.mode !== 'minutes') return;
      if (state.sleepTimer.endsAt > Date.now()) {
        updateSleepTimerUI();
        return;
      }
      clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
      state.sleepTimer = null;
      updateSleepTimerUI();
      if (audioEl) audioEl.pause();
      showToast('Waktu tidur tercapai. Pemutaran dihentikan.', true);
    }, 1000);
  }

  function setupAudioSettingsUI() {
    const modal = document.getElementById('modal-audio-settings');
    const btnOpen = document.getElementById('btn-open-audio-settings');
    const btnClose = document.getElementById('btn-close-audio-settings');
    const nowPlayingEqBtn = document.getElementById('now-playing-equalizer');
    const btnMobEq = document.getElementById('btn-mob-eq');
    const ctxOpenEq = document.getElementById('ctx-open-eq');

    if (modal) {
      modal.addEventListener('pointerdown', (e) => {
        if (e.target && (e.target.type === 'range' || e.target.classList.contains('eq-fader-input'))) {
          isDraggingEq = true;
        }
      });
      window.addEventListener('pointerup', () => { isDraggingEq = false; });
      window.addEventListener('pointercancel', () => { isDraggingEq = false; });
    }

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', () => {
        openAudioSettingsModal('tempo');
      });
    }

    if (nowPlayingEqBtn && modal) {
      nowPlayingEqBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAudioSettingsModal('tempo');
      });
      nowPlayingEqBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAudioSettingsModal('tempo');
        }
      });
    }

    if (btnMobEq && modal) {
      btnMobEq.addEventListener('click', (e) => {
        e.stopPropagation();
        openAudioSettingsModal('tempo');
      });
    }

    if (ctxOpenEq && modal) {
      ctxOpenEq.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        openAudioSettingsModal('tempo');
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => {
        closeAudioSettingsModal();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAudioSettingsModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        closeAudioSettingsModal();
      }
    });

    // Tab navigation buttons
    const tabs = document.querySelectorAll('.audio-settings-tabs .connect-tab-btn, .audio-settings-tabs .audio-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab') || tab.getAttribute('data-audio-tab') || 'tempo';
        switchAudioSettingsTab(targetTab);
      });
    });

    // Preset chips
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const pId = chip.getAttribute('data-preset');
        setPreset(pId);
      });
    });

    // Speed & Pitch Sliders
    const sSpeed = document.getElementById('slider-speed');
    const lSpeed = document.getElementById('val-speed');
    if (sSpeed) {
      sSpeed.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseFloat(e.target.value) || 1.0;
        currentDSPDeltas.speed = val;
        currentDSPDeltas.speedPitch = 1.0;
        currentDSPDeltas.playbackRate = val;
        if (lSpeed) lSpeed.textContent = `${val.toFixed(2)}x`;
        const sSP = document.getElementById('slider-speed-pitch');
        const lSP = document.getElementById('val-speed-pitch');
        if (sSP) sSP.value = 1.0;
        if (lSP) lSP.textContent = '1.00x';
        currentActivePresetId = null;
        updatePresetChipsUI(null);
        applyDSPParameters(currentDSPDeltas, true);
      });
    }

    const sSpeedPitch = document.getElementById('slider-speed-pitch');
    const lSpeedPitch = document.getElementById('val-speed-pitch');
    if (sSpeedPitch) {
      sSpeedPitch.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseFloat(e.target.value) || 1.0;
        currentDSPDeltas.speedPitch = val;
        currentDSPDeltas.speed = 1.0;
        if (lSpeedPitch) lSpeedPitch.textContent = `${val.toFixed(2)}x`;
        const sS = document.getElementById('slider-speed');
        const lS = document.getElementById('val-speed');
        if (sS) sS.value = 1.0;
        if (lS) lS.textContent = '1.00x';
        currentActivePresetId = null;
        updatePresetChipsUI(null);
        applyDSPParameters(currentDSPDeltas, false);
      });
    }

    const sPitch = document.getElementById('slider-pitch');
    const lPitch = document.getElementById('val-pitch');
    if (sPitch) {
      sPitch.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseInt(e.target.value, 10) || 0;
        currentDSPDeltas.pitch = val;
        if (lPitch) lPitch.textContent = `${val > 0 ? '+' : ''}${val} st`;
        currentActivePresetId = null;
        updatePresetChipsUI(null);
        applyDSPParameters(currentDSPDeltas, val === 0 && currentDSPDeltas.speedPitch === 1.0);
      });
    }

    const sGain = document.getElementById('slider-gain') || document.getElementById('slider-volume-gain');
    const lGain = document.getElementById('val-gain');
    if (sGain) {
      sGain.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseInt(e.target.value, 10) || 100;
        currentDSPDeltas.volumeGain = val / 100;
        if (lGain) lGain.textContent = `${val}%`;
        applyDSPParameters(currentDSPDeltas);
      });
    }

    // Audio FX Sliders
    const sRev = document.getElementById('slider-reverb');
    const lRev = document.getElementById('val-reverb');
    if (sRev) {
      sRev.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseInt(e.target.value, 10) || 0;
        currentDSPDeltas.reverb = val;
        if (lRev) lRev.textContent = `${val}%`;
        currentActivePresetId = null;
        updatePresetChipsUI(null);
        applyDSPParameters(currentDSPDeltas);
      });
    }

    const sDist = document.getElementById('slider-distortion');
    const lDist = document.getElementById('val-distortion');
    if (sDist) {
      sDist.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseInt(e.target.value, 10) || 0;
        currentDSPDeltas.distortion = val;
        if (lDist) lDist.textContent = `${val}%`;
        currentActivePresetId = null;
        updatePresetChipsUI(null);
        applyDSPParameters(currentDSPDeltas);
      });
    }

    const sEcho = document.getElementById('slider-echo');
    const lEcho = document.getElementById('val-echo');
    if (sEcho) {
      sEcho.addEventListener('input', (e) => {
        ensureAudioContextRunning();
        const val = parseInt(e.target.value, 10) || 0;
        currentDSPDeltas.echo = val;
        if (lEcho) lEcho.textContent = `${val}%`;
        currentActivePresetId = null;
        updatePresetChipsUI(null);
        applyDSPParameters(currentDSPDeltas);
      });
    }

    // Quick Tone Sliders
    const sBass = document.getElementById('slider-tone-bass');
    const sMid = document.getElementById('slider-tone-mid');
    const sTreble = document.getElementById('slider-tone-treble');

    if (sBass) {
      sBass.addEventListener('input', (e) => {
        setTone(parseFloat(e.target.value) || 0, currentDSPDeltas.toneMid, currentDSPDeltas.toneTreble);
      });
    }
    if (sMid) {
      sMid.addEventListener('input', (e) => {
        setTone(currentDSPDeltas.toneBass, parseFloat(e.target.value) || 0, currentDSPDeltas.toneTreble);
      });
    }
    if (sTreble) {
      sTreble.addEventListener('input', (e) => {
        setTone(currentDSPDeltas.toneBass, currentDSPDeltas.toneMid, parseFloat(e.target.value) || 0);
      });
    }

    // Reset Tone EQ
    const btnResetEq = document.getElementById('btn-reset-eq');
    if (btnResetEq) {
      btnResetEq.addEventListener('click', () => {
        resetEqualizer();
        showToast('Equalizer direset ke 0 dB', true);
      });
    }

    // Reset 10-Band EQ
    const btnResetBands = document.getElementById('btn-reset-eq-bands');
    if (btnResetBands) {
      btnResetBands.addEventListener('click', () => {
        ensureAudioContextRunning();
        currentDSPDeltas.bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        if (audioCtx && eqBands) {
          const now = audioCtx.currentTime;
          for (let i = 0; i < 10; i++) {
            if (eqBands[i]) eqBands[i].gain.setValueAtTime(0, now);
          }
        }
        syncEqualizerSlidersToDSP(currentDSPDeltas);
        showToast('10-band Equalizer direset ke 0 dB', true);
        if (state.remoteClientMode) {
          sendRemoteClientCommand('resetEqualizer');
        }
      });
    }

    // Master Reset Audio Settings Button
    const btnResetAudio = document.getElementById('btn-reset-audio') || document.getElementById('btn-reset-audio-settings');
    if (btnResetAudio) {
      btnResetAudio.addEventListener('click', () => {
        ensureAudioContextRunning();
        currentActivePresetId = 'p_default';
        currentDSPDeltas = {
          speed: 1.0,
          speedPitch: 1.0,
          pitch: 0,
          playbackRate: 1.0,
          reverb: 0,
          distortion: 0,
          echo: 0,
          volumeGain: 1.0,
          toneBass: 0,
          toneMid: 0,
          toneTreble: 0,
          bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        };
        applyDSPParameters(currentDSPDeltas, true);
        syncEqualizerSlidersToDSP(currentDSPDeltas);
        updatePresetChipsUI('p_default');
        showToast('Pengaturan audio direset ke normal', true);
        if (state.remoteClientMode) {
          sendRemoteClientCommand('resetAudioSettings');
        }
      });
    }

    // Crossfade Slider
    const sliderCrossfade = document.getElementById('slider-crossfade-duration');
    if (sliderCrossfade) {
      sliderCrossfade.value = String(crossfadeDuration);
      sliderCrossfade.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) || 0;
        setCrossfadeDuration(val);
      });
    }

    // Sleep Timer Buttons
    document.querySelectorAll('.sleep-opt-btn, [data-sleep-minutes]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSleepTimer(btn.dataset.sleepMinutes);
      });
    });

    // Enhancer Controls
    const toggleHq = document.getElementById('toggle-hq-audio');
    const hqDropdown = document.getElementById('hq-engine-dropdown');
    const hqTrigger = document.getElementById('hq-engine-trigger');
    const hqMenu = document.getElementById('hq-engine-menu');
    const hqLabel = document.getElementById('hq-engine-label');
    const toggleNorm = document.getElementById('toggle-normalize');

    if (toggleHq) {
      toggleHq.addEventListener('click', () => {
        state.hqEnabled = !state.hqEnabled;
        toggleHq.classList.toggle('active', state.hqEnabled);
        showToast(state.hqEnabled ? 'High Quality Enhancer Aktif' : 'High Quality Enhancer Nonaktif', true);
      });
    }

    if (hqTrigger && hqDropdown) {
      hqTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        hqDropdown.classList.toggle('open');
      });
    }

    if (hqMenu) {
      hqMenu.querySelectorAll('.m3-dropdown-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const val = opt.getAttribute('data-value');
          if (hqLabel) hqLabel.textContent = opt.textContent;
          hqMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.toggle('selected', o === opt));
          if (hqDropdown) hqDropdown.classList.remove('open');
          showToast(`Enhancement Engine: ${opt.textContent}`, true);
        });
      });
    }

    document.addEventListener('click', () => {
      if (hqDropdown) hqDropdown.classList.remove('open');
    });

    ['vocal', 'air', 'bass'].forEach(type => {
      const s = document.getElementById(`slider-hq-${type}`);
      const l = document.getElementById(`val-hq-${type}`);
      if (s) {
        s.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10) || 0;
          if (l) l.textContent = `${v > 0 ? '+' : ''}${v}%`;
        });
      }
    });

    if (toggleNorm) {
      const isNorm = localStorage.getItem('synth_normalize') === '1';
      toggleNorm.classList.toggle('active', isNorm);
      toggleNorm.addEventListener('click', () => {
        const active = !toggleNorm.classList.contains('active');
        toggleNorm.classList.toggle('active', active);
        localStorage.setItem('synth_normalize', active ? '1' : '0');
        showToast(active ? 'Normalisasi volume diaktifkan' : 'Normalisasi volume dinonaktifkan', true);
      });
    }
  }

  let streamErrorRecoveryAttempts = 0;

  async function playTrack(track, contextQueue = null, resumeAtTime = null) {
    if (!track || isCorruptTrack(track)) return;
    if (isCrossfading || isCrossfadePaused || crossfadeTimerId) {
      cancelActiveCrossfade();
    }
    ensureAudioContextRunning();
    const loadToken = ++activeLoadToken;

    state.currentTrack = { ...track };

    // Update bottom player bar info
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist || 'Synth';
    const coverUrl = getTrackArtwork(track);
    if (trackArt) {
      trackArt.src = coverUrl;
      trackArt.onerror = function() { handleArtworkImgError(this, track.id); };
    }
    if (mobPlayerTitle) mobPlayerTitle.textContent = track.title;
    if (mobPlayerArtist) mobPlayerArtist.textContent = track.artist || 'Synth';
    if (mobPlayerArt) {
      mobPlayerArt.src = coverUrl;
      mobPlayerArt.onerror = function() { handleArtworkImgError(this, track.id); };
    }

    const startPos = (resumeAtTime !== null && !isNaN(resumeAtTime) && resumeAtTime > 0) ? parseFloat(resumeAtTime) : 0;
    state.currentTime = startPos;
    state.duration = parseFloat(track.duration) || state.duration || 240;
    updateTimelineDisplay();
    updateLikeButtonState();
    updateMediaSession(state.currentTrack);

    // Add to history
    pushToHistory(track);

    // Update queue context if provided
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
      // Find track in existing queue or append
      const idx = state.queue.findIndex(t => (t.id || t.title) === (track.id || track.title));
      if (idx !== -1) {
        state.queueIndex = idx;
      } else {
        state.queue.splice(state.queueIndex + 1, 0, track);
        state.queueIndex++;
      }
    }

    renderQueueDrawer();
    fetchSyncedLyrics(track.title, track.artist);

    // If phone is in Remote Client Mode, route playback to PC speaker instead of local audio
    if (state.remoteClientMode) {
      state.remotePendingTrackId = track.id || track.title;
      state.remotePendingTime = Date.now();
      showToast(`Memutar di Speaker PC: ${track.title}...`, true);
      sendRemoteClientCommand('playTrack', {
        track: state.currentTrack,
        queue: state.queue,
        startIndex: state.queueIndex
      });
      return;
    } else {
      // Host PC: broadcast new track state immediately so remote server updates before network resolution completes
      broadcastRemoteState(true);
    }

    showToast(`Menghubungkan: ${track.title}...`);

    // Clean up previous HLS instance
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (e) {}
      hlsInstance = null;
    }

    const isNativeAndroid = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    const isPhone = isNativeAndroid || document.documentElement.classList.contains('is-mobile') || window.innerWidth <= 768;
    // On native Android app, calls route to bridge virtual loopback (38472). In browser / preview, route to origin (relative /api/)
    const apiBase = isNativeAndroid ? 'http://127.0.0.1:38472' : '';

    let streamUrl = track.streamUrl;
    let isHls = false;
    let streamInfoResult = null;

    // Check preloaded stream cache if streamUrl is not yet set
    const trackKey = getTrackCacheKey(track);
    if (!streamUrl && preloadedStreamCache.has(trackKey)) {
      const cached = preloadedStreamCache.get(trackKey);
      if (Date.now() - cached.timestamp < 1800000) {
        streamUrl = cached.streamUrl;
        streamInfoResult = cached.streamInfoResult;
        isHls = cached.isHls;
      }
    }

    // If on native phone, convert old relative /api/stream/:id to stream resolution
    if (isNativeAndroid && streamUrl && streamUrl.includes('/api/stream/')) {
      streamUrl = '';
    }

    // 1. Check if track is a local library file
    if (!streamUrl && track.id) {
      if (track.platform === 'local' || String(track.id).startsWith('local_')) {
        streamUrl = `${apiBase}/api/library-file?id=${encodeURIComponent(track.id)}`;
      } else {
        const localMatch = (state.synthLibraryTracks || []).find(lt => String(lt.id) === String(track.id));
        if (localMatch && localMatch.streamUrl && !localMatch.streamUrl.includes('/api/stream/')) {
          streamUrl = localMatch.streamUrl;
        }
      }
    }

    // 2. If online track without a direct streamUrl, resolve via Synth search & stream pipeline
    if (!streamUrl) {
      let resolvedUrl = track.url || '';
      let resolvedId = track.id || '';

      const isDirectYoutube = resolvedUrl && resolvedUrl.includes('watch?v=');
      const isDirectYtId = resolvedId && /^[a-zA-Z0-9_-]{11}$/.test(resolvedId);

      if (!isDirectYoutube && !isDirectYtId) {
        const searchQuery = track.searchQuery || `${track.artist || ''} ${track.title || ''}`.trim();
        if (searchQuery) {
          try {
            const sRes = await fetch(`${apiBase}/api/search?q=${encodeURIComponent(searchQuery)}&platform=youtube&limit=5`);
            if (sRes.ok) {
              const sData = await sRes.json();
              const items = sData.items || sData.tracks || [];
              const expectedDur = Number(track.duration) || 0;
              const validItems = items.filter((it) => {
                const d = Number(it.duration) || 0;
                if (isAudioPreviewClip(d, track.duration)) return false; // Reject 30s preview clips
                if (expectedDur > 45 && d > 0 && d < 45) return false; // Reject teasers/shorts
                return true;
              });

              // Priority 1: match closest to expected duration
              let match = validItems.find((it) => {
                const d = Number(it.duration) || 0;
                return expectedDur > 45 && d > 45 && Math.abs(d - expectedDur) <= 20 && it.url && it.url.includes('watch?v=');
              });

              // Priority 2: Standard song match with watch?v=
              if (!match) {
                match = validItems.find((it) => it.type === 'Lagu' && it.id && it.url && it.url.includes('watch?v='));
              }
              // Priority 3: First valid item
              if (!match && validItems.length > 0) {
                match = validItems.find((it) => it.id && !it.id.startsWith('pl-') && !it.id.startsWith('art-'));
              }

              if (match) {
                resolvedUrl = match.url;
                resolvedId = match.id;
              }
            }
          } catch (e) {
            console.warn('Fallback search error:', e);
          }
        }
      }

      try {
        const params = new URLSearchParams({
          id: resolvedId || track.id || '',
          url: resolvedUrl || '',
          platform: track.platform || 'youtube',
          title: track.title || '',
          artist: track.artist || '',
          duration: String(track.duration || 0),
          thumbnail: track.thumbnail || track.art || '',
          minDuration: '45'
        });

        const res = await fetch(`${apiBase}/api/stream-info?${params.toString()}`);
        if (res.ok) {
          const info = await res.json();
          streamInfoResult = info;
          if (info.success && (info.streamUrl || info.proxyUrl)) {
            if (info.isHls && window.Hls && Hls.isSupported()) {
              streamUrl = info.streamUrl;
              isHls = true;
            } else {
              // Direct stream URL on native Android APK; on browser/simulator use proxyUrl if available for CORS-free playback
              streamUrl = isNativeAndroid ? info.streamUrl : (info.proxyUrl || info.streamUrl);
              isHls = false;
            }
          }
        }
      } catch (err) {
        console.warn('Could not resolve stream info:', err);
      }
    }

    if (loadToken !== activeLoadToken) return;

    if (!streamUrl) {
      showToast(`Gagal mendapatkan stream untuk: ${track.title}`, false);
      setPlayState(false);
      return;
    }

    // Fast path: Inactive deck is ALREADY preloaded and primed with this track's stream!
    if (!isCrossfading && !isCrossfadePaused && !isHls && startPos <= 0 && inactiveDeck && inactiveDeck.src && streamUrl && (inactiveDeck.src === streamUrl || inactiveDeck.src.includes(streamUrl))) {
      const oldActive = activeDeck;
      activeDeck = inactiveDeck;
      inactiveDeck = oldActive;
      oldActive.pause();
      oldActive.currentTime = 0;

      const gainActive = (activeDeck === audioDeckA) ? gainDeckA : gainDeckB;
      const gainDrop = (activeDeck === audioDeckA) ? gainDeckB : gainDeckA;
      if (audioCtx && gainActive && gainDrop) {
        const now = audioCtx.currentTime;
        gainActive.gain.cancelScheduledValues(now);
        gainActive.gain.setValueAtTime(1.0, now);
        gainDrop.gain.cancelScheduledValues(now);
        gainDrop.gain.setValueAtTime(0.0, now);
      }

      activeDeck.currentTime = 0;
      const playPromise = activeDeck.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (loadToken === activeLoadToken) {
            setPlayState(true);
            streamErrorRecoveryAttempts = 0;
            showToast(`Memutar: ${track.title}`, true);
          }
        }).catch(err => {
          console.warn('[Preload] Deck play notice:', err);
          audioEl.src = streamUrl;
          audioEl.play().catch(e => console.warn('Deck fallback play error:', e));
        });
      }

      preloadDeckTrack = null;
      preloadedNextTrack = null;
      window.dispatchEvent(new CustomEvent('muriel:track', { detail: track }));
      setTimeout(preloadNextTrack, 500);
      // Preload the next track in queue (N+2)
      setTimeout(preloadNextTrack, 400);
      return;
    }

    // Play with HLS or standard Audio
    try {
      audioEl.pause();
      if (isHls && window.Hls && Hls.isSupported()) {
        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
          startPosition: startPos > 0 ? startPos : -1
        });
        hlsInstance.loadSource(streamUrl);
        hlsInstance.attachMedia(audioEl);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (loadToken === activeLoadToken) {
            audioEl.play().catch(e => console.warn('HLS play error:', e));
          }
        });
        hlsInstance.on(Hls.Events.ERROR, (evt, data) => {
          if (data && data.fatal) {
            console.warn('Fatal HLS error, destroying:', data);
            try { hlsInstance.destroy(); } catch (e) {}
            hlsInstance = null;
          }
        });
      } else {
        audioEl.src = streamUrl;

        const durationCheck = () => {
          const actualDur = audioEl.duration;
          if (isAudioPreviewClip(actualDur, track.duration)) {
            console.warn(`[StreamGuard] Rejected preview clip (${actualDur.toFixed(1)}s vs expected ${track.duration || 'unknown'}s). Re-resolving full stream...`);
            showToast('Klip pratinjau 30s terdeteksi, mencari stream audio penuh...');
            audioEl.pause();
            resolveFullStreamFallback(track);
          }
        };
        audioEl.addEventListener('loadedmetadata', durationCheck, { once: true });

        if (startPos > 0) {
          const seekOnce = () => {
            audioEl.removeEventListener('loadedmetadata', seekOnce);
            audioEl.removeEventListener('canplay', seekOnce);
            try {
              if (Math.abs(audioEl.currentTime - startPos) > 1) {
                audioEl.currentTime = startPos;
              }
            } catch (e) {}
          };
          audioEl.addEventListener('loadedmetadata', seekOnce);
          audioEl.addEventListener('canplay', seekOnce);
        } else {
          audioEl.currentTime = 0;
        }

        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (loadToken === activeLoadToken) {
                setPlayState(true);
                streamErrorRecoveryAttempts = 0;
                if (startPos > 0) {
                  try {
                    if (Math.abs(audioEl.currentTime - startPos) > 1) {
                      audioEl.currentTime = startPos;
                    }
                  } catch (e) {}
                }
                showToast(`Memutar: ${track.title}`, true);
              }
            })
            .catch(err => {
              console.warn('Playback promise notice:', err.message);
              if (err.name !== 'NotAllowedError') {
                const isProxied = streamUrl && streamUrl.includes('/api/audio-proxy');
                const fallback = isProxied ? streamInfoResult?.streamUrl : streamInfoResult?.proxyUrl;
                if (fallback && fallback !== streamUrl) {
                  console.log('Trying playback fallback URL:', fallback);
                  audioEl.src = fallback;
                  if (startPos > 0) {
                    try { audioEl.currentTime = startPos; } catch (e) {}
                  }
                  audioEl.play().catch(e => console.warn('Fallback play error:', e));
                }
              }
            });
        }
      }
      window.dispatchEvent(new CustomEvent('muriel:track', { detail: track }));
      setTimeout(preloadNextTrack, 500);
    } catch (e) {
      console.warn('Playback setup error:', e);
    }
  }

  // Audio Event Listeners (Native events ensure UI is always 100% in sync with actual sound)
  audioEl.addEventListener('play', () => {
    if (state.remoteClientMode) return;
    setPlayState(true);
    broadcastRemoteState(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });
  audioEl.addEventListener('playing', () => {
    if (state.remoteClientMode) return;
    setPlayState(true);
    streamErrorRecoveryAttempts = 0;
    broadcastRemoteState(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });
  audioEl.addEventListener('pause', () => {
    if (state.remoteClientMode) return;
    setPlayState(false);
    broadcastRemoteState(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });

  audioEl.addEventListener('loadedmetadata', (e) => {
    if (state.remoteClientMode) return;
    const targetAudio = e.target || audioEl;
    const actualDur = targetAudio.duration;
    if (isAudioPreviewClip(actualDur, state.currentTrack?.duration)) {
      console.warn(`[StreamGuard] Global loadedmetadata rejected 30s preview clip (${actualDur.toFixed(1)}s vs expected ${state.currentTrack?.duration || 'unknown'}s). Re-resolving...`);
      showToast('Klip pratinjau 30s terdeteksi, mencari stream audio penuh...');
      targetAudio.pause();
      resolveFullStreamFallback(state.currentTrack);
    }
  });

  audioEl.addEventListener('timeupdate', () => {
    if (state.remoteClientMode) return;
    // Guard: Prevent stale audio decoder frames from reverting the timeline slider during seeking or dragging
    if (isDraggingTimeline || isDraggingMobTimeline || isSeekingPending || (audioEl && audioEl.seeking)) {
      return;
    }
    state.currentTime = audioEl.currentTime;
    const mediaDur = audioEl.duration;
    if (mediaDur && !isNaN(mediaDur) && isFinite(mediaDur)) {
      if (!isAudioPreviewClip(mediaDur, state.currentTrack?.duration)) {
        state.duration = mediaDur;
      }
    }
    updateTimelineDisplay();
    updateLyricsActiveLine(state.currentTime);
    broadcastRemoteState(false);
    syncMediaSessionPosition();

    // Natural Dual-Deck gapless crossfade trigger
    if (crossfadeDuration > 0 && !isCrossfading && !isCrossfadePaused && state.duration > 15 && state.currentTime > 0) {
      const remaining = state.duration - state.currentTime;
      if (remaining <= crossfadeDuration && remaining > 0.5) {
        triggerNaturalTrackCrossfade();
      }
    }
  });

  audioEl.addEventListener('seeked', () => {
    if (state.remoteClientMode) return;
    if (seekLockTimeoutId) {
      clearTimeout(seekLockTimeoutId);
      seekLockTimeoutId = null;
    }
    isSeekingPending = false;
    pendingSeekTime = null;
    if (!isDraggingTimeline && !isDraggingMobTimeline) {
      state.currentTime = audioEl.currentTime;
      updateTimelineDisplay();
      updateLyricsActiveLine(state.currentTime);
      syncMediaSessionPosition();
    }
  });

  let streamDropRecoveryAttempts = 0;

  audioEl.addEventListener('ended', (e) => {
    if (state.remoteClientMode) return;
    // Guard: Suppress ended event from outgoing deck during crossfade
    if (isCrossfading || isCrossfadePaused) {
      const srcDeck = e && (e.target || e.srcElement);
      if (srcDeck && crossfadeOutgoingDeck && srcDeck === crossfadeOutgoingDeck) {
        console.log('[Crossfade] Suppressed ended event from outgoing deck');
        return;
      }
      return;
    }
    if (isAudioPreviewClip(audioEl.currentTime, state.currentTrack?.duration)) {
      console.warn(`[StreamGuard] Track ended prematurely at ${audioEl.currentTime.toFixed(1)}s (expected ${state.currentTrack?.duration || 'unknown'}s). Re-resolving fallback stream...`);
      resolveFullStreamFallback(state.currentTrack);
      return;
    }
    // Detect premature stream disconnection (e.g. network drops > 6s before true track duration)
    if (state.duration > 15 && audioEl.currentTime > 0 && (state.duration - audioEl.currentTime) > 6) {
      if (streamDropRecoveryAttempts < 1) {
        streamDropRecoveryAttempts++;
        console.warn(`Premature stream termination at ${audioEl.currentTime.toFixed(1)}s / ${state.duration.toFixed(1)}s. Auto-resuming once...`);
        playTrack(state.currentTrack, state.queue, audioEl.currentTime);
        return;
      }
    }
    streamDropRecoveryAttempts = 0;
    if (state.repeatMode === 2) {
      // Repeat current track
      audioEl.currentTime = 0;
      audioEl.play().catch(e => console.warn('Repeat play error:', e));
    } else {
      playNextTrack();
    }
  });

  // Stall & Buffering Watchdog: auto-kickstart stream if network stalls or hangs
  let stallWatchdogTimer = null;
  audioEl.addEventListener('waiting', () => {
    if (state.remoteClientMode) return;
    if (stallWatchdogTimer) clearTimeout(stallWatchdogTimer);
    stallWatchdogTimer = setTimeout(() => {
      if (state.isPlaying && audioEl && !audioEl.paused && audioEl.readyState < 3) {
        console.warn('[StreamGuard] Audio buffer stalled for >3.5s. Kickstarting playback...');
        ensureAudioContextRunning();
        audioEl.play().catch(() => {});
      }
    }, 3500);
  });

  audioEl.addEventListener('stalled', () => {
    if (state.remoteClientMode) return;
    if (stallWatchdogTimer) clearTimeout(stallWatchdogTimer);
    stallWatchdogTimer = setTimeout(() => {
      if (state.isPlaying && audioEl && !audioEl.paused) {
        console.warn('[StreamGuard] Audio stalled network event. Attempting kickstart...');
        ensureAudioContextRunning();
        audioEl.play().catch(() => {});
      }
    }, 3500);
  });

  audioEl.addEventListener('playing', () => {
    if (state.remoteClientMode) return;
    if (stallWatchdogTimer) {
      clearTimeout(stallWatchdogTimer);
      stallWatchdogTimer = null;
    }
    streamDropRecoveryAttempts = 0;
  });

  audioEl.addEventListener('canplay', () => {
    if (state.remoteClientMode) return;
    if (stallWatchdogTimer) {
      clearTimeout(stallWatchdogTimer);
      stallWatchdogTimer = null;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isPlaying) {
      ensureAudioContextRunning();
      if (audioEl && audioEl.paused && !state.remoteClientMode) {
        audioEl.play().catch(() => {});
      }
    }
  });

  audioEl.addEventListener('error', (e) => {
    if (state.remoteClientMode) return;
    console.warn('Audio element error event:', e);
    const currentPos = (audioEl.currentTime > 0) ? audioEl.currentTime : (state.currentTime || 0);
    if (state.isPlaying && state.currentTrack && streamErrorRecoveryAttempts < 2) {
      streamErrorRecoveryAttempts++;
      console.log(`Auto-recovering audio error at ${currentPos}s (attempt ${streamErrorRecoveryAttempts})...`);
      setTimeout(() => {
        if (state.currentTrack) {
          playTrack(state.currentTrack, state.queue, currentPos);
        }
      }, 800);
      return;
    }
    streamErrorRecoveryAttempts = 0;
    showToast(`Gagal memuat format audio untuk lagu ini`);
    setPlayState(false);
  });

  // Controls: Play / Pause
  btnMainPlay?.addEventListener('click', () => {
    if (state.remoteClientMode) {
      sendRemoteClientCommand('toggle');
      return;
    }
    const currentPos = (audioEl.currentTime > 0) ? audioEl.currentTime : (state.currentTime || 0);
    if (!audioEl.src && state.currentTrack) {
      playTrack(state.currentTrack, state.queue, currentPos);
      return;
    }
    if (!audioEl.src && state.queue.length > 0 && state.queueIndex >= 0) {
      playTrack(state.queue[state.queueIndex], null, currentPos);
      return;
    }
    if (audioEl.paused) {
      audioEl.play().catch(e => {
        console.warn('Direct play error, resuming via playTrack at:', currentPos, e);
        if (state.currentTrack) playTrack(state.currentTrack, state.queue, currentPos);
      });
    } else {
      audioEl.pause();
    }
  });

  // Initialize OS Media Controls & Lock Screen Handler (Android MediaSession)
  initMediaSessionActionHandlers();

  // Controls: Next & Prev
  function playNextTrack() {
    if (state.remoteClientMode) {
      sendRemoteClientCommand('next');
      return;
    }
    if (state.queue.length === 0) return;
    if (isCrossfading || isCrossfadePaused || crossfadeTimerId) {
      cancelActiveCrossfade();
    }
    const nextTrack = getNextTrackToPlay();
    if (!nextTrack) {
      setPlayState(false);
      return;
    }
    advanceQueueIndex();
    if (crossfadeDuration > 0 && state.isPlaying) {
      playTrackWithCrossfade(nextTrack, 0);
    } else {
      playTrack(nextTrack);
    }
  }

  function playPrevTrack() {
    if (state.remoteClientMode) {
      sendRemoteClientCommand('prev');
      return;
    }
    if (isCrossfading || isCrossfadePaused || crossfadeTimerId) {
      cancelActiveCrossfade();
    }
    if (audioEl.currentTime > 3) {
      audioEl.currentTime = 0;
      return;
    }
    if (state.queueIndex > 0) {
      state.queueIndex--;
      playTrack(state.queue[state.queueIndex]);
    } else {
      audioEl.currentTime = 0;
    }
  }

  btnNext?.addEventListener('click', playNextTrack);
  btnPrev?.addEventListener('click', playPrevTrack);

  // Controls: Shuffle & Repeat
  btnShuffle?.addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    localStorage.setItem('synth_shuffle', state.isShuffle ? '1' : '0');
    btnShuffle.classList.toggle('active', state.isShuffle);
    btnMobShuffle?.classList.toggle('active', state.isShuffle);
    if (state.remoteClientMode) {
      sendRemoteClientCommand('shuffle');
      return;
    }
    if (state.isShuffle && state.queue.length > 1) {
      // Shuffle upcoming tracks in queue
      const current = state.queue[state.queueIndex];
      const remaining = state.queue.slice(state.queueIndex + 1);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      state.queue = [...state.queue.slice(0, state.queueIndex), current, ...remaining];
      renderQueueDrawer();
    }
    showToast(state.isShuffle ? 'Mode acak aktif' : 'Mode acak nonaktif');
  });

  btnRepeat?.addEventListener('click', () => {
    state.repeatMode = (state.repeatMode + 1) % 3;
    localStorage.setItem('synth_repeat', String(state.repeatMode));
    btnRepeat.classList.toggle('active', state.repeatMode > 0);
    btnMobRepeat?.classList.toggle('active', state.repeatMode > 0);
    if (state.remoteClientMode) {
      sendRemoteClientCommand('repeat');
    }
    if (state.repeatMode === 2) {
      showToast('Ulangi lagu saat ini (1)');
      btnRepeat.title = 'Ulangi Lagu Saat Ini (1)';
    } else if (state.repeatMode === 1) {
      showToast('Ulangi semua antrean');
      btnRepeat.title = 'Ulangi Semua';
    } else {
      showToast('Ulangi nonaktif');
      btnRepeat.title = 'Ulangi';
    }
  });

  // Timeline Seeking (Click & Continuous Drag)
  function updateTimelineFromPointer(e) {
    if (!timelineWrap) return;
    const rect = timelineWrap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    state.currentTime = pct * (state.duration || 1);
    updateTimelineDisplay();
  }

  timelineWrap?.addEventListener('pointerdown', (e) => {
    isDraggingTimeline = true;
    timelineWrap.classList.add('is-dragging');
    timelineWrap.setPointerCapture?.(e.pointerId);
    updateTimelineFromPointer(e);
  });

  timelineWrap?.addEventListener('pointermove', (e) => {
    const rect = timelineWrap.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const hoverPct = hoverX / rect.width;
    const hoverSec = hoverPct * (state.duration || 1);
    if (timelineTooltip) {
      timelineTooltip.textContent = formatTime(hoverSec);
      timelineTooltip.style.left = `${hoverX}px`;
    }
    if (isDraggingTimeline) {
      updateTimelineFromPointer(e);
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (isDraggingTimeline) {
      updateTimelineFromPointer(e);
    }
  });

  const stopTimelineDrag = () => {
    if (isDraggingTimeline) {
      isDraggingTimeline = false;
      timelineWrap?.classList.remove('is-dragging');
      seekAudio(state.currentTime);
    }
  };

  window.addEventListener('pointerup', stopTimelineDrag);
  window.addEventListener('pointercancel', stopTimelineDrag);

  // Volume Control (Click & Continuous Drag)
  let isDraggingVolume = false;

  function updateVolumeFromPointer(e) {
    if (!volumeWrap) return;
    const rect = volumeWrap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    setVolume(pct, false);
  }

  function updateVolumeVisuals(effectiveVol) {
    const pct = Math.round(Math.max(0, Math.min(1, effectiveVol)) * 100);
    if (volumeFill) volumeFill.style.width = `${pct}%`;
    if (volumeThumb) volumeThumb.style.left = `${pct}%`;

    const mobVolFill = document.getElementById('mob-volume-bar-fill');
    const mobVolThumb = document.getElementById('mob-volume-thumb');
    if (mobVolFill) mobVolFill.style.width = `${pct}%`;
    if (mobVolThumb) mobVolThumb.style.left = `${pct}%`;

    if (volumeIconSvg) {
      if (effectiveVol === 0) {
        volumeIconSvg.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
      } else if (effectiveVol < 0.5) {
        volumeIconSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
      } else {
        volumeIconSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
      }
    }
  }

  function setVolume(val, muted = false) {
    state.volume = Math.max(0, Math.min(1, val));
    state.isMuted = muted;
    localStorage.setItem('synth_volume', state.volume.toFixed(2));
    localStorage.setItem('synth_muted', state.isMuted ? '1' : '0');

    const effectiveVol = state.isMuted ? 0 : state.volume;
    if (state.remoteClientMode) {
      sendRemoteClientCommand('volume', { value: effectiveVol });
    } else {
      audioEl.volume = effectiveVol;
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(effectiveVol, audioCtx.currentTime);
      }
      broadcastRemoteState(false);
    }

    updateVolumeVisuals(effectiveVol);
  }

  btnVolumeIcon?.addEventListener('click', () => {
    setVolume(state.volume, !state.isMuted);
  });

  volumeWrap?.addEventListener('pointerdown', (e) => {
    isDraggingVolume = true;
    volumeWrap.classList.add('is-dragging');
    volumeWrap.setPointerCapture?.(e.pointerId);
    updateVolumeFromPointer(e);
  });

  window.addEventListener('pointermove', (e) => {
    if (isDraggingVolume) {
      updateVolumeFromPointer(e);
    }
  });

  const stopVolumeDrag = () => {
    if (isDraggingVolume) {
      isDraggingVolume = false;
      volumeWrap?.classList.remove('is-dragging');
    }
  };

  window.addEventListener('pointerup', stopVolumeDrag);
  window.addEventListener('pointercancel', stopVolumeDrag);

  // Mobile Volume Slider Controls
  const mobVolSliderWrap = document.getElementById('mob-volume-slider-wrap');
  const btnMobVolDown = document.getElementById('btn-mob-vol-down');
  const btnMobVolUp = document.getElementById('btn-mob-vol-up');
  let isDraggingMobVolume = false;

  function updateMobVolumeFromPointer(e) {
    if (!mobVolSliderWrap) return;
    const rect = mobVolSliderWrap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    setVolume(pct, false);
  }

  mobVolSliderWrap?.addEventListener('pointerdown', (e) => {
    isDraggingMobVolume = true;
    mobVolSliderWrap.setPointerCapture?.(e.pointerId);
    updateMobVolumeFromPointer(e);
  });

  window.addEventListener('pointermove', (e) => {
    if (isDraggingMobVolume) {
      updateMobVolumeFromPointer(e);
    }
  });

  const stopMobVolumeDrag = () => {
    if (isDraggingMobVolume) {
      isDraggingMobVolume = false;
    }
  };

  window.addEventListener('pointerup', stopMobVolumeDrag);
  window.addEventListener('pointercancel', stopMobVolumeDrag);

  btnMobVolDown?.addEventListener('click', (e) => {
    e.stopPropagation();
    setVolume(Math.max(0, state.volume - 0.1), false);
  });

  btnMobVolUp?.addEventListener('click', (e) => {
    e.stopPropagation();
    setVolume(Math.min(1, state.volume + 0.1), false);
  });

  setVolume(state.volume, state.isMuted);

  // =========================================================================
  // QUEUE DRAWER
  // =========================================================================
  function toggleQueueDrawer() {
    if (!queueDrawer) return;
    const isShowing = queueDrawer.style.display !== 'none' && queueDrawer.style.display !== '';
    queueDrawer.style.display = isShowing ? 'none' : 'flex';
    btnToggleQueue?.classList.toggle('active', !isShowing);
    btnMobQueue?.classList.toggle('active', !isShowing);
    if (!isShowing) {
      renderQueueDrawer();
    }
  }

  function clearQueue() {
    if (state.currentTrack) {
      state.queue = [state.currentTrack];
      state.queueIndex = 0;
    } else if (state.queue.length > 0 && state.queueIndex >= 0) {
      state.queue = [state.queue[state.queueIndex]];
      state.queueIndex = 0;
    } else {
      state.queue = [];
      state.queueIndex = -1;
    }
    renderQueueDrawer();
    showToast('Antrean berhasil dikosongkan');
  }

  function populateUpcomingQueue(currentTrack, baseQueue = null) {
    if (Array.isArray(baseQueue) && baseQueue.length > 1) {
      return [...baseQueue];
    }
    const pool = (Array.isArray(state.synthLibraryTracks) && state.synthLibraryTracks.length > 0)
      ? state.synthLibraryTracks
      : (Array.isArray(state.history) && state.history.length > 0
          ? state.history
          : (Array.isArray(state.favorites) && state.favorites.length > 0
              ? state.favorites
              : []));
    const upcomingPool = pool.filter(t => (t.id || t.title) !== (currentTrack.id || currentTrack.title)).slice(0, 20);
    return [currentTrack, ...upcomingPool];
  }

  window.toggleQueueDrawer = toggleQueueDrawer;
  window.clearQueue = clearQueue;
  window.populateUpcomingQueue = populateUpcomingQueue;

  btnToggleQueue?.addEventListener('click', toggleQueueDrawer);

  btnCloseQueue?.addEventListener('click', () => {
    queueDrawer.style.display = 'none';
    btnToggleQueue?.classList.remove('active');
    btnMobQueue?.classList.remove('active');
  });

  btnClearQueue?.addEventListener('click', clearQueue);

  function renderQueueDrawer() {
    if (queueDrawer.style.display === 'none') return;

    if (state.currentTrack) {
      qNowArt.src = state.currentTrack.thumbnail || state.currentTrack.art || 'assets/radio_thumb.png';
      qNowTitle.textContent = state.currentTrack.title || '-';
      qNowArtist.textContent = state.currentTrack.artist || '-';
    }

    queueItemsList.innerHTML = '';
    const upcoming = state.queue.slice(state.queueIndex + 1);

    if (upcoming.length === 0) {
      queueItemsList.innerHTML = '<p class="queue-empty-text">Antrean kosong. Tidak ada lagu berikutnya dalam antrean.</p>';
      return;
    }

    upcoming.forEach((t, i) => {
      const realIndex = state.queueIndex + 1 + i;
      const row = document.createElement('div');
      row.className = 'queue-item-row';
      row.innerHTML = `
        <div class="queue-item-left">
          <img class="queue-item-art" src="${escapeHtml(getTrackArtwork(t))}" alt="${escapeHtml(t.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(t.id || '')}')">
          <div style="overflow: hidden;">
            <div class="queue-item-title">${t.title}</div>
            <div class="queue-item-artist">${t.artist || 'Synth'}</div>
          </div>
        </div>
        <button class="queue-item-remove" title="Hapus dari antrean">✕</button>
      `;

      row.querySelector('.queue-item-left')?.addEventListener('click', () => {
        state.queueIndex = realIndex;
        playTrack(state.queue[realIndex]);
      });

      row.querySelector('.queue-item-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.queue.splice(realIndex, 1);
        renderQueueDrawer();
        showToast(`Dihapus dari antrean: ${t.title}`);
      });

      queueItemsList.appendChild(row);
    });
  }

  // =========================================================================
  // SYNCHRONIZED LYRICS
  // =========================================================================
  // NOW PLAYING & SYNCHRONIZED LYRICS EXPANDED VIEW
  // =========================================================================
  btnToggleLyrics?.addEventListener('click', () => {
    if (state.currentView === 'lyrics') {
      navigate('home');
      btnToggleLyrics.classList.remove('active');
    } else {
      navigate('lyrics');
      btnToggleLyrics.classList.add('active');
    }
  });

  btnCollapseLyrics?.addEventListener('click', () => {
    if (state.historyStack.length > 1) {
      btnNavBack?.click();
    } else {
      navigate('home');
    }
    btnToggleLyrics?.classList.remove('active');
  });

  // =========================================================================
  // SPOTIFY MOBILE FULLSCREEN MEDIA PLAYER (PIN #1 & PIN #2)
  // =========================================================================
  function openMobilePlayer() {
    if (!mobFullscreenPlayer) return;
    if (!state.currentTrack && !state.remoteClientMode) {
      if (state.history.length > 0 && !isCorruptTrack(state.history[0])) {
        restoreLastPlayedTrack(state.history[0]);
      } else if (state.synthTracks && state.synthTracks.length > 0) {
        restoreLastPlayedTrack(state.synthTracks[0]);
      }
    }
    if (!state.currentTrack) return;
    state.isMobilePlayerOpen = true;

    // Populate data
    const t = state.currentTrack;
    const coverUrl = getTrackArtwork(t);
    if (mobPlayerArt) {
      mobPlayerArt.src = coverUrl;
      mobPlayerArt.onerror = function() { handleArtworkImgError(this, t.id); };
    }
    if (mobPlayerTitle) mobPlayerTitle.textContent = t.title || 'Judul Lagu';
    if (mobPlayerArtist) mobPlayerArtist.textContent = t.artist || 'Synth';
    if (mobPlayerSubtitle) {
      mobPlayerSubtitle.textContent = state.currentPlaylist?.name ? `Memutar dari ${state.currentPlaylist.name}` : 'Memutar Lagu';
    }

    const mobPlayerVolumeSection = document.getElementById('mob-player-volume-section');
    if (mobPlayerVolumeSection) {
      mobPlayerVolumeSection.style.display = state.remoteClientMode ? 'flex' : 'none';
    }

    // Play/Pause icon
    if (mobPlayIcon && mobPauseIcon) {
      mobPlayIcon.style.display = state.isPlaying ? 'none' : 'block';
      mobPauseIcon.style.display = state.isPlaying ? 'block' : 'none';
    }

    // Controls state
    btnMobShuffle?.classList.toggle('active', !!state.isShuffle);
    btnMobRepeat?.classList.toggle('active', state.repeatMode > 0);
    btnMobConnect?.classList.toggle('active', !!btnPlayerConnect?.classList.contains('connected'));

    // Progress
    updateTimelineDisplay();

    // Lyrics preview
    if (state.syncedLyrics && state.syncedLyrics.length > 0 && state.activeLyricIndex >= 0) {
      const txt = state.syncedLyrics[state.activeLyricIndex]?.text || '';
      if (mobPlayerSnippetText) mobPlayerSnippetText.textContent = txt;
      if (mobPreviewLine1) mobPreviewLine1.textContent = txt;
    } else {
      const info = `${t.title} • ${t.artist || 'Synth'}`;
      if (mobPlayerSnippetText) mobPlayerSnippetText.textContent = info;
      if (mobPreviewLine1) mobPreviewLine1.textContent = info;
    }

    // Open view with smooth transition
    mobFullscreenPlayer.classList.add('active');
  }

  function closeMobilePlayer() {
    if (!mobFullscreenPlayer) return;
    state.isMobilePlayerOpen = false;
    mobFullscreenPlayer.classList.remove('active');
  }

  // On desktop PC, only the album art (`trackArt`) and fullscreen button (`btnFullscreen`) open the media player.
  // On mobile, tapping the mini player bar opens the mobile fullscreen player.
  trackArt?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.currentTrack) return;
    if (window.innerWidth <= 768) {
      openMobilePlayer();
    } else {
      navigate('lyrics');
      btnToggleLyrics?.classList.add('active');
    }
  });

  const playerBarEl = document.getElementById('player-bar');
  playerBarEl?.addEventListener('click', (e) => {
    // Only in mobile view does clicking the mini-player pill open the mobile player
    if (window.innerWidth <= 768) {
      if (e.target.closest('#btn-main-play') || 
          e.target.closest('#btn-player-add-pl-controls') || 
          e.target.closest('#btn-player-connect') || 
          e.target.closest('#btn-like-track') || 
          e.target.closest('#btn-player-add-pl')) {
        return;
      }
      openMobilePlayer();
    }
    // On PC (window.innerWidth > 768): Do nothing! Clicking the bar background must NOT open the player.
  });

  // Mobile player buttons
  btnMobPlayerClose?.addEventListener('click', closeMobilePlayer);
  btnMobPlay?.addEventListener('click', () => btnMainPlay?.click());
  btnMobPrev?.addEventListener('click', () => btnPrev?.click());
  btnMobNext?.addEventListener('click', () => btnNext?.click());
  btnMobShuffle?.addEventListener('click', () => {
    btnShuffle?.click();
    btnMobShuffle?.classList.toggle('active', !!state.isShuffle);
  });
  btnMobRepeat?.addEventListener('click', () => {
    btnRepeat?.click();
    btnMobRepeat?.classList.toggle('active', state.repeatMode > 0);
  });
  btnMobPlayerAdd?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentTrack) openAddToPlaylistModal(state.currentTrack);
  });
  const btnMobPlayerMore = document.getElementById('btn-mob-player-more');
  btnMobPlayerMore?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentTrack) openAddToPlaylistModal(state.currentTrack);
  });
  btnMobConnect?.addEventListener('click', (e) => {
    e.stopPropagation();
    openConnectModal();
  });
  btnMobQueue?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleQueueDrawer();
  });
  // Swipe Gestures for Mobile Fullscreen Player (M4)
  if (mobFullscreenPlayer) {
    let touchStartY = 0;
    let touchStartX = 0;

    // 1. Swipe down on mobile player to dismiss
    mobFullscreenPlayer.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 1) return;
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    mobFullscreenPlayer.addEventListener('touchend', (e) => {
      if (e.touches && e.touches.length > 0) return;
      const touch = e.changedTouches ? e.changedTouches[0] : null;
      if (!touch) return;
      const deltaY = touch.clientY - touchStartY;
      const deltaX = Math.abs(touch.clientX - touchStartX);

      const scrollArea = mobFullscreenPlayer.querySelector('.mob-player-scroll-area');
      const isAtTop = !scrollArea || scrollArea.scrollTop <= 5;

      if (isAtTop && deltaY > 60 && deltaY > deltaX * 1.5) {
        closeMobilePlayer();
      }
    }, { passive: true });

    // 2. Swipe left/right on album artwork for next/prev
    const artWrap = mobFullscreenPlayer.querySelector('.mob-player-art-wrap');
    if (artWrap) {
      let artStartX = 0;
      let artStartY = 0;

      artWrap.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 1) return;
        artStartX = e.touches[0].clientX;
        artStartY = e.touches[0].clientY;
      }, { passive: true });

      artWrap.addEventListener('touchend', (e) => {
        const touch = e.changedTouches ? e.changedTouches[0] : null;
        if (!touch) return;
        const deltaX = touch.clientX - artStartX;
        const deltaY = Math.abs(touch.clientY - artStartY);

        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY * 1.2) {
          if (deltaX < 0) {
            btnNext?.click();
            showToast('Lagu berikutnya');
          } else {
            btnPrev?.click();
            showToast('Lagu sebelumnya');
          }
        }
      }, { passive: true });
    }
  }

  mobPlayerLyricsCard?.addEventListener('click', () => {
    closeMobilePlayer();
    navigate('lyrics');
  });

  // Mobile timeline seeking (Smooth continuous drag & single commit on release)
  if (mobTimelineWrap) {
    function handleMobSeek(e, commit = false) {
      if (!mobTimelineWrap) return;
      const rect = mobTimelineWrap.getBoundingClientRect();
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : null);
      if (clientX === null || !Number.isFinite(clientX)) return;
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
      const targetTime = pos * (state.duration || 1);
      state.currentTime = targetTime;
      updateTimelineDisplay();
      if (commit) {
        seekAudio(targetTime);
      }
    }

    mobTimelineWrap.addEventListener('mousedown', (e) => {
      isDraggingMobTimeline = true;
      handleMobSeek(e, false);
    });
    window.addEventListener('mousemove', (e) => {
      if (isDraggingMobTimeline) handleMobSeek(e, false);
    });
    window.addEventListener('mouseup', (e) => {
      if (isDraggingMobTimeline) {
        isDraggingMobTimeline = false;
        handleMobSeek(e, true);
      }
    });

    mobTimelineWrap.addEventListener('touchstart', (e) => {
      isDraggingMobTimeline = true;
      if (e.touches && e.touches[0]) handleMobSeek(e.touches[0], false);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (isDraggingMobTimeline && e.touches && e.touches[0]) handleMobSeek(e.touches[0], false);
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      if (isDraggingMobTimeline) {
        isDraggingMobTimeline = false;
        const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
        if (touch) {
          handleMobSeek(touch, true);
        } else {
          seekAudio(state.currentTime);
        }
      }
    });
    window.addEventListener('touchcancel', () => {
      if (isDraggingMobTimeline) {
        isDraggingMobTimeline = false;
      }
    });
  }

  // =========================================================================
  // ANDROID HARDWARE / GESTURE BACK BUTTON CONTROLLER
  // =========================================================================
  let lastAndroidBackPressTime = 0;
  window.handleAndroidBackButton = function() {
    // 1. Close Add to Playlist Modal if open
    if (modalAddToPl && (modalAddToPl.style.display === 'flex' || modalAddToPl.style.display === 'block')) {
      modalAddToPl.style.display = 'none';
      return true;
    }
    // 2. Close Create Playlist Modal if open
    if (modalCreatePlaylist && (modalCreatePlaylist.style.display === 'flex' || modalCreatePlaylist.style.display === 'block')) {
      modalCreatePlaylist.style.display = 'none';
      return true;
    }
    // 3. Close Spotify Connect Modal if open
    if (modalSpotifyConnect && (modalSpotifyConnect.style.display === 'flex' || modalSpotifyConnect.style.display === 'block')) {
      modalSpotifyConnect.style.display = 'none';
      return true;
    }
    // 4. Close any open generic modal
    const openModals = document.querySelectorAll('.spotify-modal-backdrop');
    for (const m of openModals) {
      if (m.style.display === 'flex' || m.style.display === 'block') {
        m.style.display = 'none';
        return true;
      }
    }
    // 5. Close Queue Drawer if open
    if (queueDrawer && (queueDrawer.style.display === 'flex' || queueDrawer.style.display === 'block')) {
      queueDrawer.style.display = 'none';
      return true;
    }
    // 6. Close Mobile Fullscreen Player if open
    if (mobFullscreenPlayer && mobFullscreenPlayer.classList.contains('active')) {
      closeMobilePlayer();
      return true;
    }
    // 7. Blur active text input if keyboard is showing
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      document.activeElement.blur();
      return true;
    }
    // 8. If in Lyrics View, return to previous view
    if (state.currentView === 'lyrics') {
      if (state.historyIndex > 0) {
        btnNavBack?.click();
      } else {
        navigate('home');
      }
      return true;
    }
    // 9. Back navigation in history stack
    if (state.historyIndex > 0) {
      btnNavBack?.click();
      return true;
    }
    // 10. If not in home view, return to home
    if (state.currentView !== 'home') {
      navigate('home');
      return true;
    }
    // 11. At Home root: double tap back within 2 seconds exits/minimizes cleanly
    const now = Date.now();
    if (now - lastAndroidBackPressTime < 2000) {
      return false; // Tells mobile-bridge.js to minimize app
    }
    lastAndroidBackPressTime = now;
    showToast('Tekan sekali lagi untuk keluar');
    return true;
  };

  // Clicking bottom player artist opens artist profile tab
  trackArtist?.addEventListener('click', (e) => {
    e.stopPropagation();
    const artist = (state.currentTrack?.artist || trackArtist.textContent || '').trim();
    if (!artist || artist === 'Synth' || artist === 'Synth 2') return;
    const primaryArtist = artist.split(/[,/]| feat\.? | ft\.? /i)[0].trim();
    navigate('artist', {
      name: primaryArtist || artist,
      thumbnail: state.currentTrack?.thumbnail || state.currentTrack?.art
    });
  });

  // Clicking artist in expanded view also opens artist profile tab
  lyricsHeaderArtist?.addEventListener('click', () => {
    const artist = (state.currentTrack?.artist || lyricsHeaderArtist.textContent || '').trim();
    if (!artist || artist === 'Synth' || artist === 'Synth 2') return;
    const primaryArtist = artist.split(/[,/]| feat\.? | ft\.? /i)[0].trim();
    navigate('artist', {
      name: primaryArtist || artist,
      thumbnail: state.currentTrack?.thumbnail || state.currentTrack?.art
    });
  });

  let activeLyricsRequestId = 0;

  async function fetchSyncedLyrics(title, artist) {
    activeLyricsRequestId++;
    const requestId = activeLyricsRequestId;

    state.syncedLyrics = [];
    state.activeLyricIndex = -1;
    if (mobPlayerSnippetText) mobPlayerSnippetText.textContent = '';
    if (mobPreviewLine1) mobPreviewLine1.textContent = '';
    if (state.currentView === 'lyrics') {
      renderLyricsView();
    } else if (lyricsLinesContainer) {
      lyricsLinesContainer.innerHTML = '<p class="lyric-line-placeholder">Mencari lirik...</p>';
    }

    if (!title) return;

    try {
      const apiBase = getEffectiveApiBase();
      const res = await fetch(`${apiBase}/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}`);
      if (!res.ok) throw new Error('Lyrics not found');
      const data = await res.json();
      if (requestId !== activeLyricsRequestId) return;
      if (!data.success || !data.lyrics) {
        if (lyricsLinesContainer) lyricsLinesContainer.innerHTML = '<p class="lyric-line-placeholder">Kami belum memiliki lirik untuk lagu ini.</p>';
        return;
      }

      const raw = data.lyrics;
      const lines = raw.split('\n');
      const parsed = [];
      const lrcRegex = /\[(\d+):(\d+(\.\d+)?)\](.*)/;

      for (const line of lines) {
        const match = lrcRegex.exec(line);
        if (match) {
          const min = parseInt(match[1], 10);
          const sec = parseFloat(match[2]);
          const text = match[4].trim();
          if (text) parsed.push({ time: min * 60 + sec, text });
        } else if (line.trim()) {
          parsed.push({ time: -1, text: line.trim() });
        }
      }

      if (requestId !== activeLyricsRequestId) return;
      state.syncedLyrics = parsed;
      if (state.currentView === 'lyrics') {
        renderLyricsView();
      }
    } catch (e) {
      if (requestId !== activeLyricsRequestId) return;
      if (lyricsLinesContainer) lyricsLinesContainer.innerHTML = '<p class="lyric-line-placeholder">Lirik tidak tersedia.</p>';
    }
  }

  function renderLyricsView() {
    if (!state.currentTrack) return;
    if (lyricsLargeArt) {
      lyricsLargeArt.src = state.currentTrack.thumbnail || state.currentTrack.art || 'assets/radio_thumb.png';
    }
    if (lyricsHeaderTitle) {
      lyricsHeaderTitle.textContent = state.currentTrack.title || 'Judul Lagu';
    }
    if (lyricsHeaderArtist) {
      lyricsHeaderArtist.textContent = state.currentTrack.artist || 'Artis';
    }
    updateLikeButtonState();

    lyricsLinesContainer.innerHTML = '';
    if (state.syncedLyrics.length === 0) {
      lyricsLinesContainer.innerHTML = '<p class="lyric-line-placeholder">Mencari lirik...</p>';
      return;
    }

    state.syncedLyrics.forEach((line, index) => {
      const p = document.createElement('p');
      p.className = `lyric-line ${index === state.activeLyricIndex ? 'is-active' : ''}`;
      p.textContent = line.text;
      p.dataset.time = line.time;

      if (line.time >= 0) {
        p.addEventListener('click', () => {
          audioEl.currentTime = line.time;
          state.currentTime = line.time;
          updateTimelineDisplay();
          updateLyricsActiveLine(line.time);
        });
      }

      lyricsLinesContainer.appendChild(p);
    });
  }

  function updateLyricsActiveLine(curTime) {
    if (state.syncedLyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < state.syncedLyrics.length; i++) {
      if (state.syncedLyrics[i].time <= curTime && state.syncedLyrics[i].time >= 0) {
        activeIdx = i;
      } else if (state.syncedLyrics[i].time > curTime) {
        break;
      }
    }

    if (activeIdx !== state.activeLyricIndex && activeIdx !== -1) {
      state.activeLyricIndex = activeIdx;
      const curText = state.syncedLyrics[activeIdx]?.text || '';
      if (mobPlayerSnippetText && curText) mobPlayerSnippetText.textContent = curText;
      if (mobPreviewLine1 && curText) mobPreviewLine1.textContent = curText;
      const allLines = lyricsLinesContainer?.querySelectorAll('.lyric-line');
      if (allLines && allLines[activeIdx]) {
        allLines.forEach((l, idx) => {
          l.classList.toggle('is-active', idx === activeIdx);
        });
        // Smooth scroll strictly within lyricsScrollBox to prevent scrolling parent views
        const targetLine = allLines[activeIdx];
        if (targetLine && lyricsScrollBox) {
          const boxRect = lyricsScrollBox.getBoundingClientRect();
          const lineRect = targetLine.getBoundingClientRect();
          const currentScrollTop = lyricsScrollBox.scrollTop;
          const lineTopRelativeToBox = lineRect.top - boxRect.top;
          const targetOffset = currentScrollTop + lineTopRelativeToBox - (boxRect.height / 2) + (lineRect.height / 2);
          lyricsScrollBox.scrollTo({
            top: Math.max(0, targetOffset),
            behavior: 'smooth'
          });
        }
      }
    }
  }

  // =========================================================================
  // FAVORITES (LAGU YANG DISUKAI)
  // =========================================================================
  function isTrackLiked(track) {
    if (!track) return false;
    const id = track.id || track.title;
    return state.favorites.some(t => (t.id || t.title) === id);
  }

  function updateLikeButtonState() {
    const liked = isTrackLiked(state.currentTrack);
    if (heartEmpty && heartFilled) {
      heartEmpty.style.display = liked ? 'none' : 'block';
      heartFilled.style.display = liked ? 'block' : 'none';
    }
    if (lyricsHeartEmpty && lyricsHeartFilled) {
      lyricsHeartEmpty.style.display = liked ? 'none' : 'block';
      lyricsHeartFilled.style.display = liked ? 'block' : 'none';
    }
  }

  btnLike?.addEventListener('click', () => {
    if (!state.currentTrack) return;
    toggleLikeTrack(state.currentTrack);
  });

  // Bottom player Add to Playlist button (Mobile Controls & Desktop)
  btnPlayerAddPl?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.currentTrack) {
      showToast('Pilih lagu terlebih dahulu');
      return;
    }
    openAddToPlaylistModal(state.currentTrack);
  });
  btnPlayerAddPlControls?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.currentTrack) {
      showToast('Pilih lagu terlebih dahulu');
      return;
    }
    openAddToPlaylistModal(state.currentTrack);
  });

  // =========================================================================
  // SYNTH & SPOTIFY CONNECT (REMOTE PHONE CONTROL & SPEAKER SYNC)
  // =========================================================================

  function switchConnectTab(tabName) {
    const tabs = [
      { name: 'host', btn: tabBtnRemoteHost, pane: paneRemoteHost },
      { name: 'client', btn: tabBtnRemoteClient, pane: paneRemoteClient }
    ];
    tabs.forEach(t => {
      const isActive = t.name === tabName;
      t.btn?.classList.toggle('active', isActive);
      t.pane?.classList.toggle('active', isActive);
    });
  }

  tabBtnRemoteHost?.addEventListener('click', () => switchConnectTab('host'));
  tabBtnRemoteClient?.addEventListener('click', () => switchConnectTab('client'));

  async function openConnectModal() {
    if (!modalSpotifyConnect) return;
    modalSpotifyConnect.style.display = 'flex';

    const isMobile = window.innerWidth <= 768 || document.documentElement.classList.contains('is-mobile') || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    // Auto-select tab: Client on mobile, Host (QR code) on PC
    if (isMobile || state.remoteClientMode) {
      switchConnectTab('client');
    } else {
      switchConnectTab('host');
    }

    if (inputSpRemoteIp && !inputSpRemoteIp.value) {
      inputSpRemoteIp.value = state.remoteHostIp || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : '');
    }
    if (inputSpRemotePin && !inputSpRemotePin.value) {
      inputSpRemotePin.value = state.remoteHostPin || '5311';
    }

    updateClientUI(state.remoteClientMode);

    // Fetch pairing status & QR code from backend
    try {
      const res = await fetch('/api/remote/status');
      const data = await res.json();
      if (data && data.success) {
        if (spRemoteQrImg && data.qrDataUrl) {
          spRemoteQrImg.src = data.qrDataUrl;
          spRemoteQrImg.style.display = 'block';
          if (spRemoteQrLoading) spRemoteQrLoading.style.display = 'none';
        }
        if (spRemoteUrlText) {
          spRemoteUrlText.textContent = data.connectUrl || `http://${data.primaryIp}:38473`;
        }
        if (spRemotePinText && data.pin) {
          spRemotePinText.textContent = data.pin;
        }
        if (spRemoteClientsCount) {
          const count = data.clientCount || 0;
          spRemoteClientsCount.textContent = `${count} HP Terhubung`;
        }
        if (inputSpRemoteIp && !inputSpRemoteIp.value && data.primaryIp) {
          inputSpRemoteIp.value = data.primaryIp;
        }
      }
    } catch (err) {
      if (spRemoteQrLoading) spRemoteQrLoading.textContent = 'Gagal memuat status remote';
    }

    checkSpotifyConnectionStatus();
  }

  btnPlayerConnect?.addEventListener('click', (e) => {
    e.stopPropagation();
    openConnectModal();
  });

  btnDesktopConnect?.addEventListener('click', (e) => {
    e.stopPropagation();
    openConnectModal();
  });

  btnCopyRemoteUrl?.addEventListener('click', () => {
    const url = spRemoteUrlText?.textContent || '';
    if (!url) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('URL Remote disalin ke papan klip!', true);
      }).catch(() => {
        showToast(`URL: ${url}`);
      });
    } else {
      showToast(`URL: ${url}`);
    }
  });

  btnSpRemoteConnect?.addEventListener('click', () => {
    const ip = inputSpRemoteIp?.value?.trim();
    const pin = inputSpRemotePin?.value?.trim() || '5311';
    connectToRemoteHost(ip, pin);
  });

  btnSpRemoteDisconnect?.addEventListener('click', () => {
    disconnectFromRemoteHost();
  });

  btnCloseConnectModal?.addEventListener('click', () => {
    if (modalSpotifyConnect) modalSpotifyConnect.style.display = 'none';
  });

  modalSpotifyConnect?.addEventListener('click', (e) => {
    if (e.target === modalSpotifyConnect) modalSpotifyConnect.style.display = 'none';
  });

  // Client Phone Remote Functions
  function updateClientUI(connected, customMsg = null) {
    if (btnSpRemoteConnect) btnSpRemoteConnect.style.display = connected ? 'none' : 'block';
    if (btnSpRemoteDisconnect) btnSpRemoteDisconnect.style.display = connected ? 'block' : 'none';
    if (spRemoteClientStatus) {
      if (connected) {
        spRemoteClientStatus.className = 'client-status-banner connected';
        spRemoteClientStatus.textContent = `🔊 Terhubung ke PC (${state.remoteHostIp || 'Komputer'}) - Speaker PC Aktif`;
      } else {
        spRemoteClientStatus.className = customMsg ? 'client-status-banner error' : 'client-status-banner';
        spRemoteClientStatus.textContent = customMsg || 'Belum terhubung ke PC (Mode Suara HP)';
      }
    }
    [btnPlayerConnect, btnMobConnect, btnDesktopConnect].forEach(btn => {
      btn?.classList.toggle('connected', connected);
    });
    const mobPlayerVolumeSection = document.getElementById('mob-player-volume-section');
    if (mobPlayerVolumeSection) {
      mobPlayerVolumeSection.style.display = connected ? 'flex' : 'none';
    }
  }

  async function sendRemoteClientCommand(action, payload = {}) {
    const hostIp = state.remoteHostIp || window.location.hostname || '127.0.0.1';
    const pin = state.remoteHostPin || '5311';

    // 1. Try direct to native Synth remote server port 38473
    try {
      const res = await fetch(`http://${hostIp}:38473/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Riff-Pin': pin,
          'X-Riff-Token': state.remoteHostToken || ''
        },
        body: JSON.stringify({ action, ...payload })
      });
      if (res.ok) return;
    } catch (_) {}

    // 2. Fallback to web proxy port 3030
    try {
      const fallbackUrl = (hostIp && hostIp !== '127.0.0.1' && !window.location.host.includes(hostIp))
        ? `http://${hostIp}:3030/api/remote/command`
        : '/api/remote/command';
      await fetch(fallbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Riff-Pin': pin,
          'X-Riff-Token': state.remoteHostToken || ''
        },
        body: JSON.stringify({ action, ...payload })
      });
    } catch (e) {
      console.warn('Remote command send error:', e);
    }
  }

  // =========================================================================
  // REMOTE CLIENT TICKER, POLLING & STATE SYNCHRONIZATION
  // =========================================================================
  let remoteTicker = null;
  let clientPollTimer = null;

  function syncRemoteTicker() {
    if (state.remoteClientMode && state.isPlaying) {
      if (!remoteTicker) {
        remoteTicker = setInterval(() => {
          if (!state.remoteClientMode || !state.isPlaying) {
            clearInterval(remoteTicker);
            remoteTicker = null;
            return;
          }
          if (state.duration > 0 && state.currentTime < state.duration) {
            state.currentTime = Math.min(state.duration, state.currentTime + 0.25);
            updateTimelineDisplay();
            updateLyricsActiveLine(state.currentTime);
          }
        }, 250);
      }
    } else {
      if (remoteTicker) {
        clearInterval(remoteTicker);
        remoteTicker = null;
      }
    }
  }

  function applyHostState(hostState) {
    if (!hostState || typeof hostState !== 'object') return;

    if (hostState.track) {
      // Reconcile pending optimistic track selection: ignore older host track while PC is loading
      if (state.remotePendingTrackId) {
        const hostTrackId = hostState.track.id || hostState.track.title;
        if (hostTrackId === state.remotePendingTrackId) {
          state.remotePendingTrackId = null;
        } else if (Date.now() - (state.remotePendingTime || 0) < 4000) {
          return;
        } else {
          state.remotePendingTrackId = null;
        }
      }

      const isNew = !state.currentTrack || (state.currentTrack.id !== hostState.track.id && state.currentTrack.title !== hostState.track.title);
      state.currentTrack = hostState.track;

      if (isNew) {
        if (trackTitle && trackTitle.textContent !== (hostState.track.title || '')) {
          trackTitle.textContent = hostState.track.title || '';
        }
        if (trackArtist && trackArtist.textContent !== (hostState.track.artist || '')) {
          trackArtist.textContent = hostState.track.artist || '';
        }
        if (mobPlayerTitle && mobPlayerTitle.textContent !== (hostState.track.title || '')) {
          mobPlayerTitle.textContent = hostState.track.title || '';
        }
        if (mobPlayerArtist && mobPlayerArtist.textContent !== (hostState.track.artist || '')) {
          mobPlayerArtist.textContent = hostState.track.artist || '';
        }
        const thumb = hostState.track.thumbnail || hostState.track.art || 'assets/radio_thumb.png';
        if (trackArt && trackArt.getAttribute('src') !== thumb) {
          trackArt.src = thumb;
        }
        if (mobPlayerArt && mobPlayerArt.getAttribute('src') !== thumb) {
          mobPlayerArt.src = thumb;
        }
        if (typeof loadLyricsForTrack === 'function') {
          loadLyricsForTrack(hostState.track);
        }
        updateLikeButtonState();
      }
    }

    if (typeof hostState.isPlaying === 'boolean') {
      const changed = state.isPlaying !== hostState.isPlaying;
      state.isPlaying = hostState.isPlaying;
      if (changed) setPlayState(state.isPlaying);
    }

    if (Number.isFinite(hostState.duration) && hostState.duration > 0) {
      state.duration = hostState.duration;
    }

    if (Number.isFinite(hostState.currentTime) && !isDraggingTimeline && !isDraggingMobTimeline && !isSeekingPending) {
      const diff = Math.abs(state.currentTime - hostState.currentTime);
      // Drift correction: if paused or out of sync by > 1.2s, snap to host PC
      if (!state.isPlaying || diff > 1.2) {
        state.currentTime = hostState.currentTime;
      }
      updateTimelineDisplay();
      updateLyricsActiveLine(state.currentTime);
    }

    if (Number.isFinite(hostState.volume)) {
      state.volume = hostState.volume;
      updateVolumeVisuals(hostState.volume);
    }

    if (Array.isArray(hostState.queue) && hostState.queue.length > 0) {
      state.queue = hostState.queue;
      state.queueIndex = hostState.queueIndex || 0;
      renderQueueDrawer();
    }

    if (hostState.dsp && typeof hostState.dsp === 'object' && !isDraggingEq) {
      currentDSPDeltas = { ...currentDSPDeltas, ...hostState.dsp };
      syncEqualizerSlidersToDSP(currentDSPDeltas);
    }
    if (hostState.activePresetId !== undefined) {
      currentActivePresetId = hostState.activePresetId;
      updatePresetChipsUI(currentActivePresetId);
    }
    if (Number.isFinite(hostState.crossfadeDuration)) {
      crossfadeDuration = hostState.crossfadeDuration;
      updateCrossfadeUI();
    }

    syncRemoteTicker();
  }

  function startClientPolling() {
    if (clientPollTimer) {
      clearInterval(clientPollTimer);
      clientPollTimer = null;
    }
    if (!state.remoteClientMode) return;

    const hostIp = state.remoteHostIp || window.location.hostname || '127.0.0.1';
    const pin = state.remoteHostPin || '5311';

    const poll = async () => {
      if (!state.remoteClientMode) {
        if (clientPollTimer) clearInterval(clientPollTimer);
        clientPollTimer = null;
        return;
      }
      try {
        const res = await fetch(`http://${hostIp}:38473/api/state?pin=${encodeURIComponent(pin)}&token=${encodeURIComponent(state.remoteHostToken || '')}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const hostState = await res.json();
          applyHostState(hostState);
          updateClientUI(true);
          return;
        }
      } catch (_) {}

      // Fallback via web proxy port 3030
      try {
        const fallbackUrl = (hostIp && hostIp !== '127.0.0.1' && !window.location.host.includes(hostIp))
          ? `http://${hostIp}:3030/api/remote/state`
          : '/api/remote/state';
        const res2 = await fetch(fallbackUrl, { cache: 'no-store' });
        if (res2.ok) {
          const hostState2 = await res2.json();
          applyHostState(hostState2);
          updateClientUI(true);
        }
      } catch (_) {}
    };

    clientPollTimer = setInterval(poll, 1200);
    poll();
  }

  function startClientSSE() {
    if (clientSse) {
      try { clientSse.close(); } catch (e) {}
      clientSse = null;
    }
    const hostIp = state.remoteHostIp || window.location.hostname || '127.0.0.1';
    const pin = state.remoteHostPin || '5311';
    const sseUrl = `http://${hostIp}:38473/api/stream?pin=${encodeURIComponent(pin)}&token=${encodeURIComponent(state.remoteHostToken || '')}`;

    try {
      clientSse = new EventSource(sseUrl);
      clientSse.addEventListener('state', (e) => {
        try {
          const hostState = JSON.parse(e.data);
          applyHostState(hostState);
        } catch (_) {}
      });
      clientSse.onopen = () => {
        updateClientUI(true);
      };
      clientSse.onerror = () => {
        // SSE network hiccups won't freeze progress: background polling continues seamlessly!
      };
    } catch (e) {
      console.warn('Client SSE start error:', e);
    }
  }

  async function connectToRemoteHost(ip, pin) {
    if (!ip) {
      showToast('Masukkan alamat IP PC terlebih dahulu');
      return;
    }
    const cleanIp = ip.trim();
    const cleanPin = (pin || '5311').trim();
    state.remoteHostIp = cleanIp;
    state.remoteHostPin = cleanPin;
    localStorage.setItem('synth_remote_host_ip', cleanIp);
    localStorage.setItem('synth_remote_host_pin', cleanPin);

    showToast('Menghubungkan ke PC...');
    updateClientUI(false, 'Menghubungkan ke PC...');

    try {
      const res = await fetch(`http://${cleanIp}:38473/api/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin })
      });
      const data = await res.json();
      if (data && data.ok) {
        state.remoteHostToken = data.token || '';
        localStorage.setItem('synth_remote_host_token', state.remoteHostToken);
        state.remoteClientMode = true;
        localStorage.setItem('synth_remote_client_mode', 'true');
        streamErrorRecoveryAttempts = 0;
        streamDropRecoveryAttempts = 0;

        // Close host SSE stream so this client NEVER receives host commands
        if (hostPcEventSource) {
          try { hostPcEventSource.close(); } catch (e) {}
          hostPcEventSource = null;
        }

        if (audioEl) {
          try {
            audioEl.pause();
            audioEl.removeAttribute('src');
            audioEl.load();
          } catch (_) {}
        }

        updateClientUI(true);
        startClientSSE();
        startClientPolling();
        showToast('Berhasil terhubung ke PC! Lagu akan berputar di PC.', true);
        return;
      }
    } catch (_) {}

    // Fallback attempt via proxy
    try {
      const res2 = await fetch('/api/remote/status');
      const st = await res2.json();
      if (st && st.success) {
        state.remoteClientMode = true;
        localStorage.setItem('synth_remote_client_mode', 'true');
        streamErrorRecoveryAttempts = 0;
        streamDropRecoveryAttempts = 0;
        if (hostPcEventSource) {
          try { hostPcEventSource.close(); } catch (e) {}
          hostPcEventSource = null;
        }
        if (audioEl) {
          try {
            audioEl.pause();
            audioEl.removeAttribute('src');
            audioEl.load();
          } catch (_) {}
        }
        updateClientUI(true);
        startClientSSE();
        startClientPolling();
        showToast('Terhubung ke PC! Mode kontrol aktif.', true);
        return;
      }
    } catch (_) {}

    updateClientUI(false, 'Gagal menghubungi PC. Pastikan Wi-Fi sama.');
    showToast('Gagal terhubung. Pastikan HP & PC di Wi-Fi yang sama.');
  }

  function disconnectFromRemoteHost() {
    state.remoteClientMode = false;
    localStorage.setItem('synth_remote_client_mode', 'false');
    state.remotePendingTrackId = null;
    if (clientSse) {
      try { clientSse.close(); } catch (e) {}
      clientSse = null;
    }
    if (clientPollTimer) {
      clearInterval(clientPollTimer);
      clientPollTimer = null;
    }
    if (remoteTicker) {
      clearInterval(remoteTicker);
      remoteTicker = null;
    }
    updateClientUI(false);
    showToast('Koneksi diputus. Mode lokal HP aktif.');
    if (!isPhone) {
      startHostPcStream();
    }
  }

  // Host PC Command Listener & State Broadcaster
  function startHostPcStream() {
    if (state.remoteClientMode) return;
    if (hostPcEventSource) {
      try { hostPcEventSource.close(); } catch (e) {}
      hostPcEventSource = null;
    }
    try {
      hostPcEventSource = new EventSource('/api/remote/pc-stream');
      hostPcEventSource.addEventListener('status', (e) => {
        try {
          const status = JSON.parse(e.data);
          if (spRemoteClientsCount && typeof status.clientCount === 'number') {
            spRemoteClientsCount.textContent = `${status.clientCount} HP Terhubung`;
          }
        } catch (_) {}
      });
      hostPcEventSource.addEventListener('command', (e) => {
        try {
          const cmd = JSON.parse(e.data);
          if (cmd && cmd.action) {
            handleRemoteCommandOnPc(cmd);
          }
        } catch (err) {
          console.warn('Error handling remote command on PC:', err);
        }
      });
    } catch (err) {
      console.warn('Host PC SSE stream error:', err);
    }
  }

  function handleRemoteCommandOnPc(cmd) {
    if (!cmd || !cmd.action) return;
    // Guard: Remote clients must NEVER process commands intended for the host PC
    if (state.remoteClientMode) return;
    const action = cmd.action;

    if (action === 'playTrack' || action === 'play-track') {
      if (cmd.track) {
        playTrack(cmd.track, cmd.queue || cmd.queueList || null);
      }
    } else if (action === 'playQueueIndex' && Number.isFinite(cmd.index)) {
      if (state.queue && state.queue[cmd.index]) {
        playTrack(state.queue[cmd.index], state.queue);
      }
    } else if (action === 'toggle' || action === 'play-pause') {
      ensureAudioContextRunning();
      btnMainPlay?.click();
    } else if (action === 'play') {
      ensureAudioContextRunning();
      if (audioEl.paused) audioEl.play().catch(() => {});
    } else if (action === 'pause') {
      if (!audioEl.paused) audioEl.pause();
    } else if (action === 'next') {
      playNextTrack();
    } else if (action === 'prev') {
      playPrevTrack();
    } else if (action === 'seek' && Number.isFinite(cmd.time)) {
      if (isCrossfading || isCrossfadePaused || crossfadeTimerId) {
        cancelActiveCrossfade(crossfadeIncomingDeck || activeDeck);
      }
      const target = Math.max(0, Math.min(cmd.time, state.duration || 1));
      state.currentTime = target;
      if (audioEl && Number.isFinite(target)) audioEl.currentTime = target;
      ensureAudioContextRunning();
      if (state.isPlaying && audioEl && audioEl.paused) {
        audioEl.play().catch(() => {});
      }
      updateTimelineDisplay();
      updateLyricsActiveLine(target);
      broadcastRemoteState(true);
    } else if (action === 'volume' && Number.isFinite(cmd.value)) {
      const v = Math.max(0, Math.min(1, cmd.value));
      state.lastRemoteSystemVolume = v;
      try {
        fetch('/api/remote/set-sys-volume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: v })
        }).catch(() => {});
      } catch (_) {}
      broadcastRemoteState(true);
    } else if (action === 'shuffle') {
      btnShuffle?.click();
    } else if (action === 'repeat') {
      btnRepeat?.click();
    } else if (action === 'setBandGain' && Number.isFinite(cmd.index)) {
      setBandGain(cmd.index, cmd.gain);
      broadcastRemoteState(true);
    } else if (action === 'setTone') {
      setTone(cmd.bass, cmd.mid, cmd.treble);
      broadcastRemoteState(true);
    } else if (action === 'setPreset' && cmd.presetId) {
      setPreset(cmd.presetId);
      broadcastRemoteState(true);
    } else if (action === 'resetEqualizer') {
      resetEqualizer();
      broadcastRemoteState(true);
    } else if (action === 'resetAudioSettings') {
      ensureAudioContextRunning();
      currentActivePresetId = 'p_default';
      currentDSPDeltas = {
        speed: 1.0,
        speedPitch: 1.0,
        pitch: 0,
        playbackRate: 1.0,
        reverb: 0,
        distortion: 0,
        echo: 0,
        volumeGain: 1.0,
        toneBass: 0,
        toneMid: 0,
        toneTreble: 0,
        bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      };
      applyDSPParameters(currentDSPDeltas, true);
      syncEqualizerSlidersToDSP(currentDSPDeltas);
      updatePresetChipsUI('p_default');
      broadcastRemoteState(true);
    } else if (action === 'setCrossfade' && Number.isFinite(cmd.duration)) {
      setCrossfadeDuration(cmd.duration);
      broadcastRemoteState(true);
    } else if (action === 'setAudioDsp' && cmd.dsp) {
      ensureAudioContextRunning();
      if (Array.isArray(cmd.dsp.bands)) {
        cmd.dsp.bands.forEach((bVal, bIdx) => {
          if (Number.isFinite(bVal)) setBandGain(bIdx, bVal);
        });
      }
      if (Number.isFinite(cmd.dsp.toneBass) || Number.isFinite(cmd.dsp.toneMid) || Number.isFinite(cmd.dsp.toneTreble)) {
        setTone(cmd.dsp.toneBass, cmd.dsp.toneMid, cmd.dsp.toneTreble);
      }
      applyDSPParameters(cmd.dsp, cmd.preservesPitch);
      syncEqualizerSlidersToDSP(currentDSPDeltas);
      broadcastRemoteState(true);
    }
  }

  function broadcastRemoteState(immediate = false) {
    if (state.remoteClientMode) return;
    const now = Date.now();
    if (!immediate && now - lastRemoteBroadcastTime < 1000) return;
    lastRemoteBroadcastTime = now;

    const cur = (isSeekingPending && Number.isFinite(pendingSeekTime))
      ? pendingSeekTime
      : ((audioEl && Number.isFinite(audioEl.currentTime)) ? audioEl.currentTime : state.currentTime);
    const dur = (audioEl && Number.isFinite(audioEl.duration) && audioEl.duration > 0) ? audioEl.duration : state.duration;

    const payload = {
      isPlaying: !!state.isPlaying,
      currentTime: cur,
      duration: dur,
      volume: state.lastRemoteSystemVolume !== undefined ? state.lastRemoteSystemVolume : (state.volume !== undefined ? state.volume : 0.75),
      isMuted: !!state.isMuted,
      isShuffle: !!state.isShuffle,
      isRepeat: state.repeatMode > 0,
      dsp: { ...currentDSPDeltas },
      activePresetId: currentActivePresetId,
      crossfadeDuration: crossfadeDuration,
      track: state.currentTrack ? {
        id: state.currentTrack.id,
        title: state.currentTrack.title,
        artist: state.currentTrack.artist,
        album: state.currentTrack.album,
        thumbnail: getTrackArtwork(state.currentTrack),
        duration: dur
      } : null,
      queue: (state.queue || []).slice(0, 50).map((t, idx) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        thumbnail: getTrackArtwork(t),
        duration: t.duration || 0,
        index: idx
      })),
      queueIndex: state.queueIndex
    };

    fetch('/api/remote/update-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  async function checkSpotifyConnectionStatus() {
    try {
      const res = await fetch('/api/spotify-status');
      const data = await res.json();
      if (data && data.connected) {
        if (spConnectStatusPill) {
          spConnectStatusPill.textContent = 'Terhubung';
          spConnectStatusPill.className = 'connect-status-pill connected';
        }
        if (btnSpConnectAction) {
          btnSpConnectAction.textContent = 'Putuskan Akun Spotify';
          btnSpConnectAction.dataset.connected = 'true';
        }
      } else {
        if (spConnectStatusPill) {
          spConnectStatusPill.textContent = 'Belum Terhubung';
          spConnectStatusPill.className = 'connect-status-pill';
        }
        if (btnSpConnectAction) {
          btnSpConnectAction.textContent = 'Hubungkan Akun Spotify';
          btnSpConnectAction.dataset.connected = 'false';
        }
      }
    } catch (e) {
      if (spConnectStatusPill) {
        spConnectStatusPill.textContent = 'Synth Core Aktif';
        spConnectStatusPill.className = 'connect-status-pill connected';
      }
    }
  }

  btnSpConnectAction?.addEventListener('click', async () => {
    if (btnSpConnectAction.dataset.connected === 'true') {
      try {
        await fetch('/api/spotify-logout');
        showToast('Akun Spotify berhasil diputuskan');
        checkSpotifyConnectionStatus();
      } catch (err) {
        showToast('Gagal memutuskan akun Spotify');
      }
    } else {
      showToast('Membuka otentikasi Spotify...');
      window.open('/api/spotify-login', '_blank');
      setTimeout(checkSpotifyConnectionStatus, 3000);
      setTimeout(checkSpotifyConnectionStatus, 7000);
    }
  });

  // Lyrics view Like button
  btnLyricsLike?.addEventListener('click', () => {
    if (!state.currentTrack) return;
    toggleLikeTrack(state.currentTrack);
  });

  // Lyrics view Add to Playlist button
  btnLyricsAddPl?.addEventListener('click', () => {
    if (!state.currentTrack) {
      showToast('Pilih lagu terlebih dahulu');
      return;
    }
    openAddToPlaylistModal(state.currentTrack);
  });

  function toggleLikeTrack(track) {
    const id = track.id || track.title;
    const exists = state.favorites.findIndex(t => (t.id || t.title) === id);

    if (exists !== -1) {
      state.favorites.splice(exists, 1);
      showToast(`Dihapus dari Lagu yang Disukai: ${track.title}`);
    } else {
      state.favorites.unshift({ ...track, addedAt: Date.now() });
      showToast(`Ditambahkan ke Lagu yang Disukai: ${track.title}`, true);
    }

    saveFavorites();
    updateLikeButtonState();
    if (state.currentView === 'liked-songs') {
      renderLikedSongsView();
    }
  }

  function saveFavorites() {
    localStorage.setItem('synth_liked_songs', JSON.stringify(state.favorites));
    localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
  }

  qcLikedSongs?.addEventListener('click', () => {
    navigate('liked-songs');
  });

  function renderLikedSongsView() {
    likedCountLabel.textContent = `${state.favorites.length} lagu`;
    likedTracksTbody.innerHTML = '';

    if (state.favorites.length === 0) {
      likedTracksTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 48px 16px; color: #b3b3b3;">
            Belum ada lagu yang disukai. Klik ikon hati pada lagu apa pun untuk menyimpannya di sini!
          </td>
        </tr>
      `;
      return;
    }

    state.favorites.forEach((t, i) => {
      const tr = document.createElement('tr');
      tr.className = 'spotify-table-row';
      tr.__trackData = t;
      const isCur = state.currentTrack && (state.currentTrack.id || state.currentTrack.title) === (t.id || t.title);
      if (isCur) tr.classList.add('is-active');

      tr.innerHTML = `
        <td class="table-col-index" style="text-align: center;">${i + 1}</td>
        <td>
          <div class="table-track-cell">
            <div class="table-track-art">
              <img src="${escapeHtml(getTrackArtwork(t))}" alt="${escapeHtml(t.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(t.id || '')}')">
            </div>
            <div>
              <div class="table-track-name">${escapeHtml(t.title)}</div>
              <div class="table-track-artist">${escapeHtml(t.artist || 'Synth')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(t.album || 'Koleksi Favorit')}</td>
        <td style="text-align: right;">
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 14px;">
            <button class="track-row-action-btn track-row-heart-btn active" title="Hapus dari Lagu yang Disukai">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1ed760">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
            <span>${formatTime(t.duration || 200)}</span>
          </div>
        </td>
      `;

      tr.querySelector('.track-row-heart-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLikeTrack(t);
      });

      tr.addEventListener('click', () => {
        playTrack(t, state.favorites);
      });

      likedTracksTbody.appendChild(tr);
    });
  }

  btnPlayAllLiked?.addEventListener('click', () => {
    if (state.favorites.length > 0) {
      playTrack(state.favorites[0], state.favorites);
    } else {
      showToast('Belum ada lagu di daftar yang disukai');
    }
  });

  // =========================================================================
  // HEARD TRACKS DETECTION & FILTERING (STRICT NO-REPEAT GUARANTEE)
  // =========================================================================
  function getAllHeardTrackKeys() {
    const heard = new Set();
    const addTrack = (t) => {
      if (!t || isCorruptTrack(t)) return;
      if (t.id) heard.add(String(t.id).trim().toLowerCase());
      const title = (t.title || '').trim().toLowerCase();
      const artist = (t.artist || '').trim().toLowerCase();
      if (title) {
        heard.add(title);
        if (artist) heard.add(`${artist} - ${title}`);
      }
    };

    (state.history || []).forEach(addTrack);
    if (state.currentTrack) addTrack(state.currentTrack);
    (state.favorites || []).forEach(addTrack);
    return heard;
  }

  function isTrackAlreadyHeard(t, heardSet) {
    if (!t || isCorruptTrack(t)) return true;
    if (!heardSet) heardSet = getAllHeardTrackKeys();
    if (t.id && heardSet.has(String(t.id).trim().toLowerCase())) return true;
    const title = (t.title || '').trim().toLowerCase();
    const artist = (t.artist || '').trim().toLowerCase();
    if (title && heardSet.has(title)) return true;
    if (artist && title && heardSet.has(`${artist} - ${title}`)) return true;
    return false;
  }

  // =========================================================================
  // HISTORY (RECENTLY PLAYED)
  // =========================================================================
  function pushToHistory(track) {
    if (!track || isCorruptTrack(track)) return;
    const id = track.id || track.title;
    state.history = state.history.filter(t => !isCorruptTrack(t) && (t.id || t.title) !== id);
    state.history.unshift({ ...track, playedAt: Date.now() });
    if (state.history.length > 50) state.history.pop();
    localStorage.setItem('synth_history', JSON.stringify(state.history));
    localStorage.setItem('devsize_history', JSON.stringify(state.history));

    // Segera hapus lagu yang baru saja diputar dari daftar Rekomendasi (karena sudah pernah didengar!)
    if (Array.isArray(state.recommendations) && state.recommendations.length > 0) {
      const heardSet = getAllHeardTrackKeys();
      const hadTrack = state.recommendations.some(r => isTrackAlreadyHeard(r, heardSet));
      if (hadTrack) {
        state.recommendations = state.recommendations.filter(r => !isTrackAlreadyHeard(r, heardSet));
        if (state.recommendations.length < 10) {
          const freshPicks = generateDiverseRecommendations();
          for (const p of freshPicks) {
            if (state.recommendations.length >= 10) break;
            if (!state.recommendations.some(r => (r.id || r.title) === (p.id || p.title))) {
              state.recommendations.push(p);
            }
          }
        }
        localStorage.setItem('synth_recommendations', JSON.stringify(state.recommendations));
        if (state.currentView === 'home' && recommendationsContainer) {
          renderCardRow(recommendationsContainer, state.recommendations.slice(0, 10));
        }
      }
    }
  }

  function renderHistorySection() {
    renderRecentlyPlayed();
  }

  function renderCardToContainer(t, container) {
    const card = document.createElement('div');
    card.className = 'music-card';
    card.dataset.title = t.title;
    card.dataset.artist = t.artist || 'Synth';
    const artUrl = getTrackArtwork(t);
    card.dataset.art = artUrl;
    card.dataset.duration = t.duration || '240';
    card.dataset.id = t.id || '';

    card.innerHTML = `
      <div class="card-art-wrap ${t.isArtist ? 'is-artist' : ''}">
        <img src="${escapeHtml(artUrl)}" alt="${escapeHtml(t.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(t.id || '')}')">
        <button class="card-floating-play" title="Putar ${escapeHtml(t.title)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-title-text" title="${t.title}">${t.title}</div>
      <div class="card-subtext single-line">${t.artist || 'Synth'}</div>
    `;

    card.addEventListener('click', () => {
      if (t.isArtist) {
        navigate('artist', { name: t.title, thumbnail: t.art || t.thumbnail });
      } else {
        playTrack(t, state.history);
      }
    });

    container.appendChild(card);
  }

  // =========================================================================
  // CUSTOM PLAYLISTS & CREATION MODAL
  // =========================================================================
  function renderUserPlaylistsSection() {
    if (!userPlaylistsContainer || !sectionUserPlaylists) return;
    if (state.playlists.length === 0) {
      sectionUserPlaylists.style.display = 'none';
      return;
    }

    sectionUserPlaylists.style.display = 'block';
    userPlaylistsContainer.innerHTML = '';

    state.playlists.forEach((pl) => {
      const card = document.createElement('div');
      card.className = 'music-card';
      const coverArt = pl.tracks && pl.tracks[0] ? (pl.tracks[0].thumbnail || pl.tracks[0].art) : 'assets/radio_thumb.png';

      card.innerHTML = `
        <div class="card-art-wrap">
          <img src="${coverArt}" alt="${pl.name}" onerror="this.src='assets/radio_thumb.png'">
          <button class="card-floating-play" title="Buka ${pl.name}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="card-title-text">${pl.name}</div>
        <div class="card-subtext single-line">${(pl.tracks || []).length} lagu</div>
      `;

      card.addEventListener('click', () => {
        navigate('playlist-detail', pl);
      });

      userPlaylistsContainer.appendChild(card);
    });
  }

  function openCreatePlaylistModal() {
    if (!modalCreatePlaylist) return;
    if (inputNewPlName) {
      inputNewPlName.value = `Playlist Saya #${(state.playlists || []).length + 1}`;
    }
    if (inputNewPlDesc) {
      inputNewPlDesc.value = '';
    }
    modalCreatePlaylist.style.display = 'flex';
    setTimeout(() => {
      inputNewPlName?.focus();
      inputNewPlName?.select();
    }, 50);
  }

  function closeCreatePlaylistModal() {
    if (modalCreatePlaylist) modalCreatePlaylist.style.display = 'none';
  }

  btnCloseCreatePlModal?.addEventListener('click', closeCreatePlaylistModal);
  btnCancelCreatePl?.addEventListener('click', closeCreatePlaylistModal);

  modalCreatePlaylist?.addEventListener('click', (e) => {
    if (e.target === modalCreatePlaylist) closeCreatePlaylistModal();
  });

  inputNewPlName?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnConfirmCreatePl?.click();
    } else if (e.key === 'Escape') {
      closeCreatePlaylistModal();
    }
  });

  btnConfirmCreatePl?.addEventListener('click', () => {
    const name = inputNewPlName?.value?.trim() || `Playlist Saya #${(state.playlists || []).length + 1}`;
    const desc = inputNewPlDesc?.value?.trim() || 'Koleksi Lagu Pribadi';
    const newPl = {
      id: `pl-${Date.now()}`,
      name: name,
      description: desc,
      tracks: []
    };
    state.playlists.push(newPl);
    savePlaylists();
    renderUserPlaylistsSection();
    renderHomeQuickCards();
    closeCreatePlaylistModal();
    showToast(`Playlist berhasil dibuat: ${newPl.name}`, true);

    if (trackToAddToPlaylist) {
      addTrackToPlaylist(newPl.id, trackToAddToPlaylist);
      trackToAddToPlaylist = null;
      if (modalAddToPl) modalAddToPl.style.display = 'none';
    }
  });

  function createNewPlaylist() {
    openCreatePlaylistModal();
  }

  function savePlaylists() {
    localStorage.setItem('synth_playlists', JSON.stringify(state.playlists));
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
  }

  btnTopCreatePl?.addEventListener('click', () => openCreatePlaylistModal());
  btnCreatePlBanner?.addEventListener('click', () => openCreatePlaylistModal());

  function renderPlaylistDetailView(pl) {
    state.activePlaylistData = pl;
    plDetailTitle.textContent = pl.name || 'Playlist';
    plDetailDesc.textContent = pl.description || 'Koleksi Lagu';
    plDetailCount.textContent = `${(pl.tracks || []).length} lagu`;

    const cover = pl.tracks && pl.tracks[0] ? (pl.tracks[0].thumbnail || pl.tracks[0].art) : 'assets/radio_thumb.png';
    plDetailCoverImg.src = cover;

    btnDeleteCustomPl.style.display = pl.id?.startsWith('pl-') ? 'flex' : 'none';

    plDetailTbody.innerHTML = '';
    if (!pl.tracks || pl.tracks.length === 0) {
      plDetailTbody.innerHTML = `
        <tr><td colspan="4" style="text-align: center; padding: 48px; color: #b3b3b3;">Playlist ini masih kosong. Tambahkan lagu sekarang!</td></tr>
      `;
      return;
    }

    const isCustomPlaylist = pl.id?.startsWith('pl-') && pl.id !== 'pl-history';

    pl.tracks.forEach((t, i) => {
      const tr = document.createElement('tr');
      tr.className = 'spotify-table-row';
      tr.__trackData = t;
      tr.innerHTML = `
        <td class="table-col-index" style="text-align: center;">${i + 1}</td>
        <td>
          <div class="table-track-cell">
            <div class="table-track-art">
              <img src="${escapeHtml(getTrackArtwork(t))}" alt="${escapeHtml(t.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(t.id || '')}')">
            </div>
            <div>
              <div class="table-track-name">${escapeHtml(t.title)}</div>
              <div class="table-track-artist">${escapeHtml(t.artist || 'Synth')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(t.artist || 'Synth')}</td>
        <td style="text-align: right;">
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px;">
            ${isCustomPlaylist ? `
              <button class="track-row-action-btn btn-delete-track btn-playlist-remove" title="Hapus dari playlist">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            ` : ''}
            <span>${formatTime(t.duration || 200)}</span>
          </div>
        </td>
      `;

      if (isCustomPlaylist) {
        tr.querySelector('.btn-delete-track')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const removedTitle = t.title;
          pl.tracks.splice(i, 1);
          savePlaylists();
          renderPlaylistDetailView(pl);
          renderUserPlaylistsSection();
          renderHomeQuickCards();
          showToast(`Lagu dihapus dari playlist: ${removedTitle}`);
        });
      }

      tr.addEventListener('click', () => {
        playTrack(t, pl.tracks);
      });

      plDetailTbody.appendChild(tr);
    });
  }

  function deleteTrackFromPlaylist(pl, trackIdOrIndex) {
    if (!pl || !Array.isArray(pl.tracks)) return false;
    let idx = -1;
    if (typeof trackIdOrIndex === 'number') {
      idx = trackIdOrIndex;
    } else {
      idx = pl.tracks.findIndex(t => (t.id || t.title) === trackIdOrIndex);
    }
    if (idx >= 0 && idx < pl.tracks.length) {
      const removed = pl.tracks.splice(idx, 1)[0];
      savePlaylists();
      renderPlaylistDetailView(pl);
      renderUserPlaylistsSection();
      renderHomeQuickCards();
      showToast(`Lagu dihapus dari playlist: ${removed.title}`);
      return true;
    }
    return false;
  }
  window.deleteTrackFromPlaylist = deleteTrackFromPlaylist;

  btnPlayCustomPl?.addEventListener('click', () => {
    if (state.activePlaylistData && state.activePlaylistData.tracks && state.activePlaylistData.tracks.length > 0) {
      playTrack(state.activePlaylistData.tracks[0], state.activePlaylistData.tracks);
    }
  });

  btnDeleteCustomPl?.addEventListener('click', () => {
    if (!state.activePlaylistData) return;
    if (confirm(`Yakin ingin menghapus playlist "${state.activePlaylistData.name}"?`)) {
      state.playlists = state.playlists.filter(p => p.id !== state.activePlaylistData.id);
      savePlaylists();
      showToast('Playlist dihapus');
      navigate('home');
    }
  });

  // Modal Add To Playlist
  function openAddToPlaylistModal(track) {
    trackToAddToPlaylist = track;
    modalAddToPl.style.display = 'flex';
    modalPlList.innerHTML = '';

    // Liked songs option
    const likedRow = document.createElement('div');
    likedRow.className = 'modal-pl-item';
    likedRow.innerHTML = `
      <div class="modal-pl-name">❤️ Lagu yang Disukai</div>
      <div class="modal-pl-count">${state.favorites.length} lagu</div>
    `;
    likedRow.addEventListener('click', () => {
      toggleLikeTrack(track);
      modalAddToPl.style.display = 'none';
    });
    modalPlList.appendChild(likedRow);

    state.playlists.forEach((pl) => {
      const row = document.createElement('div');
      row.className = 'modal-pl-item';
      row.innerHTML = `
        <div class="modal-pl-name">${pl.name}</div>
        <div class="modal-pl-count">${(pl.tracks || []).length} lagu</div>
      `;
      row.addEventListener('click', () => {
        if (!pl.tracks) pl.tracks = [];
        const exists = pl.tracks.some(t => (t.id || t.title) === (track.id || track.title));
        if (!exists) {
          pl.tracks.push({ ...track });
          savePlaylists();
          showToast(`Ditambahkan ke ${pl.name}`, true);
        } else {
          showToast(`Lagu sudah ada di ${pl.name}`);
        }
        modalAddToPl.style.display = 'none';
      });
      modalPlList.appendChild(row);
    });
  }

  btnCloseAddPlModal?.addEventListener('click', () => {
    modalAddToPl.style.display = 'none';
  });

  btnModalCreateNewPl?.addEventListener('click', () => {
    const pl = createNewPlaylist();
    if (pl && trackToAddToPlaylist) {
      pl.tracks.push({ ...trackToAddToPlaylist });
      savePlaylists();
      showToast(`Ditambahkan ke ${pl.name}`, true);
    }
    modalAddToPl.style.display = 'none';
  });

  // =========================================================================
  // ARTIST VIEW
  // =========================================================================
  async function renderArtistView(artistData) {
    state.activeArtistData = artistData;
    artistName.textContent = artistData.name || 'Artis';
    artistListeners.textContent = artistData.monthlyListeners || '84.921.405 pendengar bulanan';

    let bgImage = artistData.thumbnail || 'assets/taylor_swift.png';
    artistBackdrop.style.backgroundImage = `url('${bgImage}')`;

    artistTopTracks.innerHTML = '<p style="color: #b3b3b3; padding: 16px 0;">Memuat lagu populer...</p>';

    let topTracks = [];

    // 1. Fetch rich artist info (Deezer avatar, bio, verified top tracks)
    try {
      const artRes = await fetch(`/api/artist?name=${encodeURIComponent(artistData.name)}`);
      if (artRes.ok) {
        const artJson = await artRes.json();
        if (artJson.success && artJson.artist) {
          const a = artJson.artist;
          if (a.avatar) {
            bgImage = a.avatar;
            artistBackdrop.style.backgroundImage = `url('${bgImage}')`;
          }
          if (a.bio) {
            artistData.bio = a.bio;
          }
          if (Array.isArray(a.tracks) && a.tracks.length > 0) {
            topTracks = a.tracks;
          }
        }
      }
    } catch (e) {
      console.warn('Artist API fetch error:', e);
    }

    // 2. Fallback to search query if no tracks returned from artist endpoint
    if (topTracks.length === 0) {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(artistData.name)}`);
        if (res.ok) {
          const json = await res.json();
          topTracks = json.tracks || [];
        }
      } catch (e) {
        console.warn('Artist tracks fallback error:', e);
      }
    }

    // Render Top Tracks
    artistTopTracks.innerHTML = '';
    if (topTracks.length === 0) {
      artistTopTracks.innerHTML = '<p style="color: #b3b3b3; padding: 16px 0;">Tidak ada lagu ditemukan.</p>';
    } else {
      topTracks.slice(0, 10).forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'artist-top-row';
        row.innerHTML = `
          <div class="artist-top-left">
            <span class="artist-top-index">${i + 1}</span>
            <img style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;" src="${escapeHtml(getTrackArtwork(t))}" alt="${escapeHtml(t.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(t.id || '')}')">
            <div>
              <div style="font-size: 15px; font-weight: 600; color: #fff;">${t.title}</div>
              <div style="font-size: 13px; color: #b3b3b3;">${t.artist || artistData.name}</div>
            </div>
          </div>
          <div style="font-size: 13px; color: #b3b3b3;">${formatTime(t.duration || 200)}</div>
        `;

        row.addEventListener('click', () => {
          playTrack(t, topTracks);
        });

        artistTopTracks.appendChild(row);
      });

      btnPlayArtistTop.onclick = () => {
        if (topTracks.length > 0) playTrack(topTracks[0], topTracks);
      };
    }

    // Artist Bio
    if (artistData.bio) {
      artistBioText.textContent = artistData.bio;
      document.getElementById('section-artist-bio').style.display = 'block';
    } else {
      document.getElementById('section-artist-bio').style.display = 'none';
    }
  }

  // =========================================================================
  // REAL SYNTH SEARCH ARCHITECTURE: ARTIST, ALBUMS, TRACKS (IMAGE 3)
  // =========================================================================
  let searchDebounceTimer = null;
  let activeSearchToken = 0;

  searchInput?.addEventListener('focus', () => {
    searchBoxPill?.classList.add('focused');
  });

  searchInput?.addEventListener('blur', () => {
    searchBoxPill?.classList.remove('focused');
  });

  searchClearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    if (searchIdleState) searchIdleState.style.display = 'flex';
    if (searchArtistContainer) searchArtistContainer.innerHTML = '';
    if (searchAlbumsContainer) searchAlbumsContainer.innerHTML = '';
    if (searchTracksList) searchTracksList.innerHTML = '';
    if (searchTracksHeader) searchTracksHeader.style.display = 'none';
    navigate('home');
  });

  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (!query) {
      searchClearBtn.style.display = 'none';
      searchLoadingBar.style.display = 'none';
      if (searchIdleState) searchIdleState.style.display = 'flex';
      if (searchArtistContainer) searchArtistContainer.innerHTML = '';
      if (searchAlbumsContainer) searchAlbumsContainer.innerHTML = '';
      if (searchTracksList) searchTracksList.innerHTML = '';
      if (searchTracksHeader) searchTracksHeader.style.display = 'none';
      navigate('home');
      return;
    }

    searchClearBtn.style.display = 'flex';
    searchLoadingBar.style.display = 'block';
    if (state.currentView !== 'search') {
      navigate('search', { query }, false);
    }

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      performSearch(query);
    }, 280);
  });

  async function performSearch(query) {
    if (!query || !query.trim()) return;
    const searchToken = ++activeSearchToken;
    const trimmed = query.trim();

    searchLoadingBar.style.display = 'block';
    if (searchIdleState) searchIdleState.style.display = 'none';
    searchArtistContainer.innerHTML = '';
    searchAlbumsContainer.innerHTML = '';
    searchTracksList.innerHTML = '<div style="padding: 32px; color: var(--text-secondary); text-align: center;">Mencari musik...</div>';
    if (searchTracksHeader) searchTracksHeader.style.display = 'none';

    // 1. Fetch Artist Card (if query matches an artist like "Taylor Swift")
    fetchArtistCardForSearch(trimmed, searchToken);

    // 2. Fetch Albums Carousel (from Synth's /api/albums/search)
    fetchAlbumsForSearch(trimmed, searchToken);

    // 3. Fetch Numbered Tracks (from Synth's /api/search)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&platform=${encodeURIComponent(state.currentPlatform || 'youtube')}&limit=25`);
      if (searchToken !== activeSearchToken) return;
      searchLoadingBar.style.display = 'none';
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const tracks = data.tracks || [];

      renderSearchTracks(tracks, searchToken);
    } catch (err) {
      if (searchToken !== activeSearchToken) return;
      searchLoadingBar.style.display = 'none';
      searchTracksList.innerHTML = `<div style="padding: 24px; color: var(--text-secondary); text-align: center;">Gagal memuat hasil: ${escapeHtml(err.message)}</div>`;
    }
  }

  // 1. Artist Card
  async function fetchArtistCardForSearch(query, token) {
    try {
      const res = await fetch(`/api/artist?name=${encodeURIComponent(query)}`);
      if (!res.ok || token !== activeSearchToken) return;
      const data = await res.json();
      if (!data.success || !data.artist || !data.artist.name) return;

      const artist = data.artist;
      const avatarUrl = artist.avatar || 'assets/taylor_swift.png';

      searchArtistContainer.innerHTML = `
        <div class="search-artist-card" role="button" tabindex="0" title="Buka profil ${escapeHtml(artist.name)}">
          <div class="search-artist-avatar-wrap">
            <img class="search-artist-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(artist.name)}" onerror="this.src='assets/taylor_swift.png'">
          </div>
          <div class="search-artist-info">
            <span class="search-artist-name">${escapeHtml(artist.name)}</span>
            <span class="search-artist-label">Artis</span>
          </div>
        </div>
      `;

      const card = searchArtistContainer.querySelector('.search-artist-card');
      card?.addEventListener('click', () => {
        navigate('artist', {
          name: artist.name,
          thumbnail: avatarUrl,
          bio: artist.bio || '',
          monthlyListeners: '84.921.405 pendengar bulanan'
        });
      });
    } catch (e) {}
  }

  // 2. Albums Section Carousel
  async function fetchAlbumsForSearch(query, token) {
    try {
      const res = await fetch(`/api/albums/search?q=${encodeURIComponent(query)}`);
      if (!res.ok || token !== activeSearchToken) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.albums) || data.albums.length === 0) {
        searchAlbumsContainer.innerHTML = '';
        return;
      }

      const albums = data.albums;
      searchAlbumsContainer.innerHTML = `
        <div class="section-title-row" style="margin-bottom: 12px;">
          <h2 class="section-title">Album</h2>
        </div>
        <div class="search-albums-row">
          ${albums.map((album, idx) => {
            const sub = album.year ? `${escapeHtml(album.artist)} · ${escapeHtml(album.year)}` : escapeHtml(album.artist || '');
            return `
              <div class="search-album-card" data-idx="${idx}" tabindex="0">
                <div class="search-album-cover-wrap">
                  <img class="search-album-cover" src="${escapeHtml(album.cover || 'assets/radio_thumb.png')}" alt="${escapeHtml(album.title)}" onerror="this.src='assets/radio_thumb.png'" loading="lazy">
                  <button class="search-album-floating-play" title="Putar album ${escapeHtml(album.title)}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
                <div class="search-album-title" title="${escapeHtml(album.title)}">${escapeHtml(album.title)}</div>
                <div class="search-album-sub" title="${sub}">${sub}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      const cards = searchAlbumsContainer.querySelectorAll('.search-album-card');
      cards.forEach((card) => {
        const idx = parseInt(card.dataset.idx, 10);
        const album = albums[idx];
        if (!album) return;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.search-album-floating-play')) {
            e.stopPropagation();
            playAlbum(album);
            return;
          }
          openAlbumDetail(album);
        });
      });
    } catch (e) {
      if (token === activeSearchToken) searchAlbumsContainer.innerHTML = '';
    }
  }

  // 3. Numbered Track Rows
  function renderSearchTracks(tracks, token) {
    if (token !== activeSearchToken) return;
    searchTracksList.innerHTML = '';

    if (!Array.isArray(tracks) || tracks.length === 0) {
      if (searchTracksHeader) searchTracksHeader.style.display = 'none';
      searchTracksList.innerHTML = '<div style="padding: 24px; color: var(--text-secondary); text-align: center;">Tidak ada lagu ditemukan.</div>';
      return;
    }

    if (searchTracksHeader) searchTracksHeader.style.display = 'flex';

    tracks.forEach((track, i) => {
      const row = document.createElement('div');
      row.className = 'search-track-row';
      row.dataset.id = track.id || track.title;

      const isCurrent = state.currentTrack && (state.currentTrack.id === track.id || state.currentTrack.title === track.title);
      if (isCurrent) row.classList.add('is-active');

      const isFav = state.favorites.some(f => (f.id && f.id === track.id) || f.title === track.title);

      row.innerHTML = `
        <div class="search-track-left">
          <span class="search-track-num">${i + 1}</span>
          <div class="search-track-thumb-wrap">
            <img class="search-track-thumb" src="${escapeHtml(getTrackArtwork(track))}" alt="${escapeHtml(track.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(track.id || '')}')">
          </div>
          <div class="search-track-meta">
            <span class="search-track-title">${escapeHtml(track.title)}</span>
            <span class="search-track-artist">${escapeHtml(track.artist || 'Artis')}</span>
          </div>
        </div>
        <div class="search-track-right">
          <button class="search-track-action-btn btn-add-pl" title="Tambahkan ke Playlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <span class="search-track-duration">${formatTime(track.duration || 200)}</span>
        </div>
      `;

      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-add-pl')) {
          e.stopPropagation();
          openAddToPlaylistModal(track);
          return;
        }

        playTrack(track, tracks);
      });

      searchTracksList.appendChild(row);
    });
  }

  // =========================================================================
  // ALBUM DETAIL VIEW
  // =========================================================================
  async function openAlbumDetail(album) {
    if (!album) return;
    navigate('album-detail', album);
  }

  async function renderAlbumDetailView(album) {
    const cover = document.getElementById('album-detail-cover');
    const title = document.getElementById('album-detail-title');
    const artist = document.getElementById('album-detail-artist');
    const year = document.getElementById('album-detail-year');
    const count = document.getElementById('album-detail-count');
    const tbody = document.getElementById('album-tracks-tbody');
    const btnPlayAll = document.getElementById('btn-play-all-album');

    if (cover) cover.src = album.cover || 'assets/radio_thumb.png';
    if (title) title.textContent = album.title || 'Album';
    if (artist) artist.textContent = album.artist || 'Artis';
    if (year) year.textContent = album.year || '';
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px; color: #b3b3b3;">Memuat lagu album...</td></tr>';

    try {
      const res = await fetch(`/api/albums/tracks?id=${encodeURIComponent(album.id)}`);
      if (!res.ok) throw new Error('Could not load album tracks');
      const data = await res.json();
      const tracks = (data && Array.isArray(data.tracks)) ? data.tracks : [];

      if (count) count.textContent = `${tracks.length} lagu`;
      if (tbody) {
        tbody.innerHTML = '';
        tracks.forEach((t, i) => {
          t.duration = t.duration || (t.durationMs ? Math.round(t.durationMs / 1000) : 200);
          t.thumbnail = t.thumbnail || album.cover;
          t.artist = t.artist || album.artist;
          t.platform = 'youtube';

          const tr = document.createElement('tr');
          tr.className = 'spotify-track-row';
          tr.innerHTML = `
            <td style="text-align: center; color: var(--text-secondary); width: 40px;">${i + 1}</td>
            <td>
              <div class="table-track-meta">
                <span class="table-track-title">${escapeHtml(t.title)}</span>
                <span class="table-track-artist">${escapeHtml(t.artist || album.artist)}</span>
              </div>
            </td>
            <td style="color: var(--text-secondary); font-size: 13px;">${escapeHtml(album.title)}</td>
            <td style="text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums;">${formatTime(t.duration)}</td>
          `;

          tr.addEventListener('click', () => {
            playTrack(t, tracks);
          });

          tbody.appendChild(tr);
        });
      }

      if (btnPlayAll) {
        btnPlayAll.onclick = () => {
          if (tracks.length > 0) playTrack(tracks[0], tracks);
        };
      }
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: #b3b3b3;">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function playAlbum(album) {
    try {
      const res = await fetch(`/api/albums/tracks?id=${encodeURIComponent(album.id)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && data.tracks.length > 0) {
          data.tracks.forEach(t => {
            t.duration = t.duration || (t.durationMs ? Math.round(t.durationMs / 1000) : 200);
            t.thumbnail = t.thumbnail || album.cover;
            t.artist = t.artist || album.artist;
            t.platform = 'youtube';
          });
          playTrack(data.tracks[0], data.tracks);
        }
      }
    } catch (e) {
      showToast(`Gagal memutar album: ${e.message}`);
    }
  }

  // =========================================================================
  // HOME SCREEN (BERANDA - SESUAI GAMBAR 2 USER)
  // HIJAU: LIKED SONGS, BIRU: PLAYLIST USER, KUNING 1: TERAKHIR DIDENGARKAN,
  // KUNING 2: REKOMENDASI UNTUKMU (SMART VIBE ENGINE)
  // =========================================================================
  function renderHomeQuickCards() {
    // 1. Hijau: Liked songs
    if (qcLikedCount) {
      qcLikedCount.textContent = `${state.favorites.length} lagu`;
    }

    qcLikedSongs?.addEventListener('click', (e) => {
      if (e.target.closest('#qc-liked-play-btn')) {
        e.stopPropagation();
        if (state.favorites.length > 0) {
          playTrack(state.favorites[0], state.favorites);
        } else {
          showToast('Belum ada lagu yang disukai.');
        }
        return;
      }
      navigate('liked-songs');
    });

    // 2. Biru: User Playlists
    if (!quickPlaylistsContainer) return;
    quickPlaylistsContainer.innerHTML = '';

    const userPls = Array.isArray(state.playlists) ? state.playlists : [];

    // Show up to 5 user playlists
    userPls.slice(0, 5).forEach(pl => {
      const card = document.createElement('div');
      card.className = 'quick-card';
      card.dataset.type = 'playlist';
      const coverImg = (pl.tracks && pl.tracks[0] && (pl.tracks[0].thumbnail || pl.tracks[0].art)) || 'assets/radio_thumb.png';
      card.innerHTML = `
        <div class="quick-card-art">
          <img src="${coverImg}" alt="${escapeHtml(pl.name)}" onerror="this.src='assets/radio_thumb.png'">
        </div>
        <div class="quick-card-info">
          <div class="quick-card-title">${escapeHtml(pl.name)}</div>
          <div class="quick-card-sub">${pl.tracks ? pl.tracks.length : 0} lagu</div>
        </div>
        <button class="quick-play-btn" title="Putar ${escapeHtml(pl.name)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.quick-play-btn')) {
          e.stopPropagation();
          if (pl.tracks && pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks);
          return;
        }
        navigate('playlist-detail', pl);
      });

      quickPlaylistsContainer.appendChild(card);
    });

    // If user has fewer than 5 playlists, show a "+ Buat Playlist" tile
    if (userPls.length < 5) {
      const createCard = document.createElement('div');
      createCard.className = 'quick-card create-new-pl';
      createCard.dataset.type = 'playlist';
      createCard.innerHTML = `
        <div class="quick-card-art" style="background: rgba(255,255,255,0.06); color: var(--text-primary); display: flex; align-items: center; justify-content: center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14m-7-7h14"/></svg>
        </div>
        <div class="quick-card-info">
          <div class="quick-card-title">+ Buat Playlist</div>
          <div class="quick-card-sub">Atur koleksi musik</div>
        </div>
      `;
      createCard.addEventListener('click', () => {
        openCreatePlaylistModal();
      });
      quickPlaylistsContainer.appendChild(createCard);
    }

    // Fill remaining quick card slots up to 5 so total is 6 (1 liked + 5 slots)
    const currentSlots = quickPlaylistsContainer.children.length;
    if (currentSlots < 5) {
      const needed = 5 - currentSlots;
      const candidates = [...(state.history || []), ...(state.synthLibraryTracks || []), ...(state.localTracks || [])].filter(t => !isCorruptTrack(t));
      const addedTitles = new Set();
      let added = 0;
      for (const t of candidates) {
        if (added >= needed) break;
        if (addedTitles.has(t.title)) continue;
        addedTitles.add(t.title);

        const trackCard = document.createElement('div');
        trackCard.className = 'quick-card';
        trackCard.dataset.type = 'track';
        const coverImg = getTrackArtwork(t);
        trackCard.innerHTML = `
          <div class="quick-card-art">
            <img src="${escapeHtml(coverImg)}" alt="${escapeHtml(t.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(t.id || '')}')">
          </div>
          <div class="quick-card-info">
            <div class="quick-card-title">${escapeHtml(t.title)}</div>
            <div class="quick-card-sub">${escapeHtml(t.artist || 'Synth')}</div>
          </div>
          <button class="quick-play-btn" title="Putar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        `;
        trackCard.addEventListener('click', () => {
          playTrack(t, [t]);
        });
        quickPlaylistsContainer.appendChild(trackCard);
        added++;
      }
    }
  }

  // Kuning - Baris pertama: Terakhir Didengarkan
  function renderRecentlyPlayed() {
    if (!recentPlayedContainer) return;
    recentPlayedContainer.innerHTML = '';

    const historyTracks = Array.isArray(state.history) ? state.history.filter(t => !isCorruptTrack(t)) : [];
    const seen = new Set();
    const uniqueHistory = [];

    for (const t of historyTracks) {
      const key = t.id || t.title;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueHistory.push(t);
      }
      if (uniqueHistory.length >= 12) break;
    }

    if (uniqueHistory.length === 0) {
      fetch('/api/synth-tracks').then(r => r.json()).then(localTracks => {
        if (Array.isArray(localTracks) && localTracks.length > 0) {
          const valid = localTracks.filter(t => !isCorruptTrack(t));
          renderCardRow(recentPlayedContainer, valid.slice(0, 10));
          if (!state.currentTrack && valid.length > 0) {
            restoreLastPlayedTrack(valid[0]);
          }
        }
      }).catch(() => {});
      return;
    }

    renderCardRow(recentPlayedContainer, uniqueHistory);
  }

  // Kuning - Baris kedua: Rekomendasi Untukmu (STRICT: Belum pernah didengarkan, sesuai selera)
  function generateDiverseRecommendations() {
    const pool = (Array.isArray(state.synthLibraryTracks) && state.synthLibraryTracks.length > 0)
      ? state.synthLibraryTracks
      : [];

    if (pool.length === 0) return [];

    const heardSet = getAllHeardTrackKeys();
    const artistMap = new Map();

    for (const t of pool) {
      if (isCorruptTrack(t)) continue;
      if (isTrackAlreadyHeard(t, heardSet)) continue; // STRICT: lagu yang pernah didengar/disukai tidak boleh masuk!
      const a = (t.artist || 'Unknown').trim();
      if (!artistMap.has(a)) artistMap.set(a, []);
      artistMap.get(a).push(t);
    }

    const artists = Array.from(artistMap.keys());
    for (let i = artists.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [artists[i], artists[j]] = [artists[j], artists[i]];
    }

    const picks = [];
    let idx = 0;
    while (picks.length < 15 && artists.length > 0) {
      const a = artists[idx % artists.length];
      const list = artistMap.get(a);
      if (list && list.length > 0) {
        picks.push(list.shift());
        if (list.length === 0) {
          artists.splice(idx % artists.length, 1);
          continue;
        }
      }
      idx++;
    }

    // Selalu jamin minimal 10 rekomendasi dari lagu lokal yang BELUM pernah didengar
    if (picks.length < 10) {
      for (const t of pool) {
        if (picks.length >= 10) break;
        if (!isCorruptTrack(t) && !isTrackAlreadyHeard(t, heardSet) && !picks.some(p => (p.id || p.title) === (t.id || t.title))) {
          picks.push(t);
        }
      }
    }

    return picks;
  }

  let isFetchingRecommendations = false;

  async function fetchFreshRecommendationsInBackground(forceRefresh = false) {
    if (isFetchingRecommendations) return;
    isFetchingRecommendations = true;

    try {
      // Pick randomized seeds from favorites and recent history
      const seedPool = [
        ...(state.favorites || []),
        ...(state.history || [])
      ].filter(t => !isCorruptTrack(t));

      const shuffledSeeds = [...seedPool].sort(() => 0.5 - Math.random()).slice(0, 8);

      const vibePayload = {
        history: (state.history || []).slice(0, 30),
        favorites: (state.favorites || []).slice(0, 25),
        platform: state.currentPlatform || 'youtube',
        limit: 15,
        extra: {
          refresh: forceRefresh,
          seeds: shuffledSeeds.map(s => ({
            artist: s.artist || '',
            title: s.title || '',
            id: s.id || '',
            platform: s.platform || 'youtube',
            weight: 2
          }))
        }
      };

      let recTracks = [];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000); // 18s timeout for Synth backend
        const res = await fetch('/api/vibe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vibePayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
            recTracks = data.tracks;
          }
        }
      } catch (e) {
        // Vibe fetch timed out or aborted; retain current recommendations
      }

      // Filter ketat: buang SEMUA lagu yang sudah pernah didengar (history) atau disukai (favorites)
      const heardSet = getAllHeardTrackKeys();
      const freshTracks = [];
      const seen = new Set();

      for (const t of recTracks) {
        if (!t || isCorruptTrack(t)) continue;
        const key = (t.id || t.title || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!isTrackAlreadyHeard(t, heardSet)) {
          freshTracks.push(t);
        }
      }

      // Susun finalTracks yang segar dan strictly belum pernah didengar
      let finalTracks = [...freshTracks];
      if (finalTracks.length < 10) {
        const fillers = generateDiverseRecommendations();
        for (const f of fillers) {
          if (finalTracks.length >= 10) break;
          const k = (f.id || f.title || '').toLowerCase();
          if (!seen.has(k) && !isTrackAlreadyHeard(f, heardSet)) {
            seen.add(k);
            finalTracks.push(f);
          }
        }
      }

      // HANYA update setelah semua selesai siap, langsung ke daftar baru tanpa interim list
      if (finalTracks.length > 0) {
        state.recommendations = finalTracks;
        localStorage.setItem('synth_recommendations', JSON.stringify(finalTracks));
        if (state.currentView === 'home' && recommendationsContainer) {
          renderCardRow(recommendationsContainer, finalTracks.slice(0, 10));
        }
      }
    } catch (err) {
      console.warn('Background recommendation update warning:', err);
      throw err;
    } finally {
      isFetchingRecommendations = false;
    }
  }

  async function renderRecommendations(forceRefresh = false) {
    if (!recommendationsContainer) return;

    // 1. INSTANT 0ms: Render from state/cache immediately!
    if (state.recommendations && state.recommendations.length > 0 && !forceRefresh) {
      // Pastikan cache tidak mengandung lagu yang baru saja didengar
      const heardSet = getAllHeardTrackKeys();
      state.recommendations = state.recommendations.filter(t => !isTrackAlreadyHeard(t, heardSet));
      if (state.recommendations.length >= 5) {
        renderCardRow(recommendationsContainer, state.recommendations.slice(0, 10));
        // Don't auto-fetch in background on passive page view if we already have recommendations
        return;
      }
    }

    // 2. If library is not loaded yet, fetch immediately (< 10ms local read)
    if (!state.synthLibraryTracks || state.synthLibraryTracks.length === 0) {
      try {
        const res = await fetch('/api/synth-tracks');
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            state.synthLibraryTracks = list.filter(t => !isCorruptTrack(t)).map(t => ({ ...t, thumbnail: getTrackArtwork(t) }));
          }
        }
      } catch (e) {}
    }

    // 3. ZERO-DELAY FALLBACK: Generate diverse recommendations immediately from library (strictly unheard)
    const instantTracks = generateDiverseRecommendations();
    if (instantTracks.length > 0) {
      state.recommendations = instantTracks;
      localStorage.setItem('synth_recommendations', JSON.stringify(instantTracks));
      renderCardRow(recommendationsContainer, instantTracks.slice(0, 10));
    }

    // 4. Launch background revalidation
    fetchFreshRecommendationsInBackground(forceRefresh).catch(() => {});
  }

  btnRefreshRecs?.addEventListener('click', async () => {
    if (isFetchingRecommendations) return;

    // Sesuai instruksi:
    // 1. Biarkan daftar rekomendasi yang belum pernah didengar sebelumnya tetap tampil di layar (tidak diganti interim)
    // 2. Jangan hilangkan toast hingga proses pembaruan selesai 100%
    showToast('Memperbarui rekomendasi...', false, 0);
    btnRefreshRecs.classList.add('is-refreshing');
    btnRefreshRecs.disabled = true;

    try {
      await fetchFreshRecommendationsInBackground(true);
      showToast('Rekomendasi berhasil diperbarui', true, 2800);
    } catch (err) {
      showToast('Gagal memperbarui rekomendasi', false, 2800);
    } finally {
      btnRefreshRecs.classList.remove('is-refreshing');
      btnRefreshRecs.disabled = false;
    }
  });

  function renderCardRow(container, tracks) {
    if (!container) return;
    container.innerHTML = '';

    tracks.forEach((track) => {
      const card = document.createElement('div');
      card.className = 'music-card';
      card.dataset.type = 'music';
      card.innerHTML = `
        <div class="card-art-wrap">
          <img src="${escapeHtml(getTrackArtwork(track))}" alt="${escapeHtml(track.title)}" onerror="handleArtworkImgError(this, '${escapeHtml(track.id || '')}')">
          <button class="card-floating-play" title="Putar ${escapeHtml(track.title)}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="card-title-text" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</div>
        <div class="card-subtext single-line" title="${escapeHtml(track.artist || 'Artis')}">${escapeHtml(track.artist || 'Artis')}</div>
      `;

      card.addEventListener('click', () => {
        playTrack(track, tracks);
      });

      container.appendChild(card);
    });
  }

  // =========================================================================
  // LOAD SYNTH LOCAL TRACKS (137 TRACKS)
  // =========================================================================
  async function loadSynthLibrary() {
    try {
      const res = await fetch('/api/synth-tracks');
      if (!res.ok) return;
      const tracks = await res.json();
      if (!Array.isArray(tracks) || tracks.length === 0) return;

      state.synthLibraryTracks = tracks.filter(t => !isCorruptTrack(t)).map(t => ({ ...t, thumbnail: getTrackArtwork(t) }));

      // If state.history is empty, initialize history with the most recent tracks from the Synth library
      if (!state.history || state.history.length === 0) {
        state.history = state.synthLibraryTracks.slice(0, 15);
        localStorage.setItem('synth_history', JSON.stringify(state.history));
        localStorage.setItem('devsize_history', JSON.stringify(state.history));
      }

      // If player bar hasn't been restored yet, restore the top track (last played song)
      if (!state.currentTrack && state.history.length > 0) {
        restoreLastPlayedTrack(state.history[0]);
      }

      renderRecentlyPlayed();
      renderHomeQuickCards();
      if (!state.recommendations || state.recommendations.length === 0) {
        renderRecommendations();
      }

      const container = document.getElementById('synth-tracks-container') || synthTracksContainer;
      if (synthTrackCount) synthTrackCount.textContent = `${state.synthLibraryTracks.length} Lagu`;
      if (container) {
        renderCardRow(container, state.synthLibraryTracks);
      }
    } catch (e) {
      console.warn('Synth library tracks failed to load:', e);
    }
  }

  loadSynthLibrary();

  // =========================================================================
  // HOME FILTER CHIPS (Semua, Musik, Playlist)
  // =========================================================================
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => {
        c.classList.remove('active');
        c.classList.add('inactive');
      });
      chip.classList.add('active');
      chip.classList.remove('inactive');

      const filter = chip.dataset.filter; // 'all', 'music', 'playlist'

      const secRec = document.getElementById('section-recently-played');
      const secRecs = document.getElementById('section-recommendations');
      const secUserPl = document.getElementById('section-user-playlists');
      const secSynth = document.querySelector('.content-section[data-section="synth-library"]');
      const plWrapper = document.getElementById('quick-playlists-container');
      const qcLiked = document.getElementById('qc-liked-songs');

      if (filter === 'all') {
        if (secRec) secRec.style.display = 'block';
        if (secRecs) secRecs.style.display = 'block';
        if (secUserPl) secUserPl.style.display = 'block';
        if (secSynth) secSynth.style.display = 'block';
        if (plWrapper) plWrapper.style.display = 'contents';
        if (qcLiked) qcLiked.style.display = 'flex';
      } else if (filter === 'music') {
        if (secRec) secRec.style.display = 'block';
        if (secRecs) secRecs.style.display = 'block';
        if (secUserPl) secUserPl.style.display = 'none';
        if (secSynth) secSynth.style.display = 'block';
        if (plWrapper) plWrapper.style.display = 'none';
        if (qcLiked) qcLiked.style.display = 'none';
      } else if (filter === 'playlist') {
        if (secRec) secRec.style.display = 'none';
        if (secRecs) secRecs.style.display = 'none';
        if (secUserPl) secUserPl.style.display = 'block';
        if (secSynth) secSynth.style.display = 'none';
        if (plWrapper) plWrapper.style.display = 'contents';
        if (qcLiked) qcLiked.style.display = 'flex';
      }
    });
  });

  // =========================================================================
  // KEYBOARD SHORTCUTS
  // =========================================================================
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === searchInput) {
      if (e.key === 'Escape') searchInput.blur();
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        btnMainPlay?.click();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
        showToast(`Seek: ${formatTime(audioEl.currentTime)}`);
        break;

      case 'ArrowRight':
        e.preventDefault();
        audioEl.currentTime = Math.min(audioEl.duration || 240, audioEl.currentTime + 5);
        showToast(`Seek: ${formatTime(audioEl.currentTime)}`);
        break;

      case 'ArrowUp':
        e.preventDefault();
        setVolume(state.volume + 0.05, false);
        showToast(`Volume: ${(state.volume * 100).toFixed(0)}%`);
        break;

      case 'ArrowDown':
        e.preventDefault();
        setVolume(state.volume - 0.05, false);
        showToast(`Volume: ${(state.volume * 100).toFixed(0)}%`);
        break;

      case 'KeyM':
        btnVolumeIcon?.click();
        showToast(state.isMuted ? 'Suara dibisukan' : `Volume: ${(state.volume * 100).toFixed(0)}%`);
        break;

      case 'KeyE':
        e.preventDefault();
        openAudioSettingsModal('eq');
        break;

      case 'Slash':
        e.preventDefault();
        searchInput?.focus();
        break;

      case 'Escape':
        modalAddToPl.style.display = 'none';
        queueDrawer.style.display = 'none';
        btnToggleQueue?.classList.remove('active');
        break;
    }
  });

  // =========================================================================
  // FULLSCREEN TOGGLE
  // =========================================================================
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  btnFullscreen?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentTrack) {
      if (state.currentView !== 'lyrics') {
        navigate('lyrics');
        btnToggleLyrics?.classList.add('active');
      }
    }
    toggleFullscreen();
  });

  // =========================================================================
  // SPOTIFY MOBILE NATIVE EVENT HANDLERS
  // =========================================================================
  const mobNavHome = document.getElementById('mob-nav-home');
  const mobNavSearch = document.getElementById('mob-nav-search');
  const mobNavLibrary = document.getElementById('mob-nav-library');
  const mobNavQueue = document.getElementById('mob-nav-queue');

  const blurSearchIfActive = () => {
    if (document.activeElement === mobileSearchField) {
      mobileSearchField.blur();
    }
  };

  mobNavHome?.addEventListener('click', () => {
    blurSearchIfActive();
    navigate('home');
  });

  mobNavSearch?.addEventListener('click', () => {
    navigate('search');
    setTimeout(() => {
      const mobField = document.getElementById('mobile-search-field');
      if (mobField) mobField.focus();
    }, 100);
  });

  mobNavLibrary?.addEventListener('click', () => {
    blurSearchIfActive();
    navigate('liked-songs');
  });

  mobNavQueue?.addEventListener('click', () => {
    blurSearchIfActive();
    toggleQueueDrawer();
  });

  // Mobile dedicated search field
  const mobileSearchField = document.getElementById('mobile-search-field');
  const mobileSearchClear = document.getElementById('mobile-search-clear');
  let mobSearchDebounce = null;

  mobileSearchField?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (mobileSearchClear) mobileSearchClear.style.display = q ? 'block' : 'none';
    if (searchInput) searchInput.value = q;
    clearTimeout(mobSearchDebounce);
    if (!q) {
      if (searchIdleState) searchIdleState.style.display = 'flex';
      if (searchTracksList) searchTracksList.innerHTML = '';
      if (searchTracksHeader) searchTracksHeader.style.display = 'none';
      return;
    }
    mobSearchDebounce = setTimeout(() => {
      performSearch(q);
    }, 350);
  });

  mobileSearchField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      mobileSearchField.blur();
      const q = mobileSearchField.value.trim();
      if (q) performSearch(q);
    }
  });

  // Dismiss keyboard when touch scrolling content
  const mainContentScrollEl = document.getElementById('main-content-scroll');
  mainContentScrollEl?.addEventListener('touchstart', (e) => {
    if (document.activeElement === mobileSearchField && !e.target.closest('#mobile-search-header')) {
      mobileSearchField.blur();
    }
  }, { passive: true });

  mobileSearchClear?.addEventListener('click', () => {
    if (mobileSearchField) {
      mobileSearchField.value = '';
      mobileSearchField.focus();
    }
    mobileSearchClear.style.display = 'none';
    if (searchInput) searchInput.value = '';
    if (searchIdleState) searchIdleState.style.display = 'flex';
    if (searchTracksList) searchTracksList.innerHTML = '';
    if (searchTracksHeader) searchTracksHeader.style.display = 'none';
  });

  // Mobile search platform pills
  document.querySelectorAll('.mob-platform-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setMusicPlatform(btn.dataset.platform || 'youtube', true);
    });
  });

  // Mobile Top Engine Toggle
  const mobileEngineToggle = document.getElementById('mobile-engine-toggle');
  mobileEngineToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const platformOrder = ['youtube', 'ytmusic', 'soundcloud'];
    const curIdx = platformOrder.indexOf(state.currentPlatform || 'youtube');
    const nextIdx = (curIdx + 1) % platformOrder.length;
    setMusicPlatform(platformOrder[nextIdx], true);
  });

  // Mobile Top Filter Chips
  document.querySelectorAll('.mobile-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mobile-chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      // Sync with desktop chips
      document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === filter);
        c.classList.toggle('inactive', c.dataset.filter !== filter);
      });
      applyHomeFilter(filter);
    });
  });

  function applyHomeFilter(filter) {
    const secRecent = document.getElementById('section-recently-played');
    const secRecs = document.getElementById('section-recommendations');
    const secPls = document.getElementById('section-user-playlists');
    const secSynth = document.querySelector('[data-section="synth-library"]');

    if (filter === 'all') {
      [secRecent, secRecs, secPls, secSynth].forEach(s => { if (s) s.style.display = 'block'; });
    } else if (filter === 'music') {
      if (secRecent) secRecent.style.display = 'block';
      if (secRecs) secRecs.style.display = 'block';
      if (secPls) secPls.style.display = 'none';
      if (secSynth) secSynth.style.display = 'block';
    } else if (filter === 'playlist') {
      if (secRecent) secRecent.style.display = 'none';
      if (secRecs) secRecs.style.display = 'none';
      if (secPls) secPls.style.display = 'block';
      if (secSynth) secSynth.style.display = 'none';
    }
  }


  // Restore last played track immediately if available in history
  if (state.history.length > 0 && !isCorruptTrack(state.history[0])) {
    restoreLastPlayedTrack(state.history[0]);
  }

  // See All History (Pin #2)
  const btnSeeAllHistory = document.getElementById('btn-see-all-history');
  btnSeeAllHistory?.addEventListener('click', (e) => {
    e.preventDefault();
    const historyList = (state.history || []).filter(t => !isCorruptTrack(t));
    if (historyList.length === 0) {
      showToast('Belum ada riwayat lagu yang diputar');
      return;
    }
    navigate('playlist-detail', {
      id: 'pl-history',
      name: 'Terakhir Didengarkan',
      description: 'Riwayat semua lagu yang baru saja kamu dengarkan',
      tracks: historyList
    });
  });

  // =========================================================================
  // APP LAUNCH SPLASH SCREEN MANAGER (SPOTIFY LOADING EXPERIENCE)
  // Jeda min 1.0s, max 2.5s agar user merasakan loading mulus & tidak lambat
  // =========================================================================
  let splashDismissed = false;
  function dismissSplashScreen() {
    if (splashDismissed) return;
    splashDismissed = true;
    const splashEl = document.getElementById('app-splash-screen');
    if (!splashEl) return;
    splashEl.classList.add('fade-out');
    setTimeout(() => {
      try {
        splashEl.style.display = 'none';
        splashEl.remove();
      } catch (e) {}
    }, 480);
  }

  // Initial render with graceful loading delay (min 1.1s, max 2.5s)
  const initialLoadPromise = (async () => {
    try {
      renderHistorySection();
      renderUserPlaylistsSection();
      checkSpotifyConnectionStatus();
      navigate('home');
      await loadSynthLibrary();
      if (!state.recommendations || state.recommendations.length < 5) {
        await renderRecommendations();
      }

      // Initialize Spotify Connect (Remote Client or Host PC stream)
      if (state.remoteClientMode && state.remoteHostIp) {
        startClientSSE();
        startClientPolling();
        updateClientUI(true);
      } else {
        updateClientUI(false);
        startHostPcStream();
      }
    } catch (err) {
      console.warn('Initial setup warning:', err);
    }
  })();

  const minDelayPromise = new Promise(resolve => setTimeout(resolve, 800));
  const maxSafetyTimeout = setTimeout(() => dismissSplashScreen(), 1800);

  Promise.all([initialLoadPromise, minDelayPromise]).then(() => {
    clearTimeout(maxSafetyTimeout);
    dismissSplashScreen();
  });

  // =========================================================================
  // SCREEN WAKE LOCK IN LYRICS MODE (P2)
  // =========================================================================
  let lyricsWakeLockSentinel = null;

  async function acquireLyricsWakeLock() {
    if ('wakeLock' in navigator && navigator.wakeLock) {
      try {
        lyricsWakeLockSentinel = await navigator.wakeLock.request('screen');
        lyricsWakeLockSentinel.addEventListener('release', () => {
          lyricsWakeLockSentinel = null;
        });
      } catch (err) {
        console.warn('Screen wakeLock request error:', err);
      }
    }
  }

  async function releaseLyricsWakeLock() {
    if (lyricsWakeLockSentinel) {
      try {
        await lyricsWakeLockSentinel.release();
      } catch (_) {}
      lyricsWakeLockSentinel = null;
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.currentView === 'lyrics' && !lyricsWakeLockSentinel) {
      await acquireLyricsWakeLock();
    }
  });

  // =========================================================================
  // KEYBOARD SHORTCUTS MODAL (P3)
  // =========================================================================
  const modalShortcuts = document.getElementById('modal-shortcuts');
  const btnCloseShortcutsModal = document.getElementById('btn-close-shortcuts-modal');

  function openShortcutsModal() {
    if (modalShortcuts) modalShortcuts.style.display = 'flex';
  }

  function closeShortcutsModal() {
    if (modalShortcuts) modalShortcuts.style.display = 'none';
  }

  btnCloseShortcutsModal?.addEventListener('click', closeShortcutsModal);
  modalShortcuts?.addEventListener('click', (e) => {
    if (e.target === modalShortcuts) closeShortcutsModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      openShortcutsModal();
    } else if (e.key === 'Escape') {
      closeShortcutsModal();
    }
  });

  // =========================================================================
  // DESKTOP TRACK CONTEXT MENU (P1)
  // =========================================================================
  const desktopContextMenu = document.getElementById('desktop-context-menu');
  const ctxPlayNext = document.getElementById('ctx-play-next');
  const ctxAddToQueue = document.getElementById('ctx-add-to-queue');
  const ctxAddToPlaylist = document.getElementById('ctx-add-to-playlist');
  const ctxLikeTrack = document.getElementById('ctx-like-track');
  const ctxCopyLink = document.getElementById('ctx-copy-link');

  let contextTrack = null;

  function showContextMenu(e, track) {
    if (!desktopContextMenu || !track) return;
    e.preventDefault();
    e.stopPropagation();
    contextTrack = track;

    const isFav = state.favorites.some(f => (f.id || f.title) === (track.id || track.title));
    if (ctxLikeTrack) {
      const span = ctxLikeTrack.querySelector('span');
      if (span) span.textContent = isFav ? 'Batal Suka' : 'Suka';
    }

    desktopContextMenu.style.display = 'block';
    const menuWidth = desktopContextMenu.offsetWidth || 190;
    const menuHeight = desktopContextMenu.offsetHeight || 180;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

    desktopContextMenu.style.left = `${Math.max(8, x)}px`;
    desktopContextMenu.style.top = `${Math.max(8, y)}px`;
  }

  function hideContextMenu() {
    if (desktopContextMenu) desktopContextMenu.style.display = 'none';
    contextTrack = null;
  }

  document.addEventListener('click', hideContextMenu);
  window.addEventListener('blur', hideContextMenu);
  window.addEventListener('resize', hideContextMenu);

  // P1 Actions: Putar Berikutnya, Tambah ke Antrean, Tambah ke Playlist, Suka, Salin Link
  ctxPlayNext?.addEventListener('click', () => {
    if (!contextTrack) return;
    state.queue.splice(state.queueIndex + 1, 0, contextTrack);
    renderQueueDrawer();
    showToast(`Putar Berikutnya: ${contextTrack.title}`);
    hideContextMenu();
  });

  ctxAddToQueue?.addEventListener('click', () => {
    if (!contextTrack) return;
    state.queue.push(contextTrack);
    renderQueueDrawer();
    showToast(`Tambah ke Antrean: ${contextTrack.title}`);
    hideContextMenu();
  });

  ctxAddToPlaylist?.addEventListener('click', () => {
    if (!contextTrack) return;
    openAddToPlaylistModal(contextTrack);
    hideContextMenu();
  });

  ctxLikeTrack?.addEventListener('click', () => {
    if (!contextTrack) return;
    toggleLikeTrack(contextTrack);
    hideContextMenu();
  });

  ctxCopyLink?.addEventListener('click', async () => {
    if (!contextTrack) return;
    const url = `https://synth.app/track/${encodeURIComponent(contextTrack.id || '')}`;
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(url);
      showToast('Salin Link berhasil disalin ke papan klip');
    } catch (_) {
      showToast(`Salin Link: ${url}`);
    }
    hideContextMenu();
  });

  document.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.spotify-table-row, .track-card, .search-track-row');
    if (row && row.__trackData) {
      showContextMenu(e, row.__trackData);
    }
  });

  // Initialize Audio Settings UI & Equalizer Modal
  setupAudioSettingsUI();

  // =========================================================================
  // APPLICATION UPDATE SYSTEM (PC & Mobile Startup Background Check)
  // =========================================================================
  const CURRENT_APP_VERSION = '2.0.0';
  const GITHUB_REPO = 'MrPainOi/Synth';
  const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
  const UPDATE_VERSION_JSON_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.json`;
  const UPDATE_PKG_JSON_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json`;
  const UPDATE_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  const modalUpdateDialog = document.getElementById('modal-update-dialog');
  const btnCloseUpdateModal = document.getElementById('btn-close-update-modal');
  const btnUpdateLater = document.getElementById('btn-update-later');
  const btnUpdateNow = document.getElementById('btn-update-now');
  const updateVerNow = document.getElementById('update-ver-now');
  const updateVerNew = document.getElementById('update-ver-new');
  const updateDescription = document.getElementById('update-description');
  const updateChangelogList = document.getElementById('update-changelog-list');
  const updateNoteText = document.getElementById('update-note-text');

  let activeUpdateInfo = null;

  function parseSemver(v) {
    if (!v || typeof v !== 'string') return [0, 0, 0];
    const cleaned = v.trim().replace(/^v/i, '').split('-')[0];
    const parts = cleaned.split('.').map(n => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function compareSemver(v1, v2) {
    const p1 = parseSemver(v1);
    const p2 = parseSemver(v2);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  function openUpdateModal(updateData) {
    if (!modalUpdateDialog) return;
    activeUpdateInfo = updateData;

    if (updateVerNow) updateVerNow.textContent = `v${updateData.currentVersion}`;
    if (updateVerNew) updateVerNew.textContent = `v${updateData.latestVersion}`;

    if (updateDescription) {
      updateDescription.textContent = updateData.description ||
        `Versi terbaru Synth 2 (v${updateData.latestVersion}) telah tersedia di Git dengan perbaikan dan peningkatan fitur.`;
    }

    if (updateChangelogList) {
      updateChangelogList.innerHTML = '';
      const notes = (Array.isArray(updateData.changelog) && updateData.changelog.length > 0)
        ? updateData.changelog
        : [`Pembaruan performa dan peningkatan stabilitas untuk v${updateData.latestVersion}.`];
      notes.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        updateChangelogList.appendChild(li);
      });
    }

    if (updateNoteText) {
      if (isNativeAndroid || isPhone) {
        updateNoteText.textContent = 'Paket APK Android terdeteksi. Ketuk "Update" untuk mengunduh APK terbaru.';
      } else {
        updateNoteText.textContent = 'Rilis PC terdeteksi. Klik "Update" untuk membuka halaman rilis GitHub.';
      }
    }

    modalUpdateDialog.style.display = 'flex';
  }

  function closeUpdateModal() {
    if (modalUpdateDialog) modalUpdateDialog.style.display = 'none';
  }

  async function checkAppUpdates(options = { silent: true }) {
    try {
      let currentVersion = CURRENT_APP_VERSION;
      if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
        try {
          const v = await window.electronAPI.getAppVersion();
          if (v) currentVersion = v;
        } catch (_) {}
      }

      let remoteVersion = null;
      let changelog = [];
      let downloadUrls = null;

      // 1. Try raw version.json from user's Git
      try {
        const res = await fetch(`${UPDATE_VERSION_JSON_URL}?_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.version) {
            remoteVersion = data.version;
            changelog = data.changelog || [];
            downloadUrls = data.downloadUrls || null;
          }
        }
      } catch (_) {}

      // 2. Fallback to raw package.json from user's Git
      if (!remoteVersion) {
        try {
          const res = await fetch(`${UPDATE_PKG_JSON_URL}?_t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.version) {
              remoteVersion = data.version;
            }
          }
        } catch (_) {}
      }

      // 3. Fallback to GitHub Releases API
      if (!remoteVersion) {
        try {
          const res = await fetch(UPDATE_RELEASE_API_URL, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.tag_name) {
              remoteVersion = data.tag_name.replace(/^v/i, '');
              if (data.body) {
                changelog = data.body.split('\n').filter(l => l.trim().length > 0).slice(0, 5);
              }
            }
          }
        } catch (_) {}
      }

      if (!remoteVersion) {
        if (!options.silent) showToast('Aplikasi sudah versi terbaru atau gagal memeriksa update.', true);
        return { hasUpdate: false };
      }

      const isNewer = compareSemver(remoteVersion, currentVersion) > 0;
      if (isNewer) {
        const updateInfo = {
          currentVersion,
          latestVersion: remoteVersion,
          changelog,
          downloadUrls: downloadUrls || {
            android: `${GITHUB_REPO_URL}/releases/latest/download/Synth-Spotify.apk`,
            androidRaw: `${GITHUB_REPO_URL}/raw/main/Synth-Spotify.apk`,
            pc: `${GITHUB_REPO_URL}/releases/latest`,
            releases: `${GITHUB_REPO_URL}/releases`
          }
        };

        // If silent (startup), check if dismissed in current session
        const dismissed = sessionStorage.getItem('synth_update_dismissed');
        if (options.silent && dismissed === remoteVersion) {
          return { hasUpdate: true, updateInfo, suppressed: true };
        }

        openUpdateModal(updateInfo);
        return { hasUpdate: true, updateInfo };
      } else {
        if (!options.silent) {
          showToast(`Versi aplikasi saat ini (v${currentVersion}) adalah yang terbaru.`, true);
        }
        return { hasUpdate: false, currentVersion };
      }
    } catch (err) {
      console.warn('[UpdateChecker] Error checking updates:', err);
      if (!options.silent) showToast('Gagal terhubung ke server update.', false);
      return { hasUpdate: false, error: err.message };
    }
  }

  function handleUpdateAction() {
    if (!activeUpdateInfo) return;
    const urls = activeUpdateInfo.downloadUrls || {};
    let targetUrl = (isNativeAndroid || isPhone)
      ? (urls.android || urls.androidRaw || `${GITHUB_REPO_URL}/raw/main/Synth-Spotify.apk`)
      : (urls.pc || urls.releases || `${GITHUB_REPO_URL}/releases/latest`);

    showToast('Membuka tautan unduhan pembaruan...', true);

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      try {
        window.Capacitor.Plugins.Browser.open({ url: targetUrl });
      } catch (_) {
        window.open(targetUrl, '_system') || (window.location.href = targetUrl);
      }
    } else {
      window.open(targetUrl, '_blank') || (window.location.href = targetUrl);
    }

    closeUpdateModal();
  }

  // Event Listeners for Update Modal
  btnCloseUpdateModal?.addEventListener('click', closeUpdateModal);
  btnUpdateLater?.addEventListener('click', () => {
    if (activeUpdateInfo && activeUpdateInfo.latestVersion) {
      sessionStorage.setItem('synth_update_dismissed', activeUpdateInfo.latestVersion);
    }
    closeUpdateModal();
  });
  btnUpdateNow?.addEventListener('click', handleUpdateAction);

  modalUpdateDialog?.addEventListener('click', (e) => {
    if (e.target === modalUpdateDialog) closeUpdateModal();
  });

  document.getElementById('btn-check-updates')?.addEventListener('click', () => {
    checkAppUpdates({ silent: false });
  });

  // Automated background check on startup (runs 2.5s after boot)
  setTimeout(() => {
    checkAppUpdates({ silent: true });
  }, 2500);

  // Export SynthAudioEngine interface contract (PROJECT.md)
  window.openAudioSettingsModal = openAudioSettingsModal;
  window.closeAudioSettingsModal = closeAudioSettingsModal;
  window.SynthAudioEngine = {
    setPreset,
    setTone,
    setBandGain,
    resetEqualizer,
    setCrossfadeDuration,
    playTrackWithCrossfade,
    crossfadeToTrack: playTrackWithCrossfade,
    cancelActiveCrossfade,
    isAudioPreviewClip,
    ensureAudioContextRunning,
    openAudioSettings: openAudioSettingsModal,
    closeAudioSettings: closeAudioSettingsModal,
    getPresets: () => AUDIO_PRESETS,
    getActivePresetId: () => currentActivePresetId,
    getCurrentDSPParameters: () => ({ ...currentDSPDeltas }),
    getCrossfadeDuration: () => crossfadeDuration,
    getAudioContext: () => audioCtx,
    getDecks: () => ({ deckA: audioDeckA, deckB: audioDeckB, activeDeck, inactiveDeck }),
    preloadNextTrack,
    getPreloadedStreamCache: () => preloadedStreamCache,
    getPreloadedNextTrack: () => preloadedNextTrack,
    checkAppUpdates,
    openUpdateModal,
    closeUpdateModal,
    compareSemver,
    getCurrentAppVersion: () => CURRENT_APP_VERSION
  };

  // Unlock AudioContext on first user interaction
  ['click', 'touchstart', 'keydown'].forEach((evt) => {
    document.addEventListener(evt, () => {
      ensureAudioContextRunning();
    }, { once: true, passive: true });
  });

  // Native Android Media Controls Bridge (MurielMedia plugin)
  window.MurielCore = {
    state,
    audio: audioEl,
    thumb: (t) => (t && (t.thumbnail || t.art)) || '',
    playTrack,
    togglePlay: () => btnMainPlay?.click(),
    next: playNextTrack,
    prev: playPrevTrack,
    seek: (sec) => { seekAudio(sec); },
    updateActiveRowIndicators: () => updateActiveRowIndicators()
  };
  try {
    window.dispatchEvent(new CustomEvent('muriel:ready'));
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
