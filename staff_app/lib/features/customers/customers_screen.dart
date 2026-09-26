import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../dues/collect_sheet.dart';
import '../orders/orders_screen.dart';

/// Customers: search, who owes money, profile with dues and orders.
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});
  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  String _q = '';
  bool _withDue = false;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final q = _q.trim().toLowerCase();
    final list = s.list('customers').where((c) => (!_withDue || toDouble(c['due']) > 0) && (q.isEmpty || '${c['name']} ${c['phone'] ?? ''} ${c['email'] ?? ''}'.toLowerCase().contains(q))).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Customers'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      floatingActionButton: s.perms.customers ? FloatingActionButton.extended(onPressed: () => editCustomer(context, null), icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Add customer')) : null,
      body: PageBody(
        maxWidth: 1000,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            child: Row(children: [
              Expanded(child: SearchBox(hint: 'Name, mobile or email', onChanged: (v) => setState(() => _q = v))),
              const SizedBox(width: 10),
              FilterChip(label: const Text('Has due'), selected: _withDue, onSelected: (v) => setState(() => _withDue = v)),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => s.syncNow(only: const ['customers', 'dues']),
              child: list.isEmpty
                  ? ListView(children: const [SizedBox(height: 60), EmptyState(icon: Icons.people_alt_outlined, title: 'No customers found')])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 90),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (c, i) {
                        final x = list[i];
                        return AppCard(
                          padding: const EdgeInsets.all(12),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerProfile(id: toInt(x['id'])))),
                          child: Row(children: [
                            Avatar('${x['name']}', photo: x['avatar']),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${x['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text([x['phone'], if (isWide(context)) x['email'], x['type'] == 'offline' ? 'Store' : 'Online', if (isWide(context) && x['since'] != null) 'since ${dateShort(x['since'])}'].whereType<String>().join(' · '), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                              ]),
                            ),
                            if (toDouble(x['due']) > 0) StatusChip('Due ${moneyShort(x['due'])}'),
                            if (x['status'] != 'active') const Padding(padding: EdgeInsets.only(left: 6), child: StatusChip('Inactive')),
                          ]),
                        );
                      },
                    ),
            ),
          ),
        ]),
      ),
    );
  }
}

class CustomerProfile extends StatelessWidget {
  final int id;
  const CustomerProfile({super.key, required this.id});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final c = s.list('customers').where((x) => toInt(x['id']) == id).firstOrNull;
    if (c == null) return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.person_off_outlined, title: 'Customer not found'));
    final dues = s.list('dues').where((d) => toInt(d['customerId']) == id).toList();
    final orders = s.list('orders').where((o) => toInt(o['customerId']) == id).toList();
    final spent = orders.where((o) => o['status'] != 'Canceled').fold<double>(0, (t, o) => t + toDouble(o['total']));
    final phone = c['phone'] as String?;
    return Scaffold(
      appBar: AppBar(title: Text('${c['name']}'), actions: [if (s.perms.customers) IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () => editCustomer(context, c))]),
      body: PageBody(
        maxWidth: 1000,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          AppCard(
            child: Row(children: [
              Avatar('${c['name']}', photo: c['avatar'], size: 60),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${c['name']}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
                  Text([phone, c['email']].whereType<String>().join(' · '), style: const TextStyle(color: AppColors.muted)),
                  if (c['address'] != null) Text('${c['address']}', style: const TextStyle(fontSize: 13)),
                  Text('Customer since ${dateShort(c['since'])}', style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (phone != null) OutlinedButton.icon(icon: const Icon(Icons.call_outlined, size: 18), label: const Text('Call'), onPressed: () => launchUrl(Uri.parse('tel:$phone'))),
            if (phone != null) OutlinedButton.icon(icon: const Icon(Icons.chat_outlined, size: 18), label: const Text('WhatsApp'), onPressed: () => launchUrl(Uri.parse('https://wa.me/91${phone.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '')}'), mode: LaunchMode.externalApplication)),
            if (dues.isNotEmpty && (s.perms.credits || s.perms.billing || s.perms.customers))
              FilledButton.icon(icon: const Icon(Icons.savings_outlined, size: 18), label: Text('Collect ${money(c['due'])}'), onPressed: () => collectDues(context, dues)),
          ]),
          const SizedBox(height: 12),
          SizedBox(height: 150, child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: KpiTile(icon: Icons.shopping_bag_outlined, label: 'Orders (60 days)', value: '${orders.length}', sub: money(spent))),
            const SizedBox(width: 10),
            Expanded(child: KpiTile(icon: Icons.account_balance_wallet_outlined, label: 'Due', value: money(c['due']), color: AppColors.red, soft: AppColors.redSoft)),
          ])),
          if (dues.isNotEmpty) ...[
            const SizedBox(height: 16),
            const SectionTitle('Open dues', icon: Icons.receipt_outlined),
            for (final d in dues)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AppCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${d['orderNumber']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text('${dateShort(d['createdAt'])}${d['promised'] != null ? ' · promised ${dateShort(d['promised'])}' : ''}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ]),
                    ),
                    Text(money(d['balance']), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.red)),
                  ]),
                ),
              ),
          ],
          const SizedBox(height: 16),
          SectionTitle('Recent orders (${orders.length})', icon: Icons.receipt_long_outlined),
          if (orders.isEmpty) const Text('No orders in the last 60 days.', style: TextStyle(color: AppColors.muted)),
          for (final o in orders) Padding(padding: const EdgeInsets.only(bottom: 8), child: OrderCard(order: o)),
        ]),
      ),
    );
  }
}

/// Add (c == null) or edit a customer.
Future<void> editCustomer(BuildContext context, Map<String, dynamic>? c) async {
  final s = context.read<AppState>();
  final name = TextEditingController(text: c?['name'] ?? '');
  final phone = TextEditingController(text: c?['phone'] ?? '');
  final email = TextEditingController(text: c?['email'] ?? '');
  final address = TextEditingController(text: c?['address'] ?? '');
  var type = (c?['type'] as String?) ?? 'offline';
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => StatefulBuilder(
      builder: (d, set) => AlertDialog(
        title: Text(c == null ? 'Add customer' : 'Edit customer'),
        content: SizedBox(
          width: 440,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name *')),
              const SizedBox(height: 10),
              TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile')),
              const SizedBox(height: 10),
              TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
              const SizedBox(height: 10),
              TextField(controller: address, maxLines: 2, decoration: const InputDecoration(labelText: 'Address')),
              const SizedBox(height: 10),
              SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'offline', label: Text('Store customer')), ButtonSegment(value: 'online', label: Text('Online'))],
                selected: {type},
                onSelectionChanged: (v) => set(() => type = v.first),
              ),
            ]),
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Save'))],
      ),
    ),
  );
  if (ok != true || !context.mounted) return;
  final body = {'name': name.text.trim(), 'phone': phone.text.trim(), 'email': email.text.trim(), 'address': address.text.trim(), 'customerType': type};
  final r = await s.sendNow(OutboxItem(
    id: newId(), method: c == null ? 'POST' : 'PUT', path: c == null ? '/api/ecommerce/customers2' : '/api/ecommerce/customers2/${c['id']}', body: body,
    label: '${c == null ? 'New' : 'Edit'} customer: ${body['name']}', refresh: const ['customers'],
    effect: c == null ? null : {'kind': 'customer', 'id': c['id'], 'fields': {...body, 'type': type}},
  ));
  if (!context.mounted) return;
  if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) {
    toast(context, r.message, error: true);
  } else {
    toast(context, r.ok ? 'Saved.' : 'Saved offline — will sync when online.');
  }
}
