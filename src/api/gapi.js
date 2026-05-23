import CryptoJS from 'crypto-js';

const CONFIG = {
  baseUrls: ['/apig', '/api'],
  authToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjY5NzA2NDk5Mjg4NzIxMjEzNTIsImV4cCI6MTc4NTM5NjQxMSwiaWF0IjoxNzc3NjIwMTExfQ.wKJvdaoBhRzy6qOBxnk63-JEVIvlkSAaOlhRKN-l5iM',
  gatewayKey: '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O',
  keyVersion: 2,
  userAgent:
    'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)',
  baseUrlInmoviebox: 'https://gapi.inmoviebox.com',
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

  const content = [method.toUpperCase(), accept, contentType, bodyLength, String(ts), bodyMd5, pathWithQuery].join('\n');
  return { ts, content };
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

async function requestWithFallback({ method, path, queryString = '', bodyObj = null, acceptJson = null }) {
  const qs = queryString ? `?${queryString}` : '';
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  let lastErr = null;

  for (const base of CONFIG.baseUrls) {
    const fullPath = `${base}${path}${qs}`;
    try {
      const headers = makeHeaders({
        method,
        signPath: path,
        queryString,
        contentType: bodyObj ? 'application/json' : '',
        body,
      });
      const res = await fetch(fullPath, {
        method,
        headers,
        ...(bodyObj ? { body } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (typeof acceptJson === 'function' && !acceptJson(json)) {
        throw new Error('Invalid API payload for this host');
      }
      return json;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Request failed');
}

// ─── Tab / Browse APIs ────────────────────────────────────────────────────────

export async function fetchTabData(tabId) {
  const path = '/wefeed-mobile-bff/tab-operating';
  const queryString = `tabId=${tabId}`;
  const qs = `?${queryString}`;
  const fullPath = `/api${path}${qs}`;
  const headers = makeHeaders({ method: 'GET', signPath: path, queryString });
  const res = await fetch(fullPath, { method: 'GET', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.code !== 0 || !json?.data) throw new Error(json.msg || 'Failed to fetch tab data');
  return json.data;
}

export function flattenItems(tabData) {
  const sections = tabData?.items || [];
  const out = [];
  for (const section of sections) {
    const sectionTitle = section?.title || 'Section';
    const subjects = Array.isArray(section?.subjects) ? section.subjects : [];
    const rankings = Array.isArray(section?.rankings) ? section.rankings : [];
    for (const item of subjects) out.push({ ...item, _sectionTitle: sectionTitle });
    for (const item of rankings) out.push({ ...item, _sectionTitle: sectionTitle });
  }
  const byId = new Map();
  for (const item of out) {
    const id = String(item?.subjectId || item?.id || item?.subject?.subjectId || `${item?.title || 'item'}_${Math.random()}`);
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()];
}

// ─── Resolution helpers ───────────────────────────────────────────────────────

function parseSingleResolution(resolutionStr) {
  if (!resolutionStr) return 0;
  const str = String(resolutionStr);
  if (str.includes(',')) return parseInt(str.split(',')[0].trim(), 10) || 0;
  return parseInt(str, 10) || 0;
}

function parseAllResolutions(resolutionStr) {
  if (!resolutionStr) return [];
  const str = String(resolutionStr);
  if (str.includes(',')) {
    return str.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
  }
  const n = parseInt(str, 10);
  return n > 0 ? [n] : [];
}

// ─── CDN Proxy URL builder ────────────────────────────────────────────────────
// Only used for DASH streams that need Cookie injection.
// Direct MP4 URLs from resource API have ?sign= param — no proxy needed.
function buildProxyUrl(cdnUrl, cookie) {
  if (!cdnUrl) return '';
  // If URL already has a sign param (resource API MP4s), use directly via proxy for CORS
  const encodedUrl = encodeURIComponent(cdnUrl);
  const encodedCookie = cookie ? encodeURIComponent(cookie) : '';
  let url = `/cdn-proxy?url=${encodedUrl}`;
  if (encodedCookie) url += `&cookie=${encodedCookie}`;
  return url;
}

// ─── Primary: Resource API (direct MP4, no Cookie needed) ────────────────────
// Resource API returns direct MP4 URLs with ?sign= auth param.
// These work directly in <video src> — no DASH, no Cookie, no proxy needed.
// This is the PREFERRED source for browser playback.
export async function fetchResourceQualities(subjectId, season = 1, episode = 1) {
  const path = '/wefeed-mobile-bff/subject-api/resource';
  const resolutions = [1080, 720, 480, 360];

  const fetchPromises = resolutions.map(async (resolution) => {
    const qs = [
      `subjectId=${encodeURIComponent(subjectId)}`,
      'page=1', 'perPage=20', 'all=0',
      'startPosition=1', 'endPosition=1', 'pagerMode=2',
      `resolution=${resolution}`,
      `se=${season}`, `epFrom=${episode}`, `epTo=${episode}`,
    ].join('&');

    try {
      const json = await requestWithFallback({
        method: 'GET', path, queryString: qs,
        acceptJson: (payload) => payload?.code === 0,
      });
      if (json.code !== 0 || !json.data?.list?.length) return [];

      const localResults = [];
      for (const row of json.data.list) {
        if (!row?.resourceLink) continue;
        const r = Number(row.resolution || resolution);
        // Direct MP4 URL — ?sign= param handles auth, no Cookie needed
        // Route through proxy only for CORS (browser blocks cross-origin video)
        localResults.push({
          resolution: r,
          label: `${r}p`,
          size: Number(row.size || 0),
          url: buildProxyUrl(row.resourceLink, ''), // no cookie needed
          rawUrl: row.resourceLink,
        });
      }
      return localResults;
    } catch (e) {
      return [];
    }
  });

  const allResultsLists = await Promise.all(fetchPromises);
  const results = allResultsLists.flat();

  // Deduplicate by resolution — keep only one entry per resolution (highest size = best quality)
  const byResolution = new Map();
  for (const q of results) {
    const existing = byResolution.get(q.resolution);
    if (!existing || q.size > existing.size) {
      byResolution.set(q.resolution, q);
    }
  }
  return [...byResolution.values()].sort((a, b) => b.resolution - a.resolution);
}

// ─── Play Info (DASH fallback — only if resource API fails) ──────────────────
export async function fetchPlayInfo(subjectId, season = 1, episode = 1) {
  const path = '/wefeed-mobile-bff/subject-api/play-info';
  const qs = `subjectId=${encodeURIComponent(subjectId)}&se=${season}&ep=${episode}`;
  const json = await requestWithFallback({ method: 'GET', path, queryString: qs });
  if (json?.code !== 0 || !json?.data) throw new Error(json?.msg || 'Play info not found');

  const streams = (json.data.streams || []).filter((s) => s?.url);

  if (streams.length === 0) {
    return { videoUrl: '', videoHeaders: {}, qualityOptions: [], streamId: null };
  }

  streams.sort((a, b) => {
    const resA = parseSingleResolution(a.resolutions || a.resolution);
    const resB = parseSingleResolution(b.resolutions || b.resolution);
    return resB - resA;
  });

  const highestStream = streams[0];
  const signCookie = highestStream?.signCookie || '';
  const streamId = highestStream?.id?.toString() || null;

  // DASH stream — needs proxy + Cookie
  const proxyVideoUrl = buildProxyUrl(highestStream.url, signCookie);

  const qualityOptions = [];
  for (const s of streams) {
    const resolutions = parseAllResolutions(s.resolutions || s.resolution || '0');
    const url = s.url || '';
    const size = parseInt(s.size || 0, 10);
    const cookie = s.signCookie || signCookie;
    if (!url) continue;
    for (const res of resolutions) {
      if (res > 0) {
        qualityOptions.push({
          resolution: res, label: `${res}p`, size,
          url: buildProxyUrl(url, cookie),
          rawUrl: url, cookie,
        });
      }
    }
  }

  qualityOptions.sort((a, b) => b.resolution - a.resolution);
  const uniq = new Map();
  for (const q of qualityOptions) {
    const key = `${q.resolution}_${q.rawUrl}`;
    if (!uniq.has(key)) uniq.set(key, q);
  }

  return {
    videoUrl: proxyVideoUrl,
    rawVideoUrl: highestStream.url,
    signCookie,
    videoHeaders: {},
    qualityOptions: [...uniq.values()],
    streamId,
  };
}

// ─── Series / Season APIs ─────────────────────────────────────────────────────

export async function fetchSeriesDetails(subjectId) {
  const path = '/wefeed-mobile-bff/subject-api/season-info';
  const qs = `subjectId=${encodeURIComponent(subjectId)}`;
  const json = await requestWithFallback({ method: 'GET', path, queryString: qs });
  if (json?.code !== 0 || !json?.data?.seasons) return [];

  const seasons = json.data.seasons;
  for (const season of seasons) {
    if (season.allEp && typeof season.allEp === 'string') {
      const epList = season.allEp.split(',').map((e) => parseInt(e.trim(), 10)).filter((e) => !isNaN(e));
      if (epList.length > 0) {
        season.episodeList = epList;
        season.minEp = Math.min(...epList);
        season.maxEpActual = Math.max(...epList);
      }
    }
    if (!season.episodeList && season.maxEp) {
      const maxEp = Number(season.maxEp || 0);
      season.episodeList = Array.from({ length: maxEp }, (_, i) => i + 1);
    }
  }
  return seasons;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchSubjects(keyword, page = 1, tabId = '', perPage = 20) {
  const path = '/wefeed-mobile-bff/subject-api/search/v2';
  const json = await requestWithFallback({
    method: 'POST', path,
    bodyObj: { keyword, page, perPage, tabId },
    acceptJson: (payload) => payload?.code === 0 && !!payload?.data,
  });

  if (json.code !== 0 || !json.data?.results) return [];

  const out = [];
  for (const bucket of json.data.results) {
    if (bucket?.topicType !== 'SUBJECT' || !Array.isArray(bucket.subjects)) continue;
    for (const subject of bucket.subjects) {
      if (Number(subject?.subjectType || 0) === 6) continue;
      const genreStr = String(subject?.genre || '').toLowerCase().trim();
      if (genreStr.includes('adult') && String(keyword).toLowerCase().trim() !== 'adult') continue;
      out.push(subject);
    }
  }
  return out;
}

// ─── Filter / List APIs ───────────────────────────────────────────────────────

export async function fetchFilterItems(tabId) {
  const path = '/wefeed-mobile-bff/subject-api/filter-items';
  const queryString = `tabId=${encodeURIComponent(tabId)}&filterItemVer=v3`;
  const json = await requestWithFallback({
    method: 'GET', path, queryString,
    acceptJson: (payload) => payload?.code === 0 && !!payload?.data,
  });
  if (json?.code !== 0 || !json?.data) throw new Error(json?.msg || 'Failed to fetch filter items');
  return json.data;
}

export async function fetchFilteredList({ channelId, page = 1, perPage = 60, classify = 'All', country = 'All', rate = ['0', '10'], year = 'All', genre = 'All', sort = 'ForYou' }) {
  const path = '/wefeed-mobile-bff/subject-api/list';
  const bodyObj = { page, perPage, channelId: String(channelId), classify, country, rate, year, genre, sort };
  const json = await requestWithFallback({
    method: 'POST', path, bodyObj,
    acceptJson: (payload) => payload?.code === 0 && !!payload?.data,
  });
  if (json?.code !== 0 || !json?.data) throw new Error(json?.msg || 'Failed to fetch list');
  return Array.isArray(json?.data?.items) ? json.data.items : [];
}

// ─── Dubs / Community APIs ────────────────────────────────────────────────────

export async function fetchAvailableDubs(subjectId) {
  if (!subjectId) return [];
  const path = '/wefeed-mobile-bff/subject-api/dub-info';
  const qs = `subjectId=${encodeURIComponent(subjectId)}`;
  try {
    const json = await requestWithFallback({ method: 'GET', path, queryString: qs });
    if (json?.code === 0 && json?.data?.dubs) {
      return Array.isArray(json.data.dubs) ? json.data.dubs : [];
    }
  } catch (e) {
    console.error('Failed to fetch available dubs:', e);
  }
  return [];
}

export async function fetchCommunityPostCount(subjectId) {
  if (!subjectId) return 0;
  const path = '/wefeed-mobile-bff/post/count/subject';
  const qs = `subjectId=${encodeURIComponent(subjectId)}`;
  try {
    const json = await requestWithFallback({ method: 'GET', path, queryString: qs });
    if (json?.code === 0 && json?.data) return Number(json.data.count || 0);
  } catch (e) {
    console.error('Failed to fetch post count:', e);
  }
  return 0;
}

export async function fetchCommunityPosts(subjectId, page = 0, perPage = 50) {
  if (!subjectId) return [];
  const path = '/wefeed-mobile-bff/post/list/subject';
  const qs = `id=${encodeURIComponent(subjectId)}&page=${page}&perPage=${perPage}&type=1`;
  try {
    const json = await requestWithFallback({ method: 'GET', path, queryString: qs });
    if (json?.code === 0 && json?.data?.items) return Array.isArray(json.data.items) ? json.data.items : [];
  } catch (e) {
    console.error('Failed to fetch community posts:', e);
  }
  return [];
}

export async function fetchResourceTitle(subjectId) {
  if (!subjectId) return '';
  try {
    const path = '/wefeed-mobile-bff/subject-api/resource';
    const qs = `subjectId=${encodeURIComponent(subjectId)}&page=1&perPage=1&all=0&startPosition=1&endPosition=1&pagerMode=2&resolution=1080&se=1&epFrom=1&epTo=1`;
    const json = await requestWithFallback({ method: 'GET', path, queryString: qs });
    if (json?.code === 0 && json?.data?.subjectTitle) return String(json.data.subjectTitle);
  } catch (e) {
    console.error('Failed to fetch resource title:', e);
  }
  return '';
}

export async function fetchSubtitles(subjectId, streamId = '', detailPath = '') {
  if (!subjectId || !streamId) return [];
  const formats = ['MP4', 'HLS'];
  for (const format of formats) {
    const rawUrl = `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/caption?subjectId=${encodeURIComponent(subjectId)}&detailPath=${encodeURIComponent(detailPath)}&format=${format}&id=${encodeURIComponent(streamId)}`;
    const url = `/cdn-proxy?url=${encodeURIComponent(rawUrl)}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Client-Info': '{"timezone":"America/Los_Angeles"}'
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.code === 0 && json?.data?.captions && Array.isArray(json.data.captions) && json.data.captions.length > 0) {
          return json.data.captions;
        }
      }
    } catch (e) {
      console.error('Caption fetch error:', e);
    }
  }
  return [];
}
