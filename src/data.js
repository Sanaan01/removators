/* Storage. With the artifact database available and writable, rooms sync to the viewer's account
   (private per person) and seller listings are shared. Otherwise everything saves in this browser,
   and shared listings are still shown when the database is readable. */
const SESSION = Math.random().toString(36).slice(2, 10);
const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byUpdated = (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''));

const LS = {
  key: (k) => `removaters.v1.${k}`,
  get(k, d) { try { const v = localStorage.getItem(LS.key(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(LS.key(k), JSON.stringify(v)); return true; } catch (e) { return false; } },
};

const Toast = (() => {
  let list = [];
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  return {
    show(msg, kind) {
      const id = Math.random();
      list = [...list.slice(-2), { id, msg, kind: kind || 'info' }];
      emit();
      setTimeout(() => { list = list.filter((t) => t.id !== id); emit(); }, kind === 'bad' ? 6000 : 3800);
    },
    get: () => list,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
})();
const toast = (msg, kind) => Toast.show(msg, kind);

const Data = (() => {
  const state = {
    ready: false, mode: 'local', canRead: false, uid: null,
    profile: { persona: 'renter' }, rooms: [], seller: null, otherSellers: [], reviewDocs: {}, myReviews: {},
    salesDocs: {}, mySales: {},
  };
  const subs = new Set();
  let db = null;
  let uid = null;
  const queues = {};
  const emit = () => subs.forEach((f) => f());
  const set = (patch) => { Object.assign(state, patch); emit(); };

  async function init() {
    let d = null, u = null;
    try {
      if (window.claude && typeof window.claude.use === 'function') [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    } catch (e) { d = null; u = null; }
    let id = null, canWrite = null;
    if (u) {
      try { id = await u.id(); } catch (e) { id = null; }
      try { canWrite = await u.can('data.write'); } catch (e) { canWrite = null; }
    }
    const cloud = Boolean(d && id && canWrite !== false);
    if (cloud) uid = id;
    if (d) { db = d; watchShared(); }
    if (cloud) await startCloud(); else startLocal();
  }

  function watchShared() {
    db.collection('sellers').onSnapshot((snap) => {
      const all = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      const patch = { canRead: true, otherSellers: all.filter((s) => s.id !== uid) };
      if (state.mode === 'cloud') patch.seller = all.find((s) => s.id === uid) || null;
      set(patch);
    }, () => {});
    // Units sold per product, one document per buyer (no names, just product keys and totals), for seller insights.
    db.collection('sales').onSnapshot((snap) => {
      const docs = {};
      snap.docs.forEach((doc) => { docs[doc.id] = doc.data(); });
      const patch = { salesDocs: docs };
      if (state.mode === 'cloud') patch.mySales = (docs[uid] && docs[uid].items) || {};
      set(patch);
    }, () => {});
    db.collection('reviews').onSnapshot((snap) => {
      const docs = {};
      snap.docs.forEach((doc) => { docs[doc.id] = doc.data(); });
      const patch = { reviewDocs: docs };
      if (state.mode === 'cloud') patch.myReviews = (docs[uid] && docs[uid].items) || {};
      set(patch);
    }, () => {});
  }

  async function startCloud() {
    const profileRef = db.doc(`data/users/${uid}/profile`);
    let profile = { persona: 'renter' };
    try { const snap = await profileRef.get(); if (snap.exists) profile = { ...profile, ...snap.data() }; } catch (e) { /* defaults */ }
    set({ mode: 'cloud', uid, profile });
    profileRef.collection('rooms').onSnapshot((snap) => {
      if (state.mode !== 'cloud') return;
      const fromStore = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      // Edits still waiting to be written win over what the store last confirmed.
      const rooms = fromStore.map((r) => dirty.get(r.id) || r);
      for (const [id, r] of dirty) if (!rooms.some((x) => x.id === id)) rooms.push(r);
      set({ rooms: rooms.filter((r) => !deleted.has(r.id)).sort(byUpdated), ready: true });
    }, () => { fallbackToLocal(); set({ ready: true }); });
    setTimeout(() => { if (!state.ready) set({ ready: true }); }, 5000);
  }

  function startLocal() {
    set({
      mode: 'local',
      profile: LS.get('profile', { persona: 'renter' }),
      rooms: LS.get('rooms', []).sort(byUpdated),
      seller: LS.get('seller', null),
      myReviews: LS.get('reviews', {}),
      mySales: LS.get('sales', {}),
      ready: true,
    });
  }

  function enqueue(path, fn) {
    const prev = queues[path] || Promise.resolve();
    const next = prev.then(fn, fn);
    queues[path] = next.catch(() => {});
    return next;
  }

  async function cloudSet(path, body) {
    try {
      await enqueue(path, () => db.doc(path).set(body));
      return true;
    } catch (err) {
      if (err && err.code === 'unavailable') {
        await sleep(400 + Math.random() * 600);
        try { await db.doc(path).set(body); return true; } catch (e2) { return writeFailed(e2); }
      }
      return writeFailed(err);
    }
  }

  async function cloudDelete(path) {
    try { await enqueue(path, () => db.doc(path).delete()); return true; } catch (err) { return writeFailed(err); }
  }

  function writeFailed(err) {
    const code = err && err.code;
    if (code === 'quota_exceeded') toast('Storage is full. Delete a room you no longer need, then try again.', 'bad');
    else if (['invalid_argument', 'not_granted', 'revoked', 'capability_disabled', 'capability_removed'].includes(code)) fallbackToLocal();
    else toast("Couldn't save just now. Check your connection and try again.", 'bad');
    return false;
  }

  function fallbackToLocal() {
    if (state.mode !== 'cloud') return;
    LS.set('rooms', state.rooms);
    LS.set('profile', state.profile);
    if (state.seller) LS.set('seller', { ...state.seller, id: localSellerId() });
    LS.set('reviews', state.myReviews);
    LS.set('sales', state.mySales);
    set({ mode: 'local', seller: state.seller ? { ...state.seller, id: localSellerId() } : null });
    toast("This link can't save to your account, so changes now save in this browser.", 'bad');
  }

  function localSellerId() {
    let id = LS.get('sellerId', null);
    if (!id) { id = newId('local-seller'); LS.set('sellerId', id); }
    return id;
  }

  // Rooms update on screen at once; account writes are coalesced so typing doesn't spam the store.
  const dirty = new Map();
  const deleted = new Set();
  const timers = {};
  function writeRoomNow(id) {
    clearTimeout(timers[id]);
    const latest = dirty.get(id);
    if (!latest) return Promise.resolve(true);
    return cloudSet(`data/users/${uid}/profile/rooms/${id}`, latest).then((ok) => {
      if (dirty.get(id) === latest) dirty.delete(id);
      return ok;
    });
  }
  function flush() { for (const id of [...dirty.keys()]) writeRoomNow(id); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function saveRoom(room, opts) {
    const r = { ...room, updated_at: nowIso(), writer: SESSION };
    set({ rooms: [r, ...state.rooms.filter((x) => x.id !== r.id)] });
    if (state.mode !== 'cloud') { LS.set('rooms', state.rooms); return; }
    dirty.set(r.id, r);
    clearTimeout(timers[r.id]);
    if (opts && opts.now) writeRoomNow(r.id);
    else timers[r.id] = setTimeout(() => writeRoomNow(r.id), 500);
  }

  function deleteRoom(id) {
    set({ rooms: state.rooms.filter((x) => x.id !== id) });
    if (state.mode !== 'cloud') { LS.set('rooms', state.rooms); return; }
    clearTimeout(timers[id]);
    dirty.delete(id);
    deleted.add(id);
    cloudDelete(`data/users/${uid}/profile/rooms/${id}`);
  }

  function saveProfile(patch) {
    const profile = { ...state.profile, ...patch };
    set({ profile });
    if (state.mode === 'cloud') return cloudSet(`data/users/${uid}/profile`, profile);
    LS.set('profile', profile);
    return Promise.resolve(true);
  }

  function saveSeller(seller) {
    const id = state.mode === 'cloud' ? uid : localSellerId();
    const s = { ...seller, id, updated_at: nowIso() };
    set({ seller: s });
    if (state.mode === 'cloud') return cloudSet(`sellers/${uid}`, s);
    LS.set('seller', s);
    return Promise.resolve(true);
  }

  function saveReview(key, review) {
    const items = { ...state.myReviews };
    if (review) items[key] = review; else delete items[key];
    set({ myReviews: items });
    if (state.mode === 'cloud') return cloudSet(`reviews/${uid}`, { items, updated_at: nowIso() });
    LS.set('reviews', items);
    return Promise.resolve(true);
  }

  // Adds an order's pieces to this buyer's sales tally, which sellers read for their insights.
  function recordSales(order) {
    const items = { ...state.mySales };
    for (const st of order.stores || []) {
      for (const l of st.lines || []) {
        const cur = items[l.product_key] || { units: 0, revenue_cents: 0, title: l.title, seller_id: l.seller_id };
        items[l.product_key] = { ...cur, units: cur.units + 1, revenue_cents: cur.revenue_cents + l.price_cents, last_at: order.created_at };
      }
    }
    set({ mySales: items });
    if (state.mode === 'cloud') return cloudSet(`sales/${uid}`, { items, updated_at: nowIso() });
    LS.set('sales', items);
    return Promise.resolve(true);
  }

  return {
    state, init, saveRoom, deleteRoom, saveProfile, saveSeller, saveReview, recordSales,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    myReviewer: () => (state.mode === 'cloud' ? uid : 'me'),
  };
})();
