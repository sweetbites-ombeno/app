/* ============================================
   HALAMAN ORDER — Checkout + Pembayaran
   Cart key per-user (isolasi antar user)
   ============================================ */

let _orderProdukCache = [];
let _orderKategoriMap = {};
let _orderCart = {};
let _orderMethod = "tunai";
let _orderTotal = 0;
let _orderTotalItems = 0;

/* ---------- Info customer+tanggal dari List Pesanan ----------
   Disimpan juga di memori agar tetap tersedia meski _draftOrderKey berganti
   (mis. saat cart habis lalu diisi ulang → draft baru dibuat).
   ------------------------------------------------------------ */
let _orderFromListInfo = null;

/* ---------- Helper format tanggal ---------- */
function _formatTanggalSingkatLocal(str) {
  if (!str) return "-";
  const d = new Date(str);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

/* ---------- Render Items ---------- */
function renderOrderItems() {
  const card = document.getElementById("orderItemsCard");
  const emptyEl = document.getElementById("orderEmpty");
  const contentEl = document.getElementById("orderContent");
  const cartBar = document.getElementById("orderCartBar");
  if (!card) return;

  _orderCart = getCart();

  const ids = Object.keys(_orderCart).filter(function (id) {
    return (_orderCart[id] || 0) > 0;
  });

  if (ids.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    if (contentEl) contentEl.hidden = true;
    if (cartBar) cartBar.hidden = true;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  if (contentEl) contentEl.hidden = false;
  if (cartBar) cartBar.hidden = false;

  _orderTotal = 0;
  _orderTotalItems = 0;

  const itemsHTML = ids.map(function (id) {
    const p = _orderProdukCache.find(function (x) { return x.id === id; });
    if (!p) return "";
    const qty = _orderCart[id];
    const harga = Number(p.harga_jual || 0);
    _orderTotal += harga * qty;
    _orderTotalItems += qty;

    const nama = escapeHTML(p.name || "");
    const hargaStr = "Rp " + harga.toLocaleString("id-ID");
    const imgHTML = p.image_base64
      ? `<img class="order-item__img" src="${p.image_base64}" alt="${nama}">`
      : `<div class="order-item__img order-item__img--empty"><i class="fa-regular fa-image"></i></div>`;

    return `
            <div class="order-item" data-id="${id}">
                ${imgHTML}
                <div class="order-item__body">
                    <h3 class="order-item__name">${nama}</h3>
                    <span class="order-item__price">${hargaStr} / pcs</span>
                    <button type="button" class="order-item__delete"
                            data-action="order-delete" data-id="${id}"
                            data-name="${nama}" aria-label="Hapus item">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                        <span>Hapus</span>
                    </button>
                </div>
                <div class="qty-stepper order-item__qty" data-stepper-id="${id}">
                    <button type="button" class="qty-stepper__btn qty-stepper__btn--minus"
                            data-action="order-dec" data-id="${id}"
                            aria-label="Kurangi" ${qty <= 1 ? "disabled" : ""}>
                        <i class="fa-solid fa-minus" aria-hidden="true"></i>
                    </button>
                    <span class="qty-stepper__value">${qty}</span>
                    <button type="button" class="qty-stepper__btn qty-stepper__btn--plus"
                            data-action="order-inc" data-id="${id}"
                            aria-label="Tambah">
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `;
  }).join("");

  const addBtn = `
        <button type="button" class="order-add-produk" id="btnTambahProduk">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            <span>Tambah Produk</span>
            <i class="fa-solid fa-arrow-right order-add-produk__arrow" aria-hidden="true"></i>
        </button>
    `;
  card.innerHTML = itemsHTML + addBtn;

  const totalEl = document.getElementById("orderTotal");
  const cartTotalEl = document.getElementById("orderCartTotal");
  const totalStr = "Rp " + _orderTotal.toLocaleString("id-ID");
  if (totalEl) totalEl.textContent = totalStr;
  if (cartTotalEl) cartTotalEl.textContent = totalStr;
}

/* ============================================
   SINKRONISASI KE DATABASE (DEBOUNCED)
   ============================================ */

let _orderSyncTimer = null;

function _debouncedSyncOrderCart() {
  if (typeof syncCartToDB !== "function") return;

  _orderCart = getCart();

  clearTimeout(_orderSyncTimer);
  _orderSyncTimer = setTimeout(async function () {
    try {
      const latestCart = getCart();
      await syncCartToDB(latestCart, _orderProdukCache, _orderKategoriMap);
    } catch (err) {
      console.error("[order] Sinkron cart gagal:", err);
    }
  }, 300);
}

function orderSetQty(id, qty) {
  qty = Math.max(0, Math.floor(qty) || 0);
  if (qty === 0) delete _orderCart[id];
  else _orderCart[id] = qty;
  saveCart(_orderCart);
  renderOrderItems();
  _debouncedSyncOrderCart();
}

function orderDeleteItem(id) {
  delete _orderCart[id];
  saveCart(_orderCart);
  renderOrderItems();
  _debouncedSyncOrderCart();
}

/* ---------- Load Data ---------- */
async function loadOrderFromDB() {
  try {
    _orderProdukCache = await db.produk
      .filter(function (p) { return !p.deleted_at; })
      .toArray();

    const kats = await db.kategori
      .filter(function (k) { return !k.deleted_at; })
      .toArray();
    _orderKategoriMap = {};
    kats.forEach(function (k) { _orderKategoriMap[k.id] = k.name; });

    renderOrderItems();
  } catch (err) {
    console.error("[order] Gagal memuat:", err);
  }
}

/* ---------- Terapkan metode ke UI ---------- */
function _applyMethodToUI(method) {
  const methodsEl = document.getElementById("payMethods");
  if (!methodsEl) return;
  methodsEl.querySelectorAll(".pay-method").forEach(function (b) {
    const active = b.dataset.method === method;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
}

/* ============================================
   EVENT DELEGATION ORDER
   ============================================ */
if (!window._orderBound) {
  window._orderBound = true;

  document.addEventListener("click", function (e) {
    if (!document.querySelector(".page--order")) return;

    const inc = e.target.closest("[data-action='order-inc']");
    if (inc) {
      e.preventDefault();
      e.stopPropagation();
      const id = inc.dataset.id;
      const cart = getCart();
      orderSetQty(id, (cart[id] || 0) + 1);
      return;
    }
    const dec = e.target.closest("[data-action='order-dec']");
    if (dec) {
      e.preventDefault();
      e.stopPropagation();
      const id = dec.dataset.id;
      const cart = getCart();
      orderSetQty(id, (cart[id] || 0) - 1);
      return;
    }

    if (e.target.closest("#btnTambahProduk")) {
      e.preventDefault();
      navigateTo("home");
      return;
    }

    if (e.target.closest("#btnPilihMenu")) {
      e.preventDefault();
      navigateTo("home");
      return;
    }

    const methodBtn = e.target.closest(".pay-method");
    if (methodBtn && document.querySelector(".page--order")) {
      const methodsEl = document.getElementById("payMethods");
      if (methodsEl && methodsEl.contains(methodBtn)) {
        e.preventDefault();
        _orderMethod = methodBtn.dataset.method || "tunai";
        _applyMethodToUI(_orderMethod);

        if (typeof updateDraftMethod === "function") {
          updateDraftMethod(_orderMethod);
        }
        return;
      }
    }

    const delBtn = e.target.closest("[data-action='order-delete']");
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = delBtn.dataset.id;
      const name = delBtn.dataset.name || "item ini";
      if (!confirm(`Hapus "${name}" dari pesanan?`)) return;
      orderDeleteItem(id);
      return;
    }

    if (e.target.closest("#btnOrderBayar")) {
      e.preventDefault();
      if (_orderTotalItems === 0) return;
      openPaymentPopup();
      return;
    }
  });
}

/* ---------- Init ---------- */
async function initOrder() {
  // Restore metode pembayaran dari draft milik user ini
  let initialMethod = "tunai";
  try {
    const userId = sessionStorage.getItem("login");
    const draftId = typeof _draftOrderKey === "function"
      ? sessionStorage.getItem(_draftOrderKey())
      : null;

    if (draftId && userId && typeof db !== "undefined") {
      const draft = await db.penjualan.get(draftId);
      if (
        draft &&
        draft.status === 0 &&
        draft.id_user === userId &&          // ⬅️ hanya draft milik user ini
        draft.method_bayar
      ) {
        initialMethod = draft.method_bayar;
      }
    }
  } catch (e) {
    console.warn("[order] Gagal membaca method_bayar draft:", e);
  }

  _orderMethod = initialMethod;
  _applyMethodToUI(_orderMethod);

  await loadOrderFromDB();

  // ⬇️ Info dari List Pesanan
  const infoRaw = sessionStorage.getItem("orderFromList");
  if (infoRaw) {
    try {
      const info = JSON.parse(infoRaw);

      // ⬇️ Guard: hanya tampilkan banner kalau cart memang berisi
      const cartNow = getCart();
      const totalCartNow = Object.keys(cartNow).reduce(function (s, k) {
        return s + (cartNow[k] || 0);
      }, 0);

      if (totalCartNow > 0) {
        _orderFromListInfo = info;   // simpan di memori (tahan meski draft ID berganti)

        const infoEl = document.getElementById("orderInfoBanner");
        if (infoEl) {
          infoEl.hidden = false;
          infoEl.innerHTML = `
        <i class="fa-solid fa-receipt" aria-hidden="true"></i>
        <div>
          <strong>${escapeHTML(info.name_customer || "-")}</strong>
          <span>${typeof _formatTanggalPesan === "function"
              ? _formatTanggalPesan(info.tanggal_pesan)
              : (info.tanggal_pesan || "-")}</span>
        </div>`;
        }
      } else {
        // Cart kosong → info dari list tidak relevan, bersihkan
        _orderFromListInfo = null;
        try {
          sessionStorage.removeItem("orderFromList");
          sessionStorage.removeItem("orderFromListOriginal");
        } catch (e) { }
        const infoEl = document.getElementById("orderInfoBanner");
        if (infoEl) {
          infoEl.hidden = true;
          infoEl.innerHTML = "";
        }
      }
    } catch (e) {
      console.warn("[order] Gagal parse orderFromList:", e);
    }
    // Jangan hapus session sampai user simpan/bayar
  }

  _orderCart = getCart();
  if (typeof syncCartToDB === "function") {
    try {
      await syncCartToDB(_orderCart, _orderProdukCache, _orderKategoriMap);
    } catch (err) {
      console.error("[order] Gagal sinkron draft awal:", err);
    }
  }

  if (typeof updateDraftMethod === "function") {
    await updateDraftMethod(_orderMethod);
  }

  // Tombol header aksi Order — Simpan Pesanan
  const btnSimpan = document.getElementById("btnSimpanPesanan");
  if (btnSimpan && !btnSimpan._boundSave) {
    btnSimpan._boundSave = true;
    btnSimpan.addEventListener("click", function () {
      const cart = getCart();
      const totalItems = Object.keys(cart).reduce(function (s, id) {
        return s + (cart[id] || 0);
      }, 0);

      if (totalItems === 0) {
        alert("Keranjang kosong. Tambahkan produk dulu sebelum menyimpan pesanan.");
        return;
      }

      if (typeof openSaveOrderPopup !== "function") {
        alert("Fitur simpan pesanan belum siap. Muat ulang halaman.");
        return;
      }

      // ⬇️ Pastikan default customer+tanggal dari List Pesanan tetap terbawa,
      // meski draft ID sempat berubah karena syncCartToDB (mis. cart diedit ulang).
      if (_orderFromListInfo && !sessionStorage.getItem("orderFromListOriginal")) {
        try {
          const draftIdNow = sessionStorage.getItem(_draftOrderKey());
          if (draftIdNow) {
            sessionStorage.setItem("orderFromListOriginal", JSON.stringify({
              id: draftIdNow,
              id_customer: _orderFromListInfo.id_customer || "",
              name_customer: _orderFromListInfo.name_customer || "",
              telp_customer: _orderFromListInfo.telp_customer || "-",
              tanggal_pesan: _orderFromListInfo.tanggal_pesan || ""
            }));
          }
        } catch (e) { }
      }

      openSaveOrderPopup();
    });
  }

  // Tombol header aksi Order — List Pesanan
  const btnList = document.getElementById("btnListPesanan");
  if (btnList && !btnList._boundList) {
    btnList._boundList = true;
    btnList.addEventListener("click", function () {
      const cart = getCart();
      const totalItems = Object.keys(cart).reduce(function (s, id) {
        return s + (cart[id] || 0);
      }, 0);

      if (totalItems > 0) {
        // ⬇️ Popup konfirmasi custom (ganti confirm bawaan browser)
        if (typeof openConfirmSimpanPesanan === "function") {
          openConfirmSimpanPesanan(
            function onYes() {
              // Iya → buka popup simpan pesanan
              if (typeof openSaveOrderPopup === "function") {
                openSaveOrderPopup({ from: "order" });
              }
            },
            function onNo() {
              // Batal → tidak melakukan apa-apa (tetap di halaman Order)
            }
          );
        } else {
          // Fallback kalau openConfirmSimpanPesanan tidak tersedia
          if (confirm("Apakah Pesanan akan di simpan?")) {
            openSaveOrderPopup({ from: "order" });
          }
        }
        return;
      }

      // Cart kosong → langsung ke list pesanan
      navigateTo("data-list-pesanan");
    });
  }

  updateNavCartBadge();
}

/* ============================================
   POPUP PEMBAYARAN
   ============================================ */

function openPaymentPopup() {
  if (_orderMethod === "tunai") openTunaiPopup();
  else openCameraPopup(_orderMethod);
}

/* ---------- 1. Tunai ---------- */
function openTunaiPopup() {
  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "payModal";

  overlay.innerHTML = `
        <div class="pay-modal__box">
            <h2 class="pay-modal__title">Pembayaran Tunai</h2>

            <div class="pay-tunai__tagihan">
                <span class="pay-tunai__tagihan-label">Total Tagihan</span>
                <span class="pay-tunai__tagihan-value">Rp ${_orderTotal.toLocaleString("id-ID")}</span>
            </div>

            <label class="pay-tunai__label" for="tunaiDiterima">Uang diterima</label>
            <div class="form-group__input pay-tunai__input-wrap">
                <span class="pay-tunai__prefix">Rp</span>
                <input type="text" id="tunaiDiterima" class="pay-tunai__input"
                       inputmode="numeric" value="0" autocomplete="off">
            </div>

            <div class="pay-tunai__quick" id="tunaiQuick">
                <button type="button" class="pay-tunai__chip" data-add="0">Pas</button>
                <button type="button" class="pay-tunai__chip" data-add="1000">+1rb</button>
                <button type="button" class="pay-tunai__chip" data-add="2000">+2rb</button>
                <button type="button" class="pay-tunai__chip" data-add="5000">+5rb</button>
                <button type="button" class="pay-tunai__chip" data-add="10000">+10rb</button>
                <button type="button" class="pay-tunai__chip" data-add="20000">+20rb</button>
                <button type="button" class="pay-tunai__chip" data-add="50000">+50rb</button>
                <button type="button" class="pay-tunai__chip" data-add="100000">+100rb</button>
            </div>

            <label class="pay-tunai__label" for="tunaiKembalian">Kembalian</label>
            <div class="form-group__input pay-tunai__input-wrap">
                <span class="pay-tunai__prefix">Rp</span>
                <input type="text" id="tunaiKembalian" class="pay-tunai__input"
                       value="0" readonly>
            </div>

            <div class="pay-modal__actions">
                <button type="button" class="btn-secondary" id="btnTunaiCancel">Batal</button>
                <button type="button" class="btn-primary" id="btnTunaiConfirm">Konfirmasi Bayar</button>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  const inputDiterima = overlay.querySelector("#tunaiDiterima");
  const inputKembalian = overlay.querySelector("#tunaiKembalian");
  const quick = overlay.querySelector("#tunaiQuick");

  function parseNum(str) {
    return Number(String(str || "").replace(/\D/g, "")) || 0;
  }
  function formatNum(n) {
    return Number(n || 0).toLocaleString("id-ID");
  }
  function updateKembalian() {
    const diterima = parseNum(inputDiterima.value);
    const kembalian = Math.max(0, diterima - _orderTotal);
    inputKembalian.value = formatNum(kembalian);
  }

  inputDiterima.addEventListener("input", function () {
    const digits = parseNum(inputDiterima.value);
    inputDiterima.value = formatNum(digits);
    updateKembalian();
  });

  quick.addEventListener("click", function (e) {
    const chip = e.target.closest("[data-add]");
    if (!chip) return;
    const add = Number(chip.dataset.add) || 0;
    const cur = parseNum(inputDiterima.value);
    const newVal = add === 0 ? _orderTotal : cur + add;
    inputDiterima.value = formatNum(newVal);
    updateKembalian();
  });

  inputDiterima.focus();
  inputDiterima.select();

  overlay.querySelector("#btnTunaiCancel").addEventListener("click", closePayModal);
  overlay.querySelector("#btnTunaiConfirm").addEventListener("click", function () {
    const diterima = parseNum(inputDiterima.value);
    if (diterima < _orderTotal) {
      alert("Uang diterima kurang dari total tagihan.");
      return;
    }
    const kembalian = diterima - _orderTotal;
    closePayModal();
    processPayment({
      method: "tunai",
      uangDiterima: diterima,
      uangKembalian: kembalian,
      imgBase64: ""
    });
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closePayModal();
  });
}

/* ---------- 2 & 3. Qris / Transfer ---------- */
async function openCameraPopup(method) {
  const isQris = method === "qris";
  const title = isQris ? "Pembayaran Qris" : "Pembayaran Transfer";

  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "payModal";

  overlay.innerHTML = `
        <div class="pay-modal__box">
            <h2 class="pay-modal__title">${title}</h2>

            <div class="pay-camera" id="payCamera">
                <video id="cameraVideo" class="pay-camera__video" autoplay playsinline muted hidden></video>
                <canvas id="cameraCanvas" hidden></canvas>
                <img id="cameraPreview" class="pay-camera__preview" alt="Preview" hidden>
                <div class="pay-camera__placeholder" id="cameraPlaceholder">
                    <i class="fa-solid fa-camera" aria-hidden="true"></i>
                    <p>Ambil gambar bukti pembayaran</p>
                </div>
            </div>

            <button type="button" class="btn-secondary pay-camera__btn" id="btnAmbilGambar">
                <i class="fa-solid fa-camera" aria-hidden="true"></i>
                Ambil Gambar
            </button>

            <div class="pay-modal__actions">
                <button type="button" class="btn-secondary" id="btnCameraCancel">Batal</button>
                <button type="button" class="btn-primary" id="btnCameraConfirm">Konfirmasi Bayar</button>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  let stream = null;
  let capturedBase64 = "";

  const video = overlay.querySelector("#cameraVideo");
  const canvas = overlay.querySelector("#cameraCanvas");
  const preview = overlay.querySelector("#cameraPreview");
  const placeholder = overlay.querySelector("#cameraPlaceholder");
  const btnAmbil = overlay.querySelector("#btnAmbilGambar");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    video.srcObject = stream;
    video.hidden = false;
    placeholder.hidden = true;
  } catch (err) {
    console.warn("[camera] Tidak bisa akses kamera:", err);
    placeholder.innerHTML = `
            <i class="fa-solid fa-camera-slash" aria-hidden="true"></i>
            <p>Kamera tidak tersedia</p>
        `;
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
  }

  btnAmbil.addEventListener("click", function () {
    if (!stream) {
      alert("Kamera tidak tersedia.");
      return;
    }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedBase64 = canvas.toDataURL("image/jpeg", 0.85);
    preview.src = capturedBase64;
    preview.hidden = false;
    video.hidden = true;
    placeholder.hidden = true;
    btnAmbil.innerHTML = '<i class="fa-solid fa-camera-rotate"></i> Ambil Ulang';
    stopStream();
  });

  function close() {
    stopStream();
    closePayModal();
  }

  overlay.querySelector("#btnCameraCancel").addEventListener("click", close);
  overlay.querySelector("#btnCameraConfirm").addEventListener("click", function () {
    stopStream();
    closePayModal();
    processPayment({
      method: method,
      uangDiterima: _orderTotal,
      uangKembalian: 0,
      imgBase64: capturedBase64
    });
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
}

function closePayModal() {
  const modal = document.getElementById("payModal");
  if (modal) modal.remove();
  document.body.classList.remove("modal-open");
}

/* ============================================
   PROSES PEMBAYARAN
   ============================================ */

async function processPayment(opts) {
  const userId = sessionStorage.getItem("login");
  if (!userId) { alert("Sesi login habis."); return; }

  try {
    const user = await db.user.get(userId);
    if (!user) { alert("User tidak ditemukan."); return; }

    if (typeof syncCartToDB === "function") {
      await syncCartToDB(getCart(), _orderProdukCache, _orderKategoriMap);
    }

    if (typeof finalizePayment !== "function") {
      throw new Error("Fungsi finalizePayment tidak tersedia. Pastikan cart-db.js dimuat.");
    }

    const penjualan = await finalizePayment({
      method: opts.method,
      uangDiterima: opts.uangDiterima,
      uangKembalian: opts.uangKembalian,
      imgBase64: opts.imgBase64 || ""
    });

    const details = await db.penjualan_detail
      .where("penjualan").equals(penjualan.id)
      .filter(d => !d.deleted_at)
      .toArray();
    const totalItems = details.reduce((s, d) => s + (d.qty || 0), 0);

    const successData = {
      kode: penjualan.kode,
      tanggal: penjualan.tanggal_jual,
      total: penjualan.total_bayar,
      method: penjualan.method_bayar,
      uangDiterima: penjualan.uang_diterima,
      uangKembalian: penjualan.uang_kembalian,
      kasir: user.username,
      totalItems: totalItems
    };

    _orderCart = {};
    saveCart({});

    // ⬇️ Bersihkan info "datang dari List Pesanan" setelah pembayaran lunas
    if (typeof _clearOrderFromListSession === "function") {
      _clearOrderFromListSession();
    }
    try {
      sessionStorage.removeItem("orderFromListOriginal");
      sessionStorage.removeItem("orderFromList");
    } catch (e) { }

    // Reset info di memori juga
    _orderFromListInfo = null;

    openSuccessPopup(successData);

  } catch (err) {
    console.error("[order] Gagal simpan pembayaran:", err);
    alert("Gagal menyimpan pembayaran: " + (err.message || "Terjadi kesalahan"));
  }
}

/* ============================================
   POPUP PEMBAYARAN BERHASIL
   ============================================ */

function openSuccessPopup(data) {
  const overlay = document.createElement("div");
  overlay.className = "pay-modal";
  overlay.id = "successModal";

  const d = new Date(data.tanggal);
  const tanggalStr = new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(d);
  const jamStr = d.getHours().toString().padStart(2, "0")
    + ":" + d.getMinutes().toString().padStart(2, "0");
  const methodLabel = data.method === "tunai" ? "Tunai"
    : data.method === "qris" ? "Qris" : "Transfer";

  overlay.innerHTML = `
        <div class="pay-modal__box pay-success">
            <div class="pay-success__header">
                <h2 class="pay-success__title">Pembayaran Berhasil</h2>
                <span class="badge badge--success pay-success__badge">
                    <i class="fa-solid fa-circle" aria-hidden="true"></i>
                    Lunas
                </span>
            </div>
            <p class="pay-success__date">${tanggalStr} - ${jamStr}</p>

            <div class="pay-success__total-card">
                <span class="pay-success__total-label">Total Bayar</span>
                <span class="pay-success__total-value">Rp ${data.total.toLocaleString("id-ID")}</span>
            </div>

            <div class="pay-success__info-card">
                <div class="pay-success__row">
                    <span class="pay-success__row-label">Metode</span>
                    <span class="pay-success__row-value">${methodLabel}</span>
                </div>
                <div class="pay-success__row">
                    <span class="pay-success__row-label">Uang diterima</span>
                    <span class="pay-success__row-value">Rp ${data.uangDiterima.toLocaleString("id-ID")}</span>
                </div>
                <div class="pay-success__row">
                    <span class="pay-success__row-label">Kembalian</span>
                    <span class="pay-success__row-value">Rp ${data.uangKembalian.toLocaleString("id-ID")}</span>
                </div>
                <div class="pay-success__row">
                    <span class="pay-success__row-label">Kasir</span>
                    <span class="pay-success__row-value">${escapeHTML(data.kasir)}</span>
                </div>
                <div class="pay-success__row">
                    <span class="pay-success__row-label">Item</span>
                    <span class="pay-success__row-value">${data.totalItems} item</span>
                </div>
            </div>

            <div class="pay-modal__actions">
                <button type="button" class="btn-secondary" id="btnCetak">
                    <i class="fa-solid fa-print" aria-hidden="true"></i>
                    Cetak
                </button>
                <button type="button" class="btn-primary" id="btnSelesai">
                    Selesai
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  overlay.querySelector("#btnCetak").addEventListener("click", function () {
    alert("Fitur cetak akan diimplementasikan nanti.");
  });

  overlay.querySelector("#btnSelesai").addEventListener("click", function () {
    overlay.remove();
    document.body.classList.remove("modal-open");
    updateNavCartBadge();
    _orderFromListInfo = null;   // ⬅️ reset memori
    navigateTo("home");
  });
}