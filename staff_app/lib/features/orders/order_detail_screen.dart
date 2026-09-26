import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../../widgets/web.dart';
import '../customers/customers_screen.dart' show CustomerProfile;
import '../pos/receipt.dart';
import 'order_actions.dart';

part 'order_detail_web.dart';

/// One order: items, bill, customer, history, and the actions this role may take.
/// Actions work offline too — they show at once and reach the server when it can.
class OrderDetailScreen extends StatefulWidget {
  final int orderId;
  final bool agentView;
  const OrderDetailScreen({super.key, required this.orderId, this.agentView = false});
  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map<String, dynamic>? _extra; // history, payments, agent (online only)

  @override
  void initState() {
    super.initState();
    _loadExtra();
  }

  Future<void> _loadExtra() async {
    final r = await context.read<AppState>().api.get('/api/app/v1/orders/${widget.orderId}');
    if (r.ok && mounted) setState(() => _extra = Map<String, dynamic>.from(r.data['order']));
  }

  Map<String, dynamic>? _order(AppState s) {
    for (final set in ['orders', 'deliveries']) {
      final o = s.list(set).where((x) => toInt(x['id']) == widget.orderId).firstOrNull;
      if (o != null) return o;
    }
    return null;
  }

  Future<void> _act(String label, Map<String, dynamic> body, Map<String, dynamic> fields, {bool delivery = false}) async {
    final s = context.read<AppState>();
    await s.enqueue(OutboxItem(
      id: newId(),
      method: delivery ? 'POST' : 'PATCH',
      path: delivery ? '/api/ecommerce/deliveries/${widget.orderId}' : '/api/ecommerce/orders/${widget.orderId}/status',
      body: body,
      label: label,
      effect: {'kind': 'order', 'id': widget.orderId, 'fields': fields},
      refresh: const ['orders', 'deliveries'],
    ));
    if (mounted) toast(context, s.online ? '$label ✓' : '$label — will sync when online');
    _loadExtra();
  }

  Future<String?> _reason(String title, List<String> presets) async {
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

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final o = _order(s);
    if (o == null) {
      return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.search_off_rounded, title: 'Order not found', message: 'It may be older than 60 days. Open it on the website.'));
    }
    final p = s.perms;
    final st = '${o['status']}';
    final online = o['type'] == 'online';
    final agents = s.list('agents');
    final agentName = _extra?['agent']?['name'] ?? agents.where((a) => toInt(a['id']) == toInt(o['agentId'])).firstOrNull?['name'];
    final mine = toInt(o['agentId']) == toInt(s.user?['id']);
    final wide = isWide(context);

    final actions = <Widget>[
      if (online && st == 'Pending' && (p.acceptReject || p.updateStatus))
        FilledButton.icon(icon: const Icon(Icons.check_rounded), label: const Text('Accept'), onPressed: () => _act('Accept ${o['number']}', {'action': 'update_status', 'orderStatus': 'In Progress'}, {'status': 'In Progress'})),
      if (online && st == 'Pending' && (p.acceptReject || p.cancelOrders))
        OutlinedButton.icon(style: OutlinedButton.styleFrom(foregroundColor: AppColors.red), icon: const Icon(Icons.close_rounded), label: const Text('Reject'), onPressed: () async {
          final r = await _reason('Reject order?', const ['Out of stock', 'Address not serviceable', 'Customer not reachable', 'Duplicate order']);
          if (r != null) _act('Reject ${o['number']}', {'action': 'update_status', 'orderStatus': 'Canceled', 'note': r}, {'status': 'Canceled', 'cancelReason': r});
        }),
      if (online && st == 'In Progress' && p.assignDelivery)
        FilledButton.icon(icon: const Icon(Icons.two_wheeler_rounded), label: Text(o['agentId'] == null ? 'Assign delivery' : 'Change agent'), onPressed: () => _assign(o, agents)),
      if (online && widget.agentView && mine && st == 'In Progress')
        FilledButton.icon(icon: const Icon(Icons.navigation_rounded), label: const Text('Start delivery'), onPressed: () => _act('Start delivery ${o['number']}', {'action': 'start'}, {'status': 'Out for Delivery'}, delivery: true)),
      if (online && st == 'Out for Delivery' && (widget.agentView ? mine : p.updateStatus))
        FilledButton.icon(icon: const Icon(Icons.task_alt_rounded), label: const Text('Mark delivered'), onPressed: () async {
          if (await confirm(context, 'Delivered?', 'Mark ${o['number']} as delivered to ${o['customer']}.', ok: 'Delivered')) {
            widget.agentView
                ? _act('Delivered ${o['number']}', {'action': 'deliver'}, {'status': 'Delivered', 'deliveredAt': DateTime.now().toUtc().toIso8601String()}, delivery: true)
                : _act('Delivered ${o['number']}', {'action': 'update_status', 'orderStatus': 'Delivered'}, {'status': 'Delivered', 'deliveredAt': DateTime.now().toUtc().toIso8601String()});
          }
        }),
      if (online && o['paymentStatus'] != 'Paid' && st != 'Canceled' && (widget.agentView ? mine : p.markPaid))
        OutlinedButton.icon(icon: const Icon(Icons.payments_outlined), label: const Text('Payment received'), onPressed: () => _collect(o)),
      if (online && widget.agentView && mine && (st == 'Out for Delivery' || st == 'In Progress'))
        OutlinedButton.icon(icon: const Icon(Icons.report_problem_outlined), label: const Text("Couldn't deliver"), onPressed: () async {
          final r = await _reason("Couldn't deliver", const ['Customer not reachable', 'Customer not at home', 'Wrong address', 'Customer asked to come later']);
          if (r != null) _act('Delivery attempt ${o['number']}', {'action': 'fail', 'note': r}, st == 'Out for Delivery' ? {'status': 'In Progress'} : {}, delivery: true);
        }),
      if (online && !widget.agentView && (st == 'In Progress' || st == 'Out for Delivery') && p.cancelOrders)
        OutlinedButton.icon(style: OutlinedButton.styleFrom(foregroundColor: AppColors.red), icon: const Icon(Icons.cancel_outlined), label: const Text('Cancel order'), onPressed: () async {
          final r = await _reason('Cancel order?', const ['Customer cancelled', 'Out of stock', 'Payment issue']);
          if (r != null) _act('Cancel ${o['number']}', {'action': 'update_status', 'orderStatus': 'Canceled', 'note': r}, {'status': 'Canceled', 'cancelReason': r});
        }),
      OutlinedButton.icon(icon: const Icon(Icons.print_outlined), label: const Text('Print bill'), onPressed: () => _print(s, o)),
    ];

    if (wide) return _web(s, o, agents, agentName, mine);
    final items = ((o['items'] as List?) ?? const []).cast<Map>();
    final main = [
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('${o['number']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
            StatusChip(st),
          ]),
          const SizedBox(height: 4),
          Text('${online ? 'Online order' : 'Store bill'} · ${dateTime(o['createdAt'])}', style: const TextStyle(color: AppColors.muted)),
          if (o['cancelReason'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Reason: ${o['cancelReason']}', style: const TextStyle(color: AppColors.red))),
          const SizedBox(height: 14),
          Wrap(spacing: 8, runSpacing: 8, children: actions),
        ]),
      ),
      const SizedBox(height: 12),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle('Items (${items.length})', icon: Icons.shopping_bag_outlined),
          for (final it in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                Expanded(child: Text('${it['name']}', style: const TextStyle(fontWeight: FontWeight.w600))),
                Text('${it['qty']} × ${money(it['price'])}', style: const TextStyle(color: AppColors.muted)),
                SizedBox(width: 96, child: Text(money(toDouble(it['qty']) * toDouble(it['price'])), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
              ]),
            ),
          const Divider(height: 20),
          InfoRow('Subtotal', money(o['subtotal'])),
          if (toDouble(o['discount']) > 0) InfoRow('Discount', '-${money(o['discount'])}', color: AppColors.green),
          InfoRow('GST', money(o['gst'])),
          InfoRow('Total', money(o['total']), bold: true),
          InfoRow('Payment', '${o['paymentStatus']} · ${o['paymentMethod']}'),
          if (toDouble(o['due']) > 0) InfoRow('Due', money(o['due']), bold: true, color: AppColors.red),
        ]),
      ),
    ];

    final side = [
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SectionTitle('Customer', icon: Icons.person_outline_rounded),
          Text('${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          if (o['phone'] != null) Text('${o['phone']}', style: const TextStyle(color: AppColors.muted)),
          if (o['address'] != null) ...[const SizedBox(height: 8), Text('${o['address']}')],
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (o['phone'] != null) OutlinedButton.icon(icon: const Icon(Icons.call_outlined, size: 18), label: const Text('Call'), onPressed: () => launchUrl(Uri.parse('tel:${o['phone']}'))),
            if (o['phone'] != null) OutlinedButton.icon(icon: const Icon(Icons.chat_outlined, size: 18), label: const Text('WhatsApp'), onPressed: () => launchUrl(Uri.parse('https://wa.me/91${'${o['phone']}'.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '')}'), mode: LaunchMode.externalApplication)),
            if (o['lat'] != null || o['address'] != null)
              OutlinedButton.icon(icon: const Icon(Icons.map_outlined, size: 18), label: const Text('Map'), onPressed: () {
                final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address']}');
                launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest'), mode: LaunchMode.externalApplication);
              }),
          ]),
          if (agentName != null) ...[const Divider(height: 24), InfoRow('Delivery agent', '$agentName')],
        ]),
      ),
      const SizedBox(height: 12),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SectionTitle('History', icon: Icons.history_rounded),
          if (_extra == null) Text(s.online ? 'Loading…' : 'Available when online.', style: const TextStyle(color: AppColors.muted)),
          for (final e in ((_extra?['events'] as List?) ?? const []).cast<Map>().toList().reversed)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(padding: EdgeInsets.only(top: 5), child: Icon(Icons.circle, size: 8, color: AppColors.primary)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_eventText(e), style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text('${e['actorName']} · ${dateTime(e['createdAt'])}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    if (e['note'] != null) Text('${e['note']}', style: const TextStyle(fontSize: 13)),
                  ]),
                ),
              ]),
            ),
        ]),
      ),
    ];

    String digits(String v) => v.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '');
    // Phones: delivery-app layout — black contact card, tinted info rows, actions, then the bill.
    final phone = [
      ContactCard(
        name: '${o['customer']}',
        subtitle: o['phone'] != null ? '${o['phone']}' : (online ? 'Online customer' : 'Store customer'),
        onChat: o['phone'] == null ? null : () => launchUrl(Uri.parse('https://wa.me/91${digits('${o['phone']}')}'), mode: LaunchMode.externalApplication),
        onCall: o['phone'] == null ? null : () => launchUrl(Uri.parse('tel:${o['phone']}')),
      ),
      const SizedBox(height: 14),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (o['address'] != null)
            InkWell(
              onTap: () {
                final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address']}');
                launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest'), mode: LaunchMode.externalApplication);
              },
              child: TintedInfo(icon: Icons.location_on_rounded, label: 'Address  ·  tap for map', value: '${o['address']}'.replaceAll('\n', ', '), color: AppColors.red, tint: AppColors.redSoft),
            ),
          TintedInfo(icon: Icons.schedule_rounded, label: online ? 'Order placed' : 'Bill time', value: dateTime(o['createdAt']), color: const Color(0xFF7C5CE0), tint: AppColors.lilac),
          TintedInfo(icon: Icons.receipt_long_rounded, label: 'Order number · $st', value: '${o['number']}', color: AppColors.primary, tint: AppColors.primarySoft),
          TintedInfo(icon: Icons.payments_rounded, label: 'Payment · ${o['paymentMethod']}', value: toDouble(o['due']) > 0 ? '${o['paymentStatus']} · due ${money(o['due'])}' : '${o['paymentStatus']} · ${money(o['total'])}', color: const Color(0xFF12A37F), tint: AppColors.mint),
          if (agentName != null) TintedInfo(icon: Icons.two_wheeler_rounded, label: 'Delivery agent', value: '$agentName', color: const Color(0xFF3B7BE0), tint: AppColors.sky),
          if (o['cancelReason'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Reason: ${o['cancelReason']}', style: const TextStyle(color: AppColors.red))),
        ]),
      ),
      const SizedBox(height: 14),
      Wrap(spacing: 8, runSpacing: 8, children: actions),
      const SizedBox(height: 14),
      main[2],
      const SizedBox(height: 12),
      side[2],
    ];

    return Scaffold(
      appBar: AppBar(title: Text('${o['number']}')),
      body: RefreshIndicator(
        onRefresh: () async {
          await s.syncNow(only: const ['orders', 'deliveries']);
          await _loadExtra();
        },
        child: PageBody(
          child: ListView(padding: const EdgeInsets.all(16), children: wide
              ? [Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: Column(children: main)), const SizedBox(width: 16), Expanded(flex: 2, child: Column(children: side))])]
              : phone),
        ),
      ),
    );
  }

  String _eventText(Map e) => switch (e['type']) {
        'placed' => 'Order placed',
        'status' => 'Status: ${e['fromValue'] ?? ''} → ${e['toValue'] ?? ''}',
        'payment' => 'Payment: ${e['toValue'] ?? ''}',
        'assign' => e['toValue'] == null ? 'Delivery agent removed' : 'Assigned to ${e['toValue']}',
        'note' => 'Note',
        _ => '${e['type']}',
      };

  Future<void> _assign(Map<String, dynamic> o, List<Map<String, dynamic>> agents) async {
    if (agents.isEmpty) return toast(context, 'No delivery agents yet — add one in Staff.', error: true);
    final id = await showModalBottomSheet<int>(
      context: context,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Assign delivery agent', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          for (final a in agents)
            ListTile(
              leading: Avatar('${a['name']}'),
              title: Text('${a['name']}'),
              subtitle: a['phone'] != null ? Text('${a['phone']}') : null,
              trailing: toInt(a['id']) == toInt(o['agentId']) ? Icon(Icons.check_rounded, color: AppColors.primary) : null,
              onTap: () => Navigator.pop(c, toInt(a['id'])),
            ),
        ]),
      ),
    );
    if (id == null) return;
    final name = agents.firstWhere((a) => toInt(a['id']) == id)['name'];
    _act('Assign ${o['number']} to $name', {'action': 'assign', 'agentId': id}, {'agentId': id, 'status': 'Out for Delivery', 'assignedAt': DateTime.now().toUtc().toIso8601String()});
  }

  Future<void> _collect(Map<String, dynamic> o) async {
    final method = await showModalBottomSheet<String>(
      context: context,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Received ${money(o['total'])} by', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          for (final m in const ['Cash', 'UPI', 'Card', 'Other']) ListTile(leading: const Icon(Icons.payments_outlined), title: Text(m), onTap: () => Navigator.pop(c, m)),
        ]),
      ),
    );
    if (method == null) return;
    widget.agentView
        ? _act('Collected ${money(o['total'])} (${o['number']})', {'action': 'collect', 'method': method}, {'paymentStatus': 'Paid', 'paymentMethod': method}, delivery: true)
        : _act('Paid ${o['number']}', {'action': 'update_payment', 'paymentStatus': 'Paid', 'method': method}, {'paymentStatus': 'Paid', 'paymentMethod': method});
  }

  Future<void> _print(AppState s, Map<String, dynamic> o) async {
    try {
      await reprintOrder(s.settings, o, s.settings['printerFormat'] as String? ?? 'thermal_80', payments: ((_extra?['payments'] as List?) ?? const []).cast<Map>());
    } catch (_) {
      if (mounted) toast(context, 'Printer not available.', error: true);
    }
  }

}
