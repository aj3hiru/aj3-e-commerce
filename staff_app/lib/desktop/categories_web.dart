import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../features/categories/categories_screen.dart' show editCategory;
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

/// "Categories" as on the website: 4 cards, Status / Sort filters, select + Bulk Actions
/// (Activate / Deactivate / Export / Delete), the table (image, name, slug, products, serial,
/// status, last updated, actions) and Display Options. From the synced list — works offline.
class CategoriesWeb extends StatefulWidget {
  const CategoriesWeb({super.key});
  @override
  State<CategoriesWeb> createState() => _CategoriesWebState();
}

class _CategoriesWebState extends State<CategoriesWeb> {
  static final _def = displayDefs['ecom_categories2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _status = 'all', _sort = 'newest';
  bool get _filtersOn => _q.isNotEmpty || _status != 'all';
  void _clear() => setState(() {
        _q = '';
        _status = 'all';
      });

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final cats = s.list('categories');
    final products = s.list('products');
    final counts = <int, int>{};
    for (final p in products) {
      if (p['categoryId'] != null) counts[toInt(p['categoryId'])] = (counts[toInt(p['categoryId'])] ?? 0) + 1;
    }
    int count(Map c) => counts[toInt(c['id'])] ?? 0;
    String updated(Map c) => '${c['updatedAt'] ?? c['createdAt'] ?? ''}';
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = cats.where((c) => (_status == 'all' || (c['status'] == 'active') == (_status == 'active')) && words.every('${c['name']} ${c['slug'] ?? ''}'.toLowerCase().contains)).toList();
    int cmp(Map a, Map b) => switch (_sort) {
          'oldest' => updated(a).compareTo(updated(b)),
          'name-asc' => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()),
          'name-desc' => '${b['name']}'.toLowerCase().compareTo('${a['name']}'.toLowerCase()),
          'serial' => toInt(a['serial']).compareTo(toInt(b['serial'])),
          'products' => count(b).compareTo(count(a)),
          _ => updated(b).compareTo(updated(a)),
        };
    list.sort(cmp);

    Future<void> patch(List<Map<String, dynamic>> rows, String status) async {
      final change = rows.where((c) => c['status'] != status).toList();
      for (final c in change) {
        await s.enqueue(OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/categories2/${c['id']}', body: {'status': status}, label: '${c['name']}: ${status == 'active' ? 'activated' : 'deactivated'}',
            effect: {'kind': 'set_row', 'set': 'categories', 'id': c['id'], 'fields': {'status': status}}, refresh: const ['categories']));
      }
      if (context.mounted) toast(context, change.isEmpty ? 'Nothing to change.' : '${change.length == 1 ? '“${change.first['name']}”' : '${change.length} categories'} ${status == 'active' ? 'activated' : 'deactivated'}.');
    }

    Future<void> delete(List<Map<String, dynamic>> rows) async {
      final used = rows.fold<int>(0, (t, c) => t + count(c));
      final what = rows.length == 1 ? '“${rows.first['name']}”' : '${rows.length} categories';
      if (!await confirm(context, 'Delete $what?', used > 0 ? '$used product${used == 1 ? ' is' : 's are'} in ${rows.length == 1 ? 'this category' : 'these categories'} — they will stay, just without a category.' : 'This cannot be undone.', ok: 'Delete', danger: true)) return;
      var failed = 0;
      for (final c in rows) {
        final r = await s.sendNow(OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/categories2/${c['id']}${count(c) > 0 ? '?detach=1' : ''}', label: 'Delete category: ${c['name']}',
            effect: {'kind': 'set_row_delete', 'set': 'categories', 'ids': [c['id']]}, refresh: const ['categories', 'products']));
        if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) failed++;
      }
      if (context.mounted) toast(context, failed > 0 ? "Couldn't delete $failed of them." : '$what deleted.', error: failed > 0);
    }

    void export(List<Map<String, dynamic>> rows) => exportTable(context, 'Categories', const ['ID', 'Name', 'Slug', 'Products', 'Serial', 'Status', 'Last Updated'], [
          for (final c in rows) [c['id'], c['name'], c['slug'], count(c), c['serial'], c['status'] == 'active' ? 'Active' : 'Inactive', dateTime(c['updatedAt'] ?? c['createdAt'])],
        ]);
    void viewProducts(Map c) => context.read<NavController>().go('products', {'category': toInt(c['id'])});
    bool col(String k) => on('c2-table', k);

    return WebPage(
      title: 'Categories',
      subtitle: 'Manage and organize your product catalog',
      onRefresh: () => s.syncNow(only: const ['categories', 'products']),
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => export(list)),
        WebButton('Add Category', icon: LucideIcons.plus, color: W.blue, onPressed: () => editCategory(context, null)),
      ],
      children: [
        ...webCardsRow([
          if (on('c2-cards', 'c2-k-total')) WebMetric(icon: LucideIcons.layoutGrid, color: const Color(0xFF7C3AED), value: '${cats.length}', label: 'Total Categories', selected: !_filtersOn, onTap: _clear),
          if (on('c2-cards', 'c2-k-active'))
            WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF059669), value: '${cats.where((c) => c['status'] == 'active').length}', label: 'Active Categories', selected: _status == 'active', onTap: () => setState(() => _status = _status == 'active' ? 'all' : 'active')),
          if (on('c2-cards', 'c2-k-inactive'))
            WebMetric(icon: LucideIcons.circleX, color: const Color(0xFFEF4444), value: '${cats.where((c) => c['status'] != 'active').length}', label: 'Inactive Categories', selected: _status == 'inactive', onTap: () => setState(() => _status = _status == 'inactive' ? 'all' : 'inactive')),
          if (on('c2-cards', 'c2-k-products')) WebMetric(icon: LucideIcons.boxes, color: const Color(0xFF2563EB), value: '${products.where((p) => p['categoryId'] != null).length}', label: 'Products Assigned', onTap: () => context.read<NavController>().go('products')),
        ]),
        ...webFilterCard([
          if (on('c2-filters', 'c2-f-status')) WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All'), ('active', 'Active'), ('inactive', 'Inactive')], onChanged: (v) => setState(() => _status = v)),
          if (on('c2-filters', 'c2-f-sort'))
            WebSelect<String>(icon: LucideIcons.arrowUpDown, label: 'Sort', value: _sort, options: const [('newest', 'Newest First'), ('oldest', 'Oldest First'), ('name-asc', 'Name (A–Z)'), ('name-desc', 'Name (Z–A)'), ('serial', 'Serial'), ('products', 'Most Products')], onChanged: (v) => setState(() => _sort = v)),
        ]),
        WebList(
          rows: list,
          total: cats.length,
          rowHeight: 66,
          selectable: col('c2-c-select'),
          filtersOn: _filtersOn,
          onClearFilters: _clear,
          search: col('c2-t-search') ? WebSearch(width: 240, hint: 'Search categories…', onChanged: (v) => setState(() => _q = v)) : null,
          empty: 'No categories yet.',
          onTap: (c) => editCategory(context, c),
          bulk: (n) => [
            DMenuItem('active', 'Activate ($n)', icon: LucideIcons.circleCheck),
            DMenuItem('inactive', 'Deactivate ($n)', icon: LucideIcons.circleX),
            DMenuItem('export', 'Export selected ($n)', icon: LucideIcons.download, shortcut: 'Excel'),
            null,
            DMenuItem('delete', 'Delete ($n)', icon: LucideIcons.trash2, danger: true),
          ],
          onBulk: (a, rows) async => switch (a) {
            'active' => await patch(rows, 'active'),
            'inactive' => await patch(rows, 'inactive'),
            'delete' => await delete(rows),
            _ => export(rows),
          },
          cols: [
            if (col('c2-c-image')) ListCol(const WebCol('Image', width: 88), (c) => Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)), child: NetImage(c['image'], size: 46, radius: 8, placeholder: LucideIcons.image))),
            if (col('c2-c-name')) ListCol(const WebCol('Category Name', flex: 1.6), (c) => Text('${c['name']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)), sort: (c) => lower(c['name'])),
            if (col('c2-c-slug')) ListCol(const WebCol('Slug', flex: 1.1), (c) => Text('${c['slug'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g500)), sort: (c) => lower(c['slug'])),
            if (col('c2-c-products'))
              ListCol(const WebCol('Products', flex: .7), (c) => InkWell(onTap: () => viewProducts(c), child: Text('${count(c)}', style: const TextStyle(fontSize: 13, color: Color(0xFF2563EB)))), sort: (c) => count(c).toDouble()),
            if (col('c2-c-serial')) ListCol(const WebCol('Serial', flex: .6), (c) => Text('${c['serial'] ?? 0}'.padLeft(3, '0'), style: const TextStyle(fontSize: 13, color: W.g700)), sort: (c) => toDouble(c['serial'])),
            if (col('c2-c-status'))
              ListCol(const WebCol('Status', flex: .9), (c) => WebPillMenu(value: c['status'] == 'active' ? 'Active' : 'Inactive', options: const ['Active', 'Inactive'], color: c['status'] == 'active' ? W.green : W.grey, onSelected: (v) => patch([c], v == 'Active' ? 'active' : 'inactive'))),
            if (col('c2-c-updated')) ListCol(const WebCol('Last Updated', flex: 1), (c) => Text(dateShort(c['updatedAt'] ?? c['createdAt']), style: const TextStyle(fontSize: 13, color: W.g600)), sort: (c) => updated(c)),
            if (col('c2-c-actions'))
              ListCol(const WebCol('Actions', width: 124), (c) => Row(children: [
                    WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${c['name']}', onTap: () => editCategory(context, c)),
                    WebIconAction(LucideIcons.package, color: W.g700, tooltip: 'View products', onTap: () => viewProducts(c)),
                    WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete ${c['name']}', onTap: () => delete([c])),
                  ])),
          ],
        ),
      ],
    );
  }
}
