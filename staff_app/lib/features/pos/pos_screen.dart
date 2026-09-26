import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'cart.dart';
import 'receipt.dart';
import 'scanner.dart';

/// Counter billing. Works fully offline: the bill is saved on this device,
/// printed, and uploaded by itself (exactly once) when the internet is back.
class PosScreen extends StatefulWidget {
  const PosScreen({super.key});
  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final cart = PosCart();
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _coupon = TextEditingController();
  String _q = '';
  bool _busy = false;
  bool _autoPrint = true;
  String _paper = 'thermal_80';
  ReceiptData? _last;

  @override
  void initState() {
    super.initState();
    cart.addListener(() => setState(() {}));
    LocalStore.instance.read('pos_prefs').then((v) {
      if (v is Map && mounted) {
        setState(() {
          _autoPrint = v['autoPrint'] != false;
          _paper = v['paper'] as String? ?? _paper;
        });
      } else if (mounted) {
        final f = context.read<AppState>().settings['printerFormat'];
        if (f is String) setState(() => _paper = f);
      }
    });
  }

  @override
  void dispose() {
    cart.dispose();
    _search.dispose();
    _searchFocus.dispose();
    _coupon.dispose();
    super.dispose();
  }

  void _savePrefs() => LocalStore.instance.write('pos_prefs', {'autoPrint': _autoPrint, 'paper': _paper});

  List<Map<String, dynamic>> _matches(List<Map<String, dynamic>> products) {
    final q = _q.trim().toLowerCase();
    final active = products.where((p) => p['status'] == 'active');
    if (q.isEmpty) return active.take(60).toList();
    final words = q.split(RegExp(r'\s+'));
    return active.where((p) {
      final hay = '${p['name']} ${p['sku'] ?? ''} ${p['barcode'] ?? ''}'.toLowerCase();
      return words.every(hay.contains);
    }).take(60).toList();
  }

  void _add(Map<String, dynamic> p) {
    final msg = cart.add(p);
    if (msg != null) {
      toast(context, msg, error: true);
    } else {
      HapticFeedback.selectionClick();
    }
  }

  /// Enter in the search box (or a USB scanner): exact barcode / SKU first, then a single match.
  void _enter(List<Map<String, dynamic>> products) {
    final q = _search.text.trim();
    if (q.isEmpty) return;
    final exact = products.where((p) => p['status'] == 'active' && (('${p['barcode'] ?? ''}' == q) || ('${p['sku'] ?? ''}'.toLowerCase() == q.toLowerCase()))).toList();
    final m = exact.isNotEmpty ? exact : _matches(products);
    if (m.length == 1 || exact.isNotEmpty) {
      _add(m.first);
      _search.clear();
      setState(() => _q = '');
    } else if (m.isEmpty) {
      toast(context, 'No product found for "$q".', error: true);
    }
    _searchFocus.requestFocus();
  }

  Future<void> _scan(List<Map<String, dynamic>> products) async {
    final code = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const ScannerScreen()));
    if (code == null || !mounted) return;
    final hit = products.where((p) => '${p['barcode'] ?? ''}' == code || '${p['sku'] ?? ''}' == code).toList();
    if (hit.isEmpty) {
      toast(context, 'No product with barcode $code.', error: true);
    } else {
      _add(hit.first);
    }
  }

  // ───────────────────────── complete sale ─────────────────────────
  Future<void> _complete() async {
    final s = context.read<AppState>();
    if (cart.lines.isEmpty) return toast(context, 'The cart is empty.', error: true);
    final due = cart.due;
    if (cart.guest && due > 0.004) return toast(context, 'Guest bills must be paid in full. Turn off Guest to record a due.', error: true);
    if (!cart.guest && due > 0.004 && cart.customer == null && cart.customerName.trim().isEmpty) {
      return toast(context, 'This bill has a due amount — choose a customer or enter a name.', error: true);
    }
    setState(() => _busy = true);
    final ref = 'app-${newId()}';
    final soldAt = DateTime.now().toUtc();
    final pays = cart.effectivePayments.map((p) => {'method': p.method, 'amount': double.tryParse(p.amount) ?? 0}).toList();
    final body = {
      'items': [for (final l in cart.lines) {'product_id': l.productId, 'qty': l.qty, 'price_override': l.overridden ? l.unitPrice : null, 'unit': l.unit ?? ''}],
      'customer_id': cart.guest ? 0 : toInt(cart.customer?['id']),
      'customer_name': cart.guest ? '' : cart.customerName.trim(),
      'customer_phone': cart.guest ? '' : cart.customerPhone.trim(),
      'is_guest': cart.guest,
      'payments': pays,
      'promised_date': cart.promisedDate?.toIso8601String().substring(0, 10),
      'coupon_code': cart.coupon?['code'] ?? '',
      'client_ref': ref,
    };
    final receipt = ReceiptData(
      shop: s.settings, number: 'Pending', at: soldAt,
      customer: cart.guest ? 'Guest' : (cart.customerName.trim().isEmpty ? 'Walk-in Customer' : cart.customerName.trim()), phone: cart.guest ? null : cart.customerPhone.trim(),
      lines: [for (final l in cart.lines) ReceiptLine(l.name, l.qty, l.unitPrice, l.unit)],
      subtotal: cart.subtotal, discount: cart.discount, gst: cart.gst, total: cart.grandTotal,
      payments: [for (final p in pays) (p['method'] as String, (p['amount'] as num).toDouble())], due: due,
    );

    // Online: save now and get the real bill number. Offline or no answer: keep it on the device.
    final item = OutboxItem(
      id: ref, method: 'POST', path: '/api/ecommerce/billing/checkout', label: 'Bill · ${money(cart.grandTotal)} · ${receipt.customer}', refresh: const ['orders', 'products', 'customers', 'dues'],
      body: {
        ...body,
        // What was charged at the counter is what gets saved, even if prices change before it uploads.
        'items': [for (final l in cart.lines) {'product_id': l.productId, 'qty': l.qty, 'price_override': l.unitPrice, 'unit': l.unit ?? ''}],
        'offline': true, 'sold_at': soldAt.toIso8601String(), 'offline_discount': cart.discount,
      },
      effect: {
        'kind': 'pos_sale',
        'order': {
          'id': -soldAt.millisecondsSinceEpoch, 'localRef': ref, 'number': 'Offline', 'type': 'offline', 'status': 'Delivered', 'paymentStatus': due > 0.004 ? 'Unpaid' : 'Paid',
          'paymentMethod': pays.length == 1 ? pays.first['method'] : 'Split', 'customer': receipt.customer, 'phone': receipt.phone, 'total': cart.grandTotal,
          'subtotal': cart.subtotal, 'discount': cart.discount, 'gst': cart.gst, 'due': due, 'createdAt': soldAt.toIso8601String(),
          'items': [for (final l in cart.lines) {'productId': l.productId, 'name': l.name, 'qty': l.qty, 'price': l.unitPrice, 'gstRate': l.gstRate}],
        },
      },
    );

    var number = 'Offline';
    var offline = true;
    if (s.online) {
      final r = await s.api.send('POST', '/api/ecommerce/billing/checkout', body: body, idem: ref);
      if (r.ok) {
        number = '${r.data['order_number'] ?? ''}';
        offline = false;
        s.syncNow(only: const ['orders', 'products', 'customers', 'dues']);
      } else if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) {
        setState(() => _busy = false);
        if (mounted) toast(context, r.message, error: true);
        return;
      }
    }
    if (offline) await s.enqueue(item);

    final done = ReceiptData(shop: receipt.shop, number: number, at: receipt.at, customer: receipt.customer, phone: receipt.phone, lines: receipt.lines,
        subtotal: receipt.subtotal, discount: receipt.discount, gst: receipt.gst, total: receipt.total, payments: receipt.payments, due: receipt.due, offline: offline);
    _last = done;
    cart.clear();
    _coupon.clear();
    setState(() => _busy = false);
    if (!mounted) return;
    toast(context, offline ? 'Saved on this device — it will upload automatically.' : 'Bill $number saved.');
    if (_autoPrint) {
      try {
        await printReceipt(done, _paper);
      } catch (_) {
        if (mounted) toast(context, 'Printer not available — you can print again from the last bill.', error: true);
      }
    }
    _searchFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final products = s.list('products');
    final wide = isWide(context);
    return Shortcuts(
      shortcuts: const {SingleActivator(LogicalKeyboardKey.f2): _PayIntent(), SingleActivator(LogicalKeyboardKey.f4): _ClearIntent()},
      child: Actions(
        actions: {
          _PayIntent: CallbackAction<_PayIntent>(onInvoke: (_) => _busy ? null : _complete()),
          _ClearIntent: CallbackAction<_ClearIntent>(onInvoke: (_) => cart.clear()),
        },
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Billing'),
            actions: [
              TextButton.icon(onPressed: _recentBills, icon: const Icon(Icons.history_rounded, size: 19), label: const Text('Recent bills')),
              if (_last != null) IconButton(tooltip: 'Print last bill', icon: const Icon(Icons.print_outlined), onPressed: () => printReceipt(_last!, _paper)),
              IconButton(tooltip: 'Print settings', icon: const Icon(Icons.tune_rounded), onPressed: _printSettings),
              Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow())),
            ],
          ),
          body: wide ? _wideBody(products) : _narrowBody(products),
          bottomNavigationBar: wide ? null : _mobileTotalBar(),
        ),
      ),
    );
  }

  Widget _searchField(List<Map<String, dynamic>> products) => SearchBox(
        hint: 'Scan barcode or search name / SKU',
        controller: _search,
        focusNode: _searchFocus,
        onChanged: (v) => setState(() => _q = v),
        onSubmitted: (_) => _enter(products),
        trailing: Platform.isAndroid ? IconButton(icon: const Icon(Icons.qr_code_scanner_rounded, color: AppColors.primary), onPressed: () => _scan(products)) : null,
      );

  Widget _wideBody(List<Map<String, dynamic>> products) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 8, 16),
            child: Column(children: [
              _searchField(products),
              const SizedBox(height: 12),
              SizedBox(height: 230, child: _productGrid(products, horizontal: true)),
              const SizedBox(height: 12),
              Expanded(child: _cartCard()),
            ]),
          ),
        ),
        SizedBox(width: 380, child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(8, 16, 16, 16), child: _checkoutPanel())),
      ]);

  Widget _narrowBody(List<Map<String, dynamic>> products) => Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 8), child: _searchField(products)),
        if (_q.isNotEmpty) Expanded(child: _productGrid(products)) else Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: _cartCard())),
      ]);

  Widget _productGrid(List<Map<String, dynamic>> products, {bool horizontal = false}) {
    final list = _matches(products);
    if (list.isEmpty) return const EmptyState(icon: Icons.search_off_rounded, title: 'No products found');
    Widget tile(Map<String, dynamic> p) {
      final stock = p['stock'];
      final out = p['type'] == 'physical' && stock != null && toInt(stock) <= 0;
      return AppCard(
        padding: const EdgeInsets.all(8),
        onTap: out ? null : () => _add(p),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Center(child: NetImage(p['image'], size: 84))),
          const SizedBox(height: 6),
          Text(p['name'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          Row(children: [
            Expanded(child: Text(money(CartLine.shelfPrice(p)), style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary))),
            if (stock != null) Text(out ? 'Out' : '$stock', style: TextStyle(fontSize: 12, color: out ? AppColors.red : AppColors.muted, fontWeight: FontWeight.w600)),
          ]),
        ]),
      );
    }

    if (horizontal) {
      return ListView.separated(scrollDirection: Axis.horizontal, itemCount: list.length, separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (c, i) => SizedBox(width: 150, child: tile(list[i])));
    }
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 180, mainAxisExtent: 190, crossAxisSpacing: 10, mainAxisSpacing: 10),
      itemCount: list.length,
      itemBuilder: (c, i) => tile(list[i]),
    );
  }

  Widget _cartCard() => AppCard(
        padding: EdgeInsets.zero,
        child: cart.lines.isEmpty
            ? const EmptyState(icon: Icons.shopping_cart_outlined, title: 'Cart is empty', message: 'Scan a barcode or search a product to start the bill.')
            : ListView.separated(
                itemCount: cart.lines.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (c, i) {
                  final l = cart.lines[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: Row(children: [
                      NetImage(l.product['image'], size: 44),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                          InkWell(
                            onTap: () => _editPrice(l),
                            child: Text('${money(l.unitPrice)}${l.unit != null ? ' / ${l.unit}' : ''}${l.overridden ? ' · edited' : ''}',
                                style: TextStyle(color: l.overridden ? AppColors.amber : AppColors.muted, fontSize: 12.5, decoration: TextDecoration.underline, decorationStyle: TextDecorationStyle.dotted)),
                          ),
                        ]),
                      ),
                      _Stepper(value: l.qty, onChanged: (v) {
                        final m = cart.setQty(l, v);
                        if (m != null) toast(context, m, error: true);
                      }),
                      SizedBox(width: 86, child: Text(money(l.total), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
                      IconButton(icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.faint), onPressed: () => cart.remove(l)),
                    ]),
                  );
                },
              ),
      );

  Future<void> _editPrice(CartLine l) async {
    final c = TextEditingController(text: l.unitPrice.toStringAsFixed(2));
    final u = TextEditingController(text: l.unit ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l.name, maxLines: 2),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: c, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Price for this bill', prefixText: '₹ ')),
          const SizedBox(height: 10),
          TextField(controller: u, decoration: const InputDecoration(labelText: 'Unit (optional)', hintText: 'KG, Litre, Piece…')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Apply'))],
      ),
    );
    if (ok == true) {
      final v = double.tryParse(c.text);
      if (v != null) cart.setPrice(l, v);
      cart.setUnit(l, u.text);
    }
  }

  Widget _checkoutPanel() {
    final s = context.watch<AppState>();
    final customers = s.list('customers');
    final coupons = s.list('coupons');
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('Customer', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            const Text('Guest', style: TextStyle(color: AppColors.muted)),
            Switch(value: cart.guest, onChanged: cart.setGuest),
          ]),
          if (!cart.guest) ...[
            Autocomplete<Map<String, dynamic>>(
              displayStringForOption: (c) => '${c['name']}${c['phone'] != null ? ' · ${c['phone']}' : ''}',
              optionsBuilder: (v) {
                final q = v.text.trim().toLowerCase();
                if (q.length < 2) return const [];
                return customers.where((c) => '${c['name']} ${c['phone'] ?? ''}'.toLowerCase().contains(q)).take(8);
              },
              onSelected: cart.setCustomer,
              fieldViewBuilder: (c, ctl, focus, submit) {
                if (cart.customer == null && ctl.text.isEmpty && cart.customerName.isNotEmpty) ctl.text = cart.customerName;
                return TextField(
                  controller: ctl, focusNode: focus,
                  onChanged: (v) {
                    cart.customer = null;
                    cart.customerName = v;
                    cart.touch();
                  },
                  decoration: const InputDecoration(labelText: 'Name or mobile', prefixIcon: Icon(Icons.person_search_outlined)),
                );
              },
            ),
            if (cart.customer == null && cart.customerName.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              TextField(keyboardType: TextInputType.phone, onChanged: (v) => cart.customerPhone = v, decoration: const InputDecoration(labelText: 'Mobile (new customer)', prefixIcon: Icon(Icons.phone_outlined))),
            ],
            if (cart.customer != null && toDouble(cart.customer!['due']) > 0)
              Padding(padding: const EdgeInsets.only(top: 8), child: Text('Previous due: ${money(cart.customer!['due'])}', style: const TextStyle(color: AppColors.red, fontWeight: FontWeight.w600))),
          ],
        ]),
      ),
      const SizedBox(height: 12),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: TextField(controller: _coupon, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Coupon code', prefixIcon: Icon(Icons.local_offer_outlined)))),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () {
                final code = _coupon.text.trim().toUpperCase();
                if (code.isEmpty) return cart.setCoupon(null);
                final c = coupons.where((x) => '${x['code']}'.toUpperCase() == code).firstOrNull;
                if (c == null) {
                  toast(context, 'Invalid or inactive coupon.', error: true);
                  cart.setCoupon(null);
                } else {
                  cart.setCoupon(c);
                  toast(context, 'Coupon applied.');
                }
              },
              child: Text(cart.coupon == null ? 'Apply' : 'Change'),
            ),
          ]),
          const SizedBox(height: 12),
          InfoRow('Subtotal', money(cart.subtotal)),
          if (cart.discount > 0) InfoRow('Discount', '-${money(cart.discount)}', color: AppColors.green),
          InfoRow('GST', money(cart.gst)),
          const Divider(height: 18),
          Row(children: [
            const Expanded(child: Text('Total', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            Text(money(cart.grandTotal), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
          ]),
        ]),
      ),
      const SizedBox(height: 12),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Expanded(child: Text('Payment', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            TextButton.icon(onPressed: cart.addPayment, icon: const Icon(Icons.add, size: 18), label: const Text('Split')),
          ]),
          for (var i = 0; i < cart.effectivePayments.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                SizedBox(
                  width: 118,
                  child: DropdownButtonFormField<String>(
                    initialValue: cart.effectivePayments[i].method,
                    isDense: true,
                    items: [for (final m in const ['Cash', 'UPI', 'Card', 'Other']) DropdownMenuItem(value: m, child: Text(m))],
                    onChanged: (v) => cart.editPayment(i, method: v),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    key: ValueKey('pay$i-${cart.paymentsEdited}-${cart.lines.length}'),
                    initialValue: cart.effectivePayments[i].amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(prefixText: '₹ '),
                    onChanged: (v) => cart.editPayment(i, amount: v),
                  ),
                ),
                if (cart.payments.length > 1) IconButton(icon: const Icon(Icons.remove_circle_outline, color: AppColors.red), onPressed: () => cart.removePayment(i)),
              ]),
            ),
          if (cart.change > 0.004) InfoRow('Return change', money(cart.change), bold: true, color: AppColors.green),
          if (cart.due > 0.004) ...[
            InfoRow('Due (on credit)', money(cart.due), bold: true, color: AppColors.red),
            TextButton.icon(
              icon: const Icon(Icons.event_outlined, size: 18),
              label: Text(cart.promisedDate == null ? 'Promised pay date (optional)' : 'Will pay by ${dateShort(cart.promisedDate)}'),
              onPressed: () async {
                final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now().add(const Duration(days: 7)));
                if (d != null) {
                  cart.promisedDate = d;
                  cart.touch();
                }
              },
            ),
          ],
        ]),
      ),
      const SizedBox(height: 14),
      FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size(0, 54)),
        onPressed: _busy || cart.lines.isEmpty ? null : _complete,
        icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : const Icon(Icons.check_circle_outline_rounded),
        label: Text(_busy ? 'Saving…' : 'Complete sale  ${money(cart.grandTotal)}', style: const TextStyle(fontSize: 16)),
      ),
      const SizedBox(height: 6),
      Text(Platform.isWindows ? 'F2 complete sale · F4 new bill' : '', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
    ]);
  }

  Widget _mobileTotalBar() => SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.border))),
          child: Row(children: [
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${cart.lines.length} item${cart.lines.length == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                Text(money(cart.grandTotal), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              ]),
            ),
            FilledButton(
              onPressed: cart.lines.isEmpty
                  ? null
                  : () => showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        builder: (c) => ListenableBuilder(
                          listenable: cart,
                          builder: (c, _) => Padding(
                            padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom),
                            child: SizedBox(height: MediaQuery.sizeOf(c).height * .85, child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: _checkoutPanel())),
                          ),
                        ),
                      ).then((_) => setState(() {})),
              child: const Text('Checkout'),
            ),
          ]),
        ),
      );

  /// Today's and recent store bills (including ones waiting to upload), with reprint.
  Future<void> _recentBills() async {
    final s = context.read<AppState>();
    final bills = s.list('orders').where((o) => o['type'] == 'offline').take(40).toList();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(c).height * .75,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Recent bills', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            Expanded(
              child: bills.isEmpty
                  ? const EmptyState(icon: Icons.receipt_long_outlined, title: 'No bills yet')
                  : ListView.separated(
                      itemCount: bills.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (c, i) {
                        final o = bills[i];
                        return ListTile(
                          title: Text('${o['localRef'] != null ? 'Offline bill' : o['number']} · ${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('${dateTime(o['createdAt'])} · ${((o['items'] as List?) ?? const []).length} items${toDouble(o['due']) > 0 ? ' · due ${money(o['due'])}' : ''}'),
                          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                            Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w800)),
                            IconButton(tooltip: 'Print', icon: const Icon(Icons.print_outlined), onPressed: () => reprintOrder(s.settings, o, _paper)),
                          ]),
                        );
                      },
                    ),
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _printSettings() async {
    await showModalBottomSheet(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Printing', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Print receipt after every sale'), value: _autoPrint, onChanged: (v) {
                set(() => _autoPrint = v);
                setState(() {});
                _savePrefs();
              }),
              const Text('Paper', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'thermal_58', label: Text('58 mm')), ButtonSegment(value: 'thermal_80', label: Text('80 mm')), ButtonSegment(value: 'a4', label: Text('A4'))],
                selected: {_paper},
                onSelectionChanged: (v) {
                  set(() => _paper = v.first);
                  setState(() {});
                  _savePrefs();
                },
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _PayIntent extends Intent {
  const _PayIntent();
}

class _ClearIntent extends Intent {
  const _ClearIntent();
}

class _Stepper extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;
  const _Stepper({required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          InkWell(onTap: () => onChanged(value - 1), child: const Padding(padding: EdgeInsets.all(7), child: Icon(Icons.remove, size: 16))),
          SizedBox(width: 30, child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
          InkWell(onTap: () => onChanged(value + 1), child: const Padding(padding: EdgeInsets.all(7), child: Icon(Icons.add, size: 16))),
        ]),
      );
}
