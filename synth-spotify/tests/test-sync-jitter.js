const http = require('http');

function postJson(urlStr, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET'
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('=== VERIFYING REMOTE SYNC & JITTER GUARD ===\n');

  // 1. Verify PIN
  const pinRes = await postJson('http://127.0.0.1:38473/api/verify-pin', { pin: '5311' });
  console.log('1. Verify PIN response:', pinRes.status, pinRes.data?.ok ? 'OK' : 'FAIL');
  if (!pinRes.data?.ok) throw new Error('PIN verification failed');

  // 2. Open PC web SSE stream to count received commands
  const receivedCommands = [];
  const pcStreamReq = http.request('http://127.0.0.1:3030/api/remote/pc-stream', (res) => {
    res.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.includes('event: command')) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const cmd = JSON.parse(line.slice(6));
              receivedCommands.push(cmd);
            } catch (_) {}
          }
        }
      }
    });
  });
  pcStreamReq.end();

  // Wait 300ms for SSE connection
  await new Promise(r => setTimeout(r, 300));

  // 3. Send a single playTrack command from client via direct port 38473
  console.log('2. Sending playTrack for Olivia Rodrigo - Drivers License...');
  const testTrack1 = {
    id: 'olivia_01',
    title: 'Drivers License',
    artist: 'Olivia Rodrigo',
    thumbnail: 'https://example.com/art1.jpg',
    duration: 242
  };

  const cmdRes = await postJson('http://127.0.0.1:38473/api/command', {
    action: 'playTrack',
    track: testTrack1,
    clientDevice: 'Synth-Mobile'
  });
  console.log('3. Command sent status:', cmdRes.status, cmdRes.data?.ok ? 'OK' : 'FAIL');

  // Wait 400ms to observe command count on PC stream
  await new Promise(r => setTimeout(r, 400));
  console.log(`4. PC received commands count: ${receivedCommands.length} (Expected: exactly 1, no duplicate/triplicate delivery)`);
  if (receivedCommands.length !== 1) {
    throw new Error(`Expected exactly 1 command delivered to PC, got ${receivedCommands.length}`);
  }

  // 4. Update PC state to reflect track 1
  console.log('5. PC broadcasting state for Track 1...');
  await postJson('http://127.0.0.1:3030/api/remote/update-state', {
    isPlaying: true,
    currentTime: 10,
    duration: 242,
    volume: 0.8,
    track: testTrack1
  });

  const stateRes1 = await getJson('http://127.0.0.1:3030/api/remote/state');
  console.log('6. Current state track:', stateRes1.data?.track?.title);
  if (stateRes1.data?.track?.id !== 'olivia_01') {
    throw new Error('Track 1 not set in remote state');
  }

  // 5. Test rapid switch to Track 2
  console.log('7. Client switches to Track 2 (Deja Vu)...');
  const testTrack2 = {
    id: 'olivia_02',
    title: 'Deja Vu',
    artist: 'Olivia Rodrigo',
    thumbnail: 'https://example.com/art2.jpg',
    duration: 215
  };

  await postJson('http://127.0.0.1:3030/api/remote/update-state', {
    isPlaying: true,
    currentTime: 0,
    duration: 215,
    volume: 0.8,
    track: testTrack2
  });

  const stateRes2 = await getJson('http://127.0.0.1:3030/api/remote/state');
  console.log('8. State after switch to Track 2:', stateRes2.data?.track?.title);
  if (stateRes2.data?.track?.id !== 'olivia_02') {
    throw new Error('Track 2 not set in remote state');
  }

  pcStreamReq.destroy();
  console.log('\n✔ ALL REMOTE SYNC & JITTER GUARD VERIFICATIONS PASSED!\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
