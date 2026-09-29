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
import 'package:sri_staff/features/native/catalog_pages.dart';
import 'package:sri_staff/features/native/customizer_page.dart';
import 'package:sri_staff/features/native/sales_pages.dart';
import 'package:sri_staff/features/dues/dues_screen.dart';
import 'package:sri_staff/features/login/login_screen.dart';
import 'package:sri_staff/features/orders/order_detail_screen.dart';
import 'package:sri_staff/features/orders/orders_screen.dart';
import 'package:sri_staff/features/products/product_edit_screen.dart';
import 'package:sri_staff/features/products/products_screen.dart';
import 'package:sri_staff/features/shell/shell.dart';
import 'package:sri_staff/desktop/analytics_web.dart';
import 'package:sri_staff/desktop/barcodes_web.dart';
import 'package:sri_staff/desktop/business_web.dart';
import 'package:sri_staff/desktop/catalog_web.dart';
import 'package:sri_staff/desktop/categories_web.dart';
import 'package:sri_staff/desktop/offers_web.dart';
import 'package:sri_staff/desktop/push_web.dart';
import 'package:sri_staff/desktop/tax_web.dart';
import 'package:sri_staff/desktop/sales_history_web.dart';
import 'package:sri_staff/desktop/stock_out_web.dart';

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
  s.pageData = {for (final e in _pages.entries) e.key: Map<String, dynamic>.from(e.value)};
  s.perms = Perms(perms ?? _all(true), role);
  s.sets = {
    'settings': {'businessName': 'Sri Andal Traders', 'address': 'Main Road, Narkatiaganj', 'phones': ['9876543210'], 'printerFormat': 'thermal_80',
      'badges': [{'slug': 'best', 'label': 'Bestseller', 'color': '#16a34a'}, {'slug': 'new', 'label': 'New', 'color': '#2563eb'}],
      'itemTypes': [{'slug': 'normal', 'label': 'Normal'}, {'slug': 'combo', 'label': 'Combo Pack'}]},
    'categories': [{'id': 1, 'name': 'Pooja Items', 'status': 'active'}, {'id': 2, 'name': 'T-shirts', 'status': 'active'}],
    'brands': [{'id': 1, 'name': 'Sri Andal', 'status': 'active'}],
    'products': [
      {'id': 1, 'name': 'Hawan Samagri 500g', 'sku': 'HS500', 'barcode': '8901001', 'price': 120, 'salePrice': 99, 'gstRate': 5, 'stock': 42, 'unit': 'Packet', 'categoryId': 1, 'status': 'active', 'type': 'physical', 'badgeTag': 'best', 'itemType': 'normal'},
      {'id': 2, 'name': 'Pure Cow Ghee 1L', 'sku': 'GH1L', 'barcode': '8901002', 'price': 650, 'salePrice': null, 'gstRate': 12, 'stock': 3, 'unit': 'Litre', 'categoryId': 1, 'status': 'active', 'type': 'physical'},
      {'id': 3, 'name': 'Cotton T-shirt (Saffron)', 'sku': 'TS01', 'barcode': '8901003', 'price': 399, 'salePrice': 299, 'gstRate': 5, 'stock': 0, 'categoryId': 2, 'status': 'inactive', 'type': 'physical', 'badgeTag': 'new', 'itemType': 'combo'},
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
      {'id': 21, 'number': 'ORD0000011', 'type': 'online', 'status': 'Delivered', 'paymentStatus': 'Paid', 'paymentMethod': 'Split', 'customer': 'Rohit Mehta', 'total': 450, 'agentId': 1, 'address': 'Station Road, Narkatiaganj', 'createdAt': ago(300), 'deliveredAt': ago(30), 'items': [], 'pays': [{'method': 'UPI', 'amount': 250, 'at': ago(30)}, {'method': 'Cash', 'amount': 200, 'at': ago(30)}]},
      {'id': 16, 'number': 'ORD0000009', 'type': 'online', 'status': 'Out for Delivery', 'paymentStatus': 'Unpaid', 'paymentMethod': 'COD', 'customer': 'Sujata Kumari', 'phone': '9973007123', 'total': 500, 'subtotal': 500, 'discount': 0, 'gst': 0, 'due': 0, 'agentId': 1, 'address': 'Near Shiv Mandir, Narkatiaganj - 845455', 'createdAt': ago(95), 'items': [{'productId': 4, 'name': 'Camphor Tablets 100g', 'qty': 5, 'price': 85}]},
    ],
  };
  return s;
}

Future<void> _shot(WidgetTester t, String name, Widget screen, {Size size = const Size(412, 900), AppState? state, String? section, Future<void> Function(WidgetTester)? after}) async {
  debugDisableShadows = false; // real soft shadows, as on a device
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  AppColors.useMobileStyle(size.width < 900); // as main.dart does on Android
  await t.pumpWidget(MultiProvider(providers: [ChangeNotifierProvider.value(value: state ?? _state()), ChangeNotifierProvider(create: (_) => section == null ? NavController() : (NavController()..go(section)))], child: MaterialApp(debugShowCheckedModeBanner: false, theme: buildTheme(), home: screen)));
  for (var i = 0; i < 5; i++) {
    await t.pump(const Duration(milliseconds: 200));
  }
  if (after != null) await after(t);
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$name.png'));
  debugDisableShadows = true;
}

/// Page data (what the app downloads in the background), given to every test state.
final _pages = <String, Map<String, dynamic>>{};
Future<void> _page(String name, Map<String, dynamic> v) async {
  _pages[name] = v;
  await LocalStore.instance.write('page:$name', v);
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await _fonts();
    final now = DateTime.now().toUtc().toIso8601String();
    final at = DateTime.now().toUtc().toIso8601String();
    await _page('brands', {'at': at, 'data': [
      {'id': 1, 'name': 'Patanjali', 'slug': 'patanjali', 'logo': null, 'isPopular': true, 'status': 'active', 'products': 30},
      {'id': 2, 'name': 'Dabur', 'slug': 'dabur', 'logo': null, 'isPopular': false, 'status': 'inactive', 'products': 0},
    ]});
    await _page('tags', {'at': at, 'data': [
      {'id': 1, 'label': 'Best Seller', 'slug': 'best-seller', 'tagGroup': 'badge', 'color': '#DC2626', 'sortOrder': 0, 'status': 'active', 'products': 4, 'activeProducts': 4, 'unitsSold': 38, 'revenue': 9120, 'orders': 20, 'unitsSoldAllTime': 60},
      {'id': 2, 'label': 'New', 'slug': 'new', 'tagGroup': 'badge', 'color': '#16A34A', 'sortOrder': 1, 'status': 'active', 'products': 0, 'activeProducts': 0, 'unitsSold': 0, 'revenue': 0, 'orders': 0, 'unitsSoldAllTime': 0},
      {'id': 3, 'label': 'Combo Pack', 'slug': 'combo', 'tagGroup': 'item_type', 'color': null, 'sortOrder': 0, 'status': 'inactive', 'products': 2, 'activeProducts': 2, 'unitsSold': 5, 'revenue': 1500, 'orders': 5, 'unitsSoldAllTime': 5},
    ]});
    await _page('reviews', {'at': at, 'data': {'rows': [
      {'id': 1, 'productId': 1, 'productName': 'Hawan Samagri 500g', 'productImage': null, 'categoryId': 1, 'categoryName': 'Puja Items', 'customerName': 'Sujata Kumari', 'customerPhone': '9876543210', 'orderNumber': 'ORD0000009', 'rating': 5, 'reviewText': 'Very good quality, fresh smell.', 'status': 'pending', 'createdAt': now},
      {'id': 2, 'productId': 2, 'productName': 'Pure Cow Ghee 1L', 'productImage': null, 'categoryId': 2, 'categoryName': 'Grocery', 'customerName': 'Aman Kumar', 'customerPhone': null, 'rating': 2, 'reviewText': null, 'status': 'approved', 'createdAt': now},
    ], 'spread': []}});
    await _page('campaigns', {'at': at, 'data': {
      'campaigns': [
        {'id': 1, 'name': 'Navratri Sale', 'scope': 'category', 'discountType': 'percent', 'discountValue': 10, 'startsAt': '2026-09-20T00:00:00.000Z', 'endsAt': '2026-10-05T18:29:00.000Z', 'isPaused': false, 'createdAt': '2026-09-19T10:00:00.000Z', 'targets': [{'type': 'category', 'id': 1, 'fixedPrice': null}], 'stats': {'orders': 12, 'units': 30, 'revenue': 5400, 'discount': 600}},
        {'id': 2, 'name': 'Ghee Weekend', 'scope': 'product', 'discountType': 'amount', 'discountValue': 50, 'startsAt': '2026-08-01T00:00:00.000Z', 'endsAt': '2026-08-03T18:29:00.000Z', 'isPaused': false, 'createdAt': '2026-07-30T10:00:00.000Z', 'targets': [{'type': 'product', 'id': 2, 'fixedPrice': null}], 'stats': {'orders': 0, 'units': 0, 'revenue': 0, 'discount': 0}},
      ],
      'offers': [{'productId': 1, 'campaignId': 1, 'campaignName': 'Navratri Sale', 'unitPrice': 108, 'beforePrice': 120}],
      'range': {'orders': 12, 'units': 30, 'revenue': 5400, 'discount': 600},
      'chart': {'granularity': 'day', 'points': [for (var i = 1; i <= 28; i++) {'key': '$i', 'label': '$i Sep', 'revenue': (i * 37) % 400, 'units': i % 5, 'discount': 10, 'orders': 1}]},
    }});
    await _page('coupons', {'at': at, 'data': [
      {'id': 1, 'code': 'WELCOME10', 'title': 'Welcome Offer', 'discountType': 'percentage', 'discountValue': 10, 'appliesTo': 'all', 'target': null, 'limit': 100, 'used': 14, 'status': 'active', 'paused': false, 'startsAt': null, 'endsAt': null, 'createdAt': at},
      {'id': 2, 'code': 'DIWALI50', 'title': 'Diwali', 'discountType': 'fixed', 'discountValue': 50, 'appliesTo': 'category', 'target': 'Pooja Items', 'limit': 50, 'used': 0, 'status': 'active', 'paused': true, 'startsAt': '2026-10-20T00:00:00.000Z', 'endsAt': '2026-11-02T18:29:00.000Z', 'createdAt': at},
    ]});
    await _page('coupon_activity', {'at': at, 'data': [{'id': 1, 'action': 'create', 'description': 'Created coupon WELCOME10', 'byUsername': 'arjun', 'createdAt': at}]});
    await _page('push', {'at': at, 'data': {
      'configured': true, 'subscribers': 42, 'campaigns': 2, 'sent': 70, 'failed': 4, 'canManage': true, 'newThisWeek': 5,
      'breakdown': [{'browser': 'chrome', 'label': 'Chrome / Android', 'count': 38}, {'browser': 'firefox', 'label': 'Firefox', 'count': 3}, {'browser': 'safari', 'label': 'Safari / iOS', 'count': 1}, {'browser': 'edge', 'label': 'Edge (legacy)', 'count': 0}, {'browser': 'other', 'label': 'Other', 'count': 0}],
      'subscriberRows': [{'id': 9, 'host': 'fcm.googleapis.com', 'browser': 'chrome', 'browserLabel': 'Chrome / Android', 'createdAt': at}],
      'history': [{'id': 2, 'title': '🔥 Navratri Sale is live', 'body': 'Prices already dropped', 'image': null, 'url': 'https://sriandaltraders.co.in/', 'status': 'processing', 'totalSubscribers': 42, 'sent': 30, 'failed': 1, 'createdAt': at}],
      'keys': {'publicKey': 'BExamplePublicKey', 'subject': 'mailto:shop@example.com', 'hasPrivateKey': true, 'publicFingerprint': 'a1b2c3', 'privateFingerprint': 'd4e5f6'},
    }});
    await _page('business', {'at': at, 'data': {'business': {'businessName': 'Sri Andal Traders', 'tagline': 'Puja & grocery', 'address': 'Ward 4, Narkatiaganj', 'contactNumbers': ['7632096003', '9876543210'], 'invoiceContactNumbers': ['7632096003'], 'socialMediaJson': [{'platform': 'facebook', 'url': 'https://facebook.com/sri'}]}, 'delivery': {}, 'invoice': {'defaultPrint': 'ask', 'thermalTemplate': 'classic', 'thermalWidth': '80mm', 'thermalFont': 'md', 'accent': '#9f2089', 'title': 'Tax Invoice', 'showName': true, 'showLogo': true, 'logoWidth': 120, 'showInvoiceNo': true, 'showDate': true, 'address': {'show': true, 'value': ''}, 'extraIds': [], 'footerNote': 'Thank you, visit again!'}, 'tax': {'pricesIncludeTax': true}, 'gstRates': [
      {'id': 1, 'label': 'GST 0%', 'rate': 0, 'isDefault': true}, {'id': 2, 'label': 'GST 5%', 'rate': 5, 'isDefault': false}, {'id': 3, 'label': 'GST 18%', 'rate': 18, 'isDefault': false},
    ]}});
    await _page('customizer', {'at': at, 'data': {
      'canStore': true, 'unpublished': false, 'header': {'showLocation': true, 'showDeliveryInfo': true, 'deliveryLabel': "We're open", 'deliveryTimeText': '', 'searchPlaceholder': 'Search for products'},
      'store': {'headerMenu': [{'id': 'h1', 'label': 'Home', 'href': '/', 'icon': 'home', 'visibility': 'all', 'enabled': true, 'newTab': false, 'autoCategories': false, 'children': []}], 'sidebarMenu': [], 'menuDesign': {'accent': '#9f2089', 'showIcons': true, 'dividers': true}, 'push': {'showBell': true, 'autoPrompt': true}, 'footer': {'columns': []}},
      'product': {'accent': '#9f2089', 'order': ['gallery', 'info', 'sizes', 'reviews', 'actions', 'related'], 'hidden': [], 'info': {}, 'sizes': {'title': 'Select Size', 'showPrice': true}, 'actions': {}, 'reviews': {}, 'related': {}, 'cart': {}},
      'home': {'accent': '#9f2089', 'bottomNav': true, 'promo': {'enabled': true, 'title': 'Extra 10% Off', 'subtitle': 'Online Order Acceptable'}, 'strip': {'enabled': true, 'text': 'Free delivery above ₹500', 'href': '/'}, 'card': {'showWishlist': true, 'showRating': true},
        'blocks': [{'id': 'b1', 'type': 'categories', 'enabled': true, 'source': 'all', 'slugs': [], 'limit': 12, 'showAllButton': true}, {'id': 'b2', 'type': 'feed', 'enabled': true, 'title': 'Products For You', 'showSort': true, 'showCategory': true, 'showBrand': true, 'showFilters': true}]},
    }});
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
  const wideSize = Size(1440, 900);
  testWidgets('native stock out web', (t) => _shot(t, 'n_stockout_web', const StockOutWeb(), size: wideSize));
  testWidgets('native brands web', (t) => _shot(t, 'n_brands_web', const BrandsWeb(), size: wideSize));
  testWidgets('native tags web', (t) => _shot(t, 'n_tags_web', const TagsWeb(), size: wideSize));
  testWidgets('native reviews web', (t) => _shot(t, 'n_reviews_web', const ReviewsWeb(), size: wideSize));
  testWidgets('native barcodes web', (t) => _shot(t, 'n_barcodes_web', const BarcodesWeb(ids: [1, 2]), size: wideSize));
  testWidgets('native categories web', (t) => _shot(t, 'n_categories_web', const CategoriesWeb(), size: wideSize));
  testWidgets('native offers web', (t) => _shot(t, 'n_offers_web', const OffersWeb(), size: wideSize));
  testWidgets('native coupons web', (t) => _shot(t, 'n_coupons_web', const OffersWeb(), size: wideSize, after: (t) async {
        await t.tap(find.text('Coupons').first);
        await t.pump(const Duration(milliseconds: 300));
      }));
  testWidgets('native push web', (t) => _shot(t, 'n_push_web', const PushWeb(), size: wideSize, after: (t) async {
        await t.enterText(find.byType(TextField).at(1), '✨ New arrival: Pure Cow Ghee 1L');
        await t.pump(const Duration(milliseconds: 300));
      }));
  testWidgets('native push history web', (t) => _shot(t, 'n_push_history_web', const PushWeb(), size: wideSize, after: (t) async {
        await t.tap(find.text('History').first);
        await t.pump(const Duration(milliseconds: 300));
      }));
  testWidgets('native analytics web', (t) => _shot(t, 'n_analytics_web', const AnalyticsWeb(), size: wideSize));
  testWidgets('native tax web', (t) => _shot(t, 'n_tax_web', const TaxWeb(), size: wideSize));
  testWidgets('native business web', (t) => _shot(t, 'n_business_web', const BusinessWeb(), size: wideSize));
  testWidgets('native invoice settings web', (t) => _shot(t, 'n_invoice_web', const BusinessWeb(section: 'invoice'), size: wideSize));
  testWidgets('native sales history web', (t) => _shot(t, 'n_sales_web', const SalesHistoryWeb(), size: wideSize, after: (t) async {
        await t.tap(find.text('This Month').first);
        await t.pump(const Duration(milliseconds: 300));
      }));
  testWidgets('native gst web', (t) => _shot(t, 'n_gst_web', const GstReportPage(), size: wideSize));
  testWidgets('native analytics phone', (t) => _shot(t, 'n_analytics_phone', const AnalyticsPage()));
  testWidgets('native customizer web', (t) => _shot(t, 'n_customizer_web', const CustomizerPage(), size: wideSize));
  testWidgets('native brands phone', (t) => _shot(t, 'n_brands_phone', const BrandsPage()));
  testWidgets('agent phone', (t) => _shot(t, 'agent_home_phone', const Shell(), state: _state(role: 'delivery_agent', perms: {'delivery': {'deliver': true}, 'dashboard_access': true})));
  Future<void> tapTab(WidgetTester t, String label) async {
    await t.tap(find.text(label).last);
    for (var i = 0; i < 4; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
  }
  AppState agent() => _state(role: 'delivery_agent', perms: {'delivery': {'deliver': true}, 'dashboard_access': true});
  testWidgets('agent orders phone', (t) => _shot(t, 'agent_orders_phone', const Shell(), state: agent(), after: (t) => tapTab(t, 'Orders')));
  testWidgets('agent order details phone', (t) => _shot(t, 'agent_order_phone', const Shell(), state: agent(), after: (t) async {
        await tapTab(t, 'Orders');
        await tapTab(t, 'Sujata Kumari');
      }));
  testWidgets('agent deliver phone', (t) => _shot(t, 'agent_deliver_phone', const Shell(), state: agent(), after: (t) async {
        await tapTab(t, 'Orders');
        await tapTab(t, 'Sujata Kumari');
        await tapTab(t, 'Deliver');
      }));
  testWidgets('agent history phone', (t) => _shot(t, 'agent_history_phone', const Shell(), state: agent(), after: (t) => tapTab(t, 'History')));
  testWidgets('agent report phone', (t) => _shot(t, 'agent_report_phone', const Shell(), state: agent(), after: (t) => tapTab(t, 'Report')));
  testWidgets('agent profile phone', (t) => _shot(t, 'agent_profile_phone', const Shell(), state: agent(), after: (t) => tapTab(t, 'Profile')));
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
  testWidgets('dialog desktop', (t) async {
    await _shot(t, 'dialog_desktop', Builder(builder: (c) => Scaffold(body: Center(child: FilledButton(onPressed: () => editCustomer(c, null), child: const Text('open'))))), size: const Size(1100, 700), after: (t) async {
      await t.tap(find.text('open'));
      for (var i = 0; i < 4; i++) {
        await t.pump(const Duration(milliseconds: 100));
      }
    });
  });
  testWidgets('orders desktop', (t) => _shot(t, 'orders_desktop', const Shell(), size: desktop, section: 'orders'));
  testWidgets('categories phone', (t) => _shot(t, 'categories_phone', const CategoriesScreen()));
  testWidgets('account phone', (t) => _shot(t, 'account_phone', const AccountScreen()));
  testWidgets('my deliveries phone', (t) => _shot(t, 'my_deliveries_phone', const MyDeliveriesScreen(), state: _state(role: 'delivery_agent', perms: {'delivery': {'deliver': true}, 'dashboard_access': true})));
}
