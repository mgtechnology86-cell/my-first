// Browser tests for MGM MARKET (Playwright). Run: npm install && npx playwright install chromium && npm test
// NOTE: Tests that need real data use a clearly-labelled MOCK Supabase client that exists ONLY in this test file.
// It checks the website's rendering and logic. It does NOT test your real Supabase project or its security rules.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('nf'); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
const VALID_CFG = 'window.MGM_CONFIG={SUPABASE_URL:"https://abcdefghij.supabase.co",SUPABASE_KEY:"sb_publishable_TESTTESTTESTTESTTEST"};';
const MOCK = `(function(){
 function qb(t){let single=false;const p=new Proxy(function(){},{get(_,k){if(k==='then')return(a,b)=>Promise.resolve(window.__resolve(t,single)).then(a,b);return()=>{if(k==='maybeSingle'||k==='single')single=true;return p;};}});return p;}
 window.__resolve=function(t,single){ if(window.__FAIL)return{data:null,error:{message:'Failed to fetch'}}; var d=(window.__DATA||{})[t]||[]; return{data:single?(d[0]||null):d,error:null,count:d.length}; };
 window.__rpcCalls=[];
 window.supabase={createClient:function(){return{from:qb,rpc:function(n,a){window.__rpcCalls.push([n,a]);if(window.__FAIL)return Promise.resolve({data:null,error:{message:'Failed to fetch'}});
   if(n==='is_admin')return Promise.resolve({data:false,error:null});
   if(n==='place_order')return Promise.resolve({data:{order_number:'MGM-TEST-0001',tracking_token:'tok123'},error:null});
   if(n==='track_order')return Promise.resolve({data:{order_number:'MGM-TEST-0001',status:'pending_confirmation',payment_status:'unpaid',payment_method:'cash_on_delivery',subtotal:100,delivery_fee:10,total:110,created_at:new Date().toISOString(),delivery_summary:'Accra',items:[{name:'Test Phone',quantity:1,unit_price:100,line_total:100}],history:[{status:'pending_confirmation',note:'Order received',created_at:new Date().toISOString()}]},error:null});
   return Promise.resolve({data:null,error:null});},
  auth:{getSession:function(){return Promise.resolve({data:{session:null}});},onAuthStateChange:function(){return{data:{subscription:{}}};},signInWithPassword:function(){return Promise.resolve({error:{message:'Invalid login credentials'}});},signUp:function(){return Promise.resolve({data:{session:null},error:null});},signOut:function(){return Promise.resolve({});},resetPasswordForEmail:function(){return Promise.resolve({error:null});}},
  storage:{from:function(){return{getPublicUrl:function(){return{data:{publicUrl:''}};}}}}};}};})();`;
const PRODUCT = { id: '11111111-1111-1111-1111-111111111111', name: 'Test Phone', description: 'A phone', short_description: 'Nice', price: 100, discount_price: null, stock: 5, status: 'published', is_sold_out: false, condition: 'new', specifications: {}, delivery_fee: 10, delivery_days_min: 1, delivery_days_max: 3, category_id: 'c1', categories: { name: 'Electronics' }, product_images: [], created_at: new Date().toISOString() };
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  — ' + info : '')); };

async function newPage(browser, { cfg = false, mock = false, data = {}, fail = false, viewport = { width: 1100, height: 800 } } = {}) {
  const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/, r => r.abort());
  if (cfg) await page.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: VALID_CFG }));
  if (mock) await page.route('**/assets/js/vendor/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  await page.addInitScript(`window.__DATA=${JSON.stringify(data)};window.__FAIL=${fail};`);
  return { page, errors, ctx };
}
const goGuest = async page => { await page.goto(base + '/'); await page.waitForSelector('text=Continue as Guest'); await page.click('button:has-text("Continue as Guest")'); };

let base;
(async () => {
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const DATA = { products: [PRODUCT], categories: [{ id: 'c1', name: 'Electronics', sort_order: 1, is_active: true }], business_settings: [{ key: 'business_name', value: 'MGM (MG MARKET)' }], delivery_settings: [] };
  try {
    // 1. No configuration at all
    let t = await newPage(browser);
    await t.page.goto(base + '/'); await t.page.waitForSelector('text=Continue as Guest', { timeout: 8000 });
    ok('Welcome/login page renders (no Supabase config)', true);
    await t.page.click('button:has-text("Continue as Guest")');
    await t.page.waitForSelector('text=Store not connected yet');
    ok('Configuration warning shown when credentials are missing', true);
    ok('Empty-store message shown', await t.page.locator('text=No products available yet. Please check back soon.').count() > 0);
    ok('Header, search bar, nav and footer render', (await t.page.locator('header .search input, nav.main a, footer').count()) > 5);
    for (const [label, sel] of [['Contact', 'a:has-text("Contact")'], ['Track Order', 'nav a:has-text("Track Order")'], ['Browse Products', 'nav a:has-text("Browse Products")'], ['My Orders', 'nav a:has-text("My Orders")'], ['Favourites', 'nav a:has-text("Favourites")'], ['Cart', 'nav a:has-text("Cart")']]) {
      await t.page.locator('nav.main ' + sel.replace(/^nav /, '')).first().click(); await t.page.waitForTimeout(150);
      ok('Nav button works without config: ' + label, (await t.page.locator('main').innerText()).length > 20 && !(await t.page.locator('text=Cannot read').count()));
    }
    ok('No JavaScript errors without config', t.errors.length === 0, t.errors.join(' | ')); await t.ctx.close();

    // 2. Config present but Supabase library cannot load (offline CDN)
    t = await newPage(browser, { cfg: true });
    await goGuest(t.page); await t.page.waitForSelector('text=Supabase library could not be loaded');
    ok('Clear notice when Supabase library fails to load (no blank page)', true, t.errors.join(' | ')); await t.ctx.close();

    // 3. Mock backend: empty database
    t = await newPage(browser, { cfg: true, mock: true, data: { categories: [], business_settings: [] } });
    await goGuest(t.page); await t.page.waitForSelector('text=No products yet');
    ok('Empty database shows friendly message', (await t.page.locator('text=The administrator has not published any products yet').count()) > 0 && errorsClean(t)); await t.ctx.close();

    // 4. Mock backend: connection failure + Retry
    t = await newPage(browser, { cfg: true, mock: true, fail: true });
    await goGuest(t.page); await t.page.waitForSelector('button:has-text("Retry")');
    ok('Failed connection shows friendly error with Retry button', (await t.page.locator('text=Cannot reach the server').count()) > 0, t.errors.join(' | '));
    await t.page.evaluate('window.__FAIL=false;window.__DATA=' + JSON.stringify(DATA)); await t.page.click('button:has-text("Retry")'); await t.page.waitForSelector('text=Test Phone');
    ok('Retry recovers once the connection is back', true); await t.ctx.close();

    // 5. Mock backend: products, search, cart, favourites, checkout
    t = await newPage(browser, { cfg: true, mock: true, data: DATA });
    await goGuest(t.page); await t.page.waitForSelector('article.card');
    ok('Product card renders with name, price, Add to Cart and Buy Now', (await t.page.locator('article.card:has-text("Test Phone"):has-text("GH₵ 100.00") >> text=Add to Cart').count()) > 0 && (await t.page.locator('article.card >> text=Buy Now').count()) > 0);
    ok('Missing product image falls back to placeholder', (await t.page.locator('article.card img').first().getAttribute('src')).includes('placeholder.svg'));
    await t.page.fill('header .search input', 'phone'); await t.page.click('header .search button'); await t.page.waitForSelector('text=Results for');
    ok('Search navigates to results', (await t.page.locator('article.card').count()) === 1);
    await t.page.click('article.card button:has-text("Add to Cart")'); await t.page.waitForSelector('.toast');
    ok('Add to Cart updates the cart badge', (await t.page.locator('.badge').first().innerText()) === '1');
    await t.page.click('article.card .fav'); await t.page.waitForTimeout(200);
    ok('Guest favourite saved on device', (await t.page.evaluate('localStorage.getItem("mgm_favs")')).includes('1111'));
    await t.page.click('nav a:has-text("Cart")'); await t.page.waitForSelector('text=Shopping cart');
    await t.page.click('button[data-act=cinc]'); await t.page.waitForSelector('.qty span:text("2")');
    ok('Cart quantity increase and subtotal', (await t.page.locator('.sum').innerText()).includes('GH₵ 200.00'));
    await t.page.click('button[data-act=cdec]'); await t.page.waitForSelector('.qty span:text("1")'); ok('Cart quantity decrease', true);
    await t.page.click('a:has-text("Checkout")'); await t.page.waitForSelector('text=PLACE ORDER');
    await t.page.click('#place'); await t.page.waitForSelector('#err .msg');
    ok('Checkout validates required fields', (await t.page.locator('#err').innerText()).includes('required'));
    for (const [n, v] of [['name', 'Ama Test'], ['email', 'ama@example.com'], ['phone', '0240000000'], ['region', 'Greater Accra'], ['city', 'Accra'], ['address', 'Near the test junction']]) await t.page.fill(`[data-form=checkout] [name=${n}]`, v);
    await t.page.click('#place'); await t.page.waitForSelector('text=Your order has been received');
    const call = await t.page.evaluate('window.__rpcCalls.filter(c=>c[0]==="place_order")[0][1].p_payload');
    ok('Place Order sends only product IDs + quantities (no prices) to the server', !JSON.stringify(call).includes('price') && call.items[0].quantity === 1 && !!call.idempotency_key);
    ok('Order confirmation page shows order number', (await t.page.locator('main').innerText()).includes('MGM-TEST-0001'));
    ok('Cart emptied after successful order', (await t.page.evaluate('localStorage.getItem("mgm_cart")')) === '[]');
    ok('No JavaScript errors in shopping flow', errorsClean(t), t.errors.join(' | ')); await t.ctx.close();

    // 6. Admin page is not available to a visitor
    t = await newPage(browser, { cfg: true, mock: true, data: DATA }); await goGuest(t.page); await t.page.goto(base + '/#/admin'); await t.page.waitForSelector('text=Administrator access only');
    ok('Admin dashboard shows access-restricted page to non-admin visitors (UI only; real protection is RLS)', true); await t.ctx.close();

    // 7. Mobile layout: no sideways overflow
    t = await newPage(browser, { cfg: true, mock: true, data: DATA, viewport: { width: 360, height: 740 } }); await goGuest(t.page); await t.page.waitForSelector('article.card');
    ok('Mobile (360px) home: no horizontal overflow', await t.page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'));
    await t.page.goto(base + '/#/checkout'); await t.page.waitForTimeout(300); ok('Mobile (360px) checkout: no horizontal overflow', await t.page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')); await t.ctx.close();
  } catch (e) { ok('Test run crashed', false, e.message); }
  await browser.close(); server.close();
  const failed = results.filter(r => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); fs.writeFileSync(path.join(__dirname, 'last-results.txt'), results.map(r => (r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.info ? ' — ' + r.info : '')).join('\n')); process.exit(failed ? 1 : 0);
})();
function errorsClean(t) { return t.errors.length === 0; }
