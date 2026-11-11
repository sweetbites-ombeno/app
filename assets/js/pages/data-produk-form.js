/* ============================================
   HALAMAN FORM PRODUK (Tambah / Edit)
   Alur gambar: pilih → crop 4:3 vertikal → compress → WebP → base64 → simpan
   + Pemilik (id_user) dari tabel user
   ============================================ */

const PRODUK_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (batas file input)
const PRODUK_IMAGE_MAX_DIM = 1200;               // dimensi maksimal setelah crop
const PRODUK_IMAGE_TARGET_BYTES = 100 * 1024;    // target hasil WebP (100 KB)
const PRODUK_CROP_ASPECT = 3 / 4;                // 4:3 vertikal (lebar:tinggi = 3:4)

let _pendingImageBase64 = "";

/* ---------- Helpers ---------- */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  return (bytes / 1024).toFixed(1) + " KB";
}
function formatRibuan(value) {
  const num = String(value == null ? "" : value).replace(/\D/g, "");
  if (!num) return "";
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseRibuan(str) {
  const num = String(str == null ? "" : str).replace(/\D/g, "");
  return num === "" ? NaN : Number(num);
}
function readFileAsDataURL(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Gagal memuat gambar")); };
    img.src = src;
  });
}

/**
 * Kompres dataURL → WebP base64 dengan target ukuran maksimal.
 * Strategi:
 *   1. Turunkan quality bertahap (0.85 → 0.35)
 *   2. Kalau masih > target, downscale 80% dan ulangi (maks 4x)
 *
 * @param {string} dataUrl
 * @param {number} maxDim       - dimensi maksimal awal (px)
 * @param {number} targetBytes  - target ukuran maksimal (bytes)
 * @returns {Promise<{base64:string, size:number}>}
 */
async function _compressToWebPBase64WithLimit(dataUrl, maxDim, targetBytes) {
  const img = await loadImage(dataUrl);

  // Dimensi awal (resize kalau > maxDim)
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

  // Maks 4 percobaan downscale (0.8^4 ≈ 0.4 → resolusi jadi ~40%)
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = currentW;
    canvas.height = currentH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, currentW, currentH);

    // Coba turunkan quality dulu
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

    // Sudah memenuhi target? → selesai
    if (blob && blob.size <= targetBytes) break;

    // Masih kebesaran → downscale 80% lalu ulangi
    currentW = Math.round(currentW * 0.8);
    currentH = Math.round(currentH * 0.8);

    // Jaga-jaga: kalau sudah terlalu kecil, stop
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
function showDropifyPreview(base64) {
  const placeholder = document.getElementById("dropifyPlaceholder");
  const preview = document.getElementById("dropifyPreview");
  const removeBtn = document.getElementById("dropifyRemove");
  if (!preview) return;
  preview.src = base64;
  preview.hidden = false;
  if (placeholder) placeholder.style.display = "none";
  if (removeBtn) removeBtn.hidden = false;
}
function resetDropify() {
  const placeholder = document.getElementById("dropifyPlaceholder");
  const preview = document.getElementById("dropifyPreview");
  const removeBtn = document.getElementById("dropifyRemove");
  const fileInput = document.getElementById("produkImage");
  _pendingImageBase64 = "";
  if (preview) { preview.src = ""; preview.hidden = true; }
  if (placeholder) placeholder.style.display = "";
  if (removeBtn) removeBtn.hidden = true;
  if (fileInput) fileInput.value = "";
  const hint = document.getElementById("imageHint");
  if (hint) hint.textContent = "Gambar akan di-crop 4:3, lalu dikompres ke WebP.";
}

/**
 * Alur: pilih file → crop 4:3 vertikal → compress WebP → base64.
 * Menggunakan _openCropPopup() & _compressToWebPBase64WithLimit().
 */
async function handleProdukImageFile(file) {
  const hint = document.getElementById("imageHint");
  if (!file) return;

  const allowed = ["image/png", "image/jpeg", "image/jpg"];
  if (allowed.indexOf(file.type) === -1) {
    openInfoPopup("Format harus PNG, JPG, JPEG, atau WebP.", {
      title: "Format Salah", icon: "warning"
    });
    return;
  }
  if (file.size > PRODUK_IMAGE_MAX_BYTES) {
    openInfoPopup(
      "Ukuran file maksimal " + formatFileSize(PRODUK_IMAGE_MAX_BYTES) +
      ". File Anda: " + formatFileSize(file.size),
      { title: "File Terlalu Besar", icon: "warning" }
    );
    return;
  }

  if (hint) hint.textContent = "Membuka editor crop...";

  try {
    const dataUrl = await readFileAsDataURL(file);

    if (typeof _openCropPopup !== "function") {
      throw new Error("Fungsi crop tidak tersedia. Pastikan order.js dimuat.");
    }

    _openCropPopup(dataUrl, {
      aspect: PRODUK_CROP_ASPECT,
      onConfirm: async function (croppedDataUrl) {
        if (hint) hint.textContent = "Mengompres & konversi ke WebP...";
        try {
          const result = await _compressToWebPBase64WithLimit(
            croppedDataUrl,
            PRODUK_IMAGE_MAX_DIM,
            PRODUK_IMAGE_TARGET_BYTES
          );
          _pendingImageBase64 = result.base64;
          showDropifyPreview(result.base64);
          if (hint) hint.textContent =
            "Siap disimpan (WebP " + formatFileSize(result.size) + ").";
        } catch (err) {
          console.error("[produk] Gagal kompres:", err);
          openInfoPopup("Gagal memproses gambar: " + (err.message || "unknown"), {
            title: "Gagal Memproses", icon: "danger"
          });
          if (hint) hint.textContent = "Gambar akan di-crop 4:3, lalu dikompres ke WebP.";
        }
      }
    });
  } catch (err) {
    console.error("[produk] Gagal baca file:", err);
    openInfoPopup("Gagal membaca file: " + (err.message || "unknown"), {
      title: "Gagal Membaca File", icon: "danger"
    });
    if (hint) hint.textContent = "Gambar akan di-crop 4:3, lalu dikompres ke WebP.";
  }
}

/* ---------- Load users ke select pemilik ---------- */
async function loadPemilikOptions(selectedId) {
  const inputPemilik = document.getElementById("produkPemilik");
  if (!inputPemilik) return;

  try {
    const users = await db.user
      .filter(function (u) { return !u.deleted_at; })
      .toArray();
    users.sort(function (a, b) {
      return (a.name || a.username || "").localeCompare(b.name || b.username || "");
    });

    inputPemilik.innerHTML = '<option value="">-- Pilih Pemilik --</option>' +
      users.map(function (u) {
        const label = u.name
          ? escapeHTML(u.name) + " (@" + escapeHTML(u.username) + ")"
          : "@" + escapeHTML(u.username);
        return '<option value="' + escapeHTML(u.id) + '">' + label + '</option>';
      }).join("");

    // Default: user yang sedang login
    const loginId = sessionStorage.getItem("login");
    if (selectedId) {
      inputPemilik.value = selectedId;
    } else if (loginId) {
      inputPemilik.value = loginId;
    }
  } catch (err) {
    console.error("[produk-form] Gagal load user:", err);
  }
}

/* ---------- Init Form ---------- */
async function initDataProdukForm() {
  const form = document.getElementById("produkForm");
  const inputName = document.getElementById("produkName");
  const inputHarga = document.getElementById("produkHarga");
  const inputKategori = document.getElementById("produkKategori");
  const inputPemilik = document.getElementById("produkPemilik");
  const inputMode = document.getElementById("produkMode");
  const inputId = document.getElementById("produkId");
  const titleEl = document.getElementById("formTitle");
  const subtitleEl = document.getElementById("formSubtitle");
  const inputStok = document.getElementById("produkStok");
  if (!form || !inputName) return;

  resetDropify();

  /* ----- Load kategori ----- */
  let kategoriAktif = [];
  try {
    const kats = await db.kategori
      .filter(function (k) { return !k.deleted_at; })
      .toArray();
    kats.sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    kategoriAktif = kats;

    if (inputKategori) {
      inputKategori.innerHTML = '<option value="">-- Pilih kategori --</option>' +
        kats.map(function (k) {
          return '<option value="' + escapeHTML(k.id) + '">' +
            escapeHTML(k.name || "") + '</option>';
        }).join("");
    }
  } catch (err) {
    console.error("[produk-form] Gagal load kategori:", err);
  }

  /* ⬇️ SAFETY NET: kalau user masuk langsung via URL & belum ada kategori ----- */
  const paramsAwal = new URLSearchParams(window.location.search);
  const modeAwal = paramsAwal.get("mode") === "edit" ? "edit" : "add";

  if (modeAwal === "add" && kategoriAktif.length === 0) {
    // Sembunyikan seluruh section form agar tidak sempat terlihat user
    const pageEl = document.querySelector(".page--produk-form");
    if (pageEl) pageEl.style.display = "none";

    const doRedirect = function () { navigateTo("setting"); };

    if (typeof openInfoPopup === "function") {
      openInfoPopup(
        "Belum ada kategori produk. Silakan tambahkan kategori terlebih dahulu sebelum menambah produk.",
        {
          title: "Kategori Kosong",
          icon: "warning",
          button: "Mengerti",
          onClose: doRedirect
        }
      );
    } else {
      doRedirect();  // fallback: langsung redirect tanpa popup
    }
    return; // ⬅️ hentikan init, jangan pasang handler submit
  }

  /* ----- Mode edit? ----- */
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "edit" ? "edit" : "add";
  const editId = params.get("id") || "";

  inputMode.value = mode;
  inputId.value = editId;

  let existingPemilik = "";

  if (mode === "edit" && editId) {
    try {
      const data = await db.produk.get(editId);
      if (data && !data.deleted_at) {
        if (titleEl) titleEl.textContent = "Edit Produk";
        if (subtitleEl) subtitleEl.textContent = "Ubah data produk";
        inputName.value = data.name || "";
        if (inputHarga) {
          inputHarga.value = data.harga_jual != null
            ? formatRibuan(data.harga_jual)
            : "";
        }
        if (inputKategori) inputKategori.value = data.kategori || "";
        existingPemilik = data.id_user || "";

        if (data.image_base64) {
          _pendingImageBase64 = data.image_base64;
          showDropifyPreview(data.image_base64);
          const hint = document.getElementById("imageHint");
          if (hint) hint.textContent = "Gambar tersimpan. Klik hapus untuk mengganti.";
        }
        if (inputStok) {
          inputStok.value = data.stok != null ? formatRibuan(data.stok) : "0";
        }
      } else {
        if (titleEl) titleEl.textContent = "Tambah Produk";
        if (subtitleEl) subtitleEl.textContent = "Isi data produk baru";
        inputMode.value = "add";
        inputId.value = "";
        if (inputStok) inputStok.value = "0";
      }
    } catch (err) {
      console.error("[produk-form] Gagal load:", err);
    }
  } else {
    if (titleEl) titleEl.textContent = "Tambah Produk";
    if (subtitleEl) subtitleEl.textContent = "Isi data produk baru";
  }

  /* ----- Load pemilik (setelah mode diketahui) ----- */
  await loadPemilikOptions(existingPemilik);

  /* ----- Dropify events ----- */
  const dropify = document.getElementById("dropifyImage");
  const fileInput = document.getElementById("produkImage");
  const removeBtn = document.getElementById("dropifyRemove");

  if (dropify && fileInput) {
    dropify.addEventListener("click", function (e) {
      if (e.target.closest("#dropifyRemove")) return;
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
      if (file) handleProdukImageFile(file);
    });
    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";  // ⬅️ reset agar file sama bisa dipilih lagi
      if (file) handleProdukImageFile(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      resetDropify();
      const hint = document.getElementById("imageHint");
      if (hint) hint.textContent = "Gambar akan di-crop 4:3, lalu dikompres ke WebP.";
    });
  }

  setTimeout(function () { inputName.focus(); }, 100);

  /* ----- Format ribuan harga ----- */
  if (inputHarga) {
    inputHarga.addEventListener("input", function () {
      const el = inputHarga;
      const rawBefore = el.value.slice(0, el.selectionStart);
      const digitsBefore = rawBefore.replace(/\D/g, "").length;
      el.value = formatRibuan(el.value);
      let pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) {
        if (/\d/.test(el.value[pos])) seen++;
        pos++;
      }
      el.setSelectionRange(pos, pos);
    });
  }

  // Format ribuan untuk stok (sama seperti harga)
  if (inputStok) {
    inputStok.addEventListener("input", function () {
      const el = inputStok;
      const rawBefore = el.value.slice(0, el.selectionStart);
      const digitsBefore = rawBefore.replace(/\D/g, "").length;
      el.value = formatRibuan(el.value);
      let pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) {
        if (/\d/.test(el.value[pos])) seen++;
        pos++;
      }
      el.setSelectionRange(pos, pos);
    });
  }

  /* ----- Submit ----- */
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const name = inputName.value.trim();
    const kategori = inputKategori ? inputKategori.value : "";
    const pemilik = inputPemilik ? inputPemilik.value : "";
    const hargaNum = inputHarga ? parseRibuan(inputHarga.value) : NaN;

    if (!name) { inputName.focus(); return; }
    if (!kategori) { inputKategori.focus(); return; }
    if (isNaN(hargaNum) || hargaNum < 0) { inputHarga.focus(); return; }

    let stokNum = 0;
    if (inputStok) {
      const raw = inputStok.value.trim();
      if (raw === "") {
        stokNum = 0;   // kosong = 0
      } else {
        stokNum = parseRibuan(raw);
        if (isNaN(stokNum) || stokNum < 0) {
          openInfoPopup("Stok tidak valid.", { title: "Stok Tidak Valid", icon: "warning" });
          inputStok.focus();
          return;
        }
      }
    }

    const btn = document.getElementById("btnSimpanProduk");
    if (btn) btn.disabled = true;

    try {
      const now = new Date().toISOString();
      const payload = {
        name: name,
        kategori: kategori,
        harga_jual: hargaNum,
        stok: stokNum,
        image_base64: _pendingImageBase64 || "",
        id_user: pemilik || (sessionStorage.getItem("login") || ""),
        updated_at: now
      };

      if (inputMode.value === "edit" && inputId.value) {
        await db.produk.update(inputId.value, payload);
      } else {
        payload.created_at = now;
        await db.produk.add(payload);
      }

      navigateTo("data-produk");
    } catch (err) {
      console.error("[produk-form] Gagal simpan:", err);
      openInfoPopup("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"), {
        title: "Gagal Menyimpan", icon: "danger"
      });
      if (btn) btn.disabled = false;
    }
  });
}
