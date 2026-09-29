import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../features/products/product_edit_screen.dart';
import '../features/products/products_screen.dart' show adjustStock;
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

/// "Stock Out Products" as on the website: physical products with no stock (0 or not set) —
/// 4 cards, Status / Category / Units / Stock filters, select + bulk (Set Active / Inactive /
/// Export), and the table (image, name, category, price, status, stock pill → restock, actions).
/// From the synced product list, so it works offline; restocks queue when offline.
class StockOutWeb extends StatefulWidget {
  const StockOutWeb({super.key});
  @override
  State<StockOutWeb> createState() => _StockOutWebState();
}

class _StockOutWebState extends State<StockOutWeb> {
  static final _def = displayDefs['ecom_stock_out2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _status = 'all', _category = 'all', _units = 'all', _stock = 'all';

  bool get _filtersOn => _q.isNotEmpty || _status != 'all' || _category != 'all' || _units != 'all' || _stock != 'all';

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final cats = s.list('categories');
    final catName = {for (final c in cats) toInt(c['id']): '${c['name']}'};
    final all = s.list('products').where((p) => p['type'] == 'physical' && (p['stock'] == null || toInt(p['stock']) <= 0)).toList()
      ..sort((a, b) => '${b['updatedAt'] ?? ''}'.compareTo('${a['updatedAt'] ?? ''}'));
    bool hasUnits(Map p) => ((p['sizes'] as List?) ?? const []).isNotEmpty;
    double price(Map p) => toDouble(p['salePrice']) > 0 ? toDouble(p['salePrice']) : toDouble(p['price']);
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = all.where((p) {
      if (_status != 'all' && (p['status'] == 'active') != (_status == 'active')) return false;
      if (_category == 'none' && p['categoryId'] != null) return false;
      if (_category != 'all' && _category != 'none' && '${p['categoryId']}' != _category) return false;
      if (_units != 'all' && hasUnits(p) != (_units == 'yes')) return false;
      if (_stock == 'zero' && p['stock'] == null) return false;
      if (_stock == 'unset' && p['stock'] != null) return false;
      final hay = '${p['name']} ${p['sku'] ?? ''} ${p['barcode'] ?? ''}'.toLowerCase();
      return words.every(hay.contains);
    }).toList();

    void set(VoidCallback f) => setState(f);
    void edit(Map<String, dynamic> p) => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: p)));
    Future<void> setStatus(List<Map<String, dynamic>> rows, String status) async {
      final change = rows.where((p) => toInt(p['id']) > 0 && p['status'] != status).toList();
      for (final p in change) {
        await s.enqueue(OutboxItem(id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: {'status': status}, label: '${p['name']}: ${status == 'active' ? 'active' : 'inactive'}',
            effect: {'kind': 'product', 'id': p['id'], 'fields': {'status': status}}, refresh: const ['products']));
      }
      if (context.mounted) toast(context, change.isEmpty ? 'Nothing to change.' : '${change.length} product${change.length == 1 ? '' : 's'} set to ${status == 'active' ? 'Active' : 'Inactive'}.');
    }

    void export(List<Map<String, dynamic>> rows, String which) => exportTable(context, 'Stock out ($which)', const ['ID', 'Name', 'SKU', 'Barcode', 'Category', 'Price', 'Status', 'Stock', 'Units'], [
          for (final p in rows) [p['id'], p['name'], p['sku'], p['barcode'], catName[toInt(p['categoryId'])], price(p), p['status'] == 'active' ? 'Active' : 'Inactive', p['stock'] ?? 'Not set', ((p['sizes'] as List?) ?? const []).length],
        ]);

    final cards = [
      if (on('so2-cards', 'so2-k-total'))
        WebMetric(icon: LucideIcons.packageX, color: const Color(0xFFEF4444), value: '${all.length}', label: 'Out of Stock', selected: !_filtersOn, onTap: () => set(() {
              _q = '';
              _status = _category = _units = _stock = 'all';
            })),
      if (on('so2-cards', 'so2-k-active'))
        WebMetric(icon: LucideIcons.badgeCheck, color: const Color(0xFF059669), value: '${all.where((p) => p['status'] == 'active').length}', label: 'Active (Live in Shop)', selected: _status == 'active', onTap: () => set(() => _status = _status == 'active' ? 'all' : 'active')),
      if (on('so2-cards', 'so2-k-inactive'))
        WebMetric(icon: LucideIcons.eyeOff, color: W.g500, value: '${all.where((p) => p['status'] != 'active').length}', label: 'Inactive', selected: _status == 'inactive', onTap: () => set(() => _status = _status == 'inactive' ? 'all' : 'inactive')),
      if (on('so2-cards', 'so2-k-units'))
        WebMetric(icon: LucideIcons.layers, color: const Color(0xFF7C3AED), value: '${all.where(hasUnits).length}', label: 'With Units', selected: _units == 'yes', onTap: () => set(() => _units = _units == 'yes' ? 'all' : 'yes')),
    ];
    final filters = [
      if (on('so2-filters', 'so2-f-status')) WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All Status'), ('active', 'Active'), ('inactive', 'Inactive')], onChanged: (v) => set(() => _status = v)),
      if (on('so2-filters', 'so2-f-category'))
        WebSelect<String>(icon: LucideIcons.folderTree, label: 'Category', value: _category, options: [
          ('all', 'All Categories'),
          for (final c in cats.where((c) => all.any((p) => toInt(p['categoryId']) == toInt(c['id'])))) ('${c['id']}', '${c['name']}'),
          if (all.any((p) => p['categoryId'] == null)) ('none', 'Uncategorized'),
        ], onChanged: (v) => set(() => _category = v)),
      if (on('so2-filters', 'so2-f-units')) WebSelect<String>(icon: LucideIcons.layers, label: 'Units', value: _units, options: const [('all', 'All Products'), ('yes', 'With Units'), ('no', 'Without Units')], onChanged: (v) => set(() => _units = v)),
      if (on('so2-filters', 'so2-f-stock')) WebSelect<String>(icon: LucideIcons.boxes, label: 'Stock', value: _stock, options: const [('all', 'All'), ('zero', 'Zero stock'), ('unset', 'Stock not set')], onChanged: (v) => set(() => _stock = v)),
    ];
    bool col(String k) => on('so2-table', k);

    return WebPage(
      title: 'Stock Out Products',
      subtitle: 'Physical products that are currently out of stock',
      onRefresh: () => s.syncNow(only: const ['products', 'categories']),
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => export(list, 'shown')),
      ],
      children: [
        ...webCardsRow(cards),
        ...webFilterCard(filters),
        WebList(
          rows: list,
          total: all.length,
          selectable: col('so2-c-select'),
          filtersOn: _filtersOn,
          onClearFilters: () => set(() {
            _q = '';
            _status = _category = _units = _stock = 'all';
          }),
          search: col('so2-t-search') ? WebSearch(width: 240, hint: 'Name, SKU, barcode…', onChanged: (v) => set(() => _q = v)) : null,
          empty: 'Nothing is out of stock. 🎉',
          onTap: edit,
          bulk: (n) => [
            DMenuItem('active', 'Set Active ($n)', icon: LucideIcons.badgeCheck),
            DMenuItem('inactive', 'Set Inactive ($n)', icon: LucideIcons.eyeOff),
            DMenuItem('export', 'Export selected ($n)', icon: LucideIcons.download, shortcut: 'Excel'),
          ],
          onBulk: (a, rows) async => switch (a) {
            'active' => await setStatus(rows, 'active'),
            'inactive' => await setStatus(rows, 'inactive'),
            _ => export(rows, 'selected'),
          },
          cols: [
            if (col('so2-c-image')) ListCol(const WebCol('Image', width: 64), (p) => NetImage(p['image'], size: 36, radius: 6, placeholder: LucideIcons.image)),
            if (col('so2-c-name'))
              ListCol(const WebCol('Name', flex: 2.4), (p) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${p['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                    if ('${p['sku'] ?? ''}'.isNotEmpty) Text('SKU ${p['sku']}', style: const TextStyle(fontSize: 11.5, color: W.g500)),
                  ]), sort: (p) => lower(p['name'])),
            if (col('so2-c-category'))
              ListCol(const WebCol('Category', flex: 1.2), (p) => p['categoryId'] == null
                  ? const Text('Uncategorized', style: TextStyle(fontSize: 13, color: W.g400))
                  : InkWell(onTap: () => set(() => _category = '${p['categoryId']}'), child: Text(catName[toInt(p['categoryId'])] ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g600))), sort: (p) => lower(catName[toInt(p['categoryId'])])),
            if (col('so2-c-price')) ListCol(const WebCol('Price', flex: .9), (p) => Text(money(price(p)), style: const TextStyle(fontSize: 13)), sort: (p) => price(p)),
            if (col('so2-c-status'))
              ListCol(const WebCol('Status', flex: 1.1), (p) => WebPillMenu(value: p['status'] == 'active' ? 'Active' : 'Inactive', options: const ['Active', 'Inactive'], color: p['status'] == 'active' ? W.green : W.grey, onSelected: (v) => setStatus([p], v == 'Active' ? 'active' : 'inactive')),
                  sort: (p) => lower(p['status'])),
            if (col('so2-c-stock'))
              ListCol(const WebCol('Stock', flex: 1.1), (p) => Align(
                    alignment: Alignment.centerLeft,
                    child: Tooltip(
                      message: 'Click to update stock',
                      child: Material(
                        color: const Color(0xFFDC3545),
                        borderRadius: BorderRadius.circular(6),
                        child: InkWell(
                          onTap: () => adjustStock(context, p),
                          borderRadius: BorderRadius.circular(6),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Text(p['stock'] == null ? 'Not set' : '${p['stock']}${'${p['unit'] ?? ''}'.isEmpty ? '' : ' ${p['unit']}'}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
                              const SizedBox(width: 4),
                              const Icon(LucideIcons.chevronDown, size: 13, color: Colors.white),
                            ]),
                          ),
                        ),
                      ),
                    ),
                  ), sort: (p) => p['stock'] == null ? -1.0 : toDouble(p['stock'])),
            if (col('so2-c-actions'))
              ListCol(const WebCol('Actions', width: 96), (p) => Row(children: [
                    WebIconAction(LucideIcons.packagePlus, color: W.green, tooltip: 'Restock ${p['name']}', onTap: () => adjustStock(context, p)),
                    WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${p['name']}', onTap: () => edit(p)),
                  ])),
          ],
        ),
      ],
    );
  }
}
