/* ============================================
   HALAMAN FORM PEMBELIAN (Tambah / Edit)
   + Detail Pembelian (item beli) via popup
   Alur gambar: pilih → crop 4:3 vertikal → compress → WebP → base64
   ============================================ */

const PEMBELIAN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PEMBELIAN_IMAGE_MAX_DIM = 1200;
const PEMBELIAN_IMAGE_TARGET_BYTES = 100 * 1024;
const PEMBELIAN_CROP_ASPECT = 3 / 4;

let _pendingPembelianImageBase64 = "";
let _pembelianItems = [];       // array of { name_item, qty, satuan, harga_satuan, total, order }
let _pembelianExpandedItem = {}; // { index: true }

/* ---------- Helper ---------- */
function _pembelianFormatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  return (bytes / 1024).toFixed(1) + " KB";
}

function _pembelianFormatRibuan(value) {
  const num = String(value == null ? "" : value).replace(/\D/g, "");
  if (!num) return "";
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function _pembelianParseRibuan(str) {
  const num = String(str == null ? "" : str).replace(/\D/g, "");
  return num === "" ? NaN : Number(num);
}

function _pembelianReadFileAsDataURL(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(file);
  });
}

function _pembelianLoadImage(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Gagal memuat gambar")); };
    img.src = src;
  });
}

/**
 * Kompres dataURL → WebP base64 dengan target ukuran maksimal.
 */
async function _pembelianCompressToWebPWithLimit(dataUrl, maxDim, targetBytes) {
  const img = await _pembelianLoadImage(dataUrl);

  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const m = Math.max(w, h);
  if (m > maxDim) {
    const scale = maxDim / m;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];
  let lastBlob = null;
  let currentW = w;
  let currentH = h;

  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = currentW;
    canvas.height = currentH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, currentW, currentH);

    let blob = null;
    for (let i = 0; i < qualities.length; i++) {
      const q = qualities[i];
      const b = await new Promise(function (resolve) {
        canvas.toBlob(function (x) { resolve(x); }, "image/webp", q);
      });
      if (!b) continue;
      blob = b;
      lastBlob = b;
      if (b.size <= targetBytes) break;
    }

    if (blob && blob.size <= targetBytes) break;

    currentW = Math.round(currentW * 0.8);
    currentH = Math.round(currentH * 0.8);

    if (currentW < 100 || currentH < 100) break;
  }

  if (!lastBlob) throw new Error("Browser tidak mendukung konversi WebP.");

  const base64 = await new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(lastBlob);
  });

  return { base64: base64, size: lastBlob.size };
}

/* ---------- Dropify UI ---------- */
function _pembelianShowDropifyPreview(base64) {
  const placeholder = document.getElementById("dropifyPembelianPlaceholder");
  const preview = document.getElementById("dropifyPembelianPreview");
  const removeBtn = document.getElementById("dropifyPembelianRemove");
  if (!preview) return;
  preview.src = base64;
  preview.hidden = false;
  if (placeholder) placeholder.style.display = "none";
  if (removeBtn) removeBtn.hidden = false;
}

function _pembelianResetDropify() {
  const placeholder = document.getElementById("dropifyPembelianPlaceholder");
  const preview = document.getElementById("dropifyPembelianPreview");
  const removeBtn = document.getElementById("dropifyPembelianRemove");
  const fileInput = document.getElementById("pembelianImage");
  _pendingPembelianImageBase64 = "";
  if (preview) { preview.src = ""; preview.hidden = true; }
  if (placeholder) placeholder.style.display = "";
  if (removeBtn) removeBtn.hidden = true;
  if (fileInput) fileInput.value = "";
  const hint = document.getElementById("imageHintPembelian");
  if (hint) hint.textContent = "Gambar akan otomatis dikonversi ke WebP.";
}

async function _pembelianHandleImageFile(file) {
  const hint = document.getElementById("imageHintPembelian");
  if (!file) return;

  const allowed = ["image/png", "image/jpeg", "image/jpg"];
  if (allowed.indexOf(file.type) === -1) {
    alert("Format harus PNG, JPG, JPEG, atau WebP.");
    return;
  }
  if (file.size > PEMBELIAN_IMAGE_MAX_BYTES) {
    alert(
      "Ukuran file maksimal " + _pembelianFormatFileSize(PEMBELIAN_IMAGE_MAX_BYTES) +
      ". File Anda: " + _pembelianFormatFileSize(file.size)
    );
    return;
  }

  if (hint) hint.textContent = "Membuka editor crop...";

  try {
    const dataUrl = await _pembelianReadFileAsDataURL(file);

    if (typeof _openCropPopup !== "function") {
      throw new Error("Fungsi crop tidak tersedia. Pastikan order.js dimuat.");
    }

    _openCropPopup(dataUrl, {
      aspect: PEMBELIAN_CROP_ASPECT,
      onConfirm: async function (croppedDataUrl) {
        if (hint) hint.textContent = "Mengompres & konversi ke WebP...";
        try {
          const result = await _pembelianCompressToWebPWithLimit(
            croppedDataUrl,
            PEMBELIAN_IMAGE_MAX_DIM,
            PEMBELIAN_IMAGE_TARGET_BYTES
          );
          _pendingPembelianImageBase64 = result.base64;
          _pembelianShowDropifyPreview(result.base64);
          if (hint) hint.textContent =
            "Siap disimpan (WebP " + _pembelianFormatFileSize(result.size) + ").";
        } catch (err) {
          console.error("[pembelian] Gagal kompres:", err);
          alert("Gagal memproses gambar: " + (err.message || "unknown"));
          if (hint) hint.textContent = "Gambar akan otomatis dikonversi ke WebP.";
        }
      }
    });
  } catch (err) {
    console.error("[pembelian] Gagal baca file:", err);
    alert("Gagal membaca file: " + (err.message || "unknown"));
    if (hint) hint.textContent = "Gambar akan otomatis dikonversi ke WebP.";
  }
}

/* ============================================
   RENDER DETAIL PEMBELIAN
   ============================================ */
function _renderPembelianItems() {
  const listEl = document.getElementById("pembelianDetailList");
  const emptyEl = document.getElementById("pembelianDetailEmpty");
  const summaryEl = document.getElementById("pembelianSummary");
  if (!listEl) return;

  if (_pembelianItems.length === 0) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "flex";
    if (summaryEl) summaryEl.hidden = true;
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (summaryEl) summaryEl.hidden = false;

  listEl.innerHTML = _pembelianItems.map(function (it, idx) {
    const expanded = !!_pembelianExpandedItem[idx];
    const qty = Number(it.qty) || 0;
    const hargaSat = Number(it.harga_satuan) || 0;
    const total = Number(it.total) || 0;
    return `
      <div class="pembelian-item-card${expanded ? " is-open" : ""}" data-index="${idx}">
        <button type="button" class="pembelian-item-card__head"
                data-action="pembelian-item-toggle" data-index="${idx}">
          <div class="pembelian-item-card__info">
            <span class="pembelian-item-card__name">${escapeHTML(it.name_item || "")}</span>
            <span class="pembelian-item-card__meta">
              ${qty} ${escapeHTML(it.satuan || "pcs")} x Rp ${hargaSat.toLocaleString("id-ID")}
            </span>
          </div>
          <span class="pembelian-item-card__total">Rp ${total.toLocaleString("id-ID")}</span>
          <i class="fa-solid fa-chevron-down pembelian-item-card__chevron" aria-hidden="true"></i>
        </button>
        <div class="pembelian-item-card__body" ${expanded ? "" : "hidden"}>
          <div class="pembelian-item-card__actions">
            <button type="button" class="btn-secondary"
                    data-action="pembelian-item-edit" data-index="${idx}">
              <i class="fa-solid fa-pen" aria-hidden="true"></i>
              Edit
            </button>
            <button type="button" class="btn-danger"
                    data-action="pembelian-item-delete" data-index="${idx}">
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
              Hapus
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Update summary
  const totalItems = _pembelianItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const totalHarga = _pembelianItems.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const totalItemsEl = document.getElementById("pembelianTotalItems");
  const totalHargaEl = document.getElementById("pembelianTotalHarga");
  if (totalItemsEl) totalItemsEl.textContent = `${totalItems} item`;
  if (totalHargaEl) totalHargaEl.textContent = "Rp " + totalHarga.toLocaleString("id-ID");
}

/* ============================================
   POPUP ITEM BELI (TAMBAH / EDIT)
   ============================================ */
function _openItemBeliModal(mode, index) {
  const modal = document.getElementById("itemBeliModal");
  if (!modal) return;

  const isEdit = mode === "edit" && typeof index === "number";
  const titleEl = document.getElementById("itemBeliModalTitle");
  const modeEl = document.getElementById("itemBeliMode");
  const indexEl = document.getElementById("itemBeliIndex");
  const nameEl = document.getElementById("itemBeliName");
  const qtyEl = document.getElementById("itemBeliQty");
  const satuanEl = document.getElementById("itemBeliSatuan");
  const hargaEl = document.getElementById("itemBeliHargaSatuan");
  const totalEl = document.getElementById("itemBeliTotal");
  const errorEl = document.getElementById("itemBeliError");

  if (titleEl) titleEl.textContent = isEdit ? "Edit Item Beli" : "Tambah Item Beli";
  if (modeEl) modeEl.value = isEdit ? "edit" : "add";
  if (indexEl) indexEl.value = isEdit ? String(index) : "";
  if (errorEl) errorEl.textContent = "";

  if (isEdit) {
    const it = _pembelianItems[index] || {};
    if (nameEl) nameEl.value = it.name_item || "";
    if (qtyEl) qtyEl.value = it.qty != null ? String(it.qty) : "";
    if (satuanEl) satuanEl.value = it.satuan || "";
    if (hargaEl) hargaEl.value = it.harga_satuan != null ? _pembelianFormatRibuan(it.harga_satuan) : "";
    if (totalEl) totalEl.value = it.total != null ? _pembelianFormatRibuan(it.total) : "";
  } else {
    if (nameEl) nameEl.value = "";
    if (qtyEl) qtyEl.value = "";
    if (satuanEl) satuanEl.value = "";
    if (hargaEl) hargaEl.value = "";
    if (totalEl) totalEl.value = "";
  }

  modal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(function () { if (nameEl) nameEl.focus(); }, 100);
}

function _closeItemBeliModal() {
  const modal = document.getElementById("itemBeliModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("modal-open");
}

/**
 * Hitung total dari harga satuan × qty.
 */
function _itemBeliRecalcTotal() {
  const qtyEl = document.getElementById("itemBeliQty");
  const hargaEl = document.getElementById("itemBeliHargaSatuan");
  const totalEl = document.getElementById("itemBeliTotal");
  if (!qtyEl || !hargaEl || !totalEl) return;

  const qty = _pembelianParseRibuan(qtyEl.value);
  const harga = _pembelianParseRibuan(hargaEl.value);
  if (!isNaN(qty) && !isNaN(harga)) {
    const total = qty * harga;
    totalEl.value = _pembelianFormatRibuan(total);
  }
}

/**
 * Hitung harga satuan dari total ÷ qty.
 */
function _itemBeliRecalcHarga() {
  const qtyEl = document.getElementById("itemBeliQty");
  const hargaEl = document.getElementById("itemBeliHargaSatuan");
  const totalEl = document.getElementById("itemBeliTotal");
  if (!qtyEl || !hargaEl || !totalEl) return;

  const qty = _pembelianParseRibuan(qtyEl.value);
  const total = _pembelianParseRibuan(totalEl.value);
  if (!isNaN(qty) && qty > 0 && !isNaN(total)) {
    const harga = Math.round(total / qty);
    hargaEl.value = _pembelianFormatRibuan(harga);
  }
}

/* ============================================
   INIT FORM
   ============================================ */
async function initDataPembelianForm() {
  const form = document.getElementById("pembelianForm");
  const inputDeskripsi = document.getElementById("pembelianDeskripsi");
  const inputTempat = document.getElementById("pembelianTempat");
  const inputTanggal = document.getElementById("pembelianTanggalBeli");
  const inputMetode = document.getElementById("pembelianMetodeBeli");
  const inputMode = document.getElementById("pembelianMode");
  const inputId = document.getElementById("pembelianId");
  const titleEl = document.getElementById("formTitlePembelian");
  const subtitleEl = document.getElementById("formSubtitlePembelian");
  if (!form || !inputDeskripsi) return;

  _pendingPembelianImageBase64 = "";
  _pembelianItems = [];
  _pembelianExpandedItem = {};
  _pembelianResetDropify();

  // Default tanggal = hari ini
  const today = new Date();
  const pad = function (n) { return String(n).padStart(2, "0"); };
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (inputTanggal) inputTanggal.value = todayStr;

  /* ----- Mode edit? ----- */
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "edit" ? "edit" : "add";
  const editId = params.get("id") || "";

  if (inputMode) inputMode.value = mode;
  if (inputId) inputId.value = editId;

  if (mode === "edit" && editId) {
    try {
      const data = await db.pembelian.get(editId);
      if (data && !data.deleted_at) {
        if (titleEl) titleEl.textContent = "Edit Pembelian";
        if (subtitleEl) subtitleEl.textContent = "Ubah data pembelian";
        if (inputDeskripsi) inputDeskripsi.value = data.deskripsi || "";
        if (inputTempat) inputTempat.value = data.tempat || "";
        if (inputTanggal) inputTanggal.value = (data.tanggal_beli || "").slice(0, 10);
        if (inputMetode) inputMetode.value = data.method_beli || "tunai";

        if (data.img_beli_base64) {
          _pendingPembelianImageBase64 = data.img_beli_base64;
          _pembelianShowDropifyPreview(data.img_beli_base64);
          const hint = document.getElementById("imageHintPembelian");
          if (hint) hint.textContent = "Gambar tersimpan. Klik hapus untuk mengganti.";
        }

        // Load detail
        const details = await db.pembelian_detail
          .where("pembelian").equals(editId)
          .filter(d => !d.deleted_at)
          .toArray();
        details.sort((a, b) => (a.order || 0) - (b.order || 0));
        _pembelianItems = details.map(function (d) {
          return {
            id: d.id,
            name_item: d.name_item || "",
            qty: Number(d.qty) || 0,
            satuan: d.satuan || "",
            harga_satuan: Number(d.harga_satuan) || 0,
            total: Number(d.total) || 0,
            order: Number(d.order) || 0
          };
        });
      } else {
        if (titleEl) titleEl.textContent = "Tambah Pembelian";
        if (subtitleEl) subtitleEl.textContent = "Isi data pembelian baru";
        if (inputMode) inputMode.value = "add";
        if (inputId) inputId.value = "";
      }
    } catch (err) {
      console.error("[pembelian-form] Gagal load:", err);
    }
  } else {
    if (titleEl) titleEl.textContent = "Tambah Pembelian";
    if (subtitleEl) subtitleEl.textContent = "Isi data pembelian baru";
  }

  _renderPembelianItems();

  /* ----- Dropify events ----- */
  const dropify = document.getElementById("dropifyPembelian");
  const fileInput = document.getElementById("pembelianImage");
  const removeBtn = document.getElementById("dropifyPembelianRemove");

  if (dropify && fileInput) {
    dropify.addEventListener("click", function (e) {
      if (e.target.closest("#dropifyPembelianRemove")) return;
      fileInput.click();
    });
    dropify.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      dropify.addEventListener(ev, function (e) {
        e.preventDefault();
        dropify.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropify.addEventListener(ev, function (e) {
        e.preventDefault();
        dropify.classList.remove("is-dragover");
      });
    });
    dropify.addEventListener("drop", function (e) {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) _pembelianHandleImageFile(file);
    });
    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (file) _pembelianHandleImageFile(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      _pembelianResetDropify();
    });
  }

  /* ----- Format ribuan input item beli ----- */
  const itemQty = document.getElementById("itemBeliQty");
  const itemHarga = document.getElementById("itemBeliHargaSatuan");
  const itemTotal = document.getElementById("itemBeliTotal");

  if (itemQty) {
    itemQty.addEventListener("input", function () {
      const el = itemQty;
      el.value = el.value.replace(/\D/g, "");
      _itemBeliRecalcTotal();
    });
  }

  if (itemHarga) {
    itemHarga.addEventListener("input", function () {
      const el = itemHarga;
      const rawBefore = el.value.slice(0, el.selectionStart);
      const digitsBefore = rawBefore.replace(/\D/g, "").length;
      el.value = _pembelianFormatRibuan(el.value);
      let pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) {
        if (/\d/.test(el.value[pos])) seen++;
        pos++;
      }
      el.setSelectionRange(pos, pos);
      _itemBeliRecalcTotal();
    });
  }

  if (itemTotal) {
    itemTotal.addEventListener("input", function () {
      const el = itemTotal;
      const rawBefore = el.value.slice(0, el.selectionStart);
      const digitsBefore = rawBefore.replace(/\D/g, "").length;
      el.value = _pembelianFormatRibuan(el.value);
      let pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) {
        if (/\d/.test(el.value[pos])) seen++;
        pos++;
      }
      el.setSelectionRange(pos, pos);
      _itemBeliRecalcHarga();
    });
  }

  /* ----- Tombol tambah item ----- */
  const btnTambahItem = document.getElementById("btnTambahItemBeli");
  if (btnTambahItem) {
    btnTambahItem.addEventListener("click", function () {
      _openItemBeliModal("add");
    });
  }

  /* ----- Submit form ----- */
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const deskripsi = inputDeskripsi.value.trim();
    const tempat = inputTempat ? inputTempat.value.trim() : "";
    const tanggalBeli = inputTanggal ? inputTanggal.value : "";
    const metode = inputMetode ? inputMetode.value : "tunai";

    if (!deskripsi) { inputDeskripsi.focus(); return; }
    if (!tanggalBeli) { if (inputTanggal) inputTanggal.focus(); return; }

    if (_pembelianItems.length === 0) {
      openInfoPopup("Tambahkan minimal satu item pembelian.", {
        title: "Item Kosong",
        icon: "warning"
      });
      return;
    }

    const btn = document.getElementById("btnSimpanPembelian");
    if (btn) btn.disabled = true;

    try {
      const now = new Date().toISOString();
      const userId = sessionStorage.getItem("login");
      const total = _pembelianItems.reduce((s, it) => s + (Number(it.total) || 0), 0);

      const payload = {
        deskripsi: deskripsi,
        tempat: tempat,
        total: total,
        tanggal_beli: tanggalBeli,
        method_beli: metode,
        img_beli_base64: _pendingPembelianImageBase64 || "",
        id_user: userId,
        updated_at: now
      };

      let pembelianId = editId;

      if (inputMode.value === "edit" && editId) {
        await db.pembelian.update(editId, payload);

        // HARD DELETE detail lama
        const oldDetails = await db.pembelian_detail
          .where("pembelian").equals(editId)
          .toArray();
        if (oldDetails.length > 0) {
          await db.pembelian_detail.bulkDelete(oldDetails.map(d => d.id));
        }
      } else {
        payload.created_at = now;
        pembelianId = crypto.randomUUID();
        payload.id = pembelianId;
        await db.pembelian.add(payload);
      }

      // Insert detail baru
      for (let i = 0; i < _pembelianItems.length; i++) {
        const it = _pembelianItems[i];
        await db.pembelian_detail.add({
          id: crypto.randomUUID(),
          pembelian: pembelianId,
          name_item: it.name_item,
          qty: Number(it.qty) || 0,
          satuan: it.satuan || "",
          harga_satuan: Number(it.harga_satuan) || 0,
          total: Number(it.total) || 0,
          order: i + 1,
          created_at: now
        });
      }

      navigateTo("data-pembelian");
    } catch (err) {
      console.error("[pembelian-form] Gagal simpan:", err);
      openInfoPopup("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"), {
        title: "Gagal Menyimpan",
        icon: "danger"
      });
      if (btn) btn.disabled = false;
    }
  });

  /* ----- Event delegation: toggle, edit, delete item + popup ----- */
  if (!window._pembelianFormBound) {
    window._pembelianFormBound = true;

    document.addEventListener("click", async function (e) {
      if (!document.querySelector(".page--pembelian-form")) return;

      // Toggle expand item card
      const toggle = e.target.closest("[data-action='pembelian-item-toggle']");
      if (toggle) {
        e.preventDefault();
        const idx = Number(toggle.dataset.index);
        _pembelianExpandedItem[idx] = !_pembelianExpandedItem[idx];
        _renderPembelianItems();
        return;
      }

      // Edit item
      const editBtn = e.target.closest("[data-action='pembelian-item-edit']");
      if (editBtn) {
        e.preventDefault();
        const idx = Number(editBtn.dataset.index);
        _openItemBeliModal("edit", idx);
        return;
      }

      // Delete item (HARD DELETE dari array, belum tersimpan ke DB)
      const delBtn = e.target.closest("[data-action='pembelian-item-delete']");
      if (delBtn) {
        e.preventDefault();
        const idx = Number(delBtn.dataset.index);
        const it = _pembelianItems[idx];
        if (!it) return;
        if (!confirm(`Hapus item "${it.name_item || "ini"}"?`)) return;
        _pembelianItems.splice(idx, 1);
        delete _pembelianExpandedItem[idx];
        _renderPembelianItems();
        return;
      }

      // Popup item: batal
      if (e.target.closest("#btnItemBeliBatal")) {
        e.preventDefault();
        _closeItemBeliModal();
        return;
      }

      // Popup item: klik backdrop
      const modal = document.getElementById("itemBeliModal");
      if (modal && e.target === modal) {
        _closeItemBeliModal();
        return;
      }

      // Popup item: simpan
      if (e.target.closest("#btnItemBeliSimpan")) {
        e.preventDefault();
        const nameEl = document.getElementById("itemBeliName");
        const qtyEl = document.getElementById("itemBeliQty");
        const satuanEl = document.getElementById("itemBeliSatuan");
        const hargaEl = document.getElementById("itemBeliHargaSatuan");
        const totalEl = document.getElementById("itemBeliTotal");
        const errorEl = document.getElementById("itemBeliError");
        const modeEl = document.getElementById("itemBeliMode");
        const indexEl = document.getElementById("itemBeliIndex");

        const name = nameEl ? nameEl.value.trim() : "";
        const qty = _pembelianParseRibuan(qtyEl ? qtyEl.value : "");
        const satuan = satuanEl ? satuanEl.value.trim() : "";
        const harga = _pembelianParseRibuan(hargaEl ? hargaEl.value : "");
        const total = _pembelianParseRibuan(totalEl ? totalEl.value : "");

        if (!name) {
          if (errorEl) errorEl.textContent = "Nama item wajib diisi.";
          return;
        }
        if (isNaN(qty) || qty <= 0) {
          if (errorEl) errorEl.textContent = "Jumlah beli wajib diisi (lebih dari 0).";
          return;
        }
        if (!satuan) {
          if (errorEl) errorEl.textContent = "Satuan wajib diisi.";
          return;
        }
        if (isNaN(harga) || harga < 0) {
          if (errorEl) errorEl.textContent = "Harga satuan wajib diisi.";
          return;
        }
        if (isNaN(total) || total < 0) {
          if (errorEl) errorEl.textContent = "Total wajib diisi.";
          return;
        }

        const item = {
          name_item: name,
          qty: qty,
          satuan: satuan,
          harga_satuan: harga,
          total: total
        };

        if (modeEl && modeEl.value === "edit" && indexEl && indexEl.value !== "") {
          const idx = Number(indexEl.value);
          if (_pembelianItems[idx]) {
            const oldId = _pembelianItems[idx].id;
            item.id = oldId;
            _pembelianItems[idx] = item;
          }
        } else {
          _pembelianItems.push(item);
        }

        _closeItemBeliModal();
        _renderPembelianItems();
        return;
      }
    });
  }

  setTimeout(function () { inputDeskripsi.focus(); }, 100);
}
