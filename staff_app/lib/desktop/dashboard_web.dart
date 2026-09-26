import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/local_store.dart';
import '../core/nav.dart';
import '../features/orders/order_actions.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/shell/shell.dart' show openSearch;
import '../widgets/web.dart';

/// "E-commerce Dashboard" as on the website: range picker, 9 stat cards,
/// Earnings & Due, Store Overview, Recent Orders and the Sales Overview chart.
/// Numbers come from the data already on this computer, so it opens instantly and offline.
class DashboardWeb extends StatefulWidget {
  const DashboardWeb({super.key});
  @override
  State<DashboardWeb> createState() => _DashboardWebState();
}

class _DashboardWebState extends State<DashboardWeb> {
  DateRange _range = DateRange.preset('today');
  Map<String, dynamic>? _dash; // /dashboard (7-day chart, today's collections)
  Map<String, dynamic>? _report; // /report kpis for the chosen range

  @override
  void initState() {
    super.initState();
    LocalStore.instance.read('dashboard').then((v) {
      if (v is Map && mounted && _dash == null) setState(() => _dash = Map<String, dynamic>.from(v));
    });
    _load();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    final r = await s.api.get('/api/app/v1/dashboard');
    if (r.ok && mounted) {
      setState(() => _dash = Map<String, dynamic>.from(r.data['dashboard']));
      LocalStore.instance.write('dashboard', _dash);
    }
    await _loadReport();
  }

  Future<void> _loadReport() async {
    final s = context.read<AppState>();
    if (!s.perms.seesReports) return;
    final k = _range.key;
    String d(DateTime x) => DateFormat('yyyy-MM-dd').format(x);
    final q = const ['today', 'yesterday', 'this_month', 'prev_month'].contains(k) ? {'range': k} : {'range': 'custom', 'from': d(_range.from), 'to': d(_range.to)};
    final r = await s.api.get('/api/app/v1/report', query: q);
    if (r.ok && mounted) setState(() => _report = Map<String, dynamic>.from(r.data['report']['kpis'] ?? {}));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final nav = context.read<NavController>();
    final p = s.perms;
    final range = _range, prev = _range.previous();
    final orders = s.list('orders');
    List<Map<String, dynamic>> online(DateRange r) => orders.where((o) => o['type'] == 'online' && r.contains(o['createdAt'])).toList();
    final now = online(range), before = online(prev);
    double? trend(num a, num b) => b == 0 ? (a == 0 ? 0 : null) : (a - b) / b * 100;
    int st(List<Map> l, String x) => l.where((o) => o['status'] == x).length;
    final customers = s.list('customers');
    int joined(DateRange r, String type) => customers.where((c) => (c['type'] ?? 'offline') == type && r.contains(c['since'])).length;
    int sold(DateRange r, String type) => orders
        .where((o) => o['type'] == type && o['status'] != 'Canceled' && r.contains(o['createdAt']))
        .fold(0, (t, o) => t + ((o['items'] as List?) ?? const []).cast<Map>().fold<int>(0, (u, i) => u + toInt(i['qty'])));
    String when = range.key == 'today' ? 'Today' : range.label;

    final cards = <Widget>[
      if (p.seesOrders) ...[
        WebStatCard(icon: FontAwesomeIcons.cartShopping.data, color: W.green, label: 'Total Orders', value: '${now.length}', trend: trend(now.length, before.length), onTap: () => nav.go('orders', {'tab': 'all'})),
        WebStatCard(icon: FontAwesomeIcons.hourglassHalf.data, color: W.primary, label: 'Pending Orders', value: '${st(now, 'Pending')}', trend: trend(st(now, 'Pending'), st(before, 'Pending')), onTap: () => nav.go('orders', {'tab': 'Pending'})),
        WebStatCard(icon: FontAwesomeIcons.peopleCarryBox.data, color: W.green, label: 'In Progress', value: '${st(now, 'In Progress')}', trend: trend(st(now, 'In Progress'), st(before, 'In Progress')), onTap: () => nav.go('orders', {'tab': 'In Progress'})),
        WebStatCard(icon: FontAwesomeIcons.circleCheck.data, color: W.primary, label: 'Delivered Orders', value: '${st(now, 'Delivered')}', trend: trend(st(now, 'Delivered'), st(before, 'Delivered')), onTap: () => nav.go('orders', {'tab': 'Delivered'})),
        WebStatCard(icon: FontAwesomeIcons.ban.data, color: W.red, label: 'Canceled Orders', value: '${st(now, 'Canceled')}', trend: trend(st(now, 'Canceled'), st(before, 'Canceled')), onTap: () => nav.go('orders', {'tab': 'Canceled'})),
      ],
      if (p.seesCustomers) ...[
        WebStatCard(icon: FontAwesomeIcons.users.data, color: W.primary, label: 'Total Online Customers', value: '${joined(range, 'online')}', trend: trend(joined(range, 'online'), joined(prev, 'online')), onTap: () => nav.go('customers')),
        WebStatCard(icon: FontAwesomeIcons.userPlus.data, color: W.green, label: 'Total Offline Customers', value: '${joined(range, 'offline')}', trend: trend(joined(range, 'offline'), joined(prev, 'offline')), onTap: () => nav.go('customers')),
      ],
      if (p.seesPos || p.seesReports)
        WebStatCard(icon: FontAwesomeIcons.store.data, color: W.primary, label: '$when Store Sold Product', value: '${sold(range, 'offline')}', trend: trend(sold(range, 'offline'), sold(prev, 'offline')),
            onTap: p.seesReports ? () => nav.go('reports', {'range': range.key == 'today' ? 'today' : 'this_month'}) : null),
      if (p.seesOrders)
        WebStatCard(icon: FontAwesomeIcons.globe.data, color: W.green, label: '$when Online Sold Product', value: '${sold(range, 'online')}', trend: trend(sold(range, 'online'), sold(prev, 'online')), onTap: () => nav.go('orders', {'tab': 'all'})),
    ];

    // Agents and other roles without orders: their own numbers from /dashboard.
    final agent = _dash?['agent'] as Map?;
    if (agent != null) {
      cards.addAll([
        WebStatCard(icon: FontAwesomeIcons.motorcycle.data, color: W.cyan, label: 'To Deliver', value: '${agent['active']}', showTrend: false, onTap: () => nav.go('deliveries')),
        WebStatCard(icon: FontAwesomeIcons.solidTruck.data, color: W.indigo, label: 'On the Way', value: '${agent['onTheWay']}', showTrend: false, onTap: () => nav.go('deliveries')),
        WebStatCard(icon: FontAwesomeIcons.circleCheck.data, color: W.green, label: 'Delivered Today', value: '${agent['deliveredToday']}', showTrend: false, onTap: () => nav.go('deliveries', {'done': true})),
        WebStatCard(icon: FontAwesomeIcons.coins.data, color: W.yellow, label: 'Cash to Collect', value: money(agent['toCollect']), showTrend: false, onTap: () => nav.go('deliveries')),
      ]);
    }

    // Earnings & Due for the range.
    final saleOrders = orders.where((o) => range.contains(o['createdAt']) && o['status'] != 'Canceled' && (o['type'] == 'offline' || o['status'] == 'Delivered'));
    final localEarn = saleOrders.fold<double>(0, (t, o) => t + toDouble(o['total']));
    final localDue = orders.where((o) => range.contains(o['createdAt'])).fold<double>(0, (t, o) => t + toDouble(o['due']));
    final pendingPay = now.where((o) => o['paymentStatus'] != 'Paid' && o['status'] != 'Canceled').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final k = _report;
    final collected = k != null ? toDouble(k['collected']) : (range.key == 'today' ? toDouble((_dash?['dues'] as Map?)?['collectedToday']) : null);
    final showMoney = p.seesPos || p.seesReports || p.seesDues;

    Widget moneyBox(IconData icon, Color c, String label, String value) => Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(width: 30, height: 30, decoration: BoxDecoration(color: c.withValues(alpha: .1), borderRadius: BorderRadius.circular(6)), child: Icon(icon, size: 14, color: c)),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: const TextStyle(fontSize: 13.5, color: W.g600))),
            ]),
            const SizedBox(height: 12),
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: W.g900)),
          ]),
        );

    Widget overviewBox(IconData icon, Color c, String label, int n, VoidCallback? onTap) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 48, height: 48, decoration: BoxDecoration(color: c.withValues(alpha: .1), borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 20, color: c)),
              const SizedBox(height: 14),
              Text(label, style: const TextStyle(fontSize: 14, color: W.g600)),
              Text('$n', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c)),
            ]),
          ),
        );

    final earnings = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        WebCardTitle('Earnings & Due ($when)', icon: FontAwesomeIcons.indianRupeeSign.data, iconColor: W.green),
        WebGrid(columns: 2, gap: 16, minWidth: 180, children: [
          moneyBox(FontAwesomeIcons.coins.data, W.green, 'Earnings ($when)', money(k != null ? toDouble(k['sales']) : localEarn)),
          moneyBox(FontAwesomeIcons.clock.data, W.primary, 'Due ($when)', money(k != null ? toDouble(k['due']) : localDue)),
          moneyBox(FontAwesomeIcons.creditCard.data, W.green, 'Payment Received', collected == null ? '—' : money(collected)),
          moneyBox(FontAwesomeIcons.clock.data, W.primary, 'Pending Payment', money(pendingPay)),
        ]),
      ]),
    );

    final activeCoupons = s.list('coupons').length;
    final overview = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        WebCardTitle('Store Overview', icon: FontAwesomeIcons.chartSimple.data),
        WebGrid(columns: 2, gap: 16, minWidth: 120, children: [
          overviewBox(FontAwesomeIcons.cube.data, W.green, 'Products', s.list('products').length, p.seesProducts ? () => nav.go('products') : null),
          overviewBox(FontAwesomeIcons.tableCellsLarge.data, W.primary, 'Categories', s.list('categories').length, p.categories ? () => nav.go('categories') : null),
          overviewBox(FontAwesomeIcons.tag.data, W.primary, 'Brands', s.list('brands').length, null),
          overviewBox(FontAwesomeIcons.ticket.data, W.green, 'Active Coupons', activeCoupons, null),
        ]),
      ]),
    );

    final recentList = orders.where((o) => o['type'] == 'online').take(6).toList();
    final recent = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        WebCardTitle('Recent Orders', icon: FontAwesomeIcons.fileLines.data, onViewAll: () => nav.go('orders', {'tab': 'all'})),
        WebTable(
          cols: const [WebCol('Order #', flex: 1.2), WebCol('Customer', flex: 1.3), WebCol('Total'), WebCol('Payment'), WebCol('Status', flex: 1.4), WebCol('Date', flex: .9)],
          rowHeight: 50,
          onRowTap: [for (final o in recentList) () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))))],
          rows: [
            for (final o in recentList)
              [
                Text('${o['number']}', style: const TextStyle(color: W.primary, fontWeight: FontWeight.w600, fontSize: 14)),
                Text('${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14)),
                Text(money(o['total']), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                WebPillMenu(value: o['paymentStatus'] == 'Paid' ? 'Paid' : 'Unpaid', options: const ['Unpaid', 'Paid'],
                    onSelected: o['paymentStatus'] != 'Paid' && o['status'] != 'Canceled' && p.markPaid ? (_) => markOrderPaid(context, o) : null),
                WebPillMenu(value: '${o['status']}', options: statusChoices(p, o), onSelected: (v) => setOrderStatus(context, o, v)),
                Text(DateFormat('d MMM').format(ist(DateTime.parse('${o['createdAt']}'))), style: const TextStyle(fontSize: 14, color: W.g600)),
              ],
          ],
          empty: const Center(child: Text('No orders yet.', style: TextStyle(color: W.g500))),
        ),
      ]),
    );

    final week = ((_dash?['sales'] as Map?)?['week'] as List?)?.cast<Map>();
    final chart = week == null
        ? null
        : WebCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              WebCardTitle('Sales Overview', icon: FontAwesomeIcons.chartLine.data, onViewAll: p.seesReports ? () => nav.go('reports', {'range': 'this_month'}) : null),
              SizedBox(height: 230, child: _SalesLine(week: week)),
            ]),
          );

    Widget pair(Widget a, Widget? b, int fa, int fb) => b == null
        ? a
        : LayoutBuilder(builder: (c, box) => box.maxWidth < 900
            ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [a, const SizedBox(height: 24), b])
            : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: fa, child: a), const SizedBox(width: 24), Expanded(flex: fb, child: b)]));

    return WebPage(
      title: 'E-commerce Dashboard',
      subtitle: 'A live overview of your store',
      onRefresh: () async => Future.wait([_load(), s.syncNow()]),
      actions: [
        WebSelect<String>(
          width: 150,
          icon: LucideIcons.calendar,
          value: range.key,
          options: const [('today', 'Today'), ('yesterday', 'Yesterday'), ('7d', '7 Days'), ('this_month', 'This Month'), ('prev_month', 'Previous Month'), ('this_year', 'This Year')],
          onChanged: (v) {
            setState(() {
              _range = DateRange.preset(v);
              _report = null;
            });
            _loadReport();
          },
        ),
        InkWell(
          onTap: () => openSearch(context),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            width: 230,
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
            child: const Row(children: [
              Icon(LucideIcons.search, size: 16, color: W.g400),
              SizedBox(width: 8),
              Expanded(child: Text('Order ID, receipt no., name…', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: W.g400, fontSize: 14))),
            ]),
          ),
        ),
      ],
      children: [
        if (!s.online)
          Container(
            margin: const EdgeInsets.only(bottom: 20),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFECACA))),
            child: const Row(children: [
              Icon(LucideIcons.cloudOff, color: Color(0xFFB91C1C), size: 18),
              SizedBox(width: 10),
              Expanded(child: Text("You're offline — keep working. Everything is saved on this computer and sent when you're back online.", style: TextStyle(color: Color(0xFF991B1B)))),
            ]),
          ),
        if (cards.isNotEmpty) WebGrid(gap: 20, minWidth: 220, children: cards),
        if (showMoney || p.seesProducts) ...[
          const SizedBox(height: 24),
          pair(showMoney ? earnings : overview, showMoney ? overview : null, 3, 2),
        ],
        if (p.seesOrders || chart != null) ...[
          const SizedBox(height: 24),
          pair(p.seesOrders ? recent : chart!, p.seesOrders ? chart : null, 3, 2),
        ],
      ],
    );
  }
}

/// Smooth purple line with a soft fill (the website's Sales Overview).
class _SalesLine extends StatelessWidget {
  final List<Map> week;
  const _SalesLine({required this.week});
  @override
  Widget build(BuildContext context) {
    final values = [for (final d in week) toDouble(d['sales'])];
    final maxY = values.fold<double>(0, (m, v) => v > m ? v : m);
    final top = maxY <= 0 ? 100.0 : maxY * 1.25;
    return LineChart(LineChartData(
      minY: 0,
      maxY: top,
      gridData: FlGridData(drawVerticalLine: false, horizontalInterval: top / 4, getDrawingHorizontalLine: (_) => const FlLine(color: W.g100, strokeWidth: 1)),
      borderData: FlBorderData(show: true, border: const Border(left: BorderSide(color: W.g200), bottom: BorderSide(color: W.g200))),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(),
        rightTitles: const AxisTitles(),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 48,
            interval: top / 4,
            getTitlesWidget: (v, m) => Text(v == 0 ? '₹0' : '₹${moneyCompact(v).replaceAll('₹', '')}', style: const TextStyle(fontSize: 11, color: W.g500)),
          ),
        ),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            interval: 1,
            getTitlesWidget: (v, m) {
              final i = v.round();
              if (i < 0 || i >= week.length || v != i.toDouble()) return const SizedBox();
              return Padding(padding: const EdgeInsets.only(top: 6), child: Text(DateFormat('EEE').format(DateTime.parse('${week[i]['day']}')), style: const TextStyle(fontSize: 12, color: W.g500)));
            },
          ),
        ),
      ),
      lineTouchData: LineTouchData(touchTooltipData: LineTouchTooltipData(getTooltipItems: (spots) => [for (final s in spots) LineTooltipItem(money(s.y), const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))])),
      lineBarsData: [
        LineChartBarData(
          spots: [for (var i = 0; i < values.length; i++) FlSpot(i.toDouble(), values[i])],
          isCurved: true,
          preventCurveOverShooting: true,
          color: W.primary,
          barWidth: 2.5,
          dotData: const FlDotData(show: false),
          belowBarData: BarAreaData(show: true, gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [W.primary.withValues(alpha: .18), W.primary.withValues(alpha: 0)])),
        ),
      ],
    ));
  }
}
