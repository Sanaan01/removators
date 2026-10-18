/* Demo catalogue: synthetic stores and products for the hackathon demo.
   Every store and product is made up. Sizes are fixed (no custom or made-to-measure sizes).
   Prices are integer cents (AUD). Options change colour, fabric or finish and price only. */
const Catalog = (() => {
  const STORES = [
    { id: 'demo-homeward', business_name: 'Homeward Warehouse (demo)', suburb: 'Auburn', size: 'large', badges: [] },
    { id: 'demo-furnish', business_name: 'Furnish Depot (demo)', suburb: 'Rhodes', size: 'large', badges: [] },
    { id: 'demo-banksia', business_name: 'Banksia Joinery (demo)', suburb: 'Marsfield', size: 'small', badges: ['Locally made', 'Family-run'] },
    { id: 'demo-darbayt', business_name: 'Dar Al Bayt Interiors (demo)', suburb: 'Lakemba', size: 'small', badges: ['Migrant-owned', 'Family-run'] },
    { id: 'demo-ironbark', business_name: 'Ironbark & Oak (demo)', suburb: 'Hornsby', size: 'small', badges: ['Locally made', 'Eco materials'] },
    { id: 'demo-saltbush', business_name: 'Saltbush Studio (demo)', suburb: 'Redfern', size: 'small', badges: ['Indigenous-owned', 'Women-owned'] },
    { id: 'demo-lotus', business_name: 'Lotus Lane Home (demo)', suburb: 'Cabramatta', size: 'small', badges: ['Migrant-owned'] },
    { id: 'demo-rattan', business_name: 'Rattan & Reed (demo)', suburb: 'Marrickville', size: 'small', badges: ['Women-owned', 'Eco materials'] },
  ];

  const OPTION_SETS = {
    oak: [['Natural oak', 'finish', 0], ['Smoked oak', 'finish', 12000]],
    look: [['Oak look', 'finish', 0], ['White', 'finish', 0], ['Walnut look', 'finish', 1000]],
    fabric3: [['Linen sand', 'fabric', 0], ['Boucle ivory', 'fabric', 15000], ['Velvet forest', 'fabric', 20000]],
    fabric2: [['Grey weave', 'fabric', 0], ['Navy weave', 'fabric', 0]],
    bw: [['Black', 'colour', 0], ['White', 'colour', 0]],
    shade: [['Linen shade', 'colour', 0], ['Charcoal shade', 'colour', 1000]],
    lacquer: [['Black lacquer', 'finish', 0], ['Red lacquer', 'finish', 4000]],
    cane: [['Natural cane', 'finish', 0], ['Whitewashed cane', 'finish', 3000]],
    kilim: [['Kilim red', 'fabric', 0], ['Kilim indigo', 'fabric', 2500]],
  };

  // id, store, category, title, width, depth, height, price $, styles, cultural, colour, material, renterFriendly, rating, ratingCount, options
  const ROWS = [
    // Beds (frame sizes, slightly larger than the mattress)
    ['bed-01', 'demo-homeward', 'bed', 'Steel Frame Queen Bed', 158, 208, 95, 299, ['Industrial', 'Minimal'], [], 'black', 'metal', true, 4.1, 126, null],
    ['bed-02', 'demo-furnish', 'bed', 'Upholstered Linen Queen Bed', 160, 212, 110, 549, ['Minimal', 'Scandi'], [], 'beige', 'fabric', true, 4.3, 88, 'fabric2'],
    ['bed-03', 'demo-banksia', 'bed', 'Slatted Oak Queen Bed', 158, 208, 90, 1190, ['Japandi', 'Scandi'], [], 'natural wood', 'solid wood', true, 4.8, 34, 'oak'],
    ['bed-04', 'demo-ironbark', 'bed', 'Low Platform Bed in Ash', 152, 205, 30, 890, ['Japandi', 'Minimal'], ['East Asian'], 'natural wood', 'solid wood', true, 4.7, 21, null],
    ['bed-05', 'demo-darbayt', 'bed', 'Carved Mango Wood Double Bed', 145, 200, 120, 980, ['Boho'], ['South Asian', 'Middle Eastern'], 'dark wood', 'solid wood', true, 4.6, 19, null],
    ['bed-06', 'demo-rattan', 'bed', 'Arched Rattan King Single Bed', 112, 208, 115, 640, ['Coastal', 'Boho'], ['Mediterranean'], 'natural wood', 'rattan', true, 4.5, 27, 'cane'],
    ['bed-07', 'demo-homeward', 'bed', 'Single Bed with Storage', 97, 193, 85, 249, ['Minimal'], [], 'white', 'engineered wood', true, 3.9, 210, null],
    // Wardrobes
    ['war-01', 'demo-homeward', 'wardrobe', 'Two-Door Wardrobe', 80, 52, 180, 199, ['Minimal'], [], 'white', 'engineered wood', true, 3.8, 164, null],
    ['war-02', 'demo-furnish', 'wardrobe', 'Sliding Door Wardrobe 150', 150, 60, 200, 649, ['Minimal', 'Scandi'], [], 'grey', 'engineered wood', true, 4.2, 73, 'look'],
    ['war-03', 'demo-banksia', 'wardrobe', 'Oak Shaker Wardrobe', 100, 58, 190, 890, ['Scandi'], [], 'natural wood', 'solid wood', true, 4.7, 22, 'oak'],
    ['war-04', 'demo-lotus', 'wardrobe', 'Lacquer Panel Wardrobe', 90, 55, 185, 520, ['Minimal', 'Japandi'], ['East Asian'], 'black', 'engineered wood', true, 4.4, 16, 'lacquer'],
    ['war-05', 'demo-ironbark', 'wardrobe', 'Recycled Timber Wardrobe', 120, 60, 195, 1050, ['Industrial', 'Japandi'], [], 'dark wood', 'solid wood', true, 4.6, 14, null],
    ['war-06', 'demo-furnish', 'wardrobe', 'Open Clothes Rack with Shelf', 100, 45, 175, 159, ['Industrial', 'Minimal'], [], 'black', 'metal', true, 4.0, 95, null],
    ['war-07', 'demo-darbayt', 'wardrobe', 'Arabesque Screen Wardrobe', 100, 58, 190, 760, ['Boho'], ['Middle Eastern'], 'white', 'solid wood', true, 4.5, 12, null],
    // Desks
    ['dsk-01', 'demo-homeward', 'desk', 'Compact Study Desk', 100, 50, 75, 89, ['Minimal'], [], 'white', 'engineered wood', true, 4.0, 240, null],
    ['dsk-02', 'demo-furnish', 'desk', 'Desk with Drawers 120', 120, 60, 76, 229, ['Scandi'], [], 'natural wood', 'engineered wood', true, 4.1, 132, 'look'],
    ['dsk-03', 'demo-banksia', 'desk', 'Solid Oak Writing Desk', 110, 55, 75, 549, ['Japandi', 'Scandi'], [], 'natural wood', 'solid wood', true, 4.8, 29, 'oak'],
    ['dsk-04', 'demo-ironbark', 'desk', 'Ironbark Trestle Desk', 140, 70, 75, 690, ['Industrial'], [], 'dark wood', 'solid wood', true, 4.6, 18, null],
    ['dsk-05', 'demo-furnish', 'desk', 'Floating Wall Desk', 100, 40, 20, 129, ['Minimal'], [], 'white', 'engineered wood', false, 3.9, 61, null],
    ['dsk-06', 'demo-lotus', 'desk', 'Bamboo Study Desk', 90, 45, 75, 149, ['Japandi', 'Minimal'], ['East Asian'], 'natural wood', 'solid wood', true, 4.3, 37, null],
    ['dsk-07', 'demo-rattan', 'desk', 'Rattan Edge Desk', 110, 50, 76, 389, ['Coastal', 'Boho'], [], 'natural wood', 'rattan', true, 4.4, 15, null],
    // Chairs
    ['chr-01', 'demo-homeward', 'chair', 'Stackable Task Chair', 48, 50, 80, 45, ['Minimal'], [], 'black', 'metal', true, 3.8, 310, 'bw'],
    ['chr-02', 'demo-furnish', 'chair', 'Ergonomic Mesh Chair', 60, 58, 110, 189, ['Minimal'], [], 'grey', 'fabric', true, 4.2, 205, null],
    ['chr-03', 'demo-banksia', 'chair', 'Bentwood Oak Chair', 50, 52, 80, 289, ['Scandi', 'Mid-century'], [], 'natural wood', 'solid wood', true, 4.7, 26, 'oak'],
    ['chr-04', 'demo-saltbush', 'chair', 'Woven Seat Stool Chair', 45, 48, 78, 169, ['Boho', 'Japandi'], [], 'natural wood', 'solid wood', true, 4.6, 11, null],
    ['chr-05', 'demo-darbayt', 'chair', 'Brass Cafe Chair', 50, 52, 82, 139, ['Mid-century'], ['Middle Eastern'], 'green', 'metal', true, 4.3, 17, null],
    ['chr-06', 'demo-lotus', 'chair', 'Low Back Bamboo Chair', 55, 55, 78, 99, ['Japandi'], ['East Asian'], 'natural wood', 'solid wood', true, 4.4, 22, null],
    ['chr-07', 'demo-rattan', 'chair', 'Rattan Dining Chair', 52, 55, 82, 159, ['Coastal', 'Boho'], ['Latin American'], 'natural wood', 'rattan', true, 4.5, 31, 'cane'],
    // Bedside tables
    ['bst-01', 'demo-homeward', 'bedside-table', 'Two-Drawer Bedside', 40, 35, 50, 39, ['Minimal'], [], 'white', 'engineered wood', true, 3.9, 260, null],
    ['bst-02', 'demo-furnish', 'bedside-table', 'Fluted Bedside Table', 45, 40, 55, 119, ['Mid-century'], [], 'natural wood', 'engineered wood', true, 4.2, 77, 'look'],
    ['bst-03', 'demo-banksia', 'bedside-table', 'Oak Bedside with Shelf', 45, 38, 55, 229, ['Scandi', 'Japandi'], [], 'natural wood', 'solid wood', true, 4.8, 19, 'oak'],
    ['bst-04', 'demo-saltbush', 'bedside-table', 'Ochre Round Side Table', 40, 40, 50, 149, ['Minimal', 'Boho'], [], 'terracotta', 'solid wood', true, 4.6, 9, null],
    ['bst-05', 'demo-lotus', 'bedside-table', 'Lacquered Bedside Cabinet', 50, 40, 52, 129, ['Japandi'], ['East Asian'], 'black', 'engineered wood', true, 4.3, 14, 'lacquer'],
    ['bst-06', 'demo-darbayt', 'bedside-table', 'Inlaid Bedside Table', 45, 35, 55, 189, ['Boho'], ['Middle Eastern'], 'white', 'solid wood', true, 4.5, 10, null],
    ['bst-07', 'demo-rattan', 'bedside-table', 'Rattan Basket Bedside', 38, 30, 50, 89, ['Coastal', 'Boho'], [], 'natural wood', 'rattan', true, 4.4, 23, null],
    // Bookcases
    ['bkc-01', 'demo-homeward', 'bookcase', 'Cube Bookcase 2 x 3', 70, 30, 110, 59, ['Minimal'], [], 'white', 'engineered wood', true, 4.0, 280, null],
    ['bkc-02', 'demo-furnish', 'bookcase', 'Ladder Bookshelf', 60, 35, 180, 119, ['Scandi', 'Industrial'], [], 'black', 'metal', true, 4.1, 91, null],
    ['bkc-03', 'demo-banksia', 'bookcase', 'Oak Bookcase 80', 80, 30, 180, 420, ['Scandi'], [], 'natural wood', 'solid wood', true, 4.7, 24, 'oak'],
    ['bkc-04', 'demo-ironbark', 'bookcase', 'Recycled Timber Shelving 120', 120, 35, 160, 560, ['Industrial'], [], 'dark wood', 'solid wood', true, 4.6, 13, null],
    ['bkc-05', 'demo-furnish', 'bookcase', 'Wall-Mounted Shelf Unit', 80, 22, 100, 89, ['Minimal'], [], 'white', 'engineered wood', false, 3.8, 54, null],
    ['bkc-06', 'demo-lotus', 'bookcase', 'Narrow Bamboo Bookcase', 50, 25, 160, 79, ['Japandi'], ['East Asian'], 'natural wood', 'solid wood', true, 4.3, 29, null],
    ['bkc-07', 'demo-saltbush', 'bookcase', 'Painted Ochre Shelf', 90, 30, 120, 280, ['Boho', 'Minimal'], [], 'terracotta', 'solid wood', true, 4.5, 8, null],
    // Dressers
    ['drs-01', 'demo-homeward', 'dresser', 'Six-Drawer Dresser', 120, 45, 80, 179, ['Minimal'], [], 'white', 'engineered wood', true, 3.9, 150, null],
    ['drs-02', 'demo-furnish', 'dresser', 'Mid-Century Dresser', 140, 48, 78, 449, ['Mid-century'], [], 'natural wood', 'engineered wood', true, 4.3, 66, 'look'],
    ['drs-03', 'demo-banksia', 'dresser', 'Oak Chest of Drawers', 80, 45, 100, 690, ['Scandi', 'Japandi'], [], 'natural wood', 'solid wood', true, 4.8, 15, 'oak'],
    ['drs-04', 'demo-darbayt', 'dresser', 'Brass Handle Dresser', 100, 45, 82, 540, ['Boho'], ['Middle Eastern', 'South Asian'], 'dark wood', 'solid wood', true, 4.5, 11, null],
    ['drs-05', 'demo-rattan', 'dresser', 'Cane Front Dresser', 100, 45, 80, 620, ['Coastal', 'Boho'], ['Mediterranean'], 'white', 'rattan', true, 4.6, 13, 'cane'],
    ['drs-06', 'demo-lotus', 'dresser', 'Low Tansu Chest', 90, 40, 70, 480, ['Japandi'], ['East Asian'], 'dark wood', 'solid wood', true, 4.5, 9, null],
    // Floor lamps
    ['lmp-01', 'demo-homeward', 'floor-lamp', 'Stick Floor Lamp', 30, 30, 150, 39, ['Minimal'], [], 'black', 'metal', true, 3.9, 330, null],
    ['lmp-02', 'demo-furnish', 'floor-lamp', 'Tripod Floor Lamp', 45, 45, 155, 99, ['Mid-century', 'Scandi'], [], 'natural wood', 'solid wood', true, 4.2, 120, 'shade'],
    ['lmp-03', 'demo-rattan', 'floor-lamp', 'Woven Bolga Shade Lamp', 40, 40, 150, 189, ['Boho', 'Coastal'], ['African'], 'natural wood', 'rattan', true, 4.6, 16, null],
    ['lmp-04', 'demo-darbayt', 'floor-lamp', 'Pierced Metal Lantern Lamp', 35, 35, 140, 229, ['Boho'], ['Middle Eastern'], 'black', 'metal', true, 4.5, 12, null],
    ['lmp-05', 'demo-lotus', 'floor-lamp', 'Paper Lantern Floor Lamp', 40, 40, 130, 79, ['Japandi'], ['East Asian'], 'white', 'fabric', true, 4.4, 25, null],
    ['lmp-06', 'demo-banksia', 'floor-lamp', 'Oak Arc Lamp', 50, 50, 180, 249, ['Scandi'], [], 'natural wood', 'solid wood', true, 4.7, 10, 'shade'],
    // Sofas
    ['sfa-01', 'demo-homeward', 'sofa', 'Two-Seat Sofa', 160, 85, 80, 499, ['Minimal'], [], 'grey', 'fabric', true, 3.9, 140, 'fabric2'],
    ['sfa-02', 'demo-furnish', 'sofa', 'Three-Seat Linen Sofa', 210, 90, 82, 1099, ['Scandi', 'Minimal'], [], 'beige', 'fabric', true, 4.3, 85, 'fabric3'],
    ['sfa-03', 'demo-furnish', 'sofa', 'Modular Sofa 240', 240, 95, 80, 1690, ['Minimal'], [], 'grey', 'fabric', true, 4.4, 49, 'fabric2'],
    ['sfa-04', 'demo-rattan', 'sofa', 'Rattan Frame Sofa', 200, 85, 80, 1450, ['Coastal', 'Boho'], ['Mediterranean'], 'natural wood', 'rattan', true, 4.6, 14, 'cane'],
    ['sfa-05', 'demo-darbayt', 'sofa', 'Majlis Low Sofa', 220, 90, 70, 1290, ['Boho'], ['Middle Eastern'], 'blue', 'fabric', true, 4.7, 12, 'kilim'],
    ['sfa-06', 'demo-ironbark', 'sofa', 'Leather Club Sofa', 190, 90, 78, 1890, ['Mid-century', 'Industrial'], [], 'black', 'leather', true, 4.5, 17, null],
    ['sfa-07', 'demo-saltbush', 'sofa', 'Ochre Boucle Loveseat', 150, 80, 78, 990, ['Boho', 'Minimal'], [], 'terracotta', 'fabric', true, 4.6, 9, null],
    // Armchairs
    ['arm-01', 'demo-homeward', 'armchair', 'Accent Armchair', 70, 75, 78, 149, ['Minimal'], [], 'grey', 'fabric', true, 3.9, 175, null],
    ['arm-02', 'demo-furnish', 'armchair', 'Mid-Century Lounge Chair', 75, 80, 80, 399, ['Mid-century'], [], 'green', 'fabric', true, 4.3, 64, 'fabric3'],
    ['arm-03', 'demo-rattan', 'armchair', 'Peacock Rattan Chair', 85, 80, 120, 560, ['Boho', 'Coastal'], ['Latin American'], 'natural wood', 'rattan', true, 4.5, 18, null],
    ['arm-04', 'demo-banksia', 'armchair', 'Oak Frame Armchair', 75, 82, 76, 690, ['Scandi', 'Japandi'], [], 'natural wood', 'solid wood', true, 4.8, 11, 'fabric2'],
    ['arm-05', 'demo-lotus', 'armchair', 'Floor Cushion Chair', 65, 70, 60, 129, ['Japandi'], ['East Asian'], 'beige', 'fabric', true, 4.2, 20, null],
    ['arm-06', 'demo-darbayt', 'armchair', 'Kilim Upholstered Armchair', 75, 78, 82, 480, ['Boho'], ['Middle Eastern', 'South Asian'], 'terracotta', 'fabric', true, 4.6, 13, 'kilim'],
    // Coffee tables
    ['cof-01', 'demo-homeward', 'coffee-table', 'Rectangle Coffee Table', 100, 50, 45, 79, ['Minimal'], [], 'white', 'engineered wood', true, 3.9, 200, null],
    ['cof-02', 'demo-furnish', 'coffee-table', 'Glass Top Coffee Table', 110, 60, 42, 229, ['Mid-century'], [], 'black', 'glass', true, 4.1, 71, null],
    ['cof-03', 'demo-banksia', 'coffee-table', 'Oak Coffee Table', 110, 55, 40, 590, ['Scandi', 'Japandi'], [], 'natural wood', 'solid wood', true, 4.8, 14, 'oak'],
    ['cof-04', 'demo-darbayt', 'coffee-table', 'Brass Tray Table', 60, 60, 45, 199, ['Boho'], ['Middle Eastern'], 'black', 'metal', true, 4.5, 15, null],
    ['cof-05', 'demo-saltbush', 'coffee-table', 'Saltbush Slab Coffee Table', 100, 50, 40, 450, ['Minimal'], [], 'dark wood', 'solid wood', true, 4.6, 8, null],
    ['cof-06', 'demo-rattan', 'coffee-table', 'Rattan Drum Coffee Table', 80, 80, 42, 280, ['Coastal', 'Boho'], ['African'], 'natural wood', 'rattan', true, 4.4, 19, null],
    ['cof-07', 'demo-lotus', 'coffee-table', 'Low Chabudai Table', 90, 60, 32, 189, ['Japandi'], ['East Asian'], 'natural wood', 'solid wood', true, 4.5, 12, null],
    // TV units
    ['tvu-01', 'demo-homeward', 'tv-unit', 'TV Bench 120', 120, 40, 45, 119, ['Minimal'], [], 'white', 'engineered wood', true, 3.9, 190, null],
    ['tvu-02', 'demo-furnish', 'tv-unit', 'Slatted TV Unit 160', 160, 40, 50, 349, ['Scandi', 'Mid-century'], [], 'natural wood', 'engineered wood', true, 4.2, 58, 'look'],
    ['tvu-03', 'demo-furnish', 'tv-unit', 'Floating TV Panel', 150, 30, 40, 189, ['Minimal'], [], 'black', 'engineered wood', false, 3.9, 40, null],
    ['tvu-04', 'demo-ironbark', 'tv-unit', 'Recycled Timber TV Unit', 180, 45, 50, 790, ['Industrial'], [], 'dark wood', 'solid wood', true, 4.6, 12, null],
    ['tvu-05', 'demo-rattan', 'tv-unit', 'Cane Door TV Cabinet', 150, 40, 55, 560, ['Coastal', 'Boho'], ['Mediterranean'], 'white', 'rattan', true, 4.5, 10, 'cane'],
    ['tvu-06', 'demo-darbayt', 'tv-unit', 'Carved Media Cabinet', 140, 42, 60, 690, ['Boho'], ['South Asian'], 'dark wood', 'solid wood', true, 4.6, 9, null],
  ];

  const PRODUCTS = ROWS.map(([id, seller_id, category, title, w, d, h, price, styles, cultural, colour, material, renter, rating, count, opt]) => ({
    id, seller_id, category, title, width_cm: w, depth_cm: d, height_cm: h, base_price_cents: price * 100,
    style_tags: styles, cultural_tags: cultural, colour, material, renter_friendly: renter,
    rating_avg: rating, rating_count: count, is_featured: false, is_demo: true,
    options: (OPTION_SETS[opt] || []).map(([name, type, delta], i) => ({ id: `${id}-o${i + 1}`, name, type, price_delta_cents: delta })),
  }));

  const STYLES = ['Scandi', 'Japandi', 'Industrial', 'Mid-century', 'Coastal', 'Boho', 'Minimal'];
  const CULTURAL = ['Middle Eastern', 'South Asian', 'East Asian', 'African', 'Mediterranean', 'Latin American'];
  const COLOURS = ['white', 'black', 'natural wood', 'dark wood', 'grey', 'beige', 'green', 'blue', 'terracotta'];
  const MATERIALS = ['solid wood', 'engineered wood', 'metal', 'rattan', 'fabric', 'leather', 'glass'];
  const BADGES = ['Locally made', 'Indigenous-owned', 'Women-owned', 'Family-run', 'Migrant-owned', 'Eco materials'];

  // The shop "Try as seller" creates: sized to drop into the sample bedroom's gaps.
  const DEMO_SELLER = {
    business_name: 'Wattle & Grain (demo)', suburb: 'Marrickville', size: 'small', badges: ['Locally made', 'Family-run'],
    website: 'https://example.com', about: 'Made-up demo shop: hand-made timber furniture from a Marrickville workshop.',
    products: [
      { title: 'Spotted Gum Desk', category: 'desk', width_cm: 110, depth_cm: 55, height_cm: 75, base_price_cents: 18900, style_tags: ['Japandi', 'Minimal'], cultural_tags: [], colour: 'natural wood', material: 'solid wood', renter_friendly: true, options: [{ name: 'Oiled', type: 'finish', price_delta_cents: 0 }, { name: 'Black stain', type: 'finish', price_delta_cents: 3000 }] , demo_history: { units: 18, reviews: [{ rating: 5, comment: "Solid and steady, no wobble at all when I type. The oiled spotted gum looks even better in person.", at: '2026-09-04T10:00:00.000Z' }, { rating: 5, comment: "Fit our 300 cm wide bedroom with room for the wardrobe door to open. Exactly as measured.", at: '2026-09-19T10:00:00.000Z' }, { rating: 4, comment: "Beautiful timber but it's heavy. Took two of us to carry it up the stairs.", at: '2026-09-27T10:00:00.000Z' }, { rating: 4, comment: "Sturdy desk. The black stain option was worth the extra.", at: '2026-10-08T10:00:00.000Z' }] } },
      { title: 'Slim Hoop Pine Bookcase', category: 'bookcase', width_cm: 70, depth_cm: 28, height_cm: 160, base_price_cents: 14500, style_tags: ['Scandi', 'Japandi'], cultural_tags: [], colour: 'natural wood', material: 'solid wood', renter_friendly: true, options: [] , demo_history: { units: 31, reviews: [{ rating: 4, comment: "Exactly 70 cm wide so it slid in beside the wardrobe. Easy to assemble in about 20 minutes.", at: '2026-08-30T10:00:00.000Z' }, { rating: 3, comment: "Shelves bow a little under heavy textbooks. Fine for paperbacks.", at: '2026-09-11T10:00:00.000Z' }, { rating: 4, comment: "Good value for solid pine and it looks great in a Japandi room.", at: '2026-09-22T10:00:00.000Z' }, { rating: 2, comment: "Arrived with a scratch on the side. The maker sent touch-up oil quickly, but it should have been packed better.", at: '2026-10-03T10:00:00.000Z' }, { rating: 3, comment: "Nice and slim, but a bit wobbly on carpet until I added felt pads.", at: '2026-10-12T10:00:00.000Z' }] } },
      { title: 'Turned Leg Bedside', category: 'bedside-table', width_cm: 40, depth_cm: 35, height_cm: 52, base_price_cents: 11900, style_tags: ['Scandi'], cultural_tags: [], colour: 'natural wood', material: 'solid wood', renter_friendly: true, options: [] , demo_history: { units: 9, reviews: [{ rating: 5, comment: "Lovely turned legs and really well made. Feels like an heirloom piece.", at: '2026-09-08T10:00:00.000Z' }, { rating: 5, comment: "Perfect height next to our queen bed, and the drawer runs smoothly.", at: '2026-09-25T10:00:00.000Z' }, { rating: 4, comment: "Gorgeous finish. Slightly smaller than I pictured, so check the size.", at: '2026-10-10T10:00:00.000Z' }] } },
      { title: 'Linen Drum Floor Lamp', category: 'floor-lamp', width_cm: 35, depth_cm: 35, height_cm: 145, base_price_cents: 9900, style_tags: ['Japandi', 'Minimal'], cultural_tags: [], colour: 'beige', material: 'fabric', renter_friendly: true, options: [] , demo_history: { units: 4, reviews: [{ rating: 3, comment: "Soft, warm light for reading, but the shade arrived creased.", at: '2026-09-15T10:00:00.000Z' }, { rating: 2, comment: "The cord is shorter than I expected and it wobbles on the rug.", at: '2026-09-29T10:00:00.000Z' }, { rating: 3, comment: "Looks nice, though the base feels a bit light for the height.", at: '2026-10-09T10:00:00.000Z' }] } },
      { title: 'Woven Cord Desk Chair', category: 'chair', width_cm: 50, depth_cm: 50, height_cm: 80, base_price_cents: 16500, style_tags: ['Japandi', 'Scandi'], cultural_tags: [], colour: 'natural wood', material: 'solid wood', renter_friendly: true, options: [] , demo_history: { units: 12, reviews: [{ rating: 5, comment: "Comfortable for long study sessions. The cord seat is firm but supportive.", at: '2026-09-02T10:00:00.000Z' }, { rating: 4, comment: "Looks great with the spotted gum desk. A cushion helps after a few hours.", at: '2026-09-21T10:00:00.000Z' }, { rating: 3, comment: "Seat height is a bit low for a standard 75 cm desk.", at: '2026-10-05T10:00:00.000Z' }] } },
    ],
  };

  return { STORES, PRODUCTS, STYLES, CULTURAL, COLOURS, MATERIALS, BADGES, DEMO_SELLER };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Catalog;
