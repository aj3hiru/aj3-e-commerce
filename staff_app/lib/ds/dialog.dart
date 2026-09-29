import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'button.dart';
import 'tokens.dart';

/// One button of a dialog footer.
class DAction {
  final String label;
  final DVariant variant;
  final IconData? icon;
  final bool primary; // Enter triggers it
  final bool cancel; // Escape triggers it
  final FutureOr<void> Function()? onPressed; // null = close the dialog with null
  const DAction(this.label, {this.variant = DVariant.secondary, this.icon, this.primary = false, this.cancel = false, this.onPressed});
  const DAction.cancel([this.label = 'Cancel'])
      : variant = DVariant.secondary,
        icon = null,
        primary = false,
        cancel = true,
        onPressed = null;
}

/// Desktop dialog window: title bar with close button, compact body, footer buttons.
/// Esc = Cancel / close, Enter = primary action (not while typing in a multi-line box),
/// clicking outside does nothing (forms are never lost by a stray click),
/// first field gets focus. Subtle 140 ms fade + scale.
Future<T?> showDDialog<T>(
  BuildContext context, {
  required String title,
  required Widget Function(BuildContext) builder,
  List<DAction> actions = const [],
  double width = 460,
  double? maxHeight,
  IconData? icon,
  bool closeButton = true,
  Future<bool> Function()? confirmClose, // e.g. "discard changes?"
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: false,
    barrierLabel: title,
    barrierColor: const Color(0x4D0F172A),
    transitionDuration: Duration.zero, // opens at once, like a Windows dialog
    pageBuilder: (c, a1, a2) => _DDialog(title: title, builder: builder, actions: actions, width: width, maxHeight: maxHeight, icon: icon, closeButton: closeButton, confirmClose: confirmClose),
    transitionBuilder: (c, a, s, child) => FadeTransition(
      opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
      child: ScaleTransition(scale: Tween(begin: .98, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOut)), child: child),
    ),
  );
}

class _DDialog extends StatefulWidget {
  final String title;
  final Widget Function(BuildContext) builder;
  final List<DAction> actions;
  final double width;
  final double? maxHeight;
  final IconData? icon;
  final bool closeButton;
  final Future<bool> Function()? confirmClose;
  const _DDialog({required this.title, required this.builder, required this.actions, required this.width, this.maxHeight, this.icon, required this.closeButton, this.confirmClose});
  @override
  State<_DDialog> createState() => _DDialogState();
}

class _DDialogState extends State<_DDialog> {
  bool _busy = false;

  Future<void> _close() async {
    if (widget.confirmClose != null && !await widget.confirmClose!()) return;
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _run(DAction a) async {
    if (_busy) return;
    if (a.onPressed == null) return a.cancel ? _close() : Navigator.of(context).pop();
    setState(() => _busy = true);
    try {
      await a.onPressed!();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _typingMultiline() {
    final f = FocusManager.instance.primaryFocus?.context?.widget;
    return f is EditableText && f.maxLines != 1;
  }

  @override
  Widget build(BuildContext context) {
    final primary = widget.actions.where((a) => a.primary).firstOrNull;
    final size = MediaQuery.sizeOf(context);
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): _close,
        if (primary != null) const SingleActivator(LogicalKeyboardKey.enter): () {
          if (!_typingMultiline()) _run(primary);
        },
        if (primary != null) const SingleActivator(LogicalKeyboardKey.numpadEnter): () => _run(primary),
      },
      child: FocusScope(
        autofocus: true,
        child: Center(
          // Shadow outside, white window inside (the shadow must not tint the body).
          child: Container(
            width: widget.width.clamp(280.0, size.width - 32),
            constraints: BoxConstraints(maxHeight: (widget.maxHeight ?? size.height - 48).clamp(200.0, size.height - 32)),
            decoration: BoxDecoration(color: DS.surface, borderRadius: DS.rCard, border: Border.all(color: const Color(0x26000000)), boxShadow: DS.dialogShadow),
            child: Material(
              color: Colors.transparent,
              borderRadius: DS.rCard,
              clipBehavior: Clip.antiAlias,
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                // title bar
                Container(
                  height: 38,
                  padding: const EdgeInsets.only(left: 14),
                  decoration: const BoxDecoration(color: Color(0xFFF7F7F8), border: Border(bottom: BorderSide(color: DS.line))),
                  child: Row(children: [
                    if (widget.icon != null) ...[Icon(widget.icon, size: 15, color: DS.primary), const SizedBox(width: 8)],
                    Expanded(child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: DS.fDialogTitle, fontWeight: FontWeight.w600, color: DS.text))),
                    if (widget.closeButton) _TitleButton(icon: LucideIcons.x, tooltip: 'Close (Esc)', onTap: _close),
                  ]),
                ),
                Flexible(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 16), child: Builder(builder: widget.builder))),
                if (widget.actions.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                    decoration: const BoxDecoration(color: Color(0xFFFAFAFB), border: Border(top: BorderSide(color: DS.line))),
                    child: Row(children: [
                      // non-cancel, non-primary "extra" actions sit on the left (e.g. Suspend, Delete)
                      for (final a in widget.actions.where((a) => !a.primary && !a.cancel && a.variant == DVariant.danger)) ...[
                        DButton(a.label, icon: a.icon, variant: a.variant, onPressed: _busy ? null : () => _run(a)),
                        const SizedBox(width: 8),
                      ],
                      const Spacer(),
                      for (final a in widget.actions.where((a) => !(a.variant == DVariant.danger && !a.primary && !a.cancel))) ...[
                        const SizedBox(width: 8),
                        DButton(
                          a.label,
                          icon: a.icon,
                          variant: a.primary && a.variant == DVariant.secondary ? DVariant.primary : a.variant,
                          loading: _busy && a.primary,
                          onPressed: _busy && !a.cancel ? null : () => _run(a),
                          tooltip: a.primary ? '${a.label} (Enter)' : a.cancel ? '${a.label} (Esc)' : null,
                        ),
                      ],
                    ]),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _TitleButton extends StatefulWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  const _TitleButton({required this.icon, required this.tooltip, required this.onTap});
  @override
  State<_TitleButton> createState() => _TitleButtonState();
}

class _TitleButtonState extends State<_TitleButton> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) => Tooltip(
        message: widget.tooltip,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: GestureDetector(
            onTap: widget.onTap,
            child: Container(width: 44, height: 38, color: _hover ? const Color(0xFFE81123) : Colors.transparent, child: Icon(widget.icon, size: 15, color: _hover ? Colors.white : DS.text2)),
          ),
        ),
      );
}

/// Yes / No question in desktop style (Enter = yes, Esc = no).
Future<bool> dConfirm(BuildContext context, String title, String message, {String ok = 'Yes', bool danger = false}) async {
  final r = await showDDialog<bool>(
    context,
    title: title,
    width: 420,
    icon: danger ? LucideIcons.triangleAlert : LucideIcons.circleHelp,
    builder: (_) => Text(message, style: DS.body),
    actions: [
      const DAction.cancel(),
      DAction(ok, primary: true, variant: danger ? DVariant.danger : DVariant.primary, onPressed: () async => Navigator.of(context, rootNavigator: true).pop(true)),
    ],
  );
  return r == true;
}

// ── context menus ──

class DMenuItem<T> {
  final T value;
  final String label;
  final IconData? icon;
  final bool danger;
  final bool enabled;
  final String? shortcut;
  const DMenuItem(this.value, this.label, {this.icon, this.danger = false, this.enabled = true, this.shortcut});
}

/// Right-click / "⋯" menu at a position: compact items, hover, keyboard (↑↓ Enter Esc via Material menu).
Future<T?> showDMenu<T>(BuildContext context, Offset position, List<DMenuItem<T>?> items) {
  final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
  return showMenu<T>(
    context: context,
    position: RelativeRect.fromRect(position & const Size(1, 1), Offset.zero & overlay.size),
    elevation: 6,
    color: DS.surface,
    menuPadding: const EdgeInsets.symmetric(vertical: 4),
    shape: RoundedRectangleBorder(borderRadius: DS.r, side: const BorderSide(color: DS.line)),
    constraints: const BoxConstraints(minWidth: 180, maxWidth: 280),
    popUpAnimationStyle: AnimationStyle.noAnimation, // opens at once, like a Windows menu
    items: [
      for (final it in items)
        if (it == null)
          const PopupMenuDivider(height: 9)
        else
          PopupMenuItem<T>(
            value: it.value,
            enabled: it.enabled,
            height: DS.menuItemH,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              SizedBox(width: 22, child: it.icon == null ? null : Icon(it.icon, size: 14, color: it.danger ? DS.danger : DS.text2)),
              Expanded(child: Text(it.label, style: TextStyle(fontSize: DS.fBody, color: it.danger ? DS.danger : DS.text))),
              if (it.shortcut != null) Text(it.shortcut!, style: DS.small),
            ]),
          ),
    ],
  );
}
