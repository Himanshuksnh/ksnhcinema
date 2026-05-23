import { fetchTabData } from './src/api/gapi.js';

async function run() {
  console.log("Testing Vercel API...");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    let fullUrl = url;
    if (url.startsWith('/api')) {
      fullUrl = `https://ksnhcinema.vercel.app${url}`;
    }
    console.log(`[FETCH] ${options.method} ${fullUrl}`);
    
    const res = await originalFetch(fullUrl, options);
    
    const text = await res.text();
    console.log(`[STATUS] ${res.status}`);
    console.log(`[RESPONSE] ${text.substring(0, 200)}...`);
    return {
      json: async () => JSON.parse(text),
      ok: res.ok,
      status: res.status,
    };
  };

  try {
    const data = await fetchTabData(1);
    console.log("SUCCESS! Got items:", data?.length);
  } catch (e) {
    console.error("ERROR:", e.stack);
  }
}

run();
