import 'package:flutter/material.dart';

import 'catalog_pages.dart';
import 'customizer_page.dart';
import 'sales_pages.dart';
import 'settings_pages.dart';

/// Website menu links that open the app's own page (works offline) instead of the website.
Widget Function()? nativePageFor(String href) => switch (href) {
      '/admin/ecommerce/stock-out-products' => () => const StockOutPage(),
      '/admin/ecommerce/brands' => () => const BrandsPage(),
      '/admin/ecommerce/product-tags' => () => const TagsPage(),
      '/admin/ecommerce/product-reviews' => () => const ReviewsPage(),
      '/admin/ecommerce/barcode-print' => () => const BarcodePrintPage(),
      '/admin/ecommerce/sales-history' => () => const SalesHistoryPage(),
      '/admin/ecommerce/analytics' => () => const AnalyticsPage(),
      '/admin/ecommerce/gst-report' => () => const GstReportPage(),
      '/admin/ecommerce/offers' => () => const OffersPage(),
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
