import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/sales_pages.dart' show allOrders;
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "Analytics" as on the website (admin/ecommerce/analytics): Today / 7 Days / 30 Days / This Year or
/// any dates, All / Online / In-store, compare with the previous period; Gross / Net sales, Orders,
/// Avg order (each with change and a small trend line), Revenue & Orders chart (daily / weekly),
/// Sales by Payment Method, Top Products, the insight card, New vs Returning, Revenue by Category.
/// Every non-cancelled order counts, as on the website — from this computer, so it opens offline.
class AnalyticsWeb extends StatefulWidget {
  const AnalyticsWeb({super.key});
  @override
  State<AnalyticsWeb> createState() => _AnalyticsWebState();
}

class _AnalyticsWebState extends State<AnalyticsWeb> {
  static final _def = displayDefs['ecom_analytics2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  DateRange _range = _preset('30d');
  String _type = 'all', _grain = 'daily';
  bool _compare = true;

  static DateRange _preset(String k) => DateRange.preset(k);

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    bool on(String g, [String? i]) => _prefs.on(g, i);
    final all = allOrders(s).where((o) => o['status'] != 'Canceled' && (_type == 'all' || o['type'] == _type)).toList();
    final cur = all.where((o) => _range.contains(o['createdAt'])).toList();
    final prevRange = _range.previous();
    final prev = all.where((o) => prevRange.contains(o['createdAt'])).toList();
    double net(List<Map> l) => l.fold(0, (t, o) => t + toDouble(o['total']));
    double gross(List<Map> l) => l.fold(0, (t, o) => t + toDouble(o['subtotal']) + toDouble(o['gst']));
    double aov(List<Map> l) => l.isEmpty ? 0 : net(l) / l.length;
    double? delta(double now, double before) => before > 0 ? (now - before) * 100 / before : (now > 0 ? null : 0);

    // Day (or week) series.
    final days = _range.to.difference(_range.from).inDays + 1;
    final weekly = _grain == 'weekly';
    final buckets = weekly ? (days / 7).ceil().clamp(1, 60) : days.clamp(1, 400);
    final rev = List<double>.filled(buckets, 0), ord = List<int>.filled(buckets, 0);
    for (final o in cur) {
      final t = ist(DateTime.parse('${o['createdAt']}').toUtc());
      var i = DateTime(t.year, t.month, t.day).difference(_range.from).inDays;
      if (weekly) i ~/= 7;
      if (i >= 0 && i < buckets) {
        rev[i] += toDouble(o['total']);
        ord[i]++;
      }
    }
    String bucketLabel(int i) {
      final d = _range.from.add(Duration(days: weekly ? i * 7 : i));
      return '${d.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]}';
    }

    // Payments (Split broken down by its parts), products, categories, customers.
    final pay = <String, double>{};
    for (final o in cur) {
      final parts = ((o['pays'] as List?) ?? const []).cast<Map>();
      if (o['paymentMethod'] == 'Split' && parts.isNotEmpty) {
        for (final p in parts) {
          pay['${p['method'] ?? 'Other'}'] = (pay['${p['method'] ?? 'Other'}'] ?? 0) + toDouble(p['amount']);
        }
      } else {
        final m = '${o['paymentMethod'] ?? 'Other'}'.isEmpty ? 'Other' : '${o['paymentMethod'] ?? 'Other'}';
        pay[m] = (pay[m] ?? 0) + toDouble(o['total']);
      }
    }
    final payGrand = pay.values.fold<double>(0, (a, b) => a + b);
    const payColors = {'UPI': Color(0xFF7C3AED), 'Card': Color(0xFF2563EB), 'Cash': Color(0xFF16A34A), 'Split': Color(0xFFF59E0B), 'Other': Color(0xFF6B7280)};
    final products = {for (final p in s.list('products')) toInt(p['id']): p};
    final cats = {for (final c in s.list('categories')) toInt(c['id']): '${c['name']}'};
    final byProduct = <int, (String, int, double)>{};
    final byCat = <int?, double>{};
    for (final o in cur) {
      for (final i in ((o['items'] as List?) ?? const []).cast<Map>()) {
        final id = toInt(i['productId']);
        final line = toDouble(i['price']) * toInt(i['qty']);
        final c = byProduct[id] ?? ('${i['name']}', 0, 0.0);
        byProduct[id] = (c.$1, c.$2 + toInt(i['qty']), c.$3 + line);
        final cat = products[id]?['categoryId'] == null ? null : toInt(products[id]!['categoryId']);
        byCat[cat] = (byCat[cat] ?? 0) + line;
      }
    }
    final top = byProduct.entries.toList()..sort((a, b) => b.value.$3.compareTo(a.value.$3));
    final catRows = byCat.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final since = {for (final c in s.list('customers')) toInt(c['id']): c['since']};
    final buyers = {for (final o in cur) if (o['customerId'] != null) toInt(o['customerId'])};
    final newC = buyers.where((id) => _range.contains(since[id])).length, retC = buyers.length - newC;

    Widget deltaLine(double? d) {
      if (!_compare) return const SizedBox();
      final up = (d ?? 1) >= 0;
      return Row(children: [
        Icon(up ? LucideIcons.arrowUpRight : LucideIcons.arrowDownRight, size: 13, color: up ? const Color(0xFF059669) : const Color(0xFFDC2626)),
        Text(d == null ? ' New' : ' ${d.abs().toStringAsFixed(1)}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: up ? const Color(0xFF059669) : const Color(0xFFDC2626))),
        const Text('  vs previous period', style: TextStyle(fontSize: 11.5, color: W.g500)),
      ]);
    }

    Widget spark(List<num> v, Color c) => SizedBox(
          width: 80,
          height: 30,
          child: v.length < 2
              ? const SizedBox()
              : LineChart(LineChartData(
                  gridData: const FlGridData(show: false),
                  titlesData: const FlTitlesData(show: false),
                  borderData: FlBorderData(show: false),
                  lineTouchData: const LineTouchData(enabled: false),
                  lineBarsData: [LineChartBarData(spots: [for (final (i, x) in v.indexed) FlSpot(i.toDouble(), x.toDouble())], isCurved: true, color: c, barWidth: 2, dotData: const FlDotData(show: false))],
                )),
        );
    Widget card(IconData icon, Color c, String label, String value, double? d, List<num> line) => WebCard(
          child: Row(children: [
            Container(width: 42, height: 42, decoration: BoxDecoration(color: c.withValues(alpha: .1), borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 20, color: c)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 12.5, color: W.g600)),
                FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: W.g900))),
                deltaLine(d),
              ]),
            ),
            spark(line, c),
          ]),
        );

    final cards = [
      if (on('a2-cards', 'a2-k-gross')) card(LucideIcons.indianRupee, const Color(0xFF7C3AED), 'Gross Sales', money(gross(cur)), delta(gross(cur), gross(prev)), rev),
      if (on('a2-cards', 'a2-k-net')) card(LucideIcons.wallet, const Color(0xFF059669), 'Net Sales', money(net(cur)), delta(net(cur), net(prev)), rev),
      if (on('a2-cards', 'a2-k-orders')) card(LucideIcons.shoppingCart, const Color(0xFF2563EB), 'Orders', '${cur.length}', delta(cur.length.toDouble(), prev.length.toDouble()), ord),
      if (on('a2-cards', 'a2-k-aov')) card(LucideIcons.receipt, const Color(0xFFD97706), 'Avg Order Value', money(aov(cur)), delta(aov(cur), aov(prev)), rev),
    ];

    final maxRev = rev.fold<double>(0, (a, b) => b > a ? b : a), maxOrd = ord.fold<int>(0, (a, b) => b > a ? b : a);
    const revColor = Color(0xFF7C3AED), ordColor = Color(0xFF0EA5E9);
    final revTop = maxRev <= 0 ? 1000.0 : maxRev * 1.2, ordTop = maxOrd <= 0 ? 5.0 : (maxOrd * 1.2).ceilToDouble();
    final chart = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Text('Revenue & Orders Overview', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900))),
          Container(width: 9, height: 9, decoration: const BoxDecoration(color: revColor, shape: BoxShape.circle)),
          const Text('  Revenue    ', style: TextStyle(fontSize: 12.5, color: W.g600)),
          Container(width: 9, height: 9, decoration: const BoxDecoration(color: ordColor, shape: BoxShape.circle)),
          const Text('  Orders    ', style: TextStyle(fontSize: 12.5, color: W.g600)),
          SizedBox(width: 110, child: WebSelect<String>(value: _grain, options: const [('daily', 'Daily'), ('weekly', 'Weekly')], onChanged: (v) => setState(() => _grain = v))),
        ]),
        const SizedBox(height: 14),
        SizedBox(
          height: 240,
          child: cur.isEmpty
              ? const Center(child: Text('No sales in this period', style: TextStyle(color: W.g400)))
              : LineChart(LineChartData(
                  minY: 0,
                  maxY: revTop,
                  gridData: FlGridData(drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: W.g100, strokeWidth: 1, dashArray: [4, 4])),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(),
                    leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 48, getTitlesWidget: (v, m) => v >= m.max ? const SizedBox() : Text(moneyShort(v), style: const TextStyle(fontSize: 10.5, color: W.g500)))),
                    rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 30, getTitlesWidget: (v, m) {
                      final n = v / revTop * ordTop;
                      if (v >= m.max || (n - n.round()).abs() > .05) return const SizedBox();
                      return Text('${n.round()}', style: const TextStyle(fontSize: 10.5, color: W.g500));
                    })),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 22,
                        interval: 1,
                        getTitlesWidget: (v, m) {
                          final i = v.toInt();
                          final step = (buckets / 8).ceil().clamp(1, 60);
                          if (i < 0 || i >= buckets || i % step != 0) return const SizedBox();
                          return Padding(padding: const EdgeInsets.only(top: 4), child: Text(bucketLabel(i), style: const TextStyle(fontSize: 10.5, color: W.g500)));
                        },
                      ),
                    ),
                  ),
                  lineTouchData: LineTouchData(
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipColor: (_) => Colors.white,
                      tooltipBorder: const BorderSide(color: W.g200),
                      getTooltipItems: (spots) => [
                        for (final sp in spots)
                          LineTooltipItem(sp.barIndex == 0 ? '${bucketLabel(sp.x.toInt())}\nRevenue: ${money(rev[sp.x.toInt()])}' : 'Orders: ${ord[sp.x.toInt()]}', TextStyle(fontSize: 12, color: sp.barIndex == 0 ? W.g900 : W.g700, fontWeight: sp.barIndex == 0 ? FontWeight.w600 : FontWeight.w400)),
                      ],
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(spots: [for (var i = 0; i < buckets; i++) FlSpot(i.toDouble(), rev[i])], isCurved: true, preventCurveOverShooting: true, color: revColor, barWidth: 2, dotData: FlDotData(show: buckets <= 31), belowBarData: BarAreaData(show: true, color: revColor.withValues(alpha: .1))),
                    LineChartBarData(spots: [for (var i = 0; i < buckets; i++) FlSpot(i.toDouble(), ord[i] / ordTop * revTop)], isCurved: true, preventCurveOverShooting: true, color: ordColor, barWidth: 2, dotData: FlDotData(show: buckets <= 31), belowBarData: BarAreaData(show: true, color: ordColor.withValues(alpha: .08))),
                  ],
                )),
        ),
      ]),
    );

    final payRows = pay.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final payment = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Sales by Payment Method', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
        const SizedBox(height: 14),
        if (payRows.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 30), child: Center(child: Text('No paid orders in this period.', style: TextStyle(color: W.g400))))
        else
          Row(children: [
            SizedBox(
              width: 160,
              height: 160,
              child: Stack(alignment: Alignment.center, children: [
                PieChart(PieChartData(sectionsSpace: 0, centerSpaceRadius: 60, startDegreeOffset: -90, sections: [
                  for (final e in payRows) PieChartSectionData(value: e.value, color: payColors[e.key] ?? const Color(0xFF94A3B8), radius: 16, showTitle: false),
                ])),
                Column(mainAxisSize: MainAxisSize.min, children: [
                  FittedBox(child: Text(money(payGrand), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900))),
                  const Text('Net Sales', style: TextStyle(fontSize: 12, color: W.g500)),
                ]),
              ]),
            ),
            const SizedBox(width: 24),
            Expanded(
              child: Column(children: [
                const Row(children: [
                  Expanded(child: Text('METHOD', style: TextStyle(fontSize: 11, color: W.g400))),
                  Expanded(child: Text('AMOUNT', style: TextStyle(fontSize: 11, color: W.g400))),
                  Text('% SHARE', style: TextStyle(fontSize: 11, color: W.g400)),
                ]),
                for (final e in payRows)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g100))),
                    child: Row(children: [
                      Expanded(child: Row(children: [Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: payColors[e.key] ?? const Color(0xFF94A3B8))), const SizedBox(width: 8), Text(e.key == 'Split' ? 'Split Payment' : e.key, style: const TextStyle(fontSize: 13))])),
                      Expanded(child: Text(money(e.value), style: const TextStyle(fontSize: 13, color: W.g700))),
                      Text('${payGrand > 0 ? (e.value * 1000 / payGrand).round() / 10 : 0}%', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ]),
                  ),
                Container(
                  padding: const EdgeInsets.only(top: 8),
                  decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g200))),
                  child: Row(children: [
                    const Expanded(child: Text('Total', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
                    Expanded(child: Text(money(payGrand), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
                    const Text('100%', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ]),
            ),
          ]),
      ]),
    );

    final topCard = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Text('Top Products', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900))),
          TextButton(onPressed: () => context.read<NavController>().go('products'), child: const Text('View All Products ›')),
        ]),
        if (top.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 30), child: Center(child: Text('No sales in this period.', style: TextStyle(color: W.g400))))
        else
          WebTable(
            cols: const [WebCol('Product', flex: 2.4), WebCol('Units Sold', flex: .8), WebCol('Revenue', flex: 1, right: true)],
            rows: [
              for (final e in top.take(6))
                [
                  Row(children: [NetImage(products[e.key]?['image'], size: 36, radius: 6, placeholder: LucideIcons.image), const SizedBox(width: 10), Expanded(child: Text(e.value.$1, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)))]),
                  Text('${e.value.$2}', style: const TextStyle(color: W.g600)),
                  Text(money(e.value.$3), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
            ],
          ),
      ]),
    );

    final d = delta(net(cur), net(prev));
    final up = (d ?? 1) > 0, down = d != null && d < 0;
    final insight = WebCard(
      child: Column(children: [
        Container(width: 40, height: 40, decoration: BoxDecoration(color: up ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2), shape: BoxShape.circle), child: Icon(up ? LucideIcons.arrowUpRight : LucideIcons.trendingDown, size: 20, color: up ? const Color(0xFF059669) : const Color(0xFFDC2626))),
        const SizedBox(height: 8),
        Text(up ? 'Great job! Your revenue is up' : down ? 'Your revenue is down' : 'Revenue is steady', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: W.g900)),
        if (d != null) Text('${d.abs().toStringAsFixed(1)}%', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: up ? const Color(0xFF059669) : const Color(0xFFDC2626))),
        const Text('vs previous period', style: TextStyle(fontSize: 12, color: W.g500)),
        const SizedBox(height: 8),
        spark(rev, up ? const Color(0xFF10B981) : const Color(0xFFEF4444)),
        const SizedBox(height: 6),
        const Text('Keep up the momentum!', style: TextStyle(fontSize: 12, color: W.g400)),
      ]),
    );

    final customers = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Row(children: [Icon(LucideIcons.users, size: 16, color: W.g400), SizedBox(width: 8), Text('New vs Returning Customers', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900))]),
        const SizedBox(height: 14),
        Row(children: [
          for (final (icon, label, n, c, bg) in [(LucideIcons.userPlus, 'New', newC, const Color(0xFF7C3AED), const Color(0xFFF5F3FF)), (LucideIcons.userCheck, 'Returning', retC, const Color(0xFF2563EB), const Color(0xFFEFF6FF))]) ...[
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
                child: Column(children: [Icon(icon, size: 20, color: c), const SizedBox(height: 4), Text('$n', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)), Text(label, style: const TextStyle(fontSize: 12, color: W.g600))]),
              ),
            ),
            if (label == 'New') const SizedBox(width: 12),
          ],
        ]),
        if (newC + retC > 0) ...[const SizedBox(height: 12), ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: newC / (newC + retC), minHeight: 8, backgroundColor: W.g100, color: const Color(0xFF8B5CF6)))],
      ]),
    );

    const catColors = [Color(0xFF7C3AED), Color(0xFF2563EB), Color(0xFF16A34A), Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFF0891B2)];
    final catMax = catRows.fold<double>(1, (a, b) => b.value > a ? b.value : a);
    final categories = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Revenue by Category', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
        const SizedBox(height: 14),
        if (catRows.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 30), child: Center(child: Text('No sales in this period.', style: TextStyle(color: W.g400)))),
        for (final (i, e) in catRows.take(6).indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [Expanded(child: Text(e.key == null ? 'Uncategorized' : cats[e.key] ?? '—', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.g800))), Text(money(e.value), style: const TextStyle(fontSize: 13, color: W.g500))]),
              const SizedBox(height: 5),
              ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: (e.value / catMax).clamp(.03, 1), minHeight: 8, backgroundColor: W.g100, color: catColors[i % catColors.length])),
            ]),
          ),
      ]),
    );

    bool w(String k) => on('a2-widgets', k);
    final leftCol = [if (w('a2-payment')) payment, if (w('a2-top')) topCard];
    final rightCol = [if (w('a2-insight') && _compare) insight, if (w('a2-customers')) customers, if (w('a2-category')) categories];
    List<Widget> spaced(List<Widget> l) => [for (final (i, x) in l.indexed) ...[if (i > 0) const SizedBox(height: 16), x]];

    return WebPage(
      title: 'Analytics',
      subtitle: 'Sales performance from real orders',
      onRefresh: () async {
        await s.syncNow(only: const ['orders', 'customers']);
        await s.reloadPage('sales_ledger');
      },
      actions: [DisplayOptionsButton(_def)],
      children: [
        WebRangeBar(
          range: _range,
          presets: const ['today', '7d', '30d', 'this_year'],
          onChanged: (r) => setState(() => _range = r),
          below: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(children: [
              DSegmented<String>(options: const [('all', 'All orders'), ('online', 'Online'), ('offline', 'In-store')], value: _type, onChanged: (v) => setState(() => _type = v)),
              const SizedBox(width: 14),
              InkWell(
                onTap: () => setState(() => _compare = !_compare),
                child: Row(mainAxisSize: MainAxisSize.min, children: [IgnorePointer(child: Checkbox(value: _compare, onChanged: (_) {})), const Text('Compare with the previous period', style: TextStyle(fontSize: 13, color: W.g700))]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        if (on('a2-cards') && cards.isNotEmpty) ...[WebGrid(columns: cards.length, minWidth: 230, children: cards), const SizedBox(height: 16)],
        if (w('a2-chart')) ...[chart, const SizedBox(height: 16)],
        if (on('a2-widgets'))
          LayoutBuilder(builder: (c, box) {
            if (box.maxWidth < 1000) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: spaced([...leftCol, ...rightCol]));
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (leftCol.isNotEmpty) Expanded(flex: 2, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: spaced(leftCol))),
              if (leftCol.isNotEmpty && rightCol.isNotEmpty) const SizedBox(width: 16),
              if (rightCol.isNotEmpty) Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: spaced(rightCol))),
            ]);
          }),
        const SizedBox(height: 16),
        Text('Showing data for ${_range.label}. Figures are computed from real orders — no visit/page-view tracking exists yet, so top-of-funnel metrics (visits, product views, add-to-cart) aren\'t shown.',
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: W.g400)),
      ],
    );
  }
}
