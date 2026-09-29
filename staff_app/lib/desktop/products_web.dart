import 'dart:io';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../features/native/catalog_pages.dart' show BarcodePrintPage;
import '../features/products/product_edit_screen.dart';
import '../features/products/products_screen.dart' show adjustStock;
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "All Products" exactly as on the website (admin/ecommerce/products): 4 number cards, 5 filters,
/// Show [n] entries · Select All · Bulk Actions, the gridded table (select, image, name, stock,
/// category, price, status, type, item type, actions: barcode / edit / delete) with sortable
/// columns — and the website's Display Options. Works from the data on this computer (offline too).
class ProductsWeb extends StatefulWidget {
  const ProductsWeb({super.key});
  @override
  State<ProductsWeb> createState() => _ProductsWebState();
}

class _ProductsWebState extends State<ProductsWeb> {
  static final _def = displayDefs['ecom_products2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  int _navSeq = -1;
  String _q = '', _status = 'all', _stock = 'all', _type = 'all', _item = 'all';
  int _category = 0;
  int _page = 0, _per = 20; // _per 0 = all
  String _sort = 'created';
  bool _asc = false;
  final Set<int> _selected = {};

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  bool get _filtersOn => _q.isNotEmpty || _status != 'all' || _stock != 'all' || _type != 'all' || _item != 'all' || _category != 0;

  void _sortBy(String k) => setState(() {
        if (_sort == k) {
          _asc = !_asc;
        } else {
          _sort = k;
          _asc = k == 'name' || k == 'category';
        }
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
    return ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));
  }

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final settings = s.settings;
    final badges = {for (final b in ((settings['badges'] as List?) ?? const []).cast<Map>()) '${b['slug']}': Map<String, dynamic>.from(b)};
    final items = {for (final t in ((settings['itemTypes'] as List?) ?? const []).cast<Map>()) '${t['slug']}': '${t['label']}'};
    String typeLabel(Map p) => p['badgeTag'] == null || p['badgeTag'] == 'none' ? 'None' : '${badges['${p['badgeTag']}']?['label'] ?? p['badgeTag']}';
    String itemLabel(Map p) => p['itemType'] == null || p['itemType'] == 'normal' ? 'Normal' : items['${p['itemType']}'] ?? '${p['itemType']}';
    final cats = s.list('categories');
    final catName = {for (final c in cats) toInt(c['id']): '${c['name']}'};
    final all = s.list('products');
    bool physical(Map p) => p['type'] == 'physical';
    bool out(Map p) => physical(p) && (p['stock'] == null || toInt(p['stock']) <= 0);
    bool low(Map p) => physical(p) && p['stock'] != null && toInt(p['stock']) > 0 && toInt(p['stock']) <= 5;
    double price(Map p) => toDouble(p['salePrice']) > 0 ? toDouble(p['salePrice']) : toDouble(p['price']);
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);

    final list = all.where((p) {
      if (_status == 'active' && p['status'] != 'active') return false;
      if (_status == 'inactive' && p['status'] == 'active') return false;
      if (_stock == 'in' && (!physical(p) || out(p))) return false;
      if (_stock == 'low' && !low(p)) return false;
      if (_stock == 'out' && !out(p)) return false;
      if (_category != 0 && toInt(p['categoryId']) != _category) return false;
      if (_type != 'all' && '${p['badgeTag'] ?? 'none'}' != _type) return false;
      if (_item != 'all' && '${p['itemType'] ?? 'normal'}' != _item) return false;
      final hay = '${p['name']} ${p['sku'] ?? ''} ${p['barcode'] ?? ''} ${catName[toInt(p['categoryId'])] ?? ''}'.toLowerCase();
      return words.every(hay.contains);
    }).toList();
    int cmp(Map a, Map b) => switch (_sort) {
          'name' => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()),
          'stock' => (a['stock'] == null ? -1 : toInt(a['stock'])).compareTo(b['stock'] == null ? -1 : toInt(b['stock'])),
          'category' => (catName[toInt(a['categoryId'])] ?? '').compareTo(catName[toInt(b['categoryId'])] ?? ''),
          'price' => price(a).compareTo(price(b)),
          'status' => '${a['status']}'.compareTo('${b['status']}'),
          'type' => typeLabel(a).compareTo(typeLabel(b)),
          'item' => itemLabel(a).compareTo(itemLabel(b)),
          _ => '${a['createdAt'] ?? ''}'.compareTo('${b['createdAt'] ?? ''}'),
        };
    list.sort((a, b) => _asc ? cmp(a, b) : cmp(b, a));
    final shown = _per == 0 ? list : WebPager.slice(list, _page, _per);
    _selected.removeWhere((id) => !all.any((p) => toInt(p['id']) == id));

    void edit(Map<String, dynamic>? p) {
      if (p != null && toInt(p['id']) < 0) return toast(context, '“${p['name']}” is still being added — it can be changed in a moment.');
      Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: p)));
    }

    Future<void> setStatus(List<int> ids, String status) async {
      final word = status == 'active' ? 'published' : 'unpublished';
      final change = all.where((p) => ids.contains(toInt(p['id'])) && toInt(p['id']) > 0 && p['status'] != status).toList();
      if (change.isEmpty) return toast(context, ids.length == 1 ? 'Already $word.' : 'All ${ids.length} are already $word.');
      for (final p in change) {
        await s.enqueue(OutboxItem(
          id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: {'status': status}, label: '${p['name']}: $word',
          effect: {'kind': 'product', 'id': p['id'], 'fields': {'status': status}}, refresh: const ['products'],
        ));
      }
      if (context.mounted) toast(context, change.length == 1 ? 'Product $word.' : '${change.length} products $word.');
    }

    Future<void> delete(List<int> ids) async {
      final rows = all.where((p) => ids.contains(toInt(p['id'])) && toInt(p['id']) > 0).toList();
      if (rows.isEmpty) return;
      final label = rows.length == 1 ? '“${rows.first['name']}”' : '${rows.length} selected products';
      if (!await confirm(context, 'Confirm Delete?', 'Delete $label? This cannot be undone.', ok: 'Delete', danger: true)) return;
      var gone = 0;
      final refused = <String>[];
      for (final p in rows) {
        final r = await s.sendNow(OutboxItem(
          id: newId(), method: 'DELETE', path: '/api/ecommerce/products/${p['id']}', label: 'Delete product: ${p['name']}',
          effect: {'kind': 'product_delete', 'ids': [p['id']]}, refresh: const ['products'],
        ));
        if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) {
          refused.add('“${p['name']}”');
        } else {
          gone++;
          _selected.remove(toInt(p['id']));
        }
      }
      if (!context.mounted) return;
      setState(() {});
      if (refused.isEmpty) return toast(context, gone == 1 ? 'Product deleted.' : '$gone products deleted.');
      toast(context,
          "${gone > 0 ? '$gone deleted. ' : ''}Couldn't delete ${refused.take(2).join(', ')}${refused.length > 2 ? ' and ${refused.length - 2} more' : ''}. A product that already appears in orders can't be deleted — set it to Unpublish to hide it instead.",
          error: true);
    }

    void barcodes(List<int> ids) => Navigator.push(context, MaterialPageRoute(builder: (_) => BarcodePrintPage(ids: ids)));

    void export(List<Map<String, dynamic>> rows, String which) => exportTable(context, 'Products ($which)', const ['ID', 'Name', 'SKU', 'Barcode', 'Category', 'Price', 'Sale Price', 'Stock', 'Unit', 'Status', 'Type', 'Item Type'], [
          for (final p in rows)
            [p['id'], p['name'], p['sku'], p['barcode'], catName[toInt(p['categoryId'])], toDouble(p['price']), p['salePrice'] == null ? null : toDouble(p['salePrice']), p['stock'], p['unit'], p['status'] == 'active' ? 'Published' : 'Unpublished', typeLabel(p), itemLabel(p)],
        ]);
    final selectedRows = all.where((p) => _selected.contains(toInt(p['id']))).toList();

    // ── table columns (Display Options → Products Table) ──
    final pageIds = [for (final p in shown) toInt(p['id'])];
    final pageAll = pageIds.isNotEmpty && pageIds.every(_selected.contains);
    final cols = <(String, WebCol, Widget Function(Map<String, dynamic>))>[
      if (on('p2-table', 'p2-c-select'))
        (
          'select',
          WebCol('', width: 44, head: Checkbox(value: pageAll, onChanged: (v) => setState(() => v == true ? _selected.addAll(pageIds) : _selected.removeAll(pageIds)))),
          (p) => Checkbox(value: _selected.contains(toInt(p['id'])), onChanged: (v) => setState(() => v == true ? _selected.add(toInt(p['id'])) : _selected.remove(toInt(p['id'])))),
        ),
      if (on('p2-table', 'p2-c-image'))
        (
          'image',
          const WebCol('Image', width: 64),
          (p) => Container(
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), border: Border.all(color: W.g200)),
                child: p['image'] == null && p['localImage'] != null
                    ? ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(File('${p['localImage']}'), width: 36, height: 36, fit: BoxFit.cover))
                    : NetImage(p['image'], size: 36, radius: 6, placeholder: LucideIcons.image),
              ),
        ),
      if (on('p2-table', 'p2-c-name'))
        (
          'name',
          WebCol('Name', flex: 2.2, onSort: () => _sortBy('name'), sorted: _sort == 'name' ? _asc : null),
          (p) => Text('${p['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
        ),
      if (on('p2-table', 'p2-c-stock'))
        (
          'stock',
          WebCol('Stock', flex: 1.35, onSort: () => _sortBy('stock'), sorted: _sort == 'stock' ? _asc : null),
          (p) => Row(children: [
                Flexible(
                  child: Text(
                    !physical(p) ? '∞' : p['stock'] == null ? '—' : '${p['stock']}${p['unit'] != null && '${p['unit']}'.isNotEmpty ? ' ${p['unit']}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: out(p) ? const Color(0xFFDC2626) : low(p) ? const Color(0xFFD97706) : W.g900),
                  ),
                ),
                if (physical(p) && toInt(p['id']) > 0) ...[
                  const SizedBox(width: 8),
                  Tooltip(
                    message: 'Update stock',
                    child: Material(
                      color: W.green,
                      borderRadius: BorderRadius.circular(4),
                      child: InkWell(onTap: () => adjustStock(context, p), borderRadius: BorderRadius.circular(4), child: const SizedBox(width: 28, height: 24, child: Icon(LucideIcons.plus, size: 15, color: Colors.white))),
                    ),
                  ),
                ],
              ]),
        ),
      if (on('p2-table', 'p2-c-category'))
        (
          'category',
          WebCol('Category', flex: 1.1, onSort: () => _sortBy('category'), sorted: _sort == 'category' ? _asc : null),
          (p) => p['categoryId'] == null ? webDash : Text(catName[toInt(p['categoryId'])] ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g600)),
        ),
      if (on('p2-table', 'p2-c-price'))
        (
          'price',
          WebCol('Price', flex: 1, onSort: () => _sortBy('price'), sorted: _sort == 'price' ? _asc : null),
          (p) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(money(price(p)), style: const TextStyle(fontSize: 13, color: W.g900)),
                if (toDouble(p['salePrice']) > 0 && toDouble(p['salePrice']) < toDouble(p['price'])) Text(money(p['price']), style: const TextStyle(fontSize: 12, color: W.g400, decoration: TextDecoration.lineThrough)),
              ]),
        ),
      if (on('p2-table', 'p2-c-status'))
        (
          'status',
          WebCol('Status', flex: 1.35, onSort: () => _sortBy('status'), sorted: _sort == 'status' ? _asc : null),
          (p) => WebPillMenu(
                value: p['status'] == 'active' ? 'Published' : 'Unpublished',
                options: const ['Published', 'Unpublished'],
                color: p['status'] == 'active' ? W.green : W.grey,
                onSelected: toInt(p['id']) < 0 ? null : (v) => setStatus([toInt(p['id'])], v == 'Published' ? 'active' : 'inactive'),
              ),
        ),
      if (on('p2-table', 'p2-c-type'))
        (
          'type',
          WebCol('Type', flex: 1, onSort: () => _sortBy('type'), sorted: _sort == 'type' ? _asc : null),
          (p) {
            final b = badges['${p['badgeTag']}'];
            if (b == null) return const Text('None', style: TextStyle(fontSize: 13, color: W.g500));
            return Row(children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: _hex(b['color']) ?? const Color(0xFF6B7280))),
              const SizedBox(width: 6),
              Flexible(child: Text('${b['label']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g800))),
            ]);
          },
        ),
      if (on('p2-table', 'p2-c-item'))
        (
          'item',
          WebCol('Item Type', flex: 1, onSort: () => _sortBy('item'), sorted: _sort == 'item' ? _asc : null),
          (p) => Text(itemLabel(p), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g700)),
        ),
      if (on('p2-table', 'p2-c-actions'))
        (
          'actions',
          const WebCol('Actions', width: 124),
          (p) => Row(children: [
                WebIconAction(LucideIcons.barcode, color: const Color(0xFF0EA5E9), tooltip: 'Print barcode for ${p['name']}', onTap: '${p['barcode'] ?? ''}'.isEmpty ? () => toast(context, 'Add a barcode to this product first.') : () => barcodes([toInt(p['id'])])),
                WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${p['name']}', onTap: () => edit(p)),
                WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete ${p['name']}', onTap: () => delete([toInt(p['id'])])),
              ]),
        ),
    ];

    final cards = [
      if (on('p2-cards', 'p2-k-total'))
        WebMetric(icon: LucideIcons.shoppingBag, color: W.orange, value: '${all.length}', label: 'Total Products', selected: !_filtersOn, onTap: () => _set(() {
              _status = 'all';
              _stock = 'all';
            })),
      if (on('p2-cards', 'p2-k-published'))
        WebMetric(icon: LucideIcons.badgeCheck, color: const Color(0xFF10B981), value: '${all.where((p) => p['status'] == 'active').length}', label: 'Published', selected: _status == 'active', onTap: () => _set(() => _status = 'active')),
      if (on('p2-cards', 'p2-k-low'))
        WebMetric(icon: LucideIcons.triangleAlert, color: const Color(0xFFEAB308), value: '${all.where(low).length}', label: 'Low Stock', selected: _stock == 'low', onTap: () => _set(() => _stock = 'low')),
      if (on('p2-cards', 'p2-k-out'))
        WebMetric(icon: LucideIcons.packageX, color: const Color(0xFFEF4444), value: '${all.where(out).length}', label: 'Out of Stock', selected: _stock == 'out', onTap: () => _set(() => _stock = 'out')),
    ];
    final filters = [
      if (on('p2-filters', 'p2-f-status'))
        WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All Status'), ('active', 'Published'), ('inactive', 'Unpublished')], onChanged: (v) => _set(() => _status = v)),
      if (on('p2-filters', 'p2-f-stock'))
        WebSelect<String>(icon: LucideIcons.boxes, label: 'Stock', value: _stock, options: const [('all', 'All Stock'), ('in', 'In Stock'), ('low', 'Low Stock'), ('out', 'Out of Stock')], onChanged: (v) => _set(() => _stock = v)),
      if (on('p2-filters', 'p2-f-category'))
        WebSelect<int>(icon: LucideIcons.listTree, label: 'Category', value: _category, options: [(0, 'All Categories'), for (final c in cats) (toInt(c['id']), '${c['name']}')], onChanged: (v) => _set(() => _category = v)),
      if (on('p2-filters', 'p2-f-type'))
        WebSelect<String>(icon: LucideIcons.tag, label: 'Type', value: _type, options: [('all', 'All Types'), ('none', 'None'), for (final b in badges.values) ('${b['slug']}', '${b['label']}')], onChanged: (v) => _set(() => _type = v)),
      if (on('p2-filters', 'p2-f-item'))
        WebSelect<String>(icon: LucideIcons.shapes, label: 'Item Type', value: _item, options: [('all', 'All Item Types'), ('normal', 'Normal'), for (final e in items.entries.where((e) => e.key != 'normal')) (e.key, e.value)], onChanged: (v) => _set(() => _item = v)),
    ];

    Widget bulk() => Builder(
          builder: (c) => WebButton('Bulk Actions', icon: LucideIcons.layers, tooltip: _selected.isEmpty ? 'Select products first' : null, onPressed: _selected.isEmpty
              ? null
              : () async {
                  final box = c.findRenderObject() as RenderBox;
                  final v = await showDMenu<String>(c, box.localToGlobal(Offset(0, box.size.height + 4)), [
                    DMenuItem('publish', 'Publish (${_selected.length})', icon: LucideIcons.badgeCheck),
                    DMenuItem('unpublish', 'Unpublish (${_selected.length})', icon: LucideIcons.eyeOff),
                    DMenuItem('barcodes', 'Print Barcodes (${_selected.length})', icon: LucideIcons.barcode),
                    null,
                    DMenuItem('delete', 'Delete (${_selected.length})', icon: LucideIcons.trash2, danger: true),
                  ]);
                  final ids = _selected.toList();
                  switch (v) {
                    case 'publish':
                      await setStatus(ids, 'active');
                    case 'unpublish':
                      await setStatus(ids, 'inactive');
                    case 'barcodes':
                      barcodes(ids);
                    case 'delete':
                      await delete(ids);
                  }
                }),
        );

    Widget exportButton() => Builder(
          builder: (c) => WebButton('Export', icon: LucideIcons.download, onPressed: () async {
            final box = c.findRenderObject() as RenderBox;
            final v = await showDMenu<String>(c, box.localToGlobal(Offset(0, box.size.height + 4)), [
              DMenuItem('shown', 'Shown products (${list.length})', shortcut: 'Excel', enabled: list.isNotEmpty),
              DMenuItem('selected', 'Selected products (${selectedRows.length})', shortcut: 'Excel', enabled: selectedRows.isNotEmpty),
              DMenuItem('all', 'All products (${all.length})', shortcut: 'Excel', enabled: all.isNotEmpty),
            ]);
            if (v == 'shown') export(list, 'shown');
            if (v == 'selected') export(selectedRows, 'selected');
            if (v == 'all') export(all, 'all');
          }),
        );

    final table = cols.isEmpty
        ? const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: Text('All table columns are hidden — turn them on from Display Options.', style: TextStyle(color: W.g400))))
        : WebTable(
            bordered: true,
            rowHeight: 54,
            cols: [for (final c in cols) c.$2],
            rows: [for (final p in shown) [for (final c in cols) c.$3(p)]],
            onRowTap: [for (final p in shown) () => edit(p)],
            empty: Center(
              child: all.isEmpty
                  ? TextButton(onPressed: () => edit(null), child: const Text('No products yet. Add your first product'))
                  : const Text('No products match these filters.', style: TextStyle(color: W.g400)),
            ),
          );

    return WebPage(
      title: 'All Products',
      subtitle: 'Manage everything you sell in your store',
      onRefresh: () => s.syncNow(only: const ['products', 'categories', 'brands', 'settings']),
      actions: [
        WebSearch(width: 240, hint: 'Search products, SKU, barcode', onChanged: (v) => _set(() => _q = v)),
        DisplayOptionsButton(_def),
        exportButton(),
        WebButton('Add Product', icon: LucideIcons.plus, color: W.orange, onPressed: () => edit(null)),
      ],
      children: [
        if (cards.isNotEmpty) ...[WebGrid(children: cards), const SizedBox(height: 12)],
        if (filters.isNotEmpty) ...[
          WebCard(padding: const EdgeInsets.all(14), child: WebGrid(columns: filters.length, gap: 12, minWidth: 170, children: filters)),
          const SizedBox(height: 12),
        ],
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Show [20] entries · Select All · Bulk Actions ··········· Clear filters
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Wrap(spacing: 16, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('Show ', style: TextStyle(fontSize: 13.5, color: W.g800)),
                  SizedBox(width: 88, child: WebSelect<int>(value: _per, options: const [(10, '10'), (20, '20'), (50, '50'), (100, '100'), (0, 'All')], onChanged: (v) => _set(() => _per = v))),
                  const Text(' entries', style: TextStyle(fontSize: 13.5, color: W.g800)),
                ]),
                if (on('p2-table', 'p2-c-select')) ...[
                  InkWell(
                    onTap: () => setState(() {
                      final ids = list.map((p) => toInt(p['id']));
                      ids.every(_selected.contains) ? _selected.removeAll(ids) : _selected.addAll(ids);
                    }),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      IgnorePointer(child: Checkbox(value: list.isNotEmpty && list.every((p) => _selected.contains(toInt(p['id']))), onChanged: (_) {})),
                      Text('Select All (${_selected.length})', style: const TextStyle(fontSize: 13.5, color: W.g800)),
                    ]),
                  ),
                  bulk(),
                  if (_selected.isNotEmpty) TextButton(onPressed: () => setState(_selected.clear), child: const Text('Clear selection', style: TextStyle(fontSize: 13, color: W.g500))),
                ],
                if (_filtersOn)
                  TextButton.icon(
                    onPressed: () => _set(() {
                      _q = '';
                      _status = _stock = _type = _item = 'all';
                      _category = 0;
                    }),
                    icon: const Icon(LucideIcons.x, size: 14, color: W.orange),
                    label: const Text('Clear filters', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.orange)),
                  ),
              ]),
            ),
            table,
            if (_per == 0)
              Padding(padding: const EdgeInsets.only(top: 10), child: Text('Showing ${list.length} entries${list.length != all.length ? ' (filtered from ${all.length} total entries)' : ''}', style: const TextStyle(fontSize: 13, color: W.g700)))
            else
              WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v), extra: list.length != all.length ? ' (filtered from ${all.length} total entries)' : null),
          ]),
        ),
      ],
    );
  }
}

Color? _hex(Object? v) {
  final s = '${v ?? ''}'.replaceAll('#', '');
  if (s.length != 6) return null;
  final n = int.tryParse(s, radix: 16);
  return n == null ? null : Color(0xFF000000 | n);
}
