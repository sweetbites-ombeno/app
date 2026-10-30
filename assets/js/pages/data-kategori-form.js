/* ============================================
   HALAMAN FORM KATEGORI (Tambah / Edit)
   ============================================ */

async function initDataKategoriForm() {
    const form = document.getElementById("kategoriForm");
    const inputName = document.getElementById("kategoriName");
    const inputMode = document.getElementById("kategoriMode");
    const inputId = document.getElementById("kategoriId");
    const titleEl = document.getElementById("formTitle");
    const subtitleEl = document.getElementById("formSubtitle");
    if (!form || !inputName) return;

    // Baca parameter URL (mode=edit&id=...)
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "edit" ? "edit" : "add";
    const editId = params.get("id") || "";

    inputMode.value = mode;
    inputId.value = editId;

    if (mode === "edit" && editId) {
        try {
            const data = await db.kategori.get(editId);
            if (data && !data.deleted_at) {
                if (titleEl) titleEl.textContent = "Edit Kategori";
                if (subtitleEl) subtitleEl.textContent = "Ubah nama kategori";
                inputName.value = data.name || "";
            } else {
                // Data tidak ditemukan → fallback ke mode add
                if (titleEl) titleEl.textContent = "Tambah Kategori";
                if (subtitleEl) subtitleEl.textContent = "Isi nama kategori baru";
                inputMode.value = "add";
                inputId.value = "";
            }
        } catch (err) {
            console.error("[data-kategori-form] Gagal memuat data:", err);
        }
    } else {
        if (titleEl) titleEl.textContent = "Tambah Kategori";
        if (subtitleEl) subtitleEl.textContent = "Isi nama kategori baru";
    }

    // Auto focus
    setTimeout(function () { inputName.focus(); }, 100);

    // Submit
    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const name = inputName.value.trim();
        if (!name) {
            inputName.focus();
            return;
        }

        const btn = document.getElementById("btnSimpanKategori");
        if (btn) btn.disabled = true;

        try {
            const now = new Date().toISOString();

            if (inputMode.value === "edit" && inputId.value) {
                // Update
                await db.kategori.update(inputId.value, {
                    name: name,
                    updated_at: now
                });
            } else {
                // Tambah
                await db.kategori.add({
                    name: name,
                    created_at: now
                });
            }

            // Kembali ke list kategori
            navigateTo("data-kategori");
        } catch (err) {
            console.error("[data-kategori-form] Gagal menyimpan:", err);
            alert("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"));
            if (btn) btn.disabled = false;
        }
    });
}