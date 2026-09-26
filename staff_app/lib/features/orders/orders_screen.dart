import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/nav.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'order_detail_screen.dart';

const orderTabs = [
  ('all', 'All'),
  ('Pending', 'New'),
  ('In Progress', 'Preparing'),
  ('Out for Delivery', 'On the way'),
  ('Delivered', 'Delivered'),
  ('Canceled', 'Cancelled'),
];

/// Online and store orders — tabs by status, search, tap for details and actions.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  int _navSeq = -1;
  String _tab = 'Pending';
  String _channel = 'online';
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    if (nav.seq != _navSeq) {
      _navSeq = nav.seq;
      final a = nav.take('orders');
      if (a['tab'] is String) {
        _tab = a['tab'];
        _channel = 'online';
      }
    }
    final s = context.watch<AppState>();
    final agents = {for (final a in s.list('agents')) toInt(a['id']): a['name']};
    final all = s.list('orders').where((o) => _channel == 'all' || o['type'] == _channel).toList();
    int count(String st) => st == 'all' ? all.length : all.where((o) => o['status'] == st).length;
    final q = _q.trim().toLowerCase();
    final list = all.where((o) => (_tab == 'all' || o['status'] == _tab) && (q.isEmpty || '${o['number']} ${o['customer']} ${o['phone'] ?? ''}'.toLowerCase().contains(q))).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Orders'),
        actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: SizedBox(
            height: 48,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), children: [
              for (final (key, label) in orderTabs)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('$label  ${count(key)}'),
                    selected: _tab == key,
                    onSelected: (_) => setState(() => _tab = key),
                    labelStyle: TextStyle(color: _tab == key ? AppColors.primary : AppColors.text, fontWeight: _tab == key ? FontWeight.w700 : FontWeight.w500),
                  ),
                ),
            ]),
          ),
        ),
      ),
      body: PageBody(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Builder(builder: (context) {
              final search = SearchBox(hint: 'Order no., name or mobile', onChanged: (v) => setState(() => _q = v));
              final channel = SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [ButtonSegment(value: 'online', label: Text('Online')), ButtonSegment(value: 'offline', label: Text('Store')), ButtonSegment(value: 'all', label: Text('All'))],
                selected: {_channel},
                onSelectionChanged: (v) => setState(() => _channel = v.first),
              );
              return isWide(context)
                  ? Row(children: [Expanded(child: search), const SizedBox(width: 10), channel])
                  : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [search, const SizedBox(height: 10), channel]);
            }),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => s.syncNow(only: const ['orders']),
              child: list.isEmpty
                  ? ListView(children: const [SizedBox(height: 80), EmptyState(icon: Icons.receipt_long_outlined, title: 'No orders here', message: 'Pull down to refresh.')])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      itemCount: list.length + 1,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (c, i) => i == list.length ? const FreshnessNote() : OrderCard(order: list[i], agentName: agents[toInt(list[i]['agentId'])]),
                    ),
            ),
          ),
        ]),
      ),
    );
  }
}

class OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final String? agentName;
  const OrderCard({super.key, required this.order, this.agentName});
  @override
  Widget build(BuildContext context) {
    final o = order;
    final items = (o['items'] as List?) ?? const [];
    final local = o['localRef'] != null;
    return AppCard(
      onTap: local ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id'])))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(o['type'] == 'online' ? Icons.language_rounded : Icons.storefront_outlined, size: 18, color: AppColors.muted),
          const SizedBox(width: 6),
          Expanded(child: Text(local ? 'Offline bill (uploading)' : '${o['number']}', style: const TextStyle(fontWeight: FontWeight.w700))),
          StatusChip(local ? 'Waiting' : '${o['status']}'),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('${items.length} item${items.length == 1 ? '' : 's'} · ${ago(o['createdAt'])}${agentName != null ? ' · Agent: $agentName' : ''}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            Text(toDouble(o['due']) > 0 ? 'Due ${money(o['due'])}' : '${o['paymentStatus']} · ${o['paymentMethod']}',
                style: TextStyle(fontSize: 12, color: toDouble(o['due']) > 0 ? AppColors.red : AppColors.muted, fontWeight: FontWeight.w600)),
          ]),
        ]),
      ]),
    );
  }
}
