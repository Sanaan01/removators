const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/catalog.js');
const E = require('../src/engine.js');

test('every category has 4+ products from 3+ stores including a small seller', () => {
  const small = new Set(C.STORES.filter((s) => s.size === 'small').map((s) => s.id));
  for (const cat of E.CATEGORIES) {
    const ps = C.PRODUCTS.filter((p) => p.category === cat);
    const stores = new Set(ps.map((p) => p.seller_id));
    assert.ok(ps.length >= 4, `${cat}: ${ps.length} products`);
    assert.ok(stores.size >= 3, `${cat}: ${stores.size} stores`);
    assert.ok(ps.some((p) => small.has(p.seller_id)), `${cat}: small seller`);
  }
});

test('stores: 2 large, 6 small, all marked demo; values come from the fixed lists', () => {
  assert.equal(C.STORES.filter((s) => s.size === 'large').length, 2);
  assert.equal(C.STORES.filter((s) => s.size === 'small').length, 6);
  for (const s of C.STORES) { assert.ok(s.business_name.includes('(demo)')); s.badges.forEach((b) => assert.ok(C.BADGES.includes(b), b)); }
  const ids = new Set();
  for (const p of C.PRODUCTS) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(C.STORES.some((s) => s.id === p.seller_id), p.id);
    assert.ok(Number.isInteger(p.width_cm) && Number.isInteger(p.depth_cm) && Number.isInteger(p.base_price_cents));
    p.style_tags.forEach((t) => assert.ok(C.STYLES.includes(t), `${p.id} style ${t}`));
    p.cultural_tags.forEach((t) => assert.ok(C.CULTURAL.includes(t), `${p.id} cultural ${t}`));
    assert.ok(C.COLOURS.includes(p.colour), `${p.id} colour ${p.colour}`);
    assert.ok(C.MATERIALS.includes(p.material), `${p.id} material ${p.material}`);
    assert.ok(p.rating_avg >= 3.5 && p.rating_avg <= 4.9);
    assert.ok(!p.is_featured);
    p.options.forEach((o) => assert.ok(['colour', 'fabric', 'finish'].includes(o.type)));
  }
  assert.ok(C.PRODUCTS.length >= 75, `${C.PRODUCTS.length} products`);
});

test('sample room gaps all have cheap fitting options from 3+ stores, in every design set', () => {
  const room = { type: 'bedroom', width_cm: 300, length_cm: 350, door: { wall: 'S', offset_cm: 200, width_cm: 82 }, windows: [{ wall: 'E', offset_cm: 100, width_cm: 120 }] };
  const items = [
    { id: 'bed', name: 'Queen bed', category: 'bed', width_cm: 153, depth_cm: 203, keep: true },
    { id: 'desk', name: 'Desk', category: 'desk', width_cm: 120, depth_cm: 60, keep: true },
    { id: 'wardrobe', name: 'Wardrobe', category: 'wardrobe', width_cm: 100, depth_cm: 55, keep: true },
    { id: 'bedside', name: 'Bedside table', category: 'bedside-table', width_cm: 45, depth_cm: 40, keep: true },
  ];
  const sets = E.designPoolSize(room, items, { goal: 'fill' });
  for (let round = 0; round < sets; round++) {
    for (const l of E.generateLayouts(room, items, { goal: 'fill', round })) {
      for (const s of l.slots) {
        const fits = C.PRODUCTS.filter((p) => p.category === s.category && E.fitInSlot(p, s) && p.base_price_cents <= 60000);
        const stores = new Set(fits.map((p) => p.seller_id));
        assert.ok(stores.size >= 3, `set ${round} ${l.variant} ${s.category} ${s.w}x${s.d}: ${fits.length} products from ${stores.size} stores`);
      }
    }
  }
});
