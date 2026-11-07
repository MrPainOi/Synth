# Synth Spotify Testing Infrastructure & Architecture

## 1. Testing Philosophy

The Synth Spotify verification infrastructure is designed around the principles of **opaque-box, requirement-driven end-to-end testing**:

1. **Opaque-Box Verification**: Tests validate the application strictly through its external interface contracts, observable DOM state changes, Web Audio DSP graph node topologies, storage state mutations, and backend API protocol exchanges. Internal implementation details are treated as private.
2. **Requirement-Driven Traceability**: Every single test case maps directly to explicit functional requirements from `ORIGINAL_REQUEST.md` (R1-R5) and architectural specifications from `PROJECT.md`.
3. **No Mocks of Production Business Logic**: While browser environments and native device APIs (Web Audio API, Wake Lock, Touch Events, LocalStorage) are provided with high-fidelity compliant mock fixtures to allow deterministic headless execution under pure Node.js, the actual application logic, DOM trees, contract interfaces, and calculations are exercised directly.
4. **Zero External Test Dependencies**: The entire test harness runs on native Node.js (Node 18+ / 20+ / 24+) without requiring heavyweight external dependencies (like Jest or Puppeteer) to ensure fast, instant, reproducible execution across any environment via `node synth-spotify/tests/run-all-tests.js`.
5. **Progressive Testability & Isolation**: Tests are self-contained and isolated. Each test initializes its own state, avoids execution order coupling, and produces clear, actionable failure diagnostics.

---

## 2. Test Suite Architecture

```
d:\riff\synth-spotify\tests\
├── test-utils.js                       # Test assertion library, runner core, DOM/Audio fixtures
├── run-all-tests.js                    # Master test runner CLI with tier filtering & summary report
├── tier1-features/                     # Tier 1: Functional Feature Coverage (>=5 tests per feature)
│   ├── m1-share-removal.test.js        # M1: Fullscreen Mobile Share Button Removal
│   ├── m2-playlist-delete.test.js      # M2: Song Deletion from Custom Playlists
│   ├── m3-liked-heart-toggle.test.js   # M3: Liked Songs Heart Toggle
│   ├── m4-swipe-gestures.test.js       # M4: Mobile Player Swipe Gestures (Dismiss & Next/Prev)
│   ├── m5-queue-management.test.js     # M5: Queue Population, Clear Queue & Drawer Toggle
│   ├── p1-context-menu.test.js         # P1: Desktop Right-Click Context Menu Actions
│   ├── p2-wake-lock.test.js            # P2: Screen Wake Lock in Lyrics Mode
│   ├── p3-shortcut-modal.test.js       # P3: Keyboard Shortcut Help Modal (? / Shift + /)
│   ├── f1-preset-effects.test.js       # F1: Web Audio Preset Effects (Default, Slowed, Nightcore, Bass Boost)
│   ├── f2-equalizer-tone.test.js       # F2: 10-Band Graphic EQ & Treble/Bass Tone Controls
│   ├── f3-audio-crossfade.test.js      # F3: Dual-Deck Smooth Audio Crossfade (0-12s)
│   ├── f5-playlist-import.test.js      # F5: External Playlist Import (Spotify, Apple, YouTube)
│   ├── f6-offline-storage.test.js      # F6: Offline Storage Limits, Disk Meter & Quota Alerts
│   ├── r5a-truncation-fix.test.js      # R5-A: 29-30s Audio Stream Truncation Bug Prevention
│   └── r5b-android-build.test.js       # R5-B: Android APK Build Verification & Signature Integrity
├── tier2-boundaries/                   # Tier 2: Boundary & Corner Cases (>=5 tests per feature)
│   ├── m1-m5-mobile-boundaries.test.js # Edge cases: rapid swipes, empty playlists, missing IDs
│   ├── p1-p3-desktop-boundaries.test.js# Edge cases: viewport boundary clamping, form field inputs, denial
│   ├── f1-f3-audio-boundaries.test.js  # Edge cases: extreme gain bounds [-12, +12], zero crossfade, NaN
│   ├── f5-f6-storage-boundaries.test.js# Edge cases: malformed links, quota edge (90%, 100%, overflow)
│   └── r5a-r5b-boundaries.test.js     # Edge cases: 29.0s vs 31.0s boundaries, keystore auto-gen
├── tier3-interactions/                 # Tier 3: Cross-Feature Interactions
│   └── cross-feature-interactions.test.js # Multi-feature state workflows & cascading actions
└── tier4-scenarios/                    # Tier 4: Real-World Scenarios
    └── real-world-scenarios.test.js    # End-to-end full user journeys
```

---

## 3. Feature Coverage Matrix

| Feature ID | Feature Name | Target Milestone | Source Requirement | Primary Test File | Tier 1 Tests | Tier 2 Tests | Tier 3/4 Inclusion |
| :--- | :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **M1** | Mobile Share Removal | M2 | ORIGINAL_REQUEST §R1 | `tier1-features/m1-share-removal.test.js` | 5 | 5 | Yes |
| **M2** | Playlist Song Deletion | M2 | ORIGINAL_REQUEST §R1 | `tier1-features/m2-playlist-delete.test.js` | 5 | 5 | Yes |
| **M3** | Liked Songs Heart Toggle | M2 | ORIGINAL_REQUEST §R1 | `tier1-features/m3-liked-heart-toggle.test.js` | 5 | 5 | Yes |
| **M4** | Mobile Player Swipe Gestures | M2 | ORIGINAL_REQUEST §R1 | `tier1-features/m4-swipe-gestures.test.js` | 5 | 5 | Yes |
| **M5** | Queue Population & Clear | M2 | ORIGINAL_REQUEST §R1 | `tier1-features/m5-queue-management.test.js` | 5 | 5 | Yes |
| **P1** | Desktop Context Menu | M3 | ORIGINAL_REQUEST §R2 | `tier1-features/p1-context-menu.test.js` | 5 | 5 | Yes |
| **P2** | Screen Wake Lock | M3 | ORIGINAL_REQUEST §R2 | `tier1-features/p2-wake-lock.test.js` | 5 | 5 | Yes |
| **P3** | Keyboard Shortcut Modal | M3 | ORIGINAL_REQUEST §R2 | `tier1-features/p3-shortcut-modal.test.js` | 5 | 5 | Yes |
| **F1** | Audio Preset Effects | M1 | ORIGINAL_REQUEST §R3 | `tier1-features/f1-preset-effects.test.js` | 5 | 5 | Yes |
| **F2** | Audio Equalizer & Tone | M1 | ORIGINAL_REQUEST §R3 | `tier1-features/f2-equalizer-tone.test.js` | 5 | 5 | Yes |
| **F3** | Smooth Audio Crossfade | M1 | ORIGINAL_REQUEST §R3 | `tier1-features/f3-audio-crossfade.test.js` | 5 | 5 | Yes |
| **F5** | External Playlist Import | M3 | ORIGINAL_REQUEST §R4 | `tier1-features/f5-playlist-import.test.js` | 5 | 5 | Yes |
| **F6** | Offline Storage Management | M3 | ORIGINAL_REQUEST §R4 | `tier1-features/f6-offline-storage.test.js` | 5 | 5 | Yes |
| **R5-A** | 29s Audio Truncation Fix | M1 | ORIGINAL_REQUEST §R5 | `tier1-features/r5a-truncation-fix.test.js` | 5 | 5 | Yes |
| **R5-B** | Android Build Verification | M5 | ORIGINAL_REQUEST §R5 | `tier1-features/r5b-android-build.test.js` | 5 | 5 | Yes |
| **T3** | Cross-Feature Interactions | M4 | PROJECT.md §Tiers | `tier3-interactions/cross-feature-interactions.test.js` | — | — | 7 |
| **T4** | Real-World Scenarios | M4 | PROJECT.md §Tiers | `tier4-scenarios/real-world-scenarios.test.js` | — | — | 4 |
| **TOTAL** | **15 Features + Multi-Tier** | — | — | **22 Test Files** | **75** | **75** | **11** |

**Grand Total**: **161 Automated Test Cases** covering all functional, boundary, interaction, and end-to-end user workflows.

---

## 4. Execution Commands

### Run Full Test Suite
```bash
node synth-spotify/tests/run-all-tests.js
```

### Run by Specific Tier
```bash
node synth-spotify/tests/run-all-tests.js --tier 1
node synth-spotify/tests/run-all-tests.js --tier 2
node synth-spotify/tests/run-all-tests.js --tier 3
node synth-spotify/tests/run-all-tests.js --tier 4
```

### Run Individual Test Suites
```bash
node synth-spotify/tests/tier1-features/f1-preset-effects.test.js
node synth-spotify/tests/tier1-features/m5-queue-management.test.js
node synth-spotify/tests/tier3-interactions/cross-feature-interactions.test.js
```

### Progressive / Milestone Mode
During concurrent implementation milestones (M1-M3), use `--allow-pending` to report detailed test statuses across all tiers without failing the process exit code:
```bash
node synth-spotify/tests/run-all-tests.js --allow-pending
```
