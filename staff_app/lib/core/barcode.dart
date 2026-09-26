/// Barcode matching that forgives the usual differences between a scanner and
/// what was typed when the product was added: spaces, letter case, and the
/// leading zero that turns a 12-digit UPC into a 13-digit EAN.
String cleanCode(String raw) => raw.replaceAll(RegExp(r'[\s\u0000-\u001F​-‍﻿]'), '').trim();

String _key(String v) {
  final c = cleanCode(v).toUpperCase();
  return RegExp(r'^\d+$').hasMatch(c) ? c.replaceFirst(RegExp(r'^0+(?=\d)'), '') : c;
}

/// The product with this barcode (or SKU), active ones first; null when none.
Map<String, dynamic>? findByCode(List<Map<String, dynamic>> products, String code) {
  final want = _key(code);
  if (want.isEmpty) return null;
  Map<String, dynamic>? hit;
  for (final p in products) {
    final bc = p['barcode'] == null ? '' : _key('${p['barcode']}');
    final sku = p['sku'] == null ? '' : _key('${p['sku']}');
    if (bc == want || sku == want) {
      if (p['status'] == 'active') return p;
      hit ??= p;
    }
  }
  return hit;
}
