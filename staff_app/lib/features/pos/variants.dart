import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../ds/ds.dart';
import '../../widgets/common.dart';
import 'cart.dart';

/// "1 KG" — the product's pack quantity with its unit (or just the unit).
String? packOf(Map p) {
  if (p['pack'] != null && '${p['pack']}'.isNotEmpty) return '${p['pack']}';
  final u = '${p['unit'] ?? ''}'.trim();
  return u.isEmpty ? null : u;
}

double _sortKey(Map p) {
  final q = p['quantity'] == null ? null : toDouble(p['quantity']);
  if (q == null) return double.maxFinite;
  final u = '${p['unit'] ?? ''}'.toLowerCase();
  return q * (const ['kg', 'liter', 'litre', 'l', 'meter', 'm'].contains(u) ? 1000 : 1);
}

/// Every active product linked as a variant of [p] (itself included), small → large; empty when it has none.
List<Map<String, dynamic>> variantsOf(AppState s, Map p) {
  final g = p['variantGroup'];
  if (g == null) return const [];
  final list = s.list('products').where((x) => x['variantGroup'] == g && (x['status'] == 'active' || toInt(x['id']) == toInt(p['id']))).toList()
    ..sort((a, b) {
      final k = _sortKey(a).compareTo(_sortKey(b));
      return k != 0 ? k : CartLine.shelfPrice(a).compareTo(CartLine.shelfPrice(b));
    });
  return list.length > 1 ? list : const [];
}

/// The size written in a name: "Clinic Plus 80ml" → "80 ml".
String? packFromName(String name) {
  final m = RegExp(r'(\d+(?:\.\d+)?)\s*(kg|kgs|gms?|grams?|g|litres?|liters?|ltr|l|mls?|pcs|pc|pieces?)\b', caseSensitive: false).allMatches(name).lastOrNull;
  if (m == null) return null;
  final u = m.group(2)!.toLowerCase();
  final unit = u.startsWith('kg') ? 'KG' : u.startsWith('g') ? 'g' : u.startsWith('ml') ? 'ml' : u.startsWith('l') ? 'L' : 'Pcs';
  return '${num.parse(m.group(1)!)} $unit';
}

/// Short size of a variant: quantity + unit, else the size in its name.
String variantName(Map v) => (v['quantity'] != null ? packOf(v) : null) ?? packFromName('${v['name']}') ?? packOf(v) ?? '${v['name']}';


/// Choices for a bill line: linked variants and each product's own sizes (a size works like a variant).
List<(Map<String, dynamic>, Map<String, dynamic>?)> lineChoices(AppState s, Map<String, dynamic> product) {
  final vs = variantsOf(s, product);
  final products = vs.isEmpty ? [product] : vs;
  return [
    for (final p in products)
      if (CartLine.sizesOf(p).isNotEmpty) ...[
        if (p['quantity'] != null && toDouble(p['quantity']) > 0) (p, null),
        for (final z in CartLine.sizesOf(p))
          if (!(p['quantity'] != null && '${z['label']}'.trim().toLowerCase() == (packOf(p) ?? '').toLowerCase())) (p, z),
      ] else
        (p, null),
  ];
}

String _choiceLabel((Map<String, dynamic>, Map<String, dynamic>?) c) {
  final (p, z) = c;
  final price = z != null ? CartLine.sizePrice(z) : CartLine.shelfPrice(p);
  return '${z != null ? '${z['label']}' : variantName(p)}  ·  ${money(price)}';
}

/// Unit cell of a bill line: shows the size (1 KG); when the product has
/// variants or sizes it is a dropdown that switches the line to another one.
class LineUnit extends StatelessWidget {
  final PosCart cart;
  final CartLine line;
  final VoidCallback? onEdit; // no choices: tap edits price / unit as before
  final TextStyle? style;
  const LineUnit({super.key, required this.cart, required this.line, this.onEdit, this.style});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final choices = lineChoices(s, line.product);
    if (choices.length < 2) {
      return InkWell(onTap: onEdit, child: Text(line.unit ?? '—', style: style ?? DS.body.copyWith(color: DS.text2)));
    }
    String key((Map<String, dynamic>, Map<String, dynamic>?) c) => '${toInt(c.$1['id'])}:${c.$2 == null ? 0 : toInt(c.$2!['id'])}';
    final current = '${line.productId}:${line.sizeId ?? 0}';
    void pick(String k) {
      final c = choices.firstWhere((x) => key(x) == k);
      final msg = cart.swap(line, c.$1, size: c.$2);
      if (msg != null) toast(context, msg, error: true);
    }

    if (desktop(context)) {
      return DSelect<String>(small: true, menuWidth: 240, value: current, options: [for (final c in choices) (key(c), _choiceLabel(c))], onChanged: pick);
    }
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: () async {
        final k = await showAppSheet<String>(context, title: 'Choose size — ${line.name}', builder: (c) => ListView(shrinkWrap: true, children: [
              for (final ch in choices)
                AppChoice(
                  title: ch.$2 != null ? '${ch.$2!['label']}' : variantName(ch.$1),
                  subtitle: money(ch.$2 != null ? CartLine.sizePrice(ch.$2!) : CartLine.shelfPrice(ch.$1)),
                  selected: key(ch) == current,
                  onTap: () => popDialog(c, key(ch)),
                ),
            ]));
        if (k != null) pick(k);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(border: Border.all(color: DS.line), borderRadius: BorderRadius.circular(6)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(line.unit ?? packOf(line.product) ?? 'Size', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
          const Icon(Icons.arrow_drop_down_rounded, size: 18),
        ]),
      ),
    );
  }
}
