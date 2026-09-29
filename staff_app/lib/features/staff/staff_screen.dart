import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../../ds/ds.dart';

const staffRoles = [
  ('admin', 'Admin'),
  ('manager', 'Store Manager'),
  ('order_manager', 'Order Manager'),
  ('delivery_agent', 'Delivery Agent'),
  ('cashier', 'Billing / Cashier'),
  ('catalog_manager', 'Product Manager'),
  ('marketing', 'Marketing'),
];

/// Staff & roles: add people, change their role, suspend / re-activate.
class StaffScreen extends StatefulWidget {
  const StaffScreen({super.key});
  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final q = _q.trim().toLowerCase();
    final list = s.list('staff').where((u) => q.isEmpty || '${u['name']} ${u['username']} ${u['phone'] ?? ''} ${u['roleLabel']}'.toLowerCase().contains(q)).toList();
    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('Staff'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => editStaff(context, null), icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Add staff')),
      body: PageBody(
        maxWidth: 1000,
        child: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 6), child: SearchBox(hint: 'Name, username, mobile or role', onChanged: (v) => setState(() => _q = v))),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => s.syncNow(only: const ['staff']),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 90),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (c, i) {
                  final u = list[i];
                  final me = toInt(u['id']) == toInt(s.user?['id']);
                  return AppCard(
                    padding: const EdgeInsets.all(12),
                    onTap: me ? null : () => editStaff(context, u),
                    child: Row(children: [
                      Avatar('${u['name']}', photo: u['avatar']),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${u['name']}${me ? ' (you)' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('@${u['username']}${u['phone'] != null ? ' · ${u['phone']}' : ''}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                        ]),
                      ),
                      StatusChip('${u['roleLabel']}'),
                      if (u['status'] != 'active') Padding(padding: const EdgeInsets.only(left: 6), child: StatusChip(u['status'] == 'suspended' ? 'Suspended' : '${u['status']}')),
                      if (u['phone'] != null) IconButton(icon: const Icon(Icons.call_outlined), onPressed: () => launchUrl(Uri.parse('tel:${u['phone']}'))),
                    ]),
                  );
                },
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Add (u == null) or edit a staff member. Changing the role gives them that role's standard permissions.
Future<void> editStaff(BuildContext context, Map<String, dynamic>? u) async {
  final s = context.read<AppState>();
  final names = '${u?['name'] ?? ''}'.split(' ');
  final first = TextEditingController(text: u == null ? '' : names.first);
  final last = TextEditingController(text: u == null ? '' : names.skip(1).join(' '));
  final username = TextEditingController(text: u?['username'] ?? '');
  final email = TextEditingController(text: u?['email'] ?? '');
  final phone = TextEditingController(text: u?['phone'] ?? '');
  final password = TextEditingController();
  var role = (u?['role'] as String?) ?? 'cashier';
  final canRole = s.perms.changeRoles;
  final result = await showAppDialog<String>(
    context,
    title: u == null ? 'Add staff member' : 'Edit ${u['name']}',
    icon: Icons.badge_outlined,
    width: 520,
    builder: (d) => StatefulBuilder(
      builder: (d, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: AppField(controller: first, label: 'First name', autofocus: true)),
          const SizedBox(width: 10),
          Expanded(child: AppField(controller: last, label: 'Last name')),
        ]),
        const AppGap(),
        AppField(controller: username, label: 'Username', required: true),
        const AppGap(),
        AppField(controller: email, label: 'Email', required: true, keyboardType: TextInputType.emailAddress),
        const AppGap(),
        AppField(controller: phone, label: 'Mobile', helper: 'Can log in with it', keyboardType: TextInputType.phone),
        const AppGap(),
        AppField(controller: password, obscure: true, label: u == null ? 'Password' : 'New password', required: u == null, helper: u == null ? 'Min 6 characters' : 'Leave blank to keep'),
        const AppGap(),
        AppSelect<String>(
          label: 'Role',
          helper: canRole ? null : "You can't change roles",
          value: role,
          options: [for (final (id, label) in staffRoles) if (id != 'admin' || s.perms.isAdmin || role == 'admin') (id, label), if (!staffRoles.any((r) => r.$1 == role)) (role, 'Old role ($role) — pick a new one')],
          onChanged: canRole ? (v) => set(() => role = v) : null,
        ),
      ]),
    ),
    actions: [
      if (u != null && s.perms.has('users', 'suspend'))
        DAction(u['status'] == 'active' ? 'Suspend' : 'Activate', variant: u['status'] == 'active' ? DVariant.danger : DVariant.success,
            onPressed: () async => popDialog(context, u['status'] == 'active' ? 'suspend' : 'activate')),
      const DAction.cancel(),
      DAction('Save', primary: true, onPressed: () async => popDialog(context, 'save')),
    ],
  );
  if (result == null || !context.mounted) return;

  if (result == 'suspend' || result == 'activate') {
    final status = result == 'suspend' ? 'suspended' : 'active';
    if (result == 'suspend' && !await confirm(context, 'Suspend ${u!['name']}?', 'They will be logged out and cannot log in until re-activated.', ok: 'Suspend', danger: true)) return;
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'PATCH', path: '/api/users/${u!['id']}', body: {'status': status}, label: '${result == 'suspend' ? 'Suspend' : 'Activate'} ${u['name']}',
        effect: {'kind': 'staff', 'id': u['id'], 'fields': {'status': status}}, refresh: const ['staff', 'agents']));
    if (context.mounted) toast(context, r.ok ? 'Done.' : r.message, error: !r.ok && r.outcome != ApiOutcome.offline);
    return;
  }

  if (username.text.trim().isEmpty || email.text.trim().isEmpty || (u == null && password.text.length < 6)) {
    toast(context, 'Username, email${u == null ? ' and a password (min 6)' : ''} are required.', error: true);
    return;
  }
  final body = {
    'username': username.text.trim(), 'email': email.text.trim(), 'firstName': first.text.trim(), 'lastName': last.text.trim(), 'phone': phone.text.trim(), 'role': role,
    if (password.text.isNotEmpty) ...{'password': password.text, 'confirmPassword': password.text, 'confirm_password': password.text},
  };
  final r = await s.sendNow(OutboxItem(
    id: newId(), method: u == null ? 'POST' : 'PATCH', path: u == null ? '/api/users' : '/api/users/${u['id']}', body: body,
    label: u == null ? 'New staff: ${body['username']}' : 'Edit staff: ${body['username']}', refresh: const ['staff', 'agents'],
  ), queueIfOffline: false);
  if (!context.mounted) return;
  toast(context, r.ok ? 'Saved.' : r.outcome == ApiOutcome.offline ? 'Adding or editing staff needs the internet.' : r.message, error: !r.ok);
}
