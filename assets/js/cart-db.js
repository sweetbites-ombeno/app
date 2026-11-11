/* ============================================
   CART-DB.JS
   Sinkronisasi keranjang (sessionStorage) ↔ tabel penjualan & penjualan_detail
   Status: 0 = menunggu pembayaran (draft), 1 = lunas, 2 = simpan pesanan, 3 = batal

   ISOLASI PER USER (single-tab):
   - Semua key sessionStorage di-prefix dengan userId
   - Draft penjualan milik user lain tidak akan tersentuh
   - Draft orphan (sisa tab ditutup tanpa logout) dibersihkan saat initApp
   ============================================ */

/* ============================================
STOK — helper
============================================ */

/**
 * Kurangi stok untuk detail penjualan tertentu.
 * @param {Array} details - array penjualan_detail
 * @returns {Promise<void>}
 */
async function _kurangiStok(details) {
  if (!details || details.length === 0) return;
  await db.transaction("rw", db.produk, async function () {
    for (const d of details) {
      if (!d.id_product) continue;
      const produk = await db.produk.get(d.id_product);
      if (!produk || produk.deleted_at) continue;
      const stokBaru = Math.max(0, (Number(produk.stok) || 0) - (Number(d.qty) || 0));
      await db.produk.update(produk.id, {
        stok: stokBaru,
        updated_at: new Date().toISOString()
      });
    }
  });
}

/**
 * Kembalikan stok untuk detail penjualan tertentu.
 * @param {Array} details
 */
async function _kembalikanStok(details) {
  if (!details || details.length === 0) return;
  await db.transaction("rw", db.produk, async function () {
    for (const d of details) {
      if (!d.id_product) continue;
      const produk = await db.produk.get(d.id_product);
      if (!produk || produk.deleted_at) continue;
      const stokBaru = (Number(produk.stok) || 0) + (Number(d.qty) || 0);
      await db.produk.update(produk.id, {
        stok: stokBaru,
        updated_at: new Date().toISOString()
      });
    }
  });
}


/* ---------- Helper key per-user ---------- */

function _currentUserId() {
  return sessionStorage.getItem("login") || "anon";
}

/** Key sessionStorage untuk cart per user: "cart:<userId>" */
function _cartKey() {
  return `cart:${_currentUserId()}`;
}

/** Key sessionStorage untuk id draft penjualan per user: "cartOrderId:<userId>" */
function _draftOrderKey() {
  return `cartOrderId:${_currentUserId()}`;
}

/* ---------- Helper umum ---------- */

function _pad2(n) { return String(n).padStart(2, "0"); }

function buildKodePenjualan(username) {
  const d = new Date();
  return `S-${username}-${d.getFullYear()}${_pad2(d.getMonth() + 1)}${_pad2(d.getDate())}`
    + `${_pad2(d.getHours())}${_pad2(d.getMinutes())}${_pad2(d.getSeconds())}`;
}

/** Kode unik: kalau sudah ada, tambah suffix -1, -2, ... */
async function ensureUniqueKode(baseKode) {
  let kode = baseKode;
  let counter = 0;
  while (await db.penjualan.where("kode").equals(kode).count()) {
    counter++;
    kode = `${baseKode}-${counter}`;
  }
  return kode;
}

async function getCustomerUmum() {
  let customer = await db.customer
    .filter(c => !c.deleted_at && (c.name || "").toLowerCase() === "umum")
    .first();
  if (!customer) {
    customer = {
      id: crypto.randomUUID(),
      name: "Umum",
      no_telp: "-",
      created_at: new Date().toISOString()
    };
    await db.customer.add(customer);
  }
  return customer;
}

/* ---------- Ambil / buat draft penjualan aktif ---------- */

/**
 * Mengembalikan record penjualan draft (status 0) yang aktif MILIK USER LOGIN.
 * Jika belum ada, buat baru.
 */
async function getOrCreateDraftPenjualan() {
  const userId = sessionStorage.getItem("login");
  if (!userId) throw new Error("Sesi login habis.");

  // 1) Cek draft id yang tersimpan di session (per-user key)
  const existingId = sessionStorage.getItem(_draftOrderKey());
  if (existingId) {
    const existing = await db.penjualan.get(existingId);
    if (
      existing &&
      !existing.deleted_at &&
      existing.status === 0 &&
      existing.id_user === userId         // proteksi: draft harus milik user ini
    ) {
      return existing;
    }
    sessionStorage.removeItem(_draftOrderKey());
  }

  // 2) Buat draft baru
  const user = await db.user.get(userId);
  if (!user) throw new Error("User tidak ditemukan.");

  const customer = await getCustomerUmum();
  const now = new Date().toISOString();
  const baseKode = buildKodePenjualan(user.username);
  const kode = await ensureUniqueKode(baseKode);

  const newId = crypto.randomUUID();
  await db.penjualan.add({
    id: newId,
    kode: kode,
    total_bayar: 0,
    uang_diterima: 0,
    uang_kembalian: 0,
    id_customer: customer.id,
    name_customer: customer.name,
    telp_customer: customer.no_telp || "-",
    tanggal_jual: "",        // ← kosong sampai lunas (status 1)
    tanggal_pesan: "",       // ← kosong sampai simpan pesanan (status 2)
    status: 0,
    method_bayar: "tunai",
    img_bayar_base64: "",
    id_user: userId,
    created_at: now
  });

  sessionStorage.setItem(_draftOrderKey(), newId);
  return await db.penjualan.get(newId);
}

/* ---------- Sinkronisasi penjualan_detail dari cart ---------- */

async function syncCartToDB(cart, produkCache, kategoriMap) {
  const userId = sessionStorage.getItem("login");
  if (!userId) return null;

  // ---- 1) Filter cart yang valid ----
  const validEntries = [];
  Object.keys(cart || {}).forEach(function (id) {
    const qty = Math.max(0, Math.floor(cart[id] || 0));
    if (qty <= 0) return;
    const p = produkCache.find(x => x.id === id);
    if (!p) return;
    validEntries.push({ id: id, qty: qty, produk: p });
  });

  // ---- 2) Cart kosong → HARD DELETE draft milik user ini saja ----
  if (validEntries.length === 0) {
    const draftId = sessionStorage.getItem(_draftOrderKey());
    if (draftId) {
      try {
        await db.transaction("rw", db.penjualan, db.penjualan_detail, async function () {
          const p = await db.penjualan.get(draftId);
          if (!p || p.status !== 0 || p.id_user !== userId) return;

          const details = await db.penjualan_detail
            .where("penjualan").equals(draftId)
            .toArray();
          if (details.length > 0) {
            await db.penjualan_detail.bulkDelete(details.map(d => d.id));
          }
          await db.penjualan.delete(draftId);
        });
      } catch (err) {
        console.warn("[cart-db] gagal hapus draft kosong:", err);
      }
    }
    sessionStorage.removeItem(_draftOrderKey());
    return null;
  }

  // ---- 3) Ada isi → pastikan draft ada ----
  const penjualan = await getOrCreateDraftPenjualan();
  const penjualanId = penjualan.id;

  if (penjualan.id_user !== userId) {
    throw new Error("Draft penjualan milik user lain. Tidak boleh disentuh.");
  }

  // ---- 4) Ambil detail lama ----
  const existingDetails = await db.penjualan_detail
    .where("penjualan").equals(penjualanId)
    .toArray();

  const existingByProduct = {};
  existingDetails.forEach(d => { existingByProduct[d.id_product] = d; });

  const now = new Date().toISOString();
  let totalBayar = 0;
  const seenIds = {};

  // ---- 5) Semua operasi dalam 1 transaksi ----
  await db.transaction("rw", db.penjualan, db.penjualan_detail, async function () {

    // 5a) INSERT / UPDATE
    let orderIdx = 0;
    for (const entry of validEntries) {
      orderIdx++;
      const { id, qty, produk } = entry;
      seenIds[id] = true;

      const hargaSatuan = Number(produk.harga_jual || 0);
      const total = hargaSatuan * qty;
      totalBayar += total;

      if (existingByProduct[id]) {
        const d = existingByProduct[id];
        await db.penjualan_detail.update(d.id, {
          qty: qty,
          harga_satuan: hargaSatuan,
          total: total,
          order: orderIdx,
          name_product: produk.name || d.name_product || "",
          id_kategori: produk.kategori || d.id_kategori || "",
          name_kategori: kategoriMap[produk.kategori] || d.name_kategori || "",
          updated_at: now
        });
      } else {
        await db.penjualan_detail.add({
          id: crypto.randomUUID(),
          penjualan: penjualanId,
          id_product: produk.id,
          name_product: produk.name || "",
          id_kategori: produk.kategori || "",
          name_kategori: kategoriMap[produk.kategori] || "",
          qty: qty,
          harga_satuan: hargaSatuan,
          total: total,
          order: orderIdx,
          id_user: userId,
          created_at: now
        });
      }
    }

    // 5b) HARD DELETE detail yang tidak ada di cart
    const toDelete = existingDetails.filter(d => !seenIds[d.id_product]);
    if (toDelete.length > 0) {
      await db.penjualan_detail.bulkDelete(toDelete.map(d => d.id));
    }

    // 5c) Reset ulang order 1..N
    const finalDetails = await db.penjualan_detail
      .where("penjualan").equals(penjualanId)
      .toArray();
    finalDetails.sort((a, b) => (a.order || 0) - (b.order || 0));
    let seq = 0;
    for (const d of finalDetails) {
      seq++;
      if (d.order !== seq) {
        await db.penjualan_detail.update(d.id, { order: seq });
      }
    }

    // 5d) Update total_bayar
    await db.penjualan.update(penjualanId, {
      total_bayar: totalBayar,
      updated_at: now
    });
  });

  return penjualanId;
}

/* ---------- Update method_bayar draft ---------- */

async function updateDraftMethod(method) {
  if (!["tunai", "qris", "transfer"].includes(method)) return;

  const userId = sessionStorage.getItem("login");
  if (!userId) return;

  const draftId = sessionStorage.getItem(_draftOrderKey());
  if (!draftId) return;

  try {
    const penjualan = await db.penjualan.get(draftId);
    if (!penjualan || penjualan.status !== 0 || penjualan.id_user !== userId) return;
    if (penjualan.method_bayar === method) return;

    await db.penjualan.update(draftId, {
      method_bayar: method,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn("[cart-db] gagal update method_bayar:", err);
  }
}

/* ---------- Finalisasi saat pembayaran ---------- */

async function finalizePayment(opts) {
  const userId = sessionStorage.getItem("login");
  if (!userId) throw new Error("Sesi login habis.");

  const penjualanId = sessionStorage.getItem(_draftOrderKey());
  if (!penjualanId) {
    throw new Error("Tidak ada draft penjualan. Keranjang kosong.");
  }

  const penjualan = await db.penjualan.get(penjualanId);
  if (!penjualan) throw new Error("Draft penjualan tidak ditemukan.");
  if (penjualan.status !== 0) throw new Error("Pesanan sudah diproses.");
  if (penjualan.id_user !== userId) {
    throw new Error("Draft penjualan milik user lain.");
  }

  const now = new Date().toISOString();

  await db.penjualan.update(penjualanId, {
    uang_diterima: opts.uangDiterima,
    uang_kembalian: opts.uangKembalian,
    method_bayar: opts.method,
    img_bayar_base64: opts.imgBase64 || "",
    status: 1,
    tanggal_jual: now,
    updated_at: now
  });

  // Kurangi stok (selalu, karena belum dikurangi untuk status 0)
  try {
    const details = await db.penjualan_detail
      .where("penjualan").equals(penjualanId)
      .filter(d => !d.deleted_at)
      .toArray();
    await _kurangiStok(details);
  } catch (e) {
    console.warn("[cart-db] gagal kurangi stok:", e);
  }

  sessionStorage.removeItem(_draftOrderKey());
  sessionStorage.removeItem(_cartKey());

  return await db.penjualan.get(penjualanId);
}

/* ---------- Bersihkan draft (mis. logout) ---------- */

async function clearDraftPenjualan() {
  const userId = sessionStorage.getItem("login");
  if (!userId) return;

  const id = sessionStorage.getItem(_draftOrderKey());
  if (!id) {
    sessionStorage.removeItem(_cartKey());
    return;
  }

  try {
    await db.transaction("rw", db.penjualan, db.penjualan_detail, async function () {
      const penjualan = await db.penjualan.get(id);
      if (!penjualan || penjualan.status !== 0 || penjualan.id_user !== userId) return;

      const details = await db.penjualan_detail
        .where("penjualan").equals(id)
        .toArray();
      if (details.length > 0) {
        await db.penjualan_detail.bulkDelete(details.map(d => d.id));
      }
      await db.penjualan.delete(id);
    });
  } catch (e) {
    console.warn("[cart-db] clearDraft:", e);
  }
  sessionStorage.removeItem(_draftOrderKey());
  sessionStorage.removeItem(_cartKey());
}

/* ============================================
   ⬇️ BERSIHKAN DRAFT ORPHAN (single-tab)
   ============================================ */

/**
 * Hapus SEMUA draft (status 0) milik user yang sedang login,
 * KECUALI draft yang sedang aktif di tab ini.
 *
 * Dipanggil saat initApp. Tujuan:
 *   - Tab ditutup tanpa logout → sessionStorage hilang, tapi draft tersisa di DB
 *   - User buka lagi → draft lama jadi sampah. Fungsi ini membersihkannya.
 *
 * Karena Anda fokus single-tab per device, ini aman (tidak ada tab lain
 * yang mungkin sedang memakai draft milik user ini).
 *
 * @returns {Promise<number>} jumlah draft yang dihapus
 */
async function bersihkanDraftOrphan() {
  const userId = sessionStorage.getItem("login");
  if (!userId) return 0;

  const activeDraftId = sessionStorage.getItem(_draftOrderKey());
  let deleted = 0;

  try {
    const drafts = await db.penjualan
      .filter(p => !p.deleted_at && p.status === 0 && p.id_user === userId)
      .toArray();

    for (const d of drafts) {
      if (d.id === activeDraftId) continue; // draft aktif → jangan sentuh

      await db.transaction("rw", db.penjualan, db.penjualan_detail, async function () {
        const details = await db.penjualan_detail
          .where("penjualan").equals(d.id)
          .toArray();
        if (details.length > 0) {
          await db.penjualan_detail.bulkDelete(details.map(x => x.id));
        }
        await db.penjualan.delete(d.id);
      });

      deleted++;
    }

    if (deleted > 0) {
      console.info(`[cart-db] Bersihkan ${deleted} draft orphan milik user ${userId}`);
    }
  } catch (e) {
    console.warn("[cart-db] bersihkanDraftOrphan:", e);
  }

  return deleted;
}

/* ---------- Expose ke global ---------- */

window._cartKey = _cartKey;
window._draftOrderKey = _draftOrderKey;
window.syncCartToDB = syncCartToDB;
window.updateDraftMethod = updateDraftMethod;
window.finalizePayment = finalizePayment;
window.clearDraftPenjualan = clearDraftPenjualan;
window.getOrCreateDraftPenjualan = getOrCreateDraftPenjualan;
window.bersihkanDraftOrphan = bersihkanDraftOrphan;
window._kurangiStok = _kurangiStok;
window._kembalikanStok = _kembalikanStok;
