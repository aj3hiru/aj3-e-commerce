import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Everything the app keeps on this device, as small JSON files in the app's
/// private folder: the synced data sets, their versions, every page's data and
/// the outbox of changes waiting to be sent. Files are written to a temp file
/// first and then renamed, so a crash or power cut never leaves a half-written
/// file. What was read or written once stays in memory, so pages open instantly.
class LocalStore {
  late final Directory _dir;
  bool _ready = false;
  /// Used until init() (and in tests): keeps values in memory.
  final Map<String, dynamic> _memory = {};
  /// Values already loaded from / written to disk.
  final Map<String, Object?> _cache = {};
  /// One write at a time per file (two quick saves of the same page must not race).
  final Map<String, Future<void>> _writing = {};
  static final LocalStore instance = LocalStore._();
  LocalStore._();

  Future<void> init() async {
    _ready = true;
    final base = await getApplicationSupportDirectory();
    _dir = Directory('${base.path}${Platform.pathSeparator}staff_data');
    if (!_dir.existsSync()) _dir.createSync(recursive: true);
  }

  /// A file name Windows accepts: names like "page:brands" or "report:range=today" had a ":"
  /// (not allowed on Windows), so those were never saved there.
  static String safeName(String name) => name.replaceAll(RegExp(r'[<>:"/\\|?*=&\s]'), '_');

  File _file(String name) => File('${_dir.path}${Platform.pathSeparator}${safeName(name)}.json');
  File _legacy(String name) => File('${_dir.path}${Platform.pathSeparator}$name.json');

  Future<dynamic> read(String name) async {
    if (!_ready) return _memory[name];
    if (_cache.containsKey(name)) return _cache[name];
    await _writing[name];
    var f = _file(name);
    if (!f.existsSync() && safeName(name) != name && !Platform.isWindows) {
      // Saved by an older version under the old name (fine on Android) — use it and move it over.
      final old = _legacy(name);
      if (old.existsSync()) {
        try {
          await old.rename(f.path);
        } catch (_) {
          f = old;
        }
      }
    }
    if (!f.existsSync()) return null;
    try {
      final v = jsonDecode(await f.readAsString());
      _cache[name] = v;
      return v;
    } catch (_) {
      return null; // damaged file — treated as missing; the next sync refills it
    }
  }

  Future<void> write(String name, Object? value) {
    if (!_ready) {
      _memory[name] = value;
      return Future.value();
    }
    _cache[name] = value;
    final text = jsonEncode(value);
    final prev = _writing[name] ?? Future.value();
    final next = prev.then((_) async {
      final f = _file(name);
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(text, flush: true);
      await tmp.rename(f.path);
    }).catchError((Object _) {});
    _writing[name] = next;
    return next;
  }

  Future<void> remove(String name) async {
    if (!_ready) {
      _memory.remove(name);
      return;
    }
    _cache.remove(name);
    await _writing[name];
    final f = _file(name);
    if (f.existsSync()) await f.delete();
  }

  /// Sign-out: forget this user's data (the outbox is kept only if it still has unsent work).
  Future<void> clearData({bool keepOutbox = false}) async {
    if (!_ready) return _memory.clear();
    _cache.removeWhere((k, _) => !(keepOutbox && k == 'outbox') && !k.startsWith('outbox_parked') && k != 'device');
    for (final w in _writing.values.toList()) {
      await w;
    }
    for (final f in _dir.listSync().whereType<File>()) {
      final n = f.uri.pathSegments.last;
      if (keepOutbox && n == 'outbox.json') continue;
      // Never deleted: another person's changes waiting to be sent, and this computer's id.
      if (n.startsWith('outbox_parked') || n == 'device.json') continue;
      await f.delete();
    }
  }
}
