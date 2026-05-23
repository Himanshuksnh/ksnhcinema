import https from 'https';

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  const BASE = 'https://lok-lok.cc';
  const subjectId = '3476269390159565984';
  const url = `${BASE}/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=0&ep=0&detail_path=mortal-kombat-ii`;
  const headers = {
    'Accept': 'application/json',
    'Referer': `${BASE}/spa/videoPlayPage/movies/mortal-kombat-ii?id=${subjectId}&type=/movie/detail&lang=en`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Client-Info': '{"timezone":"America/Los_Angeles"}',
  };
  const { status, body } = await httpsGet(url, headers);
  console.log('Status:', status);
  console.log('Body:', body.substring(0, 1000));
  
  // Also try with different subjectId - a series
  const url2 = `${BASE}/wefeed-h5-bff/web/subject/play?subjectId=8772972936765623664&se=1&ep=1&detail_path=the-deal`;
  const { status: s2, body: b2 } = await httpsGet(url2, headers);
  console.log('\nSeries Status:', s2);
  console.log('Series Body:', b2.substring(0, 1000));
}

main().catch(console.error);
