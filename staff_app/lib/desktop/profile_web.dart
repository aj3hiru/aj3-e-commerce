import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../features/account/account_screen.dart';
import '../features/account/sync_center.dart';
import '../features/account/update.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';

/// "My Profile" as on the website: photo card, personal details form, change password,
/// plus this app's own settings (printing, sync, version).
class ProfileWeb extends StatefulWidget {
  const ProfileWeb({super.key});
  @override
  State<ProfileWeb> createState() => _ProfileWebState();
}

const _magenta = Color(0xFFA21C87);

class _ProfileWebState extends State<ProfileWeb> {
  late final Map<String, dynamic> _u = Map<String, dynamic>.from(context.read<AppState>().user ?? {});
  late final _first = TextEditingController(text: '${_u['name'] ?? ''}'.split(' ').first);
  late final _last = TextEditingController(text: '${_u['name'] ?? ''}'.split(' ').skip(1).join(' '));
  late final _phone = TextEditingController(text: _u['phone'] ?? '');
  late final _email = TextEditingController(text: _u['email'] ?? '');
  late final _username = TextEditingController(text: _u['username'] ?? '');
  final _cur = TextEditingController(), _next = TextEditingController(), _again = TextEditingController();
  bool _savingDetails = false, _savingPw = false;
  final _show = <String, bool>{};

  Future<void> _saveDetails() async {
    final s = context.read<AppState>();
    setState(() => _savingDetails = true);
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/users/me', label: 'Update my details', body: {
      'username': _username.text.trim(), 'email': _email.text.trim(), 'firstName': _first.text.trim(), 'lastName': _last.text.trim(), 'phone': _phone.text.trim(),
    }), queueIfOffline: false);
    if (!mounted) return;
    setState(() => _savingDetails = false);
    if (r.ok) {
      await s.refreshMe();
      if (mounted) toast(context, 'Saved.');
    } else {
      toast(context, r.outcome == ApiOutcome.offline ? 'Saving your details needs the internet.' : r.message, error: true);
    }
  }

  Future<void> _savePassword() async {
    final s = context.read<AppState>();
    if (_next.text.length < 6 || _next.text != _again.text) return toast(context, 'New passwords must match and be at least 6 characters.', error: true);
    setState(() => _savingPw = true);
    final r = await s.sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/users/me', label: 'Change password', body: {
      'username': s.user?['username'], 'email': s.user?['email'], 'currentPassword': _cur.text, 'password': _next.text, 'confirmPassword': _again.text,
    }), queueIfOffline: false);
    if (!mounted) return;
    setState(() => _savingPw = false);
    if (r.ok) {
      toast(context, 'Password changed. Please log in again.');
      await s.logout();
    } else {
      toast(context, r.outcome == ApiOutcome.offline ? 'Changing the password needs the internet.' : r.message, error: true);
    }
  }

  Widget _field(String label, TextEditingController c, {IconData? icon, String? hint, String? note, String? pw, TextInputType? type}) {
    final hidden = pw != null && _show[pw] != true;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 14, color: W.g700))),
        if (note != null) Text(note, style: const TextStyle(fontSize: 13, color: W.g400)),
      ]),
      const SizedBox(height: 8),
      TextField(
        controller: c,
        obscureText: hidden,
        keyboardType: type,
        style: const TextStyle(fontSize: 15),
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: W.g400),
          prefixIcon: icon == null ? null : Icon(icon, size: 17, color: W.g400),
          suffixIcon: pw == null ? null : IconButton(icon: Icon(hidden ? LucideIcons.eye : LucideIcons.eyeOff, size: 17, color: W.g500), onPressed: () => setState(() => _show[pw] = !(_show[pw] ?? false))),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: W.g300)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: W.g300)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: _magenta, width: 1.5)),
        ),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final u = s.user ?? {};
    final name = '${u['name'] ?? u['username'] ?? ''}';
    const account = AccountScreen();
    Widget row2(Widget a, Widget b) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 14), Expanded(child: b)]);
    Widget title(IconData i, String t) => Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Row(children: [Icon(i, size: 19, color: _magenta), const SizedBox(width: 10), Text(t, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: W.g800))]),
        );
    Widget settingRow(IconData icon, String t, String sub, VoidCallback? onTap, {Widget? trailing}) => InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(children: [
              Container(width: 38, height: 38, decoration: BoxDecoration(color: const Color(0xFFFCE7F6), borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 18, color: _magenta)),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)), Text(sub, style: const TextStyle(fontSize: 13, color: W.g500))])),
              trailing ?? const Icon(LucideIcons.chevronRight, size: 18, color: W.g400),
            ]),
          ),
        );

    return WebPage(
      title: 'My Profile',
      subtitle: 'Your details, photo and password',
      maxWidth: 640,
      children: [
        WebCard(
          padding: EdgeInsets.zero,
          child: Stack(children: [
            Container(
              height: 80,
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0xFF8B1A72), Color(0xFFA21C87)]),
                borderRadius: BorderRadius.vertical(top: Radius.circular(W.radius)),
              ),
            ),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 32, 20, 20),
              child: Column(children: [
                InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => account.changePhoto(context),
                  child: Stack(children: [
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Color(0x22000000), blurRadius: 10)]),
                      child: u['avatar'] != null
                          ? Avatar(name, photo: u['avatar'], size: 84)
                          : Container(
                              width: 84,
                              height: 84,
                              alignment: Alignment.center,
                              decoration: const BoxDecoration(color: Color(0xFFF5E6F2), shape: BoxShape.circle),
                              child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w700, color: _magenta)),
                            ),
                    ),
                    Positioned(
                      right: 0,
                      bottom: 4,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(color: _magenta, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                        child: const Icon(LucideIcons.camera, size: 13, color: Colors.white),
                      ),
                    ),
                  ]),
                ),
                const SizedBox(height: 6),
                Text(u['avatar'] == null ? 'Add photo' : 'Change photo', style: const TextStyle(fontSize: 12.5, color: W.g500)),
                const SizedBox(height: 10),
                Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: W.g800)),
                const SizedBox(height: 6),
                WebBadge('${u['roleLabel'] ?? ''}', color: W.primary, bg: const Color(0xFFF3E8FF)),
                if (u['since'] != null) ...[
                  const SizedBox(height: 8),
                  Text('Member since ${DateFormat('MMMM yyyy').format(DateTime.parse('${u['since']}'))}', style: const TextStyle(fontSize: 13, color: W.g500)),
                ],
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            title(LucideIcons.user, 'Personal details'),
            row2(_field('First name', _first), _field('Last name', _last)),
            const SizedBox(height: 16),
            row2(_field('Mobile number', _phone, icon: LucideIcons.phone, hint: '10-digit mobile', note: 'You can log in with it', type: TextInputType.phone), _field('Email', _email, icon: LucideIcons.mail, type: TextInputType.emailAddress)),
            const SizedBox(height: 16),
            row2(_field('Username', _username, icon: LucideIcons.atSign), const SizedBox()),
            const SizedBox(height: 18),
            Align(alignment: Alignment.centerLeft, child: WebButton(_savingDetails ? 'Saving…' : 'Save details', icon: LucideIcons.save, color: _magenta, height: 44, onPressed: _savingDetails ? null : _saveDetails)),
          ]),
        ),
        const SizedBox(height: 12),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            title(LucideIcons.keyRound, 'Change password'),
            _field('Current password', _cur, icon: LucideIcons.lock, pw: 'cur'),
            const SizedBox(height: 16),
            row2(_field('New password', _next, icon: LucideIcons.lock, note: 'Min 6 characters', pw: 'next'), _field('Confirm new password', _again, icon: LucideIcons.lock, pw: 'again')),
            const SizedBox(height: 18),
            Align(
              alignment: Alignment.centerLeft,
              child: WebButton(_savingPw ? 'Updating…' : 'Update password', icon: LucideIcons.shieldCheck, color: _magenta, height: 44,
                  onPressed: _savingPw || _cur.text.isEmpty || _next.text.length < 6 || _next.text != _again.text ? null : _savePassword),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            title(LucideIcons.monitor, 'This computer'),
            settingRow(LucideIcons.printer, 'Printing', 'Paper size and automatic receipt', () => account.printingSettings(context)),
            const Divider(height: 1, color: W.g100),
            settingRow(LucideIcons.refreshCw, 'Sync', s.pending > 0 ? '${s.pending} change(s) waiting to upload' : 'Everything is saved on the server', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncCenter()))),
            const Divider(height: 1, color: W.g100),
            settingRow(LucideIcons.download, 'App version', s.appVersion.isEmpty ? '—' : 'v${s.appVersion}${s.release?['version'] != null ? ' · latest v${s.release!['version']}' : ''}',
                s.release != null ? () => openUpdate(context, s.release!) : null, trailing: s.release != null ? null : const SizedBox()),
          ]),
        ),
      ],
    );
  }
}
