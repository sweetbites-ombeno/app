/* ============================================
   HALAMAN SETTING
   ============================================ */

async function initSetting() {
    const id = sessionStorage.getItem("login");
    const user = id ? await db.user.get(id) : null;

    if (!user || user.deleted_at) {
        sessionStorage.removeItem("login");
        location.replace("index.html");
        return;
    }

    const name = document.querySelector(".user-card__name");
    const username = document.querySelector(".user-card__username");
    name.textContent = user.name || user.username;
    username.textContent = "@" + user.username;

    // ⬇️ bind modal reset (idempotent via flag)
    _bindResetModal();
}

/* ============================================
   BACKUP DATABASE (export JSON → share/download)
   ============================================ */

async function backupDatabase() {
    // Cek dukungan library
    if (typeof db.export !== "function") {
        alert("Fitur export tidak tersedia. Pastikan dexie-export-import dimuat.");
        return;
    }

    // Tombol loading state (jika dipanggil dari tombol)
    const btn = document.querySelector("[data-action='backup-database']");
    const iconEl = btn ? btn.querySelector(".setting-card__icon i") : null;
    const prevIconClass = iconEl ? iconEl.className : "";
    if (iconEl) iconEl.className = "fa-solid fa-spinner fa-spin";

    try {
        // Export seluruh database → Blob (JSON)
        const blob = await db.export({
            prettyJson: true,
            // skipTables: ["user"]  // ← uncomment kalau tidak ingin user ikut (tidak disarankan, karena restore butuh user)
        });

        // Nama file: backup-posDB-YYYYMMDD-HHMM.json
        const now = new Date();
        const pad = function (n) { return String(n).padStart(2, "0"); };
        const stamp = now.getFullYear()
            + pad(now.getMonth() + 1)
            + pad(now.getDate())
            + "-"
            + pad(now.getHours())
            + pad(now.getMinutes());
        const filename = `backup-posDB-${stamp}.json`;

        const file = new File([blob], filename, { type: "application/json" });

        // 1) Coba Web Share API (mobile: share ke WhatsApp, Drive, dll)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: "Backup Database",
                    text: "File backup database aplikasi POS"
                });
                return; // sukses share
            } catch (err) {
                // User cancel share → tidak perlu fallback, biarkan saja
                if (err && err.name === "AbortError") return;
                // Error lain → lanjut ke download fallback
                console.warn("[backup] Share gagal, fallback ke download:", err);
            }
        }

        // 2) Fallback: download via <a download>
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Bersihkan object URL setelah beberapa detik
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    } catch (err) {
        console.error("[backup] Gagal:", err);
        alert("Gagal membuat backup: " + (err.message || "Terjadi kesalahan"));
    } finally {
        // Kembalikan ikon
        if (iconEl) iconEl.className = prevIconClass;
    }
}

/* ============================================
   RESET DATABASE (hapus semua + skema)
   ============================================ */

function _openResetModal() {
  const modal = document.getElementById('resetModal');
  const step1 = document.getElementById('resetStep1');
  const step2 = document.getElementById('resetStep2');
  if (!modal) return;

  // reset state
  step1.hidden = false;
  step2.hidden = true;
  document.getElementById('resetUsername').value = '';
  document.getElementById('resetPassword').value = '';
  document.getElementById('resetError').textContent = '';

  modal.hidden = false;
}

function _closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.hidden = true;
}

function _showResetStep2() {
  document.getElementById('resetStep1').hidden = true;
  document.getElementById('resetStep2').hidden = false;
  setTimeout(() => {
    document.getElementById('resetUsername').focus();
  }, 100);
}

function _showResetStep1() {
  document.getElementById('resetStep1').hidden = false;
  document.getElementById('resetStep2').hidden = true;
  document.getElementById('resetError').textContent = '';
}

/** Hapus seluruh database + skema, lalu redirect ke login */
async function _hapusDatabaseDanRedirect() {
  _dbDeleting = true;             // ← tambahan
  try {
    try { db.close(); } catch (e) { }   // ← tambahan
    // timeout 5 detik untuk db.delete()
    await Promise.race([
      db.delete(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database masih digunakan di tab lain. Tutup tab lain lalu coba lagi.')), 5000)
      )
    ]);

    // fallback defensif — hanya jika API tersedia
    try {
      if (indexedDB.databases) {
        const sisa = await indexedDB.databases();
        for (const d of sisa) {
          if (d.name === 'posDB') {
            await new Promise((resolve) => {
              const req = indexedDB.deleteDatabase(d.name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            });
          }
        }
      }
    } catch (e) {
      console.warn('[reset] skip indexedDB.databases():', e);
    }

    try { localStorage.removeItem('produkView'); } catch (e) { }
    sessionStorage.removeItem('login');

    location.replace('index.html');
  } catch (err) {
    _dbDeleting = false;
    console.error('[reset] Gagal hapus database:', err);
    alert('Gagal reset database: ' + (err.message || 'Terjadi kesalahan'));
  }
}

/** Verifikasi username & password terhadap user aktif */
async function _verifikasiUserReset(username, password) {
  const u = String(username || '').trim().toLowerCase();
  if (!u || !password) return false;

  const user = await db.user
    .where('username').equals(u)
    .filter(function (x) { return !x.deleted_at; })
    .first();
  if (!user) return false;

  return verifikasiPassword(password, user.password);
}

/** Bind event modal reset (dipanggil sekali saat initSetting) */
function _bindResetModal() {
  if (window._resetModalBound) return;

  const modal = document.getElementById('resetModal');
  if (!modal) return;

  const step1 = document.getElementById('resetStep1');
  const step2 = document.getElementById('resetStep2');
  const errorEl = document.getElementById('resetError');
  if (!step1 || !step2 || !errorEl) {
    console.warn('[reset] elemen modal tidak lengkap');
    return;
  }

  // --- Step 1: Backup Dulu ---
  document.getElementById('btnResetBackup').addEventListener('click', async function () {
    if (typeof backupDatabase !== 'function') {
      alert('Fungsi backup tidak tersedia.');
      return;
    }
    const btn = this;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Backup...';
    try {
      await backupDatabase();
      // tandai sudah backup hari ini
      if (typeof BACKUP_ROW_ID !== 'undefined' && db.backup_db) {
        try {
          await db.backup_db.update(BACKUP_ROW_ID, {
            status: '1',
            date_now: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (e) { }
      }
    } catch (err) {
      console.error('[reset] Backup gagal:', err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // --- Step 1: Lanjut ---
  document.getElementById('btnResetNext').addEventListener('click', _showResetStep2);

  // --- Step 1: Batal ---
  document.getElementById('btnResetCancel1').addEventListener('click', _closeResetModal);

  // --- Step 2: Kembali ---
  document.getElementById('btnResetBack2').addEventListener('click', _showResetStep1);

  // --- Step 2: Submit (verifikasi + hapus) ---
  step2.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.textContent = '';

    const username = document.getElementById('resetUsername').value.trim();
    const password = document.getElementById('resetPassword').value;

    if (!username || !password) {
      errorEl.textContent = 'Username dan password wajib diisi.';
      return;
    }

    const btn = document.getElementById('btnResetConfirm');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi...';

    try {
      const valid = await _verifikasiUserReset(username, password);
      if (!valid) {
        errorEl.textContent = 'Username atau password salah.';
        document.getElementById('resetPassword').value = '';
        document.getElementById('resetPassword').focus();
        return;
      }

      // Verifikasi sukses → hapus DB + redirect
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...';
      await _hapusDatabaseDanRedirect();
    } catch (err) {
      console.error('[reset] Gagal:', err);
      errorEl.textContent = 'Gagal: ' + (err.message || 'Terjadi kesalahan');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // --- Klik backdrop (opsional) untuk tutup pada step 1 ---
  modal.addEventListener('click', function (e) {
    if (e.target === modal && !step1.hidden) _closeResetModal();
  });

  // --- ESC untuk tutup pada step 1 ---
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden && !step1.hidden) {
      _closeResetModal();
    }
  });

  window._resetModalBound = true; // ← set DI AKHIR
}
