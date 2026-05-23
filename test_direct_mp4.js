import CryptoJS from 'crypto-js';
import https from 'https';

const CONFIG = {
  baseUrl: 'https://gapi.inmoviebox.com',
  authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjY5NzA2NDk5Mjg4NzIxMjEzNTIsImV4cCI6MTc4NTM5NjQxMSwiaWF0IjoxNzc3NjIwMTExfQ.wKJvdaoBhRzy6qOBxnk63-JEVIvlkSAaOlhRKN-l5iM',
  gatewayKey: '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O',
  keyVersion: 2,
  userAgent: 'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)',
};

function makeHeaders({ method, signPath, queryString = '' }) {
  const ts = Date.now();
  const sorted = [...new URLSearchParams(queryString).entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`${k}=${v}`).join('&');
  const pathWithQuery = sorted ? `${signPath}?${sorted}` : signPath;
  const content = [method.toUpperCase(), '*/*', '', '', String(ts), '', pathWithQuery].join('\n');
  const keyBytes = CryptoJS.enc.Base64.parse(CONFIG.gatewayKey);
  const sig = CryptoJS.enc.Base64.stringify(CryptoJS.HmacMD5(content, keyBytes));
  return {
    accept: '*/*',
    authorization: `Bearer ${CONFIG.authToken}`,
    'x-tr-signature': `${ts}|${CONFIG.keyVersion}|${sig}`,
    'x-play-mode': '2', 'x-family-mode': '0', 'x-content-mode': '0', 'x-client-status': '1',
    'x-client-info': '{"package_name":"com.community.oneroom","version_name":"3.0.11.1230.03","version_code":50020080,"os":"android","os_version":"15"}',
    'user-agent': CONFIG.userAgent,
  };
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function testDirectMp4(subjectId, se, ep) {
  const path = '/wefeed-mobile-bff/subject-api/resource';
  const qs = `subjectId=${subjectId}&page=1&perPage=20&all=0&startPosition=1&endPosition=1&pagerMode=2&resolution=720&se=${se}&epFrom=${ep}&epTo=${ep}`;
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs });
  
  const { body } = await httpsGet(`${CONFIG.baseUrl}${path}?${qs}`, headers);
  const json = JSON.parse(body);
  
  if (json.code === 0 && json.data?.list?.length) {
    const item = json.data.list[0];
    console.log('Resource URL:', item.resourceLink?.substring(0, 120));
    console.log('Codec:', item.codecName);
    console.log('SignCookie:', item.signCookie?.substring(0, 60));
    
    // Test if URL is accessible with cookie
    if (item.resourceLink) {
      const cookie = item.signCookie || '';
      const testHeaders = {
        'User-Agent': CONFIG.userAgent,
        'Referer': 'https://gapi.inmoviebox.com/',
        'Range': 'bytes=0-1023',
        ...(cookie ? { 'Cookie': cookie } : {}),
      };
      
      try {
        const { status, headers: resHeaders } = await httpsGet(item.resourceLink, testHeaders);
        console.log('\nDirect MP4 fetch status:', status);
        console.log('Content-Type:', resHeaders['content-type']);
        console.log('Content-Range:', resHeaders['content-range']);
        console.log('Accept-Ranges:', resHeaders['accept-ranges']);
      } catch(e) {
        console.log('Direct fetch error:', e.message);
      }
    }
  } else {
    console.log('No resource found:', body.substring(0, 200));
  }
}

console.log('=== Testing direct MP4 resource ===');
testDirectMp4('8772972936765623664', 1, 1);
