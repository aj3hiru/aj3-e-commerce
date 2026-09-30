Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>All Orders — a port of the website's Orders2Body.tsx: date range, status tabs, summary cards, search and
''' filters, bulk actions, the orders table (payment / status pills, Accept / Reject, delivery agent, call / WhatsApp /
''' map, view / invoice), summary line and pages. Online orders only, as on the website. From the data on this computer.</summary>
Public Class OrdersPage
    Inherits ScrollPage

    Private Shared ReadOnly Statuses As String() = {"Pending", "In Progress", "Out for Delivery", "Delivered", "Canceled"}
    Private Shared ReadOnly StatusIcon As New Dictionary(Of String, String) From {{"Pending", "clock"}, {"In Progress", "package"}, {"Out for Delivery", "truck"}, {"Delivered", "circle-check"}, {"Canceled", "ban"}}
    Private Const Paisa As Double = 0.004

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_orders2_display")
    Private ReadOnly _export As New HeadButton("Export", "download")
    Private ReadOnly _range As New RangeChips()
    Private ReadOnly _tabs As New UnderTabs()
    Private ReadOnly _top As New CardBox(Nothing, "", 1)
    Private ReadOnly _topLine As New Spacer(1, True)
    Private ReadOnly _cards As New Columns(4, 200, 12)
    Private ReadOnly _m As New Dictionary(Of String, MetricCard)
    Private ReadOnly _section As New CardBox(Nothing, "", 16)
    Private ReadOnly _tools As New ToolRow()
    Private ReadOnly _search As New SearchField("Search order, name, phone, product…", 320)
    Private ReadOnly _fPay As New IconSelect("wallet", "all|Paid and unpaid", "Paid|Paid", "Unpaid|Unpaid")
    Private ReadOnly _fMethod As New IconSelect("indian-rupee", "all|All methods")
    Private ReadOnly _fProduct As New IconSelect("package", "all|All products")
    Private ReadOnly _fAgent As New IconSelect("truck", "all|All agents")
    Private ReadOnly _fDues As New IconSelect("wallet", "all|All orders", "with|Money still owed", "without|Nothing owed")
    Private ReadOnly _clear As New HeadButton("Clear", "x") With {.Height = 36}
    Private ReadOnly _perPage As New IconSelect("list", "10|10 / page", "25|25 / page", "50|50 / page", "100|100 / page", "0|All") With {.DefaultValue = "10"}
    Private ReadOnly _bulk As New BulkBar()
    Private ReadOnly _table As New WebTable() With {.Modern = True, .Selectable = True, .HeadHeight = 44}
    Private ReadOnly _footer As New FooterRow()
    Private ReadOnly _picked As New HashSet(Of Integer)
    Private _rows As New List(Of JsonObject)      ' in range (+ tab)
    Private _filtered As New List(Of JsonObject)  ' after search / filters / sort
    Private _page As Integer = 1
    Private _sortKey As String = "created", _sortDesc As Boolean = True
    Private _bulkAgent As String = ""

    Public Overrides ReadOnly Property PageTitle As String
        Get
            Return If(_tabs.Current = "", "All Orders", _tabs.Current & " Orders")
        End Get
    End Property
    Public Overrides ReadOnly Property PageSubtitle As String = "Online orders from the shop, with their status and payment"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export}
        End Get
    End Property

    Private ReadOnly Property Perm As Perms
        Get
            Return AppState.I.Perm
        End Get
    End Property
    Private ReadOnly Property CanEdit As Boolean
        Get
            Return Perm.Has("orders", "update_status") OrElse Perm.Has("orders", "mark_paid")
        End Get
    End Property
    Private ReadOnly Property CanBill As Boolean
        Get
            Return Perm.Has("ecommerce", "manage_billing")
        End Get
    End Property
    Private ReadOnly Property CanDecide As Boolean
        Get
            Return Perm.Has("orders", "accept_reject")
        End Get
    End Property
    Private ReadOnly Property Agents As List(Of JsonObject)
        Get
            Return If(Perm.Has("orders", "assign_delivery"), AppState.I.List("agents"), New List(Of JsonObject))
        End Get
    End Property

    Private Function Show(k As String) As Boolean
        Return Not _display.Hidden.Contains(k)
    End Function
    Private Function DShow(k As String) As Boolean
        Return Show("or2-details") AndAlso Show(k)
    End Function

    Public Sub New()
        _tabs.Add("", "All")
        For Each st In Statuses : _tabs.Add(st, st, Web.OrderStatusColor(st)) : Next
        _top.Add(_range) : _top.Add(_topLine) : _top.Add(_tabs)
        _top.Body.Gap = 0
        Body.Add(_top)
        For Each c In {("or2-k-total", "shopping-bag", Color.FromArgb(&HEF, &HF6, &HFF), Color.FromArgb(&H25, &H63, &HEB)),
                       ("or2-k-today", "clock", Color.FromArgb(&HF5, &HF3, &HFF), Color.FromArgb(&H7C, &H3A, &HED)),
                       ("or2-k-unpaid", "wallet", Color.FromArgb(&HFE, &HF2, &HF2), Color.FromArgb(&HDC, &H26, &H26)),
                       ("or2-k-value", "indian-rupee", Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(5, &H96, &H69))}
            _m(c.Item1) = _cards.Add(New MetricCard(c.Item2, c.Item3, c.Item4))
        Next
        For Each st In Statuses.Take(4)
            _m("or2-k-" & st.ToLowerInvariant().Replace(" ", "-")) = _cards.Add(New MetricCard(StatusIcon(st), Theme.G100, Theme.G700))
        Next
        Body.Add(_cards)
        _tools.Left.AddRange({_search, _fPay, _fMethod, _fProduct, _fAgent, _fDues, _clear})
        _tools.Right = _perPage
        _section.Add(_tools)
        _section.Add(_bulk)
        _section.Add(_table)
        _section.Add(_footer)
        Body.Add(_section)

        AddHandler _range.Changed, Sub() Refresh_(True)
        AddHandler _tabs.Changed, Sub()
                                      HeaderChanged()
                                      Refresh_(True)
                                  End Sub
        AddHandler _search.Changed, Sub() Refresh_(True)
        For Each f In {_fPay, _fMethod, _fProduct, _fAgent, _fDues, _perPage}
            AddHandler f.Changed, Sub() Refresh_(True)
        Next
        AddHandler _clear.Click, Sub()
                                     _search.Text = ""
                                     For Each f In {_fPay, _fMethod, _fProduct, _fAgent, _fDues} : f.Value = "all" : Next
                                     Refresh_(True)
                                 End Sub
        AddHandler _footer.Pager.PageChanged, Sub()
                                                  _page = _footer.Pager.Page
                                                  Refresh_()
                                              End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        AddHandler _table.SortChanged, Sub()
                                           Dim k = CStr(_table.SortCol?.Key)
                                           _sortKey = k : _sortDesc = Not _table.SortAsc
                                           Refresh_(True)
                                       End Sub
        AddHandler _table.SelectionChanged, Sub()
                                                _picked.Clear()
                                                For Each id In _table.Selected : _picked.Add(CInt(id)) : Next
                                                Refresh_()
                                            End Sub
        AddHandler _table.CellClickAt, AddressOf CellClick
        AddHandler _table.RowClick, Sub(o) Open(o)
        AddHandler _bulk.Accept, AddressOf BulkAccept
        AddHandler _bulk.Assign, AddressOf BulkAssign
        AddHandler _bulk.ClearPicked, Sub()
                                          _picked.Clear() : _table.Selected.Clear()
                                          Refresh_()
                                      End Sub
        _table.HotSpot = Function(o, c, cell, pt) Spots(o, c, cell).Any(Function(s) s.R.Contains(pt))
        BuildCols()
    End Sub

    Private Overloads Sub Refresh_(Optional firstPage As Boolean = False)
        If firstPage Then _page = 1
        MyBase.Refresh_()
    End Sub

    ''' <summary>Open with a status tab (from the dashboard's cards).</summary>
    Public Sub ShowTab(tab As String)
        _tabs.Current = If(tab = "all", "", tab)
        _tabs.Invalidate()
        HeaderChanged()
        Refresh_(True)
    End Sub

    ' ── columns (widths as on the website; the customer column takes what is left) ──
    Private Sub BuildCols()
        Dim t = _table
        t.Cols.Clear()
        Dim col = Function(k As String) Show("or2-table") AndAlso Show(k)
        t.Selectable = col("or2-c-select") AndAlso CanEdit
        If col("or2-c-order") Then t.Cols.Add(New TCol("Order", Nothing, 150, CellKind.Custom) With {.Key = "created", .Sort = Function(o) Js.Str(o, "createdAt"), .Draw = AddressOf DrawOrder})
        If col("or2-c-customer") Then t.Cols.Add(New TCol("Customer", Nothing, 0, CellKind.Custom) With {.Key = "customer", .Sort = Function(o) Js.Str(o, "customer").ToLowerInvariant(), .Draw = AddressOf DrawCustomer})
        If col("or2-c-items") Then t.Cols.Add(New TCol("Items", Nothing, 105, CellKind.Custom) With {.Key = "items", .Draw = AddressOf DrawItems})
        If col("or2-c-total") Then t.Cols.Add(New TCol("Total", Nothing, 110, CellKind.Custom) With {.Key = "total", .Sort = Function(o) Js.Num(o, "total"), .Draw = AddressOf DrawTotal})
        If col("or2-c-payment") Then t.Cols.Add(New TCol("Payment", Nothing, 125, CellKind.Custom) With {.Key = "payment", .Draw = AddressOf DrawPayment})
        If col("or2-c-status") Then t.Cols.Add(New TCol("Status", Nothing, 185, CellKind.Custom) With {.Key = "status", .Sort = Function(o) Js.Str(o, "status"), .Draw = AddressOf DrawStatus})
        If col("or2-c-agent") AndAlso Agents.Count > 0 Then t.Cols.Add(New TCol("Delivery agent", Nothing, 160, CellKind.Custom) With {.Key = "agent", .Draw = AddressOf DrawAgent})
        If col("or2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Custom) With {.Key = "actions", .Draw = AddressOf DrawActions})
        t.RowHeight = If(Show("or2-d-compact"), 60, 76)
        t.RowClickable = False
        t.RowColour = Function(o) If(Js.Str(o, "status") = "Pending" AndAlso DShow("or2-d-highlight"), Web.PillWarning, Color.Empty)
        t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Key = _sortKey)
        t.SortAsc = Not _sortDesc
        t.EmptyText = "No orders match these filters."
    End Sub

    ' ── the data ──
    Private Function Due(o As JsonObject) As Double
        Dim d = Js.Num(o, "due")
        If d > Paisa Then Return d
        Return Math.Round(Math.Max(0, Js.Num(o, "total") - Js.Num(o, "paid")), 2)
    End Function

    Private Shared Function ItemCount(o As JsonObject) As Integer
        Return CInt(Js.Objs(Js.Arr(o, "items")).Sum(Function(i) Js.Num(i, "qty")))
    End Function

    Private Shared Function Method(o As JsonObject) As String
        Return OrderActions.MethodLabel(Js.Str(o, "paymentMethod"))
    End Function

    Protected Overrides Sub Reload()
        Dim from = _range.From, [to] = _range.To
        Dim online = AppState.I.AllOrders().Where(Function(o) Js.Str(o, "type") = "online").ToList()
        Dim inRange = online.Where(Function(o)
                                       Dim d = Fmt.IstDay(Js.Time(o, "createdAt"))
                                       Return d >= from AndAlso d <= [to]
                                   End Function).ToList()
        Dim tab = _tabs.Current
        _tabs.Counts("") = inRange.Count
        For Each st In Statuses : _tabs.Counts(st) = inRange.Where(Function(o) Js.Str(o, "status") = st).Count() : Next
        _tabs.Invalidate()
        _rows = If(tab = "", inRange, inRange.Where(Function(o) Js.Str(o, "status") = tab).ToList())

        ' cards (over the orders in range and tab, as on the website)
        Dim sum = Function(l As IEnumerable(Of JsonObject)) Math.Round(l.Sum(Function(o) Js.Num(o, "total")), 2)
        Dim today = Fmt.IstToday()
        Dim todayRows = _rows.Where(Function(o) Fmt.IstDay(Js.Time(o, "createdAt")) = today).ToList()
        Dim unpaid = _rows.Where(Function(o) Js.Str(o, "paymentStatus") <> "Paid").ToList()
        _m("or2-k-total").SetValue(_rows.Count.ToString(), If(tab = "", "All Orders", tab & " Orders"), Theme.Money(sum(_rows)) & " in this range")
        _m("or2-k-today").SetValue(todayRows.Count.ToString(), "Today's Orders", Theme.Money(sum(todayRows)))
        _m("or2-k-unpaid").SetValue(unpaid.Count.ToString(), "Unpaid", Theme.Money(sum(unpaid)) & " not collected")
        _m("or2-k-value").SetValue(Theme.Money(sum(_rows)), "Order Value", RangeChips.LongDate(from) & " – " & RangeChips.LongDate([to]))
        For Each st In Statuses.Take(4)
            Dim l = _rows.Where(Function(o) Js.Str(o, "status") = st).ToList()
            _m("or2-k-" & st.ToLowerInvariant().Replace(" ", "-")).SetValue(l.Count.ToString(), st, Theme.Money(sum(l)))
        Next

        ' filter choices from the orders on screen
        _fMethod.SetOptions({"all|All methods"}.Concat(_rows.Select(Function(o) Method(o)).Where(Function(m) m <> "" AndAlso m <> "—").Distinct().OrderBy(Function(m) m).Select(Function(m) m & "|" & m)))
        Dim products As New Dictionary(Of Integer, (Name As String, N As Integer))
        For Each o In _rows
            For Each i In Js.Objs(Js.Arr(o, "items"))
                Dim pid = Js.Int(i, "productId")
                If pid = 0 Then Continue For
                Dim had As (String, Integer) = Nothing
                If products.TryGetValue(pid, had) Then products(pid) = (had.Item1, had.Item2 + 1) Else products(pid) = (Js.Str(i, "name"), 1)
            Next
        Next
        _fProduct.SetOptions({"all|All products"}.Concat(products.OrderByDescending(Function(k) k.Value.N).ThenBy(Function(k) k.Value.Name).Select(Function(k) k.Key & "|" & k.Value.Name & " (" & k.Value.N & ")")))
        _fAgent.SetOptions({"all|All agents", "none|Not assigned"}.Concat(Agents.Select(Function(a) Js.Int(a, "id") & "|" & Js.Str(a, "name"))))

        ' search, filters, sort
        Dim term = _search.Text.Trim().ToLowerInvariant()
        Dim pay = _fPay.Value, meth = _fMethod.Value, prod = _fProduct.Value, dues = _fDues.Value, agent = _fAgent.Value
        Dim list = _rows.Where(Function(o)
                                   If pay <> "all" AndAlso Js.Str(o, "paymentStatus") <> pay Then Return False
                                   If meth <> "all" AndAlso Method(o) <> meth Then Return False
                                   If prod <> "all" AndAlso Not Js.Objs(Js.Arr(o, "items")).Any(Function(i) Js.Int(i, "productId").ToString() = prod) Then Return False
                                   If dues = "with" AndAlso Not Due(o) > Paisa Then Return False
                                   If dues = "without" AndAlso Due(o) > Paisa Then Return False
                                   If agent = "none" AndAlso Not Js.IsNull(o, "agentId") Then Return False
                                   If agent <> "all" AndAlso agent <> "none" AndAlso Js.Int(o, "agentId").ToString() <> agent Then Return False
                                   If term <> "" Then
                                       Dim hay = (Js.Str(o, "number") & " " & Js.Str(o, "customer") & " " & Js.Str(o, "email") & " " & Js.Str(o, "phone") & " " & Js.Str(o, "address") & " " & String.Join(" ", Js.Objs(Js.Arr(o, "items")).Select(Function(i) Js.Str(i, "name")))).ToLowerInvariant()
                                       If Not hay.Contains(term) Then Return False
                                   End If
                                   Return True
                               End Function)
        Select Case _sortKey
            Case "total" : list = If(_sortDesc, list.OrderByDescending(Function(o) Js.Num(o, "total")), list.OrderBy(Function(o) Js.Num(o, "total")))
            Case "customer" : list = If(_sortDesc, list.OrderByDescending(Function(o) Js.Str(o, "customer").ToLowerInvariant()), list.OrderBy(Function(o) Js.Str(o, "customer").ToLowerInvariant()))
            Case "status" : list = If(_sortDesc, list.OrderByDescending(Function(o) Js.Str(o, "status"), StringComparer.Ordinal), list.OrderBy(Function(o) Js.Str(o, "status"), StringComparer.Ordinal))
            Case Else : list = If(_sortDesc, list.OrderByDescending(Function(o) Js.Str(o, "createdAt")), list.OrderBy(Function(o) Js.Str(o, "createdAt")))
        End Select
        _filtered = list.ToList()

        ' page
        Dim size = CInt(_perPage.Value)
        Dim pages = If(size = 0, 1, Math.Max(1, CInt(Math.Ceiling(_filtered.Count / size))))
        _page = Math.Min(_page, pages)
        Dim start = If(size = 0, 0, (_page - 1) * size)
        Dim pageRows = If(size = 0, _filtered, _filtered.Skip(start).Take(size).ToList())
        _table.Rows = pageRows
        _table.Selected.Clear()
        For Each id In _picked : _table.Selected.Add(id.ToString()) : Next
        _table.MinRows = If(size = 0, 0, Math.Min(size, 5))
        _table.EmptyText = If(_rows.Count = 0, "No " & If(tab = "", "", tab.ToLowerInvariant() & " ") & "orders in these dates.", "No orders match these filters.")
        _table.Invalidate()

        ' footer: "1–10 of 42 orders (filtered from 50) · Value ₹…" and the pages
        _footer.Summary = If(_filtered.Count = 0, "No orders", (start + 1) & "–" & (start + pageRows.Count) & " of " & _filtered.Count & " orders") &
                          If(_filtered.Count <> _rows.Count, " (filtered from " & _rows.Count & ")", "")
        _footer.Value = If(_filtered.Count > 0, Theme.Money(Math.Round(_filtered.Sum(Function(o) Js.Num(o, "total")), 2)), "")
        _footer.Pager.PageCount = pages
        _footer.Pager.Page = _page
        _footer.ShowSummary = Show("or2-summary")
        _footer.Pager.Visible = Show("or2-pager") AndAlso pages > 1
        _footer.Invalidate()

        ' what is shown (Display Options)
        Kit.Show(_range, Show("or2-range"))
        Kit.Show(_tabs, Show("or2-tabs"))
        Kit.Show(_topLine, Show("or2-range") AndAlso Show("or2-tabs"))
        Kit.Show(_top, Show("or2-range") OrElse Show("or2-tabs"))
        For Each kv In _m : Kit.Show(kv.Value, Show(kv.Key)) : Next
        Kit.Show(_cards, Show("or2-cards"))
        Kit.Show(_search, Show("or2-t-search"))
        Dim fo = Show("or2-filters")
        Kit.Show(_fPay, fo AndAlso Show("or2-f-payment")) : Kit.Show(_fMethod, fo AndAlso Show("or2-f-method"))
        Kit.Show(_fProduct, fo AndAlso Show("or2-f-product")) : Kit.Show(_fAgent, fo AndAlso Show("or2-f-agent") AndAlso Agents.Count > 0)
        Kit.Show(_fDues, fo AndAlso Show("or2-f-dues"))
        Kit.Show(_clear, _search.Text.Trim() <> "" OrElse {_fPay, _fMethod, _fProduct, _fAgent, _fDues}.Any(Function(f) f.IsOn))
        Kit.Show(_perPage, Show("or2-t-pagesize"))
        _bulk.Count = _picked.Count
        _bulk.CanDecide = CanDecide
        _bulk.Agents = Agents
        Kit.Show(_bulk, _picked.Count > 0 AndAlso Show("or2-bulk"))
        _bulk.Invalidate()
        Kit.Show(_section, Show("or2-table"))
        _tools.PerformLayout()
    End Sub

    ' ── drawing the cells ──
    Private ReadOnly _f14 As Font = Theme.Px(14)
    Private ReadOnly _f14m As Font = Theme.Px(14, 500)
    Private ReadOnly _f14s As Font = Theme.Px(14, 600)
    Private ReadOnly _f12 As Font = Theme.Px(12)
    Private ReadOnly _f12s As Font = Theme.Px(12, 600)
    Private ReadOnly _f12b As Font = Theme.Px(12, 600)

    Private Const TF As TextFormatFlags = TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or TextFormatFlags.SingleLine

    ''' <summary>Top of a stack of lines centred in the row.</summary>
    Private Shared Function Top(cell As Rectangle, h As Integer) As Integer
        Return cell.Y + (cell.Height - h) \ 2
    End Function

    Private Sub DrawOrder(g As Graphics, c As Rectangle, o As JsonObject)
        Dim hasDate = DShow("or2-d-date")
        Dim y = Top(c, If(hasDate, 38, 20))
        Dim num = If(Js.Str(o, "localRef") <> "", "Uploading…", Js.Str(o, "number"))
        Tr.DrawText(g, num, _f14m, New Rectangle(c.X, y, c.Width, 20), Web.Blue, TF)
        If hasDate Then Tr.DrawText(g, Fmt.IstStamp(Js.Time(o, "createdAt")), _f12, New Rectangle(c.X, y + 21, c.Width, 17), Theme.G500, TF)
    End Sub

    Private Function Contacts(o As JsonObject) As List(Of (Key As String, Icon As String, Bg As Color, Fg As Color))
        Dim l As New List(Of (String, String, Color, Color))
        If Not Show("or2-c-contact") Then Return l
        If Js.Str(o, "phone") <> "" Then
            l.Add(("call", "phone", Theme.G100, Theme.G600))
            l.Add(("wa", "message-circle", Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(5, &H96, &H69)))
        End If
        If Not Js.IsNull(o, "lat") AndAlso Not Js.IsNull(o, "lng") Then l.Add(("map", "map-pin", Color.FromArgb(&HF0, &HF9, &HFF), Color.FromArgb(2, &H84, &HC7)))
        Return l
    End Function

    Private Sub CustomerLayout(o As JsonObject, c As Rectangle, ByRef y As Integer, ByRef hasPhone As Boolean, ByRef btnY As Integer)
        hasPhone = DShow("or2-d-phone")
        Dim btns = Contacts(o).Count > 0
        Dim h = 20 + If(hasPhone, 17, 0) + If(btns, 4 + 24, 0)
        y = Top(c, h)
        btnY = y + 20 + If(hasPhone, 17, 0) + 4
    End Sub

    Private Sub DrawCustomer(g As Graphics, c As Rectangle, o As JsonObject)
        Dim y As Integer, hasPhone As Boolean, by As Integer
        CustomerLayout(o, c, y, hasPhone, by)
        Dim name = Js.Str(o, "customer") & If(Js.IsNull(o, "customerId") AndAlso Js.Bool(o, "guest"), " (guest)", "")
        Tr.DrawText(g, name, _f14m, New Rectangle(c.X, y, c.Width, 20), Theme.G900, TF)
        If hasPhone Then Tr.DrawText(g, If(Js.Str(o, "phone") <> "", Js.Str(o, "phone"), If(Js.Str(o, "email") <> "", Js.Str(o, "email"), "No contact")), _f12, New Rectangle(c.X, y + 20, c.Width, 17), Theme.G500, TF)
        Dim x = c.X
        For Each b In Contacts(o)
            Dim r As New Rectangle(x, by, 24, 24)
            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, 24, 24), Theme.Radius)
                Using br As New SolidBrush(b.Bg) : g.FillPath(br, p) : End Using
            End Using
            Icons.Draw(g, b.Icon, New RectangleF(r.X + 6, r.Y + 6, 12, 12), b.Fg)
            x += 28
        Next
    End Sub

    Private Sub DrawItems(g As Graphics, c As Rectangle, o As JsonObject)
        Dim n = ItemCount(o)
        Dim sub_ = DShow("or2-d-itemname")
        Dim y = Top(c, If(sub_, 37, 20))
        Tr.DrawText(g, n & " item" & If(n = 1, "", "s"), _f14, New Rectangle(c.X, y, c.Width, 20), Theme.G800, TF)
        If sub_ Then
            Dim first = Js.Objs(Js.Arr(o, "items")).FirstOrDefault()
            Tr.DrawText(g, If(first Is Nothing, "—", Js.Str(first, "name")), _f12, New Rectangle(c.X, y + 20, c.Width, 17), Theme.G500, TF)
        End If
    End Sub

    Private Sub DrawTotal(g As Graphics, c As Rectangle, o As JsonObject)
        Dim d = Due(o)
        Dim showDue = d > Paisa AndAlso DShow("or2-d-due")
        Dim y = Top(c, If(showDue, 37, 20))
        Tr.DrawText(g, Theme.Money(Js.Num(o, "total")), _f14s, New Rectangle(c.X, y, c.Width, 20), Theme.G900, TF)
        If showDue Then Tr.DrawText(g, Theme.Money(d) & " due", _f12s, New Rectangle(c.X, y + 20, c.Width, 17), Color.FromArgb(&HDC, &H35, &H45), TF)
    End Sub

    Private Sub DrawPayment(g As Graphics, c As Rectangle, o As JsonObject)
        Dim st = If(Js.Str(o, "paymentStatus") = "Paid", "Paid", Js.Str(o, "paymentStatus", "Unpaid"))
        Dim sub_ = DShow("or2-d-method")
        Dim y = Top(c, If(sub_, 30 + 19, 30))
        Web.DrawPill(g, st, c.X, y + 15, Web.PaymentStatusColor(st), CanEdit)
        If sub_ Then Tr.DrawText(g, Method(o), _f12, New Rectangle(c.X, y + 32, c.Width, 17), Theme.G500, TF)
    End Sub

    Private Function Decide(o As JsonObject) As Boolean
        Return CanEdit AndAlso Js.Str(o, "status") = "Pending" AndAlso DShow("or2-d-decide") AndAlso Js.Int(o, "id") > 0
    End Function

    Private Sub StatusLayout(o As JsonObject, c As Rectangle, ByRef y As Integer, ByRef agentLine As Boolean, ByRef decideY As Integer)
        agentLine = Not Js.IsNull(o, "agentId") AndAlso DShow("or2-d-agentline")
        Dim h = 30 + If(agentLine, 4 + 17, 0) + If(Decide(o), 6 + 32, 0)
        y = Top(c, h)
        decideY = y + 30 + If(agentLine, 21, 0) + 6
    End Sub

    Private Function DecideRects(o As JsonObject, c As Rectangle) As (Accept As Rectangle, Reject As Rectangle)
        Dim y As Integer, al As Boolean, dy As Integer
        StatusLayout(o, c, y, al, dy)
        Dim aw = 10 + 14 + 4 + Tr.MeasureText("Accept", _f12b).Width + 10
        Dim rw = 10 + 14 + 4 + Tr.MeasureText("Reject", _f12b).Width + 10
        Return (New Rectangle(c.X, dy, aw, 32), New Rectangle(c.X + aw + 6, dy, rw, 32))
    End Function

    Private Sub DrawStatus(g As Graphics, c As Rectangle, o As JsonObject)
        Dim y As Integer, agentLine As Boolean, dy As Integer
        StatusLayout(o, c, y, agentLine, dy)
        Dim st = Js.Str(o, "status")
        Web.DrawPill(g, st, c.X, y + 15, Web.OrderStatusColor(st), CanEdit AndAlso Js.Int(o, "id") > 0)
        If agentLine Then Tr.DrawText(g, "🛵 " & OrderActions.AgentName(Js.Int(o, "agentId")), _f12, New Rectangle(c.X, y + 34, c.Width, 17), Theme.G500, TF)
        If Decide(o) Then
            Dim r = DecideRects(o, c)
            Using p = Theme.RoundRect(New RectangleF(r.Accept.X, r.Accept.Y, r.Accept.Width, r.Accept.Height), Theme.Radius)
                Using b As New SolidBrush(Color.FromArgb(5, &H96, &H69)) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, "check", New RectangleF(r.Accept.X + 10, r.Accept.Y + 9, 14, 14), Color.White, 3)
            Tr.DrawText(g, "Accept", _f12b, New Rectangle(r.Accept.X + 28, r.Accept.Y, r.Accept.Width - 28, 32), Color.White, TextFormatFlags.VerticalCenter Or TF)
            Using p = Theme.RoundRect(New RectangleF(r.Reject.X + 0.5F, r.Reject.Y + 0.5F, r.Reject.Width - 1, r.Reject.Height - 1), Theme.Radius)
                Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                Using pen As New Pen(Color.FromArgb(&HFE, &HCA, &HCA)) : g.DrawPath(pen, p) : End Using
            End Using
            Icons.Draw(g, "x", New RectangleF(r.Reject.X + 10, r.Reject.Y + 9, 14, 14), Color.FromArgb(&HDC, &H26, &H26), 3)
            Tr.DrawText(g, "Reject", _f12b, New Rectangle(r.Reject.X + 28, r.Reject.Y, r.Reject.Width - 28, 32), Color.FromArgb(&HDC, &H26, &H26), TextFormatFlags.VerticalCenter Or TF)
        End If
    End Sub

    Private Function AgentFixed(o As JsonObject) As Boolean
        Dim st = Js.Str(o, "status")
        Return st = "Delivered" OrElse st = "Canceled" OrElse Js.Int(o, "id") <= 0
    End Function

    Private Sub DrawAgent(g As Graphics, c As Rectangle, o As JsonObject)
        Dim name = If(Js.IsNull(o, "agentId"), "", OrderActions.AgentName(Js.Int(o, "agentId")))
        If AgentFixed(o) Then
            Tr.DrawText(g, If(name = "", "—", name), _f14, c, Theme.G600, TextFormatFlags.VerticalCenter Or TF)
            Return
        End If
        Dim r As New Rectangle(c.X, c.Y + (c.Height - 36) \ 2, c.Width, 36)
        Dim has = name <> ""
        Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(has, Color.FromArgb(&HBA, &HE6, &HFD), Theme.G300)) With {.DashStyle = If(has, Drawing2D.DashStyle.Solid, Drawing2D.DashStyle.Dash)}
                g.DrawPath(pen, p)
            End Using
        End Using
        Tr.DrawText(g, If(has, name, "Assign agent…"), _f14, New Rectangle(r.X + 10, r.Y, r.Width - 34, r.Height), If(has, Color.FromArgb(7, &H59, &H85), Theme.G500), TextFormatFlags.VerticalCenter Or TF)
        Icons.Draw(g, "chevron-down", New RectangleF(r.Right - 24, r.Y + 11, 14, 14), Theme.G500)
    End Sub

    Private Function ActionRects(o As JsonObject, c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim l As New List(Of (String, Rectangle))
        Dim y = c.Y + (c.Height - 34) \ 2
        l.Add(("view", New Rectangle(c.X, y, 34, 34)))
        If CanBill Then l.Add(("print", New Rectangle(c.X + 40, y, 34, 34)))
        Return l
    End Function

    Private Sub DrawActions(g As Graphics, c As Rectangle, o As JsonObject)
        For Each a In ActionRects(o, c)
            Web.DrawIconAction(g, a.R, If(a.Key = "view", "eye", "printer"), Web.PillSecondary, a.R.Contains(_table.HoverPoint))
        Next
    End Sub

    ''' <summary>The clickable spots of a cell (for the hand cursor and clicks).</summary>
    Private Function Spots(o As JsonObject, col As TCol, c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim l As New List(Of (String, Rectangle))
        Select Case col.Key
            Case "created"
                l.Add(("open", New Rectangle(c.X, c.Y + (c.Height - 40) \ 2, Math.Min(c.Width, Tr.MeasureText(Js.Str(o, "number"), _f14m).Width + 2), 22)))
            Case "customer"
                Dim y As Integer, hp As Boolean, by As Integer
                CustomerLayout(o, c, y, hp, by)
                If Not Js.IsNull(o, "customerId") Then l.Add(("customer", New Rectangle(c.X, y, Math.Min(c.Width, Tr.MeasureText(Js.Str(o, "customer"), _f14m).Width + 2), 20)))
                Dim x = c.X
                For Each b In Contacts(o)
                    l.Add((b.Key, New Rectangle(x, by, 24, 24)))
                    x += 28
                Next
            Case "items"
                l.Add(("items", New Rectangle(c.X, c.Y + 8, c.Width, c.Height - 16)))
            Case "payment"
                If CanEdit AndAlso Js.Int(o, "id") > 0 Then
                    Dim st = If(Js.Str(o, "paymentStatus") = "Paid", "Paid", Js.Str(o, "paymentStatus", "Unpaid"))
                    Dim y = Top(c, If(DShow("or2-d-method"), 49, 30))
                    l.Add(("payment", New Rectangle(c.X, y, Web.PillWidth(st, True), 30)))
                End If
            Case "status"
                If CanEdit AndAlso Js.Int(o, "id") > 0 Then
                    Dim y As Integer, al As Boolean, dy As Integer
                    StatusLayout(o, c, y, al, dy)
                    l.Add(("status", New Rectangle(c.X, y, Web.PillWidth(Js.Str(o, "status"), True), 30)))
                    If Decide(o) Then
                        Dim r = DecideRects(o, c)
                        l.Add(("accept", r.Accept)) : l.Add(("reject", r.Reject))
                    End If
                End If
            Case "agent"
                If Not AgentFixed(o) Then l.Add(("agent", New Rectangle(c.X, c.Y + (c.Height - 36) \ 2, c.Width, 36)))
            Case "actions"
                l.AddRange(ActionRects(o, c))
        End Select
        Return l
    End Function

    Private Sub CellClick(o As JsonObject, col As TCol, cell As Rectangle, pt As Point)
        Dim hit = Spots(o, col, cell).FirstOrDefault(Function(s) s.R.Contains(pt))
        If hit.Key Is Nothing Then Return
        Dim below = _table.PointToScreen(New Point(hit.R.X, hit.R.Bottom + 2))
        Select Case hit.Key
            Case "open", "view" : Open(o)
            Case "customer" : Main?.Push(New CustomerProfilePage(Js.Int(o, "customerId")))
            Case "call"
                Try : Clipboard.SetText(Js.Str(o, "phone")) : Catch : End Try
                Ui.OpenUrl("tel:" & Js.Str(o, "phone"))
                Toast("Number copied: " & Js.Str(o, "phone"))
            Case "wa" : Ui.OpenUrl(Ui.WhatsApp(Js.Str(o, "phone")))
            Case "map" : Ui.OpenUrl("https://www.google.com/maps?q=" & Js.Num(o, "lat").ToString(Globalization.CultureInfo.InvariantCulture) & "," & Js.Num(o, "lng").ToString(Globalization.CultureInfo.InvariantCulture))
            Case "items" : ItemsDialog(o)
            Case "print" : OrderActions.PrintOrder(o, Me)
            Case "payment"
                Dim cur = Js.Str(o, "paymentStatus")
                WebMenu.Show(_table, {If(cur = "Paid", "*", "") & "Paid|Paid", If(cur <> "Paid", "*", "") & "Unpaid|Unpaid"}, Sub(k) If k <> cur Then OrderActions.SetPayment(o, k, Me), below)
            Case "status"
                Dim cur = Js.Str(o, "status")
                WebMenu.Show(_table, Statuses.Select(Function(s) If(s = cur, "*", "") & s & "|" & s), Sub(k) If k <> cur Then OrderActions.SetStatusAny(o, k, Me), below)
            Case "accept" : OrderActions.Accept(o, Me)
            Case "reject" : OrderActions.RejectWithReason(o, Me)
            Case "agent"
                Dim items As New List(Of String)
                items.Add("0|" & If(Js.IsNull(o, "agentId"), "Assign agent…", "Remove agent"))
                For Each a In Agents : items.Add(If(Js.Int(a, "id") = Js.Int(o, "agentId"), "*", "") & Js.Int(a, "id") & "|" & Js.Str(a, "name")) : Next
                WebMenu.Show(_table, items, Sub(k)
                                                Dim id = CInt(k)
                                                If id = 0 Then
                                                    If Not Js.IsNull(o, "agentId") Then OrderActions.Unassign(o, Me)
                                                ElseIf id <> Js.Int(o, "agentId") Then
                                                    OrderActions.Assign(o, Agents.First(Function(a) Js.Int(a, "id") = id), Me)
                                                End If
                                            End Sub, below)
        End Select
    End Sub

    Private Sub Open(o As JsonObject)
        If Js.Str(o, "localRef") <> "" Then Toast("This order is still uploading — open it in a moment.") : Return
        Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
    End Sub

    ''' <summary>The website's items pop-up: when, total / paid / due, each item, where it ships, map, open.</summary>
    Private Sub ItemsDialog(o As JsonObject)
        Dim f As New FormDialog(Js.Str(o, "number") & " — " & Js.Str(o, "customer"), 440, "Open full order")
        Dim d = Due(o)
        f.AddNote("Placed: " & Fmt.IstStamp(Js.Time(o, "createdAt")) & "    Total: " & Theme.Money(Js.Num(o, "total")) & "    Paid: " & Theme.Money(Js.Num(o, "paid")) & If(d > Paisa, "    Due: " & Theme.Money(d), ""), Theme.G700)
        Dim t As New WebTable() With {.RowHeight = 48, .Modern = True}
        t.Cols.Add(New TCol("Item", Function(i) Js.Str(i, "name"), 0, CellKind.Text) With {.Sub = Function(i) Fmt.Num(Js.Num(i, "qty")) & " × " & Theme.Money(Js.Num(i, "price"))})
        t.Cols.Add(New TCol("Amount", Function(i) Theme.Money(Math.Round(Js.Num(i, "qty") * Js.Num(i, "price"), 2)), 120, CellKind.Money) With {.Right = True})
        t.Rows = Js.Objs(Js.Arr(o, "items"))
        f.AddControl(t)
        If Js.Str(o, "address") <> "" Then f.AddNote("Ships to: " & Js.Str(o, "address"))
        If Not Js.IsNull(o, "lat") Then
            f.AddControl(Ui.Btn("📍 Open delivery location in Google Maps", "", Color.FromArgb(4, &H78, &H57), outline:=True, click:=Sub() Ui.OpenUrl("https://www.google.com/maps?q=" & Js.Num(o, "lat").ToString(Globalization.CultureInfo.InvariantCulture) & "," & Js.Num(o, "lng").ToString(Globalization.CultureInfo.InvariantCulture))))
        End If
        If f.ShowDialog(FindForm()) = DialogResult.OK Then Open(o)
    End Sub

    ' ── bulk actions ──
    Private Sub BulkAccept()
        Dim n = 0
        For Each o In AppState.I.AllOrders().Where(Function(x) _picked.Contains(Js.Int(x, "id")) AndAlso Js.Str(x, "status") = "Pending")
            OrderActions.Accept(o)
            n += 1
        Next
        _picked.Clear()
        Toast(n & " order" & If(n = 1, "", "s") & " accepted.")
        Refresh_()
    End Sub

    Private Sub BulkAssign(agentId As Integer)
        Dim ag = Agents.FirstOrDefault(Function(a) Js.Int(a, "id") = agentId)
        If ag Is Nothing Then Return
        Dim n = 0
        For Each o In AppState.I.AllOrders().Where(Function(x) _picked.Contains(Js.Int(x, "id")) AndAlso Js.Str(x, "status") <> "Delivered" AndAlso Js.Str(x, "status") <> "Canceled")
            OrderActions.Assign(o, ag)
            n += 1
        Next
        _picked.Clear()
        Toast(n & " order" & If(n = 1, "", "s") & " sent out with " & Js.Str(ag, "name") & ".")
        Refresh_()
    End Sub

    ' ── Export (header): the orders shown, as on the website's CSV ──
    Private Sub DoExport()
        If _filtered.Count = 0 Then Toast("There are no orders to export.", True) : Return
        Export.Csv(Me, "orders-" & If(_tabs.Current = "", "all", _tabs.Current) & "-" & Date.Today.ToString("yyyy-MM-dd"), {"Order", "Date", "Customer", "Phone", "Email", "Items", "Total", "Paid", "Due", "Payment", "Method", "Status", "Address", "Products"},
                   _filtered.Select(Function(o) CType({Js.Str(o, "number"), Fmt.IstStamp(Js.Time(o, "createdAt")), Js.Str(o, "customer"), Js.Str(o, "phone"), Js.Str(o, "email"),
                        CObj(ItemCount(o)), CObj(Js.Num(o, "total").ToString("0.00")), CObj(Js.Num(o, "paid").ToString("0.00")), CObj(Due(o).ToString("0.00")), Js.Str(o, "paymentStatus"),
                        Method(o), Js.Str(o, "status"), Js.Str(o, "address"), String.Join(" | ", Js.Objs(Js.Arr(o, "items")).Select(Function(i) Js.Str(i, "name") & " x" & Js.Str(i, "qty")))}, IEnumerable(Of Object))))
    End Sub
End Class
