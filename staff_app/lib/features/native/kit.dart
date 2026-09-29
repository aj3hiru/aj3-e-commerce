import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../../widgets/web.dart';

/// Shared pieces for the app's own versions of the website's admin pages:
/// data that opens offline (last copy kept on the device), one page frame for
/// Windows and phones, and lists that are tables on Windows and cards on phones.

/// Loads `/api/app/v1/page/<name>`, shows the saved copy at once and refreshes it.
class NativeData extends StatefulWidget {
  final String name;
  final Widget Function(BuildContext context, dynamic data, Future<void> Function() reload) builder;
  const NativeData({super.key, required this.name, required this.builder});
  @override
  State<NativeData> createState() => NativeDataState();
}

class NativeDataState extends State<NativeData> {
  dynamic _data;
  String? _at; // when the shown copy was fetched
  bool _loading = true;
  String? _error;

  String get _key => 'page:${widget.name}';

  @override
  void initState() {
    super.initState();
    LocalStore.instance.read(_key).then((v) {
      if (!mounted) return;
      if (v is Map && v.containsKey('data')) {
        setState(() {
          _data = v['data'];
          _at = v['at'] as String?;
        });
      }
      reload();
    });
  }

  Future<void> reload() async {
    setState(() => _loading = true);
    final r = await context.read<AppState>().api.get('/api/app/v1/page/${widget.name}');
    if (!mounted) return;
    if (r.ok) {
      _data = r.data['data'];
      _at = r.data['at'] as String? ?? DateTime.now().toUtc().toIso8601String();
      _error = null;
      await LocalStore.instance.write(_key, {'data': _data, 'at': _at});
    } else {
      _error = r.outcome == ApiOutcome.offline ? 'offline' : r.message;
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) {
      if (_loading) return const Center(child: CircularProgressIndicator());
      return EmptyState(
        icon: _error == 'offline' ? Icons.cloud_off_rounded : Icons.error_outline_rounded,
        title: _error == 'offline' ? 'Connect once to load this page' : 'Could not load',
        message: _error == 'offline' ? 'After the first load it opens even without internet.' : _error,
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_error != null)
        Material(
          color: AppColors.amberSoft,
          child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Text(
            _error == 'offline' ? 'Offline — showing the copy from ${ago(_at)}. Changes are sent when you are back online.' : _error!,
            style: const TextStyle(color: AppColors.amber, fontSize: 12.5, fontWeight: FontWeight.w600),
          ),
        )),
      Expanded(child: widget.builder(context, _data, reload)),
    ]);
  }
}

/// One page frame: the website-style header on Windows, a normal app bar on phones.
class NativeScreen extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<NativeAction> actions;
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final Widget? body; // instead of children
  const NativeScreen({super.key, required this.title, this.subtitle, this.actions = const [], this.children = const [], this.onRefresh, this.body});

  @override
  Widget build(BuildContext context) {
    if (isWide(context)) {
      return WebPage(
        title: title,
        subtitle: subtitle,
        onRefresh: onRefresh,
        back: Navigator.of(context).canPop(),
        actions: [for (final a in actions) WebButton(a.label, icon: a.icon, color: a.primary ? null : W.grey, onPressed: a.onTap)],
        body: body,
        children: body == null ? children : null,
      );
    }
    final list = body ??
        ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 30),
          children: [for (final c in children) Padding(padding: const EdgeInsets.only(bottom: 10), child: c)],
        );
    return Scaffold(
      appBar: AppBar(
        leading: menuButton(context),
        title: Text(title),
        actions: [for (final a in actions) IconButton(tooltip: a.label, icon: Icon(a.icon), onPressed: a.onTap)],
      ),
      body: onRefresh == null ? list : RefreshIndicator(onRefresh: onRefresh!, child: list),
    );
  }
}

class NativeAction {
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool primary;
  const NativeAction(this.label, this.icon, this.onTap, {this.primary = true});
}

/// One row: table cells on Windows; title / subtitle / trailing on phones.
class NRow {
  final List<Widget> cells;
  final String title;
  final String? subtitle;
  final Widget? leading, trailing;
  final VoidCallback? onTap;
  const NRow({required this.cells, required this.title, this.subtitle, this.leading, this.trailing, this.onTap});
}

class NList extends StatelessWidget {
  final List<WebCol> cols;
  final List<NRow> rows;
  final String empty;
  final double rowHeight;
  const NList({super.key, required this.cols, required this.rows, this.empty = 'Nothing here yet.', this.rowHeight = 52});

  @override
  Widget build(BuildContext context) {
    if (isWide(context)) {
      return WebCard(
        padding: EdgeInsets.zero,
        child: WebTable(
          bordered: true,
          rowHeight: rowHeight,
          cols: cols,
          rows: [for (final r in rows) r.cells],
          onRowTap: [for (final r in rows) r.onTap],
          empty: Padding(padding: const EdgeInsets.all(30), child: Center(child: Text(empty, style: const TextStyle(color: W.g500)))),
        ),
      );
    }
    if (rows.isEmpty) return Padding(padding: const EdgeInsets.symmetric(vertical: 30), child: Center(child: Text(empty, style: const TextStyle(color: AppColors.muted))));
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const Divider(height: 1),
          ListTile(
            leading: rows[i].leading,
            title: Text(rows[i].title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: rows[i].subtitle == null ? null : Text(rows[i].subtitle!, maxLines: 2, overflow: TextOverflow.ellipsis),
            trailing: rows[i].trailing,
            onTap: rows[i].onTap,
          ),
        ],
      ]),
    );
  }
}

/// Number cards (4 across on Windows, 2 on phones).
class NStats extends StatelessWidget {
  final List<(IconData, Color, String, String)> items; // icon, colour, value, label
  const NStats(this.items, {super.key});
  @override
  Widget build(BuildContext context) {
    if (isWide(context)) {
      return WebGrid(children: [for (final (i, c, v, l) in items) WebMetric(icon: i, color: c, value: v, label: l)]);
    }
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.1,
      children: [
        for (final (i, c, v, l) in items)
          AppCard(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Container(width: 36, height: 36, decoration: BoxDecoration(color: c.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Icon(i, color: c, size: 19)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(v, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
                  Text(l, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
                ]),
              ),
            ]),
          ),
      ],
    );
  }
}

/// Search + filter chips row above a list.
class NFilters extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onSearch;
  final List<(String, String)> tabs;
  final String? tab;
  final ValueChanged<String>? onTab;
  const NFilters({super.key, required this.hint, required this.onSearch, this.tabs = const [], this.tab, this.onTab});
  @override
  Widget build(BuildContext context) {
    final wide = isWide(context);
    if (hint.isEmpty) {
      return Wrap(spacing: 6, runSpacing: 6, children: [for (final (k, l) in tabs) ChoiceChip(label: Text(l), selected: tab == k, onSelected: (_) => onTab?.call(k))]);
    }
    final search = wide
        ? WebSearch(width: 280, hint: hint, onChanged: onSearch)
        : TextField(onChanged: onSearch, decoration: InputDecoration(hintText: hint, prefixIcon: const Icon(Icons.search_rounded), isDense: true));
    final chips = Wrap(spacing: 6, runSpacing: 6, children: [
      for (final (k, l) in tabs) ChoiceChip(label: Text(l), selected: tab == k, onSelected: (_) => onTab?.call(k)),
    ]);
    if (wide) return Row(children: [if (tabs.isNotEmpty) Expanded(child: chips) else const Spacer(), search]);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [search, if (tabs.isNotEmpty) ...[const SizedBox(height: 8), chips]]);
  }
}

/// Sends a change (queued when offline), shows the result and reloads the page.
Future<bool> nativeSend(BuildContext context, OutboxItem item, {Future<void> Function()? reload, String? done}) async {
  final s = context.read<AppState>();
  final r = await s.sendNow(item);
  if (!context.mounted) return false;
  if (r.ok) {
    if (done != null) toast(context, done);
    await reload?.call();
    return true;
  }
  if (r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy) {
    toast(context, 'Saved — it will be sent when you are online.');
    return true;
  }
  toast(context, r.message, error: true);
  return false;
}

Widget statusPill(bool on, {String yes = 'Active', String no = 'Inactive'}) =>
    WebBadge(on ? yes : no, color: on ? const Color(0xFF15803D) : W.g600, bg: on ? const Color(0xFFDCFCE7) : W.g100);

String inr(dynamic v) => money(toDouble(v));
