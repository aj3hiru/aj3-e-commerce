import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

/// Label above a control (desktop forms put labels above, not floating inside).
class DLabel extends StatelessWidget {
  final String text;
  final String? hint; // small grey text on the right ("Optional", "For GST")
  final bool required;
  const DLabel(this.text, {super.key, this.hint, this.required = false});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(children: [
          Flexible(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: text, style: DS.label),
              if (required) const TextSpan(text: ' *', style: TextStyle(color: DS.danger, fontSize: DS.fLabel)),
            ])),
          ),
          if (hint != null) ...[const Spacer(), Text(hint!, style: DS.small)],
        ]),
      );
}

/// Shared input look: 32 px, 4 px radius, clear focus and error borders.
InputDecoration dInputDecoration({String? hint, IconData? prefixIcon, Widget? suffix, String? prefixText, bool dense = true}) {
  OutlineInputBorder b(Color c, [double w = 1]) => OutlineInputBorder(borderRadius: DS.r, borderSide: BorderSide(color: c, width: w));
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(fontSize: DS.fBody, color: DS.faint),
    isDense: true,
    filled: true,
    fillColor: DS.surface,
    prefixText: prefixText,
    prefixStyle: const TextStyle(fontSize: DS.fBody, color: DS.muted),
    prefixIcon: prefixIcon == null ? null : Icon(prefixIcon, size: 15, color: DS.faint),
    prefixIconConstraints: const BoxConstraints(minWidth: 32, minHeight: 30),
    suffixIcon: suffix,
    suffixIconConstraints: const BoxConstraints(minWidth: 30, minHeight: 30),
    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
    border: b(DS.border),
    enabledBorder: b(DS.border),
    focusedBorder: b(DS.primary, 1.5),
    errorBorder: b(DS.danger),
    focusedErrorBorder: b(DS.danger, 1.5),
    disabledBorder: b(DS.line),
    errorStyle: const TextStyle(fontSize: 11.5, color: DS.danger, height: 1.1),
    errorMaxLines: 2,
  );
}

/// Desktop text input: optional label above, compact, keyboard friendly.
class DTextField extends StatelessWidget {
  final TextEditingController? controller;
  final String? label, labelHint, hint, initialValue, prefixText;
  final IconData? prefixIcon;
  final Widget? suffix;
  final bool required, autofocus, obscure, enabled, readOnly;
  final int maxLines;
  final int? minLines, maxLength;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged, onSubmitted;
  final FocusNode? focusNode;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final double? width;
  final TextAlign textAlign;
  const DTextField({
    super.key,
    this.controller,
    this.label,
    this.labelHint,
    this.hint,
    this.initialValue,
    this.prefixText,
    this.prefixIcon,
    this.suffix,
    this.required = false,
    this.autofocus = false,
    this.obscure = false,
    this.enabled = true,
    this.readOnly = false,
    this.maxLines = 1,
    this.minLines,
    this.maxLength,
    this.keyboardType,
    this.inputFormatters,
    this.validator,
    this.onChanged,
    this.onSubmitted,
    this.focusNode,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.width,
    this.textAlign = TextAlign.start,
  });

  /// Money: digits and one dot, right-aligned figures.
  static List<TextInputFormatter> get money => [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))];
  static List<TextInputFormatter> get whole => [FilteringTextInputFormatter.digitsOnly];

  @override
  Widget build(BuildContext context) {
    final field = TextFormField(
      controller: controller,
      initialValue: initialValue,
      focusNode: focusNode,
      autofocus: autofocus,
      obscureText: obscure,
      enabled: enabled,
      readOnly: readOnly,
      maxLines: obscure ? 1 : maxLines,
      minLines: minLines,
      maxLength: maxLength,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      validator: validator ?? (required ? (v) => (v ?? '').trim().isEmpty ? 'Required' : null : null),
      onChanged: onChanged,
      onFieldSubmitted: onSubmitted,
      textInputAction: textInputAction ?? (maxLines > 1 ? TextInputAction.newline : TextInputAction.next),
      textCapitalization: textCapitalization,
      textAlign: textAlign,
      style: DS.body.copyWith(fontFeatures: keyboardType == TextInputType.number || (keyboardType?.decimal ?? false) ? const [FontFeature.tabularFigures()] : null),
      cursorWidth: 1.5,
      cursorHeight: 16,
      decoration: dInputDecoration(hint: hint, prefixIcon: prefixIcon, suffix: suffix, prefixText: prefixText).copyWith(counterText: ''),
    );
    final w = label == null ? field : Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [DLabel(label!, hint: labelHint, required: required), field]);
    return width == null ? w : SizedBox(width: width, child: w);
  }
}

/// Checkbox + label row (desktop style, whole row clickable).
class DCheck extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final String label;
  final String? hint;
  const DCheck({super.key, required this.value, required this.onChanged, required this.label, this.hint});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: () => onChanged(!value),
        borderRadius: DS.r,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(crossAxisAlignment: hint == null ? CrossAxisAlignment.center : CrossAxisAlignment.start, children: [
            SizedBox(width: 20, height: 20, child: Checkbox(value: value, onChanged: (v) => onChanged(v ?? false), visualDensity: VisualDensity.compact, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: DS.body),
                if (hint != null) Text(hint!, style: DS.small),
              ]),
            ),
          ]),
        ),
      );
}

/// On / off switch with a label (settings rows).
class DSwitchRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool>? onChanged;
  final String label;
  final String? hint;
  const DSwitchRow({super.key, required this.value, required this.onChanged, required this.label, this.hint});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: DS.body.copyWith(fontWeight: FontWeight.w500)),
              if (hint != null) Text(hint!, style: DS.small),
            ]),
          ),
          Transform.scale(scale: .8, child: Switch(value: value, onChanged: onChanged, activeTrackColor: DS.primary)),
        ]),
      );
}

/// Segmented choice (Published / Unpublished, Add / Set…).
class DSegmented<T> extends StatelessWidget {
  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;
  const DSegmented({super.key, required this.options, required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => Container(
        height: DS.controlH,
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(color: DS.hover, borderRadius: DS.r, border: Border.all(color: DS.line)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          for (final (v, l) in options)
            InkWell(
              onTap: () => onChanged(v),
              borderRadius: BorderRadius.circular(3),
              child: AnimatedContainer(
                duration: DS.fast,
                padding: const EdgeInsets.symmetric(horizontal: 11),
                decoration: BoxDecoration(
                  color: v == value ? DS.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(3),
                  boxShadow: v == value ? DS.cardShadow : null,
                ),
                child: Center(
                  widthFactor: 1,
                  child: Text(l, maxLines: 1, style: TextStyle(fontSize: DS.fBody, fontWeight: v == value ? FontWeight.w600 : FontWeight.w500, color: v == value ? DS.primary : DS.muted)),
                ),
              ),
            ),
        ]),
      );
}
