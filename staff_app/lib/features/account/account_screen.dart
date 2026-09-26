import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/local_store.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import 'sync_center.dart';
import 'update.dart';

/// My profile: details, password, sync, app version, log out.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final u = s.user ?? {};
    Future<void> logout() async {
      final msg = s.pending > 0
          ? '${s.pending} change(s) have not reached the server yet. If you log out now they will be LOST. Connect to the internet first to send them.'
          : 'You can log in again any time.';
      if (await confirm(context, 'Log out?', msg, ok: 'Log out', danger: s.pending > 0)) s.logout();
    }

    if (!isWide(context)) {
      // Phones: orange curved header, centred photo, a menu of coloured round icons.
      Widget item(IconData icon, Color ink, Color tint, String title, String? sub, VoidCallback? onTap, {Widget? trailing}) => ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            leading: Container(width: 42, height: 42, decoration: BoxDecoration(color: tint, shape: BoxShape.circle), child: Icon(icon, color: ink, size: 21)),
            title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: sub == null ? null : Text(sub, style: const TextStyle(fontSize: 12.5)),
            trailing: trailing ?? const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            onTap: onTap,
          );
      return Scaffold(
        body: ListView(padding: EdgeInsets.zero, children: [
          Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
            Container(
              height: 190,
              decoration: BoxDecoration(gradient: AppColors.heroGradient, borderRadius: const BorderRadius.vertical(bottom: Radius.circular(36))),
              child: SafeArea(
                bottom: false,
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  IconButton(icon: const Icon(Icons.menu_rounded, color: Colors.white, size: 26), onPressed: () => shellScaffoldKey.currentState?.openDrawer()),
                  const Expanded(child: Padding(padding: EdgeInsets.only(top: 12), child: Text('My profile', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)))),
                  IconButton(icon: const Icon(Icons.sync_rounded, color: Colors.white), onPressed: () => _sync(context)),
                ]),
              ),
            ),
            Positioned(
              top: 128,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => _changePhoto(context),
                child: Stack(children: [
                  Container(padding: const EdgeInsets.all(4), decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Color(0x22000000), blurRadius: 14, offset: Offset(0, 4))]), child: Avatar(u['name'] ?? '', photo: u['avatar'], size: 96)),
                  Positioned(right: 4, bottom: 4, child: Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)), child: const Icon(Icons.photo_camera_rounded, color: Colors.white, size: 15))),
                ]),
              ),
            ),
          ]),
          const SizedBox(height: 90),
          Text(u['name'] ?? '', textAlign: TextAlign.center, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text([u['roleLabel'], u['phone']].where((x) => x != null && '$x'.isNotEmpty).join(' · '), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
          if (u['since'] != null) Text('Staff since ${dateShort(u['since'])}', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: AppCard(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(children: [
                item(Icons.person_rounded, AppColors.primary, AppColors.primarySoft, 'Edit my details', u['email'] as String?, () => _editDetails(context)),
                item(Icons.lock_rounded, const Color(0xFF7C5CE0), AppColors.lilac, 'Change password', null, () => _changePassword(context)),
                item(Icons.print_rounded, const Color(0xFF3B7BE0), AppColors.sky, 'Printing', 'Paper size and automatic receipt', () => _printing(context)),
                item(Icons.sync_rounded, const Color(0xFF12A37F), AppColors.mint, 'Sync', s.pending > 0 ? '${s.pending} change(s) waiting' : 'All saved', () => _sync(context)),
                item(Icons.system_update_rounded, const Color(0xFFE09A00), AppColors.cream, 'App version',
                    s.appVersion.isEmpty ? '—' : 'v${s.appVersion}${s.release?['version'] != null ? ' · latest v${s.release!['version']}' : ''}', s.release != null ? () => openUpdate(context, s.release!) : null,
                    trailing: s.release != null ? null : const SizedBox.shrink()),
                item(Icons.logout_rounded, AppColors.red, AppColors.blush, 'Log out', null, logout, trailing: const SizedBox.shrink()),
              ]),
            ),
          ),
          const SizedBox(height: 24),
        ]),
      );
    }

    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('Profile'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => _sync(context)))]),
      body: PageBody(
        maxWidth: 820,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          HeroHeader(
            title: u['name'] ?? '',
            subtitle: [u['roleLabel'], u['phone'], u['email']].where((x) => x != null && '$x'.isNotEmpty).join(' · '),
            trailing: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => _changePhoto(context),
              child: Stack(children: [
                Container(padding: const EdgeInsets.all(3), decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Avatar(u['name'] ?? '', photo: u['avatar'], size: 64)),
                Positioned(right: 0, bottom: 0, child: Container(padding: const EdgeInsets.all(5), decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle), child: const Icon(Icons.photo_camera_rounded, color: Colors.white, size: 14))),
              ]),
            ),
            bottom: u['since'] != null ? Text('Staff since ${dateShort(u['since'])}', style: TextStyle(color: Colors.white.withValues(alpha: .85), fontSize: 12.5)) : null,
          ),
          const SizedBox(height: 14),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Edit my details'), trailing: const Icon(Icons.chevron_right), onTap: () => _editDetails(context)),
              const Divider(),
              ListTile(leading: const Icon(Icons.lock_reset_rounded), title: const Text('Change password'), trailing: const Icon(Icons.chevron_right), onTap: () => _changePassword(context)),
              const Divider(),
              ListTile(leading: const Icon(Icons.print_outlined), title: const Text('Printing'), subtitle: const Text('Paper size and automatic receipt'), trailing: const Icon(Icons.chevron_right), onTap: () => _printing(context)),
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
            onPressed: logout,
          ),
        ]),
      ),
    );
  }

  Future<void> _changePhoto(BuildContext context) async {
    final s = context.read<AppState>();
    XFile? x;
    try {
      x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 800, imageQuality: 88);
    } catch (_) {}
    if (x == null || !context.mounted) return;
    final up = await s.api.multipart('POST', '/api/users/avatar', files: {'file': x.path});
    if (!context.mounted) return;
    if (!up.ok) return toast(context, up.outcome == ApiOutcome.offline ? 'Changing the photo needs the internet.' : up.message, error: true);
    final u = s.user ?? {};
    final names = '${u['name'] ?? ''}'.split(' ');
    final r = await s.api.send('POST', '/api/users/me', idem: newId(), body: {
      'username': u['username'], 'email': u['email'], 'firstName': names.first, 'lastName': names.skip(1).join(' '), 'phone': u['phone'] ?? '', 'avatar': up.data['path'],
    });
    if (!context.mounted) return;
    if (r.ok) {
      await s.refreshMe();
      if (context.mounted) toast(context, 'Photo updated.');
    } else {
      toast(context, r.message, error: true);
    }
  }

  Future<void> _printing(BuildContext context) async {
    final saved = await LocalStore.instance.read('pos_prefs');
    if (!context.mounted) return;
    var auto = saved is Map ? saved['autoPrint'] != false : true;
    var paper = saved is Map && saved['paper'] is String ? saved['paper'] as String : (context.read<AppState>().settings['printerFormat'] as String? ?? 'thermal_80');
    await showModalBottomSheet(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Printing', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              const Text('Used by Billing and every “Print” button on this device.', style: TextStyle(color: AppColors.muted)),
              SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Print receipt after every sale'), value: auto, onChanged: (v) {
                set(() => auto = v);
                LocalStore.instance.write('pos_prefs', {'autoPrint': auto, 'paper': paper});
              }),
              const Text('Paper', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'thermal_58', label: Text('58 mm')), ButtonSegment(value: 'thermal_80', label: Text('80 mm')), ButtonSegment(value: 'a4', label: Text('A4'))],
                selected: {paper},
                onSelectionChanged: (v) {
                  set(() => paper = v.first);
                  LocalStore.instance.write('pos_prefs', {'autoPrint': auto, 'paper': paper});
                },
              ),
            ]),
          ),
        ),
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
