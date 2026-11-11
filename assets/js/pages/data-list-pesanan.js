/* ============================================
   HALAMAN LIST PESANAN (draft status = 2)
   ============================================ */

let _listPesananCache = [];
let _listPesananFilterCustomer = "";
let _listPesananFilterTanggal = "";
let _listPesananSort = "dekat"; // "baru" | "lama"
let _listPesananExpanded = {}; // { id: true }

async function _loadDraftPesanan() {
    const userId = sessionStorage.getItem("login");
    if (!userId) return [];

    const rows = await db.penjualan
        .filter(p => !p.deleted_at && p.status === 2 && p.id_user === userId)
        .toArray();

    // Ambil semua produk (termasuk yang sudah dihapus, supaya gambar lama tetap tampil)
    let produkMap = {};
    try {
        const produkRows = await db.produk.toArray();
        produkRows.forEach(function (pr) { produkMap[pr.id] = pr; });
    } catch (e) {
        console.warn("[list-pesanan] Gagal load produk:", e);
    }

    for (const p of rows) {
        p._details = await db.penjualan_detail
            .where("penjualan").equals(p.id)
            .filter(d => !d.deleted_at)
            .toArray();
        p._details.sort((a, b) => (a.order || 0) - (b.order || 0));

        // ⬇️ Tempelkan image_base64 dari produk ke tiap detail
        p._details.forEach(function (d) {
            const pr = produkMap[d.id_product];
            d.img_product = pr && pr.image_base64 ? pr.image_base64 : "";
        });

        p._totalItems = p._details.reduce((s, d) => s + (d.qty || 0), 0);
        p._totalHarga = p._details.reduce((s, d) => s + (d.total || 0), 0);
    }
    return rows;
}

function _formatTanggalSingkat(str) {
    if (!str) return "-";
    const d = new Date(str);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric", month: "short", year: "numeric"
    }).format(d);
}

function _renderListPesanan() {
    const container = document.getElementById("listPesananCards");
    const emptyEl = document.getElementById("listPesananEmpty");
    const summaryEl = document.getElementById("listPesananSummary");
    if (!container) return;

    const qCust = _listPesananFilterCustomer.trim().toLowerCase();
    const qTgl = _listPesananFilterTanggal; // "YYYY-MM-DD"

    let filtered = _listPesananCache.filter(p => {
        if (qCust && !(p.name_customer || "").toLowerCase().includes(qCust)) return false;
        if (qTgl && p.tanggal_pesan !== qTgl) return false;
        return true;
    });

    // Sort
    // "dekat" = tanggal paling awal dulu (11, 12, 13)
    // "jauh"  = tanggal paling akhir dulu (13, 12, 11)
    filtered.sort((a, b) => {
        const ta = a.tanggal_pesan || "";
        const tb = b.tanggal_pesan || "";
        if (!ta && !tb) return 0;
        if (!ta) return 1;    // yang kosong selalu di bawah
        if (!tb) return -1;
        return _listPesananSort === "dekat" ? ta.localeCompare(tb) : tb.localeCompare(ta);
    });

    // Summary
    if (summaryEl) {
        const totalAll = filtered.reduce((s, p) => s + (p._totalHarga || 0), 0);
        summaryEl.innerHTML = `
      <i class="fa-solid fa-receipt" aria-hidden="true"></i>
      <span>Ada <strong>${filtered.length}</strong> draft dengan total pesanan 
        <strong>Rp ${totalAll.toLocaleString("id-ID")}</strong></span>
    `;
    }

    if (filtered.length === 0) {
        container.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    container.innerHTML = filtered.map(p => {
        const expanded = !!_listPesananExpanded[p.id];
        const tanggalStr = _formatTanggalSingkat(p.tanggal_pesan);
        const initials = (p.name_customer || "?").trim().charAt(0).toUpperCase();

        const detailsHTML = p._details.map(d => {
            const subtotal = (d.total || 0).toLocaleString("id-ID");
            const hargaSat = (d.harga_satuan || 0).toLocaleString("id-ID");
            const imgHTML = d.img_product
                ? `<img class="lp-detail__img" src="${d.img_product}" alt="">`
                : `<div class="lp-detail__img lp-detail__img--empty">
             <i class="fa-regular fa-image"></i></div>`;
            return `
        <div class="lp-detail">
          ${imgHTML}
          <div class="lp-detail__body">
            <span class="lp-detail__name">${escapeHTML(d.name_product || "")}</span>
            <span class="lp-detail__qty">${d.qty || 0} x Rp ${hargaSat}</span>
          </div>
          <span class="lp-detail__subtotal">Rp ${subtotal}</span>
        </div>`;
        }).join("");

        return `
      <div class="lp-card${expanded ? " is-open" : ""}" data-id="${p.id}">
        <button type="button" class="lp-card__head" data-action="lp-toggle" data-id="${p.id}">
          <div class="lp-card__avatar">${escapeHTML(initials)}</div>
          <div class="lp-card__info">
            <span class="lp-card__name">${escapeHTML(p.name_customer || "-")}</span>
            <span class="lp-card__meta">
              ${p._totalItems} item &middot; ${tanggalStr}
            </span>
          </div>
          <span class="lp-card__total">Rp ${(p._totalHarga || 0).toLocaleString("id-ID")}</span>
          <i class="fa-solid fa-chevron-down lp-card__chevron" aria-hidden="true"></i>
        </button>
        <div class="lp-card__body" ${expanded ? "" : "hidden"}>
          <div class="lp-details">${detailsHTML || '<p class="lp-detail__empty">Tidak ada item.</p>'}</div>
          <div class="lp-actions">
            <button type="button" class="btn-danger lp-actions__btn"
                    data-action="lp-delete" data-id="${p.id}"
                    data-name="${escapeHTML(p.name_customer || "")}">
              <i class="fa-solid fa-trash" aria-hidden="true"></i> Hapus
            </button>
            <button type="button" class="btn-primary lp-actions__btn"
                    data-action="lp-bayar" data-id="${p.id}">
              <i class="fa-solid fa-cash-register" aria-hidden="true"></i> Bayar
            </button>
          </div>
        </div>
      </div>`;
    }).join("");
}

/* ---------- Bayar dari List ---------- */
async function _bayarDariList(id) {
    // ============================================
    // 1) VALIDASI SESI & DATA
    // ============================================
    const userId = sessionStorage.getItem("login");
    if (!userId) {
      openInfoPopup("Sesi login habis. Silakan login ulang.", {
        title: "Sesi Habis", icon: "danger"
      });
      return;
    }

    const p = await db.penjualan.get(id);
    if (!p || p.deleted_at) {
      openInfoPopup("Pesanan tidak ditemukan.", {
        title: "Tidak Ditemukan", icon: "danger"
      });
      return;
    }
    if (p.id_user !== userId) {
      openInfoPopup("Pesanan bukan milik akun ini.", {
        title: "Akses Ditolak", icon: "danger"
      });
      return;
    }
    if (p.status !== 2) {
      openInfoPopup("Pesanan sudah diproses.", {
        title: "Sudah Diproses", icon: "warning"
      });
      return;
    }

    // ============================================
    // 2) CEK CART KOSONG
    // ============================================
    const cart = getCart();
    const totalCart = Object.keys(cart).reduce(function (s, k) {
      return s + (cart[k] || 0);
    }, 0);
    if (totalCart > 0) {
      openInfoPopup("Masih ada produk di Keranjang. Selesaikan atau kosongkan dulu.", {
        title: "Keranjang Tidak Kosong", icon: "warning"
      });
      return;
    }

    // ============================================
    // 3) AMBIL DETAIL
    // ============================================
    const details = await db.penjualan_detail
      .where("penjualan").equals(id)
      .filter(d => !d.deleted_at)
      .toArray();

    // ============================================
    // 4) ATOMIC: cek status + kembalikan stok + update status
    //    Semua dalam SATU transaksi
    // ============================================
    const now = new Date().toISOString();
    let updated = false;

    try {
      await db.transaction("rw", db.penjualan, db.produk, async function () {
        // ⬇️ Cek ulang di dalam transaksi (race condition guard)
        const current = await db.penjualan.get(id);
        if (!current || current.deleted_at) return;
        if (current.id_user !== userId) return;
        if (current.status !== 2) return;

        // ⬇️ Kembalikan stok DALAM transaksi yang sama
        for (const d of details) {
          if (!d.id_product) continue;
          const produk = await db.produk.get(d.id_product);
          if (!produk || produk.deleted_at) continue;
          const stokBaru = (Number(produk.stok) || 0) + (Number(d.qty) || 0);
          await db.produk.update(produk.id, {
            stok: stokBaru,
            updated_at: now
          });
        }

        // ⬇️ Update status 2 → 0
        await db.penjualan.update(id, {
          status: 0,
          tanggal_jual: "",
          updated_at: now
        });

        updated = true;
      });
    } catch (err) {
      console.error("[list-pesanan] Gagal bayar dari list:", err);
      openInfoPopup("Gagal memproses pembayaran: " + (err.message || "Terjadi kesalahan"), {
        title: "Gagal Memproses", icon: "danger"
      });
      return;
    }

    if (!updated) {
      // Status berubah di antara cek awal & transaksi
      openInfoPopup("Pesanan sudah diproses di tempat lain.", {
        title: "Sudah Diproses", icon: "warning"
      });
      return;
    }

    // ============================================
    // 5) SET SESSION & CART (di luar transaksi DB)
    // ============================================
    sessionStorage.setItem(_draftOrderKey(), id);

    sessionStorage.setItem("orderFromListOriginal", JSON.stringify({
      id: id,
      id_customer: p.id_customer || "",
      name_customer: p.name_customer || "",
      telp_customer: p.telp_customer || "-",
      tanggal_pesan: p.tanggal_pesan || ""
    }));

    const newCart = {};
    details.forEach(function (d) {
      if (d.id_product && d.qty > 0) {
        newCart[d.id_product] = (newCart[d.id_product] || 0) + d.qty;
      }
    });
    saveCart(newCart);

    sessionStorage.setItem("orderFromList", JSON.stringify({
      id: id,
      name_customer: p.name_customer || "",
      tanggal_pesan: p.tanggal_pesan || ""
    }));

    navigateTo("order");
}

/* ---------- Hapus dari List (HARD DELETE) ---------- */
async function _hapusDariList(id) {
  const userId = sessionStorage.getItem("login");
  if (!userId) return false;

  try {
    const p = await db.penjualan.get(id);
    if (!p || p.deleted_at) return false;
    if (p.status !== 2) return false;
    if (p.id_user !== userId) return false;

    // ⬇️ Ambil detail sebelum delete untuk kembalikan stok
    const details = await db.penjualan_detail
      .where("penjualan").equals(id).toArray();

    // ⬇️ Kembalikan stok
    if (typeof _kembalikanStok === "function") {
      await _kembalikanStok(details);
    }

    await db.transaction("rw", db.penjualan, db.penjualan_detail, async function () {
      if (details.length > 0) {
        await db.penjualan_detail.bulkDelete(details.map(d => d.id));
      }
      await db.penjualan.delete(id);
    });
    return true;
  } catch (err) {
    console.error("[list-pesanan] hapus:", err);
    return false;
  }
}

/* ---------- Event Delegation ---------- */
if (!window._listPesananBound) {
    window._listPesananBound = true;

    document.addEventListener("click", async function (e) {
        if (!document.querySelector(".page--list-pesanan")) return;

        // Toggle expand
        const toggle = e.target.closest("[data-action='lp-toggle']");
        if (toggle) {
            e.preventDefault();
            const id = toggle.dataset.id;
            _listPesananExpanded[id] = !_listPesananExpanded[id];
            _renderListPesanan();
            return;
        }

        // Hapus
        const del = e.target.closest("[data-action='lp-delete']");
        if (del) {
          e.preventDefault();
          const id = del.dataset.id;
          const name = del.dataset.name || "pesanan ini";

          // ⬇️ Pakai popup konfirmasi custom
          if (typeof openConfirmHapusPesanan === "function") {
            openConfirmHapusPesanan({
              name: name,
              onYes: async function () {
                const ok = await _hapusDariList(id);
                if (ok) {
                  _listPesananCache = _listPesananCache.filter(p => p.id !== id);
                  delete _listPesananExpanded[id];
                  _renderListPesanan();
                } else {
                  openInfoPopup(
                    "Pesanan tidak ditemukan atau bukan milik akun ini.",
                    { title: "Akses Ditolak", icon: "danger", button: "Mengerti" }
                  );
                }
              },
              onNo: function () {
                // Batal → tidak melakukan apa-apa
              }
            });
          } else {
            // Fallback kalau fungsi popup tidak tersedia
            if (!confirm(`Hapus pesanan "${name}" secara permanen?`)) return;
            const ok = await _hapusDariList(id);
            if (ok) {
              _listPesananCache = _listPesananCache.filter(p => p.id !== id);
              delete _listPesananExpanded[id];
              _renderListPesanan();
            }
          }
          return;
        }

        // Bayar
        const bayar = e.target.closest("[data-action='lp-bayar']");
        if (bayar) {
            e.preventDefault();
            await _bayarDariList(bayar.dataset.id);
            return;
        }
    });
}

/* ---------- Init ---------- */
async function initDataListPesanan() {
    _listPesananCache = await _loadDraftPesanan();
    _listPesananExpanded = {};
    _listPesananFilterCustomer = "";
    _listPesananFilterTanggal = "";
    _listPesananSort = "dekat";

    // Search customer
    const searchCust = document.getElementById("searchListCustomer");
    if (searchCust) {
        searchCust.value = "";
        searchCust.addEventListener("input", function (e) {
            _listPesananFilterCustomer = e.target.value;
            _renderListPesanan();
        });
    }

    // Search tanggal
    const searchTgl = document.getElementById("searchListTanggal");
    if (searchTgl) {
        searchTgl.value = "";
        searchTgl.addEventListener("change", function (e) {
            _listPesananFilterTanggal = e.target.value;
            _renderListPesanan();
        });
    }

    // Sort badges
    document.querySelectorAll("[data-sort-pesanan]").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.dataset.sortPesanan === _listPesananSort);
        btn.addEventListener("click", function () {
            _listPesananSort = btn.dataset.sortPesanan;
            document.querySelectorAll("[data-sort-pesanan]").forEach(function (b) {
                b.classList.toggle("is-active", b.dataset.sortPesanan === _listPesananSort);
            });
            _renderListPesanan();
        });
    });

    _renderListPesanan();
}
