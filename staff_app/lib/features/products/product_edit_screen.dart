import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/barcode.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/theme.dart';
import '../../ds/ds.dart';
import '../../widgets/common.dart';
import '../../widgets/web.dart';
import '../pos/scanner.dart';
import '../pos/variants.dart' show packOf;
import '../pos/cart.dart' show CartLine;

/// Add or edit a product with every field of the website's product form:
/// basic info, description, photo + gallery, pricing & stock, GST, category / brand / unit,
/// sizes / units, specifications, status, badge, item type, home page and campaign.
/// It saves through the website's own form API, so the same rules apply.
class ProductEditScreen extends StatefulWidget {
  final Map<String, dynamic>? product;
  final String? barcode; // new product: barcode already scanned
  const ProductEditScreen({super.key, this.product, this.barcode});
  @override
  State<ProductEditScreen> createState() => _ProductEditScreenState();
}

class _SizeRow {
  final label = TextEditingController(), mrp = TextEditingController(), price = TextEditingController(), stock = TextEditingController();
  bool isDefault = false;
  _SizeRow([Map? z]) {
    if (z == null) return;
    label.text = '${z['label'] ?? ''}';
    mrp.text = _num(z['mrp']);
    price.text = _num(z['price']);
    stock.text = z['stock'] == null ? '' : '${z['stock']}';
    isDefault = z['isDefault'] == true;
  }
  bool get empty => label.text.trim().isEmpty && mrp.text.trim().isEmpty && price.text.trim().isEmpty && stock.text.trim().isEmpty;
  Map<String, dynamic> toJson() => {'label': label.text.trim(), 'mrp': mrp.text.trim(), 'price': price.text.trim(), 'stock': stock.text.trim(), 'isDefault': isDefault};
}

class _SpecRow {
  final name = TextEditingController(), value = TextEditingController();
  _SpecRow([Map? x]) {
    name.text = '${x?['name'] ?? ''}';
    value.text = '${x?['value'] ?? ''}';
  }
}

String _num(dynamic v) {
  if (v == null || '$v'.isEmpty) return '';
  final d = toDouble(v);
  return d == d.roundToDouble() ? d.toInt().toString() : d.toStringAsFixed(2);
}

/// Sizes typed as a bare number get the product's unit: "250" + Gram → "250 Gram".
String _withUnit(String label, String unit) {
  final t = label.trim();
  return unit.isNotEmpty && RegExp(r'^\d+(\.\d+)?$').hasMatch(t) ? '$t $unit' : t;
}

String _withoutUnit(String label, String unit) {
  if (unit.isEmpty) return label;
  final m = RegExp(r'^(\d+(?:\.\d+)?)\s*(.+)$').firstMatch(label.trim());
  return m != null && m.group(2)!.toLowerCase() == unit.toLowerCase() ? m.group(1)! : label;
}

const _defaultUnits = ['KG', 'Gram', 'Liter', 'ml', 'cm', 'Meter', 'Piece'];

class _ProductEditScreenState extends State<ProductEditScreen> {
  final _form = GlobalKey<FormState>();
  Map<String, dynamic> get p => widget.product ?? const {};
  bool get _isNew => widget.product == null;

  final _name = TextEditingController(), _slug = TextEditingController(), _sku = TextEditingController(), _hsn = TextEditingController();
  final _barcode = TextEditingController(), _desc = TextEditingController();
  final _price = TextEditingController(), _sale = TextEditingController(), _stock = TextEditingController(text: '0');
  final _unitCustom = TextEditingController(), _campaignPrice = TextEditingController(), _qty = TextEditingController();
  List<int> _variantIds = []; // other products linked as variants (sizes) of this one
  String _gst = '0';
  String _unit = ''; // '' = no unit, 'custom' = typed
  int? _category, _brand;
  String _status = 'active', _badge = 'none', _itemType = 'normal', _type = 'physical';
  bool _home = false, _campaign = false;
  String? _photo; // new main photo (local path)
  bool _removePhoto = false;
  String? _serverPhoto;
  List<Map<String, dynamic>> _gallery = []; // on the server: {id, image}
  final Set<int> _removedGallery = {};
  final List<String> _newGallery = [];
  List<_SizeRow> _sizes = [_SizeRow()..isDefault = true];
  List<_SpecRow> _specs = [_SpecRow()];

  Map<String, dynamic> _opts = {'badges': [], 'itemTypes': [], 'gstRates': [], 'units': _defaultUnits};
  bool _loading = false, _full = false, _busy = false;
  String? _loadNote;

  @override
  void initState() {
    super.initState();
    _fillFromSync();
    if (widget.barcode != null) _barcode.text = widget.barcode!;
    LocalStore.instance.read('product_form').then((v) {
      if (v is Map && mounted) setState(() => _opts = Map<String, dynamic>.from(v));
      _loadOptions();
    });
    if (_isNew) {
      _full = true;
    } else {
      _loadFull();
    }
  }

  /// What the synced list already knows (enough for a quick edit offline).
  void _fillFromSync() {
    if (_isNew) return;
    _name.text = p['name'] ?? '';
    _sku.text = p['sku'] ?? '';
    _hsn.text = p['hsn'] ?? '';
    _barcode.text = p['barcode'] ?? '';
    _price.text = _num(p['price']);
    _sale.text = _num(p['salePrice']);
    _stock.text = p['stock'] == null ? '' : '${p['stock']}';
    _gst = _num(p['gstRate'] ?? 0);
    _setUnit(p['unit'] as String?);
    _qty.text = _num(p['quantity']);
    _category = p['categoryId'] == null ? null : toInt(p['categoryId']);
    _brand = p['brandId'] == null ? null : toInt(p['brandId']);
    _status = p['status'] == 'inactive' ? 'inactive' : 'active';
    _type = p['type'] ?? 'physical';
    _serverPhoto = p['image'];
  }

  void _setUnit(String? u) {
    final v = (u ?? '').trim();
    if (v.isEmpty) {
      _unit = '';
    } else if (_units.contains(v)) {
      _unit = v;
    } else {
      _unit = 'custom';
      _unitCustom.text = v;
    }
  }

  List<String> get _units => ((_opts['units'] as List?) ?? _defaultUnits).map((e) => '$e').toList();

  Future<void> _loadOptions() async {
    final r = await context.read<AppState>().api.get('/api/app/v1/product-form');
    if (!r.ok || !mounted) return;
    final f = Map<String, dynamic>.from(r.data['form']);
    LocalStore.instance.write('product_form', f);
    setState(() {
      _opts = f;
      if (_isNew && _gst == '0') {
        final d = ((f['gstRates'] as List?) ?? const []).cast<Map>().where((g) => g['isDefault'] == true).firstOrNull;
        if (d != null) _gst = _num(d['rate']);
      }
    });
  }

  /// Everything the website form shows (description, gallery, sizes, specs…).
  Future<void> _loadFull() async {
    setState(() => _loading = true);
    final r = await context.read<AppState>().api.get('/api/app/v1/products/${p['id']}');
    if (!mounted) return;
    if (!r.ok) {
      setState(() {
        _loading = false;
        _loadNote = r.outcome == ApiOutcome.offline
            ? "You're offline — you can change the main details now. Description, photos, sizes and specifications need the internet."
            : r.message;
      });
      return;
    }
    final x = Map<String, dynamic>.from(r.data['product']);
    setState(() {
      _loading = false;
      _full = true;
      _name.text = x['name'] ?? '';
      _slug.text = x['slug'] ?? '';
      _sku.text = x['sku'] ?? '';
      _hsn.text = x['hsn'] ?? '';
      _barcode.text = x['barcode'] ?? '';
      _desc.text = x['description'] ?? '';
      _price.text = _num(x['price']);
      _sale.text = _num(x['salePrice']);
      _stock.text = x['stock'] == null ? '' : '${x['stock']}';
      _gst = _num(x['gstRate'] ?? 0);
      _setUnit(x['unit'] as String?);
      _qty.text = _num(x['quantity']);
      _variantIds = ((x['variantIds'] as List?) ?? const []).map(toInt).toList();
      _category = x['categoryId'] == null ? null : toInt(x['categoryId']);
      _brand = x['brandId'] == null ? null : toInt(x['brandId']);
      _status = x['status'] == 'inactive' ? 'inactive' : 'active';
      _badge = x['badgeTag'] ?? 'none';
      _itemType = x['itemType'] ?? 'normal';
      _type = x['type'] ?? 'physical';
      _home = x['showOnHome'] == true;
      _campaign = x['isCampaign'] == true;
      _campaignPrice.text = _num(x['campaignPrice']);
      _serverPhoto = x['image'];
      _gallery = ((x['gallery'] as List?) ?? const []).cast<Map>().map((g) => Map<String, dynamic>.from(g)).toList();
      final sz = ((x['sizes'] as List?) ?? const []).cast<Map>();
      _sizes = sz.isEmpty ? [_SizeRow()..isDefault = true] : [for (final z in sz) _SizeRow(z)];
      // The unit is added automatically, so show just the number ("250 Gram" → "250").
      for (final z in _sizes) {
        z.label.text = _withoutUnit(z.label.text, _unitValue);
      }
      final sp = ((x['specs'] as List?) ?? const []).cast<Map>();
      _specs = sp.isEmpty ? [_SpecRow()] : [for (final z in sp) _SpecRow(z)];
    });
  }

  Future<void> _pickPhoto(ImageSource src) async {
    try {
      final x = await ImagePicker().pickImage(source: src, maxWidth: 2000, maxHeight: 2000, imageQuality: 88);
      if (x != null) {
        setState(() {
          _photo = x.path;
          _removePhoto = false;
        });
      }
    } catch (_) {
      if (mounted) toast(context, 'Could not open the ${src == ImageSource.camera ? 'camera' : 'photos'}.', error: true);
    }
  }

  Future<void> _addGallery(ImageSource src) async {
    try {
      if (src == ImageSource.camera) {
        final x = await ImagePicker().pickImage(source: src, maxWidth: 2000, maxHeight: 2000, imageQuality: 88);
        if (x != null) setState(() => _newGallery.add(x.path));
      } else {
        final xs = await ImagePicker().pickMultiImage(maxWidth: 2000, maxHeight: 2000, imageQuality: 88);
        if (xs.isNotEmpty) setState(() => _newGallery.addAll(xs.map((x) => x.path)));
      }
    } catch (_) {
      if (mounted) toast(context, 'Could not open the photos.', error: true);
    }
  }

  Future<void> _scanBarcode() async {
    final code = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const ScannerScreen(title: 'Scan the product barcode')));
    if (code == null || !mounted) return;
    setState(() => _barcode.text = code);
    _checkBarcode();
  }

  /// Warn at once when another product already has this barcode.
  void _checkBarcode() {
    final code = _barcode.text.trim();
    if (code.isEmpty) return;
    final other = findByCode(context.read<AppState>().list('products'), code);
    if (other != null && toInt(other['id']) != toInt(p['id'])) {
      toast(context, 'This barcode is already used by “${other['name']}”.', error: true);
    }
  }

  String get _unitValue => _unit == 'custom' ? _unitCustom.text.trim() : _unit;

  /// All fields exactly as the website form sends them.
  Map<String, String> _fields() {
    final sizes = _sizes.where((z) => !z.empty).toList();
    if (sizes.isNotEmpty && !sizes.any((z) => z.isDefault)) sizes.first.isDefault = true;
    return {
      'name': _name.text.trim(), 'slug': _slug.text.trim(), 'sku': _sku.text.trim(), 'hsn_code': _hsn.text.trim(), 'barcode': _barcode.text.trim(),
      'description': _desc.text.trim(), 'category_id': _category?.toString() ?? '', 'subcategory_id': '', 'brand_id': _brand?.toString() ?? '',
      'unit': _unitValue, 'product_type': _type, 'price': _price.text.trim(), 'sale_price': _sale.text.trim(),
      'stock_qty': _stock.text.trim().isEmpty ? '0' : _stock.text.trim(), 'gst_rate': _gst.isEmpty ? '0' : _gst,
      'status': _status, 'badge_tag': _badge, 'item_type': _itemType,
      if (_home) 'show_on_home': 'on',
      if (_campaign) 'is_campaign': 'on',
      'campaign_price': _campaignPrice.text.trim(),
      'quantity': _qty.text.trim(),
      'variant_ids': _variantIds.join(','),
      'sizes': jsonEncode([for (final z in sizes) {...z.toJson(), 'label': _withUnit(z.label.text, _unitValue)}]),
      'specs': jsonEncode([for (final x in _specs) if (x.name.text.trim().isNotEmpty && x.value.text.trim().isNotEmpty) {'name': x.name.text.trim(), 'value': x.value.text.trim()}]),
      if (_removePhoto && _photo == null) 'remove_image': '1',
      if (_removedGallery.isNotEmpty) 'removed_gallery_ids': _removedGallery.join(','),
    };
  }

  Map<String, String> _files() => {
        'image': ?_photo,
        for (var i = 0; i < _newGallery.length; i++) 'gallery_images#$i': _newGallery[i],
      };

  Future<void> _save({bool another = false}) async {
    if (!_form.currentState!.validate()) {
      toast(context, 'Please fix the highlighted fields.', error: true);
      return;
    }
    final s = context.read<AppState>();
    setState(() => _busy = true);
    final name = _name.text.trim();

    if (!_isNew && !_full) {
      await _quickEdit(s, name);
      return;
    }

    final fields = _fields();
    final r = await s.sendNow(OutboxItem(
      id: newId(),
      method: _isNew ? 'POST' : 'PUT',
      path: _isNew ? '/api/ecommerce/products2' : '/api/ecommerce/products2/${p['id']}',
      label: _isNew ? 'New product: $name' : 'Edit product: $name',
      refresh: const ['products'],
      multipart: true,
      fields: fields,
      files: _files(),
      effect: _isNew
          ? null
          : {
              'kind': 'product', 'id': p['id'],
              'fields': {
                'name': name, 'price': double.tryParse(_price.text.trim()), 'salePrice': double.tryParse(_sale.text.trim()), 'stock': int.tryParse(_stock.text.trim()),
                'unit': _unitValue, 'quantity': double.tryParse(_qty.text.trim()), 'sku': _sku.text.trim(), 'barcode': _barcode.text.trim(), 'categoryId': _category, 'brandId': _brand, 'status': _status,
                'gstRate': double.tryParse(_gst) ?? 0,
              },
            },
    ));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) {
      toast(context, r.message, error: true);
      return;
    }
    final offline = !r.ok;
    toast(context, offline ? 'Saved offline — it will be sent when you are online.' : (_isNew ? 'Product added.' : 'Saved.'));
    if (another) {
      // The next product (usually the next size) stays linked to these variants plus the one just made.
      final newId = r.ok ? r.data['id'] : null;
      if (newId != null) _variantIds = [..._variantIds, toInt(newId)];
      _resetForNext();
    } else {
      Navigator.pop(context);
    }
  }

  /// Offline edit before the full details were loaded: only the synced fields change.
  Future<void> _quickEdit(AppState s, String name) async {
    final changes = <String, dynamic>{};
    void diff(String key, dynamic now, dynamic before) {
      if ('${now ?? ''}' != '${before ?? ''}') changes[key] = now;
    }
    diff('name', name, p['name']);
    diff('price', double.tryParse(_price.text.trim()), p['price'] == null ? null : toDouble(p['price']));
    diff('salePrice', _sale.text.trim().isEmpty ? null : double.tryParse(_sale.text.trim()), p['salePrice'] == null ? null : toDouble(p['salePrice']));
    diff('gstRate', double.tryParse(_gst) ?? 0, toDouble(p['gstRate']));
    if (p['stock'] != null) diff('stock', int.tryParse(_stock.text.trim()), p['stock']);
    diff('unit', _unitValue, p['unit'] ?? '');
    diff('quantity', double.tryParse(_qty.text.trim()), p['quantity'] == null ? null : toDouble(p['quantity']));
    diff('sku', _sku.text.trim(), p['sku'] ?? '');
    diff('barcode', _barcode.text.trim(), p['barcode'] ?? '');
    diff('hsn', _hsn.text.trim(), p['hsn'] ?? '');
    diff('categoryId', _category, p['categoryId']);
    diff('brandId', _brand, p['brandId']);
    diff('status', _status, p['status']);
    ApiResult? r;
    if (changes.isNotEmpty) {
      r = await s.sendNow(OutboxItem(
        id: newId(), method: 'PATCH', path: '/api/app/v1/products/${p['id']}', body: changes, label: 'Edit product: $name',
        effect: {'kind': 'product', 'id': p['id'], 'fields': changes}, refresh: const ['products'],
      ));
    }
    if (_photo != null && (r == null || r.ok || r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy)) {
      await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/app/v1/products/${p['id']}/image', files: {'image': _photo!}, label: 'New photo: $name', refresh: const ['products']));
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null && (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden)) return toast(context, r.message, error: true);
    toast(context, r == null || r.ok ? 'Saved.' : 'Saved offline — will sync when online.');
    Navigator.pop(context);
  }

  /// "Save & add another": keep the choices people repeat (category, brand, unit, GST, tags, status).
  void _resetForNext() {
    setState(() {
      for (final c in [_name, _slug, _sku, _barcode, _price, _sale, _campaignPrice, _qty]) {
        c.clear();
      }
      _stock.text = '0';
      _photo = null;
      _newGallery.clear();
      _sizes = [_SizeRow()..isDefault = true];
      _specs = [_SpecRow()];
      _home = false;
      _campaign = false;
    });
  }

  // ───────────────────────── UI ─────────────────────────

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final wide = isWide(context);
    final cats = s.list('categories').where((c) => c['status'] == 'active' || toInt(c['id']) == _category).toList();
    final brands = s.list('brands').where((b) => b['status'] == 'active' || toInt(b['id']) == _brand).toList();
    final gstRates = ((_opts['gstRates'] as List?) ?? const []).cast<Map>();
    final badges = ((_opts['badges'] as List?) ?? const []).cast<Map>();
    final itemTypes = ((_opts['itemTypes'] as List?) ?? const []).cast<Map>();
    final lockExtra = !_full; // offline edit: website-only parts wait for the internet

    String? req(String? v) => v == null || v.trim().isEmpty ? 'Required' : null;
    String? amount(String? v) => v == null || v.trim().isEmpty ? null : ((double.tryParse(v.trim()) ?? -1) < 0 ? 'Enter a valid amount' : null);
    final hasSizes = _sizes.any((z) => !z.empty);

    _Dec dec(String label, {String? hint, String? prefix, Widget? suffix, String? helper}) => _Dec(label, hint, prefix, suffix, helper);
    // Windows: label above a compact field; phones: the floating-label field.
    Widget tf({
      required TextEditingController controller,
      required _Dec label,
      FormFieldValidator<String>? validator,
      TextInputType? keyboardType,
      bool enabled = true,
      int? minLines,
      int maxLines = 1,
      TextCapitalization textCapitalization = TextCapitalization.none,
      VoidCallback? onEditingComplete,
    }) {
      final required = label.label.endsWith(' *');
      final text = required ? label.label.substring(0, label.label.length - 2) : label.label;
      if (wide) {
        return DTextField(
          controller: controller, label: text, required: required, labelHint: label.helper, hint: label.hint, prefixText: label.prefix, suffix: label.suffix,
          validator: validator, keyboardType: keyboardType, enabled: enabled, minLines: minLines, maxLines: maxLines, textCapitalization: textCapitalization,
          onSubmitted: onEditingComplete == null ? null : (_) => onEditingComplete(),
        );
      }
      return TextFormField(
        controller: controller, validator: validator, keyboardType: keyboardType, enabled: enabled, minLines: minLines, maxLines: maxLines,
        textCapitalization: textCapitalization, onEditingComplete: onEditingComplete,
        decoration: InputDecoration(labelText: label.label, hintText: label.hint, prefixText: label.prefix, suffixIcon: label.suffix, helperText: label.helper, helperMaxLines: 2),
      );
    }

    Widget two(Widget a, Widget b) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 10), Expanded(child: b)]);

    final basic = _Section(icon: LucideIcons.info, title: 'Basic Info', children: [
      tf(controller: _name, validator: req, textCapitalization: TextCapitalization.words, label: dec('Product Name *', hint: 'e.g. Aashirvaad Atta 5kg')),
      tf(controller: _slug, enabled: !lockExtra, label: dec('Slug', hint: 'auto-generated', helper: 'Made from the name automatically')),
      two(tf(controller: _sku, label: dec('SKU', hint: 'e.g. SKU-00123')), tf(controller: _hsn, label: dec('HSN Code', helper: 'For GST'))),
      tf(
        controller: _barcode,
        onEditingComplete: _checkBarcode,
        label: dec('Barcode / QR Code', hint: 'Scan or leave blank', helper: _isNew ? 'Blank = automatic barcode (EM00000123)' : null,
            suffix: Platform.isAndroid ? IconButton(tooltip: 'Scan', icon: Icon(Icons.qr_code_scanner_rounded, color: AppColors.primary), onPressed: _scanBarcode) : null),
      ),
      tf(controller: _desc, enabled: !lockExtra, minLines: 3, maxLines: 8, label: dec('Description', hint: 'What should customers know about this product?')),
    ]);

    Widget thumb(Widget img, VoidCallback onRemove) => Stack(clipBehavior: Clip.none, children: [
          ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(width: 72, height: 72, child: img)),
          Positioned(
            right: -6,
            top: -6,
            child: InkWell(
              onTap: onRemove,
              child: Container(padding: const EdgeInsets.all(3), decoration: const BoxDecoration(color: AppColors.red, shape: BoxShape.circle), child: const Icon(Icons.close_rounded, size: 14, color: Colors.white)),
            ),
          ),
        ]);
    final showPhoto = _photo != null || (_serverPhoto != null && !_removePhoto);
    final images = _Section(icon: LucideIcons.image, title: 'Product Images', children: [
      Center(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: 200,
            height: 200,
            color: const Color(0xFFF4F4F7),
            child: _photo != null
                ? Image.file(File(_photo!), fit: BoxFit.cover)
                : showPhoto
                    ? NetImage(_serverPhoto, size: 200, radius: 12)
                    : const Icon(LucideIcons.imageUp, size: 40, color: AppColors.faint),
          ),
        ),
      ),
      Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
        if (Platform.isAndroid) OutlinedButton.icon(onPressed: () => _pickPhoto(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined, size: 18), label: const Text('Camera')),
        OutlinedButton.icon(onPressed: () => _pickPhoto(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined, size: 18), label: Text(Platform.isAndroid ? 'Gallery' : 'Choose photo')),
        if (showPhoto && !lockExtra)
          TextButton.icon(
            onPressed: () => setState(() {
              _photo = null;
              _removePhoto = true;
            }),
            style: TextButton.styleFrom(foregroundColor: AppColors.red),
            icon: const Icon(Icons.delete_outline_rounded, size: 18),
            label: const Text('Remove'),
          ),
      ]),
      if (!lockExtra) ...[
        const Divider(height: 20),
        Row(children: [
          const Icon(LucideIcons.images, size: 16, color: AppColors.muted),
          const SizedBox(width: 8),
          const Expanded(child: Text('Gallery', style: TextStyle(fontWeight: FontWeight.w600))),
          Text('${_gallery.where((g) => !_removedGallery.contains(toInt(g['id']))).length + _newGallery.length} photos', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ]),
        Wrap(spacing: 12, runSpacing: 12, children: [
          for (final g in _gallery.where((g) => !_removedGallery.contains(toInt(g['id']))))
            thumb(NetImage(g['image'], size: 72, radius: 10), () => setState(() => _removedGallery.add(toInt(g['id'])))),
          for (final f in _newGallery) thumb(Image.file(File(f), fit: BoxFit.cover), () => setState(() => _newGallery.remove(f))),
          InkWell(
            onTap: () => _galleryPick(),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.border, width: 1.5)),
              child: const Icon(Icons.add_rounded, color: AppColors.faint),
            ),
          ),
        ]),
      ],
    ]);

    final gstItems = <DropdownMenuItem<String>>[
      if (gstRates.isEmpty) for (final g in const ['0', '5', '12', '18', '28']) DropdownMenuItem(value: g, child: Text('$g%')),
      for (final g in gstRates) DropdownMenuItem(value: _num(g['rate']), child: Text('${g['label'] ?? '${_num(g['rate'])}%'}${g['isDefault'] == true ? ' · Default' : ''}')),
    ];
    if (!gstItems.any((i) => i.value == _gst)) gstItems.add(DropdownMenuItem(value: _gst, child: Text('$_gst% (current)')));

    final pricing = _Section(icon: LucideIcons.indianRupee, title: 'Pricing & Stock', children: [
      two(
        AppSelect<String>(label: 'Unit', helper: 'How it is sold', value: _unit, options: [('', 'No unit'), for (final u in _units) (u, u), ('custom', 'Custom…')], onChanged: (v) => setState(() => _unit = v)),
        tf(
          controller: _qty,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: (v) => v == null || v.trim().isEmpty ? null : ((double.tryParse(v.trim()) ?? 0) <= 0 ? 'Enter a number like 1 or 250' : null),
          label: dec('Quantity (weight)', hint: 'e.g. 10', helper: _unitValue.isEmpty ? 'Pick the unit first' : 'e.g. 10 = 10 $_unitValue',
              suffix: _unitValue.isEmpty ? null : Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8), child: Text(_unitValue, style: const TextStyle(color: AppColors.muted)))),
        ),
      ),
      if (_unit == 'custom') two(
        tf(controller: _unitCustom, validator: req, label: dec('Custom unit', hint: 'e.g. Dozen')),
        const SizedBox(),
      ),
      two(
        tf(
          controller: _price,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: (v) => hasSizes && (v ?? '').trim().isEmpty ? null : (req(v) ?? amount(v)),
          label: dec(hasSizes ? 'Price (₹)' : 'Price (₹) *', prefix: '₹ ', helper: hasSizes ? 'Blank = default size price' : null),
        ),
        tf(
          controller: _sale,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          label: dec('Sale Price (₹)', prefix: '₹ ', helper: 'Optional'),
          validator: (v) {
            final e = amount(v);
            if (e != null) return e;
            final sp = double.tryParse(v?.trim() ?? ''), pr = double.tryParse(_price.text.trim());
            return sp != null && pr != null && sp > 0 && sp >= pr ? 'Must be lower than price' : null;
          },
        ),
      ),
      two(
        tf(
          controller: _stock,
          enabled: _type == 'physical',
          keyboardType: TextInputType.number,
          validator: (v) => v != null && v.trim().isNotEmpty && (int.tryParse(v.trim()) ?? -1) < 0 ? 'Whole number' : null,
          label: dec('Stock Quantity'),
        ),
        AppSelect<String>(label: 'GST Rate', helper: 'Auto in bills', value: _gst, options: [for (final i in gstItems) (i.value!, (i.child as Text).data!)], onChanged: (v) => setState(() => _gst = v)),
      ),
    ]);

    final categorization = _Section(icon: LucideIcons.listTree, title: 'Categorization', children: [
      AppSelect<int?>(label: 'Category', value: _category, options: [(null, 'Select category…'), for (final c in cats) (toInt(c['id']), '${c['name']}')], onChanged: (v) => setState(() => _category = v)),
      AppSelect<int?>(label: 'Brand', value: _brand, options: [(null, 'Select brand…'), for (final b in brands) (toInt(b['id']), '${b['name']}')], onChanged: (v) => setState(() => _brand = v)),
    ]);

    final sizes = _Section(
      icon: LucideIcons.scale,
      title: 'Sizes / Units',
      optional: true,
      locked: lockExtra,
      children: [
        const Text('Sell in multiple sizes (e.g. 500 g, 1 Kg), each with its own MRP and price. Leave empty for a single-price product.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
        for (var i = 0; i < _sizes.length; i++)
          Container(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
            decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(10)),
            child: Column(children: [
              Row(children: [
                IconButton(
                  tooltip: 'Default size',
                  icon: Icon(_sizes[i].isDefault ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: _sizes[i].isDefault ? AppColors.primary : AppColors.faint),
                  onPressed: () => setState(() {
                    for (final z in _sizes) {
                      z.isDefault = false;
                    }
                    _sizes[i].isDefault = true;
                  }),
                ),
                Expanded(
                  child: tf(
                    controller: _sizes[i].label,
                    keyboardType: _unitValue.isEmpty ? null : const TextInputType.numberWithOptions(decimal: true),
                    validator: (v) => _sizes[i].empty ? null : req(v),
                    // The unit from Categorization is added automatically — type just the number.
                    label: dec('Size / Unit', hint: _unitValue.isEmpty ? 'e.g. 500 g' : 'e.g. 500',
                        suffix: _unitValue.isEmpty ? null : Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8), child: Text(_unitValue, style: const TextStyle(color: AppColors.muted)))),
                  ),
                ),
                IconButton(
                  onPressed: () => setState(() => _sizes.length == 1 ? _sizes = [_SizeRow()..isDefault = true] : _sizes.removeAt(i)),
                  icon: const Icon(Icons.close_rounded, color: AppColors.red),
                ),
              ]),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(children: [
                  Expanded(child: tf(controller: _sizes[i].mrp, keyboardType: const TextInputType.numberWithOptions(decimal: true), label: dec('MRP ₹'), validator: (v) => _sizes[i].empty ? null : (req(v) ?? amount(v)))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: tf(
                      controller: _sizes[i].price,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      label: dec('Selling ₹'),
                      validator: (v) {
                        final e = amount(v);
                        if (e != null) return e;
                        final sp = double.tryParse(v?.trim() ?? ''), m = double.tryParse(_sizes[i].mrp.text.trim());
                        return sp != null && m != null && sp > m ? '≤ MRP' : null;
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: tf(controller: _sizes[i].stock, keyboardType: TextInputType.number, label: dec('Stock'))),
                ]),
              ),
            ]),
          ),
        Align(alignment: Alignment.centerLeft, child: OutlinedButton.icon(onPressed: () => setState(() => _sizes.add(_SizeRow())), icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add Size / Unit'))),
      ],
    );

    final byId = {for (final x in s.list('products')) toInt(x['id']): x};
    final variants = _Section(
      icon: LucideIcons.layers,
      title: 'Variants',
      optional: true,
      locked: lockExtra,
      children: [
        for (final id in _variantIds)
          () {
            final v = byId[id];
            return Container(
              padding: const EdgeInsets.fromLTRB(8, 6, 4, 6),
              decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(desktop(context) ? 6 : 10)),
              child: Row(children: [
                NetImage(v?['image'], size: 36, radius: 6),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(v == null ? 'Product #$id' : (packOf(v) ?? 'No quantity set'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text(v == null ? 'Not in this device yet — sync to see it' : '${v['name']} · ${money(CartLine.shelfPrice(v))}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                  ]),
                ),
                IconButton(tooltip: 'Copy its details into this form', icon: const Icon(LucideIcons.copy, size: 16), onPressed: () => _copyFrom(id)),
                IconButton(tooltip: 'Unlink', icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.red), onPressed: () => setState(() => _variantIds.remove(id))),
              ]),
            );
          }(),
        Align(alignment: Alignment.centerLeft, child: OutlinedButton.icon(onPressed: _pickVariant, icon: const Icon(Icons.add_link_rounded, size: 18), label: const Text('Link a product'))),
      ],
    );

    final specs = _Section(
      icon: LucideIcons.listChecks,
      title: 'Specifications',
      optional: true,
      locked: lockExtra,
      children: [
        const Text('Shown as a list on the product page, e.g. Material: Cotton. Only filled rows are saved.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
        for (var i = 0; i < _specs.length; i++)
          Row(children: [
            Expanded(child: tf(controller: _specs[i].name, textCapitalization: TextCapitalization.sentences, label: dec('Name', hint: 'e.g. Material'))),
            const SizedBox(width: 8),
            Expanded(flex: 2, child: tf(controller: _specs[i].value, textCapitalization: TextCapitalization.sentences, label: dec('Value', hint: 'e.g. Cotton'))),
            IconButton(onPressed: () => setState(() => _specs.length == 1 ? _specs = [_SpecRow()] : _specs.removeAt(i)), icon: const Icon(Icons.close_rounded, color: AppColors.red)),
          ]),
        Align(alignment: Alignment.centerLeft, child: OutlinedButton.icon(onPressed: () => setState(() => _specs.add(_SpecRow())), icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add Specification'))),
      ],
    );

    List<DropdownMenuItem<String>> tagItems(List<Map> list, String none, String noneLabel, String current) => [
          DropdownMenuItem(value: none, child: Text(noneLabel)),
          for (final t in list.where((t) => t['slug'] != none)) DropdownMenuItem(value: '${t['slug']}', child: Text('${t['label']}')),
          if (current != none && !list.any((t) => t['slug'] == current)) DropdownMenuItem(value: current, child: Text(current)),
        ];

    final organization = _Section(icon: LucideIcons.slidersHorizontal, title: 'Organization', children: [
      AppSegmented<String>(options: const [('active', 'Published'), ('inactive', 'Unpublished')], value: _status, onChanged: (v) => setState(() => _status = v)),
      if (!lockExtra) ...[
        AppSelect<String>(label: 'Badge Tag', helper: 'Optional', value: _badge, options: [for (final i in tagItems(badges, 'none', 'None', _badge)) (i.value!, (i.child as Text).data!)], onChanged: (v) => setState(() => _badge = v)),
        AppSelect<String>(label: 'Item Type', helper: 'Optional', value: _itemType, options: [for (final i in tagItems(itemTypes, 'normal', 'Normal', _itemType)) (i.value!, (i.child as Text).data!)], onChanged: (v) => setState(() => _itemType = v)),
        wide
            ? DSwitchRow(label: 'Show on home page', hint: "Feature this product on the shop's home page.", value: _home, onChanged: (v) => setState(() => _home = v))
            : SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Show on home page'), subtitle: const Text("Feature this product on the shop's home page."), value: _home, onChanged: (v) => setState(() => _home = v)),
        wide
            ? DSwitchRow(label: 'Campaign product', hint: 'Include in the current campaign offer.', value: _campaign, onChanged: (v) => setState(() => _campaign = v))
            : SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Campaign product'), subtitle: const Text('Include in the current campaign offer.'), value: _campaign, onChanged: (v) => setState(() => _campaign = v)),
        if (_campaign) tf(controller: _campaignPrice, keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: amount, label: dec('Campaign price (₹)', prefix: '₹ ', helper: 'Optional')),
      ],
    ]);

    final buttons = Row(children: [
      if (_isNew) ...[
        Expanded(
          child: OutlinedButton.icon(
            onPressed: _busy ? null : () => _save(another: true),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Save & add another'),
          ),
        ),
        const SizedBox(width: 10),
      ],
      Expanded(
        child: FilledButton.icon(
          onPressed: _busy || _loading ? null : _save,
          icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : const Icon(Icons.save_outlined),
          label: Text(_isNew ? 'Create Product' : 'Save changes'),
        ),
      ),
    ]);

    final notes = <Widget>[
      if (_loading) const Padding(padding: EdgeInsets.only(bottom: 12), child: LinearProgressIndicator(minHeight: 3)),
      if (_loadNote != null)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.amberSoft, borderRadius: BorderRadius.circular(10)),
          child: Text(_loadNote!, style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.w500)),
        ),
    ];

    final body = wide
        ? ListView(padding: const EdgeInsets.all(24), children: [
            ...notes,
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(flex: 13, child: Column(children: [basic, pricing, categorization, variants, sizes, specs])),
              const SizedBox(width: 20),
              Expanded(flex: 7, child: Column(children: [images, organization])),
            ]),
            buttons,
            const SizedBox(height: 30),
          ])
        : ListView(padding: const EdgeInsets.fromLTRB(14, 14, 14, 30), children: [...notes, basic, images, pricing, categorization, variants, sizes, specs, organization, buttons]);

    return Scaffold(
      backgroundColor: wide ? W.g50 : null,
      appBar: wide
          ? WebAppBar(title: _isNew ? 'Add Product' : 'Edit Product', subtitle: _isNew ? 'Fill in the details for your new product' : 'Change price, stock, photos and every detail')
          : AppBar(title: Text(_isNew ? 'Add product' : 'Edit product')),
      body: Form(key: _form, child: body),
    );
  }

  /// Pick a product to link: search name / ID / barcode in the synced list (works offline), filtered to a brand.
  Future<void> _pickVariant() async {
    final s = context.read<AppState>();
    final all = s.list('products');
    final brands = s.list('brands');
    int? brand = _brand;
    String q = '';
    final picked = await showAppSheet<int>(
      context,
      title: 'Link a variant',
      width: 560,
      scrollControlled: true,
      builder: (c) => StatefulBuilder(builder: (c, set) {
        final words = q.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
        final code = q.trim().isEmpty ? null : findByCode(all, q.trim());
        final list = all.where((x) {
          final id = toInt(x['id']);
          if (id == toInt(p['id']) || _variantIds.contains(id)) return false;
          if (brand != null && toInt(x['brandId']) != brand) return false;
          if (code != null) return id == toInt(code['id']);
          return words.every('${x['name']} ${x['id']} ${x['sku'] ?? ''}'.toLowerCase().contains);
        }).take(60).toList();
        return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AppField(label: 'Search', hint: 'Name, product ID or barcode', autofocus: true, prefixIcon: Icons.search_rounded, onChanged: (v) => set(() => q = v)),
          const AppGap(),
          AppSelect<int?>(label: 'Brand', value: brand, options: [(null, 'All brands'), for (final b in brands) (toInt(b['id']), '${b['name']}')], onChanged: (v) => set(() => brand = v)),
          const AppGap(),
          SizedBox(
            height: 320,
            child: list.isEmpty
                ? const Center(child: Text('No products found.', style: TextStyle(color: AppColors.muted)))
                : ListView(children: [
                    for (final x in list)
                      AppChoice(
                        leading: NetImage(x['image'], size: 32, radius: 6),
                        title: '${x['name']}',
                        subtitle: ['#${x['id']}', ?packOf(x), money(CartLine.shelfPrice(x))].join(' · '),
                        onTap: () => popDialog(c, toInt(x['id'])),
                      ),
                  ]),
          ),
        ]);
      }),
    );
    if (picked != null && mounted) setState(() => _variantIds = [..._variantIds, picked]);
  }

  /// Fill this form from a linked variant (description, category, brand, unit, GST, specs…).
  Future<void> _copyFrom(int id) async {
    final s = context.read<AppState>();
    final r = await s.api.get('/api/app/v1/products/$id');
    if (!mounted) return;
    final x = r.ok ? Map<String, dynamic>.from(r.data['product']) : s.list('products').where((e) => toInt(e['id']) == id).firstOrNull;
    if (x == null) return toast(context, r.message, error: true);
    setState(() {
      if (_name.text.trim().isEmpty) _name.text = '${x['name'] ?? ''}';
      if (x['description'] != null) _desc.text = '${x['description']}';
      if (x['hsn'] != null) _hsn.text = '${x['hsn']}';
      if (x['categoryId'] != null) _category = toInt(x['categoryId']);
      if (x['brandId'] != null) _brand = toInt(x['brandId']);
      _setUnit(x['unit'] as String?);
      _gst = _num(x['gstRate'] ?? 0);
      if (_price.text.trim().isEmpty) {
        _price.text = _num(x['price']);
        _sale.text = _num(x['salePrice']);
      }
      if (x['badgeTag'] != null) _badge = '${x['badgeTag']}';
      if (x['itemType'] != null) _itemType = '${x['itemType']}';
      final sp = ((x['specs'] as List?) ?? const []).cast<Map>();
      if (sp.isNotEmpty) _specs = [for (final z in sp) _SpecRow(z)];
    });
    toast(context, r.ok ? 'Details copied. Change the size, price and barcode for this one.' : 'Offline — copied the basic details only.');
  }

  Future<void> _galleryPick() async {
    if (!Platform.isAndroid) return _addGallery(ImageSource.gallery);
    final src = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take a photo'), onTap: () => Navigator.pop(c, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose photos'), onTap: () => Navigator.pop(c, ImageSource.gallery)),
        ]),
      ),
    );
    if (src != null) _addGallery(src);
  }
}

/// A titled card of the form (same sections as the website form).
class _Section extends StatelessWidget {
  final IconData icon;
  final String title;
  final bool optional;
  final bool locked;
  final List<Widget> children;
  const _Section({required this.icon, required this.title, required this.children, this.optional = false, this.locked = false});
  @override
  Widget build(BuildContext context) {
    final body = locked
        ? const Text('Connect to the internet to see and change this.', style: TextStyle(color: AppColors.muted))
        : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(height: 12), children[i]]]);
    if (desktop(context)) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DCard(title: optional ? '$title  (optional)' : title, icon: icon, child: body),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(width: 32, height: 32, decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 16, color: AppColors.primary)),
            const SizedBox(width: 10),
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (optional) const Text('  (optional)', style: TextStyle(color: AppColors.muted, fontSize: 13)),
          ]),
          const SizedBox(height: 14),
          body,
        ]),
      ),
    );
  }
}

class _Dec {
  final String label;
  final String? hint, prefix, helper;
  final Widget? suffix;
  const _Dec(this.label, this.hint, this.prefix, this.suffix, this.helper);
}
