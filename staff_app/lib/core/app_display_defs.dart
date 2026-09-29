import '../ds/display_options.dart';

/// Display Options for pages the website has no options for (so every page in the app has them).
const appDisplayDefs = <String, DisplayDef>{
  'app_gst_display': DisplayDef('app_gst_display', [
    DisplayGroup('gst-filters', 'Filters', [('gst-f-period', 'Period buttons'), ('gst-f-channel', 'All / Store / Online'), ('gst-f-dates', 'Date line')]),
    DisplayGroup('gst-cards', 'Summary Cards', [('gst-k-invoices', 'Invoices'), ('gst-k-taxable', 'Taxable value'), ('gst-k-gst', 'Total GST'), ('gst-k-value', 'Invoice value')]),
    DisplayGroup('gst-tabs', 'Report tabs', [('gst-t-rate', 'Rate-wise'), ('gst-t-hsn', 'HSN-wise'), ('gst-t-product', 'Product-wise'), ('gst-t-invoice', 'Invoice-wise')]),
  ], []),
  'app_backup_display': DisplayDef('app_backup_display', [
    DisplayGroup('bk-table', 'Backups Table', [('bk-c-size', 'Size'), ('bk-c-made', 'Made'), ('bk-c-actions', 'Actions')]),
  ], [('bk-progress', 'Progress card'), ('bk-note', 'Upload / download note')]),
  'app_staffapp_display': DisplayDef('app_staffapp_display', [], [('sa-version', 'This device'), ('sa-install', 'Install on another device')]),
};
