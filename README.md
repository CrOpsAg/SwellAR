# SwellAR
Swell super-imposition app: point a phone camera at the surf and see pulses showing which way the swell is travelling,
using nearby buoy data, GPS position and compass heading.

## Run
Host `index.html` over HTTPS (GitHub Pages works). Camera and motion sensors require a secure page.

## Wave sources
- **CDIP MOP** nearshore wave model (default, no setup): buoy-driven hourly nowcast at the nearest point along the coast
  (~100 m spacing, ~10 m depth), including the shore-normal direction. Covers SoCal; NorCal uses the same feed format.
- **NDBC** nearest buoy with fresh wave data (needs the CORS proxy below, as NOAA doesn't allow browser requests)
- **Open-Meteo** global wave model fallback, or manual values

To enable NDBC buoys, deploy `worker.js` as a Cloudflare Worker and paste its URL (ending in `?u=`) into Settings → CORS proxy URL.

## Tests
`node tests/test_core.js index.html` checks the projection geometry, wave physics and the NDBC/CDIP parsers.
