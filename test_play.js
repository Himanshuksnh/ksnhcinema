import CryptoJS from 'crypto-js';

const CONFIG = {
  baseUrl: 'https://gapi.inmoviebox.com',
  authToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjY5NzA2NDk5Mjg4NzIxMjEzNTIsImV4cCI6MTc4NTM5NjQxMSwiaWF0IjoxNzc3NjIwMTExfQ.wKJvdaoBhRzy6qOBxnk63-JEVIvlkSAaOlhRKN-l5iM',
  gatewayKey: '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O',
  keyVersion: 2,
  userAgent:
    'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)',
};

function toSortedQuery(queryString = '') {
  if (!queryString) return '';
  const p = new URLSearchParams(queryString);
  return [...p.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function signatureContent({ method, accept = '*/*', contentType = '', signPath, queryString = '', body = '' }) {
  const ts = Date.now();
  let pathWithQuery = signPath;
  const sortedQ = toSortedQuery(queryString);
  if (sortedQ) pathWithQuery = `${pathWithQuery}?${sortedQ}`;

  let bodyLength = '';
  let bodyMd5 = '';
  if (body) {
    bodyLength = String(body.length);
    const bodyForHash = body.length > 102400 ? body.slice(0, 102400) : body;
    bodyMd5 = CryptoJS.MD5(bodyForHash).toString();
  }

  return {
    ts,
    content: [method.toUpperCase(), accept, contentType, bodyLength, String(ts), bodyMd5, pathWithQuery].join('\n')
  };
}

function makeHeaders({ method, signPath, queryString = '', contentType = '', body = '' }) {
  const { ts, content } = signatureContent({ method, signPath, queryString, contentType, body });
  const keyBytes = CryptoJS.enc.Base64.parse(CONFIG.gatewayKey);
  const sig = CryptoJS.HmacMD5(content, keyBytes);
  const sigB64 = CryptoJS.enc.Base64.stringify(sig);

  return {
    accept: '*/*',
    ...(contentType ? { 'content-type': contentType } : {}),
    authorization: `Bearer ${CONFIG.authToken}`,
    'x-tr-signature': `${ts}|${CONFIG.keyVersion}|${sigB64}`,
    'x-play-mode': '2',
    'x-family-mode': '0',
    'x-content-mode': '0',
    'x-client-status': '1',
    'x-client-info': '{"package_name":"com.community.oneroom","version_name":"3.0.11.1230.03","version_code":50020080,"os":"android","os_version":"15"}',
    'user-agent': CONFIG.userAgent,
  };
}

async function testAllResolutions() {
  const subjectId = '8772972936765623664';
  const path = '/wefeed-mobile-bff/subject-api/resource';
  
  const resolutions = [1080, 720, 360];
  for (const r of resolutions) {
    const qs = `subjectId=${encodeURIComponent(subjectId)}&page=1&perPage=20&all=0&startPosition=1&endPosition=1&pagerMode=2&resolution=${r}&se=1&epFrom=1&epTo=1`;
    const fullUrl = `${CONFIG.baseUrl}${path}?${qs}`;

    try {
      const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs });
      const res = await fetch(fullUrl, { headers });
      const json = await res.json();
      const firstItem = json.data?.list?.[0];
      if (firstItem) {
        console.log(`Resolution ${r}p:`, {
          codecName: firstItem.codecName,
          resourceLink: firstItem.resourceLink?.substring(0, 100) + '...'
        });
      } else {
        console.log(`Resolution ${r}p: Not found`);
      }
    } catch (err) {
      console.error(`Request Error for ${r}:`, err);
    }
  }
}

testAllResolutions();
