import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import 'common.dart';

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

/// Solid status pill ("Paid ▾", "Delivered ▾"). With [onTap] it opens a menu.
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(3)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Flexible(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: textColor, fontSize: 14, fontWeight: FontWeight.w600, height: 1.1))),
        if (caret) Padding(padding: const EdgeInsets.only(left: 5), child: Icon(Icons.arrow_drop_down_rounded, size: 18, color: textColor)),
      ]),
    );
    return onTap == null ? pill : MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(onTap: onTap, child: pill));
  }
}

/// A status pill that opens a small menu of choices.
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
    return PopupMenuButton<String>(
      tooltip: '',
      position: PopupMenuPosition.under,
      onSelected: onSelected,
      itemBuilder: (_) => [
        for (final o in choices)
          PopupMenuItem(value: o, height: 38, child: Row(children: [Container(width: 8, height: 8, decoration: BoxDecoration(color: statusColor(o), shape: BoxShape.circle)), const SizedBox(width: 10), Text(o)])),
      ],
      child: IgnorePointer(child: WebPill(value, color: color, caret: true, onTap: () {})),
    );
  }
}

/// Soft rounded badge ("Admin", "Online", "Walk-in", "In-store").
class WebBadge extends StatelessWidget {
  final String text;
  final Color color;
  final Color bg;
  const WebBadge(this.text, {super.key, required this.color, required this.bg});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Text(text, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600)),
      );
}

/// White card — `.gd-card`: 1px rgba(0,0,0,.08) border, 10px radius, soft shadow.
class WebCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? borderColor;
  final VoidCallback? onTap;
  final Color color;
  const WebCard({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.borderColor, this.onTap, this.color = Colors.white});
  @override
  Widget build(BuildContext context) {
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(W.radius),
        border: Border.all(color: borderColor ?? W.cardBorder, width: borderColor != null ? 1.5 : 1),
        boxShadow: W.cardShadow,
      ),
      child: child,
    );
    if (onTap == null) return box;
    return MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(onTap: onTap, behavior: HitTestBehavior.opaque, child: box));
  }
}

/// Card title row: icon + bold title (+ "View All ›" on the right).
class WebCardTitle extends StatelessWidget {
  final IconData? icon;
  final String title;
  final Color? iconColor;
  final Widget? trailing;
  final VoidCallback? onViewAll;
  const WebCardTitle(this.title, {super.key, this.icon, this.iconColor, this.trailing, this.onViewAll});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(children: [
          if (icon != null) ...[Icon(icon, size: 19, color: iconColor ?? W.g700), const SizedBox(width: 10)],
          Expanded(child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: W.g900))),
          ?trailing,
          if (onViewAll != null)
            TextButton(
              onPressed: onViewAll,
              style: TextButton.styleFrom(foregroundColor: W.primary, textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [Text('View All'), SizedBox(width: 4), Icon(LucideIcons.chevronRight, size: 16)]),
            ),
        ]),
      );
}

/// Header / toolbar button: outline (white), or filled with [color].
class WebButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color? color; // null = white outline button
  final double height;
  const WebButton(this.label, {super.key, this.icon, this.onPressed, this.color, this.height = 40});
  @override
  Widget build(BuildContext context) {
    final filled = color != null;
    final fg = filled ? Colors.white : W.g700;
    return SizedBox(
      height: height,
      child: TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          backgroundColor: filled ? color : Colors.white,
          disabledBackgroundColor: filled ? color!.withValues(alpha: .45) : Colors.white,
          foregroundColor: fg,
          disabledForegroundColor: filled ? Colors.white : W.g400,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: filled ? BorderSide.none : const BorderSide(color: W.g200)),
          textStyle: TextStyle(fontFamily: 'Inter', fontSize: 14.5, fontWeight: filled ? FontWeight.w600 : FontWeight.w500),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 17), const SizedBox(width: 8)],
          Text(label),
        ]),
      ),
    );
  }
}

/// Square icon button used in table "Actions" (grey eye, blue edit, red delete…).
class WebIconAction extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback? onTap;
  final bool soft;
  const WebIconAction(this.icon, {super.key, required this.color, required this.tooltip, this.onTap, this.soft = false});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 6),
        child: Tooltip(
          message: tooltip,
          child: Material(
            color: soft ? color.withValues(alpha: .1) : color,
            borderRadius: BorderRadius.circular(6),
            child: InkWell(
              borderRadius: BorderRadius.circular(6),
              onTap: onTap,
              child: SizedBox(width: 34, height: 34, child: Icon(icon, size: 16, color: soft ? color : Colors.white)),
            ),
          ),
        ),
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
          Positioned(top: -30, right: -30, child: Container(width: 100, height: 100, decoration: BoxDecoration(color: color.withValues(alpha: .08), shape: BoxShape.circle))),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 52, height: 52, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)), child: Icon(icon, color: Colors.white, size: 21)),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: W.g800)),
                  const SizedBox(height: 4),
                  Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: W.g900, height: 1.15)),
                  if (showTrend) ...[
                    const SizedBox(height: 8),
                    Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: up ? const Color(0xFFE8F9F2) : const Color(0xFFFDECEE), borderRadius: BorderRadius.circular(4)),
                        child: Text(
                          trend == null ? '↑ New' : trend == 0 ? '0%' : '${up ? '↑' : '↓'} ${_pct(trend!.abs())}',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: up ? const Color(0xFF0F9F6E) : const Color(0xFFC81E32)),
                        ),
                      ),
                      const Text('vs. previous period', style: TextStyle(fontSize: 13, color: W.g500)),
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
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        child: Row(children: [
          Container(width: 48, height: 48, decoration: BoxDecoration(color: color.withValues(alpha: .1), shape: BoxShape.circle), child: Icon(icon, color: color, size: 22)),
          const SizedBox(width: 16),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700, color: W.g900, height: 1.15)),
              const SizedBox(height: 2),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, color: W.g700)),
              if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g500)),
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: tinted ? color.withValues(alpha: .1) : W.g100, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, color: tinted ? color : W.g700, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(
                TextSpan(children: [
                  TextSpan(text: value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: W.g900)),
                  TextSpan(text: '  $label', style: const TextStyle(fontSize: 14, color: W.g700)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g500)),
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
  const WebGrid({super.key, required this.children, this.columns = 4, this.gap = 16, this.minWidth = 230});
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

/// Dropdown box with an icon and (optionally) a small label above the value.
class WebSelect<T> extends StatelessWidget {
  final IconData? icon;
  final String? label;
  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;
  final double? width;
  const WebSelect({super.key, this.icon, this.label, required this.value, required this.options, required this.onChanged, this.width});
  @override
  Widget build(BuildContext context) {
    final text = options.where((o) => o.$1 == value).map((o) => o.$2).firstOrNull ?? '';
    final box = Container(
      height: label == null ? 40 : 50,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)),
      child: Row(children: [
        if (icon != null) ...[Icon(icon, size: 16, color: W.g500), const SizedBox(width: 10)],
        Expanded(
          child: label == null
              ? Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: W.g900))
              : Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label!, maxLines: 1, style: const TextStyle(fontSize: 12, color: W.g500)),
                  Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: W.g900)),
                ]),
        ),
        const Icon(LucideIcons.chevronDown, size: 16, color: W.g500),
      ]),
    );
    return SizedBox(
      width: width,
      child: PopupMenuButton<T>(
        tooltip: '',
        position: PopupMenuPosition.under,
        onSelected: onChanged,
        itemBuilder: (_) => [
          for (final (v, l) in options)
            PopupMenuItem(value: v, height: 38, child: Text(l, style: TextStyle(fontWeight: v == value ? FontWeight.w700 : FontWeight.w400, color: v == value ? W.blue : W.g800))),
        ],
        child: box,
      ),
    );
  }
}

/// Search input as on the list pages.
class WebSearch extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  final double? width;
  final TextEditingController? controller;
  final bool autofocus;
  const WebSearch({super.key, required this.hint, required this.onChanged, this.width, this.controller, this.autofocus = false});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        height: 40,
        child: TextField(
          controller: controller,
          autofocus: autofocus,
          onChanged: onChanged,
          style: const TextStyle(fontSize: 14.5),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: W.g400, fontSize: 14.5),
            prefixIcon: const Icon(LucideIcons.search, size: 17, color: W.g400),
            prefixIconConstraints: const BoxConstraints(minWidth: 40),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: W.g200)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: W.g200)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFF86B7FE), width: 1.5)),
          ),
        ),
      );
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

class WebRangeBar extends StatelessWidget {
  final DateRange range;
  final ValueChanged<DateRange> onChanged;
  final List<String> presets;
  final bool greyPresets; // Orders page draws them grey, Due / Customers white
  final Widget? below;
  final bool flat; // inside another card
  const WebRangeBar({super.key, required this.range, required this.onChanged, this.presets = const ['today', 'yesterday', '7d', 'this_month', 'prev_month'], this.greyPresets = false, this.below, this.flat = false});

  @override
  Widget build(BuildContext context) {
    Widget chip(String k) {
      final on = range.key == k;
      return Padding(
        padding: const EdgeInsets.only(right: 6),
        child: SizedBox(
          height: 38,
          child: TextButton(
            onPressed: () => onChanged(DateRange.preset(k)),
            style: TextButton.styleFrom(
              backgroundColor: on ? W.blue : (greyPresets ? W.g100 : Colors.white),
              foregroundColor: on ? Colors.white : W.g700,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              minimumSize: const Size(0, 38),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6), side: on || greyPresets ? BorderSide.none : const BorderSide(color: W.g200)),
              textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w500),
            ),
            child: Text(DateRange.preset(k).label),
          ),
        ),
      );
    }

    Future<void> pick() async {
      final r = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime.now().add(const Duration(days: 1)),
        initialDateRange: DateTimeRange(start: range.from, end: range.to),
      );
      if (r != null) onChanged(DateRange('custom', DateTime(r.start.year, r.start.month, r.start.day), DateTime(r.end.year, r.end.month, r.end.day)));
    }

    Widget dateBox(DateTime d) => InkWell(
          onTap: pick,
          borderRadius: BorderRadius.circular(6),
          child: Container(
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(border: Border.all(color: W.g300), borderRadius: BorderRadius.circular(6), color: Colors.white),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(DateRange._d(d), style: const TextStyle(fontSize: 14, color: W.g900)),
              const SizedBox(width: 8),
              const Icon(LucideIcons.calendar, size: 15, color: W.g700),
            ]),
          ),
        );

    final inner = Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 10, children: [
          const Icon(LucideIcons.calendar, size: 16, color: W.g500),
          const SizedBox(width: 8),
          Text.rich(TextSpan(children: [
            const TextSpan(text: 'Showing:  ', style: TextStyle(color: W.g700, fontSize: 14)),
            TextSpan(text: range.label, style: const TextStyle(color: W.g900, fontSize: 14, fontWeight: FontWeight.w700)),
          ])),
          const SizedBox(width: 14),
          for (final k in presets) chip(k),
          const SizedBox(width: 12),
          dateBox(range.from),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('to', style: TextStyle(color: W.g500))),
          dateBox(range.to),
          const SizedBox(width: 8),
          WebButton('Apply', color: W.blue, height: 38, onPressed: range.key == 'custom' ? null : pick),
        ]),
        ?below,
      ]),
    );
    return flat ? inner : WebCard(padding: EdgeInsets.zero, child: inner);
  }
}

/// Status tabs with coloured dots and counts, blue underline on the active one.
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
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 11),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: k == selected ? W.blue : Colors.transparent, width: 2))),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (dot != null) ...[Container(width: 7, height: 7, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)), const SizedBox(width: 8)],
                Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: k == selected ? W.blue : W.g800)),
                if (counts[k] != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: k == selected ? W.blueSoft : W.g100, borderRadius: BorderRadius.circular(4)),
                    child: Text('${counts[k]}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: k == selected ? W.blue : W.g600)),
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
  const WebCol(this.label, {this.flex = 1, this.width, this.right = false});
}

/// Table in the website's two styles: `bordered` (Products, Categories, Customers,
/// Due, Staff — striped rows, cell borders) or plain (Orders, dashboard — uppercase heads).
class WebTable extends StatelessWidget {
  final List<WebCol> cols;
  final List<List<Widget>> rows;
  final bool bordered;
  final List<VoidCallback?>? onRowTap;
  final Widget? empty;
  final double rowHeight;
  final bool upper; // UPPERCASE heads (plain style)
  const WebTable({super.key, required this.cols, required this.rows, this.bordered = false, this.onRowTap, this.empty, this.rowHeight = 64, this.upper = true});

  @override
  Widget build(BuildContext context) {
    final line = bordered ? W.tableBorder : W.g100;
    Widget cell(int i, Widget child, {bool head = false}) {
      final c = cols[i];
      final box = Container(
        constraints: BoxConstraints(minHeight: head ? 48 : rowHeight),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        alignment: c.right ? Alignment.centerRight : Alignment.centerLeft,
        decoration: bordered && i > 0 ? BoxDecoration(border: Border(left: BorderSide(color: line))) : null,
        child: child,
      );
      return c.width != null ? SizedBox(width: c.width, child: box) : Expanded(flex: (c.flex * 100).round(), child: box);
    }

    final head = Container(
      decoration: BoxDecoration(color: bordered ? const Color(0xFFF8F9FA) : W.g50, border: Border(bottom: BorderSide(color: bordered ? line : W.g200))),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < cols.length; i++)
            cell(
              i,
              Text(
                bordered || !upper ? cols[i].label : cols[i].label.toUpperCase(),
                style: bordered || !upper
                    ? TextStyle(fontSize: bordered ? 15 : 13.5, fontWeight: bordered ? FontWeight.w600 : FontWeight.w500, color: bordered ? W.g900 : W.g700)
                    : const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: W.g500, letterSpacing: .6),
              ),
              head: true,
            ),
        ]),
      ),
    );

    final body = <Widget>[
      for (var r = 0; r < rows.length; r++)
        Material(
          color: bordered && r.isEven ? W.stripe : Colors.white,
          child: InkWell(
            onTap: onRowTap == null ? null : onRowTap![r],
            hoverColor: W.g50,
            child: Container(
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: line))),
              child: IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (var i = 0; i < cols.length; i++) cell(i, rows[r][i])])),
            ),
          ),
        ),
    ];

    return Container(
      decoration: BoxDecoration(border: Border.all(color: bordered ? line : W.g200), borderRadius: BorderRadius.circular(bordered ? 0 : 8)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        head,
        ...body,
        if (rows.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 40), child: empty ?? const Center(child: Text('No matching records found', style: TextStyle(color: W.g500)))),
      ]),
    );
  }
}

/// "Show [10] entries" … "Showing 1 to 10 of 42 entries" with Previous / Next.
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
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Row(children: [
        Text('Showing $from to $to of $total entries${extra ?? ''}', style: const TextStyle(fontSize: 14.5, color: W.g700)),
        const Spacer(),
        WebSelect<int>(width: 120, value: perPage, options: const [(10, '10 / page'), (20, '20 / page'), (50, '50 / page'), (100, '100 / page')], onChanged: onPerPage),
        const SizedBox(width: 10),
        WebButton('Previous', height: 38, onPressed: page > 0 ? () => onPage(page - 1) : null),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Text('${page + 1} / $pages', style: const TextStyle(color: W.g600))),
        WebButton('Next', height: 38, onPressed: page + 1 < pages ? () => onPage(page + 1) : null),
      ]),
    );
  }
}

/// Page frame of the website: white header (title, subtitle, actions, sync, user)
/// over a light grey scrolling body with 24px padding.
class WebPage extends StatelessWidget {
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
  Widget build(BuildContext context) {
    Widget content = body ??
        ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Center(child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children ?? const []))),
          ],
        );
    if (onRefresh != null) content = RefreshIndicator(onRefresh: onRefresh!, child: content);
    return Scaffold(
      backgroundColor: W.g50,
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        WebHeader(title: title, subtitle: subtitle, actions: actions, back: back),
        Expanded(child: content),
      ]),
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
  const WebHeader({super.key, required this.title, this.subtitle, this.actions = const [], this.back = false});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = '${s.user?['username'] ?? s.user?['name'] ?? ''}';
    return Container(
      constraints: const BoxConstraints(minHeight: 89),
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: W.g200))),
      child: Row(children: [
        if (back && Navigator.of(context).canPop())
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: _SquareButton(icon: LucideIcons.arrowLeft, bg: W.g100, fg: W.g700, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop()),
          ),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: W.g900, height: 1.2)),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, color: W.g500)),
            ],
          ]),
        ),
        const SizedBox(width: 12),
        for (final a in actions) Padding(padding: const EdgeInsets.only(left: 12), child: a),
        const SizedBox(width: 12),
        // Sync status sits where the website has its dark-mode button.
        _SquareButton(
          icon: !s.online ? LucideIcons.cloudOff : (s.syncing ? LucideIcons.refreshCw : LucideIcons.cloud),
          bg: !s.online ? const Color(0xFFFEF2F2) : W.primaryLighter,
          fg: !s.online ? W.red : W.primary,
          badge: s.pending + s.failed,
          tooltip: !s.online ? 'Offline — changes are saved and sent later' : s.pending > 0 ? '${s.pending} change(s) sending' : 'Synced ${s.lastSync == null ? '' : ago(s.lastSync)}',
          onTap: () => webUserMenu?.call(context, 'sync'),
        ),
        const SizedBox(width: 12),
        PopupMenuButton<String>(
          tooltip: '',
          position: PopupMenuPosition.under,
          offset: const Offset(0, 10),
          onSelected: (v) => webUserMenu?.call(context, v),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'profile', height: 40, child: Row(children: [Icon(LucideIcons.userPen, size: 16), SizedBox(width: 10), Text('Edit Profile')])),
            PopupMenuItem(value: 'sync', height: 40, child: Row(children: [Icon(LucideIcons.refreshCw, size: 16), SizedBox(width: 10), Text('Sync')])),
            PopupMenuDivider(),
            PopupMenuItem(value: 'logout', height: 40, child: Row(children: [Icon(LucideIcons.logOut, size: 16), SizedBox(width: 10), Text('Logout')])),
          ],
          child: Container(
            padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
            decoration: BoxDecoration(color: W.g50, borderRadius: BorderRadius.circular(999)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              s.user?['avatar'] != null
                  ? Avatar(name, photo: s.user?['avatar'], size: 36)
                  : Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [W.primary, W.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight)),
                      child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                    ),
              const SizedBox(width: 11),
              Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: W.g900)),
                Text('${s.user?['roleLabel'] ?? ''}', style: const TextStyle(fontSize: 12, color: W.g500)),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
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
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onTap,
            child: SizedBox(width: 40, height: 40, child: Badge(isLabelVisible: badge > 0, label: Text('$badge'), child: Icon(icon, size: 19, color: fg))),
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
    final first = Text(a, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: bold ? FontWeight.w600 : FontWeight.w500, color: aColor ?? W.g900));
    return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
      onTap == null ? first : MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(onTap: onTap, child: first)),
      if (b != null && b!.isNotEmpty) Text(b!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: bColor ?? W.g500)),
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
  Size get preferredSize => const Size.fromHeight(89);
  @override
  Widget build(BuildContext context) => WebHeader(title: title, subtitle: subtitle, actions: actions, back: back);
}
