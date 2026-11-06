/* ============================================
   HALAMAN DETAIL TRANSAKSI
   URL: app.html?page=data-detail-transaksi&id=<penjualanId>
   ============================================ */

let _detailTransaksiCache = null;

/* ---------- Helper tanggal ---------- */
function _pad2(n) { return String(n).padStart(2, "0"); }

function _formatTanggalLengkap(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";

    const tgl = new Intl.DateTimeFormat("id-ID", {
        weekday: "long", day: "numeric", month: "short", year: "numeric"
    }).format(d);
    const jam = `${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
    return `${tgl} - ${jam}`;
}

function _methodLabel(method) {
    if (method === "qris") return "Qris";
    if (method === "transfer") return "Transfer";
    return "Tunai";
}

/* ---------- Load data ---------- */
async function _loadDetailTransaksi(id) {
    if (!id) return null;

    const userId = sessionStorage.getItem("login");
    if (!userId) return null;

    const p = await db.penjualan.get(id);
    if (!p || p.deleted_at) return null;
    if (p.id_user !== userId) return null;

    const details = await db.penjualan_detail
        .where("penjualan").equals(id)
        .filter(d => !d.deleted_at)
        .toArray();
    details.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Ambil image produk (termasuk yang sudah dihapus, agar gambar lama tetap tampil)
    const produkMap = {};
    if (details.length > 0) {
        const produkRows = await db.produk.toArray();
        produkRows.forEach(function (pr) { produkMap[pr.id] = pr; });
    }
    details.forEach(function (d) {
        const pr = produkMap[d.id_product];
        d.img_product = pr && pr.image_base64 ? pr.image_base64 : "";
    });

    p._details = details;
    p._totalItems = details.reduce((s, d) => s + (d.qty || 0), 0);

    return p;
}

/* ---------- Render ---------- */
function _renderDetailTransaksi(p) {
    if (!p) {
        const page = document.querySelector(".page--detail-transaksi");
        if (page) {
            page.innerHTML = `
                <div class="page__placeholder">
                    <i class="fa-solid fa-triangle-exclamation page__placeholder-icon"></i>
                    <h2 class="page__placeholder-title">Transaksi tidak ditemukan</h2>
                    <p class="page__placeholder-text">Data mungkin sudah dihapus atau bukan milik akun ini.</p>
                </div>`;
        }
        return;
    }

    // Header kode
    const kodeEl = document.getElementById("detailKode");
    if (kodeEl) kodeEl.textContent = p.kode || "-";

    // Status card
    const tanggalEl = document.getElementById("detailTanggal");
    if (tanggalEl) tanggalEl.textContent = _formatTanggalLengkap(p.tanggal_jual);

    const totalEl = document.getElementById("detailTotal");
    if (totalEl) totalEl.textContent = "Rp " + Number(p.total_bayar || 0).toLocaleString("id-ID");

    // Info order
    const custEl = document.getElementById("detailCustomer");
    if (custEl) custEl.textContent = p.name_customer || "-";

    const telpEl = document.getElementById("detailTelp");
    if (telpEl) telpEl.textContent = p.telp_customer || "-";

    const methodEl = document.getElementById("detailMethod");
    if (methodEl) methodEl.textContent = _methodLabel(p.method_bayar);

    // Item title
    const itemTitle = document.getElementById("detailItemTitle");
    if (itemTitle) itemTitle.textContent = `Item (${p._totalItems || 0})`;

    // Item cards
    const itemsCard = document.getElementById("detailItemsCard");
    if (itemsCard) {
        if (!p._details || p._details.length === 0) {
            itemsCard.innerHTML = `<p class="detail-empty">Tidak ada item.</p>`;
        } else {
            itemsCard.innerHTML = p._details.map(function (d) {
                const imgHTML = d.img_product
                    ? `<img class="detail-item__img" src="${d.img_product}" alt="">`
                    : `<div class="detail-item__img detail-item__img--empty">
                            <i class="fa-regular fa-image" aria-hidden="true"></i>
                       </div>`;
                const qty = d.qty || 0;
                const hargaSat = Number(d.harga_satuan || 0);
                const subtotal = Number(d.total || 0);
                return `
                    <div class="detail-item">
                        ${imgHTML}
                        <div class="detail-item__body">
                            <span class="detail-item__name">${escapeHTML(d.name_product || "")}</span>
                            <span class="detail-item__qty">${qty} x Rp ${hargaSat.toLocaleString("id-ID")}</span>
                        </div>
                        <span class="detail-item__subtotal">Rp ${subtotal.toLocaleString("id-ID")}</span>
                    </div>`;
            }).join("");
        }
    }

    // Rincian
    const rTotal = document.getElementById("detailRincianTotal");
    if (rTotal) rTotal.textContent = "Rp " + Number(p.total_bayar || 0).toLocaleString("id-ID");

    const rDiterima = document.getElementById("detailRincianDiterima");
    if (rDiterima) rDiterima.textContent = "Rp " + Number(p.uang_diterima || 0).toLocaleString("id-ID");

    const rKembalian = document.getElementById("detailRincianKembalian");
    if (rKembalian) rKembalian.textContent = "Rp " + Number(p.uang_kembalian || 0).toLocaleString("id-ID");
}

/* ---------- Event: tombol cetak (placeholder) ---------- */
if (!window._detailTransaksiBound) {
    window._detailTransaksiBound = true;

    document.addEventListener("click", function (e) {
        if (!document.querySelector(".page--detail-transaksi")) return;

        const cetak = e.target.closest("#btnCetakStruk");
        if (cetak) {
            e.preventDefault();
            // Fitur cetak belum diimplementasikan
            return;
        }
    });
}

/* ---------- Init ---------- */
async function initDataDetailTransaksi() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "";

    if (!id) {
        _renderDetailTransaksi(null);
        return;
    }

    try {
        _detailTransaksiCache = await _loadDetailTransaksi(id);
        _renderDetailTransaksi(_detailTransaksiCache);
    } catch (err) {
        console.error("[detail-transaksi] Gagal memuat:", err);
        _renderDetailTransaksi(null);
    }
}