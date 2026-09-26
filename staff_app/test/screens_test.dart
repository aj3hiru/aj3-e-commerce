// Renders every main screen with sample data to PNGs (test/goldens/), so the
// layout can be checked on phone and Windows sizes without a device:
//   flutter test --update-goldens test/screens_test.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:sri_staff/core/app_state.dart';
import 'package:sri_staff/core/local_store.dart';
import 'package:sri_staff/core/nav.dart';
import 'package:sri_staff/features/categories/categories_screen.dart';
import 'package:sri_staff/features/account/account_screen.dart';
import 'package:sri_staff/core/perms.dart';
import 'package:sri_staff/core/theme.dart';
import 'package:sri_staff/features/customers/customers_screen.dart';
import 'package:sri_staff/features/deliveries/my_deliveries_screen.dart';
import 'package:sri_staff/features/dues/dues_screen.dart';
import 'package:sri_staff/features/login/login_screen.dart';
import 'package:sri_staff/features/orders/order_detail_screen.dart';
import 'package:sri_staff/features/orders/orders_screen.dart';
import 'package:sri_staff/features/products/product_edit_screen.dart';
import 'package:sri_staff/features/products/products_screen.dart';
import 'package:sri_staff/features/shell/shell.dart';

Future<void> _fonts() async {
  final inter = FontLoader('Inter');
  for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    inter.addFont(Future.value(ByteData.sublistView(File('assets/fonts/Inter-$w.ttf').readAsBytesSync())));
  }
  await inter.load();
  final root = Platform.environment['FLUTTER_ROOT'] ?? '';
  final icons = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytesSync())));
  await icons.load();
  // Icon fonts of the website look (Font Awesome in the sidebar, Lucide on the pages).
  final cache = '${Platform.environment['PUB_CACHE'] ?? '${Platform.environment['HOME']}/.pub-cache'}/hosted/pub.dev';
  for (final (family, file) in [
    ('packages/font_awesome_flutter/FontAwesomeSolid', '$cache/font_awesome_flutter-11.0.0/lib/fonts/Font-Awesome-7-Free-Solid-900.otf'),
    ('packages/font_awesome_flutter/FontAwesomeRegular', '$cache/font_awesome_flutter-11.0.0/lib/fonts/Font-Awesome-7-Free-Regular-400.otf'),
    ('packages/lucide_icons_flutter/Lucide', '$cache/lucide_icons_flutter-3.1.20/assets/lucide.ttf'),
  ]) {
    if (!File(file).existsSync()) continue; // another cache layout: icons show as boxes, the test still runs
    await (FontLoader(family)..addFont(Future.value(ByteData.sublistView(File(file).readAsBytesSync())))).load();
  }
}

Map<String, dynamic> _all(bool v) => {
      'ecommerce': {for (final k in ['manage_billing', 'manage_products', 'manage_categories', 'manage_orders', 'manage_customers', 'manage_coupons', 'manage_credits']) k: v},
      'orders': {for (final k in ['view', 'accept_reject', 'update_status', 'assign_delivery', 'mark_paid', 'edit_items', 'cancel']) k: v},
      'delivery': {'deliver': false, 'view_all': v},
      'users': {'create': v, 'edit': v, 'suspend': v, 'change_roles': v},
      'dashboard_access': true,
    };

AppState _state({String role = 'admin', Map<String, dynamic>? perms}) {
  final now = DateTime.now().toUtc();
  String ago(int m) => now.subtract(Duration(minutes: m)).toIso8601String();
  final s = AppState()
    ..ready = true
    ..user = {'id': 1, 'username': 'arjun', 'name': 'Arjun Kumar', 'roleLabel': role == 'admin' ? 'Admin' : 'Delivery Agent', 'role': role, 'email': 'arjun@example.com', 'phone': '9876543210', 'since': '2026-01-10T00:00:00Z'}
    ..lastSync = now.subtract(const Duration(minutes: 1));
  s.api.token = 'test';
  s.perms = Perms(perms ?? _all(true), role);
  s.sets = {
    'settings': {'businessName': 'Sri Andal Traders', 'address': 'Main Road, Narkatiaganj', 'phones': ['9876543210'], 'printerFormat': 'thermal_80'},
    'categories': [{'id': 1, 'name': 'Pooja Items', 'status': 'active'}, {'id': 2, 'name': 'T-shirts', 'status': 'active'}],
    'brands': [{'id': 1, 'name': 'Sri Andal', 'status': 'active'}],
    'products': [
      {'id': 1, 'name': 'Hawan Samagri 500g', 'sku': 'HS500', 'barcode': '8901001', 'price': 120, 'salePrice': 99, 'gstRate': 5, 'stock': 42, 'unit': 'Packet', 'categoryId': 1, 'status': 'active', 'type': 'physical'},
      {'id': 2, 'name': 'Pure Cow Ghee 1L', 'sku': 'GH1L', 'barcode': '8901002', 'price': 650, 'salePrice': null, 'gstRate': 12, 'stock': 3, 'unit': 'Litre', 'categoryId': 1, 'status': 'active', 'type': 'physical'},
      {'id': 3, 'name': 'Cotton T-shirt (Saffron)', 'sku': 'TS01', 'barcode': '8901003', 'price': 399, 'salePrice': 299, 'gstRate': 5, 'stock': 0, 'categoryId': 2, 'status': 'active', 'type': 'physical'},
      {'id': 4, 'name': 'Camphor Tablets 100g', 'sku': 'CP100', 'barcode': '8901004', 'price': 85, 'salePrice': null, 'gstRate': 18, 'stock': 120, 'categoryId': 1, 'status': 'active', 'type': 'physical'},
    ],
    'customers': [
      {'id': 1, 'name': 'Sujata Kumari', 'phone': '9973007123', 'type': 'online', 'status': 'active', 'due': 0, 'since': '2026-05-02T00:00:00Z'},
      {'id': 2, 'name': 'Nitu Devi', 'phone': '7632096003', 'type': 'offline', 'status': 'active', 'due': 900.01, 'since': '2026-03-12T00:00:00Z', 'address': 'Ward 4, Narkatiaganj'},
    ],
    'coupons': [{'id': 1, 'code': 'WELCOME10', 'discountType': 'percentage', 'discountValue': 10, 'appliesTo': 'all'}],
    'orders': [
      {'id': 17, 'number': 'ORD0000010', 'type': 'online', 'status': 'Pending', 'paymentStatus': 'Unpaid', 'paymentMethod': 'COD', 'customerId': 1, 'customer': 'Sujata Kumari', 'phone': '9973007123', 'total': 1049, 'subtotal': 999, 'discount': 0, 'gst': 50, 'due': 0, 'address': 'Sujata Kumari, 9973007123\nNear Shiv Mandir, Narkatiaganj - 845455', 'createdAt': ago(12),
        'items': [{'productId': 1, 'name': 'Hawan Samagri 500g', 'qty': 3, 'price': 99}, {'productId': 2, 'name': 'Pure Cow Ghee 1L', 'qty': 1, 'price': 650}]},
      {'id': 16, 'number': 'ORD0000009', 'type': 'online', 'status': 'Out for Delivery', 'paymentStatus': 'Unpaid', 'paymentMethod': 'COD', 'customerId': 1, 'customer': 'Sujata Kumari', 'phone': '9973007123', 'total': 500, 'subtotal': 500, 'discount': 0, 'gst': 0, 'due': 0, 'agentId': 24, 'createdAt': ago(95), 'items': [{'productId': 4, 'name': 'Camphor Tablets 100g', 'qty': 5, 'price': 85}]},
      {'id': 15, 'number': 'ORD0000008', 'type': 'offline', 'status': 'Delivered', 'paymentStatus': 'Paid', 'paymentMethod': 'Cash', 'customerId': 2, 'customer': 'Nitu Devi', 'total': 1500, 'subtotal': 1500, 'discount': 0, 'gst': 0, 'due': 900.01, 'createdAt': ago(1500), 'items': [{'productId': 3, 'name': 'Cotton T-shirt (Saffron)', 'qty': 5, 'price': 300}]},
    ],
    'dues': [{'id': 1, 'orderId': 15, 'orderNumber': 'ORD0000008', 'customerId': 2, 'customer': 'Nitu Devi', 'phone': '7632096003', 'amount': 1000.02, 'paid': 100.01, 'balance': 900.01, 'status': 'pending', 'createdAt': ago(9000)}],
    'agents': [{'id': 24, 'name': 'Badal Kumar', 'phone': '6200771784'}],
    'staff': [
      {'id': 1, 'username': 'arjun', 'name': 'Arjun Kumar', 'email': 'a@x.in', 'phone': '9876543210', 'role': 'admin', 'roleLabel': 'Admin', 'status': 'active'},
      {'id': 24, 'username': 'badal', 'name': 'Badal Kumar', 'email': 'b@x.in', 'phone': '6200771784', 'role': 'delivery_agent', 'roleLabel': 'Delivery Agent', 'status': 'active'},
      {'id': 30, 'username': 'ravi', 'name': 'Ravi Singh', 'email': 'r@x.in', 'role': 'cashier', 'roleLabel': 'Billing / Cashier', 'status': 'suspended'},
    ],
    'deliveries': [
      {'id': 16, 'number': 'ORD0000009', 'type': 'online', 'status': 'Out for Delivery', 'paymentStatus': 'Unpaid', 'paymentMethod': 'COD', 'customer': 'Sujata Kumari', 'phone': '9973007123', 'total': 500, 'subtotal': 500, 'discount': 0, 'gst': 0, 'due': 0, 'agentId': 1, 'address': 'Near Shiv Mandir, Narkatiaganj - 845455', 'createdAt': ago(95), 'items': [{'productId': 4, 'name': 'Camphor Tablets 100g', 'qty': 5, 'price': 85}]},
    ],
  };
  return s;
}

Future<void> _shot(WidgetTester t, String name, Widget screen, {Size size = const Size(412, 900), AppState? state, String? section}) async {
  debugDisableShadows = false; // real soft shadows, as on a device
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  AppColors.useMobileStyle(size.width < 900); // as main.dart does on Android
  await t.pumpWidget(MultiProvider(providers: [ChangeNotifierProvider.value(value: state ?? _state()), ChangeNotifierProvider(create: (_) => section == null ? NavController() : (NavController()..go(section)))], child: MaterialApp(debugShowCheckedModeBanner: false, theme: buildTheme(), home: screen)));
  for (var i = 0; i < 5; i++) {
    await t.pump(const Duration(milliseconds: 200));
  }
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$name.png'));
  debugDisableShadows = true;
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await _fonts();
    final now = DateTime.now().toUtc().toIso8601String();
    await LocalStore.instance.write('report', {
      'rangeLabel': '26 Sep 2026', 'generatedAt': now,
      'business': {'name': 'Sri Andal Traders'},
      'kpis': {'sales': 2330, 'orders': 3, 'units': 7, 'due': 0, 'dueOrders': 0, 'collected': 0, 'collections': 0, 'productsAdded': 0, 'newDues': 0, 'newDueCount': 0, 'discount': 0, 'gst': 110.5, 'onlinePlaced': 1},
      'payments': [{'method': 'Cash', 'amount': 1830}, {'method': 'UPI', 'amount': 500}],
      'channels': {'offline': {'amount': 2330, 'orders': 3}, 'online': {'amount': 0, 'orders': 0}},
      'onlineStatus': [{'status': 'Pending', 'count': 0}, {'status': 'In Progress', 'count': 0}, {'status': 'Out for Delivery', 'count': 1}, {'status': 'Delivered', 'count': 0}, {'status': 'Canceled', 'count': 0}],
      'aging': [{'bucket': '0 – 30 days', 'amount': 0, 'orders': 0}, {'bucket': '31 – 60 days', 'amount': 0, 'orders': 0}, {'bucket': '61 – 90 days', 'amount': 0, 'orders': 0}, {'bucket': '90+ days', 'amount': 0, 'orders': 0}],
      'timeline': [
        {'at': now, 'orderNumber': 'ORD0000013', 'channel': 'offline', 'customer': 'Walk-in Customer', 'product': 'Hawan Samagri 500g', 'qty': 1, 'total': 300},
        {'at': now, 'orderNumber': 'ORD0000012', 'channel': 'offline', 'customer': 'Aman Kumar', 'product': 'Pure Cow Ghee 1L', 'qty': 2, 'total': 1300},
      ],
      'products': [{'name': 'Pure Cow Ghee 1L', 'sku': 'GH1L', 'orders': 1, 'qty': 2, 'revenue': 1300, 'lastSoldAt': now}, {'name': 'Hawan Samagri 500g', 'sku': 'HS500', 'orders': 1, 'qty': 1, 'revenue': 300, 'lastSoldAt': now}],
      'daily': [], 'collections': [], 'agents': [], 'staff': [], 'added': [], 'activity': [], 'staffList': [],
    });
    await LocalStore.instance.write('dashboard', {
      'today': '2026-09-26',
      'sales': {'today': 18450.5, 'count': 23, 'store': 12950.5, 'online': 5500, 'yesterday': 16100,
        'top': [{'productId': 1, 'name': 'Hawan Samagri 500g', 'qty': 34}, {'productId': 4, 'name': 'Camphor Tablets 100g', 'qty': 21}, {'productId': 2, 'name': 'Pure Cow Ghee 1L', 'qty': 9}],
        'methods': [{'method': 'Cash', 'amount': 9800}, {'method': 'UPI', 'amount': 6650.5}, {'method': 'Card', 'amount': 2000}],
        'week': [
        for (final (i, v) in [9800, 14200, 11050, 16400, 12900, 21500, 18450.5].indexed) {'day': '2026-09-${20 + i}', 'sales': v, 'orders': 10 + i}
      ]},
      'orders': {'pending': 4, 'inProgress': 2, 'outForDelivery': 3, 'placedToday': 9, 'recent': [
        {'id': 17, 'number': 'ORD0000010', 'customer': 'Sujata Kumari', 'total': 1049, 'status': 'Pending', 'createdAt': DateTime.now().toUtc().toIso8601String()},
        {'id': 16, 'number': 'ORD0000009', 'customer': 'Sujata Kumari', 'total': 500, 'status': 'Out for Delivery', 'createdAt': DateTime.now().toUtc().toIso8601String()},
      ]},
      'dues': {'outstanding': 12900.01, 'open': 7, 'collectedToday': 2100, 'collections': 3, 'top': [
        {'customerId': 2, 'customer': 'Nitu Devi', 'balance': 900.01}, {'customerId': 5, 'customer': 'Ramesh Prasad', 'balance': 4200}, {'customerId': 6, 'customer': 'Geeta Store', 'balance': 2750.5}]},
      'stock': {'low': 5, 'out': 2, 'products': 148, 'lowList': [
        {'id': 3, 'name': 'Cotton T-shirt (Saffron)', 'stock': 0}, {'id': 2, 'name': 'Pure Cow Ghee 1L', 'stock': 3, 'unit': 'Litre'}, {'id': 7, 'name': 'Diya (pack of 12)', 'stock': 4}]},
    });
  });
  tearDown(() {});

  const desktop = Size(1440, 900);
  testWidgets('login phone', (t) => _shot(t, 'login_phone', const LoginScreen()));
  testWidgets('login desktop', (t) => _shot(t, 'login_desktop', const LoginScreen(), size: desktop));
  testWidgets('home phone', (t) => _shot(t, 'home_phone', const Shell()));
  testWidgets('home desktop', (t) => _shot(t, 'home_desktop', const Shell(), size: desktop));
  testWidgets('pos desktop', (t) async {
    final s = _state();
    await _shot(t, 'pos_desktop_empty', const Shell(), size: desktop, state: s, section: 'pos');
  });
  testWidgets('orders phone', (t) => _shot(t, 'orders_phone', const OrdersScreen()));
  testWidgets('order detail desktop', (t) => _shot(t, 'order_detail_desktop', const OrderDetailScreen(orderId: 17), size: desktop));
  testWidgets('order detail phone', (t) => _shot(t, 'order_detail_phone', const OrderDetailScreen(orderId: 17)));
  testWidgets('products phone', (t) => _shot(t, 'products_phone', const ProductsScreen()));
  testWidgets('product edit desktop', (t) => _shot(t, 'product_edit_desktop', ProductEditScreen(product: _state().list('products').first), size: desktop));
  testWidgets('customer profile phone', (t) => _shot(t, 'customer_profile_phone', const CustomerProfile(id: 2)));
  testWidgets('dues phone', (t) => _shot(t, 'dues_phone', const DuesScreen()));
  testWidgets('agent phone', (t) => _shot(t, 'agent_home_phone', const Shell(), state: _state(role: 'delivery_agent', perms: {'delivery': {'deliver': true}, 'dashboard_access': true})));
  for (final x in ['products', 'categories', 'customers', 'dues', 'board', 'staff']) {
    testWidgets('$x web', (t) => _shot(t, '${x}_web', const Shell(), size: desktop, section: x));
  }
  for (final x in ['reports', 'account']) {
    testWidgets('$x web', (t) => _shot(t, '${x}_web', const Shell(), size: desktop, section: x));
  }
  testWidgets('customer profile desktop', (t) => _shot(t, 'customer_profile_desktop', const CustomerProfile(id: 2), size: desktop));
  testWidgets('desktop sidebar opens every page', (t) async {
    debugDisableShadows = false;
    t.view.physicalSize = desktop;
    t.view.devicePixelRatio = 1;
    AppColors.useMobileStyle(false);
    await t.pumpWidget(MultiProvider(providers: [ChangeNotifierProvider.value(value: _state()), ChangeNotifierProvider(create: (_) => NavController())], child: MaterialApp(theme: buildTheme(), home: const Shell())));
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('E-commerce Dashboard'), findsOneWidget);
    for (final (menu, title) in [('Orders', 'All Orders'), ('Products', 'All Products'), ('Due Payments', 'Due'), ('Customers', 'Customers'), ('Staff & Roles', 'Users Manager'), ('Dashboard', 'E-commerce Dashboard')]) {
      await t.tap(find.text(menu).first);
      for (var i = 0; i < 4; i++) {
        await t.pump(const Duration(milliseconds: 150));
      }
      expect(find.text(title), findsWidgets, reason: 'sidebar "$menu" should open "$title"');
    }
    debugDisableShadows = true;
  });
  testWidgets('product add phone', (t) => _shot(t, 'product_add_phone', const ProductEditScreen(), size: const Size(412, 2600)));
  testWidgets('product add desktop', (t) => _shot(t, 'product_add_desktop', const ProductEditScreen(), size: const Size(1440, 1500)));
  testWidgets('orders desktop', (t) => _shot(t, 'orders_desktop', const Shell(), size: desktop, section: 'orders'));
  testWidgets('categories phone', (t) => _shot(t, 'categories_phone', const CategoriesScreen()));
  testWidgets('account phone', (t) => _shot(t, 'account_phone', const AccountScreen()));
  testWidgets('my deliveries phone', (t) => _shot(t, 'my_deliveries_phone', const MyDeliveriesScreen(), state: _state(role: 'delivery_agent', perms: {'delivery': {'deliver': true}, 'dashboard_access': true})));
}
