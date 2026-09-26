import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/app_state.dart';
import 'core/config.dart';
import 'core/nav.dart';
import 'core/theme.dart';
import 'features/login/login_screen.dart';
import 'features/shell/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
  await state.init();
  runApp(MultiProvider(providers: [ChangeNotifierProvider.value(value: state), ChangeNotifierProvider(create: (_) => NavController())], child: const StaffApp()));
}

class StaffApp extends StatefulWidget {
  const StaffApp({super.key});
  @override
  State<StaffApp> createState() => _StaffAppState();
}

class _StaffAppState extends State<StaffApp> {
  late final AppLifecycleListener _life;

  @override
  void initState() {
    super.initState();
    // Coming back to the app → send waiting work and fetch what changed.
    _life = AppLifecycleListener(onResume: () => context.read<AppState>().syncNow());
  }

  @override
  void dispose() {
    _life.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      supportedLocales: const [Locale('en', 'IN'), Locale('en')],
      home: !s.ready ? const _Splash() : (s.signedIn ? const Shell() : const LoginScreen()),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator()));
}
