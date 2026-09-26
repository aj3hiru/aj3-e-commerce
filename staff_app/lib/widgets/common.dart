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

/// White card: soft border, gentle shadow, 16 px corners; tappable when [onTap] is set.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.color});
  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(color: color ?? Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border), boxShadow: AppColors.shadow),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(16),
          clipBehavior: Clip.antiAlias,
          child: InkWell(onTap: onTap, hoverColor: AppColors.primarySoft.withValues(alpha: .35), child: Padding(padding: padding, child: child)),
        ),
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
  final Color? _color;
  final Color? _soft;
  Color get color => _color ?? AppColors.primary;
  Color get soft => _soft ?? AppColors.primarySoft;
  final VoidCallback? onTap;
  /// Change vs a previous period, e.g. +12.5 (%). Shown as a small green / red chip.
  final double? trend;
  const KpiTile({super.key, required this.icon, required this.label, required this.value, this.sub, Color? color, Color? soft, this.onTap, this.trend}) : _color = color, _soft = soft;
  @override
  Widget build(BuildContext context) => AppCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: LayoutBuilder(builder: (c, box) {
          final narrow = box.maxWidth < 200; // phone grid: icon above the text so labels show in full
          final icon = Container(width: narrow ? 34 : 44, height: narrow ? 34 : 44, decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(narrow ? 10 : 12)), child: Icon(this.icon, color: color, size: narrow ? 18 : 22));
          final t = trend;
          final trendChip = t == null || t.isNaN || t.isInfinite
              ? null
              : Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: t >= 0 ? AppColors.greenSoft : AppColors.redSoft, borderRadius: BorderRadius.circular(20)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(t >= 0 ? Icons.trending_up_rounded : Icons.trending_down_rounded, size: 13, color: t >= 0 ? AppColors.green : AppColors.red),
                    const SizedBox(width: 3),
                    Text('${t.abs().toStringAsFixed(t.abs() >= 100 ? 0 : 1)}%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: t >= 0 ? AppColors.green : AppColors.red)),
                  ]),
                );
          final text = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(label, maxLines: narrow ? 2 : 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.25, fontWeight: FontWeight.w500)),
            const SizedBox(height: 3),
            FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: -.3))),
            if (sub != null) ...[const SizedBox(height: 1), Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.muted))],
          ]);
          final go = onTap == null ? null : const Icon(Icons.arrow_forward_ios_rounded, size: 13, color: AppColors.faint);
          return narrow
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Row(children: [icon, const Spacer(), ?trendChip, if (trendChip == null) ?go]),
                  const SizedBox(height: 10),
                  text,
                ])
              : Row(children: [icon, const SizedBox(width: 12), Expanded(child: text), if (trendChip != null) ...[const SizedBox(width: 6), trendChip], if (go != null) ...[const SizedBox(width: 6), go]]);
        }),
      );
}

/// Coloured label for order / payment / due statuses.
class StatusChip extends StatelessWidget {
  final String text;
  const StatusChip(this.text, {super.key});
  static (Color, Color) colors(String s) => s.toLowerCase().startsWith('due') ? (AppColors.red, AppColors.redSoft) : s.toLowerCase().startsWith('collect') ? (AppColors.amber, AppColors.amberSoft) : switch (s.toLowerCase()) {
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
            Container(width: 64, height: 64, decoration: BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle), child: Icon(icon, color: AppColors.primary, size: 30)),
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


/// Big gradient header for the home screen.
class HeroHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget? trailing;
  final Widget? bottom;
  const HeroHeader({super.key, required this.title, required this.subtitle, this.trailing, this.bottom});
  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(gradient: AppColors.heroGradient, borderRadius: BorderRadius.circular(20), boxShadow: const [BoxShadow(color: Color(0x1F4F46E5), blurRadius: 16, offset: Offset(0, 6))]),
        child: Stack(children: [
          // soft circles for depth
          Positioned(right: -30, top: -40, child: Container(width: 160, height: 160, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: .08)))),
          Positioned(right: 70, bottom: -60, child: Container(width: 120, height: 120, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: .06)))),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -.3)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: TextStyle(color: Colors.white.withValues(alpha: .82), fontSize: 13.5)),
                  ]),
                ),
                ?trailing,
              ]),
              if (bottom != null) ...[const SizedBox(height: 18), bottom!],
            ]),
          ),
        ]),
      );
}

/// Round quick-action button (icon in a tinted circle + label).
class QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? _color;
  final Color? _soft;
  Color get color => _color ?? AppColors.primary;
  Color get soft => _soft ?? AppColors.primarySoft;
  final VoidCallback onTap;
  const QuickAction({super.key, required this.icon, required this.label, required this.onTap, Color? color, Color? soft}) : _color = color, _soft = soft;
  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 52, height: 52, decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: color, size: 24)),
            const SizedBox(height: 7),
            Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.2)),
          ]),
        ),
      );
}

/// Card with a title row and an optional "View all" link.
class SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final VoidCallback? onViewAll;
  final Widget child;
  final EdgeInsetsGeometry padding;
  const SectionCard({super.key, required this.title, required this.icon, required this.child, this.onViewAll, this.padding = const EdgeInsets.fromLTRB(16, 14, 16, 12)});
  @override
  Widget build(BuildContext context) => AppCard(
        padding: padding,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 30, height: 30, decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(9)), child: Icon(icon, size: 17, color: AppColors.primary)),
            const SizedBox(width: 10),
            Expanded(child: Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700))),
            if (onViewAll != null) TextButton(onPressed: onViewAll, style: TextButton.styleFrom(visualDensity: VisualDensity.compact), child: const Text('View all')),
          ]),
          const SizedBox(height: 10),
          child,
        ]),
      );
}

/// Small numbered badge (e.g. new orders on a menu item).
class CountBadge extends StatelessWidget {
  final int count;
  final Color color;
  const CountBadge(this.count, {super.key, this.color = AppColors.red});
  @override
  Widget build(BuildContext context) => count <= 0
      ? const SizedBox.shrink()
      : Container(
          constraints: const BoxConstraints(minWidth: 20),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(20)),
          child: Text(count > 99 ? '99+' : '$count', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
        );
}
