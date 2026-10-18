// Bundles the sources into one self-contained HTML page for publishing.
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const strip = (code) => code.replace(/\nif \(typeof module !== 'undefined' && module\.exports\) module\.exports = \w+;\n?/, '\n');

const MODULES = ['engine.js', 'catalog.js', 'plan.js', 'room3d.js', 'art3d.js', 'data.js', 'app.js'].filter((f) => fs.existsSync(path.join(__dirname, 'src', f)));
const js = MODULES.map((f) => `/* ${f} */\n${strip(src(f))}`).join('\n');
const html = `<title>Removaters</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Design your room around the furniture you already own, then fill the gaps with pieces that fit.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&display=swap">
<style>
${src('styles.css')}
</style>
<div id="app"><p style="padding:24px;font-family:system-ui,sans-serif">Loading Removaters…</p></div>
<noscript><p style="padding:24px">Removaters needs JavaScript to run.</p></noscript>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.umd.js"></script>
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'removaters.html'), html);
console.log(`dist/removaters.html ${(html.length / 1024).toFixed(1)} KB, modules: ${MODULES.join(', ')}`);
