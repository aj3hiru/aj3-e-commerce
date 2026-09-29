import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../ds/adaptive.dart' show popDialog;
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../features/orders/order_actions.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "All Orders" as on the website (admin/ecommerce/orders): date range, status tabs, number cards,
/// search + filters, tick boxes with the bulk bar (accept new ones / assign & send out), the orders
/// table (sortable, payment / status / agent right in the row, Accept / Reject for new ones),
/// items pop-up, summary line — and the website's Display Options. From the data on this computer.
class OrdersWeb extends StatefulWidget {
  const OrdersWeb({super.key});
  @override
  State<OrdersWeb> createState() => _OrdersWebState();
}

const _statuses = ['Pending', 'In Progress', 'Out for Delivery', 'Delivered', 'Canceled'];
const _dot = {'Pending': W.yellow, 'In Progress': Color(0xFF3B82F6), 'Out for Delivery': Color(0xFF0EA5E9), 'Delivered': W.green, 'Canceled': Color(0xFFEF4444)};
const _icon = {'Pending': LucideIcons.clock, 'In Progress': LucideIcons.package, 'Out for Delivery': LucideIcons.truck, 'Delivered': LucideIcons.circleCheck, 'Canceled': LucideIcons.ban};

class _OrdersWebState extends State<OrdersWeb> {
  static final _def = displayDefs['ecom_orders2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  int _navSeq = -1;
  DateRange _range = DateRange.preset('this_month');
  String _tab = 'all', _q = '', _pay = 'all', _method = 'all', _dues = 'all', _channel = 'online';
  int _product = 0, _agent = 0; // agent: 0 all, -1 not assigned
  int _page = 0, _per = 10; // 0 = all
  String _sort = 'created';
  bool _asc = false;
  final Set<int> _picked = {};
  int _bulkAgent = 0;
  bool _bulkBusy = false;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  void _sortBy(String k) => setState(() {
        if (_sort == k) {
          _asc = !_asc;
        } else {
          _sort = k;
          _asc = k == 'customer';
        }
      });

  bool get _filtersOn => _q.isNotEmpty || _pay != 'all' || _method != 'all' || _dues != 'all' || _product != 0 || _agent != 0;

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
    return ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));
  }

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final p = s.perms;
    final on = _prefs.on;
    bool d(String k) => on('or2-details', k);
    final one = _prefs.item;
    final agents = s.list('agents');
    final canAssign = p.assignDelivery && agents.isNotEmpty;
    final agentName = {for (final a in agents) toInt(a['id']): '${a['name']}'};
    final inRange = s.list('orders').where((o) => (_channel == 'all' || o['type'] == _channel) && (_range.key == 'all' || _range.contains(o['createdAt']))).toList();
    int count(String st) => st == 'all' ? inRange.length : inRange.where((o) => o['status'] == st).length;
    double sum(Iterable<Map> l) => l.fold(0, (t, o) => t + toDouble(o['total']));
    double due(Map o) => toDouble(o['due']) > 0.004 ? toDouble(o['due']) : (o['paymentStatus'] != 'Paid' && o['status'] != 'Canceled' ? toDouble(o['total']) : 0);
    List<Map> items(Map o) => ((o['items'] as List?) ?? const []).cast<Map>();
    final today = DateRange.preset('today');

    final words = _q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final list = inRange.where((o) {
      if (_tab != 'all' && o['status'] != _tab) return false;
      if (_pay == 'Paid' && o['paymentStatus'] != 'Paid') return false;
      if (_pay == 'Unpaid' && o['paymentStatus'] == 'Paid') return false;
      if (_method != 'all' && o['paymentMethod'] != _method) return false;
      if (_dues == 'with' && due(o) <= 0.004) return false;
      if (_dues == 'without' && due(o) > 0.004) return false;
      if (_agent == -1 && o['agentId'] != null) return false;
      if (_agent > 0 && toInt(o['agentId']) != _agent) return false;
      if (_product != 0 && !items(o).any((i) => toInt(i['productId']) == _product)) return false;
      if (words.isEmpty) return true;
      final hay = '${o['number']} ${o['customer']} ${o['phone'] ?? ''} ${o['email'] ?? ''} ${o['address'] ?? ''} ${items(o).map((i) => i['name']).join(' ')}'.toLowerCase();
      return words.every(hay.contains);
    }).toList();
    int cmp(Map a, Map b) => switch (_sort) {
          'total' => toDouble(a['total']).compareTo(toDouble(b['total'])),
          'customer' => '${a['customer']}'.toLowerCase().compareTo('${b['customer']}'.toLowerCase()),
          'status' => '${a['status']}'.compareTo('${b['status']}'),
          _ => '${a['createdAt']}'.compareTo('${b['createdAt']}'),
        };
    list.sort((a, b) => _asc ? cmp(a, b) : cmp(b, a));
    final shown = _per == 0 ? list : WebPager.slice(list, _page, _per);
    final methods = {for (final o in s.list('orders')) if (o['paymentMethod'] != null && '${o['paymentMethod']}'.isNotEmpty) '${o['paymentMethod']}'}.toList()..sort();
    // Products that were ordered in this range, with how many orders have them (as on the website).
    final productCounts = <int, (String, int)>{};
    for (final o in inRange) {
      for (final i in items(o).map((i) => toInt(i['productId'])).toSet()) {
        final name = items(o).firstWhere((x) => toInt(x['productId']) == i)['name'];
        productCounts[i] = ('${productCounts[i]?.$1 ?? name}', (productCounts[i]?.$2 ?? 0) + 1);
      }
    }
    final unpaid = inRange.where((o) => o['paymentStatus'] != 'Paid' && o['status'] != 'Canceled');
    _picked.removeWhere((id) => !list.any((o) => toInt(o['id']) == id));

    Future<void> bulk(String kind) async {
      final chosen = list.where((o) => _picked.contains(toInt(o['id']))).toList();
      if (chosen.isEmpty) return;
      setState(() => _bulkBusy = true);
      var n = 0;
      for (final o in chosen) {
        if (kind == 'accept') {
          if (o['status'] != 'Pending') continue;
          await s.enqueue(OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/orders/${o['id']}/status', body: {'action': 'update_status', 'orderStatus': 'In Progress'}, label: 'Accept ${o['number']}',
              effect: {'kind': 'order', 'id': o['id'], 'fields': {'status': 'In Progress'}}, refresh: const ['orders', 'deliveries']));
          n++;
        } else if (_bulkAgent > 0 && !['Delivered', 'Canceled'].contains(o['status'])) {
          await s.enqueue(OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/orders/${o['id']}/status', body: {'action': 'assign', 'agentId': _bulkAgent}, label: 'Assign ${o['number']} to ${agentName[_bulkAgent]}',
              effect: {'kind': 'order', 'id': o['id'], 'fields': {'agentId': _bulkAgent, 'status': 'Out for Delivery', 'assignedAt': DateTime.now().toUtc().toIso8601String()}}, refresh: const ['orders', 'deliveries']));
          n++;
        }
      }
      if (!context.mounted) return;
      setState(() {
        _bulkBusy = false;
        _picked.clear();
      });
      toast(context, kind == 'accept' ? '$n order${n == 1 ? '' : 's'} accepted.' : '$n order${n == 1 ? '' : 's'} sent out with ${agentName[_bulkAgent] ?? 'the agent'}.');
    }

    void itemsDialog(Map<String, dynamic> o) => showDDialog<void>(
          context,
          title: '${o['number']} — ${o['customer']}',
          width: 520,
          actions: [DAction('Open full order', primary: true, onPressed: () async {
            popDialog(context);
            _open(o);
          })],
          builder: (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 22, runSpacing: 4, children: [
              Text.rich(TextSpan(text: 'Placed: ', style: const TextStyle(fontSize: 13, color: W.g700), children: [TextSpan(text: dateTime(o['createdAt']), style: const TextStyle(fontWeight: FontWeight.w700, color: W.g900))])),
              Text.rich(TextSpan(text: 'Total: ', style: const TextStyle(fontSize: 13, color: W.g700), children: [TextSpan(text: money(o['total']), style: const TextStyle(fontWeight: FontWeight.w700, color: W.g900))])),
              Text.rich(TextSpan(text: 'Paid: ', style: const TextStyle(fontSize: 13, color: W.g700), children: [TextSpan(text: money(toDouble(o['total']) - due(o)), style: const TextStyle(fontWeight: FontWeight.w700, color: W.green))])),
              if (due(o) > 0.004) Text.rich(TextSpan(text: 'Due: ', style: const TextStyle(fontSize: 13, color: W.g700), children: [TextSpan(text: money(due(o)), style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFDC3545)))])),
            ]),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
              child: Column(children: [
                for (final (n, i) in items(o).indexed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(border: n == 0 ? null : const Border(top: BorderSide(color: W.g100))),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${i['name']}', style: const TextStyle(fontSize: 13.5, color: W.g900)),
                          Text('${i['qty']} × ${money(i['price'])}', style: const TextStyle(fontSize: 12, color: W.g500)),
                        ]),
                      ),
                      Text(money(toDouble(i['qty']) * toDouble(i['price'])), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: W.g900)),
                    ]),
                  ),
              ]),
            ),
            if ('${o['address'] ?? ''}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Ships to: ${o['address']}', style: const TextStyle(fontSize: 12, color: W.g500, height: 1.5))),
          ]),
        );

    // ── table ──
    final compact = d('or2-d-compact');
    final pageIds = [for (final o in shown) if (toInt(o['id']) > 0) toInt(o['id'])];
    final cols = <(WebCol, Widget Function(Map<String, dynamic>))>[
      if (on('or2-table', 'or2-c-select') && p.seesOrders)
        (
          WebCol('', width: 44, head: Checkbox(value: pageIds.isNotEmpty && pageIds.every(_picked.contains), onChanged: (v) => setState(() => v == true ? _picked.addAll(pageIds) : _picked.removeAll(pageIds)))),
          (o) => toInt(o['id']) < 0 ? const SizedBox() : Checkbox(value: _picked.contains(toInt(o['id'])), onChanged: (v) => setState(() => v == true ? _picked.add(toInt(o['id'])) : _picked.remove(toInt(o['id'])))),
        ),
      if (on('or2-table', 'or2-c-order'))
        (
          WebCol('Order', flex: 1.3, onSort: () => _sortBy('created'), sorted: _sort == 'created' ? _asc : null),
          (o) => Cell2(o['localRef'] != null ? 'Uploading…' : '${o['number']}', b: d('or2-d-date') ? dateTime(o['createdAt']) : null, aColor: W.blue, onTap: () => _open(o)),
        ),
      if (on('or2-table', 'or2-c-customer'))
        (
          WebCol('Customer', flex: 1.4, onSort: () => _sortBy('customer'), sorted: _sort == 'customer' ? _asc : null),
          (o) {
            final phone = o['phone'] as String?;
            return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.g900)),
              if (d('or2-d-phone')) Text(phone ?? '${o['email'] ?? 'No contact'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500)),
              if (on('or2-table', 'or2-c-contact') && (phone != null || o['lat'] != null))
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(children: [
                    if (phone != null) _mini(LucideIcons.phone, W.g600, W.g100, 'Call', () => launchUrl(Uri.parse('tel:$phone'))),
                    if (phone != null) _mini(LucideIcons.messageCircle, W.green, const Color(0xFFECFDF5), 'WhatsApp', () => launchUrl(Uri.parse('https://wa.me/91${phone.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '')}'), mode: LaunchMode.externalApplication)),
                    if (o['lat'] != null)
                      _mini(LucideIcons.mapPin, const Color(0xFF0284C7), const Color(0xFFF0F9FF), 'Delivery location', () => launchUrl(Uri.parse('https://www.google.com/maps?q=${o['lat']},${o['lng']}'), mode: LaunchMode.externalApplication)),
                  ]),
                ),
            ]);
          },
        ),
      if (on('or2-table', 'or2-c-items'))
        (
          const WebCol('Items', flex: .9),
          (o) => Cell2('${items(o).length} item${items(o).length == 1 ? '' : 's'}', b: d('or2-d-itemname') && items(o).isNotEmpty ? '${items(o).first['name']}' : null, onTap: () => itemsDialog(o)),
        ),
      if (on('or2-table', 'or2-c-total'))
        (
          WebCol('Total', flex: 1, onSort: () => _sortBy('total'), sorted: _sort == 'total' ? _asc : null),
          (o) => Cell2(money(o['total']), b: d('or2-d-due') && due(o) > 0.004 ? '${money(due(o))} due' : null, bColor: const Color(0xFFDC3545), bold: true),
        ),
      if (on('or2-table', 'or2-c-payment'))
        (
          const WebCol('Payment', flex: 1.2),
          (o) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                WebPillMenu(
                  value: o['paymentStatus'] == 'Paid' ? 'Paid' : 'Unpaid',
                  options: const ['Paid', 'Unpaid'],
                  color: o['paymentStatus'] == 'Paid' ? W.green : W.grey,
                  onSelected: o['paymentStatus'] != 'Paid' && o['status'] != 'Canceled' && p.markPaid && o['localRef'] == null ? (_) => markOrderPaid(context, o) : null,
                ),
                if (d('or2-d-method')) Padding(padding: const EdgeInsets.only(top: 3), child: Text(_methodLabel('${o['paymentMethod'] ?? ''}'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500))),
              ]),
        ),
      if (on('or2-table', 'or2-c-status'))
        (
          WebCol('Status', flex: 1.4, onSort: () => _sortBy('status'), sorted: _sort == 'status' ? _asc : null),
          (o) {
            final st = '${o['status']}';
            return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
              WebPillMenu(value: st, options: statusChoices(p, o), color: _dot[st], onSelected: o['localRef'] != null ? null : (v) => setOrderStatus(context, o, v)),
              if (o['agentId'] != null && d('or2-d-agentline'))
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Row(children: [
                    const Icon(LucideIcons.bike, size: 13, color: Color(0xFFD97706)),
                    const SizedBox(width: 4),
                    Flexible(child: Text(agentName[toInt(o['agentId'])] ?? 'Agent', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500))),
                  ]),
                ),
              if (st == 'Pending' && d('or2-d-decide') && p.seesOrders && o['type'] == 'online')
                Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: Row(children: [
                    _decide('Accept', W.green, () => acceptOrder(context, o)),
                    const SizedBox(width: 6),
                    _decide('Reject', const Color(0xFFDC2626), () => rejectOrder(context, o), outline: true),
                  ]),
                ),
            ]);
          },
        ),
      if (on('or2-table', 'or2-c-agent') && canAssign)
        (
          const WebCol('Delivery agent', flex: 1.2),
          (o) => ['Delivered', 'Canceled'].contains(o['status']) || o['type'] != 'online'
              ? Text(agentName[toInt(o['agentId'])] ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g600))
              : WebSelect<int>(
                  value: toInt(o['agentId']),
                  options: [(0, o['agentId'] == null ? 'Assign agent…' : 'Remove agent'), for (final a in agents) (toInt(a['id']), '${a['name']}')],
                  onChanged: (id) {
                    if (id == toInt(o['agentId'])) return;
                    if (id == 0) {
                      orderAction(context, o, '${o['number']}: agent removed', {'action': 'assign', 'agentId': null}, {'agentId': null, if (o['status'] == 'Out for Delivery') 'status': 'In Progress'});
                    } else {
                      assignOrder(context, o, agents.firstWhere((a) => toInt(a['id']) == id));
                    }
                  },
                ),
        ),
      if (on('or2-table', 'or2-c-actions'))
        (
          const WebCol('Actions', width: 100),
          (o) => Row(children: [
                WebIconAction(LucideIcons.eye, color: const Color(0xFF0EA5E9), tooltip: 'View order ${o['number']}', onTap: () => _open(o)),
                if (p.seesPos || p.seesOrders) WebIconAction(LucideIcons.printer, color: W.grey, tooltip: 'Invoice for ${o['number']}', onTap: () => printOrder(context, o)),
              ]),
        ),
    ];

    Widget card(IconData icon, Color c, String value, String label, String sub, {String? tab}) => WebMiniMetric(
          icon: icon, color: c, value: value, label: label, sub: sub, tinted: tab == null, onTap: tab == null ? null : () => _set(() => _tab = tab),
        );
    final cards = [
      if (on('or2-cards', 'or2-k-total')) card(LucideIcons.shoppingBag, W.blue, '${count(_tab)}', _tab == 'all' ? 'All Orders' : '$_tab Orders', '${money(sum(_tab == 'all' ? inRange : inRange.where((o) => o['status'] == _tab)))} in this range'),
      if (on('or2-cards', 'or2-k-today')) card(LucideIcons.clock, W.primary, '${inRange.where((o) => today.contains(o['createdAt'])).length}', "Today's Orders", money(sum(inRange.where((o) => today.contains(o['createdAt']))))),
      if (on('or2-cards', 'or2-k-unpaid')) card(LucideIcons.wallet, const Color(0xFFEF4444), '${unpaid.length}', 'Unpaid', '${money(unpaid.fold<double>(0, (t, o) => t + due(o)))} not collected'),
      if (on('or2-cards', 'or2-k-value'))
        card(LucideIcons.indianRupee, const Color(0xFF16A34A), money(sum(inRange)), 'Order Value', _range.key == 'all' ? 'All time' : '${dateShort(_range.from.toIso8601String())} – ${dateShort(_range.to.toIso8601String())}'),
      for (final st in _statuses.take(4))
        if (on('or2-cards', 'or2-k-${st.toLowerCase().replaceAll(' ', '-')}')) card(_icon[st]!, W.g700, '${count(st)}', st, money(sum(inRange.where((o) => o['status'] == st))), tab: st),
    ];

    final filters = on('or2-filters') ? [
      if (on('or2-filters', 'or2-f-payment')) WebSelect<String>(width: 170, icon: LucideIcons.wallet, value: _pay, options: const [('all', 'Paid and unpaid'), ('Paid', 'Paid'), ('Unpaid', 'Unpaid')], onChanged: (v) => _set(() => _pay = v)),
      if (on('or2-filters', 'or2-f-method')) WebSelect<String>(width: 170, icon: LucideIcons.indianRupee, value: _method, options: [('all', 'All methods'), for (final m in methods) (m, _methodLabel(m))], onChanged: (v) => _set(() => _method = v)),
      if (on('or2-filters', 'or2-f-product'))
        WebSelect<int>(width: 210, icon: LucideIcons.package, value: _product, options: [(0, 'All products'), for (final e in productCounts.entries) (e.key, '${e.value.$1} (${e.value.$2})')], onChanged: (v) => _set(() => _product = v)),
      if (on('or2-filters', 'or2-f-agent') && canAssign)
        WebSelect<int>(width: 160, icon: LucideIcons.truck, value: _agent, options: [(0, 'All agents'), (-1, 'Not assigned'), for (final a in agents) (toInt(a['id']), '${a['name']}')], onChanged: (v) => _set(() => _agent = v)),
      if (on('or2-filters', 'or2-f-dues')) WebSelect<String>(width: 170, icon: LucideIcons.wallet, value: _dues, options: const [('all', 'All orders'), ('with', 'Money still owed'), ('without', 'Nothing owed')], onChanged: (v) => _set(() => _dues = v)),
    ] : <Widget>[];

    return WebPage(
      title: _channel == 'offline' ? 'In-store Bills' : 'All Orders',
      subtitle: _channel == 'offline' ? 'Bills made at the counter, with their payment' : 'Online orders from the shop, with their status and payment',
      onRefresh: () => s.syncNow(only: const ['orders']),
      actions: [
        WebSelect<String>(width: 160, icon: LucideIcons.store, value: _channel, options: const [('online', 'Online orders'), ('offline', 'In-store bills'), ('all', 'All orders')], onChanged: (v) => _set(() => _channel = v)),
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: list.isEmpty
            ? () => toast(context, 'There are no orders to export.', error: true)
            : () => exportTable(context, 'Orders', const ['Order', 'Date', 'Customer', 'Phone', 'Email', 'Items', 'Total', 'Paid', 'Due', 'Payment', 'Method', 'Status', 'Address', 'Products'], [
                  for (final o in list)
                    [o['number'], dateTime(o['createdAt']), o['customer'], o['phone'], o['email'], items(o).length, toDouble(o['total']), toDouble(o['total']) - due(o), due(o), o['paymentStatus'], o['paymentMethod'], o['status'], o['address'],
                      items(o).map((i) => '${i['name']} x${i['qty']}').join(' | ')],
                ])),
      ],
      children: [
        if (one('or2-range') || one('or2-tabs')) ...[
          WebCard(
            padding: EdgeInsets.zero,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (one('or2-range')) WebRangeBar(range: _range, greyPresets: true, flat: true, onChanged: (r) => _set(() => _range = r)),
              if (one('or2-tabs'))
                Container(
                  decoration: one('or2-range') ? const BoxDecoration(border: Border(top: BorderSide(color: W.g100))) : null,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: WebTabs(
                    tabs: [('all', 'All', null), for (final st in _statuses) (st, st, _dot[st])],
                    selected: _tab,
                    counts: {'all': count('all'), for (final st in _statuses) st: count(st)},
                    onSelect: (k) => _set(() => _tab = k),
                  ),
                ),
            ]),
          ),
          const SizedBox(height: 12),
        ],
        if (cards.isNotEmpty) ...[WebGrid(gap: 12, minWidth: 220, children: cards), const SizedBox(height: 12)],
        if (on('or2-table'))
          WebCard(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    if (on('or2-table', 'or2-t-search')) WebSearch(width: 300, hint: 'Search order, name, phone, product…', onChanged: (v) => _set(() => _q = v)),
                    ...filters,
                    if (_filtersOn)
                      TextButton.icon(
                        onPressed: () => _set(() {
                          _q = '';
                          _pay = _method = _dues = 'all';
                          _product = _agent = 0;
                        }),
                        icon: const Icon(LucideIcons.x, size: 14),
                        label: const Text('Clear'),
                      ),
                  ]),
                ),
                if (on('or2-table', 'or2-t-pagesize'))
                  SizedBox(width: 118, child: WebSelect<int>(value: _per, options: const [(10, '10 / page'), (25, '25 / page'), (50, '50 / page'), (100, '100 / page'), (0, 'All')], onChanged: (v) => _set(() => _per = v))),
              ]),
              const SizedBox(height: 12),
              if (_picked.isNotEmpty && one('or2-bulk'))
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: const Color(0xFFEFF6FF), border: Border.all(color: const Color(0xFFBFDBFE)), borderRadius: BorderRadius.circular(10)),
                  child: Row(children: [
                    Text('${_picked.length} selected', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF1E40AF))),
                    const SizedBox(width: 12),
                    WebButton('Accept new ones', icon: LucideIcons.circleCheck, color: W.green, loading: _bulkBusy, onPressed: _bulkBusy ? null : () => bulk('accept')),
                    if (canAssign) ...[
                      const SizedBox(width: 10),
                      SizedBox(width: 180, child: WebSelect<int>(value: _bulkAgent, options: [(0, 'Choose agent…'), for (final a in agents) (toInt(a['id']), '${a['name']}')], onChanged: (v) => setState(() => _bulkAgent = v))),
                      const SizedBox(width: 6),
                      WebButton('Assign & send out', icon: LucideIcons.truck, color: const Color(0xFF2563EB), onPressed: _bulkBusy || _bulkAgent == 0 ? null : () => bulk('assign')),
                    ],
                    const Spacer(),
                    TextButton(onPressed: () => setState(_picked.clear), child: const Text('Clear')),
                  ]),
                ),
              WebTable(
                cols: [for (final c in cols) c.$1],
                rows: [for (final o in shown) [for (final c in cols) c.$2(o)]],
                rowHeight: compact ? 60 : 76,
                onRowTap: [for (final o in shown) () => _open(o)],
                highlight: d('or2-d-highlight') ? [for (final o in shown) o['status'] == 'Pending' ? const Color(0xFFF6C23E) : null] : null,
                empty: Center(child: Text(inRange.isEmpty ? 'No ${_tab == 'all' ? '' : '${_tab.toLowerCase()} '}orders in these dates.' : 'No orders match these filters.', style: const TextStyle(color: W.g500))),
              ),
              if (one('or2-summary') || one('or2-pager'))
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(children: [
                    if (one('or2-summary'))
                      Expanded(
                        child: Text.rich(TextSpan(style: const TextStyle(fontSize: 13, color: W.g600), children: [
                          TextSpan(text: list.isEmpty ? 'No orders' : '${_per == 0 ? 1 : _page * _per + 1}–${_per == 0 ? list.length : (_page * _per + shown.length)} of ${list.length} orders'),
                          if (list.length != inRange.where((o) => _tab == 'all' || o['status'] == _tab).length)
                            TextSpan(text: ' (filtered from ${inRange.where((o) => _tab == 'all' || o['status'] == _tab).length})', style: const TextStyle(color: W.g400)),
                          if (list.isNotEmpty) const TextSpan(text: '  ·  Value '),
                          if (list.isNotEmpty) TextSpan(text: money(sum(list)), style: const TextStyle(fontWeight: FontWeight.w700, color: W.g900)),
                        ])),
                      )
                    else
                      const Spacer(),
                    if (one('or2-pager') && _per > 0 && list.length > _per) _Pages(page: _page, count: (list.length / _per).ceil(), onPage: (v) => setState(() => _page = v)),
                  ]),
                ),
            ]),
          ),
      ],
    );
  }

  void _open(Map<String, dynamic> o) {
    if (o['localRef'] != null) return toast(context, 'This bill is still uploading — open it in a moment.');
    Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))));
  }

  static String _methodLabel(String m) => switch (m) {
        'COD' => 'Cash On Delivery',
        '' => '—',
        _ => m,
      };

  Widget _mini(IconData icon, Color fg, Color bg, String tip, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 4),
        child: Tooltip(
          message: tip,
          child: Material(
            color: bg,
            borderRadius: BorderRadius.circular(6),
            child: InkWell(borderRadius: BorderRadius.circular(6), onTap: onTap, child: SizedBox(width: 24, height: 24, child: Icon(icon, size: 12, color: fg))),
          ),
        ),
      );

  Widget _decide(String label, Color c, VoidCallback onTap, {bool outline = false}) => Material(
        color: outline ? Colors.white : c,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6), side: BorderSide(color: c)),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(6),
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3), child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: outline ? c : Colors.white))),
        ),
      );
}

/// Page numbers: ‹ 1 2 3 … ›
class _Pages extends StatelessWidget {
  final int page, count;
  final ValueChanged<int> onPage;
  const _Pages({required this.page, required this.count, required this.onPage});
  @override
  Widget build(BuildContext context) {
    final nums = <int>{0, count - 1, page - 1, page, page + 1}.where((n) => n >= 0 && n < count).toList()..sort();
    Widget b(String t, int? to, {bool on = false}) => Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Material(
            color: on ? const Color(0xFF2563EB) : Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6), side: BorderSide(color: on ? const Color(0xFF2563EB) : W.g200)),
            child: InkWell(
              onTap: to == null ? null : () => onPage(to),
              borderRadius: BorderRadius.circular(6),
              child: SizedBox(width: 32, height: 30, child: Center(child: Text(t, style: TextStyle(fontSize: 13, color: on ? Colors.white : to == null ? W.g400 : W.g700)))),
            ),
          ),
        );
    return Row(mainAxisSize: MainAxisSize.min, children: [
      b('‹', page > 0 ? page - 1 : null),
      for (final (i, n) in nums.indexed) ...[
        if (i > 0 && n - nums[i - 1] > 1) b('…', null),
        b('${n + 1}', n, on: n == page),
      ],
      b('›', page + 1 < count ? page + 1 : null),
    ]);
  }
}
