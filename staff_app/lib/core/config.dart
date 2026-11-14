/// App-wide constants.
class AppConfig {
  /// The staff site the app talks to. Can be changed on the login screen (Advanced).
  static const defaultServer = 'https://sriandaltraders.co.in';

  /// The store is on one domain now: a saved address on an old subdomain (login. / admin. / delivery.) becomes the main domain.
  static String upgradeServer(String s) => s.replaceFirstMapped(
      RegExp(r'^(https?://)(?:login|admin|delivery)\.(sriandaltraders\.co\.in)', caseSensitive: false), (m) => '${m[1]}${m[2]}');

  /// Where uploaded photos are served from (the customers' site serves /uploads too).
  static const appName = 'Sri Andal Staff';

  /// How often the app checks for new data while it is open and online.
  static const syncEvery = Duration(seconds: 20);

  /// A request that takes longer than this is treated as "no connection".
  static const requestTimeout = Duration(seconds: 20);
}
