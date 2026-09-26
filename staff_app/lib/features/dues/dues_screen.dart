import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import 'collect_sheet.dart';

/// Every open due, grouped by customer, with the total outstanding. Tap to collect.
class DuesScreen extends StatefulWidget {
  const DuesScreen({super.key});
  @override
  State<DuesScreen> createState() => _DuesScreenState();
}

class _DuesScreenState extends State<DuesScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final dues = s.list('dues');
    final total = dues.fold<double>(0, (t, d) => t + toDouble(d['balance']));
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final d in dues) {
      groups.putIfAbsent('${d['customerId'] ?? d['customer']}', () => []).add(d);
    }
    final q = _q.trim().toLowerCase();
    final list = groups.values.where((g) => q.isEmpty || '${g.first['customer']} ${g.first['phone'] ?? ''}'.toLowerCase().contains(q)).toList()
      ..sort((a, b) => b.fold<double>(0, (t, d) => t + toDouble(d['balance'])).compareTo(a.fold<double>(0, (t, d) => t + toDouble(d['balance']))));
    final overdue = dues.where((d) => d['promised'] != null && (parseDate(d['promised'])?.isBefore(DateTime.now().toUtc()) ?? false)).length;

    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('Dues'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      body: RefreshIndicator(
        onRefresh: () => s.syncNow(only: const ['dues', 'customers']),
        child: PageBody(
          maxWidth: 1000,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            SizedBox(height: 150, child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: KpiTile(icon: Icons.account_balance_wallet_outlined, label: 'Total outstanding', value: money(total), sub: '${dues.length} bill${dues.length == 1 ? '' : 's'} · ${groups.length} customer${groups.length == 1 ? '' : 's'}', color: AppColors.red, soft: AppColors.redSoft)),
              const SizedBox(width: 10),
              Expanded(child: KpiTile(icon: Icons.event_busy_outlined, label: 'Promise date passed', value: '$overdue', sub: 'Follow up today', color: AppColors.amber, soft: AppColors.amberSoft)),
            ])),
            const SizedBox(height: 12),
            SearchBox(hint: 'Customer name or mobile', onChanged: (v) => setState(() => _q = v)),
            const SizedBox(height: 12),
            if (list.isEmpty) const EmptyState(icon: Icons.verified_outlined, title: 'No dues', message: 'Everyone has paid.'),
            for (final g in list) ...[
              AppCard(
                onTap: () => collectDues(context, g),
                child: Row(children: [
                  Avatar('${g.first['customer']}'),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${g.first['customer']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('${g.length} bill${g.length == 1 ? '' : 's'} · oldest ${ago(g.map((d) => '${d['createdAt']}').reduce((a, b) => a.compareTo(b) < 0 ? a : b))}${g.first['phone'] != null ? ' · ${g.first['phone']}' : ''}',
                          style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    ]),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(money(g.fold<double>(0, (t, d) => t + toDouble(d['balance']))), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.red, fontSize: 16)),
                    Text('Collect ›', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 12.5)),
                  ]),
                  if (g.first['phone'] != null) IconButton(icon: const Icon(Icons.call_outlined), onPressed: () => launchUrl(Uri.parse('tel:${g.first['phone']}'))),
                ]),
              ),
              const SizedBox(height: 8),
            ],
            const FreshnessNote(),
          ]),
        ),
      ),
    );
  }
}
