import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Everything the app keeps on this device, as small JSON files in the app's
/// private folder: the synced data sets, their versions, and the outbox of
/// changes waiting to be sent. Files are written to a temp file first and then
/// renamed, so a crash or power cut never leaves a half-written file.
class LocalStore {
  late final Directory _dir;
  bool _ready = false;
  /// Used until init() (and in tests): keeps values in memory.
  final Map<String, dynamic> _memory = {};
  static final LocalStore instance = LocalStore._();
  LocalStore._();

  Future<void> init() async {
    _ready = true;
    final base = await getApplicationSupportDirectory();
    _dir = Directory('${base.path}${Platform.pathSeparator}staff_data');
    if (!_dir.existsSync()) _dir.createSync(recursive: true);
  }

  File _file(String name) => File('${_dir.path}${Platform.pathSeparator}$name.json');

  Future<dynamic> read(String name) async {
    if (!_ready) return _memory[name];
    final f = _file(name);
    if (!f.existsSync()) return null;
    try {
      return jsonDecode(await f.readAsString());
    } catch (_) {
      return null; // damaged file — treated as missing; the next sync refills it
    }
  }

  Future<void> write(String name, Object? value) async {
    if (!_ready) {
      _memory[name] = value;
      return;
    }
    final f = _file(name);
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode(value), flush: true);
    await tmp.rename(f.path);
  }

  Future<void> remove(String name) async {
    if (!_ready) {
      _memory.remove(name);
      return;
    }
    final f = _file(name);
    if (f.existsSync()) await f.delete();
  }

  /// Sign-out: forget this user's data (the outbox is kept only if it still has unsent work).
  Future<void> clearData({bool keepOutbox = false}) async {
    if (!_ready) return _memory.clear();
    for (final f in _dir.listSync().whereType<File>()) {
      if (keepOutbox && f.path.endsWith('outbox.json')) continue;
      await f.delete();
    }
  }
}
