/* ============================================
   MOBILE TEMPLATE - APP.JS
   SPA-like: header & footer dimuat sekali,
   konten & tanggal di-update tanpa reload.
   ============================================ */

const PAGE_INIT = {
  home: initHome,
  order: initOrder,
  "data-list-pesanan": initDataListPesanan,
  riwayat: initRiwayat,
  "data-detail-transaksi": initDataDetailTransaksi,   // ← tambah
  setting: initSetting,
  "data-kategori": initDataKategori,
  "data-kategori-form": initDataKategoriForm,
  "data-customer": initDataCustomer,
  "data-customer-form": initDataCustomerForm,
  "data-produk": initDataProduk,
  "data-produk-form": initDataProdukForm,
  "data-pembelian": initDataPembelian,
  "data-pembelian-form": initDataPembelianForm,
  "data-pembelian-form": initDataPembelianForm,
  "data-pembelian-detail": initDataPembelianDetail,   // ← TAMBAH
};

const HALAMAN_LOGIN = "index.html";

function sudahLogin() {
  return !!sessionStorage.getItem("login");
}

/**
 * Logout: bersihkan draft penjualan (status 0) milik user aktif,
 * lalu hapus semua key sessionStorage per-user, baru redirect.
 */
async function logout() {
  if (typeof clearDraftPenjualan === "function") {
    try {
      await clearDraftPenjualan();
    } catch (e) {
      console.warn("[logout] clearDraftPenjualan:", e);
    }
  }

  const userId = sessionStorage.getItem("login");
  if (userId) {
    try {
      sessionStorage.removeItem(`cart:${userId}`);
      sessionStorage.removeItem(`cartOrderId:${userId}`);
      sessionStorage.removeItem(`cartMethod:${userId}`);
    } catch (e) { }
  }

  // ⬇️ Bersihkan info "datang dari List Pesanan" yang tidak ber-prefix userId
  try {
    if (typeof _clearOrderFromListSession === "function") {
      _clearOrderFromListSession();
    } else {
      sessionStorage.removeItem("orderFromList");
      sessionStorage.removeItem("orderFromListOriginal");
    }
  } catch (e) { }

  // ⬇️ Reset juga flag di memori order.js (kalau sedang aktif di tab yang sama)
  try {
    if (typeof window !== "undefined" && "_orderFromListInfo" in window) {
      // tidak bisa assign langsung ke `let` yang di-scope module,
      // tapi kita bisa set null via helper kalau ada. Kalau tidak, cukup
      // andalkan reset dari initOrder saat halaman baru dimuat.
    }
  } catch (e) { }

  sessionStorage.removeItem("login");
  location.replace(HALAMAN_LOGIN);
}

function bindLogout() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action='logout']");
    if (!el) return;
    e.preventDefault();

    // ⬇️ Popup konfirmasi custom (ganti confirm bawaan browser)
    if (typeof openConfirmLogout === "function") {
      openConfirmLogout(
        function onYes() {
          logout();
        },
        function onNo() {
          // Batal → tidak melakukan apa-apa
        }
      );
    } else {
      // Fallback kalau openConfirmLogout tidak tersedia
      if (confirm("Keluar dari aplikasi?")) {
        logout();
      }
    }
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
  "data-list-pesanan": "List Pesanan - Mobile App",
  "data-detail-transaksi": "Detail Transaksi - Mobile App",   // ← tambah
  "data-pembelian": "Data Pembelian - Mobile App",
  "data-pembelian-form": "Form Pembelian - Mobile App",
  "data-pembelian-detail": "Detail Pembelian - Mobile App",   // ← TAMBAH
};

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

function getActivePageFromURL() {
  const params = new URLSearchParams(window.location.search);
  const page = (params.get("page") || "home").toLowerCase();
  return PAGE_TITLES[page] ? page : "home";
}

function setActiveNav(page) {
  document.querySelectorAll(".bottom-nav__link").forEach((link) => {
    const isActive = link.dataset.page === page;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function navigateTo(page, opts = { pushState: true }) {
  const main = document.getElementById("main-content");
  if (!main) return;

  main.classList.add("is-loading");

  try {
    const res = await fetch(`${page}-content.html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    main.innerHTML = await res.text();

    const HALAMAN_TANPA_CHROME = [
      "data-kategori",
      "data-kategori-form",
      "data-customer",
      "data-customer-form",
      "data-produk",
      "data-produk-form",
      "data-list-pesanan",   // ← baru
      "data-detail-transaksi",  // ← tambah
      "data-pembelian",   // ← tambah
      "data-pembelian-form",
      "data-pembelian-detail",   // ← TAMBAH
    ];
    document.body.classList.toggle(
      "hide-app-chrome",
      HALAMAN_TANPA_CHROME.includes(page)
    );

    if (typeof PAGE_INIT[page] === "function") {
      await PAGE_INIT[page]();
      if (typeof updateNavCartBadge === "function") updateNavCartBadge();
    }

    cekBackupHarian();

    const headerTitle = document.getElementById("headerTitle");
    if (headerTitle) {
      const displayTitle = page === "home"
        ? "Mobile App"
        : (PAGE_TITLES[page] || "Mobile App").replace(" - Mobile App", "");
      headerTitle.textContent = displayTitle;
    } else {
      console.warn("[navigateTo] #headerTitle tidak ditemukan.");
    }
    document.body.classList.toggle("page-is-order", page === "order");

    renderHeaderDate();
    setActiveNav(page);
    document.title = PAGE_TITLES[page] || "Mobile App";

    if (opts.pushState !== false) {
      const newURL = `app.html?page=${page}`;
      history.pushState({ page }, "", newURL);
    }

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

function bindNavLinks() {
  document.querySelectorAll(".bottom-nav__link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (!page) return;
      if (getActivePageFromURL() === page) return;
      navigateTo(page);
    });
  });
}

function bindPopState() {
  window.addEventListener("popstate", (e) => {
    const page = e.state?.page || getActivePageFromURL();
    navigateTo(page, { pushState: false });
  });
}

async function initApp() {
  const hasHeader = document.getElementById("header");
  const hasFooter = document.getElementById("footer");
  const hasMain = document.getElementById("main-content");

  if (!hasHeader && !hasFooter) return;

  if (!sudahLogin()) {
    location.replace(HALAMAN_LOGIN);
    return;
  }

  // ⬇️ Bersihkan draft yatim milik user aktif (tab ditutup tanpa logout)
  if (typeof bersihkanDraftOrphan === "function") {
    try {
      await bersihkanDraftOrphan();
    } catch (e) {
      console.warn("[app] bersihkanDraftOrphan:", e);
    }
  }

  bindLogout();
  bindSettingActions();
  bindKategoriActions();
  bindCustomerActions();
  bindProdukActions();
  bindInternalLinks();

  await Promise.all([
    hasHeader ? muat("header", "header.html") : Promise.resolve(),
    hasFooter ? muat("footer", "footer.html") : Promise.resolve(),
  ]);

  renderHeaderDate();

  if (hasMain) {
    const initialPage = getActivePageFromURL();
    await navigateTo(initialPage, { pushState: false });

    if (!window.location.search.includes("page=")) {
      history.replaceState({ page: initialPage }, "", `app.html?page=${initialPage}`);
    }

    bindNavLinks();
    bindPopState();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function bindSettingActions() {
  document.addEventListener("click", (e) => {
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

    const btnReset = e.target.closest("[data-action='reset-database']");
    if (btnReset) {
      e.preventDefault();
      if (typeof _openResetModal === "function") _openResetModal();
      else alert("Fungsi reset tidak tersedia.");
      return;
    }

    const btnPassword = e.target.closest("[data-action='update-password']");
    if (btnPassword) {
      e.preventDefault();
      alert("Fitur Update Password belum diimplementasikan.");
      return;
    }

    const menu = e.target.closest("[data-menu]");
    if (menu) {
      e.preventDefault();
      const name = menu.dataset.menu;

      if (name === "data-kategori") {
        navigateTo("data-kategori");
        return;
      }

      if (name === "data-customer") {
        navigateTo("data-customer");
        return;
      }

      if (name === "data-pembelian") {
        navigateTo("data-pembelian");
        return;
      }

      if (name === "data-produk") {
        navigateTo("data-produk");
        return;
      }

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

function bindKategoriActions() {
  document.addEventListener("click", function (e) {

    if (e.target.closest("[data-action='add-kategori']")) {
      e.preventDefault();
      history.pushState({ page: "data-kategori-form" }, "", "app.html?page=data-kategori-form");
      navigateTo("data-kategori-form", { pushState: false });
      return;
    }

    const editBtn = e.target.closest("[data-action='edit-kategori']");
    if (editBtn) {
      e.preventDefault();
      const id = editBtn.dataset.id || "";
      const url = `app.html?page=data-kategori-form&mode=edit&id=${encodeURIComponent(id)}`;
      history.pushState({ page: "data-kategori-form" }, "", url);
      navigateTo("data-kategori-form", { pushState: false });
      return;
    }

    const delBtn = e.target.closest("[data-action='delete-kategori']");
    if (delBtn) {
      e.preventDefault();
      const id = delBtn.dataset.id;
      const name = delBtn.dataset.name || "kategori ini";
      if (!confirm(`Hapus kategori "${name}"?`)) return;

      db.kategori.update(id, {
        deleted_at: new Date().toISOString()
      }).then(function () {
        if (typeof loadKategoriFromDB === "function") {
          loadKategoriFromDB();
        }
      }).catch(function (err) {
        console.error("[kategori] Gagal hapus:", err);
        // alert("Gagal menghapus: " + err.message);
        // Sesudah
        openInfoPopup("Gagal menghapus: " + err.message, {
          title: "Gagal Menghapus",
          icon: "danger"
        });
      });
      return;
    }
  });
}

function bindInternalLinks() {
  document.addEventListener("click", function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const link = e.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (!href.startsWith("app.html")) return;

    const url = new URL(href, window.location.href);
    const page = url.searchParams.get("page");
    if (!page) return;
    if (!PAGE_TITLES[page]) return;

    e.preventDefault();

    if (getActivePageFromURL() === page) return;

    navigateTo(page);
  });
}

function bindCustomerActions() {
  document.addEventListener("click", function (e) {

    if (e.target.closest("[data-action='add-customer']")) {
      e.preventDefault();
      history.pushState({ page: "data-customer-form" }, "", "app.html?page=data-customer-form");
      navigateTo("data-customer-form", { pushState: false });
      return;
    }

    const editBtn = e.target.closest("[data-action='edit-customer']");
    if (editBtn) {
      e.preventDefault();
      const id = editBtn.dataset.id || "";
      const url = `app.html?page=data-customer-form&mode=edit&id=${encodeURIComponent(id)}`;
      history.pushState({ page: "data-customer-form" }, "", url);
      navigateTo("data-customer-form", { pushState: false });
      return;
    }

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
        // alert("Gagal menghapus: " + err.message);
        // Sesudah
        openInfoPopup("Gagal menghapus: " + err.message, {
          title: "Gagal Menghapus",
          icon: "danger"
        });
      });
      return;
    }
  });
}

function bindProdukActions() {
  document.addEventListener("click", function (e) {

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

      // ⬇️ CEK KATEGORI DULU — sebelum navigasi ke form
      db.kategori
        .filter(function (k) { return !k.deleted_at; })
        .count()
        .then(function (jumlah) {
          if (jumlah === 0) {
            if (typeof openInfoPopup === "function") {
              openInfoPopup(
                "Belum ada kategori produk. Silakan tambahkan kategori terlebih dahulu sebelum menambah produk.",
                {
                  title: "Kategori Kosong",
                  icon: "warning",
                  button: "Mengerti",
                  onClose: function () { navigateTo("setting"); }
                }
              );
            } else {
              alert("Belum ada kategori produk. Silakan tambahkan kategori terlebih dahulu.");
              navigateTo("setting");
            }
            return; // ⬅️ STOP — jangan navigasi ke form
          }

          // Ada kategori → lanjut ke form
          history.pushState(
            { page: "data-produk-form" },
            "",
            "app.html?page=data-produk-form"
          );
          navigateTo("data-produk-form", { pushState: false });
        })
        .catch(function (err) {
          console.error("[produk] Gagal cek kategori:", err);
          openInfoPopup("Gagal memeriksa kategori: " + (err.message || "Terjadi kesalahan"), {
            title: "Gagal Memeriksa",
            icon: "danger"
          });
        });

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
          // alert("Gagal menghapus: " + err.message);
          // Sesudah
          openInfoPopup("Gagal menghapus: " + err.message, {
            title: "Gagal Menghapus",
            icon: "danger"
          });
        });
    }
  });
}
