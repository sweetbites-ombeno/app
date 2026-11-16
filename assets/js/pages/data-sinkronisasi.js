/* ============================================
   HALAMAN SINKRONISASI DATA
   ============================================ */

async function initDataSinkronisasi() {
    // Placeholder: fungsi sinkron akan diimplementasikan nanti
    console.log("[sinkronisasi] Halaman dimuat");

    // Event delegation untuk tombol sinkron
    if (window._sinkronBound) return;
    window._sinkronBound = true;

    document.addEventListener("click", function (e) {
        if (!document.querySelector(".page--sinkronisasi")) return;

        const btn = e.target.closest("[data-action^='sinkron-']");
        if (!btn) return;

        e.preventDefault();
        const action = btn.dataset.action;
        const label = btn.closest(".sinkron-card").querySelector(".sinkron-card__title").textContent;

        // Placeholder: tampilkan popup info
        if (typeof openInfoPopup === "function") {
            openInfoPopup(
                `Fitur sinkronisasi ${label} akan diimplementasikan nanti.`,
                {
                    title: "Belum Tersedia",
                    icon: "info",
                    button: "Mengerti"
                }
            );
        }
    });
}