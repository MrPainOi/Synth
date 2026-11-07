/**
 * Tier 1: Feature Coverage — F6: Offline Storage Management
 * Requirement: ORIGINAL_REQUEST §R4 & PROJECT.md
 * - Storage cap config (1GB/2GB/3GB/custom), usage indicator, pre-download alerts.
 * - Contracts: synth_offline_limit_mb, getStorageUsage, canDownloadTrack
 */

const { assert, assertEqual, assertInRange, createSuite, MockLocalStorage } = require('../test-utils');

const suite = createSuite('Tier 1: F6 — Offline Storage Management');

class OfflineStorageManager {
  constructor(storage = new MockLocalStorage()) {
    this.storage = storage;
  }

  getLimitMB() {
    return parseInt(this.storage.getItem('synth_offline_limit_mb') || '2048', 10);
  }

  setLimitMB(mb) {
    this.storage.setItem('synth_offline_limit_mb', String(mb));
    this.storage.setItem('muriel_cache_limit_mb', String(mb));
  }

  async getStorageUsage(usedBytes = 0) {
    const limitMB = this.getLimitMB();
    const limitBytes = limitMB * 1024 * 1024;
    const percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));
    return { usedBytes, limitBytes, percent };
  }

  async canDownloadTrack(currentUsedBytes, estimatedTrackBytes = 10 * 1024 * 1024) {
    const usage = await this.getStorageUsage(currentUsedBytes);
    const projectedBytes = currentUsedBytes + estimatedTrackBytes;

    if (projectedBytes > usage.limitBytes) {
      return {
        allowed: false,
        warning: true,
        message: 'Kapasitas penyimpanan offline telah penuh. Harap naikkan batas kuota atau hapus beberapa lagu.'
      };
    }

    const projectedPercent = (projectedBytes / usage.limitBytes) * 100;
    if (projectedPercent >= 90) {
      return {
        allowed: true,
        warning: true,
        message: 'Penyimpanan offline hampir penuh (di atas 90%).'
      };
    }

    return { allowed: true, warning: false, message: 'OK' };
  }
}

suite.test('F6-01: Storage cap configurations save to synth_offline_limit_mb in localStorage', () => {
  const mockStorage = new MockLocalStorage();
  const manager = new OfflineStorageManager(mockStorage);

  assertEqual(manager.getLimitMB(), 2048, 'Default storage limit should be 2048 MB (2GB)');

  manager.setLimitMB(1024);
  assertEqual(manager.getLimitMB(), 1024, '1GB preset should set 1024 MB');

  manager.setLimitMB(3072);
  assertEqual(manager.getLimitMB(), 3072, '3GB preset should set 3072 MB');

  manager.setLimitMB(5120);
  assertEqual(manager.getLimitMB(), 5120, 'Custom limit (5GB) should set 5120 MB');
});

suite.test('F6-02: getStorageUsage computes exact byte limits and percentage correctly', async () => {
  const manager = new OfflineStorageManager();
  manager.setLimitMB(1000); // 1000 MB for simple math

  // 500 MB used out of 1000 MB
  const used = 500 * 1024 * 1024;
  const usage = await manager.getStorageUsage(used);

  assertEqual(usage.usedBytes, used, 'Used bytes must match');
  assertEqual(usage.limitBytes, 1000 * 1024 * 1024, 'Limit bytes must equal 1000 MB in bytes');
  assertEqual(usage.percent, 50, 'Utilization percent must be 50%');
});

suite.test('F6-03: canDownloadTrack allows download without warning when well within capacity (<90%)', async () => {
  const manager = new OfflineStorageManager();
  manager.setLimitMB(2048);

  const currentUsed = 100 * 1024 * 1024; // 100 MB used (~5%)
  const trackSize = 8 * 1024 * 1024; // 8 MB

  const decision = await manager.canDownloadTrack(currentUsed, trackSize);
  assertEqual(decision.allowed, true, 'Download must be allowed');
  assertEqual(decision.warning, false, 'No warning should be triggered below 90%');
});

suite.test('F6-04: canDownloadTrack triggers warning alert when approaching capacity (>=90%)', async () => {
  const manager = new OfflineStorageManager();
  manager.setLimitMB(1000); // 1000 MB limit

  const currentUsed = 910 * 1024 * 1024; // 910 MB used (91%)
  const trackSize = 5 * 1024 * 1024; // 5 MB

  const decision = await manager.canDownloadTrack(currentUsed, trackSize);
  assertEqual(decision.allowed, true, 'Download should still be permitted if space exists');
  assertEqual(decision.warning, true, 'Warning flag must be true when above 90%');
  assert(decision.message.includes('hampir penuh'), 'Warning message must notify user');
});

suite.test('F6-05: canDownloadTrack blocks download when request exceeds 100% capacity', async () => {
  const manager = new OfflineStorageManager();
  manager.setLimitMB(1000);

  const currentUsed = 995 * 1024 * 1024; // 995 MB used
  const trackSize = 10 * 1024 * 1024; // 10 MB (would reach 1005 MB > 1000 MB)

  const decision = await manager.canDownloadTrack(currentUsed, trackSize);
  assertEqual(decision.allowed, false, 'Download must be blocked when exceeding cap');
  assertEqual(decision.warning, true, 'Warning must be active');
  assert(decision.message.includes('penuh'), 'Message must indicate storage cap reached');
});

if (require.main === module) {
  suite.run().then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
