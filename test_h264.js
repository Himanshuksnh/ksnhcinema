import CryptoJS from 'crypto-js';

const CONFIG = {
  baseUrl: 'https://gapi.inmoviebox.com',
  authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjY5NzA2NDk5Mjg4NzIxMjEzNTIsImV4cCI6MTc4NTM5NjQxMSwiaWF0IjoxNzc3NjIwMTExfQ.wKJvdaoBhRzy6qOBxnk63-JEVIvlkSAaOlhRKN-l5iM',
  gatewayKey: '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O',
  keyVersion: 2,
  userAgent: 'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)',
};

function toSortedQuery(q = '') {
  if (!q) return '';
  return [...new URLSearchParams(q).entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`${k}=${v}`).join('&');
}

function makeHeaders({ method, signPath, queryString = '', playMode = '2' }) {
  const ts = Date.now();
  const sortedQ = toSortedQuery(queryString);
  const pathWithQuery = sortedQ ? `${signPath}?${sortedQ}` : signPath;
  const content = [method.toUpperCase(), '*/*', '', '', String(ts), '', pathWithQuery].join('\n');
  const keyBytes = CryptoJS.enc.Base64.parse(CONFIG.gatewayKey);
  const sig = CryptoJS.enc.Base64.stringify(CryptoJS.HmacMD5(content, keyBytes));
  return {
    accept: '*/*',
    authorization: `Bearer ${CONFIG.authToken}`,
    'x-tr-signature': `${ts}|${CONFIG.keyVersion}|${sig}`,
    'x-play-mode': playMode,
    'x-family-mode': '0', 'x-content-mode': '0', 'x-client-status': '1',
    'x-client-info': '{"package_name":"com.community.oneroom","version_name":"3.0.11.1230.03","version_code":50020080,"os":"android","os_version":"15"}',
    'user-agent': CONFIG.userAgent,
  };
}

async function testPlayMode(mode, label) {
  const subjectId = '8772972936765623664';
  const path = '/wefeed-mobile-bff/subject-api/play-info';
  const qs = `subjectId=${subjectId}&se=1&ep=1`;
  const url = `${CONFIG.baseUrl}${path}?${qs}`;
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs, playMode: mode });
  
  const res = await fetch(url, { headers });
  const json = await res.json();
  
  console.log(`\n=== play-mode: ${mode} (${label}) ===`);
  if (json.code === 0 && json.data?.streams) {
    for (const s of json.data.streams) {
      console.log({
        resolution: s.resolutions,
        codecName: s.codecName || 'unknown',
        urlType: s.url?.includes('.mpd') ? 'DASH' : s.url?.includes('.m3u8') ? 'HLS' : 'MP4',
        url: s.url?.substring(0, 80),
      });
    }
  } else {
    console.log('Response:', JSON.stringify(json).substring(0, 200));
  }
}

async function testResourceWithH264() {
  // Try resource API with different params to get H.264
  const subjectId = '8772972936765623664';
  const path = '/wefeed-mobile-bff/subject-api/resource';
  
  // Try without resolution filter to get all
  const qs = `subjectId=${subjectId}&page=1&perPage=20&all=0&startPosition=1&endPosition=1&pagerMode=2&se=1&epFrom=1&epTo=1`;
  const url = `${CONFIG.baseUrl}${path}?${qs}`;
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs });
  
  const res = await fetch(url, { headers });
  const json = await res.json();
  console.log('\n=== Resource API (no resolution filter) ===');
  if (json.data?.list?.length) {
    for (const item of json.data.list) {
      console.log({ resolution: item.resolution, codecName: item.codecName, url: item.resourceLink?.substring(0, 80) });
    }
  } else {
    console.log('No results:', JSON.stringify(json).substring(0, 200));
  }
}

// Test different play modes
Promise.resolve()
  .then(() => testPlayMode('1', 'H264/web'))
  .then(() => testPlayMode('2', 'H265/mobile'))
  .then(() => testPlayMode('3', 'mode3'))
  .then(() => testResourceWithH264());
