import 'package:flutter/material.dart';

import '../../desktop/catalog_web.dart';
import '../../desktop/offers_web.dart';
import '../../desktop/stock_out_web.dart';
import '../../desktop/sales_history_web.dart';
import '../../widgets/web.dart' show Responsive;

import 'catalog_pages.dart';
import 'customizer_page.dart';
import 'sales_pages.dart';
import 'settings_pages.dart';

/// Website menu links that open the app's own page (works offline) instead of the website.
Widget Function()? nativePageFor(String href) => switch (href) {
      '/admin/ecommerce/stock-out-products' => () => const Responsive(phone: StockOutPage(), desktop: StockOutWeb()),
      '/admin/ecommerce/brands' => () => const Responsive(phone: BrandsPage(), desktop: BrandsWeb()),
      '/admin/ecommerce/product-tags' => () => const Responsive(phone: TagsPage(), desktop: TagsWeb()),
      '/admin/ecommerce/product-reviews' => () => const Responsive(phone: ReviewsPage(), desktop: ReviewsWeb()),
      '/admin/ecommerce/barcode-print' => () => const BarcodePrintPage(),
      '/admin/ecommerce/sales-history' => () => const Responsive(phone: SalesHistoryPage(), desktop: SalesHistoryWeb()),
      '/admin/ecommerce/analytics' => () => const AnalyticsPage(),
      '/admin/ecommerce/gst-report' => () => const GstReportPage(),
      '/admin/ecommerce/offers' => () => const Responsive(phone: OffersPage(), desktop: OffersWeb()),
      '/push-notifications/push-manager2' => () => const PushPage(),
      '/admin/ecommerce/business-settings' => () => const BusinessSettingsPage(),
      '/admin/ecommerce/tax-settings' => () => const BusinessSettingsPage(section: 'tax'),
      '/admin/pages' => () => const StaticPagesPage(),
      '/admin/file-manager' => () => const FilesPage(),
      '/admin/activity-logs' => () => const ActivityPage(),
      '/admin/cache-manager' => () => const CachePage(),
      '/admin/backup' => () => const BackupPage(),
      '/admin/staff-app' => () => const StaffAppPage(),
      '/admin/customizer' || '/admin/customizer?tab=home' => () => const CustomizerPage(),
      '/admin/customizer?tab=product' => () => const CustomizerPage(tab: 'product'),
      '/admin/customizer?tab=header' => () => const CustomizerPage(tab: 'header'),
      '/admin/customizer?tab=footer' => () => const CustomizerPage(tab: 'footer'),
      _ => null,
    };
