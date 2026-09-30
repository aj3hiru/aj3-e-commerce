Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Drawing.Printing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>One line of the bill.</summary>
Public Class CartLine
    Public Product As JsonObject
    Public Size As JsonObject
    Public Qty As Integer = 1
    Public UnitPrice As Double
    Public Overridden As Boolean
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
    Public ReadOnly Property Unit As String
        Get
            If Size IsNot Nothing Then Return Js.Str(Size, "label")
            Dim p = Js.Str(Product, "pack")
            Return If(p <> "", p, Js.Str(Product, "unit"))
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
    Public ReadOnly Property Stock As Integer?
        Get
            If Size IsNot Nothing AndAlso Not Js.IsNull(Size, "stock") Then Return Js.Int(Size, "stock")
            If Js.Str(Product, "type") = "physical" AndAlso Not Js.IsNull(Product, "stock") Then Return Js.Int(Product, "stock")
            Return Nothing
        End Get
    End Property

    ''' <summary>Shelf price: sale price when lower than the price.</summary>
    Public Shared Function ShelfPrice(p As JsonObject) As Double
        Dim price = Js.Num(p, "price"), sale = Js.Num(p, "salePrice")
        Return If(sale > 0 AndAlso sale < price, sale, price)
    End Function
    Public Shared Function SizePrice(z As JsonObject) As Double
        Dim mrp = Js.Num(z, "mrp"), p = Js.Num(z, "price")
        Return If(p > 0 AndAlso p < mrp, p, mrp)
    End Function
    Public Shared Function Sizes(p As JsonObject) As List(Of JsonObject)
        ' A product with its own Quantity (500 Gram) sells as itself.
        If Js.Num(p, "quantity") > 0 Then Return New List(Of JsonObject)
        Return Js.Objs(Js.Arr(p, "sizes"))
    End Function
End Class

''' <summary>"Billing / POS" as on the website: coral scan bar, cart table, coupon + totals, and the Payment
''' Summary column (customer, payments, Pay Now). Works fully offline — bills are saved and sent later.</summary>
Public Class BillingPage
    Inherits PageBase

    Private ReadOnly _lines As New List(Of CartLine)
    Private _coupon As JsonObject
    Private _customer As JsonObject

    Private ReadOnly _display As New DisplayOptions("ecom_billing2_display",
        New DisplayGroup("b2-cart", "Cart", "b2-col-price|Price", "b2-col-qty|Quantity", "b2-col-unit|Unit", "b2-col-subtotal|Subtotal"),
        New DisplayGroup("b2-footer", "Coupon & Totals", "b2-coupon|Coupon Code", "b2-totals|Subtotal / GST / Total"),
        New DisplayGroup("b2-checkout", "Customer & Payment", "b2-customer|Customer", "b2-payments|Payment Methods", "b2-secure-note|Keyboard shortcuts note"))

    ' left
    Private ReadOnly _left As New Panel With {.BackColor = Theme.Page}
    Private ReadOnly _scan As WInput = WInput.Make("Scan barcode or type product name / SKU...", Theme.IcBarcode)
    Private ReadOnly _results As New ListBox With {.DrawMode = DrawMode.OwnerDrawFixed, .ItemHeight = 44, .BorderStyle = BorderStyle.FixedSingle, .Visible = False, .Font = Theme.Body, .IntegralHeight = False}
    Private _found As New List(Of JsonObject)
    Private ReadOnly _cartCard As New Card()
    Private ReadOnly _cartHead As New CardHeading("Cart", Theme.IcCart, Theme.Coral)
    Private ReadOnly _clear As WButton = WButton.Make("Clear (F4)", Theme.IcDelete, Theme.Primary, outline:=True)
    Private ReadOnly _grid As New DataGridView()
    Private ReadOnly _couponBox As New Panel With {.BackColor = Color.White}
    Private ReadOnly _couponIn As WInput = WInput.Make("Enter coupon code", Theme.IcTicket)
    Private ReadOnly _couponBtn As WButton = WButton.Make("Apply", "", Theme.Coral)
    Private ReadOnly _couponNote As New Label With {.AutoSize = False, .Font = Theme.Small, .ForeColor = Theme.G500, .BackColor = Color.White}
    Private ReadOnly _totals As New TotalsBox()

    ' right (Payment Summary)
    Private ReadOnly _summary As New SummaryPanel()
    Private ReadOnly _guest As New CheckBox With {.Text = "Guest Bill", .Font = Theme.Body, .ForeColor = Theme.G700, .AutoSize = True, .BackColor = Color.White}
    Private ReadOnly _phone As WInput = WInput.Make("Mobile", Theme.IcPhone)
    Private ReadOnly _name As WInput = WInput.Make("Name", Theme.IcUser)
    Private ReadOnly _prevDue As New Label With {.AutoSize = True, .Font = Theme.BodyBold, .ForeColor = Theme.Danger, .BackColor = Color.White}
    Private ReadOnly _pays As New List(Of (Method As ComboBox, Amount As WInput, Remove As WButton))
    Private ReadOnly _addPay As WButton = WButton.Make("Add", Theme.IcAdd, Theme.Coral, outline:=True)
    Private _paysEdited As Boolean
    Private ReadOnly _promised As New DateTimePicker With {.Format = DateTimePickerFormat.Custom, .CustomFormat = "d MMM yyyy", .ShowCheckBox = True, .Checked = False, .Font = Theme.Body}
    Private ReadOnly _payNow As WButton = WButton.Make("Pay Now", Theme.IcCard, Theme.Coral)
    Private ReadOnly _print As New CheckBox With {.Text = "Print receipt", .Checked = PrintPrefs.AutoPrint(), .Font = Theme.Body, .ForeColor = Theme.G700, .AutoSize = True, .BackColor = Color.White}
    Private ReadOnly _keysNote As New Label With {.Text = "F2 Pay Now  ·  F4 New bill", .AutoSize = False, .Font = Theme.Small, .ForeColor = Theme.G500, .TextAlign = ContentAlignment.MiddleCenter, .BackColor = Color.White}
    Private _busy As Boolean

    Public Overrides ReadOnly Property PageTitle As String = "Billing / POS"
    Public Overrides ReadOnly Property PageSubtitle As String = "Scan a barcode or search a product to start a sale"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Private ReadOnly Property TaxIncluded As Boolean
        Get
            Return Js.Bool(AppState.I.Settings, "pricesIncludeTax")
        End Get
    End Property

    Public Sub New()
        Ui.DoubleBuffer(_left)
        Controls.Add(_left)
        Controls.Add(_summary)

        ' scan bar
        _left.Controls.Add(_scan)
        _left.Controls.Add(_results)
        AddHandler _scan.Box.TextChanged, Sub() Search()
        AddHandler _scan.Box.KeyDown, AddressOf ScanKey
        AddHandler _results.DrawItem, AddressOf DrawResult
        AddHandler _results.MouseClick, Sub(s, e)
                                            Dim i = _results.IndexFromPoint(e.Location)
                                            If i >= 0 Then AddProduct(_found(i))
                                        End Sub

        ' cart
        Ui.StyleGrid(_grid)
        _grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "product", .HeaderText = "Product", .FillWeight = 34, .ReadOnly = True})
        _grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "price", .HeaderText = "Price", .FillWeight = 13})
        _grid.Columns.Add(New DataGridViewButtonColumn With {.Name = "minus", .HeaderText = "", .FillWeight = 4, .Text = "−", .UseColumnTextForButtonValue = True, .FlatStyle = FlatStyle.Flat})
        _grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "qty", .HeaderText = "Quantity", .FillWeight = 8})
        _grid.Columns.Add(New DataGridViewButtonColumn With {.Name = "plus", .HeaderText = "", .FillWeight = 4, .Text = "+", .UseColumnTextForButtonValue = True, .FlatStyle = FlatStyle.Flat})
        _grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "unit", .HeaderText = "Unit", .FillWeight = 11, .ReadOnly = True})
        _grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "subtotal", .HeaderText = "Subtotal", .FillWeight = 13, .ReadOnly = True})
        _grid.Columns.Add(New DataGridViewButtonColumn With {.Name = "remove", .HeaderText = "Action", .FillWeight = 8, .Text = "Remove", .UseColumnTextForButtonValue = True, .FlatStyle = FlatStyle.Flat})
        _grid.Columns("subtotal").DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight
        _grid.Columns("subtotal").DefaultCellStyle.Font = Theme.BodyBold
        _grid.Columns("remove").DefaultCellStyle.ForeColor = Theme.Danger
        _grid.SelectionMode = DataGridViewSelectionMode.CellSelect
        _grid.EditMode = DataGridViewEditMode.EditOnKeystrokeOrF2
        AddHandler _grid.CellContentClick, AddressOf GridClick
        AddHandler _grid.CellEndEdit, AddressOf GridEdited
        _cartCard.Controls.Add(_cartHead)
        _cartCard.Controls.Add(_clear)
        _cartCard.Controls.Add(_grid)
        AddHandler _clear.Click, Sub() NewBill()
        _left.Controls.Add(_cartCard)

        _couponBox.Controls.AddRange(New Control() {_couponIn, _couponBtn, _couponNote})
        AddHandler _couponBtn.Click, Sub() ApplyCoupon()
        AddHandler _couponBox.Paint, AddressOf PaintBox
        _cartCard.Controls.Add(_couponBox)
        _cartCard.Controls.Add(_totals)

        ' summary column
        _summary.Controls.AddRange(New Control() {_guest, _phone, _name, _prevDue, _addPay, _promised, _payNow, _print, _keysNote})
        AddHandler _guest.CheckedChanged, Sub() Relayout()
        AddHandler _phone.Box.TextChanged, Sub() PhoneTyped()
        _phone.Box.AutoCompleteMode = AutoCompleteMode.SuggestAppend
        _phone.Box.AutoCompleteSource = AutoCompleteSource.CustomSource
        AddHandler _addPay.Click, Sub()
                                      AddPayRow("UPI", "")
                                      _paysEdited = True
                                      Relayout()
                                  End Sub
        AddHandler _payNow.Click, Async Sub() Await CompleteAsync()
        AddPayRow("Cash", "")

        AddHandler _display.Changed, Sub() Relayout()
        AddHandler AppState.I.DataChanged, Sub() FillCustomers()
        AddHandler Resize, Sub() Relayout()
        FillCustomers()
        Relayout()
    End Sub

    ''' <summary>A customer to start the next bill for ("New order" on a customer's profile).</summary>
    Public Shared Pending As Integer

    Public Overrides Sub OnOpened()
        FillCustomers()
        If Pending > 0 Then
            Dim c = AppState.I.List("customers").FirstOrDefault(Function(x) Js.Int(x, "id") = Pending)
            Pending = 0
            If c IsNot Nothing Then
                _guest.Checked = False
                _customer = c
                _phone.Text = Js.Str(c, "phone")
                _name.Text = Js.Str(c, "name")
                Dim due = Js.Num(c, "due")
                _prevDue.Text = If(due > 0, "Previous due: " & Theme.Money(due), "")
            End If
        End If
        Relayout()
        _scan.Box.Focus()
    End Sub

    Public Overrides Function HandleKey(k As Keys) As Boolean
        If k = Keys.F2 Then
            Dim unused = CompleteAsync()
            Return True
        End If
        If k = Keys.F4 Then NewBill() : Return True
        Return False
    End Function

    ' ───────── money ─────────
    Private ReadOnly Property Subtotal As Double
        Get
            Return _lines.Sum(Function(l) l.Total)
        End Get
    End Property
    Private ReadOnly Property Discount As Double
        Get
            If _coupon Is Nothing Then Return 0
            Dim eligible = 0.0
            For Each l In _lines
                Dim a = Js.Str(_coupon, "appliesTo")
                If a = "all" OrElse (a = "product" AndAlso Js.Int(_coupon, "productId") = l.ProductId) OrElse (a = "category" AndAlso Not Js.IsNull(_coupon, "categoryId") AndAlso Js.Int(_coupon, "categoryId") = Js.Int(l.Product, "categoryId")) Then eligible += l.Total
            Next
            If eligible <= 0 Then Return 0
            Dim v = Js.Num(_coupon, "discountValue")
            Return If(Js.Str(_coupon, "discountType") = "percentage", eligible * v / 100, Math.Min(v, eligible))
        End Get
    End Property
    Private ReadOnly Property Gst As Double
        Get
            Dim sub_ = Subtotal, disc = Discount, g = 0.0
            For Each l In _lines
                Dim share = If(sub_ > 0, disc * (l.Total / sub_), 0)
                Dim taxable = Math.Max(0, l.Total - share)
                If l.GstRate > 0 Then g += If(TaxIncluded, taxable - taxable / (1 + l.GstRate / 100), taxable * l.GstRate / 100)
            Next
            Return g
        End Get
    End Property
    Private ReadOnly Property GrandTotal As Double
        Get
            Return Math.Round(Math.Max(0, Subtotal - Discount) + If(TaxIncluded, 0, Gst), 2)
        End Get
    End Property
    Private ReadOnly Property Paid As Double
        Get
            Return _pays.Sum(Function(p) ParseAmount(p.Amount.Text))
        End Get
    End Property
    Private Shared Function ParseAmount(s As String) As Double
        Dim d As Double
        Return If(Double.TryParse(s, Globalization.NumberStyles.Any, Globalization.CultureInfo.InvariantCulture, d), d, 0)
    End Function

    ' ───────── products ─────────
    Private Sub Search()
        Dim q = _scan.Text.Trim().ToLowerInvariant()
        _found.Clear()
        If q.Length > 0 Then
            Dim words = q.Split(" "c, StringSplitOptions.RemoveEmptyEntries)
            _found = AppState.I.List("products").Where(Function(p) Js.Str(p, "status") = "active" AndAlso words.All(Function(w) (Js.Str(p, "name") & " " & Js.Str(p, "sku") & " " & Js.Str(p, "barcode")).ToLowerInvariant().Contains(w))).Take(12).ToList()
        End If
        _results.BeginUpdate()
        _results.Items.Clear()
        For Each p In _found : _results.Items.Add(Js.Str(p, "name")) : Next
        _results.EndUpdate()
        _results.Visible = _found.Count > 0
        Relayout()
    End Sub

    Private Sub ScanKey(sender As Object, e As KeyEventArgs)
        If e.KeyCode = Keys.Enter Then
            e.SuppressKeyPress = True
            Dim code = _scan.Text.Trim()
            If code = "" Then Return
            Dim exact = AppState.I.List("products").FirstOrDefault(Function(p) String.Equals(Js.Str(p, "barcode"), code, StringComparison.OrdinalIgnoreCase) OrElse String.Equals(Js.Str(p, "sku"), code, StringComparison.OrdinalIgnoreCase))
            If exact IsNot Nothing Then
                AddProduct(exact)
            ElseIf _found.Count > 0 Then
                AddProduct(_found(0))
            Else
                Toast("No product with '" & code & "'.", True)
            End If
        ElseIf e.KeyCode = Keys.Down AndAlso _results.Visible Then
            _results.Focus()
            _results.SelectedIndex = 0
        ElseIf e.KeyCode = Keys.Escape Then
            _scan.Text = ""
        End If
    End Sub

    Private Sub DrawResult(sender As Object, e As DrawItemEventArgs)
        If e.Index < 0 OrElse e.Index >= _found.Count Then Return
        Dim p = _found(e.Index)
        Dim g = e.Graphics
        Using b As New SolidBrush(If((e.State And DrawItemState.Selected) = DrawItemState.Selected, Theme.PrimarySoft, Color.White)) : g.FillRectangle(b, e.Bounds) : End Using
        TextRenderer.DrawText(g, Js.Str(p, "name"), Theme.BodyBold, New Rectangle(e.Bounds.X + 12, e.Bounds.Y + 4, e.Bounds.Width - 140, 20), Theme.G900, TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
        Dim stock = If(Js.Str(p, "type") = "physical" AndAlso Not Js.IsNull(p, "stock"), "Stock " & Js.Int(p, "stock") & "  ·  ", "")
        TextRenderer.DrawText(g, stock & Js.Str(p, "barcode"), Theme.Small, New Point(e.Bounds.X + 12, e.Bounds.Y + 24), Theme.G500, TextFormatFlags.NoPadding)
        TextRenderer.DrawText(g, Theme.Money(CartLine.ShelfPrice(p)), Theme.BodyBold, New Rectangle(e.Bounds.Right - 120, e.Bounds.Y, 108, e.Bounds.Height), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.VerticalCenter)
        Using pen As New Pen(Theme.G100) : g.DrawLine(pen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1) : End Using
    End Sub

    Private Sub AddProduct(p As JsonObject)
        Dim size As JsonObject = Nothing
        Dim sizes = CartLine.Sizes(p)
        If sizes.Count > 1 Then
            size = PickSize(p, sizes)
            If size Is Nothing Then Return
        ElseIf sizes.Count = 1 Then
            size = sizes(0)
        End If
        Dim existing = _lines.FirstOrDefault(Function(l) l.ProductId = Js.Int(p, "id") AndAlso Nullable.Equals(l.SizeId, If(size Is Nothing, CType(Nothing, Integer?), Js.Int(size, "id"))))
        If existing IsNot Nothing Then
            If existing.Stock.HasValue AndAlso existing.Qty + 1 > existing.Stock.Value Then Toast("Only " & existing.Stock.Value & " in stock.", True) : Return
            existing.Qty += 1
        Else
            Dim line As New CartLine With {.Product = p, .Size = size}
            line.UnitPrice = If(size IsNot Nothing, CartLine.SizePrice(size), CartLine.ShelfPrice(p))
            If line.Stock.HasValue AndAlso line.Stock.Value <= 0 Then Toast("'" & line.Name & "' is out of stock.", True) : Return
            _lines.Add(line)
        End If
        _scan.Text = ""
        _results.Visible = False
        RefreshCart()
        _scan.Box.Focus()
    End Sub

    Private Function PickSize(p As JsonObject, sizes As List(Of JsonObject)) As JsonObject
        Using f As New Form With {.Text = Js.Str(p, "name") & " — choose a size", .StartPosition = FormStartPosition.CenterParent, .ClientSize = New Size(380, 300), .FormBorderStyle = FormBorderStyle.FixedDialog, .MinimizeBox = False, .MaximizeBox = False, .Font = Theme.Body, .BackColor = Color.White}
            Dim lb As New ListBox With {.Dock = DockStyle.Fill, .Font = Theme.UiFont(10.5F), .ItemHeight = 30, .BorderStyle = BorderStyle.None, .IntegralHeight = False}
            For Each z In sizes
                lb.Items.Add(Js.Str(z, "label") & "   —   " & Theme.Money(CartLine.SizePrice(z)) & If(Js.IsNull(z, "stock"), "", "   (stock " & Js.Int(z, "stock") & ")"))
            Next
            lb.SelectedIndex = Math.Max(0, sizes.FindIndex(Function(z) Js.Bool(z, "isDefault")))
            Dim chosen As JsonObject = Nothing
            AddHandler lb.DoubleClick, Sub()
                                           chosen = sizes(lb.SelectedIndex) : f.Close()
                                       End Sub
            AddHandler lb.KeyDown, Sub(s, e)
                                       If e.KeyCode = Keys.Enter Then chosen = sizes(lb.SelectedIndex) : f.Close()
                                       If e.KeyCode = Keys.Escape Then f.Close()
                                   End Sub
            f.Controls.Add(lb)
            f.ShowDialog(Me)
            Return chosen
        End Using
    End Function

    Private Sub RefreshCart()
        _grid.SuspendLayout()
        _grid.Rows.Clear()
        For Each l In _lines
            _grid.Rows.Add(l.Name, l.UnitPrice.ToString("0.00"), Nothing, l.Qty.ToString(), Nothing, l.Unit, Theme.Money(l.Total), Nothing)
        Next
        _grid.ResumeLayout()
        _cartHead.Text = "Cart (" & _lines.Count & " item" & If(_lines.Count = 1, "", "s") & ")"
        _cartHead.Invalidate()
        If Not _paysEdited AndAlso _pays.Count = 1 Then _pays(0).Amount.Text = If(GrandTotal > 0, GrandTotal.ToString("0.00"), "")
        UpdateTotals()
    End Sub

    Private Sub GridClick(sender As Object, e As DataGridViewCellEventArgs)
        If e.RowIndex < 0 OrElse e.RowIndex >= _lines.Count Then Return
        Dim l = _lines(e.RowIndex)
        Select Case _grid.Columns(e.ColumnIndex).Name
            Case "minus"
                If l.Qty > 1 Then l.Qty -= 1 Else _lines.Remove(l)
            Case "plus"
                If l.Stock.HasValue AndAlso l.Qty + 1 > l.Stock.Value Then Toast("Only " & l.Stock.Value & " in stock.", True) : Return
                l.Qty += 1
            Case "remove"
                _lines.Remove(l)
            Case Else
                Return
        End Select
        RefreshCart()
    End Sub

    Private Sub GridEdited(sender As Object, e As DataGridViewCellEventArgs)
        If e.RowIndex < 0 OrElse e.RowIndex >= _lines.Count Then Return
        Dim l = _lines(e.RowIndex)
        Dim v = CStr(_grid.Rows(e.RowIndex).Cells(e.ColumnIndex).Value)
        Select Case _grid.Columns(e.ColumnIndex).Name
            Case "price"
                Dim d = ParseAmount(v)
                If d >= 0 Then l.UnitPrice = d : l.Overridden = True
            Case "qty"
                Dim q As Integer
                If Integer.TryParse(v, q) AndAlso q > 0 Then
                    If l.Stock.HasValue AndAlso q > l.Stock.Value Then Toast("Only " & l.Stock.Value & " in stock.", True) : q = l.Stock.Value
                    l.Qty = q
                End If
        End Select
        BeginInvoke(Sub() RefreshCart())
    End Sub

    ' ───────── coupon ─────────
    Private Sub ApplyCoupon()
        Dim code = _couponIn.Text.Trim()
        If code = "" Then _coupon = Nothing : _couponNote.Text = "" : UpdateTotals() : Return
        Dim c = AppState.I.List("coupons").FirstOrDefault(Function(x) String.Equals(Js.Str(x, "code"), code, StringComparison.OrdinalIgnoreCase))
        Dim now = DateTime.Now
        If c Is Nothing Then
            _couponNote.Text = "This coupon code is not valid." : _couponNote.ForeColor = Theme.Danger : _coupon = Nothing
        ElseIf (Js.Time(c, "startsAt").HasValue AndAlso Js.Time(c, "startsAt").Value > now) OrElse (Js.Time(c, "endsAt").HasValue AndAlso Js.Time(c, "endsAt").Value < now) Then
            _couponNote.Text = "This coupon is not running now." : _couponNote.ForeColor = Theme.Danger : _coupon = Nothing
        ElseIf Js.Int(c, "usedCount") >= Js.Int(c, "numberOfTimes") AndAlso Js.Int(c, "numberOfTimes") > 0 Then
            _couponNote.Text = "This coupon has been used up." : _couponNote.ForeColor = Theme.Danger : _coupon = Nothing
        Else
            _coupon = c
            _couponNote.Text = "Coupon applied: " & Js.Str(c, "title") : _couponNote.ForeColor = Theme.Green
        End If
        RefreshCart()
    End Sub

    ' ───────── customer ─────────
    Private Sub FillCustomers()
        Dim src As New AutoCompleteStringCollection()
        For Each c In AppState.I.List("customers")
            Dim ph = Js.Str(c, "phone")
            If ph <> "" Then src.Add(ph)
        Next
        _phone.Box.AutoCompleteCustomSource = src
    End Sub

    Private Sub PhoneTyped()
        Dim ph = _phone.Text.Trim()
        _customer = If(ph.Length >= 10, AppState.I.List("customers").FirstOrDefault(Function(c) Js.Str(c, "phone") = ph), Nothing)
        If _customer IsNot Nothing Then _name.Text = Js.Str(_customer, "name")
        Dim due = If(_customer Is Nothing, 0, Js.Num(_customer, "due"))
        _prevDue.Text = If(due > 0, "Previous due: " & Theme.Money(due), "")
    End Sub

    ' ───────── payments ─────────
    Private Sub AddPayRow(method As String, amount As String)
        Dim m = Ui.Combo({"Cash", "UPI", "Card", "Other"}, 100)
        m.SelectedItem = method
        Dim a = WInput.Make("0.00", ChrW(&H20B9))
        a.Text = amount
        Dim r = WButton.Make("", Theme.IcDelete, Theme.Danger, outline:=True)
        r.Width = 36
        Dim row = (m, a, r)
        AddHandler a.Box.TextChanged, Sub()
                                          If a.Box.Focused Then _paysEdited = True
                                          UpdateTotals()
                                      End Sub
        AddHandler r.Click, Sub()
                                If _pays.Count <= 1 Then Return
                                _summary.Controls.Remove(m) : _summary.Controls.Remove(a) : _summary.Controls.Remove(r)
                                _pays.Remove(row)
                                Relayout()
                            End Sub
        _pays.Add(row)
        _summary.Controls.AddRange(New Control() {m, a, r})
    End Sub

    Private Sub UpdateTotals()
        _totals.Subtotal = Subtotal : _totals.Discount = Discount : _totals.Gst = Gst : _totals.Total = GrandTotal : _totals.TaxIncluded = TaxIncluded
        _totals.Invalidate()
        _summary.Total = GrandTotal : _summary.Paid = Paid : _summary.Items = _lines.Count
        _summary.Invalidate()
        Dim due = GrandTotal - Paid
        _promised.Visible = due > 0.004 AndAlso Not _guest.Checked
        _payNow.Enabled = _lines.Count > 0 AndAlso Not _busy
    End Sub

    Private Sub NewBill()
        _lines.Clear()
        _coupon = Nothing : _couponIn.Text = "" : _couponNote.Text = ""
        _customer = Nothing : _phone.Text = "" : _name.Text = "" : _prevDue.Text = ""
        _guest.Checked = False
        _promised.Checked = False
        For Each p In _pays.Skip(1).ToList()
            _summary.Controls.Remove(p.Method) : _summary.Controls.Remove(p.Amount) : _summary.Controls.Remove(p.Remove)
            _pays.Remove(p)
        Next
        _pays(0).Method.SelectedItem = "Cash"
        _paysEdited = False
        RefreshCart()
        Relayout()
        _scan.Box.Focus()
    End Sub

    ' ───────── Pay Now ─────────
    Private Async Function CompleteAsync() As Task
        If _busy OrElse _lines.Count = 0 Then Return
        Dim total = GrandTotal, paidNow = Paid
        Dim due = Math.Round(total - paidNow, 2)
        If _guest.Checked AndAlso due > 0.004 Then Toast("Guest bills must be paid in full. Turn off Guest to record a due.", True) : Return
        If Not _guest.Checked AndAlso due > 0.004 AndAlso _customer Is Nothing AndAlso _name.Text.Trim() = "" Then Toast("This bill has a due amount — choose a customer or enter a name.", True) : Return
        _busy = True : _payNow.Enabled = False : _payNow.Text = "Saving…" : _payNow.Invalidate()
        Try
            Dim ref = "win-" & Js.NewId()
            Dim soldAt = DateTime.UtcNow
            Dim pays As New JsonArray()
            For Each p In _pays
                Dim a = ParseAmount(p.Amount.Text)
                If a > 0 Then pays.Add(New JsonObject From {{"method", CStr(p.Method.SelectedItem)}, {"amount", a}})
            Next
            Dim items As New JsonArray()
            For Each l In _lines
                items.Add(New JsonObject From {{"product_id", l.ProductId}, {"qty", l.Qty}, {"price_override", l.UnitPrice}, {"unit", l.Unit}, {"size_id", If(l.SizeId.HasValue, JsonValue.Create(l.SizeId.Value), Nothing)}})
            Next
            Dim customerName = If(_guest.Checked, "", _name.Text.Trim())
            Dim body As New JsonObject From {
                {"items", items}, {"customer_id", If(_guest.Checked OrElse _customer Is Nothing, 0, Js.Int(_customer, "id"))}, {"customer_name", customerName},
                {"customer_phone", If(_guest.Checked, "", _phone.Text.Trim())}, {"is_guest", _guest.Checked}, {"payments", pays},
                {"promised_date", If(_promised.Visible AndAlso _promised.Checked, _promised.Value.ToString("yyyy-MM-dd"), Nothing)},
                {"coupon_code", If(_coupon Is Nothing, "", Js.Str(_coupon, "code"))}, {"client_ref", ref},
                {"offline", True}, {"sold_at", soldAt.ToString("o")}, {"offline_discount", Discount}}
            Dim item As New OutboxItem With {.Id = ref, .Method = "POST", .Path = "/api/ecommerce/billing/checkout", .Label = "Bill · " & Theme.Money(total) & " · " & If(customerName = "", "Walk-in Customer", customerName), .Body = body}
            Dim receiptLines = _lines.Select(Function(l) (l.Name, l.Qty, l.UnitPrice, l.Unit)).ToList()
            Dim sub_ = Subtotal, disc = Discount, gst_ = Gst
            Dim r = Await AppState.I.SendNowAsync(item)
            If r.IsOk OrElse r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
                ' Stock and the bill show at once (the server confirms the same when the bill reaches it).
                For Each l In _lines : AppState.I.TakeStock(l.ProductId, l.SizeId, l.Qty) : Next
                Dim number = If(r.IsOk, Js.Str(r.Data, "order_number"), "Offline")
                If Not r.IsOk Then
                    Dim its As New JsonArray()
                    For Each l In _lines : its.Add(New JsonObject From {{"productId", l.ProductId}, {"name", l.Name}, {"qty", l.Qty}, {"price", l.UnitPrice}, {"gstRate", l.GstRate}}) : Next
                    AppState.I.AddLocal("orders", New JsonObject From {{"id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}, {"localRef", ref}, {"number", "Offline"}, {"type", "offline"}, {"status", "Delivered"},
                        {"paymentStatus", If(due > 0.004, "Unpaid", "Paid")}, {"customer", If(customerName = "", "Walk-in Customer", customerName)}, {"total", total}, {"due", Math.Max(0, due)}, {"createdAt", soldAt.ToString("o")}, {"items", its}})
                End If
                If _print.Checked Then PrintReceipt(number, receiptLines, sub_, disc, gst_, total, paidNow, If(customerName = "", "Walk-in Customer", customerName), pays, If(_guest.Checked, "", _phone.Text.Trim()))
                Toast(If(r.IsOk, "Bill " & number & " saved.", "Bill saved on this computer — it goes to the server when the internet is back."))
                NewBill()
            Else
                Toast(r.Message, True)
            End If
        Finally
            _busy = False : _payNow.Text = "Pay Now" : UpdateTotals() : _payNow.Invalidate()
        End Try
    End Function

    ''' <summary>The receipt on this computer's bill paper and printer (My Profile → Printing).</summary>
    Private Sub PrintReceipt(number As String, lines As List(Of (Name As String, Qty As Integer, Price As Double, Unit As String)), sub_ As Double, disc As Double, gst_ As Double, total As Double, paid As Double, customer As String, pays As JsonArray, phone As String)
        Dim r As New ReceiptData With {.Number = number, .At = DateTime.Now, .Customer = customer, .Phone = phone, .Subtotal = sub_, .Discount = disc, .Gst = gst_, .Total = total, .Due = Math.Max(0, Math.Round(total - paid, 2)), .Offline = number = "Offline"}
        For Each l In lines : r.Lines.Add((l.Name, CDbl(l.Qty), l.Price, l.Unit)) : Next
        For Each p In Js.Objs(pays) : r.Payments.Add((Js.Str(p, "method"), Js.Num(p, "amount"))) : Next
        Dim preview = False
        Dim size = PrintPrefs.Choose(Me, "Print bill " & number, preview)
        If size Is Nothing Then Return
        Receipts.Print(r, size, Me, preview)
    End Sub

    ' ───────── layout ─────────
    Private Sub PaintBox(sender As Object, e As PaintEventArgs)
        Dim c = CType(sender, Control)
        Theme.Smooth(e.Graphics)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, c.Width - 1.5F, c.Height - 1.5F), 10)
            Using b As New SolidBrush(Theme.G50) : e.Graphics.FillPath(b, p) : End Using
        End Using
        TextRenderer.DrawText(e.Graphics, "Coupon Code", Theme.BodyBold, New Point(14, 12), Theme.G900, TextFormatFlags.NoPadding)
    End Sub

    Private Sub Relayout()
        If Width < 200 Then Return
        SuspendLayout()
        Const pad As Integer = 16
        Dim sw = 360
        _summary.SetBounds(Width - sw - pad, pad, sw, Height - pad * 2)
        _left.SetBounds(pad, pad, Width - sw - pad * 3, Height - pad * 2)
        Dim lw = _left.Width
        _scan.SetBounds(0, 0, lw, 46)
        Dim y = 56
        If _results.Visible Then
            _results.SetBounds(0, 50, lw, Math.Min(_found.Count, 6) * 44 + 2)
            _results.BringToFront()
        End If
        _cartCard.SetBounds(0, y, lw, _left.Height - y)
        Dim cw = _cartCard.Width
        _cartHead.SetBounds(18, 14, cw - 200, 34)
        _clear.SetBounds(cw - 18 - _clear.Width, 12, _clear.Width, 36)
        Dim showFooter = _display.IsOn("b2-footer")
        Dim footerH = If(showFooter, 150, 0)
        _grid.SetBounds(18, 56, cw - 36, _cartCard.Height - 56 - 18 - footerH)
        For Each col In {("price", "b2-col-price"), ("qty", "b2-col-qty"), ("minus", "b2-col-qty"), ("plus", "b2-col-qty"), ("unit", "b2-col-unit"), ("subtotal", "b2-col-subtotal")}
            _grid.Columns(col.Item1).Visible = _display.IsOn("b2-cart", col.Item2)
        Next
        _grid.Visible = _display.IsOn("b2-cart")
        Dim fy = _cartCard.Height - 18 - footerH + 12
        Dim half = (cw - 36 - 14) \ 2
        Dim showCoupon = showFooter AndAlso _display.IsOn("b2-footer", "b2-coupon"), showTotals = showFooter AndAlso _display.IsOn("b2-footer", "b2-totals")
        _couponBox.Visible = showCoupon : _totals.Visible = showTotals
        _couponBox.SetBounds(18, fy, If(showTotals, half, cw - 36), footerH - 12)
        _couponIn.SetBounds(14, 40, _couponBox.Width - 110, 38)
        _couponBtn.SetBounds(_couponBox.Width - 88, 40, 74, 38)
        _couponNote.SetBounds(14, 86, _couponBox.Width - 28, 36)
        _totals.SetBounds(If(showCoupon, 18 + half + 14, 18), fy, If(showCoupon, half, cw - 36), footerH - 12)

        ' summary column controls (inside the white box drawn by SummaryPanel)
        Dim ix = 26, iw = sw - 52
        y = _summary.WhiteTop + 44
        Dim showCust = _display.IsOn("b2-checkout", "b2-customer") AndAlso _display.IsOn("b2-checkout")
        _guest.Visible = showCust
        _guest.Location = New Point(sw - 26 - _guest.PreferredSize.Width, _summary.WhiteTop + 14)
        _summary.ShowCustomer = showCust
        Dim showFields = showCust AndAlso Not _guest.Checked
        _phone.Visible = showFields : _name.Visible = showFields : _prevDue.Visible = showFields
        If showFields Then
            _phone.SetBounds(ix, y, (iw - 8) \ 2, 38)
            _name.SetBounds(ix + (iw - 8) \ 2 + 8, y, (iw - 8) \ 2, 38)
            y += 46
            _prevDue.Location = New Point(ix, y)
            If _prevDue.Text <> "" Then y += 22
        End If
        If showCust Then y += 10
        _summary.PaymentTop = y
        y += 38
        Dim showPays = _display.IsOn("b2-checkout", "b2-payments") AndAlso _display.IsOn("b2-checkout")
        _summary.ShowPayments = showPays
        _addPay.Visible = showPays
        _addPay.SetBounds(sw - 26 - 76, _summary.PaymentTop - 2, 76, 32)
        For Each p In _pays
            p.Method.Visible = showPays : p.Amount.Visible = showPays : p.Remove.Visible = showPays
            If Not showPays Then Continue For
            p.Method.SetBounds(ix, y + 6, 100, 28)
            p.Amount.SetBounds(ix + 108, y, iw - 108 - 44, 38)
            p.Remove.SetBounds(ix + iw - 36, y + 1, 36, 36)
            y += 46
        Next
        _promised.SetBounds(ix, y, iw, 30)
        If _promised.Visible Then y += 40
        y += 6
        _payNow.SetBounds(ix, y, iw, 50)
        y += 60
        _print.Location = New Point(ix, y)
        _keysNote.Visible = _display.IsOn("b2-checkout", "b2-secure-note") AndAlso _display.IsOn("b2-checkout")
        _keysNote.SetBounds(ix + 120, y, iw - 120, 22)
        _summary.WhiteBottom = y + 36
        _summary.Invalidate()
        UpdateTotals()
        ResumeLayout()
    End Sub
End Class

''' <summary>Subtotal / Discount / GST / Total box under the cart.</summary>
Public Class TotalsBox
    Inherits Control
    Public Subtotal, Discount, Gst, Total As Double
    Public TaxIncluded As Boolean
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), 10)
            Using b As New SolidBrush(Theme.G50) : g.FillPath(b, p) : End Using
        End Using
        Dim y = 14
        For Each r In {("Subtotal", Theme.Money(Subtotal), Theme.G900), ("Discount", "-" & Theme.Money(Discount), Theme.Danger), (If(TaxIncluded, "GST (incl.)", "GST"), If(TaxIncluded, "", "+") & Theme.Money(Gst), Theme.G900)}
            TextRenderer.DrawText(g, r.Item1, Theme.Body, New Point(16, y), Theme.G700, TextFormatFlags.NoPadding)
            TextRenderer.DrawText(g, r.Item2, Theme.Body, New Rectangle(16, y, Width - 32, 20), r.Item3, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
            y += 24
        Next
        Using pen As New Pen(Theme.G200) : g.DrawLine(pen, 16, y + 2, Width - 16, y + 2) : End Using
        TextRenderer.DrawText(g, "Total", Theme.UiFont(11.0F, FontStyle.Bold), New Point(16, y + 10), Theme.G900, TextFormatFlags.NoPadding)
        TextRenderer.DrawText(g, Theme.Money(Total), Theme.UiFont(13.0F, FontStyle.Bold), New Rectangle(16, y + 8, Width - 32, 26), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>The coral "Payment Summary" column: heading, total / received / change or due, and a white box
''' behind the customer and payment controls.</summary>
Public Class SummaryPanel
    Inherits Panel
    Public Total, Paid As Double
    Public Items As Integer
    Public ShowCustomer As Boolean = True, ShowPayments As Boolean = True
    Public PaymentTop As Integer = 300
    Public WhiteBottom As Integer = 600
    Public ReadOnly Property WhiteTop As Integer
        Get
            Return 170
        End Get
    End Property
    Public Sub New()
        DoubleBuffered = True
        ResizeRedraw = True
        BackColor = Color.White
    End Sub
    Protected Overrides Sub OnPaintBackground(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Page)
        Theme.Smooth(g)
        Dim h = Math.Min(Height - 1, WhiteBottom + 12)
        Using p = Theme.RoundRect(New RectangleF(0, 0, Width - 1, h), 12)
            Using b As New LinearGradientBrush(New Rectangle(0, 0, Width, h), Theme.CoralLight, Theme.Coral, 60.0F)
                g.FillPath(b, p)
            End Using
        End Using
        Using f = Theme.IconFont(11) : TextRenderer.DrawText(g, Theme.IcCard, f, New Rectangle(18, 12, 22, 28), Color.White, TextFormatFlags.VerticalCenter) : End Using
        TextRenderer.DrawText(g, "Payment Summary", Theme.UiFont(10.5F, FontStyle.Bold), New Point(44, 17), Color.White, TextFormatFlags.NoPadding)
        Dim chip = Items & " items"
        Dim cw = TextRenderer.MeasureText(chip, Theme.Small).Width + 14
        Using p = Theme.RoundRect(New RectangleF(Width - cw - 16, 15, cw, 22), 6)
            Using b As New SolidBrush(Color.FromArgb(64, Color.White)) : g.FillPath(b, p) : End Using
        End Using
        TextRenderer.DrawText(g, chip, Theme.UiFont(8.5F, FontStyle.Bold), New Rectangle(Width - cw - 16, 15, cw, 22), Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
        ' totals box
        Using p = Theme.RoundRect(New RectangleF(12, 50, Width - 24, 108), 8)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
        End Using
        TextRenderer.DrawText(g, "Total Amount", Theme.Body, New Point(26, 66), Theme.G700, TextFormatFlags.NoPadding)
        TextRenderer.DrawText(g, Theme.Money(Total), Theme.UiFont(15.0F, FontStyle.Bold), New Rectangle(26, 58, Width - 52, 32), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.VerticalCenter)
        Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 26, 98, Width - 26, 98) : End Using
        TextRenderer.DrawText(g, "Amount Received", Theme.Body, New Point(26, 108), Theme.G700, TextFormatFlags.NoPadding)
        TextRenderer.DrawText(g, Theme.Money(Paid), Theme.BodyBold, New Rectangle(26, 106, Width - 52, 20), Theme.G900, TextFormatFlags.Right)
        Dim diff = Paid - Total
        If Math.Abs(diff) > 0.004 AndAlso Total > 0 Then
            Dim txt = If(diff > 0, "Return change", "Due (on credit)")
            Dim c = If(diff > 0, Theme.Green, Theme.Danger)
            TextRenderer.DrawText(g, txt, Theme.Body, New Point(26, 132), c, TextFormatFlags.NoPadding)
            TextRenderer.DrawText(g, Theme.Money(Math.Abs(diff)), Theme.BodyBold, New Rectangle(26, 130, Width - 52, 20), c, TextFormatFlags.Right)
        End If
        ' white box for customer + payment
        Using p = Theme.RoundRect(New RectangleF(12, WhiteTop, Width - 24, h - WhiteTop - 12), 8)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
        End Using
        If ShowCustomer Then
            Using f = Theme.IconFont(10) : TextRenderer.DrawText(g, Theme.IcUser, f, New Rectangle(24, WhiteTop + 10, 20, 24), Theme.Coral, TextFormatFlags.VerticalCenter) : End Using
            TextRenderer.DrawText(g, "Customer", Theme.BodyBold, New Point(48, WhiteTop + 14), Theme.G900, TextFormatFlags.NoPadding)
        End If
        If ShowPayments Then
            Using f = Theme.IconFont(10) : TextRenderer.DrawText(g, Theme.IcMoney, f, New Rectangle(24, PaymentTop, 20, 28), Theme.Coral, TextFormatFlags.VerticalCenter) : End Using
            TextRenderer.DrawText(g, "Payment", Theme.BodyBold, New Point(48, PaymentTop + 5), Theme.G900, TextFormatFlags.NoPadding)
        End If
    End Sub
End Class
