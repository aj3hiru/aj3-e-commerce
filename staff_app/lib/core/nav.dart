import 'package:flutter/foundation.dart';

/// Lets any screen open another section, optionally with a filter —
/// e.g. the dashboard's "New orders" card opens Orders on the "New" tab.
class NavController extends ChangeNotifier {
  String section = 'home';
  Map<String, dynamic> args = const {};
  int _seq = 0;

  /// Changes every time go() is called, so a screen can react even to the same section.
  int get seq => _seq;

  void go(String id, [Map<String, dynamic> args = const {}]) {
    section = id;
    this.args = args;
    _seq++;
    notifyListeners();
  }

  /// Reads (and clears) the filter meant for [id].
  Map<String, dynamic> take(String id) {
    if (section != id || args.isEmpty) return const {};
    final a = args;
    args = const {};
    return a;
  }
}
