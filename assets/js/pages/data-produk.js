/* ============================================
   HALAMAN DATA PRODUK
   List + CRUD (Dexie), 2 mode tampilan
   ============================================ */

let _produkCache = [];
let _produkKategoriMap = {};   // { id: name }
let _produkView = "grid";      // "grid" | "list"
let _produkFilterKategori = ""; // "" = semua, atau id kategori

function setProdukView(view) {
    _produkView = view === "list" ? "list" : "grid";

    // Simpan preferensi
    try { localStorage.setItem("produkView", _produkView); } catch (e) { }

    const list = document.getElementById("produkList");
    if (list) {
        list.classList.toggle("is-grid", _produkView === "grid");
        list.classList.toggle("is-list", _produkView === "list");
    }

    document.querySelectorAll(".view-toggle__btn").forEach(function (btn) {
        const active = btn.dataset.view === _produkView;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
}

/* ============================================
   RENDER BADGE FILTER KATEGORI
   ============================================ */
function renderProdukFilterBadges() {
    const container = document.getElementById("produkFilter");
    if (!container) return;

    // Susun daftar kategori (hanya yang punya produk aktif)
    const usedIds = {};
    _produkCache.forEach(function (p) {
        if (p.kategori) usedIds[p.kategori] = true;
    });

    const items = [];
    // "Semua" selalu tampil
    items.push({ id: "", name: "Semua" });

    // Kategori yang dipakai, urut nama
    Object.keys(usedIds).forEach(function (id) {
        const name = _produkKategoriMap[id];
        if (name) items.push({ id: id, name: name });
    });
    items.slice(1).sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    // Pastikan filter yang aktif masih valid
    if (_produkFilterKategori && !usedIds[_produkFilterKategori]) {
        _produkFilterKategori = "";
    }

    container.innerHTML = items.map(function (it) {
        const active = _produkFilterKategori === it.id;
        return `<button type="button"
                    class="produk-filter__badge${active ? " is-active" : ""}"
                    data-filter-kategori="${escapeHTML(it.id)}"
                    role="tab"
                    aria-selected="${active ? "true" : "false"}">
                    ${escapeHTML(it.name)}
                </button>`;
    }).join("");
}

let _produkUserMap = {};   // { id_user: {name, username} }

/* ---------- Render list (tambahkan pemilik) ---------- */
function renderProdukList(filter = "") {
  const list = document.getElementById("produkList");
  const empty = document.getElementById("produkEmpty");
  const countEl = document.getElementById("produkCount");
  if (!list) return;

  const q = filter.trim().toLowerCase();
  const filtered = _produkCache.filter(function (p) {
    if (_produkFilterKategori && p.kategori !== _produkFilterKategori) return false;
    const name = (p.name || "").toLowerCase();
    const kat = (_produkKategoriMap[p.kategori] || "").toLowerCase();
    return name.includes(q) || kat.includes(q);
  });

  if (countEl) {
    countEl.textContent = q
      ? `${filtered.length} hasil pencarian`
      : `${_produkCache.length} produk`;
  }

  list.innerHTML = filtered.map(function (p) {
    const nama = escapeHTML(p.name || "");
    const katName = escapeHTML(_produkKategoriMap[p.kategori] || "-");
    const harga = "Rp " + Number(p.harga_jual || 0).toLocaleString("id-ID");

    // ⬇️ Pemilik
    const owner = _produkUserMap[p.id_user];
    const ownerName = owner ? (owner.username || owner.name || "") : "";
    const ownerHTML = ownerName
      ? `<span class="produk-card__owner" title="Pemilik: ${escapeHTML(owner.name || ownerName)}">
                 <i class="fa-solid fa-user" aria-hidden="true"></i>${escapeHTML(ownerName)}
               </span>`
      : "";

    let imgHTML;
    if (p.image_base64) {
      imgHTML = `<img class="produk-card__img" src="${p.image_base64}" alt="${nama}" loading="lazy"
                    data-action="preview-produk-img" data-id="${p.id}" role="button" tabindex="0">`;
    } else {
      imgHTML = `<div class="produk-card__img produk-card__img--empty">
                   <i class="fa-regular fa-image" aria-hidden="true"></i>
               </div>`;
    }

    const stok = Number(p.stok || 0);
    const stokHTML = `<span class="produk-card__stok">
        <i class="fa-solid fa-cubes" aria-hidden="true"></i>Stok : ${stok.toLocaleString("id-ID")}
    </span>`;

    return `
            <div class="produk-card" data-id="${p.id}">
                <div class="produk-card__media">${imgHTML}</div>
                <div class="produk-card__body">
                    <h3 class="produk-card__name">${nama}</h3>
                    <div class="produk-card__meta">
                        <span class="produk-card__kategori">
                            <i class="fa-solid fa-tag" aria-hidden="true"></i>${katName}
                        </span>
                        ${stokHTML}
                        ${ownerHTML}
                    </div>
                    <span class="produk-card__harga">${harga}</span>
                </div>
                <div class="produk-card__actions">
                    <button type="button" class="kategori-card__btn kategori-card__btn--edit"
                            data-action="edit-produk" data-id="${p.id}" aria-label="Edit">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="kategori-card__btn kategori-card__btn--delete"
                            data-action="delete-produk" data-id="${p.id}"
                            data-name="${nama}" aria-label="Hapus">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `;
  }).join("");

  if (empty) {
    if (_produkCache.length === 0) {
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

/* ---------- Load DB (tambahkan load user) ---------- */
async function loadProdukFromDB() {
  try {
    _produkCache = await db.produk
      .filter(function (p) { return !p.deleted_at; })
      .toArray();
    _produkCache.sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });

    const kats = await db.kategori
      .filter(function (k) { return !k.deleted_at; })
      .toArray();
    _produkKategoriMap = {};
    kats.forEach(function (k) { _produkKategoriMap[k.id] = k.name; });

    // ⬇️ Load user map
    const users = await db.user
      .filter(function (u) { return !u.deleted_at; })
      .toArray();
    _produkUserMap = {};
    users.forEach(function (u) { _produkUserMap[u.id] = u; });

    renderProdukFilterBadges();
    const search = document.getElementById("searchProduk");
    renderProdukList(search ? search.value : "");
  } catch (err) {
    console.error("[data-produk] Gagal memuat:", err);
    const list = document.getElementById("produkList");
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

async function initDataProduk() {
    // Ambil preferensi view
    try {
        const saved = localStorage.getItem("produkView");
        if (saved === "grid" || saved === "list") _produkView = saved;
    } catch (e) { }

    setProdukView(_produkView);
    await loadProdukFromDB();
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        const img = e.target.closest("[data-action='preview-produk-img']");
        if (!img) return;
        e.preventDefault();
        img.click();
    });

    // Search
    const search = document.getElementById("searchProduk");
    if (search) {
        search.addEventListener("input", function (e) {
            renderProdukList(e.target.value);
        });
    }

    // Toggle view
    document.querySelectorAll(".view-toggle__btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            setProdukView(btn.dataset.view);
        });
    });

    // Filter kategori via badge
    const filterEl = document.getElementById("produkFilter");
    if (filterEl) {
        filterEl.addEventListener("click", function (e) {
            const badge = e.target.closest("[data-filter-kategori]");
            if (!badge) return;
            const val = badge.dataset.filterKategori || "";
            if (_produkFilterKategori === val) return;
            _produkFilterKategori = val;
            renderProdukFilterBadges();
            const search = document.getElementById("searchProduk");
            renderProdukList(search ? search.value : "");
        });
    }

    // Refresh
    const refreshBtn = document.getElementById("btnRefreshProduk");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async function () {
            const icon = refreshBtn.querySelector("i");
            if (icon) icon.style.animation = "spin 0.8s linear infinite";
            await loadProdukFromDB();
            document.addEventListener("keydown", function (e) {
                if (e.key !== "Enter" && e.key !== " ") return;
                const img = e.target.closest("[data-action='preview-produk-img']");
                if (!img) return;
                e.preventDefault();
                img.click();
            });
            if (icon) icon.style.animation = "";
        });
    }
}

/* ============================================
   IMAGE PREVIEW (lightbox)
   ============================================ */

function openImagePreview(src, alt) {
    if (!src) return;

    // Hapus preview lama kalau ada
    const existing = document.getElementById("imgPreview");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "img-preview";
    overlay.id = "imgPreview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Pratinjau gambar");

    overlay.innerHTML = `
        <button type="button" class="img-preview__close" aria-label="Tutup pratinjau">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
        <img class="img-preview__img" src="${src}" alt="${escapeHTML(alt || "")}">
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("img-preview-open");

    // Trigger animasi masuk
    requestAnimationFrame(function () {
        overlay.classList.add("is-open");
    });

    function close() {
        overlay.classList.remove("is-open");
        document.body.classList.remove("img-preview-open");
        setTimeout(function () {
            if (overlay.parentNode) overlay.remove();
        }, 200);
        document.removeEventListener("keydown", onKey);
    }

    function onKey(e) {
        if (e.key === "Escape") close();
    }

    overlay.addEventListener("click", function (e) {
        // Klik di luar gambar (overlay/close) → tutup
        if (e.target === overlay || e.target.closest(".img-preview__close")) {
            close();
        }
    });

    document.addEventListener("keydown", onKey);
}
