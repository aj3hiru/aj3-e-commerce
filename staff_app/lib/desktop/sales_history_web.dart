import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/display_options.dart';
import '../features/dues/collect_sheet.dart';
import '../features/native/sales_pages.dart' show allOrders, isSale;
import '../features/orders/order_actions.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/web.dart';

/// "Sales History" exactly as on the website (admin/ecommerce/sales-history): Sales Performance
/// (this month vs previous month, by week), Key Metrics (range, today, yesterday, this week, this
/// month — each compared — and today's due collection), Filter Sales (presets, status, store /
/// online, payment, customer, product, dates) and the Sales Ledger (time, order, customer, items,
/// payment, total, paid — record a due payment — and invoice), with the website's Display Options.
class SalesHistoryWeb extends StatefulWidget {
  const SalesHistoryWeb({super.key});
  @override
  State<SalesHistoryWeb> createState() => _SalesHistoryWebState();
}

class _SalesHistoryWebState extends State<SalesHistoryWeb> {
  static final _def = displayDefs['ecom_sales_history2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  DateRange _range = DateRange.preset('today');
  String _status = 'all', _channel = 'all', _payment = 'all', _q = '';
  int _customer = 0; // 0 all, -1 guest
  int _product = 0;
  int _page = 0, _per = 10;
  String _sort = 'time';
  bool _asc = false;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  void _sortBy(String k) => setState(() {
        if (_sort == k) {
          _asc = !_asc;
        } else {
          _sort = k;
          _asc = k == 'customer' || k == 'order';
        }
      });

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final orders = allOrders(s);
    final sales = orders.where(isSale).toList();
    final dues = s.list('dues');
    final paidDues = ((s.pageData['dues_paid']?['data'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final creditsByOrder = <int, List<Map<String, dynamic>>>{};
    for (final d in [...dues, ...paidDues]) {
      creditsByOrder.putIfAbsent(toInt(d['orderId']), () => []).add(d);
    }

    // ── key metrics (IST days) ──
    DateTime day(Object? iso) {
      final d = parseDate(iso)!.toLocal();
      return DateTime(d.year, d.month, d.day);
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    double sum(DateTime from, DateTime to) => sales.fold(0.0, (t, o) {
          final d = day(o['createdAt']);
          return !d.isBefore(from) && !d.isAfter(to) ? t + toDouble(o['total']) : t;
        });
    int? pct(double cur, double prev) => prev <= 0 ? null : ((cur - prev) / prev * 100).round();
    final yesterday = today.subtract(const Duration(days: 1)), dayBefore = today.subtract(const Duration(days: 2));
    final weekStart = today.subtract(Duration(days: today.weekday - 1));
    final lastWeekStart = weekStart.subtract(const Duration(days: 7)), lastWeekSameDay = today.subtract(const Duration(days: 7));
    final monthStart = DateTime(today.year, today.month);
    final prevMonthStart = DateTime(today.year, today.month - 1);
    final prevMonthLen = DateTime(today.year, today.month, 0).day;
    final prevMonthSameDay = DateTime(prevMonthStart.year, prevMonthStart.month, today.day.clamp(1, prevMonthLen));
    final rangeDays = _range.to.difference(_range.from).inDays + 1;
    final rangeCur = sum(_range.from, _range.to), rangePrev = sum(_range.from.subtract(Duration(days: rangeDays)), _range.from.subtract(const Duration(days: 1)));
    final todayV = sum(today, today), yesterdayV = sum(yesterday, yesterday), dayBeforeV = sum(dayBefore, dayBefore);
    final weekV = sum(weekStart, today), lastWeekV = sum(lastWeekStart, lastWeekSameDay);
    final monthV = sum(monthStart, today), prevMonthV = sum(prevMonthStart, prevMonthSameDay);
    final collectedToday = [...dues, ...paidDues].expand((d) => ((d['payments'] as List?) ?? const []).cast<Map>()).where((p) => DateRange.preset('today').contains(p['at'])).fold<double>(0, (t, p) => t + toDouble(p['amount']));
    final outstanding = dues.fold<double>(0, (t, d) => t + toDouble(d['balance']));
    final defaultRange = _range.key == 'today';

    // ── ledger ──
    Map<String, dynamic> row(Map<String, dynamic> o) {
      final credits = creditsByOrder[toInt(o['id'])] ?? const [];
      final due = credits.where((c) => toDouble(c['balance']) > 0.004).fold<double>(0, (t, c) => t + toDouble(c['balance']));
      final label = due > 0.004 ? 'Due' : credits.isNotEmpty ? 'Due Cleared' : 'Paid';
      final receipts = <String, double>{};
      for (final c in credits) {
        for (final p in ((c['payments'] as List?) ?? const []).cast<Map>()) {
          receipts['${p['receipt'] ?? 'Pending'}'] = (receipts['${p['receipt'] ?? 'Pending'}'] ?? 0) + toDouble(p['amount']);
        }
      }
      return {...o, '_due': due, '_paid': (toDouble(o['total']) - due).clamp(0, double.infinity), '_label': label, '_receipts': receipts, '_credits': credits};
    }
    final words = _q.trim().toLowerCase();
    List<Map> items(Map o) => ((o['items'] as List?) ?? const []).cast<Map>();
    final list = orders.where((o) {
      if (!_range.contains(o['createdAt'])) return false;
      if (_status == 'all' ? !isSale(o) : o['status'] != _status) return false;
      if (_channel != 'all' && o['type'] != _channel) return false;
      if (_customer == -1 && o['customerId'] != null) return false;
      if (_customer > 0 && toInt(o['customerId']) != _customer) return false;
      if (_product != 0 && !items(o).any((i) => toInt(i['productId']) == _product)) return false;
      return words.isEmpty || '${o['number']} ${o['customer']} ${items(o).map((i) => i['name']).join(' ')}'.toLowerCase().contains(words);
    }).map(row).where((r) => _payment == 'all' || (_payment == 'paid' && r['_label'] == 'Paid') || (_payment == 'due' && r['_label'] == 'Due') || (_payment == 'due_cleared' && r['_label'] == 'Due Cleared')).toList();
    int cmp(Map a, Map b) => switch (_sort) {
          'order' => '${a['number']}'.compareTo('${b['number']}'),
          'customer' => '${a['customer']}'.toLowerCase().compareTo('${b['customer']}'.toLowerCase()),
          'items' => items(a).length.compareTo(items(b).length),
          'payment' => '${a['paymentMethod']}'.compareTo('${b['paymentMethod']}'),
          'total' => toDouble(a['total']).compareTo(toDouble(b['total'])),
          'paid' => toDouble(a['_paid']).compareTo(toDouble(b['_paid'])),
          _ => '${a['createdAt']}'.compareTo('${b['createdAt']}'),
        };
    list.sort((a, b) => _asc ? cmp(a, b) : cmp(b, a));
    final shown = _per == 0 ? list : WebPager.slice(list, _page, _per);
    final customers = s.list('customers');
    final products = {for (final o in orders) for (final i in items(o)) toInt(i['productId']): '${i['name']}'};

    Widget metric(IconData icon, Color c, String label, double value, int? change, String cmpLabel, String empty) => _Tile(
          icon: icon,
          color: c,
          label: label,
          value: money(value),
          sub: change != null
              ? Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(change >= 0 ? LucideIcons.arrowUp : LucideIcons.arrowDown, size: 12, color: change >= 0 ? const Color(0xFF059669) : const Color(0xFFEF4444)),
                  const SizedBox(width: 3),
                  Flexible(child: Text('${change.abs()}% $cmpLabel', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: change >= 0 ? const Color(0xFF059669) : const Color(0xFFEF4444)))),
                ])
              : Text('— ${value > 0 ? 'No data to compare' : empty}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500)),
        );
    final tiles = [
      if (on('sh2-metrics', 'sh2-m-total')) metric(LucideIcons.indianRupee, const Color(0xFF059669), 'Total Sales (${defaultRange ? 'This Month' : 'Selected Range'})', defaultRange ? monthV : rangeCur, defaultRange ? pct(monthV, prevMonthV) : pct(rangeCur, rangePrev), defaultRange ? 'vs. last month' : 'vs. previous period', 'No sales in this range'),
      if (on('sh2-metrics', 'sh2-m-today')) metric(LucideIcons.shoppingCart, const Color(0xFF2563EB), "Today's Sale", todayV, pct(todayV, yesterdayV), 'vs. yesterday', 'No sales today'),
      if (on('sh2-metrics', 'sh2-m-yesterday')) metric(LucideIcons.calendarDays, const Color(0xFF1E293B), "Yesterday's Sale", yesterdayV, pct(yesterdayV, dayBeforeV), 'vs. day before', 'No sales yesterday'),
      if (on('sh2-metrics', 'sh2-m-week')) metric(LucideIcons.calendarRange, const Color(0xFF059669), "This Week's Sale", weekV, pct(weekV, lastWeekV), 'vs. last week', 'No sales this week'),
      if (on('sh2-metrics', 'sh2-m-month')) metric(LucideIcons.calendarDays, const Color(0xFF2563EB), "This Month's Sale", monthV, pct(monthV, prevMonthV), 'vs. last month', 'No sales this month'),
      if (on('sh2-metrics', 'sh2-m-due'))
        _Tile(
          icon: LucideIcons.wallet, color: const Color(0xFFF59E0B), label: "Today's Due Collection", value: money(collectedToday),
          sub: Text(outstanding > 0.004 ? '${money(outstanding)} still due' : '— All collected', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: outstanding > 0.004 ? const Color(0xFFD97706) : W.g500)),
        ),
    ];

    // ── chart: this month vs previous month, in weeks (1–7, 8–14 …) ──
    final thisLen = DateTime(today.year, today.month + 1, 0).day;
    final thisM = List<double>.filled(5, 0), prevM = List<double>.filled(5, 0);
    int bucket(int d) => ((d - 1) ~/ 7).clamp(0, 4);
    for (final o in sales) {
      final d = day(o['createdAt']);
      if (d.year == today.year && d.month == today.month) thisM[bucket(d.day)] += toDouble(o['total']);
      if (d.year == prevMonthStart.year && d.month == prevMonthStart.month) prevM[bucket(d.day)] += toDouble(o['total']);
    }
    final current = bucket(today.day);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final labels = [for (var b = 0; b < 5; b++) '${months[today.month - 1]} ${b * 7 + 1}–${b == 4 ? thisLen : b * 7 + 7}'];
    final maxV = [...thisM, ...prevM].fold<double>(0, (m, v) => v > m ? v : m);
    final chart = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(LucideIcons.trendingUp, size: 18, color: Color(0xFF16A34A)),
          const SizedBox(width: 10),
          const Text('Sales Performance', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
          const Spacer(),
          for (final (c, l) in const [(Color(0xFF16A34A), 'This Month'), (Color(0xFF2563EB), 'Previous Month')]) ...[
            Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text(l, style: const TextStyle(fontSize: 12.5, color: W.g700)),
            const SizedBox(width: 14),
          ],
        ]),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.only(right: 24),
          child: SizedBox(
          height: 220,
          child: LineChart(
            LineChartData(
              minY: 0,
              maxY: maxV <= 0 ? 1000 : maxV * 1.2,
              gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: W.g100, dashArray: [4, 4])),
              borderData: FlBorderData(show: false),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 54, getTitlesWidget: (v, m) => Text(moneyShort(v), style: const TextStyle(fontSize: 11, color: W.g500)))),
                bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, interval: 1, getTitlesWidget: (v, m) => v % 1 != 0 || v < 0 || v > 4 ? const SizedBox() : Text(labels[v.toInt()], style: const TextStyle(fontSize: 11, color: W.g500)))),
              ),
              lineTouchData: LineTouchData(touchTooltipData: LineTouchTooltipData(getTooltipItems: (spots) => [for (final x in spots) LineTooltipItem(money(x.y), TextStyle(color: x.bar.color, fontWeight: FontWeight.w600, fontSize: 12))])),
              lineBarsData: [
                LineChartBarData(spots: [for (var i = 0; i < 5; i++) FlSpot(i.toDouble(), prevM[i])], isCurved: true, preventCurveOverShooting: true, color: const Color(0xFF2563EB), barWidth: 2, dotData: const FlDotData(show: true), belowBarData: BarAreaData(show: true, color: const Color(0xFF2563EB).withValues(alpha: .08))),
                LineChartBarData(spots: [for (var i = 0; i <= current; i++) FlSpot(i.toDouble(), thisM[i])], isCurved: true, preventCurveOverShooting: true, color: const Color(0xFF16A34A), barWidth: 2.5, dotData: const FlDotData(show: true), belowBarData: BarAreaData(show: true, color: const Color(0xFF16A34A).withValues(alpha: .12))),
              ],
            ),
            duration: Duration.zero,
          ),
        )),
      ]),
    );
    final keyMetrics = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(LucideIcons.chartColumn, size: 18, color: Color(0xFF16A34A)),
          const SizedBox(width: 10),
          const Text('Key Metrics', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: W.g50, borderRadius: BorderRadius.circular(8)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(LucideIcons.calendarDays, size: 13, color: W.g500),
              const SizedBox(width: 6),
              Text('${dateShort(_range.from.toIso8601String())}  →  ${dateShort(_range.to.toIso8601String())}', style: const TextStyle(fontSize: 12.5, color: W.g700)),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        tiles.isEmpty ? const Padding(padding: EdgeInsets.all(20), child: Center(child: Text('All metrics are hidden — turn them on from Display Options.', style: TextStyle(color: W.g400)))) : WebGrid(columns: 3, gap: 12, minWidth: 180, children: tiles),
      ]),
    );

    final filters = WebCard(
      padding: const EdgeInsets.all(12),
      child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        WebRangeBar(range: _range, flat: true, greyPresets: true, onChanged: (r) => _set(() => _range = r)),
        SizedBox(width: 150, child: WebSelect<String>(value: _status, options: const [('all', 'All Status'), ('Delivered', 'Delivered'), ('Pending', 'Pending'), ('In Progress', 'In Progress'), ('Canceled', 'Canceled')], onChanged: (v) => _set(() => _status = v))),
        SizedBox(width: 160, child: WebSelect<String>(value: _channel, options: const [('all', 'Store & Online'), ('offline', 'Store'), ('online', 'Online')], onChanged: (v) => _set(() => _channel = v))),
        SizedBox(width: 160, child: WebSelect<String>(value: _payment, options: const [('all', 'All Payments'), ('paid', 'Paid'), ('due', 'Due'), ('due_cleared', 'Due Cleared')], onChanged: (v) => _set(() => _payment = v))),
        SizedBox(width: 220, child: WebSelect<int>(value: _customer, options: [(0, 'All Customers'), (-1, 'Guest (no customer)'), for (final c in customers) (toInt(c['id']), '${c['name']}${c['phone'] != null ? ' (${c['phone']})' : ''}')], onChanged: (v) => _set(() => _customer = v))),
        SizedBox(width: 220, child: WebSelect<int>(value: _product, options: [(0, 'All Products'), for (final e in products.entries) (e.key, e.value)], onChanged: (v) => _set(() => _product = v))),
      ]),
    );

    final cols = <(String, WebCol, Widget Function(Map<String, dynamic>))>[
      if (on('sh2-ledger', 'sh2-c-time')) ('time', WebCol('Time', flex: 1.1, onSort: () => _sortBy('time'), sorted: _sort == 'time' ? _asc : null), (r) => Text(dateTime(r['createdAt']), style: const TextStyle(fontSize: 12.5, color: W.g700))),
      if (on('sh2-ledger', 'sh2-c-order')) ('order', WebCol('Order ID', flex: 1.1, onSort: () => _sortBy('order'), sorted: _sort == 'order' ? _asc : null), (r) => Cell2(r['localRef'] != null ? 'Uploading…' : '${r['number']}', aColor: W.blue, bold: true, onTap: () => _open(r))),
      if (on('sh2-ledger', 'sh2-c-customer'))
        ('customer', WebCol('Customer', flex: 1.4, onSort: () => _sortBy('customer'), sorted: _sort == 'customer' ? _asc : null), (r) => Cell2('${r['customer'] ?? 'Walk-in Customer'}', b: r['type'] == 'online' ? 'Online order' : null, bColor: const Color(0xFF2563EB))),
      if (on('sh2-ledger', 'sh2-c-items'))
        ('items', WebCol('Items', flex: 2.2, onSort: () => _sortBy('items'), sorted: _sort == 'items' ? _asc : null), (r) {
          final l = items(r);
          return Text(l.isEmpty ? '—' : '${l.length} item${l.length == 1 ? '' : 's'} — ${l.map((i) => '${i['qty']}x ${i['name']}').join(', ')}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g700));
        }),
      if (on('sh2-ledger', 'sh2-c-payment')) ('payment', WebCol('Payment', flex: .9, onSort: () => _sortBy('payment'), sorted: _sort == 'payment' ? _asc : null), (r) => Text('${r['paymentMethod'] ?? '—'}', style: const TextStyle(fontSize: 13))),
      if (on('sh2-ledger', 'sh2-c-total')) ('total', WebCol('Total', flex: .9, onSort: () => _sortBy('total'), sorted: _sort == 'total' ? _asc : null), (r) => Text(money(r['total']), style: const TextStyle(fontSize: 13, color: W.g900))),
      if (on('sh2-ledger', 'sh2-c-paid'))
        ('paid', WebCol('Paid', flex: 1.1, onSort: () => _sortBy('paid'), sorted: _sort == 'paid' ? _asc : null), (r) {
          final label = '${r['_label']}';
          final open = (r['_credits'] as List).where((c) => toDouble(c['balance']) > 0.004).cast<Map<String, dynamic>>().toList();
          return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(money(r['_paid']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
            Row(children: [
              WebBadge(label, color: label == 'Due' ? const Color(0xFFB91C1C) : label == 'Due Cleared' ? const Color(0xFF0369A1) : const Color(0xFF047857), bg: label == 'Due' ? const Color(0xFFFEF2F2) : label == 'Due Cleared' ? const Color(0xFFF0F9FF) : const Color(0xFFECFDF5)),
              if (open.isNotEmpty && (s.perms.credits || s.perms.billing)) ...[
                const SizedBox(width: 4),
                WebIconAction(LucideIcons.handCoins, color: W.green, tooltip: 'Record a due payment', onTap: () => collectDues(context, open)),
              ],
            ]),
          ]);
        }),
      if (on('sh2-ledger', 'sh2-c-invoice')) ('invoice', const WebCol('Invoice', width: 80), (r) => WebIconAction(LucideIcons.fileText, color: W.g600, tooltip: 'Invoice for ${r['number']}', onTap: () => printOrder(context, r))),
    ];

    return WebPage(
      title: 'Sales History',
      subtitle: 'Every sale — store bills and delivered online orders, with payments and dues',
      onRefresh: () async {
        await s.syncNow(only: const ['orders', 'dues']);
        await s.reloadPage('dues_paid');
      },
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Sales ${_range.label}', const ['Time', 'Order', 'Customer', 'Channel', 'Items', 'Payment', 'Total', 'Paid', 'Due', 'Status'], [
              for (final r in list) [dateTime(r['createdAt']), r['number'], r['customer'], r['type'] == 'online' ? 'Online' : 'Store', items(r).map((i) => '${i['qty']}x ${i['name']}').join(', '), r['paymentMethod'], toDouble(r['total']), r['_paid'], r['_due'], r['_label']],
            ])),
      ],
      children: [
        if (_prefs.item('sh2-chart') || on('sh2-metrics')) ...[
          LayoutBuilder(builder: (context, c) {
            final both = _prefs.item('sh2-chart') && on('sh2-metrics');
            if (!both) return _prefs.item('sh2-chart') ? chart : keyMetrics;
            return c.maxWidth > 1100
                ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: chart), const SizedBox(width: 12), Expanded(child: keyMetrics)])
                : Column(children: [chart, const SizedBox(height: 12), keyMetrics]);
          }),
          const SizedBox(height: 12),
        ],
        if (_prefs.item('sh2-filters')) ...[filters, const SizedBox(height: 12)],
        if (on('sh2-ledger'))
          WebCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Icon(LucideIcons.bookOpen, size: 17, color: W.blue),
                const SizedBox(width: 10),
                const Text('Sales Ledger', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
                const SizedBox(width: 16),
                const Text('Show ', style: TextStyle(fontSize: 13, color: W.g700)),
                SizedBox(width: 84, child: WebSelect<int>(value: _per, options: const [(10, '10'), (20, '20'), (50, '50'), (100, '100'), (0, 'All')], onChanged: (v) => _set(() => _per = v))),
                const Spacer(),
                WebSearch(width: 260, hint: 'Search order, customer, product…', onChanged: (v) => _set(() => _q = v)),
              ]),
              const SizedBox(height: 12),
              WebTable(
                cols: [for (final c in cols) c.$2],
                rows: [for (final r in shown) [for (final c in cols) c.$3(r)]],
                rowHeight: 62,
                onRowTap: [for (final r in shown) () => _open(r)],
                empty: const Center(child: Text('No sales match these filters.', style: TextStyle(color: W.g500))),
              ),
              if (_per > 0)
                WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v), extra: '  ·  Total ${money(list.fold<double>(0, (t, r) => t + toDouble(r['total'])))}')
              else
                Padding(padding: const EdgeInsets.only(top: 10), child: Text('${list.length} sales · Total ${money(list.fold<double>(0, (t, r) => t + toDouble(r['total'])))}', style: const TextStyle(fontSize: 13, color: W.g700))),
            ]),
          ),
      ],
    );
  }

  void _open(Map o) {
    if (o['localRef'] != null) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))));
  }
}

/// ₹12.5k / ₹1.2L for chart axes.
String moneyShort(double v) => v >= 100000 ? '₹${(v / 100000).toStringAsFixed(v % 100000 == 0 ? 0 : 1)}L' : v >= 1000 ? '₹${(v / 1000).toStringAsFixed(v % 1000 == 0 ? 0 : 1)}k' : '₹${v.round()}';

class _Tile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label, value;
  final Widget sub;
  const _Tile({required this.icon, required this.color, required this.label, required this.value, required this.sub});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: W.g100), boxShadow: const [BoxShadow(color: Color(0x0A101828), blurRadius: 2, offset: Offset(0, 1))]),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 32, height: 32, decoration: BoxDecoration(color: color, shape: BoxShape.circle), child: Icon(icon, size: 16, color: Colors.white)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g700)),
              FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, maxLines: 1, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: color == const Color(0xFF1E293B) ? const Color(0xFF1E293B) : color))),
              DefaultTextStyle.merge(style: const TextStyle(fontSize: 12), child: sub),
            ]),
          ),
        ]),
      );
}
