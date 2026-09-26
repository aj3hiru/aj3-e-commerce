import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/nav.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/barcode.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../pos/scanner.dart';
import 'product_edit_screen.dart';

/// Products & stock: search, filter (low / out / inactive), quick stock update, edit.
class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});
  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  int _navSeq = -1;
  String _q = '';
  String _filter = 'all';
  int? _category;

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    if (nav.seq != _navSeq) {
      _navSeq = nav.seq;
      final a = nav.take('products');
      if (a['filter'] is String) _filter = a['filter'];
      if (a.containsKey('category')) {
        _category = a['category'] as int?;
        _filter = 'all';
      }
    }
    final s = context.watch<AppState>();
    final cats = s.list('categories');
    final all = s.list('products');
    bool low(Map p) => p['type'] == 'physical' && p['stock'] != null && toInt(p['stock']) > 0 && toInt(p['stock']) <= 5;
    bool out(Map p) => p['type'] == 'physical' && p['stock'] != null && toInt(p['stock']) <= 0;
    final counts = {
      'all': all.where((p) => p['status'] == 'active').length,
      'low': all.where((p) => p['status'] == 'active' && low(p)).length,
      'out': all.where((p) => p['status'] == 'active' && out(p)).length,
      'inactive': all.where((p) => p['status'] != 'active').length,
    };
    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = all.where((p) {
      final okFilter = switch (_filter) {
        'low' => p['status'] == 'active' && low(p),
        'out' => p['status'] == 'active' && out(p),
        'inactive' => p['status'] != 'active',
        _ => p['status'] == 'active',
      };
      final hay = '${p['name']} ${p['sku'] ?? ''} ${p['barcode'] ?? ''}'.toLowerCase();
      return okFilter && (_category == null || toInt(p['categoryId']) == _category) && words.every(hay.contains);
    }).toList();

    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('Products'), actions: [
        if (Platform.isAndroid) IconButton(tooltip: 'Scan products', icon: const Icon(Icons.qr_code_scanner_rounded), onPressed: () => scanProducts(context)),
        Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProductEditScreen())),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add product'),
      ),
      body: PageBody(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            child: Row(children: [
              Expanded(child: SearchBox(hint: 'Name, SKU or barcode', onChanged: (v) => setState(() => _q = v))),
              const SizedBox(width: 10),
              PopupMenuButton<int?>(
                tooltip: 'Category',
                initialValue: _category,
                onSelected: (v) => setState(() => _category = v == -1 ? null : v),
                itemBuilder: (c) => [const PopupMenuItem(value: -1, child: Text('All categories')), for (final cat in cats) PopupMenuItem(value: toInt(cat['id']), child: Text('${cat['name']}'))],
                child: Chip(avatar: const Icon(Icons.category_outlined, size: 18), label: Text(_category == null ? 'Category' : '${cats.firstWhere((c) => toInt(c['id']) == _category, orElse: () => {'name': 'Category'})['name']}')),
              ),
            ]),
          ),
          SizedBox(
            height: 44,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
              for (final (k, l) in const [('all', 'Active'), ('low', 'Low stock'), ('out', 'Out of stock'), ('inactive', 'Inactive')])
                Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text('$l  ${counts[k]}'), selected: _filter == k, onSelected: (_) => setState(() => _filter = k))),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => s.syncNow(only: const ['products', 'categories', 'brands']),
              child: list.isEmpty
                  ? ListView(children: const [SizedBox(height: 60), EmptyState(icon: Icons.inventory_2_outlined, title: 'No products here')])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 90),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (c, i) {
                        final p = list[i];
                        final stock = p['stock'];
                        final isOut = out(p), isLow = low(p);
                        return AppCard(
                          padding: const EdgeInsets.all(10),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: p))),
                          child: Row(children: [
                            NetImage(p['image'], size: 56),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${p['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 2),
                                Text([if (p['sku'] != null) 'SKU ${p['sku']}', if (p['barcode'] != null) '${p['barcode']}'].join(' · '), style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                                const SizedBox(height: 4),
                                Row(children: [
                                  Text(money(toDouble(p['salePrice']) > 0 ? p['salePrice'] : p['price']), style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary)),
                                  if (toDouble(p['salePrice']) > 0) ...[const SizedBox(width: 6), Text(money(p['price']), style: const TextStyle(color: AppColors.faint, decoration: TextDecoration.lineThrough, fontSize: 12))],
                                ]),
                              ]),
                            ),
                            if (stock != null)
                              InkWell(
                                borderRadius: BorderRadius.circular(10),
                                onTap: () => adjustStock(context, p),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  decoration: BoxDecoration(color: isOut ? AppColors.redSoft : isLow ? AppColors.amberSoft : const Color(0xFFF1F2F6), borderRadius: BorderRadius.circular(10)),
                                  child: Column(children: [
                                    Text('$stock', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: isOut ? AppColors.red : isLow ? AppColors.amber : AppColors.text)),
                                    Text(p['unit'] ?? 'in stock', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                  ]),
                                ),
                              ),
                          ]),
                        );
                      },
                    ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Set the stock (or add a delivery to it) — works offline.
Future<void> adjustStock(BuildContext context, Map<String, dynamic> p) async {
  final s = context.read<AppState>();
  final current = toInt(p['stock']);
  final ctl = TextEditingController();
  var mode = 'add';
  final result = await showDialog<int>(
    context: context,
    builder: (d) => StatefulBuilder(
      builder: (d, set) => AlertDialog(
        title: Text('${p['name']}', maxLines: 2),
        content: SizedBox(
          width: 380,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Now in stock: $current', style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'add', label: Text('Add received')), ButtonSegment(value: 'set', label: Text('Set exact'))],
              selected: {mode},
              onSelectionChanged: (v) => set(() => mode = v.first),
            ),
            const SizedBox(height: 12),
            TextField(controller: ctl, autofocus: true, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: mode == 'add' ? 'Quantity received' : 'New stock')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
          FilledButton(onPressed: () {
            final n = int.tryParse(ctl.text.trim());
            if (n == null || n < 0) return;
            Navigator.pop(d, mode == 'add' ? -1 - n : n); // negative = "received n"
          }, child: const Text('Save')),
        ],
      ),
    ),
  );
  if (result == null) return;
  final received = result < 0 ? -1 - result : null;
  final newStock = received != null ? current + received : result;
  await s.enqueue(OutboxItem(
    id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: received != null ? {'stockAdd': received} : {'stock': result},
    label: received != null ? 'Received $received × ${p['name']}' : 'Stock of ${p['name']} set to $result',
    effect: received != null ? {'kind': 'stock_add', 'id': p['id'], 'qty': received} : {'kind': 'product', 'id': p['id'], 'fields': {'stock': newStock}}, refresh: const ['products'],
  ));
  if (context.mounted) toast(context, 'Stock is now $newStock.');
}

/// Scan many items one after another (camera stays open). Afterwards: add the
/// counted quantities to stock in one go, and create products for new barcodes.
Future<void> scanProducts(BuildContext context) async {
  final s = context.read<AppState>();
  final counts = <int, int>{}; // product id → times scanned
  final unknown = <String>[]; // barcodes not in the shop yet
  var synced = false;
  await Navigator.push(context, MaterialPageRoute(builder: (_) => ScannerScreen(
        title: 'Scan products',
        onCode: (code) async {
          var p = findByCode(s.list('products'), code);
          if (p == null && !synced && s.online) {
            synced = true;
            await s.syncNow(only: const ['products']);
            p = findByCode(s.list('products'), code);
          }
          if (p == null) {
            if (!unknown.contains(code)) unknown.add(code);
            return ScanResult(true, 'New barcode $code — you can add it as a product');
          }
          final id = toInt(p['id']);
          counts[id] = (counts[id] ?? 0) + 1;
          return ScanResult(true, '${p['name']}  ×${counts[id]}');
        },
      )));
  if (!context.mounted || (counts.isEmpty && unknown.isEmpty)) return;
  await showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _ScanReview(counts: counts, unknown: unknown));
}

class _ScanReview extends StatefulWidget {
  final Map<int, int> counts;
  final List<String> unknown;
  const _ScanReview({required this.counts, required this.unknown});
  @override
  State<_ScanReview> createState() => _ScanReviewState();
}

class _ScanReviewState extends State<_ScanReview> {
  late final Map<int, TextEditingController> _qty = {for (final e in widget.counts.entries) e.key: TextEditingController(text: '${e.value}')};
  late final List<String> _unknown = [...widget.unknown];
  bool _added = false;

  Future<void> _addStock() async {
    final s = context.read<AppState>();
    var n = 0;
    for (final e in _qty.entries) {
      final q = int.tryParse(e.value.text.trim()) ?? 0;
      final p = s.list('products').where((x) => toInt(x['id']) == e.key).firstOrNull;
      if (q <= 0 || p == null || p['stock'] == null) continue;
      await s.enqueue(OutboxItem(
        id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: {'stockAdd': q}, label: 'Received $q × ${p['name']}',
        effect: {'kind': 'stock_add', 'id': p['id'], 'qty': q}, refresh: const ['products'],
      ));
      n++;
    }
    if (!mounted) return;
    setState(() => _added = true);
    toast(context, n == 0 ? 'Nothing to add.' : 'Stock updated for $n product${n == 1 ? '' : 's'}.');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final products = {for (final p in s.list('products')) toInt(p['id']): p};
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .8),
          child: ListView(shrinkWrap: true, children: [
            const Text('Scanned products', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            if (_qty.isNotEmpty) ...[
              const Text('Already in the shop — add the received quantity to stock:', style: TextStyle(color: AppColors.muted)),
              for (final e in _qty.entries)
                if (products[e.key] != null)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: NetImage(products[e.key]!['image'], size: 44),
                    title: Text('${products[e.key]!['name']}', maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(products[e.key]!['stock'] == null ? 'Stock not tracked' : 'Now in stock: ${products[e.key]!['stock']}'),
                    trailing: SizedBox(width: 74, child: TextField(controller: e.value, enabled: !_added, keyboardType: TextInputType.number, textAlign: TextAlign.center, decoration: const InputDecoration(prefixText: '+'))),
                  ),
              FilledButton.icon(onPressed: _added ? null : _addStock, icon: const Icon(Icons.add_box_outlined), label: Text(_added ? 'Stock added' : 'Add to stock')),
              const SizedBox(height: 16),
            ],
            if (_unknown.isNotEmpty) ...[
              const Text('New barcodes — create a product for each:', style: TextStyle(color: AppColors.muted)),
              for (final code in [..._unknown])
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.qr_code_2_rounded, size: 32),
                  title: Text(code),
                  trailing: FilledButton.tonal(
                    onPressed: () async {
                      final s = context.read<AppState>();
                      await Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(barcode: code)));
                      if (mounted && findByCode(s.list('products'), code) != null) setState(() => _unknown.remove(code));
                    },
                    child: const Text('Add product'),
                  ),
                ),
            ],
          ]),
        ),
      ),
    );
  }
}
