// Vercel Serverless Function — handles /api/* and /apig/* routes
// Replaces vite.config.js proxy (which only works in local dev)

const https = require('https');

const TARGETS = {
  gapi: 'gapi.inmoviebox.com',
  apig: 'apig.inmoviebox.com',
};

module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tr-signature, x-play-mode, x-family-mode, x-content-mode, x-client-status, x-client-info, user-agent');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { target, path } = req.query;
  const hostname = TARGETS[target];

  if (!hostname || !path) {
    res.status(400).json({ error: 'Missing target or path' });
    return;
  }

  // Rebuild query string (exclude our internal params)
  const url = new URL(req.url, 'http://localhost');
  url.searchParams.delete('target');
  url.searchParams.delete('path');
  const qs = url.searchParams.toString();
  const fullPath = path + (qs ? `?${qs}` : '');

  // Forward body for POST requests
  let body = '';
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
    });
  }

  // Forward headers (strip host-specific ones)
  const forwardHeaders = {};
  const skipHeaders = ['host', 'connection', 'transfer-encoding'];
  for (const [key, value] of Object.entries(req.headers)) {
    if (!skipHeaders.includes(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  }
  forwardHeaders['host'] = hostname;

  const options = {
    hostname,
    port: 443,
    path: fullPath,
    method: req.method,
    headers: {
      ...forwardHeaders,
      ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
    },
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode || 200);

      const skipRes = ['transfer-encoding', 'connection'];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!skipRes.includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }

      let responseData = '';
      proxyRes.on('data', chunk => { responseData += chunk; });
      proxyRes.on('end', () => {
        res.end(responseData);
        resolve();
      });
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ error: err.message });
      resolve();
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
};
