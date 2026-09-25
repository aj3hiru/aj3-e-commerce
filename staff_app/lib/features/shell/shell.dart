import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/config.dart';
import '../../core/perms.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../account/account_screen.dart';
import '../account/sync_center.dart';
import '../account/update.dart';
import '../customers/customers_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../deliveries/my_deliveries_screen.dart';
import '../dues/dues_screen.dart';
import '../login/login_screen.dart';
import '../orders/orders_screen.dart';
import '../pos/pos_screen.dart';
import '../products/products_screen.dart';
import '../reports/reports_screen.dart';
import '../staff/staff_screen.dart';

class Section {
  final String id;
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final Widget Function() page;
  const Section(this.id, this.label, this.icon, this.activeIcon, this.page);
}

/// The sections this person may use — built from their role's permissions.
List<Section> sectionsFor(Perms p) => [
      Section('home', 'Home', Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, () => const DashboardScreen()),
      if (p.seesPos) Section('pos', 'Billing', Icons.point_of_sale_outlined, Icons.point_of_sale_rounded, () => const PosScreen()),
      if (p.seesOrders) Section('orders', 'Orders', Icons.receipt_long_outlined, Icons.receipt_long_rounded, () => const OrdersScreen()),
      if (p.seesMyDeliveries) Section('deliveries', 'Deliveries', Icons.two_wheeler_outlined, Icons.two_wheeler_rounded, () => const MyDeliveriesScreen()),
      if (p.seesProducts) Section('products', 'Products', Icons.inventory_2_outlined, Icons.inventory_2_rounded, () => const ProductsScreen()),
      if (p.seesCustomers) Section('customers', 'Customers', Icons.people_alt_outlined, Icons.people_alt_rounded, () => const CustomersScreen()),
      if (p.seesDues) Section('dues', 'Dues', Icons.account_balance_wallet_outlined, Icons.account_balance_wallet_rounded, () => const DuesScreen()),
      if (p.seesReports) Section('reports', 'Reports', Icons.insert_chart_outlined_rounded, Icons.insert_chart_rounded, () => const ReportsScreen()),
      if (p.seesStaff) Section('staff', 'Staff', Icons.badge_outlined, Icons.badge_rounded, () => const StaffScreen()),
      Section('account', 'Profile', Icons.person_outline_rounded, Icons.person_rounded, () => const AccountScreen()),
    ];

/// Sidebar on Windows / tablets, bottom bar + "More" on phones.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  String _current = 'home';
  final Map<String, Widget> _built = {};
  bool _loginShown = false;

  void go(String id) => setState(() => _current = id);

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final sections = sectionsFor(s.perms);
    if (!sections.any((x) => x.id == _current)) _current = 'home';
    final wide = isWide(context);

    // Login ended (password changed / token expired): ask again, keep everything on the device.
    if (s.needLogin && !_loginShown) {
      _loginShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen(again: true), fullscreenDialog: true));
        _loginShown = false;
      });
    }

    // Pages keep their state while switching sections.
    final pages = IndexedStack(
      index: sections.indexWhere((x) => x.id == _current),
      children: [for (final x in sections) x.id == _current || _built.containsKey(x.id) ? (_built[x.id] ??= x.page()) : const SizedBox()],
    );

    final body = Column(children: [
      if (s.release != null && _isNewer(s.release!['version'], s.appVersion)) _UpdateBar(release: s.release!),
      Expanded(child: pages),
    ]);

    if (wide) {
      return Scaffold(
        body: Row(children: [
          _Sidebar(sections: sections, current: _current, onTap: go),
          const VerticalDivider(width: 1),
          Expanded(child: body),
        ]),
      );
    }

    // Phone: the first four sections + More.
    final primary = sections.where((x) => x.id != 'account').take(4).toList();
    final rest = sections.where((x) => !primary.contains(x)).toList();
    final inPrimary = primary.any((x) => x.id == _current);
    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: inPrimary ? primary.indexWhere((x) => x.id == _current) : primary.length,
        onDestinationSelected: (i) {
          if (i < primary.length) return go(primary[i].id);
          _openMore(context, rest);
        },
        destinations: [
          for (final x in primary) NavigationDestination(icon: Icon(x.icon), selectedIcon: Icon(x.activeIcon, color: AppColors.primary), label: x.label),
          NavigationDestination(
            icon: Badge(isLabelVisible: s.failed > 0, child: const Icon(Icons.grid_view_rounded)),
            selectedIcon: const Icon(Icons.grid_view_rounded, color: AppColors.primary),
            label: 'More',
          ),
        ],
      ),
    );
  }

  void _openMore(BuildContext context, List<Section> rest) {
    showModalBottomSheet(
      context: context,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: GridView.count(
            shrinkWrap: true,
            crossAxisCount: 3,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.15,
            children: [
              for (final x in rest)
                AppCard(
                  padding: const EdgeInsets.all(10),
                  onTap: () {
                    Navigator.pop(c);
                    go(x.id);
                  },
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(x.activeIcon, color: AppColors.primary, size: 28),
                    const SizedBox(height: 8),
                    Text(x.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  ]),
                ),
              AppCard(
                padding: const EdgeInsets.all(10),
                onTap: () {
                  Navigator.pop(c);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()));
                },
                child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.sync_rounded, color: AppColors.primary, size: 28),
                  SizedBox(height: 8),
                  Text('Sync', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

bool _isNewer(dynamic latest, String current) {
  if (latest is! String || current.isEmpty) return false;
  List<int> p(String v) => v.split('+').first.split('.').map((x) => int.tryParse(x) ?? 0).toList();
  final a = p(latest), b = p(current);
  for (var i = 0; i < 3; i++) {
    final x = i < a.length ? a[i] : 0, y = i < b.length ? b[i] : 0;
    if (x != y) return x > y;
  }
  return false;
}

class _UpdateBar extends StatelessWidget {
  final Map<String, dynamic> release;
  const _UpdateBar({required this.release});
  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.primary,
        child: SafeArea(
          bottom: false,
          child: InkWell(
            onTap: () => openUpdate(context, release),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(children: [
                const Icon(Icons.system_update_rounded, color: Colors.white, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text('New version ${release['version']} is available — tap to update', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
                const Icon(Icons.chevron_right_rounded, color: Colors.white),
              ]),
            ),
          ),
        ),
      );
}

class _Sidebar extends StatelessWidget {
  final List<Section> sections;
  final String current;
  final ValueChanged<String> onTap;
  const _Sidebar({required this.sections, required this.current, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = s.settings['businessName'] as String? ?? AppConfig.appName;
    return Container(
      width: 244,
      color: Colors.white,
      child: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 20, 18, 16),
            child: Row(children: [
              s.settings['logo'] != null
                  ? NetImage(s.settings['logo'], size: 36, radius: 9, placeholder: Icons.storefront_rounded)
                  : Container(width: 36, height: 36, decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(9)), child: const Icon(Icons.storefront_rounded, color: Colors.white, size: 20)),
              const SizedBox(width: 10),
              Expanded(child: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.primary))),
            ]),
          ),
          Expanded(
            child: ListView(padding: const EdgeInsets.symmetric(horizontal: 12), children: [
              for (final x in sections)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: ListTile(
                    dense: true,
                    selected: x.id == current,
                    selectedTileColor: AppColors.primarySoft,
                    selectedColor: AppColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    leading: Icon(x.id == current ? x.activeIcon : x.icon, size: 21),
                    title: Text(x.label, style: TextStyle(fontSize: 14.5, fontWeight: x.id == current ? FontWeight.w700 : FontWeight.w500)),
                    onTap: () => onTap(x.id),
                  ),
                ),
            ]),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Avatar(s.user?['name'] ?? '', photo: s.user?['avatar'], size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.user?['name'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  Text(s.user?['roleLabel'] ?? '', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ]),
              ),
            ]),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(12, 0, 12, 14), child: SyncBadge(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter())))),
        ]),
      ),
    );
  }
}
