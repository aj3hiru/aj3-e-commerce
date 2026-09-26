import 'dart:io';

import 'package:excel/excel.dart' as xl;
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/format.dart';
import '../../widgets/common.dart';

String _fileBase(Map<String, dynamic> r) {
  final f = r['filters'] as Map? ?? {};
  final who = r['selectedUser'] != null ? '${r['selectedUser']['name']}-' : '';
  return '${'${r['business']?['name'] ?? 'Store'}'.replaceAll(RegExp(r'[^\w]+'), '-')}-${who.replaceAll(RegExp(r'[^\w-]+'), '-')}Report-${f['from']}${f['to'] != f['from'] ? '-to-${f['to']}' : ''}';
}

/// Saves a file: a save dialog on Windows, the share sheet on Android.
Future<void> _deliver(BuildContext context, Uint8List bytes, String name, String mime) async {
  if (Platform.isWindows) {
    final loc = await getSaveLocation(suggestedName: name);
    if (loc == null) return;
    await File(loc.path).writeAsBytes(bytes, flush: true);
    if (context.mounted) toast(context, 'Saved: ${loc.path}');
    return;
  }
  final dir = await getTemporaryDirectory();
  final f = File('${dir.path}/$name');
  await f.writeAsBytes(bytes, flush: true);
  await SharePlus.instance.share(ShareParams(files: [XFile(f.path, mimeType: mime)], subject: name));
}

Future<void> exportReportPdf(BuildContext context, Map<String, dynamic> r) async {
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/Inter-Regular.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/Inter-Bold.ttf'));
  final t = pw.TextStyle(font: regular, fontBold: bold, fontSize: 8.5);
  final b = t.copyWith(font: bold);
  final k = (r['kpis'] as Map?) ?? {};
  final biz = (r['business'] as Map?) ?? {};
  final doc = pw.Document(title: _fileBase(r));

  pw.Widget table(String title, List<String> head, List<List<String>> rows) => rows.isEmpty
      ? pw.SizedBox()
      : pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.SizedBox(height: 10),
          pw.Text(title, style: b.copyWith(fontSize: 11, color: PdfColor.fromHex('#6d28d9'))),
          pw.SizedBox(height: 4),
          pw.TableHelper.fromTextArray(
            headers: head, data: rows, headerStyle: b, cellStyle: t, headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF3F4F6)),
            cellPadding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 3), border: pw.TableBorder.all(color: PdfColor.fromInt(0xFFE5E7EB), width: .5),
          ),
        ]);

  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4.copyWith(marginLeft: 28, marginRight: 28, marginTop: 28, marginBottom: 28),
    header: (c) => pw.Container(
      padding: const pw.EdgeInsets.only(bottom: 8),
      decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: PdfColor.fromInt(0xFFD1D5DB), width: .6))),
      child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Expanded(
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('${biz['name'] ?? ''}', style: b.copyWith(fontSize: 15, color: PdfColor.fromHex('#6d28d9'))),
            if (biz['address'] != null) pw.Text('${biz['address']}', style: t),
            if ((biz['phones'] as List?)?.isNotEmpty ?? false) pw.Text('Mobile: ${(biz['phones'] as List).join(', ')}', style: t),
          ]),
        ),
        pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
          pw.Text(r['selectedUser'] != null ? 'Staff Report · ${r['selectedUser']['name']}' : 'Sales Report', style: b.copyWith(fontSize: 13)),
          pw.Text('${r['rangeLabel']}', style: t.copyWith(fontSize: 10)),
          pw.Text('Generated ${dateTime(r['generatedAt'])}', style: t),
        ]),
      ]),
    ),
    footer: (c) => pw.Align(alignment: pw.Alignment.centerRight, child: pw.Text('Page ${c.pageNumber} of ${c.pagesCount}', style: t.copyWith(fontSize: 7.5))),
    build: (c) => [
      pw.SizedBox(height: 8),
      pw.Row(children: [
        for (final (l, v) in [('Total sales', money(k['sales'])), ('Orders', '${k['orders']}'), ('Units sold', '${k['units']}'), ('Total dues', money(k['due'])), ('Due collected', money(k['collected']))])
          pw.Expanded(
            child: pw.Container(
              margin: const pw.EdgeInsets.only(right: 6), padding: const pw.EdgeInsets.all(6),
              decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColor.fromInt(0xFFE5E7EB), width: .6), borderRadius: pw.BorderRadius.circular(4)),
              child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [pw.Text(l, style: t.copyWith(fontSize: 7.5)), pw.Text(v, style: b.copyWith(fontSize: 11))]),
            ),
          ),
      ]),
      table('Payment summary', ['Method', 'Amount'], [for (final p in ((r['payments'] as List?) ?? const []).cast<Map>()) ['${p['method']}', money(p['amount'])]]),
      table('Product-wise sales timeline', ['Time', 'Order', 'Channel', 'Customer', 'Product', 'Qty', 'Price', 'Total', 'Due'], [
        for (final x in ((r['timeline'] as List?) ?? const []).cast<Map>())
          [dateTime(x['at']), '${x['orderNumber']}', x['channel'] == 'online' ? 'Online' : 'Store', '${x['customer']}', '${x['product']}', '${x['qty']}', money(x['unitPrice']), money(x['total']), x['due'] == null ? '' : money(x['due'])],
      ]),
      table('Product summary', ['Product', 'SKU', 'Orders', 'Qty', 'Revenue'], [for (final x in ((r['products'] as List?) ?? const []).cast<Map>()) ['${x['name']}', '${x['sku'] ?? ''}', '${x['orders']}', '${x['qty']}', money(x['revenue'])]]),
      table('Due collections', ['Time', 'Receipt', 'Customer', 'Method', 'Amount', 'By'], [for (final x in ((r['collections'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), '${x['receipt']}', '${x['customer']}', '${x['method']}', money(x['amount']), '${x['by'] ?? ''}']]),
      table('New dues', ['Time', 'Order', 'Customer', 'Amount', 'Balance'], [for (final x in ((r['newDues'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), '${x['orderNumber']}', '${x['customer']}', money(x['amount']), money(x['balance'])]]),
      table('Products added', ['Time', 'Product', 'Price', 'Stock', 'By'], [for (final x in ((r['added'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), '${x['name']}', money(x['price']), '${x['stock'] ?? ''}', '${x['by'] ?? ''}']]),
      table('Deliveries by agent', ['Agent', 'Assigned', 'Delivered', 'Pending', 'Value'], [for (final x in ((r['agents'] as List?) ?? const []).cast<Map>()) ['${x['name']}', '${x['assigned']}', '${x['delivered']}', '${x['pending']}', money(x['deliveredValue'])]]),
      table('Staff performance', ['Staff', 'Role', 'Store sales', 'Amount', 'Collected', 'Delivered', 'Added'], [
        for (final x in ((r['staff'] as List?) ?? const []).cast<Map>()) ['${x['name']}', '${x['role']}', '${x['posSales']}', money(x['posAmount']), money(x['collectedAmount']), '${x['delivered']}', '${x['productsAdded']}'],
      ]),
    ],
  ));
  final bytes = await doc.save();
  if (!context.mounted) return;
  await Printing.layoutPdf(name: _fileBase(r), onLayout: (_) async => bytes); // print or "Save as PDF" / share
}

Future<void> exportReportExcel(BuildContext context, Map<String, dynamic> r) async {
  final book = xl.Excel.createExcel();
  void sheet(String name, List<String> head, List<List<Object?>> rows) {
    final s = book[name];
    s.appendRow([for (final h in head) xl.TextCellValue(h)]);
    for (final row in rows) {
      s.appendRow([for (final c in row) c is num ? xl.DoubleCellValue(c.toDouble()) : xl.TextCellValue('${c ?? ''}')]);
    }
  }

  final k = (r['kpis'] as Map?) ?? {};
  sheet('Summary', ['Item', 'Value'], [
    ['Business', r['business']?['name']], ['Period', r['rangeLabel']], ['Total sales', toDouble(k['sales'])], ['Orders', toDouble(k['orders'])], ['Units sold', toDouble(k['units'])],
    ['Total dues', toDouble(k['due'])], ['Due collected', toDouble(k['collected'])], ['New dues', toDouble(k['newDues'])], ['Products added', toDouble(k['productsAdded'])],
    ['Discount', toDouble(k['discount'])], ['GST', toDouble(k['gst'])],
    for (final p in ((r['payments'] as List?) ?? const []).cast<Map>()) ['Payment · ${p['method']}', toDouble(p['amount'])],
  ]);
  sheet('Sales Timeline', ['Date & time', 'Order', 'Channel', 'Status', 'Customer', 'Mobile', 'Product', 'SKU', 'Qty', 'Unit price', 'Total', 'GST', 'Payment', 'Due', 'Sold/delivered by'], [
    for (final x in ((r['timeline'] as List?) ?? const []).cast<Map>())
      [dateTime(x['at']), x['orderNumber'], x['channel'] == 'online' ? 'Online' : 'Store', x['status'], x['customer'], x['phone'], x['product'], x['sku'], toDouble(x['qty']), toDouble(x['unitPrice']), toDouble(x['total']), toDouble(x['gst']), x['payment'], x['due'] == null ? null : toDouble(x['due']), x['staff']],
  ]);
  sheet('Products', ['Product', 'SKU', 'Category', 'Orders', 'Qty', 'Revenue', 'Last sold'], [for (final x in ((r['products'] as List?) ?? const []).cast<Map>()) [x['name'], x['sku'], x['category'], toDouble(x['orders']), toDouble(x['qty']), toDouble(x['revenue']), dateTime(x['lastSoldAt'])]]);
  sheet('Day-wise', ['Date', 'Orders', 'In-store', 'Online', 'Units', 'Sales', 'Due', 'Collected'], [for (final x in ((r['daily'] as List?) ?? const []).cast<Map>()) [x['day'], toDouble(x['orders']), toDouble(x['offline']), toDouble(x['online']), toDouble(x['units']), toDouble(x['sales']), toDouble(x['due']), toDouble(x['collected'])]]);
  sheet('Due Collections', ['Date & time', 'Receipt', 'Customer', 'Order', 'Method', 'Amount', 'Received by'], [for (final x in ((r['collections'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), x['receipt'], x['customer'], x['orderNumber'], x['method'], toDouble(x['amount']), x['by']]]);
  sheet('New Dues', ['Date & time', 'Order', 'Customer', 'Mobile', 'Amount', 'Paid since', 'Balance', 'Promised', 'Status'], [for (final x in ((r['newDues'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), x['orderNumber'], x['customer'], x['phone'], toDouble(x['amount']), toDouble(x['paid']), toDouble(x['balance']), x['promised'] == null ? '' : dateShort(x['promised']), x['status']]]);
  sheet('Products Added', ['Date & time', 'Product', 'SKU', 'Category', 'Price', 'Stock', 'Added by'], [for (final x in ((r['added'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), x['name'], x['sku'], x['category'], toDouble(x['price']), x['stock'] == null ? null : toDouble(x['stock']), x['by']]]);
  sheet('Deliveries', ['Agent', 'Assigned', 'Delivered', 'Pending', 'Canceled', 'Delivered value', 'Avg minutes'], [for (final x in ((r['agents'] as List?) ?? const []).cast<Map>()) [x['name'], toDouble(x['assigned']), toDouble(x['delivered']), toDouble(x['pending']), toDouble(x['canceled']), toDouble(x['deliveredValue']), x['avgMinutes'] == null ? null : toDouble(x['avgMinutes'])]]);
  sheet('Staff', ['Staff', 'Role', 'Store sales', 'Sales amount', 'Collections', 'Collected', 'Delivered', 'Products added'], [for (final x in ((r['staff'] as List?) ?? const []).cast<Map>()) [x['name'], x['role'], toDouble(x['posSales']), toDouble(x['posAmount']), toDouble(x['collections']), toDouble(x['collectedAmount']), toDouble(x['delivered']), toDouble(x['productsAdded'])]]);
  if (((r['activity'] as List?) ?? const []).isNotEmpty) {
    sheet('Activity', ['Date & time', 'Action', 'Details'], [for (final x in ((r['activity'] as List?) ?? const []).cast<Map>()) [dateTime(x['at']), x['action'], x['description']]]);
  }
  book.delete('Sheet1');
  final bytes = book.save();
  if (bytes == null || !context.mounted) return;
  await _deliver(context, Uint8List.fromList(bytes), '${_fileBase(r)}.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/// One-sheet Excel export of a list page (Orders, Products, Customers, Due…).
Future<void> exportTable(BuildContext context, String name, List<String> head, List<List<Object?>> rows) async {
  final book = xl.Excel.createExcel();
  final s = book[name];
  s.appendRow([for (final h in head) xl.TextCellValue(h)]);
  for (final row in rows) {
    s.appendRow([for (final c in row) c is num ? xl.DoubleCellValue(c.toDouble()) : xl.TextCellValue('${c ?? ''}')]);
  }
  book.delete('Sheet1');
  final bytes = book.save();
  if (bytes == null || !context.mounted) return;
  final day = ist(DateTime.now().toUtc());
  await _deliver(context, Uint8List.fromList(bytes), '$name-${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
