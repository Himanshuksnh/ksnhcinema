// Vercel Serverless Function — /api/proxy
// All /api/* requests are rewritten here via vercel.json
import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // vercel.json rewrites /api/X?Y → /api/proxy?__path=/X&Y
  const url = new URL(req.url, 'https://placeholder.com');
  const targetPath = url.searchParams.get('__path') || '/';
  
  // Preserve exact original query string (URLSearchParams.toString() breaks signatures by re-encoding)
  const rawQs = req.url.split('?')[1] || '';
  let finalQs = rawQs.replace(/(^|&)__path=[^&]*/g, '');
  // Vercel :path* rewrite also injects a `path=...` parameter. We must remove it so the signature matches!
  finalQs = finalQs.replace(/(^|&)path=[^&]*/g, '').replace(/^&/, '');
  const fullPath = targetPath + (finalQs ? '?' + finalQs : '');

  // Read POST body
  let body = '';
  if (req.method === 'POST') {
    if (req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } else {
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      });
    }
  }

  // Forward original headers — auth signature headers must pass through
  const skipHeaders = ['host', 'connection', 'transfer-encoding', 'origin', 'referer', 'user-agent'];
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lowerK = k.toLowerCase();
    if (skipHeaders.includes(lowerK) || lowerK.startsWith('x-vercel-') || lowerK.startsWith('x-forwarded-') || lowerK === 'x-real-ip' || lowerK === 'forwarded') {
      continue;
    }
    forwardHeaders[k] = v;
  }
  forwardHeaders['host'] = 'gapi.inmoviebox.com';
  forwardHeaders['origin'] = 'https://gapi.inmoviebox.com';
  forwardHeaders['referer'] = 'https://gapi.inmoviebox.com/';
  forwardHeaders['user-agent'] = 'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)';
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
      if (proxyRes.statusCode === 407) {
        delete outHeaders['content-length'];
      }
      res.writeHead(proxyRes.statusCode || 200, outHeaders);

      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => { 
        if (proxyRes.statusCode === 407) {
          const debugInfo = {
            reqUrl: req.url,
            rawQs,
            finalQs,
            fullPath,
            forwardHeaders,
            method: req.method,
            body: body,
            response: Buffer.concat(chunks).toString()
          };
          res.end(JSON.stringify(debugInfo, null, 2));
        } else {
          res.end(Buffer.concat(chunks)); 
        }
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
}

export const config = {
  api: {
    bodyParser: false,
  },
};
