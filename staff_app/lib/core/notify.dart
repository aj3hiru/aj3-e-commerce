import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// System notifications (Android notification shade, Windows toast) for new
/// orders, deliveries handed to you and order changes made by others.
class Notify {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  /// Tapped notification → its payload (e.g. "order:42").
  static void Function(String payload)? onTap;

  static const _android = AndroidNotificationDetails(
    'orders', 'Orders',
    channelDescription: 'New orders, deliveries assigned to you and order updates',
    importance: Importance.high,
    priority: Priority.high,
    ticker: 'Order update',
  );

  static Future<void> init() async {
    if (_ready || !(Platform.isAndroid || Platform.isWindows)) return;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          windows: WindowsInitializationSettings(appName: 'Sri Andal Staff', appUserModelId: 'SriAndalTraders.StaffApp', guid: '5b3f2c1e-8d4a-4f6b-9c7e-2a1d0e9f8b64'),
        ),
        onDidReceiveNotificationResponse: (r) {
          final p = r.payload;
          if (p != null && p.isNotEmpty) onTap?.call(p);
        },
      );
      if (Platform.isAndroid) {
        await _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
      }
      _ready = true;
    } catch (_) {
      // Notifications unavailable (old Windows, tests) — the app works without them.
    }
  }

  static Future<void> show(int id, String title, String body, {String? payload}) async {
    if (!_ready) return;
    try {
      await _plugin.show(id: id, title: title, body: body, notificationDetails: const NotificationDetails(android: _android), payload: payload);
    } catch (_) {}
  }
}
