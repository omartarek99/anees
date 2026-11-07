// The gradient engine's "Sky" type (SKY), as exported by the tool for the "Blue sky" recipe: render / backgroundCss / backingSize and
// everything they use, verbatim (the engine's minified names; keep the maths as is). Removed: mountGradient, the engine's own host loop
// (components/RankSky.tsx is the host here), and the grain-overlay helpers only it used (kt, ac, sr, rr; the recipe's grain is 0).
// Added: CLOCK_RATE (Tl) and START_T (ae) in the export, so the host keeps the engine's clock.
// @ts-nocheck

function be(e) {
  let t = parseInt(e.slice(1), 16);
  return [(t >> 16) & 255, (t >> 8) & 255, t & 255];
}

function wi(e, t, n) {
  let a = (o) => {
    let s = o / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * a(e) + 0.7152 * a(t) + 0.0722 * a(n);
}

function Me(e) {
  let [t, n, a] = be(e);
  return wi(t, n, a);
}

function tt(e) {
  let t = be(e).map((c) => {
      let d = c / 255;
      return d <= 0.04045 ? d / 12.92 : Math.pow((d + 0.055) / 1.055, 2.4);
    }),
    [n, a, o] = t,
    s = Math.cbrt(0.4122214708 * n + 0.5363325363 * a + 0.0514459929 * o),
    r = Math.cbrt(0.2119034982 * n + 0.6806995451 * a + 0.1073969566 * o),
    i = Math.cbrt(0.0883024619 * n + 0.2817188376 * a + 0.6299787005 * o);
  return [
    0.2104542553 * s + 0.793617785 * r - 0.0040720468 * i,
    1.9779984951 * s - 2.428592205 * r + 0.4505937099 * i,
    0.0259040371 * s + 0.7827717662 * r - 0.808675766 * i,
  ];
}

function Rt(e, t, n) {
  let a = Math.pow(e + 0.3963377774 * t + 0.2158037573 * n, 3),
    o = Math.pow(e - 0.1055613458 * t - 0.0638541728 * n, 3),
    s = Math.pow(e - 0.0894841775 * t - 1.291485548 * n, 3);
  return [
    4.0767416621 * a - 3.3077115913 * o + 0.2309699292 * s,
    -1.2684380046 * a + 2.6097574011 * o - 0.3413193965 * s,
    -0.0041960863 * a - 0.7034186147 * o + 1.707614701 * s,
  ].map((i) => {
    let c =
      i <= 0.0031308 ? i * 12.92 : 1.055 * Math.pow(Math.max(0, i), 0.4166666666666667) - 0.055;
    return Math.min(255, Math.max(0, Math.round(c * 255)));
  });
}

function vs(e) {
  return Array.from({ length: Math.max(0, e - 1) }, (t, n) => (n + 1) / e);
}

function Ut(e, t) {
  if (e <= 1) return [50];
  let a = [0, ...(t && t.length === e - 1 ? t : vs(e)), 1];
  return Array.from({ length: e }, (o, s) => ((a[s] + a[s + 1]) / 2) * 100);
}

function Vt(e, t) {
  return [0, ...(t && t.length === e - 1 ? t : vs(e)), 1];
}

function ft(e, t, n) {
  let a = Math.sin(e * 127.1 + t * 311.7 + n * 74.7) * 43758.5453;
  return a - Math.floor(a);
}

function Y1(e, t, n) {
  let a = Math.floor(e),
    o = Math.floor(t),
    s = e - a,
    r = t - o,
    i = s * s * (3 - 2 * s),
    c = r * r * (3 - 2 * r),
    d = ft(a, o, n),
    l = ft(a + 1, o, n),
    u = ft(a, o + 1, n),
    p = ft(a + 1, o + 1, n);
  return d + (l - d) * i + (u - d) * c + (d - l - u + p) * i * c;
}

function Bt(e, t, n, a) {
  let o = 0,
    s = 0.5,
    r = 1,
    i = 0;
  for (let c = 0; c < a; c++)
    ((o += s * Y1(e * r, t * r, n + c * 31)), (i += s), (s *= 0.5), (r *= 2));
  return o / i;
}

var J1 = 0.1;

var sn = 0.12;

var Do = 0.16;

function Q1(e, t, n, a, o, s = et, r = ae, i = false) {
  let c = a.length,
    d = i ? a.map(be) : a.map(tt),
    l = Vt(c, o),
    u = 0.55 + (1 - (s.scale ?? et.scale) / 100) * 1.9,
    p = 0.1 + ((s.distortion ?? et.distortion) / 100) * 0.42,
    m = (s.swirl ?? et.swirl) / 100,
    f = r * J1,
    b = 2.5 * u,
    h = 0,
    g = 0;
  for (let x = 1; x < c; x++) (Me(a[x]) > Me(a[h]) && (h = x), Me(a[x]) < Me(a[g]) && (g = x));
  let v = i ? be("#FFFFFF") : tt("#FFFFFF"),
    L = v[0] + (d[h][0] - v[0]) * 0.18,
    w = v[1] + (d[h][1] - v[1]) * 0.18,
    I = v[2] + (d[h][2] - v[2]) * 0.18,
    E = L + (d[g][0] - L) * 0.3,
    N = w + (d[g][1] - w) * 0.3,
    M = I + (d[g][2] - I) * 0.3,
    S = yt(e, t, n),
    A = S.data;
  for (let x = 0; x < n; x++) {
    let y = (x + 0.5) / n,
      C = d[0][0],
      F = d[0][1],
      $ = d[0][2];
    for (let O = 1; O < c; O++) {
      let P = Se(l[O] - Do, l[O] + Do, y);
      ((C += (d[O][0] - C) * P), (F += (d[O][1] - F) * P), ($ += (d[O][2] - $) * P));
    }
    let R =
        0.02 + 0.2 * Se(0.15, 0.85, 1 - y) + 0.12 * Math.exp(-((y - 0.34) * (y - 0.34)) / 0.045),
      k = (1 - y) * (1 - y);
    for (let O = 0; O < t; O++) {
      let D = (O + 0.5) / t + f * (0.25 + m * 0.6),
        T = Bt(D * b * 0.7 + f * 0.5, y * b * 0.7, 5, 2),
        B = Bt(D * b * 0.7 - 2.2, y * b * 0.7 + f * 0.35, 17, 2),
        G = D + p * (T - 0.5) * 1.7,
        _ = y + p * (B - 0.5),
        Y =
          Bt(G * b * (1 - m * 0.45), _ * b * (1.7 + m * 0.8), 7, 5) +
          R * 0.62 -
          0.7 -
          0.34 * Se(0.44, 0.66, y),
        Z = Se(-sn, sn, Y),
        Q = Se(sn, sn * 3.2, Y),
        K = Math.min(1, Z + k * 0.12 * (0.35 + 0.65 * T)),
        J = C + (L - C) * K,
        te = F + (w - F) * K,
        H = $ + (I - $) * K,
        j = Q * 0.22 * (0.4 + 0.6 * B);
      ((J += (E - J) * j), (te += (N - te) * j), (H += (M - H) * j));
      let U = i ? [J, te, H] : Rt(J, te, H),
        W = (x * t + O) * 4;
      ((A[W] = U[0]), (A[W + 1] = U[1]), (A[W + 2] = U[2]), (A[W + 3] = 255));
    }
  }
  e.putImageData(S, 0, 0);
}

var Us = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

var el = `precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_main;
uniform vec3 u_low;
uniform vec3 u_mid;
uniform vec3 u_high;
uniform float u_wind;   // wind speed
uniform float u_warp;   // warp power
uniform float u_nscale; // noise scale
uniform sampler2D u_noise;

const float FBM_STRENGTH = 0.912;
const float BLUR_RADIUS = 1.2673;
const float ZOOM = 0.3971;
const float GRAIN_SCALE = 2.5;
const float GRAIN_STRENGTH = 0.014;

vec3 burn(vec3 base, vec3 blend, float op){
  return max(base + blend - vec3(1.0), vec3(0.0))*op + base*(1.0-op);
}
float rand2(vec2 n){ return fract(sin(dot(n, vec2(12.9898, 4.1414)))*43758.5453); }
float noise2(vec2 p){
  vec2 ip = floor(p); vec2 u = fract(p);
  u = u*u*(3.0-2.0*u);
  float m = mix(mix(rand2(ip), rand2(ip+vec2(1.,0.)), u.x), mix(rand2(ip+vec2(0.,1.)), rand2(ip+vec2(1.,1.)), u.x), u.y);
  return m*m;
}
float fbm4(vec2 x){
  float v = 0.0; float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) { v += a*noise2(x); x = rot*x*2.0 + shift; a *= 0.5; }
  return v;
}
vec4 permute4(vec4 x){ return mod((x*34.0 + 1.0)*x, 289.0); }
vec4 tisqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
vec3 fade3(vec3 t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }
float cnoise(vec3 P){
  vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = vec4(Pi0.z); vec4 iz1 = vec4(Pi1.z);
  vec4 ixy = permute4(permute4(ix) + iy);
  vec4 ixy0 = permute4(ixy + iz0); vec4 ixy1 = permute4(ixy + iz1);
  vec4 gx0 = ixy0/7.0; vec4 gy0 = fract(floor(gx0)/7.0) - 0.5; gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0); vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0*(step(vec4(0.0), gx0) - 0.5); gy0 -= sz0*(step(vec4(0.0), gy0) - 0.5);
  vec4 gx1 = ixy1/7.0; vec4 gy1 = fract(floor(gx1)/7.0) - 0.5; gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1); vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1*(step(vec4(0.0), gx1) - 0.5); gy1 -= sz1*(step(vec4(0.0), gy1) - 0.5);
  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x); vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z); vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x); vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z); vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
  vec4 n0 = tisqrt(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
  g000 *= n0.x; g010 *= n0.y; g100 *= n0.z; g110 *= n0.w;
  vec4 n1 = tisqrt(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
  g001 *= n1.x; g011 *= n1.y; g101 *= n1.z; g111 *= n1.w;
  float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
  vec3 fx = fade3(Pf0);
  vec4 nz = mix(vec4(n000,n100,n010,n110), vec4(n001,n101,n011,n111), fx.z);
  vec2 ny = mix(nz.xy, nz.zw, fx.y);
  return 2.2*mix(ny.x, ny.y, fx.x);
}
uniform vec2 u_dirv; // (cos, sin) of the direction quarter-turn
void main(){
  vec2 st = gl_FragCoord.xy/u_res - 0.5;
  st.x *= u_res.x/u_res.y;
  st = mat2(u_dirv.x, u_dirv.y, -u_dirv.y, u_dirv.x)*st;
  float time = u_t*0.85;
  vec2 uv = st*(1.0/(2.0*ZOOM)) + 0.5;
  // gl_FragCoord runs bottom-up, so the source's y flip is already this way up
  float noiseX = cnoise(vec3(uv*u_nscale + vec2(0.0, 74.8572), time*0.3));
  float noiseY = cnoise(vec3(uv*u_nscale + vec2(203.91282, 10.0), time*0.3));
  uv += vec2(noiseX*2.0, noiseY)*u_warp;
  float noiseA = cnoise(vec3(uv*18.0 + vec2(344.91282, 0.0), time*0.3))
               + cnoise(vec3(uv*39.6 + vec2(723.937, 0.0), time*0.4))*0.5;
  uv += noiseA*0.02;
  uv.y -= 0.09;
  float xf = (sin(time) + 1.0)*0.5;
  vec2 texUv = uv*GRAIN_SCALE;
  float d0 = mix(texture2D(u_noise, texUv).r - 0.5, texture2D(u_noise, vec2(texUv.x, 1.0-texUv.y)).g - 0.5, xf)*GRAIN_STRENGTH;
  texUv += vec2(63.861, 368.937);
  float d1 = mix(texture2D(u_noise, texUv).r - 0.5, texture2D(u_noise, vec2(texUv.x, 1.0-texUv.y)).g - 0.5, xf)*GRAIN_STRENGTH;
  texUv += vec2(453.163, 1649.808);
  float d3 = mix(texture2D(u_noise, texUv).r - 0.5, texture2D(u_noise, vec2(texUv.x, 1.0-texUv.y)).g - 0.5, xf)*GRAIN_STRENGTH;
  uv += d0;
  vec2 stF = uv*u_nscale;
  vec2 q = vec2(fbm4(stF*0.5 + u_wind*time));
  vec2 r = vec2(fbm4(stF + q + vec2(0.3, 9.2) + 0.15*time), fbm4(stF + q + vec2(8.3, 0.8) + 0.126*time));
  float fv = fbm4(stF + r - q);
  float full = (fv + 0.6*fv*fv + 0.7*fv + 0.5)*0.5;
  full = pow(full, 0.55)*FBM_STRENGTH;
  float blurR = BLUR_RADIUS*1.5;
  vec2 uvA = uv + vec2((full-0.5)*1.2) + vec2(0.0, 0.025) + d0;
  float snA = noise2(uvA*2.0 + vec2(0.0, time*0.5))*3.0;
  float lA = pow(smoothstep(snA - 1.2*blurR, snA + 1.2*blurR, (uvA.y - 0.5)*5.0 + 0.5), 0.8);
  vec2 uvB = uv + vec2((full-0.5)*0.85) + vec2(0.0, 0.025) + d1;
  float snB = noise2(uvB*4.0 + vec2(293.0, time))*2.8;
  float lB = pow(smoothstep(snB - 0.9*blurR, snB + 0.9*blurR, (uvB.y - 0.6)*5.0 + 0.5), 0.9);
  vec2 uvC = uv + vec2((full-0.5)*1.1) + d3;
  float snC = noise2(uvC*6.0 + vec2(153.0, time*1.2))*2.6;
  float lC = smoothstep(snC - 0.7*blurR, snC + 0.7*blurR, (uvC.y - 0.9)*6.0 + 0.5);
  vec3 col = burn(u_main, u_low, 1.0 - lA);
  col = burn(col, mix(u_main, u_mid, 1.0 - lB), lA);
  col = mix(col, mix(u_main, u_high, 1.0 - lC), lA*lB);
  gl_FragColor = vec4(col, 1.0);
}`;

var St = null;

function tl() {
  if (St === "failed") return null;
  if (St) return St;
  try {
    let e = document.createElement("canvas"),
      t = e.getContext("webgl2") || e.getContext("webgl") || e.getContext("experimental-webgl");
    if (!t) throw new Error("no webgl");
    let n = t.createProgram();
    for (let [r, i] of [
      [t.VERTEX_SHADER, Us],
      [t.FRAGMENT_SHADER, el],
    ]) {
      let c = t.createShader(r);
      (t.shaderSource(c, i), t.compileShader(c), t.attachShader(n, c));
    }
    if (
      (t.bindAttribLocation(n, 0, "p"), t.linkProgram(n), !t.getProgramParameter(n, t.LINK_STATUS))
    )
      throw new Error(t.getProgramInfoLog(n) ?? "link failed");
    (t.useProgram(n),
      t.bindBuffer(t.ARRAY_BUFFER, t.createBuffer()),
      t.bufferData(t.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), t.STATIC_DRAW),
      t.enableVertexAttribArray(0),
      t.vertexAttribPointer(0, 2, t.FLOAT, false, 0, 0));
    let a = t.createTexture();
    (t.activeTexture(t.TEXTURE0), t.bindTexture(t.TEXTURE_2D, a));
    let o = new Uint8Array(256 * 256 * 4);
    for (let r = 0; r < 256 * 256; r++) {
      let i = (Math.random() * 256) | 0;
      ((o[r * 4] = i), (o[r * 4 + 1] = i), (o[r * 4 + 2] = i), (o[r * 4 + 3] = 255));
    }
    (t.texImage2D(t.TEXTURE_2D, 0, t.RGBA, 256, 256, 0, t.RGBA, t.UNSIGNED_BYTE, o),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_S, t.REPEAT),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_T, t.REPEAT),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MIN_FILTER, t.LINEAR),
      t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MAG_FILTER, t.LINEAR),
      t.uniform1i(t.getUniformLocation(n, "u_noise"), 0));
    let s = (r) => t.getUniformLocation(n, r);
    return (
      (St = {
        canvas: e,
        gl: t,
        u: {
          res: s("u_res"),
          t: s("u_t"),
          main: s("u_main"),
          low: s("u_low"),
          mid: s("u_mid"),
          high: s("u_high"),
          wind: s("u_wind"),
          warp: s("u_warp"),
          nscale: s("u_nscale"),
          dirv: s("u_dirv"),
        },
        rampKey: "",
      }),
      St
    );
  } catch (e) {
    return (console.warn("[sky] WebGL unavailable \u2014 CPU fallback:", e), (St = "failed"), null);
  }
}

function nl(e) {
  let t = [...e].sort((o, s) => Me(s) - Me(o)),
    n = t.length,
    a = (o) => be(o).map((s) => s / 255);
  return {
    high: a(t[0]),
    main: a(t[Math.min(1, n - 1)]),
    mid: a(t[Math.min(2, n - 1)]),
    low: a(t[n - 1]),
  };
}

function al(e, t, n, a, o, s, r = ae) {
  let i = s ?? et,
    c = tl();
  if (!c) {
    Q1(e, t, n, a, o, i, r);
    return;
  }
  let { canvas: d, gl: l, u } = c;
  (d.width !== t && (d.width = t), d.height !== n && (d.height = n));
  let p = JSON.stringify(a);
  if (c.rampKey !== p) {
    let f = nl(a);
    (l.uniform3f(u.main, f.main[0], f.main[1], f.main[2]),
      l.uniform3f(u.low, f.low[0], f.low[1], f.low[2]),
      l.uniform3f(u.mid, f.mid[0], f.mid[1], f.mid[2]),
      l.uniform3f(u.high, f.high[0], f.high[1], f.high[2]),
      (c.rampKey = p));
  }
  (l.viewport(0, 0, t, n),
    l.uniform2f(u.res, t, n),
    l.uniform1f(u.t, r),
    l.uniform1f(u.nscale, 0.35 + ((i.scale ?? et.scale) / 100) * 1.15),
    l.uniform1f(u.warp, ((i.distortion ?? et.distortion) / 100) * 0.47),
    l.uniform1f(u.wind, ((i.swirl ?? et.swirl) / 100) * 0.36));
  let m = ((i.dir ?? 0) % 4) * (Math.PI / 2);
  (l.uniform2f(u.dirv, Math.cos(m), Math.sin(m)),
    l.drawArrays(l.TRIANGLES, 0, 3),
    e.drawImage(d, 0, 0, t, n));
}

var ae = 20.75;

var et = { scale: 45, distortion: 50, swirl: 40, dir: 0 };

var _o = new WeakMap();

function yt(e, t, n) {
  let a = _o.get(e);
  return (
    (!a || a.width !== t || a.height !== n) && ((a = e.createImageData(t, n)), _o.set(e, a)),
    a
  );
}

function Se(e, t, n) {
  if (t <= e) return n >= t ? 1 : 0;
  let a = Math.min(1, Math.max(0, (n - e) / (t - e)));
  return a * a * (3 - 2 * a);
}

function Zn(e, t, n, a, o, s, r, i, c = false, d) {
  al(e, t, n, a, s, r, i);
}

var Tl = 1.2;

function or(e, t, n, a, o) {
  let s = Ut(e.length, n),
    r = e.map((i, c) => `${i} ${s[c].toFixed(1)}%`).join(", ");
  return `linear-gradient(180deg in oklab, ${r})`;
}

function render(canvas, recipe, t = recipe.startT ?? ae, interactive = false) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width,
    H = canvas.height,
    stops = recipe.stops;
  Zn(
    ctx,
    W,
    H,
    stops,
    "SKY",
    recipe.divs ?? void 0,
    recipe.params ?? void 0,
    t,
    interactive,
    recipe.mesh,
  );
}

function backgroundCss(recipe) {
  return or(recipe.stops, "SKY", recipe.divs ?? void 0, recipe.mesh, recipe.cube ?? void 0);
}

function backingSize(cssW, cssH, animating = false, recipe = null) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const dw = Math.round(cssW * dpr),
    dh = Math.round(cssH * dpr);
  const fit = (w, h, cap, byLongest) => {
    const k = Math.min(1, cap / Math.max(1, byLongest ? Math.max(w, h) : w));
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  };
  if (animating) {
    return fit(dw, dh, 2560, false);
  }
  return fit(dw, dh, 2560, false);
}

export { render, backgroundCss, backingSize, Tl as CLOCK_RATE, ae as START_T };