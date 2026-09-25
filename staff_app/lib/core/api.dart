import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'config.dart';

/// What happened to a request, in the terms the app cares about.
enum ApiOutcome { ok, rejected, unauthorized, forbidden, busy, offline }

class ApiResult {
  final ApiOutcome outcome;
  final int status;
  final Map<String, dynamic> data;
  const ApiResult(this.outcome, this.status, this.data);

  bool get ok => outcome == ApiOutcome.ok;
  String get message => (data['message'] as String?) ??
      switch (outcome) {
        ApiOutcome.offline => 'No internet connection.',
        ApiOutcome.unauthorized => 'Please log in again.',
        ApiOutcome.forbidden => "You don't have permission for this.",
        ApiOutcome.busy => 'The server is busy. Trying again shortly.',
        _ => 'Something went wrong.',
      };
}

/// Talks to the staff site. Every call has a time limit, so the app never hangs
/// on a bad connection — it reports "offline" and the change waits in the outbox.
class Api {
  String server;
  String? token;
  Api({this.server = AppConfig.defaultServer, this.token});

  Uri _uri(String path, [Map<String, String>? query]) => Uri.parse('$server$path').replace(queryParameters: query);

  Map<String, String> _headers({String? idem, bool json = true}) => {
        if (json) 'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
        'Idempotency-Key': ?idem,
        'X-Staff-App': '1',
      };

  Future<ApiResult> get(String path, {Map<String, String>? query}) =>
      _send(() => http.get(_uri(path, query), headers: _headers(json: false)));

  Future<ApiResult> send(String method, String path, {Object? body, String? idem}) => _send(() {
        final req = http.Request(method, _uri(path))
          ..headers.addAll(_headers(idem: idem))
          ..body = jsonEncode(body ?? {});
        return http.Client().send(req).then(http.Response.fromStream);
      });

  /// Multipart upload (photos, product create).
  Future<ApiResult> multipart(String method, String path, {Map<String, String> fields = const {}, Map<String, String> files = const {}, String? idem}) =>
      _send(() async {
        final req = http.MultipartRequest(method, _uri(path))
          ..headers.addAll(_headers(idem: idem, json: false))
          ..fields.addAll(fields);
        for (final e in files.entries) {
          if (File(e.value).existsSync()) req.files.add(await http.MultipartFile.fromPath(e.key, e.value));
        }
        return http.Response.fromStream(await req.send());
      }, timeout: const Duration(seconds: 90));

  Future<ApiResult> _send(Future<http.Response> Function() run, {Duration timeout = AppConfig.requestTimeout}) async {
    http.Response res;
    try {
      res = await run().timeout(timeout);
    } on TimeoutException {
      return const ApiResult(ApiOutcome.offline, 0, {'message': 'The connection is too slow right now.'});
    } on SocketException {
      return const ApiResult(ApiOutcome.offline, 0, {});
    } on http.ClientException {
      return const ApiResult(ApiOutcome.offline, 0, {});
    } on HandshakeException {
      return const ApiResult(ApiOutcome.offline, 0, {'message': 'Secure connection failed.'});
    }
    Map<String, dynamic> data;
    try {
      final d = jsonDecode(utf8.decode(res.bodyBytes));
      data = d is Map<String, dynamic> ? d : {'data': d};
    } catch (_) {
      data = {};
    }
    final s = res.statusCode;
    if (s == 401) return ApiResult(ApiOutcome.unauthorized, s, data);
    if (s == 403) return ApiResult(ApiOutcome.forbidden, s, data);
    if (s == 503 || s == 502 || s == 504 || s == 429 || (s == 409 && data['retry'] == true)) return ApiResult(ApiOutcome.busy, s, data);
    if (s >= 500) return ApiResult(ApiOutcome.busy, s, data);
    if (s >= 400 || data['success'] == false) return ApiResult(ApiOutcome.rejected, s, data);
    return ApiResult(ApiOutcome.ok, s, data);
  }

  /// Full URL for an uploaded file path like "uploads/ecommerce/products/x.webp".
  String? fileUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$server/${path.startsWith('/') ? path.substring(1) : path}';
  }
}
