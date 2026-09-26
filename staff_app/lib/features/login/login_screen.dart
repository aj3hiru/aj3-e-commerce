import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/config.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

/// Staff sign-in: username / mobile / email + password (same account as the website).
class LoginScreen extends StatefulWidget {
  final bool again;
  const LoginScreen({super.key, this.again = false});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _id = TextEditingController();
  final _pw = TextEditingController();
  late final _server = TextEditingController(text: context.read<AppState>().api.server);
  bool _busy = false, _show = false, _advanced = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final u = context.read<AppState>().user;
    if (u != null) _id.text = u['username'] ?? '';
  }

  Future<void> _submit() async {
    if (_id.text.trim().isEmpty || _pw.text.isEmpty) {
      setState(() => _error = 'Enter your username / mobile / email and password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await context.read<AppState>().login(_id.text, _pw.text, server: _advanced ? _server.text : null);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null && widget.again && Navigator.canPop(context)) Navigator.pop(context);
  }

  Widget _fields() => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.again ? 'Log in again' : 'Welcome back', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text(widget.again ? 'Your login has ended. Nothing you did offline is lost.' : 'Sign in with your staff account.', style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 24),
        TextField(controller: _id, textInputAction: TextInputAction.next, autofillHints: const [AutofillHints.username],
            decoration: const InputDecoration(labelText: 'Username, mobile or email', prefixIcon: Icon(Icons.person_outline))),
        const SizedBox(height: 14),
        TextField(
          controller: _pw,
          obscureText: !_show,
          onSubmitted: (_) => _submit(),
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(labelText: 'Password', prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined), onPressed: () => setState(() => _show = !_show))),
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.redSoft, borderRadius: BorderRadius.circular(10)),
              child: Row(children: [const Icon(Icons.error_outline, color: AppColors.red, size: 20), const SizedBox(width: 8), Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.red)))])),
        ],
        const SizedBox(height: 20),
        FilledButton(onPressed: _busy ? null : _submit, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : const Text('Log in')),
        const SizedBox(height: 10),
        TextButton(onPressed: () => setState(() => _advanced = !_advanced), child: Text(_advanced ? 'Hide server address' : 'Server address')),
        if (_advanced) TextField(controller: _server, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Server', prefixIcon: Icon(Icons.dns_outlined))),
      ]);

  @override
  Widget build(BuildContext context) {
    final wide = isWide(context);
    if (!wide) {
      // Phones: brand-coloured header with a curved bottom, the form below.
      return Scaffold(
        backgroundColor: Colors.white,
        body: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: EdgeInsets.fromLTRB(24, MediaQuery.paddingOf(context).top + 36, 24, 36),
              decoration: BoxDecoration(gradient: AppColors.heroGradient, borderRadius: const BorderRadius.vertical(bottom: Radius.circular(36))),
              child: Column(children: [
                Container(width: 76, height: 76, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)), child: Icon(Icons.storefront_rounded, color: AppColors.primary, size: 40)),
                const SizedBox(height: 14),
                const Text(AppConfig.appName, textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('Staff app', style: TextStyle(color: Colors.white.withValues(alpha: .85))),
              ]),
            ),
            Padding(padding: const EdgeInsets.fromLTRB(24, 28, 24, 24), child: _fields()),
          ]),
        ),
      );
    }
    // Windows: the website's staff login card.
    const magenta = Color(0xFFA21C87);
    final biz = context.read<AppState>().settings['businessName'] as String?;
    InputDecoration box({Widget? suffix}) => InputDecoration(
          suffixIcon: suffix,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: Color(0xFFD1D5DB))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: Color(0xFFD1D5DB))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: magenta, width: 1.5)),
        );
    const label = TextStyle(fontSize: 14, color: Color(0xFF4B5563));
    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F7),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 358,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(6),
                border: const Border(top: BorderSide(color: magenta, width: 3)),
                boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8))],
              ),
              padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(biz?.trim().isNotEmpty == true ? biz! : AppConfig.appName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: magenta)),
                  if (widget.again) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Your login has ended. Nothing you did offline is lost.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)))),
                  const SizedBox(height: 30),
                  const Text('Username, mobile or email', style: label),
                  const SizedBox(height: 8),
                  TextField(controller: _id, autofocus: true, textInputAction: TextInputAction.next, autofillHints: const [AutofillHints.username], decoration: box()),
                  const SizedBox(height: 18),
                  const Text('Password', style: label),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _pw,
                    obscureText: !_show,
                    onSubmitted: (_) => _submit(),
                    autofillHints: const [AutofillHints.password],
                    decoration: box(suffix: IconButton(icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 19, color: const Color(0xFF6B7280)), onPressed: () => setState(() => _show = !_show))),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(4), border: Border.all(color: const Color(0xFFFECACA))),
                        child: Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 13.5))),
                  ],
                  if (_advanced) ...[
                    const SizedBox(height: 18),
                    const Text('Server', style: label),
                    const SizedBox(height: 8),
                    TextField(controller: _server, keyboardType: TextInputType.url, decoration: box()),
                  ],
                  const SizedBox(height: 22),
                  SizedBox(
                    height: 44,
                    child: FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: magenta, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)), textStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700, fontSize: 15)),
                      onPressed: _busy ? null : _submit,
                      child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : const Text('Log In'),
                    ),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 22),
            TextButton.icon(
              onPressed: () => setState(() => _advanced = !_advanced),
              style: TextButton.styleFrom(foregroundColor: const Color(0xFF6B7280)),
              icon: const Icon(Icons.dns_outlined, size: 15),
              label: Text(_advanced ? 'Hide server address' : 'Server address', style: const TextStyle(fontWeight: FontWeight.w400, fontSize: 13.5)),
            ),
          ]),
        ),
      ),
    );
  }
}
