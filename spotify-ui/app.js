/**
 * Spotify Web UI - Interactive Application Logic with Synth Backend Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let isPlaying = false;
  let currentTime = 0;
  let duration = 243; // default duration
  let volume = 0.75;
  let isMuted = false;
  let isShuffle = false;
  let isRepeat = false;
  let isLiked = false;
  let progressInterval = null;

  // Real HTML5 audio instance for Synth backend tracks
  let realAudio = new Audio();
  realAudio.volume = volume;
  let isRealAudioPlaying = false;

  // --- AUDIO SYNTHESIZER (Fallback Web Audio API) ---
  let audioCtx = null;
  let synthGain = null;
  let synthTimer = null;
  let chordIndex = 0;

  const chords = [
    [261.63, 329.63, 392.00, 523.25], // C major
    [220.00, 261.63, 329.63, 440.00], // A minor
    [174.61, 220.00, 261.63, 349.23], // F major
    [196.00, 246.94, 293.66, 392.00], // G major
  ];

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      synthGain = audioCtx.createGain();
      synthGain.gain.setValueAtTime(volume * 0.15, audioCtx.currentTime);
      synthGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playSynthChord() {
    if (!audioCtx || !isPlaying || isRealAudioPlaying) return;
    try {
      const chord = chords[chordIndex % chords.length];
      chordIndex++;

      chord.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();

        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        noteGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
        noteGain.gain.exponentialRampToValueAtTime(0.04, audioCtx.currentTime + 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);

        osc.connect(noteGain);
        noteGain.connect(synthGain);

        osc.start();
        osc.stop(audioCtx.currentTime + 1.9);
      });
    } catch (e) {}
  }

  function startSynthPlayback() {
    initAudioContext();
    playSynthChord();
    synthTimer = setInterval(playSynthChord, 1800);
  }

  function stopSynthPlayback() {
    if (synthTimer) {
      clearInterval(synthTimer);
      synthTimer = null;
    }
  }

  // --- DOM ELEMENTS ---
  const btnMainPlay = document.getElementById('btn-main-play');
  const playPauseIcon = document.getElementById('play-pause-icon');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  const timelineWrap = document.getElementById('timeline-wrap');
  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');

  const btnVolumeIcon = document.getElementById('btn-volume-icon');
  const volumeWrap = document.getElementById('volume-wrap');
  const volumeFill = document.getElementById('volume-fill');
  const volumeThumb = document.getElementById('volume-thumb');
  const volumeIconSvg = document.getElementById('volume-icon-svg');

  const btnShuffle = document.getElementById('btn-shuffle');
  const btnRepeat = document.getElementById('btn-repeat');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnLike = document.getElementById('btn-like-track');

  const trackArt = document.getElementById('current-track-art');
  const trackTitle = document.getElementById('current-track-title');
  const trackArtist = document.getElementById('current-track-artist');

  const filterChips = document.querySelectorAll('.filter-chip');
  const searchInput = document.getElementById('search-input');
  const searchBoxPill = document.getElementById('search-box-pill');
  const urlTooltip = document.getElementById('url-tooltip');
  const mainView = document.getElementById('main-view');
  const filterChipsBar = document.getElementById('filter-chips-bar');
  const synthTracksContainer = document.getElementById('synth-tracks-container');

  // --- TIME FORMATTER ---
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  timeDuration.textContent = formatTime(duration);

  // --- REAL AUDIO EVENT HANDLERS ---
  realAudio.addEventListener('timeupdate', () => {
    if (isRealAudioPlaying) {
      currentTime = Math.floor(realAudio.currentTime);
      if (realAudio.duration && !isNaN(realAudio.duration)) {
        duration = Math.floor(realAudio.duration);
        timeDuration.textContent = formatTime(duration);
      }
      renderProgress();
    }
  });

  realAudio.addEventListener('ended', () => {
    if (isRepeat) {
      realAudio.currentTime = 0;
      realAudio.play();
    } else {
      btnNext.click();
    }
  });

  realAudio.addEventListener('error', () => {
    // If real audio stream fails, fallback smoothly to Web Audio synth
    if (isPlaying) {
      isRealAudioPlaying = false;
      startSynthPlayback();
    }
  });

  // --- PLAYBACK CONTROL ---
  function togglePlay() {
    isPlaying = !isPlaying;
    updatePlayState();
  }

  function updatePlayState() {
    if (isPlaying) {
      playPauseIcon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
      btnMainPlay.title = 'Jeda';

      if (isRealAudioPlaying) {
        realAudio.play().catch(() => {
          isRealAudioPlaying = false;
          startSynthPlayback();
        });
      } else {
        startSynthPlayback();
        if (!progressInterval) {
          progressInterval = setInterval(() => {
            if (currentTime >= duration) {
              if (isRepeat) {
                currentTime = 0;
              } else {
                currentTime = 0;
                togglePlay();
                return;
              }
            } else {
              currentTime += 1;
            }
            renderProgress();
          }, 1000);
        }
      }
    } else {
      playPauseIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
      btnMainPlay.title = 'Putar';

      if (isRealAudioPlaying) {
        realAudio.pause();
      }
      stopSynthPlayback();

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }
  }

  function renderProgress() {
    timeCurrent.textContent = formatTime(currentTime);
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    timelineFill.style.width = `${pct}%`;
    timelineThumb.style.left = `${pct}%`;
  }

  btnMainPlay.addEventListener('click', togglePlay);

  // --- TIMELINE SCRUBBING ---
  function handleTimelineSeek(e) {
    const rect = timelineWrap.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentTime = Math.floor(pos * duration);
    if (isRealAudioPlaying && realAudio.duration) {
      realAudio.currentTime = currentTime;
    }
    renderProgress();
    if (!isPlaying) {
      togglePlay();
    }
  }

  timelineWrap.addEventListener('click', handleTimelineSeek);

  let isScrubbing = false;
  timelineWrap.addEventListener('mousedown', () => { isScrubbing = true; });
  window.addEventListener('mouseup', () => { isScrubbing = false; });
  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) handleTimelineSeek(e);
  });

  // --- VOLUME CONTROL ---
  function updateVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    isMuted = volume === 0;
    volumeFill.style.width = `${volume * 100}%`;
    volumeThumb.style.left = `${volume * 100}%`;

    realAudio.volume = volume;
    if (synthGain && audioCtx) {
      synthGain.gain.setValueAtTime(volume * 0.15, audioCtx.currentTime);
    }

    if (volume === 0) {
      volumeIconSvg.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
      btnVolumeIcon.title = 'Bunyikan';
    } else if (volume < 0.5) {
      volumeIconSvg.innerHTML = `<path d="M5 9v6h4l5 5V4L9 9H5zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
      btnVolumeIcon.title = 'Bisukan';
    } else {
      volumeIconSvg.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
      btnVolumeIcon.title = 'Bisukan';
    }
  }

  function handleVolumeSeek(e) {
    const rect = volumeWrap.getBoundingClientRect();
    const val = (e.clientX - rect.left) / rect.width;
    updateVolume(val);
  }

  volumeWrap.addEventListener('click', handleVolumeSeek);

  let isDraggingVolume = false;
  volumeWrap.addEventListener('mousedown', () => { isDraggingVolume = true; });
  window.addEventListener('mouseup', () => { isDraggingVolume = false; });
  window.addEventListener('mousemove', (e) => {
    if (isDraggingVolume) handleVolumeSeek(e);
  });

  btnVolumeIcon.addEventListener('click', () => {
    if (volume > 0) {
      btnVolumeIcon.dataset.lastVol = volume;
      updateVolume(0);
    } else {
      updateVolume(parseFloat(btnVolumeIcon.dataset.lastVol) || 0.75);
    }
  });

  // --- SHUFFLE & REPEAT ---
  btnShuffle.addEventListener('click', () => {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle('active', isShuffle);
  });

  btnRepeat.addEventListener('click', () => {
    isRepeat = !isRepeat;
    btnRepeat.classList.toggle('active', isRepeat);
  });

  // --- PREV / NEXT ---
  btnPrev.addEventListener('click', () => {
    currentTime = 0;
    if (isRealAudioPlaying) realAudio.currentTime = 0;
    renderProgress();
  });

  btnNext.addEventListener('click', () => {
    currentTime = 0;
    const cards = Array.from(document.querySelectorAll('.music-card, .music-card-compact:not(.hidden-by-filter)'));
    if (cards.length > 0) {
      const randomCard = cards[Math.floor(Math.random() * cards.length)];
      triggerCardClick(randomCard);
    }
  });

  // --- LIKE BUTTON TOGGLE ---
  btnLike.addEventListener('click', () => {
    isLiked = !isLiked;
    if (isLiked) {
      btnLike.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1ed760">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      `;
      btnLike.title = 'Hapus dari Koleksi Kamu';
    } else {
      btnLike.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z"/>
        </svg>
      `;
      btnLike.title = 'Simpan ke Koleksi Kamu';
    }
  });

  // --- SELECT & PLAY TRACK ---
  function selectTrack(title, artist, artUrl, streamUrl, dur) {
    if (title) trackTitle.textContent = title;
    if (artist) trackArtist.textContent = artist;
    if (artUrl) trackArt.src = artUrl;

    currentTime = 0;
    duration = dur ? parseInt(dur, 10) : 243;
    timeDuration.textContent = formatTime(duration);
    renderProgress();

    // If streamUrl is provided from Synth backend, use real audio!
    if (streamUrl) {
      stopSynthPlayback();
      realAudio.src = streamUrl;
      realAudio.currentTime = 0;
      isRealAudioPlaying = true;
    } else {
      realAudio.pause();
      isRealAudioPlaying = false;
    }

    isPlaying = true;
    updatePlayState();
  }

  function triggerCardClick(el) {
    const title = el.dataset.title || el.title;
    const artist = el.dataset.artist || 'Spotify';
    const art = el.dataset.art || (el.querySelector('img') ? el.querySelector('img').src : 'assets/radio_thumb.png');
    const streamUrl = el.dataset.stream || '';
    const dur = el.dataset.duration || '';
    selectTrack(title, artist, art, streamUrl, dur);
  }

  function bindPlayableElement(el) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-hero-add')) return;
      triggerCardClick(el);
    });

    el.addEventListener('mouseenter', () => {
      const title = (el.dataset.title || el.title || 'playlist').toLowerCase().replace(/\s+/g, '-');
      urlTooltip.textContent = `https://open.spotify.com/intl-id/playlist/37i9dQZF1DX${Math.abs(hashString(title)).toString(16)}`;
      urlTooltip.classList.add('visible');
    });

    el.addEventListener('mouseleave', () => {
      urlTooltip.classList.remove('visible');
    });
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // Bind initial static elements
  document.querySelectorAll('.quick-card, .featured-hero-card, .music-card, .music-card-compact, .sidebar-item').forEach(bindPlayableElement);

  // --- LOAD SYNTH BACKEND TRACKS ---
  async function loadSynthBackendTracks() {
    try {
      const res = await fetch('/api/synth-tracks');
      if (!res.ok) return;
      const tracks = await res.json();
      if (!Array.isArray(tracks) || tracks.length === 0) return;

      synthTracksContainer.innerHTML = '';

      // Take up to 14 top tracks from user's Synth library
      tracks.slice(0, 14).forEach(t => {
        const card = document.createElement('div');
        card.className = 'music-card';
        card.dataset.type = 'music';
        card.dataset.title = t.title;
        card.dataset.artist = t.artist || 'Synth';
        card.dataset.art = t.thumbnail || 'assets/radio_thumb.png';
        card.dataset.stream = t.streamUrl || '';
        card.dataset.duration = t.duration || '240';

        card.innerHTML = `
          <div class="card-art-wrap">
            <img src="${t.thumbnail || 'assets/radio_thumb.png'}" alt="${t.title}" onerror="this.src='assets/radio_thumb.png'">
            <button class="card-floating-play" title="Putar ${t.title}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
          <div class="card-title-text" title="${t.title}">${t.title}</div>
          <div class="card-subtext single-line">${t.artist || 'Synth Track'}</div>
        `;

        bindPlayableElement(card);
        synthTracksContainer.appendChild(card);
      });
    } catch (e) {
      console.warn('Synth backend tracks not loaded:', e);
    }
  }

  loadSynthBackendTracks();

  // --- FILTER CHIPS SWITCHER (Semua, Musik, Playlist) ---
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => {
        c.classList.remove('active');
        c.classList.add('inactive');
      });
      chip.classList.add('active');
      chip.classList.remove('inactive');

      const filter = chip.dataset.filter; // 'all', 'music', 'playlist'

      // 1. Quick Cards Grid
      document.querySelectorAll('.quick-card').forEach((card) => {
        const type = card.dataset.type || 'playlist';
        if (filter === 'all') {
          card.classList.remove('hidden-by-filter');
        } else if (filter === 'music') {
          if (type === 'music') card.classList.remove('hidden-by-filter');
          else card.classList.add('hidden-by-filter');
        } else if (filter === 'playlist') {
          if (type === 'playlist') card.classList.remove('hidden-by-filter');
          else card.classList.add('hidden-by-filter');
        }
      });

      // 2. Middle Split Row (night pop & Daily Mixes are Playlists)
      const middleRow = document.querySelector('.middle-split-row');
      if (middleRow) {
        if (filter === 'music') {
          middleRow.classList.add('hidden-by-filter');
        } else {
          middleRow.classList.remove('hidden-by-filter');
        }
      }

      // 3. Baru Diputar Cards
      document.querySelectorAll('.cards-horizontal-row[data-section="recent"] .music-card').forEach((card) => {
        const type = card.dataset.type || 'playlist';
        if (filter === 'all') {
          card.classList.remove('hidden-by-filter');
        } else if (filter === 'music') {
          if (type === 'music') card.classList.remove('hidden-by-filter');
          else card.classList.add('hidden-by-filter');
        } else if (filter === 'playlist') {
          if (type === 'playlist') card.classList.remove('hidden-by-filter');
          else card.classList.add('hidden-by-filter');
        }
      });

      // 4. Synth Music Collection Section (Music only)
      const synthHeader = document.getElementById('section-synth-header');
      const synthContainer = document.getElementById('synth-tracks-container');
      if (synthHeader && synthContainer) {
        if (filter === 'playlist') {
          synthHeader.classList.add('hidden-by-filter');
          synthContainer.classList.add('hidden-by-filter');
        } else {
          synthHeader.classList.remove('hidden-by-filter');
          synthContainer.classList.remove('hidden-by-filter');
        }
      }
    });
  });

  // --- STICKY HEADER SCROLL EFFECT ---
  mainView.addEventListener('scroll', () => {
    if (mainView.scrollTop > 20) {
      filterChipsBar.classList.add('scrolled');
    } else {
      filterChipsBar.classList.remove('scrolled');
    }
  });

  // --- SEARCH BAR INPUT FOCUS ---
  searchInput.addEventListener('focus', () => {
    searchBoxPill.classList.add('focused');
  });

  searchInput.addEventListener('blur', () => {
    searchBoxPill.classList.remove('focused');
  });

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    const allCards = document.querySelectorAll('.quick-card, .music-card, .music-card-compact');
    allCards.forEach((card) => {
      const title = (card.dataset.title || '').toLowerCase();
      const artist = (card.dataset.artist || '').toLowerCase();
      if (!val || title.includes(val) || artist.includes(val)) {
        card.style.opacity = '1';
        card.style.filter = 'none';
      } else {
        card.style.opacity = '0.25';
        card.style.filter = 'grayscale(80%)';
      }
    });
  });

  // --- FULLSCREEN TOGGLE ---
  const btnFullscreen = document.getElementById('btn-fullscreen');
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  });
});
