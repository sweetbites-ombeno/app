/* ============================================
   HALAMAN DETAIL PEMBELIAN
   URL: app.html?page=data-pembelian-detail&id=<pembelianId>
   ============================================ */

let _pembelianDetailCache = null;

/* ---------- Helper tanggal ---------- */
function _pembelianDetailPad2(n) { return String(n).padStart(2, "0"); }

function _pembelianDetailFormatTanggalRingkas(ymd) {
  if (!ymd) return "-";
  const parts = String(ymd).split("-");
  if (parts.length !== 3) return "-";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

function _pembelianDetailMethodLabel(method) {
  if (method === "qris") return "Qris";
  if (method === "transfer") return "Transfer";
  if (method === "e-wallet") return "E-Wallet";
  return "Tunai";
}

/* ---------- Load data ---------- */
async function _loadPembelianDetail(id) {
  if (!id) return null;

  const userId = sessionStorage.getItem("login");
  if (!userId) return null;

  const p = await db.pembelian.get(id);
  if (!p || p.deleted_at) return null;
  if (p.id_user !== userId) return null;

  // Load detail items
  const details = await db.pembelian_detail
    .where("pembelian").equals(id)
    .filter(d => !d.deleted_at)
    .toArray();
  details.sort((a, b) => (a.order || 0) - (b.order || 0));
  p._details = details;
  p._totalItems = details.reduce((s, d) => s + (Number(d.qty) || 0), 0);

  // Load user (pemilik)
  try {
    const user = await db.user.get(p.id_user);
    p._user = user && !user.deleted_at ? user : null;
  } catch (e) {
    p._user = null;
  }

  return p;
}

/* ---------- Render ---------- */
function _renderPembelianDetail(p) {
  if (!p) {
    const page = document.querySelector(".page--pembelian-detail");
    if (page) {
      page.innerHTML = `
        <div class="page__placeholder">
          <i class="fa-solid fa-triangle-exclamation page__placeholder-icon"></i>
          <h2 class="page__placeholder-title">Pembelian tidak ditemukan</h2>
          <p class="page__placeholder-text">Data mungkin sudah dihapus atau bukan milik akun ini.</p>
        </div>`;
    }
    return;
  }

  // Subtitle header = deskripsi singkat
  const subtitleEl = document.getElementById("pembelianDetailSubtitle");
  if (subtitleEl) subtitleEl.textContent = p.deskripsi || "-";

  // Card status lunas
  const tanggalEl = document.getElementById("pembelianDetailTanggal");
  if (tanggalEl) tanggalEl.textContent = _pembelianDetailFormatTanggalRingkas(
    (p.tanggal_beli || "").slice(0, 10)
  );

  const totalEl = document.getElementById("pembelianDetailTotal");
  if (totalEl) totalEl.textContent = "Rp " + Number(p.total || 0).toLocaleString("id-ID");

  // Info pembelian
  const infoDeskripsi = document.getElementById("pembelianInfoDeskripsi");
  if (infoDeskripsi) infoDeskripsi.textContent = p.deskripsi || "-";

  const infoTempat = document.getElementById("pembelianInfoTempat");
  if (infoTempat) infoTempat.textContent = p.tempat || "-";

  const infoTanggal = document.getElementById("pembelianInfoTanggal");
  if (infoTanggal) infoTanggal.textContent = _pembelianDetailFormatTanggalRingkas(
    (p.tanggal_beli || "").slice(0, 10)
  );

  const infoMetode = document.getElementById("pembelianInfoMetode");
  if (infoMetode) infoMetode.textContent = _pembelianDetailMethodLabel(p.method_beli);

  // Gambar pendukung
  const buktiBtn = document.getElementById("pembelianBuktiBtn");
  const gambarText = document.getElementById("pembelianInfoGambarText");
  const hasImg = !!p.img_beli_base64;
  if (buktiBtn) {
    if (hasImg) {
      buktiBtn.hidden = false;
      buktiBtn.dataset.img = p.img_beli_base64;
      buktiBtn.dataset.kode = p.deskripsi || "";
    } else {
      buktiBtn.hidden = true;
      delete buktiBtn.dataset.img;
      delete buktiBtn.dataset.kode;
    }
  }
  if (gambarText) gambarText.textContent = hasImg ? "" : "-";

  // Dibeli oleh
  const infoUser = document.getElementById("pembelianInfoUser");
  if (infoUser) {
    const u = p._user;
    if (u) {
      const label = u.name
        ? `${escapeHTML(u.name)} @${escapeHTML(u.username)}`
        : `@${escapeHTML(u.username)}`;
      infoUser.innerHTML = label;
    } else {
      infoUser.textContent = "-";
    }
  }

  // Item title
  const itemTitle = document.getElementById("pembelianItemTitle");
  if (itemTitle) itemTitle.textContent = `Item (${p._totalItems || 0})`;

  // Item cards
  const itemsCard = document.getElementById("pembelianItemsCard");
  if (itemsCard) {
    if (!p._details || p._details.length === 0) {
      itemsCard.innerHTML = `<p class="detail-empty">Tidak ada item.</p>`;
    } else {
      itemsCard.innerHTML = p._details.map(function (d) {
        const qty = Number(d.qty) || 0;
        const satuan = escapeHTML(d.satuan || "pcs");
        const hargaSat = Number(d.harga_satuan) || 0;
        const total = Number(d.total) || 0;
        return `
          <div class="detail-item">
            <div class="detail-item__body">
              <span class="detail-item__name">${escapeHTML(d.name_item || "")}</span>
              <span class="detail-item__qty">${qty} ${satuan} x Rp ${hargaSat.toLocaleString("id-ID")}</span>
            </div>
            <span class="detail-item__subtotal">Rp ${total.toLocaleString("id-ID")}</span>
          </div>`;
      }).join("");
    }
  }

  // Rincian total
  const rTotal = document.getElementById("pembelianRincianTotal");
  if (rTotal) rTotal.textContent = "Rp " + Number(p.total || 0).toLocaleString("id-ID");
}

/* ---------- Event: tombol bukti (preview gambar) ---------- */
if (!window._pembelianDetailBound) {
  window._pembelianDetailBound = true;

  document.addEventListener("click", function (e) {
    if (!document.querySelector(".page--pembelian-detail")) return;

    // Tombol gambar pendukung
    const buktiBtn = e.target.closest("#pembelianBuktiBtn");
    if (buktiBtn && !buktiBtn.hidden) {
      e.preventDefault();
      const src = buktiBtn.dataset.img || "";
      if (!src) return;
      if (typeof openImagePreview === "function") {
        openImagePreview(src, "Gambar Pendukung " + (buktiBtn.dataset.kode || ""));
      } else if (typeof openInfoPopup === "function") {
        openInfoPopup("Fitur pratinjau gambar tidak tersedia.", {
          title: "Tidak Tersedia",
          icon: "warning"
        });
      }
      return;
    }
  });
}

/* ---------- Init ---------- */
async function initDataPembelianDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";

  if (!id) {
    _renderPembelianDetail(null);
    return;
  }

  try {
    _pembelianDetailCache = await _loadPembelianDetail(id);
    _renderPembelianDetail(_pembelianDetailCache);
  } catch (err) {
    console.error("[pembelian-detail] Gagal memuat:", err);
    _renderPembelianDetail(null);
  }
}
