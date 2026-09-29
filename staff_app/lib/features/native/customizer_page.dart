import 'dart:convert';

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
import 'kit.dart';

/// Store Customizer in the app: homepage blocks, product page, header menus
/// and footer — saved through the website's own draft / publish APIs.
class CustomizerPage extends StatelessWidget {
  final String tab; // home | product | header | footer
  const CustomizerPage({super.key, this.tab = 'home'});
  @override
  Widget build(BuildContext context) => NativeData(name: 'customizer', builder: (context, data, reload) => _Body(data: Map<String, dynamic>.from(data as Map), reload: reload, tab: tab));
}

Map<String, dynamic> _copy(dynamic v) => jsonDecode(jsonEncode(v ?? {})) as Map<String, dynamic>;
String _rid() => DateTime.now().microsecondsSinceEpoch.toRadixString(36);

class _Body extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  final String tab;
  const _Body({required this.data, required this.reload, required this.tab});
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  late String _tab = widget.tab;
  late Map<String, dynamic> _home = _copy(widget.data['home']);
  late Map<String, dynamic> _product = _copy(widget.data['product']);
  late Map<String, dynamic> _store = _copy(widget.data['store']);
  late Map<String, dynamic> _header = _copy(widget.data['header']);
  bool _dirty = false, _saving = false;

  @override
  void didUpdateWidget(covariant _Body old) {
    super.didUpdateWidget(old);
    if (!_dirty && old.data != widget.data) {
      _home = _copy(widget.data['home']);
      _product = _copy(widget.data['product']);
      _store = _copy(widget.data['store']);
      _header = _copy(widget.data['header']);
    }
  }

  void _touch(VoidCallback f) => setState(() {
        f();
        _dirty = true;
      });

  Future<void> _save({bool publish = false}) async {
    setState(() => _saving = true);
    final s = context.read<AppState>();
    bool ok = true;
    Future<void> post(String path, Object body) async {
      final r = await s.api.send('POST', path, body: body);
      if (!r.ok) {
        ok = false;
        if (mounted) toast(context, r.outcome == ApiOutcome.offline ? 'Saving the shop design needs the internet.' : r.message, error: true);
      }
    }

    switch (_tab) {
      case 'home':
        await post('/api/ecommerce/home-customizer', {'config': _home, 'action': publish ? 'publish' : 'draft'});
      case 'product':
        await post('/api/ecommerce/product-page-customizer', {'config': _product, 'action': publish ? 'publish' : 'draft'});
      case 'header':
        await post('/api/ecommerce/storefront-config', _store);
        if (ok) await post('/api/ecommerce/header-settings', _header);
      default:
        await post('/api/ecommerce/storefront-config', _store);
    }
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      _dirty = false;
      toast(context, publish || _tab == 'header' || _tab == 'footer' ? 'Live on your shop now.' : 'Draft saved — Publish to show it to shoppers.');
      widget.reload();
    }
  }

  Future<String?> _upload() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2400, imageQuality: 88).catchError((_) => null);
    if (x == null || !mounted) return null;
    final r = await context.read<AppState>().api.multipart('POST', '/api/ecommerce/home-customizer/upload', files: {'file': x.path});
    if (!mounted) return null;
    if (!r.ok) {
      toast(context, r.outcome == ApiOutcome.offline ? 'Uploading needs the internet.' : r.message, error: true);
      return null;
    }
    return '${r.data['path']}';
  }

  @override
  Widget build(BuildContext context) {
    final canStore = widget.data['canStore'] == true;
    final publishable = _tab == 'home' || _tab == 'product';
    final server = context.read<AppState>().api.server;
    final shop = Uri.parse(server).replace(host: Uri.parse(server).host.replaceFirst('admin.', '')).origin;
    return NativeScreen(
      title: 'Store Customizer',
      subtitle: 'How your shop looks — homepage, product page, menus and footer',
      onRefresh: widget.reload,
      actions: [
        NativeAction('View shop', LucideIcons.externalLink, () => launchUrl(Uri.parse(_tab == 'home' ? '$shop/?hc=draft' : shop), mode: LaunchMode.externalApplication), primary: false),
        if (publishable) NativeAction('Save draft', LucideIcons.save, _saving ? null : () => _save(), primary: false),
        NativeAction(publishable ? 'Publish' : 'Save', LucideIcons.rocket, _saving ? null : () => _save(publish: true)),
      ],
      children: [
        NFilters(
          hint: '',
          onSearch: (_) {},
          tabs: [('home', 'Homepage'), ('product', 'Product page'), if (canStore) ('header', 'Header & menus'), if (canStore) ('footer', 'Footer')],
          tab: _tab,
          onTab: (v) => setState(() => _tab = v),
        ),
        if (_dirty) const Text('Unsaved changes', style: TextStyle(color: AppColors.amber, fontWeight: FontWeight.w600)),
        if (widget.data['unpublished'] == true && _tab == 'home') const Text('The homepage has a saved draft that is not published yet.', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ...switch (_tab) {
          'product' => _productTab(),
          'header' => _headerTab(),
          'footer' => _footerTab(),
          _ => _homeTab(),
        },
      ],
    );
  }

  /* ── small form helpers ── */

  Widget _text(Map m, String k, String label, {int lines = 1, String? hint}) => _TextBox(key: ValueKey('${identityHashCode(m)}$k'), initial: '${m[k] ?? ''}', label: label, lines: lines, hint: hint, onChanged: (v) => _touch(() => m[k] = v));
  Widget _switch(Map m, String k, String label) => SwitchListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text(label), value: m[k] == true, onChanged: (v) => _touch(() => m[k] = v));
  Widget _num(Map m, String k, String label) => _TextBox(key: ValueKey('${identityHashCode(m)}$k'), initial: '${m[k] ?? ''}', label: label, number: true, onChanged: (v) => _touch(() => m[k] = int.tryParse(v) ?? m[k]));
  Widget _card(String title, List<Widget> children, {Widget? trailing}) => WebCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))), ?trailing]),
          const SizedBox(height: 8),
          for (final c in children) Padding(padding: const EdgeInsets.only(bottom: 8), child: c),
        ]),
      );

  /* ── Homepage ── */

  static const _blockLabel = {'banner': 'Banner slider', 'categories': 'Category circles', 'products': 'Product row', 'image': 'Image banner', 'feed': 'Products For You'};

  List<Widget> _homeTab() {
    final blocks = ((_home['blocks'] as List?) ?? []).cast<Map<String, dynamic>>();
    final promo = (_home['promo'] as Map<String, dynamic>?) ?? {};
    final strip = (_home['strip'] as Map<String, dynamic>?) ?? {};
    final card = (_home['card'] as Map<String, dynamic>?) ?? {};
    return [
      _card('Colours', [_text(_home, 'accent', 'Accent colour', hint: '#9f2089')]),
      _card('Offer bar at the top', [
        _switch(promo, 'enabled', 'Show the offer bar'),
        if (promo['enabled'] == true) ...[
          _text(promo, 'title', 'Title'),
          _text(promo, 'subtitle', 'Second line'),
          _text(promo, 'buttonLabel', 'Button text'),
          _text(promo, 'buttonUrl', 'Button link'),
          _text(promo, 'bgColor', 'Background colour'),
        ],
      ]),
      _card('Info strip', [
        _switch(strip, 'enabled', 'Show the info strip'),
        if (strip['enabled'] == true) ...[_text(strip, 'text', 'Text', hint: 'Free delivery on shopping above ₹500'), _text(strip, 'href', 'Link')],
      ]),
      _card(
        'Homepage sections',
        [
          for (var i = 0; i < blocks.length; i++) _BlockEditor(
              block: blocks[i],
              label: _blockLabel[blocks[i]['type']] ?? '${blocks[i]['type']}',
              first: i == 0,
              last: i == blocks.length - 1,
              onMove: (d) => _touch(() {
                final b = blocks.removeAt(i);
                blocks.insert(i + d, b);
              }),
              onRemove: () => _touch(() => blocks.removeAt(i)),
              onChange: () => _touch(() {}),
              upload: _upload,
              text: _text,
              toggle: _switch,
              number: _num,
            ),
        ],
        trailing: PopupMenuButton<String>(
          popUpAnimationStyle: AnimationStyle.noAnimation,
          tooltip: 'Add a section',
          icon: const Icon(Icons.add_circle_outline_rounded),
          onSelected: (t) => _touch(() => blocks.add(_newBlock(t))),
          itemBuilder: (_) => [for (final e in _blockLabel.entries) PopupMenuItem(value: e.key, child: Text(e.value))],
        ),
      ),
      _card('Product cards', [
        _switch(card, 'showWishlist', 'Wishlist heart'),
        _switch(card, 'showRating', 'Rating'),
        _switch(card, 'showDiscount', '% off'),
        _switch(card, 'showDealTimer', 'Deal timer'),
        _switch(card, 'showBadge', 'Badge tag'),
        _switch(card, 'gap', 'Rounded cards with a small gap'),
      ]),
      _card('Phones', [_switch(_home, 'bottomNav', 'Bottom menu bar on phones')]),
    ];
  }

  Map<String, dynamic> _newBlock(String type) {
    final id = _rid();
    return switch (type) {
      'banner' => {'id': id, 'type': type, 'enabled': true, 'slides': [], 'autoplay': 5, 'rounded': true},
      'categories' => {'id': id, 'type': type, 'enabled': true, 'source': 'all', 'slugs': [], 'limit': 12, 'showAllButton': true},
      'products' => {'id': id, 'type': type, 'enabled': true, 'title': 'Deals of the Day', 'source': 'deals', 'category': '', 'productIds': [], 'limit': 10},
      'image' => {'id': id, 'type': type, 'enabled': true, 'image': '', 'href': '/'},
      _ => {'id': id, 'type': 'feed', 'enabled': true, 'title': 'Products For You', 'showSort': true, 'showCategory': true, 'showBrand': true, 'showFilters': true},
    };
  }

  /* ── Product page ── */

  static const _ppLabel = {
    'breadcrumb': 'Breadcrumb', 'gallery': 'Photos', 'trust': 'Trust strip', 'thumbs': 'Photo thumbnails', 'info': 'Name, price & offers', 'sizes': 'Sizes & specifications',
    'soldBy': 'Sold by', 'highlights': 'Highlights', 'reviews': 'Ratings & reviews', 'assurance': 'Assurance badges', 'actions': 'Add to Cart / Buy Now', 'related': 'Related products',
  };

  List<Widget> _productTab() {
    final order = ((_product['order'] as List?) ?? []).cast<String>();
    final hidden = ((_product['hidden'] as List?) ?? []).cast<String>();
    Map<String, dynamic> m(String k) => (_product[k] as Map<String, dynamic>?) ?? (_product[k] = <String, dynamic>{});
    return [
      _card('Colour', [_text(_product, 'accent', 'Accent colour')]),
      _card('Sections (top to bottom)', [
        for (var i = 0; i < order.length; i++)
          if (order[i] != 'soldBy' && order[i] != 'highlights')
            Row(children: [
              Checkbox(value: !hidden.contains(order[i]), onChanged: (v) => _touch(() => v == true ? hidden.remove(order[i]) : hidden.add(order[i]))),
              Expanded(child: Text(_ppLabel[order[i]] ?? order[i])),
              IconButton(visualDensity: VisualDensity.compact, onPressed: i == 0 ? null : () => _touch(() => order.insert(i - 1, order.removeAt(i))), icon: const Icon(Icons.arrow_upward_rounded, size: 18)),
              IconButton(visualDensity: VisualDensity.compact, onPressed: i == order.length - 1 ? null : () => _touch(() => order.insert(i + 1, order.removeAt(i))), icon: const Icon(Icons.arrow_downward_rounded, size: 18)),
            ]),
      ]),
      _card('Price area', [
        _switch(m('info'), 'showOffer', 'Coupons under the price'),
        _switch(m('info'), 'showDeal', 'Deal timer'),
        _switch(m('info'), 'showDescription', 'Description (2 lines, then “See more”)'),
        _switch(m('info'), 'showStock', '“Only a few left” when stock is low'),
        _text(m('cart'), 'lowStockText', 'Low stock text (also on product cards)', hint: 'Only a few left — order soon'),
        _switch(m('info'), 'showRating', 'Rating'),
        _switch(m('info'), 'showWishlist', 'Wishlist'),
        _switch(m('info'), 'showShare', 'Share'),
        _text(m('info'), 'deliveryText', 'Delivery line', hint: 'Free Delivery'),
      ]),
      _card('Sizes', [_text(m('sizes'), 'title', 'Title', hint: 'Select Size'), _switch(m('sizes'), 'showPrice', 'Show price on each size')]),
      _card('Buttons', [
        _switch(m('actions'), 'showCart', 'Add to Cart'),
        _text(m('actions'), 'cartLabel', 'Add to Cart text'),
        _switch(m('actions'), 'showBuy', 'Buy Now'),
        _text(m('actions'), 'buyLabel', 'Buy Now text'),
        _switch(m('actions'), 'sticky', 'Keep the buttons at the bottom of the screen'),
      ]),
      _card('Reviews', [
        _text(m('reviews'), 'title', 'Title'),
        _switch(m('reviews'), 'allowWrite', 'Customers who bought it can review (one per purchase)'),
        _num(m('reviews'), 'perPage', 'Reviews shown'),
        _switch(m('reviews'), 'side', 'Computer screens: products beside the reviews'),
        _text(m('reviews'), 'sideTitle', 'Title of those products', hint: 'Trending now'),
        SwitchListTile(contentPadding: EdgeInsets.zero, dense: true, title: const Text('Show newest products (off = best sellers)'),
          value: m('reviews')['sideSource'] == 'latest', onChanged: (v) => _touch(() => m('reviews')['sideSource'] = v ? 'latest' : 'trending')),
      ]),
      _card('Related products', [_text(m('related'), 'title', 'Title'), _num(m('related'), 'limit', 'How many')]),
      _card('Cart (whole shop)', [
        _switch(m('cart'), 'tileButton', 'Add to Cart button on product cards'),
        _switch(m('cart'), 'stepper', '− / + quantity after adding'),
        _switch(m('cart'), 'floatingBar', 'Floating “View Cart” bar'),
        _text(m('cart'), 'barLabel', 'View Cart bar text'),
        _switch(m('cart'), 'tileLowStock', '“Only a few left” on product cards'),
        _switch(m('cart'), 'notify', 'Out of stock: “Notify me” button instead of Add to Cart'),
        _text(m('cart'), 'notifyLabel', 'Notify button text', hint: 'Notify me'),
      ]),
    ];
  }

  /* ── Header & menus ── */

  List<Widget> _headerTab() {
    Map<String, dynamic> m(Map<String, dynamic> src, String k) => (src[k] as Map<String, dynamic>?) ?? (src[k] = <String, dynamic>{});
    return [
      _card('Header strip', [
        _switch(_header, 'showLocation', 'Show address block'),
        _switch(_header, 'showDeliveryInfo', 'Show opening time'),
        _text(_header, 'deliveryLabel', 'Status label', hint: "We're open"),
        _text(_header, 'deliveryTimeText', 'Time text', hint: 'Blank = business hours'),
        _text(_header, 'searchPlaceholder', 'Search box text'),
      ]),
      _MenuEditor(title: 'Header menu', items: ((_store['headerMenu'] as List?) ?? []).cast<Map<String, dynamic>>(), onChange: () => _touch(() {})),
      _MenuEditor(title: 'Side menu (phones)', items: ((_store['sidebarMenu'] as List?) ?? []).cast<Map<String, dynamic>>(), onChange: () => _touch(() {})),
      _card('Menu look', [_text(m(_store, 'menuDesign'), 'accent', 'Highlight colour'), _switch(m(_store, 'menuDesign'), 'showIcons', 'Icons'), _switch(m(_store, 'menuDesign'), 'dividers', 'Lines between items')]),
      _card('Notifications', [_switch(m(_store, 'push'), 'showBell', 'Bell in the header'), _switch(m(_store, 'push'), 'autoPrompt', 'Ask to allow on the first visit')]),
    ];
  }

  /* ── Footer ── */

  List<Widget> _footerTab() {
    final f = (_store['footer'] as Map<String, dynamic>?) ?? (_store['footer'] = <String, dynamic>{});
    final cols = ((f['columns'] as List?) ?? (f['columns'] = [])).cast<Map<String, dynamic>>();
    return [
      _card('Footer', [
        _text(f, 'description', 'About text', lines: 3, hint: 'Blank = your tagline'),
        _text(f, 'bgColor', 'Background colour'),
        _text(f, 'accentColor', 'Accent colour'),
        _text(f, 'copyright', 'Copyright line', hint: '© {year} {name}'),
        _switch(f, 'showContactColumn', 'Contact column'),
      ]),
      for (var i = 0; i < cols.length; i++)
        _card('Column ${i + 1}', [
          _text(cols[i], 'title', 'Column title'),
          _MenuEditor(title: 'Links', items: ((cols[i]['links'] as List?) ?? (cols[i]['links'] = [])).cast<Map<String, dynamic>>(), onChange: () => _touch(() {}), simple: true),
        ], trailing: IconButton(tooltip: 'Remove column', icon: const Icon(Icons.delete_outline_rounded), onPressed: () => _touch(() => cols.removeAt(i)))),
      Align(alignment: Alignment.centerLeft, child: DButton('Add footer column', icon: LucideIcons.plus, variant: DVariant.secondary, onPressed: () => _touch(() => cols.add({'id': _rid(), 'title': 'Links', 'links': []})))),
      _card('Call-to-action box', [
        _switch(f, 'ctaEnabled', 'Show it'),
        if (f['ctaEnabled'] == true) ...[_text(f, 'ctaTitle', 'Title'), _text(f, 'ctaSubtitle', 'Second line'), _text(f, 'ctaButtonLabel', 'Button text'), _text(f, 'ctaButtonUrl', 'Button link', hint: 'Blank = WhatsApp')],
      ]),
    ];
  }
}

/// One homepage section with its own settings.
class _BlockEditor extends StatelessWidget {
  final Map<String, dynamic> block;
  final String label;
  final bool first, last;
  final ValueChanged<int> onMove;
  final VoidCallback onRemove, onChange;
  final Future<String?> Function() upload;
  final Widget Function(Map m, String k, String label, {int lines, String? hint}) text;
  final Widget Function(Map m, String k, String label) toggle;
  final Widget Function(Map m, String k, String label) number;
  const _BlockEditor({required this.block, required this.label, required this.first, required this.last, required this.onMove, required this.onRemove, required this.onChange, required this.upload, required this.text, required this.toggle, required this.number});

  @override
  Widget build(BuildContext context) {
    final b = block;
    final s = context.read<AppState>();
    return Container(
      decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
      child: ExpansionTile(
        shape: const Border(),
        leading: Switch(value: b['enabled'] == true, onChanged: (v) {
          b['enabled'] = v;
          onChange();
        }),
        title: Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: b['enabled'] == true ? null : W.g400)),
        subtitle: b['title'] != null ? Text('${b['title']}') : null,
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(visualDensity: VisualDensity.compact, onPressed: first ? null : () => onMove(-1), icon: const Icon(Icons.arrow_upward_rounded, size: 18)),
          IconButton(visualDensity: VisualDensity.compact, onPressed: last ? null : () => onMove(1), icon: const Icon(Icons.arrow_downward_rounded, size: 18)),
          IconButton(visualDensity: VisualDensity.compact, onPressed: onRemove, icon: const Icon(Icons.delete_outline_rounded, size: 18, color: Color(0xFFDC2626))),
        ]),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        children: switch (b['type']) {
          'banner' => [
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final sl in ((b['slides'] as List?) ?? []).cast<Map<String, dynamic>>())
                  Stack(children: [
                    NetImage(sl['image'], size: 96, radius: 6),
                    Positioned(right: 0, top: 0, child: InkWell(onTap: () {
                      (b['slides'] as List).remove(sl);
                      onChange();
                    }, child: const CircleAvatar(radius: 11, backgroundColor: Color(0xFFDC2626), child: Icon(Icons.close, size: 14, color: Colors.white)))),
                  ]),
                OutlinedButton.icon(
                  onPressed: () async {
                    final p = await upload();
                    if (p == null) return;
                    ((b['slides'] as List?) ?? (b['slides'] = [])).add({'id': _rid(), 'image': p, 'href': '/'});
                    onChange();
                  },
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: const Text('Add slide'),
                ),
              ]),
              number(b, 'autoplay', 'Seconds per slide'),
              toggle(b, 'rounded', 'Rounded corners'),
            ],
          'categories' => [number(b, 'limit', 'How many categories'), toggle(b, 'showAllButton', '“All” button')],
          'products' => [
              text(b, 'title', 'Title'),
              AppSelect<String>(label: 'Which products', value: '${b['source']}', options: const [('deals', 'Biggest discounts'), ('latest', 'Newest'), ('top_rated', 'Top rated'), ('category', 'From a category')], onChanged: (v) {
                b['source'] = v;
                onChange();
              }),
              if (b['source'] == 'category')
                AppSelect<String>(label: 'Category', value: '${b['category'] ?? ''}', options: [('', 'Choose…'), for (final c in s.list('categories')) ('${c['slug']}', '${c['name']}')], onChanged: (v) {
                  b['category'] = v;
                  onChange();
                }),
              number(b, 'limit', 'How many products'),
            ],
          'image' => [
              Row(children: [
                NetImage(b['image'], size: 96, radius: 6),
                const SizedBox(width: 10),
                OutlinedButton.icon(onPressed: () async {
                  final p = await upload();
                  if (p == null) return;
                  b['image'] = p;
                  onChange();
                }, icon: const Icon(Icons.image_outlined), label: const Text('Choose picture')),
              ]),
              text(b, 'href', 'Link'),
            ],
          _ => [text(b, 'title', 'Title'), toggle(b, 'showSort', 'Sort'), toggle(b, 'showCategory', 'Category filter'), toggle(b, 'showBrand', 'Brand filter'), toggle(b, 'showFilters', 'More filters')],
        },
      ),
    );
  }
}

/// A list of menu links: label + link, on/off, reorder, add, remove.
class _MenuEditor extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> items;
  final VoidCallback onChange;
  final bool simple; // footer links: label + link only
  const _MenuEditor({required this.title, required this.items, required this.onChange, this.simple = false});

  Future<void> _edit(BuildContext context, Map<String, dynamic>? item) async {
    final label = TextEditingController(text: item?['label'] ?? ''), href = TextEditingController(text: item?['href'] ?? '/');
    final ok = await showAppDialog<bool>(context, title: item == null ? 'Add link' : 'Edit link', icon: LucideIcons.link, builder: (c) => Column(mainAxisSize: MainAxisSize.min, children: [
          AppField(controller: label, label: 'Text', autofocus: true),
          const AppGap(),
          AppField(controller: href, label: 'Link', hint: '/category?slug=…'),
        ]), actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))]);
    if (ok != true || label.text.trim().isEmpty) return;
    if (item == null) {
      items.add(simple
          ? {'id': _rid(), 'label': label.text.trim(), 'href': href.text.trim()}
          : {'id': _rid(), 'label': label.text.trim(), 'href': href.text.trim(), 'icon': 'link', 'visibility': 'all', 'enabled': true, 'newTab': false, 'autoCategories': false, 'children': []});
    } else {
      item['label'] = label.text.trim();
      item['href'] = href.text.trim();
    }
    onChange();
  }

  @override
  Widget build(BuildContext context) => WebCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
            DButton('Add link', icon: LucideIcons.plus, size: DSize.sm, variant: DVariant.secondary, onPressed: () => _edit(context, null)),
          ]),
          const SizedBox(height: 6),
          for (var i = 0; i < items.length; i++)
            Row(children: [
              if (!simple)
                Checkbox(value: items[i]['enabled'] != false, onChanged: (v) {
                  items[i]['enabled'] = v == true;
                  onChange();
                }),
              Expanded(
                child: InkWell(
                  onTap: () => _edit(context, items[i]),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${items[i]['label']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text('${items[i]['href']}${items[i]['autoCategories'] == true ? ' · lists every category' : ''}', style: const TextStyle(fontSize: 12, color: W.g500)),
                    ]),
                  ),
                ),
              ),
              IconButton(visualDensity: VisualDensity.compact, onPressed: i == 0 ? null : () {
                items.insert(i - 1, items.removeAt(i));
                onChange();
              }, icon: const Icon(Icons.arrow_upward_rounded, size: 18)),
              IconButton(visualDensity: VisualDensity.compact, onPressed: () {
                items.removeAt(i);
                onChange();
              }, icon: const Icon(Icons.close_rounded, size: 18)),
            ]),
          if (items.isEmpty) const Text('No links.', style: TextStyle(color: W.g500)),
        ]),
      );
}

/// A text box that keeps its own controller (so typing isn't reset by rebuilds).
class _TextBox extends StatefulWidget {
  final String initial, label;
  final int lines;
  final String? hint;
  final bool number;
  final ValueChanged<String> onChanged;
  const _TextBox({super.key, required this.initial, required this.label, this.lines = 1, this.hint, this.number = false, required this.onChanged});
  @override
  State<_TextBox> createState() => _TextBoxState();
}

class _TextBoxState extends State<_TextBox> {
  late final _c = TextEditingController(text: widget.initial);
  @override
  Widget build(BuildContext context) => AppField(controller: _c, label: widget.label, maxLines: widget.lines, hint: widget.hint, keyboardType: widget.number ? TextInputType.number : null, onChanged: widget.onChanged);
}

String moneyOrDash(dynamic v) => v == null ? '—' : money(toDouble(v));
