import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/config.dart';
import '../../widgets/web.dart';

/// First start after login (or after an update that adds pages): downloads everything once —
/// data, every page, reports, product details, order histories — with a % bar. After this the
/// app never needs to download a page again to open it; it only refreshes quietly in the background.
class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key});
  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  bool _waiting = false;
  Timer? _retry;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  @override
  void dispose() {
    _retry?.cancel();
    super.dispose();
  }

  Future<void> _run() async {
    _retry?.cancel();
    if (!mounted) return;
    setState(() => _waiting = false);
    final ok = await context.read<AppState>().downloadAll();
    if (!mounted || ok) return;
    // No internet right now: try again by itself every few seconds.
    setState(() => _waiting = true);
    _retry = Timer(const Duration(seconds: 5), _run);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final pct = (s.setupProgress * 100).floor();
    final hasData = s.sets.isNotEmpty;
    return Scaffold(
      backgroundColor: const Color(0xFFF3F3F3),
      body: Center(
        child: Container(
          width: 460,
          padding: const EdgeInsets.fromLTRB(32, 30, 32, 26),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFE5E5E5)), boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8))]),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(width: 36, height: 36, decoration: BoxDecoration(color: W.primary, borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.storefront_outlined, color: Colors.white, size: 20)),
              const SizedBox(width: 12),
              Text(AppConfig.appName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900)),
            ]),
            const SizedBox(height: 26),
            Text(_waiting ? 'Waiting for the internet' : 'Getting everything ready', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: W.g900)),
            const SizedBox(height: 6),
            Text(
              _waiting ? 'It carries on by itself as soon as the connection is back.' : 'This happens once. After this every page opens instantly — with or without internet.',
              style: const TextStyle(fontSize: 13, color: W.g600, height: 1.4),
            ),
            const SizedBox(height: 26),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$pct', style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w300, color: W.g900, height: 1)),
              const Padding(padding: EdgeInsets.only(bottom: 5, left: 2), child: Text('%', style: TextStyle(fontSize: 18, color: W.g500))),
              const Spacer(),
              Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(s.setupStep, style: const TextStyle(fontSize: 12.5, color: W.g500))),
            ]),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: TweenAnimationBuilder<double>(
                tween: Tween(end: s.setupProgress),
                duration: const Duration(milliseconds: 250),
                builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: 4, backgroundColor: const Color(0xFFE8E8E8), color: W.primary),
              ),
            ),
            const SizedBox(height: 22),
            Row(children: [
              if (_waiting) TextButton(onPressed: _run, child: const Text('Try again')),
              const Spacer(),
              if (_waiting && hasData) TextButton(onPressed: () => s.skipSetup(), child: const Text('Open with what is saved')),
            ]),
          ]),
        ),
      ),
    );
  }
}
