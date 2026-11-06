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
      openInfoPopup("Uang diterima kurang dari total tagihan.", {
        title: "Uang Tidak Cukup",
        icon: "warning",
        button: "Mengerti"
      });
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

            <div class="pay-camera__btn-row">
                <button type="button" class="btn-secondary pay-camera__btn" id="btnAmbilGambar">
                    <i class="fa-solid fa-camera" aria-hidden="true"></i>
                    Ambil Gambar
                </button>
                <button type="button" class="btn-secondary pay-camera__btn" id="btnPilihFileGambar">
                    <i class="fa-solid fa-image" aria-hidden="true"></i>
                    Pilih File
                </button>
            </div>

            <!-- Input file hidden -->
            <input type="file" id="inputFileBukti" accept="image/*" hidden>

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
  const btnPilihFile = overlay.querySelector("#btnPilihFileGambar");
  const inputFile = overlay.querySelector("#inputFileBukti");

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

  /* ----- Ambil via kamera (existing) ----- */
  btnAmbil.addEventListener("click", function () {
    if (!stream) {
      openInfoPopup("Kamera tidak tersedia.", {
        title: "Kamera Error",
        icon: "danger"
      });
      return;
    }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawBase64 = canvas.toDataURL("image/jpeg", 0.85);
    preview.src = rawBase64;
    preview.hidden = false;
    video.hidden = true;
    placeholder.hidden = true;
    btnAmbil.innerHTML = '<i class="fa-solid fa-camera-rotate"></i> Ambil Ulang';
    stopStream();

    // Simpan mentah, nanti dikompres saat "Konfirmasi Bayar"
    capturedBase64 = rawBase64;
  });

  /* ----- Pilih file ----- */
  btnPilihFile.addEventListener("click", function () {
    inputFile.click();
  });

  inputFile.addEventListener("change", async function () {
    const file = inputFile.files && inputFile.files[0];
    inputFile.value = ""; // reset supaya file sama bisa dipilih ulang
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      openInfoPopup("File harus berupa gambar.", {
        title: "Format Salah",
        icon: "warning"
      });
      return;
    }

    try {
      const dataUrl = await _readFileAsDataURL(file);
      // Buka popup crop
      _openCropPopup(dataUrl, {
        aspect: 3 / 4,
        onConfirm: async function (croppedDataUrl) {
          // Tampilkan preview hasil crop
          preview.src = croppedDataUrl;
          preview.hidden = false;
          video.hidden = true;
          placeholder.hidden = true;
          btnAmbil.innerHTML = '<i class="fa-solid fa-camera-rotate"></i> Ambil Ulang';
          stopStream();

          // Kompres → WebP → base64
          try {
            const finalBase64 = await _compressToWebPBase64(croppedDataUrl, {
              maxDim: 1280,
              quality: 0.8
            });
            capturedBase64 = finalBase64;
            preview.src = finalBase64; // update preview dengan hasil kompresi
          } catch (err) {
            console.warn("[crop] Gagal kompres:", err);
            // Fallback: pakai hasil crop apa adanya
            capturedBase64 = croppedDataUrl;
          }
        }
      });
    } catch (err) {
      console.error("[file] Gagal baca file:", err);
      openInfoPopup("Gagal membaca file: " + (err.message || "unknown"), {
        title: "Gagal Memuat",
        icon: "danger"
      });
    }
  });

  function close() {
    stopStream();
    closePayModal();
  }

  overlay.querySelector("#btnCameraCancel").addEventListener("click", close);
  overlay.querySelector("#btnCameraConfirm").addEventListener("click", async function () {
    if (!capturedBase64) {
      openInfoPopup("Ambil gambar atau pilih file bukti pembayaran terlebih dahulu.", {
        title: "Bukti Belum Ada",
        icon: "warning"
      });
      return;
    }
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
   HELPER: Baca file, crop 4:3, compress WebP
   ============================================ */

function _readFileAsDataURL(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(file);
  });
}

function _loadImageEl(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Gagal memuat gambar")); };
    img.src = src;
  });
}

/**
 * Kompres dataURL → WebP base64.
 * @param {string} dataUrl
 * @param {object} [opts] - { maxDim=1280, quality=0.8 }
 * @returns {Promise<string>} dataURL WebP
 */
async function _compressToWebPBase64(dataUrl, opts) {
  opts = opts || {};
  const maxDim = opts.maxDim || 1280;
  const quality = opts.quality == null ? 0.8 : opts.quality;

  const img = await _loadImageEl(dataUrl);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const m = Math.max(w, h);
  if (m > maxDim) {
    const scale = maxDim / m;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise(function (resolve) {
    c.toBlob(function (b) { resolve(b); }, "image/webp", quality);
  });
  if (!blob) throw new Error("Browser tidak mendukung WebP.");

  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}

/**
 * Popup crop gambar dengan aspect ratio fixed.
 * User bisa drag untuk menggeser, pinch/wheel untuk zoom.
 *
 * @param {string} imageSrc - dataURL atau URL
 * @param {object} opts
 * @param {number} [opts.aspect=4/3] - rasio width/height
 * @param {Function} opts.onConfirm - callback(croppedDataUrl)
 */
function _openCropPopup(imageSrc, opts) {
  opts = opts || {};
  const aspect = opts.aspect || (4 / 3);

  // Hapus popup lama kalau ada
  const existing = document.getElementById("cropPopup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.className = "crop-popup";
  popup.id = "cropPopup";
  popup.innerHTML = `
    <div class="crop-popup__header">
      <h2 class="crop-popup__title">Sesuaikan Gambar</h2>
      <button type="button" class="crop-popup__cancel" id="btnCropCancel">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        Batal
      </button>
    </div>
    <div class="crop-popup__stage" id="cropStage">
      <canvas class="crop-popup__canvas" id="cropCanvas"></canvas>
      <div class="crop-popup__hint">Geser untuk mengatur &middot; Cubit/scroll untuk zoom</div>
    </div>
    <div class="crop-popup__footer">
      <button type="button" class="btn-secondary" id="btnCropReset">
        <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
        Reset
      </button>
      <button type="button" class="btn-primary" id="btnCropOk">
        <i class="fa-solid fa-check" aria-hidden="true"></i>
        OK
      </button>
    </div>
  `;

  document.body.appendChild(popup);
  document.body.classList.add("modal-open");

  const stage = popup.querySelector("#cropStage");
  const canvas = popup.querySelector("#cropCanvas");
  const ctx = canvas.getContext("2d");

  let img = null;
  let stageW = 0, stageH = 0;
  let cropW = 0, cropH = 0;

  // State transform gambar di dalam crop box:
  // offsetX/Y = posisi top-left gambar relatif ke crop box
  // scale = skala gambar terhadap ukuran natural
  let offsetX = 0, offsetY = 0, scale = 1;
  let minScale = 0.1, maxScale = 5;

  let dragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartOffX = 0, dragStartOffY = 0;

  let pinchStartDist = 0;
  let pinchStartScale = 1;

  _loadImageEl(imageSrc).then(function (loaded) {
    img = loaded;
    _resizeStage();
    _resetTransform();
    _draw();
    _bindEvents();
  }).catch(function (err) {
    console.error("[crop] Gagal load:", err);
    openInfoPopup("Gagal memuat gambar: " + (err.message || "unknown"), {
      title: "Gagal Memuat",
      icon: "danger",
      onClose: function () { _closeCropPopup(); }
    });
  });

  function _resizeStage() {
    // Ukuran stage = area antara header & footer
    const rect = stage.getBoundingClientRect();
    stageW = rect.width;
    stageH = rect.height;

    // DPR untuk canvas tajam
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(stageW * dpr);
    canvas.height = Math.floor(stageH * dpr);
    canvas.style.width = stageW + "px";
    canvas.style.height = stageH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Hitung ukuran crop box (dengan margin 16px)
    const margin = 16;
    const availW = stageW - margin * 2;
    const availH = stageH - margin * 2;

    if (availW / availH > aspect) {
      cropH = availH;
      cropW = cropH * aspect;
    } else {
      cropW = availW;
      cropH = cropW / aspect;
    }
  }

  function _resetTransform() {
    if (!img) return;
    // scale awal = cover (isi crop box penuh)
    const scaleX = cropW / img.naturalWidth;
    const scaleY = cropH / img.naturalHeight;
    scale = Math.max(scaleX, scaleY);
    minScale = scale;
    maxScale = scale * 4;

    // center
    offsetX = (cropW - img.naturalWidth * scale) / 2;
    offsetY = (cropH - img.naturalHeight * scale) / 2;
  }

  function _clampTransform() {
    if (!img) return;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    // Pastikan gambar selalu menutup crop box
    if (drawW <= cropW) {
      offsetX = (cropW - drawW) / 2;
    } else {
      if (offsetX > 0) offsetX = 0;
      if (offsetX + drawW < cropW) offsetX = cropW - drawW;
    }
    if (drawH <= cropH) {
      offsetY = (cropH - drawH) / 2;
    } else {
      if (offsetY > 0) offsetY = 0;
      if (offsetY + drawH < cropH) offsetY = cropH - drawH;
    }
  }

  function _draw() {
    if (!img) return;
    _clampTransform();

    // Background hitam penuh
    ctx.clearRect(0, 0, stageW, stageH);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, stageW, stageH);

    // Posisi crop box di stage (centered)
    const boxX = (stageW - cropW) / 2;
    const boxY = (stageH - cropH) / 2;

    // Gambar
    ctx.drawImage(
      img,
      boxX + offsetX,
      boxY + offsetY,
      img.naturalWidth * scale,
      img.naturalHeight * scale
    );

    // Overlay gelap di luar crop box
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    // atas
    ctx.fillRect(0, 0, stageW, boxY);
    // bawah
    ctx.fillRect(0, boxY + cropH, stageW, stageH - (boxY + cropH));
    // kiri
    ctx.fillRect(0, boxY, boxX, cropH);
    // kanan
    ctx.fillRect(boxX + cropW, boxY, stageW - (boxX + cropW), cropH);
    ctx.restore();

    // Garis border crop box
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, cropW, cropH);

    // Grid rule of thirds
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = boxX + (cropW * i) / 3;
      const y = boxY + (cropH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, boxY);
      ctx.lineTo(x, boxY + cropH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(boxX, y);
      ctx.lineTo(boxX + cropW, y);
      ctx.stroke();
    }
  }

  function _bindEvents() {
    // Mouse drag
    canvas.addEventListener("mousedown", function (e) {
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartOffX = offsetX;
      dragStartOffY = offsetY;
    });

    window.addEventListener("mousemove", _onMouseMove);
    window.addEventListener("mouseup", _onMouseUp);

    // Wheel zoom
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      _zoomAt(delta, e.clientX, e.clientY);
    }, { passive: false });

    // Touch
    canvas.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        dragging = true;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        dragStartOffX = offsetX;
        dragStartOffY = offsetY;
      } else if (e.touches.length === 2) {
        dragging = false;
        pinchStartDist = _dist(e.touches[0], e.touches[1]);
        pinchStartScale = scale;
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1 && dragging) {
        e.preventDefault();
        const t = e.touches[0];
        offsetX = dragStartOffX + (t.clientX - dragStartX);
        offsetY = dragStartOffY + (t.clientY - dragStartY);
        _draw();
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const d = _dist(e.touches[0], e.touches[1]);
        if (pinchStartDist > 0) {
          const newScale = pinchStartScale * (d / pinchStartDist);
          const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));
          const mid = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };
          _applyZoom(clampedScale, mid);
        }
      }
    }, { passive: false });

    canvas.addEventListener("touchend", function () {
      dragging = false;
      pinchStartDist = 0;
    });

    // Buttons
    popup.querySelector("#btnCropCancel").addEventListener("click", _closeCropPopup);
    popup.querySelector("#btnCropReset").addEventListener("click", function () {
      _resetTransform();
      _draw();
    });
    popup.querySelector("#btnCropOk").addEventListener("click", _confirmCrop);

    // Resize
    window.addEventListener("resize", _onResize);
  }

  function _onMouseMove(e) {
    if (!dragging) return;
    offsetX = dragStartOffX + (e.clientX - dragStartX);
    offsetY = dragStartOffY + (e.clientY - dragStartY);
    _draw();
  }

  function _onMouseUp() {
    dragging = false;
  }

  function _onResize() {
    _resizeStage();
    _draw();
  }

  function _dist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function _applyZoom(newScale, clientPoint) {
    // Zoom relatif ke titik (clientPoint) di stage
    const rect = canvas.getBoundingClientRect();
    const px = clientPoint.x - rect.left;
    const py = clientPoint.y - rect.top;

    // Posisi crop box di stage
    const boxX = (stageW - cropW) / 2;
    const boxY = (stageH - cropH) / 2;

    // Titik di crop box (koordinat lokal)
    const localX = px - boxX;
    const localY = py - boxY;

    // Posisi relatif terhadap gambar (0..1)
    const imgRelX = (localX - offsetX) / (img.naturalWidth * scale);
    const imgRelY = (localY - offsetY) / (img.naturalHeight * scale);

    // Terapkan scale baru
    scale = Math.max(minScale, Math.min(maxScale, newScale));

    // Hitung offset baru agar titik yang sama tetap di posisi
    offsetX = localX - imgRelX * (img.naturalWidth * scale);
    offsetY = localY - imgRelY * (img.naturalHeight * scale);

    _draw();
  }

  function _zoomAt(factor, clientX, clientY) {
    _applyZoom(scale * factor, { x: clientX, y: clientY });
  }

  function _confirmCrop() {
    if (!img) return;

    // Buat canvas output ukuran asli crop
    // Ukuran gambar di crop box (koordinat lokal): 
    // crop box = cropW x cropH (display pixels)
    // Rasio ke gambar natural: 1 / scale
    // Source di gambar natural:
    const sx = (-offsetX) / scale;
    const sy = (-offsetY) / scale;
    const sw = cropW / scale;
    const sh = cropH / scale;

    const outW = Math.round(sw);
    const outH = Math.round(sh);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d");
    outCtx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    const dataUrl = outCanvas.toDataURL("image/jpeg", 0.92);

    // Tutup popup dulu
    _closeCropPopup();

    // Panggil callback
    if (typeof opts.onConfirm === "function") {
      try { opts.onConfirm(dataUrl); } catch (e) { console.warn("[crop] onConfirm error:", e); }
    }
  }

  function _closeCropPopup() {
    window.removeEventListener("mousemove", _onMouseMove);
    window.removeEventListener("mouseup", _onMouseUp);
    window.removeEventListener("resize", _onResize);
    popup.remove();
    // Hati-hati: jangan hapus modal-open kalau ada pay-modal aktif di belakang
    if (!document.getElementById("payModal")) {
      document.body.classList.remove("modal-open");
    }
  }

  // Expose close supaya bisa dipanggil dari luar (mis. error handler)
  window._closeCropPopup = _closeCropPopup;
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