import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../customers/customers_screen.dart';
import '../orders/order_detail_screen.dart';
import '../products/product_edit_screen.dart';

/// Search everything on the device at once (works offline): orders, products, customers.
class GlobalSearch extends StatefulWidget {
  const GlobalSearch({super.key});
  @override
  State<GlobalSearch> createState() => _GlobalSearchState();
}

class _GlobalSearchState extends State<GlobalSearch> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final p = s.perms;
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    bool hit(String hay) => words.isNotEmpty && words.every(hay.toLowerCase().contains);
    final orders = (p.seesOrders || p.billing) ? s.list('orders').where((o) => hit('${o['number']} ${o['customer']} ${o['phone'] ?? ''}')).take(6).toList() : const <Map<String, dynamic>>[];
    final deliveries = p.deliver ? s.list('deliveries').where((o) => hit('${o['number']} ${o['customer']} ${o['phone'] ?? ''} ${o['address'] ?? ''}')).take(6).toList() : const <Map<String, dynamic>>[];
    final products = s.list('products').where((x) => hit('${x['name']} ${x['sku'] ?? ''} ${x['barcode'] ?? ''}')).take(6).toList();
    final customers = p.seesCustomers ? s.list('customers').where((c) => hit('${c['name']} ${c['phone'] ?? ''} ${c['email'] ?? ''}')).take(6).toList() : const <Map<String, dynamic>>[];
    final wide = isWide(context);

    void open(Widget page) {
      Navigator.pop(context);
      Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    }

    Widget group(String title, IconData icon, List<Widget> rows) => rows.isEmpty
        ? const SizedBox.shrink()
        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 4), child: Row(children: [Icon(icon, size: 16, color: AppColors.primary), const SizedBox(width: 6), Text(title.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted, letterSpacing: .8))])),
            ...rows,
          ]);

    final results = [
      group('Orders', Icons.receipt_long_rounded, [
        for (final o in [...orders, ...deliveries.where((d) => !orders.any((o) => o['id'] == d['id']))])
          ListTile(
            dense: true,
            leading: Icon(o['type'] == 'online' ? Icons.language_rounded : Icons.storefront_outlined, color: AppColors.muted),
            title: Text('${o['number']} · ${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${money(o['total'])} · ${ago(o['createdAt'])}'),
            trailing: StatusChip('${o['status']}'),
            onTap: o['localRef'] != null ? null : () => open(OrderDetailScreen(orderId: toInt(o['id']), agentView: p.deliver && !p.seesOrders)),
          ),
      ]),
      group('Products', Icons.inventory_2_rounded, [
        for (final x in products)
          ListTile(
            dense: true,
            leading: NetImage(x['image'], size: 36, radius: 8),
            title: Text('${x['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${money(toDouble(x['salePrice']) > 0 ? x['salePrice'] : x['price'])}${x['stock'] != null ? ' · stock ${x['stock']}' : ''}${x['barcode'] != null ? ' · ${x['barcode']}' : ''}'),
            onTap: p.products ? () => open(ProductEditScreen(product: x)) : null,
          ),
      ]),
      group('Customers', Icons.people_alt_rounded, [
        for (final c in customers)
          ListTile(
            dense: true,
            leading: Avatar('${c['name']}', size: 36),
            title: Text('${c['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${c['phone'] ?? c['email'] ?? ''}'),
            trailing: toDouble(c['due']) > 0 ? StatusChip('Due ${moneyShort(c['due'])}') : null,
            onTap: () => open(CustomerProfile(id: toInt(c['id']))),
          ),
      ]),
    ];
    final empty = words.isNotEmpty && orders.isEmpty && deliveries.isEmpty && products.isEmpty && customers.isEmpty;

    final panel = Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(wide ? 18 : 0),
      clipBehavior: Clip.antiAlias,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: Row(children: [
            if (!wide) IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.pop(context)),
            Expanded(
              child: TextField(
                autofocus: true,
                onChanged: (v) => setState(() => _q = v),
                decoration: const InputDecoration(hintText: 'Search orders, products, customers…', prefixIcon: Icon(Icons.search_rounded), border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, filled: false),
                style: const TextStyle(fontSize: 16),
              ),
            ),
            if (wide) const Padding(padding: EdgeInsets.only(right: 8), child: Text('Esc', style: TextStyle(color: AppColors.faint, fontSize: 12, fontWeight: FontWeight.w600))),
          ]),
        ),
        const Divider(),
        Flexible(
          child: words.isEmpty
              ? const Padding(padding: EdgeInsets.all(28), child: Text('Type an order number, name, mobile, product or barcode.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted)))
              : empty
                  ? const Padding(padding: EdgeInsets.all(28), child: Text('Nothing found.', style: TextStyle(color: AppColors.muted)))
                  : ListView(shrinkWrap: true, padding: const EdgeInsets.only(bottom: 10), children: results),
        ),
      ]),
    );

    if (!wide) return Dialog.fullscreen(child: SafeArea(child: panel));
    return Dialog(
      alignment: const Alignment(0, -.55),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 640, maxHeight: 560), child: panel),
    );
  }
}
