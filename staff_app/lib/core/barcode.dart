/// Barcode matching that forgives the usual differences between what a camera
/// or scanner gun reads and what was typed when the product was added:
/// spaces / invisible characters, letter case, leading zeros (UPC-A read as EAN-13),
/// a check digit typed or left off, short UPC-E codes, and a barcode that was
/// typed only partly. Same fallbacks as the website: SKU and product id.
String cleanCode(String raw) => raw.replaceAll(RegExp(r'[\s\u0000-\u001F\u007F​-‍﻿]'), '').trim();

String _key(String v) {
  final c = cleanCode(v).toUpperCase();
  return RegExp(r'^\d+$').hasMatch(c) ? c.replaceFirst(RegExp(r'^0+(?=\d)'), '') : c;
}

bool _digits(String v) => RegExp(r'^\d+$').hasMatch(v);

/// UPC-E (8 digits, e.g. 01234565) → its 12-digit UPC-A.
String? _upcEtoA(String e) {
  if (e.length != 8 || !_digits(e) || (e[0] != '0' && e[0] != '1')) return null;
  final d = e.substring(1, 7), sys = e[0], check = e[7];
  final last = d[5];
  final String body;
  switch (last) {
    case '0' || '1' || '2':
      body = '${d.substring(0, 2)}${last}0000${d.substring(2, 5)}';
    case '3':
      body = '${d.substring(0, 3)}00000${d.substring(3, 5)}';
    case '4':
      body = '${d.substring(0, 4)}00000${d[4]}';
    default:
      body = '${d.substring(0, 5)}0000$last';
  }
  return '$sys$body$check';
}

/// The product with this barcode (or SKU / id), active ones first; null when none.
Map<String, dynamic>? findByCode(List<Map<String, dynamic>> products, String code) {
  final raw = cleanCode(code);
  final want = _key(raw);
  if (want.isEmpty) return null;
  final wants = {want, if (_upcEtoA(raw) != null) _key(_upcEtoA(raw)!)};

  Map<String, dynamic>? pick(bool Function(Map<String, dynamic> p) test) {
    Map<String, dynamic>? hit;
    for (final p in products) {
      if (!test(p)) continue;
      if (p['status'] == 'active') return p;
      hit ??= p;
    }
    return hit;
  }

  String bc(Map p) => p['barcode'] == null ? '' : _key('${p['barcode']}');
  String sku(Map p) => p['sku'] == null ? '' : _key('${p['sku']}');

  // 1. Same barcode or SKU.
  final exact = pick((p) => wants.contains(bc(p)) || wants.contains(sku(p)));
  if (exact != null) return exact;

  // 2. Numeric barcodes that differ only by the check digit at the end.
  if (_digits(want) && want.length >= 7) {
    final near = pick((p) {
      final b = bc(p);
      if (b.length < 7 || !_digits(b)) return false;
      return (want.length == b.length + 1 && want.startsWith(b)) || (b.length == want.length + 1 && b.startsWith(want));
    });
    if (near != null) return near;
  }

  // 3. Only one product whose barcode contains (or is contained in) what was read.
  if (want.length >= 6) {
    final part = products.where((p) {
      final b = bc(p);
      return b.length >= 6 && (b.contains(want) || want.contains(b));
    }).toList();
    if (part.length == 1) return part.first;
  }

  // 4. The product id (the website's billing box accepts it too).
  if (_digits(raw) && raw.length <= 6) {
    final id = int.tryParse(raw);
    final byId = pick((p) => p['id'] == id || '${p['id']}' == raw);
    if (byId != null) return byId;
  }
  return null;
}
