import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/adaptive.dart';
import '../ds/button.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/kit.dart';
import '../features/reports/report_export.dart' show saveFile;
import '../widgets/common.dart';
import '../widgets/web.dart';

List<Map<String, dynamic>> _rows(dynamic v) => ((v as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

/// "Push Notification Manager" as on the website: 5 numbers, the not-set-up notice, and the
/// Compose (what to promote, templates, details, UTM, lock-screen preview), History (progress,
/// use again, delete), Subscribers (by browser, export, list) and Settings (VAPID keys) tabs.
/// Opens offline; a push written offline is sent as soon as the internet is back.
class PushWeb extends StatelessWidget {
  const PushWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'push', builder: (context, data, reload) => _Push(data: Map<String, dynamic>.from((data as Map?) ?? const {}), reload: reload));
}

class _Push extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _Push({required this.data, required this.reload});
  @override
  State<_Push> createState() => _PushState();
}

class _Target {
  final String kind, name, kicker, meta, url, image;
  final Map<String, dynamic> raw;
  const _Target(this.kind, this.name, this.kicker, this.meta, this.url, this.image, this.raw);
}

class _PushState extends State<_Push> {
  static final _def = displayDefs['push_manager2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _tab = 'compose', _kind = 'product';
  _Target? _target;
  bool _utm = true, _sending = false;
  (String, String)? _lastAuto;
  final _url = TextEditingController(), _title = TextEditingController(), _body = TextEditingController(), _image = TextEditingController();
  Timer? _live;

  @override
  void initState() {
    super.initState();
    for (final c in [_url, _title, _body, _image]) {
      c.addListener(() => setState(() {}));
    }
    // While a campaign is sending, History refreshes every 5 s (30 s otherwise), as on the website.
    _live = Timer.periodic(const Duration(seconds: 5), (t) {
      if (!mounted || _tab != 'history') return;
      final live = _rows(widget.data['history']).any((c) => _isLive('${c['status']}'));
      if (live || t.tick % 6 == 0) widget.reload();
    });
  }

  @override
  void dispose() {
    _live?.cancel();
    super.dispose();
  }

  static bool _isLive(String s) => s == 'pending' || s == 'processing' || s == 'sending';

  String get _origin {
    final u = Uri.parse(context.read<AppState>().api.server);
    return u.replace(host: u.host.replaceFirst('admin.', '')).origin;
  }

  String _abs(dynamic path) {
    final p = '${path ?? ''}';
    if (p.isEmpty || p.startsWith('http')) return p;
    return '$_origin/${p.startsWith('/') ? p.substring(1) : p}';
  }

  String _withUtm(String url, String title) {
    try {
      final u = Uri.parse(url);
      if (u.host != Uri.parse(_origin).host) return url;
      var slug = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
      if (slug.length > 60) slug = slug.substring(0, 60);
      return u.replace(queryParameters: {...u.queryParameters, 'utm_source': 'push', 'utm_medium': 'web_push', 'utm_campaign': slug.isEmpty ? 'push' : slug}).toString();
    } catch (_) {
      return url;
    }
  }

  List<(String, String, String)> _templates(String shop) {
    final t = _target;
    List<(String, String, String)> custom() => [('📢 Announcement', '📢 News from $shop', "Tap to see what's new."), ('🎉 Store-wide sale', '🎉 Sale is live at $shop!', 'Big discounts across the store. Shop now before it ends!')];
    if (t == null) return _kind == 'custom' ? custom() : const [];
    final r = t.raw;
    switch (t.kind) {
      case 'product':
        final price = toDouble(r['price']), sale = toDouble(r['salePrice']);
        final fin = sale > 0 && sale < price ? sale : price;
        final pct = sale > 0 && sale < price ? ((price - sale) * 100 / price).round() : 0;
        final stock = r['stock'] == null ? null : toInt(r['stock']);
        return [
          if (pct > 0) ('🔥 Deal', '🔥 $pct% OFF — ${r['name']}', 'Now ${money(fin)} (was ${money(price)}). Grab it before the offer ends!'),
          ('✨ New arrival', '✨ New arrival: ${r['name']}', 'Just landed at $shop for ${money(fin)}. Tap to check it out.'),
          if (stock != null && stock > 0 && stock <= 5) ('⏳ Few left', '⏳ Only $stock left — ${r['name']}', "Selling fast! Get yours now for ${money(fin)} before it's gone."),
          ('✅ Back in stock', '✅ Back in stock: ${r['name']}', "It's back! Order now for ${money(fin)} before it sells out again."),
          ('⭐ Top pick', "⭐ Today's pick: ${r['name']}", 'Customers love it — just ${money(fin)} at $shop. Tap to shop.'),
        ];
      case 'category':
        final n = toInt(r['count']) > 0 ? '${r['count']}+ ' : '';
        return [
          ('🛍️ Explore', '🛍️ Explore ${r['name']}', '${n}products in ${r['name']} at $shop. Tap to shop now.'),
          ('🔥 Sale', '🔥 Big savings on ${r['name']}', 'Top picks in ${r['name']} at great prices. Limited time only!'),
          ('✨ New stock', '✨ Fresh arrivals in ${r['name']}', 'New ${r['name']} just added at $shop. Be the first to shop!'),
        ];
      case 'brand':
        return [
          ('⭐ Featured brand', '⭐ ${r['name']} at $shop', 'Shop ${r['count']} ${r['name']} products. Tap to explore.'),
          ('🔥 Brand sale', '🔥 Deals on ${r['name']}', 'Special prices on ${r['name']} — for a limited time only!'),
        ];
      case 'offer':
        final ends = r['endsAt'] == null ? '' : ' Ends ${dateShort(r['endsAt'])}.';
        if (r['code'] != null) {
          final off = r['discountType'] == 'percentage' ? '${r['discountValue']}% OFF' : '${money(r['discountValue'])} OFF';
          return [
            ('🎟️ Coupon code', '🎟️ $off — use ${r['code']}', 'Apply code ${r['code']} at checkout on $shop.$ends'),
            ('⏳ Hurry', '⏳ Your $off code is waiting', 'Use ${r['code']} before it runs out!$ends'),
          ];
        }
        return [
          ('🔥 Sale is live', '🔥 ${r['name']}: ${t.meta}', 'Prices already dropped at $shop — no code needed.$ends'),
          ('⏰ Last chance', '⏰ Last chance: ${t.meta}', '${r['name']} ends soon. Shop now!$ends'),
        ];
    }
    return custom();
  }

  void _choose(_Target t, String shop) {
    final untouched = (_title.text.isEmpty && _body.text.isEmpty) || (_lastAuto != null && _title.text == _lastAuto!.$1 && _body.text == _lastAuto!.$2);
    setState(() {
      _kind = t.kind;
      _target = t;
      if (t.url.isNotEmpty) _url.text = t.url;
      if (t.image.isNotEmpty) _image.text = t.image;
    });
    final tpl = _templates(shop).firstOrNull;
    if (tpl != null && untouched) {
      _title.text = tpl.$2;
      _body.text = tpl.$3;
      _lastAuto = (tpl.$2, tpl.$3);
    }
  }

  /// The website's pickers: search a product / category / brand / offer from this computer's lists.
  Future<void> _pick(String kind, String shop) async {
    final s = context.read<AppState>();
    final products = s.list('products');
    int countWhere(bool Function(Map p) f) => products.where(f).length;
    final items = <_Target>[
      if (kind == 'product')
        for (final p in products.where((p) => p['status'] == 'active' && toInt(p['id']) > 0))
          _Target('product', '${p['name']}', 'Product', () {
            final price = toDouble(p['price']), sale = toDouble(p['salePrice']);
            final stock = p['type'] == 'physical' ? (p['stock'] == null ? 'Stock not set' : toInt(p['stock']) <= 0 ? 'Out of stock' : '${p['stock']} in stock') : '';
            return '${money(sale > 0 && sale < price ? sale : price)}${stock.isEmpty ? '' : ' · $stock'}';
          }(), '$_origin/product?slug=${Uri.encodeComponent('${p['slug'] ?? p['id']}')}', _abs(p['image']), p),
      if (kind == 'category')
        for (final c in s.list('categories').where((c) => c['status'] == 'active'))
          () {
            final n = countWhere((p) => toInt(p['categoryId']) == toInt(c['id']));
            return _Target('category', '${c['name']}', 'Category', '$n products', '$_origin/category?slug=${Uri.encodeComponent('${c['slug'] ?? ''}')}', _abs(c['image']), {...c, 'count': n});
          }(),
      if (kind == 'brand')
        for (final b in s.list('brands').where((b) => b['status'] == 'active'))
          () {
            final n = countWhere((p) => toInt(p['brandId']) == toInt(b['id']));
            return _Target('brand', '${b['name']}', 'Brand', '$n products', '$_origin/?q=${Uri.encodeComponent('${b['name']}')}', _abs(b['logo']), {...b, 'count': n});
          }(),
      if (kind == 'offer') ...[
        for (final c in _rows(s.pageData['campaigns']?['data']?['campaigns']).where((c) => c['isPaused'] != true && (c['endsAt'] == null || DateTime.parse('${c['endsAt']}').isAfter(DateTime.now().toUtc()))))
          _Target('offer', '${c['name']}', 'Campaign offer',
              c['discountType'] == 'percent' ? '${toDouble(c['discountValue']).round()}% OFF' : c['discountType'] == 'amount' ? '${money(c['discountValue'])} OFF' : 'Special prices', _origin, '', c),
        for (final c in s.list('coupons')) _Target('offer', '${c['title']}', 'Coupon · ${c['code']}', c['discountType'] == 'percentage' ? '${c['discountValue']}% OFF' : '${money(c['discountValue'])} OFF', _origin, '', c),
      ],
    ];
    var q = '';
    final picked = await showAppDialog<_Target>(
      context,
      title: 'Choose a ${{'product': 'product', 'category': 'category', 'brand': 'brand', 'offer': 'offer or coupon'}[kind]}',
      icon: LucideIcons.search,
      width: 560,
      builder: (d) => StatefulBuilder(builder: (d, set) {
        final shown = items.where((t) => q.trim().isEmpty || '${t.name} ${t.kicker}'.toLowerCase().contains(q.trim().toLowerCase())).take(80).toList();
        return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          DTextField(autofocus: true, hint: 'Search…', prefixIcon: LucideIcons.search, onChanged: (v) => set(() => q = v)),
          const SizedBox(height: 8),
          SizedBox(
            height: 380,
            child: shown.isEmpty
                ? const Center(child: Text('Nothing found.', style: TextStyle(color: W.g400)))
                : ListView(children: [
                    for (final t in shown)
                      InkWell(
                        onTap: () => popDialog(d, t),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                          child: Row(children: [
                            NetImage(t.image.isEmpty ? null : t.image, size: 40, radius: 6, placeholder: LucideIcons.image),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                                Text('${t.kicker} · ${t.meta}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500)),
                              ]),
                            ),
                          ]),
                        ),
                      ),
                  ]),
          ),
        ]);
      }),
    );
    if (picked != null && mounted) _choose(picked, shop);
  }

  Future<void> _send(int subs) async {
    final url = _utm && _prefs.on('pm2-compose', 'pm2-c-utm') ? _withUtm(_url.text.trim(), _title.text.trim()) : _url.text.trim();
    if (!await confirm(context, 'Send this notification?', '“${_title.text.trim()}” will be sent to $subs subscriber${subs == 1 ? '' : 's'}.\n$url', ok: 'Send Now')) return;
    if (!mounted) return;
    setState(() => _sending = true);
    final s = context.read<AppState>();
    final item = OutboxItem(id: newId(), method: 'POST', path: '/api/push2/send', label: 'Push: ${_title.text.trim()}', body: {'title': _title.text.trim(), 'body': _body.text.trim(), 'url': url, 'image': _image.text.trim().isEmpty ? null : _image.text.trim(), 'postId': null});
    final r = await s.sendNow(item);
    if (!mounted) return;
    setState(() => _sending = false);
    if (r.ok || r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy) {
      toast(context, r.ok ? 'Queued for ${r.data['totalSubscribers'] ?? subs} subscriber${subs == 1 ? '' : 's'} — it goes out after any campaign already sending.' : 'It will be sent as soon as the internet is back.');
      _title.clear();
      _body.clear();
      _url.clear();
      _image.clear();
      setState(() {
        _target = null;
        _lastAuto = null;
      });
      if (r.ok) widget.reload();
    } else {
      toast(context, '${r.data['error'] ?? r.message}', error: true);
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on, item = _prefs.item;
    final d = widget.data;
    final canManage = d['canManage'] == true;
    final configured = d['configured'] == true;
    final subs = toInt(d['subscribers']);
    final history = _rows(d['history']);
    final sent = toInt(d['sent'] ?? history.fold<int>(0, (t, h) => t + toInt(h['sent']))), failed = toInt(d['failed'] ?? history.fold<int>(0, (t, h) => t + toInt(h['failed'])));
    final rate = sent + failed > 0 ? (sent * 100 / (sent + failed)).round() : 0;
    final shop = '${s.settings['businessName'] ?? 'our store'}';
    final tabs = [('compose', 'Compose', LucideIcons.squarePen), ('history', 'History', LucideIcons.history), if (canManage) ('subscribers', 'Subscribers', LucideIcons.users), if (canManage) ('settings', 'Settings', LucideIcons.settings)];
    if (!tabs.any((t) => t.$1 == _tab)) _tab = 'compose';

    Future<void> exportSubs(String format) async {
      final r = await http.get(Uri.parse('${s.api.server}/api/push2/subscribers/export?format=$format'), headers: {'Authorization': 'Bearer ${s.api.token}', 'X-Staff-App': '1'}).timeout(const Duration(seconds: 60)).catchError((_) => http.Response('', 0));
      if (!context.mounted) return;
      if (r.statusCode != 200) return toast(context, r.statusCode == 0 ? 'Export needs the internet.' : "Couldn't export subscribers.", error: true);
      await saveFile(context, Uint8List.fromList(r.bodyBytes), 'push-subscribers.$format', format == 'csv' ? 'text/csv' : 'application/json');
    }

    void openImport() => launchUrl(Uri.parse('${s.api.server}/push-notifications/push-manager2?tab=subscribers'), mode: LaunchMode.externalApplication);

    final header = <Widget>[
      DisplayOptionsButton(_def),
      if (on('pm2-header')) ...[
        if (canManage && on('pm2-header', 'pm2-b-export'))
          Builder(
            builder: (c) => WebButton('Export', icon: LucideIcons.download, onPressed: () async {
              final box = c.findRenderObject() as RenderBox;
              final v = await showDMenu<String>(c, box.localToGlobal(Offset(0, box.size.height + 4)), [const DMenuItem('csv', 'Subscribers (CSV)', shortcut: 'CSV'), const DMenuItem('json', 'Subscribers (JSON)', shortcut: 'JSON')]);
              if (v != null) await exportSubs(v);
            }),
          ),
        if (canManage && on('pm2-header', 'pm2-b-import')) WebButton('Import', icon: LucideIcons.upload, tooltip: 'Opens the import wizard on the website', onPressed: openImport),
        if (on('pm2-header', 'pm2-b-new')) WebButton('New Push', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => setState(() => _tab = 'compose')),
      ],
    ];

    final cards = [
      if (on('pm2-cards', 'pm2-k-subs')) WebMetric(icon: LucideIcons.users, color: const Color(0xFF2563EB), value: '$subs', label: 'Subscribers'),
      if (on('pm2-cards', 'pm2-k-campaigns')) WebMetric(icon: LucideIcons.megaphone, color: const Color(0xFF7C3AED), value: '${d['campaigns'] ?? history.length}', label: 'Campaigns'),
      if (on('pm2-cards', 'pm2-k-sent')) WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF059669), value: '$sent', label: 'Delivered'),
      if (on('pm2-cards', 'pm2-k-failed')) WebMetric(icon: LucideIcons.circleX, color: const Color(0xFFEF4444), value: '$failed', label: 'Failed'),
      if (on('pm2-cards', 'pm2-k-rate')) WebMetric(icon: LucideIcons.percent, color: const Color(0xFFD97706), value: '$rate%', label: 'Delivery Rate'),
    ];

    return WebPage(
      title: 'Push Notification Manager',
      subtitle: 'Promote products, categories and offers with browser push',
      onRefresh: widget.reload,
      actions: header,
      children: [
        if (cards.isNotEmpty) ...[WebGrid(columns: cards.length, minWidth: 170, children: cards), const SizedBox(height: 12)],
        if (item('pm2-notice') && !configured) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(color: const Color(0xFFFFFBEB), border: Border.all(color: const Color(0xFFFDE68A)), borderRadius: BorderRadius.circular(6)),
            child: Row(children: [
              const Icon(LucideIcons.triangleAlert, size: 16, color: Color(0xFF92400E)),
              const SizedBox(width: 10),
              const Expanded(child: Text("Push notifications aren't configured yet — sending is disabled until the VAPID keys are saved.", style: TextStyle(fontSize: 13, color: Color(0xFF92400E)))),
              if (canManage && _tab != 'settings') TextButton(onPressed: () => setState(() => _tab = 'settings'), child: const Text('Open Settings', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF78350F)))),
            ]),
          ),
          const SizedBox(height: 12),
        ],
        WebCard(
          padding: const EdgeInsets.all(10),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Wrap(spacing: 4, children: [
              for (final (k, l, i) in tabs)
                Material(
                  color: _tab == k ? const Color(0xFF2563EB) : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(6),
                    onTap: () => setState(() => _tab = k),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(i, size: 15, color: _tab == k ? Colors.white : W.g600), const SizedBox(width: 6), Text(l, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: _tab == k ? Colors.white : W.g700))]),
                    ),
                  ),
                ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        if (_tab == 'compose' && on('pm2-compose')) _compose(configured, subs, shop),
        if (_tab == 'history' && on('pm2-history')) _history(history),
        if (_tab == 'subscribers' && canManage && on('pm2-subs')) _subscribers(d, exportSubs, openImport),
        if (_tab == 'settings' && canManage && on('pm2-settings')) _PushSettings(keys: Map<String, dynamic>.from((d['keys'] as Map?) ?? const {}), configured: configured, subscribers: subs, reload: widget.reload, show: (k) => on('pm2-settings', k)),
      ],
    );
  }

  Widget _compose(bool configured, int subs, String shop) {
    bool c(String k) => _prefs.on('pm2-compose', k);
    final kinds = [
      for (final (k, l, i) in const [('product', 'Product', LucideIcons.package), ('offer', 'Offer / Coupon', LucideIcons.badgePercent), ('category', 'Category', LucideIcons.folderTree), ('brand', 'Brand', LucideIcons.tag), ('custom', 'Custom URL', LucideIcons.link2)])
        if (_prefs.on('pm2-types', 'pm2-t-$k')) (k, l, i),
    ];
    final templates = _templates(shop);
    final finalUrl = _utm && c('pm2-c-utm') ? _withUtm(_url.text.trim(), _title.text.trim()) : _url.text.trim();
    final canSend = configured && _title.text.trim().isNotEmpty && _url.text.trim().isNotEmpty && !_sending;
    Widget label(String t) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(t.toUpperCase(), style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: .4, color: W.g500)));
    Widget counter(int len, int max) => !c('pm2-c-counters') ? const SizedBox() : Text('$len/$max', style: TextStyle(fontSize: 11, color: len > max ? const Color(0xFFD97706) : W.g400, fontWeight: len > max ? FontWeight.w600 : FontWeight.w400));

    final left = WebCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: Row(children: [Icon(LucideIcons.squarePen, size: 16, color: Color(0xFF2563EB)), SizedBox(width: 8), Text('Compose Notification', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF2563EB)))]),
        ),
        const Divider(height: 1, color: W.g100),
        Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (c('pm2-c-target') && kinds.isNotEmpty) ...[
              label('1. What are you promoting?'),
              Row(children: [
                for (final (k, l, i) in kinds)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Material(
                        color: _kind == k ? const Color(0xFFEFF6FF) : Colors.white,
                        shape: RoundedRectangleBorder(side: BorderSide(color: _kind == k ? const Color(0xFF2563EB) : W.g200), borderRadius: BorderRadius.circular(8)),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(8),
                          onTap: () {
                            setState(() {
                              _kind = k;
                              if (_target?.kind != k) _target = null;
                            });
                            if (k != 'custom') _pick(k, shop);
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Column(children: [Icon(i, size: 19, color: _kind == k ? const Color(0xFF2563EB) : W.g600), const SizedBox(height: 4), Text(l, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _kind == k ? const Color(0xFF2563EB) : W.g700))]),
                          ),
                        ),
                      ),
                    ),
                  ),
              ]),
              const SizedBox(height: 10),
              if (_target != null)
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: W.g50, border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
                  child: Row(children: [
                    NetImage(_target!.image.isEmpty ? null : _target!.image, size: 56, radius: 6, placeholder: LucideIcons.image),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(_target!.kicker.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: .4, color: W.g500)),
                        Text(_target!.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: W.g900)),
                        Text(_target!.meta, style: const TextStyle(fontSize: 12, color: W.g600)),
                      ]),
                    ),
                    TextButton(onPressed: () => _pick(_kind, shop), child: const Text('Change')),
                    IconButton(onPressed: () => setState(() => _target = null), icon: const Icon(LucideIcons.x, size: 16, color: W.g400)),
                  ]),
                )
              else if (_kind != 'custom')
                OutlinedButton.icon(
                  onPressed: () => _pick(_kind, shop),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44), side: const BorderSide(color: Color(0xFF93C5FD)), backgroundColor: const Color(0xFFF5F9FF)),
                  icon: const Icon(LucideIcons.chevronDown, size: 16, color: Color(0xFF2563EB)),
                  label: Text('Choose a ${kinds.firstWhere((k) => k.$1 == _kind, orElse: () => kinds.first).$2.toLowerCase()}', style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF2563EB))),
                )
              else
                const Text('Custom link — type any URL below (your own site or elsewhere).', style: TextStyle(fontSize: 12, color: W.g500)),
              const SizedBox(height: 20),
            ],
            if (c('pm2-c-templates') && templates.isNotEmpty) ...[
              label('2. Message template'),
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (final t in templates)
                  ChoiceChip(
                    label: Text(t.$1, style: const TextStyle(fontSize: 12)),
                    selected: _title.text == t.$2 && _body.text == t.$3,
                    onSelected: (_) {
                      _title.text = t.$2;
                      _body.text = t.$3;
                      _lastAuto = (t.$2, t.$3);
                    },
                  ),
              ]),
              const SizedBox(height: 20),
            ],
            if (c('pm2-c-fields')) ...[
              label('3. Notification details'),
              DTextField(controller: _url, label: 'Target URL', required: true, hint: 'https://example.com/my-page', keyboardType: TextInputType.url),
              const SizedBox(height: 12),
              Row(children: [const Expanded(child: Text('Title *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))), counter(_title.text.length, 50)]),
              const SizedBox(height: 4),
              DTextField(controller: _title, hint: 'Notification Title', maxLength: 120),
              const SizedBox(height: 12),
              Row(children: [const Expanded(child: Text('Message Body', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))), counter(_body.text.length, 120)]),
              const SizedBox(height: 4),
              DTextField(controller: _body, hint: 'Short description...', maxLines: 3, minLines: 2, maxLength: 300),
              const SizedBox(height: 12),
              DTextField(controller: _image, label: 'Banner Image URL', hint: 'https://...'),
              const SizedBox(height: 16),
            ],
            if (c('pm2-c-utm')) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  InkWell(
                    onTap: () => setState(() => _utm = !_utm),
                    child: Row(children: [
                      IgnorePointer(child: Checkbox(value: _utm, onChanged: (_) {})),
                      const Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Add UTM tracking', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: W.g800)),
                          Text('Tags links to your site so visits from this push show up in analytics.', style: TextStyle(fontSize: 12, color: W.g500)),
                        ]),
                      ),
                    ]),
                  ),
                  if (_utm && _url.text.trim().isNotEmpty && finalUrl != _url.text.trim())
                    Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(6), color: W.g50, child: SelectableText(finalUrl, style: const TextStyle(fontSize: 11, color: W.g600))),
                ]),
              ),
              const SizedBox(height: 16),
            ],
            if (c('pm2-c-actions')) ...[
              SizedBox(height: 46, child: DButton('Send to All Subscribers', icon: LucideIcons.send, variant: DVariant.success, loading: _sending, onPressed: canSend ? () => _send(subs) : null)),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => setState(() => _tab = 'history'),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40), side: const BorderSide(color: Color(0xFF0DCAF0))),
                icon: const Icon(LucideIcons.history, size: 16, color: Color(0xFF0AA2C0)),
                label: const Text('View Live Progress', style: TextStyle(color: Color(0xFF0AA2C0))),
              ),
              if (!configured) const Padding(padding: EdgeInsets.only(top: 6), child: Text('Sending is disabled until VAPID keys are saved in Settings.', style: TextStyle(fontSize: 12, color: Color(0xFFB45309)))),
              if (configured && subs == 0) const Padding(padding: EdgeInsets.only(top: 6), child: Text('No subscribers yet — shoppers subscribe from the "Allow Notifications" prompt on the store.', style: TextStyle(fontSize: 12, color: Color(0xFFB45309)))),
            ],
          ]),
        ),
      ]),
    );

    final preview = Column(children: [
      const Row(mainAxisSize: MainAxisSize.min, children: [Icon(LucideIcons.smartphone, size: 14, color: W.g500), SizedBox(width: 6), Text('LIVE LOCK SCREEN PREVIEW', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: .4, color: W.g500))]),
      const SizedBox(height: 10),
      _PhonePreview(app: shop, title: _title.text, body: _body.text, image: _image.text.trim()),
      if (c('pm2-c-note')) const Padding(padding: EdgeInsets.only(top: 10), child: SizedBox(width: 280, child: Text('*Preview renders roughly how it appears on modern Android devices.', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: W.g500)))),
    ]);
    final showLeft = ['pm2-c-target', 'pm2-c-templates', 'pm2-c-fields', 'pm2-c-actions'].any(c);
    final showRight = c('pm2-c-preview');
    if (!showLeft) return showRight ? Center(child: preview) : const SizedBox();
    if (!showRight) return left;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 7, child: left), const SizedBox(width: 20), Expanded(flex: 5, child: preview)]);
  }

  Widget _history(List<Map<String, dynamic>> rows) {
    bool h(String k) => _prefs.on('pm2-history', k);
    final live = rows.any((c) => _isLive('${c['status']}'));
    if (rows.isEmpty) {
      return WebCard(
        padding: const EdgeInsets.symmetric(vertical: 50),
        child: Column(children: [
          const Icon(LucideIcons.bellOff, size: 44, color: W.g300),
          const SizedBox(height: 10),
          const Text('No campaigns yet', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: W.g800)),
          const Text('Start sending notifications from the manager', style: TextStyle(fontSize: 13, color: W.g500)),
          const SizedBox(height: 14),
          WebButton('Create First Push', color: const Color(0xFF2563EB), onPressed: () => setState(() => _tab = 'compose')),
        ]),
      );
    }
    (String, Color, Color) meta(String s) => switch (s) {
          'pending' => ('Pending', const Color(0xFF856404), const Color(0xFFFFF3CD)),
          'processing' || 'sending' => ('Processing', const Color(0xFF084298), const Color(0xFFCFE2FF)),
          'completed' || 'sent' => ('Completed', const Color(0xFF0F5132), const Color(0xFFD1E7DD)),
          'failed' => ('Failed', const Color(0xFF842029), const Color(0xFFF8D7DA)),
          _ => (s.isEmpty ? '—' : '${s[0].toUpperCase()}${s.substring(1)}', W.g600, W.g100),
        };
    Future<void> reuse(Map c) async {
      var url = '${c['url'] ?? ''}';
      try {
        final u = Uri.parse(url);
        url = u.replace(queryParameters: {...u.queryParameters}..removeWhere((k, _) => k.startsWith('utm_'))).toString().replaceAll(RegExp(r'\?$'), '');
      } catch (_) {}
      setState(() {
        _kind = 'custom';
        _target = null;
        _tab = 'compose';
      });
      _url.text = url;
      _title.text = '${c['title'] ?? ''}';
      _body.text = '${c['body'] ?? ''}';
      _image.text = '${c['image'] ?? ''}';
    }

    Future<void> delete(Map c) async {
      if (!await confirm(context, 'Delete this campaign?', '“${c['title']}” and its sending log will be removed.', ok: 'Delete', danger: true) || !mounted) return;
      await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/push2/campaigns/${c['id']}', label: 'Delete push ${c['title']}', effect: {'kind': 'page_row_delete', 'page': 'push', 'list': 'history', 'ids': [c['id']]}), reload: widget.reload, done: '“${c['title']}” deleted.');
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (h('pm2-h-live'))
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: live ? const Color(0xFF10B981) : W.g300)),
            const SizedBox(width: 8),
            Expanded(child: Text(live ? 'Sending in progress • refreshing every 5s' : 'Live status • auto-refresh every 30s', style: const TextStyle(fontSize: 13, color: W.g600))),
            Text('Showing ${rows.length} of ${widget.data['campaigns'] ?? rows.length} campaigns', style: const TextStyle(fontSize: 13, color: W.g600)),
          ]),
        ),
      WebCard(
        padding: EdgeInsets.zero,
        child: WebTable(
          rowHeight: 64,
          cols: [
            const WebCol('Campaign / Post', flex: 2.4),
            if (h('pm2-h-status')) const WebCol('Status', flex: .9),
            if (h('pm2-h-progress')) const WebCol('Progress', flex: 1.2),
            if (h('pm2-h-counts')) const WebCol('Sent / Failed', flex: .9),
            if (h('pm2-h-total')) const WebCol('Total', flex: .6),
            if (h('pm2-h-time')) const WebCol('Time', flex: 1),
            if (h('pm2-h-actions')) const WebCol('Actions', width: 120),
          ],
          rows: [
            for (final c in rows)
              () {
                final total = toInt(c['totalSubscribers']);
                final pct = total > 0 ? (toInt(c['sent']) / total).clamp(0.0, 1.0) : 0.0;
                final (l, fg, bg) = meta('${c['status']}');
                return [
                  Row(children: [
                    if (h('pm2-h-image')) ...[NetImage('${c['image'] ?? ''}'.isEmpty ? null : c['image'], size: 42, radius: 6, placeholder: LucideIcons.bell), const SizedBox(width: 10)],
                    Expanded(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${c['title'] ?? 'Custom Push'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                        Text('${c['body'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500)),
                      ]),
                    ),
                  ]),
                  if (h('pm2-h-status')) Align(alignment: Alignment.centerLeft, child: WebBadge(l, color: fg, bg: bg)),
                  if (h('pm2-h-progress'))
                    Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: pct, minHeight: 8, backgroundColor: const Color(0xFFE9ECEF), color: const Color(0xFF2563EB))),
                      const SizedBox(height: 3),
                      Text('${(pct * 1000).round() / 10}%', style: const TextStyle(fontSize: 11.5, color: W.g500)),
                    ]),
                  if (h('pm2-h-counts'))
                    Text.rich(TextSpan(children: [
                      TextSpan(text: '${c['sent'] ?? 0}', style: const TextStyle(color: Color(0xFF059669), fontWeight: FontWeight.w600)),
                      const TextSpan(text: ' / ', style: TextStyle(color: W.g400)),
                      TextSpan(text: '${c['failed'] ?? 0}', style: const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w600)),
                    ])),
                  if (h('pm2-h-total')) Text('$total'),
                  if (h('pm2-h-time')) Text(dateTime(c['createdAt']), style: const TextStyle(fontSize: 12.5, color: W.g600)),
                  if (h('pm2-h-actions'))
                    Row(children: [
                      WebIconAction(LucideIcons.rotateCcw, color: const Color(0xFF2563EB), tooltip: 'Use again', onTap: () => reuse(c)),
                      if ('${c['url'] ?? ''}'.isNotEmpty) WebIconAction(LucideIcons.link2, color: W.g600, tooltip: 'View URL', onTap: () => launchUrl(Uri.parse('${c['url']}'), mode: LaunchMode.externalApplication)),
                      WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete', onTap: () => delete(c)),
                    ]),
                ];
              }(),
          ],
        ),
      ),
    ]);
  }

  Widget _subscribers(Map<String, dynamic> d, Future<void> Function(String) exportSubs, VoidCallback openImport) {
    bool sOn(String k) => _prefs.on('pm2-subs', k);
    final breakdown = _rows(d['breakdown']);
    final rows = _rows(d['subscriberRows']);
    final max = breakdown.fold<int>(1, (m, b) => toInt(b['count']) > m ? toInt(b['count']) : m);
    const colors = {'chrome': Color(0xFF2563EB), 'firefox': Color(0xFFF97316), 'safari': Color(0xFF0EA5E9), 'edge': Color(0xFF14B8A6), 'other': Color(0xFF94A3B8)};
    Future<void> remove(Map r) async {
      if (!await confirm(context, 'Remove this subscriber?', 'This browser stops getting your notifications.', ok: 'Remove', danger: true) || !mounted) return;
      await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/push2/subscribers/${r['id']}', label: 'Remove push subscriber', effect: {'kind': 'page_row_delete', 'page': 'push', 'list': 'subscriberRows', 'ids': [r['id']]}), reload: widget.reload, done: 'Subscriber removed.');
    }

    final bd = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Text('Subscribers by browser', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900))),
          Text.rich(TextSpan(style: const TextStyle(fontSize: 13, color: W.g500), children: [
            TextSpan(text: '${d['subscribers']}', style: const TextStyle(fontWeight: FontWeight.w700, color: W.g900)),
            const TextSpan(text: ' total · '),
            TextSpan(text: '+${d['newThisWeek'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF059669))),
            const TextSpan(text: ' this week'),
          ])),
        ]),
        const SizedBox(height: 14),
        for (final b in breakdown.where((b) => toInt(b['count']) > 0 || b['browser'] != 'other'))
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              SizedBox(width: 130, child: Text('${b['label']}', style: const TextStyle(fontSize: 13, color: W.g700))),
              Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: toInt(b['count']) / max, minHeight: 10, backgroundColor: W.g100, color: colors[b['browser']] ?? W.g400))),
              SizedBox(width: 60, child: Text('${b['count']}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
            ]),
          ),
      ]),
    );
    final tools = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Import / Export', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
        const SizedBox(height: 6),
        const Text("Back up or move subscribers. Every row is verified before saving — works only with this site's VAPID keys.", style: TextStyle(fontSize: 12, color: W.g500)),
        const SizedBox(height: 12),
        WebButton('Import Subscribers', icon: LucideIcons.upload, color: const Color(0xFF2563EB), tooltip: 'Opens the import wizard on the website', onPressed: openImport),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: WebButton('CSV', icon: LucideIcons.download, onPressed: toInt(d['subscribers']) == 0 ? null : () => exportSubs('csv'))),
          const SizedBox(width: 8),
          Expanded(child: WebButton('JSON', icon: LucideIcons.download, onPressed: toInt(d['subscribers']) == 0 ? null : () => exportSubs('json'))),
        ]),
      ]),
    );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (sOn('pm2-s-breakdown') || sOn('pm2-s-tools')) ...[
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (sOn('pm2-s-breakdown')) Expanded(child: bd),
          if (sOn('pm2-s-breakdown') && sOn('pm2-s-tools')) const SizedBox(width: 16),
          if (sOn('pm2-s-tools')) SizedBox(width: sOn('pm2-s-breakdown') ? 340 : null, child: tools),
        ]),
        const SizedBox(height: 16),
      ],
      if (sOn('pm2-s-table'))
        WebCard(
          padding: EdgeInsets.zero,
          child: WebTable(
            cols: const [WebCol('#', width: 70), WebCol('Browser', flex: 1.2), WebCol('Push service', flex: 1.6), WebCol('Subscribed', flex: 1), WebCol('', width: 56)],
            rows: [
              for (final r in rows)
                [
                  Text('${r['id']}', style: const TextStyle(color: W.g500)),
                  Row(children: [Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: colors[r['browser']] ?? W.g400)), const SizedBox(width: 8), Text('${r['browserLabel']}')]),
                  Text('${r['host']}', style: const TextStyle(fontSize: 12.5, color: W.g600)),
                  Text(dateTime(r['createdAt']), style: const TextStyle(fontSize: 12.5, color: W.g600)),
                  WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Remove', onTap: () => remove(r)),
                ],
            ],
            empty: const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No subscribers yet.', style: TextStyle(color: W.g400)))),
          ),
        ),
      if (sOn('pm2-s-pager') && toInt(d['subscribers']) > rows.length)
        Padding(padding: const EdgeInsets.only(top: 8), child: Text('Showing the newest ${rows.length} of ${d['subscribers']} subscribers.', style: const TextStyle(fontSize: 12.5, color: W.g500))),
    ]);
  }
}

/// The lock-screen mockup: clock / date on a purple gradient and an Android-style card.
class _PhonePreview extends StatelessWidget {
  final String app, title, body, image;
  const _PhonePreview({required this.app, required this.title, required this.body, required this.image});
  @override
  Widget build(BuildContext context) {
    final now = ist(DateTime.now().toUtc());
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    final h = now.hour % 12 == 0 ? 12 : now.hour % 12;
    return Container(
      width: 292,
      height: 560,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: const Color(0xFF111827), borderRadius: BorderRadius.circular(40), boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))]),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(31),
        child: Container(
          decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF667EEA), Color(0xFF764BA2)])),
          padding: const EdgeInsets.only(top: 56),
          child: Column(children: [
            Text('$h:${now.minute.toString().padLeft(2, '0')}', style: const TextStyle(fontSize: 52, fontWeight: FontWeight.w300, color: Color(0xCCFFFFFF), height: 1)),
            const SizedBox(height: 6),
            Text('${days[now.weekday - 1]}, ${months[now.month - 1]} ${now.day}', style: const TextStyle(fontSize: 14, color: Color(0xCCFFFFFF))),
            const SizedBox(height: 26),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(color: const Color(0xF2FFFFFF), borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 15, offset: Offset(0, 4))]),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
                  child: Row(children: [
                    Container(width: 16, height: 16, decoration: BoxDecoration(color: const Color(0xFF2563EB), borderRadius: BorderRadius.circular(4)), child: const Icon(LucideIcons.bell, size: 10, color: Colors.white)),
                    const SizedBox(width: 5),
                    Expanded(child: Text(app, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF555555)))),
                    const Text('now', style: TextStyle(fontSize: 11, color: Color(0xFF555555))),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 2, 12, 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title.isEmpty ? 'Notification Title' : title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF222222))),
                    const SizedBox(height: 2),
                    Text(body.isEmpty ? 'Notification body text...' : body, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFF444444))),
                    if (image.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(image, height: 120, width: double.infinity, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox())),
                    ],
                  ]),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Settings → VAPID keys: public key (copy), private key (only replaced, never shown), contact,
/// save, and "Generate new keys".
class _PushSettings extends StatefulWidget {
  final Map<String, dynamic> keys;
  final bool configured;
  final int subscribers;
  final Future<void> Function() reload;
  final bool Function(String) show;
  const _PushSettings({required this.keys, required this.configured, required this.subscribers, required this.reload, required this.show});
  @override
  State<_PushSettings> createState() => _PushSettingsState();
}

class _PushSettingsState extends State<_PushSettings> {
  late final _public = TextEditingController(text: '${widget.keys['publicKey'] ?? ''}');
  final _private = TextEditingController();
  late final _subject = TextEditingController(text: '${widget.keys['subject'] ?? ''}'.isEmpty ? 'mailto:' : '${widget.keys['subject']}');
  late bool _replacing = widget.keys['hasPrivateKey'] != true;
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final r = await context.read<AppState>().api.send('POST', '/api/push2/settings', body: {'publicKey': _public.text.trim(), 'privateKey': _private.text.trim(), 'subject': _subject.text.trim()});
    if (!mounted) return;
    setState(() => _busy = false);
    if (r.ok) {
      toast(context, 'Push settings saved.');
      _private.clear();
      widget.reload();
    } else {
      toast(context, r.outcome == ApiOutcome.offline ? 'Saving the keys needs the internet.' : '${r.data['error'] ?? r.message}', error: true);
    }
  }

  Future<void> _generate() async {
    if (!await confirm(context, 'Generate new keys?', widget.subscribers > 0 ? 'Current subscribers (${widget.subscribers}) were made with the old keys and will stop receiving notifications until they subscribe again. Download a backup first if you may need the old keys.' : 'A new key pair is created and saved at once.', ok: 'Generate', danger: widget.subscribers > 0)) return;
    if (!mounted) return;
    setState(() => _busy = true);
    final r = await context.read<AppState>().api.send('POST', '/api/push2/settings/generate');
    if (!mounted) return;
    setState(() => _busy = false);
    if (r.ok) {
      toast(context, 'New keys generated (ID ${r.data['fingerprint']}).');
      widget.reload();
    } else {
      toast(context, r.outcome == ApiOutcome.offline ? 'This needs the internet.' : '${r.data['error'] ?? r.message}', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final form = WebCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: Row(children: [
            const Icon(LucideIcons.keyRound, size: 16, color: Color(0xFF2563EB)),
            const SizedBox(width: 8),
            const Expanded(child: Text('VAPID Keys', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF2563EB)))),
            widget.configured
                ? WebBadge('Configured · ${widget.subscribers} subscribers', color: const Color(0xFF0F5132), bg: const Color(0xFFD1E7DD))
                : const WebBadge('Not configured', color: Color(0xFF856404), bg: Color(0xFFFFF3CD)),
          ]),
        ),
        const Divider(height: 1, color: W.g100),
        Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (!widget.configured) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFEFF6FF), border: Border.all(color: const Color(0xFFDBEAFE)), borderRadius: BorderRadius.circular(8)),
                child: Row(children: [
                  const Icon(LucideIcons.sparkles, size: 16, color: Color(0xFF1E3A8A)),
                  const SizedBox(width: 10),
                  const Expanded(child: Text('No keys yet. The quickest way: Generate new keys — one click, nothing to copy.', style: TextStyle(fontSize: 13, color: Color(0xFF1E3A8A)))),
                  WebButton('Generate new keys', color: const Color(0xFF2563EB), onPressed: _busy ? null : _generate),
                ]),
              ),
              const SizedBox(height: 14),
            ],
            Row(children: [
              const Expanded(child: Text('Public Key *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
              if ('${widget.keys['publicFingerprint'] ?? ''}'.isNotEmpty) Text('ID ${widget.keys['publicFingerprint']}', style: const TextStyle(fontSize: 11, color: W.g400)),
            ]),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(child: DTextField(controller: _public, hint: 'Starts with B… (about 87 characters)')),
              const SizedBox(width: 8),
              WebIconAction(LucideIcons.copy, color: W.g600, tooltip: 'Copy public key', onTap: () {
                Clipboard.setData(ClipboardData(text: _public.text));
                toast(context, 'Public key copied.');
              }),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              const Expanded(child: Text('Private Key *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
              if ('${widget.keys['privateFingerprint'] ?? ''}'.isNotEmpty) Text('ID ${widget.keys['privateFingerprint']}', style: const TextStyle(fontSize: 11, color: W.g400)),
            ]),
            const SizedBox(height: 4),
            if (_replacing)
              DTextField(controller: _private, hint: 'Paste the private key', obscure: true)
            else
              Row(children: [
                const Icon(LucideIcons.lock, size: 14, color: W.g500),
                const SizedBox(width: 6),
                const Expanded(child: Text('Saved on the server — never shown.', style: TextStyle(fontSize: 13, color: W.g600))),
                TextButton(onPressed: () => setState(() => _replacing = true), child: const Text('Replace')),
              ]),
            const SizedBox(height: 14),
            DTextField(controller: _subject, label: 'Contact (subject)', hint: 'mailto:you@example.com'),
            const SizedBox(height: 16),
            Row(children: [
              WebButton('Save Settings', icon: LucideIcons.save, color: const Color(0xFF2563EB), onPressed: _busy ? null : _save),
              if (widget.configured) ...[const SizedBox(width: 8), WebButton('Generate new keys', icon: LucideIcons.refreshCw, onPressed: _busy ? null : _generate)],
            ]),
          ]),
        ),
      ]),
    );
    final help = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Where do keys come from?', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
        const SizedBox(height: 8),
        for (final t in const [
          'Easiest: press “Generate new keys” — they are made and saved on the server.',
          'Moving from another site? Paste that site’s public and private key here so existing subscribers keep working.',
          'The contact is an email (mailto:) or your website address — push services use it if something goes wrong.',
          'Changing keys means existing subscribers must subscribe again.',
        ])
          Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('•  ', style: TextStyle(color: W.g500)), Expanded(child: Text(t, style: const TextStyle(fontSize: 13, color: W.g700)))])),
      ]),
    );
    final side = widget.show('pm2-st-status') || widget.show('pm2-st-help');
    if (!widget.show('pm2-st-form')) return side ? help : const SizedBox();
    return side ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: form), const SizedBox(width: 16), SizedBox(width: 360, child: help)]) : form;
  }
}
