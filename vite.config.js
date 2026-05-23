import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import http from 'http';

// Persistent keep-alive agents — reuse TCP connections across segments
// This eliminates the per-segment TCP handshake overhead that causes buffering stutters
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 16,        // allow 16 parallel connections per host
  maxFreeSockets: 8,
  timeout: 30000,
});
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 16,
  maxFreeSockets: 8,
  timeout: 30000,
});

// CDN Proxy middleware
// Routes CDN requests server-side so we can inject Cookie header.
// Browser cannot set Cookie on cross-origin <video src> or XHR.
function streamProxyMiddleware() {
  return {
    name: 'stream-proxy',
    configureServer(server) {
      server.middlewares.use('/cdn-proxy', (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Max-Age': '86400',
          });
          res.end();
          return;
        }

        const reqUrl = new URL(req.url, 'http://localhost');
        const rawUrl = reqUrl.searchParams.get('url');
        const cookie = reqUrl.searchParams.get('cookie') || '';

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
          res.end('Invalid url param: ' + e.message);
          return;
        }

        const isHttps = targetUrl.protocol === 'https:';
        const lib = isHttps ? https : http;
        const agent = isHttps ? httpsAgent : httpAgent;

        const options = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: req.method || 'GET',
          agent,                  // reuse TCP connections — no more per-segment handshakes
          timeout: 20000,         // 20s timeout — fail fast instead of hanging
          headers: {
            'User-Agent': 'com.community.oneroom/50020080 (Linux; U; Android 15; en_US; V2311)',
            'Referer': 'https://gapi.inmoviebox.com/',
            'Origin': 'https://gapi.inmoviebox.com',
            'Connection': 'keep-alive',
            ...(cookie ? { 'Cookie': decodeURIComponent(cookie) } : {}),
            // Forward Range header — critical for video seeking and partial content
            ...(req.headers['range'] ? { 'Range': req.headers['range'] } : {}),
          },
        };

        const proxyReq = lib.request(options, (proxyRes) => {
          const statusCode = proxyRes.statusCode || 200;

          const responseHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
          };

          // Forward all relevant headers for smooth video playback
          const forwardHeaders = [
            'content-type', 'content-length', 'content-range',
            'accept-ranges', 'cache-control', 'etag', 'last-modified',
          ];
          for (const h of forwardHeaders) {
            if (proxyRes.headers[h]) responseHeaders[h] = proxyRes.headers[h];
          }

          // Always advertise byte-range support so browser can seek without re-downloading
          if (!responseHeaders['accept-ranges']) {
            responseHeaders['accept-ranges'] = 'bytes';
          }

          // Fix content-type for MPD manifests so dash.js recognizes them
          if (targetUrl.pathname.endsWith('.mpd') || targetUrl.pathname.endsWith('.xml')) {
            responseHeaders['content-type'] = 'application/dash+xml';
          }

          res.writeHead(statusCode, responseHeaders);
          proxyRes.pipe(res, { end: true });

          // If client disconnects (e.g. episode switch), abort upstream immediately
          req.on('close', () => {
            if (!proxyRes.destroyed) proxyRes.destroy();
          });
        });

        // Timeout handler — don't let stalled requests block the pipeline
        proxyReq.on('timeout', () => {
          console.warn('[cdn-proxy] Request timed out:', targetUrl.hostname);
          proxyReq.destroy();
          if (!res.headersSent) {
            res.writeHead(504);
            res.end('Proxy timeout');
          }
        });

        proxyReq.on('error', (err) => {
          console.error('[cdn-proxy] Error:', err.message);
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Proxy error: ' + err.message);
          }
        });

        proxyReq.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), streamProxyMiddleware()],
  server: {
    port: 5176,
    proxy: {
      '/api': {
        target: 'https://gapi.inmoviebox.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/apig': {
        target: 'https://apig.inmoviebox.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/apig/, ''),
      },
    },
  },
});
