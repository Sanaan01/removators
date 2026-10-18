# Removaters

Room planner for the Sym AI Open 2026 hackathon: design a room around the furniture you already own,
fill the gaps with pieces that fit from big stores and small local makers, and check out with every
store in one go. Sellers list products (by hand, from a product page, or as a CSV) and see what sells
and what reviews say.

## Layout
- `src/engine.js` - rule-based layout engine (no AI): 3 layouts, backup design sets for Regenerate, movable spots, validation
- `src/catalog.js` - synthetic demo stores and products, plus the demo seller shop and its labelled demo history
- `src/plan.js` - 2D floor plan (SVG), drag to move pieces and suggested spots
- `src/room3d.js` - 3D room view (three.js, loaded on demand)
- `src/art3d.js` - 3D product pictures and the turntable preview
- `src/data.js` - storage (Claude artifact database when available, else browser storage), orders and sales tallies
- `src/app.js` - screens and flows: scan, layouts, shop, compare, checkout, seller tools and insights
- `src/styles.css` - styles

## Where Claude is used (all optional)
- Scan: reads a room photo or floor plan into sizes, door, windows and furniture (`sample` with images)
- From your product page: turns pasted page text into a listing draft (rule-based fallback without Claude)
- Insights: summarises a product's reviews (theme chips work without Claude)
Every Claude result is shown for the person to check before anything is saved.

## Build and test
```
npm install htm@3.1.1 preact@10.19.3 three@0.147.0
node build.cjs                 # writes dist/removaters.html
node --test test/*.test.cjs    # engine and catalogue tests
python3 test/smoke.py          # headless click-through, desktop and phone, with and without a mock Claude
```
`dist/removaters.html` is the whole app in one file. It runs on any static host; without the Claude
artifact runtime it saves to the browser only and the Claude features hide or fall back.
