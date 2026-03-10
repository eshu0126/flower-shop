
(() => {
  const CART_KEY = 'florabella_cart_v1';
  const USER_KEY = 'florabella_user_v1';
  const USERS_KEY = 'florabella_users_v1';
  const CATALOG_OVERRIDE_KEY = 'florabella_catalog_override_v3';
  const LEGACY_CATALOG_OVERRIDE_KEYS = [
    'florabella_catalog_override_v2',
    'florabella_catalog_override_v1'
  ];
  const SUBSCRIBERS_KEY = 'florabella_subscribers_v1';
  const AUTH_NOTICE_KEY = 'florabella_auth_notice_v1';
  const CONFIG = window.FLORABELLA_CONFIG || {};
  const DELIVERY_FEE = Number(CONFIG.deliveryFee || 14);
  const DEFAULT_FLOWER_IMAGE = 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=900&h=1100&fit=crop';
  const LUXURY_MULTIPLIER = Number(CONFIG.luxuryMultiplier || 1.35);
  const CATEGORY_PAGE_MAP = window.FLORABELLA_CATEGORY_PAGES || {};
  const WHATSAPP_NUMBER = String(CONFIG.whatsappNumber || '').replace(/\D/g, '');
  const WHATSAPP_DEFAULT_TEXT = String(CONFIG.whatsappDefaultText || 'Hi Florabella, I would like help with a custom flower order.');

  const toCurrency = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CONFIG.currency || 'USD'
  }).format(Number(value || 0));

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function buildCategoryImagePool() {
    const baseCatalog = Array.isArray(window.FLORABELLA_CATALOG) ? window.FLORABELLA_CATALOG : [];
    const pool = {};

    baseCatalog.forEach((item) => {
      const category = String(item?.category || 'seasonal').toLowerCase();
      const image = String(item?.image || '').trim();
      if (!image) return;
      if (!Array.isArray(pool[category])) pool[category] = [];
      if (!pool[category].includes(image)) pool[category].push(image);
    });

    if (!Array.isArray(pool.seasonal) || !pool.seasonal.length) {
      pool.seasonal = [DEFAULT_FLOWER_IMAGE];
    }

    return pool;
  }

  const CATEGORY_IMAGE_POOL = buildCategoryImagePool();

  function nextCategoryImage(category, usedImages, categoryCursor) {
    const fallbackPool = CATEGORY_IMAGE_POOL.seasonal || [DEFAULT_FLOWER_IMAGE];
    const categoryPool = CATEGORY_IMAGE_POOL[category] || fallbackPool;
    const start = Number(categoryCursor[category] || 0);

    for (let offset = 0; offset < categoryPool.length; offset += 1) {
      const idx = (start + offset) % categoryPool.length;
      const candidate = categoryPool[idx];
      if (!usedImages.has(candidate)) {
        categoryCursor[category] = idx + 1;
        return candidate;
      }
    }

    const fallback = categoryPool[start % categoryPool.length] || fallbackPool[0] || DEFAULT_FLOWER_IMAGE;
    categoryCursor[category] = start + 1;
    return fallback;
  }

  function roundPrice(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  function buildWhatsAppLink(message) {
    const text = encodeURIComponent(String(message || WHATSAPP_DEFAULT_TEXT));
    if (WHATSAPP_NUMBER) return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
    return `https://wa.me/?text=${text}`;
  }

  function getSizePrice(basePrice, size) {
    const base = Number(basePrice || 0);
    if (size === 'luxury') return roundPrice(base * LUXURY_MULTIPLIER);
    return roundPrice(base);
  }

  function getSizeLabel(size) {
    if (size === 'luxury') return 'Luxury';
    if (size === 'deluxe') return 'Deluxe';
    return 'Standard';
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function getRegisteredUsers() {
    const users = readJSON(USERS_KEY, []);
    if (!Array.isArray(users)) return [];

    return users
      .filter((item) => item && item.email)
      .map((item) => ({
        firstName: String(item.firstName || ''),
        lastName: String(item.lastName || ''),
        email: String(item.email || '').toLowerCase(),
        password: String(item.password || ''),
        dob: String(item.dob || ''),
        spouseName: String(item.spouseName || ''),
        spouseEmail: String(item.spouseEmail || '').toLowerCase(),
        spousePhone: String(item.spousePhone || ''),
        spouseDob: String(item.spouseDob || ''),
        subscribed: Boolean(item.subscribed)
      }));
  }

  function saveRegisteredUsers(users) {
    writeJSON(USERS_KEY, users);
  }

  function getCurrentUser() {
    return readJSON(USER_KEY, null);
  }

  function setCurrentUser(user) {
    writeJSON(USER_KEY, user);
  }

  function findRegisteredUserByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;
    return getRegisteredUsers().find((item) => item.email === normalizedEmail) || null;
  }

  function showAuthRequirementNotice() {
    const message = 'Please register or login and subscribe before adding flowers to cart.';
    sessionStorage.setItem(AUTH_NOTICE_KEY, message);

    const homeNotice = document.getElementById('homeAuthNotice');
    if (homeNotice && document.body.dataset.page === 'home') {
      homeNotice.hidden = false;
      homeNotice.textContent = message;
      return;
    }

    window.location.href = 'index.html#registerSubscribe';
  }

  function canShop() {
    const user = getCurrentUser();
    return Boolean(user && user.subscribed);
  }

  function slugify(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  function normalizeProduct(product, index = 0) {
    return {
      id: product.id || `flower-${index}`,
      category: String(product.category || 'seasonal').toLowerCase(),
      name: product.name || 'Untitled Flower',
      description: product.description || 'Seasonal florist arrangement.',
      price: Number(product.price || 0),
      image: String(product.image || '').trim()
    };
  }

  function sanitizeCatalog(rawCatalog, forceCategoryImages = false) {
    const categories = getCategories();
    const usedImages = new Set();
    const categoryCursor = {};

    return rawCatalog.map((item, index) => {
      const normalized = normalizeProduct(item, index);
      const safeCategory = categories[normalized.category] ? normalized.category : 'seasonal';
      let image = normalized.image;

      if (forceCategoryImages || !image || usedImages.has(image)) {
        image = nextCategoryImage(safeCategory, usedImages, categoryCursor);
      }

      if (!image) image = DEFAULT_FLOWER_IMAGE;
      usedImages.add(image);

      return {
        ...normalized,
        category: safeCategory,
        image
      };
    });
  }

  function getCatalog() {
    LEGACY_CATALOG_OVERRIDE_KEYS.forEach((legacyKey) => localStorage.removeItem(legacyKey));

    const override = readJSON(CATALOG_OVERRIDE_KEY, null);
    if (Array.isArray(override) && override.length > 0) return sanitizeCatalog(override, true);

    const base = Array.isArray(window.FLORABELLA_CATALOG) ? window.FLORABELLA_CATALOG : [];
    return sanitizeCatalog(base, false);
  }

  function getCategories() {
    return window.FLORABELLA_CATEGORIES || {};
  }

  function getStems() {
    return Array.isArray(window.FLORABELLA_STEMS) ? window.FLORABELLA_STEMS : [];
  }

  function getFeaturedIds() {
    return Array.isArray(window.FLORABELLA_FEATURED_IDS) ? window.FLORABELLA_FEATURED_IDS : [];
  }

  function getCart() {
    const cart = readJSON(CART_KEY, []);
    if (!Array.isArray(cart)) return [];
    return cart.filter((item) => item && item.id).map((item) => ({
      id: String(item.id),
      name: String(item.name || 'Flower item'),
      image: String(item.image || ''),
      details: item.details ? String(item.details) : '',
      price: Number(item.price || 0),
      quantity: Math.max(1, Number(item.quantity || 1))
    }));
  }

  function cartLineKey(item) {
    return `${item.id}::${item.details || ''}`;
  }

  function saveCart(cart) {
    writeJSON(CART_KEY, cart);
    updateCartBadges();
  }

  function getItemCount(cart = getCart()) {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function getSubtotal(cart = getCart()) {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function updateCartBadges() {
    const count = getItemCount();
    document.querySelectorAll('[data-cart-count]').forEach((badge) => {
      badge.textContent = String(count);
    });
  }

  function addToCart(product) {
    if (!canShop()) {
      showAuthRequirementNotice();
      return;
    }

    const normalized = {
      id: String(product.id),
      name: String(product.name),
      image: String(product.image || ''),
      details: product.details ? String(product.details) : '',
      price: Number(product.price || 0),
      quantity: Math.max(1, Number(product.quantity || 1))
    };
    if (!normalized.id || !normalized.name || normalized.price <= 0) return;

    const cart = getCart();
    const key = cartLineKey(normalized);
    const existing = cart.find((line) => cartLineKey(line) === key);
    if (existing) existing.quantity += normalized.quantity;
    else cart.push(normalized);

    saveCart(cart);
    toast(`${normalized.name} added to cart`);
  }

  function removeFromCart(id, details = '') {
    const key = `${id}::${details || ''}`;
    const cart = getCart().filter((item) => cartLineKey(item) !== key);
    saveCart(cart);
    renderCartPage();
    renderCheckoutSummary();
  }

  function updateQuantity(id, details, nextQuantity) {
    const cart = getCart();
    const target = cart.find((item) => item.id === id && (item.details || '') === (details || ''));
    if (!target) return;
    if (nextQuantity <= 0) {
      removeFromCart(id, details);
      return;
    }
    target.quantity = nextQuantity;
    saveCart(cart);
    renderCartPage();
    renderCheckoutSummary();
  }

  function clearCart() {
    saveCart([]);
    renderCartPage();
    renderCheckoutSummary();
  }
  function createProductCard(product) {
    const basePrice = roundPrice(product.price);
    const luxuryPrice = getSizePrice(basePrice, 'luxury');

    return `
      <article class="product-card reveal" data-product-card data-base-price="${escapeHtml(basePrice)}">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
        <div class="product-body">
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description)}</p>
          <div class="size-row">
            <label class="size-label">Size</label>
            <select class="size-select" data-size-select>
              <option value="standard">Standard - ${toCurrency(basePrice)}</option>
              <option value="luxury">Luxury - ${toCurrency(luxuryPrice)}</option>
              <option value="deluxe">Deluxe - Contact us for pricing</option>
            </select>
          </div>
          <div class="price-row">
            <span class="price" data-size-price>${toCurrency(basePrice)}</span>
            <button class="btn btn-primary btn-sm" type="button" data-add-to-cart data-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-base-price="${escapeHtml(basePrice)}" data-image="${escapeHtml(product.image)}">Add</button>
          </div>
        </div>
      </article>
    `;
  }

  function updateProductCardState(card) {
    if (!card) return;

    const sizeSelect = card.querySelector('[data-size-select]');
    const priceNode = card.querySelector('[data-size-price]');
    const addButton = card.querySelector('[data-add-to-cart]');
    const basePrice = Number(card.getAttribute('data-base-price') || 0);
    if (!sizeSelect || !priceNode || !addButton) return;

    const size = String(sizeSelect.value || 'standard');
    if (size === 'deluxe') {
      priceNode.textContent = 'Contact us for pricing';
      addButton.textContent = 'Contact Us';
      addButton.classList.remove('btn-primary');
      addButton.classList.add('btn-ghost');
      addButton.dataset.mode = 'contact';
      addButton.dataset.price = '';
      return;
    }

    const price = getSizePrice(basePrice, size);
    priceNode.textContent = toCurrency(price);
    addButton.textContent = 'Add';
    addButton.classList.remove('btn-ghost');
    addButton.classList.add('btn-primary');
    addButton.dataset.mode = 'add';
    addButton.dataset.price = String(price);
  }

  function updateRenderedProductCardStates(scope = document) {
    scope.querySelectorAll('[data-product-card]').forEach((card) => updateProductCardState(card));
  }

  function renderCatalogSections() {
    const catalog = getCatalog();
    document.querySelectorAll('[data-product-grid]').forEach((grid) => {
      const category = (grid.dataset.category || 'all').toLowerCase();
      const limit = Number(grid.dataset.limit || 0);
      const sort = grid.dataset.sort || 'default';
      let products = category === 'all' ? [...catalog] : catalog.filter((item) => item.category === category);
      if (sort === 'price-asc') products.sort((a, b) => a.price - b.price);
      if (sort === 'price-desc') products.sort((a, b) => b.price - a.price);
      if (sort === 'name') products.sort((a, b) => a.name.localeCompare(b.name));
      if (limit > 0) products = products.slice(0, limit);
      if (!products.length) {
        grid.innerHTML = '<p class="empty-note">No flowers found in this collection yet.</p>';
        return;
      }
      grid.innerHTML = products.map(createProductCard).join('');
      updateRenderedProductCardStates(grid);
    });

    const featuredGrid = document.getElementById('featuredFlowersGrid');
    if (featuredGrid) {
      const featuredIds = getFeaturedIds();
      let featured = catalog.filter((item) => featuredIds.includes(item.id));
      if (!featured.length) featured = [...catalog].slice(0, 6);
      featuredGrid.innerHTML = featured.map(createProductCard).join('');
      updateRenderedProductCardStates(featuredGrid);
    }
  }

  function renderAllFlowersExplorer() {
    const grid = document.getElementById('allFlowersGrid');
    if (!grid) return;

    const searchInput = document.getElementById('flowerSearch');
    const categoryInput = document.getElementById('flowerCategory');
    const sortInput = document.getElementById('flowerSort');
    const countNode = document.getElementById('allFlowersCount');

    const categories = getCategories();
    const catalog = getCatalog();

    if (categoryInput) {
      const current = categoryInput.value;
      const options = ['<option value="all">All Categories</option>'];
      Object.keys(categories).forEach((key) => {
        if (key === 'all') return;
        const selected = current === key ? ' selected' : '';
        options.push(`<option value="${escapeHtml(key)}"${selected}>${escapeHtml(categories[key].label || key)}</option>`);
      });
      categoryInput.innerHTML = options.join('');
      categoryInput.value = current || 'all';
    }

    function applyFilters() {
      const searchValue = (searchInput ? searchInput.value : '').trim().toLowerCase();
      const categoryValue = (categoryInput ? categoryInput.value : 'all').toLowerCase();
      const sortValue = (sortInput ? sortInput.value : 'featured').toLowerCase();
      let list = [...catalog];

      if (categoryValue !== 'all') list = list.filter((item) => item.category === categoryValue);
      if (searchValue) {
        list = list.filter((item) => (`${item.name} ${item.description} ${item.category}`).toLowerCase().includes(searchValue));
      }

      if (sortValue === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      if (sortValue === 'price-asc') list.sort((a, b) => a.price - b.price);
      if (sortValue === 'price-desc') list.sort((a, b) => b.price - a.price);
      if (sortValue === 'featured') {
        const rank = getFeaturedIds();
        list.sort((a, b) => {
          const aRank = rank.indexOf(a.id);
          const bRank = rank.indexOf(b.id);
          if (aRank === -1 && bRank === -1) return a.name.localeCompare(b.name);
          if (aRank === -1) return 1;
          if (bRank === -1) return -1;
          return aRank - bRank;
        });
      }

      grid.innerHTML = list.length ? list.map(createProductCard).join('') : '<p class="empty-note">No flowers match your filters. Try another search.</p>';
      updateRenderedProductCardStates(grid);
      if (countNode) countNode.textContent = `${list.length} flowers`;
      revealOnScroll();
    }

    [searchInput, categoryInput, sortInput].forEach((control) => {
      if (!control) return;
      control.addEventListener('input', applyFilters);
      control.addEventListener('change', applyFilters);
    });

    applyFilters();
  }

  function bindAddToCartDelegation() {
    document.addEventListener('change', (event) => {
      const sizeSelect = event.target.closest('[data-size-select]');
      if (!sizeSelect) return;
      const card = sizeSelect.closest('[data-product-card]');
      updateProductCardState(card);
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-to-cart]');
      if (!button) return;

      const card = button.closest('[data-product-card]');
      const sizeSelect = card?.querySelector('[data-size-select]');
      const size = String(sizeSelect?.value || 'standard').toLowerCase();

      const baseId = String(button.dataset.id || '').trim();
      const baseName = String(button.dataset.name || '').trim();
      const baseImage = String(button.dataset.image || '').trim();
      const basePrice = Number(button.dataset.basePrice || button.dataset.price || 0);

      if (!baseId || !baseName || !basePrice) return;

      if (size === 'deluxe' || button.dataset.mode === 'contact') {
        const contactMessage = `Hi Florabella, I would like a Deluxe quote for ${baseName}.`;
        window.open(buildWhatsAppLink(contactMessage), '_blank', 'noopener,noreferrer');
        return;
      }

      const sizeLabel = getSizeLabel(size);
      const sizePrice = getSizePrice(basePrice, size);
      addToCart({
        id: `${baseId}-${size}`,
        name: baseName,
        price: sizePrice,
        image: baseImage,
        details: `Size: ${sizeLabel}`
      });
    });
  }

  function renderCategoryQuickLinks() {
    const linksWrap = document.querySelector('[data-category-links]');
    if (!linksWrap) return;

    const categories = getCategories();
    const items = Object.entries(CATEGORY_PAGE_MAP)
      .filter(([key, page]) => key !== 'all' && categories[key] && page)
      .sort((a, b) => {
        const aLabel = categories[a[0]]?.label || a[0];
        const bLabel = categories[b[0]]?.label || b[0];
        return aLabel.localeCompare(bLabel);
      });

    linksWrap.innerHTML = items.map(([key, page]) => {
      const label = categories[key]?.label || key;
      return `<a class="category-chip" href="${escapeHtml(page)}">${escapeHtml(label)}</a>`;
    }).join('');
  }

  function mountWhatsAppFloatingButton() {
    if (document.getElementById('whatsappFloatingLink')) return;

    const button = document.createElement('a');
    button.id = 'whatsappFloatingLink';
    button.className = 'whatsapp-float';
    button.href = buildWhatsAppLink(WHATSAPP_DEFAULT_TEXT);
    button.target = '_blank';
    button.rel = 'noopener noreferrer';
    button.setAttribute('aria-label', 'Chat with Florabella on WhatsApp');
    button.innerHTML = `
      <span class="whatsapp-float-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" role="img" focusable="false">
          <path fill="currentColor" d="M16.03 3.2c-7 0-12.69 5.68-12.69 12.68 0 2.23.58 4.41 1.68 6.34L3 29l6.97-2.25a12.66 12.66 0 0 0 6.06 1.55h.01c7 0 12.69-5.69 12.69-12.69 0-3.39-1.32-6.58-3.71-8.98a12.62 12.62 0 0 0-8.99-3.72zm0 22.98h-.01a10.37 10.37 0 0 1-5.29-1.44l-.38-.22-4.14 1.34 1.35-4.03-.25-.41a10.35 10.35 0 0 1-1.6-5.54c0-5.74 4.67-10.41 10.42-10.41 2.78 0 5.39 1.08 7.35 3.05a10.35 10.35 0 0 1 3.04 7.36c0 5.74-4.67 10.4-10.41 10.4zm5.71-7.81c-.31-.16-1.83-.9-2.11-1-.28-.1-.48-.15-.69.15-.2.31-.79 1-.96 1.2-.18.2-.35.23-.66.08-.31-.16-1.29-.47-2.46-1.49-.9-.8-1.52-1.79-1.69-2.09-.17-.31-.02-.48.13-.63.14-.14.31-.36.47-.54.16-.18.21-.31.31-.51.1-.2.05-.39-.03-.54-.08-.15-.69-1.67-.94-2.28-.25-.6-.5-.52-.69-.52h-.58c-.2 0-.51.08-.77.38-.26.31-1 1-1 2.43s1.03 2.81 1.17 3.01c.15.2 2.02 3.08 4.9 4.32.69.3 1.23.47 1.65.6.69.22 1.32.19 1.81.12.55-.08 1.82-.74 2.08-1.46.26-.72.26-1.33.18-1.46-.08-.13-.28-.2-.59-.36z"/>
        </svg>
      </span>
      <span class="whatsapp-float-text">WhatsApp Us</span>
    `;
    document.body.appendChild(button);
  }

  function renderCartPage() {
    const cartContainer = document.getElementById('cartItems');
    if (!cartContainer) return;

    const emptyState = document.getElementById('cartEmptyState');
    const subtotalEl = document.getElementById('cartSubtotal');
    const totalEl = document.getElementById('cartTotal');
    const checkoutButton = document.getElementById('cartCheckoutBtn');
    const cart = getCart();

    if (!cart.length) {
      cartContainer.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      if (checkoutButton) {
        checkoutButton.setAttribute('aria-disabled', 'true');
        checkoutButton.style.pointerEvents = 'none';
        checkoutButton.style.opacity = '0.5';
      }
      if (subtotalEl) subtotalEl.textContent = toCurrency(0);
      if (totalEl) totalEl.textContent = toCurrency(DELIVERY_FEE);
      return;
    }

    if (emptyState) emptyState.hidden = true;
    if (checkoutButton) {
      checkoutButton.removeAttribute('aria-disabled');
      checkoutButton.style.pointerEvents = 'auto';
      checkoutButton.style.opacity = '1';
    }

    cartContainer.innerHTML = cart.map((item) => `
      <article class="cart-item">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
        <div>
          <h3 class="item-title">${escapeHtml(item.name)}</h3>
          <p class="item-meta">Unit price: ${toCurrency(item.price)}</p>
          ${item.details ? `<p class="item-meta">${escapeHtml(item.details)}</p>` : ''}
          <div class="qty-control">
            <button type="button" data-decrease="${escapeHtml(item.id)}" data-details="${escapeHtml(item.details)}" aria-label="Decrease quantity">-</button>
            <span>${item.quantity}</span>
            <button type="button" data-increase="${escapeHtml(item.id)}" data-details="${escapeHtml(item.details)}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="item-actions">
          <strong>${toCurrency(item.price * item.quantity)}</strong>
          <button type="button" class="link-btn" data-remove="${escapeHtml(item.id)}" data-details="${escapeHtml(item.details)}">Remove</button>
        </div>
      </article>
    `).join('');

    cartContainer.querySelectorAll('[data-decrease]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-decrease');
        const details = button.getAttribute('data-details') || '';
        const target = getCart().find((item) => item.id === id && (item.details || '') === details);
        if (target) updateQuantity(id, details, target.quantity - 1);
      });
    });

    cartContainer.querySelectorAll('[data-increase]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-increase');
        const details = button.getAttribute('data-details') || '';
        const target = getCart().find((item) => item.id === id && (item.details || '') === details);
        if (target) updateQuantity(id, details, target.quantity + 1);
      });
    });

    cartContainer.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-remove');
        const details = button.getAttribute('data-details') || '';
        removeFromCart(id, details);
      });
    });

    const subtotal = getSubtotal(cart);
    if (subtotalEl) subtotalEl.textContent = toCurrency(subtotal);
    if (totalEl) totalEl.textContent = toCurrency(subtotal + DELIVERY_FEE);
  }

  function renderCheckoutSummary() {
    const checkoutItems = document.getElementById('checkoutItems');
    if (!checkoutItems) return;

    const subtotalEl = document.getElementById('checkoutSubtotal');
    const totalEl = document.getElementById('checkoutTotal');
    const emptyState = document.getElementById('checkoutEmptyState');
    const cart = getCart();

    if (!cart.length) {
      checkoutItems.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      if (subtotalEl) subtotalEl.textContent = toCurrency(0);
      if (totalEl) totalEl.textContent = toCurrency(DELIVERY_FEE);
      return;
    }

    if (emptyState) emptyState.hidden = true;
    checkoutItems.innerHTML = cart.map((item) => `
      <article class="checkout-item">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
        <div>
          <p class="item-title">${escapeHtml(item.name)}</p>
          <p class="item-meta">Qty ${item.quantity} x ${toCurrency(item.price)}</p>
          ${item.details ? `<p class="item-meta">${escapeHtml(item.details)}</p>` : ''}
        </div>
        <strong>${toCurrency(item.price * item.quantity)}</strong>
      </article>
    `).join('');

    const subtotal = getSubtotal(cart);
    if (subtotalEl) subtotalEl.textContent = toCurrency(subtotal);
    if (totalEl) totalEl.textContent = toCurrency(subtotal + DELIVERY_FEE);
  }

  function bindClearCart() {
    const clearButton = document.getElementById('clearCartBtn');
    if (!clearButton) return;
    clearButton.addEventListener('click', () => {
      clearCart();
      toast('Cart cleared');
    });
  }
  function isStripeConfigured() {
    const key = String(CONFIG.stripePublishableKey || '').trim();
    const apiBase = String(CONFIG.apiBaseUrl || '').trim();
    if (!window.Stripe) return false;
    if (!key || key.includes('replace_with_your_key')) return false;
    if (!apiBase) return false;
    return true;
  }

  async function sendSubscriberToBackend(subscriber) {
    const apiBase = String(CONFIG.apiBaseUrl || '').trim();
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscriber)
      });
    } catch (_) {
      // keep local fallback
    }
  }

  async function saveSubscriber(subscriber) {
    const normalized = {
      email: String(subscriber.email || '').trim().toLowerCase(),
      birthday: subscriber.birthday ? String(subscriber.birthday) : '',
      birthdayOptIn: Boolean(subscriber.birthdayOptIn),
      seasonalOptIn: Boolean(subscriber.seasonalOptIn),
      source: subscriber.source || 'website',
      createdAt: new Date().toISOString()
    };

    if (!normalized.email) return false;

    const list = readJSON(SUBSCRIBERS_KEY, []);
    const existing = Array.isArray(list) ? list.find((item) => item.email === normalized.email) : null;

    if (existing) {
      existing.birthday = normalized.birthday || existing.birthday || '';
      existing.birthdayOptIn = normalized.birthdayOptIn;
      existing.seasonalOptIn = normalized.seasonalOptIn;
      existing.source = normalized.source;
      existing.updatedAt = new Date().toISOString();
      writeJSON(SUBSCRIBERS_KEY, list);
    } else {
      const nextList = Array.isArray(list) ? list : [];
      nextList.push(normalized);
      writeJSON(SUBSCRIBERS_KEY, nextList);
    }

    await sendSubscriberToBackend(normalized);
    return true;
  }

  function bindNewsletterForms() {
    document.querySelectorAll('[data-newsletter-form]').forEach((form) => {
      const message = form.parentElement?.querySelector('[data-newsletter-message]') || null;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = form.querySelector('input[name="newsletter_email"]')?.value.trim() || '';
        const birthday = form.querySelector('input[name="newsletter_birthday"]')?.value || '';
        const birthdayOptIn = Boolean(form.querySelector('input[name="newsletter_birthday_optin"]')?.checked);
        const seasonalOptIn = Boolean(form.querySelector('input[name="newsletter_seasonal_optin"]')?.checked);

        if (!email) return;

        await saveSubscriber({
          email,
          birthday,
          birthdayOptIn,
          seasonalOptIn,
          source: form.dataset.source || 'newsletter'
        });

        form.reset();
        if (message) {
          message.textContent = 'Subscription saved. We will send birthday and seasonal flower updates based on your preferences.';
        }
      });
    });
  }

  async function redirectToStripeCheckout(payload) {
    const stripe = window.Stripe(CONFIG.stripePublishableKey);
    const response = await fetch(`${CONFIG.apiBaseUrl}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Could not create Stripe checkout session.');
    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
      return;
    }
    if (!data.sessionId) throw new Error('Stripe response missing sessionId.');

    const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });
    if (result.error) throw new Error(result.error.message || 'Stripe redirect failed.');
  }

  function collectCheckoutPayload(form) {
    const cart = getCart();
    const subtotal = getSubtotal(cart);
    return {
      customer: {
        firstName: form.querySelector('#firstName')?.value.trim() || '',
        lastName: form.querySelector('#lastName')?.value.trim() || '',
        email: form.querySelector('#email')?.value.trim() || '',
        phone: form.querySelector('#phone')?.value.trim() || ''
      },
      delivery: {
        address: form.querySelector('#address')?.value.trim() || '',
        city: form.querySelector('#city')?.value.trim() || '',
        zip: form.querySelector('#zip')?.value.trim() || '',
        date: form.querySelector('#deliveryDate')?.value || '',
        notes: form.querySelector('#notes')?.value.trim() || ''
      },
      marketing: {
        birthday: form.querySelector('#checkoutBirthday')?.value || '',
        birthdayOptIn: Boolean(form.querySelector('#checkoutBirthdayOptIn')?.checked),
        seasonalOptIn: Boolean(form.querySelector('#checkoutSeasonalOptIn')?.checked)
      },
      cart,
      totals: {
        subtotal,
        deliveryFee: DELIVERY_FEE,
        total: subtotal + DELIVERY_FEE
      }
    };
  }

  function bindPaymentMethodSwitch() {
    const paymentOptions = document.querySelectorAll('input[name="payment_method"]');
    if (!paymentOptions.length) return;

    const manualFields = document.getElementById('manualCardFields');
    const stripeHint = document.getElementById('stripeSetupHint');
    const stripeReady = isStripeConfigured();

    if (stripeHint) {
      stripeHint.textContent = stripeReady
        ? 'Stripe is configured. You will be redirected to Stripe secure checkout.'
        : 'Stripe is not configured yet. Add your publishable key and backend endpoint in config.js.';
      stripeHint.classList.toggle('warning', !stripeReady);
    }

    function applyVisibility() {
      const selected = document.querySelector('input[name="payment_method"]:checked')?.value || 'manual';
      if (manualFields) manualFields.hidden = selected !== 'manual';
    }

    if (!stripeReady) {
      const manualOption = document.querySelector('input[name="payment_method"][value="manual"]');
      if (manualOption) manualOption.checked = true;
    }

    paymentOptions.forEach((option) => option.addEventListener('change', applyVisibility));
    applyVisibility();
  }

  function bindCheckoutForm() {
    const checkoutForm = document.getElementById('checkoutForm');
    if (!checkoutForm) return;

    checkoutForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('checkoutMessage');
      const submitButton = checkoutForm.querySelector('button[type="submit"]');

      if (!canShop()) {
        if (message) {
          message.textContent = 'Please register/login and subscribe before checkout.';
          message.style.color = '#9f2d2d';
        }
        showAuthRequirementNotice();
        return;
      }

      const cart = getCart();
      if (!cart.length) {
        if (message) {
          message.textContent = 'Your cart is empty. Add flowers before placing your order.';
          message.style.color = '#9f2d2d';
        }
        return;
      }

      const payload = collectCheckoutPayload(checkoutForm);
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'manual';

      if (payload.marketing.birthdayOptIn || payload.marketing.seasonalOptIn) {
        await saveSubscriber({
          email: payload.customer.email,
          birthday: payload.marketing.birthday,
          birthdayOptIn: payload.marketing.birthdayOptIn,
          seasonalOptIn: payload.marketing.seasonalOptIn,
          source: 'checkout'
        });
      }

      if (submitButton) submitButton.disabled = true;
      if (message) message.textContent = '';

      try {
        if (paymentMethod === 'stripe') {
          if (!isStripeConfigured()) {
            throw new Error('Stripe is not configured yet. Update config.js with your Stripe publishable key and API URL.');
          }
          await redirectToStripeCheckout(payload);
          return;
        }

        const orderId = `FB${Date.now().toString().slice(-8)}`;
        localStorage.setItem('florabella_last_order_id', orderId);
        clearCart();
        window.location.href = `order-confirmation.html?order=${orderId}`;
      } catch (error) {
        if (message) {
          message.textContent = error.message || 'Checkout failed. Please try again.';
          message.style.color = '#9f2d2d';
        }
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  function bindRegistrationForm() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const message = document.getElementById('registerMessage');
      const submitButton = registerForm.querySelector('button[type="submit"]');

      const firstName = registerForm.querySelector('input[name="first_name"]')?.value.trim() || '';
      const lastName = registerForm.querySelector('input[name="last_name"]')?.value.trim() || '';
      const email = registerForm.querySelector('input[name="email"]')?.value.trim().toLowerCase() || '';
      const password = registerForm.querySelector('input[name="password"]')?.value.trim() || '';
      const dob = registerForm.querySelector('input[name="dob"]')?.value || '';
      const spouseName = registerForm.querySelector('input[name="spouse_name"]')?.value.trim() || '';
      const spouseEmail = registerForm.querySelector('input[name="spouse_email"]')?.value.trim().toLowerCase() || '';
      const spousePhone = registerForm.querySelector('input[name="spouse_phone"]')?.value.trim() || '';
      const spouseDob = registerForm.querySelector('input[name="spouse_dob"]')?.value || '';
      const subscribeOptIn = Boolean(registerForm.querySelector('input[name="register_subscribe"]')?.checked);

      if (!firstName || !lastName || !email || !password || !dob) {
        if (message) {
          message.textContent = 'Please complete all required registration fields.';
          message.style.color = '#9f2d2d';
        }
        return;
      }

      if (!subscribeOptIn) {
        if (message) {
          message.textContent = 'Subscription is required before shopping.';
          message.style.color = '#9f2d2d';
        }
        return;
      }

      if (submitButton) submitButton.disabled = true;

      const users = getRegisteredUsers();
      const existingIndex = users.findIndex((user) => user.email === email);
      const nextUser = {
        firstName,
        lastName,
        email,
        password,
        dob,
        spouseName,
        spouseEmail,
        spousePhone,
        spouseDob,
        subscribed: true
      };

      if (existingIndex >= 0) {
        users[existingIndex] = nextUser;
      } else {
        users.push(nextUser);
      }
      saveRegisteredUsers(users);
      setCurrentUser(nextUser);

      await saveSubscriber({
        email,
        birthday: dob,
        birthdayOptIn: true,
        seasonalOptIn: true,
        source: 'register-home'
      });

      if (spouseEmail) {
        await saveSubscriber({
          email: spouseEmail,
          birthday: spouseDob,
          birthdayOptIn: true,
          seasonalOptIn: true,
          source: 'register-spouse'
        });
      }

      if (message) {
        message.textContent = 'Registration complete. Redirecting you to shop now...';
        message.style.color = '#0e6d2d';
      }

      setTimeout(() => {
        window.location.href = 'all-flowers.html';
      }, 900);
    });
  }

  function bindLoginForm() {
    const forms = [];
    const loginForm = document.getElementById('loginForm');
    if (loginForm) forms.push(loginForm);
    document.querySelectorAll('[data-login-form]').forEach((form) => {
      if (!forms.includes(form)) forms.push(form);
    });
    if (!forms.length) return;

    forms.forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();

        const emailInput = form.querySelector('input[name="email"]');
        const passwordInput = form.querySelector('input[name="password"]');
        const message = form.querySelector('[data-login-message]') || document.getElementById('loginMessage');
        if (!emailInput || !passwordInput) return;

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();

        if (!email || !password) {
          if (message) {
            message.textContent = 'Please enter both email and password.';
            message.style.color = '#9f2d2d';
          }
          return;
        }

        const user = findRegisteredUserByEmail(email);
        if (!user || user.password !== password) {
          if (message) {
            message.textContent = 'Account not found. Please register first.';
            message.style.color = '#9f2d2d';
          }
          return;
        }

        if (!user.subscribed) {
          if (message) {
            message.textContent = 'Your account must be subscribed before shopping.';
            message.style.color = '#9f2d2d';
          }
          return;
        }

        setCurrentUser(user);
        if (message) {
          message.textContent = `Logged in as ${email}. Redirecting...`;
          message.style.color = '#0e6d2d';
        }

        setTimeout(() => {
          window.location.href = 'all-flowers.html';
        }, 800);
      });
    });
  }

  function bindHomeHeroSlider() {
    const slides = [...document.querySelectorAll('[data-hero-slide]')];
    if (slides.length < 2) return;

    let currentIndex = 0;

    setInterval(() => {
      slides[currentIndex].classList.remove('active');
      currentIndex = (currentIndex + 1) % slides.length;
      slides[currentIndex].classList.add('active');
    }, 3000);
  }

  function showQueuedAuthNotice() {
    const queued = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (!queued) return;

    const notice = document.getElementById('homeAuthNotice');
    if (notice) {
      notice.hidden = false;
      notice.textContent = queued;
    }
    sessionStorage.removeItem(AUTH_NOTICE_KEY);
  }

  function bindCustomBouquetBuilder() {
    const form = document.getElementById('customBuilderForm');
    if (!form) return;

    const stemList = document.getElementById('customStemList');
    const totalNode = document.getElementById('customBouquetTotal');
    const countNode = document.getElementById('customStemCount');
    const message = document.getElementById('customBuilderMessage');
    const stems = getStems();
    if (!stemList || !stems.length) return;

    stemList.innerHTML = stems.map((stem) => `
      <label class="stem-card">
        <img src="${escapeHtml(stem.image)}" alt="${escapeHtml(stem.name)}">
        <div><strong>${escapeHtml(stem.name)}</strong><p>${toCurrency(stem.price)} per stem</p></div>
        <input type="number" min="0" max="40" step="1" value="0" data-stem-id="${escapeHtml(stem.id)}" data-stem-name="${escapeHtml(stem.name)}" data-stem-price="${escapeHtml(stem.price)}" data-stem-image="${escapeHtml(stem.image)}" aria-label="Quantity for ${escapeHtml(stem.name)}">
      </label>
    `).join('');

    function calculate() {
      const sizeMultiplier = Number(form.querySelector('#customSize')?.value || 1);
      const includeVase = Boolean(form.querySelector('#customVase')?.checked);
      let stemCount = 0;
      let stemsSubtotal = 0;
      stemList.querySelectorAll('input[data-stem-id]').forEach((input) => {
        const qty = Math.max(0, Number(input.value || 0));
        const unit = Number(input.getAttribute('data-stem-price') || 0);
        stemCount += qty;
        stemsSubtotal += qty * unit;
      });
      const total = (stemsSubtotal * sizeMultiplier) + (includeVase ? 22 : 0) + (stemCount > 0 ? 16 : 0);
      if (totalNode) totalNode.textContent = toCurrency(total);
      if (countNode) countNode.textContent = `${stemCount} stems selected`;
      return { stemCount, total, includeVase };
    }

    form.addEventListener('input', calculate);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const metrics = calculate();
      if (!metrics.stemCount) {
        if (message) {
          message.textContent = 'Add at least one flower stem to build your bouquet.';
          message.style.color = '#9f2d2d';
        }
        return;
      }

      const selected = [];
      let previewImage = '';
      stemList.querySelectorAll('input[data-stem-id]').forEach((input) => {
        const qty = Math.max(0, Number(input.value || 0));
        if (!qty) return;
        const name = input.getAttribute('data-stem-name') || 'Stem';
        const image = input.getAttribute('data-stem-image') || '';
        selected.push(`${qty}x ${name}`);
        if (!previewImage) previewImage = image;
      });

      const bouquetName = form.querySelector('#customName')?.value.trim() || 'Custom Mix Bouquet';
      const sizeLabel = form.querySelector('#customSize option:checked')?.textContent || 'Classic';
      const wrapLabel = form.querySelector('#customWrap option:checked')?.textContent || 'Ivory Wrap';
      const vaseLabel = metrics.includeVase ? 'Glass vase included' : 'No vase';
      const details = `${sizeLabel} | ${wrapLabel} | ${vaseLabel} | ${selected.join(', ')}`;

      addToCart({
        id: `custom-${Date.now()}`,
        name: bouquetName,
        price: Number(metrics.total.toFixed(2)),
        image: previewImage || 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=900&h=1100&fit=crop',
        details,
        quantity: 1
      });

      if (message) {
        message.textContent = `${bouquetName} added to cart.`;
        message.style.color = '#0e6d2d';
      }

      form.reset();
      calculate();
    });

    calculate();
  }
  function createManagerRow(item = {}) {
    return `
      <tr>
        <td><input type="text" data-field="id" value="${escapeHtml(item.id || '')}" placeholder="auto if empty"></td>
        <td><input type="text" data-field="name" value="${escapeHtml(item.name || '')}" placeholder="Flower name"></td>
        <td><input type="text" data-field="category" value="${escapeHtml(item.category || '')}" placeholder="roses"></td>
        <td><input type="number" data-field="price" value="${escapeHtml(item.price || '')}" min="1" step="0.01"></td>
        <td><input type="text" data-field="description" value="${escapeHtml(item.description || '')}" placeholder="Short description"></td>
        <td><input type="text" data-field="image" value="${escapeHtml(item.image || '')}" placeholder="Image URL"></td>
        <td><button class="btn btn-ghost btn-sm" type="button" data-row-action="remove">Remove</button></td>
      </tr>
    `;
  }

  function bindCatalogManager() {
    const tableBody = document.getElementById('catalogTableBody');
    if (!tableBody) return;

    const addRowButton = document.getElementById('addFlowerRow');
    const saveButton = document.getElementById('saveCatalogBtn');
    const resetButton = document.getElementById('resetCatalogBtn');
    const exportButton = document.getElementById('exportCatalogBtn');
    const importButton = document.getElementById('importCatalogBtn');
    const copyButton = document.getElementById('copyCatalogJsonBtn');
    const message = document.getElementById('catalogMessage');
    const exportArea = document.getElementById('catalogExportJson');

    function renderRows(data) {
      tableBody.innerHTML = data.map((item) => createManagerRow(item)).join('');
    }

    function collectRows() {
      const rows = [...tableBody.querySelectorAll('tr')];
      return rows.map((row, index) => {
        const id = row.querySelector('[data-field="id"]')?.value.trim() || '';
        const name = row.querySelector('[data-field="name"]')?.value.trim() || '';
        const category = row.querySelector('[data-field="category"]')?.value.trim().toLowerCase() || 'seasonal';
        const price = Number(row.querySelector('[data-field="price"]')?.value || 0);
        const description = row.querySelector('[data-field="description"]')?.value.trim() || '';
        const image = row.querySelector('[data-field="image"]')?.value.trim() || '';
        if (!name || price <= 0) return null;

        return normalizeProduct({
          id: id || `${slugify(name)}-${index + 1}`,
          name,
          category,
          price,
          description,
          image
        }, index);
      }).filter(Boolean);
    }

    renderRows(getCatalog());

    tableBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-row-action="remove"]');
      if (!button) return;
      const row = button.closest('tr');
      if (row) row.remove();
    });

    if (addRowButton) addRowButton.addEventListener('click', () => tableBody.insertAdjacentHTML('beforeend', createManagerRow()));

    if (saveButton) {
      saveButton.addEventListener('click', () => {
        const nextCatalog = collectRows();
        if (!nextCatalog.length) {
          if (message) {
            message.textContent = 'Add at least one flower before saving.';
            message.style.color = '#9f2d2d';
          }
          return;
        }

        writeJSON(CATALOG_OVERRIDE_KEY, nextCatalog);
        if (exportArea) exportArea.value = JSON.stringify(nextCatalog, null, 2);
        if (message) {
          message.textContent = 'Catalog override saved. Product pages now use this updated flower list.';
          message.style.color = '#0e6d2d';
        }
        renderCatalogSections();
        renderAllFlowersExplorer();
      });
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        localStorage.removeItem(CATALOG_OVERRIDE_KEY);
        renderRows(getCatalog());
        if (exportArea) exportArea.value = '';
        if (message) {
          message.textContent = 'Catalog reset to default flowers-data.js list.';
          message.style.color = '#0e6d2d';
        }
        renderCatalogSections();
        renderAllFlowersExplorer();
      });
    }

    if (exportButton) {
      exportButton.addEventListener('click', () => {
        const data = collectRows();
        if (exportArea) exportArea.value = JSON.stringify(data, null, 2);
      });
    }

    if (importButton) {
      importButton.addEventListener('click', () => {
        if (!exportArea) return;
        try {
          const parsed = JSON.parse(exportArea.value);
          if (!Array.isArray(parsed)) throw new Error('JSON must be an array of flowers.');
          const normalized = parsed.map(normalizeProduct);
          writeJSON(CATALOG_OVERRIDE_KEY, normalized);
          renderRows(normalized);
          if (message) {
            message.textContent = 'Catalog imported successfully.';
            message.style.color = '#0e6d2d';
          }
          renderCatalogSections();
          renderAllFlowersExplorer();
        } catch (error) {
          if (message) {
            message.textContent = `Import failed: ${error.message}`;
            message.style.color = '#9f2d2d';
          }
        }
      });
    }

    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        if (!exportArea || !exportArea.value.trim()) return;
        try {
          await navigator.clipboard.writeText(exportArea.value);
          if (message) {
            message.textContent = 'JSON copied to clipboard.';
            message.style.color = '#0e6d2d';
          }
        } catch (_) {
          if (message) {
            message.textContent = 'Clipboard copy failed. You can copy manually from the textarea.';
            message.style.color = '#9f2d2d';
          }
        }
      });
    }
  }

  function setFooterYear() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-year]').forEach((el) => {
      el.textContent = year;
    });
  }

  function setActiveNav() {
    const page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll('[data-nav]').forEach((link) => {
      link.classList.toggle('active', link.dataset.nav === page);
    });
  }

  function bindNavToggle() {
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('mainNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(nav.classList.contains('open')));
    });
  }

  function revealOnScroll() {
    const revealItems = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || !revealItems.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    revealItems.forEach((item) => observer.observe(item));
  }

  function showOrderId() {
    const orderNode = document.getElementById('orderId');
    if (!orderNode) return;

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('order') || params.get('session_id') || params.get('payment_intent');
    const fromStorage = localStorage.getItem('florabella_last_order_id');
    orderNode.textContent = fromQuery || fromStorage || 'Pending';
  }

  function toast(message) {
    const node = document.createElement('div');
    node.textContent = message;
    node.style.position = 'fixed';
    node.style.bottom = '18px';
    node.style.right = '18px';
    node.style.zIndex = '9999';
    node.style.background = '#2a231d';
    node.style.color = '#fff';
    node.style.padding = '10px 14px';
    node.style.borderRadius = '10px';
    node.style.fontSize = '13px';
    node.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    document.body.appendChild(node);

    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity 0.2s ease';
      setTimeout(() => node.remove(), 220);
    }, 1200);
  }

  function init() {
    setFooterYear();
    setActiveNav();
    bindNavToggle();
    bindAddToCartDelegation();
    bindHomeHeroSlider();
    showQueuedAuthNotice();
    renderCatalogSections();
    renderAllFlowersExplorer();
    renderCategoryQuickLinks();
    bindCustomBouquetBuilder();
    bindRegistrationForm();

    bindClearCart();
    bindPaymentMethodSwitch();
    bindCheckoutForm();
    bindLoginForm();
    bindNewsletterForms();
    bindCatalogManager();

    updateCartBadges();
    renderCartPage();
    renderCheckoutSummary();
    revealOnScroll();
    showOrderId();
    mountWhatsAppFloatingButton();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
