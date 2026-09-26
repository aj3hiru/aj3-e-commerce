import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

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
