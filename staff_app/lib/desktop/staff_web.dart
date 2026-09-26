import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../features/staff/staff_screen.dart' show editStaff, staffRoles;
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "Users Manager" as on the website: number cards, search + role filter, users table.
class StaffWeb extends StatefulWidget {
  const StaffWeb({super.key});
  @override
  State<StaffWeb> createState() => _StaffWebState();
}

const _avatarColors = [Color(0xFFBE185D), Color(0xFF1D4ED8), Color(0xFFA16207), Color(0xFF3730A3), Color(0xFF047857), Color(0xFF7C3AED), Color(0xFFB91C1C)];

class _StaffWebState extends State<StaffWeb> {
  String _q = '';
  String _role = 'all';
  String _card = 'all';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
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

    return WebPage(
      title: 'Users Manager',
      subtitle: 'Staff accounts, roles and what each person can do',
      onRefresh: () => s.syncNow(only: const ['staff', 'agents']),
      actions: [WebButton('Add Staff', icon: LucideIcons.plus, color: const Color(0xFFA21C87), onPressed: () => editStaff(context, null))],
      children: [
        const SizedBox(height: 20),
        WebGrid(children: [
          WebMetric(icon: LucideIcons.users, color: W.blue, value: '${all.length}', label: 'Total Users', selected: _card == 'all', onTap: () => setState(() => _card = 'all')),
          WebMetric(icon: LucideIcons.shieldCheck, color: W.primary, value: '${all.where((u) => u['role'] == 'admin').length}', label: 'Admins', selected: _card == 'admins', onTap: () => setState(() => _card = 'admins')),
          WebMetric(icon: LucideIcons.circleCheck, color: const Color(0xFF16A34A), value: '${all.where((u) => u['status'] == 'active').length}', label: 'Active', selected: _card == 'active', onTap: () => setState(() => _card = 'active')),
          WebMetric(icon: LucideIcons.user, color: const Color(0xFFD97706), value: '${all.where((u) => u['status'] != 'active').length}', label: 'Suspended / Pending', selected: _card == 'off', onTap: () => setState(() => _card = 'off')),
        ]),
        const SizedBox(height: 20),
        WebCard(
          padding: const EdgeInsets.all(28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 12, runSpacing: 10, children: [
              WebSearch(width: 240, hint: 'Search name or email...', onChanged: (v) => setState(() => _q = v)),
              WebSelect<String>(width: 200, value: _role, options: [('all', 'Role:  All'), for (final (id, l) in staffRoles) (id, 'Role:  $l')], onChanged: (v) => setState(() => _role = v)),
            ]),
            const SizedBox(height: 16),
            WebTable(
              bordered: true,
              rowHeight: 62,
              cols: const [WebCol('User', flex: 3), WebCol('Role', flex: 1.2), WebCol('Status', flex: 1), WebCol('Mobile', flex: 1.1), WebCol('Actions', width: 110)],
              rows: [
                for (final u in list)
                  () {
                    final me = toInt(u['id']) == toInt(s.user?['id']);
                    final name = '${u['name']}';
                    return <Widget>[
                      Row(children: [
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
                              TextSpan(text: name, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w500, color: W.g900)),
                              if (me) const TextSpan(text: '  (you)', style: TextStyle(fontSize: 13, color: W.g500)),
                            ])),
                            Text('@${u['username']}${u['phone'] != null ? ' · ${u['phone']}' : ''}${u['email'] != null ? ' · ${u['email']}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g500)),
                          ]),
                        ),
                      ]),
                      Align(alignment: Alignment.centerLeft, child: roleBadge(u)),
                      WebPill(u['status'] == 'active' ? 'Active' : (u['status'] == 'suspended' ? 'Suspended' : '${u['status']}'), color: u['status'] == 'active' ? W.green : W.grey),
                      Text('${u['phone'] ?? '—'}', style: const TextStyle(fontSize: 15, color: W.g700)),
                      Row(children: [
                        if (!me && (s.perms.staffEdit || s.perms.staff)) WebIconAction(LucideIcons.pencil, color: W.blue, soft: true, tooltip: 'Edit', onTap: () => editStaff(context, u)),
                      ]),
                    ];
                  }(),
              ],
            ),
          ]),
        ),
      ],
    );
  }
}
