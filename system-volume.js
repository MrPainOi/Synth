const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_SETVOL = path.join(__dirname, 'bin', 'setvol.exe');

let pendingVolume = null;
let isSetting = false;
let cachedSystemVolume = 0.5;

// Populate initial volume from system if on Windows/supported OS
getSystemVolume().catch(() => {});

function getSystemVolume() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      if (fs.existsSync(BIN_SETVOL)) {
        exec(`"${BIN_SETVOL}" get`, { timeout: 2000 }, (err, stdout) => {
          if (!err && stdout) {
            const num = parseInt(stdout.trim(), 10);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              cachedSystemVolume = num / 100;
              return resolve(cachedSystemVolume);
            }
          }
          resolve(cachedSystemVolume);
        });
      } else {
        resolve(cachedSystemVolume);
      }
    } else if (process.platform === 'darwin') {
      exec(`osascript -e "output volume of (get volume settings)"`, { timeout: 2000 }, (err, stdout) => {
        if (!err && stdout) {
          const num = parseInt(stdout.trim(), 10);
          if (!isNaN(num)) {
            cachedSystemVolume = Math.max(0, Math.min(1, num / 100));
            return resolve(cachedSystemVolume);
          }
        }
        resolve(cachedSystemVolume);
      });
    } else if (process.platform === 'linux') {
      exec(`wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null`, { timeout: 2000 }, (err, stdout) => {
        if (!err && stdout) {
          const match = stdout.match(/Volume:\s*([0-9.]+)/);
          if (match) {
            cachedSystemVolume = Math.max(0, Math.min(1, parseFloat(match[1])));
            return resolve(cachedSystemVolume);
          }
        }
        resolve(cachedSystemVolume);
      });
    } else {
      resolve(cachedSystemVolume);
    }
  });
}

function setSystemVolume(val) {
  const norm = Math.max(0, Math.min(1, typeof val === 'number' ? val : 0.5));
  cachedSystemVolume = norm;
  pendingVolume = Math.round(norm * 100);
  flushSystemVolume();
}

function flushSystemVolume() {
  if (isSetting || pendingVolume === null) return;
  const target = pendingVolume;
  pendingVolume = null;
  isSetting = true;

  if (process.platform === 'win32') {
    if (fs.existsSync(BIN_SETVOL)) {
      exec(`"${BIN_SETVOL}" ${target}`, { timeout: 1500 }, () => {
        isSetting = false;
        if (pendingVolume !== null) flushSystemVolume();
      });
    } else {
      isSetting = false;
    }
  } else if (process.platform === 'darwin') {
    exec(`osascript -e "set volume output volume ${target}"`, { timeout: 1500 }, () => {
      isSetting = false;
      if (pendingVolume !== null) flushSystemVolume();
    });
  } else if (process.platform === 'linux') {
    const fraction = (target / 100).toFixed(2);
    exec(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${fraction} 2>/dev/null || pactl set-sink-volume @DEFAULT_SINK@ ${target}% 2>/dev/null`, { timeout: 1500 }, () => {
      isSetting = false;
      if (pendingVolume !== null) flushSystemVolume();
    });
  } else {
    isSetting = false;
  }
}

module.exports = {
  getSystemVolume,
  setSystemVolume,
  getCachedSystemVolume: () => cachedSystemVolume
};

