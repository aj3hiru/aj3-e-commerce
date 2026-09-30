Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Customers" as on the website: growth chart (this period vs the one before), key metrics (click to
''' filter), date range, filters, and the customers table with status menu, profile and edit.</summary>
Public Class CustomersPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_customers2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _add As WButton = Ui.Btn("Add Customer", Theme.IcAdd, Theme.Blue)
    Private ReadOnly _top As New Columns(2, 520, 16) With {.Stretch = True}
    Private ReadOnly _growth As New CardBox("Customer Growth", ChrW(&HE9D2)) With {.Accent = Color.FromArgb(&H16, &HA3, &H4A)}
    Private ReadOnly _growthNote As New TextBlock("", Theme.Body, Theme.G600)
    Private ReadOnly _chart As New LineChart() With {.Height = 190, .LineColor = Color.FromArgb(&H16, &HA3, &H4A)}
    Private ReadOnly _growthDates As New TextBlock("", Theme.Small, Theme.G500)
    Private ReadOnly _metricsCard As New CardBox("Key Metrics", ChrW(&HE9D2)) With {.Accent = Color.FromArgb(&H16, &HA3, &H4A)}
    Private ReadOnly _metricGrid As New Columns(2, 220, 12)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _range As New RangeBar("today,7d,this_month,prev_month,this_year,custom", "this_month")
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _type As ComboBox = Ui.Filter({"all|All customers", "online|Online", "offline|Store"})
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All status", "active|Active", "inactive|Inactive"})
    Private ReadOnly _dues As ComboBox = Ui.Filter({"all|All", "with|Has a due", "without|No due"})
    Private ReadOnly _buying As ComboBox = Ui.Filter({"all|All", "buyers|Bought in range", "never|Never ordered"})
    Private ReadOnly _applies As ComboBox = Ui.Filter({"none|Ignore date range", "created|Joined date", "lastOrder|Last order date"})
    Private ReadOnly _list As New ListCard("customers")
    Private _shown As New List(Of JsonObject)
    Private _localOrders As New Dictionary(Of Integer, (N As Integer, Spent As Double))

    Public Overrides ReadOnly Property PageTitle As String = "Customers"
    Public Overrides ReadOnly Property PageSubtitle As String = "Everyone who buys from the shop and the counter, with what they've spent and owe"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            If AppState.I.Perm.Has("ecommerce", "manage_customers") Then Return {_display.Button, _export, _add}
            Return {_display.Button, _export}
        End Get
    End Property

    Public Sub New()
        Dim legend As New Drawn(20, Sub(g, r)
                                        Dim x = 0
                                        For Each it In {(Color.FromArgb(&H16, &HA3, &H4A), "This Period"), (Theme.Blue, "Previous Period")}
                                            Using b As New SolidBrush(it.Item1) : g.FillEllipse(b, x, 6, 8, 8) : End Using
                                            Tr.DrawText(g, it.Item2, Theme.Body, New Point(x + 14, 1), Theme.G700, TextFormatFlags.NoPadding)
                                            x += Tr.MeasureText(it.Item2, Theme.Body).Width + 34
                                        Next
                                    End Sub)
        _growth.Add(legend)
        _growth.Add(_growthNote)
        _growth.Add(_chart)
        _growth.Add(_growthDates)
        _chart.Formatter = Function(v) Math.Round(v).ToString("0")
        _top.Add(_growth)
        For Each m In {("cus2-k-total", "All Customers", Theme.IcPeople, Color.FromArgb(5, &H96, &H69)), ("cus2-k-online", "Online Customers", Theme.IcShop, Theme.Blue),
                       ("cus2-k-offline", "Store Customers", Theme.IcShop, Theme.Blue), ("cus2-k-dues", "With Dues", ChrW(&HE8C7), Color.FromArgb(&HF5, &H9E, &HB))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 92, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub() MetricClick(key)
            _m(key) = ms
            _metricGrid.Add(ms)
        Next
        _metricsCard.Add(_metricGrid)
        _top.Add(_metricsCard)
        Body.Add(_top)
        Body.Add(_range)
        _filters.Add("cus2-f-type", "Customer Type", _type)
        _filters.Add("cus2-f-status", "Status", _status)
        _filters.Add("cus2-f-dues", "Dues", _dues)
        _filters.Add("cus2-f-activity", "Buying", _buying)
        _filters.Add("cus2-f-datefield", "Date range applies to", _applies)
        AddHandler _filters.Changed, Sub()
                                         _list.ResetPage()
                                         Refresh_()
                                     End Sub
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Name, phone, email..."
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub()
                                            _list.ResetPage()
                                            Refresh_()
                                        End Sub
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           For Each c In {_type, _status, _dues, _buying, _applies} : c.SelectedIndex = 0 : Next
                                           Refresh_()
                                       End Sub
        AddHandler _list.Table.RowClick, Sub(c) Open(c)
        AddHandler _list.Table.CellClick, Sub(c, col, cell)
                                              If col.Key = "status" Then CustomerActions.StatusMenu(c, New Point(cell.X + 10, cell.Bottom - 8), Me) Else Open(c)
                                          End Sub
        AddHandler _list.Table.ActionClick, Sub(c, k)
                                                If k = "view" Then Open(c) Else CustomerActions.Edit(Me, c)
                                            End Sub
        AddHandler _range.Changed, Sub()
                                       _list.ResetPage()
                                       Refresh_()
                                   End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        AddHandler _add.Click, Sub() CustomerActions.Edit(Me, Nothing)
        BuildCols()
    End Sub

    Private Sub Open(c As JsonObject)
        If Js.Int(c, "id") <= 0 Then Toast("This customer is still uploading — open it in a moment.") : Return
        Main?.Push(New CustomerProfilePage(Js.Int(c, "id")))
    End Sub

    Private Sub MetricClick(key As String)
        Select Case key
            Case "cus2-k-total" : Ui.SetVal(_type, "all") : Ui.SetVal(_dues, "all")
            Case "cus2-k-online" : Ui.SetVal(_type, "online")
            Case "cus2-k-offline" : Ui.SetVal(_type, "offline")
            Case "cus2-k-dues" : Ui.SetVal(_dues, "with")
        End Select
    End Sub

    Private Function Orders(c As JsonObject) As Integer
        If Not Js.IsNull(c, "orders") Then Return Js.Int(c, "orders")
        Dim v As (Integer, Double) = Nothing
        Return If(_localOrders.TryGetValue(Js.Int(c, "id"), v), v.Item1, 0)
    End Function

    Private Function Spent(c As JsonObject) As Double
        If Not Js.IsNull(c, "spent") Then Return Js.Num(c, "spent")
        Dim v As (Integer, Double) = Nothing
        Return If(_localOrders.TryGetValue(Js.Int(c, "id"), v), v.Item2, 0)
    End Function

    Private Shared Function WalkIn(c As JsonObject) As Boolean
        Return Js.Str(c, "type", "offline") <> "online"
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim on_ = Function(k As String) _display.IsOn("cus2-table", k)
        _list.ShowSearch = on_("cus2-t-search")
        If on_("cus2-c-customer") Then
            t.Cols.Add(New TCol("Customer", Function(c) If(Js.Str(c, "name").Trim() = "", "No name yet", Js.Str(c, "name")), 0, If(on_("cus2-c-photo"), CellKind.Avatar, CellKind.Bold)) With {
                .Flex = 17, .Picture = Function(c) Js.Str(c, "avatar"),
                .Sub = Function(c) If(on_("cus2-c-joined"), "Joined " & Fmt.Day(Js.Time(c, "since")) & If(Js.Time(c, "lastOrderAt").HasValue, " · last order " & Fmt.Day(Js.Time(c, "lastOrderAt")), " · never ordered"), ""),
                .Sort = Function(c) Js.Str(c, "name").ToLowerInvariant()})
        End If
        If on_("cus2-c-contact") Then
            t.Cols.Add(New TCol("Contact", Function(c) Js.Str(c, "phone", "No phone"), 0) With {.Flex = 16, .Sub = Function(c) Js.Str(c, "email", "No email")})
        End If
        If on_("cus2-c-type") Then
            t.Cols.Add(New TCol("Type", Function(c) If(WalkIn(c), "Store", "Online"), 0, CellKind.Badge) With {.Flex = 8, .Colour = Function(c) If(WalkIn(c), Fmt.AmberText, Theme.PrimaryDark)})
        End If
        If on_("cus2-c-orders") Then t.Cols.Add(New TCol("Orders", Function(c) Orders(c).ToString(), 0, CellKind.Bold) With {.Flex = 7, .Sort = Function(c) Orders(c)})
        If on_("cus2-c-spent") Then t.Cols.Add(New TCol("Total Spent", Function(c) Theme.Money(Spent(c)), 0, CellKind.Money) With {.Flex = 10, .Sort = Function(c) Spent(c)})
        If on_("cus2-c-due") Then
            t.Cols.Add(New TCol("Due", Function(c) If(Js.Num(c, "due") > 0.004, Theme.Money(Js.Num(c, "due")), "—"), 0, CellKind.Bold) With {.Flex = 9,
                .Colour = Function(c) If(Js.Num(c, "due") > 0.004, Theme.Danger, Theme.G400), .Sort = Function(c) Js.Num(c, "due")})
        End If
        If on_("cus2-c-login") Then
            t.Cols.Add(New TCol("Login", Function(c)
                                             If WalkIn(c) Then Return "—"
                                             Dim l As New List(Of String)
                                             If Js.Str(c, "phone") <> "" Then l.Add("OTP")
                                             If Js.Bool(c, "hasPassword") Then l.Add("Password")
                                             Return If(l.Count = 0, "None", String.Join(" + ", l))
                                         End Function, 0) With {.Flex = 10})
        End If
        If on_("cus2-c-addresses") Then t.Cols.Add(New TCol("Addresses", Function(c) Js.Int(c, "addresses").ToString(), 0) With {.Flex = 7})
        If on_("cus2-c-status") Then
            t.Cols.Add(New TCol("Status", Function(c) If(Js.Str(c, "status") = "active", "Active", "Inactive"), 0, If(AppState.I.Perm.Has("ecommerce", "manage_customers"), CellKind.PillMenu, CellKind.Pill)) With {
                .Flex = 10, .Key = "status", .Colour = Function(c) If(Js.Str(c, "status") = "active", Theme.Green, Theme.Grey)})
        End If
        If on_("cus2-c-actions") Then
            Dim col = New TCol("Actions", Nothing, 100, CellKind.Actions).Btn("view", ChrW(&HE890), "Open profile", Color.FromArgb(&HE, &HA5, &HE9))
            If AppState.I.Perm.Has("ecommerce", "manage_customers") Then col.Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7))
            t.Cols.Add(col)
        End If
        t.RowHeight = 64
        t.RowClickable = True
        If t.SortCol Is Nothing OrElse Not t.Cols.Contains(t.SortCol) Then t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Header = "Customer") : t.SortAsc = True
        t.EmptyText = "No customers match these filters."
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim all = s.List("customers")
        _localOrders = New Dictionary(Of Integer, (Integer, Double))
        For Each o In s.List("orders")
            If Js.IsNull(o, "customerId") OrElse Js.Str(o, "status") = "Canceled" Then Continue For
            Dim id = Js.Int(o, "customerId")
            Dim cur As (Integer, Double) = Nothing
            _localOrders.TryGetValue(id, cur)
            _localOrders(id) = (cur.Item1 + 1, cur.Item2 + Js.Num(o, "total"))
        Next
        Dim bought = s.List("orders").Where(Function(o) Not Js.IsNull(o, "customerId") AndAlso Js.Str(o, "status") <> "Canceled" AndAlso _range.Contains(Js.Time(o, "createdAt"))).Select(Function(o) Js.Int(o, "customerId")).ToHashSet()
        Dim type = Ui.Val(_type), status = Ui.Val(_status), dues = Ui.Val(_dues), buying = Ui.Val(_buying), applies = Ui.Val(_applies)
        Dim list = all.Where(Function(c)
                                 If type = "online" AndAlso WalkIn(c) Then Return False
                                 If type = "offline" AndAlso Not WalkIn(c) Then Return False
                                 If status <> "all" AndAlso (Js.Str(c, "status") = "active") <> (status = "active") Then Return False
                                 If dues = "with" AndAlso Js.Num(c, "due") <= 0.004 Then Return False
                                 If dues = "without" AndAlso Js.Num(c, "due") > 0.004 Then Return False
                                 If buying = "buyers" AndAlso Not bought.Contains(Js.Int(c, "id")) Then Return False
                                 If buying = "never" AndAlso Orders(c) > 0 Then Return False
                                 If applies = "created" AndAlso Not _range.Contains(Js.Time(c, "since")) Then Return False
                                 If applies = "lastOrder" AndAlso Not _range.Contains(Js.Time(c, "lastOrderAt")) Then Return False
                                 Return _list.Matches(Js.Str(c, "name"), Js.Str(c, "phone"), Js.Str(c, "email"))
                             End Function).ToList()
        _shown = list
        _list.SetRows(list, all.Count, type <> "all" OrElse status <> "all" OrElse dues <> "all" OrElse buying <> "all" OrElse applies <> "none")

        ' key metrics
        Dim withDue = all.Where(Function(c) Js.Num(c, "due") > 0.004).ToList()
        _m("cus2-k-total").SetValue(all.Count.ToString("#,##0"), all.Where(Function(c) Js.Str(c, "status") = "active").Count() & " active · " & all.Where(Function(c) Js.Str(c, "status") <> "active").Count() & " inactive")
        _m("cus2-k-online").SetValue(all.Where(Function(c) Not WalkIn(c)).Count().ToString("#,##0"), "signed up on the shop")
        _m("cus2-k-offline").SetValue(all.Where(Function(c) WalkIn(c)).Count().ToString("#,##0"), "added at the counter")
        _m("cus2-k-dues").SetValue(withDue.Count.ToString("#,##0"), Theme.Money(withDue.Sum(Function(c) Js.Num(c, "due"))) & " outstanding")
        _m("cus2-k-total").Selected = type = "all" AndAlso dues = "all"
        _m("cus2-k-online").Selected = type = "online"
        _m("cus2-k-offline").Selected = type = "offline"
        _m("cus2-k-dues").Selected = dues = "with"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("cus2-cards", kv.Key)) : Next
        Dim cardsOn = _display.IsOn("cus2-cards") AndAlso _m.Keys.Any(Function(k) _display.IsOn("cus2-cards", k))
        Kit.Show(_metricsCard, cardsOn)
        Kit.Show(_growth, _display.Item("cus2-chart"))
        Kit.Show(_top, cardsOn OrElse _display.Item("cus2-chart"))
        Kit.Show(_range, _display.Item("cus2-range"))
        _filters.Apply(_display, "cus2-filters")
        Kit.Show(_filters, _display.IsOn("cus2-filters") AndAlso Kit.WantsVisible(_filters))
        Kit.Show(_list, _display.IsOn("cus2-table"))

        ' growth: joined per day, this period vs the one before
        Dim b = _range.Bounds_()
        Dim from = If(b.Item1, New DateTime(DateTime.Today.Year, DateTime.Today.Month, 1)), [to] = If(b.Item2, DateTime.Today)
        Dim days = Math.Max(1, CInt(([to] - from).TotalDays) + 1)
        Dim prevFrom = from.AddDays(-days)
        Dim nowC(days - 1) As Double, prevC(days - 1) As Double
        For Each c In all
            Dim t = Js.Time(c, "since")
            If Not t.HasValue Then Continue For
            Dim i = CInt((t.Value.Date - from).TotalDays)
            If i >= 0 AndAlso i < days Then nowC(i) += 1
            Dim j = CInt((t.Value.Date - prevFrom).TotalDays)
            If j >= 0 AndAlso j < days Then prevC(j) += 1
        Next
        _chart.Values = nowC.ToList()
        _chart.Values2 = prevC.ToList()
        Dim stepN = Math.Max(1, CInt(Math.Ceiling(days / 7.0)))
        _chart.Labels = Enumerable.Range(0, days).Select(Function(i) If(i Mod stepN = 0, from.AddDays(i).ToString("d MMM"), "")).ToList()
        _chart.Invalidate()
        _growthNote.Text = CInt(nowC.Sum()) & " joined by day"
        _growthDates.Text = "This period " & from.ToString("dd/MM/yyyy") & " – " & [to].ToString("dd/MM/yyyy") & " · previous " & prevFrom.ToString("dd/MM/yyyy") & " – " & from.AddDays(-1).ToString("dd/MM/yyyy")
    End Sub

    Private Sub DoExport()
        Export.Csv(Me, "Customers", {"Name", "Phone", "Email", "Type", "Orders", "Total spent", "Due", "Login", "Addresses", "Status", "Joined", "Last order"},
                   _shown.Select(Function(c) CType({Js.Str(c, "name"), Js.Str(c, "phone"), Js.Str(c, "email"), If(WalkIn(c), "Store", "Online"), CObj(Orders(c)), CObj(Spent(c)), CObj(Js.Num(c, "due")),
                        If(WalkIn(c), "", String.Join(" + ", {If(Js.Str(c, "phone") <> "", "OTP", ""), If(Js.Bool(c, "hasPassword"), "Password", "")}.Where(Function(x) x <> ""))),
                        CObj(Js.Int(c, "addresses")), Js.Str(c, "status"), Fmt.Day(Js.Time(c, "since")), Fmt.Day(Js.Time(c, "lastOrderAt"))}, IEnumerable(Of Object))))
    End Sub
End Class

''' <summary>Wraps a control whose height the page works out (a filter card around a grid).</summary>
Public Class FlowBox
    Inherits Panel
    Implements IFlowHeight
    Private ReadOnly _h As Func(Of Integer, Integer)
    Public ReadOnly Inner As Control
    Public Sub New(inner As Control, h As Func(Of Integer, Integer))
        Me.Inner = inner
        _h = h
        BackColor = Color.Transparent
        Controls.Add(inner)
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return _h(width)
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Inner.SetBounds(0, 0, Width, Height)
        Inner.PerformLayout()
    End Sub
End Class
