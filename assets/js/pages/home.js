/* ============================================
   HALAMAN HOME — Order / Katalog Produk
   Grid & List mode, counter qty, cart bar
   Cart & draft key per-user (isolasi antar user)
   ============================================ */

let _homeProdukCache = [];
let _homeKategoriMap = {};
let _homeView = "grid";
let _homeFilterKategori = "";
let _homeCart = {};   // { produk_id: qty }

/* ---------- CART GLOBAL per-USER (dipakai Home & Order) ---------- */

function _homeCartKey() {
  const userId = sessionStorage.getItem("login");
  return userId ? `cart:${userId}` : "cart:anon";
}

function getCart() {
  try {
    const raw = sessionStorage.getItem(_homeCartKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveCart(cart) {
  try { sessionStorage.setItem(_homeCartKey(), JSON.stringify(cart)); } catch (e) { }
  updateNavCartBadge();
}

function updateNavCartBadge() {
  const badge = document.getElementById("navCartBadge");
  if (!badge) return;
  const cart = getCart();
  let total = 0;
  Object.keys(cart).forEach(function (id) { total += cart[id] || 0; });
  if (total > 0) {
    badge.textContent = total > 99 ? "99+" : String(total);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

window.getCart = getCart;
window.saveCart = saveCart;
window.updateNavCartBadge = updateNavCartBadge;

/* ---------- View Toggle ---------- */
function setHomeView(view) {
  _homeView = view === "list" ? "list" : "grid";
  try { localStorage.setItem("homeView", _homeView); } catch (e) { }

  const list = document.getElementById("homeProdukList");
  if (list) {
    list.classList.toggle("is-grid", _homeView === "grid");
    list.classList.toggle("is-list", _homeView === "list");
  }

  document.querySelectorAll(".view-toggle__btn").forEach(function (btn) {
    const active = btn.dataset.view === _homeView;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

/* ---------- Badge Filter Kategori ---------- */
function renderHomeFilterBadges() {
  const container = document.getElementById("homeFilter");
  if (!container) return;

  const usedIds = {};
  _homeProdukCache.forEach(function (p) {
    if (p.kategori) usedIds[p.kategori] = true;
  });

  const items = [{ id: "", name: "Semua" }];
  Object.keys(usedIds).forEach(function (id) {
    const name = _homeKategoriMap[id];
    if (name) items.push({ id: id, name: name });
  });
  items.slice(1).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  if (_homeFilterKategori && !usedIds[_homeFilterKategori]) {
    _homeFilterKategori = "";
  }

  container.innerHTML = items.map(function (it) {
    const active = _homeFilterKategori === it.id;
    return `<button type="button"
                    class="produk-filter__badge${active ? " is-active" : ""}"
                    data-filter-kategori="${escapeHTML(it.id)}"
                    role="tab"
                    aria-selected="${active ? "true" : "false"}">
                    ${escapeHTML(it.name)}
                </button>`;
  }).join("");
}

/* ---------- Render Produk List ---------- */
function renderHomeProdukList(filter = "") {
  const list = document.getElementById("homeProdukList");
  const empty = document.getElementById("homeEmpty");
  const countEl = document.getElementById("homeProdukCount");
  if (!list) return;

  const q = filter.trim().toLowerCase();
  const filtered = _homeProdukCache.filter(function (p) {
    if (_homeFilterKategori && p.kategori !== _homeFilterKategori) return false;
    const name = (p.name || "").toLowerCase();
    const kat = (_homeKategoriMap[p.kategori] || "").toLowerCase();
    return name.includes(q) || kat.includes(q);
  });

  if (countEl) {
    countEl.textContent = q
      ? `${filtered.length} hasil pencarian`
      : `${_homeProdukCache.length} Produk`;
  }

  list.innerHTML = filtered.map(function (p) {
    const nama = escapeHTML(p.name || "");
    const katName = escapeHTML(_homeKategoriMap[p.kategori] || "-");
    const harga = "Rp " + Number(p.harga_jual || 0).toLocaleString("id-ID");
    const qty = _homeCart[p.id] || 0;

    let imgHTML;
    if (p.image_base64) {
      imgHTML = `<img class="produk-card__img" src="${p.image_base64}" alt="${nama}" loading="lazy"
                    data-action="home-add-qty" data-id="${p.id}" role="button" tabindex="0">`;
    } else {
      imgHTML = `<div class="produk-card__img produk-card__img--empty"
                    data-action="home-add-qty" data-id="${p.id}" role="button" tabindex="0">
                   <i class="fa-regular fa-image" aria-hidden="true"></i>
               </div>`;
    }

    return `
            <div class="produk-card" data-id="${p.id}">
                <div class="produk-card__media">${imgHTML}</div>
                <div class="produk-card__body">
                    <div class="produk-card__header-row">
                        <h3 class="produk-card__name">${nama}</h3>
                        
                        <div class="qty-stepper" data-stepper-id="${p.id}">
                            <button type="button" class="qty-stepper__btn qty-stepper__btn--minus"
                                    data-action="home-dec-qty" data-id="${p.id}"
                                    aria-label="Kurangi" ${qty === 0 ? "disabled" : ""}>
                                <i class="fa-solid fa-minus" aria-hidden="true"></i>
                            </button>
                            <input type="number" class="qty-stepper__input"
                                   data-action="home-qty-input" data-id="${p.id}"
                                   value="${qty}" min="0" inputmode="numeric"
                                   aria-label="Jumlah">
                            <button type="button" class="qty-stepper__btn qty-stepper__btn--plus"
                                    data-action="home-add-qty" data-id="${p.id}"
                                    aria-label="Tambah">
                                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>

                    <span class="produk-card__kategori">
                        <i class="fa-solid fa-tag" aria-hidden="true"></i>${katName}
                    </span>
                    <span class="produk-card__harga">${harga}</span>
                </div>
            </div>
        `;
  }).join("");

  if (empty) {
    if (_homeProdukCache.length === 0) {
      empty.style.display = "flex";
      empty.innerHTML = `<i class="fa-solid fa-box-open" aria-hidden="true"></i><p>Belum ada produk.</p>`;
    } else if (filtered.length === 0) {
      empty.style.display = "flex";
      empty.innerHTML = `<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>Tidak ada produk yang cocok.</p>`;
    } else {
      empty.style.display = "none";
    }
  }
}

/* ---------- Load Data ---------- */
async function loadHomeFromDB() {
  try {
    _homeProdukCache = await db.produk
      .filter(function (p) { return !p.deleted_at; })
      .toArray();

    _homeProdukCache.sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });

    const kats = await db.kategori
      .filter(function (k) { return !k.deleted_at; })
      .toArray();
    _homeKategoriMap = {};
    kats.forEach(function (k) { _homeKategoriMap[k.id] = k.name; });

    renderHomeFilterBadges();

    const search = document.getElementById("searchHome");
    renderHomeProdukList(search ? search.value : "");
    updateCartBar();
  } catch (err) {
    console.error("[home] Gagal memuat:", err);
    const list = document.getElementById("homeProdukList");
    if (list) {
      list.innerHTML = `
                <div class="page__placeholder">
                    <i class="fa-solid fa-triangle-exclamation page__placeholder-icon"></i>
                    <h2 class="page__placeholder-title">Gagal memuat</h2>
                    <p class="page__placeholder-text">${escapeHTML(err.message || "Terjadi kesalahan")}</p>
                </div>`;
    }
  }
}

/* ---------- Cart Bar ---------- */
function updateCartBar() {
  const bar = document.getElementById("cartBar");
  const countEl = document.getElementById("cartCount");
  const totalEl = document.getElementById("cartTotal");
  const page = document.querySelector(".page--home");
  if (!bar) return;

  let totalItems = 0;
  let totalHarga = 0;

  Object.keys(_homeCart).forEach(function (id) {
    const qty = _homeCart[id] || 0;
    if (qty <= 0) return;
    totalItems += qty;
    const p = _homeProdukCache.find(function (x) { return x.id === id; });
    if (p) totalHarga += Number(p.harga_jual || 0) * qty;
  });

  if (totalItems === 0) {
    bar.hidden = true;
    if (page) page.classList.remove("has-cart");
    return;
  }

  bar.hidden = false;
  if (page) page.classList.add("has-cart");

  if (countEl) countEl.textContent = `${totalItems} item`;
  if (totalEl) totalEl.textContent = "Rp " + totalHarga.toLocaleString("id-ID");
}

/* ---------- Aksi Counter ---------- */
let _syncTimer = null;
function setQty(id, qty) {
  qty = Math.max(0, Math.floor(qty) || 0);
  if (qty === 0) delete _homeCart[id];
  else _homeCart[id] = qty;

  saveCart(_homeCart);

  const stepper = document.querySelector(`.qty-stepper[data-stepper-id="${id}"]`);
  if (stepper) {
    const input = stepper.querySelector(".qty-stepper__input");
    const minusBtn = stepper.querySelector(".qty-stepper__btn--minus");
    if (input) input.value = qty;
    if (minusBtn) minusBtn.disabled = qty === 0;
  }

  updateCartBar();

  if (typeof syncCartToDB === "function") {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async function () {
      try {
        await syncCartToDB(_homeCart, _homeProdukCache, _homeKategoriMap);
      } catch (err) {
        console.error("[home] Sinkron cart gagal:", err);
      }
    }, 300);
  }
}

function addQty(id, delta) {
  const cur = _homeCart[id] || 0;
  setQty(id, cur + delta);
}

/* ============================================
   EVENT DELEGATION QTY — DIPASANG SEKALI DI DOCUMENT
   ============================================ */
if (!window._homeQtyBound) {
  window._homeQtyBound = true;

  document.addEventListener("click", function (e) {
    if (!document.querySelector(".page--home")) return;

    const addBtn = e.target.closest("[data-action='home-add-qty']");
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      addQty(addBtn.dataset.id, 1);
      return;
    }
    const decBtn = e.target.closest("[data-action='home-dec-qty']");
    if (decBtn) {
      e.preventDefault();
      e.stopPropagation();
      addQty(decBtn.dataset.id, -1);
      return;
    }
  });

  document.addEventListener("input", function (e) {
    if (!document.querySelector(".page--home")) return;
    const inp = e.target.closest("[data-action='home-qty-input']");
    if (!inp) return;
    const id = inp.dataset.id;
    const val = parseInt(inp.value, 10);
    if (isNaN(val)) return;
    setQty(id, val);
  });

  document.addEventListener("blur", function (e) {
    if (!document.querySelector(".page--home")) return;
    const inp = e.target.closest("[data-action='home-qty-input']");
    if (!inp) return;
    const id = inp.dataset.id;
    inp.value = _homeCart[id] || 0;
  }, true);
}

/* ---------- Init ---------- */
async function initHome() {
  try {
    const saved = localStorage.getItem("homeView");
    if (saved === "grid" || saved === "list") _homeView = saved;
  } catch (e) { }

  _homeCart = getCart();
  _homeFilterKategori = "";

  setHomeView(_homeView);
  await loadHomeFromDB();

  // Pulihkan / sinkron draft penjualan bila cart sudah ada
  if (Object.keys(_homeCart).length > 0 && typeof syncCartToDB === "function") {
    try {
      await syncCartToDB(_homeCart, _homeProdukCache, _homeKategoriMap);
    } catch (err) {
      console.error("[home] Gagal pulihkan draft:", err);
    }
  }

  // Search
  const search = document.getElementById("searchHome");
  if (search) {
    search.addEventListener("input", function (e) {
      renderHomeProdukList(e.target.value);
    });
  }

  // Toggle view
  document.querySelectorAll(".view-toggle__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setHomeView(btn.dataset.view);
    });
  });

  // Filter kategori
  const filterEl = document.getElementById("homeFilter");
  if (filterEl) {
    filterEl.addEventListener("click", function (e) {
      const badge = e.target.closest("[data-filter-kategori]");
      if (!badge) return;
      const val = badge.dataset.filterKategori || "";
      if (_homeFilterKategori === val) return;
      _homeFilterKategori = val;
      renderHomeFilterBadges();
      const search = document.getElementById("searchHome");
      renderHomeProdukList(search ? search.value : "");
    });
  }

  // Tombol Checkout
  const btnBayar = document.getElementById("btnBayar");
  if (btnBayar) {
    btnBayar.addEventListener("click", function () {
      const cart = getCart();
      let total = 0;
      Object.keys(cart).forEach(function (id) { total += cart[id] || 0; });
      if (total === 0) return;
      navigateTo("order");
    });
  }
}
