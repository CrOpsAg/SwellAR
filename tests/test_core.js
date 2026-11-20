// usage: node test_core.js /home/claude/swellar/index.html
const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const m = { exports: {} }; new Function('module', src)(m);
const C = m.exports;
const close = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}`);
const W = 1000, H = 600, fpx = (W/2) / Math.tan(32.5 * Math.PI/180);

// 1. portrait upright facing north (alpha=0,beta=90,gamma=0)
let p = C.poseFromEuler(0, 90, 0, 0, 0);
close(C.headingOf(p.f), 0, 1e-6, 'portrait heading N'); close(C.pitchOf(p.f), 0, 1e-6, 'portrait pitch');
// 2. landscape (angle 90) facing north: alpha=90,beta=0,gamma=-90
p = C.poseFromEuler(90, 0, -90, 90, 0);
close(C.headingOf(p.f), 0, 1e-6, 'landscape heading N'); close(p.u[2], 1, 1e-6, 'landscape up is up');
// landscape angle 270 mirror: device rotated the other way, facing north: alpha=270,beta=0,gamma=90
p = C.poseFromEuler(270, 0, 90, 270, 0);
close(C.headingOf(p.f), 0, 1e-6, 'landscape270 heading N'); close(p.u[2], 1, 1e-6, 'landscape270 up is up');
// yaw correction: +90 turns heading to east
p = C.poseFromEuler(90, 0, -90, 90, 90); close(C.headingOf(p.f), 90, 1e-6, 'yaw +90 -> E');

// 3. projection: ground point 50 m north, camera 2 m up, facing north -> centred horizontally, below horizon
p = C.poseFromHeadingPitch(0, 0);
let s = C.project([0, 50, -2], p, W, H, fpx);
close(s[0], W/2, 1e-6, 'centre x'); close(s[1], H/2 + fpx*2/50, 1e-6, 'y below horizon');
// a point 50 m east is to the right of centre; behind camera is null
assert(C.project([50, 50, -2], p, W, H, fpx)[0] > W/2, 'east is right');
assert(C.project([0, -50, -2], p, W, H, fpx) === null, 'behind camera is culled');
// 45° right edge sanity: point at heading 32.5° lands on right edge
s = C.project([Math.sin(32.5*Math.PI/180)*100, Math.cos(32.5*Math.PI/180)*100, 0], p, W, H, fpx); close(s[0], W, 1e-6, 'FOV edge');

// 4. swell geometry: swell FROM north, facing north -> crests are horizontal lines (constant y), travelling toward camera
const th = (0 + 180) * Math.PI/180, pv = [Math.sin(th), Math.cos(th)], qv = [Math.cos(th), -Math.sin(th)];
const crest = [-20, 0, 20].map(u => C.project([60*pv[0]*-1*-1 + u*qv[0], 60*pv[1]*-1*-1 + u*qv[1], -2], p, W, H, fpx));
// s=-60 means 60 m on the side opposite travel => ahead of the camera for swell from the north
const crestAhead = [-20, 0, 20].map(u => C.project([-60*pv[0] + u*qv[0], -60*pv[1] + u*qv[1], -2], p, W, H, fpx));
close(crestAhead[0][1], crestAhead[1][1], 1e-6, 'crest horizontal (y const)'); close(crestAhead[1][1], crestAhead[2][1], 1e-6, 'crest horizontal 2');
// swell from east, facing north -> crests run north-south, so they converge to a vanishing point at screen centre-x
const th2 = (90 + 180) * Math.PI/180, p2 = [Math.sin(th2), Math.cos(th2)], q2 = [Math.cos(th2), -Math.sin(th2)];
close(Math.hypot(p2[0] - -1, p2[1]), 0, 1e-9, 'swell from E travels west');
close(Math.hypot(q2[0], q2[1] - 1), 0, 1e-9, 'crest direction is N-S');
const far = C.project([30*p2[0] + 4000*q2[0], 30*p2[1] + 4000*q2[1], -2], p, W, H, fpx);
close(far[0], W/2 + fpx * (30*-1*0 + 0) , 3 * 1 + 0.2 * W, 'far end of N-S crest near centre-x'); // within ~20% of width for 4 km

// 5. physics: deep vs shallow, Snell
const deep = C.waveProps(14, 1000), shal = C.waveProps(14, 4);
close(deep.c, 9.80665 * 14 / (2*Math.PI), 0.05, 'deep-water phase speed'); close(deep.cg / deep.c, 0.5, 0.01, 'deep cg = c/2');
close(shal.c, Math.sqrt(9.80665 * 4), 0.6, 'shallow c ~ sqrt(gh)'); close(shal.cg / shal.c, 1, 0.03, 'shallow cg ~ c');
// swell from 270 (W), beach faces 225 (SW seaward): angle to normal = 45° -> must bend toward shore-normal
const r = C.refract(270, 225, 14, 4, 300);
assert(Math.abs(C.angdiff(r, 225)) < 45 * 0.4 && Math.abs(C.angdiff(r, 225)) > 0, 'refraction bends toward seaward normal: ' + r);
close(C.refract(270, null, 14, 4, 300), 270, 0, 'no seaward => unchanged');
close(C.refract(30, 225, 14, 4, 300), 30, 0, 'from land side => unchanged');
console.log('refraction 270° @ 14 s, beach seaward 225°, depth 4 m ->', r.toFixed(1) + '°');

// 6. NDBC parsing
const spec = `#YY  MM DD hh mm WVHT  SwH  SwP  WWH  WWP SwD WWD  STEEPNESS  APD MWD
#yr  mo dy hr mn    m    m  sec    m  sec  -  degT     -      sec degT
2026 11 20 17 40  1.5  1.4 14.3  0.3  5.0 WNW  W  AVERAGE   9.1 285
2026 11 20 17 10  1.6  1.5 14.3  0.3  5.0 WNW  W  AVERAGE   9.1 284`;
const sp = C.parseSpec(spec); close(sp.SwH, 1.4, 0, 'SwH'); close(sp.SwP, 14.3, 0, 'SwP'); close(sp.SwD, 292.5, 0, 'WNW'); close(sp.MWD, 285, 0, 'MWD');
assert(C.parseSpec(`#x\n2026 11 20 17 40 MM MM MM MM MM MM MM MM MM MM`).SwH === null, 'MM -> null');
const ds = `#YY  MM DD hh mm  Sep_Freq  spec_1 (freq_1) spec_2 (freq_2)
2026 11 20 17 40 0.150 0.000 (0.0325) 0.100 (0.0700) 2.500 (0.0700) 5.200 (0.0750) 1.100 (0.0800) 0.900 (0.2000) 9.000 (0.2500)`;
const sw = `#YY  MM DD hh mm  alpha1_1 (freq_1) ...
2026 11 20 17 40 270.0 (0.0325) 280.0 (0.0700) 281.0 (0.0700) 284.0 (0.0750) 290.0 (0.0800) 250.0 (0.2000) 240.0 (0.2500)`;
const pk = C.peakFromSpectra(C.parseDataSpec(ds), C.parseSwdir(sw));
close(pk.T, 1/0.075, 1e-9, 'peak period'); close(pk.from, 284, 0, 'peak direction (swell band only, ignores wind-sea peak)');
// 7. CDIP NCSS CSV parsing (fill values skipped, newest valid row wins, quoted headers ok)
const csv = `time,latitude[unit="degrees_north"],longitude[unit="degrees_east"],waveHs[unit="meter"],waveTp[unit="second"],waveDp[unit="degree"]
2026-11-20T19:00:00Z,34.25,-119.31,0.9,13.3,268.0
2026-11-20T19:30:00Z,34.25,-119.31,1.1,14.3,271.5
2026-11-20T20:00:00Z,34.25,-119.31,-999.99,-999.99,-999.99`;
const cr = C.parseNcssCsv(csv); close(cr.Hs, 1.1, 0, 'cdip Hs'); close(cr.Tp, 14.3, 0, 'cdip Tp'); close(cr.Dp, 271.5, 0, 'cdip Dp');
assert(C.parseNcssCsv('time,foo\n1,2') === null, 'missing cols -> null'); assert(C.parseNcssCsv('') === null, 'empty -> null');
// 8. OPeNDAP ascii parsing, using a real response captured from CDIP's MOP aggregate
const dap = `Dataset {\n    Int32 waveTime[waveTime = 12];\n} x;\n---------------------------------------------\nwaveTime[12]\n1795161600, 1795165200, 1795201200\n\nwaveFlagPrimary[12][1]\n[0], 1\n[1], 1\n[2], 0\n\nwaveHs[12][1]\n[0], 1.0125906\n[1], 0.87462115\n[2], 0.9020019\n\nwaveDp[12][1]\n[0], 229.60316\n[1], 230.39764\n[2], 229.81407\n\n`;
assert.deepStrictEqual(C.parseDapArray(dap, 'waveTime'), [1795161600, 1795165200, 1795201200]);
assert.deepStrictEqual(C.parseDapArray(dap, 'waveFlagPrimary'), [1, 1, 0]);
close(C.parseDapArray(dap, 'waveHs')[2], 0.9020019, 1e-9, 'grid row value'); assert.strictEqual(C.parseDapArray(dap, 'nope').length, 0);
const tbl = `Dataset {\n    Float32 metaLatitude[siteCount = 3];\n} x;\n---\nmetaLatitude[3]\n34.0, 34.26732, 34.5\n\nmetaLongitude[3]\n-119.0, -119.29997, -119.5\n\n`;
const la = C.parseDapArray(tbl, 'metaLatitude'), lo = C.parseDapArray(tbl, 'metaLongitude');
const ni = C.nearestIndex(la, lo, 34.27, -119.30); assert.strictEqual(ni.i, 1); assert(ni.km < 1, 'nearest point < 1 km');
assert(C.nearestIndex(la, lo, 40, -100).km > 100, 'far away is far');
console.log('all tests passed');
