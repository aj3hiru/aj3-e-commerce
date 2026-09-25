
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../core/format.dart';

class ReceiptLine {
  final String name;
  final int qty;
  final double price;
  final String? unit;
  const ReceiptLine(this.name, this.qty, this.price, [this.unit]);
}

class ReceiptData {
  final Map<String, dynamic> shop;
  final String number;
  final DateTime at;
  final String customer;
  final String? phone;
  final List<ReceiptLine> lines;
  final double subtotal, discount, gst, total, due;
  final List<(String, double)> payments;
  final bool offline;
  const ReceiptData({required this.shop, required this.number, required this.at, required this.customer, this.phone, required this.lines,
      required this.subtotal, required this.discount, required this.gst, required this.total, required this.payments, this.due = 0, this.offline = false});
}

pw.Font? _regular, _bold;

Future<void> _fonts() async {
  _regular ??= pw.Font.ttf(await rootBundle.load('assets/fonts/Inter-Regular.ttf'));
  _bold ??= pw.Font.ttf(await rootBundle.load('assets/fonts/Inter-Bold.ttf'));
}

/// "thermal_58", "thermal_80" or "a4".
PdfPageFormat pageFor(String size) => switch (size) {
      'thermal_58' => const PdfPageFormat(58 * PdfPageFormat.mm, double.infinity, marginAll: 2.5 * PdfPageFormat.mm),
      'a4' => PdfPageFormat.a4.copyWith(marginLeft: 36, marginRight: 36, marginTop: 36, marginBottom: 36),
      _ => const PdfPageFormat(80 * PdfPageFormat.mm, double.infinity, marginAll: 3 * PdfPageFormat.mm),
    };

Future<Uint8List> buildReceipt(ReceiptData r, String size) async {
  await _fonts();
  final a4 = size == 'a4';
  final fs = a4 ? 10.5 : (size == 'thermal_58' ? 7.8 : 8.8);
  final t = pw.TextStyle(font: _regular, fontBold: _bold, fontSize: fs);
  final b = t.copyWith(font: _bold);
  final doc = pw.Document(title: 'Bill ${r.number}');
  pw.Widget row(String l, String v, {bool bold = false}) => pw.Row(children: [pw.Expanded(child: pw.Text(l, style: bold ? b : t)), pw.Text(v, style: bold ? b : t)]);
  final shop = r.shop;
  final phones = (shop['phones'] as List?)?.cast<String>() ?? const [];

  doc.addPage(pw.Page(
    pageFormat: pageFor(size),
    build: (c) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Text('${shop['businessName'] ?? ''}', textAlign: pw.TextAlign.center, style: b.copyWith(fontSize: fs * 1.45)),
      if (shop['address'] != null) pw.Text('${shop['address']}', textAlign: pw.TextAlign.center, style: t),
      if (phones.isNotEmpty) pw.Text('Mob: ${phones.join(', ')}', textAlign: pw.TextAlign.center, style: t),
      if (shop['gstin'] != null) pw.Text('GSTIN: ${shop['gstin']}', textAlign: pw.TextAlign.center, style: t),
      pw.SizedBox(height: 4),
      pw.Text(a4 ? 'TAX INVOICE' : 'BILL', textAlign: pw.TextAlign.center, style: b),
      pw.Divider(borderStyle: pw.BorderStyle.dashed, height: 8),
      row('Bill no.', r.number),
      row('Date', dateTime(r.at)),
      row('Customer', r.customer),
      if (r.phone != null && r.phone!.isNotEmpty) row('Mobile', r.phone!),
      pw.Divider(borderStyle: pw.BorderStyle.dashed, height: 8),
      for (final l in r.lines) ...[
        pw.Text('${l.name}${l.unit != null && l.unit!.isNotEmpty ? ' (${l.unit})' : ''}', style: t),
        row('   ${l.qty} × ${money(l.price)}', money(l.qty * l.price)),
      ],
      pw.Divider(borderStyle: pw.BorderStyle.dashed, height: 8),
      row('Subtotal', money(r.subtotal)),
      if (r.discount > 0) row('Discount', '-${money(r.discount)}'),
      if (r.gst > 0) row('GST', money(r.gst)),
      row('TOTAL', money(r.total), bold: true),
      for (final p in r.payments.where((p) => p.$2 > 0)) row('Paid (${p.$1})', money(p.$2)),
      if (r.due > 0.004) row('Due', money(r.due), bold: true),
      pw.SizedBox(height: 6),
      if (r.offline)
        pw.Container(
          padding: const pw.EdgeInsets.all(3),
          decoration: pw.BoxDecoration(border: pw.Border.all(width: .6)),
          child: pw.Text('Billed offline — uploads automatically', textAlign: pw.TextAlign.center, style: t.copyWith(fontSize: fs * .9)),
        ),
      pw.SizedBox(height: 4),
      pw.Text('Thank you! Visit again.', textAlign: pw.TextAlign.center, style: t),
    ]),
  ));
  return doc.save();
}

/// Opens the system print dialog (Windows / Android) with the receipt.
Future<void> printReceipt(ReceiptData r, String size) async {
  final bytes = await buildReceipt(r, size);
  await Printing.layoutPdf(name: 'Bill ${r.number}', format: pageFor(size), onLayout: (_) async => bytes);
}
