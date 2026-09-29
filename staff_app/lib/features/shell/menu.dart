import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// The website's admin menu (from /api/app/v1/menu), and which links the app
/// shows with its own screens. Everything else opens the website page inside the app.

/// Icon names the website's menu uses → the app's clean line icons (same family on every page).
const faByName = <String, IconData>{
  'house': LucideIcons.house,
  'cash-register': LucideIcons.calculator,
  'receipt': LucideIcons.receipt,
  'truck': LucideIcons.truck,
  'hand-holding-dollar': LucideIcons.handCoins,
  'boxes-stacked': LucideIcons.boxes,
  'square-plus': LucideIcons.squarePlus,
  'box-open': LucideIcons.packageOpen,
  'star-half-stroke': LucideIcons.starHalf,
  'copyright': LucideIcons.copyright,
  'tags': LucideIcons.tags,
  'barcode': LucideIcons.barcode,
  'list': LucideIcons.listTree,
  'user-group': LucideIcons.users,
  'percent': LucideIcons.percent,
  'bell': LucideIcons.bell,
  'file-invoice-dollar': LucideIcons.fileSpreadsheet,
  'chart-line': LucideIcons.chartLine,
  'clock-rotate-left': LucideIcons.history,
  'brush': LucideIcons.paintbrush,
  'box': LucideIcons.box,
  'bars': LucideIcons.menu,
  'grip-lines': LucideIcons.panelBottom,
  'file-lines': LucideIcons.fileText,
  'images': LucideIcons.images,
  'building': LucideIcons.building2,
  'users-gear': LucideIcons.userCog,
  'gear': LucideIcons.settings,
  'bolt': LucideIcons.zap,
  'user': LucideIcons.user,
  'mobile-screen-button': LucideIcons.smartphone,
  'right-from-bracket': LucideIcons.logOut,
  'motorcycle': LucideIcons.bike,
};

IconData faIcon(String? name) => faByName[name] ?? LucideIcons.circle;

/// Website links the app shows with its own (offline-capable) screens.
const nativeByHref = <String, String>{
  '/admin/dashboard': 'home',
  '/admin/ecommerce/billing': 'pos',
  '/admin/ecommerce/orders': 'orders',
  '/admin/deliveries?view=all': 'board',
  '/admin/ecommerce/due': 'dues',
  '/admin/ecommerce/products': 'products',
  '/admin/ecommerce/categories': 'categories',
  '/admin/ecommerce/customers': 'customers',
  '/admin/ecommerce/reports': 'reports',
  '/admin/user-manager': 'staff',
  '/admin/my-profile': 'account',
};

/// Links that do something other than open a page.
const addProductHref = '/admin/ecommerce/products/add';

class MenuLink {
  final String href, label, icon;
  final bool logout, toggleOnly;
  final List<MenuLink> submenu;
  const MenuLink(this.href, this.label, this.icon, {this.logout = false, this.toggleOnly = false, this.submenu = const []});

  factory MenuLink.from(Map m) => MenuLink(
        '${m['href']}',
        '${m['label']}',
        '${m['icon']}',
        logout: m['logout'] == true,
        toggleOnly: m['toggleOnly'] == true,
        submenu: [for (final x in (m['submenu'] as List? ?? const [])) MenuLink.from(x as Map)],
      );

  /// Section id this link opens in the app (a native screen or a website page).
  String get sectionId => href.startsWith('app:') ? href.substring(4) : nativeByHref[href] ?? 'web:$href';
  bool get isNative => nativeByHref.containsKey(href) || href.startsWith('app:');
}

class MenuSection {
  final String title;
  final List<MenuLink> links;
  const MenuSection(this.title, this.links);
}

List<MenuSection> parseMenu(List<Map<String, dynamic>> raw) => [
      for (final s in raw) MenuSection('${s['title']}', [for (final l in (s['links'] as List? ?? const [])) MenuLink.from(l as Map)]),
    ];

/// Every website page the menu links to that the app doesn't have natively (for the page stack).
List<MenuLink> webLinks(List<MenuSection> menu) {
  final out = <MenuLink>[];
  void add(MenuLink l) {
    if (!l.logout && !l.toggleOnly && !l.isNative && l.href != addProductHref && !l.href.startsWith('#') && !out.any((x) => x.href == l.href)) out.add(l);
    for (final x in l.submenu) {
      add(x);
    }
  }
  for (final s in menu) {
    for (final l in s.links) {
      add(l);
    }
  }
  return out;
}

/// Delivery agents: the app's own "My Deliveries" screen sits at the top of Sales.
List<MenuSection> withAppLinks(List<MenuSection> menu, Set<String> sections) {
  if (menu.isEmpty || !sections.contains('deliveries') || menu.any((s) => s.links.any((l) => l.href == 'app:deliveries'))) return menu;
  const mine = MenuLink('app:deliveries', 'My Deliveries', 'motorcycle');
  final i = menu.indexWhere((s) => s.title.toLowerCase() == 'sales');
  if (i < 0) return [menu.first, const MenuSection('Delivery', [mine]), ...menu.skip(1)];
  return [for (var n = 0; n < menu.length; n++) n == i ? MenuSection(menu[n].title, [mine, ...menu[n].links]) : menu[n]];
}
