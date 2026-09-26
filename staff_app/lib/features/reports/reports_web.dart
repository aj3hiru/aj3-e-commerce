part of 'reports_screen.dart';

/// Windows: the website's Report Builder — presets and filters on top, the printable
/// report on the left, payment / channel / status / due-aging summaries and export on the right.
extension _ReportsWeb on _ReportsScreenState {
  Widget _webPage(Map<String, dynamic>? r, Map k, List<Map> staffList, String? preset) {
    Widget presetBtn(String label, String range, {IconData? icon, VoidCallback? onTap}) {
      final on = preset == range;
      return Padding(
        padding: const EdgeInsets.only(right: 10),
        child: SizedBox(
          height: 40,
          child: TextButton(
            onPressed: onTap ?? () => _set({'range': range}),
            style: TextButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: on ? W.primary : W.g800,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: BorderSide(color: on ? W.primary : W.g200, width: on ? 1.5 : 1)),
              textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 14.5, fontWeight: FontWeight.w500),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 15), const SizedBox(width: 8)],
              Text(label),
            ]),
          ),
        ),
      );
    }

    Widget channelBtn(String label, String? value, IconData icon) {
      final on = (_params['channel']) == value;
      return Padding(
        padding: const EdgeInsets.only(left: 10),
        child: WebButton(label, icon: icon, color: on ? W.primary : null, onPressed: () {
          _setChannel(value);
        }),
      );
    }

    final top = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 10, children: [
        const Padding(padding: EdgeInsets.only(right: 14), child: Text('Date Presets', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900))),
        presetBtn('Today', 'today'),
        presetBtn('Yesterday', 'yesterday'),
        presetBtn('This Month', 'this_month'),
        presetBtn('Previous Month', 'prev_month'),
        presetBtn(preset == 'month' ? '${r?['rangeLabel'] ?? 'Month'}' : 'Month', 'month', icon: LucideIcons.calendar, onTap: _pickMonth),
        presetBtn(preset == 'custom' ? '${r?['rangeLabel'] ?? 'Custom Range'}' : 'Custom Range', 'custom', icon: LucideIcons.calendarRange, onTap: _pickRange),
      ]),
      const SizedBox(height: 10),
      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
        if (staffList.length > 1 || _params['user'] != null)
          WebSelect<String>(
            width: 250,
            icon: LucideIcons.user,
            value: _params['user'] ?? '',
            options: [('', 'Whole business'), for (final u in staffList) ('${u['id']}', '${u['name']} · ${u['role']}')],
            onChanged: _setUser,
          ),
        channelBtn('All Sales', null, LucideIcons.funnel),
        channelBtn('In-store', 'offline', LucideIcons.store),
        channelBtn('Online', 'online', LucideIcons.globe),
      ]),
    ]);

    final children = <Widget>[
      top,
      if (_loading) const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator(minHeight: 3)),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626)))),
      const SizedBox(height: 20),
      if (r == null && !_loading) const WebCard(child: Text('Connect to the internet to build a report.', style: TextStyle(color: W.g600))),
      if (r != null)
        LayoutBuilder(
          builder: (c, box) {
            final left = _webReport(r, k);
            final right = _webSide(r);
            if (box.maxWidth < 1000) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [left, const SizedBox(height: 20), right]);
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 64, child: left), const SizedBox(width: 20), Expanded(flex: 36, child: right)]);
          },
        ),
    ];

    return WebPage(
      title: 'Report Builder',
      subtitle: 'Generate and analyze your sales performance',
      onRefresh: _load,
      children: children,
    );
  }

  Widget _webReport(Map<String, dynamic> r, Map k) {
    final biz = (r['business'] as Map?) ?? {};
    Widget kpi(IconData icon, Color c, String label, String value, String sub) => Expanded(
          child: Padding(padding: const EdgeInsets.only(right: 12), child: Row(children: [
            Container(width: 46, height: 46, decoration: BoxDecoration(color: c.withValues(alpha: .1), shape: BoxShape.circle), child: Icon(icon, size: 21, color: c)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 13.5, color: W.g700)),
                FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: W.g900))),
                Text(sub, style: const TextStyle(fontSize: 12.5, color: W.g500)),
              ]),
            ),
          ])),
        );
    Widget chip(IconData icon, String label, String value) => Container(
          margin: const EdgeInsets.only(right: 10, bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: W.g200)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 14, color: W.primary),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(fontSize: 13.5, color: W.g600)),
            const SizedBox(width: 6),
            Text(value, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: W.g900)),
          ]),
        );
    Widget heading(IconData icon, String title, [String? right]) => Padding(
          padding: const EdgeInsets.only(top: 26, bottom: 12),
          child: Row(children: [
            Icon(icon, size: 17, color: W.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: W.primary))),
            if (right != null) Text(right, style: const TextStyle(fontSize: 13, color: W.g500)),
          ]),
        );
    Widget table(List<WebCol> cols, List<List<String>> rows, {int? highlight}) => WebTable(
          cols: cols,
          upper: false,
          rowHeight: 44,
          rows: [
            for (final row in rows)
              [
                for (var i = 0; i < row.length; i++)
                  Text(row[i], maxLines: i == highlight ? 1 : 2, overflow: TextOverflow.ellipsis, textAlign: cols[i].right ? TextAlign.right : TextAlign.left,
                      style: TextStyle(fontSize: 13.5, color: i == highlight ? W.primary : W.g800, fontWeight: i == highlight ? FontWeight.w500 : FontWeight.w400)),
              ],
          ],
          empty: const Center(child: Text('Nothing in this period.', style: TextStyle(color: W.g500))),
        );

    final timeline = ((r['timeline'] as List?) ?? const []).cast<Map>();
    final products = ((r['products'] as List?) ?? const []).cast<Map>();
    final daily = ((r['daily'] as List?) ?? const []).cast<Map>();
    final collections = ((r['collections'] as List?) ?? const []).cast<Map>();
    final agents = ((r['agents'] as List?) ?? const []).cast<Map>();
    final staff = ((r['staff'] as List?) ?? const []).cast<Map>();
    final added = ((r['added'] as List?) ?? const []).cast<Map>();
    final activity = ((r['activity'] as List?) ?? const []).cast<Map>();

    return WebCard(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text('${biz['name'] ?? ''}', style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700, color: W.primary))),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(r['selectedUser'] != null ? 'Staff Report · ${r['selectedUser']['name']}' : 'Sales Report', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: W.g900)),
            const SizedBox(height: 4),
            Text('${r['rangeLabel']}', style: const TextStyle(fontSize: 16, color: W.g700)),
            const SizedBox(height: 4),
            Text('Generated on ${dateTime(r['generatedAt'])}', style: const TextStyle(fontSize: 13.5, color: W.g500)),
          ]),
        ]),
        const SizedBox(height: 18),
        const _Dashed(),
        const SizedBox(height: 18),
        Row(children: [
          kpi(LucideIcons.indianRupee, W.primary, 'Total Sales', money(k['sales']), '${k['orders'] ?? 0} Orders'),
          kpi(LucideIcons.shoppingBag, W.blue, 'Products Sold', '${k['units'] ?? 0}', 'Units'),
          kpi(LucideIcons.triangleAlert, const Color(0xFFDC2626), 'Total Dues', money(k['due']), '${k['dueOrders'] ?? 0} Orders'),
          kpi(LucideIcons.wallet, const Color(0xFF16A34A), 'Due Collected', money(k['collected']), '${k['collections'] ?? 0} Payments'),
        ]),
        const SizedBox(height: 18),
        const Divider(height: 1, color: W.g200),
        const SizedBox(height: 14),
        Wrap(children: [
          chip(LucideIcons.packagePlus, 'Products Added', '${k['productsAdded'] ?? 0}'),
          chip(LucideIcons.wallet, 'New Dues', '${money(k['newDues'])} · ${k['newDueCount'] ?? 0}'),
          chip(LucideIcons.globe, 'Online Orders Placed', '${k['onlinePlaced'] ?? 0}'),
          chip(LucideIcons.tag, 'Discount', money(k['discount'])),
          chip(LucideIcons.landmark, 'GST', money(k['gst'])),
        ]),
        heading(LucideIcons.clipboardList, 'Product-wise Sales Timeline', '${timeline.length} entries'),
        table(const [WebCol('Time', flex: 1.1), WebCol('Order ID', width: 124), WebCol('Channel', width: 86), WebCol('Customer', flex: 1.2), WebCol('Product', flex: 1.3), WebCol('Qty', width: 50, right: true), WebCol('Total', flex: 1.05, right: true)], [
          for (final t in timeline.take(200)) [dateTime(t['at']), '${t['orderNumber']}', t['channel'] == 'online' ? 'Online' : 'In-store', '${t['customer']}', '${t['product']}', '${t['qty']}', money(t['total'])],
        ], highlight: 1),
        heading(LucideIcons.shoppingBag, 'Product Summary', '${products.length} entries'),
        table(const [WebCol('Product', flex: 2), WebCol('SKU'), WebCol('Orders', flex: .7, right: true), WebCol('Qty sold', flex: .8, right: true), WebCol('Revenue', flex: 1.1, right: true), WebCol('Last sold', flex: 1.5)], [
          for (final p in products) ['${p['name']}', '${p['sku'] ?? '—'}', '${p['orders'] ?? ''}', '${p['qty']}', money(p['revenue']), p['lastSoldAt'] == null ? '—' : dateTime(p['lastSoldAt'])],
        ]),
        if (daily.length > 1) ...[
          heading(LucideIcons.calendarDays, 'Day-wise Summary'),
          table(const [WebCol('Date'), WebCol('Orders', right: true), WebCol('Units', right: true), WebCol('Sales', right: true), WebCol('Due', right: true), WebCol('Collected', right: true)], [
            for (final d in daily) [dateShort('${d['day']}T06:30:00Z'), '${d['orders']}', '${d['units'] ?? ''}', money(d['sales']), money(d['due']), money(d['collected'])],
          ]),
        ],
        if (collections.isNotEmpty) ...[
          heading(LucideIcons.handCoins, 'Due Collections', '${collections.length} payments'),
          table(const [WebCol('Time', flex: 1.3), WebCol('Customer', flex: 1.3), WebCol('Order'), WebCol('Method', flex: .8), WebCol('Amount', right: true), WebCol('Received by')], [
            for (final c in collections) [dateTime(c['at']), '${c['customer']}', '${c['orderNumber'] ?? '—'}', '${c['method']}', money(c['amount']), '${c['by'] ?? '—'}'],
          ]),
        ],
        if (agents.isNotEmpty) ...[
          heading(LucideIcons.bike, 'Deliveries by Agent'),
          table(const [WebCol('Agent', flex: 1.4), WebCol('Assigned', right: true), WebCol('Delivered', right: true), WebCol('Pending', right: true), WebCol('Value', right: true)], [
            for (final a in agents) ['${a['name']}', '${a['assigned']}', '${a['delivered']}', '${a['pending']}', money(a['deliveredValue'])],
          ]),
        ],
        if (staff.isNotEmpty) ...[
          heading(LucideIcons.users, 'Staff Performance'),
          table(const [WebCol('Staff', flex: 1.4), WebCol('Store sales', right: true), WebCol('Amount', right: true), WebCol('Collected', right: true), WebCol('Delivered', right: true)], [
            for (final x in staff) ['${x['name']}', '${x['posSales']}', money(x['posAmount']), money(x['collectedAmount']), '${x['delivered']}'],
          ]),
        ],
        if (added.isNotEmpty) ...[
          heading(LucideIcons.packagePlus, 'Products Added'),
          table(const [WebCol('Time', flex: 1.3), WebCol('Product', flex: 1.6), WebCol('Price', right: true), WebCol('By')], [
            for (final x in added) [dateTime(x['at']), '${x['name']}', money(x['price']), '${x['by'] ?? '—'}'],
          ]),
        ],
        if (activity.isNotEmpty) ...[
          heading(LucideIcons.history, 'What they did'),
          table(const [WebCol('Time', flex: 1.2), WebCol('Action'), WebCol('Details', flex: 2.4)], [
            for (final x in activity) [dateTime(x['at']), '${x['action']}'.replaceAll('ecom_', '').replaceAll('_', ' '), '${x['description']}'],
          ]),
        ],
      ]),
    );
  }

  Widget _webSide(Map<String, dynamic> r) {
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
                  Text(label, style: const TextStyle(fontSize: 13.5, color: W.g700)),
                  FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(money(x?['amount']), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: W.g900))),
                  Text('${chTotal > 0 ? (toDouble(x?['amount']) / chTotal * 100).toStringAsFixed(1) : '0.0'}%', style: const TextStyle(fontSize: 12.5, color: W.g500)),
                  Text('${x?['orders'] ?? 0} Orders', style: const TextStyle(fontSize: 12.5, color: W.g500)),
                ]),
              ),
            ]),
          ),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
                  FittedBox(child: Text(money(total), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: W.g900))),
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
                      Expanded(child: Text('${pays[i]['method']}', style: const TextStyle(fontSize: 14, color: W.g800))),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(money(pays[i]['amount']), style: const TextStyle(fontSize: 14, color: W.g900)),
                        Text('(${total > 0 ? (toDouble(pays[i]['amount']) / total * 100).toStringAsFixed(1) : 0}%)', style: const TextStyle(fontSize: 13, color: W.g500)),
                      ]),
                    ]),
                  ),
              ]),
            ),
          ]),
        ]),
      ),
      const SizedBox(height: 20),
      WebCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const WebCardTitle('Sales Channel Summary', icon: LucideIcons.chartNoAxesColumn, iconColor: W.primary),
          Row(children: [channel(LucideIcons.store, 'In-store Sales', ch['offline'] as Map?), const SizedBox(width: 12), channel(LucideIcons.globe, 'Online Sales', ch['online'] as Map?)]),
        ]),
      ),
      if (status.isNotEmpty) ...[
        const SizedBox(height: 20),
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
                      Expanded(child: Text('${x['status']}', style: const TextStyle(fontSize: 14, color: W.g700))),
                      Text('${x['count']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: W.g900)),
                    ]),
                  ),
                ),
            ]),
          ]),
        ),
      ],
      if (aging.isNotEmpty) ...[
        const SizedBox(height: 20),
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
                  Expanded(child: Text('${aging[i]['bucket']}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: agingColors[i % 4].$1))),
                  Text(money(aging[i]['amount']), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: W.g900)),
                  const SizedBox(width: 18),
                  SizedBox(width: 70, child: Text('${aging[i]['orders']} Orders', textAlign: TextAlign.right, style: const TextStyle(fontSize: 14, color: W.g700))),
                ]),
              ),
            const Divider(height: 18, thickness: 2, color: W.g900),
            Row(children: [
              const Expanded(child: Text('Total Dues', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900))),
              Text(money(aging.fold<double>(0, (t, a) => t + toDouble(a['amount']))), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
            ]),
          ]),
        ),
      ],
      const SizedBox(height: 20),
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
