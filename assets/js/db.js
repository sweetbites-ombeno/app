const db = new Dexie('posDB');

db.version(1).stores({
    user: 'id, name, username, password, status, created_at, updated_at, deleted_at',
    customer: 'id, name, no_telp, created_at, updated_at, deleted_at',
    kategori: 'id, name, created_at, updated_at, deleted_at',
    produk: 'id, name, kategori, harga_jual, image_base64, stok, id_user, created_at, updated_at, deleted_at',
    pembelian: 'id, deskripsi, total, tempat, tanggal_beli, method_beli, img_beli_base64, id_user, created_at, updated_at, deleted_at',
    pembelian_detail: 'id, pembelian, name_item, qty, satuan, harga_satuan, total, order, created_at, updated_at, deleted_at',
    penjualan: 'id, kode, total_bayar, uang_diterima, uang_kembalian, id_customer, name_customer, telp_customer, tanggal_jual, tanggal_pesan, status, alasan, method_bayar, img_bayar_base64, id_user, created_at, updated_at, deleted_at',
    penjualan_detail: 'id, penjualan, id_product, name_product, id_kategori, name_kategori, qty, harga_satuan, total, order, created_at, updated_at, deleted_at',
    backup_db: 'id, tanggal, date_now, status, created_at, updated_at, deleted_at',
});

// penjelasan
// status penjualan = (0 : menuggu pembayaran, 1 : lunas, 2:  simpan pesanan, 3:refund)
// untuk id_customer, name_customer, telp_customer penjualan default cari dari customer yang namanya = 'Umum'
// kode penjualan diisi dengan format S-username-tanggaljammenitdetik contoh S-admin-20261124191230
// method_bayar = 'tunai', 'qris', 'transfer'

// nanti buat skenario untuk penjualan online yang dimana nanti kode penjualan di gabungkan, nanti apabila ada kode yang sama jadi S-username-tanggaljammenitdetik-1 dan S-username-tanggaljammenitdetik-2
// buat admin user untuk verifikasi user boleh akses atau tidak
// saat register username tidak boleh sama
// yang sinkron dari penjualan adalah yang status nya tidak sama dengan 0

// hook creating untuk SEMUA tabel (termasuk backup_db)
['user', 'customer', 'kategori', 'produk',
  'pembelian', 'pembelian_detail',
  'penjualan', 'penjualan_detail',
  'backup_db'].forEach(function (t) {
    db[t].hook('creating', function (primKey, obj) {
      if (!obj.id) obj.id = crypto.randomUUID();
      if (!obj.created_at) obj.created_at = new Date().toISOString();
    });
  });


/* ============================================
 BACKUP HARIAN — helper
 ============================================ */
const BACKUP_ROW_ID = 'main';   // singleton row id

/** Tanggal hari ini (lokal) dalam format YYYY-MM-DD */
function _todayYMD() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Pastikan ada 1 record backup_db.
 * - Kalau belum ada → buat dengan tanggal hari ini, status '0'
 * - Kalau tanggal record != hari ini → reset status='0', tanggal=hari ini
 * @returns {Promise<object>} record backup_db terbaru
 */
async function ensureBackupRow() {
  const today = _todayYMD();
  let row = await db.backup_db.get(BACKUP_ROW_ID);

  if (!row) {
    // belum ada sama sekali
    await db.backup_db.add({
      id: BACKUP_ROW_ID,
      tanggal: today,
      date_now: '',
      status: '0',
    });
    row = await db.backup_db.get(BACKUP_ROW_ID);
    return row;
  }

  // sudah ada — cek apakah beda hari
  if (row.tanggal !== today) {
    await db.backup_db.update(BACKUP_ROW_ID, {
      tanggal: today,
      date_now: '',       // reset: belum backup hari ini
      status: '0',
      updated_at: new Date().toISOString(),
    });
    row = await db.backup_db.get(BACKUP_ROW_ID);
  }

  return row;
}

/**
 * Cek status backup hari ini.
 * Kalau belum, minta konfirmasi user lalu jalankan backup.
 * Aman dipanggil di halaman apapun (debounced via flag).
 */
let _backupCheckRunning = false;

function _showBackupModal() {
  return new Promise(function (resolve) {
    const modal = document.getElementById('backupModal');
    const btn = document.getElementById('btnBackupNow');
    if (!modal || !btn) {
      if (typeof openInfoPopup === "function") {
        openInfoPopup('Belum ada backup hari ini.', {
          title: "Backup", icon: "info"
        });
      }
      resolve();
      return;
    }

    const originalHTML = btn.innerHTML;
    modal.hidden = false;

    function onOk() {
      btn.removeEventListener('click', onOk);
      // loading state
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
      modal.hidden = true;

      // kembalikan tombol setelah beberapa saat (jaga-jaga error)
      setTimeout(function () {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }, 1000);

      resolve();
    }
    btn.addEventListener('click', onOk);
  });
}
let _dbDeleting = false;
async function cekBackupHarian() {
    if (_dbDeleting) return;
    if (_backupCheckRunning) return;
    _backupCheckRunning = true;

    try {
        const row = await ensureBackupRow();
        if (row.status === '1') return;

        // tampilkan modal, tunggu user klik tombol (selalu 1 tombol)
        await _showBackupModal();

        if (typeof backupDatabase !== 'function') {
          if (typeof openInfoPopup === "function") {
            openInfoPopup('Fungsi backup tidak tersedia.', {
              title: "Tidak Tersedia", icon: "warning"
            });
          }
          return;
        }
        await backupDatabase();
        if (!_dbDeleting) {
          await db.backup_db.update(BACKUP_ROW_ID, {
              status: '1',
              date_now: new Date().toISOString(),
              updated_at: new Date().toISOString(),
          });
        }
    } catch (err) {
        console.error('[backup-harian] Gagal:', err);
    } finally {
        _backupCheckRunning = false;
    }
}

/* ============================================
   HASH PASSWORD (PBKDF2) — dipakai login & reset
   ============================================ */
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),
    'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return bytesToHex(salt) + ':' + bytesToHex(new Uint8Array(bits));
}
async function verifikasiPassword(password, tersimpan) {
  const saltHex = tersimpan.split(':')[0];
  return (await hashPassword(password, saltHex)) === tersimpan;
}

/* ============================================
   IMAGE UTILS (dipakai produk-form & order)
   ============================================ */

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
    _safeInfoPopup("Gagal memuat gambar: " + (err.message || "unknown"), {
      title: "Gagal Memuat",
      icon: "danger",
      onClose: function () { _closeCropPopup(); }
    });
  });

  function _resizeStage() {
    const rect = stage.getBoundingClientRect();
    stageW = rect.width;
    stageH = rect.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(stageW * dpr);
    canvas.height = Math.floor(stageH * dpr);
    canvas.style.width = stageW + "px";
    canvas.style.height = stageH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
    const scaleX = cropW / img.naturalWidth;
    const scaleY = cropH / img.naturalHeight;
    scale = Math.max(scaleX, scaleY);
    minScale = scale;
    maxScale = scale * 4;

    offsetX = (cropW - img.naturalWidth * scale) / 2;
    offsetY = (cropH - img.naturalHeight * scale) / 2;
  }

  function _clampTransform() {
    if (!img) return;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

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

    ctx.clearRect(0, 0, stageW, stageH);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, stageW, stageH);

    const boxX = (stageW - cropW) / 2;
    const boxY = (stageH - cropH) / 2;

    ctx.drawImage(
      img,
      boxX + offsetX,
      boxY + offsetY,
      img.naturalWidth * scale,
      img.naturalHeight * scale
    );

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, stageW, boxY);
    ctx.fillRect(0, boxY + cropH, stageW, stageH - (boxY + cropH));
    ctx.fillRect(0, boxY, boxX, cropH);
    ctx.fillRect(boxX + cropW, boxY, stageW - (boxX + cropW), cropH);
    ctx.restore();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, cropW, cropH);

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
    canvas.addEventListener("mousedown", function (e) {
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartOffX = offsetX;
      dragStartOffY = offsetY;
    });

    window.addEventListener("mousemove", _onMouseMove);
    window.addEventListener("mouseup", _onMouseUp);

    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      _zoomAt(delta, e.clientX, e.clientY);
    }, { passive: false });

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

    popup.querySelector("#btnCropCancel").addEventListener("click", _closeCropPopup);
    popup.querySelector("#btnCropReset").addEventListener("click", function () {
      _resetTransform();
      _draw();
    });
    popup.querySelector("#btnCropOk").addEventListener("click", _confirmCrop);

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
    const rect = canvas.getBoundingClientRect();
    const px = clientPoint.x - rect.left;
    const py = clientPoint.y - rect.top;

    const boxX = (stageW - cropW) / 2;
    const boxY = (stageH - cropH) / 2;

    const localX = px - boxX;
    const localY = py - boxY;

    const imgRelX = (localX - offsetX) / (img.naturalWidth * scale);
    const imgRelY = (localY - offsetY) / (img.naturalHeight * scale);

    scale = Math.max(minScale, Math.min(maxScale, newScale));

    offsetX = localX - imgRelX * (img.naturalWidth * scale);
    offsetY = localY - imgRelY * (img.naturalHeight * scale);

    _draw();
  }

  function _zoomAt(factor, clientX, clientY) {
    _applyZoom(scale * factor, { x: clientX, y: clientY });
  }

  function _confirmCrop() {
    if (!img) return;

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

    _closeCropPopup();

    if (typeof opts.onConfirm === "function") {
      try { opts.onConfirm(dataUrl); } catch (e) { console.warn("[crop] onConfirm error:", e); }
    }
  }

  function _closeCropPopup() {
    window.removeEventListener("mousemove", _onMouseMove);
    window.removeEventListener("mouseup", _onMouseUp);
    window.removeEventListener("resize", _onResize);
    popup.remove();
    if (!document.getElementById("payModal")) {
      document.body.classList.remove("modal-open");
    }
  }

  window._closeCropPopup = _closeCropPopup;
}

function _safeInfoPopup(text, opts) {
  if (typeof openInfoPopup === "function") openInfoPopup(text, opts);
  else alert(text + (opts && opts.title ? "\n\n" + opts.title : ""));
}
