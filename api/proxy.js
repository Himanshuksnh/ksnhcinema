// Vercel Serverless Function — /api/proxy
// All /api/* requests are rewritten here via vercel.json
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

  // vercel.json rewrites /api/X?Y → /api/proxy?__path=/X&Y
  // So req.url = /api/proxy?__path=/wefeed-mobile-bff/tab-operating&tabId=0
  const url = new URL(req.url, 'https://placeholder.com');
  const targetPath = url.searchParams.get('__path') || '/';
  url.searchParams.delete('__path');
  const qs = url.searchParams.toString();
  const fullPath = targetPath + (qs ? '?' + qs : '');

  // Read POST body
  let body = '';
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  }

  // Forward original headers — auth signature headers must pass through
  const skipHeaders = ['host', 'connection', 'transfer-encoding', 'x-forwarded-for', 'x-vercel-id', 'x-vercel-forwarded-for'];
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!skipHeaders.includes(k.toLowerCase())) forwardHeaders[k] = v;
  }
  forwardHeaders['host'] = 'gapi.inmoviebox.com';
  if (body) forwardHeaders['content-length'] = Buffer.byteLength(body).toString();

  console.log('[proxy] →', req.method, fullPath);

  const options = {
    hostname: 'gapi.inmoviebox.com',
    port: 443,
    path: fullPath,
    method: req.method,
    headers: forwardHeaders,
  };

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
      proxyRes.on('end', () => { res.end(Buffer.concat(chunks)); resolve(); });
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
