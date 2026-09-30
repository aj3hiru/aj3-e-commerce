Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Each role's own dashboard (RoleDashboards.tsx): a welcome box with quick links, number tiles and short lists.</summary>
Public Module RoleViews
    Private ReadOnly RoleColors As New Dictionary(Of String, Color) From {
        {"admin", Color.FromArgb(&H7C, &H3A, &HED)}, {"manager", Color.FromArgb(&H25, &H63, &HEB)}, {"order_manager", Color.FromArgb(&HEA, &H58, &HC)},
        {"delivery_agent", Color.FromArgb(5, &H96, &H69)}, {"cashier", Color.FromArgb(&HD9, &H77, 6)}, {"catalog_manager", Color.FromArgb(8, &H91, &HB2)}, {"marketing", Color.FromArgb(&HDB, &H27, &H77)}}

    Private Function Money0(v As Double) As String
        Return "₹" & Math.Round(v).ToString("#,##0", Theme.India)
    End Function

    Private Function Ago(iso As String) As String
        Dim d As DateTimeOffset
        If Not DateTimeOffset.TryParse(iso, d) Then Return ""
        Dim m = Math.Max(0, CInt(Math.Round((DateTimeOffset.UtcNow - d).TotalMinutes)))
        Return If(m < 60, m & "m ago", If(m < 1440, (m \ 60) & "h ago", (m \ 1440) & "d ago"))
    End Function

    Private Sub Welcome(body As VStack, page As DashboardPage, actions As (Href As String, Label As String, Icon As String, Primary As Boolean)())
        Dim u = AppState.I.User
        Dim role = Js.Str(u, "role")
        Dim ist = Fmt.ToIst(DateTime.Now)
        Dim hello = If(ist.Hour < 12, "Good morning", If(ist.Hour < 17, "Good afternoon", "Good evening"))
        Dim box As New CardBox(Nothing, "", 20)
        Dim row As New Columns(2, 200, 16) With {.Weights = {3, 2}, .Stretch = False}
        Dim c = If(RoleColors.ContainsKey(role), RoleColors(role), Color.FromArgb(&H64, &H74, &H8B))
        Dim left As New Drawn(56, Sub(g, r)
                                       Tr.DrawText(g, hello & ", " & Js.Str(u, "username") & " 👋", Theme.Px(20, 700), New Point(0, 0), Theme.G900, TextFormatFlags.NoPadding)
                                       Dim t = Js.Str(u, "roleLabel", Fmt.Title(role))
                                       Dim w = Tr.MeasureText(t, Theme.Px(12, 600)).Width + 20
                                       Using p = Theme.RoundRect(New RectangleF(0, 32, w, 22), 11)
                                           Using b As New SolidBrush(Theme.Tint(c, 28)) : g.FillPath(b, p) : End Using
                                       End Using
                                       Tr.DrawText(g, t, Theme.Px(12, 600), New Rectangle(0, 32, w, 22), c, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                   End Sub)
        row.Add(left)
        Dim btns As New HRow(8) With {.RightAlign = True}
        For Each a In actions
            Dim b As New HeadButton(a.Label, a.Icon, If(a.Primary, Theme.Primary, Color.Empty))
            Dim href = a.Href
            AddHandler b.Click, Sub() page.Navigate(href)
            btns.Add(b)
        Next
        row.Add(btns)
        box.Add(row)
        body.Add(box)
    End Sub

    Private Function Stat(icon As String, label As String, value As String, tint As Color, ink As Color, Optional href As String = Nothing, Optional page As DashboardPage = Nothing) As Control
        Dim d As New Drawn(78, Sub(g, r)
                                   Theme.Smooth(g)
                                   Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, r.Width - 1.5F, r.Height - 1.5F), Theme.Radius)
                                       Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                                       Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
                                   End Using
                                   Using p = Theme.RoundRect(New RectangleF(16, 17, 44, 44), Theme.Radius)
                                       Using b As New SolidBrush(tint) : g.FillPath(b, p) : End Using
                                   End Using
                                   Icons.Draw(g, icon, New RectangleF(28, 29, 20, 20), ink)
                                   Tr.DrawText(g, value, Theme.Px(20, 800), New Rectangle(72, 18, r.Width - 80, 26), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                   Tr.DrawText(g, label, Theme.Px(12), New Rectangle(72, 45, r.Width - 80, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                               End Sub)
        If href IsNot Nothing Then
            d.Cursor = Cursors.Hand
            AddHandler d.Click, Sub() page.Navigate(href)
        End If
        Return d
    End Function

    ''' <summary>A panel: title with icon and a link on the right, then rows.</summary>
    Private Function Panel(title As String, icon As String, Optional link As String = Nothing, Optional href As String = Nothing, Optional page As DashboardPage = Nothing) As CardBox
        Dim p As New CardBox(title, "", 12)
        p.Glyph = ""
        If link IsNot Nothing Then
            Dim l As New LinkText(link, "", Theme.Primary) With {.Font = Theme.Px(12, 600)}
            AddHandler l.Click, Sub() page.Navigate(href)
            p.Tools.Add(l)
        End If
        Return p
    End Function

    Private Function Empty(text As String) As Control
        Return New TextBlock(text, Theme.Px(14), Theme.G400) With {.Center = True, .Padding = New Padding(0, 20, 0, 20)}
    End Function

    ''' <summary>One line of a list: left text (bold link part + rest), right part, optional click.</summary>
    Private Function Line(left As String, leftRest As String, right As String, rightColor As Color, Optional go As Action = Nothing, Optional sub_ As String = "") As Control
        Dim h = If(sub_ = "", 40, 52)
        Dim d As New Drawn(h, Sub(g, r)
                                  Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 0, r.Height - 1, r.Width, r.Height - 1) : End Using
                                  Dim f = Theme.Px(14, 600)
                                  Dim w1 = Tr.MeasureText(left, f).Width
                                  Tr.DrawText(g, left, f, New Point(8, 10), If(go Is Nothing, Theme.G900, Theme.Primary), TextFormatFlags.NoPadding)
                                  Dim rw = Tr.MeasureText(right, Theme.Px(14, 700)).Width
                                  Tr.DrawText(g, leftRest, Theme.Px(14), New Rectangle(8 + w1, 10, r.Width - 8 - w1 - rw - 20, 20), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                  If sub_ <> "" Then Tr.DrawText(g, sub_, Theme.Px(12), New Rectangle(8, 30, r.Width - 16, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                  Tr.DrawText(g, right, Theme.Px(14, 700), New Rectangle(r.Width - 8 - rw, 10, rw + 2, 20), rightColor, TextFormatFlags.NoPadding)
                              End Sub)
        If go IsNot Nothing Then
            d.Cursor = Cursors.Hand
            AddHandler d.Click, Sub() go()
        End If
        Return d
    End Function

    Private Function OpenOrder(page As DashboardPage, id As Integer) As Action
        Return Sub() page.Main_?.Push(New OrderDetailPage(id))
    End Function

    ' ── Order manager ──
    Public Sub OrderDesk(body As VStack, d As JsonObject, canAccept As Boolean, page As DashboardPage)
        Welcome(body, page, {("orders:Pending", "Pending orders", "clipboard-list", True), ("/admin/deliveries?view=all", "Deliveries board", "truck", False)})
        Dim s = Js.Field(d, "stats")
        Dim g As New Columns(6, 160, 12)
        g.Add(Stat("clipboard-list", "New orders", Js.Int(s, "pending").ToString(), Color.FromArgb(&HFF, &HFB, &HEB), Color.FromArgb(&HD9, &H77, 6), "orders:Pending", page))
        g.Add(Stat("clock", "Waiting for agent", Js.Int(s, "waiting").ToString(), Color.FromArgb(&HFF, &HF7, &HED), Color.FromArgb(&HEA, &H58, &HC), "/admin/deliveries?view=all", page))
        g.Add(Stat("truck", "Out for delivery", Js.Int(s, "outFor").ToString(), Color.FromArgb(&HF0, &HF9, &HFF), Color.FromArgb(2, &H84, &HC7), "/admin/deliveries?view=all", page))
        g.Add(Stat("package-check", "Delivered today", Js.Int(s, "deliveredToday").ToString(), Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(5, &H96, &H69)))
        g.Add(Stat("circle-x", "Cancelled today", Js.Int(s, "canceledToday").ToString(), Color.FromArgb(&HFE, &HF2, &HF2), Color.FromArgb(&HDC, &H26, &H26)))
        g.Add(Stat("wallet", "COD to collect", Money0(Js.Num(s, "codPending")), Color.FromArgb(&HF5, &HF3, &HFF), Color.FromArgb(&H7C, &H3A, &HED)))
        body.Add(g)
        Dim row As New Columns(2, 360, 20) With {.Weights = {14, 10}, .Stretch = False}
        Dim p1 = Panel("New orders — accept or reject", "clipboard-list", "All pending →", "orders:Pending", page)
        Dim news = Js.Objs(Js.Arr(d, "newOrders"))
        If news.Count = 0 Then p1.Add(Empty("No new orders right now."))
        For Each o In news
            Dim id = Js.Int(o, "id")
            Dim r As New Columns(2, 60, 8) With {.Weights = {5, 2}}
            r.Add(Line("#" & Js.Str(o, "number"), " · " & If(Js.Str(o, "customer") = "", "Customer", Js.Str(o, "customer")), "", Theme.G900, OpenOrder(page, id),
                       Js.Int(o, "items") & " item" & If(Js.Int(o, "items") = 1, "", "s") & " · " & Money0(Js.Num(o, "total")) & " · " & If(Js.Bool(o, "paid"), "Paid", "Unpaid") & " · " & Ago(Js.Str(o, "at"))))
            Dim btns As New HRow(6) With {.RightAlign = True}
            If canAccept Then
                Dim a As New HeadButton("Accept", "check", Color.FromArgb(5, &H96, &H69)) With {.Height = 32}
                AddHandler a.Click, Sub()
                                        Dim local = AppState.I.AllOrders().FirstOrDefault(Function(x) Js.Int(x, "id") = id)
                                        OrderActions.Accept(If(local, Js.Obj("id", id, "number", Js.Str(o, "number"), "type", "online")), page)
                                    End Sub
                btns.Add(a)
            End If
            Dim op As New HeadButton("Open") With {.Height = 32}
            AddHandler op.Click, Sub() OpenOrder(page, id)()
            btns.Add(op)
            r.Add(btns)
            p1.Add(r)
        Next
        row.Add(p1)
        Dim right As New VStack(20)
        Dim p2 = Panel("Accepted — needs a delivery agent", "bike", "Assign →", "/admin/deliveries?view=all", page)
        Dim ready = Js.Objs(Js.Arr(d, "readyOrders"))
        If ready.Count = 0 Then p2.Add(Empty("Nothing waiting."))
        For Each o In ready
            p2.Add(Line("#" & Js.Str(o, "number"), "", Js.Str(o, "customer") & " · " & Money0(Js.Num(o, "total")), Theme.G600, OpenOrder(page, Js.Int(o, "id"))))
        Next
        right.Add(p2)
        Dim p3 = Panel("Recent activity", "calendar-clock")
        Dim recent = Js.Objs(Js.Arr(d, "recent"))
        If recent.Count = 0 Then p3.Add(Empty("No activity yet."))
        For Each ev In recent
            Dim t = Js.Str(ev, "type")
            Dim what = If(t = "assign", "assigned to " & Js.Str(ev, "to", "nobody"), If(t = "payment", "payment " & Js.Str(ev, "to"), If(t = "placed", "placed", If(t = "note", "note: " & Js.Str(ev, "note"), Js.Str(ev, "from") & " → " & Js.Str(ev, "to")))))
            p3.Add(Line("#" & Js.Str(ev, "number"), " " & what, "", Theme.G400, OpenOrder(page, Js.Int(ev, "orderId")), Js.Str(ev, "actor") & " · " & Ago(Js.Str(ev, "at"))))
        Next
        right.Add(p3)
        row.Add(right)
        body.Add(row)
    End Sub

    ' ── Cashier ──
    Public Sub Billing(body As VStack, d As JsonObject, page As DashboardPage)
        Welcome(body, page, {("/admin/ecommerce/billing", "New sale", "receipt", True), ("/admin/ecommerce/due", "Collect due", "hand-coins", False)})
        Dim s = Js.Field(d, "stats")
        Dim g As New Columns(4, 200, 12)
        g.Add(Stat("receipt", "Counter sales today", Money0(Js.Num(s, "salesToday")), Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(5, &H96, &H69), "/admin/ecommerce/sales-history", page))
        g.Add(Stat("shopping-bag", "Bills today", Js.Int(s, "salesCount").ToString(), Color.FromArgb(&HF0, &HF9, &HFF), Color.FromArgb(2, &H84, &HC7)))
        g.Add(Stat("hand-coins", "Due collected today", Money0(Js.Num(s, "collectedToday")), Color.FromArgb(&HF5, &HF3, &HFF), Color.FromArgb(&H7C, &H3A, &HED), "/admin/ecommerce/due", page))
        g.Add(Stat("triangle-alert", "Outstanding due (" & Js.Int(s, "dueCount") & ")", Money0(Js.Num(s, "dueOutstanding")), Color.FromArgb(&HFE, &HF2, &HF2), Color.FromArgb(&HDC, &H26, &H26), "/admin/ecommerce/due", page))
        body.Add(g)
        Dim p = Panel("Recent counter sales", "receipt", "Sales history →", "/admin/ecommerce/sales-history", page)
        Dim recent = Js.Objs(Js.Arr(d, "recent"))
        If recent.Count = 0 Then p.Add(Empty("No sales yet."))
        For Each o In recent
            p.Add(Line("#" & Js.Str(o, "number"), " · " & Js.Str(o, "customer"), If(Js.Bool(o, "paid"), "Paid", "Due") & "  " & Money0(Js.Num(o, "total")) & "  " & Ago(Js.Str(o, "at")), If(Js.Bool(o, "paid"), Color.FromArgb(4, &H78, &H57), Color.FromArgb(&HB9, &H1C, &H1C)), OpenOrder(page, Js.Int(o, "id"))))
        Next
        body.Add(p)
    End Sub

    ' ── Product manager ──
    Public Sub Catalog(body As VStack, d As JsonObject, page As DashboardPage)
        Welcome(body, page, {("/admin/ecommerce/products/add", "Add product", "package-plus", True), ("/admin/ecommerce/products", "All products", "boxes", False)})
        Dim s = Js.Field(d, "stats")
        Dim g As New Columns(6, 160, 12)
        g.Add(Stat("boxes", "Products", Js.Int(s, "total").ToString(), Color.FromArgb(&HF0, &HF9, &HFF), Color.FromArgb(2, &H84, &HC7), "/admin/ecommerce/products", page))
        g.Add(Stat("store", "Live in the shop", Js.Int(s, "active").ToString(), Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(5, &H96, &H69)))
        g.Add(Stat("package-x", "Out of stock", Js.Int(s, "out").ToString(), Color.FromArgb(&HFE, &HF2, &HF2), Color.FromArgb(&HDC, &H26, &H26), "/admin/ecommerce/stock-out-products", page))
        g.Add(Stat("triangle-alert", "Low stock", Js.Int(s, "low").ToString(), Color.FromArgb(&HFF, &HFB, &HEB), Color.FromArgb(&HD9, &H77, 6), "/admin/ecommerce/stock-out-products", page))
        g.Add(Stat("image-off", "Without a photo", Js.Int(s, "noImage").ToString(), Theme.G100, Theme.G600, "/admin/ecommerce/products", page))
        g.Add(Stat("star", "Reviews to approve", Js.Int(s, "pendingReviews").ToString(), Color.FromArgb(&HF5, &HF3, &HFF), Color.FromArgb(&H7C, &H3A, &HED), "/admin/ecommerce/product-reviews", page))
        body.Add(g)
        Dim row As New Columns(2, 360, 20) With {.Stretch = False}
        Dim p1 = Panel("Needs restocking", "package-x", "Stock out →", "/admin/ecommerce/stock-out-products", page)
        Dim low = Js.Objs(Js.Arr(d, "lowStock"))
        If low.Count = 0 Then p1.Add(Empty("Everything is in stock."))
        For Each p In low
            Dim q = Js.Int(p, "stockQty")
            p1.Add(Line(Js.Str(p, "name"), "", If(q <= 0, "Out", q & " left"), If(q <= 0, Color.FromArgb(&HDC, &H26, &H26), Color.FromArgb(&HD9, &H77, 6))))
        Next
        row.Add(p1)
        Dim p2 = Panel("Recently added", "package-plus", "Add product →", "/admin/ecommerce/products/add", page)
        Dim rec = Js.Objs(Js.Arr(d, "recent"))
        If rec.Count = 0 Then p2.Add(Empty("No products yet."))
        For Each p In rec
            p2.Add(Line(Js.Str(p, "name"), "", Js.Str(p, "status"), If(Js.Str(p, "status") = "active", Color.FromArgb(5, &H96, &H69), Theme.G400)))
        Next
        row.Add(p2)
        body.Add(row)
    End Sub

    ' ── Marketing ──
    Public Sub Marketing(body As VStack, d As JsonObject, page As DashboardPage)
        Welcome(body, page, {("/admin/customizer", "Store customizer", "layout-template", True), ("/admin/ecommerce/offers", "Coupons", "badge-percent", False)})
        Dim s = Js.Field(d, "stats")
        Dim g As New Columns(4, 200, 12)
        g.Add(Stat("megaphone", "Live campaigns", Js.Int(s, "campaigns").ToString(), Color.FromArgb(&HF5, &HF3, &HFF), Color.FromArgb(&H7C, &H3A, &HED)))
        g.Add(Stat("badge-percent", "Active coupons", Js.Int(s, "coupons").ToString(), Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(5, &H96, &H69), "/admin/ecommerce/offers", page))
        g.Add(Stat("bell", "Push subscribers", Js.Int(s, "subscribers").ToString(), Color.FromArgb(&HF0, &HF9, &HFF), Color.FromArgb(2, &H84, &HC7), "/push-notifications/push-manager2", page))
        g.Add(Stat("user-plus", "New customers (7 days)", Js.Int(s, "newCustomers").ToString(), Color.FromArgb(&HFF, &HFB, &HEB), Color.FromArgb(&HD9, &H77, 6)))
        body.Add(g)
        Dim p = Panel("Coupons in use", "badge-percent", "Coupons →", "/admin/ecommerce/offers", page)
        Dim cs = Js.Objs(Js.Arr(d, "coupons"))
        If cs.Count = 0 Then p.Add(Empty("No active coupons."))
        For Each c In cs
            p.Add(Line(Js.Str(c, "code"), " · " & Js.Str(c, "title"), Js.Int(c, "usedCount") & "/" & Js.Int(c, "numberOfTimes") & " used" & If(Js.Bool(c, "isPaused"), " · paused", ""), Theme.G500))
        Next
        body.Add(p)
        Dim links As New Columns(3, 200, 12)
        For Each l In {("/admin/customizer?tab=home", "Homepage & offer bar", "layout-template"), ("/admin/customizer?tab=product", "Product page", "shopping-bag"), ("/push-notifications/push-manager2", "Send a push notification", "bell")}
            Dim href = l.Item1
            Dim b As New HeadButton(l.Item2, l.Item3) With {.Height = 56}
            AddHandler b.Click, Sub() page.Navigate(href)
            links.Add(b)
        Next
        body.Add(links)
    End Sub
End Module
