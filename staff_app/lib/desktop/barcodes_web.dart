import 'package:barcode/barcode.dart' as bc;
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../core/local_store.dart';
import '../core/printer.dart';
import '../ds/display_options.dart';
import '../features/native/catalog_pages.dart' show CartLinePrice;
import '../widgets/common.dart';
import '../widgets/web.dart';

/// Label stock, as on the website (sizes in mm, printed true to size).
class LabelStock {
  final String id, name, hint;
  final bool roll;
  final int cols;
  final double w, h, gapX, gapY, marginX, marginY;
  const LabelStock(this.id, this.name, this.hint, {required this.roll, required this.cols, required this.w, required this.h, required this.gapX, required this.gapY, required this.marginX, required this.marginY});
  double get pageWidth => roll ? marginX * 2 + cols * w + (cols - 1) * gapX : 210;
  int get rowsPerPage => roll ? 1 : ((297 - marginY * 2 + gapY) / (h + gapY)).floor().clamp(1, 99);
}

const kLabelStocks = [
  LabelStock('roll-1-50x25', 'Roll · 1 across · 50 × 25 mm', 'Most common single-row label printers', roll: true, cols: 1, w: 50, h: 25, gapX: 0, gapY: 3, marginX: 0, marginY: 0),
  LabelStock('roll-1-38x25', 'Roll · 1 across · 38 × 25 mm', 'Small single-row labels', roll: true, cols: 1, w: 38, h: 25, gapX: 0, gapY: 3, marginX: 0, marginY: 0),
  LabelStock('roll-1-100x50', 'Roll · 1 across · 100 × 50 mm', 'Big labels / 4-inch printers', roll: true, cols: 1, w: 100, h: 50, gapX: 0, gapY: 3, marginX: 0, marginY: 0),
  LabelStock('roll-2-38x25', 'Roll · 2 across · 38 × 25 mm', '2-up retail labels (≈ 80 mm roll)', roll: true, cols: 2, w: 38, h: 25, gapX: 2, gapY: 3, marginX: 1, marginY: 0),
  LabelStock('roll-2-50x25', 'Roll · 2 across · 50 × 25 mm', '2-up labels (≈ 104 mm roll)', roll: true, cols: 2, w: 50, h: 25, gapX: 2, gapY: 3, marginX: 1, marginY: 0),
  LabelStock('roll-3-32x25', 'Roll · 3 across · 32 × 25 mm', '3-up retail labels (≈ 104 mm roll)', roll: true, cols: 3, w: 32, h: 25, gapX: 2, gapY: 3, marginX: 1, marginY: 0),
  LabelStock('roll-3-33x15', 'Roll · 3 across · 33 × 15 mm', 'Small 3-up (jewellery, cosmetics)', roll: true, cols: 3, w: 33, h: 15, gapX: 2, gapY: 2, marginX: 1, marginY: 0),
  LabelStock('a4-65', 'A4 sheet · 65 labels (5 × 13)', '38.1 × 21.2 mm', roll: false, cols: 5, w: 38.1, h: 21.2, gapX: 2.5, gapY: 0, marginX: 4.7, marginY: 10.7),
  LabelStock('a4-40', 'A4 sheet · 40 labels (4 × 10)', '48.5 × 25.4 mm', roll: false, cols: 4, w: 48.5, h: 25.4, gapX: 0, gapY: 0, marginX: 8, marginY: 21.5),
  LabelStock('a4-24', 'A4 sheet · 24 labels (3 × 8)', '64 × 33.9 mm', roll: false, cols: 3, w: 64, h: 33.9, gapX: 2.5, gapY: 0, marginX: 7.2, marginY: 12.9),
  LabelStock('a4-21', 'A4 sheet · 21 labels (3 × 7)', '63.5 × 38.1 mm', roll: false, cols: 3, w: 63.5, h: 38.1, gapX: 2.5, gapY: 0, marginX: 7.2, marginY: 15.1),
];

/// What goes on a label (remembered on this computer).
class LabelOptions {
  String stock = kLabelStocks.first.id;
  bool name = true, barcode = true, code = true, price = true, offer = true, unit = true, footer = true;
  LabelStock get layout => kLabelStocks.firstWhere((s) => s.id == stock, orElse: () => kLabelStocks.first);
  Map<String, dynamic> toJson() => {'stock': stock, 'name': name, 'barcode': barcode, 'code': code, 'price': price, 'offer': offer, 'unit': unit, 'footer': footer};
  void load(Map m) {
    stock = '${m['stock'] ?? stock}';
    name = m['name'] != false;
    barcode = m['barcode'] != false;
    code = m['code'] != false;
    price = m['price'] != false;
    offer = m['offer'] != false;
    unit = m['unit'] != false;
    footer = m['footer'] != false;
  }
}

/// "Print Barcodes" as on the website: date range (which new / changed products start in the list),
/// label preview with its options and label stock, the six numbers, "Add products" (search +
/// category) and the print list. Printed true to size on roll printers or A4 label sheets. Offline.
class BarcodesWeb extends StatefulWidget {
  final List<int>? ids;
  const BarcodesWeb({super.key, this.ids});
  @override
  State<BarcodesWeb> createState() => _BarcodesWebState();
}

class _BarcodesWebState extends State<BarcodesWeb> {
  static final _def = displayDefs['ecom_barcodes2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  final _opt = LabelOptions();
  final Map<int, int> _qty = {};
  DateRange _range = DateRange.preset('today');
  String _q = '';
  int _cat = 0;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    LocalStore.instance.read('label_options').then((v) {
      if (v is Map && mounted) setState(() => _opt.load(v));
    });
  }

  void _save() => LocalStore.instance.write('label_options', _opt.toJson());

  void _fillFromRange(List<Map<String, dynamic>> all) {
    _qty.clear();
    for (final p in all.where((p) => '${p['barcode'] ?? ''}'.isNotEmpty && (_range.contains(p['createdAt']) || _range.contains(p['updatedAt'])))) {
      _qty[toInt(p['id'])] = 1;
    }
  }

  double _labelPrice(Map p) => _opt.offer ? CartLinePrice.of(p) : toDouble(p['price']);
  String _priceLine(Map p) => '${money(_labelPrice(p))}${_opt.unit && '${p['pack'] ?? p['unit'] ?? ''}'.isNotEmpty ? ' / ${p['pack'] ?? p['unit']}' : ''}';

  Future<void> _print(List<Map<String, dynamic>> all, String shop) async {
    final l = _opt.layout;
    final labels = [for (final p in all) for (var i = 0; i < (_qty[toInt(p['id'])] ?? 0); i++) p];
    if (labels.isEmpty) return toast(context, 'Add at least one product to the print list.', error: true);
    const mm = PdfPageFormat.mm;
    pw.Widget face(Map p) {
      final small = l.h < 20;
      return pw.Container(
        width: l.w * mm,
        height: l.h * mm,
        padding: pw.EdgeInsets.symmetric(horizontal: (l.w * .05).clamp(0, 2) * mm, vertical: (l.h * .06).clamp(0, 1.5) * mm),
        child: pw.Column(mainAxisAlignment: pw.MainAxisAlignment.center, children: [
          if (_opt.name) pw.Text('${p['name']}', maxLines: small ? 1 : 2, textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: [3.4, l.h * (small ? .16 : .12), l.w * .075].reduce((a, b) => a < b ? a : b) * mm, fontWeight: pw.FontWeight.bold)),
          if (_opt.barcode && '${p['barcode'] ?? ''}'.isNotEmpty)
            pw.Expanded(child: pw.Padding(padding: const pw.EdgeInsets.symmetric(vertical: 1), child: pw.BarcodeWidget(barcode: pw.Barcode.code128(), data: '${p['barcode']}', drawText: false))),
          if (_opt.code && '${p['barcode'] ?? ''}'.isNotEmpty) pw.Text('${p['barcode']}', style: pw.TextStyle(fontSize: [2.8, l.h * .1].reduce((a, b) => a < b ? a : b) * mm)),
          if (_opt.price) pw.Text(_priceLine(p), style: pw.TextStyle(fontSize: [4.6, l.h * (small ? .19 : .15), l.w * .1].reduce((a, b) => a < b ? a : b) * mm, fontWeight: pw.FontWeight.bold)),
          if (_opt.footer && shop.isNotEmpty) pw.Text(shop, maxLines: 1, style: pw.TextStyle(fontSize: [2.4, l.h * .085].reduce((a, b) => a < b ? a : b) * mm)),
        ]),
      );
    }

    final doc = pw.Document();
    final perPage = l.cols * l.rowsPerPage;
    final format = l.roll ? PdfPageFormat(l.pageWidth * mm, l.h * mm, marginAll: 0) : PdfPageFormat.a4.copyWith(marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0);
    for (var i = 0; i < labels.length; i += perPage) {
      final page = labels.skip(i).take(perPage).toList();
      doc.addPage(pw.Page(
        pageFormat: format,
        build: (_) => pw.Stack(children: [
          for (final (j, p) in page.indexed)
            pw.Positioned(
              left: (l.marginX + (j % l.cols) * (l.w + l.gapX)) * mm,
              top: (l.roll ? 0 : l.marginY + (j ~/ l.cols) * (l.h + l.gapY)) * mm,
              child: face(p),
            ),
        ]),
      ));
    }
    await printPdf(await doc.save(), name: 'Barcode labels', format: format);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final item = _prefs.item;
    final on = _prefs.on;
    final shop = '${s.settings['businessName'] ?? ''}';
    final all = s.list('products');
    final withCode = all.where((p) => '${p['barcode'] ?? ''}'.isNotEmpty).toList();
    if (!_started) {
      _started = true;
      if (widget.ids != null) {
        for (final id in widget.ids!) {
          if (withCode.any((p) => toInt(p['id']) == id)) _qty[id] = 1;
        }
      } else {
        _fillFromRange(all);
      }
    }
    final today = DateRange.preset('today');
    final lines = withCode.where((p) => (_qty[toInt(p['id'])] ?? 0) > 0).toList();
    final total = _qty.values.fold<int>(0, (a, b) => a + b);
    final sample = lines.firstOrNull ?? withCode.firstOrNull ?? {'name': 'Sample product', 'barcode': '8901234567890', 'price': 199, 'unit': 'pc'};
    final l = _opt.layout;
    void opt(VoidCallback f) => setState(() {
          f();
          _save();
        });

    final preview = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Row(children: [Icon(LucideIcons.barcode, size: 20, color: Color(0xFF2563EB)), SizedBox(width: 10), Text('Label Preview', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900))]),
        const SizedBox(height: 14),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: W.g50, borderRadius: BorderRadius.circular(12)),
            child: _LabelPreview(product: sample, opt: _opt, shop: shop, price: _priceLine(sample)),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final (v, label, set) in <(bool, String, void Function(bool))>[
                (_opt.name, 'Product name on top', (v) => _opt.name = v),
                (_opt.barcode, 'Barcode', (v) => _opt.barcode = v),
                (_opt.code, 'Barcode number', (v) => _opt.code = v),
                (_opt.price, 'Price at the bottom', (v) => _opt.price = v),
                (_opt.unit, 'Unit beside the price', (v) => _opt.unit = v),
                (_opt.footer, 'Shop line at the very bottom', (v) => _opt.footer = v),
              ]) ...[
                InkWell(
                  onTap: () => opt(() => set(!v)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [IgnorePointer(child: Checkbox(value: v, onChanged: (_) {})), Text(label, style: const TextStyle(fontSize: 13.5, color: W.g700))]),
                ),
                if (label.startsWith('Price') && _opt.price)
                  Padding(
                    padding: const EdgeInsets.only(left: 24),
                    child: InkWell(
                      onTap: () => opt(() => _opt.offer = !_opt.offer),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [IgnorePointer(child: Checkbox(value: _opt.offer, onChanged: (_) {})), const Text('Print the offer price when there is one', style: TextStyle(fontSize: 13, color: W.g600))]),
                    ),
                  ),
              ],
              const Divider(height: 20, color: W.g100),
              WebSelect<String>(label: 'Label stock / printer', value: _opt.stock, options: [for (final k in kLabelStocks) (k.id, '${k.name}${k.roll ? '' : ' — ${k.hint}'}')], onChanged: (v) => opt(() => _opt.stock = v)),
              const SizedBox(height: 6),
              Text(l.roll ? '${l.hint}. Printer page size: ${l.pageWidth.toStringAsFixed(0)} × ${l.h.toStringAsFixed(0)} mm.' : '${l.cols * l.rowsPerPage} labels per A4 page.', style: const TextStyle(fontSize: 12, color: W.g500)),
            ]),
          ),
        ]),
      ]),
    );

    final cards = [
      if (on('bc2-cards', 'bc2-k-added')) WebMetric(icon: LucideIcons.packagePlus, color: const Color(0xFF059669), value: '${all.where((p) => today.contains(p['createdAt'])).length}', label: 'Added Today', sub: 'new products'),
      if (on('bc2-cards', 'bc2-k-updated')) WebMetric(icon: LucideIcons.refreshCw, color: const Color(0xFF2563EB), value: '${all.where((p) => today.contains(p['updatedAt']) && !today.contains(p['createdAt'])).length}', label: 'Updated Today', sub: 'restock or price change'),
      if (on('bc2-cards', 'bc2-k-range'))
        () {
          final added = all.where((p) => _range.contains(p['createdAt'])).length;
          final changed = all.where((p) => _range.contains(p['updatedAt']) && !_range.contains(p['createdAt'])).length;
          return WebMetric(icon: LucideIcons.calendarDays, color: const Color(0xFF1E3A8A), value: '${added + changed}', label: 'In This Range', sub: '$added added · $changed changed');
        }(),
      if (on('bc2-cards', 'bc2-k-queue')) WebMetric(icon: LucideIcons.printer, color: const Color(0xFF059669), value: '$total', label: 'Labels to Print', sub: '${lines.length} product${lines.length == 1 ? '' : 's'} in the list'),
      if (on('bc2-cards', 'bc2-k-missing')) WebMetric(icon: LucideIcons.triangleAlert, color: const Color(0xFFD97706), value: '${all.length - withCode.length}', label: 'No Barcode Yet', sub: "can't be printed"),
      if (on('bc2-cards', 'bc2-k-total')) WebMetric(icon: LucideIcons.package, color: const Color(0xFF2563EB), value: '${all.length}', label: 'All Products', sub: '${withCode.length} have a barcode'),
    ];

    final q = _q.trim().toLowerCase();
    final found = withCode.where((p) => (_cat == 0 || toInt(p['categoryId']) == _cat) && (q.isEmpty || '${p['name']} ${p['sku'] ?? ''} ${p['barcode']}'.toLowerCase().contains(q))).take(q.isEmpty && _cat == 0 ? 0 : 30).toList();
    final picker = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Add Products', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: WebSearch(hint: 'Search by name, SKU or barcode…', onChanged: (v) => setState(() => _q = v))),
          const SizedBox(width: 12),
          SizedBox(width: 240, child: WebSelect<int>(value: _cat, options: [(0, 'All categories'), for (final c in s.list('categories')) (toInt(c['id']), '${c['name']}')], onChanged: (v) => setState(() => _cat = v))),
        ]),
        if (found.isNotEmpty) ...[
          const SizedBox(height: 10),
          WebTable(
            bordered: true,
            cols: const [WebCol('Product', flex: 2.4), WebCol('Barcode', flex: 1.2), WebCol('Price', flex: .8), WebCol('', width: 110)],
            rows: [
              for (final p in found)
                [
                  Text('${p['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                  Text('${p['barcode']}', style: const TextStyle(fontSize: 12.5, color: W.g600)),
                  Text(money(CartLinePrice.of(p)), style: const TextStyle(fontSize: 13)),
                  (_qty[toInt(p['id'])] ?? 0) > 0
                      ? const Text('In the list ✓', style: TextStyle(fontSize: 12.5, color: W.green))
                      : WebButton('Add', icon: LucideIcons.plus, height: 30, onPressed: () => setState(() => _qty[toInt(p['id'])] = 1)),
                ],
            ],
          ),
        ],
      ]),
    );

    final printList = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text('Print List (${lines.length})', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
          const Spacer(),
          if (lines.isNotEmpty) TextButton(onPressed: () => setState(_qty.clear), child: const Text('Clear list', style: TextStyle(color: W.g500))),
          const SizedBox(width: 8),
          WebButton('Print $total label${total == 1 ? '' : 's'}', icon: LucideIcons.printer, color: const Color(0xFF2563EB), onPressed: total == 0 ? null : () => _print(lines, shop)),
        ]),
        const SizedBox(height: 10),
        WebTable(
          bordered: true,
          cols: const [WebCol('Product', flex: 2.4), WebCol('Barcode', flex: 1.2), WebCol('Label price', flex: 1), WebCol('Labels', width: 150), WebCol('', width: 56)],
          rows: [
            for (final p in lines)
              [
                Text('${p['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                Text('${p['barcode']}', style: const TextStyle(fontSize: 12.5, color: W.g600)),
                Text(_priceLine(p), style: const TextStyle(fontSize: 13)),
                _Counter(value: _qty[toInt(p['id'])] ?? 0, onChanged: (v) => setState(() => v <= 0 ? _qty.remove(toInt(p['id'])) : _qty[toInt(p['id'])] = v)),
                WebIconAction(LucideIcons.x, color: const Color(0xFFDC2626), tooltip: 'Remove', onTap: () => setState(() => _qty.remove(toInt(p['id'])))),
              ],
          ],
          empty: const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No products in the list — add them above, or pick dates to bring in new / changed ones.', style: TextStyle(color: W.g400)))),
        ),
      ]),
    );

    return WebPage(
      title: 'Print Barcodes',
      subtitle: 'Price labels for the products you added or restocked',
      back: Navigator.of(context).canPop(),
      onRefresh: () => s.syncNow(only: const ['products', 'categories', 'settings']),
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Print $total label${total == 1 ? '' : 's'}', icon: LucideIcons.printer, color: const Color(0xFF2563EB), onPressed: total == 0 ? null : () => _print(lines, shop)),
      ],
      children: [
        if (item('bc2-range')) ...[
          WebRangeBar(
            range: _range,
            presets: const ['today', 'yesterday', '7d', 'this_month'],
            onChanged: (r) => setState(() {
              _range = r;
              _fillFromRange(all);
            }),
          ),
          const SizedBox(height: 12),
        ],
        LayoutBuilder(builder: (c, box) {
          final side = box.maxWidth >= 1300;
          final grid = cards.isEmpty ? null : WebGrid(columns: side ? 2 : 3, minWidth: 200, children: cards);
          if (!item('bc2-preview')) return grid ?? const SizedBox();
          if (grid == null) return preview;
          return side
              ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: preview), const SizedBox(width: 12), Expanded(child: grid)])
              : Column(children: [preview, const SizedBox(height: 12), grid]);
        }),
        const SizedBox(height: 12),
        if (item('bc2-picker')) ...[picker, const SizedBox(height: 12)],
        if (item('bc2-list')) printList,
      ],
    );
  }
}

/// On-screen label at its real proportions (a 50 × 25 mm label is drawn 4 px per mm).
class _LabelPreview extends StatelessWidget {
  final Map product;
  final LabelOptions opt;
  final String shop, price;
  const _LabelPreview({required this.product, required this.opt, required this.shop, required this.price});
  @override
  Widget build(BuildContext context) {
    final l = opt.layout;
    final k = (220 / l.w).clamp(2.0, 6.0); // px per mm
    final small = l.h < 20;
    double m(double a, double b, [double? c]) => [a, b, ?c].reduce((x, y) => x < y ? x : y) * k;
    final code = '${product['barcode'] ?? ''}';
    return Container(
      width: l.w * k,
      height: l.h * k,
      padding: EdgeInsets.symmetric(horizontal: (l.w * .05).clamp(0, 2) * k, vertical: (l.h * .06).clamp(0, 1.5) * k),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFFC8C8D4))),
      child: DefaultTextStyle.merge(
        style: const TextStyle(color: Colors.black, height: 1.1),
        textAlign: TextAlign.center,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (opt.name) Text('${product['name']}', maxLines: small ? 1 : 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: m(3.4, l.h * (small ? .16 : .12), l.w * .075), fontWeight: FontWeight.w700)),
          if (opt.barcode)
            code.isEmpty
                ? Text('No barcode on this product', style: TextStyle(fontSize: m(2.8, l.h * .1), color: const Color(0xFFB91C1C)))
                : Expanded(child: Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: FractionallySizedBox(widthFactor: .92, child: CustomPaint(painter: _Bars(code), size: Size.infinite)))),
          if (opt.code && code.isNotEmpty) Text(code, style: TextStyle(fontSize: m(2.8, l.h * .1))),
          if (opt.price) Text(price, style: TextStyle(fontSize: m(4.6, l.h * (small ? .19 : .15), l.w * .1), fontWeight: FontWeight.w700)),
          if (opt.footer && shop.isNotEmpty) Text(shop, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: m(2.4, l.h * .085))),
        ]),
      ),
    );
  }
}

class _Bars extends CustomPainter {
  final String data;
  _Bars(this.data);
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black;
    try {
      for (final e in bc.Barcode.code128().make(data, width: size.width, height: size.height, drawText: false)) {
        if (e is bc.BarcodeBar && e.black) canvas.drawRect(Rect.fromLTWH(e.left, e.top, e.width, e.height), paint);
      }
    } catch (_) {
      // An odd value can't be drawn; the number below still shows.
    }
  }

  @override
  bool shouldRepaint(_Bars old) => old.data != data;
}

class _Counter extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;
  const _Counter({required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(visualDensity: VisualDensity.compact, icon: const Icon(LucideIcons.circleMinus, size: 18), onPressed: () => onChanged(value - 1)),
        SizedBox(width: 30, child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
        IconButton(visualDensity: VisualDensity.compact, icon: const Icon(LucideIcons.circlePlus, size: 18), onPressed: () => onChanged(value + 1)),
      ]);
}
