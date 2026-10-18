/* 3D room view: a dollhouse cutaway with top and side views, built with three.js (loaded on demand).
   Units are centimetres. Room x maps to three.js X, room y (north to south) maps to Z, height is Y. */
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js';

function loadThree() {
  if (window.THREE && window.THREE.OrbitControls) return Promise.resolve(window.THREE);
  if (loadThree.p) return loadThree.p;
  const add = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
  loadThree.p = (window.THREE ? Promise.resolve() : add(THREE_URL)).then(() => add(ORBIT_URL)).then(() => window.THREE);
  loadThree.p.catch(() => { loadThree.p = null; });
  return loadThree.p;
}

const WALL_H = 250, WALL_T = 10, DOOR_H = 210, SILL = 90, WIN_TOP = 210;
const DEFAULT_H = { bed: 45, desk: 75, wardrobe: 200, chair: 85, 'bedside-table': 55, bookcase: 180, dresser: 80, 'floor-lamp': 150, sofa: 85, armchair: 85, 'coffee-table': 42, 'tv-unit': 50 };
const OWNED_COLOUR = { bed: '#cfb18b', wardrobe: '#ece6da', desk: '#cfb18b', chair: '#8b7d6e', 'bedside-table': '#cfb18b', bookcase: '#e4ddcf', dresser: '#d9c4a4', 'floor-lamp': '#bdb6aa', sofa: '#9ba59e', armchair: '#a79b8d', 'coffee-table': '#cfb18b', 'tv-unit': '#e4ddcf' };
// Where the door's quarter-circle swing starts, per wall, for a CircleGeometry laid flat on the floor.
const SWING_START = { N: -Math.PI / 2, S: 0, W: -Math.PI / 2, E: Math.PI };
const BACK_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

function woodTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 300;
    while (x < 512) {
      const len = 220 + rnd() * 260;
      const l = 62 + rnd() * 10;
      g.fillStyle = `hsl(${30 + rnd() * 6}, ${34 + rnd() * 8}%, ${l}%)`;
      g.fillRect(x, r * 64, len, 64);
      g.strokeStyle = 'rgba(70,45,20,0.10)';
      for (let k = 0; k < 6; k++) {
        const y = r * 64 + 8 + rnd() * 48;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + 3, x + len * 0.6, y - 3, x + len, y); g.stroke();
      }
      g.fillStyle = 'rgba(60,40,20,0.35)';
      g.fillRect(x, r * 64, 2, 64);
      x += len;
    }
    g.fillStyle = 'rgba(60,40,20,0.30)';
    g.fillRect(0, r * 64, 512, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// One piece of furniture in local coordinates: width along x, depth along z, back edge at z = -ld/2.
function buildPiece(THREE, cat, lw, ld, h, colour, mats) {
  const g = new THREE.Group();
  const main = mats.get(colour, 0.75);
  const dark = mats.get('#2c2e30', 0.5);
  const linen = mats.get('#f2eee6', 0.95);
  const line = mats.get(shade(colour, -0.28), 0.8);
  const metal = mats.get('#b9b4aa', 0.35, 0.6);
  const B = (w, hh, d, x, y0, z, m) => {
    if (w <= 0 || hh <= 0 || d <= 0) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m || main);
    mesh.position.set(x, y0 + hh / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  };
  const C = (rt, rb, hh, x, y0, z, m, seg) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg || 20), m || main);
    mesh.position.set(x, y0 + hh / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  };
  const legs = (top, inset, w = 4) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(w, top, w, sx * (lw / 2 - inset), 0, sz * (ld / 2 - inset), main);
  };
  const backZ = -ld / 2;
  if (cat === 'bed') {
    B(lw, 26, ld, 0, 0, 0);
    B(lw - 6, 20, ld - 14, 0, 26, 4, linen);
    B(lw, Math.max(30, Math.min(h, 120)), 6, 0, 0, backZ + 3);
    const pw = lw > 115 ? (lw - 30) / 2 : lw - 20;
    if (lw > 115) { B(pw, 10, 30, -(pw / 2 + 5), 46, backZ + 26, linen); B(pw, 10, 30, pw / 2 + 5, 46, backZ + 26, linen); }
    else B(pw, 10, 30, 0, 46, backZ + 26, linen);
    const bl = ld * 0.56;
    B(lw - 2, 4, bl, 0, 46, ld / 2 - bl / 2 - 5, mats.get('#a9b8a8', 0.95));
  } else if (cat === 'sofa' || cat === 'armchair') {
    const seatH = 40, arm = Math.min(16, lw * 0.13);
    B(lw, seatH, ld, 0, 0, 0);
    B(lw, Math.max(20, h - seatH), 18, 0, seatH, backZ + 9);
    B(arm, 22, ld, -(lw / 2 - arm / 2), seatH, 0);
    B(arm, 22, ld, lw / 2 - arm / 2, seatH, 0);
    const n = cat === 'armchair' ? 1 : lw > 185 ? 3 : 2;
    const cw = (lw - 2 * arm) / n;
    for (let i = 0; i < n; i++) B(cw - 2, 10, ld - 22, -lw / 2 + arm + cw * i + cw / 2, seatH, 9, mats.get(shade(colour, 0.06), 0.95));
  } else if (cat === 'chair') {
    legs(44, 4, 3);
    B(lw, 5, ld, 0, 44, 0);
    B(lw, Math.max(20, h - 49), 4, 0, 49, backZ + 2);
  } else if (cat === 'desk') {
    B(lw, 4, ld, 0, h - 4, 0);
    legs(h - 4, 4);
    B(32, 1.5, 22, lw * 0.12, h, 4, dark);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(32, 21, 1.2), dark);
    scr.position.set(lw * 0.12, h + 11, -6);
    scr.rotation.x = -0.18;
    scr.castShadow = true;
    g.add(scr);
  } else if (cat === 'wardrobe') {
    B(lw, h, ld, 0, 0, 0);
    if (lw > 70) B(0.8, h - 12, 0.6, 0, 6, ld / 2 + 0.3, line);
    B(1.6, 20, 1.6, lw > 70 ? -4 : lw / 2 - 8, h * 0.42, ld / 2 + 1, metal);
    if (lw > 70) B(1.6, 20, 1.6, 4, h * 0.42, ld / 2 + 1, metal);
  } else if (cat === 'bookcase') {
    B(2, h, ld, -(lw / 2 - 1), 0, 0); B(2, h, ld, lw / 2 - 1, 0, 0);
    B(lw, 2, ld, 0, h - 2, 0); B(lw, 5, ld, 0, 0, 0); B(lw, h, 1, 0, 0, backZ + 0.5);
    const shelves = Math.max(2, Math.floor(h / 36));
    const gap = (h - 5) / shelves;
    const bookCols = ['#b65a3c', '#3f5f7a', '#d9b45a', '#5c7d5a', '#7a4b6b', '#e7e1d4'];
    let k = 0;
    for (let s = 0; s < shelves; s++) {
      const y = 5 + gap * s;
      if (s > 0) B(lw - 4, 2, ld - 2, 0, y, 1);
      let x = -lw / 2 + 4;
      while (x < lw / 2 - 12) {
        const bw = 2.5 + ((k * 7) % 4);
        const bh = Math.min(gap - 6, 18 + ((k * 5) % 9));
        B(bw, bh, ld - 8, x + bw / 2, y + 2, 2, mats.get(bookCols[k % bookCols.length], 0.9));
        x += bw + 0.6; k++;
        if (k % 9 === 0) x += 10;
      }
    }
  } else if (cat === 'dresser') {
    B(lw, h, ld, 0, 0, 0);
    for (let i = 1; i <= 3; i++) {
      const y = (h / 4) * i;
      B(lw - 6, 0.8, 0.6, 0, y, ld / 2 + 0.3, line);
      B(8, 1.2, 1.2, 0, y - h / 8, ld / 2 + 0.8, metal);
    }
    B(8, 1.2, 1.2, 0, h - h / 8, ld / 2 + 0.8, metal);
  } else if (cat === 'bedside-table') {
    B(lw, h, ld, 0, 0, 0);
    B(lw - 6, 0.8, 0.6, 0, h * 0.62, ld / 2 + 0.3, line);
    C(6, 6, 2, 0, h, 0, metal);
    C(0.8, 0.8, 16, 0, h + 2, 0, metal, 8);
    const shadeMat = mats.get('#f6ecd6', 0.9);
    shadeMat.emissive = new THREE.Color('#f3d9a6'); shadeMat.emissiveIntensity = 0.35;
    C(6, 9, 13, 0, h + 16, 0, shadeMat);
  } else if (cat === 'floor-lamp') {
    const m = Math.min(lw, ld);
    C(m * 0.32, m * 0.34, 3, 0, 0, 0, dark);
    C(1.2, 1.2, Math.max(40, h - 30), 0, 3, 0, metal, 8);
    const shadeMat = mats.get(colour === '#4a4a4a' ? '#f1e6cf' : shade(colour, 0.25), 0.9);
    shadeMat.emissive = new THREE.Color('#f5dcaa'); shadeMat.emissiveIntensity = 0.45;
    C(m * 0.26, m * 0.42, 28, 0, Math.max(43, h - 27), 0, shadeMat);
  } else if (cat === 'coffee-table') {
    B(lw, 4, ld, 0, h - 4, 0);
    legs(h - 4, 5);
    B(18, 3, 12, -lw * 0.15, h, 0, mats.get('#5c7d5a', 0.9));
  } else if (cat === 'tv-unit') {
    B(lw, h, ld, 0, 0, 0);
    B(lw - 6, 0.8, 0.6, 0, h * 0.5, ld / 2 + 0.3, line);
    const tw = Math.min(lw * 0.78, 140);
    B(14, 2, 10, 0, h, backZ + 10, dark);
    B(tw, tw * 0.56, 3, 0, h + 4, backZ + 10, dark);
  } else {
    B(lw, h, ld, 0, 0, 0);
  }
  return g;
}

function shade(hex, amt) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); gg = f(gg); b = f(b);
  return `#${((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1)}`;
}

function createScene(THREE, host, handlers) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8afa2, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6ea, 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const content = new THREE.Group();
  scene.add(content);
  const matCache = new Map();
  const mats = {
    get(colour, rough, metalness) {
      const key = `${colour}|${rough}|${metalness || 0}`;
      if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: rough == null ? 0.8 : rough, metalness: metalness || 0 }));
      return matCache.get(key);
    },
  };
  const floorTex = woodTexture(THREE);
  let transient = []; // materials made per build (not cached), disposed on the next build
  const temp = (m) => { transient.push(m); return m; };
  let walls = [];
  let pickables = [];
  let state = { W: 300, L: 350 };
  let camera = null, controls = null, mode = 'dollhouse', sideWall = 'N';

  function size() {
    const w = host.clientWidth || 600, h = host.clientHeight || 450;
    return { w, h };
  }

  function render() {
    if (!camera) return;
    if (mode === 'dollhouse' || mode === 'side') updateCutaway();
    renderer.render(scene, camera);
  }

  function updateCutaway() {
    const cx = state.W / 2, cz = state.L / 2;
    const v = new THREE.Vector3(camera.position.x - cx, 0, camera.position.z - cz);
    const len = v.length();
    if (len > 0) v.divideScalar(len);
    for (const w of walls) {
      const d = w.normal.x * v.x + w.normal.z * v.z;
      const hide = mode === 'side' ? w.side === OPPOSITE[sideWall] : d > 0.28;
      w.group.visible = !hide;
    }
  }

  function disposeTree(obj) {
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  function buildWalls(room) {
    const W = room.width_cm, L = room.length_cm;
    const wallMat = mats.get('#f5f3ee', 0.95);
    const topMat = mats.get('#dcd8cf', 0.9);
    const glass = temp(new THREE.MeshStandardMaterial({ color: 0xbfd6e8, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.1 }));
    const frameMat = mats.get('#ffffff', 0.6);
    const doorMat = mats.get('#f7f6f2', 0.7);
    const defs = {
      N: { len: W, normal: new THREE.Vector3(0, 0, -1) },
      S: { len: W, normal: new THREE.Vector3(0, 0, 1) },
      W: { len: L, normal: new THREE.Vector3(-1, 0, 0) },
      E: { len: L, normal: new THREE.Vector3(1, 0, 0) },
    };
    const place = (side, s0, s1, y0, y1, mat, thick, inset) => {
      const t = thick || WALL_T, off = inset == null ? -t / 2 : inset;
      const len = s1 - s0, h = y1 - y0;
      if (len <= 0 || h <= 0) return null;
      const horiz = side === 'N' || side === 'S';
      const geo = horiz ? new THREE.BoxGeometry(len, h, t) : new THREE.BoxGeometry(t, h, len);
      const m = new THREE.Mesh(geo, mat);
      const sm = (s0 + s1) / 2, ym = (y0 + y1) / 2;
      if (side === 'N') m.position.set(sm, ym, off);
      if (side === 'S') m.position.set(sm, ym, L - off);
      if (side === 'W') m.position.set(off, ym, sm);
      if (side === 'E') m.position.set(W - off, ym, sm);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    walls = [];
    for (const side of ['N', 'E', 'S', 'W']) {
      const grp = new THREE.Group();
      const def = defs[side];
      const horiz = side === 'N' || side === 'S';
      const start = horiz ? -WALL_T : 0, end = horiz ? def.len + WALL_T : def.len;
      const openings = [];
      if (room.door.wall === side) openings.push({ s0: room.door.offset_cm, s1: room.door.offset_cm + room.door.width_cm, y0: 0, y1: DOOR_H, door: true });
      for (const win of room.windows || []) if (win.wall === side) openings.push({ s0: win.offset_cm, s1: win.offset_cm + win.width_cm, y0: SILL, y1: WIN_TOP });
      openings.sort((a, b) => a.s0 - b.s0);
      let cur = start;
      for (const o of openings) {
        const seg = place(side, cur, o.s0, 0, WALL_H, wallMat); if (seg) grp.add(seg);
        const below = place(side, o.s0, o.s1, 0, o.y0, wallMat); if (below) grp.add(below);
        const above = place(side, o.s0, o.s1, o.y1, WALL_H, wallMat); if (above) grp.add(above);
        if (o.door) {
          const leaf = place(side, o.s0 + 2, o.s1 - 2, 0, o.y1 - 2, doorMat, 4); if (leaf) grp.add(leaf);
          for (const [a, b] of [[o.s0 - 6, o.s0], [o.s1, o.s1 + 6]]) { const jamb = place(side, a, b, 0, o.y1 + 6, frameMat, 13, -WALL_T / 2 + 1.5); if (jamb) grp.add(jamb); }
          const head = place(side, o.s0 - 6, o.s1 + 6, o.y1, o.y1 + 6, frameMat, 13, -WALL_T / 2 + 1.5); if (head) grp.add(head);
          const knob = place(side, o.s1 - 12, o.s1 - 6, 98, 104, mats.get('#b9b4aa', 0.35, 0.6), 6, 1); if (knob) grp.add(knob);
        } else {
          const pane = place(side, o.s0, o.s1, o.y0, o.y1, glass, 1.5); if (pane) { pane.castShadow = false; grp.add(pane); }
          const mid = (o.s0 + o.s1) / 2;
          const mul = place(side, mid - 2, mid + 2, o.y0, o.y1, frameMat, 4); if (mul) grp.add(mul);
          const sill = place(side, o.s0 - 4, o.s1 + 4, o.y0 - 3, o.y0, frameMat, 16, -2); if (sill) grp.add(sill);
        }
        cur = o.s1;
      }
      const last = place(side, cur, end, 0, WALL_H, wallMat); if (last) grp.add(last);
      const cap = place(side, start, end, WALL_H, WALL_H + 1, topMat); if (cap) grp.add(cap);
      walls.push({ side, normal: def.normal, group: grp });
      content.add(grp);
    }
    // the door's swing, drawn faintly on the floor like the plan's arc, so the clear zone reads in 3D too
    const { wall, offset_cm: o, width_cm: dw } = room.door;
    const swing = new THREE.Mesh(new THREE.CircleGeometry(dw, 28, SWING_START[wall], Math.PI / 2),
      temp(new THREE.MeshBasicMaterial({ color: 0x8a948f, transparent: true, opacity: 0.16, depthWrite: false })));
    swing.rotation.x = -Math.PI / 2;
    const hinge = { N: [o, 0], S: [o, L], W: [0, o], E: [W, o] }[wall];
    swing.position.set(hinge[0], 0.4, hinge[1]);
    content.add(swing);
  }

  function build(p) {
    const { room } = p;
    disposeTree(content);
    content.clear();
    transient.forEach((m) => m.dispose());
    transient = [];
    pickables = [];
    state = { W: room.width_cm, L: room.length_cm };
    const W = room.width_cm, L = room.length_cm;
    floorTex.repeat.set(W / 160, L / 160);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), temp(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, L / 2);
    floor.receiveShadow = true;
    content.add(floor);
    buildWalls(room);
    const accent = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6a49b3');
    const filledSlots = new Set((p.products || []).map((x) => x.slot_id));
    for (const s of p.slots || []) {
      if (filledSlots.has(s.id)) continue;
      const sel = s.id === p.selectedSlotId;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), temp(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: sel ? 0.45 : 0.22, depthWrite: false })));
      pl.rotation.x = -Math.PI / 2;
      pl.position.set(s.x + s.w / 2, 0.6, s.y + s.d / 2);
      pl.userData = { slot_id: s.id };
      content.add(pl);
      pickables.push(pl);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.w, 1, s.d)), temp(new THREE.LineBasicMaterial({ color: accent })));
      edges.position.set(s.x + s.w / 2, 0.8, s.y + s.d / 2);
      content.add(edges);
    }
    const addPiece = (r, back, cat, h, colour, id, kind) => {
      const horizBack = back === 'N' || back === 'S';
      const lw = horizBack ? r.w : r.d, ld = horizBack ? r.d : r.w;
      const piece = buildPiece(THREE, cat, lw, ld, h, colour, mats);
      piece.position.set(r.x + r.w / 2, 0, r.y + r.d / 2);
      piece.rotation.y = BACK_ROT[back] || 0;
      piece.traverse((o) => { o.userData = { [kind]: id }; });
      content.add(piece);
      pickables.push(piece);
      if ((kind === 'ref_id' && id === p.selectedId) || (kind === 'slot_id' && id === p.selectedSlotId)) {
        const helper = new THREE.BoxHelper(piece, accent);
        temp(helper.material);
        content.add(helper);
      }
    };
    const er = { width_cm: W, length_cm: L, door: room.door, windows: room.windows || [] };
    for (const it of p.placements || []) addPiece(it, backOf(it, er, p.placements), it.category, DEFAULT_H[it.category] || 60, OWNED_COLOUR[it.category] || '#cfb18b', it.ref_id, 'ref_id');
    for (const pr of p.products || []) addPiece(pr.rect, pr.back, pr.category, pr.height || DEFAULT_H[pr.category] || 60, COLOUR_HEX[pr.colour] || '#cccccc', pr.slot_id, 'slot_id');
    const span = Math.max(W, L);
    sun.position.set(W * 0.85, span * 1.6, L * 1.05);
    sun.target.position.set(W / 2, 0, L / 2);
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 10; sc.far = span * 5;
    sc.updateProjectionMatrix();
    render();
  }

  // Orthographic views frame the room (top) or one wall (side) with a margin, at any aspect ratio.
  function fitOrtho() {
    const { w, h } = size();
    const aspect = w / h;
    const W = state.W, L = state.L;
    const viewW = mode === 'top' ? W + 80 : (sideWall === 'N' || sideWall === 'S' ? W : L) + 80;
    const viewH = mode === 'top' ? L + 80 : WALL_H + 70;
    let hw = viewW / 2, hh = viewH / 2;
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
  }

  function setView(m, side) {
    mode = m; sideWall = side || sideWall;
    const { w, h } = size();
    const W = state.W, L = state.L, span = Math.max(W, L);
    const target = new THREE.Vector3(W / 2, mode === 'top' ? 0 : 70, L / 2);
    if (controls) { controls.dispose(); controls = null; }
    if (mode === 'dollhouse') {
      camera = new THREE.PerspectiveCamera(38, w / h, 5, 20000);
      const r = span * 2.05, phi = 0.92, theta = 0.62;
      camera.position.set(target.x + r * Math.sin(phi) * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * Math.sin(phi) * Math.cos(theta));
    } else {
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
      fitOrtho();
      if (mode === 'top') {
        camera.up.set(0, 0, -1);
        camera.position.set(W / 2, 2000, L / 2);
      } else {
        target.y = WALL_H / 2;
        const dirs = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };
        const [dx, dz] = dirs[sideWall];
        camera.position.set(W / 2 + dx * 3000, WALL_H / 2, L / 2 + dz * 3000);
      }
    }
    camera.lookAt(target);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = false;
    controls.enableRotate = mode === 'dollhouse';
    controls.screenSpacePanning = true;
    if (mode === 'dollhouse') {
      controls.maxPolarAngle = Math.PI * 0.47; // never below the floor
      controls.minDistance = span * 0.5;
      controls.maxDistance = span * 4;
    } else {
      controls.minZoom = 0.5;
      controls.maxZoom = 4;
    }
    controls.update();
    controls.addEventListener('change', render);
    resize();
  }

  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);
    if (camera && camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (camera && camera.isOrthographicCamera) fitOrtho();
    render();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(host);

  function zoom(factor) {
    if (!camera || !controls) return;
    if (camera.isPerspectiveCamera) {
      const off = camera.position.clone().sub(controls.target);
      const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() / factor));
      camera.position.copy(controls.target).add(off.setLength(len));
    } else {
      camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom, camera.zoom * factor));
      camera.updateProjectionMatrix();
    }
    controls.update();
    render();
  }

  // tap to select: a pointer that goes down and up without moving picks what's under it
  let down = null;
  const ray = new THREE.Raycaster();
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hits = ray.intersectObjects(pickables, true);
    const hit = hits.find((x) => x.object.userData && (x.object.userData.ref_id || x.object.userData.slot_id));
    if (!hit) return;
    const d = hit.object.userData;
    if (d.ref_id && handlers.current.onPickItem) handlers.current.onPickItem(d.ref_id);
    if (d.slot_id && handlers.current.onPickSlot) handlers.current.onPickSlot(d.slot_id);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  return {
    build, setView, render, zoom,
    dispose() {
      if (ro) ro.disconnect();
      if (controls) controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      disposeTree(scene);
      matCache.forEach((m) => m.dispose());
      transient.forEach((m) => m.dispose());
      floorTex.dispose();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

const VIEW_SIDES = [['N', 'North wall'], ['E', 'East wall'], ['S', 'South wall'], ['W', 'West wall']];

function Room3D({ room, placements, slots, products, selectedId, selectedSlotId, onPickItem, onPickSlot, hint }) {
  const host = useRef(null);
  const eng = useRef(null);
  const handlers = useRef({});
  handlers.current = { onPickItem, onPickSlot };
  const [status, setStatus] = useState('loading');
  const [view, setView] = useState('dollhouse');
  const [side, setSide] = useState('N');
  useEffect(() => {
    let alive = true;
    loadThree().then((THREE) => {
      if (!alive || !host.current) return;
      try { eng.current = createScene(THREE, host.current, handlers); setStatus('ready'); } catch (e) { setStatus('error'); }
    }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; if (eng.current) eng.current.dispose(); eng.current = null; };
  }, []);
  // Rebuild only when what's drawn changes, not on every parent render.
  const er = { width_cm: room.width_cm, length_cm: room.length_cm, door: room.door, windows: room.windows || [] };
  const sig = JSON.stringify([er, placements || [], slots || [], products || [], selectedId || null, selectedSlotId || null]);
  const latest = useRef(null);
  latest.current = { room: er, placements, slots, products, selectedId, selectedSlotId };
  useEffect(() => {
    if (status !== 'ready' || !eng.current) return;
    eng.current.build(latest.current);
  }, [status, sig]);
  useEffect(() => {
    if (status !== 'ready' || !eng.current) return;
    eng.current.setView(view, side);
  }, [status, view, side, room.width_cm, room.length_cm]);
  const names = (placements || []).map((p) => p.name);
  const added = (products || []).map((p) => p.title);
  const label = `3D view of ${room.name || 'the room'}, ${room.width_cm} by ${room.length_cm} cm${names.length ? `, with ${names.join(', ')}` : ''}${added.length ? `, plus ${added.join(', ')}` : ''}.`;
  return html`<div class="view3d-wrap">
    <div class="view3d" ref=${host} role="img" aria-label=${label}>
      ${status === 'loading' && html`<div class="view3d-msg">Loading 3D view…</div>`}
      ${status === 'error' && html`<div class="view3d-msg">The 3D view couldn't load here. The plan view still works.</div>`}
      ${status === 'ready' && html`<div class="view3d-zoom" role="group" aria-label="Zoom">
        <button type="button" class="icon-btn" aria-label="Zoom in" onClick=${() => eng.current && eng.current.zoom(1.25)}>+</button>
        <button type="button" class="icon-btn" aria-label="Zoom out" onClick=${() => eng.current && eng.current.zoom(0.8)}>−</button>
      </div>`}
    </div>
    <div class="view3d-bar" role="toolbar" aria-label="3D view controls">
      <${Seg} label="Camera" value=${view} onChange=${setView} options=${[['dollhouse', 'Dollhouse'], ['top', 'Top view'], ['side', 'Side view']]} />
      ${view === 'side' && html`<label class="sr-only" for="side3d">Wall to look at</label><select id="side3d" class="select side-select" value=${side} onChange=${(e) => setSide(e.target.value)}>${VIEW_SIDES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>`}
      <span class="tiny faint">${view === 'dollhouse' ? 'Drag to orbit, scroll or pinch to zoom.' : 'Scroll to zoom, right-drag to pan.'}${hint ? ` ${hint}` : ''}</span>
    </div>
  </div>`;
}

// The plan and the 3D room behind one switch; the choice is remembered for this visit.
function PlanOr3D(props) {
  const [mode, setMode] = useState(() => { try { return sessionStorage.getItem('removaters.view') || '2d'; } catch (e) { return '2d'; } });
  const pick = (m) => { setMode(m); try { sessionStorage.setItem('removaters.view', m); } catch (e) { /* optional */ } };
  return html`<div class="stack" style="gap:10px">
    <div class="spread view-switch">
      <${Seg} label="View" value=${mode} onChange=${pick} options=${[['2d', 'Plan'], ['3d', '3D room']]} />
      ${props.extra || null}
    </div>
    ${mode === '3d'
      ? html`<${Room3D} room=${props.room} placements=${props.placements} slots=${props.slots} products=${props.products} selectedId=${props.selectedId} selectedSlotId=${props.selectedSlotId}
          onPickItem=${props.onSelect} onPickSlot=${props.onSlotClick} hint=${props.hint3d} />`
      : html`<${Plan} ...${props} />`}
  </div>`;
}
