import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../features/orders/order_actions.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/web.dart';

/// "All Orders" exactly as on the website: date range, status tabs, number cards,
/// filters and the orders table with payment / status / agent right in the row.
class OrdersWeb extends StatefulWidget {
  const OrdersWeb({super.key});
  @override
  State<OrdersWeb> createState() => _OrdersWebState();
}

const _tabs = [
  ('all', 'All', null),
  ('Pending', 'Pending', W.yellow),
  ('In Progress', 'In Progress', Color(0xFF3B82F6)),
  ('Out for Delivery', 'Out for Delivery', Color(0xFF3B82F6)),
  ('Delivered', 'Delivered', W.green),
  ('Canceled', 'Canceled', Color(0xFFEF4444)),
];

class _OrdersWebState extends State<OrdersWeb> {
  int _navSeq = -1;
  DateRange _range = DateRange.preset('this_month');
  String _tab = 'all';
  String _q = '';
  String _pay = 'all';
  String _method = 'all';
  int _product = 0;
  int _agent = 0; // 0 all, -1 none
  String _channel = 'online';
  int _page = 0, _per = 10;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    if (nav.seq != _navSeq) {
      _navSeq = nav.seq;
      final a = nav.take('orders');
      if (a['tab'] is String) {
        _tab = a['tab'];
        _channel = 'online';
        // Open orders can be older than this month — show them all.
        if (_tab != 'Delivered' && _tab != 'Canceled' && _tab != 'all') _range = DateRange.preset('all');
      }
    }
    final s = context.watch<AppState>();
    final p = s.perms;
    final agents = s.list('agents');
    final agentName = {for (final a in agents) toInt(a['id']): '${a['name']}'};
    final inRange = s.list('orders').where((o) => (_channel == 'all' || o['type'] == _channel) && (_range.key == 'all' || _range.contains(o['createdAt']))).toList();
    int count(String st) => st == 'all' ? inRange.length : inRange.where((o) => o['status'] == st).length;
    double sum(Iterable<Map> l) => l.fold(0, (t, o) => t + toDouble(o['total']));
    final today = DateRange.preset('today');

    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = inRange.where((o) {
      if (_tab != 'all' && o['status'] != _tab) return false;
      if (_pay == 'paid' && o['paymentStatus'] != 'Paid') return false;
      if (_pay == 'unpaid' && o['paymentStatus'] == 'Paid') return false;
      if (_method != 'all' && o['paymentMethod'] != _method) return false;
      if (_agent == -1 && o['agentId'] != null) return false;
      if (_agent > 0 && toInt(o['agentId']) != _agent) return false;
      final items = ((o['items'] as List?) ?? const []).cast<Map>();
      if (_product != 0 && !items.any((i) => toInt(i['productId']) == _product)) return false;
      if (words.isEmpty) return true;
      final hay = '${o['number']} ${o['customer']} ${o['phone'] ?? ''} ${items.map((i) => i['name']).join(' ')}'.toLowerCase();
      return words.every(hay.contains);
    }).toList();
    final shown = WebPager.slice(list, _page, _per);
    final methods = {for (final o in s.list('orders')) if (o['paymentMethod'] != null) '${o['paymentMethod']}'}.toList()..sort();
    final unpaid = inRange.where((o) => o['paymentStatus'] != 'Paid' && o['status'] != 'Canceled');

    Widget metric(IconData icon, Color c, int n, String label, String sub, {String? tab}) =>
        WebMiniMetric(icon: icon, color: c, value: '$n', label: label, sub: sub, tinted: tab == null, onTap: tab == null ? null : () => _set(() => _tab = tab));

    final rows = <List<Widget>>[];
    for (final o in shown) {
      final items = ((o['items'] as List?) ?? const []).cast<Map>();
      final phone = o['phone'] as String?;
      final online = o['type'] == 'online';
      final st = '${o['status']}';
      final canAssign = online && p.assignDelivery && (st == 'In Progress' || st == 'Out for Delivery');
      rows.add([
        Cell2('${o['number']}', b: dateTime(o['createdAt']), aColor: W.blue, onTap: () => _open(o)),
        Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: W.g900)),
          if (phone != null) Text(phone, style: const TextStyle(fontSize: 13, color: W.g500)),
          if (phone != null || o['address'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(children: [
                if (phone != null) _mini(LucideIcons.phone, W.g500, () => launchUrl(Uri.parse('tel:$phone'))),
                if (phone != null) _mini(LucideIcons.messageCircle, W.green, () => launchUrl(Uri.parse('https://wa.me/91${phone.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '')}'), mode: LaunchMode.externalApplication)),
                if (o['address'] != null || o['lat'] != null)
                  _mini(LucideIcons.mapPin, W.blue, () {
                    final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address']}');
                    launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest'), mode: LaunchMode.externalApplication);
                  }),
              ]),
            ),
        ]),
        Cell2('${items.length} item${items.length == 1 ? '' : 's'}', b: items.isEmpty ? null : '${items.first['name']}'),
        Cell2(money(o['total']), b: toDouble(o['due']) > 0 ? '${money(o['due'])} due' : (o['paymentStatus'] != 'Paid' && st != 'Canceled' ? '${money(o['total'])} due' : null), bColor: const Color(0xFFDC2626), bold: true),
        Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
          WebPillMenu(
            value: o['paymentStatus'] == 'Paid' ? 'Paid' : 'Unpaid',
            options: const ['Unpaid', 'Paid'],
            onSelected: o['paymentStatus'] != 'Paid' && st != 'Canceled' && p.markPaid && online ? (_) => markOrderPaid(context, o) : null,
          ),
          const SizedBox(height: 4),
          Text(_methodLabel('${o['paymentMethod'] ?? ''}'), style: const TextStyle(fontSize: 13, color: W.g500)),
        ]),
        Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
          WebPillMenu(value: st, options: statusChoices(p, o), onSelected: (v) => setOrderStatus(context, o, v)),
          if (o['agentId'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(children: [const Icon(LucideIcons.bike, size: 13, color: Color(0xFFD97706)), const SizedBox(width: 5), Text(agentName[toInt(o['agentId'])] ?? 'Agent', style: const TextStyle(fontSize: 13, color: W.g600))]),
            ),
        ]),
        canAssign
            ? WebSelect<int>(
                value: toInt(o['agentId']),
                options: [if (o['agentId'] == null) (0, 'Assign…'), for (final a in agents) (toInt(a['id']), '${a['name']}')],
                onChanged: (id) {
                  if (id != 0 && id != toInt(o['agentId'])) assignOrder(context, o, agents.firstWhere((a) => toInt(a['id']) == id));
                },
              )
            : (o['agentId'] != null ? Text(agentName[toInt(o['agentId'])] ?? '—', style: const TextStyle(fontSize: 15, color: W.g800)) : webDash),
        Row(children: [
          WebIconAction(LucideIcons.eye, color: W.grey, tooltip: 'View', onTap: () => _open(o)),
          WebIconAction(LucideIcons.printer, color: W.grey, tooltip: 'Print bill', onTap: () => printOrder(context, o)),
        ]),
      ]);
    }

    return WebPage(
      title: _channel == 'offline' ? 'In-store Bills' : 'All Orders',
      subtitle: _channel == 'offline' ? 'Bills made at the counter, with their payment' : 'Online orders from the shop, with their status and payment',
      onRefresh: () => s.syncNow(only: const ['orders']),
      actions: [
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Orders', const ['Order', 'Date', 'Customer', 'Mobile', 'Items', 'Total', 'Due', 'Payment', 'Method', 'Status', 'Agent'], [
              for (final o in list)
                [o['number'], dateTime(o['createdAt']), o['customer'], o['phone'], ((o['items'] as List?) ?? const []).length, toDouble(o['total']), toDouble(o['due']), o['paymentStatus'], o['paymentMethod'], o['status'], agentName[toInt(o['agentId'])]],
            ])),
      ],
      children: [
        WebCard(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            WebRangeBar(range: _range, greyPresets: true, flat: true, onChanged: (r) => _set(() => _range = r)),
            Container(
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g100))),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: WebTabs(tabs: _tabs, selected: _tab, counts: {for (final t in _tabs) t.$1: count(t.$1)}, onSelect: (k) => _set(() => _tab = k)),
            ),
          ]),
        ),
        const SizedBox(height: 20),
        WebGrid(gap: 12, minWidth: 220, children: [
          metric(LucideIcons.shoppingBag, W.blue, inRange.length, 'All Orders', '${money(sum(inRange))} in this range'),
          metric(LucideIcons.clock, W.primary, inRange.where((o) => today.contains(o['createdAt'])).length, "Today's Orders", money(sum(inRange.where((o) => today.contains(o['createdAt']))))),
          metric(LucideIcons.wallet, const Color(0xFFEF4444), unpaid.length, 'Unpaid', '${money(unpaid.fold<double>(0, (t, o) => t + (toDouble(o['due']) > 0 ? toDouble(o['due']) : toDouble(o['total']))))} not collected'),
          WebMiniMetric(icon: LucideIcons.indianRupee, color: const Color(0xFF16A34A), value: money(sum(inRange.where((o) => o['status'] != 'Canceled'))), label: 'Order Value', sub: _range.key == 'all' ? 'All time' : '${dateShort(_range.from.toIso8601String())} – ${dateShort(_range.to.toIso8601String())}'),
          metric(LucideIcons.clock, W.g700, count('Pending'), 'Pending', money(sum(inRange.where((o) => o['status'] == 'Pending'))), tab: 'Pending'),
          metric(LucideIcons.package, W.g700, count('In Progress'), 'In Progress', money(sum(inRange.where((o) => o['status'] == 'In Progress'))), tab: 'In Progress'),
          metric(LucideIcons.truck, W.g700, count('Out for Delivery'), 'Out for Delivery', money(sum(inRange.where((o) => o['status'] == 'Out for Delivery'))), tab: 'Out for Delivery'),
          metric(LucideIcons.circleCheck, W.g700, count('Delivered'), 'Delivered', money(sum(inRange.where((o) => o['status'] == 'Delivered'))), tab: 'Delivered'),
        ]),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 10, runSpacing: 10, children: [
              WebSearch(width: 320, hint: 'Search order, name, phone, product...', onChanged: (v) => _set(() => _q = v)),
              WebSelect<String>(width: 170, icon: LucideIcons.wallet, value: _pay, options: const [('all', 'Paid and unpaid'), ('paid', 'Paid only'), ('unpaid', 'Unpaid only')], onChanged: (v) => _set(() => _pay = v)),
              WebSelect<String>(width: 175, icon: LucideIcons.indianRupee, value: _method, options: [('all', 'All methods'), for (final m in methods) (m, _methodLabel(m))], onChanged: (v) => _set(() => _method = v)),
              WebSelect<int>(width: 200, icon: LucideIcons.package, value: _product, options: [(0, 'All products'), for (final x in s.list('products')) (toInt(x['id']), '${x['name']}')], onChanged: (v) => _set(() => _product = v)),
              WebSelect<int>(width: 150, icon: LucideIcons.truck, value: _agent, options: [(0, 'All agents'), (-1, 'No agent'), for (final a in agents) (toInt(a['id']), '${a['name']}')], onChanged: (v) => _set(() => _agent = v)),
              WebSelect<String>(width: 170, icon: LucideIcons.wallet, value: _channel, options: const [('online', 'Online orders'), ('offline', 'In-store bills'), ('all', 'All orders')], onChanged: (v) => _set(() => _channel = v)),
            ]),
            const SizedBox(height: 16),
            WebTable(
              cols: const [
                WebCol('Order', flex: 1.3),
                WebCol('Customer', flex: 1.3),
                WebCol('Items', flex: .9),
                WebCol('Total', flex: 1),
                WebCol('Payment', flex: 1.25),
                WebCol('Status', flex: 1.35),
                WebCol('Delivery agent', flex: 1.2),
                WebCol('Actions', width: 110),
              ],
              rows: rows,
              rowHeight: 76,
              empty: const Center(child: Text('No orders match these filters.', style: TextStyle(color: W.g500))),
            ),
            WebPager(
              total: list.length,
              page: _page,
              perPage: _per,
              onPage: (v) => setState(() => _page = v),
              onPerPage: (v) => _set(() => _per = v),
              extra: '  ·  Value ${money(sum(list))}',
            ),
          ]),
        ),
      ],
    );
  }

  void _open(Map<String, dynamic> o) {
    if (o['localRef'] != null) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))));
  }

  static String _methodLabel(String m) => switch (m) {
        'COD' => 'Cash On Delivery',
        '' => '—',
        _ => m,
      };

  Widget _mini(IconData icon, Color c, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 5),
        child: Material(
          color: W.g100,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(borderRadius: BorderRadius.circular(6), onTap: onTap, child: SizedBox(width: 24, height: 24, child: Icon(icon, size: 13, color: c))),
        ),
      );
}
