const db = new Dexie('posDB');

db.version(1).stores({
    user: 'id, name, username, password, status, created_at, updated_at, deleted_at',
    customer: 'id, name, no_telp, created_at, updated_at, deleted_at',
    kategori: 'id, name, created_at, updated_at, deleted_at',
    produk: 'id, name, kategori, harga_jual, image_base64, id_user, created_at, updated_at, deleted_at',
    pembelian: 'id, kode, total, tempat, tanggal_beli, id_user, created_at, updated_at, deleted_at',
    pembelian_detail: 'id, pembelian, name_item, qty, satuan, harga_satuan, total, order, created_at, updated_at, deleted_at',
    penjualan: 'id, kode, total_bayar, uang_diterima, uang_kembalian, id_customer, name_customer, telp_customer, tanggal_jual, status, method_bayar, img_bayar_base64, id_user, created_at, updated_at, deleted_at',
    penjualan_detail: 'id, penjualan, id_product, name_product, id_kategori, name_kategori, qty, harga_satuan, total, order, id_user, created_at, updated_at, deleted_at',
    backup_db: 'id, tanggal, date_now, status, created_at, updated_at, deleted_at',
});

// penjelasan
// status penjualan = (0 : menuggu pembayaran, 1 : lunas, 2:  simpan pesanan, 3:batal)
// untuk id_customer, name_customer, telp_customer penjualan default cari dari customer yang namanya = 'Umum'
// kode penjualan diisi dengan format S-username-tanggaljammenitdetik contoh 20261124191230
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
    if (!modal || !btn) { alert('Belum ada backup hari ini.'); resolve(); return; }

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
            alert('Fungsi backup tidak tersedia.');
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
