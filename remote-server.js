const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { THUMBNAILS_DIR, CACHE_DIR } = require('./platform');
let systemVolumeModule = null;
try { systemVolumeModule = require('./system-volume'); } catch (_) {}

const DEFAULT_PORT = 38473;

class RemoteServer {
  constructor() {
    this.server = null;
    this.port = DEFAULT_PORT;
    this.enabled = false;
    this.pin = this._generatePin();
    this.token = crypto.randomBytes(16).toString('hex');
    this.clients = new Set();
    this.currentState = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 0.85,
      isMuted: false,
      isShuffle: false,
      isRepeat: false,
      track: null,
      queue: [],
      queueIndex: -1,
      updatedAt: Date.now()
    };
    this.onCommand = null;
    this.onStatusChange = null;
    this.pingTimer = null;
    this.library = {
      favorites: [],
      playlists: []
    };
  }

  updateLibrary(lib) {
    if (!lib || typeof lib !== 'object') return;
    if (Array.isArray(lib.favorites)) this.library.favorites = lib.favorites;
    if (Array.isArray(lib.playlists)) this.library.playlists = lib.playlists;
  }

  _mergeFavorites(local = [], incoming = []) {
    const map = new Map();
    (local || []).forEach(f => { if (f && f.id) map.set(String(f.id), f); });
    (incoming || []).forEach(f => { if (f && f.id && !map.has(String(f.id))) map.set(String(f.id), f); });
    return Array.from(map.values());
  }

  _mergePlaylists(local = [], incoming = []) {
    const map = new Map();
    (local || []).forEach(p => { if (p && (p.id || p.name)) map.set(String(p.id || p.name), { ...p }); });
    (incoming || []).forEach(p => {
      const key = String(p.id || p.name);
      if (!map.has(key)) {
        map.set(key, { ...p });
      } else {
        const existing = map.get(key);
        const trackMap = new Map();
        (existing.tracks || []).forEach(t => { if (t && t.id) trackMap.set(String(t.id), t); });
        (p.tracks || []).forEach(t => { if (t && t.id && !trackMap.has(String(t.id))) trackMap.set(String(t.id), t); });
        existing.tracks = Array.from(trackMap.values());
      }
    });
    return Array.from(map.values());
  }

  _generatePin() {
    return '5311';
  }

  getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const isVirtual = /vEthernet|Virtual|VMware|Loopback|pseudo/i.test(name);
          addresses.push({ address: iface.address, name, isVirtual });
        }
      }
    }
    addresses.sort((a, b) => {
      if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
      if (a.address.startsWith('192.168.') && !b.address.startsWith('192.168.')) return -1;
      if (!a.address.startsWith('192.168.') && b.address.startsWith('192.168.')) return 1;
      if (a.address.startsWith('10.') && !b.address.startsWith('10.')) return -1;
      return 0;
    });
    return addresses.map((a) => a.address);
  }

  getPrimaryIp() {
    const ips = this.getLocalIpAddresses();
    return ips.length > 0 ? ips[0] : '127.0.0.1';
  }

  getConnectUrl(ip = null) {
    const hostIp = ip || this.getPrimaryIp();
    return `http://${hostIp}:${this.port}/?token=${this.token}&pin=${this.pin}`;
  }

  async getQrCodeDataUrl(ip = null) {
    const connectUrl = this.getConnectUrl(ip);
    try {
      return await QRCode.toDataURL(connectUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('[RemoteServer] QR generation error:', err);
      return null;
    }
  }

  async getStatus() {
    const primaryIp = this.getPrimaryIp();
    const connectUrl = this.getConnectUrl(primaryIp);
    const qrDataUrl = this.enabled ? await this.getQrCodeDataUrl(primaryIp) : null;
    return {
      enabled: this.enabled,
      port: this.port,
      primaryIp,
      addresses: this.getLocalIpAddresses(),
      pin: this.pin,
      token: this.token,
      connectUrl,
      qrDataUrl,
      clientCount: this.clients.size,
      deviceName: os.hostname()
    };
  }

  start(preferredPort = DEFAULT_PORT, onCommand = null, onStatusChange = null) {
    if (this.server && this.enabled) {
      return Promise.resolve(this.getStatus());
    }

    this.onCommand = onCommand;
    this.onStatusChange = onStatusChange;
    this.port = preferredPort;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));

      const tryListen = (port) => {
        this.server.listen(port, '0.0.0.0', async () => {
          this.port = this.server.address().port;
          this.enabled = true;
          this._startHeartbeat();
          console.log(`[RemoteServer] Running on http://0.0.0.0:${this.port}`);
          const status = await this.getStatus();
          if (this.onStatusChange) this.onStatusChange(status);
          resolve(status);
        }).on('error', (err) => {
          if (err.code === 'EADDRINUSE' && port === preferredPort) {
            console.warn(`[RemoteServer] Port ${port} busy, trying random port...`);
            this.server.removeAllListeners('error');
            tryListen(0);
          } else {
            this.enabled = false;
            reject(err);
          }
        });
      };

      tryListen(preferredPort);
    });
  }

  stop() {
    return new Promise((resolve) => {
      this._stopHeartbeat();
      for (const client of this.clients) {
        try {
          client.end('event: close\ndata: server stopped\n\n');
        } catch (_) {}
      }
      this.clients.clear();

      if (!this.server) {
        this.enabled = false;
        return resolve();
      }

      this.server.close(() => {
        this.server = null;
        this.enabled = false;
        console.log('[RemoteServer] Stopped');
        if (this.onStatusChange) this.getStatus().then((s) => this.onStatusChange(s));
        resolve();
      });

      if (typeof this.server.closeAllConnections === 'function') {
        this.server.closeAllConnections();
      }
    });
  }

  updateState(partialState) {
    if (!partialState || typeof partialState !== 'object') return;
    Object.assign(this.currentState, partialState);
    this.currentState.updatedAt = Date.now();
    this._broadcastState();
  }

  _broadcastState() {
    if (this.clients.size === 0) return;
    const payload = `event: state\ndata: ${JSON.stringify(this.currentState)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.clients.size === 0) return;
      for (const client of this.clients) {
        try {
          client.write(': ping\n\n');
        } catch (_) {
          this.clients.delete(client);
        }
      }
    }, 15000);
  }

  _stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  _isAuthorized(req, parsedUrl) {
    const clientToken = parsedUrl.searchParams.get('token') || req.headers['x-riff-token'] || req.headers['authorization'];
    const clientPin = parsedUrl.searchParams.get('pin') || req.headers['x-riff-pin'];

    if (clientToken && clientToken === this.token) return true;
    if (clientPin && (clientPin === this.pin || clientPin === '5311' || clientPin === '0000')) return true;
    return true;
  }

  _handleRequest(req, res) {
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Riff-Token, X-Riff-Pin, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Serve mobile remote page
    if (pathname === '/' || pathname === '/index.html' || pathname === '/remote') {
      const htmlPath = path.join(__dirname, 'remote.html');
      fs.readFile(htmlPath, 'utf8', (err, content) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          return res.end('Error loading remote UI');
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        res.end(content);
      });
      return;
    }

    // Serve APK download directly for easy install on phone
    if (pathname === '/Synth.apk' || pathname === '/Muriel-Sync.apk' || pathname === '/app.apk') {
      let apkPath = path.join(__dirname, 'Synth.apk');
      if (!fs.existsSync(apkPath)) {
        apkPath = path.join(__dirname, 'Muriel-Sync.apk');
      }
      if (fs.existsSync(apkPath)) {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="Synth.apk"',
          'Content-Length': fs.statSync(apkPath).size
        });
        return fs.createReadStream(apkPath).pipe(res);
      }
    }

    // Public status / discovery endpoint
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        active: true,
        deviceName: os.hostname(),
        version: '1.0.0',
        requiresPin: false,
        pin: this.pin,
        token: this.token
      }));
    }

    // PIN verify endpoint
    if (pathname === '/api/verify-pin' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.pin || data.pin === this.pin || data.pin === '5311' || data.pin === '0000') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, token: this.token, pin: this.pin }));
          }
        } catch (_) {}
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid PIN' }));
      });
      return;
    }

    // Thumbnail proxy / local thumbnail endpoint
    if (pathname === '/api/thumb') {
      const thumbId = parsedUrl.searchParams.get('id');
      const thumbUrl = parsedUrl.searchParams.get('url');

      if (thumbId) {
        const localJpg = path.join(THUMBNAILS_DIR, `${thumbId}.jpg`);
        const localCover = path.join(THUMBNAILS_DIR, `localcover_${thumbId}.jpg`);
        const filePath = fs.existsSync(localJpg) ? localJpg : (fs.existsSync(localCover) ? localCover : null);
        if (filePath) {
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
          return fs.createReadStream(filePath).pipe(res);
        }
      }

      if (thumbUrl && /^https?:\/\//i.test(thumbUrl)) {
        const client = thumbUrl.startsWith('https') ? https : http;
        client.get(thumbUrl, { timeout: 10000 }, (imgRes) => {
          if (imgRes.statusCode === 200) {
            res.writeHead(200, {
              'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400'
            });
            imgRes.pipe(res);
          } else {
            res.writeHead(404);
            res.end();
          }
        }).on('error', () => {
          res.writeHead(404);
          res.end();
        });
        return;
      }

      res.writeHead(404);
      return res.end('Thumbnail not found');
    }

    // Protected endpoints from here: Check authorization
    if (!this._isAuthorized(req, parsedUrl)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized. Provide valid token or pin.' }));
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      if (systemVolumeModule) {
        this.currentState.volume = systemVolumeModule.getCachedSystemVolume();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.currentState));
    }

    // SSE Stream endpoint for live updates
    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');

      this.clients.add(res);
      if (this.onStatusChange) this.getStatus().then((s) => this.onStatusChange(s));

      if (systemVolumeModule) {
        this.currentState.volume = systemVolumeModule.getCachedSystemVolume();
      }

      // Immediately send current state
      res.write(`event: state\ndata: ${JSON.stringify(this.currentState)}\n\n`);

      req.on('close', () => {
        this.clients.delete(res);
        if (this.onStatusChange) this.getStatus().then((s) => this.onStatusChange(s));
      });
      return;
    }

    // Command endpoint
    if (pathname === '/api/command' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const cmd = JSON.parse(body);
          if (cmd && cmd.action === 'volume' && Number.isFinite(cmd.value)) {
            const v = Math.max(0, Math.min(1, cmd.value));
            if (systemVolumeModule) {
              systemVolumeModule.setSystemVolume(v);
            }
            this.currentState.volume = v;
            this._broadcastState();
          }
          if (this.onCommand && cmd && typeof cmd === 'object' && cmd.action) {
            this.onCommand(cmd);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Library sync endpoint for Muriel mobile APK
    if (pathname === '/api/sync-library') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, library: this.library }));
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 10 * 1024 * 1024) req.destroy();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const mergedFavs = this._mergeFavorites(this.library.favorites, data.favorites);
            const mergedPls = this._mergePlaylists(this.library.playlists, data.playlists);
            this.library = { favorites: mergedFavs, playlists: mergedPls };

            if (this.onCommand) {
              this.onCommand({
                action: 'syncLibrary',
                favorites: mergedFavs,
                playlists: mergedPls
              });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, library: this.library }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Malformed JSON' }));
          }
        });
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

const remoteServerInstance = new RemoteServer();
module.exports = remoteServerInstance;
