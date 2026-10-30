/* ============================================
   HALAMAN DATA KATEGORI
   List + CRUD (Dexie)
   ============================================ */

// State lokal untuk cache list (dipakai saat filter search)
let _kategoriCache = [];

/**
 * Render list kategori ke DOM.
 * @param {string} filter - kata kunci pencarian
 */
function renderKategoriList(filter = "") {
    const list = document.getElementById("kategoriList");
    const empty = document.getElementById("kategoriEmpty");
    const countEl = document.getElementById("kategoriCount");
    if (!list) return;

    const q = filter.trim().toLowerCase();
    const filtered = _kategoriCache.filter(function (k) {
        return (k.name || "").toLowerCase().includes(q);
    });

    // Update jumlah
    if (countEl) {
        if (q) {
            countEl.textContent = `${filtered.length} hasil pencarian`;
        } else {
            countEl.textContent = `${_kategoriCache.length} kategori`;
        }
    }

    // Render card (kosongkan dulu)
    list.innerHTML = filtered.map(function (k) {
        return `
            <div class="kategori-card" data-id="${k.id}">
                <span class="kategori-card__name">${escapeHTML(k.name || "")}</span>
                <div class="kategori-card__actions">
                    <button type="button" class="kategori-card__btn kategori-card__btn--edit"
                            data-action="edit-kategori" data-id="${k.id}"
                            aria-label="Edit">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="kategori-card__btn kategori-card__btn--delete"
                            data-action="delete-kategori" data-id="${k.id}"
                            data-name="${escapeHTML(k.name || "")}" aria-label="Hapus">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");

    // ── Toggle empty state secara eksplisit ──
    // Empty hanya muncul kalau (a) tidak sedang search, DAN (b) data cache kosong.
    // Kalau sedang search tapi tidak ada hasil → tampilkan pesan "tidak ditemukan".
    if (empty) {
        if (_kategoriCache.length === 0) {
            // Benar-benar belum ada data
            empty.style.display = "flex";
            empty.innerHTML = `
                <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                <p>Belum ada kategori.</p>
            `;
        } else if (filtered.length === 0) {
            // Ada data tapi tidak cocok dengan pencarian
            empty.style.display = "flex";
            empty.innerHTML = `
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <p>Tidak ada kategori yang cocok.</p>
            `;
        } else {
            // Ada data & cocok → sembunyikan empty
            empty.style.display = "none";
        }
    }
}
/**
 * Ambil data dari Dexie lalu render.
 */
async function loadKategoriFromDB() {
    try {
        // Ambil hanya yang belum dihapus (soft delete)
        _kategoriCache = await db.kategori
            .filter(function (k) { return !k.deleted_at; })
            .toArray();

        // Urutkan berdasarkan name
        _kategoriCache.sort(function (a, b) {
            return (a.name || "").localeCompare(b.name || "");
        });

        const search = document.getElementById("searchKategori");
        renderKategoriList(search ? search.value : "");
    } catch (err) {
        console.error("[data-kategori] Gagal memuat data:", err);
        const list = document.getElementById("kategoriList");
        if (list) {
            list.innerHTML = `
                <div class="page__placeholder">
                    <i class="fa-solid fa-triangle-exclamation page__placeholder-icon"></i>
                    <h2 class="page__placeholder-title">Gagal memuat</h2>
                    <p class="page__placeholder-text">${escapeHTML(err.message || "Terjadi kesalahan")}</p>
                </div>
            `;
        }
    }
}

/**
 * Init halaman list kategori (dipanggil oleh PAGE_INIT).
 */
async function initDataKategori() {
    await loadKategoriFromDB();

    // Search live
    const search = document.getElementById("searchKategori");
    if (search) {
        search.addEventListener("input", function (e) {
            renderKategoriList(e.target.value);
        });
    }

    // Refresh
    const refreshBtn = document.getElementById("btnRefreshKategori");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async function () {
            const icon = refreshBtn.querySelector("i");
            if (icon) icon.style.animation = "spin 0.8s linear infinite";
            await loadKategoriFromDB();
            if (icon) icon.style.animation = "";
        });
    }
}