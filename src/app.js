/* Removaters app: screens and flows. */
const E = Engine;
const CAT = Catalog;

/* ===================== helpers ===================== */
const money = (cents) => {
  const v = (cents || 0) / 100;
  return `$${v.toLocaleString('en-AU', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const WALLS = [['N', 'Top wall (north)'], ['E', 'Right wall (east)'], ['S', 'Bottom wall (south)'], ['W', 'Left wall (west)']];
const engineRoom = (r) => ({ type: r.type, width_cm: r.width_cm, length_cm: r.length_cm, door: r.door, windows: r.windows || [] });
const roomSig = (r) => JSON.stringify([r.type, r.width_cm, r.length_cm, r.door, r.windows || [], r.goal, (r.items || []).map((i) => [i.id, i.category, i.width_cm, i.depth_cm, i.keep])]);
const GOALS = {
  arrange: { name: 'Arrange only', text: 'Lay out what I own. Show free space I could shop for.' },
  replace: { name: 'Replace marked pieces', text: 'Keep the spots of pieces I marked Replace and find better ones that fit.' },
  fill: { name: 'Fill the room', text: 'Arrange what I own, then find the essentials this room is missing.' },
};
const PERSONAS = { renter: 'Renter', homeowner: 'Homeowner' };
const toInt = (v) => (String(v).trim() === '' ? NaN : Number(v));
const isWhole = (n) => Number.isInteger(n);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// Only http(s) links are ever rendered, so a pasted "javascript:" link can't run.
function safeUrl(u) {
  if (!u) return null;
  try { const url = new URL(String(u).trim()); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch (e) { return null; }
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'website'; } };

/* Claude inside the page (the artifact's sample capability). Every AI feature checks for it first and
   falls back or hides when it isn't there, for example when the page is hosted outside Claude. */
const AI = (() => {
  let got = null;
  let off = false;
  const subs = new Set();
  const HIDE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  const get = () => {
    if (!got) {
      got = (window.claude && typeof window.claude.use === 'function'
        ? Promise.resolve().then(() => window.claude.use('sample'))
        : Promise.resolve(null)).catch(() => null);
    }
    return got;
  };
  const call = async (kind, input, opts) => {
    const s = await get();
    if (!s || off) throw { code: 'unavailable' };
    try { return kind === 'json' ? await s.json(input, opts) : await s(input, opts); } catch (e) {
      if (e && HIDE.includes(e.code)) { off = true; subs.forEach((f) => f()); }
      throw e;
    }
  };
  const COPY = {
    not_granted: "Claude isn't allowed on this page, so this feature is off.",
    sampling_disabled: "Claude isn't available on this account.",
    rate_limited: "Claude is busy or you've reached a usage limit. Try again in a minute.",
    session_expired: 'Sign in to Claude again, then try again.',
    image_rejected: "Claude couldn't read that image. Try a JPG or PNG.",
    refused: 'Claude declined this one. Try a different photo or text.',
    invalid_json: 'The answer came back garbled. Try again.',
    empty_completion: "Claude didn't answer. Try again with less text.",
    prompt_too_large: "That's too much text. Paste just the product details.",
    unavailable: "Claude isn't available here.",
  };
  return {
    get,
    available: async () => Boolean(await get()) && !off,
    images: async () => {
      const s = await get();
      if (!s || off) return false;
      try { const l = await s.limits(); return Boolean(l && l.images); } catch (e) { return false; }
    },
    json: (input, opts) => call('json', input, opts),
    text: (input, opts) => call('text', input, opts),
    message: (e) => COPY[e && e.code] || "Claude couldn't finish that. Try again.",
    isOff: () => off,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
})();

// null while checking, then true or false. With `images`, true only when photos can be sent too.
function useAI(images) {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = () => (images ? AI.images() : AI.available()).then((v) => { if (alive) setOk(Boolean(v) && !AI.isOff()); });
    check();
    const off = AI.subscribe(check);
    return () => { alive = false; off(); };
  }, [images]);
  return ok;
}

/* Reading furniture facts out of free text: product pages, CSV cells and AI answers all go through these. */
const CAT_WORDS = [
  ['bedside-table', /\b(bedside|night ?stands?|nightstands?)\b/i],
  ['coffee-table', /\bcoffee tables?\b/i],
  ['tv-unit', /\b(tv|television|entertainment|media) (units?|cabinets?|consoles?|stands?)\b/i],
  ['chair', /\b(desk|office|dining|task|side|study|kitchen) chairs?\b/i],
  ['floor-lamp', /\b(floor lamps?|lamps?)\b/i],
  ['bookcase', /\b(bookcases?|bookshel(f|ves)|book shel(f|ves)|shelving|shelves|shelf|ladder shelf)\b/i],
  ['wardrobe', /\b(wardrobes?|armoires?|closets?|robes?)\b/i],
  ['dresser', /\b(dressers?|chests? of drawers|tallboys?|lowboys?)\b/i],
  ['armchair', /\b(armchairs?|accent chairs?|lounge chairs?|occasional chairs?)\b/i],
  ['sofa', /\b(sofas?|couch(es)?|settees?|lounges?)\b/i],
  ['desk', /\b(desks?|workstations?)\b/i],
  ['chair', /\b(chairs?|stools?)\b/i],
  ['bed', /\b(bed ?frames?|beds?|bedheads?|ensembles?)\b/i],
];
const COLOUR_WORDS = [
  ['dark wood', /\b(dark wood|walnut|espresso|mahogany|dark oak|smoked)\b/i],
  ['natural wood', /\b(natural|oak|ash|pine|timber|light wood|blonde|spotted gum|blackbutt|acacia|mango|teak|bamboo|birch|beech)\b/i],
  ['white', /\b(white|ivory|snow)\b/i],
  ['black', /\b(black|charcoal|ebony)\b/i],
  ['grey', /\b(grey|gray|slate|stone)\b/i],
  ['beige', /\b(beige|cream|oatmeal|sand|linen|natural fabric|ecru)\b/i],
  ['green', /\b(green|olive|sage|forest)\b/i],
  ['blue', /\b(blue|navy|denim|indigo)\b/i],
  ['terracotta', /\b(terracotta|rust|clay|burnt orange)\b/i],
];
const MATERIAL_WORDS = [
  ['engineered wood', /\b(mdf|particle ?board|engineered|veneer(ed)?|laminate|melamine|plywood)\b/i],
  ['rattan', /\b(rattan|cane|wicker|seagrass)\b/i],
  ['leather', /\b(leather)\b/i],
  ['glass', /\b(glass)\b/i],
  ['metal', /\b(steel|metal|iron|aluminium|aluminum|brass|chrome)\b/i],
  ['fabric', /\b(fabric|linen|boucle|bouclé|velvet|upholster(ed|y)|cotton|wool)\b/i],
  ['solid wood', /\b(solid|timber|oak|ash|pine|gum|walnut|acacia|mango|teak|wood|bamboo|blackbutt|birch|beech)\b/i],
];
const STYLE_WORDS = [
  ['Scandi', /\b(scandi|scandinavian|nordic)\b/i],
  ['Japandi', /\bjapandi\b/i],
  ['Industrial', /\bindustrial\b/i],
  ['Mid-century', /\bmid[- ]?century\b/i],
  ['Coastal', /\b(coastal|hamptons|beach)\b/i],
  ['Boho', /\b(boho|bohemian)\b/i],
  ['Minimal', /\b(minimal|minimalist|simple lines)\b/i],
];
const firstMatch = (list, text) => { for (const [v, re] of list) if (re.test(text)) return v; return ''; };
const normCategory = (v) => {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return '';
  const dashed = t.replace(/\s+/g, '-');
  if (E.CATEGORIES.includes(dashed)) return dashed;
  const byLabel = E.CATEGORIES.find((c) => E.label(c).toLowerCase() === t);
  return byLabel || firstMatch(CAT_WORDS, t);
};
const normColour = (v) => { const t = String(v || '').trim().toLowerCase(); return CAT.COLOURS.includes(t) ? t : firstMatch(COLOUR_WORDS, t); };
const normMaterial = (v) => { const t = String(v || '').trim().toLowerCase(); return CAT.MATERIALS.includes(t) ? t : firstMatch(MATERIAL_WORDS, t); };
const normStyles = (v) => {
  const parts = Array.isArray(v) ? v : String(v || '').split(/[;|/,]+/);
  const out = [];
  for (const raw of parts) {
    const t = String(raw).trim();
    const hit = CAT.STYLES.find((s) => s.toLowerCase() === t.toLowerCase()) || firstMatch(STYLE_WORDS, t);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out.slice(0, 3);
};
// Each size is its own listing, so size-like options are never kept.
const SIZE_OPTION = /\b(\d+(\.\d+)?\s?(cm|mm|m)\b|small|medium|large|x-?large|king|queen|double|single|size|wide|long|seater)\b/i;
const toCm = (n, unit) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return NaN;
  const u = String(unit || 'cm').toLowerCase();
  return Math.round(u === 'mm' ? v / 10 : u === 'm' ? v * 100 : v);
};

// A rough first pass over pasted product-page text. Claude does better, but this works everywhere.
function parseListingText(text) {
  const src = String(text || '').slice(0, 6000);
  const lines = src.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = {};
  const title = lines.find((l) => l.length >= 3 && l.length <= 80 && !/\$|\bcm\b|\bmm\b/i.test(l));
  if (title) out.title = title.replace(/\s+/g, ' ');
  out.category = firstMatch(CAT_WORDS, out.title || '') || firstMatch(CAT_WORDS, src);
  const num = '(\\d{1,4}(?:\\.\\d+)?)';
  const grab = (re) => { const m = src.match(re); return m ? toCm(m[1], m[2]) : NaN; };
  let w = grab(new RegExp(`\\b(?:W|Width)\\s*[:=]?\\s*${num}\\s*(cm|mm|m)?\\b`, 'i'));
  let d = grab(new RegExp(`\\b(?:D|Depth)\\s*[:=]?\\s*${num}\\s*(cm|mm|m)?\\b`, 'i'));
  let h = grab(new RegExp(`\\b(?:H|Height)\\s*[:=]?\\s*${num}\\s*(cm|mm|m)?\\b`, 'i'));
  if (!w) w = grab(new RegExp(`${num}\\s*(cm|mm|m)?\\s*(?:wide|w)\\b`, 'i'));
  if (!d) d = grab(new RegExp(`${num}\\s*(cm|mm|m)?\\s*(?:deep|d)\\b`, 'i'));
  if (!h) h = grab(new RegExp(`${num}\\s*(cm|mm|m)?\\s*(?:high|tall|h)\\b`, 'i'));
  if (!(w && d && h)) {
    const m = src.match(new RegExp(`${num}\\s*(?:cm|mm)?\\s*[x×]\\s*${num}\\s*(?:cm|mm)?\\s*[x×]\\s*${num}\\s*(cm|mm)?`, 'i'));
    if (m) { w = toCm(m[1], m[4]); d = toCm(m[2], m[4]); h = toCm(m[3], m[4]); }
  }
  if (w > 0) out.width_cm = w;
  if (d > 0) out.depth_cm = d;
  if (h > 0) out.height_cm = h;
  const price = src.match(/(?:^|[^+\d])\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?/);
  if (price) out.price = Number(price[1].replace(/,/g, '') + (price[2] || ''));
  const line = (re) => { const m = src.match(re); return m ? m[1] : ''; };
  out.colour = normColour(line(/colou?r\s*[:\-]\s*([^\n]+)/i)) || firstMatch(COLOUR_WORDS, src);
  out.material = normMaterial(line(/materials?\s*[:\-]\s*([^\n]+)/i)) || firstMatch(MATERIAL_WORDS, src);
  out.styles = normStyles(src.match(/\b(scandi\w*|nordic|japandi|industrial|mid[- ]?century|coastal|hamptons|boho\w*|minimal\w*)\b/gi) || []);
  out.renter_friendly = !(/\b(wall[- ]?mount\w*|must be (fixed|screwed)|fix(ed)? to (the )?wall|drilling required)\b/i.test(src) && !/\b(no drilling|without drilling|free-?standing)\b/i.test(src));
  return out;
}

// What a listing draft needs before it can go live; also used for every CSV row.
function listingProblems(d) {
  const out = [];
  if (!String(d.title || '').trim()) out.push('Add a title.');
  if (!E.CATEGORIES.includes(d.category)) out.push('Pick a type of furniture.');
  for (const [n, v] of [['Width', d.width_cm], ['Depth', d.depth_cm], ['Height', d.height_cm]]) if (!isWhole(v) || v < 1 || v > 400) out.push(`${n} must be a whole number from 1 to 400 cm.`);
  if (!(d.price > 0) || d.price > 100000) out.push('Price must be more than $0.');
  if (!CAT.COLOURS.includes(d.colour)) out.push(`Colour must be one of: ${CAT.COLOURS.join(', ')}.`);
  if (!CAT.MATERIALS.includes(d.material)) out.push(`Material must be one of: ${CAT.MATERIALS.join(', ')}.`);
  if (!(d.styles || []).length) out.push(`Add at least one style: ${CAT.STYLES.join(', ')}.`);
  if (d.product_url === null) out.push('Product page link must be a web link, like https://yourshop.com.au/desk.');
  return out;
}

function draftToProduct(d) {
  return {
    id: newId('p'), created_at: nowIso(), updated_at: nowIso(), is_featured: false,
    title: String(d.title).trim().slice(0, 80), category: d.category, width_cm: d.width_cm, depth_cm: d.depth_cm, height_cm: d.height_cm,
    base_price_cents: Math.round(d.price * 100), style_tags: d.styles, cultural_tags: [], colour: d.colour, material: d.material,
    renter_friendly: d.renter_friendly !== false, product_url: d.product_url || '', image_url: '', options: [],
  };
}

function useData() {
  const [, setN] = useState(0);
  useEffect(() => {
    const off = Data.subscribe(() => setN((n) => n + 1));
    setN((n) => n + 1); // catch any change that landed before this component subscribed
    return off;
  }, []);
  return Data.state;
}

function makeLayouts(room, locked, round) {
  const stamp = Date.now().toString(36);
  return E.generateLayouts(engineRoom(room), room.items || [], { goal: room.goal, locked: locked || [], round: round || 0 })
    .map((l) => ({ ...l, id: `${l.variant}-${stamp}` }));
}

function withFreshLayouts(room) {
  return { ...room, layouts: makeLayouts(room), layouts_sig: roomSig(room), chosen_layout_id: null, layout_round: 0 };
}

/* Moving the suggested spots (the purple dotted outlines). Moving one turns the layout into
   "Your edit" and pins every spot where it is; anything bought for a spot moves with it. */
function spotTools(room, update, layout, beforeChange) {
  const er = engineRoom(room);
  const goal = room.goal;
  const items = goal === 'replace' ? (room.items || []).filter((i) => i.keep) : room.items || [];
  const others = (id) => layout.slots.filter((s) => s.id !== id);
  const errorsFor = (spot) => E.validateSpot(er, layout.placements, others(spot.id), spot);
  const save = (slots, note) => {
    if (beforeChange) beforeChange();
    const rebuilt = E.rebuildLayout(er, items, layout.placements, goal, 'custom', slots);
    update({ layouts: [...room.layouts.filter((l) => l.variant !== 'custom'), { ...rebuilt, id: 'custom', variant: 'custom', slots_custom: true }], chosen_layout_id: 'custom' });
    if (note) toast(note);
  };
  const place = (id, patch) => {
    const spot = layout.slots.find((s) => s.id === id);
    if (!spot) return false;
    const home = spot.home || { x: spot.x, y: spot.y, w: spot.w, d: spot.d, wall: spot.wall || null };
    const moved = { ...spot, ...patch, home };
    moved.wall = E.spotWall(er, moved);
    const errs = errorsFor(moved);
    if (errs.length) { toast(`Can't put it there: ${errs[0]}`, 'bad'); return false; }
    save(layout.slots.map((s) => (s.id === id ? moved : s)));
    return true;
  };
  const rotate = (id) => {
    const s = layout.slots.find((x) => x.id === id);
    if (!s) return;
    const W = room.width_cm, L = room.length_cm;
    const cx = s.x + s.w / 2, cy = s.y + s.d / 2;
    const nw = s.d, nd = s.w;
    let x = Math.round((cx - nw / 2) / 5) * 5, y = Math.round((cy - nd / 2) / 5) * 5;
    x = Math.max(0, Math.min(W - nw, x)); y = Math.max(0, Math.min(L - nd, y));
    if (s.category && E.WALL_CATS.has(s.category)) { if (nw < nd) x = cx < W / 2 ? 0 : W - nw; else y = cy < L / 2 ? 0 : L - nd; }
    place(id, { x, y, w: nw, d: nd });
  };
  return {
    move: (id, pos) => place(id, pos),
    rotate,
    validate: (id, pos) => {
      const spot = layout.slots.find((s) => s.id === id);
      if (!spot) return null;
      const moved = { ...spot, ...pos };
      const errs = errorsFor(moved);
      return errs.length ? errs[0] : null;
    },
    key: (id, e) => {
      const step = e.shiftKey ? 25 : 5;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      const s = layout.slots.find((x) => x.id === id);
      if (!s) return;
      if (d) { e.preventDefault(); place(id, { x: s.x + d[0], y: s.y + d[1] }); } else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotate(id); }
    },
    canReset: layout.slots.some((s) => s.home),
    reset: () => save(layout.slots.map((s) => { if (!s.home) return s; const { home, ...rest } = s; return { ...rest, ...home }; }), 'Spots moved back to where the layout put them.'),
  };
}

const spotName = (s) => (s.category ? `${E.label(s.category)} spot` : 'Free space');

function chosenLayout(room) {
  return (room.layouts || []).find((l) => l.id === room.chosen_layout_id) || null;
}

function newRoomData(over) {
  return {
    id: newId('room'), name: 'My bedroom', type: 'bedroom', width_cm: 300, length_cm: 350,
    door: { wall: 'S', offset_cm: 30, width_cm: 82 }, windows: [], budget_cents: 50000,
    style: 'Scandi', cultural_style: '', goal: 'fill', items: [], layouts: [], chosen_layout_id: null,
    shortlist: [], created_at: nowIso(), ...over,
  };
}

function sampleRoomData() {
  const room = newRoomData({
    name: 'Sample bedroom', door: { wall: 'S', offset_cm: 200, width_cm: 82 },
    windows: [{ wall: 'E', offset_cm: 100, width_cm: 120 }], budget_cents: 60000, style: 'Japandi', goal: 'fill', is_sample: true,
    items: [
      { id: newId('item'), name: 'Queen bed', category: 'bed', width_cm: 153, depth_cm: 203, keep: true },
      { id: newId('item'), name: 'Desk', category: 'desk', width_cm: 120, depth_cm: 60, keep: true },
      { id: newId('item'), name: 'Wardrobe', category: 'wardrobe', width_cm: 100, depth_cm: 55, keep: true },
      { id: newId('item'), name: 'Bedside table', category: 'bedside-table', width_cm: 45, depth_cm: 40, keep: true },
    ],
  });
  return withFreshLayouts(room);
}

function demoSellerData() {
  const d = CAT.DEMO_SELLER;
  return {
    business_name: d.business_name, suburb: d.suburb, size: d.size, badges: d.badges.slice(), website: d.website, about: d.about, is_demo: true,
    products: d.products.map((p) => ({
      ...p, id: newId('p'), is_featured: false, created_at: nowIso(),
      options: p.options.map((o) => ({ ...o, id: newId('o') })),
      demo_history: p.demo_history ? { units: p.demo_history.units, reviews: p.demo_history.reviews.map((r) => ({ ...r })) } : null,
    })),
    created_at: nowIso(),
  };
}

function isFeatured(p) { return Boolean(p.is_featured && (!p.featured_until || p.featured_until > nowIso())); }

/* catalogue: demo products plus live seller listings, with reviews folded into ratings */
function buildCatalog(s) {
  const stores = new Map(CAT.STORES.map((st) => [st.id, { ...st, is_demo: true }]));
  const list = CAT.PRODUCTS.map((p) => ({ ...p, key: `${p.seller_id}:${p.id}` }));
  const sellers = (s.otherSellers || []).slice();
  if (s.seller) sellers.push({ ...s.seller, mine: true });
  for (const se of sellers) {
    if (!se || !se.business_name) continue;
    const demoShop = se.is_demo ? CAT.DEMO_SELLER : {};
    stores.set(se.id, { id: se.id, business_name: se.business_name, suburb: se.suburb, size: se.size, badges: se.badges || [], website: se.website || demoShop.website || '', about: se.about || demoShop.about || '', is_demo: false, mine: Boolean(se.mine) });
    for (const p of se.products || []) list.push({ ...p, seller_id: se.id, key: `${se.id}:${p.id}`, is_demo: false, rating_avg: 0, rating_count: 0, featured: isFeatured(p) });
  }
  const reviews = {};
  const add = (who, items) => { for (const [k, r] of Object.entries(items || {})) (reviews[k] = reviews[k] || []).push({ ...r, who }); };
  for (const [who, doc] of Object.entries(s.reviewDocs || {})) if (s.mode === 'cloud' || who !== Data.myReviewer()) add(who, doc && doc.items);
  if (s.mode !== 'cloud') add('me', s.myReviews);
  for (const p of list) {
    const rs = reviews[p.key] || [];
    const sum = p.rating_avg * p.rating_count + rs.reduce((a, r) => a + r.rating, 0);
    const n = p.rating_count + rs.length;
    p.rating = n ? sum / n : 0;
    p.ratings = n;
    p.reviews = rs;
    p.store = stores.get(p.seller_id) || { business_name: 'Unknown store', size: 'small', badges: [] };
  }
  return { list, stores, map: new Map(list.map((p) => [p.key, p])) };
}

function priceOf(p, optionId) {
  const o = (p.options || []).find((x) => x.id === optionId);
  return p.base_price_cents + (o ? o.price_delta_cents : 0);
}

function shortlistTotal(room, catalog, exceptSlot) {
  let total = 0;
  for (const it of room.shortlist || []) {
    if (exceptSlot && it.slot_id === exceptSlot) continue;
    const p = catalog.map.get(it.product_key);
    if (p) total += priceOf(p, it.option_id);
  }
  return total;
}

function slotProducts(room, layout, catalog) {
  const out = [];
  if (!layout) return out;
  for (const it of room.shortlist || []) {
    const slot = layout.slots.find((x) => x.id === it.slot_id);
    const p = catalog.map.get(it.product_key);
    if (!slot || !p) continue;
    const rect = E.placeProductInSlot(p, slot);
    if (!rect) continue;
    const back = slot.wall || (slot.facing ? OPPOSITE[slot.facing] : rect.rotation === 90 ? 'W' : 'N');
    out.push({ slot_id: slot.id, rect, back, category: p.category, title: p.title, colour: p.colour, height: p.height_cm });
  }
  return out;
}

function defaultFilters(profile) {
  return { styles: [], cultural: [], colours: [], materials: [], priceMax: '', store: 'all', badges: [], renter: profile.persona === 'renter', withinBudget: true };
}

function searchSlot(catalog, slot, category, filters, remaining) {
  let list = catalog.list.filter((p) => p.category === category && E.fitInSlot(p, slot));
  if (filters.renter) list = list.filter((p) => p.renter_friendly);
  if (filters.withinBudget) list = list.filter((p) => p.base_price_cents <= remaining);
  if (filters.styles.length) list = list.filter((p) => p.style_tags.some((t) => filters.styles.includes(t)));
  if (filters.cultural.length) list = list.filter((p) => (p.cultural_tags || []).some((t) => filters.cultural.includes(t)));
  if (filters.colours.length) list = list.filter((p) => filters.colours.includes(p.colour));
  if (filters.materials.length) list = list.filter((p) => filters.materials.includes(p.material));
  const max = toInt(filters.priceMax);
  if (isWhole(max) && max > 0) list = list.filter((p) => p.base_price_cents <= max * 100);
  if (filters.store !== 'all') list = list.filter((p) => p.store.size === filters.store);
  if (filters.badges.length) list = list.filter((p) => (p.store.badges || []).some((b) => filters.badges.includes(b)));
  const byPrice = (a, b) => a.base_price_cents - b.base_price_cents || b.rating - a.rating || a.title.localeCompare(b.title);
  const sponsored = list.filter((p) => p.featured).sort(byPrice)[0];
  const rest = list.filter((p) => p !== sponsored).sort(byPrice);
  // Equal footing: when a small business has a piece that fits, one is always in the top three.
  const top = sponsored ? 2 : 3;
  if (rest.length > top && !rest.slice(0, top).some((p) => p.store.size === 'small')) {
    const i = rest.findIndex((p) => p.store.size === 'small');
    if (i > 0) { const [p] = rest.splice(i, 1); rest.splice(top - 1, 0, { ...p, boosted: true }); }
  }
  return sponsored ? [{ ...sponsored, sponsoredSlot: true }, ...rest] : rest;
}

/* ===================== small UI pieces ===================== */
function Toasts() {
  const [, setN] = useState(0);
  useEffect(() => Toast.subscribe(() => setN((n) => n + 1)), []);
  return html`<div class="toasts" aria-live="polite">${Toast.get().map((t) => html`<div key=${t.id} class=${`toast ${t.kind}`}>${t.msg}</div>`)}</div>`;
}

function Dialog({ title, onClose, children, footer, wide, sub }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current && ref.current.querySelector('input, select, textarea, button:not(.close)');
    if (el) el.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  }, []);
  return html`<div class="overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title} ref=${ref}>
      <header><div class="stack" style="gap:3px"><h3>${title}</h3>${sub && html`<p class="small soft">${sub}</p>`}</div>
        <button class="btn ghost small close" onClick=${onClose} aria-label="Close">Close</button></header>
      <div class="content">${children}</div>
      ${footer && html`<footer>${footer}</footer>`}
    </div>
  </div>`;
}

function Chips({ options, value, onChange, multi, labels, swatches }) {
  const sel = multi ? value : [value];
  return html`<div class="chips">${options.map((o) => {
    const on = sel.includes(o);
    const toggle = () => {
      if (multi) onChange(on ? value.filter((x) => x !== o) : [...value, o]);
      else onChange(on ? '' : o);
    };
    return html`<button type="button" key=${o} class="chip" aria-pressed=${String(on)} onClick=${toggle}>
      ${swatches && html`<span class="swatch" style=${`background:${COLOUR_HEX[o] || '#ccc'}`}></span>`}${labels ? labels[o] : o}</button>`;
  })}</div>`;
}

function Seg({ options, value, onChange, label }) {
  return html`<div class="seg" role="group" aria-label=${label}>${options.map(([v, l]) => html`<button type="button" key=${v} aria-pressed=${String(v === value)} onClick=${() => onChange(v)}>${l}</button>`)}</div>`;
}

function NumField({ id, label, value, onInput, unit, invalid, hint, min, max, step }) {
  return html`<div class="field">
    <label for=${id}>${label}</label>
    <div class="input-unit"><input id=${id} class=${`input num ${invalid ? 'invalid' : ''}`} inputmode="numeric" type="number" min=${min} max=${max} step=${step || 1}
      value=${value} onInput=${(e) => onInput(e.target.value)} />${unit && html`<span>${unit}</span>`}</div>
    ${hint && html`<span class="hint">${hint}</span>`}
  </div>`;
}

function StorePill() {
  const s = useData();
  const cloud = s.mode === 'cloud';
  const tip = cloud
    ? 'Your rooms sync across your devices and stay private to you. Seller listings are shared with everyone who opens this app.'
    : s.canRead
      ? 'You can see live seller listings, but your rooms and listings save in this browser only.'
      : 'Your rooms and listings save in this browser only.';
  return html`<span class=${`store-pill ${cloud ? 'cloud' : ''}`} title=${tip}><i></i>${cloud ? html`Synced<span class="long"> to your account</span>` : html`Saved<span class="long"> in this browser</span>`}</span>`;
}

function BrandMark() {
  return html`<svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true">
    <rect x="1.5" y="1.5" width="23" height="23" rx="2" fill="none" stroke="var(--wall)" stroke-width="2.4" />
    <rect x="4.5" y="4.5" width="9" height="11" rx="1" fill="var(--timber)" stroke="var(--timber-edge)" stroke-width="1" />
    <rect x="15.5" y="15" width="6" height="6" rx="1" fill="none" stroke="var(--accent)" stroke-width="1.3" stroke-dasharray="2 1.5" />
    <path d="M16 1.5 A7 7 0 0 1 23 8.5" fill="none" stroke="var(--ink-faint)" stroke-width="1" />
  </svg>`;
}

function TopBar({ route, go }) {
  const cur = route.name === 'seller' ? 'seller' : route.name === 'landing' ? 'landing' : 'rooms';
  return html`<header class="topbar"><div class="topbar-inner">
    <button class="brand" onClick=${() => go({ name: 'landing' })} aria-label="Removaters home"><${BrandMark} /><span class="brand-name">Removaters</span></button>
    <nav class="nav" aria-label="Main">
      <button aria-current=${cur === 'rooms' ? 'page' : null} onClick=${() => go({ name: 'rooms' })}>My rooms</button>
      <button aria-current=${cur === 'seller' ? 'page' : null} onClick=${() => go({ name: 'seller' })}>Sell</button>
      <${StorePill} />
    </nav>
  </div></header>`;
}

function ScoreBadge({ score }) {
  const cls = score >= 85 ? 'high' : score >= 65 ? 'mid' : '';
  return html`<div class=${`score ${cls}`} aria-label=${`Score ${score} out of 100`}>${score}<small>/100</small></div>`;
}

function Bars({ breakdown }) {
  return html`<div class="bars">${breakdown.map((b) => html`<div class="bar" key=${b.key}>
    <span>${b.label}</span><span class="num faint">${b.value}/${b.max}</span>
    <div class="track"><div class="fill" style=${`width:${(b.value / b.max) * 100}%`}></div></div>
    <span class="note">${b.note}</span></div>`)}</div>`;
}

/* ===================== landing ===================== */
function Landing({ go }) {
  const s = useData();
  const demo = useMemo(() => {
    const r = sampleRoomData();
    const l = r.layouts[0];
    return { room: r, layout: l };
  }, []);
  const hasRooms = s.rooms.length > 0;
  return html`<section class="hero">
    <div class="hero-copy">
      <span class="eyebrow">Room planner for people who already own furniture</span>
      <h1>Design your room around what you <em>already own</em>.</h1>
      <p class="lede">Scan or measure your room and the furniture you're keeping. Removaters lays it out three ways, fills the gaps with pieces that actually fit your space and budget from big stores and small local makers, then checks out with every store in one go.</p>
      <div class="row">
        <button class="btn primary big" onClick=${() => Actions.tryShopper(go)}>Try as shopper</button>
        <button class="btn big" onClick=${() => Actions.trySeller(go)}>Try as seller</button>
        ${hasRooms ? html`<button class="btn ghost" onClick=${() => go({ name: 'rooms' })}>Go to my rooms</button>`
          : html`<button class="btn ghost" onClick=${() => Actions.newRoom(go)}>Start a blank room</button>`}
      </div>
      <p class="small faint">Demo data: every store and product here is made up for the Sym AI Open 2026 hackathon.</p>
    </div>
    <div class="card hero-plan">
      <div class="caption"><span><b>Live output</b> from the layout engine</span><span class="mono">Sample bedroom · 300 × 350 cm</span></div>
      <${PlanOr3D} room=${demo.room} placements=${demo.layout.placements} slots=${demo.layout.slots} title="Sample bedroom plan with gaps to fill" />
      <div class="plan-legend"><span><i class="lg-owned"></i>Furniture you own</span><span><i class="lg-slot"></i>Gap that needs a piece</span><span><i class="lg-door"></i>Door swing kept clear</span></div>
    </div>
  </section>
  <section class="steps3" aria-label="How it works">
    ${[
      ['1', 'Scan or measure', 'Snap a photo or floor plan and Claude reads the size, door, windows and furniture. Or type it in.'],
      ['2', 'Get three layouts', 'Open, Work and Cosy arrangements, each checked so nothing overlaps or blocks a doorway. Regenerate for more.'],
      ['3', 'Fill the gaps', 'Every suggestion fits the gap and your budget, compared across stores, with a 3D look at each piece.'],
      ['4', 'Check out once', 'One cart and one payment for every store. Each store gets its own order.'],
    ].map(([n, t, d]) => html`<div class="card step3" key=${n}><span class="n">STEP ${n}</span><h3>${t}</h3><p class="small soft">${d}</p></div>`)}
  </section>
  <section class="vs">
    <div class="card"><h4>Single-store room tools</h4><ul><li>Start by erasing the furniture you own</li><li>Show one retailer's catalogue</li><li>You judge by eye whether a piece fits</li><li>One store's cart at a time</li></ul></div>
    <div class="card"><h4>Removaters</h4><ul><li>Lays out the furniture you're keeping first</li><li>Shops big stores and small local makers side by side</li><li>Suggests only pieces that fit the gap and your budget</li><li>One checkout across every store</li></ul></div>
  </section>`;
}

/* ===================== actions ===================== */
const Actions = {
  tryShopper(go) {
    const s = Data.state;
    const existing = s.rooms.find((r) => r.is_sample);
    if (s.profile.persona !== 'renter' && !existing) Data.saveProfile({ persona: 'renter' });
    if (existing) { go({ name: 'room', id: existing.id, step: 'layouts' }); return; }
    const room = sampleRoomData();
    Data.saveRoom(room, { now: true });
    toast('Sample bedroom ready: three layouts generated.', 'good');
    go({ name: 'room', id: room.id, step: 'layouts' });
  },
  trySeller(go) {
    if (!Data.state.seller) {
      Data.saveSeller(demoSellerData());
      toast('Demo shop ready: 5 listings plus made-up sales and reviews for Insights.', 'good');
    }
    go({ name: 'seller' });
  },
  newRoom(go) {
    const room = newRoomData({ name: `Room ${Data.state.rooms.length + 1}` });
    Data.saveRoom(room, { now: true });
    go({ name: 'room', id: room.id, step: 'room' });
  },
};

/* ===================== rooms list ===================== */
function RoomsList({ go }) {
  const s = useData();
  const catalog = useMemo(() => buildCatalog(s), [s.otherSellers, s.seller, s.reviewDocs, s.myReviews, s.mode]);
  const [confirm, setConfirm] = useState(null);
  return html`<section>
    <div class="page-head">
      <div class="stack" style="gap:6px"><span class="eyebrow">Shopper</span><h2>My rooms</h2>
        <p class="soft small">Persona: <b>${PERSONAS[s.profile.persona] || 'Renter'}</b>${s.profile.persona === 'renter' ? ', so renter-friendly pieces are shown first.' : '.'}</p></div>
      <div class="row">
        <button class="btn" onClick=${() => Actions.tryShopper(go)}>${s.rooms.some((r) => r.is_sample) ? 'Open sample room' : 'Add sample room'}</button>
        <button class="btn primary" onClick=${() => Actions.newRoom(go)}>New room</button>
      </div>
    </div>
    ${s.rooms.length === 0 ? html`<div class="card empty">
        <h3>No rooms yet</h3>
        <p class="soft">Start with the sample bedroom to see three layouts straight away, or measure your own room.</p>
        <div class="row" style="justify-content:center"><button class="btn primary" onClick=${() => Actions.tryShopper(go)}>Try the sample bedroom</button><button class="btn" onClick=${() => Actions.newRoom(go)}>Measure my room</button></div>
      </div>`
      : html`<div class="rooms-grid">${s.rooms.map((r) => {
        const l = chosenLayout(r) || (r.layouts || [])[0];
        const total = shortlistTotal(r, catalog);
        return html`<article class="card room-card" key=${r.id}>
          <div class="thumb">${l ? html`<${Plan} room=${r} placements=${l.placements} slots=${l.slots} products=${slotProducts(r, l, catalog)} compact=${true} title=${`${r.name} plan`} />`
            : html`<${Plan} room=${r} compact=${true} title=${`${r.name} outline`} />`}</div>
          <div class="body">
            <div class="spread"><h3>${r.name}</h3>${r.is_sample && html`<span class="tag">Sample</span>`}</div>
            <p class="small soft"><span class="num">${r.width_cm} × ${r.length_cm} cm</span> · ${r.type === 'living' ? 'Living room' : 'Bedroom'} · ${plural((r.items || []).length, 'piece')} owned</p>
            <p class="small soft">Shortlist <span class="num">${money(total)}</span> of <span class="num">${money(r.budget_cents)}</span> budget${chosenLayout(r) ? '' : ' · no layout chosen yet'}</p>
            <div class="row" style="margin-top:auto">
              <button class="btn primary small" onClick=${() => go({ name: 'room', id: r.id, step: chosenLayout(r) ? 'shop' : r.layouts && r.layouts.length ? 'layouts' : 'room' })}>Open</button>
              ${confirm === r.id
                ? html`<span class="small">Delete this room?</span><button class="btn small danger" onClick=${() => { Data.deleteRoom(r.id); setConfirm(null); toast('Room deleted.'); }}>Delete</button><button class="btn small ghost" onClick=${() => setConfirm(null)}>Keep</button>`
                : html`<button class="btn ghost small" onClick=${() => setConfirm(r.id)}>Delete</button>`}
            </div>
          </div>
        </article>`;
      })}</div>`}
  </section>`;
}

/* ===================== room workspace ===================== */
const STEPS = [['room', 'Room'], ['furniture', 'Your furniture'], ['prefs', 'Preferences'], ['layouts', 'Layouts'], ['shop', 'Complete the room'], ['checkout', 'Checkout']];

function RoomWorkspace({ id, step, go }) {
  const s = useData();
  const room = s.rooms.find((r) => r.id === id);
  const catalog = useMemo(() => buildCatalog(s), [s.otherSellers, s.seller, s.reviewDocs, s.myReviews, s.mode]);
  if (!room) {
    return html`<div class="card empty"><h3>Room not found</h3><p class="soft">It may have been deleted on another device.</p><button class="btn primary" onClick=${() => go({ name: 'rooms' })}>Back to my rooms</button></div>`;
  }
  const update = (patch) => Data.saveRoom({ ...room, ...(typeof patch === 'function' ? patch(room) : patch) });
  // Changing step keeps the page where it is, unless the step tabs have scrolled away: then it goes back up to them.
  const setStep = (k) => {
    go({ name: 'room', id, step: k }, true);
    requestAnimationFrame(() => {
      const el = document.querySelector('.stepper');
      const top = el ? el.getBoundingClientRect().top : 0;
      if (el && top < 64) window.scrollTo(0, Math.max(0, window.scrollY + top - 76));
    });
  };
  const stale = room.layouts && room.layouts.length > 0 && room.layouts_sig !== roomSig(room);
  const chosen = chosenLayout(room);
  const done = { room: true, furniture: (room.items || []).length > 0, prefs: (room.layouts || []).length > 0, layouts: Boolean(chosen), shop: (room.shortlist || []).length > 0, checkout: (room.orders || []).length > 0 };
  const total = shortlistTotal(room, catalog);
  return html`<section>
    <div class="ws-head">
      <div class="ws-title">
        <button class="btn-link small" onClick=${() => go({ name: 'rooms' })}>← My rooms</button>
        <h2>${room.name}</h2>
        <div class="ws-meta">
          <span><span class="num">${room.width_cm} × ${room.length_cm}</span> cm</span>
          <span>${room.type === 'living' ? 'Living room' : 'Bedroom'}</span>
          <span>Budget <span class="num">${money(room.budget_cents)}</span></span>
          <span>Shortlist <span class="num">${money(total)}</span></span>
          <span>${room.style}${room.cultural_style ? ` · ${room.cultural_style}` : ''}</span>
          <span>${GOALS[room.goal].name}</span>
        </div>
      </div>
    </div>
    <nav class="stepper" aria-label="Room steps">${STEPS.map(([k, label], i) => html`<button key=${k} class=${done[k] && step !== k ? 'done' : ''} aria-current=${step === k ? 'step' : null} onClick=${() => setStep(k)}><span class="n">${i + 1}</span>${label}</button>`)}</nav>
    ${stale && (step === 'layouts' || step === 'shop') && html`<div class="notice warn" style="margin-bottom:16px"><span>Your room or furniture changed since these layouts were made.</span>
      <button class="btn small" onClick=${() => { update(withFreshLayouts(room)); setStep('layouts'); toast('New layouts generated.', 'good'); }}>Generate new layouts</button></div>`}
    ${step === 'room' && html`<${RoomStep} room=${room} update=${update} next=${() => setStep('furniture')} />`}
    ${step === 'furniture' && html`<${FurnitureStep} room=${room} update=${update} next=${() => setStep('prefs')} />`}
    ${step === 'prefs' && html`<${PrefsStep} room=${room} update=${update} next=${() => setStep('layouts')} />`}
    ${step === 'layouts' && html`<${LayoutsStep} room=${room} update=${update} setStep=${setStep} />`}
    ${step === 'shop' && html`<${ShopStep} room=${room} update=${update} setStep=${setStep} catalog=${catalog} />`}
    ${step === 'checkout' && html`<${CheckoutStep} room=${room} update=${update} setStep=${setStep} catalog=${catalog} />`}
  </section>`;
}

/* ---------- step 1, option A: scan a photo or floor plan ---------- */
const SCAN_PROMPT = `You read one image of a room (a photo or a floor plan) and turn it into measurements for a furniture-layout app.
Reply with only JSON like this example:
{"room_type":"bedroom","width_cm":320,"length_cm":360,"door":{"wall":"S","offset_cm":40,"width_cm":82},"windows":[{"wall":"E","offset_cm":100,"width_cm":120}],"furniture":[{"name":"Queen bed","category":"bed","width_cm":153,"depth_cm":203}],"source":"plan","confidence":"high","notes":"Sizes read from the printed dimensions."}
How to measure:
- Treat the room as a plan seen from above with the top of the image as north. width_cm runs left to right (along the N and S walls); length_cm runs top to bottom (along the E and W walls).
- Walls: N is the top, E the right, S the bottom, W the left. offset_cm is the distance from the left end of the N or S wall, or from the top end of the E or W wall, to the near edge of the door or window.
- room_type is "bedroom" or "living".
- furniture: only pieces you can see, at most 10. category is one of: ${'bed, wardrobe, desk, chair, bedside-table, bookcase, dresser, floor-lamp, sofa, armchair, coffee-table, tv-unit'}. width_cm is the side you face, depth_cm front to back.
- source is "plan" for a floor plan with printed sizes, otherwise "photo". From a photo, estimate from things of known size (a door is about 82 cm wide, a ceiling about 240 cm high) and set confidence to "medium" or "low".
- Use whole centimetres; convert millimetres and metres. Use null for anything you can't tell. If the image is not a room or a floor plan, reply {"error":"not a room"}.`;

// Big or unusual images are redrawn as a JPEG no wider than 1600 px before they go to Claude.
function prepImage(blob, types) {
  const ok = (types || ['image/jpeg', 'image/png', 'image/webp', 'image/gif']).includes(blob.type);
  if (ok && blob.size <= 3.5 * 1024 * 1024) return Promise.resolve(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

// A made-up floor plan with printed sizes, so the scan can be tried without one to hand.
function drawExamplePlan() {
  const c = document.createElement('canvas');
  c.width = 1000; c.height = 920;
  const g = c.getContext('2d');
  const s = 2, ox = 190, oy = 130, W = 320, L = 360;
  const X = (cm) => ox + cm * s, Y = (cm) => oy + cm * s;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1d1d1d'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 30px Arial, sans-serif'; g.fillText('BEDROOM 2', c.width / 2, 34);
  g.font = '18px Arial, sans-serif'; g.fillText('Example floor plan · not to scale for building', c.width / 2, 64);
  // dimension lines
  g.strokeStyle = '#555'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(X(0), oy - 34); g.lineTo(X(W), oy - 34); g.moveTo(X(0), oy - 42); g.lineTo(X(0), oy - 26); g.moveTo(X(W), oy - 42); g.lineTo(X(W), oy - 26); g.stroke();
  g.font = 'bold 22px Arial, sans-serif'; g.fillStyle = '#fff'; g.fillRect(X(W / 2) - 50, oy - 48, 100, 28); g.fillStyle = '#1d1d1d'; g.fillText('3.20 m', X(W / 2), oy - 34);
  g.beginPath(); g.moveTo(ox - 40, Y(0)); g.lineTo(ox - 40, Y(L)); g.moveTo(ox - 48, Y(0)); g.lineTo(ox - 32, Y(0)); g.moveTo(ox - 48, Y(L)); g.lineTo(ox - 32, Y(L)); g.stroke();
  g.save(); g.translate(ox - 40, Y(L / 2)); g.rotate(-Math.PI / 2); g.fillStyle = '#fff'; g.fillRect(-50, -14, 100, 28); g.fillStyle = '#1d1d1d'; g.fillText('3.60 m', 0, 0); g.restore();
  // furniture
  const piece = (x, y, w, d, name, size) => {
    g.fillStyle = '#eceae4'; g.strokeStyle = '#6b6b6b'; g.lineWidth = 2;
    g.fillRect(X(x), Y(y), w * s, d * s); g.strokeRect(X(x), Y(y), w * s, d * s);
    g.fillStyle = '#1d1d1d'; g.font = 'bold 17px Arial, sans-serif'; g.fillText(name, X(x + w / 2), Y(y + d / 2) - 11);
    g.font = '16px Arial, sans-serif'; g.fillText(size, X(x + w / 2), Y(y + d / 2) + 11);
  };
  piece(85, 0, 153, 203, 'QUEEN BED', '1530 × 2030');
  piece(0, 150, 55, 100, 'WARDROBE', '1000 × 550');
  piece(260, 230, 60, 120, 'DESK', '1200 × 600');
  // walls
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 10; g.strokeRect(X(0), Y(0), W * s, L * s);
  // door on the bottom wall, 40 cm from the left, 82 cm wide, swinging in
  g.fillStyle = '#ffffff'; g.fillRect(X(40), Y(L) - 7, 82 * s, 14);
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(X(40), Y(L)); g.lineTo(X(40), Y(L - 82)); g.stroke();
  g.setLineDash([6, 5]); g.beginPath(); g.arc(X(40), Y(L), 82 * s, -Math.PI / 2, 0); g.stroke(); g.setLineDash([]);
  g.font = 'bold 17px Arial, sans-serif'; g.fillStyle = '#1d1d1d'; g.fillText('DOOR 820', X(81), Y(L) + 26);
  // window on the right wall, 100 cm from the top, 120 cm wide
  g.fillStyle = '#ffffff'; g.fillRect(X(W) - 7, Y(100), 14, 120 * s);
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(X(W) - 6, Y(100)); g.lineTo(X(W) - 6, Y(220)); g.moveTo(X(W) + 6, Y(100)); g.lineTo(X(W) + 6, Y(220)); g.moveTo(X(W) - 7, Y(100)); g.lineTo(X(W) + 7, Y(100)); g.moveTo(X(W) - 7, Y(220)); g.lineTo(X(W) + 7, Y(220)); g.stroke();
  g.fillStyle = '#1d1d1d';
  g.save(); g.translate(X(W) + 30, Y(160)); g.rotate(Math.PI / 2); g.font = 'bold 17px Arial, sans-serif'; g.fillText('WINDOW 1200', 0, 0); g.restore();
  // north arrow
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(915, 190); g.lineTo(915, 130); g.lineTo(905, 146); g.moveTo(915, 130); g.lineTo(925, 146); g.stroke();
  g.font = 'bold 20px Arial, sans-serif'; g.fillText('N', 915, 112);
  g.font = '15px Arial, sans-serif'; g.fillStyle = '#555'; g.fillText('Sizes in millimetres unless marked', c.width / 2, c.height - 22);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png'));
}

// Long notes end at a full stop rather than mid-word.
function trimNote(t, max) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > max / 3 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

// Turns whatever came back into a room the engine accepts, or explains why it can't.
function cleanScan(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return { error: "Claude couldn't read a room from that image. Try a clearer photo or a floor plan." };
  if (g.error) return { error: "That doesn't look like a room or a floor plan. Try another image." };
  const r5 = (v) => Math.round(Number(v) / 5) * 5;
  const W = r5(g.width_cm), L = r5(g.length_cm);
  if (!(W >= 200 && W <= 1000 && L >= 200 && L <= 1000)) {
    return { error: "Claude couldn't work out the room's size from that image. Try a floor plan with printed measurements, or type the sizes in." };
  }
  const wallLen = (w) => (w === 'N' || w === 'S' ? W : L);
  const wallOf = (w) => { const t = String(w || '').trim().toUpperCase().charAt(0); return ['N', 'E', 'S', 'W'].includes(t) ? t : null; };
  const dg = g.door && typeof g.door === 'object' ? g.door : {};
  const dWall = wallOf(dg.wall) || 'S';
  const dWidth = Math.min(120, Math.max(60, Math.round(Number(dg.width_cm) || 82)));
  let dOff = Math.round(Number(dg.offset_cm));
  if (!Number.isFinite(dOff)) dOff = Math.round((wallLen(dWall) - dWidth) / 2);
  const door = { wall: dWall, offset_cm: Math.max(0, Math.min(wallLen(dWall) - dWidth, dOff)), width_cm: dWidth };
  const windows = [];
  for (const w of (Array.isArray(g.windows) ? g.windows : []).slice(0, 4)) {
    if (windows.length >= 2 || !w || typeof w !== 'object') continue;
    const wall = wallOf(w.wall);
    let width = Math.round(Number(w.width_cm));
    if (!wall || !(width >= 30)) continue;
    width = Math.min(width, wallLen(wall));
    let off = Math.round(Number(w.offset_cm));
    if (!Number.isFinite(off)) off = Math.round((wallLen(wall) - width) / 2);
    off = Math.max(0, Math.min(wallLen(wall) - width, off));
    if (wall === door.wall && off < door.offset_cm + door.width_cm && door.offset_cm < off + width) continue;
    windows.push({ wall, offset_cm: off, width_cm: width });
  }
  const room = { type: /living|lounge/i.test(String(g.room_type || '')) ? 'living' : 'bedroom', width_cm: W, length_cm: L, door, windows };
  if (E.checkRoom(room).length) room.windows = [];
  if (E.checkRoom(room).length) return { error: "The door and windows Claude found don't fit together. Type the sizes in instead." };
  const items = [];
  for (const f of (Array.isArray(g.furniture) ? g.furniture : []).slice(0, 12)) {
    if (!f || typeof f !== 'object' || items.length >= 10) continue;
    const category = normCategory(f.category) || normCategory(f.name);
    const w = Math.round(Number(f.width_cm)), d = Math.round(Number(f.depth_cm));
    if (!category || !(w >= 10 && w <= 500 && d >= 10 && d <= 500)) continue;
    const name = (typeof f.name === 'string' && f.name.trim() ? f.name.trim() : E.label(category)).slice(0, 40);
    items.push({ name: name.charAt(0).toUpperCase() + name.slice(1), category, width_cm: w, depth_cm: d });
  }
  return {
    room, items,
    source: g.source === 'plan' ? 'plan' : 'photo',
    confidence: ['high', 'medium', 'low'].includes(g.confidence) ? g.confidence : 'medium',
    notes: typeof g.notes === 'string' ? trimNote(g.notes, 300) : '',
  };
}

const wallName = (w) => ({ N: 'top wall', E: 'right wall', S: 'bottom wall', W: 'left wall' }[w] || 'wall');

function ScanPanel({ room, ai, onApply, onType, onPreview }) {
  const cam = useRef(null);
  const file = useRef(null);
  const ctl = useRef(null);
  const [st, setSt] = useState({ state: 'idle' });
  const [img, setImg] = useState(null);
  const [picks, setPicks] = useState({});
  const [types, setTypes] = useState(null);
  const [secs, setSecs] = useState(0);
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  useEffect(() => {
    let alive = true;
    AI.get().then((s) => (s && s.limits ? s.limits() : null)).then((l) => { if (alive && l && l.images) setTypes(l.images.mediaTypes); }).catch(() => {});
    return () => { alive = false; if (ctl.current) ctl.current.abort(); onPreview(null); };
  }, []);
  useEffect(() => () => { if (img) URL.revokeObjectURL(img); }, [img]);
  useEffect(() => {
    if (st.state !== 'busy') return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [st.state]);
  const run = async (blob, label) => {
    if (ctl.current) ctl.current.abort();
    const c = new AbortController();
    ctl.current = c;
    setImg(URL.createObjectURL(blob));
    setSt({ state: 'busy', label });
    onPreview(null);
    try {
      const prepared = await prepImage(blob, types);
      const raw = await AI.json(SCAN_PROMPT, { images: [prepared], signal: c.signal, modelTier: 'default' });
      if (ctl.current !== c) return;
      const res = cleanScan(raw);
      if (res.error) { setSt({ state: 'error', error: res.error }); return; }
      setPicks(Object.fromEntries(res.items.map((_, i) => [i, true])));
      setSt({ state: 'done', res, label });
      onPreview({ ...room, ...res.room });
    } catch (e) {
      if (ctl.current !== c) return;
      if (e && e.code === 'cancelled') { setSt({ state: 'idle' }); return; }
      setSt({ state: 'error', error: e && e.message === 'decode' ? "That file isn't an image we can read. Try a JPG or PNG." : AI.message(e) });
    }
  };
  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { setSt({ state: 'error', error: 'Pick a photo or an image of a floor plan (JPG or PNG).' }); return; }
    if (f.size > 25 * 1024 * 1024) { setSt({ state: 'error', error: 'That image is over 25 MB. Pick a smaller one.' }); return; }
    run(f, f.name || 'your image');
  };
  const example = async () => { try { run(await drawExamplePlan(), 'the example floor plan'); } catch (e) { setSt({ state: 'error', error: "Couldn't draw the example plan in this browser." }); } };
  const stop = () => { if (ctl.current) ctl.current.abort(); ctl.current = null; setSt({ state: 'idle' }); };
  const res = st.state === 'done' ? st.res : null;
  if (ai === false) {
    return html`<div class="card form-card">
      <h3>Scan your room</h3>
      <div class="notice info"><span>Scanning uses Claude to read your photo or floor plan, and Claude isn't available in this copy of Removaters. Type the sizes in instead; it takes about a minute with a tape measure.</span></div>
      <div><button class="btn primary" onClick=${onType}>Type the sizes</button></div>
    </div>`;
  }
  return html`<div class="card form-card">
    <div class="stack" style="gap:4px"><h3>Scan your room</h3>
      <p class="small soft">Take a photo of the room or upload a floor plan. Claude reads the size, door, windows and furniture, then you check the numbers before anything changes.</p></div>
    ${st.state !== 'busy' && !res && html`<div class="row">
      ${touch && html`<button class="btn primary" disabled=${!ai} onClick=${() => cam.current && cam.current.click()}>Take a photo</button>`}
      <button class=${`btn ${touch ? '' : 'primary'}`} disabled=${!ai} onClick=${() => file.current && file.current.click()}>Upload a plan or photo</button>
      <button class="btn ghost" disabled=${!ai} onClick=${example}>Try an example floor plan</button>
      <input ref=${cam} type="file" accept="image/*" capture="environment" hidden onChange=${pickFile} />
      <input ref=${file} type="file" accept=${types ? types.join(',') : 'image/*'} hidden onChange=${pickFile} />
    </div>`}
    ${ai === null && html`<p class="small soft">Checking whether scanning is available…</p>`}
    ${st.state === 'busy' && html`<div class="scan-busy" aria-live="polite">
      ${img && html`<img class="scan-thumb" src=${img} alt=${`Scanning ${st.label}`} />`}
      <div class="stack" style="gap:6px"><b>Claude is reading ${st.label}…</b><span class="small soft">Usually 10 to 40 seconds. <span class="num">${secs}s</span></span>
        <div><button class="btn small ghost" onClick=${stop}>Stop</button></div></div>
    </div>`}
    ${st.state === 'error' && html`<div class="notice bad" role="alert"><span>${st.error}</span></div>`}
    ${res && html`<div class="scan-result">
      ${img && html`<img class="scan-thumb" src=${img} alt=${`What you scanned: ${st.label}`} />`}
      <div class="stack" style="gap:10px;min-width:0">
        <div class="stack" style="gap:4px"><span class="eyebrow">Claude read</span>
          <b>${res.room.type === 'living' ? 'Living room' : 'Bedroom'}, <span class="num">${res.room.width_cm} × ${res.room.length_cm}</span> cm</b>
          <div class="row" style="gap:6px"><span class="tag">${res.source === 'plan' ? 'From a floor plan' : 'Estimated from a photo'}</span><span class=${`tag ${res.confidence === 'high' ? 'small-biz' : res.confidence === 'low' ? 'sponsored' : ''}`}>Confidence: ${res.confidence}</span></div></div>
        <ul class="plain-list scan-facts">
          <li><span>Door</span><span>${wallName(res.room.door.wall)}, ${res.room.door.offset_cm} cm in, ${res.room.door.width_cm} cm wide</span></li>
          ${res.room.windows.map((w, i) => html`<li key=${i}><span>Window ${i + 1}</span><span>${wallName(w.wall)}, ${w.offset_cm} cm in, ${w.width_cm} cm wide</span></li>`)}
          ${res.room.windows.length === 0 && html`<li><span>Windows</span><span>none found</span></li>`}
        </ul>
        ${res.items.length > 0 && html`<fieldset class="stack" style="border:0;padding:0;margin:0;gap:6px"><legend class="small" style="margin-bottom:4px"><b>Furniture found</b>: tick what you're keeping</legend>
          ${res.items.map((it, i) => html`<label class="toggle small" key=${i}><input type="checkbox" checked=${Boolean(picks[i])} onChange=${(e) => setPicks({ ...picks, [i]: e.target.checked })} />${it.name} <span class="num soft">${it.width_cm} × ${it.depth_cm} cm</span></label>`)}
        </fieldset>`}
        ${res.notes && html`<p class="small soft">${res.notes}</p>`}
        <div class="notice warn"><span>${res.source === 'plan' ? 'Check these against a tape measure before you buy anything.' : 'Sizes from a photo are estimates. Measure the room before you buy anything.'} You can fix any number on the next screen.</span></div>
        <div class="form-actions"><button class="btn ghost" onClick=${() => { setSt({ state: 'idle' }); onPreview(null); }}>Scan something else</button>
          <button class="btn primary" onClick=${() => onApply(res, res.items.filter((_, i) => picks[i]))}>Use these measurements</button></div>
      </div>
    </div>`}
  </div>`;
}

/* ---------- step 1: room ---------- */
function roomForm(room) {
  return {
    name: room.name, type: room.type, width: String(room.width_cm), length: String(room.length_cm),
    doorWall: room.door.wall, doorOffset: String(room.door.offset_cm), doorWidth: String(room.door.width_cm),
    windows: (room.windows || []).map((w) => ({ wall: w.wall, offset: String(w.offset_cm), width: String(w.width_cm) })),
  };
}
function formToRoom(f) {
  return {
    name: f.name.trim() || 'Untitled room', type: f.type, width_cm: toInt(f.width), length_cm: toInt(f.length),
    door: { wall: f.doorWall, offset_cm: toInt(f.doorOffset), width_cm: toInt(f.doorWidth) },
    windows: f.windows.map((w) => ({ wall: w.wall, offset_cm: toInt(w.offset), width_cm: toInt(w.width) })),
  };
}

function RoomStep({ room, update, next }) {
  const ai = useAI(true);
  const [f, setF] = useState(() => roomForm(room));
  const [mode, setMode] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const fresh = !room.is_sample && !(room.items || []).length && !room.scan;
  const shown = mode || (fresh && ai !== false ? 'scan' : 'type');
  const cand = formToRoom(f);
  const errors = E.checkRoom(cand);
  const preview = scanPreview || (errors.length ? room : { ...room, ...cand });
  const applyScan = (res, picked) => {
    const patch = { ...res.room, items: [...(room.items || []), ...picked.map((it) => ({ id: newId('item'), ...it, keep: true }))], scan: { at: nowIso(), source: res.source, confidence: res.confidence } };
    update(patch);
    setF(roomForm({ ...room, ...patch }));
    setScanPreview(null);
    setMode('type');
    toast(`Room filled from your scan: ${res.room.width_cm} × ${res.room.length_cm} cm${picked.length ? `, ${plural(picked.length, 'piece')} of furniture added` : ''}. Check the numbers.`, 'good');
  };
  const change = (patch) => {
    const nf = { ...f, ...patch };
    setF(nf);
    const c = formToRoom(nf);
    if (E.checkRoom(c).length === 0) update(c);
    else if (patch.name !== undefined) update({ name: c.name });
  };
  const setWin = (i, patch) => change({ windows: f.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const tooSmall = (room.items || []).filter((it) => {
    const W = cand.width_cm, L = cand.length_cm;
    return !((it.width_cm <= W && it.depth_cm <= L) || (it.depth_cm <= W && it.width_cm <= L));
  });
  return html`<div class="split">
    <div class="stack">
    <div class="how-row"><${Seg} label="How to add your room" value=${shown} onChange=${(v) => { setMode(v); if (v === 'type') setScanPreview(null); }} options=${[['scan', 'Scan a photo or plan'], ['type', 'Type the sizes']]} />
      ${room.scan && shown === 'type' && html`<span class="tiny soft">Filled from a scan${room.scan.source === 'photo' ? ' (estimates)' : ''}. Check each number.</span>`}</div>
    ${shown === 'scan' && html`<${ScanPanel} room=${room} ai=${ai} onApply=${applyScan} onType=${() => setMode('type')} onPreview=${setScanPreview} />`}
    ${shown === 'type' && html`<div class="card form-card">
      <div class="stack" style="gap:4px"><h3>Room size and openings</h3><p class="small soft">Measure wall to wall in centimetres. The top of the plan is north.</p></div>
      <div class="field"><label for="rname">Room name</label><input id="rname" class="input" value=${f.name} onInput=${(e) => change({ name: e.target.value })} /></div>
      <div class="field"><span class="label">Room type</span><${Seg} label="Room type" value=${f.type} onChange=${(v) => change({ type: v })} options=${[['bedroom', 'Bedroom'], ['living', 'Living room']]} /></div>
      <div class="grid2">
        <${NumField} id="rw" label="Width (left to right)" unit="cm" value=${f.width} onInput=${(v) => change({ width: v })} min="200" max="1000" />
        <${NumField} id="rl" label="Length (top to bottom)" unit="cm" value=${f.length} onInput=${(v) => change({ length: v })} min="200" max="1000" />
      </div>
      <fieldset class="stack" style="border:0;padding:0;margin:0;gap:10px">
        <legend class="eyebrow" style="margin-bottom:8px">Door</legend>
        <div class="grid3">
          <div class="field"><label for="dwall">Wall</label><select id="dwall" class="select" value=${f.doorWall} onChange=${(e) => change({ doorWall: e.target.value })}>${WALLS.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></div>
          <${NumField} id="doff" label="From the wall's start" unit="cm" value=${f.doorOffset} onInput=${(v) => change({ doorOffset: v })} min="0" />
          <${NumField} id="dwid" label="Door width" unit="cm" value=${f.doorWidth} onInput=${(v) => change({ doorWidth: v })} min="60" max="120" />
        </div>
        <span class="hint">Measure from the left end of the top and bottom walls, or the top end of the side walls.</span>
      </fieldset>
      <fieldset class="stack" style="border:0;padding:0;margin:0;gap:10px">
        <legend class="eyebrow" style="margin-bottom:8px">Windows</legend>
        ${f.windows.map((w, i) => html`<div class="grid4" key=${i} style="align-items:end">
          <div class="field"><label for=${`ww${i}`}>Window ${i + 1} wall</label><select id=${`ww${i}`} class="select" value=${w.wall} onChange=${(e) => setWin(i, { wall: e.target.value })}>${WALLS.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></div>
          <${NumField} id=${`wo${i}`} label="From start" unit="cm" value=${w.offset} onInput=${(v) => setWin(i, { offset: v })} min="0" />
          <${NumField} id=${`wd${i}`} label="Width" unit="cm" value=${w.width} onInput=${(v) => setWin(i, { width: v })} min="30" />
          <button type="button" class="btn ghost small" onClick=${() => change({ windows: f.windows.filter((_, j) => j !== i) })}>Remove</button>
        </div>`)}
        ${f.windows.length < 2 && html`<div><button type="button" class="btn small" onClick=${() => change({ windows: [...f.windows, { wall: 'N', offset: '50', width: '120' }] })}>Add a window</button></div>`}
      </fieldset>
      ${errors.length > 0 && html`<div class="notice bad" role="alert"><div class="stack" style="gap:3px">${errors.map((e) => html`<span>${e}</span>`)}</div></div>`}
      ${tooSmall.length > 0 && errors.length === 0 && html`<div class="notice warn">${tooSmall.map((i) => i.name).join(', ')} won't fit in a room this size.</div>`}
      <div class="form-actions"><button class="btn primary" disabled=${errors.length > 0} onClick=${next}>Next: your furniture</button></div>
    </div>`}
    </div>
    <div class="card plan-card sticky">
      <${Plan} room=${preview} title=${`Outline of ${room.name}`} />
      <p class="small faint" style="padding:6px 4px 2px">${scanPreview ? 'Preview of the scanned room. Nothing changes until you press Use these measurements.' : "Dashed square: the door's swing, which furniture has to keep clear."}</p>
    </div>
  </div>`;
}

/* ---------- step 2: furniture ---------- */
function FurnitureStep({ room, update, next }) {
  const blank = { preset: '', name: '', category: 'bed', width: '', depth: '', keep: true };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const items = room.items || [];
  const pickPreset = (key) => {
    const p = E.PRESETS.find((x) => x.key === key);
    if (!p) { setF({ ...f, preset: '' }); return; }
    setF({ ...f, preset: key, name: p.name, category: p.category, width: String(p.w), depth: String(p.d) });
  };
  const add = (e) => {
    e.preventDefault();
    const w = toInt(f.width), d = toInt(f.depth);
    if (!f.name.trim()) return setErr('Give the piece a name, like "Queen bed".');
    if (!isWhole(w) || !isWhole(d) || w < 10 || d < 10 || w > 500 || d > 500) return setErr('Width and depth must be whole numbers from 10 to 500 cm.');
    setErr('');
    update({ items: [...items, { id: newId('item'), name: f.name.trim(), category: f.category, width_cm: w, depth_cm: d, keep: f.keep }] });
    setF(blank);
  };
  const W = room.width_cm, L = room.length_cm;
  const fitsRoom = (it) => (it.width_cm <= W && it.depth_cm <= L) || (it.depth_cm <= W && it.width_cm <= L);
  return html`<div class="split">
    <div class="stack">
      <div class="card form-card">
        <div class="stack" style="gap:4px"><h3>Furniture you own</h3><p class="small soft">Mark each piece Keep to lay it out, or Replace to find a better one for its spot.</p></div>
        ${items.length === 0 ? html`<p class="soft small">Nothing added yet. Add your bed, wardrobe, desk or sofa below.</p>`
          : html`<ul class="item-list">${items.map((it) => html`<li class="item-row" key=${it.id}>
            <${PieceArt} category=${it.category} w=${it.width_cm} d=${it.depth_cm} size=${64} />
            <div class="stack" style="gap:2px;min-width:0"><span class="name">${it.name}</span>
              <span class="small soft">${E.label(it.category)} · <span class="num">${it.width_cm} × ${it.depth_cm} cm</span></span>
              ${!fitsRoom(it) && html`<span class="small err">Bigger than the room, so it can't be placed.</span>`}</div>
            <div class="row" style="justify-content:flex-end">
              <${Seg} label=${`${it.name}: keep or replace`} value=${it.keep ? 'keep' : 'replace'} options=${[['keep', 'Keep'], ['replace', 'Replace']]}
                onChange=${(v) => update({ items: items.map((x) => (x.id === it.id ? { ...x, keep: v === 'keep' } : x)) })} />
              <button class="btn ghost small" aria-label=${`Remove ${it.name}`} onClick=${() => update({ items: items.filter((x) => x.id !== it.id), shortlist: (room.shortlist || []).filter((s) => s.slot_id !== `replace:${it.id}`) })}>Remove</button>
            </div>
          </li>`)}</ul>`}
        ${items.some((i) => !i.keep) && room.goal !== 'replace' && html`<div class="notice info"><span>You marked pieces to replace. Set your goal to <b>Replace marked pieces</b> in Preferences to shop for their spots.</span></div>`}
      </div>
      <form class="card form-card" onSubmit=${add}>
        <h3>Add a piece</h3>
        <div class="field"><label for="preset">Start from a common size</label>
          <select id="preset" class="select" value=${f.preset} onChange=${(e) => pickPreset(e.target.value)}>
            <option value="">Custom size</option>
            ${E.PRESETS.map((p) => html`<option value=${p.key}>${p.name} (${p.w} × ${p.d} cm)</option>`)}
          </select></div>
        <div class="grid2">
          <div class="field"><label for="iname">Name</label><input id="iname" class="input" value=${f.name} placeholder="Queen bed" onInput=${(e) => setF({ ...f, name: e.target.value })} /></div>
          <div class="field"><label for="icat">Type</label><select id="icat" class="select" value=${f.category} onChange=${(e) => setF({ ...f, category: e.target.value })}>${E.CATEGORIES.map((c) => html`<option value=${c}>${E.label(c)}</option>`)}</select></div>
        </div>
        <div class="grid3" style="align-items:end">
          <${NumField} id="iw" label="Width" unit="cm" value=${f.width} onInput=${(v) => setF({ ...f, width: v })} />
          <${NumField} id="id" label="Depth" unit="cm" value=${f.depth} onInput=${(v) => setF({ ...f, depth: v })} />
          <div class="field"><span class="label">Plan</span><${Seg} label="Keep or replace" value=${f.keep ? 'keep' : 'replace'} options=${[['keep', 'Keep'], ['replace', 'Replace']]} onChange=${(v) => setF({ ...f, keep: v === 'keep' })} /></div>
        </div>
        <span class="hint">Width is the side you face; depth runs front to back.</span>
        ${err && html`<p class="err" role="alert">${err}</p>`}
        <div class="form-actions"><button class="btn" type="submit">Add piece</button><button class="btn primary" type="button" disabled=${items.length === 0} onClick=${next}>Next: preferences</button></div>
      </form>
    </div>
    <div class="card plan-card sticky">
      <${Plan} room=${room} title=${`Outline of ${room.name}`} />
      <p class="small faint" style="padding:6px 4px 2px">Your pieces get placed in step 4, once you've set your preferences.</p>
    </div>
  </div>`;
}

/* ---------- step 3: preferences ---------- */
function PrefsStep({ room, update, next }) {
  const s = useData();
  const [budget, setBudget] = useState(String(room.budget_cents / 100));
  const b = toInt(budget);
  const budgetOk = isWhole(b) && b >= 50 && b <= 100000;
  const generate = () => {
    if (!budgetOk) return;
    update(withFreshLayouts({ ...room, budget_cents: b * 100 }));
    toast('Three layouts generated.', 'good');
    next();
  };
  return html`<div class="card form-card" style="max-width:860px">
    <div class="stack" style="gap:4px"><h3>What you want from this room</h3><p class="small soft">These shape the layouts and which pieces get suggested.</p></div>
    <div class="field"><span class="label">I'm a</span>
      <${Seg} label="Persona" value=${s.profile.persona} options=${[['renter', 'Renter'], ['homeowner', 'Homeowner']]} onChange=${(v) => Data.saveProfile({ persona: v })} />
      <span class="hint">${s.profile.persona === 'renter' ? "Renters see renter-friendly pieces first: nothing you'd have to drill into the wall." : 'Homeowners see every piece, including wall-mounted ones.'}</span></div>
    <div class="grid2">
      <${NumField} id="budget" label="Budget for new pieces" unit="AUD" value=${budget} invalid=${!budgetOk} onInput=${(v) => { setBudget(v); const n = toInt(v); if (isWhole(n) && n >= 50 && n <= 100000) update({ budget_cents: n * 100 }); }} hint=${budgetOk ? 'Whole dollars.' : 'Enter a whole number from 50 to 100,000.'} />
    </div>
    <div class="field"><span class="label">Style</span><${Chips} options=${CAT.STYLES} value=${room.style} onChange=${(v) => update({ style: v || room.style })} /></div>
    <div class="field"><span class="label">Cultural style (optional)</span><${Chips} options=${CAT.CULTURAL} value=${room.cultural_style || ''} onChange=${(v) => update({ cultural_style: v })} />
      <span class="hint">Highlights pieces from makers who design in that tradition.</span></div>
    <div class="field"><span class="label">Goal</span>
      <div class="goal-cards">${Object.entries(GOALS).map(([k, g]) => html`<button type="button" key=${k} class="goal-card" aria-pressed=${String(room.goal === k)} onClick=${() => update({ goal: k })}><b>${g.name}</b><span>${g.text}</span></button>`)}</div></div>
    ${room.goal === 'replace' && !(room.items || []).some((i) => !i.keep) && html`<div class="notice warn">No pieces are marked Replace yet. Mark them in step 2, or pick another goal.</div>`}
    <div class="form-actions"><button class="btn primary big" disabled=${!budgetOk || !(room.items || []).length} onClick=${generate}>Generate 3 layouts</button></div>
  </div>`;
}

/* ---------- step 4: layouts ---------- */
function LayoutsStep({ room, update, setStep }) {
  const chosen = chosenLayout(room);
  const [view, setView] = useState(chosen ? 'editor' : 'overview');
  if (!(room.layouts || []).length) {
    return html`<div class="card empty"><h3>No layouts yet</h3><p class="soft">Add your furniture and preferences, then generate three layouts.</p>
      <button class="btn primary" disabled=${!(room.items || []).length} onClick=${() => { update(withFreshLayouts(room)); toast('Three layouts generated.', 'good'); }}>Generate 3 layouts</button></div>`;
  }
  if (view === 'editor' && chosen) return html`<${Editor} room=${room} update=${update} layout=${chosen} onOverview=${() => setView('overview')} onShop=${() => setStep('shop')} />`;
  const choose = (l) => { update({ chosen_layout_id: l.id }); setView('editor'); toast(`${E.VARIANT_INFO[l.variant].name} layout chosen. Drag pieces to fine-tune it.`, 'good'); };
  const generated = room.layouts.filter((l) => l.variant !== 'custom');
  const info = generated.find((l) => l.set_count) || null;
  const round = room.layout_round || 0;
  // Regenerate steps through backup design sets; Previous steps back. Your edit is kept either way.
  const showSet = (dir) => {
    const count = info ? info.set_count : 1;
    const next = dir < 0 ? (round - 1 + count) % count : round + 1;
    const fresh = makeLayouts(room, [], next);
    const custom = room.layouts.filter((l) => l.variant === 'custom');
    update({ layouts: [...fresh, ...custom], layouts_sig: roomSig(room), layout_round: next, chosen_layout_id: room.chosen_layout_id === 'custom' && custom.length ? 'custom' : null });
    const f = fresh[0];
    if (f.set_count > 1) toast(`Design set ${f.set_index + 1} of ${f.set_count}: three ${dir < 0 ? 'earlier' : 'new'} layouts.`, 'good');
    else toast('This room only fits one good set of layouts. Drag pieces yourself to try other ideas.');
  };
  return html`<div class="stack" style="gap:16px">
    <div class="spread"><p class="soft" style="max-width:52em">Three ways to arrange what you own. Each one keeps the doorway clear and checks walkways. Pick one to fine-tune and shop for, or regenerate for a different set.</p>
      <div class="row">
        ${info && info.set_count > 1 && html`<span class="small soft num" aria-live="polite">Set ${info.set_index + 1} of ${info.set_count}</span>`}
        ${info && info.set_count > 1 && html`<button class="btn small ghost" onClick=${() => showSet(-1)}>Previous set</button>`}
        <button class="btn small" onClick=${() => showSet(1)}>Regenerate</button>
      </div></div>
    <div class="layout-grid">${room.layouts.map((l) => html`<${LayoutCard} key=${l.id} room=${room} layout=${l} chosen=${room.chosen_layout_id === l.id} onChoose=${() => choose(l)} />`)}</div>
  </div>`;
}

function LayoutCard({ room, layout, chosen, onChoose }) {
  const info = E.VARIANT_INFO[layout.variant];
  const [more, setMore] = useState(false);
  const warns = more ? layout.warnings : layout.warnings.slice(0, 2);
  return html`<article class=${`card layout-card ${chosen ? 'chosen' : ''}`}>
    <header><div class="stack" style="gap:3px"><h3>${info.name}</h3><p class="small soft">${info.blurb}</p></div><${ScoreBadge} score=${layout.score} /></header>
    <div class="plan-wrap"><${Plan} room=${room} placements=${layout.placements} slots=${layout.slots} title=${`${info.name} layout`} /></div>
    <div class="body">
      <${Bars} breakdown=${layout.breakdown} />
      ${layout.warnings.length > 0 ? html`<ul class="warnlist">${warns.map((w, i) => html`<li key=${i}>${w}</li>`)}</ul>${layout.warnings.length > 2 && html`<button class="btn-link small" onClick=${() => setMore(!more)}>${more ? 'Show fewer' : `Show ${layout.warnings.length - 2} more`}</button>`}`
        : html`<ul class="warnlist oklist"><li>No clearance problems</li></ul>`}
      ${layout.slots.length > 0 && html`<p class="small soft">${layout.slots.filter((s) => s.category).length ? `Gaps to fill: ${layout.slots.filter((s) => s.category).map((s) => E.label(s.category).toLowerCase()).join(', ')}.` : `${plural(layout.slots.length, 'free space')} you could shop for.`}</p>`}
      <ul class="sr-only">${layout.placements.map((p) => html`<li key=${p.ref_id}>${p.name}: ${p.w} by ${p.d} cm, ${p.x} cm from the left and ${p.y} cm from the top.</li>`)}</ul>
      <button class=${`btn ${chosen ? '' : 'primary'}`} onClick=${onChoose}>${chosen ? 'Chosen: edit this layout' : 'Use this layout'}</button>
    </div>
  </article>`;
}

function Editor({ room, update, layout, onOverview, onShop }) {
  const [sel, setSel] = useState(null);
  const [selSpot, setSelSpot] = useState(null);
  const [history, setHistory] = useState([]);
  const er = engineRoom(room);
  const goal = room.goal;
  const items = goal === 'replace' ? (room.items || []).filter((i) => i.keep) : room.items || [];
  // Spots stay put when the user has moved one, or when they mark the footprint of a piece being replaced.
  const fixed = layout.slots_custom ? layout.slots : goal === 'replace' ? layout.slots.filter((s) => s.kind === 'replace') : null;
  const snapshot = () => setHistory([...history.slice(-19), { placements: layout.placements, slots: layout.slots, slots_custom: Boolean(layout.slots_custom) }]);
  const errorsFor = (placements) => {
    const errs = E.validateLayout(er, placements).errors.slice();
    for (const sl of fixed || []) {
      for (const p of placements) {
        if (E.overlaps(p, sl)) errs.push({ code: 'slot', message: `${p.name} is in the ${sl.category ? `spot kept for the new ${E.label(sl.category).toLowerCase()}` : 'free space you kept'}. Move that spot first.` });
      }
    }
    return errs;
  };
  const saveCustom = (placements, slotsFixed, note) => {
    const rebuilt = E.rebuildLayout(er, items, placements, goal, 'custom', slotsFixed);
    const custom = { ...rebuilt, id: 'custom', variant: 'custom', slots_custom: Boolean(layout.slots_custom) };
    update({ layouts: [...room.layouts.filter((l) => l.variant !== 'custom'), custom], chosen_layout_id: 'custom' });
    if (note) toast(note);
  };
  const commit = (placements, note) => { snapshot(); saveCustom(placements, fixed, note); };
  const tryPlacements = (placements) => {
    const errs = errorsFor(placements);
    if (errs.length) { toast(`Can't put it there: ${errs[0].message}`, 'bad'); return false; }
    commit(placements);
    return true;
  };
  const move = (id, pos) => tryPlacements(layout.placements.map((p) => (p.ref_id === id ? { ...p, ...pos } : p)));
  const validateMove = (id, pos) => {
    const errs = errorsFor(layout.placements.map((p) => (p.ref_id === id ? { ...p, ...pos } : p)));
    return errs.length ? errs[0].message : null;
  };
  const rotate = (id) => {
    const p = layout.placements.find((x) => x.ref_id === id);
    if (!p || p.locked) return;
    const W = room.width_cm, L = room.length_cm;
    const cx = p.x + p.w / 2, cy = p.y + p.d / 2;
    const nw = p.d, nd = p.w, rot = p.rotation === 90 ? 0 : 90;
    let x = Math.round((cx - nw / 2) / 5) * 5, y = Math.round((cy - nd / 2) / 5) * 5;
    x = Math.max(0, Math.min(W - nw, x)); y = Math.max(0, Math.min(L - nd, y));
    if (E.WALL_CATS.has(p.category)) {
      if (rot === 90) x = cx < W / 2 ? 0 : W - nw; else y = cy < L / 2 ? 0 : L - nd;
    }
    tryPlacements(layout.placements.map((q) => (q.ref_id === id ? { ...q, x, y, w: nw, d: nd, rotation: rot } : q)));
  };
  const toggleLock = (id) => {
    const placements = layout.placements.map((q) => (q.ref_id === id ? { ...q, locked: !q.locked } : q));
    const p = placements.find((q) => q.ref_id === id);
    commit(placements, p.locked ? `${p.name} locked. Regenerate to rearrange everything else around it.` : `${p.name} unlocked.`);
  };
  const onKey = (id, e) => {
    const step = e.shiftKey ? 25 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    const p = layout.placements.find((x) => x.ref_id === id);
    if (!p) return;
    if (d) {
      e.preventDefault();
      if (p.locked) { toast(`${p.name} is locked. Unlock it to move it.`); return; }
      move(id, { x: p.x + d[0], y: p.y + d[1] });
    } else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotate(id); }
    else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleLock(id); }
  };
  const spots = spotTools(room, update, layout, snapshot);
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    const slotsFixed = prev.slots_custom ? prev.slots : goal === 'replace' ? prev.slots.filter((s) => s.kind === 'replace') : null;
    const rebuilt = E.rebuildLayout(er, items, prev.placements, goal, 'custom', slotsFixed);
    update({ layouts: [...room.layouts.filter((l) => l.variant !== 'custom'), { ...rebuilt, id: 'custom', variant: 'custom', slots_custom: prev.slots_custom }], chosen_layout_id: 'custom' });
  };
  const locked = layout.placements.filter((p) => p.locked);
  const regenerate = () => {
    const next = (room.layout_round || 0) + 1;
    const fresh = makeLayouts(room, locked, next);
    const custom = room.layouts.filter((l) => l.variant === 'custom');
    update({ layouts: [...fresh, ...custom], layouts_sig: roomSig(room), layout_round: next });
    toast(`Three new layouts built around ${plural(locked.length, 'locked piece')}.`, 'good');
    onOverview();
  };
  const selected = layout.placements.find((p) => p.ref_id === sel);
  const spot = layout.slots.find((s) => s.id === selSpot);
  const info = E.VARIANT_INFO[layout.variant];
  const pickPiece = (id) => { setSel(id); setSelSpot(null); };
  const pickSpot = (id) => { setSelSpot(id); setSel(null); };
  return html`<div class="editor">
    <div class="card plan-card">
      <div class="spread" style="padding:4px 6px 8px"><div class="stack" style="gap:2px"><h3>${info.name} layout</h3><span class="small soft">Drag your furniture or the dotted spots, snapping to 5 cm. Pieces snap to walls.</span></div><${ScoreBadge} score=${layout.score} /></div>
      <${PlanOr3D} room=${room} placements=${layout.placements} slots=${layout.slots} editable=${true} selectedId=${sel} onSelect=${pickPiece} onDrop=${move} validateMove=${validateMove} onKey=${onKey}
        editableSlots=${true} onSlotClick=${pickSpot} selectedSlotId=${selSpot} onSlotDrop=${spots.move} validateSlotMove=${spots.validate} onSlotKey=${spots.key}
        title=${`${info.name} layout, editable`} hint3d="Tap a piece or spot to select it; switch to Plan to drag." />
      <div class="plan-legend"><span><i class="lg-owned"></i>Your furniture</span><span><i class="lg-slot"></i>Spot for a new piece: drag to move</span><span><i class="lg-door"></i>Door swing</span></div>
    </div>
    <div class="stack">
      <div class="card tool-panel">
        ${selected ? html`<div class="sel-card">
            <div class="row"><${PieceArt} category=${selected.category} w=${selected.rotation === 90 ? selected.d : selected.w} d=${selected.rotation === 90 ? selected.w : selected.d} size=${56} /><div class="stack" style="gap:1px"><b>${selected.name}</b><span class="small soft num">${selected.w} × ${selected.d} cm at ${selected.x}, ${selected.y}</span></div></div>
            <div class="row">
              <button class="btn small" onClick=${() => rotate(selected.ref_id)} disabled=${selected.locked}>Rotate 90°</button>
              <button class="btn small" onClick=${() => toggleLock(selected.ref_id)} aria-pressed=${String(Boolean(selected.locked))}>${selected.locked ? 'Unlock' : 'Lock in place'}</button>
            </div>
            <span class="tiny faint">Keyboard: arrows move 5 cm (Shift for 25), <span class="kbd">R</span> rotates, <span class="kbd">L</span> locks.</span>
          </div>`
          : spot ? html`<div class="sel-card">
            <div class="row"><span class="spot-swatch" aria-hidden="true"></span><div class="stack" style="gap:1px"><b>${spotName(spot)}</b><span class="small soft num">${spot.w} × ${spot.d} cm at ${spot.x}, ${spot.y}</span></div></div>
            <p class="small soft">Drag the dotted spot to wherever you want the new piece. Whatever you pick for it in the next step goes there.</p>
            <div class="row">
              <button class="btn small" onClick=${() => spots.rotate(spot.id)}>Rotate spot</button>
              ${spots.canReset && html`<button class="btn small ghost" onClick=${spots.reset}>Reset spots</button>`}
            </div>
            <span class="tiny faint">Keyboard: arrows move it 5 cm (Shift for 25), <span class="kbd">R</span> rotates.</span>
          </div>`
          : html`<div class="sel-card"><b>Select a piece or a spot</b><span class="small soft">Tap your furniture to rotate or lock it. Tap a dotted spot to move where a new piece will go.</span>
            ${spots.canReset && html`<div><button class="btn small ghost" onClick=${spots.reset}>Reset spots</button></div>`}</div>`}
        <div class="stack" style="gap:8px">
          <button class="btn" onClick=${regenerate} disabled=${locked.length === 0}>Regenerate around ${locked.length ? plural(locked.length, 'locked piece') : 'locked pieces'}</button>
          <div class="row"><button class="btn ghost small" onClick=${undo} disabled=${!history.length}>Undo</button><button class="btn ghost small" onClick=${onOverview}>Compare all layouts</button></div>
        </div>
        <${Bars} breakdown=${layout.breakdown} />
        ${layout.warnings.length > 0 ? html`<ul class="warnlist">${layout.warnings.map((w, i) => html`<li key=${i}>${w}</li>`)}</ul>` : html`<ul class="warnlist oklist"><li>No clearance problems</li></ul>`}
        <button class="btn primary big" onClick=${onShop}>Next: complete this room</button>
      </div>
    </div>
  </div>`;
}

/* ---------- step 5: complete the room ---------- */
function ShopStep({ room, update, setStep, catalog }) {
  const s = useData();
  const layout = chosenLayout(room);
  const slots = layout ? layout.slots : [];
  const filled = new Set((room.shortlist || []).map((i) => i.slot_id));
  const [slotId, setSlotId] = useState(() => (slots.find((x) => !filled.has(x.id)) || slots[0] || {}).id || null);
  const [gapCat, setGapCat] = useState({});
  const [filters, setFilters] = useState(() => defaultFilters(s.profile));
  const [dialog, setDialog] = useState(null);
  useEffect(() => { if (slotId && !slots.some((x) => x.id === slotId)) setSlotId((slots[0] || {}).id || null); }, [layout && layout.id]);
  if (!layout) {
    return html`<div class="card empty"><h3>Choose a layout first</h3><p class="soft">Pick one of the three layouts, then come back to fill its gaps.</p><button class="btn primary" onClick=${() => setStep('layouts')}>See layouts</button></div>`;
  }
  const slot = slots.find((x) => x.id === slotId) || null;
  const category = slot && (slot.category || gapCat[slot.id] || '');
  const remaining = room.budget_cents - shortlistTotal(room, catalog, slot && slot.id);
  const results = slot && category ? searchSlot(catalog, slot, category, filters, remaining) : [];
  const total = shortlistTotal(room, catalog);
  const current = slot && (room.shortlist || []).find((i) => i.slot_id === slot.id);
  const addToRoom = (p, optionId) => {
    const list = (room.shortlist || []).filter((i) => i.slot_id !== slot.id);
    list.push({ slot_id: slot.id, product_key: p.key, option_id: optionId || null, category: p.category, added_at: nowIso() });
    update({ shortlist: list });
    toast(`${p.title} added to the ${E.label(p.category).toLowerCase()} gap.`, 'good');
    const nextOpen = slots.find((x) => x.id !== slot.id && !list.some((i) => i.slot_id === x.id));
    if (nextOpen) setSlotId(nextOpen.id);
  };
  const removeItem = (sid) => update({ shortlist: (room.shortlist || []).filter((i) => i.slot_id !== sid) });
  const prods = slotProducts(room, layout, catalog);
  const spots = spotTools(room, update, layout);
  return html`<div class="shop">
    <div class="stack sticky">
      <div class="card plan-card">
        <${PlanOr3D} room=${room} placements=${layout.placements} slots=${slots} products=${prods} onSlotClick=${setSlotId} selectedSlotId=${slotId}
          editableSlots=${true} onSlotDrop=${spots.move} validateSlotMove=${spots.validate} onSlotKey=${spots.key}
          title=${`${room.name} plan. Select a gap to shop for it, or drag it to move it.`} hint3d="Tap a purple gap to shop for it." />
        <div class="plan-legend"><span><i class="lg-owned"></i>Yours</span><span><i class="lg-new"></i>Added from your shortlist</span><span><i class="lg-slot"></i>Gap: tap to shop, drag to move</span>
          ${spots.canReset && html`<button class="btn-link small" onClick=${spots.reset}>Reset spots</button>`}</div>
      </div>
      ${slots.length > 0 && html`<div class="slot-chips" role="group" aria-label="Gaps in this layout">${slots.map((x) => html`<button key=${x.id} class=${`slot-chip ${filled.has(x.id) ? 'filled' : ''}`} aria-pressed=${String(x.id === slotId)} onClick=${() => setSlotId(x.id)}>
        <span class="dot"></span>${x.category ? E.label(x.category) : 'Free space'} <span class="num faint">${x.w} × ${x.d}</span></button>`)}</div>`}
      <${Shortlist} room=${room} layout=${layout} catalog=${catalog} total=${total} onRemove=${removeItem} onPick=${setSlotId} onCheckout=${() => setStep('checkout')} />
    </div>
    <div class="stack" style="gap:14px">
      ${slots.length === 0 && html`<div class="card empty"><h3>No gaps in this layout</h3><p class="soft">Everything you own is placed and nothing's missing. Change your goal to Fill the room or Replace to shop for pieces.</p><button class="btn" onClick=${() => setStep('prefs')}>Change goal</button></div>`}
      ${slot && html`<div class="results-head">
          <div class="stack" style="gap:3px"><span class="eyebrow">${slot.kind === 'replace' ? `Replacing your ${String(slot.replaces || '').toLowerCase()}` : slot.kind === 'gap' ? 'Free space' : 'Missing piece'}</span>
            <h3>${category ? `${E.label(category)}s that fit ${slot.w} × ${slot.d} cm` : `What would you like in this ${slot.w} × ${slot.d} cm space?`}</h3>
            <p class="small soft">Remaining budget <span class="num">${money(Math.max(0, remaining))}</span>${remaining < 0 ? html` <span class="err">(${money(-remaining)} over)</span>` : ''} · sorted by price, cheapest first</p></div>
        </div>
        ${slot.kind === 'gap' && html`<div class="field"><label for="gapcat">Piece for this space</label>
          <select id="gapcat" class="select" style="max-width:280px" value=${category} onChange=${(e) => setGapCat({ ...gapCat, [slot.id]: e.target.value })}>
            <option value="">Choose a type</option>
            ${E.CATEGORIES.filter((c) => { const p = E.smallestPreset(c); return E.fitInSlot({ width_cm: p.w, depth_cm: p.d }, slot); }).map((c) => html`<option value=${c}>${E.label(c)}</option>`)}
          </select></div>`}
        ${category && html`<${Filters} filters=${filters} setFilters=${setFilters} profile=${s.profile} />`}
        ${category && html`<div class="products">
          ${results.length === 0 && html`<div class="card empty"><h3>Nothing matches</h3><p class="soft">No ${E.label(category).toLowerCase()} fits this gap with these filters${filters.withinBudget ? ' and your remaining budget' : ''}.</p>
            <div class="row" style="justify-content:center"><button class="btn" onClick=${() => setFilters(defaultFilters(s.profile))}>Reset filters</button>${filters.withinBudget && html`<button class="btn ghost" onClick=${() => setFilters({ ...filters, withinBudget: false })}>Show over-budget pieces</button>`}</div></div>`}
          ${results.slice(0, 20).map((p) => html`<${ProductCard} key=${p.key} product=${p} slot=${slot} room=${room} current=${current} remaining=${remaining}
            onAdd=${(opt) => addToRoom(p, opt)} onCompare=${() => setDialog({ kind: 'compare', product: p })} onStore=${() => setDialog({ kind: 'store', store: p.store })}
            onReviews=${() => setDialog({ kind: 'reviews', product: p })} onPreview=${(opt) => setDialog({ kind: 'preview', product: p, option: opt })} />`)}
          ${results.length > 20 && html`<p class="small soft">Showing the first 20 of ${results.length}. Narrow it with filters.</p>`}
        </div>`}`}
    </div>
    ${dialog && dialog.kind === 'compare' && html`<${CompareDialog} product=${dialog.product} slot=${slot} catalog=${catalog} remaining=${remaining} onClose=${() => setDialog(null)} onAdd=${(p, opt) => { addToRoom(p, opt); setDialog(null); }} />`}
    ${dialog && dialog.kind === 'preview' && html`<${ProductDialog} product=${dialog.product} slot=${slot} initialOption=${dialog.option} current=${current} remaining=${remaining}
      onClose=${() => setDialog(null)} onAdd=${(opt) => { addToRoom(dialog.product, opt); setDialog(null); }} onStore=${() => setDialog({ kind: 'store', store: dialog.product.store })} />`}
    ${dialog && dialog.kind === 'store' && html`<${StoreDialog} store=${dialog.store} catalog=${catalog} onClose=${() => setDialog(null)} />`}
    ${dialog && dialog.kind === 'reviews' && html`<${ReviewsDialog} productKey=${dialog.product.key} catalog=${catalog} onClose=${() => setDialog(null)} />`}
  </div>`;
}

function Filters({ filters, setFilters, profile }) {
  const [open, setOpen] = useState(false);
  const f = filters;
  const set = (patch) => setFilters({ ...f, ...patch });
  const active = [];
  f.styles.forEach((v) => active.push([v, () => set({ styles: f.styles.filter((x) => x !== v) })]));
  f.cultural.forEach((v) => active.push([v, () => set({ cultural: f.cultural.filter((x) => x !== v) })]));
  f.colours.forEach((v) => active.push([v, () => set({ colours: f.colours.filter((x) => x !== v) })]));
  f.materials.forEach((v) => active.push([v, () => set({ materials: f.materials.filter((x) => x !== v) })]));
  f.badges.forEach((v) => active.push([v, () => set({ badges: f.badges.filter((x) => x !== v) })]));
  if (f.store !== 'all') active.push([f.store === 'small' ? 'Small businesses' : 'Large retailers', () => set({ store: 'all' })]);
  if (isWhole(toInt(f.priceMax)) && toInt(f.priceMax) > 0) active.push([`Up to $${f.priceMax}`, () => set({ priceMax: '' })]);
  return html`<div class="card filters">
    <div class="spread">
      <div class="row" style="gap:16px">
        <label class="toggle"><input type="checkbox" checked=${f.withinBudget} onChange=${(e) => set({ withinBudget: e.target.checked })} />Within budget</label>
        <label class="toggle"><input type="checkbox" checked=${f.renter} onChange=${(e) => set({ renter: e.target.checked })} />Renter-friendly${profile.persona === 'renter' ? ' (renter default)' : ''}</label>
      </div>
      <button class="btn ghost small" aria-expanded=${String(open)} onClick=${() => setOpen(!open)}>${open ? 'Hide filters' : `More filters${active.length ? ` (${active.length})` : ''}`}</button>
    </div>
    ${active.length > 0 && html`<div class="active-filters">${active.map(([l, rm]) => html`<button class="chip on" key=${l} onClick=${rm} aria-label=${`Remove filter ${l}`}>${l} <span class="x">×</span></button>`)}<button class="btn-link small" onClick=${() => setFilters({ ...defaultFilters(profile), withinBudget: f.withinBudget, renter: f.renter })}>Clear all</button></div>`}
    ${open && html`<div class="stack" style="gap:12px">
      <div class="filter-row"><span class="label">Store</span><${Seg} label="Store size" value=${f.store} options=${[['all', 'All stores'], ['small', 'Small businesses'], ['large', 'Large retailers']]} onChange=${(v) => set({ store: v })} /></div>
      <div class="filter-row"><span class="label">Owner badges (self-declared)</span><${Chips} multi=${true} options=${CAT.BADGES} value=${f.badges} onChange=${(v) => set({ badges: v })} /></div>
      <div class="filter-row"><span class="label">Style</span><${Chips} multi=${true} options=${CAT.STYLES} value=${f.styles} onChange=${(v) => set({ styles: v })} /></div>
      <div class="filter-row"><span class="label">Cultural style</span><${Chips} multi=${true} options=${CAT.CULTURAL} value=${f.cultural} onChange=${(v) => set({ cultural: v })} /></div>
      <div class="filter-row"><span class="label">Colour</span><${Chips} multi=${true} swatches=${true} options=${CAT.COLOURS} value=${f.colours} onChange=${(v) => set({ colours: v })} /></div>
      <div class="filter-row"><span class="label">Material</span><${Chips} multi=${true} options=${CAT.MATERIALS} value=${f.materials} onChange=${(v) => set({ materials: v })} /></div>
      <div class="filter-row" style="max-width:220px"><${NumField} id="pmax" label="Max price" unit="AUD" value=${f.priceMax} onInput=${(v) => set({ priceMax: v })} /></div>
    </div>`}
  </div>`;
}

function Stars({ value }) {
  const full = Math.round(value);
  return html`<span class="stars" aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

function ProductCard({ product: p, slot, room, current, remaining, onAdd, onCompare, onStore, onReviews, onPreview }) {
  const [opt, setOpt] = useState((p.options && p.options[0] && p.options[0].id) || '');
  const fit = E.fitInSlot(p, slot);
  const price = priceOf(p, opt);
  const inRoom = current && current.product_key === p.key;
  const over = price > remaining;
  const styleMatch = p.style_tags.includes(room.style);
  const culturalMatch = room.cultural_style && (p.cultural_tags || []).includes(room.cultural_style);
  const link = safeUrl(p.product_url) || safeUrl(p.store.website);
  return html`<article class=${`card product ${p.sponsoredSlot ? 'featured' : ''}`}>
    <button class="art-btn" onClick=${() => onPreview(opt)} aria-label=${`See ${p.title} in 3D`}>
      <${ProductArt} product=${p} optionId=${opt} size=${132} /><span class="art-badge">3D</span>
    </button>
    <div class="info">
      <div class="row" style="gap:6px">
        ${p.sponsoredSlot && html`<span class="tag sponsored">Sponsored</span>`}
        ${p.is_demo ? html`<span class="tag">Demo data</span>` : html`<span class="tag live">Live listing</span>`}
        ${styleMatch && html`<span class="tag">${room.style} match</span>`}
        ${culturalMatch && html`<span class="tag">${room.cultural_style}</span>`}
      </div>
      <div class="spread" style="align-items:flex-start"><button class="btn-link title" style="text-decoration:none;color:var(--ink);text-align:left" onClick=${() => onPreview(opt)}>${p.title}</button><span class="price">${money(price)}</span></div>
      <div class="store">
        <button class="btn-link" onClick=${onStore}>${p.store.business_name}</button>${p.store.suburb && html`<span>${p.store.suburb}</span>`}
        <span class=${`tag ${p.store.size === 'small' ? 'small-biz' : ''}`}>${p.store.size === 'small' ? 'Small business' : 'Large retailer'}</span>
        ${(p.store.badges || []).map((b) => html`<span class="tag" key=${b} title="Self-declared by the seller">${b}</span>`)}
        ${(p.store.badges || []).length > 0 && html`<span class="badge-note">badges self-declared</span>`}
      </div>
      <div class="specs">
        <span class="num">W ${p.width_cm} × D ${p.depth_cm} × H ${p.height_cm} cm</span>
        ${fit && html`<span class="fit-ok">Fits: ${fit.spareWide} cm spare wide, ${fit.spareDeep} cm deep</span>`}
        ${p.ratings > 0 ? html`<button class="btn-link small" style="text-decoration:none" onClick=${onReviews} aria-label=${`Rated ${p.rating.toFixed(1)} from ${p.ratings} ratings. Read or write reviews.`}><${Stars} value=${p.rating} /> <span class="num">${p.rating.toFixed(1)}</span> (${p.ratings})</button>`
          : html`<button class="btn-link small" onClick=${onReviews}>No reviews yet</button>`}
        ${!p.renter_friendly && html`<span>Wall-mounted: needs drilling</span>`}
        <span>${p.colour} · ${p.material}</span>
      </div>
      <div class="actions">
        ${p.options && p.options.length > 0 && html`<label class="sr-only" for=${`opt-${p.key}`}>Option for ${p.title}</label><select id=${`opt-${p.key}`} class="select optsel" value=${opt} onChange=${(e) => setOpt(e.target.value)}>
          ${p.options.map((o) => html`<option value=${o.id}>${o.name}${o.price_delta_cents ? ` (+${money(o.price_delta_cents)})` : ''}</option>`)}</select>`}
        ${inRoom && (current.option_id || '') === (opt || '') ? html`<button class="btn small" disabled>In your room</button>`
          : html`<button class=${`btn small ${over ? '' : 'primary'}`} onClick=${() => onAdd(opt || null)}>${current ? 'Swap into room' : 'Add to room'}</button>`}
        <button class="btn small ghost" onClick=${() => onPreview(opt)}>View in 3D</button>
        <button class="btn small ghost" onClick=${onCompare}>Compare</button>
        ${link ? html`<a class="btn small ghost" href=${link} target="_blank" rel="noopener noreferrer">Visit store ↗</a>` : html`<button class="btn small ghost" onClick=${onStore}>Visit store</button>`}
        ${over && html`<span class="small err">${money(price - remaining)} over budget</span>`}
      </div>
    </div>
  </article>`;
}

function Shortlist({ room, layout, catalog, total, onRemove, onPick, onCheckout }) {
  const items = room.shortlist || [];
  const pct = room.budget_cents ? Math.min(100, (total / room.budget_cents) * 100) : 0;
  const over = total > room.budget_cents;
  return html`<div class="card shortlist">
    <div class="spread"><h3>Shortlist</h3><span class="small soft">${plural(items.length, 'piece')}</span></div>
    ${items.length === 0 ? html`<p class="small soft">Pieces you add show up here and on the plan.</p>`
      : items.map((it) => {
        const p = catalog.map.get(it.product_key);
        const placed = layout.slots.some((x) => x.id === it.slot_id);
        const o = p && (p.options || []).find((x) => x.id === it.option_id);
        return html`<div class="sl-row" key=${it.slot_id}>
          <div class="stack" style="gap:1px;min-width:0">
            ${p ? html`<button class="btn-link" style="text-align:left;text-decoration:none;color:var(--ink)" onClick=${() => placed && onPick(it.slot_id)}>${p.title}</button>` : html`<span class="soft">No longer listed</span>`}
            <span class="tiny soft">${p ? p.store.business_name : ''}${o ? ` · ${o.name}` : ''}${placed ? '' : ' · not placed in this layout'}</span>
          </div>
          <span class="num">${p ? money(priceOf(p, it.option_id)) : '-'}</span>
          ${it.ordered ? html`<span class="tag live">Ordered</span>` : html`<button class="btn ghost small" aria-label=${`Remove ${p ? p.title : 'item'}`} onClick=${() => onRemove(it.slot_id)}>Remove</button>`}
        </div>`;
      })}
    <div class="total-line"><span class="soft small">Total vs budget</span><span><span class="num">${money(total)}</span> <span class="faint small">/ ${money(room.budget_cents)}</span></span></div>
    <div class=${`meter ${over ? 'over' : ''}`} role="img" aria-label=${`${Math.round((total / Math.max(1, room.budget_cents)) * 100)} percent of budget used`}><i style=${`width:${pct}%`}></i></div>
    ${over ? html`<p class="small err">Over budget by ${money(total - room.budget_cents)}. Swap a piece for a cheaper one or raise the budget.</p>`
      : html`<p class="small soft">${money(room.budget_cents - total)} left to spend.</p>`}
    ${onCheckout && items.some((it) => !it.ordered) && html`<button class="btn primary" onClick=${onCheckout}>Go to checkout · ${plural(items.filter((it) => !it.ordered).length, 'piece')}</button>`}
  </div>`;
}

function FitNote({ product, slot }) {
  const fit = slot && E.fitInSlot(product, slot);
  if (!slot) return null;
  if (!fit) return html`<p class="small err">Doesn't fit the ${slot.w} × ${slot.d} cm spot.</p>`;
  return html`<div class="fit-row"><span class="fitpic small"><${FitPic} product=${product} slot=${slot} size=${64} /></span>
    <span class="small"><span class="fit-ok">Fits your ${slot.w} × ${slot.d} cm spot</span> with ${fit.spareWide} cm spare along the wall and ${fit.spareDeep} cm in depth.</span></div>`;
}

function OptionPicker({ product, value, onChange, id }) {
  if (!(product.options || []).length) return null;
  return html`<div class="field"><label for=${id}>Option</label><select id=${id} class="select optsel" value=${value || ''} onChange=${(e) => onChange(e.target.value)}>
    ${product.options.map((o) => html`<option value=${o.id}>${o.name}${o.price_delta_cents ? ` (+${money(o.price_delta_cents)})` : ''}</option>`)}</select></div>`;
}

function StoreLine({ store }) {
  return html`<span class="store">${store.business_name}${store.suburb ? html` <span class="faint">· ${store.suburb}</span>` : ''}
    <span class=${`tag ${store.size === 'small' ? 'small-biz' : ''}`}>${store.size === 'small' ? 'Small business' : 'Large retailer'}</span></span>`;
}

// Full look at one product before adding it: 3D model, options, fit and store.
function ProductDialog({ product: p, slot, initialOption, current, remaining, onClose, onAdd, onStore }) {
  const [opt, setOpt] = useState(initialOption || ((p.options || [])[0] || {}).id || '');
  const price = priceOf(p, opt);
  const inRoom = current && current.product_key === p.key && (current.option_id || '') === (opt || '');
  return html`<${Dialog} title=${p.title} sub=${p.is_demo ? 'Demo product. 3D model drawn from its listed size, colour and material.' : 'Live listing from a Removaters seller.'} onClose=${onClose} wide=${true}
    footer=${html`<button class="btn ghost" onClick=${onClose}>Close</button>${onAdd && (inRoom ? html`<button class="btn" disabled>In your room</button>`
      : html`<button class="btn primary" onClick=${() => onAdd(opt || null)}>${current ? 'Swap into room' : 'Add to room'} · ${money(price)}</button>`)}`}>
    <div class="preview-grid">
      <div class="stack" style="gap:6px"><${Product3D} product=${p} optionId=${opt} /><span class="tiny faint">Drag to turn it. Scroll or pinch to zoom. The model is drawn from the listed size, colour and material.</span>
        ${p.image_url && html`<div class="row" style="gap:10px;flex-wrap:nowrap"><img class="photo-thumb" src=${p.image_url} alt=${`Seller's photo of ${p.title}`} /><span class="tiny soft">Seller's photo</span></div>`}</div>
      <div class="stack">
        <div class="spread"><span class="price big num">${money(price)}</span>${p.ratings > 0 && html`<span class="small"><${Stars} value=${p.rating} /> <span class="num">${p.rating.toFixed(1)}</span> (${p.ratings})</span>`}</div>
        ${remaining != null && price > remaining && html`<p class="small err">${money(price - remaining)} over your remaining budget.</p>`}
        <${StoreLine} store=${p.store} />
        <${OptionPicker} product=${p} value=${opt} onChange=${setOpt} id=${`pv-opt-${p.key}`} />
        <dl class="specs-list">
          <dt>Size</dt><dd class="num">W ${p.width_cm} × D ${p.depth_cm} × H ${p.height_cm} cm</dd>
          <dt>Colour</dt><dd>${p.colour}</dd>
          <dt>Material</dt><dd>${p.material}</dd>
          <dt>Style</dt><dd>${[...p.style_tags, ...(p.cultural_tags || [])].join(', ')}</dd>
          <dt>Fitting</dt><dd>${p.renter_friendly ? 'Freestanding, renter-friendly' : 'Wall-mounted: needs drilling'}</dd>
        </dl>
        <${FitNote} product=${p} slot=${slot} />
        ${onStore && html`<div><button class="btn small ghost" onClick=${onStore}>${p.store.website || p.product_url ? 'Visit store' : 'Store page'}</button></div>`}
      </div>
    </div>
  </${Dialog}>`;
}

// Every other store's piece that fits the same spot, each with a picture; open one to see it in 3D before adding.
function CompareDialog({ product, slot, catalog, remaining, onClose, onAdd }) {
  const alts = catalog.list
    .filter((p) => p.category === product.category && p.key !== product.key && slot && E.fitInSlot(p, slot))
    .sort((a, b) => a.base_price_cents - b.base_price_cents);
  const [open, setOpen] = useState(alts.length ? alts[0].key : null);
  const [opts, setOpts] = useState({});
  const optFor = (p) => (opts[p.key] !== undefined ? opts[p.key] : ((p.options || [])[0] || {}).id || '');
  const row = (p, isCurrent) => {
    const diff = p.base_price_cents - product.base_price_cents;
    const expanded = open === p.key;
    const opt = optFor(p);
    const price = priceOf(p, opt);
    return html`<div class=${`compare-item ${expanded ? 'open' : ''} ${isCurrent ? 'current' : ''}`} key=${p.key}>
      <button class="compare-head" aria-expanded=${String(expanded)} onClick=${() => setOpen(expanded ? null : p.key)}>
        <${ProductArt} product=${p} optionId=${opt} size=${88} />
        <span class="stack" style="gap:2px;min-width:0;text-align:left">
          <b class="compare-title">${p.title}</b>
          <span class="tiny soft">${p.store.business_name} · <span class=${p.store.size === 'small' ? 'fit-ok' : ''}>${p.store.size === 'small' ? 'Small business' : 'Large retailer'}</span></span>
          <span class="tiny soft num">${p.width_cm} × ${p.depth_cm} × ${p.height_cm} cm${p.ratings ? ` · ★ ${p.rating.toFixed(1)}` : ''}</span>
        </span>
        <span class="stack" style="gap:0;text-align:right;flex:none">
          <span class="num">${money(price)}</span>
          ${isCurrent ? html`<span class="tiny soft">your pick</span>` : html`<span class=${`tiny num ${diff > 0 ? 'diff-up' : diff < 0 ? 'diff-down' : ''}`}>${diff === 0 ? 'same price' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}</span>`}
        </span>
        <span class="chev" aria-hidden="true">${expanded ? '▴' : '▾'}</span>
      </button>
      ${expanded && html`<div class="compare-body">
        <${Product3D} product=${p} optionId=${opt} />
        <div class="stack">
          <${OptionPicker} product=${p} value=${opt} onChange=${(v) => setOpts({ ...opts, [p.key]: v })} id=${`cmp-opt-${p.key}`} />
          <p class="small soft">${p.colour} · ${p.material} · ${p.renter_friendly ? 'freestanding' : 'wall-mounted'}${(p.store.badges || []).length ? ` · ${p.store.badges.join(', ')} (self-declared)` : ''}</p>
          <${FitNote} product=${p} slot=${slot} />
          ${remaining != null && price > remaining && html`<p class="small err">${money(price - remaining)} over your remaining budget.</p>`}
          ${isCurrent ? html`<p class="small soft">This is the piece you're comparing against.</p>` : html`<div><button class="btn primary small" onClick=${() => onAdd(p, opt || null)}>Add to room · ${money(price)}</button></div>`}
        </div>
      </div>`}
    </div>`;
  };
  return html`<${Dialog} title=${`Compare ${E.label(product.category).toLowerCase()}s`} sub=${`Every store's ${E.label(product.category).toLowerCase()} that fits your ${slot ? `${slot.w} × ${slot.d} cm` : ''} spot, cheapest first. Open one to see it in 3D.`} onClose=${onClose} wide=${true}>
    ${row(product, true)}
    ${alts.length === 0 ? html`<p class="soft">No other store has a ${E.label(product.category).toLowerCase()} that fits this spot.</p>` : alts.map((p) => row(p, false))}
  </${Dialog}>`;
}

function StoreDialog({ store, catalog, onClose }) {
  const items = catalog.list.filter((p) => p.seller_id === store.id);
  const site = safeUrl(store.website);
  return html`<${Dialog} title=${store.business_name} sub=${store.is_demo ? 'Demo store page. Real sellers link their own website here.' : 'Seller on Removaters.'} onClose=${onClose} wide=${true}>
    <div class="row"><span class=${`tag ${store.size === 'small' ? 'small-biz' : ''}`}>${store.size === 'small' ? 'Small business' : 'Large retailer'}</span>${store.suburb && html`<span class="small soft">${store.suburb}, Sydney</span>`}${(store.badges || []).map((b) => html`<span class="tag" key=${b}>${b}</span>`)}</div>
    ${store.about && html`<p class="small">${store.about}</p>`}
    ${site && html`<p><a class="btn small" href=${site} target="_blank" rel="noopener noreferrer">Visit ${hostOf(site)} ↗</a></p>`}
    ${(store.badges || []).length > 0 && html`<p class="small faint">Badges are self-declared by the seller. Verification is planned.</p>`}
    <div class="store-grid">
      ${items.map((p) => html`<div class="store-item" key=${p.key}>
        <${ProductArt} product=${p} size=${120} />
        <b class="small">${p.title}</b>
        <span class="tiny soft num">${p.width_cm} × ${p.depth_cm} × ${p.height_cm} cm</span>
        <span class="num small">${money(p.base_price_cents)}</span>
        ${safeUrl(p.product_url) && html`<a class="tiny" href=${safeUrl(p.product_url)} target="_blank" rel="noopener noreferrer">Product page ↗</a>`}
      </div>`)}
    </div>
  </${Dialog}>`;
}

function ReviewsDialog({ productKey, catalog, onClose }) {
  const s = useData();
  const p = catalog.map.get(productKey);
  const mine = s.myReviews[productKey];
  const [rating, setRating] = useState(mine ? mine.rating : 0);
  const [comment, setComment] = useState(mine ? mine.comment : '');
  if (!p) return null;
  const others = p.reviews.filter((r) => !(r.who === Data.myReviewer()));
  const save = () => {
    if (!rating) { toast('Pick a rating from 1 to 5 stars.', 'bad'); return; }
    Data.saveReview(productKey, { rating, comment: comment.trim().slice(0, 400), at: nowIso() });
    toast('Review saved.', 'good');
  };
  return html`<${Dialog} title=${`Reviews: ${p.title}`} sub=${`${p.store.business_name} · ${p.ratings ? `${p.rating.toFixed(1)} from ${p.ratings} ratings` : 'no ratings yet'}`} onClose=${onClose}>
    ${p.is_demo && html`<p class="small faint">Demo products start with a made-up rating. Reviews written here are real and added on top.</p>`}
    ${others.length === 0 ? html`<p class="small soft">No written reviews yet.</p>` : others.map((r, i) => html`<div key=${i} class="stack" style="gap:2px;padding-bottom:8px;border-bottom:1px dashed var(--rule)"><${Stars} value=${r.rating} /><p class="small">${r.comment || 'No comment.'}</p></div>`)}
    <div class="stack" style="gap:8px">
      <span class="label small soft"><b>Your review</b></span>
      <div class="star-input" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => html`<button key=${n} type="button" aria-pressed=${String(rating >= n)} aria-label=${`${n} star${n > 1 ? 's' : ''}`} onClick=${() => setRating(n)}>★</button>`)}</div>
      <label class="sr-only" for="rv">Comment</label>
      <textarea id="rv" class="textarea" rows="3" maxlength="400" placeholder="What was it like?" value=${comment} onInput=${(e) => setComment(e.target.value)}></textarea>
      <div class="row"><button class="btn primary small" onClick=${save}>${mine ? 'Update review' : 'Post review'}</button>${mine && html`<button class="btn ghost small" onClick=${() => { Data.saveReview(productKey, null); setRating(0); setComment(''); toast('Review removed.'); }}>Delete my review</button>`}</div>
    </div>
  </${Dialog}>`;
}

/* ---------- step 6: checkout ---------- */
// Demo fees: the full product would take these from each retailer's own delivery settings.
const FULFIL = {
  large: { deliver: { label: 'Home delivery', fee: 4900, eta: '5 to 7 business days' }, pickup: { label: 'Click and collect', fee: 0, eta: 'Ready in 2 days' } },
  small: { deliver: { label: 'Local delivery from the maker', fee: 2900, eta: '3 to 5 business days' }, pickup: { label: 'Pick up from the workshop', fee: 0, eta: 'Ready in 1 to 2 days' } },
};
const storeCode = (name) => (String(name).replace(/\(demo\)/i, '').match(/[A-Za-z]+/g) || ['RM']).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
const refNum = () => String(Math.floor(100000 + Math.random() * 900000));

// Unordered shortlist items grouped by store, each with its lines and subtotal.
function cartGroups(room, catalog) {
  const groups = new Map();
  for (const it of room.shortlist || []) {
    if (it.ordered) continue;
    const p = catalog.map.get(it.product_key);
    if (!p) continue;
    const g = groups.get(p.seller_id) || { store: p.store, store_id: p.seller_id, lines: [], subtotal: 0 };
    const o = (p.options || []).find((x) => x.id === it.option_id);
    const price = priceOf(p, it.option_id);
    g.lines.push({ it, p, option: o ? o.name : '', price });
    g.subtotal += price;
    groups.set(p.seller_id, g);
  }
  return [...groups.values()];
}

function CheckoutStep({ room, update, catalog, setStep }) {
  const s = useData();
  const groups = cartGroups(room, catalog);
  const [method, setMethod] = useState({});
  const [suburb, setSuburb] = useState(s.profile.suburb || '');
  const [err, setErr] = useState('');
  const [placed, setPlaced] = useState(null);
  const orders = room.orders || [];
  const how = (g) => method[g.store_id] || 'deliver';
  const fee = (g) => FULFIL[g.store.size === 'small' ? 'small' : 'large'][how(g)].fee;
  const itemsTotal = groups.reduce((a, g) => a + g.subtotal, 0);
  const feesTotal = groups.reduce((a, g) => a + fee(g), 0);
  const total = itemsTotal + feesTotal;
  const delivering = groups.some((g) => how(g) === 'deliver');
  const place = () => {
    if (delivering && !suburb.trim()) { setErr('Enter the suburb to deliver to, or switch every store to pickup.'); return; }
    setErr('');
    const order = {
      id: newId('order'), number: `RM-${new Date().getFullYear()}-${refNum()}`, created_at: nowIso(), demo_payment: true,
      suburb: delivering ? suburb.trim().slice(0, 60) : '',
      stores: groups.map((g) => {
        const f = FULFIL[g.store.size === 'small' ? 'small' : 'large'][how(g)];
        return {
          store_id: g.store_id, store_name: g.store.business_name, size: g.store.size, method: f.label, eta: f.eta, fee_cents: f.fee,
          ref: `${storeCode(g.store.business_name)}-${refNum()}`, status: 'Confirmed',
          lines: g.lines.map((l) => ({ product_key: l.p.key, seller_id: l.p.seller_id, title: l.p.title, category: l.p.category, option: l.option, price_cents: l.price, slot_id: l.it.slot_id })),
          subtotal_cents: g.subtotal,
        };
      }),
      items_cents: itemsTotal, fees_cents: feesTotal, total_cents: total,
    };
    const keys = new Set(groups.flatMap((g) => g.lines.map((l) => l.it.slot_id)));
    update({ orders: [...orders, order], shortlist: (room.shortlist || []).map((it) => (keys.has(it.slot_id) && !it.ordered ? { ...it, ordered: order.id } : it)) });
    if (delivering && suburb.trim() !== (s.profile.suburb || '')) Data.saveProfile({ suburb: suburb.trim().slice(0, 60) });
    Data.recordSales(order);
    setPlaced(order);
    window.scrollTo(0, 0);
    toast(`Order ${order.number} placed with ${plural(order.stores.length, 'store')}. Demo payment, no money moved.`, 'good');
  };
  if (placed) return html`<${OrderConfirmation} order=${placed} onDone=${() => setPlaced(null)} />`;
  return html`<div class="checkout">
    <div class="stack" style="gap:16px">
      ${groups.length === 0 ? html`<div class="card empty"><h3>${orders.length ? 'Everything on your shortlist is ordered' : 'Your cart is empty'}</h3>
          <p class="soft">${orders.length ? 'Add more pieces from Complete the room to place another order.' : 'Add pieces to your shortlist in Complete the room, then check out here in one go.'}</p>
          <button class="btn primary" onClick=${() => setStep('shop')}>Back to Complete the room</button></div>`
        : html`<div class="stack" style="gap:6px"><h3>One checkout, ${plural(groups.length, 'store')}</h3>
          <p class="small soft">Pay once here. Removaters sends each store its part of the order and its share of the payment.</p></div>
        ${groups.map((g) => {
          const opts = FULFIL[g.store.size === 'small' ? 'small' : 'large'];
          return html`<div class="card store-order" key=${g.store_id}>
            <div class="spread"><${StoreLine} store=${g.store} /><span class="num">${money(g.subtotal)}</span></div>
            ${g.lines.map((l) => html`<div class="cart-line" key=${l.it.slot_id}>
              <${ProductArt} product=${l.p} optionId=${l.it.option_id} size=${72} />
              <div class="stack" style="gap:1px;min-width:0"><b class="small">${l.p.title}</b><span class="tiny soft">${l.option ? `${l.option} · ` : ''}<span class="num">${l.p.width_cm} × ${l.p.depth_cm} × ${l.p.height_cm} cm</span></span></div>
              <span class="num small">${money(l.price)}</span>
            </div>`)}
            <div class="seg-row" role="radiogroup" aria-label=${`How to get the ${g.store.business_name} order`}>
              ${['deliver', 'pickup'].map((m) => html`<label class=${`radio-card ${how(g) === m ? 'on' : ''}`} key=${m}>
                <input type="radio" name=${`m-${g.store_id}`} checked=${how(g) === m} onChange=${() => setMethod({ ...method, [g.store_id]: m })} />
                <span class="stack" style="gap:0"><b class="small">${opts[m].label}</b><span class="tiny soft">${opts[m].eta} · ${opts[m].fee ? money(opts[m].fee) : 'Free'}</span></span>
              </label>`)}
            </div>
          </div>`;
        })}`}
      ${orders.length > 0 && html`<${OrderHistory} orders=${orders} />`}
    </div>
    ${groups.length > 0 && html`<div class="card summary sticky">
      <h3>Order summary</h3>
      <div class="sum-line"><span>Items (${groups.reduce((a, g) => a + g.lines.length, 0)})</span><span class="num">${money(itemsTotal)}</span></div>
      <div class="sum-line"><span>Delivery and pickup</span><span class="num">${feesTotal ? money(feesTotal) : 'Free'}</span></div>
      <div class="sum-line total"><span>Total</span><span class="num">${money(total)}</span></div>
      ${total > room.budget_cents && html`<p class="small err">${money(total - room.budget_cents)} over your ${money(room.budget_cents)} budget.</p>`}
      ${delivering && html`<div class="field"><label for="suburb">Deliver to suburb</label><input id="suburb" class="input" value=${suburb} placeholder="e.g. North Ryde" maxlength="60" onInput=${(e) => setSuburb(e.target.value)} /><span class="hint">Only the suburb, for delivery estimates.</span></div>`}
      <div class="notice warn"><span><b>Demo payment.</b> No card is needed and no money moves. The full product runs one secure checkout through a payment provider that pays each store its share.</span></div>
      ${err && html`<p class="err" role="alert">${err}</p>`}
      <button class="btn primary big" onClick=${place}>Place order · ${money(total)}</button>
      <p class="tiny faint">Stores and products marked Demo data are made up, so their orders go nowhere. Sales of live listings show up in that seller's Insights.</p>
    </div>`}
  </div>`;
}

function OrderConfirmation({ order, onDone }) {
  return html`<div class="card pad stack" style="max-width:860px;gap:16px">
    <div class="stack" style="gap:6px"><span class="eyebrow">Order placed</span><h2>Thanks! Order ${order.number}</h2>
      <p class="soft">One payment of <b class="num">${money(order.total_cents)}</b> covers ${plural(order.stores.length, 'store')}. Each store got its own order:</p></div>
    <div class="stack" style="gap:10px">${order.stores.map((st) => html`<div class="store-order" key=${st.ref}>
      <div class="spread"><b>${st.store_name}</b><span class="tag live">${st.status}</span></div>
      <p class="small soft">Store reference <span class="num">${st.ref}</span> · ${st.method} · ${st.eta}${order.suburb && /delivery/i.test(st.method) ? ` to ${order.suburb}` : ''}</p>
      <ul class="plain-list">${st.lines.map((l, i) => html`<li key=${i}><span>${l.title}${l.option ? ` · ${l.option}` : ''}</span><span class="num">${money(l.price_cents)}</span></li>`)}</ul>
    </div>`)}</div>
    <p class="small faint">Demo payment: no money moved, and demo stores don't receive orders.</p>
    <div><button class="btn" onClick=${onDone}>Back to checkout</button></div>
  </div>`;
}

function OrderHistory({ orders }) {
  return html`<div class="card pad stack" style="gap:10px"><h3>Past orders</h3>
    ${orders.slice().reverse().map((o) => html`<div class="sum-line" key=${o.id}>
      <span class="stack" style="gap:0"><b class="small num">${o.number}</b><span class="tiny soft">${new Date(o.created_at).toLocaleDateString('en-AU')} · ${o.stores.map((st) => st.store_name).join(', ')}</span></span>
      <span class="num small">${money(o.total_cents)}</span></div>`)}
  </div>`;
}

/* ===================== seller ===================== */
const FEATURE_PLANS = { weekly: { label: 'Weekly', price: 999, days: 7 }, monthly: { label: 'Monthly', price: 2999, days: 30 } };

// Links typed without https:// still work; anything that isn't a web link comes back null.
function normaliseUrl(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  const u = safeUrl(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
  if (!u) return null;
  try { return new URL(u).hostname.includes('.') ? u : null; } catch (e) { return null; }
}

function SellerProfileForm({ initial, onSave, onCancel, submitLabel }) {
  const [f, setF] = useState(() => ({ business_name: '', suburb: '', size: 'small', badges: [], website: '', about: '', ...(initial || {}) }));
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!f.business_name.trim()) return setErr('Enter your business name.');
    if (!f.suburb.trim()) return setErr('Enter your suburb.');
    const website = normaliseUrl(f.website);
    if (website === null) return setErr('Enter your website as a link, like https://yourshop.com.au, or leave it blank.');
    setErr('');
    onSave({ business_name: f.business_name.trim().slice(0, 80), suburb: f.suburb.trim().slice(0, 60), size: f.size, badges: f.badges, website, about: (f.about || '').trim().slice(0, 240) });
  };
  return html`<form class="stack" onSubmit=${submit} novalidate>
    <div class="grid2">
      <div class="field"><label for="bn">Business name</label><input id="bn" class="input" value=${f.business_name} onInput=${(e) => setF({ ...f, business_name: e.target.value })} /></div>
      <div class="field"><label for="sb">Suburb</label><input id="sb" class="input" value=${f.suburb} onInput=${(e) => setF({ ...f, suburb: e.target.value })} /></div>
    </div>
    <div class="field"><label for="sw">Website</label><input id="sw" class="input" inputmode="url" autocomplete="url" value=${f.website} placeholder="https://yourshop.com.au" onInput=${(e) => setF({ ...f, website: e.target.value })} />
      <span class="hint">Shoppers get a Visit store button that opens it. Each product can link to its own page too.</span></div>
    <div class="field"><label for="sa">About your shop <span class="faint">(optional)</span></label><textarea id="sa" class="textarea" rows="2" maxlength="240" value=${f.about} placeholder="Hand-made timber furniture from our Marrickville workshop." onInput=${(e) => setF({ ...f, about: e.target.value })}></textarea></div>
    <div class="field"><span class="label">Business size</span><${Seg} label="Business size" value=${f.size} options=${[['small', 'Small business'], ['large', 'Large retailer']]} onChange=${(v) => setF({ ...f, size: v })} />
      <span class="hint">Small businesses get a guaranteed spot in the top three results wherever they have a piece that fits.</span></div>
    <div class="field"><span class="label">Owner badges</span><${Chips} multi=${true} options=${CAT.BADGES} value=${f.badges} onChange=${(v) => setF({ ...f, badges: v })} />
      <span class="hint">Self-declared. Shoppers see them labelled that way and can filter by them.</span></div>
    ${err && html`<p class="err" role="alert">${err}</p>`}
    <div class="form-actions">${onCancel && html`<button type="button" class="btn ghost" onClick=${onCancel}>Cancel</button>`}<button class="btn primary" type="submit">${submitLabel || 'Save'}</button></div>
  </form>`;
}

/* ---------- insights: what sells and what reviews say ---------- */
const THEMES = [
  ['Build quality', /\b(sturdy|solid|well[- ]made|quality|steady|wobbl\w*|bow(s|ed|ing)?|flimsy|sag\w*|cheaply made)\b/i],
  ['Size and fit', /\b(fit|fits|fitted|size|height|tall|low|short|small|smaller|big|bigger|narrow|wide|cm)\b/i],
  ['Assembly', /\b(assembl\w*|set ?up|instructions|screws?|flat ?pack)\b/i],
  ['Delivery', /\b(arriv\w*|deliver\w*|shipping|scratch\w*|damag\w*|creas\w*|packag\w*|dent\w*)\b/i],
  ['Comfort', /\b(comfort\w*|firm|soft|cushion\w*|ergonomic|back ?rest)\b/i],
  ['Looks', /\b(looks?|beautiful|lovely|gorgeous|finish|colou?r|timber|stain|glow|stylish|grain)\b/i],
  ['Value', /\b(price|value|worth|cheap|expensive|money)\b/i],
];

function reviewThemes(reviews) {
  const out = [];
  for (const [name, re] of THEMES) {
    const hits = reviews.filter((r) => r.comment && re.test(r.comment));
    if (!hits.length) continue;
    const avg = hits.reduce((a, r) => a + r.rating, 0) / hits.length;
    out.push({ name, count: hits.length, avg, tone: avg >= 4 ? 'good' : avg >= 3 ? 'mixed' : 'bad' });
  }
  return out.sort((a, b) => b.count - a.count || b.avg - a.avg);
}

// Sales come from shoppers' checkouts (one tally per buyer), capped so one odd tally can't swamp the numbers.
function sellerInsights(seller, catalog, s, withDemo) {
  const sold = {};
  const docs = Object.values(s.salesDocs || {}).map((d) => (d && d.items) || {});
  if (s.mode !== 'cloud') docs.push(s.mySales || {});
  for (const items of docs) {
    for (const [k, v] of Object.entries(items)) {
      if (!v || typeof v !== 'object') continue;
      const units = Math.min(50, Math.max(0, Math.floor(Number(v.units) || 0)));
      const revenue = Math.min(units * 1000000, Math.max(0, Math.floor(Number(v.revenue_cents) || 0)));
      const cur = sold[k] || { units: 0, revenue: 0, last: '' };
      const last = String(v.last_at || '');
      sold[k] = { units: cur.units + units, revenue: cur.revenue + revenue, last: last > cur.last ? last : cur.last };
    }
  }
  // Demo shops made before demo history existed pick it up by product title.
  const seed = seller.is_demo ? new Map(CAT.DEMO_SELLER.products.map((d) => [d.title, d.demo_history])) : new Map();
  const historyOf = (p) => p.demo_history || seed.get(p.title) || null;
  const rows = (seller.products || []).map((p) => {
    const key = `${seller.id}:${p.id}`;
    const cp = catalog.map.get(key);
    const real = sold[key] || { units: 0, revenue: 0, last: '' };
    const demo = withDemo ? historyOf(p) : null;
    const reviews = [
      ...((cp && cp.reviews) || []).map((r) => ({ rating: r.rating, comment: r.comment || '', at: r.at || '', demo: false })),
      ...((demo && demo.reviews) || []).map((r) => ({ ...r, demo: true })),
    ];
    const units = real.units + (demo ? demo.units : 0);
    const revenue = real.revenue + (demo ? demo.units * p.base_price_cents : 0);
    const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
    return { p, key, units, revenue, realUnits: real.units, last: real.last, reviews, avg, themes: reviewThemes(reviews) };
  });
  const rated = rows.filter((r) => r.reviews.length > 0);
  const all = rows.flatMap((r) => r.reviews);
  const bySales = rows.slice().sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.p.title.localeCompare(b.p.title));
  const byRating = rated.slice().sort((a, b) => b.avg - a.avg || b.reviews.length - a.reviews.length);
  const anySold = bySales.length > 0 && bySales[0].units > 0;
  return {
    rows: bySales,
    hasDemo: (seller.products || []).some((p) => historyOf(p)),
    totals: {
      units: rows.reduce((a, r) => a + r.units, 0), revenue: rows.reduce((a, r) => a + r.revenue, 0),
      reviews: all.length, avg: all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : 0,
    },
    best: anySold ? bySales[0] : null,
    worst: anySold && bySales.length > 1 ? bySales[bySales.length - 1] : null,
    top: byRating[0] || null,
    bottom: byRating.length > 1 ? byRating[byRating.length - 1] : null,
  };
}

function SellerInsights({ ins, showDemo, setShowDemo }) {
  const [open, setOpen] = useState(null);
  const rows = ins.rows;
  if (!rows.length) return html`<div class="card empty"><h3>No listings yet</h3><p class="soft">Add products first. Their sales and reviews show up here.</p></div>`;
  const maxUnits = Math.max(1, ...rows.map((r) => r.units));
  const pick = (title, r, line, tone) => html`<div class=${`card insight ${tone}`}><span class="eyebrow">${title}</span>
    ${r ? html`<div class="row" style="flex-wrap:nowrap;gap:10px"><${ProductArt} product=${r.p} size=${56} /><div class="stack" style="gap:2px;min-width:0"><b class="small">${r.p.title}</b><span class="tiny soft">${line(r)}</span></div></div>`
      : html`<span class="small soft">Not enough data yet.</span>`}</div>`;
  const stars = (r) => `${r.avg.toFixed(1)} stars from ${plural(r.reviews.length, 'review')}`;
  const sales = (r) => `${plural(r.units, 'sale')} · ${money(r.revenue)}`;
  return html`<div class="stack" style="gap:16px">
    ${ins.hasDemo && html`<div class="notice warn spread"><span><b>Demo history.</b> This demo shop comes with made-up sales and reviews so there's something to look at. Real checkouts and reviews add on top.</span>
      <label class="toggle small" style="flex:none"><input type="checkbox" checked=${showDemo} onChange=${(e) => setShowDemo(e.target.checked)} />Include demo history</label></div>`}
    <div class="insight-grid">
      ${pick('Best seller', ins.best, sales, 'good')}
      ${pick('Slowest seller', ins.worst, sales, 'bad')}
      ${pick('Highest rated', ins.top, stars, 'good')}
      ${pick('Lowest rated', ins.bottom, stars, 'bad')}
    </div>
    <div class="card">
      <div class="table-wrap"><table class="listings insights-table"><thead><tr><th>Piece</th><th>Sold</th><th>Revenue</th><th>Rating</th><th>What reviews say</th></tr></thead><tbody>
        ${rows.map((r) => html`<tr key=${r.key}>
            <td><div class="row" style="flex-wrap:nowrap;gap:10px"><${ProductArt} product=${r.p} size=${48} /><b class="small">${r.p.title}</b></div></td>
            <td data-label="Sold"><div class="unit-bar"><span class="num">${r.units}</span><i aria-hidden="true"><b style=${`width:${Math.round((r.units / maxUnits) * 100)}%`}></b></i></div></td>
            <td class="num" data-label="Revenue">${money(r.revenue)}</td>
            <td data-label="Rating">${r.reviews.length ? html`<span class="nowrap"><span class="num">${r.avg.toFixed(1)}</span> <${Stars} value=${r.avg} /> <span class="small soft">(${r.reviews.length})</span></span>` : html`<span class="small soft">No reviews</span>`}</td>
            <td><div class="row" style="gap:6px">${r.themes.slice(0, 2).map((t) => html`<span class=${`theme ${t.tone}`} key=${t.name}>${t.name}</span>`)}
              ${r.reviews.length > 0 && html`<button class="btn small ghost" aria-expanded=${String(open === r.key)} onClick=${() => setOpen(open === r.key ? null : r.key)}>${open === r.key ? 'Hide' : 'Read more'}</button>`}</div></td>
          </tr>
          ${open === r.key && html`<tr class="detail-row" key=${`${r.key}-more`}><td colspan="5"><${ReviewBreakdown} row=${r} /></td></tr>`}`)}
      </tbody></table></div>
    </div>
    <p class="tiny faint">Sold counts come from Removaters checkouts. Reviews are written by shoppers. ${ins.hasDemo && showDemo ? 'Demo history is included and marked Demo.' : ''}</p>
  </div>`;
}

function ReviewBreakdown({ row }) {
  const ai = useAI(false);
  const [sum, setSum] = useState({ state: 'idle', text: '' });
  const counts = [5, 4, 3, 2, 1].map((n) => [n, row.reviews.filter((r) => Math.round(r.rating) === n).length]);
  const max = Math.max(1, ...counts.map(([, c]) => c));
  const written = row.reviews.filter((r) => r.comment);
  const ask = async () => {
    setSum({ state: 'busy', text: '' });
    const lines = written.slice(0, 40).map((r) => `- ${r.rating}/5: ${String(r.comment).replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
    const prompt = `You help a small furniture seller understand shopper reviews of one product.
Product: ${row.p.title} (${E.label(row.p.category)}, ${row.p.width_cm} x ${row.p.depth_cm} x ${row.p.height_cm} cm, ${money(row.p.base_price_cents)}).
Reviews, each a rating out of 5 then the shopper's words:
${lines}

Write 2 or 3 short, plain sentences for the seller: what shoppers like, what they complain about, and one concrete fix or listing change. Use only what the reviews say. No lists, headings or em dashes.`;
    try {
      const { text } = await AI.text(prompt, { modelTier: 'quick', onText: ({ text: t }) => setSum({ state: 'busy', text: t }) });
      setSum({ state: 'done', text });
    } catch (e) {
      setSum({ state: e && e.code === 'cancelled' ? 'idle' : 'error', text: AI.message(e) });
    }
  };
  return html`<div class="review-break">
    <div class="stack" style="gap:5px" aria-label="Ratings breakdown">
      ${counts.map(([n, c]) => html`<div class="star-bar" key=${n}><span class="tiny num">${n} ★</span><i><b style=${`width:${(c / max) * 100}%`}></b></i><span class="tiny num soft">${c}</span></div>`)}
    </div>
    <div class="stack" style="gap:10px;min-width:0">
      <div class="stack" style="gap:6px"><span class="eyebrow">What reviews mention</span>
        ${row.themes.length ? html`<div class="row" style="gap:6px">${row.themes.map((t) => html`<span class=${`theme ${t.tone}`} key=${t.name}>${t.name} · ${plural(t.count, 'review')} · ${t.tone === 'good' ? 'mostly happy' : t.tone === 'bad' ? 'mostly unhappy' : 'mixed'}</span>`)}</div>`
          : html`<span class="small soft">No common themes yet.</span>`}
      </div>
      ${ai && written.length > 0 && html`<div class="ai-box">
        ${sum.state === 'idle' && html`<button class="btn small" onClick=${ask}>Summarise these reviews with Claude</button>`}
        ${sum.state === 'busy' && html`<p class="small" aria-live="polite">${sum.text || 'Reading the reviews…'}</p>`}
        ${sum.state === 'done' && html`<p class="small"><b>Claude's summary:</b> ${sum.text}</p>`}
        ${sum.state === 'error' && html`<p class="small err" role="alert">${sum.text}</p>`}
      </div>`}
      <ul class="review-list">${row.reviews.slice(0, 8).map((r, i) => html`<li key=${i}><span class="nowrap"><${Stars} value=${r.rating} />${r.demo ? html` <span class="tag">Demo</span>` : ''}</span><span class="small">${r.comment || 'No comment.'}</span></li>`)}</ul>
      ${row.reviews.length > 8 && html`<span class="tiny faint">Showing 8 of ${row.reviews.length}.</span>`}
    </div>
  </div>`;
}

/* ---------- adding products ---------- */
// Photos are shrunk in the browser (longest side 480 px, JPEG) so a listing stays small enough to share.
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('type')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('size')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let side = 480, q = 0.8, out = '';
        for (let i = 0; i < 5; i++) {
          const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          const g = c.getContext('2d');
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', q);
          if (out.length <= 60000) break;
          side = Math.round(side * 0.8);
          q = Math.max(0.55, q - 0.08);
        }
        URL.revokeObjectURL(url);
        resolve(out);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function PhotoField({ value, onChange, id }) {
  const input = useRef(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    try { onChange(await shrinkPhoto(file)); } catch (x) {
      setErr(x && x.message === 'size' ? 'That photo is over 15 MB. Pick a smaller one.' : "That file isn't a photo we can read. Try a JPG or PNG.");
    }
    setBusy(false);
  };
  return html`<div class="field"><span class="label">Photo <span class="faint">(optional)</span></span>
    <div class="photo-field">
      ${value ? html`<img class="photo-thumb" src=${value} alt="Listing photo" />` : html`<span class="photo-thumb empty" aria-hidden="true">No photo</span>`}
      <div class="stack" style="gap:6px;align-items:flex-start">
        <button type="button" class="btn small" disabled=${busy} onClick=${() => input.current && input.current.click()}>${busy ? 'Resizing…' : value ? 'Change photo' : 'Upload a photo'}</button>
        <input ref=${input} id=${id} type="file" accept="image/*" hidden onChange=${pick} />
        ${value && html`<button type="button" class="btn-link small" onClick=${() => onChange('')}>Remove photo</button>`}
      </div>
    </div>
    <span class="hint">Shoppers see it on your listing. Without one they see a 3D model built from the size and colour.</span>
    ${err && html`<span class="err small" role="alert">${err}</span>`}
  </div>`;
}

function ProductForm({ initial, onClose, onSave, inline, notice }) {
  const isNew = !initial.id;
  const [f, setF] = useState(() => ({
    title: initial.title || '', category: initial.category || 'bookcase',
    width: initial.width_cm ? String(initial.width_cm) : '', depth: initial.depth_cm ? String(initial.depth_cm) : '', height: initial.height_cm ? String(initial.height_cm) : '',
    price: initial.base_price_cents ? String(initial.base_price_cents / 100) : '',
    styles: initial.style_tags || [], cultural: initial.cultural_tags || [], colour: initial.colour || 'natural wood', material: initial.material || 'solid wood',
    renter: initial.renter_friendly !== false, link: initial.product_url || '', photo: initial.image_url || '',
    options: (initial.options || []).map((o) => ({ id: o.id, name: o.name, type: o.type, delta: String(o.price_delta_cents / 100) })),
  }));
  const [errs, setErrs] = useState([]);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const setOpt = (i, patch) => setF((cur) => ({ ...cur, options: cur.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const pre = inline ? 'n' : 'e';
  const submit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const w = toInt(f.width), d = toInt(f.depth), h = toInt(f.height), price = Number(f.price);
    const link = normaliseUrl(f.link);
    const out = [];
    if (!f.title.trim()) out.push('Enter a title.');
    for (const [n, v] of [['Width', w], ['Depth', d], ['Height', h]]) if (!isWhole(v) || v < 1 || v > 400) out.push(`${n} must be a whole number from 1 to 400 cm.`);
    if (!(price > 0) || price > 100000) out.push('Price must be more than $0.');
    if (!f.styles.length) out.push('Pick at least one style.');
    if (link === null) out.push('Product page link must be a web link, like https://yourshop.com.au/desk, or left blank.');
    f.options.forEach((o, i) => {
      if (!o.name.trim()) out.push(`Option ${i + 1} needs a name.`);
      else if (SIZE_OPTION.test(o.name)) out.push(`Option ${i + 1} looks like a size. Each size needs its own listing.`);
      if (!(Number(o.delta) >= 0)) out.push(`Option ${i + 1} price difference must be $0 or more.`);
    });
    setErrs(out);
    if (out.length) return;
    onSave({
      ...(isNew ? { id: newId('p'), created_at: nowIso(), is_featured: false } : initial),
      title: f.title.trim().slice(0, 80), category: f.category, width_cm: w, depth_cm: d, height_cm: h,
      base_price_cents: Math.round(price * 100), style_tags: f.styles, cultural_tags: f.cultural, colour: f.colour, material: f.material,
      renter_friendly: f.renter, product_url: link || '', image_url: f.photo || '', updated_at: nowIso(),
      options: f.options.map((o) => ({ id: o.id || newId('o'), name: o.name.trim().slice(0, 40), type: o.type, price_delta_cents: Math.round(Number(o.delta) * 100) })),
    });
  };
  const body = html`<form class="stack" onSubmit=${submit} novalidate>
    ${notice && html`<div class="notice info"><span>${notice}</span></div>`}
    <div class="grid2">
      <div class="field"><label for=${`${pre}pt`}>Title</label><input id=${`${pre}pt`} class="input" value=${f.title} placeholder="Slim Hoop Pine Bookcase" onInput=${(e) => set({ title: e.target.value })} /></div>
      <div class="field"><label for=${`${pre}pc`}>Type</label><select id=${`${pre}pc`} class="select" value=${f.category} onChange=${(e) => set({ category: e.target.value })}>${E.CATEGORIES.map((c) => html`<option value=${c}>${E.label(c)}</option>`)}</select></div>
    </div>
    <div class="grid4">
      <${NumField} id=${`${pre}pw`} label="Width" unit="cm" value=${f.width} onInput=${(v) => set({ width: v })} />
      <${NumField} id=${`${pre}pd`} label="Depth" unit="cm" value=${f.depth} onInput=${(v) => set({ depth: v })} />
      <${NumField} id=${`${pre}ph`} label="Height" unit="cm" value=${f.height} onInput=${(v) => set({ height: v })} />
      <${NumField} id=${`${pre}pp`} label="Price" unit="AUD" step="0.01" value=${f.price} onInput=${(v) => set({ price: v })} />
    </div>
    <div class="grid2" style="align-items:start">
      <div class="field"><label for=${`${pre}pl`}>Product page link <span class="faint">(optional)</span></label><input id=${`${pre}pl`} class="input" inputmode="url" value=${f.link} placeholder="https://yourshop.com.au/products/oak-desk" onInput=${(e) => set({ link: e.target.value })} />
        <span class="hint">The Visit store button on this listing opens this page.</span></div>
      <${PhotoField} id=${`${pre}photo`} value=${f.photo} onChange=${(v) => set({ photo: v })} />
    </div>
    <span class="eyebrow" style="margin-top:4px">Design</span>
    <div class="field"><span class="label">Style (pick at least one)</span><${Chips} multi=${true} options=${CAT.STYLES} value=${f.styles} onChange=${(v) => set({ styles: v })} /></div>
    <div class="field"><span class="label">Cultural style (optional)</span><${Chips} multi=${true} options=${CAT.CULTURAL} value=${f.cultural} onChange=${(v) => set({ cultural: v })} /></div>
    <div class="grid2">
      <div class="field"><label for=${`${pre}pcol`}>Colour</label><select id=${`${pre}pcol`} class="select" value=${f.colour} onChange=${(e) => set({ colour: e.target.value })}>${CAT.COLOURS.map((c) => html`<option value=${c}>${c}</option>`)}</select></div>
      <div class="field"><label for=${`${pre}pmat`}>Material</label><select id=${`${pre}pmat`} class="select" value=${f.material} onChange=${(e) => set({ material: e.target.value })}>${CAT.MATERIALS.map((c) => html`<option value=${c}>${c}</option>`)}</select></div>
    </div>
    <label class="toggle"><input type="checkbox" checked=${f.renter} onChange=${(e) => set({ renter: e.target.checked })} />Renter-friendly (no drilling or wall mounting)</label>
    <div class="stack" style="gap:8px"><span class="label small soft"><b>Options</b> (colour, fabric or finish only)</span>
      ${f.options.map((o, i) => html`<div class="opt-row" key=${i}>
        <div class="field"><label for=${`${pre}on${i}`}>Name</label><input id=${`${pre}on${i}`} class="input" value=${o.name} placeholder="Black stain" onInput=${(e) => setOpt(i, { name: e.target.value })} /></div>
        <div class="field"><label for=${`${pre}ot${i}`}>Type</label><select id=${`${pre}ot${i}`} class="select" value=${o.type} onChange=${(e) => setOpt(i, { type: e.target.value })}><option value="colour">Colour</option><option value="fabric">Fabric</option><option value="finish">Finish</option></select></div>
        <${NumField} id=${`${pre}od${i}`} label="Extra cost" unit="AUD" step="0.01" value=${o.delta} onInput=${(v) => setOpt(i, { delta: v })} />
        <button type="button" class="btn ghost small" onClick=${() => setF((cur) => ({ ...cur, options: cur.options.filter((_, j) => j !== i) }))}>Remove</button>
      </div>`)}
      ${f.options.length < 4 && html`<div><button type="button" class="btn small" onClick=${() => setF((cur) => ({ ...cur, options: [...cur.options, { name: '', type: 'finish', delta: '0' }] }))}>Add an option</button></div>`}
    </div>
    ${errs.length > 0 && html`<div class="notice bad" role="alert"><div class="stack" style="gap:2px">${errs.map((x) => html`<span>${x}</span>`)}</div></div>`}
    ${inline ? html`<div class="form-actions"><button type="button" class="btn ghost" onClick=${onClose}>Clear form</button><button type="submit" class="btn primary">Publish listing</button></div>` : html`<button type="submit" class="sr-only">Save</button>`}
  </form>`;
  if (inline) {
    return html`<div class="card pad stack"><div class="stack" style="gap:4px"><h3>Type in a product</h3><p class="small soft">Every listing has one fixed size. Options change colour, fabric or finish only.</p></div>${body}</div>`;
  }
  return html`<${Dialog} title=${isNew ? 'Add a listing' : `Edit ${initial.title}`} sub="Every listing has one fixed size. Options change colour, fabric or finish only." onClose=${onClose} wide=${true}
    footer=${html`<button class="btn ghost" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${submit}>${isNew ? 'Publish listing' : 'Save changes'}</button>`}>
    ${body}
  </${Dialog}>`;
}

const EXAMPLE_PAGE = {
  link: 'https://example.com/products/leaning-ladder-bookcase',
  text: `Leaning Ladder Bookcase in Spotted Gum
$229.00 AUD
Five open shelves that lean against the wall, made by hand in our Marrickville workshop from solid spotted gum. No drilling needed.
Size: 60 cm wide x 32 cm deep x 175 cm high
Colour: natural timber
Style: Scandi, Japandi
Finish options: Natural oil, Black stain (+$25)`,
};

function ImportFromPage({ onFilled }) {
  const ai = useAI(false);
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fill = async () => {
    const url = normaliseUrl(link);
    if (url === null) { setErr('That link doesn’t look like a web address. Try https://yourshop.com.au/product.'); return; }
    if (text.trim().length < 20) { setErr('Paste the product details from that page first: title, size, price, colour.'); return; }
    setErr('');
    setBusy(true);
    const rough = parseListingText(text);
    let got = null, how = 'rules', dropped = [];
    if (ai) {
      const prompt = `You turn a furniture product page into a listing for a room-planning marketplace. Use only facts in the text. If a value is missing, use null. Never guess sizes.
Reply with only JSON like this example:
{"title":"Leaning Ladder Bookcase","category":"bookcase","width_cm":60,"depth_cm":32,"height_cm":175,"price_aud":229,"colour":"natural wood","material":"solid wood","styles":["Scandi"],"renter_friendly":true,"options":[{"name":"Black stain","type":"finish","extra_aud":25}]}
Rules:
- category is one of: ${E.CATEGORIES.join(', ')}; or null if it is none of these.
- Sizes are whole centimetres (convert mm or metres). Width is side to side, depth front to back, height floor to top.
- colour is one of: ${CAT.COLOURS.join(', ')}.
- material is one of: ${CAT.MATERIALS.join(', ')}.
- styles: zero to three of: ${CAT.STYLES.join(', ')}.
- renter_friendly is false only if it must be screwed or mounted to a wall.
- options: up to 4 colour, fabric or finish choices with their extra cost in AUD (0 if none). Never include size options.
Product page text:
"""
${text.slice(0, 6000)}
"""`;
      try { got = await AI.json(prompt, { modelTier: 'quick' }); how = 'ai'; } catch (e) {
        if (e && e.code !== 'unavailable') setErr(`${AI.message(e)} Filled what we could without Claude.`);
      }
    }
    const g = got && typeof got === 'object' && !Array.isArray(got) ? got : {};
    const int = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : NaN);
    const pickNum = (a, b) => (isWhole(a) && a >= 1 && a <= 400 ? a : isWhole(b) && b >= 1 && b <= 400 ? b : NaN);
    const options = Array.isArray(g.options) ? g.options.slice(0, 4).filter((o) => o && typeof o.name === 'string' && o.name.trim()).filter((o) => {
      if (SIZE_OPTION.test(o.name)) { dropped.push(o.name); return false; }
      return true;
    }).map((o) => ({ id: newId('o'), name: o.name.trim().slice(0, 40), type: ['colour', 'fabric', 'finish'].includes(o.type) ? o.type : 'finish', price_delta_cents: Math.max(0, Math.round((Number(o.extra_aud) || 0) * 100)) })) : [];
    const price = Number(g.price_aud) > 0 ? Number(g.price_aud) : rough.price;
    const product = {
      title: (typeof g.title === 'string' && g.title.trim() ? g.title.trim() : rough.title || '').slice(0, 80),
      category: normCategory(g.category) || rough.category || 'bookcase',
      width_cm: pickNum(int(g.width_cm), rough.width_cm), depth_cm: pickNum(int(g.depth_cm), rough.depth_cm), height_cm: pickNum(int(g.height_cm), rough.height_cm),
      base_price_cents: price > 0 ? Math.round(price * 100) : 0,
      colour: normColour(g.colour) || rough.colour || 'natural wood', material: normMaterial(g.material) || rough.material || 'solid wood',
      style_tags: normStyles(g.styles).length ? normStyles(g.styles) : rough.styles || [],
      renter_friendly: typeof g.renter_friendly === 'boolean' ? g.renter_friendly : rough.renter_friendly,
      product_url: url || '', options,
    };
    const missing = [['title', product.title], ['width', product.width_cm], ['depth', product.depth_cm], ['height', product.height_cm], ['price', product.base_price_cents], ['style', product.style_tags.length]].filter(([, v]) => !v).map(([n]) => n);
    setBusy(false);
    const note = `${how === 'ai' ? 'Claude filled this from your page text.' : 'Filled from your page text by simple matching.'} Check every field, sizes most of all, then publish.${missing.length ? ` Still needed: ${missing.join(', ')}.` : ''}${dropped.length ? ` Left out size options (${dropped.join(', ')}): each size needs its own listing.` : ''}`;
    onFilled(product, note);
  };
  return html`<div class="card pad stack">
    <div class="stack" style="gap:4px"><h3>From your product page</h3>
      <p class="small soft">Paste the link and the product details from that page. We fill in the listing form and nothing goes live until you check it and press Publish.</p></div>
    <div class="field"><label for="imp-link">Product page link</label><input id="imp-link" class="input" inputmode="url" value=${link} placeholder="https://yourshop.com.au/products/oak-desk" onInput=${(e) => setLink(e.target.value)} />
      <span class="hint">Shoppers' Visit store button opens it. Removaters can't open your site from here, so paste the details below too.</span></div>
    <div class="field"><label for="imp-text">Product details from the page</label>
      <textarea id="imp-text" class="textarea" rows="8" maxlength="6000" value=${text} placeholder=${'Title, price, size, colour, material, options…'} onInput=${(e) => setText(e.target.value)}></textarea>
      <span class="hint">${ai ? 'Claude reads this and fills the form.' : ai === false ? 'Claude isn’t available here, so we match sizes, price and colour from the text.' : 'Checking whether Claude is available…'}</span></div>
    ${err && html`<p class="err small" role="alert">${err}</p>`}
    <div class="form-actions"><button type="button" class="btn ghost" onClick=${() => { setLink(EXAMPLE_PAGE.link); setText(EXAMPLE_PAGE.text); setErr(''); }}>Use an example page</button>
      <button type="button" class="btn primary" disabled=${busy} onClick=${fill}>${busy ? 'Reading…' : 'Fill the listing form'}</button></div>
  </div>`;
}

/* CSV: a header row, then one product per row. Tabs work too, so rows pasted from a spreadsheet are fine. */
const CSV_COLS = {
  title: ['title', 'name', 'product', 'product name'], category: ['type', 'category', 'kind'],
  width: ['width_cm', 'width', 'w'], depth: ['depth_cm', 'depth', 'd'], height: ['height_cm', 'height', 'h'],
  price: ['price', 'price_aud', 'aud', 'cost'], colour: ['colour', 'color'], material: ['material'],
  styles: ['styles', 'style'], link: ['product_url', 'url', 'link', 'product page', 'page'], renter: ['renter_friendly', 'renter', 'freestanding'],
};
const CSV_EXAMPLE = `title,type,width_cm,depth_cm,height_cm,price,colour,material,styles,product_url
Ash Slat Bedside,bedside-table,42,35,55,139,natural wood,solid wood,Scandi;Japandi,https://example.com/products/ash-slat-bedside
Cane Panel Bookcase,bookcase,75,30,170,269,natural wood,rattan,Boho;Coastal,https://example.com/products/cane-panel-bookcase
Steel Frame Desk,desk,110,55,75,219,black,metal,Industrial;Minimal,https://example.com/products/steel-frame-desk
Corner Reading Lamp,floor-lamp,35,35,150,0,white,metal,Minimal,`;

function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/)[0] || '';
  const sep = first.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function csvToDrafts(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: 'Add a header row and at least one product row.', drafts: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [k, names] of Object.entries(CSV_COLS)) col[k] = head.findIndex((h) => names.includes(h));
  const need = ['title', 'category', 'width', 'depth', 'height', 'price'].filter((k) => col[k] < 0);
  if (need.length) return { error: `Missing columns: ${need.join(', ')}. Start with the example to see the layout.`, drafts: [] };
  const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] || '').trim() : '');
  const drafts = rows.slice(1, 101).map((r, i) => {
    const link = normaliseUrl(get(r, 'link'));
    const d = {
      line: i + 2, title: get(r, 'title').slice(0, 80), category: normCategory(get(r, 'category')),
      width_cm: toInt(get(r, 'width')), depth_cm: toInt(get(r, 'depth')), height_cm: toInt(get(r, 'height')),
      price: Number(get(r, 'price').replace(/[$,\s]|aud/gi, '')),
      colour: normColour(get(r, 'colour')) || (col.colour < 0 ? 'natural wood' : ''), material: normMaterial(get(r, 'material')) || (col.material < 0 ? 'solid wood' : ''),
      styles: normStyles(get(r, 'styles')), product_url: link,
      renter_friendly: !/^(no|false|n|0)$/i.test(get(r, 'renter')),
    };
    return { ...d, problems: listingProblems(d) };
  });
  return { error: rows.length > 101 ? 'Only the first 100 rows are read. Split bigger ranges into several files.' : '', drafts };
}

function CsvImport({ onPublish }) {
  const input = useRef(null);
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? csvToDrafts(text) : null), [text]);
  const good = parsed ? parsed.drafts.filter((d) => !d.problems.length) : [];
  const bad = parsed ? parsed.drafts.filter((d) => d.problems.length) : [];
  const load = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 512 * 1024) { toast('That file is over 512 KB. Split it into smaller files.', 'bad'); return; }
    try { setText(await file.text()); } catch (x) { toast("Couldn't read that file. Save it as CSV and try again.", 'bad'); }
  };
  return html`<div class="card pad stack">
    <div class="stack" style="gap:4px"><h3>Many products at once</h3>
      <p class="small soft">One product per row: title, type, width_cm, depth_cm, height_cm, price, colour, material, styles (split with ;) and product_url. Paste from a spreadsheet or upload a .csv file. Every row is checked before anything goes live.</p></div>
    <label class="sr-only" for="csv-text">CSV rows</label>
    <textarea id="csv-text" class="textarea mono" rows="7" value=${text} placeholder=${CSV_EXAMPLE.split('\n').slice(0, 2).join('\n')} onInput=${(e) => setText(e.target.value)}></textarea>
    <div class="row">
      <button type="button" class="btn small" onClick=${() => input.current && input.current.click()}>Upload a .csv file</button>
      <input ref=${input} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange=${load} />
      <button type="button" class="btn small ghost" onClick=${() => setText(CSV_EXAMPLE)}>Use the example</button>
      ${text && html`<button type="button" class="btn small ghost" onClick=${() => setText('')}>Clear</button>`}
    </div>
    ${parsed && parsed.error && html`<div class="notice warn"><span>${parsed.error}</span></div>`}
    ${parsed && parsed.drafts.length > 0 && html`<div class="table-wrap"><table class="listings csv-table"><thead><tr><th>Row</th><th>Product</th><th>Size (cm)</th><th>Price</th><th>Check</th></tr></thead><tbody>
      ${parsed.drafts.map((d) => html`<tr key=${d.line} class=${d.problems.length ? 'bad-row' : ''}>
        <td class="num">${d.line}</td>
        <td><b class="small">${d.title || 'No title'}</b><br /><span class="tiny soft">${d.category ? E.label(d.category) : 'Unknown type'}${d.styles.length ? ` · ${d.styles.join(', ')}` : ''}</span></td>
        <td class="num small">${[d.width_cm, d.depth_cm, d.height_cm].map((v) => (isWhole(v) ? v : '?')).join(' × ')}</td>
        <td class="num small">${d.price > 0 ? money(Math.round(d.price * 100)) : '?'}</td>
        <td>${d.problems.length ? html`<span class="small err">${d.problems[0]}${d.problems.length > 1 ? ` (+${d.problems.length - 1} more)` : ''}</span>` : html`<span class="tag live">Ready</span>`}</td>
      </tr>`)}
    </tbody></table></div>`}
    ${parsed && parsed.drafts.length > 0 && html`<div class="form-actions" style="align-items:center">
      ${bad.length > 0 && html`<span class="small soft">${plural(bad.length, 'row')} with problems will be skipped. Fix them and paste again.</span>`}
      <button type="button" class="btn primary" disabled=${!good.length} onClick=${() => onPublish(good.map(draftToProduct))}>Publish ${plural(good.length, 'listing')}</button></div>`}
  </div>`;
}

function AddProducts({ onSave, onSaveMany }) {
  const [how, setHow] = useState('manual');
  const [draft, setDraft] = useState(null);
  const [k, setK] = useState(0);
  const reset = () => { setDraft(null); setK((n) => n + 1); };
  const ways = [
    ['manual', 'Type it in', 'One product: size, design, price, photo and link.'],
    ['page', 'From your product page', 'Paste a product page link and its details. We fill the form for you to check.'],
    ['csv', 'Many at once', 'Paste or upload a spreadsheet (CSV) of your range.'],
  ];
  return html`<div class="stack" style="gap:16px">
    <div class="goal-cards" role="group" aria-label="How to add products">
      ${ways.map(([v, t, d]) => html`<button key=${v} type="button" class="goal-card" aria-pressed=${String(how === v)} onClick=${() => setHow(v)}><b>${t}</b><span>${d}</span></button>`)}
    </div>
    ${how === 'manual' && html`<${ProductForm} key=${k} inline=${true} initial=${draft ? draft.product : {}} notice=${draft ? draft.note : ''} onClose=${reset} onSave=${(p) => { if (onSave(p) !== false) reset(); }} />`}
    ${how === 'page' && html`<${ImportFromPage} onFilled=${(product, note) => { setDraft({ product, note }); setK((n) => n + 1); setHow('manual'); }} />`}
    ${how === 'csv' && html`<${CsvImport} onPublish=${onSaveMany} />`}
  </div>`;
}

/* ---------- the dashboard ---------- */
function SellerDashboard({ go }) {
  const s = useData();
  const seller = s.seller;
  const [tab, setTab] = useState('products');
  const [edit, setEdit] = useState(null);
  const [feature, setFeature] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showDemo, setShowDemo] = useState(true);
  const catalog = useMemo(() => buildCatalog(s), [s.otherSellers, s.seller, s.reviewDocs, s.myReviews, s.mode]);
  if (!seller) {
    return html`<section class="stack" style="gap:20px">
      <div class="stack" style="gap:6px"><span class="eyebrow">Seller</span><h2>Sell on Removaters</h2>
        <p class="soft" style="max-width:42em">List your pieces once: type them in, fill them from your product pages, or upload your range as a spreadsheet. They show up wherever they fit a real gap in a real room, next to big retailers, and Insights shows what sells and what reviews say.</p></div>
      <div class="seller-head">
        <div class="card pad"><h3 style="margin-bottom:12px">Set up your shop</h3><${SellerProfileForm} submitLabel="Create shop" onSave=${(p) => { Data.saveSeller({ ...p, products: [], created_at: nowIso() }); setTab('add'); toast('Shop created. Add your first products.', 'good'); }} /></div>
        <div class="card pad stack"><h3>Just looking?</h3><p class="small soft">Open a ready-made demo shop: five listings sized for the sample bedroom, with made-up sales and reviews so the insights have something to show.</p><button class="btn" onClick=${() => Actions.trySeller(go)}>Use the demo shop</button></div>
      </div>
    </section>`;
  }
  const products = seller.products || [];
  const featuredCount = products.filter(isFeatured).length;
  const ins = sellerInsights(seller, catalog, s, showDemo);
  const site = safeUrl(seller.website || (seller.is_demo ? CAT.DEMO_SELLER.website : ''));
  const about = seller.about || (seller.is_demo ? CAT.DEMO_SELLER.about : '');
  const saveProducts = (list) => {
    const next = { ...seller, products: list };
    if (s.mode === 'cloud' && JSON.stringify(next).length > 240000) {
      toast('Your shop is too big to save with this many photos. Remove a photo or two, then try again.', 'bad');
      return false;
    }
    Data.saveSeller(next);
    return true;
  };
  const saveProduct = (prod) => {
    const exists = products.some((p) => p.id === prod.id);
    if (!saveProducts(exists ? products.map((p) => (p.id === prod.id ? prod : p)) : [...products, prod])) return false;
    toast(exists ? 'Listing updated.' : `${prod.title} is live. It shows up in rooms where it fits.`, 'good');
    setEdit(null);
    return true;
  };
  const addMany = (list) => {
    if (!saveProducts([...products, ...list])) return false;
    toast(`${plural(list.length, 'listing')} published.`, 'good');
    setTab('products');
    return true;
  };
  const doFeature = (prod, plan) => {
    const P = FEATURE_PLANS[plan];
    const until = new Date(Date.now() + P.days * 864e5).toISOString();
    saveProducts(products.map((p) => (p.id === prod.id ? { ...p, is_featured: true, featured_plan: plan, featured_until: until } : p)));
    toast(`${prod.title} is featured until ${new Date(until).toLocaleDateString('en-AU')}. Payment mocked for the demo.`, 'good');
    setFeature(null);
  };
  const unfeature = (prod) => { saveProducts(products.map((p) => (p.id === prod.id ? { ...p, is_featured: false, featured_plan: null, featured_until: null } : p))); toast(`${prod.title} is no longer featured.`); };
  const tabs = [['products', `Products (${products.length})`], ['add', 'Add products'], ['insights', 'Insights'], ['shop', 'Shop details']];
  return html`<section class="seller">
    <div class="seller-head">
      <div class="card pad stack">
        <div class="spread"><span class="eyebrow">Your shop</span>${s.mode !== 'cloud' && html`<span class="tag">Saved in this browser</span>`}</div>
        <div class="stack" style="gap:8px"><h2>${seller.business_name}</h2>
          <div class="row"><span class=${`tag ${seller.size === 'small' ? 'small-biz' : ''}`}>${seller.size === 'small' ? 'Small business' : 'Large retailer'}</span><span class="small soft">${seller.suburb}</span>${(seller.badges || []).map((b) => html`<span class="tag" key=${b}>${b}</span>`)}</div>
          ${about && html`<p class="small soft">${about}</p>`}
          ${site ? html`<a class="small" href=${site} target="_blank" rel="noopener noreferrer">${hostOf(site)} ↗</a>`
            : html`<button class="btn-link small" style="align-self:flex-start" onClick=${() => setTab('shop')}>Add your website link</button>`}
        </div>
      </div>
      <div class="stat-row">
        <div class="card stat"><b>${products.length}</b><span>Live listings</span></div>
        <div class="card stat"><b>${ins.totals.units}</b><span>Pieces sold${ins.hasDemo && showDemo ? ' (incl. demo)' : ''}</span></div>
        <div class="card stat"><b>${ins.totals.reviews ? ins.totals.avg.toFixed(1) : '-'}</b><span>${ins.totals.reviews ? `Avg rating, ${plural(ins.totals.reviews, 'review')}` : 'No reviews yet'}</span></div>
      </div>
    </div>
    <div class="tabs" role="tablist" aria-label="Seller tools">${tabs.map(([k, l]) => html`<button key=${k} role="tab" id=${`tab-${k}`} aria-selected=${String(tab === k)} aria-controls="seller-panel" class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    <div role="tabpanel" id="seller-panel" aria-labelledby=${`tab-${tab}`}>
      ${tab === 'products' && html`<div class="stack" style="gap:12px">
        <div class="spread"><p class="small soft">Fixed sizes only. Shoppers see a listing in any gap it fits, cheapest first. Featured slots used: <span class="num">${featuredCount}/3</span>.</p>
          <button class="btn primary" onClick=${() => setTab('add')}>Add products</button></div>
        <div class="card">
          ${products.length === 0 ? html`<div class="empty"><h3>No listings yet</h3><p class="soft">Add your first piece by hand, from your product page, or as a spreadsheet. It goes live for shoppers straight away.</p><button class="btn primary" onClick=${() => setTab('add')}>Add products</button></div>`
            : html`<div class="table-wrap"><table class="listings"><thead><tr><th>Piece</th><th>Size (cm)</th><th>Price</th><th>Options</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
              ${products.map((p) => html`<tr key=${p.id}>
                <td><div class="row" style="flex-wrap:nowrap;gap:10px"><${ProductArt} product=${p} size=${56} /><div><b>${p.title}</b><br /><span class="small soft">${E.label(p.category)} · ${p.style_tags.join(', ')}</span>
                  ${safeUrl(p.product_url) && html`<br /><a class="tiny" href=${safeUrl(p.product_url)} target="_blank" rel="noopener noreferrer">${hostOf(p.product_url)} ↗</a>`}</div></div></td>
                <td class="num">${p.width_cm} × ${p.depth_cm} × ${p.height_cm}</td>
                <td class="num">${money(p.base_price_cents)}</td>
                <td>${(p.options || []).length || '-'}</td>
                <td>${isFeatured(p) ? html`<span class="tag sponsored">Featured to ${new Date(p.featured_until).toLocaleDateString('en-AU')}</span>` : html`<span class="tag live">Live</span>`}</td>
                <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
                  <button class="btn small ghost" onClick=${() => setEdit(p)}>Edit</button>
                  ${isFeatured(p) ? html`<button class="btn small ghost" onClick=${() => unfeature(p)}>Unfeature</button>`
                    : html`<button class="btn small ghost" disabled=${featuredCount >= 3} title=${featuredCount >= 3 ? 'All 3 featured slots are in use.' : null} onClick=${() => setFeature(p)}>Feature</button>`}
                  ${confirm === p.id ? html`<button class="btn small danger" onClick=${() => { saveProducts(products.filter((x) => x.id !== p.id)); setConfirm(null); toast('Listing deleted.'); }}>Confirm delete</button>`
                    : html`<button class="btn small ghost danger" onClick=${() => setConfirm(p.id)}>Delete</button>`}
                </div></td>
              </tr>`)}
            </tbody></table></div>`}
        </div>
      </div>`}
      ${tab === 'add' && html`<${AddProducts} onSave=${saveProduct} onSaveMany=${addMany} />`}
      ${tab === 'insights' && html`<${SellerInsights} ins=${ins} showDemo=${showDemo} setShowDemo=${setShowDemo} />`}
      ${tab === 'shop' && html`<div class="card pad" style="max-width:780px"><${SellerProfileForm} initial=${seller} submitLabel="Save shop details" onSave=${(p) => { Data.saveSeller({ ...seller, ...p }); toast('Shop details saved.', 'good'); }} /></div>`}
    </div>
    ${edit && html`<${ProductForm} initial=${edit} onClose=${() => setEdit(null)} onSave=${saveProduct} />`}
    ${feature && html`<${FeatureDialog} product=${feature} onClose=${() => setFeature(null)} onConfirm=${(plan) => doFeature(feature, plan)} />`}
  </section>`;
}

/* ===================== app ===================== */
function loadRoute() { try { const r = JSON.parse(sessionStorage.getItem('removaters.route') || 'null'); return r && r.name ? r : null; } catch (e) { return null; } }
function saveRoute(r) { try { sessionStorage.setItem('removaters.route', JSON.stringify(r)); } catch (e) { /* optional */ } }

function App() {
  const s = useData();
  const [route, setRoute] = useState(() => loadRoute() || { name: 'home' });
  useEffect(() => saveRoute(route), [route]);
  const go = (r, keepScroll) => { setRoute(r); if (!keepScroll) window.scrollTo(0, 0); };
  if (!s.ready) return html`<${TopBar} route=${route} go=${go} /><main class="main"><div class="loading">Loading your rooms…</div></main>`;
  let body;
  if (route.name === 'room') body = html`<${RoomWorkspace} key=${route.id} id=${route.id} step=${route.step || 'layouts'} go=${go} />`;
  else if (route.name === 'rooms') body = html`<${RoomsList} go=${go} />`;
  else if (route.name === 'seller') body = html`<${SellerDashboard} go=${go} />`;
  else if (route.name === 'landing') body = html`<${Landing} go=${go} />`;
  else body = s.rooms.length ? html`<${RoomsList} go=${go} />` : html`<${Landing} go=${go} />`;
  return html`<${TopBar} route=${route} go=${go} />
    <main class="main" id="main">${body}</main>
    <footer class="footer"><p>Removaters prototype for Sym AI Open 2026. Layouts come from a rule-based engine. Claude reads room scans, fills listings from product pages and summarises reviews, and you check what it reads. Stores and products marked Demo data are made up; listings marked Live were added by sellers. Payments are simulated.</p></footer>
    <${Toasts} />`;
}

if (window.htmPreact) {
  const mount = document.getElementById('app');
  mount.textContent = '';
  render(html`<${App} />`, mount);
  Data.init();
} else {
  document.getElementById('app').innerHTML = '<p style="padding:24px">Removaters couldn’t load its interface library. Check your connection and reload the page.</p>';
}
