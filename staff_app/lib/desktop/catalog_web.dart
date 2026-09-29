import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/adaptive.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/catalog_pages.dart' show editBrand, editTag;
import '../features/native/kit.dart';
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

List<Map<String, dynamic>> _rows(dynamic v) => ((v as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

Color? _hex(Object? v) {
  final s = '${v ?? ''}'.replaceAll('#', '');
  final n = s.length == 6 ? int.tryParse(s, radix: 16) : null;
  return n == null ? null : Color(0xFF000000 | n);
}

/// Sends one change per row (queued when offline), shows one toast.
Future<void> _each(BuildContext context, List<Map<String, dynamic>> rows, OutboxItem Function(Map<String, dynamic> r) item, String done, {Future<void> Function()? reload}) async {
  final s = context.read<AppState>();
  var ok = 0, queued = 0;
  String? error;
  for (final r in rows) {
    final res = await s.sendNow(item(r));
    if (res.ok) {
      ok++;
    } else if (res.outcome == ApiOutcome.offline || res.outcome == ApiOutcome.busy) {
      queued++;
    } else {
      error ??= res.message;
    }
  }
  if (!context.mounted) return;
  if (error != null) {
    toast(context, ok + queued > 0 ? '${ok + queued} done. $error' : error, error: true);
  } else {
    toast(context, done);
  }
  if (ok > 0) await reload?.call();
}

/* ───────────────────────── Brands ───────────────────────── */

class BrandsWeb extends StatelessWidget {
  const BrandsWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'brands', builder: (context, data, reload) => _BrandsWeb(rows: _rows(data), reload: reload));
}

class _BrandsWeb extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _BrandsWeb({required this.rows, required this.reload});
  @override
  State<_BrandsWeb> createState() => _BrandsWebState();
}

class _BrandsWebState extends State<_BrandsWeb> {
  static final _def = displayDefs['ecom_brands2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _status = 'all', _popular = 'all', _logo = 'all', _products = 'all';
  bool get _filtersOn => _q.isNotEmpty || _status != 'all' || _popular != 'all' || _logo != 'all' || _products != 'all';
  void _clear() => setState(() {
        _q = '';
        _status = _popular = _logo = _products = 'all';
      });

  Future<void> _patch(List<Map<String, dynamic>> rows, Map<String, dynamic> change, String word) => _each(
        context,
        rows,
        (b) => OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/brands2/${b['id']}', body: change, label: '${b['name']}: $word', refresh: const ['brands'],
            effect: {'kind': 'page_row', 'page': 'brands', 'id': b['id'], 'fields': change}),
        rows.length == 1 ? '“${rows.first['name']}” $word.' : '${rows.length} brands $word.',
      );

  Future<void> _delete(List<Map<String, dynamic>> rows) async {
    final used = rows.fold<int>(0, (t, b) => t + toInt(b['products']));
    final what = rows.length == 1 ? '“${rows.first['name']}”' : '${rows.length} brands';
    if (!await confirm(context, 'Delete $what?', used > 0 ? '$used product${used == 1 ? ' uses' : 's use'} ${rows.length == 1 ? 'this brand' : 'these brands'} — they will keep everything else and just have no brand.' : 'This cannot be undone.', ok: 'Delete', danger: true)) return;
    if (!mounted) return;
    await _each(
      context,
      rows,
      (b) => OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/brands2/${b['id']}${toInt(b['products']) > 0 ? '?detach=1' : ''}', label: 'Delete brand: ${b['name']}', refresh: const ['brands'],
          effect: {'kind': 'page_row_delete', 'page': 'brands', 'ids': [b['id']]}),
      rows.length == 1 ? '$what deleted.' : '${rows.length} brands deleted.',
    );
  }

  void _export(List<Map<String, dynamic>> rows) => exportTable(context, 'Brands', const ['ID', 'Name', 'Slug', 'Products', 'Status', 'Popular'], [
        for (final b in rows) [b['id'], b['name'], b['slug'], b['products'], b['status'] == 'active' ? 'Enabled' : 'Disabled', b['isPopular'] == true ? 'Yes' : 'No'],
      ]);

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final on = _prefs.on;
    final all = widget.rows;
    bool hasLogo(Map b) => '${b['logo'] ?? ''}'.isNotEmpty;
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = all.where((b) {
      if (_status != 'all' && b['status'] != _status) return false;
      if (_popular != 'all' && (b['isPopular'] == true) != (_popular == 'yes')) return false;
      if (_logo != 'all' && hasLogo(b) != (_logo == 'yes')) return false;
      if (_products != 'all' && (toInt(b['products']) > 0) != (_products == 'yes')) return false;
      return words.every('${b['name']} ${b['slug'] ?? ''}'.toLowerCase().contains);
    }).toList();
    bool col(String k) => on('b2-table', k);
    Widget onOff(Map<String, dynamic> b, bool value, Map<String, dynamic> Function(bool) change, String yes, String no) => WebPillMenu(
          value: value ? 'Enabled' : 'Disabled',
          options: const ['Enabled', 'Disabled'],
          color: value ? W.green : W.grey,
          onSelected: toInt(b['id']) < 0 ? null : (v) => v == 'Enabled' ? _patch([b], change(true), yes) : _patch([b], change(false), no),
        );
    return WebPage(
      title: 'Brands',
      subtitle: 'Manage the brands products can be tagged with',
      onRefresh: widget.reload,
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => _export(list)),
        WebButton('Add Brand', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => editBrand(context, null, widget.reload)),
      ],
      children: [
        ...webCardsRow([
          if (on('b2-cards', 'b2-k-total')) WebMetric(icon: LucideIcons.tags, color: const Color(0xFF7C3AED), value: '${all.length}', label: 'Total Brands', selected: !_filtersOn, onTap: _clear),
          if (on('b2-cards', 'b2-k-enabled'))
            WebMetric(icon: LucideIcons.badgeCheck, color: const Color(0xFF059669), value: '${all.where((b) => b['status'] == 'active').length}', label: 'Enabled', selected: _status == 'active', onTap: () => setState(() => _status = _status == 'active' ? 'all' : 'active')),
          if (on('b2-cards', 'b2-k-popular'))
            WebMetric(icon: LucideIcons.star, color: const Color(0xFFF59E0B), value: '${all.where((b) => b['isPopular'] == true).length}', label: 'Popular', selected: _popular == 'yes', onTap: () => setState(() => _popular = _popular == 'yes' ? 'all' : 'yes')),
          if (on('b2-cards', 'b2-k-unused'))
            WebMetric(icon: LucideIcons.packageOpen, color: W.g500, value: '${all.where((b) => toInt(b['products']) == 0).length}', label: 'No Products', selected: _products == 'no', onTap: () => setState(() => _products = _products == 'no' ? 'all' : 'no')),
        ]),
        ...webFilterCard([
          if (on('b2-filters', 'b2-f-status')) WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All Status'), ('active', 'Enabled'), ('inactive', 'Disabled')], onChanged: (v) => setState(() => _status = v)),
          if (on('b2-filters', 'b2-f-popular')) WebSelect<String>(icon: LucideIcons.star, label: 'Popular', value: _popular, options: const [('all', 'All Brands'), ('yes', 'Popular'), ('no', 'Not Popular')], onChanged: (v) => setState(() => _popular = v)),
          if (on('b2-filters', 'b2-f-logo')) WebSelect<String>(icon: LucideIcons.image, label: 'Logo', value: _logo, options: const [('all', 'Any Logo'), ('yes', 'With Logo'), ('no', 'No Logo')], onChanged: (v) => setState(() => _logo = v)),
          if (on('b2-filters', 'b2-f-products')) WebSelect<String>(icon: LucideIcons.boxes, label: 'Products', value: _products, options: const [('all', 'All'), ('yes', 'Has Products'), ('no', 'No Products')], onChanged: (v) => setState(() => _products = v)),
        ]),
        WebList(
          rows: list,
          total: all.length,
          selectable: col('b2-c-select'),
          filtersOn: _filtersOn,
          onClearFilters: _clear,
          search: col('b2-t-search') ? WebSearch(width: 240, hint: 'Search brands…', onChanged: (v) => setState(() => _q = v)) : null,
          empty: 'No brands yet.',
          onTap: (b) => editBrand(context, b, widget.reload),
          bulk: (n) => [
            DMenuItem('enable', 'Enable ($n)', icon: LucideIcons.badgeCheck),
            DMenuItem('disable', 'Disable ($n)', icon: LucideIcons.eyeOff),
            DMenuItem('popular', 'Mark Popular ($n)', icon: LucideIcons.star),
            DMenuItem('unpopular', 'Remove Popular ($n)', icon: LucideIcons.starOff),
            DMenuItem('export', 'Export selected ($n)', icon: LucideIcons.download, shortcut: 'Excel'),
            null,
            DMenuItem('delete', 'Delete ($n)', icon: LucideIcons.trash2, danger: true),
          ],
          onBulk: (a, rows) async => switch (a) {
            'enable' => await _patch(rows, {'status': 'active'}, 'enabled'),
            'disable' => await _patch(rows, {'status': 'inactive'}, 'disabled'),
            'popular' => await _patch(rows, {'isPopular': true}, 'marked popular'),
            'unpopular' => await _patch(rows, {'isPopular': false}, 'no longer popular'),
            'delete' => await _delete(rows),
            _ => _export(rows),
          },
          cols: [
            if (col('b2-c-name')) ListCol(const WebCol('Name', flex: 2), (b) => Text('${b['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)), sort: (b) => lower(b['name'])),
            if (col('b2-c-logo')) ListCol(const WebCol('Logo', width: 88), (b) => NetImage(b['logo'], size: 36, radius: 6, placeholder: LucideIcons.image)),
            if (col('b2-c-slug')) ListCol(const WebCol('Slug', flex: 1.4), (b) => Text('${b['slug'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g500)), sort: (b) => lower(b['slug'])),
            if (col('b2-c-products')) ListCol(const WebCol('Products', flex: .8), (b) => Text('${b['products']}', style: const TextStyle(fontSize: 13)), sort: (b) => toDouble(b['products'])),
            if (col('b2-c-status')) ListCol(const WebCol('Status', flex: 1), (b) => onOff(b, b['status'] == 'active', (v) => {'status': v ? 'active' : 'inactive'}, 'enabled', 'disabled')),
            if (col('b2-c-popular')) ListCol(const WebCol('Popular', flex: 1), (b) => onOff(b, b['isPopular'] == true, (v) => {'isPopular': v}, 'marked popular', 'no longer popular')),
            if (col('b2-c-actions'))
              ListCol(const WebCol('Actions', width: 96), (b) => Row(children: [
                    WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${b['name']}', onTap: () => editBrand(context, b, widget.reload)),
                    WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete ${b['name']}', onTap: () => _delete([b])),
                  ])),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Badge tags & item types ───────────────────────── */

class TagsWeb extends StatelessWidget {
  const TagsWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'tags', builder: (context, data, reload) => _TagsWeb(rows: _rows(data), reload: reload));
}

class _TagsWeb extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _TagsWeb({required this.rows, required this.reload});
  @override
  State<_TagsWeb> createState() => _TagsWebState();
}

class _TagsWebState extends State<_TagsWeb> {
  static final _def = displayDefs['ecom_product_tags2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _group = 'all', _status = 'all', _usage = 'all';
  bool get _filtersOn => _q.isNotEmpty || _group != 'all' || _status != 'all' || _usage != 'all';
  void _clear() => setState(() {
        _q = '';
        _group = _status = _usage = 'all';
      });

  Future<void> _setStatus(Map<String, dynamic> t, String status) => _each(
        context,
        [t],
        (t) => OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/product-tags2/${t['id']}', body: {'status': status}, label: 'Tag ${t['label']}: $status', refresh: const ['settings'],
            effect: {'kind': 'page_row', 'page': 'tags', 'id': t['id'], 'fields': {'status': status}}),
        '“${t['label']}” is ${status == 'active' ? 'active' : 'turned off'}.',
      );

  Future<void> _delete(Map<String, dynamic> t) async {
    final used = toInt(t['products']);
    if (!await confirm(context, 'Delete “${t['label']}”?', used > 0 ? '$used product${used == 1 ? ' uses' : 's use'} this tag — they will go back to “None” / “Normal”.' : 'This cannot be undone.', ok: 'Delete', danger: true)) return;
    if (!mounted) return;
    await _each(
      context,
      [t],
      (t) => OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/product-tags2/${t['id']}${used > 0 ? '?force=1' : ''}', label: 'Delete tag: ${t['label']}', refresh: const ['settings', 'products'],
          effect: {'kind': 'page_row_delete', 'page': 'tags', 'ids': [t['id']]}),
      '“${t['label']}” deleted.',
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final all = widget.rows;
    final badges = all.where((t) => t['tagGroup'] == 'badge').toList();
    final products = s.list('products');
    final tagged = products.where((p) => p['badgeTag'] != null && p['badgeTag'] != 'none').length;
    final top = ([...badges]..sort((a, b) => toInt(b['unitsSold']).compareTo(toInt(a['unitsSold'])))).where((t) => toInt(t['unitsSold']) > 0).firstOrNull;
    // Products carrying a badge / item type that no longer exists.
    final slugs = {for (final t in all) '${t['tagGroup']}:${t['slug']}'};
    final orphans = <String>{
      for (final p in products)
        if (p['badgeTag'] != null && p['badgeTag'] != 'none' && !slugs.contains('badge:${p['badgeTag']}')) 'Badge “${p['badgeTag']}”',
      for (final p in products)
        if (p['itemType'] != null && p['itemType'] != 'normal' && !slugs.contains('item_type:${p['itemType']}')) 'Item type “${p['itemType']}”',
    };
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = all.where((t) {
      if (_group != 'all' && t['tagGroup'] != _group) return false;
      if (_status != 'all' && t['status'] != _status) return false;
      if (_usage == 'used' && toInt(t['products']) == 0) return false;
      if (_usage == 'unused' && toInt(t['products']) > 0) return false;
      if (_usage == 'sold' && toInt(t['unitsSold']) == 0) return false;
      if (_usage == 'nosales' && toInt(t['unitsSold']) > 0) return false;
      return words.every('${t['label']} ${t['slug']}'.toLowerCase().contains);
    }).toList();
    bool col(String k) => on('tg2-table', k);
    void pick(String group) => setState(() {
          _clear();
          _group = group;
        });
    return WebPage(
      title: 'Badge Tags & Item Types',
      subtitle: 'Badges shown on product photos, and the kinds of items you sell (sales: last 12 months)',
      onRefresh: widget.reload,
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Add Item Type', icon: LucideIcons.plus, onPressed: () => editTag(context, null, 'item_type', widget.reload)),
        WebButton('Add Badge', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => editTag(context, null, 'badge', widget.reload)),
      ],
      children: [
        ...webCardsRow([
          if (on('tg2-cards', 'tg2-k-badges')) WebMetric(icon: LucideIcons.tag, color: const Color(0xFF7C3AED), value: '${badges.length}', label: 'Badge Tags', sub: 'shown on product cards', selected: _group == 'badge', onTap: () => pick('badge')),
          if (on('tg2-cards', 'tg2-k-types')) WebMetric(icon: LucideIcons.tags, color: const Color(0xFF2563EB), value: '${all.length - badges.length}', label: 'Item Types', sub: 'how products are grouped', selected: _group == 'item_type', onTap: () => pick('item_type')),
          if (on('tg2-cards', 'tg2-k-active'))
            WebMetric(icon: LucideIcons.badgeCheck, color: const Color(0xFF059669), value: '${all.where((t) => t['status'] == 'active').length}', label: 'Active', sub: '${all.where((t) => t['status'] != 'active').length} inactive', selected: _status == 'active', onTap: () => setState(() => _status = _status == 'active' ? 'all' : 'active')),
          if (on('tg2-cards', 'tg2-k-unused'))
            WebMetric(icon: LucideIcons.eyeOff, color: W.g500, value: '${all.where((t) => toInt(t['products']) == 0).length}', label: 'Not Used', sub: 'no product has these', selected: _usage == 'unused', onTap: () => setState(() => _usage = _usage == 'unused' ? 'all' : 'unused')),
          if (on('tg2-cards', 'tg2-k-tagged')) WebMetric(icon: LucideIcons.package, color: const Color(0xFF0284C7), value: '$tagged', label: 'Tagged Products', sub: '${products.length - tagged} with no badge', onTap: () => setState(() => _usage = 'used')),
          if (on('tg2-cards', 'tg2-k-units'))
            WebMetric(icon: LucideIcons.shoppingCart, color: const Color(0xFFD97706), value: '${badges.fold<int>(0, (a, t) => a + toInt(t['unitsSold']))}', label: 'Units Sold', sub: 'from badged products', selected: _usage == 'sold', onTap: () => setState(() => _usage = 'sold')),
          if (on('tg2-cards', 'tg2-k-revenue')) WebMetric(icon: LucideIcons.indianRupee, color: const Color(0xFF059669), value: money(badges.fold<double>(0, (a, t) => a + toDouble(t['revenue']))), label: 'Sales from Badges', sub: 'last 12 months', onTap: () => setState(() => _usage = 'sold')),
          if (on('tg2-cards', 'tg2-k-top')) WebMetric(icon: LucideIcons.tag, color: const Color(0xFFDC2626), value: top == null ? '—' : '${top['label']}', label: 'Best Performing', sub: top == null ? 'no sales yet' : '${top['unitsSold']} units sold'),
        ]),
        if (orphans.isNotEmpty && _prefs.item('tg2-orphans')) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFFFFBEB), border: Border.all(color: const Color(0xFFFDE68A)), borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              const Icon(LucideIcons.triangleAlert, size: 16, color: Color(0xFFB45309)),
              const SizedBox(width: 10),
              Expanded(child: Text('Some products use a tag that no longer exists: ${orphans.take(6).join(', ')}${orphans.length > 6 ? ' and ${orphans.length - 6} more' : ''}. Add it again, or change those products.', style: const TextStyle(fontSize: 13, color: Color(0xFF92400E)))),
            ]),
          ),
          const SizedBox(height: 12),
        ],
        ...webFilterCard([
          if (on('tg2-filters', 'tg2-f-group')) WebSelect<String>(icon: LucideIcons.tags, label: 'Tag Type', value: _group, options: const [('all', 'Badges and item types'), ('badge', 'Badge tags only'), ('item_type', 'Item types only')], onChanged: (v) => setState(() => _group = v)),
          if (on('tg2-filters', 'tg2-f-status')) WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All status'), ('active', 'Active'), ('inactive', 'Inactive')], onChanged: (v) => setState(() => _status = v)),
          if (on('tg2-filters', 'tg2-f-usage'))
            WebSelect<String>(icon: LucideIcons.chartBar, label: 'Usage', value: _usage, options: const [('all', 'All tags'), ('used', 'Used by products'), ('unused', 'Not used'), ('sold', 'Sold (12 months)'), ('nosales', 'No sales (12 months)')], onChanged: (v) => setState(() => _usage = v)),
        ]),
        WebList(
          rows: list,
          total: all.length,
          filtersOn: _filtersOn,
          onClearFilters: _clear,
          search: col('tg2-t-search') ? WebSearch(width: 240, hint: 'Name or code…', onChanged: (v) => setState(() => _q = v)) : null,
          empty: 'No tags yet.',
          onTap: (t) => editTag(context, t, '${t['tagGroup']}', widget.reload),
          cols: [
            if (col('tg2-c-tag'))
              ListCol(const WebCol('Tag', flex: 2), (t) => Row(children: [
                    Container(width: 12, height: 12, decoration: BoxDecoration(color: _hex(t['color']) ?? W.g400, shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${t['label']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                        Text('${t['slug']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500)),
                      ]),
                    ),
                  ]), sort: (t) => lower(t['label'])),
            if (col('tg2-c-group'))
              ListCol(const WebCol('Type', flex: 1), (t) => Align(
                    alignment: Alignment.centerLeft,
                    child: t['tagGroup'] == 'badge' ? const WebBadge('Badge', color: Color(0xFF6D28D9), bg: Color(0xFFF5F3FF)) : const WebBadge('Item type', color: Color(0xFF1D4ED8), bg: Color(0xFFEFF6FF)),
                  ), sort: (t) => lower(t['tagGroup'])),
            if (col('tg2-c-products')) ListCol(const WebCol('Products', flex: .8), (t) => Text('${t['products']}'), sort: (t) => toDouble(t['products'])),
            if (col('tg2-c-sales')) ListCol(const WebCol('Units Sold', flex: .9), (t) => Text('${t['unitsSold']}'), sort: (t) => toDouble(t['unitsSold'])),
            if (col('tg2-c-revenue')) ListCol(const WebCol('Sales', flex: 1), (t) => Text(money(t['revenue'])), sort: (t) => toDouble(t['revenue'])),
            if (col('tg2-c-status'))
              ListCol(const WebCol('Status', flex: 1), (t) => WebPillMenu(value: t['status'] == 'active' ? 'Active' : 'Inactive', options: const ['Active', 'Inactive'], color: t['status'] == 'active' ? W.green : W.grey, onSelected: (v) => _setStatus(t, v == 'Active' ? 'active' : 'inactive'))),
            if (col('tg2-c-actions'))
              ListCol(const WebCol('Actions', width: 96), (t) => Row(children: [
                    WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${t['label']}', onTap: () => editTag(context, t, '${t['tagGroup']}', widget.reload)),
                    WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete ${t['label']}', onTap: () => _delete(t)),
                  ])),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Reviews ───────────────────────── */

class ReviewsWeb extends StatelessWidget {
  const ReviewsWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'reviews', builder: (context, data, reload) => _ReviewsWeb(rows: _rows((data as Map?)?['rows']), reload: reload));
}

class _ReviewsWeb extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _ReviewsWeb({required this.rows, required this.reload});
  @override
  State<_ReviewsWeb> createState() => _ReviewsWebState();
}

class _ReviewsWebState extends State<_ReviewsWeb> {
  static final _def = displayDefs['ecom_reviews2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _status = 'all', _rating = 'all', _text = 'all';
  int _category = 0, _product = 0;
  bool _dateOn = false;
  DateRange _range = DateRange.preset('this_month');
  bool get _filtersOn => _q.isNotEmpty || _status != 'all' || _rating != 'all' || _text != 'all' || _category != 0 || _product != 0 || _dateOn;
  void _clear() => setState(() {
        _q = '';
        _status = _rating = _text = 'all';
        _category = _product = 0;
        _dateOn = false;
      });

  Future<void> _setStatus(Map<String, dynamic> r, String status) => _each(
        context,
        [r],
        (r) => OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/reviews2/${r['id']}', body: {'status': status}, label: 'Review ${r['customerName']}: $status',
            effect: {'kind': 'page_row', 'page': 'reviews', 'list': 'rows', 'id': r['id'], 'fields': {'status': status}}),
        status == 'approved' ? 'Approved — it shows on the product page.' : status == 'rejected' ? 'Rejected — hidden from the shop.' : 'Set back to pending.',
      );

  Future<void> _delete(Map<String, dynamic> r) async {
    if (!await confirm(context, 'Delete this review?', 'The review by ${r['customerName']} will be removed. This cannot be undone.', ok: 'Delete', danger: true)) return;
    if (!mounted) return;
    await _each(context, [r], (r) => OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/reviews2/${r['id']}', label: 'Delete review', effect: {'kind': 'page_row_delete', 'page': 'reviews', 'list': 'rows', 'ids': [r['id']]}), 'Review deleted.');
  }

  /// Add / edit a review (the website's form): product, name, phone, order no., stars, text, status.
  Future<void> _edit(Map<String, dynamic>? r) async {
    final s = context.read<AppState>();
    final products = s.list('products');
    int? productId = r == null ? null : toInt(r['productId']);
    final name = TextEditingController(text: r?['customerName'] ?? '');
    final phone = TextEditingController(text: r?['customerPhone'] ?? '');
    final order = TextEditingController(text: r?['orderId'] == null ? '' : '${r!['orderId']}');
    final text = TextEditingController(text: r?['reviewText'] ?? '');
    var rating = r == null ? 5 : toInt(r['rating']);
    var status = r?['status'] ?? 'approved';
    var pq = '';
    final ok = await showAppDialog<bool>(
      context,
      title: r == null ? 'Add Review' : 'Edit Review',
      icon: LucideIcons.messageSquare,
      width: 560,
      builder: (c) => StatefulBuilder(builder: (c, set) {
        final chosen = products.where((p) => toInt(p['id']) == productId).firstOrNull;
        final found = pq.trim().isEmpty ? const <Map<String, dynamic>>[] : products.where((p) => '${p['name']} ${p['sku'] ?? ''}'.toLowerCase().contains(pq.trim().toLowerCase())).take(6).toList();
        return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (chosen != null || r != null)
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
              child: Row(children: [
                NetImage(chosen?['image'] ?? r?['productImage'], size: 36, radius: 6),
                const SizedBox(width: 10),
                Expanded(child: Text('${chosen?['name'] ?? r?['productName']}', style: const TextStyle(fontWeight: FontWeight.w600))),
                if (r == null) TextButton(onPressed: () => set(() => productId = null), child: const Text('Change')),
              ]),
            )
          else ...[
            DTextField(label: 'Product', required: true, autofocus: true, hint: 'Search products…', prefixIcon: LucideIcons.search, onChanged: (v) => set(() => pq = v)),
            for (final p in found)
              InkWell(
                onTap: () => set(() => productId = toInt(p['id'])),
                child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [NetImage(p['image'], size: 28, radius: 5), const SizedBox(width: 8), Expanded(child: Text('${p['name']}', style: const TextStyle(fontSize: 13)))])),
              ),
          ],
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: DTextField(controller: name, label: 'Name', required: true)),
            const SizedBox(width: 12),
            Expanded(child: DTextField(controller: phone, label: 'Phone', labelHint: 'optional', keyboardType: TextInputType.phone)),
            const SizedBox(width: 12),
            SizedBox(width: 120, child: DTextField(controller: order, label: 'Order id', labelHint: 'optional', keyboardType: TextInputType.number)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            const Text('Rating  ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
            for (var i = 1; i <= 5; i++)
              InkWell(onTap: () => set(() => rating = i), child: Padding(padding: const EdgeInsets.all(2), child: Icon(Icons.star_rounded, size: 26, color: i <= rating ? const Color(0xFFF59E0B) : W.g200))),
            const Spacer(),
            SizedBox(width: 170, child: WebSelect<String>(value: '$status', options: const [('approved', 'Approved'), ('pending', 'Pending'), ('rejected', 'Rejected')], onChanged: (v) => set(() => status = v))),
          ]),
          const SizedBox(height: 12),
          DTextField(controller: text, label: 'Review', labelHint: 'optional', maxLines: 4, minLines: 3),
        ]);
      }),
      actions: [
        const DAction.cancel(),
        DAction('Save', primary: true, onPressed: () async {
          if (productId == null || name.text.trim().isEmpty) {
            toast(context, 'Choose the product and type a name.', error: true);
            return;
          }
          popDialog(context, true);
        }),
      ],
    );
    if (ok != true || !mounted) return;
    final body = {
      'productId': productId, 'customerName': name.text.trim(), 'customerPhone': phone.text.trim(), 'orderId': int.tryParse(order.text.trim()),
      'rating': rating, 'reviewText': text.text.trim(), 'status': status, 'customerId': r?['customerId'], 'createdAt': r?['createdAt'],
    };
    final p = products.where((p) => toInt(p['id']) == productId).firstOrNull;
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: r == null ? 'POST' : 'PUT', path: r == null ? '/api/ecommerce/reviews2' : '/api/ecommerce/reviews2/${r['id']}', body: body, label: 'Review: ${name.text.trim()}',
        effect: r == null
            ? {'kind': 'page_row_new', 'page': 'reviews', 'list': 'rows', 'row': {...body, 'id': -DateTime.now().millisecondsSinceEpoch, 'localRef': newId(), 'productName': p?['name'], 'productImage': p?['image'], 'categoryId': p?['categoryId'], 'createdAt': DateTime.now().toUtc().toIso8601String()}}
            : {'kind': 'page_row', 'page': 'reviews', 'list': 'rows', 'id': r['id'], 'fields': body..remove('createdAt')},
      ),
      reload: widget.reload,
      done: 'Saved.',
    );
  }

  void _export(List<Map<String, dynamic>> rows) => exportTable(context, 'Reviews', const ['ID', 'Date', 'Product', 'Category', 'Customer', 'Phone', 'Order', 'Rating', 'Status', 'Review'], [
        for (final r in rows) [r['id'], dateTime(r['createdAt']), r['productName'], r['categoryName'], r['customerName'], r['customerPhone'], r['orderNumber'], r['rating'], r['status'], r['reviewText']],
      ]);

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final on = _prefs.on;
    final all = widget.rows;
    final today = DateRange.preset('today'), yesterday = DateRange.preset('yesterday');
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = all.where((r) {
      final n = toInt(r['rating']);
      if (_status != 'all' && r['status'] != _status) return false;
      if (_rating == 'high' && n < 4) return false;
      if (_rating == 'low' && n > 2) return false;
      if (int.tryParse(_rating) != null && n != int.parse(_rating)) return false;
      if (_category != 0 && toInt(r['categoryId']) != _category) return false;
      if (_product != 0 && toInt(r['productId']) != _product) return false;
      final hasText = '${r['reviewText'] ?? ''}'.trim().isNotEmpty;
      if (_text != 'all' && hasText != (_text == 'with')) return false;
      if (_dateOn && !_range.contains(r['createdAt'])) return false;
      final hay = '${r['customerName']} ${r['customerPhone'] ?? ''} ${r['orderNumber'] ?? ''} ${r['orderId'] ?? ''} ${r['productName']} ${r['categoryName'] ?? ''} ${r['brandName'] ?? ''} ${r['reviewText'] ?? ''}'.toLowerCase();
      return words.every(hay.contains);
    }).toList();
    final avg = all.isEmpty ? 0.0 : all.fold<double>(0, (t, r) => t + toDouble(r['rating'])) / all.length;
    final cats = <int, String>{for (final r in all) if (r['categoryId'] != null) toInt(r['categoryId']): '${r['categoryName']}'};
    final prods = <int, String>{for (final r in all) toInt(r['productId']): '${r['productName']}'};
    Widget stars(int n) => Row(mainAxisSize: MainAxisSize.min, children: [for (var i = 1; i <= 5; i++) Icon(Icons.star_rounded, size: 15, color: i <= n ? const Color(0xFFF59E0B) : const Color(0xFFE5E7EB))]);
    bool col(String k) => on('rv2-table', k);
    void card(VoidCallback f) => setState(() {
          _clear();
          f();
        });

    return WebPage(
      title: 'Product Reviews',
      subtitle: 'Approve what customers wrote before it shows on the shop',
      onRefresh: widget.reload,
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => _export(list)),
        WebButton('Add Review', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => _edit(null)),
      ],
      children: [
        if (_prefs.item('rv2-range')) ...[
          WebRangeBar(
            range: _range,
            onChanged: (r) => setState(() {
              _range = r;
              _dateOn = true;
            }),
            below: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: InkWell(
                onTap: () => setState(() => _dateOn = !_dateOn),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  IgnorePointer(child: Checkbox(value: _dateOn, onChanged: (_) {})),
                  const Text('Show only reviews in these dates', style: TextStyle(fontSize: 13, color: W.g700)),
                ]),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        ...webCardsRow([
          if (on('rv2-cards', 'rv2-k-total')) WebMetric(icon: LucideIcons.messageSquare, color: const Color(0xFF2563EB), value: '${all.length}', label: 'All Reviews', sub: '${all.where((r) => '${r['reviewText'] ?? ''}'.trim().isNotEmpty).length} with a message', selected: !_filtersOn, onTap: _clear),
          if (on('rv2-cards', 'rv2-k-today'))
            WebMetric(icon: LucideIcons.clock, color: const Color(0xFF7C3AED), value: '${all.where((r) => today.contains(r['createdAt'])).length}', label: 'Today', sub: '${all.where((r) => yesterday.contains(r['createdAt'])).length} yesterday', onTap: () => card(() {
                  _range = today;
                  _dateOn = true;
                })),
          if (on('rv2-cards', 'rv2-k-pending')) WebMetric(icon: LucideIcons.clock, color: const Color(0xFFD97706), value: '${all.where((r) => r['status'] == 'pending').length}', label: 'Pending Reviews', sub: 'not shown on the shop yet', selected: _status == 'pending', onTap: () => card(() => _status = 'pending')),
          if (on('rv2-cards', 'rv2-k-approved')) WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF059669), value: '${all.where((r) => r['status'] == 'approved').length}', label: 'Approved', sub: 'live on the shop', selected: _status == 'approved', onTap: () => card(() => _status = 'approved')),
          if (on('rv2-cards', 'rv2-k-rejected')) WebMetric(icon: LucideIcons.circleX, color: W.g500, value: '${all.where((r) => r['status'] == 'rejected').length}', label: 'Rejected', sub: 'hidden from the shop', selected: _status == 'rejected', onTap: () => card(() => _status = 'rejected')),
          if (on('rv2-cards', 'rv2-k-average')) WebMetric(icon: LucideIcons.star, color: const Color(0xFFF59E0B), value: all.isEmpty ? '—' : '${avg.toStringAsFixed(1)}★', label: 'Average Rating', sub: 'across all reviews', onTap: _clear),
          if (on('rv2-cards', 'rv2-k-low')) WebMetric(icon: LucideIcons.thumbsDown, color: const Color(0xFFDC2626), value: '${all.where((r) => toInt(r['rating']) <= 2).length}', label: 'Low Ratings (1–2★)', sub: 'worth a look', selected: _rating == 'low', onTap: () => card(() => _rating = 'low')),
          if (on('rv2-cards', 'rv2-k-range')) WebMetric(icon: LucideIcons.calendarDays, color: const Color(0xFF0284C7), value: '${all.where((r) => _range.contains(r['createdAt'])).length}', label: 'In Selected Range', sub: _range.label, selected: _dateOn, onTap: () => card(() => _dateOn = true)),
        ]),
        if (_prefs.item('rv2-spread') && all.isNotEmpty) ...[
          WebCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Ratings Breakdown', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.g900)),
              const SizedBox(height: 10),
              for (var n = 5; n >= 1; n--)
                () {
                  final c = all.where((r) => toInt(r['rating']) == n).length;
                  return InkWell(
                    onTap: () => card(() => _rating = '$n'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(children: [
                        SizedBox(width: 34, child: Text('$n★', style: const TextStyle(fontSize: 13, color: W.g700))),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(value: c / all.length, minHeight: 8, backgroundColor: W.g100, color: n >= 4 ? const Color(0xFF10B981) : n == 3 ? const Color(0xFFF59E0B) : const Color(0xFFEF4444)),
                          ),
                        ),
                        SizedBox(width: 70, child: Text('  $c (${(c * 100 / all.length).round()}%)', style: const TextStyle(fontSize: 12.5, color: W.g600))),
                      ]),
                    ),
                  );
                }(),
            ]),
          ),
          const SizedBox(height: 12),
        ],
        ...webFilterCard([
          if (on('rv2-filters', 'rv2-f-status')) WebSelect<String>(icon: LucideIcons.circleDot, label: 'Status', value: _status, options: const [('all', 'All status'), ('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], onChanged: (v) => setState(() => _status = v)),
          if (on('rv2-filters', 'rv2-f-rating'))
            WebSelect<String>(icon: LucideIcons.star, label: 'Rating', value: _rating, options: [('all', 'All ratings'), ('high', '4★ and above'), ('low', '2★ and below'), for (var n = 5; n >= 1; n--) ('$n', '$n star${n == 1 ? '' : 's'}')], onChanged: (v) => setState(() => _rating = v)),
          if (on('rv2-filters', 'rv2-f-category')) WebSelect<int>(icon: LucideIcons.folderTree, label: 'Category', value: _category, options: [(0, 'All categories'), for (final e in cats.entries) (e.key, e.value)], onChanged: (v) => setState(() => _category = v)),
          if (on('rv2-filters', 'rv2-f-product')) WebSelect<int>(icon: LucideIcons.package, label: 'Product', value: _product, options: [(0, 'All products'), for (final e in prods.entries) (e.key, e.value)], onChanged: (v) => setState(() => _product = v)),
          if (on('rv2-filters', 'rv2-f-text')) WebSelect<String>(icon: LucideIcons.messageSquare, label: 'Message', value: _text, options: const [('all', 'All reviews'), ('with', 'With a message'), ('without', 'Rating only')], onChanged: (v) => setState(() => _text = v)),
        ]),
        WebList(
          rows: list,
          total: all.length,
          rowHeight: 64,
          filtersOn: _filtersOn,
          onClearFilters: _clear,
          search: col('rv2-t-search') ? WebSearch(width: 260, hint: 'Name, phone, order, product, words…', onChanged: (v) => setState(() => _q = v)) : null,
          empty: 'No reviews yet.',
          onTap: _edit,
          cols: [
            if (col('rv2-c-product'))
              ListCol(const WebCol('Product', flex: 1.7), (r) => Row(children: [
                    NetImage(r['productImage'], size: 36, radius: 6),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${r['productName']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                        if (r['categoryName'] != null) Text('${r['categoryName']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500)),
                      ]),
                    ),
                  ]), sort: (r) => lower(r['productName'])),
            if (col('rv2-c-customer'))
              ListCol(const WebCol('Name', flex: 1.3), (r) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${r['customerName']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                    Text('${r['customerPhone'] ?? 'No phone'}${r['phoneFromName'] == true ? ' (by name)' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500)),
                    Text('${r['orderNumber'] ?? dateShort(r['createdAt'])}', maxLines: 1, style: const TextStyle(fontSize: 11.5, color: W.g400)),
                  ]), sort: (r) => lower(r['customerName'])),
            if (col('rv2-c-rating')) ListCol(const WebCol('Rating', flex: 1), (r) => stars(toInt(r['rating'])), sort: (r) => toDouble(r['rating'])),
            if (col('rv2-c-review')) ListCol(const WebCol('Review', flex: 2.4), (r) => Text('${r['reviewText'] ?? ''}'.trim().isEmpty ? 'Rating only' : '${r['reviewText']}', maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: '${r['reviewText'] ?? ''}'.trim().isEmpty ? W.g400 : W.g800))),
            if (col('rv2-c-status'))
              ListCol(const WebCol('Status', flex: 1.1), (r) => WebPillMenu(
                    value: switch (r['status']) { 'approved' => 'Approved', 'rejected' => 'Rejected', _ => 'Pending' },
                    options: const ['Pending', 'Approved', 'Rejected'],
                    color: switch (r['status']) { 'approved' => W.green, 'rejected' => const Color(0xFFDC2626), _ => W.yellow },
                    onSelected: toInt(r['id']) < 0 ? null : (v) => _setStatus(r, v.toLowerCase()),
                  ), sort: (r) => lower(r['status'])),
            if (col('rv2-c-actions'))
              ListCol(const WebCol('Actions', width: 96), (r) => Row(children: [
                    WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit review', onTap: () => _edit(r)),
                    WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete review', onTap: toInt(r['id']) < 0 ? null : () => _delete(r)),
                  ])),
          ],
        ),
      ],
    );
  }
}
