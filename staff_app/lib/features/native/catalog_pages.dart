import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/printer.dart';
import '../../ds/ds.dart';
import '../../widgets/common.dart';
import '../../widgets/web.dart';
import '../pos/variants.dart' show packOf;
import '../products/product_edit_screen.dart';
import '../products/products_screen.dart' show adjustStock;
import 'kit.dart';

/* ───────────────────────── Stock Out ───────────────────────── */

/// Products that ran out or are running low — from the synced list, so it works offline.
class StockOutPage extends StatefulWidget {
  const StockOutPage({super.key});
  @override
  State<StockOutPage> createState() => _StockOutPageState();
}

class _StockOutPageState extends State<StockOutPage> {
  String _tab = 'out', _q = '';
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final tracked = s.list('products').where((p) => p['type'] == 'physical' && p['stock'] != null && p['status'] == 'active').toList();
    final out = tracked.where((p) => toInt(p['stock']) <= 0).toList();
    final low = tracked.where((p) => toInt(p['stock']) > 0 && toInt(p['stock']) <= 5).toList();
    final q = _q.trim().toLowerCase();
    final list = (_tab == 'out' ? out : low).where((p) => q.isEmpty || '${p['name']} ${p['sku'] ?? ''} ${p['barcode'] ?? ''}'.toLowerCase().contains(q)).toList()
      ..sort((a, b) => toInt(a['stock']).compareTo(toInt(b['stock'])));
    void edit(Map<String, dynamic> p) => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: p)));
    return NativeScreen(
      title: 'Stock Out',
      subtitle: 'Products to reorder — add stock as it arrives',
      onRefresh: () => s.syncNow(only: const ['products']),
      children: [
        NStats([
          (LucideIcons.packageX, const Color(0xFFDC2626), '${out.length}', 'Out of stock'),
          (LucideIcons.triangleAlert, const Color(0xFFD97706), '${low.length}', 'Low stock (≤ 5)'),
          (LucideIcons.boxes, const Color(0xFF2563EB), '${tracked.length}', 'Products tracked'),
        ]),
        NFilters(hint: 'Search name, SKU, barcode', onSearch: (v) => setState(() => _q = v), tabs: [('out', 'Out of stock (${out.length})'), ('low', 'Low stock (${low.length})')], tab: _tab, onTab: (v) => setState(() => _tab = v)),
        NList(
          cols: const [WebCol('Image', width: 64), WebCol('Product', flex: 2.4), WebCol('Stock', flex: .8), WebCol('Price', flex: .9), WebCol('Actions', width: 170)],
          empty: _tab == 'out' ? 'Nothing is out of stock. 🎉' : 'No products are running low.',
          rows: [
            for (final p in list)
              NRow(
                title: '${p['name']}',
                subtitle: 'Stock ${p['stock']}${packOf(p) != null ? ' · ${packOf(p)}' : ''} · ${inr(CartLinePrice.of(p))}',
                leading: NetImage(p['image'], size: 40, radius: 6),
                trailing: IconButton(icon: const Icon(Icons.add_box_outlined), tooltip: 'Add stock', onPressed: () => adjustStock(context, p)),
                onTap: () => edit(p),
                cells: [
                  NetImage(p['image'], size: 36, radius: 6),
                  Text('${p['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  Text('${p['stock']}', style: TextStyle(fontWeight: FontWeight.w700, color: toInt(p['stock']) <= 0 ? const Color(0xFFDC2626) : const Color(0xFFD97706))),
                  Text(inr(CartLinePrice.of(p))),
                  Row(children: [
                    DButton('Add stock', icon: LucideIcons.packagePlus, size: DSize.sm, onPressed: () => adjustStock(context, p)),
                    const SizedBox(width: 6),
                    DButton.icon(LucideIcons.squarePen, tooltip: 'Edit', variant: DVariant.ghost, onPressed: () => edit(p)),
                  ]),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class CartLinePrice {
  static double of(Map p) {
    final price = toDouble(p['price']);
    final sale = p['salePrice'] == null ? 0.0 : toDouble(p['salePrice']);
    return sale > 0 && sale < price ? sale : price;
  }
}

/* ───────────────────────── Brands ───────────────────────── */

class BrandsPage extends StatelessWidget {
  const BrandsPage({super.key});
  @override
  Widget build(BuildContext context) => NativeData(
        name: 'brands',
        builder: (context, data, reload) {
          final rows = ((data as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          return _BrandsBody(rows: rows, reload: reload);
        },
      );
}

class _BrandsBody extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _BrandsBody({required this.rows, required this.reload});
  @override
  State<_BrandsBody> createState() => _BrandsBodyState();
}

class _BrandsBodyState extends State<_BrandsBody> {
  String _q = '';

  Future<void> _edit(Map<String, dynamic>? b) async {
    final name = TextEditingController(text: b?['name'] ?? '');
    var popular = b?['isPopular'] == true, active = b == null || b['status'] == 'active';
    String? logo;
    final ok = await showAppDialog<bool>(
      context,
      title: b == null ? 'Add brand' : 'Edit brand',
      icon: LucideIcons.copyright,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AppField(controller: name, label: 'Brand name', required: true, autofocus: true),
          const AppGap(),
          Row(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(width: 56, height: 56, child: logo != null ? Image.file(File(logo!), fit: BoxFit.cover) : NetImage(b?['logo'], size: 56, radius: 8)),
            ),
            const SizedBox(width: 12),
            OutlinedButton.icon(
              onPressed: () async {
                final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 800, imageQuality: 88).catchError((_) => null);
                if (x != null) set(() => logo = x.path);
              },
              icon: const Icon(Icons.image_outlined, size: 18),
              label: const Text('Logo'),
            ),
          ]),
          const AppGap(),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Popular brand'), value: popular, onChanged: (v) => set(() => popular = v)),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Active'), value: active, onChanged: (v) => set(() => active = v)),
        ]),
      ),
      actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))],
    );
    if (ok != true || !mounted || name.text.trim().isEmpty) return;
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: b == null ? 'POST' : 'PUT', path: b == null ? '/api/ecommerce/brands2' : '/api/ecommerce/brands2/${b['id']}', label: '${b == null ? 'New' : 'Edit'} brand: ${name.text.trim()}',
        multipart: true, fields: {'name': name.text.trim(), 'is_popular': popular ? '1' : '0', 'status': active ? 'active' : 'inactive'}, files: {'logo': ?logo}, refresh: const ['brands'],
      ),
      reload: widget.reload,
      done: 'Saved.',
    );
  }

  Future<void> _delete(Map<String, dynamic> b) async {
    if (!await confirm(context, 'Delete ${b['name']}?', toInt(b['products']) > 0 ? '${b['products']} products use this brand — they will have no brand.' : 'This cannot be undone.', danger: true)) return;
    if (!mounted) return;
    await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/brands2/${b['id']}', label: 'Delete brand: ${b['name']}', refresh: const ['brands']), reload: widget.reload, done: 'Deleted.');
  }

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final list = widget.rows.where((b) => q.isEmpty || '${b['name']}'.toLowerCase().contains(q)).toList();
    return NativeScreen(
      title: 'Brands',
      subtitle: 'Manage the brands products can be tagged with',
      onRefresh: widget.reload,
      actions: [NativeAction('Add Brand', LucideIcons.plus, () => _edit(null))],
      children: [
        NStats([
          (LucideIcons.copyright, const Color(0xFF2563EB), '${widget.rows.length}', 'Brands'),
          (LucideIcons.circleCheck, const Color(0xFF16A34A), '${widget.rows.where((b) => b['status'] == 'active').length}', 'Active'),
          (LucideIcons.star, const Color(0xFFD97706), '${widget.rows.where((b) => b['isPopular'] == true).length}', 'Popular'),
          (LucideIcons.package, const Color(0xFF7C3AED), '${widget.rows.fold<int>(0, (t, b) => t + toInt(b['products']))}', 'Products with a brand'),
        ]),
        NFilters(hint: 'Search brands', onSearch: (v) => setState(() => _q = v)),
        NList(
          cols: const [WebCol('Logo', width: 64), WebCol('Brand', flex: 2), WebCol('Products', flex: .8), WebCol('Popular', flex: .8), WebCol('Status', flex: .9), WebCol('Actions', width: 100)],
          empty: 'No brands yet.',
          rows: [
            for (final b in list)
              NRow(
                title: '${b['name']}',
                subtitle: '${b['products']} products${b['isPopular'] == true ? ' · Popular' : ''}${b['status'] == 'active' ? '' : ' · Inactive'}',
                leading: NetImage(b['logo'], size: 40, radius: 6),
                trailing: IconButton(icon: const Icon(Icons.delete_outline_rounded), onPressed: () => _delete(b)),
                onTap: () => _edit(b),
                cells: [
                  NetImage(b['logo'], size: 36, radius: 6),
                  Text('${b['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text('${b['products']}'),
                  b['isPopular'] == true ? const Icon(LucideIcons.star, size: 16, color: Color(0xFFD97706)) : webDash,
                  Align(alignment: Alignment.centerLeft, child: statusPill(b['status'] == 'active')),
                  Row(children: [
                    DButton.icon(LucideIcons.squarePen, tooltip: 'Edit', variant: DVariant.ghost, onPressed: () => _edit(b)),
                    DButton.icon(LucideIcons.trash2, tooltip: 'Delete', variant: DVariant.ghost, onPressed: () => _delete(b)),
                  ]),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Badge tags & item types ───────────────────────── */

class TagsPage extends StatelessWidget {
  const TagsPage({super.key});
  @override
  Widget build(BuildContext context) => NativeData(
        name: 'tags',
        builder: (context, data, reload) => _TagsBody(rows: ((data as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList(), reload: reload),
      );
}

class _TagsBody extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _TagsBody({required this.rows, required this.reload});
  @override
  State<_TagsBody> createState() => _TagsBodyState();
}

class _TagsBodyState extends State<_TagsBody> {
  String _group = 'badge';

  Future<void> _edit(Map<String, dynamic>? t) async {
    final label = TextEditingController(text: t?['label'] ?? '');
    final color = TextEditingController(text: t?['color'] ?? '');
    final order = TextEditingController(text: '${t?['sortOrder'] ?? 0}');
    final ok = await showAppDialog<bool>(
      context,
      title: t == null ? (_group == 'badge' ? 'Add badge tag' : 'Add item type') : 'Edit ${t['label']}',
      icon: LucideIcons.tags,
      builder: (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AppField(controller: label, label: 'Name', required: true, autofocus: true, hint: _group == 'badge' ? 'e.g. Best Seller' : 'e.g. Combo Pack'),
        const AppGap(),
        AppField(controller: color, label: 'Colour', helper: 'Optional', hint: '#16A34A'),
        const AppGap(),
        AppField(controller: order, label: 'Order', keyboardType: TextInputType.number),
      ]),
      actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))],
    );
    if (ok != true || !mounted) return;
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: t == null ? 'POST' : 'PUT', path: t == null ? '/api/ecommerce/product-tags2' : '/api/ecommerce/product-tags2/${t['id']}', label: 'Tag: ${label.text.trim()}',
        body: {'label': label.text.trim(), 'tagGroup': t?['tagGroup'] ?? _group, 'color': color.text.trim(), 'sortOrder': int.tryParse(order.text.trim()) ?? 0, 'slug': t?['slug'] ?? ''},
      ),
      reload: widget.reload,
      done: 'Saved.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final list = widget.rows.where((t) => t['tagGroup'] == _group).toList();
    return NativeScreen(
      title: 'Badge Tags & Item Types',
      subtitle: 'Badges shown on product photos, and the kinds of items you sell',
      onRefresh: widget.reload,
      actions: [NativeAction(_group == 'badge' ? 'Add Badge' : 'Add Item Type', LucideIcons.plus, () => _edit(null))],
      children: [
        NFilters(hint: '', onSearch: (_) {}, tabs: [('badge', 'Badge tags'), ('item_type', 'Item types')], tab: _group, onTab: (v) => setState(() => _group = v)),
        NList(
          cols: const [WebCol('Name', flex: 2), WebCol('Products', flex: .8), WebCol('Sold (12 months)', flex: 1.1), WebCol('Status', flex: .9), WebCol('Actions', width: 120)],
          rows: [
            for (final t in list)
              NRow(
                title: '${t['label']}',
                subtitle: '${t['products']} products · ${t['unitsSold']} sold${t['status'] == 'active' ? '' : ' · Inactive'}',
                leading: Container(width: 14, height: 14, decoration: BoxDecoration(color: _hex(t['color']), shape: BoxShape.circle)),
                trailing: Switch(value: t['status'] == 'active', onChanged: (v) => _toggle(t, v)),
                onTap: () => _edit(t),
                cells: [
                  Row(children: [Container(width: 12, height: 12, decoration: BoxDecoration(color: _hex(t['color']), shape: BoxShape.circle)), const SizedBox(width: 8), Text('${t['label']}', style: const TextStyle(fontWeight: FontWeight.w600))]),
                  Text('${t['products']}'),
                  Text('${t['unitsSold']} · ${inr(t['revenue'])}'),
                  Align(alignment: Alignment.centerLeft, child: statusPill(t['status'] == 'active')),
                  Row(children: [
                    DButton.icon(LucideIcons.squarePen, tooltip: 'Edit', variant: DVariant.ghost, onPressed: () => _edit(t)),
                    DButton.icon(t['status'] == 'active' ? LucideIcons.eyeOff : LucideIcons.eye, tooltip: t['status'] == 'active' ? 'Turn off' : 'Turn on', variant: DVariant.ghost, onPressed: () => _toggle(t, t['status'] != 'active')),
                  ]),
                ],
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _toggle(Map<String, dynamic> t, bool on) => nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/product-tags2/${t['id']}', label: 'Tag ${t['label']}: ${on ? 'on' : 'off'}', body: {'status': on ? 'active' : 'inactive'}), reload: widget.reload);
}

Color _hex(dynamic v) {
  final s = '${v ?? ''}'.replaceAll('#', '');
  return s.length == 6 ? Color(int.parse('FF$s', radix: 16)) : const Color(0xFF9CA3AF);
}

/* ───────────────────────── Reviews ───────────────────────── */

class ReviewsPage extends StatelessWidget {
  const ReviewsPage({super.key});
  @override
  Widget build(BuildContext context) => NativeData(
        name: 'reviews',
        builder: (context, data, reload) => _ReviewsBody(rows: (((data as Map?)?['rows'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList(), reload: reload),
      );
}

class _ReviewsBody extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _ReviewsBody({required this.rows, required this.reload});
  @override
  State<_ReviewsBody> createState() => _ReviewsBodyState();
}

class _ReviewsBodyState extends State<_ReviewsBody> {
  String _tab = 'pending', _q = '';

  Future<void> _status(Map<String, dynamic> r, String status) =>
      nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/reviews2/${r['id']}', label: 'Review ${r['customerName']}: $status', body: {'status': status}), reload: widget.reload, done: status == 'approved' ? 'Approved — it shows on the product page.' : 'Updated.');

  @override
  Widget build(BuildContext context) {
    final all = widget.rows;
    final q = _q.trim().toLowerCase();
    final list = all.where((r) => (_tab == 'all' || r['status'] == _tab) && (q.isEmpty || '${r['customerName']} ${r['productName']} ${r['reviewText'] ?? ''}'.toLowerCase().contains(q))).toList();
    final avg = all.isEmpty ? 0 : all.fold<double>(0, (t, r) => t + toDouble(r['rating'])) / all.length;
    Widget stars(int n) => Row(mainAxisSize: MainAxisSize.min, children: [for (var i = 1; i <= 5; i++) Icon(Icons.star_rounded, size: 15, color: i <= n ? const Color(0xFFF59E0B) : const Color(0xFFE5E7EB))]);
    return NativeScreen(
      title: 'Reviews',
      subtitle: 'Approve what customers wrote before it shows on the shop',
      onRefresh: widget.reload,
      children: [
        NStats([
          (LucideIcons.messageSquare, const Color(0xFF2563EB), '${all.length}', 'Reviews (12 months)'),
          (LucideIcons.clock, const Color(0xFFD97706), '${all.where((r) => r['status'] == 'pending').length}', 'Waiting for approval'),
          (LucideIcons.circleCheck, const Color(0xFF16A34A), '${all.where((r) => r['status'] == 'approved').length}', 'Approved'),
          (LucideIcons.star, const Color(0xFFF59E0B), avg.toStringAsFixed(1), 'Average rating'),
        ]),
        NFilters(hint: 'Search customer, product, text', onSearch: (v) => setState(() => _q = v), tabs: const [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('all', 'All')], tab: _tab, onTab: (v) => setState(() => _tab = v)),
        NList(
          rowHeight: 70,
          cols: const [WebCol('Product', flex: 1.6), WebCol('Customer', flex: 1.2), WebCol('Rating', flex: 1), WebCol('Review', flex: 2.4), WebCol('Actions', width: 150)],
          empty: 'No reviews here.',
          rows: [
            for (final r in list)
              NRow(
                title: '${r['customerName']} · ${r['rating']}★',
                subtitle: '${r['productName']}\n${r['reviewText'] ?? ''}',
                leading: NetImage(r['productImage'], size: 40, radius: 6),
                trailing: r['status'] == 'pending'
                    ? Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(icon: const Icon(Icons.check_circle_outline_rounded, color: Color(0xFF16A34A)), onPressed: () => _status(r, 'approved')),
                        IconButton(icon: const Icon(Icons.cancel_outlined, color: Color(0xFFDC2626)), onPressed: () => _status(r, 'rejected')),
                      ])
                    : Text('${r['status']}'),
                cells: [
                  Row(children: [NetImage(r['productImage'], size: 34, radius: 6), const SizedBox(width: 8), Expanded(child: Text('${r['productName']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)))]),
                  Cell2('${r['customerName']}', b: dateShort(r['createdAt'])),
                  stars(toInt(r['rating'])),
                  Text('${r['reviewText'] ?? '—'}', maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
                  Row(children: [
                    if (r['status'] != 'approved') DButton.icon(LucideIcons.check, tooltip: 'Approve', variant: DVariant.ghost, onPressed: () => _status(r, 'approved')),
                    if (r['status'] != 'rejected') DButton.icon(LucideIcons.x, tooltip: 'Reject', variant: DVariant.ghost, onPressed: () => _status(r, 'rejected')),
                    DButton.icon(LucideIcons.trash2, tooltip: 'Delete', variant: DVariant.ghost, onPressed: () async {
                      if (await confirm(context, 'Delete this review?', 'This cannot be undone.', danger: true) && context.mounted) {
                        await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/reviews2/${r['id']}', label: 'Delete review'), reload: widget.reload, done: 'Deleted.');
                      }
                    }),
                  ]),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Print barcodes ───────────────────────── */

/// Pick products (search or scan), set how many labels, print on a label roll or an A4 sheet — works offline.
class BarcodePrintPage extends StatefulWidget {
  /// Products to start with (one label each) — from the Products table; otherwise today's new / changed ones.
  final List<int>? ids;
  const BarcodePrintPage({super.key, this.ids});
  @override
  State<BarcodePrintPage> createState() => _BarcodePrintPageState();
}

class _BarcodePrintPageState extends State<BarcodePrintPage> {
  final Map<int, int> _qty = {};
  String _q = '';
  String _size = '50x25';
  bool _price = true, _name = true;
  bool _started = false;

  static const _sizes = [('50x25', '50 × 25 mm roll'), ('38x25', '38 × 25 mm roll'), ('100x50', '100 × 50 mm roll'), ('a4-65', 'A4 sheet · 65 labels'), ('a4-40', 'A4 sheet · 40 labels')];

  Future<void> _print(List<Map<String, dynamic>> products) async {
    final shop = '${context.read<AppState>().settings['businessName'] ?? ''}';
    final labels = [for (final p in products) for (var i = 0; i < (_qty[toInt(p['id'])] ?? 0); i++) p];
    if (labels.isEmpty) return toast(context, 'Choose at least one product with a barcode.', error: true);
    final doc = pw.Document();
    pw.Widget label(Map p, double w, double h) => pw.Container(
          width: w,
          height: h,
          padding: const pw.EdgeInsets.all(3),
          child: pw.Column(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
            if (_name) pw.Text('${p['name']}', maxLines: 1, style: const pw.TextStyle(fontSize: 7)),
            pw.Expanded(child: pw.BarcodeWidget(barcode: pw.Barcode.code128(), data: '${p['barcode']}', drawText: true, textStyle: const pw.TextStyle(fontSize: 6))),
            if (_price) pw.Text('${money(CartLinePrice.of(p))}${packOf(p) != null ? '  ${packOf(p)}' : ''}', style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold)),
            if (shop.isNotEmpty) pw.Text(shop, maxLines: 1, style: const pw.TextStyle(fontSize: 5)),
          ]),
        );
    var format = PdfPageFormat.a4;
    if (_size.startsWith('a4')) {
      final cols = _size == 'a4-65' ? 5 : 4, rows = _size == 'a4-65' ? 13 : 10;
      final w = (PdfPageFormat.a4.availableWidth - 10) / cols, h = (PdfPageFormat.a4.availableHeight - 10) / rows;
      for (var i = 0; i < labels.length; i += cols * rows) {
        final page = labels.skip(i).take(cols * rows).toList();
        doc.addPage(pw.Page(pageFormat: PdfPageFormat.a4, build: (_) => pw.Wrap(children: [for (final p in page) label(p, w, h)])));
      }
    } else {
      final parts = _size.split('x').map(double.parse).toList();
      final f = PdfPageFormat(parts[0] * PdfPageFormat.mm, parts[1] * PdfPageFormat.mm, marginAll: 0);
      format = f;
      for (final p in labels) {
        doc.addPage(pw.Page(pageFormat: f, build: (_) => label(p, f.width, f.height)));
      }
    }
    final bytes = await doc.save();
    await printPdf(bytes, name: 'Barcode labels', format: format);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final all = s.list('products').where((p) => '${p['barcode'] ?? ''}'.isNotEmpty).toList();
    if (!_started) {
      _started = true;
      // Start with the products chosen in the Products table, or those added or changed today (like the website).
      final ids = widget.ids?.toSet();
      for (final p in all.where((p) => ids != null ? ids.contains(toInt(p['id'])) : DateRange.preset('today').contains(p['updatedAt']))) {
        _qty[toInt(p['id'])] = 1;
      }
    }
    final q = _q.trim().toLowerCase();
    final chosen = all.where((p) => (_qty[toInt(p['id'])] ?? 0) > 0).toList();
    final found = q.isEmpty ? <Map<String, dynamic>>[] : all.where((p) => '${p['name']} ${p['sku'] ?? ''} ${p['barcode']}'.toLowerCase().contains(q)).take(20).toList();
    final total = _qty.values.fold<int>(0, (a, b) => a + b);
    return NativeScreen(
      title: 'Print Barcodes',
      subtitle: 'Price labels for the products you added or restocked',
      actions: [NativeAction('Print $total label${total == 1 ? '' : 's'}', LucideIcons.printer, total == 0 ? null : () => _print(chosen))],
      children: [
        WebCard(
          child: Wrap(spacing: 16, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
            SizedBox(width: 260, child: AppSelect<String>(label: 'Label size', value: _size, options: _sizes, onChanged: (v) => setState(() => _size = v))),
            FilterChip(label: const Text('Product name'), selected: _name, onSelected: (v) => setState(() => _name = v)),
            FilterChip(label: const Text('Price'), selected: _price, onSelected: (v) => setState(() => _price = v)),
          ]),
        ),
        NFilters(hint: 'Search or scan a product to add', onSearch: (v) => setState(() => _q = v)),
        if (found.isNotEmpty)
          NList(
            cols: const [WebCol('Product', flex: 2), WebCol('Barcode', flex: 1.2), WebCol('', width: 110)],
            rows: [
              for (final p in found)
                NRow(
                  title: '${p['name']}',
                  subtitle: '${p['barcode']}',
                  trailing: const Icon(Icons.add_circle_outline_rounded),
                  onTap: () => setState(() => _qty[toInt(p['id'])] = (_qty[toInt(p['id'])] ?? 0) + 1),
                  cells: [Text('${p['name']}'), Text('${p['barcode']}'), DButton('Add', icon: LucideIcons.plus, size: DSize.sm, onPressed: () => setState(() => _qty[toInt(p['id'])] = (_qty[toInt(p['id'])] ?? 0) + 1))],
                ),
            ],
          ),
        NList(
          cols: const [WebCol('Product', flex: 2.2), WebCol('Barcode', flex: 1.2), WebCol('Price', flex: .8), WebCol('Labels', width: 150)],
          empty: 'Search above to add products.',
          rows: [
            for (final p in chosen)
              NRow(
                title: '${p['name']}',
                subtitle: '${p['barcode']} · ${inr(CartLinePrice.of(p))}',
                trailing: _Counter(value: _qty[toInt(p['id'])] ?? 0, onChanged: (v) => setState(() => v <= 0 ? _qty.remove(toInt(p['id'])) : _qty[toInt(p['id'])] = v)),
                cells: [
                  Text('${p['name']}', maxLines: 2, overflow: TextOverflow.ellipsis),
                  Text('${p['barcode']}'),
                  Text(inr(CartLinePrice.of(p))),
                  _Counter(value: _qty[toInt(p['id'])] ?? 0, onChanged: (v) => setState(() => v <= 0 ? _qty.remove(toInt(p['id'])) : _qty[toInt(p['id'])] = v)),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class _Counter extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;
  const _Counter({required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(visualDensity: VisualDensity.compact, icon: const Icon(Icons.remove_circle_outline_rounded, size: 20), onPressed: () => onChanged(value - 1)),
        SizedBox(width: 28, child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
        IconButton(visualDensity: VisualDensity.compact, icon: const Icon(Icons.add_circle_outline_rounded, size: 20), onPressed: () => onChanged(value + 1)),
      ]);
}
