import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

enum DVariant { primary, secondary, danger, success, ghost, subtle }

enum DSize { md, sm }

/// Desktop button: one height, padding, radius, icon size and type everywhere,
/// with hover / pressed / focused / disabled / loading states and Enter / Space activation.
class DButton extends StatefulWidget {
  final String? label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final DVariant variant;
  final DSize size;
  final bool loading;
  final String? tooltip;
  final Color? color; // custom fill (keeps the website's coloured buttons, e.g. orange "Add Product")
  final bool autofocus;
  final bool expand;
  final FocusNode? focusNode;
  const DButton(
    this.label, {
    super.key,
    this.icon,
    this.onPressed,
    this.variant = DVariant.secondary,
    this.size = DSize.md,
    this.loading = false,
    this.tooltip,
    this.color,
    this.autofocus = false,
    this.expand = false,
    this.focusNode,
  });

  const DButton.primary(this.label, {super.key, this.icon, this.onPressed, this.size = DSize.md, this.loading = false, this.tooltip, this.color, this.autofocus = false, this.expand = false, this.focusNode})
      : variant = DVariant.primary;
  const DButton.icon(IconData this.icon, {super.key, required String this.tooltip, this.onPressed, this.variant = DVariant.ghost, this.size = DSize.md, this.color, this.focusNode})
      : label = null,
        loading = false,
        autofocus = false,
        expand = false;

  @override
  State<DButton> createState() => _DButtonState();
}

class _DButtonState extends State<DButton> {
  bool _hover = false, _down = false, _focus = false;

  bool get _enabled => widget.onPressed != null && !widget.loading;

  (Color bg, Color fg, Color? border) _colors() {
    final v = widget.variant;
    final c = widget.color;
    if (!_enabled) {
      return switch (v) {
        DVariant.primary || DVariant.danger || DVariant.success => ((c ?? _fill(v)).withValues(alpha: .45), Colors.white, null),
        DVariant.secondary => (DS.surface, DS.faint, DS.line),
        _ => (Colors.transparent, DS.faint, null),
      };
    }
    switch (v) {
      case DVariant.primary || DVariant.danger || DVariant.success:
        final base = c ?? _fill(v);
        final bg = _down ? Color.lerp(base, Colors.black, .18)! : _hover ? Color.lerp(base, Colors.black, .09)! : base;
        return (bg, Colors.white, null);
      case DVariant.secondary:
        return (_down ? DS.pressed : _hover ? DS.hover : DS.surface, DS.text2, _hover ? DS.faint : DS.border);
      case DVariant.subtle:
        return (_down ? DS.primaryTint : _hover ? const Color(0xFFEDE9FE) : DS.primarySoft, DS.primary, null);
      case DVariant.ghost:
        return (_down ? DS.pressed : _hover ? DS.hover : Colors.transparent, c ?? DS.text2, null);
    }
  }

  static Color _fill(DVariant v) => switch (v) {
        DVariant.danger => DS.danger,
        DVariant.success => DS.success,
        _ => DS.primary,
      };

  void _activate() {
    if (!_enabled) return;
    HapticFeedback.selectionClick();
    widget.onPressed!();
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.size == DSize.md ? DS.controlH : DS.controlHSm;
    final (bg, fg, border) = _colors();
    final iconOnly = widget.label == null;
    final iconSize = widget.size == DSize.md ? DS.icon : DS.iconSm;
    Widget content = widget.loading
        ? SizedBox(width: iconSize, height: iconSize, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
        : Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
            if (widget.icon != null) Icon(widget.icon, size: iconSize, color: fg),
            if (widget.icon != null && !iconOnly) SizedBox(width: widget.size == DSize.md ? 7 : 5),
            if (!iconOnly)
              Flexible(
                child: Text(widget.label!, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: widget.size == DSize.md ? DS.fBody : DS.fSmall, fontWeight: FontWeight.w600, color: fg, height: 1)),
              ),
          ]);
    if (widget.loading && !iconOnly) {
      content = Row(mainAxisSize: MainAxisSize.min, children: [
        content,
        const SizedBox(width: 7),
        Text(widget.label!, style: TextStyle(fontSize: DS.fBody, fontWeight: FontWeight.w600, color: fg, height: 1)),
      ]);
    }
    Widget box = Container(
      height: h,
      width: iconOnly ? h : null,
      padding: iconOnly ? EdgeInsets.zero : EdgeInsets.symmetric(horizontal: widget.size == DSize.md ? 12 : 9),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: DS.r,
        border: border == null ? null : Border.all(color: border),
        boxShadow: _focus ? const [BoxShadow(color: DS.focusRing, spreadRadius: 2)] : null,
      ),
      child: Center(widthFactor: iconOnly ? null : 1, child: content),
    );
    if (widget.expand) box = SizedBox(width: double.infinity, child: box);
    box = FocusableActionDetector(
      enabled: _enabled,
      autofocus: widget.autofocus,
      focusNode: widget.focusNode,
      mouseCursor: _enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      onShowHoverHighlight: (v) => setState(() => _hover = v),
      onShowFocusHighlight: (v) => setState(() => _focus = v),
      actions: {ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) => _activate())},
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: _enabled ? (_) => setState(() => _down = true) : null,
        onTapUp: _enabled ? (_) => setState(() => _down = false) : null,
        onTapCancel: () => setState(() => _down = false),
        onTap: _enabled ? _activate : null,
        child: box,
      ),
    );
    final tip = widget.tooltip ?? (iconOnly ? null : null);
    return tip == null ? box : Tooltip(message: tip, waitDuration: const Duration(milliseconds: 500), child: box);
  }
}
