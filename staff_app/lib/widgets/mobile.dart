import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/theme.dart';
import 'common.dart';

/// Phone design pieces (delivery-app style): pastel stat tiles, pill tabs,
/// photo order cards, a floating bottom bar, tinted info rows.

/// Soft-coloured stat tile: icon on top, label, big number.
class PastelTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color tint; // background
  final Color ink; // icon colour
  final VoidCallback? onTap;
  const PastelTile({super.key, required this.icon, required this.label, required this.value, required this.tint, required this.ink, this.onTap});
  @override
  Widget build(BuildContext context) => Material(
        color: tint,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, color: ink, size: 30),
              const SizedBox(height: 10),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13.5, color: AppColors.text, fontWeight: FontWeight.w500)),
              const SizedBox(height: 4),
              FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: AppColors.text, letterSpacing: -.3))),
            ]),
          ),
        ),
      );
}

/// Pastel palette for tiles, in order.
const pastel = [
  (AppColors.mint, Color(0xFF12A37F)),
  (AppColors.cream, Color(0xFFE09A00)),
  (AppColors.blush, Color(0xFFE0457B)),
  (AppColors.sky, Color(0xFF3B7BE0)),
  (AppColors.lilac, Color(0xFF7C5CE0)),
  (Color(0xFFE9F8FB), Color(0xFF0E9FB8)),
];

/// Pill tabs: outlined, the selected one filled with the brand colour.
class PillTabs extends StatelessWidget {
  final List<(String, String)> tabs; // (key, label)
  final String selected;
  final ValueChanged<String> onSelect;
  final Map<String, int> counts;
  const PillTabs({super.key, required this.tabs, required this.selected, required this.onSelect, this.counts = const {}});
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 42,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: tabs.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (c, i) {
            final (key, label) = tabs[i];
            final on = key == selected;
            final n = counts[key];
            return Material(
              color: on ? AppColors.primary : Colors.white,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => onSelect(key),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: on ? AppColors.primary : const Color(0xFFE3E3EA))),
                  child: Text(n == null ? label : '$label  $n', style: TextStyle(color: on ? Colors.white : const Color(0xFF6B6B7B), fontWeight: FontWeight.w600, fontSize: 14)),
                ),
              ),
            );
          },
        ),
      );
}

/// Line with a small coloured icon (address / time lines on cards).
class IconLine extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color? color;
  const IconLine(this.icon, this.text, {super.key, this.color});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(children: [
          Icon(icon, size: 14, color: color ?? AppColors.primary),
          const SizedBox(width: 6),
          Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: AppColors.muted))),
        ]),
      );
}

/// Order card with the first item's photo, address, time and (optionally) actions.
class PhotoOrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final VoidCallback? onTap;
  final List<Widget> actions;
  final Widget? badge;
  const PhotoOrderCard({super.key, required this.order, this.onTap, this.actions = const [], this.badge});
  @override
  Widget build(BuildContext context) {
    final s = context.read<AppState>();
    final items = ((order['items'] as List?) ?? const []).cast<Map>();
    final first = items.isEmpty ? null : items.first;
    final product = first == null ? null : s.list('products').where((p) => toInt(p['id']) == toInt(first['productId'])).firstOrNull;
    final title = first == null ? '${order['number']}' : '${first['name']}${items.length > 1 ? ' +${items.length - 1} more' : ''}';
    final place = '${order['address'] ?? order['customer'] ?? ''}'.split('\n').where((l) => l.trim().isNotEmpty).lastOrNull ?? '';
    return AppCard(
      padding: const EdgeInsets.all(10),
      onTap: onTap,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          decoration: BoxDecoration(color: const Color(0xFFF4F4F7), borderRadius: BorderRadius.circular(12)),
          child: NetImage(product?['image'], size: 92, radius: 12, placeholder: Icons.shopping_bag_outlined),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600))),
              ?badge,
            ]),
            IconLine(Icons.location_on_outlined, place.isEmpty ? '${order['customer']}' : place),
            IconLine(Icons.schedule_rounded, '${order['number']} · ${dateTime(order['createdAt'])}'),
            const SizedBox(height: 6),
            Row(children: [
              Text(money(order['total']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const Spacer(),
              ...actions,
            ]),
          ]),
        ),
      ]),
    );
  }
}

/// Small solid button used on cards (Accept / Reject / Start…).
class TinyButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback? onTap;
  const TinyButton(this.label, {super.key, required this.color, this.onTap});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 6),
        child: Material(
          color: color,
          borderRadius: BorderRadius.circular(7),
          child: InkWell(
            borderRadius: BorderRadius.circular(7),
            onTap: onTap,
            child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7), child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13))),
          ),
        ),
      );
}

/// "Address / Delivery time / Order#" rows with a tinted circle icon.
class TintedInfo extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final Color tint;
  const TintedInfo({super.key, required this.icon, required this.label, required this.value, required this.color, required this.tint});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          Container(width: 44, height: 44, decoration: BoxDecoration(color: tint, shape: BoxShape.circle), child: Icon(icon, color: color, size: 21)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w500)),
            ]),
          ),
        ]),
      );
}

/// Black header card: photo, name, role and round chat / call buttons.
class ContactCard extends StatelessWidget {
  final String name;
  final String subtitle;
  final String? photo;
  final VoidCallback? onChat;
  final VoidCallback? onCall;
  const ContactCard({super.key, required this.name, required this.subtitle, this.photo, this.onChat, this.onCall});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
        decoration: BoxDecoration(color: const Color(0xFF111114), borderRadius: BorderRadius.circular(22)),
        child: Row(children: [
          Container(padding: const EdgeInsets.all(2), decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Avatar(name, photo: photo, size: 54)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(subtitle, style: const TextStyle(color: Color(0xFFB9B9C3), fontSize: 13)),
            ]),
          ),
          if (onChat != null) _round(Icons.chat_bubble_rounded, onChat!),
          if (onCall != null) ...[const SizedBox(width: 10), _round(Icons.call_rounded, onCall!)],
        ]),
      );

  Widget _round(IconData icon, VoidCallback onTap) => Material(
        color: AppColors.primary,
        shape: const CircleBorder(),
        child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Padding(padding: const EdgeInsets.all(12), child: Icon(icon, color: Colors.white, size: 21))),
      );
}

/// Floating bottom bar: the active item is a filled pill with its label, others are icons.
class FloatingNavBar extends StatelessWidget {
  final List<(String, IconData, IconData, String)> items; // id, icon, activeIcon, label
  final String current;
  final ValueChanged<String> onTap;
  final Map<String, int> badges;
  const FloatingNavBar({super.key, required this.items, required this.current, required this.onTap, this.badges = const {}});
  @override
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: Container(
          margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26), boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 24, offset: Offset(0, 8))]),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
            for (final (id, icon, active, label) in items)
              id == current
                  ? Material(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(18),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: () => onTap(id),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(active, color: Colors.white, size: 21), const SizedBox(width: 7), Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))]),
                        ),
                      ),
                    )
                  : IconButton(
                      onPressed: () => onTap(id),
                      icon: Badge(isLabelVisible: (badges[id] ?? 0) > 0, label: Text('${badges[id]}'), child: Icon(icon, color: AppColors.primary.withValues(alpha: .75), size: 25)),
                    ),
          ]),
        ),
      );
}

/// The phone shell's drawer is opened from each section's ☰ button.
final shellScaffoldKey = GlobalKey<ScaffoldState>();

/// ☰ button for a section's top bar on phones (null on Windows / tablets, and on pushed pages,
/// which keep their back arrow).
Widget? menuButton(BuildContext context) => isWide(context) || Navigator.of(context).canPop()
    ? null
    : IconButton(icon: const Icon(Icons.menu_rounded, size: 26), onPressed: () => shellScaffoldKey.currentState?.openDrawer());
