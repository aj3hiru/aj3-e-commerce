import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/display_options.dart';
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
  static final _def = displayDefs['ecom_customers2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  DateRange _range = DateRange.preset('this_month');
  String _type = 'all', _status = 'all', _dues = 'all', _buying = 'all', _applies = 'none';
  String _q = '';
  int _page = 0, _per = 10;
  String _sort = 'name';
  bool _asc = true;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  void _sortBy(String k) => setState(() {
        if (_sort == k) {
          _asc = !_asc;
        } else {
          _sort = k;
          _asc = k == 'name';
        }
      });

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
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
    // "Bought in range": an order from this customer in the chosen dates (orders on this computer).
    final boughtInRange = {for (final o in s.list('orders')) if (o['customerId'] != null && o['status'] != 'Canceled' && _range.contains(o['createdAt'])) toInt(o['customerId'])};

    final q = _q.trim().toLowerCase();
    final list = all.where((c) {
      if (_type == 'online' && walkIn(c)) return false;
      if (_type == 'offline' && !walkIn(c)) return false;
      if (_status != 'all' && (c['status'] == 'active') != (_status == 'active')) return false;
      if (_dues == 'with' && toDouble(c['due']) <= 0.004) return false;
      if (_dues == 'without' && toDouble(c['due']) > 0.004) return false;
      if (_buying == 'buyers' && !boughtInRange.contains(toInt(c['id']))) return false;
      if (_buying == 'never' && orders(c) > 0) return false;
      if (_applies == 'created' && !_range.contains(c['since'])) return false;
      if (_applies == 'lastOrder' && !_range.contains(c['lastOrderAt'])) return false;
      return q.isEmpty || '${c['name']} ${c['phone'] ?? ''} ${c['email'] ?? ''}'.toLowerCase().contains(q);
    }).toList();
    int cmp(Map a, Map b) => switch (_sort) {
          'orders' => orders(a).compareTo(orders(b)),
          'spent' => spent(a).compareTo(spent(b)),
          'due' => toDouble(a['due']).compareTo(toDouble(b['due'])),
          _ => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()),
        };
    list.sort((a, b) => _asc ? cmp(a, b) : cmp(b, a));
    final shown = _per == 0 ? list : WebPager.slice(list, _page, _per);
    final withDue = all.where((c) => toDouble(c['due']) > 0.004).toList();

    void open(Map c) => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerProfile(id: toInt(c['id']))));
    Future<void> setStatus(Map<String, dynamic> c, String v) async {
      final status = v == 'Active' ? 'active' : 'inactive';
      if (c['status'] == status) return;
      await s.enqueue(OutboxItem(
        id: newId(), method: 'PATCH', path: '/api/ecommerce/customers/${c['id']}', body: {'status': status}, label: '${c['name']}: ${v.toLowerCase()}',
        effect: {'kind': 'customer', 'id': c['id'], 'fields': {'status': status}}, refresh: const ['customers'],
      ));
      if (context.mounted) toast(context, status == 'active' ? 'Customer is active again.' : 'Customer set to inactive.');
    }

    final cols = <(WebCol, Widget Function(Map<String, dynamic>))>[
      if (on('cus2-table', 'cus2-c-customer'))
        (
          WebCol('Customer', flex: 1.7, onSort: () => _sortBy('name'), sorted: _sort == 'name' ? _asc : null),
          (c) => Row(children: [
                if (on('cus2-table', 'cus2-c-photo')) ...[Avatar('${c['name']}', photo: c['avatar'], size: 34), const SizedBox(width: 10)],
                Expanded(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    '${c['name'] ?? ''}'.trim().isEmpty
                        ? const Text('No name yet', style: TextStyle(fontSize: 13, fontStyle: FontStyle.italic, color: W.g400))
                        : Text('${c['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.g900)),
                    if (on('cus2-table', 'cus2-c-joined'))
                      Text('Joined ${dateShort(c['since'])}${c['lastOrderAt'] != null ? ' · last order ${dateShort(c['lastOrderAt'])}' : ' · never ordered'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500)),
                  ]),
                ),
              ]),
        ),
      if (on('cus2-table', 'cus2-c-contact'))
        (
          const WebCol('Contact', flex: 1.6),
          (c) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [const Icon(LucideIcons.phone, size: 13, color: W.g400), const SizedBox(width: 6), Flexible(child: Text('${c['phone'] ?? 'No phone'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: c['phone'] == null ? W.g400 : W.g800)))]),
                Row(children: [const Icon(LucideIcons.mail, size: 12, color: W.g400), const SizedBox(width: 6), Flexible(child: Text('${c['email'] ?? 'No email'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c['email'] == null ? W.g400 : W.g500)))]),
              ]),
        ),
      if (on('cus2-table', 'cus2-c-type'))
        (const WebCol('Type', flex: .8), (c) => Align(alignment: Alignment.centerLeft, child: walkIn(c) ? const WebBadge('Store', color: Color(0xFFB45309), bg: Color(0xFFFFFBEB)) : const WebBadge('Online', color: Color(0xFF6D28D9), bg: Color(0xFFF5F3FF)))),
      if (on('cus2-table', 'cus2-c-orders')) (WebCol('Orders', flex: .7, onSort: () => _sortBy('orders'), sorted: _sort == 'orders' ? _asc : null), (c) => Text('${orders(c)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.g900))),
      if (on('cus2-table', 'cus2-c-spent')) (WebCol('Total Spent', flex: 1, onSort: () => _sortBy('spent'), sorted: _sort == 'spent' ? _asc : null), (c) => Text(money(spent(c)), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900))),
      if (on('cus2-table', 'cus2-c-due'))
        (WebCol('Due', flex: .9, onSort: () => _sortBy('due'), sorted: _sort == 'due' ? _asc : null), (c) => toDouble(c['due']) > 0.004 ? Text(money(c['due']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFFDC3545))) : webDash),
      if (on('cus2-table', 'cus2-c-login'))
        (
          const WebCol('Login', flex: 1),
          (c) => walkIn(c)
              ? webDash
              : Wrap(spacing: 4, runSpacing: 4, children: [
                  if (c['phone'] != null) const WebBadge('OTP', color: Color(0xFF047857), bg: Color(0xFFECFDF5)),
                  if (c['hasPassword'] == true) const WebBadge('Password', color: Color(0xFF0369A1), bg: Color(0xFFF0F9FF)),
                  if (c['phone'] == null && c['hasPassword'] != true) const Text('None', style: TextStyle(fontSize: 12, color: W.g400)),
                ]),
        ),
      if (on('cus2-table', 'cus2-c-addresses')) (const WebCol('Addresses', flex: .7), (c) => Text('${toInt(c['addresses'])}', style: TextStyle(fontSize: 13, color: toInt(c['addresses']) == 0 ? W.g400 : W.g700))),
      if (on('cus2-table', 'cus2-c-status'))
        (
          const WebCol('Status', flex: .95),
          (c) => WebPillMenu(value: c['status'] == 'active' ? 'Active' : 'Inactive', options: const ['Active', 'Inactive'], color: c['status'] == 'active' ? W.green : W.grey, onSelected: s.perms.customers ? (v) => setStatus(c, v) : null),
        ),
      if (on('cus2-table', 'cus2-c-actions'))
        (
          const WebCol('Actions', width: 100),
          (c) => Row(children: [
                WebIconAction(LucideIcons.eye, color: const Color(0xFF0EA5E9), tooltip: "Open ${c['name']}'s profile", onTap: () => open(c)),
                if (s.perms.customers) WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${c['name']}', onTap: () => editCustomer(context, c)),
              ]),
        ),
    ];

    final metrics = [
      if (on('cus2-cards', 'cus2-k-total'))
        _KeyMetric(icon: LucideIcons.users, color: const Color(0xFF059669), label: 'All Customers', value: '${all.length}', sub: '${all.where((c) => c['status'] == 'active').length} active · ${all.where((c) => c['status'] != 'active').length} inactive', selected: _type == 'all' && _dues == 'all', onTap: () => _set(() {
              _type = 'all';
              _dues = 'all';
            })),
      if (on('cus2-cards', 'cus2-k-online')) _KeyMetric(icon: LucideIcons.shoppingBag, color: W.blue, label: 'Online Customers', value: '${all.where((c) => !walkIn(c)).length}', sub: 'signed up on the shop', selected: _type == 'online', onTap: () => _set(() => _type = 'online')),
      if (on('cus2-cards', 'cus2-k-offline')) _KeyMetric(icon: LucideIcons.store, color: W.blue, label: 'Store Customers', value: '${all.where(walkIn).length}', sub: 'added at the counter', selected: _type == 'offline', onTap: () => _set(() => _type = 'offline')),
      if (on('cus2-cards', 'cus2-k-dues')) _KeyMetric(icon: LucideIcons.wallet, color: const Color(0xFFF59E0B), label: 'With Dues', value: '${withDue.length}', sub: '${money(withDue.fold<double>(0, (t, c) => t + toDouble(c['due'])))} outstanding', selected: _dues == 'with', onTap: () => _set(() => _dues = 'with')),
    ];
    final filters = [
      if (on('cus2-filters', 'cus2-f-type')) WebSelect<String>(icon: LucideIcons.users, label: 'Customer Type', value: _type, options: const [('all', 'All customers'), ('online', 'Online'), ('offline', 'Store')], onChanged: (v) => _set(() => _type = v)),
      if (on('cus2-filters', 'cus2-f-status')) WebSelect<String>(icon: LucideIcons.circleCheck, label: 'Status', value: _status, options: const [('all', 'All status'), ('active', 'Active'), ('inactive', 'Inactive')], onChanged: (v) => _set(() => _status = v)),
      if (on('cus2-filters', 'cus2-f-dues')) WebSelect<String>(icon: LucideIcons.wallet, label: 'Dues', value: _dues, options: const [('all', 'All'), ('with', 'Has a due'), ('without', 'No due')], onChanged: (v) => _set(() => _dues = v)),
      if (on('cus2-filters', 'cus2-f-activity')) WebSelect<String>(icon: LucideIcons.shoppingBag, label: 'Buying', value: _buying, options: const [('all', 'All'), ('buyers', 'Bought in range'), ('never', 'Never ordered')], onChanged: (v) => _set(() => _buying = v)),
      if (on('cus2-filters', 'cus2-f-datefield'))
        WebSelect<String>(icon: LucideIcons.calendar, label: 'Date range applies to', value: _applies, options: const [('none', 'Ignore date range'), ('created', 'Joined date'), ('lastOrder', 'Last order date')], onChanged: (v) => _set(() => _applies = v)),
    ];
    final growth = WebCard(child: _Growth(customers: all, range: _range));
    final keyMetrics = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const WebCardTitle('Key Metrics', icon: LucideIcons.chartNoAxesColumn, iconColor: Color(0xFF16A34A)),
        WebGrid(columns: 2, gap: 12, minWidth: 240, children: metrics),
      ]),
    );

    return WebPage(
      title: 'Customers',
      subtitle: "Everyone who buys from the shop and the counter, with what they've spent and owe",
      onRefresh: () => s.syncNow(only: const ['customers', 'dues']),
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Customers', const ['Name', 'Phone', 'Email', 'Type', 'Orders', 'Total spent', 'Due', 'Login', 'Addresses', 'Status', 'Joined', 'Last order'], [
              for (final c in list)
                [c['name'], c['phone'], c['email'], walkIn(c) ? 'Store' : 'Online', orders(c), spent(c), toDouble(c['due']), walkIn(c) ? '' : [if (c['phone'] != null) 'OTP', if (c['hasPassword'] == true) 'Password'].join(' + '), toInt(c['addresses']), c['status'], dateShort(c['since']),
                  c['lastOrderAt'] == null ? '' : dateShort(c['lastOrderAt'])],
            ])),
        if (s.perms.customers) WebButton('Add Customer', icon: LucideIcons.plus, color: W.blue, onPressed: () => editCustomer(context, null)),
      ],
      children: [
        if (_prefs.item('cus2-chart') || (on('cus2-cards') && metrics.isNotEmpty)) ...[
          LayoutBuilder(builder: (context, box) {
            final chart = _prefs.item('cus2-chart'), cards = on('cus2-cards') && metrics.isNotEmpty;
            if (chart && cards && box.maxWidth >= 1500) return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: growth), const SizedBox(width: 20), Expanded(flex: 118, child: keyMetrics)]);
            return Column(children: [if (chart) growth, if (chart && cards) const SizedBox(height: 12), if (cards) keyMetrics]);
          }),
          const SizedBox(height: 12),
        ],
        if (_prefs.item('cus2-range')) ...[
          WebRangeBar(range: _range, presets: const ['today', '7d', 'this_month', 'prev_month', 'this_year'], onChanged: (r) => _set(() => _range = r)),
          const SizedBox(height: 12),
        ],
        if (filters.isNotEmpty) ...[
          WebCard(padding: const EdgeInsets.all(14), child: WebGrid(columns: filters.length, gap: 12, minWidth: 160, children: filters)),
          const SizedBox(height: 12),
        ],
        if (on('cus2-table'))
          WebCard(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Text('Show ', style: TextStyle(fontSize: 14, color: W.g900)),
                SizedBox(width: 90, child: WebSelect<int>(value: _per, options: const [(10, '10'), (25, '25'), (50, '50'), (100, '100'), (0, 'All')], onChanged: (v) => _set(() => _per = v))),
                const Text(' entries', style: TextStyle(fontSize: 14, color: W.g900)),
                const Spacer(),
                if (on('cus2-table', 'cus2-t-search')) ...[
                  const Text('Search:', style: TextStyle(fontSize: 13, color: W.g800)),
                  const SizedBox(width: 8),
                  WebSearch(width: 260, hint: 'Name, phone, email...', onChanged: (v) => _set(() => _q = v)),
                ],
              ]),
              const SizedBox(height: 12),
              WebTable(
                bordered: true,
                rowHeight: 68,
                cols: [for (final c in cols) c.$1],
                onRowTap: [for (final c in shown) () => open(c)],
                rows: [for (final c in shown) [for (final x in cols) x.$2(c)]],
                empty: Center(child: all.isEmpty && s.perms.customers ? TextButton(onPressed: () => editCustomer(context, null), child: const Text('No customers yet — Add Customer')) : const Text('No customers match these filters.', style: TextStyle(color: W.g500))),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text('${list.isEmpty ? 'Showing 0 entries' : 'Showing ${_per == 0 ? 1 : _page * _per + 1} to ${_per == 0 ? list.length : _page * _per + shown.length} of ${list.length} entries'}${list.length != all.length ? ' (filtered from ${all.length} total entries)' : ''}',
                    style: const TextStyle(fontSize: 14, color: W.g800)),
              ),
              if (_per > 0 && list.length > _per) WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v)),
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
                Text(label, style: const TextStyle(fontSize: 12, color: W.g800)),
                const SizedBox(height: 4),
                Text(value, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: color)),
                const SizedBox(height: 4),
                Text(sub, style: const TextStyle(fontSize: 12, color: W.g500)),
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
        const Expanded(child: Text('Customer Growth', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900))),
        for (final (c, l) in const [(Color(0xFF16A34A), 'This Period'), (W.blue, 'Previous Period')]) ...[
          Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(l, style: const TextStyle(fontSize: 13, color: W.g700)),
          const SizedBox(width: 18),
        ],
      ]),
      const SizedBox(height: 6),
      Text.rich(TextSpan(children: [
        TextSpan(text: '${now.fold<double>(0, (t, v) => t + v).toInt()}', style: const TextStyle(fontWeight: FontWeight.w700)),
        const TextSpan(text: ' joined by day'),
      ]), style: const TextStyle(fontSize: 13, color: W.g600)),
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
          style: const TextStyle(fontSize: 12, color: W.g500)),
    ]);
  }
}
