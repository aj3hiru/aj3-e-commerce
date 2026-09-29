import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../ds/ds.dart';
import '../../widgets/common.dart';
import '../../widgets/web.dart';
import '../account/update.dart' show openUpdate;
import '../shell/shell.dart' show isNewer;
import 'kit.dart';

List<Map<String, dynamic>> _list(dynamic v) => ((v as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

/* ───────────────────────── Push notifications ───────────────────────── */

class PushPage extends StatelessWidget {
  const PushPage({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'push', builder: (context, data, reload) => _PushBody(data: Map<String, dynamic>.from(data as Map), reload: reload));
}

class _PushBody extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _PushBody({required this.data, required this.reload});
  @override
  State<_PushBody> createState() => _PushBodyState();
}

class _PushBodyState extends State<_PushBody> {
  final _title = TextEditingController(), _body = TextEditingController(), _url = TextEditingController(), _image = TextEditingController();
  String _kind = 'product';
  bool _sending = false;

  /// Fills the message for a product, category or coupon picked from the phone's own lists.
  Future<void> _pick() async {
    final s = context.read<AppState>();
    final shop = '${s.settings['businessName'] ?? 'our store'}';
    final base = Uri.parse(s.api.server).replace(host: Uri.parse(s.api.server).host.replaceFirst('admin.', '')).origin;
    final items = switch (_kind) {
      'product' => [for (final p in s.list('products').where((p) => p['status'] == 'active')) (p, '${p['name']}', money(p['salePrice'] ?? p['price']))],
      'category' => [for (final c in s.list('categories').where((c) => c['status'] == 'active')) (c, '${c['name']}', 'Category')],
      _ => [for (final c in s.list('coupons')) (c, '${c['code']}', '${c['title']}')],
    };
    final picked = await showAppSheet<Map<String, dynamic>>(context, title: 'Choose', scrollControlled: true, builder: (c) => SizedBox(
          height: 420,
          child: ListView(children: [for (final (m, t, sub) in items) AppChoice(title: t, subtitle: sub, onTap: () => popDialog(c, m))]),
        ));
    if (picked == null) return;
    setState(() {
      if (_kind == 'product') {
        final price = money(toDouble(picked['salePrice'] ?? picked['price']));
        _title.text = '✨ ${picked['name']} — now $price';
        _body.text = 'Available at $shop. Tap to order before it sells out!';
        _url.text = '$base/product?slug=${Uri.encodeComponent('${picked['slug'] ?? picked['id']}')}';
        _image.text = picked['image'] == null ? '' : '$base/${picked['image']}';
      } else if (_kind == 'category') {
        _title.text = '🛍️ Explore ${picked['name']}';
        _body.text = 'Fresh picks in ${picked['name']} at $shop. Tap to shop now.';
        _url.text = '$base/category?slug=${Uri.encodeComponent('${picked['slug'] ?? ''}')}';
      } else {
        final off = picked['discountType'] == 'percentage' ? '${picked['discountValue']}% OFF' : '${money(picked['discountValue'])} OFF';
        _title.text = '🎟️ $off — use code ${picked['code']}';
        _body.text = 'Apply ${picked['code']} at checkout on $shop.';
        _url.text = base;
      }
    });
  }

  Future<void> _send() async {
    if (_title.text.trim().isEmpty || _url.text.trim().isEmpty) return toast(context, 'Add a title and a link.', error: true);
    final subs = toInt(widget.data['subscribers']);
    final api = context.read<AppState>().api;
    if (!await confirm(context, 'Send this notification?', '“${_title.text.trim()}” goes to $subs subscriber${subs == 1 ? '' : 's'}.')) return;
    setState(() => _sending = true);
    if (!mounted) return;
    final r = await api.send('POST', '/api/push2/send', body: {'title': _title.text.trim(), 'body': _body.text.trim(), 'url': _url.text.trim(), 'image': _image.text.trim().isEmpty ? null : _image.text.trim()});
    if (!mounted) return;
    setState(() => _sending = false);
    if (r.ok) {
      toast(context, 'Queued for ${r.data['totalSubscribers'] ?? subs} subscribers.');
      _title.clear();
      _body.clear();
      widget.reload();
    } else {
      toast(context, r.outcome == ApiOutcome.offline ? 'Sending needs the internet.' : '${r.data['error'] ?? r.message}', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final history = _list(d['history']);
    return NativeScreen(
      title: 'Push Notifications',
      subtitle: 'Promote products, categories and offers to shoppers who allowed notifications',
      onRefresh: widget.reload,
      children: [
        NStats([
          (LucideIcons.users, const Color(0xFF2563EB), '${d['subscribers']}', 'Subscribers'),
          (LucideIcons.megaphone, const Color(0xFF7C3AED), '${history.length}', 'Recent campaigns'),
          (LucideIcons.circleCheck, const Color(0xFF16A34A), '${history.fold<int>(0, (t, h) => t + toInt(h['sent']))}', 'Delivered'),
          (d['configured'] == true ? LucideIcons.shieldCheck : LucideIcons.triangleAlert, d['configured'] == true ? const Color(0xFF16A34A) : const Color(0xFFDC2626), d['configured'] == true ? 'Ready' : 'Not set up', 'Sending'),
        ]),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Compose', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 10),
            Wrap(spacing: 6, children: [
              for (final (k, l) in const [('product', 'Product'), ('category', 'Category'), ('offer', 'Offer / Coupon'), ('custom', 'Custom link')])
                ChoiceChip(label: Text(l), selected: _kind == k, onSelected: (_) {
                  setState(() => _kind = k);
                  if (k != 'custom') _pick();
                }),
            ]),
            const AppGap(),
            AppField(controller: _title, label: 'Title', required: true),
            const AppGap(),
            AppField(controller: _body, label: 'Message', maxLines: 2),
            const AppGap(),
            AppField(controller: _url, label: 'Link', required: true, keyboardType: TextInputType.url),
            const AppGap(),
            AppField(controller: _image, label: 'Picture link', helper: 'Optional'),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerLeft,
              child: DButton('Send to all subscribers', icon: LucideIcons.send, variant: DVariant.success, loading: _sending, onPressed: d['configured'] == true ? _send : null),
            ),
          ]),
        ),
        NList(
          cols: const [WebCol('Notification', flex: 2.4), WebCol('Sent', flex: .7), WebCol('Failed', flex: .7), WebCol('Status', flex: .9), WebCol('Date', flex: 1)],
          empty: 'No notifications sent yet.',
          rows: [
            for (final h in history)
              NRow(
                title: '${h['title']}',
                subtitle: '${h['sent'] ?? 0} delivered · ${dateTime(h['createdAt'])}',
                trailing: Text('${h['status']}'),
                cells: [Cell2('${h['title']}', b: '${h['body'] ?? ''}'), Text('${h['sent'] ?? 0}'), Text('${h['failed'] ?? 0}'), Text('${h['status']}'), Text(dateTime(h['createdAt']))],
              ),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Business settings (with tax & delivery) ───────────────────────── */

class BusinessSettingsPage extends StatelessWidget {
  final String section; // business | tax | delivery
  const BusinessSettingsPage({super.key, this.section = 'business'});
  @override
  Widget build(BuildContext context) => NativeData(name: 'business', builder: (context, data, reload) => _BizBody(data: Map<String, dynamic>.from(data as Map), reload: reload, section: section));
}

class _BizBody extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  final String section;
  const _BizBody({required this.data, required this.reload, required this.section});
  @override
  State<_BizBody> createState() => _BizBodyState();
}

class _BizBodyState extends State<_BizBody> {
  late String _tab = widget.section;
  final _c = <String, TextEditingController>{};
  final _flags = <String, bool>{};
  final _choice = <String, String>{};
  bool _saving = false;

  Map<String, dynamic> get _b => Map<String, dynamic>.from(widget.data['business'] as Map? ?? {});
  TextEditingController _t(String k) => _c[k] ??= TextEditingController(text: '${_b[k] ?? ''}');

  Future<void> _saveBusiness() async {
    setState(() => _saving = true);
    final body = <String, dynamic>{
      for (final e in _c.entries) if (!e.key.startsWith('_')) e.key: e.value.text,
      ..._flags,
      ..._choice,
      if (_c['_phones'] != null) 'contactNumbers': _c['_phones']!.text.split(',').map((x) => x.trim()).where((x) => x.isNotEmpty).toList(),
    };
    await nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/app/v1/business', label: 'Business settings', body: body, refresh: const ['settings']), reload: widget.reload, done: 'Saved.');
    if (mounted) setState(() => _saving = false);
  }

  Widget _field(String k, String label, {int lines = 1, String? hint}) => AppField(controller: _t(k), label: label, maxLines: lines, hint: hint);
  Widget _flag(String k, String label) => SwitchListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text(label), value: _flags[k] ?? _b[k] == true, onChanged: (v) => setState(() => _flags[k] = v));
  Widget _pick(String k, String label, List<(String, String)> opts) => AppSelect<String>(label: label, value: _choice[k] ?? '${_b[k] ?? opts.first.$1}', options: opts, onChanged: (v) => setState(() => _choice[k] = v));

  @override
  Widget build(BuildContext context) {
    final phones = ((_b['contactNumbers'] as List?) ?? const []).join(', ');
    _c['_phones'] ??= TextEditingController(text: phones);
    final tabs = const [('business', 'Business'), ('invoice', 'Invoice & POS'), ('tax', 'GST / Tax'), ('delivery', 'Delivery Charge')];
    Widget section;
    switch (_tab) {
      case 'invoice':
        section = WebCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _field('invoiceTitle', 'Invoice title'),
          const AppGap(),
          _field('invoiceFooterNote', 'Invoice footer note', lines: 3),
          const AppGap(),
          _field('returnPolicy', 'Return policy', lines: 3),
          const AppGap(),
          _pick('printerFormat', 'Bill paper', const [('thermal_80', 'Thermal 80 mm'), ('thermal_58', 'Thermal 58 mm'), ('a4', 'A4')]),
          const AppGap(),
          _pick('posPrintMode', 'Printing in billing', const [('both', 'Ask (thermal or A4)'), ('thermal', 'Thermal only'), ('a4', 'A4 only')]),
          const AppGap(),
          _pick('invoiceDisplay', 'Invoice header shows', const [('both', 'Logo and name'), ('logo', 'Logo only'), ('name', 'Name only')]),
          _flag('showGstinOnInvoice', 'Show GSTIN on invoices'),
          _flag('showAddressOnInvoice', 'Show address on invoices'),
          _flag('showPanOnInvoice', 'Show PAN on invoices'),
          _flag('showFssaiOnInvoice', 'Show FSSAI on invoices'),
          const AppGap(),
          Row(children: [
            Expanded(child: _pick('shortcutCompleteSale', 'Complete sale key', [for (var i = 2; i <= 12; i++) ('F$i', 'F$i')])),
            const SizedBox(width: 10),
            Expanded(child: _pick('shortcutNewSale', 'New sale key', [for (var i = 2; i <= 12; i++) ('F$i', 'F$i')])),
          ]),
          const AppGap(),
          _field('barcodeFooterText', 'Line at the bottom of barcode labels'),
          const AppGap(),
          _field('orderIdPrefix', 'Order number starts with', hint: 'ORD'),
          const SizedBox(height: 14),
          Align(alignment: Alignment.centerLeft, child: DButton('Save', icon: LucideIcons.save, loading: _saving, onPressed: _saveBusiness)),
        ]));
      case 'tax':
        section = _TaxSection(data: widget.data, reload: widget.reload);
      case 'delivery':
        section = _DeliverySection(data: Map<String, dynamic>.from(widget.data['delivery'] as Map? ?? {}), reload: widget.reload);
      default:
        section = WebCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _field('businessName', 'Business name'),
          const AppGap(),
          _field('tagline', 'Tagline'),
          const AppGap(),
          _field('address', 'Address', lines: 3),
          const AppGap(),
          AppField(controller: _c['_phones'], label: 'Phone numbers', helper: 'Separate with commas'),
          const AppGap(),
          _field('email', 'Email'),
          const AppGap(),
          _field('businessHours', 'Opening hours', hint: '08:00 am to 10:00 pm'),
          const AppGap(),
          Row(children: [Expanded(child: _field('gstin', 'GSTIN')), const SizedBox(width: 10), Expanded(child: _field('state', 'State'))]),
          const AppGap(),
          Row(children: [Expanded(child: _field('panNumber', 'PAN')), const SizedBox(width: 10), Expanded(child: _field('fssaiNumber', 'FSSAI'))]),
          const SizedBox(height: 14),
          Align(alignment: Alignment.centerLeft, child: DButton('Save', icon: LucideIcons.save, loading: _saving, onPressed: _saveBusiness)),
        ]));
    }
    return NativeScreen(
      title: 'Business Settings',
      subtitle: 'Your shop details, invoices, tax and delivery',
      onRefresh: widget.reload,
      children: [NFilters(hint: '', onSearch: (_) {}, tabs: tabs, tab: _tab, onTab: (v) => setState(() => _tab = v)), section],
    );
  }
}

class _TaxSection extends StatelessWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _TaxSection({required this.data, required this.reload});

  Future<void> _slab(BuildContext context, Map<String, dynamic>? g) async {
    final label = TextEditingController(text: g?['label'] ?? ''), rate = TextEditingController(text: g == null ? '' : '${g['rate']}');
    final ok = await showAppDialog<bool>(context, title: g == null ? 'Add GST slab' : 'Edit ${g['label']}', icon: LucideIcons.percent, builder: (c) => Column(mainAxisSize: MainAxisSize.min, children: [
          AppField(controller: label, label: 'Name', autofocus: true, hint: 'GST 5%'),
          const AppGap(),
          AppField(controller: rate, label: 'Rate %', keyboardType: const TextInputType.numberWithOptions(decimal: true)),
        ]), actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))]);
    if (ok != true || !context.mounted) return;
    await nativeSend(context, OutboxItem(id: newId(), method: g == null ? 'POST' : 'PUT', path: g == null ? '/api/ecommerce/tax-rates2' : '/api/ecommerce/tax-rates2/${g['id']}', label: 'GST slab ${label.text}', body: {'label': label.text.trim(), 'rate': double.tryParse(rate.text.trim())}), reload: reload, done: 'Saved.');
  }

  @override
  Widget build(BuildContext context) {
    final inclusive = (data['tax'] as Map?)?['pricesIncludeTax'] == true;
    final slabs = _list(data['gstRates']);
    Widget opt(bool v, String title, String ex) => Expanded(
          child: WebCard(
            borderColor: inclusive == v ? DS.primary : null,
            onTap: inclusive == v ? null : () => nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/tax-mode', label: 'Prices ${v ? 'include' : 'exclude'} GST', body: {'pricesIncludeTax': v}, refresh: const ['settings']), reload: reload, done: 'Saved.'),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(inclusive == v ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: inclusive == v ? DS.primary : W.g400, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w700)), Text(ex, style: const TextStyle(fontSize: 12, color: W.g500))])),
            ]),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Prices and GST', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Flex(direction: isWide(context) ? Axis.horizontal : Axis.vertical, children: [
        opt(true, 'Prices include GST', '₹118 at 18% → customer pays ₹118'),
        const SizedBox(width: 10, height: 10),
        opt(false, 'GST added on top', '₹100 at 18% → customer pays ₹118'),
      ]),
      const SizedBox(height: 14),
      Row(children: [const Expanded(child: Text('GST slabs', style: TextStyle(fontWeight: FontWeight.w700))), DButton('Add slab', icon: LucideIcons.plus, size: DSize.sm, onPressed: () => _slab(context, null))]),
      const SizedBox(height: 8),
      NList(
        cols: const [WebCol('Name', flex: 1.6), WebCol('Rate', flex: .8), WebCol('Default', flex: .8), WebCol('Actions', width: 100)],
        rows: [
          for (final g in slabs)
            NRow(
              title: '${g['label']}',
              subtitle: '${g['rate']}%${g['isDefault'] == true ? ' · Default' : ''}',
              onTap: () => _slab(context, g),
              cells: [
                Text('${g['label']}'),
                Text('${g['rate']}%'),
                g['isDefault'] == true ? const WebBadge('Default', color: Color(0xFFB45309), bg: Color(0xFFFEF3C7)) : webDash,
                Row(children: [
                  DButton.icon(LucideIcons.squarePen, tooltip: 'Edit', variant: DVariant.ghost, onPressed: () => _slab(context, g)),
                  DButton.icon(LucideIcons.trash2, tooltip: 'Delete', variant: DVariant.ghost, onPressed: () async {
                    if (await confirm(context, 'Delete ${g['label']}?', 'Products keep their current rate.', danger: true) && context.mounted) {
                      await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/tax-rates2/${g['id']}', label: 'Delete GST slab'), reload: reload, done: 'Deleted.');
                    }
                  }),
                ]),
              ],
            ),
        ],
      ),
    ]);
  }
}

class _DeliverySection extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _DeliverySection({required this.data, required this.reload});
  @override
  State<_DeliverySection> createState() => _DeliverySectionState();
}

class _DeliverySectionState extends State<_DeliverySection> {
  late bool _on = widget.data['enabled'] == true;
  late final _charge = TextEditingController(text: '${widget.data['charge'] ?? 0}');
  late final _free = TextEditingController(text: widget.data['freeAbove'] == null ? '' : '${widget.data['freeAbove']}');
  late final _note = TextEditingController(text: '${widget.data['note'] ?? ''}');
  @override
  Widget build(BuildContext context) => WebCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Charge for delivery on online orders'), value: _on, onChanged: (v) => setState(() => _on = v)),
          if (_on) ...[
            AppField(controller: _charge, label: 'Delivery charge (₹)', keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            const AppGap(),
            AppField(controller: _free, label: 'Free delivery above (₹)', helper: 'Leave empty for never free', keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            const AppGap(),
            AppField(controller: _note, label: 'Note at checkout', helper: 'Optional'),
          ],
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: DButton('Save', icon: LucideIcons.save, onPressed: () => nativeSend(
                  context,
                  OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/delivery-settings', label: 'Delivery charge', body: {'enabled': _on, 'charge': double.tryParse(_charge.text.trim()) ?? 0, 'freeAbove': _free.text.trim().isEmpty ? null : double.tryParse(_free.text.trim()), 'note': _note.text.trim()}),
                  reload: widget.reload,
                  done: 'Saved.',
                )),
          ),
        ]),
      );
}

/* ───────────────────────── Static pages ───────────────────────── */

class StaticPagesPage extends StatelessWidget {
  const StaticPagesPage({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'pages', builder: (context, data, reload) {
        final rows = _list(data);
        Future<void> edit(Map<String, dynamic>? p) async {
          final title = TextEditingController(text: p?['title'] ?? ''), content = TextEditingController(text: p?['content'] ?? '');
          var published = p == null || p['status'] == 'published';
          final ok = await showAppDialog<bool>(context, title: p == null ? 'New page' : 'Edit ${p['title']}', icon: LucideIcons.fileText, width: 720, builder: (c) => StatefulBuilder(
                builder: (c, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  AppField(controller: title, label: 'Title', required: true, autofocus: true),
                  const AppGap(),
                  AppField(controller: content, label: 'Content', helper: 'Plain text or HTML', maxLines: 14),
                  SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Published'), value: published, onChanged: (v) => set(() => published = v)),
                ]),
              ), actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))]);
          if (ok != true || !context.mounted) return;
          await nativeSend(context, OutboxItem(
            id: newId(), method: p == null ? 'POST' : 'PATCH', path: p == null ? '/api/pages' : '/api/pages/${p['id']}', label: 'Page ${title.text.trim()}',
            body: {'title': title.text.trim(), 'content': content.text, 'status': published ? 'published' : 'draft', 'slug': p?['slug'] ?? '', 'metaTitle': p?['metaTitle'] ?? '', 'metaDescription': p?['metaDescription'] ?? ''},
          ), reload: reload, done: 'Saved.');
        }

        return NativeScreen(
          title: 'Static Pages',
          subtitle: 'About us, policies and other pages of the shop',
          onRefresh: reload,
          actions: [NativeAction('New Page', LucideIcons.plus, () => edit(null))],
          children: [
            NList(
              cols: const [WebCol('Title', flex: 2), WebCol('Link', flex: 1.6), WebCol('Status', flex: .8), WebCol('Updated', flex: 1), WebCol('Actions', width: 100)],
              empty: 'No pages yet.',
              rows: [
                for (final p in rows)
                  NRow(
                    title: '${p['title']}',
                    subtitle: '/${p['slug']} · ${p['status']} · ${dateShort(p['updatedAt'])}',
                    onTap: () => edit(p),
                    cells: [
                      Text('${p['title']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text('/${p['slug']}', style: const TextStyle(color: W.g500)),
                      Align(alignment: Alignment.centerLeft, child: statusPill(p['status'] == 'published', yes: 'Published', no: 'Draft')),
                      Text(dateShort(p['updatedAt'])),
                      Row(children: [
                        DButton.icon(LucideIcons.squarePen, tooltip: 'Edit', variant: DVariant.ghost, onPressed: () => edit(p)),
                        DButton.icon(LucideIcons.trash2, tooltip: 'Delete', variant: DVariant.ghost, onPressed: () async {
                          if (await confirm(context, 'Delete ${p['title']}?', 'The page disappears from the shop.', danger: true) && context.mounted) {
                            await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/pages/${p['id']}', label: 'Delete page'), reload: reload, done: 'Deleted.');
                          }
                        }),
                      ]),
                    ],
                  ),
              ],
            ),
          ],
        );
      });
}

/* ───────────────────────── File manager ───────────────────────── */

class FilesPage extends StatefulWidget {
  const FilesPage({super.key});
  @override
  State<FilesPage> createState() => _FilesPageState();
}

class _FilesPageState extends State<FilesPage> {
  String _cat = 'all', _q = '';
  @override
  Widget build(BuildContext context) => NativeData(name: 'files', builder: (context, data, reload) {
        final all = _list(data);
        final cats = <String, String>{for (final f in all) '${f['category']}': '${f['categoryLabel']}'};
        final q = _q.trim().toLowerCase();
        final list = all.where((f) => (_cat == 'all' || f['category'] == _cat) && (q.isEmpty || '${f['name']} ${f['usedBy'] ?? ''}'.toLowerCase().contains(q))).toList();
        final size = all.fold<int>(0, (t, f) => t + toInt(f['sizeBytes'] ?? 0));
        Future<void> upload() async {
          final xs = await ImagePicker().pickMultiImage(maxWidth: 2400, imageQuality: 90).catchError((_) => <XFile>[]);
          if (xs.isEmpty || !context.mounted) return;
          for (final x in xs) {
            await nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/media', label: 'Upload ${x.name}', multipart: true, files: {'file': x.path}));
          }
          await reload();
        }

        return NativeScreen(
          title: 'File Manager',
          subtitle: 'Every image and file used on the site',
          onRefresh: reload,
          actions: [NativeAction('Upload', LucideIcons.upload, upload)],
          children: [
            NStats([
              (LucideIcons.images, const Color(0xFF2563EB), '${all.length}', 'Files'),
              (LucideIcons.hardDrive, const Color(0xFF7C3AED), '${(size / 1048576).toStringAsFixed(1)} MB', 'Space used'),
              (LucideIcons.fileWarning, const Color(0xFFDC2626), '${all.where((f) => f['sizeBytes'] == null).length}', 'Missing on disk'),
            ]),
            NFilters(hint: 'Search files', onSearch: (v) => setState(() => _q = v), tabs: [('all', 'All'), for (final e in cats.entries) (e.key, e.value)], tab: _cat, onTab: (v) => setState(() => _cat = v)),
            if (isWide(context))
              Wrap(spacing: 12, runSpacing: 12, children: [for (final f in list.take(300)) _FileTile(f: f, reload: reload)])
            else
              NList(
                cols: const [],
                rows: [for (final f in list.take(300)) NRow(cells: const [], title: '${f['name']}', subtitle: '${f['categoryLabel']}${f['usedBy'] != null ? ' · ${f['usedBy']}' : ''}', leading: NetImage(f['relPath'], size: 44, radius: 6))],
              ),
          ],
        );
      });
}

class _FileTile extends StatelessWidget {
  final Map<String, dynamic> f;
  final Future<void> Function() reload;
  const _FileTile({required this.f, required this.reload});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 170,
        child: WebCard(
          padding: const EdgeInsets.all(8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(borderRadius: BorderRadius.circular(6), child: AspectRatio(aspectRatio: 1, child: f['fileType'] == 'image' ? NetImage(f['relPath'], size: 154, radius: 6) : const Icon(LucideIcons.file, size: 40, color: W.g400))),
            const SizedBox(height: 6),
            Text('${f['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            Row(children: [
              Expanded(child: Text('${f['usedBy'] ?? f['categoryLabel']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: W.g500))),
              if (f['editable'] == true)
                InkWell(
                  onTap: () async {
                    if (await confirm(context, 'Delete ${f['name']}?', 'It is removed from the server.', danger: true) && context.mounted) {
                      await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/media/${'${f['id']}'.split(':').last}', label: 'Delete ${f['name']}'), reload: reload, done: 'Deleted.');
                    }
                  },
                  child: const Icon(LucideIcons.trash2, size: 14, color: Color(0xFFDC2626)),
                ),
            ]),
          ]),
        ),
      );
}

/* ───────────────────────── Activity logs ───────────────────────── */

class ActivityPage extends StatefulWidget {
  const ActivityPage({super.key});
  @override
  State<ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends State<ActivityPage> {
  String _q = '';
  @override
  Widget build(BuildContext context) => NativeData(name: 'activity', builder: (context, data, reload) {
        final all = _list(data);
        final q = _q.trim().toLowerCase();
        final list = all.where((l) => q.isEmpty || '${l['user'] ?? ''} ${l['action']} ${l['text']}'.toLowerCase().contains(q)).toList();
        return NativeScreen(
          title: 'Activity Logs',
          subtitle: 'Who did what, and when (latest 400)',
          onRefresh: reload,
          children: [
            NStats([
              (LucideIcons.history, const Color(0xFF2563EB), '${all.length}', 'Shown'),
              (LucideIcons.calendarCheck, const Color(0xFF16A34A), '${all.where((l) => DateRange.preset('today').contains(l['at'])).length}', 'Today'),
              (LucideIcons.users, const Color(0xFF7C3AED), '${all.map((l) => l['user']).toSet().length}', 'People'),
            ]),
            NFilters(hint: 'Search person, action or text', onSearch: (v) => setState(() => _q = v)),
            NList(
              cols: const [WebCol('When', flex: 1), WebCol('Who', flex: .9), WebCol('Action', flex: 1.1), WebCol('Details', flex: 3)],
              rows: [
                for (final l in list)
                  NRow(
                    title: '${l['text']}',
                    subtitle: '${l['user'] ?? 'System'} · ${dateTime(l['at'])}',
                    cells: [Text(dateTime(l['at']), style: const TextStyle(fontSize: 12.5)), Text('${l['user'] ?? 'System'}'), Text('${l['action']}', style: const TextStyle(fontSize: 12, color: W.g600)), Text('${l['text']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5))],
                  ),
              ],
            ),
          ],
        );
      });
}

/* ───────────────────────── Cache manager ───────────────────────── */

class CachePage extends StatelessWidget {
  const CachePage({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'cache', builder: (context, data, reload) {
        final d = Map<String, dynamic>.from(data as Map);
        Future<void> clear(String section, String label) => nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/cache2', label: 'Clear cache: $label', body: {'section': section}), reload: reload, done: '$label refreshed.');
        Widget card(String section, String label, String text, IconData icon, Color c) => WebCard(
              child: Row(children: [
                Container(width: 40, height: 40, decoration: BoxDecoration(color: c.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: c)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: const TextStyle(fontWeight: FontWeight.w700)), Text(text, style: const TextStyle(fontSize: 12, color: W.g500))])),
                DButton('Clear', icon: LucideIcons.refreshCw, size: DSize.sm, variant: DVariant.secondary, onPressed: () => clear(section, label)),
              ]),
            );
        return NativeScreen(
          title: 'Cache Manager',
          subtitle: 'Refresh saved copies of pages after big changes',
          onRefresh: reload,
          children: [
            NStats([
              (LucideIcons.hardDrive, const Color(0xFF2563EB), '${(toInt(d['cacheSizeBytes']) / 1048576).toStringAsFixed(1)} MB', 'Cache size'),
              (LucideIcons.rotateCcw, const Color(0xFF16A34A), '${d['totalClears']}', 'Clears so far'),
              (LucideIcons.clock, const Color(0xFF7C3AED), d['lastCleared'] == null ? 'Never' : ago((d['lastCleared'] as Map)['at']), 'Last cleared'),
            ]),
            card('home', 'Homepage', 'The shop front page', LucideIcons.house, const Color(0xFF2563EB)),
            card('shop', 'Storefront pages', 'Categories, products, cart and checkout', LucideIcons.store, const Color(0xFF16A34A)),
            card('dashboard', 'Admin dashboard', 'Numbers on the dashboard', LucideIcons.layoutDashboard, const Color(0xFF7C3AED)),
            card('all', 'Everything', 'All of the above at once', LucideIcons.layers, const Color(0xFFDC2626)),
          ],
        );
      });
}

/* ───────────────────────── Backup & restore ───────────────────────── */

class BackupPage extends StatefulWidget {
  const BackupPage({super.key});
  @override
  State<BackupPage> createState() => _BackupPageState();
}

class _BackupPageState extends State<BackupPage> {
  Map<String, dynamic>? _job;
  final List<Map<String, dynamic>> _log = [];
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _start(Map<String, dynamic> body, Future<void> Function() reload) async {
    final api = context.read<AppState>().api;
    final r = await api.send('POST', '/api/system/backup', body: body);
    if (!mounted) return;
    if (!r.ok) return toast(context, r.outcome == ApiOutcome.offline ? 'This needs the internet.' : r.message, error: true);
    if (r.data['job'] == null) return reload();
    _log.clear();
    var from = 0;
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 1), (t) async {
      final j = await api.get('/api/system/backup', query: {'job': '${r.data['job']}', 'from': '$from'});
      if (!mounted || !j.ok) return;
      final job = Map<String, dynamic>.from(j.data['job']);
      from = toInt(job['logTotal']);
      setState(() {
        _job = job;
        _log.addAll(_list(job['log']));
      });
      if (job['status'] != 'running') {
        t.cancel();
        reload();
      }
    });
  }

  @override
  Widget build(BuildContext context) => NativeData(name: 'backups', builder: (context, data, reload) {
        final rows = _list(data);
        final running = _job?['status'] == 'running';
        return NativeScreen(
          title: 'Backup & Restore',
          subtitle: 'A complete copy of your store — keep it safe, restore it any time',
          onRefresh: reload,
          actions: [NativeAction('Back up now', LucideIcons.databaseBackup, running ? null : () => _start({'action': 'backup'}, reload))],
          children: [
            if (_job != null)
              WebCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    Expanded(child: Text('${_job!['step']}', style: const TextStyle(fontWeight: FontWeight.w600))),
                    Text('${_job!['percent']}%', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  ]),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(minHeight: 10, value: toInt(_job!['percent']) / 100, color: _job!['status'] == 'failed' ? const Color(0xFFDC2626) : _job!['status'] == 'done' ? const Color(0xFF16A34A) : DS.primary, backgroundColor: W.g100),
                  ),
                  const SizedBox(height: 10),
                  // Latest steps, newest first.
                  for (final l in _log.reversed.take(6))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Icon(l['level'] == 'ok' ? Icons.check_circle_rounded : l['level'] == 'error' ? Icons.cancel_rounded : Icons.circle, size: l['level'] == 'ok' || l['level'] == 'error' ? 16 : 7,
                            color: l['level'] == 'ok' ? const Color(0xFF16A34A) : l['level'] == 'error' ? const Color(0xFFDC2626) : W.g400),
                        const SizedBox(width: 8),
                        Expanded(child: Text('${l['text']}'.trim(), style: TextStyle(fontSize: 12.5, color: l['level'] == 'error' ? const Color(0xFFDC2626) : W.g700))),
                        Text(timeOnly(l['at']), style: const TextStyle(fontSize: 11, color: W.g400)),
                      ]),
                    ),
                ]),
              ),
            NList(
              cols: const [WebCol('Backup file', flex: 2.4), WebCol('Size', flex: .7), WebCol('Made', flex: 1.1), WebCol('Actions', width: 190)],
              empty: 'No backups yet. Tap “Back up now”.',
              rows: [
                for (final b in rows)
                  NRow(
                    title: '${b['name']}',
                    subtitle: '${(toInt(b['size']) / 1048576).toStringAsFixed(1)} MB · ${dateTime(b['createdAt'])}',
                    trailing: PopupMenuButton<String>(
                      popUpAnimationStyle: AnimationStyle.noAnimation,
                      onSelected: (v) => v == 'scan' ? _start({'action': 'validate', 'file': b['name']}, reload) : _restore(b, reload),
                      itemBuilder: (_) => const [PopupMenuItem(value: 'scan', child: Text('Scan')), PopupMenuItem(value: 'restore', child: Text('Restore'))],
                    ),
                    cells: [
                      Text('${b['name']}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
                      Text('${(toInt(b['size']) / 1048576).toStringAsFixed(1)} MB'),
                      Text(dateTime(b['createdAt'])),
                      Row(children: [
                        DButton('Scan', icon: LucideIcons.shieldCheck, size: DSize.sm, variant: DVariant.secondary, onPressed: running ? null : () => _start({'action': 'validate', 'file': b['name']}, reload)),
                        const SizedBox(width: 6),
                        DButton('Restore', icon: LucideIcons.rotateCcw, size: DSize.sm, variant: DVariant.danger, onPressed: running ? null : () => _restore(b, reload)),
                      ]),
                    ],
                  ),
              ],
            ),
            const Text('Download or upload backup files from the website (System → Backup & Restore).', style: TextStyle(color: AppColors.muted, fontSize: 12)),
          ],
        );
      });

  Future<void> _restore(Map<String, dynamic> b, Future<void> Function() reload) async {
    final typed = TextEditingController();
    final ok = await showAppDialog<bool>(context, title: 'Restore ${b['name']}?', icon: LucideIcons.triangleAlert, builder: (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Everything on the site is replaced with this backup. A safety backup is saved first so you can undo.'),
          const AppGap(),
          AppField(controller: typed, label: 'Type RESTORE to continue', autofocus: true),
        ]), actions: [const DAction.cancel(), DAction('Restore now', primary: true, variant: DVariant.danger, onPressed: () async => popDialog(context, true))]);
    if (ok != true || typed.text.trim() != 'RESTORE' || !mounted) return;
    await _start({'action': 'restore', 'file': b['name'], 'confirm': 'RESTORE'}, reload);
  }
}

/* ───────────────────────── Staff app ───────────────────────── */

class StaffAppPage extends StatelessWidget {
  const StaffAppPage({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final r = s.release;
    final newer = r != null && isNewer('${r['version']}', s.appVersion);
    return NativeScreen(
      title: 'Staff App',
      subtitle: 'Android and Windows app for your team',
      children: [
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('This device: version ${s.appVersion}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 4),
            Text(r == null ? 'Checking for the newest version…' : newer ? 'Version ${r['version']} is available.' : 'You have the newest version.', style: TextStyle(color: newer ? const Color(0xFFD97706) : W.g500)),
            if (newer) ...[const SizedBox(height: 10), DButton('Update now', icon: LucideIcons.download, onPressed: () => openUpdate(context, r))],
          ]),
        ),
        if (r != null)
          WebCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Install on another device', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (r['android'] != null) DButton('Android app (APK)', icon: LucideIcons.smartphone, variant: DVariant.secondary, onPressed: () => launchUrl(Uri.parse('${r['android']}'), mode: LaunchMode.externalApplication)),
                if (r['windows'] != null) DButton('Windows app', icon: LucideIcons.monitor, variant: DVariant.secondary, onPressed: () => launchUrl(Uri.parse('${r['windows']}'), mode: LaunchMode.externalApplication)),
              ]),
              if (Platform.isAndroid) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Staff sign in with the same username and password as the website.', style: TextStyle(color: W.g500, fontSize: 12))),
            ]),
          ),
      ],
    );
  }
}
