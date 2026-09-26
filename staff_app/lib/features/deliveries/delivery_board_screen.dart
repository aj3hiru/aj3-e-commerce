import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../orders/order_detail_screen.dart';
import '../orders/orders_screen.dart';

/// Managers: who is delivering what — orders waiting for an agent, and each agent's load.
class DeliveryBoardScreen extends StatelessWidget {
  const DeliveryBoardScreen({super.key});

  Future<void> _assign(BuildContext context, Map<String, dynamic> o, List<Map<String, dynamic>> agents) async {
    final s = context.read<AppState>();
    if (agents.isEmpty) return toast(context, 'No delivery agents yet — add one in Staff.', error: true);
    final id = await showModalBottomSheet<int>(
      context: context,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Assign ${o['number']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          for (final a in agents) ListTile(leading: Avatar('${a['name']}'), title: Text('${a['name']}'), subtitle: Text('${a['phone'] ?? ''}'), onTap: () => Navigator.pop(c, toInt(a['id']))),
        ]),
      ),
    );
    if (id == null) return;
    final name = agents.firstWhere((a) => toInt(a['id']) == id)['name'];
    await s.enqueue(OutboxItem(
      id: newId(), method: 'PATCH', path: '/api/ecommerce/orders/${o['id']}/status', body: {'action': 'assign', 'agentId': id}, label: 'Assign ${o['number']} to $name',
      effect: {'kind': 'order', 'id': o['id'], 'fields': {'agentId': id, 'status': 'Out for Delivery', 'assignedAt': DateTime.now().toUtc().toIso8601String()}}, refresh: const ['orders'],
    ));
    if (context.mounted) toast(context, 'Assigned to $name — marked Out for Delivery.');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final orders = s.list('orders').where((o) => o['type'] == 'online').toList();
    final agents = s.list('agents');
    final waiting = orders.where((o) => o['status'] == 'In Progress' && o['agentId'] == null).toList();
    final today = dateShort(DateTime.now().toUtc());
    final wide = isWide(context);

    Widget agentCard(Map<String, dynamic> a) {
      final mine = orders.where((o) => toInt(o['agentId']) == toInt(a['id'])).toList();
      final onWay = mine.where((o) => o['status'] == 'Out for Delivery').toList();
      final prep = mine.where((o) => o['status'] == 'In Progress').length;
      final done = mine.where((o) => o['status'] == 'Delivered' && o['deliveredAt'] != null && dateShort(o['deliveredAt']) == today).length;
      final cash = onWay.where((o) => o['paymentStatus'] != 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
      return AppCard(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _AgentOrders(agent: a))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Avatar('${a['name']}', size: 42),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${a['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                Text(onWay.isEmpty && prep == 0 ? 'Free' : 'Busy', style: TextStyle(color: onWay.isEmpty && prep == 0 ? AppColors.green : AppColors.amber, fontWeight: FontWeight.w600, fontSize: 12.5)),
              ]),
            ),
            if (a['phone'] != null) IconButton.filledTonal(icon: const Icon(Icons.call_rounded, size: 20), onPressed: () => launchUrl(Uri.parse('tel:${a['phone']}'))),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            _stat('On the way', '${onWay.length}', AppColors.cyan),
            _stat('Preparing', '$prep', AppColors.blue),
            _stat('Done today', '$done', AppColors.green),
          ]),
          if (cash > 0) ...[const SizedBox(height: 10), Text('Cash to collect: ${money(cash)}', style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.w700))],
        ]),
      );
    }

    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('Delivery board'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      body: RefreshIndicator(
        onRefresh: () => s.syncNow(only: const ['orders', 'agents']),
        child: PageBody(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            SectionCard(
              title: 'Ready to send (${waiting.length})',
              icon: Icons.inventory_rounded,
              child: waiting.isEmpty
                  ? const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Every prepared order has an agent.', style: TextStyle(color: AppColors.muted)))
                  : Column(children: [
                      for (final o in waiting)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id'])))),
                          title: Text('${o['number']} · ${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text('${money(o['total'])} · ${ago(o['createdAt'])}${o['address'] != null ? ' · ${'${o['address']}'.split('\n').last}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
                          trailing: s.perms.assignDelivery ? FilledButton.tonal(onPressed: () => _assign(context, o, agents), child: const Text('Assign')) : null,
                        ),
                    ]),
            ),
            const SizedBox(height: 16),
            SectionTitle('Agents (${agents.length})', icon: Icons.two_wheeler_rounded),
            if (agents.isEmpty) const EmptyState(icon: Icons.person_add_alt_1_outlined, title: 'No delivery agents yet', message: 'Add staff with the Delivery Agent role.'),
            if (agents.isNotEmpty)
              GridView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: wide ? 3 : 1, mainAxisSpacing: 12, crossAxisSpacing: 12, mainAxisExtent: 170),
                children: [for (final a in agents) agentCard(a)],
              ),
            const FreshnessNote(),
          ]),
        ),
      ),
    );
  }

  Widget _stat(String label, String value, Color color) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        ]),
      );
}

class _AgentOrders extends StatelessWidget {
  final Map<String, dynamic> agent;
  const _AgentOrders({required this.agent});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final list = s.list('orders').where((o) => toInt(o['agentId']) == toInt(agent['id'])).toList();
    return Scaffold(
      appBar: AppBar(title: Text('${agent['name']}')),
      body: PageBody(
        maxWidth: 900,
        child: list.isEmpty
            ? const EmptyState(icon: Icons.inbox_outlined, title: 'No orders for this agent')
            : ListView.separated(padding: const EdgeInsets.all(16), itemCount: list.length, separatorBuilder: (_, _) => const SizedBox(height: 8), itemBuilder: (c, i) => OrderCard(order: list[i])),
      ),
    );
  }
}
