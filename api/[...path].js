// Vercel Catch-All Serverless Function
// Handles ALL /api/* requests → proxies to gapi.inmoviebox.com

const https = require('https');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Strip /api prefix → forward to gapi.inmoviebox.com
  const rawPath = req.url.replace(/^\/api/, '') || '/';

  // Read POST body
  let body = '';
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
    });
  }

  // Build forward headers — keep original headers from client
  const skip = ['host', 'connection', 'transfer-encoding'];
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!skip.includes(k.toLowerCase())) forwardHeaders[k] = v;
  }
  forwardHeaders['host'] = 'gapi.inmoviebox.com';
  if (body) forwardHeaders['content-length'] = Buffer.byteLength(body).toString();

  const options = {
    hostname: 'gapi.inmoviebox.com',
    port: 443,
    path: rawPath,
    method: req.method,
    headers: forwardHeaders,
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      // Forward response headers
      const skipRes = ['transfer-encoding', 'connection'];
      const responseHeaders = { 'Access-Control-Allow-Origin': '*' };
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!skipRes.includes(k.toLowerCase())) responseHeaders[k] = v;
      }

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);

      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        res.end(data);
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
