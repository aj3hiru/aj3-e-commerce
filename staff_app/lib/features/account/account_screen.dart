import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'sync_center.dart';
import 'update.dart';

/// My profile: details, password, sync, app version, log out.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final u = s.user ?? {};
    return Scaffold(
      appBar: AppBar(title: const Text('Profile'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => _sync(context)))]),
      body: PageBody(
        maxWidth: 820,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          AppCard(
            child: Row(children: [
              Avatar(u['name'] ?? '', photo: u['avatar'], size: 60),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u['name'] ?? '', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  StatusChip(u['roleLabel'] ?? ''),
                  const SizedBox(height: 6),
                  Text([u['phone'], u['email']].where((x) => x != null && '$x'.isNotEmpty).join(' · '), style: const TextStyle(color: AppColors.muted)),
                  if (u['since'] != null) Text('Staff since ${dateShort(u['since'])}', style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Edit my details'), trailing: const Icon(Icons.chevron_right), onTap: () => _editDetails(context)),
              const Divider(),
              ListTile(leading: const Icon(Icons.lock_reset_rounded), title: const Text('Change password'), trailing: const Icon(Icons.chevron_right), onTap: () => _changePassword(context)),
              const Divider(),
              ListTile(leading: const Icon(Icons.sync_rounded), title: const Text('Sync'), subtitle: Text(s.pending > 0 ? '${s.pending} change(s) waiting' : 'All saved'), trailing: const Icon(Icons.chevron_right), onTap: () => _sync(context)),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.system_update_outlined),
                title: const Text('App version'),
                subtitle: Text(s.appVersion.isEmpty ? '—' : 'v${s.appVersion}${s.release?['version'] != null ? ' · latest v${s.release!['version']}' : ''}'),
                trailing: s.release != null ? TextButton(onPressed: () => openUpdate(context, s.release!), child: const Text('Download')) : null,
              ),
            ]),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.red),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Log out'),
            onPressed: () async {
              final msg = s.pending > 0
                  ? '${s.pending} change(s) have not reached the server yet. If you log out now they will be LOST. Connect to the internet first to send them.'
                  : 'You can log in again any time.';
              if (await confirm(context, 'Log out?', msg, ok: 'Log out', danger: s.pending > 0)) s.logout();
            },
          ),
        ]),
      ),
    );
  }

  void _sync(BuildContext context) => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()));

  Future<void> _editDetails(BuildContext context) async {
    final s = context.read<AppState>();
    final u = s.user ?? {};
    final first = TextEditingController(text: (u['name'] as String? ?? '').split(' ').first);
    final last = TextEditingController(text: (u['name'] as String? ?? '').split(' ').skip(1).join(' '));
    final phone = TextEditingController(text: u['phone'] ?? '');
    final email = TextEditingController(text: u['email'] ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('My details'),
        content: SizedBox(
          width: 420,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: first, decoration: const InputDecoration(labelText: 'First name')),
            const SizedBox(height: 10),
            TextField(controller: last, decoration: const InputDecoration(labelText: 'Last name')),
            const SizedBox(height: 10),
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile')),
            const SizedBox(height: 10),
            TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save'))],
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/users/me', label: 'Update my details', body: {
      'username': u['username'], 'email': email.text.trim(), 'firstName': first.text.trim(), 'lastName': last.text.trim(), 'phone': phone.text.trim(),
    }), queueIfOffline: false);
    if (!context.mounted) return;
    if (r.ok) {
      await s.refreshMe();
      if (context.mounted) toast(context, 'Saved.');
    } else {
      toast(context, r.message, error: true);
    }
  }

  Future<void> _changePassword(BuildContext context) async {
    final s = context.read<AppState>();
    final cur = TextEditingController(), next = TextEditingController(), again = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Change password'),
        content: SizedBox(
          width: 420,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: cur, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
            const SizedBox(height: 10),
            TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password (min 6)')),
            const SizedBox(height: 10),
            TextField(controller: again, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm new password')),
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Update'))],
      ),
    );
    if (ok != true || !context.mounted) return;
    if (next.text.length < 6 || next.text != again.text) {
      toast(context, 'New passwords must match and be at least 6 characters.', error: true);
      return;
    }
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/users/me', label: 'Change password', body: {
      'username': s.user?['username'], 'email': s.user?['email'], 'currentPassword': cur.text, 'password': next.text, 'confirmPassword': again.text,
    }), queueIfOffline: false);
    if (!context.mounted) return;
    if (r.ok) {
      toast(context, 'Password changed. Please log in again.');
      await s.logout();
    } else {
      toast(context, r.message, error: true);
    }
  }
}
