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

function makeHeaders({ method, signPath, queryString = '' }) {
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
    'x-play-mode': '2', 'x-family-mode': '0', 'x-content-mode': '0', 'x-client-status': '1',
    'x-client-info': '{"package_name":"com.community.oneroom","version_name":"3.0.11.1230.03","version_code":50020080,"os":"android","os_version":"15"}',
    'user-agent': CONFIG.userAgent,
  };
}

async function main() {
  const path = '/wefeed-mobile-bff/subject-api/play-info';
  const qs = 'subjectId=8772972936765623664&se=1&ep=1';
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs });
  const res = await fetch(`${CONFIG.baseUrl}${path}?${qs}`, { headers });
  const json = await res.json();
  
  const stream = json.data?.streams?.[0];
  const mpdUrl = stream?.url;
  const cookie = stream?.signCookie;
  
  const proxyUrl = `http://localhost:5176/cdn-proxy?url=${encodeURIComponent(mpdUrl)}&cookie=${encodeURIComponent(cookie)}&rewrite=1`;
  const proxyRes = await fetch(proxyUrl);
  const text = await proxyRes.text();
  
  // Print full MPD to see segment URL structure
  console.log('=== FULL MPD (first 3000 chars) ===');
  console.log(text.substring(0, 3000));
  
  // Look for SegmentTemplate, BaseURL, initialization, media
  const lines = text.split('\n');
  const interesting = lines.filter(l => 
    l.includes('BaseURL') || l.includes('initialization') || 
    l.includes('media=') || l.includes('SegmentTemplate') ||
    l.includes('SegmentList') || l.includes('SegmentURL')
  );
  console.log('\n=== SEGMENT-RELATED LINES ===');
  interesting.forEach(l => console.log(l.trim()));
}

main().catch(console.error);
