Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"All Orders" as on the website: date range, status tabs, number cards, search + filters, tick boxes
''' with bulk actions (accept new ones / assign &amp; send out), the orders table (payment / status / agent right in
''' the row, Accept / Reject for new ones), items pop-up, Export — from the data on this computer.</summary>
Public Class OrdersPage
    Inherits ScrollPage

    Private Shared ReadOnly Statuses As String() = {"Pending", "In Progress", "Out for Delivery", "Delivered", "Canceled"}
    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_orders2_display")
    Private ReadOnly _channel As ComboBox = Ui.Filter({"online|Online orders", "offline|In-store bills", "all|All orders"}, 150)
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _top As New Card() With {.Padding = New Padding(12, 10, 12, 0)}
    Private ReadOnly _range As New RangeBar("today,yesterday,7d,30d,this_month,prev_month,this_year,all,custom", "this_month")
    Private ReadOnly _tabs As New Tabs("all|All", "Pending|Pending", "In Progress|In Progress", "Out for Delivery|Out for Delivery", "Delivered|Delivered", "Canceled|Canceled")
    Private ReadOnly _cards As New Columns(4, 210, 14)
    Private ReadOnly _metrics As New Dictionary(Of String, MiniStat)
    Private ReadOnly _list As New ListCard("orders")
    Private ReadOnly _pay As ComboBox = Ui.Filter({"all|Paid and unpaid", "Paid|Paid", "Unpaid|Unpaid"}, 160)
    Private ReadOnly _method As ComboBox = Ui.Filter({"all|All methods"}, 160)
    Private ReadOnly _product As ComboBox = Ui.Filter({"0|All products"}, 220)
    Private ReadOnly _agent As ComboBox = Ui.Filter({"0|All agents", "-1|Not assigned"}, 160)
    Private ReadOnly _dues As ComboBox = Ui.Filter({"all|All orders", "with|Money still owed", "without|Nothing owed"}, 160)
    Private ReadOnly _summary As New Label With {.AutoSize = True, .Font = Theme.Body, .ForeColor = Theme.G600, .BackColor = Color.White}
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String
        Get
            Return If(Ui.Val(_channel) = "offline", "In-store Bills", "All Orders")
        End Get
    End Property
    Public Overrides ReadOnly Property PageSubtitle As String
        Get
            Return If(Ui.Val(_channel) = "offline", "Bills made at the counter, with their payment", "Online orders from the shop, with their status and payment")
        End Get
    End Property
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_channel, _display.Button, _export}
        End Get
    End Property

    Public Sub New()
        _top.Controls.Add(_range)
        _top.Controls.Add(_tabs)
        AddHandler _top.Layout, Sub()
                                    Dim y = 10
                                    If Kit.WantsVisible(_range) Then _range.SetBounds(12, y, _top.Width - 24, 36) : y += 46
                                    If Kit.WantsVisible(_tabs) Then _tabs.SetBounds(12, y, _top.Width - 24, 42)
                                End Sub
        Body.Add(_top)
        For Each m In {("or2-k-total", "All Orders", ChrW(&HE7BF), Theme.Blue), ("or2-k-today", "Today's Orders", Theme.IcClock, Theme.Primary),
                       ("or2-k-unpaid", "Unpaid", ChrW(&HE8C7), Color.FromArgb(&HEF, &H44, &H44)), ("or2-k-value", "Order Value", Theme.IcMoney, Color.FromArgb(&H16, &HA3, &H4A)),
                       ("or2-k-pending", "Pending", Theme.IcClock, Fmt.Yellow), ("or2-k-in-progress", "In Progress", Theme.IcPackage, Color.FromArgb(&H3B, &H82, &HF6)),
                       ("or2-k-out-for-delivery", "Out for Delivery", Theme.IcTruck, Color.FromArgb(&HE, &HA5, &HE9)), ("or2-k-delivered", "Delivered", Theme.IcDone, Theme.Green)}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 90}
            Dim key = m.Item1
            If key.StartsWith("or2-k-") AndAlso Not {"or2-k-total", "or2-k-today", "or2-k-unpaid", "or2-k-value"}.Contains(key) Then
                ms.Cursor = Cursors.Hand
                Dim st = m.Item2
                AddHandler ms.Click, Sub()
                                         _tabs.Current = st
                                         _tabs.Invalidate()
                                         _list.ResetPage()
                                         Refresh_()
                                     End Sub
            End If
            _metrics(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _list.Selectable = True
        _list.BulkItems.AddRange({"accept|Accept new ones", "assign|Assign & send out…"})
        _list.Search.Box.PlaceholderText = "Search order, name, phone, product…"
        _list.Search.Width = 300
        For Each c In {_pay, _method, _product, _agent, _dues}
            _list.AddTool(c)
            AddHandler c.SelectedIndexChanged, Sub()
                                                   _list.ResetPage()
                                                   Refresh_()
                                               End Sub
        Next
        Body.Add(_list)
        _list.AddTool(_summary)
        AddHandler _list.SearchChanged, Sub()
                                            _list.ResetPage()
                                            Refresh_()
                                        End Sub
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           For Each c In {_pay, _method, _product, _agent, _dues} : c.SelectedIndex = 0 : Next
                                           Refresh_()
                                       End Sub
        AddHandler _list.Bulk, AddressOf Bulk
        AddHandler _list.Table.RowClick, AddressOf Open
        AddHandler _list.Table.CellClick, AddressOf CellClick
        AddHandler _list.Table.ActionClick, AddressOf RowAction
        AddHandler _range.Changed, Sub()
                                       _list.ResetPage()
                                       Refresh_()
                                   End Sub
        AddHandler _tabs.Changed, Sub()
                                      _list.ResetPage()
                                      Refresh_()
                                  End Sub
        AddHandler _channel.SelectedIndexChanged, Sub()
                                                      _list.ResetPage()
                                                      Refresh_()
                                                      HeaderChanged()
                                                  End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        BuildCols()
    End Sub

    ''' <summary>Open with a status tab (from the dashboard's cards).</summary>
    Public Sub ShowTab(tab As String)
        _tabs.Current = tab
        Ui.SetVal(_channel, "online")
        If tab <> "Delivered" AndAlso tab <> "Canceled" AndAlso tab <> "all" Then _range.Current = "all"
        _range.Invalidate() : _tabs.Invalidate()
        Refresh_()
    End Sub

    Private Function D(k As String) As Boolean
        Return _display.IsOn("or2-details", k)
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim on_ = Function(k As String) _display.IsOn("or2-table", k)
        _list.Selectable = on_("or2-c-select") AndAlso AppState.I.Perm.OrdersView()
        _list.ShowSearch = on_("or2-t-search")
        If on_("or2-c-order") Then
            t.Cols.Add(New TCol("Order", Function(o) If(Js.Str(o, "localRef") <> "", "Uploading…", Js.Str(o, "number")), 0, CellKind.Link) With {
                .Flex = 13, .Sub = Function(o) If(D("or2-d-date"), Fmt.Stamp(Js.Time(o, "createdAt")), ""), .Colour = Function(o) Theme.Blue,
                .Sort = Function(o) Js.Str(o, "createdAt")})
        End If
        If on_("or2-c-customer") Then
            t.Cols.Add(New TCol("Customer", Function(o) Js.Str(o, "customer"), 0, CellKind.Bold) With {
                .Flex = 14, .Sub = Function(o) If(D("or2-d-phone"), If(Js.Str(o, "phone") <> "", Js.Str(o, "phone"), Js.Str(o, "email", "No contact")), ""),
                .Sort = Function(o) Js.Str(o, "customer").ToLowerInvariant()})
        End If
        If on_("or2-c-items") Then
            t.Cols.Add(New TCol("Items", Function(o)
                                             Dim n = Js.Arr(o, "items").Count
                                             Return n & " item" & If(n = 1, "", "s")
                                         End Function, 0, CellKind.Link) With {
                .Flex = 9, .Key = "items", .Colour = Function(o) Theme.G800,
                .Sub = Function(o) If(D("or2-d-itemname") AndAlso Js.Arr(o, "items").Count > 0, Js.Str(Js.Arr(o, "items")(0), "name"), "")})
        End If
        If on_("or2-c-total") Then
            t.Cols.Add(New TCol("Total", Function(o) Theme.Money(Js.Num(o, "total")), 0, CellKind.Money) With {
                .Flex = 10, .Sub = Function(o) If(D("or2-d-due") AndAlso OrderActions.DueOf(o) > 0.004, Theme.Money(OrderActions.DueOf(o)) & " due", ""),
                .Sort = Function(o) Js.Num(o, "total")})
        End If
        If on_("or2-c-payment") Then
            t.Cols.Add(New TCol("Payment", Function(o) If(Js.Str(o, "paymentStatus") = "Paid", "Paid", "Unpaid"), 0, CellKind.PillMenu) With {
                .Flex = 12, .Key = "payment", .Colour = Function(o) If(Js.Str(o, "paymentStatus") = "Paid", Theme.Green, Theme.Grey),
                .Sub = Function(o) If(D("or2-d-method"), OrderActions.MethodLabel(Js.Str(o, "paymentMethod")), "")})
        End If
        If on_("or2-c-status") Then
            t.Cols.Add(New TCol("Status", Function(o) Js.Str(o, "status"), 0, CellKind.PillMenu) With {
                .Flex = 14, .Key = "status", .Colour = Function(o) StatusDot(Js.Str(o, "status")),
                .Sub = Function(o) If(Not Js.IsNull(o, "agentId") AndAlso D("or2-d-agentline"), "🛵 " & OrderActions.AgentName(Js.Int(o, "agentId")), ""),
                .Sort = Function(o) Js.Str(o, "status")})
        End If
        If on_("or2-c-agent") AndAlso AppState.I.Perm.Has("orders", "assign_delivery") AndAlso AppState.I.List("agents").Count > 0 Then
            t.Cols.Add(New TCol("Delivery agent", Function(o)
                                                      Dim n = OrderActions.AgentName(Js.Int(o, "agentId"))
                                                      Dim st = Js.Str(o, "status")
                                                      If st = "Delivered" OrElse st = "Canceled" OrElse Js.Str(o, "type") <> "online" Then Return If(n = "", "—", n)
                                                      Return If(n = "", "Assign agent… ▾", n & " ▾")
                                                  End Function, 0, CellKind.Link) With {.Flex = 12, .Key = "agent", .Colour = Function(o) If(Js.IsNull(o, "agentId"), Theme.Blue, Theme.G700)})
        End If
        If on_("or2-c-actions") Then
            t.Cols.Add(New TCol("Actions", Nothing, 150, CellKind.Actions) With {
                .ButtonsFor = Function(o)
                                  Dim l As New List(Of String) From {"view", "print"}
                                  If Js.Str(o, "status") = "Pending" AndAlso D("or2-d-decide") AndAlso Js.Str(o, "type") = "online" AndAlso AppState.I.Perm.OrdersView() Then l.InsertRange(0, {"accept", "reject"})
                                  Return l
                              End Function}.Btn("accept", Theme.IcCheck, "Accept", Theme.Green).Btn("reject", Theme.IcCancel, "Reject", Theme.Danger).Btn("view", ChrW(&HE890), "View order", Color.FromArgb(&HE, &HA5, &HE9)).Btn("print", Theme.IcPrint, "Print invoice", Theme.Grey))
        End If
        t.RowHeight = If(D("or2-d-compact"), 56, 64)
        t.RowClickable = True
        t.RowColour = Function(o) If(D("or2-d-highlight") AndAlso Js.Str(o, "status") = "Pending", Color.FromArgb(&HFF, &HFB, &HEB), Color.Empty)
        If t.SortCol Is Nothing OrElse Not t.Cols.Contains(t.SortCol) Then
            t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Header = "Order")
            t.SortAsc = False
        End If
        t.EmptyText = "No orders here."
    End Sub

    Private Shared Function StatusDot(st As String) As Color
        Select Case st
            Case "Pending" : Return Fmt.Yellow
            Case "In Progress" : Return Color.FromArgb(&H3B, &H82, &HF6)
            Case "Out for Delivery" : Return Color.FromArgb(&HE, &HA5, &HE9)
            Case "Delivered" : Return Theme.Green
            Case "Canceled" : Return Color.FromArgb(&HEF, &H44, &H44)
            Case Else : Return Theme.Grey
        End Select
    End Function

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim ch = Ui.Val(_channel)
        Dim all = s.List("orders")
        Dim inRange = all.Where(Function(o) (ch = "all" OrElse Js.Str(o, "type") = ch) AndAlso (_range.Current = "all" OrElse _range.Contains(Js.Time(o, "createdAt")))).ToList()
        Dim tab = _tabs.Current
        Dim count = Function(st As String) If(st = "all", inRange.Count, inRange.Where(Function(o) Js.Str(o, "status") = st).Count())
        _tabs.Counts("all") = count("all")
        For Each st In Statuses : _tabs.Counts(st) = count(st) : Next
        _tabs.Invalidate()

        ' filter choices from the data
        Dim methods = all.Select(Function(o) Js.Str(o, "paymentMethod")).Where(Function(m) m <> "").Distinct().OrderBy(Function(m) m).ToList()
        Ui.Refill(_method, {"all|All methods"}.Concat(methods.Select(Function(m) m & "|" & OrderActions.MethodLabel(m))))
        Dim productCounts As New Dictionary(Of Integer, (Name As String, N As Integer))
        For Each o In inRange
            For Each it In Js.Objs(Js.Arr(o, "items")).GroupBy(Function(i) Js.Int(i, "productId"))
                Dim had As (String, Integer) = Nothing
                If productCounts.TryGetValue(it.Key, had) Then productCounts(it.Key) = (had.Item1, had.Item2 + 1) Else productCounts(it.Key) = (Js.Str(it.First(), "name"), 1)
            Next
        Next
        Ui.Refill(_product, {"0|All products"}.Concat(productCounts.OrderByDescending(Function(k) k.Value.N).Select(Function(k) k.Key & "|" & k.Value.Name & " (" & k.Value.N & ")")))
        Dim agents = s.List("agents")
        Ui.Refill(_agent, {"0|All agents", "-1|Not assigned"}.Concat(agents.Select(Function(a) Js.Int(a, "id") & "|" & Js.Str(a, "name"))))
        Dim canAssign = s.Perm.Has("orders", "assign_delivery") AndAlso agents.Count > 0
        Dim fOn = Function(k As String) _display.IsOn("or2-filters", k)
        Kit.Show(_pay, fOn("or2-f-payment")) : Kit.Show(_method, fOn("or2-f-method")) : Kit.Show(_product, fOn("or2-f-product"))
        Kit.Show(_agent, fOn("or2-f-agent") AndAlso canAssign) : Kit.Show(_dues, fOn("or2-f-dues"))

        Dim pay = Ui.Val(_pay), method = Ui.Val(_method), dues = Ui.Val(_dues)
        Dim product = CInt(Ui.Val(_product)), agent = CInt(Ui.Val(_agent))
        Dim words = _list.Query.Split(" "c, StringSplitOptions.RemoveEmptyEntries)
        Dim list = inRange.Where(Function(o)
                                     If tab <> "all" AndAlso Js.Str(o, "status") <> tab Then Return False
                                     If pay = "Paid" AndAlso Js.Str(o, "paymentStatus") <> "Paid" Then Return False
                                     If pay = "Unpaid" AndAlso Js.Str(o, "paymentStatus") = "Paid" Then Return False
                                     If method <> "all" AndAlso Js.Str(o, "paymentMethod") <> method Then Return False
                                     If dues = "with" AndAlso OrderActions.DueOf(o) <= 0.004 Then Return False
                                     If dues = "without" AndAlso OrderActions.DueOf(o) > 0.004 Then Return False
                                     If agent = -1 AndAlso Not Js.IsNull(o, "agentId") Then Return False
                                     If agent > 0 AndAlso Js.Int(o, "agentId") <> agent Then Return False
                                     If product <> 0 AndAlso Not Js.Objs(Js.Arr(o, "items")).Any(Function(i) Js.Int(i, "productId") = product) Then Return False
                                     If words.Length = 0 Then Return True
                                     Dim hay = (Js.Str(o, "number") & " " & Js.Str(o, "customer") & " " & Js.Str(o, "phone") & " " & Js.Str(o, "email") & " " & Js.Str(o, "address") & " " & String.Join(" ", Js.Objs(Js.Arr(o, "items")).Select(Function(i) Js.Str(i, "name")))).ToLowerInvariant()
                                     Return words.All(Function(w) hay.Contains(w))
                                 End Function).ToList()
        _shown = list
        Dim tabTotal = inRange.Where(Function(o) tab = "all" OrElse Js.Str(o, "status") = tab).Count()
        Dim filtersOn = pay <> "all" OrElse method <> "all" OrElse dues <> "all" OrElse product <> 0 OrElse agent <> 0
        _list.SetRows(list, tabTotal, filtersOn)
        _summary.Text = If(list.Count = 0, "", "Value " & Theme.Money(list.Sum(Function(o) Js.Num(o, "total"))))
        Kit.Show(_summary, _display.Item("or2-summary") AndAlso list.Count > 0)

        ' number cards
        Dim sum = Function(l As IEnumerable(Of JsonObject)) l.Sum(Function(o) Js.Num(o, "total"))
        Dim today = inRange.Where(Function(o) Js.Time(o, "createdAt").HasValue AndAlso Js.Time(o, "createdAt").Value.Date = DateTime.Today).ToList()
        Dim unpaid = inRange.Where(Function(o) Js.Str(o, "paymentStatus") <> "Paid" AndAlso Js.Str(o, "status") <> "Canceled").ToList()
        Dim cardOn = Function(k As String) _display.IsOn("or2-cards", k)
        _metrics("or2-k-total").Caption = If(tab = "all", "All Orders", tab & " Orders")
        _metrics("or2-k-total").SetValue(count(tab).ToString("#,##0"), Theme.Money(sum(If(tab = "all", inRange, inRange.Where(Function(o) Js.Str(o, "status") = tab)))) & " in this range")
        _metrics("or2-k-today").SetValue(today.Count.ToString("#,##0"), Theme.Money(sum(today)))
        _metrics("or2-k-unpaid").SetValue(unpaid.Count.ToString("#,##0"), Theme.Money(unpaid.Sum(Function(o) OrderActions.DueOf(o))) & " not collected")
        _metrics("or2-k-value").SetValue(Theme.Money(sum(inRange)), _range.Text_)
        For Each st In Statuses.Take(4)
            Dim k = "or2-k-" & st.ToLowerInvariant().Replace(" ", "-")
            _metrics(k).SetValue(count(st).ToString("#,##0"), Theme.Money(sum(inRange.Where(Function(o) Js.Str(o, "status") = st))))
        Next
        For Each kv In _metrics : Kit.Show(kv.Value, _display.IsOn("or2-cards") AndAlso cardOn(kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("or2-cards"))
        Kit.Show(_range, _display.Item("or2-range"))
        Kit.Show(_tabs, _display.Item("or2-tabs"))
        _top.Height = 10 + If(_display.Item("or2-range"), 46, 0) + If(_display.Item("or2-tabs"), 42, 0)
        Kit.Show(_top, _display.Item("or2-range") OrElse _display.Item("or2-tabs"))
        Kit.Show(_list, _display.IsOn("or2-table"))
    End Sub

    Private Sub Open(o As JsonObject)
        If Js.Str(o, "localRef") <> "" Then Toast("This bill is still uploading — open it in a moment.") : Return
        Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
    End Sub

    Private Sub CellClick(o As JsonObject, c As TCol, cell As Rectangle)
        Dim at = New Point(cell.X + 10, cell.Bottom - 8)
        Select Case c.Key
            Case "payment" : OrderActions.PaymentMenu(o, at, Me)
            Case "status" : OrderActions.StatusMenu(o, at, Me)
            Case "agent" : OrderActions.AgentMenu(o, at, Me)
            Case "items" : ItemsDialog(o)
            Case Else : Open(o)
        End Select
    End Sub

    Private Sub RowAction(o As JsonObject, key As String)
        Select Case key
            Case "view" : Open(o)
            Case "print" : OrderActions.PrintOrder(o, Me)
            Case "accept" : OrderActions.Accept(o, Me)
            Case "reject" : OrderActions.Reject(o, Me)
        End Select
    End Sub

    Private Sub ItemsDialog(o As JsonObject)
        Dim f As New FormDialog(Js.Str(o, "number") & " — " & Js.Str(o, "customer"), 560, "Open full order")
        Dim due = OrderActions.DueOf(o)
        f.AddNote("Placed: " & Fmt.Stamp(Js.Time(o, "createdAt")) & "     Total: " & Theme.Money(Js.Num(o, "total")) & "     Paid: " & Theme.Money(Js.Num(o, "total") - due) & If(due > 0.004, "     Due: " & Theme.Money(due), ""), Theme.G700)
        Dim t As New WebTable() With {.RowHeight = 48}
        t.Cols.Add(New TCol("Item", Function(i) Js.Str(i, "name"), 0, CellKind.Bold) With {.Sub = Function(i) Fmt.Num(Js.Num(i, "qty")) & " × " & Theme.Money(Js.Num(i, "price"))})
        t.Cols.Add(New TCol("Amount", Function(i) Theme.Money(Js.Num(i, "qty") * Js.Num(i, "price")), 130, CellKind.Money) With {.Right = True})
        t.Rows = Js.Objs(Js.Arr(o, "items"))
        f.AddControl(t)
        If Js.Str(o, "address") <> "" Then f.AddNote("Ships to: " & Js.Str(o, "address"))
        If f.ShowDialog(FindForm()) = DialogResult.OK Then Open(o)
    End Sub

    Private Sub Bulk(key As String, rows As List(Of JsonObject))
        Dim n = 0
        If key = "accept" Then
            For Each o In rows.Where(Function(x) Js.Str(x, "status") = "Pending" AndAlso Js.Int(x, "id") > 0)
                OrderActions.Accept(o)
                n += 1
            Next
            Toast(n & " order" & If(n = 1, "", "s") & " accepted.")
        Else
            Dim agents = AppState.I.List("agents")
            If agents.Count = 0 Then Toast("No delivery agents yet.", True) : Return
            Dim f As New FormDialog("Assign & send out " & rows.Count & " order(s)", 420, "Assign")
            f.AddPick("agent", "Delivery agent", agents.Select(Function(a) Js.Int(a, "id") & "|" & Js.Str(a, "name")))
            If f.ShowDialog(FindForm()) <> DialogResult.OK Then Return
            Dim ag = agents.First(Function(a) Js.Int(a, "id").ToString() = f.Val("agent"))
            For Each o In rows.Where(Function(x) Js.Str(x, "status") <> "Delivered" AndAlso Js.Str(x, "status") <> "Canceled" AndAlso Js.Int(x, "id") > 0)
                OrderActions.Assign(o, ag)
                n += 1
            Next
            Toast(n & " order" & If(n = 1, "", "s") & " sent out with " & Js.Str(ag, "name") & ".")
        End If
        _list.Table.Selected.Clear()
        Refresh_()
    End Sub

    Private Sub DoExport()
        If _shown.Count = 0 Then Toast("There are no orders to export.", True) : Return
        Export.Csv(Me, "Orders", {"Order", "Date", "Customer", "Phone", "Email", "Items", "Total", "Paid", "Due", "Payment", "Method", "Status", "Address", "Products"},
                   _shown.Select(Function(o) CType({Js.Str(o, "number"), Fmt.Stamp(Js.Time(o, "createdAt")), Js.Str(o, "customer"), Js.Str(o, "phone"), Js.Str(o, "email"),
                        CObj(Js.Arr(o, "items").Count), CObj(Js.Num(o, "total")), CObj(Js.Num(o, "total") - OrderActions.DueOf(o)), CObj(OrderActions.DueOf(o)), Js.Str(o, "paymentStatus"),
                        Js.Str(o, "paymentMethod"), Js.Str(o, "status"), Js.Str(o, "address"), String.Join(" | ", Js.Objs(Js.Arr(o, "items")).Select(Function(i) Js.Str(i, "name") & " x" & Js.Str(i, "qty")))}, IEnumerable(Of Object))))
    End Sub
End Class
