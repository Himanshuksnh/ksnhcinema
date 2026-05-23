// Test loklok API for H.264 streams
const BASE = 'https://www.loklok.cc';

async function testLoklok(subjectId, detailPath, se, ep) {
  const url = `${BASE}/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detail_path=${detailPath}`;
  const headers = {
    'Accept': 'application/json',
    'Referer': `${BASE}/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail&lang=en`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Client-Info': '{"timezone":"America/Los_Angeles"}',
  };
  
  try {
    const res = await fetch(url, { headers });
    const json = await res.json();
    console.log('Status:', res.status);
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
      console.log('Response:', JSON.stringify(json).substring(0, 300));
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
}

// Try with a known subject
// Mortal Kombat II
testLoklok('3476269390159565984', 'mortal-kombat-ii', 0, 0);
