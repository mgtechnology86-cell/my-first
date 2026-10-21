(function () {
'use strict';
const { SUPABASE_URL, SUPABASE_KEY } = window.MGM_CONFIG || {};

/* ---------- setup & helpers ---------- */
const CONFIG_OK = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL || '') && !!SUPABASE_KEY && !/^(PASTE|YOUR)_/i.test(SUPABASE_KEY) && SUPABASE_KEY.length > 20;
let sb = null, INIT_ERR = '';
try { if (CONFIG_OK && window.supabase) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); else if (CONFIG_OK) INIT_ERR = 'lib'; } catch (e) { console.error(e); INIT_ERR = 'init'; }
let keepScroll = false;
const friendly = e => { console.error(e); const m = String(e?.message || e || '');
  if (/failed to fetch|networkerror|load failed|network request|fetch/i.test(m)) return 'Cannot reach the server. Please check your internet connection and try again.';
  if (/jwt|api key|apikey|invalid.*key/i.test(m)) return 'The store connection settings look wrong. Please contact the site owner.';
  return !m || m.length > 220 ? 'Something went wrong. Please try again.' : m; };
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'GH₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fdt = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const clean = s => String(s || '').replace(/[%,()*\\]/g, ' ').trim();
const STATUS = { pending_confirmation: 'Pending Confirmation', confirmed: 'Confirmed', preparing: 'Preparing Order', ready_for_dispatch: 'Ready for Dispatch', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled' };
const PAY = { unpaid: 'Unpaid', pending: 'Pending', paid: 'Paid', refunded: 'Refunded', failed: 'Failed' };
const PM = { cash_on_delivery: 'Pay on delivery', manual_payment: 'Manual payment (mobile money / transfer)' };
const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Western North', 'Central', 'Eastern', 'Volta', 'Oti', 'Northern', 'Savannah', 'North East', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo'];
const S = { user: null, profile: null, isAdmin: false, settings: {}, cats: [], favs: new Set(), buy: null, idem: null, delivery: [], lines: [] };
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } } };
const cart = () => store.get('mgm_cart', []);
const saveCart = c => store.set('mgm_cart', c);
const entered = () => { try { return sessionStorage.getItem('mgm_in') === '1'; } catch { return true; } };
const LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0b57e3"/><path d="M10 14h5l4 15h16l3-11H17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21" cy="36" r="2.6" fill="#fff"/><circle cx="33" cy="36" r="2.6" fill="#fff"/></svg>`;
const setting = k => (S.settings[k] ?? '') + '';
const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '233' + d.slice(1) : d; };

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
const msgBox = (type, text) => `<div class="msg ${type}" role="${type === 'err' ? 'alert' : 'status'}">${esc(text)}</div>`;
const imgs = p => (p.product_images || []).slice().sort((a, b) => (b.is_primary - a.is_primary) || (a.sort_order - b.sort_order));
const thumb = p => imgs(p)[0]?.url || '';
const PH = 'assets/images/placeholder.svg';
const imgTag = (u, alt) => `<img src="${esc(u || PH)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${PH}'">`;
const avail = p => p.status === 'published' && !p.is_sold_out && p.stock > 0;
const eff = p => p.discount_price ?? p.price;
const PSEL = '*, product_images(url,is_primary,sort_order), categories(name)';

/* ---------- data ---------- */
async function listProducts({ q, cat, featured, limit = 40 } = {}) {
  let r = sb.from('products').select(PSEL).eq('status', 'published').order('created_at', { ascending: false }).limit(limit);
  if (cat) r = r.eq('category_id', cat);
  if (featured) r = r.eq('is_featured', true);
  if (q && clean(q)) r = r.or(`name.ilike.%${clean(q)}%,description.ilike.%${clean(q)}%`);
  const { data, error } = await r; if (error) throw error; return data;
}
async function byIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await sb.from('products').select(PSEL).in('id', ids).eq('status', 'published'); if (error) throw error; return data;
}
async function loadBase() {
  const [s, c, d] = await Promise.all([
    sb.from('business_settings').select('key,value'),
    sb.from('categories').select('*').eq('is_active', true).order('sort_order'),
    sb.from('delivery_settings').select('*').eq('is_active', true)]);
  S.settings = Object.fromEntries((s.data || []).map(r => [r.key, r.value]));
  S.cats = c.data || []; S.delivery = d.data || [];
}
async function refreshUser() {
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.isAdmin = false; S.favs = new Set(store.get('mgm_favs', [])); S.profile = null;
  if (S.user) {
    const local = store.get('mgm_favs', []);
    if (local.length) { await sb.from('favorites').upsert(local.map(pid => ({ user_id: S.user.id, product_id: pid })), { onConflict: 'user_id,product_id', ignoreDuplicates: true }); store.set('mgm_favs', []); }
    const [a, f, p] = await Promise.all([sb.rpc('is_admin'), sb.from('favorites').select('product_id'), sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle()]);
    S.isAdmin = a.data === true; S.favs = new Set((f.data || []).map(x => x.product_id)); S.profile = p.data;
  }
}

/* ---------- layout ---------- */
function shell(inner, qv = '') {
  const n = cart().reduce((a, i) => a + i.qty, 0);
  const h = location.hash;
  const on = x => h.startsWith('#/' + x) ? 'on' : '';
  $('#app').innerHTML = `
  <header class="top"><div class="wrap">
    <div class="hrow"><a class="logo" href="#/">${LOGO}<span>MGM</span></a>
      <form class="search" data-form="search" role="search"><input name="q" placeholder="Search products" value="${esc(qv)}" aria-label="Search products"><button class="btn">Search</button></form></div>
    <nav class="main" aria-label="Main">
      <a href="#/" class="${h === '#/' || h === '' ? 'on' : ''}">Home</a><a href="#/products" class="${on('products')}">Browse Products</a><a href="#/categories" class="${on('categories')}">Categories</a>
      <a href="#/favorites" class="${on('favorites')}">Favourites</a><a href="#/cart" class="${on('cart')}">Cart<span class="badge">${n}</span></a><a href="#/orders" class="${on('orders')}">My Orders</a><a href="#/track" class="${on('track')}">Track Order</a>
      <a href="#/contact" class="${on('contact')}">Contact</a>
      ${S.user ? '<a href="#/account">Profile</a>' : '<a href="#/login">Login</a><a href="#/login?register=1">Create Account</a><a href="#/login?admin=1">Admin Login</a>'}
      ${S.isAdmin ? '<a class="adm" href="#/admin">Admin Dashboard</a>' : ''}
    </nav></div></header>
  <main class="wrap" id="main">${!sb ? configNotice() : ''}${inner}</main>
  <footer><div class="wrap"><b>${esc(setting('business_name') || 'MGM (MG MARKET)')}</b> · ${esc(setting('tagline') || 'BUY • SELL • DISCOVER')}<br>
    <a href="#/">Home</a> · <a href="#/products">All Products</a> · <a href="#/cart">Cart</a> · <a href="#/track">Track an order</a> · <a href="#/questions">Questions</a> · <a href="#/contact">Contact</a>
    ${setting('contact_phone') ? `<br>Call: <a href="tel:${esc(setting('contact_phone'))}">${esc(setting('contact_phone'))}</a>` : ''}
    ${setting('contact_email') ? ` · <a href="mailto:${esc(setting('contact_email'))}">${esc(setting('contact_email'))}</a>` : ''}
    <br>© ${new Date().getFullYear()} MGM (MG MARKET). All rights reserved.</div></footer>`;
  if (!keepScroll) window.scrollTo(0, 0);
}
const empty = (t, m, link = '<a class="btn" href="#/products">Browse products</a>') => `<div class="empty"><h3>${esc(t)}</h3><p>${esc(m)}</p>${link}</div>`;

function card(p) {
  const ok = avail(p);
  return `<article class="card"><div class="ph"><a href="#/p/${p.id}" aria-label="${esc(p.name)}" style="display:block;height:100%">${imgTag(thumb(p), p.name)}</a>
    <button class="fav ${S.favs.has(p.id) ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-label="Favorite">${S.favs.has(p.id) ? '♥' : '♡'}</button></div>
    <div class="body"><a class="nm" href="#/p/${p.id}">${esc(p.name)}</a>
    <div class="price">${money(eff(p))}${p.discount_price != null ? `<s>${money(p.price)}</s>` : ''}</div>
    <div class="sm-t">${esc(p.categories?.name || '')}</div>
    ${p.short_description ? `<div class="sm-t">${esc(p.short_description)}</div>` : ''}
    <div>${ok ? '<span class="tag ok">Available</span>' : '<span class="tag bad">Sold out</span>'}</div>
    <div class="acts"><a class="btn alt" href="#/p/${p.id}">View Product</a>
    ${ok ? `<button class="btn" data-act="add" data-id="${p.id}">Add to Cart</button><button class="btn alt" data-act="buy" data-id="${p.id}">Buy Now</button>` : ''}</div></div></article>`;
}
const gridOf = a => `<div class="grid">${a.map(card).join('')}</div>`;

/* ---------- welcome / auth ---------- */
function vWelcome(q = new URLSearchParams()) {
  $('#app').innerHTML = `<div class="welcome"><div class="wbox">
    <div class="logo">${LOGO}<span>MGM</span><span class="sm-t" style="font-weight:600">MG MARKET</span></div>
    <p class="tagl">BUY • SELL • DISCOVER</p>
    <div id="amsg">${q.get('admin') ? msgBox('info', 'Administrator login: sign in with the administrator account.') : ''}</div>
    <form data-form="login" novalidate>
      <label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required>
      <label for="pw">Password</label><div class="pw"><input id="pw" name="password" type="password" autocomplete="current-password" required><button type="button" data-act="showpw" aria-label="Show or hide password">Show</button></div>
      <div class="row" style="margin-top:14px"><button class="btn full" id="lbtn">Login</button></div></form>
    <div class="row sp" style="margin:8px 0"><button class="btn ghost" data-act="forgot">Forgot password?</button><button class="btn ghost" data-act="regtoggle">Create account (optional)</button></div>
    <form data-form="register" id="regf" ${q.get('register') ? '' : 'hidden'}>
      <label for="rn">Full name</label><input id="rn" name="name" required><label for="re">Email</label><input id="re" name="email" type="email" required>
      <label for="rp">Password (min 8 characters)</label><input id="rp" name="password" type="password" minlength="8" autocomplete="new-password" required>
      <button class="btn full" style="margin-top:12px">Create account</button></form>
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
    <button class="btn alt full" data-act="guest">Continue as Guest</button>
    <a class="btn full" style="margin-top:8px" href="#/" data-act="guest">Browse Marketplace</a>
    <p class="sm-t" style="text-align:center">No account needed to shop. Only the administrator must sign in.</p></div></div>`;
}
function vReset() { shell(`<div class="panel" style="max-width:420px;margin:auto"><h2>Choose a new password</h2><div id="amsg"></div><form data-form="reset"><label>New password</label><input name="password" type="password" minlength="8" required><button class="btn full" style="margin-top:12px">Save password</button></form></div>`); }

/* ---------- storefront views ---------- */
async function vHome() {
  const [latest, feat, all, cm] = await Promise.all([listProducts({ limit: 8 }), listProducts({ featured: true, limit: 8 }), listProducts({ limit: 24 }),
    sb.from('product_comments_public').select('*').order('created_at', { ascending: false }).limit(4)]);
  const ids = new Set(latest.map(p => p.id));
  const rec = all.filter(p => !ids.has(p.id)).sort(() => Math.random() - .5).slice(0, 4);
  const chips = S.cats.map(c => `<a class="chip" href="#/products?cat=${c.id}">${esc(c.name)}</a>`).join('');
  const body = all.length ? `
    <div class="sec"><div class="sec-h"><h2>Latest products</h2><a href="#/products">View all</a></div>${gridOf(latest)}</div>
    ${feat.length ? `<div class="sec"><h2>Featured products</h2>${gridOf(feat)}</div>` : ''}
    <div class="sec"><h2>All available products</h2>${gridOf(all)}</div>
    ${rec.length ? `<div class="sec"><h2>You may also like</h2>${gridOf(rec)}</div>` : ''}`
    : empty('No products yet', 'The administrator has not published any products yet. Please check back soon.', '');
  const comments = (cm.data || []).length ? `<div class="sec"><div class="sec-h"><h2>Customer questions</h2><a href="#/questions">See all</a></div><div class="panel">${cm.data.map(c => `<div class="cm"><b>${esc(c.display_name)}</b> <span class="sm-t">${fdate(c.created_at)}</span><div>${esc(c.message)}</div>${(c.replies || []).map(r => `<div class="rp"><b>MGM:</b> ${esc(r.reply)}</div>`).join('')}</div>`).join('')}</div></div>` : '';
  const info = `<div class="sec panel"><h2>About ${esc(setting('business_name') || 'MGM (MG MARKET)')}</h2><p>${esc(setting('about') || 'Quality products, delivered across Ghana.')}</p>
    <p class="sm-t">Owner: ${esc(setting('owner'))} · ${esc(setting('country'))} · Prices in Ghana cedis (GH₵)</p>
    ${setting('business_address') ? `<p class="sm-t">Address: ${esc(setting('business_address'))}</p>` : ''}${setting('delivery_notes') ? `<p class="sm-t">Delivery: ${esc(setting('delivery_notes'))}</p>` : ''}</div>`;
  shell(`<section class="hero"><h1>Welcome to MGM (MG MARKET)</h1><p>BUY • SELL • DISCOVER — quality products delivered to your door in Ghana.</p><a class="btn alt" href="#/products">Shop now</a></section>
    <div class="chips" aria-label="Categories">${chips}</div>${body}${comments}${info}`);
}
async function vCategories() {
  shell(`<h2>Categories</h2>${S.cats.length ? `<div class="chips" style="flex-wrap:wrap">${S.cats.map(c => `<a class="chip" href="#/products?cat=${c.id}">${esc(c.name)}</a>`).join('')}</div>` : empty('No categories yet', 'Categories will appear here once added.', '')}`);
}
async function vProducts(q) {
  const cat = q.get('cat') || '', term = q.get('q') || '';
  const list = await listProducts({ q: term, cat, limit: 100 });
  shell(`<h2>${term ? `Results for “${esc(term)}”` : 'All products'}</h2>
    <div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="#/products${term ? '?q=' + encodeURIComponent(term) : ''}">All</a>${S.cats.map(c => `<a class="chip ${cat === c.id ? 'on' : ''}" href="#/products?cat=${c.id}${term ? '&q=' + encodeURIComponent(term) : ''}">${esc(c.name)}</a>`).join('')}</div>
    ${list.length ? gridOf(list) : empty('No products found', term || cat ? 'Try a different search or category.' : 'The administrator has not published any products yet.')}`, term);
}
async function vProduct(id) {
  const { data: p, error } = await sb.from('products').select(PSEL).eq('id', id).eq('status', 'published').maybeSingle();
  if (error) throw error;
  if (!p) return shell(empty('Product not found', 'This product is no longer available.'));
  const [cm, rel] = await Promise.all([sb.from('product_comments_public').select('*').eq('product_id', id).order('created_at', { ascending: false }),
    p.category_id ? sb.from('products').select(PSEL).eq('status', 'published').eq('category_id', p.category_id).neq('id', id).limit(4) : { data: [] }]);
  const im = imgs(p), ok = avail(p);
  const specs = Object.entries(p.specifications || {});
  const dd = p.delivery_days_min === p.delivery_days_max ? `${p.delivery_days_max} day(s)` : `${p.delivery_days_min}–${p.delivery_days_max} days`;
  shell(`<p class="sm-t"><a href="#/products">Products</a> › ${esc(p.categories?.name || 'Other')}</p>
  <div class="two"><div class="gal"><div class="big" id="bigimg">${imgTag(im[0]?.url, p.name)}</div>
    ${im.length > 1 ? `<div class="thumbs">${im.map((i, k) => `<img src="${esc(i.url)}" alt="Image ${k + 1}" class="${k === 0 ? 'on' : ''}" data-act="gal" data-v="${esc(i.url)}">`).join('')}</div>` : ''}</div>
  <div><h1 style="font-size:1.5rem">${esc(p.name)}</h1>
    <div class="price" style="font-size:1.5rem">${money(eff(p))}${p.discount_price != null ? `<s>${money(p.price)}</s>` : ''}</div>
    <p>${ok ? `<span class="tag ok">In stock — ${p.stock} available</span>` : '<span class="tag bad">Sold out</span>'} <span class="tag">${esc(p.condition)}</span> ${p.location ? `<span class="tag">${esc(p.location)}</span>` : ''}</p>
    <p class="sm-t">Delivery fee: ${Number(p.delivery_fee) > 0 ? money(p.delivery_fee) : 'Calculated at checkout'} · Estimated delivery: ${dd}</p>
    ${ok ? `<div class="row"><div class="qty"><button data-act="qm" aria-label="Decrease">−</button><span id="q">1</span><button data-act="qp" data-max="${p.stock}" aria-label="Increase">+</button></div></div>
    <div class="row" style="margin-top:12px"><button class="btn" data-act="add" data-id="${p.id}" data-q="1">Add to Cart</button><button class="btn alt" data-act="buy" data-id="${p.id}" data-q="1">Buy Now</button></div>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="fav" data-id="${p.id}">${S.favs.has(p.id) ? '♥ Saved' : '♡ Favorite'}</button><a class="btn ghost" href="#ask">Ask a Question</a><button class="btn ghost" data-act="share" data-id="${p.id}">Share Product</button></div></div></div>
  <div class="panel" style="margin-top:16px"><h2>Description</h2><p style="white-space:pre-wrap">${esc(p.description || 'No description provided.')}</p>
    ${specs.length ? `<h3>Specifications</h3><table class="t">${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}${p.sku ? `<p class="sm-t">SKU: ${esc(p.sku)}</p>` : ''}</div>
  <div class="panel" id="ask"><h2>Questions & comments</h2>
    ${(cm.data || []).map(c => `<div class="cm"><b>${esc(c.display_name)}</b> <span class="sm-t">${fdate(c.created_at)}</span><div>${esc(c.message)}</div>${(c.replies || []).map(r => `<div class="rp"><b>MGM:</b> ${esc(r.reply)}</div>`).join('')}</div>`).join('') || '<p class="sm-t">No approved comments yet.</p>'}
    <h3 style="margin-top:14px">Ask a Question</h3><div id="cmsg"></div>
    <form data-form="comment" data-id="${p.id}" class="frm c2"><div><label>Display name</label><input name="name" maxlength="60" required value="${esc(S.profile?.full_name || '')}"></div>
    <div><label>Email (private, for replies)</label><input name="email" type="email"></div>
    <div class="span"><label>Your question or comment</label><textarea name="message" maxlength="1000" required></textarea></div>
    <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <div class="span"><button class="btn">Submit</button> <span class="sm-t">Comments appear after approval.</span></div></form></div>
  ${(rel.data || []).length ? `<div class="sec"><h2>Related products</h2>${gridOf(rel.data)}</div>` : ''}`);
}

/* ---------- cart & checkout ---------- */
async function loadLines(items) {
  const ps = await byIds(items.map(i => i.id));
  return items.map(i => ({ p: ps.find(p => p.id === i.id), qty: i.qty })).filter(l => l.p).map(l => ({ ...l, qty: Math.max(1, Math.min(l.qty, l.p.stock || 1)) }));
}
const lineHtml = (l, ctl) => `<div class="line">${imgTag(thumb(l.p), l.p.name)}<div class="g"><a href="#/p/${l.p.id}"><b>${esc(l.p.name)}</b></a><div class="sm-t">${money(eff(l.p))} each</div>
  ${ctl ? `<div class="qty" style="margin-top:6px"><button data-act="cdec" data-id="${l.p.id}" aria-label="Decrease quantity">−</button><span>${l.qty}</span><button data-act="cinc" data-id="${l.p.id}" aria-label="Increase quantity">+</button></div>` : `<div class="sm-t">Qty ${l.qty}</div>`}</div>
  <div style="text-align:right"><b>${money(eff(l.p) * l.qty)}</b>${ctl ? `<br><button class="btn ghost" data-act="crm" data-id="${l.p.id}">Remove</button>` : ''}</div></div>`;
const subtotal = ls => ls.reduce((a, l) => a + eff(l.p) * l.qty, 0);
async function vCart() {
  const c = cart(); if (!c.length) return shell(empty('Your cart is empty', 'Add products to start shopping.'));
  const ls = await loadLines(c); saveCart(ls.map(l => ({ id: l.p.id, qty: l.qty })));
  if (!ls.length) return shell(empty('Your cart is empty', 'The products in your cart are no longer available.'));
  const fee = Math.max(...ls.map(l => Number(l.p.delivery_fee)));
  shell(`<h2>Shopping cart</h2><div class="panel">${ls.map(l => lineHtml(l, true)).join('')}
    <table class="sum" style="width:100%;margin-top:10px"><tr><td>Subtotal</td><td>${money(subtotal(ls))}</td></tr><tr><td>Delivery fee (estimate)</td><td>${fee > 0 ? money(fee) : 'Calculated at checkout'}</td></tr>
    <tr class="tot"><td>Estimated total</td><td>${money(subtotal(ls) + fee)}</td></tr></table>
    <div class="row" style="margin-top:12px"><a class="btn alt" href="#/products">Continue Shopping</a><a class="btn" href="#/checkout">Checkout</a></div></div>`);
}
function estimate(dm, region, city) {
  const r = (region || '').trim().toLowerCase(), c = (city || '').trim().toLowerCase();
  if (dm === 'pickup') { const s = S.delivery.find(d => d.method === 'pickup'); return s ? { fee: 0, min: s.days_min, max: s.days_max } : null; }
  const rules = S.delivery.filter(d => d.method === 'delivery' && (!d.area || [r, c].includes(d.area.toLowerCase())))
    .sort((a, b) => rank(a) - rank(b));
  function rank(d) { return !d.area ? 2 : d.area.toLowerCase() === c ? 0 : 1; }
  if (rules[0]) return { fee: Number(rules[0].fee), min: rules[0].days_min, max: rules[0].days_max };
  return { fee: Math.max(0, ...S.lines.map(l => Number(l.p.delivery_fee))), min: Math.max(0, ...S.lines.map(l => l.p.delivery_days_min)), max: Math.max(0, ...S.lines.map(l => l.p.delivery_days_max)) };
}
function sumHtml() {
  const f = $('[data-form=checkout]'); const fd = f ? Object.fromEntries(new FormData(f)) : {};
  const e = estimate(fd.delivery_method || 'delivery', fd.region, fd.city); const sub = subtotal(S.lines); const add = d => { const x = new Date(); x.setDate(x.getDate() + d); return x; };
  return `${S.lines.map(l => lineHtml(l, false)).join('')}<table class="sum" style="width:100%;margin-top:8px"><tr><td>Subtotal</td><td>${money(sub)}</td></tr>
  <tr><td>Delivery</td><td>${e ? money(e.fee) : '—'}</td></tr><tr class="tot"><td>Total</td><td>${money(sub + (e?.fee || 0))}</td></tr></table>
  <p class="sm-t">${e ? `Estimated delivery: ${fdate(add(e.min))} – ${fdate(add(e.max))}.` : ''} The final price and delivery fee are confirmed securely when you place the order.</p>`;
}
async function vCheckout() {
  const items = S.buy || cart(); if (!items.length) return shell(empty('Nothing to check out', 'Your cart is empty.'));
  S.lines = await loadLines(items); if (!S.lines.length) return shell(empty('Nothing to check out', 'These products are no longer available.'));
  const pr = S.profile || {}; const pickup = S.delivery.some(d => d.method === 'pickup');
  shell(`<h2>Checkout</h2><div class="two w"><div class="panel"><h3>Delivery details</h3><div id="err"></div>
  <form data-form="checkout" class="frm c2" novalidate>
    <div><label>Full name *</label><input name="name" required autocomplete="name" value="${esc(pr.full_name || '')}"></div>
    <div><label>Email address *</label><input name="email" type="email" required autocomplete="email" value="${esc(S.user?.email || '')}"></div>
    <div><label>Telephone number *</label><input name="phone" type="tel" required autocomplete="tel" value="${esc(pr.phone || '')}"></div>
    <div><label>Country *</label><input name="country" required value="${esc(pr.country || 'Ghana')}"></div>
    <div><label>Region *</label><input name="region" list="regions" required value="${esc(pr.region || '')}"><datalist id="regions">${REGIONS.map(r => `<option value="${r}">`).join('')}</datalist></div>
    <div><label>City or town *</label><input name="city" required value="${esc(pr.city || '')}"></div>
    <div><label>Area or neighbourhood</label><input name="area" value="${esc(pr.area || '')}"></div>
    <div><label>Landmark (optional)</label><input name="landmark"></div>
    <div class="span"><label>Full delivery address or directions *</label><textarea name="address" required>${esc(pr.address || '')}</textarea></div>
    <div class="span"><label>Delivery instructions</label><textarea name="instructions"></textarea></div>
    <div class="span"><label>Message to the seller (optional)</label><textarea name="message"></textarea></div>
    <div><label>Requested delivery date (optional)</label><input name="req" type="date" min="${new Date().toISOString().slice(0, 10)}"></div>
    <div><label>Delivery method</label><select name="delivery_method"><option value="delivery">Delivery</option>${pickup ? '<option value="pickup">Local pickup</option>' : ''}</select></div>
    <div class="span"><label>Payment method</label><select name="payment_method"><option value="cash_on_delivery">${PM.cash_on_delivery}</option><option value="manual_payment">${PM.manual_payment}</option></select>
      ${setting('payment_instructions') ? `<p class="sm-t">${esc(setting('payment_instructions'))}</p>` : ''}</div>
    <div class="span"><button class="btn full" id="place" style="margin-top:12px;font-size:1.05rem">PLACE ORDER</button></div></form></div>
  <div class="panel" style="align-self:start"><h3>Order summary</h3><div id="sumbox">${sumHtml()}</div></div></div>`);
}
async function vOrder(num, token, q) {
  const { data: o, error } = await sb.rpc('track_order', { p_order_number: num, p_token: token });
  if (error) throw error;
  if (!o) return shell(empty('Order not found', 'Check the order number and tracking code.', '<a class="btn" href="#/track">Try again</a>'));
  const wa = waNum(setting('whatsapp_number'));
  shell(`${q.get('new') ? `<div class="msg ok"><b>Thank you! Your order has been received.</b> Save this page or your tracking link to check progress later.</div>` : ''}
  <div class="panel"><h2>Order ${esc(o.order_number)}</h2><p>Placed ${fdt(o.created_at)} · Status: <span class="tag warn">${esc(STATUS[o.status])}</span> · Payment: ${esc(PAY[o.payment_status])} (${esc(PM[o.payment_method])})</p>
    ${o.items.map(i => `<div class="line">${imgTag(i.image, i.name)}<div class="g"><b>${esc(i.name)}</b><div class="sm-t">Qty ${i.quantity} × ${money(i.unit_price)}</div></div><b>${money(i.line_total)}</b></div>`).join('')}
    <table class="sum" style="width:100%;margin-top:8px"><tr><td>Subtotal</td><td>${money(o.subtotal)}</td></tr><tr><td>Delivery fee</td><td>${money(o.delivery_fee)}</td></tr><tr class="tot"><td>Total</td><td>${money(o.total)}</td></tr></table>
    <p><b>Delivery to:</b> ${esc(o.delivery_summary)}<br><b>Estimated delivery:</b> ${fdate(o.estimated_delivery_start)} – ${fdate(o.estimated_delivery_end)}</p>
    ${o.payment_method === 'manual_payment' && setting('payment_instructions') ? `<p><b>Payment instructions:</b> ${esc(setting('payment_instructions'))}</p>` : ''}
    <p class="sm-t">Tracking link (keep private): <input readonly value="${esc(location.origin + location.pathname + '#/order/' + o.order_number + '/' + token)}" onclick="this.select()"></p>
    <div class="row">${wa ? `<a class="btn alt" href="https://wa.me/${wa}?text=${encodeURIComponent('Hello MGM, about order ' + o.order_number)}">WhatsApp MGM</a>` : ''}${setting('contact_phone') ? `<a class="btn alt" href="tel:${esc(setting('contact_phone'))}">Call MGM</a>` : ''}${setting('contact_email') ? `<a class="btn alt" href="mailto:${esc(setting('contact_email'))}">Email MGM</a>` : ''}<a class="btn" href="#/products">Continue shopping</a></div></div>
  <div class="panel"><h3>Order updates</h3>${o.history.map(h => `<div class="cm"><b>${esc(STATUS[h.status] || h.status)}</b> <span class="sm-t">${fdt(h.created_at)}</span>${h.note ? `<div>${esc(h.note)}</div>` : ''}</div>`).join('')}</div>`);
}
function vTrack() {
  shell(`<div class="panel" style="max-width:460px;margin:auto"><h2>Track an order</h2><div id="tmsg"></div><form data-form="track"><label>Order number</label><input name="n" placeholder="MGM-260101-1001" required><label>Tracking code</label><input name="t" required><button class="btn full" style="margin-top:12px">Track order</button></form></div>`);
}
async function vOrders() {
  let html = '';
  if (S.user) {
    const { data, error } = await sb.from('orders').select('order_number,tracking_token,status,total,created_at,order_items(product_name,quantity)').order('created_at', { ascending: false }); if (error) throw error;
    html = (data || []).map(o => `<div class="panel"><div class="row sp"><b>${esc(o.order_number)}</b><span class="tag warn">${esc(STATUS[o.status])}</span></div><div class="sm-t">${fdt(o.created_at)} · ${money(o.total)}</div><div class="sm-t">${o.order_items.map(i => esc(i.product_name) + ' ×' + i.quantity).join(', ')}</div><a class="btn sm" href="#/order/${o.order_number}/${o.tracking_token}">View / Track</a></div>`).join('');
  }
  const loc = store.get('mgm_orders', []).filter(x => !S.user);
  html += loc.map(o => `<div class="panel"><b>${esc(o.n)}</b> <span class="sm-t">${fdt(o.at)}</span><br><a class="btn sm" href="#/order/${o.n}/${o.t}">View / Track</a></div>`).join('');
  shell(`<h2>My orders</h2>${html || empty('No orders yet', S.user ? 'Orders you place will appear here.' : 'Orders placed on this device appear here. You can also track an order with its number and tracking code.', '<a class="btn" href="#/track">Track an order</a>')}
  ${!S.user ? '<p class="sm-t"><a href="#/login">Log in</a> to see all your orders on any device.</p>' : ''}`);
}
async function vFavorites() {
  let ps = [];
  if (S.user) { const { data, error } = await sb.from('favorites').select(`product_id, products(${PSEL})`); if (error) throw error; ps = (data || []).map(x => x.products).filter(p => p && p.status === 'published'); }
  else ps = await byIds([...S.favs]);
  shell(`<h2>Favourites</h2>${ps.length ? gridOf(ps) : empty('No favourites yet', 'Tap the heart on any product to save it.')}${!S.user ? '<p class="sm-t">Saved on this device. <a href="#/login">Log in</a> to keep them on your account.</p>' : ''}`);
}
async function vQuestions() {
  const { data } = await sb.from('product_comments_public').select('*').order('created_at', { ascending: false }).limit(50);
  const ids = [...new Set((data || []).map(c => c.product_id))]; const ps = ids.length ? (await sb.from('products').select('id,name').in('id', ids)).data : [];
  shell(`<h2>Customer questions & comments</h2><p class="sm-t">To ask a question, open a product and use “Ask a Question”.</p>${(data || []).length ? `<div class="panel">${data.map(c => `<div class="cm"><b>${esc(c.display_name)}</b> on <a href="#/p/${c.product_id}">${esc((ps.find(p => p.id === c.product_id) || {}).name || 'product')}</a> <span class="sm-t">${fdate(c.created_at)}</span><div>${esc(c.message)}</div>${(c.replies || []).map(r => `<div class="rp"><b>MGM:</b> ${esc(r.reply)}</div>`).join('')}</div>`).join('')}</div>` : empty('No questions yet', 'Approved questions will appear here.', '<a class="btn" href="#/products">Browse products</a>')}`);
}
function vAccount() {
  if (!S.user) return location.hash = '/login';
  const p = S.profile || {}; const f = (n, l, v) => `<div><label>${l}</label><input name="${n}" value="${esc(v || '')}"></div>`;
  shell(`<div class="panel" style="max-width:640px"><h2>My profile</h2><p class="sm-t">Signed in as ${esc(S.user.email)}</p><div id="pmsg"></div>
  <form data-form="profile" class="frm c2">${f('full_name', 'Full name', p.full_name)}${f('phone', 'Telephone', p.phone)}${f('country', 'Country', p.country)}${f('region', 'Region', p.region)}${f('city', 'City or town', p.city)}${f('area', 'Area', p.area)}
  <div class="span"><label>Delivery address</label><textarea name="address">${esc(p.address || '')}</textarea></div><div class="span row"><button class="btn">Save profile</button><a class="btn alt" href="#/orders">My orders</a><button type="button" class="btn alt" data-act="logout">Log out</button></div></form></div>`);
}

/* ---------- admin ---------- */
const ADM = [['', 'Overview'], ['products', 'Products'], ['orders', 'Orders'], ['comments', 'Comments & Questions'], ['profit', 'Private business info'], ['settings', 'Settings']];
const admShell = (tab, inner) => shell(`<h2>Admin dashboard</h2><div class="adm-nav">${ADM.map(([k, l]) => `<a class="btn ${k === tab ? '' : 'alt'} sm" href="#/admin${k ? '/' + k : ''}">${l}</a>`).join('')}</div>${inner}`);
const dl = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

async function vAdmin(parts, q) {
  if (!S.user || !S.isAdmin) return shell(empty('Administrator access only', 'Please sign in with the administrator account.', '<a class="btn" href="#/login">Login</a>'));
  const t = parts[1] || '';
  if (t === '') {
    const [st, ro, rc] = await Promise.all([sb.rpc('admin_dashboard_stats'), sb.from('orders').select('id,order_number,customer_name,total,status,created_at').order('created_at', { ascending: false }).limit(6),
      sb.from('product_comments').select('id,display_name,message,created_at,products(name)').order('created_at', { ascending: false }).limit(5)]);
    if (st.error) throw st.error; const d = st.data, b = d.by_status || {};
    const box = (l, v) => `<div class="stat"><b>${v}</b>${l}</div>`;
    return admShell('', `<div class="stats">${box('Total products', d.total_products)}${box('Published', d.published_products)}${box('Unpublished', d.unpublished_products)}${box('Total orders', d.total_orders)}${box('New orders (24h)', d.new_orders)}
    ${Object.keys(STATUS).map(k => box(STATUS[k], b[k] || 0)).join('')}${box('Completed sales (delivered)', money(d.completed_sales))}${box('Unanswered questions', d.unanswered_questions)}</div>
    <div class="two" style="margin-top:14px"><div class="panel"><h3>Recent orders</h3>${(ro.data || []).map(o => `<div class="cm"><a href="#/admin/order/${o.id}">${esc(o.order_number)}</a> — ${esc(o.customer_name)} · ${money(o.total)} · <span class="tag">${esc(STATUS[o.status])}</span></div>`).join('') || '<p class="sm-t">No orders yet.</p>'}</div>
    <div class="panel"><h3>Recent questions</h3>${(rc.data || []).map(c => `<div class="cm"><b>${esc(c.display_name)}</b> on ${esc(c.products?.name || '')}<div>${esc(c.message)}</div></div>`).join('') || '<p class="sm-t">No questions yet.</p>'}
    <h3>Low stock (5 or fewer)</h3>${(d.low_stock || []).map(p => `<div class="cm"><a href="#/admin/product/${p.id}">${esc(p.name)}</a> — ${p.stock} left</div>`).join('') || '<p class="sm-t">None.</p>'}</div></div>`);
  }
  if (t === 'products') {
    let r = sb.from('products').select('id,name,price,stock,status,is_featured,is_sold_out,categories(name),product_images(url,is_primary,sort_order)').order('created_at', { ascending: false });
    const term = q.get('q') || '', cat = q.get('cat') || '';
    if (term) r = r.ilike('name', `%${clean(term)}%`); if (cat) r = r.eq('category_id', cat);
    const { data, error } = await r; if (error) throw error; const { data: cats } = await sb.from('categories').select('id,name').order('sort_order');
    return admShell('products', `<div class="row sp"><a class="btn" href="#/admin/product/new">Add Product</a>
      <form class="row" data-form="admfilter" data-base="admin/products"><input name="q" placeholder="Search" value="${esc(term)}" style="width:160px"><select name="cat" style="width:170px"><option value="">All categories</option>${(cats || []).map(c => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button class="btn alt sm">Filter</button></form></div>
      <div class="panel scroll"><table class="t"><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>${(data || []).map(p => `<tr><td style="width:54px"><div style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:var(--sky)">${imgTag(thumb(p), p.name)}</div></td><td>${esc(p.name)}<div class="sm-t">${esc(p.categories?.name || '')}${p.is_featured ? ' · Featured' : ''}</div></td><td>${money(p.price)}</td><td>${p.stock}${p.is_sold_out ? ' <span class="tag bad">Sold out</span>' : ''}</td><td><span class="tag ${p.status === 'published' ? 'ok' : 'warn'}">${p.status}</span></td>
      <td><div class="row"><a class="btn sm alt" href="#/admin/product/${p.id}">Edit</a><button class="btn sm alt" data-act="pubtoggle" data-id="${p.id}" data-v="${p.status}">${p.status === 'published' ? 'Unpublish' : 'Publish'}</button><button class="btn sm bad" data-act="delprod" data-id="${p.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="6">No products yet. Tap Add Product.</td></tr>'}</table></div>`);
  }
  if (t === 'product') return adminProductForm(parts[2]);
  if (t === 'orders') return adminOrders(q);
  if (t === 'order') return adminOrder(parts[2]);
  if (t === 'comments') return adminComments(q);
  if (t === 'profit') {
    const { data: d, error } = await sb.rpc('admin_profit_report'); if (error) throw error;
    return admShell('profit', `<p class="msg info">Private: only you can see these figures.</p><div class="stats"><div class="stat"><b>${money(d.inventory_purchase_cost)}</b>Purchase cost of stock on hand</div><div class="stat"><b>${money(d.sales_total)}</b>Order totals (excl. cancelled)</div><div class="stat"><b>${money(d.estimated_profit)}</b>Estimated profit on items sold</div></div>
    <div class="panel scroll" style="margin-top:14px"><table class="t"><tr><th>Product</th><th>Selling</th><th>Cost</th><th>Profit/unit</th><th>Sold</th><th>Revenue</th><th>Profit</th></tr>${d.products.map(p => `<tr><td>${esc(p.name)}</td><td>${money(p.selling_price)}</td><td>${p.purchase_cost == null ? '—' : money(p.purchase_cost)}</td><td>${p.profit_per_unit == null ? '—' : money(p.profit_per_unit)}</td><td>${p.units_sold}</td><td>${money(p.revenue)}</td><td>${p.profit_realised == null ? '—' : money(p.profit_realised)}</td></tr>`).join('') || '<tr><td colspan="7">No products yet.</td></tr>'}</table></div>`);
  }
  if (t === 'settings') return adminSettings();
  shell(empty('Not found', 'That admin page does not exist.', '<a class="btn" href="#/admin">Dashboard</a>'));
}

async function adminProductForm(id) {
  const isNew = id === 'new'; const [{ data: cats }, pr, cost] = await Promise.all([sb.from('categories').select('id,name').order('sort_order'),
    isNew ? { data: null } : sb.from('products').select('*, product_images(*)').eq('id', id).maybeSingle(), isNew ? { data: null } : sb.from('product_costs').select('purchase_cost').eq('product_id', id).maybeSingle()]);
  const p = pr.data || { status: 'draft', condition: 'new', stock: 0, delivery_fee: 0, delivery_days_min: 1, delivery_days_max: 5, specifications: {}, product_images: [] };
  if (!isNew && !pr.data) return admShell('products', empty('Product not found', '', '<a class="btn" href="#/admin/products">Back</a>'));
  const v = x => esc(p[x] ?? '');
  admShell('products', `<div class="panel"><h3>${isNew ? 'Add product' : 'Edit product'}</h3><div id="err"></div>
  <form data-form="product" data-id="${isNew ? '' : id}" class="frm c2">
  <div class="span"><label>Product name *</label><input name="name" required maxlength="200" value="${v('name')}"></div>
  <div class="span"><label>Short description</label><input name="short_description" maxlength="160" value="${v('short_description')}"></div>
  <div class="span"><label>Full description</label><textarea name="description" rows="5">${v('description')}</textarea></div>
  <div><label>Category</label><select name="category_id"><option value="">— none —</option>${(cats || []).map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
  <div><label>Condition</label><select name="condition">${opt({ new: 'New', used: 'Used', refurbished: 'Refurbished' }, p.condition)}</select></div>
  <div><label>Selling price (GH₵) *</label><input name="price" type="number" step="0.01" min="0" required value="${v('price')}"></div>
  <div><label>Discount price (optional)</label><input name="discount_price" type="number" step="0.01" min="0" value="${v('discount_price')}"></div>
  <div><label>Purchase cost — private</label><input name="cost" type="number" step="0.01" min="0" value="${esc(cost.data?.purchase_cost ?? '')}"></div>
  <div><label>Stock quantity</label><input name="stock" type="number" min="0" step="1" value="${v('stock')}"></div>
  <div><label>SKU</label><input name="sku" value="${v('sku')}"></div><div><label>Location</label><input name="location" value="${v('location')}"></div>
  <div><label>Delivery fee (GH₵)</label><input name="delivery_fee" type="number" step="0.01" min="0" value="${v('delivery_fee')}"></div>
  <div class="row"><div style="flex:1"><label>Delivery days (min)</label><input name="delivery_days_min" type="number" min="0" value="${v('delivery_days_min')}"></div><div style="flex:1"><label>Delivery days (max)</label><input name="delivery_days_max" type="number" min="0" value="${v('delivery_days_max')}"></div></div>
  <div class="span"><label>Specifications (one per line, “Name: value”)</label><textarea name="specs" rows="4">${esc(Object.entries(p.specifications || {}).map(([k, x]) => k + ': ' + x).join('\n'))}</textarea></div>
  <div><label>Publication status</label><select name="status">${opt({ draft: 'Draft', published: 'Published', unpublished: 'Unpublished' }, p.status)}</select></div>
  <div><label><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''}> Featured product</label><label><input type="checkbox" name="is_sold_out" ${p.is_sold_out ? 'checked' : ''}> Mark as sold out</label></div>
  <div class="span"><label>Add images (JPG, PNG, WebP; max 5 MB each)</label><input type="file" name="files" accept="image/*" multiple></div>
  <div class="span row"><button class="btn" id="psave">Save product</button><a class="btn alt" href="#/admin/products">Cancel</a></div></form>
  ${p.product_images.length ? `<h3>Images</h3><div class="imgs">${imgs(p).map(i => `<figure><img src="${esc(i.url)}" alt=""><div class="row"><button class="btn sm alt" data-act="imgprimary" data-id="${i.id}" data-v="${p.id}">${i.is_primary ? '★ Main' : 'Make main'}</button><button class="btn sm bad" data-act="imgdel" data-id="${i.id}">✕</button></div></figure>`).join('')}</div>` : ''}</div>`);
}

async function adminOrders(q) {
  const f = { q: q.get('q') || '', status: q.get('status') || '', pay: q.get('pay') || '', from: q.get('from') || '', to: q.get('to') || '' };
  let r = sb.from('orders').select('*, order_items(product_name,quantity,unit_price)').order('created_at', { ascending: false }).limit(500);
  if (f.q) { const x = clean(f.q); r = r.or(`order_number.ilike.%${x}%,customer_name.ilike.%${x}%,customer_email.ilike.%${x}%,customer_phone.ilike.%${x}%`); }
  if (f.status) r = r.eq('status', f.status); if (f.pay) r = r.eq('payment_status', f.pay);
  if (f.from) r = r.gte('created_at', f.from); if (f.to) r = r.lte('created_at', f.to + 'T23:59:59');
  const { data, error } = await r; if (error) throw error; window.__orders = data;
  admShell('orders', `<form class="panel row" data-form="admfilter" data-base="admin/orders"><input name="q" placeholder="Order no., name, email, phone" value="${esc(f.q)}" style="flex:2;min-width:180px">
  <select name="status" style="flex:1"><option value="">Any status</option>${opt(STATUS, f.status)}</select><select name="pay" style="flex:1"><option value="">Any payment</option>${opt(PAY, f.pay)}</select>
  <input type="date" name="from" value="${f.from}" style="flex:1" aria-label="From date"><input type="date" name="to" value="${f.to}" style="flex:1" aria-label="To date"><button class="btn sm">Filter</button><button type="button" class="btn alt sm" data-act="csv">Export CSV</button></form>
  <div class="panel scroll"><table class="t"><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th><th>Date</th><th></th></tr>${data.map(o => `<tr><td>${esc(o.order_number)}<div class="sm-t">${o.is_guest ? 'Guest' : 'Registered'}</div></td><td>${esc(o.customer_name)}<div class="sm-t">${esc(o.customer_phone)}</div></td><td>${money(o.total)}</td><td><span class="tag">${esc(STATUS[o.status])}</span></td><td>${esc(PAY[o.payment_status])}</td><td>${fdt(o.created_at)}</td><td><a class="btn sm" href="#/admin/order/${o.id}">Order Details</a></td></tr>`).join('') || '<tr><td colspan="7">No orders found.</td></tr>'}</table></div>`);
}
async function adminOrder(id) {
  const [{ data: o, error }, h, n, pay] = await Promise.all([sb.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle(), sb.from('order_status_history').select('*').eq('order_id', id).order('created_at'),
    sb.from('order_notes').select('*').eq('order_id', id).order('created_at'), sb.from('payment_records').select('*').eq('order_id', id).order('created_at')]);
  if (error) throw error; if (!o) return admShell('orders', empty('Order not found', '', '<a class="btn" href="#/admin/orders">Back</a>'));
  const wa = waNum(o.customer_phone);
  admShell('orders', `<a href="#/admin/orders">‹ All orders</a><div class="two w" style="margin-top:8px"><div class="panel"><h3>Order ${esc(o.order_number)}</h3>
  <p>${o.is_guest ? '<span class="tag">Guest order</span>' : `<span class="tag ok">Registered customer</span> <span class="sm-t">ID ${esc(o.user_id)}</span>`}</p>
  <p><b>${esc(o.customer_name)}</b><br>${esc(o.customer_email)}<br>${esc(o.customer_phone)}</p>
  <p>${esc([o.area, o.city, o.region, o.country].filter(Boolean).join(', '))}<br>${esc(o.address)}${o.landmark ? `<br>Landmark: ${esc(o.landmark)}` : ''}</p>
  ${o.delivery_instructions ? `<p><b>Instructions:</b> ${esc(o.delivery_instructions)}</p>` : ''}${o.seller_message ? `<p><b>Message:</b> ${esc(o.seller_message)}</p>` : ''}
  <p class="sm-t">Ordered ${fdt(o.created_at)} · Requested delivery: ${fdate(o.requested_delivery_date)} · Estimated: ${fdate(o.estimated_delivery_start)} – ${fdate(o.estimated_delivery_end)} · ${esc(o.delivery_method)}</p>
  <div class="row"><a class="btn sm" href="tel:${esc(o.customer_phone)}">Call</a><a class="btn sm alt" href="https://wa.me/${wa}">WhatsApp</a><a class="btn sm alt" href="mailto:${esc(o.customer_email)}">Email</a></div>
  ${o.order_items.map(i => `<div class="line">${imgTag(i.product_image, i.product_name)}<div class="g"><b>${esc(i.product_name)}</b><div class="sm-t">${i.quantity} × ${money(i.unit_price)}</div></div><b>${money(i.line_total)}</b></div>`).join('')}
  <table class="sum" style="width:100%"><tr><td>Subtotal</td><td>${money(o.subtotal)}</td></tr><tr><td>Delivery</td><td>${money(o.delivery_fee)}</td></tr><tr class="tot"><td>Total</td><td>${money(o.total)}</td></tr></table>
  <p>Payment: ${esc(PM[o.payment_method])} · <span class="tag">${esc(PAY[o.payment_status])}</span></p></div>
  <div><div class="panel"><h3>Update order</h3><div id="omsg"></div><form data-form="orderupd" data-id="${o.id}">
    <label>Status</label><select name="status">${opt(STATUS, o.status)}</select><label>Payment status</label><select name="pay">${opt(PAY, o.payment_status)}</select>
    <label>Estimated delivery from</label><input type="date" name="s" value="${o.estimated_delivery_start || ''}"><label>Estimated delivery to</label><input type="date" name="e" value="${o.estimated_delivery_end || ''}">
    <label>Update for customer (visible)</label><textarea name="note" rows="2"></textarea><label>Internal note (private)</label><textarea name="inote" rows="2"></textarea><button class="btn full" style="margin-top:12px">Save changes</button></form></div>
  <div class="panel"><h3>History</h3>${h.data.map(x => `<div class="cm"><b>${esc(STATUS[x.status] || x.status)}</b> <span class="sm-t">${fdt(x.created_at)}</span>${x.note ? `<div>${esc(x.note)}</div>` : ''}</div>`).join('')}
  ${n.data.length ? '<h3>Internal notes</h3>' + n.data.map(x => `<div class="cm">${esc(x.note)} <span class="sm-t">${fdt(x.created_at)}</span></div>`).join('') : ''}
  ${pay.data.length ? '<h3>Payments</h3>' + pay.data.map(x => `<div class="cm">${esc(PAY[x.status] || x.status)} · ${money(x.amount)} <span class="sm-t">${fdt(x.created_at)}</span></div>`).join('') : ''}</div></div></div>`);
}
async function adminComments(q) {
  const f = q.get('f') || '', pid = q.get('p') || '';
  let r = sb.from('product_comments').select('*, products(name), comment_replies(*)').order('created_at', { ascending: false }).limit(200);
  if (['pending', 'approved', 'hidden'].includes(f)) r = r.eq('status', f); if (pid) r = r.eq('product_id', pid);
  const [{ data, error }, { data: ps }] = await Promise.all([r, sb.from('products').select('id,name').order('name')]); if (error) throw error;
  const list = f === 'unanswered' ? data.filter(c => !c.comment_replies.length) : data;
  admShell('comments', `<form class="panel row" data-form="admfilter" data-base="admin/comments"><select name="f"><option value="">All</option>${opt({ pending: 'Pending approval', approved: 'Approved', hidden: 'Hidden', unanswered: 'Unanswered' }, f)}</select>
  <select name="p"><option value="">All products</option>${(ps || []).map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn sm">Filter</button></form>
  ${list.map(c => `<div class="panel"><div class="row sp"><b>${esc(c.display_name)}</b><span class="tag ${c.status === 'approved' ? 'ok' : 'warn'}">${c.status}</span></div>
  <div class="sm-t">On <a href="#/p/${c.product_id}">${esc(c.products?.name || '')}</a> · ${fdt(c.created_at)}${c.email ? ' · ' + esc(c.email) : ''}</div><p>${esc(c.message)}</p>
  ${c.comment_replies.map(x => `<div class="rp"><b>Reply:</b> ${esc(x.reply)}</div>`).join('')}
  <form data-form="reply" data-id="${c.id}" class="row" style="margin-top:8px"><input name="reply" placeholder="Write a reply" required style="flex:1;min-width:160px"><button class="btn sm">Reply</button></form>
  <div class="row" style="margin-top:8px"><button class="btn sm alt" data-act="cstat" data-id="${c.id}" data-v="approved">Approve</button><button class="btn sm alt" data-act="cstat" data-id="${c.id}" data-v="hidden">Hide</button><button class="btn sm bad" data-act="cdel" data-id="${c.id}">Delete spam</button></div></div>`).join('') || empty('No comments found', '', '')}`);
}
async function adminSettings() {
  const [{ data: s }, { data: cats }, { data: dl }] = await Promise.all([sb.from('business_settings').select('*'), sb.from('categories').select('*').order('sort_order'), sb.from('delivery_settings').select('*').order('created_at')]);
  const cur = Object.fromEntries((s || []).map(r => [r.key, r.value]));
  const keys = [['business_name', 'Business name'], ['tagline', 'Tagline'], ['contact_phone', 'Business phone'], ['whatsapp_number', 'WhatsApp number'], ['contact_email', 'Business email'], ['business_address', 'Business address'], ['payment_instructions', 'Payment instructions (shown to customers)'], ['delivery_notes', 'Delivery notes'], ['about', 'About the business']];
  admShell('settings', `<div class="panel"><h3>Business information</h3><div id="smsg"></div><form data-form="settings">${keys.map(([k, l]) => `<label>${l}</label><input name="${k}" value="${esc(cur[k] ?? '')}">`).join('')}<button class="btn" style="margin-top:12px">Save business info</button></form></div>
  <div class="panel"><h3>Categories</h3><div id="cmsg"></div>${(cats || []).map((c, i) => `<div class="row sp cm"><span>${esc(c.name)} ${c.is_active ? '' : '<span class="tag warn">Hidden</span>'}</span><span class="row"><button class="btn sm alt" data-act="catmove" data-id="${c.id}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn sm alt" data-act="catmove" data-id="${c.id}" data-v="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button class="btn sm alt" data-act="catren" data-id="${c.id}" data-v="${esc(c.name)}">Rename</button><button class="btn sm alt" data-act="cattog" data-id="${c.id}" data-v="${c.is_active}">${c.is_active ? 'Hide' : 'Show'}</button><button class="btn sm bad" data-act="catdel" data-id="${c.id}">Delete</button></span></div>`).join('')}
  <form data-form="catadd" class="row" style="margin-top:10px"><input name="name" placeholder="New category name" required style="flex:1"><input type="file" name="file" accept="image/*" style="flex:1"><button class="btn sm">Add category</button></form></div>
  <div class="panel"><h3>Delivery rules</h3><p class="sm-t">Rules apply by region or city. Leave area empty for a default rule. Without rules, each product’s own delivery fee is used.</p>${(dl || []).map(d => `<div class="row sp cm"><span>${esc(d.name)} · ${esc(d.method)} · ${esc(d.area || 'All areas')} · ${money(d.fee)} · ${d.days_min}–${d.days_max} days ${d.is_active ? '' : '<span class="tag warn">Off</span>'}</span><span class="row"><button class="btn sm alt" data-act="deltog" data-id="${d.id}" data-v="${d.is_active}">${d.is_active ? 'Turn off' : 'Turn on'}</button><button class="btn sm bad" data-act="deldel" data-id="${d.id}">Delete</button></span></div>`).join('')}
  <form data-form="deladd" class="frm c2" style="margin-top:10px"><div><label>Name</label><input name="name" required></div><div><label>Method</label><select name="method"><option value="delivery">Delivery</option><option value="pickup">Local pickup</option></select></div>
  <div><label>Region or city (optional)</label><input name="area"></div><div><label>Fee (GH₵)</label><input name="fee" type="number" min="0" step="0.01" value="0" required></div>
  <div><label>Days (min)</label><input name="min" type="number" min="0" value="1" required></div><div><label>Days (max)</label><input name="max" type="number" min="0" value="3" required></div><div class="span"><button class="btn sm">Add delivery rule</button></div></form></div>`);
}

/* ---------- actions ---------- */
const flash = (id, type, text) => { const e = $('#' + id); if (e) e.innerHTML = msgBox(type, text); };
const fail = (id, e) => flash(id, 'err', friendly(e));
async function uploadFiles(files, folder) {
  const out = [];
  for (const file of files) {
    if (!file.size) continue; if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MB.`);
    const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await sb.storage.from('product-images').upload(path, file, { contentType: file.type }); if (error) throw error;
    out.push({ path, url: sb.storage.from('product-images').getPublicUrl(path).data.publicUrl });
  }
  return out;
}
async function addToCart(id, qty) {
  const { data: p } = await sb.from('products').select('stock,is_sold_out,status').eq('id', id).maybeSingle();
  if (!p || p.status !== 'published' || p.is_sold_out || p.stock < 1) return toast('Sorry, this product is not available.');
  const c = cart(); const it = c.find(i => i.id === id);
  if (it) it.qty = Math.min(p.stock, it.qty + qty); else c.push({ id, qty: Math.min(qty, p.stock) });
  saveCart(c); toast('Added to cart'); route(true);
}
const actions = {
  guest() { try { sessionStorage.setItem('mgm_in', '1'); } catch { /* ignore */ } location.hash = '/'; },
  showpw(t) { const i = $('#pw'); i.type = i.type === 'password' ? 'text' : 'password'; t.textContent = i.type === 'password' ? 'Show' : 'Hide'; },
  regtoggle() { $('#regf').hidden = !$('#regf').hidden; },
  async forgot() { const em = $('#em').value.trim(); if (!em) return flash('amsg', 'err', 'Enter your email above first.');
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }); error ? fail('amsg', error) : flash('amsg', 'ok', 'If that email has an account, a reset link is on its way.'); },
  async logout() { await sb.auth.signOut(); try { sessionStorage.removeItem('mgm_in'); } catch { /* ignore */ } },
  add(t) { addToCart(t.dataset.id, +($('#q')?.textContent || 1)); },
  buy(t) { S.buy = [{ id: t.dataset.id, qty: +($('#q')?.textContent || 1) }]; S.idem = null; location.hash = '/checkout'; },
  qm() { const q = $('#q'); q.textContent = Math.max(1, +q.textContent - 1); },
  qp(t) { const q = $('#q'); q.textContent = Math.min(+t.dataset.max, +q.textContent + 1); },
  gal(t) { $('#bigimg').innerHTML = `<img src="${esc(t.dataset.v)}" alt="">`; document.querySelectorAll('.thumbs img').forEach(i => i.classList.toggle('on', i === t)); },
  async share(t) { const url = location.origin + location.pathname + '#/p/' + t.dataset.id; try { if (navigator.share) await navigator.share({ title: document.title, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch { /* cancelled */ } },
  async fav(t) {
    const id = t.dataset.id; const on = S.favs.has(id);
    if (!S.user) { on ? S.favs.delete(id) : S.favs.add(id); store.set('mgm_favs', [...S.favs]); toast(on ? 'Removed from favourites' : 'Saved to favourites on this device'); return route(true); }
    const { error } = on ? await sb.from('favorites').delete().eq('user_id', S.user.id).eq('product_id', id) : await sb.from('favorites').insert({ user_id: S.user.id, product_id: id });
    if (error) return toast(friendly(error)); on ? S.favs.delete(id) : S.favs.add(id); route(true);
  },
  cinc(t) { const c = cart(); const i = c.find(x => x.id === t.dataset.id); if (i) i.qty++; saveCart(c); route(true); },
  cdec(t) { const c = cart(); const i = c.find(x => x.id === t.dataset.id); if (i) i.qty = Math.max(1, i.qty - 1); saveCart(c); route(true); },
  crm(t) { saveCart(cart().filter(x => x.id !== t.dataset.id)); route(true); },
  async pubtoggle(t) { const { error } = await sb.from('products').update({ status: t.dataset.v === 'published' ? 'unpublished' : 'published' }).eq('id', t.dataset.id); error ? toast(friendly(error)) : route(true); },
  async delprod(t) {
    if (!confirm('Delete this product? Past orders keep their details.')) return;
    const { data: im } = await sb.from('product_images').select('storage_path').eq('product_id', t.dataset.id);
    const { error } = await sb.from('products').delete().eq('id', t.dataset.id); if (error) return toast(friendly(error));
    const paths = (im || []).map(i => i.storage_path).filter(Boolean); if (paths.length) await sb.storage.from('product-images').remove(paths); toast('Product deleted'); route(true);
  },
  async imgdel(t) { if (!confirm('Remove this image?')) return; const { data } = await sb.from('product_images').select('storage_path').eq('id', t.dataset.id).maybeSingle();
    const { error } = await sb.from('product_images').delete().eq('id', t.dataset.id); if (error) return toast(friendly(error)); if (data?.storage_path) await sb.storage.from('product-images').remove([data.storage_path]); route(true); },
  async imgprimary(t) { await sb.from('product_images').update({ is_primary: false }).eq('product_id', t.dataset.v); await sb.from('product_images').update({ is_primary: true }).eq('id', t.dataset.id); route(true); },
  csv() {
    const rows = [['Order', 'Date', 'Customer type', 'Name', 'Email', 'Phone', 'Country', 'Region', 'City', 'Area', 'Address', 'Items', 'Subtotal', 'Delivery fee', 'Total', 'Payment method', 'Payment status', 'Order status']];
    (window.__orders || []).forEach(o => rows.push([o.order_number, o.created_at, o.is_guest ? 'Guest' : 'Registered', o.customer_name, o.customer_email, o.customer_phone, o.country, o.region, o.city, o.area, o.address, o.order_items.map(i => `${i.product_name} x${i.quantity}`).join('; '), o.subtotal, o.delivery_fee, o.total, PM[o.payment_method], PAY[o.payment_status], STATUS[o.status]]));
    dl('mgm-orders.csv', rows.map(r => r.map(csvCell).join(',')).join('\n'));
  },
  async cstat(t) { const { error } = await sb.from('product_comments').update({ status: t.dataset.v }).eq('id', t.dataset.id); error ? toast(friendly(error)) : route(true); },
  async cdel(t) { if (!confirm('Delete this comment permanently?')) return; const { error } = await sb.from('product_comments').delete().eq('id', t.dataset.id); error ? toast(friendly(error)) : route(true); },
  async catmove(t) {
    const { data } = await sb.from('categories').select('id,sort_order').order('sort_order'); const i = data.findIndex(c => c.id === t.dataset.id), j = i + +t.dataset.v; if (j < 0 || j >= data.length) return;
    const arr = data.map(c => c.id); [arr[i], arr[j]] = [arr[j], arr[i]]; for (let k = 0; k < arr.length; k++) await sb.from('categories').update({ sort_order: k + 1 }).eq('id', arr[k]); route(true);
  },
  async catren(t) { const n = prompt('Category name', t.dataset.v); if (!n || n.trim().length < 2) return; const { error } = await sb.from('categories').update({ name: n.trim() }).eq('id', t.dataset.id); error ? toast(friendly(error)) : route(true); },
  async cattog(t) { await sb.from('categories').update({ is_active: t.dataset.v !== 'true' }).eq('id', t.dataset.id); route(true); },
  async catdel(t) {
    const { count } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('category_id', t.dataset.id);
    if (count > 0) return flash('cmsg', 'err', `This category has ${count} product(s). Hide it instead, or move the products first.`);
    if (!confirm('Delete this category?')) return; const { error } = await sb.from('categories').delete().eq('id', t.dataset.id); error ? toast(friendly(error)) : route(true);
  },
  async deltog(t) { await sb.from('delivery_settings').update({ is_active: t.dataset.v !== 'true' }).eq('id', t.dataset.id); route(true); },
  async deldel(t) { if (!confirm('Delete this delivery rule?')) return; await sb.from('delivery_settings').delete().eq('id', t.dataset.id); route(true); }
};
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 5);
const num = v => v === '' || v == null ? null : Number(v);
const forms = {
  search(f) { const q = new FormData(f).get('q'); location.hash = '/products?q=' + encodeURIComponent(q); },
  admfilter(f) { const p = new URLSearchParams(); new FormData(f).forEach((v, k) => v && p.set(k, v)); location.hash = '/' + f.dataset.base + (p.toString() ? '?' + p : ''); },
  async login(f) {
    const fd = Object.fromEntries(new FormData(f)); const b = $('#lbtn'); b.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: fd.email.trim(), password: fd.password }); b.disabled = false;
    if (error) return fail('amsg', { message: 'Login failed: ' + (friendly(error)) });
    try { sessionStorage.setItem('mgm_in', '1'); } catch { /* ignore */ }
  },
  async register(f) {
    const fd = Object.fromEntries(new FormData(f));
    const { data, error } = await sb.auth.signUp({ email: fd.email.trim(), password: fd.password, options: { data: { full_name: fd.name.trim() }, emailRedirectTo: location.origin + location.pathname } });
    if (error) return fail('amsg', error);
    if (data.session) { try { sessionStorage.setItem('mgm_in', '1'); } catch { /* ignore */ } } else flash('amsg', 'ok', 'Account created. Check your email to confirm it, then log in.');
  },
  async reset(f) { const { error } = await sb.auth.updateUser({ password: new FormData(f).get('password') }); error ? fail('amsg', error) : (flash('amsg', 'ok', 'Password updated.'), setTimeout(() => location.hash = '/', 1200)); },
  async comment(f) {
    const fd = Object.fromEntries(new FormData(f)); if (fd.website) return flash('cmsg', 'ok', 'Thank you! Your question will appear once approved.');
    const { error } = await sb.rpc('submit_comment', { p_product_id: f.dataset.id, p_name: fd.name, p_email: fd.email, p_message: fd.message });
    if (error) return fail('cmsg', error); f.reset(); flash('cmsg', 'ok', 'Thank you! Your question will appear once approved.');
  },
  async checkout(f) {
    const b = $('#place'); const fd = Object.fromEntries(new FormData(f)); const need = ['name', 'email', 'phone', 'country', 'region', 'city', 'address'];
    if (need.some(k => !String(fd[k] || '').trim())) { flash('err', 'err', 'Please fill in all required fields marked *.'); return; }
    b.disabled = true; b.textContent = 'Placing order…'; S.idem ||= crypto.randomUUID();
    const items = (S.buy || cart()).map(i => ({ product_id: i.id, quantity: i.qty }));
    const { data, error } = await sb.rpc('place_order', { p_payload: { idempotency_key: S.idem, payment_method: fd.payment_method, delivery_method: fd.delivery_method, items,
      customer: { name: fd.name, email: fd.email, phone: fd.phone, country: fd.country, region: fd.region, city: fd.city, area: fd.area, address: fd.address, landmark: fd.landmark, instructions: fd.instructions, message: fd.message, requested_delivery_date: fd.req } } });
    if (error || !data) { b.disabled = false; b.textContent = 'PLACE ORDER'; return fail('err', error || { message: 'The order could not be saved. Please try again.' }); }
    if (!S.buy) saveCart([]); S.buy = null; S.idem = null;
    store.set('mgm_orders', [{ n: data.order_number, t: data.tracking_token, at: data.created_at }, ...store.get('mgm_orders', [])].slice(0, 30));
    location.hash = `/order/${data.order_number}/${data.tracking_token}?new=1`;
  },
  track(f) { const fd = Object.fromEntries(new FormData(f)); location.hash = `/order/${encodeURIComponent(fd.n.trim().toUpperCase())}/${encodeURIComponent(fd.t.trim())}`; },
  async profile(f) { const fd = Object.fromEntries(new FormData(f)); const { error } = await sb.from('profiles').update(fd).eq('id', S.user.id); if (error) return fail('pmsg', error); await refreshUser(); flash('pmsg', 'ok', 'Profile saved.'); },
  async product(f) {
    const b = $('#psave'); b.disabled = true; const fd = new FormData(f); const g = k => fd.get(k);
    try {
      const specs = {}; String(g('specs') || '').split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) specs[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      const row = { name: g('name').trim(), short_description: g('short_description').trim() || null, description: g('description').trim(), category_id: g('category_id') || null, condition: g('condition'),
        price: num(g('price')), discount_price: num(g('discount_price')), stock: num(g('stock')) ?? 0, sku: g('sku').trim() || null, location: g('location').trim() || null,
        delivery_fee: num(g('delivery_fee')) ?? 0, delivery_days_min: num(g('delivery_days_min')) ?? 1, delivery_days_max: num(g('delivery_days_max')) ?? 5, specifications: specs,
        status: g('status'), is_featured: !!g('is_featured'), is_sold_out: !!g('is_sold_out') };
      let id = f.dataset.id;
      if (id) { const { error } = await sb.from('products').update(row).eq('id', id); if (error) throw error; }
      else { const { data, error } = await sb.from('products').insert(row).select('id').single(); if (error) throw error; id = data.id; }
      const cost = num(g('cost'));
      if (cost == null) await sb.from('product_costs').delete().eq('product_id', id); else { const { error } = await sb.from('product_costs').upsert({ product_id: id, purchase_cost: cost, updated_at: new Date().toISOString() }); if (error) throw error; }
      const files = fd.getAll('files').filter(x => x && x.size);
      if (files.length) {
        const ups = await uploadFiles(files, 'products/' + id); const { count } = await sb.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', id);
        const { error } = await sb.from('product_images').insert(ups.map((u, k) => ({ product_id: id, url: u.url, storage_path: u.path, sort_order: (count || 0) + k, is_primary: !count && k === 0 }))); if (error) throw error;
      }
      toast('Product saved'); location.hash = '/admin/products';
    } catch (e) { b.disabled = false; fail('err', e); }
  },
  async orderupd(f) {
    const fd = Object.fromEntries(new FormData(f));
    const { error } = await sb.rpc('admin_update_order', { p_order_id: f.dataset.id, p_status: fd.status, p_note: fd.note || null, p_internal_note: fd.inote || null, p_est_start: fd.s || null, p_est_end: fd.e || null, p_payment_status: fd.pay });
    error ? fail('omsg', error) : (toast('Order updated'), route(true));
  },
  async reply(f) { const { error } = await sb.from('comment_replies').insert({ comment_id: f.dataset.id, reply: new FormData(f).get('reply').trim(), created_by: S.user.id }); error ? toast(friendly(error)) : (toast('Reply saved'), route(true)); },
  async settings(f) {
    const rows = [...new FormData(f)].map(([key, value]) => ({ key, value: String(value).trim(), is_public: true, updated_at: new Date().toISOString() }));
    const { error } = await sb.from('business_settings').upsert(rows); if (error) return fail('smsg', error); await loadBase(); flash('smsg', 'ok', 'Business information saved.');
  },
  async catadd(f) {
    const fd = new FormData(f); const name = fd.get('name').trim(); const file = fd.get('file');
    try {
      const { data: last } = await sb.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      let image_url = null; if (file && file.size) image_url = (await uploadFiles([file], 'categories'))[0].url;
      const { error } = await sb.from('categories').insert({ name, slug: slug(name), image_url, sort_order: (last?.[0]?.sort_order || 0) + 1 }); if (error) throw error; await loadBase(); route(true);
    } catch (e) { fail('cmsg', e); }
  },
  async deladd(f) { const d = Object.fromEntries(new FormData(f)); const { error } = await sb.from('delivery_settings').insert({ name: d.name, method: d.method, area: d.area.trim() || null, fee: +d.fee, days_min: +d.min, days_max: +d.max }); error ? toast(friendly(error)) : (await loadBase(), route(true)); }
};
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t) return; const fn = actions[t.dataset.act]; if (fn) { if (t.tagName === 'A' && t.dataset.act !== 'guest') return; if (t.dataset.act !== 'guest') e.preventDefault(); Promise.resolve(fn(t, e)).catch(err => toast(friendly(err))); } });
document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); const fn = forms[f.dataset.form]; if (fn) Promise.resolve(fn(f)).catch(err => toast(friendly(err))); });
document.addEventListener('input', e => { if (e.target.closest('[data-form=checkout]')) { const b = $('#sumbox'); if (b) b.innerHTML = sumHtml(); } });

/* ---------- contact ---------- */
const contactHtml = () => {
  const ph = setting('contact_phone'), wa = waNum(setting('whatsapp_number')), em = setting('contact_email'), ad = setting('business_address');
  const rows = [ph && `<a class="btn" href="tel:${esc(ph)}">Call ${esc(ph)}</a>`, wa && `<a class="btn alt" href="https://wa.me/${wa}">WhatsApp</a>`, em && `<a class="btn alt" href="mailto:${esc(em)}">Email ${esc(em)}</a>`].filter(Boolean);
  return `<div class="panel" style="max-width:560px"><h2>Contact MGM (MG MARKET)</h2>${rows.length ? `<div class="row">${rows.join('')}</div>` : '<p>The seller has not added contact details yet. You can ask a question on any product page.</p>'}${ad ? `<p class="sm-t">${esc(ad)}</p>` : ''}<a class="btn alt" href="#/products" style="margin-top:10px">Browse products</a></div>`;
};

/* ---------- router ---------- */
let seq = 0;
const loadingHtml = '<div class="loading" role="status"><span class="spin"></span> Loading…</div>';
const configNotice = () => `<div class="msg err" role="alert"><b>Store not connected yet.</b> ${INIT_ERR === 'lib' ? 'The Supabase library could not be loaded. Check your internet connection and reload.' : INIT_ERR === 'init' ? 'The Supabase connection could not start. Check the settings in assets/js/config.js.' : 'The site owner must add the Supabase project URL and publishable key in <code>assets/js/config.js</code>.'} Products, orders and accounts work once this is done.</div>`;
const ready = () => { window.__mgmReady = true; };
async function route(soft) {
  const my = ++seq; keepScroll = soft === true;
  const h = (location.hash.slice(1) || '/'); const [path, qs] = h.split('?'); const q = new URLSearchParams(qs || ''); const parts = path.split('/').filter(Boolean).map(decodeURIComponent); const v = parts[0] || '';
  if (!entered() && !S.user && !['login', 'order', 'track', 'reset', 'contact'].includes(v)) return void (location.hash = '/login');
  if (v === 'login') { if (S.user) return void (location.hash = '/'); vWelcome(q); return ready(); }
  if (!sb) { shell(v === 'contact' ? contactHtml() : empty('No products available yet. Please check back soon.', 'The store is not connected to its database yet.', '<a class="btn" href="#/contact">Contact Us</a>')); return ready(); }
  if (!soft) shell(loadingHtml);
  try {
    const views = { '': () => vHome(), categories: () => vCategories(), products: () => vProducts(q), p: () => vProduct(parts[1]), cart: () => vCart(), checkout: () => vCheckout(), order: () => vOrder(parts[1], parts[2], q), track: () => vTrack(), orders: () => vOrders(), favorites: () => vFavorites(), questions: () => vQuestions(), contact: () => shell(contactHtml()), account: () => vAccount(), reset: () => vReset(), admin: () => vAdmin(parts, q) };
    if (!views[v]) shell(empty('Page not found', 'That page does not exist.')); else await views[v]();
  } catch (err) { if (my === seq) shell(`<div class="empty"><h3>We couldn’t load this page</h3><p>${esc(friendly(err))}</p><button class="btn" data-act="retry">Retry</button> <a class="btn alt" href="#/">Home</a></div>`); }
  ready();
}
actions.retry = () => route();
window.addEventListener('hashchange', () => route());
(async function init() {
  if (entered() && !location.hash.startsWith('#/login')) shell(loadingHtml);
  if (sb) {
    try { await Promise.all([loadBase(), refreshUser()]); } catch (e) { console.error(e); }
    sb.auth.onAuthStateChange(ev => { if (ev === 'INITIAL_SESSION') return; setTimeout(async () => {
      try { await refreshUser(); } catch (e) { console.error(e); }
      if (ev === 'PASSWORD_RECOVERY') location.hash = '/reset';
      else if (ev === 'SIGNED_OUT') { location.hash = '/login'; route(); }
      else if (ev === 'SIGNED_IN') { if (location.hash.startsWith('#/login') || !location.hash) location.hash = S.isAdmin && location.hash.includes('admin=1') ? '/admin' : '/'; else route(); } }, 0); });
  }
  route();
})();
})();
