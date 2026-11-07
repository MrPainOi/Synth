const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3030;
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
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3030'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API 1: Return user's Synth library tracks
  if (pathname === '/api/synth-tracks') {
    try {
      if (fs.existsSync(SYNTH_METADATA_PATH)) {
        const raw = fs.readFileSync(SYNTH_METADATA_PATH, 'utf8');
        const meta = JSON.parse(raw);
        const tracks = Object.values(meta).map(t => ({
          ...t,
          streamUrl: `/api/stream/${encodeURIComponent(t.id)}`
        }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(tracks));
      }
    } catch (e) {
      console.error('Error reading Synth metadata:', e);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify([]));
  }

  // API 2: Stream audio file from Synth tracks dir
  if (pathname.startsWith('/api/stream/')) {
    const trackId = pathname.replace('/api/stream/', '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const trackPath = path.join(SYNTH_TRACKS_DIR, `${trackId}.opus`);

    if (!fs.existsSync(trackPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Track not found');
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

  // Static files
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Spotify UI server listening on http://127.0.0.1:${PORT}`);
});
