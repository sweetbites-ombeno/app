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

    const details = await db.penjualan_detail
        .where("penjualan").equals(id)
        .filter(d => !d.deleted_at)
        .toArray();
    details.sort((a, b) => (a.order || 0) - (b.order || 0));

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

    const isRefund = p.status === 3;

    // Header kode
    const kodeEl = document.getElementById("detailKode");
    if (kodeEl) kodeEl.textContent = p.kode || "-";

    // ---- Status card ----
    const statusCard = document.getElementById("detailStatusCard");
    const statusIcon = document.getElementById("detailStatusIcon");
    const statusTitle = document.getElementById("detailStatusTitle");
    const tanggalEl = document.getElementById("detailTanggal");
    const alasanEl = document.getElementById("detailAlasan");

    if (statusCard) {
        statusCard.classList.toggle("is-refund", isRefund);
    }
    if (statusIcon) {
        statusIcon.innerHTML = isRefund
            ? '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>';
    }
    if (statusTitle) {
        statusTitle.textContent = isRefund ? "Refund Dana" : "Pembayaran Lunas";
    }
    if (tanggalEl) {
        tanggalEl.textContent = _formatTanggalLengkap(p.tanggal_jual);
    }
    if (alasanEl) {
        if (isRefund && p.alasan) {
            alasanEl.hidden = false;
            alasanEl.textContent = p.alasan;
        } else {
            alasanEl.hidden = true;
            alasanEl.textContent = "";
        }
    }

    const totalEl = document.getElementById("detailTotal");
    if (totalEl) totalEl.textContent = "Rp " + Number(p.total_bayar || 0).toLocaleString("id-ID");

    // Info order
    const custEl = document.getElementById("detailCustomer");
    if (custEl) custEl.textContent = p.name_customer || "-";

    const telpEl = document.getElementById("detailTelp");
    if (telpEl) telpEl.textContent = p.telp_customer || "-";

    const methodEl = document.getElementById("detailMethod");
    if (methodEl) methodEl.textContent = _methodLabel(p.method_bayar);

    const buktiBtn = document.getElementById("detailBuktiBtn");
    if (buktiBtn) {
        const isNonCash = (p.method_bayar === "qris" || p.method_bayar === "transfer");
        const hasImg = !!p.img_bayar_base64;

        if (isNonCash && hasImg) {
            buktiBtn.hidden = false;
            buktiBtn.dataset.img = p.img_bayar_base64;
            buktiBtn.dataset.kode = p.kode || "";
        } else {
            buktiBtn.hidden = true;
            delete buktiBtn.dataset.img;
            delete buktiBtn.dataset.kode;
        }
    }

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

    // ---- Tombol aksi: sembunyikan refund kalau sudah refund ----
    const btnRefund = document.getElementById("btnRefundTransaksi");
    if (btnRefund) {
        const userId = sessionStorage.getItem("login");
        const isOwner = p.id_user === userId;
        btnRefund.hidden = !(isOwner && p.status === 1);
    }
}

/* ============================================
   POPUP REFUND — open / close / validasi
   ============================================ */
function _openRefundModal() {
    if (!_detailTransaksiCache) return;
    const p = _detailTransaksiCache;

    const userId = sessionStorage.getItem("login");
    if (!userId) return;

    // Hanya pemilik transaksi & status 1 (lunas) yang bisa refund
    if (p.id_user !== userId) return;
    if (p.status !== 1) return;

    const modal = document.getElementById("refundModal");
    if (!modal) return;

    // Isi rincian
    const kodeEl = document.getElementById("refundKode");
    if (kodeEl) kodeEl.textContent = p.kode || "-";

    const tanggalEl = document.getElementById("refundTanggal");
    if (tanggalEl) tanggalEl.textContent = _formatTanggalJam(p.tanggal_jual);

    const itemEl = document.getElementById("refundJumlahItem");
    if (itemEl) itemEl.textContent = `${p._totalItems || 0} item`;

    const metodeEl = document.getElementById("refundMetode");
    if (metodeEl) metodeEl.textContent = _methodLabel(p.method_bayar);

    const totalEl = document.getElementById("refundTotal");
    if (totalEl) totalEl.textContent = "Rp " + Number(p.total_bayar || 0).toLocaleString("id-ID");

    // Reset form
    const radios = modal.querySelectorAll("input[name='refundReason']");
    radios.forEach(function (r) { r.checked = false; });

    const catatan = document.getElementById("refundCatatan");
    if (catatan) {
        catatan.value = "";
        catatan.disabled = true;
    }

    const errorEl = document.getElementById("refundError");
    if (errorEl) errorEl.textContent = "";

    const btnConfirm = document.getElementById("btnRefundConfirm");
    if (btnConfirm) btnConfirm.disabled = true;

    modal.hidden = false;
    document.body.classList.add("modal-open");

    // Bind events sekali saja per pembukaan
    _bindRefundModalEvents();
}

function _closeRefundModal() {
    const modal = document.getElementById("refundModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
}

let _refundBound = false;

function _bindRefundModalEvents() {
    if (_refundBound) {
        // tetap update validasi (jaga-jaga)
        _updateRefundValidation();
        return;
    }
    _refundBound = true;

    const modal = document.getElementById("refundModal");
    if (!modal) return;

    // Radio change → enable/disable textarea + validasi
    modal.addEventListener("change", function (e) {
        const radio = e.target.closest("input[name='refundReason']");
        if (!radio) return;

        const catatan = document.getElementById("refundCatatan");
        if (catatan) {
            if (radio.value === "Lainnya") {
                catatan.disabled = false;
                catatan.focus();
            } else {
                catatan.disabled = true;
                catatan.value = "";
            }
        }
        _updateRefundValidation();
    });

    // Textarea input → validasi
    modal.addEventListener("input", function (e) {
        if (e.target.closest("#refundCatatan")) {
            _updateRefundValidation();
        }
    });

    // Batal
    modal.addEventListener("click", function (e) {
        if (e.target.closest("#btnRefundBatal")) {
            e.preventDefault();
            _closeRefundModal();
            return;
        }
        // Klik backdrop
        if (e.target === modal) {
            _closeRefundModal();
            return;
        }
        // Konfirmasi refund
        if (e.target.closest("#btnRefundConfirm")) {
            e.preventDefault();
            _prosesRefund();
            return;
        }
    });
}

function _updateRefundValidation() {
    const modal = document.getElementById("refundModal");
    if (!modal) return;

    const selected = modal.querySelector("input[name='refundReason']:checked");
    const catatan = document.getElementById("refundCatatan");
    const btnConfirm = document.getElementById("btnRefundConfirm");
    const errorEl = document.getElementById("refundError");
    if (!btnConfirm) return;

    let valid = false;
    if (selected) {
        if (selected.value === "Lainnya") {
            valid = !!(catatan && catatan.value.trim());
        } else {
            valid = true;
        }
    }

    btnConfirm.disabled = !valid;
    if (valid && errorEl) errorEl.textContent = "";
}

async function _prosesRefund() {
    if (!_detailTransaksiCache) return;
    const p = _detailTransaksiCache;

    const userId = sessionStorage.getItem("login");
    if (!userId) {
        openInfoPopup("Sesi login habis.", {
            title: "Sesi Habis", icon: "danger"
        });
        return;
    }

    // Validasi kepemilikan & status
    if (p.id_user !== userId) {
        openInfoPopup("Transaksi ini bukan milik akun Anda.", {
            title: "Akses Ditolak", icon: "danger"
        });
        return;
    }
    if (p.status !== 1) return;

    const modal = document.getElementById("refundModal");
    if (!modal) return;

    const selected = modal.querySelector("input[name='refundReason']:checked");
    const catatan = document.getElementById("refundCatatan");
    const errorEl = document.getElementById("refundError");
    const btnConfirm = document.getElementById("btnRefundConfirm");

    if (!selected) {
        if (errorEl) errorEl.textContent = "Pilih alasan refund terlebih dahulu.";
        return;
    }

    let alasan = selected.value;
    if (selected.value === "Lainnya") {
        const note = catatan ? catatan.value.trim() : "";
        if (!note) {
            if (errorEl) errorEl.textContent = "Catatan wajib diisi untuk alasan Lainnya.";
            return;
        }
        alasan = "Lainnya: " + note;
    }

    if (btnConfirm) btnConfirm.disabled = true;

    try {
        if (!userId) throw new Error("Sesi login habis.");

        const now = new Date().toISOString();

        // Update status → 3 (refund), simpan alasan
        await db.penjualan.update(p.id, {
            status: 3,
            alasan: alasan,
            updated_at: now
        });

        // Update cache
        p.status = 3;
        p.alasan = alasan;
        p.updated_at = now;

        _closeRefundModal();

        // Re-render halaman detail (status card berubah merah)
        _renderDetailTransaksi(p);

        // Tampilkan notifikasi sukses
        if (typeof openInfoPopup === "function") {
            openInfoPopup(
                "Refund berhasil diproses. Pendapatan telah dikurangi.",
                { title: "Refund Berhasil", icon: "success", button: "Mengerti" }
            );
        }
    } catch (err) {
        console.error("[detail-transaksi] Gagal refund:", err);
        if (errorEl) errorEl.textContent = "Gagal memproses refund: " + (err.message || "Terjadi kesalahan");
        if (btnConfirm) btnConfirm.disabled = false;
    }
}

/* ---------- Event: tombol bukti bayar & refund ---------- */
if (!window._detailTransaksiBound) {
    window._detailTransaksiBound = true;

    document.addEventListener("click", function (e) {
        if (!document.querySelector(".page--detail-transaksi")) return;

        // Tombol bukti bayar
        const buktiBtn = e.target.closest("#detailBuktiBtn");
        if (buktiBtn && !buktiBtn.hidden) {
            e.preventDefault();
            const src = buktiBtn.dataset.img || "";
            if (!src) return;
            if (typeof openImagePreview === "function") {
                openImagePreview(src, "Bukti Pembayaran " + (buktiBtn.dataset.kode || ""));
            } else {
                openInfoPopup("Fitur pratinjau gambar tidak tersedia.", {
                    title: "Tidak Tersedia",
                    icon: "warning"
                });
            }
            return;
        }

        // Tombol refund
        const refundBtn = e.target.closest("#btnRefundTransaksi");
        if (refundBtn && !refundBtn.hidden) {
            e.preventDefault();
            _openRefundModal();
            return;
        }

        // Tombol cetak struk (placeholder)
        const cetak = e.target.closest("#btnCetakStruk");
        if (cetak) {
            e.preventDefault();
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