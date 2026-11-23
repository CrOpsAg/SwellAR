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
// 9. spectral partitioning
// (a) real CDIP MOP spectrum captured at Ventura: one broad swell, so it must NOT be split into noise peaks; Hs must match the model's 0.744 m
const rf=[0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.075,0.0813,0.09,0.1,0.11,0.1225,0.14,0.16,0.18,0.2075,0.25,0.3125,0.4];
const rE=[0.0024,0.0076,0.0296,0.1344,0.3838,0.3746,0.3444,0.3886,0.2821,0.3046,0.2894,0.292,0.1631,0.1245,0.1112,0.0887,0.0617,0.0512,0.0193,0.0037];
const rD=[218,219,218,211,210,216,217,218,221,226,230,233,236,239,243,247,254,259,257,247];
const rbw=[0.005,0.005,0.005,0.005,0.005,0.005,0.005,0.00565,0.00815,0.009,0.01,0.01,0.015,0.0175,0.02,0.0275,0.0425,0.0625,0.0625,0.0875];
let pr = C.partitionSpectrum(rf, rE, rD, rbw);
assert.strictEqual(pr.length, 1, 'broad spectrum stays one system'); close(pr[0].Hs, 0.744, 0.02, 'real-spectrum Hs');
pr = C.applyOfficial(pr, 11.1, 229.8); close(pr[0].Tp, 11.1, 1e-9, 'official Tp kept'); close(pr[0].Dp, 229.8, 1e-9, 'official Dp kept');
// (b) synthetic: strong 16 s from 200 deg and weaker 8 s from 270 deg with a deep valley -> two systems, ordered by height, right directions
const sf=[0.05,0.0625,0.075,0.0875,0.1,0.1125,0.125,0.1375,0.15], sE=[0.2,1.0,0.3,0.05,0.04,0.3,0.6,0.2,0.05], sD=[200,200,205,230,260,270,270,272,275];
const sp2 = C.partitionSpectrum(sf, sE, sD);
assert.strictEqual(sp2.length, 2, 'two systems'); assert(sp2[0].Hs > sp2[1].Hs, 'sorted by height');
close(sp2[0].Tp, 16, 1e-9, 'primary Tp'); close(sp2[0].Dp, 200, 6, 'primary dir'); close(sp2[1].Tp, 8, 1e-9, 'secondary Tp'); close(sp2[1].Dp, 270, 4, 'secondary dir');
// energy conservation: partition m0 adds up to total spectrum m0 when nothing is filtered
const all = C.partitionSpectrum(sf, sE, sD, undefined, { minHs: 0, minFrac: 0 }), bws = C.bandwidths(sf);
close(all.reduce((a, p) => a + p.m0, 0), sE.reduce((a, e, j) => a + e * bws[j], 0), 1e-9, 'partitions conserve energy');
// (c) tiny partitions are dropped, max 3 returned
assert(C.partitionSpectrum(sf, [0,0,0,0,0,0,0,0,0], sD).length === 0, 'empty spectrum -> none');
// (d) NDBC alignment
const al = C.alignSpectra({ pairs: [{v:0.1,f:0.05},{v:0.5,f:0.06},{v:0.2,f:0.07},{v:0.1,f:0.08}] }, { pairs: [{v:200,f:0.05},{v:201,f:0.06},{v:202,f:0.07},{v:203,f:0.08}] });
assert.deepStrictEqual(al.D, [200,201,202,203]);
// 10. measuring: foam score, period estimator, ground inversion, tap-to-sync
// (a) foam score: 25% of pixels white foam on blue water -> ~0.25; plain water -> ~0
const px = (r, g, b) => [r, g, b, 255]; const patch = []; for (let i = 0; i < 400; i++) patch.push(...(i < 100 ? px(235, 240, 245) : px(20, 90, 120)));
close(C.foamScore(Uint8ClampedArray.from(patch)).foam, 0.25, 0.01, 'foam fraction'); close(C.foamScore(Uint8ClampedArray.from(Array(400).fill(0).flatMap(() => px(20, 90, 120)))).foam, 0, 1e-9, 'no foam');
// (b) period estimator on jittered synthetic breakers (seeded), with irregular timestamps
let sd = 7; const rn = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; const gs = () => Math.sqrt(-2 * Math.log(rn() + 1e-12)) * Math.cos(2 * Math.PI * rn());
const T0 = 12.5, ev = []; for (let t = 3; t < 190; t += T0 * (1 + 0.3 * (rn() - 0.5))) ev.push([t, 0.6 + rn()]);
const tts = [], tv = []; for (let t = 0; t < 180; t += 0.2 + 0.05 * rn()) { tts.push(t); tv.push(ev.reduce((a, [e, am]) => a + am * Math.exp(-((t - e) ** 2) / (2 * 1.3 ** 2)), 0) + 0.4 * gs()); }
const pe = C.periodFromSeries(tts, tv); close(pe.T, T0, 1.0, 'estimated period'); assert.strictEqual(C.periodConfidence(pe.prominence), 'clear', 'real rhythm is clear: ' + pe.prominence);
assert(pe.nWaves >= 8 && pe.nWaves <= 18, 'waves counted: ' + pe.nWaves); assert(pe.sigma > 0.5 && pe.sigma < 1.5, 'sigma ~ T^2/dur');
const nz = C.periodFromSeries(tts, tts.map(() => gs())); assert(C.periodConfidence(nz.prominence) !== 'clear', 'pure noise must not be "clear": ' + nz.prominence);
assert.strictEqual(C.periodFromSeries([0, 1, 2], [1, 2, 3]), null, 'too short -> null');
// (c) ground-point inversion round trip through project()
const gp = C.poseFromHeadingPitch(40, -6), gW = 1000, gH = 500, gf = (gW / 2) / Math.tan(32.5 * Math.PI / 180);
const P = [30, 55, -3], pj = C.project(P, gp, gW, gH, gf), back = C.groundFromPixel(pj[0], pj[1], gp, gW, gH, gf, 3);
close(back[0], 30, 1e-6, 'ground E'); close(back[1], 55, 1e-6, 'ground N'); assert.strictEqual(C.groundFromPixel(500, 100, C.poseFromHeadingPitch(0, 5), gW, gH, gf, 3), null, 'sky pixel -> null');
// (d) tap-to-sync: taps at the moments a crest reaches sG must reproduce the drawing phase
const vs = 2.1, Tp = 11, Ls = vs * Tp, sG = 47.3, tau0 = 4.4, taps = [0, 1, 2, 3, 5].map(m => tau0 + sG / vs + m * Tp + 0.05 * (m % 2 ? 1 : -1));
const ph = C.phaseOffset(taps, sG, vs, Tp); const dm = (a, b, m) => Math.abs(((a - b + m / 2) % m + m) % m - m / 2);
close(dm(ph.tau, tau0, Tp), 0, 0.1, 'recovered tau'); assert(ph.R > 0.99, 'consistent taps -> R ~ 1');
const crestAtTap = ((vs * (taps[2] - ph.tau)) % Ls + Ls) % Ls; close(dm(crestAtTap, sG, Ls), 0, 0.3, 'drawn crest sits at the marked spot at tap time');
assert(C.phaseOffset([0.0, 2.8, 5.5, 8.3], 0, 1, 11).R < 0.6, 'scattered taps -> low R');
console.log('all tests passed');
