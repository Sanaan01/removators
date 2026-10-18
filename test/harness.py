# Shared headless-browser setup: serves the CDN scripts from node_modules and collects page errors.
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'dist' / 'removaters.html').as_uri()
NM = ROOT / 'node_modules'
FILES = {
    'htm@3.1.1/preact/standalone.umd.js': NM / 'htm' / 'preact' / 'standalone.umd.js',
    'three@0.147.0/build/three.min.js': NM / 'three' / 'build' / 'three.min.js',
    'three@0.147.0/examples/js/controls/OrbitControls.js': NM / 'three' / 'examples' / 'js' / 'controls' / 'OrbitControls.js',
}


def serve_cdn(route):
    url = route.request.url
    for key, path in FILES.items():
        if url.endswith(key):
            return route.fulfill(status=200, content_type='application/javascript', body=path.read_text())
    return route.fulfill(status=404, body='')


def wire(page, errors):
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'net::' not in m.text and 'fonts.g' not in m.text else None)
    page.route('https://cdn.jsdelivr.net/**', serve_cdn)
    page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    page.route('https://fonts.gstatic.com/**', lambda r: r.fulfill(status=404, body=''))


def launch(p):
    return p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
