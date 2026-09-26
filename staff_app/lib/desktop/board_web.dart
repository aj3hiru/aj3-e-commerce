import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../features/orders/order_actions.dart';
import '../features/orders/order_detail_screen.dart';
import '../widgets/web.dart';

/// "Deliveries Board" as on the website: numbers, orders waiting for an agent, one card per agent.
class BoardWeb extends StatelessWidget {
  const BoardWeb({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final p = s.perms;
    final orders = s.list('orders').where((o) => o['type'] == 'online').toList();
    final agents = s.list('agents');
    final today = DateRange.preset('today');
    final waiting = orders.where((o) => o['status'] == 'In Progress' && o['agentId'] == null).toList();
    final onWay = orders.where((o) => o['status'] == 'Out for Delivery').toList();
    final doneToday = orders.where((o) => o['status'] == 'Delivered' && today.contains(o['deliveredAt'])).toList();
    final toCollect = onWay.where((o) => o['paymentStatus'] != 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final cashToday = doneToday.where((o) => o['agentId'] != null && o['paymentMethod'] == 'COD' && o['paymentStatus'] == 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final busy = agents.where((a) => orders.any((o) => toInt(o['agentId']) == toInt(a['id']) && (o['status'] == 'Out for Delivery' || o['status'] == 'In Progress'))).length;

    void open(Map o) => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))));

    Widget agentCard(Map<String, dynamic> a) {
      final mine = orders.where((o) => toInt(o['agentId']) == toInt(a['id'])).toList();
      final active = mine.where((o) => o['status'] == 'Out for Delivery' || o['status'] == 'In Progress').toList();
      final done = mine.where((o) => o['status'] == 'Delivered' && today.contains(o['deliveredAt'])).toList();
      final collect = active.where((o) => o['paymentStatus'] != 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
      final cash = done.where((o) => o['paymentMethod'] == 'COD' && o['paymentStatus'] == 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
      Widget box(String v, String l, Color fg, Color bg) => Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
              child: Column(children: [
                Text(v, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: fg)),
                Text(l, style: TextStyle(fontSize: 12, color: fg)),
              ]),
            ),
          );
      return WebCard(
        padding: EdgeInsets.zero,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Container(width: 40, height: 40, decoration: const BoxDecoration(color: Color(0xFFE0F2FE), shape: BoxShape.circle), child: const Icon(LucideIcons.bike, size: 19, color: Color(0xFF0369A1))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${a['name']}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: W.g900)),
                  Text('${active.length} active · ${done.length} delivered today', style: const TextStyle(fontSize: 13, color: W.g500)),
                ]),
              ),
              if (a['phone'] != null) WebIconAction(LucideIcons.phone, color: W.green, soft: true, tooltip: 'Call ${a['phone']}', onTap: () => launchUrl(Uri.parse('tel:${a['phone']}'))),
            ]),
          ),
          const Divider(height: 1, color: W.g100),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                box(money(collect), 'to collect', const Color(0xFFB45309), const Color(0xFFFEF3C7)),
                const SizedBox(width: 8),
                box(money(cash), 'cash today', const Color(0xFF047857), const Color(0xFFD1FAE5)),
              ]),
              for (final o in active) ...[
                const SizedBox(height: 14),
                InkWell(
                  onTap: () => open(o),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('#${o['number']}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.blue))),
                      o['status'] == 'Out for Delivery'
                          ? const WebBadge('On the way', color: Color(0xFF0369A1), bg: Color(0xFFE0F2FE))
                          : const WebBadge('Preparing', color: W.g700, bg: W.g100),
                    ]),
                    const SizedBox(height: 2),
                    Text.rich(
                      TextSpan(children: [
                        TextSpan(text: '${o['customer']} · ${money(o['total'])} '),
                        if (o['paymentStatus'] != 'Paid') const TextSpan(text: '(collect)', style: TextStyle(color: Color(0xFFD97706))),
                        TextSpan(text: ' · assigned ${ago(o['assignedAt'] ?? o['createdAt'])}'),
                      ]),
                      style: const TextStyle(fontSize: 13, color: W.g500),
                    ),
                  ]),
                ),
              ],
            ]),
          ),
        ]),
      );
    }

    return WebPage(
      title: 'Deliveries Board',
      subtitle: 'Assign orders to delivery agents and see where every delivery is',
      onRefresh: () => s.syncNow(only: const ['orders', 'agents']),
      children: [
        WebGrid(columns: 6, gap: 12, minWidth: 150, children: [
          WebMiniMetric(icon: LucideIcons.clock, color: const Color(0xFFD97706), value: '${waiting.length}', label: '', sub: 'Waiting for agent'),
          WebMiniMetric(icon: LucideIcons.truck, color: const Color(0xFF0284C7), value: '${onWay.length}', label: '', sub: 'On the way'),
          WebMiniMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF059669), value: '${doneToday.length}', label: '', sub: 'Delivered today'),
          WebMiniMetric(icon: LucideIcons.wallet, color: const Color(0xFFDC2626), value: money(toCollect), label: '', sub: 'Cash to collect'),
          WebMiniMetric(icon: LucideIcons.indianRupee, color: W.primary, value: money(cashToday), label: '', sub: 'Collected today'),
          WebMiniMetric(icon: LucideIcons.users, color: W.g700, tinted: false, value: '$busy / ${agents.length}', label: '', sub: 'Agents busy'),
        ]),
        const SizedBox(height: 16),
        WebCard(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(color: Color(0xFFFEF9E7), borderRadius: BorderRadius.vertical(top: Radius.circular(W.radius))),
              child: Row(children: [
                const Icon(LucideIcons.clock, size: 16, color: Color(0xFF92400E)),
                const SizedBox(width: 8),
                const Text('Waiting for a delivery agent', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF92400E))),
                const SizedBox(width: 10),
                Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)), child: Text('${waiting.length}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600))),
              ]),
            ),
            const Divider(height: 1, color: W.g200),
            if (waiting.isEmpty)
              const Padding(padding: EdgeInsets.all(16), child: Text('All accepted orders have an agent.', style: TextStyle(fontSize: 15, color: W.g600)))
            else
              for (final o in waiting)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: W.g100))),
                  child: Row(children: [
                    Expanded(flex: 2, child: Cell2('#${o['number']}', b: '${o['customer']} · ${money(o['total'])}${o['paymentStatus'] != 'Paid' ? ' (collect)' : ''} · ${ago(o['createdAt'])}', aColor: W.blue, onTap: () => open(o))),
                    Expanded(flex: 2, child: Text('${o['address'] ?? ''}'.replaceAll('\n', ', '), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g600))),
                    const SizedBox(width: 12),
                    if (p.assignDelivery && agents.isNotEmpty)
                      WebSelect<int>(
                        width: 190,
                        icon: LucideIcons.bike,
                        value: 0,
                        options: [(0, 'Assign agent…'), for (final a in agents) (toInt(a['id']), '${a['name']}')],
                        onChanged: (id) {
                          if (id != 0) assignOrder(context, o, agents.firstWhere((a) => toInt(a['id']) == id));
                        },
                      ),
                  ]),
                ),
          ]),
        ),
        const SizedBox(height: 16),
        if (agents.isEmpty)
          const WebCard(child: Text('No delivery agents yet — add staff with the Delivery Agent role.', style: TextStyle(color: W.g600)))
        else
          WebGrid(columns: 3, gap: 16, minWidth: 300, children: [for (final a in agents) agentCard(a)]),
      ],
    );
  }
}
