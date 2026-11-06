/* ============================================
   HALAMAN RIWAYAT TRANSAKSI
   Filter: hari ini / minggu ini / bulan ini / pilih tanggal
   ============================================ */

let _riwayatCache = [];
let _riwayatFilter = "hari-ini"; // hari-ini | minggu-ini | bulan-ini | custom
let _riwayatTanggalAwal = "";
let _riwayatTanggalAkhir = "";
let _riwayatExpanded = {};

/* ---------- Helper tanggal ---------- */
function _pad2(n) { return String(n).padStart(2, "0"); }

function _toYMD(d) {
    return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
}

function _parseYMD(str) {
    if (!str) return null;
    const parts = str.split("-");
    if (parts.length !== 3) return null;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
}

/** Rentang tanggal sesuai filter aktif */
function _getRentangFilter() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (_riwayatFilter === "hari-ini") {
        return { awal: _toYMD(today), akhir: _toYMD(today), label: "Pendapatan Hari ini" };
    }

    if (_riwayatFilter === "minggu-ini") {
        const day = today.getDay(); // 0=Min
        const diffKeSenin = day === 0 ? 6 : day - 1;
        const senin = new Date(today);
        senin.setDate(today.getDate() - diffKeSenin);
        const minggu = new Date(senin);
        minggu.setDate(senin.getDate() + 6);
        return { awal: _toYMD(senin), akhir: _toYMD(minggu), label: "Pendapatan Minggu ini" };
    }

    if (_riwayatFilter === "bulan-ini") {
        const awal = new Date(today.getFullYear(), today.getMonth(), 1);
        const akhir = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { awal: _toYMD(awal), akhir: _toYMD(akhir), label: "Pendapatan Bulan ini" };
    }

    // custom
    const awalStr = _riwayatTanggalAwal || _toYMD(today);
    const akhirStr = _riwayatTanggalAkhir || _toYMD(today);
    return {
        awal: awalStr,
        akhir: akhirStr,
        label: `Pendapatan ${_formatTanggalRingkas(awalStr)} - ${_formatTanggalRingkas(akhirStr)}`
    };
}

function _formatTanggalRingkas(ymd) {
    const d = _parseYMD(ymd);
    if (!d) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric", month: "short", year: "numeric"
    }).format(d);
}

function _formatTanggalJam(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    const tgl = new Intl.DateTimeFormat("id-ID", {
        day: "numeric", month: "short", year: "numeric"
    }).format(d);
    const jam = `${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
    return `${tgl} - ${jam}`;
}

function _formatHariTanggal(ymd) {
    const d = _parseYMD(ymd);
    if (!d) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "long", day: "numeric", month: "short", year: "numeric"
    }).format(d);
}

/* ---------- Load data ---------- */
async function _loadRiwayat() {
    const userId = sessionStorage.getItem("login");
    if (!userId) return [];

    const rows = await db.penjualan
        .filter(p => !p.deleted_at && p.status === 1 && p.id_user === userId)
        .toArray();

    for (const p of rows) {
        p._details = await db.penjualan_detail
            .where("penjualan").equals(p.id)
            .filter(d => !d.deleted_at)
            .toArray();
        p._totalItems = p._details.reduce((s, d) => s + (d.qty || 0), 0);
    }
    return rows;
}

/* ---------- Render ---------- */
function _renderRiwayat() {
    const listEl = document.getElementById("riwayatList");
    const emptyEl = document.getElementById("riwayatEmpty");
    const summaryLabel = document.getElementById("riwayatSummaryLabel");
    const summaryCount = document.getElementById("riwayatSummaryCount");
    const summaryTotal = document.getElementById("riwayatSummaryTotal");
    if (!listEl) return;

    const rentang = _getRentangFilter();

    // Filter berdasarkan tanggal_jual (YYYY-MM-DD prefix)
    const filtered = _riwayatCache.filter(function (p) {
        const tgl = (p.tanggal_jual || "").slice(0, 10);
        if (!tgl) return false;
        return tgl >= rentang.awal && tgl <= rentang.akhir;
    });

    // Sort: tanggal_jual terbesar dulu
    filtered.sort(function (a, b) {
        return (b.tanggal_jual || "").localeCompare(a.tanggal_jual || "");
    });

    // Summary
    const total = filtered.reduce((s, p) => s + (p.total_bayar || 0), 0);
    if (summaryLabel) summaryLabel.textContent = rentang.label;
    if (summaryCount) summaryCount.textContent = `Ada ${filtered.length} transaksi`;
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
        const ymd = (p.tanggal_jual || "").slice(0, 10);
        if (!groups[ymd]) { groups[ymd] = []; order.push(ymd); }
        groups[ymd].push(p);
    });

    listEl.innerHTML = order.map(function (ymd) {
        const items = groups[ymd];
        const cardsHTML = items.map(function (p) {
            const expanded = !!_riwayatExpanded[p.id];
            const method = p.method_bayar || "tunai";
            const iconClass = method === "qris" ? "fa-qrcode"
                : method === "transfer" ? "fa-building-columns"
                    : "fa-money-bill-wave";
            const totalStr = "Rp " + Number(p.total_bayar || 0).toLocaleString("id-ID");

            return `
                <div class="riwayat-card${expanded ? " is-open" : ""}" data-id="${p.id}">
                    <button type="button" class="riwayat-card__head" data-action="riwayat-toggle" data-id="${p.id}">
                        <div class="riwayat-card__icon riwayat-card__icon--${escapeHTML(method)}">
                            <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
                        </div>
                        <div class="riwayat-card__info">
                            <span class="riwayat-card__kode">${escapeHTML(p.kode || "-")}</span>
                            <span class="riwayat-card__tanggal">${_formatTanggalJam(p.tanggal_jual)}</span>
                            <span class="riwayat-card__items">${p._totalItems} item</span>
                        </div>
                        <div class="riwayat-card__right">
                            <span class="riwayat-card__total">${totalStr}</span>
                            <i class="fa-solid fa-chevron-down riwayat-card__chevron" aria-hidden="true"></i>
                        </div>
                    </button>
                    <div class="riwayat-card__body" ${expanded ? "" : "hidden"}>
                        <div class="riwayat-card__actions">
                            <button type="button" class="btn-secondary"
                                    data-action="riwayat-detail" data-id="${p.id}">
                                <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                                Detail
                            </button>
                            <button type="button" class="btn-primary"
                                    data-action="riwayat-cetak" data-id="${p.id}">
                                <i class="fa-solid fa-print" aria-hidden="true"></i>
                                Cetak Struk
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        return `
            <div class="riwayat-group">
                <h3 class="riwayat-group__title">${_formatHariTanggal(ymd)}</h3>
                ${cardsHTML}
            </div>
        `;
    }).join("");
}

/* ---------- Popup Pilih Tanggal ---------- */
function _openTanggalModal() {
    const modal = document.getElementById("riwayatTanggalModal");
    if (!modal) return;

    const inputAwal = document.getElementById("riwayatTanggalAwal");
    const inputAkhir = document.getElementById("riwayatTanggalAkhir");
    const errorEl = document.getElementById("riwayatTanggalError");

    // Default: isi dengan rentang yang sedang aktif
    const rentang = _getRentangFilter();
    if (inputAwal) inputAwal.value = rentang.awal;
    if (inputAkhir) inputAkhir.value = rentang.akhir;
    if (errorEl) errorEl.textContent = "";

    modal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(function () { if (inputAwal) inputAwal.focus(); }, 100);
}

function _closeTanggalModal() {
    const modal = document.getElementById("riwayatTanggalModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
}

function _setActiveBadge(filter) {
    document.querySelectorAll("[data-filter]").forEach(function (b) {
        const active = b.dataset.filter === filter;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
    });
}

/* ---------- Event Delegation ---------- */
if (!window._riwayatBound) {
    window._riwayatBound = true;

    document.addEventListener("click", function (e) {
        if (!document.querySelector(".page--riwayat")) return;

        // Toggle expand card
        const toggle = e.target.closest("[data-action='riwayat-toggle']");
        if (toggle) {
            e.preventDefault();
            const id = toggle.dataset.id;
            _riwayatExpanded[id] = !_riwayatExpanded[id];
            _renderRiwayat();
            return;
        }

        // Detail / Cetak (sementara placeholder)
        const detailBtn = e.target.closest("[data-action='riwayat-detail']");
        if (detailBtn) {
            e.preventDefault();
            const id = detailBtn.dataset.id || "";
            const url = `app.html?page=data-detail-transaksi&id=${encodeURIComponent(id)}`;
            history.pushState({ page: "data-detail-transaksi" }, "", url);
            navigateTo("data-detail-transaksi", { pushState: false });
            return;
        }
        const cetakBtn = e.target.closest("[data-action='riwayat-cetak']");
        if (cetakBtn) {
            e.preventDefault();
            alert("Fitur cetak struk akan diimplementasikan nanti.");
            return;
        }

        // Badge filter
        const badge = e.target.closest("[data-filter]");
        if (badge && document.getElementById("riwayatFilter")?.contains(badge)) {
            e.preventDefault();
            const val = badge.dataset.filter;

            if (val === "pilih-tanggal") {
                _openTanggalModal();
                return;
            }

            _riwayatFilter = val;
            _setActiveBadge(val);
            _renderRiwayat();
            return;
        }

        // Modal pilih tanggal: batal
        if (e.target.closest("#btnRiwayatTanggalBatal")) {
            e.preventDefault();
            _closeTanggalModal();
            // Batal → kembalikan ke default hari ini
            _riwayatFilter = "hari-ini";
            _setActiveBadge("hari-ini");
            _renderRiwayat();
            return;
        }

        // Modal pilih tanggal: terapkan
        if (e.target.closest("#btnRiwayatTanggalTerapkan")) {
            e.preventDefault();
            const inputAwal = document.getElementById("riwayatTanggalAwal");
            const inputAkhir = document.getElementById("riwayatTanggalAkhir");
            const errorEl = document.getElementById("riwayatTanggalError");
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

            _riwayatFilter = "custom";
            _riwayatTanggalAwal = awal;
            _riwayatTanggalAkhir = akhir;
            _setActiveBadge("pilih-tanggal");
            _closeTanggalModal();
            _renderRiwayat();
            return;
        }

        // Klik backdrop modal pilih tanggal → batal
        const modal = document.getElementById("riwayatTanggalModal");
        if (modal && e.target === modal) {
            _closeTanggalModal();
            _riwayatFilter = "hari-ini";
            _setActiveBadge("hari-ini");
            _renderRiwayat();
        }
    });
}

/* ---------- Init ---------- */
async function initRiwayat() {
    _riwayatFilter = "hari-ini";
    _riwayatTanggalAwal = "";
    _riwayatTanggalAkhir = "";
    _riwayatExpanded = {};

    _setActiveBadge("hari-ini");
    _riwayatCache = await _loadRiwayat();
    _renderRiwayat();

    // Refresh
    const refreshBtn = document.getElementById("btnRefreshRiwayat");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async function () {
            const icon = refreshBtn.querySelector("i");
            if (icon) icon.style.animation = "spin 0.8s linear infinite";
            _riwayatCache = await _loadRiwayat();
            _renderRiwayat();
            if (icon) icon.style.animation = "";
        });
    }
}