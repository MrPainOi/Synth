/**
 * Synth 2 - Spotify Edition
 * Android APK Build System
 * Packages the modern Spotify UI and native Capacitor bridge into an installable Android APK.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const SPOTIFY_DIR = __dirname;
const BASE_APK = path.join(ROOT_DIR, 'Synth.apk');

const JDK_DIR = 'C:\\Program Files\\Java\\jdk-17';
const JDK_BIN = path.join(JDK_DIR, 'bin');
const SDK_DIR = 'C:\\Users\\user\\AppData\\Local\\Android\\Sdk';
const BUILD_TOOLS_DIR = path.join(SDK_DIR, 'build-tools', '34.0.0');

const ZIPALIGN = path.join(BUILD_TOOLS_DIR, 'zipalign.exe');
const APKSIGNER = path.join(BUILD_TOOLS_DIR, 'apksigner.bat');
const KEYTOOL = path.join(JDK_BIN, 'keytool.exe');
const JAR = path.join(JDK_BIN, 'jar.exe');

const BUILD_DIR = path.join(SPOTIFY_DIR, 'android_build');
const STAGING_DIR = path.join(BUILD_DIR, 'staging');
const KEYSTORE_PATH = path.join(SPOTIFY_DIR, 'synth_debug.keystore');
const UNALIGNED_APK = path.join(BUILD_DIR, 'Synth-Spotify-unaligned.apk');
const ALIGNED_APK = path.join(BUILD_DIR, 'Synth-Spotify-aligned.apk');
const FINAL_APK_SPOTIFY = path.join(SPOTIFY_DIR, 'Synth-Spotify.apk');
const FINAL_APK_ROOT = path.join(ROOT_DIR, 'Synth-Spotify.apk');

const ENV = {
  ...process.env,
  JAVA_HOME: JDK_DIR,
  ANDROID_HOME: SDK_DIR,
  PATH: `${JDK_BIN};${BUILD_TOOLS_DIR};${process.env.PATH}`
};

function logStep(msg) {
  console.log(`\x1b[36m[BUILD-ANDROID]\x1b[0m ${msg}`);
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function runBuild() {
  console.log('\n======================================================');
  console.log('   Synth 2: Spotify Edition - Android Build Pipeline   ');
  console.log('======================================================\n');

  // 1. Verify Prerequisites
  logStep('Checking build prerequisites...');
  if (!fs.existsSync(BASE_APK)) {
    throw new Error(`Base APK not found at: ${BASE_APK}`);
  }
  if (!fs.existsSync(ZIPALIGN)) {
    throw new Error(`zipalign not found at: ${ZIPALIGN}`);
  }
  if (!fs.existsSync(APKSIGNER)) {
    throw new Error(`apksigner not found at: ${APKSIGNER}`);
  }
  if (!fs.existsSync(JAR)) {
    throw new Error(`jar.exe not found at: ${JAR}`);
  }
  console.log('  ✔ Base APK:', BASE_APK);
  console.log('  ✔ JDK 17:', JDK_DIR);
  console.log('  ✔ Android Build-Tools (34.0.0):', BUILD_TOOLS_DIR);

  // 2. Prepare Staging Directory
  logStep('Preparing staging directory...');
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // 3. Extract Base APK
  logStep('Extracting base APK container...');
  execSync(`tar -xf "${BASE_APK}" -C "${STAGING_DIR}"`);

  // Remove old signatures
  const metaInfDir = path.join(STAGING_DIR, 'META-INF');
  if (fs.existsSync(metaInfDir)) {
    fs.rmSync(metaInfDir, { recursive: true, force: true });
  }
  console.log('  ✔ Base APK extracted and old signatures purged.');

  // 4. Update Capacitor App Configuration
  logStep('Configuring Capacitor Android manifest...');
  const capConfigPath = path.join(STAGING_DIR, 'assets', 'capacitor.config.json');
  if (fs.existsSync(capConfigPath)) {
    const capConfig = JSON.parse(fs.readFileSync(capConfigPath, 'utf8'));
    capConfig.appName = 'Synth Spotify';
    capConfig.backgroundColor = '#121212'; // Spotify OLED dark
    fs.writeFileSync(capConfigPath, JSON.stringify(capConfig, null, 2), 'utf8');
    console.log('  ✔ capacitor.config.json updated (appName: "Synth Spotify", bg: #121212)');
  }

  // 5. Package Spotify Web App into assets/public/
  logStep('Bundling Spotify Edition web application into assets/public/ ...');
  const publicDir = path.join(STAGING_DIR, 'assets', 'public');
  if (fs.existsSync(publicDir)) {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
  fs.mkdirSync(publicDir, { recursive: true });

  // Copy assets folder
  const spotifyAssetsSrc = path.join(SPOTIFY_DIR, 'assets');
  const spotifyAssetsDest = path.join(publicDir, 'assets');
  copyRecursiveSync(spotifyAssetsSrc, spotifyAssetsDest);

  // Copy core web app files
  fs.copyFileSync(path.join(SPOTIFY_DIR, 'styles.css'), path.join(publicDir, 'styles.css'));
  fs.copyFileSync(path.join(SPOTIFY_DIR, 'app.js'), path.join(publicDir, 'app.js'));
  fs.copyFileSync(path.join(SPOTIFY_DIR, 'audio-engine.js'), path.join(publicDir, 'audio-engine.js'));
  if (fs.existsSync(path.join(SPOTIFY_DIR, 'version.json'))) {
    fs.copyFileSync(path.join(SPOTIFY_DIR, 'version.json'), path.join(publicDir, 'version.json'));
  }

  // Always ensure patched mobile-bridge.js is up to date
  const patchBridgeScript = path.join(SPOTIFY_DIR, 'patch-bridge.js');
  if (fs.existsSync(patchBridgeScript)) {
    execSync(`node "${patchBridgeScript}"`, { cwd: SPOTIFY_DIR, stdio: 'inherit' });
  }
  fs.copyFileSync(path.join(SPOTIFY_DIR, 'mobile-bridge.js'), path.join(publicDir, 'mobile-bridge.js'));

  // Prepare index.html with mobile-bridge injected
  let indexHtml = fs.readFileSync(path.join(SPOTIFY_DIR, 'index.html'), 'utf8');
  if (!indexHtml.includes('mobile-bridge.js')) {
    indexHtml = indexHtml.replace(
      '<script src="assets/hls.min.js"></script>',
      '<script src="mobile-bridge.js"></script>\n  <script src="assets/hls.min.js"></script>'
    );
  }
  fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml, 'utf8');

  // Copy helper files if available from original apk inspection
  const helperFiles = ['cordova.js', 'cordova_plugins.js', 'build-info.js', 'mobile-ui.js'];
  for (const hf of helperFiles) {
    const srcHelper = path.join(SPOTIFY_DIR, 'assets', 'public', hf);
    if (fs.existsSync(srcHelper)) {
      fs.copyFileSync(srcHelper, path.join(publicDir, hf));
    }
  }

  console.log('  ✔ Web app files bundled into assets/public:');
  console.log('    - index.html (Spotify OLED dark UI with mobile-bridge)');
  console.log('    - styles.css (Responsive design + safe-area insets)');
  console.log('    - app.js (Queue, sanitized history, synchronized lyrics)');
  console.log('    - audio-engine.js (Audio context & DSP)');
  console.log('    - mobile-bridge.js (Native Capacitor offline proxy & streaming)');

  // 5b. Update Android Launcher Icons & Resources
  logStep('Updating Android launcher icons & mipmaps...');
  const resIconsDir = path.join(SPOTIFY_DIR, 'res-icons');
  if (fs.existsSync(resIconsDir)) {
    const bgSrc = path.join(resIconsDir, 'ic_launcher_bg.png');
    const bgDest = path.join(STAGING_DIR, 'res', 'drawable-nodpi', 'ic_launcher_bg.png');
    if (fs.existsSync(bgSrc) && fs.existsSync(path.dirname(bgDest))) {
      fs.copyFileSync(bgSrc, bgDest);
    }
    const mipmapDirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
    for (const mm of mipmapDirs) {
      const mmSrc = path.join(resIconsDir, mm);
      const mmDest = path.join(STAGING_DIR, 'res', mm);
      if (fs.existsSync(mmSrc) && fs.existsSync(mmDest)) {
        for (const file of fs.readdirSync(mmSrc)) {
          fs.copyFileSync(path.join(mmSrc, file), path.join(mmDest, file));
        }
      }
    }
    console.log('  ✔ Launcher icons & mipmaps replaced with customized Synth note logo.');
  }

  // 6. Repackage into Unaligned APK (Ensuring resources.arsc & PNGs are STORED uncompressed for Android 11+)
  logStep('Repackaging APK container (with uncompressed resources.arsc for Android 11+)...');
  const pyScript = path.join(BUILD_DIR, 'pack_apk.py');
  fs.writeFileSync(pyScript, `
import os
import zipfile
import sys

staging = sys.argv[1]
output = sys.argv[2]

with zipfile.ZipFile(output, 'w') as zf:
    for root, dirs, files in os.walk(staging):
        for file in files:
            full = os.path.join(root, file)
            rel = os.path.relpath(full, staging).replace('\\\\', '/')
            if rel.startswith('META-INF'):
                continue
            is_stored = (rel == 'resources.arsc' or rel.endswith('.png') or rel.endswith('.so'))
            zf.write(full, rel, compress_type=zipfile.ZIP_STORED if is_stored else zipfile.ZIP_DEFLATED)
`);
  execSync(`python "${pyScript}" "${STAGING_DIR}" "${UNALIGNED_APK}"`, { env: ENV });
  console.log('  ✔ Unaligned APK generated with correct Android resource storage flags.');

  // 7. Align APK with zipalign (4-byte alignment)
  logStep('Aligning APK with zipalign (4-byte alignment)...');
  execSync(`"${ZIPALIGN}" -p -f 4 "${UNALIGNED_APK}" "${ALIGNED_APK}"`, { env: ENV });
  console.log('  ✔ APK 4-byte boundary aligned.');

  // 8. Generate Keystore if needed
  logStep('Setting up debug signing keystore...');
  if (!fs.existsSync(KEYSTORE_PATH)) {
    const keyCmd = `"${KEYTOOL}" -genkey -v -keystore "${KEYSTORE_PATH}" -alias androiddebugkey -keypass android -storepass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"`;
    execSync(keyCmd, { env: ENV, stdio: 'pipe' });
    console.log('  ✔ Generated new debug keystore.');
  } else {
    console.log('  ✔ Using existing debug keystore.');
  }

  // 9. Sign APK with apksigner
  logStep('Signing APK with apksigner (v2 & v3 schemes)...');
  const signCmd = `"${APKSIGNER}" sign --ks "${KEYSTORE_PATH}" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey "${ALIGNED_APK}"`;
  execSync(signCmd, { env: ENV, stdio: 'pipe' });
  console.log('  ✔ APK successfully signed.');

  // 10. Verify Signature
  logStep('Verifying APK signature scheme...');
  const verifyOut = execSync(`"${APKSIGNER}" verify --verbose "${ALIGNED_APK}"`, { env: ENV }).toString();
  if (!verifyOut.includes('Verifies') || verifyOut.includes('DOES NOT VERIFY')) {
    throw new Error(`APK verification failed:\n${verifyOut}`);
  }
  console.log('  ✔ Signature Verified:');
  verifyOut.trim().split('\n').forEach(line => console.log('    ', line.trim()));

  // 11. Copy final APK to target destinations
  logStep('Exporting final APK builds...');
  fs.copyFileSync(ALIGNED_APK, FINAL_APK_SPOTIFY);
  fs.copyFileSync(ALIGNED_APK, FINAL_APK_ROOT);

  const stats = fs.statSync(FINAL_APK_SPOTIFY);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(FINAL_APK_SPOTIFY)).digest('hex');

  console.log('\n======================================================');
  console.log('   🎉 BUILD SUCCESSFUL!');
  console.log('======================================================');
  console.log(`  APK Name:      Synth-Spotify.apk`);
  console.log(`  File Size:     ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
  console.log(`  SHA-256:       ${sha256}`);
  console.log(`  Output Path 1: ${FINAL_APK_SPOTIFY}`);
  console.log(`  Output Path 2: ${FINAL_APK_ROOT}`);
  console.log('======================================================\n');
}

runBuild().catch(err => {
  console.error('\n❌ BUILD FAILED:', err.message);
  process.exit(1);
});
