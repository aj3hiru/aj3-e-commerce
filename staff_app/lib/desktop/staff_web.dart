import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/display_options.dart';
import '../features/staff/staff_screen.dart' show editStaff, staffRoles;
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

/// "Users Manager" as on the website: number cards, search + role filter, users table.
class StaffWeb extends StatefulWidget {
  const StaffWeb({super.key});
  @override
  State<StaffWeb> createState() => _StaffWebState();
}

const _avatarColors = [Color(0xFFBE185D), Color(0xFF1D4ED8), Color(0xFFA16207), Color(0xFF3730A3), Color(0xFF047857), Color(0xFF7C3AED), Color(0xFFB91C1C)];

class _StaffWebState extends State<StaffWeb> {
  static final _def = displayDefs['user_manager2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '';
  String _role = 'all';
  String _card = 'all';

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final all = s.list('staff');
    final q = _q.trim().toLowerCase();
    final list = all.where((u) {
      if (_role != 'all' && u['role'] != _role) return false;
      if (_card == 'admins' && u['role'] != 'admin') return false;
      if (_card == 'active' && u['status'] != 'active') return false;
      if (_card == 'off' && u['status'] == 'active') return false;
      return q.isEmpty || '${u['name']} ${u['username']} ${u['email'] ?? ''} ${u['phone'] ?? ''}'.toLowerCase().contains(q);
    }).toList();

    Widget roleBadge(Map u) => switch (u['role']) {
          'admin' => const WebBadge('Admin', color: W.primary, bg: Color(0xFFF3E8FF)),
          'delivery_agent' => const WebBadge('Delivery Agent', color: Color(0xFF047857), bg: Color(0xFFD1FAE5)),
          'cashier' => const WebBadge('Billing / Cashier', color: Color(0xFFB45309), bg: Color(0xFFFEF3C7)),
          _ => WebBadge('${u['roleLabel']}', color: W.blue, bg: W.blueSoft),
        };
    bool col(String k) => on('u2-table', k);

    return WebPage(
      title: 'Users Manager',
      subtitle: 'Staff accounts, roles and what each person can do',
      onRefresh: () => s.syncNow(only: const ['staff', 'agents']),
      actions: [DisplayOptionsButton(_def), WebButton('Add Staff', icon: LucideIcons.plus, color: const Color(0xFFA21C87), onPressed: () => editStaff(context, null))],
      children: [
        ...webCardsRow([
          if (on('u2-cards', 'u2-k-total')) WebMetric(icon: LucideIcons.users, color: W.blue, value: '${all.length}', label: 'Total Users', selected: _card == 'all', onTap: () => setState(() => _card = 'all')),
          if (on('u2-cards', 'u2-k-admins')) WebMetric(icon: LucideIcons.shieldCheck, color: W.primary, value: '${all.where((u) => u['role'] == 'admin').length}', label: 'Admins', selected: _card == 'admins', onTap: () => setState(() => _card = 'admins')),
          if (on('u2-cards', 'u2-k-active')) WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF16A34A), value: '${all.where((u) => u['status'] == 'active').length}', label: 'Active', selected: _card == 'active', onTap: () => setState(() => _card = 'active')),
          if (on('u2-cards', 'u2-k-suspended')) WebMetric(icon: LucideIcons.userX, color: const Color(0xFFD97706), value: '${all.where((u) => u['status'] != 'active').length}', label: 'Suspended / Pending', selected: _card == 'off', onTap: () => setState(() => _card = 'off')),
        ]),
        ...webFilterCard([WebSelect<String>(icon: LucideIcons.shieldCheck, label: 'Role', value: _role, options: [('all', 'All roles'), for (final (id, l) in staffRoles) (id, l)], onChanged: (v) => setState(() => _role = v))]),
        if (on('u2-table'))
          WebList(
            rows: list,
            total: all.length,
            rowHeight: 62,
            filtersOn: _q.isNotEmpty || _role != 'all' || _card != 'all',
            onClearFilters: () => setState(() {
              _q = '';
              _role = _card = 'all';
            }),
            search: col('u2-t-search') ? WebSearch(width: 240, hint: 'Search name or email...', onChanged: (v) => setState(() => _q = v)) : null,
            empty: 'No staff yet.',
            onTap: (u) => toInt(u['id']) == toInt(s.user?['id']) ? null : editStaff(context, u),
            cols: [
              if (col('u2-c-user'))
                ListCol(const WebCol('User', flex: 3), (u) {
                  final me = toInt(u['id']) == toInt(s.user?['id']);
                  final name = '${u['name']}';
                  return Row(children: [
                    u['avatar'] != null
                        ? Avatar(name, photo: u['avatar'], size: 36)
                        : Container(
                            width: 36,
                            height: 36,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: _avatarColors[toInt(u['id']) % _avatarColors.length], shape: BoxShape.circle),
                            child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                          ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text.rich(TextSpan(children: [
                          TextSpan(text: name, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: W.g900)),
                          if (me) const TextSpan(text: '  (you)', style: TextStyle(fontSize: 12, color: W.g500)),
                        ])),
                        Text('@${u['username']}${u['phone'] != null ? ' · ${u['phone']}' : ''}${u['email'] != null ? ' · ${u['email']}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: W.g500)),
                      ]),
                    ),
                  ]);
                }, sort: (u) => lower(u['name'])),
              if (col('u2-c-role')) ListCol(const WebCol('Role', flex: 1.2), (u) => Align(alignment: Alignment.centerLeft, child: roleBadge(u)), sort: (u) => lower(u['roleLabel'])),
              if (col('u2-c-status'))
                ListCol(const WebCol('Status', flex: 1), (u) => Align(alignment: Alignment.centerLeft, child: WebPill(u['status'] == 'active' ? 'Active' : (u['status'] == 'suspended' ? 'Suspended' : '${u['status']}'), color: u['status'] == 'active' ? W.green : W.grey)),
                    sort: (u) => lower(u['status'])),
              if (col('u2-c-permissions'))
                ListCol(const WebCol('Permissions', flex: 1.1), (u) => Text(u['role'] == 'admin' ? 'Full access' : '${u['permCount'] ?? 0} permissions', style: const TextStyle(fontSize: 13, color: W.g700)), sort: (u) => toDouble(u['permCount'])),
              if (col('u2-c-actions'))
                ListCol(const WebCol('Actions', width: 90), (u) => Row(children: [
                      if (toInt(u['id']) != toInt(s.user?['id']) && (s.perms.staffEdit || s.perms.staff)) WebIconAction(LucideIcons.pencil, color: W.blue, soft: true, tooltip: 'Edit', onTap: () => editStaff(context, u)),
                    ])),
            ],
          ),
      ],
    );
  }
}
