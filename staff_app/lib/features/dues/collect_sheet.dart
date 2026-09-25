import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../pos/receipt.dart';

/// Collect a customer's due (one or several bills at once, part or full).
/// Works offline: it shows as paid here and is recorded when the device is online.
Future<void> collectDues(BuildContext context, List<Map<String, dynamic>> dues) async {
  if (dues.isEmpty) return;
  await showModalBottomSheet(context: context, isScrollControlled: true, builder: (c) => _Collect(dues: dues));
}

class _Collect extends StatefulWidget {
  final List<Map<String, dynamic>> dues;
  const _Collect({required this.dues});
  @override
  State<_Collect> createState() => _CollectState();
}

class _CollectState extends State<_Collect> {
  late final Map<int, TextEditingController> _amt = {for (final d in widget.dues) toInt(d['id']): TextEditingController(text: toDouble(d['balance']).toStringAsFixed(2))};
  late final Map<int, bool> _on = {for (final d in widget.dues) toInt(d['id']): true};
  String _method = 'Cash';
  bool _busy = false, _print = true;

  double get _total => _amt.entries.where((e) => _on[e.key] == true).fold(0, (t, e) => t + (double.tryParse(e.value.text) ?? 0));

  Future<void> _save() async {
    final s = context.read<AppState>();
    final ids = <int>[], amounts = <double>[];
    for (final d in widget.dues) {
      final id = toInt(d['id']);
      final a = double.tryParse(_amt[id]!.text) ?? 0;
      if (_on[id] != true || a <= 0) continue;
      ids.add(id);
      amounts.add(a > toDouble(d['balance']) ? toDouble(d['balance']) : a); // never more than owed
    }
    if (ids.isEmpty) return toast(context, 'Enter an amount.', error: true);
    setState(() => _busy = true);
    final customer = '${widget.dues.first['customer']}';
    final item = OutboxItem(
      id: newId(), method: 'POST', path: '/api/ecommerce/due-payment', label: 'Due collected · ${money(amounts.fold<double>(0, (a, b) => a + b))} · $customer',
      body: {'creditIds': ids, 'amounts': amounts, 'paymentMethod': _method, 'combineReceipt': true},
      effect: {'kind': 'due_payment', 'amounts': {for (var i = 0; i < ids.length; i++) '${ids[i]}': amounts[i]}},
      refresh: const ['dues', 'customers', 'orders'],
    );
    final r = await s.sendNow(item);
    if (!mounted) return;
    setState(() => _busy = false);
    if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) return toast(context, r.message, error: true);
    final receiptNo = r.ok ? RegExp(r'RCPT\d+').firstMatch('${r.data['redirect'] ?? ''}')?.group(0) ?? 'Receipt' : 'Pending';
    Navigator.pop(context);
    toast(context, r.ok ? 'Payment recorded ($receiptNo).' : 'Saved offline — will be recorded when online.');
    if (_print) {
      try {
        await printReceipt(
          ReceiptData(
            shop: s.settings, number: receiptNo, at: DateTime.now().toUtc(), customer: customer, phone: widget.dues.first['phone'],
            lines: [for (var i = 0; i < ids.length; i++) ReceiptLine('Due for ${widget.dues.firstWhere((d) => toInt(d['id']) == ids[i])['orderNumber']}', 1, amounts[i])],
            subtotal: amounts.fold(0, (a, b) => a + b), discount: 0, gst: 0, total: amounts.fold(0, (a, b) => a + b), payments: [(_method, amounts.fold(0, (a, b) => a + b))], offline: !r.ok,
          ),
          s.settings['printerFormat'] as String? ?? 'thermal_80',
        );
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Collect due · ${widget.dues.first['customer']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              for (final d in widget.dues)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    Checkbox(value: _on[toInt(d['id'])], onChanged: (v) => setState(() => _on[toInt(d['id'])] = v == true)),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${d['orderNumber']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text('Balance ${money(d['balance'])} · ${dateShort(d['createdAt'])}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ]),
                    ),
                    SizedBox(width: 130, child: TextField(controller: _amt[toInt(d['id'])], onChanged: (_) => setState(() {}), keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(prefixText: '₹ '))),
                  ]),
                ),
              const SizedBox(height: 6),
              SegmentedButton<String>(
                segments: [for (final m in const ['Cash', 'UPI', 'Card', 'Other']) ButtonSegment(value: m, label: Text(m))],
                selected: {_method},
                onSelectionChanged: (v) => setState(() => _method = v.first),
              ),
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: _print, onChanged: (v) => setState(() => _print = v == true), title: const Text('Print receipt')),
              FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Receive ${money(_total)}')),
            ]),
          ),
        ),
      );
}
