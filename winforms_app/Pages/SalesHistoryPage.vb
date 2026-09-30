Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Sales History — a port of the website's SalesHistory2Body.tsx: Sales Performance (this month vs previous
''' month by week), Key Metrics, Filter Sales (range presets, status / store-online / payment / customer / product,
''' from–to + Apply) and the Sales Ledger (Show N entries, Search, sortable columns, Due → record a payment, invoice
''' and its due-payment receipts, "Showing 1 to N of M entries | Total · Due", pages). From the data on this computer.</summary>
Public Class SalesHistoryPage
    Inherits ScrollPage

    Private Const Paisa As Double = 0.004
    Private Shared ReadOnly Green As Color = Color.FromArgb(&H16, &HA3, &H4A)

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_sales_history2_display")
    Private ReadOnly _export As New HeadButton("Export", "download")
    Private ReadOnly _newSale As New HeadButton("New Sale", "plus", Web.Blue)
    Private ReadOnly _top As New Columns(2, 760, 20) With {.Stretch = True, .Weights = {100, 118}}
    Private ReadOnly _chartCard As New IconCard("trending-up", "Sales Performance", Green)
    Private ReadOnly _chart As New SalesPerfChart()
    Private ReadOnly _metricsCard As New IconCard("bar-chart-3", "Key Metrics", Green)
    Private ReadOnly _tiles As New Columns(3, 200, 12)
    Private ReadOnly _m As New Dictionary(Of String, KeyTile)
    Private ReadOnly _noTiles As New Drawn(60, Sub(g, r) Tr.DrawText(g, "All metrics are hidden — turn them on from Display Options.", Theme.Px(14), r, Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter))
    Private ReadOnly _filterCard As New CardBox(Nothing, "", 12)
    Private ReadOnly _filters As New SalesFilterBar()
    Private ReadOnly _ledger As New CardBox(Nothing, "", 20)
    Private ReadOnly _tools As New ToolRow()
    Private ReadOnly _perPage As ComboBox = Ui.Filter({"10|10", "20|20", "50|50", "100|100", "0|All"}, 88)
    Private ReadOnly _search As New SearchField("", 220)
    Private ReadOnly _table As New WebTable() With {.Modern = True, .Ledger = True, .HeadHeight = 42, .RowHeight = 54}
    Private ReadOnly _foot As New LedgerFooter()
    Private _all As New List(Of JsonObject)      ' after the filters (the website's server-side rows)
    Private _shown As New List(Of JsonObject)    ' after the search, sorted
    Private _page As Integer = 1
    Private _sortKey As String = "time", _sortDesc As Boolean = True

    Public Overrides ReadOnly Property PageTitle As String = "Sales History"
    Public Overrides ReadOnly Property PageSubtitle As String = "Every completed sale — in-store and online — in one place"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export, _newSale}
        End Get
    End Property

    Private Function Show(k As String) As Boolean
        Return Not _display.Hidden.Contains(k)
    End Function

    Public Sub New()
        _chartCard.Legend = {(Green, "This Month"), (Web.Blue, "Previous Month")}
        _chartCard.Add(_chart)
        _top.Add(_chartCard)
        For Each m In {("sh2-m-total", "indian-rupee", "green"), ("sh2-m-today", "shopping-cart", "blue"), ("sh2-m-yesterday", "calendar-days", "navy"),
                       ("sh2-m-week", "calendar-range", "green"), ("sh2-m-month", "calendar-days", "blue"), ("sh2-m-due", "wallet", "amber")}
            _m(m.Item1) = _tiles.Add(New KeyTile(m.Item2, m.Item3))
        Next
        AddHandler _m("sh2-m-due").SubClick, Sub() Main?.Pick("/admin/ecommerce/due")
        _metricsCard.Add(_tiles)
        _metricsCard.Add(_noTiles)
        _top.Add(_metricsCard)
        Body.Add(_top)
        _filterCard.Add(_filters)
        Body.Add(_filterCard)

        Ui.SetVal(_perPage, "20")
        _perPage.ItemHeight = 28
        Dim showLbl = Lbl("Show"), entriesLbl = Lbl("entries")
        _tools.Left.AddRange({showLbl, _perPage, entriesLbl})
        Dim right As New Panel With {.BackColor = Color.White, .Width = 220 + 8 + Tr.MeasureText("Search:", Theme.Px(14)).Width + 2, .Height = 36}
        Dim searchLbl = Lbl("Search:")
        right.Controls.AddRange(New Control() {searchLbl, _search})
        AddHandler right.Layout, Sub()
                                     searchLbl.SetBounds(0, 0, searchLbl.Width, 36)
                                     _search.SetBounds(right.Width - 220, 0, 220, 36)
                                 End Sub
        _tools.Right = right
        _ledger.Add(_tools)
        _ledger.Add(_table)
        _ledger.Add(_foot)
        Body.Add(_ledger)

        AddHandler _filters.Changed, Sub() Refresh_(True)
        AddHandler _search.Changed, Sub() Refresh_(True)
        AddHandler _perPage.SelectedIndexChanged, Sub() Refresh_(True)
        AddHandler _foot.Pager.PageChanged, Sub()
                                                _page = _foot.Pager.Page
                                                Refresh_()
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        AddHandler _newSale.Click, Sub() Main?.Pick("/admin/ecommerce/billing")
        AddHandler _table.SortChanged, Sub()
                                           Dim k = CStr(_table.SortCol?.Key)
                                           ' a new column starts newest / largest first for time, total and paid (as on the website)
                                           If k <> _sortKey Then _sortDesc = k = "time" OrElse k = "total" OrElse k = "paid" Else _sortDesc = Not _table.SortAsc
                                           _sortKey = k
                                           Refresh_(True)
                                       End Sub
        AddHandler _table.CellClickAt, AddressOf CellClick
        _table.HotSpot = Function(o, c, cell, pt) Spots(o, c, cell).Any(Function(s) s.R.Contains(pt))
        BuildCols()
    End Sub

    Private Shared Function Lbl(text As String) As Label
        Return New Label With {.Text = text, .AutoSize = False, .Font = Theme.Px(14), .ForeColor = Theme.G800, .BackColor = Color.White,
                               .TextAlign = ContentAlignment.MiddleLeft, .Width = Tr.MeasureText(text, Theme.Px(14)).Width + 2, .Height = 36}
    End Function

    Private Overloads Sub Refresh_(Optional firstPage As Boolean = False)
        If firstPage Then _page = 1
        MyBase.Refresh_()
    End Sub

    ' ── ledger columns (fixed widths as on the website; Items takes what is left) ──
    Private Sub BuildCols()
        Dim t = _table
        t.Cols.Clear()
        Dim col = Function(k As String) Show("sh2-ledger") AndAlso Show(k)
        If col("sh2-c-time") Then t.Cols.Add(New TCol("Time", Nothing, 118, CellKind.Custom) With {.Key = "time", .Sort = Function(o) Js.Str(o, "createdAt"), .Draw = AddressOf DrawTime})
        If col("sh2-c-order") Then t.Cols.Add(New TCol("Order ID", Nothing, 136, CellKind.Custom) With {.Key = "order", .Sort = Function(o) Js.Str(o, "number"), .Draw = AddressOf DrawOrder})
        If col("sh2-c-customer") Then t.Cols.Add(New TCol("Customer", Nothing, 180, CellKind.Custom) With {.Key = "customer", .Sort = Function(o) Js.Str(o, "_customer").ToLowerInvariant(), .Draw = AddressOf DrawCustomer})
        If col("sh2-c-items") Then t.Cols.Add(New TCol("Items", Nothing, 0, CellKind.Custom) With {.Key = "items", .Sort = Function(o) Js.Arr(o, "items").Count, .Draw = AddressOf DrawItems})
        If col("sh2-c-payment") Then t.Cols.Add(New TCol("Payment", Nothing, 112, CellKind.Custom) With {.Key = "payment", .Sort = Function(o) Js.Str(o, "paymentMethod").ToLowerInvariant(), .Draw = AddressOf DrawPayment})
        If col("sh2-c-total") Then t.Cols.Add(New TCol("Total", Nothing, 122, CellKind.Custom) With {.Key = "total", .Sort = Function(o) Js.Num(o, "total"), .Draw = AddressOf DrawTotal})
        If col("sh2-c-paid") Then t.Cols.Add(New TCol("Paid", Nothing, 136, CellKind.Custom) With {.Key = "paid", .Sort = Function(o) Js.Num(o, "_paid"), .Draw = AddressOf DrawPaid})
        If col("sh2-c-invoice") Then t.Cols.Add(New TCol("Invoice", Nothing, 88, CellKind.Custom) With {.Key = "invoice", .Draw = AddressOf DrawInvoice})
        t.RowClickable = False
        t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Key = _sortKey)
        t.SortAsc = Not _sortDesc
    End Sub

    ' ── the data ──
    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim orders = s.AllOrders()
        Dim sales = orders.Where(AddressOf AppState.IsSale).ToList()
        Dim dues = s.List("dues")
        Dim credits = dues.Concat(s.PageList("dues_paid")).ToList()
        Dim creditsByOrder = credits.GroupBy(Function(d) Js.Int(d, "orderId")).ToDictionary(Function(g) g.Key, Function(g) g.ToList())
        Dim day = Function(o As JsonObject) Fmt.IstDay(Js.Time(o, "createdAt"))

        ' Key Metrics (always over every sale, in India days — as on the website)
        Dim today = Fmt.IstToday()
        Dim sum = Function(a As Date, b As Date) Math.Round(sales.Where(Function(o)
                                                                           Dim d = day(o)
                                                                           Return d >= a AndAlso d <= b
                                                                       End Function).Sum(Function(o) Js.Num(o, "total")), 2)
        Dim pct = Function(now_ As Double, prev As Double) As Integer?
                      If prev <= 0 Then Return Nothing
                      Return CInt(Math.Round((now_ - prev) / prev * 100, MidpointRounding.AwayFromZero))
                  End Function
        Dim from = _filters.From, [to] = _filters.To
        Dim weekStart = today.AddDays(-((CInt(today.DayOfWeek) + 6) Mod 7))
        Dim monthStart = New Date(today.Year, today.Month, 1)
        Dim prevMonthStart = monthStart.AddMonths(-1)
        Dim prevSameDay = New Date(prevMonthStart.Year, prevMonthStart.Month, Math.Min(today.Day, Date.DaysInMonth(prevMonthStart.Year, prevMonthStart.Month)))
        Dim rangeDays = CInt(([to] - from).TotalDays) + 1
        Dim rangeCur = sum(from, [to]), rangePrev = sum(from.AddDays(-rangeDays), from.AddDays(-1))
        Dim todayV = sum(today, today), yV = sum(today.AddDays(-1), today.AddDays(-1)), dbV = sum(today.AddDays(-2), today.AddDays(-2))
        Dim weekV = sum(weekStart, today), lastWeekV = sum(weekStart.AddDays(-7), today.AddDays(-7))
        Dim monthV = sum(monthStart, today), prevMonthV = sum(prevMonthStart, prevSameDay)
        Dim isDefault = from = monthStart AndAlso [to] = today
        _m("sh2-m-total").SetMetric("Total Sales (" & If(isDefault, "This Month", "Selected Range") & ")", If(isDefault, monthV, rangeCur),
                                    If(isDefault, pct(monthV, prevMonthV), pct(rangeCur, rangePrev)), If(isDefault, "vs. last month", "vs. previous period"), "No sales in this range")
        _m("sh2-m-today").SetMetric("Today's Sale", todayV, pct(todayV, yV), "vs. yesterday", "No sales today")
        _m("sh2-m-yesterday").SetMetric("Yesterday's Sale", yV, pct(yV, dbV), "vs. day before", "No sales yesterday")
        _m("sh2-m-week").SetMetric("This Week's Sale", weekV, pct(weekV, lastWeekV), "vs. last week", "No sales this week")
        _m("sh2-m-month").SetMetric("This Month's Sale", monthV, pct(monthV, prevMonthV), "vs. last month", "No sales this month")
        Dim collected = credits.SelectMany(Function(d) Js.Objs(Js.Arr(d, "payments"))).Where(Function(p) Fmt.IstDay(Js.Time(p, "at")) = today).Sum(Function(p) Js.Num(p, "amount"))
        Dim outstanding = dues.Sum(Function(d) Js.Num(d, "balance"))
        _m("sh2-m-due").SetDue(collected, outstanding)
        _metricsCard.Chip = (from.ToString("dd/MM/yyyy"), [to].ToString("dd/MM/yyyy"))
        Dim anyTile = False
        For Each kv In _m
            Kit.Show(kv.Value, Show(kv.Key))
            anyTile = anyTile OrElse Show(kv.Key)
        Next
        Kit.Show(_tiles, anyTile)
        Kit.Show(_noTiles, Not anyTile)

        ' Sales Performance: this month vs previous month, by day-of-month week (1–7 … 29–end)
        Dim bucket = Function(d As Integer) Math.Min(4, (d - 1) \ 7)
        Dim thisM(4) As Double, prevM(4) As Double
        For Each o In sales
            Dim d = day(o)
            If d.Year = today.Year AndAlso d.Month = today.Month Then thisM(bucket(d.Day)) += Js.Num(o, "total")
            If d.Year = prevMonthStart.Year AndAlso d.Month = prevMonthStart.Month Then prevM(bucket(d.Day)) += Js.Num(o, "total")
        Next
        Dim len = Date.DaysInMonth(today.Year, today.Month)
        Dim cur = bucket(today.Day)
        _chart.Labels = Enumerable.Range(0, 5).Select(Function(k) today.ToString("MMM", Globalization.CultureInfo.InvariantCulture) & " " & (k * 7 + 1) & "–" & If(k = 4, len, k * 7 + 7)).ToArray()
        _chart.ThisMonth = Enumerable.Range(0, 5).Select(Function(k) If(k <= cur, CType(Math.Round(thisM(k), 2), Double?), Nothing)).ToArray()
        _chart.PrevMonth = prevM.Select(Function(v) Math.Round(v, 2)).ToArray()
        _chart.ThisName = today.ToString("MMMM", Globalization.CultureInfo.InvariantCulture)
        _chart.PrevName = prevMonthStart.ToString("MMMM", Globalization.CultureInfo.InvariantCulture)
        _chart.Invalidate()

        ' filter choices
        _filters.SetCustomers(s.List("customers").OrderBy(Function(c) Js.Str(c, "name")).Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name") & If(Js.Str(c, "phone") <> "", " (" & Js.Str(c, "phone") & ")", "")))
        _filters.SetProducts(s.List("products").OrderBy(Function(p) Js.Str(p, "name")).Select(Function(p) Js.Int(p, "id") & "|" & Js.Str(p, "name")))

        ' the filtered sales (what the website's server returns)
        Dim status = _filters.Status, channel = _filters.Channel, payment = _filters.Payment, customer = _filters.Customer, product = _filters.Product
        Dim list As New List(Of JsonObject)
        For Each o In orders
            Dim d = day(o)
            If d < from OrElse d > [to] Then Continue For
            If If(status = "all", Not AppState.IsSale(o), Js.Str(o, "status") <> status) Then Continue For
            If channel <> "all" AndAlso Js.Str(o, "type") <> channel Then Continue For
            If customer = "guest" AndAlso Not Js.IsNull(o, "customerId") Then Continue For
            If customer <> "" AndAlso customer <> "guest" AndAlso Js.Int(o, "customerId").ToString() <> customer Then Continue For
            If product <> "" AndAlso Not Js.Objs(Js.Arr(o, "items")).Any(Function(i) Js.Int(i, "productId").ToString() = product) Then Continue For
            Dim cr As List(Of JsonObject) = Nothing
            If Not creditsByOrder.TryGetValue(Js.Int(o, "id"), cr) Then cr = New List(Of JsonObject)
            Dim due = Math.Round(cr.Sum(Function(c) Math.Max(0, Js.Num(c, "balance"))), 2)
            Dim label = If(due > Paisa, "Due", If(cr.Count > 0, "Due Cleared", "Paid"))
            If payment = "paid" AndAlso label <> "Paid" Then Continue For
            If payment = "due" AndAlso label <> "Due" Then Continue For
            If payment = "due_cleared" AndAlso label <> "Due Cleared" Then Continue For
            Dim r = TryCast(Js.Copy(o), JsonObject)
            Dim items = Js.Objs(Js.Arr(o, "items"))
            r("_customer") = If(Js.Str(o, "customer") <> "", Js.Str(o, "customer"), If(Js.Bool(o, "guest"), "Guest", "Walk-in Customer"))
            r("_items") = If(items.Count = 0, "—", items.Count & " item" & If(items.Count = 1, "", "s") & " — " & String.Join(", ", items.Select(Function(i) Fmt.Num(Js.Num(i, "qty")) & "x " & Js.Str(i, "name"))))
            r("_due") = due
            r("_paid") = Math.Max(0, Math.Round(Js.Num(o, "total") - due, 2))
            r("_label") = label
            Dim ca As New JsonArray()
            For Each c In cr.Where(Function(x) Js.Num(x, "balance") > Paisa) : ca.Add(Js.Copy(c)) : Next
            r("_open") = ca
            ' due-payment receipts on this sale (one line per receipt number)
            Dim rc As New JsonArray()
            For Each g In cr.SelectMany(Function(c) Js.Objs(Js.Arr(c, "payments"))).Where(Function(p) Js.Str(p, "receipt") <> "").GroupBy(Function(p) Js.Str(p, "receipt"))
                rc.Add(New JsonObject From {{"receipt", g.Key}, {"amount", g.Sum(Function(p) Js.Num(p, "amount"))}})
            Next
            r("_receipts") = rc
            list.Add(r)
        Next
        _all = list

        ' search + sort (in the ledger, as on the website)
        Dim term = _search.Text.Trim().ToLowerInvariant()
        Dim shown = If(term = "", list, list.Where(Function(r) {Js.Str(r, "number"), Js.Str(r, "_customer"), Js.Str(r, "_items"), Js.Str(r, "paymentMethod"), Theme.Money(Js.Num(r, "total"))}.Any(Function(v) v.ToLowerInvariant().Contains(term))).ToList())
        Dim key As Func(Of JsonObject, IComparable) = _table.Cols.FirstOrDefault(Function(c) c.Key = _sortKey)?.Sort
        If key Is Nothing Then key = Function(o) Js.Str(o, "createdAt")
        _shown = If(_sortDesc, shown.OrderByDescending(key), shown.OrderBy(key)).ToList()

        ' page
        Dim size = CInt(Ui.Val(_perPage))
        Dim pages = If(size = 0, 1, Math.Max(1, CInt(Math.Ceiling(_shown.Count / size))))
        _page = Math.Min(_page, pages)
        Dim start = If(size = 0, 0, (_page - 1) * size)
        Dim pageRows = If(size = 0, _shown, _shown.Skip(start).Take(size).ToList())
        _table.Rows = pageRows
        _table.MinRows = 10
        _table.EmptyText = If(list.Count = 0, "No sales match these filters.", "No sales match your search.")
        _table.Invalidate()
        _foot.Text_ = If(_shown.Count = 0, "Showing 0 entries", "Showing " & (start + 1) & " to " & (start + pageRows.Count) & " of " & _shown.Count & " entries") &
                      If(_shown.Count <> list.Count, " (filtered from " & list.Count & " total entries)", "")
        _foot.Total = Theme.Money(_shown.Sum(Function(r) Js.Num(r, "total")))
        Dim dueSum = _shown.Sum(Function(r) Js.Num(r, "_due"))
        _foot.Due = If(dueSum > Paisa, Theme.Money(dueSum), "")
        _foot.Pager.PageCount = pages
        _foot.Pager.Page = _page
        _foot.Pager.Visible = pages > 1
        _foot.Invalidate()
        _foot.PerformLayout()

        ' Display Options
        Kit.Show(_chartCard, Show("sh2-chart"))
        Kit.Show(_metricsCard, Show("sh2-metrics"))
        Kit.Show(_top, Show("sh2-chart") OrElse Show("sh2-metrics"))
        Kit.Show(_filterCard, Show("sh2-filters"))
        Kit.Show(_ledger, Show("sh2-ledger"))
        Kit.Show(_table, _table.Cols.Count > 0)
        _table.EmptyText = If(_table.Cols.Count = 0, "All ledger columns are hidden — turn them on from Display Options.", _table.EmptyText)
    End Sub

    ' ── cells ──
    Private ReadOnly _f13 As Font = Theme.Px(13)
    Private ReadOnly _f11 As Font = Theme.Px(11)
    Private ReadOnly _f12b As Font = Theme.Px(12, 600)
    Private Const TF As TextFormatFlags = TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or TextFormatFlags.SingleLine
    Private Shared ReadOnly Ist As New Globalization.CultureInfo("en-US")

    Private Sub DrawTime(g As Graphics, c As Rectangle, o As JsonObject)
        Dim t = Fmt.ToIst(Js.Time(o, "createdAt").GetValueOrDefault())
        Dim y = c.Y + (c.Height - 35) \ 2
        Tr.DrawText(g, t.ToString("hh:mm tt", Ist), _f13, New Rectangle(c.X, y, c.Width, 18), Theme.G900, TF)
        Tr.DrawText(g, t.ToString("dd MMM yyyy", Ist), _f11, New Rectangle(c.X, y + 19, c.Width, 16), Theme.G500, TF)
    End Sub

    Private Function OrderText(o As JsonObject) As String
        Return If(Js.Str(o, "localRef") <> "", "Uploading…", Js.Str(o, "number"))
    End Function

    Private Sub DrawOrder(g As Graphics, c As Rectangle, o As JsonObject)
        Tr.DrawText(g, OrderText(o), _f13, c, Web.Blue, TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Function CustomerTop(o As JsonObject, c As Rectangle) As Integer
        Return c.Y + (c.Height - If(Js.Str(o, "type") = "online", 34, 18)) \ 2
    End Function

    Private Sub DrawCustomer(g As Graphics, c As Rectangle, o As JsonObject)
        Dim y = CustomerTop(o, c)
        Tr.DrawText(g, Js.Str(o, "_customer"), _f13, New Rectangle(c.X, y, c.Width, 18), If(Js.IsNull(o, "customerId"), Theme.G900, Web.Blue), TF)
        If Js.Str(o, "type") = "online" Then Icons.Draw(g, "globe", New RectangleF(c.X, y + 21, 12, 12), Web.Blue)
    End Sub

    Private Sub DrawItems(g As Graphics, c As Rectangle, o As JsonObject)
        Tr.DrawText(g, Js.Str(o, "_items"), _f13, c, Theme.G700, TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Sub DrawPayment(g As Graphics, c As Rectangle, o As JsonObject)
        Tr.DrawText(g, Js.Str(o, "paymentMethod"), _f13, c, Theme.G800, TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Sub DrawTotal(g As Graphics, c As Rectangle, o As JsonObject)
        Tr.DrawText(g, Theme.Money(Js.Num(o, "total")), _f13, c, Theme.G900, TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Function DueRect(o As JsonObject, c As Rectangle) As Rectangle
        If Js.Num(o, "_due") <= Paisa Then Return Rectangle.Empty
        Return New Rectangle(c.X, c.Y + (c.Height - 36) \ 2 + 20, Tr.MeasureText("Due " & Theme.Money(Js.Num(o, "_due")), _f12b).Width + 2, 16)
    End Function

    Private Sub DrawPaid(g As Graphics, c As Rectangle, o As JsonObject)
        Dim due = Js.Num(o, "_due") > Paisa
        Dim y = c.Y + (c.Height - If(due, 36, 18)) \ 2
        Tr.DrawText(g, Theme.Money(Js.Num(o, "_paid")), _f13, New Rectangle(c.X, y, c.Width, 18), Theme.G900, TF)
        If due Then
            Dim r = DueRect(o, c)
            Tr.DrawText(g, "Due " & Theme.Money(Js.Num(o, "_due")), _f12b, r, If(r.Contains(_table.HoverPoint), Color.FromArgb(&HB9, &H1C, &H1C), Color.FromArgb(&HDC, &H26, &H26)), TF)
        End If
    End Sub

    Private Function InvoiceRect(o As JsonObject, c As Rectangle) As Rectangle
        Dim n = Js.Arr(o, "_receipts").Count
        Dim w = If(n = 0, 28, 6 + 14 + 4 + Tr.MeasureText("×" & (n + 1), Theme.Px(11, 600)).Width + 6)
        Return New Rectangle(c.X, c.Y + (c.Height - 28) \ 2, w, 28)
    End Function

    Private Sub DrawInvoice(g As Graphics, c As Rectangle, o As JsonObject)
        Dim r = InvoiceRect(o, c)
        Dim n = Js.Arr(o, "_receipts").Count
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
            Using b As New SolidBrush(If(r.Contains(_table.HoverPoint), Color.FromArgb(&H9D, &H9F, &HAB), Web.PillSecondary)) : g.FillPath(b, p) : End Using
        End Using
        If n = 0 Then
            Icons.Draw(g, "file-text", New RectangleF(r.X + 7, r.Y + 7, 14, 14), Color.White)
        Else
            Icons.Draw(g, "file-text", New RectangleF(r.X + 6, r.Y + 7, 14, 14), Color.White)
            Tr.DrawText(g, "×" & (n + 1), Theme.Px(11, 600), New Rectangle(r.X + 24, r.Y, r.Width - 24, r.Height), Color.White, TextFormatFlags.VerticalCenter Or TF)
        End If
    End Sub

    Private Function Spots(o As JsonObject, col As TCol, c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim l As New List(Of (String, Rectangle))
        Select Case col.Key
            Case "order"
                l.Add(("order", New Rectangle(c.X, c.Y + (c.Height - 18) \ 2, Math.Min(c.Width, Tr.MeasureText(OrderText(o), _f13).Width + 2), 18)))
            Case "customer"
                If Not Js.IsNull(o, "customerId") Then l.Add(("customer", New Rectangle(c.X, CustomerTop(o, c), Math.Min(c.Width, Tr.MeasureText(Js.Str(o, "_customer"), _f13).Width + 2), 18)))
            Case "paid"
                Dim r = DueRect(o, c)
                If Not r.IsEmpty AndAlso CanCollect Then l.Add(("due", r))
            Case "invoice"
                l.Add(("invoice", InvoiceRect(o, c)))
        End Select
        Return l
    End Function

    Private ReadOnly Property CanCollect As Boolean
        Get
            Return AppState.I.Perm.Has("ecommerce", "manage_credits") OrElse AppState.I.Perm.Billing()
        End Get
    End Property

    Private Sub CellClick(o As JsonObject, col As TCol, cell As Rectangle, pt As Point)
        Dim hit = Spots(o, col, cell).FirstOrDefault(Function(s) s.R.Contains(pt))
        If hit.Key Is Nothing Then Return
        Select Case hit.Key
            Case "order"
                If Js.Str(o, "localRef") <> "" Then Toast("This sale is still uploading — open it in a moment.") : Return
                Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
            Case "customer" : Main?.Push(New CustomerProfilePage(Js.Int(o, "customerId")))
            Case "due" : DueActions.Collect(Me, Js.Objs(TryCast(Js.Field(o, "_open"), JsonArray)).ToList())
            Case "invoice"
                Dim receipts = Js.Objs(Js.Arr(o, "_receipts"))
                If receipts.Count = 0 Then OrderActions.PrintOrder(o, Me, True) : Return
                Dim items As New List(Of String) From {"invoice|Invoice  ·  " & Theme.Money(Js.Num(o, "total")) & "|file-text", "-"}
                For Each rc In receipts : items.Add("r:" & Js.Str(rc, "receipt") & "|" & Js.Str(rc, "receipt") & "  ·  " & Theme.Money(Js.Num(rc, "amount")) & "|receipt") : Next
                WebMenu.Show(_table, items, Sub(k)
                                                If k = "invoice" Then
                                                    OrderActions.PrintOrder(o, Me, True)
                                                Else
                                                    Ui.OpenUrl(AppState.I.Api.Server & "/admin/ecommerce/payment-receipt/" & Uri.EscapeDataString(k.Substring(2)))
                                                End If
                                            End Sub, _table.PointToScreen(New Point(hit.R.X, hit.R.Bottom + 4)))
        End Select
    End Sub

    ' ── Export: exactly the sales the ledger has (same filters and search) ──
    Private Sub DoExport()
        If _shown.Count = 0 Then Toast("There are no sales to export.", True) : Return
        Export.Csv(Me, "sales-" & _filters.From.ToString("yyyy-MM-dd") & "-to-" & _filters.To.ToString("yyyy-MM-dd"),
                   {"Date", "Time", "Order ID", "Customer", "Channel", "Items", "Payment Method", "Total", "Paid", "Due", "Payment Status", "Order Status"},
                   _shown.Select(Function(r)
                                     Dim t = Fmt.ToIst(Js.Time(r, "createdAt").GetValueOrDefault())
                                     Return CType({t.ToString("dd MMM yyyy", Ist), t.ToString("hh:mm tt", Ist), Js.Str(r, "number"), Js.Str(r, "_customer"), If(Js.Str(r, "type") = "online", "Online", "Store"),
                                                   Js.Str(r, "_items"), Js.Str(r, "paymentMethod"), CObj(Js.Num(r, "total").ToString("0.00")), CObj(Js.Num(r, "_paid").ToString("0.00")),
                                                   CObj(Js.Num(r, "_due").ToString("0.00")), Js.Str(r, "_label"), Js.Str(r, "status")}, IEnumerable(Of Object))
                                 End Function))
    End Sub
End Class

''' <summary>A website card: lucide icon + 16px title, optional legend or a date chip on the right.</summary>
Public Class IconCard
    Inherits CardBox
    Private ReadOnly _icon As String, _title As String, _ink As Color
    Public Legend As (Color, String)()
    Public Chip As (String, String)
    Private ReadOnly _tf As Font = Theme.Px(16, 600)
    Private ReadOnly _lf As Font = Theme.Px(13)
    Public Sub New(icon As String, title As String, ink As Color)
        MyBase.New(title, "", 20)
        _icon = icon : _title = title : _ink = ink
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Title = ""
        MyBase.OnPaint(e)
        Title = _title
        Dim g = e.Graphics
        Theme.Smooth(g)
        Dim x = Padding.Left, y = Padding.Top
        Icons.Draw(g, _icon, New RectangleF(x, y + 7, 20, 20), _ink)
        Tr.DrawText(g, _title, _tf, New Rectangle(x + 30, y, Width \ 2, 34), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        Dim right = Width - Padding.Right
        If Legend IsNot Nothing Then
            For Each it In Legend.Reverse()
                Dim w = Tr.MeasureText(it.Item2, _lf).Width
                right -= w
                Tr.DrawText(g, it.Item2, _lf, New Rectangle(right, y, w + 4, 34), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                right -= 16
                Using b As New SolidBrush(it.Item1) : g.FillEllipse(b, right, y + 13, 8, 8) : End Using
                right -= 20
            Next
        End If
        If Chip.Item1 IsNot Nothing Then
            Dim w1 = Tr.MeasureText(Chip.Item1, _lf).Width, w2 = Tr.MeasureText(Chip.Item2, _lf).Width
            Dim w = 12 + 14 + 8 + w1 + 8 + 14 + 8 + w2 + 12
            Dim r As New Rectangle(right - w, y + 3, w, 30)
            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                Using b As New SolidBrush(Theme.G50) : g.FillPath(b, p) : End Using
            End Using
            Dim cx = r.X + 12
            Icons.Draw(g, "calendar-days", New RectangleF(cx, r.Y + 8, 14, 14), Theme.G500) : cx += 22
            Tr.DrawText(g, Chip.Item1, _lf, New Rectangle(cx, r.Y, w1 + 4, 30), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding) : cx += w1 + 8
            Icons.Draw(g, "arrow-right", New RectangleF(cx, r.Y + 8, 14, 14), Theme.G400) : cx += 22
            Tr.DrawText(g, Chip.Item2, _lf, New Rectangle(cx, r.Y, w2 + 4, 30), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        End If
    End Sub
End Class

''' <summary>A Key Metrics tile: round coloured icon, label, big coloured amount and the comparison line.</summary>
Public Class KeyTile
    Inherits Control
    Public Event SubClick()
    Private ReadOnly _icon As String
    Private ReadOnly _bg As Color, _ink As Color
    Private _label As String = "", _value As String = "", _sub As String = "", _subInk As Color = Theme.G500, _arrow As String = ""
    Private _link As Boolean, _hover As Boolean
    Private ReadOnly _lf As Font = Theme.Px(12), _vf As Font = Theme.Px(20, 700)

    Public Sub New(icon As String, tone As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _icon = icon
        Select Case tone
            Case "green" : _bg = Color.FromArgb(5, &H96, &H69) : _ink = _bg
            Case "blue" : _bg = Web.Blue : _ink = Web.Blue
            Case "navy" : _bg = Web.Blue : _ink = Color.FromArgb(&H1E, &H29, &H3B)
            Case Else : _bg = Color.FromArgb(&HFB, &HBF, &H24) : _ink = Color.FromArgb(&HF5, &H9E, &HB)
        End Select
        Height = 96
    End Sub

    Public Sub SetMetric(label As String, value As Double, change As Integer?, cmp As String, empty As String)
        _label = label : _value = Theme.Money(value) : _link = False
        If change.HasValue Then
            _arrow = If(change.Value >= 0, "arrow-up", "arrow-down")
            _sub = Math.Abs(change.Value) & "% " & cmp
            _subInk = If(change.Value >= 0, Color.FromArgb(5, &H96, &H69), Color.FromArgb(&HEF, &H44, &H44))
        Else
            _arrow = "" : _sub = "— " & If(value > 0, "No data to compare", empty) : _subInk = Theme.G500
        End If
        Invalidate()
    End Sub

    Public Sub SetDue(collected As Double, outstanding As Double)
        _label = "Today's Due Collection" : _value = Theme.Money(collected) : _arrow = ""
        _link = outstanding > 0.004
        _sub = If(_link, Theme.Money(outstanding) & " still due", "— All collected")
        _subInk = If(_link, Color.FromArgb(&HD9, &H77, 6), Theme.G500)
        Invalidate()
    End Sub

    Private Function SubRect() As Rectangle
        Return New Rectangle(56, 64, Tr.MeasureText(_sub, _lf).Width + If(_arrow = "", 0, 16), 18)
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim h = _link AndAlso SubRect().Contains(e.Location)
        Cursor = If(h, Cursors.Hand, Cursors.Default)
    End Sub
    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        If _link AndAlso SubRect().Contains(e.Location) Then RaiseEvent SubClick()
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G100) : g.DrawPath(pen, p) : End Using
        End Using
        Using b As New SolidBrush(_bg) : g.FillEllipse(b, 14, 14, 32, 32) : End Using
        Icons.Draw(g, _icon, New RectangleF(22, 22, 16, 16), Color.White)
        Dim w = Width - 56 - 12
        Tr.DrawText(g, _label, _lf, New Rectangle(56, 12, w, 20), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, _value, _vf, New Rectangle(56, 32, w, 32), _ink, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Dim x = 56
        If _arrow <> "" Then Icons.Draw(g, _arrow, New RectangleF(x, 67, 12, 12), _subInk) : x += 16
        Tr.DrawText(g, _sub, _lf, New Rectangle(x, 64, Width - x - 12, 18), _subInk, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class

''' <summary>This month (green) vs previous month (blue): smooth monotone lines with soft fills, round dots, a ₹ axis
''' and a tooltip for the week under the mouse — the website's Sales Performance chart.</summary>
Public Class SalesPerfChart
    Inherits Control
    Public Labels As String() = {}
    Public ThisMonth As Double?() = {}
    Public PrevMonth As Double() = {}
    Public ThisName As String = "", PrevName As String = ""
    Private _hover As Integer = -1
    Private Shared ReadOnly Green As Color = Color.FromArgb(&H16, &HA3, &H4A)
    Private ReadOnly _af As Font = Theme.Px(11), _xf As Font = Theme.Px(12), _tf As Font = Theme.Px(12), _tb As Font = Theme.Px(12, 600)

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Height = 200
    End Sub

    Private Shared Function NiceMax(v As Double) As Double
        If v <= 0 Then Return 1000
        Dim p = Math.Pow(10, Math.Floor(Math.Log10(v)))
        For Each m In {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10}
            If m * p >= v Then Return m * p
        Next
        Return 10 * p
    End Function

    Private Shared Function AxisMoney(n As Double) As String
        Return "₹" & Math.Round(n).ToString("#,##,##0", New Globalization.CultureInfo("en-IN"))
    End Function

    ''' <summary>Fritsch–Carlson monotone cubic: never overshoots its points (no dips below ₹0).</summary>
    Private Shared Function Smooth(pts As List(Of PointF)) As GraphicsPath
        Dim gp As New GraphicsPath()
        Dim n = pts.Count
        If n < 2 Then Return gp
        If n = 2 Then gp.AddLine(pts(0), pts(1)) : Return gp
        Dim slope(n - 2) As Double
        For i = 0 To n - 2 : slope(i) = (pts(i + 1).Y - pts(i).Y) / (pts(i + 1).X - pts(i).X) : Next
        Dim m(n - 1) As Double
        For i = 0 To n - 1
            m(i) = If(i = 0, slope(0), If(i = n - 1, slope(n - 2), If(slope(i - 1) * slope(i) <= 0, 0, (slope(i - 1) + slope(i)) / 2)))
        Next
        For i = 0 To n - 2
            If slope(i) = 0 Then m(i) = 0 : m(i + 1) = 0 : Continue For
            Dim a = m(i) / slope(i), b = m(i + 1) / slope(i)
            Dim h = a * a + b * b
            If h > 9 Then
                Dim t = 3 / Math.Sqrt(h)
                m(i) = t * a * slope(i) : m(i + 1) = t * b * slope(i)
            End If
        Next
        For i = 0 To n - 2
            Dim hx = (pts(i + 1).X - pts(i).X) / 3.0F
            gp.AddBezier(pts(i), New PointF(pts(i).X + hx, CSng(pts(i).Y + m(i) * hx)), New PointF(pts(i + 1).X - hx, CSng(pts(i + 1).Y - m(i + 1) * hx)), pts(i + 1))
        Next
        Return gp
    End Function

    Private Function Plot() As RectangleF
        Dim mx = NiceMax(Math.Max(0, Math.Max(If(PrevMonth.Length = 0, 0, PrevMonth.Max()), ThisMonth.Select(Function(v) v.GetValueOrDefault()).DefaultIfEmpty(0).Max())))
        Dim aw = Tr.MeasureText(AxisMoney(mx), _af).Width + 12
        Return New RectangleF(aw, 6, Width - aw - 2, Height - 6 - 24)
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim p = Plot()
        Dim n = Labels.Length
        Dim h = If(n = 0 OrElse e.X < p.Left OrElse e.X > p.Right, -1, Math.Min(n - 1, CInt(Math.Floor((e.X - p.Left) / (p.Width / n)))))
        If h <> _hover Then _hover = h : Invalidate()
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = -1 : Invalidate()
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Dim n = Labels.Length
        If n = 0 Then Return
        Dim mx = NiceMax(Math.Max(0, Math.Max(If(PrevMonth.Length = 0, 0, PrevMonth.Max()), ThisMonth.Select(Function(v) v.GetValueOrDefault()).DefaultIfEmpty(0).Max())))
        Dim p = Plot()
        ' grid + axis
        For i = 0 To 4
            Dim y = p.Top + p.Height * i / 4.0F
            Using pen As New Pen(Theme.G100) With {.DashStyle = DashStyle.Dash} : g.DrawLine(pen, p.Left, y, p.Right, y) : End Using
            Dim t = AxisMoney(mx * (4 - i) / 4)
            Dim tw = Tr.MeasureText(t, _af).Width
            Tr.DrawText(g, t, _af, New Point(CInt(p.Left - 12 - tw), CInt(y - 7)), If(i = 4, Theme.G300, Theme.G500), TextFormatFlags.NoPadding)
        Next
        Dim px = Function(i As Integer) p.Left + CSng((i + 0.5) / n * p.Width)
        Dim py = Function(v As Double) p.Top + CSng(p.Height - v / mx * p.Height)
        Dim prev = Enumerable.Range(0, PrevMonth.Length).Select(Function(i) New PointF(px(i), py(PrevMonth(i)))).ToList()
        Dim cur = Enumerable.Range(0, ThisMonth.Length).Where(Function(i) ThisMonth(i).HasValue).Select(Function(i) New PointF(px(i), py(ThisMonth(i).Value))).ToList()
        For Each s In {(prev, Web.Blue, 30), (cur, Green, 40)}
            If s.Item1.Count < 2 Then Continue For
            Using area = Smooth(s.Item1)
                area.AddLine(s.Item1.Last(), New PointF(s.Item1.Last().X, p.Bottom))
                area.AddLine(New PointF(s.Item1.Last().X, p.Bottom), New PointF(s.Item1(0).X, p.Bottom))
                area.CloseFigure()
                Using b As New LinearGradientBrush(New RectangleF(p.Left, p.Top - 1, p.Width, p.Height + 2), Color.FromArgb(s.Item3, s.Item2), Color.FromArgb(0, s.Item2), LinearGradientMode.Vertical)
                    g.FillPath(b, area)
                End Using
            End Using
        Next
        For Each s In {(prev, Web.Blue), (cur, Green)}
            If s.Item1.Count >= 2 Then
                Using line = Smooth(s.Item1), pen As New Pen(s.Item2, 2) : g.DrawPath(pen, line) : End Using
            End If
            For Each pt In s.Item1
                Using b As New SolidBrush(s.Item2) : g.FillEllipse(b, pt.X - 5, pt.Y - 5, 10, 10) : End Using
                Using pen As New Pen(Color.White, 2) : g.DrawEllipse(pen, pt.X - 4, pt.Y - 4, 8, 8) : End Using
            Next
        Next
        ' x labels
        For i = 0 To n - 1
            Dim cw = p.Width / n
            Tr.DrawText(g, Labels(i), _xf, New Rectangle(CInt(p.Left + i * cw), CInt(p.Bottom + 4), CInt(cw), 20), Theme.G500, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
        Next
        If PrevMonth.All(Function(v) v = 0) AndAlso ThisMonth.All(Function(v) v.GetValueOrDefault() = 0) Then
            Tr.DrawText(g, "No sales in these two months yet", Theme.Px(14), Rectangle.Round(p), Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
        End If
        ' hover: line + tooltip
        If _hover >= 0 AndAlso _hover < n Then
            Dim x = px(_hover)
            Using pen As New Pen(Theme.G200) : g.DrawLine(pen, x, p.Top, x, p.Bottom) : End Using
            Dim l1 = ThisName & ": ", v1 = If(_hover < ThisMonth.Length AndAlso ThisMonth(_hover).HasValue, Theme.Money(ThisMonth(_hover).Value), "—")
            Dim l2 = PrevName & ": ", v2 = If(_hover < PrevMonth.Length, Theme.Money(PrevMonth(_hover)), "—")
            Dim w = 24 + Math.Max(Tr.MeasureText(Labels(_hover), _tb).Width, 16 + Math.Max(Tr.MeasureText(l1, _tf).Width + Tr.MeasureText(v1, _tb).Width, Tr.MeasureText(l2, _tf).Width + Tr.MeasureText(v2, _tb).Width))
            Dim r As New Rectangle(CInt(If(_hover >= n - 2, x - 8 - w, x + 8)), CInt(p.Top + 4), w, 66)
            Using path = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                Using b As New SolidBrush(Color.White) : g.FillPath(b, path) : End Using
                Using pen As New Pen(Theme.G200) : g.DrawPath(pen, path) : End Using
            End Using
            Tr.DrawText(g, Labels(_hover), _tb, New Point(r.X + 12, r.Y + 8), Theme.G900, TextFormatFlags.NoPadding)
            For Each it In {(r.Y + 28, Green, l1, v1), (r.Y + 46, Web.Blue, l2, v2)}
                Using b As New SolidBrush(it.Item2) : g.FillEllipse(b, r.X + 12, it.Item1 + 4, 8, 8) : End Using
                Tr.DrawText(g, it.Item3, _tf, New Point(r.X + 28, it.Item1), Theme.G600, TextFormatFlags.NoPadding)
                Tr.DrawText(g, it.Item4, _tb, New Point(r.X + 28 + Tr.MeasureText(it.Item3, _tf).Width, it.Item1), Theme.G900, TextFormatFlags.NoPadding)
            Next
        End If
    End Sub
End Class

''' <summary>Filter Sales in one row: the range buttons (Today … Previous Month), Order Status / Store-Online / Payment /
''' Customer / Product (apply at once), then from – to dates with Apply. Wraps when the window is narrow.</summary>
Public Class SalesFilterBar
    Inherits Control
    Implements IFlowHeight
    Public Event Changed()
    Public From As Date = Fmt.IstToday()
    Public [To] As Date = Fmt.IstToday()
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All Status", "Delivered|Delivered", "Pending|Pending", "In Progress|In Progress", "Canceled|Canceled"}, 150)
    Private ReadOnly _channel As ComboBox = Ui.Filter({"all|Store & Online", "offline|Store", "online|Online"}, 150)
    Private ReadOnly _payment As ComboBox = Ui.Filter({"all|All Payments", "paid|Paid", "due|Due", "due_cleared|Due Cleared"}, 150)
    Private ReadOnly _customer As ComboBox = Ui.Filter({"|All Customers", "guest|Guest (no customer)"}, 150)
    Private ReadOnly _product As ComboBox = Ui.Filter({"|All Products"}, 150)
    Private ReadOnly _from As New DateBox()
    Private ReadOnly _to As New DateBox()
    Private ReadOnly _apply As New HeadButton("Apply", "", Color.FromArgb(&H6C, &H75, &H7D)) With {.Height = 31}
    Private _btns As New List(Of (Key As String, R As Rectangle))
    Private _hover As String = ""
    Private _lastH As Integer = 31
    Private ReadOnly _bf As Font = Theme.Px(13)
    Private Const RowH As Integer = 31, DateW As Integer = 132

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = RowH
        For Each c In Combos()
            c.Font = _bf
            CType(c, ComboBox).ItemHeight = 25
            Controls.Add(c)
            AddHandler c.SelectedIndexChanged, Sub() RaiseEvent Changed()
        Next
        _from.Font = _bf : _to.Font = _bf
        Controls.AddRange(New Control() {_from, _to, _apply})
        AddHandler _apply.Click, Sub()
                                     Dim a = _from.Value.Date, b = _to.Value.Date
                                     If a > b Then
                                         Dim t = a : a = b : b = t
                                     End If
                                     SetRange(a, b)
                                 End Sub
        SetRange(From, [To], False)
    End Sub

    Private Function Combos() As ComboBox()
        Return {_status, _channel, _payment, _customer, _product}
    End Function

    Public ReadOnly Property Status As String
        Get
            Return Ui.Val(_status)
        End Get
    End Property
    Public ReadOnly Property Channel As String
        Get
            Return Ui.Val(_channel)
        End Get
    End Property
    Public ReadOnly Property Payment As String
        Get
            Return Ui.Val(_payment)
        End Get
    End Property
    Public ReadOnly Property Customer As String
        Get
            Return Ui.Val(_customer)
        End Get
    End Property
    Public ReadOnly Property Product As String
        Get
            Return Ui.Val(_product)
        End Get
    End Property

    Public Sub SetCustomers(items As IEnumerable(Of String))
        Ui.Refill(_customer, {"|All Customers", "guest|Guest (no customer)"}.Concat(items))
    End Sub
    Public Sub SetProducts(items As IEnumerable(Of String))
        Ui.Refill(_product, {"|All Products"}.Concat(items))
    End Sub

    Public Sub SetRange(a As Date, b As Date, Optional raise As Boolean = True)
        From = a.Date : [To] = b.Date
        _from.Value = From : _to.Value = [To]
        Invalidate()
        If raise Then RaiseEvent Changed()
    End Sub

    Private Function PresetsW() As Integer
        Return RangeChips.Presets.Sum(Function(p) Tr.MeasureText(p.Split("|"c)(1), _bf).Width + 16 - 1) + 1
    End Function

    Private Function Place(width As Integer, apply As Boolean) As Integer
        Dim x = PresetsW() + 8, y = 0
        Dim cw = Math.Min(200, (width - x - 4 * 8) \ 5)
        If cw < 120 Then
            x = 0 : y += RowH + 8
            cw = Math.Min(200, (width - 4 * 8) \ 5)
        End If
        For Each c In Combos()
            If apply Then c.SetBounds(x, y, cw, RowH)
            x += cw + 8
        Next
        Dim dw = DateW + 6 + 16 + 6 + DateW + 6 + _apply.Width
        If x + dw > width Then x = 0 : y += RowH + 8
        If apply Then
            Dim dx = width - dw
            _from.SetBounds(dx, y, DateW, RowH)
            _to.SetBounds(dx + DateW + 28, y, DateW, RowH)
            _apply.SetBounds(width - _apply.Width, y, _apply.Width, RowH)
        End If
        Return y + RowH
    End Function

    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return Place(width, False)
    End Function

    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Dim h = Place(Width, True)
        If h <> _lastH Then _lastH = h : Parent?.PerformLayout()
        Invalidate()
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Dim grey = Color.FromArgb(&H6C, &H75, &H7D), blue = Color.FromArgb(&HD, &H6E, &HFD)
        Dim act = ActiveKey()
        _btns = New List(Of (String, Rectangle))
        Dim x = 0
        Dim n = RangeChips.Presets.Length
        ' group outline first, then each button (the active one on top)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, PresetsW() - 1, RowH - 1), Theme.Radius)
            Using pen As New Pen(grey) : g.DrawPath(pen, p) : End Using
        End Using
        For i = 0 To n - 1
            Dim kl = RangeChips.Presets(i).Split("|"c)
            Dim w = Tr.MeasureText(kl(1), _bf).Width + 16
            Dim r As New Rectangle(x, 0, w, RowH)
            Dim on_ = kl(0) = act, hot = kl(0) = _hover
            If on_ OrElse hot Then
                Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, 0.5F, r.Width - 1, RowH - 1), If(i = 0 OrElse i = n - 1, Theme.Radius, 0))
                    Using b As New SolidBrush(If(on_, blue, grey)) : g.FillPath(b, p) : End Using
                    Using pen As New Pen(If(on_, blue, grey)) : g.DrawPath(pen, p) : End Using
                End Using
            End If
            If i > 0 Then Using pen As New Pen(grey) : g.DrawLine(pen, r.X, 0, r.X, RowH - 1) : End Using
            Tr.DrawText(g, kl(1), _bf, r, If(on_ OrElse hot, Color.White, grey), TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            _btns.Add((kl(0), r))
            x += w - 1
        Next
        Tr.DrawText(g, "to", _bf, New Rectangle(_from.Right, _from.Top, _to.Left - _from.Right, RowH), grey, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub

    Private Function ActiveKey() As String
        For Each p In RangeChips.Presets
            Dim k = p.Split("|"c)(0)
            Dim r = RangeChips.RangeOf(k)
            If r.Item1 = From AndAlso r.Item2 = [To] Then Return k
        Next
        Return ""
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim h = _btns.FirstOrDefault(Function(b) b.R.Contains(e.Location)).Key
        If h Is Nothing Then h = ""
        Cursor = If(h = "", Cursors.Default, Cursors.Hand)
        If h <> _hover Then _hover = h : Invalidate()
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        If _hover <> "" Then _hover = "" : Invalidate()
    End Sub
    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each b In _btns
            If b.R.Contains(e.Location) Then
                Dim r = RangeChips.RangeOf(b.Key)
                SetRange(r.Item1, r.Item2)
                Return
            End If
        Next
    End Sub
End Class

''' <summary>"Showing 1 to 7 of 7 entries | Total ₹… · Due ₹…" and the pages on the right.</summary>
Public Class LedgerFooter
    Inherits Control
    Implements IFlowHeight
    Public ReadOnly Pager As New Pager()
    Public Text_ As String = "", Total As String = "", Due As String = ""
    Private ReadOnly _f As Font, _fb As Font
    Public Sub New(Optional size As Integer = 13)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 40
        _f = Theme.Px(size) : _fb = Theme.Px(size, 700)
        Controls.Add(Pager)
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return 40
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Pager.SetBounds(Width - Pager.Width, 4, Pager.Width, 36)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Dim x = 0, y = 12
        Dim part = Sub(t As String, f As Font, c As Color)
                       Tr.DrawText(g, t, f, New Point(x, y), c, TextFormatFlags.NoPadding)
                       x += Tr.MeasureText(t, f).Width
                   End Sub
        part(Text_, _f, Theme.G600)
        If Total = "" Then Return
        x += 10
        Using pen As New Pen(Theme.G300) : g.DrawLine(pen, x, y, x, y + 16) : End Using
        x += 10
        part("Total ", _f, Theme.G600)
        part(Total, _fb, Theme.G900)
        If Due <> "" Then
            part(" · Due ", _f, Theme.G600)
            part(Due, _fb, Color.FromArgb(&HDC, &H26, &H26))
        End If
    End Sub
End Class
