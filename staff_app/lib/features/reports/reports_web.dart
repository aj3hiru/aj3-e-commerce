part of 'reports_screen.dart';

/// Windows: the website's Report Builder — presets and filters on top, the printable report on the
/// left (header, numbers, timeline and summaries), payment / channel / status / due-aging summaries
/// and export on the right. Every part and every column follows the website's Display Options.
extension _ReportsWeb on _ReportsScreenState {
  Widget _webPage(Map<String, dynamic>? r, Map k, List<Map> staffList, String? preset) {
    final on = _prefs.on;
    Widget presetBtn(String label, String range, {IconData? icon, VoidCallback? onTap}) {
      final sel = preset == range;
      return Padding(
        padding: const EdgeInsets.only(right: 10),
        child: SizedBox(
          height: 40,
          child: TextButton(
            onPressed: onTap ?? () => _set({'range': range}),
            style: TextButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: sel ? W.primary : W.g800,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: BorderSide(color: sel ? W.primary : W.g200, width: sel ? 1.5 : 1)),
              textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 13, fontWeight: FontWeight.w500),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 15), const SizedBox(width: 8)],
              Text(label),
            ]),
          ),
        ),
      );
    }

    Widget channelBtn(String label, String? value, IconData icon) => Padding(
          padding: const EdgeInsets.only(left: 10),
          child: WebButton(label, icon: icon, color: _params['channel'] == value ? W.primary : null, onPressed: () => _setChannel(value)),
        );

    final showStaff = on('rb-filters', 'rb-f-staff') && (staffList.length > 1 || _params['user'] != null);
    final showChannel = on('rb-filters', 'rb-f-channel');
    final top = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 10, children: [
        if (on('rb-filters', 'rb-f-presets') || on('rb-filters', 'rb-f-month') || on('rb-filters', 'rb-f-range'))
          const Padding(padding: EdgeInsets.only(right: 14), child: Text('Date Presets', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900))),
        if (on('rb-filters', 'rb-f-presets')) ...[
          presetBtn('Today', 'today'),
          presetBtn('Yesterday', 'yesterday'),
          presetBtn('This Month', 'this_month'),
          presetBtn('Previous Month', 'prev_month'),
        ],
        if (on('rb-filters', 'rb-f-month')) presetBtn(preset == 'month' ? '${r?['rangeLabel'] ?? 'Month'}' : 'Month', 'month', icon: LucideIcons.calendar, onTap: _pickMonth),
        if (on('rb-filters', 'rb-f-range')) presetBtn(preset == 'custom' ? '${r?['rangeLabel'] ?? 'Custom Range'}' : 'Custom Range', 'custom', icon: LucideIcons.calendarRange, onTap: _pickRange),
      ]),
      if (showStaff || showChannel) ...[
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          if (showStaff)
            WebSelect<String>(
              width: 250,
              icon: LucideIcons.user,
              value: _params['user'] ?? '',
              options: [('', 'Whole business'), for (final u in staffList) ('${u['id']}', '${u['name']} · ${u['role']}')],
              onChanged: _setUser,
            ),
          if (showChannel) ...[
            channelBtn('All Sales', null, LucideIcons.funnel),
            channelBtn('In-store', 'offline', LucideIcons.store),
            channelBtn('Online', 'online', LucideIcons.globe),
          ],
        ]),
      ],
    ]);

    final side = r == null ? null : _webSide(r);
    final children = <Widget>[
      top,
      if (_loading) const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator(minHeight: 3)),
      if (_error != null && r == null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626)))),
      const SizedBox(height: 12),
      if (r == null && !_loading) const WebCard(child: Text('This report opens here as soon as it has been made once.', style: TextStyle(color: W.g600))),
      if (r != null)
        LayoutBuilder(
          builder: (c, box) {
            final left = _webReport(r, k);
            if (side == null) return left;
            if (box.maxWidth < 1000) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [left, const SizedBox(height: 12), side]);
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 64, child: left), const SizedBox(width: 12), Expanded(flex: 36, child: side)]);
          },
        ),
    ];

    return WebPage(
      title: 'Report Builder',
      subtitle: 'Generate and analyze your sales performance',
      onRefresh: _load,
      actions: [DisplayOptionsButton(displayDefs['ecom_report_builder_display']!)],
      children: children,
    );
  }

  Widget _webReport(Map<String, dynamic> r, Map k) {
    final on = _prefs.on;
    final biz = (r['business'] as Map?) ?? {};
    Widget kpi(IconData icon, Color c, String label, String value, String sub) => Row(children: [
          Container(width: 46, height: 46, decoration: BoxDecoration(color: c.withValues(alpha: .1), shape: BoxShape.circle), child: Icon(icon, size: 21, color: c)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 12.5, color: W.g700)),
              FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: W.g900))),
              Text(sub, style: const TextStyle(fontSize: 12, color: W.g500)),
            ]),
          ),
        ]);
    Widget chip(IconData icon, String label, String value) => Container(
          margin: const EdgeInsets.only(right: 10, bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 14, color: W.primary),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(fontSize: 12.5, color: W.g600)),
            const SizedBox(width: 6),
            Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: W.g900)),
          ]),
        );
    Widget heading(IconData icon, String title, [String? right]) => Padding(
          padding: const EdgeInsets.only(top: 26, bottom: 12),
          child: Row(children: [
            Icon(icon, size: 17, color: W.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.primary))),
            if (right != null) Text(right, style: const TextStyle(fontSize: 12, color: W.g500)),
          ]),
        );

    /// One summary table: columns are (Display Options key, heading, value); hidden columns drop out,
    /// and the whole table is hidden when its group is off or has no columns left.
    List<Widget> section(String group, IconData icon, String title, List<Map> rows, List<(String, WebCol, String Function(Map))> cols, {String? right, bool hideEmpty = false, String? highlight}) {
      final shown = cols.where((c) => on(group, c.$1)).toList();
      if (!on(group) || shown.isEmpty || (hideEmpty && rows.isEmpty)) return const [];
      final hi = highlight == null ? -1 : shown.indexWhere((c) => c.$1 == highlight);
      return [
        heading(icon, title, right),
        LayoutBuilder(builder: (c, box) {
          // Many columns: keep them readable and let the table scroll sideways.
          final need = shown.fold<double>(0, (t, c) => t + (c.$2.width ?? 95 * c.$2.flex));
          final table = WebTable(
          cols: [for (final c in shown) c.$2],
          upper: false,
          rowHeight: 44,
          rows: [
            for (final row in rows)
              [
                for (final (i, c) in shown.indexed)
                  Text(c.$3(row), maxLines: i == hi ? 1 : 2, overflow: TextOverflow.ellipsis, textAlign: c.$2.right ? TextAlign.right : TextAlign.left,
                      style: TextStyle(fontSize: 12.5, color: i == hi ? W.primary : W.g800, fontWeight: i == hi ? FontWeight.w500 : FontWeight.w400)),
              ],
          ],
          empty: const Center(child: Text('Nothing in this period.', style: TextStyle(color: W.g500))),
          );
          if (need <= box.maxWidth) return table;
          return _SideScroll(width: need, child: table);
        }),
      ];
    }

    List<Map> list(String key) => ((r[key] as List?) ?? const []).cast<Map>();
    final timeline = list('timeline'), daily = list('daily');
    String opt(dynamic v) => v == null || '$v'.isEmpty ? '—' : '$v';
    final avg = toInt(k['orders']) > 0 ? toDouble(k['sales']) / toInt(k['orders']) : 0.0;

    final kpis = [
      if (on('rb-kpi', 'rb-k-sales')) kpi(LucideIcons.indianRupee, W.primary, 'Total Sales', money(k['sales']), '${k['orders'] ?? 0} Orders'),
      if (on('rb-kpi', 'rb-k-units')) kpi(LucideIcons.shoppingBag, W.blue, 'Products Sold', '${k['units'] ?? 0}', 'Units'),
      if (on('rb-kpi', 'rb-k-due')) kpi(LucideIcons.triangleAlert, const Color(0xFFDC2626), 'Total Dues', money(k['due']), '${k['dueOrders'] ?? 0} Orders'),
      if (on('rb-kpi', 'rb-k-collected')) kpi(LucideIcons.wallet, const Color(0xFF16A34A), 'Due Collected', money(k['collected']), '${k['collections'] ?? 0} Payments'),
    ];
    final chips = [
      if (on('rb-kpi', 'rb-k-added')) chip(LucideIcons.packagePlus, 'Products Added', '${k['productsAdded'] ?? 0}'),
      if (on('rb-kpi', 'rb-k-newdue')) chip(LucideIcons.wallet, 'New Dues', '${money(k['newDues'])} · ${k['newDueCount'] ?? 0}'),
      if (on('rb-kpi', 'rb-k-avg')) chip(LucideIcons.trendingUp, 'Average Order', money(avg)),
      if (on('rb-kpi', 'rb-k-discount')) chip(LucideIcons.tag, 'Discount Given', money(k['discount'])),
      if (on('rb-kpi', 'rb-k-gst')) chip(LucideIcons.landmark, 'GST Collected', money(k['gst'])),
      if (on('rb-kpi', 'rb-k-online')) chip(LucideIcons.globe, 'Online Orders Placed', '${k['onlinePlaced'] ?? 0}'),
    ];
    final phones = ((biz['phones'] as List?) ?? const []).join(', ');
    final logo = context.read<AppState>().api.fileUrl(biz['logo'] as String?);

    return WebCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (on('rb-head'))
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (on('rb-head', 'rb-h-logo') && logo != null) ...[ClipRRect(borderRadius: BorderRadius.circular(8), child: NetImage(logo, size: 54, radius: 8)), const SizedBox(width: 12)],
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (on('rb-head', 'rb-h-name')) ...[
                  Text('${biz['name'] ?? ''}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: W.primary)),
                  if ('${biz['tagline'] ?? ''}'.isNotEmpty) Text('${biz['tagline']}', style: const TextStyle(fontSize: 12.5, color: W.g500)),
                ],
                if (on('rb-head', 'rb-h-address') && '${biz['address'] ?? ''}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${biz['address']}', style: const TextStyle(fontSize: 12.5, color: W.g700))),
                if (on('rb-head', 'rb-h-contact') && (phones.isNotEmpty || biz['email'] != null))
                  Text([if (phones.isNotEmpty) 'Mobile: $phones', if (biz['email'] != null) '${biz['email']}'].join('  ·  '), style: const TextStyle(fontSize: 12.5, color: W.g700)),
                if (on('rb-head', 'rb-h-gstin') && '${biz['gstin'] ?? ''}'.isNotEmpty) Text('GSTIN: ${biz['gstin']}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: W.g700)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(r['selectedUser'] != null ? 'Staff Report · ${r['selectedUser']['name']}' : 'Sales Report', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: W.g900)),
              const SizedBox(height: 4),
              Text('${r['rangeLabel']}', style: const TextStyle(fontSize: 14, color: W.g700)),
              if (on('rb-head', 'rb-h-generated')) ...[const SizedBox(height: 4), Text('Generated on ${dateTime(r['generatedAt'])}', style: const TextStyle(fontSize: 12.5, color: W.g500))],
            ]),
          ]),
        if (on('rb-head')) ...[const SizedBox(height: 18), const _Dashed(), const SizedBox(height: 18)],
        if (on('rb-kpi') && kpis.isNotEmpty) Row(children: [for (final w in kpis) Expanded(child: Padding(padding: const EdgeInsets.only(right: 12), child: w))]),
        if (on('rb-kpi') && chips.isNotEmpty) ...[
          const SizedBox(height: 18),
          const Divider(height: 1, color: W.g200),
          const SizedBox(height: 14),
          Wrap(children: chips),
        ],
        ...section('rb-tl', LucideIcons.clipboardList, 'Product-wise Sales Timeline', timeline.take(300).toList(), right: '${timeline.length} entries', highlight: 'rb-c-order', [
          ('rb-c-time', const WebCol('Time', flex: 1.1), (t) => dateTime(t['at'])),
          ('rb-c-order', const WebCol('Order ID', width: 124), (t) => '${t['orderNumber']}'),
          ('rb-c-channel', const WebCol('Channel', width: 86), (t) => t['channel'] == 'online' ? 'Online' : 'In-store'),
          ('rb-c-customer', const WebCol('Customer', flex: 1.2), (t) => '${t['customer']}'),
          ('rb-c-phone', const WebCol('Mobile', flex: 1), (t) => opt(t['phone'])),
          ('rb-c-product', const WebCol('Product', flex: 1.3), (t) => '${t['product']}'),
          ('rb-c-sku', const WebCol('SKU', flex: .8), (t) => opt(t['sku'])),
          ('rb-c-category', const WebCol('Category', flex: 1), (t) => opt(t['category'])),
          ('rb-c-qty', const WebCol('Qty', width: 50, right: true), (t) => '${t['qty']}'),
          ('rb-c-price', const WebCol('Unit Price', flex: .9, right: true), (t) => money(t['unitPrice'])),
          ('rb-c-total', const WebCol('Total', flex: 1.05, right: true), (t) => money(t['total'])),
          ('rb-c-gst', const WebCol('GST', flex: .8, right: true), (t) => money(t['gst'])),
          ('rb-c-payment', const WebCol('Payment', flex: .9), (t) => opt(t['payment'])),
          ('rb-c-due', const WebCol('Due', flex: .8, right: true), (t) => t['due'] == null ? '—' : money(t['due'])),
          ('rb-c-status', const WebCol('Status', flex: .9), (t) => opt(t['status'])),
          ('rb-c-staff', const WebCol('Sold / delivered by', flex: 1.1), (t) => opt(t['staff'])),
        ]),
        ...section('rb-g-products', LucideIcons.shoppingBag, 'Product Summary', list('products'), right: '${list('products').length} entries', [
          ('rb-p-name', const WebCol('Product', flex: 2), (p) => '${p['name']}'),
          ('rb-p-sku', const WebCol('SKU'), (p) => opt(p['sku'])),
          ('rb-p-category', const WebCol('Category', flex: 1.1), (p) => opt(p['category'])),
          ('rb-p-orders', const WebCol('Orders', flex: .7, right: true), (p) => '${p['orders'] ?? ''}'),
          ('rb-p-qty', const WebCol('Qty sold', flex: .8, right: true), (p) => '${p['qty']}'),
          ('rb-p-revenue', const WebCol('Revenue', flex: 1.1, right: true), (p) => money(p['revenue'])),
          ('rb-p-last', const WebCol('Last sold', flex: 1.4), (p) => p['lastSoldAt'] == null ? '—' : dateTime(p['lastSoldAt'])),
        ]),
        if (daily.length > 1)
          ...section('rb-g-daily', LucideIcons.calendarDays, 'Day-wise Summary', daily, [
            ('rb-d-day', const WebCol('Date'), (d) => dateShort('${d['day']}T06:30:00Z')),
            ('rb-d-orders', const WebCol('Orders', right: true), (d) => '${d['orders']}'),
            ('rb-d-offline', const WebCol('In-store', right: true), (d) => '${d['offline'] ?? 0}'),
            ('rb-d-online', const WebCol('Online', right: true), (d) => '${d['online'] ?? 0}'),
            ('rb-d-units', const WebCol('Units', right: true), (d) => '${d['units'] ?? ''}'),
            ('rb-d-sales', const WebCol('Sales', right: true), (d) => money(d['sales'])),
            ('rb-d-due', const WebCol('Due', right: true), (d) => money(d['due'])),
            ('rb-d-collected', const WebCol('Collected', right: true), (d) => money(d['collected'])),
          ]),
        ...section('rb-g-collections', LucideIcons.handCoins, 'Due Collections', list('collections'), right: '${list('collections').length} payments', hideEmpty: true, [
          ('rb-col-time', const WebCol('Time', flex: 1.3), (c) => dateTime(c['at'])),
          ('rb-col-receipt', const WebCol('Receipt'), (c) => opt(c['receipt'])),
          ('rb-col-customer', const WebCol('Customer', flex: 1.3), (c) => '${c['customer']}'),
          ('rb-col-order', const WebCol('Order'), (c) => opt(c['orderNumber'])),
          ('rb-col-method', const WebCol('Method', flex: .8), (c) => '${c['method']}'),
          ('rb-col-amount', const WebCol('Amount', right: true), (c) => money(c['amount'])),
          ('rb-col-by', const WebCol('Received by'), (c) => opt(c['by'])),
        ]),
        ...section('rb-g-dues', LucideIcons.wallet, 'New Dues', list('newDues'), right: '${list('newDues').length} dues', hideEmpty: true, [
          ('rb-du-time', const WebCol('Time', flex: 1.2), (d) => dateTime(d['at'])),
          ('rb-du-order', const WebCol('Order'), (d) => '${d['orderNumber']}'),
          ('rb-du-customer', const WebCol('Customer', flex: 1.2), (d) => '${d['customer']}'),
          ('rb-du-phone', const WebCol('Mobile'), (d) => opt(d['phone'])),
          ('rb-du-amount', const WebCol('Due amount', right: true), (d) => money(d['amount'])),
          ('rb-du-paid', const WebCol('Paid since', right: true), (d) => money(d['paid'])),
          ('rb-du-balance', const WebCol('Balance', right: true), (d) => money(d['balance'])),
          ('rb-du-promised', const WebCol('Promised'), (d) => d['promised'] == null ? '—' : dateShort(d['promised'])),
          ('rb-du-status', const WebCol('Status', flex: .8), (d) => '${d['status']}'),
        ]),
        ...section('rb-g-added', LucideIcons.packagePlus, 'Products Added', list('added'), hideEmpty: true, [
          ('rb-a-time', const WebCol('Time', flex: 1.3), (x) => dateTime(x['at'])),
          ('rb-a-name', const WebCol('Product', flex: 1.6), (x) => '${x['name']}'),
          ('rb-a-sku', const WebCol('SKU'), (x) => opt(x['sku'])),
          ('rb-a-category', const WebCol('Category'), (x) => opt(x['category'])),
          ('rb-a-price', const WebCol('Price', right: true), (x) => money(x['price'])),
          ('rb-a-stock', const WebCol('Stock', right: true), (x) => opt(x['stock'])),
          ('rb-a-by', const WebCol('Added by'), (x) => opt(x['by'])),
        ]),
        ...section('rb-g-agents', LucideIcons.bike, 'Deliveries by Agent', list('agents'), hideEmpty: true, [
          ('rb-ag-name', const WebCol('Agent', flex: 1.4), (a) => '${a['name']}'),
          ('rb-ag-assigned', const WebCol('Assigned', right: true), (a) => '${a['assigned']}'),
          ('rb-ag-delivered', const WebCol('Delivered', right: true), (a) => '${a['delivered']}'),
          ('rb-ag-pending', const WebCol('Pending', right: true), (a) => '${a['pending']}'),
          ('rb-ag-canceled', const WebCol('Canceled', right: true), (a) => '${a['canceled'] ?? 0}'),
          ('rb-ag-value', const WebCol('Delivered value', right: true), (a) => money(a['deliveredValue'])),
          ('rb-ag-avg', const WebCol('Avg. time', right: true), (a) => a['avgMinutes'] == null ? '—' : '${toDouble(a['avgMinutes']).round()} min'),
        ]),
        ...section('rb-g-staff', LucideIcons.users, 'Staff Performance', list('staff'), hideEmpty: true, [
          ('rb-st-name', const WebCol('Staff', flex: 1.4), (x) => '${x['name']}'),
          ('rb-st-role', const WebCol('Role'), (x) => '${x['role']}'),
          ('rb-st-pos', const WebCol('Store sales', right: true), (x) => '${x['posSales']}'),
          ('rb-st-posamt', const WebCol('Amount', right: true), (x) => money(x['posAmount'])),
          ('rb-st-col', const WebCol('Collections', right: true), (x) => '${x['collections'] ?? 0}'),
          ('rb-st-colamt', const WebCol('Collected', right: true), (x) => money(x['collectedAmount'])),
          ('rb-st-delivered', const WebCol('Delivered', right: true), (x) => '${x['delivered']}'),
          ('rb-st-added', const WebCol('Added', right: true), (x) => '${x['productsAdded'] ?? 0}'),
        ]),
        ...section('rb-g-activity', LucideIcons.history, 'What they did', list('activity'), hideEmpty: true, [
          ('rb-ac-time', const WebCol('Time', flex: 1.2), (x) => dateTime(x['at'])),
          ('rb-ac-action', const WebCol('Action'), (x) => '${x['action']}'.replaceAll('ecom_', '').replaceAll('_', ' ')),
          ('rb-ac-details', const WebCol('Details', flex: 2.4), (x) => '${x['description']}'),
        ]),
      ]),
    );
  }

  Widget? _webSide(Map<String, dynamic> r) {
    bool on(String k) => _prefs.on('rb-side', k);
    if (!_prefs.on('rb-side')) return null;
    final pays = ((r['payments'] as List?) ?? const []).cast<Map>();
    final total = pays.fold<double>(0, (t, p) => t + toDouble(p['amount']));
    const palette = [Color(0xFF22C55E), W.blue, Color(0xFFF59E0B), W.primary, Color(0xFFEF4444), W.cyan];
    final ch = (r['channels'] as Map?) ?? {};
    final chTotal = toDouble(ch['offline']?['amount']) + toDouble(ch['online']?['amount']);
    final status = ((r['onlineStatus'] as List?) ?? const []).cast<Map>();
    final aging = ((r['aging'] as List?) ?? const []).cast<Map>();
    const agingColors = [(Color(0xFFDC2626), Color(0xFFFEF2F2)), (Color(0xFFEA580C), Color(0xFFFFF7ED)), (Color(0xFFCA8A04), Color(0xFFFEFCE8)), (W.primary, W.primaryLighter)];

    Widget channel(IconData icon, String label, Map? x) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFF8FAFF), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFDBEAFE))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, size: 22, color: W.blue),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: const TextStyle(fontSize: 12.5, color: W.g700)),
                  FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(money(x?['amount']), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: W.g900))),
                  Text('${chTotal > 0 ? (toDouble(x?['amount']) / chTotal * 100).toStringAsFixed(1) : '0.0'}%', style: const TextStyle(fontSize: 12, color: W.g500)),
                  Text('${x?['orders'] ?? 0} Orders', style: const TextStyle(fontSize: 12, color: W.g500)),
                ]),
              ),
            ]),
          ),
        );

    final cards = <Widget>[
      if (on('rb-r-payment'))
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const WebCardTitle('Payment Summary', icon: LucideIcons.funnel, iconColor: W.primary),
            Row(children: [
              SizedBox(
                width: 150,
                height: 150,
                child: Stack(alignment: Alignment.center, children: [
                  PieChart(PieChartData(
                    sectionsSpace: 0,
                    centerSpaceRadius: 58,
                    startDegreeOffset: -90,
                    sections: total <= 0
                        ? [PieChartSectionData(value: 1, color: W.g200, radius: 14, showTitle: false)]
                        : [for (var i = 0; i < pays.length; i++) PieChartSectionData(value: toDouble(pays[i]['amount']), color: palette[i % palette.length], radius: 14, showTitle: false)],
                  )),
                  Column(mainAxisSize: MainAxisSize.min, children: [
                    FittedBox(child: Text(money(total), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: W.g900))),
                    const Text('Total Sales', style: TextStyle(fontSize: 12, color: W.g500)),
                  ]),
                ]),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(children: [
                  if (pays.isEmpty) const Text('No sales.', style: TextStyle(color: W.g500)),
                  for (var i = 0; i < pays.length; i++)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Padding(padding: const EdgeInsets.only(top: 4), child: Container(width: 11, height: 11, decoration: BoxDecoration(color: palette[i % palette.length], borderRadius: BorderRadius.circular(2)))),
                        const SizedBox(width: 8),
                        Expanded(child: Text('${pays[i]['method']}', style: const TextStyle(fontSize: 13, color: W.g800))),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(money(pays[i]['amount']), style: const TextStyle(fontSize: 13, color: W.g900)),
                          Text('(${total > 0 ? (toDouble(pays[i]['amount']) / total * 100).toStringAsFixed(1) : 0}%)', style: const TextStyle(fontSize: 12, color: W.g500)),
                        ]),
                      ]),
                    ),
                ]),
              ),
            ]),
          ]),
        ),
      if (on('rb-r-channel'))
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const WebCardTitle('Sales Channel Summary', icon: LucideIcons.chartNoAxesColumn, iconColor: W.primary),
            Row(children: [channel(LucideIcons.store, 'In-store Sales', ch['offline'] as Map?), const SizedBox(width: 12), channel(LucideIcons.globe, 'Online Sales', ch['online'] as Map?)]),
          ]),
        ),
      if (on('rb-r-online') && status.isNotEmpty)
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const WebCardTitle('Online Orders by Status', icon: LucideIcons.truck, iconColor: W.primary),
            Wrap(spacing: 10, runSpacing: 10, children: [
              for (final x in status)
                SizedBox(
                  width: 170,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), border: Border.all(color: W.g200)),
                    child: Row(children: [
                      Expanded(child: Text('${x['status']}', style: const TextStyle(fontSize: 13, color: W.g700))),
                      Text('${x['count']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: W.g900)),
                    ]),
                  ),
                ),
            ]),
          ]),
        ),
      if (on('rb-r-aging') && aging.isNotEmpty)
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const WebCardTitle('Due Aging Summary', icon: LucideIcons.clock, iconColor: W.primary),
            for (var i = 0; i < aging.length; i++)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: agingColors[i % 4].$2, borderRadius: BorderRadius.circular(6)),
                child: Row(children: [
                  Icon(LucideIcons.clock, size: 15, color: agingColors[i % 4].$1),
                  const SizedBox(width: 10),
                  Expanded(child: Text('${aging[i]['bucket']}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: agingColors[i % 4].$1))),
                  Text(money(aging[i]['amount']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900)),
                  const SizedBox(width: 18),
                  SizedBox(width: 70, child: Text('${aging[i]['orders']} Orders', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, color: W.g700))),
                ]),
              ),
            const Divider(height: 18, thickness: 2, color: W.g900),
            Row(children: [
              const Expanded(child: Text('Total Dues', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: W.g900))),
              Text(money(aging.fold<double>(0, (t, a) => t + toDouble(a['amount']))), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
            ]),
          ]),
        ),
      if (on('rb-r-export'))
        WebCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const WebCardTitle('Export Report', icon: LucideIcons.fileText, iconColor: W.primary),
            Row(children: [
              Expanded(child: WebButton('PDF', icon: LucideIcons.fileText, color: const Color(0xFFDC2626), onPressed: () => exportReportPdf(context, r))),
              const SizedBox(width: 10),
              Expanded(child: WebButton('Excel', icon: LucideIcons.sheet, color: const Color(0xFF16A34A), onPressed: () => exportReportExcel(context, r))),
            ]),
          ]),
        ),
    ];
    if (cards.isEmpty) return null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final (i, c) in cards.indexed) ...[if (i > 0) const SizedBox(height: 12), c],
    ]);
  }
}

class _Dashed extends StatelessWidget {
  const _Dashed();
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (c, box) => Row(children: [
          for (var i = 0; i < (box.maxWidth / 8).floor(); i++) Container(width: 4, height: 1, margin: const EdgeInsets.only(right: 4), color: W.g300),
        ]),
      );
}

/// A table wider than the card: scrolls sideways with a visible scrollbar.
class _SideScroll extends StatefulWidget {
  final double width;
  final Widget child;
  const _SideScroll({required this.width, required this.child});
  @override
  State<_SideScroll> createState() => _SideScrollState();
}

class _SideScrollState extends State<_SideScroll> {
  final _c = ScrollController();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scrollbar(
        controller: _c,
        thumbVisibility: true,
        child: SingleChildScrollView(controller: _c, scrollDirection: Axis.horizontal, child: Padding(padding: const EdgeInsets.only(bottom: 10), child: SizedBox(width: widget.width, child: widget.child))),
      );
}
