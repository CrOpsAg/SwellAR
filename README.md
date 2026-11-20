# SwellAR
Swell super-imposition app: point a phone camera at the surf and see pulses showing which way the swell is travelling,
using nearby buoy data, GPS position and compass heading.

## Run
Host `index.html` over HTTPS (GitHub Pages works). Camera and motion sensors require a secure page.

## Wave sources
- **CDIP** station (default 169, Ventura Nearshore), used automatically when within 30 km
- **NDBC** nearest buoy with fresh wave data
- **Open-Meteo** wave model fallback, or manual values

If the browser blocks data requests (CORS), deploy `worker.js` as a Cloudflare Worker and paste its URL
(ending in `?u=`) into Settings → CORS proxy URL.

## Tests
`node tests/test_core.js index.html` checks the projection geometry, wave physics and the NDBC/CDIP parsers.
