# Project: Synth Spotify Feature Enhancements & Bug Fixes

## Architecture
The application is a full-featured Spotify-themed progressive web application and Android hybrid app located in `d:\riff\synth-spotify`:
- **Frontend Core (`synth-spotify/app.js`, `index.html`, `styles.css`)**:
  - Modular single-page application maintaining `state` (active track, queue, playlists, favorites, offline tracks, audio DSP parameters).
  - Web Audio API DSP pipeline (`Deck A` & `Deck B` dual HTMLAudioElements -> MediaElementAudioSourceNodes -> GainNodes -> Equalizer BiquadFilter chain -> Effects bus -> Master Gain -> AudioContext destination).
  - DOM view rendering for Home, Search, Liked Songs, Playlist Detail, Queue Drawer, Lyrics Mode, Modals, and Fullscreen Mobile Player.
- **Backend API & Streaming Proxy (`synth-spotify/server.js`, `d:\riff\server.js`)**:
  - Express.js HTTP server managing metadata searching, audio stream resolution via `yt-dlp`, external playlist importing (Spotify, Apple Music, YouTube), and offline track storage.
- **Android Runtime & Packager (`synth-spotify/mobile-bridge.js`, `synth-spotify/build-android.js`)**:
  - Capacitor-based hybrid Android client.
  - Repackaging script bundles frontend assets into `assets/public/` inside `Synth.apk`, aligns with `zipalign`, and signs with `apksigner` generating `Synth-Spotify.apk`.

```
+---------------------------------------------------------------------------------------+
|                                    synth-spotify                                      |
|                                                                                       |
|   +--------------------+      +-----------------------+      +--------------------+   |
|   |    Desktop View    |      | Mobile Fullscreen UI  |      |   Modals & Menus   |   |
|   |  - Track Rows      |      |  - Swipe Gestures     |      |  - Context Menu    |   |
|   |  - Liked Songs     |      |  - Queue Drawer       |      |  - Cheat Sheet     |   |
|   |  - Custom Playlist |      |  - Dismiss Gesture    |      |  - Audio Settings  |   |
|   +--------------------+      +-----------------------+      +--------------------+   |
|               \                           |                           /               |
|                \                          |                          /                |
|                 +-------------------------v-------------------------+                 |
|                 |          State & Event Orchestration              |                 |
|                 |      (state.queue, state.playlists, etc.)         |                 |
|                 +-------------------------+-------------------------+                 |
|                                           |                                           |
|                 +-------------------------v-------------------------+                 |
|                 |       Dual-Deck Web Audio DSP Engine              |                 |
|                 |  Deck A/B -> Crossfade -> EQ -> Presets -> Dest   |                 |
|                 +-------------------------+-------------------------+                 |
|                                           |                                           |
|                 +-------------------------v-------------------------+                 |
|                 |   Stream Resolution & Offline Storage Manager     |                 |
|                 | (Full-stream guard, Quota checker, Import client) |                 |
|                 +-------------------------+-------------------------+                 |
+-------------------------------------------|-------------------------------------------+
                                            |
                                 +----------v----------+
                                 |  Backend / Bridge   |
                                 |  /api/stream-info   |
                                 |  /api/*-import      |
                                 |  /api/offline-*     |
                                 +---------------------+
```

## Feature Inventory
Every feature from user requirements is assigned to an authoritative milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | M1: Mobile Share Removal | Completely remove `btn-mob-share` from fullscreen mobile player | M2 | ORIGINAL_REQUEST §R1 |
| 2 | M2: Playlist Song Deletion | Add delete button for individual songs in custom playlist views | M2 | ORIGINAL_REQUEST §R1 |
| 3 | M3: Liked Songs Heart Toggle | Interactive heart icon on track rows in "Lagu yang Disukai" | M2 | ORIGINAL_REQUEST §R1 |
| 4 | M4: Mobile Player Swipe Gestures | Swipe down to dismiss player, swipe left/right on art for prev/next | M2 | ORIGINAL_REQUEST §R1 |
| 5 | M5: Queue Population & Clear | Populate upcoming songs when playing, add "Kosongkan Antrean" button, fix `toggleQueueDrawer` | M2 | ORIGINAL_REQUEST §R1 |
| 6 | P1: Desktop Context Menu | Right-click menu (Putar Berikutnya, Tambah ke Antrean, Tambah ke Playlist, Suka, Salin Link) | M3 | ORIGINAL_REQUEST §R2 |
| 7 | P2: Screen Wake Lock | Keep display awake during Lyrics Mode via `navigator.wakeLock` | M3 | ORIGINAL_REQUEST §R2 |
| 8 | P3: Keyboard Shortcut Modal | Keyboard cheat sheet dialog opened via `?` or `Shift + /` | M3 | ORIGINAL_REQUEST §R2 |
| 9 | F1: Audio Preset Effects | Port Default, Slowed + Reverb, Speed Up (1.35x), Bass Boost presets | M1 | ORIGINAL_REQUEST §R3 |
| 10 | F2: Audio Equalizer & Tone | 10-band Graphic EQ + Treble/Bass quick tone controls | M1 | ORIGINAL_REQUEST §R3 |
| 11 | F3: Smooth Audio Crossfade | Dual-deck 0-12s gapless crossfade transitions | M1 | ORIGINAL_REQUEST §R3 |
| 12 | F5: External Playlist Import | Import playlists from Spotify, Apple Music, and YouTube links | M3 | ORIGINAL_REQUEST §R4 |
| 13 | F6: Offline Storage Management | Storage cap config (1GB/2GB/3GB/custom), usage indicator, pre-download alerts | M3 | ORIGINAL_REQUEST §R4 |
| 14 | R5-A: 29s Audio Truncation Fix | Reject preview clips, require full streams, duration bounds & fallback recovery | M1 | ORIGINAL_REQUEST §R5 |
| 15 | R5-B: Android Build Verification | Execute `node synth-spotify/build-android.js` and verify `Synth-Spotify.apk` | M5 | ORIGINAL_REQUEST §R5 |
| 16 | R6: Post-Completion Recommendations | Comprehensive final report of discovered bugs, improvements, enhancements | M5 | ORIGINAL_REQUEST §R6 |
| 17 | T1-T4: Opaque-Box E2E Test Suite | End-to-end multi-tier test harness and verification runner | M4 | PROJECT PATTERN |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Audio Core & Truncation Fix | 29s Bug Fix (R5-A), DSP Presets (F1), Equalizer & Tone (F2), Dual-Deck Crossfade (F3), Audio Settings Modal | none | DONE |
| M2 | Mobile Player & Playlists | Remove Share (M1), Delete Song (M2), Liked Heart Toggle (M3), Swipe Gestures (M4), Queue Population & Clear (M5) | none | IN_PROGRESS |
| M3 | Desktop Usability & Library | Desktop Context Menu (P1), Wake Lock (P2), Shortcuts Modal (P3), Playlist Import (F5), Offline Storage Cap & Alerts (F6) | M1, M2 interfaces | PLANNED |
| M4 | E2E Testing Track | Independent Opaque-box Test Suite (Tiers 1-4) covering all requirements; publish `TEST_READY.md` | none | DONE |
| M5 | Final Verification & Hardening | Phase 1: 100% E2E test pass (Tiers 1-4) + Android APK build (`Synth-Spotify.apk`). Phase 2: Tier 5 Adversarial Coverage Hardening. Final R6 Recommendations report. | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### Audio Engine (`synth-spotify/app.js`) ↔ UI Controllers
- **`window.SynthAudioEngine`**:
  - `setPreset(presetId: 'p_default' | 'p_slowed' | 'p_nightcore' | 'p_bassboost'): void`
  - `setTone(bassGain: number, midGain: number, trebleGain: number): void` (-12 to +12 dB)
  - `setBandGain(index: number, gainDb: number): void` (index 0..9, -12 to +12 dB)
  - `resetEqualizer(): void` (resets all tone and band gains to 0 dB)
  - `setCrossfadeDuration(seconds: number): void` (0 to 12s)
  - `playTrackWithCrossfade(track: Object, resumeTime?: number): Promise<void>`
  - `ensureAudioContextRunning(): Promise<void>`

### Queue Management ↔ Mobile & Desktop UI
- **`state.queue`** & upcoming track helper:
  - `populateUpcomingQueue(currentTrack: Object, baseQueue?: Array): Array`
  - `clearQueue(): void` (clears upcoming items, preserves `state.currentTrack`, renders empty queue UI)
  - `toggleQueueDrawer(): void` (robust toggle function resolving previous ReferenceError)

### Desktop Context Menu ↔ Track Rows
- Context menu DOM node `#spotify-context-menu` attached to document body.
- Track rows attach `row.__trackData = track` and on `contextmenu` call `openContextMenu(e, track)`.
- Actions:
  - Play Next: inserts track at `state.queueIndex + 1`
  - Add to Queue: pushes track to `state.queue`
  - Add to Playlist: opens playlist picker submenu / modal
  - Like: toggles like state via `toggleLikeTrack(track)`
  - Copy Link: copies track URL to clipboard and shows toast

### Storage Management (`synth-spotify/app.js`) ↔ Download Engine
- **Storage Limits**:
  - Keys: `synth_offline_limit_mb` (number in MB, default 2048) and `muriel_cache_limit_mb`.
  - `getStorageUsage(): Promise<{ usedBytes: number, limitBytes: number, percent: number }>`
  - `canDownloadTrack(estimatedBytes?: number): Promise<{ allowed: boolean, warning: boolean, message: string }>`

## Code Layout & Exclusive Write Ownership
To avoid merge conflicts during parallel execution:
- **Milestone M1 Worker**: Exclusive ownership of Audio Engine & Web Audio DSP routines in `synth-spotify/app.js` (AudioContext, BiquadFilter nodes, Dual Decks, Crossfade scheduler), backend duration guards in `synth-spotify/server.js`, and `#modal-audio-settings` in `synth-spotify/index.html` & `styles.css`.
- **Milestone M2 Worker**: Exclusive ownership of Mobile Player elements in `synth-spotify/index.html` (`#mobile-fullscreen-player`, removing `btn-mob-share`), mobile gesture listeners, playlist deletion handlers, liked songs heart toggle, and queue drawer routines (`toggleQueueDrawer`, `clearQueue`) in `synth-spotify/app.js` & `styles.css`.
- **Milestone M3 Worker**: Exclusive ownership of Desktop context menu (`#spotify-context-menu`), keyboard shortcuts modal (`#modal-shortcuts`), wake lock handlers, external playlist import modal (`#modal-import-playlist`), and offline storage settings & indicators in `synth-spotify/index.html`, `app.js`, and `styles.css`.
- **Milestone M4 (E2E Testing Track)**: Exclusive ownership of `synth-spotify/tests/` (test harness, test runners, assertion utilities) and root state documents `TEST_INFRA.md` & `TEST_READY.md`.
