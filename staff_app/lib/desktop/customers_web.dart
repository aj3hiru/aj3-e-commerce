import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../features/customers/customers_screen.dart' show CustomerProfile, editCustomer;
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "Customers" as on the website: growth chart, key metrics, date range, filters, table.
class CustomersWeb extends StatefulWidget {
  const CustomersWeb({super.key});
  @override
  State<CustomersWeb> createState() => _CustomersWebState();
}

class _CustomersWebState extends State<CustomersWeb> {
  DateRange _range = DateRange.preset('this_month');
  String _type = 'all', _status = 'all', _dues = 'all', _buying = 'all', _applies = 'ignore';
  String _q = '';
  int _page = 0, _per = 10;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final all = s.list('customers');
    // Fallback when the server hasn't sent all-time numbers yet: count the orders on this computer.
    final localOrders = <int, (int, double)>{};
    for (final o in s.list('orders')) {
      if (o['customerId'] == null || o['status'] == 'Canceled') continue;
      final id = toInt(o['customerId']);
      final cur = localOrders[id] ?? (0, 0.0);
      localOrders[id] = (cur.$1 + 1, cur.$2 + toDouble(o['total']));
    }
    int orders(Map c) => c['orders'] != null ? toInt(c['orders']) : (localOrders[toInt(c['id'])]?.$1 ?? 0);
    double spent(Map c) => c['spent'] != null ? toDouble(c['spent']) : (localOrders[toInt(c['id'])]?.$2 ?? 0);
    bool walkIn(Map c) => (c['type'] ?? 'offline') != 'online';

    final q = _q.trim().toLowerCase();
    final list = all.where((c) {
      if (_type == 'online' && walkIn(c)) return false;
      if (_type == 'offline' && !walkIn(c)) return false;
      if (_status != 'all' && (c['status'] == 'active') != (_status == 'active')) return false;
      if (_dues == 'with' && toDouble(c['due']) <= 0) return false;
      if (_dues == 'none' && toDouble(c['due']) > 0) return false;
      if (_buying == 'buyers' && orders(c) == 0) return false;
      if (_buying == 'never' && orders(c) > 0) return false;
      if (_applies == 'joined' && !_range.contains(c['since'])) return false;
      return q.isEmpty || '${c['name']} ${c['phone'] ?? ''} ${c['email'] ?? ''}'.toLowerCase().contains(q);
    }).toList();
    final shown = WebPager.slice(list, _page, _per);
    final withDue = all.where((c) => toDouble(c['due']) > 0).toList();

    void open(Map c) => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerProfile(id: toInt(c['id']))));

    return WebPage(
      title: 'Customers',
      subtitle: "Everyone who buys from the shop and the counter, with what they've spent and owe",
      onRefresh: () => s.syncNow(only: const ['customers', 'dues']),
      actions: [
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Customers', const ['Name', 'Mobile', 'Email', 'Type', 'Orders', 'Total spent', 'Due', 'Status', 'Joined'], [
              for (final c in list) [c['name'], c['phone'], c['email'], walkIn(c) ? 'Walk-in' : 'Online', orders(c), spent(c), toDouble(c['due']), c['status'], dateShort(c['since'])],
            ])),
        if (s.perms.customers) WebButton('Add Customer', icon: LucideIcons.plus, color: W.blue, onPressed: () => editCustomer(context, null)),
      ],
      children: [
        WebCard(child: _Growth(customers: all, range: _range)),
        const SizedBox(height: 20),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const WebCardTitle('Key Metrics', icon: LucideIcons.chartNoAxesColumn, iconColor: Color(0xFF16A34A)),
            WebGrid(columns: 2, gap: 12, minWidth: 260, children: [
              _KeyMetric(icon: LucideIcons.users, color: const Color(0xFF059669), label: 'All Customers', value: '${all.length}', sub: '${all.where((c) => c['status'] == 'active').length} active · ${all.where((c) => c['status'] != 'active').length} inactive', selected: _type == 'all' && _dues == 'all', onTap: () => _set(() {
                    _type = 'all';
                    _dues = 'all';
                  })),
              _KeyMetric(icon: LucideIcons.shoppingBag, color: W.blue, label: 'Online Customers', value: '${all.where((c) => !walkIn(c)).length}', sub: 'signed up on the shop', selected: _type == 'online', onTap: () => _set(() => _type = 'online')),
              _KeyMetric(icon: LucideIcons.store, color: W.blue, label: 'Walk-in Customers', value: '${all.where(walkIn).length}', sub: 'added at the counter', selected: _type == 'offline', onTap: () => _set(() => _type = 'offline')),
              _KeyMetric(icon: LucideIcons.wallet, color: const Color(0xFFF59E0B), label: 'With Dues', value: '${withDue.length}', sub: '${money(withDue.fold<double>(0, (t, c) => t + toDouble(c['due'])))} outstanding', selected: _dues == 'with', onTap: () => _set(() => _dues = 'with')),
            ]),
          ]),
        ),
        const SizedBox(height: 20),
        WebRangeBar(range: _range, presets: const ['today', '7d', 'this_month', 'prev_month', 'this_year'], onChanged: (r) => _set(() => _range = r)),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(14),
          child: WebGrid(columns: 5, gap: 12, minWidth: 170, children: [
            WebSelect<String>(icon: LucideIcons.users, label: 'Customer Type', value: _type, options: const [('all', 'All customers'), ('online', 'Online'), ('offline', 'Walk-in')], onChanged: (v) => _set(() => _type = v)),
            WebSelect<String>(icon: LucideIcons.circleCheck, label: 'Status', value: _status, options: const [('all', 'All status'), ('active', 'Active'), ('inactive', 'Inactive')], onChanged: (v) => _set(() => _status = v)),
            WebSelect<String>(icon: LucideIcons.wallet, label: 'Dues', value: _dues, options: const [('all', 'All'), ('with', 'With dues'), ('none', 'No dues')], onChanged: (v) => _set(() => _dues = v)),
            WebSelect<String>(icon: LucideIcons.shoppingBag, label: 'Buying', value: _buying, options: const [('all', 'All'), ('buyers', 'Has ordered'), ('never', 'Never ordered')], onChanged: (v) => _set(() => _buying = v)),
            WebSelect<String>(icon: LucideIcons.calendar, label: 'Date range applies to', value: _applies, options: const [('ignore', 'Ignore date range'), ('joined', 'Joined in range')], onChanged: (v) => _set(() => _applies = v)),
          ]),
        ),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Spacer(),
              const Text('Search:', style: TextStyle(fontSize: 15, color: W.g800)),
              const SizedBox(width: 8),
              WebSearch(width: 260, hint: 'Name, phone, email...', onChanged: (v) => _set(() => _q = v)),
            ]),
            const SizedBox(height: 16),
            WebTable(
              bordered: true,
              rowHeight: 76,
              cols: const [WebCol('Customer', flex: 1.4), WebCol('Contact', flex: 1.8), WebCol('Type', flex: .9), WebCol('Orders', flex: .7), WebCol('Total Spent', flex: 1), WebCol('Due', flex: .9), WebCol('Status', flex: .9), WebCol('Actions', width: 112)],
              onRowTap: [for (final c in shown) () => open(c)],
              rows: [
                for (final c in shown)
                  [
                    Row(children: [
                      Avatar('${c['name']}', photo: c['avatar'], size: 34),
                      const SizedBox(width: 10),
                      Expanded(child: Text('${c['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: W.g900))),
                    ]),
                    Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [const Icon(LucideIcons.phone, size: 13, color: W.g500), const SizedBox(width: 6), Flexible(child: Text('${c['phone'] ?? '—'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, color: W.g900)))]),
                      Row(children: [
                        const Icon(LucideIcons.mail, size: 13, color: W.g500),
                        const SizedBox(width: 6),
                        Flexible(child: Text('${c['email'] ?? 'No email'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g500))),
                      ]),
                    ]),
                    walkIn(c)
                        ? const WebBadge('Walk-in', color: Color(0xFFB45309), bg: Color(0xFFFEF3C7))
                        : const WebBadge('Online', color: W.primary, bg: W.primaryLighter),
                    Text('${orders(c)}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    Text(money(spent(c)), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    toDouble(c['due']) > 0 ? Text(money(c['due']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFFDC2626))) : webDash,
                    WebPill(c['status'] == 'active' ? 'Active' : 'Inactive', color: c['status'] == 'active' ? W.green : W.grey),
                    Row(children: [
                      WebIconAction(LucideIcons.eye, color: W.grey, tooltip: 'View', onTap: () => open(c)),
                      if (s.perms.customers) WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit', onTap: () => editCustomer(context, c)),
                    ]),
                  ],
              ],
            ),
            WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v)),
          ]),
        ),
      ],
    );
  }
}

class _KeyMetric extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label, value, sub;
  final bool selected;
  final VoidCallback onTap;
  const _KeyMetric({required this.icon, required this.color, required this.label, required this.value, required this.sub, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: selected ? const Color(0xFF93C5FD) : W.g200, width: selected ? 1.5 : 1)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 32, height: 32, decoration: BoxDecoration(color: color, shape: BoxShape.circle), child: Icon(icon, size: 16, color: Colors.white)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 13, color: W.g800)),
                const SizedBox(height: 4),
                Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
                const SizedBox(height: 4),
                Text(sub, style: const TextStyle(fontSize: 13, color: W.g500)),
              ]),
            ),
          ]),
        ),
      );
}

/// "Customer Growth": customers who joined each day, this period vs the one before.
class _Growth extends StatelessWidget {
  final List<Map<String, dynamic>> customers;
  final DateRange range;
  const _Growth({required this.customers, required this.range});
  @override
  Widget build(BuildContext context) {
    final r = range.key == 'all' ? DateRange.preset('this_month') : range;
    final days = r.to.difference(r.from).inDays + 1;
    final prev = r.previous();
    List<double> counts(DateRange x) {
      final out = List<double>.filled(days, 0);
      for (final c in customers) {
        if (c['since'] == null || !x.contains(c['since'])) continue;
        final t = ist(DateTime.parse('${c['since']}').toUtc());
        final i = DateTime(t.year, t.month, t.day).difference(x.from).inDays;
        if (i >= 0 && i < days) out[i]++;
      }
      return out;
    }

    final now = counts(r), before = counts(prev);
    final top = [...now, ...before, 1.0].reduce((a, b) => a > b ? a : b) + 1;
    LineChartBarData line(List<double> v, Color c, {bool fill = false}) => LineChartBarData(
          spots: [for (var i = 0; i < v.length; i++) FlSpot(i.toDouble(), v[i])],
          isCurved: true,
          preventCurveOverShooting: true,
          color: c,
          barWidth: 2,
          dotData: FlDotData(show: days <= 31, getDotPainter: (_, _, _, _) => FlDotCirclePainter(radius: 3, color: c, strokeWidth: 0)),
          belowBarData: BarAreaData(show: fill, color: c.withValues(alpha: .06)),
        );
    final step = (days / 7).ceil().clamp(1, 1000);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const Icon(LucideIcons.trendingUp, size: 19, color: Color(0xFF16A34A)),
        const SizedBox(width: 10),
        const Expanded(child: Text('Customer Growth', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: W.g900))),
        for (final (c, l) in const [(Color(0xFF16A34A), 'This Period'), (W.blue, 'Previous Period')]) ...[
          Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(l, style: const TextStyle(fontSize: 14, color: W.g700)),
          const SizedBox(width: 18),
        ],
      ]),
      const SizedBox(height: 6),
      Text.rich(TextSpan(children: [
        TextSpan(text: '${now.fold<double>(0, (t, v) => t + v).toInt()}', style: const TextStyle(fontWeight: FontWeight.w700)),
        const TextSpan(text: ' joined by day'),
      ]), style: const TextStyle(fontSize: 14, color: W.g600)),
      const SizedBox(height: 14),
      SizedBox(
        height: 180,
        child: LineChart(LineChartData(
          minY: 0,
          maxY: top,
          gridData: FlGridData(drawVerticalLine: false, horizontalInterval: 1, getDrawingHorizontalLine: (_) => const FlLine(color: W.g100, strokeWidth: 1, dashArray: [3, 3])),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28, interval: (top / 4).ceilToDouble().clamp(1, 1e9), getTitlesWidget: (v, m) => Text('${v.toInt()}', style: const TextStyle(fontSize: 11, color: W.g500)))),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                interval: 1,
                getTitlesWidget: (v, m) {
                  final i = v.round();
                  if (v != i.toDouble() || (i % step != 0 && !(i == days - 1 && i % step >= step / 2))) return const SizedBox();
                  return Padding(padding: const EdgeInsets.only(top: 6), child: Text(DateFormat('d MMM').format(r.from.add(Duration(days: i))), style: const TextStyle(fontSize: 12, color: W.g600)));
                },
              ),
            ),
          ),
          lineBarsData: [line(before, W.blue), line(now, const Color(0xFF16A34A), fill: true)],
        )),
      ),
      const SizedBox(height: 8),
      Text('This period ${DateFormat('dd/MM/yyyy').format(r.from)} – ${DateFormat('dd/MM/yyyy').format(r.to)} · previous ${DateFormat('dd/MM/yyyy').format(prev.from)} – ${DateFormat('dd/MM/yyyy').format(prev.to)}',
          style: const TextStyle(fontSize: 12.5, color: W.g500)),
    ]);
  }
}
