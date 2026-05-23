import https from 'https';

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers,
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function testLokLok() {
  const BASE = 'https://lok-lok.cc';
  const subjectId = '3476269390159565984';
  const url = `${BASE}/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=0&ep=0&detail_path=mortal-kombat-ii`;
  
  const headers = {
    'Accept': 'application/json',
    'Referer': `${BASE}/spa/videoPlayPage/movies/mortal-kombat-ii?id=${subjectId}&type=/movie/detail&lang=en`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Client-Info': '{"timezone":"America/Los_Angeles"}',
  };
  
  console.log('Testing lok-lok.cc...');
  try {
    const { status, body } = await httpsGet(url, headers);
    console.log('Status:', status);
    const json = JSON.parse(body);
    if (json.code === 0 && json.data?.streams) {
      for (const s of json.data.streams) {
        console.log({
          resolution: s.resolutions,
          codec: s.codecName || 'unknown',
          type: s.url?.includes('.mpd') ? 'DASH' : s.url?.includes('.m3u8') ? 'HLS' : 'MP4',
          url: s.url?.substring(0, 100),
        });
      }
    } else {
      console.log('Response:', body.substring(0, 400));
    }
  } catch(e) {
    console.error('lok-lok Error:', e.message);
  }
}

async function testAoneroom() {
  const BASE = 'https://h5-api.aoneroom.com';
  const subjectId = '3476269390159565984';
  const url = `${BASE}/wefeed-h5api-bff/web/subject/play?subjectId=${subjectId}&se=0&ep=0&detail_path=mortal-kombat-ii`;
  
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Client-Info': '{"timezone":"America/Los_Angeles"}',
    'Referer': 'https://h5.aoneroom.com/',
  };
  
  console.log('\nTesting h5-api.aoneroom.com...');
  try {
    const { status, body } = await httpsGet(url, headers);
    console.log('Status:', status);
    const json = JSON.parse(body);
    if (json.code === 0 && json.data?.streams) {
      for (const s of json.data.streams) {
        console.log({
          resolution: s.resolutions,
          codec: s.codecName || 'unknown',
          type: s.url?.includes('.mpd') ? 'DASH' : s.url?.includes('.m3u8') ? 'HLS' : 'MP4',
          url: s.url?.substring(0, 100),
        });
      }
    } else {
      console.log('Response:', body.substring(0, 400));
    }
  } catch(e) {
    console.error('Aoneroom Error:', e.message);
  }
}

testLokLok().then(() => testAoneroom());
