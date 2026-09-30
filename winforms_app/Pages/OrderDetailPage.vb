Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>The website's order page: header (number, type, date, status / payment pills, total, print, call,
''' WhatsApp), progress steps, items (add / remove while open) and totals, history, and the right column:
''' Next step (accept, agent, collect, delivered, cancel), customer, payment details, delivery spot and address.
''' From the copy on this computer (history refreshed when online). agentView = the delivery agent's view.</summary>
Public Class OrderDetailPage
    Inherits ScrollPage

    Private ReadOnly _id As Integer
    Private ReadOnly _agentView As Boolean
    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_order_view_display")
    Private _extra As JsonObject
    Private _o As JsonObject

    Public Overrides ReadOnly Property PageTitle As String
        Get
            Return "Order " & Js.Str(_o, "number")
        End Get
    End Property
    Public Overrides ReadOnly Property PageSubtitle As String
        Get
            Return If(Js.Str(_o, "type") = "online", "Online order — items, delivery, payment and history", "Store bill — items, payment and history")
        End Get
    End Property
    Public Overrides ReadOnly Property Actions As Control()
        Get
            If _agentView Then Return {}
            Return {_display.Button}
        End Get
    End Property

    Public Sub New(orderId As Integer, Optional agentView As Boolean = False)
        _id = orderId
        _agentView = agentView
        _extra = AppState.I.SavedOrder(orderId)
        AddHandler _display.Changed, Sub() Refresh_()
        Dim unused = LoadExtraAsync()
    End Sub

    Private Async Function LoadExtraAsync() As Task
        Dim r = Await AppState.I.Api.GetAsync("/api/app/v1/orders/" & _id)
        If Not r.IsOk OrElse IsDisposed Then Return
        Dim x = TryCast(Js.Copy(Js.Field(r.Data, "order")), JsonObject)
        If x Is Nothing Then Return
        _extra = x
        AppState.I.SaveOrder(_id, x, Js.Str(Order(), "rev"))
        Refresh_()
    End Function

    Private Function Order() As JsonObject
        For Each setName In {"orders", "deliveries"}
            Dim o = AppState.I.List(setName).FirstOrDefault(Function(x) Js.Int(x, "id") = _id)
            If o IsNot Nothing Then Return o
        Next
        Return Nothing
    End Function

    Private Function Mine() As Boolean
        Return Js.Int(_o, "agentId") = Js.Int(AppState.I.User, "id")
    End Function

    Private Sub Act(label As String, body As JsonObject, fields As JsonObject, Optional delivery As Boolean = False)
        OrderActions.Act(_o, label, body, fields, delivery, Me)
    End Sub

    Protected Overrides Sub Reload()
        _o = Order()
        Body.SuspendLayout()
        ClearBody()
        If _o Is Nothing Then
            Body.Add(New CardBox()).Add(New TextBlock("This order is not on this computer yet. Press F5 to sync.", Theme.Body, Theme.G500))
            Body.ResumeLayout()
            HeaderChanged()
            Return
        End If
        HeaderChanged()
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)
        Body.Add(BuildHeader())
        If Js.Str(_o, "type") = "online" AndAlso _display.Item("ov-progress") Then Body.Add(BuildProgress())
        Dim cols As New Columns(2, 380, 14) With {.Weights = {7, 4}, .Stretch = False}
        Dim left As New VStack(14)
        If _display.IsOn("ov-items") Then left.Add(BuildItems())
        If _display.Item("ov-history") Then left.Add(BuildHistory())
        Dim right As New VStack(14)
        For Each c In BuildSide() : right.Add(c) : Next
        cols.Add(left)
        cols.Add(right)
        Body.Add(cols)
        Body.ResumeLayout()
    End Sub

    ' ───────── header ─────────
    Private Function BuildHeader() As Control
        Dim o = _o
        Dim card As New Card With {.Height = 84, .Padding = New Padding(18, 0, 18, 0)}
        Dim st = Js.Str(o, "status")
        Dim online = Js.Str(o, "type") = "online"
        Dim paid = Js.Str(o, "paymentStatus") = "Paid"
        Dim canMarkPaid = online AndAlso Not paid AndAlso st <> "Canceled" AndAlso If(_agentView, Mine(), AppState.I.Perm.Has("orders", "mark_paid"))
        Dim on_ = Function(k As String) _display.IsOn("ov-header", k)
        Dim buttons As New HRow(8) With {.RightAlign = True}
        If on_("ov-h-print") Then buttons.Add(Ui.Btn("Print", Theme.IcPrint, outline:=True, click:=Sub() OrderActions.PrintOrder(_o, Me)))
        Dim phone = Js.Str(o, "phone")
        If phone <> "" AndAlso on_("ov-h-contact") Then
            buttons.Add(Ui.IconBtn(Theme.IcPhone, "Call " & phone, Sub() Ui.OpenUrl("tel:" & phone)))
            buttons.Add(Ui.IconBtn(ChrW(&HE8BD), "WhatsApp", Sub() Ui.OpenUrl(Ui.WhatsApp(phone)), Theme.Green))
        End If
        card.Controls.Add(buttons)
        Dim statusRect As Rectangle, payRect As Rectangle
        Dim draw As New Drawn(84, Sub(g, r)
                                        Dim x = 0
                                        Tr.DrawText(g, Js.Str(o, "number"), Theme.UiFont(13.5F, FontStyle.Bold), New Point(x, 18), Theme.G900, TextFormatFlags.NoPadding)
                                        Dim nw = Tr.MeasureText(Js.Str(o, "number"), Theme.UiFont(13.5F, FontStyle.Bold)).Width
                                        If on_("ov-h-type") Then
                                            If online Then Gfx.Badge(g, "Online order", x + nw + 12, 30, Theme.Primary, Theme.PrimarySoft) Else Gfx.Badge(g, "In-store bill", x + nw + 12, 30, Fmt.AmberText, Fmt.AmberSoft)
                                        End If
                                        If on_("ov-h-date") Then Tr.DrawText(g, Fmt.Stamp(Js.Time(o, "createdAt")), Theme.Body, New Point(x, 48), Theme.G600, TextFormatFlags.NoPadding)
                                        Dim rx = r.Right - 10
                                        If on_("ov-h-total") Then
                                            Dim t = Theme.Money(Js.Num(o, "total"))
                                            Dim tw = Tr.MeasureText(t, Theme.UiFont(15.0F, FontStyle.Bold)).Width
                                            Tr.DrawText(g, "Total", Theme.Small, New Rectangle(rx - tw, 16, tw, 16), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                            Tr.DrawText(g, t, Theme.UiFont(15.0F, FontStyle.Bold), New Point(rx - tw, 34), Theme.G900, TextFormatFlags.NoPadding)
                                            rx -= tw + 20
                                        End If
                                        If on_("ov-h-pills") Then
                                            Dim ptxt = If(paid, "Paid", "Unpaid")
                                            Dim pw = Gfx.PillWidth(ptxt, canMarkPaid)
                                            payRect = Gfx.Pill(g, ptxt, rx - pw, 42, If(paid, Theme.Green, Theme.Grey), canMarkPaid)
                                            rx -= pw + 8
                                            Dim choices = If(_agentView, New List(Of String) From {st}, OrderActions.StatusChoices(o))
                                            Dim sw = Gfx.PillWidth(st, choices.Count > 1)
                                            statusRect = Gfx.Pill(g, st, rx - sw, 42, Fmt.StatusColor(st), choices.Count > 1)
                                        End If
                                    End Sub)
        AddHandler draw.MouseClick, Sub(s, e)
                                        If statusRect.Contains(e.Location) AndAlso Not _agentView Then OrderActions.StatusMenu(_o, draw.PointToScreen(New Point(statusRect.X, statusRect.Bottom + 2)), Me)
                                        If payRect.Contains(e.Location) AndAlso canMarkPaid Then Collect()
                                    End Sub
        AddHandler draw.MouseMove, Sub(s, e) draw.Cursor = If(statusRect.Contains(e.Location) OrElse (payRect.Contains(e.Location) AndAlso canMarkPaid), Cursors.Hand, Cursors.Default)
        card.Controls.Add(draw)
        AddHandler card.Layout, Sub()
                                    Dim bw = buttons.Controls.Cast(Of Control)().Sum(Function(c) c.Width + 8)
                                    buttons.SetBounds(card.Width - 18 - bw, 22, bw, 40)
                                    draw.SetBounds(18, 0, card.Width - 36 - bw - 10, 84)
                                End Sub
        Return card
    End Function

    Private Sub Collect()
        Dim m = OrderActions.PickMethod(Me, "Received " & Theme.Money(Js.Num(_o, "total")) & " by")
        If m Is Nothing Then Return
        If _agentView Then
            Act("Collected " & Theme.Money(Js.Num(_o, "total")) & " (" & Js.Str(_o, "number") & ")", Js.Obj("action", "collect", "method", m), Js.Obj("paymentStatus", "Paid", "paymentMethod", m), True)
        Else
            Act("Paid " & Js.Str(_o, "number"), Js.Obj("action", "update_payment", "paymentStatus", "Paid", "method", m), Js.Obj("paymentStatus", "Paid", "paymentMethod", m, "due", 0))
        End If
    End Sub

    ' ───────── progress ─────────
    Private Function BuildProgress() As Control
        Dim o = _o
        Dim st = Js.Str(o, "status")
        Dim card As New Card With {.Height = If(st = "Canceled", 60, 96), .Padding = New Padding(20, 14, 20, 14)}
        Dim d As New Drawn(card.Height, Sub(g, r)
                                              If st = "Canceled" Then
                                                  Using f = Theme.IconFont(13) : Tr.DrawText(g, ChrW(&HEA39), f, New Rectangle(0, 0, 24, r.Height), Theme.Danger, TextFormatFlags.VerticalCenter) : End Using
                                                  Dim why = Js.Str(o, "cancelReason")
                                                  Tr.DrawText(g, "This order was cancelled" & If(why <> "", " — " & why, "") & ".", Theme.BodyBold, New Rectangle(32, 0, r.Width - 32, r.Height), Color.FromArgb(&HB9, &H1C, &H1C), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                                  Return
                                              End If
                                              Dim steps = {"Placed", "Accepted", "Out for delivery", "Delivered"}
                                              Dim reached = Array.IndexOf({"Pending", "In Progress", "Out for Delivery", "Delivered"}, st)
                                              Dim gapW = (r.Width - 36) / 3.0
                                              For k = 0 To 3
                                                  Dim cx = CInt(18 + k * gapW)
                                                  If k < 3 Then
                                                      Using p As New Pen(If(k < reached, Theme.Blue, Theme.G200), 2) : g.DrawLine(p, cx + 22, 18, CInt(cx + gapW - 22), 18) : End Using
                                                  End If
                                                  Dim circle As New Rectangle(cx - 18, 0, 36, 36)
                                                  Using b As New SolidBrush(If(k <= reached, Theme.Blue, Color.White)) : g.FillEllipse(b, circle) : End Using
                                                  Using p As New Pen(If(k <= reached, Theme.Blue, Theme.G300), 1.5F) : g.DrawEllipse(p, circle) : End Using
                                                  Dim glyph = If(k < reached OrElse (k = reached AndAlso k = 3) OrElse k <= 1, Theme.IcCheck, If(k = 2, Theme.IcTruck, Theme.IcPackage))
                                                  Using f = Theme.IconFont(11) : Theme.DrawCentered(g, glyph, f, If(k <= reached, Color.White, Theme.G400), circle) : End Using
                                                  Dim tw = 140
                                                  Tr.DrawText(g, steps(k), If(k <= reached, Theme.BodyBold, Theme.Body), New Rectangle(cx - tw \ 2, 44, tw, 20), If(k <= reached, Theme.G900, Theme.G400), TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
                                              Next
                                          End Sub)
        d.Dock = DockStyle.Fill
        card.Controls.Add(d)
        Return card
    End Function

    ' ───────── items + totals ─────────
    Private Function BuildItems() As Control
        Dim o = _o
        Dim st = Js.Str(o, "status")
        Dim items = Js.Objs(Js.Arr(o, "items"))
        Dim editable = Not _agentView AndAlso st <> "Delivered" AndAlso st <> "Canceled" AndAlso AppState.I.Perm.OrdersView() AndAlso Js.Str(o, "localRef") = ""
        Dim c = Function(k As String) _display.IsOn("ov-items", k)
        Dim card As New CardBox("Items (" & items.Count & ")", Theme.IcPackage)
        card.Accent = Theme.Blue
        If editable AndAlso c("ov-i-add") Then card.Tools.Add(Ui.Btn("Add a product", Theme.IcAdd, outline:=True, click:=Sub() AddProduct()))
        Dim t As New WebTable() With {.RowHeight = 56}
        Dim products = AppState.I.List("products")
        If c("ov-c-num") Then t.Cols.Add(New TCol("#", Function(i) (items.IndexOf(i) + 1).ToString(), 44))
        If c("ov-c-product") Then
            If c("ov-c-image") Then
                t.Cols.Add(New TCol("PRODUCT", Function(i) Js.Str(i, "name"), 0, CellKind.Thumb) With {.Flex = 5,
                    .Picture = Function(i) Js.Str(products.FirstOrDefault(Function(p) Js.Int(p, "id") = Js.Int(i, "productId")), "image")})
            Else
                t.Cols.Add(New TCol("PRODUCT", Function(i) Js.Str(i, "name"), 0, CellKind.Bold) With {.Flex = 5})
            End If
        End If
        If c("ov-c-qty") Then t.Cols.Add(New TCol("QTY", Function(i) Fmt.Num(Js.Num(i, "qty")), 70))
        If c("ov-c-price") Then t.Cols.Add(New TCol("PRICE", Function(i) Theme.Money(Js.Num(i, "price")), 0) With {.Flex = 2, .Right = True})
        If c("ov-c-gst") Then t.Cols.Add(New TCol("GST", Function(i) Js.Num(i, "gstRate").ToString("0") & "%", 70) With {.Right = True})
        If c("ov-c-subtotal") Then t.Cols.Add(New TCol("AMOUNT", Function(i) Theme.Money(Js.Num(i, "qty") * Js.Num(i, "price")), 0, CellKind.Money) With {.Flex = 2, .Right = True})
        If c("ov-c-remove") AndAlso editable Then t.Cols.Add(New TCol("", Nothing, 56, CellKind.Actions).Btn("remove", Theme.IcDelete, "Remove", Theme.Danger))
        t.Rows = items
        AddHandler t.ActionClick, Sub(it, k)
                                      If items.Count <= 1 Then Toast("An order needs at least one item — cancel the order instead.", True) : Return
                                      If Js.IsNull(it, "id") Then Toast("Refresh first (F5), then remove it.", True) : Return
                                      If Not Ui.Confirm(Me, "Remove " & Js.Str(it, "name") & " from " & Js.Str(o, "number") & "? The total is worked out again.", "Remove item?") Then Return
                                      ItemChange("Remove " & Js.Str(it, "name") & " from " & Js.Str(o, "number"), Js.Obj("action", "remove_item", "itemId", Js.Int(it, "id")), Js.Obj("op", "remove", "itemId", Js.Int(it, "id")))
                                  End Sub
        card.Add(t)
        If _display.IsOn("ov-bill") Then
            Dim b = Function(k As String) _display.IsOn("ov-bill", k)
            Dim paid = Js.Str(o, "paymentStatus") = "Paid"
            Dim due = If(Js.Num(o, "due") > 0, Js.Num(o, "due"), If(Not paid AndAlso st <> "Canceled", Js.Num(o, "total"), 0))
            Dim kv As New KeyValues() With {.RightPart = True}
            If b("ov-b-subtotal") Then kv.Add("Subtotal", Theme.Money(Js.Num(o, "subtotal")))
            If b("ov-b-discount") AndAlso Js.Num(o, "discount") > 0 Then kv.Add("Discount", "-" & Theme.Money(Js.Num(o, "discount")), False, Color.FromArgb(&H16, &HA3, &H4A))
            If b("ov-b-gst") Then kv.Add("GST", Theme.Money(Js.Num(o, "gst")))
            If Js.Num(o, "delivery") > 0 Then kv.Add("Delivery charge", Theme.Money(Js.Num(o, "delivery")))
            kv.Add("-", "")
            kv.Add("Total", Theme.Money(Js.Num(o, "total")), True)
            If b("ov-b-paid") Then kv.Add("Paid", Theme.Money(If(paid, Js.Num(o, "total"), Js.Num(o, "total") - due)))
            If b("ov-b-due") AndAlso due > 0 Then kv.Add("Due", Theme.Money(due), False, Theme.Danger)
            card.Add(kv)
        End If
        Return card
    End Function

    Private Sub ItemChange(label As String, body As JsonObject, effect As JsonObject)
        Dim e As New JsonObject From {{"kind", "order_items"}, {"id", _id}}
        Js.Merge(e, effect)
        AppState.I.Enqueue(New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/orders/" & _id & "/items", .Body = body, .Label = label, .Effect = e, .Refresh = New List(Of String) From {"orders", "products"}})
        Toast(label & " ✓")
    End Sub

    Private Sub AddProduct()
        Dim products = AppState.I.List("products").Where(Function(p) Js.Str(p, "status") = "active").OrderBy(Function(p) Js.Str(p, "name")).ToList()
        Dim price = Function(p As JsonObject) If(Js.Num(p, "salePrice") > 0, Js.Num(p, "salePrice"), Js.Num(p, "price"))
        Dim f As New FormDialog("Add a product to " & Js.Str(_o, "number"), 520, "Add")
        f.AddCombo("p", "Product", products.Select(Function(p) Js.Str(p, "name") & " — " & Theme.Money(price(p))))
        f.AddNumber("qty", "Quantity", 1)
        f.Validator = Function(d)
                          If Not products.Any(Function(p) Js.Str(p, "name") & " — " & Theme.Money(price(p)) = d.Val("p")) Then Return "Choose a product from the list."
                          If d.Num("qty") < 1 Then Return "Quantity must be at least 1."
                          Return Nothing
                      End Function
        If f.ShowDialog(FindForm()) <> DialogResult.OK Then Return
        Dim pick = products.First(Function(p) Js.Str(p, "name") & " — " & Theme.Money(price(p)) = f.Val("p"))
        Dim qty = CInt(f.Num("qty"))
        ItemChange("Add " & Js.Str(pick, "name") & " to " & Js.Str(_o, "number"), Js.Obj("action", "add_item", "productId", Js.Int(pick, "id"), "addQty", qty),
                   New JsonObject From {{"op", "add"}, {"item", Js.Obj("productId", Js.Int(pick, "id"), "name", Js.Str(pick, "name"), "qty", qty, "price", price(pick), "gstRate", Js.Num(pick, "gstRate"))}})
    End Sub

    ' ───────── history ─────────
    Private Shared Function EventText(e As JsonObject) As String
        Select Case Js.Str(e, "type")
            Case "placed" : Return "Order placed"
            Case "status" : Return "Status: " & Js.Str(e, "fromValue") & " → " & Js.Str(e, "toValue")
            Case "payment" : Return "Payment: " & Js.Str(e, "toValue")
            Case "assign" : Return If(Js.IsNull(e, "toValue"), "Delivery agent removed", "Assigned to " & Js.Str(e, "toValue"))
            Case "note" : Return "Note"
            Case Else : Return Fmt.Title(Js.Str(e, "type"))
        End Select
    End Function

    Private Function BuildHistory() As Control
        Dim card As New CardBox("Order history", Theme.IcClock) With {.Accent = Theme.Blue}
        Dim tl As New Timeline() With {.EmptyText = If(AppState.I.Online, "Loading…", "Available when online.")}
        If _extra IsNot Nothing Then
            tl.EmptyText = "No history yet."
            For Each e In Js.Objs(Js.Arr(_extra, "events")).AsEnumerable().Reverse()
                tl.Items.Add((EventText(e), Fmt.Stamp(Js.Time(e, "createdAt")) & " · " & Js.Str(e, "actorName"), Js.Str(e, "note")))
            Next
        End If
        card.Add(tl)
        Return card
    End Function

    ' ───────── right column ─────────
    Private Function BuildSide() As List(Of Control)
        Dim o = _o
        Dim p = AppState.I.Perm
        Dim st = Js.Str(o, "status")
        Dim online = Js.Str(o, "type") = "online"
        Dim paid = Js.Str(o, "paymentStatus") = "Paid"
        Dim canMarkPaid = online AndAlso Not paid AndAlso st <> "Canceled" AndAlso If(_agentView, Mine(), p.Has("orders", "mark_paid"))
        Dim side As New List(Of Control)
        Dim s = Function(k As String) _display.IsOn("ov-side", k)
        Dim bigBtn = Function(text As String, glyph As String, colour As Color, click As Action) As WButton
                         Dim b = Ui.Btn(text, glyph, colour, click:=click)
                         b.Height = 44
                         Return b
                     End Function

        ' Next step
        Dim nxt As New CardBox("Next step")
        If online AndAlso p.Has("orders", "assign_delivery") AndAlso Not _agentView AndAlso (st = "In Progress" OrElse st = "Out for Delivery") Then
            Dim agents = AppState.I.List("agents")
            Dim an = OrderActions.AgentName(Js.Int(o, "agentId"))
            If an <> "" Then nxt.Add(New TextBlock(an & If(Js.Time(o, "assignedAt").HasValue, "  · since " & Fmt.Stamp(Js.Time(o, "assignedAt")), ""), Theme.BodyBold, Theme.G900))
            Dim combo = Ui.Filter({If(Js.IsNull(o, "agentId"), "0|Choose an agent…", "")}.Where(Function(x) x <> "").Concat(agents.Select(Function(a) Js.Int(a, "id") & "|" & Js.Str(a, "name"))))
            Ui.SetVal(combo, If(Js.IsNull(o, "agentId"), "0", Js.Int(o, "agentId").ToString()))
            AddHandler combo.SelectionChangeCommitted, Sub()
                                                           Dim id = CInt(Ui.Val(combo))
                                                           If id <> 0 AndAlso id <> Js.Int(o, "agentId") Then OrderActions.Assign(o, agents.First(Function(a) Js.Int(a, "id") = id), Me)
                                                       End Sub
            nxt.Add(New Field("Delivery agent", combo))
        End If
        If canMarkPaid Then nxt.Add(bigBtn("Mark Paid · " & Theme.Money(Js.Num(o, "total")), ChrW(&HE8C7), Color.FromArgb(5, &H96, &H69), Sub() Collect()))
        If online AndAlso st = "Pending" AndAlso (p.Has("orders", "accept_reject") OrElse p.Has("orders", "update_status")) AndAlso Not _agentView Then
            nxt.Add(bigBtn("Accept order", Theme.IcCheck, Theme.Blue, Sub() OrderActions.Accept(o, Me)))
        End If
        If online AndAlso _agentView AndAlso Mine() AndAlso st = "In Progress" Then
            nxt.Add(bigBtn("Start delivery", Theme.IcTruck, Theme.Blue, Sub() Act("Start delivery " & Js.Str(o, "number"), Js.Obj("action", "start"), Js.Obj("status", "Out for Delivery"), True)))
        End If
        If online AndAlso st = "Out for Delivery" AndAlso If(_agentView, Mine(), p.Has("orders", "update_status")) Then
            nxt.Add(bigBtn("Mark delivered", Theme.IcDone, Color.FromArgb(&H10, &HB9, &H81), Sub()
                                                                                              If Not Ui.Confirm(Me, "Mark " & Js.Str(o, "number") & " as delivered to " & Js.Str(o, "customer") & "?", "Delivered?") Then Return
                                                                                              If _agentView Then
                                                                                                  Act("Delivered " & Js.Str(o, "number"), Js.Obj("action", "deliver"), Js.Obj("status", "Delivered", "deliveredAt", DateTime.UtcNow), True)
                                                                                              Else
                                                                                                  Act("Delivered " & Js.Str(o, "number"), Js.Obj("action", "update_status", "orderStatus", "Delivered"), Js.Obj("status", "Delivered", "deliveredAt", DateTime.UtcNow))
                                                                                              End If
                                                                                          End Sub))
        End If
        If online AndAlso _agentView AndAlso Mine() AndAlso (st = "Out for Delivery" OrElse st = "In Progress") Then
            nxt.Add(Ui.Btn("Couldn't deliver", "", Color.FromArgb(&HD9, &H77, 6), outline:=True, click:=Sub()
                                                                                                          Dim r = OrderActions.AskReason(Me, "Couldn't deliver", {"Customer not reachable", "Customer not at home", "Wrong address", "Customer asked to come later"})
                                                                                                          If r IsNot Nothing Then Act("Delivery attempt " & Js.Str(o, "number"), Js.Obj("action", "fail", "note", r), If(st = "Out for Delivery", Js.Obj("status", "In Progress"), New JsonObject()), True)
                                                                                                      End Sub))
        End If
        If online AndAlso Not _agentView AndAlso st <> "Delivered" AndAlso st <> "Canceled" AndAlso (p.Has("orders", "cancel") OrElse (st = "Pending" AndAlso p.Has("orders", "accept_reject"))) Then
            nxt.Add(Ui.Btn(If(st = "Pending", "Reject this order", "Cancel this order"), Theme.IcCancel, Theme.Danger, outline:=True, click:=Sub() OrderActions.SetStatus(o, "Canceled", Me)))
        End If
        If nxt.Body.Controls.Count > 0 AndAlso s("ov-s-actions") Then side.Add(nxt)

        ' Customer
        If s("ov-s-customer") Then
            Dim cust = AppState.I.List("customers").FirstOrDefault(Function(c) Js.Int(c, "id") = Js.Int(o, "customerId") AndAlso Js.Int(o, "customerId") > 0)
            Dim card As New CardBox("Customer")
            Dim nameRow As New Drawn(44, Sub(g, r)
                                             Gfx.Avatar(g, New Rectangle(0, 2, 40, 40), Js.Str(o, "customer"), Nothing)
                                             Tr.DrawText(g, Js.Str(o, "customer"), Theme.BodyBold, New Point(52, 4), Theme.G900, TextFormatFlags.NoPadding)
                                             If cust IsNot Nothing Then Tr.DrawText(g, "View profile", Theme.Body, New Point(52, 24), Theme.Blue, TextFormatFlags.NoPadding)
                                         End Sub)
            If cust IsNot Nothing Then
                nameRow.Cursor = Cursors.Hand
                AddHandler nameRow.Click, Sub() Main?.Push(New CustomerProfilePage(Js.Int(cust, "id")))
            End If
            card.Add(nameRow)
            Dim kv As New KeyValues()
            If Js.Str(o, "phone") <> "" Then kv.Add("Phone", Js.Str(o, "phone"))
            If Js.Str(cust, "email") <> "" Then kv.Add("Email", Js.Str(cust, "email"))
            If kv.Rows.Count > 0 Then card.Add(kv)
            side.Add(card)
        End If

        ' Payment details
        If s("ov-s-payment") Then
            Dim card As New CardBox("Payment details")
            Dim kv As New KeyValues()
            kv.Add("Method", OrderActions.MethodLabel(Js.Str(o, "paymentMethod")))
            kv.Add("Status", If(paid, "Paid", "Unpaid"), False, If(paid, Theme.Green, Theme.Danger))
            For Each x In Js.Objs(Js.Arr(o, "pays"))
                kv.Add(Js.Str(x, "method"), Theme.Money(Js.Num(x, "amount")))
            Next
            Dim receipts = Js.Objs(Js.Arr(_extra, "credits")).SelectMany(Function(c) Js.Objs(Js.Arr(c, "payments"))).ToList()
            If receipts.Count > 0 Then
                kv.Add("-", "")
                For Each r In receipts
                    kv.Add(Js.Str(r, "receipt") & " · " & Js.Str(r, "method") & " · " & Fmt.Day(Js.Time(r, "at")), Theme.Money(Js.Num(r, "amount")), False, Theme.Green)
                Next
            End If
            card.Add(kv)
            side.Add(card)
        End If

        ' Delivery spot
        If Not Js.IsNull(o, "lat") AndAlso s("ov-s-map") Then
            Dim card As New CardBox("Delivery spot")
            card.Add(New TextBlock(Js.Num(o, "lat").ToString("0.00000") & ", " & Js.Num(o, "lng").ToString("0.00000"), Theme.Body, Theme.G700))
            card.Add(Ui.Btn("Open in Google Maps", ChrW(&HE707), outline:=True, click:=Sub() Ui.OpenUrl("https://www.google.com/maps?q=" & Js.Str(o, "lat") & "," & Js.Str(o, "lng"))))
            side.Add(card)
        End If

        ' Address
        If Js.Str(o, "address") <> "" AndAlso s("ov-s-address") Then
            Dim card As New CardBox("Delivery address")
            card.Add(New TextBlock(Js.Str(o, "address"), Theme.Body, Theme.G800))
            card.Add(Ui.Btn("Open in Maps", ChrW(&HE707), outline:=True, click:=Sub()
                                                                                    Dim dest = If(Js.IsNull(o, "lat"), Uri.EscapeDataString(Js.Str(o, "address")), Js.Str(o, "lat") & "," & Js.Str(o, "lng"))
                                                                                    Ui.OpenUrl("https://www.google.com/maps/dir/?api=1&destination=" & dest)
                                                                                End Sub))
            side.Add(card)
        End If
        Return side
    End Function
End Class
