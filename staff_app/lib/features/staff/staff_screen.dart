import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';

const staffRoles = [
  ('admin', 'Admin'),
  ('manager', 'Store Manager'),
  ('order_manager', 'Order Manager'),
  ('delivery_agent', 'Delivery Agent'),
  ('cashier', 'Billing / Cashier'),
  ('catalog_manager', 'Product Manager'),
  ('marketing', 'Marketing'),
  ('editor', 'Editor (blog)'),
  ('author', 'Author (blog)'),
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
  final result = await showDialog<String>(
    context: context,
    builder: (d) => StatefulBuilder(
      builder: (d, set) => AlertDialog(
        title: Text(u == null ? 'Add staff member' : 'Edit ${u['name']}'),
        content: SizedBox(
          width: 460,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Expanded(child: TextField(controller: first, decoration: const InputDecoration(labelText: 'First name'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: last, decoration: const InputDecoration(labelText: 'Last name'))),
              ]),
              const SizedBox(height: 10),
              TextField(controller: username, decoration: const InputDecoration(labelText: 'Username *')),
              const SizedBox(height: 10),
              TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email *')),
              const SizedBox(height: 10),
              TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile (can log in with it)')),
              const SizedBox(height: 10),
              TextField(controller: password, obscureText: true, decoration: InputDecoration(labelText: u == null ? 'Password * (min 6)' : 'New password (leave blank to keep)')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: role,
                decoration: InputDecoration(labelText: 'Role', helperText: canRole ? null : "You can't change roles"),
                items: [for (final (id, label) in staffRoles) if (id != 'admin' || s.perms.isAdmin || role == 'admin') DropdownMenuItem(value: id, child: Text(label))],
                onChanged: canRole ? (v) => set(() => role = v ?? role) : null,
              ),
            ]),
          ),
        ),
        actions: [
          if (u != null && s.perms.has('users', 'suspend'))
            TextButton(
              style: TextButton.styleFrom(foregroundColor: u['status'] == 'active' ? AppColors.red : AppColors.green),
              onPressed: () => Navigator.pop(d, u['status'] == 'active' ? 'suspend' : 'activate'),
              child: Text(u['status'] == 'active' ? 'Suspend' : 'Activate'),
            ),
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(d, 'save'), child: const Text('Save')),
        ],
      ),
    ),
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
