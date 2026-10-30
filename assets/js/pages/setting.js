/* ============================================
   HALAMAN SETTING
   ============================================ */

async function initSetting() {
    const id = sessionStorage.getItem("login");
    const user = id ? await db.user.get(id) : null;

    // Sesi tidak valid atau akun sudah dihapus: kembali ke login
    if (!user || user.deleted_at) {
        sessionStorage.removeItem("login");
        location.replace("index.html");
        return;
    }

    const name = document.querySelector(".user-card__name");
    const username = document.querySelector(".user-card__username");

    // textContent aman dari HTML, jadi tidak perlu escape
    name.textContent = user.name || user.username;   // kalau nama kosong, pakai username
    username.textContent = "@" + user.username;
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