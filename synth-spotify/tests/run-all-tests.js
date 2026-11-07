#!/usr/bin/env node
/**
 * Synth Spotify Master Test Runner
 * Executes multi-tier automated test suites across Tiers 1-4
 *
 * Usage:
 *   node synth-spotify/tests/run-all-tests.js
 *   node synth-spotify/tests/run-all-tests.js --tier 1
 *   node synth-spotify/tests/run-all-tests.js --allow-pending
 */

const path = require('path');

// Test suite registries by tier
const SUITES = [
  // --- TIER 1: FEATURE COVERAGE (>=5 tests per feature) ---
  { tier: 1, file: './tier1-features/m1-share-removal.test.js' },
  { tier: 1, file: './tier1-features/m2-playlist-delete.test.js' },
  { tier: 1, file: './tier1-features/m3-liked-heart-toggle.test.js' },
  { tier: 1, file: './tier1-features/m4-swipe-gestures.test.js' },
  { tier: 1, file: './tier1-features/m5-queue-management.test.js' },
  { tier: 1, file: './tier1-features/p1-context-menu.test.js' },
  { tier: 1, file: './tier1-features/p2-wake-lock.test.js' },
  { tier: 1, file: './tier1-features/p3-shortcut-modal.test.js' },
  { tier: 1, file: './tier1-features/f1-preset-effects.test.js' },
  { tier: 1, file: './tier1-features/f2-equalizer-tone.test.js' },
  { tier: 1, file: './tier1-features/f3-audio-crossfade.test.js' },
  { tier: 1, file: './tier1-features/f5-playlist-import.test.js' },
  { tier: 1, file: './tier1-features/f6-offline-storage.test.js' },
  { tier: 1, file: './tier1-features/r5a-truncation-fix.test.js' },
  { tier: 1, file: './tier1-features/r5b-android-build.test.js' },

  // --- TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature) ---
  { tier: 2, file: './tier2-boundaries/m1-m5-mobile-boundaries.test.js' },
  { tier: 2, file: './tier2-boundaries/p1-p3-desktop-boundaries.test.js' },
  { tier: 2, file: './tier2-boundaries/f1-f3-audio-boundaries.test.js' },
  { tier: 2, file: './tier2-boundaries/f5-f6-storage-boundaries.test.js' },
  { tier: 2, file: './tier2-boundaries/r5a-r5b-boundaries.test.js' },

  // --- TIER 3: CROSS-FEATURE INTERACTIONS ---
  { tier: 3, file: './tier3-interactions/cross-feature-interactions.test.js' },

  // --- TIER 4: REAL-WORLD SCENARIOS ---
  { tier: 4, file: './tier4-scenarios/real-world-scenarios.test.js' }
];

async function main() {
  const args = process.argv.slice(2);
  const tierFilter = args.includes('--tier') ? parseInt(args[args.indexOf('--tier') + 1], 10) : null;
  const allowPending = args.includes('--allow-pending');
  const isVerbose = args.includes('--verbose') || true;

  console.log('\n================================================================');
  console.log('       SYNTH SPOTIFY AUTOMATED MULTI-TIER E2E TEST SUITE        ');
  console.log('================================================================');
  if (tierFilter) console.log(` Filter: Tier ${tierFilter} only`);
  if (allowPending) console.log(` Mode:   Allow-pending (Progressive milestone testability)`);
  console.log('----------------------------------------------------------------\n');

  const selectedSuites = tierFilter ? SUITES.filter(s => s.tier === tierFilter) : SUITES;

  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  const tierStats = { 1: { total: 0, pass: 0, fail: 0 }, 2: { total: 0, pass: 0, fail: 0 }, 3: { total: 0, pass: 0, fail: 0 }, 4: { total: 0, pass: 0, fail: 0 } };
  const failedTestDetails = [];

  const startTime = Date.now();

  for (const entry of selectedSuites) {
    let suiteModule;
    try {
      suiteModule = require(entry.file);
    } catch (err) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Could not load test file: ${entry.file}`);
      console.error(err);
      grandFailed++;
      continue;
    }

    const suiteRes = await suiteModule.run();
    grandTotal += suiteRes.total;
    grandPassed += suiteRes.passed;
    grandFailed += suiteRes.failed;

    if (tierStats[entry.tier]) {
      tierStats[entry.tier].total += suiteRes.total;
      tierStats[entry.tier].pass += suiteRes.passed;
      tierStats[entry.tier].fail += suiteRes.failed;
    }

    const statusBadge = suiteRes.failed === 0 ? '\x1b[32m✔ PASS\x1b[0m' : '\x1b[31m✖ FAIL\x1b[0m';
    console.log(`[Tier ${entry.tier}] ${statusBadge} ${suiteRes.name} (${suiteRes.passed}/${suiteRes.total})`);

    if (isVerbose) {
      for (const r of suiteRes.results) {
        if (r.status === 'pass') {
          console.log(`    \x1b[32m✔\x1b[0m ${r.name} (${r.durationMs}ms)`);
        } else {
          console.log(`    \x1b[31m✖ ${r.name}\x1b[0m (${r.durationMs}ms)`);
          console.log(`      \x1b[33mError: ${r.error}\x1b[0m`);
          failedTestDetails.push({ suite: suiteRes.name, test: r.name, error: r.error });
        }
      }
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log('                       TEST RUN SUMMARY                         ');
  console.log('================================================================');
  console.log(` Total Suites Executed: ${selectedSuites.length}`);
  console.log(` Total Test Cases:      ${grandTotal}`);
  console.log(` Total Passed:          \x1b[32m${grandPassed}\x1b[0m`);
  console.log(` Total Failed:          ${grandFailed > 0 ? `\x1b[31m${grandFailed}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  console.log(` Execution Time:        ${durationSec}s`);
  console.log('----------------------------------------------------------------');
  console.log(' Breakdown by Tier:');
  for (let t = 1; t <= 4; t++) {
    const s = tierStats[t];
    if (s.total > 0) {
      const pct = Math.round((s.pass / s.total) * 100);
      console.log(`   Tier ${t}: ${s.pass}/${s.total} passed (${pct}%)`);
    }
  }
  console.log('================================================================\n');

  if (failedTestDetails.length > 0) {
    console.log(`\x1b[33mPending / Failing Tests (${failedTestDetails.length}):\x1b[0m`);
    failedTestDetails.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.suite}] ${f.test}`);
      console.log(`     Reason: ${f.error}`);
    });
    console.log('');
  }

  if (grandFailed > 0 && !allowPending) {
    console.log('\x1b[31mTest run completed with failures.\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32mTest harness executed cleanly!\x1b[0m\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal test runner exception:\x1b[0m', err);
  process.exit(1);
});
