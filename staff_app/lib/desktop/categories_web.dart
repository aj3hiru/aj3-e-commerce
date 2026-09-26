import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../features/categories/categories_screen.dart' show editCategory;
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "Categories" as on the website: number cards and the bordered table.
class CategoriesWeb extends StatefulWidget {
  const CategoriesWeb({super.key});
  @override
  State<CategoriesWeb> createState() => _CategoriesWebState();
}

class _CategoriesWebState extends State<CategoriesWeb> {
  String _q = '';
  String _status = 'all';
  String _sort = 'new';
  int _page = 0, _per = 10;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final cats = s.list('categories');
    final products = s.list('products');
    int count(Map c) => products.where((p) => toInt(p['categoryId']) == toInt(c['id'])).length;
    final q = _q.trim().toLowerCase();
    final list = cats.where((c) => (_status == 'all' || (c['status'] == 'active') == (_status == 'active')) && (q.isEmpty || '${c['name']} ${c['slug'] ?? ''}'.toLowerCase().contains(q))).toList();
    switch (_sort) {
      case 'name':
        list.sort((a, b) => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()));
      case 'products':
        list.sort((a, b) => count(b).compareTo(count(a)));
      case 'old':
        list.sort((a, b) => toInt(a['id']).compareTo(toInt(b['id'])));
      default:
        list.sort((a, b) => toInt(b['id']).compareTo(toInt(a['id'])));
    }
    final shown = WebPager.slice(list, _page, _per);
    final assigned = products.where((p) => p['categoryId'] != null).length;

    return WebPage(
      title: 'Categories',
      subtitle: 'Manage and organize your product catalog',
      onRefresh: () => s.syncNow(only: const ['categories', 'products']),
      actions: [
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Categories', const ['Name', 'Slug', 'Products', 'Serial', 'Status'], [
              for (final c in list) [c['name'], c['slug'], count(c), c['serial'], c['status']],
            ])),
        WebButton('Add Category', icon: LucideIcons.plus, color: W.blue, onPressed: () => editCategory(context, null)),
      ],
      children: [
        WebGrid(children: [
          WebMetric(icon: LucideIcons.layoutGrid, color: W.primary, value: '${cats.length}', label: 'Total Categories', selected: _status == 'all', onTap: () => _set(() => _status = 'all')),
          WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF16A34A), value: '${cats.where((c) => c['status'] == 'active').length}', label: 'Active Categories', selected: _status == 'active', onTap: () => _set(() => _status = 'active')),
          WebMetric(icon: LucideIcons.circleX, color: const Color(0xFFEF4444), value: '${cats.where((c) => c['status'] != 'active').length}', label: 'Inactive Categories', selected: _status == 'inactive', onTap: () => _set(() => _status = 'inactive')),
          WebMetric(icon: LucideIcons.boxes, color: W.blue, value: '$assigned', label: 'Products Assigned', onTap: () => context.read<NavController>().go('products')),
        ]),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 16, runSpacing: 10, children: [
              WebSearch(width: 260, hint: 'Search categories...', onChanged: (v) => _set(() => _q = v)),
              WebSelect<String>(width: 160, value: _status, options: const [('all', 'Status:  All'), ('active', 'Status:  Active'), ('inactive', 'Status:  Inactive')], onChanged: (v) => _set(() => _status = v)),
              WebSelect<String>(width: 200, value: _sort, options: const [('new', 'Sort by:  Newest First'), ('old', 'Sort by:  Oldest First'), ('name', 'Sort by:  Name A–Z'), ('products', 'Sort by:  Most products')], onChanged: (v) => _set(() => _sort = v)),
            ]),
            const SizedBox(height: 16),
            WebTable(
              bordered: true,
              rowHeight: 74,
              cols: const [WebCol('Image', width: 90), WebCol('Category Name', flex: 1.6), WebCol('Slug', flex: 1.1), WebCol('Products', flex: .7), WebCol('Serial', flex: .7), WebCol('Status', flex: .9), WebCol('Actions', width: 100)],
              onRowTap: [for (final c in shown) () => editCategory(context, c)],
              rows: [
                for (final c in shown)
                  [
                    Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)), child: NetImage(c['image'], size: 48, radius: 8, placeholder: LucideIcons.image)),
                    Text('${c['name']}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
                    Text('${c['slug'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, color: W.g500)),
                    InkWell(
                      onTap: () => context.read<NavController>().go('products', {'category': toInt(c['id'])}),
                      child: Text('${count(c)}', style: const TextStyle(fontSize: 15, color: W.g900)),
                    ),
                    Text('${c['serial'] ?? 0}'.padLeft(3, '0'), style: const TextStyle(fontSize: 15, color: W.g700)),
                    WebPill(c['status'] == 'active' ? 'Active' : 'Inactive', color: c['status'] == 'active' ? W.green : W.grey),
                    Row(children: [WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit', onTap: () => editCategory(context, c))]),
                  ],
              ],
            ),
            WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v)),
          ]),
        ),
      ],
    );
  }
}
