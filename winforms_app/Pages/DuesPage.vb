Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Due — a port of the website's Due2Body.tsx: the date range bar, 4 cards (click to filter), 5 labelled
''' filters, Show n entries · Collect (ticked dues) · Clear filters · Search, the bordered dues table (customer, order,
''' amount / paid, balance, promise date — click to change it, status, Collect + payment history) and "Balance shown".
''' Unpaid dues are synced; paid ones (180 days) are page data — all on this computer.</summary>
Public Class DuesPage
    Inherits ScrollPage

    Private Const Paisa As Double = 0.004
    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_due2_display")
    Private ReadOnly _export As New HeadButton("Export", "download")
    Private ReadOnly _rangeCard As New CardBox(Nothing, "", 1)
    Private ReadOnly _range As New RangeChips() With {.Outline = True, .Note = "To filter the table by these dates, set " & ChrW(&H201C) & "Date range applies to" & ChrW(&H201D) & " (created, promise date or payment received)."}
    Private ReadOnly _cards As New Columns(4, 200, 16)
    Private ReadOnly _m As New Dictionary(Of String, DueCard)
    Private ReadOnly _filterCard As New CardBox(Nothing, "", 14)
    Private ReadOnly _filterRow As New Columns(5, 190, 12)
    Private ReadOnly _fStatus As New LabelSelect("receipt", "Status")
    Private ReadOnly _fPromise As New LabelSelect("calendar-clock", "Promise Date")
    Private ReadOnly _fSource As New LabelSelect("package", "Order Source")
    Private ReadOnly _fProduct As New LabelSelect("package", "Product")
    Private ReadOnly _fDate As New LabelSelect("calendar-days", "Date range applies to")
    Private ReadOnly _section As New CardBox(Nothing, "", 28)
    Private ReadOnly _tools As New ToolRow()
    Private ReadOnly _perPage As ComboBox = Ui.Filter({"10|10", "25|25", "50|50", "100|100", "0|All"}, 90)
    Private ReadOnly _collect As New HeadButton("Collect", "hand-coins", Web.PillSuccess) With {.Height = 30}
    Private ReadOnly _clearSel As New LinkLabel2("Clear selection", Theme.G500)
    Private ReadOnly _clearFilters As New LinkLabel2("Clear filters", Web.Blue, "x")
    Private ReadOnly _search As New SearchField("Name, phone, order, product…", 260) With {.Height = 40}
    Private ReadOnly _searchBox As New Panel With {.BackColor = Color.White, .Height = 40}
    Private ReadOnly _table As New WebTable() With {.Modern = True, .Grid = True, .HeadHeight = 50, .RowHeight = 84}
    Private ReadOnly _foot As New LedgerFooter(15) With {.BalanceStyle = True}
    Private ReadOnly _picked As New HashSet(Of Integer)
    Private _all As New List(Of JsonObject)
    Private _shown As New List(Of JsonObject)
    Private _page As Integer = 1
    Private _sortKey As String = "promise", _sortDesc As Boolean = False

    Public Overrides ReadOnly Property PageTitle As String = "Due"
    Public Overrides ReadOnly Property PageSubtitle As String = "Who owes what, when they promised to pay, and what has been collected"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export}
        End Get
    End Property

    Private Function Show(k As String) As Boolean
        Return Not _display.Hidden.Contains(k)
    End Function

    Public Sub New()
        _rangeCard.Add(_range)
        Body.Add(_rangeCard)
        For Each m In {("due2-k-total", "indian-rupee", Color.FromArgb(&HFE, &HF2, &HF2), Color.FromArgb(&HDC, &H26, &H26)),
                       ("due2-k-overdue", "triangle-alert", Color.FromArgb(&HFF, &HF7, &HED), Color.FromArgb(&HEA, &H58, &HC)),
                       ("due2-k-today", "calendar-clock", Color.FromArgb(&HFF, &HFB, &HEB), Color.FromArgb(&HD9, &H77, 6)),
                       ("due2-k-people", "users", Color.FromArgb(&HF0, &HF9, &HFF), Color.FromArgb(2, &H84, &HC7))}
            Dim key = m.Item1
            Dim c = _cards.Add(New DueCard(m.Item2, m.Item3, m.Item4))
            AddHandler c.Click, Sub()
                                    ResetFilters()
                                    If key = "due2-k-overdue" Then _fPromise.Value = "overdue"
                                    If key = "due2-k-today" Then _fPromise.Value = "today"
                                    Refresh_(True)
                                End Sub
            _m(key) = c
        Next
        Body.Add(_cards)
        _fStatus.SetOptions({"unpaid|Unpaid only", "partial|Partly paid", "paid|Fully paid", "all|All dues"})
        _fStatus.Value = "unpaid"
        _fPromise.SetOptions({"all|All", "overdue|Overdue", "today|Due today", "upcoming|Upcoming", "none|No date set"})
        _fSource.SetOptions({"all|All orders", "offline|In-store (POS)", "online|Online"})
        _fProduct.SetOptions({"all|All products"})
        _fDate.SetOptions({"none|Ignore date range", "created|Due created", "promised|Promise date", "paid|Payment received"})
        _fDate.Value = "none"
        For Each f In {_fStatus, _fPromise, _fSource, _fProduct, _fDate}
            _filterRow.Add(f)
            AddHandler f.Changed, Sub() Refresh_(True)
        Next
        _filterCard.Add(_filterRow)
        Body.Add(_filterCard)

        Ui.SetVal(_perPage, "10")
        DirectCast(_perPage, WebCombo).EditHeight = 32
        Dim searchLbl As New Label With {.Text = "Search:", .AutoSize = False, .Font = Theme.Px(15), .ForeColor = Theme.G900, .BackColor = Color.White,
                                         .TextAlign = ContentAlignment.MiddleLeft, .Width = Tr.MeasureText("Search:", Theme.Px(15)).Width + 2, .Height = 40}
        _searchBox.Width = searchLbl.Width + 8 + _search.Width
        _searchBox.Controls.AddRange(New Control() {searchLbl, _search})
        AddHandler _searchBox.Layout, Sub()
                                          searchLbl.SetBounds(0, 0, searchLbl.Width, 40)
                                          _search.SetBounds(_searchBox.Width - _search.Width, 0, _search.Width, 40)
                                      End Sub
        _tools.Left.AddRange({Lbl("Show"), _perPage, Lbl("entries"), _collect, _clearSel, _clearFilters})
        _tools.Right = _searchBox
        _section.Add(_tools)
        _section.Add(_table)
        _section.Add(_foot)
        Body.Add(_section)

        AddHandler _range.Changed, Sub() Refresh_(True)
        AddHandler _search.Changed, Sub() Refresh_(True)
        AddHandler _perPage.SelectedIndexChanged, Sub() Refresh_(True)
        AddHandler _foot.Pager.PageChanged, Sub()
                                                _page = _foot.Pager.Page
                                                Refresh_()
                                            End Sub
        AddHandler _collect.Click, Sub()
                                       Dim rows = _shown.Where(Function(d) _picked.Contains(Js.Int(d, "id")) AndAlso Open(d)).ToList()
                                       If rows.Count = 0 Then Return
                                       DueActions.Collect(Me, rows)
                                       _picked.Clear()
                                       Refresh_()
                                   End Sub
        AddHandler _clearSel.Click, Sub()
                                        _picked.Clear()
                                        Refresh_()
                                    End Sub
        AddHandler _clearFilters.Click, Sub()
                                            ResetFilters()
                                            Refresh_(True)
                                        End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        AddHandler _table.SortChanged, Sub()
                                           Dim k = CStr(_table.SortCol?.Key)
                                           If k <> _sortKey Then _sortDesc = Not (k = "customer" OrElse k = "promise") Else _sortDesc = Not _table.SortAsc
                                           _sortKey = k
                                           Refresh_(True)
                                       End Sub
        AddHandler _table.SelectionChanged, Sub()
                                                For Each d In _table.Rows
                                                    Dim id = Js.Int(d, "id")
                                                    If _table.Selected.Contains(id.ToString()) AndAlso Open(d) Then _picked.Add(id) Else _picked.Remove(id)
                                                Next
                                                Refresh_()
                                            End Sub
        AddHandler _table.CellClickAt, AddressOf CellClick
        _table.HotSpot = Function(o, c, cell, pt) Spots(o, c, cell).Any(Function(s) s.R.Contains(pt))
        BuildCols()
    End Sub

    Private Shared Function Lbl(text As String) As Label
        Return New Label With {.Text = text, .AutoSize = False, .Font = Theme.Px(15), .ForeColor = Theme.G900, .BackColor = Color.White,
                               .TextAlign = ContentAlignment.MiddleLeft, .Width = Tr.MeasureText(text, Theme.Px(15)).Width + 2, .Height = 36}
    End Function

    Private Overloads Sub Refresh_(Optional firstPage As Boolean = False)
        If firstPage Then _page = 1
        MyBase.Refresh_()
    End Sub

    Private Sub ResetFilters()
        _fStatus.Value = "unpaid" : _fPromise.Value = "all" : _fSource.Value = "all" : _fProduct.Value = "all" : _fDate.Value = "none"
        _search.Text = ""
    End Sub

    ' ── due rules (India days, as on the website) ──
    Private Shared Function Open(d As JsonObject) As Boolean
        Return Js.Num(d, "balance") > Paisa
    End Function
    Private Shared Function PromiseDay(d As JsonObject) As Date?
        Dim t = Js.Time(d, "promised")
        Return If(t.HasValue, Fmt.IstDay(t), CType(Nothing, Date?))
    End Function
    Private Shared Function OverdueDays(d As JsonObject) As Integer
        Dim p = PromiseDay(d)
        If Not Open(d) OrElse Not p.HasValue Then Return 0
        Return Math.Max(0, CInt((Fmt.IstToday() - p.Value).TotalDays))
    End Function
    Private Shared Function DueToday(d As JsonObject) As Boolean
        Dim p = PromiseDay(d)
        Return p.HasValue AndAlso p.Value = Fmt.IstToday()
    End Function
    Private Shared Function State(d As JsonObject) As String
        If Not Open(d) Then Return "Paid"
        If OverdueDays(d) > 0 Then Return "Overdue"
        Return If(Js.Num(d, "paid") > Paisa, "Partly", "Unpaid")
    End Function
    Private Shared Function StateColour(st As String) As Color
        Select Case st
            Case "Paid" : Return Web.PillSuccess
            Case "Overdue" : Return Web.PillDanger
            Case "Partly" : Return Web.PillWarning
        End Select
        Return Web.PillSecondary
    End Function

    Private Function CanCollect() As Boolean
        Dim p = AppState.I.Perm
        Return p.Has("ecommerce", "manage_credits") OrElse p.Has("ecommerce", "manage_billing") OrElse p.Has("ecommerce", "manage_customers")
    End Function

    ' ── columns (widths as on the website; Customer takes what is left) ──
    Private Sub BuildCols()
        Dim t = _table
        t.Cols.Clear()
        Dim col = Function(k As String) Show("due2-table") AndAlso Show(k)
        t.Selectable = col("due2-c-select") AndAlso CanCollect()
        If col("due2-c-customer") Then t.Cols.Add(New TCol("Customer", Nothing, 0, CellKind.Custom) With {.Key = "customer", .Sort = Function(d) Js.Str(d, "customer").ToLowerInvariant(), .Draw = AddressOf DrawCustomer})
        If col("due2-c-order") Then t.Cols.Add(New TCol("Order", Nothing, 170, CellKind.Custom) With {.Key = "order", .Draw = AddressOf DrawOrder})
        If col("due2-c-amount") Then t.Cols.Add(New TCol("Amount / Paid", Nothing, 150, CellKind.Custom) With {.Key = "amount", .Draw = AddressOf DrawAmount})
        If col("due2-c-balance") Then t.Cols.Add(New TCol("Balance", Nothing, 130, CellKind.Custom) With {.Key = "balance", .Sort = Function(d) Js.Num(d, "balance"), .Draw = AddressOf DrawBalance})
        If col("due2-c-promise") Then t.Cols.Add(New TCol("Promise Date", Nothing, 190, CellKind.Custom) With {.Key = "promise", .Sort = Function(d) Js.Str(d, "promised"), .Draw = AddressOf DrawPromise})
        If col("due2-c-status") Then t.Cols.Add(New TCol("Status", Nothing, 120, CellKind.Custom) With {.Key = "status", .Draw = Sub(g, c, d) Web.DrawPill(g, State(d), c.X, c.Y + c.Height \ 2, StateColour(State(d)))})
        If col("due2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 180, CellKind.Custom) With {.Key = "actions", .Draw = AddressOf DrawActions})
        t.RowClickable = False
        t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Key = _sortKey)
        t.SortAsc = Not _sortDesc
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim unpaid = s.List("dues")
        Dim ids = unpaid.Select(Function(u) Js.Int(u, "id")).ToHashSet()
        _all = unpaid.Concat(s.PageList("dues_paid").Where(Function(d) Not ids.Contains(Js.Int(d, "id")))).ToList()
        Dim open_ = _all.Where(AddressOf Open).ToList()

        ' products on the dues, most common first (as on the website)
        Dim products As New Dictionary(Of Integer, (Name As String, N As Integer))
        For Each d In _all
            For Each p In Js.Objs(Js.Arr(d, "products"))
                Dim pid = Js.Int(p, "id")
                Dim had As (String, Integer) = Nothing
                If products.TryGetValue(pid, had) Then products(pid) = (had.Item1, had.Item2 + 1) Else products(pid) = (Js.Str(p, "name"), 1)
            Next
        Next
        _fProduct.SetOptions({"all|All products"}.Concat(products.OrderBy(Function(kv) kv.Value.Name).Select(Function(kv) kv.Key & "|" & kv.Value.Name & " (" & kv.Value.N & ")")))

        Dim status = _fStatus.Value, promise = _fPromise.Value, source = _fSource.Value, product = _fProduct.Value, dateField = _fDate.Value
        Dim from = _range.From, [to] = _range.To
        Dim inRange = Function(t As DateTime?) As Boolean
                          If Not t.HasValue Then Return False
                          Dim dd = Fmt.IstDay(t)
                          Return dd >= from AndAlso dd <= [to]
                      End Function
        Dim term = _search.Text.Trim().ToLowerInvariant()
        Dim today = Fmt.IstToday()
        Dim list = _all.Where(Function(d)
                                  Dim o = Open(d)
                                  If status = "unpaid" AndAlso Not o Then Return False
                                  If status = "paid" AndAlso o Then Return False
                                  If status = "partial" AndAlso Not (o AndAlso Js.Num(d, "paid") > Paisa) Then Return False
                                  If promise = "overdue" AndAlso OverdueDays(d) <= 0 Then Return False
                                  If promise = "today" AndAlso Not DueToday(d) Then Return False
                                  If promise = "upcoming" AndAlso Not (PromiseDay(d).HasValue AndAlso PromiseDay(d).Value > today) Then Return False
                                  If promise = "none" AndAlso PromiseDay(d).HasValue Then Return False
                                  If source <> "all" AndAlso Js.Str(d, "orderType") <> source Then Return False
                                  If product <> "all" AndAlso Not Js.Objs(Js.Arr(d, "products")).Any(Function(p) Js.Int(p, "id").ToString() = product) Then Return False
                                  If dateField = "created" AndAlso Not inRange(Js.Time(d, "createdAt")) Then Return False
                                  If dateField = "promised" AndAlso Not (PromiseDay(d).HasValue AndAlso PromiseDay(d).Value >= from AndAlso PromiseDay(d).Value <= [to]) Then Return False
                                  If dateField = "paid" AndAlso Not Js.Objs(Js.Arr(d, "payments")).Any(Function(p) inRange(Js.Time(p, "at"))) Then Return False
                                  If term <> "" Then
                                      Dim hay = (Js.Str(d, "customer") & " " & Js.Str(d, "phone") & " " & Js.Str(d, "orderNumber") & " " & Js.Str(d, "orderId") & " " & Js.Str(d, "id") & " " &
                                                 String.Join(" ", Js.Objs(Js.Arr(d, "products")).Select(Function(p) Js.Str(p, "name"))) & " " &
                                                 String.Join(" ", Js.Objs(Js.Arr(d, "payments")).Select(Function(p) Js.Str(p, "receipt")))).ToLowerInvariant()
                                      If Not hay.Contains(term) Then Return False
                                  End If
                                  Return True
                              End Function).ToList()
        ' sort: nearest promise first, dues with no date last either way (then the bigger balance)
        Dim dir = If(_sortDesc, -1, 1)
        list.Sort(Function(a, b)
                      Select Case _sortKey
                          Case "balance" : Return Js.Num(a, "balance").CompareTo(Js.Num(b, "balance")) * dir
                          Case "customer" : Return String.Compare(Js.Str(a, "customer").ToLowerInvariant(), Js.Str(b, "customer").ToLowerInvariant(), StringComparison.Ordinal) * dir
                          Case "promise"
                              Dim pa = PromiseDay(a), pb = PromiseDay(b)
                              If Not pa.HasValue OrElse Not pb.HasValue Then
                                  If pa.HasValue = pb.HasValue Then Return Js.Num(b, "balance").CompareTo(Js.Num(a, "balance"))
                                  Return If(pa.HasValue, -1, 1)
                              End If
                              If pa.Value <> pb.Value Then Return pa.Value.CompareTo(pb.Value) * dir
                              Return Js.Num(b, "balance").CompareTo(Js.Num(a, "balance"))
                      End Select
                      Return Js.Str(a, "createdAt").CompareTo(Js.Str(b, "createdAt")) * dir
                  End Function)
        _shown = list
        _picked.RemoveWhere(Function(id) Not _shown.Any(Function(d) Js.Int(d, "id") = id))

        ' cards
        Dim bal = Function(l As IEnumerable(Of JsonObject)) l.Sum(Function(d) Js.Num(d, "balance"))
        Dim overdue = open_.Where(Function(d) OverdueDays(d) > 0).ToList()
        Dim todayList = open_.Where(Function(x) DueToday(x)).ToList()
        Dim people = open_.Select(Function(d) If(Js.IsNull(d, "customerId"), "n:" & Js.Str(d, "customer"), Js.Str(d, "customerId"))).Distinct().Count()
        Dim noFilters = status = "unpaid" AndAlso promise = "all" AndAlso product = "all" AndAlso source = "all" AndAlso dateField = "none"
        _m("due2-k-total").SetValue(Theme.Money(bal(open_)), "Total Due", open_.Count & " unpaid due" & If(open_.Count = 1, "", "s"), noFilters)
        _m("due2-k-overdue").SetValue(Theme.Money(bal(overdue)), "Overdue", overdue.Count & " past promise date", promise = "overdue")
        _m("due2-k-today").SetValue(Theme.Money(bal(todayList)), "Due Today", todayList.Count & " promised for today", promise = "today")
        _m("due2-k-people").SetValue(people.ToString(), "People with Dues", "customers who owe money", False)
        _fStatus.Highlight = status <> "unpaid" : _fPromise.Highlight = promise <> "all" : _fSource.Highlight = source <> "all"
        _fProduct.Highlight = product <> "all" : _fDate.Highlight = dateField <> "none"
        For Each f In {_fStatus, _fPromise, _fSource, _fProduct, _fDate} : f.Invalidate() : Next

        ' page
        Dim size = CInt(Ui.Val(_perPage))
        Dim pages = If(size = 0, 1, Math.Max(1, CInt(Math.Ceiling(_shown.Count / size))))
        _page = Math.Min(_page, pages)
        Dim start = If(size = 0, 0, (_page - 1) * size)
        Dim pageRows = If(size = 0, _shown, _shown.Skip(start).Take(size).ToList())
        _table.Rows = pageRows
        _table.Selected.Clear()
        For Each id In _picked : _table.Selected.Add(id.ToString()) : Next
        _table.MinRows = If(size = 0, 0, Math.Min(size, 5))
        _table.EmptyText = If(_all.Count = 0, "No dues recorded yet.", "No dues match these filters.")
        _table.Invalidate()
        _foot.Text_ = If(_shown.Count = 0, "Showing 0 entries", "Showing " & (start + 1) & " to " & (start + pageRows.Count) & " of " & _shown.Count & " entries") &
                      If(_shown.Count <> _all.Count, " (filtered from " & _all.Count & " total entries)", "")
        _foot.Total = If(_shown.Count > 0, Theme.Money(Math.Round(bal(_shown), 2)), "")
        _foot.Pager.PageCount = pages
        _foot.Pager.Page = _page
        _foot.Pager.Visible = pages > 1
        _foot.Invalidate()
        _foot.PerformLayout()

        ' toolbar
        Dim can = Show("due2-c-select") AndAlso CanCollect()
        _collect.Text = "Collect" & If(_picked.Count > 0, " (" & _picked.Count & ")", "")
        _collect.Enabled = _picked.Count > 0
        Kit.Show(_collect, can)
        Kit.Show(_clearSel, can AndAlso _picked.Count > 0)
        Kit.Show(_clearFilters, Not noFilters OrElse term <> "")
        Kit.Show(_searchBox, Show("due2-t-search"))
        _tools.PerformLayout()

        ' Display Options
        Kit.Show(_rangeCard, Show("due2-range"))
        Dim anyCard = False
        For Each kv In _m
            Kit.Show(kv.Value, Show(kv.Key))
            anyCard = anyCard OrElse Show(kv.Key)
        Next
        Kit.Show(_cards, Show("due2-cards") AndAlso anyCard)
        Dim anyFilter = False
        For Each f In {("due2-f-status", _fStatus), ("due2-f-promise", _fPromise), ("due2-f-source", _fSource), ("due2-f-product", _fProduct), ("due2-f-datefield", _fDate)}
            Kit.Show(f.Item2, Show(f.Item1))
            anyFilter = anyFilter OrElse Show(f.Item1)
        Next
        Kit.Show(_filterCard, Show("due2-filters") AndAlso anyFilter)
        Kit.Show(_section, Show("due2-table"))
    End Sub

    ' ── cells ──
    Private ReadOnly _f15 As Font = Theme.Px(15)
    Private ReadOnly _f15m As Font = Theme.Px(15, 500)
    Private ReadOnly _f12 As Font = Theme.Px(12)
    Private ReadOnly _f12s As Font = Theme.Px(12, 600)
    Private ReadOnly _f18b As Font = Theme.Px(18, 700)
    Private Const TF As TextFormatFlags = TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or TextFormatFlags.SingleLine

    Private Shared Function Top2(c As Rectangle) As Integer
        Return c.Y + (c.Height - 38) \ 2
    End Function

    Private Sub DrawCustomer(g As Graphics, c As Rectangle, d As JsonObject)
        Dim y = Top2(c)
        Dim name = Js.Str(d, "customer")
        Dim hot = Not Js.IsNull(d, "customerId") AndAlso NameRect(d, c).Contains(_table.HoverPoint)
        Tr.DrawText(g, name, _f15m, New Rectangle(c.X, y, c.Width, 21), If(hot, Web.Blue, Theme.G900), TF)
        Dim n = Js.Arr(d, "products").Count
        Tr.DrawText(g, Js.Str(d, "phone", "No phone") & If(n > 0, " · " & n & " item" & If(n = 1, "", "s"), ""), _f12, New Rectangle(c.X, y + 22, c.Width, 16), Theme.G500, TF)
    End Sub
    Private Function NameRect(d As JsonObject, c As Rectangle) As Rectangle
        Return New Rectangle(c.X, Top2(c), Math.Min(c.Width, Tr.MeasureText(Js.Str(d, "customer"), _f15m).Width + 2), 21)
    End Function

    Private Function OrderText(d As JsonObject) As String
        Return Js.Str(d, "orderNumber", "#" & Js.Str(d, "orderId"))
    End Function
    Private Sub DrawOrder(g As Graphics, c As Rectangle, d As JsonObject)
        Dim y = Top2(c)
        Tr.DrawText(g, OrderText(d), _f15, New Rectangle(c.X, y, c.Width, 21), Web.Blue, TF)
        Tr.DrawText(g, If(Js.Str(d, "orderType") = "offline", "In-store", "Online") & " · " & RangeChips.LongDate(Fmt.IstDay(Js.Time(d, "createdAt"))), _f12, New Rectangle(c.X, y + 22, c.Width, 16), Theme.G500, TF)
    End Sub

    Private Sub DrawAmount(g As Graphics, c As Rectangle, d As JsonObject)
        Dim y = Top2(c)
        Tr.DrawText(g, Theme.Money(Js.Num(d, "amount")), _f15, New Rectangle(c.X, y, c.Width, 21), Theme.G900, TF)
        Tr.DrawText(g, "Paid " & Theme.Money(Js.Num(d, "paid")), _f12, New Rectangle(c.X, y + 22, c.Width, 16), Color.FromArgb(5, &H96, &H69), TF)
    End Sub

    Private Sub DrawBalance(g As Graphics, c As Rectangle, d As JsonObject)
        Tr.DrawText(g, Theme.Money(Js.Num(d, "balance")), _f18b, c, If(Open(d), Color.FromArgb(&HDC, &H35, &H45), Color.FromArgb(5, &H96, &H69)), TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Function PromiseText(d As JsonObject) As String
        Dim p = PromiseDay(d)
        Return If(p.HasValue, RangeChips.LongDate(p.Value), If(CanCollect(), "Set a date", "—"))
    End Function
    Private Function PromiseNote(d As JsonObject) As (Text As String, Ink As Color)
        If Open(d) AndAlso OverdueDays(d) > 0 Then Return (OverdueDays(d) & " day" & If(OverdueDays(d) = 1, "", "s") & " overdue", Color.FromArgb(&HEA, &H58, &HC))
        If Open(d) AndAlso DueToday(d) Then Return ("Due today", Color.FromArgb(&HD9, &H77, 6))
        Return ("", Color.Empty)
    End Function
    Private Function PromiseRect(d As JsonObject, c As Rectangle) As Rectangle
        Dim hasNote = PromiseNote(d).Text <> ""
        Return New Rectangle(c.X, If(hasNote, Top2(c), c.Y + (c.Height - 21) \ 2), Math.Min(c.Width, Tr.MeasureText(PromiseText(d), _f15).Width + 2), 21)
    End Function
    Private Sub DrawPromise(g As Graphics, c As Rectangle, d As JsonObject)
        Dim r = PromiseRect(d, c)
        Dim has = PromiseDay(d).HasValue
        Dim hot = CanCollect() AndAlso r.Contains(_table.HoverPoint)
        Tr.DrawText(g, PromiseText(d), _f15, New Rectangle(c.X, r.Y, c.Width, 21), If(hot, Web.Blue, If(has, Theme.G800, Theme.G400)), TF)
        Dim n = PromiseNote(d)
        If n.Text <> "" Then Tr.DrawText(g, n.Text, _f12s, New Rectangle(c.X, r.Y + 22, c.Width, 16), n.Ink, TF)
    End Sub

    Private Function ActionRects(d As JsonObject, c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim l As New List(Of (String, Rectangle))
        Dim y = c.Y + (c.Height - 32) \ 2
        Dim x = c.X
        If CanCollect() AndAlso Open(d) Then
            Dim w = 12 + 14 + 6 + Tr.MeasureText("Collect", Web.PillFont).Width + 12
            l.Add(("collect", New Rectangle(x, y, w, 32)))
            x += w + 6
        End If
        l.Add(("history", New Rectangle(x, y, 12 + 14 + 6 + Tr.MeasureText(Js.Arr(d, "payments").Count.ToString(), Web.PillFont).Width + 12, 32)))
        Return l
    End Function
    Private Sub DrawActions(g As Graphics, c As Rectangle, d As JsonObject)
        For Each a In ActionRects(d, c)
            Dim hot = a.R.Contains(_table.HoverPoint)
            Dim bg = If(a.Key = "collect", Web.PillSuccess, Web.PillSecondary)
            Using p = Theme.RoundRect(New RectangleF(a.R.X, a.R.Y, a.R.Width, a.R.Height), Theme.Radius)
                Using b As New SolidBrush(If(hot, Theme.Darker(bg, 0.9), bg)) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, If(a.Key = "collect", "hand-coins", "receipt"), New RectangleF(a.R.X + 12, a.R.Y + 9, 14, 14), Color.White)
            Tr.DrawText(g, If(a.Key = "collect", "Collect", Js.Arr(d, "payments").Count.ToString()), Web.PillFont, New Rectangle(a.R.X + 32, a.R.Y, a.R.Width - 32, a.R.Height), Color.White, TextFormatFlags.VerticalCenter Or TF)
        Next
    End Sub

    Private Function Spots(d As JsonObject, col As TCol, c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim l As New List(Of (String, Rectangle))
        Select Case col.Key
            Case "customer" : If Not Js.IsNull(d, "customerId") Then l.Add(("customer", NameRect(d, c)))
            Case "order" : If Js.Int(d, "orderId") > 0 Then l.Add(("order", New Rectangle(c.X, Top2(c), Math.Min(c.Width, Tr.MeasureText(OrderText(d), _f15).Width + 2), 21)))
            Case "promise" : If CanCollect() Then l.Add(("promise", PromiseRect(d, c)))
            Case "actions" : l.AddRange(ActionRects(d, c))
        End Select
        Return l
    End Function

    Private Sub CellClick(d As JsonObject, col As TCol, cell As Rectangle, pt As Point)
        Dim hit = Spots(d, col, cell).FirstOrDefault(Function(s) s.R.Contains(pt))
        If hit.Key Is Nothing Then Return
        Select Case hit.Key
            Case "customer" : Main?.Push(New CustomerProfilePage(Js.Int(d, "customerId")))
            Case "order" : Main?.Push(New OrderDetailPage(Js.Int(d, "orderId")))
            Case "promise" : PromiseDate(d)
            Case "collect" : DueActions.Collect(Me, New List(Of JsonObject) From {d})
            Case "history" : Payments(d)
        End Select
    End Sub

    ''' <summary>Set or clear the date the customer promised to pay (website: quick days and "Remove date").</summary>
    Private Sub PromiseDate(d As JsonObject)
        If Not CanCollect() Then Return
        Dim f As New FormDialog("Promise date — " & Js.Str(d, "customer"), 420, "Save date")
        f.AddNote("The day the customer said they would pay. Dues past this date show as Overdue and come first in the list.")
        f.AddDate("d", "Promise date", If(PromiseDay(d), Fmt.IstToday()))
        f.AddPick("quick", "Or pick", {"|—", "0|Today", "1|Tomorrow", "3|+3 days", "7|+7 days", "15|+15 days"}, "")
        If PromiseDay(d).HasValue Then f.AddCheck("remove", "Remove the promise date", False)
        f.AddNote("Owes " & Theme.Money(Js.Num(d, "balance")) & " on " & OrderText(d) & ".", Theme.G500)
        If f.ShowDialog(FindForm()) <> DialogResult.OK Then Return
        Dim remove = PromiseDay(d).HasValue AndAlso f.Bool("remove")
        Dim v = If(f.Val("quick") <> "", Fmt.IstToday().AddDays(CInt(f.Val("quick"))), f.DateOf("d").Value.Date)
        AppState.I.Enqueue(New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/due/set-date",
            .Body = Js.Obj("creditId", Js.Int(d, "id"), "promisedDate", If(remove, Nothing, v.ToString("yyyy-MM-dd") & "T12:00:00+05:30")),
            .Label = Js.Str(d, "customer") & ": " & If(remove, "promise date removed", "promise date " & RangeChips.LongDate(v)),
            .Effect = New JsonObject From {{"kind", "due"}, {"id", Js.Int(d, "id")}, {"fields", Js.Obj("promised", If(remove, Nothing, New DateTime(v.Year, v.Month, v.Day, 6, 30, 0, DateTimeKind.Utc).ToString("o")))}},
            .Refresh = New List(Of String) From {"dues"}})
        Toast(Js.Str(d, "customer") & ": " & If(remove, "promise date removed.", "promise date set to " & RangeChips.LongDate(v) & "."))
    End Sub

    Private Sub Payments(d As JsonObject)
        Dim pays = Js.Objs(Js.Arr(d, "payments"))
        Dim f As New FormDialog("Payments — " & Js.Str(d, "customer"), 580, "Close")
        f.CancelButton_.Visible = False
        f.AddNote("Order: " & OrderText(d) & "    Total: " & Theme.Money(Js.Num(d, "amount")) & "    Paid: " & Theme.Money(Js.Num(d, "paid")) & "    Balance: " & Theme.Money(Js.Num(d, "balance")), Theme.G700)
        If pays.Count = 0 Then
            f.AddNote("No payment has been recorded against this due yet.")
        Else
            Dim t As New WebTable() With {.RowHeight = 50, .Modern = True}
            t.Cols.Add(New TCol("Receipt", Function(p) Js.Str(p, "receipt", "Pending"), 0, CellKind.Link) With {.Flex = 3, .Colour = Function(p) Theme.Blue,
                .Sub = Function(p) Fmt.IstStamp(Js.Time(p, "at")) & " · " & Js.Str(p, "method") & If(Js.Str(p, "by") <> "", " · by " & Js.Str(p, "by"), "")})
            t.Cols.Add(New TCol("Amount", Function(p) Theme.Money(Js.Num(p, "amount")), 120, CellKind.Money) With {.Right = True, .Colour = Function(p) Theme.Green})
            t.Rows = pays
            AddHandler t.RowClick, Sub(p) If Js.Str(p, "receipt") <> "" Then Ui.OpenUrl(AppState.I.Api.Server & "/admin/ecommerce/payment-receipt/" & Uri.EscapeDataString(Js.Str(p, "receipt")))
            t.RowClickable = True
            f.AddControl(t)
        End If
        Dim names = Js.Objs(Js.Arr(d, "products")).Select(Function(p) Js.Str(p, "name")).ToList()
        If names.Count > 0 Then f.AddNote("Items on this order: " & String.Join(", ", names), Theme.G500)
        f.ShowDialog(FindForm())
    End Sub

    Private Sub DoExport()
        If _shown.Count = 0 Then Toast("There are no dues to export.", True) : Return
        Export.Csv(Me, "dues-" & Date.Today.ToString("yyyy-MM-dd"), {"Due ID", "Customer", "Phone", "Order", "Source", "Amount", "Paid", "Balance", "Promise Date", "Overdue Days", "Status", "Created", "Products", "Receipts"},
                   _shown.Select(Function(d) CType({CObj(Js.Int(d, "id")), Js.Str(d, "customer"), Js.Str(d, "phone"), OrderText(d), If(Js.Str(d, "orderType") = "offline", "In-store", "Online"),
                        Js.Num(d, "amount").ToString("0.00"), Js.Num(d, "paid").ToString("0.00"), Js.Num(d, "balance").ToString("0.00"),
                        If(PromiseDay(d).HasValue, PromiseDay(d).Value.ToString("yyyy-MM-dd"), ""), If(OverdueDays(d) > 0, OverdueDays(d).ToString(), ""),
                        If(Open(d), If(Js.Num(d, "paid") > Paisa, "Partly paid", "Unpaid"), "Paid"), Fmt.IstStamp(Js.Time(d, "createdAt")),
                        String.Join(" | ", Js.Objs(Js.Arr(d, "products")).Select(Function(p) Js.Str(p, "name"))),
                        String.Join(" | ", Js.Objs(Js.Arr(d, "payments")).Select(Function(p) Js.Str(p, "receipt")))}, IEnumerable(Of Object))))
    End Sub
End Class

''' <summary>A Due number card: tinted round icon, amount, label and a grey note; blue ring when it is the filter.</summary>
Public Class DueCard
    Inherits Control
    Private ReadOnly _icon As String, _tint As Color, _ink As Color
    Private _value As String = "", _label As String = "", _sub As String = "", _on As Boolean, _hover As Boolean
    Public Sub New(icon As String, tint As Color, ink As Color)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _icon = icon : _tint = tint : _ink = ink
        Height = 94
        Cursor = Cursors.Hand
    End Sub
    Public Sub SetValue(value As String, label As String, [sub] As String, active As Boolean)
        _value = value : _label = label : _sub = [sub] : _on = active
        Invalidate()
    End Sub
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(_on, Color.FromArgb(&H9C, &HBD, &HF5), If(_hover, Color.FromArgb(&HBF, &HD3, &HF9), Theme.G200)), If(_on, 2, 1)) : g.DrawPath(pen, p) : End Using
        End Using
        Dim cy = Height \ 2
        Using b As New SolidBrush(_tint) : g.FillEllipse(b, 16, cy - 22, 44, 44) : End Using
        Icons.Draw(g, _icon, New RectangleF(28, cy - 10, 20, 20), _ink)
        Dim w = Width - 74 - 12
        Tr.DrawText(g, _value, Theme.Px(20, 700), New Rectangle(74, cy - 32, w, 28), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, _label, Theme.Px(14), New Rectangle(74, cy - 4, w, 20), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, _sub, Theme.Px(12), New Rectangle(74, cy + 15, w, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class
