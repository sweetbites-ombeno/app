/* ============================================
   HALAMAN UBAH PASSWORD
   ============================================ */

async function initDataUbahPassword() {
    const form = document.getElementById("ubahPasswordForm");
    const inputSekarang = document.getElementById("passwordSekarang");
    const inputBaru = document.getElementById("passwordBaru");
    const inputKonfirmasi = document.getElementById("konfirmasiPasswordBaru");
    const errorEl = document.getElementById("ubahPasswordError");
    if (!form || !inputSekarang || !inputBaru || !inputKonfirmasi) return;

    // Toggle visibility password (eye icon)
    document.querySelectorAll(".password-toggle").forEach(function (btn) {
        // Hindari double-binding kalau halaman di-init ulang
        if (btn._boundToggle) return;
        btn._boundToggle = true;

        btn.addEventListener("click", function () {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";

            const icon = btn.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-eye", !isPassword);
                icon.classList.toggle("fa-eye-slash", isPassword);
            }
            btn.setAttribute("aria-label", isPassword ? "Sembunyikan password" : "Tampilkan password");
        });
    });

    // Submit
    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (errorEl) errorEl.textContent = "";

        const sekarang = inputSekarang.value;
        const baru = inputBaru.value;
        const konfirmasi = inputKonfirmasi.value;

        // Validasi
        if (!sekarang) {
            if (errorEl) errorEl.textContent = "Password sekarang wajib diisi.";
            inputSekarang.focus();
            return;
        }
        if (!baru || baru.length < 6) {
            if (errorEl) errorEl.textContent = "Password baru minimal 6 karakter.";
            inputBaru.focus();
            return;
        }
        if (baru !== konfirmasi) {
            if (errorEl) errorEl.textContent = "Konfirmasi password tidak sama.";
            inputKonfirmasi.focus();
            return;
        }
        if (baru === sekarang) {
            if (errorEl) errorEl.textContent = "Password baru harus berbeda dari password sekarang.";
            inputBaru.focus();
            return;
        }

        const btn = document.getElementById("btnSimpanPassword");
        if (btn) btn.disabled = true;

        try {
            const userId = sessionStorage.getItem("login");
            if (!userId) {
                throw new Error("Sesi login habis. Silakan login ulang.");
            }

            const user = await db.user.get(userId);
            if (!user || user.deleted_at) {
                throw new Error("User tidak ditemukan.");
            }

            // Verifikasi password sekarang
            const valid = await verifikasiPassword(sekarang, user.password);
            if (!valid) {
                if (errorEl) errorEl.textContent = "Password sekarang salah.";
                inputSekarang.value = "";
                inputSekarang.focus();
                if (btn) btn.disabled = false;
                return;
            }

            // Hash password baru & simpan
            const hashed = await hashPassword(baru);
            await db.user.update(userId, {
                password: hashed,
                updated_at: new Date().toISOString()
            });

            // Sukses
            if (typeof openInfoPopup === "function") {
                openInfoPopup(
                    "Password berhasil diubah. Gunakan password baru saat login berikutnya.",
                    {
                        title: "Berhasil",
                        icon: "success",
                        button: "Mengerti",
                        onClose: function () {
                            navigateTo("setting");
                        }
                    }
                );
            } else {
                alert("Password berhasil diubah.");
                navigateTo("setting");
            }
        } catch (err) {
            console.error("[ubah-password] Gagal:", err);
            if (errorEl) errorEl.textContent = "Gagal: " + (err.message || "Terjadi kesalahan");
            if (btn) btn.disabled = false;
        }
    });

    // Focus otomatis
    setTimeout(function () { inputSekarang.focus(); }, 100);
}