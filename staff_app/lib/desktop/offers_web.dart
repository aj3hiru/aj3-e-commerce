import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/adaptive.dart';
import '../ds/button.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/kit.dart';
import '../features/products/product_edit_screen.dart';
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

List<Map<String, dynamic>> _rows(dynamic v) => ((v as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
DateTime? _t(dynamic v) => v == null ? null : DateTime.tryParse('$v');

/// "Offers & Coupons" as on the website: the two big tabs (Campaign Offers · Coupons), each page
/// with its own numbers, lists and Display Options. Opens from the copy on this computer.
class OffersWeb extends StatefulWidget {
  const OffersWeb({super.key});
  @override
  State<OffersWeb> createState() => _OffersWebState();
}

class _OffersWebState extends State<OffersWeb> {
  String? _tab;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final canCampaigns = s.perms.products, canCoupons = s.perms.has('ecommerce', 'manage_coupons');
    final tab = _tab ?? (canCampaigns ? 'campaigns' : 'coupons');
    Widget tabs = Row(children: [
      for (final (k, label, hint, icon, ok) in [
        ('campaigns', 'Campaign Offers', 'Automatic price drops — no code needed', LucideIcons.badgePercent, canCampaigns),
        ('coupons', 'Coupons', 'Codes customers enter at checkout', LucideIcons.ticketPercent, canCoupons),
      ])
        if (ok)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: SizedBox(
              width: 316,
              child: WebCard(
                onTap: () => setState(() => _tab = k),
                borderColor: tab == k ? const Color(0xFF2563EB) : null,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(children: [
                  Container(width: 34, height: 34, decoration: BoxDecoration(color: tab == k ? const Color(0xFF2563EB) : W.g100, borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 17, color: tab == k ? Colors.white : W.g600)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: tab == k ? const Color(0xFF1D4ED8) : W.g800)),
                      Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500)),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
    ]);
    return tab == 'campaigns'
        ? NativeData(key: const ValueKey('campaigns'), name: 'campaigns', builder: (context, data, reload) => _Campaigns(data: Map<String, dynamic>.from((data as Map?) ?? const {}), reload: reload, tabs: tabs))
        : NativeData(key: const ValueKey('coupons'), name: 'coupons', builder: (context, data, reload) => _Coupons(rows: _rows(data), reload: reload, tabs: tabs));
  }
}

/* ───────────────────────── Campaign offers ───────────────────────── */

String _campaignState(Map c) {
  final now = DateTime.now().toUtc();
  final ends = _t(c['endsAt']), starts = _t(c['startsAt']);
  if (ends != null && ends.isBefore(now)) return 'ended';
  if (c['isPaused'] == true) return 'paused';
  if (starts != null && starts.isAfter(now)) return 'scheduled';
  return 'live';
}

String _offerLabel(Map c) => switch (c['discountType']) {
      'percent' => '${_n(c['discountValue'])}% off',
      'amount' => '${money(c['discountValue'])} off',
      _ => 'Special prices',
    };
String _n(dynamic v) => toDouble(v) == toDouble(v).roundToDouble() ? '${toDouble(v).round()}' : '${toDouble(v)}';

String _left(Duration d) => d.inDays >= 1 ? '${d.inDays}d ${d.inHours % 24}h' : d.inHours >= 1 ? '${d.inHours}h ${d.inMinutes % 60}m' : '${d.inMinutes.clamp(1, 59)}m';

class _Campaigns extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  final Widget tabs;
  const _Campaigns({required this.data, required this.reload, required this.tabs});
  @override
  State<_Campaigns> createState() => _CampaignsState();
}

class _CampaignsState extends State<_Campaigns> {
  static final _def = displayDefs['ecom_campaign_offer2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _cq = '', _pq = '', _view = 'all';

  Future<void> _quick(Map c, String action) async {
    final word = {'pause': 'paused', 'resume': 'resumed', 'end': 'ended'}[action]!;
    await nativeSend(
      context,
      OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/campaigns2/${c['id']}', body: {'action': action}, label: 'Campaign ${c['name']}: $word', refresh: const ['products'],
          effect: {'kind': 'page_row', 'page': 'campaigns', 'list': 'campaigns', 'id': c['id'], 'fields': action == 'end' ? {'endsAt': DateTime.now().toUtc().toIso8601String()} : {'isPaused': action == 'pause'}}),
      reload: widget.reload,
      done: '“${c['name']}” $word.',
    );
  }

  Future<void> _delete(Map c) async {
    if (!await confirm(context, 'Delete “${c['name']}”?', 'It has no sales, so it can be removed completely.', ok: 'Delete', danger: true) || !mounted) return;
    await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/campaigns2/${c['id']}', label: 'Delete campaign ${c['name']}', effect: {'kind': 'page_row_delete', 'page': 'campaigns', 'list': 'campaigns', 'ids': [c['id']]}),
        reload: widget.reload, done: 'Deleted.');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final campaigns = _rows(widget.data['campaigns']);
    final offers = widget.data['offers'] is List ? _rows(widget.data['offers']) : <Map<String, dynamic>>[];
    final range = Map<String, dynamic>.from((widget.data['range'] as Map?) ?? const {});
    final points = _rows((widget.data['chart'] as Map?)?['points']);
    final products = {for (final p in s.list('products')) toInt(p['id']): p};
    final names = {
      'category': {for (final x in s.list('categories')) toInt(x['id']): '${x['name']}'},
      'brand': {for (final x in s.list('brands')) toInt(x['id']): '${x['name']}'},
      'product': {for (final x in products.values) toInt(x['id']): '${x['name']}'},
    };
    (String, String) applies(Map c) {
      final t = _rows(c['targets']);
      if (c['scope'] == 'all') return ('All products', 'Every active product');
      final kind = '${c['scope']}';
      return ('${t.length} ${kind == 'category' ? (t.length == 1 ? 'category' : 'categories') : '$kind${t.length == 1 ? '' : 's'}'}', t.map((x) => names[kind]?[toInt(x['id'])] ?? '#${x['id']}').join(', '));
    }

    final live = campaigns.where((c) => _campaignState(c) == 'live').length, scheduled = campaigns.where((c) => _campaignState(c) == 'scheduled').length;
    final cq = _cq.trim().toLowerCase();
    final cList = campaigns.where((c) {
      final st = _campaignState(c);
      if (_view == 'running' && st == 'ended') return false;
      if (_view == 'ended' && st != 'ended') return false;
      return cq.isEmpty || '${c['name']} ${applies(c).$2}'.toLowerCase().contains(cq);
    }).toList();
    final pq = _pq.trim().toLowerCase();
    final pList = offers.where((o) => products[toInt(o['productId'])] != null && (pq.isEmpty || '${products[toInt(o['productId'])]!['name']} ${o['campaignName']}'.toLowerCase().contains(pq))).toList();
    final byId = {for (final c in campaigns) toInt(c['id']): c};
    bool cc(String k) => on('co2-campaigns', k);
    bool pc(String k) => on('co2-offers', k);
    final now = DateTime.now().toUtc();

    void export() => exportTable(context, 'Campaigns', const ['ID', 'Name', 'Applies to', 'Offer', 'Starts', 'Ends', 'Status', 'Orders', 'Units sold', 'Sales', 'Discount given'], [
          for (final c in campaigns)
            [c['id'], c['name'], applies(c).$2, _offerLabel(c), dateTime(c['startsAt'] ?? c['createdAt']), c['endsAt'] == null ? 'No end date' : dateTime(c['endsAt']), _campaignState(c), (c['stats'] as Map?)?['orders'], (c['stats'] as Map?)?['units'], toDouble((c['stats'] as Map?)?['revenue']), toDouble((c['stats'] as Map?)?['discount'])],
        ]);

    final metrics = [
      if (on('co2-metrics', 'co2-m-live')) WebMetric(icon: LucideIcons.badgeCheck, color: const Color(0xFF059669), value: '$live', label: 'Active Campaigns', sub: scheduled > 0 ? '$scheduled scheduled' : 'None scheduled'),
      if (on('co2-metrics', 'co2-m-products')) WebMetric(icon: LucideIcons.package, color: const Color(0xFF2563EB), value: '${offers.length}', label: 'Products on Offer', sub: 'of ${products.values.where((p) => p['status'] == 'active').length} active products'),
      if (on('co2-metrics', 'co2-m-sales')) WebMetric(icon: LucideIcons.indianRupee, color: const Color(0xFF059669), value: money(range['revenue']), label: 'Campaign Sales', sub: 'This month'),
      if (on('co2-metrics', 'co2-m-units')) WebMetric(icon: LucideIcons.layers, color: const Color(0xFF1E3A8A), value: '${toInt(range['units'])}', label: 'Units Sold', sub: 'at a campaign price'),
      if (on('co2-metrics', 'co2-m-discount')) WebMetric(icon: LucideIcons.percent, color: const Color(0xFFD97706), value: money(range['discount']), label: 'Discount Given', sub: 'off the usual price'),
      if (on('co2-metrics', 'co2-m-orders')) WebMetric(icon: LucideIcons.shoppingCart, color: const Color(0xFF2563EB), value: '${toInt(range['orders'])}', label: 'Orders with Offer', sub: 'completed sales'),
    ];

    Widget chart() {
      final maxV = points.fold<double>(0, (m, p) => toDouble(p['revenue']) > m ? toDouble(p['revenue']) : m);
      return WebCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Campaign Sales', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
          const Text('This month, day by day', style: TextStyle(fontSize: 12, color: W.g500)),
          const SizedBox(height: 14),
          SizedBox(
            height: 220,
            child: points.isEmpty
                ? const Center(child: Text('No campaign sales yet.', style: TextStyle(color: W.g400)))
                : BarChart(BarChartData(
                    maxY: maxV <= 0 ? 1000 : maxV * 1.2,
                    gridData: FlGridData(drawVerticalLine: false, getDrawingHorizontalLine: (_) => const FlLine(color: W.g100, strokeWidth: 1)),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      topTitles: const AxisTitles(),
                      rightTitles: const AxisTitles(),
                      leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 46, getTitlesWidget: (v, m) => Text(moneyShort(v), style: const TextStyle(fontSize: 10.5, color: W.g500)))),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 22,
                          getTitlesWidget: (v, m) {
                            final i = v.toInt();
                            if (i < 0 || i >= points.length || (points.length > 16 && i % 3 != 0)) return const SizedBox();
                            return Padding(padding: const EdgeInsets.only(top: 4), child: Text('${points[i]['label']}', style: const TextStyle(fontSize: 10.5, color: W.g500)));
                          },
                        ),
                      ),
                    ),
                    barTouchData: BarTouchData(
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipItem: (g, gi, r, ri) => BarTooltipItem('${points[g.x]['label']}\n${money(points[g.x]['revenue'])} · ${points[g.x]['units']} units', const TextStyle(color: Colors.white, fontSize: 12)),
                      ),
                    ),
                    barGroups: [
                      for (final (i, p) in points.indexed) BarChartGroupData(x: i, barRods: [BarChartRodData(toY: toDouble(p['revenue']), width: points.length > 20 ? 8 : 16, color: const Color(0xFF2563EB), borderRadius: const BorderRadius.vertical(top: Radius.circular(3)))]),
                    ],
                  )),
          ),
        ]),
      );
    }

    return WebPage(
      title: 'Offers & Coupons',
      subtitle: 'Campaign offers drop prices automatically — no code needed',
      onRefresh: widget.reload,
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: export),
        WebButton('New Campaign', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => editCampaign(context, null, widget.reload)),
      ],
      children: [
        widget.tabs,
        const SizedBox(height: 14),
        LayoutBuilder(builder: (c, box) {
          final side = box.maxWidth >= 1300;
          final showChart = _prefs.item('co2-chart');
          final grid = metrics.isEmpty ? null : WebGrid(columns: side ? 2 : 3, minWidth: 190, children: metrics);
          if (!showChart) return grid ?? const SizedBox();
          if (grid == null) return chart();
          return side ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: chart()), const SizedBox(width: 12), Expanded(child: grid)]) : Column(children: [chart(), const SizedBox(height: 12), grid]);
        }),
        const SizedBox(height: 12),
        if (on('co2-campaigns')) ...[
          Row(children: [
            const Text('Campaigns & History', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
            const SizedBox(width: 14),
            DSegmented<String>(options: [('all', 'All (${campaigns.length})'), ('running', 'Running'), ('ended', 'Ended')], value: _view, onChanged: (v) => setState(() => _view = v)),
          ]),
          const SizedBox(height: 8),
          WebList(
            rows: cList,
            total: campaigns.length,
            rowHeight: 66,
            search: cc('co2-c-search') ? WebSearch(width: 240, hint: 'Search campaigns…', onChanged: (v) => setState(() => _cq = v)) : null,
            empty: 'No campaigns yet. Create one to offer a discount for a period of time.',
            onTap: (c) => editCampaign(context, c, widget.reload),
            cols: [
              ListCol(const WebCol('Campaign', flex: 1.6), (c) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${c['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                    Text('Created ${dateTime(c['createdAt'])}', maxLines: 1, style: const TextStyle(fontSize: 11.5, color: W.g500)),
                  ]), sort: (c) => lower(c['name'])),
              if (cc('co2-c-applies'))
                ListCol(const WebCol('Applies To', flex: 1.4), (c) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(applies(c).$1, maxLines: 1, style: const TextStyle(fontSize: 13)),
                      Tooltip(message: applies(c).$2, child: Text(applies(c).$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500))),
                    ])),
              if (cc('co2-c-offer')) ListCol(const WebCol('Offer', flex: .9), (c) => Text(_offerLabel(c), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900))),
              if (cc('co2-c-schedule'))
                ListCol(const WebCol('Schedule', flex: 1.7), (c) {
                  final st = _campaignState(c);
                  final ends = _t(c['endsAt']), starts = _t(c['startsAt']);
                  return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('From ${dateTime(c['startsAt'] ?? c['createdAt'])}', maxLines: 1, style: const TextStyle(fontSize: 12.5)),
                    Text(ends == null ? 'No end date' : 'Until ${dateTime(c['endsAt'])}', maxLines: 1, style: const TextStyle(fontSize: 12.5)),
                    if (st == 'scheduled' && starts != null) Text('Starts in ${_left(starts.difference(now))}', style: const TextStyle(fontSize: 11.5, color: Color(0xFF2563EB)))
                    else if (st == 'live' && ends != null) Text('Ends in ${_left(ends.difference(now))}', style: const TextStyle(fontSize: 11.5, color: Color(0xFFD97706))),
                  ]);
                }, sort: (c) => '${c['startsAt'] ?? c['createdAt']}'),
              if (cc('co2-c-status'))
                ListCol(const WebCol('Status', flex: 1), (c) {
                  final st = _campaignState(c);
                  if (st == 'ended') return const Align(alignment: Alignment.centerLeft, child: WebPill('Ended', color: W.grey));
                  final run = st == 'scheduled' ? 'Scheduled' : 'Live';
                  return WebPillMenu(
                    value: c['isPaused'] == true ? 'Paused' : run,
                    options: [run, 'Paused', 'End now'],
                    color: c['isPaused'] == true ? W.yellow : st == 'scheduled' ? const Color(0xFF0EA5E9) : W.green,
                    onSelected: toInt(c['id']) < 0
                        ? null
                        : (v) async {
                            if (v == 'End now') {
                              if (await confirm(context, 'End “${c['name']}” now?', 'Prices go back to normal straight away.', ok: 'End now', danger: true)) await _quick(c, 'end');
                            } else if ((v == 'Paused') != (c['isPaused'] == true)) {
                              await _quick(c, v == 'Paused' ? 'pause' : 'resume');
                            }
                          },
                  );
                }),
              if (cc('co2-c-sales'))
                ListCol(const WebCol('Sales', flex: 1), (c) {
                  final st = Map<String, dynamic>.from((c['stats'] as Map?) ?? const {});
                  return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(money(st['revenue']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                    Text('${st['units'] ?? 0} unit${toInt(st['units']) == 1 ? '' : 's'} · ${st['orders'] ?? 0} order${toInt(st['orders']) == 1 ? '' : 's'}', style: const TextStyle(fontSize: 11.5, color: W.g500)),
                  ]);
                }, sort: (c) => toDouble((c['stats'] as Map?)?['revenue'])),
              if (cc('co2-c-actions'))
                ListCol(const WebCol('Actions', width: 150), (c) {
                  final st = _campaignState(c);
                  final hasSales = toInt((c['stats'] as Map?)?['orders']) > 0;
                  return Row(children: [
                    WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit ${c['name']}', onTap: () => editCampaign(context, c, widget.reload)),
                    if (st != 'ended')
                      c['isPaused'] == true
                          ? WebIconAction(LucideIcons.play, color: W.green, tooltip: 'Resume', onTap: () => _quick(c, 'resume'))
                          : WebIconAction(LucideIcons.pause, color: const Color(0xFFD97706), tooltip: 'Pause', onTap: () => _quick(c, 'pause')),
                    WebIconAction(LucideIcons.copy, color: const Color(0xFF0EA5E9), tooltip: 'Duplicate', onTap: () => editCampaign(context, c, widget.reload, copy: true)),
                    st != 'ended'
                        ? WebIconAction(LucideIcons.x, color: const Color(0xFFDC2626), tooltip: 'End now', onTap: () async {
                            if (await confirm(context, 'End “${c['name']}” now?', 'Prices go back to normal straight away.', ok: 'End now', danger: true)) await _quick(c, 'end');
                          })
                        : WebIconAction(LucideIcons.trash2, color: hasSales ? W.g300 : const Color(0xFFDC2626), tooltip: hasSales ? 'Kept in history — it has sales' : 'Delete', onTap: hasSales ? null : () => _delete(c)),
                  ]);
                }),
            ],
          ),
          const SizedBox(height: 16),
        ],
        if (on('co2-offers')) ...[
          const Text('Products on Offer', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
          const SizedBox(height: 8),
          WebList(
            rows: [for (final o in pList) {...o, 'id': o['productId']}],
            total: offers.length,
            rowHeight: 66,
            search: pc('co2-p-search') ? WebSearch(width: 240, hint: 'Search products on offer…', onChanged: (v) => setState(() => _pq = v)) : null,
            empty: 'No product is on offer right now.',
            cols: [
              if (pc('co2-p-image')) ListCol(const WebCol('Image', width: 76), (o) => NetImage(products[toInt(o['productId'])]?['image'], size: 44, radius: 6, placeholder: LucideIcons.image)),
              ListCol(const WebCol('Name', flex: 2), (o) => Text('${products[toInt(o['productId'])]?['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g900)), sort: (o) => lower(products[toInt(o['productId'])]?['name'])),
              if (pc('co2-p-price'))
                ListCol(const WebCol('Price', flex: 1.5), (o) {
                  final before = toDouble(o['beforePrice']), now = toDouble(o['unitPrice']);
                  final pct = before > 0 ? ((before - now) * 100 / before).round() : 0;
                  return Row(children: [
                    Text(money(before), style: const TextStyle(fontSize: 12.5, color: W.g500, decoration: TextDecoration.lineThrough)),
                    const SizedBox(width: 6),
                    Text(money(now), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFFDC3545))),
                    if (pct > 0) ...[const SizedBox(width: 6), WebBadge('$pct% off', color: const Color(0xFF047857), bg: const Color(0xFFECFDF5))],
                  ]);
                }, sort: (o) => toDouble(o['unitPrice'])),
              if (pc('co2-p-campaign'))
                ListCol(const WebCol('Campaign', flex: 1.4), (o) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${o['campaignName']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                      if (byId[toInt(o['campaignId'])] != null) Text(_offerLabel(byId[toInt(o['campaignId'])]!), style: const TextStyle(fontSize: 11.5, color: W.g500)),
                    ])),
              if (pc('co2-p-ends'))
                ListCol(const WebCol('Ends', flex: 1.1), (o) {
                  final ends = _t(byId[toInt(o['campaignId'])]?['endsAt']);
                  if (ends == null) return const Text('No end date', style: TextStyle(fontSize: 12.5, color: W.g500));
                  return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(dateTime(ends.toIso8601String()), style: const TextStyle(fontSize: 12.5)),
                    Text('in ${_left(ends.difference(now))}', style: const TextStyle(fontSize: 11.5, color: Color(0xFFD97706))),
                  ]);
                }),
              if (pc('co2-p-actions'))
                ListCol(const WebCol('Actions', width: 96), (o) => Row(children: [
                      WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit product', onTap: () {
                        final p = products[toInt(o['productId'])];
                        if (p != null) Navigator.push(context, MaterialPageRoute(builder: (_) => ProductEditScreen(product: p)));
                      }),
                      if (byId[toInt(o['campaignId'])] != null) WebIconAction(LucideIcons.tag, color: const Color(0xFF7C3AED), tooltip: 'Open campaign', onTap: () => editCampaign(context, byId[toInt(o['campaignId'])]!, widget.reload)),
                    ])),
            ],
          ),
        ],
      ],
    );
  }
}

/// New / edit / duplicate a campaign — the website's editor: name, applies to (all / categories /
/// brands / products, with a fixed price per product), offer, start, end, paused, homepage banner.
Future<void> editCampaign(BuildContext context, Map<String, dynamic>? c, Future<void> Function() reload, {bool copy = false}) async {
  final s = context.read<AppState>();
  final editing = copy ? null : c;
  final name = TextEditingController(text: c == null ? '' : copy ? '${c['name']} (copy)' : '${c['name']}');
  var scope = '${c?['scope'] ?? 'all'}';
  var type = '${c?['discountType'] ?? 'percent'}';
  final value = TextEditingController(text: c?['discountValue'] == null ? '' : _n(c!['discountValue']));
  final targets = <int>{for (final t in _rows(c?['targets'])) toInt(t['id'])};
  final fixed = <int, TextEditingController>{for (final t in _rows(c?['targets'])) if (t['fixedPrice'] != null) toInt(t['id']): TextEditingController(text: _n(t['fixedPrice']))};
  DateTime? starts = copy ? null : _t(c?['startsAt'])?.toLocal();
  DateTime? ends = copy ? null : _t(c?['endsAt'])?.toLocal();
  var paused = !copy && c?['isPaused'] == true;
  final home = Map<String, dynamic>.from((c?['home'] as Map?) ?? const {'show': false, 'template': 'bold', 'title': '', 'subtitle': '', 'color': '#9f2089', 'cta': 'Shop Now'});
  final hTitle = TextEditingController(text: '${home['title'] ?? ''}'), hSub = TextEditingController(text: '${home['subtitle'] ?? ''}'), hColor = TextEditingController(text: '${home['color'] ?? '#9f2089'}'), hCta = TextEditingController(text: '${home['cta'] ?? 'Shop Now'}');
  var q = '';

  Future<DateTime?> pick(BuildContext d, DateTime? initial, {required bool end}) async {
    final day = await showDatePicker(context: d, firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 730)), initialDate: initial ?? DateTime.now());
    if (day == null || !d.mounted) return null;
    final time = await showTimePicker(context: d, initialTime: initial == null ? (end ? const TimeOfDay(hour: 23, minute: 59) : TimeOfDay.now()) : TimeOfDay.fromDateTime(initial));
    return DateTime(day.year, day.month, day.day, time?.hour ?? (end ? 23 : 0), time?.minute ?? (end ? 59 : 0));
  }

  String when(DateTime d) => dateTime(d.toUtc().toIso8601String());

  final ok = await showAppDialog<bool>(
    context,
    title: editing == null ? 'New Campaign' : 'Edit Campaign',
    icon: LucideIcons.badgePercent,
    width: 680,
    builder: (d) => StatefulBuilder(builder: (d, set) {
      final pool = switch (scope) {
        'category' => [for (final x in s.list('categories')) (toInt(x['id']), '${x['name']}', null)],
        'brand' => [for (final x in s.list('brands')) (toInt(x['id']), '${x['name']}', null)],
        'product' => [for (final x in s.list('products').where((p) => p['status'] == 'active')) (toInt(x['id']), '${x['name']}', toDouble(x['price']))],
        _ => <(int, String, double?)>[],
      };
      final shown = pool.where((x) => targets.contains(x.$1) || q.trim().isEmpty || x.$2.toLowerCase().contains(q.trim().toLowerCase())).take(60).toList();
      return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        DTextField(controller: name, label: 'Campaign name', required: true, autofocus: true, hint: 'e.g. Diwali Sale'),
        const SizedBox(height: 12),
        const Text('Applies to', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        DSegmented<String>(options: const [('all', 'All products'), ('category', 'Categories'), ('brand', 'Brands'), ('product', 'Products')], value: scope, onChanged: (v) => set(() {
              scope = v;
              targets.clear();
              if (v != 'product' && type == 'fixed') type = 'percent';
            })),
        if (scope != 'all') ...[
          const SizedBox(height: 8),
          DTextField(hint: 'Search…', prefixIcon: LucideIcons.search, onChanged: (v) => set(() => q = v)),
          const SizedBox(height: 6),
          Container(
            height: 170,
            decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
            child: ListView(children: [
              for (final (id, label, price) in shown)
                Row(children: [
                  Checkbox(value: targets.contains(id), onChanged: (v) => set(() => v == true ? targets.add(id) : targets.remove(id))),
                  Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
                  if (price != null) Text(money(price), style: const TextStyle(fontSize: 12, color: W.g500)),
                  if (type == 'fixed' && targets.contains(id))
                    Padding(padding: const EdgeInsets.only(left: 8, right: 8), child: SizedBox(width: 110, child: DTextField(controller: fixed.putIfAbsent(id, TextEditingController.new), hint: 'Offer price', prefixText: '₹ ', keyboardType: const TextInputType.numberWithOptions(decimal: true)))),
                  const SizedBox(width: 6),
                ]),
            ]),
          ),
          Padding(padding: const EdgeInsets.only(top: 4), child: Text('${targets.length} chosen', style: const TextStyle(fontSize: 12, color: W.g500))),
        ],
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: WebSelect<String>(label: 'Offer', value: type, options: [('percent', 'Percentage off (%)'), ('amount', 'Amount off (₹)'), if (scope == 'product') ('fixed', 'Fixed price per product')], onChanged: (v) => set(() => type = v)),
          ),
          if (type != 'fixed') ...[const SizedBox(width: 12), SizedBox(width: 160, child: DTextField(controller: value, label: type == 'percent' ? 'Percent' : 'Amount (₹)', required: true, keyboardType: const TextInputType.numberWithOptions(decimal: true)))],
        ]),
        const SizedBox(height: 12),
        Row(children: [
          const SizedBox(width: 44, child: Text('Starts', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
          DSegmented<String>(options: const [('now', 'Now'), ('schedule', 'Pick date')], value: starts == null ? 'now' : 'schedule', onChanged: (v) async {
            if (v == 'now') return set(() => starts = null);
            final t = await pick(d, starts, end: false);
            if (t != null) set(() => starts = t);
          }),
          if (starts != null) Padding(padding: const EdgeInsets.only(left: 10), child: Text(when(starts!), style: const TextStyle(fontSize: 13))),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const SizedBox(width: 44, child: Text('Ends', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
          DSegmented<String>(options: const [('none', 'No end'), ('24h', '24 h'), ('7d', '7 days'), ('30d', '30 days'), ('schedule', 'Pick date')], value: ends == null ? 'none' : 'schedule', onChanged: (v) async {
            if (v == 'none') return set(() => ends = null);
            final base = starts ?? DateTime.now();
            if (v != 'schedule') return set(() => ends = base.add(Duration(days: v == '24h' ? 1 : v == '7d' ? 7 : 30)));
            final t = await pick(d, ends, end: true);
            if (t != null) set(() => ends = t);
          }),
          if (ends != null) Padding(padding: const EdgeInsets.only(left: 10), child: Text(when(ends!), style: const TextStyle(fontSize: 13))),
        ]),
        const SizedBox(height: 4),
        DSwitchRow(label: 'Paused', hint: 'Save it now, start it later', value: paused, onChanged: (v) => set(() => paused = v)),
        const Divider(height: 18, color: W.g100),
        DSwitchRow(label: 'Show a banner on the homepage', value: home['show'] == true, onChanged: (v) => set(() => home['show'] = v)),
        if (home['show'] == true) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: WebSelect<String>(label: 'Design', value: '${home['template'] ?? 'bold'}', options: const [('bold', 'Bold — colour gradient'), ('soft', 'Soft — light tint'), ('ticket', 'Coupon ticket')], onChanged: (v) => set(() => home['template'] = v))),
            const SizedBox(width: 12),
            SizedBox(width: 130, child: DTextField(controller: hColor, label: 'Colour', hint: '#9f2089')),
            const SizedBox(width: 12),
            SizedBox(width: 140, child: DTextField(controller: hCta, label: 'Button', hint: 'Shop Now')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: DTextField(controller: hTitle, label: 'Headline', labelHint: 'blank = campaign name')),
            const SizedBox(width: 12),
            Expanded(child: DTextField(controller: hSub, label: 'Second line', labelHint: 'blank = automatic')),
          ]),
        ],
      ]);
    }),
    actions: [
      const DAction.cancel(),
      DAction(editing == null ? 'Create Campaign' : 'Save Changes', primary: true, onPressed: () async {
        if (name.text.trim().isEmpty) return toast(context, 'Give the campaign a name.', error: true);
        if (scope != 'all' && targets.isEmpty) return toast(context, 'Choose at least one ${scope == 'category' ? 'category' : scope}.', error: true);
        if (type != 'fixed' && (double.tryParse(value.text.trim()) ?? 0) <= 0) return toast(context, 'Type the discount.', error: true);
        if (type == 'percent' && (double.tryParse(value.text.trim()) ?? 0) >= 100) return toast(context, 'The percentage must be below 100.', error: true);
        if (ends != null && ends!.isBefore(starts ?? DateTime.now())) return toast(context, 'The end must be after the start.', error: true);
        popDialog(context, true);
      }),
    ],
  );
  if (ok != true || !context.mounted) return;
  home
    ..['title'] = hTitle.text.trim()
    ..['subtitle'] = hSub.text.trim()
    ..['color'] = hColor.text.trim()
    ..['cta'] = hCta.text.trim();
  final body = {
    'name': name.text.trim(), 'scope': scope, 'discountType': type, 'discountValue': type == 'fixed' ? null : double.tryParse(value.text.trim()),
    'startsAt': starts?.toUtc().toIso8601String(), 'endsAt': ends?.toUtc().toIso8601String(), 'isPaused': paused, 'home': home,
    'targets': [for (final id in targets) {'type': scope, 'id': id, if (scope == 'product' && type == 'fixed') 'fixedPrice': double.tryParse(fixed[id]?.text.trim() ?? '')}],
  };
  await nativeSend(
    context,
    OutboxItem(
      id: newId(), method: editing == null ? 'POST' : 'PUT', path: editing == null ? '/api/ecommerce/campaigns2' : '/api/ecommerce/campaigns2/${editing['id']}', label: 'Campaign ${name.text.trim()}', body: body, refresh: const ['products'],
      effect: editing == null
          ? {'kind': 'page_row_new', 'page': 'campaigns', 'list': 'campaigns', 'row': {...body, 'id': -DateTime.now().millisecondsSinceEpoch, 'localRef': newId(), 'createdAt': DateTime.now().toUtc().toIso8601String(), 'stats': const {}}}
          : {'kind': 'page_row', 'page': 'campaigns', 'list': 'campaigns', 'id': editing['id'], 'fields': body},
    ),
    reload: reload,
    done: editing == null ? 'Campaign created — prices change on time.' : 'Campaign saved.',
  );
}

/* ───────────────────────── Coupons ───────────────────────── */

String _couponStatus(Map c) {
  final now = DateTime.now().toUtc();
  if (c['paused'] == true) return 'paused';
  if (c['status'] == 'inactive') return 'inactive';
  if (_t(c['endsAt'])?.isBefore(now) == true) return 'expired';
  if (_t(c['startsAt'])?.isAfter(now) == true) return 'scheduled';
  return 'active';
}

const _couponMeta = {
  'active': ('Active', Color(0xFF10B981)),
  'scheduled': ('Scheduled', Color(0xFFF59E0B)),
  'expired': ('Expired', Color(0xFF6B7280)),
  'paused': ('Paused', Color(0xFF0EA5E9)),
  'inactive': ('Disabled', Color(0xFFDC2626)),
};

class _Coupons extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  final Widget tabs;
  const _Coupons({required this.rows, required this.reload, required this.tabs});
  @override
  State<_Coupons> createState() => _CouponsState();
}

class _CouponsState extends State<_Coupons> {
  static final _def = displayDefs['ecom_coupons2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _tab = 'all', _q = '';
  int _page = 0;

  Future<void> _pause(Map c) => nativeSend(
        context,
        OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/coupons2/${c['id']}', body: {'isPaused': c['paused'] != true}, label: 'Coupon ${c['code']}: ${c['paused'] == true ? 'resumed' : 'paused'}', refresh: const ['coupons'],
            effect: {'kind': 'page_row', 'page': 'coupons', 'id': c['id'], 'fields': {'paused': c['paused'] != true}}),
        reload: widget.reload,
        done: c['paused'] == true ? '“${c['title']}” resumed.' : '“${c['title']}” paused.',
      );

  Future<void> _delete(Map c) async {
    if (!await confirm(context, 'Delete “${c['title']}”?', "This can't be undone.${toInt(c['used']) > 0 ? ' It has been used ${c['used']} time${toInt(c['used']) == 1 ? '' : 's'} — past orders keep their discount, only the code stops working.' : ''}", ok: 'Delete', danger: true) || !mounted) return;
    await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/coupons2/${c['id']}', label: 'Delete coupon ${c['code']}', refresh: const ['coupons'], effect: {'kind': 'page_row_delete', 'page': 'coupons', 'ids': [c['id']]}),
        reload: widget.reload, done: 'Coupon deleted.');
  }

  Future<void> _duplicate(Map c) => nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/coupons2/${c['id']}/duplicate', label: 'Duplicate coupon ${c['code']}'), reload: widget.reload, done: 'Copy made — it starts paused.');

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final on = _prefs.on;
    final all = widget.rows;
    final q = _q.trim().toLowerCase();
    final list = all.where((c) => (_tab == 'all' || _couponStatus(c) == _tab) && (q.isEmpty || '${c['title']} ${c['code']}'.toLowerCase().contains(q))).toList();
    const per = 8;
    final pages = (list.length / per).ceil().clamp(1, 1 << 20);
    if (_page >= pages) _page = pages - 1;
    final shown = list.skip(_page * per).take(per).toList();
    final activity = _rows(context.select<AppState, Map<String, dynamic>?>((s) => s.pageData['coupon_activity'])?['data']);

    Widget card(Map<String, dynamic> c) {
      final st = _couponStatus(c);
      final running = st == 'paused' ? _couponStatus({...c, 'paused': false}) : st;
      final (runLabel, runColor) = _couponMeta[running]!;
      final pct = c['discountType'] == 'percentage';
      return WebCard(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 42, height: 42, decoration: BoxDecoration(color: const Color(0xFFF5F3FF), borderRadius: BorderRadius.circular(8)), child: const Icon(LucideIcons.ticket, size: 19, color: Color(0xFF7C3AED))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text('${c['title']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: W.g900)),
                  WebPillMenu(
                    value: c['paused'] == true ? 'Paused' : runLabel,
                    options: [runLabel, 'Paused'],
                    color: c['paused'] == true ? const Color(0xFF0EA5E9) : runColor,
                    onSelected: toInt(c['id']) < 0 ? null : (v) => (v == 'Paused') != (c['paused'] == true) ? _pause(c) : null,
                  ),
                ]),
                const SizedBox(height: 6),
                InkWell(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: '${c['code']}'));
                    toast(context, 'Code ${c['code']} copied.');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: const Color(0xFFEFF6FF), border: Border.all(color: const Color(0xFF93C5FD)), borderRadius: BorderRadius.circular(6)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text('${c['code']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: .5, color: Color(0xFF2563EB), fontFamily: 'monospace')),
                      const SizedBox(width: 6),
                      const Icon(LucideIcons.copy, size: 13, color: Color(0xFF2563EB)),
                    ]),
                  ),
                ),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${pct ? '${_n(c['discountValue'])}%' : money(c['discountValue'])} OFF', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: W.g900)),
              Text(pct ? 'Percentage' : 'Fixed Amount', style: const TextStyle(fontSize: 11.5, color: W.g500)),
            ]),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 18, runSpacing: 4, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [const Icon(LucideIcons.globe, size: 14, color: W.g400), const SizedBox(width: 6), Text(c['appliesTo'] == 'all' ? 'All Products' : '${c['target'] ?? c['appliesTo']}', style: const TextStyle(fontSize: 13, color: W.g600))]),
            Row(mainAxisSize: MainAxisSize.min, children: [const Icon(LucideIcons.users, size: 14, color: W.g400), const SizedBox(width: 6), Text('${c['used']} / ${c['limit']} used', style: const TextStyle(fontSize: 13, color: W.g600))]),
          ]),
          if (c['startsAt'] != null || c['endsAt'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(children: [
                const Icon(LucideIcons.calendar, size: 14, color: W.g400),
                const SizedBox(width: 6),
                Text('${c['startsAt'] == null ? 'No start date' : dateShort(c['startsAt'])} – ${c['endsAt'] == null ? 'No end date' : dateShort(c['endsAt'])}', style: const TextStyle(fontSize: 13, color: W.g600)),
              ]),
            ),
          const Divider(height: 22, color: W.g100),
          Row(children: [
            TextButton.icon(onPressed: () => _editCoupon(c), icon: const Icon(LucideIcons.pencil, size: 14, color: W.g700), label: const Text('Edit', style: TextStyle(color: W.g700))),
            TextButton.icon(onPressed: toInt(c['id']) < 0 ? null : () => _duplicate(c), icon: const Icon(LucideIcons.files, size: 14, color: W.g700), label: const Text('Duplicate', style: TextStyle(color: W.g700))),
            TextButton.icon(onPressed: toInt(c['id']) < 0 ? null : () => _pause(c), icon: Icon(c['paused'] == true ? LucideIcons.play : LucideIcons.pause, size: 14, color: W.g700), label: Text(c['paused'] == true ? 'Resume' : 'Pause', style: const TextStyle(color: W.g700))),
            const Spacer(),
            TextButton.icon(onPressed: toInt(c['id']) < 0 ? null : () => _delete(c), icon: const Icon(LucideIcons.trash2, size: 14, color: Color(0xFFDC2626)), label: const Text('Delete', style: TextStyle(color: Color(0xFFDC2626)))),
          ]),
        ]),
      );
    }

    final grid = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (on('cp2-grid', 'cp2-search')) ...[
        WebCard(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            DSegmented<String>(options: const [('all', 'All'), ('active', 'Active'), ('scheduled', 'Scheduled'), ('expired', 'Expired'), ('paused', 'Paused')], value: _tab, onChanged: (v) => setState(() {
                  _tab = v;
                  _page = 0;
                })),
            const Spacer(),
            WebSearch(width: 240, hint: 'Search coupons…', onChanged: (v) => setState(() {
                  _q = v;
                  _page = 0;
                })),
          ]),
        ),
        const SizedBox(height: 12),
      ],
      if (shown.isEmpty)
        WebCard(padding: const EdgeInsets.all(36), child: Center(child: all.isEmpty ? TextButton(onPressed: () => _editCoupon(null), child: const Text('No coupons yet. Create your first coupon')) : const Text('No coupons match this filter.', style: TextStyle(color: W.g400))))
      else
        WebGrid(columns: 2, minWidth: 360, children: [for (final c in shown) card(c)]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: Text(list.isEmpty ? 'Showing 0 results' : 'Showing ${_page * per + 1} to ${_page * per + shown.length} of ${list.length} results', style: const TextStyle(fontSize: 13, color: W.g700))),
        if (pages > 1) ...[
          DButton.icon(LucideIcons.chevronLeft, tooltip: 'Previous', size: DSize.sm, variant: DVariant.secondary, onPressed: _page > 0 ? () => setState(() => _page--) : null),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('${_page + 1} / $pages', style: const TextStyle(fontSize: 13))),
          DButton.icon(LucideIcons.chevronRight, tooltip: 'Next', size: DSize.sm, variant: DVariant.secondary, onPressed: _page + 1 < pages ? () => setState(() => _page++) : null),
        ],
      ]),
    ]);

    final panel = WebCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Recent Activity', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
        const SizedBox(height: 12),
        if (activity.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Center(child: Text('No coupon activity logged yet.', style: TextStyle(fontSize: 13, color: W.g400)))),
        for (final a in activity)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              () {
                final (IconData i, Color col) = switch (a['action']) {
                  'create' => (LucideIcons.circleCheck, const Color(0xFF059669)),
                  'delete' => (LucideIcons.trash2, const Color(0xFFDC2626)),
                  'pause' => (LucideIcons.pause, const Color(0xFFD97706)),
                  'resume' => (LucideIcons.play, const Color(0xFF059669)),
                  _ => (LucideIcons.pencil, const Color(0xFF2563EB)),
                };
                return Container(width: 30, height: 30, decoration: BoxDecoration(color: col.withValues(alpha: .1), shape: BoxShape.circle), child: Icon(i, size: 14, color: col));
              }(),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${a['description']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g800)),
                  Text('${a['byUsername'] != null ? 'By ${a['byUsername']} · ' : ''}${ago(a['createdAt'])}', style: const TextStyle(fontSize: 11.5, color: W.g400)),
                ]),
              ),
            ]),
          ),
      ]),
    );

    return WebPage(
      title: 'Offers & Coupons',
      subtitle: 'Coupon codes customers enter at checkout',
      onRefresh: () async {
        await widget.reload();
        if (context.mounted) await context.read<AppState>().reloadPage('coupon_activity');
      },
      actions: [
        DisplayOptionsButton(_def),
        WebButton('New Coupon', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => _editCoupon(null)),
      ],
      children: [
        widget.tabs,
        const SizedBox(height: 14),
        ...webCardsRow([
          if (on('cp2-cards', 'cp2-k-active')) WebMetric(icon: LucideIcons.tag, color: const Color(0xFF059669), value: '${all.where((c) => _couponStatus(c) == 'active').length}', label: 'Active Coupons', onTap: () => setState(() => _tab = 'active')),
          if (on('cp2-cards', 'cp2-k-scheduled')) WebMetric(icon: LucideIcons.calendar, color: const Color(0xFFD97706), value: '${all.where((c) => _couponStatus(c) == 'scheduled').length}', label: 'Scheduled Coupons', onTap: () => setState(() => _tab = 'scheduled')),
          if (on('cp2-cards', 'cp2-k-expired')) WebMetric(icon: LucideIcons.clock, color: const Color(0xFFEF4444), value: '${all.where((c) => _couponStatus(c) == 'expired').length}', label: 'Expired Coupons', onTap: () => setState(() => _tab = 'expired')),
          if (on('cp2-cards', 'cp2-k-redemptions')) WebMetric(icon: LucideIcons.trendingUp, color: const Color(0xFF7C3AED), value: '${all.fold<int>(0, (t, c) => t + toInt(c['used']))}', label: 'Total Redemptions'),
        ]),
        LayoutBuilder(builder: (c, box) {
          final showGrid = on('cp2-grid'), showPanel = on('cp2-activity', 'cp2-activity-panel');
          if (!showPanel) return showGrid ? grid : const SizedBox();
          if (!showGrid) return panel;
          return box.maxWidth >= 1000
              ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: grid), const SizedBox(width: 16), SizedBox(width: 320, child: panel)])
              : Column(children: [grid, const SizedBox(height: 12), panel]);
        }),
      ],
    );
  }

  /// The website's coupon form: title, code, type, value, times, applies to, start / end, status.
  Future<void> _editCoupon(Map<String, dynamic>? c) async {
    final s = context.read<AppState>();
    final title = TextEditingController(text: c?['title'] ?? ''), code = TextEditingController(text: c?['code'] ?? '');
    final value = TextEditingController(text: c == null ? '' : _n(c['discountValue'])), limit = TextEditingController(text: '${c?['limit'] ?? 100}');
    var type = '${c?['discountType'] ?? 'percentage'}', applies = '${c?['appliesTo'] ?? 'all'}', status = c?['status'] == 'inactive' ? 'inactive' : 'active';
    int? product = c?['productId'] == null ? null : toInt(c!['productId']), category = c?['categoryId'] == null ? null : toInt(c!['categoryId']);
    DateTime? starts = _t(c?['startsAt'])?.toLocal(), ends = _t(c?['endsAt'])?.toLocal();
    Future<DateTime?> pick(BuildContext d, DateTime? initial, bool end) async {
      final day = await showDatePicker(context: d, firstDate: DateTime(2020), lastDate: DateTime.now().add(const Duration(days: 1095)), initialDate: initial ?? DateTime.now());
      if (day == null || !d.mounted) return null;
      final time = await showTimePicker(context: d, initialTime: initial == null ? TimeOfDay(hour: end ? 23 : 0, minute: end ? 59 : 0) : TimeOfDay.fromDateTime(initial));
      return DateTime(day.year, day.month, day.day, time?.hour ?? (end ? 23 : 0), time?.minute ?? (end ? 59 : 0));
    }

    Widget dateBox(BuildContext d, String label, DateTime? v, void Function(DateTime?) set, bool end) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(child: DButton(v == null ? 'Not set' : dateTime(v.toUtc().toIso8601String()), icon: LucideIcons.calendar, onPressed: () async => set(await pick(d, v, end) ?? v))),
              if (v != null) IconButton(onPressed: () => set(null), icon: const Icon(LucideIcons.x, size: 16)),
            ]),
          ]),
        );

    final ok = await showAppDialog<bool>(
      context,
      title: c == null ? 'Create Coupon' : 'Edit Coupon',
      icon: LucideIcons.ticketPercent,
      width: 560,
      builder: (d) => StatefulBuilder(
        builder: (d, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          DTextField(controller: title, label: 'Title', required: true, autofocus: true, hint: 'e.g. Welcome Offer'),
          const SizedBox(height: 12),
          DTextField(controller: code, label: 'Code', required: true, hint: 'WELCOME10', textCapitalization: TextCapitalization.characters),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: WebSelect<String>(label: 'Discount type', value: type, options: const [('percentage', 'Percentage (%)'), ('fixed', 'Fixed Amount (₹)')], onChanged: (v) => set(() => type = v))),
            const SizedBox(width: 12),
            Expanded(child: DTextField(controller: value, label: 'Discount value', required: true, keyboardType: const TextInputType.numberWithOptions(decimal: true))),
            const SizedBox(width: 12),
            Expanded(child: DTextField(controller: limit, label: 'Number of times', keyboardType: TextInputType.number)),
          ]),
          const SizedBox(height: 12),
          WebSelect<String>(label: 'Applies to', value: applies, options: const [('all', 'All Products'), ('product', 'Specific Product'), ('category', 'Specific Category')], onChanged: (v) => set(() => applies = v)),
          if (applies == 'product') ...[const SizedBox(height: 8), WebSelect<int?>(value: product, options: [(null, 'Select a product…'), for (final p in s.list('products')) (toInt(p['id']), '${p['name']}')], onChanged: (v) => set(() => product = v))],
          if (applies == 'category') ...[const SizedBox(height: 8), WebSelect<int?>(value: category, options: [(null, 'Select a category…'), for (final x in s.list('categories')) (toInt(x['id']), '${x['name']}')], onChanged: (v) => set(() => category = v))],
          const SizedBox(height: 12),
          Row(children: [dateBox(d, 'Starts', starts, (v) => set(() => starts = v), false), const SizedBox(width: 12), dateBox(d, 'Ends', ends, (v) => set(() => ends = v), true)]),
          const SizedBox(height: 12),
          WebSelect<String>(label: 'Status', value: status, options: const [('active', 'Active'), ('inactive', 'Disabled')], onChanged: (v) => set(() => status = v)),
        ]),
      ),
      actions: [
        if (c != null) DAction('Delete', variant: DVariant.danger, onPressed: () async {
          popDialog(context, false);
          await _delete(c);
        }),
        const DAction.cancel(),
        DAction(c == null ? 'Create Coupon' : 'Save Changes', primary: true, onPressed: () async {
          if (title.text.trim().isEmpty || code.text.trim().isEmpty) return toast(context, 'Type the title and the code.', error: true);
          if ((double.tryParse(value.text.trim()) ?? 0) <= 0) return toast(context, 'Type the discount value.', error: true);
          if (applies == 'product' && product == null || applies == 'category' && category == null) return toast(context, 'Choose what it applies to.', error: true);
          popDialog(context, true);
        }),
      ],
    );
    if (ok != true || !mounted) return;
    final body = {
      'title': title.text.trim(), 'code': code.text.trim().toUpperCase(), 'discountType': type, 'discountValue': double.tryParse(value.text.trim()) ?? 0, 'appliesTo': applies,
      'productId': applies == 'product' ? product : null, 'categoryId': applies == 'category' ? category : null, 'numberOfTimes': int.tryParse(limit.text.trim()) ?? 1, 'status': status,
      'isPaused': c?['paused'] == true, 'startsAt': starts?.toUtc().toIso8601String(), 'endsAt': ends?.toUtc().toIso8601String(),
    };
    final row = {
      'title': body['title'], 'code': body['code'], 'discountType': type, 'discountValue': body['discountValue'], 'appliesTo': applies, 'productId': body['productId'], 'categoryId': body['categoryId'], 'limit': body['numberOfTimes'],
      'status': status, 'startsAt': body['startsAt'], 'endsAt': body['endsAt'],
      'target': applies == 'product' ? (s.list('products').where((p) => toInt(p['id']) == product).firstOrNull?['name']) : applies == 'category' ? (s.list('categories').where((x) => toInt(x['id']) == category).firstOrNull?['name']) : null,
    };
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: c == null ? 'POST' : 'PUT', path: c == null ? '/api/ecommerce/coupons2' : '/api/ecommerce/coupons2/${c['id']}', label: 'Coupon ${body['code']}', body: body, refresh: const ['coupons'],
        effect: c == null
            ? {'kind': 'page_row_new', 'page': 'coupons', 'row': {...row, 'id': -DateTime.now().millisecondsSinceEpoch, 'localRef': newId(), 'used': 0, 'paused': false, 'createdAt': DateTime.now().toUtc().toIso8601String()}}
            : {'kind': 'page_row', 'page': 'coupons', 'id': c['id'], 'fields': row},
      ),
      reload: widget.reload,
      done: c == null ? '“${body['title']}” created.' : '“${body['title']}” saved.',
    );
  }
}
