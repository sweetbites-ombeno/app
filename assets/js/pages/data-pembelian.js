/* ============================================
   HALAMAN DATA PEMBELIAN & PENGELUARAN
   Filter: hari ini / minggu ini / bulan ini / pilih tanggal
   Sort default: tanggal_beli terbesar (terbaru dulu)
   ============================================ */

let _pembelianCache = [];
let _pembelianFilter = "hari-ini"; // hari-ini | minggu-ini | bulan-ini | custom
let _pembelianTanggalAwal = "";
let _pembelianTanggalAkhir = "";
let _pembelianExpanded = {};

/* ---------- Helper tanggal ---------- */
function _pembelianPad2(n) { return String(n).padStart(2, "0"); }

function _pembelianToYMD(d) {
  return `${d.getFullYear()}-${_pembelianPad2(d.getMonth() + 1)}-${_pembelianPad2(d.getDate())}`;
}

function _pembelianParseYMD(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}

function _pembelianFormatTanggalRingkas(ymd) {
  const d = _pembelianParseYMD(ymd);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

function _pembelianFormatHariTanggal(ymd) {
  const d = _pembelianParseYMD(ymd);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

/* ---------- Update badge Pilih Tanggal ---------- */
function _pembelianUpdateBadgePilihTanggal() {
  const badge = document.getElementById("badgePilihTanggalPembelian");
  if (!badge) return;

  if (_pembelianFilter === "custom" && _pembelianTanggalAwal && _pembelianTanggalAkhir) {
    const awal = _pembelianFormatTanggalRingkas(_pembelianTanggalAwal);
    const akhir = _pembelianFormatTanggalRingkas(_pembelianTanggalAkhir);
    badge.textContent = `${awal} - ${akhir}`;
  } else {
    badge.textContent = "Pilih Tanggal";
  }
}

/* ---------- Rentang tanggal sesuai filter ---------- */
function _pembelianGetRentangFilter() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (_pembelianFilter === "hari-ini") {
    return { awal: _pembelianToYMD(today), akhir: _pembelianToYMD(today), label: "Pengeluaran Hari ini" };
  }

  if (_pembelianFilter === "minggu-ini") {
    const day = today.getDay();
    const diffKeSenin = day === 0 ? 6 : day - 1;
    const senin = new Date(today);
    senin.setDate(today.getDate() - diffKeSenin);
    const minggu = new Date(senin);
    minggu.setDate(senin.getDate() + 6);
    return { awal: _pembelianToYMD(senin), akhir: _pembelianToYMD(minggu), label: "Pengeluaran Minggu ini" };
  }

  if (_pembelianFilter === "bulan-ini") {
    const awal = new Date(today.getFullYear(), today.getMonth(), 1);
    const akhir = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { awal: _pembelianToYMD(awal), akhir: _pembelianToYMD(akhir), label: "Pengeluaran Bulan ini" };
  }

  const awalStr = _pembelianTanggalAwal || _pembelianToYMD(today);
  const akhirStr = _pembelianTanggalAkhir || _pembelianToYMD(today);
  return {
    awal: awalStr,
    akhir: akhirStr,
    label: `Pengeluaran ${_pembelianFormatTanggalRingkas(awalStr)} - ${_pembelianFormatTanggalRingkas(akhirStr)}`
  };
}

/* ---------- Load data dari DB ---------- */
async function _loadPembelian() {
  const userId = sessionStorage.getItem("login");
  if (!userId) return [];

  const rows = await db.pembelian
    .filter(p => !p.deleted_at && p.id_user === userId)
    .toArray();

  for (const p of rows) {
    p._details = await db.pembelian_detail
      .where("pembelian").equals(p.id)
      .filter(d => !d.deleted_at)
      .toArray();
    p._details.sort((a, b) => (a.order || 0) - (b.order || 0));
    p._totalItems = p._details.reduce((s, d) => s + (d.qty || 0), 0);
  }
  return rows;
}

/* ---------- Render ---------- */
function _renderPembelian() {
  const listEl = document.getElementById("pembelianList");
  const emptyEl = document.getElementById("pembelianEmpty");
  const summaryLabel = document.getElementById("pembelianSummaryLabel");
  const summaryCount = document.getElementById("pembelianSummaryCount");
  const summaryTotal = document.getElementById("pembelianSummaryTotal");
  if (!listEl) return;

  const rentang = _pembelianGetRentangFilter();

  // Filter: tanggal_beli (YYYY-MM-DD prefix)
  const filtered = _pembelianCache.filter(function (p) {
    const tgl = (p.tanggal_beli || "").slice(0, 10);
    if (!tgl) return false;
    return tgl >= rentang.awal && tgl <= rentang.akhir;
  });

  // Sort: tanggal_beli terbesar dulu (10 nov, 9 nov, 8 nov)
  filtered.sort(function (a, b) {
    return (b.tanggal_beli || "").localeCompare(a.tanggal_beli || "");
  });

  // Summary
  const total = filtered.reduce((s, p) => s + (Number(p.total) || 0), 0);
  if (summaryLabel) summaryLabel.textContent = rentang.label;
  if (summaryCount) summaryCount.textContent = `Ada ${filtered.length} pembelian`;
  if (summaryTotal) summaryTotal.textContent = "Rp " + total.toLocaleString("id-ID");

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "flex";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  // Group by date (YYYY-MM-DD)
  const groups = {};
  const order = [];
  filtered.forEach(function (p) {
    const ymd = (p.tanggal_beli || "").slice(0, 10);
    if (!groups[ymd]) { groups[ymd] = []; order.push(ymd); }
    groups[ymd].push(p);
  });

  listEl.innerHTML = order.map(function (ymd) {
    const items = groups[ymd];
    const cardsHTML = items.map(function (p) {
      const expanded = !!_pembelianExpanded[p.id];
      const method = p.method_beli || "tunai";
      const iconClass = method === "qris" ? "fa-qrcode"
        : method === "transfer" ? "fa-building-columns"
          : method === "e-wallet" ? "fa-wallet"
            : "fa-money-bill-wave";
      const totalStr = "Rp " + Number(p.total || 0).toLocaleString("id-ID");
      const deskripsi = escapeHTML(p.deskripsi || "(tanpa deskripsi)");

      return `
                <div class="riwayat-card${expanded ? " is-open" : ""}" data-id="${p.id}">
                    <button type="button" class="riwayat-card__head" data-action="pembelian-toggle" data-id="${p.id}">
                        <div class="riwayat-card__icon riwayat-card__icon--${escapeHTML(method)}">
                            <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
                        </div>
                        <div class="riwayat-card__info">
                            <span class="riwayat-card__kode">${deskripsi}</span>
                            <span class="riwayat-card__tanggal">${_pembelianFormatTanggalRingkas((p.tanggal_beli || "").slice(0, 10))}</span>
                            <span class="riwayat-card__items">${p._totalItems} item</span>
                        </div>
                        <div class="riwayat-card__right">
                            <span class="riwayat-card__total">${totalStr}</span>
                            <i class="fa-solid fa-chevron-down riwayat-card__chevron" aria-hidden="true"></i>
                        </div>
                    </button>
                    <div class="riwayat-card__body" ${expanded ? "" : "hidden"}>
                      <div class="pembelian-card__items">
                        ${p._details.map(d => `
                          <div class="pembelian-card__item">
                            <span>${escapeHTML(d.name_item || "")}</span>
                            <span>${d.qty} ${escapeHTML(d.satuan || "pcs")} x Rp ${Number(d.harga_satuan || 0).toLocaleString("id-ID")}</span>
                            <span>Rp ${Number(d.total || 0).toLocaleString("id-ID")}</span>
                          </div>
                        `).join("")}
                      </div>
                        <div class="riwayat-card__actions">
                            <button type="button" class="btn-secondary"
                                    data-action="pembelian-edit" data-id="${p.id}">
                                <i class="fa-solid fa-pen" aria-hidden="true"></i>
                                Edit
                            </button>
                            <button type="button" class="btn-secondary"
                                    data-action="pembelian-detail" data-id="${p.id}">
                                <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                                Detail
                            </button>
                            <button type="button" class="btn-danger"
                                    data-action="pembelian-delete" data-id="${p.id}"
                                    data-name="${deskripsi}">
                                <i class="fa-solid fa-trash" aria-hidden="true"></i>
                                Hapus
                            </button>
                        </div>
                    </div>
                </div>
            `;
    }).join("");

    return `
            <div class="riwayat-group">
                <h3 class="riwayat-group__title">${_pembelianFormatHariTanggal(ymd)}</h3>
                ${cardsHTML}
            </div>
        `;
  }).join("");
}

/* ---------- Set badge aktif ---------- */
function _pembelianSetActiveBadge(filter) {
  document.querySelectorAll("#pembelianFilter [data-filter]").forEach(function (b) {
    const active = b.dataset.filter === filter;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
}

/* ---------- Popup pilih tanggal ---------- */
function _pembelianOpenTanggalModal() {
  const modal = document.getElementById("pembelianTanggalModal");
  if (!modal) return;

  const inputAwal = document.getElementById("pembelianTanggalAwal");
  const inputAkhir = document.getElementById("pembelianTanggalAkhir");
  const errorEl = document.getElementById("pembelianTanggalError");

  const rentang = _pembelianGetRentangFilter();
  if (inputAwal) inputAwal.value = rentang.awal;
  if (inputAkhir) inputAkhir.value = rentang.akhir;
  if (errorEl) errorEl.textContent = "";

  modal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(function () { if (inputAwal) inputAwal.focus(); }, 100);
}

function _pembelianCloseTanggalModal() {
  const modal = document.getElementById("pembelianTanggalModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("modal-open");
}

/* ---------- Event delegation ---------- */
if (!window._pembelianBound) {
  window._pembelianBound = true;

  document.addEventListener("click", async function (e) {
    if (!document.querySelector(".page--pembelian")) return;

    // Toggle expand
    const toggle = e.target.closest("[data-action='pembelian-toggle']");
    if (toggle) {
      e.preventDefault();
      const id = toggle.dataset.id;
      _pembelianExpanded[id] = !_pembelianExpanded[id];
      _renderPembelian();
      return;
    }

    // Detail (placeholder)
    const detailBtn = e.target.closest("[data-action='pembelian-detail']");
    if (detailBtn) {
      e.preventDefault();
      const id = detailBtn.dataset.id || "";
      const url = `app.html?page=data-pembelian-detail&id=${encodeURIComponent(id)}`;
      history.pushState({ page: "data-pembelian-detail" }, "", url);
      navigateTo("data-pembelian-detail", { pushState: false });
      return;
    }

    // Delete (soft delete)
    const delBtn = e.target.closest("[data-action='pembelian-delete']");
    if (delBtn) {
      e.preventDefault();
      const id = delBtn.dataset.id;
      const name = delBtn.dataset.name || "pembelian ini";

      // ⬇️ Fungsi proses hapus (dipisah agar bisa dipakai di popup & fallback)
      async function _prosesHapusPembelian() {
        try {
          const userId = sessionStorage.getItem("login");
          const existing = await db.pembelian.get(id);
          if (!existing || existing.deleted_at || existing.id_user !== userId) {
            openInfoPopup("Data pembelian bukan milik akun ini.", {
              title: "Akses Ditolak",
              icon: "danger"
            });
            return;
          }

          const now = new Date().toISOString();

          // Soft delete pembelian
          await db.pembelian.update(id, { deleted_at: now, updated_at: now });

          // Soft delete detail terkait
          const details = await db.pembelian_detail
            .where("pembelian").equals(id)
            .toArray();
          for (const d of details) {
            await db.pembelian_detail.update(d.id, { deleted_at: now, updated_at: now });
          }

          // Refresh cache & render
          _pembelianCache = await _loadPembelian();
          delete _pembelianExpanded[id];
          _renderPembelian();
        } catch (err) {
          console.error("[pembelian] Gagal hapus:", err);
          openInfoPopup("Gagal menghapus: " + (err.message || "Terjadi kesalahan"), {
            title: "Gagal Menghapus",
            icon: "danger"
          });
        }
      }

      // Pakai popup konfirmasi custom
      if (typeof openConfirmHapus === "function") {
        openConfirmHapus({
          title: "Hapus Pembelian?",
          labelData: "pembelian",
          name: name,
          onYes: _prosesHapusPembelian,
          onNo: function () { /* Batal */ }
        });
      } else {
        // Fallback
        if (!confirm(`Hapus pembelian "${name}"?`)) return;
        _prosesHapusPembelian();
      }
      return;
    }

    // Tambah pembelian (placeholder)
    if (e.target.closest("[data-action='add-pembelian']")) {
      e.preventDefault();
      history.pushState({ page: "data-pembelian-form" }, "", "app.html?page=data-pembelian-form");
      navigateTo("data-pembelian-form", { pushState: false });
      return;
    }

    // Tambahkan handler edit pembelian:
    const editBtn = e.target.closest("[data-action='pembelian-edit']");
    if (editBtn) {
      e.preventDefault();
      const id = editBtn.dataset.id;
      const url = `app.html?page=data-pembelian-form&mode=edit&id=${encodeURIComponent(id)}`;
      history.pushState({ page: "data-pembelian-form" }, "", url);
      navigateTo("data-pembelian-form", { pushState: false });
      return;
    }

    // Badge filter
    const badge = e.target.closest("#pembelianFilter [data-filter]");
    if (badge) {
      e.preventDefault();
      const val = badge.dataset.filter;

      if (val === "pilih-tanggal") {
        _pembelianOpenTanggalModal();
        return;
      }

      _pembelianFilter = val;
      _pembelianSetActiveBadge(val);
      _pembelianUpdateBadgePilihTanggal();
      _renderPembelian();
      return;
    }

    // Modal pilih tanggal: batal
    if (e.target.closest("#btnPembelianTanggalBatal")) {
      e.preventDefault();
      _pembelianCloseTanggalModal();
      _pembelianFilter = "hari-ini";
      _pembelianSetActiveBadge("hari-ini");
      _pembelianUpdateBadgePilihTanggal();
      _renderPembelian();
      return;
    }

    // Modal pilih tanggal: terapkan
    if (e.target.closest("#btnPembelianTanggalTerapkan")) {
      e.preventDefault();
      const inputAwal = document.getElementById("pembelianTanggalAwal");
      const inputAkhir = document.getElementById("pembelianTanggalAkhir");
      const errorEl = document.getElementById("pembelianTanggalError");
      const awal = inputAwal ? inputAwal.value : "";
      const akhir = inputAkhir ? inputAkhir.value : "";

      if (!awal || !akhir) {
        if (errorEl) errorEl.textContent = "Tanggal awal dan akhir wajib diisi.";
        return;
      }
      if (awal > akhir) {
        if (errorEl) errorEl.textContent = "Tanggal awal tidak boleh melebihi tanggal akhir.";
        return;
      }

      _pembelianFilter = "custom";
      _pembelianTanggalAwal = awal;
      _pembelianTanggalAkhir = akhir;
      _pembelianSetActiveBadge("pilih-tanggal");
      _pembelianUpdateBadgePilihTanggal();
      _pembelianCloseTanggalModal();
      _renderPembelian();
      return;
    }

    // Klik backdrop modal pilih tanggal → batal
    const modal = document.getElementById("pembelianTanggalModal");
    if (modal && e.target === modal) {
      _pembelianCloseTanggalModal();
      _pembelianFilter = "hari-ini";
      _pembelianSetActiveBadge("hari-ini");
      _pembelianUpdateBadgePilihTanggal();
      _renderPembelian();
    }
  });
}

/* ---------- Init ---------- */
async function initDataPembelian() {
  _pembelianFilter = "hari-ini";
  _pembelianTanggalAwal = "";
  _pembelianTanggalAkhir = "";
  _pembelianExpanded = {};

  _pembelianSetActiveBadge("hari-ini");
  _pembelianUpdateBadgePilihTanggal();

  try {
    _pembelianCache = await _loadPembelian();
    _renderPembelian();
  } catch (err) {
    console.error("[pembelian] Gagal memuat:", err);
    const listEl = document.getElementById("pembelianList");
    if (listEl) {
      listEl.innerHTML = `
                <div class="page__placeholder">
                    <i class="fa-solid fa-triangle-exclamation page__placeholder-icon"></i>
                    <h2 class="page__placeholder-title">Gagal memuat</h2>
                    <p class="page__placeholder-text">${escapeHTML(err.message || "Terjadi kesalahan")}</p>
                </div>`;
    }
  }

  // Refresh
  const refreshBtn = document.getElementById("btnRefreshPembelian");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async function () {
      const icon = refreshBtn.querySelector("i");
      if (icon) icon.style.animation = "spin 0.8s linear infinite";
      try {
        _pembelianCache = await _loadPembelian();
        _renderPembelian();
      } catch (err) {
        console.error("[pembelian] Gagal refresh:", err);
      }
      if (icon) icon.style.animation = "";
    });
  }
}
