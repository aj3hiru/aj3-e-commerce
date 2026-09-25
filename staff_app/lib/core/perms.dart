/// What the signed-in staff member may do — the same permission set the website uses.
class Perms {
  final Map<String, dynamic> raw;
  final String role;
  const Perms(this.raw, this.role);

  bool has(String group, String key) {
    final g = raw[group];
    return g is Map && g[key] == true;
  }

  bool get isAdmin => role == 'admin';
  bool get billing => has('ecommerce', 'manage_billing');
  bool get products => has('ecommerce', 'manage_products');
  bool get categories => has('ecommerce', 'manage_categories');
  bool get customers => has('ecommerce', 'manage_customers');
  bool get credits => has('ecommerce', 'manage_credits');
  bool get ordersAdmin => has('ecommerce', 'manage_orders');
  bool get ordersView => has('orders', 'view');
  bool get acceptReject => has('orders', 'accept_reject');
  bool get updateStatus => has('orders', 'update_status');
  bool get assignDelivery => has('orders', 'assign_delivery');
  bool get markPaid => has('orders', 'mark_paid');
  bool get cancelOrders => has('orders', 'cancel');
  bool get deliver => has('delivery', 'deliver');
  bool get deliveryBoard => has('delivery', 'view_all');
  bool get staff => has('users', 'create');
  bool get staffEdit => has('users', 'edit');
  bool get changeRoles => has('users', 'change_roles');

  bool get seesPos => billing;
  bool get seesOrders => ordersView;
  bool get seesMyDeliveries => deliver;
  bool get seesProducts => products;
  bool get seesCustomers => customers || billing;
  bool get seesDues => credits || billing || customers;
  bool get seesReports => ordersAdmin || billing;
  bool get seesStaff => staff;
}
