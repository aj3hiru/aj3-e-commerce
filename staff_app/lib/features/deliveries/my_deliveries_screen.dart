import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/nav.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../orders/order_detail_screen.dart';

/// Delivery agent's app: my orders to deliver, cash to collect, done today.
class MyDeliveriesScreen extends StatefulWidget {
  const MyDeliveriesScreen({super.key});
  @override
  State<MyDeliveriesScreen> createState() => _MyDeliveriesScreenState();
}

class _MyDeliveriesScreenState extends State<MyDeliveriesScreen> {
  int _navSeq = -1;
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    if (nav.seq != _navSeq) {
      _navSeq = nav.seq;
      final a = nav.take('deliveries');
      if (a['done'] == true) _done = true;
    }
    final s = context.watch<AppState>();
    final all = s.list('deliveries');
    final active = all.where((o) => o['status'] != 'Delivered' && o['status'] != 'Canceled').toList()
      ..sort((a, b) => (a['status'] == 'Out for Delivery' ? 0 : 1).compareTo(b['status'] == 'Out for Delivery' ? 0 : 1));
    final finished = all.where((o) => o['status'] == 'Delivered' || o['status'] == 'Canceled').toList()..sort((a, b) => '${b['deliveredAt'] ?? b['createdAt']}'.compareTo('${a['deliveredAt'] ?? a['createdAt']}'));
    final doneToday = finished.where((o) => o['deliveredAt'] != null && dateShort(o['deliveredAt']) == dateShort(DateTime.now().toUtc())).length;
    final toCollect = active.where((o) => o['paymentStatus'] != 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final list = _done ? finished : active;

    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('My deliveries'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      body: RefreshIndicator(
        onRefresh: () => s.syncNow(only: const ['deliveries']),
        child: PageBody(
          maxWidth: 900,
          child: ListView(padding: const EdgeInsets.all(16), children: !isWide(context)
              ? [
                  Row(children: [
                    Expanded(child: PastelTile(icon: Icons.two_wheeler_rounded, label: 'To deliver', value: '${active.length}', tint: pastel[3].$1, ink: pastel[3].$2, onTap: () => setState(() => _done = false))),
                    const SizedBox(width: 10),
                    Expanded(child: PastelTile(icon: Icons.task_alt_rounded, label: 'Done today', value: '$doneToday', tint: pastel[0].$1, ink: pastel[0].$2, onTap: () => setState(() => _done = true))),
                    const SizedBox(width: 10),
                    Expanded(child: PastelTile(icon: Icons.payments_outlined, label: 'To collect', value: money(toCollect), tint: pastel[1].$1, ink: pastel[1].$2)),
                  ]),
                  const SizedBox(height: 16),
                  Transform.translate(
                    offset: const Offset(-16, 0),
                    child: SizedBox(
                      width: MediaQuery.sizeOf(context).width,
                      child: PillTabs(tabs: const [('active', 'To deliver'), ('done', 'Finished')], selected: _done ? 'done' : 'active', onSelect: (k) => setState(() => _done = k == 'done'), counts: {'active': active.length, 'done': finished.length}),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (list.isEmpty)
                    EmptyState(icon: _done ? Icons.inventory_2_outlined : Icons.celebration_outlined, title: _done ? 'Nothing finished yet' : 'No deliveries right now', message: _done ? null : 'New orders assigned to you will appear here.'),
                  for (final o in list) ...[
                    PhotoOrderCard(
                      order: o,
                      badge: StatusChip(o['paymentStatus'] == 'Paid' ? 'Paid' : 'Collect'),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']), agentView: true))),
                      actions: _done ? [StatusChip('${o['status']}')] : [
                        if (o['phone'] != null) _round(Icons.call_rounded, () => launchUrl(Uri.parse('tel:${o['phone']}'))),
                        if (o['lat'] != null || o['address'] != null) _round(Icons.navigation_rounded, () => _navigate(o)),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],
                  const FreshnessNote(),
                ]
              : [
            SizedBox(height: 150, child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: KpiTile(icon: Icons.two_wheeler_rounded, label: 'To deliver', value: '${active.length}', color: AppColors.cyan, soft: AppColors.cyanSoft)),
              const SizedBox(width: 10),
              Expanded(child: KpiTile(icon: Icons.task_alt_rounded, label: 'Done today', value: '$doneToday', color: AppColors.green, soft: AppColors.greenSoft)),
            ])),
            const SizedBox(height: 10),
            KpiTile(icon: Icons.payments_outlined, label: 'Cash to collect', value: money(toCollect), sub: 'from customers on your list', color: AppColors.amber, soft: AppColors.amberSoft),
            const SizedBox(height: 14),
            SegmentedButton<bool>(
              segments: [ButtonSegment(value: false, label: Text('To deliver (${active.length})')), ButtonSegment(value: true, label: Text('Finished (${finished.length})'))],
              selected: {_done},
              onSelectionChanged: (v) => setState(() => _done = v.first),
            ),
            const SizedBox(height: 12),
            if (list.isEmpty)
              EmptyState(icon: _done ? Icons.inventory_2_outlined : Icons.celebration_outlined, title: _done ? 'Nothing finished yet' : 'No deliveries right now', message: _done ? null : 'New orders assigned to you will appear here.'),
            for (final o in list) ...[_DeliveryCard(order: o), const SizedBox(height: 10)],
            const FreshnessNote(),
          ]),
        ),
      ),
    );
  }

  Widget _round(IconData icon, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(left: 8),
        child: Material(
          color: AppColors.primary,
          shape: const CircleBorder(),
          child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Padding(padding: const EdgeInsets.all(8), child: Icon(icon, color: Colors.white, size: 18))),
        ),
      );
}

void _navigate(Map<String, dynamic> o) {
  final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address']}');
  launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest&travelmode=two-wheeler'), mode: LaunchMode.externalApplication);
}

class _DeliveryCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const _DeliveryCard({required this.order});
  @override
  Widget build(BuildContext context) {
    final o = order;
    final items = (o['items'] as List?) ?? const [];
    return AppCard(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']), agentView: true))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('${o['number']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          StatusChip('${o['status']}'),
        ]),
        const SizedBox(height: 8),
        Text('${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w700)),
        if (o['address'] != null) Text('${o['address']}', maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 8),
        Row(children: [
          Text('${items.length} item${items.length == 1 ? '' : 's'} · ', style: const TextStyle(color: AppColors.muted)),
          Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          StatusChip(o['paymentStatus'] == 'Paid' ? 'Paid' : 'Collect ${o['paymentMethod']}'),
          const Spacer(),
          if (o['phone'] != null) IconButton.filledTonal(icon: const Icon(Icons.call_rounded, size: 20), onPressed: () => launchUrl(Uri.parse('tel:${o['phone']}'))),
          if (o['lat'] != null || o['address'] != null)
            IconButton.filledTonal(icon: const Icon(Icons.navigation_rounded, size: 20), onPressed: () => _navigate(o)),
        ]),
      ]),
    );
  }
}
