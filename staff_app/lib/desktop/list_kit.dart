import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/format.dart';
import '../ds/dialog.dart';
import '../widgets/web.dart';

/// The website's list pages share one table card: "Show [n] entries · Select All (n) · Bulk Actions
/// ·· Clear filters ·· search", a gridded table with a select column and sortable headings, and the
/// "Showing a–b of n (filtered from m total entries)" pager. [WebList] is that card; each page gives
/// it the filtered rows and its columns (already cut down by Display Options).

class ListCol {
  final WebCol col;
  final Widget Function(Map<String, dynamic> r) cell;
  /// A value to sort by when the heading is clicked (null = not sortable).
  final Comparable<Object?> Function(Map<String, dynamic> r)? sort;
  const ListCol(this.col, this.cell, {this.sort});
}

class WebList extends StatefulWidget {
  final List<Map<String, dynamic>> rows; // after the page's filters
  final int total; // before filters
  final List<ListCol> cols;
  final bool selectable;
  /// Bulk Actions menu for the selected rows; the chosen value goes to [onBulk].
  final List<DMenuItem<String>?> Function(int n)? bulk;
  final Future<void> Function(String action, List<Map<String, dynamic>> rows)? onBulk;
  final void Function(Map<String, dynamic> r)? onTap;
  final String empty;
  final double rowHeight;
  final bool filtersOn;
  final VoidCallback? onClearFilters;
  /// Right side of the toolbar (the table search box).
  final Widget? search;
  final List<Color?> Function(List<Map<String, dynamic>> shown)? highlight;
  const WebList({
    super.key,
    required this.rows,
    required this.total,
    required this.cols,
    this.selectable = false,
    this.bulk,
    this.onBulk,
    this.onTap,
    this.empty = 'Nothing here yet.',
    this.rowHeight = 54,
    this.filtersOn = false,
    this.onClearFilters,
    this.search,
    this.highlight,
  });
  @override
  State<WebList> createState() => _WebListState();
}

class _WebListState extends State<WebList> {
  int _page = 0, _per = 25; // 0 = all
  int? _sort; // index into cols
  bool _asc = true;
  final Set<Object?> _selected = {};

  @override
  void didUpdateWidget(WebList old) {
    super.didUpdateWidget(old);
    if (old.rows.length != widget.rows.length) _page = 0;
  }

  @override
  Widget build(BuildContext context) {
    final rows = [...widget.rows];
    if (_sort != null && _sort! < widget.cols.length && widget.cols[_sort!].sort != null) {
      final key = widget.cols[_sort!].sort!;
      rows.sort((a, b) {
        final c = key(a).compareTo(key(b));
        return _asc ? c : -c;
      });
    }
    final ids = {for (final r in widget.rows) r['id']};
    _selected.removeWhere((id) => !ids.contains(id));
    final pages = _per == 0 ? 1 : (rows.length / _per).ceil().clamp(1, 1 << 30);
    if (_page >= pages) _page = pages - 1;
    final shown = _per == 0 ? rows : WebPager.slice(rows, _page, _per);
    final pageIds = [for (final r in shown) r['id']];
    final pageAll = pageIds.isNotEmpty && pageIds.every(_selected.contains);
    final selectedRows = widget.rows.where((r) => _selected.contains(r['id'])).toList();

    final cols = [
      if (widget.selectable)
        ListCol(
          WebCol('', width: 44, head: Checkbox(value: pageAll, onChanged: (v) => setState(() => v == true ? _selected.addAll(pageIds) : _selected.removeAll(pageIds)))),
          (r) => Checkbox(value: _selected.contains(r['id']), onChanged: (v) => setState(() => v == true ? _selected.add(r['id']) : _selected.remove(r['id']))),
        ),
      for (final (i, c) in widget.cols.indexed)
        ListCol(
          c.sort == null
              ? c.col
              : WebCol(c.col.label, flex: c.col.flex, width: c.col.width, right: c.col.right, head: c.col.head, sorted: _sort == i ? _asc : null, onSort: () => setState(() {
                    if (_sort == i) {
                      _asc = !_asc;
                    } else {
                      _sort = i;
                      _asc = true;
                    }
                  })),
          c.cell,
        ),
    ];

    Widget bulkButton() => Builder(
          builder: (c) => WebButton(_selected.isEmpty ? 'Bulk Actions' : 'Bulk Actions (${_selected.length})', icon: LucideIcons.layers, tooltip: _selected.isEmpty ? 'Select rows first' : null, onPressed: _selected.isEmpty || widget.bulk == null
              ? null
              : () async {
                  final box = c.findRenderObject() as RenderBox;
                  final v = await showDMenu<String>(c, box.localToGlobal(Offset(0, box.size.height + 4)), widget.bulk!(_selected.length));
                  if (v != null) await widget.onBulk?.call(v, selectedRows);
                  if (mounted) setState(() {});
                }),
        );

    return WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(children: [
            Expanded(
              child: Wrap(spacing: 16, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('Show ', style: TextStyle(fontSize: 13.5, color: W.g800)),
                  SizedBox(width: 88, child: WebSelect<int>(value: _per, options: const [(10, '10'), (25, '25'), (50, '50'), (100, '100'), (0, 'All')], onChanged: (v) => setState(() { _per = v; _page = 0; }))),
                  const Text(' entries', style: TextStyle(fontSize: 13.5, color: W.g800)),
                ]),
                if (widget.selectable) ...[
                  InkWell(
                    onTap: () => setState(() {
                      final all = widget.rows.map((r) => r['id']);
                      all.every(_selected.contains) ? _selected.removeAll(all) : _selected.addAll(all);
                    }),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      IgnorePointer(child: Checkbox(value: widget.rows.isNotEmpty && widget.rows.every((r) => _selected.contains(r['id'])), onChanged: (_) {})),
                      Text('Select All (${_selected.length})', style: const TextStyle(fontSize: 13.5, color: W.g800)),
                    ]),
                  ),
                  if (widget.bulk != null) bulkButton(),
                  if (_selected.isNotEmpty) TextButton(onPressed: () => setState(_selected.clear), child: const Text('Clear selection', style: TextStyle(fontSize: 13, color: W.g500))),
                ],
                if (widget.filtersOn && widget.onClearFilters != null)
                  TextButton.icon(
                    onPressed: widget.onClearFilters,
                    icon: const Icon(LucideIcons.x, size: 14, color: Color(0xFF2563EB)),
                    label: const Text('Clear filters', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF2563EB))),
                  ),
              ]),
            ),
            if (widget.search != null) ...[const SizedBox(width: 12), widget.search!],
          ]),
        ),
        if (cols.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: Text('All table columns are hidden — turn them on from Display Options.', style: TextStyle(color: W.g400))))
        else
          WebTable(
            bordered: true,
            rowHeight: widget.rowHeight,
            cols: [for (final c in cols) c.col],
            rows: [for (final r in shown) [for (final c in cols) c.cell(r)]],
            onRowTap: widget.onTap == null ? null : [for (final r in shown) () => widget.onTap!(r)],
            highlight: widget.highlight?.call(shown),
            empty: Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(widget.filtersOn ? 'Nothing matches these filters.' : widget.empty, style: const TextStyle(color: W.g400)))),
          ),
        if (_per == 0 || rows.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text('Showing ${rows.length} entries${rows.length != widget.total ? ' (filtered from ${widget.total} total entries)' : ''}', style: const TextStyle(fontSize: 13, color: W.g700)),
          )
        else
          WebPager(
            total: rows.length,
            page: _page,
            perPage: _per,
            onPage: (v) => setState(() => _page = v),
            onPerPage: (v) => setState(() { _per = v; _page = 0; }),
            extra: rows.length != widget.total ? ' (filtered from ${widget.total} total entries)' : null,
          ),
      ]),
    );
  }
}

/// Filter dropdowns in one card, as on the website (nothing when all are hidden).
List<Widget> webFilterCard(List<Widget> filters) => filters.isEmpty
    ? const []
    : [WebCard(padding: const EdgeInsets.all(14), child: WebGrid(columns: filters.length, gap: 12, minWidth: 170, children: filters)), const SizedBox(height: 12)];

/// Number cards row (nothing when all are hidden).
List<Widget> webCardsRow(List<Widget> cards, {int columns = 4}) => cards.isEmpty ? const [] : [WebGrid(columns: columns, minWidth: 190, children: cards), const SizedBox(height: 12)];

/// Sort key helpers.
Comparable<Object?> lower(Object? v) => '${v ?? ''}'.toLowerCase();
Comparable<Object?> num0(Object? v) => toDouble(v);
