import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../features/dues/collect_sheet.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "Due" exactly as on the website (admin/ecommerce/due): date range, number cards, 5 filters,
/// Show [n] entries · Collect (ticked) · Search, the dues table (select, customer, order, amount &
/// paid, balance, promise date — click to change it, status, Collect + receipts ×N) and the
/// website's Display Options. Unpaid dues are the synced set; paid ones (last 180 days) page data.
class DuesWeb extends StatefulWidget {
  const DuesWeb({super.key});
  @override
  State<DuesWeb> createState() => _DuesWebState();
}

class _DuesWebState extends State<DuesWeb> {
  static final _def = displayDefs['ecom_due2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  DateRange _range = DateRange.preset('this_month');
  String _status = 'unpaid', _promise = 'all', _source = 'all', _dateField = 'none', _q = '';
  int _product = 0;
  int _page = 0, _per = 10; // 0 = all
  String _sort = 'promise';
  bool _asc = true;
  final Set<int> _picked = {};

  void _set(VoidCallback f) => setState(() {
        f();
        _page = 0;
      });

  void _sortBy(String k) => setState(() {
        if (_sort == k) {
          _asc = !_asc;
        } else {
          _sort = k;
          _asc = k == 'customer' || k == 'promise';
        }
      });

  bool get _filtersOn => _status != 'unpaid' || _promise != 'all' || _source != 'all' || _product != 0 || _dateField != 'none' || _q.isNotEmpty;

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final unpaid = s.list('dues');
    final paid = ((s.pageData['dues_paid']?['data'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).where((d) => !unpaid.any((u) => u['id'] == d['id'])).toList();
    final all = [...unpaid, ...paid];
    final today = DateRange.preset('today');
    DateTime? day(Object? iso) {
      final d = parseDate(iso)?.toLocal();
      return d == null ? null : DateTime(d.year, d.month, d.day);
    }
    bool open(Map d) => toDouble(d['balance']) > 0.004;
    int overdueDays(Map d) {
      final p = day(d['promised']);
      return !open(d) || p == null ? 0 : today.from.difference(p).inDays.clamp(0, 1 << 30);
    }
    bool dueToday(Map d) => open(d) && day(d['promised']) == today.from;
    final dues = unpaid.where(open).toList();
    final people = {for (final d in dues) '${d['customerId'] ?? d['customer']}'};

    final q = _q.trim().toLowerCase();
    final list = all.where((d) {
      final o = open(d), part = toDouble(d['paid']) > 0.004;
      if (_status == 'unpaid' && !o) return false;
      if (_status == 'partial' && !(o && part)) return false;
      if (_status == 'paid' && o) return false;
      if (_promise == 'overdue' && overdueDays(d) <= 0) return false;
      if (_promise == 'today' && !dueToday(d)) return false;
      if (_promise == 'upcoming' && !(day(d['promised']) != null && day(d['promised'])!.isAfter(today.from))) return false;
      if (_promise == 'none' && d['promised'] != null) return false;
      if (_source != 'all' && d['orderType'] != _source) return false;
      if (_product != 0 && !((d['products'] as List?) ?? const []).cast<Map>().any((p) => toInt(p['id']) == _product)) return false;
      if (_dateField == 'created' && !_range.contains(d['createdAt'])) return false;
      if (_dateField == 'promised' && !_range.contains(d['promised'])) return false;
      if (_dateField == 'paid' && !((d['payments'] as List?) ?? const []).cast<Map>().any((p) => _range.contains(p['at']))) return false;
      if (q.isEmpty) return true;
      final hay = '${d['customer']} ${d['phone'] ?? ''} ${d['orderNumber']} ${((d['products'] as List?) ?? const []).cast<Map>().map((p) => p['name']).join(' ')}'.toLowerCase();
      return hay.contains(q);
    }).toList();
    int cmp(Map a, Map b) {
      switch (_sort) {
        case 'balance':
          return toDouble(a['balance']).compareTo(toDouble(b['balance']));
        case 'customer':
          return '${a['customer']}'.toLowerCase().compareTo('${b['customer']}'.toLowerCase());
        case 'created':
          return '${a['createdAt']}'.compareTo('${b['createdAt']}');
        default: // nearest promise first; no date last (by balance)
          if (a['promised'] == null || b['promised'] == null) {
            if (a['promised'] == b['promised']) return toDouble(b['balance']).compareTo(toDouble(a['balance'])) * (_asc ? 1 : -1);
            return a['promised'] == null ? (_asc ? 1 : -1) : (_asc ? -1 : 1);
          }
          return '${a['promised']}'.compareTo('${b['promised']}');
      }
    }
    list.sort((a, b) => _asc ? cmp(a, b) : cmp(b, a));
    final shown = _per == 0 ? list : WebPager.slice(list, _page, _per);
    final canCollect = s.perms.credits || s.perms.billing || s.perms.customers;
    _picked.removeWhere((id) => !list.any((d) => toInt(d['id']) == id && open(d)));
    final picked = list.where((d) => _picked.contains(toInt(d['id']))).toList();

    Future<void> promiseDate(Map<String, dynamic> d) async {
      final at = day(d['promised']) ?? today.from;
      final v = await showDatePicker(context: context, initialDate: at, firstDate: today.from.subtract(const Duration(days: 365)), lastDate: today.from.add(const Duration(days: 730)), helpText: 'Promise date · ${d['customer']}');
      if (v == null || !context.mounted) return;
      final ymd = '${v.year}-${'${v.month}'.padLeft(2, '0')}-${'${v.day}'.padLeft(2, '0')}';
      await s.enqueue(OutboxItem(
        id: newId(), method: 'POST', path: '/api/ecommerce/due/set-date', body: {'creditId': toInt(d['id']), 'promisedDate': '${ymd}T12:00:00+05:30'},
        label: '${d['customer']}: promise date ${dateShort(v.toIso8601String())}', effect: {'kind': 'due', 'id': d['id'], 'fields': {'promised': DateTime.utc(v.year, v.month, v.day, 6, 30).toIso8601String()}}, refresh: const ['dues'],
      ));
      if (context.mounted) toast(context, '${d['customer']}: promise date set to ${dateShort(v.toIso8601String())}.');
    }

    Future<void> receipts(Map<String, dynamic> d) => showDDialog<void>(
          context,
          title: 'Payments — ${d['customer']} · ${d['orderNumber']}',
          width: 520,
          builder: (c) {
            final pays = ((d['payments'] as List?) ?? const []).cast<Map>();
            if (pays.isEmpty) return const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Nothing paid on this due yet.', style: TextStyle(color: W.g500)));
            return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
                child: Column(children: [
                  for (final (i, p) in pays.indexed)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(border: i == 0 ? null : const Border(top: BorderSide(color: W.g100))),
                      child: Row(children: [
                        Container(width: 26, height: 26, alignment: Alignment.center, decoration: const BoxDecoration(color: W.g100, shape: BoxShape.circle), child: Text('${i + 1}×', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: W.g600))),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${p['receipt'] ?? 'Pending'}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF2563EB))),
                            Text('${dateTime(p['at'])} · ${p['method']}${p['by'] != null ? ' · by ${p['by']}' : ''}', style: const TextStyle(fontSize: 12, color: W.g500)),
                          ]),
                        ),
                        Text(money(p['amount']), style: const TextStyle(fontWeight: FontWeight.w700, color: W.green)),
                        if (p['receipt'] != null) WebIconAction(LucideIcons.externalLink, color: W.g500, tooltip: 'Open receipt', onTap: () => launchUrl(Uri.parse('${s.api.server}/admin/ecommerce/payment-receipt/${p['receipt']}'), mode: LaunchMode.externalApplication)),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 10),
              Text.rich(TextSpan(text: 'Paid so far ', style: const TextStyle(fontSize: 13, color: W.g600), children: [TextSpan(text: money(pays.fold<double>(0, (t, p) => t + toDouble(p['amount']))), style: const TextStyle(fontWeight: FontWeight.w700, color: W.green))])),
            ]);
          },
        );

    // ── table ──
    final pageOpen = [for (final d in shown) if (open(d)) toInt(d['id'])];
    final cols = <(WebCol, Widget Function(Map<String, dynamic>))>[
      if (on('due2-table', 'due2-c-select') && canCollect)
        (
          WebCol('', width: 44, head: Checkbox(value: pageOpen.isNotEmpty && pageOpen.every(_picked.contains), onChanged: (v) => setState(() => v == true ? _picked.addAll(pageOpen) : _picked.removeAll(pageOpen)))),
          (d) => Checkbox(value: _picked.contains(toInt(d['id'])), onChanged: !open(d) ? null : (v) => setState(() => v == true ? _picked.add(toInt(d['id'])) : _picked.remove(toInt(d['id'])))),
        ),
      if (on('due2-table', 'due2-c-customer'))
        (
          WebCol('Customer', flex: 1.4, onSort: () => _sortBy('customer'), sorted: _sort == 'customer' ? _asc : null),
          (d) {
            final n = ((d['products'] as List?) ?? const []).length;
            return Cell2('${d['customer']}', b: '${d['phone'] ?? 'No phone'}${n > 0 ? ' · $n item${n == 1 ? '' : 's'}' : ''}');
          },
        ),
      if (on('due2-table', 'due2-c-order'))
        (
          WebCol('Order', flex: 1.3, onSort: () => _sortBy('created'), sorted: _sort == 'created' ? _asc : null),
          (d) => Cell2('${d['orderNumber'] ?? '#${d['orderId']}'}', b: '${d['orderType'] == 'offline' ? 'In-store' : 'Online'} · ${dateShort(d['createdAt'])}', aColor: W.blue,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(d['orderId']))))),
        ),
      if (on('due2-table', 'due2-c-amount')) (const WebCol('Amount & Paid', flex: 1.1), (d) => Cell2(money(d['amount']), b: 'Paid ${money(d['paid'])}', bColor: const Color(0xFF16A34A))),
      if (on('due2-table', 'due2-c-balance'))
        (
          WebCol('Balance', flex: 1, onSort: () => _sortBy('balance'), sorted: _sort == 'balance' ? _asc : null),
          (d) => Text(money(d['balance']), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: open(d) ? const Color(0xFFDC3545) : W.green)),
        ),
      if (on('due2-table', 'due2-c-promise'))
        (
          WebCol('Promise Date', flex: 1.3, onSort: () => _sortBy('promise'), sorted: _sort == 'promise' ? _asc : null),
          (d) {
            final od = overdueDays(d);
            final label = d['promised'] == null ? null : dateShort(d['promised']);
            final text = Text(label ?? (canCollect ? 'Set a date' : '—'), style: TextStyle(fontSize: 13, color: label == null ? W.g400 : W.g800));
            return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
              canCollect && open(d) ? InkWell(onTap: () => promiseDate(d), child: text) : text,
              if (od > 0) Text('$od day${od == 1 ? '' : 's'} overdue', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFEA580C))),
              if (dueToday(d)) const Text('Due today', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFD97706))),
            ]);
          },
        ),
      if (on('due2-table', 'due2-c-status'))
        (
          const WebCol('Status', flex: .9),
          (d) {
            final (t, c, fg) = !open(d) ? ('Paid', W.green, Colors.white) : overdueDays(d) > 0 ? ('Overdue', const Color(0xFFDC2626), Colors.white) : toDouble(d['paid']) > 0.004 ? ('Partly', W.yellow, W.g900) : ('Unpaid', W.grey, Colors.white);
            return Align(alignment: Alignment.centerLeft, child: WebPill(t, color: c, textColor: fg));
          },
        ),
      if (on('due2-table', 'due2-c-actions'))
        (
          const WebCol('Actions', width: 190),
          (d) => Row(children: [
                if (canCollect && open(d)) ...[WebButton('Collect', icon: LucideIcons.handCoins, color: W.green, height: 32, onPressed: () => collectDues(context, [d])), const SizedBox(width: 6)],
                WebButton('${((d['payments'] as List?) ?? const []).length}', icon: LucideIcons.receipt, height: 32, tooltip: 'Payment history', onPressed: () => receipts(d)),
              ]),
        ),
    ];

    Widget card(IconData icon, Color c, String value, String label, String sub, bool selected, VoidCallback tap) => WebMetric(icon: icon, color: c, value: value, label: label, sub: sub, selected: selected, onTap: tap);
    double bal(Iterable<Map> l) => l.fold(0, (t, d) => t + toDouble(d['balance']));
    final cards = [
      if (on('due2-cards', 'due2-k-total')) card(LucideIcons.indianRupee, const Color(0xFFDC2626), money(bal(dues)), 'Total Due', '${dues.length} unpaid due${dues.length == 1 ? '' : 's'}', !_filtersOn, () => _set(_reset)),
      if (on('due2-cards', 'due2-k-overdue')) card(LucideIcons.triangleAlert, const Color(0xFFEA580C), money(bal(dues.where((d) => overdueDays(d) > 0))), 'Overdue', '${dues.where((d) => overdueDays(d) > 0).length} past promise date', _promise == 'overdue', () => _set(() {
            _reset();
            _promise = 'overdue';
          })),
      if (on('due2-cards', 'due2-k-today')) card(LucideIcons.calendarClock, const Color(0xFFD97706), money(bal(dues.where(dueToday))), 'Due Today', '${dues.where(dueToday).length} promised for today', _promise == 'today', () => _set(() {
            _reset();
            _promise = 'today';
          })),
      if (on('due2-cards', 'due2-k-people')) card(LucideIcons.users, const Color(0xFF0EA5E9), '${people.length}', 'People with Dues', 'customers who owe money', false, () => _set(_reset)),
    ];
    final productOptions = <int, String>{for (final d in all) for (final p in ((d['products'] as List?) ?? const []).cast<Map>()) toInt(p['id']): '${p['name']}'};
    final filters = [
      if (on('due2-filters', 'due2-f-status')) WebSelect<String>(icon: LucideIcons.receipt, label: 'Status', value: _status, options: const [('unpaid', 'Unpaid only'), ('partial', 'Partly paid'), ('paid', 'Fully paid'), ('all', 'All dues')], onChanged: (v) => _set(() => _status = v)),
      if (on('due2-filters', 'due2-f-promise'))
        WebSelect<String>(icon: LucideIcons.calendarClock, label: 'Promise Date', value: _promise, options: const [('all', 'All'), ('overdue', 'Overdue'), ('today', 'Due today'), ('upcoming', 'Upcoming'), ('none', 'No date set')], onChanged: (v) => _set(() => _promise = v)),
      if (on('due2-filters', 'due2-f-source')) WebSelect<String>(icon: LucideIcons.store, label: 'Order Source', value: _source, options: const [('all', 'All orders'), ('offline', 'In-store'), ('online', 'Online')], onChanged: (v) => _set(() => _source = v)),
      if (on('due2-filters', 'due2-f-product'))
        WebSelect<int>(icon: LucideIcons.package, label: 'Product', value: _product, options: [(0, 'All products'), for (final e in productOptions.entries) (e.key, e.value)], onChanged: (v) => _set(() => _product = v)),
      if (on('due2-filters', 'due2-f-datefield'))
        WebSelect<String>(icon: LucideIcons.calendar, label: 'Date range applies to', value: _dateField, options: const [('none', 'Ignore date range'), ('created', 'Due created'), ('promised', 'Promise date'), ('paid', 'Payment date')], onChanged: (v) => _set(() => _dateField = v)),
    ];

    return WebPage(
      title: 'Due',
      subtitle: 'Who owes what, when they promised to pay, and what has been collected',
      onRefresh: () async {
        await s.syncNow(only: const ['dues', 'customers', 'orders']);
        await s.reloadPage('dues_paid');
      },
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Dues', const ['Customer', 'Phone', 'Order', 'Source', 'Created', 'Amount', 'Paid', 'Balance', 'Promise date', 'Overdue days', 'Status', 'Products'], [
              for (final d in list)
                [d['customer'], d['phone'], d['orderNumber'], d['orderType'] == 'offline' ? 'In-store' : 'Online', dateShort(d['createdAt']), toDouble(d['amount']), toDouble(d['paid']), toDouble(d['balance']),
                  d['promised'] == null ? '' : dateShort(d['promised']), overdueDays(d) > 0 ? overdueDays(d) : '', !open(d) ? 'Paid' : overdueDays(d) > 0 ? 'Overdue' : toDouble(d['paid']) > 0 ? 'Partly' : 'Unpaid',
                  ((d['products'] as List?) ?? const []).cast<Map>().map((p) => p['name']).join(', ')],
            ])),
      ],
      children: [
        if (_prefs.item('due2-range')) ...[
          WebRangeBar(
            range: _range,
            onChanged: (r) => _set(() {
              _range = r;
              if (_dateField == 'none') _dateField = 'created';
            }),
            below: const Padding(padding: EdgeInsets.only(top: 8), child: Text('→  To filter the table by these dates, set "Date range applies to".', style: TextStyle(fontSize: 12, color: W.g600))),
          ),
          const SizedBox(height: 12),
        ],
        if (cards.isNotEmpty) ...[WebGrid(children: cards), const SizedBox(height: 12)],
        if (filters.isNotEmpty) ...[
          WebCard(padding: const EdgeInsets.all(14), child: WebGrid(columns: filters.length, gap: 12, minWidth: 160, children: filters)),
          const SizedBox(height: 12),
        ],
        if (on('due2-table'))
          WebCard(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Wrap(spacing: 16, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('Show ', style: TextStyle(fontSize: 14, color: W.g900)),
                  SizedBox(width: 90, child: WebSelect<int>(value: _per, options: const [(10, '10'), (25, '25'), (50, '50'), (100, '100'), (0, 'All')], onChanged: (v) => _set(() => _per = v))),
                  const Text(' entries', style: TextStyle(fontSize: 14, color: W.g900)),
                ]),
                if (on('due2-table', 'due2-c-select') && canCollect) ...[
                  WebButton('Collect${picked.isEmpty ? '' : ' (${picked.length})'}', icon: LucideIcons.handCoins, color: W.green, onPressed: picked.isEmpty
                      ? null
                      : () {
                          final who = {for (final d in picked) '${d['customerId'] ?? d['customer']}'};
                          if (who.length > 1) return toast(context, 'Tick the dues of one customer at a time — one receipt goes to one person.', error: true);
                          collectDues(context, picked);
                        }),
                  if (_picked.isNotEmpty) TextButton(onPressed: () => setState(_picked.clear), child: const Text('Clear selection', style: TextStyle(fontSize: 13, color: W.g500))),
                ],
                if (_filtersOn) TextButton.icon(onPressed: () => _set(_reset), icon: const Icon(LucideIcons.x, size: 14), label: const Text('Clear filters')),
                if (on('due2-table', 'due2-t-search'))
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    const Text('Search: ', style: TextStyle(fontSize: 14, color: W.g900)),
                    WebSearch(width: 260, hint: 'Name, phone, order, product…', onChanged: (v) => _set(() => _q = v)),
                  ]),
              ]),
              const SizedBox(height: 14),
              WebTable(
                bordered: true,
                rowHeight: 76,
                cols: [for (final c in cols) c.$1],
                rows: [for (final d in shown) [for (final c in cols) c.$2(d)]],
                empty: Center(child: Text(all.isEmpty ? 'No dues recorded yet.' : 'No dues match these filters.', style: const TextStyle(color: W.g500))),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text.rich(TextSpan(style: const TextStyle(fontSize: 14, color: W.g800), children: [
                  TextSpan(text: list.isEmpty ? 'Showing 0 entries' : 'Showing ${_per == 0 ? 1 : _page * _per + 1} to ${_per == 0 ? list.length : _page * _per + shown.length} of ${list.length} entries'),
                  if (list.length != all.length) TextSpan(text: ' (filtered from ${all.length} total entries)', style: const TextStyle(color: W.g500)),
                  if (list.isNotEmpty) const TextSpan(text: '  ·  Balance shown: '),
                  if (list.isNotEmpty) TextSpan(text: money(bal(list)), style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFDC3545))),
                ])),
              ),
              if (_per > 0 && list.length > _per) WebPager(total: list.length, page: _page, perPage: _per, onPage: (v) => setState(() => _page = v), onPerPage: (v) => _set(() => _per = v)),
            ]),
          ),
      ],
    );
  }

  void _reset() {
    _status = 'unpaid';
    _promise = _source = 'all';
    _dateField = 'none';
    _product = 0;
    _q = '';
  }
}
