import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../features/products/product_edit_screen.dart';
import '../features/products/products_screen.dart' show adjustStock;
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "All Products" as on the website: 4 number cards, filter bar, bordered table.
class ProductsWeb extends StatefulWidget {
  const ProductsWeb({super.key});
  @override
  State<ProductsWeb> createState() => _ProductsWebState();
}

class _ProductsWebState extends State<ProductsWeb> {
  int _navSeq = -1;
  String _q = '';
  String _status = 'all';
  String _stock = 'all';
  int _category = 0;
  String _type = 'all';
  int _page = 0, _per = 20;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    if (nav.seq != _navSeq) {
      _navSeq = nav.seq;
      final a = nav.take('products');
      if (a['filter'] is String) {
        _stock = a['filter'] == 'low' || a['filter'] == 'out' ? a['filter'] : 'all';
        _status = a['filter'] == 'inactive' ? 'inactive' : 'all';
      }
      if (a.containsKey('category')) _category = (a['category'] as int?) ?? 0;
    }
    final s = context.watch<AppState>();
    final cats = s.list('categories');
    final catName = {for (final c in cats) toInt(c['id']): '${c['name']}'};
    final all = s.list('products');
    bool tracked(Map p) => p['type'] == 'physical' && p['stock'] != null;
    bool low(Map p) => tracked(p) && toInt(p['stock']) > 0 && toInt(p['stock']) <= 5;
    bool out(Map p) => tracked(p) && toInt(p['stock']) <= 0;
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = all.where((p) {
      if (_status == 'active' && p['status'] != 'active') return false;
      if (_status == 'inactive' && p['status'] == 'active') return false;
      if (_stock == 'in' && (out(p))) return false;
      if (_stock == 'low' && !low(p)) return false;
      if (_stock == 'out' && !out(p)) return false;
      if (_category != 0 && toInt(p['categoryId']) != _category) return false;
      if (_type != 'all' && p['type'] != _type) return false;
      final hay = '${p['name']} ${p['sku'] ?? ''} ${p['barcode'] ?? ''}'.toLowerCase();
      return words.every(hay.contains);
    }).toList();
    final shown = WebPager.slice(list, _page, _per);

    void edit(Map<String, dynamic>? p) => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: p)));

    Future<void> setStatus(Map<String, dynamic> p, String v) async {
      final status = v == 'Published' ? 'active' : 'inactive';
      await s.enqueue(OutboxItem(
        id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: {'status': status}, label: '${p['name']}: $v',
        effect: {'kind': 'product', 'id': p['id'], 'fields': {'status': status}}, refresh: const ['products'],
      ));
      if (context.mounted) toast(context, '${p['name']} is now $v.');
    }

    final rows = [
      for (final p in shown)
        <Widget>[
          Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), border: Border.all(color: W.g200)), child: NetImage(p['image'], size: 36, radius: 6, placeholder: LucideIcons.image)),
          Text('${p['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
          Row(children: [
            Flexible(
              child: Text(
                tracked(p) ? '${p['stock']}${p['unit'] != null ? ' ${p['unit']}' : ''}' : '∞',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: out(p) ? const Color(0xFFDC2626) : low(p) ? const Color(0xFFD97706) : W.g900),
              ),
            ),
            if (tracked(p)) ...[
              const SizedBox(width: 8),
              Material(
                color: W.green,
                borderRadius: BorderRadius.circular(4),
                child: InkWell(onTap: () => adjustStock(context, p), borderRadius: BorderRadius.circular(4), child: const SizedBox(width: 30, height: 24, child: Icon(LucideIcons.plus, size: 15, color: Colors.white))),
              ),
            ],
          ]),
          p['categoryId'] == null ? webDash : Text(catName[toInt(p['categoryId'])] ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, color: W.g600)),
          Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(money(toDouble(p['salePrice']) > 0 ? p['salePrice'] : p['price']), style: const TextStyle(fontSize: 15, color: W.g900)),
            if (toDouble(p['salePrice']) > 0) Text(money(p['price']), style: const TextStyle(fontSize: 12.5, color: W.g400, decoration: TextDecoration.lineThrough)),
          ]),
          WebPillMenu(value: p['status'] == 'active' ? 'Published' : 'Inactive', options: const ['Published', 'Inactive'], color: p['status'] == 'active' ? W.green : W.grey, onSelected: (v) => setStatus(p, v)),
          Text(p['type'] == 'digital' ? 'Digital' : 'Physical', style: const TextStyle(fontSize: 15, color: W.g600)),
          Row(children: [
            WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit', onTap: () => edit(p)),
            if (tracked(p)) WebIconAction(LucideIcons.packagePlus, color: W.grey, tooltip: 'Update stock', onTap: () => adjustStock(context, p)),
          ]),
        ],
    ];

    return WebPage(
      title: 'All Products',
      subtitle: 'Manage everything you sell in your store',
      onRefresh: () => s.syncNow(only: const ['products', 'categories', 'brands']),
      actions: [
        WebSearch(width: 250, hint: 'Search products, SKU, barcode', onChanged: (v) => _set(() => _q = v)),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Products', const ['Name', 'SKU', 'Barcode', 'Category', 'Price', 'Sale price', 'GST %', 'Stock', 'Unit', 'Status'], [
              for (final p in list) [p['name'], p['sku'], p['barcode'], catName[toInt(p['categoryId'])], toDouble(p['price']), p['salePrice'] == null ? null : toDouble(p['salePrice']), toDouble(p['gstRate']), p['stock'], p['unit'], p['status']],
            ])),
        WebButton('Add Product', icon: LucideIcons.plus, color: W.orange, onPressed: () => edit(null)),
      ],
      children: [
        WebGrid(children: [
          WebMetric(icon: LucideIcons.shoppingBag, color: W.orange, value: '${all.length}', label: 'Total Products', selected: _status == 'all' && _stock == 'all', onTap: () => _set(() {
                _status = 'all';
                _stock = 'all';
              })),
          WebMetric(icon: LucideIcons.badgeCheck, color: const Color(0xFF16A34A), value: '${all.where((p) => p['status'] == 'active').length}', label: 'Published', selected: _status == 'active', onTap: () => _set(() => _status = 'active')),
          WebMetric(icon: LucideIcons.triangleAlert, color: const Color(0xFFEAB308), value: '${all.where(low).length}', label: 'Low Stock (≤ 5)', selected: _stock == 'low', onTap: () => _set(() => _stock = 'low')),
          WebMetric(icon: LucideIcons.packageX, color: const Color(0xFFEF4444), value: '${all.where(out).length}', label: 'Out of Stock', selected: _stock == 'out', onTap: () => _set(() => _stock = 'out')),
        ]),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(14),
          child: WebGrid(columns: 4, gap: 12, minWidth: 180, children: [
            WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All Status'), ('active', 'Published'), ('inactive', 'Inactive')], onChanged: (v) => _set(() => _status = v)),
            WebSelect<String>(icon: LucideIcons.boxes, label: 'Stock', value: _stock, options: const [('all', 'All Stock'), ('in', 'In stock'), ('low', 'Low stock (≤ 5)'), ('out', 'Out of stock')], onChanged: (v) => _set(() => _stock = v)),
            WebSelect<int>(icon: LucideIcons.listTree, label: 'Category', value: _category, options: [(0, 'All Categories'), for (final c in cats) (toInt(c['id']), '${c['name']}')], onChanged: (v) => _set(() => _category = v)),
            WebSelect<String>(icon: LucideIcons.tag, label: 'Type', value: _type, options: const [('all', 'All Types'), ('physical', 'Physical'), ('digital', 'Digital')], onChanged: (v) => _set(() => _type = v)),
          ]),
        ),
        const SizedBox(height: 20),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            WebTable(
              bordered: true,
              rowHeight: 54,
              cols: const [WebCol('Image', width: 72), WebCol('Name', flex: 2.2), WebCol('Stock', flex: 1), WebCol('Category', flex: 1.1), WebCol('Price', flex: 1), WebCol('Status', flex: 1.1), WebCol('Type', flex: .8), WebCol('Actions', width: 110)],
              rows: rows,
              onRowTap: [for (final p in shown) () => edit(p)],
            ),
            WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v)),
          ]),
        ),
      ],
    );
  }
}
