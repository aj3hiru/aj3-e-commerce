import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/perms.dart';
import '../../widgets/common.dart';
import '../pos/receipt.dart';
import '../../ds/ds.dart';

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
  return showAppDialog<String>(
    context,
    title: title,
    icon: Icons.report_problem_outlined,
    width: 440,
    builder: (d) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 6, runSpacing: 6, children: [for (final p in presets) ActionChip(label: Text(p), onPressed: () => c.text = p)]),
      const AppGap(),
      AppField(controller: c, label: 'Reason', autofocus: true, maxLines: 2),
    ]),
    actions: [
      const DAction.cancel('Back'),
      DAction('Confirm', primary: true, variant: DVariant.danger, onPressed: () async {
        if (c.text.trim().length < 3) return toast(context, 'Write a short reason (or pick one).', error: true);
        popDialog(context, c.text.trim());
      }),
    ],
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
  final method = await pickPaymentMethod(context, 'Received ${money(o['total'])} by');
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

/// Print an order's bill with the app's own invoice (works offline), on the paper
/// chosen in Business Settings → Invoice & POS: thermal 58 / 80 mm or A4 —
/// "Ask" lets the person pick each time. Goes to the printer chosen in Printing settings.
Future<void> printOrder(BuildContext context, Map<String, dynamic> o) async {
  final s = context.read<AppState>();
  var size = s.settings['printerFormat'] as String? ?? 'thermal_80';
  if ((s.settings['posPrintMode'] ?? 'both') == 'both') {
    final picked = await showAppSheet<String>(context, title: 'Print ${o['number'] ?? 'bill'}', width: 360, builder: (c) => Column(mainAxisSize: MainAxisSize.min, children: [
          for (final (v, l, i) in const [('thermal_80', 'Thermal 80 mm', Icons.receipt_long_outlined), ('thermal_58', 'Thermal 58 mm', Icons.receipt_outlined), ('a4', 'A4 invoice', Icons.description_outlined)])
            AppChoice(leading: Icon(i), title: l, selected: size == v, onTap: () => popDialog(c, v)),
        ]));
    if (picked == null) return;
    size = picked;
  } else if (s.settings['posPrintMode'] == 'a4') {
    size = 'a4';
  }
  try {
    await reprintOrder(s.settings, o, size, payments: ((o['pays'] as List?) ?? const []).cast<Map>());
  } catch (_) {
    if (context.mounted) toast(context, 'Printer not available.', error: true);
  }
}

/// Print a saved order by id (looks it up in the orders on this device).
Future<void> printInvoice(BuildContext context, int orderId, String number) async {
  final o = context.read<AppState>().list('orders').where((x) => toInt(x['id']) == orderId).firstOrNull;
  if (o == null) return toast(context, 'Bill $number is still uploading — try again in a moment.');
  await printOrder(context, o);
}

/// Cash / UPI / Card / Other — a small window on Windows, a sheet on phones.
Future<String?> pickPaymentMethod(BuildContext context, String title) => showAppSheet<String>(
      context,
      title: title,
      width: 360,
      builder: (c) => Column(mainAxisSize: MainAxisSize.min, children: [
        for (final (m, icon) in const [('Cash', Icons.payments_outlined), ('UPI', Icons.qr_code_2_rounded), ('Card', Icons.credit_card_rounded), ('Other', Icons.more_horiz_rounded)])
          AppChoice(leading: Icon(icon), title: m, onTap: () => popDialog(context, m)),
      ]),
    );
