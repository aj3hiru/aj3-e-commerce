import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
export 'api.dart';
import 'config.dart';
import 'format.dart';
import 'local_store.dart';
import 'perms.dart';

const _uuid = Uuid();
String newId() => _uuid.v4().replaceAll('-', '');

/// A change made in the app that still has to reach the server.
/// Its `id` is sent as the Idempotency-Key, so re-sending it never repeats it.
class OutboxItem {
  final String id;
  final String method;
  final String path;
  final Map<String, dynamic> body;
  final Map<String, String> fields; // multipart fields (when files are sent)
  final Map<String, String> files; // multipart field -> local file path
  final bool multipart; // send as a form (the website's form APIs), even without files
  final String label; // what the person did, for the Sync Center
  final DateTime createdAt;
  final Map<String, dynamic>? effect; // how it shows in the app before the server confirms
  final List<String> refresh; // data sets to re-download after it is sent
  int attempts;
  String? error;
  bool failed;

  OutboxItem({
    required this.id,
    required this.method,
    required this.path,
    this.body = const {},
    this.fields = const {},
    this.files = const {},
    this.multipart = false,
    required this.label,
    DateTime? createdAt,
    this.effect,
    this.refresh = const [],
    this.attempts = 0,
    this.error,
    this.failed = false,
  }) : createdAt = createdAt ?? DateTime.now().toUtc();

  Map<String, dynamic> toJson() => {
        'id': id, 'method': method, 'path': path, 'body': body, 'fields': fields, 'files': files, 'multipart': multipart, 'label': label,
        'createdAt': createdAt.toIso8601String(), 'effect': effect, 'refresh': refresh, 'attempts': attempts, 'error': error, 'failed': failed,
      };

  factory OutboxItem.fromJson(Map<String, dynamic> j) => OutboxItem(
        id: j['id'], method: j['method'], path: j['path'],
        body: Map<String, dynamic>.from(j['body'] ?? {}), fields: Map<String, String>.from(j['fields'] ?? {}), files: Map<String, String>.from(j['files'] ?? {}), multipart: j['multipart'] == true,
        label: j['label'] ?? '', createdAt: DateTime.tryParse(j['createdAt'] ?? ''), effect: j['effect'] == null ? null : Map<String, dynamic>.from(j['effect']),
        refresh: List<String>.from(j['refresh'] ?? const []), attempts: j['attempts'] ?? 0, error: j['error'], failed: j['failed'] ?? false,
      );
}

enum SyncPhase { idle, sending, receiving }

/// The app's shared state: who is signed in, the data kept on the device,
/// the outbox, and the sync engine that keeps them in step with the server.
class AppState extends ChangeNotifier {
  final _secure = const FlutterSecureStorage();
  final _store = LocalStore.instance;
  final api = Api();

  bool ready = false;
  Map<String, dynamic>? user;
  Perms perms = const Perms({}, '');
  Map<String, dynamic> sets = {};
  Map<String, String> hashes = {};
  List<String> allowed = [];
  List<OutboxItem> outbox = [];
  bool online = true;
  bool needLogin = false;
  SyncPhase phase = SyncPhase.idle;
  DateTime? lastSync;
  String? lastError;
  Map<String, dynamic>? release;
  String appVersion = '';
  String deviceId = '';

  Timer? _timer;
  StreamSubscription? _conn;
  bool _syncing = false;
  bool _again = false;
  DateTime _lastMe = DateTime.fromMillisecondsSinceEpoch(0);

  bool get signedIn => user != null && api.token != null;
  int get pending => outbox.where((o) => !o.failed).length;
  int get failed => outbox.where((o) => o.failed).length;
  Map<String, dynamic> get settings => Map<String, dynamic>.from(sets['settings'] ?? {});

  List<Map<String, dynamic>> list(String name) => ((sets[name] as List?) ?? const []).cast<Map>().map((m) => Map<String, dynamic>.from(m)).toList();

  // ───────────────────────────── start-up ─────────────────────────────
  Future<void> init() async {
    await _store.init();
    try {
      appVersion = (await PackageInfo.fromPlatform()).version;
    } catch (_) {}
    deviceId = (await _store.read('device')) as String? ?? newId();
    await _store.write('device', deviceId);
    api.server = await _secure.read(key: 'server') ?? AppConfig.defaultServer;
    api.token = await _secure.read(key: 'token');
    final cachedUser = await _store.read('user');
    if (cachedUser is Map) _setUser(Map<String, dynamic>.from(cachedUser));
    final cachedSets = await _store.read('sets');
    if (cachedSets is Map) sets = Map<String, dynamic>.from(cachedSets);
    final cachedHashes = await _store.read('hashes');
    if (cachedHashes is Map) hashes = Map<String, String>.from(cachedHashes);
    final ob = await _store.read('outbox');
    if (ob is List) outbox = ob.map((e) => OutboxItem.fromJson(Map<String, dynamic>.from(e))).toList();
    final ls = await _store.read('lastSync');
    if (ls is String) lastSync = DateTime.tryParse(ls);
    _applyEffects();
    ready = true;
    notifyListeners();
    if (signedIn) _startLoop();
  }

  void _setUser(Map<String, dynamic> u) {
    user = u;
    perms = Perms(Map<String, dynamic>.from(u['permissions'] ?? {}), u['role'] ?? '');
  }

  void _startLoop() {
    _timer?.cancel();
    _timer = Timer.periodic(AppConfig.syncEvery, (_) => syncNow());
    _conn?.cancel();
    _conn = Connectivity().onConnectivityChanged.listen((r) {
      final any = r.any((x) => x != ConnectivityResult.none);
      if (any) {
        syncNow(); // back online → send and fetch right away
      } else if (online) {
        online = false;
        notifyListeners();
      }
    });
    syncNow();
  }

  // ───────────────────────────── sign in / out ─────────────────────────────
  Future<String?> login(String identity, String password, {String? server}) async {
    if (server != null && server.trim().isNotEmpty) api.server = server.trim().replaceAll(RegExp(r'/+$'), '');
    api.token = null;
    final r = await api.send('POST', '/api/app/v1/login', body: {
      'identity': identity.trim(), 'password': password, 'device': deviceId, 'platform': Platform.isAndroid ? 'android' : Platform.operatingSystem,
    });
    if (!r.ok) return r.outcome == ApiOutcome.offline ? 'No internet connection. Connect and try again.' : r.message;
    // A different person on this device: start clean (keep only unsent work of the same person).
    final newUser = Map<String, dynamic>.from(r.data['user']);
    if (user != null && user!['id'] != newUser['id']) {
      await _store.clearData();
      sets = {};
      hashes = {};
      outbox = [];
    }
    api.token = r.data['token'];
    await _secure.write(key: 'token', value: api.token);
    await _secure.write(key: 'server', value: api.server);
    _setUser(newUser);
    release = r.data['release'] is Map ? Map<String, dynamic>.from(r.data['release']) : null;
    needLogin = false;
    await _store.write('user', user);
    notifyListeners();
    _startLoop();
    return null;
  }

  Future<void> logout() async {
    _timer?.cancel();
    _conn?.cancel();
    await _secure.delete(key: 'token');
    api.token = null;
    user = null;
    sets = {};
    hashes = {};
    outbox = [];
    await _store.clearData();
    notifyListeners();
  }

  // ───────────────────────────── changes (outbox) ─────────────────────────────
  /// Records a change: it shows in the app at once and is sent when possible.
  Future<void> enqueue(OutboxItem item) async {
    outbox.add(item);
    if (item.effect != null) _applyEffect(item.effect!);
    await _saveOutbox();
    await _store.write('sets', sets);
    notifyListeners();
    unawaited(syncNow());
  }

  /// Sends a change right now and waits for the answer (for things that need
  /// the server's reply, like a new product's id). Falls back to the outbox when offline.
  Future<ApiResult> sendNow(OutboxItem item, {bool queueIfOffline = true}) async {
    final r = await _deliver(item);
    if (r.outcome == ApiOutcome.offline || r.outcome == ApiOutcome.busy) {
      if (queueIfOffline) await enqueue(item);
      return r;
    }
    if (r.ok) {
      if (item.effect != null) {
        _applyEffect(item.effect!);
        await _store.write('sets', sets);
      }
      notifyListeners();
      unawaited(syncNow(only: item.refresh));
    }
    return r;
  }

  Future<ApiResult> _deliver(OutboxItem o) {
    if (o.multipart || o.files.isNotEmpty) return api.multipart(o.method, o.path, fields: o.fields, files: o.files, idem: o.id);
    return api.send(o.method, o.path, body: o.body, idem: o.id);
  }

  Future<void> retry(OutboxItem o) async {
    o.failed = false;
    o.error = null;
    await _saveOutbox();
    notifyListeners();
    unawaited(syncNow());
  }

  Future<void> discard(OutboxItem o) async {
    outbox.remove(o);
    await _saveOutbox();
    notifyListeners();
    unawaited(syncNow(force: true)); // redownload so the discarded change disappears
  }

  Future<void> _saveOutbox() => _store.write('outbox', outbox.map((o) => o.toJson()).toList());

  // ───────────────────────────── sync ─────────────────────────────
  /// Send waiting changes, then fetch only the data that changed.
  Future<void> syncNow({List<String>? only, bool force = false}) async {
    if (!signedIn) return;
    if (_syncing) {
      _again = true;
      return;
    }
    _syncing = true;
    try {
      do {
        _again = false;
        final sent = await _push();
        if (!online && sent == null) break;
        await _pull(only: force ? null : (only == null || only.isEmpty ? null : only), force: force);
        if (DateTime.now().difference(_lastMe) > const Duration(minutes: 10)) await refreshMe();
      } while (_again);
    } finally {
      _syncing = false;
      phase = SyncPhase.idle;
      notifyListeners();
    }
  }

  /// Returns the number sent, or null when the connection is down.
  Future<int?> _push() async {
    var sent = 0;
    final refresh = <String>{};
    for (final o in List<OutboxItem>.from(outbox)) {
      if (o.failed) continue;
      phase = SyncPhase.sending;
      notifyListeners();
      final r = await _deliver(o);
      switch (r.outcome) {
        case ApiOutcome.ok:
          outbox.remove(o);
          refresh.addAll(o.refresh);
          sent++;
          await _saveOutbox();
          online = true;
          continue;
        case ApiOutcome.offline:
          online = false;
          notifyListeners();
          return null;
        case ApiOutcome.busy:
          o.attempts++;
          await _saveOutbox();
          return sent; // try again next round
        case ApiOutcome.unauthorized:
          needLogin = true;
          notifyListeners();
          return sent;
        case ApiOutcome.forbidden:
        case ApiOutcome.rejected:
          o.attempts++;
          o.failed = true;
          o.error = r.message;
          await _saveOutbox();
          notifyListeners();
          continue;
      }
    }
    return sent;
  }

  Future<void> _pull({List<String>? only, bool force = false}) async {
    phase = SyncPhase.receiving;
    notifyListeners();
    final r = await api.send('POST', '/api/app/v1/sync', body: {'have': force ? <String, String>{} : hashes, 'only': ?only});
    if (r.outcome == ApiOutcome.offline) {
      online = false;
      return;
    }
    if (r.outcome == ApiOutcome.unauthorized) {
      needLogin = true;
      return;
    }
    if (!r.ok) {
      lastError = r.message;
      return;
    }
    online = true;
    lastError = null;
    allowed = List<String>.from(r.data['allowed'] ?? const []);
    final incoming = Map<String, dynamic>.from(r.data['sets'] ?? {});
    var changed = false;
    for (final e in incoming.entries) {
      final v = Map<String, dynamic>.from(e.value);
      if (v.containsKey('data')) {
        sets[e.key] = v['data'];
        changed = true;
      }
      hashes[e.key] = v['hash'] as String;
    }
    // Sets this role no longer has (permissions changed) are removed from the device.
    if (only == null) {
      for (final k in sets.keys.toList()) {
        if (!allowed.contains(k)) {
          sets.remove(k);
          hashes.remove(k);
          changed = true;
        }
      }
    }
    if (changed) {
      _applyEffects(); // changes not sent yet stay visible
      await _store.write('sets', sets);
    }
    await _store.write('hashes', hashes);
    lastSync = DateTime.now().toUtc();
    await _store.write('lastSync', lastSync!.toIso8601String());
  }

  Future<void> refreshMe() async {
    final r = await api.get('/api/app/v1/me');
    if (r.outcome == ApiOutcome.unauthorized) {
      needLogin = true;
      notifyListeners();
      return;
    }
    if (!r.ok) return;
    _lastMe = DateTime.now();
    _setUser(Map<String, dynamic>.from(r.data['user']));
    await _store.write('user', user);
    if (r.data['token'] is String) {
      api.token = r.data['token'];
      await _secure.write(key: 'token', value: api.token);
    }
    release = r.data['release'] is Map ? Map<String, dynamic>.from(r.data['release']) : null;
    notifyListeners();
  }

  // ───────────────────────────── local effects ─────────────────────────────
  void _applyEffects() {
    for (final o in outbox) {
      if (o.effect != null && !o.failed) _applyEffect(o.effect!);
    }
  }

  void _patchIn(String set, bool Function(Map<String, dynamic>) where, Map<String, dynamic> fields) {
    final l = sets[set];
    if (l is! List) return;
    for (var i = 0; i < l.length; i++) {
      final m = Map<String, dynamic>.from(l[i]);
      if (where(m)) l[i] = {...m, ...fields};
    }
  }

  void _applyEffect(Map<String, dynamic> e) {
    switch (e['kind']) {
      case 'order':
        final f = Map<String, dynamic>.from(e['fields']);
        for (final s in ['orders', 'deliveries']) {
          _patchIn(s, (m) => m['id'] == e['id'], f);
        }
        break;
      case 'pos_sale':
        final order = Map<String, dynamic>.from(e['order']);
        final orders = (sets['orders'] as List?) ?? [];
        if (!orders.any((o) => o['localRef'] == order['localRef'])) sets['orders'] = [order, ...orders];
        for (final it in (order['items'] as List)) {
          final l = sets['products'];
          if (l is List) {
            for (var i = 0; i < l.length; i++) {
              if (l[i]['id'] == it['productId'] && l[i]['stock'] != null) {
                l[i] = {...Map<String, dynamic>.from(l[i]), 'stock': (toInt(l[i]['stock']) - toInt(it['qty'])).clamp(0, 1 << 31)};
              }
            }
          }
        }
        break;
      case 'due_payment':
        final paid = Map<String, dynamic>.from(e['amounts']); // creditId -> amount
        final l = sets['dues'];
        if (l is List) {
          for (var i = 0; i < l.length; i++) {
            final a = toDouble(paid['${l[i]['id']}']);
            if (a > 0) {
              final m = Map<String, dynamic>.from(l[i]);
              final bal = (toDouble(m['balance']) - a).clamp(0, double.infinity);
              l[i] = {...m, 'paid': toDouble(m['paid']) + a, 'balance': bal, 'status': bal <= 0.004 ? 'paid' : m['status']};
            }
          }
          sets['dues'] = l.where((d) => toDouble(d['balance']) > 0.004).toList();
        }
        break;
      case 'product':
        _patchIn('products', (m) => m['id'] == e['id'], Map<String, dynamic>.from(e['fields']));
        break;
      case 'stock_add':
        final l = sets['products'];
        if (l is List) {
          for (var i = 0; i < l.length; i++) {
            if (l[i]['id'] == e['id'] && l[i]['stock'] != null) l[i] = {...Map<String, dynamic>.from(l[i]), 'stock': toInt(l[i]['stock']) + toInt(e['qty'])};
          }
        }
        break;
      case 'customer':
        _patchIn('customers', (m) => m['id'] == e['id'], Map<String, dynamic>.from(e['fields']));
        break;
      case 'staff':
        _patchIn('staff', (m) => m['id'] == e['id'], Map<String, dynamic>.from(e['fields']));
        break;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _conn?.cancel();
    super.dispose();
  }
}
