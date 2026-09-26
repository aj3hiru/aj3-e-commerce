import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/perms.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../pos/receipt.dart';

/// Order actions usable from any card (dashboard, lists): they show at once and sync.
Future<void> orderAction(BuildContext context, Map<String, dynamic> o, String label, Map<String, dynamic> body, Map<String, dynamic> fields, {bool delivery = false}) async {
  final s = context.read<AppState>();
  await s.enqueue(OutboxItem(
    id: newId(),
    method: delivery ? 'POST' : 'PATCH',
    path: delivery ? '/api/ecommerce/deliveries/${o['id']}' : '/api/ecommerce/orders/${o['id']}/status',
    body: body,
    label: label,
    effect: {'kind': 'order', 'id': o['id'], 'fields': fields},
    refresh: const ['orders', 'deliveries'],
  ));
  if (context.mounted) toast(context, s.online ? '$label ✓' : '$label — will sync when online');
}

Future<String?> askReason(BuildContext context, String title, List<String> presets) {
  final c = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: 420,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 8, runSpacing: 8, children: [for (final p in presets) ActionChip(label: Text(p), onPressed: () => c.text = p)]),
          const SizedBox(height: 12),
          TextField(controller: c, maxLines: 2, decoration: const InputDecoration(labelText: 'Reason')),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d), child: const Text('Back')),
        FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.pop(d, c.text.trim().length >= 3 ? c.text.trim() : null), child: const Text('Confirm')),
      ],
    ),
  );
}

Future<void> acceptOrder(BuildContext context, Map<String, dynamic> o) =>
    orderAction(context, o, 'Accept ${o['number']}', {'action': 'update_status', 'orderStatus': 'In Progress'}, {'status': 'In Progress'});

Future<void> rejectOrder(BuildContext context, Map<String, dynamic> o) async {
  final r = await askReason(context, 'Reject ${o['number']}?', const ['Out of stock', 'Address not serviceable', 'Customer not reachable', 'Duplicate order']);
  if (r != null && context.mounted) await orderAction(context, o, 'Reject ${o['number']}', {'action': 'update_status', 'orderStatus': 'Canceled', 'note': r}, {'status': 'Canceled', 'cancelReason': r});
}

/// Hand an online order to a delivery agent (marks it Out for Delivery).
Future<void> assignOrder(BuildContext context, Map<String, dynamic> o, Map<String, dynamic> agent) => orderAction(
      context, o, 'Assign ${o['number']} to ${agent['name']}', {'action': 'assign', 'agentId': toInt(agent['id'])},
      {'agentId': toInt(agent['id']), 'status': 'Out for Delivery', 'assignedAt': DateTime.now().toUtc().toIso8601String()},
    );

/// Mark an order paid, asking how the money came in.
Future<void> markOrderPaid(BuildContext context, Map<String, dynamic> o) async {
  final method = await showDialog<String>(
    context: context,
    builder: (d) => SimpleDialog(
      title: Text('Received ${money(o['total'])} by'),
      children: [for (final m in const ['Cash', 'UPI', 'Card', 'Other']) SimpleDialogOption(onPressed: () => Navigator.pop(d, m), child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(m)))],
    ),
  );
  if (method == null || !context.mounted) return;
  await orderAction(context, o, 'Paid ${o['number']}', {'action': 'update_payment', 'paymentStatus': 'Paid', 'method': method}, {'paymentStatus': 'Paid', 'paymentMethod': method});
}

/// Status choices this person may pick for an order, as on the website's status menu.
List<String> statusChoices(Perms p, Map<String, dynamic> o) {
  final st = '${o['status']}';
  if (o['type'] != 'online') return [st];
  return [
    st,
    if (st == 'Pending' && (p.acceptReject || p.updateStatus)) 'In Progress',
    if ((st == 'In Progress' || st == 'Out for Delivery') && p.updateStatus) 'Delivered',
    if (st != 'Delivered' && st != 'Canceled' && (p.cancelOrders || (st == 'Pending' && p.acceptReject))) 'Canceled',
  ];
}

Future<void> setOrderStatus(BuildContext context, Map<String, dynamic> o, String to) async {
  if (to == 'In Progress') return acceptOrder(context, o);
  if (to == 'Canceled') {
    final r = await askReason(context, 'Cancel ${o['number']}?', const ['Customer cancelled', 'Out of stock', 'Address not serviceable', 'Payment issue']);
    if (r != null && context.mounted) await orderAction(context, o, 'Cancel ${o['number']}', {'action': 'update_status', 'orderStatus': 'Canceled', 'note': r}, {'status': 'Canceled', 'cancelReason': r});
    return;
  }
  if (to == 'Delivered' && await confirm(context, 'Delivered?', 'Mark ${o['number']} as delivered to ${o['customer']}.', ok: 'Delivered') && context.mounted) {
    await orderAction(context, o, 'Delivered ${o['number']}', {'action': 'update_status', 'orderStatus': 'Delivered'}, {'status': 'Delivered', 'deliveredAt': DateTime.now().toUtc().toIso8601String()});
  }
}

Future<void> printOrder(BuildContext context, Map<String, dynamic> o) async {
  final s = context.read<AppState>();
  try {
    await reprintOrder(s.settings, o, s.settings['printerFormat'] as String? ?? 'thermal_80');
  } catch (_) {
    if (context.mounted) toast(context, 'Printer not available.', error: true);
  }
}
