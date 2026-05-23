// Vercel Catch-All — proxies /api/* → gapi.inmoviebox.com
const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // req.url = /api/wefeed-mobile-bff/tab-operating?tabId=0
  // Strip /api → /wefeed-mobile-bff/tab-operating?tabId=0
  const rawPath = req.url.replace(/^\/api/, '') || '/';

  // Read POST body
  let body = '';
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  }

  // Forward original headers (auth, signature, etc.) — these are critical for API auth
  const skipHeaders = ['host', 'connection', 'transfer-encoding', 'x-forwarded-for', 'x-vercel-id'];
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!skipHeaders.includes(k.toLowerCase())) {
      forwardHeaders[k] = v;
    }
  }
  forwardHeaders['host'] = 'gapi.inmoviebox.com';
  if (body) {
    forwardHeaders['content-length'] = Buffer.byteLength(body).toString();
  }

  const options = {
    hostname: 'gapi.inmoviebox.com',
    port: 443,
    path: rawPath,
    method: req.method,
    headers: forwardHeaders,
  };

  console.log('[proxy] →', req.method, 'gapi.inmoviebox.com' + rawPath);

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      const skipRes = ['transfer-encoding', 'connection'];
      const outHeaders = { 'Access-Control-Allow-Origin': '*' };
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!skipRes.includes(k.toLowerCase())) outHeaders[k] = v;
      }

      res.writeHead(proxyRes.statusCode || 200, outHeaders);

      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        res.end(Buffer.concat(chunks));
        resolve();
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy] error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      resolve();
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
};
