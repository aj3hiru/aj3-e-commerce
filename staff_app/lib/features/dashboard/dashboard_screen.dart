import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../account/sync_center.dart';
import '../orders/order_detail_screen.dart';

/// Home: the numbers this role cares about, a 7-day sales chart and recent orders.
/// The last numbers are kept on the device, so it opens instantly and offline.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _d;
  bool _loading = false;
  DateTime? _at;

  @override
  void initState() {
    super.initState();
    LocalStore.instance.read('dashboard').then((v) {
      if (v is Map && mounted && _d == null) setState(() => _d = Map<String, dynamic>.from(v));
    });
    _load();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    setState(() => _loading = true);
    final r = await s.api.get('/api/app/v1/dashboard');
    if (!mounted) return;
    setState(() => _loading = false);
    if (r.ok) {
      final d = Map<String, dynamic>.from(r.data['dashboard']);
      setState(() {
        _d = d;
        _at = DateTime.now().toUtc();
      });
      LocalStore.instance.write('dashboard', d);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final d = _d ?? {};
    final name = (s.user?['name'] as String? ?? '').split(' ').first;
    final wide = isWide(context);
    final hour = ist(DateTime.now().toUtc()).hour;
    final greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    final sales = d['sales'] as Map?;
    final orders = d['orders'] as Map?;
    final dues = d['dues'] as Map?;
    final stock = d['stock'] as Map?;
    final agent = d['agent'] as Map?;
    final waiting = s.list('orders').where((o) => o['localRef'] != null).length;

    final tiles = <Widget>[
      if (sales != null) KpiTile(icon: Icons.currency_rupee_rounded, label: "Today's sales", value: money(sales['today']), sub: '${sales['count']} bills · store ${moneyShort(sales['store'])} · online ${moneyShort(sales['online'])}'),
      if (orders != null) ...[
        KpiTile(icon: Icons.hourglass_top_rounded, label: 'New orders waiting', value: '${orders['pending']}', sub: '${orders['placedToday']} placed today', color: AppColors.amber, soft: AppColors.amberSoft),
        KpiTile(icon: Icons.inventory_rounded, label: 'Being prepared', value: '${orders['inProgress']}', color: AppColors.blue, soft: AppColors.blueSoft),
        KpiTile(icon: Icons.local_shipping_outlined, label: 'On the way', value: '${orders['outForDelivery']}', color: AppColors.cyan, soft: AppColors.cyanSoft),
      ],
      if (dues != null) ...[
        KpiTile(icon: Icons.account_balance_wallet_outlined, label: 'Dues outstanding', value: money(dues['outstanding']), sub: '${dues['open']} open', color: AppColors.red, soft: AppColors.redSoft),
        KpiTile(icon: Icons.savings_outlined, label: 'Due collected today', value: money(dues['collectedToday']), sub: '${dues['collections']} payments', color: AppColors.green, soft: AppColors.greenSoft),
      ],
      if (stock != null) ...[
        KpiTile(icon: Icons.warning_amber_rounded, label: 'Low stock', value: '${stock['low']}', sub: '${stock['out']} out of stock', color: AppColors.amber, soft: AppColors.amberSoft),
        KpiTile(icon: Icons.inventory_2_outlined, label: 'Active products', value: '${stock['products']}'),
      ],
      if (agent != null) ...[
        KpiTile(icon: Icons.two_wheeler_rounded, label: 'My deliveries', value: '${agent['active']}', sub: '${agent['onTheWay']} on the way', color: AppColors.cyan, soft: AppColors.cyanSoft),
        KpiTile(icon: Icons.task_alt_rounded, label: 'Delivered today', value: '${agent['deliveredToday']}', color: AppColors.green, soft: AppColors.greenSoft),
        KpiTile(icon: Icons.payments_outlined, label: 'Cash to collect', value: money(agent['toCollect']), color: AppColors.amber, soft: AppColors.amberSoft),
      ],
    ];

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$greet, $name', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text(s.user?['roleLabel'] ?? '', style: const TextStyle(fontSize: 12.5, color: AppColors.muted, fontWeight: FontWeight.w500)),
        ]),
        actions: [
          Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter())))),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await Future.wait([_load(), s.syncNow()]);
        },
        child: PageBody(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            if (!s.online) _Banner(icon: Icons.cloud_off_rounded, text: 'You are offline. You can keep working — everything is saved on this device and sent when you are back online.', color: AppColors.red, soft: AppColors.redSoft),
            if (waiting > 0) _Banner(icon: Icons.cloud_upload_outlined, text: '$waiting bill(s) made offline are waiting to upload.', color: AppColors.amber, soft: AppColors.amberSoft),
            if (_d == null && _loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (tiles.isNotEmpty)
              LayoutBuilder(builder: (c, box) {
                final cols = box.maxWidth > 1100 ? 4 : box.maxWidth > 700 ? 3 : 2;
                return GridView(
                  shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: cols, mainAxisSpacing: 12, crossAxisSpacing: 12, mainAxisExtent: cols == 2 ? 150 : 100),
                  children: tiles,
                );
              }),
            const SizedBox(height: 16),
            if (sales != null && sales['week'] is List) ...[
              wide
                  ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(flex: 3, child: _WeekChart(week: List<Map>.from(sales['week']))),
                      const SizedBox(width: 16),
                      if (orders != null) Expanded(flex: 2, child: _Recent(orders: List<Map>.from(orders['recent'] ?? []))),
                    ])
                  : Column(children: [
                      _WeekChart(week: List<Map>.from(sales['week'])),
                      const SizedBox(height: 16),
                      if (orders != null) _Recent(orders: List<Map>.from(orders['recent'] ?? [])),
                    ]),
            ] else if (orders != null)
              _Recent(orders: List<Map>.from(orders['recent'] ?? [])),
            if (_d != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_at == null ? 'Showing saved numbers${s.online ? ' — updating…' : ' (offline)'}' : 'Updated ${ago(_at)}',
                    textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
              ),
          ]),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color, soft;
  const _Banner({required this.icon, required this.text, required this.color, required this.soft});
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [Icon(icon, color: color, size: 20), const SizedBox(width: 10), Expanded(child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w500)))]),
      );
}

class _WeekChart extends StatelessWidget {
  final List<Map> week;
  const _WeekChart({required this.week});
  @override
  Widget build(BuildContext context) {
    final maxY = week.fold<double>(0, (m, x) => toDouble(x['sales']) > m ? toDouble(x['sales']) : m);
    final total = week.fold<double>(0, (t, x) => t + toDouble(x['sales']));
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SectionTitle('Last 7 days', icon: Icons.bar_chart_rounded, trailing: Text(money(total), style: const TextStyle(fontWeight: FontWeight.w700))),
        SizedBox(
          height: 200,
          child: BarChart(BarChartData(
            maxY: maxY <= 0 ? 100 : maxY * 1.15,
            gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.border, strokeWidth: 1)),
            borderData: FlBorderData(show: false),
            titlesData: FlTitlesData(
              topTitles: const AxisTitles(), rightTitles: const AxisTitles(),
              leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 44, getTitlesWidget: (v, m) => Text(moneyCompact(v), style: const TextStyle(fontSize: 10, color: AppColors.faint)))),
              bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (v, m) {
                final i = v.toInt();
                if (i < 0 || i >= week.length) return const SizedBox();
                final d = DateTime.tryParse('${week[i]['day']}');
                const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                return Padding(padding: const EdgeInsets.only(top: 6), child: Text(d == null ? '' : days[d.weekday - 1], style: const TextStyle(fontSize: 11, color: AppColors.muted)));
              })),
            ),
            barTouchData: BarTouchData(touchTooltipData: BarTouchTooltipData(getTooltipItem: (g, gi, rod, ri) => BarTooltipItem('${money(rod.toY)}\n${week[g.x]['orders']} bills', const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)))),
            barGroups: [
              for (var i = 0; i < week.length; i++)
                BarChartGroupData(x: i, barRods: [BarChartRodData(toY: toDouble(week[i]['sales']), width: 18, borderRadius: BorderRadius.circular(6), color: i == week.length - 1 ? AppColors.primary : const Color(0xFFC4B5FD))]),
            ],
          )),
        ),
      ]),
    );
  }
}

class _Recent extends StatelessWidget {
  final List<Map> orders;
  const _Recent({required this.orders});
  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SectionTitle('Recent online orders', icon: Icons.receipt_long_rounded),
          if (orders.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No orders yet.', style: TextStyle(color: AppColors.muted))),
          for (final o in orders)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id'])))),
              title: Text('${o['number']} · ${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(ago(o['createdAt'])),
              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 3),
                StatusChip('${o['status']}'),
              ]),
            ),
        ]),
      );
}
