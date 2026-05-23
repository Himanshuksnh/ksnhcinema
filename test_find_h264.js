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

// Try multiple subjects to find one with H.264 / non-HEVC stream
const testSubjects = [
  { id: '8772972936765623664', name: 'Test 1', se: 1, ep: 1 },
  { id: '8772972936765623664', name: 'Test 1 Movie', se: 0, ep: 0 },
];

// First get some subjects from tab data
async function getSubjectsFromTab() {
  const path = '/wefeed-mobile-bff/tab-operating';
  const qs = 'tabId=2'; // Movies tab
  const url = `${CONFIG.baseUrl}${path}?${qs}`;
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs });
  const res = await fetch(url, { headers });
  const json = await res.json();
  
  const subjects = [];
  if (json.code === 0 && json.data?.items) {
    for (const section of json.data.items) {
      const items = section.subjects || section.rankings || [];
      for (const item of items.slice(0, 3)) {
        const subject = item.subject || item;
        if (subject.subjectId) {
          subjects.push({ id: subject.subjectId, name: subject.title || subject.name, subjectType: subject.subjectType });
        }
      }
      if (subjects.length >= 6) break;
    }
  }
  return subjects;
}

async function checkSubjectCodec(subjectId, name, subjectType) {
  const path = '/wefeed-mobile-bff/subject-api/play-info';
  const isMovie = subjectType === 1;
  const qs = `subjectId=${subjectId}&se=${isMovie ? 0 : 1}&ep=${isMovie ? 0 : 1}`;
  const url = `${CONFIG.baseUrl}${path}?${qs}`;
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString: qs });
  
  try {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (json.code === 0 && json.data?.streams?.length) {
      const stream = json.data.streams[0];
      const codec = stream.codecName || 'unknown';
      const urlType = stream.url?.includes('.mpd') ? 'DASH' : stream.url?.includes('.m3u8') ? 'HLS' : 'MP4';
      console.log(`[${codec.toUpperCase()}/${urlType}] ${name} (${subjectId}) - ${stream.url?.substring(0, 70)}`);
      return { codec, urlType, url: stream.url, signCookie: stream.signCookie, subjectId };
    }
  } catch(e) {}
  return null;
}

async function main() {
  console.log('Fetching subjects from Movies tab...');
  const subjects = await getSubjectsFromTab();
  console.log(`Found ${subjects.length} subjects\n`);
  
  const results = [];
  for (const s of subjects) {
    const r = await checkSubjectCodec(s.id, s.name, s.subjectType);
    if (r) results.push(r);
  }
  
  const h264 = results.filter(r => r.codec !== 'hevc');
  const hevc = results.filter(r => r.codec === 'hevc');
  
  console.log(`\n✅ H.264/Other: ${h264.length}`);
  console.log(`❌ HEVC only: ${hevc.length}`);
  
  if (h264.length > 0) {
    console.log('\nH.264 stream found:', h264[0]);
  }
}

main();
