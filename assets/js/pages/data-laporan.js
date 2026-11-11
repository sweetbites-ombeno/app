/* ============================================
   HALAMAN LAPORAN PENJUALAN & PEMBELIAN
   ============================================ */

// State filter (default: bulan ini)
let _laporanPenjualanAwal = "";
let _laporanPenjualanAkhir = "";
let _laporanPembelianAwal = "";
let _laporanPembelianAkhir = "";
let _laporanActiveFilterTarget = ""; // "penjualan" | "pembelian"
let _laporanActiveTab = "penjualan";

/* ---------- Helper tanggal ---------- */
function _lapPad2(n) { return String(n).padStart(2, "0"); }

function _lapToYMD(d) {
  return `${d.getFullYear()}-${_lapPad2(d.getMonth() + 1)}-${_lapPad2(d.getDate())}`;
}

function _lapParseYMD(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}

function _lapFormatRingkas(ymd) {
  const d = _lapParseYMD(ymd);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

function _lapFormatTanggalItem(ymd) {
  const d = _lapParseYMD(ymd);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

/** Rentang default bulan ini */
function _lapRentangBulanIni() {
  const now = new Date();
  const awal = new Date(now.getFullYear(), now.getMonth(), 1);
  const akhir = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { awal: _lapToYMD(awal), akhir: _lapToYMD(akhir) };
}

/* ---------- Update badge teks filter ---------- */
function _lapUpdateBadgeFilter() {
  const textPenjualan = document.getElementById("laporanFilterPenjualanText");
  const textPembelian = document.getElementById("laporanFilterPembelianText");

  if (textPenjualan) {
    textPenjualan.textContent = (_laporanPenjualanAwal && _laporanPenjualanAkhir)
      ? `${_lapFormatRingkas(_laporanPenjualanAwal)} - ${_lapFormatRingkas(_laporanPenjualanAkhir)}`
      : "-";
  }
  if (textPembelian) {
    textPembelian.textContent = (_laporanPembelianAwal && _laporanPembelianAkhir)
      ? `${_lapFormatRingkas(_laporanPembelianAwal)} - ${_lapFormatRingkas(_laporanPembelianAkhir)}`
      : "-";
  }
}

/* ---------- Format Rp ---------- */
function _lapRp(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

/* ---------- Load & hitung data ---------- */
async function _lapLoadData() {
  const userId = sessionStorage.getItem("login");
  if (!userId) return { penjualan: [], pembelian: [] };

  // Penjualan (status 1 = lunas, status 3 = refund; refund tidak dihitung sebagai pendapatan)
  const penjualanAll = await db.penjualan
    .filter(p => !p.deleted_at && p.id_user === userId && (p.status === 1 || p.status === 3))
    .toArray();

  const penjualanFiltered = penjualanAll.filter(function (p) {
    const tgl = (p.tanggal_jual || "").slice(0, 10);
    if (!tgl) return false;
    if (_laporanPenjualanAwal && tgl < _laporanPenjualanAwal) return false;
    if (_laporanPenjualanAkhir && tgl > _laporanPenjualanAkhir) return false;
    return true;
  });

  const penjualanIds = penjualanFiltered.map(p => p.id);

  // Ambil detail penjualan (hanya untuk transaksi yang lolos filter)
  let penjualanDetail = [];
  if (penjualanIds.length > 0) {
    penjualanDetail = await db.penjualan_detail
      .where("penjualan").anyOf(penjualanIds)
      .filter(d => !d.deleted_at)
      .toArray();
  }

  // Map id penjualan → status (untuk filter refund)
  const statusMap = {};
  penjualanFiltered.forEach(function (p) { statusMap[p.id] = p.status; });

  // Pembelian
  const pembelianAll = await db.pembelian
    .filter(p => !p.deleted_at && p.id_user === userId)
    .toArray();

  const pembelianFiltered = pembelianAll.filter(function (p) {
    const tgl = (p.tanggal_beli || "").slice(0, 10);
    if (!tgl) return false;
    if (_laporanPembelianAwal && tgl < _laporanPembelianAwal) return false;
    if (_laporanPembelianAkhir && tgl > _laporanPembelianAkhir) return false;
    return true;
  });

  const pembelianIds = pembelianFiltered.map(p => p.id);
  let pembelianDetail = [];
  if (pembelianIds.length > 0) {
    pembelianDetail = await db.pembelian_detail
      .where("pembelian").anyOf(pembelianIds)
      .filter(d => !d.deleted_at)
      .toArray();
  }

  return {
    penjualan: penjualanFiltered,
    penjualanDetail: penjualanDetail,
    statusMap: statusMap,
    pembelian: pembelianFiltered,
    pembelianDetail: pembelianDetail
  };
}

/* ---------- Render ringkasan ---------- */
function _lapRenderRingkasan(data) {
  // Pendapatan: total_bayar dari penjualan status 1 saja (refund tidak dihitung)
  let pendapatan = 0;
  let pendapatanRefund = 0;
  data.penjualan.forEach(function (p) {
    if (p.status === 1) pendapatan += Number(p.total_bayar || 0);
    else if (p.status === 3) pendapatanRefund += Number(p.total_bayar || 0);
  });

  // Pengeluaran: total pembelian
  let pengeluaran = 0;
  data.pembelian.forEach(function (p) {
    pengeluaran += Number(p.total || 0);
  });

  // Item terjual: qty dari detail penjualan yang status 1 (bukan refund)
  let itemTerjual = 0;
  data.penjualanDetail.forEach(function (d) {
    if (data.statusMap[d.penjualan] === 1) {
      itemTerjual += Number(d.qty || 0);
    }
  });

  const keuntungan = pendapatan - pengeluaran;

  const elPendapatan = document.getElementById("laporanPendapatan");
  const elPengeluaran = document.getElementById("laporanPengeluaran");
  const elItemTerjual = document.getElementById("laporanItemTerjual");
  const elKeuntungan = document.getElementById("laporanKeuntungan");

  if (elPendapatan) elPendapatan.textContent = _lapRp(pendapatan);
  if (elPengeluaran) elPengeluaran.textContent = _lapRp(pengeluaran);
  if (elItemTerjual) elItemTerjual.textContent = itemTerjual.toLocaleString("id-ID") + " item";
  if (elKeuntungan) {
    elKeuntungan.textContent = _lapRp(keuntungan);
    // Warna: hijau kalau untung, merah kalau rugi
    elKeuntungan.style.color = keuntungan >= 0 ? "#059669" : "#dc2626";
  }
}

/* ---------- Render tabel penjualan ---------- */
function _lapRenderTabelPenjualan(data) {
  const tbody = document.getElementById("laporanPenjualanBody");
  const empty = document.getElementById("laporanPenjualanEmpty");
  if (!tbody) return;

  // Group by (name_product + harga_satuan) — hanya status 1 (lunas)
  const groups = {};
  data.penjualanDetail.forEach(function (d) {
    if (data.statusMap[d.penjualan] !== 1) return; // skip refund

    const name = d.name_product || "";
    const hargaSatuan = Number(d.harga_satuan || 0);
    const key = name + "||" + hargaSatuan;

    if (!groups[key]) {
      groups[key] = {
        name: name,
        harga_satuan: hargaSatuan,
        qty: 0,
        total: 0
      };
    }
    groups[key].qty += Number(d.qty || 0);
    groups[key].total += Number(d.total || 0);
  });

  // Urutkan: nama ascending, lalu harga_satuan terkecil
  const rows = Object.values(groups).sort(function (a, b) {
    const cmp = a.name.localeCompare(b.name);
    if (cmp !== 0) return cmp;
    return a.harga_satuan - b.harga_satuan;
  });

  if (rows.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = rows.map(function (r) {
    return `
      <tr>
        <td>
          <div class="laporan-produk-cell">
            <span class="laporan-produk-nama">${escapeHTML(r.name)}</span>
            <span class="laporan-produk-harga">${_lapRp(r.harga_satuan)}</span>
          </div>
        </td>
        <td class="laporan-table__num">${r.qty.toLocaleString("id-ID")}</td>
        <td class="laporan-table__num laporan-table__total">${_lapRp(r.total)}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- Render tabel pembelian ---------- */
function _lapRenderTabelPembelian(data) {
  const tbody = document.getElementById("laporanPembelianBody");
  const empty = document.getElementById("laporanPembelianEmpty");
  if (!tbody) return;

  // Map pembelian id → tanggal_beli
  const tanggalMap = {};
  data.pembelian.forEach(function (p) {
    tanggalMap[p.id] = (p.tanggal_beli || "").slice(0, 10);
  });

  // Item pembelian (tidak di-group)
  const rows = data.pembelianDetail.map(function (d) {
    return {
      name_item: d.name_item || "",
      tanggal_beli: tanggalMap[d.pembelian] || "",
      harga_satuan: Number(d.harga_satuan || 0),
      qty: Number(d.qty || 0),
      satuan: d.satuan || "pcs",
      total: Number(d.total || 0)
    };
  });

  // Urutkan: tanggal terbaru dulu, lalu nama ascending
  rows.sort(function (a, b) {
    const ta = a.tanggal_beli || "";
    const tb = b.tanggal_beli || "";
    if (!ta && !tb) return a.name_item.localeCompare(b.name_item);
    if (!ta) return 1;   // kosong selalu di bawah
    if (!tb) return -1;
    const cmpTgl = tb.localeCompare(ta);
    if (cmpTgl !== 0) return cmpTgl;
    return a.name_item.localeCompare(b.name_item);
  });

  if (rows.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = rows.map(function (r) {
    return `
      <tr>
        <td>
          <div class="laporan-item-cell">
            <span class="laporan-item-nama">${escapeHTML(r.name_item)}</span>
            <span class="laporan-item-meta">
              <span class="laporan-item-tanggal">${_lapFormatTanggalItem(r.tanggal_beli)}</span>
              <span class="laporan-item-harga">${_lapRp(r.harga_satuan)}</span>
            </span>
          </div>
        </td>
        <td class="laporan-table__num">${r.qty.toLocaleString("id-ID")} ${escapeHTML(r.satuan)}</td>
        <td class="laporan-table__num laporan-table__total">${_lapRp(r.total)}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- Render semua ---------- */
async function _lapRenderAll() {
  try {
    const data = await _lapLoadData();
    _lapRenderRingkasan(data);
    _lapRenderTabelPenjualan(data);
    _lapRenderTabelPembelian(data);
  } catch (err) {
    console.error("[laporan] Gagal render:", err);
  }
}

/* ---------- Buka popup filter tanggal ---------- */
function _lapOpenTanggalModal(target) {
  _laporanActiveFilterTarget = target;
  const modal = document.getElementById("laporanTanggalModal");
  if (!modal) return;

  const titleEl = document.getElementById("laporanTanggalTitle");
  const inputAwal = document.getElementById("laporanTanggalAwal");
  const inputAkhir = document.getElementById("laporanTanggalAkhir");
  const errorEl = document.getElementById("laporanTanggalError");

  if (titleEl) {
    titleEl.textContent = target === "penjualan"
      ? "Filter Tanggal Penjualan"
      : "Filter Tanggal Pembelian";
  }

  // Isi default dari state saat ini
  if (target === "penjualan") {
    if (inputAwal) inputAwal.value = _laporanPenjualanAwal;
    if (inputAkhir) inputAkhir.value = _laporanPenjualanAkhir;
  } else {
    if (inputAwal) inputAwal.value = _laporanPembelianAwal;
    if (inputAkhir) inputAkhir.value = _laporanPembelianAkhir;
  }

  if (errorEl) errorEl.textContent = "";
  modal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(function () { if (inputAwal) inputAwal.focus(); }, 100);
}

function _lapCloseTanggalModal() {
  const modal = document.getElementById("laporanTanggalModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("modal-open");
}

/* ---------- Event delegation ---------- */
if (!window._laporanBound) {
  window._laporanBound = true;

  document.addEventListener("click", function (e) {
    if (!document.querySelector(".page--laporan")) return;

    // Klik badge filter penjualan
    if (e.target.closest("#laporanFilterPenjualan")) {
      e.preventDefault();
      _lapOpenTanggalModal("penjualan");
      return;
    }

    // Klik badge filter pembelian
    if (e.target.closest("#laporanFilterPembelian")) {
      e.preventDefault();
      _lapOpenTanggalModal("pembelian");
      return;
    }

    // Batal popup
    if (e.target.closest("#btnLaporanTanggalBatal")) {
      e.preventDefault();
      _lapCloseTanggalModal();
      return;
    }

    // Terapkan popup
    if (e.target.closest("#btnLaporanTanggalTerapkan")) {
      e.preventDefault();
      const inputAwal = document.getElementById("laporanTanggalAwal");
      const inputAkhir = document.getElementById("laporanTanggalAkhir");
      const errorEl = document.getElementById("laporanTanggalError");
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

      if (_laporanActiveFilterTarget === "penjualan") {
        _laporanPenjualanAwal = awal;
        _laporanPenjualanAkhir = akhir;
      } else {
        _laporanPembelianAwal = awal;
        _laporanPembelianAkhir = akhir;
      }

      _lapUpdateBadgeFilter();
      _lapCloseTanggalModal();
      _lapRenderAll();
      return;
    }

    // Klik backdrop
    const modal = document.getElementById("laporanTanggalModal");
    if (modal && e.target === modal) {
      _lapCloseTanggalModal();
      return;
    }

    // Tab switch
    const tab = e.target.closest(".laporan-tab");
    if (tab) {
      e.preventDefault();
      const target = tab.dataset.tab;
      if (!target) return;

      _laporanActiveTab = target;

      // Update class tab
      document.querySelectorAll(".laporan-tab").forEach(function (t) {
        const active = t.dataset.tab === target;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });

      // Toggle panel
      const panelPenjualan = document.getElementById("laporanPanelPenjualan");
      const panelPembelian = document.getElementById("laporanPanelPembelian");
      if (panelPenjualan) panelPenjualan.hidden = target !== "penjualan";
      if (panelPembelian) panelPembelian.hidden = target !== "pembelian";
      return;
    }
  });
}

/* ---------- Init ---------- */
async function initDataLaporan() {
  // Default: bulan ini untuk kedua filter
  const rentang = _lapRentangBulanIni();
  _laporanPenjualanAwal = rentang.awal;
  _laporanPenjualanAkhir = rentang.akhir;
  _laporanPembelianAwal = rentang.awal;
  _laporanPembelianAkhir = rentang.akhir;
  _laporanActiveTab = "penjualan";

  _lapUpdateBadgeFilter();

  // Pastikan tab penjualan aktif
  document.querySelectorAll(".laporan-tab").forEach(function (t) {
    const active = t.dataset.tab === "penjualan";
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  const panelPenjualan = document.getElementById("laporanPanelPenjualan");
  const panelPembelian = document.getElementById("laporanPanelPembelian");
  if (panelPenjualan) panelPenjualan.hidden = false;
  if (panelPembelian) panelPembelian.hidden = true;

  await _lapRenderAll();
}
