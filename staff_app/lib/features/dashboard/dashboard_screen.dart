import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/nav.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../account/sync_center.dart';
import '../customers/customers_screen.dart';
import '../dues/collect_sheet.dart';
import '../orders/order_detail_screen.dart';
import '../products/product_edit_screen.dart';
import '../shell/shell.dart' show openSearch;

/// Home: every number opens the screen behind it. The last numbers are kept on
/// the device, so it opens instantly and offline.
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
    final nav = context.read<NavController>();
    final p = s.perms;
    final d = _d ?? {};
    final wide = isWide(context);
    final sales = d['sales'] as Map?;
    final orders = d['orders'] as Map?;
    final dues = d['dues'] as Map?;
    final stock = d['stock'] as Map?;
    final agent = d['agent'] as Map?;
    final name = (s.user?['name'] as String? ?? '').split(' ').first;
    final hour = ist(DateTime.now().toUtc()).hour;
    final greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    final offlineBills = s.list('orders').where((o) => o['localRef'] != null).length;
    double? trend(num? now, num? before) => before == null || before == 0 ? null : ((now ?? 0) - before) / before * 100;

    // ── quick actions ──
    final actions = <(IconData, String, VoidCallback)>[
      if (p.seesPos) (Icons.point_of_sale_rounded, 'New bill', () => nav.go('pos')),
      if (p.products) (Icons.add_box_rounded, 'Add product', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProductEditScreen()))),
      if (p.seesDues) (Icons.savings_rounded, 'Collect due', () => nav.go('dues')),
      if (p.customers) (Icons.person_add_alt_1_rounded, 'Add customer', () => editCustomer(context, null)),
      if (p.seesMyDeliveries) (Icons.two_wheeler_rounded, 'My deliveries', () => nav.go('deliveries')),
      if (p.seesOrders) (Icons.receipt_long_rounded, 'Orders', () => nav.go('orders', {'tab': 'Pending'})),
      if (p.seesReports) (Icons.insert_chart_rounded, 'Reports', () => nav.go('reports', {'range': 'today'})),
      (Icons.search_rounded, 'Search', () => openSearch(context)),
    ];

    // ── number cards, each opening its screen ──
    final tiles = <Widget>[
      if (sales != null)
        KpiTile(icon: Icons.currency_rupee_rounded, label: "Today's sales", value: money(sales['today']), sub: '${sales['count']} bills', trend: trend(sales['today'], sales['yesterday']),
            onTap: p.seesReports ? () => nav.go('reports', {'range': 'today'}) : null),
      if (orders != null) ...[
        KpiTile(icon: Icons.notifications_active_outlined, label: 'New orders', value: '${orders['pending']}', sub: '${orders['placedToday']} placed today', color: AppColors.amber, soft: AppColors.amberSoft, onTap: () => nav.go('orders', {'tab': 'Pending'})),
        KpiTile(icon: Icons.inventory_rounded, label: 'Being prepared', value: '${orders['inProgress']}', sub: 'Accepted, not sent yet', color: AppColors.blue, soft: AppColors.blueSoft, onTap: () => nav.go('orders', {'tab': 'In Progress'})),
        KpiTile(icon: Icons.local_shipping_outlined, label: 'On the way', value: '${orders['outForDelivery']}', sub: 'With delivery agents', color: AppColors.cyan, soft: AppColors.cyanSoft,
            onTap: () => p.deliveryBoard ? nav.go('board') : nav.go('orders', {'tab': 'Out for Delivery'})),
      ],
      if (dues != null) ...[
        KpiTile(icon: Icons.account_balance_wallet_outlined, label: 'Dues outstanding', value: money(dues['outstanding']), sub: '${dues['open']} open bills', color: AppColors.red, soft: AppColors.redSoft, onTap: () => nav.go('dues')),
        KpiTile(icon: Icons.savings_outlined, label: 'Collected today', value: money(dues['collectedToday']), sub: '${dues['collections']} payments', color: AppColors.green, soft: AppColors.greenSoft,
            onTap: p.seesReports ? () => nav.go('reports', {'range': 'today'}) : () => nav.go('dues')),
      ],
      if (stock != null) ...[
        KpiTile(icon: Icons.warning_amber_rounded, label: 'Low stock', value: '${stock['low']}', sub: '5 or fewer left', color: AppColors.amber, soft: AppColors.amberSoft, onTap: () => nav.go('products', {'filter': 'low'})),
        KpiTile(icon: Icons.remove_shopping_cart_outlined, label: 'Out of stock', value: '${stock['out']}', sub: 'of ${stock['products']} products', color: AppColors.pink, soft: AppColors.pinkSoft, onTap: () => nav.go('products', {'filter': 'out'})),
      ],
      if (agent != null) ...[
        KpiTile(icon: Icons.two_wheeler_rounded, label: 'To deliver', value: '${agent['active']}', sub: '${agent['onTheWay']} on the way', color: AppColors.cyan, soft: AppColors.cyanSoft, onTap: () => nav.go('deliveries')),
        KpiTile(icon: Icons.task_alt_rounded, label: 'Delivered today', value: '${agent['deliveredToday']}', color: AppColors.green, soft: AppColors.greenSoft, onTap: () => nav.go('deliveries', {'done': true})),
        KpiTile(icon: Icons.payments_outlined, label: 'Cash to collect', value: money(agent['toCollect']), sub: 'From your customers', color: AppColors.amber, soft: AppColors.amberSoft, onTap: () => nav.go('deliveries')),
      ],
    ];

    final hero = HeroHeader(
      title: '$greet, $name',
      subtitle: '${DateFormat('EEEE, d MMMM').format(ist(DateTime.now().toUtc()))} · ${s.user?['roleLabel'] ?? ''}',
      trailing: _HeroSync(online: s.online, pending: s.pending, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()))),
      bottom: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final (icon, label, onTap) in actions)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Material(
                color: Colors.white.withValues(alpha: .14),
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: onTap,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(icon, color: Colors.white, size: 19),
                      const SizedBox(width: 8),
                      Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13.5)),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
      ),
    );

    final cols = wide ? (MediaQuery.sizeOf(context).width > 1350 ? 4 : 3) : 2;
    final grid = tiles.isEmpty
        ? const SizedBox.shrink()
        : GridView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: cols, mainAxisSpacing: 12, crossAxisSpacing: 12, mainAxisExtent: wide ? 104 : 148),
            children: tiles,
          );

    final chart = sales != null && sales['week'] is List ? _WeekChart(week: List<Map>.from(sales['week'])) : null;
    final pipeline = orders != null ? _Pipeline(orders: orders, deliveredToday: s.list('orders').where((o) => o['type'] == 'online' && o['status'] == 'Delivered' && o['deliveredAt'] != null && dateShort(o['deliveredAt']) == dateShort(DateTime.now().toUtc())).length) : null;
    final recent = orders != null ? _Recent(orders: List<Map>.from(orders['recent'] ?? [])) : null;
    final lowStock = stock != null && (stock['lowList'] as List?)?.isNotEmpty == true ? _LowStock(items: List<Map>.from(stock['lowList'])) : null;
    final topDues = dues != null && (dues['top'] as List?)?.isNotEmpty == true ? _TopDues(items: List<Map>.from(dues['top'])) : null;
    final best = sales != null && ((sales['top'] as List?)?.isNotEmpty == true || (sales['methods'] as List?)?.isNotEmpty == true)
        ? _BestSellers(top: List<Map>.from(sales['top'] ?? []), methods: List<Map>.from(sales['methods'] ?? []))
        : null;
    final panels = <Widget>[?recent, ?lowStock, ?topDues, ?best];

    Widget pair(Widget? a, Widget? b, {int fa = 1, int fb = 1}) {
      if (a == null && b == null) return const SizedBox.shrink();
      if (a == null || b == null || !wide) return Column(children: [?a, if (a != null && b != null) const SizedBox(height: 14), ?b]);
      return IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(flex: fa, child: a), const SizedBox(width: 14), Expanded(flex: fb, child: b)]));
    }

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => Future.wait([_load(), s.syncNow()]),
          child: PageBody(
            maxWidth: 1400,
            child: ListView(padding: EdgeInsets.all(wide ? 22 : 14), children: [
              hero,
              const SizedBox(height: 16),
              if (!s.online) _Banner(icon: Icons.cloud_off_rounded, text: "You're offline — keep working. Everything is saved on this device and sent when you're back online.", color: AppColors.red, soft: AppColors.redSoft),
              if (offlineBills > 0) _Banner(icon: Icons.cloud_upload_outlined, text: '$offlineBills bill(s) made offline are waiting to upload.', color: AppColors.amber, soft: AppColors.amberSoft),
              if (_d == null && _loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
              grid,
              if (chart != null || pipeline != null) ...[const SizedBox(height: 14), pair(chart, pipeline, fa: 3, fb: 2)],
              if (panels.isNotEmpty) ...[
                const SizedBox(height: 14),
                if (wide)
                  for (var i = 0; i < panels.length; i += 2) ...[pair(panels[i], i + 1 < panels.length ? panels[i + 1] : null), const SizedBox(height: 14)]
                else
                  for (final w in panels) ...[w, const SizedBox(height: 14)],
              ],
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 8),
                child: Text(_d == null ? '' : _at == null ? 'Showing saved numbers${s.online ? ' — updating…' : ' (offline)'}' : 'Updated ${ago(_at)} · pull down to refresh',
                    textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _HeroSync extends StatelessWidget {
  final bool online;
  final int pending;
  final VoidCallback onTap;
  const _HeroSync({required this.online, required this.pending, required this.onTap});
  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .16), borderRadius: BorderRadius.circular(20)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: online ? const Color(0xFF4ADE80) : const Color(0xFFFCA5A5))),
            const SizedBox(width: 7),
            Text(online ? (pending > 0 ? 'Sending $pending' : 'Live') : 'Offline', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5)),
          ]),
        ),
      );
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
        decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(14)),
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
    final nav = context.read<NavController>();
    return SectionCard(
      title: 'Sales · last 7 days',
      icon: Icons.bar_chart_rounded,
      onViewAll: context.read<AppState>().perms.seesReports ? () => nav.go('reports', {'range': 'this_month'}) : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(money(total), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        Text('${week.fold<int>(0, (t, x) => t + toInt(x['orders']))} bills this week', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        const SizedBox(height: 14),
        SizedBox(
          height: 190,
          child: BarChart(BarChartData(
            maxY: maxY <= 0 ? 100 : maxY * 1.18,
            gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.border, strokeWidth: 1, dashArray: [4, 4])),
            borderData: FlBorderData(show: false),
            titlesData: FlTitlesData(
              topTitles: const AxisTitles(), rightTitles: const AxisTitles(),
              leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 46, getTitlesWidget: (v, m) => v >= m.max ? const SizedBox.shrink() : Text(moneyCompact(v), style: const TextStyle(fontSize: 10, color: AppColors.faint)))),
              bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (v, m) {
                final i = v.toInt();
                if (i < 0 || i >= week.length) return const SizedBox();
                final d = DateTime.tryParse('${week[i]['day']}');
                return Padding(padding: const EdgeInsets.only(top: 6), child: Text(d == null ? '' : (i == week.length - 1 ? 'Today' : DateFormat('EEE').format(d)), style: TextStyle(fontSize: 11, color: i == week.length - 1 ? AppColors.primary : AppColors.muted, fontWeight: i == week.length - 1 ? FontWeight.w700 : FontWeight.w500)));
              })),
            ),
            barTouchData: BarTouchData(touchTooltipData: BarTouchTooltipData(getTooltipColor: (_) => AppColors.text, getTooltipItem: (g, gi, rod, ri) => BarTooltipItem('${money(rod.toY)}\n${week[g.x]['orders']} bills', const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)))),
            barGroups: [
              for (var i = 0; i < week.length; i++)
                BarChartGroupData(x: i, barRods: [
                  BarChartRodData(
                    toY: toDouble(week[i]['sales']), width: 20, borderRadius: BorderRadius.circular(7),
                    gradient: i == week.length - 1 ? AppColors.heroGradient : const LinearGradient(colors: [Color(0xFFDDD6FE), Color(0xFFC4B5FD)], begin: Alignment.bottomCenter, end: Alignment.topCenter),
                    backDrawRodData: BackgroundBarChartRodData(show: true, toY: maxY <= 0 ? 100 : maxY * 1.18, color: const Color(0xFFF6F5FC)),
                  ),
                ]),
            ],
          )),
        ),
      ]),
    );
  }
}

/// Online orders flowing through the day: waiting → preparing → on the way → delivered.
class _Pipeline extends StatelessWidget {
  final Map orders;
  final int deliveredToday;
  const _Pipeline({required this.orders, required this.deliveredToday});
  @override
  Widget build(BuildContext context) {
    final nav = context.read<NavController>();
    final rows = [
      ('New', toInt(orders['pending']), AppColors.amber, 'Pending'),
      ('Preparing', toInt(orders['inProgress']), AppColors.blue, 'In Progress'),
      ('On the way', toInt(orders['outForDelivery']), AppColors.cyan, 'Out for Delivery'),
      ('Delivered today', deliveredToday, AppColors.green, 'Delivered'),
    ];
    final total = rows.fold<int>(0, (t, r) => t + r.$2);
    return SectionCard(
      title: 'Online orders now',
      icon: Icons.route_rounded,
      onViewAll: () => nav.go('orders', {'tab': 'all'}),
      child: Column(children: [
        SizedBox(
          height: 120,
          child: Row(children: [
            SizedBox(
              width: 120,
              child: Stack(alignment: Alignment.center, children: [
                PieChart(PieChartData(
                  centerSpaceRadius: 38, sectionsSpace: 2, startDegreeOffset: -90,
                  sections: total == 0
                      ? [PieChartSectionData(value: 1, color: const Color(0xFFEDEDF4), radius: 16, showTitle: false)]
                      : [for (final r in rows) if (r.$2 > 0) PieChartSectionData(value: r.$2.toDouble(), color: r.$3, radius: 16, showTitle: false)],
                )),
                Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('$total', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                  const Text('orders', style: TextStyle(fontSize: 11, color: AppColors.muted)),
                ]),
              ]),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (final r in rows)
                  InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => nav.go('orders', {'tab': r.$4}),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                      child: Row(children: [
                        Container(width: 9, height: 9, decoration: BoxDecoration(color: r.$3, shape: BoxShape.circle)),
                        const SizedBox(width: 8),
                        Expanded(child: Text(r.$1, style: const TextStyle(fontSize: 13))),
                        Text('${r.$2}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                    ),
                  ),
              ]),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _Recent extends StatelessWidget {
  final List<Map> orders;
  const _Recent({required this.orders});
  @override
  Widget build(BuildContext context) => SectionCard(
        title: 'Recent online orders',
        icon: Icons.receipt_long_rounded,
        onViewAll: () => context.read<NavController>().go('orders', {'tab': 'all'}),
        child: orders.isEmpty
            ? const Padding(padding: EdgeInsets.all(8), child: Text('No orders yet.', style: TextStyle(color: AppColors.muted)))
            : Column(children: [
                for (final o in orders.take(6))
                  InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id'])))),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
                      child: Row(children: [
                        Avatar('${o['customer']}', size: 36),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text('${o['number']} · ${ago(o['createdAt'])}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                          ]),
                        ),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 3),
                          StatusChip('${o['status']}'),
                        ]),
                      ]),
                    ),
                  ),
              ]),
      );
}

class _LowStock extends StatelessWidget {
  final List<Map> items;
  const _LowStock({required this.items});
  @override
  Widget build(BuildContext context) {
    final s = context.read<AppState>();
    return SectionCard(
      title: 'Running low',
      icon: Icons.warning_amber_rounded,
      onViewAll: () => context.read<NavController>().go('products', {'filter': 'low'}),
      child: Column(children: [
        for (final p in items)
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: s.perms.products
                ? () {
                    final full = s.list('products').where((x) => toInt(x['id']) == toInt(p['id'])).firstOrNull;
                    if (full != null) Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: full)));
                  }
                : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
              child: Row(children: [
                NetImage(p['image'], size: 36, radius: 9),
                const SizedBox(width: 10),
                Expanded(child: Text('${p['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
                StatusChip(toInt(p['stock']) <= 0 ? 'Out of stock' : '${p['stock']} left'),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _TopDues extends StatelessWidget {
  final List<Map> items;
  const _TopDues({required this.items});
  @override
  Widget build(BuildContext context) {
    final s = context.read<AppState>();
    return SectionCard(
      title: 'Biggest dues',
      icon: Icons.account_balance_wallet_rounded,
      onViewAll: () => context.read<NavController>().go('dues'),
      child: Column(children: [
        for (final d in items)
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () {
              final bills = s.list('dues').where((x) => toInt(x['customerId']) == toInt(d['customerId']) && d['customerId'] != null).toList();
              bills.isNotEmpty ? collectDues(context, bills) : context.read<NavController>().go('dues');
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
              child: Row(children: [
                Avatar('${d['customer']}', size: 34),
                const SizedBox(width: 10),
                Expanded(child: Text('${d['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
                Text(money(d['balance']), style: const TextStyle(color: AppColors.red, fontWeight: FontWeight.w800)),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right_rounded, color: AppColors.faint, size: 18),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _BestSellers extends StatelessWidget {
  final List<Map> top;
  final List<Map> methods;
  const _BestSellers({required this.top, required this.methods});
  @override
  Widget build(BuildContext context) {
    final maxQty = top.fold<int>(1, (m, x) => toInt(x['qty']) > m ? toInt(x['qty']) : m);
    final payTotal = methods.fold<double>(0, (t, x) => t + toDouble(x['amount']));
    const colors = [AppColors.primary, AppColors.cyan, AppColors.amber, AppColors.green, AppColors.pink];
    return SectionCard(
      title: 'Today at a glance',
      icon: Icons.local_fire_department_rounded,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (top.isNotEmpty) ...[
          const Text('Best sellers', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted, fontSize: 12.5)),
          const SizedBox(height: 6),
          for (final t in top)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(flex: 3, child: Text('${t['name']}', maxLines: 1, overflow: TextOverflow.ellipsis)),
                Expanded(flex: 2, child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: toInt(t['qty']) / maxQty, minHeight: 7, backgroundColor: const Color(0xFFF1F0F8)))),
                SizedBox(width: 44, child: Text('${t['qty']}', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
              ]),
            ),
        ],
        if (methods.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text('Payments received', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted, fontSize: 12.5)),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Row(children: [for (var i = 0; i < methods.length; i++) Expanded(flex: (toDouble(methods[i]['amount']) / payTotal * 1000).round().clamp(1, 1000), child: Container(height: 10, color: colors[i % colors.length]))]),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 14, runSpacing: 6, children: [
            for (var i = 0; i < methods.length; i++)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 9, height: 9, decoration: BoxDecoration(color: colors[i % colors.length], shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text('${methods[i]['method']} ${moneyShort(methods[i]['amount'])}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
              ]),
          ]),
        ],
      ]),
    );
  }
}
