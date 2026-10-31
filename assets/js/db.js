const db = new Dexie('posDB');

db.version(1).stores({
    user: 'id, name, username, password, created_at, updated_at, deleted_at',
    customer: 'id, name, no_telp, created_at, updated_at, deleted_at',
    kategori: 'id, name, created_at, updated_at, deleted_at',
    produk: 'id, name, kategori, harga_jual, image_base64, created_at, updated_at, deleted_at',
    pembelian: 'id, kode, total, tempat, tanggal_beli, created_at, updated_at, deleted_at',
    pembelian_detail: 'id, pembelian, name_item, qty, satuan, harga_satuan, total, order, created_at, updated_at, deleted_at',
    penjualan: 'id, kode, total, customer, tanggal_jual, status, created_at, updated_at, deleted_at',
    penjualan_detail: 'id, penjualan, id_product, name_product, id_kategori, name_kategori, qty, harga_satuan, total, order, created_at, updated_at, deleted_at',
    backup_db: 'id, tanggal, date_now, status, created_at, updated_at, deleted_at',
});

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
async function cekBackupHarian() {
  // cegah dobel-trigger (mis. navigateTo dipanggil cepat berkali-kali)
  if (_backupCheckRunning) return;
  _backupCheckRunning = true;

  try {
    const row = await ensureBackupRow();

    if (row.status === '1') {
      // sudah backup hari ini → tidak perlu apa-apa
      return;
    }

    // belum backup → konfirmasi
    const mau = confirm(
      'Belum ada backup data hari ini.\n\n' +
      'Backup sekarang?\n' +
      '(Klik Batal untuk melewati hari ini)'
    );

    if (!mau) {
      // user menolak → biarkan status '0', alert akan muncul lagi
      // saat halaman berikutnya dibuka (atau refresh)
      return;
    }

    // jalankan backup
    if (typeof backupDatabase !== 'function') {
      alert('Fungsi backup tidak tersedia.');
      return;
    }
    await backupDatabase();

    // tandai sudah backup hari ini
    await db.backup_db.update(BACKUP_ROW_ID, {
      status: '1',
      date_now: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[backup-harian] Gagal:', err);
  } finally {
    _backupCheckRunning = false;
  }
}
