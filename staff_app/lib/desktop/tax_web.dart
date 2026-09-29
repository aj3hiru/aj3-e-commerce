import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/adaptive.dart';
import '../ds/button.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/kit.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

/// "Tax Settings" as on the website: prices include / exclude GST, 4 cards (slabs, default,
/// highest, products without a matching slab) and the GST Slabs table (products per slab,
/// set as default, edit, delete). Changes show at once and wait for the internet when offline.
class TaxWeb extends StatelessWidget {
  const TaxWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'business', builder: (context, data, reload) => _Tax(data: Map<String, dynamic>.from((data as Map?) ?? const {}), reload: reload));
}

class _Tax extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _Tax({required this.data, required this.reload});
  @override
  State<_Tax> createState() => _TaxState();
}

class _TaxState extends State<_Tax> {
  static final _def = displayDefs['ecom_tax_settings2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '';

  String _pct(dynamic v) => toDouble(v) == toDouble(v).roundToDouble() ? '${toDouble(v).round()}' : '${toDouble(v)}';

  Future<void> _edit(Map<String, dynamic>? g) async {
    final label = TextEditingController(text: g?['label'] ?? ''), rate = TextEditingController(text: g == null ? '' : _pct(g['rate']));
    final ok = await showAppDialog<bool>(
      context,
      title: g == null ? 'Add GST Slab' : 'Edit GST Slab',
      icon: LucideIcons.percent,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          DTextField(controller: label, label: 'Label', required: true, autofocus: true, hint: 'e.g. GST 5%'),
          const SizedBox(height: 12),
          DTextField(controller: rate, label: 'Rate (%)', required: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), hint: '5'),
        ]),
      ),
      actions: [
        if (g != null) DAction('Delete', variant: DVariant.danger, onPressed: () async {
          popDialog(context, false);
          await _delete(g);
        }),
        const DAction.cancel(),
        DAction(g == null ? 'Add Slab' : 'Save Changes', primary: true, onPressed: () async {
          final r = double.tryParse(rate.text.trim());
          if (label.text.trim().isEmpty || r == null || r < 0 || r > 100) return toast(context, 'Type a label and a rate between 0 and 100.', error: true);
          popDialog(context, true);
        }),
      ],
    );
    if (ok != true || !mounted) return;
    final body = {'label': label.text.trim(), 'rate': double.tryParse(rate.text.trim())};
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: g == null ? 'POST' : 'PUT', path: g == null ? '/api/ecommerce/tax-rates2' : '/api/ecommerce/tax-rates2/${g['id']}', label: 'GST slab ${label.text.trim()}', body: body, refresh: const ['settings'],
        effect: g == null
            ? {'kind': 'page_row_new', 'page': 'business', 'list': 'gstRates', 'row': {...body, 'id': -DateTime.now().millisecondsSinceEpoch, 'localRef': newId()}}
            : {'kind': 'page_row', 'page': 'business', 'list': 'gstRates', 'id': g['id'], 'fields': body},
      ),
      reload: widget.reload,
      done: '“${label.text.trim()}” ${g == null ? 'added' : 'saved'}.',
    );
  }

  Future<void> _delete(Map g) async {
    final n = toInt(g['products']);
    if (!await confirm(context, 'Delete “${g['label']}”?',
        "This can't be undone.${n > 0 ? ' $n product${n == 1 ? '' : 's'} currently ${n == 1 ? 'has' : 'have'} this exact rate — they keep their own rate value, only this named slab goes away.' : ''}${g['isDefault'] == true ? ' This is the current default rate — deleting it leaves no default set.' : ''}",
        ok: 'Delete', danger: true) || !mounted) {
      return;
    }
    await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/ecommerce/tax-rates2/${g['id']}', label: 'Delete GST slab ${g['label']}', refresh: const ['settings'], effect: {'kind': 'page_row_delete', 'page': 'business', 'list': 'gstRates', 'ids': [g['id']]}),
        reload: widget.reload, done: '“${g['label']}” deleted.');
  }

  Future<void> _setDefault(Map g) => nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/ecommerce/tax-rates2/${g['id']}', label: 'Default GST ${g['label']}', refresh: const ['settings']), reload: widget.reload, done: '“${g['label']}” is now the default.');

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final products = s.list('products');
    final rates = [
      for (final g in ((widget.data['gstRates'] as List?) ?? const []).cast<Map>())
        {...Map<String, dynamic>.from(g), 'products': products.where((p) => (toDouble(p['gstRate']) - toDouble(g['rate'])).abs() < .001).length},
    ]..sort((a, b) => toDouble(a['rate']).compareTo(toDouble(b['rate'])));
    final slabRates = rates.map((g) => toDouble(g['rate'])).toList();
    final orphans = products.where((p) => !slabRates.any((r) => (r - toDouble(p['gstRate'])).abs() < .001)).length;
    final def = rates.where((g) => g['isDefault'] == true).firstOrNull;
    final q = _q.trim().toLowerCase();
    final list = rates.where((g) => q.isEmpty || '${g['label']} ${_pct(g['rate'])}%'.toLowerCase().contains(q)).toList();
    final inclusive = (widget.data['tax'] as Map?)?['pricesIncludeTax'] == true;
    bool col(String k) => on('tx2-table', k);

    Widget mode(bool v, String title, String ex) => Expanded(
          child: WebCard(
            borderColor: inclusive == v ? const Color(0xFF2563EB) : null,
            onTap: inclusive == v
                ? null
                : () => nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/tax-mode', label: 'Prices ${v ? 'include' : 'exclude'} GST', body: {'pricesIncludeTax': v}, refresh: const ['settings'],
                    effect: {'kind': 'page_set', 'page': 'business', 'path': ['tax', 'pricesIncludeTax'], 'value': v}), reload: widget.reload, done: 'Saved.'),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(inclusive == v ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: inclusive == v ? const Color(0xFF2563EB) : W.g400, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: W.g900)), Text(ex, style: const TextStyle(fontSize: 12.5, color: W.g500))])),
            ]),
          ),
        );

    return WebPage(
      title: 'Tax Settings',
      subtitle: 'GST slabs and how prices include tax',
      onRefresh: widget.reload,
      actions: [DisplayOptionsButton(_def), WebButton('Add GST Slab', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => _edit(null))],
      children: [
        const Text('Prices and GST', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.g900)),
        const SizedBox(height: 8),
        Row(children: [mode(true, 'Prices include GST', '₹118 at 18% → customer pays ₹118'), const SizedBox(width: 12), mode(false, 'GST added on top', '₹100 at 18% → customer pays ₹118')]),
        const SizedBox(height: 16),
        ...webCardsRow([
          if (on('tx2-cards', 'tx2-k-total')) WebMetric(icon: LucideIcons.percent, color: const Color(0xFF7C3AED), value: '${rates.length}', label: 'Total Slabs'),
          if (on('tx2-cards', 'tx2-k-default')) WebMetric(icon: LucideIcons.star, color: const Color(0xFFD97706), value: def == null ? 'None' : '${def['label']}', label: 'Default Rate'),
          if (on('tx2-cards', 'tx2-k-highest')) WebMetric(icon: LucideIcons.trendingUp, color: const Color(0xFF2563EB), value: rates.isEmpty ? '—' : '${_pct(rates.last['rate'])}%', label: 'Highest Rate'),
          if (on('tx2-cards', 'tx2-k-orphan')) WebMetric(icon: LucideIcons.packageSearch, color: const Color(0xFFEF4444), value: '$orphans', label: 'Products Without a Matching Slab'),
        ]),
        if (on('tx2-table'))
          WebList(
            rows: list,
            total: rates.length,
            search: col('tx2-t-search') ? WebSearch(width: 220, hint: 'Search slabs…', onChanged: (v) => setState(() => _q = v)) : null,
            empty: 'No GST slabs yet.',
            onTap: _edit,
            cols: [
              if (col('tx2-c-label')) ListCol(const WebCol('Label', flex: 1.6), (g) => Text('${g['label']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: W.g900)), sort: (g) => lower(g['label'])),
              if (col('tx2-c-rate')) ListCol(const WebCol('Rate', flex: .8), (g) => Text('${_pct(g['rate'])}%'), sort: (g) => toDouble(g['rate'])),
              if (col('tx2-c-products')) ListCol(const WebCol('Products', flex: .8), (g) => Text('${g['products']}', style: TextStyle(color: toInt(g['products']) > 0 ? W.g900 : W.g400)), sort: (g) => toDouble(g['products'])),
              if (col('tx2-c-default'))
                ListCol(const WebCol('Default', flex: 1), (g) => g['isDefault'] == true
                    ? const Row(children: [Icon(Icons.star_rounded, size: 16, color: Color(0xFFF59E0B)), SizedBox(width: 4), Text('Default', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFFD97706)))])
                    : Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: toInt(g['id']) < 0 ? null : () => _setDefault(g), child: const Text('Set as default', style: TextStyle(fontSize: 12.5))))),
              if (col('tx2-c-actions'))
                ListCol(const WebCol('Actions', width: 96), (g) => Row(children: [
                      WebIconAction(LucideIcons.pencil, color: const Color(0xFF2563EB), tooltip: 'Edit ${g['label']}', onTap: () => _edit(g)),
                      WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete ${g['label']}', onTap: toInt(g['id']) < 0 ? null : () => _delete(g)),
                    ])),
            ],
          ),
      ],
    );
  }
}
