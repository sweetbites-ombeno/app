/* ============================================
   MOBILE TEMPLATE - APP.JS
   SPA-like: header & footer dimuat sekali,
   konten & tanggal di-update tanpa reload.
   ============================================ */

const PAGE_INIT = {
    // home: initHome,
    // order: initOrder,
    // riwayat: initRiwayat,
    setting: initSetting,
    "data-kategori": initDataKategori,
    "data-kategori-form": initDataKategoriForm,
    "data-customer": initDataCustomer,
    "data-customer-form": initDataCustomerForm,
    "data-produk": initDataProduk,
    "data-produk-form": initDataProdukForm,
};

const HALAMAN_LOGIN = "index.html";

function sudahLogin() {
    return !!sessionStorage.getItem("login");
}

function logout() {
    sessionStorage.removeItem("login");
    location.replace(HALAMAN_LOGIN);
}

/**
 * Tombol/link dengan atribut data-action="logout" (mis. di header, footer, atau halaman setting).
 * Memakai event delegation karena header/footer dimuat dinamis lewat fetch.
 */
function bindLogout() {
    document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-action='logout']");
        if (!el) return;
        e.preventDefault();
        if (confirm("Keluar dari aplikasi?")) logout();
    });
}

const PAGE_TITLES = {
    home: "Home - Mobile App",
    order: "Order - Mobile App",
    riwayat: "Riwayat - Mobile App",
    setting: "Setting - Mobile App",
    "data-kategori": "Data Kategori - Mobile App",
    "data-kategori-form": "Form Kategori - Mobile App",
    "data-customer": "Data Customer - Mobile App",
    "data-customer-form": "Form Customer - Mobile App",
    "data-produk": "Data Produk - Mobile App",
    "data-produk-form": "Form Produk - Mobile App",
};

/**
 * Muat komponen HTML ke elemen target.
 */
async function muat(id, file) {
    const target = document.getElementById(id);
    if (!target) return;

    try {
        const res = await fetch(file);
        if (!res.ok) throw new Error(`HTTP ${res.status} saat memuat ${file}`);
        target.innerHTML = await res.text();
    } catch (err) {
        console.error(`[muat] Gagal memuat "${file}":`, err);
        if (id !== "footer") {
            target.innerHTML = `
                <div style="padding:16px;color:#b91c1c;font-size:14px;
                            background:#fef2f2;border:1px solid #fecaca;
                            border-radius:8px;margin:16px;">
                    ⚠ Gagal memuat komponen <strong>${file}</strong>.
                    Pastikan proyek dijalankan melalui web server (bukan file://).
                </div>
            `;
        }
    }
}

/**
 * Update tanggal di header (dipanggil setiap halaman berganti).
 */
function renderHeaderDate() {
    const el = document.getElementById("headerDate");
    if (!el) return;

    const formatted = new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date());

    el.innerHTML = `<i class="fa-regular fa-calendar" aria-hidden="true"></i><span>${formatted}</span>`;
    el.setAttribute("title", formatted);
}

/**
 * Ambil halaman aktif dari URL (?page=home).
 */
function getActivePageFromURL() {
    const params = new URLSearchParams(window.location.search);
    const page = (params.get("page") || "home").toLowerCase();
    return PAGE_TITLES[page] ? page : "home";
}

/**
 * Tandai link nav yang aktif.
 */
function setActiveNav(page) {
    document.querySelectorAll(".bottom-nav__link").forEach((link) => {
        const isActive = link.dataset.page === page;
        link.classList.toggle("is-active", isActive);
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

/**
 * Ganti konten #main-content tanpa reload halaman.
 * @param {string} page - "home" | "order" | "riwayat" | "setting"
 * @param {object} opts - { pushState: boolean }
 */
async function navigateTo(page, opts = { pushState: true }) {
    console.log('panggil navigateTo');
    const main = document.getElementById("main-content");
    if (!main) return;

    // Tandai loading
    main.classList.add("is-loading");

    try {
        const res = await fetch(`${page}-content.html`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        main.innerHTML = await res.text();

        // ── Sembunyikan header & footer global untuk halaman "fullscreen" ──
        const HALAMAN_TANPA_CHROME = [
            "data-kategori",
            "data-kategori-form",
            "data-customer",
            "data-customer-form",
            "data-produk",
            "data-produk-form"
        ];
        document.body.classList.toggle(
            "hide-app-chrome",
            HALAMAN_TANPA_CHROME.includes(page)
        );

        // Jalankan JS khusus halaman (kalau ada)
        if (typeof PAGE_INIT[page] === "function") {
            await PAGE_INIT[page]();
        }

        // ── Update header title dengan aman ──
        // Query ULANG setiap kali (jangan pakai referensi lama),
        // dan cek null sebelum set textContent.
        const headerTitle = document.getElementById("headerTitle");
        if (headerTitle) {
            // home → pakai "Mobile App", halaman lain → pakai nama halaman
            const displayTitle = page === "home"
                ? "Mobile App"
                : (PAGE_TITLES[page] || "Mobile App").replace(" - Mobile App", "");
            headerTitle.textContent = displayTitle;
        } else {
            console.warn("[navigateTo] #headerTitle tidak ditemukan. Pastikan header.html punya id='headerTitle'.");
        }

        // Update tanggal header (re-render tiap navigasi)
        renderHeaderDate();

        // Update nav aktif
        setActiveNav(page);

        // Update judul dokumen
        document.title = PAGE_TITLES[page] || "Mobile App";

        // Update URL tanpa reload
        if (opts.pushState !== false) {
            const newURL = `app.html?page=${page}`;
            history.pushState({ page }, "", newURL);
        }

        // Scroll ke atas konten
        main.scrollTop = 0;
    } catch (err) {
        console.error(`[navigateTo] Gagal memuat halaman "${page}":`, err);
        main.innerHTML = `
            <div class="page__placeholder">
                <i class="fa-solid fa-triangle-exclamation page__placeholder-icon"></i>
                <h2 class="page__placeholder-title">Gagal memuat</h2>
                <p class="page__placeholder-text">Halaman tidak dapat dimuat. Pastikan web server berjalan.</p>
            </div>
        `;
    } finally {
        main.classList.remove("is-loading");
    }
}

/**
 * Pasang event listener pada link bottom-nav agar tidak reload.
 */
function bindNavLinks() {
    console.log('panggil bindNavLinks');
    document.querySelectorAll(".bottom-nav__link").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            if (!page) return;
            if (getActivePageFromURL() === page) return; // sudah aktif
            navigateTo(page);
        });
    });
}

/**
 * Handler tombol back/forward browser.
 */
function bindPopState() {
    window.addEventListener("popstate", (e) => {
        const page = e.state?.page || getActivePageFromURL();
        navigateTo(page, { pushState: false });
    });
}


/**
 * Inisialisasi aplikasi.
 */
async function initApp() {

    // Shell aplikasi (app.html)
    const hasHeader = document.getElementById("header");
    const hasFooter = document.getElementById("footer");
    const hasMain = document.getElementById("main-content");

    // Bukan halaman shell (mis. index.html): tidak ada yang dilakukan
    if (!hasHeader && !hasFooter) return;

    // Belum login: kembali ke halaman login
    if (!sudahLogin()) {
        location.replace(HALAMAN_LOGIN);
        return;
    }

    bindLogout();
    bindSettingActions();
    bindKategoriActions();
    bindCustomerActions();   // ← tambahan baru
    bindProdukActions();

    bindInternalLinks();


    // Muat header & footer SEKALI
    await Promise.all([
        hasHeader ? muat("header", "header.html") : Promise.resolve(),
        hasFooter ? muat("footer", "footer.html") : Promise.resolve(),
    ]);

    // Render tanggal awal
    renderHeaderDate();

    if (hasMain) {
        // Tentukan halaman dari URL
        const initialPage = getActivePageFromURL();

        // Muat konten awal tanpa pushState (agar tidak dobel entry)
        await navigateTo(initialPage, { pushState: false });

        // Pastikan URL punya ?page=... saat pertama kali dibuka
        if (!window.location.search.includes("page=")) {
            history.replaceState({ page: initialPage }, "", `app.html?page=${initialPage}`);
        }

        // Bind interaksi
        bindNavLinks();
        bindPopState();
    }
}

// Jalankan setelah DOM siap
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}


function bindSettingActions() {
    document.addEventListener("click", (e) => {
        // ---- Backup database ----
        const btnBackup = e.target.closest("[data-action='backup-database']");
        if (btnBackup) {
            e.preventDefault();
            if (typeof backupDatabase === "function") {
                backupDatabase();
            } else {
                alert("Fungsi backup tidak tersedia.");
            }
            return;
        }

        // ---- Update password ----
        const btnPassword = e.target.closest("[data-action='update-password']");
        if (btnPassword) {
            e.preventDefault();
            // Placeholder: nanti bisa diarahkan ke form update password
            alert("Fitur Update Password belum diimplementasikan.");
            return;
        }

        // ---- Menu produk / kategori / penjualan ----
        const menu = e.target.closest("[data-menu]");
        if (menu) {
            e.preventDefault();
            const name = menu.dataset.menu;

            // Menu yang sudah punya halaman SPA
            if (name === "data-kategori") {
                navigateTo("data-kategori");
                return;
            }

            // Menu data-customer yang sudah punya halaman SPA
            if (name === "data-customer") {
                navigateTo("data-customer");
                return;
            }

            if (name === "data-produk") {
                navigateTo("data-produk");
                return;
            }

            // Sisanya masih placeholder
            alert(`Menu "${name}" belum diimplementasikan.`);
            return;
        }
    });
}

function escapeHTML(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

/**
 * Handler klik untuk aksi kategori (event delegation).
 */
function bindKategoriActions() {
    document.addEventListener("click", function (e) {

        // ---- FAB TAMBAH ----
        if (e.target.closest("[data-action='add-kategori']")) {
            e.preventDefault();
            // Push URL dulu tanpa reload, lalu navigate SPA
            history.pushState({ page: "data-kategori-form" }, "", "app.html?page=data-kategori-form");
            navigateTo("data-kategori-form", { pushState: false });
            return;
        }

        // ---- EDIT ----
        const editBtn = e.target.closest("[data-action='edit-kategori']");
        if (editBtn) {
            e.preventDefault();
            const id = editBtn.dataset.id || "";
            const url = `app.html?page=data-kategori-form&mode=edit&id=${encodeURIComponent(id)}`;
            history.pushState({ page: "data-kategori-form" }, "", url);
            navigateTo("data-kategori-form", { pushState: false });
            return;
        }

        // ---- DELETE ----
        const delBtn = e.target.closest("[data-action='delete-kategori']");
        if (delBtn) {
            e.preventDefault();
            const id = delBtn.dataset.id;
            const name = delBtn.dataset.name || "kategori ini";
            if (!confirm(`Hapus kategori "${name}"?`)) return;

            // Soft delete
            db.kategori.update(id, {
                deleted_at: new Date().toISOString()
            }).then(function () {
                // Re-render list
                if (typeof loadKategoriFromDB === "function") {
                    loadKategoriFromDB();
                }
            }).catch(function (err) {
                console.error("[kategori] Gagal hapus:", err);
                alert("Gagal menghapus: " + err.message);
            });
            return;
        }
    });
}

/**
 * Tangkap klik pada semua <a href> internal yang menuju app.html?page=...
 * agar navigasi SPA (tanpa reload), bukan full page load.
 *
 * Tidak perlu data-action — cukup <a href="app.html?page=...">.
 */
function bindInternalLinks() {
    document.addEventListener("click", function (e) {
        // Abaikan klik dengan modifier (buka tab baru, dsb)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        const link = e.target.closest("a[href]");
        if (!link) return;

        // Hanya proses link yang menuju app.html (relatif / absolut)
        const href = link.getAttribute("href") || "";
        if (!href.startsWith("app.html")) return;

        // Pastikan punya ?page=...
        const url = new URL(href, window.location.href);
        const page = url.searchParams.get("page");
        if (!page) return;                        // biarkan default
        if (!PAGE_TITLES[page]) return;           // halaman tidak dikenal → biarkan

        // Cegah reload
        e.preventDefault();

        // Sudah di halaman yang sama? skip
        if (getActivePageFromURL() === page) return;

        // Navigasi SPA
        navigateTo(page);
    });
}


/**
 * Handler klik untuk aksi customer (event delegation).
 */
function bindCustomerActions() {
    document.addEventListener("click", function (e) {

        // ---- FAB TAMBAH ----
        if (e.target.closest("[data-action='add-customer']")) {
            e.preventDefault();
            history.pushState({ page: "data-customer-form" }, "", "app.html?page=data-customer-form");
            navigateTo("data-customer-form", { pushState: false });
            return;
        }

        // ---- EDIT ----
        const editBtn = e.target.closest("[data-action='edit-customer']");
        if (editBtn) {
            e.preventDefault();
            const id = editBtn.dataset.id || "";
            const url = `app.html?page=data-customer-form&mode=edit&id=${encodeURIComponent(id)}`;
            history.pushState({ page: "data-customer-form" }, "", url);
            navigateTo("data-customer-form", { pushState: false });
            return;
        }

        // ---- DELETE ----
        const delBtn = e.target.closest("[data-action='delete-customer']");
        if (delBtn) {
            e.preventDefault();
            const id = delBtn.dataset.id;
            const name = delBtn.dataset.name || "customer ini";
            if (!confirm(`Hapus customer "${name}"?`)) return;

            db.customer.update(id, {
                deleted_at: new Date().toISOString()
            }).then(function () {
                if (typeof loadCustomerFromDB === "function") {
                    loadCustomerFromDB();
                }
            }).catch(function (err) {
                console.error("[customer] Gagal hapus:", err);
                alert("Gagal menghapus: " + err.message);
            });
            return;
        }
    });
}

function bindProdukActions() {
    document.addEventListener("click", function (e) {

        // ---- PREVIEW GAMBAR ----
        const previewImg = e.target.closest("[data-action='preview-produk-img']");
        if (previewImg) {
            e.preventDefault();
            const id = previewImg.dataset.id;
            const produk = _produkCache.find(function (p) { return p.id === id; });
            if (produk && produk.image_base64 && typeof openImagePreview === "function") {
                openImagePreview(produk.image_base64, produk.name || "");
            }
            return;
        }

        if (e.target.closest("[data-action='add-produk']")) {
            e.preventDefault();
            history.pushState({ page: "data-produk-form" }, "", "app.html?page=data-produk-form");
            navigateTo("data-produk-form", { pushState: false });
            return;
        }

        const editBtn = e.target.closest("[data-action='edit-produk']");
        if (editBtn) {
            e.preventDefault();
            const id = editBtn.dataset.id || "";
            const url = `app.html?page=data-produk-form&mode=edit&id=${encodeURIComponent(id)}`;
            history.pushState({ page: "data-produk-form" }, "", url);
            navigateTo("data-produk-form", { pushState: false });
            return;
        }

        const delBtn = e.target.closest("[data-action='delete-produk']");
        if (delBtn) {
            e.preventDefault();
            const id = delBtn.dataset.id;
            const name = delBtn.dataset.name || "produk ini";
            if (!confirm(`Hapus produk "${name}"?`)) return;

            db.produk.update(id, { deleted_at: new Date().toISOString() })
                .then(function () {
                    if (typeof loadProdukFromDB === "function") loadProdukFromDB();
                })
                .catch(function (err) {
                    console.error("[produk] Gagal hapus:", err);
                    alert("Gagal menghapus: " + err.message);
                });
        }
    });
}