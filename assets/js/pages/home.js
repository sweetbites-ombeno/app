async function initHome() {
    const jumlah = await db.produk.filter(p => !p.deleted_at).count();
    document.getElementById("totalProduk").textContent = jumlah;
}