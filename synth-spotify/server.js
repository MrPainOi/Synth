const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

let ytDlpCommand = null;
try {
  ytDlpCommand = require('../platform').ytDlpCommand;
} catch (e) {
  console.warn('Could not load ytDlpCommand in synth-spotify/server:', e);
}

function executeYtDlpLocal(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!ytDlpCommand) return reject(new Error('ytDlpCommand not available'));
    try {
      const cmd = ytDlpCommand(args);
      const proc = spawn(cmd.bin, cmd.args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
        reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 || stdout.trim().length > 0) resolve(stdout);
        else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function resolveFullStreamWithSoundCloudFallback(query, minDuration = 45) {
  const q = String(query || '').trim();
  if (!q) return null;

  // 1. YouTube search with duration > 45 filter
  try {
    const ytArgs = [
      '--no-config',
      '-g',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--match-filter',
      `duration > ${minDuration}`,
      '--prefer-free-formats',
      '-f',
      'bestaudio/best',
      '--extractor-args',
      'youtube:player_client=android',
      `ytsearch3:${q} audio`
    ];
    const raw = await executeYtDlpLocal(ytArgs, 15000);
    const lines = raw.trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    if (lines.length > 0) {
      return { success: true, streamUrl: lines[0], platform: 'youtube', isFallback: true };
    }
  } catch (_) {}

  // 2. SoundCloud fallback search with duration > 45 filter (rejects 30s preview clips)
  try {
    const scArgs = [
      '--no-config',
      '-g',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--match-filter',
      `duration > ${minDuration}`,
      '--prefer-free-formats',
      '-f',
      'bestaudio/best',
      `scsearch3:${q}`
    ];
    const scRaw = await executeYtDlpLocal(scArgs, 15000);
    const scLines = scRaw.trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    if (scLines.length > 0) {
      return { success: true, streamUrl: scLines[0], platform: 'soundcloud', isFallback: true };
    }
  } catch (_) {}

  return null;
}

// Require Synth's original backend server
let synthBackend = null;
try {
  synthBackend = require('../server');
} catch (e) {
  console.warn('Could not load Synth root server:', e);
}

// Require Synth's original Remote Server (Port 38473)
let remoteServer = null;
try {
  remoteServer = require('../remote-server');
} catch (e) {
  console.warn('Could not load Synth remote server:', e);
}

const pcWebClients = new Set();

function broadcastToPcWeb(event, data) {
  if (pcWebClients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of pcWebClients) {
    try {
      client.write(payload);
    } catch (_) {
      pcWebClients.delete(client);
    }
  }
}

if (remoteServer) {
  remoteServer.start(
    38473,
    (cmd) => {
      console.log('[RemoteServer] Command received from phone:', cmd?.action);
      broadcastToPcWeb('command', cmd);
    },
    (status) => {
      broadcastToPcWeb('status', status);
    }
  ).then(status => {
    console.log(`[Synth Remote Server] Running on http://${status.primaryIp}:${status.port} (PIN: ${status.pin})`);
  }).catch(err => {
    console.warn('[Synth Remote Server] Start warning:', err.message);
  });
}

const DEFAULT_PORT = 3030;
let synthBackendPort = 38472;
const PUBLIC_DIR = __dirname;
const SYNTH_DATA_DIR = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'Riff');
const SYNTH_METADATA_PATH = path.join(SYNTH_DATA_DIR, 'metadata.json');
const SYNTH_TRACKS_DIR = path.join(SYNTH_DATA_DIR, 'tracks');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.opus': 'audio/ogg; codecs=opus',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp'
};

function resolveTrackArtwork(t) {
  if (t && t.thumbnail && typeof t.thumbnail === 'string' && t.thumbnail.startsWith('http')) return t.thumbnail;
  if (t && t.art && typeof t.art === 'string' && t.art.startsWith('http')) return t.art;
  const id = (t && t.id) || '';
  if (id && /^[\w-]{11}$/.test(id)) {
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return 'assets/radio_thumb.png';
}

function getLocalTracks() {
  try {
    if (fs.existsSync(SYNTH_METADATA_PATH)) {
      const raw = fs.readFileSync(SYNTH_METADATA_PATH, 'utf8');
      const meta = JSON.parse(raw);
      return Object.values(meta)
        .filter((t) => {
          if (!t || typeof t !== 'object') return false;
          const title = (t.title || '').trim().toLowerCase();
          const artist = (t.artist || '').trim().toLowerCase();
          const art = (t.thumbnail || '').toLowerCase();
          if (!title || title === 'untitled' || title === 'pilih lagu untuk memutar' || title === 'untitled track') return false;
          if (!artist || artist === 'unknown artist' || artist === 'undefined' || artist === 'synth 2') return false;
          if (art.includes('open.sp') || art.includes('undefined') || art.includes('null')) return false;
          return true;
        })
        .map((t) => ({
          id: t.id,
          title: t.title.trim(),
          artist: t.artist.trim(),
          duration: parseFloat(t.duration) || 240,
          thumbnail: resolveTrackArtwork(t),
          platform: t.platform || 'local',
          fileSize: t.fileSize || 0,
          lastPlayed: t.lastPlayed || 0,
          streamUrl: `/api/stream/${encodeURIComponent(t.id)}`,
          isLocal: true,
          type: 'Lagu'
        }))
        .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    }
  } catch (e) {
    return [];
  }
}

// In-memory cache for Hot / Trending recommendations (Instant response, zero lag)
let cachedHotTracks = null;
let lastHotFetchTime = 0;
let isFetchingHot = false;

function getFallbackHotTracks(limit = 15) {
  const local = getLocalTracks();
  const artistMap = new Map();
  for (const t of local) {
    const a = t.artist || 'Unknown';
    if (!artistMap.has(a)) artistMap.set(a, []);
    artistMap.get(a).push(t);
  }
  const picks = [];
  const artists = Array.from(artistMap.keys());
  for (let i = artists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [artists[i], artists[j]] = [artists[j], artists[i]];
  }
  let idx = 0;
  while (picks.length < limit && artists.length > 0) {
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
  return picks.length > 0 ? picks : local.slice(0, limit);
}

async function triggerBackgroundHotRefresh() {
  if (isFetchingHot) return;
  isFetchingHot = true;
  try {
    const synthRes = await callSynthBackend('/api/hot?limit=25', 30000);
    if (synthRes && synthRes.data && Array.isArray(synthRes.data.tracks) && synthRes.data.tracks.length > 0) {
      cachedHotTracks = synthRes.data.tracks;
      lastHotFetchTime = Date.now();
    }
  } catch (e) {
    // Non-critical background hot refresh warning suppressed
  } finally {
    isFetchingHot = false;
  }
}

async function getFastHotTracks(limit = 15) {
  const now = Date.now();
  if (cachedHotTracks && cachedHotTracks.length > 0) {
    if (now - lastHotFetchTime > 15 * 60 * 1000) {
      triggerBackgroundHotRefresh();
    }
    return { success: true, title: 'Hot picks', tracks: cachedHotTracks.slice(0, limit) };
  }

  triggerBackgroundHotRefresh();
  const fallback = getFallbackHotTracks(limit);
  return { success: true, title: 'Hot picks', tracks: fallback };
}

/**
 * Universal Proxy to Synth's original internal backend
 */
function proxyToSynthBackend(req, res) {
  const token = synthBackend && typeof synthBackend.getServerToken === 'function' ? synthBackend.getServerToken() : '';
  const headers = { ...req.headers };
  headers['x-riff-token'] = token;
  headers['host'] = `127.0.0.1:${synthBackendPort}`;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: synthBackendPort,
      path: req.url,
      method: req.method,
      headers: headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      try {
        proxyReq.destroy();
      } catch (e) { }
    }
  });

  proxyReq.on('error', (err) => {
    // Suppress expected client cancellation, abort, or browser reload disconnects
    if (clientDisconnected || res.destroyed || proxyReq.destroyed || err.code === 'ECONNRESET' || err.message === 'socket hang up') {
      return;
    }
    console.warn(`[Proxy Error] ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Synth backend unavailable', message: err.message }));
    }
  });

  req.pipe(proxyReq);
}

function callSynthBackend(apiPath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const token = synthBackend && typeof synthBackend.getServerToken === 'function' ? synthBackend.getServerToken() : '';
    const req = http.request(
      `http://127.0.0.1:${synthBackendPort}${apiPath}`,
      {
        headers: {
          'X-Riff-Token': token,
          'Accept': 'application/json'
        },
        timeout: timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch (err) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Synth backend request timeout'));
    });
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:' + DEFAULT_PORT}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Riff-Token, X-Riff-Pin, Range, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: Remote Server Status & Pairing Info (Spotify Connect)
  if (pathname === '/api/remote/status') {
    if (remoteServer) {
      try {
        const status = await remoteServer.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, ...status }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ success: false, enabled: false }));
  }

  // API: Get current playback state (Dual-channel polling fallback for mobile clients)
  if (pathname === '/api/remote/state' && req.method === 'GET') {
    let sysVol = 0.85;
    try {
      const { getCachedSystemVolume } = require('../system-volume');
      sysVol = getCachedSystemVolume();
    } catch (_) {}
    if (remoteServer && remoteServer.currentState) {
      remoteServer.currentState.volume = sysVol;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify(remoteServer.currentState));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ isPlaying: false, currentTime: 0, duration: 0, volume: sysVol, track: null }));
  }

  // API: SSE Stream for PC Web App to receive commands from phones
  if (pathname === '/api/remote/pc-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    pcWebClients.add(res);

    if (remoteServer) {
      remoteServer.getStatus().then(status => {
        try {
          res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
        } catch (_) {}
      });
    }

    req.on('close', () => {
      pcWebClients.delete(res);
    });
    return;
  }

  // API: Update Remote State (Broadcasted from PC Web App to all connected phones)
  if (pathname === '/api/remote/update-state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 512 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const statePayload = JSON.parse(body);
        if (remoteServer && typeof remoteServer.updateState === 'function') {
          remoteServer.updateState(statePayload);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // API: Send Remote Command from Phone / Client to PC
  if (pathname === '/api/remote/command' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const cmd = JSON.parse(body);
        if (cmd && cmd.action) {
          if (cmd.action === 'volume' && Number.isFinite(cmd.value)) {
            try {
              const { setSystemVolume } = require('../system-volume');
              setSystemVolume(cmd.value);
            } catch (_) {}
          }
          broadcastToPcWeb('command', cmd);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // API: Set Host PC System Master Volume
  if (pathname === '/api/remote/set-sys-volume' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (Number.isFinite(payload.volume)) {
          const { setSystemVolume } = require('../system-volume');
          setSystemVolume(payload.volume);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // API 0: Save Feedback (Drawings & Revision Comments from Simulator)
  if (pathname === '/api/submit-feedback' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const feedbackDir = path.join(__dirname, 'feedback');
        if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });

        const timestamp = Date.now();
        const jsonPath = path.join(feedbackDir, `feedback_${timestamp}.json`);
        const latestJsonPath = path.join(__dirname, 'feedback_latest.json');

        fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
        fs.writeFileSync(latestJsonPath, JSON.stringify(payload, null, 2), 'utf8');

        if (payload.image) {
          const base64Data = payload.image.replace(/^data:image\/\w+;base64,/, '');
          const imgPath = path.join(feedbackDir, `feedback_${timestamp}.png`);
          const latestImgPath = path.join(__dirname, 'feedback_latest.png');
          fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
          fs.writeFileSync(latestImgPath, Buffer.from(base64Data, 'base64'));
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, count: (payload.comments || []).length, timestamp }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API 1: Local Synth Library
  if (pathname === '/api/synth-tracks' || pathname === '/api/library') {
    const tracks = getLocalTracks();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(tracks));
  }

  // API 1.5: Fast Cached Hot / Recommendations (Instant response < 2ms, non-blocking background refresh)
  if (pathname === '/api/hot') {
    const limit = parseInt(reqUrl.searchParams.get('limit') || '15', 10);
    const hotData = await getFastHotTracks(limit);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(hotData));
  }

  // API 2: Stream audio file from Synth tracks dir (for local downloaded files)
  if (pathname.startsWith('/api/stream/')) {
    const trackId = pathname.replace('/api/stream/', '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const trackPath = path.join(SYNTH_TRACKS_DIR, `${trackId}.opus`);

    if (!fs.existsSync(trackPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Track not found in Synth tracks directory');
    }

    const stat = fs.statSync(trackPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(trackPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/ogg; codecs=opus'
      });
      return file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/ogg; codecs=opus',
        'Accept-Ranges': 'bytes'
      });
      return fs.createReadStream(trackPath).pipe(res);
    }
  }

  // API 3: Online & Local Unified Search (Spotify Layout Compatible)
  if (pathname === '/api/search') {
    const q = (reqUrl.searchParams.get('q') || '').trim();
    const platform = (reqUrl.searchParams.get('platform') || 'youtube').trim();
    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, hero: null, items: [], tracks: [], playlists: [], artists: [] }));
    }

    const queryLower = q.toLowerCase();

    // 1. Check local tracks
    const localTracks = getLocalTracks();
    const matchedLocal = localTracks.filter(
      (t) => t.title.toLowerCase().includes(queryLower) || t.artist.toLowerCase().includes(queryLower)
    );

    let onlineTracks = [];
    let artistInfo = null;

    // 2. Fetch from Synth internal backend using selected platform (youtube / ytmusic / soundcloud)
    try {
      const searchRes = await callSynthBackend(`/api/search?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}&limit=25`);
      if (searchRes && searchRes.data && searchRes.data.tracks) {
        onlineTracks = searchRes.data.tracks;
      }
    } catch (e) {
      console.warn('Synth backend search error:', e.message);
    }

    // 3. Try to fetch artist info
    try {
      const artistRes = await callSynthBackend(`/api/artist?name=${encodeURIComponent(q)}`, 5000);
      if (artistRes && artistRes.data && artistRes.data.artist) {
        artistInfo = artistRes.data.artist;
      }
    } catch (e) { }

    const allTracksMap = new Map();

    // Add local tracks first
    matchedLocal.forEach((t) => {
      allTracksMap.set(t.id || t.title, {
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        thumbnail: t.thumbnail,
        streamUrl: t.streamUrl,
        isLocal: true,
        type: 'Lagu'
      });
    });

    // Add verified artist tracks if available (e.g. Deezer top hits)
    if (artistInfo && Array.isArray(artistInfo.tracks)) {
      artistInfo.tracks.forEach((t) => {
        const key = t.id || t.title;
        if (!allTracksMap.has(key)) {
          allTracksMap.set(key, {
            id: t.id,
            title: t.title,
            artist: t.artist || artistInfo.name,
            duration: t.duration || 200,
            thumbnail: t.thumbnail || artistInfo.avatar || 'assets/radio_thumb.png',
            searchQuery: t.searchQuery || `${t.artist} - ${t.title}`,
            url: t.url || '',
            platform: 'youtube',
            isLocal: false,
            isExplicit: !!(t.title && t.title.toLowerCase().includes('past life')),
            type: 'Lagu'
          });
        }
      });
    }

    // Add online tracks from Synth backend
    onlineTracks.forEach((t) => {
      const key = t.id || t.title;
      if (!allTracksMap.has(key)) {
        allTracksMap.set(key, {
          id: t.id,
          title: t.title,
          artist: t.artist || t.author || 'Artis',
          duration: t.duration || 200,
          thumbnail: t.thumbnail || 'assets/radio_thumb.png',
          url: t.url || '',
          platform: t.platform || platform || 'youtube',
          isLocal: false,
          type: 'Lagu'
        });
      }
    });

    const trackList = Array.from(allTracksMap.values());

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(
      JSON.stringify({
        success: true,
        query: q,
        artist: artistInfo,
        tracks: trackList
      })
    );
  }

  // API 4: Stream Info (Returns proxyUrl pointing to port 3030 so client has zero CORS issues)
  if (pathname === '/api/stream-info') {
    const id = reqUrl.searchParams.get('id') || '';
    const platform = reqUrl.searchParams.get('platform') || 'youtube';
    const urlParam = reqUrl.searchParams.get('url') || '';
    const searchParam = reqUrl.searchParams.get('search') || '';
    const title = reqUrl.searchParams.get('title') || '';
    const artist = reqUrl.searchParams.get('artist') || '';
    const duration = parseFloat(reqUrl.searchParams.get('duration') || '0');
    const minDuration = parseFloat(reqUrl.searchParams.get('minDuration') || '45');

    // If local track in tracks dir, serve local stream
    const localFile = path.join(SYNTH_TRACKS_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.opus`);
    if (fs.existsSync(localFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, isLocal: true, streamUrl: `/api/stream/${encodeURIComponent(id)}` }));
    }

    try {
      const qParams = new URLSearchParams({
        id,
        platform,
        url: urlParam,
        search: searchParam,
        title,
        artist,
        duration: String(duration)
      });
      const synthRes = await callSynthBackend(`/api/stream-info?${qParams.toString()}`);
      let data = synthRes.data || {};

      // Duration guard: If backend returned a 28-33s preview clip while expected duration > 45s
      const actualDur = parseFloat(data.duration || '0');
      const isPreviewClip = (actualDur >= 28 && actualDur <= 33) && (duration > 45 || !duration);

      if ((!data.success || isPreviewClip || !data.streamUrl) && (title || artist || searchParam || urlParam)) {
        console.log(`[StreamInfo] Backend returned ${isPreviewClip ? 'preview clip' : 'no stream'}, invoking SoundCloud/YouTube fallback with duration > ${minDuration}...`);
        const fallback = await resolveFullStreamWithSoundCloudFallback(`${artist} ${title}`.trim() || searchParam || urlParam, minDuration);
        if (fallback && fallback.streamUrl) {
          data = fallback;
        }
      }

      if (data.success && data.streamUrl) {
        // Rewrite proxyUrl to local audio-proxy so frontend doesn't need external credentials
        data.proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(data.streamUrl)}`;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (e) {
      console.warn('Stream info resolve error:', e.message);
      // Fallback resolution
      try {
        const fallback = await resolveFullStreamWithSoundCloudFallback(`${artist} ${title}`.trim() || searchParam || urlParam, minDuration);
        if (fallback && fallback.streamUrl) {
          fallback.proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(fallback.streamUrl)}`;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(fallback));
        }
      } catch (_) {}
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
  }

  // API 5: Health / Diagnostics
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(
      JSON.stringify({
        status: 'ok',
        name: 'Synth 2 (Spotify Edition)',
        synthBackendPort,
        hasSynthBackend: !!synthBackend
      })
    );
  }

  // API 6: Catch-all Proxy for ANY other /api/ route (audio-proxy, lyrics, artist, albums, hot, etc.)
  if (pathname.startsWith('/api/')) {
    return proxyToSynthBackend(req, res);
  }

  // Static files serving
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

async function startServer(port = DEFAULT_PORT) {
  // Ensure Synth's original backend is started first!
  if (synthBackend && typeof synthBackend.startServer === 'function') {
    try {
      synthBackendPort = await synthBackend.startServer(38472);
      console.log(`[Synth 2] Connected to Synth Core Backend on http://127.0.0.1:${synthBackendPort}`);
    } catch (e) {
      console.warn('[Synth 2] Could not start Synth Core Backend:', e.message);
    }
  }

  return new Promise((resolve, reject) => {
    if (server.listening) {
      const addr = server.address();
      return resolve(addr && typeof addr === 'object' ? addr.port : port);
    }

    server
      .listen(port, '0.0.0.0', () => {
        const addr = server.address();
        const bound = addr && typeof addr === 'object' ? addr.port : port;
        console.log(`[Synth 2 Spotify Edition] Server running at http://0.0.0.0:${bound}`);
        resolve(bound);
      })
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          server.listen(0, '0.0.0.0', () => {
            const fallbackPort = server.address().port;
            console.log(`[Synth 2 Spotify Edition] Port ${port} busy, running on fallback http://0.0.0.0:${fallbackPort}`);
            resolve(fallbackPort);
          });
        } else {
          reject(err);
        }
      });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });
}

module.exports = { startServer, stopServer, server, DEFAULT_PORT };

if (require.main === module) {
  startServer();
}