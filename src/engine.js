/* Removaters layout engine.
   Pure and deterministic: same input, same output. No AI, no randomness, no clock.
   Units: integer centimetres. Origin at the room's top-left corner.
   x runs across the width (west to east), y runs down the length (north to south).
   North wall is y=0, south is y=length, west is x=0, east is x=width.
   Door and window offsets are measured from the wall's left (N/S walls) or top (W/E walls) end. */
const Engine = (() => {
  const STEP = 5;
  const CLEAR = 75;
  const CHAIR_ZONE = 60;
  const GRID = 10;

  const CATEGORIES = ['bed', 'wardrobe', 'desk', 'chair', 'bedside-table', 'bookcase', 'dresser', 'floor-lamp', 'sofa', 'armchair', 'coffee-table', 'tv-unit'];
  const LABELS = {
    bed: 'Bed', wardrobe: 'Wardrobe', desk: 'Desk', chair: 'Chair', 'bedside-table': 'Bedside table',
    bookcase: 'Bookcase', dresser: 'Dresser', 'floor-lamp': 'Floor lamp', sofa: 'Sofa', armchair: 'Armchair',
    'coffee-table': 'Coffee table', 'tv-unit': 'TV unit',
  };
  const WALL_CATS = new Set(['bed', 'wardrobe', 'desk', 'dresser', 'bookcase', 'sofa', 'tv-unit']);
  const FRONT_CLEAR_CATS = new Set(['desk', 'wardrobe', 'dresser']);
  const TALL_CATS = new Set(['wardrobe', 'bookcase']);
  const STRIP_EXEMPT = new Set(['bedside-table', 'floor-lamp']);

  const PRESETS = [
    { key: 'single-bed', name: 'Single bed', category: 'bed', w: 92, d: 188 },
    { key: 'king-single-bed', name: 'King single bed', category: 'bed', w: 107, d: 203 },
    { key: 'double-bed', name: 'Double bed', category: 'bed', w: 138, d: 188 },
    { key: 'queen-bed', name: 'Queen bed', category: 'bed', w: 153, d: 203 },
    { key: 'wardrobe', name: 'Wardrobe', category: 'wardrobe', w: 100, d: 55 },
    { key: 'desk', name: 'Desk', category: 'desk', w: 120, d: 60 },
    { key: 'chair', name: 'Chair', category: 'chair', w: 50, d: 50 },
    { key: 'bedside-table', name: 'Bedside table', category: 'bedside-table', w: 45, d: 40 },
    { key: 'bookcase', name: 'Bookcase', category: 'bookcase', w: 80, d: 30 },
    { key: 'dresser', name: 'Dresser', category: 'dresser', w: 120, d: 45 },
    { key: 'floor-lamp', name: 'Floor lamp', category: 'floor-lamp', w: 40, d: 40 },
    { key: 'sofa-3', name: '3-seat sofa', category: 'sofa', w: 210, d: 90 },
    { key: 'armchair', name: 'Armchair', category: 'armchair', w: 80, d: 80 },
    { key: 'coffee-table', name: 'Coffee table', category: 'coffee-table', w: 100, d: 50 },
    { key: 'tv-unit', name: 'TV unit', category: 'tv-unit', w: 150, d: 40 },
  ];

  const ESSENTIALS = {
    bedroom: ['bed', 'wardrobe', 'desk', 'chair', 'bedside-table', 'bookcase', 'floor-lamp'],
    living: ['sofa', 'coffee-table', 'tv-unit', 'armchair', 'bookcase', 'floor-lamp'],
  };

  // Largest slot worth offering per category (width along the wall, depth into the room).
  const SLOT_CAP = {
    bed: { w: 195, d: 215 }, wardrobe: { w: 180, d: 65 }, desk: { w: 150, d: 75 }, dresser: { w: 150, d: 55 },
    bookcase: { w: 120, d: 40 }, sofa: { w: 245, d: 100 }, 'tv-unit': { w: 190, d: 50 }, armchair: { w: 95, d: 90 },
    'coffee-table': { w: 120, d: 65 }, 'bedside-table': { w: 55, d: 45 }, 'floor-lamp': { w: 50, d: 50 }, chair: { w: 60, d: 60 },
  };

  // Placement is greedy, so order matters. Each variant tries these fixed orders and keeps
  // the best result (most pieces placed, fewest clearance problems, highest score).
  const ORDERS = [
    ['bed', 'sofa', 'wardrobe', 'desk', 'dresser', 'tv-unit', 'bookcase', 'armchair', 'coffee-table', 'bedside-table', 'chair', 'floor-lamp'],
    ['bed', 'bedside-table', 'sofa', 'coffee-table', 'armchair', 'wardrobe', 'desk', 'chair', 'dresser', 'tv-unit', 'bookcase', 'floor-lamp'],
    ['bed', 'bedside-table', 'desk', 'chair', 'sofa', 'coffee-table', 'armchair', 'wardrobe', 'dresser', 'tv-unit', 'bookcase', 'floor-lamp'],
    ['desk', 'chair', 'wardrobe', 'bed', 'bedside-table', 'sofa', 'tv-unit', 'coffee-table', 'armchair', 'dresser', 'bookcase', 'floor-lamp'],
  ];

  /* ---------- geometry ---------- */
  const rect = (x, y, w, d) => ({ x, y, w, d });
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.d / 2 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const label = (cat) => LABELS[cat] || 'Item';
  const nameOf = (p) => p.name || label(p.category);
  const insideRoom = (r, room) => r.x >= 0 && r.y >= 0 && r.x + r.w <= room.width_cm && r.y + r.d <= room.length_cm;

  function smallestPreset(cat) {
    let best = null;
    for (const p of PRESETS) if (p.category === cat && (!best || p.w * p.d < best.w * best.d)) best = p;
    return best || { w: 40, d: 40 };
  }

  function wallLength(room, wall) {
    return wall === 'N' || wall === 'S' ? room.width_cm : room.length_cm;
  }

  function doorRect(room) {
    const { wall, offset_cm: o, width_cm: dw } = room.door;
    const W = room.width_cm, L = room.length_cm;
    if (wall === 'N') return rect(o, 0, dw, dw);
    if (wall === 'S') return rect(o, L - dw, dw, dw);
    if (wall === 'W') return rect(0, o, dw, dw);
    return rect(W - dw, o, dw, dw);
  }

  function doorCenter(room) {
    const { wall, offset_cm: o, width_cm: dw } = room.door;
    const W = room.width_cm, L = room.length_cm;
    if (wall === 'N') return { x: o + dw / 2, y: 0 };
    if (wall === 'S') return { x: o + dw / 2, y: L };
    if (wall === 'W') return { x: 0, y: o + dw / 2 };
    return { x: W, y: o + dw / 2 };
  }

  // The wall a placement's back is against, judged by rotation:
  // rotation 0 runs its width along x, so its back is the N or S wall;
  // rotation 90 runs its width along y, so its back is the W or E wall.
  function backWall(p, room) {
    if (p.rotation === 90) {
      if (p.x === 0) return 'W';
      if (p.x + p.w === room.width_cm) return 'E';
      return null;
    }
    if (p.y === 0) return 'N';
    if (p.y + p.d === room.length_cm) return 'S';
    return null;
  }

  // Zone in front of an item, `depth` deep. With `width`, a band that wide centred on the item.
  function frontZone(p, room, depth, width) {
    const bw = backWall(p, room);
    if (!bw) return null;
    const c = center(p);
    if (bw === 'N' || bw === 'S') {
      const w = width || p.w;
      const x = width ? Math.round(c.x - width / 2) : p.x;
      return bw === 'N' ? rect(x, p.y + p.d, w, depth) : rect(x, p.y - depth, w, depth);
    }
    const d = width || p.d;
    const y = width ? Math.round(c.y - width / 2) : p.y;
    return bw === 'W' ? rect(p.x + p.w, y, depth, d) : rect(p.x - depth, y, depth, d);
  }

  const chairZone = (desk, room) => frontZone(desk, room, CHAIR_ZONE, CHAIR_ZONE);

  // Walkway strips along both long sides of a bed.
  function bedStrips(p) {
    if (p.rotation === 90) return [rect(p.x, p.y - CLEAR, p.w, CLEAR), rect(p.x, p.y + p.d, p.w, CLEAR)];
    return [rect(p.x - CLEAR, p.y, CLEAR, p.d), rect(p.x + p.w, p.y, CLEAR, p.d)];
  }

  // Things that block a bed's side walkway: furniture (bar bedside tables and lamps)
  // plus the space a chair needs at each desk.
  function stripBlockers(room, placements, except) {
    const out = [];
    for (const q of placements) {
      if (q === except) continue;
      if (!STRIP_EXEMPT.has(q.category)) out.push(q);
      if (q.category === 'desk') { const z = chairZone(q, room); if (z) out.push(z); }
    }
    return out;
  }

  function bedHasWalkway(bed, room, blockers) {
    return bedStrips(bed).some((s) => insideRoom(s, room) && !blockers.some((b) => overlaps(b, s)));
  }

  function spanOnWall(r, wall) {
    return wall === 'N' || wall === 'S' ? [r.x, r.x + r.w] : [r.y, r.y + r.d];
  }

  function coversWindow(r, wall, room) {
    if (!wall) return false;
    const [a, b] = spanOnWall(r, wall);
    return (room.windows || []).some((win) => win.wall === wall && a < win.offset_cm + win.width_cm && win.offset_cm < b);
  }

  /* ---------- room input ---------- */
  function checkRoom(room) {
    const errs = [];
    const W = room.width_cm, L = room.length_cm;
    if (!Number.isInteger(W) || W < 200 || W > 1000) errs.push('Width must be a whole number from 200 to 1000 cm.');
    if (!Number.isInteger(L) || L < 200 || L > 1000) errs.push('Length must be a whole number from 200 to 1000 cm.');
    if (errs.length) return errs;
    const d = room.door || {};
    if (!['N', 'E', 'S', 'W'].includes(d.wall)) errs.push('Pick which wall the door is on.');
    else {
      if (!Number.isInteger(d.width_cm) || d.width_cm < 60 || d.width_cm > 120) errs.push('Door width must be 60 to 120 cm.');
      else if (!Number.isInteger(d.offset_cm) || d.offset_cm < 0 || d.offset_cm + d.width_cm > wallLength(room, d.wall)) {
        errs.push(`Door doesn't fit on that wall: offset plus width must be at most ${wallLength(room, d.wall)} cm.`);
      }
    }
    (room.windows || []).forEach((win, i) => {
      const n = i + 1;
      if (!['N', 'E', 'S', 'W'].includes(win.wall)) errs.push(`Pick a wall for window ${n}.`);
      else if (!Number.isInteger(win.width_cm) || win.width_cm < 30) errs.push(`Window ${n} must be at least 30 cm wide.`);
      else if (!Number.isInteger(win.offset_cm) || win.offset_cm < 0 || win.offset_cm + win.width_cm > wallLength(room, win.wall)) {
        errs.push(`Window ${n} doesn't fit on that wall: offset plus width must be at most ${wallLength(room, win.wall)} cm.`);
      } else if (d.wall === win.wall && win.offset_cm < d.offset_cm + d.width_cm && d.offset_cm < win.offset_cm + win.width_cm) {
        errs.push(`Window ${n} overlaps the door.`);
      }
    });
    return errs;
  }

  /* ---------- validation ---------- */
  function clearanceChecks(room, placements) {
    let met = 0, total = 0;
    const warnings = [];
    for (const p of placements) {
      if (FRONT_CLEAR_CATS.has(p.category) && backWall(p, room)) {
        total++;
        const z = frontZone(p, room, CLEAR);
        const ok = insideRoom(z, room) && !placements.some((q) => q !== p && !(p.category === 'desk' && q.category === 'chair') && overlaps(q, z));
        if (ok) met++; else warnings.push(`Less than 75 cm in front of the ${nameOf(p).toLowerCase()}.`);
      }
      if (p.category === 'bed') {
        total++;
        const ok = bedHasWalkway(p, room, stripBlockers(room, placements, p));
        if (ok) met++; else warnings.push(`No 75 cm walkway along either side of the ${nameOf(p).toLowerCase()}.`);
      }
    }
    return { met, total, warnings };
  }

  function validateLayout(room, placements) {
    const errors = [];
    const door = doorRect(room);
    for (const p of placements) {
      if (!insideRoom(p, room)) errors.push({ code: 'outside', ids: [p.ref_id], message: `${nameOf(p)} sticks out of the room.` });
      else if (overlaps(p, door)) errors.push({ code: 'door', ids: [p.ref_id], message: `${nameOf(p)} blocks the door.` });
      if (WALL_CATS.has(p.category) && !backWall(p, room)) {
        errors.push({ code: 'wall', ids: [p.ref_id], message: `${nameOf(p)} needs its back against a wall.` });
      }
    }
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i], b = placements[j];
        if (overlaps(a, b)) errors.push({ code: 'overlap', ids: [a.ref_id, b.ref_id], message: `${nameOf(a)} overlaps the ${nameOf(b).toLowerCase()}.` });
      }
    }
    for (const desk of placements) {
      if (desk.category !== 'desk' || !backWall(desk, room)) continue;
      const z = chairZone(desk, room);
      if (overlaps(z, door)) errors.push({ code: 'chair', ids: [desk.ref_id], message: `The chair space at the ${nameOf(desk).toLowerCase()} blocks the door.` });
      for (const q of placements) {
        if (q !== desk && q.category !== 'chair' && overlaps(q, z)) {
          errors.push({ code: 'chair', ids: [q.ref_id, desk.ref_id], message: `${nameOf(q)} blocks the chair space at the ${nameOf(desk).toLowerCase()}.` });
        }
      }
    }
    const clearance = clearanceChecks(room, placements);
    const windowWarnings = placements
      .filter((p) => TALL_CATS.has(p.category) && coversWindow(p, backWall(p, room), room))
      .map((p) => `The ${nameOf(p).toLowerCase()} covers part of a window.`);
    return { valid: errors.length === 0, errors, warnings: [...clearance.warnings, ...windowWarnings], clearance, windowProblems: windowWarnings.length };
  }

  /* ---------- placement ---------- */
  function positions(max) {
    const out = [];
    if (max < 0) return out;
    for (let v = 0; v <= max; v += STEP) out.push(v);
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }

  function wallCandidates(item, room) {
    const W = room.width_cm, L = room.length_cm, iw = item.width_cm, id = item.depth_cm;
    const out = [];
    for (const x of positions(W - iw)) out.push({ x, y: 0, w: iw, d: id, rotation: 0, wall: 'N' });
    for (const y of positions(L - iw)) out.push({ x: W - id, y, w: id, d: iw, rotation: 90, wall: 'E' });
    for (const x of positions(W - iw)) out.push({ x, y: L - id, w: iw, d: id, rotation: 0, wall: 'S' });
    for (const y of positions(L - iw)) out.push({ x: 0, y, w: id, d: iw, rotation: 90, wall: 'W' });
    return out.filter((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.d <= L);
  }

  function anchorCandidates(item, room, placed, variant) {
    const W = room.width_cm, L = room.length_cm, iw = item.width_cm, id = item.depth_cm;
    const find = (cat) => placed.find((p) => p.category === cat);
    const out = [];
    const cat = item.category;
    if (cat === 'bedside-table') {
      const bed = find('bed');
      const bw = bed && backWall(bed, room);
      if (bw === 'N' || bw === 'S') {
        const y = bw === 'N' ? 0 : L - id;
        out.push({ x: bed.x - iw, y, w: iw, d: id, rotation: 0, anchorCost: 0 });
        out.push({ x: bed.x + bed.w, y, w: iw, d: id, rotation: 0, anchorCost: 1 });
      } else if (bw) {
        const x = bw === 'W' ? 0 : W - id;
        out.push({ x, y: bed.y - iw, w: id, d: iw, rotation: 90, anchorCost: 0 });
        out.push({ x, y: bed.y + bed.d, w: id, d: iw, rotation: 90, anchorCost: 1 });
      }
    }
    if (cat === 'chair') {
      const desk = find('desk');
      const bw = desk && backWall(desk, room);
      if (bw) {
        const c = center(desk);
        if (bw === 'N') out.push({ x: Math.round(c.x - iw / 2), y: desk.y + desk.d, w: iw, d: id, rotation: 0, anchorCost: 0 });
        if (bw === 'S') out.push({ x: Math.round(c.x - iw / 2), y: desk.y - id, w: iw, d: id, rotation: 0, anchorCost: 0 });
        if (bw === 'W') out.push({ x: desk.x + desk.w, y: Math.round(c.y - iw / 2), w: id, d: iw, rotation: 90, anchorCost: 0 });
        if (bw === 'E') out.push({ x: desk.x - id, y: Math.round(c.y - iw / 2), w: id, d: iw, rotation: 90, anchorCost: 0 });
      }
    }
    if (cat === 'coffee-table') {
      const sofa = find('sofa');
      const bw = sofa && backWall(sofa, room);
      if (bw) {
        const c = center(sofa), GAP = 40;
        if (bw === 'N') out.push({ x: Math.round(c.x - iw / 2), y: sofa.y + sofa.d + GAP, w: iw, d: id, rotation: 0, anchorCost: 0 });
        if (bw === 'S') out.push({ x: Math.round(c.x - iw / 2), y: sofa.y - GAP - id, w: iw, d: id, rotation: 0, anchorCost: 0 });
        if (bw === 'W') out.push({ x: sofa.x + sofa.w + GAP, y: Math.round(c.y - iw / 2), w: id, d: iw, rotation: 90, anchorCost: 0 });
        if (bw === 'E') out.push({ x: sofa.x - GAP - id, y: Math.round(c.y - iw / 2), w: id, d: iw, rotation: 90, anchorCost: 0 });
      }
    }
    if (cat === 'armchair') {
      const sofa = find('sofa');
      const table = find('coffee-table');
      const bw = sofa && backWall(sofa, room);
      if (bw && table) {
        const c = center(table), GAP = 30;
        if (bw === 'N' || bw === 'S') {
          out.push({ x: table.x - GAP - id, y: Math.round(c.y - iw / 2), w: id, d: iw, rotation: 90, anchorCost: 0 });
          out.push({ x: table.x + table.w + GAP, y: Math.round(c.y - iw / 2), w: id, d: iw, rotation: 90, anchorCost: 1 });
        } else {
          out.push({ x: Math.round(c.x - iw / 2), y: table.y - GAP - id, w: iw, d: id, rotation: 0, anchorCost: 0 });
          out.push({ x: Math.round(c.x - iw / 2), y: table.y + table.d + GAP, w: iw, d: id, rotation: 0, anchorCost: 1 });
        }
      }
    }
    if (cat === 'floor-lamp') {
      const corners = [
        { x: 0, y: 0, w: iw, d: id, rotation: 0 },
        { x: W - iw, y: 0, w: iw, d: id, rotation: 0 },
        { x: 0, y: L - id, w: iw, d: id, rotation: 0 },
        { x: W - iw, y: L - id, w: iw, d: id, rotation: 0 },
      ];
      const near = find('sofa') || find('bed') || find('armchair');
      for (const k of corners) {
        k.anchorCost = variant === 'cosy' && near ? dist(center(k), center(near)) / 100 : 0;
        out.push(k);
      }
    }
    return out.filter((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.d <= L);
  }

  const ANCHORED = new Set(['bedside-table', 'chair', 'coffee-table', 'armchair', 'floor-lamp']);

  function makeCost(variant, room, placed, avoid) {
    const W = room.width_cm, L = room.length_cm;
    const dc = doorCenter(room);
    const hasWindows = (room.windows || []).length > 0;
    const find = (cat) => placed.find((p) => p.category === cat);
    const cornerDist = (r) => Math.min(r.x, W - (r.x + r.w)) + Math.min(r.y, L - (r.y + r.d));
    return (item, c) => {
      const cat = item.category;
      let cost;
      if (ANCHORED.has(cat) && c.anchorCost != null) cost = c.anchorCost;
      else if (ANCHORED.has(cat) && anchorAvailable(cat, placed)) cost = 1000 + cornerDist(c);
      else {
        cost = cornerDist(c);
        if (variant === 'work') {
          if (cat === 'desk') {
            if (hasWindows) {
              const wins = room.windows.filter((w) => w.wall === c.wall);
              if (wins.length) {
                const [a, b] = spanOnWall(c, c.wall);
                const mid = (a + b) / 2;
                cost = Math.min(...wins.map((w) => Math.abs(mid - (w.offset_cm + w.width_cm / 2))));
              } else cost = 400 + cornerDist(c);
            } else cost = 600 - dist(center(c), dc);
          } else if (cat === 'bed' || cat === 'sofa') {
            const desk = find('desk');
            cost = desk ? 600 - dist(center(c), center(desk)) + 0.3 * cornerDist(c) : cornerDist(c);
          }
        } else if (variant === 'cosy') {
          if (cat === 'bed' || cat === 'sofa') cost = 1200 - dist(center(c), dc) + 0.5 * cornerDist(c);
          else if (cat === 'wardrobe') cost = 0.5 * dist(center(c), dc) + cornerDist(c);
        }
        if (cat === 'tv-unit') {
          const sofa = find('sofa');
          const sw = sofa && backWall(sofa, room);
          if (sw) {
            // Straight across from the sofa, on the opposite wall.
            const sc = center(sofa);
            const target = sw === 'N' ? { x: sc.x, y: L } : sw === 'S' ? { x: sc.x, y: 0 } : sw === 'W' ? { x: W, y: sc.y } : { x: 0, y: sc.y };
            cost = dist(center(c), target);
          }
        }
      }
      if (TALL_CATS.has(cat) && coversWindow(c, c.wall, room)) cost += 2000;
      if (avoid && avoid.ref_id === item.id && avoid.wall === c.wall) cost += 5000;
      return cost;
    };
  }

  function anchorAvailable(cat, placed) {
    const has = (c) => placed.some((p) => p.category === c);
    if (cat === 'bedside-table') return has('bed');
    if (cat === 'chair') return has('desk');
    if (cat === 'coffee-table') return has('sofa');
    if (cat === 'armchair') return has('sofa') && has('coffee-table');
    if (cat === 'floor-lamp') return true;
    return false;
  }

  function hardOk(c, item, room, placed, door) {
    if (!insideRoom(c, room) || overlaps(c, door)) return false;
    for (const p of placed) if (overlaps(c, p)) return false;
    if (item.category !== 'chair') {
      for (const p of placed) {
        if (p.category !== 'desk') continue;
        const z = chairZone(p, room);
        if (z && overlaps(c, z)) return false;
      }
    }
    if (item.category === 'desk') {
      const z = chairZone({ ...c, category: 'desk' }, room);
      if (!z || !insideRoom(z, room) || overlaps(z, door)) return false;
      for (const p of placed) if (p.category !== 'chair' && overlaps(z, p)) return false;
    }
    return true;
  }

  function softOk(c, item, room, placed) {
    const cand = { ...c, category: item.category };
    for (const p of placed) {
      if (FRONT_CLEAR_CATS.has(p.category)) {
        const z = frontZone(p, room, CLEAR);
        if (z && overlaps(c, z) && !(p.category === 'desk' && item.category === 'chair')) return false;
      }
      if (p.category === 'bed' && !(STRIP_EXEMPT.has(item.category) && item.category !== 'desk')) {
        const blockers = stripBlockers(room, [...placed, cand], p);
        if (!bedHasWalkway(p, room, blockers)) return false;
      }
    }
    if (FRONT_CLEAR_CATS.has(item.category)) {
      const z = frontZone(cand, room, CLEAR);
      if (!z || !insideRoom(z, room) || placed.some((p) => p.category !== 'chair' && overlaps(p, z))) return false;
    }
    if (item.category === 'bed' && !bedHasWalkway(cand, room, stripBlockers(room, placed, null))) return false;
    return true;
  }

  function orderItems(items, variant, orderIndex) {
    const base = ORDERS[orderIndex || 0];
    const order = variant === 'work' ? ['desk', 'chair', ...base.filter((c) => c !== 'desk' && c !== 'chair')] : base;
    const rank = (c) => { const i = order.indexOf(c); return i < 0 ? order.length : i; };
    return [...items].sort((a, b) => rank(a.category) - rank(b.category) ||
      b.width_cm * b.depth_cm - a.width_cm * a.depth_cm || String(a.id).localeCompare(String(b.id)));
  }

  function placeAll(room, items, variant, locked, avoid, orderIndex) {
    const door = doorRect(room);
    const placed = [];
    const warnings = [];
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const l of locked || []) {
      const it = byId.get(l.ref_id);
      if (it) placed.push({ ref_type: 'owned', ref_id: it.id, name: it.name, category: it.category, x: l.x, y: l.y, w: l.w, d: l.d, rotation: l.rotation, locked: true });
    }
    const lockedIds = new Set(placed.map((p) => p.ref_id));
    for (const item of orderItems(items.filter((i) => !lockedIds.has(i.id)), variant, orderIndex)) {
      const cands = [...anchorCandidates(item, room, placed, variant), ...wallCandidates(item, room)];
      const cost = makeCost(variant, room, placed, avoid);
      let best = null, bestCost = Infinity, relaxed = null, relaxedCost = Infinity;
      for (const c of cands) {
        if (!hardOk(c, item, room, placed, door)) continue;
        const k = cost(item, c);
        if (softOk(c, item, room, placed)) {
          if (k < bestCost) { best = c; bestCost = k; }
        } else if (k < relaxedCost) { relaxed = c; relaxedCost = k; }
      }
      // A small piece slightly tight next to its anchor beats the same piece stranded across the room.
      const strandedAnchor = ANCHORED.has(item.category) && best && bestCost >= 1000 && relaxed && relaxedCost < 1000;
      const pick = strandedAnchor ? relaxed : best || relaxed;
      if (!pick) { warnings.push(`Couldn't fit: ${item.name}.`); continue; }
      placed.push({ ref_type: 'owned', ref_id: item.id, name: item.name, category: item.category, x: pick.x, y: pick.y, w: pick.w, d: pick.d, rotation: pick.rotation, locked: false });
    }
    return { placements: placed, warnings };
  }

  /* ---------- slots ---------- */
  function slotObstacles(room, placements, slots, strict) {
    const obs = [...placements, ...slots, doorRect(room)];
    for (const p of placements) {
      if (p.category === 'desk') { const z = chairZone(p, room); if (z) obs.push(z); }
      if (strict && FRONT_CLEAR_CATS.has(p.category)) { const z = frontZone(p, room, CLEAR); if (z) obs.push(z); }
    }
    if (strict) {
      for (const p of placements) {
        if (p.category !== 'bed') continue;
        const blockers = stripBlockers(room, placements, p);
        const free = bedStrips(p).filter((s) => insideRoom(s, room) && !blockers.some((b) => overlaps(b, s)));
        if (free.length === 1) obs.push(free[0]);
      }
    }
    return obs;
  }

  const isFree = (r, room, obs) => insideRoom(r, room) && !obs.some((o) => overlaps(r, o));

  function wallRect(room, wall, a, width, depth) {
    const W = room.width_cm, L = room.length_cm;
    if (wall === 'N') return rect(a, 0, width, depth);
    if (wall === 'S') return rect(a, L - depth, width, depth);
    if (wall === 'W') return rect(0, a, depth, width);
    return rect(W - depth, a, depth, width);
  }

  // Free runs along a wall at a given depth, as [start, end] intervals.
  function wallRuns(room, wall, depth, obs) {
    const len = wallLength(room, wall);
    const runs = [];
    let start = null;
    for (let t = 0; t < len; t += STEP) {
      const cell = wallRect(room, wall, t, Math.min(STEP, len - t), depth);
      const free = isFree(cell, room, obs);
      if (free && start === null) start = t;
      if (!free && start !== null) { runs.push([start, t]); start = null; }
    }
    if (start !== null) runs.push([start, len]);
    return runs;
  }

  function findWallSlot(room, cat, placements, slots, strict, minSize, capSize) {
    const min = minSize || smallestPreset(cat);
    const cap = capSize || SLOT_CAP[cat] || { w: 120, d: 60 };
    const obs = slotObstacles(room, placements, slots, strict);
    let best = null;
    for (const wall of ['N', 'E', 'S', 'W']) {
      for (const run of wallRuns(room, wall, min.d, obs)) {
        let [a, b] = run;
        if (b - a < min.w) continue;
        if (strict && TALL_CATS.has(cat)) {
          // pick the longest stretch of this run that avoids windows
          const sub = splitAroundWindows(room, wall, a, b).filter(([s, e]) => e - s >= min.w);
          if (!sub.length) continue;
          [a, b] = sub.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m));
        }
        const width = Math.min(b - a, cap.w);
        let depth = min.d;
        for (let dd = min.d + STEP; dd <= cap.d; dd += STEP) {
          if (isFree(wallRect(room, wall, a, width, dd), room, obs)) depth = dd; else break;
        }
        const r = wallRect(room, wall, a, width, depth);
        if (strict && FRONT_CLEAR_CATS.has(cat)) {
          const z = frontZone({ ...r, rotation: wall === 'N' || wall === 'S' ? 0 : 90 }, room, CLEAR);
          if (!z || !insideRoom(z, room) || [...placements, ...slots].some((o) => overlaps(o, z))) continue;
        }
        const area = width * depth;
        if (!best || area > best.area) best = { ...r, wall, area };
      }
    }
    return best ? { x: best.x, y: best.y, w: best.w, d: best.d, wall: best.wall } : null;
  }

  function splitAroundWindows(room, wall, a, b) {
    let parts = [[a, b]];
    for (const win of room.windows || []) {
      if (win.wall !== wall) continue;
      const ws = win.offset_cm, we = win.offset_cm + win.width_cm;
      parts = parts.flatMap(([s, e]) => {
        if (we <= s || ws >= e) return [[s, e]];
        const out = [];
        if (ws > s) out.push([s, ws]);
        if (we < e) out.push([we, e]);
        return out;
      });
    }
    return parts;
  }

  function trySizes(room, obs, rects) {
    for (const r of rects) if (isFree(r, room, obs)) return r;
    return null;
  }

  function findSlotFor(room, cat, placements, slots) {
    const find = (c) => placements.find((p) => p.category === c);
    const obs = slotObstacles(room, placements, slots, false);
    const W = room.width_cm, L = room.length_cm;
    if (cat === 'chair') {
      const desk = find('desk');
      if (desk && backWall(desk, room)) {
        const z = chairZone(desk, room);
        const obsNoZone = [...placements, ...slots, doorRect(room)];
        if (isFree(z, room, obsNoZone)) return { ...z, wall: null, facing: backWall(desk, room) };
      }
    }
    if (cat === 'bedside-table') {
      const bed = find('bed');
      const bw = bed && backWall(bed, room);
      if (bw) {
        const sizes = [[55, 45], [50, 40], [45, 40]];
        const rects = [];
        for (const [w, d] of sizes) {
          if (bw === 'N' || bw === 'S') {
            const y = bw === 'N' ? 0 : L - d;
            rects.push(rect(bed.x - w, y, w, d), rect(bed.x + bed.w, y, w, d));
          } else {
            const x = bw === 'W' ? 0 : W - d;
            rects.push(rect(x, bed.y - w, d, w), rect(x, bed.y + bed.d, d, w));
          }
        }
        const r = trySizes(room, obs, rects);
        if (r) return { ...r, wall: bw };
      }
    }
    if (cat === 'coffee-table') {
      const sofa = find('sofa');
      const bw = sofa && backWall(sofa, room);
      if (bw) {
        const c = center(sofa), GAP = 40;
        const rects = [];
        for (const [w, d] of [[120, 65], [110, 60], [100, 55], [100, 50]]) {
          if (bw === 'N') rects.push(rect(Math.round(c.x - w / 2), sofa.y + sofa.d + GAP, w, d));
          if (bw === 'S') rects.push(rect(Math.round(c.x - w / 2), sofa.y - GAP - d, w, d));
          if (bw === 'W') rects.push(rect(sofa.x + sofa.w + GAP, Math.round(c.y - w / 2), d, w));
          if (bw === 'E') rects.push(rect(sofa.x - GAP - d, Math.round(c.y - w / 2), d, w));
        }
        const r = trySizes(room, obs, rects);
        if (r) return { ...r, wall: null, facing: bw };
      }
    }
    if (cat === 'armchair') {
      const sofa = find('sofa');
      const table = find('coffee-table') || slots.find((s) => s.category === 'coffee-table');
      const bw = sofa && backWall(sofa, room);
      if (bw && table) {
        const c = center(table), GAP = 30;
        const rects = [];
        for (const [w, d] of [[95, 90], [85, 85], [80, 80]]) {
          if (bw === 'N' || bw === 'S') rects.push(rect(table.x - GAP - d, Math.round(c.y - w / 2), d, w), rect(table.x + table.w + GAP, Math.round(c.y - w / 2), d, w));
          else rects.push(rect(Math.round(c.x - w / 2), table.y - GAP - d, w, d), rect(Math.round(c.x - w / 2), table.y + table.d + GAP, w, d));
        }
        const r = trySizes(room, obs, rects);
        if (r) return { ...r, wall: null };
      }
    }
    if (cat === 'floor-lamp') {
      const rects = [];
      for (const s of [50, 45, 40]) rects.push(rect(0, 0, s, s), rect(W - s, 0, s, s), rect(0, L - s, s, s), rect(W - s, L - s, s, s));
      const r = trySizes(room, obs, rects);
      if (r) return { ...r, wall: null };
    }
    const r = findWallSlot(room, cat, placements, slots, true) || findWallSlot(room, cat, placements, slots, false);
    return r;
  }

  function fillSlots(room, placements) {
    const present = new Set(placements.map((p) => p.category));
    const missing = (ESSENTIALS[room.type] || ESSENTIALS.bedroom).filter((c) => !present.has(c));
    const order = [...missing].sort((a, b) => {
      const pa = smallestPreset(a), pb = smallestPreset(b);
      const anchoredA = ANCHORED.has(a) ? 1 : 0, anchoredB = ANCHORED.has(b) ? 1 : 0;
      return anchoredA - anchoredB || pb.w * pb.d - pa.w * pa.d;
    });
    const slots = [];
    const warnings = [];
    for (const cat of order) {
      const r = findSlotFor(room, cat, placements, slots);
      if (r) slots.push({ id: `fill:${cat}`, kind: 'fill', category: cat, x: r.x, y: r.y, w: r.w, d: r.d, wall: r.wall || null, facing: r.facing || null });
      else warnings.push(`No space left for a ${label(cat).toLowerCase()} in this layout.`);
    }
    slots.sort((a, b) => missing.indexOf(a.category) - missing.indexOf(b.category));
    return { slots, warnings };
  }

  function gapSlots(room, placements) {
    const obs = slotObstacles(room, placements, [], true);
    const gaps = [];
    for (const wall of ['N', 'E', 'S', 'W']) {
      for (const [a, b] of wallRuns(room, wall, 40, obs)) {
        if (b - a < 40) continue;
        const width = Math.min(b - a, 160);
        let depth = 40;
        for (let dd = 45; dd <= 60; dd += STEP) {
          if (isFree(wallRect(room, wall, a, width, dd), room, obs)) depth = dd; else break;
        }
        gaps.push({ ...wallRect(room, wall, a, width, depth), wall });
      }
    }
    gaps.sort((p, q) => q.w * q.d - p.w * p.d || p.x - q.x || p.y - q.y);
    return gaps.slice(0, 4).map((g, i) => ({ id: `gap:${g.wall}:${g.x}:${g.y}`, kind: 'gap', category: null, x: g.x, y: g.y, w: g.w, d: g.d, wall: g.wall, index: i }));
  }

  function computeSlots(room, placements, items, goal) {
    if (goal === 'replace') {
      const replaceIds = new Set(items.filter((i) => !i.keep).map((i) => i.id));
      const keep = placements.filter((p) => !replaceIds.has(p.ref_id));
      const slots = placements.filter((p) => replaceIds.has(p.ref_id)).map((p) => ({
        id: `replace:${p.ref_id}`, kind: 'replace', category: p.category, x: p.x, y: p.y, w: p.w, d: p.d,
        wall: backWall(p, room), replaces: p.name,
      }));
      return { placements: keep, slots, warnings: [] };
    }
    if (goal === 'fill') {
      const { slots, warnings } = fillSlots(room, placements);
      return { placements, slots, warnings };
    }
    return { placements, slots: gapSlots(room, placements), warnings: [] };
  }

  /* ---------- scoring ---------- */
  function largestFreeRect(room, placements) {
    const cols = Math.ceil(room.width_cm / GRID), rows = Math.ceil(room.length_cm / GRID);
    const heights = new Array(cols).fill(0);
    let best = { area: 0, w: 0, d: 0 };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = rect(c * GRID, r * GRID, Math.min(GRID, room.width_cm - c * GRID), Math.min(GRID, room.length_cm - r * GRID));
        const blocked = placements.some((p) => overlaps(cell, p));
        heights[c] = blocked ? 0 : heights[c] + 1;
      }
      const stack = [];
      for (let c = 0; c <= cols; c++) {
        const h = c === cols ? 0 : heights[c];
        let start = c;
        while (stack.length && stack[stack.length - 1][1] >= h) {
          const [s, sh] = stack.pop();
          const area = sh * (c - s);
          if (area > best.area) best = { area, w: (c - s) * GRID, d: sh * GRID };
          start = s;
        }
        stack.push([start, h]);
      }
    }
    return { w: Math.min(best.w, room.width_cm), d: Math.min(best.d, room.length_cm) };
  }

  function scoreLayout(room, placements, clearance, placedCount, totalCount) {
    const free = largestFreeRect(room, placements);
    const share = (free.w * free.d) / (room.width_cm * room.length_cm);
    const pClear = clearance.total ? clearance.met / clearance.total : 1;
    const walk = Math.round(40 * pClear);
    const open = Math.round(35 * Math.min(1, share / 0.3));
    const fit = Math.round(25 * (totalCount ? placedCount / totalCount : 1));
    const m = (cm) => (cm / 100).toFixed(1);
    return {
      score: walk + open + fit,
      breakdown: [
        { key: 'walk', label: 'Walkways clear', value: walk, max: 40, note: clearance.total ? `${clearance.met} of ${clearance.total} clearance checks pass` : 'No clearance checks needed' },
        { key: 'open', label: 'Open floor', value: open, max: 35, note: `Largest clear area ${m(free.w)} m × ${m(free.d)} m` },
        { key: 'fit', label: 'Everything fits', value: fit, max: 25, note: `${placedCount} of ${totalCount} pieces placed` },
      ],
      free,
    };
  }

  function signature(placements) {
    return placements.map((p) => `${p.ref_id}@${p.x},${p.y},${p.rotation}`).sort().join('|');
  }

  function finishLayout(room, items, variant, placed, goal, fixedSlots) {
    const { placements, slots, warnings: slotWarnings } = fixedSlots
      ? { placements: placed.placements, slots: fixedSlots, warnings: [] }
      : computeSlots(room, placed.placements, items, goal);
    const v = validateLayout(room, placements);
    const placedCount = placed.placements.length;
    const s = scoreLayout(room, placements, v.clearance, placedCount, items.length);
    return {
      variant,
      placements,
      slots,
      score: s.score,
      breakdown: s.breakdown,
      warnings: [...placed.warnings, ...v.warnings, ...slotWarnings],
      valid: v.valid,
    };
  }

  const VARIANT_INFO = {
    open: { name: 'Open', blurb: 'Big pieces pushed into corners so the middle of the room stays clear.' },
    work: { name: 'Work', blurb: 'Desk under the window or far from the door, bed kept away from it.' },
    cosy: { name: 'Cosy', blurb: 'Bed or sofa tucked into the corner furthest from the door.' },
    custom: { name: 'Your edit', blurb: 'The layout as you arranged it.' },
  };

  // How strongly a layout shows its variant's idea. Higher is better.
  function character(room, placements, variant) {
    const find = (cat) => placements.find((p) => p.category === cat);
    if (variant === 'open') {
      const f = largestFreeRect(room, placements);
      return f.w * f.d;
    }
    if (variant === 'work') {
      const desk = find('desk');
      if (!desk) return 0;
      const onWindow = coversWindow(desk, backWall(desk, room), room) ? 1 : 0;
      const bed = find('bed') || find('sofa');
      return onWindow * 1e6 + (bed ? dist(center(bed), center(desk)) : 0);
    }
    const main = find('bed') || find('sofa');
    let v = main ? dist(center(main), doorCenter(room)) : 0;
    const hub = find('coffee-table') || find('sofa');
    for (const p of placements) if (p.category === 'armchair' && hub) v -= 2 * dist(center(p), center(hub));
    return v;
  }

  // Ranks candidate layouts: more pieces placed, fewer clearance problems,
  // a clearer expression of the variant's idea, then the higher score.
  function better(a, b) {
    if (!b) return true;
    if (a.placedCount !== b.placedCount) return a.placedCount > b.placedCount;
    if (a.problems !== b.problems) return a.problems < b.problems;
    if (Math.abs(a.character - b.character) > 1e-6) return a.character > b.character;
    return a.layout.score > b.layout.score;
  }

  function bestPlacement(room, items, variant, locked, goal, avoid, skipSigs) {
    let best = null;
    for (let o = 0; o < ORDERS.length; o++) {
      const placed = placeAll(room, items, variant, locked, avoid, o);
      const sig = signature(placed.placements);
      if (skipSigs && skipSigs.includes(sig)) continue;
      const layout = finishLayout(room, items, variant, placed, goal);
      const v = validateLayout(room, placed.placements);
      const cand = {
        placed, layout, sig, placedCount: placed.placements.length,
        problems: v.clearance.total - v.clearance.met + v.windowProblems,
        character: character(room, placed.placements, variant),
      };
      if (better(cand, best)) best = cand;
    }
    return best;
  }

  /* ---------- backup designs for Regenerate ----------
     Each variant also runs in the room mirrored left-right, top-bottom and both, with every
     placement order. Results are mirrored back, re-validated in the real room and ranked.
     Regenerate steps through these "design sets"; the same round always gives the same set. */
  const TRANSFORMS = ['id', 'fx', 'fy', 'fxy'];

  function mirrorRoom(room, t) {
    if (t === 'id') return room;
    const W = room.width_cm, L = room.length_cm;
    const fx = t === 'fx' || t === 'fxy', fy = t === 'fy' || t === 'fxy';
    const flip = (o) => {
      let wall = o.wall, off = o.offset_cm;
      if (fx) { if (wall === 'E') wall = 'W'; else if (wall === 'W') wall = 'E'; else off = W - off - o.width_cm; }
      if (fy) { if (wall === 'N') wall = 'S'; else if (wall === 'S') wall = 'N'; else off = L - off - o.width_cm; }
      return { ...o, wall, offset_cm: off };
    };
    return { ...room, door: flip(room.door), windows: (room.windows || []).map(flip) };
  }

  function mirrorRect(r, t, room) {
    const fx = t === 'fx' || t === 'fxy', fy = t === 'fy' || t === 'fxy';
    return { x: fx ? room.width_cm - r.x - r.w : r.x, y: fy ? room.length_cm - r.y - r.d : r.y };
  }

  function designPool(room, items, variant, locked) {
    const out = [];
    const seen = new Set();
    for (const t of TRANSFORMS) {
      const mr = mirrorRoom(room, t);
      const mLocked = locked.map((l) => ({ ...l, ...mirrorRect(l, t, room) }));
      for (let o = 0; o < ORDERS.length; o++) {
        const placed = placeAll(mr, items, variant, mLocked, null, o);
        const back = placed.placements.map((p) => ({ ...p, ...mirrorRect(p, t, room) }));
        const sig = signature(back);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const v = validateLayout(room, back);
        if (!v.valid) continue;
        out.push({
          placed: { placements: back, warnings: placed.warnings }, sig, placedCount: back.length,
          problems: v.clearance.total - v.clearance.met + v.windowProblems,
          character: character(room, back, variant), layout: { score: 0 },
        });
      }
    }
    out.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
    // Backups must be as complete as the best design and nearly as clear.
    const top = out[0];
    return top ? out.filter((c) => c.placedCount === top.placedCount && c.problems <= top.problems + 1) : [];
  }

  // The design sets after the first: each set takes, per variant, the best design not shown in an earlier set.
  function designSets(room, items, locked, firstSigs) {
    const pools = {};
    for (const v of ['open', 'work', 'cosy']) pools[v] = designPool(room, items, v, locked);
    const used = new Set(firstSigs);
    const sets = [];
    for (let guard = 0; guard < 12; guard++) {
      const set = [];
      for (const v of ['open', 'work', 'cosy']) {
        const pick = pools[v].find((c) => !used.has(c.sig) && !set.some((x) => x.sig === c.sig));
        if (!pick) return sets;
        set.push({ variant: v, cand: pick });
      }
      set.forEach((x) => used.add(x.cand.sig));
      sets.push(set);
    }
    return sets;
  }

  function generateLayouts(room, items, opts) {
    const first = firstLayouts(room, items, opts);
    const round = Math.max(0, Math.floor((opts && opts.round) || 0));
    const goal = (opts && opts.goal) || 'fill';
    const locked = (opts && opts.locked) || [];
    const extra = designSets(room, items, locked, first.map((l) => l.sig));
    const count = 1 + extra.length;
    const k = round % count;
    const chosen = k === 0
      ? first.map((l) => l.layout)
      : extra[k - 1].map(({ variant, cand }) => finishLayout(room, items, variant, cand.placed, goal));
    return chosen.map((l) => ({ ...l, set_index: k, set_count: count }));
  }

  // Number of distinct design sets Regenerate can cycle through for this room.
  function designPoolSize(room, items, opts) {
    return generateLayouts(room, items, opts)[0].set_count;
  }

  /* ---------- moving a suggested spot ---------- */
  // The wall a spot's back sits against: the long side along a wall first, then any wall it touches.
  function spotWall(room, r) {
    const W = room.width_cm, L = room.length_cm;
    if (r.w >= r.d) { if (r.y === 0) return 'N'; if (r.y + r.d === L) return 'S'; }
    else { if (r.x === 0) return 'W'; if (r.x + r.w === W) return 'E'; }
    if (r.y === 0) return 'N';
    if (r.y + r.d === L) return 'S';
    if (r.x === 0) return 'W';
    if (r.x + r.w === W) return 'E';
    return null;
  }

  function validateSpot(room, placements, others, spot) {
    const msgs = [];
    const what = spot.category ? `${label(spot.category).toLowerCase()} spot` : 'free space';
    if (!insideRoom(spot, room)) msgs.push(`The ${what} sticks out of the room.`);
    else if (overlaps(spot, doorRect(room))) msgs.push(`The ${what} blocks the door.`);
    for (const p of placements) if (overlaps(spot, p)) msgs.push(`The ${what} overlaps the ${nameOf(p).toLowerCase()}.`);
    for (const s of others) {
      if (overlaps(spot, s)) msgs.push(`The ${what} overlaps the ${s.category ? `${label(s.category).toLowerCase()} spot` : 'other free space'}.`);
    }
    if (spot.category !== 'chair') {
      for (const p of placements) {
        if (p.category !== 'desk') continue;
        const z = chairZone(p, room);
        if (z && overlaps(spot, z)) msgs.push(`The ${what} blocks the chair space at the ${nameOf(p).toLowerCase()}.`);
      }
    }
    if (spot.category && WALL_CATS.has(spot.category) && !backWall({ ...spot, rotation: spot.w >= spot.d ? 0 : 90 }, room)) {
      msgs.push(`A ${label(spot.category).toLowerCase()} needs its back against a wall. Move the spot to a wall or rotate it.`);
    }
    return msgs;
  }

  function firstLayouts(room, items, opts) {
    const goal = (opts && opts.goal) || 'fill';
    const locked = (opts && opts.locked) || [];
    const out = [];
    const sigs = [];
    for (const variant of ['open', 'work', 'cosy']) {
      let best = bestPlacement(room, items, variant, locked, goal, null, null);
      if (sigs.includes(best.sig)) {
        // Same arrangement as an earlier variant: look for a different one that is nearly as good.
        let alt = bestPlacement(room, items, variant, locked, goal, null, sigs);
        if (!alt) {
          const bigId = orderItems(best.placed.placements.filter((p) => !p.locked).map((p) => items.find((i) => i.id === p.ref_id)).filter(Boolean), variant)[0];
          const bigPlaced = bigId && best.placed.placements.find((p) => p.ref_id === bigId.id);
          if (bigPlaced) alt = bestPlacement(room, items, variant, locked, goal, { ref_id: bigId.id, wall: backWall(bigPlaced, room) }, sigs);
        }
        if (alt && alt.placedCount >= best.placedCount && alt.problems <= best.problems + 1) best = alt;
        else best.layout.warnings.push(`This room only fits one good arrangement, so it matches the ${VARIANT_INFO[out[sigs.indexOf(best.sig)].layout.variant].name} layout.`);
      }
      sigs.push(best.sig);
      out.push({ layout: best.layout, sig: best.sig });
    }
    return out;
  }

  // Recompute slots, score and warnings for an edited set of placements (used by the editor).
  // `fixedSlots` keeps slots that must not move, such as the footprints of pieces being replaced.
  function rebuildLayout(room, items, placements, goal, variant, fixedSlots) {
    const all = placements.slice();
    return finishLayout(room, items, variant || 'custom', { placements: all, warnings: missingWarnings(items, all, goal) }, goal, fixedSlots);
  }

  function missingWarnings(items, placements, goal) {
    const ids = new Set(placements.map((p) => p.ref_id));
    return items.filter((i) => !ids.has(i.id)).map((i) => `Couldn't fit: ${i.name}.`);
  }

  /* ---------- products in slots ---------- */
  function fitInSlot(product, slot) {
    const pw = product.width_cm, pd = product.depth_cm;
    const alongIsX = slot.wall ? slot.wall === 'N' || slot.wall === 'S' : slot.w >= slot.d;
    const along = alongIsX ? { w: pw, d: pd } : { w: pd, d: pw };
    const across = alongIsX ? { w: pd, d: pw } : { w: pw, d: pd };
    for (const [ext, rotation] of [[along, alongIsX ? 0 : 90], [across, alongIsX ? 90 : 0]]) {
      if (ext.w <= slot.w && ext.d <= slot.d) {
        const spareAlong = alongIsX ? slot.w - ext.w : slot.d - ext.d;
        const spareDeep = alongIsX ? slot.d - ext.d : slot.w - ext.w;
        return { w: ext.w, d: ext.d, rotation, spareWide: spareAlong, spareDeep };
      }
    }
    return null;
  }

  function placeProductInSlot(product, slot) {
    const f = fitInSlot(product, slot);
    if (!f) return null;
    let x = slot.x + (slot.w - f.w) / 2, y = slot.y + (slot.d - f.d) / 2;
    if (slot.wall === 'N') y = slot.y;
    if (slot.wall === 'S') y = slot.y + slot.d - f.d;
    if (slot.wall === 'W') x = slot.x;
    if (slot.wall === 'E') x = slot.x + slot.w - f.w;
    if (slot.wall === 'N' || slot.wall === 'S') x = slot.x;
    if (slot.wall === 'W' || slot.wall === 'E') y = slot.y;
    return { x: Math.round(x), y: Math.round(y), w: f.w, d: f.d, rotation: f.rotation };
  }

  return {
    STEP, CLEAR, CHAIR_ZONE, CATEGORIES, LABELS, WALL_CATS, FRONT_CLEAR_CATS, PRESETS, ESSENTIALS, VARIANT_INFO,
    label, overlaps, insideRoom, doorRect, backWall, frontZone, chairZone, bedStrips, checkRoom,
    validateLayout, generateLayouts, rebuildLayout, computeSlots, largestFreeRect, fitInSlot, placeProductInSlot,
    smallestPreset, designPoolSize, validateSpot, spotWall,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
