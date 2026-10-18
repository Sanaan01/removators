// Splits the live artifact page back into source files.
const fs = require('fs');
const path = require('path');
const live = fs.readFileSync(process.argv[2], 'utf8');
const body = live.slice(live.indexOf('<body>') + '<body>'.length + 1, live.lastIndexOf('</body></html>'));
fs.writeFileSync('live-content.html', body);
const cssStart = body.indexOf('<style>\n') + '<style>\n'.length;
const cssEnd = body.indexOf('\n</style>', cssStart);
fs.writeFileSync('src/styles.css', body.slice(cssStart, cssEnd));
const jsStart = body.indexOf('<script>\n') + '<script>\n'.length;
const jsEnd = body.lastIndexOf('\n</script>');
const js = body.slice(jsStart, jsEnd);
const marks = [...js.matchAll(/^\/\* ([a-z0-9]+\.js) \*\/$/gm)];
marks.forEach((m, i) => {
  const start = m.index + m[0].length + 1;
  const end = i + 1 < marks.length ? marks[i + 1].index : js.length;
  let code = js.slice(start, end);
  if (code.endsWith('\n')) code = code.slice(0, -1);
  fs.writeFileSync(path.join('src', m[1]), code);
  console.log(m[1], code.length);
});
