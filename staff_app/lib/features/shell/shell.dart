import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/nav.dart';
import '../../core/perms.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../account/account_screen.dart';
import '../account/sync_center.dart';
import '../account/update.dart';
import '../categories/categories_screen.dart';
import '../customers/customers_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../deliveries/delivery_board_screen.dart';
import '../deliveries/my_deliveries_screen.dart';
import '../dues/dues_screen.dart';
import '../login/login_screen.dart';
import '../orders/order_detail_screen.dart';
import '../orders/orders_screen.dart';
import '../pos/pos_screen.dart';
import '../products/products_screen.dart';
import '../reports/reports_screen.dart';
import '../search/global_search.dart';
import '../staff/staff_screen.dart';

class Section {
  final String id;
  final String label;
  final String group;
  final IconData icon;
  final IconData activeIcon;
  final Widget Function() page;
  const Section(this.id, this.label, this.group, this.icon, this.activeIcon, this.page);
}

/// The sections this person may use — built from their role's permissions.
List<Section> sectionsFor(Perms p) => [
      Section('home', 'Dashboard', 'Overview', Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, () => const DashboardScreen()),
      if (p.seesPos) Section('pos', 'Billing', 'Sales', Icons.point_of_sale_outlined, Icons.point_of_sale_rounded, () => const PosScreen()),
      if (p.seesOrders) Section('orders', 'Orders', 'Sales', Icons.receipt_long_outlined, Icons.receipt_long_rounded, () => const OrdersScreen()),
      if (p.seesMyDeliveries) Section('deliveries', 'My deliveries', 'Sales', Icons.two_wheeler_outlined, Icons.two_wheeler_rounded, () => const MyDeliveriesScreen()),
      if (p.deliveryBoard && p.seesOrders) Section('board', 'Delivery board', 'Sales', Icons.local_shipping_outlined, Icons.local_shipping_rounded, () => const DeliveryBoardScreen()),
      if (p.seesDues) Section('dues', 'Dues', 'Sales', Icons.account_balance_wallet_outlined, Icons.account_balance_wallet_rounded, () => const DuesScreen()),
      if (p.seesProducts) Section('products', 'Products', 'Catalog', Icons.inventory_2_outlined, Icons.inventory_2_rounded, () => const ProductsScreen()),
      if (p.categories) Section('categories', 'Categories', 'Catalog', Icons.category_outlined, Icons.category_rounded, () => const CategoriesScreen()),
      if (p.seesCustomers) Section('customers', 'Customers', 'People', Icons.people_alt_outlined, Icons.people_alt_rounded, () => const CustomersScreen()),
      if (p.seesStaff) Section('staff', 'Staff', 'People', Icons.badge_outlined, Icons.badge_rounded, () => const StaffScreen()),
      if (p.seesReports) Section('reports', 'Reports', 'Insights', Icons.insert_chart_outlined_rounded, Icons.insert_chart_rounded, () => const ReportsScreen()),
      Section('account', 'Profile', 'Account', Icons.person_outline_rounded, Icons.person_rounded, () => const AccountScreen()),
    ];

/// Badge counts shown on menu items (new orders, deliveries to do, low stock…).
Map<String, int> badgesFor(AppState s) {
  final orders = s.list('orders');
  return {
    'orders': orders.where((o) => o['type'] == 'online' && o['status'] == 'Pending').length,
    'deliveries': s.list('deliveries').where((o) => o['status'] != 'Delivered' && o['status'] != 'Canceled').length,
    'board': orders.where((o) => o['type'] == 'online' && o['status'] == 'In Progress' && o['agentId'] == null).length,
    'products': s.list('products').where((p) => p['status'] == 'active' && p['type'] == 'physical' && p['stock'] != null && toInt(p['stock']) <= 0).length,
    'account': s.failed,
  };
}

void openSearch(BuildContext context) => showDialog(context: context, barrierColor: Colors.black38, builder: (_) => const GlobalSearch());

/// Sidebar on Windows / tablets, bottom bar + "More" on phones.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  final Map<String, Widget> _built = {};
  bool _loginShown = false;
  Set<int>? _seenPending; // online orders already known, so only new ones ring

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _checkNewOrders();
  }

  /// A new online order arrived with the last sync → sound + banner with "View".
  void _checkNewOrders() {
    final s = context.read<AppState>();
    if (!s.perms.seesOrders) return;
    final pending = s.list('orders').where((o) => o['type'] == 'online' && o['status'] == 'Pending').toList();
    final ids = pending.map((o) => toInt(o['id'])).toSet();
    if (_seenPending == null) {
      _seenPending = ids;
      return;
    }
    final fresh = pending.where((o) => !_seenPending!.contains(toInt(o['id']))).toList();
    _seenPending = ids;
    if (fresh.isEmpty) return;
    SystemSound.play(SystemSoundType.alert);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final o = fresh.first;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        backgroundColor: AppColors.primaryDark,
        content: Row(children: [
          const Icon(Icons.notifications_active_rounded, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(child: Text(fresh.length == 1 ? 'New order ${o['number']} · ${o['customer']} · ${money(o['total'])}' : '${fresh.length} new online orders', style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
        action: SnackBarAction(
          label: 'VIEW', textColor: Colors.white,
          onPressed: () => fresh.length == 1
              ? Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: toInt(o['id']))))
              : context.read<NavController>().go('orders', {'tab': 'Pending'}),
        ),
      ));
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final nav = context.watch<NavController>();
    _checkNewOrders();
    final sections = sectionsFor(s.perms);
    final current = sections.any((x) => x.id == nav.section) ? nav.section : 'home';
    final wide = isWide(context);
    final badges = badgesFor(s);

    if (s.needLogin && !_loginShown) {
      _loginShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen(again: true), fullscreenDialog: true));
        _loginShown = false;
      });
    }

    final pages = IndexedStack(
      index: sections.indexWhere((x) => x.id == current),
      children: [for (final x in sections) x.id == current || _built.containsKey(x.id) ? (_built[x.id] ??= x.page()) : const SizedBox()],
    );
    final body = Column(children: [
      if (s.release != null && isNewer(s.release!['version'], s.appVersion)) _UpdateBar(release: s.release!),
      Expanded(child: pages),
    ]);

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): () => openSearch(context),
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () => openSearch(context),
      },
      child: Focus(
        autofocus: true,
        child: wide
            ? Scaffold(body: Row(children: [_Sidebar(sections: sections, current: current, badges: badges), const VerticalDivider(width: 1), Expanded(child: body)]))
            : _phone(context, s, sections, current, badges, body),
      ),
    );
  }

  Widget _phone(BuildContext context, AppState s, List<Section> sections, String current, Map<String, int> badges, Widget body) {
    final nav = context.read<NavController>();
    final primary = sections.where((x) => x.id != 'account').take(4).toList();
    final rest = sections.where((x) => !primary.contains(x)).toList();
    final inPrimary = primary.any((x) => x.id == current);
    final restBadge = rest.fold<int>(0, (t, x) => t + (badges[x.id] ?? 0));
    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: inPrimary ? primary.indexWhere((x) => x.id == current) : primary.length,
        onDestinationSelected: (i) => i < primary.length ? nav.go(primary[i].id) : _openMore(context, rest, badges),
        destinations: [
          for (final x in primary)
            NavigationDestination(
              icon: Badge(isLabelVisible: (badges[x.id] ?? 0) > 0, label: Text('${badges[x.id]}'), child: Icon(x.icon)),
              selectedIcon: Badge(isLabelVisible: (badges[x.id] ?? 0) > 0, label: Text('${badges[x.id]}'), child: Icon(x.activeIcon, color: AppColors.primary)),
              label: const {'home': 'Home', 'deliveries': 'Deliveries', 'board': 'Board', 'customers': 'Customers'}[x.id] ?? x.label,
            ),
          NavigationDestination(
            icon: Badge(isLabelVisible: restBadge > 0, label: Text('$restBadge'), child: const Icon(Icons.grid_view_rounded)),
            selectedIcon: const Icon(Icons.grid_view_rounded, color: AppColors.primary),
            label: 'More',
          ),
        ],
      ),
    );
  }

  void _openMore(BuildContext context, List<Section> rest, Map<String, int> badges) {
    final nav = context.read<NavController>();
    final s = context.read<AppState>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Avatar(s.user?['name'] ?? '', photo: s.user?['avatar'], size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.user?['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  Text(s.user?['roleLabel'] ?? '', style: const TextStyle(color: AppColors.muted)),
                ]),
              ),
              IconButton.filledTonal(onPressed: () {
                Navigator.pop(c);
                openSearch(context);
              }, icon: const Icon(Icons.search_rounded)),
            ]),
            const SizedBox(height: 14),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 3, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.1,
              children: [
                for (final x in rest) _moreTile(x.activeIcon, x.label, badges[x.id] ?? 0, () {
                  Navigator.pop(c);
                  nav.go(x.id);
                }),
                _moreTile(Icons.sync_rounded, 'Sync', s.pending + s.failed, () {
                  Navigator.pop(c);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()));
                }),
              ],
            ),
          ]),
        ),
      ),
    );
  }

  Widget _moreTile(IconData icon, String label, int badge, VoidCallback onTap) => AppCard(
        padding: const EdgeInsets.all(10),
        onTap: onTap,
        child: Stack(children: [
          Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 44, height: 44, decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(13)), child: Icon(icon, color: AppColors.primary)),
              const SizedBox(height: 8),
              Text(label, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
            ]),
          ),
          Positioned(right: 0, top: 0, child: CountBadge(badge)),
        ]),
      );
}

bool isNewer(dynamic latest, String current) {
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
                Expanded(child: Text('Version ${release['version']} is available — tap to update', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
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
  final Map<String, int> badges;
  const _Sidebar({required this.sections, required this.current, required this.badges});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final nav = context.read<NavController>();
    final name = s.settings['businessName'] as String? ?? AppConfig.appName;
    final groups = <String, List<Section>>{};
    for (final x in sections) {
      groups.putIfAbsent(x.group, () => []).add(x);
    }
    return Container(
      width: 252,
      color: Colors.white,
      child: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
            child: Row(children: [
              s.settings['logo'] != null
                  ? NetImage(s.settings['logo'], size: 38, radius: 11, placeholder: Icons.storefront_rounded)
                  : Container(width: 38, height: 38, decoration: BoxDecoration(gradient: AppColors.heroGradient, borderRadius: BorderRadius.circular(11)), child: const Icon(Icons.storefront_rounded, color: Colors.white, size: 21)),
              const SizedBox(width: 11),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const Text('Staff app', style: TextStyle(fontSize: 11.5, color: AppColors.muted)),
                ]),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => openSearch(context),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.border)),
                child: const Row(children: [
                  Icon(Icons.search_rounded, size: 19, color: AppColors.faint),
                  SizedBox(width: 8),
                  Expanded(child: Text('Search…', style: TextStyle(color: AppColors.faint))),
                  Text('Ctrl K', style: TextStyle(fontSize: 11, color: AppColors.faint, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 8), children: [
              for (final g in groups.entries) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 12, 10, 6),
                  child: Text(g.key.toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.faint, letterSpacing: 1)),
                ),
                for (final x in g.value) _item(x, nav),
              ],
            ]),
          ),
          const Divider(),
          InkWell(
            onTap: () => nav.go('account'),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
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
          ),
          Padding(padding: const EdgeInsets.fromLTRB(12, 0, 12, 14), child: SyncBadge(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter())))),
        ]),
      ),
    );
  }

  Widget _item(Section x, NavController nav) {
    final active = x.id == current;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Material(
        color: active ? AppColors.primarySoft : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => nav.go(x.id),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            child: Row(children: [
              Icon(active ? x.activeIcon : x.icon, size: 20, color: active ? AppColors.primary : AppColors.muted),
              const SizedBox(width: 12),
              Expanded(child: Text(x.label, style: TextStyle(fontSize: 14, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: active ? AppColors.primary : AppColors.text))),
              CountBadge(badges[x.id] ?? 0, color: x.id == 'products' ? AppColors.amber : AppColors.red),
            ]),
          ),
        ),
      ),
    );
  }
}
