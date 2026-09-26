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
import '../../widgets/mobile.dart';
import '../orders/order_actions.dart';
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
    final stats = <_Stat>[
      if (sales != null)
        _Stat(Icons.currency_rupee_rounded, "Today's sales", money(sales['today']), '${sales['count']} bills', AppColors.primary, AppColors.primarySoft,
            p.seesReports ? () => nav.go('reports', {'range': 'today'}) : null, trend(sales['today'], sales['yesterday'])),
      if (orders != null) ...[
        _Stat(Icons.notifications_active_outlined, 'New orders', '${orders['pending']}', '${orders['placedToday']} placed today', AppColors.amber, AppColors.amberSoft, () => nav.go('orders', {'tab': 'Pending'})),
        _Stat(Icons.inventory_rounded, 'Being prepared', '${orders['inProgress']}', 'Accepted, not sent yet', AppColors.blue, AppColors.blueSoft, () => nav.go('orders', {'tab': 'In Progress'})),
        _Stat(Icons.local_shipping_outlined, 'On the way', '${orders['outForDelivery']}', 'With delivery agents', AppColors.cyan, AppColors.cyanSoft,
            () => p.deliveryBoard ? nav.go('board') : nav.go('orders', {'tab': 'Out for Delivery'})),
      ],
      if (dues != null) ...[
        _Stat(Icons.account_balance_wallet_outlined, 'Dues outstanding', money(dues['outstanding']), '${dues['open']} open bills', AppColors.red, AppColors.redSoft, () => nav.go('dues')),
        _Stat(Icons.savings_outlined, 'Collected today', money(dues['collectedToday']), '${dues['collections']} payments', AppColors.green, AppColors.greenSoft,
            p.seesReports ? () => nav.go('reports', {'range': 'today'}) : () => nav.go('dues')),
      ],
      if (stock != null) ...[
        _Stat(Icons.warning_amber_rounded, 'Low stock', '${stock['low']}', '5 or fewer left', AppColors.amber, AppColors.amberSoft, () => nav.go('products', {'filter': 'low'})),
        _Stat(Icons.remove_shopping_cart_outlined, 'Out of stock', '${stock['out']}', 'of ${stock['products']} products', AppColors.pink, AppColors.pinkSoft, () => nav.go('products', {'filter': 'out'})),
      ],
      if (agent != null) ...[
        _Stat(Icons.two_wheeler_rounded, 'To deliver', '${agent['active']}', '${agent['onTheWay']} on the way', AppColors.cyan, AppColors.cyanSoft, () => nav.go('deliveries')),
        _Stat(Icons.task_alt_rounded, 'Delivered today', '${agent['deliveredToday']}', null, AppColors.green, AppColors.greenSoft, () => nav.go('deliveries', {'done': true})),
        _Stat(Icons.payments_outlined, 'Cash to collect', money(agent['toCollect']), 'From your customers', AppColors.amber, AppColors.amberSoft, () => nav.go('deliveries')),
      ],
    ];
    final tiles = [for (final t in stats) KpiTile(icon: t.icon, label: t.label, value: t.value, sub: t.sub, color: t.color, soft: t.soft, onTap: t.onTap, trend: t.trend)];

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

    final banners = <Widget>[
      if (!s.online) _Banner(icon: Icons.cloud_off_rounded, text: "You're offline — keep working. Everything is saved on this device and sent when you're back online.", color: AppColors.red, soft: AppColors.redSoft),
      if (offlineBills > 0) _Banner(icon: Icons.cloud_upload_outlined, text: '$offlineBills bill(s) made offline are waiting to upload.', color: AppColors.amber, soft: AppColors.amberSoft),
      if (_d == null && _loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
    ];
    final footer = Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Text(_d == null ? '' : _at == null ? 'Showing saved numbers${s.online ? ' — updating…' : ' (offline)'}' : 'Updated ${ago(_at)} · pull down to refresh',
          textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
    );

    if (!wide) {
      return _PhoneHome(
        name: name,
        greet: greet,
        stats: stats,
        actions: actions,
        banners: banners,
        panels: [?chart, ?pipeline, ...panels],
        footer: footer,
        onRefresh: () async => Future.wait([_load(), s.syncNow()]),
      );
    }

    // Windows / tablets: a header like the website's admin pages.
    final header = Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Dashboard', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -.4)),
            const SizedBox(height: 3),
            Text('$greet, $name · ${DateFormat('EEEE, d MMMM').format(ist(DateTime.now().toUtc()))} · ${s.user?['roleLabel'] ?? ''}', style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
          ]),
        ),
        _HeroSync(online: s.online, pending: s.pending, light: true, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()))),
        const SizedBox(width: 10),
        for (final (icon, label, onTap) in actions.take(4)) ...[
          const SizedBox(width: 8),
          label == actions.first.$2
              ? FilledButton.icon(onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label))
              : OutlinedButton.icon(onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label)),
        ],
      ]),
    );

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => Future.wait([_load(), s.syncNow()]),
          child: PageBody(
            maxWidth: 1400,
            child: ListView(padding: EdgeInsets.all(wide ? 22 : 14), children: [
              header,
              ...banners,
              grid,
              if (chart != null || pipeline != null) ...[const SizedBox(height: 14), pair(chart, pipeline, fa: 3, fb: 2)],
              if (panels.isNotEmpty) ...[
                const SizedBox(height: 14),
                if (wide)
                  for (var i = 0; i < panels.length; i += 2) ...[pair(panels[i], i + 1 < panels.length ? panels[i + 1] : null), const SizedBox(height: 14)]
                else
                  for (final w in panels) ...[w, const SizedBox(height: 14)],
              ],
              footer,
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
  final bool light; // on a white page (desktop) instead of the gradient
  final VoidCallback onTap;
  const _HeroSync({required this.online, required this.pending, required this.onTap, this.light = false});
  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          decoration: BoxDecoration(
            color: light ? (online ? AppColors.greenSoft : AppColors.redSoft) : Colors.white.withValues(alpha: .16),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: online ? (light ? AppColors.green : const Color(0xFF4ADE80)) : (light ? AppColors.red : const Color(0xFFFCA5A5)))),
            const SizedBox(width: 7),
            Text(online ? (pending > 0 ? 'Sending $pending' : 'Live') : 'Offline',
                style: TextStyle(color: light ? (online ? AppColors.green : AppColors.red) : Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5)),
          ]),
        ),
      );
}

/// One number on the dashboard (a KpiTile on desktop, a pastel tile on phones).
class _Stat {
  final IconData icon;
  final String label, value;
  final String? sub;
  final Color color, soft;
  final VoidCallback? onTap;
  final double? trend;
  const _Stat(this.icon, this.label, this.value, this.sub, this.color, this.soft, this.onTap, [this.trend]);
}

/// Phone home, delivery-app style: greeting bar with a bell, pastel number tiles,
/// quick actions, new orders (or my deliveries) as photo cards with actions.
class _PhoneHome extends StatelessWidget {
  final String name, greet;
  final List<_Stat> stats;
  final List<(IconData, String, VoidCallback)> actions;
  final List<Widget> banners, panels;
  final Widget footer;
  final Future<void> Function() onRefresh;
  const _PhoneHome({required this.name, required this.greet, required this.stats, required this.actions, required this.banners, required this.panels, required this.footer, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final nav = context.read<NavController>();
    final p = s.perms;
    final online = s.list('orders').where((o) => o['type'] == 'online').toList();
    final pending = online.where((o) => o['status'] == 'Pending').toList();
    final myRuns = p.seesMyDeliveries ? s.list('deliveries').where((o) => o['status'] == 'In Progress' || o['status'] == 'Out for Delivery').toList() : <Map<String, dynamic>>[];
    final canAccept = p.acceptReject || p.updateStatus;
    final canReject = p.acceptReject || p.cancelOrders;

    Widget heading(String title, {VoidCallback? onAll}) => Padding(
          padding: const EdgeInsets.fromLTRB(2, 20, 2, 10),
          child: Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
            if (onAll != null) InkWell(onTap: onAll, child: Text('View all', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600))),
          ]),
        );

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            // ── top bar ──
            Row(children: [
              InkWell(
                customBorder: const CircleBorder(),
                onTap: () => shellScaffoldKey.currentState?.openDrawer(),
                child: Avatar('${s.user?['name'] ?? ''}', photo: s.user?['avatar'] as String?, size: 46),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('$greet,', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                  Text(name.isEmpty ? 'Welcome' : name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                ]),
              ),
              _HeroSync(online: s.online, pending: s.pending, light: true, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()))),
              const SizedBox(width: 6),
              _RoundIcon(
                icon: Icons.notifications_none_rounded,
                badge: p.seesOrders ? pending.length : myRuns.length,
                onTap: () => p.seesOrders ? nav.go('orders', {'tab': 'Pending'}) : nav.go('deliveries'),
              ),
            ]),
            const SizedBox(height: 16),
            ...banners,
            // ── pastel number tiles ──
            if (stats.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: const [BoxShadow(color: Color(0x0D000000), blurRadius: 18, offset: Offset(0, 6))]),
                child: GridView(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, mainAxisExtent: 132),
                  children: [
                    for (var i = 0; i < stats.length; i++)
                      PastelTile(icon: stats[i].icon, label: stats[i].label, value: stats[i].value, tint: pastel[i % pastel.length].$1, ink: pastel[i % pastel.length].$2, onTap: stats[i].onTap),
                  ],
                ),
              ),
            // ── quick actions ──
            if (actions.isNotEmpty) ...[
              heading('Quick actions'),
              SizedBox(
                height: 92,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: actions.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 6),
                  itemBuilder: (c, i) {
                    final (icon, label, onTap) = actions[i];
                    return SizedBox(
                      width: 76,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: onTap,
                        child: Column(children: [
                          Container(width: 54, height: 54, decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: AppColors.primary, size: 26)),
                          const SizedBox(height: 7),
                          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                        ]),
                      ),
                    );
                  },
                ),
              ),
            ],
            // ── my deliveries (agents) ──
            if (p.seesMyDeliveries) ...[
              heading('My deliveries', onAll: () => nav.go('deliveries')),
              if (myRuns.isEmpty) const _EmptyLine('Nothing to deliver right now.'),
              for (final o in myRuns.take(5)) ...[
                PhotoOrderCard(
                  order: o,
                  badge: StatusChip('${o['status']}'),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']), agentView: true))),
                  actions: [
                    if (o['status'] == 'In Progress') TinyButton('Start', color: AppColors.primary, onTap: () => orderAction(context, o, 'Start delivery ${o['number']}', {'action': 'start'}, {'status': 'Out for Delivery'}, delivery: true)),
                    if (o['status'] == 'Out for Delivery') TinyButton('Open', color: AppColors.primary, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']), agentView: true)))),
                  ],
                ),
                const SizedBox(height: 10),
              ],
            ],
            // ── new orders ──
            if (p.seesOrders) ...[
              heading('New orders${pending.isEmpty ? '' : ' (${pending.length})'}', onAll: () => nav.go('orders', {'tab': 'Pending'})),
              if (pending.isEmpty) const _EmptyLine('No new orders — all caught up.'),
              for (final o in pending.take(5)) ...[
                PhotoOrderCard(
                  order: o,
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id'])))),
                  actions: [
                    if (canAccept) TinyButton('Accept', color: AppColors.green, onTap: () => acceptOrder(context, o)),
                    if (canReject) TinyButton('Reject', color: AppColors.red, onTap: () => rejectOrder(context, o)),
                  ],
                ),
                const SizedBox(height: 10),
              ],
            ],
            for (final w in panels) ...[const SizedBox(height: 14), w],
            const SizedBox(height: 8),
            footer,
          ]),
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  final IconData icon;
  final int badge;
  final VoidCallback onTap;
  const _RoundIcon({required this.icon, required this.badge, required this.onTap});
  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: const CircleBorder(side: BorderSide(color: AppColors.border)),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(10), child: Badge(isLabelVisible: badge > 0, label: Text('$badge'), backgroundColor: AppColors.primary, child: Icon(icon, size: 24))),
        ),
      );
}

class _EmptyLine extends StatelessWidget {
  final String text;
  const _EmptyLine(this.text);
  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(children: [
          const Icon(Icons.check_circle_outline_rounded, color: AppColors.green),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(color: AppColors.muted))),
        ]),
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
    final colors = [AppColors.primary, AppColors.cyan, AppColors.amber, AppColors.green, AppColors.pink];
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
