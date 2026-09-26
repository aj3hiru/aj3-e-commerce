import 'package:flutter/material.dart';

import 'tokens.dart';

/// Desktop panel: flat white, thin border, 6 px corners, compact padding.
class DCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final String? title;
  final IconData? icon;
  final List<Widget> actions;
  final VoidCallback? onTap;
  final Color? borderColor;
  const DCard({super.key, required this.child, this.padding = const EdgeInsets.all(DS.s4), this.title, this.icon, this.actions = const [], this.onTap, this.borderColor});
  @override
  Widget build(BuildContext context) {
    final inner = title == null
        ? Padding(padding: padding, child: child)
        : Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            Container(
              height: 42,
              padding: const EdgeInsets.symmetric(horizontal: DS.s4),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DS.lineSoft))),
              child: Row(children: [
                if (icon != null) ...[Icon(icon, size: 15, color: DS.primary), const SizedBox(width: 8)],
                Expanded(child: Text(title!, maxLines: 1, overflow: TextOverflow.ellipsis, style: DS.cardTitle)),
                for (final a in actions) Padding(padding: const EdgeInsets.only(left: 6), child: a),
              ]),
            ),
            Padding(padding: padding, child: child),
          ]);
    final box = Container(
      decoration: BoxDecoration(color: DS.surface, borderRadius: DS.rCard, border: Border.all(color: borderColor ?? DS.line, width: borderColor == null ? 1 : 1.5), boxShadow: DS.cardShadow),
      child: inner,
    );
    if (onTap == null) return box;
    return Material(
      color: Colors.transparent,
      child: InkWell(onTap: onTap, borderRadius: DS.rCard, hoverColor: DS.hover.withValues(alpha: .4), child: box),
    );
  }
}

/// Section of a settings form: small bold heading + fields in a grid.
class DFormSection extends StatelessWidget {
  final String title;
  final String? hint;
  final List<Widget> children;
  final int columns;
  const DFormSection({super.key, required this.title, this.hint, required this.children, this.columns = 2});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: DS.cardTitle),
        if (hint != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(hint!, style: DS.small)),
        const SizedBox(height: DS.s3),
        DFormGrid(columns: columns, children: children),
      ]);
}

/// Fields laid out in N columns (one column when narrow), 12 px gaps.
class DFormGrid extends StatelessWidget {
  final List<Widget> children;
  final int columns;
  const DFormGrid({super.key, required this.children, this.columns = 2});
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (c, box) {
        final n = box.maxWidth < 520 ? 1 : columns;
        final rows = <Widget>[];
        for (var i = 0; i < children.length; i += n) {
          rows.add(Padding(
            padding: EdgeInsets.only(bottom: i + n < children.length ? DS.s3 : 0),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (var j = 0; j < n; j++) ...[if (j > 0) const SizedBox(width: DS.s3), Expanded(child: i + j < children.length ? children[i + j] : const SizedBox())],
            ]),
          ));
        }
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
      });
}
