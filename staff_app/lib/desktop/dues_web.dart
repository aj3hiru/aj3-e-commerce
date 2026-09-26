import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../features/dues/collect_sheet.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/web.dart';

/// "Due" as on the website: date range, number cards, filters and the dues table with Collect.
class DuesWeb extends StatefulWidget {
  const DuesWeb({super.key});
  @override
  State<DuesWeb> createState() => _DuesWebState();
}

class _DuesWebState extends State<DuesWeb> {
  DateRange _range = DateRange.preset('this_month');
  String _status = 'all', _promise = 'all', _source = 'all', _applies = 'ignore', _card = 'all';
  int _product = 0;
  String _q = '';
  int _page = 0, _per = 10;

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final dues = s.list('dues');
    final orders = {for (final o in s.list('orders')) toInt(o['id']): o};
    final today = DateRange.preset('today');
    DateTime? promised(Map d) => d['promised'] == null ? null : ist(DateTime.parse('${d['promised']}').toUtc());
    bool overdue(Map d) {
      final p = promised(d);
      return p != null && DateTime(p.year, p.month, p.day).isBefore(today.from);
    }

    bool dueToday(Map d) => d['promised'] != null && today.contains(d['promised']);
    final people = {for (final d in dues) '${d['customerId'] ?? d['customer']}'};
    final total = dues.fold<double>(0, (t, d) => t + toDouble(d['balance']));

    final q = _q.trim().toLowerCase();
    final list = dues.where((d) {
      final o = orders[toInt(d['orderId'])];
      if (_card == 'overdue' && !overdue(d)) return false;
      if (_card == 'today' && !dueToday(d)) return false;
      if (_status == 'unpaid' && toDouble(d['paid']) > 0) return false;
      if (_status == 'partly' && toDouble(d['paid']) <= 0) return false;
      if (_promise == 'overdue' && !overdue(d)) return false;
      if (_promise == 'today' && !dueToday(d)) return false;
      if (_promise == 'none' && d['promised'] != null) return false;
      if (_promise == 'set' && d['promised'] == null) return false;
      if (_source != 'all' && o != null && o['type'] != _source) return false;
      if (_product != 0 && (o == null || !((o['items'] as List?) ?? const []).cast<Map>().any((i) => toInt(i['productId']) == _product))) return false;
      if (_applies == 'created' && !_range.contains(d['createdAt'])) return false;
      if (_applies == 'promise' && !_range.contains(d['promised'])) return false;
      return q.isEmpty || '${d['customer']} ${d['phone'] ?? ''} ${d['orderNumber']} ${o == null ? '' : ((o['items'] as List?) ?? const []).cast<Map>().map((i) => i['name']).join(' ')}'.toLowerCase().contains(q);
    }).toList()
      ..sort((a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}'));
    final shown = WebPager.slice(list, _page, _per);
    final canCollect = s.perms.credits || s.perms.billing || s.perms.customers;

    return WebPage(
      title: 'Due',
      subtitle: 'Who owes what, when they promised to pay, and what has been collected',
      onRefresh: () => s.syncNow(only: const ['dues', 'customers', 'orders']),
      actions: [
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Dues', const ['Customer', 'Mobile', 'Order', 'Date', 'Amount', 'Paid', 'Balance', 'Promise date'], [
              for (final d in list) [d['customer'], d['phone'], d['orderNumber'], dateShort(d['createdAt']), toDouble(d['amount']), toDouble(d['paid']), toDouble(d['balance']), d['promised'] == null ? '' : dateShort(d['promised'])],
            ])),
      ],
      children: [
        WebRangeBar(
          range: _range,
          onChanged: (r) => _set(() {
            _range = r;
            if (_applies == 'ignore') _applies = 'created';
          }),
          below: const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('→  To filter the table by these dates, set "Date range applies to" (created or promise date).', style: TextStyle(fontSize: 12.5, color: W.g600)),
          ),
        ),
        const SizedBox(height: 20),
        WebGrid(children: [
          WebMetric(icon: LucideIcons.indianRupee, color: const Color(0xFFDC2626), value: money(total), label: 'Total Due', sub: '${dues.length} unpaid due${dues.length == 1 ? '' : 's'}', selected: _card == 'all', onTap: () => _set(() => _card = 'all')),
          WebMetric(icon: LucideIcons.triangleAlert, color: const Color(0xFFEA580C), value: money(dues.where(overdue).fold<double>(0, (t, d) => t + toDouble(d['balance']))), label: 'Overdue', sub: '${dues.where(overdue).length} past promise date', selected: _card == 'overdue', onTap: () => _set(() => _card = 'overdue')),
          WebMetric(icon: LucideIcons.calendarClock, color: const Color(0xFFD97706), value: money(dues.where(dueToday).fold<double>(0, (t, d) => t + toDouble(d['balance']))), label: 'Due Today', sub: '${dues.where(dueToday).length} promised for today', selected: _card == 'today', onTap: () => _set(() => _card = 'today')),
          WebMetric(icon: LucideIcons.users, color: const Color(0xFF0EA5E9), value: '${people.length}', label: 'People with Dues', sub: 'customers who owe money'),
        ]),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(14),
          child: WebGrid(columns: 5, gap: 12, minWidth: 170, children: [
            WebSelect<String>(icon: LucideIcons.receiptIndianRupee, label: 'Status', value: _status, options: const [('all', 'Unpaid only'), ('unpaid', 'Nothing paid yet'), ('partly', 'Partly paid')], onChanged: (v) => _set(() => _status = v)),
            WebSelect<String>(icon: LucideIcons.calendarClock, label: 'Promise Date', value: _promise, options: const [('all', 'All'), ('overdue', 'Overdue'), ('today', 'Due today'), ('set', 'Has a date'), ('none', 'No date set')], onChanged: (v) => _set(() => _promise = v)),
            WebSelect<String>(icon: LucideIcons.package, label: 'Order Source', value: _source, options: const [('all', 'All orders'), ('offline', 'In-store'), ('online', 'Online')], onChanged: (v) => _set(() => _source = v)),
            WebSelect<int>(icon: LucideIcons.package, label: 'Product', value: _product, options: [(0, 'All products'), for (final p in s.list('products')) (toInt(p['id']), '${p['name']}')], onChanged: (v) => _set(() => _product = v)),
            WebSelect<String>(icon: LucideIcons.calendar, label: 'Date range applies to', value: _applies, options: const [('ignore', 'Ignore date range'), ('created', 'Created'), ('promise', 'Promise date')], onChanged: (v) => _set(() => _applies = v)),
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
              WebSearch(width: 260, hint: 'Name, phone, order, product..', onChanged: (v) => _set(() => _q = v)),
            ]),
            const SizedBox(height: 16),
            WebTable(
              bordered: true,
              rowHeight: 82,
              cols: const [WebCol('Customer', flex: 1.3), WebCol('Order', flex: 1.3), WebCol('Amount / Paid', flex: 1.1), WebCol('Balance', flex: 1), WebCol('Promise Date', flex: 1.2), WebCol('Status', flex: .9), WebCol('Actions', width: 130)],
              rows: [
                for (final d in shown)
                  [
                    Cell2('${d['customer']}', b: d['phone'] as String?),
                    Cell2('${d['orderNumber']}', b: '${orders[toInt(d['orderId'])]?['type'] == 'online' ? 'Online' : 'In-store'} · ${dateShort(d['createdAt'])}', aColor: W.blue,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(d['orderId']))))),
                    Cell2(money(d['amount']), b: toDouble(d['paid']) > 0 ? 'Paid ${money(d['paid'])}' : null, bColor: const Color(0xFF16A34A)),
                    Text(money(d['balance']), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
                    d['promised'] == null
                        ? const Text('Not set', style: TextStyle(color: W.g400, fontSize: 15))
                        : Text(dateShort(d['promised']), style: TextStyle(fontSize: 15, color: overdue(d) ? const Color(0xFFDC2626) : W.g800, fontWeight: overdue(d) ? FontWeight.w600 : FontWeight.w400)),
                    WebPill(toDouble(d['paid']) > 0 ? 'Partly' : 'Unpaid', color: toDouble(d['paid']) > 0 ? W.yellow : W.grey, textColor: toDouble(d['paid']) > 0 ? W.g900 : Colors.white),
                    canCollect
                        ? Align(alignment: Alignment.centerLeft, child: WebButton('Collect', icon: LucideIcons.handCoins, color: W.green, height: 34, onPressed: () => collectDues(context, [d])))
                        : webDash,
                  ],
              ],
              empty: const Center(child: Text('No dues match — everyone has paid.', style: TextStyle(color: W.g500))),
            ),
            WebPager(
              total: list.length,
              page: _page,
              perPage: _per,
              onPage: (v) => setState(() => _page = v),
              onPerPage: (v) => _set(() => _per = v),
              extra: '  ·  Balance shown: ${money(list.fold<double>(0, (t, d) => t + toDouble(d['balance'])))}',
            ),
          ]),
        ),
      ],
    );
  }
}
