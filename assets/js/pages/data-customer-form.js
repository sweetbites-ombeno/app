/* ============================================
   HALAMAN FORM CUSTOMER (Tambah / Edit)
   ============================================ */

async function initDataCustomerForm() {
    const form = document.getElementById("customerForm");
    const inputName = document.getElementById("customerName");
    const inputTelp = document.getElementById("customerTelp");
    const inputMode = document.getElementById("customerMode");
    const inputId = document.getElementById("customerId");
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
            const data = await db.customer.get(editId);
            if (data && !data.deleted_at) {
                if (titleEl) titleEl.textContent = "Edit Customer";
                if (subtitleEl) subtitleEl.textContent = "Ubah data customer";
                inputName.value = data.name || "";
                if (inputTelp) inputTelp.value = data.no_telp || "";
            } else {
                if (titleEl) titleEl.textContent = "Tambah Customer";
                if (subtitleEl) subtitleEl.textContent = "Isi data customer baru";
                inputMode.value = "add";
                inputId.value = "";
            }
        } catch (err) {
            console.error("[data-customer-form] Gagal memuat data:", err);
        }
    } else {
        if (titleEl) titleEl.textContent = "Tambah Customer";
        if (subtitleEl) subtitleEl.textContent = "Isi data customer baru";
    }

    setTimeout(function () { inputName.focus(); }, 100);

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const name = inputName.value.trim();
        const telp = inputTelp ? inputTelp.value.trim() : "";

        if (!name) {
            inputName.focus();
            return;
        }

        const btn = document.getElementById("btnSimpanCustomer");
        if (btn) btn.disabled = true;

        try {
            const now = new Date().toISOString();

            if (inputMode.value === "edit" && inputId.value) {
                await db.customer.update(inputId.value, {
                    name: name,
                    no_telp: telp,
                    updated_at: now
                });
            } else {
                await db.customer.add({
                    name: name,
                    no_telp: telp,
                    created_at: now
                });
            }

            navigateTo("data-customer");
        } catch (err) {
            console.error("[data-customer-form] Gagal menyimpan:", err);
            openInfoPopup("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"), {
                title: "Gagal Menyimpan", icon: "danger"
            });
            if (btn) btn.disabled = false;
        }
    });
}