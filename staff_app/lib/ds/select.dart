import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'field.dart';
import 'tokens.dart';

/// Desktop dropdown: compact popup under (or above) the field, hover highlight,
/// check mark on the selected item, ↑ / ↓ to move, Enter to pick, Esc to close,
/// Home / End, and typing a letter jumps to the first item starting with it.
class DSelect<T> extends StatefulWidget {
  final T value;
  final List<(T, String)> options;
  final ValueChanged<T>? onChanged;
  final String? label, labelHint, hint;
  final IconData? icon;
  final double? width;
  final double? menuWidth;
  final bool required;
  final bool small; // header / toolbar variant
  const DSelect({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    this.label,
    this.labelHint,
    this.hint,
    this.icon,
    this.width,
    this.menuWidth,
    this.required = false,
    this.small = false,
  });
  @override
  State<DSelect<T>> createState() => _DSelectState<T>();
}

class _DSelectState<T> extends State<DSelect<T>> {
  final _link = LayerLink();
  final _portal = OverlayPortalController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final _fieldKey = GlobalKey();
  int _hi = -1; // highlighted row
  bool _hover = false, _above = false;
  double _fieldW = 200;

  bool get _enabled => widget.onChanged != null && widget.options.isNotEmpty;
  int get _selectedIndex => widget.options.indexWhere((o) => o.$1 == widget.value);

  @override
  void dispose() {
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _open() {
    if (!_enabled) return;
    final box = _fieldKey.currentContext?.findRenderObject() as RenderBox?;
    if (box != null) {
      _fieldW = box.size.width;
      final pos = box.localToGlobal(Offset.zero);
      final screen = MediaQuery.sizeOf(context).height;
      final want = (widget.options.length * DS.menuItemH + 8).clamp(0, 300).toDouble();
      _above = pos.dy + box.size.height + want > screen - 8 && pos.dy > want;
    }
    setState(() => _hi = _selectedIndex < 0 ? 0 : _selectedIndex);
    _portal.show();
    _focus.requestFocus();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reveal());
  }

  void _close() {
    if (_portal.isShowing) _portal.hide();
    setState(() {});
  }

  void _pick(int i) {
    if (i < 0 || i >= widget.options.length) return;
    _close();
    final v = widget.options[i].$1;
    if (v != widget.value) widget.onChanged?.call(v);
  }

  void _move(int d) {
    if (!_portal.isShowing) return _open();
    setState(() => _hi = (_hi + d).clamp(0, widget.options.length - 1));
    _reveal();
  }

  void _reveal() {
    if (!_scroll.hasClients || _hi < 0) return;
    final top = _hi * DS.menuItemH, view = _scroll.position.viewportDimension;
    if (top < _scroll.offset) _scroll.jumpTo(top);
    if (top + DS.menuItemH > _scroll.offset + view) _scroll.jumpTo(top + DS.menuItemH - view);
  }

  KeyEventResult _key(FocusNode n, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final k = e.logicalKey;
    final open = _portal.isShowing;
    if (k == LogicalKeyboardKey.arrowDown) {
      _move(1);
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.arrowUp) {
      _move(-1);
      return KeyEventResult.handled;
    }
    if (open && (k == LogicalKeyboardKey.home || k == LogicalKeyboardKey.end)) {
      setState(() => _hi = k == LogicalKeyboardKey.home ? 0 : widget.options.length - 1);
      _reveal();
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.enter || k == LogicalKeyboardKey.numpadEnter || k == LogicalKeyboardKey.space) {
      open ? _pick(_hi) : _open();
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.escape && open) {
      _close();
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.tab && open) _close();
    // Typing a letter jumps to the next item starting with it.
    final ch = e.character;
    if (ch != null && ch.length == 1 && RegExp(r'[A-Za-z0-9]').hasMatch(ch)) {
      final start = (_hi + 1).clamp(0, widget.options.length);
      final order = [...List.generate(widget.options.length - start, (i) => i + start), ...List.generate(start, (i) => i)];
      final hit = order.where((i) => widget.options[i].$2.toLowerCase().startsWith(ch.toLowerCase())).firstOrNull;
      if (hit != null) {
        if (!open) {
          _pick(hit);
        } else {
          setState(() => _hi = hit);
          _reveal();
        }
        return KeyEventResult.handled;
      }
    }
    return KeyEventResult.ignored;
  }

  Widget _menu() {
    final w = widget.menuWidth ?? _fieldW;
    return Positioned(
      width: w.clamp(140.0, 480.0),
      child: CompositedTransformFollower(
        link: _link,
        targetAnchor: _above ? Alignment.topLeft : Alignment.bottomLeft,
        followerAnchor: _above ? Alignment.bottomLeft : Alignment.topLeft,
        offset: Offset(0, _above ? -4 : 4),
        child: TapRegion(
          groupId: this,
          onTapOutside: (_) => _close(),
          child: Material(
            color: Colors.transparent,
            child: Container(
              constraints: const BoxConstraints(maxHeight: 300),
              decoration: BoxDecoration(color: DS.surface, borderRadius: DS.r, border: Border.all(color: DS.line), boxShadow: DS.popupShadow),
              child: ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.symmetric(vertical: 4),
                shrinkWrap: true,
                itemExtent: DS.menuItemH,
                itemCount: widget.options.length,
                itemBuilder: (c, i) {
                  final (v, l) = widget.options[i];
                  final sel = v == widget.value;
                  return MouseRegion(
                    onEnter: (_) => setState(() => _hi = i),
                    cursor: SystemMouseCursors.click,
                    child: GestureDetector(
                      onTap: () => _pick(i),
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        decoration: BoxDecoration(color: i == _hi ? DS.hover : Colors.transparent, borderRadius: BorderRadius.circular(3)),
                        child: Row(children: [
                          SizedBox(width: 20, child: sel ? const Icon(LucideIcons.check, size: 14, color: DS.primary) : null),
                          Expanded(child: Text(l, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: DS.fBody, color: sel ? DS.primary : DS.text, fontWeight: sel ? FontWeight.w600 : FontWeight.w400))),
                        ]),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final i = _selectedIndex;
    final text = i >= 0 ? widget.options[i].$2 : (widget.hint ?? 'Select…');
    final open = _portal.isShowing;
    final field = TapRegion(
      groupId: this,
      child: CompositedTransformTarget(
        link: _link,
        child: OverlayPortal(
          controller: _portal,
          overlayChildBuilder: (_) => _menu(),
          child: Focus(
            focusNode: _focus,
            onKeyEvent: _key,
            onFocusChange: (f) {
              if (!f) _close();
              setState(() {});
            },
            child: MouseRegion(
              cursor: _enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
              onEnter: (_) => setState(() => _hover = true),
              onExit: (_) => setState(() => _hover = false),
              child: GestureDetector(
                onTap: () => open ? _close() : _open(),
                child: Container(
                  key: _fieldKey,
                  height: widget.small ? DS.controlHSm : DS.controlH,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: _enabled ? DS.surface : DS.lineSoft,
                    borderRadius: DS.r,
                    border: Border.all(color: _focus.hasFocus || open ? DS.primary : _hover ? DS.faint : DS.border, width: _focus.hasFocus || open ? 1.5 : 1),
                  ),
                  child: Row(children: [
                    if (widget.icon != null) ...[Icon(widget.icon, size: 14, color: DS.muted), const SizedBox(width: 8)],
                    Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: DS.fBody, color: i >= 0 ? DS.text : DS.faint))),
                    AnimatedRotation(turns: open ? .5 : 0, duration: DS.fast, child: const Icon(LucideIcons.chevronDown, size: 14, color: DS.muted)),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    final w = widget.label == null
        ? field
        : Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [DLabel(widget.label!, hint: widget.labelHint, required: widget.required), field]);
    return widget.width == null ? w : SizedBox(width: widget.width, child: w);
  }
}
