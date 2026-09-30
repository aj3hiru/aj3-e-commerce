Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>A customer's profile as on the website: header (photo, name, Store / Online, status, phone · email ·
''' since, login methods, address, Edit / New order, Call / WhatsApp), five numbers, and the Orders (Collect +
''' receipts ×N), Addresses and Due history tabs. All from this computer.</summary>
Public Class CustomerProfilePage
    Inherits ScrollPage

    Private ReadOnly _id As Integer
    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_customer_profile_display")
    Private _tab As String = "orders"
    Private _c As JsonObject

    Public Overrides ReadOnly Property PageTitle As String
        Get
            Dim n = Js.Str(_c, "name").Trim()
            Return If(n = "", "New customer (no name yet)", n)
        End Get
    End Property
    Public Overrides ReadOnly Property PageSubtitle As String = "Customer profile, orders, addresses and due"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New(customerId As Integer)
        _id = customerId
        AddHandler _display.Changed, Sub() Refresh_()
    End Sub

    Private Function CreditsOf() As List(Of JsonObject)
        Dim s = AppState.I
        Return s.List("dues").Where(Function(d) Js.Int(d, "customerId") = _id).Concat(s.PageList("dues_paid").Where(Function(d) Js.Int(d, "customerId") = _id)).ToList()
    End Function

    Private Function OrdersOf() As List(Of JsonObject)
        Dim s = AppState.I
        Dim recent = s.List("orders").Where(Function(o) Js.Int(o, "customerId") = _id).ToList()
        Dim ids = recent.Select(Function(o) Js.Int(o, "id")).ToHashSet()
        Dim older = s.PageList("customer_orders").Where(Function(o) Js.Int(o, "customerId") = _id AndAlso Not ids.Contains(Js.Int(o, "id")))
        Return recent.Concat(older).OrderByDescending(Function(o) Js.Str(o, "createdAt")).ToList()
    End Function

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        _c = s.List("customers").FirstOrDefault(Function(x) Js.Int(x, "id") = _id)
        HeaderChanged()
        Body.SuspendLayout()
        For Each old As Control In Body.Controls.Cast(Of Control)().ToList()
            Body.Controls.Remove(old)
            old.Dispose()
        Next
        If _c Is Nothing Then
            Body.Add(New CardBox()).Add(New TextBlock("Customer not found on this computer. Press F5 to sync.", Theme.Body, Theme.G500))
            Body.ResumeLayout()
            Return
        End If
        Dim c = _c
        Dim orders = OrdersOf()
        Dim credits = CreditsOf()
        Dim addresses = s.PageList("addresses").Where(Function(a) Js.Int(a, "customerId") = _id).ToList()
        Dim sales = orders.Where(Function(o) Js.Str(o, "status") <> "Canceled").ToList()
        Dim spent = sales.Sum(Function(o) Js.Num(o, "total"))
        Dim totalDue = credits.Sum(Function(d) Js.Num(d, "balance"))
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)

        If _display.IsOn("cp-header") Then Body.Add(BuildHeader(c))

        ' numbers
        Dim stats As New Columns(5, 160, 12)
        Dim addStat = Sub(key As String, caption As String, glyph As String, colour As Color, value As String)
                          If Not on_("cp-stats", key) Then Return
                          Dim m As New MiniStat(caption, glyph, colour) With {.Height = 84}
                          m.SetValue(value)
                          stats.Add(m)
                      End Sub
        addStat("cp-k-orders", "Orders", Theme.IcShop, Theme.Blue, orders.Count.ToString())
        addStat("cp-k-spent", "Total spent", Theme.IcMoney, Color.FromArgb(5, &H96, &H69), Theme.Money(spent))
        addStat("cp-k-avg", "Average order", ChrW(&HE9D2), Theme.Primary, Theme.Money(If(sales.Count = 0, 0, spent / sales.Count)))
        addStat("cp-k-due", "Due", ChrW(&HE8C7), Theme.Danger, If(totalDue > 0.004, Theme.Money(totalDue), "None"))
        addStat("cp-k-last", "Last order", Theme.IcCalendar, Color.FromArgb(&HD9, &H77, 6), If(orders.Count = 0, "Never", Fmt.Day(Js.Time(orders(0), "createdAt"))))
        If stats.Controls.Count > 0 Then stats.Count = stats.Controls.Count : Body.Add(stats)

        ' tabs
        Dim tabItems As New List(Of String)
        If on_("cp-tabs", "cp-t-orders") Then tabItems.Add("orders|Orders (" & orders.Count & ")")
        If on_("cp-tabs", "cp-t-addresses") Then tabItems.Add("addresses|Addresses (" & addresses.Count & ")")
        If on_("cp-tabs", "cp-t-due") Then tabItems.Add("due|Due history (" & credits.Count & ")")
        If tabItems.Count > 0 Then
            If Not tabItems.Any(Function(t) t.StartsWith(_tab & "|")) Then _tab = tabItems(0).Split("|"c)(0)
            Dim card As New CardBox(Nothing, "", 14)
            Dim tabs As New Tabs(tabItems.ToArray()) With {.Current = _tab}
            AddHandler tabs.Changed, Sub()
                                         _tab = tabs.Current
                                         Refresh_()
                                     End Sub
            card.Add(tabs)
            Select Case _tab
                Case "orders" : card.Add(Of Control)(OrdersTable(orders, credits))
                Case "addresses" : card.Add(Of Control)(AddressesGrid(addresses))
                Case "due" : card.Add(Of Control)(DueTable(credits))
            End Select
            Body.Add(card)
        End If
        Body.ResumeLayout()
    End Sub

    Private Function CanCollect() As Boolean
        Dim p = AppState.I.Perm
        Return p.Has("ecommerce", "manage_credits") OrElse p.Has("ecommerce", "manage_billing") OrElse p.Has("ecommerce", "manage_customers")
    End Function

    ' ───────── header ─────────
    Private Function BuildHeader(c As JsonObject) As Control
        Dim on_ = Function(k As String) _display.IsOn("cp-header", k)
        Dim online = Js.Str(c, "type") = "online"
        Dim phone = Js.Str(c, "phone")
        Dim card As New Card With {.Padding = New Padding(0)}
        Dim buttons As New HRow(8) With {.RightAlign = True}
        If on_("cp-h-actions") Then
            If AppState.I.Perm.Has("ecommerce", "manage_customers") Then buttons.Add(Ui.Btn("Edit profile", ChrW(&HE70F), Theme.Blue, click:=Sub() CustomerActions.Edit(Me, _c)))
            If AppState.I.Perm.Billing() Then buttons.Add(Ui.Btn("New order", Theme.IcCart, outline:=True, click:=Sub() NewOrder()))
        End If
        If on_("cp-h-call") AndAlso phone <> "" Then
            buttons.Add(Ui.IconBtn(Theme.IcPhone, "Call " & phone, Sub() Ui.OpenUrl("tel:" & phone)))
            buttons.Add(Ui.IconBtn(ChrW(&HE8BD), "WhatsApp", Sub() Ui.OpenUrl(Ui.WhatsApp(phone)), Theme.Green))
        End If
        Dim statusRect As Rectangle
        Dim avatar = Img.Get(Js.Str(c, "avatar"), 180, Sub() card.Invalidate(True))
        Dim info As New Drawn(160, Sub(g, r)
                                       Dim y = 72
                                       Dim name = If(Js.Str(c, "name").Trim() = "", "New customer (no name yet)", Js.Str(c, "name"))
                                       Dim nf = Theme.UiFont(14.0F, FontStyle.Bold)
                                       TextRenderer.DrawText(g, name, nf, New Point(128, y), Theme.G900, TextFormatFlags.NoPadding)
                                       Dim x = 128 + TextRenderer.MeasureText(name, nf).Width + 10
                                       If online Then
                                           x = Gfx.Badge(g, "Online", x, y + 13, Color.White, Theme.Blue).Right + 8
                                       Else
                                           x = Gfx.Badge(g, "Store", x, y + 13, Theme.G900, Color.FromArgb(&HFB, &HBF, &H24)).Right + 8
                                       End If
                                       Dim active = Js.Str(c, "status") = "active"
                                       statusRect = Gfx.Pill(g, If(active, "Active", "Inactive"), x, y + 13, If(active, Theme.Green, Theme.Grey), AppState.I.Perm.Has("ecommerce", "manage_customers"))
                                       y += 34
                                       If on_("cp-h-contact") Then
                                           Dim parts As New List(Of String)
                                           If phone <> "" Then parts.Add("☎ " & phone)
                                           If Js.Str(c, "email") <> "" Then parts.Add("✉ " & Js.Str(c, "email"))
                                           parts.Add("Customer since " & Fmt.Day(Js.Time(c, "since")))
                                           TextRenderer.DrawText(g, String.Join("     ", parts), Theme.Body, New Rectangle(128, y, r.Width - 128, 20), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                           y += 24
                                       End If
                                       If on_("cp-h-login") AndAlso online Then
                                           Dim bx = 128
                                           If phone <> "" Then bx = Gfx.Badge(g, "Mobile OTP login", bx, y + 10, Color.FromArgb(4, &H78, &H57), Color.FromArgb(&HEC, &HFD, &HF5)).Right + 6
                                           If Js.Bool(c, "hasPassword") Then Gfx.Badge(g, "Password login", bx, y + 10, Color.FromArgb(3, &H69, &HA1), Color.FromArgb(&HF0, &HF9, &HFF))
                                           y += 24
                                       End If
                                       If _display.Item("cp-address") AndAlso Js.Str(c, "address").Trim() <> "" Then
                                           TextRenderer.DrawText(g, "⌖ " & Js.Str(c, "address"), Theme.Body, New Rectangle(128, y, r.Width - 128, 20), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                       End If
                                   End Sub)
        AddHandler info.MouseClick, Sub(s, e)
                                        If statusRect.Contains(e.Location) Then CustomerActions.StatusMenu(_c, info.PointToScreen(New Point(statusRect.X, statusRect.Bottom + 2)), Me)
                                    End Sub
        AddHandler info.MouseMove, Sub(s, e) info.Cursor = If(statusRect.Contains(e.Location), Cursors.Hand, Cursors.Default)
        card.Controls.Add(buttons)
        card.Controls.Add(info)
        AddHandler card.Paint, Sub(s, e)
                                   Dim g = e.Graphics
                                   Theme.Smooth(g)
                                   Using path = Theme.RoundRect(New RectangleF(1, 1, card.Width - 3, 64), 9)
                                       Using b As New LinearGradientBrush(New Rectangle(0, 0, card.Width, 64), Color.FromArgb(&HED, &HE9, &HFE), Color.FromArgb(&HFC, &HE7, &HF3), LinearGradientMode.Horizontal)
                                           g.FillPath(b, path)
                                       End Using
                                   End Using
                                   Using b As New SolidBrush(Color.White) : g.FillRectangle(b, 1, 50, card.Width - 3, 16) : End Using
                                   Dim ar As New Rectangle(20, 30, 92, 92)
                                   Using b As New SolidBrush(Color.White) : g.FillEllipse(b, ar) : End Using
                                   Gfx.Avatar(g, New Rectangle(24, 34, 84, 84), Js.Str(c, "name"), avatar)
                               End Sub
        AddHandler card.Layout, Sub()
                                    Dim bw = buttons.Controls.Cast(Of Control)().Sum(Function(x) x.Width + 8)
                                    buttons.SetBounds(card.Width - 20 - bw, 84, bw, 40)
                                    info.SetBounds(0, 0, card.Width - bw - 30, 170)
                                End Sub
        card.Height = 176
        info.BringToFront()
        buttons.BringToFront()
        Return card
    End Function

    Private Sub NewOrder()
        Dim m = Main
        If m Is Nothing Then Return
        BillingPage.Pending = _id
        m.Pick("/admin/ecommerce/billing")
    End Sub

    ' ───────── tabs ─────────
    Private Function ReceiptsOf(o As JsonObject, credits As List(Of JsonObject)) As List(Of JsonObject)
        Dim l As New List(Of JsonObject)
        For Each p In Js.Objs(Js.Arr(o, "pays"))
            l.Add(Js.Obj("receipt", "Bill " & Js.Str(o, "number"), "amount", Js.Num(p, "amount"), "method", Js.Str(p, "method") & " · paid with the bill", "at", Js.Field(p, "at"), "orderId", Js.Int(o, "id")))
        Next
        For Each d In credits.Where(Function(x) Js.Int(x, "orderId") = Js.Int(o, "id"))
            For Each p In Js.Objs(Js.Arr(d, "payments"))
                l.Add(Js.Obj("receipt", Js.Str(p, "receipt", "Pending"), "amount", Js.Num(p, "amount"), "method", Js.Str(p, "method") & " · due payment", "at", Js.Field(p, "at")))
            Next
        Next
        Return l
    End Function

    Private Sub ShowReceipts(number As String, list As List(Of JsonObject))
        Dim f As New FormDialog("Receipts — " & number, 560, "Close")
        f.CancelButton_.Visible = False
        Dim t As New WebTable() With {.RowHeight = 50}
        t.Cols.Add(New TCol("#", Function(r) (list.IndexOf(r) + 1) & "×", 50))
        t.Cols.Add(New TCol("Receipt", Function(r) Js.Str(r, "receipt"), 0, CellKind.Link) With {.Flex = 3, .Colour = Function(r) Theme.Blue,
            .Sub = Function(r) If(Js.Time(r, "at").HasValue, Fmt.Stamp(Js.Time(r, "at")) & " · ", "") & Js.Str(r, "method")})
        t.Cols.Add(New TCol("Amount", Function(r) Theme.Money(Js.Num(r, "amount")), 130, CellKind.Money) With {.Right = True, .Colour = Function(r) Theme.Green})
        t.Rows = list
        t.RowClickable = True
        AddHandler t.RowClick, Sub(r)
                                   If Js.Int(r, "orderId") > 0 Then
                                       f.Close()
                                       Main?.Push(New OrderDetailPage(Js.Int(r, "orderId")))
                                   End If
                               End Sub
        f.AddControl(t)
        f.AddNote("Paid so far " & Theme.Money(list.Sum(Function(r) Js.Num(r, "amount"))), Theme.G700)
        f.ShowDialog(FindForm())
    End Sub

    Private Function OrdersTable(orders As List(Of JsonObject), credits As List(Of JsonObject)) As Control
        Dim col = Function(k As String) _display.IsOn("cp-cols", k)
        Dim t As New WebTable() With {.RowHeight = 56, .RowClickable = True, .EmptyText = "No orders yet."}
        If col("cp-c-order") Then t.Cols.Add(New TCol("Order", Function(o) Js.Str(o, "number") & If(Js.Str(o, "type") <> "online", "  · STORE", ""), 0, CellKind.Link) With {.Flex = 12, .Colour = Function(o) Theme.Blue})
        If col("cp-c-date") Then t.Cols.Add(New TCol("Date", Function(o) Fmt.Day(Js.Time(o, "createdAt")), 0) With {.Flex = 12})
        If col("cp-c-total") Then t.Cols.Add(New TCol("Total", Function(o) Theme.Money(Js.Num(o, "total")), 0, CellKind.Money) With {.Flex = 10, .Right = True})
        If col("cp-c-payment") Then t.Cols.Add(New TCol("Payment", Function(o) If(Js.Str(o, "paymentStatus") = "Paid", "Paid", "Unpaid"), 0, CellKind.Pill) With {.Flex = 9, .Colour = Function(o) If(Js.Str(o, "paymentStatus") = "Paid", Theme.Green, Theme.Grey)})
        If col("cp-c-status") Then t.Cols.Add(New TCol("Status", Function(o) Js.Str(o, "status"), 0, CellKind.Pill) With {.Flex = 10})
        t.Cols.Add(New TCol("Due / Receipts", Nothing, 0, CellKind.Actions) With {.Flex = 14,
            .ButtonsFor = Function(o)
                              Dim l As New List(Of String)
                              If CanCollect() AndAlso credits.Any(Function(d) Js.Int(d, "orderId") = Js.Int(o, "id") AndAlso Js.Num(d, "balance") > 0.004) Then l.Add("collect")
                              If ReceiptsOf(o, credits).Count > 0 Then l.Add("receipts")
                              If col("cp-c-view") Then l.Add("view")
                              Return l
                          End Function}.Btn("collect", ChrW(&HE8C7), "Collect due", Theme.Green).Btn("receipts", ChrW(&HE9F9), "Receipts", Theme.G700).Btn("view", ChrW(&HE890), "Open order", Color.FromArgb(&HE, &HA5, &HE9)))
        t.Rows = orders
        AddHandler t.RowClick, Sub(o) If Js.Int(o, "id") > 0 Then Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
        AddHandler t.ActionClick, Sub(o, k)
                                      Select Case k
                                          Case "collect" : DueActions.Collect(Me, credits.Where(Function(d) Js.Int(d, "orderId") = Js.Int(o, "id") AndAlso Js.Num(d, "balance") > 0.004).ToList())
                                          Case "receipts" : ShowReceipts(Js.Str(o, "number"), ReceiptsOf(o, credits))
                                          Case "view" : If Js.Int(o, "id") > 0 Then Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
                                      End Select
                                  End Sub
        Return t
    End Function

    Private Function AddressesGrid(addresses As List(Of JsonObject)) As Control
        If addresses.Count = 0 Then Return New TextBlock("No saved addresses.", Theme.Body, Theme.G500) With {.Center = True}
        Dim grid As New Columns(2, 280, 12) With {.Stretch = False}
        For Each a In addresses
            Dim box As New CardBox(Js.Str(a, "name") & "  ·  " & Js.Str(a, "type", "Home").ToUpperInvariant() & If(Js.Bool(a, "isDefault"), "  ·  DEFAULT", ""), "", 14)
            If Js.Str(a, "phone") <> "" Then box.Add(New TextBlock(Js.Str(a, "phone"), Theme.Body, Theme.G600))
            box.Add(New TextBlock(Js.Str(a, "text"), Theme.Body, Theme.G800))
            If Js.Str(a, "mapUrl") <> "" Then
                Dim url = Js.Str(a, "mapUrl")
                box.Add(Ui.Btn("Open in Maps", ChrW(&HE707), outline:=True, click:=Sub() Ui.OpenUrl(url)))
            End If
            grid.Add(box)
        Next
        Return grid
    End Function

    Private Function DueTable(credits As List(Of JsonObject)) As Control
        Dim t As New WebTable() With {.RowHeight = 52, .EmptyText = "No dues for this customer."}
        Dim state = Function(d As JsonObject) If(Js.Num(d, "balance") <= 0.004, "Paid", If(Js.Num(d, "paid") > 0.004, "Partly", "Unpaid"))
        t.Cols.Add(New TCol("Order", Function(d) Js.Str(d, "orderNumber", "—"), 0, CellKind.Link) With {.Flex = 11, .Colour = Function(d) Theme.Blue})
        t.Cols.Add(New TCol("Date", Function(d) Fmt.Day(Js.Time(d, "createdAt")), 0) With {.Flex = 10})
        t.Cols.Add(New TCol("Amount", Function(d) Theme.Money(Js.Num(d, "amount")), 0) With {.Flex = 10, .Right = True})
        t.Cols.Add(New TCol("Paid", Function(d) Theme.Money(Js.Num(d, "paid")), 0) With {.Flex = 10, .Right = True, .Colour = Function(d) Theme.Green})
        t.Cols.Add(New TCol("Balance", Function(d) Theme.Money(Js.Num(d, "balance")), 0, CellKind.Bold) With {.Flex = 10, .Right = True, .Colour = Function(d) If(Js.Num(d, "balance") > 0.004, Theme.Danger, Theme.Green)})
        t.Cols.Add(New TCol("Status", Function(d) state(d), 0, CellKind.Pill) With {.Flex = 9, .Colour = Function(d) If(state(d) = "Paid", Theme.Green, If(state(d) = "Partly", Fmt.Yellow, Theme.Grey))})
        t.Cols.Add(New TCol("Actions", Nothing, 110, CellKind.Actions) With {
            .ButtonsFor = Function(d)
                              Dim l As New List(Of String)
                              If Js.Num(d, "balance") > 0.004 AndAlso CanCollect() Then l.Add("collect")
                              If Js.Arr(d, "payments").Count > 0 Then l.Add("receipts")
                              Return l
                          End Function}.Btn("collect", ChrW(&HE8C7), "Collect", Theme.Green).Btn("receipts", ChrW(&HE9F9), "Receipts", Theme.G700))
        t.Rows = credits
        AddHandler t.ActionClick, Sub(d, k)
                                      If k = "collect" Then
                                          DueActions.Collect(Me, New List(Of JsonObject) From {d})
                                      Else
                                          ShowReceipts(Js.Str(d, "orderNumber"), Js.Objs(Js.Arr(d, "payments")).Select(Function(p) Js.Obj("receipt", Js.Str(p, "receipt", "Pending"), "amount", Js.Num(p, "amount"), "method", Js.Str(p, "method") & " · due payment", "at", Js.Field(p, "at"))).ToList())
                                      End If
                                  End Sub
        Return t
    End Function
End Class
