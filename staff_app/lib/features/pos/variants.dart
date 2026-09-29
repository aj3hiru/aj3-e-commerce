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

String _optionLabel(Map<String, dynamic> v) {
  final stock = v['type'] == 'physical' && v['stock'] != null ? toInt(v['stock']) : null;
  return '${packOf(v) ?? v['name']}  ·  ${money(CartLine.shelfPrice(v))}${stock != null && stock <= 0 ? '  ·  out of stock' : ''}';
}

/// Unit cell of a bill line: shows the pack (1 KG); when the product has
/// variants it is a dropdown that switches the line to another size.
class LineUnit extends StatelessWidget {
  final PosCart cart;
  final CartLine line;
  final VoidCallback? onEdit; // no variants: tap edits price / unit as before
  final TextStyle? style;
  const LineUnit({super.key, required this.cart, required this.line, this.onEdit, this.style});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final vs = variantsOf(s, line.product);
    if (vs.isEmpty) {
      return InkWell(onTap: onEdit, child: Text(line.unit ?? '—', style: style ?? DS.body.copyWith(color: DS.text2)));
    }
    void pick(int id) {
      final next = vs.firstWhere((v) => toInt(v['id']) == id);
      final msg = cart.swap(line, next);
      if (msg != null) toast(context, msg, error: true);
    }

    if (desktop(context)) {
      return DSelect<int>(
        small: true,
        menuWidth: 240,
        value: line.productId,
        options: [for (final v in vs) (toInt(v['id']), _optionLabel(v))],
        onChanged: pick,
      );
    }
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: () async {
        final id = await showAppSheet<int>(context, title: 'Choose size — ${line.name}', builder: (c) => ListView(shrinkWrap: true, children: [
              for (final v in vs)
                AppChoice(
                  title: packOf(v) ?? '${v['name']}',
                  subtitle: '${money(CartLine.shelfPrice(v))} · ${v['name']}',
                  selected: toInt(v['id']) == line.productId,
                  onTap: () => popDialog(c, toInt(v['id'])),
                ),
            ]));
        if (id != null) pick(id);
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
