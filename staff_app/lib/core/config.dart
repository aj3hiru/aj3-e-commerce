/// App-wide constants.
class AppConfig {
  /// The staff site the app talks to. Can be changed on the login screen (Advanced).
  static const defaultServer = 'https://admin.sriandaltraders.co.in';

  /// Where uploaded photos are served from (the customers' site serves /uploads too).
  static const appName = 'Sri Andal Staff';

  /// How often the app checks for new data while it is open and online.
  static const syncEvery = Duration(seconds: 20);

  /// A request that takes longer than this is treated as "no connection".
  static const requestTimeout = Duration(seconds: 20);
}
