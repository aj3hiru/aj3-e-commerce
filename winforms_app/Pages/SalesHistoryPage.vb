Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Sales History" as on the website: Sales Performance (this month vs previous month by week), Key
''' Metrics (range, today, yesterday, this week, this month — each compared — and today's due collection),
''' Filter Sales and the Sales Ledger (time, order, customer, items, payment, total, paid — record a due
''' payment — and invoice). Store bills + delivered online orders over the last 15 months, offline too.</summary>
Public Class SalesHistoryPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_sales_history2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _top As New Columns(2, 520, 14) With {.Stretch = True}
    Private ReadOnly _chartCard As New CardBox("Sales Performance", ChrW(&HE9D2)) With {.Accent = Color.FromArgb(&H16, &HA3, &H4A)}
    Private ReadOnly _chart As New LineChart() With {.Height = 230, .LineColor = Color.FromArgb(&H16, &HA3, &H4A)}
    Private ReadOnly _metricsCard As New CardBox("Key Metrics", ChrW(&HE9D2)) With {.Accent = Color.FromArgb(&H16, &HA3, &H4A)}
    Private ReadOnly _tiles As New Columns(3, 180, 12)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filterCard As New CardBox(Nothing, "", 12)
    Private ReadOnly _range As New RangeBar("today,yesterday,7d,30d,this_month,prev_month,this_year,custom", "today")
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All Status", "Delivered|Delivered", "Pending|Pending", "In Progress|In Progress", "Canceled|Canceled"}, 150)
    Private ReadOnly _channel As ComboBox = Ui.Filter({"all|Store & Online", "offline|Store", "online|Online"}, 150)
    Private ReadOnly _payment As ComboBox = Ui.Filter({"all|All Payments", "paid|Paid", "due|Due", "due_cleared|Due Cleared"}, 150)
    Private ReadOnly _customer As ComboBox = Ui.Filter({"0|All Customers", "-1|Guest (no customer)"}, 230)
    Private ReadOnly _product As ComboBox = Ui.Filter({"0|All Products"}, 230)
    Private ReadOnly _list As New ListCard("sales")
    Private ReadOnly _summary As New Label With {.AutoSize = True, .Font = Theme.BodyBold, .ForeColor = Theme.G800, .BackColor = Color.White}
    Private _rows As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Sales History"
    Public Overrides ReadOnly Property PageSubtitle As String = "Every sale — store bills and delivered online orders, with payments and dues"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export}
        End Get
    End Property

    Public Sub New()
        Dim legend As New Drawn(20, Sub(g, r)
                                        Dim x = 0
                                        For Each it In {(Color.FromArgb(&H16, &HA3, &H4A), "This Month"), (Theme.Blue, "Previous Month")}
                                            Using b As New SolidBrush(it.Item1) : g.FillEllipse(b, x, 6, 8, 8) : End Using
                                            Tr.DrawText(g, it.Item2, Theme.Body, New Point(x + 14, 1), Theme.G700, TextFormatFlags.NoPadding)
                                            x += Tr.MeasureText(it.Item2, Theme.Body).Width + 34
                                        Next
                                    End Sub)
        _chartCard.Add(legend)
        _chartCard.Add(_chart)
        _top.Add(_chartCard)
        For Each m In {("sh2-m-total", "Total Sales", Theme.IcMoney, Color.FromArgb(5, &H96, &H69)), ("sh2-m-today", "Today's Sale", Theme.IcCart, Theme.Blue),
                       ("sh2-m-yesterday", "Yesterday's Sale", Theme.IcCalendar, Color.FromArgb(&H1E, &H29, &H3B)), ("sh2-m-week", "This Week's Sale", Theme.IcCalendar, Color.FromArgb(5, &H96, &H69)),
                       ("sh2-m-month", "This Month's Sale", Theme.IcCalendar, Theme.Blue), ("sh2-m-due", "Today's Due Collection", ChrW(&HE8C7), Color.FromArgb(&HF5, &H9E, &HB))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 90}
            _m(m.Item1) = ms
            _tiles.Add(ms)
        Next
        _metricsCard.Add(_tiles)
        _top.Add(_metricsCard)
        Body.Add(_top)
        Dim row As New HRow(8)
        row.Add(_range)
        For Each c In {_status, _channel, _payment, _customer, _product}
            row.Add(c)
            AddHandler c.SelectedIndexChanged, Sub()
                                                   _list.ResetPage()
                                                   Refresh_()
                                               End Sub
        Next
        _filterCard.Add(row)
        Body.Add(_filterCard)
        _list.Search.Box.PlaceholderText = "Search order, customer, product…"
        _list.AddTool(_summary)
        Body.Add(_list)
        AddHandler _range.Changed, Sub()
                                       _list.ResetPage()
                                       Refresh_()
                                   End Sub
        AddHandler _list.SearchChanged, Sub()
                                            _list.ResetPage()
                                            Refresh_()
                                        End Sub
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           For Each c In {_status, _channel, _payment, _customer, _product} : c.SelectedIndex = 0 : Next
                                       End Sub
        AddHandler _list.Table.RowClick, Sub(r) Open(r)
        AddHandler _list.Table.ActionClick, Sub(r, k)
                                                If k = "collect" Then
                                                    DueActions.Collect(Me, Js.Objs(TryCast(Js.Field(r, "_credits"), JsonArray)).Where(Function(c) Js.Num(c, "balance") > 0.004).ToList())
                                                Else
                                                    OrderActions.PrintOrder(r, Me)
                                                End If
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        BuildCols()
    End Sub

    Private Sub Open(o As JsonObject)
        If Js.Str(o, "localRef") = "" AndAlso Js.Int(o, "id") > 0 Then Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
    End Sub

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim on_ = Function(k As String) _display.IsOn("sh2-ledger", k)
        If on_("sh2-c-time") Then t.Cols.Add(New TCol("Time", Function(r) Fmt.Stamp(Js.Time(r, "createdAt")), 0) With {.Flex = 11, .Colour = Function(r) Theme.G700, .Sort = Function(r) Js.Str(r, "createdAt")})
        If on_("sh2-c-order") Then t.Cols.Add(New TCol("Order ID", Function(r) If(Js.Str(r, "localRef") <> "", "Uploading…", Js.Str(r, "number")), 0, CellKind.Link) With {.Flex = 11, .Colour = Function(r) Theme.Blue, .Sort = Function(r) Js.Str(r, "number")})
        If on_("sh2-c-customer") Then
            t.Cols.Add(New TCol("Customer", Function(r) Js.Str(r, "customer", "Walk-in Customer"), 0) With {.Flex = 14, .Colour = Function(r) Theme.G900,
                .Sub = Function(r) If(Js.Str(r, "type") = "online", "Online order", ""), .Sort = Function(r) Js.Str(r, "customer").ToLowerInvariant()})
        End If
        If on_("sh2-c-items") Then
            t.Cols.Add(New TCol("Items", Function(r)
                                             Dim l = Js.Objs(Js.Arr(r, "items"))
                                             If l.Count = 0 Then Return "—"
                                             Return l.Count & " item" & If(l.Count = 1, "", "s") & " — " & String.Join(", ", l.Select(Function(i) Fmt.Num(Js.Num(i, "qty")) & "x " & Js.Str(i, "name")))
                                         End Function, 0) With {.Flex = 22, .Colour = Function(r) Theme.G700, .Sort = Function(r) Js.Arr(r, "items").Count})
        End If
        If on_("sh2-c-payment") Then t.Cols.Add(New TCol("Payment", Function(r) Js.Str(r, "paymentMethod", "—"), 0) With {.Flex = 9}.WithSort())
        If on_("sh2-c-total") Then t.Cols.Add(New TCol("Total", Function(r) Theme.Money(Js.Num(r, "total")), 0) With {.Flex = 9, .Colour = Function(r) Theme.G900, .Sort = Function(r) Js.Num(r, "total")})
        If on_("sh2-c-paid") Then
            t.Cols.Add(New TCol("Paid", Function(r) Theme.Money(Js.Num(r, "_paid")), 0, CellKind.Bold) With {.Flex = 11, .Sort = Function(r) Js.Num(r, "_paid"),
                .Sub = Function(r) Js.Str(r, "_label")})
        End If
        Dim canCollect = AppState.I.Perm.Has("ecommerce", "manage_credits") OrElse AppState.I.Perm.Billing()
        t.Cols.Add(New TCol(If(on_("sh2-c-invoice"), "Invoice", ""), Nothing, 90, CellKind.Actions) With {
            .ButtonsFor = Function(r)
                              Dim l As New List(Of String)
                              If canCollect AndAlso Js.Objs(TryCast(Js.Field(r, "_credits"), JsonArray)).Any(Function(c) Js.Num(c, "balance") > 0.004) Then l.Add("collect")
                              If on_("sh2-c-invoice") Then l.Add("invoice")
                              Return l
                          End Function}.Btn("collect", ChrW(&HE8C7), "Record a due payment", Theme.Green).Btn("invoice", ChrW(&HE8A5), "Invoice", Theme.G600))
        t.RowHeight = 62
        t.RowClickable = True
        If t.SortCol Is Nothing OrElse Not t.Cols.Contains(t.SortCol) Then t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Header = "Time") : t.SortAsc = False
        t.EmptyText = "No sales match these filters."
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim orders = s.AllOrders()
        Dim sales = orders.Where(AddressOf AppState.IsSale).ToList()
        Dim dues = s.List("dues")
        Dim paidDues = s.PageList("dues_paid")
        Dim creditsByOrder = dues.Concat(paidDues).GroupBy(Function(d) Js.Int(d, "orderId")).ToDictionary(Function(g) g.Key, Function(g) g.ToList())

        ' key metrics
        Dim today = DateTime.Today
        Dim sum = Function(from As DateTime, [to] As DateTime) sales.Where(Function(o)
                                                                                Dim d = Js.Time(o, "createdAt")
                                                                                Return d.HasValue AndAlso d.Value.Date >= from AndAlso d.Value.Date <= [to]
                                                                            End Function).Sum(Function(o) Js.Num(o, "total"))
        Dim pct = Function(cur As Double, prev As Double) As Integer?
                      If prev <= 0 Then Return Nothing
                      Return CInt(Math.Round((cur - prev) / prev * 100))
                  End Function
        Dim weekStart = today.AddDays(-((CInt(today.DayOfWeek) + 6) Mod 7))
        Dim monthStart = New DateTime(today.Year, today.Month, 1)
        Dim prevMonthStart = monthStart.AddMonths(-1)
        Dim prevMonthSameDay = New DateTime(prevMonthStart.Year, prevMonthStart.Month, Math.Min(today.Day, DateTime.DaysInMonth(prevMonthStart.Year, prevMonthStart.Month)))
        Dim b = _range.Bounds_()
        Dim rf = If(b.Item1, today), rt = If(b.Item2, today)
        Dim rangeDays = CInt((rt - rf).TotalDays) + 1
        Dim rangeCur = sum(rf, rt), rangePrev = sum(rf.AddDays(-rangeDays), rf.AddDays(-1))
        Dim todayV = sum(today, today), yV = sum(today.AddDays(-1), today.AddDays(-1)), dbV = sum(today.AddDays(-2), today.AddDays(-2))
        Dim weekV = sum(weekStart, today), lastWeekV = sum(weekStart.AddDays(-7), today.AddDays(-7))
        Dim monthV = sum(monthStart, today), prevMonthV = sum(prevMonthStart, prevMonthSameDay)
        Dim collectedToday = dues.Concat(paidDues).SelectMany(Function(d) Js.Objs(Js.Arr(d, "payments"))).Where(Function(p) Js.Time(p, "at").HasValue AndAlso Js.Time(p, "at").Value.Date = today).Sum(Function(p) Js.Num(p, "amount"))
        Dim outstanding = dues.Sum(Function(d) Js.Num(d, "balance"))
        Dim defaultRange = _range.Current = "today"
        Dim setTile = Sub(key As String, caption As String, value As Double, change As Integer?, cmp As String, empty As String)
                          Dim m = _m(key)
                          m.Caption = caption
                          If change.HasValue Then
                              m.SetValue(Theme.Money(value), If(change.Value >= 0, "↑ ", "↓ ") & Math.Abs(change.Value) & "% " & cmp)
                              m.NoteColor = If(change.Value >= 0, Color.FromArgb(5, &H96, &H69), Color.FromArgb(&HEF, &H44, &H44))
                          Else
                              m.SetValue(Theme.Money(value), "— " & If(value > 0, "No data to compare", empty))
                              m.NoteColor = Theme.G500
                          End If
                      End Sub
        setTile("sh2-m-total", "Total Sales (" & If(defaultRange, "This Month", "Selected Range") & ")", If(defaultRange, monthV, rangeCur), If(defaultRange, pct(monthV, prevMonthV), pct(rangeCur, rangePrev)), If(defaultRange, "vs. last month", "vs. previous period"), "No sales in this range")
        setTile("sh2-m-today", "Today's Sale", todayV, pct(todayV, yV), "vs. yesterday", "No sales today")
        setTile("sh2-m-yesterday", "Yesterday's Sale", yV, pct(yV, dbV), "vs. day before", "No sales yesterday")
        setTile("sh2-m-week", "This Week's Sale", weekV, pct(weekV, lastWeekV), "vs. last week", "No sales this week")
        setTile("sh2-m-month", "This Month's Sale", monthV, pct(monthV, prevMonthV), "vs. last month", "No sales this month")
        _m("sh2-m-due").SetValue(Theme.Money(collectedToday), If(outstanding > 0.004, Theme.Money(outstanding) & " still due", "— All collected"))
        _m("sh2-m-due").NoteColor = If(outstanding > 0.004, Color.FromArgb(&HD9, &H77, 6), Theme.G500)
        _metricsCard.Subtitle = Fmt.Day(rf) & "  →  " & Fmt.Day(rt)
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("sh2-metrics", kv.Key)) : Next

        ' chart: this month vs previous month, in weeks (1–7, 8–14 …)
        Dim bucket = Function(d As Integer) Math.Min(4, (d - 1) \ 7)
        Dim thisM(4) As Double, prevM(4) As Double
        For Each o In sales
            Dim d = Js.Time(o, "createdAt")
            If Not d.HasValue Then Continue For
            If d.Value.Year = today.Year AndAlso d.Value.Month = today.Month Then thisM(bucket(d.Value.Day)) += Js.Num(o, "total")
            If d.Value.Year = prevMonthStart.Year AndAlso d.Value.Month = prevMonthStart.Month Then prevM(bucket(d.Value.Day)) += Js.Num(o, "total")
        Next
        Dim len = DateTime.DaysInMonth(today.Year, today.Month)
        _chart.Values = thisM.Take(bucket(today.Day) + 1).ToList()
        _chart.Values2 = prevM.ToList()
        _chart.Labels = Enumerable.Range(0, 5).Select(Function(k) today.ToString("MMM") & " " & (k * 7 + 1) & "–" & If(k = 4, len, k * 7 + 7)).ToList()
        _chart.Invalidate()

        ' filters
        Ui.Refill(_customer, {"0|All Customers", "-1|Guest (no customer)"}.Concat(s.List("customers").Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name") & If(Js.Str(c, "phone") <> "", " (" & Js.Str(c, "phone") & ")", ""))))
        Dim products As New Dictionary(Of Integer, String)
        For Each o In orders
            For Each i In Js.Objs(Js.Arr(o, "items")) : products(Js.Int(i, "productId")) = Js.Str(i, "name") : Next
        Next
        Ui.Refill(_product, {"0|All Products"}.Concat(products.OrderBy(Function(kv) kv.Value).Select(Function(kv) kv.Key & "|" & kv.Value)))

        ' ledger
        Dim status = Ui.Val(_status), channel = Ui.Val(_channel), payment = Ui.Val(_payment)
        Dim customer = CInt(Ui.Val(_customer)), product = CInt(Ui.Val(_product))
        Dim list As New List(Of JsonObject)
        For Each o In orders
            If Not _range.Contains(Js.Time(o, "createdAt")) Then Continue For
            If If(status = "all", Not AppState.IsSale(o), Js.Str(o, "status") <> status) Then Continue For
            If channel <> "all" AndAlso Js.Str(o, "type") <> channel Then Continue For
            If customer = -1 AndAlso Not Js.IsNull(o, "customerId") Then Continue For
            If customer > 0 AndAlso Js.Int(o, "customerId") <> customer Then Continue For
            If product <> 0 AndAlso Not Js.Objs(Js.Arr(o, "items")).Any(Function(i) Js.Int(i, "productId") = product) Then Continue For
            If Not _list.Matches(Js.Str(o, "number") & " " & Js.Str(o, "customer") & " " & String.Join(" ", Js.Objs(Js.Arr(o, "items")).Select(Function(i) Js.Str(i, "name")))) Then Continue For
            Dim credits As List(Of JsonObject) = Nothing
            If Not creditsByOrder.TryGetValue(Js.Int(o, "id"), credits) Then credits = New List(Of JsonObject)
            Dim due = credits.Where(Function(c) Js.Num(c, "balance") > 0.004).Sum(Function(c) Js.Num(c, "balance"))
            Dim label = If(due > 0.004, "Due", If(credits.Count > 0, "Due Cleared", "Paid"))
            If payment = "paid" AndAlso label <> "Paid" Then Continue For
            If payment = "due" AndAlso label <> "Due" Then Continue For
            If payment = "due_cleared" AndAlso label <> "Due Cleared" Then Continue For
            Dim r = TryCast(Js.Copy(o), JsonObject)
            r("_due") = due
            r("_paid") = Math.Max(0, Js.Num(o, "total") - due)
            r("_label") = label
            Dim ca As New JsonArray()
            For Each c In credits : ca.Add(Js.Copy(c)) : Next
            r("_credits") = ca
            list.Add(r)
        Next
        _rows = list
        Dim filtersOn = status <> "all" OrElse channel <> "all" OrElse payment <> "all" OrElse customer <> 0 OrElse product <> 0
        _list.SetRows(list, orders.Where(Function(o) _range.Contains(Js.Time(o, "createdAt")) AndAlso AppState.IsSale(o)).Count(), filtersOn)
        _summary.Text = list.Count & " sales · Total " & Theme.Money(list.Sum(Function(r) Js.Num(r, "total")))

        Kit.Show(_chartCard, _display.Item("sh2-chart"))
        Kit.Show(_metricsCard, _display.IsOn("sh2-metrics"))
        Kit.Show(_top, _display.Item("sh2-chart") OrElse _display.IsOn("sh2-metrics"))
        Kit.Show(_filterCard, _display.Item("sh2-filters"))
        Kit.Show(_list, _display.IsOn("sh2-ledger"))
    End Sub

    Private Sub DoExport()
        Export.Csv(Me, "Sales " & _range.Text_, {"Time", "Order", "Customer", "Channel", "Items", "Payment", "Total", "Paid", "Due", "Status"},
                   _rows.Select(Function(r) CType({Fmt.Stamp(Js.Time(r, "createdAt")), Js.Str(r, "number"), Js.Str(r, "customer"), If(Js.Str(r, "type") = "online", "Online", "Store"),
                        String.Join(", ", Js.Objs(Js.Arr(r, "items")).Select(Function(i) Js.Str(i, "qty") & "x " & Js.Str(i, "name"))), Js.Str(r, "paymentMethod"),
                        CObj(Js.Num(r, "total")), CObj(Js.Num(r, "_paid")), CObj(Js.Num(r, "_due")), Js.Str(r, "_label")}, IEnumerable(Of Object))))
    End Sub
End Class
