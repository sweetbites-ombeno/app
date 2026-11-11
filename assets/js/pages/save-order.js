/* ============================================
   SIMPAN PESANAN (status 2)
   Popup pilih customer + simpan draft jadi "Simpan Pesanan"

   Mendukung 3 mode:
   - Mode baru       : dari halaman Order (cart ada isi) → buat/ubah draft jadi status 2
   - Mode edit       : dari halaman List Pesanan (draft sudah status 2) → update saja
   - Mode restore    : dari List Pesanan → Bayar (draft status 0) → default customer & tanggal
                       diambil dari data asli (session "orderFromListOriginal")
   ============================================ */

/**
 * Ambil customer aktif (belum dihapus), urut ascending berdasarkan name.
 * @returns {Promise<Array>}
 */
async function _loadCustomerForSave() {
  const rows = await db.customer
    .filter(function (c) { return !c.deleted_at; })
    .toArray();

  rows.sort(function (a, b) {
    return (a.name || "").localeCompare(b.name || "", "id", { sensitivity: "base" });
  });
  return rows;
}

/**
 * Format tanggal "YYYY-MM-DD" → "10 Nov 2026"
 */
function _formatTanggalPesan(str) {
  if (!str) return "-";
  const d = new Date(str);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

/**
 * Cek apakah draft yang tersimpan di session adalah status 2 milik user aktif.
 * Dipakai untuk menentukan mode edit (dari List Pesanan) vs mode baru.
 * @returns {Promise<object|null>}
 */
async function _getExistingDraftStatus2() {
  try {
    const userId = sessionStorage.getItem("login");
    if (!userId || typeof _draftOrderKey !== "function") return null;

    const draftId = sessionStorage.getItem(_draftOrderKey());
    if (!draftId) return null;

    const d = await db.penjualan.get(draftId);
    if (!d || d.deleted_at) return null;
    if (d.status !== 2) return null;
    if (d.id_user !== userId) return null;
    return d;
  } catch (e) {
    console.warn("[save-order] _getExistingDraftStatus2:", e);
    return null;
  }
}

/**
 * Ambil data asli pesanan (customer + tanggal) yang tersimpan di session
 * saat user klik "Bayar" dari List Pesanan.
 *
 * Hanya dikembalikan kalau id di session cocok dengan draft id aktif.
 * Digunakan untuk mengisi default customer & tanggal saat "Simpan Pesanan"
 * setelah user datang dari list (draft status 0 hasil klik Bayar).
 *
 * @returns {object|null}
 */
function _getOrderFromListOriginal() {
  try {
    const raw = sessionStorage.getItem("orderFromListOriginal");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.id) return null;

    // Cocokkan dengan draft aktif — kalau beda, abaikan
    if (typeof _draftOrderKey !== "function") return null;
    const activeDraftId = sessionStorage.getItem(_draftOrderKey());
    if (activeDraftId !== data.id) return null;

    return data;
  } catch (e) {
    console.warn("[save-order] _getOrderFromListOriginal:", e);
    return null;
  }
}

/**
 * Bersihkan session info "datang dari List Pesanan" (orderFromList,
 * orderFromListOriginal). Dipanggil saat:
 *   - Simpan Pesanan sukses
 *   - Pembayaran sukses
 */
function _clearOrderFromListSession() {
  try {
    sessionStorage.removeItem("orderFromList");
    sessionStorage.removeItem("orderFromListOriginal");
  } catch (e) { }
}

/**
 * Buka popup Simpan Pesanan.
 *
 * @param {object} opts
 * @param {string} [opts.from] - "order" (default) | "list-pesanan"
 *
 * Syarat mode baru    : cart tidak kosong.
 * Syarat mode edit    : draft status 2 sudah ada di session (dari List Pesanan).
 * Syarat mode restore : ada session "orderFromListOriginal" yang cocok dengan
 *                       draft id aktif, dan draft masih status 0.
 */
async function openSaveOrderPopup(opts) {
  opts = opts || {};
  const from = opts.from === "list-pesanan" ? "list-pesanan" : "order";

  // Guard: jangan dobel popup
  if (document.getElementById("saveOrderModal")) return;

  // ⬇️ Cek existing draft status 2 (mode edit dari List Pesanan)
  const existingDraft = await _getExistingDraftStatus2();
  const isEditMode = !!existingDraft;

  // ⬇️ Cek data asli dari List Pesanan (mode restore — status 0 hasil klik Bayar)
  const originalFromList = !isEditMode ? _getOrderFromListOriginal() : null;
  const isRestoreFromList = !!originalFromList;

  // ⬇️ Hitung isi pesanan: dari cart (mode baru/restore) atau dari detail draft (mode edit)
  let totalItems = 0;
  let totalHarga = 0;

  if (!isEditMode) {
    // ---- Mode baru / restore: wajib ada cart ----
    if (typeof syncCartToDB === "function") {
      try {
        await syncCartToDB(getCart(), _orderProdukCache, _orderKategoriMap);
      } catch (e) {
        console.warn("[save-order] sync awal gagal:", e);
        alert("Gagal menyiapkan draft: " + e.message);
        return;
      }
    }

    const cart = getCart();
    const ids = Object.keys(cart).filter(function (id) { return (cart[id] || 0) > 0; });
    if (ids.length === 0) {
      alert("Keranjang kosong. Tambahkan produk dulu.");
      return;
    }

    ids.forEach(function (id) {
      const qty = cart[id] || 0;
      const p = _orderProdukCache.find(function (x) { return x.id === id; });
      if (!p) return;
      totalItems += qty;
      totalHarga += Number(p.harga_jual || 0) * qty;
    });
  } else {
    // ---- Mode edit: hitung dari penjualan_detail ----
    try {
      const details = await db.penjualan_detail
        .where("penjualan").equals(existingDraft.id)
        .filter(function (d) { return !d.deleted_at; })
        .toArray();
      details.forEach(function (d) {
        totalItems += (d.qty || 0);
        totalHarga += (d.total || 0);
      });
    } catch (e) {
      console.warn("[save-order] gagal hitung detail:", e);
      alert("Gagal memuat detail pesanan.");
      return;
    }
  }

  // ---- Load customer ----
  let customers = [];
  try {
    customers = await _loadCustomerForSave();
  } catch (err) {
    console.error("[save-order] Gagal load customer:", err);
  }

  // ---- Default customer ----
  // Prioritas:
  // 1. Mode edit (draft status 2): dari draft existing
  // 2. Restore dari List Pesanan (draft status 0 hasil klik Bayar): dari originalFromList
  // 3. Mode baru: "Umum" (case-insensitive)
  let defaultCustomerId = "";
  if (isEditMode && existingDraft.id_customer) {
    defaultCustomerId = existingDraft.id_customer;
  } else if (isRestoreFromList && originalFromList.id_customer) {
    defaultCustomerId = originalFromList.id_customer;
  } else {
    const umum = customers.find(function (c) {
      return (c.name || "").toLowerCase() === "umum";
    });
    if (umum) defaultCustomerId = umum.id;
  }

  // ---- Default tanggal pesan ----
  // Prioritas:
  // 1. Mode edit: dari draft existing
  // 2. Restore dari List Pesanan: dari originalFromList
  // 3. Mode baru: kosong (user isi sendiri)
  let defaultTanggalPesan = "";
  if (isEditMode && existingDraft.tanggal_pesan) {
    defaultTanggalPesan = existingDraft.tanggal_pesan;
  } else if (isRestoreFromList && originalFromList.tanggal_pesan) {
    defaultTanggalPesan = originalFromList.tanggal_pesan;
  }

  // ---- Render opsi customer ----
  const optionsHTML = customers.map(function (c) {
    const label = c.name || "(tanpa nama)";
    const telp = c.no_telp && c.no_telp !== "-" ? ` — ${c.no_telp}` : "";
    const sel = c.id === defaultCustomerId ? " selected" : "";
    return `<option value="${escapeHTML(c.id)}"${sel}>
              ${escapeHTML(label)}${escapeHTML(telp)}
            </option>`;
  }).join("");

  // ---- Judul modal ----
  let titleText = "Simpan Pesanan";
  if (isEditMode) titleText = "Simpan Perubahan Pesanan";

  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "saveOrderModal";
  overlay.innerHTML = `
    <div class="pay-modal__box">
      <h2 class="pay-modal__title">${titleText}</h2>

      <div class="form-group" style="text-align:left">
        <label for="saveOrderCustomer">Nama Pelanggan</label>
        <div class="form-group__input">
          <i class="fa-solid fa-user form-group__icon" aria-hidden="true"></i>
          <select id="saveOrderCustomer" name="saveOrderCustomer">
            <option value="">-- Pilih Pelanggan --</option>
            ${optionsHTML}
          </select>
        </div>
        <p class="form-hint" id="saveOrderCustomerHint">Pilih pelanggan untuk pesanan ini.</p>
      </div>

      <div class="form-group" style="text-align:left">
        <label for="saveOrderTanggalPesan">Tanggal Pesan</label>
        <div class="form-group__input">
          <i class="fa-regular fa-calendar form-group__icon" aria-hidden="true"></i>
          <input type="date" id="saveOrderTanggalPesan" name="saveOrderTanggalPesan"
                 value="${escapeHTML(defaultTanggalPesan)}">
        </div>
        <p class="form-hint">Tanggal pesanan dibuat (tanpa jam).</p>
      </div>

      <div class="save-order-summary">
        <div class="save-order-summary__row">
          <span class="save-order-summary__label">
            <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
            Jumlah Item
          </span>
          <span class="save-order-summary__value">${totalItems} item</span>
        </div>
        <div class="save-order-summary__row">
          <span class="save-order-summary__label">
            <i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i>
            Total Harga
          </span>
          <span class="save-order-summary__value save-order-summary__value--total">
            Rp ${totalHarga.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      <p class="save-order-error" id="saveOrderError" role="alert"></p>

      <div class="pay-modal__actions">
        <button type="button" class="btn-secondary" id="btnSaveOrderCancel">Batal</button>
        <button type="button" class="btn-primary" id="btnSaveOrderConfirm">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
          Simpan
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  const selectEl = overlay.querySelector("#saveOrderCustomer");
  const tanggalPesanEl = overlay.querySelector("#saveOrderTanggalPesan");
  const errorEl = overlay.querySelector("#saveOrderError");
  const btnConfirm = overlay.querySelector("#btnSaveOrderConfirm");

  if (!selectEl || !tanggalPesanEl || !errorEl || !btnConfirm) {
    console.error("[save-order] Elemen modal tidak lengkap:", {
      selectEl, tanggalPesanEl, errorEl, btnConfirm
    });
    alert("Terjadi kesalahan pada form. Muat ulang halaman.");
    overlay.remove();
    document.body.classList.remove("modal-open");
    return;
  }

  function close() {
    overlay.remove();
    document.body.classList.remove("modal-open");
  }

  overlay.querySelector("#btnSaveOrderCancel").addEventListener("click", close);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  // ---- Tombol simpan ----
  btnConfirm.addEventListener("click", async function () {
    errorEl.textContent = "";

    const customerId = selectEl.value;
    if (!customerId) {
      errorEl.textContent = "Pilih pelanggan terlebih dahulu.";
      selectEl.focus();
      return;
    }

    const tanggalPesan = tanggalPesanEl.value; // "YYYY-MM-DD" atau ""
    if (!tanggalPesan) {
      errorEl.textContent = "Tanggal pesan wajib diisi.";
      tanggalPesanEl.focus();
      return;
    }

    const customer = customers.find(function (c) { return c.id === customerId; });
    if (!customer) {
      errorEl.textContent = "Pelanggan tidak ditemukan.";
      return;
    }

    btnConfirm.disabled = true;
    const originalHTML = btnConfirm.innerHTML;
    btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Menyimpan...';

    try {
      if (isEditMode) {
        // ⬇️ Mode edit: update draft yang sudah status 2, TIDAK membuat baru
        await _updatePesanan(existingDraft.id, customer, tanggalPesan);
      } else {
        // ⬇️ Mode baru / restore: ubah draft status 0 → status 2
        await _simpanPesanan(customer, tanggalPesan);
      }

      close();
      _showSaveOrderSuccess(
        customer,
        totalItems,
        totalHarga,
        from,
        isEditMode,
        isRestoreFromList
      );
    } catch (err) {
      console.error("[save-order] Gagal simpan:", err);
      errorEl.textContent = "Gagal menyimpan: " + (err.message || "Terjadi kesalahan");
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = originalHTML;
    }
  });
}

/**
 * Mode BARU / RESTORE: ubah draft (status 0) menjadi status 2 + update data customer.
 * Menggunakan draft aktif dari sessionStorage.
 * @param {object} customer - record customer terpilih
 * @param {string} tanggalPesan - "YYYY-MM-DD"
 */
async function _simpanPesanan(customer, tanggalPesan) {
  const userId = sessionStorage.getItem("login");
  if (!userId) throw new Error("Sesi login habis.");

  if (typeof _draftOrderKey !== "function") {
    throw new Error("Fungsi _draftOrderKey tidak tersedia.");
  }

  const draftId = sessionStorage.getItem(_draftOrderKey());
  if (!draftId) {
    throw new Error("Tidak ada draft pesanan. Keranjang kosong.");
  }

  const penjualan = await db.penjualan.get(draftId);
  if (!penjualan) throw new Error("Draft penjualan tidak ditemukan.");
  if (penjualan.status !== 0) throw new Error("Pesanan sudah diproses.");
  if (penjualan.id_user !== userId) {
    throw new Error("Draft penjualan milik user lain.");
  }

  // ⬇️ Ambil details SEKALI di awal, dipakai untuk validasi & kurangi stok
  const details = await db.penjualan_detail
    .where("penjualan").equals(draftId)
    .filter(d => !d.deleted_at)
    .toArray();

  // ⬇️ Validasi stok cukup
  for (const d of details) {
    const produk = await db.produk.get(d.id_product);
    if (!produk || produk.deleted_at) continue;
    const stokTersedia = Number(produk.stok) || 0;
    if (stokTersedia < (Number(d.qty) || 0)) {
      throw new Error(`Stok ${produk.name} tidak cukup (tersisa ${stokTersedia}).`);
    }
  }

  const now = new Date().toISOString();

  await db.penjualan.update(draftId, {
    id_customer: customer.id,
    name_customer: customer.name || "",
    telp_customer: customer.no_telp || "-",
    tanggal_pesan: tanggalPesan,
    status: 2,
    updated_at: now
  });

  // ⬇️ Kurangi stok (pakai `details` yang sudah diambil)
  try {
    await _kurangiStok(details);
  } catch (e) {
    console.warn("[save-order] gagal kurangi stok:", e);
  }

  sessionStorage.removeItem(_draftOrderKey());
  sessionStorage.removeItem(_cartKey());

  return draftId;
}

/**
 * Mode EDIT: update draft yang sudah status 2 (dari List Pesanan).
 * Tidak mengubah status, tidak membuat record baru.
 * @param {string} penjualanId
 * @param {object} customer
 * @param {string} tanggalPesan
 */
async function _updatePesanan(penjualanId, customer, tanggalPesan) {
  // tidak menyentuk stok produk karena hanya edit customer dan tanggal
  const userId = sessionStorage.getItem("login");
  if (!userId) throw new Error("Sesi login habis.");

  const penjualan = await db.penjualan.get(penjualanId);
  if (!penjualan) throw new Error("Pesanan tidak ditemukan.");
  if (penjualan.deleted_at) throw new Error("Pesanan sudah dihapus.");
  if (penjualan.status !== 2) throw new Error("Pesanan bukan draft simpan.");
  if (penjualan.id_user !== userId) {
    throw new Error("Pesanan milik user lain.");
  }

  const now = new Date().toISOString();

  await db.penjualan.update(penjualanId, {
    id_customer: customer.id,
    name_customer: customer.name || "",
    telp_customer: customer.no_telp || "-",
    tanggal_pesan: tanggalPesan,
    updated_at: now
  });

  // Tetap simpan draft id di session agar bisa langsung dibayar dari List
  if (typeof _draftOrderKey === "function") {
    sessionStorage.setItem(_draftOrderKey(), penjualanId);
  }

  return penjualanId;
}

/**
 * Tampilkan notifikasi sukses + auto balik ke halaman sesuai konteks.
 *
 * @param {object} customer
 * @param {number} totalItems
 * @param {number} totalHarga
 * @param {string} from               - "order" | "list-pesanan"
 * @param {boolean} isEditMode        - true kalau update dari List Pesanan (draft status 2)
 * @param {boolean} isRestoreFromList - true kalau berasal dari restore List Pesanan (status 0 hasil Bayar)
 */
function _showSaveOrderSuccess(customer, totalItems, totalHarga, from, isEditMode, isRestoreFromList) {
  // Reset cart di memori & storage (mode baru & restore). Mode edit tidak menyentuh cart.
  if (!isEditMode) {
    _orderCart = {};
    if (typeof saveCart === "function") saveCart({});
  }

  const titleText = isEditMode
    ? "Pesanan Berhasil Diperbarui"
    : "Pesanan Berhasil Disimpan";

  const bodyText = isEditMode
    ? `Perubahan pesanan untuk <strong>${escapeHTML(customer.name || "")}</strong> telah disimpan.`
    : `Pesanan untuk <strong>${escapeHTML(customer.name || "")}</strong> telah disimpan. Anda bisa memproses pembayarannya nanti.`;

  // Bangun popup kecil
  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "saveOrderSuccess";
  overlay.innerHTML = `
    <div class="pay-modal__box pay-success">
      <div class="save-order-success__icon">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
      </div>
      <h2 class="pay-modal__title" style="margin-bottom:6px">${titleText}</h2>
      <p class="save-order-success__text">${bodyText}</p>

      <div class="save-order-summary" style="margin-top:12px;text-align:left">
        <div class="save-order-summary__row">
          <span class="save-order-summary__label">Jumlah Item</span>
          <span class="save-order-summary__value">${totalItems} item</span>
        </div>
        <div class="save-order-summary__row">
          <span class="save-order-summary__label">Total Harga</span>
          <span class="save-order-summary__value save-order-summary__value--total">
            Rp ${totalHarga.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      <div class="pay-modal__actions">
        <button type="button" class="btn-primary" id="btnSaveOrderOk" style="flex:1">
          <i class="fa-solid fa-check" aria-hidden="true"></i>
          Oke
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  function done() {
    overlay.remove();
    document.body.classList.remove("modal-open");
    if (typeof updateNavCartBadge === "function") updateNavCartBadge();

    // ⬇️ Bersihkan info "datang dari List Pesanan" karena sudah diproses
    _clearOrderFromListSession();

    // ⬇️ Tujuan redirect sesuai konteks:
    // - Kalau datang dari List Pesanan (edit/restore) → balik ke List Pesanan
    // - Kalau dari Order biasa → balik ke Home
    if (from === "list-pesanan" || isEditMode || isRestoreFromList) {
      navigateTo("data-list-pesanan");
    } else {
      navigateTo("home");
    }
  }

  overlay.querySelector("#btnSaveOrderOk").addEventListener("click", done);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) done();
  });
}

/**
 * Popup konfirmasi: "Apakah Pesanan akan di simpan?"
 * Dipakai saat user klik tombol List Pesanan sementara cart masih berisi.
 *
 * @param {Function} onYes - callback jika user pilih "Iya"
 * @param {Function} [onNo] - callback jika user pilih "Batal" (opsional)
 */
function openConfirmSimpanPesanan(onYes, onNo) {
  // Guard: jangan dobel popup
  if (document.getElementById("confirmSimpanModal")) return;

  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "confirmSimpanModal";
  overlay.innerHTML = `
    <div class="pay-modal__box">
      <div class="pay-modal__icon" style="
            width:56px;height:56px;margin:0 auto 14px;
            border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:linear-gradient(135deg,#f59e0b,#d97706);
            color:#fff;font-size:22px;
            box-shadow:0 6px 16px rgba(245,158,11,0.35);">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
      </div>

      <h2 class="pay-modal__title" style="margin-bottom:6px">
        Simpan Pesanan?
      </h2>
      <p class="save-order-success__text" style="margin-bottom:16px">
        Apakah Pesanan akan di simpan sebelum membuka List Pesanan?
      </p>

      <div class="pay-modal__actions">
        <button type="button" class="btn-secondary" id="btnConfirmSimpanNo">
          Batal
        </button>
        <button type="button" class="btn-primary" id="btnConfirmSimpanYes">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
          Iya, Simpan
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  function close() {
    overlay.remove();
    document.body.classList.remove("modal-open");
  }

  overlay.querySelector("#btnConfirmSimpanNo").addEventListener("click", function () {
    close();
    if (typeof onNo === "function") onNo();
  });

  overlay.querySelector("#btnConfirmSimpanYes").addEventListener("click", function () {
    close();
    if (typeof onYes === "function") onYes();
  });

  // Klik backdrop → sama seperti Batal
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      close();
      if (typeof onNo === "function") onNo();
    }
  });

  // ESC → sama seperti Batal
  function onKey(e) {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", onKey);
      close();
      if (typeof onNo === "function") onNo();
    }
  }
  document.addEventListener("keydown", onKey);
}

/**
 * Popup konfirmasi logout: "Keluar dari aplikasi?"
 * Menggantikan confirm() bawaan browser.
 *
 * @param {Function} onYes - callback jika user pilih "Iya, Keluar"
 * @param {Function} [onNo] - callback jika user pilih "Batal" (opsional)
 */
function openConfirmLogout(onYes, onNo) {
  // Guard: jangan dobel popup
  if (document.getElementById("confirmLogoutModal")) return;

  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "confirmLogoutModal";
  overlay.innerHTML = `
    <div class="pay-modal__box">
      <div class="pay-modal__icon" style="
            width:56px;height:56px;margin:0 auto 14px;
            border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:linear-gradient(135deg,#ef4444,#dc2626);
            color:#fff;font-size:22px;
            box-shadow:0 6px 16px rgba(239,68,68,0.35);">
        <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
      </div>

      <h2 class="pay-modal__title" style="margin-bottom:6px">
        Keluar dari aplikasi?
      </h2>
      <p class="save-order-success__text" style="margin-bottom:16px">
        Anda akan keluar dari akun ini. Keranjang dan draft yang belum disimpan akan dibersihkan.
      </p>

      <div class="pay-modal__actions">
        <button type="button" class="btn-secondary" id="btnConfirmLogoutNo">
          Batal
        </button>
        <button type="button" class="btn-danger" id="btnConfirmLogoutYes">
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
          Iya, Keluar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  function close() {
    overlay.remove();
    document.body.classList.remove("modal-open");
  }

  overlay.querySelector("#btnConfirmLogoutNo").addEventListener("click", function () {
    close();
    if (typeof onNo === "function") onNo();
  });

  overlay.querySelector("#btnConfirmLogoutYes").addEventListener("click", function () {
    close();
    if (typeof onYes === "function") onYes();
  });

  // Klik backdrop → sama seperti Batal
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      close();
      if (typeof onNo === "function") onNo();
    }
  });

  // ESC → sama seperti Batal
  function onKey(e) {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", onKey);
      close();
      if (typeof onNo === "function") onNo();
    }
  }
  document.addEventListener("keydown", onKey);
}

/**
 * Popup info umum (pengganti alert()).
 *
 * @param {string} text        - Pesan yang ditampilkan
 * @param {object} [opts]
 * @param {string} [opts.title]   - Judul popup (default: "Perhatian")
 * @param {string} [opts.icon]    - "warning" | "danger" | "info" | "success" (default: "warning")
 * @param {string} [opts.button]  - Label tombol (default: "Mengerti")
 * @param {Function} [opts.onClose] - Callback saat popup ditutup
 */
function openInfoPopup(text, opts) {
  opts = opts || {};
  const title = opts.title || "Perhatian";
  const icon = opts.icon || "warning";
  const buttonLabel = opts.button || "Mengerti";

  // Guard: jangan dobel popup
  if (document.getElementById("infoPopup")) return;

  const iconMap = {
    warning: "fa-triangle-exclamation",
    danger: "fa-circle-exclamation",
    info: "fa-circle-info",
    success: "fa-circle-check"
  };
  const iconClass = iconMap[icon] || iconMap.warning;

  const overlay = document.createElement("div");
  overlay.className = "info-popup";
  overlay.id = "infoPopup";
  overlay.innerHTML = `
    <div class="info-popup__box">
      <div class="info-popup__icon info-popup__icon--${escapeHTML(icon)}">
        <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
      </div>
      <h2 class="info-popup__title">${escapeHTML(title)}</h2>
      <p class="info-popup__text">${escapeHTML(text)}</p>
      <div class="info-popup__actions">
        <button type="button" class="btn-primary" id="btnInfoOk">
          ${escapeHTML(buttonLabel)}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  function close() {
    overlay.remove();
    document.body.classList.remove("modal-open");
    if (typeof opts.onClose === "function") opts.onClose();
  }

  overlay.querySelector("#btnInfoOk").addEventListener("click", close);

  // Klik backdrop → tutup
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  // ESC → tutup
  function onKey(e) {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", onKey);
      close();
    }
  }
  document.addEventListener("keydown", onKey);
}



/* ---------- Expose global ---------- */
window.openSaveOrderPopup = openSaveOrderPopup;
window._clearOrderFromListSession = _clearOrderFromListSession;
window.openConfirmSimpanPesanan = openConfirmSimpanPesanan;
window.openConfirmLogout = openConfirmLogout;
window.openInfoPopup = openInfoPopup;