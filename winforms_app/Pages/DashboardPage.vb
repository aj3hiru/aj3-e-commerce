Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"E-commerce Dashboard" as on the website: 9 number cards (vs. previous period), Earnings &amp; Due,
''' Store Overview, Recent Orders and Sales Overview — all from the data on this computer (opens instantly, offline too).</summary>
Public Class DashboardPage
    Inherits PageBase

    Private ReadOnly _range As ComboBox = Ui.Combo({"Today", "Yesterday", "7 Days", "This Month", "Previous Month", "This Year"}, 150)
    Private ReadOnly _display As New DisplayOptions("ecom_dashboard2_widgets",
        New DisplayGroup("d2-orders", "Orders & Customers", "d2-on-total|Total Orders", "d2-on-pending|Pending Orders", "d2-on-progress|In Progress", "d2-on-delivered|Delivered Orders", "d2-on-canceled|Canceled Orders", "d2-cust-online|Total Online Customers", "d2-cust-offline|Total Offline Customers", "d2-sold-store|Store Sold Product", "d2-sold-online|Online Sold Product"),
        New DisplayGroup("d2-earnings", "Earnings & Due", "d2-earning|Earnings", "d2-due|Due", "d2-received|Payment Received", "d2-pending-pay|Pending Payment"),
        New DisplayGroup("d2-overview", "Store Overview", "d2-products|Products", "d2-categories|Categories", "d2-brands|Brands", "d2-coupons|Active Coupons"),
        New DisplayGroup("d2-bottom", "Lists & Chart", "d2-recent|Recent Orders", "d2-sales|Sales Overview"))

    Private ReadOnly _scroll As New Panel With {.Dock = DockStyle.Fill, .AutoScroll = True, .BackColor = Theme.Page}
    Private ReadOnly _cards As New List(Of (Key As String, Card As StatCard))
    Private ReadOnly _earnCard As New Card()
    Private ReadOnly _earn As New List(Of (Key As String, T As Tile))
    Private ReadOnly _overCard As New Card()
    Private ReadOnly _over As New List(Of (Key As String, T As Tile))
    Private ReadOnly _recentCard As New Card()
    Private ReadOnly _recent As New DataGridView()
    Private ReadOnly _chartCard As New Card()
    Private ReadOnly _chart As New LineChart()
    Private ReadOnly _earnHead As New CardHeading("Earnings & Due (Today)", Theme.IcMoney, Theme.Green)

    Public Overrides ReadOnly Property PageTitle As String = "E-commerce Dashboard"
    Public Overrides ReadOnly Property PageSubtitle As String = "A live overview of your store"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _range}
        End Get
    End Property

    Public Sub New()
        Controls.Add(_scroll)
        Ui.DoubleBuffer(_scroll)
        For Each c In {("d2-on-total", "Total Orders", Theme.IcCart, Theme.Green), ("d2-on-pending", "Pending Orders", Theme.IcHourglass, Theme.Primary),
                       ("d2-on-progress", "In Progress", Theme.IcPackage, Theme.Green), ("d2-on-delivered", "Delivered Orders", Theme.IcDone, Theme.Primary),
                       ("d2-on-canceled", "Canceled Orders", Theme.IcBlock, Theme.Red), ("d2-cust-online", "Total Online Customers", Theme.IcPeople, Theme.Primary),
                       ("d2-cust-offline", "Total Offline Customers", Theme.IcAddUser, Theme.Green), ("d2-sold-store", "Today Store Sold Product", Theme.IcShop, Theme.Primary),
                       ("d2-sold-online", "Today Online Sold Product", Theme.IcGlobe, Theme.Green)}
            Dim sc As New StatCard With {.Caption = c.Item2, .Glyph = c.Item3, .Accent = c.Item4}
            _cards.Add((c.Item1, sc))
            _scroll.Controls.Add(sc)
        Next

        _earnCard.Controls.Add(_earnHead)
        For Each t In {("d2-earning", "Earnings", Theme.IcMoney, Theme.Green), ("d2-due", "Due", Theme.IcClock, Theme.Primary), ("d2-received", "Payment Received", Theme.IcCard, Theme.Green), ("d2-pending-pay", "Pending Payment", Theme.IcClock, Theme.Primary)}
            Dim tl As New Tile With {.Caption = t.Item2, .Glyph = t.Item3, .Accent = t.Item4}
            _earn.Add((t.Item1, tl))
            _earnCard.Controls.Add(tl)
        Next
        _scroll.Controls.Add(_earnCard)

        _overCard.Controls.Add(New CardHeading("Store Overview", Theme.IcChart))
        For Each t In {("d2-products", "Products", Theme.IcPackage, Theme.Green), ("d2-categories", "Categories", Theme.IcGrid, Theme.Primary), ("d2-brands", "Brands", Theme.IcTag, Theme.Primary), ("d2-coupons", "Active Coupons", Theme.IcTicket, Theme.Green)}
            Dim tl As New Tile With {.Caption = t.Item2, .Glyph = t.Item3, .Accent = t.Item4, .Stacked = True, .Height = 124}
            _over.Add((t.Item1, tl))
            _overCard.Controls.Add(tl)
        Next
        _scroll.Controls.Add(_overCard)

        Ui.StyleGrid(_recent)
        _recent.ReadOnly = True
        For Each h In {"Order #", "Customer", "Total", "Payment", "Status", "Date"} : _recent.Columns.Add(h.Replace(" ", "").Replace("#", "No"), h) : Next
        _recentCard.Controls.Add(New CardHeading("Recent Orders", Theme.IcList))
        _recentCard.Controls.Add(_recent)
        AddHandler _recent.CellFormatting, AddressOf FormatRecent
        _scroll.Controls.Add(_recentCard)

        _chartCard.Controls.Add(New CardHeading("Sales Overview", Theme.IcChart))
        _chartCard.Controls.Add(_chart)
        _scroll.Controls.Add(_chartCard)

        _range.SelectedIndex = 0
        AddHandler _range.SelectedIndexChanged, Sub() Reload()
        AddHandler _display.Changed, Sub()
                                         Reload()
                                         LayoutAll()
                                     End Sub
        AddHandler AppState.I.DataChanged, Sub() If Visible Then Reload()
        AddHandler _scroll.Resize, Sub() LayoutAll()
        Reload()
    End Sub

    Public Overrides Sub OnOpened()
        Reload()
    End Sub

    ' ───────── numbers ─────────
    Private Function RangeOf(i As Integer) As (DateTime, DateTime)
        Dim t = DateTime.Today
        Select Case i
            Case 1 : Return (t.AddDays(-1), t.AddDays(-1))
            Case 2 : Return (t.AddDays(-6), t)
            Case 3 : Return (New DateTime(t.Year, t.Month, 1), t)
            Case 4 : Dim f = New DateTime(t.Year, t.Month, 1).AddMonths(-1) : Return (f, f.AddMonths(1).AddDays(-1))
            Case 5 : Return (New DateTime(t.Year, 1, 1), t)
            Case Else : Return (t, t)
        End Select
    End Function

    Private Shared Function Within(d As DateTime?, r As (DateTime, DateTime)) As Boolean
        Return d.HasValue AndAlso d.Value.Date >= r.Item1 AndAlso d.Value.Date <= r.Item2
    End Function

    Private Shared Function Trend(a As Double, b As Double) As Double?
        If b = 0 Then Return If(a = 0, CType(0, Double?), Nothing)
        Return (a - b) / b * 100
    End Function

    Private Sub Reload()
        Dim s = AppState.I
        Dim r = RangeOf(_range.SelectedIndex)
        Dim days = (r.Item2 - r.Item1).Days + 1
        Dim pr = (r.Item1.AddDays(-days), r.Item1.AddDays(-1))
        Dim label = If(_range.SelectedIndex = 0, "Today", _range.Text)
        Dim orders = s.List("orders")
        Dim onlineIn = Function(rr As (DateTime, DateTime)) orders.Where(Function(o) Js.Str(o, "type") = "online" AndAlso Within(Js.Time(o, "createdAt"), rr)).ToList()
        Dim now = onlineIn(r), before = onlineIn(pr)
        Dim st = Function(l As List(Of JsonObject), x As String) CDbl(l.Where(Function(o) Js.Str(o, "status") = x).Count())
        Dim customers = s.List("customers")
        Dim joined = Function(rr As (DateTime, DateTime), type As String) CDbl(customers.Where(Function(c) Js.Str(c, "type", "offline") = type AndAlso Within(Js.Time(c, "since"), rr)).Count())
        Dim sold = Function(rr As (DateTime, DateTime), type As String) orders.Where(Function(o) Js.Str(o, "type") = type AndAlso Js.Str(o, "status") <> "Canceled" AndAlso Within(Js.Time(o, "createdAt"), rr)).Sum(Function(o) Js.Objs(Js.Arr(o, "items")).Sum(Function(i) Js.Num(i, "qty")))

        Dim vals As New Dictionary(Of String, (Double, Double)) From {
            {"d2-on-total", (now.Count, before.Count)}, {"d2-on-pending", (st(now, "Pending"), st(before, "Pending"))}, {"d2-on-progress", (st(now, "In Progress"), st(before, "In Progress"))},
            {"d2-on-delivered", (st(now, "Delivered"), st(before, "Delivered"))}, {"d2-on-canceled", (st(now, "Canceled"), st(before, "Canceled"))},
            {"d2-cust-online", (joined(r, "online"), joined(pr, "online"))}, {"d2-cust-offline", (joined(r, "offline"), joined(pr, "offline"))},
            {"d2-sold-store", (sold(r, "offline"), sold(pr, "offline"))}, {"d2-sold-online", (sold(r, "online"), sold(pr, "online"))}}
        For Each c In _cards
            Dim v = vals(c.Key)
            c.Card.Value = v.Item1.ToString("0")
            c.Card.Trend = Trend(v.Item1, v.Item2)
            If c.Key = "d2-sold-store" Then c.Card.Caption = label & " Store Sold Product"
            If c.Key = "d2-sold-online" Then c.Card.Caption = label & " Online Sold Product"
            c.Card.Invalidate()
        Next

        Dim sales = orders.Where(Function(o) Within(Js.Time(o, "createdAt"), r) AndAlso Js.Str(o, "status") <> "Canceled" AndAlso (Js.Str(o, "type") = "offline" OrElse Js.Str(o, "status") = "Delivered"))
        Dim earn = sales.Sum(Function(o) Js.Num(o, "total"))
        Dim due = orders.Where(Function(o) Within(Js.Time(o, "createdAt"), r)).Sum(Function(o) Js.Num(o, "due"))
        Dim received = orders.Where(Function(o) Within(Js.Time(o, "createdAt"), r)).Sum(Function(o) Js.Objs(Js.Arr(o, "pays")).Sum(Function(p) Js.Num(p, "amount")))
        Dim pending = now.Where(Function(o) Js.Str(o, "paymentStatus") <> "Paid" AndAlso Js.Str(o, "status") <> "Canceled").Sum(Function(o) Js.Num(o, "total"))
        _earnHead.Text = "Earnings & Due (" & label & ")"
        _earnHead.Invalidate()
        For Each t In _earn
            Select Case t.Key
                Case "d2-earning" : t.T.Caption = "Earnings (" & label & ")" : t.T.Value = Theme.Money(earn)
                Case "d2-due" : t.T.Caption = "Due (" & label & ")" : t.T.Value = Theme.Money(due)
                Case "d2-received" : t.T.Value = Theme.Money(received)
                Case Else : t.T.Value = Theme.Money(pending)
            End Select
            t.T.Invalidate()
        Next
        For Each t In _over
            Select Case t.Key
                Case "d2-products" : t.T.Value = s.List("products").Count.ToString()
                Case "d2-categories" : t.T.Value = s.List("categories").Count.ToString()
                Case "d2-brands" : t.T.Value = s.List("brands").Count.ToString()
                Case Else : t.T.Value = s.List("coupons").Count.ToString()
            End Select
            t.T.Invalidate()
        Next

        _recent.SuspendLayout()
        _recent.Rows.Clear()
        For Each o In orders.Where(Function(x) Js.Str(x, "type") = "online").Take(6)
            Dim d = Js.Time(o, "createdAt")
            _recent.Rows.Add(Js.Str(o, "number"), Js.Str(o, "customer"), Theme.Money(Js.Num(o, "total")), If(Js.Str(o, "paymentStatus") = "Paid", "Paid", "Unpaid"), Js.Str(o, "status"), If(d.HasValue, d.Value.ToString("d MMM"), ""))
        Next
        _recent.ResumeLayout()

        ' Sales Overview: last 7 days from the saved dashboard (store + online), or from the orders here.
        _chart.Values.Clear() : _chart.Labels.Clear()
        Dim week = Js.Objs(Js.Arr(Js.Field(Store.Read("dashboard"), "sales"), "week"))
        If week.Count > 0 Then
            For Each d In week
                _chart.Values.Add(Js.Num(d, "sales"))
                Dim dt As DateTime
                _chart.Labels.Add(If(DateTime.TryParse(Js.Str(d, "day"), dt), dt.ToString("ddd"), ""))
            Next
        Else
            For i = 6 To 0 Step -1
                Dim day = DateTime.Today.AddDays(-i)
                _chart.Values.Add(orders.Where(Function(o) Js.Str(o, "status") <> "Canceled" AndAlso Js.Time(o, "createdAt").HasValue AndAlso Js.Time(o, "createdAt").Value.Date = day).Sum(Function(o) Js.Num(o, "total")))
                _chart.Labels.Add(day.ToString("ddd"))
            Next
        End If
        _chart.Invalidate()
        LayoutAll()
    End Sub

    Private Sub FormatRecent(sender As Object, e As DataGridViewCellFormattingEventArgs)
        If e.RowIndex < 0 Then Return
        Select Case e.ColumnIndex
            Case 0 : e.CellStyle.ForeColor = Theme.Primary : e.CellStyle.Font = Theme.BodyBold
            Case 3 : e.CellStyle.ForeColor = If(CStr(e.Value) = "Paid", Theme.Green, Theme.Grey) : e.CellStyle.Font = Theme.BodyBold
            Case 4
                Dim v = CStr(e.Value)
                e.CellStyle.ForeColor = If(v = "Delivered", Theme.Green, If(v = "Canceled", Theme.Red, If(v = "Pending", Color.FromArgb(&HB4, &H83, &H9), Theme.Blue)))
                e.CellStyle.Font = Theme.BodyBold
        End Select
    End Sub

    ' ───────── layout (website grid: 4 cards a row, then two-column panels) ─────────
    Private Sub LayoutAll()
        If _scroll.Width < 100 Then Return
        _scroll.SuspendLayout()
        Dim pad = 22, gap = 18
        Dim w = _scroll.ClientSize.Width - pad * 2
        Dim cols = If(w > 1100, 4, If(w > 800, 3, 2))
        Dim cw = (w - gap * (cols - 1)) \ cols
        Dim x = 0, y = pad, n = 0
        Dim showGroup = _display.IsOn("d2-orders")
        For Each c In _cards
            Dim on_ = showGroup AndAlso _display.IsOn("d2-orders", c.Key)
            c.Card.Visible = on_
            If Not on_ Then Continue For
            c.Card.SetBounds(pad + (n Mod cols) * (cw + gap), y + (n \ cols) * (100 + gap), cw, 100)
            n += 1
        Next
        If n > 0 Then y += ((n + cols - 1) \ cols) * (100 + gap)

        ' Earnings (3/5) + Store Overview (2/5)
        Dim showEarn = _display.IsOn("d2-earnings"), showOver = _display.IsOn("d2-overview")
        _earnCard.Visible = showEarn : _overCard.Visible = showOver
        If showEarn OrElse showOver Then
            Dim both = showEarn AndAlso showOver
            Dim lw = If(both, (w - gap) * 3 \ 5, w), rw = If(both, w - lw - gap, w)
            Dim h1 = 0, h2 = 0
            If showEarn Then h1 = LayoutTiles(_earnCard, _earn.Where(Function(t) _display.IsOn("d2-earnings", t.Key)).Select(Function(t) CType(t.T, Control)).ToList(), _earn.Select(Function(t) CType(t.T, Control)).ToList(), lw, 92)
            If showOver Then h2 = LayoutTiles(_overCard, _over.Where(Function(t) _display.IsOn("d2-overview", t.Key)).Select(Function(t) CType(t.T, Control)).ToList(), _over.Select(Function(t) CType(t.T, Control)).ToList(), rw, 124)
            Dim h = Math.Max(h1, h2)
            If showEarn Then _earnCard.SetBounds(pad, y, lw, h)
            If showOver Then _overCard.SetBounds(pad + If(both, lw + gap, 0), y, rw, h)
            y += h + gap
        End If

        ' Recent Orders (3/5) + Sales Overview (2/5)
        Dim showRecent = _display.IsOn("d2-bottom", "d2-recent") AndAlso _display.IsOn("d2-bottom"), showChart = _display.IsOn("d2-bottom", "d2-sales") AndAlso _display.IsOn("d2-bottom")
        _recentCard.Visible = showRecent : _chartCard.Visible = showChart
        If showRecent OrElse showChart Then
            Dim both = showRecent AndAlso showChart
            Dim lw = If(both, (w - gap) * 3 \ 5, w), rw = If(both, w - lw - gap, w)
            Const h As Integer = 380
            If showRecent Then
                _recentCard.SetBounds(pad, y, lw, h)
                _recentCard.Controls(0).SetBounds(18, 14, lw - 36, 34)
                _recent.SetBounds(18, 56, lw - 36, h - 74)
            End If
            If showChart Then
                _chartCard.SetBounds(pad + If(both, lw + gap, 0), y, rw, h)
                _chartCard.Controls(0).SetBounds(18, 14, rw - 36, 34)
                _chart.SetBounds(18, 56, rw - 36, h - 74)
            End If
            y += h + gap
        End If
        _scroll.AutoScrollMinSize = New Size(0, y + pad)
        _scroll.ResumeLayout()
    End Sub

    ''' <summary>Two tiles a row inside a card; returns the card height.</summary>
    Private Shared Function LayoutTiles(card As Card, shown As List(Of Control), all As List(Of Control), width As Integer, tileH As Integer) As Integer
        For Each t In all : t.Visible = shown.Contains(t) : Next
        card.Controls(0).SetBounds(18, 14, width - 36, 34)
        Dim inner = width - 36, gap = 16
        Dim tw = (inner - gap) \ 2
        For i = 0 To shown.Count - 1
            shown(i).SetBounds(18 + (i Mod 2) * (tw + gap), 58 + (i \ 2) * (tileH + gap), tw, tileH)
        Next
        Return 58 + ((shown.Count + 1) \ 2) * (tileH + gap) + 4
    End Function
End Class
