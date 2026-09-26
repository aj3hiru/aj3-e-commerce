import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'tokens.dart';

/// A column of [DTable]. `sort` makes the header clickable (asc / desc).
class DColumn<R> {
  final String label;
  final double flex;
  final double? width;
  final bool numeric; // right-aligned, tabular figures (money, counts)
  final Comparable Function(R row)? sort;
  final Widget Function(R row) cell;
  const DColumn(this.label, {required this.cell, this.flex = 1, this.width, this.numeric = false, this.sort});
}

/// Business-software table: compact fixed rows, hover, selected row, sortable
/// headers, right-aligned numbers, double-click / Enter opens, right-click shows
/// the row's actions, ↑ / ↓ moves the selection when the table has focus.
class DTable<R> extends StatefulWidget {
  final List<DColumn<R>> columns;
  final List<R> rows;
  final void Function(R row)? onOpen;
  final void Function(R row, Offset globalPosition)? onContextMenu;
  final Widget? empty;
  final double rowHeight;
  final bool striped;
  final Object Function(R row)? rowKey; // keeps the selection across rebuilds
  const DTable({super.key, required this.columns, required this.rows, this.onOpen, this.onContextMenu, this.empty, this.rowHeight = DS.rowH, this.striped = false, this.rowKey});
  @override
  State<DTable<R>> createState() => _DTableState<R>();
}

class _DTableState<R> extends State<DTable<R>> {
  int? _sortCol;
  bool _asc = true;
  Object? _selected;
  int _hover = -1;
  final _focus = FocusNode(debugLabel: 'table');

  Object _key(R r) => widget.rowKey?.call(r) ?? r as Object;

  List<R> get _rows {
    final c = _sortCol == null ? null : widget.columns[_sortCol!].sort;
    if (c == null) return widget.rows;
    final list = [...widget.rows]..sort((a, b) => c(a).compareTo(c(b)));
    return _asc ? list : list.reversed.toList();
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  KeyEventResult _onKey(FocusNode n, KeyEvent e, List<R> rows) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent || rows.isEmpty) return KeyEventResult.ignored;
    final i = rows.indexWhere((r) => _key(r) == _selected);
    if (e.logicalKey == LogicalKeyboardKey.arrowDown) {
      setState(() => _selected = _key(rows[(i + 1).clamp(0, rows.length - 1)]));
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.arrowUp) {
      setState(() => _selected = _key(rows[(i - 1).clamp(0, rows.length - 1)]));
      return KeyEventResult.handled;
    }
    if ((e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.numpadEnter) && i >= 0 && widget.onOpen != null) {
      widget.onOpen!(rows[i]);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Widget _cell(DColumn<R> c, Widget child, {bool head = false}) {
    final box = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      alignment: c.numeric ? Alignment.centerRight : Alignment.centerLeft,
      child: head ? child : DefaultTextStyle.merge(style: c.numeric ? DS.num : DS.body, child: child),
    );
    return c.width != null ? SizedBox(width: c.width, child: box) : Expanded(flex: (c.flex * 100).round(), child: box);
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    final head = Container(
      height: DS.headerRowH,
      decoration: const BoxDecoration(color: Color(0xFFF7F7F8), border: Border(bottom: BorderSide(color: DS.line))),
      child: Row(children: [
        for (var i = 0; i < widget.columns.length; i++)
          _cell(
            widget.columns[i],
            head: true,
            InkWell(
              onTap: widget.columns[i].sort == null
                  ? null
                  : () => setState(() {
                        if (_sortCol == i) {
                          _asc = !_asc;
                        } else {
                          _sortCol = i;
                          _asc = true;
                        }
                      }),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Flexible(child: Text(widget.columns[i].label, maxLines: 1, overflow: TextOverflow.ellipsis, style: DS.tableHead)),
                if (widget.columns[i].sort != null) ...[
                  const SizedBox(width: 3),
                  Icon(_sortCol == i ? (_asc ? LucideIcons.arrowUp : LucideIcons.arrowDown) : LucideIcons.chevronsUpDown, size: 12, color: _sortCol == i ? DS.primary : DS.faint),
                ],
              ]),
            ),
          ),
      ]),
    );

    final body = <Widget>[
      for (var r = 0; r < rows.length; r++)
        Builder(builder: (context) {
          final row = rows[r];
          final sel = _key(row) == _selected;
          final bg = sel ? DS.selected : r == _hover ? DS.hover : widget.striped && r.isOdd ? const Color(0xFFFAFAFB) : DS.surface;
          return MouseRegion(
            onEnter: (_) => setState(() => _hover = r),
            onExit: (_) => setState(() => _hover = -1),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                _focus.requestFocus();
                setState(() => _selected = _key(row));
              },
              onDoubleTap: widget.onOpen == null ? null : () => widget.onOpen!(row),
              onSecondaryTapDown: widget.onContextMenu == null
                  ? null
                  : (d) {
                      setState(() => _selected = _key(row));
                      widget.onContextMenu!(row, d.globalPosition);
                    },
              child: Container(
                constraints: BoxConstraints(minHeight: widget.rowHeight),
                decoration: BoxDecoration(
                  color: bg,
                  border: Border(bottom: const BorderSide(color: DS.lineSoft), left: BorderSide(color: sel ? DS.primary : Colors.transparent, width: 2)),
                ),
                child: IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final c in widget.columns) _cell(c, c.cell(row))])),
              ),
            ),
          );
        }),
    ];

    return Focus(
      focusNode: _focus,
      onKeyEvent: (n, e) => _onKey(n, e, rows),
      child: Container(
        decoration: BoxDecoration(color: DS.surface, border: Border.all(color: DS.line), borderRadius: DS.r),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          head,
          ...body,
          if (rows.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 28), child: widget.empty ?? const Center(child: Text('No records', style: DS.small))),
        ]),
      ),
    );
  }
}
