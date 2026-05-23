// Vercel Serverless Function — handles /cdn-proxy route
// Streams CDN video content with Cookie injection and Range support
// Replaces the vite.config.js streamProxyMiddleware (local dev only)

const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const rawUrl = url.searchParams.get('url');
  const cookie = url.searchParams.get('cookie') || '';

  if (!rawUrl) {
    res.status(400).end('Missing url param');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(rawUrl));
  } catch (e) {
    res.status(400).end('Invalid url: ' + e.message);
    return;
  }

  const isHttps = targetUrl.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)',
      'Referer': 'https://gapi.inmoviebox.com/',
      'Origin': 'https://gapi.inmoviebox.com',
      ...(cookie ? { 'Cookie': decodeURIComponent(cookie) } : {}),
      // Forward Range header — critical for video seeking
      ...(req.headers['range'] ? { 'Range': req.headers['range'] } : {}),
    },
  };

  return new Promise((resolve) => {
    const proxyReq = lib.request(options, (proxyRes) => {
      const statusCode = proxyRes.statusCode || 200;

      // Forward video-relevant headers
      const forwardHeaders = [
        'content-type', 'content-length', 'content-range',
        'accept-ranges', 'cache-control', 'etag', 'last-modified',
      ];
      for (const h of forwardHeaders) {
        if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
      }

      // Always advertise byte-range support for seeking
      if (!proxyRes.headers['accept-ranges']) {
        res.setHeader('accept-ranges', 'bytes');
      }

      // Fix MPD content-type for dash.js
      if (targetUrl.pathname.endsWith('.mpd') || targetUrl.pathname.endsWith('.xml')) {
        res.setHeader('content-type', 'application/dash+xml');
      }

      res.status(statusCode);
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) res.status(502).end('Proxy error: ' + err.message);
      resolve();
    });

    proxyReq.end();
  });
};
