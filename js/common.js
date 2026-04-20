/* ============================================================
   FURNI. — common.js  (runs on EVERY page)
   Cart · Search Overlay · WhatsApp Order · Toast
   ============================================================ */

const WHATSAPP_NUMBER = '919373828887'; // +91 9373828887

/* ── GOOGLE SHEETS CONFIG ─────────────────────────────────────────
   Your sheet columns: id | name | price | oldPrice | badge | category | active
   PLUS two optional sheets tabs:
     "offers"  columns: title | subtitle | tag | btnText | btnLink | active
   HOW TO USE:
   - Edit prices/names/badges in your Google Sheet → save → site updates on next load
   - Add new products (any id not in PRODUCT_CATALOGUE gets added dynamically)
   - Set active=FALSE to hide a product
   - Add an "offers" tab to control hero section from the sheet
──────────────────────────────────────────────────────────────────── */

const SHEETS_CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS0NzmiG46VAjp3grwXQXe5INN26Qm9Qvc95ySDoVqAnU6AUYXiT-Vgi--AbZzSNjzOVlv2GgVs5UvB/pub?gid=1145689079&single=true&output=csv'; // paste your products sheet CSV URL here when ready
// For the offers tab: File→Publish→choose "offers" sheet→CSV and paste URL here
const OFFERS_CSV_URL   = ''; // paste your offers sheet CSV URL here when ready

/* ── CSV PARSER ── */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/); // FIX: handle \r\n (Windows/Google Sheets line endings)
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').replace(/^"|"$/g, ''); });
    return obj;
  });
}

/* ── ORIGINAL CATALOGUE SNAPSHOT ─────────────────────────────────
   Take a deep snapshot of every built-in product's overridable fields
   BEFORE any sheet data is applied. This lets fetchSheetData() reset
   each product to its hardcoded defaults first, then apply only the
   fields the sheet actually provides — so removing a value from the
   sheet correctly clears it rather than leaving a stale value behind.
──────────────────────────────────────────────────────────────────── */
const _CATALOGUE_DEFAULTS = {};
function _snapshotDefaults() {
  PRODUCT_CATALOGUE.forEach(p => {
    _CATALOGUE_DEFAULTS[p.id] = {
      name:     p.name,
      price:    p.price,
      oldPrice: p.oldPrice ?? null,
      badge:    p.badge    ?? null,
      category: p.category,
      active:   p.active   ?? true,
      imgs:     [...p.imgs],
    };
  });
}
/* ── SINGLE FETCH PROMISE ─────────────────────────────────────────
   Shared by every caller (common.js, shop.js, etc.) on the same page
   load. The promise is kept alive for the lifetime of the page so that
   any late caller gets the same resolved result — never triggers a
   second fetch and never leaves stale fromSheet products behind.
──────────────────────────────────────────────────────────────────── */
let _sheetFetchPromise = null;

/* ── FETCH SHEET DATA ──
   - Clears any sheet-added products from a previous fetch FIRST
   - Resets existing products to their hardcoded defaults
   - Then applies only the fields present in the sheet row
   - Adds brand-new products from the sheet (id not in PRODUCT_CATALOGUE)
   - Reads offers tab if OFFERS_CSV_URL is set
   - Returns { productsChanged, offers[] }
*/
async function fetchSheetData() {
  // Always return the same promise — one fetch per page load, period.
  // Do NOT clear _sheetFetchPromise after resolve; late callers (shop.js)
  // must reuse it or they trigger a second fetch on a half-applied catalogue.
  if (_sheetFetchPromise) return _sheetFetchPromise;

  _sheetFetchPromise = (async () => {
    const result = { productsChanged: false, offers: [] };
    if (!SHEETS_CSV_URL) return result;

    // Safe cache-buster — handles URLs with or without existing query params
    function bustCache(url) {
      const sep = url.includes('?') ? '&' : '?';
      return url + sep + 't=' + Date.now();
    }

    // ── Step 1: Remove any fromSheet products BEFORE the fetch ──
    // Doing this first means the catalogue is always clean even if the
    // network request fails — no stale sheet-only products ever linger.
    for (let i = PRODUCT_CATALOGUE.length - 1; i >= 0; i--) {
      if (PRODUCT_CATALOGUE[i].fromSheet) {
        PRODUCT_CATALOGUE.splice(i, 1);
        result.productsChanged = true;
      }
    }

    // ── Step 2: Reset all built-in products to their hardcoded defaults ──
    // Ensures fields removed from the sheet are properly cleared.
    PRODUCT_CATALOGUE.forEach(p => {
      const def = _CATALOGUE_DEFAULTS[p.id];
      if (!def) return;
      p.name     = def.name;
      p.price    = def.price;
      p.oldPrice = def.oldPrice;
      p.badge    = def.badge;
      p.category = def.category;
      p.active   = def.active;
      p.imgs     = [...def.imgs];
    });

    try {
      // Force fresh data — bypass browser cache completely
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(bustCache(SHEETS_CSV_URL), {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (!res.ok) return result;

      const rows = parseCSV(await res.text());
      if (!rows.length) return result;

      // ── Step 3: Apply sheet rows ──
      rows.forEach(row => {
        if (!row.id) return;
        const id = Number(row.id);
        let prod = PRODUCT_CATALOGUE.find(p => p.id === id);

        // ── NEW PRODUCT from sheet ──
        if (!prod) {
          if (!row.name || !row.price) return; // need at least name + price
          prod = {
            id,
            name:     row.name,
            price:    Number(row.price),
            oldPrice: row.oldPrice ? Number(row.oldPrice) : null,
            badge:    row.badge    || null,
            category: (row.category || 'chairs').toLowerCase(),
            rating:   (row.rating  !== undefined && row.rating  !== '') ? Number(row.rating)  : 4,
            reviews:  (row.reviews !== undefined && row.reviews !== '') ? Number(row.reviews) : 0,
            imgs:     row.img ? [row.img] : ['img1_transparent.png'],
            desc:     row.desc || '',
            specs:    {},
            colors:   [],
            active:   row.active ? row.active.toUpperCase() !== 'FALSE' : true,
            fromSheet: true
          };
          PRODUCT_CATALOGUE.push(prod);
          result.productsChanged = true;
          return;
        }

        // ── UPDATE EXISTING PRODUCT — apply only non-empty sheet values ──
        if (row.name     && row.name !== '' && row.name !== prod.name)         { prod.name     = row.name;                                    result.productsChanged = true; }
        if (row.price    && row.price !== '') {
          const newPrice = Number(row.price);
          if (prod.price !== newPrice)                                          { prod.price    = newPrice;                                    result.productsChanged = true; }
        }
        // oldPrice: empty string means "clear it"; present value means "set it"
        if (row.oldPrice !== undefined) {
          const newOld = row.oldPrice ? Number(row.oldPrice) : null;
          if (prod.oldPrice !== newOld)                                         { prod.oldPrice = newOld;                                      result.productsChanged = true; }
        }
        // badge: empty string means "clear it"
        if (row.badge !== undefined) {
          const newBadge = row.badge || null;
          if (prod.badge !== newBadge)                                          { prod.badge    = newBadge;                                    result.productsChanged = true; }
        }
        if (row.active !== undefined && row.active !== '') {
          const newActive = row.active.toUpperCase() !== 'FALSE';
          if (prod.active !== newActive)                                        { prod.active   = newActive;                                   result.productsChanged = true; }
        }
        if (row.category && row.category !== '' && row.category.toLowerCase() !== prod.category) { prod.category = row.category.toLowerCase(); result.productsChanged = true; }
        if (row.img      && row.img !== '' && row.img !== prod.imgs[0])        { prod.imgs     = [row.img, ...prod.imgs.slice(1)];             result.productsChanged = true; }
      });

      console.log('✅ Products loaded from Sheet:', rows.length, 'rows');
    } catch(e) {
      console.warn('⚠ Products sheet failed:', e.message);
    }

    // ── OFFERS SHEET ──
    if (OFFERS_CSV_URL) {
      try {
        const res2 = await fetch(bustCache(OFFERS_CSV_URL), { cache: 'no-store' });
        if (res2.ok) {
          const offerRows = parseCSV(await res2.text());
          result.offers = offerRows.filter(r => r.active && r.active.toUpperCase() !== 'FALSE');
          console.log('✅ Offers loaded:', result.offers.length);
        }
      } catch(e) {
        console.warn('⚠ Offers sheet failed:', e.message);
      }
    }

    return result;
  })();

  // NOTE: _sheetFetchPromise is intentionally NOT cleared after resolve.
  // Any late caller (shop.js, etc.) reuses this same resolved promise —
  // no second fetch, no double-apply, no stale fromSheet products.
  return _sheetFetchPromise;
}

/* backward-compat alias used by shop.js */
async function fetchSheetPrices() {
  const r = await fetchSheetData();
  return r.productsChanged;
}


/* ── PRODUCT CATALOGUE (shared across all pages) ─────────── */
const PRODUCT_CATALOGUE = [
  { id:1,  name:'Velvet Emerald Sofa',   price:1299, category:'sofas',   rating:5,   reviews:42, badge:'New',    isNew:true,
    imgs:['img1_transparent.png','img6.jpg','img15.jpg'],
    desc:'Sink into luxury with this stunning emerald velvet sofa. Handcrafted with a solid hardwood frame and high-density foam cushions, it delivers both timeless style and all-day comfort.',
    specs:{ Material:'Velvet + Hardwood', Dimensions:'220×85×80 cm', Seating:'3-seater', Warranty:'2 years', Assembly:'Required', Weight:'42 kg' } },
  { id:2,  name:'Nordic Accent Chair',   price:449,  category:'chairs',  rating:4,   reviews:28,
    imgs:['img2_transparent.png','img5.jpg','img9.jpg'],
    desc:'Minimalist Scandinavian design meets everyday comfort. The Nordic Accent Chair features a solid oak frame and premium fabric upholstery.',
    specs:{ Material:'Oak + Fabric', Dimensions:'65×75×82 cm', Style:'Scandinavian', Warranty:'1 year', Assembly:'15 min', Weight:'14 kg' } },
  { id:3,  name:'Kruzo Aero Chair',      price:699,  oldPrice:899, category:'chairs', rating:4.5, reviews:61, badge:'Sale', isSale:true,
    imgs:['img3_transparent.png','img7.jpg','img8.jpg'],
    desc:'The Kruzo Aero Chair combines ergonomic design with bold modern aesthetics. Breathable mesh back support and adjustable lumbar.',
    specs:{ Material:'Steel + Mesh', Dimensions:'60×60×90–100 cm', Adjustable:'Yes', Warranty:'3 years', Assembly:'Tools included', Weight:'18 kg' } },
  { id:4,  name:'Ergonomic Chair',       price:389,  category:'chairs',  rating:5,   reviews:95,
    imgs:['img4_transparent.png','img11.jpg','img13.jpg'],
    desc:'Designed for long hours of comfort. Full lumbar support, adjustable armrests, and a breathable cushion seat.',
    specs:{ Material:'Steel + PU Leather', Dimensions:'62×62×92–105 cm', Armrests:'Adjustable', Warranty:'2 years', Assembly:'Required', Weight:'16 kg' } },
  { id:5,  name:'Teal Tufted Armchair',  price:559,  category:'chairs',  rating:5,   reviews:34, badge:'New', isNew:true,
    imgs:['img18_transparent.png','img17.jpg','img16.jpg'],
    desc:'A bold statement piece. Button-tufted velvet upholstery sits on solid wood legs with a refined gold finish.',
    specs:{ Material:'Velvet + Solid Wood', Dimensions:'76×78×86 cm', Style:'Contemporary', Warranty:'2 years', Assembly:'Minimal', Weight:'19 kg' } },
  { id:6,  name:'Wooden Bar Stool',      price:189,  category:'stools',  rating:4,   reviews:47,
    imgs:['img8.jpg','img9.jpg','img10.jpg'],
    desc:'Crafted from solid acacia wood with a warm natural finish. Sturdy, stackable, and beautiful.',
    specs:{ Material:'Acacia Wood', Height:'75 cm', Seat:'Round 35 cm', Warranty:'1 year', Assembly:'None', Weight:'6 kg' } },
  { id:7,  name:'Walnut Round Stool',    price:149,  category:'stools',  rating:5,   reviews:22,
    imgs:['img9.jpg','img8.jpg','img10.jpg'],
    desc:'A versatile walnut-finish stool that works as a side table, footrest, or extra seat.',
    specs:{ Material:'MDF + Walnut Veneer', Dimensions:'Ø40×45 cm', Use:'Multi-purpose', Warranty:'1 year', Assembly:'None', Weight:'5 kg' } },
  { id:8,  name:'Hairpin Side Table',    price:229,  oldPrice:299, category:'tables', rating:4, reviews:38, badge:'Sale', isSale:true,
    imgs:['img10.jpg','img9.jpg','img11.jpg'],
    desc:'Industrial hairpin legs meet a sleek marble-effect top. Lightweight yet sturdy.',
    specs:{ Material:'MDF + Steel', Dimensions:'Ø45×55 cm', Top:'Marble effect', Warranty:'1 year', Assembly:'Easy', Weight:'7 kg' } },
  { id:9,  name:'Blue Velvet Loveseat',  price:879,  category:'sofas',   rating:4,   reviews:19,
    imgs:['img13.jpg','img15.jpg','img16.jpg'],
    desc:'Compact yet luxurious. Deep blue velvet upholstery over a solid pine frame — classic and contemporary.',
    specs:{ Material:'Velvet + Pine', Dimensions:'145×80×78 cm', Seating:'2-seater', Warranty:'2 years', Assembly:'Required', Weight:'28 kg' } },
  { id:10, name:'Grey Channel Sofa',     price:1599, category:'sofas',   rating:5,   reviews:53, badge:'Premium', isPremium:true,
    imgs:['img15.jpg','img16.jpg','img17.jpg'],
    desc:'Deep channel-tufted cushions, feather-blend filling, and stainless steel feet. A premium centrepiece.',
    specs:{ Material:'Linen + Feather Fill', Dimensions:'240×90×82 cm', Seating:'4-seater', Warranty:'3 years', Assembly:'White Glove', Weight:'58 kg' } },
  { id:11, name:'Mustard Lounge Chair',  price:499,  category:'chairs',  rating:5,   reviews:31,
    imgs:['img12.png','img4_transparent.png','img2_transparent.png'],
    desc:'Add a pop of sunny warmth. Deeply cushioned and wide — the ideal reading chair. Solid walnut legs.',
    specs:{ Material:'Fabric + Walnut Legs', Dimensions:'80×82×85 cm', Style:'Mid-century', Warranty:'2 years', Assembly:'Minimal', Weight:'22 kg' } },
  { id:12, name:'Retro Living Set',      price:2299, category:'sofas',   rating:5,   reviews:17, badge:'Bundle',
    imgs:['img16.jpg','img15.jpg','img17.jpg'],
    desc:'Includes a 3-seater sofa, one armchair, and a matching coffee table. 1960s design with a modern finish.',
    specs:{ Includes:'Sofa + Chair + Table', Material:'Boucle + Teak', Warranty:'2 years', Assembly:'Included service', Weight:'95 kg total' } },
];

/* Snapshot defaults NOW — PRODUCT_CATALOGUE is fully defined above */
_snapshotDefaults();

/* helper: resolve image path from any page */
function resolveImg(filename) {
  const isInPages = window.location.pathname.includes('/pages/');
  return isInPages ? '../' + filename : filename;
}

/* ── CART (localStorage) ──────────────────────────────────── */
function getCart()        { return JSON.parse(localStorage.getItem('furni_cart') || '[]'); }
function saveCart(cart)   { localStorage.setItem('furni_cart', JSON.stringify(cart)); updateCartBadge(); }
function addToCart(item)  {
  const cart = getCart();
  const ex   = cart.find(c => c.name === item.name);
  if (ex) ex.qty += 1; else cart.push({ ...item, qty: 1 });
  saveCart(cart);
}
function removeFromCart(name) {
  saveCart(getCart().filter(c => c.name !== name));
}
function changeQty(name, delta) {
  const cart = getCart();
  const item = cart.find(c => c.name === name);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(cart);
}
function updateCartBadge() {
  const total = getCart().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = total;
    el.style.display = total > 0 ? 'flex' : 'none';
  });
}

/* ── TOAST ────────────────────────────────────────────────── */
function showToast(msg, icon = '✓') {
  let t = document.getElementById('furni-toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'furni-toast';
    t.style.cssText = `position:fixed;bottom:2rem;right:2rem;background:#1e4035;color:#fff;
      padding:.85rem 1.5rem;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:.9rem;
      box-shadow:0 4px 24px rgba(0,0,0,.25);z-index:99999;transform:translateY(80px);
      opacity:0;transition:all .3s ease;`;
    document.body.appendChild(t);
  }
  t.textContent = `${icon} ${msg}`;
  t.style.transform = 'translateY(0)'; t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.transform = 'translateY(80px)'; t.style.opacity = '0'; }, 2800);
}

/* ── CART DRAWER ──────────────────────────────────────────── */
function buildCartDrawer() {
  if (document.getElementById('cartDrawer')) return;
  const drawer = document.createElement('div'); drawer.id = 'cartDrawer';
  drawer.innerHTML = `
    <div id="cartBackdrop"></div>
    <div id="cartPanel">
      <div class="cart-panel-head">
        <h3>Your Cart</h3>
        <button id="cartClose">&#10005;</button>
      </div>
      <div id="cartItems"></div>
      <div id="cartFooter">
        <div id="cartTotal"></div>

        <!-- UPI Pay Now button -->
        <button id="upiPayBtn">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          Pay Now — UPI
        </button>

        <!-- Screenshot notice -->
        <div id="screenshotNotice">
          📸 <strong>After payment, take a screenshot of the confirmation and share it on WhatsApp to confirm your order.</strong>
        </div>

        <!-- WhatsApp order button -->
        <button id="whatsappOrderBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Send Order on WhatsApp
        </button>

        <button id="clearCartBtn">Clear Cart</button>
      </div>
    </div>`;
  document.body.appendChild(drawer);

  /* styles */
  const s = document.createElement('style');
  s.textContent = `
    #cartDrawer { position:fixed;inset:0;z-index:50000;pointer-events:none; }
    #cartDrawer.open { pointer-events:all; }
    #cartBackdrop { position:absolute;inset:0;background:rgba(0,0,0,.5);opacity:0;transition:opacity .3s;backdrop-filter:blur(2px); }
    #cartDrawer.open #cartBackdrop { opacity:1; }
    #cartPanel {
      position:absolute;right:0;top:0;bottom:0;width:360px;max-width:95vw;
      background:#fff;display:flex;flex-direction:column;
      transform:translateX(100%);transition:transform .35s cubic-bezier(.4,0,.2,1);
      box-shadow:-8px 0 40px rgba(0,0,0,.15);
    }
    #cartDrawer.open #cartPanel { transform:translateX(0); }
    .cart-panel-head {
      display:flex;justify-content:space-between;align-items:center;
      padding:1.4rem 1.5rem;border-bottom:1px solid #e0dbd2;
    }
    .cart-panel-head h3 { font-family:'Playfair Display',serif;font-size:1.2rem; }
    #cartClose { background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;padding:4px; }
    #cartItems { flex:1;overflow-y:auto;padding:1rem 1.5rem; }
    .cart-item {
      display:flex;gap:.9rem;align-items:center;
      padding:.85rem 0;border-bottom:1px solid #f0ece5;
    }
    .cart-item img { width:58px;height:58px;object-fit:contain;background:#f0ece5;border-radius:10px;padding:4px;flex-shrink:0; }
    .cart-item-info { flex:1;min-width:0; }
    .cart-item-name { font-size:.88rem;font-weight:500;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .cart-item-price { font-size:.82rem;color:#1e4035;font-weight:700;margin-top:2px; }
    .cart-item-qty { display:flex;align-items:center;gap:.4rem;margin-top:.4rem; }
    .qty-btn { width:24px;height:24px;border-radius:50%;border:1px solid #e0dbd2;background:#f7f4ef;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1a1a1a;transition:all .2s; }
    .qty-btn:hover { background:#1e4035;color:#fff;border-color:#1e4035; }
    .qty-num { font-size:.82rem;font-weight:600;color:#1a1a1a;min-width:20px;text-align:center; }
    .cart-item-del { background:none;border:none;color:#bbb;cursor:pointer;font-size:1rem;padding:4px;transition:color .2s; }
    .cart-item-del:hover { color:#c0392b; }
    .cart-empty { text-align:center;padding:3rem 1rem;color:#888; }
    .cart-empty svg { margin:0 auto 1rem;display:block;opacity:.25; }
    #cartFooter { padding:1.2rem 1.5rem;border-top:1px solid #e0dbd2;display:flex;flex-direction:column;gap:.75rem; }
    #cartTotal { font-size:.95rem;font-weight:600;color:#1a1a1a;display:flex;justify-content:space-between; }
    #upiPayBtn {
      background:linear-gradient(135deg,#6c3fc5,#a855f7);color:#fff;border:none;border-radius:50px;
      padding:.85rem 1.5rem;font-weight:700;font-size:.95rem;cursor:pointer;letter-spacing:.02em;
      display:flex;align-items:center;justify-content:center;gap:.6rem;
      transition:opacity .2s,transform .2s;font-family:'DM Sans',sans-serif;
      box-shadow:0 4px 16px rgba(108,63,197,.35);
    }
    #upiPayBtn:hover { opacity:.9;transform:translateY(-1px); }
    #screenshotNotice {
      background:linear-gradient(135deg,#fff8e1,#fff3cd);
      border:1.5px solid #f5c518;border-radius:12px;
      padding:.85rem 1rem;font-size:.82rem;color:#5a4000;line-height:1.55;
      text-align:center;
    }
    #screenshotNotice strong { color:#2d1a00;font-size:.88rem; }
    #whatsappOrderBtn {
      background:#25d366;color:#fff;border:none;border-radius:50px;
      padding:.8rem 1.5rem;font-weight:600;font-size:.9rem;cursor:pointer;
      display:flex;align-items:center;justify-content:center;gap:.6rem;
      transition:background .2s;font-family:'DM Sans',sans-serif;
    }
    #whatsappOrderBtn:hover { background:#128c7e; }
    #clearCartBtn { background:none;border:1px solid #e0dbd2;border-radius:50px;padding:.5rem;font-size:.8rem;color:#888;cursor:pointer;transition:all .2s; }
    #clearCartBtn:hover { border-color:#c0392b;color:#c0392b; }
  `;
  document.head.appendChild(s);

  document.getElementById('cartBackdrop').addEventListener('click', closeCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('upiPayBtn').addEventListener('click', openUpiPayment);
  document.getElementById('whatsappOrderBtn').addEventListener('click', sendWhatsAppOrder);
  document.getElementById('clearCartBtn').addEventListener('click', () => {
    saveCart([]); renderCartDrawer();
  });
}

function openCart()  { document.getElementById('cartDrawer').classList.add('open'); renderCartDrawer(); document.body.style.overflow='hidden'; }
function closeCart() { document.getElementById('cartDrawer').classList.remove('open'); document.body.style.overflow=''; }

function renderCartDrawer() {
  const cart = getCart();
  const itemsEl = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  const footerEl = document.getElementById('cartFooter');

  if (cart.length === 0) {
    itemsEl.innerHTML = `<div class="cart-empty">
      <svg width="52" height="52" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 29C12.7 29 13.3 28.4 13.3 27.7C13.3 27 12.7 26.3 12 26.3C11.3 26.3 10.7 26.9 10.7 27.7C10.7 28.4 11.3 29 12 29Z"/>
        <path d="M26.7 29C27.4 29 28 28.4 28 27.7C28 27 27.4 26.3 26.7 26.3C26 26.3 25.3 26.9 25.3 27.7C25.3 28.4 26 29 26.7 29Z"/>
        <path d="M1.3 1.3H6.7L10.2 19.2C10.4 19.8 10.7 20.4 11.2 20.7C11.7 21.1 12.3 21.3 12.9 21.3H25.9C26.5 21.3 27.1 21.1 27.6 20.7C28.1 20.4 28.4 19.8 28.5 19.2L30.7 8H8"/>
      </svg>
      <p>Your cart is empty</p>
    </div>`;
    footerEl.style.display = 'none';
    return;
  }

  footerEl.style.display = 'flex';
  const isInPages = window.location.pathname.includes('/pages/');
  const imgBase   = isInPages ? '../' : '';

  itemsEl.innerHTML = cart.map(item => {
    const prod = PRODUCT_CATALOGUE.find(p => p.name === item.name);
    const imgSrc = prod ? imgBase + prod.imgs[0] : '';
    return `
      <div class="cart-item" data-name="${item.name}">
        ${imgSrc ? `<img src="${imgSrc}" alt="${item.name}" />` : ''}
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₹${(parseFloat(item.price) * item.qty).toLocaleString()}</div>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" data-name="${item.name}">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-name="${item.name}">+</button>
          </div>
        </div>
        <button class="cart-item-del" data-name="${item.name}" title="Remove">✕</button>
      </div>`;
  }).join('');

  const grand = cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);
  totalEl.innerHTML = `<span>Total</span><span>₹${grand.toLocaleString(undefined, {minimumFractionDigits:0})}</span>`;

  // events
  itemsEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      changeQty(btn.dataset.name, btn.dataset.action === 'inc' ? 1 : -1);
      renderCartDrawer();
    });
  });
  itemsEl.querySelectorAll('.cart-item-del').forEach(btn => {
    btn.addEventListener('click', () => { removeFromCart(btn.dataset.name); renderCartDrawer(); });
  });
}

/* ── ADDRESS MODAL ────────────────────────────────────────── */
function buildAddressModal() {
  if (document.getElementById('addressModal')) return;
  const el = document.createElement('div');
  el.id = 'addressModal';
  el.innerHTML = `
    <div id="addressModalBox">
      <div id="addressModalHead">
        <h3>📦 Delivery Details</h3>
        <button id="addressModalClose">✕</button>
      </div>
      <div id="addressModalBody">
        <label>Full Name *</label>
        <input type="text" id="addrName" placeholder="e.g. Rahul Sharma" />
        <label>Phone Number *</label>
        <input type="tel" id="addrPhone" placeholder="e.g. 9373828887" />
        <label>Full Address *</label>
        <textarea id="addrStreet" rows="2" placeholder="Flat / House No, Street, Area"></textarea>
        <label>City *</label>
        <input type="text" id="addrCity" placeholder="e.g. Pune" />
        <label>State</label>
        <input type="text" id="addrState" placeholder="e.g. Maharashtra" />
        <label>Pincode *</label>
        <input type="text" id="addrPin" placeholder="e.g. 411001" />
        <label>Note for seller (optional)</label>
        <textarea id="addrNote" rows="2" placeholder="Any special instructions…"></textarea>
        <button id="confirmOrderBtn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Confirm & Send on WhatsApp
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);

  const s = document.createElement('style');
  s.textContent = `
    #addressModal {
      position:fixed;inset:0;z-index:70000;background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;padding:1rem;
      opacity:0;pointer-events:none;transition:opacity .25s;backdrop-filter:blur(4px);
    }
    #addressModal.open { opacity:1;pointer-events:all; }
    #addressModalBox {
      background:#fff;border-radius:20px;width:100%;max-width:440px;max-height:90vh;
      overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);
      transform:translateY(24px);transition:transform .3s;
    }
    #addressModal.open #addressModalBox { transform:translateY(0); }
    #addressModalHead {
      display:flex;justify-content:space-between;align-items:center;
      padding:1.2rem 1.5rem;border-bottom:1px solid #e0dbd2;position:sticky;top:0;background:#fff;border-radius:20px 20px 0 0;
    }
    #addressModalHead h3 { font-family:'Playfair Display',serif;font-size:1.1rem;color:#1a1a1a; }
    #addressModalClose { background:none;border:none;font-size:1.1rem;cursor:pointer;color:#888;padding:4px; }
    #addressModalBody { padding:1.2rem 1.5rem;display:flex;flex-direction:column;gap:.75rem; }
    #addressModalBody label { font-size:.8rem;font-weight:600;color:#444;text-transform:uppercase;letter-spacing:.04em;margin-bottom:-4px; }
    #addressModalBody input, #addressModalBody textarea {
      width:100%;border:1.5px solid #e0dbd2;border-radius:10px;padding:.65rem .9rem;
      font-size:.92rem;font-family:'DM Sans',sans-serif;color:#1a1a1a;
      outline:none;transition:border-color .2s;resize:vertical;box-sizing:border-box;
    }
    #addressModalBody input:focus, #addressModalBody textarea:focus { border-color:#1e4035; }
    #confirmOrderBtn {
      background:#25d366;color:#fff;border:none;border-radius:50px;
      padding:.9rem 1.5rem;font-weight:700;font-size:.95rem;cursor:pointer;
      display:flex;align-items:center;justify-content:center;gap:.6rem;
      transition:background .2s;font-family:'DM Sans',sans-serif;margin-top:.5rem;
    }
    #confirmOrderBtn:hover { background:#128c7e; }
  `;
  document.head.appendChild(s);

  document.getElementById('addressModalClose').addEventListener('click', closeAddressModal);
  el.addEventListener('click', e => { if (e.target === el) closeAddressModal(); });
  document.getElementById('confirmOrderBtn').addEventListener('click', submitOrderToWhatsApp);
}

function openAddressModal() {
  buildAddressModal();
  // Pre-fill from localStorage if saved
  const saved = JSON.parse(localStorage.getItem('furni_address') || '{}');
  if (saved.name)  document.getElementById('addrName').value  = saved.name;
  if (saved.phone) document.getElementById('addrPhone').value = saved.phone;
  if (saved.street)document.getElementById('addrStreet').value= saved.street;
  if (saved.city)  document.getElementById('addrCity').value  = saved.city;
  if (saved.state) document.getElementById('addrState').value = saved.state;
  if (saved.pin)   document.getElementById('addrPin').value   = saved.pin;
  document.getElementById('addressModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAddressModal() {
  const m = document.getElementById('addressModal');
  if (m) m.classList.remove('open');
  document.body.style.overflow = '';
}

function submitOrderToWhatsApp() {
  const name   = document.getElementById('addrName').value.trim();
  const phone  = document.getElementById('addrPhone').value.trim();
  const street = document.getElementById('addrStreet').value.trim();
  const city   = document.getElementById('addrCity').value.trim();
  const state  = document.getElementById('addrState').value.trim();
  const pin    = document.getElementById('addrPin').value.trim();
  const note   = document.getElementById('addrNote').value.trim();

  if (!name || !phone || !street || !city || !pin) {
    showToast('Please fill all required fields (*)', '⚠️'); return;
  }

  // Save address for next time
  localStorage.setItem('furni_address', JSON.stringify({ name, phone, street, city, state, pin }));

  const cart = getCart();
  if (!cart.length) { showToast('Cart is empty!', '⚠️'); return; }

  let msg = '🛒 *New Order \u2014 Furni.*\n\n';
  msg += '*ORDER ITEMS:*\n';
  let total = 0;
  cart.forEach(i => {
    const sub = parseFloat(i.price) * i.qty;
    msg += `\u2022 *${i.name}*  \u00d7${i.qty}  \u2014  \u20b9${sub.toLocaleString()}\n`;
    total += sub;
  });
  msg += `\n*Total: \u20b9${total.toLocaleString()}*\n`;
  msg += '\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  msg += '*DELIVERY ADDRESS:*\n';
  msg += `\ud83d\udc64 ${name}\n`;
  msg += `\ud83d\udcde ${phone}\n`;
  msg += `\ud83d\udccd ${street}, ${city}`;
  if (state) msg += `, ${state}`;
  msg += `\n\ud83d\udce0 Pincode: ${pin}`;
  if (note) msg += `\n\ud83d\udcdd Note: ${note}`;
  msg += '\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  msg += 'Please confirm my order. Thank you! \ud83d\ude4f';

  closeAddressModal();
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── WHATSAPP ORDER ───────────────────────────────────────── */
function sendWhatsAppOrder() {
  const cart = getCart();
  if (!cart.length) { showToast('Cart is empty!', '⚠️'); return; }
  openAddressModal();
}

/* ── UPI PAYMENT ──────────────────────────────────────────── */
// Replace YOUR_UPI_ID below with the actual UPI ID e.g. 9373828887@paytm or name@ybl
const UPI_ID   = 'YOUR_UPI_ID@paytm';
const UPI_NAME = 'Furni Store';

function openUpiPayment() {
  const cart = getCart();
  if (!cart.length) { showToast('Cart is empty!', '⚠️'); return; }
  const total = cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);

  // Build UPI deep link — opens PhonePe / GPay / Paytm automatically
  const upiURL = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Furni Order')}`;

  // Try opening UPI app
  window.location.href = upiURL;

  // After 1.5s if UPI app didn't open (desktop), show fallback message
  setTimeout(() => {
    showToast('Open PhonePe / GPay / Paytm and pay to: ' + UPI_ID, '💳');
  }, 1500);
}

/* ── SEARCH OVERLAY ───────────────────────────────────────── */
function buildSearchOverlay() {
  if (document.getElementById('searchOverlay')) return;
  const ov = document.createElement('div'); ov.id = 'searchOverlay';
  ov.innerHTML = `
    <div id="searchOverlayInner">
      <div id="searchOverlayBar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="globalSearchInput" placeholder="Search products…" autocomplete="off" />
        <button id="searchOverlayClose">&#10005;</button>
      </div>
      <div id="searchResults"></div>
    </div>`;
  document.body.appendChild(ov);

  const style = document.createElement('style');
  style.textContent = `
    #searchOverlay {
      position:fixed;inset:0;z-index:60000;background:rgba(0,0,0,.6);
      display:flex;align-items:flex-start;justify-content:center;
      padding-top:5rem;opacity:0;pointer-events:none;transition:opacity .25s;
      backdrop-filter:blur(4px);
    }
    #searchOverlay.open { opacity:1;pointer-events:all; }
    #searchOverlayInner {
      width:100%;max-width:560px;background:#fff;border-radius:20px;
      overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);
      transform:translateY(-20px);transition:transform .3s;
    }
    #searchOverlay.open #searchOverlayInner { transform:translateY(0); }
    #searchOverlayBar {
      display:flex;align-items:center;gap:.75rem;
      padding:1rem 1.2rem;border-bottom:1px solid #e0dbd2;
    }
    #globalSearchInput {
      flex:1;border:none;outline:none;font-size:1rem;font-family:'DM Sans',sans-serif;color:#1a1a1a;
    }
    #searchOverlayClose {
      background:none;border:none;font-size:1.1rem;cursor:pointer;color:#888;padding:4px;
    }
    #searchResults { max-height:400px;overflow-y:auto;padding:.5rem 0; }
    .search-result-item {
      display:flex;align-items:center;gap:1rem;padding:.75rem 1.2rem;cursor:pointer;
      transition:background .15s;
    }
    .search-result-item:hover { background:#f7f4ef; }
    .search-result-item img { width:48px;height:48px;object-fit:contain;background:#f0ece5;border-radius:8px;padding:3px; }
    .search-result-name { font-size:.9rem;font-weight:500;color:#1a1a1a; }
    .search-result-price { font-size:.82rem;color:#1e4035;font-weight:700; }
    .search-no-result { padding:2rem;text-align:center;color:#888;font-size:.9rem; }
  `;
  document.head.appendChild(style);

  document.getElementById('searchOverlayClose').addEventListener('click', closeSearch);
  ov.addEventListener('click', e => { if (e.target === ov) closeSearch(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });

  let debounce;
  document.getElementById('globalSearchInput').addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(this.value.trim()), 200);
  });
}

function openSearch()  { document.getElementById('searchOverlay').classList.add('open'); document.getElementById('globalSearchInput').focus(); document.body.style.overflow='hidden'; }
function closeSearch() { document.getElementById('searchOverlay').classList.remove('open'); document.body.style.overflow=''; }

function runSearch(q) {
  const box = document.getElementById('searchResults');
  if (!q) { box.innerHTML = ''; return; }
  const isInPages = window.location.pathname.includes('/pages/');
  const imgBase   = isInPages ? '../' : '';
  const shopLink  = isInPages ? 'shop.html' : 'pages/shop.html';

  const matches = PRODUCT_CATALOGUE.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.category.toLowerCase().includes(q.toLowerCase())
  );

  if (!matches.length) {
    box.innerHTML = `<div class="search-no-result">No products found for "<strong>${q}</strong>"</div>`;
    return;
  }

  box.innerHTML = matches.map(p => `
    <div class="search-result-item" data-id="${p.id}">
      <img src="${imgBase + p.imgs[0]}" alt="${p.name}" />
      <div>
        <div class="search-result-name">${p.name}</div>
        <div class="search-result-price">₹${p.price.toLocaleString()}</div>
      </div>
    </div>`).join('');

  box.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      closeSearch();
      // if we're on shop page, open modal; otherwise navigate to shop
      if (window.location.pathname.includes('shop.html') && typeof openProductModal === 'function') {
        openProductModal(parseInt(item.dataset.id));
      } else {
        window.location.href = shopLink + '?product=' + item.dataset.id;
      }
    });
  });
}

/* ── PRODUCT DETAIL MODAL (shared, works on all pages) ───── */
function buildProductModal() {
  if (document.getElementById('furniProductModal')) return;

  const mo = document.createElement('div'); mo.id = 'furniProductModal'; mo.className = 'furni-modal-overlay';
  mo.innerHTML = `
    <div class="furni-modal-box">
      <button class="furni-modal-close" id="furniModalClose">&#10005;</button>
      <div class="furni-modal-inner">
        <div class="furni-modal-img-side">
          <img class="furni-modal-main-img" id="furniModalMainImg" src="" alt="" />
          <div class="furni-modal-thumbs" id="furniModalThumbs"></div>
        </div>
        <div class="furni-modal-info-side">
          <div class="furni-modal-badges" id="furniModalBadges"></div>
          <h2 class="furni-modal-name" id="furniModalName"></h2>
          <div class="furni-modal-rating-row">
            <span class="furni-modal-stars" id="furniModalStars"></span>
            <span class="furni-modal-reviews" id="furniModalReviews"></span>
          </div>
          <div class="furni-modal-price-row">
            <span class="furni-modal-price" id="furniModalPrice"></span>
            <span class="furni-modal-old-price" id="furniModalOldPrice"></span>
          </div>
          <p class="furni-modal-desc" id="furniModalDesc"></p>
          <div class="furni-modal-specs" id="furniModalSpecs"></div>
          <div class="furni-rating-section">
            <h4>Rate this product</h4>
            <div class="furni-stars-interactive" id="furniStarRow">
              <button class="furni-star" data-v="1">&#9733;</button>
              <button class="furni-star" data-v="2">&#9733;</button>
              <button class="furni-star" data-v="3">&#9733;</button>
              <button class="furni-star" data-v="4">&#9733;</button>
              <button class="furni-star" data-v="5">&#9733;</button>
            </div>
            <p id="furniRateCta" class="furni-rate-cta">Tap a star to share your experience</p>
          </div>
          <div class="furni-modal-actions">
            <button class="furni-modal-add-btn" id="furniModalAddBtn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39A2 2 0 0 0 9.68 16h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              Add to Cart
            </button>
            <button class="furni-modal-wa-btn" id="furniModalWABtn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Buy on WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(mo);

  const s = document.createElement('style');
  s.textContent = `
    .furni-modal-overlay {
      position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:55000;
      display:flex;align-items:center;justify-content:center;padding:1rem;
      opacity:0;pointer-events:none;transition:opacity .3s;backdrop-filter:blur(4px);
    }
    .furni-modal-overlay.open { opacity:1;pointer-events:all; }
    .furni-modal-box {
      background:#fff;border-radius:20px;max-width:860px;width:100%;
      max-height:90vh;overflow-y:auto;position:relative;
      transform:translateY(28px) scale(.97);
      transition:transform .38s cubic-bezier(.34,1.56,.64,1);
    }
    .furni-modal-overlay.open .furni-modal-box { transform:translateY(0) scale(1); }
    .furni-modal-close {
      position:absolute;top:1rem;right:1rem;width:36px;height:36px;border-radius:50%;
      background:#f7f4ef;border:none;font-size:1rem;cursor:pointer;
      display:flex;align-items:center;justify-content:center;color:#666;transition:all .2s;z-index:2;
    }
    .furni-modal-close:hover { background:#fdecea;color:#c0392b; }
    .furni-modal-inner { display:grid;grid-template-columns:1fr 1fr; }
    .furni-modal-img-side {
      background:#f0ece5;border-radius:20px 0 0 20px;
      padding:2.5rem 2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;
    }
    .furni-modal-main-img { width:100%;max-height:260px;object-fit:contain;transition:opacity .25s; }
    .furni-modal-thumbs { display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center; }
    .furni-modal-thumb {
      width:56px;height:56px;border-radius:10px;background:#fff;
      border:2px solid transparent;overflow:hidden;cursor:pointer;transition:border-color .2s;padding:4px;
    }
    .furni-modal-thumb.active,.furni-modal-thumb:hover { border-color:#1e4035; }
    .furni-modal-thumb img { width:100%;height:100%;object-fit:contain; }
    .furni-modal-info-side { padding:2.5rem 2rem 2rem;display:flex;flex-direction:column;gap:.85rem; }
    .furni-modal-badges { display:flex;gap:.5rem;flex-wrap:wrap; }
    .furni-modal-badge {
      font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
      padding:.2rem .7rem;border-radius:50px;
    }
    .furni-badge-cat     { background:#e8f0ec;color:#1e4035; }
    .furni-badge-new     { background:#e8f5e9;color:#2e7d32; }
    .furni-badge-sale    { background:#fdecea;color:#c0392b; }
    .furni-badge-premium { background:#fff8e1;color:#f57f17; }
    .furni-modal-name { font-family:'Playfair Display',serif;font-size:1.5rem;color:#1a1a1a;line-height:1.25; }
    .furni-modal-rating-row { display:flex;align-items:center;gap:.6rem; }
    .furni-modal-stars  { color:#f5c518;font-size:.95rem;letter-spacing:.05em; }
    .furni-modal-reviews{ font-size:.8rem;color:#888; }
    .furni-modal-price-row { display:flex;align-items:baseline;gap:.75rem; }
    .furni-modal-price     { font-family:'Playfair Display',serif;font-size:1.7rem;font-weight:700;color:#1e4035; }
    .furni-modal-old-price { font-size:.95rem;color:#aaa;text-decoration:line-through; }
    .furni-modal-desc  { font-size:.87rem;color:#4a4a4a;line-height:1.7;border-top:1px solid #e0dbd2;padding-top:.85rem; }
    .furni-modal-specs { display:grid;grid-template-columns:1fr 1fr;gap:.35rem .75rem; }
    .furni-spec-item   { font-size:.8rem;color:#4a4a4a; }
    .furni-spec-item strong { color:#1a1a1a; }
    .furni-rating-section { border-top:1px solid #e0dbd2;padding-top:.85rem; }
    .furni-rating-section h4 { font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:.5rem; }
    .furni-stars-interactive { display:flex;gap:.1rem;margin-bottom:.35rem; }
    .furni-star { font-size:1.55rem;background:none;border:none;cursor:pointer;color:#ddd;transition:color .12s,transform .12s;line-height:1;padding:0 2px; }
    .furni-star.h,.furni-star.sel { color:#f5c518; }
    .furni-star:hover { transform:scale(1.25); }
    .furni-rate-cta { font-size:.78rem;color:#888; }
    .furni-rate-cta a { color:#1e4035;font-weight:600;text-decoration:underline; }
    .furni-modal-actions { display:flex;gap:.65rem;flex-wrap:wrap;margin-top:auto;padding-top:.85rem;border-top:1px solid #e0dbd2; }
    .furni-modal-add-btn {
      flex:1;background:#1e4035;color:#fff;border:none;border-radius:50px;
      padding:.7rem 1rem;font-weight:600;font-size:.85rem;cursor:pointer;
      transition:background .2s;display:flex;align-items:center;justify-content:center;gap:.4rem;
      font-family:'DM Sans',sans-serif;
    }
    .furni-modal-add-btn:hover { background:#2d5a45; }
    .furni-modal-wa-btn {
      flex:1;background:#25d366;color:#fff;border:none;border-radius:50px;
      padding:.7rem 1rem;font-weight:600;font-size:.85rem;cursor:pointer;
      transition:background .2s;display:flex;align-items:center;justify-content:center;gap:.4rem;
      font-family:'DM Sans',sans-serif;
    }
    .furni-modal-wa-btn:hover { background:#128c7e; }
    @media(max-width:700px){
      .furni-modal-inner{grid-template-columns:1fr;}
      .furni-modal-img-side{border-radius:20px 20px 0 0;}
      .furni-modal-box{max-height:95vh;}
    }
  `;
  document.head.appendChild(s);

  document.getElementById('furniModalClose').addEventListener('click', closeProductModal);
  mo.addEventListener('click', e => { if (e.target === mo) closeProductModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProductModal(); });
  initFurniStars();
}

let _currentModalProduct = null;

function openProductModal(id) {
  const p = PRODUCT_CATALOGUE.find(x => x.id === id);
  if (!p) return;
  _currentModalProduct = p;

  buildProductModal();
  const isInPages = window.location.pathname.includes('/pages/');
  const imgBase   = isInPages ? '../' : '';

  // Badges
  let badges = `<span class="furni-modal-badge furni-badge-cat">${p.category}</span>`;
  if (p.isNew)     badges += `<span class="furni-modal-badge furni-badge-new">New</span>`;
  if (p.isSale)    badges += `<span class="furni-modal-badge furni-badge-sale">Sale</span>`;
  if (p.isPremium) badges += `<span class="furni-modal-badge furni-badge-premium">Premium</span>`;
  if (p.badge && !p.isNew && !p.isSale && !p.isPremium)
    badges += `<span class="furni-modal-badge furni-badge-premium">${p.badge}</span>`;
  document.getElementById('furniModalBadges').innerHTML = badges;

  document.getElementById('furniModalName').textContent    = p.name;
  document.getElementById('furniModalStars').textContent   = starsStr(p.rating);
  document.getElementById('furniModalReviews').textContent = `(${p.reviews} reviews)`;
  document.getElementById('furniModalPrice').textContent   = `₹${p.price.toLocaleString()}`;
  document.getElementById('furniModalOldPrice').textContent = p.oldPrice ? `₹${p.oldPrice.toLocaleString()}` : '';
  document.getElementById('furniModalDesc').textContent    = p.desc;

  document.getElementById('furniModalSpecs').innerHTML = Object.entries(p.specs)
    .map(([k,v]) => `<div class="furni-spec-item"><strong>${k}:</strong> ${v}</div>`).join('');

  // Main image
  const mainImg = document.getElementById('furniModalMainImg');
  mainImg.src = imgBase + p.imgs[0]; mainImg.alt = p.name;

  // Thumbnails (2–3 images)
  const thumbsEl = document.getElementById('furniModalThumbs');
  thumbsEl.innerHTML = p.imgs.map((src, i) =>
    `<div class="furni-modal-thumb${i===0?' active':''}" data-src="${imgBase+src}">
      <img src="${imgBase+src}" alt="View ${i+1}" />
    </div>`).join('');

  thumbsEl.querySelectorAll('.furni-modal-thumb').forEach(t => {
    t.addEventListener('click', () => {
      thumbsEl.querySelectorAll('.furni-modal-thumb').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      mainImg.style.opacity = '0';
      setTimeout(() => { mainImg.src = t.dataset.src; mainImg.style.opacity = '1'; }, 220);
    });
  });

  // Reset stars
  document.querySelectorAll('.furni-star').forEach(s => s.classList.remove('h','sel'));
  document.getElementById('furniRateCta').innerHTML = 'Tap a star to share your experience';

  // Add to cart
  document.getElementById('furniModalAddBtn').onclick = () => {
    addToCart({ name: p.name, price: p.price });
    showToast(`${p.name} added to cart`);
  };

  // WhatsApp direct buy - add to cart then open address modal
  document.getElementById('furniModalWABtn').onclick = () => {
    addToCart({ name: p.name, price: p.price });
    closeProductModal();
    openCart();
    setTimeout(() => openAddressModal(), 300);
  };

  document.getElementById('furniProductModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  const m = document.getElementById('furniProductModal');
  if (m) m.classList.remove('open');
  document.body.style.overflow = '';
  _currentModalProduct = null;
}

function initFurniStars() {
  const stars = document.querySelectorAll('.furni-star');
  const cta   = document.getElementById('furniRateCta');
  stars.forEach(star => {
    const v = parseInt(star.dataset.v);
    star.addEventListener('mouseenter', () => stars.forEach(s => s.classList.toggle('h', parseInt(s.dataset.v) <= v)));
    star.addEventListener('mouseleave', () => stars.forEach(s => s.classList.remove('h')));
    star.addEventListener('click', () => {
      stars.forEach(s => s.classList.toggle('sel', parseInt(s.dataset.v) <= v));
      const name = _currentModalProduct ? _currentModalProduct.name : 'Product';
      // Replace YOUR_FORM_ID with actual Google Form ID
      const formURL = `https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?usp=pp_url&entry.PRODUCT_ENTRY=` + encodeURIComponent(name) + `&entry.RATING_ENTRY=` + encodeURIComponent(v + ' stars');
      cta.innerHTML = `You selected <strong>${v} star${v>1?'s':''}</strong> — <a href="${formURL}" target="_blank" rel="noopener">Open rating form ↗</a>`;
    });
  });
}

function starsStr(rating) {
  const f = Math.floor(rating), h = rating % 1 >= .5 ? 1 : 0, e = 5 - f - h;
  return '★'.repeat(f) + (h ? '½' : '') + '☆'.repeat(e);
}

/* ── HERO OFFER (controlled from Google Sheets "offers" tab) ─── */
function applyHeroOffer(offer) {
  if (!offer) return;
  // tag line e.g. "New Collection 2024"
  const tag = document.querySelector('.hero-tag');
  if (tag && offer.tag) tag.textContent = offer.tag;
  // main heading
  const title = document.querySelector('.hero-title');
  if (title && offer.title) {
    // support a pipe | as a line break separator
    const parts = offer.title.split('|');
    title.innerHTML = parts[0] + (parts[1] ? '<br/><em>' + parts[1] + '</em>' : '');
  }
  // subtitle/description
  const desc = document.querySelector('.hero-desc');
  if (desc && offer.subtitle) desc.textContent = offer.subtitle;
  // primary button
  const btn = document.querySelector('.hero-btns .btn-primary');
  if (btn) {
    if (offer.btnText) btn.textContent = offer.btnText + ' →';
    if (offer.btnLink) btn.href = offer.btnLink;
  }
  // optional: badge/promo strip above hero
  if (offer.promoBanner) {
    let strip = document.getElementById('promo-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'promo-strip';
      strip.style.cssText = 'background:#1e4035;color:#fff;text-align:center;padding:.55rem 1rem;font-size:.88rem;font-weight:500;letter-spacing:.02em;position:relative;z-index:100;';
      document.body.prepend(strip);
    }
    strip.textContent = offer.promoBanner;
  }
}

/* ── HOME PAGE FEATURED CARDS — sync prices from PRODUCT_CATALOGUE ── */
function updateHomeFeaturedCards() {
  // Only runs on home page (index.html)
  const cards = document.querySelectorAll('.products-grid .product-card');
  if (!cards.length) return;
  cards.forEach(card => {
    const nameEl  = card.querySelector('h3');
    const priceEl = card.querySelector('.price');
    const oldEl   = card.querySelector('.price-old');
    const badgeEl = card.querySelector('.product-badge');
    const cartBtn = card.querySelector('.add-to-cart');
    if (!priceEl) return;

    // FIX 1: Match by data-id (reliable) first, fall back to name match.
    // Name-only matching silently skips cards whose <h3> text has any
    // whitespace difference vs the catalogue, causing the 4th card to miss.
    const cardId = parseInt(card.dataset.id);
    const prod = cardId
      ? PRODUCT_CATALOGUE.find(p => p.id === cardId)
      : nameEl
        ? PRODUCT_CATALOGUE.find(p => p.name === nameEl.textContent.trim())
        : null;
    if (!prod) return;

    // FIX 2: Always write ₹ here — never trust whatever symbol the HTML had.
    priceEl.textContent = '\u20B9' + prod.price.toLocaleString('en-IN');

    // FIX 3: Store price as a plain number in data-price so addToCart gets a
    // number, not a string — prevents "$1299" or string-price bugs in the cart.
    if (cartBtn) {
      cartBtn.dataset.price = prod.price;
      cartBtn.dataset.name  = prod.name;
    }

    if (prod.oldPrice) {
      if (oldEl) { oldEl.textContent = '\u20B9' + prod.oldPrice.toLocaleString('en-IN'); oldEl.style.display = ''; }
      else {
        const s = document.createElement('span');
        s.className = 'price-old';
        s.textContent = '\u20B9' + prod.oldPrice.toLocaleString('en-IN');
        priceEl.after(s);
      }
    } else if (oldEl) { oldEl.style.display = 'none'; }

    if (badgeEl && prod.badge) badgeEl.textContent = prod.badge;
  });
}

/* ── WIRE UP EVERYTHING ON DOM READY ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Build UI immediately — never wait on external fetch
  buildCartDrawer();
  buildSearchOverlay();
  buildProductModal();
  updateCartBadge();

  /* Cart icon(s) → open drawer */
  document.querySelectorAll('.icon-btn[aria-label="Cart"], a[aria-label="Cart"]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); openCart(); });
  });

  /* Search icon(s) → open overlay */
  document.querySelectorAll('.icon-btn[aria-label="Search"]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); openSearch(); });
  });

  /* Add-to-cart buttons on home/about featured grids */
  document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      // FIX: Always parse price as a number — dataset values are strings,
      // and a stale HTML data-price like "$1299" would break cart totals.
      addToCart({ name: btn.dataset.name, price: Number(btn.dataset.price) });
      showToast(`${btn.dataset.name} added to cart`);
    });
  });

  /* Product cards on home page → open modal */
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.add-to-cart')) return;
      const name = card.querySelector('h3')?.textContent?.trim();
      const prod = PRODUCT_CATALOGUE.find(p => p.name === name);
      if (prod) openProductModal(prod.id);
    });
  });

  /* Check URL for ?product=ID (from search redirect) */
  const params = new URLSearchParams(window.location.search);
  const pid = parseInt(params.get('product'));
  if (pid) setTimeout(() => openProductModal(pid), 400);

  // FIX: Run immediately so cards show ₹ from hardcoded catalogue right away,
  // before the sheet fetch completes (prevents dollar sign flash on 4th card).
  updateHomeFeaturedCards();

  // Load sheet data — updates prices AND applies hero offers
  fetchSheetData().then(({ productsChanged, offers }) => {
    // Re-render shop grid if prices changed — but only if shop.js hasn't already
    // handled it (shop.js has its own fetchSheetData().then block). Guard by
    // checking we are NOT on the shop page (which has its own shopGrid element).
    if (productsChanged && typeof renderGrid === 'function' && !document.getElementById('shopGrid')) renderGrid();
    // Apply hero offers if any are defined in the offers sheet tab
    if (offers && offers.length) applyHeroOffer(offers[0]);
    // FIX: was outside .then() — must run AFTER sheet prices are applied
    updateHomeFeaturedCards();
  });
});
