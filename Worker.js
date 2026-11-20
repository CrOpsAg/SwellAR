// Cloudflare Worker: tiny CORS proxy for NDBC realtime files (free tier is plenty).
// Deploy, then paste  https://<your-worker>.workers.dev/?u=  into SwellAR → Settings → CORS proxy URL.
export default {
  async fetch(req) {
    const target = new URL(req.url).searchParams.get('u') || '';
    let url;
    try { url = new URL(target); } catch { return new Response('bad url', { status: 400 }); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.ndbc.noaa.gov' ||
        !/^\/(data\/realtime2\/[A-Za-z0-9]+\.(spec|data_spec|swdir|txt)|activestations\.xml)$/.test(url.pathname))
      return new Response('forbidden', { status: 403 });
    const r = await fetch(url, { headers: { 'User-Agent': 'SwellAR/1.0' }, cf: { cacheTtl: 300, cacheEverything: true } });
    return new Response(r.body, { status: r.status, headers: {
      'Content-Type': r.headers.get('Content-Type') || 'text/plain',
      'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' } });
  }
};
