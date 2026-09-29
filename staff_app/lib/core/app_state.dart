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
import 'notify.dart';
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

/// Data behind the app's versions of the website's other admin pages (`/api/app/v1/page/<name>`).
/// All of them are downloaded in the background, so every page opens at once — also offline.
const kPageNames = ['brands', 'tags', 'reviews', 'campaigns', 'coupons', 'pages', 'files', 'activity', 'push', 'business', 'customizer', 'cache', 'backups'];

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
  /// The website's admin menu for this person (sections → links → submenus), from /api/app/v1/menu.
  List<Map<String, dynamic>> menu = [];
  /// Page data (name → {data, at}), kept on the device.
  Map<String, Map<String, dynamic>> pageData = {};
  DateTime _lastPages = DateTime.fromMillisecondsSinceEpoch(0);
  bool _pagesBusy = false;
  String appVersion = '';
  String deviceId = '';

  Timer? _timer;
  int _liveAfter = 0; // last order event seen on the live feed
  int _liveGen = 0; // bumps when the feed must stop (logout / restart)
  StreamSubscription? _conn;
  bool _syncing = false;
  bool _again = false;
  DateTime _lastMe = DateTime.fromMillisecondsSinceEpoch(0);

  bool get signedIn => user != null && api.token != null;
  bool get syncing => _syncing;
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
    final m = await _store.read('menu');
    if (m is List) menu = m.map((e) => Map<String, dynamic>.from(e)).toList();
    for (final n in kPageNames) {
      final v = await _store.read('page:$n');
      if (v is Map && v.containsKey('data')) pageData[n] = Map<String, dynamic>.from(v);
    }
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
    _listenLive();
  }

  /// Live order feed: the server answers the moment anyone places, accepts,
  /// changes or assigns an order, so every device updates at once and the
  /// right people get a notification.
  Future<void> _listenLive() async {
    final gen = ++_liveGen;
    _liveAfter = 0;
    var fails = 0;
    while (gen == _liveGen && signedIn) {
      final r = await api.longGet('/api/app/v1/events', query: {'after': '$_liveAfter', 'wait': '25'});
      if (gen != _liveGen) return;
      if (!r.ok) {
        if (r.outcome == ApiOutcome.unauthorized) return;
        fails++;
        await Future.delayed(Duration(seconds: fails > 6 ? 30 : 3 * fails));
        continue;
      }
      fails = 0;
      final first = _liveAfter == 0;
      _liveAfter = toInt(r.data['last']);
      final events = ((r.data['events'] as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      if (first || events.isEmpty) continue;
      unawaited(syncNow(only: const ['orders', 'deliveries', 'dues', 'customers', 'products']));
      for (final e in events) {
        _announce(e);
      }
    }
  }

  void _announce(Map<String, dynamic> e) {
    final me = toInt(user?['id']);
    if (toInt(e['actorId']) == me && e['actorId'] != null) return; // my own change
    final no = '${e['orderNumber']}', who = '${e['customer'] ?? ''}'.trim(), amount = money(e['total']);
    final id = toInt(e['orderId']);
    final type = e['type'], to = '${e['to'] ?? ''}';
    if (type == 'assign' && to == user?['username']) {
      Notify.show(id, 'New delivery for you 🚚', '$no · ${who.isEmpty ? 'Customer' : who} · $amount', payload: 'delivery:$id');
    } else if (type == 'placed' && e['orderType'] == 'online' && perms.seesOrders) {
      Notify.show(id, 'New online order 🛒', '$no · ${who.isEmpty ? 'Customer' : who} · $amount', payload: 'order:$id');
    } else if (type == 'status' && (perms.seesOrders || toInt(e['agentId']) == me)) {
      Notify.show(id, '$no → $to', '${e['actor']} changed it${who.isEmpty ? '' : ' · $who'}', payload: 'order:$id');
    }
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
      pageData = {};
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
    _liveGen++;
    _timer?.cancel();
    _conn?.cancel();
    await _secure.delete(key: 'token');
    api.token = null;
    user = null;
    sets = {};
    hashes = {};
    outbox = [];
    menu = [];
    pageData = {};
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
      // (A new product sent at once needs no stand-in: the server's copy is fetched right away.)
      if (item.effect != null && item.effect!['kind'] != 'product_new') {
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
      if (online) unawaited(loadPages());
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
    await loadMenu();
  }

  /// Same menu as the website sidebar (kept on the device for offline starts).
  Future<void> loadMenu() async {
    final r = await api.get('/api/app/v1/menu');
    if (!r.ok || r.data['menu'] is! List) return;
    menu = (r.data['menu'] as List).map((e) => Map<String, dynamic>.from(e)).toList();
    await _store.write('menu', menu);
    notifyListeners();
  }

  // ───────────────────────────── other pages' data ─────────────────────────────
  /// Downloads every page's data in the background (at most every few minutes unless [force]).
  Future<void> loadPages({bool force = false}) async {
    if (!signedIn || _pagesBusy) return;
    if (!force && DateTime.now().difference(_lastPages) < const Duration(minutes: 3)) return;
    _pagesBusy = true;
    try {
      var off = false;
      for (final n in kPageNames) {
        final r = await reloadPage(n, notify: false);
        if (r == ApiOutcome.offline) { off = true; break; }
      }
      if (!off) await _loadProductDetails();
      _lastPages = DateTime.now();
    } finally {
      _pagesBusy = false;
      notifyListeners();
    }
  }

  /// The full product form (description, photos, sizes, specifications) of every product, and the form's
  /// choices, kept on the device — so a product can be fully edited offline. Only changed products are fetched.
  Future<void> _loadProductDetails() async {
    final form = await api.get('/api/app/v1/product-form');
    if (form.ok) await _store.write('product_form', form.data['form']);
    final products = list('products');
    if (products.length > 3000) return; // very large catalogues: fetched when opened instead
    for (final p in products) {
      final id = toInt(p['id']);
      if (id <= 0) continue;
      final have = await _store.read('product:$id');
      if (have is Map && have['updatedAt'] == p['updatedAt']) continue;
      final r = await api.get('/api/app/v1/products/$id');
      if (r.outcome == ApiOutcome.offline) return;
      if (r.ok) await _store.write('product:$id', {'updatedAt': p['updatedAt'], 'product': r.data['product']});
    }
  }

  /// A product's full form from the device (null if not downloaded yet).
  Future<Map<String, dynamic>?> savedProduct(int id) async {
    final v = await _store.read('product:$id');
    return v is Map && v['product'] is Map ? Map<String, dynamic>.from(v['product']) : null;
  }

  Future<void> saveProductDetail(int id, Map<String, dynamic> product) => _store.write('product:$id', {'updatedAt': null, 'product': product});

  /// Fresh copy of one page's data (kept on the device). Pages this person may not see are skipped.
  Future<ApiOutcome> reloadPage(String name, {bool notify = true}) async {
    final r = await api.get('/api/app/v1/page/$name');
    if (r.ok) {
      final v = {'data': r.data['data'], 'at': r.data['at'] as String? ?? DateTime.now().toUtc().toIso8601String()};
      pageData[name] = v;
      await _store.write('page:$name', v);
      if (notify) notifyListeners();
    } else if (r.outcome == ApiOutcome.offline && online) {
      online = false;
      if (notify) notifyListeners();
    }
    return r.outcome;
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
      case 'product_new':
        // Made offline: in the list at once (a temporary negative id) until the server's copy arrives.
        final np = Map<String, dynamic>.from(e['product']);
        final l = (sets['products'] as List?) ?? [];
        if (!l.any((x) => x['localRef'] == np['localRef'])) sets['products'] = [np, ...l];
        break;
      case 'product_delete':
        final ids = (e['ids'] as List).map(toInt).toSet();
        final l = sets['products'];
        if (l is List) sets['products'] = l.where((x) => !ids.contains(toInt(x['id']))).toList();
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
