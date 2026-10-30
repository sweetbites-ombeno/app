/* ============================================
   HALAMAN DATA CUSTOMER
   List + CRUD (Dexie)
   ============================================ */

let _customerCache = [];

/**
 * Render list customer ke DOM.
 * @param {string} filter - kata kunci pencarian
 */
function renderCustomerList(filter = "") {
    const list = document.getElementById("customerList");
    const empty = document.getElementById("customerEmpty");
    const countEl = document.getElementById("customerCount");
    if (!list) return;

    const q = filter.trim().toLowerCase();
    const filtered = _customerCache.filter(function (c) {
        const name = (c.name || "").toLowerCase();
        const telp = (c.no_telp || "").toLowerCase();
        return name.includes(q) || telp.includes(q);
    });

    // Update jumlah
    if (countEl) {
        countEl.textContent = q
            ? `${filtered.length} hasil pencarian`
            : `${_customerCache.length} customer`;
    }

    // Render card
    list.innerHTML = filtered.map(function (c) {
        const telp = c.no_telp
            ? `<small class="customer-card__telp">${escapeHTML(c.no_telp)}</small>`
            : "";
        return `
            <div class="kategori-card" data-id="${c.id}">
                <div class="customer-card__info">
                    <span class="kategori-card__name">${escapeHTML(c.name || "")}</span>
                    ${telp}
                </div>
                <div class="kategori-card__actions">
                    <button type="button" class="kategori-card__btn kategori-card__btn--edit"
                            data-action="edit-customer" data-id="${c.id}"
                            aria-label="Edit">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="kategori-card__btn kategori-card__btn--delete"
                            data-action="delete-customer" data-id="${c.id}"
                            data-name="${escapeHTML(c.name || "")}" aria-label="Hapus">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");

    // Toggle empty state secara eksplisit
    if (empty) {
        if (_customerCache.length === 0) {
            empty.style.display = "flex";
            empty.innerHTML = `
                <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                <p>Belum ada customer.</p>
            `;
        } else if (filtered.length === 0) {
            empty.style.display = "flex";
            empty.innerHTML = `
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <p>Tidak ada customer yang cocok.</p>
            `;
        } else {
            empty.style.display = "none";
        }
    }
}

/**
 * Ambil data dari Dexie lalu render.
 */
async function loadCustomerFromDB() {
    try {
        _customerCache = await db.customer
            .filter(function (c) { return !c.deleted_at; })
            .toArray();

        _customerCache.sort(function (a, b) {
            return (a.name || "").localeCompare(b.name || "");
        });

        const search = document.getElementById("searchCustomer");
        renderCustomerList(search ? search.value : "");
    } catch (err) {
        console.error("[data-customer] Gagal memuat data:", err);
        const list = document.getElementById("customerList");
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
 * Init halaman list customer (dipanggil oleh PAGE_INIT).
 */
async function initDataCustomer() {
    await loadCustomerFromDB();

    const search = document.getElementById("searchCustomer");
    if (search) {
        search.addEventListener("input", function (e) {
            renderCustomerList(e.target.value);
        });
    }

    const refreshBtn = document.getElementById("btnRefreshCustomer");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async function () {
            const icon = refreshBtn.querySelector("i");
            if (icon) icon.style.animation = "spin 0.8s linear infinite";
            await loadCustomerFromDB();
            if (icon) icon.style.animation = "";
        });
    }
}