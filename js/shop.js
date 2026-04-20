/* ============================================================
   FURNI. — shop.js  (Shop page only)
   Uses PRODUCT_CATALOGUE, addToCart, openProductModal,
   showToast from common.js
   ============================================================ */

let filteredProducts = [...PRODUCT_CATALOGUE];
let currentPage      = 1;
const PAGE_SIZE      = 9;
let activeColor      = null;

/* ── STAR STRING ── */
function starsDisplay(r) {
  const f=Math.floor(r),h=r%1>=.5?1:0,e=5-f-h;
  return '★'.repeat(f)+(h?'½':'')+'☆'.repeat(e);
}

/* ── RENDER GRID ── */
function renderGrid() {
  const grid  = document.getElementById('shopGrid');
  const start = (currentPage - 1) * PAGE_SIZE;
  const items = filteredProducts.slice(start, start + PAGE_SIZE);

  document.getElementById('resultCount').textContent = filteredProducts.length;

  if (!items.length) {
    grid.innerHTML = `<div class="no-results">
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <h3>No products found</h3>
      <p>Try adjusting your filters or search.</p>
    </div>`;
    renderPagination(); return;
  }

  grid.innerHTML = items.map(p => {
    const badgeHTML = p.badge ? `<span class="product-badge${p.isSale?' sale':''}">${p.badge}</span>` : '';
    const oldPrice  = p.oldPrice ? `<span class="price-old">₹${p.oldPrice.toLocaleString()}</span>` : '';
    return `
      <div class="product-card" data-id="${p.id}" style="cursor:pointer">
        <div class="product-img-wrap">
          <img src="../${p.imgs[0]}" alt="${p.name}" loading="lazy"
               style="${p.imgs[0].endsWith('.jpg')?'object-fit:cover;padding:0':''}" />
          <div class="product-overlay">
            <button class="add-to-cart" data-name="${p.name}" data-price="${p.price}">Add to Cart</button>
            <a href="#" class="quick-view" data-id="${p.id}">View Details</a>
          </div>
          ${badgeHTML}
          <button class="wishlist-btn">&#9825;</button>
        </div>
        <div class="product-info">
          <h3>${p.name}</h3>
          <div class="product-price-row">
            <span><span class="price">₹${p.price.toLocaleString()}</span>${oldPrice}</span>
            <div class="stars">${starsDisplay(p.rating)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Animate cards in — use double rAF so transition fires after browser paint
  grid.querySelectorAll('.product-card').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.4s ease ${i*0.06}s, transform 0.4s ease ${i*0.06}s`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }));
  });

  // Add to cart
  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addToCart({ name: btn.dataset.name, price: btn.dataset.price });
      showToast(`${btn.dataset.name} added to cart`);
    });
  });

  // View Details
  grid.querySelectorAll('.quick-view').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openProductModal(parseInt(a.dataset.id));
    });
  });

  // Card click
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.closest('.add-to-cart') && !e.target.closest('.wishlist-btn'))
        openProductModal(parseInt(card.dataset.id));
    });
  });

  renderPagination();
}

/* ── PAGINATION ── */
function renderPagination() {
  const total = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const pag   = document.getElementById('pagination');
  if (total <= 1) { pag.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= total; i++)
    html += `<button class="page-btn${i===currentPage?' active':''}" data-page="${i}">${i}</button>`;
  if (currentPage < total)
    html += `<button class="page-btn" data-page="${currentPage+1}">&#8594;</button>`;
  pag.innerHTML = html;
  pag.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      renderGrid();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    });
  });
}

    (function() {
      const btn      = document.getElementById('mobileFilterBtn');
      const sidebar  = document.getElementById('shopSidebar');
      const overlay  = document.getElementById('sidebarOverlay');
      const closeBtn = document.getElementById('sidebarCloseBtn');
      const activeDot = document.getElementById('filterActiveDot');

      function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
      function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }

      btn?.addEventListener('click', openSidebar);
      overlay?.addEventListener('click', closeSidebar);
      closeBtn?.addEventListener('click', closeSidebar);

      // Close sidebar when Apply Filters is tapped on mobile
      document.getElementById('applyBtn')?.addEventListener('click', () => {
        if (window.innerWidth <= 860) closeSidebar();
      });

      // Show amber dot on filter button when non-default filters are active
      function updateActiveDot() {
        const cat   = document.querySelector('input[name="cat"]:checked')?.value;
        const rating = document.querySelector('input[name="rating"]:checked')?.value;
        const price = document.getElementById('priceRange')?.value;
        const search = document.getElementById('searchInput')?.value?.trim();
        const isDefault = cat === 'all' && rating === '0' && price === '25000' && !search;
        activeDot?.classList.toggle('visible', !isDefault);
      }

      document.querySelectorAll('input[name="cat"], input[name="rating"]').forEach(r => r.addEventListener('change', updateActiveDot));
      document.getElementById('priceRange')?.addEventListener('input', updateActiveDot);
      document.getElementById('searchInput')?.addEventListener('input', updateActiveDot);
      document.getElementById('clearFilters')?.addEventListener('click', () => { setTimeout(updateActiveDot, 50); });
    })();
  


/* ── APPLY FILTERS ── */
function applyFilters() {
  const cat    = document.querySelector('input[name="cat"]:checked')?.value || 'all';
  const maxP   = parseInt(document.getElementById('priceRange').value);
  const minR   = parseFloat(document.querySelector('input[name="rating"]:checked')?.value || '0');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const sort   = document.getElementById('sortSelect').value;

  filteredProducts = PRODUCT_CATALOGUE.filter(p => {
    if (p.active === false) return false; // hidden in Sheet
    if (cat !== 'all' && p.category !== cat) return false;
    if (p.price > maxP) return false;
    if (p.rating < minR) return false;
    if (activeColor && !p.colors.includes(activeColor)) return false;
    if (search && !p.name.toLowerCase().includes(search) &&
        !p.desc.toLowerCase().includes(search) &&
        !p.category.toLowerCase().includes(search)) return false;
    return true;
  });

  if (sort === 'price-asc')  filteredProducts.sort((a,b) => a.price - b.price);
  if (sort === 'price-desc') filteredProducts.sort((a,b) => b.price - a.price);
  if (sort === 'rating')     filteredProducts.sort((a,b) => b.rating - a.rating);
  if (sort === 'newest')     filteredProducts.sort((a,b) => (b.isNew?1:0)-(a.isNew?1:0));

  currentPage = 1;
  renderGrid();
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  // Add colors to products
  const colorMap = {
    1:['green'],2:['cream','brown'],3:['teal','green'],4:['brown','cream'],
    5:['teal'],6:['brown'],7:['brown'],8:['cream','brown'],9:['blue'],
    10:['grey'],11:['mustard'],12:['cream','brown']
  };
  PRODUCT_CATALOGUE.forEach(p => { if (!p.colors) p.colors = colorMap[p.id] || []; });

  // Render products immediately — never block on Sheets
  filteredProducts = [...PRODUCT_CATALOGUE];
  renderGrid();

  // After render, fetch Sheet data — gets new prices AND new products
  fetchSheetData().then(({ productsChanged }) => {
    if (productsChanged) {
      // Re-apply colorMap to any new products added from sheet
      PRODUCT_CATALOGUE.forEach(p => { if (!p.colors) p.colors = colorMap[p.id] || []; });
      filteredProducts = [...PRODUCT_CATALOGUE];
      applyFilters();
    }
  });

  // Price slider
  document.getElementById('priceRange').addEventListener('input', function() {
    document.getElementById('priceVal').textContent = '₹' + Number(this.value).toLocaleString('en-IN');
  });

  // Filter events
  document.getElementById('applyBtn').addEventListener('click', applyFilters);
  document.getElementById('searchBtn').addEventListener('click', applyFilters);
  document.getElementById('sortSelect').addEventListener('change', applyFilters);
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') applyFilters();
  });

  // Color dots
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      if (dot.classList.contains('active')) {
        dot.classList.remove('active'); activeColor = null;
      } else {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active'); activeColor = dot.dataset.color;
      }
    });
  });

  // Radio filters live
  document.querySelectorAll('input[name="cat"], input[name="rating"]').forEach(r => {
    r.addEventListener('change', applyFilters);
  });

  // Clear all
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.querySelector('input[name="cat"][value="all"]').checked = true;
    document.querySelector('input[name="rating"][value="0"]').checked = true;
    document.getElementById('priceRange').value = 25000;
    document.getElementById('priceVal').textContent = '₹25,000';
    document.getElementById('searchInput').value = '';
    document.getElementById('sortSelect').value = 'featured';
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    activeColor = null;
    applyFilters();
  });

  // Check URL for ?product=
  const params = new URLSearchParams(window.location.search);
  const pid = parseInt(params.get('product'));
  if (pid) setTimeout(() => openProductModal(pid), 500);
});
