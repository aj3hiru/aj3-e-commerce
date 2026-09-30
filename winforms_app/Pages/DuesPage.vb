Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Due" as on the website: date range, number cards (click to filter), 5 filters, Collect (ticked,
''' one customer at a time) · search, the dues table (customer, order, amount &amp; paid, balance, promise date —
''' click to change it, status, Collect + payment history). Unpaid dues are synced; paid ones (180 days) are
''' page data — all on this computer.</summary>
Public Class DuesPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_due2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _rangeCard As New CardBox(Nothing, "", 12)
    Private ReadOnly _range As New RangeBar("today,yesterday,7d,30d,this_month,prev_month,this_year,custom", "this_month")
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _status As ComboBox = Ui.Filter({"unpaid|Unpaid only", "partial|Partly paid", "paid|Fully paid", "all|All dues"})
    Private ReadOnly _promise As ComboBox = Ui.Filter({"all|All", "overdue|Overdue", "today|Due today", "upcoming|Upcoming", "none|No date set"})
    Private ReadOnly _source As ComboBox = Ui.Filter({"all|All orders", "offline|In-store", "online|Online"})
    Private ReadOnly _product As ComboBox = Ui.Filter({"0|All products"})
    Private ReadOnly _dateField As ComboBox = Ui.Filter({"none|Ignore date range", "created|Due created", "promised|Promise date", "paid|Payment date"})
    Private ReadOnly _list As New ListCard("dues")
    Private ReadOnly _summary As New Label With {.AutoSize = True, .Font = Theme.BodyBold, .ForeColor = Theme.Danger, .BackColor = Color.White}
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Due"
    Public Overrides ReadOnly Property PageSubtitle As String = "Who owes what, when they promised to pay, and what has been collected"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export}
        End Get
    End Property

    Public Sub New()
        _rangeCard.Add(_range)
        _rangeCard.Add(New TextBlock("→  To filter the table by these dates, set ""Date range applies to"".", Theme.Small, Theme.G600))
        Body.Add(_rangeCard)
        For Each m In {("due2-k-total", "Total Due", Theme.IcMoney, Color.FromArgb(&HDC, &H26, &H26)), ("due2-k-overdue", "Overdue", ChrW(&HE7BA), Color.FromArgb(&HEA, &H58, &HC)),
                       ("due2-k-today", "Due Today", Theme.IcCalendar, Color.FromArgb(&HD9, &H77, 6)), ("due2-k-people", "People with Dues", Theme.IcPeople, Color.FromArgb(&HE, &HA5, &HE9))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 92, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     ResetFilters()
                                     If key = "due2-k-overdue" Then Ui.SetVal(_promise, "overdue")
                                     If key = "due2-k-today" Then Ui.SetVal(_promise, "today")
                                     Refresh_()
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("due2-f-status", "Status", _status)
        _filters.Add("due2-f-promise", "Promise Date", _promise)
        _filters.Add("due2-f-source", "Order Source", _source)
        _filters.Add("due2-f-product", "Product", _product)
        _filters.Add("due2-f-datefield", "Date range applies to", _dateField)
        AddHandler _filters.Changed, Sub()
                                         _list.ResetPage()
                                         Refresh_()
                                     End Sub
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Name, phone, order, product…"
        _list.BulkItems.Add("collect|Collect the ticked dues")
        _list.AddTool(_summary)
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub()
                                            _list.ResetPage()
                                            Refresh_()
                                        End Sub
        AddHandler _list.ClearFilters, Sub()
                                           ResetFilters()
                                           Refresh_()
                                       End Sub
        AddHandler _list.Bulk, Sub(k, rows)
                                   rows = rows.Where(Function(d) Js.Num(d, "balance") > 0.004).ToList()
                                   If rows.Count = 0 Then Return
                                   Dim who = rows.Select(Function(d) If(Js.IsNull(d, "customerId"), Js.Str(d, "customer"), Js.Str(d, "customerId"))).Distinct().Count()
                                   If who > 1 Then Toast("Tick the dues of one customer at a time — one receipt goes to one person.", True) : Return
                                   DueActions.Collect(Me, rows)
                                   _list.Table.Selected.Clear()
                               End Sub
        AddHandler _list.Table.CellClick, Sub(d, c, cell)
                                              Select Case c.Key
                                                  Case "promise" : PromiseDate(d)
                                                  Case "order" : If Js.Int(d, "orderId") > 0 Then Main?.Push(New OrderDetailPage(Js.Int(d, "orderId")))
                                              End Select
                                          End Sub
        AddHandler _list.Table.ActionClick, Sub(d, k)
                                                If k = "collect" Then DueActions.Collect(Me, New List(Of JsonObject) From {d}) Else Payments(d)
                                            End Sub
        AddHandler _range.Changed, Sub()
                                       If Ui.Val(_dateField) = "none" Then Ui.SetVal(_dateField, "created")
                                       _list.ResetPage()
                                       Refresh_()
                                   End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        BuildCols()
    End Sub

    Private Sub ResetFilters()
        Ui.SetVal(_status, "unpaid") : Ui.SetVal(_promise, "all") : Ui.SetVal(_source, "all") : Ui.SetVal(_product, "0") : Ui.SetVal(_dateField, "none")
        _list.Search.Text = ""
    End Sub

    Private Shared Function Open(d As JsonObject) As Boolean
        Return Js.Num(d, "balance") > 0.004
    End Function
    Private Shared Function PromiseDay(d As JsonObject) As DateTime?
        Dim t = Js.Time(d, "promised")
        Return If(t.HasValue, t.Value.Date, CType(Nothing, DateTime?))
    End Function
    Private Shared Function OverdueDays(d As JsonObject) As Integer
        Dim p = PromiseDay(d)
        If Not Open(d) OrElse Not p.HasValue Then Return 0
        Return Math.Max(0, CInt((DateTime.Today - p.Value).TotalDays))
    End Function
    Private Shared Function DueToday(d As JsonObject) As Boolean
        Dim p = PromiseDay(d)
        Return Open(d) AndAlso p.HasValue AndAlso p.Value = DateTime.Today
    End Function
    Private Shared Function State(d As JsonObject) As String
        If Not Open(d) Then Return "Paid"
        If OverdueDays(d) > 0 Then Return "Overdue"
        Return If(Js.Num(d, "paid") > 0.004, "Partly", "Unpaid")
    End Function

    Private Function CanCollect() As Boolean
        Dim p = AppState.I.Perm
        Return p.Has("ecommerce", "manage_credits") OrElse p.Has("ecommerce", "manage_billing") OrElse p.Has("ecommerce", "manage_customers")
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim on_ = Function(k As String) _display.IsOn("due2-table", k)
        _list.Selectable = on_("due2-c-select") AndAlso CanCollect()
        _list.ShowSearch = on_("due2-t-search")
        If on_("due2-c-customer") Then
            t.Cols.Add(New TCol("Customer", Function(d) Js.Str(d, "customer"), 0, CellKind.Bold) With {.Flex = 14, .Sort = Function(d) Js.Str(d, "customer").ToLowerInvariant(),
                .Sub = Function(d)
                           Dim n = Js.Arr(d, "products").Count
                           Return Js.Str(d, "phone", "No phone") & If(n > 0, " · " & n & " item" & If(n = 1, "", "s"), "")
                       End Function})
        End If
        If on_("due2-c-order") Then
            t.Cols.Add(New TCol("Order", Function(d) Js.Str(d, "orderNumber", "#" & Js.Str(d, "orderId")), 0, CellKind.Link) With {.Flex = 13, .Key = "order", .Colour = Function(d) Theme.Blue,
                .Sub = Function(d) If(Js.Str(d, "orderType") = "offline", "In-store", "Online") & " · " & Fmt.Day(Js.Time(d, "createdAt")), .Sort = Function(d) Js.Str(d, "createdAt")})
        End If
        If on_("due2-c-amount") Then t.Cols.Add(New TCol("Amount & Paid", Function(d) Theme.Money(Js.Num(d, "amount")), 0) With {.Flex = 11, .Colour = Function(d) Theme.G900, .Sub = Function(d) "Paid " & Theme.Money(Js.Num(d, "paid"))})
        If on_("due2-c-balance") Then
            t.Cols.Add(New TCol("Balance", Function(d) Theme.Money(Js.Num(d, "balance")), 0, CellKind.Bold) With {.Flex = 10, .Colour = Function(d) If(Open(d), Color.FromArgb(&HDC, &H35, &H45), Theme.Green), .Sort = Function(d) Js.Num(d, "balance")})
        End If
        If on_("due2-c-promise") Then
            t.Cols.Add(New TCol("Promise Date", Function(d) If(PromiseDay(d).HasValue, Fmt.Day(PromiseDay(d)), If(CanCollect() AndAlso Open(d), "Set a date", "—")), 0, CellKind.Link) With {.Flex = 13, .Key = "promise",
                .Colour = Function(d) If(PromiseDay(d).HasValue, Theme.G800, Theme.G400),
                .Sub = Function(d) If(OverdueDays(d) > 0, OverdueDays(d) & " day" & If(OverdueDays(d) = 1, "", "s") & " overdue", If(DueToday(d), "Due today", "")),
                .Sort = Function(d) If(PromiseDay(d).HasValue, PromiseDay(d).Value.ToString("yyyyMMdd"), "99999999")})
        End If
        If on_("due2-c-status") Then
            t.Cols.Add(New TCol("Status", Function(d) State(d), 0, CellKind.Pill) With {.Flex = 9,
                .Colour = Function(d) If(State(d) = "Paid", Theme.Green, If(State(d) = "Overdue", Color.FromArgb(&HDC, &H26, &H26), If(State(d) = "Partly", Fmt.Yellow, Theme.Grey)))})
        End If
        If on_("due2-c-actions") Then
            t.Cols.Add(New TCol("Actions", Nothing, 170, CellKind.Actions) With {.ButtonsFor = Function(d) If(CanCollect() AndAlso Open(d), {"collect", "history"}, {"history"})}.Btn("collect", "hand-coins", "Collect", Web.PillSuccess, Function(d) "Collect").Btn("history", "receipt", "Payment history", Web.PillSecondary, Function(d) Js.Arr(d, "payments").Count.ToString()))
        End If
        t.RowHeight = 66
        If t.SortCol Is Nothing OrElse Not t.Cols.Contains(t.SortCol) Then t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Key = "promise") : t.SortAsc = True
        t.EmptyText = "No dues match these filters."
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim unpaid = s.List("dues")
        Dim ids = unpaid.Select(Function(u) Js.Int(u, "id")).ToHashSet()
        Dim paid = s.PageList("dues_paid").Where(Function(d) Not ids.Contains(Js.Int(d, "id"))).ToList()
        Dim all = unpaid.Concat(paid).ToList()
        Dim dues = unpaid.Where(AddressOf Open).ToList()
        Dim people = dues.Select(Function(d) If(Js.IsNull(d, "customerId"), Js.Str(d, "customer"), Js.Str(d, "customerId"))).Distinct().Count()
        Dim products As New Dictionary(Of Integer, String)
        For Each d In all
            For Each p In Js.Objs(Js.Arr(d, "products")) : products(Js.Int(p, "id")) = Js.Str(p, "name") : Next
        Next
        Ui.Refill(_product, {"0|All products"}.Concat(products.OrderBy(Function(kv) kv.Value).Select(Function(kv) kv.Key & "|" & kv.Value)))
        Dim status = Ui.Val(_status), promise = Ui.Val(_promise), source = Ui.Val(_source), dateField = Ui.Val(_dateField)
        Dim product = CInt(Ui.Val(_product))
        Dim list = all.Where(Function(d)
                                 Dim o = Open(d), part = Js.Num(d, "paid") > 0.004
                                 If status = "unpaid" AndAlso Not o Then Return False
                                 If status = "partial" AndAlso Not (o AndAlso part) Then Return False
                                 If status = "paid" AndAlso o Then Return False
                                 If promise = "overdue" AndAlso OverdueDays(d) <= 0 Then Return False
                                 If promise = "today" AndAlso Not DueToday(d) Then Return False
                                 If promise = "upcoming" AndAlso Not (PromiseDay(d).HasValue AndAlso PromiseDay(d).Value > DateTime.Today) Then Return False
                                 If promise = "none" AndAlso PromiseDay(d).HasValue Then Return False
                                 If source <> "all" AndAlso Js.Str(d, "orderType") <> source Then Return False
                                 If product <> 0 AndAlso Not Js.Objs(Js.Arr(d, "products")).Any(Function(p) Js.Int(p, "id") = product) Then Return False
                                 If dateField = "created" AndAlso Not _range.Contains(Js.Time(d, "createdAt")) Then Return False
                                 If dateField = "promised" AndAlso Not _range.Contains(Js.Time(d, "promised")) Then Return False
                                 If dateField = "paid" AndAlso Not Js.Objs(Js.Arr(d, "payments")).Any(Function(p) _range.Contains(Js.Time(p, "at"))) Then Return False
                                 Return _list.Matches(Js.Str(d, "customer"), Js.Str(d, "phone"), Js.Str(d, "orderNumber"), String.Join(" ", Js.Objs(Js.Arr(d, "products")).Select(Function(p) Js.Str(p, "name"))))
                             End Function).ToList()
        _shown = list
        Dim filtersOn = status <> "unpaid" OrElse promise <> "all" OrElse source <> "all" OrElse product <> 0 OrElse dateField <> "none"
        _list.SetRows(list, all.Count, filtersOn)
        _summary.Text = If(list.Count = 0, "", "Balance shown: " & Theme.Money(list.Sum(Function(d) Js.Num(d, "balance"))))
        Dim bal = Function(l As IEnumerable(Of JsonObject)) l.Sum(Function(d) Js.Num(d, "balance"))
        _m("due2-k-total").SetValue(Theme.Money(bal(dues)), dues.Count & " unpaid due" & If(dues.Count = 1, "", "s"))
        _m("due2-k-overdue").SetValue(Theme.Money(bal(dues.Where(Function(d) OverdueDays(d) > 0))), dues.Where(Function(d) OverdueDays(d) > 0).Count() & " past promise date")
        _m("due2-k-today").SetValue(Theme.Money(bal(dues.Where(AddressOf DueToday))), dues.Where(AddressOf DueToday).Count() & " promised for today")
        _m("due2-k-people").SetValue(people.ToString(), "customers who owe money")
        _m("due2-k-total").Selected = Not filtersOn
        _m("due2-k-overdue").Selected = promise = "overdue"
        _m("due2-k-today").Selected = promise = "today"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("due2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("due2-cards"))
        _filters.Apply(_display, "due2-filters")
        If Not _display.IsOn("due2-filters") Then Kit.Show(_filters, False)
        Kit.Show(_rangeCard, _display.Item("due2-range"))
        Kit.Show(_list, _display.IsOn("due2-table"))
    End Sub

    Private Sub PromiseDate(d As JsonObject)
        If Not CanCollect() OrElse Not Open(d) Then Return
        Dim f As New FormDialog("Promise date · " & Js.Str(d, "customer"), 400)
        f.AddDate("d", "When will they pay?", If(PromiseDay(d), DateTime.Today))
        If f.ShowDialog(FindForm()) <> DialogResult.OK Then Return
        Dim v = f.DateOf("d").Value.Date
        Dim ymd = v.ToString("yyyy-MM-dd")
        AppState.I.Enqueue(New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/due/set-date", .Body = Js.Obj("creditId", Js.Int(d, "id"), "promisedDate", ymd & "T12:00:00+05:30"),
            .Label = Js.Str(d, "customer") & ": promise date " & Fmt.Day(v),
            .Effect = New JsonObject From {{"kind", "due"}, {"id", Js.Int(d, "id")}, {"fields", Js.Obj("promised", New DateTime(v.Year, v.Month, v.Day, 6, 30, 0, DateTimeKind.Utc).ToString("o"))}},
            .Refresh = New List(Of String) From {"dues"}})
        Toast(Js.Str(d, "customer") & ": promise date set to " & Fmt.Day(v) & ".")
    End Sub

    Private Sub Payments(d As JsonObject)
        Dim pays = Js.Objs(Js.Arr(d, "payments"))
        Dim f As New FormDialog("Payments — " & Js.Str(d, "customer") & " · " & Js.Str(d, "orderNumber"), 580, "Close")
        f.CancelButton_.Visible = False
        If pays.Count = 0 Then
            f.AddNote("Nothing paid on this due yet.")
        Else
            Dim t As New WebTable() With {.RowHeight = 50}
            t.Cols.Add(New TCol("#", Function(p) (pays.IndexOf(p) + 1) & "×", 50))
            t.Cols.Add(New TCol("Receipt", Function(p) Js.Str(p, "receipt", "Pending"), 0, CellKind.Link) With {.Flex = 3, .Colour = Function(p) Theme.Blue,
                .Sub = Function(p) Fmt.Stamp(Js.Time(p, "at")) & " · " & Js.Str(p, "method") & If(Js.Str(p, "by") <> "", " · by " & Js.Str(p, "by"), "")})
            t.Cols.Add(New TCol("Amount", Function(p) Theme.Money(Js.Num(p, "amount")), 120, CellKind.Money) With {.Right = True, .Colour = Function(p) Theme.Green})
            t.Cols.Add(New TCol("", Nothing, 50, CellKind.Actions) With {.ButtonsFor = Function(p) If(Js.Str(p, "receipt") <> "", {"open"}, New String() {})}.Btn("open", ChrW(&HE8A7), "Open receipt (website)", Theme.G500))
            t.Rows = pays
            AddHandler t.ActionClick, Sub(p, k) Ui.OpenUrl(AppState.I.Api.Server & "/admin/ecommerce/payment-receipt/" & Js.Str(p, "receipt"))
            f.AddControl(t)
            f.AddNote("Paid so far " & Theme.Money(pays.Sum(Function(p) Js.Num(p, "amount"))), Theme.G700)
        End If
        f.ShowDialog(FindForm())
    End Sub

    Private Sub DoExport()
        Export.Csv(Me, "Dues", {"Customer", "Phone", "Order", "Source", "Created", "Amount", "Paid", "Balance", "Promise date", "Overdue days", "Status", "Products"},
                   _shown.Select(Function(d) CType({Js.Str(d, "customer"), Js.Str(d, "phone"), Js.Str(d, "orderNumber"), If(Js.Str(d, "orderType") = "offline", "In-store", "Online"), Fmt.Day(Js.Time(d, "createdAt")),
                        CObj(Js.Num(d, "amount")), CObj(Js.Num(d, "paid")), CObj(Js.Num(d, "balance")), Fmt.Day(PromiseDay(d)), If(OverdueDays(d) > 0, CObj(OverdueDays(d)), ""), State(d),
                        String.Join(", ", Js.Objs(Js.Arr(d, "products")).Select(Function(p) Js.Str(p, "name")))}, IEnumerable(Of Object))))
    End Sub
End Class
