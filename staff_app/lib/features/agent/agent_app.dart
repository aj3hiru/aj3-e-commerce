import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../widgets/common.dart';
import '../../widgets/web.dart' show DateRange;

/// The delivery agent's phone app: a clean white look with its own five tabs
/// (Home, Orders, History, Report, Profile), made for one hand on the road.
class AgentApp extends StatefulWidget {
  const AgentApp({super.key});
  @override
  State<AgentApp> createState() => _AgentAppState();
}

/// Colours of the agent app (white base, blue actions, green for money in).
class AG {
  static const bg = Color(0xFFF6F8FB);
  static const card = Colors.white;
  static const line = Color(0xFFE8ECF2);
  static const text = Color(0xFF111827);
  static const muted = Color(0xFF6B7280);
  static const faint = Color(0xFF9CA3AF);
  static const blue = Color(0xFF1D6FF2);
  static const blueSoft = Color(0xFFEAF2FF);
  static const green = Color(0xFF16A34A);
  static const greenSoft = Color(0xFFE6F6EC);
  static const red = Color(0xFFE11D48);
  static const redSoft = Color(0xFFFDE8EC);
  static const amber = Color(0xFFF59E0B);
  static const amberSoft = Color(0xFFFFF1D6);
  static const r = BorderRadius.all(Radius.circular(14));
  static const shadow = [BoxShadow(color: Color(0x0D0F172A), blurRadius: 14, offset: Offset(0, 4))];
}

const _white = SystemUiOverlayStyle(
  statusBarColor: Colors.white,
  statusBarIconBrightness: Brightness.dark,
  statusBarBrightness: Brightness.light,
  systemNavigationBarColor: Colors.white,
  systemNavigationBarIconBrightness: Brightness.dark,
);

bool _active(Map o) => o['status'] != 'Delivered' && o['status'] != 'Canceled';
bool _isToday(dynamic iso) => DateRange.preset('today').contains(iso);

/// Money collected on a delivery, split by method (Cash / UPI / Other).
Map<String, double> _collected(Iterable<Map<String, dynamic>> orders) {
  final out = {'Cash': 0.0, 'UPI': 0.0, 'Other': 0.0};
  for (final o in orders) {
    final pays = ((o['pays'] as List?) ?? const []).cast<Map>();
    if (pays.isEmpty) {
      if (o['paymentStatus'] == 'Paid' && o['status'] == 'Delivered' && o['paymentMethod'] != null) {
        final m = '${o['paymentMethod']}';
        out[m == 'Cash' || m == 'UPI' ? m : 'Other'] = out[m == 'Cash' || m == 'UPI' ? m : 'Other']! + toDouble(o['total']);
      }
      continue;
    }
    for (final p in pays) {
      final m = '${p['method']}';
      final k = m == 'Cash' || m == 'UPI' ? m : 'Other';
      out[k] = out[k]! + toDouble(p['amount']);
    }
  }
  return out;
}

class _AgentAppState extends State<AgentApp> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      _Home(onTab: (i) => setState(() => _tab = i)),
      const _Orders(),
      const _History(),
      const _Report(),
      const _Profile(),
    ];
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: _white,
      child: Theme(
        data: Theme.of(context).copyWith(
          scaffoldBackgroundColor: AG.bg,
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: AG.blue),
          appBarTheme: const AppBarTheme(backgroundColor: Colors.white, foregroundColor: AG.text, elevation: 0, scrolledUnderElevation: 0, systemOverlayStyle: _white, centerTitle: false),
        ),
        child: Scaffold(
          backgroundColor: AG.bg,
          body: IndexedStack(index: _tab, children: pages),
          bottomNavigationBar: _BottomBar(index: _tab, onTap: (i) => setState(() => _tab = i)),
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final int index;
  final ValueChanged<int> onTap;
  const _BottomBar({required this.index, required this.onTap});
  static const _items = [
    (Icons.home_outlined, Icons.home_rounded, 'Home'),
    (Icons.inventory_2_outlined, Icons.inventory_2_rounded, 'Orders'),
    (Icons.history_rounded, Icons.history_rounded, 'History'),
    (Icons.receipt_long_outlined, Icons.receipt_long_rounded, 'Report'),
    (Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
  ];
  @override
  Widget build(BuildContext context) {
    final pending = context.select<AppState, int>((s) => s.list('deliveries').where(_active).length);
    return Container(
      decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AG.line))),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 62,
          child: Row(children: [
            for (var i = 0; i < _items.length; i++)
              Expanded(
                child: InkWell(
                  onTap: () => onTap(i),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Badge(
                      isLabelVisible: i == 1 && pending > 0,
                      label: Text('$pending'),
                      backgroundColor: AG.red,
                      child: Icon(index == i ? _items[i].$2 : _items[i].$1, size: 24, color: index == i ? AG.blue : AG.faint),
                    ),
                    const SizedBox(height: 3),
                    Text(_items[i].$3, style: TextStyle(fontSize: 11.5, fontWeight: index == i ? FontWeight.w700 : FontWeight.w500, color: index == i ? AG.blue : AG.faint)),
                  ]),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

/* ───────────────────────── shared pieces ───────────────────────── */

class _Card extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  const _Card({required this.child, this.padding = const EdgeInsets.all(14), this.onTap});
  @override
  Widget build(BuildContext context) => Material(
        color: AG.card,
        borderRadius: AG.r,
        child: InkWell(
          borderRadius: AG.r,
          onTap: onTap,
          child: Container(
            padding: padding,
            decoration: BoxDecoration(borderRadius: AG.r, border: Border.all(color: AG.line)),
            child: child,
          ),
        ),
      );
}

class _Title extends StatelessWidget {
  final String text;
  final Widget? trailing;
  final bool back;
  const _Title(this.text, {this.trailing, this.back = false});
  @override
  Widget build(BuildContext context) => Container(
        color: Colors.white,
        padding: EdgeInsets.fromLTRB(back ? 4 : 18, MediaQuery.paddingOf(context).top + 10, 10, 12),
        child: Row(children: [
          if (back) IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.pop(context)),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: AG.text))),
          ?trailing,
        ]),
      );
}

class _Person extends StatelessWidget {
  final String name;
  final double size;
  const _Person(this.name, {this.size = 40});
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(color: AG.blueSoft, shape: BoxShape.circle),
        child: Icon(Icons.person_rounded, color: AG.blue, size: size * .58),
      );
}

class _Chip extends StatelessWidget {
  final String text;
  final Color color, bg;
  final IconData? icon;
  const _Chip(this.text, this.color, this.bg, {this.icon});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 11, color: color), const SizedBox(width: 3)],
          Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
        ]),
      );
}

Widget _methodIcon(String m) {
  final (IconData i, Color c, Color bg) = switch (m) {
    'Cash' => (Icons.payments_rounded, AG.green, AG.greenSoft),
    'UPI' => (Icons.qr_code_2_rounded, AG.blue, AG.blueSoft),
    _ => (Icons.credit_card_rounded, AG.amber, AG.amberSoft),
  };
  return Container(width: 34, height: 34, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)), child: Icon(i, color: c, size: 19));
}

Future<void> _directions(Map o) async {
  final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address'] ?? ''}');
  await launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest&travelmode=two-wheeler'), mode: LaunchMode.externalApplication);
}

Future<void> _call(Map o) async {
  if (o['phone'] != null) await launchUrl(Uri.parse('tel:${o['phone']}'));
}

void _openOrder(BuildContext context, Map<String, dynamic> o) =>
    Navigator.push(context, MaterialPageRoute(builder: (_) => AnnotatedRegion(value: _white, child: _OrderDetails(orderId: toInt(o['id'])))));

/* ───────────────────────── Home ───────────────────────── */

class _Home extends StatelessWidget {
  final ValueChanged<int> onTab;
  const _Home({required this.onTab});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final all = s.list('deliveries');
    final pending = all.where(_active).length;
    final cancelled = all.where((o) => o['status'] == 'Canceled' && _isToday(o['deliveredAt'] ?? o['assignedAt'] ?? o['createdAt'])).length;
    final delivered = all.where((o) => o['status'] == 'Delivered' && _isToday(o['deliveredAt'])).length;
    final today = _collected(all.where((o) => o['status'] == 'Delivered' && _isToday(o['deliveredAt'])));
    final total = today.values.fold<double>(0, (a, b) => a + b);
    final hour = ist(DateTime.now().toUtc()).hour;
    final greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    final name = '${s.user?['name'] ?? s.user?['username'] ?? ''}';

    Widget stat(IconData icon, int n, Color c, Color bg, String label, VoidCallback onTap) => Expanded(
          child: Material(
            color: bg,
            borderRadius: AG.r,
            child: InkWell(
              borderRadius: AG.r,
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Column(children: [
                  Container(width: 30, height: 30, decoration: BoxDecoration(color: c, shape: BoxShape.circle), child: Icon(icon, color: Colors.white, size: 18)),
                  const SizedBox(height: 8),
                  Text('$n', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AG.text)),
                  Text(label, style: const TextStyle(fontSize: 11.5, color: AG.muted, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
        );

    return RefreshIndicator(
      onRefresh: () => s.syncNow(only: const ['deliveries']),
      child: ListView(padding: EdgeInsets.zero, children: [
        Container(
          color: Colors.white,
          padding: EdgeInsets.fromLTRB(18, MediaQuery.paddingOf(context).top + 12, 12, 16),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(greet, style: const TextStyle(color: AG.muted, fontSize: 13)),
                Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AG.text)),
                const SizedBox(height: 2),
                Row(children: [
                  Container(width: 7, height: 7, decoration: BoxDecoration(color: s.online ? AG.green : AG.faint, shape: BoxShape.circle)),
                  const SizedBox(width: 5),
                  Text(s.online ? 'Online' : 'Offline', style: TextStyle(fontSize: 12, color: s.online ? AG.green : AG.faint, fontWeight: FontWeight.w600)),
                ]),
              ]),
            ),
            IconButton(
              tooltip: 'Orders to deliver',
              onPressed: () => onTab(1),
              icon: Badge(isLabelVisible: pending > 0, backgroundColor: AG.red, smallSize: 9, child: const Icon(Icons.notifications_none_rounded, size: 26, color: AG.text)),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              stat(Icons.schedule_rounded, pending, AG.amber, AG.amberSoft, 'To deliver', () => onTab(1)),
              const SizedBox(width: 10),
              stat(Icons.close_rounded, cancelled, AG.red, AG.redSoft, 'Cancelled today', () => onTab(2)),
              const SizedBox(width: 10),
              stat(Icons.check_rounded, delivered, AG.green, AG.greenSoft, 'Delivered today', () => onTab(2)),
            ]),
            const SizedBox(height: 16),
            _Card(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              onTap: () => onTab(3),
              child: Column(children: [
                const Row(children: [
                  Icon(Icons.account_balance_wallet_outlined, size: 20, color: AG.text),
                  SizedBox(width: 10),
                  Expanded(child: Text('Collected today', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                  Icon(Icons.chevron_right_rounded, color: AG.faint),
                ]),
                const Divider(height: 18, color: AG.line),
                for (final m in const ['Cash', 'UPI', 'Other'])
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(children: [
                      _methodIcon(m),
                      const SizedBox(width: 12),
                      Expanded(child: Text(m, style: const TextStyle(fontSize: 14.5))),
                      Text(money(today[m]), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                const Divider(height: 18, color: AG.line),
                Row(children: [
                  const Expanded(child: Text('Total Collected', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                  Text(money(total), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: AG.green)),
                ]),
              ]),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AG.blueSoft, borderRadius: AG.r),
              child: const Row(children: [
                Icon(Icons.support_agent_rounded, color: AG.blue, size: 28),
                SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Keep delivering and earn more!', style: TextStyle(color: AG.blue, fontWeight: FontWeight.w700)),
                    Text('Your hard work matters.', style: TextStyle(color: AG.muted, fontSize: 12)),
                  ]),
                ),
              ]),
            ),
          ]),
        ),
      ]),
    );
  }
}

/* ───────────────────────── Orders (to deliver) ───────────────────────── */

class _Orders extends StatefulWidget {
  const _Orders();
  @override
  State<_Orders> createState() => _OrdersState();
}

class _OrdersState extends State<_Orders> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final q = _q.trim().toLowerCase();
    final list = s.list('deliveries').where(_active).where((o) => q.isEmpty || '${o['customer']} ${o['number']} ${o['address']}'.toLowerCase().contains(q)).toList()
      ..sort((a, b) => (a['status'] == 'Out for Delivery' ? 0 : 1).compareTo(b['status'] == 'Out for Delivery' ? 0 : 1));
    return Column(children: [
      const _Title('Orders'),
      Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: TextField(
          onChanged: (v) => setState(() => _q = v),
          decoration: InputDecoration(
            hintText: 'Search by customer name or order ID',
            prefixIcon: const Icon(Icons.search_rounded, color: AG.faint),
            filled: true,
            fillColor: AG.bg,
            contentPadding: const EdgeInsets.symmetric(vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () => s.syncNow(only: const ['deliveries']),
          child: list.isEmpty
              ? ListView(children: const [SizedBox(height: 80), EmptyState(icon: Icons.celebration_outlined, title: 'No deliveries right now', message: 'New orders assigned to you will appear here.')])
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (c, i) {
                    final o = list[i];
                    return _Card(
                      onTap: () => _openOrder(context, o),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        _Person('${o['customer']}'),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Flexible(child: Text('${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                              if (o['status'] == 'Out for Delivery') ...[const SizedBox(width: 6), const _Chip('On the way', AG.blue, AG.blueSoft)],
                            ]),
                            const SizedBox(height: 2),
                            Text('${o['address'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AG.muted, fontSize: 12.5)),
                            const SizedBox(height: 6),
                            Row(children: [
                              Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                              const SizedBox(width: 8),
                              o['paymentStatus'] == 'Paid' ? const _Chip('Paid', AG.green, AG.greenSoft) : const _Chip('Collect', AG.amber, AG.amberSoft),
                            ]),
                          ]),
                        ),
                        InkWell(
                          onTap: () => _directions(o),
                          borderRadius: BorderRadius.circular(8),
                          child: const Padding(
                            padding: EdgeInsets.all(4),
                            child: Column(children: [
                              Icon(Icons.location_on_rounded, color: AG.blue, size: 26),
                              Text('Get Direction', style: TextStyle(color: AG.blue, fontSize: 10.5, fontWeight: FontWeight.w600)),
                            ]),
                          ),
                        ),
                      ]),
                    );
                  },
                ),
        ),
      ),
    ]);
  }
}

/* ───────────────────────── Order details ───────────────────────── */

class _OrderDetails extends StatelessWidget {
  final int orderId;
  const _OrderDetails({required this.orderId});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final o = s.list('deliveries').where((x) => toInt(x['id']) == orderId).firstOrNull;
    if (o == null) return const Scaffold(body: Center(child: Text('This order is no longer assigned to you.')));
    final products = {for (final p in s.list('products')) toInt(p['id']): p};
    final items = ((o['items'] as List?) ?? const []).cast<Map>();
    final open = _active(o);
    final paid = o['paymentStatus'] == 'Paid';

    return Scaffold(
      backgroundColor: AG.bg,
      body: Column(children: [
        const _Title('Order Details', back: true),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            _Card(
              child: Column(children: [
                Row(children: [
                  _Person('${o['customer']}', size: 46),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      if (o['phone'] != null) Text('${o['phone']}', style: const TextStyle(color: AG.muted)),
                      Text('${o['number']}', style: const TextStyle(color: AG.faint, fontSize: 12)),
                    ]),
                  ),
                  if (o['phone'] != null) IconButton.filled(style: IconButton.styleFrom(backgroundColor: AG.blueSoft), onPressed: () => _call(o), icon: const Icon(Icons.call_rounded, color: AG.blue)),
                ]),
                const Divider(height: 22, color: AG.line),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.location_on_outlined, color: AG.muted, size: 20),
                  const SizedBox(width: 10),
                  Expanded(child: Text('${o['address'] ?? 'No address'}', style: const TextStyle(fontSize: 13.5, height: 1.35))),
                ]),
              ]),
            ),
            const SizedBox(height: 12),
            _Card(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Items (${items.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 8),
                for (final it in items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(children: [
                      NetImage(products[toInt(it['productId'])]?['image'], size: 44, radius: 8),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${it['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text('Qty: ${it['qty']}', style: const TextStyle(color: AG.muted, fontSize: 12)),
                        ]),
                      ),
                      Text(money(toDouble(it['price']) * toInt(it['qty'])), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
                  ),
              ]),
            ),
            const SizedBox(height: 12),
            _Card(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Payment', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 10),
                Row(children: [
                  paid ? const _Chip('Paid', AG.green, AG.greenSoft, icon: Icons.check_rounded) : const _Chip('To collect', AG.amber, AG.amberSoft),
                  const SizedBox(width: 8),
                  Text('${o['paymentMethod'] ?? ''}', style: const TextStyle(color: AG.muted)),
                ]),
                const Divider(height: 22, color: AG.line),
                Row(children: [
                  const Expanded(child: Text('Total Amount', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                  Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19)),
                ]),
              ]),
            ),
          ]),
        ),
        if (open)
          Container(
            color: Colors.white,
            padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.paddingOf(context).bottom),
            child: Column(children: [
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: AG.blue, side: const BorderSide(color: AG.blue), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    onPressed: () => _directions(o),
                    icon: const Icon(Icons.near_me_rounded),
                    label: const Text('Get Direction', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), backgroundColor: AG.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AnnotatedRegion(value: _white, child: _MarkDelivered(orderId: orderId)))),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Deliver', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ]),
              TextButton(onPressed: () => _notDelivered(context, o), child: const Text("Couldn't deliver", style: TextStyle(color: AG.red))),
            ]),
          ),
      ]),
    );
  }

  Future<void> _notDelivered(BuildContext context, Map<String, dynamic> o) async {
    final s = context.read<AppState>();
    final note = TextEditingController();
    String reason = 'Customer not answering';
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: EdgeInsets.fromLTRB(18, 16, 18, 18 + MediaQuery.viewInsetsOf(c).bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text("Couldn't deliver", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final r in const ['Customer not answering', 'Customer not at home', 'Wrong address', 'Customer refused', 'Other'])
                ChoiceChip(label: Text(r), selected: reason == r, onSelected: (_) => set(() => reason = r)),
            ]),
            const SizedBox(height: 10),
            TextField(controller: note, decoration: const InputDecoration(hintText: 'Add a note (optional)', border: OutlineInputBorder())),
            const SizedBox(height: 14),
            FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)), onPressed: () => Navigator.pop(c, 'fail'), child: const Text('Try again later')),
            const SizedBox(height: 6),
            TextButton(onPressed: () => Navigator.pop(c, 'cancel'), child: const Text('Cancel the order', style: TextStyle(color: AG.red))),
          ]),
        ),
      ),
    );
    if (action == null || !context.mounted) return;
    final text = [reason, note.text.trim()].where((x) => x.isNotEmpty).join(' — ');
    final r = await s.sendNow(
      OutboxItem(
        id: newId(), method: 'POST', path: '/api/ecommerce/deliveries/${o['id']}', label: '${o['number']}: ${action == 'fail' ? 'not delivered' : 'cancelled'}',
        body: {'action': action, 'note': text}, refresh: const ['deliveries'],
        effect: action == 'cancel' ? {'kind': 'order', 'id': o['id'], 'fields': {'status': 'Canceled', 'cancelReason': text}} : null,
      ),
    );
    if (!context.mounted) return;
    toast(context, r.ok ? (action == 'fail' ? 'Noted — the order desk will follow up.' : 'Order cancelled.') : (r.outcome == ApiOutcome.offline ? 'Saved — it will be sent when you are online.' : r.message), error: !r.ok && r.outcome != ApiOutcome.offline);
    if (r.ok || r.outcome == ApiOutcome.offline) Navigator.pop(context);
  }
}

/* ───────────────────────── Mark as delivered ───────────────────────── */

class _MarkDelivered extends StatefulWidget {
  final int orderId;
  const _MarkDelivered({required this.orderId});
  @override
  State<_MarkDelivered> createState() => _MarkDeliveredState();
}

class _MarkDeliveredState extends State<_MarkDelivered> {
  final _amt = {for (final m in const ['UPI', 'Cash', 'Other']) m: TextEditingController()};
  final _on = {'UPI': false, 'Cash': true, 'Other': false};
  final _note = TextEditingController();
  bool _busy = false;
  bool _filled = false;

  double get _sum => _on.entries.where((e) => e.value).fold(0.0, (t, e) => t + (double.tryParse(_amt[e.key]!.text.trim()) ?? 0));

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final o = s.list('deliveries').where((x) => toInt(x['id']) == widget.orderId).firstOrNull;
    if (o == null) return const Scaffold(body: Center(child: Text('This order is no longer assigned to you.')));
    final total = toDouble(o['total']);
    final paid = o['paymentStatus'] == 'Paid';
    if (!_filled) {
      _filled = true;
      _amt['Cash']!.text = total.toStringAsFixed(total == total.roundToDouble() ? 0 : 2);
    }
    final diff = total - _sum;

    return Scaffold(
      backgroundColor: AG.bg,
      body: Column(children: [
        const _Title('Mark as Delivered', back: true),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            _Card(
              child: Row(children: [
                _Person('${o['customer']}', size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${o['customer']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    Text('#${o['number']}', style: const TextStyle(color: AG.muted, fontSize: 12)),
                    Text('${o['address'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AG.muted, fontSize: 12)),
                  ]),
                ),
                Text(money(total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ]),
            ),
            const SizedBox(height: 12),
            _Card(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Payment Collection', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 6),
                if (paid)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: _Chip('Already paid online — nothing to collect', AG.green, AG.greenSoft, icon: Icons.check_rounded))
                else ...[
                  for (final m in const ['UPI', 'Cash', 'Other'])
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(children: [
                        _methodIcon(m),
                        const SizedBox(width: 12),
                        Expanded(child: Text(m, style: const TextStyle(fontSize: 15))),
                        SizedBox(
                          width: 110,
                          child: TextField(
                            controller: _amt[m],
                            enabled: _on[m],
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            onChanged: (_) => setState(() {}),
                            decoration: InputDecoration(isDense: true, prefixText: '₹ ', hintText: '0', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10))),
                          ),
                        ),
                        Checkbox(
                          value: _on[m],
                          activeColor: AG.blue,
                          onChanged: (v) => setState(() {
                            _on[m] = v ?? false;
                            // Ticking a second method fills in what's left.
                            if (_on[m]! && (double.tryParse(_amt[m]!.text) ?? 0) == 0) {
                              final left = total - _on.entries.where((e) => e.value && e.key != m).fold(0.0, (t, e) => t + (double.tryParse(_amt[e.key]!.text) ?? 0));
                              if (left > 0) _amt[m]!.text = left.toStringAsFixed(left == left.roundToDouble() ? 0 : 2);
                            }
                          }),
                        ),
                      ]),
                    ),
                  const Divider(height: 20, color: AG.line),
                  Row(children: [
                    const Expanded(child: Text('Total Collected', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                    Text(money(_sum), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: diff.abs() < 0.5 ? AG.green : AG.red)),
                  ]),
                  if (diff.abs() >= 0.5)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(diff > 0 ? '${money(diff)} more to collect' : '${money(-diff)} more than the order total', style: const TextStyle(color: AG.red, fontSize: 12.5)),
                    ),
                ],
              ]),
            ),
            const SizedBox(height: 12),
            const Text('Add Note (Optional)', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            TextField(
              controller: _note,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'e.g. Received in cash, customer at home',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AG.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AG.line)),
              ),
            ),
          ]),
        ),
        Container(
          color: Colors.white,
          padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.paddingOf(context).bottom),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AG.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            onPressed: _busy || (!paid && diff.abs() >= 0.5) ? null : () => _submit(o, paid),
            icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : const Icon(Icons.check_rounded),
            label: const Text('Mark as Delivered', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
        ),
      ]),
    );
  }

  Future<void> _submit(Map<String, dynamic> o, bool paid) async {
    final s = context.read<AppState>();
    setState(() => _busy = true);
    final pays = paid ? <Map<String, dynamic>>[] : [for (final e in _on.entries) if (e.value && (double.tryParse(_amt[e.key]!.text.trim()) ?? 0) > 0) {'method': e.key, 'amount': double.parse(_amt[e.key]!.text.trim())}];
    final now = DateTime.now().toUtc().toIso8601String();
    final r = await s.sendNow(OutboxItem(
      id: newId(), method: 'POST', path: '/api/ecommerce/deliveries/${o['id']}', label: '${o['number']}: delivered',
      body: {'action': 'complete', 'payments': pays, 'note': _note.text.trim()}, refresh: const ['deliveries'],
      effect: {'kind': 'order', 'id': o['id'], 'fields': {'status': 'Delivered', 'paymentStatus': 'Paid', 'deliveredAt': now, if (!paid) 'pays': [for (final p in pays) {...p, 'at': now}]}},
    ));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r.ok || r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy) {
      toast(context, r.ok ? 'Delivered. Great job!' : 'Saved — it will be sent when you are online.');
      Navigator.of(context)
        ..pop()
        ..pop();
    } else {
      toast(context, r.message, error: true);
    }
  }
}

/* ───────────────────────── History ───────────────────────── */

class _History extends StatefulWidget {
  const _History();
  @override
  State<_History> createState() => _HistoryState();
}

class _HistoryState extends State<_History> {
  String _f = 'all';
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final done = s.list('deliveries').where((o) => !_active(o)).toList()..sort((a, b) => '${b['deliveredAt'] ?? b['createdAt']}'.compareTo('${a['deliveredAt'] ?? a['createdAt']}'));
    final list = done.where((o) => _f == 'all' || (_f == 'delivered' ? o['status'] == 'Delivered' : o['status'] == 'Canceled')).toList();
    Widget tab(String k, String label) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            label: Text(label),
            selected: _f == k,
            showCheckmark: false,
            selectedColor: AG.blue,
            backgroundColor: AG.bg,
            side: BorderSide.none,
            labelStyle: TextStyle(color: _f == k ? Colors.white : AG.muted, fontWeight: FontWeight.w600),
            onSelected: (_) => setState(() => _f = k),
          ),
        );
    return Column(children: [
      const _Title('History'),
      Container(color: Colors.white, padding: const EdgeInsets.fromLTRB(16, 0, 16, 10), child: Row(children: [tab('all', 'All'), tab('delivered', 'Delivered'), tab('cancelled', 'Cancelled')])),
      Expanded(
        child: list.isEmpty
            ? const EmptyState(icon: Icons.history_rounded, title: 'Nothing here yet', message: 'Delivered and cancelled orders from the last 14 days show here.')
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (c, i) {
                  final o = list[i];
                  final ok = o['status'] == 'Delivered';
                  final at = o['deliveredAt'] ?? o['assignedAt'] ?? o['createdAt'];
                  return _Card(
                    onTap: () => _openOrder(context, o),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded, color: ok ? AG.green : AG.red, size: 26),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Flexible(child: Text('${o['customer']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
                            const SizedBox(width: 6),
                            ok ? const _Chip('Delivered', AG.green, AG.greenSoft, icon: Icons.check_rounded) : const _Chip('Cancelled', AG.red, AG.redSoft, icon: Icons.close_rounded),
                          ]),
                          Text('${o['address'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AG.muted, fontSize: 12.5)),
                          Text('${timeOnly(at)} • ${dateShort(at)}', style: const TextStyle(color: AG.faint, fontSize: 12)),
                        ]),
                      ),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(money(o['total']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        const Icon(Icons.chevron_right_rounded, color: AG.faint),
                      ]),
                    ]),
                  );
                },
              ),
      ),
    ]);
  }
}

/* ───────────────────────── Report ───────────────────────── */

class _Report extends StatefulWidget {
  const _Report();
  @override
  State<_Report> createState() => _ReportState();
}

class _ReportState extends State<_Report> {
  DateRange _range = DateRange.preset('today');

  DateRange _preset(String k) {
    if (k != 'week') return DateRange.preset(k);
    final t = DateRange.preset('today').to;
    return DateRange('week', t.subtract(Duration(days: t.weekday - 1)), t);
  }

  Future<void> _pick() async {
    final now = DateRange.preset('today').to;
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: now,
      initialDateRange: DateTimeRange(start: _range.from, end: _range.to),
      helpText: 'Select Date Range',
      saveText: 'Apply',
      builder: (c, child) => Theme(data: Theme.of(c).copyWith(colorScheme: Theme.of(c).colorScheme.copyWith(primary: AG.blue)), child: child!),
    );
    if (r != null) setState(() => _range = DateRange('custom', DateTime(r.start.year, r.start.month, r.start.day), DateTime(r.end.year, r.end.month, r.end.day)));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final inRange = s.list('deliveries').where((o) => _range.contains(o['deliveredAt'] ?? o['assignedAt'] ?? o['createdAt'])).toList();
    final delivered = inRange.where((o) => o['status'] == 'Delivered').toList();
    final cancelled = inRange.where((o) => o['status'] == 'Canceled').length;
    final col = _collected(delivered);
    final total = col.values.fold<double>(0, (a, b) => a + b);
    String d(DateTime x) => DateFormat('d MMM yyyy').format(x);

    Widget preset(String k, String label) => Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: ChoiceChip(
              label: SizedBox(width: double.infinity, child: Text(label, textAlign: TextAlign.center)),
              selected: _range.key == k,
              showCheckmark: false,
              selectedColor: AG.blue,
              backgroundColor: AG.bg,
              side: BorderSide.none,
              labelPadding: EdgeInsets.zero,
              labelStyle: TextStyle(color: _range.key == k ? Colors.white : AG.muted, fontWeight: FontWeight.w600, fontSize: 12),
              onSelected: (_) => setState(() => _range = _preset(k)),
            ),
          ),
        );
    Widget box(String label, String v, Color c, Color bg) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: bg, borderRadius: AG.r, border: Border.all(color: bg == Colors.white ? AG.line : bg)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(fontSize: 12, color: c == AG.text ? AG.muted : c, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(v, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c)),
            ]),
          ),
        );

    return Column(children: [
      const _Title('Report'),
      Container(color: Colors.white, padding: const EdgeInsets.fromLTRB(13, 0, 13, 10), child: Row(children: [preset('today', 'Today'), preset('yesterday', 'Yesterday'), preset('week', 'This Week'), preset('this_month', 'This Month')])),
      Expanded(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          _Card(
            onTap: _pick,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              const Icon(Icons.calendar_month_outlined, size: 20, color: AG.muted),
              const SizedBox(width: 10),
              Expanded(child: Text('${d(_range.from)}  –  ${d(_range.to)}', style: const TextStyle(fontWeight: FontWeight.w600))),
              const Icon(Icons.edit_calendar_outlined, size: 20, color: AG.blue),
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            box('Total Orders', '${inRange.length}', AG.text, Colors.white),
            const SizedBox(width: 10),
            box('Delivered', '${delivered.length}', AG.green, AG.greenSoft),
            const SizedBox(width: 10),
            box('Cancelled', '$cancelled', AG.red, AG.redSoft),
          ]),
          const SizedBox(height: 12),
          _Card(
            child: Row(children: [
              const Expanded(child: Text('Total Collection', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
              Text(money(total), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AG.green)),
            ]),
          ),
          const SizedBox(height: 12),
          _Card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Payment Summary', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 8),
              for (final m in const ['Cash', 'UPI', 'Other'])
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(children: [
                    _methodIcon(m),
                    const SizedBox(width: 12),
                    Expanded(child: Text(m)),
                    Text(money(col[m]), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ]),
                ),
            ]),
          ),
          const SizedBox(height: 10),
          const Text('Covers the last 14 days kept on this phone.', textAlign: TextAlign.center, style: TextStyle(color: AG.faint, fontSize: 11.5)),
        ]),
      ),
    ]);
  }
}

/* ───────────────────────── Profile ───────────────────────── */

class _Profile extends StatelessWidget {
  const _Profile();

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final u = s.user ?? const {};
    final name = '${u['name'] ?? u['username'] ?? ''}';
    final parts = name.split(' ');
    Widget row(String k, String v, IconData icon, {VoidCallback? onTap}) => InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            child: Row(children: [
              SizedBox(width: 110, child: Text(k, style: const TextStyle(color: AG.muted))),
              Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600))),
              Icon(icon, size: 17, color: onTap == null ? AG.faint : AG.blue),
            ]),
          ),
        );
    return ListView(padding: EdgeInsets.zero, children: [
      _Title('Profile', trailing: IconButton(tooltip: 'Log out', icon: const Icon(Icons.logout_rounded, color: AG.red), onPressed: () => _logout(context))),
      Container(
        color: Colors.white,
        padding: const EdgeInsets.only(bottom: 18),
        child: Column(children: [
          Avatar(name, photo: u['avatar'], size: 92),
          const SizedBox(height: 10),
          Text(name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          Text('${u['roleLabel'] ?? 'Delivery Agent'}', style: const TextStyle(color: AG.muted)),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Personal Information', style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          _Card(
            padding: EdgeInsets.zero,
            child: Column(children: [
              row('First Name', parts.first, Icons.edit_outlined, onTap: () => _editName(context)),
              const Divider(height: 1, color: AG.line),
              row('Last Name', parts.length > 1 ? parts.sublist(1).join(' ') : '—', Icons.edit_outlined, onTap: () => _editName(context)),
              const Divider(height: 1, color: AG.line),
              row('Mobile Number', '${u['phone'] ?? '—'}', Icons.lock_outline_rounded),
              const Divider(height: 1, color: AG.line),
              row('Username', '${u['username'] ?? ''}', Icons.lock_outline_rounded),
            ]),
          ),
          const SizedBox(height: 14),
          _Card(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AnnotatedRegion(value: _white, child: _ChangePassword()))),
            child: const Row(children: [
              Icon(Icons.lock_outline_rounded, color: AG.text),
              SizedBox(width: 12),
              Expanded(child: Text('Change Password', style: TextStyle(fontWeight: FontWeight.w700))),
              Icon(Icons.chevron_right_rounded, color: AG.faint),
            ]),
          ),
          const SizedBox(height: 14),
          Text('App ${s.appVersion}${s.pending > 0 ? '  ·  ${s.pending} waiting to send' : ''}', textAlign: TextAlign.center, style: const TextStyle(color: AG.faint, fontSize: 12)),
        ]),
      ),
    ]);
  }

  Future<void> _logout(BuildContext context) async {
    final ok = await confirm(context, 'Log out?', 'You will need your password to sign in again.');
    if (ok && context.mounted) await context.read<AppState>().logout();
  }

  Future<void> _editName(BuildContext context) async {
    final s = context.read<AppState>();
    final u = s.user ?? const {};
    final parts = '${u['name'] ?? ''}'.split(' ');
    final first = TextEditingController(text: parts.first), last = TextEditingController(text: parts.length > 1 ? parts.sublist(1).join(' ') : '');
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      builder: (c) => Padding(
        padding: EdgeInsets.fromLTRB(18, 16, 18, 18 + MediaQuery.viewInsetsOf(c).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Your name', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          TextField(controller: first, autofocus: true, decoration: const InputDecoration(labelText: 'First name', border: OutlineInputBorder())),
          const SizedBox(height: 10),
          TextField(controller: last, decoration: const InputDecoration(labelText: 'Last name', border: OutlineInputBorder())),
          const SizedBox(height: 14),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46), backgroundColor: AG.blue), onPressed: () => Navigator.pop(c, true), child: const Text('Save')),
        ]),
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/users/me', label: 'Update my name', body: {
      'username': u['username'], 'email': u['email'], 'firstName': first.text.trim(), 'lastName': last.text.trim(), 'phone': u['phone'] ?? '',
    }), queueIfOffline: false);
    if (!context.mounted) return;
    if (r.ok) {
      await s.refreshMe();
      if (context.mounted) toast(context, 'Saved.');
    } else {
      toast(context, r.message, error: true);
    }
  }
}

class _ChangePassword extends StatefulWidget {
  const _ChangePassword();
  @override
  State<_ChangePassword> createState() => _ChangePasswordState();
}

class _ChangePasswordState extends State<_ChangePassword> {
  final _cur = TextEditingController(), _next = TextEditingController(), _again = TextEditingController();
  final _show = [false, false, false];
  bool _busy = false;

  Widget _field(String label, String hint, TextEditingController c, int i) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        TextField(
          controller: c,
          obscureText: !_show[i],
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: Colors.white,
            suffixIcon: IconButton(icon: Icon(_show[i] ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AG.faint), onPressed: () => setState(() => _show[i] = !_show[i])),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AG.line)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AG.line)),
          ),
        ),
        const SizedBox(height: 16),
      ]);

  Future<void> _save() async {
    if (_next.text.length < 8 || !RegExp(r'[A-Za-z]').hasMatch(_next.text) || !RegExp(r'\d').hasMatch(_next.text)) {
      return toast(context, 'Use at least 8 characters with letters and numbers.', error: true);
    }
    if (_next.text != _again.text) return toast(context, 'The new passwords do not match.', error: true);
    final s = context.read<AppState>();
    setState(() => _busy = true);
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/users/me', label: 'Change password', body: {
      'username': s.user?['username'], 'email': s.user?['email'], 'currentPassword': _cur.text, 'password': _next.text, 'confirmPassword': _again.text,
    }), queueIfOffline: false);
    if (!mounted) return;
    setState(() => _busy = false);
    if (r.ok) {
      toast(context, 'Password changed. Please log in again.');
      await s.logout();
    } else {
      toast(context, r.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AG.bg,
        body: Column(children: [
          const _Title('Change Password', back: true),
          Expanded(
            child: ListView(padding: const EdgeInsets.all(16), children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AG.blueSoft, borderRadius: AG.r),
                child: const Row(children: [
                  Icon(Icons.lock_rounded, color: AG.blue, size: 28),
                  SizedBox(width: 12),
                  Expanded(child: Text('Use a strong password with at least 8 characters, including letters and numbers.', style: TextStyle(color: AG.blue, height: 1.35))),
                ]),
              ),
              const SizedBox(height: 18),
              _field('Current Password', 'Enter current password', _cur, 0),
              _field('New Password', 'Enter new password', _next, 1),
              _field('Confirm New Password', 'Confirm new password', _again, 2),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), backgroundColor: AG.blue, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Updating…' : 'Update Password', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ),
            ]),
          ),
        ]),
      );
}
