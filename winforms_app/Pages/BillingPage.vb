Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>One line of the bill (usePosCart's CartLine).</summary>
Public Class CartLine
    Public Product As JsonObject
    Public Size As JsonObject
    Public Qty As Integer = 1
    Public UnitPrice As Double
    Public Overridden As Boolean
    ''' <summary>The sold-by unit shown and sent (a size label, the pack "500 Gram", a preset or a typed unit).</summary>
    Public Unit As String = ""
    Public ReadOnly Property ProductId As Integer
        Get
            Return Js.Int(Product, "id")
        End Get
    End Property
    Public ReadOnly Property Name As String
        Get
            Return Js.Str(Product, "name")
        End Get
    End Property
    Public ReadOnly Property GstRate As Double
        Get
            Return Js.Num(Product, "gstRate")
        End Get
    End Property
    Public ReadOnly Property Total As Double
        Get
            Return UnitPrice * Qty
        End Get
    End Property
    Public ReadOnly Property SizeId As Integer?
        Get
            If Size Is Nothing Then Return Nothing
            Return Js.Int(Size, "id")
        End Get
    End Property
    ''' <summary>Stock left for this line (physical products only; Nothing = not counted).</summary>
    Public ReadOnly Property Stock As Integer?
        Get
            If Js.Str(Product, "type", "physical") <> "physical" Then Return Nothing
            If Size IsNot Nothing Then Return If(Js.IsNull(Size, "stock"), CType(Nothing, Integer?), Js.Int(Size, "stock"))
            Return If(Js.IsNull(Product, "stock"), CType(Nothing, Integer?), Js.Int(Product, "stock"))
        End Get
    End Property

    Public Shared Function Make(p As JsonObject, size As JsonObject, qty As Integer) As CartLine
        Return New CartLine With {.Product = p, .Size = size, .Qty = qty,
            .UnitPrice = If(size IsNot Nothing, Pos.SizePrice(size), Pos.ShelfPrice(p)),
            .Unit = If(size IsNot Nothing, Js.Str(size, "label"), If(Pos.PackLabel(p), ""))}
    End Function
End Class

''' <summary>Billing / POS — a port of the website's Billing2Screen.tsx: coral scan bar with suggestions, the cart
''' (editable price, − qty +, size / unit, subtotal, remove), Add Product, coupon and totals, and the Payment Summary
''' column (totals, due / fully paid, guest bill, customer by mobile, split payments, promise date, Pay Now).
''' Works fully offline — bills are kept on this computer and uploaded by themselves.</summary>
Public Class BillingPage
    Inherits PageBase

    Friend Shared ReadOnly Coral As Color = Color.FromArgb(&HEE, &H6A, &H4D)
    Friend Shared ReadOnly CoralSoft As Color = Color.FromArgb(&HFF, &HF4, &HF0)
    Friend Shared ReadOnly CoralBorder As Color = Color.FromArgb(&HF3, &HB6, &HA6)
    Private Shared ReadOnly UnitPresets As String() = {"KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"}
    Private Shared ReadOnly Methods As String() = {"Cash", "Card", "UPI", "Other"}

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_billing2_display")
    Private ReadOnly _search As New GlobalSearch()
    Friend ReadOnly Lines As New List(Of CartLine)
    Private _coupon As JsonObject
    Private _couponMsg As (Text As String, Ok As Boolean) = ("", False)
    Private _customerId As Integer
    Private _matched As Boolean
    Private _guest As Boolean
    Private _paysEdited As Boolean
    Friend ReadOnly Pays As New List(Of PayRow)
    Private _busy As Boolean
    Private _lastReceipt As ReceiptData
    Private _notice As String

    ' parts
    Private ReadOnly _offline As New OfflineBar(Me)
    Private ReadOnly _scan As New ScanBar(Me)
    Private ReadOnly _cart As New CartCard(Me)
    Private ReadOnly _aside As New SummaryAside(Me)

    Public Overrides ReadOnly Property PageTitle As String = "Billing / POS"
    Public Overrides ReadOnly Property PageSubtitle As String = "Scan a barcode or search a product to start a sale"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _search}
        End Get
    End Property

    Friend Function Show(k As String) As Boolean
        Return Not _display.Hidden.Contains(k)
    End Function
    Friend Function ShowIn(group As String, k As String) As Boolean
        Return Show(group) AndAlso Show(k)
    End Function

    Friend ReadOnly Property TaxIncluded As Boolean
        Get
            Return Js.Bool(AppState.I.Settings, "pricesIncludeTax")
        End Get
    End Property

    Public Sub New()
        BackColor = Theme.Page
        Controls.Add(_offline) : Controls.Add(_scan) : Controls.Add(_cart) : Controls.Add(_aside)
        Pays.Add(New PayRow With {.Method = "Cash", .Amount = "0.00"})
        AddHandler _display.Changed, Sub() Changed()
        AddHandler AppState.I.DataChanged, Sub()
                                               If IsDisposed Then Return
                                               _offline.Refresh_()
                                               LayoutParts()
                                           End Sub
        AddHandler AppState.I.StatusChanged, Sub()
                                                 If IsDisposed Then Return
                                                 _offline.Refresh_()
                                                 LayoutParts()
                                             End Sub
        Changed()
    End Sub

    ''' <summary>A customer to start the next bill for ("New order" on a customer's profile).</summary>
    Public Shared Pending As Integer

    Public Overrides Sub OnOpened()
        If Pending > 0 Then
            Dim c = AppState.I.List("customers").FirstOrDefault(Function(x) Js.Int(x, "id") = Pending)
            Pending = 0
            If c IsNot Nothing Then
                _guest = False
                _customerId = Js.Int(c, "id")
                _aside.Checkout.SetCustomer(Js.Str(c, "phone"), Js.Str(c, "name"))
            End If
        End If
        _offline.Refresh_()
        Changed()
        _scan.FocusBox()
    End Sub

    Private Function Key(name As String, def As String) As Keys
        Dim k As Keys
        Return If([Enum].TryParse(Js.Str(AppState.I.Settings, name, def), True, k), k, CType([Enum].Parse(GetType(Keys), def), Keys))
    End Function

    Public Overrides Function HandleKey(k As Keys) As Boolean
        If k = Key("shortcutCompleteSale", "F2") Then
            Dim unused = CompleteAsync()
            Return True
        End If
        If k = Key("shortcutPrint", "F3") Then
            If _lastReceipt IsNot Nothing Then PrintReceipt(_lastReceipt)
            Return True
        End If
        If k = Key("shortcutNewSale", "F4") Then
            ResetForNextSale()
            Return True
        End If
        ' a scan while the cursor is not in a text box (e.g. after clicking the cart): send it to the scan box
        Dim ch = ScanChar(k)
        If ch <> "" AndAlso Not (TypeOf FindForm()?.ActiveControl Is TextBoxBase) AndAlso Not IsTyping() Then
            _scan.Type(ch)
            Return True
        End If
        Return False
    End Function

    Private Function IsTyping() As Boolean
        Dim c = FindForm()?.ActiveControl
        While TypeOf c Is ContainerControl AndAlso DirectCast(c, ContainerControl).ActiveControl IsNot Nothing
            c = DirectCast(c, ContainerControl).ActiveControl
        End While
        Return TypeOf c Is TextBoxBase OrElse TypeOf c Is ComboBox OrElse TypeOf c Is NumericUpDown
    End Function

    Private Shared Function ScanChar(k As Keys) As String
        If (k And Keys.Modifiers) <> Keys.None AndAlso (k And Keys.Modifiers) <> Keys.Shift Then Return ""
        Dim code = k And Keys.KeyCode
        If code >= Keys.D0 AndAlso code <= Keys.D9 AndAlso (k And Keys.Shift) = Keys.None Then Return ChrW(AscW("0"c) + (code - Keys.D0)).ToString()
        If code >= Keys.NumPad0 AndAlso code <= Keys.NumPad9 Then Return ChrW(AscW("0"c) + (code - Keys.NumPad0)).ToString()
        If code >= Keys.A AndAlso code <= Keys.Z Then Return ChrW(AscW(If((k And Keys.Shift) = Keys.Shift, "A"c, "a"c)) + (code - Keys.A)).ToString()
        Return ""
    End Function

    ' ───────── money (usePosCart totals) ─────────
    Friend ReadOnly Property Subtotal As Double
        Get
            Return Lines.Sum(Function(l) l.Total)
        End Get
    End Property
    Friend ReadOnly Property Discount As Double
        Get
            If _coupon Is Nothing Then Return 0
            Dim eligible = 0.0
            Dim a = Js.Str(_coupon, "appliesTo")
            For Each l In Lines
                Dim m = a = "all" OrElse
                        (a = "product" AndAlso Js.Int(_coupon, "productId") = l.ProductId) OrElse
                        (a = "category" AndAlso Not Js.IsNull(_coupon, "categoryId") AndAlso Js.Int(_coupon, "categoryId") = Js.Int(l.Product, "categoryId")) OrElse
                        (a = "subcategory" AndAlso Not Js.IsNull(_coupon, "subcategoryId") AndAlso Js.Int(_coupon, "subcategoryId") = Js.Int(l.Product, "subcategoryId"))
                If m Then eligible += l.Total
            Next
            If eligible <= 0 Then Return 0
            Dim v = Js.Num(_coupon, "discountValue")
            Return If(Js.Str(_coupon, "discountType") = "percentage", eligible * (v / 100), Math.Min(v, eligible))
        End Get
    End Property
    Friend ReadOnly Property Gst As Double
        Get
            Dim sub_ = Subtotal, disc = Discount, g = 0.0
            For Each l In Lines
                Dim share = If(sub_ > 0, disc * (l.Total / sub_), 0)
                g += Pos.LineTax(Math.Max(0, l.Total - share), l.GstRate, TaxIncluded)
            Next
            Return g
        End Get
    End Property
    Friend ReadOnly Property GrandTotal As Double
        Get
            Dim after = Math.Max(0, Subtotal - Discount)
            Return If(TaxIncluded, after, after + Gst)
        End Get
    End Property
    ''' <summary>The single payment row shows the bill total until someone edits a payment (as on the website).</summary>
    Friend Function PayAmount(r As PayRow) As String
        If Not _paysEdited AndAlso Pays.Count = 1 Then Return GrandTotal.ToString("0.00", Globalization.CultureInfo.InvariantCulture)
        Return r.Amount
    End Function
    Friend ReadOnly Property PaidTotal As Double
        Get
            Return Pays.Sum(Function(p) Num(PayAmount(p)))
        End Get
    End Property
    Friend ReadOnly Property Due As Double
        Get
            Return Math.Max(0, GrandTotal - PaidTotal)
        End Get
    End Property
    Friend Shared Function Num(s As String) As Double
        Dim d As Double
        Return If(Double.TryParse(s, Globalization.NumberStyles.Any, Globalization.CultureInfo.InvariantCulture, d), d, 0)
    End Function
    ''' <summary>"GST (18%)" when every line has the same rate.</summary>
    Friend ReadOnly Property SameGstRate As Double?
        Get
            If Lines.Count = 0 Then Return Nothing
            Dim f = Lines(0).GstRate
            Return If(Lines.All(Function(l) l.GstRate = f), f, CType(Nothing, Double?))
        End Get
    End Property
    Friend ReadOnly Property Guest As Boolean
        Get
            Return _guest
        End Get
    End Property
    Friend ReadOnly Property CouponMessage As (Text As String, Ok As Boolean)
        Get
            Return _couponMsg
        End Get
    End Property
    Friend ReadOnly Property Matched As Boolean
        Get
            Return _matched
        End Get
    End Property
    Friend ReadOnly Property Notice As String
        Get
            Return _notice
        End Get
    End Property

    ' ───────── cart (usePosCart) ─────────
    Friend Sub AddToCart(p As JsonObject, Optional qty As Integer = 1, Optional checkStock As Boolean = True)
        Dim size = Pos.DefaultSize(p)
        Dim sid = If(size Is Nothing, CType(Nothing, Integer?), Js.Int(size, "id"))
        Dim existing = Lines.FirstOrDefault(Function(l) l.ProductId = Js.Int(p, "id") AndAlso Nullable.Equals(l.SizeId, sid))
        If existing IsNot Nothing Then
            If checkStock AndAlso existing.Stock.HasValue AndAlso existing.Qty + qty > existing.Stock.Value Then
                Ui.Info(Me, "Only " & existing.Stock.Value & " in stock for """ & Js.Str(p, "name") & """.")
                Return
            End If
            existing.Qty += qty
        Else
            Lines.Add(CartLine.Make(p, size, qty))
        End If
        Changed()
    End Sub

    Friend Sub ChangeQty(l As CartLine, delta As Integer)
        Dim q = l.Qty + delta
        If q < 1 Then Lines.Remove(l) : Changed() : Return
        If l.Stock.HasValue AndAlso q > l.Stock.Value Then Ui.Info(Me, "Only " & l.Stock.Value & " in stock.") : Return
        l.Qty = q
        Changed()
    End Sub

    Friend Sub SetQty(l As CartLine, q As Integer)
        q = Math.Max(1, q)
        If l.Stock.HasValue AndAlso q > l.Stock.Value Then Ui.Info(Me, "Only " & l.Stock.Value & " in stock.") : q = l.Stock.Value
        l.Qty = q
        Changed(False)
    End Sub

    Friend Sub SetPrice(l As CartLine, v As Double)
        l.UnitPrice = Math.Max(0, v)
        l.Overridden = True
        Changed(False)
    End Sub

    Friend Sub SetUnit(l As CartLine, u As String)
        l.Unit = u
        Changed(False)
    End Sub

    ''' <summary>Switch a line to another variant / size (same quantity; merges when that one is already on the bill).</summary>
    Friend Sub Swap(l As CartLine, p As JsonObject, size As JsonObject)
        Dim nxt = CartLine.Make(p, size, l.Qty)
        If nxt.ProductId = l.ProductId AndAlso Nullable.Equals(nxt.SizeId, l.SizeId) Then Return
        Dim other = Lines.FirstOrDefault(Function(x) x IsNot l AndAlso x.ProductId = nxt.ProductId AndAlso Nullable.Equals(x.SizeId, nxt.SizeId))
        If other IsNot Nothing Then
            other.Qty += l.Qty
            Lines.Remove(l)
        Else
            Lines(Lines.IndexOf(l)) = nxt
        End If
        Changed()
    End Sub

    Friend Sub Remove(l As CartLine)
        Lines.Remove(l)
        Changed()
    End Sub

    Friend Sub ApplyCoupon(code As String)
        Dim t = code.Trim().ToUpperInvariant()
        If t = "" Then
            _coupon = Nothing : _couponMsg = ("", False)
        Else
            Dim found = AppState.I.List("coupons").FirstOrDefault(Function(c) Js.Str(c, "code").ToUpperInvariant() = t)
            If found Is Nothing Then
                _coupon = Nothing : _couponMsg = ("Invalid or inactive coupon code.", False)
            Else
                _coupon = found : _couponMsg = ("Coupon """ & t & """ applied!", True)
            End If
        End If
        Changed(False)
    End Sub

    Friend Sub ToggleGuest(on_ As Boolean)
        _guest = on_
        If on_ Then _customerId = 0 : _matched = False : _aside.Checkout.SetCustomer("", "")
        Changed(False)
    End Sub

    ''' <summary>Mobile typed (useCustomerSearch): an exact number picks the customer; 4+ digits list matches.</summary>
    Friend Function PhoneTyped(ph As String) As List(Of JsonObject)
        _customerId = 0 : _matched = False
        Dim q = ph.Trim()
        If q.Length < 4 Then Changed(False) : Return New List(Of JsonObject)
        Dim active = AppState.I.List("customers").Where(Function(c) Js.Str(c, "status", "active") = "active").ToList()
        Dim exact = active.FirstOrDefault(Function(c) Js.Str(c, "phone") = q)
        If exact IsNot Nothing Then
            PickCustomer(exact)
            Return New List(Of JsonObject)
        End If
        Changed(False)
        Return active.Where(Function(c) Js.Str(c, "phone").Contains(q)).Take(6).ToList()
    End Function

    Friend Sub PickCustomer(c As JsonObject)
        _customerId = Js.Int(c, "id")
        _matched = True
        _aside.Checkout.SetCustomer(Js.Str(c, "phone"), Js.Str(c, "name"))
        Changed(False)
    End Sub

    Friend Sub AddSplitPayment()
        If Pays.Count = 1 Then Pays(0).Amount = PayAmount(Pays(0))
        Pays.Add(New PayRow With {.Method = "UPI", .Amount = ""})
        _paysEdited = True
        _aside.Checkout.RebuildPays()
        Changed()
    End Sub

    Friend Sub RemovePay(r As PayRow)
        If Pays.Count <= 1 Then Return
        Pays.Remove(r)
        _paysEdited = True
        _aside.Checkout.RebuildPays()
        Changed()
    End Sub

    Friend Sub EditPay()
        _paysEdited = True
        Changed(False)
    End Sub

    Friend Sub ResetForNextSale()
        Lines.Clear()
        _coupon = Nothing : _couponMsg = ("", False)
        _paysEdited = False
        Pays.Clear()
        Pays.Add(New PayRow With {.Method = "Cash", .Amount = "0.00"})
        _customerId = 0 : _matched = False : _guest = False
        _aside.Checkout.ResetFields()
        _cart.ResetCoupon()
        Changed()
        _scan.FocusBox()
    End Sub

    ''' <summary>Something changed: redraw the totals; rebuild the rows when the cart itself changed.</summary>
    Friend Sub Changed(Optional rows As Boolean = True)
        If rows Then _cart.RebuildRows()
        _cart.RefreshTotals()
        _aside.Refresh_()
        LayoutParts()
    End Sub

    ' ───────── Pay Now ─────────
    Friend Async Function CompleteAsync() As Task
        If _busy Then Return
        If Lines.Count = 0 Then Ui.Info(Me, "Cart is empty.") : Return
        Dim total = GrandTotal, paidNow = PaidTotal, due_ = Due
        If _guest AndAlso due_ > 0.004 Then Ui.Info(Me, "Guest bills must be paid in full. Turn off Guest Bill to record a due amount against a customer.") : Return
        Dim nameIn = _aside.Checkout.CustomerName
        If Not _guest AndAlso due_ > 0.004 AndAlso _customerId = 0 AndAlso nameIn = "" Then
            Ui.Info(Me, "This sale has a due amount — please select an existing customer or enter a walk-in customer name so it can be tracked.")
            Return
        End If
        _busy = True
        _aside.Refresh_()
        Try
            Dim ref = "win-" & Js.NewId()
            Dim soldAt = DateTime.UtcNow
            Dim payArr As New JsonArray()
            For Each p In Pays : payArr.Add(New JsonObject From {{"method", p.Method}, {"amount", Num(PayAmount(p))}}) : Next
            Dim items As New JsonArray()
            For Each l In Lines
                items.Add(New JsonObject From {{"product_id", l.ProductId}, {"qty", l.Qty}, {"price_override", l.UnitPrice}, {"unit", l.Unit}, {"size_id", If(l.SizeId.HasValue, JsonValue.Create(l.SizeId.Value), Nothing)}})
            Next
            Dim customerName = If(_guest, "", nameIn)
            Dim phone = If(_guest, "", _aside.Checkout.Phone)
            Dim promised = _aside.Checkout.Promised
            Dim body As New JsonObject From {
                {"items", items}, {"customer_id", If(_guest, 0, _customerId)}, {"customer_name", customerName},
                {"customer_phone", phone}, {"is_guest", _guest}, {"payments", payArr},
                {"promised_date", If(due_ > 0.004 AndAlso promised.HasValue, promised.Value.ToString("yyyy-MM-dd"), Nothing)},
                {"coupon_code", If(_coupon Is Nothing, "", Js.Str(_coupon, "code"))}, {"client_ref", ref},
                {"offline", True}, {"sold_at", soldAt.ToString("o")}, {"offline_discount", Discount}}
            Dim shown = If(_guest, "Guest", If(customerName <> "", customerName, If(phone <> "", phone, "Walk-in Customer")))
            Dim item As New OutboxItem With {.Id = ref, .Method = "POST", .Path = "/api/ecommerce/billing/checkout", .Label = "Bill · " & Theme.Money(total) & " · " & shown, .Body = body}
            Dim receipt As New ReceiptData With {.At = DateTime.Now, .Customer = If(_guest, "Guest", If(customerName = "", "Walk-in Customer", customerName)), .Phone = phone,
                .Subtotal = Subtotal, .Discount = Discount, .Gst = Gst, .Total = total, .Due = Math.Round(due_, 2)}
            For Each l In Lines : receipt.Lines.Add((l.Name, CDbl(l.Qty), l.UnitPrice, l.Unit)) : Next
            For Each p In Js.Objs(payArr) : receipt.Payments.Add((Js.Str(p, "method"), Js.Num(p, "amount"))) : Next
            Dim r = Await AppState.I.SendNowAsync(item)
            If r.IsOk OrElse r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
                ' Stock and the bill show at once (the server confirms the same when the bill reaches it).
                For Each l In Lines : AppState.I.TakeStock(l.ProductId, l.SizeId, l.Qty) : Next
                receipt.Number = If(r.IsOk, Js.Str(r.Data, "order_number"), "Offline")
                receipt.Offline = Not r.IsOk
                If Not r.IsOk Then
                    Dim its As New JsonArray()
                    For Each l In Lines : its.Add(New JsonObject From {{"productId", l.ProductId}, {"name", l.Name}, {"qty", l.Qty}, {"price", l.UnitPrice}, {"gstRate", l.GstRate}}) : Next
                    AppState.I.AddLocal("orders", New JsonObject From {{"id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}, {"localRef", ref}, {"number", "Offline"}, {"type", "offline"}, {"status", "Delivered"},
                        {"paymentStatus", If(due_ > 0.004, "Unpaid", "Paid")}, {"customer", shown}, {"total", total}, {"paid", paidNow}, {"due", Math.Max(0, due_)}, {"createdAt", soldAt.ToString("o")}, {"items", its}})
                    _notice = "No internet — this bill is saved on this computer and will upload automatically. Keep billing."
                End If
                _lastReceipt = receipt
                If PrintPrefs.AutoPrint() Then PrintReceipt(receipt)
                If r.IsOk Then Toast("Bill " & receipt.Number & " saved.")
                ResetForNextSale()
                _offline.Refresh_()
            Else
                Ui.Info(Me, If(r.Message, "Checkout failed."))
            End If
        Finally
            _busy = False
            _aside.Refresh_()
        End Try
    End Function

    Friend ReadOnly Property Busy As Boolean
        Get
            Return _busy
        End Get
    End Property

    ''' <summary>Print on this computer's bill paper and printer (My Profile → Printing; the website's Invoice Settings).</summary>
    Private Sub PrintReceipt(r As ReceiptData)
        Dim preview = False
        Dim size = PrintPrefs.Choose(Me, "Print bill " & r.Number, preview)
        If size Is Nothing Then Return
        Receipts.Print(r, size, Me, preview)
    End Sub

    Friend Sub CloseNotice()
        _notice = Nothing
        _offline.Refresh_()
        LayoutParts()
    End Sub

    ' ───────── layout: [cart column | 350px Payment Summary] ─────────
    Protected Overrides Sub OnResize(e As EventArgs)
        MyBase.OnResize(e)
        LayoutParts()
    End Sub

    Private Sub LayoutParts()
        If Width < 50 Then Return
        Const pad = 24, gap = 20, asideW = 350
        Dim leftW = Width - pad * 2 - gap - asideW
        Dim y = pad
        Dim offH = _offline.HeightFor(leftW)
        _offline.Visible = offH > 0
        If offH > 0 Then _offline.SetBounds(pad, y, leftW, offH) : y += offH + 16
        _scan.Visible = Show("b2-scan")
        If _scan.Visible Then _scan.SetBounds(pad, y, leftW, 56) : y += 56 + 16
        Dim cartH = Math.Max(440, Height - y - pad)
        _cart.Visible = Show("b2-cart") OrElse ShowIn("b2-footer", "b2-coupon") OrElse ShowIn("b2-footer", "b2-totals")
        _cart.SetBounds(pad, y, leftW, If(Show("b2-cart"), cartH, _cart.FooterHeight()))
        Dim ah = Math.Min(_aside.HeightFor(asideW), Height - pad * 2)
        _aside.SetBounds(Width - pad - asideW, pad, asideW, _aside.HeightFor(asideW))
    End Sub
End Class

''' <summary>One payment row (method + amount).</summary>
Public Class PayRow
    Public Method As String = "Cash"
    Public Amount As String = ""
End Class

' ═════════════════════════════ offline bar (PosOfflineBar) ═════════════════════════════
Public Class OfflineBar
    Inherits Control
    Private ReadOnly _page As BillingPage
    Private _open As Boolean
    Private _spots As New List(Of (Key As String, Item As OutboxItem, R As Rectangle))

    Public Sub New(page As BillingPage)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _page = page
        BackColor = Theme.Page
    End Sub

    Private Function Bills() As List(Of OutboxItem)
        Return AppState.I.Outbox.Where(Function(o) o.Path = "/api/ecommerce/billing/checkout").ToList()
    End Function

    Public Function HeightFor(width As Integer) As Integer
        Dim h = 0
        If _page.Notice IsNot Nothing Then h += 42
        Dim q = Bills()
        If Not AppState.I.Online OrElse q.Count > 0 Then
            If h > 0 Then h += 8
            h += 44 + If(_open, q.Count * 44 + 8, 0)
        End If
        Return h
    End Function

    Public Sub Refresh_()
        Invalidate()
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Page)
        Theme.Smooth(g)
        _spots = New List(Of (String, OutboxItem, Rectangle))
        Dim y = 0
        Dim f = Theme.Px(13.5F), fb = Theme.Px(13.5F, 500)
        If _page.Notice IsNot Nothing Then
            Dim r As New Rectangle(0, 0, Width - 1, 41)
            Box(g, r, Color.FromArgb(&HFF, &HFB, &HEB), Color.FromArgb(&HFC, &HD3, &H4D))
            Icons.Draw(g, "cloud-off", New RectangleF(16, 13, 16, 16), Color.FromArgb(&H92, &H40, &HE))
            Tr.DrawText(g, _page.Notice, f, New Rectangle(40, 0, Width - 90, 42), Color.FromArgb(&H92, &H40, &HE), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            Dim x As New Rectangle(Width - 36, 9, 24, 24)
            Icons.Draw(g, "x", New RectangleF(x.X + 4, x.Y + 4, 16, 16), Color.FromArgb(&H92, &H40, &HE))
            _spots.Add(("close", Nothing, x))
            y = 50
        End If
        Dim q = Bills()
        Dim online = AppState.I.Online
        If Not online OrElse q.Count > 0 Then
            Dim failed = q.Where(Function(b) b.Failed).ToList(), waiting = q.Where(Function(b) Not b.Failed).ToList()
            Dim bg = If(Not online, Color.FromArgb(&HFE, &HF2, &HF2), If(failed.Count > 0, Color.FromArgb(&HFF, &HF7, &HF7), Color.FromArgb(&HEF, &HF6, &HFF)))
            Dim bd = If(Not online OrElse failed.Count > 0, Color.FromArgb(&HFC, &HA5, &HA5), Color.FromArgb(&HBF, &HDB, &HFE))
            Dim fg = If(Not online OrElse failed.Count > 0, Color.FromArgb(&H99, &H1B, &H1B), Color.FromArgb(&H1E, &H3A, &H8A))
            Dim r As New Rectangle(0, y, Width - 1, Height - y - 1)
            Box(g, r, bg, bd)
            Icons.Draw(g, If(online, "wifi", "cloud-off"), New RectangleF(16, y + 14, 16, 16), fg)
            Dim msg = If(Not online, "No internet — keep billing. Bills are saved on this computer and upload by themselves.", "Back online.")
            If waiting.Count > 0 Then msg &= " " & waiting.Count & " bill" & If(waiting.Count = 1, "", "s") & " waiting to upload."
            If failed.Count > 0 Then msg &= " " & failed.Count & " bill" & If(failed.Count = 1, " needs", "s need") & " a look."
            Dim bx = Width - 12
            If online AndAlso waiting.Count > 0 Then
                Dim w = Tr.MeasureText("Upload now", Theme.Px(13.5F, 600)).Width + 16 + 8 + 24
                Dim br As New Rectangle(bx - w, y + 7, w, 30)
                Using p = Theme.RoundRect(New RectangleF(br.X, br.Y, br.Width, br.Height), Theme.Radius)
                    Using b As New SolidBrush(Web.Blue) : g.FillPath(b, p) : End Using
                End Using
                Icons.Draw(g, "cloud-upload", New RectangleF(br.X + 12, br.Y + 7, 16, 16), Color.White)
                Tr.DrawText(g, "Upload now", Theme.Px(13.5F, 600), New Rectangle(br.X + 34, br.Y, w, 30), Color.White, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                _spots.Add(("upload", Nothing, br))
                bx = br.X - 8
            End If
            If q.Count > 0 Then
                Dim t = If(_open, "Hide bills", "Show bills")
                Dim w = Tr.MeasureText(t, fb).Width + 20
                Dim sr As New Rectangle(bx - w, y + 7, w, 30)
                Tr.DrawText(g, t, fb, sr, fg, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                _spots.Add(("toggle", Nothing, sr))
                bx = sr.X - 8
            End If
            Tr.DrawText(g, msg, fb, New Rectangle(40, y, bx - 44, 44), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            If _open Then
                Dim ly = y + 44
                For Each b In q
                    Using br As New SolidBrush(Color.FromArgb(178, 255, 255, 255)) : g.FillRectangle(br, 12, ly, Width - 25, 44) : End Using
                    Tr.DrawText(g, b.Label.Replace("Bill · ", ""), Theme.Px(13, 600), New Point(24, ly + 6), Theme.G700, TextFormatFlags.NoPadding)
                    Tr.DrawText(g, Fmt.IstStamp(b.CreatedAt) & " · " & b.Id.Substring(Math.Max(0, b.Id.Length - 10)).ToUpperInvariant() & If(b.Error <> "", " · " & b.Error, ""), Theme.Px(12), New Point(24, ly + 24), Theme.G500, TextFormatFlags.NoPadding)
                    If b.Failed Then
                        Dim rr As New Rectangle(Width - 12 - 90 - 8 - 70, ly + 8, 70, 28)
                        Dim rm As New Rectangle(Width - 12 - 90, ly + 8, 90, 28)
                        Box(g, rr, Color.White, Theme.G200)
                        Tr.DrawText(g, "Retry", Theme.Px(12.5F, 500), rr, Theme.G700, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
                        Box(g, rm, Color.White, Color.FromArgb(&HFE, &HCA, &HCA))
                        Tr.DrawText(g, "Remove", Theme.Px(12.5F, 500), rm, Color.FromArgb(&HB9, &H1C, &H1C), TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
                        _spots.Add(("retry", b, rr)) : _spots.Add(("remove", b, rm))
                    End If
                    ly += 44
                Next
            End If
        End If
    End Sub

    Private Shared Sub Box(g As Graphics, r As Rectangle, bg As Color, bd As Color)
        Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), Theme.Radius)
            Using b As New SolidBrush(bg) : g.FillPath(b, p) : End Using
            Using pen As New Pen(bd) : g.DrawPath(pen, p) : End Using
        End Using
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Cursor = If(_spots.Any(Function(s) s.R.Contains(e.Location)), Cursors.Hand, Cursors.Default)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        Dim hit = _spots.FirstOrDefault(Function(s) s.R.Contains(e.Location))
        Select Case hit.Key
            Case "close" : _page.CloseNotice()
            Case "toggle" : _open = Not _open : _page.Changed(False)
            Case "upload"
                Dim unused = AppState.I.SyncNowAsync()
            Case "retry" : AppState.I.Retry(hit.Item)
            Case "remove"
                If Ui.Confirm(Me, "Remove this bill from the upload list? It will NOT be saved to the system.") Then AppState.I.Discard(hit.Item)
        End Select
        _page.Changed(False)
    End Sub
End Class

' ═════════════════════════════ scan bar ═════════════════════════════
Public Class ScanBar
    Inherits Control
    Private ReadOnly _page As BillingPage
    Private ReadOnly _box As New TextBox With {.BorderStyle = BorderStyle.None}
    Private _found As New List(Of JsonObject)
    Private _dd As ToolStripDropDown
    Private _btn As Rectangle

    Public Sub New(page As BillingPage)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _page = page
        BackColor = BillingPage.CoralSoft
        _box.Font = Theme.Px(14)
        _box.PlaceholderText = "Scan barcode or type product name / SKU..."
        Controls.Add(_box)
        ' suggestions wait until typing pauses: a scanner types the whole code + Enter in a few ms, and an open
        ' list would take the keyboard away from the box (the scan got lost)
        AddHandler _box.TextChanged, Sub()
                                         _wait.Stop()
                                         _dd?.Close()
                                         If _box.Text.Trim().Length >= 2 Then _wait.Start()
                                     End Sub
        AddHandler _wait.Tick, Sub()
                                   _wait.Stop()
                                   If _box.Focused Then Suggest()
                               End Sub
        AddHandler _box.KeyDown, AddressOf KeyDown_
        AddHandler _box.GotFocus, Sub() Invalidate()
        AddHandler _box.LostFocus, Sub() Invalidate()
    End Sub

    Public Sub FocusBox()
        If _box.CanFocus Then _box.Focus()
    End Sub

    ''' <summary>A key that arrived elsewhere (a scanner): into the box, cursor at the end.</summary>
    Public Sub Type(ch As String)
        If Not _box.CanFocus Then Return
        _box.Focus()
        _box.SelectionStart = _box.TextLength
        _box.SelectedText = ch
    End Sub

    Private ReadOnly _wait As New Timer With {.Interval = 220}
    Private _cacheSrc As JsonNode
    Private _cache As List(Of JsonObject)
    Private _byCode As Dictionary(Of String, JsonObject)

    ''' <summary>Active products, sorted once per data change (not on every key), plus a barcode / SKU / id index.</summary>
    Private Function Products() As List(Of JsonObject)
        Dim node As JsonNode = Nothing
        AppState.I.Sets.TryGetValue("products", node)
        If _cache Is Nothing OrElse node IsNot _cacheSrc Then
            _cacheSrc = node
            _cache = AppState.I.List("products").Where(Function(p) Js.Str(p, "status") = "active").OrderBy(Function(p) Js.Str(p, "name")).ToList()
            _byCode = New Dictionary(Of String, JsonObject)(StringComparer.OrdinalIgnoreCase)
            For Each p In _cache
                For Each k In {Js.Str(p, "barcode").Trim(), Js.Str(p, "sku").Trim()}
                    If k <> "" AndAlso Not _byCode.ContainsKey(k) Then _byCode(k) = p
                Next
                For Each z In Js.Objs(Js.Arr(p, "sizes"))
                    Dim k = Js.Str(z, "barcode").Trim()
                    If k <> "" AndAlso Not _byCode.ContainsKey(k) Then _byCode(k) = p
                Next
            Next
        End If
        Return _cache
    End Function

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        _btn = New Rectangle(Width - 8 - 4 - 40, 12, 40, 32)
        _box.SetBounds(8 + 12 + 16 + 10, (Height - _box.PreferredHeight) \ 2, _btn.X - 36 - 10, _box.PreferredHeight)
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Page)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0, 0, Width - 1, Height - 1), Theme.Radius)
            Using b As New SolidBrush(BillingPage.CoralSoft) : g.FillPath(b, p) : End Using
        End Using
        Dim r As New RectangleF(8.5F, 8.5F, Width - 17, Height - 17)
        Using p = Theme.RoundRect(r, Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(BillingPage.CoralBorder) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, "scan-barcode", New RectangleF(20, (Height - 16) / 2.0F, 16, 16), Theme.G700)
        Using p = Theme.RoundRect(New RectangleF(_btn.X, _btn.Y, _btn.Width, _btn.Height), Theme.Radius)
            Using b As New SolidBrush(BillingPage.Coral) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, "search", New RectangleF(_btn.X + 12, _btn.Y + 8, 16, 16), Color.White)
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Cursor = If(_btn.Contains(e.Location), Cursors.Hand, Cursors.IBeam)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        If _btn.Contains(e.Location) Then Enter() Else _box.Focus()
    End Sub

    ''' <summary>2+ characters: up to 8 products by name / SKU / barcode (useProductScan).</summary>
    Private Sub Suggest()
        _dd?.Close()
        Dim q = _box.Text.Trim().ToLowerInvariant()
        If q.Length < 2 Then _found.Clear() : Return
        _found = Products().Where(Function(p) Js.Str(p, "name").ToLowerInvariant().Contains(q) OrElse Js.Str(p, "sku").ToLowerInvariant().Contains(q) OrElse Js.Str(p, "barcode").Contains(q)).Take(8).ToList()
        If _found.Count = 0 Then Return
        Dim list As New ResultList(_found, Sub(p) Pick(p))
        list.Width = Width - 16
        Dim host As New ToolStripControlHost(list) With {.Margin = Padding.Empty, .Padding = Padding.Empty, .AutoSize = False, .Size = list.Size}
        _dd = New ToolStripDropDown With {.Padding = Padding.Empty, .DropShadowEnabled = True, .AutoClose = True}
        _dd.Items.Add(host)
        _dd.Show(Me, New Point(8, Height - 2))
        _box.Focus()
    End Sub

    Private Sub Pick(p As JsonObject)
        _dd?.Close()
        _box.Text = ""
        _found.Clear()
        _page.AddToCart(p)
        _box.Focus()
    End Sub

    ''' <summary>Enter: exact barcode / SKU / id first (what a scanner sends), otherwise the first name match.</summary>
    Private Sub Enter()
        Dim v = _box.Text.Trim()
        If v = "" Then Return
        _wait.Stop()
        Dim all = Products()
        Dim exact As JsonObject = Nothing
        If Not _byCode.TryGetValue(v, exact) Then
            ' not in the index (e.g. a product changed on this computer just now): look through the fresh list
            exact = AppState.I.List("products").FirstOrDefault(Function(p) Js.Str(p, "status") = "active" AndAlso
                (String.Equals(Js.Str(p, "barcode").Trim(), v, StringComparison.OrdinalIgnoreCase) OrElse String.Equals(Js.Str(p, "sku").Trim(), v, StringComparison.OrdinalIgnoreCase) OrElse
                 Js.Int(p, "id").ToString() = v OrElse Js.Objs(Js.Arr(p, "sizes")).Any(Function(z) String.Equals(Js.Str(z, "barcode").Trim(), v, StringComparison.OrdinalIgnoreCase))))
            If exact IsNot Nothing Then _cache = Nothing ' rebuild the index next time
        End If
        If exact IsNot Nothing Then Pick(exact) : Return
        Dim m = all.FirstOrDefault(Function(p) Js.Str(p, "name").ToLowerInvariant().Contains(v.ToLowerInvariant()))
        If m IsNot Nothing Then Pick(m) Else Ui.Info(Me, "No product found for """ & v & """.")
    End Sub

    Private Sub KeyDown_(sender As Object, e As KeyEventArgs)
        If e.KeyCode = Keys.Enter Then
            e.SuppressKeyPress = True
            _dd?.Close()
            Enter()
        ElseIf e.KeyCode = Keys.Escape Then
            _dd?.Close()
        End If
    End Sub

    Private Class ResultList
        Inherits Control
        Private ReadOnly _items As List(Of JsonObject)
        Private ReadOnly _pick As Action(Of JsonObject)
        Private _hover As Integer = -1
        Public Sub New(items As List(Of JsonObject), pick As Action(Of JsonObject))
            SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
            _items = items : _pick = pick
            Cursor = Cursors.Hand
            Height = Math.Min(288, items.Count * 48 + 8)
        End Sub
        Protected Overrides Sub OnPaint(e As PaintEventArgs)
            Dim g = e.Graphics
            g.Clear(Color.White)
            Using pen As New Pen(Theme.G200) : g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1) : End Using
            For k = 0 To _items.Count - 1
                Dim p = _items(k)
                Dim y = 4 + k * 48
                If k = _hover Then
                    Using b As New SolidBrush(BillingPage.CoralSoft) : g.FillRectangle(b, 1, y, Width - 2, 48) : End Using
                End If
                Dim price = Theme.Money(Pos.ShelfPrice(p))
                Dim pw = Tr.MeasureText(price, Theme.Px(14, 600)).Width
                Tr.DrawText(g, Js.Str(p, "name"), Theme.Px(14, 500), New Rectangle(12, y + 6, Width - pw - 36, 20), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                Dim meta = If(Js.Str(p, "sku") <> "", "SKU: " & Js.Str(p, "sku"), "No SKU") & If(Pos.PackLabel(p) IsNot Nothing, " · " & Pos.PackLabel(p), "") & If(Js.IsNull(p, "stock"), "", " · Stock: " & Js.Int(p, "stock"))
                Tr.DrawText(g, meta, Theme.Px(12), New Rectangle(12, y + 26, Width - pw - 36, 18), Theme.G400, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                Tr.DrawText(g, price, Theme.Px(14, 600), New Rectangle(Width - 12 - pw, y, pw + 2, 48), Theme.G800, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            Next
        End Sub
        Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
            MyBase.OnMouseMove(e)
            Dim k = (e.Y - 4) \ 48
            If k <> _hover Then _hover = k : Invalidate()
        End Sub
        Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
            MyBase.OnMouseClick(e)
            Dim k = (e.Y - 4) \ 48
            If k >= 0 AndAlso k < _items.Count Then _pick(_items(k))
        End Sub
    End Class
End Class

' ═════════════════════════════ the cart card ═════════════════════════════
Public Class CartCard
    Inherits Control
    Private ReadOnly _page As BillingPage
    Private ReadOnly _rows As New Panel With {.AutoScroll = True, .BackColor = Color.White}
    Private ReadOnly _addBtn As New CoralButton("Add Product", "package-plus")
    Private ReadOnly _coupon As New TextBox With {.BorderStyle = BorderStyle.None}
    Private ReadOnly _apply As New CoralButton("Apply", "")
    Private _tableRect As Rectangle, _footRect As Rectangle, _couponRect As Rectangle, _totalsRect As Rectangle

    Public Sub New(page As BillingPage)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _page = page
        BackColor = Theme.Page
        _coupon.Font = Theme.Px(14)
        _coupon.PlaceholderText = "Enter coupon code"
        _coupon.CharacterCasing = CharacterCasing.Upper
        Controls.AddRange(New Control() {_rows, _addBtn, _coupon, _apply})
        Ui.DoubleBuffer(_rows)
        AddHandler _addBtn.Click, Sub() QuickAdd()
        AddHandler _apply.Click, Sub() _page.ApplyCoupon(_coupon.Text)
        AddHandler _coupon.KeyDown, Sub(s, e)
                                        If e.KeyCode = Keys.Enter Then e.SuppressKeyPress = True : _page.ApplyCoupon(_coupon.Text)
                                    End Sub
    End Sub

    Public Sub ResetCoupon()
        _coupon.Text = ""
    End Sub

    Private ReadOnly Property ShowCoupon As Boolean
        Get
            Return _page.ShowIn("b2-footer", "b2-coupon")
        End Get
    End Property
    Private ReadOnly Property ShowTotals As Boolean
        Get
            Return _page.ShowIn("b2-footer", "b2-totals")
        End Get
    End Property

    Public Function FooterHeight() As Integer
        Return If(ShowCoupon OrElse ShowTotals, 32 + 138, 0)
    End Function

    ''' <summary>Visible columns: key, header, width (0 = takes what is left).</summary>
    Friend Function Cols() As List(Of (Key As String, Head As String, W As Integer))
        Dim l As New List(Of (String, String, Integer))
        For Each c In {("b2-col-product", "Product", 0), ("b2-col-price", "Price", 120), ("b2-col-qty", "Quantity", 130), ("b2-col-unit", "Unit", 120), ("b2-col-subtotal", "Subtotal", 110), ("b2-col-action", "Action", 64)}
            If _page.ShowIn("b2-cart", c.Item1) Then l.Add(c)
        Next
        Return l
    End Function

    Friend Function ColX(width As Integer) As List(Of (Key As String, X As Integer, W As Integer))
        Dim cs = Cols()
        Dim fixed_ = cs.Where(Function(c) c.W > 0).Sum(Function(c) c.W)
        Dim rest = Math.Max(120, width - fixed_)
        Dim x = 0
        Dim res As New List(Of (String, Integer, Integer))
        For Each c In cs
            Dim w = If(c.W > 0, c.W, rest)
            res.Add((c.Key, x, w))
            x += w
        Next
        Return res
    End Function

    Public Sub RebuildRows()
        _rows.SuspendLayout()
        For Each c As Control In _rows.Controls.Cast(Of Control)().ToList() : _rows.Controls.Remove(c) : c.Dispose() : Next
        Dim y = 0
        For Each l In _page.Lines
            Dim r As New CartRow(_page, Me, l)
            r.SetBounds(0, y, Math.Max(100, _rows.ClientSize.Width), 48)
            _rows.Controls.Add(r)
            y += 48
        Next
        _rows.ResumeLayout()
        Invalidate()
        PerformLayout()
    End Sub

    Public Sub RefreshTotals()
        For Each r In _rows.Controls.OfType(Of CartRow)() : r.Invalidate() : Next
        Invalidate()
    End Sub

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        Dim showCart = _page.Show("b2-cart")
        Dim y = 0
        If showCart Then
            _addBtn.Visible = _page.Show("b2-add-product")
            _addBtn.SetBounds(Width - 16 - _addBtn.Width, 16, _addBtn.Width, 26)
            y = 16 + 26 + 12
            Dim footH = If(ShowCoupon OrElse ShowTotals, 12 + 138, 0)
            _tableRect = New Rectangle(16, y, Width - 32, Height - y - footH - 16)
            _rows.SetBounds(_tableRect.X + 1, _tableRect.Y + 36, _tableRect.Width - 2, Math.Max(0, _tableRect.Height - 37))
            _rows.Visible = True
            For Each r In _rows.Controls.OfType(Of CartRow)() : r.Width = _rows.ClientSize.Width : Next
            y = _tableRect.Bottom + 12
        Else
            _addBtn.Visible = False : _rows.Visible = False
            _tableRect = Rectangle.Empty
        End If
        _footRect = New Rectangle(0, y, Width, Height - y)
        Dim both = ShowCoupon AndAlso ShowTotals
        Dim half = (Width - 32 - 12) \ 2
        _couponRect = If(ShowCoupon, New Rectangle(16, y + 16, If(both, half, Width - 32), 86), Rectangle.Empty)
        _totalsRect = If(ShowTotals, New Rectangle(If(both, 16 + half + 12, 16), y + 16, If(both, half, Width - 32), 122), Rectangle.Empty)
        _coupon.Visible = ShowCoupon : _apply.Visible = ShowCoupon
        If ShowCoupon Then
            _apply.SetBounds(_couponRect.Right - 12 - _apply.Width, _couponRect.Y + 40, _apply.Width, 32)
            _coupon.SetBounds(_couponRect.X + 12 + 10, _couponRect.Y + 40 + (32 - _coupon.PreferredHeight) \ 2, _apply.Left - 8 - _couponRect.X - 12 - 20, _coupon.PreferredHeight)
        End If
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Page)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        If Not _tableRect.IsEmpty Then
            Icons.Draw(g, "shopping-cart", New RectangleF(16, 21, 16, 16), BillingPage.Coral)
            Tr.DrawText(g, "Cart", Theme.Px(16, 600), New Point(40, 18), Theme.G900, TextFormatFlags.NoPadding)
            Dim n = _page.Lines.Count
            Tr.DrawText(g, "(" & n & " item" & If(n = 1, "", "s") & ")", Theme.Px(14), New Point(40 + Tr.MeasureText("Cart", Theme.Px(16, 600)).Width + 8, 20), Theme.G400, TextFormatFlags.NoPadding)
            Using p = Theme.RoundRect(New RectangleF(_tableRect.X + 0.5F, _tableRect.Y + 0.5F, _tableRect.Width - 1, _tableRect.Height - 1), Theme.Radius)
                Using pen As New Pen(Theme.G100) : g.DrawPath(pen, p) : End Using
            End Using
            Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, _tableRect.X + 1, _tableRect.Y + 1, _tableRect.Width - 2, 35) : End Using
            Dim cs = ColX(_tableRect.Width)
            If cs.Count = 0 Then
                Tr.DrawText(g, "All cart columns are hidden — turn them back on from Display Options.", Theme.Px(14), New Rectangle(_tableRect.X, _tableRect.Y + 40, _tableRect.Width, 60), Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
            End If
            For Each c In cs
                Dim head = Cols().First(Function(x) x.Key = c.Key).Head
                Dim right = c.Key = "b2-col-subtotal", center = c.Key = "b2-col-action"
                Dim r As New Rectangle(_tableRect.X + c.X + 12, _tableRect.Y, c.W - 12 - If(right, 20, If(center, 0, 0)), 36)
                If center Then r = New Rectangle(_tableRect.X + c.X, _tableRect.Y, c.W - 12, 36)
                Tr.DrawText(g, head, Theme.Px(12, 500), r, Theme.G500, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or If(right, TextFormatFlags.Right, If(center, TextFormatFlags.HorizontalCenter, TextFormatFlags.Left)))
            Next
            If _page.Lines.Count = 0 AndAlso cs.Count > 0 Then
                Dim cy = _tableRect.Y + 36 + 40
                Icons.Draw(g, "shopping-cart", New RectangleF(_tableRect.X + _tableRect.Width / 2.0F - 14, cy, 28, 28), Theme.G300)
                Tr.DrawText(g, "Cart is empty — scan a product to begin, or use ""Add Product"" for something not in the list.", Theme.Px(14), New Rectangle(_tableRect.X, cy + 34, _tableRect.Width, 22), Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
            End If
            Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 0, _footRect.Y, Width, _footRect.Y) : End Using
        End If
        If Not _couponRect.IsEmpty Then
            Using p = Theme.RoundRect(New RectangleF(_couponRect.X, _couponRect.Y, _couponRect.Width, _couponRect.Height), Theme.Radius)
                Using b As New SolidBrush(Color.FromArgb(&HFF, &HF6, &HF3)) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, "tag", New RectangleF(_couponRect.X + 12, _couponRect.Y + 14, 14, 14), BillingPage.Coral)
            Tr.DrawText(g, "Coupon Code", Theme.Px(14, 600), New Point(_couponRect.X + 34, _couponRect.Y + 12), Theme.G900, TextFormatFlags.NoPadding)
            Dim ib As New Rectangle(_couponRect.X + 12, _couponRect.Y + 40, _apply.Left - 8 - _couponRect.X - 12, 32)
            Using p = Theme.RoundRect(New RectangleF(ib.X + 0.5F, ib.Y + 0.5F, ib.Width - 1, ib.Height - 1), Theme.Radius)
                Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
            End Using
            Dim m = _page.CouponMessage
            If m.Text <> "" Then Tr.DrawText(g, m.Text, Theme.Px(12), New Point(_couponRect.X + 12, _couponRect.Y + 76), If(m.Ok, Color.FromArgb(5, &H96, &H69), Color.FromArgb(&HDC, &H26, &H26)), TextFormatFlags.NoPadding)
        End If
        If Not _totalsRect.IsEmpty Then
            Dim t = _totalsRect
            Using p = Theme.RoundRect(New RectangleF(t.X, t.Y, t.Width, t.Height), Theme.Radius)
                Using b As New SolidBrush(Theme.G50) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, "info", New RectangleF(t.X + 16, t.Y + 14, 16, 16), Color.FromArgb(2, &H84, &HC7))
            Dim lx = t.X + 42, rx = t.Right - 16
            Dim f = Theme.Px(14)
            Dim rowY = t.Y + 12
            Dim rowOf = Sub(label As String, value As String, col As Color)
                            Tr.DrawText(g, label, f, New Point(lx, rowY), Theme.G500, TextFormatFlags.NoPadding)
                            Dim vw = Tr.MeasureText(value, f).Width
                            Tr.DrawText(g, value, f, New Point(rx - vw, rowY), col, TextFormatFlags.NoPadding)
                            rowY += 22
                        End Sub
            rowOf("Subtotal", Theme.Money(_page.Subtotal), Theme.G800)
            rowOf("Discount", "-" & Theme.Money(_page.Discount), Color.FromArgb(&HEF, &H44, &H44))
            Dim rate = _page.SameGstRate
            rowOf("GST" & If(rate.HasValue, " (" & rate.Value.ToString("0.##", Globalization.CultureInfo.InvariantCulture) & "%)", "") & If(_page.TaxIncluded, " incl.", ""), If(_page.TaxIncluded, "", "+") & Theme.Money(_page.Gst), Theme.G800)
            Using pen As New Pen(Theme.G200) : g.DrawLine(pen, lx, rowY + 4, rx, rowY + 4) : End Using
            Tr.DrawText(g, "Total", Theme.Px(16, 600), New Point(lx, rowY + 16), Theme.G900, TextFormatFlags.NoPadding)
            Dim tv = Theme.Money(_page.GrandTotal)
            Dim tf = Theme.Px(18, 700)
            Tr.DrawText(g, tv, tf, New Point(rx - Tr.MeasureText(tv, tf).Width, rowY + 14), Theme.G900, TextFormatFlags.NoPadding)
        End If
    End Sub

    ''' <summary>"Add a New Product" (QuickAddProductModal): creates a real product on the website and adds it.</summary>
    Private Sub QuickAdd()
        Dim f As New FormDialog("Add a New Product", 440, "Add to Cart")
        f.AddText("name", "Product name *", "", required:=True, placeholder:="e.g. Rice 1KG Pack")
        f.AddNumber("price", "Price *", Nothing, required:=True, half:=True)
        f.AddNumber("qty", "Quantity", 1, half:=True)
        f.AddPick("unit", "Unit", {"|No unit"}.Concat({"KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"}.Select(Function(u) u & "|" & u)).Concat({"custom|Custom…"}), "", half:=True)
        f.AddNumber("gst", "GST rate (%)", 0, half:=True)
        f.AddText("customUnit", "Custom unit name", "", placeholder:="e.g. Dozen, Box")
        f.ShowField("customUnit", False)
        AddHandler CType(f.Input("unit"), ComboBox).SelectedIndexChanged, Sub()
                                                                             f.ShowField("customUnit", f.Val("unit") = "custom")
                                                                             f.Relayout()
                                                                         End Sub
        f.AddNote("This saves it as a real product too, so it's ready to sell again next time.")
        f.Validator = Function(d)
                          If d.Val("name").Trim() = "" Then Return "Product name is required."
                          If d.Num("price") < 0 Then Return "Enter a valid price."
                          Return Nothing
                      End Function
        f.OnSave = Async Function(d)
                       Dim unit = If(d.Val("unit") = "custom", d.Val("customUnit").Trim(), d.Val("unit"))
                       Dim r = Await AppState.I.Api.SendAsync("POST", "/api/ecommerce/billing/quick-product", Js.Obj("name", d.Val("name").Trim(), "price", d.Num("price"), "gst_rate", d.Num("gst"), "unit", unit), Js.NewId())
                       If Not r.IsOk Then Return If(r.Outcome = ApiOutcome.Offline, "Adding a new product needs the internet. Sell it with a product already in the list for now.", If(r.Message, "Could not add this product."))
                       Dim sp = TryCast(Js.Field(r.Data, "product"), JsonObject)
                       If sp Is Nothing Then Return "Could not add this product."
                       ' the website's PosProduct → this computer's product row
                       Dim p = Js.Obj("id", Js.Int(sp, "id"), "name", Js.Str(sp, "name"), "sku", Js.Str(sp, "sku"), "barcode", Js.Str(sp, "barcode"), "price", Js.Num(sp, "price"),
                                      "gstRate", Js.Num(sp, "gstRate"), "unit", Js.Str(sp, "unit"), "status", "active", "type", Js.Str(sp, "productType", "physical"))
                       p("salePrice") = Js.Copy(Js.Field(sp, "salePrice"))
                       p("stock") = Js.Copy(Js.Field(sp, "stockQty"))
                       p("quantity") = Js.Copy(Js.Field(sp, "quantity"))
                       p("sizes") = New JsonArray()
                       p("categoryId") = Js.Copy(Js.Field(sp, "categoryId"))
                       AppState.I.AddLocal("products", p)
                       _page.AddToCart(p, Math.Max(1, CInt(Math.Floor(d.Num("qty")))), checkStock:=False)
                       Dim unused = AppState.I.SyncNowAsync(only:={"products"})
                       Return Nothing
                   End Function
        f.ShowDialog(FindForm())
    End Sub
End Class

''' <summary>The coral soft button (Add Product, Add, Apply).</summary>
Public Class CoralButton
    Inherits Control
    Private ReadOnly _icon As String
    Private _hover As Boolean
    Public Sub New(text As String, icon As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Me.Text = text : _icon = icon
        Font = Theme.Px(12, 600)
        Cursor = Cursors.Hand
        Height = 26
        Width = 10 + If(icon = "", 6, 14 + 4) + Tr.MeasureText(text, Font).Width + 10
    End Sub
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(If(_hover, Color.FromArgb(&HFF, &HE9, &HE2), BillingPage.CoralSoft)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(BillingPage.CoralBorder) : g.DrawPath(pen, p) : End Using
        End Using
        Dim x = 10
        If _icon <> "" Then
            Icons.Draw(g, _icon, New RectangleF(x, (Height - 14) / 2.0F, 14, 14), BillingPage.Coral)
            x += 18
        Else
            x = (Width - Tr.MeasureText(Text, Font).Width) \ 2
        End If
        Tr.DrawText(g, Text, Font, New Rectangle(x, 0, Width - x, Height), BillingPage.Coral, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>One cart row: product, price (₹, editable), − qty +, size / unit, subtotal, remove.</summary>
Public Class CartRow
    Inherits Control
    Private ReadOnly _page As BillingPage
    Private ReadOnly _card As CartCard
    Private ReadOnly _l As CartLine
    Private ReadOnly _price As New TextBox With {.BorderStyle = BorderStyle.None, .TextAlign = HorizontalAlignment.Left}
    Private ReadOnly _qty As New TextBox With {.BorderStyle = BorderStyle.None, .TextAlign = HorizontalAlignment.Center}
    Private ReadOnly _unitText As New TextBox With {.BorderStyle = BorderStyle.None, .MaxLength = 40}
    Private _customUnit As Boolean
    Private _hover As Boolean
    Private _minus, _plus, _unit, _del, _unitX As Rectangle
    Private Shared ReadOnly Presets As String() = {"KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"}

    Public Sub New(page As BillingPage, card As CartCard, l As CartLine)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _page = page : _card = card : _l = l
        BackColor = Color.White
        For Each t In {_price, _qty, _unitText} : t.Font = Theme.Px(14) : Next
        _qty.Font = Theme.Px(14, 600)
        _price.Text = l.UnitPrice.ToString("0.00", Globalization.CultureInfo.InvariantCulture)
        _qty.Text = l.Qty.ToString()
        _customUnit = l.Unit <> "" AndAlso Not Presets.Contains(l.Unit) AndAlso Options().Count <= 1 AndAlso l.Size Is Nothing AndAlso l.Unit <> If(Pos.PackLabel(l.Product), "")
        _unitText.Text = l.Unit
        _unitText.PlaceholderText = "Unit"
        Controls.AddRange(New Control() {_price, _qty, _unitText})
        AddHandler _price.TextChanged, Sub()
                                           If Not _price.Focused Then Return
                                           Dim d As Double
                                           If Double.TryParse(_price.Text, Globalization.NumberStyles.Any, Globalization.CultureInfo.InvariantCulture, d) AndAlso d >= 0 Then _page.SetPrice(_l, d) : Invalidate()
                                       End Sub
        AddHandler _price.GotFocus, Sub() _price.SelectAll()
        AddHandler _price.LostFocus, Sub() _price.Text = _l.UnitPrice.ToString("0.00", Globalization.CultureInfo.InvariantCulture)
        AddHandler _qty.TextChanged, Sub()
                                         If Not _qty.Focused Then Return
                                         Dim n As Integer
                                         If Integer.TryParse(_qty.Text, n) AndAlso n >= 1 Then _page.SetQty(_l, n) : Invalidate()
                                     End Sub
        AddHandler _qty.GotFocus, Sub() _qty.SelectAll()
        AddHandler _qty.LostFocus, Sub() _qty.Text = _l.Qty.ToString()
        AddHandler _unitText.TextChanged, Sub() If _unitText.Focused Then _page.SetUnit(_l, _unitText.Text)
    End Sub

    ''' <summary>The line's variants (linked products) and sizes, in one list (VariantPicker).</summary>
    Private Function Options() As List(Of (P As JsonObject, Z As JsonObject))
        Dim p = _l.Product
        Dim products = AppState.I.List("products")
        Dim group = If(Js.IsNull(p, "variantGroup") OrElse Js.Int(p, "variantGroup") = 0, New List(Of JsonObject),
                       products.Where(Function(x) Js.Int(x, "variantGroup") = Js.Int(p, "variantGroup") AndAlso Js.Str(x, "status") = "active").OrderBy(Function(x) Pos.PackSortKey(x)).ThenBy(Function(x) Js.Num(x, "price")).ToList())
        Dim list = If(group.Count > 1, group, New List(Of JsonObject) From {p})
        Dim res As New List(Of (JsonObject, JsonObject))
        For Each v In list
            Dim sizes = Js.Objs(Js.Arr(v, "sizes"))
            If sizes.Count > 0 Then
                Dim hasQty = Not Js.IsNull(v, "quantity") AndAlso Js.Num(v, "quantity") > 0
                If hasQty Then res.Add((v, Nothing))
                Dim own = If(Pos.PackLabel(v), "").ToLowerInvariant()
                For Each z In sizes
                    If hasQty AndAlso Js.Str(z, "label").Trim().ToLowerInvariant() = own Then Continue For
                    res.Add((v, z))
                Next
            Else
                res.Add((v, Nothing))
            End If
        Next
        Return res
    End Function

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        Dim cols = _card.ColX(Width)
        _price.Visible = False : _qty.Visible = False : _unitText.Visible = False
        _minus = Rectangle.Empty : _plus = Rectangle.Empty : _unit = Rectangle.Empty : _del = Rectangle.Empty : _unitX = Rectangle.Empty
        For Each c In cols
            Dim x = c.X + 12, cy = Height \ 2
            Select Case c.Key
                Case "b2-col-price"
                    _price.Visible = True
                    _price.SetBounds(x + 20, cy - _price.PreferredHeight \ 2, c.W - 12 - 20 - 8, _price.PreferredHeight)
                Case "b2-col-qty"
                    _minus = New Rectangle(x, cy - 16, 32, 32)
                    _qty.Visible = True
                    _qty.SetBounds(x + 33, cy - _qty.PreferredHeight \ 2, 42, _qty.PreferredHeight)
                    _plus = New Rectangle(x + 33 + 44, cy - 16, 32, 32)
                Case "b2-col-unit"
                    _unit = New Rectangle(x, cy - 16, c.W - 12, 32)
                    If _customUnit Then
                        _unitText.Visible = True
                        _unitX = New Rectangle(_unit.Right - 22, cy - 9, 18, 18)
                        _unitText.SetBounds(x + 8, cy - _unitText.PreferredHeight \ 2, _unit.Width - 8 - 26, _unitText.PreferredHeight)
                    End If
                Case "b2-col-action"
                    _del = New Rectangle(c.X + (c.W - 12) \ 2 - 14, cy - 14, 28, 28)
            End Select
        Next
    End Sub

    Private Shared Sub Field(g As Graphics, r As Rectangle, Optional border As Color = Nothing, Optional fill As Color = Nothing)
        Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), Theme.Radius)
            Using b As New SolidBrush(If(fill = Color.Empty, Color.White, fill)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(border = Color.Empty, Theme.G200, border)) : g.DrawPath(pen, p) : End Using
        End Using
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(If(_hover, Color.FromArgb(&HFB, &HFC, &HFD), Color.White))
        Theme.Smooth(g)
        If _page.Lines.IndexOf(_l) > 0 Then
            Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 0, 0, Width, 0) : End Using
        End If
        For Each c In _card.ColX(Width)
            Dim x = c.X + 12, cy = Height \ 2
            Select Case c.Key
                Case "b2-col-product"
                    Tr.DrawText(g, _l.Name, Theme.Px(14, 500), New Rectangle(x, 0, Math.Min(260, c.W - 20), Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                Case "b2-col-price"
                    Dim r As New Rectangle(x, cy - 16, c.W - 12 - 4, 32)
                    If _l.Overridden Then Field(g, r, BillingPage.CoralBorder, Color.FromArgb(&HFF, &HF8, &HF6)) Else Field(g, r)
                    _price.BackColor = If(_l.Overridden, Color.FromArgb(&HFF, &HF8, &HF6), Color.White)
                    Tr.DrawText(g, "₹", Theme.Px(12), New Rectangle(r.X + 8, r.Y, 12, r.Height), Theme.G400, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                Case "b2-col-qty"
                    Field(g, New Rectangle(_minus.X, _minus.Y, 32 * 2 + 44 + 2, 32))
                    Using pen As New Pen(Theme.G200)
                        g.DrawLine(pen, _minus.Right, _minus.Y, _minus.Right, _minus.Bottom)
                        g.DrawLine(pen, _plus.X, _plus.Y, _plus.X, _plus.Bottom)
                    End Using
                    Icons.Draw(g, "minus", New RectangleF(_minus.X + 9, _minus.Y + 9, 14, 14), Theme.G500)
                    Icons.Draw(g, "plus", New RectangleF(_plus.X + 9, _plus.Y + 9, 14, 14), Theme.G500)
                Case "b2-col-unit"
                    Dim opts = Options()
                    If opts.Count > 1 Then
                        Field(g, _unit, BillingPage.CoralBorder, Color.FromArgb(&HFF, &HF8, &HF6))
                        Dim cur = opts.FirstOrDefault(Function(o) Js.Int(o.P, "id") = _l.ProductId AndAlso Nullable.Equals(If(o.Z Is Nothing, CType(Nothing, Integer?), Js.Int(o.Z, "id")), _l.SizeId))
                        Dim label = If(cur.P Is Nothing, _l.Unit, If(cur.Z IsNot Nothing, Js.Str(cur.Z, "label"), Pos.VariantLabel(cur.P)))
                        Tr.DrawText(g, label, Theme.Px(14, 600), New Rectangle(_unit.X + 8, _unit.Y, _unit.Width - 30, 32), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                        Icons.Draw(g, "chevron-down", New RectangleF(_unit.Right - 20, _unit.Y + 9, 14, 14), Theme.G400)
                    ElseIf _customUnit Then
                        Field(g, _unit)
                        Icons.Draw(g, "x", New RectangleF(_unitX.X + 2, _unitX.Y + 2, 14, 14), Theme.G400)
                    Else
                        Field(g, _unit)
                        Tr.DrawText(g, If(_l.Unit = "", "—", _l.Unit), Theme.Px(14), New Rectangle(_unit.X + 8, _unit.Y, _unit.Width - 30, 32), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                        Icons.Draw(g, "chevron-down", New RectangleF(_unit.Right - 20, _unit.Y + 9, 14, 14), Theme.G400)
                    End If
                Case "b2-col-subtotal"
                    Tr.DrawText(g, Theme.Money(_l.Total), Theme.Px(14, 600), New Rectangle(x, 0, c.W - 12 - 20, Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                Case "b2-col-action"
                    Icons.Draw(g, "trash-2", New RectangleF(_del.X + 6, _del.Y + 6, 16, 16), Color.FromArgb(&HEF, &H44, &H44))
            End Select
        Next
    End Sub

    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim hot = {_minus, _plus, _del, _unitX}.Any(Function(r) r.Contains(e.Location)) OrElse (_unit.Contains(e.Location) AndAlso Not _customUnit)
        Cursor = If(hot, Cursors.Hand, Cursors.Default)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        If _minus.Contains(e.Location) Then _page.ChangeQty(_l, -1) : Return
        If _plus.Contains(e.Location) Then _page.ChangeQty(_l, 1) : Return
        If _del.Contains(e.Location) Then _page.Remove(_l) : Return
        If _unitX.Contains(e.Location) AndAlso _customUnit Then
            _customUnit = False
            _page.SetUnit(_l, "")
            PerformLayout() : Invalidate()
            Return
        End If
        If _unit.Contains(e.Location) AndAlso Not _customUnit Then
            Dim at = PointToScreen(New Point(_unit.X, _unit.Bottom + 2))
            Dim opts = Options()
            If opts.Count > 1 Then
                Dim items As New List(Of String)
                For k = 0 To opts.Count - 1
                    Dim o = opts(k)
                    Dim label = If(o.Z IsNot Nothing, Js.Str(o.Z, "label"), Pos.VariantLabel(o.P))
                    Dim price = If(o.Z IsNot Nothing, Pos.SizePrice(o.Z), Pos.ShelfPrice(o.P))
                    Dim stock = If(o.Z IsNot Nothing AndAlso Not Js.IsNull(o.Z, "stock"), CType(Js.Int(o.Z, "stock"), Integer?), If(Js.IsNull(o.P, "stock"), CType(Nothing, Integer?), Js.Int(o.P, "stock")))
                    Dim out = Js.Str(o.P, "type", "physical") = "physical" AndAlso stock.HasValue AndAlso stock.Value <= 0
                    Dim isCur = Js.Int(o.P, "id") = _l.ProductId AndAlso Nullable.Equals(If(o.Z Is Nothing, CType(Nothing, Integer?), Js.Int(o.Z, "id")), _l.SizeId)
                    If out AndAlso Not isCur Then Continue For
                    items.Add(If(isCur, "*", "") & k & "|" & label & " · " & Theme.Money(price) & If(out, " · out of stock", ""))
                Next
                WebMenu.Show(Me, items, Sub(key)
                                            Dim o = opts(CInt(key))
                                            _page.Swap(_l, o.P, o.Z)
                                        End Sub, at)
            Else
                WebMenu.Show(Me, {If(_l.Unit = "", "*", "") & "|—"}.Concat(Presets.Select(Function(u) If(_l.Unit = u, "*", "") & u & "|" & u)).Concat({"__custom|Custom…"}), Sub(key)
                                                                                                                                                                                If key = "__custom" Then
                                                                                                                                                                                    _customUnit = True
                                                                                                                                                                                    _page.SetUnit(_l, "")
                                                                                                                                                                                    _unitText.Text = ""
                                                                                                                                                                                    PerformLayout() : Invalidate()
                                                                                                                                                                                    _unitText.Focus()
                                                                                                                                                                                Else
                                                                                                                                                                                    _page.SetUnit(_l, key)
                                                                                                                                                                                    Invalidate()
                                                                                                                                                                                End If
                                                                                                                                                                            End Sub, at)
            End If
        End If
    End Sub
End Class

' ═════════════════════════════ Payment Summary (right column) ═════════════════════════════
Public Class SummaryAside
    Inherits Control
    Private ReadOnly _page As BillingPage
    Public ReadOnly Checkout As CheckoutCard

    Public Sub New(page As BillingPage)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _page = page
        Checkout = New CheckoutCard(page)
        Controls.Add(Checkout)
    End Sub

    Private Function SummaryCardH() As Integer
        Dim p = _page
        Dim tot = p.ShowIn("b2-summary", "b2-sum-total"), rec = p.ShowIn("b2-summary", "b2-sum-received"), due = p.ShowIn("b2-summary", "b2-sum-due")
        Dim showDue = due AndAlso (p.Due > 0.004 OrElse p.Lines.Count > 0)
        If Not (tot OrElse rec OrElse showDue) Then Return 0
        Return 14 + If(tot, 44, 0) + If(rec, 44, 0) + If(showDue, 48, 0) + 6
    End Function

    Public Function HeightFor(width As Integer) As Integer
        Dim sh = SummaryCardH()
        Return 8 + 40 + If(sh > 0, sh + 8, 0) + Checkout.HeightFor(width - 16) + 8
    End Function

    Public Sub Refresh_()
        Checkout.Refresh_()
        PerformLayout()
        Invalidate()
    End Sub

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        Dim sh = SummaryCardH()
        Dim y = 8 + 40 + If(sh > 0, sh + 8, 0)
        Checkout.SetBounds(8, y, Width - 16, Checkout.HeightFor(Width - 16))
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Page)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0, 0, Width - 1, Height - 1), Theme.Radius)
            Using b As New LinearGradientBrush(New Rectangle(0, 0, Width, Height), Color.FromArgb(&HEF, &H74, &H56), Color.FromArgb(&HFD, &HEF, &HEA), LinearGradientMode.Vertical)
                Dim blend As New ColorBlend(3)
                blend.Colors = {Color.FromArgb(&HEF, &H74, &H56), Color.FromArgb(&HF6, &HB3, &HA2), Color.FromArgb(&HFD, &HEF, &HEA)}
                blend.Positions = {0.0F, 0.3F, 1.0F}
                b.InterpolationColors = blend
                g.FillPath(b, p)
            End Using
        End Using
        Icons.Draw(g, "credit-card", New RectangleF(18, 20, 16, 16), Color.White)
        Tr.DrawText(g, "Payment Summary", Theme.Px(15, 600), New Point(42, 18), Color.White, TextFormatFlags.NoPadding)
        Dim n = _page.Lines.Count
        Dim t = n & " item" & If(n = 1, "", "s")
        Dim tw = Tr.MeasureText(t, Theme.Px(12, 500)).Width + 16
        Dim br As New Rectangle(Width - 18 - tw, 17, tw, 22)
        Using p = Theme.RoundRect(New RectangleF(br.X, br.Y, br.Width, br.Height), Theme.Radius)
            Using b As New SolidBrush(Color.FromArgb(217, 255, 255, 255)) : g.FillPath(b, p) : End Using
        End Using
        Tr.DrawText(g, t, Theme.Px(12, 500), br, BillingPage.Coral, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        ' totals card
        Dim sh = SummaryCardH()
        If sh = 0 Then Return
        Dim c As New Rectangle(8, 48, Width - 16, sh)
        Using p = Theme.RoundRect(New RectangleF(c.X, c.Y, c.Width, c.Height), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
        End Using
        Dim pg = _page
        Dim y = c.Y + 14
        Dim f = Theme.Px(14)
        If pg.ShowIn("b2-summary", "b2-sum-total") Then
            Tr.DrawText(g, "Total Amount", f, New Point(c.X + 14, y + 6), Theme.G600, TextFormatFlags.NoPadding)
            Dim v = Theme.Money(pg.GrandTotal), vf = Theme.Px(20, 700)
            Tr.DrawText(g, v, vf, New Point(c.Right - 14 - Tr.MeasureText(v, vf).Width, y), Theme.G900, TextFormatFlags.NoPadding)
            y += 44
            If pg.ShowIn("b2-summary", "b2-sum-received") Then
                Using pen As New Pen(Theme.G100) : g.DrawLine(pen, c.X + 14, y - 8, c.Right - 14, y - 8) : End Using
            End If
        End If
        If pg.ShowIn("b2-summary", "b2-sum-received") Then
            Tr.DrawText(g, "Amount Received", f, New Point(c.X + 14, y + 4), Theme.G600, TextFormatFlags.NoPadding)
            Dim v = Theme.Money(pg.PaidTotal), vf = Theme.Px(16, 600)
            Tr.DrawText(g, v, vf, New Point(c.Right - 14 - Tr.MeasureText(v, vf).Width, y + 2), Theme.G900, TextFormatFlags.NoPadding)
            y += 44
        End If
        If pg.ShowIn("b2-summary", "b2-sum-due") AndAlso (pg.Due > 0.004 OrElse pg.Lines.Count > 0) Then
            Dim r As New Rectangle(c.X + 14, y, c.Width - 28, 42)
            Dim due = pg.Due > 0.004
            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                If due Then
                    Using b As New LinearGradientBrush(r, Color.FromArgb(&HFD, &HEC, &HEC), Color.FromArgb(&HFF, &HF5, &HF3), LinearGradientMode.Horizontal) : g.FillPath(b, p) : End Using
                Else
                    Using b As New SolidBrush(Color.FromArgb(&HEC, &HFD, &HF5)) : g.FillPath(b, p) : End Using
                End If
            End Using
            Dim fg = If(due, Color.FromArgb(&HEF, &H44, &H44), Color.FromArgb(5, &H96, &H69))
            If due Then
                Using b As New SolidBrush(fg) : g.FillEllipse(b, r.X + 12, r.Y + 12, 18, 18) : End Using
                Tr.DrawText(g, "!", Theme.Px(11, 700), New Rectangle(r.X + 12, r.Y + 12, 18, 18), Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            Else
                Icons.Draw(g, "circle-check", New RectangleF(r.X + 12, r.Y + 13, 16, 16), fg)
            End If
            Tr.DrawText(g, If(due, "Due Amount", "Fully Paid"), Theme.Px(14, 600), New Point(r.X + 38, r.Y + 12), fg, TextFormatFlags.NoPadding)
            Dim v = Theme.Money(If(due, pg.Due, 0)), vf = Theme.Px(18, 700)
            Tr.DrawText(g, v, vf, New Point(r.Right - 12 - Tr.MeasureText(v, vf).Width, r.Y + 10), fg, TextFormatFlags.NoPadding)
        End If
    End Sub
End Class

''' <summary>The white card: Customer (guest switch, mobile + name, matches), Payment rows, promise date, Pay Now, secure note.</summary>
Public Class CheckoutCard
    Inherits Control
    Private ReadOnly _page As BillingPage
    Private ReadOnly _phone As New TextBox With {.BorderStyle = BorderStyle.None}
    Private ReadOnly _name As New TextBox With {.BorderStyle = BorderStyle.None}
    Private ReadOnly _addPay As New CoralButton("Add", "plus")
    Private ReadOnly _promise As New DateTimePicker With {.Format = DateTimePickerFormat.Custom, .CustomFormat = "dd/MM/yyyy", .ShowCheckBox = True, .Checked = False}
    Private ReadOnly _payBoxes As New List(Of (Row As PayRow, Box As TextBox))
    Private _spots As New List(Of (Key As String, Row As PayRow, R As Rectangle))
    Private _guestR, _payNowR As Rectangle
    Private _dd As ToolStripDropDown
    Private _y As New Dictionary(Of String, Integer)

    Public Sub New(page As BillingPage)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _page = page
        BackColor = Color.White
        _phone.Font = Theme.Px(14) : _name.Font = Theme.Px(14) : _promise.Font = Theme.Px(14)
        _phone.PlaceholderText = "Mobile" : _name.PlaceholderText = "Name"
        Controls.AddRange(New Control() {_phone, _name, _addPay, _promise})
        AddHandler _phone.TextChanged, Sub()
                                           If Not _phone.Focused Then Return
                                           Dim list = _page.PhoneTyped(_phone.Text)
                                           ShowMatches(list)
                                       End Sub
        AddHandler _name.TextChanged, Sub() If _name.Focused Then _page.Changed(False)
        AddHandler _addPay.Click, Sub() _page.AddSplitPayment()
        RebuildPays()
    End Sub

    Public ReadOnly Property CustomerName As String
        Get
            Return _name.Text.Trim()
        End Get
    End Property
    Public ReadOnly Property Phone As String
        Get
            Return _phone.Text.Trim()
        End Get
    End Property
    Public ReadOnly Property Promised As Date?
        Get
            Return If(_promise.Visible AndAlso _promise.Checked, _promise.Value.Date, CType(Nothing, Date?))
        End Get
    End Property

    Public Sub SetCustomer(ph As String, nm As String)
        _phone.Text = ph : _name.Text = nm
    End Sub

    Public Sub ResetFields()
        _phone.Text = "" : _name.Text = ""
        _promise.Checked = False
        RebuildPays()
    End Sub

    Private Sub ShowMatches(list As List(Of JsonObject))
        _dd?.Close()
        If list.Count = 0 Then Return
        _dd = Nothing
        WebMenu.Show(_phone, list.Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name") & "  (" & Js.Str(c, "phone") & ")"), Sub(k)
                                                                                                                                     Dim c = list.First(Function(x) Js.Int(x, "id").ToString() = k)
                                                                                                                                     _page.PickCustomer(c)
                                                                                                                                 End Sub, _phone.PointToScreen(New Point(-30, _phone.Height + 10)))
        _phone.Focus()
    End Sub

    Public Sub RebuildPays()
        For Each pb In _payBoxes : Controls.Remove(pb.Box) : pb.Box.Dispose() : Next
        _payBoxes.Clear()
        For Each r In _page.Pays
            Dim row = r
            Dim tb As New TextBox With {.BorderStyle = BorderStyle.None, .Font = Theme.Px(14), .PlaceholderText = "Amount", .Text = _page.PayAmount(r)}
            AddHandler tb.TextChanged, Sub()
                                           If Not tb.Focused Then Return
                                           row.Amount = tb.Text
                                           _page.EditPay()
                                       End Sub
            AddHandler tb.GotFocus, Sub()
                                        row.Amount = tb.Text
                                        tb.SelectAll()
                                    End Sub
            Controls.Add(tb)
            _payBoxes.Add((row, tb))
        Next
        PerformLayout()
    End Sub

    Public Sub Refresh_()
        For Each pb In _payBoxes
            If Not pb.Box.Focused Then pb.Box.Text = _page.PayAmount(pb.Row)
        Next
        _phone.Enabled = Not _page.Guest : _name.Enabled = Not _page.Guest
        _promise.Visible = _page.Due > 0.004 AndAlso _page.ShowIn("b2-checkout", "b2-payments")
        PerformLayout()
        Invalidate()
    End Sub

    Private ReadOnly Property ShowCustomer As Boolean
        Get
            Return _page.ShowIn("b2-checkout", "b2-customer")
        End Get
    End Property
    Private ReadOnly Property ShowPayments As Boolean
        Get
            Return _page.ShowIn("b2-checkout", "b2-payments")
        End Get
    End Property

    Public Function HeightFor(width As Integer) As Integer
        Dim h = 14
        If ShowCustomer Then
            h += 26 + 8 + 38
            If _page.Matched OrElse _page.Guest Then h += 26
        End If
        If ShowCustomer AndAlso ShowPayments Then h += 28
        If ShowPayments Then
            h += 26 + 8 + _page.Pays.Count * 46 - 8
            If _page.Due > 0.004 Then h += 12 + 20 + 34
        End If
        h += If(ShowCustomer OrElse ShowPayments, 16, 0) + 44
        If _page.ShowIn("b2-checkout", "b2-secure-note") Then h += 26
        Return h + 14
    End Function

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        Dim w = Width - 28
        Dim y = 14
        _y.Clear()
        _phone.Visible = ShowCustomer : _name.Visible = ShowCustomer
        If ShowCustomer Then
            _y("cust") = y
            y += 26 + 8
            Dim half = (w - 8) \ 2
            _y("inputs") = y
            _phone.SetBounds(14 + 32, y + (38 - _phone.PreferredHeight) \ 2, half - 32 - 10, _phone.PreferredHeight)
            _name.SetBounds(14 + half + 8 + 32, y + (38 - _name.PreferredHeight) \ 2, half - 32 - 10, _name.PreferredHeight)
            y += 38
            If _page.Matched OrElse _page.Guest Then _y("note") = y + 6 : y += 26
        End If
        If ShowCustomer AndAlso ShowPayments Then _y("div") = y + 14 : y += 28
        _addPay.Visible = ShowPayments
        For Each pb In _payBoxes : pb.Box.Visible = ShowPayments : Next
        If ShowPayments Then
            _y("pay") = y
            _addPay.SetBounds(Width - 14 - _addPay.Width, y, _addPay.Width, 26)
            y += 26 + 8
            _y("rows") = y
            For Each pb In _payBoxes
                pb.Box.SetBounds(14 + 108 + 8 + 24, y + (38 - pb.Box.PreferredHeight) \ 2, w - 108 - 8 - 24 - 8 - 32 - 10, pb.Box.PreferredHeight)
                y += 46
            Next
            y -= 8
            If _page.Due > 0.004 Then
                _y("promise") = y + 12
                _promise.SetBounds(14, y + 12 + 20, w, 32)
                y += 12 + 20 + 34
            End If
        End If
        y += If(ShowCustomer OrElse ShowPayments, 16, 0)
        _payNowR = New Rectangle(14, y, w, 44)
        y += 44
        If _page.ShowIn("b2-checkout", "b2-secure-note") Then _y("secure") = y + 8
    End Sub

    Private Shared Sub Field(g As Graphics, r As Rectangle, Optional disabled As Boolean = False)
        Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), Theme.Radius)
            Using b As New SolidBrush(If(disabled, Theme.G50, Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(BackColor)
        Theme.Smooth(g)
        _spots = New List(Of (String, PayRow, Rectangle))
        Dim w = Width - 28
        Dim title = Theme.Px(14, 600)
        Dim v As Integer
        If _y.TryGetValue("cust", v) Then
            Icons.Draw(g, "user", New RectangleF(14, v + 5, 16, 16), BillingPage.Coral)
            Tr.DrawText(g, "Customer", title, New Point(38, v + 3), Theme.G900, TextFormatFlags.NoPadding)
            Dim gl = Tr.MeasureText("Guest Bill", Theme.Px(12, 600)).Width
            _guestR = New Rectangle(Width - 14 - gl - 8 - 32, v + 3, gl + 8 + 32, 20)
            Dim trk As New Rectangle(_guestR.X, v + 4, 32, 18)
            Using p = Theme.RoundRect(New RectangleF(trk.X, trk.Y, trk.Width, trk.Height), 9)
                Using b As New SolidBrush(If(_page.Guest, BillingPage.Coral, Theme.G200)) : g.FillPath(b, p) : End Using
            End Using
            Using b As New SolidBrush(Color.White) : g.FillEllipse(b, If(_page.Guest, trk.Right - 16, trk.X + 2), trk.Y + 2, 14, 14) : End Using
            Tr.DrawText(g, "Guest Bill", Theme.Px(12, 600), New Point(trk.Right + 8, v + 6), Theme.G500, TextFormatFlags.NoPadding)
            _spots.Add(("guest", Nothing, _guestR))
            Dim iy = _y("inputs")
            Dim half = (w - 8) \ 2
            Dim a As New Rectangle(14, iy, half, 38), b2 As New Rectangle(14 + half + 8, iy, half, 38)
            Field(g, a, _page.Guest) : Field(g, b2, _page.Guest)
            Icons.Draw(g, "phone", New RectangleF(a.X + 11, a.Y + 12, 14, 14), Theme.G400)
            Icons.Draw(g, "user", New RectangleF(b2.X + 11, b2.Y + 12, 14, 14), Theme.G400)
            _phone.BackColor = If(_page.Guest, Theme.G50, Color.White) : _name.BackColor = _phone.BackColor
            If _y.TryGetValue("note", v) Then
                If _page.Guest Then
                    Icons.Draw(g, "info", New RectangleF(14, v + 1, 14, 14), Theme.G500)
                    Tr.DrawText(g, "No customer details needed — this bill must be paid in full.", Theme.Px(12), New Rectangle(34, v, w - 20, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                Else
                    Icons.Draw(g, "circle-check", New RectangleF(14, v + 1, 14, 14), Color.FromArgb(5, &H96, &H69))
                    Tr.DrawText(g, "Existing customer selected", Theme.Px(12), New Point(34, v), Color.FromArgb(5, &H96, &H69), TextFormatFlags.NoPadding)
                End If
            End If
        End If
        If _y.TryGetValue("div", v) Then
            Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 14, v, Width - 14, v) : End Using
        End If
        If _y.TryGetValue("pay", v) Then
            Icons.Draw(g, "wallet", New RectangleF(14, v + 5, 16, 16), BillingPage.Coral)
            Tr.DrawText(g, "Payment", title, New Point(38, v + 3), Theme.G900, TextFormatFlags.NoPadding)
            Dim y = _y("rows")
            Dim methodIcons = New Dictionary(Of String, String) From {{"Cash", "banknote"}, {"Card", "credit-card"}, {"UPI", "smartphone"}, {"Other", "wallet"}}
            For Each pb In _payBoxes
                Dim m As New Rectangle(14, y, 108, 38)
                Field(g, m)
                Icons.Draw(g, If(methodIcons.ContainsKey(pb.Row.Method), methodIcons(pb.Row.Method), "wallet"), New RectangleF(m.X + 10, m.Y + 12, 14, 14), Theme.G600)
                Tr.DrawText(g, pb.Row.Method, Theme.Px(14), New Rectangle(m.X + 32, m.Y, m.Width - 50, 38), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                Icons.Draw(g, "chevron-down", New RectangleF(m.Right - 20, m.Y + 12, 14, 14), Theme.G500)
                _spots.Add(("method", pb.Row, m))
                Dim a As New Rectangle(m.Right + 8, y, w - 108 - 8 - 8 - 32, 38)
                Field(g, a)
                Tr.DrawText(g, "₹", Theme.Px(14), New Rectangle(a.X + 10, a.Y, 14, 38), Theme.G500, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                Dim t As New Rectangle(a.Right + 8, y + 5, 28, 28)
                Dim can = _page.Pays.Count > 1
                Icons.Draw(g, "trash-2", New RectangleF(t.X + 6, t.Y + 6, 16, 16), If(can, Color.FromArgb(&HEF, &H44, &H44), Color.FromArgb(77, &HEF, &H44, &H44)))
                If can Then _spots.Add(("remove", pb.Row, t))
                y += 46
            Next
            If _y.TryGetValue("promise", v) Then Tr.DrawText(g, "Promise to pay by (optional)", Theme.Px(12), New Point(14, v), Theme.G600, TextFormatFlags.NoPadding)
        End If
        ' Pay Now
        Dim busy = _page.Busy
        Using p = Theme.RoundRect(New RectangleF(_payNowR.X, _payNowR.Y, _payNowR.Width, _payNowR.Height), Theme.Radius)
            Using b As New LinearGradientBrush(_payNowR, Color.FromArgb(If(busy, 153, 255), &HEE, &H6A, &H4D), Color.FromArgb(If(busy, 153, 255), &HF0, &H7E, &H62), LinearGradientMode.Horizontal) : g.FillPath(b, p) : End Using
        End Using
        Dim txt = If(busy, "Processing…", "Pay Now")
        Dim tf = Theme.Px(15, 600)
        Dim tw = Tr.MeasureText(txt, tf).Width
        Dim total = 16 + 8 + tw + If(busy, 0, 8 + 16)
        Dim x = _payNowR.X + (_payNowR.Width - total) \ 2
        Icons.Draw(g, "credit-card", New RectangleF(x, _payNowR.Y + 14, 16, 16), Color.White)
        Tr.DrawText(g, txt, tf, New Rectangle(x + 24, _payNowR.Y, tw + 2, 44), Color.White, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        If Not busy Then Icons.Draw(g, "arrow-right", New RectangleF(x + 24 + tw + 8, _payNowR.Y + 14, 16, 16), Color.White)
        _spots.Add(("pay", Nothing, _payNowR))
        If _y.TryGetValue("secure", v) Then
            Dim s = "Secure & Encrypted Payment"
            Dim sf = Theme.Px(11)
            Dim sw = Tr.MeasureText(s, sf).Width + 18
            Dim sx = (Width - sw) \ 2
            Icons.Draw(g, "lock", New RectangleF(sx, v + 3, 12, 12), Theme.G400)
            Tr.DrawText(g, s, sf, New Point(sx + 18, v + 2), Theme.G400, TextFormatFlags.NoPadding)
        End If
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Cursor = If(_spots.Any(Function(s) s.R.Contains(e.Location)), Cursors.Hand, Cursors.Default)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        Dim hit = _spots.FirstOrDefault(Function(s) s.R.Contains(e.Location))
        Select Case hit.Key
            Case "guest" : _page.ToggleGuest(Not _page.Guest)
            Case "pay"
                Dim unused = _page.CompleteAsync()
            Case "remove" : _page.RemovePay(hit.Row)
            Case "method"
                Dim row = hit.Row
                WebMenu.Show(Me, {"Cash", "Card", "UPI", "Other"}.Select(Function(m) If(m = row.Method, "*", "") & m & "|" & m), Sub(k)
                                                                                                                             If Not _page.Pays.Count = 1 OrElse True Then row.Amount = _page.PayAmount(row)
                                                                                                                             row.Method = k
                                                                                                                             _page.EditPay()
                                                                                                                         End Sub, PointToScreen(New Point(hit.R.X, hit.R.Bottom + 2)))
        End Select
    End Sub
End Class
