import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/display_options.dart';
import '../features/orders/order_actions.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/web.dart';

/// "Deliveries Board" as on the website: Live now (numbers, on the road now, waiting for an agent,
/// one card per agent — with Display Options), History (every delivery: delivered, failed attempts,
/// cancelled) and Agent report (per agent, any dates). History / report use the last 90 days kept on
/// this computer, so all three tabs work offline.
class BoardWeb extends StatefulWidget {
  const BoardWeb({super.key});
  @override
  State<BoardWeb> createState() => _BoardWebState();
}

class _BoardWebState extends State<BoardWeb> {
  static final _def = displayDefs['ecom_deliveries_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _tab = 'live';
  // History / report filters.
  String _preset = 'today';
  DateTime _from = _day(DateTime.now()), _to = _day(DateTime.now());
  int _agent = 0;
  String _status = 'all', _q = '';

  static DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

  void _range(String k) {
    final now = _day(DateTime.now());
    final r = switch (k) {
      'today' => (now, now),
      'yesterday' => (now.subtract(const Duration(days: 1)), now.subtract(const Duration(days: 1))),
      'week' => (now.subtract(Duration(days: now.weekday % 7)), now),
      '7d' => (now.subtract(const Duration(days: 6)), now),
      'month' => (DateTime(now.year, now.month), now),
      '30d' => (now.subtract(const Duration(days: 29)), now),
      _ => (_from, _to),
    };
    setState(() {
      _preset = k;
      _from = r.$1;
      _to = r.$2;
    });
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final tabs = Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        for (final (k, label, icon) in const [('live', 'Live now', LucideIcons.radio), ('history', 'History', LucideIcons.history), ('report', 'Agent report', LucideIcons.chartColumn)])
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Material(
              color: _tab == k ? W.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              child: InkWell(
                onTap: () => setState(() => _tab = k),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(children: [
                    Icon(icon, size: 16, color: _tab == k ? Colors.white : W.g600),
                    const SizedBox(width: 8),
                    Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: _tab == k ? Colors.white : W.g600)),
                  ]),
                ),
              ),
            ),
          ),
      ]),
    );
    return WebPage(
      title: 'Deliveries Board',
      subtitle: _tab == 'live'
          ? 'Who is carrying which order right now — assign new ones, follow every delivery'
          : _tab == 'report'
              ? 'How many deliveries each agent made — today, this week, this month or any dates'
              : 'Every delivery: delivered, failed attempts and cancelled',
      onRefresh: () async {
        await s.syncNow(only: const ['orders', 'agents']);
        await s.reloadPage('deliveries');
      },
      actions: [if (_tab == 'live') DisplayOptionsButton(_def)],
      children: [
        tabs,
        const SizedBox(height: 16),
        ...(_tab == 'live' ? _live(context, s) : _history(context, s)),
      ],
    );
  }

  void _open(Map o) => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))));

  // ───────────────────────── Live now ─────────────────────────
  List<Widget> _live(BuildContext context, AppState s) {
    final p = s.perms;
    final on = _prefs.on;
    final orders = s.list('orders').where((o) => o['type'] == 'online').toList();
    final agents = s.list('agents');
    final agentName = {for (final a in agents) toInt(a['id']): '${a['name']}'};
    final today = DateRange.preset('today');
    final waiting = orders.where((o) => o['status'] == 'In Progress' && o['agentId'] == null).toList();
    final onWay = orders.where((o) => o['status'] == 'Out for Delivery').toList();
    final withAgent = orders.where((o) => o['agentId'] != null && (o['status'] == 'Out for Delivery' || o['status'] == 'In Progress')).toList();
    final doneToday = orders.where((o) => o['status'] == 'Delivered' && today.contains(o['deliveredAt'])).toList();
    final toCollect = withAgent.where((o) => o['paymentStatus'] != 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final cashToday = doneToday.where((o) => o['agentId'] != null && o['paymentStatus'] == 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final busy = agents.where((a) => withAgent.any((o) => toInt(o['agentId']) == toInt(a['id']))).length;
    String since(Object? iso) {
      final at = parseDate(iso);
      if (at == null) return '—';
      final m = DateTime.now().toUtc().difference(at).inMinutes.clamp(0, 1 << 30);
      return m < 60 ? '$m min' : '${m ~/ 60}h ${m % 60}m';
    }

    Widget agentCard(Map<String, dynamic> a) {
      final mine = orders.where((o) => toInt(o['agentId']) == toInt(a['id'])).toList();
      final active = mine.where((o) => o['status'] == 'Out for Delivery' || o['status'] == 'In Progress').toList();
      final done = mine.where((o) => o['status'] == 'Delivered' && today.contains(o['deliveredAt'])).toList();
      final collect = active.where((o) => o['paymentStatus'] != 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
      final cash = done.where((o) => o['paymentStatus'] == 'Paid').fold<double>(0, (t, o) => t + toDouble(o['total']));
      Widget box(String v, String l, Color fg, Color bg) => Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
              child: Column(children: [Text(v, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: fg)), Text(l, style: TextStyle(fontSize: 12, color: fg))]),
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
                  Text('${a['name']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.g900)),
                  if (on('dv-agents', 'dv-a-summary')) Text('${active.length} active · ${done.length} delivered today', style: const TextStyle(fontSize: 12, color: W.g500)),
                ]),
              ),
              if (a['phone'] != null) WebIconAction(LucideIcons.phone, color: W.green, soft: true, tooltip: 'Call ${a['phone']}', onTap: () => launchUrl(Uri.parse('tel:${a['phone']}'))),
            ]),
          ),
          const Divider(height: 1, color: W.g100),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (on('dv-agents', 'dv-a-collect') || on('dv-agents', 'dv-a-cash'))
                Row(children: [
                  if (on('dv-agents', 'dv-a-collect')) box(money(collect), 'to collect', const Color(0xFFB45309), const Color(0xFFFEF3C7)),
                  if (on('dv-agents', 'dv-a-collect') && on('dv-agents', 'dv-a-cash')) const SizedBox(width: 8),
                  if (on('dv-agents', 'dv-a-cash')) box(money(cash), 'cash today', const Color(0xFF047857), const Color(0xFFD1FAE5)),
                ]),
              if (on('dv-agents', 'dv-a-orders'))
                for (final o in active) ...[
                  const SizedBox(height: 14),
                  InkWell(
                    onTap: () => _open(o),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text('#${o['number']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.blue))),
                        if (on('dv-agents', 'dv-a-status'))
                          o['status'] == 'Out for Delivery'
                              ? const WebBadge('On the way', color: Color(0xFF0369A1), bg: Color(0xFFE0F2FE))
                              : const WebBadge('To pick up', color: Color(0xFFB45309), bg: Color(0xFFFEF3C7)),
                      ]),
                      const SizedBox(height: 2),
                      Text.rich(
                        TextSpan(children: [
                          if (on('dv-agents', 'dv-a-customer')) TextSpan(text: '${o['customer']} · ${money(o['total'])} '),
                          if (on('dv-agents', 'dv-a-customer') && o['paymentStatus'] != 'Paid') const TextSpan(text: '(collect)', style: TextStyle(color: Color(0xFFD97706))),
                          if (on('dv-agents', 'dv-a-time')) TextSpan(text: ' · assigned ${ago(o['assignedAt'] ?? o['createdAt'])}'),
                        ]),
                        style: const TextStyle(fontSize: 12, color: W.g500),
                      ),
                    ]),
                  ),
                ],
            ]),
          ),
        ]),
      );
    }

    final stats = [
      if (on('dv-stats', 'dv-k-waiting')) WebMiniMetric(icon: LucideIcons.clock, color: const Color(0xFFD97706), value: '${waiting.length}', label: '', sub: 'Waiting for an agent'),
      if (on('dv-stats', 'dv-k-onway')) WebMiniMetric(icon: LucideIcons.truck, color: const Color(0xFF0284C7), value: '${onWay.length}', label: '', sub: 'On the way'),
      if (on('dv-stats', 'dv-k-delivered')) WebMiniMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF059669), value: '${doneToday.length}', label: '', sub: 'Delivered today'),
      if (on('dv-stats', 'dv-k-collect')) WebMiniMetric(icon: LucideIcons.wallet, color: const Color(0xFFDC2626), value: money(toCollect), label: '', sub: 'Cash to collect'),
      if (on('dv-stats', 'dv-k-cash')) WebMiniMetric(icon: LucideIcons.indianRupee, color: W.primary, value: money(cashToday), label: '', sub: 'Cash collected today'),
      if (on('dv-stats', 'dv-k-agents')) WebMiniMetric(icon: LucideIcons.users, color: W.g700, tinted: false, value: '$busy / ${agents.length}', label: '', sub: 'Agents busy'),
    ];

    return [
      // On the road now: every order an agent is carrying (or has to pick up).
      if (withAgent.isNotEmpty) ...[
        WebCard(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Padding(padding: EdgeInsets.fromLTRB(16, 12, 16, 12), child: Text('On the road now', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900))),
            WebTable(
              cols: const [WebCol('Order', flex: 1), WebCol('Delivery agent', flex: 1), WebCol('Customer', flex: 2.2), WebCol('Status', flex: 1), WebCol('With the agent for', flex: 1), WebCol('To collect', flex: 1, right: true)],
              rows: [
                for (final o in withAgent)
                  [
                    Cell2('${o['number']}', aColor: W.blue, bold: true, onTap: () => _open(o)),
                    Text(agentName[toInt(o['agentId'])] ?? 'Agent', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                    Cell2('${o['customer']}', b: '${o['address'] ?? ''}'.replaceAll('\n', ', ')),
                    o['status'] == 'Out for Delivery' ? const WebBadge('On the way', color: Color(0xFF0369A1), bg: Color(0xFFE0F2FE)) : const WebBadge('Not picked up', color: Color(0xFFB45309), bg: Color(0xFFFEF3C7)),
                    Text(since(o['assignedAt']), style: const TextStyle(fontSize: 12, color: W.g600)),
                    o['paymentStatus'] == 'Paid'
                        ? const Text('Paid', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.green))
                        : Text(money(o['total']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
              ],
              onRowTap: [for (final o in withAgent) () => _open(o)],
            ),
          ]),
        ),
        const SizedBox(height: 12),
      ],
      if (stats.isNotEmpty) ...[WebGrid(columns: stats.length, gap: 12, minWidth: 150, children: stats), const SizedBox(height: 12)],
      if (on('dv-waiting')) ...[
        WebCard(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(color: Color(0xFFFEF9E7), borderRadius: BorderRadius.vertical(top: Radius.circular(W.radius))),
              child: Row(children: [
                const Icon(LucideIcons.clock, size: 16, color: Color(0xFF92400E)),
                const SizedBox(width: 8),
                const Text('Waiting for a delivery agent', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF92400E))),
                const SizedBox(width: 10),
                Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)), child: Text('${waiting.length}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
              ]),
            ),
            const Divider(height: 1, color: W.g200),
            if (waiting.isEmpty)
              const Padding(padding: EdgeInsets.all(16), child: Text('All accepted orders have an agent.', style: TextStyle(fontSize: 13, color: W.g600)))
            else
              for (final o in waiting)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: W.g100))),
                  child: Row(children: [
                    Expanded(
                      flex: 2,
                      child: Cell2(
                        '#${o['number']}',
                        b: [
                          if (on('dv-waiting', 'dv-w-customer')) '${o['customer']}',
                          if (on('dv-waiting', 'dv-w-amount')) money(o['total']),
                          if (on('dv-waiting', 'dv-w-payment')) o['paymentStatus'] == 'Paid' ? 'paid' : 'to collect',
                          if (on('dv-waiting', 'dv-w-items')) '${((o['items'] as List?) ?? const []).length} items',
                          ago(o['createdAt']),
                        ].join(' · '),
                        aColor: W.blue,
                        onTap: () => _open(o),
                      ),
                    ),
                    if (on('dv-waiting', 'dv-w-address')) Expanded(flex: 2, child: Text('${o['address'] ?? ''}'.replaceAll('\n', ', '), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g600))),
                    if (on('dv-waiting', 'dv-w-contact')) ...[
                      if (o['phone'] != null) WebIconAction(LucideIcons.phone, color: W.g600, tooltip: 'Call ${o['phone']}', onTap: () => launchUrl(Uri.parse('tel:${o['phone']}'))),
                      if (o['lat'] != null || o['address'] != null)
                        WebIconAction(LucideIcons.mapPin, color: W.blue, tooltip: 'Map', onTap: () {
                          final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address']}');
                          launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest'), mode: LaunchMode.externalApplication);
                        }),
                    ],
                    const SizedBox(width: 12),
                    if (on('dv-waiting', 'dv-w-assign') && p.assignDelivery && agents.isNotEmpty)
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
        const SizedBox(height: 12),
      ],
      if (on('dv-agents'))
        agents.isEmpty
            ? const WebCard(child: Text('No delivery agents yet — add staff with the Delivery Agent role.', style: TextStyle(color: W.g600)))
            : WebGrid(columns: 3, gap: 16, minWidth: 300, children: [for (final a in agents) agentCard(a)]),
    ];
  }

  // ───────────────────────── History / Agent report ─────────────────────────
  List<Widget> _history(BuildContext context, AppState s) {
    final data = (s.pageData['deliveries']?['data'] as Map?) ?? const {};
    final all = ((data['rows'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final agents = ((data['agents'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final start = _from, end = _to.add(const Duration(days: 1));
    bool inside(Object? iso) {
      final d = parseDate(iso)?.toLocal();
      return d != null && !d.isBefore(start) && d.isBefore(end);
    }
    List<Map> fails(Map r) => ((r['failedAttempts'] as List?) ?? const []).cast<Map>();
    // In these dates: handed over, delivered, finished or a failed attempt.
    final dated = all.where((r) => (_agent == 0 || toInt(r['agentId']) == _agent) && (inside(r['assignedAt']) || inside(r['deliveredAt']) || inside(r['finishedAt']) || fails(r).any((a) => inside(a['at'])))).toList();
    final q = _q.trim().toLowerCase();
    final rows = dated.where((r) {
      final st = '${r['status']}';
      final ok = _status == 'all' ||
          (_status == 'delivered' && st == 'Delivered') ||
          (_status == 'canceled' && st == 'Canceled') ||
          (_status == 'failed' && fails(r).isNotEmpty) ||
          (_status == 'active' && (st == 'In Progress' || st == 'Out for Delivery'));
      return ok && (q.isEmpty || '${r['number']} ${r['customer']} ${r['phone'] ?? ''} ${r['address']} ${r['agent'] ?? ''}'.toLowerCase().contains(q));
    }).toList();

    // Per agent (every agent listed, even with nothing in these dates).
    final rep = <Object?, Map<String, dynamic>>{};
    Map<String, dynamic> blank(Object? id, String name) => {'id': id, 'name': name, 'assigned': 0, 'delivered': 0, 'failed': 0, 'canceled': 0, 'active': 0, 'collected': 0.0, 'cash': 0.0, 'upi': 0.0, 'other': 0.0, 'mins': <int>[]};
    for (final a in agents) {
      if (_agent == 0 || toInt(a['id']) == _agent) rep[toInt(a['id'])] = blank(toInt(a['id']), '${a['name']}');
    }
    for (final r in dated) {
      final key = r['agentId'] == null ? null : toInt(r['agentId']);
      final x = rep.putIfAbsent(key, () => blank(key, '${r['agent'] ?? 'No agent'}'));
      if (inside(r['assignedAt'])) x['assigned']++;
      if (r['status'] == 'Delivered' && r['deliveredAt'] != null) {
        x['delivered']++;
        if (r['minutes'] != null) (x['mins'] as List<int>).add(toInt(r['minutes']));
        for (final c in ((r['collected'] as List?) ?? const []).cast<Map>()) {
          final a = toDouble(c['amount']);
          x['collected'] += a;
          c['method'] == 'Cash' ? x['cash'] += a : c['method'] == 'UPI' ? x['upi'] += a : x['other'] += a;
        }
      }
      if (r['status'] == 'Canceled') x['canceled']++;
      if (r['status'] == 'In Progress' || r['status'] == 'Out for Delivery') x['active']++;
      x['failed'] += fails(r).length;
    }
    final report = rep.values.toList()..sort((a, b) => (b['delivered'] as int).compareTo(a['delivered'] as int) != 0 ? (b['delivered'] as int).compareTo(a['delivered'] as int) : '${a['name']}'.compareTo('${b['name']}'));
    int tot(String k) => report.fold<int>(0, (t, r) => t + (r[k] as int));
    final collected = report.fold<double>(0, (t, r) => t + (r['collected'] as double));
    String dur(Object? m) {
      if (m == null) return '—';
      final n = toInt(m);
      return n < 60 ? '$n min' : '${n ~/ 60}h ${n % 60}m';
    }
    String avg(Map r) {
      final l = r['mins'] as List<int>;
      return l.isEmpty ? '—' : dur((l.reduce((a, b) => a + b) / l.length).round());
    }
    String rate(Map r) {
      final f = (r['delivered'] as int) + (r['canceled'] as int);
      return f == 0 ? '—' : '${((r['delivered'] as int) / f * 100).round()}%';
    }

    Widget chip(String label, bool on, VoidCallback tap) => Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Material(
            color: on ? W.primary : Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6), side: BorderSide(color: on ? W.primary : W.g200)),
            child: InkWell(onTap: tap, borderRadius: BorderRadius.circular(6), child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: on ? Colors.white : W.g700)))),
          ),
        );
    Widget card(IconData icon, Color c, String value, String label, [String? status]) => WebMetric(
          icon: icon, color: c, value: value, label: label, selected: status != null && _tab == 'history' && _status == status, onTap: status == null || _tab != 'history' ? null : () => setState(() => _status = status),
        );
    Widget badge(Map r) => switch ('${r['status']}') {
          'Delivered' => const WebBadge('Delivered', color: Color(0xFF047857), bg: Color(0xFFECFDF5)),
          'Canceled' => const WebBadge('Cancelled', color: Color(0xFFB91C1C), bg: Color(0xFFFEF2F2)),
          'Out for Delivery' => const WebBadge('On the way', color: Color(0xFF0369A1), bg: Color(0xFFF0F9FF)),
          _ => const WebBadge('Waiting', color: Color(0xFFB45309), bg: Color(0xFFFFFBEB)),
        };

    void export() => exportTable(context, 'Deliveries ${_tab == 'report' ? 'report' : 'history'}', _tab == 'report'
        ? const ['Agent', 'Assigned', 'Delivered', 'Failed attempts', 'Cancelled', 'Still out', 'Collected', 'Cash', 'UPI', 'Other', 'Avg time', 'Success %']
        : const ['Order', 'Customer', 'Phone', 'Agent', 'Status', 'Assigned', 'Finished', 'Time (min)', 'Failed attempts', 'Amount', 'Collected'], _tab == 'report'
        ? [for (final r in report) [r['name'], r['assigned'], r['delivered'], r['failed'], r['canceled'], r['active'], r['collected'], r['cash'], r['upi'], r['other'], avg(r), rate(r)]]
        : [
            for (final r in rows)
              [r['number'], r['customer'], r['phone'], r['agent'], r['status'], dateTime(r['assignedAt']), dateTime(r['finishedAt']), r['minutes'], fails(r).map((a) => a['note']).join(' | '), toDouble(r['total']),
                ((r['collected'] as List?) ?? const []).cast<Map>().fold<double>(0, (t, c) => t + toDouble(c['amount']))],
          ]);

    return [
      WebCard(
        padding: const EdgeInsets.all(12),
        child: Wrap(spacing: 6, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          for (final (k, l) in const [('today', 'Today'), ('yesterday', 'Yesterday'), ('week', 'This week'), ('7d', 'Last 7 days'), ('month', 'This month'), ('30d', 'Last 30 days')]) chip(l, _preset == k, () => _range(k)),
          WebButton(dateShort(_from.toIso8601String()), icon: LucideIcons.calendar, onPressed: () async {
            final d = await showDatePicker(context: context, initialDate: _from, firstDate: DateTime.now().subtract(const Duration(days: 90)), lastDate: DateTime.now());
            if (d != null) {
              setState(() {
                _preset = 'custom';
                _from = d;
                if (_to.isBefore(d)) _to = d;
              });
            }
          }),
          const Text('–', style: TextStyle(color: W.g400)),
          WebButton(dateShort(_to.toIso8601String()), icon: LucideIcons.calendar, onPressed: () async {
            final d = await showDatePicker(context: context, initialDate: _to, firstDate: _from, lastDate: DateTime.now());
            if (d != null) {
              setState(() {
                _preset = 'custom';
                _to = d;
              });
            }
          }),
          SizedBox(width: 200, child: WebSelect<int>(value: _agent, options: [(0, 'All delivery agents'), for (final a in agents) (toInt(a['id']), '${a['name']}')], onChanged: (v) => setState(() => _agent = v))),
          WebButton('Export', icon: LucideIcons.download, onPressed: export),
        ]),
      ),
      const SizedBox(height: 12),
      WebGrid(columns: 6, gap: 12, minWidth: 150, children: [
        card(LucideIcons.truck, const Color(0xFF2563EB), '${tot('assigned')}', 'Handed to agents', 'all'),
        card(LucideIcons.packageCheck, const Color(0xFF059669), '${tot('delivered')}', 'Delivered', 'delivered'),
        card(LucideIcons.triangleAlert, const Color(0xFFEA580C), '${tot('failed')}', 'Failed attempts', 'failed'),
        card(LucideIcons.ban, const Color(0xFFDC2626), '${tot('canceled')}', 'Cancelled', 'canceled'),
        card(LucideIcons.bike, const Color(0xFF0284C7), '${tot('active')}', 'Still out / waiting', 'active'),
        card(LucideIcons.indianRupee, W.primary, money(collected), 'Collected on delivery'),
      ]),
      const SizedBox(height: 12),
      if (_tab == 'report')
        WebTable(
          cols: const [
            WebCol('Delivery agent', flex: 1.6), WebCol('Assigned', right: true), WebCol('Delivered', right: true), WebCol('Failed', right: true), WebCol('Cancelled', right: true),
            WebCol('Still out', right: true), WebCol('Collected', right: true, flex: 1.2), WebCol('Cash / UPI / Other', right: true, flex: 2), WebCol('Avg time', right: true), WebCol('Success', right: true), WebCol('', width: 80),
          ],
          rows: [
            for (final r in report)
              [
                Row(children: [const Icon(LucideIcons.users, size: 15, color: W.g400), const SizedBox(width: 8), Flexible(child: Text('${r['name']}', style: const TextStyle(fontWeight: FontWeight.w600, color: W.g900)))]),
                Text('${r['assigned']}'),
                Text('${r['delivered']}', style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF059669))),
                Text('${r['failed']}', style: const TextStyle(color: Color(0xFFEA580C))),
                Text('${r['canceled']}', style: const TextStyle(color: Color(0xFFDC2626))),
                Text('${r['active']}', style: const TextStyle(color: Color(0xFF0284C7))),
                Text(money(r['collected']), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text('${money(r['cash'])} / ${money(r['upi'])} / ${money(r['other'])}', style: const TextStyle(fontSize: 12, color: W.g600)),
                Text(avg(r)),
                Text(rate(r)),
                r['id'] == null ? const SizedBox() : TextButton(
                        onPressed: () => setState(() {
                              _tab = 'history';
                              _agent = toInt(r['id']);
                            }),
                        child: const Text('Orders')),
              ],
          ],
          empty: const Center(child: Text('No delivery agents yet.', style: TextStyle(color: W.g500))),
        )
      else
        WebCard(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                for (final (k, l) in const [('all', 'All'), ('delivered', 'Delivered'), ('failed', 'Failed'), ('canceled', 'Cancelled'), ('active', 'Out now')]) chip(l, _status == k, () => setState(() => _status = k)),
                const Spacer(),
                WebSearch(width: 260, hint: 'Order, customer, phone, agent', onChanged: (v) => setState(() => _q = v)),
              ]),
            ),
            WebTable(
              cols: const [WebCol('Order', flex: 1), WebCol('Customer', flex: 1.8), WebCol('Delivery agent', flex: 1), WebCol('Status', flex: 1.1), WebCol('Handed over', flex: 1.2), WebCol('Finished', flex: 1.2), WebCol('Time taken', flex: .9), WebCol('Failed attempts', flex: 1.6), WebCol('Amount', flex: 1, right: true)],
              rowHeight: 64,
              rows: [
                for (final r in rows)
                  [
                    Cell2('${r['number']}', b: '${r['items']} item${toInt(r['items']) == 1 ? '' : 's'}', aColor: W.blue, bold: true, onTap: () => _open(r)),
                    Cell2('${r['customer']}', b: [if (r['phone'] != null) '${r['phone']}', if ('${r['address'] ?? ''}'.isNotEmpty) '${r['address']}'].join(' · ')),
                    Text('${r['agent'] ?? '—'}', style: const TextStyle(fontWeight: FontWeight.w500)),
                    Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      badge(r),
                      if (r['status'] == 'Canceled' && r['cancelReason'] != null) Text('${r['cancelReason']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626))),
                    ]),
                    Text(r['assignedAt'] == null ? '—' : dateTime(r['assignedAt']), style: const TextStyle(fontSize: 12, color: W.g600)),
                    Text(r['finishedAt'] == null ? '—' : dateTime(r['finishedAt']), style: const TextStyle(fontSize: 12, color: W.g600)),
                    Text(dur(r['minutes']), style: const TextStyle(fontSize: 12)),
                    fails(r).isEmpty
                        ? const Text('—', style: TextStyle(color: W.g300))
                        : Text(fails(r).map((a) => '${dateTime(a['at'])} — ${a['note']}').join('\n'), maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFFC2410C))),
                    Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(money(r['total']), style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(
                        r['paymentStatus'] == 'Paid'
                            ? (((r['collected'] as List?) ?? const []).isEmpty ? 'Paid' : ((r['collected'] as List).cast<Map>().map((c) => c['method']).join(' + ')))
                            : 'Not collected',
                        style: TextStyle(fontSize: 12, color: r['paymentStatus'] == 'Paid' ? W.green : const Color(0xFFD97706)),
                      ),
                    ]),
                  ],
              ],
              onRowTap: [for (final r in rows) () => _open(r)],
              empty: const Center(child: Text('No deliveries match these filters.', style: TextStyle(color: W.g500))),
            ),
          ]),
        ),
    ];
  }
}
