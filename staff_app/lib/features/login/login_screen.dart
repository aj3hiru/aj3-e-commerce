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

  @override
  Widget build(BuildContext context) {
    final wide = isWide(context);
    final form = ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 400),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(width: 48, height: 48, decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.storefront_rounded, color: Colors.white)),
          const SizedBox(width: 12),
          const Expanded(child: Text(AppConfig.appName, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
        ]),
        const SizedBox(height: 28),
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
      ]),
    );
    return Scaffold(
      backgroundColor: wide ? AppColors.bg : Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: wide ? Card(child: Padding(padding: const EdgeInsets.all(36), child: form)) : form,
          ),
        ),
      ),
    );
  }
}
