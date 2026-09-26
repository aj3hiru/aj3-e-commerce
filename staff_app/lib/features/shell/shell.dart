import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/nav.dart';
import '../../core/perms.dart';
import '../../core/theme.dart';
import '../../desktop/board_web.dart';
import '../../desktop/categories_web.dart';
import '../../desktop/customers_web.dart';
import '../../desktop/dashboard_web.dart';
import '../../desktop/dues_web.dart';
import '../../desktop/products_web.dart';
import '../../desktop/profile_web.dart';
import '../../desktop/staff_web.dart';
import '../../desktop/orders_web.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../../widgets/web.dart';
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
      Section('home', 'Dashboard', 'Overview', Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, () => const Responsive(phone: DashboardScreen(), desktop: DashboardWeb())),
      if (p.seesPos) Section('pos', 'Billing', 'Sales', Icons.point_of_sale_outlined, Icons.point_of_sale_rounded, () => const PosScreen()),
      if (p.seesOrders) Section('orders', 'Orders', 'Sales', Icons.receipt_long_outlined, Icons.receipt_long_rounded, () => const Responsive(phone: OrdersScreen(), desktop: OrdersWeb())),
      if (p.seesMyDeliveries) Section('deliveries', 'My deliveries', 'Sales', Icons.two_wheeler_outlined, Icons.two_wheeler_rounded, () => const MyDeliveriesScreen()),
      if (p.deliveryBoard && p.seesOrders) Section('board', 'Delivery board', 'Sales', Icons.local_shipping_outlined, Icons.local_shipping_rounded, () => const Responsive(phone: DeliveryBoardScreen(), desktop: BoardWeb())),
      if (p.seesDues) Section('dues', 'Dues', 'Sales', Icons.account_balance_wallet_outlined, Icons.account_balance_wallet_rounded, () => const Responsive(phone: DuesScreen(), desktop: DuesWeb())),
      if (p.seesProducts) Section('products', 'Products', 'Catalog', Icons.inventory_2_outlined, Icons.inventory_2_rounded, () => const Responsive(phone: ProductsScreen(), desktop: ProductsWeb())),
      if (p.categories) Section('categories', 'Categories', 'Catalog', Icons.category_outlined, Icons.category_rounded, () => const Responsive(phone: CategoriesScreen(), desktop: CategoriesWeb())),
      if (p.seesCustomers) Section('customers', 'Customers', 'People', Icons.people_alt_outlined, Icons.people_alt_rounded, () => const Responsive(phone: CustomersScreen(), desktop: CustomersWeb())),
      if (p.seesStaff) Section('staff', 'Staff', 'People', Icons.badge_outlined, Icons.badge_rounded, () => const Responsive(phone: StaffScreen(), desktop: StaffWeb())),
      if (p.seesReports) Section('reports', 'Reports', 'Insights', Icons.insert_chart_outlined_rounded, Icons.insert_chart_rounded, () => const ReportsScreen()),
      Section('account', 'Profile', 'Account', Icons.person_outline_rounded, Icons.person_rounded, () => const Responsive(phone: AccountScreen(), desktop: ProfileWeb())),
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

  final _content = GlobalKey<NavigatorState>();
  String? _lastSection;

  void _goWeb(NavController nav, String id) {
    _content.currentState?.popUntil((r) => r.isFirst);
    nav.go(id);
  }

  Future<void> _logout(BuildContext context) async {
    final s = context.read<AppState>();
    final msg = s.pending > 0
        ? '${s.pending} change(s) have not reached the server yet. If you log out now they will be LOST. Connect to the internet first to send them.'
        : 'You can log in again any time.';
    if (await confirm(context, 'Log out?', msg, ok: 'Log out', danger: s.pending > 0)) s.logout();
  }

  @override
  void initState() {
    super.initState();
    webUserMenu = (ctx, action) {
      switch (action) {
        case 'profile':
          _goWeb(context.read<NavController>(), 'account');
        case 'sync':
          Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => const SyncCenter()));
        case 'logout':
          _logout(context);
      }
    };
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final nav = context.watch<NavController>();
    _checkNewOrders();
    // A card or search result switched section: close any open detail page first.
    if (_lastSection != null && _lastSection != nav.section) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _content.currentState?.popUntil((r) => r.isFirst));
    }
    _lastSection = nav.section;
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

    final body = _pages(context);

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): () => openSearch(context),
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () => openSearch(context),
      },
      child: Focus(
        autofocus: true,
        child: wide
            ? Scaffold(
                backgroundColor: W.g50,
                body: Row(children: [
                  _Sidebar(sections: sections, current: current, badges: badges, onGo: (id) => _goWeb(nav, id), onLogout: () => _logout(context)),
                  // Details (an order, a customer…) open inside this area, so the sidebar stays — as on the website.
                  // The route is built once, so its Builder watches the app state itself and
                  // shows whichever section is current (not the section of the first build).
                  Expanded(child: Navigator(key: _content, onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => Builder(builder: _pages)))),
                ]),
              )
            : _phone(context, s, sections, current, badges, body),
      ),
    );
  }

  /// The current section (others stay alive in an IndexedStack) under the update bar.
  Widget _pages(BuildContext context) {
    final s = context.watch<AppState>();
    final nav = context.watch<NavController>();
    final sections = sectionsFor(s.perms);
    final current = sections.any((x) => x.id == nav.section) ? nav.section : 'home';
    return Column(children: [
      if (s.release != null && isNewer(s.release!['version'], s.appVersion)) _UpdateBar(release: s.release!),
      Expanded(
        child: IndexedStack(
          index: sections.indexWhere((x) => x.id == current),
          children: [for (final x in sections) x.id == current || _built.containsKey(x.id) ? (_built[x.id] ??= x.page()) : const SizedBox()],
        ),
      ),
    ]);
  }

  Widget _phone(BuildContext context, AppState s, List<Section> sections, String current, Map<String, int> badges, Widget body) {
    final nav = context.read<NavController>();
    final p = s.perms;
    // Bottom bar: Home, the two sections this role uses most, Profile. Everything else is in the ☰ menu.
    final priority = p.seesMyDeliveries && !p.seesOrders ? ['deliveries', 'history'] : ['pos', 'orders', 'board', 'products', 'dues', 'customers', 'reports'];
    final ids = sections.map((x) => x.id).toSet();
    final middle = <(String, IconData, IconData, String)>[];
    for (final id in priority) {
      if (middle.length == 2) break;
      if (id == 'history' && ids.contains('deliveries')) {
        middle.add(('history', Icons.history_rounded, Icons.history_rounded, 'History'));
      } else if (ids.contains(id)) {
        final x = sections.firstWhere((x) => x.id == id);
        middle.add((x.id, x.icon, x.activeIcon, const {'deliveries': 'Deliveries', 'pos': 'Billing', 'board': 'Board'}[x.id] ?? x.label));
      }
    }
    final items = [('home', Icons.home_outlined, Icons.home_rounded, 'Home'), ...middle, ('account', Icons.person_outline_rounded, Icons.person_rounded, 'Profile')];
    final shown = current == 'deliveries' && nav.args.isEmpty && _historyTab ? 'history' : current;
    return Scaffold(
      key: shellScaffoldKey,
      drawer: _drawer(context, s, sections, current, badges),
      body: body,
      bottomNavigationBar: FloatingNavBar(
        items: items,
        current: items.any((i) => i.$1 == shown) ? shown : '',
        badges: {...badges, 'history': 0},
        onTap: (id) {
          if (id == 'history') {
            _historyTab = true;
            nav.go('deliveries', {'done': true});
          } else {
            _historyTab = false;
            nav.go(id, id == 'deliveries' ? {'done': false} : const {});
          }
        },
      ),
    );
  }

  bool _historyTab = false;

  Widget _drawer(BuildContext context, AppState s, List<Section> sections, String current, Map<String, int> badges) {
    final nav = context.read<NavController>();
    void go(String id) {
      Navigator.pop(context);
      _historyTab = false;
      nav.go(id);
    }
    return Drawer(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(24))),
      child: Column(children: [
        Container(
          width: double.infinity,
          padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 22, 20, 22),
          decoration: BoxDecoration(gradient: AppColors.heroGradient, borderRadius: const BorderRadius.only(bottomRight: Radius.circular(28))),
          child: Row(children: [
            Container(padding: const EdgeInsets.all(2), decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Avatar(s.user?['name'] ?? '', photo: s.user?['avatar'], size: 54)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.user?['name'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
                Text(s.user?['roleLabel'] ?? '', style: TextStyle(color: Colors.white.withValues(alpha: .88))),
                Text('${s.settings['businessName'] ?? AppConfig.appName}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withValues(alpha: .75), fontSize: 12)),
              ]),
            ),
          ]),
        ),
        Expanded(
          child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 12), children: [
            for (final x in sections)
              ListTile(
                selected: x.id == current,
                selectedTileColor: AppColors.primarySoft,
                selectedColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                leading: Icon(x.id == current ? x.activeIcon : x.icon),
                title: Text(x.label, style: TextStyle(fontWeight: x.id == current ? FontWeight.w700 : FontWeight.w500)),
                trailing: CountBadge(badges[x.id] ?? 0),
                onTap: () => go(x.id),
              ),
            const Divider(height: 20),
            ListTile(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), leading: const Icon(Icons.search_rounded), title: const Text('Search'), onTap: () {
              Navigator.pop(context);
              openSearch(context);
            }),
            ListTile(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), leading: const Icon(Icons.sync_rounded), title: const Text('Sync'), trailing: CountBadge(s.pending + s.failed, color: AppColors.amber), onTap: () {
              Navigator.pop(context);
              Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()));
            }),
          ]),
        ),
        Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 18), child: SyncBadge(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter())))),
      ]),
    );
  }
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

/// Website sidebar (AdminSidebar.tsx): brand, grouped links, same labels and icons.
const _webNav = <String, (String, String, FaIconData)>{
  'home': ('Main', 'Dashboard', FontAwesomeIcons.solidHouse),
  'pos': ('Sales', 'Billing / POS', FontAwesomeIcons.cashRegister),
  'orders': ('Sales', 'Orders', FontAwesomeIcons.receipt),
  'board': ('Sales', 'Deliveries', FontAwesomeIcons.solidTruck),
  'deliveries': ('Sales', 'My Deliveries', FontAwesomeIcons.motorcycle),
  'dues': ('Sales', 'Due Payments', FontAwesomeIcons.handHoldingDollar),
  'products': ('Catalog', 'Products', FontAwesomeIcons.boxesStacked),
  'categories': ('Catalog', 'Categories', FontAwesomeIcons.list),
  'customers': ('Customers & Marketing', 'Customers', FontAwesomeIcons.userGroup),
  'reports': ('Reports', 'Report Builder', FontAwesomeIcons.fileInvoiceDollar),
  'staff': ('Settings', 'Staff & Roles', FontAwesomeIcons.usersGear),
  'account': ('Account', 'My Profile', FontAwesomeIcons.solidUser),
};

class _Sidebar extends StatefulWidget {
  final List<Section> sections;
  final String current;
  final Map<String, int> badges;
  final ValueChanged<String> onGo;
  final VoidCallback onLogout;
  const _Sidebar({required this.sections, required this.current, required this.badges, required this.onGo, required this.onLogout});
  @override
  State<_Sidebar> createState() => _SidebarState();
}

class _SidebarState extends State<_Sidebar> {
  Set<String> _hidden = {};

  @override
  void initState() {
    super.initState();
    LocalStore.instance.read('sidebar_hidden').then((v) {
      if (v is List && mounted) setState(() => _hidden = v.map((e) => '$e').toSet());
    });
  }

  void _toggle(String id) {
    setState(() => _hidden.contains(id) ? _hidden.remove(id) : _hidden.add(id));
    LocalStore.instance.write('sidebar_hidden', _hidden.toList());
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = (s.settings['businessName'] as String?)?.trim().isNotEmpty == true ? s.settings['businessName'] as String : AppConfig.appName;
    final groups = <String, List<String>>{};
    for (final x in widget.sections) {
      final w = _webNav[x.id];
      if (w == null || (_hidden.contains(x.id) && x.id != widget.current)) continue;
      groups.putIfAbsent(w.$1, () => []).add(x.id);
    }
    return Container(
      width: 280,
      decoration: const BoxDecoration(color: Colors.white, border: Border(right: BorderSide(color: W.g200))),
      child: Column(children: [
        Container(
          constraints: const BoxConstraints(minHeight: 89),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: W.g100))),
          child: Row(children: [
            Expanded(
              child: InkWell(
                onTap: () => widget.onGo('home'),
                child: s.settings['logo'] != null
                    ? Align(alignment: Alignment.centerLeft, child: NetImage(s.settings['logo'], size: 44, width: 170, radius: 0, fit: BoxFit.contain, placeholder: Icons.storefront_rounded))
                    : Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18.4, fontWeight: FontWeight.w800, color: W.primary)),
              ),
            ),
            // Display options: show / hide menu items (the website's sliders icon).
            PopupMenuButton<String>(
              tooltip: 'Show / hide menu items',
              position: PopupMenuPosition.under,
              icon: const FaIcon(FontAwesomeIcons.sliders, size: 16, color: W.g500),
              onSelected: _toggle,
              itemBuilder: (_) => [
                for (final x in widget.sections)
                  if (_webNav[x.id] != null && x.id != 'home')
                    CheckedPopupMenuItem(value: x.id, checked: !_hidden.contains(x.id), child: Text(_webNav[x.id]!.$2)),
              ],
            ),
          ]),
        ),
        Expanded(
          child: ListView(padding: const EdgeInsets.symmetric(vertical: 16), children: [
            for (final g in groups.entries)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text(g.key.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: W.g400, letterSpacing: 1.1)),
                  ),
                  for (final id in g.value) _link(id, _webNav[id]!.$2, _webNav[id]!.$3, () => widget.onGo(id), badge: widget.badges[id] ?? 0),
                  if (g.key == 'Account') _link('logout', 'Logout', FontAwesomeIcons.rightFromBracket, widget.onLogout),
                ]),
              ),
          ]),
        ),
      ]),
    );
  }

  Widget _link(String id, String label, FaIconData icon, VoidCallback onTap, {int badge = 0}) {
    final active = id == widget.current;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: active ? W.primaryLighter : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          hoverColor: W.g50,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(children: [
              SizedBox(width: 24, child: Center(child: FaIcon(icon, size: 17, color: active ? W.primary : W.g600))),
              const SizedBox(width: 14),
              Expanded(child: Text(label, style: TextStyle(fontSize: 15, fontWeight: active ? FontWeight.w600 : FontWeight.w500, color: active ? W.primary : W.g600))),
              if (badge > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(color: id == 'products' ? W.yellow : W.red, borderRadius: BorderRadius.circular(999)),
                  child: Text('$badge', style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}
