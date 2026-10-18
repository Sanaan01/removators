/* Plan renderer: a drafting-style SVG floor plan in centimetres, drawn to scale. */
const { html, render, useState, useEffect, useMemo, useRef, useCallback } = window.htmPreact || {};

const COLOUR_HEX = {
  white: '#f2f2ee', black: '#4a4a4a', 'natural wood': '#d9be95', 'dark wood': '#8a6a4c', grey: '#aab0b2',
  beige: '#e3d6be', green: '#86a88d', blue: '#7c95b8', terracotta: '#cf8466',
};
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

// Furniture symbols in local coordinates: width along x, depth along y, back edge at y = 0.
function symbolParts(cat, lw, ld) {
  const R = (x, y, w, h, cls, rx) => html`<rect class=${cls || 'detail'} x=${x} y=${y} width=${Math.max(0, w)} height=${Math.max(0, h)} rx=${rx || 0} />`;
  const Ln = (x1, y1, x2, y2) => html`<line class="detail" x1=${x1} y1=${y1} x2=${x2} y2=${y2} />`;
  const m = Math.min(lw, ld);
  const out = [];
  if (cat === 'bed') {
    const hb = Math.min(7, ld * 0.05);
    out.push(R(0, 0, lw, hb, 'detail-fill'));
    const ph = Math.min(28, ld * 0.15);
    if (lw > 115) {
      const pw = (lw - 24) / 2;
      out.push(R(8, hb + 5, pw, ph, 'detail', 4), R(16 + pw, hb + 5, pw, ph, 'detail', 4));
    } else out.push(R(8, hb + 5, lw - 16, ph, 'detail', 4));
    const fold = hb + 5 + ph + 12;
    out.push(Ln(0, fold, lw, fold));
    out.push(Ln(lw * 0.55, fold, lw, Math.min(ld, fold + lw * 0.45)));
  } else if (cat === 'sofa' || cat === 'armchair') {
    const back = ld * 0.26, arm = Math.min(lw * 0.12, 18);
    out.push(R(0, 0, lw, back, 'detail-fill', 3));
    out.push(R(0, back, arm, ld - back, 'detail', 3), R(lw - arm, back, arm, ld - back, 'detail', 3));
    const seats = cat === 'armchair' ? 1 : lw > 185 ? 3 : 2;
    const sw = (lw - 2 * arm) / seats;
    for (let i = 1; i < seats; i++) out.push(Ln(arm + sw * i, back, arm + sw * i, ld - 4));
  } else if (cat === 'chair') {
    out.push(R(3, 2, lw - 6, ld * 0.2, 'detail-fill', 3));
    out.push(R(5, ld * 0.28, lw - 10, ld * 0.64, 'detail', 4));
  } else if (cat === 'desk') {
    out.push(R(lw * 0.3, ld * 0.42, lw * 0.4, ld * 0.3, 'detail', 2));
    out.push(R(lw * 0.38, 4, lw * 0.24, Math.min(5, ld * 0.1), 'detail-fill'));
  } else if (cat === 'wardrobe') {
    out.push(Ln(4, ld / 2, lw - 4, ld / 2));
    for (let x = 12; x < lw - 6; x += 12) out.push(Ln(x - 4, ld * 0.24, x + 4, ld * 0.76));
  } else if (cat === 'bookcase') {
    out.push(R(3, 3, lw - 6, ld - 6, 'detail'));
    for (let x = 30; x < lw - 10; x += 30) out.push(Ln(x, 3, x, ld - 3));
  } else if (cat === 'dresser') {
    out.push(Ln(3, ld - 6, lw - 3, ld - 6));
    out.push(Ln(lw / 2, ld * 0.2, lw / 2, ld - 6));
  } else if (cat === 'bedside-table') {
    out.push(html`<circle class="detail" cx=${lw / 2} cy=${ld / 2} r=${m * 0.24} />`);
  } else if (cat === 'floor-lamp') {
    const r = m * 0.42;
    out.push(html`<circle class="detail" cx=${lw / 2} cy=${ld / 2} r=${r} />`);
    out.push(Ln(lw / 2 - r, ld / 2, lw / 2 + r, ld / 2), Ln(lw / 2, ld / 2 - r, lw / 2, ld / 2 + r));
  } else if (cat === 'coffee-table') {
    out.push(R(6, 6, lw - 12, ld - 12, 'detail', 4));
  } else if (cat === 'tv-unit') {
    out.push(R(lw * 0.15, 3, lw * 0.7, Math.min(4, ld * 0.12), 'detail-fill'));
    out.push(Ln(lw / 2, ld * 0.35, lw / 2, ld - 4));
  }
  return out;
}

function bodyShape(cat, lw, ld, fill) {
  const style = fill ? `fill:${fill}` : null;
  if (cat === 'floor-lamp') return html`<rect class="body" x="0" y="0" width=${lw} height=${ld} rx=${Math.min(lw, ld) / 2} style=${style} />`;
  const rx = cat === 'sofa' || cat === 'armchair' || cat === 'coffee-table' || cat === 'chair' ? 4 : 1.5;
  return html`<rect class="body" x="0" y="0" width=${lw} height=${ld} rx=${rx} style=${style} />`;
}

// Transform from local symbol space into room space, given which side the piece's back faces.
function backTransform(r, back) {
  if (back === 'S') return { lw: r.w, ld: r.d, t: `translate(${r.x + r.w} ${r.y + r.d}) rotate(180)` };
  if (back === 'W') return { lw: r.d, ld: r.w, t: `translate(${r.x} ${r.y + r.d}) rotate(-90)` };
  if (back === 'E') return { lw: r.d, ld: r.w, t: `translate(${r.x + r.w} ${r.y}) rotate(90)` };
  return { lw: r.w, ld: r.d, t: `translate(${r.x} ${r.y})` };
}

// Which way a placed piece faces, for drawing its symbol.
function backOf(p, room, placements) {
  const bw = Engine.backWall(p, room);
  if (bw && p.category !== 'chair' && p.category !== 'coffee-table' && p.category !== 'armchair') return bw;
  if (p.category === 'chair') {
    const desk = (placements || []).find((q) => q.category === 'desk' && Engine.backWall(q, room) && Engine.overlaps(Engine.chairZone(q, room), p));
    if (desk) return OPPOSITE[Engine.backWall(desk, room)];
  }
  if (bw) return bw;
  return p.rotation === 90 ? 'W' : 'N';
}

const SHORT_NAMES = { 'Floor lamp': 'Lamp', 'Bedside table': 'Bedside', 'Coffee table': 'Table', 'TV unit': 'TV', Bookcase: 'Shelf', Wardrobe: 'Robe', Armchair: 'Chair' };

function fitLabel(text, w, d, fs) {
  const width = (t, f) => t.length * f * 0.56;
  let short = text;
  for (const [k, v] of Object.entries(SHORT_NAMES)) short = short.replace(k, v).replace(k.toLowerCase(), v.toLowerCase());
  const tries = [text, short, text.split(' ')[0]].filter((t) => t && t !== '+' && t !== '+ ');
  for (const t of tries) {
    if (width(t, fs) <= w - 6 && fs * 1.2 <= d - 4) return { text: t, vertical: false };
    if (width(t, fs) <= d - 6 && fs * 1.2 <= w - 4) return { text: t, vertical: true };
  }
  return null;
}

function PieceLabel({ r, name, sub, fs }) {
  const main = fitLabel(name, r.w, r.d, fs * 0.8);
  if (!main) return null;
  const cx = r.x + r.w / 2, cy = r.y + r.d / 2;
  const subFs = fs * 0.62;
  const showSub = sub && (main.vertical ? r.w : r.d) > fs * 2.6 && (main.vertical ? r.d : r.w) > sub.length * subFs * 0.6 + 6;
  const tr = main.vertical ? `rotate(-90 ${cx} ${cy})` : null;
  return html`<g transform=${tr}>
    <text class="pl-label" x=${cx} y=${showSub ? cy - fs * 0.12 : cy + fs * 0.28} font-size=${fs * 0.8} text-anchor="middle">${main.text}</text>
    ${showSub && html`<text class="pl-sublabel" x=${cx} y=${cy + fs * 0.78} font-size=${subFs} text-anchor="middle">${sub}</text>`}
  </g>`;
}

function Plan(props) {
  const {
    room, placements = [], slots = [], products = [], compact = false, editable = false, selectedId = null,
    onSelect, onDrop, validateMove, onSlotClick, selectedSlotId = null, title = 'Floor plan', onKey, showSlots = true,
    editableSlots = false, onSlotDrop, validateSlotMove, onSlotKey,
  } = props;
  const W = room.width_cm, L = room.length_cm;
  const big = Math.max(W, L);
  const t = Math.max(8, Math.round(big / 34));
  const fs = Math.max(9, big / 30);
  const mL = compact ? t + 2 : t + fs * 2.9, mT = compact ? t + 2 : t + fs * 3.2;
  const mR = t + (compact ? 2 : 8), mB = t + (compact ? 2 : 8);
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const er = { width_cm: W, length_cm: L, door: room.door, windows: room.windows || [], type: room.type };

  const toRoom = (e) => {
    const svg = svgRef.current;
    const ctm = svg && svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const startDrag = (p, e) => {
    if (!editable) return;
    if (onSelect) onSelect(p.ref_id);
    if (p.locked) return;
    const pos = toRoom(e);
    if (!pos) return;
    e.preventDefault();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
    setDrag({ kind: 'item', id: p.ref_id, sx: pos.x, sy: pos.y, ox: p.x, oy: p.y, x: p.x, y: p.y, w: p.w, d: p.d });
  };
  // A suggested spot: drag to move it, or press and release without moving to select it.
  const startSlotDrag = (s, e) => {
    const pos = toRoom(e);
    if (!pos) return;
    e.preventDefault();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
    setDrag({ kind: 'slot', id: s.id, sx: pos.x, sy: pos.y, ox: s.x, oy: s.y, x: s.x, y: s.y, w: s.w, d: s.d });
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const pos = toRoom(e);
    if (!pos) return;
    let x = Math.round((drag.ox + pos.x - drag.sx) / 5) * 5;
    let y = Math.round((drag.oy + pos.y - drag.sy) / 5) * 5;
    x = Math.max(0, Math.min(W - drag.w, x));
    y = Math.max(0, Math.min(L - drag.d, y));
    const MAG = 15;
    if (x < MAG) x = 0;
    if (W - (x + drag.w) < MAG) x = W - drag.w;
    if (y < MAG) y = 0;
    if (L - (y + drag.d) < MAG) y = L - drag.d;
    if (x !== drag.x || y !== drag.y) setDrag({ ...drag, x, y });
  };
  const endDrag = () => {
    if (drag) {
      const moved = drag.x !== drag.ox || drag.y !== drag.oy;
      if (drag.kind === 'slot') {
        if (moved && onSlotDrop) onSlotDrop(drag.id, { x: drag.x, y: drag.y });
        else if (!moved && onSlotClick) onSlotClick(drag.id);
      } else if (moved && onDrop) onDrop(drag.id, { x: drag.x, y: drag.y });
    }
    setDrag(null);
  };

  const itemDrag = drag && drag.kind === 'item' ? drag : null;
  const slotDrag = drag && drag.kind === 'slot' ? drag : null;
  const shown = placements.map((p) => (itemDrag && p.ref_id === itemDrag.id ? { ...p, x: itemDrag.x, y: itemDrag.y } : p));
  const shownSlots = slots.map((s) => (slotDrag && s.id === slotDrag.id ? { ...s, x: slotDrag.x, y: slotDrag.y } : s));
  const shownProducts = products.map((pr) => (slotDrag && pr.slot_id === slotDrag.id
    ? { ...pr, rect: { ...pr.rect, x: pr.rect.x + slotDrag.x - slotDrag.ox, y: pr.rect.y + slotDrag.y - slotDrag.oy } } : pr));
  const dragError = itemDrag && validateMove ? validateMove(itemDrag.id, { x: itemDrag.x, y: itemDrag.y })
    : slotDrag && validateSlotMove && (slotDrag.x !== slotDrag.ox || slotDrag.y !== slotDrag.oy) ? validateSlotMove(slotDrag.id, { x: slotDrag.x, y: slotDrag.y }) : null;
  const door = room.door;
  const dw = door.width_cm, o = door.offset_cm;

  // walls with openings
  const wallPath = `M${-t},${-t}H${W + t}V${L + t}H${-t}Z M0,0V${L}H${W}V0Z`;
  const opening = (wall, off, len) => {
    if (wall === 'N') return { x: off, y: -t, w: len, h: t };
    if (wall === 'S') return { x: off, y: L, w: len, h: t };
    if (wall === 'W') return { x: -t, y: off, w: t, h: len };
    return { x: W, y: off, w: t, h: len };
  };
  const doorOpen = opening(door.wall, o, dw);
  let leaf, arc;
  if (door.wall === 'N') { leaf = `M${o},0L${o},${dw}`; arc = `M${o + dw},0A${dw},${dw} 0 0 1 ${o},${dw}`; }
  else if (door.wall === 'S') { leaf = `M${o},${L}L${o},${L - dw}`; arc = `M${o + dw},${L}A${dw},${dw} 0 0 0 ${o},${L - dw}`; }
  else if (door.wall === 'W') { leaf = `M0,${o}L${dw},${o}`; arc = `M0,${o + dw}A${dw},${dw} 0 0 0 ${dw},${o}`; }
  else { leaf = `M${W},${o}L${W - dw},${o}`; arc = `M${W},${o + dw}A${dw},${dw} 0 0 1 ${W - dw},${o}`; }
  const doorZone = Engine.doorRect(er);

  const grid = [];
  if (!compact) {
    for (let x = 50; x < W; x += 50) grid.push(html`<line class="pl-grid" x1=${x} y1="0" x2=${x} y2=${L} />`);
    for (let y = 50; y < L; y += 50) grid.push(html`<line class="pl-grid" x1="0" y1=${y} x2=${W} y2=${y} />`);
  }

  const dimY = -t - fs * 1.15, dimX = -t - fs * 1.15, tick = fs * 0.35;
  const slotMap = new Map(shownProducts.map((p) => [p.slot_id, p]));

  return html`<div class="plan-box">
    <svg ref=${svgRef} class=${`plan ${editable ? 'editable' : ''}`} viewBox=${`${-mL} ${-mT} ${W + mL + mR} ${L + mT + mB}`}
      role="img" aria-label=${title} onPointerMove=${moveDrag} onPointerUp=${endDrag} onPointerCancel=${endDrag}>
      <rect class="pl-floor" x="0" y="0" width=${W} height=${L} />
      ${grid}
      ${!compact && html`<rect class="pl-doorzone" x=${doorZone.x} y=${doorZone.y} width=${doorZone.w} height=${doorZone.d} />`}
      <path class="pl-wall" d=${wallPath} fill-rule="evenodd" />
      <rect class="pl-gap" x=${doorOpen.x} y=${doorOpen.y} width=${doorOpen.w} height=${doorOpen.h} />
      <path class="pl-door" d=${leaf} />
      <path class="pl-door" d=${arc} stroke-dasharray=${compact ? null : '4 3'} />
      ${(room.windows || []).map((win, i) => {
        const op = opening(win.wall, win.offset_cm, win.width_cm);
        const horiz = win.wall === 'N' || win.wall === 'S';
        return html`<g key=${`w${i}`}>
          <rect class="pl-gap" x=${op.x} y=${op.y} width=${op.w} height=${op.h} />
          ${horiz
            ? html`<line class="pl-glass" x1=${op.x} y1=${op.y + t * 0.35} x2=${op.x + op.w} y2=${op.y + t * 0.35} /><line class="pl-glass" x1=${op.x} y1=${op.y + t * 0.65} x2=${op.x + op.w} y2=${op.y + t * 0.65} /><line class="pl-glass" x1=${op.x} y1=${op.y} x2=${op.x} y2=${op.y + t} /><line class="pl-glass" x1=${op.x + op.w} y1=${op.y} x2=${op.x + op.w} y2=${op.y + t} />`
            : html`<line class="pl-glass" x1=${op.x + t * 0.35} y1=${op.y} x2=${op.x + t * 0.35} y2=${op.y + op.h} /><line class="pl-glass" x1=${op.x + t * 0.65} y1=${op.y} x2=${op.x + t * 0.65} y2=${op.y + op.h} /><line class="pl-glass" x1=${op.x} y1=${op.y} x2=${op.x + t} y2=${op.y} /><line class="pl-glass" x1=${op.x} y1=${op.y + op.h} x2=${op.x + t} y2=${op.y + op.h} />`}
        </g>`;
      })}
      ${!compact && html`<g>
        <line class="pl-dim" x1="0" y1=${dimY} x2=${W} y2=${dimY} />
        <line class="pl-dim" x1="0" y1=${dimY - tick} x2="0" y2=${dimY + tick} />
        <line class="pl-dim" x1=${W} y1=${dimY - tick} x2=${W} y2=${dimY + tick} />
        <text class="pl-dimtext" x=${W / 2} y=${dimY - fs * 0.45} font-size=${fs * 0.72} text-anchor="middle">${W} cm</text>
        <line class="pl-dim" x1=${dimX} y1="0" x2=${dimX} y2=${L} />
        <line class="pl-dim" x1=${dimX - tick} y1="0" x2=${dimX + tick} y2="0" />
        <line class="pl-dim" x1=${dimX - tick} y1=${L} x2=${dimX + tick} y2=${L} />
        <text class="pl-dimtext" x=${dimX - fs * 0.45} y=${L / 2} font-size=${fs * 0.72} text-anchor="middle" transform=${`rotate(-90 ${dimX - fs * 0.45} ${L / 2})`}>${L} cm</text>
        <g transform=${`translate(${W - fs * 0.3} ${-t - fs * 2.35})`}>
          <path class="pl-compass" d=${`M0,${-fs * 0.55}L${fs * 0.32},${fs * 0.3}L0,${fs * 0.12}L${-fs * 0.32},${fs * 0.3}Z`} />
          <text class="pl-compass" x=${-fs * 0.75} y=${fs * 0.28} font-size=${fs * 0.62} text-anchor="end">N</text>
        </g>
      </g>`}
      ${showSlots && shownSlots.map((s) => {
        const prod = slotMap.get(s.id);
        const clickable = Boolean(onSlotClick);
        const movable = editableSlots && Boolean(onSlotDrop);
        const interactive = clickable || movable;
        const sel = s.id === selectedSlotId;
        const bad = slotDrag && slotDrag.id === s.id && dragError;
        const name = s.category ? Engine.label(s.category) : 'Free space';
        const lab = s.kind === 'replace' ? `New ${name.toLowerCase()}` : `+ ${name}`;
        const fit = !compact && fitLabel(lab, s.w, s.d, fs * 0.66);
        const cx = s.x + s.w / 2, cy = s.y + s.d / 2;
        const act = clickable ? () => onSlotClick(s.id) : null;
        const keys = (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && act) { e.preventDefault(); act(); return; }
          if (movable && onSlotKey) onSlotKey(s.id, e);
        };
        const tip = movable ? `${name} spot, ${s.w} by ${s.d} centimetres. Drag or use arrow keys to move it${clickable ? ', Enter to shop for it' : ''}, R rotates.` : `${name} gap, ${s.w} by ${s.d} centimetres`;
        return html`<g key=${s.id} class=${`pl-slot ${clickable ? 'clickable' : ''} ${movable ? 'draggable' : ''} ${sel ? 'selected' : ''} ${bad ? 'invalid' : ''}`}
          role=${interactive ? 'button' : null} tabIndex=${interactive ? 0 : null}
          aria-label=${interactive ? tip : null} aria-pressed=${interactive ? String(sel) : null}
          onClick=${movable ? null : act} onPointerDown=${movable ? (e) => startSlotDrag(s, e) : null}
          onKeyDown=${interactive ? keys : null}>
          <rect class="zone" x=${s.x} y=${s.y} width=${s.w} height=${s.d} rx="2" />
          ${!prod && fit && html`<text x=${cx} y=${cy + fs * 0.22} font-size=${fs * 0.66} text-anchor="middle" transform=${fit.vertical ? `rotate(-90 ${cx} ${cy})` : null}>${fit.text}</text>`}
        </g>`;
      })}
      ${shownProducts.map((pr) => {
        const tr = backTransform(pr.rect, pr.back);
        return html`<g key=${`p-${pr.slot_id}`} class="pl-item product" pointer-events="none">
          <g transform=${tr.t}>${bodyShape(pr.category, tr.lw, tr.ld, COLOUR_HEX[pr.colour] || '#ddd')}${symbolParts(pr.category, tr.lw, tr.ld)}</g>
          ${!compact && html`<${PieceLabel} r=${pr.rect} name=${pr.title} fs=${fs * 0.92} />`}
        </g>`;
      })}
      ${shown.map((p) => {
        const back = backOf(p, er, shown);
        const tr = backTransform(p, back);
        const sel = p.ref_id === selectedId;
        const invalid = itemDrag && itemDrag.id === p.ref_id && dragError;
        const cls = `pl-item ${editable ? 'editable' : ''} ${sel ? 'selected' : ''} ${invalid ? 'invalid' : ''}`;
        return html`<g key=${p.ref_id} class=${cls}
          tabIndex=${editable ? 0 : null} role=${editable ? 'button' : null}
          aria-label=${editable ? `${p.name}, ${p.w} by ${p.d} centimetres${p.locked ? ', locked' : ''}. Arrow keys move it, R rotates, L locks.` : null}
          aria-pressed=${editable ? String(sel) : null}
          onPointerDown=${editable ? (e) => startDrag(p, e) : null}
          onKeyDown=${editable && onKey ? (e) => onKey(p.ref_id, e) : null}
          onFocus=${editable && onSelect ? () => onSelect(p.ref_id) : null}>
          <g transform=${tr.t}>${bodyShape(p.category, tr.lw, tr.ld)}${symbolParts(p.category, tr.lw, tr.ld)}</g>
          ${!compact && html`<${PieceLabel} r=${p} name=${p.name} sub=${`${p.w} × ${p.d}`} fs=${fs} />`}
          ${p.locked && html`<g transform=${`translate(${p.x + p.w - fs * 0.95} ${p.y + fs * 0.25})`}>
            <rect class="pl-lock" x=${fs * 0.1} y=${fs * 0.36} width=${fs * 0.6} height=${fs * 0.44} rx=${fs * 0.08} />
            <path d=${`M${fs * 0.2},${fs * 0.38}V${fs * 0.24}A${fs * 0.2},${fs * 0.2} 0 0 1 ${fs * 0.6},${fs * 0.24}V${fs * 0.38}`} fill="none" stroke="currentColor" class="pl-door" />
          </g>`}
        </g>`;
      })}
    </svg>
    ${(editable || editableSlots) && html`<p class=${`small ${dragError ? 'err' : 'faint'}`} aria-live="polite" style="min-height:1.5em;margin-top:6px">${drag && (drag.x !== drag.ox || drag.y !== drag.oy) ? dragError || 'Release to place it here.' : ''}</p>`}
  </div>`;
}

function SymbolIcon({ category, w, d, colour, size }) {
  const lw = w || 60, ld = d || 60;
  const pad = Math.max(lw, ld) * 0.08;
  return html`<svg class="sym" viewBox=${`${-pad} ${-pad} ${lw + 2 * pad} ${ld + 2 * pad}`} width=${size || 40} height=${size || 40} aria-hidden="true">
    <g class=${`pl-item ${colour ? 'product' : ''}`}>${bodyShape(category, lw, ld, colour ? COLOUR_HEX[colour] : null)}${symbolParts(category, lw, ld)}</g>
  </svg>`;
}

// A product's footprint drawn inside the gap it would fill, both to scale.
function FitPic({ product, slot, size }) {
  const f = slot && Engine.fitInSlot(product, slot);
  if (!slot || !f) return html`<${SymbolIcon} category=${product.category} w=${product.width_cm} d=${product.depth_cm} colour=${product.colour} size=${size || 80} />`;
  const alongIsX = slot.wall ? slot.wall === 'N' || slot.wall === 'S' : slot.w >= slot.d;
  const sw = alongIsX ? slot.w : slot.d, sd = alongIsX ? slot.d : slot.w;
  const pw = f.rotation === (alongIsX ? 0 : 90) ? product.width_cm : product.depth_cm;
  const pd = f.rotation === (alongIsX ? 0 : 90) ? product.depth_cm : product.width_cm;
  const pad = Math.max(sw, sd) * 0.1;
  return html`<svg viewBox=${`${-pad} ${-pad} ${sw + 2 * pad} ${sd + 2 * pad}`} width=${size || 80} height=${size || 80} aria-hidden="true">
    <rect x="0" y="0" width=${sw} height=${sd} rx="1.5" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
    <g class="pl-item product"><g transform=${`translate(${(sw - pw) / 2} 0)`}>${bodyShape(product.category, pw, pd, COLOUR_HEX[product.colour])}${symbolParts(product.category, pw, pd)}</g></g>
    <line x1=${-pad * 0.6} y1="0" x2=${sw + pad * 0.6} y2="0" stroke="var(--wall)" stroke-width="3" vector-effect="non-scaling-stroke" />
  </svg>`;
}
