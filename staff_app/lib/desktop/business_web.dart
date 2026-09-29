import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/adaptive.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/kit.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';
import 'tax_web.dart';

/// "Business Settings" as on the website: a menu of sections on the left — Business Identity,
/// Contact Information, Logo & Branding, Social Media, Tax & Legal, Invoice Settings, POS
/// Shortcuts, Barcode & Orders, Delivery Charge, GST / Tax Rates — and one "Save Settings" that
/// saves every section together. Opens offline; a save made offline goes out when the internet is back.
class BusinessWeb extends StatelessWidget {
  final String section;
  const BusinessWeb({super.key, this.section = 'identity'});
  @override
  Widget build(BuildContext context) => NativeData(name: 'business', builder: (context, data, reload) => _Biz(data: Map<String, dynamic>.from((data as Map?) ?? const {}), reload: reload, section: section));
}

class _Biz extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  final String section;
  const _Biz({required this.data, required this.reload, required this.section});
  @override
  State<_Biz> createState() => _BizState();
}

const _socialPlatforms = [('facebook', 'Facebook'), ('instagram', 'Instagram'), ('youtube', 'YouTube'), ('x', 'X (Twitter)'), ('linkedin', 'LinkedIn'), ('whatsapp', 'WhatsApp'), ('telegram', 'Telegram'), ('pinterest', 'Pinterest'), ('other', 'Other')];
const _fkeys = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
const _accents = ['#9f2089', '#2563eb', '#16a34a', '#dc2626', '#d97706', '#0891b2', '#111827'];

class _BizState extends State<_Biz> {
  static final _def = displayDefs['ecom_business_settings_display']!;
  final _prefs = DisplayPrefs(_def.key);
  late String _active = widget.section;
  final _t = <String, TextEditingController>{};
  final _choice = <String, String>{};
  late List<TextEditingController> _phones;
  late Set<String> _onInvoice;
  late List<(String, TextEditingController)> _social;
  late int _logoWidth;
  String? _newLogo;
  late Map<String, dynamic> _inv;
  late String _invStart;
  bool _saving = false;

  Map<String, dynamic> get _b => Map<String, dynamic>.from((widget.data['business'] as Map?) ?? const {});

  @override
  void initState() {
    super.initState();
    final b = _b;
    _phones = [for (final n in ((b['contactNumbers'] as List?) ?? const [])) TextEditingController(text: '$n')];
    _onInvoice = {for (final n in ((b['invoiceContactNumbers'] as List?) ?? const [])) '$n'};
    _social = [for (final x in ((b['socialMediaJson'] as List?) ?? const []).cast<Map>()) ('${x['platform'] ?? 'other'}', TextEditingController(text: '${x['url'] ?? ''}'))];
    _logoWidth = toInt(b['logoDisplayWidth'] ?? 150);
    _inv = _deepCopy(widget.data['invoice'] as Map? ?? const {});
    _invStart = '$_inv';
  }

  static Map<String, dynamic> _deepCopy(Map m) => {
        for (final e in m.entries) '${e.key}': e.value is Map ? _deepCopy(e.value as Map) : e.value is List ? [for (final x in e.value as List) x is Map ? _deepCopy(x) : x] : e.value,
      };

  TextEditingController _c(String k) => _t[k] ??= TextEditingController(text: '${_b[k] ?? ''}');

  Future<void> _save() async {
    if (_c('businessName').text.trim().isEmpty) {
      setState(() => _active = 'identity');
      return toast(context, 'Business name is required.', error: true);
    }
    setState(() => _saving = true);
    final s = context.read<AppState>();
    final nums = [for (final c in _phones) c.text.trim()].where((x) => x.isNotEmpty).toList();
    final body = <String, dynamic>{
      for (final e in _t.entries) e.key: e.value.text,
      ..._choice,
      'contactNumbers': nums,
      'invoiceNumbers': nums.where(_onInvoice.contains).toList(),
      'socialMedia': [for (final (p, c) in _social) if (c.text.trim().isNotEmpty) {'platform': p, 'url': c.text.trim()}],
      'logoDisplayWidth': _logoWidth,
    };
    await s.sendNow(OutboxItem(id: newId(), method: 'PATCH', path: '/api/app/v1/business', label: 'Business settings', body: body, refresh: const ['settings']));
    if ('$_inv' != _invStart) {
      await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/invoice-settings', label: 'Invoice settings', body: _inv));
      _invStart = '$_inv';
    }
    if (_newLogo != null) {
      await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/app/v1/business', label: 'Business logo', multipart: true, files: {'logo': _newLogo!}, refresh: const ['settings']));
    }
    if (!mounted) return;
    setState(() => _saving = false);
    toast(context, s.online ? 'Settings saved.' : 'Saved — it will be sent when you are online.');
    if (s.online) widget.reload();
  }

  // ── small form pieces ──
  Widget _field(String k, String label, {int lines = 1, String? hint, String? help, bool upper = false}) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        DTextField(controller: _c(k), label: label, maxLines: lines, minLines: lines > 1 ? lines : null, hint: hint, textCapitalization: upper ? TextCapitalization.characters : TextCapitalization.none),
        if (help != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(help, style: const TextStyle(fontSize: 12, color: W.g500))),
      ]);
  Widget _two(Widget a, Widget b) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 12), Expanded(child: b)]);
  Widget _select(String k, String label, List<(String, String)> opts) => WebSelect<String>(label: label, value: _choice[k] ?? ('${_b[k] ?? ''}'.isEmpty ? opts.first.$1 : '${_b[k]}'), options: opts, onChanged: (v) => setState(() => _choice[k] = v));
  Widget _panel(IconData icon, String title, List<Widget> children, {String? hint}) => WebCard(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(width: 34, height: 34, decoration: BoxDecoration(color: const Color(0xFFFDF0F9), borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 17, color: const Color(0xFF9F2089))),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: W.g900)),
              if (hint != null) Text(hint, style: const TextStyle(fontSize: 12.5, color: W.g500)),
            ])),
          ]),
          const SizedBox(height: 16),
          ...children,
        ]),
      );
  Widget _check(bool v, String label, ValueChanged<bool> on) => InkWell(
        onTap: () => setState(() => on(!v)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [IgnorePointer(child: Checkbox(value: v, onChanged: (_) {})), Flexible(child: Text(label, style: const TextStyle(fontSize: 13.5, color: W.g800)))]),
      );
  bool _ib(String k) => _inv[k] == true;
  void _iset(String k, Object? v) => setState(() => _inv[k] = v);

  Widget _section() {
    const gap = SizedBox(height: 12);
    switch (_active) {
      case 'contact':
        return _panel(LucideIcons.contact, 'Contact Information', hint: 'Tick a number to have it printed on invoices.', [
          _two(_field('email', 'Email'), _field('websiteUrl', 'Website URL')),
          const SizedBox(height: 16),
          const Text('Contact Numbers', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.g600)),
          const SizedBox(height: 6),
          for (final (i, c) in _phones.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Expanded(child: DTextField(controller: c, hint: 'Phone number', keyboardType: TextInputType.phone, onChanged: (_) => setState(() {}))),
                const SizedBox(width: 8),
                _check(_onInvoice.contains(c.text.trim()), 'On invoice', (v) => v ? _onInvoice.add(c.text.trim()) : _onInvoice.remove(c.text.trim())),
                IconButton(tooltip: 'Remove number', onPressed: () => setState(() => _phones.removeAt(i)), icon: const Icon(LucideIcons.trash2, size: 15, color: Color(0xFFEF4444))),
              ]),
            ),
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _phones.add(TextEditingController())), icon: const Icon(LucideIcons.plus, size: 14), label: const Text('ADD NUMBER', style: TextStyle(fontWeight: FontWeight.w700)))),
        ]);
      case 'branding':
        final logo = context.read<AppState>().api.fileUrl(_b['logo'] as String?);
        return _panel(LucideIcons.image, 'Logo & Branding', [
          InkWell(
            onTap: () async {
              final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1200).catchError((_) => null);
              if (x != null) setState(() => _newLogo = x.path);
            },
            child: Container(
              height: 120,
              decoration: BoxDecoration(color: const Color(0xFFFAFAFC), border: Border.all(color: const Color(0xFFDCDCE6), width: 2), borderRadius: BorderRadius.circular(12)),
              alignment: Alignment.center,
              child: _newLogo != null
                  ? Image.file(File(_newLogo!), fit: BoxFit.contain)
                  : logo != null
                      ? Image.network(logo, fit: BoxFit.contain, errorBuilder: (_, _, _) => const Icon(LucideIcons.imagePlus, color: W.g400))
                      : const Column(mainAxisSize: MainAxisSize.min, children: [Icon(LucideIcons.imagePlus, color: W.g400), SizedBox(height: 4), Text('Upload logo', style: TextStyle(fontSize: 12, color: W.g400))]),
            ),
          ),
          if (_newLogo != null) const Padding(padding: EdgeInsets.only(top: 6), child: Text('New logo — it is uploaded when you press Save Settings.', style: TextStyle(fontSize: 12, color: W.g500))),
          gap,
          _two(
            _select('siteHeaderDisplay', 'Site Header Display', const [('both', 'Both'), ('title', 'Title only'), ('logo', 'Logo only')]),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Logo Display Width — ${_logoWidth}px', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
              Slider(value: _logoWidth.toDouble().clamp(40, 400), min: 40, max: 400, divisions: 72, onChanged: (v) => setState(() => _logoWidth = v.round())),
            ]),
          ),
        ]);
      case 'social':
        return _panel(LucideIcons.share2, 'Social Media Accounts', hint: 'Shown as the circular icons in the storefront footer.', [
          if (_social.isEmpty) const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('No links yet.', style: TextStyle(fontSize: 13, color: W.g400))),
          for (final (i, (p, c)) in _social.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                SizedBox(width: 170, child: WebSelect<String>(value: p, options: _socialPlatforms, onChanged: (v) => setState(() => _social[i] = (v, c)))),
                const SizedBox(width: 8),
                Expanded(child: DTextField(controller: c, hint: 'https://...')),
                IconButton(tooltip: 'Remove link', onPressed: () => setState(() => _social.removeAt(i)), icon: const Icon(LucideIcons.trash2, size: 15, color: Color(0xFFEF4444))),
              ]),
            ),
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _social.add(('facebook', TextEditingController()))), icon: const Icon(LucideIcons.plus, size: 14), label: const Text('ADD SOCIAL LINK', style: TextStyle(fontWeight: FontWeight.w700)))),
        ]);
      case 'tax':
        return _panel(LucideIcons.fileSpreadsheet, 'GST & Tax Details', hint: 'Just the values here — whether each one prints on your invoice is set in Invoice Settings.', [
          _two(_field('gstin', 'GSTIN', upper: true), _field('panNumber', 'PAN Number', upper: true)),
          gap,
          _two(_field('fssaiNumber', 'FSSAI Number'), _field('state', 'State')),
          gap,
          _field('returnPolicy', 'Return Policy', lines: 3, help: 'Shown to customers on the storefront.'),
        ]);
      case 'invoice':
        return _invoicePanel();
      case 'pos':
        return _panel(LucideIcons.keyboard, 'POS Shortcuts', hint: 'Keyboard keys on the billing screen. A4 / thermal printing is set in Invoice Settings.', [
          Row(children: [
            Expanded(child: _select('shortcutCompleteSale', 'Complete Sale', [for (final k in _fkeys) (k, k)])),
            const SizedBox(width: 12),
            Expanded(child: _select('shortcutPrint', 'Print', [for (final k in _fkeys) (k, k)])),
            const SizedBox(width: 12),
            Expanded(child: _select('shortcutNewSale', 'New Sale', [for (final k in _fkeys) (k, k)])),
          ]),
        ]);
      case 'orders':
        return _panel(LucideIcons.barcode, 'Barcode Label & Order ID Format', [
          _two(_field('barcodeFooterText', 'Barcode Footer Text', help: 'Printed under each barcode label.'), _field('orderIdPrefix', 'Order ID Prefix', upper: true, help: 'Order numbers are this prefix plus a running sequence.')),
        ]);
      case 'payment':
        return const _Payments();
      case 'login':
        return _Login(data: Map<String, dynamic>.from((widget.data['auth'] as Map?) ?? const {}), reload: widget.reload);
      case 'delivery':
        return _Delivery(data: Map<String, dynamic>.from((widget.data['delivery'] as Map?) ?? const {}), reload: widget.reload);
      default:
        return _panel(LucideIcons.building2, 'Business Identity', [
          _two(_field('businessName', 'Business Name *'), _field('tagline', 'Tagline')),
          gap,
          _field('seoDescription', 'SEO Description', lines: 2, help: "Used as the storefront's meta description."),
          gap,
          _two(_field('location', 'Location', help: 'The short place name shown in the storefront header.'), _field('businessHours', 'Business Hours', hint: 'e.g. 9 AM - 9 PM', help: "Falls back into the header's delivery-time line when that is left blank.")),
          gap,
          _field('address', 'Address', lines: 2),
        ]);
    }
  }

  Widget _invoicePanel() {
    const gap = SizedBox(height: 12);
    Map<String, dynamic> f(String k) => (_inv[k] as Map?)?.cast<String, dynamic>() ?? {'show': true, 'value': ''};
    final b = _b;
    final fallback = {
      'address': '${b['address'] ?? ''}', 'location': '${b['location'] ?? ''}', 'email': '${b['email'] ?? ''}', 'gstin': '${b['gstin'] ?? ''}', 'pan': '${b['panNumber'] ?? ''}', 'fssai': '${b['fssaiNumber'] ?? ''}',
      'phones': [for (final c in _phones) c.text.trim()].where((x) => x.isNotEmpty).join(', '),
    };
    Widget profileField(String k, String label, {bool multi = false}) {
      final v = f(k);
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 22), child: Tooltip(message: 'Print on invoices', child: Checkbox(value: v['show'] != false, onChanged: (x) => _iset(k, {...v, 'show': x == true})))),
        Expanded(
          child: DTextField(
            key: ValueKey('inv-$k'),
            initialValue: '${v['value'] ?? ''}',
            label: label,
            hint: fallback[k]!.isEmpty ? 'Not set' : fallback[k],
            maxLines: multi ? 2 : 1,
            onChanged: (x) => _inv[k] = {...f(k), 'value': x},
          ),
        ),
      ]);
    }

    final extras = ((_inv['extraIds'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    Widget choice(String id, String label, String blurb, IconData icon) {
      final sel = _inv['defaultPrint'] == id;
      return Expanded(
        child: InkWell(
          onTap: () => _iset('defaultPrint', id),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: sel ? const Color(0xFFFDF0F9) : Colors.white, border: Border.all(color: sel ? const Color(0xFF9F2089) : const Color(0xFFEAEAF2), width: 2), borderRadius: BorderRadius.circular(8)),
            child: Column(children: [
              Container(width: 38, height: 38, decoration: BoxDecoration(color: sel ? const Color(0xFF9F2089) : const Color(0xFFF3F3F7), shape: BoxShape.circle), child: Icon(icon, size: 18, color: sel ? Colors.white : W.g600)),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              Text(blurb, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5, color: W.g500)),
            ]),
          ),
        ),
      );
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _panel(LucideIcons.printer, 'When an invoice is generated', hint: 'What opens after a bill is completed and from the Print buttons on orders.', [
        Row(children: [
          choice('a4', 'A4 invoice', 'Full page, for records', LucideIcons.fileText),
          const SizedBox(width: 8),
          choice('thermal', 'Thermal receipt', 'Till slip on a receipt printer', LucideIcons.receiptText),
          const SizedBox(width: 8),
          choice('ask', 'Ask every time', 'Choose A4 or thermal each time', LucideIcons.messageCircleQuestion),
        ]),
        const SizedBox(height: 8),
        _check(_ib('autoPrint'), 'Open the print dialog straight away', (v) => _inv['autoPrint'] = v),
      ]),
      gap,
      _panel(LucideIcons.receiptText, 'Thermal receipt', hint: 'Pick a template — every option below applies to it.', [
        Row(children: [
          for (final (id, name, blurb) in const [('classic', 'Classic', 'Monospace, dashed lines'), ('modern', 'Modern', 'Clean with a bold total box'), ('compact', 'Compact', 'Two-line items, least paper'), ('gst', 'GST Detailed', 'HSN, GST % and a tax summary')]) ...[
            Expanded(
              child: InkWell(
                onTap: () => _iset('thermalTemplate', id),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: _inv['thermalTemplate'] == id ? const Color(0xFFFDF0F9) : Colors.white, border: Border.all(color: _inv['thermalTemplate'] == id ? const Color(0xFF9F2089) : const Color(0xFFEAEAF2), width: 2), borderRadius: BorderRadius.circular(8)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(name, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)), Text(blurb, style: const TextStyle(fontSize: 11.5, color: W.g500))]),
                ),
              ),
            ),
            if (id != 'gst') const SizedBox(width: 8),
          ],
        ]),
        gap,
        Row(children: [
          const Text('Paper width  ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          DSegmented<String>(options: const [('58mm', '58 mm'), ('80mm', '80 mm')], value: '${_inv['thermalWidth'] ?? '80mm'}', onChanged: (v) => _iset('thermalWidth', v)),
          const SizedBox(width: 24),
          const Text('Text size  ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          DSegmented<String>(options: const [('sm', 'Small'), ('md', 'Normal'), ('lg', 'Large')], value: '${_inv['thermalFont'] ?? 'md'}', onChanged: (v) => _iset('thermalFont', v)),
        ]),
      ]),
      gap,
      _panel(LucideIcons.palette, 'A4 invoice', hint: 'Colour, signature, terms and the amount in words.', [
        Row(children: [
          const Text('Invoice colour  ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          for (final c in _accents)
            InkWell(
              onTap: () => _iset('accent', c),
              child: Container(
                width: 30,
                height: 30,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(color: Color(int.parse('FF${c.substring(1)}', radix: 16)), shape: BoxShape.circle, border: '${_inv['accent']}'.toLowerCase() == c ? Border.all(color: W.g900, width: 2.5) : null),
                child: '${_inv['accent']}'.toLowerCase() == c ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
              ),
            ),
        ]),
        gap,
        Wrap(spacing: 18, children: [_check(_ib('showAmountInWords'), 'Amount in words', (v) => _inv['showAmountInWords'] = v), _check(_ib('showSignature'), 'Signature box', (v) => _inv['showSignature'] = v)]),
        if (_ib('showSignature')) ...[gap, DTextField(key: const ValueKey('inv-sig'), initialValue: '${_inv['signatureLabel'] ?? ''}', label: 'Signature label', onChanged: (v) => _inv['signatureLabel'] = v)],
        gap,
        DTextField(key: const ValueKey('inv-terms'), initialValue: '${_inv['terms'] ?? ''}', label: 'Terms & conditions', maxLines: 3, minLines: 3, hint: 'e.g. Goods once sold will not be taken back.', onChanged: (v) => _inv['terms'] = v),
      ]),
      gap,
      _panel(LucideIcons.heading, 'Invoice header', [
        Wrap(spacing: 18, children: [
          _check(_ib('showName'), 'Business name', (v) => _inv['showName'] = v),
          _check(_ib('showLogo'), 'Logo', (v) => _inv['showLogo'] = v),
          _check(_ib('showTagline'), 'Tagline', (v) => _inv['showTagline'] = v),
        ]),
        gap,
        _two(
          DTextField(key: const ValueKey('inv-title'), initialValue: '${_inv['title'] ?? 'Tax Invoice'}', label: 'Invoice title', hint: 'Tax Invoice', onChanged: (v) => _inv['title'] = v),
          _ib('showLogo')
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Logo width — ${toInt(_inv['logoWidth'] ?? 120)}px', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  Slider(value: toDouble(_inv['logoWidth'] ?? 120).clamp(40, 220), min: 40, max: 220, divisions: 36, onChanged: (v) => _iset('logoWidth', v.round())),
                ])
              : const SizedBox(),
        ),
      ]),
      gap,
      _panel(LucideIcons.hash, 'Invoice details', hint: 'Tick what to print.', [
        Wrap(spacing: 18, runSpacing: 4, children: [
          for (final (k, l) in const [('showInvoiceNo', 'Invoice No.'), ('showDate', 'Date'), ('showTime', 'Time'), ('showCustomer', 'Customer'), ('showPaymentMode', 'Payment mode'), ('showBarcode', 'Barcode'), ('showHsn', 'HSN code'), ('showTaxBreakup', 'GST summary')])
            _check(_ib(k), l, (v) => _inv[k] = v),
        ]),
      ]),
      gap,
      _panel(LucideIcons.mapPin, 'Business details', hint: 'Filled from your business profile. Type here to print something different on invoices only.', [
        profileField('address', 'Address', multi: true),
        gap,
        profileField('location', 'Location'),
        gap,
        profileField('phones', 'Contact number(s)'),
        gap,
        profileField('email', 'Email'),
      ]),
      gap,
      _panel(LucideIcons.idCard, 'GST / Tax details', hint: 'From Tax & Legal when filled there — or type them here.', [
        profileField('gstin', 'GSTIN'),
        gap,
        profileField('pan', 'PAN'),
        gap,
        profileField('fssai', 'FSSAI Lic. No.'),
        for (final (i, x) in extras.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(children: [
              Checkbox(value: x['show'] != false, onChanged: (v) => _iset('extraIds', [for (final (j, y) in extras.indexed) j == i ? {...y, 'show': v == true} : y])),
              SizedBox(width: 190, child: DTextField(key: ValueKey('ex-l-$i-${extras.length}'), initialValue: '${x['label'] ?? ''}', hint: 'Label (e.g. Udyam / SSI)', onChanged: (v) => (_inv['extraIds'] as List)[i] = {...extras[i], 'label': v, 'value': ((_inv['extraIds'] as List)[i] as Map)['value']})),
              const SizedBox(width: 8),
              Expanded(child: DTextField(key: ValueKey('ex-v-$i-${extras.length}'), initialValue: '${x['value'] ?? ''}', hint: 'Number', onChanged: (v) => (_inv['extraIds'] as List)[i] = {...((_inv['extraIds'] as List)[i] as Map).cast<String, dynamic>(), 'value': v})),
              IconButton(onPressed: () => _iset('extraIds', [for (final (j, y) in extras.indexed) if (j != i) y]), icon: const Icon(LucideIcons.trash2, size: 15, color: Color(0xFFDC2626))),
            ]),
          ),
        if (extras.length < 6)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(onPressed: () => _iset('extraIds', [...extras, {'label': '', 'value': '', 'show': true}]), icon: const Icon(LucideIcons.plus, size: 14), label: const Text('ADD ANOTHER ID (SSI, UDYAM, CIN…)', style: TextStyle(fontWeight: FontWeight.w700))),
          ),
      ]),
      gap,
      _panel(LucideIcons.messageSquareText, 'Footer', [
        DTextField(key: const ValueKey('inv-footer'), initialValue: '${_inv['footerNote'] ?? ''}', label: 'Thank-you message', maxLines: 2, minLines: 2, hint: 'Thank you, visit again!', onChanged: (v) => _inv['footerNote'] = v),
      ]),
    ]);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    bool m(String k) => _prefs.on('bs-menu', 'bs-m-$k');
    final menu = [
      if (m('identity')) ('identity', 'Business Identity', LucideIcons.building2),
      if (m('contact')) ('contact', 'Contact Information', LucideIcons.contact),
      if (m('branding')) ('branding', 'Logo & Branding', LucideIcons.image),
      if (m('social')) ('social', 'Social Media', LucideIcons.share2),
      if (m('tax')) ('tax', 'Tax & Legal', LucideIcons.fileSpreadsheet),
      if (m('invoice')) ('invoice', 'Invoice Settings', LucideIcons.receiptText),
      if (m('pos')) ('pos', 'POS Shortcuts', LucideIcons.keyboard),
      if (m('orders')) ('orders', 'Barcode & Orders', LucideIcons.barcode),
      ('delivery', 'Delivery Charge', LucideIcons.truck),
      if (m('payment')) ('payment', 'Payment Methods', LucideIcons.creditCard),
      if (m('gst')) ('gst', 'GST / Tax Rates', LucideIcons.percent),
      if (m('login')) ('login', 'Login & OTP', LucideIcons.shieldCheck),
    ];
    if (!menu.any((x) => x.$1 == _active) && menu.isNotEmpty) _active = menu.first.$1;
    final showSave = !const ['delivery', 'payment', 'login'].contains(_active);

    return WebPage(
      title: 'Business Settings',
      subtitle: 'Your shop details, invoices, tax and delivery',
      onRefresh: widget.reload,
      actions: [DisplayOptionsButton(_def)],
      children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            width: 240,
            child: WebCard(
              padding: const EdgeInsets.all(8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final (k, l, i) in menu)
                  Material(
                    color: _active == k ? const Color(0xFFFDF0F9) : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () {
                        if (k == 'gst') {
                          Navigator.push(context, MaterialPageRoute(builder: (_) => const TaxWeb()));
                          return;
                        }
                        setState(() => _active = k);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                        child: Row(children: [
                          Icon(i, size: 16, color: _active == k ? const Color(0xFF9F2089) : W.g500),
                          const SizedBox(width: 10),
                          Expanded(child: Text(l, style: TextStyle(fontSize: 13.5, fontWeight: _active == k ? FontWeight.w600 : FontWeight.w500, color: _active == k ? const Color(0xFF9F2089) : W.g700))),
                          if (k == 'gst') const Icon(LucideIcons.chevronRight, size: 14, color: W.g400),
                        ]),
                      ),
                    ),
                  ),
              ]),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(child: _section()),
        ]),
        if (showSave) ...[
          const SizedBox(height: 16),
          WebCard(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Row(children: [
              Expanded(child: Text(_prefs.item('bs-savenote') ? 'Changes in every section are saved together.' : '', style: const TextStyle(fontSize: 13, color: W.g500))),
              WebButton(_saving ? 'Saving…' : 'Save Settings', icon: LucideIcons.save, color: const Color(0xFF9F2089), onPressed: _saving ? null : _save),
            ]),
          ),
        ],
      ],
    );
  }
}

/// Delivery charge for online orders (its own save, as on the website's Delivery Settings).
class _Delivery extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _Delivery({required this.data, required this.reload});
  @override
  State<_Delivery> createState() => _DeliveryState();
}

class _DeliveryState extends State<_Delivery> {
  late bool _on = widget.data['enabled'] == true;
  late final _charge = TextEditingController(text: '${widget.data['charge'] ?? 0}');
  late final _free = TextEditingController(text: widget.data['freeAbove'] == null ? '' : '${widget.data['freeAbove']}');
  late final _note = TextEditingController(text: '${widget.data['note'] ?? ''}');
  @override
  Widget build(BuildContext context) => WebCard(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Delivery Charge', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: W.g900)),
          const Text('What online orders pay for delivery.', style: TextStyle(fontSize: 12.5, color: W.g500)),
          const SizedBox(height: 12),
          DSwitchRow(label: 'Charge for delivery on online orders', value: _on, onChanged: (v) => setState(() => _on = v)),
          if (_on) ...[
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: DTextField(controller: _charge, label: 'Delivery charge (₹)', keyboardType: const TextInputType.numberWithOptions(decimal: true))),
              const SizedBox(width: 12),
              Expanded(child: DTextField(controller: _free, label: 'Free delivery above (₹)', hint: 'Empty = never free', keyboardType: const TextInputType.numberWithOptions(decimal: true))),
            ]),
            const SizedBox(height: 12),
            DTextField(controller: _note, label: 'Note at checkout', labelHint: 'optional'),
          ],
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerLeft,
            child: WebButton('Save', icon: LucideIcons.save, color: const Color(0xFF9F2089), onPressed: () => nativeSend(
                  context,
                  OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/delivery-settings', label: 'Delivery charge', body: {'enabled': _on, 'charge': double.tryParse(_charge.text.trim()) ?? 0, 'freeAbove': _free.text.trim().isEmpty ? null : double.tryParse(_free.text.trim()), 'note': _note.text.trim()}),
                  reload: widget.reload,
                  done: 'Saved.',
                )),
          ),
        ]),
      );
}

/* ───────────────────────── Payment methods ───────────────────────── */

/// Payment Methods (website's Payment Settings): on / off, default at checkout, and each gateway's
/// details. Saved credentials never come to this computer — a blank field keeps what is saved.
class _Payments extends StatelessWidget {
  const _Payments();
  @override
  Widget build(BuildContext context) => NativeData(
        name: 'payments',
        builder: (context, data, reload) {
          final prefs = DisplayPrefs(displayDefs['ecom_payment_settings2_display']!.key);
          final methods = ((data as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          final def = methods.where((m) => m['isDefault'] == true).firstOrNull;
          Future<void> toggle(Map m) async {
            if (m['isEnabled'] != true && m['configured'] != true) return configure(context, m, reload);
            await nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/payment-settings2/${m['key']}', label: '${m['label']}: ${m['isEnabled'] == true ? 'off' : 'on'}', body: {'isEnabled': m['isEnabled'] != true},
                effect: {'kind': 'page_row_key', 'page': 'payments', 'key': m['key'], 'fields': {'isEnabled': m['isEnabled'] != true, if (m['isEnabled'] == true) 'isDefault': false}}), reload: reload, done: '${m['label']} ${m['isEnabled'] == true ? 'turned off' : 'turned on'}.');
          }

          Future<void> setDefault(Map m) => nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/payment-settings2/${m['key']}/default', label: 'Default payment ${m['label']}'), reload: reload, done: '${m['label']} is now the default.');
          IconData icon(String k) => switch (k) { 'cod' => LucideIcons.banknote, 'bank_transfer' => LucideIcons.landmark, _ => LucideIcons.creditCard };
          return ListenableBuilder(
            listenable: prefs,
            builder: (context, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: const Color(0xFFF0FDF4), border: Border.all(color: const Color(0xFFBBF7D0)), borderRadius: BorderRadius.circular(10)),
                child: const Row(children: [Icon(LucideIcons.shieldCheck, size: 16, color: Color(0xFF047857)), SizedBox(width: 8), Text('Credentials are stored server-side and never shown to customers.', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF047857)))]),
              ),
              const SizedBox(height: 12),
              ...webCardsRow(columns: 3, [
                if (prefs.on('pm2-cards', 'pm2-k-enabled')) WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF059669), value: '${methods.where((m) => m['isEnabled'] == true).length}', label: 'Enabled Methods'),
                if (prefs.on('pm2-cards', 'pm2-k-configured')) WebMetric(icon: LucideIcons.settings2, color: const Color(0xFF2563EB), value: '${methods.where((m) => m['configured'] == true).length}', label: 'Configured Methods'),
                if (prefs.on('pm2-cards', 'pm2-k-default')) WebMetric(icon: LucideIcons.shieldCheck, color: const Color(0xFF7C3AED), value: def == null ? 'None set' : '${def['label']}', label: 'Default Method'),
              ]),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: WebCard(
                    padding: const EdgeInsets.all(20),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const Text('Payment Methods', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
                      const Text('Turn methods on and configure their gateway credentials.', style: TextStyle(fontSize: 12.5, color: W.g500)),
                      const SizedBox(height: 8),
                      for (final m in methods)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g100))),
                          child: Row(children: [
                            Container(width: 42, height: 42, decoration: BoxDecoration(color: W.g50, borderRadius: BorderRadius.circular(8)), child: Icon(icon('${m['key']}'), size: 19, color: W.g600)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                                  Text('${m['label']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.g900)),
                                  if (m['isDefault'] == true) const WebBadge('Default', color: Color(0xFF6D28D9), bg: Color(0xFFF5F3FF)),
                                  if (m['isEnabled'] == true && m['configured'] != true) const WebBadge('Needs setup', color: Color(0xFFB45309), bg: Color(0xFFFFFBEB)),
                                ]),
                                Text('${m['text'] ?? ''}'.isEmpty ? _payBlurb['${m['key']}'] ?? '' : '${m['text']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g500)),
                              ]),
                            ),
                            Switch(value: m['isEnabled'] == true, onChanged: (_) => toggle(m)),
                            SizedBox(width: 64, child: Text(m['isEnabled'] == true ? 'Active' : 'Inactive', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: W.g700))),
                            WebButton('Configure', icon: LucideIcons.settings2, onPressed: () => configure(context, m, reload)),
                          ]),
                        ),
                    ]),
                  ),
                ),
                if (prefs.on('pm2-default', 'pm2-default-panel')) ...[
                  const SizedBox(width: 16),
                  SizedBox(
                    width: 300,
                    child: WebCard(
                      padding: const EdgeInsets.all(18),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        const Text('Default Payment Method', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
                        const Text('Pre-selected at checkout. Customers can still choose another.', style: TextStyle(fontSize: 12.5, color: W.g500)),
                        const SizedBox(height: 10),
                        for (final m in methods)
                          InkWell(
                            onTap: m['isEnabled'] == true && m['isDefault'] != true ? () => setDefault(m) : null,
                            child: Opacity(
                              opacity: m['isEnabled'] == true ? 1 : .5,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                child: Row(children: [
                                  Icon(m['isDefault'] == true ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, size: 18, color: m['isDefault'] == true ? const Color(0xFF2563EB) : W.g400),
                                  const SizedBox(width: 10),
                                  Expanded(child: Text('${m['label']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500))),
                                  if (m['isEnabled'] != true) const Text('Disabled', style: TextStyle(fontSize: 12, color: W.g400)),
                                ]),
                              ),
                            ),
                          ),
                      ]),
                    ),
                  ),
                ],
              ]),
            ]),
          );
        },
      );

  static Future<void> configure(BuildContext context, Map m, Future<void> Function() reload) async {
    final fields = ((m['fields'] as List?) ?? const []).cast<Map>();
    final filled = Map<String, dynamic>.from((m['filled'] as Map?) ?? const {});
    final text = TextEditingController(text: '${m['text'] ?? ''}');
    final ctl = {for (final f in fields) '${f['key']}': TextEditingController()};
    var enable = m['isEnabled'] == true;
    final ok = await showAppDialog<bool>(
      context,
      title: 'Configure ${m['label']}',
      icon: LucideIcons.settings2,
      width: 520,
      builder: (d) => StatefulBuilder(
        builder: (d, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          DTextField(controller: text, label: 'Text shown at checkout', labelHint: 'optional', maxLines: 2, minLines: 2),
          for (final f in fields) ...[
            const SizedBox(height: 12),
            f['options'] is List
                ? WebSelect<String>(label: '${f['label']}', value: ctl['${f['key']}']!.text.isEmpty ? '' : ctl['${f['key']}']!.text, options: [('', filled['${f['key']}'] == true ? 'Keep saved value' : 'Choose…'), for (final o in (f['options'] as List)) ('$o', '$o')], onChanged: (v) => set(() => ctl['${f['key']}']!.text = v))
                : DTextField(controller: ctl['${f['key']}'], label: '${f['label']}', hint: filled['${f['key']}'] == true ? '•••••• saved — leave blank to keep' : 'Not set'),
          ],
          const SizedBox(height: 8),
          DSwitchRow(label: 'Enable this method', value: enable, onChanged: (v) => set(() => enable = v)),
        ]),
      ),
      actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async {
        final missing = fields.where((f) => filled['${f['key']}'] != true && ctl['${f['key']}']!.text.trim().isEmpty).toList();
        if (enable && missing.isNotEmpty) return toast(context, 'Fill in every field before enabling this method.', error: true);
        popDialog(context, true);
      })],
    );
    if (ok != true || !context.mounted) return;
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: 'PUT', path: '/api/ecommerce/payment-settings2/${m['key']}', label: 'Payment ${m['label']}', multipart: true,
        fields: {'name': '${m['label']}', 'text': text.text.trim(), 'is_enabled': enable ? '1' : '0', 'keep_blank': '1', for (final e in ctl.entries) 'field_${e.key}': e.value.text.trim()},
        effect: {'kind': 'page_row_key', 'page': 'payments', 'key': m['key'], 'fields': {'text': text.text.trim(), 'isEnabled': enable, 'configured': fields.every((f) => filled['${f['key']}'] == true || ctl['${f['key']}']!.text.trim().isNotEmpty)}},
      ),
      reload: reload,
      done: '${m['label']} settings saved.',
    );
  }
}

const _payBlurb = {
  'cod': 'Customer pays in cash when the order is delivered — no gateway credentials needed.',
  'paytm': 'Accept UPI, wallet and card payments through the Paytm gateway.',
  'phonepe': 'Accept UPI and card payments through the PhonePe gateway.',
  'razorpay': 'Accept UPI, cards, netbanking and wallets through Razorpay.',
  'bank_transfer': 'Customer transfers directly to your bank account — you confirm payment manually.',
};

/* ───────────────────────── Login & OTP ───────────────────────── */

class _Login extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _Login({required this.data, required this.reload});
  @override
  State<_Login> createState() => _LoginState();
}

class _LoginState extends State<_Login> {
  static final _prefs = DisplayPrefs(displayDefs['ecom_login_settings_display']!.key);
  late bool _otp = widget.data['otpEnabled'] == true, _pw = widget.data['passwordLogin'] != false;
  late final _cc = TextEditingController(text: '${widget.data['countryCode'] ?? '+91'}');
  late final Map<String, TextEditingController> _fb = {
    for (final k in const ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId']) k: TextEditingController(text: '${(widget.data['firebase'] as Map?)?[k] ?? ''}'),
  };
  final _paste = TextEditingController();

  bool get _configured => ['apiKey', 'authDomain', 'projectId', 'appId'].every((k) => _fb[k]!.text.trim().isNotEmpty);

  void _applyPaste(String v) {
    for (final k in _fb.keys) {
      final m = RegExp('$k\\s*:\\s*["\']([^"\']+)["\']').firstMatch(v);
      if (m != null) _fb[k]!.text = m.group(1)!;
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: _prefs,
        builder: (context, _) {
          bool on(String k) => _prefs.on('ls-sections', k);
          final live = _otp && _configured;
          Widget row(IconData i, String title, String sub, Widget trailing) => Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g100))),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(i, size: 18, color: W.g500),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: W.g800)), Text(sub, style: const TextStyle(fontSize: 12, color: W.g500))])),
                  trailing,
                ]),
              );
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (on('ls-status')) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: live ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB), border: Border.all(color: live ? const Color(0xFFA7F3D0) : const Color(0xFFFDE68A)), borderRadius: BorderRadius.circular(10)),
                child: Row(children: [
                  Icon(live ? LucideIcons.circleCheck : LucideIcons.circleAlert, size: 18, color: live ? const Color(0xFF047857) : const Color(0xFF92400E)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(live ? 'Mobile OTP login is live on your store.' : 'Customers log in with email/mobile + password. Set up Firebase to turn on OTP login.', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: live ? const Color(0xFF065F46) : const Color(0xFF92400E)))),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            if (on('ls-options')) ...[
              WebCard(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('Login options', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
                  const SizedBox(height: 8),
                  row(LucideIcons.smartphone, 'Mobile OTP login & sign-up', 'Customers enter their mobile number and verify with an OTP. New numbers get an account and then fill in their name, email and addresses.', Switch(value: _otp, onChanged: (v) => setState(() => _otp = v))),
                  row(LucideIcons.keyRound, 'Allow password login for customers', 'Customers who have set a password can log in with mobile/email + password. Staff login is never affected.', Switch(value: _pw, onChanged: (v) => setState(() => _pw = v))),
                  row(LucideIcons.messageSquareText, 'Country code', 'Added in front of the number customers type.', SizedBox(width: 90, child: DTextField(controller: _cc, textAlign: TextAlign.center))),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            if (on('ls-firebase')) ...[
              WebCard(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    const Expanded(child: Text('Firebase web config', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900))),
                    _configured ? const WebBadge('Filled', color: Color(0xFF047857), bg: Color(0xFFECFDF5)) : const WebBadge('Not set', color: W.g500, bg: W.g100),
                  ]),
                  const Text('These values identify your Firebase project; they are public (they go to the browser) — no secret key is needed.', style: TextStyle(fontSize: 12, color: W.g500)),
                  const SizedBox(height: 12),
                  DTextField(controller: _paste, label: 'Quick fill: paste the whole firebaseConfig code here', maxLines: 3, minLines: 3, hint: 'const firebaseConfig = { apiKey: "AIza…", authDomain: "…", projectId: "…", appId: "1:…" };', onChanged: _applyPaste),
                  const SizedBox(height: 12),
                  Row(children: [Expanded(child: DTextField(controller: _fb['apiKey'], label: 'API key', hint: 'AIzaSy…', onChanged: (_) => setState(() {}))), const SizedBox(width: 12), Expanded(child: DTextField(controller: _fb['authDomain'], label: 'Auth domain', hint: 'your-project.firebaseapp.com', onChanged: (_) => setState(() {})))]),
                  const SizedBox(height: 12),
                  Row(children: [Expanded(child: DTextField(controller: _fb['projectId'], label: 'Project ID', hint: 'your-project', onChanged: (_) => setState(() {}))), const SizedBox(width: 12), Expanded(child: DTextField(controller: _fb['appId'], label: 'App ID', hint: '1:1234567890:web:abc123', onChanged: (_) => setState(() {})))]),
                  const SizedBox(height: 12),
                  DTextField(controller: _fb['messagingSenderId'], label: 'Messaging sender ID', labelHint: 'optional', hint: '1234567890'),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            if (on('ls-steps')) ...[
              WebCard(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('How to set up Firebase OTP', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
                  const Text('About 10 minutes, one time.', style: TextStyle(fontSize: 12, color: W.g500)),
                  const SizedBox(height: 10),
                  for (final (i, t) in const [
                    'Open console.firebase.google.com and create a project (any name).',
                    'Add a Web app (the </> icon) and copy its firebaseConfig.',
                    'Build → Authentication → Sign-in method → turn on Phone.',
                    'Authentication → Settings → Authorized domains → add your shop domain.',
                    'Paste the config above, turn on Mobile OTP login and Save.',
                  ].indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Container(width: 22, height: 22, alignment: Alignment.center, decoration: const BoxDecoration(color: Color(0xFF9F2089), shape: BoxShape.circle), child: Text('${i + 1}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
                        const SizedBox(width: 10),
                        Expanded(child: Text(t, style: const TextStyle(fontSize: 13, color: W.g700))),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            WebCard(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(children: [
                const Spacer(),
                WebButton('Save Settings', icon: LucideIcons.save, color: const Color(0xFF9F2089), onPressed: () {
                  if (_otp && !_configured) return toast(context, 'Fill in the Firebase config first, or keep OTP login off.', error: true);
                  final body = {'otpEnabled': _otp, 'passwordLogin': _pw, 'countryCode': _cc.text.trim(), 'firebase': {for (final e in _fb.entries) e.key: e.value.text.trim()}};
                  nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/auth-settings', label: 'Login settings', body: body, effect: {'kind': 'page_set', 'page': 'business', 'path': ['auth'], 'value': body}),
                      reload: widget.reload, done: "Saved — the store's login page uses these settings now.");
                }),
              ]),
            ),
          ]);
        },
      );
}
