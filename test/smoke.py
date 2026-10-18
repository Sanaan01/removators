# End-to-end click-through of every flow, desktop and phone width, with and without Claude in the page.
# Run: python3 test/smoke.py   (needs playwright, and node_modules with htm + three for the CDN stand-ins)
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *

OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
MOCK = """
window.__aiCalls = [];
const reply = (input) => {
  const t = String(input);
  if (t.includes('furniture-layout app')) return {"room_type":"bedroom","width_cm":320,"length_cm":360,"door":{"wall":"S","offset_cm":40,"width_cm":82},"windows":[{"wall":"E","offset_cm":100,"width_cm":120}],"furniture":[{"name":"Queen bed","category":"bed","width_cm":153,"depth_cm":203},{"name":"Wardrobe","category":"wardrobe","width_cm":100,"depth_cm":55}],"source":"plan","confidence":"high","notes":"Read from the printed sizes."};
  if (t.includes('room-planning marketplace')) return {"title":"Leaning Ladder Bookcase","category":"bookcase","width_cm":60,"depth_cm":32,"height_cm":175,"price_aud":229,"colour":"natural wood","material":"solid wood","styles":["Scandi"],"renter_friendly":true,"options":[]};
  return {};
};
const mock = async (input, opts) => { window.__aiCalls.push('text'); const text = 'Shoppers like the size; some mention wobble. Add felt pads.'; if (opts && opts.onText) opts.onText({ text, delta: text }); return { text, truncated: false }; };
mock.json = async (input, opts) => { window.__aiCalls.push(opts && opts.images ? 'json+image' : 'json'); await new Promise((r) => setTimeout(r, 300)); return reply(input); };
mock.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 10000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });
window.claude = { use: async (name) => (name === 'sample' ? mock : null) };
"""

results, errors = [], []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))


def no_overflow(page, where, width):
    width = int(str(width).split('+')[0])
    sw = page.evaluate('document.documentElement.scrollWidth')
    check(f'{width}px no sideways scroll: {where}', sw <= width, f'scrollWidth {sw}')


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f'{name}.png'), full_page=True)


def shopper(page, w):
    page.goto(PAGE)
    page.click('[aria-label="Removaters home"]')
    page.wait_for_selector('.hero')
    check(f'{w} landing shows 4 steps', page.locator('.step3').count() == 4)
    no_overflow(page, 'landing', w)
    page.click('text=Try as shopper')
    page.wait_for_selector('text=Use this layout')
    check(f'{w} three layouts', page.locator('.layout-card').count() == 3)
    before = page.locator('.layout-card').first.inner_text()
    regen = page.locator('button:has-text("Regenerate")')
    if regen.count():
        regen.first.click(); page.wait_for_timeout(400)
        check(f'{w} regenerate gives a new set', page.locator('text=/Set 2 of/').count() > 0 and page.locator('.layout-card').first.inner_text() != before)
    no_overflow(page, 'layouts', w)
    page.locator('.layout-card button.btn.primary').first.click()
    page.wait_for_selector('text=Next: complete this room')
    check(f'{w} editor spots are draggable', page.locator('.pl-slot.draggable').count() > 0)
    page.click('text=Next: complete this room')
    page.wait_for_selector('.product')
    page.wait_for_timeout(1500)
    check(f'{w} product pictures drawn', page.locator('.product img.art').count() > 0, f"{page.locator('.product img.art').count()} pictures")
    no_overflow(page, 'shop', w)
    page.locator('.product button:has-text("View in 3D")').first.click()
    page.wait_for_selector('.product3d canvas', timeout=15000)
    check(f'{w} 3D product viewer', page.locator('.product3d canvas').count() == 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if page.locator('.dialog').count():
        page.locator('.dialog button:has-text("Close")').first.click()
    page.locator('.product button:has-text("Compare")').first.click()
    page.wait_for_selector('.compare-item')
    check(f'{w} compare shows pictures', page.locator('.compare-item img.art, .compare-item .art').count() > 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if page.locator('.dialog').count():
        page.locator('.dialog .dialog-x, .dialog button[aria-label="Close"]').first.click()
    for i in range(2):
        page.wait_for_selector('.product button:has-text("Add to room")')
        page.locator('.product button:has-text("Add to room")').first.click(); page.wait_for_timeout(300)
    page.click('button:has-text("Go to checkout")')
    page.wait_for_selector('.checkout')
    check(f'{w} checkout groups by store', page.locator('.store-order').count() >= 1)
    no_overflow(page, 'checkout', w)
    shot(page, f'{w}-checkout')
    if page.locator('#suburb').count():
        page.click('.summary button:has-text("Use example")')
        check(f'{w} example suburb', page.input_value('#suburb') == 'North Ryde')
    page.click('button:has-text("Place order")')
    page.wait_for_selector('text=/Thanks! Order RM-/')
    check(f'{w} order placed', True)
    page.click('text=Back to checkout')
    check(f'{w} order history', page.locator('text=Past orders').count() == 1)


def seller(page, w, ai):
    page.goto(PAGE)
    page.click('nav >> text=Sell')
    page.click('text=Use the demo shop'); page.wait_for_selector('.tabs')
    check(f'{w} demo shop listings', page.locator('table.listings tbody tr').count() == 5)
    no_overflow(page, 'seller products', w)
    page.click('.tabs >> text=Insights'); page.wait_for_selector('.insight-grid')
    txt = page.locator('.insight-grid').inner_text()
    check(f'{w} insights best/worst/top/bottom', 'Slim Hoop Pine Bookcase' in txt and 'Linen Drum Floor Lamp' in txt and 'Turned Leg Bedside' in txt)
    page.locator('button:has-text("Read more")').first.click(); page.wait_for_selector('.review-break')
    check(f'{w} review themes', page.locator('.review-break .theme').count() > 0)
    if ai:
        page.click('text=Summarise these reviews with Claude'); page.wait_for_selector("text=Claude's summary")
        check(f'{w} AI review summary', True)
    no_overflow(page, 'insights', w)
    shot(page, f'{w}-insights-{ai}')
    page.click('.tabs >> text=Add products')
    page.click('.goal-card:has-text("From your product page")')
    page.click('text=Use an example page'); page.click('text=Fill the listing form')
    page.wait_for_selector('.notice.info')
    check(f'{w} listing filled from page ({"AI" if ai else "rules"})', page.input_value('#npw') == '60' and page.input_value('#npp') == '229')
    page.click('button:has-text("Publish listing")'); page.wait_for_timeout(300)
    page.click('.tabs >> text=Add products'); page.click('.goal-card:has-text("Many at once")')
    page.click('text=Use the example'); page.wait_for_selector('table.csv-table')
    page.click('button:has-text("Publish 3 listings")'); page.wait_for_timeout(300)
    check(f'{w} listings after page + CSV', page.locator('table.listings tbody tr').count() == 9)
    page.click('.tabs >> text=Add products'); page.click('.goal-card:has-text("Type it in")')
    page.click('.card:has-text("Type in a product") button:has-text("Fill with example")')
    check(f'{w} example product fills the form', page.input_value('#npt') == 'Spun Brass Floor Lamp' and page.input_value('#npw') == '35')
    page.click('button:has-text("Publish listing")'); page.wait_for_timeout(300)
    page.click('.tabs >> text=/^Products/')
    check(f'{w} example product published', page.locator('table.listings tbody tr').count() == 10)
    no_overflow(page, 'seller after adds', w)


def blank_room(page, w, ai):
    page.goto(PAGE)
    page.click('nav >> text=My rooms')
    page.click('button:has-text("New room")')
    page.wait_for_selector('.how-row')
    page.wait_for_timeout(300)
    if ai:
        page.wait_for_selector('text=Try an example floor plan')
        page.click('text=Try an example floor plan')
        page.wait_for_selector('.scan-result', timeout=15000)
        no_overflow(page, 'scan review', w)
        shot(page, f'{w}-scan')
        page.click('text=Use these measurements'); page.wait_for_selector('#rw')
        check(f'{w} scan fills the room', page.input_value('#rw') == '320' and page.input_value('#rl') == '360')
    else:
        check(f'{w} no Claude: typing is the default', page.locator('#rw').count() == 1)
        page.click('.form-card button:has-text("Fill with example")')
        check(f'{w} example room fills the form', page.input_value('#rw') == '320' and page.input_value('#doff') == '40' and page.locator('[id^=ww]').count() == 1)
    page.click('text=Next: your furniture'); page.wait_for_selector('#preset')
    if page.locator('.item-row').count() == 0:
        page.click('button:has-text("Add example pieces")'); page.wait_for_timeout(200)
        check(f'{w} example pieces added', page.locator('.item-row').count() == 4)
    check(f'{w} furniture listed', page.locator('.item-row').count() >= 1)
    page.click('text=Next: preferences'); page.wait_for_timeout(300)
    btn = page.locator('button:has-text("layouts")').last
    btn.click(); page.wait_for_selector('.layout-card', timeout=15000)
    check(f'{w} layouts for a new room', page.locator('.layout-card').count() >= 1)


with sync_playwright() as p:
    b = launch(p)
    for vp in ({'width': 1360, 'height': 900}, {'width': 390, 'height': 844}):
        for ai in (False, True):
            ctx = b.new_context(viewport=vp)
            if ai:
                ctx.add_init_script(MOCK)
            page = ctx.new_page()
            wire(page, errors)
            w = f"{vp['width']}{'+ai' if ai else ''}"
            for fn in ((lambda: shopper(page, w)) if not ai else None, lambda: seller(page, w, ai), lambda: blank_room(page, w, ai)):
                if fn is None:
                    continue
                try:
                    fn()
                except Exception as e:  # keep going so one failure doesn't hide the rest
                    check(f'{w} flow crashed', False, str(e).split('\n')[0][:160])
            ctx.close()
    b.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail and not ok else ''))
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed; {len(errors)} console errors')
for e in errors[:20]:
    print('  ', e)
sys.exit(1 if failed or errors else 0)
