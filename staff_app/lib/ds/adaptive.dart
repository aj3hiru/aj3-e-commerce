import 'package:flutter/material.dart';

import 'button.dart';
import 'dialog.dart';
import 'field.dart';
import 'select.dart';
import 'tokens.dart';

/// Screens shared by the phone and Windows apps call these; Windows gets the
/// desktop controls (window dialogs, compact fields, keyboard dropdowns), phones
/// keep their touch-friendly Material versions.
bool desktop(BuildContext c) => MediaQuery.sizeOf(c).width >= 900;

/// Dialog with a form / message and footer buttons.
Future<T?> showAppDialog<T>(
  BuildContext context, {
  required String title,
  required Widget Function(BuildContext) builder,
  List<DAction> actions = const [],
  double width = 460,
  IconData? icon,
}) {
  if (desktop(context)) return showDDialog<T>(context, title: title, builder: builder, actions: actions, width: width, icon: icon);
  return showDialog<T>(
    context: context,
    builder: (d) => StatefulBuilder(
      builder: (d, _) => AlertDialog(
        title: Text(title),
        content: SizedBox(width: width, child: SingleChildScrollView(child: Builder(builder: builder))),
        actions: [
          for (final a in actions)
            a.primary
                ? FilledButton(
                    style: a.variant == DVariant.danger ? FilledButton.styleFrom(backgroundColor: DS.danger) : null,
                    onPressed: () async => a.onPressed == null ? Navigator.pop(d) : await a.onPressed!(),
                    child: Text(a.label),
                  )
                : TextButton(
                    style: a.variant == DVariant.danger ? TextButton.styleFrom(foregroundColor: DS.danger) : null,
                    onPressed: () async => a.onPressed == null ? Navigator.pop(d) : await a.onPressed!(),
                    child: Text(a.label),
                  ),
        ],
      ),
    ),
  );
}

/// A list of choices / a small panel: a window on Windows, a bottom sheet on phones.
Future<T?> showAppSheet<T>(BuildContext context, {required String title, required Widget Function(BuildContext) builder, double width = 460, bool scrollControlled = false}) {
  if (desktop(context)) return showDDialog<T>(context, title: title, builder: builder, width: width);
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: scrollControlled,
    builder: (c) => SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(c).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.only(bottom: 8, left: 4), child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          Flexible(child: Builder(builder: builder)),
        ]),
      ),
    ),
  );
}

/// One tappable row inside [showAppSheet] (agent to assign, payment method…).
class AppChoice extends StatelessWidget {
  final Widget? leading;
  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;
  const AppChoice({super.key, this.leading, required this.title, this.subtitle, this.selected = false, required this.onTap});
  @override
  Widget build(BuildContext context) {
    if (!desktop(context)) {
      return ListTile(leading: leading, title: Text(title), subtitle: subtitle == null ? null : Text(subtitle!), trailing: selected ? const Icon(Icons.check_rounded) : null, onTap: onTap);
    }
    return InkWell(
      onTap: onTap,
      borderRadius: DS.r,
      hoverColor: DS.hover,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
        child: Row(children: [
          if (leading != null) ...[SizedBox(width: 32, height: 32, child: FittedBox(child: leading)), const SizedBox(width: 10)],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: DS.body.copyWith(fontWeight: FontWeight.w500)),
              if (subtitle != null) Text(subtitle!, style: DS.small),
            ]),
          ),
          if (selected) const Icon(Icons.check_rounded, size: 16, color: DS.primary),
        ]),
      ),
    );
  }
}

/// Text field: desktop label-above compact input, or the phone's floating-label field.
class AppField extends StatelessWidget {
  final TextEditingController? controller;
  final String label;
  final String? hint, helper, prefixText;
  final bool autofocus, obscure, required;
  final int maxLines;
  final TextInputType? keyboardType;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged, onSubmitted;
  final TextCapitalization textCapitalization;
  final Widget? suffix;
  final IconData? prefixIcon;
  final bool enabled;
  const AppField({
    super.key,
    this.controller,
    required this.label,
    this.hint,
    this.helper,
    this.prefixText,
    this.autofocus = false,
    this.obscure = false,
    this.required = false,
    this.maxLines = 1,
    this.keyboardType,
    this.validator,
    this.onChanged,
    this.onSubmitted,
    this.textCapitalization = TextCapitalization.none,
    this.suffix,
    this.prefixIcon,
    this.enabled = true,
  });
  @override
  Widget build(BuildContext context) {
    if (desktop(context)) {
      return DTextField(
        controller: controller, label: label, labelHint: helper, hint: hint, prefixText: prefixText, autofocus: autofocus, obscure: obscure, required: required,
        maxLines: maxLines, keyboardType: keyboardType, validator: validator, onChanged: onChanged, onSubmitted: onSubmitted, textCapitalization: textCapitalization,
        suffix: suffix, prefixIcon: prefixIcon, enabled: enabled,
      );
    }
    return TextFormField(
      controller: controller, autofocus: autofocus, obscureText: obscure, maxLines: obscure ? 1 : maxLines, keyboardType: keyboardType, enabled: enabled,
      validator: validator ?? (required ? (v) => (v ?? '').trim().isEmpty ? 'Required' : null : null), onChanged: onChanged, onFieldSubmitted: onSubmitted,
      textCapitalization: textCapitalization,
      decoration: InputDecoration(labelText: required ? '$label *' : label, hintText: hint, helperText: helper, prefixText: prefixText, suffixIcon: suffix, prefixIcon: prefixIcon == null ? null : Icon(prefixIcon)),
    );
  }
}

/// Dropdown field: keyboard desktop select, or the phone's Material dropdown.
class AppSelect<T> extends StatelessWidget {
  final String label;
  final T value;
  final List<(T, String)> options;
  final ValueChanged<T>? onChanged;
  final String? helper;
  const AppSelect({super.key, required this.label, required this.value, required this.options, required this.onChanged, this.helper});
  @override
  Widget build(BuildContext context) {
    if (desktop(context)) return DSelect<T>(label: label, labelHint: helper, value: value, options: options, onChanged: onChanged);
    return DropdownButtonFormField<T>(
      initialValue: options.any((o) => o.$1 == value) ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label, helperText: helper),
      items: [for (final (v, l) in options) DropdownMenuItem(value: v, child: Text(l, overflow: TextOverflow.ellipsis))],
      onChanged: onChanged == null ? null : (v) => v == null ? null : onChanged!(v),
    );
  }
}

/// Two-to-four way choice: compact desktop segmented control, or Material SegmentedButton.
class AppSegmented<T> extends StatelessWidget {
  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;
  const AppSegmented({super.key, required this.options, required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    if (desktop(context)) return DSegmented<T>(options: options, value: value, onChanged: onChanged);
    return SegmentedButton<T>(
      showSelectedIcon: false,
      segments: [for (final (v, l) in options) ButtonSegment(value: v, label: Text(l))],
      selected: {value},
      onSelectionChanged: (s) => onChanged(s.first),
    );
  }
}

/// Space between stacked form fields (tighter on desktop).
class AppGap extends StatelessWidget {
  const AppGap({super.key});
  @override
  Widget build(BuildContext context) => SizedBox(height: desktop(context) ? DS.s3 : 10);
}
