// Vercel Catch-All Serverless Function
// Handles ALL /api/* requests and proxies them to gapi.inmoviebox.com
// File name [...path].js = catch-all route in Vercel

const https = require('https');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
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

  // Forward headers
  const forwardHeaders = {};
  const skip = ['host', 'connection', 'transfer-encoding'];
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
      const skipRes = ['transfer-encoding', 'connection'];
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!skipRes.includes(k.toLowerCase())) res.setHeader(k, v);
      }
      res.status(proxyRes.statusCode || 200);

      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => { res.end(data); resolve(); });
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ error: err.message });
      resolve();
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
};
