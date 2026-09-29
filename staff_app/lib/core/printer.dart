import 'dart:io';
import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';

import 'local_store.dart';

/// The printer chosen in Account → Printing. Windows prints straight to it
/// (no dialog); where printers can't be listed (Android) the system dialog opens.
class PrinterPrefs {
  static bool get canPick => Platform.isWindows || Platform.isMacOS || Platform.isLinux;

  /// Installed printers (empty where the system doesn't allow listing them).
  static Future<List<Printer>> list() async {
    if (!canPick) return const [];
    try {
      return (await Printing.listPrinters()).where((p) => p.isAvailable).toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<String?> saved() async {
    final v = await LocalStore.instance.read('printer');
    return v is String && v.isNotEmpty ? v : null;
  }

  static Future<void> save(String? url) => LocalStore.instance.write('printer', url ?? '');
}

/// Prints a PDF: to the chosen printer when there is one, otherwise with the print dialog.
Future<void> printPdf(Uint8List bytes, {required String name, PdfPageFormat format = PdfPageFormat.a4}) async {
  final url = PrinterPrefs.canPick ? await PrinterPrefs.saved() : null;
  if (url != null) {
    final p = (await PrinterPrefs.list()).where((x) => x.url == url).firstOrNull;
    if (p != null) {
      final ok = await Printing.directPrintPdf(printer: p, name: name, format: format, onLayout: (_) async => bytes);
      if (ok) return;
    }
  }
  await Printing.layoutPdf(name: name, format: format, onLayout: (_) async => bytes);
}
