/* ============================================
   SIMPAN PESANAN (status 2)
   Popup pilih customer + simpan draft jadi "Simpan Pesanan"
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
 * Buka popup Simpan Pesanan.
 * Syarat: cart tidak kosong (sudah divalidasi pemanggil).
 */
async function openSaveOrderPopup() {
    // Guard: jangan dobel popup
    if (document.getElementById("saveOrderModal")) return;
    // Pastikan draft di DB sinkron dengan cart terbaru
    if (typeof syncCartToDB === "function") {
        try {
            await syncCartToDB(getCart(), _orderProdukCache, _orderKategoriMap);
        } catch (e) {
            console.warn("[save-order] sync awal gagal:", e);
            alert("Gagal menyiapkan draft: " + e.message);
            return; // ← hentikan kalau sync gagal
        }
    }

    // Siapkan data
    const cart = getCart();
    const ids = Object.keys(cart).filter(function (id) { return (cart[id] || 0) > 0; });
    if (ids.length === 0) {
        alert("Keranjang kosong. Tambahkan produk dulu.");
        return;
    }

    let totalItems = 0;
    let totalHarga = 0;
    ids.forEach(function (id) {
        const qty = cart[id] || 0;
        const p = _orderProdukCache.find(function (x) { return x.id === id; });
        if (!p) return;
        totalItems += qty;
        totalHarga += Number(p.harga_jual || 0) * qty;
    });

    // Load customer
    let customers = [];
    try {
        customers = await _loadCustomerForSave();
    } catch (err) {
        console.error("[save-order] Gagal load customer:", err);
    }

    // Default customer = "Umum" (case-insensitive) kalau ada
    let defaultCustomerId = "";
    const umum = customers.find(function (c) {
        return (c.name || "").toLowerCase() === "umum";
    });
    if (umum) defaultCustomerId = umum.id;

    // Render opsi
    const optionsHTML = customers.map(function (c) {
        const label = c.name || "(tanpa nama)";
        const telp = c.no_telp && c.no_telp !== "-" ? ` — ${c.no_telp}` : "";
        return `<option value="${escapeHTML(c.id)}"${c.id === defaultCustomerId ? " selected" : ""}>
              ${escapeHTML(label)}${escapeHTML(telp)}
            </option>`;
    }).join("");

    // Bangun modal
    const overlay = document.createElement("div");
    overlay.className = "pay-modal";
    overlay.id = "saveOrderModal";
    overlay.innerHTML = `
    <div class="pay-modal__box">
      <h2 class="pay-modal__title">Simpan Pesanan</h2>

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
            <input type="date" id="saveOrderTanggalPesan" name="saveOrderTanggalPesan">
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

    // Tombol simpan
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
            await _simpanPesanan(customer, tanggalPesan); // ← kirim tanggal
            close();
            _showSaveOrderSuccess(customer, totalItems, totalHarga);
        } catch (err) {
            console.error("[save-order] Gagal simpan:", err);
            errorEl.textContent = "Gagal menyimpan: " + (err.message || "Terjadi kesalahan");
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = originalHTML;
        }
    });
}

/**
 * Inti: ubah draft (status 0) menjadi status 2 + update data customer.
 * Menggunakan draft aktif dari sessionStorage.
 * @param {object} customer - record customer terpilih
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

    const now = new Date().toISOString();

    // Update: status 2 + customer + tanggal_pesan (tanpa jam)
    await db.penjualan.update(draftId, {
        id_customer: customer.id,
        name_customer: customer.name || "",
        telp_customer: customer.no_telp || "-",
        tanggal_pesan: tanggalPesan,   // "YYYY-MM-DD"
        status: 2,
        updated_at: now
    });

    sessionStorage.removeItem(_draftOrderKey());
    sessionStorage.removeItem(_cartKey());

    return draftId;
}

/**
 * Tampilkan notifikasi sukses + auto balik ke home.
 */
function _showSaveOrderSuccess(customer, totalItems, totalHarga) {
    // Reset cart di memori & storage
    _orderCart = {};
    if (typeof saveCart === "function") saveCart({});

    // Bangun popup kecil
    const overlay = document.createElement("div");
    overlay.className = "pay-modal";
    overlay.id = "saveOrderSuccess";
    overlay.innerHTML = `
    <div class="pay-modal__box pay-success">
      <div class="save-order-success__icon">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
      </div>
      <h2 class="pay-modal__title" style="margin-bottom:6px">Pesanan Berhasil Disimpan</h2>
      <p class="save-order-success__text">
        Pesanan untuk <strong>${escapeHTML(customer.name || "")}</strong>
        telah disimpan. Anda bisa memproses pembayarannya nanti.
      </p>

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
        navigateTo("home");
    }

    overlay.querySelector("#btnSaveOrderOk").addEventListener("click", done);
    overlay.addEventListener("click", function (e) {
        if (e.target === overlay) done();
    });
}

/* ---------- Expose global ---------- */
window.openSaveOrderPopup = openSaveOrderPopup;