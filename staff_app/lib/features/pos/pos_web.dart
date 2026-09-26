part of 'pos_screen.dart';

/// Windows: the website's Billing / POS page — coral scan bar, cart table, coupon + totals,
/// and the "Payment Summary" column with customer, payments and Pay Now.
extension _PosWeb on _PosScreenState {
  static const _coral = W.coral;
  static const _coralSoft = W.coralSoft;

  Widget _webPage(List<Map<String, dynamic>> products) {
    return WebPage(
      title: 'Billing / POS',
      subtitle: 'Scan a barcode or search a product to start a sale',
      actions: [
        WebButton('Recent bills', icon: LucideIcons.history, onPressed: _recentBills),
        if (_last != null) WebButton('Print last', icon: LucideIcons.printer, onPressed: () => printReceipt(_last!, _paper)),
        WebButton('Printing', icon: LucideIcons.slidersHorizontal, onPressed: _printSettings),
      ],
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _webScan(products),
              if (_q.trim().isNotEmpty) _webResults(products),
              const SizedBox(height: 20),
              _webCart(),
            ]),
          ),
          const SizedBox(width: 20),
          SizedBox(width: 350, child: _webSummary()),
        ]),
      ),
    );
  }

  Widget _webScan(List<Map<String, dynamic>> products) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFF3B6A6), width: 1.5),
          boxShadow: const [BoxShadow(color: Color(0x33EE6A4D), blurRadius: 0, spreadRadius: 3)],
        ),
        padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
        child: Row(children: [
          const Icon(LucideIcons.scanBarcode, size: 18, color: W.g600),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _search,
              focusNode: _searchFocus,
              autofocus: true,
              onChanged: _setQ,
              onSubmitted: (_) => _enter(products),
              style: const TextStyle(fontSize: 15),
              decoration: const InputDecoration(
                hintText: 'Scan barcode or type product name / SKU...',
                hintStyle: TextStyle(color: W.g400, fontSize: 15),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          Material(
            color: _coral,
            borderRadius: BorderRadius.circular(7),
            child: InkWell(
              borderRadius: BorderRadius.circular(7),
              onTap: () => _enter(products),
              child: const SizedBox(width: 40, height: 34, child: Icon(LucideIcons.search, size: 17, color: Colors.white)),
            ),
          ),
        ]),
      );

  Widget _webResults(List<Map<String, dynamic>> products) {
    final list = _matches(products).take(8).toList();
    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: W.g200), boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 18, offset: Offset(0, 8))]),
      child: list.isEmpty
          ? const Padding(padding: EdgeInsets.all(16), child: Text('No product found.', style: TextStyle(color: W.g500)))
          : Column(children: [
              for (final p in list)
                InkWell(
                  onTap: () {
                    _add(p);
                    _search.clear();
                    _setQ('');
                    _searchFocus.requestFocus();
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    child: Row(children: [
                      NetImage(p['image'], size: 38, radius: 6),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${p['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
                          Text([if (p['sku'] != null) 'SKU ${p['sku']}', if (p['barcode'] != null) '${p['barcode']}', if (p['stock'] != null) 'Stock ${p['stock']}'].join(' · '), style: const TextStyle(fontSize: 12.5, color: W.g500)),
                        ]),
                      ),
                      Text(money(CartLine.shelfPrice(p)), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _coral)),
                    ]),
                  ),
                ),
            ]),
    );
  }

  Widget _webCart() {
    const head = TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: W.g700);
    Widget row(List<Widget> cells, {Color? bg}) => Container(
          color: bg,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(children: [
            Expanded(flex: 30, child: cells[0]),
            Expanded(flex: 13, child: cells[1]),
            Expanded(flex: 17, child: cells[2]),
            Expanded(flex: 11, child: cells[3]),
            Expanded(flex: 13, child: Align(alignment: Alignment.centerRight, child: cells[4])),
            SizedBox(width: 64, child: Align(alignment: Alignment.center, child: cells[5])),
          ]),
        );
    return WebCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(LucideIcons.shoppingCart, size: 18, color: _coral),
          const SizedBox(width: 8),
          const Text('Cart', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: W.g900)),
          const SizedBox(width: 8),
          Text('(${cart.lines.length} item${cart.lines.length == 1 ? '' : 's'})', style: const TextStyle(fontSize: 14, color: W.g500)),
          const Spacer(),
          if (cart.lines.isNotEmpty)
            TextButton.icon(
              onPressed: cart.clear,
              icon: const Icon(LucideIcons.trash2, size: 14),
              label: const Text('Clear (F4)'),
              style: TextButton.styleFrom(foregroundColor: W.g500, textStyle: const TextStyle(fontSize: 13)),
            ),
        ]),
        const SizedBox(height: 14),
        Container(
          decoration: BoxDecoration(border: Border.all(color: W.g200), borderRadius: BorderRadius.circular(8)),
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            row(const [Text('Product', style: head), Text('Price', style: head), Text('Quantity', style: head), Text('Unit', style: head), Text('Subtotal', style: head), Text('Action', style: head)], bg: W.g50),
            if (cart.lines.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 60),
                child: Column(children: [
                  Icon(LucideIcons.shoppingCart, size: 30, color: W.g300),
                  SizedBox(height: 10),
                  Text('Cart is empty — scan a product to begin, or search it by name above.', style: TextStyle(color: W.g500, fontSize: 14.5)),
                ]),
              ),
            for (final l in cart.lines)
              Container(
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g100))),
                child: row([
                  Row(children: [
                    NetImage(l.product['image'], size: 36, radius: 6),
                    const SizedBox(width: 10),
                    Expanded(child: Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: W.g900))),
                  ]),
                  InkWell(
                    onTap: () => _editPrice(l),
                    child: Text(money(l.unitPrice), style: TextStyle(fontSize: 14.5, color: l.overridden ? const Color(0xFFD97706) : W.g800, decoration: TextDecoration.underline, decorationStyle: TextDecorationStyle.dotted, decorationColor: W.g400)),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _Stepper(value: l.qty, onChanged: (v) {
                      final m = cart.setQty(l, v);
                      if (m != null) toast(context, m, error: true);
                    }),
                  ),
                  InkWell(onTap: () => _editPrice(l), child: Text(l.unit ?? '—', style: const TextStyle(fontSize: 14, color: W.g600))),
                  Text(money(l.total), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: W.g900)),
                  IconButton(onPressed: () => cart.remove(l), icon: const Icon(LucideIcons.trash2, size: 16, color: Color(0xFFEF4444)), tooltip: 'Remove'),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _webCoupon()),
          const SizedBox(width: 16),
          Expanded(child: _webTotals()),
        ]),
      ]),
    );
  }

  Widget _webCoupon() {
    final coupons = context.read<AppState>().list('coupons');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: _coralSoft, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Row(children: [
          Icon(LucideIcons.tag, size: 15, color: _coral),
          SizedBox(width: 8),
          Text('Coupon Code', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: W.g900)),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: SizedBox(
              height: 40,
              child: TextField(
                controller: _coupon,
                textCapitalization: TextCapitalization.characters,
                style: const TextStyle(fontSize: 14.5),
                decoration: InputDecoration(
                  hintText: 'Enter coupon code',
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: W.g200)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: W.g200)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            height: 40,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40), foregroundColor: _coral, side: const BorderSide(color: Color(0xFFF3B6A6)), backgroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6))),
              onPressed: () {
                final code = _coupon.text.trim().toUpperCase();
                if (code.isEmpty) return cart.setCoupon(null);
                final c = coupons.where((x) => '${x['code']}'.toUpperCase() == code).firstOrNull;
                if (c == null) {
                  toast(context, 'Invalid or inactive coupon.', error: true);
                  cart.setCoupon(null);
                } else {
                  cart.setCoupon(c);
                  toast(context, 'Coupon applied.');
                }
              },
              child: Text(cart.coupon == null ? 'Apply' : 'Change'),
            ),
          ),
        ]),
      ]),
    );
  }

  Widget _webTotals() {
    Widget line(String a, String b, {Color? color}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(children: [Expanded(child: Text(a, style: const TextStyle(fontSize: 14.5, color: W.g700))), Text(b, style: TextStyle(fontSize: 14.5, color: color ?? W.g900))]),
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: W.g50, borderRadius: BorderRadius.circular(10)),
      child: Column(children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 4, right: 10), child: Icon(LucideIcons.info, size: 16, color: W.blue)),
          Expanded(
            child: Column(children: [
              line('Subtotal', money(cart.subtotal)),
              line('Discount', '-${money(cart.discount)}', color: const Color(0xFFEF4444)),
              line('GST', '+${money(cart.gst)}'),
            ]),
          ),
        ]),
        const Divider(height: 20, color: W.g200),
        Row(children: [
          const SizedBox(width: 26),
          const Expanded(child: Text('Total', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: W.g900))),
          Text(money(cart.grandTotal), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: W.g900)),
        ]),
      ]),
    );
  }

  Widget _webSummary() {
    final s = context.watch<AppState>();
    final customers = s.list('customers');
    InputDecoration box(String hint, IconData icon) => InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: W.g400, fontSize: 14.5),
          prefixIcon: Icon(icon, size: 16, color: W.g400),
          prefixIconConstraints: const BoxConstraints(minWidth: 38),
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: W.g200)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: W.g200)),
        );
    Widget section(IconData icon, String title, Widget trailing) => Row(children: [
          Icon(icon, size: 16, color: _coral),
          const SizedBox(width: 8),
          Expanded(child: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: W.g900))),
          trailing,
        ]);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFF07E62), _coral], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [BoxShadow(color: Color(0x33EE6A4D), blurRadius: 24, offset: Offset(0, 10))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 4, 10),
          child: Row(children: [
            const Icon(LucideIcons.creditCard, size: 17, color: Colors.white),
            const SizedBox(width: 8),
            const Expanded(child: Text('Payment Summary', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: .25), borderRadius: BorderRadius.circular(6)),
              child: Text('${cart.lines.length} items', style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
          child: Column(children: [
            Row(children: [const Expanded(child: Text('Total Amount', style: TextStyle(fontSize: 14.5, color: W.g700))), Text(money(cart.grandTotal), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: W.g900))]),
            const Divider(height: 24, color: W.g100),
            Row(children: [const Expanded(child: Text('Amount Received', style: TextStyle(fontSize: 14.5, color: W.g700))), Text(money(cart.paid), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: W.g900))]),
            if (cart.change > 0.004) ...[
              const SizedBox(height: 8),
              Row(children: [const Expanded(child: Text('Return change', style: TextStyle(fontSize: 14, color: Color(0xFF16A34A)))), Text(money(cart.change), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF16A34A)))]),
            ],
            if (cart.due > 0.004) ...[
              const SizedBox(height: 8),
              Row(children: [const Expanded(child: Text('Due (on credit)', style: TextStyle(fontSize: 14, color: Color(0xFFDC2626)))), Text(money(cart.due), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFFDC2626)))]),
            ],
          ]),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            section(
              LucideIcons.user,
              'Customer',
              Row(mainAxisSize: MainAxisSize.min, children: [
                SizedBox(height: 24, child: FittedBox(child: Switch(value: cart.guest, activeTrackColor: _coral, onChanged: cart.setGuest))),
                const SizedBox(width: 4),
                const Text('Guest Bill', style: TextStyle(fontSize: 13, color: W.g700, fontWeight: FontWeight.w500)),
              ]),
            ),
            if (!cart.guest) ...[
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: Autocomplete<Map<String, dynamic>>(
                    displayStringForOption: (c) => '${c['phone'] ?? ''}',
                    optionsBuilder: (v) {
                      final q = v.text.trim();
                      if (q.length < 3) return const [];
                      return customers.where((c) => '${c['phone'] ?? ''}'.contains(q) || '${c['name']}'.toLowerCase().contains(q.toLowerCase())).take(8);
                    },
                    optionsViewBuilder: (c, onSel, opts) => Align(
                      alignment: Alignment.topLeft,
                      child: Material(
                        elevation: 6,
                        borderRadius: BorderRadius.circular(8),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 300, maxHeight: 280),
                          child: ListView(padding: EdgeInsets.zero, shrinkWrap: true, children: [
                            for (final o in opts) ListTile(dense: true, title: Text('${o['name']}'), subtitle: Text('${o['phone'] ?? ''}${toDouble(o['due']) > 0 ? ' · due ${money(o['due'])}' : ''}'), onTap: () => onSel(o)),
                          ]),
                        ),
                      ),
                    ),
                    onSelected: cart.setCustomer,
                    fieldViewBuilder: (c, ctl, focus, submit) {
                      if (cart.customer != null && ctl.text != cart.customerPhone) ctl.text = cart.customerPhone;
                      if (cart.customer == null && cart.customerPhone.isEmpty && ctl.text.isNotEmpty && cart.lines.isEmpty) ctl.clear();
                      return TextField(
                        controller: ctl,
                        focusNode: focus,
                        keyboardType: TextInputType.phone,
                        style: const TextStyle(fontSize: 14.5),
                        onChanged: (v) {
                          cart.customer = null;
                          cart.customerPhone = v;
                          cart.touch();
                        },
                        decoration: box('Mobile', LucideIcons.phone),
                      );
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    key: ValueKey('name-${cart.customer?['id']}-${cart.lines.isEmpty}'),
                    controller: TextEditingController(text: cart.customerName)..selection = TextSelection.collapsed(offset: cart.customerName.length),
                    style: const TextStyle(fontSize: 14.5),
                    onChanged: (v) {
                      cart.customerName = v;
                      if (cart.customer != null && v != cart.customer!['name']) cart.customer = null;
                    },
                    decoration: box('Name', LucideIcons.user),
                  ),
                ),
              ]),
              if (cart.customer != null && toDouble(cart.customer!['due']) > 0)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text('Previous due: ${money(cart.customer!['due'])}', style: const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w600, fontSize: 13))),
            ],
            const Divider(height: 28, color: W.g100),
            section(
              LucideIcons.wallet,
              'Payment',
              InkWell(
                onTap: cart.addPayment,
                borderRadius: BorderRadius.circular(6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6), border: Border.all(color: const Color(0xFFF3B6A6))),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(LucideIcons.plus, size: 14, color: _coral),
                    SizedBox(width: 5),
                    Text('Add', style: TextStyle(color: _coral, fontSize: 13, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 10),
            for (var i = 0; i < cart.effectivePayments.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  SizedBox(
                    width: 110,
                    child: WebSelect<String>(value: cart.effectivePayments[i].method, icon: LucideIcons.banknote, options: const [('Cash', 'Cash'), ('UPI', 'UPI'), ('Card', 'Card'), ('Other', 'Other')], onChanged: (v) => cart.editPayment(i, method: v)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: SizedBox(
                      height: 40,
                      child: TextFormField(
                        key: ValueKey('wpay$i-${cart.paymentsEdited}-${cart.lines.length}'),
                        initialValue: cart.effectivePayments[i].amount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: const TextStyle(fontSize: 14.5),
                        decoration: box('0.00', LucideIcons.indianRupee),
                        onChanged: (v) => cart.editPayment(i, amount: v),
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: cart.payments.length > 1 ? () => cart.removePayment(i) : null,
                    icon: Icon(LucideIcons.trash2, size: 16, color: cart.payments.length > 1 ? const Color(0xFFEF4444) : const Color(0xFFFCA5A5)),
                  ),
                ]),
              ),
            if (cart.due > 0.004)
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: W.g700, alignment: Alignment.centerLeft),
                icon: const Icon(LucideIcons.calendar, size: 15),
                label: Text(cart.promisedDate == null ? 'Promised pay date (optional)' : 'Will pay by ${dateShort(cart.promisedDate)}'),
                onPressed: () async {
                  final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now().add(const Duration(days: 7)));
                  if (d != null) {
                    cart.promisedDate = d;
                    cart.touch();
                  }
                },
              ),
            const SizedBox(height: 8),
            Container(
              height: 50,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: cart.lines.isEmpty || _busy ? [const Color(0xFFF6B3A2), const Color(0xFFF3B6A6)] : [const Color(0xFFEF7456), _coral]),
                borderRadius: BorderRadius.circular(10),
                boxShadow: cart.lines.isEmpty ? null : const [BoxShadow(color: Color(0x40EE6A4D), blurRadius: 14, offset: Offset(0, 6))],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: _busy || cart.lines.isEmpty ? null : _complete,
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    if (_busy)
                      const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    else
                      const Icon(LucideIcons.creditCard, size: 17, color: Colors.white),
                    const SizedBox(width: 10),
                    Text(_busy ? 'Saving…' : 'Pay Now', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(width: 8),
                    const Icon(LucideIcons.arrowRight, size: 17, color: Colors.white),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(s.online ? LucideIcons.lock : LucideIcons.cloudOff, size: 12, color: W.g500),
              const SizedBox(width: 6),
              Text(s.online ? 'F2 Pay Now · F4 New bill' : 'Offline — the bill is saved and uploads later', style: const TextStyle(fontSize: 12, color: W.g500)),
            ]),
          ]),
        ),
      ]),
    );
  }
}
