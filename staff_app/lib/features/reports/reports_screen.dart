import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/nav.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import 'report_export.dart';

/// Report Builder — same numbers as the website: any day / month / range,
/// store or online, whole business or one staff member; PDF and Excel.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  int _navSeq = -1;
  Map<String, String> _params = {'range': 'today'};
  Map<String, dynamic>? _r;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    LocalStore.instance.read('report').then((v) {
      if (v is Map && mounted && _r == null) setState(() => _r = Map<String, dynamic>.from(v));
    });
    _load();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = null;
    });
    final r = await s.api.get('/api/app/v1/report', query: _params);
    if (!mounted) return;
    setState(() => _loading = false);
    if (r.ok) {
      setState(() => _r = Map<String, dynamic>.from(r.data['report']));
      LocalStore.instance.write('report', _r);
    } else {
      setState(() => _error = r.outcome == ApiOutcome.offline ? 'Reports need the internet. Showing the last report you opened.' : r.message);
    }
  }

  void _set(Map<String, String> p) {
    setState(() => _params = {...p, if (_params['channel'] != null && !p.containsKey('channel')) 'channel': _params['channel']!, if (_params['user'] != null && !p.containsKey('user')) 'user': _params['user']!});
    _load();
  }

  Future<void> _pickMonth() async {
    final now = DateTime.now();
    var year = now.year;
    final m = await showDialog<String>(
      context: context,
      builder: (d) => StatefulBuilder(
        builder: (d, set) => AlertDialog(
          title: Row(children: [
            IconButton(onPressed: () => set(() => year--), icon: const Icon(Icons.chevron_left)),
            Expanded(child: Text('$year', textAlign: TextAlign.center)),
            IconButton(onPressed: year >= now.year ? null : () => set(() => year++), icon: const Icon(Icons.chevron_right)),
          ]),
          content: SizedBox(
            width: 320,
            child: GridView.count(shrinkWrap: true, crossAxisCount: 3, childAspectRatio: 2.2, mainAxisSpacing: 6, crossAxisSpacing: 6, children: [
              for (var i = 1; i <= 12; i++)
                OutlinedButton(
                  onPressed: year == now.year && i > now.month ? null : () => Navigator.pop(d, '$year-${i.toString().padLeft(2, '0')}'),
                  child: Text(DateFormat.MMM().format(DateTime(2000, i))),
                ),
            ]),
          ),
        ),
      ),
    );
    if (m != null) _set({'range': 'month', 'm': m});
  }

  Future<void> _pickRange() async {
    final r = await showDateRangePicker(context: context, firstDate: DateTime(2023), lastDate: DateTime.now());
    if (r != null) _set({'range': 'custom', 'from': DateFormat('yyyy-MM-dd').format(r.start), 'to': DateFormat('yyyy-MM-dd').format(r.end)});
  }

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavController>();
    if (nav.seq != _navSeq) {
      _navSeq = nav.seq;
      final a = nav.take('reports');
      if (a['range'] is String && a['range'] != _params['range']) {
        final r = a['range'] as String;
        WidgetsBinding.instance.addPostFrameCallback((_) => _set({'range': r}));
      }
    }
    final r = _r;
    final k = (r?['kpis'] as Map?) ?? {};
    final wide = isWide(context);
    final staffList = ((r?['staffList'] as List?) ?? const []).cast<Map>();
    final preset = _params['range'];
    Widget chip(String label, String range) => Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(label), selected: preset == range, onSelected: (_) => _set({'range': range})));

    return Scaffold(
      appBar: AppBar(leading: menuButton(context), 
        title: const Text('Reports'),
        actions: [
          if (r != null) IconButton(tooltip: 'PDF', icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => exportReportPdf(context, r)),
          if (r != null) IconButton(tooltip: 'Excel', icon: const Icon(Icons.grid_on_rounded), onPressed: () => exportReportExcel(context, r)),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: PageBody(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                chip('Today', 'today'), chip('Yesterday', 'yesterday'), chip('This month', 'this_month'), chip('Previous month', 'prev_month'),
                Padding(padding: const EdgeInsets.only(right: 8), child: ActionChip(avatar: const Icon(Icons.calendar_month_outlined, size: 18), label: Text(preset == 'month' ? '${r?['rangeLabel'] ?? 'Month'}' : 'Month'), onPressed: _pickMonth)),
                ActionChip(avatar: const Icon(Icons.date_range_outlined, size: 18), label: Text(preset == 'custom' ? '${r?['rangeLabel'] ?? 'Custom'}' : 'Custom range'), onPressed: _pickRange),
              ]),
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
              SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [ButtonSegment(value: 'all', label: Text('All sales')), ButtonSegment(value: 'offline', label: Text('Store')), ButtonSegment(value: 'online', label: Text('Online'))],
                selected: {_params['channel'] ?? 'all'},
                onSelectionChanged: (v) {
                  setState(() => v.first == 'all' ? _params.remove('channel') : _params['channel'] = v.first);
                  _load();
                },
              ),
              if (staffList.length > 1 || _params['user'] != null)
                DropdownButton<String>(
                  value: _params['user'] ?? '',
                  underline: const SizedBox(),
                  items: [const DropdownMenuItem(value: '', child: Text('Whole business')), for (final u in staffList) DropdownMenuItem(value: '${u['id']}', child: Text('${u['name']} · ${u['role']}'))],
                  onChanged: (v) {
                    setState(() => v == null || v.isEmpty ? _params.remove('user') : _params['user'] = v);
                    _load();
                  },
                ),
            ]),
            if (_loading) const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
            if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(_error!, style: const TextStyle(color: AppColors.red))),
            if (r == null && !_loading) const EmptyState(icon: Icons.insert_chart_outlined, title: 'No report yet', message: 'Connect to the internet to build a report.'),
            if (r != null) ...[
              const SizedBox(height: 12),
              AppCard(
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(r['selectedUser'] != null ? 'Staff report · ${r['selectedUser']['name']}' : 'Sales report', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      Text('${r['rangeLabel']} · generated ${dateTime(r['generatedAt'])}', style: const TextStyle(color: AppColors.muted)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
              GridView(
                shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: wide ? 4 : 2, mainAxisSpacing: 10, crossAxisSpacing: 10, mainAxisExtent: wide ? 100 : 150),
                children: [
                  KpiTile(icon: Icons.currency_rupee_rounded, label: 'Total sales', value: money(k['sales']), sub: '${k['orders']} orders'),
                  KpiTile(icon: Icons.shopping_bag_outlined, label: 'Products sold', value: '${k['units']}', sub: 'units', color: AppColors.blue, soft: AppColors.blueSoft),
                  KpiTile(icon: Icons.warning_amber_rounded, label: 'Total dues', value: money(k['due']), sub: '${k['dueOrders']} orders', color: AppColors.red, soft: AppColors.redSoft),
                  KpiTile(icon: Icons.savings_outlined, label: 'Due collected', value: money(k['collected']), sub: '${k['collections']} payments', color: AppColors.green, soft: AppColors.greenSoft),
                  KpiTile(icon: Icons.add_box_outlined, label: 'Products added', value: '${k['productsAdded']}', color: AppColors.cyan, soft: AppColors.cyanSoft),
                  KpiTile(icon: Icons.receipt_outlined, label: 'New dues', value: money(k['newDues']), sub: '${k['newDueCount']} bills', color: AppColors.amber, soft: AppColors.amberSoft),
                  KpiTile(icon: Icons.local_offer_outlined, label: 'Discount given', value: money(k['discount'])),
                  KpiTile(icon: Icons.account_balance_outlined, label: 'GST collected', value: money(k['gst'])),
                ],
              ),
              const SizedBox(height: 16),
              _twoCol(wide, _payments(r), _channels(r)),
              const SizedBox(height: 16),
              _table('Product-wise sales', Icons.inventory_2_outlined, ['Product', 'Qty', 'Revenue'], [
                for (final p in ((r['products'] as List?) ?? const []).cast<Map>()) ['${p['name']}', '${p['qty']}', money(p['revenue'])],
              ]),
              _table('Sales timeline', Icons.timeline_rounded, ['Time', 'Order', 'Product', 'Qty', 'Total'], [
                for (final t in ((r['timeline'] as List?) ?? const []).cast<Map>().take(200)) [dateTime(t['at']), '${t['orderNumber']}', '${t['product']}', '${t['qty']}', money(t['total'])],
              ]),
              if (((r['daily'] as List?) ?? const []).length > 1)
                _table('Day-wise', Icons.calendar_view_day_outlined, ['Date', 'Orders', 'Sales', 'Collected'], [
                  for (final d in ((r['daily'] as List?) ?? const []).cast<Map>()) [dateShort('${d['day']}T06:30:00Z'), '${d['orders']}', money(d['sales']), money(d['collected'])],
                ]),
              _table('Due collections', Icons.savings_outlined, ['Time', 'Customer', 'Method', 'Amount', 'By'], [
                for (final c in ((r['collections'] as List?) ?? const []).cast<Map>()) [dateTime(c['at']), '${c['customer']}', '${c['method']}', money(c['amount']), '${c['by'] ?? '—'}'],
              ]),
              _table('Deliveries by agent', Icons.two_wheeler_outlined, ['Agent', 'Assigned', 'Delivered', 'Pending', 'Value'], [
                for (final a in ((r['agents'] as List?) ?? const []).cast<Map>()) ['${a['name']}', '${a['assigned']}', '${a['delivered']}', '${a['pending']}', money(a['deliveredValue'])],
              ]),
              _table('Staff performance', Icons.badge_outlined, ['Staff', 'Store sales', 'Amount', 'Collected', 'Delivered'], [
                for (final x in ((r['staff'] as List?) ?? const []).cast<Map>()) ['${x['name']}', '${x['posSales']}', money(x['posAmount']), money(x['collectedAmount']), '${x['delivered']}'],
              ]),
              _table('Products added', Icons.add_box_outlined, ['Time', 'Product', 'Price', 'By'], [
                for (final x in ((r['added'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), '${x['name']}', money(x['price']), '${x['by'] ?? '—'}'],
              ]),
              if (((r['activity'] as List?) ?? const []).isNotEmpty)
                _table('What they did', Icons.history_rounded, ['Time', 'Action', 'Details'], [
                  for (final x in ((r['activity'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), '${x['action']}'.replaceAll('ecom_', '').replaceAll('_', ' '), '${x['description']}'],
                ]),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _twoCol(bool wide, Widget a, Widget b) => wide
      ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 16), Expanded(child: b)])
      : Column(children: [a, const SizedBox(height: 16), b]);

  Widget _payments(Map<String, dynamic> r) {
    final pays = ((r['payments'] as List?) ?? const []).cast<Map>();
    final total = pays.fold<double>(0, (t, p) => t + toDouble(p['amount']));
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SectionTitle('Payment summary', icon: Icons.pie_chart_outline_rounded),
        if (pays.isEmpty) const Text('No sales.', style: TextStyle(color: AppColors.muted)),
        for (final p in pays) ...[
          Row(children: [Expanded(child: Text('${p['method']}')), Text('${money(p['amount'])}  (${total > 0 ? (toDouble(p['amount']) / total * 100).toStringAsFixed(1) : 0}%)', style: const TextStyle(fontWeight: FontWeight.w600))]),
          const SizedBox(height: 4),
          ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: total > 0 ? toDouble(p['amount']) / total : 0, minHeight: 6, backgroundColor: const Color(0xFFF1F2F6))),
          const SizedBox(height: 10),
        ],
      ]),
    );
  }

  Widget _channels(Map<String, dynamic> r) {
    final ch = (r['channels'] as Map?) ?? {};
    final aging = ((r['aging'] as List?) ?? const []).cast<Map>();
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SectionTitle('Channels & dues', icon: Icons.storefront_outlined),
        InfoRow('In-store', '${money(ch['offline']?['amount'])} · ${ch['offline']?['orders'] ?? 0} orders'),
        InfoRow('Online', '${money(ch['online']?['amount'])} · ${ch['online']?['orders'] ?? 0} orders'),
        const Divider(height: 20),
        for (final a in aging) InfoRow('Due ${a['bucket']}', '${money(a['amount'])} · ${a['orders']}'),
      ]),
    );
  }

  Widget _table(String title, IconData icon, List<String> head, List<List<String>> rows) {
    if (rows.isEmpty) return const SizedBox();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle('$title (${rows.length})', icon: icon),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 38, dataRowMinHeight: 38, dataRowMaxHeight: 52, columnSpacing: 22,
              headingTextStyle: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted, fontSize: 12.5),
              columns: [for (final h in head) DataColumn(label: Text(h))],
              rows: [for (final r in rows) DataRow(cells: [for (final c in r) DataCell(ConstrainedBox(constraints: const BoxConstraints(maxWidth: 280), child: Text(c, overflow: TextOverflow.ellipsis)))])],
            ),
          ),
        ]),
      ),
    );
  }
}
