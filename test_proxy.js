// Test the cdn-proxy endpoint directly
const mpdUrl = 'https://sacdn.hakunaymatata.com/dash/8772972936765623664_1_1_10800_h265_841/index.mpd';
const encodedUrl = encodeURIComponent(mpdUrl);
const proxyUrl = `http://localhost:5176/cdn-proxy?url=${encodedUrl}&rewrite=1`;

console.log('Testing proxy URL:', proxyUrl.substring(0, 100));

fetch(proxyUrl)
  .then(r => {
    console.log('Status:', r.status);
    console.log('Content-Type:', r.headers.get('content-type'));
    return r.text();
  })
  .then(text => {
    console.log('Response length:', text.length);
    console.log('First 500 chars:', text.substring(0, 500));
    // Check if URLs were rewritten
    const hasProxyUrls = text.includes('/cdn-proxy');
    const hasCdnUrls = text.includes('hakunaymatata.com');
    console.log('Has /cdn-proxy URLs:', hasProxyUrls);
    console.log('Has raw CDN URLs:', hasCdnUrls);
  })
  .catch(e => console.error('Error:', e.message));
