import 'package:flutter/foundation.dart';

import '../../core/format.dart';

class CartLine {
  final Map<String, dynamic> product;
  int qty;
  double unitPrice;
  bool overridden;
  String? unit;
  CartLine(this.product, {this.qty = 1})
      : unitPrice = CartLine.shelfPrice(product),
        overridden = false,
        unit = product['unit'] as String?;

  int get productId => toInt(product['id']);
  String get name => product['name'] ?? '';
  double get gstRate => toDouble(product['gstRate']);
  int? get stock => product['stock'] == null ? null : toInt(product['stock']);
  bool get tracked => product['type'] == 'physical' && stock != null;
  double get total => unitPrice * qty;

  /// Same rule as the website: the sale price when it is lower than the price.
  static double shelfPrice(Map<String, dynamic> p) {
    final price = toDouble(p['price']);
    final sale = p['salePrice'] == null ? 0.0 : toDouble(p['salePrice']);
    return sale > 0 && sale < price ? sale : price;
  }
}

class PayRow {
  String method;
  String amount;
  PayRow(this.method, this.amount);
}

/// The bill being made — same totals as the website's POS (coupon share, GST after discount).
class PosCart extends ChangeNotifier {
  final List<CartLine> lines = [];
  Map<String, dynamic>? coupon;
  final List<PayRow> payments = [PayRow('Cash', '')];
  bool paymentsEdited = false;
  Map<String, dynamic>? customer; // an existing customer
  String customerName = '';
  String customerPhone = '';
  bool guest = false;
  DateTime? promisedDate;

  /// Adds one; returns a message when stock stops it.
  String? add(Map<String, dynamic> product, {int qty = 1}) {
    final i = lines.indexWhere((l) => l.productId == toInt(product['id']));
    if (product['status'] == 'inactive') return '"${product['name']}" is inactive.';
    if (i >= 0) {
      final l = lines[i];
      if (l.tracked && l.qty + qty > l.stock!) return 'Only ${l.stock} of "${l.name}" in stock.';
      l.qty += qty;
      lines.insert(0, lines.removeAt(i)); // last touched on top
    } else {
      final l = CartLine(product, qty: qty);
      if (l.tracked && l.stock! < qty) return l.stock == 0 ? '"${l.name}" is out of stock.' : 'Only ${l.stock} of "${l.name}" in stock.';
      lines.insert(0, l);
    }
    notifyListeners();
    return null;
  }

  String? setQty(CartLine l, int qty) {
    if (qty < 1) qty = 1;
    String? msg;
    if (l.tracked && qty > l.stock!) {
      qty = l.stock!;
      msg = 'Only ${l.stock} in stock.';
    }
    l.qty = qty;
    notifyListeners();
    return msg;
  }

  void setPrice(CartLine l, double price) {
    l.unitPrice = price < 0 ? 0 : price;
    l.overridden = true;
    notifyListeners();
  }

  void setUnit(CartLine l, String? unit) {
    l.unit = unit == null || unit.trim().isEmpty ? null : unit.trim();
    notifyListeners();
  }

  void remove(CartLine l) {
    lines.remove(l);
    notifyListeners();
  }

  void setCoupon(Map<String, dynamic>? c) {
    coupon = c;
    notifyListeners();
  }

  double get subtotal => lines.fold(0, (s, l) => s + l.total);

  double get discount {
    final c = coupon;
    if (c == null) return 0;
    double eligible = 0;
    for (final l in lines) {
      final a = c['appliesTo'];
      final match = a == 'all' || (a == 'product' && toInt(c['productId']) == l.productId) || (a == 'category' && c['categoryId'] != null && toInt(c['categoryId']) == toInt(l.product['categoryId']));
      if (match) eligible += l.total;
    }
    if (eligible <= 0) return 0;
    final v = toDouble(c['discountValue']);
    return c['discountType'] == 'percentage' ? eligible * v / 100 : (v < eligible ? v : eligible);
  }

  double get gst {
    final sub = subtotal, disc = discount;
    double g = 0;
    for (final l in lines) {
      final share = sub > 0 ? disc * (l.total / sub) : 0;
      final taxable = (l.total - share).clamp(0, double.infinity);
      g += taxable * l.gstRate / 100;
    }
    return g;
  }

  double get grandTotal => (subtotal - discount).clamp(0, double.infinity) + gst;

  /// Payment rows as they will be sent (a single untouched row = the bill total).
  List<PayRow> get effectivePayments =>
      !paymentsEdited && payments.length == 1 ? [PayRow(payments.first.method, grandTotal.toStringAsFixed(2))] : payments;

  double get paid => effectivePayments.fold(0, (s, p) => s + (double.tryParse(p.amount) ?? 0));
  double get due => (grandTotal - paid).clamp(0, double.infinity);
  double get change => (paid - grandTotal).clamp(0, double.infinity);

  void editPayment(int i, {String? method, String? amount}) {
    if (!paymentsEdited && payments.length == 1) payments[0].amount = grandTotal.toStringAsFixed(2);
    paymentsEdited = true;
    if (method != null) payments[i].method = method;
    if (amount != null) payments[i].amount = amount;
    notifyListeners();
  }

  void addPayment() {
    if (!paymentsEdited && payments.length == 1) payments[0].amount = grandTotal.toStringAsFixed(2);
    paymentsEdited = true;
    payments.add(PayRow('UPI', ''));
    notifyListeners();
  }

  void removePayment(int i) {
    if (payments.length > 1) payments.removeAt(i);
    notifyListeners();
  }

  void setCustomer(Map<String, dynamic>? c) {
    customer = c;
    if (c != null) {
      customerName = c['name'] ?? '';
      customerPhone = c['phone'] ?? '';
      guest = false;
    }
    notifyListeners();
  }

  void setGuest(bool v) {
    guest = v;
    if (v) {
      customer = null;
      customerName = '';
      customerPhone = '';
    }
    notifyListeners();
  }

  void touch() => notifyListeners();

  void clear() {
    lines.clear();
    coupon = null;
    payments
      ..clear()
      ..add(PayRow('Cash', ''));
    paymentsEdited = false;
    customer = null;
    customerName = '';
    customerPhone = '';
    guest = false;
    promisedDate = null;
    notifyListeners();
  }
}
