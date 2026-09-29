import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/local_store.dart';
import 'tokens.dart';

/// The website's "Display Options" (lib/core/display_defs.dart is generated from its files):
/// each page lists sections (a group, with its parts) and single items the person can hide.
class DisplayGroup {
  final String group;
  final String label;
  final List<(String, String)> items; // key, label
  const DisplayGroup(this.group, this.label, this.items);
}

class DisplayDef {
  final String key;
  final List<DisplayGroup> groups;
  final List<(String, String)> standalone;
  const DisplayDef(this.key, this.groups, this.standalone);
}

/// Parts the website keeps hidden until switched on (e.g. RB_DEFAULT_HIDDEN).
const kDefaultHidden = <String, List<String>>{
  'ecom_report_builder_display': ['rb-c-category', 'rb-c-gst', 'rb-c-status', 'rb-c-staff', 'rb-p-category', 'rb-du-phone', 'rb-k-avg', 'rb-k-discount', 'rb-k-gst'],
};

/// What one page hides, kept on this computer (like the website keeps it in the browser).
class DisplayPrefs extends ChangeNotifier {
  static final _all = <String, DisplayPrefs>{};
  factory DisplayPrefs(String key) => _all.putIfAbsent(key, () => DisplayPrefs._(key));
  DisplayPrefs._(this.key) {
    _hidden.addAll(kDefaultHidden[key] ?? const []);
    LocalStore.instance.read('display:$key').then((v) {
      if (v is List) {
        _hidden
          ..clear()
          ..addAll(v.map((e) => '$e'));
        notifyListeners();
      }
    });
  }

  final String key;
  final Set<String> _hidden = {};

  /// A section (and, if given, one part of it) is shown.
  bool on(String group, [String? item]) => !_hidden.contains(group) && (item == null || !_hidden.contains(item));
  bool item(String key) => !_hidden.contains(key);

  void set(String k, bool shown) {
    shown ? _hidden.remove(k) : _hidden.add(k);
    LocalStore.instance.write('display:$key', _hidden.toList());
    notifyListeners();
  }
}

/// Header button "⚙ Display Options ▾" with the website's panel: section checkboxes, each section's parts under ▾.
class DisplayOptionsButton extends StatefulWidget {
  final DisplayDef def;
  const DisplayOptionsButton(this.def, {super.key});
  @override
  State<DisplayOptionsButton> createState() => _DisplayOptionsButtonState();
}

class _DisplayOptionsButtonState extends State<DisplayOptionsButton> {
  final _portal = OverlayPortalController();
  final _link = LayerLink();
  final _openGroups = <String>{};
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final prefs = DisplayPrefs(widget.def.key);
    return CompositedTransformTarget(
      link: _link,
      child: TapRegion(
        groupId: this,
        onTapOutside: (_) => _portal.hide(),
        child: OverlayPortal(
          controller: _portal,
          overlayChildBuilder: (context) => CompositedTransformFollower(
            link: _link,
            targetAnchor: Alignment.bottomRight,
            followerAnchor: Alignment.topRight,
            offset: const Offset(0, 6),
            child: Align(
              alignment: Alignment.topRight,
              child: TapRegion(
                groupId: this,
                child: ListenableBuilder(listenable: prefs, builder: (context, _) => _panel(prefs)),
              ),
            ),
          ),
          child: MouseRegion(
            cursor: SystemMouseCursors.click,
            onEnter: (_) => setState(() => _hover = true),
            onExit: (_) => setState(() => _hover = false),
            child: GestureDetector(
              onTap: () => setState(() => _portal.isShowing ? _portal.hide() : _portal.show()),
              child: Container(
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(color: _hover ? const Color(0xFFF9FAFB) : Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFE5E7EB))),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(LucideIcons.slidersHorizontal, size: 14, color: Color(0xFF374151)),
                  const SizedBox(width: 8),
                  const Text('Display Options', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFF374151))),
                  const SizedBox(width: 8),
                  Icon(_portal.isShowing ? LucideIcons.chevronUp : LucideIcons.chevronDown, size: 12, color: const Color(0xFF374151)),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _check(bool v, String label, ValueChanged<bool> on, {Widget? trailing, bool indent = false}) => InkWell(
        onTap: () => on(!v),
        borderRadius: BorderRadius.circular(6),
        hoverColor: const Color(0xFFF9FAFB),
        child: Padding(
          padding: EdgeInsets.fromLTRB(indent ? 24 : 10, 8, 10, 8),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(
              width: 15,
              height: 15,
              child: Checkbox(value: v, onChanged: (x) => on(x ?? false), materialTapTargetSize: MaterialTapTargetSize.shrinkWrap, visualDensity: VisualDensity.compact, activeColor: DS.primary),
            ),
            const SizedBox(width: 10),
            Flexible(child: Text(label, style: const TextStyle(fontSize: 13.5, color: Color(0xFF111827)))),
            if (trailing != null) ...[const SizedBox(width: 8), trailing],
          ]),
        ),
      );

  Widget _panel(DisplayPrefs prefs) => Material(
        color: Colors.white,
        elevation: 0,
        child: Container(
          constraints: BoxConstraints(minWidth: 240, maxWidth: 320, maxHeight: MediaQuery.of(context).size.height * .7),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFE5E7EB)),
            boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 24, offset: Offset(0, 8))],
          ),
          child: SingleChildScrollView(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(10, 8, 10, 3),
                child: Text('SECTIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF))),
              ),
              for (final g in widget.def.groups) ...[
                _check(prefs.item(g.group), g.label, (v) => prefs.set(g.group, v),
                    trailing: g.items.isEmpty
                        ? null
                        : GestureDetector(
                            onTap: () => setState(() => _openGroups.contains(g.group) ? _openGroups.remove(g.group) : _openGroups.add(g.group)),
                            child: Icon(_openGroups.contains(g.group) ? LucideIcons.chevronUp : LucideIcons.chevronDown, size: 12, color: const Color(0xFF9CA3AF)),
                          )),
                if (_openGroups.contains(g.group))
                  Container(
                    margin: const EdgeInsets.fromLTRB(4, 0, 4, 4),
                    decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(6)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      for (final (k, l) in g.items) _check(prefs.item(k), l, (v) => prefs.set(k, v), indent: true),
                    ]),
                  ),
              ],
              for (final (k, l) in widget.def.standalone) _check(prefs.item(k), l, (v) => prefs.set(k, v)),
            ]),
          ),
        ),
      );
}
