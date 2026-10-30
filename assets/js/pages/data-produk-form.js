/* ============================================
   HALAMAN FORM PRODUK (Tambah / Edit)
   Image: validasi → convert WebP → base64
   ============================================ */

const PRODUK_IMAGE_MAX_BYTES = 100 * 1024;          // 100 KB (file asli)
const PRODUK_IMAGE_MAX_DIM = 1200;                   // resize sisi terpanjang
const PRODUK_IMAGE_WEBP_QUALITY = 0.85;

let _pendingImageBase64 = "";  // hasil konversi, siap disimpan

/* ---------- Helpers ---------- */

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(1) + " KB";
}

/** "15000" → "15.000" */
function formatRibuan(value) {
    const num = String(value == null ? "" : value).replace(/\D/g, "");
    if (!num) return "";
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "15.000" → 15000 (number) */
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
 * Konversi File gambar → base64 WebP.
 * @returns {Promise<{base64:string, size:number}>}
 */
async function convertImageToWebPBase64(file) {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);

    // Resize agar tidak terlalu besar
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const maxDim = Math.max(w, h);
    if (maxDim > PRODUK_IMAGE_MAX_DIM) {
        const scale = PRODUK_IMAGE_MAX_DIM / maxDim;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b); }, "image/webp", PRODUK_IMAGE_WEBP_QUALITY);
    });

    if (!blob) throw new Error("Browser tidak mendukung konversi WebP.");

    const base64 = await new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); }; // data:image/webp;base64,...
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(blob);
    });

    return { base64: base64, size: blob.size };
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
}

/* ---------- Handle file ---------- */

async function handleProdukImageFile(file) {
    const hint = document.getElementById("imageHint");
    if (!file) return;

    // Validasi tipe
    const allowed = ["image/png", "image/jpeg", "image/jpg"];
    if (allowed.indexOf(file.type) === -1) {
        alert("Format harus PNG, JPG, atau JPEG.");
        return;
    }

    // Validasi ukuran file asli
    if (file.size > PRODUK_IMAGE_MAX_BYTES) {
        alert(`Ukuran file maksimal 100 KB. File Anda: ${formatFileSize(file.size)}`);
        return;
    }

    if (hint) hint.textContent = "Mengonversi ke WebP...";

    try {
        const result = await convertImageToWebPBase64(file);
        _pendingImageBase64 = result.base64;
        showDropifyPreview(result.base64);
        if (hint) {
            hint.textContent = `Siap disimpan sebagai WebP (${formatFileSize(result.size)}).`;
        }
    } catch (err) {
        console.error("[produk] Gagal konversi gambar:", err);
        alert("Gagal memproses gambar: " + (err.message || "unknown"));
        if (hint) hint.textContent = "Gambar akan otomatis dikonversi ke WebP.";
    }
}

/* ---------- Init Form ---------- */

async function initDataProdukForm() {
    const form = document.getElementById("produkForm");
    const inputName = document.getElementById("produkName");
    const inputHarga = document.getElementById("produkHarga");
    const inputKategori = document.getElementById("produkKategori");
    const inputMode = document.getElementById("produkMode");
    const inputId = document.getElementById("produkId");
    const titleEl = document.getElementById("formTitle");
    const subtitleEl = document.getElementById("formSubtitle");
    if (!form || !inputName) return;

    resetDropify();

    /* ----- Load kategori ke select ----- */
    try {
        const kats = await db.kategori
            .filter(function (k) { return !k.deleted_at; })
            .toArray();
        kats.sort(function (a, b) {
            return (a.name || "").localeCompare(b.name || "");
        });

        if (inputKategori) {
            inputKategori.innerHTML = '<option value="">-- Pilih kategori --</option>' +
                kats.map(function (k) {
                    return `<option value="${escapeHTML(k.id)}">${escapeHTML(k.name || "")}</option>`;
                }).join("");
        }
    } catch (err) {
        console.error("[produk-form] Gagal load kategori:", err);
    }

    /* ----- Mode edit? ----- */
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "edit" ? "edit" : "add";
    const editId = params.get("id") || "";

    inputMode.value = mode;
    inputId.value = editId;

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

                if (data.image_base64) {
                    _pendingImageBase64 = data.image_base64;
                    showDropifyPreview(data.image_base64);
                    const hint = document.getElementById("imageHint");
                    if (hint) hint.textContent = "Gambar tersimpan. Klik hapus untuk mengganti.";
                }
            } else {
                if (titleEl) titleEl.textContent = "Tambah Produk";
                if (subtitleEl) subtitleEl.textContent = "Isi data produk baru";
                inputMode.value = "add";
                inputId.value = "";
            }
        } catch (err) {
            console.error("[produk-form] Gagal load:", err);
        }
    } else {
        if (titleEl) titleEl.textContent = "Tambah Produk";
        if (subtitleEl) subtitleEl.textContent = "Isi data produk baru";
    }

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

        // Drag & drop
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
            if (file) handleProdukImageFile(file);
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            resetDropify();
            const hint = document.getElementById("imageHint");
            if (hint) hint.textContent = "Gambar akan otomatis dikonversi ke WebP.";
        });
    }

    setTimeout(function () { inputName.focus(); }, 100);

    /* ----- Format ribuan pada input harga ----- */
    if (inputHarga) {
        inputHarga.addEventListener("input", function () {
            // Simpan posisi kursor berdasarkan jumlah digit sebelum kursor
            const el = inputHarga;
            const rawBefore = el.value.slice(0, el.selectionStart);
            const digitsBefore = rawBefore.replace(/\D/g, "").length;

            // Format ulang
            el.value = formatRibuan(el.value);

            // Kembalikan posisi kursor setelah digit ke-N
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
        const hargaNum = inputHarga ? parseRibuan(inputHarga.value) : NaN;

        if (!name) { inputName.focus(); return; }
        if (!kategori) { inputKategori.focus(); return; }
        if (isNaN(hargaNum) || hargaNum < 0) {
            inputHarga.focus();
            return;
        }

        const btn = document.getElementById("btnSimpanProduk");
        if (btn) btn.disabled = true;

        try {
            const now = new Date().toISOString();
            const payload = {
                name: name,
                kategori: kategori,
                harga_jual: hargaNum,   // tetap number, tersimpan 15000
                image_base64: _pendingImageBase64 || "",
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
            alert("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"));
            if (btn) btn.disabled = false;
        }
    });
}