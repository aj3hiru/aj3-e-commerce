part of 'order_detail_screen.dart';

/// Windows: the website's order page — header card with status / payment pills and total,
/// progress steps, items and totals, history, and a "Next step" column.
final _ovPrefs = DisplayPrefs('ecom_order_view_display');

extension _OrderDetailWeb on _OrderDetailScreenState {
  /// Follows the website's Display Options for the order page.
  Widget _web(AppState s, Map<String, dynamic> o, List<Map<String, dynamic>> agents, String? agentName, bool mine) =>
      ListenableBuilder(listenable: _ovPrefs, builder: (context, _) => _webBody(s, o, agents, agentName, mine, _ovPrefs.on, _ovPrefs.item));

  /// Remove a line / add a product (website: order page items table). Shows at once, synced like every change.
  Future<void> _itemChange(Map<String, dynamic> o, String label, Map<String, dynamic> body, Map<String, dynamic> effect) async {
    final s = context.read<AppState>();
    await s.enqueue(OutboxItem(id: newId(), method: 'POST', path: '/api/ecommerce/orders/${o['id']}/items', body: body, label: label,
        effect: {'kind': 'order_items', 'id': o['id'], ...effect}, refresh: const ['orders', 'products']));
    if (mounted) toast(context, '$label ✓');
  }

  Future<void> _addProduct(Map<String, dynamic> o) async {
    final s = context.read<AppState>();
    final products = s.list('products').where((p) => p['status'] == 'active').toList();
    Map<String, dynamic>? pick;
    var qty = 1;
    final ok = await showDDialog<bool>(
      context,
      title: 'Add a product to ${o['number']}',
      width: 480,
      actions: [const DAction.cancel(), DAction('Add', primary: true, onPressed: () async => pick == null ? toast(context, 'Choose a product.', error: true) : popDialog(context, true))],
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          DSelect<int>(
            value: pick == null ? 0 : toInt(pick!['id']),
            options: [(0, 'Choose a product…'), for (final p in products) (toInt(p['id']), '${p['name']} — ${money(toDouble(p['salePrice']) > 0 ? p['salePrice'] : p['price'])}')],
            onChanged: (v) => set(() => pick = products.where((p) => toInt(p['id']) == v).firstOrNull),
          ),
          const SizedBox(height: 12),
          Row(children: [
            const Text('Quantity', style: TextStyle(fontSize: 13, color: W.g700)),
            const SizedBox(width: 12),
            DButton.icon(LucideIcons.minus, tooltip: 'Less', size: DSize.sm, variant: DVariant.secondary, onPressed: qty > 1 ? () => set(() => qty--) : null),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('$qty', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
            DButton.icon(LucideIcons.plus, tooltip: 'More', size: DSize.sm, variant: DVariant.secondary, onPressed: () => set(() => qty++)),
          ]),
        ]),
      ),
    );
    if (ok != true || pick == null || !mounted) return;
    final price = toDouble(pick!['salePrice']) > 0 ? toDouble(pick!['salePrice']) : toDouble(pick!['price']);
    await _itemChange(o, 'Add ${pick!['name']} to ${o['number']}', {'action': 'add_item', 'productId': toInt(pick!['id']), 'addQty': qty},
        {'op': 'add', 'item': {'productId': toInt(pick!['id']), 'name': pick!['name'], 'qty': qty, 'price': price, 'gstRate': toDouble(pick!['gstRate'])}});
  }

  Widget _webBody(AppState s, Map<String, dynamic> o, List<Map<String, dynamic>> agents, String? agentName, bool mine, bool Function(String, [String?]) on, bool Function(String) one) {
    final p = s.perms;
    final st = '${o['status']}';
    final online = o['type'] == 'online';
    final items = ((o['items'] as List?) ?? const []).cast<Map>();
    final phone = o['phone'] as String?;
    final paid = o['paymentStatus'] == 'Paid';
    final canMarkPaid = online && !paid && st != 'Canceled' && (widget.agentView ? mine : p.markPaid);
    final events = ((_extra?['events'] as List?) ?? const []).cast<Map>().toList().reversed.toList();
    final customer = s.list('customers').where((c) => toInt(c['id']) == toInt(o['customerId'])).firstOrNull;
    String digits(String v) => v.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^91(?=\d{10}$)'), '');

    Widget square(IconData icon, VoidCallback onTap, {Color color = W.g700, String? tip}) => Padding(
          padding: const EdgeInsets.only(left: 8),
          child: Tooltip(
            message: tip ?? '',
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(8),
              child: Container(width: 40, height: 40, decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 17, color: color)),
            ),
          ),
        );

    final header = WebCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 20, 16),
      child: Row(children: [
        IconButton(onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(LucideIcons.arrowLeft, size: 20, color: W.g600)),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text('${o['number']}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: W.g900))),
              if (on('ov-header', 'ov-h-type')) ...[
                const SizedBox(width: 10),
                online ? const WebBadge('Online order', color: W.primary, bg: W.primaryLighter) : const WebBadge('In-store bill', color: Color(0xFFB45309), bg: Color(0xFFFEF3C7)),
              ],
            ]),
            if (on('ov-header', 'ov-h-date')) ...[
              const SizedBox(height: 4),
              Row(children: [const Icon(LucideIcons.calendar, size: 14, color: W.g500), const SizedBox(width: 6), Text(dateTime(o['createdAt']), style: const TextStyle(fontSize: 13, color: W.g600))]),
            ],
          ]),
        ),
        if (on('ov-header', 'ov-h-pills')) ...[
          WebPillMenu(value: st, options: widget.agentView ? [st] : statusChoices(p, o), onSelected: (v) => setOrderStatus(context, o, v).then((_) => _loadExtra())),
          const SizedBox(width: 8),
          WebPillMenu(value: paid ? 'Paid' : 'Unpaid', options: const ['Unpaid', 'Paid'], color: paid ? W.green : W.grey, onSelected: canMarkPaid ? (_) => _collect(o) : null),
          const SizedBox(width: 12),
        ],
        if (on('ov-header', 'ov-h-total')) ...[
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            const Text('Total', style: TextStyle(fontSize: 12, color: W.g500)),
            Text(money(o['total']), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: W.g900)),
          ]),
          const SizedBox(width: 12),
        ],
        if (!widget.agentView) Padding(padding: const EdgeInsets.only(right: 8), child: DisplayOptionsButton(displayDefs['ecom_order_view_display']!)),
        if (on('ov-header', 'ov-h-print')) WebButton('Print', icon: LucideIcons.printer, onPressed: () => _print(s, o)),
        if (phone != null && on('ov-header', 'ov-h-contact')) square(LucideIcons.phone, () => launchUrl(Uri.parse('tel:$phone')), tip: 'Call $phone'),
        if (phone != null && on('ov-header', 'ov-h-contact')) square(LucideIcons.messageCircle, () => launchUrl(Uri.parse('https://wa.me/91${digits(phone)}'), mode: LaunchMode.externalApplication), color: W.green, tip: 'WhatsApp'),
      ]),
    );

    // Progress: Placed → Accepted → Out for delivery → Delivered.
    const steps = ['Placed', 'Accepted', 'Out for delivery', 'Delivered'];
    final reached = switch (st) { 'Pending' => 0, 'In Progress' => 1, 'Out for Delivery' => 2, 'Delivered' => 3, _ => -1 };
    final progress = WebCard(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
      child: st == 'Canceled'
          ? Row(children: [
              const Icon(LucideIcons.circleX, color: Color(0xFFDC2626), size: 20),
              const SizedBox(width: 10),
              Expanded(child: Text('This order was cancelled${o['cancelReason'] != null ? ' — ${o['cancelReason']}' : ''}.', style: const TextStyle(fontSize: 13, color: Color(0xFFB91C1C), fontWeight: FontWeight.w500))),
            ])
          : Row(children: [
              for (var i = 0; i < steps.length; i++) ...[
                Column(children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: i <= reached ? W.blue : Colors.white, shape: BoxShape.circle, border: Border.all(color: i <= reached ? W.blue : W.g300, width: 1.5)),
                    child: Icon(i < reached || (i == reached && i == 3) ? LucideIcons.check : [LucideIcons.check, LucideIcons.check, LucideIcons.truck, LucideIcons.package][i], size: 17, color: i <= reached ? Colors.white : W.g400),
                  ),
                  const SizedBox(height: 8),
                  Text(steps[i], style: TextStyle(fontSize: 12.5, fontWeight: i <= reached ? FontWeight.w600 : FontWeight.w400, color: i <= reached ? W.g900 : W.g400)),
                ]),
                if (i < steps.length - 1) Expanded(child: Container(height: 2, margin: const EdgeInsets.only(bottom: 26, left: 8, right: 8), color: i < reached ? W.blue : W.g200)),
              ],
            ]),
    );

    const head = TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: W.g500, letterSpacing: .6);
    Widget total(String a, String b, {bool bold = false, Color? color}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            const Spacer(flex: 3),
            Expanded(flex: 2, child: Text(a, style: TextStyle(fontSize: bold ? 17 : 14.5, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, color: bold ? W.g900 : W.g600))),
            Text(b, style: TextStyle(fontSize: bold ? 17 : 14.5, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: color ?? W.g900)),
          ]),
        );
    // Items can be changed while the order is still open (as on the website).
    final editable = !widget.agentView && st != 'Delivered' && st != 'Canceled' && p.seesOrders && o['localRef'] == null;
    bool c(String k) => on('ov-items', k);
    final itemCols = <(String, int, TextAlign)>[
      if (c('ov-c-num')) ('#', 0, TextAlign.left),
      if (c('ov-c-product')) ('PRODUCT', 5, TextAlign.left),
      if (c('ov-c-qty')) ('QTY', 1, TextAlign.left),
      if (c('ov-c-price')) ('PRICE', 2, TextAlign.right),
      if (c('ov-c-gst')) ('GST', 1, TextAlign.right),
      if (c('ov-c-subtotal')) ('AMOUNT', 2, TextAlign.right),
      if (c('ov-c-remove') && editable) ('', 0, TextAlign.right),
    ];
    Widget col((String, int, TextAlign) x, Widget child) => x.$2 == 0 ? SizedBox(width: x.$1 == '#' ? 30 : 40, child: child) : Expanded(flex: x.$2, child: child);
    Widget cellFor((String, int, TextAlign) x, int i) {
      final it = items[i];
      return switch (x.$1) {
        '#' => Text('${i + 1}', style: const TextStyle(color: W.g500)),
        'PRODUCT' => Row(children: [
            if (c('ov-c-image')) ...[
              NetImage(s.list('products').where((x) => toInt(x['id']) == toInt(it['productId'])).firstOrNull?['image'], size: 40, radius: 6),
              const SizedBox(width: 10),
            ],
            Expanded(child: Text('${it['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g900))),
          ]),
        'QTY' => Text('${it['qty']}', style: const TextStyle(fontSize: 13)),
        'PRICE' => Text(money(it['price']), textAlign: TextAlign.right, style: const TextStyle(fontSize: 13)),
        'GST' => Text('${toDouble(it['gstRate']).toStringAsFixed(0)}%', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, color: W.g600)),
        'AMOUNT' => Text(money(toDouble(it['qty']) * toDouble(it['price'])), textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        _ => Align(
            alignment: Alignment.centerRight,
            child: WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Remove ${it['name']}', onTap: items.length <= 1 || it['id'] == null
                ? () => toast(context, items.length <= 1 ? 'An order needs at least one item — cancel the order instead.' : 'Refresh first (F5), then remove it.', error: true)
                : () async {
                    if (!await confirm(context, 'Remove item?', 'Remove ${it['name']} from ${o['number']}? The total is worked out again.', ok: 'Remove', danger: true)) return;
                    await _itemChange(o, 'Remove ${it['name']} from ${o['number']}', {'action': 'remove_item', 'itemId': toInt(it['id'])}, {'op': 'remove', 'itemId': toInt(it['id'])});
                  }),
          ),
      };
    }
    final itemsCard = WebCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
          child: Row(children: [
            const Icon(LucideIcons.package, size: 17, color: W.blue),
            const SizedBox(width: 10),
            const Text('Items', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
            const SizedBox(width: 8),
            Text('(${items.length})', style: const TextStyle(fontSize: 13, color: W.g500)),
            const Spacer(),
            if (editable && c('ov-i-add')) WebButton('Add a product', icon: LucideIcons.plus, onPressed: () => _addProduct(o)),
          ]),
        ),
        Container(
          color: W.g50,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [for (final x in itemCols) col(x, Text(x.$1, style: head, textAlign: x.$3))]),
        ),
        for (var i = 0; i < items.length; i++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: W.g100))),
            child: Row(children: [for (final x in itemCols) col(x, cellFor(x, i))]),
          ),
        if (on('ov-bill'))
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              if (on('ov-bill', 'ov-b-subtotal')) total('Subtotal', money(o['subtotal'])),
              if (on('ov-bill', 'ov-b-discount') && toDouble(o['discount']) > 0) total('Discount', '-${money(o['discount'])}', color: const Color(0xFF16A34A)),
              if (on('ov-bill', 'ov-b-gst')) total('GST', money(o['gst'])),
              if (toDouble(o['delivery']) > 0) total('Delivery charge', money(o['delivery'])),
              const Row(children: [Spacer(flex: 3), Expanded(flex: 2, child: Divider(height: 14, color: W.g200))]),
              total('Total', money(o['total']), bold: true),
              if (on('ov-bill', 'ov-b-paid')) total('Paid', money(paid ? o['total'] : toDouble(o['total']) - (toDouble(o['due']) > 0 ? toDouble(o['due']) : toDouble(o['total'])))),
              if (on('ov-bill', 'ov-b-due') && (toDouble(o['due']) > 0 || (!paid && st != 'Canceled'))) total('Due', money(toDouble(o['due']) > 0 ? o['due'] : o['total']), color: const Color(0xFFDC2626)),
            ]),
          ),
      ]),
    );

    final history = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const WebCardTitle('Order history', icon: LucideIcons.history, iconColor: W.blue),
        if (_extra == null) const Text('No history yet.', style: TextStyle(color: W.g500)),
        for (final e in events)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(padding: const EdgeInsets.only(top: 5, right: 14), child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: W.blue, shape: BoxShape.circle))),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_eventText(e), style: const TextStyle(fontSize: 13, color: W.g900)),
                  Text('${dateTime(e['createdAt'])} · ${e['actorName'] ?? ''}', style: const TextStyle(fontSize: 12, color: W.g500)),
                  if (e['note'] != null) Text('${e['note']}', style: const TextStyle(fontSize: 12.5, color: W.g700)),
                ]),
              ),
            ]),
          ),
      ]),
    );

    // Next step: agent, payment, delivered / cancel — whatever this person may do now.
    final next = <Widget>[
      if (online && p.assignDelivery && !widget.agentView && (st == 'In Progress' || st == 'Out for Delivery'))
        _box(LucideIcons.bike, 'Delivery agent', [
          if (agentName != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text.rich(TextSpan(children: [
                TextSpan(text: agentName, style: const TextStyle(fontWeight: FontWeight.w700, color: W.g900)),
                if (o['assignedAt'] != null) TextSpan(text: '  · since ${dateTime(o['assignedAt'])}', style: const TextStyle(color: W.g500, fontSize: 12)),
              ])),
            ),
          WebSelect<int>(
            value: toInt(o['agentId']),
            options: [if (o['agentId'] == null) (0, 'Choose an agent…'), for (final a in agents) (toInt(a['id']), '${a['name']}')],
            onChanged: (id) {
              if (id != 0 && id != toInt(o['agentId'])) {
                final a = agents.firstWhere((x) => toInt(x['id']) == id);
                _act('Assign ${o['number']} to ${a['name']}', {'action': 'assign', 'agentId': id}, {'agentId': id, 'status': 'Out for Delivery', 'assignedAt': DateTime.now().toUtc().toIso8601String()});
              }
            },
          ),
        ]),
      if (canMarkPaid)
        _box(LucideIcons.banknote, 'Collect ${money(o['total'])}', [
          SizedBox(width: double.infinity, child: WebButton('Mark Paid', color: const Color(0xFF059669), onPressed: () => _collect(o))),
        ], iconColor: const Color(0xFF059669)),
      if (online && st == 'Pending' && (p.acceptReject || p.updateStatus) && !widget.agentView)
        SizedBox(width: double.infinity, child: WebButton('Accept order', icon: LucideIcons.check, color: W.blue, height: 46, onPressed: () => _act('Accept ${o['number']}', {'action': 'update_status', 'orderStatus': 'In Progress'}, {'status': 'In Progress'}))),
      if (online && widget.agentView && mine && st == 'In Progress')
        SizedBox(width: double.infinity, child: WebButton('Start delivery', icon: LucideIcons.navigation, color: W.blue, height: 46, onPressed: () => _act('Start delivery ${o['number']}', {'action': 'start'}, {'status': 'Out for Delivery'}, delivery: true))),
      if (online && st == 'Out for Delivery' && (widget.agentView ? mine : p.updateStatus))
        SizedBox(
          width: double.infinity,
          child: WebButton('Mark delivered', icon: LucideIcons.packageCheck, color: const Color(0xFF10B981), height: 46, onPressed: () async {
            if (await confirm(context, 'Delivered?', 'Mark ${o['number']} as delivered to ${o['customer']}.', ok: 'Delivered')) {
              widget.agentView
                  ? _act('Delivered ${o['number']}', {'action': 'deliver'}, {'status': 'Delivered', 'deliveredAt': DateTime.now().toUtc().toIso8601String()}, delivery: true)
                  : _act('Delivered ${o['number']}', {'action': 'update_status', 'orderStatus': 'Delivered'}, {'status': 'Delivered', 'deliveredAt': DateTime.now().toUtc().toIso8601String()});
            }
          }),
        ),
      if (online && widget.agentView && mine && (st == 'Out for Delivery' || st == 'In Progress'))
        TextButton(
          onPressed: () async {
            final r = await _reason("Couldn't deliver", const ['Customer not reachable', 'Customer not at home', 'Wrong address', 'Customer asked to come later']);
            if (r != null) _act('Delivery attempt ${o['number']}', {'action': 'fail', 'note': r}, st == 'Out for Delivery' ? {'status': 'In Progress'} : {}, delivery: true);
          },
          child: const Text("Couldn't deliver", style: TextStyle(color: Color(0xFFD97706))),
        ),
      if (online && !widget.agentView && st != 'Delivered' && st != 'Canceled' && (p.cancelOrders || (st == 'Pending' && p.acceptReject)))
        TextButton(
          onPressed: () async {
            final r = await _reason(st == 'Pending' ? 'Reject order?' : 'Cancel order?', const ['Customer cancelled', 'Out of stock', 'Address not serviceable', 'Payment issue']);
            if (r != null) _act('Cancel ${o['number']}', {'action': 'update_status', 'orderStatus': 'Canceled', 'note': r}, {'status': 'Canceled', 'cancelReason': r});
          },
          child: Text(st == 'Pending' ? 'Reject this order' : 'Cancel this order', style: const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w600)),
        ),
    ];

    // Payment details: how it was paid, and every due payment with its receipt (website: "Payment details").
    final pays = ((o['pays'] as List?) ?? const []).cast<Map>();
    final receipts = [for (final c in ((_extra?['credits'] as List?) ?? const []).cast<Map>()) ...((c['payments'] as List?) ?? const []).cast<Map>()];
    final paymentCard = WebCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Payment details', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
        const SizedBox(height: 12),
        Row(children: [const Text('Method', style: TextStyle(fontSize: 13, color: W.g500)), const Spacer(), Text('${o['paymentMethod'] == 'COD' ? 'Cash On Delivery' : o['paymentMethod'] ?? '—'}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))]),
        const SizedBox(height: 6),
        Row(children: [const Text('Status', style: TextStyle(fontSize: 13, color: W.g500)), const Spacer(), Text(paid ? 'Paid' : 'Unpaid', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: paid ? W.green : const Color(0xFFDC2626)))]),
        for (final x in pays) ...[
          const SizedBox(height: 6),
          Row(children: [Text('${x['method']}', style: const TextStyle(fontSize: 13, color: W.g700)), const Spacer(), Text(money(x['amount']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))]),
        ],
        if (receipts.isNotEmpty) ...[
          const Divider(height: 22),
          const Text('Due payments', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: W.g500)),
          for (final r in receipts)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(children: [
                Expanded(child: Text('${r['receipt']} · ${r['method']}\n${dateTime(r['at'])}', style: const TextStyle(fontSize: 12.5, color: W.g700, height: 1.35))),
                Text(money(r['amount']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.green)),
              ]),
            ),
        ],
      ]),
    );
    final mapCard = o['lat'] == null
        ? null
        : WebCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Delivery spot', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
              const SizedBox(height: 10),
              Container(
                height: 120,
                decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFBFDBFE))),
                child: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(LucideIcons.mapPin, size: 28, color: Color(0xFFDC2626)),
                    const SizedBox(height: 6),
                    Text('${toDouble(o['lat']).toStringAsFixed(5)}, ${toDouble(o['lng']).toStringAsFixed(5)}', style: const TextStyle(fontSize: 12.5, color: W.g700)),
                  ]),
                ),
              ),
              const SizedBox(height: 10),
              WebButton('Open in Google Maps', icon: LucideIcons.navigation, onPressed: () => launchUrl(Uri.parse('https://www.google.com/maps?q=${o['lat']},${o['lng']}'), mode: LaunchMode.externalApplication)),
            ]),
          );

    final side = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (next.isNotEmpty && on('ov-side', 'ov-s-actions'))
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Next step', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
            const SizedBox(height: 14),
            for (final w in next) Padding(padding: const EdgeInsets.only(bottom: 12), child: w),
          ]),
        ),
      if (next.isNotEmpty && on('ov-side', 'ov-s-actions')) const SizedBox(height: 12),
      if (on('ov-side', 'ov-s-customer')) WebCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Customer', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
          const SizedBox(height: 14),
          Row(children: [
            Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: W.primaryLighter, shape: BoxShape.circle),
                child: Text('${o['customer']}'.isEmpty ? '?' : '${o['customer']}'[0].toUpperCase(), style: const TextStyle(color: W.primary, fontWeight: FontWeight.w700, fontSize: 14))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${o['customer']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.g900)),
                if (customer != null)
                  InkWell(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerProfile(id: toInt(customer['id'])))),
                    child: const Text('View profile', style: TextStyle(fontSize: 12.5, color: W.blue)),
                  ),
              ]),
            ),
          ]),
          if (phone != null) ...[const SizedBox(height: 12), Row(children: [const Icon(LucideIcons.phone, size: 15, color: W.g500), const SizedBox(width: 10), Text(phone, style: const TextStyle(fontSize: 13))])],
          if (customer?['email'] != null) ...[const SizedBox(height: 8), Row(children: [const Icon(LucideIcons.mail, size: 15, color: W.g500), const SizedBox(width: 10), Expanded(child: Text('${customer!['email']}', style: const TextStyle(fontSize: 13)))])],
        ]),
      ),
      if (on('ov-side', 'ov-s-payment')) ...[const SizedBox(height: 12), paymentCard],
      if (mapCard != null && on('ov-side', 'ov-s-map')) ...[const SizedBox(height: 12), mapCard],
      if (o['address'] != null && on('ov-side', 'ov-s-address')) ...[
        const SizedBox(height: 12),
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Delivery address', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
            const SizedBox(height: 10),
            Text('${o['address']}', style: const TextStyle(fontSize: 13, height: 1.45, color: W.g800)),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: WebButton('Open in Maps', icon: LucideIcons.mapPin, onPressed: () {
                final dest = o['lat'] != null ? '${o['lat']},${o['lng']}' : Uri.encodeComponent('${o['address']}');
                launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$dest'), mode: LaunchMode.externalApplication);
              }),
            ),
          ]),
        ),
      ],
    ]);

    return WebPage(
      title: 'Order ${o['number']}',
      subtitle: online ? 'Online order — items, delivery, payment and history' : 'Store bill — items, payment and history',
      onRefresh: () async {
        await s.syncNow(only: const ['orders', 'deliveries']);
        await _loadExtra();
      },
      children: [
        header,
        const SizedBox(height: 12),
        if (online && one('ov-progress')) ...[progress, const SizedBox(height: 12)],
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(flex: 7, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [if (on('ov-items')) ...[itemsCard, const SizedBox(height: 12)], if (one('ov-history')) history])),
          const SizedBox(width: 12),
          Expanded(flex: 4, child: side),
        ]),
      ],
    );
  }

  Widget _box(IconData icon, String title, List<Widget> children, {Color iconColor = W.blue}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Icon(icon, size: 16, color: iconColor), const SizedBox(width: 8), Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900))]),
          const SizedBox(height: 10),
          ...children,
        ]),
      );
}
