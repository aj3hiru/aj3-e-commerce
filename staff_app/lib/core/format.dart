import 'package:intl/intl.dart';

final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _moneyShort = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _compact = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 1);

/// ₹1,934.30
String money(num? v) => _money.format(v ?? 0);

/// ₹1,934
String moneyShort(num? v) => _moneyShort.format(v ?? 0);

/// ₹1.9K / ₹2.3L — for charts and tight tiles.
String moneyCompact(num? v) => _compact.format(v ?? 0);

/// Dates are stored in UTC; staff see India time.
DateTime ist(DateTime utc) => utc.toUtc().add(const Duration(hours: 5, minutes: 30));
DateTime? parseDate(dynamic v) => v is String && v.isNotEmpty ? DateTime.tryParse(v) : null;

String dateShort(dynamic v) {
  final d = v is DateTime ? v : parseDate(v);
  return d == null ? '—' : DateFormat('d MMM yyyy').format(ist(d));
}

String dateTime(dynamic v) {
  final d = v is DateTime ? v : parseDate(v);
  return d == null ? '—' : DateFormat('d MMM, h:mm a').format(ist(d));
}

String timeOnly(dynamic v) {
  final d = v is DateTime ? v : parseDate(v);
  return d == null ? '—' : DateFormat('h:mm a').format(ist(d));
}

/// "5 min ago", "yesterday"…
String ago(dynamic v) {
  final d = v is DateTime ? v : parseDate(v);
  if (d == null) return '—';
  final s = DateTime.now().toUtc().difference(d.toUtc());
  if (s.inSeconds < 45) return 'just now';
  if (s.inMinutes < 60) return '${s.inMinutes} min ago';
  if (s.inHours < 24) return '${s.inHours} h ago';
  if (s.inDays == 1) return 'yesterday';
  if (s.inDays < 7) return '${s.inDays} days ago';
  return dateShort(d);
}

/// Today in India as YYYY-MM-DD.
String todayYmd() => DateFormat('yyyy-MM-dd').format(ist(DateTime.now().toUtc()));

double toDouble(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int toInt(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
