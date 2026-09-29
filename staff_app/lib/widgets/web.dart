import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import 'common.dart';
import '../ds/ds.dart';

/// Windows / wide-screen pieces copied from the website admin (tailwind.config.ts,
/// AdminShell / AdminHeader / StatCard and the list pages), so the desktop app
/// looks exactly like admin.sriandaltraders.co.in on a computer.
class W {
  // admin theme
  static const primary = Color(0xFF7C3AED);
  static const primaryDark = Color(0xFF6D28D9);
  static const primaryLight = Color(0xFFEDE9FE);
  static const primaryLighter = Color(0xFFF5F3FF);
  // gray scale
  static const g50 = Color(0xFFF9FAFB);
  static const g100 = Color(0xFFF3F4F6);
  static const g200 = Color(0xFFE5E7EB);
  static const g300 = Color(0xFFD1D5DB);
  static const g400 = Color(0xFF9CA3AF);
  static const g500 = Color(0xFF6B7280);
  static const g600 = Color(0xFF4B5563);
  static const g700 = Color(0xFF374151);
  static const g800 = Color(0xFF1F2937);
  static const g900 = Color(0xFF111827);
  // status pills / stat cards (ecom-head.php)
  static const green = Color(0xFF1CC88A);
  static const grey = Color(0xFF858796);
  static const yellow = Color(0xFFF6C23E);
  static const indigo = Color(0xFF4361EE);
  static const cyan = Color(0xFF36B9CC);
  static const red = Color(0xFFE74A5B);
  // buttons / links on the list pages
  static const blue = Color(0xFF2563EB);
  static const blueSoft = Color(0xFFEFF6FF);
  static const orange = Color(0xFFF97316);
  static const coral = Color(0xFFEE6A4D);
  static const coralSoft = Color(0xFFFFF4F0);
  static const danger = Color(0xFFDC3545);
  static const tableBorder = Color(0xFFDEE2E6);
  static const stripe = Color(0xFFF2F2F2);

  static const cardBorder = Color(0x14000000); // rgba(0,0,0,.08)
  static const cardShadow = [BoxShadow(color: Color(0x0F3A3B45), blurRadius: 28, offset: Offset(0, 2.4))];
  static const radius = 10.0;
}

/// Order status → pill colour (same as the website's StatusDropdown).
Color statusColor(String s) => switch (s) {
      'Pending' => W.yellow,
      'In Progress' => W.cyan,
      'Out for Delivery' => const Color(0xFF3B82F6),
      'Delivered' || 'Paid' || 'Active' || 'Published' || 'active' => W.green,
      'Canceled' || 'Failed' => W.red,
      'Partly' || 'Partial' || 'Partially Paid' => W.yellow,
      _ => W.grey,
    };

/// Solid status pill ("Paid ▾", "Delivered ▾"), compact; with [onTap] it opens a menu.
class WebPill extends StatelessWidget {
  final String text;
  final Color? color;
  final bool caret;
  final VoidCallback? onTap;
  final Color textColor;
  const WebPill(this.text, {super.key, this.color, this.caret = false, this.onTap, this.textColor = Colors.white});
  @override
  Widget build(BuildContext context) {
    final bg = color ?? statusColor(text);
    final pill = Container(
      height: 22,
      padding: EdgeInsets.only(left: 7, right: caret ? 3 : 7),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(3)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Flexible(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: textColor, fontSize: 12, fontWeight: FontWeight.w600, height: 1))),
        if (caret) Icon(Icons.arrow_drop_down_rounded, size: 16, color: textColor),
      ]),
    );
    return onTap == null ? pill : MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(onTap: onTap, child: pill));
  }
}

/// A status pill that opens a compact menu of the allowed next states.
class WebPillMenu extends StatelessWidget {
  final String value;
  final List<String> options;
  final ValueChanged<String>? onSelected;
  final Color? color;
  const WebPillMenu({super.key, required this.value, required this.options, this.onSelected, this.color});
  @override
  Widget build(BuildContext context) {
    final choices = options.where((o) => o != value).toList();
    if (onSelected == null || choices.isEmpty) return WebPill(value, color: color);
    return Builder(
      builder: (c) => WebPill(value, color: color, caret: true, onTap: () async {
        final box = c.findRenderObject() as RenderBox;
        final at = box.localToGlobal(Offset(0, box.size.height + 2));
        final v = await showDMenu<String>(c, at, [for (final o in choices) DMenuItem(o, o, icon: Icons.circle, danger: o == 'Canceled')]);
        if (v != null) onSelected!(v);
      }),
    );
  }
}

/// Soft badge ("Admin", "Online", "Walk-in").
class WebBadge extends StatelessWidget {
  final String text;
  final Color color;
  final Color bg;
  const WebBadge(this.text, {super.key, required this.color, required this.bg});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(3)),
        child: Text(text, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w600)),
      );
}

/// Panel (design system [DCard] look): flat white, thin border, 6 px corners.
class WebCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? borderColor;
  final VoidCallback? onTap;
  final Color color;
  const WebCard({super.key, required this.child, this.padding = const EdgeInsets.all(DS.s4), this.borderColor, this.onTap, this.color = Colors.white});
  @override
  Widget build(BuildContext context) {
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(color: color, borderRadius: DS.rCard, border: Border.all(color: borderColor ?? DS.line, width: borderColor != null ? 1.5 : 1), boxShadow: DS.cardShadow),
      child: child,
    );
    if (onTap == null) return box;
    return _Hoverable(onTap: onTap!, child: box);
  }
}

/// Click target with a pointer cursor and a faint hover tint.
class _Hoverable extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;
  const _Hoverable({required this.child, required this.onTap});
  @override
  State<_Hoverable> createState() => _HoverableState();
}

class _HoverableState extends State<_Hoverable> {
  bool _h = false;
  @override
  Widget build(BuildContext context) => MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _h = true),
        onExit: (_) => setState(() => _h = false),
        child: GestureDetector(
          onTap: widget.onTap,
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: DS.fast,
            foregroundDecoration: BoxDecoration(color: _h ? const Color(0x08000000) : Colors.transparent, borderRadius: DS.rCard),
            child: widget.child,
          ),
        ),
      );
}

/// Card title row: icon + title (+ "View all" on the right), compact.
class WebCardTitle extends StatelessWidget {
  final IconData? icon;
  final String title;
  final Color? iconColor;
  final Widget? trailing;
  final VoidCallback? onViewAll;
  const WebCardTitle(this.title, {super.key, this.icon, this.iconColor, this.trailing, this.onViewAll});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: DS.s3),
        child: Row(children: [
          if (icon != null) ...[Icon(icon, size: 15, color: iconColor ?? DS.text2), const SizedBox(width: 8)],
          Expanded(child: Text(title, style: DS.cardTitle)),
          ?trailing,
          if (onViewAll != null) DButton('View all', icon: LucideIcons.chevronRight, variant: DVariant.ghost, size: DSize.sm, onPressed: onViewAll),
        ]),
      );
}

/// Toolbar / header button — the design system's [DButton] (outline, or filled with [color]).
class WebButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color? color; // null = outline button
  final double height; // kept for callers; desktop buttons are one height
  final bool loading;
  final String? tooltip;
  const WebButton(this.label, {super.key, this.icon, this.onPressed, this.color, this.height = DS.controlH, this.loading = false, this.tooltip});
  @override
  Widget build(BuildContext context) => DButton(label, icon: icon, onPressed: onPressed, variant: color == null ? DVariant.secondary : DVariant.primary, color: color, size: height < 32 ? DSize.sm : DSize.md, loading: loading, tooltip: tooltip);
}

/// Row action button (view / edit / delete…): compact square with tooltip.
class WebIconAction extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback? onTap;
  final bool soft;
  const WebIconAction(this.icon, {super.key, required this.color, required this.tooltip, this.onTap, this.soft = false});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 4),
        child: DButton.icon(icon, tooltip: tooltip, onPressed: onTap, size: DSize.sm, variant: DVariant.ghost, color: color),
      );
}

/// Dashboard stat card (StatCard.tsx): solid icon square, corner circle, value, trend.
class WebStatCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final String value;
  final double? trend; // % vs previous period; null = "New"
  final bool showTrend;
  final VoidCallback? onTap;
  const WebStatCard({super.key, required this.icon, required this.color, required this.label, required this.value, this.trend, this.showTrend = true, this.onTap});
  @override
  Widget build(BuildContext context) {
    final up = (trend ?? 0) >= 0;
    return WebCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(W.radius),
        child: Stack(children: [
          Positioned(top: -26, right: -26, child: Container(width: 80, height: 80, decoration: BoxDecoration(color: color.withValues(alpha: .08), shape: BoxShape.circle))),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)), child: Icon(icon, color: Colors.white, size: 17)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: DS.muted)),
                  const SizedBox(height: 2),
                  Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: W.g900, height: 1.2, fontFeatures: [FontFeature.tabularFigures()])),
                  if (showTrend) ...[
                    const SizedBox(height: 6),
                    Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: up ? const Color(0xFFE8F9F2) : const Color(0xFFFDECEE), borderRadius: BorderRadius.circular(4)),
                        child: Text(
                          trend == null ? '↑ New' : trend == 0 ? '0%' : '${up ? '↑' : '↓'} ${_pct(trend!.abs())}',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: up ? const Color(0xFF0F9F6E) : const Color(0xFFC81E32)),
                        ),
                      ),
                      const Text('vs. previous period', style: TextStyle(fontSize: 11.5, color: W.g500)),
                    ]),
                  ],
                ]),
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  static String _pct(double v) => '${v >= 100 || v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1)}%';
}

/// Metric card of the list pages (Products / Categories / Staff / Dues):
/// tinted circle with an outline icon, big number, label.
class WebMetric extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String value;
  final String label;
  final String? sub;
  final bool selected;
  final VoidCallback? onTap;
  const WebMetric({super.key, required this.icon, required this.color, required this.value, required this.label, this.sub, this.selected = false, this.onTap});
  @override
  Widget build(BuildContext context) => WebCard(
        onTap: onTap,
        borderColor: selected ? color.withValues(alpha: .55) : null,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Container(width: 36, height: 36, decoration: BoxDecoration(color: color.withValues(alpha: .1), borderRadius: BorderRadius.circular(6)), child: Icon(icon, color: color, size: 17)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: W.g900, height: 1.2, fontFeatures: [FontFeature.tabularFigures()])),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g700)),
              if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500)),
            ]),
          ),
        ]),
      );
}

/// Small metric of the Orders / Deliveries pages: "3 All Orders" with a sub line.
class WebMiniMetric extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String value;
  final String label;
  final String? sub;
  final bool tinted;
  final VoidCallback? onTap;
  const WebMiniMetric({super.key, required this.icon, required this.color, required this.value, required this.label, this.sub, this.tinted = true, this.onTap});
  @override
  Widget build(BuildContext context) => WebCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        child: Row(children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: tinted ? color.withValues(alpha: .1) : W.g100, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, color: tinted ? color : W.g700, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(
                TextSpan(children: [
                  TextSpan(text: value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900, fontFeatures: [FontFeature.tabularFigures()])),
                  TextSpan(text: '  $label', style: const TextStyle(fontSize: 12.5, color: W.g700)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: W.g500)),
            ]),
          ),
        ]),
      );
}

/// Grid of equal cards that wraps to fewer columns on narrower windows.
class WebGrid extends StatelessWidget {
  final List<Widget> children;
  final int columns;
  final double gap;
  final double minWidth;
  const WebGrid({super.key, required this.children, this.columns = 4, this.gap = 12, this.minWidth = 210});
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (c, box) {
        var n = columns;
        while (n > 1 && (box.maxWidth - gap * (n - 1)) / n < minWidth) {
          n--;
        }
        final rows = <Widget>[];
        for (var i = 0; i < children.length; i += n) {
          final row = children.sublist(i, (i + n).clamp(0, children.length));
          rows.add(IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (var j = 0; j < n; j++) ...[
                if (j > 0) SizedBox(width: gap),
                Expanded(child: j < row.length ? row[j] : const SizedBox()),
              ],
            ]),
          ));
          if (i + n < children.length) rows.add(SizedBox(height: gap));
        }
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
      });
}

/// Filter / form dropdown — the design system's keyboard-driven [DSelect].
class WebSelect<T> extends StatelessWidget {
  final IconData? icon;
  final String? label;
  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;
  final double? width;
  const WebSelect({super.key, this.icon, this.label, required this.value, required this.options, required this.onChanged, this.width});
  @override
  Widget build(BuildContext context) => DSelect<T>(icon: icon, label: label, value: value, options: options, onChanged: onChanged, width: width);
}

/// Search box ([DTextField] with a search icon).
class WebSearch extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  final double? width;
  final TextEditingController? controller;
  final bool autofocus;
  const WebSearch({super.key, required this.hint, required this.onChanged, this.width, this.controller, this.autofocus = false});
  @override
  Widget build(BuildContext context) => DTextField(controller: controller, autofocus: autofocus, hint: hint, prefixIcon: LucideIcons.search, onChanged: onChanged, width: width, textInputAction: TextInputAction.search);
}

/// The website's date range bar: presets + from / to + Apply.
class DateRange {
  final String key; // today, yesterday, 7d, this_month, prev_month, this_year, custom, all
  final DateTime from; // local midnight, inclusive
  final DateTime to; // local midnight, inclusive
  const DateRange(this.key, this.from, this.to);

  static DateRange preset(String key) {
    final now = ist(DateTime.now().toUtc());
    final today = DateTime(now.year, now.month, now.day);
    return switch (key) {
      'today' => DateRange(key, today, today),
      'yesterday' => DateRange(key, today.subtract(const Duration(days: 1)), today.subtract(const Duration(days: 1))),
      '7d' => DateRange(key, today.subtract(const Duration(days: 6)), today),
      'this_month' => DateRange(key, DateTime(today.year, today.month, 1), today),
      'prev_month' => DateRange(key, DateTime(today.year, today.month - 1, 1), DateTime(today.year, today.month, 0)),
      'this_year' => DateRange(key, DateTime(today.year, 1, 1), today),
      _ => DateRange('all', DateTime(2000), today),
    };
  }

  String get label => switch (key) {
        'today' => 'Today',
        'yesterday' => 'Yesterday',
        '7d' => '7 Days',
        'this_month' => 'This Month',
        'prev_month' => 'Previous Month',
        'this_year' => 'This Year',
        'all' => 'All time',
        _ => '${_d(from)} – ${_d(to)}',
      };

  static String _d(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  /// Is this UTC ISO time inside the range (India time)?
  bool contains(dynamic iso) {
    if (iso == null) return false;
    final t = ist(DateTime.parse('$iso').toUtc());
    final day = DateTime(t.year, t.month, t.day);
    return !day.isBefore(from) && !day.isAfter(to);
  }

  /// Same length, just before this one (for "vs. previous period").
  DateRange previous() {
    final days = to.difference(from).inDays + 1;
    return DateRange('prev', from.subtract(Duration(days: days)), from.subtract(const Duration(days: 1)));
  }
}

/// Date range toolbar: "Showing: …", preset toggles, from / to, Apply.
class WebRangeBar extends StatelessWidget {
  final DateRange range;
  final ValueChanged<DateRange> onChanged;
  final List<String> presets;
  final bool greyPresets;
  final Widget? below;
  final bool flat; // inside another card
  const WebRangeBar({super.key, required this.range, required this.onChanged, this.presets = const ['today', 'yesterday', '7d', 'this_month', 'prev_month'], this.greyPresets = false, this.below, this.flat = false});

  @override
  Widget build(BuildContext context) {
    Future<void> pick() async {
      final r = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime.now().add(const Duration(days: 1)),
        initialDateRange: DateTimeRange(start: range.from, end: range.to),
        initialEntryMode: DatePickerEntryMode.calendarOnly,
      );
      if (r != null) onChanged(DateRange('custom', DateTime(r.start.year, r.start.month, r.start.day), DateTime(r.end.year, r.end.month, r.end.day)));
    }

    Widget dateBox(DateTime d) => DButton(DateRange._d(d), icon: LucideIcons.calendar, onPressed: pick, tooltip: 'Choose dates');

    final inner = Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, runSpacing: 6, children: [
          Text.rich(TextSpan(children: [
            const TextSpan(text: 'Showing: ', style: TextStyle(color: DS.muted, fontSize: DS.fBody)),
            TextSpan(text: range.label, style: const TextStyle(color: DS.text, fontSize: DS.fBody, fontWeight: FontWeight.w600)),
          ])),
          const SizedBox(width: 8),
          DSegmented<String>(options: [for (final k in presets) (k, DateRange.preset(k).label)], value: presets.contains(range.key) ? range.key : '', onChanged: (k) => onChanged(DateRange.preset(k))),
          const SizedBox(width: 8),
          dateBox(range.from),
          const Text('to', style: DS.small),
          dateBox(range.to),
        ]),
        ?below,
      ]),
    );
    return flat ? inner : WebCard(padding: EdgeInsets.zero, child: inner);
  }
}

/// Status tabs with coloured dots and counts; underline on the active tab.
class WebTabs extends StatelessWidget {
  final List<(String, String, Color?)> tabs; // key, label, dot colour
  final String selected;
  final Map<String, int> counts;
  final ValueChanged<String> onSelect;
  const WebTabs({super.key, required this.tabs, required this.selected, required this.onSelect, this.counts = const {}});
  @override
  Widget build(BuildContext context) => Wrap(children: [
        for (final (k, label, dot) in tabs)
          InkWell(
            onTap: () => onSelect(k),
            hoverColor: DS.hover,
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 9, 10, 8),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: k == selected ? DS.primary : Colors.transparent, width: 2))),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (dot != null) ...[Container(width: 6, height: 6, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)), const SizedBox(width: 6)],
                Text(label, style: TextStyle(fontSize: DS.fBody, fontWeight: k == selected ? FontWeight.w600 : FontWeight.w500, color: k == selected ? DS.primary : DS.text2)),
                if (counts[k] != null) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(color: k == selected ? DS.primaryTint : DS.hover, borderRadius: BorderRadius.circular(3)),
                    child: Text('${counts[k]}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: k == selected ? DS.primary : DS.muted)),
                  ),
                ],
              ]),
            ),
          ),
      ]);
}

/// One column of a [WebTable].
class WebCol {
  final String label;
  final double flex;
  final double? width; // fixed width instead of flex
  final bool right;
  /// Click the heading to sort by this column; [sorted] = true ↑ / false ↓ / null not sorted by it.
  final VoidCallback? onSort;
  final bool? sorted;
  /// Instead of the label (e.g. a "select all" checkbox).
  final Widget? head;
  const WebCol(this.label, {this.flex = 1, this.width, this.right = false, this.onSort, this.sorted, this.head});
}

/// Business table: compact rows, hover, selected row, click to select,
/// double-click / Enter to open ([onRowTap]), right-click for [onRowMenu],
/// ↑ / ↓ to move the selection. `bordered` keeps the website's gridded look.
class WebTable extends StatefulWidget {
  final List<WebCol> cols;
  final List<List<Widget>> rows;
  final bool bordered;
  final List<VoidCallback?>? onRowTap;
  final void Function(int row, Offset at)? onRowMenu;
  final Widget? empty;
  final double rowHeight;
  final bool upper; // UPPERCASE heads (plain style)
  const WebTable({super.key, required this.cols, required this.rows, this.bordered = false, this.onRowTap, this.onRowMenu, this.empty, this.rowHeight = DS.rowH, this.upper = true});
  @override
  State<WebTable> createState() => _WebTableState();
}

class _WebTableState extends State<WebTable> {
  int _sel = -1, _hover = -1;
  final _focus = FocusNode(debugLabel: 'WebTable');

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  void _open(int r) {
    final f = widget.onRowTap == null || r < 0 || r >= widget.onRowTap!.length ? null : widget.onRowTap![r];
    f?.call();
  }

  KeyEventResult _key(FocusNode n, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent || widget.rows.isEmpty) return KeyEventResult.ignored;
    if (e.logicalKey == LogicalKeyboardKey.arrowDown || e.logicalKey == LogicalKeyboardKey.arrowUp) {
      setState(() => _sel = (_sel + (e.logicalKey == LogicalKeyboardKey.arrowDown ? 1 : -1)).clamp(0, widget.rows.length - 1));
      return KeyEventResult.handled;
    }
    if ((e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.numpadEnter) && _sel >= 0) {
      _open(_sel);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final cols = widget.cols;
    final line = widget.bordered ? DS.line : DS.lineSoft;
    Widget cell(int i, Widget child, {bool head = false}) {
      final c = cols[i];
      final box = Container(
        constraints: BoxConstraints(minHeight: head ? DS.headerRowH : widget.rowHeight),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        alignment: c.right ? Alignment.centerRight : Alignment.centerLeft,
        decoration: widget.bordered && i > 0 ? BoxDecoration(border: Border(left: BorderSide(color: line))) : null,
        child: head ? child : DefaultTextStyle.merge(style: c.right ? DS.num : DS.body, child: child),
      );
      return c.width != null ? SizedBox(width: c.width, child: box) : Expanded(flex: (c.flex * 100).round(), child: box);
    }

    final head = Container(
      decoration: const BoxDecoration(color: Color(0xFFF7F7F8), border: Border(bottom: BorderSide(color: DS.line))),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < cols.length; i++)
            cell(i, () {
              final c = cols[i];
              if (c.head != null) return c.head!;
              final text = Text(widget.upper && !widget.bordered ? c.label.toUpperCase() : c.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: widget.upper && !widget.bordered ? DS.tableHead.copyWith(fontSize: 11, letterSpacing: .5, color: DS.muted) : DS.tableHead);
              if (c.onSort == null) return text;
              return MouseRegion(
                cursor: SystemMouseCursors.click,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: c.onSort,
                  child: Row(children: [
                    Flexible(child: text),
                    const SizedBox(width: 4),
                    Icon(c.sorted == null ? LucideIcons.chevronsUpDown : c.sorted! ? LucideIcons.arrowUp : LucideIcons.arrowDown, size: 13, color: c.sorted == null ? const Color(0xFFD1D5DB) : const Color(0xFF4B5563)),
                  ]),
                ),
              );
            }(), head: true),
        ]),
      ),
    );

    final body = <Widget>[
      for (var r = 0; r < widget.rows.length; r++)
        MouseRegion(
          onEnter: (_) => setState(() => _hover = r),
          onExit: (_) => setState(() => _hover = -1),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              _focus.requestFocus();
              setState(() => _sel = r);
            },
            onDoubleTap: () => _open(r),
            onSecondaryTapDown: widget.onRowMenu == null
                ? null
                : (d) {
                    setState(() => _sel = r);
                    widget.onRowMenu!(r, d.globalPosition);
                  },
            child: Container(
              decoration: BoxDecoration(
                color: r == _sel ? DS.selected : r == _hover ? DS.hover : widget.bordered && r.isOdd ? const Color(0xFFFAFAFB) : Colors.white,
                border: Border(bottom: BorderSide(color: line), left: BorderSide(color: r == _sel ? DS.primary : Colors.transparent, width: 2)),
              ),
              child: IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (var i = 0; i < cols.length; i++) cell(i, widget.rows[r][i])])),
            ),
          ),
        ),
    ];

    return Focus(
      focusNode: _focus,
      onKeyEvent: _key,
      child: Container(
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: DS.line), borderRadius: DS.r),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          head,
          ...body,
          if (widget.rows.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 28), child: widget.empty ?? const Center(child: Text('No matching records found', style: DS.small))),
        ]),
      ),
    );
  }
}

/// Table footer: "Showing 1–10 of 42" · rows per page · Previous / Next (PgUp / PgDn).
class WebPager extends StatelessWidget {
  final int total;
  final int page; // 0-based
  final int perPage;
  final ValueChanged<int> onPage;
  final ValueChanged<int> onPerPage;
  final String? extra;
  const WebPager({super.key, required this.total, required this.page, required this.perPage, required this.onPage, required this.onPerPage, this.extra});

  static List<T> slice<T>(List<T> list, int page, int perPage) {
    final start = (page * perPage).clamp(0, list.length);
    return list.sublist(start, (start + perPage).clamp(0, list.length));
  }

  @override
  Widget build(BuildContext context) {
    final pages = (total / perPage).ceil().clamp(1, 1 << 30);
    final from = total == 0 ? 0 : page * perPage + 1;
    final to = ((page + 1) * perPage).clamp(0, total);
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.pageDown): () => page + 1 < pages ? onPage(page + 1) : null,
        const SingleActivator(LogicalKeyboardKey.pageUp): () => page > 0 ? onPage(page - 1) : null,
      },
      child: Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(children: [
          Expanded(child: Text('Showing $from–$to of $total${extra ?? ''}', style: DS.small.copyWith(color: DS.text2))),
          const Text('Rows', style: DS.small),
          const SizedBox(width: 6),
          SizedBox(width: 72, child: DSelect<int>(small: true, value: perPage, options: const [(10, '10'), (20, '20'), (50, '50'), (100, '100')], onChanged: onPerPage)),
          const SizedBox(width: 10),
          DButton.icon(LucideIcons.chevronLeft, tooltip: 'Previous (PgUp)', size: DSize.sm, variant: DVariant.secondary, onPressed: page > 0 ? () => onPage(page - 1) : null),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('${page + 1} / $pages', style: DS.small.copyWith(color: DS.text2))),
          DButton.icon(LucideIcons.chevronRight, tooltip: 'Next (PgDn)', size: DSize.sm, variant: DVariant.secondary, onPressed: page + 1 < pages ? () => onPage(page + 1) : null),
        ]),
      ),
    );
  }
}

/// Page frame: compact header (title, subtitle, actions, sync, user) over the content area.
class WebPage extends StatefulWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final List<Widget>? children; // scrolling column
  final Widget? body; // or a custom body
  final bool back;
  final double maxWidth;
  final Future<void> Function()? onRefresh;
  const WebPage({super.key, required this.title, this.subtitle, this.actions = const [], this.children, this.body, this.back = false, this.maxWidth = 1600, this.onRefresh});
  @override
  State<WebPage> createState() => _WebPageState();
}

class _WebPageState extends State<WebPage> {
  // Each page scrolls on its own (several pages stay alive in the background).
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final body = w.body, children = w.children, maxWidth = w.maxWidth, onRefresh = w.onRefresh, back = w.back;
    Widget content = body ??
        Scrollbar(
          controller: _scroll,
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.all(DS.s5),
            children: [
              Center(child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children ?? const []))),
            ],
          ),
        );
    return Scaffold(
      backgroundColor: DS.bg,
      body: CallbackShortcuts(
        bindings: {
          if (onRefresh != null) const SingleActivator(LogicalKeyboardKey.f5): () => onRefresh(),
          if (back) const SingleActivator(LogicalKeyboardKey.escape): () => Navigator.of(context).maybePop(),
          if (back) const SingleActivator(LogicalKeyboardKey.backspace, alt: true): () => Navigator.of(context).maybePop(),
        },
        child: Focus(
          autofocus: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            WebHeader(title: w.title, subtitle: w.subtitle, actions: w.actions, back: back, onRefresh: onRefresh),
            Expanded(child: content),
          ]),
        ),
      ),
    );
  }
}

/// Hook for the sidebar-less parts of the header (set by the shell): the user menu.
typedef UserMenuAction = void Function(BuildContext context, String action);
UserMenuAction? webUserMenu;

class WebHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final bool back;
  final Future<void> Function()? onRefresh;
  const WebHeader({super.key, required this.title, this.subtitle, this.actions = const [], this.back = false, this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = '${s.user?['username'] ?? s.user?['name'] ?? ''}';
    return Container(
      constraints: const BoxConstraints(minHeight: 60),
      padding: const EdgeInsets.fromLTRB(DS.s4, 6, DS.s4, 6),
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: DS.line))),
      child: Row(children: [
        if (back && Navigator.of(context).canPop())
          Padding(padding: const EdgeInsets.only(right: 8), child: DButton.icon(LucideIcons.arrowLeft, tooltip: 'Back (Esc)', onPressed: () => Navigator.of(context).maybePop())),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: DS.pageTitle),
            if (subtitle != null) ...[const SizedBox(height: 2), Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: DS.small)],
          ]),
        ),
        const SizedBox(width: 8),
        for (final a in actions) Padding(padding: const EdgeInsets.only(left: 8), child: a),
        if (onRefresh != null) Padding(padding: const EdgeInsets.only(left: 8), child: DButton.icon(LucideIcons.rotateCw, tooltip: 'Refresh (F5)', variant: DVariant.secondary, onPressed: () => onRefresh!())),
        const SizedBox(width: 8),
        // Sync status sits where the website has its dark-mode button.
        _SquareButton(
          icon: !s.online ? LucideIcons.cloudOff : (s.syncing ? LucideIcons.refreshCw : LucideIcons.cloud),
          bg: !s.online ? const Color(0xFFFEF2F2) : DS.primarySoft,
          fg: !s.online ? DS.danger : DS.primary,
          badge: s.pending + s.failed,
          tooltip: !s.online ? 'Offline — changes are saved and sent later' : s.pending > 0 ? '${s.pending} change(s) sending' : 'Synced ${s.lastSync == null ? '' : ago(s.lastSync)}',
          onTap: () => webUserMenu?.call(context, 'sync'),
        ),
        const SizedBox(width: 8),
        Builder(
          builder: (c) => _UserChip(
            name: name,
            role: '${s.user?['roleLabel'] ?? ''}',
            avatar: s.user?['avatar'] as String?,
            onTap: () async {
              final box = c.findRenderObject() as RenderBox;
              final at = box.localToGlobal(Offset(box.size.width - 190, box.size.height + 4));
              final v = await showDMenu<String>(c, at, const [
                DMenuItem('profile', 'Edit Profile', icon: LucideIcons.userPen),
                DMenuItem('sync', 'Sync', icon: LucideIcons.refreshCw),
                null,
                DMenuItem('logout', 'Logout', icon: LucideIcons.logOut, danger: true),
              ]);
              if (v != null && c.mounted) webUserMenu?.call(c, v);
            },
          ),
        ),
      ]),
    );
  }
}

class _UserChip extends StatefulWidget {
  final String name, role;
  final String? avatar;
  final VoidCallback onTap;
  const _UserChip({required this.name, required this.role, required this.avatar, required this.onTap});
  @override
  State<_UserChip> createState() => _UserChipState();
}

class _UserChipState extends State<_UserChip> {
  bool _h = false;
  @override
  Widget build(BuildContext context) => MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _h = true),
        onExit: (_) => setState(() => _h = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: DS.fast,
            padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
            decoration: BoxDecoration(color: _h ? DS.hover : DS.bg, borderRadius: BorderRadius.circular(999), border: Border.all(color: DS.line)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              widget.avatar != null
                  ? Avatar(widget.name, photo: widget.avatar, size: 28)
                  : Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: DS.primary),
                      child: Text(widget.name.isEmpty ? '?' : widget.name[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
                    ),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(widget.name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: DS.text, height: 1.2)),
                Text(widget.role, style: const TextStyle(fontSize: 11, color: DS.muted, height: 1.2)),
              ]),
              const SizedBox(width: 4),
              const Icon(LucideIcons.chevronDown, size: 13, color: DS.muted),
            ]),
          ),
        ),
      );
}

class _SquareButton extends StatelessWidget {
  final IconData icon;
  final Color bg, fg;
  final String tooltip;
  final VoidCallback onTap;
  final int badge;
  const _SquareButton({required this.icon, required this.bg, required this.fg, required this.tooltip, required this.onTap, this.badge = 0});
  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: Material(
          color: bg,
          borderRadius: DS.r,
          child: InkWell(
            borderRadius: DS.r,
            onTap: onTap,
            child: SizedBox(width: DS.controlH, height: DS.controlH, child: Badge(isLabelVisible: badge > 0, label: Text('$badge'), child: Icon(icon, size: 16, color: fg))),
          ),
        ),
      );
}

/// Muted "—" for empty cells.
const webDash = Text('—', style: TextStyle(color: W.g400));

/// Two-line cell: bold / normal first line, small grey second line.
class Cell2 extends StatelessWidget {
  final String a;
  final String? b;
  final Color? aColor;
  final Color? bColor;
  final bool bold;
  final VoidCallback? onTap;
  const Cell2(this.a, {super.key, this.b, this.aColor, this.bColor, this.bold = false, this.onTap});
  @override
  Widget build(BuildContext context) {
    final first = Text(a, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, fontWeight: bold ? FontWeight.w600 : FontWeight.w500, color: aColor ?? W.g900));
    return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
      onTap == null ? first : MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(onTap: onTap, child: first)),
      if (b != null && b!.isNotEmpty) Text(b!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: bColor ?? W.g500)),
    ]);
  }
}

/// Phone layout below 900px, the website layout above (the window can be resized).
class Responsive extends StatelessWidget {
  final Widget phone;
  final Widget desktop;
  const Responsive({super.key, required this.phone, required this.desktop});
  @override
  Widget build(BuildContext context) => isWide(context) ? desktop : phone;
}

/// A pushed page (customer, product, sync…) on Windows: website header with a back
/// button over the page's own content.
Widget webScaffold({required String title, String? subtitle, List<Widget> actions = const [], required Widget body, bool back = true, Widget? fab}) => Scaffold(
      backgroundColor: W.g50,
      floatingActionButton: fab,
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        WebHeader(title: title, subtitle: subtitle, actions: actions, back: back),
        Expanded(child: body),
      ]),
    );

/// The website header used as a Scaffold app bar (pages that keep their phone body).
class WebAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final bool back;
  const WebAppBar({super.key, required this.title, this.subtitle, this.actions = const [], this.back = true});
  @override
  Size get preferredSize => const Size.fromHeight(60);
  @override
  Widget build(BuildContext context) => WebHeader(title: title, subtitle: subtitle, actions: actions, back: back);
}
