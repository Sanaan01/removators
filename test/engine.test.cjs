const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

const item = (id, name, category, w, d, keep = true) => ({ id, name, category, width_cm: w, depth_cm: d, keep });

const sampleRoom = () => ({
  type: 'bedroom', width_cm: 300, length_cm: 350,
  door: { wall: 'S', offset_cm: 200, width_cm: 82 },
  windows: [{ wall: 'E', offset_cm: 100, width_cm: 120 }],
});
const sampleItems = () => [
  item('bed', 'Queen bed', 'bed', 153, 203),
  item('desk', 'Desk', 'desk', 120, 60),
  item('wardrobe', 'Wardrobe', 'wardrobe', 100, 55),
  item('bedside', 'Bedside table', 'bedside-table', 45, 40),
];

function assertAllValid(room, layouts) {
  assert.equal(layouts.length, 3);
  for (const l of layouts) {
    const v = E.validateLayout(room, l.placements);
    assert.ok(v.valid, `${l.variant}: ${v.errors.map((e) => e.message).join('; ')}`);
    for (const p of l.placements) assert.ok(E.insideRoom(p, room), `${l.variant}: ${p.name} inside`);
    for (const s of l.slots) {
      assert.ok(E.insideRoom(s, room), `${l.variant}: slot ${s.id} inside`);
      for (const p of l.placements) assert.ok(!E.overlaps(s, p), `${l.variant}: slot ${s.id} overlaps ${p.name}`);
      assert.ok(!E.overlaps(s, E.doorRect(room)), `${l.variant}: slot ${s.id} blocks door`);
    }
    for (let i = 0; i < l.slots.length; i++) for (let j = i + 1; j < l.slots.length; j++) {
      assert.ok(!E.overlaps(l.slots[i], l.slots[j]), `${l.variant}: slots ${l.slots[i].id} and ${l.slots[j].id} overlap`);
    }
    assert.ok(l.score >= 0 && l.score <= 100);
  }
}

const sig = (l) => l.placements.map((p) => `${p.ref_id}:${p.x},${p.y},${p.rotation}`).sort().join('|');

test('sample bedroom: 3 valid layouts, everything placed, essentials slotted', () => {
  const room = sampleRoom();
  const layouts = E.generateLayouts(room, sampleItems(), { goal: 'fill' });
  assertAllValid(room, layouts);
  for (const l of layouts) {
    assert.equal(l.placements.length, 4, `${l.variant} placed all`);
    const cats = l.slots.map((s) => s.category);
    assert.ok(cats.includes('chair'), `${l.variant} has chair slot`);
    assert.ok(cats.includes('floor-lamp'), `${l.variant} has lamp slot`);
  }
  assert.ok(layouts.filter((l) => l.slots.some((s) => s.category === 'bookcase')).length >= 2, 'bookcase slot in at least 2 layouts');
});

test('deterministic: same input gives same output', () => {
  assert.deepEqual(E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'fill' }), E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'fill' }));
  assert.deepEqual(E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'fill', round: 2 }), E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'fill', round: 2 }));
});

test('variants differ for the sample bedroom', () => {
  const layouts = E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'fill' });
  assert.notEqual(sig(layouts[0]), sig(layouts[1]));
  assert.notEqual(sig(layouts[1]), sig(layouts[2]));
  assert.notEqual(sig(layouts[0]), sig(layouts[2]));
});

test('regenerate rounds give new, valid designs', () => {
  const room = sampleRoom();
  const seen = new Set();
  const r0 = E.generateLayouts(room, sampleItems(), { goal: 'fill' });
  r0.forEach((l) => seen.add(sig(l)));
  for (let round = 1; round <= 3; round++) {
    const ls = E.generateLayouts(room, sampleItems(), { goal: 'fill', round });
    assertAllValid(room, ls);
    const fresh = ls.filter((l) => !seen.has(sig(l))).length;
    assert.ok(fresh >= 2, `round ${round}: only ${fresh} new designs`);
    ls.forEach((l) => seen.add(sig(l)));
    for (const l of ls) assert.equal(l.placements.length, 4, `round ${round} ${l.variant} placed all`);
  }
  assert.ok(E.designPoolSize(room, sampleItems(), { goal: 'fill' }) >= 4, 'at least 4 design sets (12 designs)');
});

test('regenerate keeps locked pieces fixed', () => {
  const room = sampleRoom();
  const first = E.generateLayouts(room, sampleItems(), { goal: 'fill' })[0];
  const desk = { ...first.placements.find((p) => p.category === 'desk'), locked: true };
  for (let round = 0; round <= 3; round++) {
    const ls = E.generateLayouts(room, sampleItems(), { goal: 'fill', locked: [desk], round });
    assertAllValid(room, ls);
    for (const l of ls) {
      const d = l.placements.find((p) => p.ref_id === desk.ref_id);
      assert.deepEqual([d.x, d.y, d.rotation, d.locked], [desk.x, desk.y, desk.rotation, true], `round ${round} ${l.variant}`);
    }
  }
});

test('work layout puts the desk on the window wall', () => {
  const work = E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'fill' }).find((l) => l.variant === 'work');
  assert.equal(E.backWall(work.placements.find((p) => p.category === 'desk'), sampleRoom()), 'E');
});

test('300 x 300 studio', () => {
  const room = { type: 'bedroom', width_cm: 300, length_cm: 300, door: { wall: 'N', offset_cm: 20, width_cm: 82 }, windows: [{ wall: 'S', offset_cm: 90, width_cm: 120 }] };
  const items = [item('b', 'Single bed', 'bed', 92, 188), item('d', 'Desk', 'desk', 100, 50), item('w', 'Wardrobe', 'wardrobe', 80, 55), item('c', 'Chair', 'chair', 50, 50)];
  const layouts = E.generateLayouts(room, items, { goal: 'fill' });
  assertAllValid(room, layouts);
  for (const l of layouts) assert.equal(l.placements.length, 4, `${l.variant} placed all`);
  assertAllValid(room, E.generateLayouts(room, items, { goal: 'fill', round: 1 }));
});

test('500 x 400 living room', () => {
  const room = { type: 'living', width_cm: 500, length_cm: 400, door: { wall: 'W', offset_cm: 280, width_cm: 90 }, windows: [{ wall: 'N', offset_cm: 150, width_cm: 200 }] };
  const items = [item('s', '3-seat sofa', 'sofa', 210, 90), item('t', 'TV unit', 'tv-unit', 150, 40), item('c', 'Coffee table', 'coffee-table', 100, 50), item('a', 'Armchair', 'armchair', 80, 80), item('k', 'Bookcase', 'bookcase', 80, 30)];
  for (const round of [0, 1, 2]) {
    const layouts = E.generateLayouts(room, items, { goal: 'fill', round });
    assertAllValid(room, layouts);
    for (const l of layouts) {
      assert.equal(l.placements.length, 5, `round ${round} ${l.variant} placed all`);
      const sofa = l.placements.find((p) => p.category === 'sofa');
      const tv = l.placements.find((p) => p.category === 'tv-unit');
      const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' };
      assert.equal(E.backWall(tv, room), opposite[E.backWall(sofa, room)], `round ${round} ${l.variant}: tv faces sofa`);
    }
  }
});

test('an item bigger than the room is reported, nothing crashes', () => {
  const room = sampleRoom();
  const items = [...sampleItems(), item('huge', 'Huge cabinet', 'wardrobe', 400, 400)];
  for (const round of [0, 1]) {
    const layouts = E.generateLayouts(room, items, { goal: 'fill', round });
    assertAllValid(room, layouts);
    for (const l of layouts) {
      assert.ok(l.warnings.some((w) => w.includes("Couldn't fit: Huge cabinet")), l.warnings.join(' / '));
      assert.ok(!l.placements.some((p) => p.ref_id === 'huge'));
    }
  }
});

test('door on each wall', () => {
  for (const wall of ['N', 'E', 'S', 'W']) {
    const room = { ...sampleRoom(), door: { wall, offset_cm: 110, width_cm: 82 }, windows: [] };
    for (const round of [0, 1]) {
      const layouts = E.generateLayouts(room, sampleItems(), { goal: 'fill', round });
      assertAllValid(room, layouts);
      for (const l of layouts) assert.equal(l.placements.length, 4, `door ${wall} round ${round} ${l.variant}`);
    }
  }
});

test('room with no windows', () => {
  const room = { ...sampleRoom(), windows: [] };
  assertAllValid(room, E.generateLayouts(room, sampleItems(), { goal: 'fill' }));
});

test('validateLayout catches overlap, door, outside, wall and chair-zone problems', () => {
  const room = sampleRoom();
  const ok = [{ ref_id: 'bed', name: 'Bed', category: 'bed', x: 0, y: 0, w: 153, d: 203, rotation: 0 }];
  assert.ok(E.validateLayout(room, ok).valid);
  const overlap = [...ok, { ref_id: 'w', name: 'Wardrobe', category: 'wardrobe', x: 100, y: 0, w: 100, d: 55, rotation: 0 }];
  assert.ok(E.validateLayout(room, overlap).errors.some((e) => e.code === 'overlap'));
  const door = [{ ref_id: 'w', name: 'Wardrobe', category: 'wardrobe', x: 190, y: 295, w: 100, d: 55, rotation: 0 }];
  assert.ok(E.validateLayout(room, door).errors.some((e) => e.code === 'door'));
  const outside = [{ ref_id: 'w', name: 'Wardrobe', category: 'wardrobe', x: 250, y: 0, w: 100, d: 55, rotation: 0 }];
  assert.ok(E.validateLayout(room, outside).errors.some((e) => e.code === 'outside'));
  const floating = [{ ref_id: 'w', name: 'Wardrobe', category: 'wardrobe', x: 100, y: 100, w: 100, d: 55, rotation: 0 }];
  assert.ok(E.validateLayout(room, floating).errors.some((e) => e.code === 'wall'));
  const chair = [
    { ref_id: 'd', name: 'Desk', category: 'desk', x: 0, y: 0, w: 120, d: 60, rotation: 0 },
    { ref_id: 'l', name: 'Lamp', category: 'floor-lamp', x: 40, y: 60, w: 40, d: 40, rotation: 0 },
  ];
  assert.ok(E.validateLayout(room, chair).errors.some((e) => e.code === 'chair'));
});

test('replace goal turns marked items into same-footprint slots', () => {
  const room = sampleRoom();
  const items = sampleItems().map((i) => (i.id === 'desk' ? { ...i, keep: false } : i));
  for (const l of E.generateLayouts(room, items, { goal: 'replace' })) {
    assert.ok(!l.placements.some((p) => p.ref_id === 'desk'));
    const slot = l.slots.find((s) => s.id === 'replace:desk');
    assert.ok(slot);
    assert.equal(slot.category, 'desk');
    assert.deepEqual([slot.w, slot.d].sort(), [60, 120].sort());
  }
});

test('arrange goal offers free gaps along the walls', () => {
  for (const l of E.generateLayouts(sampleRoom(), sampleItems(), { goal: 'arrange' })) {
    assert.ok(l.slots.length > 0 && l.slots.every((s) => s.kind === 'gap' && s.w >= 40 && s.d >= 40));
  }
});

test('moving a spot: validation and wall detection', () => {
  const room = sampleRoom();
  const l = E.generateLayouts(room, sampleItems(), { goal: 'fill' })[0];
  const book = l.slots.find((s) => s.category === 'bookcase');
  const others = l.slots.filter((s) => s !== book);
  // onto the bed: rejected
  const bed = l.placements.find((p) => p.category === 'bed');
  assert.ok(E.validateSpot(room, l.placements, others, { ...book, x: bed.x, y: bed.y }).length > 0);
  // into the middle of the room: a bookcase spot must keep its back to a wall
  assert.ok(E.validateSpot(room, l.placements, others, { ...book, x: 120, y: 160 }).some((m) => m.includes('wall')));
  // a lamp spot can sit anywhere free
  const lamp = l.slots.find((s) => s.category === 'floor-lamp');
  const lampOthers = l.slots.filter((s) => s !== lamp);
  assert.deepEqual(E.validateSpot(room, l.placements, lampOthers, { ...lamp, x: 170, y: 200 }), []);
  assert.equal(E.spotWall(room, { x: 0, y: 100, w: 40, d: 80 }), 'W');
  assert.equal(E.spotWall(room, { x: 100, y: 0, w: 80, d: 40 }), 'N');
  assert.equal(E.spotWall(room, { x: 100, y: 100, w: 80, d: 40 }), null);
});

test('product fit in slots, with rotation and spare space', () => {
  const slot = { x: 0, y: 0, w: 120, d: 40, wall: 'N' };
  const f = E.fitInSlot({ width_cm: 80, depth_cm: 30 }, slot);
  assert.deepEqual([f.spareWide, f.spareDeep], [40, 10]);
  assert.equal(E.fitInSlot({ width_cm: 130, depth_cm: 30 }, slot), null);
  const side = { x: 260, y: 0, w: 40, d: 120, wall: 'E' };
  const g = E.fitInSlot({ width_cm: 80, depth_cm: 30 }, side);
  assert.equal(g.rotation, 90);
  const pos = E.placeProductInSlot({ width_cm: 80, depth_cm: 30 }, side);
  assert.equal(pos.x + pos.w, 300);
});

test('room input checks', () => {
  assert.equal(E.checkRoom(sampleRoom()).length, 0);
  assert.ok(E.checkRoom({ ...sampleRoom(), width_cm: 150 }).length > 0);
  assert.ok(E.checkRoom({ ...sampleRoom(), door: { wall: 'S', offset_cm: 250, width_cm: 82 } }).length > 0);
  assert.ok(E.checkRoom({ ...sampleRoom(), windows: [{ wall: 'S', offset_cm: 210, width_cm: 60 }] }).some((e) => e.includes('overlaps the door')));
});
