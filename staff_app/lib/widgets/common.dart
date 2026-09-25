import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/theme.dart';

/// Wide screens (Windows, tablets) get the sidebar layout and multi-column pages.
bool isWide(BuildContext c) => MediaQuery.sizeOf(c).width >= 900;

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? AppColors.red : AppColors.text, duration: const Duration(seconds: 3)));
}

Future<bool> confirm(BuildContext context, String title, String message, {String ok = 'Yes', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(style: danger ? FilledButton.styleFrom(backgroundColor: AppColors.red) : null, onPressed: () => Navigator.pop(c, true), child: Text(ok)),
      ],
    ),
  );
  return r == true;
}

/// White card with the app's border.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap});
  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      );
}

class SectionTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  final IconData? icon;
  const SectionTitle(this.text, {super.key, this.trailing, this.icon});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10, top: 4),
        child: Row(children: [
          if (icon != null) ...[Icon(icon, size: 18, color: AppColors.primary), const SizedBox(width: 8)],
          Expanded(child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
          ?trailing,
        ]),
      );
}

/// A number tile for dashboards and summaries.
class KpiTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String? sub;
  final Color color;
  final Color soft;
  final VoidCallback? onTap;
  const KpiTile({super.key, required this.icon, required this.label, required this.value, this.sub, this.color = AppColors.primary, this.soft = AppColors.primarySoft, this.onTap});
  @override
  Widget build(BuildContext context) => AppCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: LayoutBuilder(builder: (c, box) {
          final narrow = box.maxWidth < 200; // phone grid: icon above the text so labels show in full
          final icon = Container(width: narrow ? 34 : 44, height: narrow ? 34 : 44, decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(narrow ? 10 : 12)), child: Icon(this.icon, color: color, size: narrow ? 18 : 22));
          final text = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(label, maxLines: narrow ? 2 : 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.25)),
            const SizedBox(height: 2),
            FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
            if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ]);
          return narrow
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [icon, const SizedBox(height: 10), text])
              : Row(children: [icon, const SizedBox(width: 12), Expanded(child: text)]);
        }),
      );
}

/// Coloured label for order / payment / due statuses.
class StatusChip extends StatelessWidget {
  final String text;
  const StatusChip(this.text, {super.key});
  static (Color, Color) colors(String s) => switch (s.toLowerCase()) {
        'pending' || 'unpaid' || 'partial' => (AppColors.amber, AppColors.amberSoft),
        'in progress' || 'accepted' => (AppColors.blue, AppColors.blueSoft),
        'out for delivery' || 'on the way' => (AppColors.cyan, AppColors.cyanSoft),
        'delivered' || 'paid' || 'active' || 'synced' => (AppColors.green, AppColors.greenSoft),
        'canceled' || 'cancelled' || 'inactive' || 'suspended' || 'failed' || 'out of stock' => (AppColors.red, AppColors.redSoft),
        'offline' || 'waiting' => (AppColors.muted, const Color(0xFFF1F2F6)),
        _ => (AppColors.primary, AppColors.primarySoft),
      };
  @override
  Widget build(BuildContext context) {
    final (fg, bg) = colors(text);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3.5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 64, height: 64, decoration: const BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle), child: Icon(icon, color: AppColors.primary, size: 30)),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (message != null) ...[const SizedBox(height: 6), Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted))],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ]),
        ),
      );
}

class SearchBox extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;
  final Widget? trailing;
  final FocusNode? focusNode;
  final ValueChanged<String>? onSubmitted;
  const SearchBox({super.key, required this.hint, required this.onChanged, this.controller, this.trailing, this.focusNode, this.onSubmitted});
  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        focusNode: focusNode,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(hintText: hint, prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.faint), suffixIcon: trailing),
      );
}

/// Online / offline / "3 waiting" pill for the top bar — tap to open the Sync Center.
class SyncBadge extends StatelessWidget {
  final VoidCallback onTap;
  const SyncBadge({super.key, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final busy = s.phase != SyncPhase.idle;
    final (IconData icon, String text, Color fg, Color bg) = !s.online
        ? (Icons.cloud_off_rounded, s.pending > 0 ? 'Offline · ${s.pending}' : 'Offline', AppColors.red, AppColors.redSoft)
        : s.failed > 0
            ? (Icons.error_outline_rounded, '${s.failed} need a look', AppColors.red, AppColors.redSoft)
            : s.pending > 0
                ? (Icons.cloud_upload_outlined, '${s.pending} sending', AppColors.amber, AppColors.amberSoft)
                : (Icons.cloud_done_outlined, 'Synced', AppColors.green, AppColors.greenSoft);
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          busy ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: fg)) : Icon(icon, size: 16, color: fg),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(color: fg, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

/// Photo from the server, kept on the device so it still shows offline.
class NetImage extends StatefulWidget {
  final String? path;
  final double size;
  final double radius;
  final IconData placeholder;
  const NetImage(this.path, {super.key, this.size = 48, this.radius = 10, this.placeholder = Icons.inventory_2_outlined});
  @override
  State<NetImage> createState() => _NetImageState();
}

class _NetImageState extends State<NetImage> {
  File? _file;
  static Directory? _dir;
  static final Map<String, Future<File?>> _loading = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant NetImage old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path) _load();
  }

  Future<void> _load() async {
    final url = context.read<AppState>().api.fileUrl(widget.path);
    if (url == null) {
      if (mounted) setState(() => _file = null);
      return;
    }
    final f = await (_loading[url] ??= _fetch(url));
    if (mounted) setState(() => _file = f);
  }

  static Future<File?> _fetch(String url) async {
    try {
      _dir ??= Directory('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}images')..createSync(recursive: true);
    } catch (_) {
      return null; // no storage (tests) — show the placeholder
    }
    final f = File('${_dir!.path}${Platform.pathSeparator}${sha1.convert(url.codeUnits)}');
    if (f.existsSync() && f.lengthSync() > 0) return f;
    try {
      final r = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 20));
      if (r.statusCode == 200 && r.bodyBytes.isNotEmpty) {
        await f.writeAsBytes(r.bodyBytes, flush: true);
        return f;
      }
    } catch (_) {}
    _loading.remove(url); // try again later
    return null;
  }

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(widget.radius),
        child: SizedBox(
          width: widget.size,
          height: widget.size,
          child: _file != null
              ? Image.file(_file!, fit: BoxFit.cover, errorBuilder: (_, _, _) => _ph())
              : _ph(),
        ),
      );

  Widget _ph() => Container(color: const Color(0xFFF1F2F6), child: Icon(widget.placeholder, color: AppColors.faint, size: widget.size * .45));
}

/// Initials in a circle (or the photo when there is one).
class Avatar extends StatelessWidget {
  final String name;
  final String? photo;
  final double size;
  const Avatar(this.name, {super.key, this.photo, this.size = 40});
  @override
  Widget build(BuildContext context) {
    if (photo != null && photo!.isNotEmpty) return NetImage(photo, size: size, radius: size / 2, placeholder: Icons.person_outline);
    final initials = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0].toUpperCase()).join();
    return CircleAvatar(radius: size / 2, backgroundColor: AppColors.primarySoft, child: Text(initials.isEmpty ? '?' : initials, style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: size * .36)));
  }
}

/// Label on the left, value on the right.
class InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final Color? color;
  const InfoRow(this.label, this.value, {super.key, this.bold = false, this.color});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(label, style: const TextStyle(color: AppColors.muted))),
          const SizedBox(width: 12),
          Flexible(child: Align(alignment: Alignment.centerRight, child: Text(value, textAlign: TextAlign.right, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: color)))),
        ]),
      );
}

/// "Last updated 2 min ago · offline" line shown under lists.
class FreshnessNote extends StatelessWidget {
  const FreshnessNote({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Text(s.lastSync == null ? 'Not synced yet' : 'Updated ${ago(s.lastSync)}${s.online ? '' : ' · offline — showing saved data'}',
          textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
    );
  }
}

/// Page padding + max width so pages read well on a big Windows screen.
class PageBody extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  const PageBody({super.key, required this.child, this.maxWidth = 1280});
  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child),
      );
}
