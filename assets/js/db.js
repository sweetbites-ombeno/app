const db = new Dexie('posDB');

db.version(1).stores({
    user: 'id, name, username, password, created_at, updated_at, deleted_at',
    customer: 'id, name, no_telp, created_at, updated_at, deleted_at',
    kategori: 'id, name, created_at, updated_at, deleted_at',
    produk: 'id, name, kategori, harga_jual, image_base64, created_at, updated_at, deleted_at',
    pembelian: 'id, kode, total, tempat, tanggal_beli, created_at, updated_at, deleted_at',
    pembelian_detail: 'id, pembelian, name_item, qty, satuan, harga_satuan, total, order, created_at, updated_at, deleted_at',
    penjualan: 'id, kode, total, customer, tanggal_jual, status, created_at, updated_at, deleted_at',
    penjualan_detail: 'id, penjualan, id_product, name_product, id_kategori, name_kategori, qty, harga_satuan, total, order, created_at, updated_at, deleted_at'
});

['user', 'customer', 'kategori', 'produk', 'pembelian','pembelian_detail', 'penjualan', 'penjualan_detail'].forEach(function (t) {
    db[t].hook('creating', function (primKey, obj) {
        if (!obj.id) obj.id = crypto.randomUUID();
        if (!obj.created_at) obj.created_at = new Date().toISOString();
    });
});