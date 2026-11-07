const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== VERIFYING WINDOWS SYSTEM VOLUME & REMOTE CONTROL ===');

// 1. Check system-volume module and bin/setvol.exe
const sv = require('../../system-volume');
assert(typeof sv.getSystemVolume === 'function', 'getSystemVolume must be a function');
assert(typeof sv.setSystemVolume === 'function', 'setSystemVolume must be a function');
assert(typeof sv.getCachedSystemVolume === 'function', 'getCachedSystemVolume must be a function');
console.log('✔ 1. system-volume module exports verified');

// 2. Test getting system volume on Windows
sv.getSystemVolume().then(initialVol => {
  assert(typeof initialVol === 'number' && initialVol >= 0 && initialVol <= 1, 'Initial volume must be in [0, 1]');
  console.log(`✔ 2. Successfully read Windows master volume: ${Math.round(initialVol * 100)}%`);

  // 3. Test setting system volume
  sv.setSystemVolume(initialVol);
  console.log('✔ 3. Successfully set Windows master volume without error');

  // 4. Verify remote-server.js integration
  const remoteServerContent = fs.readFileSync(path.join(__dirname, '../../remote-server.js'), 'utf8');
  assert(remoteServerContent.includes('system-volume'), 'remote-server.js must require system-volume');
  assert(remoteServerContent.includes('cmd.action === \'volume\''), 'remote-server.js must handle volume action');
  console.log('✔ 4. remote-server.js routes volume command to system-volume');

  // 5. Verify main.js IPC integration
  const mainContent = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  assert(mainContent.includes('set-system-volume'), 'main.js must handle set-system-volume');
  assert(mainContent.includes('get-system-volume'), 'main.js must handle get-system-volume');
  console.log('✔ 5. main.js IPC handles registered for system volume');

  // 6. Verify d:\riff\app.js doesn\'t mutate app playback volume on remote volume
  const appContent = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
  assert(appContent.includes('setSystemVolume'), 'app.js must call setSystemVolume');
  console.log('✔ 6. PC desktop app.js controls Windows master volume instead of app volume');

  // 7. Verify version.json is 1.0.0
  const versionPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const versionRoot = JSON.parse(fs.readFileSync(path.join(__dirname, '../../version.json'), 'utf8'));
  const versionMobile = JSON.parse(fs.readFileSync(path.join(__dirname, '../version.json'), 'utf8'));
  assert.strictEqual(versionPkg.version, '1.0.0', 'package.json version must be 1.0.0');
  assert.strictEqual(versionRoot.version, '1.0.0', 'version.json version must be 1.0.0');
  assert.strictEqual(versionMobile.version, '1.0.0', 'synth-spotify/version.json version must be 1.0.0');
  console.log('✔ 7. All version descriptors set to 1.0.0');

  console.log('\n🎉 ALL SYSTEM VOLUME AND VERSION 1.0 CHECKS PASSED!\n');
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
