import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/web.dart';
import '../pos/scanner.dart';

/// Add or edit a product. Editing changes only these fields — the description,
/// sizes and other website-only details stay as they are.
class ProductEditScreen extends StatefulWidget {
  final Map<String, dynamic>? product;
  const ProductEditScreen({super.key, this.product});
  @override
  State<ProductEditScreen> createState() => _ProductEditScreenState();
}

class _ProductEditScreenState extends State<ProductEditScreen> {
  final _form = GlobalKey<FormState>();
  late final Map<String, dynamic> p = widget.product ?? {};
  late final _name = TextEditingController(text: p['name'] ?? '');
  late final _price = TextEditingController(text: p['price'] == null ? '' : _num(p['price']));
  late final _sale = TextEditingController(text: p['salePrice'] == null ? '' : _num(p['salePrice']));
  late final _stock = TextEditingController(text: p['stock'] == null ? (widget.product == null ? '0' : '') : '${p['stock']}');
  late final _gst = TextEditingController(text: p['gstRate'] == null ? '0' : _num(p['gstRate']));
  late final _unit = TextEditingController(text: p['unit'] ?? '');
  late final _sku = TextEditingController(text: p['sku'] ?? '');
  late final _barcode = TextEditingController(text: p['barcode'] ?? '');
  late final _hsn = TextEditingController(text: p['hsn'] ?? '');
  late int? _category = p['categoryId'] == null ? null : toInt(p['categoryId']);
  late int? _brand = p['brandId'] == null ? null : toInt(p['brandId']);
  late bool _active = (p['status'] ?? 'active') == 'active';
  String? _photo;
  bool _busy = false;

  bool get _isNew => widget.product == null;
  static String _num(dynamic v) {
    final d = toDouble(v);
    return d == d.roundToDouble() ? d.toInt().toString() : d.toStringAsFixed(2);
  }

  Future<void> _pickPhoto(ImageSource src) async {
    try {
      final x = await ImagePicker().pickImage(source: src, maxWidth: 2000, maxHeight: 2000, imageQuality: 88);
      if (x != null) setState(() => _photo = x.path);
    } catch (_) {
      if (mounted) toast(context, 'Could not open the ${src == ImageSource.camera ? 'camera' : 'photos'}.', error: true);
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final s = context.read<AppState>();
    setState(() => _busy = true);
    final name = _name.text.trim();
    if (_isNew) {
      // A new product is created with the website's own form rules (it gets its barcode if left blank).
      final item = OutboxItem(
        id: newId(), method: 'POST', path: '/api/ecommerce/products2', label: 'New product: $name', refresh: const ['products'],
        fields: {
          'name': name, 'price': _price.text.trim(), 'sale_price': _sale.text.trim(), 'gst_rate': _gst.text.trim().isEmpty ? '0' : _gst.text.trim(),
          'product_type': 'physical', 'stock_qty': _stock.text.trim().isEmpty ? '0' : _stock.text.trim(), 'unit': _unit.text.trim(), 'sku': _sku.text.trim(),
          'barcode': _barcode.text.trim(), 'hsn_code': _hsn.text.trim(), 'category_id': _category?.toString() ?? '', 'brand_id': _brand?.toString() ?? '',
          'status': _active ? 'active' : 'inactive',
        },
        multipart: true, // the website's product form API expects form fields
        files: {'image': ?_photo},
      );
      final r = await s.sendNow(item);
      setState(() => _busy = false);
      if (!mounted) return;
      if (r.ok) {
        toast(context, 'Product added.');
        Navigator.pop(context);
      } else if (r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy) {
        toast(context, 'Saved offline — the product will be created when you are online.');
        Navigator.pop(context);
      } else {
        toast(context, r.message, error: true);
      }
      return;
    }

    // Edit: only what changed.
    final changes = <String, dynamic>{};
    void diff(String key, dynamic now, dynamic before) {
      if ('${now ?? ''}' != '${before ?? ''}') changes[key] = now;
    }
    diff('name', name, p['name']);
    diff('price', double.tryParse(_price.text.trim()), p['price'] == null ? null : toDouble(p['price']));
    diff('salePrice', _sale.text.trim().isEmpty ? null : double.tryParse(_sale.text.trim()), p['salePrice'] == null ? null : toDouble(p['salePrice']));
    diff('gstRate', double.tryParse(_gst.text.trim()) ?? 0, toDouble(p['gstRate']));
    if (p['stock'] != null) diff('stock', int.tryParse(_stock.text.trim()), p['stock']);
    diff('unit', _unit.text.trim(), p['unit'] ?? '');
    diff('sku', _sku.text.trim(), p['sku'] ?? '');
    diff('barcode', _barcode.text.trim(), p['barcode'] ?? '');
    diff('hsn', _hsn.text.trim(), p['hsn'] ?? '');
    diff('categoryId', _category, p['categoryId']);
    diff('brandId', _brand, p['brandId']);
    diff('status', _active ? 'active' : 'inactive', p['status']);

    final local = <String, dynamic>{...changes};
    if (local.containsKey('categoryId')) local['categoryId'] = _category;
    ApiResult? r;
    if (changes.isNotEmpty) {
      r = await s.sendNow(OutboxItem(
        id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: changes, label: 'Edit product: $name',
        effect: {'kind': 'product', 'id': p['id'], 'fields': local}, refresh: const ['products'],
      ));
    }
    if (_photo != null && (r == null || r.ok || r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy)) {
      await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/app/v1/products/${p['id']}/image', files: {'image': _photo!}, label: 'New photo: $name', refresh: const ['products']));
    }
    setState(() => _busy = false);
    if (!mounted) return;
    if (r != null && (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden)) {
      toast(context, r.message, error: true);
      return;
    }
    toast(context, r == null || r.ok ? 'Saved.' : 'Saved offline — will sync when online.');
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final cats = s.list('categories').where((c) => c['status'] == 'active' || toInt(c['id']) == _category).toList();
    final brands = s.list('brands').where((b) => b['status'] == 'active' || toInt(b['id']) == _brand).toList();
    final wide = isWide(context);
    String? req(String? v) => v == null || v.trim().isEmpty ? 'Required' : null;
    String? money0(String? v) => v == null || v.trim().isEmpty ? null : (double.tryParse(v.trim()) == null || double.parse(v.trim()) < 0 ? 'Enter a valid amount' : null);

    Widget photo() => AppCard(
          child: Column(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 180, height: 180,
                child: _photo != null ? Image.file(File(_photo!), fit: BoxFit.cover) : NetImage(p['image'], size: 180, radius: 12),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 8, children: [
              if (Platform.isAndroid) OutlinedButton.icon(onPressed: () => _pickPhoto(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined, size: 18), label: const Text('Camera')),
              OutlinedButton.icon(onPressed: () => _pickPhoto(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined, size: 18), label: Text(Platform.isAndroid ? 'Gallery' : 'Choose photo')),
            ]),
          ]),
        );

    final fields = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextFormField(controller: _name, validator: req, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Product name *')),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: TextFormField(controller: _price, validator: (v) => req(v) ?? money0(v), keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Price (MRP) *', prefixText: '₹ '))),
        const SizedBox(width: 10),
        Expanded(
          child: TextFormField(
            controller: _sale, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Sale price', prefixText: '₹ '),
            validator: (v) {
              final e = money0(v);
              if (e != null) return e;
              final sp = double.tryParse(v?.trim() ?? ''), pr = double.tryParse(_price.text.trim());
              return sp != null && pr != null && sp > 0 && sp >= pr ? 'Must be lower than price' : null;
            },
          ),
        ),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: TextFormField(controller: _stock, enabled: _isNew || p['stock'] != null, keyboardType: TextInputType.number, validator: (v) => v != null && v.trim().isNotEmpty && (int.tryParse(v.trim()) ?? -1) < 0 ? 'Whole number' : null, decoration: const InputDecoration(labelText: 'Stock'))),
        const SizedBox(width: 10),
        Expanded(child: TextFormField(controller: _unit, decoration: const InputDecoration(labelText: 'Unit', hintText: 'KG, Piece…'))),
        const SizedBox(width: 10),
        Expanded(
          child: DropdownButtonFormField<String>(
            initialValue: const ['0', '5', '12', '18', '28'].contains(_gst.text) ? _gst.text : null,
            hint: Text('GST ${_gst.text}%'),
            decoration: const InputDecoration(labelText: 'GST'),
            items: [for (final g in const ['0', '5', '12', '18', '28']) DropdownMenuItem(value: g, child: Text('$g%'))],
            onChanged: (v) => _gst.text = v ?? '0',
          ),
        ),
      ]),
      const SizedBox(height: 12),
      TextFormField(
        controller: _barcode,
        decoration: InputDecoration(
          labelText: 'Barcode', helperText: _isNew ? 'Leave blank to create one automatically' : null,
          suffixIcon: Platform.isAndroid
              ? IconButton(icon: const Icon(Icons.qr_code_scanner_rounded), onPressed: () async {
                  final code = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const ScannerScreen()));
                  if (code != null) _barcode.text = code;
                })
              : null,
        ),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: TextFormField(controller: _sku, decoration: const InputDecoration(labelText: 'SKU'))),
        const SizedBox(width: 10),
        Expanded(child: TextFormField(controller: _hsn, decoration: const InputDecoration(labelText: 'HSN code'))),
      ]),
      const SizedBox(height: 12),
      DropdownButtonFormField<int?>(
        initialValue: _category,
        decoration: const InputDecoration(labelText: 'Category'),
        items: [const DropdownMenuItem<int?>(value: null, child: Text('— None —')), for (final c in cats) DropdownMenuItem<int?>(value: toInt(c['id']), child: Text('${c['name']}'))],
        onChanged: (v) => setState(() => _category = v),
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<int?>(
        initialValue: _brand,
        decoration: const InputDecoration(labelText: 'Brand'),
        items: [const DropdownMenuItem<int?>(value: null, child: Text('— None —')), for (final b in brands) DropdownMenuItem<int?>(value: toInt(b['id']), child: Text('${b['name']}'))],
        onChanged: (v) => setState(() => _brand = v),
      ),
      const SizedBox(height: 6),
      SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Active (shown in shop and billing)'), value: _active, onChanged: (v) => setState(() => _active = v)),
    ]);

    return Scaffold(
      backgroundColor: isWide(context) ? W.g50 : null,
      appBar: isWide(context)
          ? WebAppBar(title: _isNew ? 'Add Product' : 'Edit Product', subtitle: _isNew ? 'Add something new to sell in your store' : 'Change price, stock, photo and details')
          : AppBar(title: Text(_isNew ? 'Add product' : 'Edit product')),
      body: Form(
        key: _form,
        child: PageBody(
          maxWidth: 980,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            if (wide)
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 260, child: photo()), const SizedBox(width: 16), Expanded(child: AppCard(child: fields))])
            else ...[photo(), const SizedBox(height: 12), AppCard(child: fields)],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : const Icon(Icons.save_outlined),
              label: Text(_isNew ? 'Add product' : 'Save changes'),
            ),
            if (!s.online) const Padding(padding: EdgeInsets.only(top: 8), child: Text('You are offline — this will be saved on the device and sent automatically.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted))),
          ]),
        ),
      ),
    );
  }
}
