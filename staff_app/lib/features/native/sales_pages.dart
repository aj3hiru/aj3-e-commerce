import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../ds/ds.dart';
import '../../widgets/common.dart';
import '../../widgets/web.dart';
import '../orders/order_detail_screen.dart';
import '../reports/report_export.dart';
import 'kit.dart';

/// A sale: every store bill, and online orders once delivered (never cancelled).
/// Every order for reports: the last ~15 months (downloaded in the background) with the fresher
/// 60-day list on top, so any period opens offline.
List<Map<String, dynamic>> allOrders(AppState s) {
  final recent = s.list('orders');
  final ids = {for (final o in recent) o['id']};
  final older = ((s.pageData['sales_ledger']?['data'] as List?) ?? const []).cast<Map>().where((o) => !ids.contains(o['id'])).map((e) => Map<String, dynamic>.from(e));
  return [...older, ...recent];
}

bool isSale(Map o) => o['status'] != 'Canceled' && (o['type'] != 'online' || o['status'] == 'Delivered');

class _RangeChips extends StatelessWidget {
  final DateRange range;
  final ValueChanged<DateRange> onChanged;
  const _RangeChips({required this.range, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    if (isWide(context)) return WebRangeBar(range: range, onChanged: onChanged);
    return Wrap(spacing: 6, runSpacing: 6, children: [
      for (final k in const ['today', 'yesterday', '7d', 'this_month', 'prev_month'])
        ChoiceChip(label: Text(DateRange.preset(k).label), selected: range.key == k, onSelected: (_) => onChanged(DateRange.preset(k))),
      ActionChip(
        avatar: const Icon(Icons.date_range_rounded, size: 16),
        label: Text(range.key == 'custom' ? range.label : 'Dates…'),
        onPressed: () async {
          final r = await showDateRangePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime.now(), initialDateRange: DateTimeRange(start: range.from, end: range.to));
          if (r != null) onChanged(DateRange('custom', DateTime(r.start.year, r.start.month, r.start.day), DateTime(r.end.year, r.end.month, r.end.day)));
        },
      ),
    ]);
  }
}

void _openOrder(BuildContext context, Map o) => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))));

/* ───────────────────────── Sales History ───────────────────────── */

class SalesHistoryPage extends StatefulWidget {
  const SalesHistoryPage({super.key});
  @override
  State<SalesHistoryPage> createState() => _SalesHistoryPageState();
}

class _SalesHistoryPageState extends State<SalesHistoryPage> {
  DateRange _range = DateRange.preset('today');
  String _channel = 'all', _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final q = _q.trim().toLowerCase();
    final list = allOrders(s).where((o) => isSale(o) && _range.contains(o['createdAt']) && (_channel == 'all' || o['type'] == _channel) &&
        (q.isEmpty || '${o['number']} ${o['customer']} ${((o['items'] as List?) ?? const []).map((i) => (i as Map)['name']).join(' ')}'.toLowerCase().contains(q))).toList()
      ..sort((a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}'));
    final total = list.fold<double>(0, (t, o) => t + toDouble(o['total']));
    final due = list.fold<double>(0, (t, o) => t + toDouble(o['due']));
    return NativeScreen(
      title: 'Sales History',
      subtitle: 'Every sale — store bills and delivered online orders',
      onRefresh: () => s.syncNow(only: const ['orders']),
      actions: [
        NativeAction('Export', LucideIcons.download, () => exportTable(context, 'Sales ${_range.label}', const ['Order', 'Date', 'Customer', 'Sale', 'Items', 'Total', 'Due', 'Payment'], [
              for (final o in list) [o['number'], dateTime(o['createdAt']), o['customer'], o['type'] == 'online' ? 'Online' : 'Store', ((o['items'] as List?) ?? const []).length, toDouble(o['total']), toDouble(o['due']), o['paymentMethod']],
            ]), primary: false),
      ],
      children: [
        _RangeChips(range: _range, onChanged: (r) => setState(() => _range = r)),
        NStats([
          (LucideIcons.indianRupee, const Color(0xFF16A34A), money(total), 'Sales'),
          (LucideIcons.receipt, const Color(0xFF2563EB), '${list.length}', 'Bills / orders'),
          (LucideIcons.store, const Color(0xFFD97706), '${list.where((o) => o['type'] != 'online').length}', 'Store bills'),
          (LucideIcons.handCoins, const Color(0xFFDC2626), money(due), 'Still due'),
        ]),
        NFilters(hint: 'Order, customer or product', onSearch: (v) => setState(() => _q = v), tabs: const [('all', 'Store & Online'), ('offline', 'Store'), ('online', 'Online')], tab: _channel, onTab: (v) => setState(() => _channel = v)),
        NList(
          cols: const [WebCol('Order', flex: 1.1), WebCol('Date', flex: 1.1), WebCol('Customer', flex: 1.4), WebCol('Sale', flex: .7), WebCol('Total', flex: .9, right: true), WebCol('Due', flex: .8, right: true)],
          empty: 'No sales in these dates.',
          rows: [
            for (final o in list)
              NRow(
                title: '${o['number']} · ${money(o['total'])}',
                subtitle: '${o['customer'] ?? 'Walk-in'} · ${dateTime(o['createdAt'])}${toDouble(o['due']) > 0 ? ' · Due ${money(o['due'])}' : ''}',
                trailing: WebBadge(o['type'] == 'online' ? 'Online' : 'Store', color: o['type'] == 'online' ? const Color(0xFF7C3AED) : const Color(0xFFB45309), bg: o['type'] == 'online' ? const Color(0xFFF3E8FF) : const Color(0xFFFEF3C7)),
                onTap: () => _openOrder(context, o),
                cells: [
                  Text('${o['number']}', style: const TextStyle(fontWeight: FontWeight.w600, color: W.blue)),
                  Text(dateTime(o['createdAt']), style: const TextStyle(fontSize: 12.5)),
                  Text('${o['customer'] ?? 'Walk-in'}', maxLines: 1, overflow: TextOverflow.ellipsis),
                  Align(alignment: Alignment.centerLeft, child: WebBadge(o['type'] == 'online' ? 'Online' : 'Store', color: o['type'] == 'online' ? const Color(0xFF7C3AED) : const Color(0xFFB45309), bg: o['type'] == 'online' ? const Color(0xFFF3E8FF) : const Color(0xFFFEF3C7))),
                  Text(money(o['total']), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(toDouble(o['due']) > 0 ? money(o['due']) : '—', textAlign: TextAlign.right, style: TextStyle(color: toDouble(o['due']) > 0 ? const Color(0xFFDC2626) : W.g400)),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Sales Analytics ───────────────────────── */

class AnalyticsPage extends StatefulWidget {
  const AnalyticsPage({super.key});
  @override
  State<AnalyticsPage> createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends State<AnalyticsPage> {
  DateRange _range = DateRange.preset('this_month');

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final sales = s.list('orders').where((o) => isSale(o) && _range.contains(o['createdAt'])).toList();
    final prev = _range.previous();
    final before = s.list('orders').where((o) => isSale(o) && prev.contains(o['createdAt'])).fold<double>(0, (t, o) => t + toDouble(o['total']));
    final total = sales.fold<double>(0, (t, o) => t + toDouble(o['total']));
    final units = sales.fold<int>(0, (t, o) => t + ((o['items'] as List?) ?? const []).fold<int>(0, (u, i) => u + toInt((i as Map)['qty'])));
    final change = before > 0 ? (total - before) / before * 100 : null;

    // Sales per day.
    final days = _range.to.difference(_range.from).inDays + 1;
    final perDay = List<double>.filled(days.clamp(1, 400), 0);
    for (final o in sales) {
      final t = ist(DateTime.parse('${o['createdAt']}').toUtc());
      final i = DateTime(t.year, t.month, t.day).difference(_range.from).inDays;
      if (i >= 0 && i < perDay.length) perDay[i] += toDouble(o['total']);
    }
    // Top products and payment split.
    final byProduct = <String, (int, double)>{};
    final byMethod = <String, double>{};
    for (final o in sales) {
      for (final i in ((o['items'] as List?) ?? const []).cast<Map>()) {
        final cur = byProduct['${i['name']}'] ?? (0, 0.0);
        byProduct['${i['name']}'] = (cur.$1 + toInt(i['qty']), cur.$2 + toDouble(i['price']) * toInt(i['qty']));
      }
      final pays = ((o['pays'] as List?) ?? const []).cast<Map>();
      if (pays.isEmpty) {
        final m = '${o['paymentMethod'] ?? 'Other'}';
        byMethod[m] = (byMethod[m] ?? 0) + toDouble(o['paid'] ?? o['total']);
      } else {
        for (final p in pays) {
          byMethod['${p['method']}'] = (byMethod['${p['method']}'] ?? 0) + toDouble(p['amount']);
        }
      }
    }
    final top = byProduct.entries.toList()..sort((a, b) => b.value.$2.compareTo(a.value.$2));
    final maxY = perDay.fold<double>(0, (a, b) => b > a ? b : a);

    return NativeScreen(
      title: 'Sales Analytics',
      subtitle: 'How the shop is doing — from the sales on this device',
      onRefresh: () => s.syncNow(only: const ['orders']),
      children: [
        _RangeChips(range: _range, onChanged: (r) => setState(() => _range = r)),
        NStats([
          (LucideIcons.indianRupee, const Color(0xFF16A34A), money(total), change == null ? 'Sales' : 'Sales (${change >= 0 ? '+' : ''}${change.toStringAsFixed(0)}% vs before)'),
          (LucideIcons.receipt, const Color(0xFF2563EB), '${sales.length}', 'Orders'),
          (LucideIcons.shoppingBasket, const Color(0xFF7C3AED), sales.isEmpty ? money(0) : money(total / sales.length), 'Average order'),
          (LucideIcons.package, const Color(0xFFD97706), '$units', 'Items sold'),
        ]),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Sales per day', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            SizedBox(
              height: 220,
              child: BarChart(BarChartData(
                maxY: maxY <= 0 ? 100 : maxY * 1.15,
                gridData: FlGridData(show: true, drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.border, strokeWidth: 1, dashArray: [4, 4])),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(),
                  rightTitles: const AxisTitles(),
                  leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 46, getTitlesWidget: (v, m) => v >= m.max ? const SizedBox.shrink() : Text(moneyCompact(v), style: const TextStyle(fontSize: 10, color: AppColors.faint)))),
                  bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (v, m) {
                    final i = v.toInt();
                    final step = (perDay.length / 7).ceil().clamp(1, 60);
                    if (i % step != 0) return const SizedBox();
                    return Padding(padding: const EdgeInsets.only(top: 6), child: Text(DateFormat('d MMM').format(_range.from.add(Duration(days: i))), style: const TextStyle(fontSize: 10, color: AppColors.muted)));
                  })),
                ),
                barTouchData: BarTouchData(touchTooltipData: BarTouchTooltipData(getTooltipColor: (_) => AppColors.text, getTooltipItem: (g, gi, rod, ri) => BarTooltipItem('${DateFormat('d MMM').format(_range.from.add(Duration(days: g.x)))}\n${money(rod.toY)}', const TextStyle(color: Colors.white, fontSize: 12)))),
                barGroups: [for (var i = 0; i < perDay.length; i++) BarChartGroupData(x: i, barRods: [BarChartRodData(toY: perDay[i], width: perDay.length > 40 ? 4 : 14, color: DS.primary, borderRadius: BorderRadius.circular(4))])],
              )),
            ),
          ]),
        ),
        Flex(
          direction: isWide(context) ? Axis.horizontal : Axis.vertical,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Flexible(
              flex: isWide(context) ? 3 : 0,
              child: NList(
                cols: const [WebCol('Top products', flex: 2.4), WebCol('Qty', flex: .6, right: true), WebCol('Sales', flex: 1, right: true)],
                empty: 'No sales in these dates.',
                rows: [
                  for (final e in top.take(10))
                    NRow(title: e.key, subtitle: '${e.value.$1} sold', trailing: Text(money(e.value.$2), style: const TextStyle(fontWeight: FontWeight.w700)), cells: [
                      Text(e.key, maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text('${e.value.$1}', textAlign: TextAlign.right),
                      Text(money(e.value.$2), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600)),
                    ]),
                ],
              ),
            ),
            SizedBox(width: isWide(context) ? 12 : 0, height: isWide(context) ? 0 : 10),
            Flexible(
              flex: isWide(context) ? 2 : 0,
              child: NList(
                cols: const [WebCol('Paid by', flex: 1.4), WebCol('Amount', flex: 1, right: true)],
                empty: 'No payments.',
                rows: [
                  for (final e in (byMethod.entries.toList()..sort((a, b) => b.value.compareTo(a.value))))
                    NRow(title: e.key, trailing: Text(money(e.value), style: const TextStyle(fontWeight: FontWeight.w700)), cells: [Text(e.key), Text(money(e.value), textAlign: TextAlign.right)]),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── GST Report ───────────────────────── */

class GstReportPage extends StatefulWidget {
  const GstReportPage({super.key});
  @override
  State<GstReportPage> createState() => _GstReportPageState();
}

class _GstReportPageState extends State<GstReportPage> {
  String _period = 'month';
  DateRange _range = DateRange.preset('this_month');
  String _tab = 'rate', _channel = 'all';

  DateRange _periodRange(String p) {
    final t = DateRange.preset('today').to;
    final fy = t.month >= 4 ? t.year : t.year - 1;
    return switch (p) {
      'month' => DateRange('month', DateTime(t.year, t.month, 1), DateTime(t.year, t.month + 1, 0)),
      'prev' => DateRange('prev', DateTime(t.year, t.month - 1, 1), DateTime(t.year, t.month, 0)),
      'quarter' => () {
          final qStart = ((t.month - 4) % 12 ~/ 3) * 3 + 4;
          final y = qStart > t.month ? t.year - 1 : t.year;
          final s = DateTime(y, qStart > 12 ? qStart - 12 : qStart, 1);
          return DateRange('quarter', s, DateTime(s.year, s.month + 3, 0));
        }(),
      'year' => DateRange('year', DateTime(fy, 4, 1), DateTime(fy + 1, 3, 31)),
      _ => _range,
    };
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final products = {for (final p in s.list('products')) toInt(p['id']): p};
    final orders = allOrders(s).where((o) => isSale(o) && (_channel == 'all' || o['type'] == _channel) && _range.contains(o['createdAt'])).toList()..sort((a, b) => '${a['createdAt']}'.compareTo('${b['createdAt']}'));
    final byRate = <double, List<double>>{}; // taxable, tax, value
    final byHsn = <String, List<double>>{}; // qty, taxable, tax
    final hsnName = <String, String>{};
    final byProduct = <String, List<double>>{};
    final invoices = <List<Object?>>[];
    double tTax = 0, tTaxable = 0;
    for (final o in orders) {
      double oTaxable = 0, oTax = 0;
      final items = ((o['items'] as List?) ?? const []).cast<Map>();
      final sub = items.fold<double>(0, (t, i) => t + toDouble(i['price']) * toInt(i['qty']));
      final disc = toDouble(o['discount']);
      for (final i in items) {
        final rate = toDouble(i['gstRate']), tax = toDouble(i['gst']);
        final line = toDouble(i['price']) * toInt(i['qty']);
        final taxable = rate > 0 && tax > 0 ? tax * 100 / rate : (sub > 0 ? line - disc * line / sub : line);
        oTaxable += taxable;
        oTax += tax;
        (byRate[rate] ??= [0, 0, 0])..[0] += taxable..[1] += tax..[2] += taxable + tax;
        final hsn = '${products[toInt(i['productId'])]?['hsn'] ?? ''}'.trim();
        final hk = '${hsn.isEmpty ? '—' : hsn} @ ${rate.toStringAsFixed(rate % 1 == 0 ? 0 : 1)}%';
        hsnName[hk] ??= '${i['name']}';
        (byHsn[hk] ??= [0, 0, 0])..[0] += toInt(i['qty'])..[1] += taxable..[2] += tax;
        (byProduct['${i['name']}'] ??= [0, 0, 0])..[0] += toInt(i['qty'])..[1] += taxable..[2] += tax;
      }
      tTax += oTax;
      tTaxable += oTaxable;
      invoices.add([o['number'], dateShort(o['createdAt']), o['customer'] ?? 'Walk-in', o['type'] == 'online' ? 'Online' : 'Store', oTaxable, oTax / 2, oTax / 2, oTaxable + oTax]);
    }
    String r2(double v) => v.toStringAsFixed(2);
    final head = switch (_tab) {
      'rate' => ['GST %', 'Taxable', 'CGST', 'SGST', 'Total tax', 'Value'],
      'hsn' => ['HSN', 'Description', 'Qty', 'Taxable', 'CGST', 'SGST'],
      'product' => ['Product', 'Qty', 'Taxable', 'GST', 'Value'],
      _ => ['Invoice', 'Date', 'Customer', 'Sale', 'Taxable', 'CGST', 'SGST', 'Value'],
    };
    final rows = switch (_tab) {
      'rate' => [for (final e in (byRate.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))) <Object?>['${e.key}%', e.value[0], e.value[1] / 2, e.value[1] / 2, e.value[1], e.value[2]]],
      'hsn' => [for (final e in (byHsn.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))) <Object?>[e.key, hsnName[e.key], e.value[0].toInt(), e.value[1], e.value[2] / 2, e.value[2] / 2]],
      'product' => [for (final e in (byProduct.entries.toList()..sort((a, b) => b.value[1].compareTo(a.value[1])))) <Object?>[e.key, e.value[0].toInt(), e.value[1], e.value[2], e.value[1] + e.value[2]]],
      _ => invoices.reversed.toList(),
    };
    return NativeScreen(
      title: 'GST Report',
      subtitle: 'Tax on your sales — by rate, HSN, product and invoice',
      onRefresh: () async {
        await s.syncNow(only: const ['orders', 'products']);
        await s.reloadPage('sales_ledger');
      },
      actions: [NativeAction('Export sheet', LucideIcons.fileSpreadsheet, () => exportTable(context, 'GST ${_tab.toUpperCase()} ${_range.label}', head, rows))],
      children: [
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final (k, l) in const [('month', 'This month'), ('prev', 'Last month'), ('quarter', 'This quarter'), ('year', 'This financial year')])
            ChoiceChip(label: Text(l), selected: _period == k, onSelected: (_) => setState(() {
                  _period = k;
                  _range = _periodRange(k);
                })),
          const SizedBox(width: 12),
          for (final (k, l) in const [('all', 'All sales'), ('offline', 'Store'), ('online', 'Online')])
            ChoiceChip(label: Text(l), selected: _channel == k, onSelected: (_) => setState(() => _channel = k)),
          const SizedBox(width: 12),
          ActionChip(
            avatar: const Icon(Icons.date_range_rounded, size: 16),
            label: Text(_period == 'custom' ? _range.label : 'Custom dates…'),
            onPressed: () async {
              final r = await showDateRangePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime.now(), initialDateRange: DateTimeRange(start: _range.from, end: _range.to.isAfter(DateTime.now()) ? DateTime.now() : _range.to));
              if (r != null) {
                setState(() {
                  _period = 'custom';
                  _range = DateRange('custom', DateTime(r.start.year, r.start.month, r.start.day), DateTime(r.end.year, r.end.month, r.end.day));
                });
              }
            },
          ),
        ]),
        Text('${DateFormat('d MMM yyyy').format(_range.from)} – ${DateFormat('d MMM yyyy').format(_range.to)}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        NStats([
          (LucideIcons.receipt, const Color(0xFF2563EB), '${orders.length}', 'Invoices'),
          (LucideIcons.indianRupee, const Color(0xFF16A34A), money(tTaxable), 'Taxable value'),
          (LucideIcons.percent, const Color(0xFF7C3AED), money(tTax), 'Total GST (CGST ${money(tTax / 2)} + SGST ${money(tTax / 2)})'),
          (LucideIcons.wallet, const Color(0xFFD97706), money(tTaxable + tTax), 'Invoice value'),
        ]),
        NFilters(hint: '', onSearch: (_) {}, tabs: const [('rate', 'Rate-wise'), ('hsn', 'HSN-wise'), ('product', 'Product-wise'), ('invoice', 'Invoice-wise')], tab: _tab, onTab: (v) => setState(() => _tab = v)),
        NList(
          cols: [for (var i = 0; i < head.length; i++) WebCol(head[i], flex: i == 0 || (head[i] == 'Description' || head[i] == 'Product' || head[i] == 'Customer') ? 1.6 : 1, right: i > 0 && rows.isNotEmpty && rows.first[i] is num)],
          empty: 'No sales in this period.',
          rows: [
            for (final r in rows)
              NRow(
                title: '${r[0]}${_tab == 'hsn' ? ' · ${r[1]}' : ''}',
                subtitle: _tab == 'invoice' ? '${r[1]} · ${r[2]} · Tax ${money((r[5] as double) + (r[6] as double))}' : 'Taxable ${money(r[_tab == 'rate' ? 1 : _tab == 'hsn' ? 3 : 2] as double)}',
                trailing: Text(money(r.last is num ? r.last as double : 0), style: const TextStyle(fontWeight: FontWeight.w700)),
                cells: [for (final c in r) Text(c is double ? r2(c) : '${c ?? '—'}', textAlign: c is num ? TextAlign.right : TextAlign.left, maxLines: 1, overflow: TextOverflow.ellipsis)],
              ),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Offers & Coupons ───────────────────────── */

class OffersPage extends StatefulWidget {
  const OffersPage({super.key});
  @override
  State<OffersPage> createState() => _OffersPageState();
}

class _OffersPageState extends State<OffersPage> {
  String _tab = 'coupons';
  @override
  Widget build(BuildContext context) => NativeData(
        key: ValueKey(_tab),
        name: _tab,
        builder: (context, data, reload) => _tab == 'coupons'
            ? _Coupons(rows: ((data as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList(), reload: reload, onTab: (t) => setState(() => _tab = t))
            : _Campaigns(rows: (((data as Map?)?['campaigns'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList(), reload: reload, onTab: (t) => setState(() => _tab = t)),
      );
}

String _couponState(Map c) {
  final now = DateTime.now().toUtc();
  if (c['status'] != 'active') return 'Off';
  if (c['paused'] == true) return 'Paused';
  if (c['endsAt'] != null && DateTime.parse('${c['endsAt']}').isBefore(now)) return 'Ended';
  if (c['startsAt'] != null && DateTime.parse('${c['startsAt']}').isAfter(now)) return 'Scheduled';
  if (toInt(c['used']) >= toInt(c['limit'])) return 'Used up';
  return 'Live';
}

Widget _stateBadge(String st) {
  final (Color c, Color bg) = switch (st) {
    'Live' => (const Color(0xFF15803D), const Color(0xFFDCFCE7)),
    'Scheduled' => (const Color(0xFF1D4ED8), const Color(0xFFDBEAFE)),
    'Paused' => (const Color(0xFFB45309), const Color(0xFFFEF3C7)),
    _ => (W.g600, W.g100),
  };
  return WebBadge(st, color: c, bg: bg);
}

class _Coupons extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  final ValueChanged<String> onTab;
  const _Coupons({required this.rows, required this.reload, required this.onTab});
  @override
  State<_Coupons> createState() => _CouponsState();
}

class _CouponsState extends State<_Coupons> {
  Future<void> _edit(Map<String, dynamic>? c) async {
    final s = context.read<AppState>();
    final title = TextEditingController(text: c?['title'] ?? ''), code = TextEditingController(text: c?['code'] ?? ''), value = TextEditingController(text: c == null ? '' : '${c['discountValue']}'), limit = TextEditingController(text: '${c?['limit'] ?? 100}');
    var type = c?['discountType'] ?? 'percentage', applies = c?['appliesTo'] ?? 'all';
    int? product = c?['productId'] == null ? null : toInt(c!['productId']), category = c?['categoryId'] == null ? null : toInt(c!['categoryId']);
    DateTime? ends = c?['endsAt'] == null ? null : DateTime.parse('${c!['endsAt']}').toLocal();
    final ok = await showAppDialog<bool>(
      context,
      title: c == null ? 'New coupon' : 'Edit coupon ${c['code']}',
      icon: LucideIcons.ticketPercent,
      width: 520,
      builder: (d) => StatefulBuilder(
        builder: (d, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AppField(controller: title, label: 'Title', required: true, autofocus: true, hint: 'e.g. Diwali offer'),
          const AppGap(),
          AppField(controller: code, label: 'Code', required: true, hint: 'DIWALI20', textCapitalization: TextCapitalization.characters),
          const AppGap(),
          AppSegmented<String>(options: const [('percentage', '% off'), ('fixed', '₹ off')], value: type, onChanged: (v) => set(() => type = v)),
          const AppGap(),
          AppField(controller: value, label: type == 'percentage' ? 'Percent off' : 'Amount off (₹)', required: true, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
          const AppGap(),
          AppSelect<String>(label: 'Works on', value: applies, options: const [('all', 'Everything'), ('product', 'One product'), ('category', 'One category')], onChanged: (v) => set(() => applies = v)),
          if (applies == 'product') ...[const AppGap(), AppSelect<int?>(label: 'Product', value: product, options: [(null, 'Choose…'), for (final p in s.list('products')) (toInt(p['id']), '${p['name']}')], onChanged: (v) => set(() => product = v))],
          if (applies == 'category') ...[const AppGap(), AppSelect<int?>(label: 'Category', value: category, options: [(null, 'Choose…'), for (final x in s.list('categories')) (toInt(x['id']), '${x['name']}')], onChanged: (v) => set(() => category = v))],
          const AppGap(),
          AppField(controller: limit, label: 'How many times it can be used', keyboardType: TextInputType.number),
          const AppGap(),
          Row(children: [
            Expanded(child: Text(ends == null ? 'No end date' : 'Ends ${DateFormat('d MMM yyyy').format(ends!)}')),
            TextButton(
              onPressed: () async {
                final picked = await showDatePicker(context: d, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 730)), initialDate: ends ?? DateTime.now().add(const Duration(days: 7)));
                if (picked != null) set(() => ends = DateTime(picked.year, picked.month, picked.day, 23, 59));
              },
              child: const Text('Set end date'),
            ),
            if (ends != null) IconButton(onPressed: () => set(() => ends = null), icon: const Icon(Icons.close_rounded, size: 18)),
          ]),
        ]),
      ),
      actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))],
    );
    if (ok != true || !mounted) return;
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: c == null ? 'POST' : 'PUT', path: c == null ? '/api/ecommerce/coupons2' : '/api/ecommerce/coupons2/${c['id']}', label: 'Coupon ${code.text.trim().toUpperCase()}',
        body: {
          'title': title.text.trim(), 'code': code.text.trim().toUpperCase(), 'discountType': type, 'discountValue': double.tryParse(value.text.trim()) ?? 0, 'appliesTo': applies,
          'productId': product, 'categoryId': category, 'numberOfTimes': int.tryParse(limit.text.trim()) ?? 1, 'status': 'active', 'isPaused': c?['paused'] == true,
          'startsAt': c?['startsAt'], 'endsAt': ends?.toUtc().toIso8601String(),
        },
        refresh: const ['coupons'],
      ),
      reload: widget.reload,
      done: 'Coupon saved.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows = widget.rows;
    return NativeScreen(
      title: 'Offers & Coupons',
      subtitle: 'Coupon codes customers enter at checkout',
      onRefresh: widget.reload,
      actions: [NativeAction('New Coupon', LucideIcons.plus, () => _edit(null))],
      children: [
        NFilters(hint: '', onSearch: (_) {}, tabs: const [('coupons', 'Coupons'), ('campaigns', 'Campaign offers')], tab: 'coupons', onTab: widget.onTab),
        NStats([
          (LucideIcons.ticketPercent, const Color(0xFF16A34A), '${rows.where((c) => _couponState(c) == 'Live').length}', 'Live'),
          (LucideIcons.clock, const Color(0xFF2563EB), '${rows.where((c) => _couponState(c) == 'Scheduled').length}', 'Scheduled'),
          (LucideIcons.users, const Color(0xFF7C3AED), '${rows.fold<int>(0, (t, c) => t + toInt(c['used']))}', 'Times used'),
          (LucideIcons.ticket, const Color(0xFF6B7280), '${rows.length}', 'All coupons'),
        ]),
        NList(
          cols: const [WebCol('Code', flex: 1), WebCol('Offer', flex: 1.6), WebCol('Works on', flex: 1.2), WebCol('Used', flex: .7), WebCol('Ends', flex: .9), WebCol('Status', flex: .8), WebCol('Actions', width: 110)],
          empty: 'No coupons yet.',
          rows: [
            for (final c in rows)
              NRow(
                title: '${c['code']} · ${c['discountType'] == 'percentage' ? '${c['discountValue']}%' : money(c['discountValue'])} off',
                subtitle: '${c['title']} · used ${c['used']}/${c['limit']}${c['endsAt'] != null ? ' · ends ${dateShort(c['endsAt'])}' : ''}',
                trailing: _stateBadge(_couponState(c)),
                onTap: () => _edit(c),
                cells: [
                  Text('${c['code']}', style: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'monospace')),
                  Cell2('${c['discountType'] == 'percentage' ? '${c['discountValue']}%' : money(c['discountValue'])} off', b: '${c['title']}'),
                  Text(c['appliesTo'] == 'all' ? 'Everything' : '${c['target'] ?? c['appliesTo']}', maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text('${c['used']} / ${c['limit']}'),
                  Text(c['endsAt'] == null ? '—' : dateShort(c['endsAt'])),
                  Align(alignment: Alignment.centerLeft, child: _stateBadge(_couponState(c))),
                  Row(children: [
                    DButton.icon(LucideIcons.squarePen, tooltip: 'Edit', variant: DVariant.ghost, onPressed: () => _edit(c)),
                    DButton.icon(c['paused'] == true ? LucideIcons.play : LucideIcons.pause, tooltip: c['paused'] == true ? 'Resume' : 'Pause', variant: DVariant.ghost, onPressed: () => nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/coupons2/${c['id']}', label: 'Coupon ${c['code']}', body: {'isPaused': c['paused'] != true}, refresh: const ['coupons']), reload: widget.reload)),
                  ]),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class _Campaigns extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  final ValueChanged<String> onTab;
  const _Campaigns({required this.rows, required this.reload, required this.onTab});
  @override
  State<_Campaigns> createState() => _CampaignsState();
}

class _CampaignsState extends State<_Campaigns> {
  String _state(Map c) {
    final now = DateTime.now().toUtc();
    if (c['isPaused'] == true) return 'Paused';
    if (c['endsAt'] != null && DateTime.parse('${c['endsAt']}').isBefore(now)) return 'Ended';
    if (c['startsAt'] != null && DateTime.parse('${c['startsAt']}').isAfter(now)) return 'Scheduled';
    return 'Live';
  }

  Future<void> _create() async {
    final s = context.read<AppState>();
    final name = TextEditingController(), value = TextEditingController();
    var type = 'percent', scope = 'all';
    int? target;
    DateTime? ends;
    final ok = await showAppDialog<bool>(
      context,
      title: 'New campaign offer',
      icon: LucideIcons.badgePercent,
      width: 520,
      builder: (d) => StatefulBuilder(
        builder: (d, set) {
          final targets = switch (scope) {
            'category' => [for (final x in s.list('categories')) (toInt(x['id']), '${x['name']}')],
            'brand' => [for (final x in s.list('brands')) (toInt(x['id']), '${x['name']}')],
            'product' => [for (final x in s.list('products')) (toInt(x['id']), '${x['name']}')],
            _ => <(int, String)>[],
          };
          return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            AppField(controller: name, label: 'Campaign name', required: true, autofocus: true, hint: 'e.g. Weekend sale'),
            const AppGap(),
            AppSegmented<String>(options: const [('percent', '% off'), ('amount', '₹ off')], value: type, onChanged: (v) => set(() => type = v)),
            const AppGap(),
            AppField(controller: value, label: type == 'percent' ? 'Percent off' : 'Amount off (₹)', required: true, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            const AppGap(),
            AppSelect<String>(label: 'Applies to', value: scope, options: const [('all', 'Every product'), ('category', 'A category'), ('brand', 'A brand'), ('product', 'A product')], onChanged: (v) => set(() {
                  scope = v;
                  target = null;
                })),
            if (scope != 'all') ...[const AppGap(), AppSelect<int?>(label: 'Which one', value: target, options: [(null, 'Choose…'), ...targets], onChanged: (v) => set(() => target = v))],
            const AppGap(),
            Row(children: [
              Expanded(child: Text(ends == null ? 'Starts now · no end date' : 'Starts now · ends ${DateFormat('d MMM yyyy').format(ends!)}')),
              TextButton(
                onPressed: () async {
                  final picked = await showDatePicker(context: d, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now().add(const Duration(days: 3)));
                  if (picked != null) set(() => ends = DateTime(picked.year, picked.month, picked.day, 23, 59));
                },
                child: const Text('Set end date'),
              ),
            ]),
          ]);
        },
      ),
      actions: [const DAction.cancel(), DAction('Start campaign', primary: true, onPressed: () async => popDialog(context, true))],
    );
    if (ok != true || !mounted) return;
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: 'POST', path: '/api/ecommerce/campaigns2', label: 'Campaign ${name.text.trim()}',
        body: {
          'name': name.text.trim(), 'scope': scope, 'discountType': type, 'discountValue': double.tryParse(value.text.trim()),
          'targets': scope == 'all' || target == null ? [] : [{'type': scope, 'id': target}], 'startsAt': null, 'endsAt': ends?.toUtc().toIso8601String(), 'isPaused': false,
        },
        refresh: const ['products'],
      ),
      reload: widget.reload,
      done: 'Campaign started — prices drop at once.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows = widget.rows;
    String offer(Map c) => c['discountType'] == 'percent' ? '${c['discountValue']}% off' : c['discountType'] == 'amount' ? '${money(c['discountValue'])} off' : 'Special prices';
    String scope(Map c) => c['scope'] == 'all' ? 'Every product' : '${((c['targets'] as List?) ?? const []).length} ${c['scope']}${((c['targets'] as List?) ?? const []).length == 1 ? '' : 's'}';
    return NativeScreen(
      title: 'Offers & Coupons',
      subtitle: 'Campaign offers drop prices automatically — no code needed',
      onRefresh: widget.reload,
      actions: [NativeAction('New Campaign', LucideIcons.plus, _create)],
      children: [
        NFilters(hint: '', onSearch: (_) {}, tabs: const [('coupons', 'Coupons'), ('campaigns', 'Campaign offers')], tab: 'campaigns', onTab: widget.onTab),
        NList(
          cols: const [WebCol('Campaign', flex: 1.6), WebCol('Offer', flex: 1), WebCol('Applies to', flex: 1), WebCol('Ends', flex: .9), WebCol('Status', flex: .8), WebCol('Actions', width: 110)],
          empty: 'No campaigns yet.',
          rows: [
            for (final c in rows)
              NRow(
                title: '${c['name']} · ${offer(c)}',
                subtitle: '${scope(c)}${c['endsAt'] != null ? ' · ends ${dateShort(c['endsAt'])}' : ''}',
                trailing: _stateBadge(_state(c)),
                cells: [
                  Text('${c['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(offer(c)),
                  Text(scope(c)),
                  Text(c['endsAt'] == null ? '—' : dateShort(c['endsAt'])),
                  Align(alignment: Alignment.centerLeft, child: _stateBadge(_state(c))),
                  Row(children: [
                    if (_state(c) != 'Ended')
                      DButton.icon(c['isPaused'] == true ? LucideIcons.play : LucideIcons.pause, tooltip: c['isPaused'] == true ? 'Resume' : 'Pause', variant: DVariant.ghost,
                          onPressed: () => nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/campaigns2/${c['id']}', label: 'Campaign ${c['name']}', body: {'action': c['isPaused'] == true ? 'resume' : 'pause'}, refresh: const ['products']), reload: widget.reload)),
                    if (_state(c) != 'Ended')
                      DButton.icon(LucideIcons.octagonX, tooltip: 'End now', variant: DVariant.ghost,
                          onPressed: () => nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/campaigns2/${c['id']}', label: 'End campaign ${c['name']}', body: {'action': 'end'}, refresh: const ['products']), reload: widget.reload)),
                  ]),
                ],
              ),
          ],
        ),
      ],
    );
  }
}
