/* 3D product pictures. One hidden three.js renderer draws each piece once (the same furniture models as the
   3D room view) into a cached image for cards and lists, and Product3D is a small interactive turntable for
   the preview dialog. Falls back to the 2D plan symbol when WebGL or three.js is unavailable. */
const OPTION_COLOURS = [
  ['whitewash', '#e9e4da'], ['ivory', '#efe9dd'], ['boucle', '#efe9dd'], ['white', '#f2f2ee'], ['charcoal', '#4a4a4a'], ['black', '#3f3f3f'],
  ['smoked', '#8a6a4c'], ['walnut', '#7a5a3e'], ['dark', '#6f553f'], ['oak', '#d9be95'], ['natural', '#d9be95'], ['oiled', '#cfae80'],
  ['grey', '#aab0b2'], ['navy', '#3e4f6e'], ['indigo', '#3f4a7a'], ['forest', '#5d7a63'], ['green', '#86a88d'], ['linen', '#e3d6be'],
  ['sand', '#e3d6be'], ['red', '#a84432'], ['ochre', '#c98b45'], ['terracotta', '#cf8466'], ['blue', '#7c95b8'],
];
const MATERIAL_FINISH = {
  metal: [0.35, 0.65], glass: [0.12, 0.15], leather: [0.42, 0], rattan: [0.92, 0], fabric: [0.96, 0],
  'solid wood': [0.68, 0], 'engineered wood': [0.55, 0],
};

// The colour an option implies, read from its name ("Smoked oak", "Velvet forest"), or null.
function optionColour(product, optionId) {
  const o = (product.options || []).find((x) => x.id === optionId);
  if (!o) return null;
  const name = String(o.name || '').toLowerCase();
  const hit = OPTION_COLOURS.find(([k]) => name.includes(k));
  return hit ? hit[1] : null;
}

function artSpec(product, optionId) {
  return {
    category: product.category,
    w: Math.max(10, product.width_cm || 60), d: Math.max(10, product.depth_cm || 60),
    h: Math.max(10, product.height_cm || DEFAULT_H[product.category] || 60),
    colour: optionColour(product, optionId) || COLOUR_HEX[product.colour] || OWNED_COLOUR[product.category] || '#cfb18b',
    material: product.material || '',
  };
}
const artKey = (s) => [s.category, s.w, s.d, s.h, s.colour, s.material].join('|');

// Materials for one piece: the main colour picks up the product's material (metal shines, fabric is matte).
function materialSet(THREE, cache, spec) {
  const finish = MATERIAL_FINISH[spec.material];
  return {
    get(colour, rough, metalness) {
      const r = finish && colour === spec.colour ? finish[0] : rough;
      const m = finish && colour === spec.colour ? finish[1] : metalness;
      const key = `${colour}|${r}|${m || 0}`;
      // Hex colours are sRGB; three.js lights in linear space, so convert or everything renders washed out.
      if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(colour).convertSRGBToLinear(), roughness: r == null ? 0.8 : r, metalness: m || 0 }));
      return cache.get(key);
    },
  };
}

// A small studio: soft sky light, a key light with shadows, and a floor that only shows the shadow.
function studio(THREE, renderer) {
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f877b, 1.0));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.25);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  scene.add(key);
  scene.add(key.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const holder = new THREE.Group();
  scene.add(holder);
  const camera = new THREE.PerspectiveCamera(28, 4 / 3, 1, 10000);
  // Puts a piece in the middle of the frame, seen from the front-right, a little above.
  const frame = (piece, aspect) => {
    holder.children.slice().forEach((c) => { holder.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); });
    holder.add(piece);
    const box = new THREE.Box3().setFromObject(piece);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(20, size.length() / 2);
    camera.aspect = aspect;
    const vfov = (camera.fov * Math.PI) / 180;
    const fit = Math.min(vfov, 2 * Math.atan(Math.tan(vfov / 2) * aspect));
    const dist = (radius / Math.sin(fit / 2)) * 1.02;
    const dir = new THREE.Vector3(0.72, 0.5, 1).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    camera.near = Math.max(0.5, dist / 60);
    camera.far = dist * 6;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    floor.scale.set(radius * 8, radius * 8, 1);
    floor.position.set(center.x, 0, center.z);
    key.position.set(center.x + radius * 1.4, radius * 3.2, center.z + radius * 2.2);
    key.target.position.copy(center);
    const sc = key.shadow.camera;
    sc.left = -radius * 1.6; sc.right = radius * 1.6; sc.top = radius * 1.6; sc.bottom = -radius * 1.6;
    sc.near = 1; sc.far = radius * 10;
    sc.updateProjectionMatrix();
    return center;
  };
  return { scene, camera, frame };
}

const Art3D = (() => {
  const cache = new Map();
  let ctx = null;
  let failed = false;
  let chain = Promise.resolve();
  const W = 320, H = 240;

  function init(THREE) {
    if (ctx) return ctx;
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    ctx = { THREE, renderer, ...studio(THREE, renderer), mats: new Map() };
    return ctx;
  }

  function draw(spec) {
    const { THREE, renderer, scene, camera, frame, mats } = ctx;
    const piece = buildPiece(THREE, spec.category, spec.w, spec.d, spec.h, spec.colour, materialSet(THREE, mats, spec));
    piece.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    frame(piece, W / H);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  return {
    key: artKey,
    cached: (spec) => cache.get(artKey(spec)) || null,
    get failed() { return failed; },
    // Renders one at a time, yielding between pictures so scrolling stays smooth.
    render(spec) {
      const k = artKey(spec);
      if (cache.has(k)) return Promise.resolve(cache.get(k));
      if (failed) return Promise.reject(new Error('3D unavailable'));
      const job = chain.then(() => new Promise((resolve) => setTimeout(resolve, 0))).then(() => {
        if (cache.has(k)) return cache.get(k);
        return loadThree().then((THREE) => {
          init(THREE);
          const url = draw(spec);
          cache.set(k, url);
          return url;
        });
      });
      chain = job.catch(() => { failed = true; });
      return job;
    },
  };
})();

// A product (or one of your own pieces) as a 3D picture; the 2D symbol stands in while it draws or if 3D can't run.
function Art({ spec, size, alt, photo }) {
  const k = artKey(spec);
  const [src, setSrc] = useState(() => Art3D.cached(spec));
  const [broken, setBroken] = useState(null);
  const usePhoto = photo && broken !== photo;
  useEffect(() => {
    let alive = true;
    const have = Art3D.cached(spec);
    setSrc(have);
    if (!have && !usePhoto) Art3D.render(spec).then((u) => { if (alive) setSrc(u); }).catch(() => { if (alive) setSrc('fail'); });
    return () => { alive = false; };
  }, [k, usePhoto]);
  const w = size || 96, h = Math.round(w * 0.75);
  // A photo that won't load falls back to the 3D picture.
  if (usePhoto) return html`<img class="art photo" src=${photo} width=${w} height=${h} alt=${alt} loading="lazy" onError=${() => setBroken(photo)} />`;
  if (src && src !== 'fail') return html`<img class="art" src=${src} width=${w} height=${h} alt=${alt} />`;
  return html`<span class=${`art art-fallback ${src === 'fail' ? '' : 'loading'}`} style=${`width:${w}px;height:${h}px`} role="img" aria-label=${alt}>
    <${SymbolIcon} category=${spec.category} w=${spec.w} d=${spec.d} size=${Math.round(h * 0.8)} /></span>`;
}

function ProductArt({ product, optionId, size }) {
  return html`<${Art} spec=${artSpec(product, optionId)} size=${size} photo=${product.image_url || null} alt=${`${product.title}: 3D picture, ${product.width_cm} by ${product.depth_cm} by ${product.height_cm} cm`} />`;
}

function PieceArt({ category, w, d, h, size }) {
  const spec = { category, w: Math.max(10, w || 60), d: Math.max(10, d || 60), h: h || DEFAULT_H[category] || 60, colour: OWNED_COLOUR[category] || '#cfb18b', material: '' };
  return html`<${Art} spec=${spec} size=${size} alt=${`${Engine.label(category)}, ${spec.w} by ${spec.d} cm`} />`;
}

// Interactive turntable for one product: drag to turn it, scroll or pinch to zoom.
function createProductViewer(THREE, host, spec) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
  const { scene, camera, frame } = studio(THREE, renderer);
  const mats = new Map();
  const piece = buildPiece(THREE, spec.category, spec.w, spec.d, spec.h, spec.colour, materialSet(THREE, mats, spec));
  const size = () => ({ w: host.clientWidth || 400, h: host.clientHeight || 300 });
  const { w, h } = size();
  renderer.setSize(w, h, false);
  const center = frame(piece, w / h);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  const dist = camera.position.distanceTo(center);
  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 2.2;
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !still;
  controls.autoRotateSpeed = 1.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  controls.update();
  let raf = 0, alive = true;
  const loop = () => { if (!alive) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    const s = size();
    renderer.setSize(s.w, s.h, false);
    camera.aspect = s.w / s.h;
    camera.updateProjectionMatrix();
  }) : null;
  if (ro) ro.observe(host);
  return {
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

function Product3D({ product, optionId }) {
  const host = useRef(null);
  const [status, setStatus] = useState('loading');
  const spec = artSpec(product, optionId);
  const k = artKey(spec);
  useEffect(() => {
    let alive = true, eng = null;
    setStatus('loading');
    loadThree().then((THREE) => {
      if (!alive || !host.current) return;
      try { eng = createProductViewer(THREE, host.current, spec); setStatus('ready'); } catch (e) { setStatus('error'); }
    }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; if (eng) eng.dispose(); };
  }, [k]);
  return html`<div class="product3d" ref=${host} role="img" aria-label=${`3D model of ${product.title}, ${product.width_cm} by ${product.depth_cm} by ${product.height_cm} cm. Drag to turn it.`}>
    ${status === 'loading' && html`<div class="view3d-msg">Loading 3D model…</div>`}
    ${status === 'error' && html`<div class="view3d-msg"><${ProductArt} product=${product} optionId=${optionId} size=${220} /></div>`}
  </div>`;
}
