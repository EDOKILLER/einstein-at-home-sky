// CIELO DI EINSTEIN@HOME 1.1 - pagina 3D
// © 2026 Edoardo Battistel
// Sfera celeste di raggio R (coordinate equatoriali J2000): direzione (ra, dec) ->
//   x = -cos(dec) cos(ra), y = sin(dec), z = cos(dec) sin(ra)
// (è la stessa convenzione delle SphereGeometry di Three.js, così le texture equirettangolari
// della Via Lattea e della Terra combaciano). Polo nord celeste verso +Y.
// La Terra sta al centro e gira con il tempo siderale vero; il Sole è dove è oggi.
import * as THREE from "three";
import { OrbitControls } from "../lib/OrbitControls.js";

const $ = (s) => document.querySelector(s);
const R = 100, RT = 14;                       // raggio della sfera celeste e della Terra (scala libera)
const DEG = Math.PI / 180;
const AL_KPC = 3261.56, AL_MPC = 3.26156e6;
const PARAMETRI = new URLSearchParams(location.search);
const TOCCO = matchMedia("(pointer: coarse)").matches;          // telefono o tablet
const PICCOLO = () => innerWidth <= 760 || (TOCCO && innerWidth <= 1100);

// ------------------------------------------------------------------ strati di oggetti
const STRATI = {
  normale: { nome: "Pulsar radio", colore: "#4fe0b0", dim: 6, attivo: true },
  msp: { nome: "Pulsar al millisecondo", colore: "#5ab8ff", dim: 6.5, attivo: true },
  gamma: { nome: "Pulsar gamma (Fermi)", colore: "#ff5fd2", dim: 10, attivo: true, anello: true },
  magnetar: { nome: "Magnetar", colore: "#ff4b4b", dim: 11, attivo: true },
  fermi: { nome: "Sorgenti gamma senza nome", colore: "#9a93b8", dim: 5.5, attivo: false },
  snr: { nome: "Resti di supernova", colore: "#ffa040", dim: 9, attivo: true, anello: true },
  quasar: { nome: "Quasar brillanti", colore: "#b9a2ff", dim: 7, attivo: true },
  onde: { nome: "Onde gravitazionali", colore: "#ff8a6b", dim: 0, attivo: true },
};
// nomi italiani e note per gli oggetti famosi
const FAMOSI = {
  "J0534+2200": ["Pulsar del Granchio", "Nata dalla supernova vista dagli astronomi cinesi nel 1054: gira 30 volte al secondo."],
  "J0835-4510": ["Pulsar delle Vele", "La pulsar radio più brillante del cielo, nel resto di supernova delle Vele. Ogni tanto ha dei «glitch»: accelera di colpo."],
  "J0633+1746": ["Geminga", "Pulsar vicina, quasi muta nella radio ma brillantissima nei raggi gamma."],
  "J1921+2153": ["La prima pulsar", "CP 1919: scoperta nel 1967 da Jocelyn Bell, che all'inizio la chiamò per scherzo «LGM-1» (piccoli omini verdi)."],
  "J1915+1606": ["Pulsar di Hulse e Taylor", "Pulsar in coppia con un'altra stella di neutroni: l'orbita si stringe perché emette onde gravitazionali (Nobel 1993)."],
  "J0737-3039A": ["Doppia pulsar", "L'unico sistema conosciuto con due pulsar che girano una attorno all'altra: un laboratorio per la relatività."],
  "J1748-2446ad": ["La pulsar più veloce", "Gira 716 volte al secondo, nell'ammasso globulare Terzan 5."],
  "J0437-4715": ["Pulsar al millisecondo più vicina", "A circa 510 anni luce: una delle «orologi» più precisi usati per cercare onde gravitazionali lentissime."],
  "J0740+6620": ["La stella di neutroni più pesante", "Circa 2,1 volte la massa del Sole compressa in una sfera di una ventina di km."],
  "J1614-2230": ["Pulsar di Shapiro", "La sua massa (quasi 2 masse solari) è stata misurata col ritardo dei segnali che passano vicino alla compagna."],
  "J2144-3933": ["Pulsar lentissima", "Una delle pulsar radio più lente: un giro ogni 8,5 secondi."],
  "J1808-2024": ["SGR 1806-20", "Magnetar: il 27 dicembre 2004 un suo lampo gamma ha disturbato la ionosfera della Terra da 40.000 anni luce."],
  "J1935+2154": ["SGR 1935+2154", "Magnetar da cui nel 2020 è arrivato un lampo radio veloce (FRB): la prima volta che se ne è vista l'origine."],
  "J0540-6919": ["Pulsar della Grande Nube", "Il «Granchio gemello» nella Grande Nube di Magellano."],
  "J1023+0038": ["Pulsar «trasformista»", "Passa da pulsar radio a sistema che accresce materia dalla compagna, e viceversa."],
};
const SNR_FAMOSI = {
  "G111.7-2.1": "Cassiopea A", "G184.6-5.8": "Nebulosa del Granchio", "G263.9-3.3": "Resto delle Vele",
  "G120.1+1.4": "Supernova di Tycho (1572)", "G4.5+6.8": "Supernova di Keplero (1604)", "G327.6+14.6": "SN 1006",
  "G189.1+3.0": "IC 443 (Medusa)", "G74.0-8.5": "Cygnus Loop (Velo)", "G34.7-0.4": "W44", "G43.3-0.2": "W49B",
  "G266.2-1.2": "Vela Junior", "G1.9+0.3": "Il resto più giovane della Galassia", "G260.4-3.4": "Puppis A",
  "G315.4-2.3": "RCW 86 (SN 185)", "G130.7+3.1": "3C 58 (SN 1181?)",
};
const QSO_FAMOSI = { "3C 273": "Il quasar più brillante del cielo", "3C 279": "Blazar: getto puntato verso di noi" };
// osservatori: [nome, lat, lon, colore, testo]
const OSSERVATORI = [
  ["LIGO Hanford", 46.4552, -119.4077, "#7fd0ff", "Uno dei due rivelatori LIGO negli Stati Uniti (stato di Washington): due bracci di 4 km a L. I suoi dati servono alla ricerca di onde gravitazionali continue di Einstein@Home (compiti O4MD)."],
  ["LIGO Livingston", 30.5629, -90.7742, "#7fd0ff", "Il secondo rivelatore LIGO, in Louisiana, a 3.000 km da Hanford: il segnale arriva ai due con qualche millisecondo di differenza, e così si capisce da dove viene."],
  ["Virgo", 43.6314, 10.5045, "#9cf0a0", "Il rivelatore europeo a Cascina (Pisa), bracci di 3 km. Con tre rivelatori la zona di cielo di un evento diventa molto più piccola."],
  ["KAGRA", 36.4119, 137.3058, "#ffd27f", "Il rivelatore giapponese, sotto la montagna di Kamioka e raffreddato a -253 °C."],
  ["GEO600", 52.2468, 9.8083, "#c9b8ff", "Il rivelatore tedesco-britannico vicino ad Hannover, dove è nato Einstein@Home (Albert Einstein Institute)."],
  ["Arecibo", 18.3442, -66.7528, "#ff9f9f", "Il radiotelescopio da 305 m di Porto Rico, crollato il 1° dicembre 2020. Einstein@Home ha trovato decine di pulsar nei suoi dati (sondaggio PALFA)."],
  ["Parkes (Murriyang)", -32.9983, 148.2636, "#ffb37f", "Il radiotelescopio da 64 m in Australia che ha scoperto più pulsar di tutti. Anche nei suoi dati Einstein@Home ha trovato pulsar nuove."],
];
let D, pulsar = [], fermi = [], snr = [], quasar = [], onde = [], tutti = [];
let selezionato = null, dentro = false, rotazione = true, salvaschermo = false;

// ------------------------------------------------------------------ geometria
function dir(ra, dec, r = 1) {
  const a = ra * DEG, d = dec * DEG;
  return new THREE.Vector3(-Math.cos(d) * Math.cos(a) * r, Math.sin(d) * r, Math.cos(d) * Math.sin(a) * r);
}
const GAL_EQ = [[-0.0548755604, 0.4941094279, -0.8676661490], [-0.8734370902, -0.4448296300, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762]];          // trasposta della matrice equatoriali -> galattiche
function galEq(l, b) {
  const L = l * DEG, B = b * DEG, v = [Math.cos(B) * Math.cos(L), Math.cos(B) * Math.sin(L), Math.sin(B)];
  const x = GAL_EQ[0][0] * v[0] + GAL_EQ[0][1] * v[1] + GAL_EQ[0][2] * v[2];
  const y = GAL_EQ[1][0] * v[0] + GAL_EQ[1][1] * v[1] + GAL_EQ[1][2] * v[2];
  const z = GAL_EQ[2][0] * v[0] + GAL_EQ[2][1] * v[1] + GAL_EQ[2][2] * v[2];
  return [((Math.atan2(y, x) / DEG) + 360) % 360, Math.asin(z) / DEG];
}
function eclEq(lambda) {
  const e = 23.4393 * DEG, L = lambda * DEG;
  return [((Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / DEG) + 360) % 360, Math.asin(Math.sin(e) * Math.sin(L)) / DEG];
}
function giornoGiuliano(t = new Date()) { return t.getTime() / 86400000 + 2440587.5; }
function tempoSiderale(t = new Date()) {       // GMST in gradi
  return ((280.46061837 + 360.98564736629 * (giornoGiuliano(t) - 2451545.0)) % 360 + 360) % 360;
}
function posSole(t = new Date()) {
  const n = giornoGiuliano(t) - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) * DEG;
  return eclEq(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

// ------------------------------------------------------------------ scena
const canvas = $("#scena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scena = new THREE.Scene();
scena.background = new THREE.Color(0x02030a);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
const controlli = new OrbitControls(camera, canvas);
controlli.enableDamping = true;
controlli.dampingFactor = 0.08;
controlli.enablePan = false;
controlli.autoRotate = true;
controlli.autoRotateSpeed = 0.35;
const uComuni = { uDentro: { value: 0 }, uScala: { value: 1 } };
// grandezza dei pallini degli oggetti: scelta col cursore nel pannello e un po' più grandi avvicinandosi
const uGrandezza = { value: 1 }, uZoom = { value: 1 };
let grandezzaScelta = 1.2;
try { grandezzaScelta = parseFloat(localStorage.getItem("cielo_einstein_grandezza")) || 1.2; } catch { /* niente memoria */ }
function dimensiona() {
  renderer.setSize(innerWidth, innerHeight, true);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  uComuni.uScala.value = Math.max(0.7, innerHeight / 950) * Math.min(window.devicePixelRatio, 2);
}

// materiali: punti e linee che si attenuano quando stanno dietro la sfera (vista da fuori)
const VS_FACCIA = `float faccia(vec3 wp) { return uDentro > 0.5 ? 1.0 : (dot(normalize(wp), normalize(cameraPosition)) > 0.0 ? 1.0 : 0.13); }`;
function materialePunti({ anello = false, opacita = 1, morbido = false, oggetti = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uComuni, uOpac: { value: opacita }, uScelto: { value: -1 },
      uGr: oggetti ? uGrandezza : { value: 1 }, uZoom: oggetti ? uZoom : { value: 1 } },
    vertexShader: `attribute vec3 colore; attribute float dim; attribute float vis; attribute float gruppo;
      uniform float uDentro; uniform float uScala; uniform float uScelto; uniform float uGr; uniform float uZoom; varying vec3 vC; varying float vA; ${VS_FACCIA}
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); float s = (uScelto >= 0.0 && abs(gruppo - uScelto) < 0.5) ? 1.0 : 0.0;
        vC = colore; vA = vis * faccia(wp.xyz) * (uScelto >= 0.0 ? (s > 0.5 ? 2.5 : 0.3) : 1.0);
        gl_PointSize = dim * uScala * uGr * uZoom * (s > 0.5 ? 1.8 : 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uOpac; varying vec3 vC; varying float vA;
      void main() { if (vA < 0.01) discard; float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        vec3 c = vC;
        ${anello ? "float a = smoothstep(0.5, 0.45, r) * smoothstep(0.2, 0.27, r); if (r > 0.43 || r < 0.25) c = vC * 0.25;"
          : morbido ? "float a = pow(1.0 - r * 2.0, 1.6);"
          : "float a = smoothstep(0.5, 0.45, r); if (r > 0.37) c = vC * 0.2; else c = mix(vec3(1.0), vC, smoothstep(0.0, 0.18, r));"}
        gl_FragColor = vec4(c, clamp(a * vA * uOpac, 0.0, 1.0)); }`,
    transparent: true, depthWrite: false,
  });
}
function materialeLinee(opacita = 0.5) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uComuni, uOpac: { value: opacita } },
    vertexShader: `attribute vec3 colore; uniform float uDentro; varying vec3 vC; varying float vA; ${VS_FACCIA}
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vC = colore; vA = faccia(wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uOpac; varying vec3 vC; varying float vA; void main() { gl_FragColor = vec4(vC, vA * uOpac); }`,
    transparent: true, depthWrite: false,
  });
}
function nuvola(punti, materiale) {   // punti: [{p: Vector3, c: Color, d: dim, g: gruppo}]
  const n = punti.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const dim = new Float32Array(n), vis = new Float32Array(n).fill(1), gr = new Float32Array(n);
  punti.forEach((q, i) => { pos.set([q.p.x, q.p.y, q.p.z], i * 3); col.set([q.c.r, q.c.g, q.c.b], i * 3); dim[i] = q.d; gr[i] = q.g ?? 0; });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("colore", new THREE.BufferAttribute(col, 3));
  g.setAttribute("dim", new THREE.BufferAttribute(dim, 1));
  g.setAttribute("vis", new THREE.BufferAttribute(vis, 1));
  g.setAttribute("gruppo", new THREE.BufferAttribute(gr, 1));
  const p = new THREE.Points(g, materiale);
  p.frustumCulled = false;
  return p;
}
function segmenti(coppie, colore, opacita) {  // coppie: [[Vector3, Vector3], ...]
  const pos = [], col = [], c = new THREE.Color(colore);
  for (const [a, b] of coppie) { pos.push(a.x, a.y, a.z, b.x, b.y, b.z); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("colore", new THREE.Float32BufferAttribute(col, 3));
  const l = new THREE.LineSegments(g, materialeLinee(opacita));
  l.frustumCulled = false;
  return l;
}
function arco(a, b, r = R) {            // arco di cerchio massimo tra due direzioni (ra, dec), a pezzetti
  const va = dir(a[0], a[1]), vb = dir(b[0], b[1]);
  const ang = va.angleTo(vb), n = Math.max(1, Math.ceil(ang / (2 * DEG))), out = [];
  for (let i = 0; i < n; i++) {
    const p = va.clone().lerp(vb, i / n).normalize().multiplyScalar(r);
    const q = va.clone().lerp(vb, (i + 1) / n).normalize().multiplyScalar(r);
    out.push([p, q]);
  }
  return out;
}
function cerchio(fz, n = 360, r = R) {    // fz(t in gradi) -> [ra, dec]
  const out = [];
  for (let i = 0; i < n; i++) out.push([dir(...fz(i * 360 / n), r), dir(...fz((i + 1) * 360 / n), r)]);
  return out;
}

// colore di una stella dall'indice B-V
function coloreBV(bv) {
  const t = Math.max(-0.4, Math.min(2, bv));
  const k = [[-0.4, [0.61, 0.69, 1]], [0, [0.85, 0.9, 1]], [0.4, [1, 0.98, 0.94]], [0.8, [1, 0.9, 0.72]], [1.4, [1, 0.75, 0.5]], [2, [1, 0.6, 0.4]]];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
    const f = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
    return new THREE.Color(...k[i - 1][1].map((v, j) => v + f * (k[i][1][j] - v)));
  }
  return new THREE.Color(1, 0.6, 0.4);
}

// ------------------------------------------------------------------ texture equirettangolari (Via Lattea, Terra)
// i poligoni (lon/lat in gradi) si disegnano su un canvas largo 360° e alto 180°: x = lon, y = 90 - lat
function disegnaPoligono(cx, anello, W, H, conPolo = true) {
  if (anello.length < 3) return;
  const lon = [anello[0][0]];
  for (let i = 1; i < anello.length; i++) {        // longitudini «srotolate» (senza salti di 360°)
    let d = anello[i][0] - anello[i - 1][0];
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    lon.push(lon[i - 1] + d);
  }
  const polare = conPolo && Math.abs(lon[lon.length - 1] - lon[0]) > 300;    // gira attorno al polo (Antartide)
  const sud = anello.reduce((s, p) => s + p[1], 0) < 0;
  for (const sposta of [-360, 0, 360]) {
    cx.beginPath();
    anello.forEach((p, i) => {
      const x = ((lon[i] + sposta) / 360) * W, y = (90 - p[1]) / 180 * H;
      if (i) cx.lineTo(x, y); else cx.moveTo(x, y);
    });
    if (polare) {
      const ultimo = lon[lon.length - 1] + sposta, primo = lon[0] + sposta, yp = sud ? H : 0;
      cx.lineTo((ultimo / 360) * W, yp); cx.lineTo((primo / 360) * W, yp);
    }
    cx.closePath();
    cx.fill();
  }
}
function textureViaLattea() {
  const W = TOCCO ? 2048 : 4096, H = W / 2, cv = document.createElement("canvas");   // più leggera sul telefono
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");
  cx.globalCompositeOperation = "lighter";
  cx.filter = `blur(${W / 680}px)`;
  for (const liv of [...D.via_lattea].sort((a, b) => a.livello - b.livello)) {
    cx.fillStyle = `rgba(150, 170, 230, ${0.055 + 0.01 * liv.livello})`;
    for (const pol of liv.poligoni) {
      // in d3-celestial la longitudine è l'ascensione retta (−180…180): sulla texture u = ra/360
      for (const anello of pol.slice(0, 1)) disegnaPoligono(cx, anello.map(([a, b]) => [(a + 360) % 360, b]), W, H, false);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function textureTerra() {
  const W = 2048, H = 1024, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");
  const gr = cx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#0d2c4a"); gr.addColorStop(0.5, "#123a63"); gr.addColorStop(1, "#0d2c4a");
  cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
  cx.fillStyle = "#3f6b45";
  for (const anello of D.terra || []) disegnaPoligono(cx, anello.map(([a, b]) => [(a + 360) % 360, b]), W, H, true);
  cx.strokeStyle = "rgba(160, 200, 255, 0.18)"; cx.lineWidth = 1.2;
  for (let lon = 0; lon < 360; lon += 30) { cx.beginPath(); cx.moveTo(lon / 360 * W, 0); cx.lineTo(lon / 360 * W, H); cx.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { cx.beginPath(); cx.moveTo(0, (90 - lat) / 180 * H); cx.lineTo(W, (90 - lat) / 180 * H); cx.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ costruzione del cielo
const gruppiSfondo = {};
let puntiStrati = {}, puntiOnde = null, terra = null, lucesole = null, fermiSat = null, orbitaFermi = null;
let vialatteaMesh = null, fasci = null;
const SOLE = { tipoO: "sole", nome: "Sole", strato: "speciale", colore: "#ffd36b", imp: 60 };
const etichetteCost = [];

function creaSfondo() {
  // stelle
  const st = D.stelle.map((s) => ({ p: dir(s[0], s[1], R * 1.002), c: coloreBV(s[3]), d: Math.max(1.2, Math.min(8, (6.2 - s[2]) * 1.15)) }));
  gruppiSfondo.stelle = nuvola(st, materialePunti({ morbido: true, opacita: 1, oggetti: false }));
  // costellazioni
  const cop = [];
  for (const c of D.costellazioni) for (const l of c.linee) for (let i = 1; i < l.length; i++) cop.push(...arco(l[i - 1], l[i], R * 0.999));
  gruppiSfondo.cost = segmenti(cop, "#5b78b8", 0.45);
  for (const c of D.costellazioni) {
    const el = document.createElement("div");
    el.className = "cost"; el.textContent = c.nome;
    $("#pin").appendChild(el);
    etichetteCost.push({ el, p: dir(c.ra, c.dec, R), rank: c.rank });
  }
  // griglia equatoriale, equatore ed eclittica
  const gr = [];
  for (let h = 0; h < 24; h += 2) for (let d = -80; d < 80; d += 4) gr.push([dir(h * 15, d, R), dir(h * 15, d + 4, R)]);
  for (const d of [-60, -30, 30, 60]) gr.push(...cerchio((t) => [t, d], 180));
  const g = new THREE.Group();
  g.add(segmenti(gr, "#26375c", 0.35));
  g.add(segmenti(cerchio((t) => [t, 0]), "#3d5a95", 0.6));
  g.add(segmenti(cerchio((t) => eclEq(t)), "#b89a3c", 0.6));
  gruppiSfondo.griglia = g;
  // Via Lattea: texture sulla sfera + piano galattico
  const vl = new THREE.Group();
  if (D.via_lattea && D.via_lattea.length) {
    vialatteaMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 128, 64),
      new THREE.MeshBasicMaterial({ map: textureViaLattea(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.FrontSide, opacity: 0.9 }));
    vl.add(vialatteaMesh);
  }
  vl.add(segmenti(cerchio((t) => galEq(t, 0)), "#a070d0", 0.45));
  gruppiSfondo.vialattea = vl;
  // etichette fisse: centro galattico, poli
  for (const g2 of Object.values(gruppiSfondo)) scena.add(g2);
}

function creaTerra() {
  const g = new THREE.Group();
  terra = new THREE.Mesh(new THREE.SphereGeometry(RT, 96, 48),
    new THREE.MeshPhongMaterial({ map: textureTerra(), shininess: 12, specular: new THREE.Color(0x223344) }));
  g.add(terra);
  // atmosfera
  g.add(new THREE.Mesh(new THREE.SphereGeometry(RT * 1.04, 64, 32), new THREE.MeshBasicMaterial({
    color: 0x5aa8ff, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false })));
  // asse polare
  g.add(segmenti([[new THREE.Vector3(0, -RT * 1.5, 0), new THREE.Vector3(0, RT * 1.5, 0)]], "#8899bb", 0.5));
  // osservatori (figli della Terra: girano con lei) e fasci verso lo zenit
  const coppie = [];
  for (const [nome, lat, lon, col, testo] of OSSERVATORI) {
    const p = dir(lon, lat, RT * 1.005);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ color: col }));
    m.position.copy(p);
    terra.add(m);
    const o = { tipoO: "osservatorio", nome, lat, lon, colore: col, testo, oggetto3d: m, strato: "speciale", imp: 40 };
    tutti.push(o);
    if (!nome.startsWith("Arecibo")) coppie.push([p.clone(), dir(lon, lat, R * 0.98)]);
  }
  fasci = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(coppie.flat()),
    new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.22, depthWrite: false }));
  terra.add(fasci);
  // Fermi: orbita inclinata di 25,6° (posizione indicativa, un giro ogni 95,7 minuti)
  orbitaFermi = new THREE.Group();
  orbitaFermi.rotation.x = 25.6 * DEG;
  const ro = RT * 1.35, pts = [];
  for (let i = 0; i <= 128; i++) pts.push(new THREE.Vector3(ro * Math.cos(i / 128 * 2 * Math.PI), 0, ro * Math.sin(i / 128 * 2 * Math.PI)));
  orbitaFermi.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.35 })));
  fermiSat = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
  orbitaFermi.add(fermiSat);
  g.add(orbitaFermi);
  tutti.push({ tipoO: "osservatorio", nome: "Fermi", colore: "#ffd36b", oggetto3d: fermiSat, strato: "speciale", imp: 40,
    testo: "Il telescopio spaziale per raggi gamma della NASA, in orbita a 550 km dal 2008 (qui l'orbita è ingrandita e la posizione è indicativa). Einstein@Home cerca pulsar nei suoi dati: sono i compiti FGRP (LATeah)." });
  scena.add(g);
  gruppiSfondo.terra = g;
  // luce del Sole: la parte illuminata della Terra è quella vera di adesso
  scena.add(new THREE.AmbientLight(0xffffff, 0.75));
  lucesole = new THREE.DirectionalLight(0xffffff, 2.2);
  scena.add(lucesole);
}

function creaOggetti() {
  const F = (t) => Object.fromEntries(D[t].campi.map((c, i) => [c, i]));
  const P = F("pulsar");
  pulsar = D.pulsar.righe.map((r) => {
    const o = { tipoO: "pulsar", nome: "PSR " + r[P.nome], j: r[P.nome], b: r[P.nome_b], ra: r[P.ra], dec: r[P.dec],
      periodo: r[P.periodo], dm: r[P.dm], dist: r[P.dist_kpc], statoDist: r[P.stato_dist], tipo: r[P.tipo] || "",
      assoc: r[P.assoc] || "", binaria: r[P.binaria] || "", gamma: r[P.gamma], magnetar: r[P.magnetar], fermi: r[P.fermi] };
    o.strato = o.magnetar ? "magnetar" : o.gamma ? "gamma" : (o.periodo && o.periodo < 0.03) ? "msp" : "normale";
    const f = FAMOSI[o.j];
    if (f) { o.comune = f[0]; o.nota = f[1]; }
    o.imp = (f ? 50 : 0) + (o.magnetar ? 6 : 0) + (o.gamma ? 5 : 0) + (o.strato === "msp" ? 2 : 0) + (o.dist ? Math.max(0, 3 - o.dist) : 0);
    return o;
  });
  const Fe = F("fermi");
  fermi = D.fermi.righe.map((r) => {
    const g = /^(psr|msp)$/i.test(r[Fe.classe] || "");
    const o = { tipoO: g ? "gammasola" : "fermi", nome: r[Fe.nome], ra: r[Fe.ra], dec: r[Fe.dec], classe: r[Fe.classe], assoc: r[Fe.assoc],
      strato: g ? "gamma" : "fermi", imp: g ? 4 : 0 };
    if (g && r[Fe.assoc]) o.comune = r[Fe.assoc];
    const f = g && FAMOSI[(r[Fe.assoc] || "").replace(/^PSR\s*/, "")];
    if (f) { o.comune = f[0]; o.nota = f[1]; o.imp = 50; }
    return o;
  });
  const S = F("snr");
  snr = D.snr.righe.map((r) => {
    const n = r[S.nome], f = SNR_FAMOSI[n];
    return { tipoO: "snr", nome: "SNR " + n, g: n, ra: r[S.ra], dec: r[S.dec], diametro: r[S.diametro], tipoSnr: r[S.tipo],
      altri: r[S.altri_nomi], comune: f || (r[S.altri_nomi] || "").split(/[,;]/)[0], strato: "snr",
      imp: (f ? 45 : 0) + Math.min(6, (r[S.diametro] || 0) / 30) + (r[S.altri_nomi] ? 2 : 0) };
  });
  const Q = F("quasar");
  quasar = D.quasar.righe.map((r) => ({ tipoO: "quasar", nome: r[Q.nome], ra: r[Q.ra], dec: r[Q.dec], z: r[Q.z], vmag: r[Q.vmag],
    comune: QSO_FAMOSI[r[Q.nome]] || "", strato: "quasar", imp: (QSO_FAMOSI[r[Q.nome]] ? 30 : 0) + Math.max(0, 16.5 - r[Q.vmag]) }));
  onde = D.onde.map((e, i) => ({ ...e, tipoO: "onda", indice: i, ra: e.picco[0], dec: e.picco[1], strato: "onde",
    comune: e.nome === "GW150914" ? "La prima onda gravitazionale" : e.nome === "GW170817" ? "Due stelle di neutroni (e la kilonova)" : "",
    imp: (["GW150914", "GW170817"].includes(e.nome) ? 55 : 0) + (e.snr || 8) / 4 - Math.log10(1 + (e.area || 1000)) }));
  // nuvole di punti, una per strato (le pulsar gamma senza controparte ATNF vanno con le gamma)
  const perStrato = {};
  for (const o of [...pulsar, ...fermi, ...snr, ...quasar]) {
    o.p = dir(o.ra, o.dec, R * 0.996);
    (perStrato[o.strato] = perStrato[o.strato] || []).push(o);
  }
  for (const [k, lista] of Object.entries(perStrato)) {
    const c = new THREE.Color(STRATI[k].colore);
    const pts = lista.map((o, i) => {
      o.indiceStrato = i;
      let d = STRATI[k].dim;
      if (k === "snr") d = 8 + Math.min(8, Math.sqrt(o.diametro || 10));
      if (k === "quasar") d = 6 + Math.max(0, 16.5 - o.vmag) * 0.8;
      if (o.comune && FAMOSI[o.j]) d *= 1.4;
      return { p: o.p, c, d };
    });
    puntiStrati[k] = nuvola(pts, materialePunti({ anello: !!STRATI[k].anello, opacita: k === "fermi" ? 0.7 : 1 }));
    puntiStrati[k].userData.lista = lista;
    scena.add(puntiStrati[k]);
  }
  // onde gravitazionali: tutte le zone di cielo, colori diversi; quella scelta si accende
  const pts = [];
  onde.forEach((e, i) => {
    const c = new THREE.Color().setHSL((i * 0.137) % 1, 0.75, 0.62);
    e.colore = "#" + c.getHexString();
    e.p = dir(e.ra, e.dec, R * 0.995);
    e.punti3d = e.punti.map(([a, b, l]) => dir(a, b, R * 0.995));
    e.punti.forEach(([a, b, l], k) => pts.push({ p: e.punti3d[k], c, d: l ? 6.5 : 5, g: i }));
  });
  puntiOnde = nuvola(pts, materialePunti({ morbido: true, opacita: 0.75 }));
  scena.add(puntiOnde);
  tutti.push(...pulsar, ...fermi, ...snr, ...quasar, ...onde);
  SOLE.p = dir(...posSole(), R * 0.99);
  tutti.push(SOLE);
}

// ------------------------------------------------------------------ visibilità, filtri
function stratoVisibile(o) {
  if (o.strato === "speciale") return o.tipoO === "sole" ? true : $("#c_terra").checked && !dentro;
  return STRATI[o.strato] && STRATI[o.strato].attivo;
}
function applicaFiltri() {
  for (const [k, p] of Object.entries(puntiStrati)) p.visible = STRATI[k].attivo;
  if (puntiOnde) puntiOnde.visible = STRATI.onde.attivo;
  gruppiSfondo.stelle.visible = $("#c_stelle").checked;
  gruppiSfondo.cost.visible = $("#c_cost").checked;
  gruppiSfondo.griglia.visible = $("#c_griglia").checked;
  gruppiSfondo.vialattea.visible = $("#c_vialattea").checked;
  gruppiSfondo.terra.visible = $("#c_terra").checked && !dentro;
  if (fasci) fasci.visible = $("#c_fasci").checked;
  ultimoPin = 0;
}

// ------------------------------------------------------------------ posizioni sullo schermo
const v3 = new THREE.Vector3();
function mondo(o) {
  if (o.oggetto3d) return o.oggetto3d.getWorldPosition(new THREE.Vector3());
  return o.p;
}
function schermo(p) {
  v3.copy(p).project(camera);
  if (v3.z > 1 || v3.z < -1) return null;
  return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight];
}
const raggio = new THREE.Ray();
function nascosto(p, o) {               // vista da fuori: dietro la sfera o dietro la Terra?
  if (dentro) return false;
  if (o && o.oggetto3d) {               // osservatori: nascosti se dall'altra parte della Terra
    const dc = camera.position.clone().sub(p);
    raggio.set(p.clone().addScaledVector(dc.clone().normalize(), 0.6), dc.normalize());
    return raggio.intersectsSphere(new THREE.Sphere(new THREE.Vector3(), RT * 0.99));
  }
  if (p.dot(camera.position) < 0) return true;
  const d = p.clone().sub(camera.position);
  raggio.set(camera.position, d.clone().normalize());
  const hit = raggio.intersectSphere(new THREE.Sphere(new THREE.Vector3(), RT * 1.02), new THREE.Vector3());
  return !!hit && hit.distanceTo(camera.position) < d.length() && $("#c_terra").checked;
}

// ------------------------------------------------------------------ pin
const contPin = $("#pin");
const ICONE = { pulsar: "💫", gammasola: "💫", snr: "💥", quasar: "🌌", onda: "〰️", osservatorio: "📡", sole: "☀️", fermi: "❔" };
function colore(o) { return o.colore || (STRATI[o.strato] ? STRATI[o.strato].colore : "#ccc"); }
function etichetta(o) { return o.comune ? o.comune : o.nome; }
function creaPin(o) {
  const d = document.createElement("div");
  d.className = "pin";
  d.style.setProperty("--c", colore(o));
  const ic = o.tipoO === "osservatorio" && o.nome === "Fermi" ? "🛰️" : o.magnetar ? "🧲" : ICONE[o.tipoO] || "•";
  d.innerHTML = `<div class="testa"><span class="ic">${ic}</span><span>${etichetta(o)}</span></div><div class="stelo"></div><div class="punta"></div>`;
  d.onclick = (e) => { e.stopPropagation(); seleziona(o); };
  d.ondblclick = (e) => { e.stopPropagation(); seleziona(o); guarda(o); };
  return d;
}
let candidatiPin = [], mostrati = [], ultimoPin = 0, evidenziato = null;
function scegliPin() {
  const w = innerWidth, h = innerHeight;
  const zoom = dentro ? 45 / camera.fov : 300 / Math.max(camera.position.length(), 1);
  const max = Math.round(Math.min(60, Math.max(3, parseInt($("#n_pin").value) * Math.pow(zoom, 0.8))));
  const lista = $("#c_pin").checked ? candidatiPin : [];
  const prima = [evidenziato, selezionato].filter(Boolean);
  const occupati = [];
  mostrati = [];
  for (const o of [...prima, ...lista]) {
    if (mostrati.length >= max + prima.length) break;
    if (mostrati.includes(o) || !stratoVisibile(o)) continue;
    const p = mondo(o);
    if (nascosto(p, o)) continue;
    const s = schermo(p);
    if (!s || s[0] < 20 || s[1] < 50 || s[0] > w - 20 || s[1] > h) continue;
    const larg = 52 + 8 * etichetta(o).length;
    const box = [s[0] - larg / 2, s[1] - 54, s[0] + larg / 2, s[1] - 14];
    if (!prima.includes(o) && occupati.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    occupati.push(box);
    mostrati.push(o);
  }
  const usati = new Set();
  for (const o of mostrati) {
    if (!o.el) o.el = creaPin(o);
    if (!o.el.parentNode) contPin.appendChild(o.el);
    usati.add(o.el);
  }
  for (const el of [...contPin.querySelectorAll(".pin")]) if (!usati.has(el)) el.remove();
}
function aggiornaPin(ora) {
  if (ora - ultimoPin > 300) { ultimoPin = ora; scegliPin(); }
  for (const o of mostrati) {
    const s = schermo(mondo(o));
    if (!s) { o.el.style.display = "none"; continue; }
    o.el.style.display = "flex";
    o.el.style.left = s[0] + "px";
    o.el.style.top = (s[1] + 7) + "px";
    o.el.classList.toggle("scelto", o === selezionato || o === evidenziato);
  }
  const mostraCost = $("#c_nomi_cost").checked && $("#c_cost").checked;
  const zoom = dentro ? 45 / camera.fov : 300 / Math.max(camera.position.length(), 1);
  for (const e of etichetteCost) {
    const ok = mostraCost && (e.rank <= (dentro ? 3 : zoom > 1.4 ? 3 : 2)) && !(dentro ? false : e.p.dot(camera.position) < 0);
    const s = ok ? schermo(e.p) : null;
    e.el.style.display = s ? "block" : "none";
    if (s) { e.el.style.left = s[0] + "px"; e.el.style.top = s[1] + "px"; }
  }
}

// ------------------------------------------------------------------ clic e passaggio del mouse
function trovaPunto(x, y) {
  let migliore = null, dmin = 7 + 5 * uGrandezza.value * uZoom.value + (TOCCO ? 12 : 0);   // col dito serve più margine   // più i pallini sono grandi, più è facile prenderli
  for (const o of tutti) {
    if (!stratoVisibile(o)) continue;
    const p = mondo(o);
    if (!dentro && !o.oggetto3d && p.dot(camera.position) < 0) continue;
    const s = schermo(p);
    if (!s) continue;
    const d = Math.hypot(s[0] - x, s[1] - y) - (o.imp > 20 ? 3 : 0);
    if (d < dmin && !nascosto(p, o)) { dmin = d; migliore = o; }
  }
  if (!migliore && STRATI.onde.attivo) {        // dentro la zona di un'onda gravitazionale?
    for (const e of onde) for (const p of e.punti3d) {
      if (!dentro && p.dot(camera.position) < 0) continue;
      const s = schermo(p);
      if (s && Math.hypot(s[0] - x, s[1] - y) < 4 + 3 * uGrandezza.value + (TOCCO ? 8 : 0)) return e;
    }
  }
  return migliore;
}
let giu = null, ultimoMov = 0;
canvas.addEventListener("pointerdown", (e) => { giu = { x: e.clientX, y: e.clientY }; document.body.classList.remove("menu"); });
$("#menu").onclick = (e) => { e.stopPropagation(); document.body.classList.toggle("menu"); };
canvas.addEventListener("pointerup", (e) => {
  if (!giu || Math.hypot(e.clientX - giu.x, e.clientY - giu.y) > 5) return;
  const o = trovaPunto(e.clientX, e.clientY);
  if (o) seleziona(o);
});
canvas.addEventListener("dblclick", (e) => { const o = trovaPunto(e.clientX, e.clientY); if (o) { seleziona(o); guarda(o); } });
canvas.addEventListener("pointermove", (e) => {
  const ora = performance.now(), t = $("#suggerimento");
  if (e.buttons || salvaschermo) { t.style.display = "none"; return; }
  if (ora - ultimoMov < 80) return;
  ultimoMov = ora;
  const o = trovaPunto(e.clientX, e.clientY);
  if (o) {
    t.innerHTML = `<b>${o.nome}</b>${o.comune ? " · " + o.comune : ""}<br><small>${descrizioneBreve(o)}</small>`;
    t.style.left = Math.min(e.clientX + 14, innerWidth - 320) + "px"; t.style.top = e.clientY + 12 + "px"; t.style.display = "block";
    canvas.style.cursor = "pointer";
  } else { t.style.display = "none"; canvas.style.cursor = ""; }
});

// ------------------------------------------------------------------ formati
function numero(x, dec = 0) {
  if (x == null || !isFinite(x)) return "—";
  const [i, d] = Math.abs(x).toFixed(dec).split(".");
  return (x < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d && +d ? "," + d.replace(/0+$/, "") : "");
}
function formatoAL(al) {
  if (al >= 1e9) return `${numero(al / 1e9, 1)} miliardi di anni luce`;
  if (al >= 1e6) return `${numero(al / 1e6, 1)} milioni di anni luce`;
  return `${numero(al >= 1000 ? Math.round(al / 100) * 100 : Math.round(al))} anni luce`;
}
function formatoPeriodo(p) {
  if (!p) return "—";
  if (p < 1) return `${numero(p * 1000, p < 0.01 ? 3 : 2)} millisecondi (${numero(1 / p, 1)} giri al secondo)`;
  return `${numero(p, 3)} secondi`;
}
function formatoRA(ra) { const h = ra / 15, m = (h % 1) * 60; return `${Math.floor(h)}h ${Math.floor(m)}m ${numero((m % 1) * 60, 0)}s`; }
function formatoDec(d) { const a = Math.abs(d), m = (a % 1) * 60; return `${d < 0 ? "−" : "+"}${Math.floor(a)}° ${Math.floor(m)}′ ${numero((m % 1) * 60, 0)}″`; }
function nomeTipo(o) {
  return { pulsar: o.magnetar ? "Magnetar" : o.gamma ? (o.periodo < 0.03 ? "Pulsar al millisecondo, vista anche nei raggi gamma" : "Pulsar vista anche nei raggi gamma")
      : o.strato === "msp" ? "Pulsar al millisecondo" : /RRAT/.test(o.tipo) ? "Pulsar a lampi irregolari (RRAT)" : "Pulsar radio",
    gammasola: "Pulsar gamma (Fermi)", fermi: "Sorgente gamma senza identificazione", snr: "Resto di supernova",
    quasar: "Quasar", onda: tipoOnda(o), osservatorio: o.nome === "Fermi" ? "Telescopio spaziale" : /LIGO|Virgo|KAGRA|GEO/.test(o.nome) ? "Rivelatore di onde gravitazionali" : "Radiotelescopio",
    sole: "La nostra stella" }[o.tipoO] || "";
}
function tipoOnda(e) {
  if (!e.m1) return "Onda gravitazionale";
  const ns = (m) => m < 3;
  if (ns(e.m1) && ns(e.m2)) return "Onda gravitazionale: due stelle di neutroni";
  if (ns(e.m2)) return "Onda gravitazionale: buco nero e stella di neutroni";
  return "Onda gravitazionale: due buchi neri";
}
function descrizioneBreve(o) {
  if (o.tipoO === "pulsar") return `${nomeTipo(o)} · ${formatoPeriodo(o.periodo)}${o.dist ? " · " + formatoAL(o.dist * AL_KPC) : ""}`;
  if (o.tipoO === "onda") return `${tipoOnda(o)} · ${o.data.slice(0, 10)}${o.dist ? " · " + formatoAL(o.dist * AL_MPC) : ""}`;
  if (o.tipoO === "quasar") return `Quasar · magnitudine ${numero(o.vmag, 1)}${o.z ? " · z = " + numero(o.z, 3) : ""}`;
  return nomeTipo(o);
}

// ------------------------------------------------------------------ spiegazioni
const SPIEGA = {
  normale: "Una pulsar è una stella di neutroni: il nucleo di una stella esplosa, più pesante del Sole ma grande come una città. Ruota velocissima e manda un fascio di onde radio come un faro: se il fascio passa sulla Terra vediamo un impulso a ogni giro.",
  msp: "Pulsar «riciclata»: una stella compagna le ha passato materia e l'ha fatta girare centinaia di volte al secondo. Sono gli orologi più precisi della natura.",
  gamma: "Questa pulsar si vede anche nei raggi gamma con il satellite Fermi. È proprio il tipo di pulsar che cercano i compiti FGRP (LATeah) di Einstein@Home: tra le pulsar gamma conosciute, diverse decine le hanno trovate i computer dei volontari.",
  magnetar: "Stella di neutroni con un campo magnetico mille volte più forte di una pulsar normale (un milione di miliardi di volte quello terrestre). Ogni tanto ha esplosioni di raggi X e gamma.",
  fermi: "Sorgente di raggi gamma vista da Fermi a cui non si è ancora dato un nome: alcune sono pulsar ancora da scoprire. I compiti LATeah di Einstein@Home provano milioni di combinazioni di rotazione e orbita per trovarne le pulsazioni.",
  snr: "I resti di una stella esplosa come supernova: una bolla di gas che si espande da centinaia o migliaia di anni. Spesso al centro c'è una stella di neutroni, a volte una pulsar.",
  quasar: "Il nucleo di una galassia lontanissima, dove un buco nero di milioni o miliardi di masse solari divora materia e brilla più di tutta la galassia. La sua luce è partita miliardi di anni fa.",
  onda: "Due oggetti compatti (buchi neri o stelle di neutroni) si sono avvicinati a spirale e fusi, facendo vibrare lo spazio-tempo. La zona colorata è dove si trova la sorgente nel cielo con il 90 % di probabilità: più rivelatori la vedono, più è piccola.",
};
function infoEaH(o) {
  if (o.tipoO === "pulsar" && o.gamma) return "🔎 Einstein@Home: ricerca FGRP nei dati di Fermi.";
  if (o.tipoO === "pulsar" && o.binaria) return "🔎 Einstein@Home: i compiti BRP cercano pulsar in coppia con un'altra stella, come questa, nei dati dei radiotelescopi.";
  if (o.tipoO === "fermi") return "🔎 Einstein@Home: candidata per i compiti LATeah (FGRP5).";
  if (o.tipoO === "onda") return "🔎 Einstein@Home non cerca questi lampi brevi: cerca le onde gravitazionali continue di stelle di neutroni che ruotano (compiti O4MD), nei dati degli stessi rivelatori.";
  return "";
}

// ------------------------------------------------------------------ scheda
function riga(n, v) { return v == null || v === "" ? "" : `<tr><td>${n}</td><td>${v}</td></tr>`; }
function linkSimbad(nome) {
  return `<a class="link" target="_blank" href="https://simbad.cfa.harvard.edu/simbad/sim-id?Ident=${encodeURIComponent(nome)}">🔭 SIMBAD</a>`;
}
function linkWiki(q) {
  return `<a class="link" target="_blank" href="https://it.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}">🌐 Wikipedia</a>`;
}
function seleziona(o) {
  selezionato = o;
  if (PICCOLO()) document.body.classList.remove("menu");
  ferma_audio();
  if (puntiOnde) puntiOnde.material.uniforms.uScelto.value = o.tipoO === "onda" ? o.indice : -1;
  $("#dx").style.display = "block";
  const c = colore(o);
  let h = `<h3>${o.nome}</h3>${o.comune ? `<div class="comune">${o.comune}</div>` : ""}<span class="tipo" style="--c:${c}">${nomeTipo(o)}</span>`;
  const pos = o.ra != null ? riga("Posizione", `AR ${formatoRA(o.ra)} · Dec ${formatoDec(o.dec)}`) : "";
  if (o.tipoO === "pulsar") {
    const assoc = o.assoc.split(",").filter(Boolean).map((a) => {
      const [t, n] = a.split(":");
      return ({ SNR: "resto di supernova ", GC: "ammasso globulare ", EXGAL: "", OPT: "controparte ottica ", XRS: "sorgente X ", GRS: "sorgente gamma " }[t] ?? t + " ") + (n || "");
    }).join(", ");
    const dist = o.dist ? formatoAL(o.dist * AL_KPC) + (o.statoDist === 0 ? " (misurata)" : o.statoDist === 1 ? " (stimata dagli elettroni lungo la via)" : " (stima grossolana)") : "";
    h += `${o.nota ? `<p>${o.nota}</p>` : ""}<p>${SPIEGA[o.strato]}</p>
      ${o.periodo ? `<div class="battito" style="--c:${c};--t:${Math.max(o.periodo, 0.08)}s"><div class="faro"></div>
        <div>${o.periodo < 0.08 ? `Gira ${numero(1 / o.periodo, 0)} volte al secondo: troppo veloce per l'occhio (qui rallentata). Ascoltala!` : "Un lampo a ogni giro, alla velocità vera."}</div></div>` : ""}
      <table>${riga("Periodo di rotazione", formatoPeriodo(o.periodo))}${riga("Distanza", dist)}
      ${riga("Misura di dispersione", o.dm ? numero(o.dm, 2) + " pc/cm³" : "")}${riga("In coppia con un'altra stella", o.binaria ? "sì (modello " + o.binaria + ")" : "")}
      ${riga("Associata a", assoc)}${riga("Nome B1950", o.b)}${riga("Sorgente Fermi", o.fermi)}${pos}</table>`;
  } else if (o.tipoO === "gammasola" || o.tipoO === "fermi") {
    h += `${o.nota ? `<p>${o.nota}</p>` : ""}<p>${SPIEGA[o.tipoO === "fermi" ? "fermi" : "gamma"]}</p>
      <table>${riga("Associata a", o.assoc)}${riga("Classe 4FGL", o.classe || "nessuna")}${pos}</table>`;
  } else if (o.tipoO === "snr") {
    h += `<p>${SPIEGA.snr}</p><table>${riga("Altri nomi", o.altri)}${riga("Diametro apparente", o.diametro ? numero(o.diametro, 1) + "′ (la Luna è 30′)" : "")}
      ${riga("Forma", { S: "guscio", F: "riempita (nebulosa di vento di pulsar)", C: "composita" }[(o.tipoSnr || "").replace(/\?/g, "")] || o.tipoSnr)}${pos}</table>`;
  } else if (o.tipoO === "quasar") {
    h += `${o.comune ? "" : ""}<p>${SPIEGA.quasar}</p><table>${riga("Magnitudine visuale", numero(o.vmag, 2))}${riga("Spostamento verso il rosso (z)", o.z != null ? numero(o.z, 3) : "")}${pos}</table>`;
  } else if (o.tipoO === "onda") {
    const tipoMasse = o.m1 ? `${numero(o.m1, 1)} + ${numero(o.m2, 1)} masse solari` : "";
    h += `<p>${SPIEGA.onda}</p>${o.nota ? `<div class="nota">${o.nota}</div>` : ""}
      <table>${riga("Data (UTC)", o.data)}${riga("Masse", tipoMasse)}${riga("Massa finale", o.mfin ? numero(o.mfin, 1) + " masse solari" : "")}
      ${riga("Distanza", o.dist ? formatoAL(o.dist * AL_MPC) : "")}${riga("Zona di cielo (90 %)", o.area ? numero(o.area) + " gradi² (la Luna è 0,2)" : "")}
      ${riga("Segnale/rumore", o.snr ? numero(o.snr, 1) : "")}${riga("Catalogo", o.catalogo)}${riga("Allarme GraceDB", o.gracedb)}
      ${riga("Punto più probabile", `AR ${formatoRA(o.ra)} · Dec ${formatoDec(o.dec)}`)}</table>`;
  } else if (o.tipoO === "osservatorio") {
    h += `<p>${o.testo}</p>${o.lat != null ? `<table>${riga("Latitudine", numero(o.lat, 2) + "°")}${riga("Longitudine", numero(o.lon, 2) + "°")}</table>` : ""}`;
  } else if (o.tipoO === "sole") {
    const [ra, de] = posSole();
    h += `<p>Il Sole è nel punto del cielo dove si trova oggi, tra le stelle dello zodiaco. La metà illuminata della Terra al centro è quella vera di questo momento.</p>
      <table>${riga("Posizione di oggi", `AR ${formatoRA(ra)} · Dec ${formatoDec(de)}`)}</table>`;
  }
  const eah = infoEaH(o);
  if (eah) h += `<div class="eah">${eah}</div>`;
  const nomeRicerca = o.tipoO === "pulsar" ? (o.b ? "PSR " + o.b : o.nome) : o.tipoO === "snr" ? (o.comune || o.nome) : o.nome;
  h += `<div class="bottoni"><button id="b_vai">🎯 Guarda</button>${o.tipoO === "pulsar" && o.periodo ? `<button id="b_ascolta">🔊 Ascolta</button>` : ""}
    ${o.tipoO === "onda" ? `<a class="link" target="_blank" href="https://gracedb.ligo.org/superevents/${o.gracedb}/view/">📈 GraceDB</a>`
      : o.tipoO === "osservatorio" || o.tipoO === "sole" ? linkWiki(o.nome.replace(/ \(.*\)/, "")) : linkSimbad(nomeRicerca)}
    ${o.tipoO === "osservatorio" || o.tipoO === "sole" ? "" : linkWiki(o.comune && o.tipoO !== "pulsar" ? o.comune : nomeRicerca)}</div>`;
  $("#scheda").innerHTML = h;
  $("#b_vai").onclick = () => guarda(o);
  if ($("#b_ascolta")) $("#b_ascolta").onclick = () => ascolta(o.periodo);
  ultimoPin = 0;
}
$("#chiudi").onclick = () => chiudiScheda();
function chiudiScheda() {
  $("#dx").style.display = "none"; selezionato = null; ferma_audio();
  if (puntiOnde) puntiOnde.material.uniforms.uScelto.value = -1;
}

// ------------------------------------------------------------------ ascoltare una pulsar
let audio = null;
function ferma_audio() {
  if (audio) { try { audio.src.stop(); audio.ctx.close(); } catch { /* già fermo */ } audio = null; }
  if ($("#b_ascolta")) $("#b_ascolta").textContent = "🔊 Ascolta";
}
function ascolta(periodo) {
  if (audio) { ferma_audio(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const sr = ctx.sampleRate, n = Math.max(32, Math.round(Math.min(periodo, 12) * sr));
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const durata = Math.min(n, Math.round(sr * Math.min(0.004, periodo * 0.3)));
  for (let i = 0; i < durata; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (durata / 4)) * 0.9;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.loop = true; g.gain.value = 0.35;
  src.connect(g).connect(ctx.destination);
  src.start();
  audio = { ctx, src };
  $("#b_ascolta").textContent = "🔇 Basta";
}

// ------------------------------------------------------------------ movimenti della camera
let volo = null;
const liscio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function guarda(o, durata = 1800) {
  const p = mondo(o).clone();
  if (dentro) {                         // dall'interno: la camera resta al centro e si gira verso l'oggetto
    const da = camera.position.clone(), a = p.clone().normalize().multiplyScalar(-0.01);
    volo = { inizio: performance.now(), durata, da, a, fovDa: camera.fov, fovA: Math.min(camera.fov, 40) };
  } else {
    const dist = Math.max(camera.position.length(), RT * 4);
    const verso = o.oggetto3d ? p.clone().normalize() : p.clone().normalize();
    volo = { inizio: performance.now(), durata, da: camera.position.clone(), a: verso.multiplyScalar(o.oggetto3d ? Math.min(dist, 70) : dist) };
  }
}
function impostaVista(interno) {
  dentro = interno;
  $("#v_fuori").classList.toggle("attivo", !dentro);
  $("#v_dentro").classList.toggle("attivo", dentro);
  uComuni.uDentro.value = dentro ? 1 : 0;
  if (vialatteaMesh) { vialatteaMesh.material.side = dentro ? THREE.BackSide : THREE.FrontSide; vialatteaMesh.material.needsUpdate = true; }
  volo = null;
  if (dentro) {
    controlli.minDistance = 0.001; controlli.maxDistance = 0.02;
    controlli.enableZoom = false; controlli.rotateSpeed = -0.35;
    const d = camera.position.clone().normalize();
    camera.position.copy(d.multiplyScalar(-0.01));     // guarda dalla parte che prima si vedeva davanti
    camera.fov = 70;
  } else {
    controlli.minDistance = RT * 1.6; controlli.maxDistance = 1400;
    controlli.enableZoom = true; controlli.rotateSpeed = 1;
    camera.fov = 45;
    camera.position.copy(camera.position.clone().normalize().multiplyScalar(-distanzaIniziale()));
  }
  controlli.target.set(0, 0, 0);
  camera.updateProjectionMatrix();
  applicaFiltri();
}
function distanzaIniziale() {           // sullo schermo stretto del telefono la sfera deve stare tutta in larghezza
  return 300 / Math.pow(Math.min(1, innerWidth / innerHeight), 1.05);
}
function vistaIniziale() {
  if (dentro) impostaVista(false);
  volo = { inizio: performance.now(), durata: 1600, da: camera.position.clone(), a: new THREE.Vector3(150, 120, 240).setLength(distanzaIniziale()) };
}
canvas.addEventListener("wheel", (e) => {
  if (!dentro) return;
  e.preventDefault();
  camera.fov = Math.min(100, Math.max(8, camera.fov * Math.pow(1.0015, e.deltaY)));
  camera.updateProjectionMatrix();
}, { passive: false });
$("#v_fuori").onclick = () => impostaVista(false);
$("#v_dentro").onclick = () => impostaVista(true);
$("#c_inizio").onclick = vistaIniziale;
function commutaRotazione(v = !rotazione) {
  rotazione = v;
  controlli.autoRotate = rotazione;
  $("#ruota").textContent = rotazione ? "⏸ Ferma" : "▶ Fai ruotare";
  $("#ruota").classList.toggle("attivo", rotazione);
}
$("#ruota").onclick = () => commutaRotazione();

// pulsanti (tenere premuto) e tastiera: frecce = girare, + − = zoom
const premuti = new Set(), tastiera = new Set();
document.querySelectorAll("#comandi button[data-c]").forEach((b) => {
  const c = b.dataset.c;
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); premuti.add(c); b.classList.add("attivo"); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { premuti.delete(c); b.classList.remove("attivo"); });
});
const TASTI = { ArrowUp: "su", ArrowDown: "giu", ArrowLeft: "sx", ArrowRight: "dx", "+": "piu", "=": "piu", "-": "meno" };
function scrivendo(e) {
  const t = e.target, tag = t && t.tagName;
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["checkbox", "radio", "button", "range"].includes(t.type));
}
addEventListener("keydown", (e) => {
  attivita();
  if (salvaschermo) { esciSalvaschermo(); e.preventDefault(); return; }
  if (scrivendo(e)) return;
  if (TASTI[e.key]) { tastiera.add(TASTI[e.key]); e.preventDefault(); }
  else if (e.key === "s" || e.key === "S") avviaSalvaschermo(true);
  else if (e.key === "f" || e.key === "F") schermoIntero();
  else if (e.key === " ") { commutaRotazione(); e.preventDefault(); }
  else if (e.key === "Escape") chiudiScheda();
});
addEventListener("keyup", (e) => { if (TASTI[e.key]) tastiera.delete(TASTI[e.key]); });
addEventListener("blur", () => tastiera.clear());
const comando = (c) => premuti.has(c) || tastiera.has(c);
function muoviComandi(dt) {
  if (!premuti.size && !tastiera.size) return;
  volo = null;
  if (dentro && (comando("piu") || comando("meno"))) {
    camera.fov = Math.min(100, Math.max(8, camera.fov * Math.pow(comando("piu") ? 0.5 : 2, dt)));
    camera.updateProjectionMatrix();
  }
  const rel = camera.position.clone().sub(controlli.target);
  if (!dentro) {
    if (comando("piu")) rel.multiplyScalar(Math.pow(0.4, dt));
    if (comando("meno")) rel.multiplyScalar(Math.pow(1 / 0.4, dt));
  }
  const sph = new THREE.Spherical().setFromVector3(rel), segno = dentro ? -1 : 1, v = dt * 0.9;
  if (comando("sx")) sph.theta -= v * segno;
  if (comando("dx")) sph.theta += v * segno;
  if (comando("su")) sph.phi = Math.max(0.03, sph.phi - v * segno);
  if (comando("giu")) sph.phi = Math.min(Math.PI - 0.03, sph.phi + v * segno);
  sph.phi = Math.min(Math.PI - 0.03, Math.max(0.03, sph.phi));
  sph.radius = Math.min(Math.max(sph.radius, controlli.minDistance), controlli.maxDistance);
  camera.position.copy(controlli.target).add(new THREE.Vector3().setFromSpherical(sph));
}

// ------------------------------------------------------------------ ricerca
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s\-_.+]+/g, "");
$("#cerca").addEventListener("input", () => {
  const q = norm($("#cerca").value), out = $("#risultati");
  out.innerHTML = "";
  if (q.length < 2) return;
  const trovati = [];
  for (const o of tutti) {
    const k = o.chiave || (o.chiave = [o.nome, o.comune, o.b, o.altri, o.assoc, o.gracedb].map(norm).join("|"));
    if (k.includes(q)) trovati.push([norm(o.nome) === q || norm(o.comune) === q ? 2 : k.startsWith(q) ? 1 : 0, o.imp || 0, o]);
  }
  trovati.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [, , o] of trovati.slice(0, 12)) {
    const d = document.createElement("div");
    d.innerHTML = `<span class="pallino" style="background:${colore(o)}"></span> ${o.nome}<br><small>${o.comune ? o.comune + " · " : ""}${descrizioneBreve(o)}</small>`;
    d.onclick = () => {
      if (STRATI[o.strato] && !STRATI[o.strato].attivo) { STRATI[o.strato].attivo = true; creaCaselle(); applicaFiltri(); }
      seleziona(o); guarda(o);
    };
    out.appendChild(d);
  }
});

// ------------------------------------------------------------------ caselle degli strati, elenco onde
function creaCaselle() {
  const conteggi = {};
  for (const o of tutti) if (STRATI[o.strato]) conteggi[o.strato] = (conteggi[o.strato] || 0) + 1;
  const div = $("#strati");
  div.innerHTML = "";
  for (const [k, s] of Object.entries(STRATI)) {
    const l = document.createElement("label");
    l.className = "casella";
    const nonDisp = !conteggi[k];
    l.innerHTML = `<input type="checkbox" ${s.attivo && !nonDisp ? "checked" : ""} ${nonDisp ? "disabled" : ""}>
      <span class="pallino${s.anello ? " anello" : ""}" style="background:${s.colore};border-color:${s.colore}"></span>${s.nome}
      <span class="num">${nonDisp ? "non disponibili" : numero(conteggi[k])}</span>`;
    l.querySelector("input").onchange = (e) => { s.attivo = e.target.checked; applicaFiltri(); };
    div.appendChild(l);
  }
  const el = $("#elenco_gw");
  el.innerHTML = "";
  for (const e of [...onde].reverse()) {
    const d = document.createElement("div");
    d.innerHTML = `<span class="pallino" style="background:${e.colore}"></span> ${e.nome}<br><small>${e.data.slice(0, 10)} · ${tipoOnda(e).replace("Onda gravitazionale: ", "")}${e.area ? " · " + numero(e.area) + " gradi²" : ""}</small>`;
    d.onclick = () => { STRATI.onde.attivo = true; applicaFiltri(); seleziona(e); guarda(e); };
    el.appendChild(d);
  }
}
for (const id of ["#c_stelle", "#c_cost", "#c_nomi_cost", "#c_vialattea", "#c_griglia", "#c_terra", "#c_fasci", "#c_pin"]) $(id).onchange = applicaFiltri;
$("#n_pin").oninput = () => (ultimoPin = 0);
function impostaGrandezza(v) {
  grandezzaScelta = v;
  uGrandezza.value = v;
  $("#grandezza").value = v;
  $("#grandezza_n").textContent = Math.round(v * 100) + " %";
  try { localStorage.setItem("cielo_einstein_grandezza", String(v)); } catch { /* */ }
}
$("#grandezza").oninput = (e) => impostaGrandezza(parseFloat(e.target.value));
impostaGrandezza(grandezzaScelta);

// ------------------------------------------------------------------ schermo intero e salvaschermo
function schermoIntero() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
$("#b_intero").onclick = schermoIntero;
let ssInizio = 0, ssTimer = null, ssIntero = false, ultimaAttivita = performance.now(), ssPos = null;
function avviaSalvaschermo(conIntero) {
  if (salvaschermo) return;
  salvaschermo = true;
  ssInizio = performance.now();
  document.body.classList.add("ss");
  chiudiScheda();
  $("#suggerimento").style.display = "none";
  if (conIntero && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => (ssIntero = true)).catch(() => {});
  }
  commutaRotazione(true);
  controlli.autoRotateSpeed = 0.5;
  prossimaCartolina();
  ssTimer = setInterval(prossimaCartolina, 16000);
}
function esciSalvaschermo() {
  if (!salvaschermo || performance.now() - ssInizio < 1200) return;
  salvaschermo = false;
  clearInterval(ssTimer);
  document.body.classList.remove("ss");
  evidenziato = null;
  controlli.autoRotateSpeed = 0.35;
  if (ssIntero && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  ssIntero = false;
  ultimaAttivita = performance.now();
  ultimoPin = 0;
}
$("#b_ss").onclick = () => avviaSalvaschermo(true);
function prossimaCartolina() {
  const scelte = candidatiPin.slice(0, 160).filter((o) => stratoVisibile(o) && o !== evidenziato);
  if (!scelte.length) return;
  // gli oggetti più importanti escono più spesso
  const pesi = scelte.map((o) => 1 + Math.max(0, o.imp || 0) / 10);
  let r = Math.random() * pesi.reduce((a, b) => a + b, 0), o = scelte[0];
  for (let i = 0; i < scelte.length; i++) { r -= pesi[i]; if (r <= 0) { o = scelte[i]; break; } }
  evidenziato = o;
  if (puntiOnde) puntiOnde.material.uniforms.uScelto.value = o.tipoO === "onda" ? o.indice : -1;
  guarda(o, 5000);
  const c = $("#cartolina");
  c.style.opacity = 0;
  setTimeout(() => {
    const testo = o.nota || (o.tipoO === "osservatorio" ? o.testo : o.tipoO === "sole" ? "Il Sole dove si trova oggi tra le stelle." : SPIEGA[o.tipoO === "pulsar" ? o.strato : o.tipoO === "gammasola" ? "gamma" : o.tipoO] || "");
    c.innerHTML = `<div class="nome">${o.comune || o.nome}</div><div class="tipo" style="--c:${colore(o)}">${o.comune ? o.nome + " · " : ""}${descrizioneBreve(o)}</div>
      <div class="testo">${testo}</div>`;
    c.style.opacity = 1;
  }, 900);
  ultimoPin = 0;
}
function attivita() { ultimaAttivita = performance.now(); }
addEventListener("pointerdown", () => { attivita(); if (salvaschermo) esciSalvaschermo(); }, true);
addEventListener("wheel", attivita, { passive: true });
addEventListener("pointermove", (e) => {
  if (salvaschermo) {
    if (!ssPos) ssPos = [e.clientX, e.clientY];
    if (Math.hypot(e.clientX - ssPos[0], e.clientY - ssPos[1]) > 40) { ssPos = null; esciSalvaschermo(); }
    return;
  }
  ssPos = null;
  attivita();
});
try { $("#ss_auto").value = localStorage.getItem("cielo_einstein_ss") || "0"; } catch { /* niente memoria */ }
$("#ss_auto").onchange = () => { try { localStorage.setItem("cielo_einstein_ss", $("#ss_auto").value); } catch { /* */ } };
setInterval(() => {
  const min = parseInt($("#ss_auto").value);
  if (min && !salvaschermo && performance.now() - ultimaAttivita > min * 60000) avviaSalvaschermo(false);
}, 5000);

// ------------------------------------------------------------------ orologio e aggiornamento dei cataloghi
let statoServer = "";
function aggiornaOrologio() {
  const t = new Date(), st = tempoSiderale(t) / 15;
  const z = (n) => String(n).padStart(2, "0");
  $("#orologio").textContent = `UTC ${z(t.getUTCHours())}:${z(t.getUTCMinutes())} · tempo siderale ${Math.floor(st)}h ${z(Math.floor((st % 1) * 60))}m · `
    + `cataloghi del ${D.creato.slice(8, 10)}/${D.creato.slice(5, 7)}/${D.creato.slice(0, 4)}${statoServer ? " · " + statoServer : ""}`;
}
async function controllaAggiornamenti() {
  if (window.DATI) return;
  try {
    const s = await (await fetch("./api/stato")).json();
    statoServer = s.aggiornando ? "⟳ aggiorno i cataloghi…" : "";
    if (!s.aggiornando && s.creato && s.creato > D.creato) {
      if (salvaschermo || performance.now() - ultimaAttivita > 120000) location.href = salvaschermo ? "./?salvaschermo=1" : "./";
      else {
        const a = $("#avviso");
        a.innerHTML = `🔄 Cataloghi aggiornati (${s.messaggio}). <button id="b_ricarica">Carica i dati nuovi</button>`;
        a.style.display = "block";
        $("#b_ricarica").onclick = () => location.reload();
      }
    }
  } catch { statoServer = ""; }
}

// ------------------------------------------------------------------ ciclo
let ultimo = performance.now(), ultimoOrologio = 0;
const PERIODO_FERMI = 95.7 * 60;
function anima(ora) {
  const dt = Math.min(0.1, (ora - ultimo) / 1000);
  ultimo = ora;
  const adesso = new Date();
  if (terra) {
    terra.rotation.y = tempoSiderale(adesso) * DEG;
    fermiSat.position.set(RT * 1.35 * Math.cos(adesso.getTime() / 1000 / PERIODO_FERMI * 2 * Math.PI), 0,
      -RT * 1.35 * Math.sin(adesso.getTime() / 1000 / PERIODO_FERMI * 2 * Math.PI));
    fermiSat.rotation.y += dt;
  }
  if (volo) {
    const t = Math.min(1, (ora - volo.inizio) / volo.durata), e = liscio(t);
    if (dentro) {
      camera.position.copy(volo.da).lerp(volo.a, e);
      if (camera.position.length() < 1e-4) camera.position.copy(volo.a);
      camera.position.setLength(0.01);
      camera.fov = volo.fovDa + (volo.fovA - volo.fovDa) * e;
      camera.updateProjectionMatrix();
    } else {
      // percorso sulla sfera (non attraverso la Terra): direzione interpolata, distanza interpolata
      const r = volo.da.length() + (volo.a.length() - volo.da.length()) * e;
      const d = volo.da.clone().normalize().lerp(volo.a.clone().normalize(), e);
      if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
      camera.position.copy(d.normalize().multiplyScalar(r));
    }
    if (t >= 1) volo = null;
  }
  muoviComandi(dt);
  controlli.update(dt);
  // pallini un po' più grandi avvicinandosi (fino a 2 volte)
  uZoom.value = dentro ? Math.min(2, Math.max(1, Math.pow(70 / camera.fov, 0.5)))
    : Math.min(2, Math.max(0.85, Math.pow(310 / Math.max(camera.position.length(), 1), 0.45)));
  renderer.render(scena, camera);
  aggiornaPin(ora);
  if (ora - ultimoOrologio > 1000) {
    ultimoOrologio = ora;
    aggiornaOrologio();
    const [ra, de] = posSole(adesso);
    SOLE.p = dir(ra, de, R * 0.99);
    soleMesh.position.copy(SOLE.p);
    lucesole.position.copy(dir(ra, de, 500));
  }
  requestAnimationFrame(anima);
}
let soleMesh;

// ------------------------------------------------------------------ avvio
async function caricaDati() {
  // la prima volta i cataloghi si stanno ancora preparando: si aspetta mostrando a che punto è
  if (window.DATI) return window.DATI;
  for (;;) {
    const r = await fetch("./dati/dati.json");
    if (r.ok) return r.json();
    try {
      const s = await (await fetch("./api/stato")).json();
      $("#stato_car").innerHTML = s.aggiornando
        ? `Prima volta: scarico e preparo i cataloghi (qualche minuto)…<br><small>${s.messaggio || ""}</small>`
        : s.messaggio || "aspetto i dati…";
    } catch { $("#stato_car").textContent = "Il programma non risponde: è stato chiuso?"; }
    await new Promise((ok) => setTimeout(ok, 2500));
  }
}
async function avvia() {
  D = await caricaDati();
  $("#stato_car").textContent = "disegno le stelle e la Via Lattea…";
  await new Promise((r) => setTimeout(r, 20));
  creaSfondo();
  creaTerra();
  creaOggetti();
  // il Sole: un disco luminoso sulla sfera
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const cx = cv.getContext("2d"), g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(0.25, "rgba(255,220,120,0.9)"); g.addColorStop(1, "rgba(255,180,60,0)");
  cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
  soleMesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, blending: THREE.AdditiveBlending }));
  soleMesh.scale.set(9, 9, 1);
  soleMesh.position.copy(SOLE.p);
  scena.add(soleMesh);
  const [ra, de] = posSole();
  lucesole.position.copy(dir(ra, de, 500));
  candidatiPin = tutti.filter((o) => (o.imp || 0) > 3 || o.comune).sort((a, b) => (b.imp || 0) - (a.imp || 0));
  creaCaselle();
  applicaFiltri();
  // fonti e data dei dati
  const nonDisp = Object.entries(D.fonti || {}).filter(([, v]) => /non disponibile/.test(v)).map(([k]) => k);
  $("#info_dati").innerHTML = `Dati: ATNF, Fermi-LAT 4FGL, Green, Véron-Cetty, GWOSC/GraceDB, d3-celestial.<br>Preparati il ${D.creato}.`
    + (nonDisp.length ? `<br>⚠️ Non disponibili all'ultimo aggiornamento: ${nonDisp.join(", ")}.` : "");
  dimensiona();
  addEventListener("resize", dimensiona);
  camera.position.set(150, 120, 240);
  impostaVista(false);
  camera.position.set(150, 120, 240).setLength(distanzaIniziale());
  if (PARAMETRI.get("vista") === "dentro") impostaVista(true);
  if (PARAMETRI.get("distanza")) camera.position.setLength(parseFloat(PARAMETRI.get("distanza")));
  if (PARAMETRI.get("oggetto")) {               // ?oggetto=nome: apre la scheda e lo inquadra
    const q = norm(PARAMETRI.get("oggetto")), o = tutti.find((x) => norm(x.nome) === q || norm(x.comune) === q);
    if (o) { seleziona(o); guarda(o, 10); }
  }
  $("#caricamento").style.display = "none";
  console.log(`Cielo di Einstein@Home: ${pulsar.length} pulsar, ${fermi.length} sorgenti Fermi, ${snr.length} resti di supernova, ${quasar.length} quasar, ${onde.length} onde gravitazionali, ${D.stelle.length} stelle`);
  window.__ce = { tutti, camera, seleziona, guarda, impostaVista, avviaSalvaschermo, controlli };
  requestAnimationFrame(anima);
  setInterval(controllaAggiornamenti, 15000);
  controllaAggiornamenti();
  if (PARAMETRI.get("salvaschermo") === "1") avviaSalvaschermo(false);
}
avvia().catch((e) => { $("#stato_car").textContent = "Errore: " + e.message; console.error(e); });
