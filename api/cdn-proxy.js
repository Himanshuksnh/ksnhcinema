// Vercel Serverless Function — /cdn-proxy
// Streams CDN video with Cookie injection and Range support

const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'https://placeholder.vercel.app');
  const rawUrl = url.searchParams.get('url');
  const cookie = url.searchParams.get('cookie') || '';

  if (!rawUrl) {
    res.writeHead(400);
    res.end('Missing url param');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(rawUrl));
  } catch (e) {
    res.writeHead(400);
    res.end('Invalid url: ' + e.message);
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
      ...(req.headers['range'] ? { 'Range': req.headers['range'] } : {}),
    },
  };

  return new Promise((resolve) => {
    const proxyReq = lib.request(options, (proxyRes) => {
      const responseHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
        'accept-ranges': 'bytes',
      };

      const forward = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified'];
      for (const h of forward) {
        if (proxyRes.headers[h]) responseHeaders[h] = proxyRes.headers[h];
      }

      if (targetUrl.pathname.endsWith('.mpd') || targetUrl.pathname.endsWith('.xml')) {
        responseHeaders['content-type'] = 'application/dash+xml';
      }

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });

    proxyReq.on('error', (err) => {
      console.error('[cdn-proxy] error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Proxy error: ' + err.message);
      }
      resolve();
    });

    proxyReq.end();
  });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
