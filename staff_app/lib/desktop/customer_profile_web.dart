import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../features/customers/customers_screen.dart' show editCustomer;
import '../features/dues/collect_sheet.dart';
import '../features/orders/order_detail_screen.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// A customer's profile exactly as on the website (admin/ecommerce/customers/[id]): header (photo,
/// name, Store / Online, status, phone · email · since, login methods, Edit profile / New order,
/// Call / WhatsApp), five numbers, and the Orders (with Collect + receipts ×N), Addresses and
/// Due history tabs — with the website's Display Options. All from this computer.
class CustomerProfileWeb extends StatefulWidget {
  final int id;
  const CustomerProfileWeb({super.key, required this.id});
  @override
  State<CustomerProfileWeb> createState() => _CustomerProfileWebState();
}

class _CustomerProfileWebState extends State<CustomerProfileWeb> {
  static final _def = displayDefs['ecom_customer_profile_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _tab = 'orders';

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final c = s.list('customers').where((x) => toInt(x['id']) == widget.id).firstOrNull;
    if (c == null) return webScaffold(title: 'Customer', body: const EmptyState(icon: Icons.person_off_outlined, title: 'Customer not found'));
    final phone = c['phone'] as String?;
    final online = c['type'] == 'online';

    // Orders: all time (page data) merged with the 60-day set (fresher, and includes ones made here offline).
    final recent = s.list('orders').where((o) => toInt(o['customerId']) == widget.id).toList();
    final older = ((s.pageData['customer_orders']?['data'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).where((o) => toInt(o['customerId']) == widget.id && !recent.any((r) => r['id'] == o['id']));
    final orders = [...recent, ...older]..sort((a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}'));
    final credits = [
      ...s.list('dues').where((d) => toInt(d['customerId']) == widget.id),
      ...((s.pageData['dues_paid']?['data'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).where((d) => toInt(d['customerId']) == widget.id),
    ];
    final addresses = ((s.pageData['addresses']?['data'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).where((a) => toInt(a['customerId']) == widget.id).toList();
    final sales = orders.where((o) => o['status'] != 'Canceled');
    final spent = sales.fold<double>(0, (t, o) => t + toDouble(o['total']));
    final totalDue = credits.fold<double>(0, (t, d) => t + toDouble(d['balance']));
    final canCollect = s.perms.credits || s.perms.billing || s.perms.customers;

    Future<void> setStatus(String v) async {
      final status = v == 'Active' ? 'active' : 'inactive';
      if (c['status'] == status) return;
      await s.enqueue(OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/customers/${c['id']}', body: {'status': status}, label: '${c['name']}: ${v.toLowerCase()}',
          effect: {'kind': 'customer', 'id': c['id'], 'fields': {'status': status}}, refresh: const ['customers']));
      if (context.mounted) toast(context, status == 'active' ? 'Customer is active again.' : 'Customer set to inactive.');
    }

    // Receipts of one order: paid with the bill (opens the invoice) + each due payment.
    List<Map<String, dynamic>> receiptsOf(Map o) => [
          for (final p in ((o['pays'] as List?) ?? const []).cast<Map>()) {'receipt': 'Bill ${o['number']}', 'amount': toDouble(p['amount']), 'method': '${p['method']} · paid with the bill', 'at': p['at'], 'order': o},
          for (final d in credits.where((d) => toInt(d['orderId']) == toInt(o['id'])))
            for (final p in ((d['payments'] as List?) ?? const []).cast<Map>()) {'receipt': p['receipt'] ?? 'Pending', 'amount': toDouble(p['amount']), 'method': '${p['method']} · due payment', 'at': p['at']},
        ];
    Future<void> showReceipts(Map o, List<Map<String, dynamic>> list) => showDDialog<void>(
          context,
          title: 'Receipts — ${o['number']}',
          width: 520,
          builder: (d) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
              child: Column(children: [
                for (final (i, r) in list.indexed)
                  InkWell(
                    onTap: r['order'] != null ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id'])))) : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(border: i == 0 ? null : const Border(top: BorderSide(color: W.g100))),
                      child: Row(children: [
                        Container(width: 26, height: 26, alignment: Alignment.center, decoration: const BoxDecoration(color: W.g100, shape: BoxShape.circle), child: Text('${i + 1}×', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: W.g600))),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${r['receipt']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF2563EB))),
                            Text('${r['at'] == null ? '' : '${dateTime(r['at'])} · '}${r['method']}', style: const TextStyle(fontSize: 12, color: W.g500)),
                          ]),
                        ),
                        Text(money(r['amount']), style: const TextStyle(fontWeight: FontWeight.w700, color: W.green)),
                      ]),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 10),
            Text.rich(TextSpan(text: 'Paid so far ', style: const TextStyle(fontSize: 13, color: W.g600), children: [TextSpan(text: money(list.fold<double>(0, (t, r) => t + toDouble(r['amount']))), style: const TextStyle(fontWeight: FontWeight.w700, color: W.green))])),
          ]),
        );

    // ── header ──
    final header = WebCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(height: 64, decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFFEDE9FE), Color(0xFFFCE7F3)]), borderRadius: BorderRadius.vertical(top: Radius.circular(W.radius)))),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Transform.translate(
              offset: const Offset(0, -28),
              child: Container(
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 4), boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 8)]),
                child: Avatar('${c['name']}', photo: c['avatar'], size: 88),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Text('${c['name'] ?? ''}'.trim().isEmpty ? 'New customer (no name yet)' : '${c['name']}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: W.g900)),
                    online ? const WebBadge('Online', color: Colors.white, bg: Color(0xFF2563EB)) : const WebBadge('Store', color: W.g900, bg: Color(0xFFFBBF24)),
                    WebPillMenu(value: c['status'] == 'active' ? 'Active' : 'Inactive', options: const ['Active', 'Inactive'], color: c['status'] == 'active' ? W.green : W.grey, onSelected: s.perms.customers ? setStatus : null),
                  ]),
                  if (on('cp-header', 'cp-h-contact')) ...[
                    const SizedBox(height: 6),
                    Wrap(spacing: 16, runSpacing: 4, children: [
                      if (phone != null) Row(mainAxisSize: MainAxisSize.min, children: [const Icon(LucideIcons.phone, size: 14, color: W.g500), const SizedBox(width: 6), Text(phone, style: const TextStyle(fontSize: 13, color: W.g700))]),
                      if (c['email'] != null) Row(mainAxisSize: MainAxisSize.min, children: [const Icon(LucideIcons.mail, size: 14, color: W.g500), const SizedBox(width: 6), Text('${c['email']}', style: const TextStyle(fontSize: 13, color: W.g700))]),
                      Row(mainAxisSize: MainAxisSize.min, children: [const Icon(LucideIcons.calendar, size: 14, color: W.g500), const SizedBox(width: 6), Text('Customer since ${dateShort(c['since'])}', style: const TextStyle(fontSize: 13, color: W.g700))]),
                    ]),
                  ],
                  if (on('cp-header', 'cp-h-login') && online) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, children: [
                      if (phone != null) const WebBadge('Mobile OTP login', color: Color(0xFF047857), bg: Color(0xFFECFDF5)),
                      if (c['hasPassword'] == true) const WebBadge('Password login', color: Color(0xFF0369A1), bg: Color(0xFFF0F9FF)),
                    ]),
                  ],
                  if (_prefs.item('cp-address') && '${c['address'] ?? ''}'.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Row(children: [const Icon(LucideIcons.mapPin, size: 14, color: W.g500), const SizedBox(width: 6), Expanded(child: Text('${c['address']}', style: const TextStyle(fontSize: 13, color: W.g700)))]),
                  ],
                ]),
              ),
            ),
            if (on('cp-header', 'cp-h-actions')) ...[
              if (s.perms.customers) WebButton('Edit profile', icon: LucideIcons.pencil, color: const Color(0xFF2563EB), onPressed: () => editCustomer(context, c)),
              if (s.perms.seesPos) ...[
                const SizedBox(width: 8),
                WebButton('New order', icon: LucideIcons.shoppingCart, onPressed: () {
                  context.read<NavController>().go('pos', {'customer': widget.id});
                  Navigator.of(context).popUntil((r) => r.isFirst);
                }),
              ],
            ],
            if (on('cp-header', 'cp-h-call') && phone != null) ...[
              const SizedBox(width: 8),
              WebIconAction(LucideIcons.phone, color: W.g700, tooltip: 'Call $phone', onTap: () => launchUrl(Uri.parse('tel:$phone'))),
              WebIconAction(LucideIcons.messageCircle, color: W.green, tooltip: 'WhatsApp', onTap: () => launchUrl(Uri.parse('https://wa.me/91${phone.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '')}'), mode: LaunchMode.externalApplication)),
            ],
          ]),
        ),
      ]),
    );

    final stats = [
      if (on('cp-stats', 'cp-k-orders')) WebMiniMetric(icon: LucideIcons.shoppingBag, color: const Color(0xFF2563EB), value: '${orders.length}', label: '', sub: 'Orders'),
      if (on('cp-stats', 'cp-k-spent')) WebMiniMetric(icon: LucideIcons.indianRupee, color: const Color(0xFF059669), value: money(spent), label: '', sub: 'Total spent'),
      if (on('cp-stats', 'cp-k-avg')) WebMiniMetric(icon: LucideIcons.trendingUp, color: W.primary, value: money(sales.isEmpty ? 0 : spent / sales.length), label: '', sub: 'Average order'),
      if (on('cp-stats', 'cp-k-due')) WebMiniMetric(icon: LucideIcons.handCoins, color: const Color(0xFFDC2626), value: totalDue > 0.004 ? money(totalDue) : 'None', label: '', sub: 'Due'),
      if (on('cp-stats', 'cp-k-last')) WebMiniMetric(icon: LucideIcons.calendar, color: const Color(0xFFD97706), value: orders.isEmpty ? 'Never' : dateShort(orders.first['createdAt']), label: '', sub: 'Last order'),
    ];

    // ── tabs ──
    final tabs = [
      if (on('cp-tabs', 'cp-t-orders')) ('orders', 'Orders (${orders.length})', LucideIcons.receipt),
      if (on('cp-tabs', 'cp-t-addresses')) ('addresses', 'Addresses (${addresses.length})', LucideIcons.mapPin),
      if (on('cp-tabs', 'cp-t-due')) ('due', 'Due history (${credits.length})', LucideIcons.handCoins),
    ];
    final tab = tabs.any((t) => t.$1 == _tab) ? _tab : (tabs.isEmpty ? '' : tabs.first.$1);
    bool col(String k) => on('cp-cols', k);
    Widget tabBody() {
      switch (tab) {
        case 'orders':
          return WebTable(
            cols: [
              if (col('cp-c-order')) const WebCol('Order', flex: 1.2),
              if (col('cp-c-date')) const WebCol('Date', flex: 1.2),
              if (col('cp-c-total')) const WebCol('Total', flex: 1, right: true),
              if (col('cp-c-payment')) const WebCol('Payment', flex: .9),
              if (col('cp-c-status')) const WebCol('Status', flex: 1),
              const WebCol('Due / Receipts', flex: 1.6),
            ],
            rows: [
              for (final o in orders)
                [
                  if (col('cp-c-order'))
                    Row(children: [
                      Flexible(child: Text('${o['number']}', style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF2563EB)))),
                      const SizedBox(width: 6),
                      if (o['type'] != 'online') const WebBadge('STORE', color: Color(0xFFB45309), bg: Color(0xFFFFFBEB)),
                    ]),
                  if (col('cp-c-date')) Text(dateShort(o['createdAt']), style: const TextStyle(fontSize: 13, color: W.g700)),
                  if (col('cp-c-total')) Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (col('cp-c-payment')) Align(alignment: Alignment.centerLeft, child: WebPill(o['paymentStatus'] == 'Paid' ? 'Paid' : 'Unpaid', color: o['paymentStatus'] == 'Paid' ? W.green : W.grey)),
                  if (col('cp-c-status')) Align(alignment: Alignment.centerLeft, child: WebPill('${o['status']}', color: o['status'] == 'Delivered' ? W.green : o['status'] == 'Canceled' ? const Color(0xFFDC2626) : W.yellow, textColor: o['status'] == 'Pending' ? W.g900 : Colors.white)),
                  () {
                    final open = credits.where((d) => toInt(d['orderId']) == toInt(o['id']) && toDouble(d['balance']) > 0.004).toList();
                    final list = receiptsOf(o);
                    return Row(children: [
                      if (open.isNotEmpty && canCollect) ...[WebButton('Collect', icon: LucideIcons.handCoins, color: W.green, height: 30, onPressed: () => collectDues(context, open)), const SizedBox(width: 6)],
                      if (list.isNotEmpty) WebButton('×${list.length}', icon: LucideIcons.receipt, height: 30, tooltip: '${list.length} receipt${list.length == 1 ? '' : 's'}', onPressed: () => showReceipts(o, list)),
                      if (open.isEmpty && list.isEmpty) webDash,
                    ]);
                  }(),
                ],
            ],
            onRowTap: [for (final o in orders) () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))))],
            empty: const Center(child: Text('No orders yet.', style: TextStyle(color: W.g500))),
          );
        case 'addresses':
          if (addresses.isEmpty) return const Padding(padding: EdgeInsets.all(30), child: Center(child: Text('No saved addresses.', style: TextStyle(color: W.g500))));
          return WebGrid(columns: 2, gap: 12, minWidth: 280, children: [
            for (final a in addresses)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(border: Border.all(color: a['isDefault'] == true ? const Color(0xFF93C5FD) : W.g200), borderRadius: BorderRadius.circular(8)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text('${a['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600, color: W.g900)),
                    const SizedBox(width: 8),
                    WebBadge('${a['type'] ?? 'Home'}'.toUpperCase(), color: W.g600, bg: W.g100),
                    if (a['isDefault'] == true) ...[const SizedBox(width: 6), const WebBadge('DEFAULT', color: Color(0xFF1D4ED8), bg: Color(0xFFEFF6FF))],
                  ]),
                  if (a['phone'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${a['phone']}', style: const TextStyle(fontSize: 12.5, color: W.g600))),
                  Padding(padding: const EdgeInsets.only(top: 6), child: Text('${a['text']}', style: const TextStyle(fontSize: 13, height: 1.45, color: W.g800))),
                  if (a['mapUrl'] != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: WebButton('Open in Maps', icon: LucideIcons.mapPin, height: 30, onPressed: () => launchUrl(Uri.parse('${a['mapUrl']}'), mode: LaunchMode.externalApplication)),
                    ),
                ]),
              ),
          ]);
        case 'due':
          return WebTable(
            cols: const [WebCol('Order', flex: 1.1), WebCol('Date', flex: 1), WebCol('Amount', flex: 1, right: true), WebCol('Paid', flex: 1, right: true), WebCol('Balance', flex: 1, right: true), WebCol('Status', flex: .9), WebCol('Actions', flex: 1.5)],
            rows: [
              for (final d in credits)
                [
                  Text('${d['orderNumber'] ?? '—'}', style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF2563EB))),
                  Text(dateShort(d['createdAt']), style: const TextStyle(fontSize: 13, color: W.g700)),
                  Text(money(d['amount'])),
                  Text(money(d['paid']), style: const TextStyle(color: W.green)),
                  Text(money(d['balance']), style: TextStyle(fontWeight: FontWeight.w700, color: toDouble(d['balance']) > 0.004 ? const Color(0xFFDC3545) : W.green)),
                  Align(alignment: Alignment.centerLeft, child: WebPill(toDouble(d['balance']) <= 0.004 ? 'Paid' : toDouble(d['paid']) > 0.004 ? 'Partly' : 'Unpaid', color: toDouble(d['balance']) <= 0.004 ? W.green : toDouble(d['paid']) > 0.004 ? W.yellow : W.grey, textColor: toDouble(d['balance']) > 0.004 && toDouble(d['paid']) > 0.004 ? W.g900 : Colors.white)),
                  Row(children: [
                    if (toDouble(d['balance']) > 0.004 && canCollect) ...[WebButton('Collect', icon: LucideIcons.handCoins, color: W.green, height: 30, onPressed: () => collectDues(context, [d])), const SizedBox(width: 6)],
                    if (((d['payments'] as List?) ?? const []).isNotEmpty)
                      WebButton('×${(d['payments'] as List).length}', icon: LucideIcons.receipt, height: 30, onPressed: () => showReceipts({'number': d['orderNumber'], 'id': d['orderId']}, [
                            for (final p in (d['payments'] as List).cast<Map>()) {'receipt': p['receipt'] ?? 'Pending', 'amount': toDouble(p['amount']), 'method': '${p['method']} · due payment', 'at': p['at']},
                          ])),
                  ]),
                ],
            ],
            empty: const Center(child: Text('No dues for this customer.', style: TextStyle(color: W.g500))),
          );
      }
      return const SizedBox();
    }

    return WebPage(
      title: '${c['name'] ?? ''}'.trim().isEmpty ? 'New customer (no name yet)' : '${c['name']}',
      subtitle: 'Customer profile, orders, addresses and due',
      back: true,
      onRefresh: () async {
        await s.syncNow(only: const ['customers', 'orders', 'dues']);
        for (final n in const ['customer_orders', 'addresses', 'dues_paid']) {
          await s.reloadPage(n);
        }
      },
      actions: [DisplayOptionsButton(_def)],
      children: [
        if (on('cp-header')) ...[header, const SizedBox(height: 16)],
        if (stats.isNotEmpty) ...[WebGrid(columns: stats.length, gap: 12, minWidth: 160, children: stats), const SizedBox(height: 16)],
        if (tabs.isNotEmpty)
          WebCard(
            padding: EdgeInsets.zero,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(children: [
                  for (final (k, l, icon) in tabs)
                    InkWell(
                      onTap: () => setState(() => _tab = k),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: tab == k ? const Color(0xFF2563EB) : Colors.transparent, width: 2))),
                        child: Row(children: [
                          Icon(icon, size: 15, color: tab == k ? const Color(0xFF2563EB) : W.g500),
                          const SizedBox(width: 8),
                          Text(l, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: tab == k ? const Color(0xFF2563EB) : W.g600)),
                        ]),
                      ),
                    ),
                ]),
              ),
              const Divider(height: 1, color: W.g100),
              Padding(padding: const EdgeInsets.all(12), child: tabBody()),
            ]),
          ),
      ],
    );
  }
}
