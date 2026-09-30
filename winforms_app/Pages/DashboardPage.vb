Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>The website's /admin/dashboard: admins and store managers get the store dashboard (Dashboard2Body.tsx:
''' headline cards with "vs. previous period", Earnings &amp; Due, Store Overview, Recent Orders, Sales Overview) for a
''' date range; other roles get their own dashboard (RoleDashboards.tsx). The numbers are the website's own (fetched
''' and kept on this computer for each range, so it opens offline too).</summary>
Public Class DashboardPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_dashboard2_widgets")
    Private ReadOnly _range As New RangeButton()
    Private ReadOnly _search As New GlobalSearch()
    Private _data As JsonObject
    Private _loading As Boolean
    Private _view As String = ""

    Public Overrides ReadOnly Property PageTitle As String
        Get
            Select Case _view
                Case "orderDesk" : Return "Order Desk"
                Case "billing" : Return "Billing"
                Case "catalog" : Return "Products"
                Case "marketing" : Return "Marketing"
                Case Else : Return "E-commerce Dashboard"
            End Select
        End Get
    End Property
    Public Overrides ReadOnly Property PageSubtitle As String
        Get
            Select Case _view
                Case "orderDesk" : Return "New orders, deliveries and today's numbers"
                Case "billing" : Return "Today at the counter"
                Case "catalog" : Return "Your catalogue at a glance"
                Case "marketing" : Return "Offers, campaigns and customers"
                Case Else : Return "A live overview of your store"
            End Select
        End Get
    End Property
    Public Overrides ReadOnly Property Actions As Control()
        Get
            If _view = "" OrElse _view = "store" Then Return {_range, _display.Button, _search}
            Return {}
        End Get
    End Property

    Public Sub New()
        AddHandler _display.Changed, Sub() Refresh_()
        AddHandler _range.Changed, Sub()
                                       _data = AppState.I.CachedWebDashboard(_range.Query)
                                       Refresh_()
                                       Dim unused = FetchAsync()
                                   End Sub
    End Sub

    Public Overrides Sub OnOpened()
        MyBase.OnOpened()
        Dim unused = FetchAsync()
    End Sub

    Private Async Function FetchAsync() As Task
        If _loading Then Return
        _loading = True
        Try
            Dim q = _range.Query
            Dim d = Await AppState.I.FetchWebDashboardAsync(q)
            If d IsNot Nothing AndAlso q = _range.Query AndAlso Not IsDisposed Then
                _data = d
                Refresh_()
            End If
        Finally
            _loading = False
        End Try
    End Function

    Protected Overrides Sub Reload()
        If _data Is Nothing Then _data = AppState.I.CachedWebDashboard(_range.Query)
        Dim view = Js.Str(_data, "view", "store")
        If view <> _view Then _view = view : HeaderChanged()
        ClearBody()
        If _data Is Nothing Then
            Body.Add(Ui.Note(If(AppState.I.Online, "Loading the dashboard…", "The dashboard for this range hasn't been downloaded yet — connect to the internet once.")))
            Return
        End If
        Select Case view
            Case "agent"
                Body.Add(Ui.Note("Your deliveries are under My Deliveries."))
                If IsHandleCreated Then BeginInvoke(Sub() Main?.Pick("app:deliveries"))
            Case "orderDesk" : RoleViews.OrderDesk(Body, TryCast(Js.Field(_data, "data"), JsonObject), Js.Bool(_data, "canAccept"), Me)
            Case "billing" : RoleViews.Billing(Body, TryCast(Js.Field(_data, "data"), JsonObject), Me)
            Case "catalog" : RoleViews.Catalog(Body, TryCast(Js.Field(_data, "data"), JsonObject), Me)
            Case "marketing" : RoleViews.Marketing(Body, TryCast(Js.Field(_data, "data"), JsonObject), Me)
            Case "denied" : Body.Add(Ui.Note("Your account can't see the dashboard."))
            Case Else : StoreDashboard()
        End Select
    End Sub

    Private Function Show(g As String, k As String) As Boolean
        Return _display.IsOn(g, k)
    End Function

    Friend ReadOnly Property Main_ As MainForm
        Get
            Return Main
        End Get
    End Property

    ' ── the store dashboard (Dashboard2Body.tsx) ──
    Friend Shared ReadOnly Green As (Solid As Color, Tint As Color, Ink As Color) = (Color.FromArgb(&H1C, &HC8, &H8A), Color.FromArgb(&HE8, &HF9, &HF2), Color.FromArgb(&HF, &H9F, &H6E))
    Friend Shared ReadOnly Purple As (Solid As Color, Tint As Color, Ink As Color) = (Color.FromArgb(&H7C, &H3A, &HED), Color.FromArgb(&HF5, &HF3, &HFF), Color.FromArgb(&H7C, &H3A, &HED))
    Friend Shared ReadOnly Red As (Solid As Color, Tint As Color, Ink As Color) = (Color.FromArgb(&HE7, &H4A, &H5B), Color.FromArgb(&HFD, &HEC, &HEE), Color.FromArgb(&HC8, &H1E, &H32))

    Private Sub StoreDashboard()
        Dim s = TryCast(Js.Field(_data, "stats"), JsonObject)
        Dim deltas = TryCast(Js.Field(s, "deltas"), JsonObject)
        Dim label = Js.Str(Js.Field(_data, "range"), "rangeLabel", "Today")
        _range.Label = label
        _range.Invalidate()
        Dim cards = {
            ("d2-on-total", Green, "fa-cart-shopping", "Total Orders", "onTotal", "orders:all", True),
            ("d2-on-pending", Purple, "fa-hourglass-half", "Pending Orders", "onPending", "orders:Pending", True),
            ("d2-on-progress", Green, "fa-truck-ramp-box", "In Progress", "onProgress", "orders:In Progress", True),
            ("d2-on-delivered", Purple, "fa-circle-check", "Delivered Orders", "onDelivered", "orders:Delivered", True),
            ("d2-on-canceled", Red, "fa-ban", "Canceled Orders", "onCanceled", "orders:Canceled", False),
            ("d2-cust-online", Purple, "fa-user-group", "Total Online Customers", "onCustomers", "/admin/ecommerce/customers", True),
            ("d2-cust-offline", Green, "fa-user-plus", "Total Offline Customers", "offCustomers", "/admin/ecommerce/customers", True),
            ("d2-sold-store", Purple, "fa-store", "Today Store Sold Product", "todayStoreSold", "orders:all", True),
            ("d2-sold-online", Green, "fa-globe", "Today Online Sold Product", "todayOnlineSold", "orders:all", True)}
        If _display.IsOn("d2-orders") Then
            Dim grid As New Columns(4, 230, 24)
            For Each c In cards
                If Not Show("d2-orders", c.Item1) Then Continue For
                Dim card = grid.Add(New StatCard2(c.Item2.Solid, c.Item2.Tint, c.Item3, c.Item4, Js.Num(s, c.Item5), TryCast(Js.Field(deltas, c.Item5), JsonObject), c.Item7))
                Dim go = c.Item6
                AddHandler card.Click, Sub() Navigate(go)
            Next
            If grid.Controls.Count > 0 Then Body.Add(grid)
        End If

        ' Earnings & Due · Store Overview
        Dim earn = {("d2-earning", "fa-coins", Green, "Earnings (" & label & ")", "periodEarning"), ("d2-due", "fa-clock", Purple, "Due (" & label & ")", "periodNewDue"),
                    ("d2-received", "fa-credit-card", Green, "Payment Received", "periodDueCollection"), ("d2-pending-pay", "fa-clock", Purple, "Pending Payment", "periodDuePromise")}
        Dim earnShown = earn.Where(Function(t) Show("d2-earnings", t.Item1)).ToList()
        Dim earningsCard As Control = Nothing
        If earnShown.Count > 0 Then
            Dim cb = New DashCard("fa-indian-rupee-sign", "Earnings & Due (" & label & ")", greenDot:=True)
            Dim g As New Columns(2, 200, 16)
            For Each t In earnShown
                g.Add(New MoneyTile(t.Item2, t.Item3.Tint, t.Item3.Ink, t.Item4, Theme.Money(Js.Num(s, t.Item5))))
            Next
            cb.Add(g)
            earningsCard = cb
        End If
        Dim over = {("d2-products", "fa-cube", Green, "Products", "totalProducts", "/admin/ecommerce/products"), ("d2-categories", "fa-table-cells-large", Purple, "Categories", "totalCategories", "/admin/ecommerce/categories"),
                    ("d2-brands", "fa-tag", Purple, "Brands", "totalBrands", "/admin/ecommerce/brands"), ("d2-coupons", "fa-ticket-simple", Green, "Active Coupons", "activeCoupons", "/admin/ecommerce/coupons")}
        Dim overShown = over.Where(Function(t) Show("d2-overview", t.Item1)).ToList()
        Dim overviewCard As Control = Nothing
        If overShown.Count > 0 Then
            Dim cb = New DashCard("fa-chart-bar", "Store Overview")
            Dim g As New Columns(2, 150, 16)
            For Each t In overShown
                Dim tile = g.Add(New OverviewTile(t.Item2, t.Item3.Tint, t.Item3.Ink, t.Item4, CInt(Js.Num(s, t.Item5)).ToString("#,##0")))
                Dim href = t.Item6
                AddHandler tile.Click, Sub() Navigate(href)
            Next
            cb.Add(g)
            overviewCard = cb
        End If
        AddRow(earningsCard, overviewCard)

        ' Recent Orders · Sales Overview
        Dim recentCard As Control = Nothing
        If _display.Item("d2-recent") Then
            Dim cb = New DashCard("fa-file-lines", "Recent Orders")
            Dim viewAll As New LinkText("View All", "fa-chevron-right", Theme.Primary)
            AddHandler viewAll.Click, Sub() Main?.Pick("/admin/ecommerce/orders")
            cb.Tools.Add(viewAll)
            cb.Add(New Spacer(1, True))
            cb.Add(New RecentOrders(Js.Objs(Js.Arr(s, "recentOrders")), Me))
            recentCard = cb
        End If
        Dim salesCard As Control = Nothing
        If _display.Item("d2-sales") Then
            Dim cb = New DashCard("fa-chart-line", "Sales Overview")
            cb.Add(New SalesChart(Js.Objs(Js.Arr(s, "salesSeries")).Select(Function(p) (Js.Str(p, "label"), Js.Num(p, "value"))).ToList(), Js.Bool(s, "salesSeriesEmpty")))
            salesCard = cb
        End If
        AddRow(recentCard, salesCard)
    End Sub

    ''' <summary>Two-up row (3fr / 2fr); a card alone takes the full width.</summary>
    Private Sub AddRow(left As Control, right As Control)
        If left Is Nothing AndAlso right Is Nothing Then Return
        If left Is Nothing OrElse right Is Nothing Then Body.Add(If(left, right)) : Return
        Dim row As New Columns(2, 420, 24) With {.Weights = {3, 2}}
        row.Add(left) : row.Add(right)
        Body.Add(row)
    End Sub

    Friend Sub Navigate(target As String)
        If target.StartsWith("orders:") Then
            TryCast(Main?.Go("/admin/ecommerce/orders"), OrdersPage)?.ShowTab(target.Substring(7))
        Else
            Main?.Pick(target)
        End If
    End Sub
End Class

''' <summary>The website's headline card (StatCard2): coloured icon tile, label, big number, delta pill, pale disc.</summary>
Public Class StatCard2
    Inherits Control
    Implements IFlowHeight
    Private ReadOnly _solid As Color, _tint As Color
    Private ReadOnly _icon As String, _label As String, _value As Double
    Private ReadOnly _delta As JsonObject
    Private ReadOnly _goodUp As Boolean
    Private _hover As Boolean
    Private ReadOnly _lf As Font = Theme.Px(15, 500)
    Private ReadOnly _vf As Font = Theme.Px(28, 700)
    Private ReadOnly _df As Font = Theme.Px(12, 600)
    Private ReadOnly _nf As Font = Theme.Px(13)

    Public Sub New(solid As Color, tint As Color, icon As String, label As String, value As Double, delta As JsonObject, goodWhenUp As Boolean)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _solid = solid : _tint = tint : _icon = icon : _label = label : _value = value : _delta = delta : _goodUp = goodWhenUp
        Cursor = Cursors.Hand
    End Sub

    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Dim textW = width - 20 - 52 - 16 - 20
        Dim lh = Tr.MeasureText(_label, _lf, New Size(Math.Max(10, textW), 100), TextFormatFlags.WordBreak).Height
        Dim deltaLines = If(DeltaWidth() + 8 + Tr.MeasureText("vs. previous period", _nf).Width > textW, 2, 1)
        Return 20 + lh + 4 + 34 + 8 + deltaLines * 22 + 20
    End Function

    Private Function DeltaText() As String
        If _delta Is Nothing OrElse Js.IsNull(_delta, "pct") Then Return "New"
        Return Math.Abs(Js.Num(_delta, "pct")).ToString("0.#", Globalization.CultureInfo.InvariantCulture) & "%"
    End Function

    Private Function DeltaWidth() As Integer
        Dim dir = Js.Str(_delta, "direction", "flat")
        Return 6 + If(dir = "flat", 0, 14) + Tr.MeasureText(DeltaText(), _df).Width + 6
    End Function

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
        Dim box As New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F)
        Using p = Theme.RoundRect(box, Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Dim st = g.Save()
            g.SetClip(p)
            Using b As New SolidBrush(_tint) : g.FillEllipse(b, Width - 70, -30, 100, 100) : End Using
            g.Restore(st)
            Using pen As New Pen(If(_hover, Theme.G300, Theme.G200)) : g.DrawPath(pen, p) : End Using
        End Using
        Dim t As New Rectangle(20, 20, 52, 52)
        Using p = Theme.RoundRect(New RectangleF(t.X, t.Y, 52, 52), Theme.Radius)
            Using b As New SolidBrush(_solid) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, _icon, New RectangleF(t.X + 15, t.Y + 15, 22, 22), Color.White)
        Dim x = t.Right + 16, w = Width - x - 20
        Dim lh = Tr.MeasureText(_label, _lf, New Size(Math.Max(10, w), 100), TextFormatFlags.WordBreak).Height
        Tr.DrawText(g, _label, _lf, New Rectangle(x, 20, w, lh), Theme.G700, TextFormatFlags.WordBreak Or TextFormatFlags.NoPadding)
        Dim y = 20 + lh + 4
        Tr.DrawText(g, CInt(_value).ToString("#,##0"), _vf, New Point(x, y), Theme.G900, TextFormatFlags.NoPadding)
        y += 34 + 8
        ' delta pill: green when good news, red when bad (a rise in cancellations is bad)
        Dim dir = Js.Str(_delta, "direction", "flat")
        Dim good = dir = "flat" OrElse (dir = "up") = _goodUp
        Dim dw = DeltaWidth()
        Dim r As New Rectangle(x, y, dw, 20)
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
            Using b As New SolidBrush(If(good, Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(&HFE, &HF2, &HF2))) : g.FillPath(b, p) : End Using
        End Using
        Dim fg = If(good, Color.FromArgb(4, &H78, &H57), Color.FromArgb(&HB9, &H1C, &H1C))
        Dim tx = r.X + 6
        If dir <> "flat" Then
            Icons.Draw(g, If(dir = "up", "fa-arrow-up", "fa-arrow-down"), New RectangleF(tx, r.Y + 5, 10, 10), fg)
            tx += 14
        End If
        Tr.DrawText(g, DeltaText(), _df, New Rectangle(tx, r.Y, dw, 20), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        Dim vs = "vs. previous period"
        If x + dw + 8 + Tr.MeasureText(vs, _nf).Width <= Width - 20 Then
            Tr.DrawText(g, vs, _nf, New Rectangle(x + dw + 8, r.Y, w, 20), Theme.G500, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        Else
            Tr.DrawText(g, vs, _nf, New Point(x, r.Bottom + 4), Theme.G500, TextFormatFlags.NoPadding)
        End If
    End Sub
End Class

''' <summary>A dashboard card (rounded, border, p-6) with its heading: icon + 18px semibold title, optional tools.</summary>
Public Class DashCard
    Inherits CardBox
    Private ReadOnly _icon As String
    Private ReadOnly _green As Boolean
    Private ReadOnly _title As String
    Public Sub New(icon As String, title As String, Optional greenDot As Boolean = False)
        MyBase.New(title, "", 24)
        _icon = icon : _green = greenDot : _title = title
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Title = ""
        MyBase.OnPaint(e)
        Title = _title
        Dim g = e.Graphics
        Theme.Smooth(g)
        Dim y = Padding.Top
        Dim x = Padding.Left
        If _green Then
            Using b As New SolidBrush(Color.FromArgb(&H1C, &HC8, &H8A)) : g.FillEllipse(b, x, y + 1, 32, 32) : End Using
            Icons.Draw(g, _icon, New RectangleF(x + 10, y + 11, 12, 12), Color.White)
            x += 32 + 12
        Else
            Icons.Draw(g, _icon, New RectangleF(x, y + 7, 20, 20), Theme.G600)
            x += 20 + 12
        End If
        Tr.DrawText(g, _title, Theme.Px(18, 600), New Rectangle(x, y, Width - x - Padding.Right - Tools.Width, 34), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class

''' <summary>Earnings tile: small tinted icon + grey label, then the amount (24px bold).</summary>
Public Class MoneyTile
    Inherits Control
    Private ReadOnly _icon As String, _tint As Color, _ink As Color, _label As String, _value As String
    Public Sub New(icon As String, tint As Color, ink As Color, label As String, value As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _icon = icon : _tint = tint : _ink = ink : _label = label : _value = value
        Height = 107
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Using p = Theme.RoundRect(New RectangleF(20, 16, 32, 32), Theme.Radius)
            Using b As New SolidBrush(_tint) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, _icon, New RectangleF(28, 24, 16, 16), _ink)
        Tr.DrawText(g, _label, Theme.Px(13), New Rectangle(60, 16, Width - 70, 32), Theme.G500, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, _value, Theme.Px(24, 700), New Point(20, 60), Theme.G900, TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>Store Overview tile: tinted icon on top, grey label, coloured number.</summary>
Public Class OverviewTile
    Inherits Control
    Private ReadOnly _icon As String, _tint As Color, _ink As Color, _label As String, _value As String
    Private _hover As Boolean
    Public Sub New(icon As String, tint As Color, ink As Color, label As String, value As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _icon = icon : _tint = tint : _ink = ink : _label = label : _value = value
        Height = 145
        Cursor = Cursors.Hand
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
            Using b As New SolidBrush(If(_hover, Theme.G50, Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Using p = Theme.RoundRect(New RectangleF(16, 16, 48, 48), Theme.Radius)
            Using b As New SolidBrush(_tint) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, _icon, New RectangleF(30, 30, 20, 20), _ink)
        Tr.DrawText(g, _label, Theme.Px(14), New Point(16, 78), Theme.G500, TextFormatFlags.NoPadding)
        Tr.DrawText(g, _value, Theme.Px(24, 700), New Point(16, 98), _ink, TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>A small link: text + trailing icon ("View All ›").</summary>
Public Class LinkText
    Inherits Control
    Private ReadOnly _icon As String
    Private ReadOnly _color As Color
    Public Sub New(text As String, icon As String, color As Color)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Me.Text = text : _icon = icon : _color = color
        Font = Theme.Px(14, 500)
        Cursor = Cursors.Hand
        Height = 34
        Width = Tr.MeasureText(text, Font).Width + If(icon = "", 0, 8 + 11) + 2
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Dim tw = Tr.MeasureText(Text, Font).Width
        Tr.DrawText(g, Text, Font, New Rectangle(0, 0, tw + 2, Height), _color, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        If _icon <> "" Then Icons.Draw(g, _icon, New RectangleF(tw + 8, (Height - 11) / 2.0F, 11, 11), _color)
    End Sub
End Class

''' <summary>Recent Orders table: order #, customer, total, payment pill, status pill (+ Accept / Reject when new), date.</summary>
Public Class RecentOrders
    Inherits Control
    Implements IFlowHeight
    Private ReadOnly _rows As List(Of JsonObject)
    Private ReadOnly _owner As DashboardPage
    Private _spots As New List(Of (Key As String, Row As JsonObject, R As Rectangle))
    Private ReadOnly _f As Font = Theme.Px(14)
    Private ReadOnly _fs As Font = Theme.Px(14, 600)
    Private ReadOnly _hf As Font = Theme.Px(12, 600)
    Private ReadOnly _bf As Font = Theme.Px(12, 600)

    Public Sub New(rows As List(Of JsonObject), owner As DashboardPage)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        _rows = rows : _owner = owner
    End Sub

    Private Function CanEdit() As Boolean
        Return AppState.I.Perm.Has("orders", "update_status") OrElse AppState.I.Perm.Has("orders", "mark_paid")
    End Function

    Private Function RowH(o As JsonObject) As Integer
        Return If(Js.Str(o, "orderStatus") = "Pending" AndAlso CanEdit(), 30 + 6 + 32 + 24, 54)
    End Function

    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        If _rows.Count = 0 Then Return 190
        Return 16 + 30 + _rows.Sum(Function(o) RowH(o))
    End Function

    Private Function ColX() As Integer()
        Dim w = Width
        Return {0, 78, CInt(w * 0.3), CInt(w * 0.44), CInt(w * 0.58), CInt(w * 0.84)}
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        _spots = New List(Of (String, JsonObject, Rectangle))
        If _rows.Count = 0 Then
            Using b As New SolidBrush(Theme.G100) : g.FillEllipse(b, Width \ 2 - 36, 32, 72, 72) : End Using
            Icons.Draw(g, "fa-file-lines", New RectangleF(Width \ 2 - 14, 54, 28, 28), Theme.G400)
            Tr.DrawText(g, "No recent orders found", Theme.Px(15, 600), New Rectangle(0, 116, Width, 22), Theme.G900, TextFormatFlags.HorizontalCenter)
            Tr.DrawText(g, "Orders will appear here once customers place them", Theme.Px(14), New Rectangle(0, 142, Width, 20), Theme.G500, TextFormatFlags.HorizontalCenter)
            Return
        End If
        Dim cx = ColX()
        Dim y = 16
        Dim heads = {"Order #", "Customer", "Total", "Payment", "Status", "Date"}
        For k = 0 To 5 : Tr.DrawSpaced(g, heads(k).ToUpperInvariant(), _hf, New Point(cx(k), y), Theme.G400, 0.6F) : Next
        y += 30
        Dim edit = CanEdit()
        For Each o In _rows
            Dim h = RowH(o)
            Using p As New Pen(Theme.G100) : g.DrawLine(p, 0, y, Width, y) : End Using
            Dim cy = y + 27
            Dim num = Js.Str(o, "orderNumber")
            Tr.DrawText(g, num, _fs, New Rectangle(cx(0), cy - 10, cx(1) - cx(0) - 8, 20), Theme.Primary, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            _spots.Add(("open", o, New Rectangle(cx(0), cy - 10, Tr.MeasureText(num, _fs).Width, 20)))
            Tr.DrawText(g, Js.Str(o, "customerName"), _f, New Rectangle(cx(1), cy - 10, cx(2) - cx(1) - 12, 20), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            Tr.DrawText(g, Theme.Money(Js.Num(o, "totalAmount")), _fs, New Rectangle(cx(2), cy - 10, cx(3) - cx(2) - 8, 20), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            Dim pay = Js.Str(o, "paymentStatus")
            Dim pr = Web.DrawPill(g, pay, cx(3), cy, Web.PaymentStatusColor(pay), True)
            If edit Then _spots.Add(("pay", o, pr))
            Dim st = Js.Str(o, "orderStatus")
            Dim sr = Web.DrawPill(g, st, cx(4), cy, Web.OrderStatusColor(st), True)
            If edit Then _spots.Add(("status", o, sr))
            If st = "Pending" AndAlso edit Then
                Dim aw = 10 + 14 + 4 + Tr.MeasureText("Accept", _bf).Width + 10
                Dim ra As New Rectangle(cx(4), cy + 15 + 6, aw, 32)
                Using p = Theme.RoundRect(New RectangleF(ra.X, ra.Y, ra.Width, ra.Height), Theme.Radius)
                    Using b As New SolidBrush(Color.FromArgb(5, &H96, &H69)) : g.FillPath(b, p) : End Using
                End Using
                Icons.Draw(g, "check", New RectangleF(ra.X + 10, ra.Y + 9, 14, 14), Color.White, 3)
                Tr.DrawText(g, "Accept", _bf, New Rectangle(ra.X + 28, ra.Y, aw, 32), Color.White, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                Dim rw = 10 + 14 + 4 + Tr.MeasureText("Reject", _bf).Width + 10
                Dim rr As New Rectangle(ra.Right + 6, ra.Y, rw, 32)
                Using p = Theme.RoundRect(New RectangleF(rr.X + 0.5F, rr.Y + 0.5F, rr.Width - 1, rr.Height - 1), Theme.Radius)
                    Using pen As New Pen(Color.FromArgb(&HFE, &HCA, &HCA)) : g.DrawPath(pen, p) : End Using
                End Using
                Icons.Draw(g, "x", New RectangleF(rr.X + 10, rr.Y + 9, 14, 14), Color.FromArgb(&HDC, &H26, &H26), 3)
                Tr.DrawText(g, "Reject", _bf, New Rectangle(rr.X + 28, rr.Y, rw, 32), Color.FromArgb(&HDC, &H26, &H26), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                _spots.Add(("accept", o, ra)) : _spots.Add(("reject", o, rr))
            End If
            Dim d = Js.Time(o, "createdAt")
            Tr.DrawText(g, If(d.HasValue, Fmt.ToIst(d.Value).ToString("dd MMM yyyy", Globalization.CultureInfo.GetCultureInfo("en-GB")), ""), _f, New Rectangle(cx(5), y + (h - 20) \ 2, Width - cx(5), 20), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            y += h
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Cursor = If(_spots.Any(Function(s) s.R.Contains(e.Location)), Cursors.Hand, Cursors.Default)
    End Sub

    Private Shared Function Local(o As JsonObject) As JsonObject
        Dim id = Js.Int(o, "id")
        Return If(AppState.I.AllOrders().FirstOrDefault(Function(x) Js.Int(x, "id") = id), Js.Obj("id", id, "number", Js.Str(o, "orderNumber"), "status", Js.Str(o, "orderStatus"), "paymentStatus", Js.Str(o, "paymentStatus"), "total", Js.Num(o, "totalAmount"), "type", "online"))
    End Function

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        Dim hit = _spots.FirstOrDefault(Function(s) s.R.Contains(e.Location))
        If hit.Key Is Nothing Then Return
        Dim o = Local(hit.Row)
        Dim below = PointToScreen(New Point(hit.R.X, hit.R.Bottom + 2))
        Select Case hit.Key
            Case "open" : _owner.Main_?.Push(New OrderDetailPage(Js.Int(hit.Row, "id")))
            Case "pay"
                Dim cur = Js.Str(hit.Row, "paymentStatus")
                WebMenu.Show(Me, {"Paid", "Unpaid"}.Select(Function(x) If(x = cur, "*", "") & x & "|" & x), Sub(k) If k <> cur Then OrderActions.SetPayment(o, k, Me), below)
            Case "status"
                Dim cur = Js.Str(hit.Row, "orderStatus")
                WebMenu.Show(Me, {"Pending", "In Progress", "Out for Delivery", "Delivered", "Canceled"}.Select(Function(x) If(x = cur, "*", "") & x & "|" & x), Sub(k) If k <> cur Then OrderActions.SetStatusAny(o, k, Me), below)
            Case "accept" : OrderActions.Accept(o, Me)
            Case "reject" : OrderActions.RejectWithReason(o, Me)
        End Select
    End Sub
End Class

''' <summary>This week's paid sales, Monday → Sunday (SalesChart.tsx): smooth purple line through every point,
''' soft fill, dashed grid, short money on the left, hover shows the exact figure.</summary>
Public Class SalesChart
    Inherits Control
    Private ReadOnly _series As List(Of (Label As String, Value As Double))
    Private ReadOnly _empty As Boolean
    Private _hover As Integer = -1
    Private Shared ReadOnly LineColor As Color = Color.FromArgb(&H7C, &H3A, &HED)

    Public Sub New(series As List(Of (String, Double)), empty As Boolean)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        _series = series : _empty = empty
        Height = 240
    End Sub

    Private Shared Function Compact(v As Double) As String
        Dim trim = Function(n As Double) (Math.Round(n * 10) / 10).ToString(Globalization.CultureInfo.InvariantCulture)
        If v >= 10000000.0 Then Return "₹" & trim(v / 10000000.0) & "Cr"
        If v >= 100000.0 Then Return "₹" & trim(v / 100000.0) & "L"
        If v >= 1000.0 Then Return "₹" & trim(v / 1000.0) & "k"
        Return "₹" & Math.Round(v).ToString()
    End Function

    Private Shared Function NiceMax(v As Double) As Double
        If v <= 0 Then Return 4
        Dim ex = Math.Pow(10, Math.Floor(Math.Log10(v)))
        Dim n = v / ex
        Return If(n <= 1, 1, If(n <= 2, 2, If(n <= 5, 5, 10))) * ex
    End Function

    Private Function Plot() As Rectangle
        Return New Rectangle(48, 6, Width - 48 - 4, Height - 6 - 26)
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Dim pr = Plot()
        Dim n = _series.Count
        Dim max = NiceMax(If(n = 0, 0, _series.Max(Function(p) p.Value)))
        Dim small = Theme.Px(11)
        If Not _empty Then
            For k = 0 To 4
                Dim v = max * (4 - k) / 4
                Dim y = pr.Y + pr.Height * k \ 4
                Tr.DrawText(g, Compact(v), small, New Rectangle(0, y - 8, 44, 16), Theme.G400, TextFormatFlags.Right Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                If k > 0 AndAlso k < 4 Then
                    Using pen As New Pen(Theme.G100) With {.DashStyle = DashStyle.Dash} : g.DrawLine(pen, pr.X, y, pr.Right, y) : End Using
                End If
            Next
        End If
        Using pen As New Pen(Theme.G200)
            g.DrawLine(pen, pr.X, pr.Y, pr.X, pr.Bottom)
            g.DrawLine(pen, pr.X, pr.Bottom, pr.Right, pr.Bottom)
        End Using
        For k = 0 To n - 1
            Dim x = pr.X + CInt((k + 0.5) / n * pr.Width)
            Tr.DrawText(g, _series(k).Label, small, New Rectangle(x - 30, pr.Bottom + 6, 60, 16), Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
        Next
        If _empty OrElse n = 0 Then
            Icons.Draw(g, "fa-chart-bar", New RectangleF(pr.X + pr.Width / 2.0F - 14, pr.Y + pr.Height / 2.0F - 30, 28, 28), Theme.G300)
            Tr.DrawText(g, "No paid sales this week yet", Theme.Px(14), New Rectangle(pr.X, pr.Y + pr.Height \ 2 + 4, pr.Width, 20), Theme.G500, TextFormatFlags.HorizontalCenter)
            Return
        End If
        Dim pts = _series.Select(Function(p, k) New PointF(pr.X + CSng((k + 0.5) / n * pr.Width), pr.Y + CSng(pr.Height - p.Value / max * pr.Height))).ToArray()
        ' Catmull-Rom → Bézier: passes through every point exactly
        Dim path As New GraphicsPath()
        For k = 0 To pts.Length - 2
            Dim p0 = pts(Math.Max(0, k - 1)), p1 = pts(k), p2 = pts(k + 1), p3 = pts(Math.Min(pts.Length - 1, k + 2))
            Dim c1 As New PointF(p1.X + (p2.X - p0.X) / 6, p1.Y + (p2.Y - p0.Y) / 6)
            Dim c2 As New PointF(p2.X - (p3.X - p1.X) / 6, p2.Y - (p3.Y - p1.Y) / 6)
            path.AddBezier(p1, c1, c2, p2)
        Next
        Using area = CType(path.Clone(), GraphicsPath)
            area.AddLine(pts(pts.Length - 1), New PointF(pts(pts.Length - 1).X, pr.Bottom))
            area.AddLine(New PointF(pts(pts.Length - 1).X, pr.Bottom), New PointF(pts(0).X, pr.Bottom))
            area.CloseFigure()
            Using b As New LinearGradientBrush(New Rectangle(pr.X, pr.Y - 1, pr.Width, pr.Height + 2), Color.FromArgb(46, LineColor), Color.FromArgb(0, LineColor), LinearGradientMode.Vertical)
                g.FillPath(b, area)
            End Using
        End Using
        Using pen As New Pen(LineColor, 2) : g.DrawPath(pen, path) : End Using
        If _hover >= 0 AndAlso _hover < n Then
            Dim p = pts(_hover)
            Using pen As New Pen(Color.FromArgb(&HC4, &HB5, &HFD)) With {.DashStyle = DashStyle.Dash} : g.DrawLine(pen, p.X, pr.Y, p.X, pr.Bottom) : End Using
            Using b As New SolidBrush(Color.White) : g.FillEllipse(b, p.X - 5, p.Y - 5, 10, 10) : End Using
            Using pen As New Pen(LineColor, 2) : g.DrawEllipse(pen, p.X - 5, p.Y - 5, 10, 10) : End Using
            Dim tip = _series(_hover).Label & "  " & Theme.Money(_series(_hover).Value)
            Dim tf = Theme.Px(12, 600)
            Dim tw = Tr.MeasureText(tip, tf).Width + 16
            Dim tb As New Rectangle(CInt(Math.Min(pr.Right - tw, Math.Max(pr.X, p.X - tw / 2))), CInt(Math.Max(0, p.Y - 36)), tw, 26)
            Using path2 = Theme.RoundRect(New RectangleF(tb.X, tb.Y, tb.Width, tb.Height), Theme.Radius)
                Using b As New SolidBrush(Theme.G900) : g.FillPath(b, path2) : End Using
            End Using
            Tr.DrawText(g, tip, tf, tb, Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        End If
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim pr = Plot()
        Dim n = _series.Count
        Dim k = If(n = 0 OrElse e.X < pr.X OrElse e.X > pr.Right, -1, Math.Min(n - 1, CInt(Math.Floor((e.X - pr.X) / (pr.Width / n)))))
        If k <> _hover Then _hover = k : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = -1 : Invalidate()
    End Sub
End Class

''' <summary>The dashboard's date range (RangeFilter.tsx, compact): "📅 Today ▾" — presets, then Custom range with From / To.</summary>
Public Class RangeButton
    Inherits Control
    Public Event Changed()
    Public Current As String = "today"
    Public From As Date = Date.Today
    Public [To] As Date = Date.Today
    Public Label As String = "Today"
    Private _hover As Boolean
    Private Shared ReadOnly Presets As String() = {"today|Today", "yesterday|Yesterday", "7days|7 Days", "this_month|This Month", "prev_month|Previous Month"}

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Cursor = Cursors.Hand
        Font = Theme.Px(14, 500)
        Height = 40
        Width = PreferredWidth()
    End Sub

    Public Function PreferredWidth() As Integer
        Return 12 + 14 + 8 + Math.Min(160, Tr.MeasureText(Label, Font).Width) + 8 + 11 + 12
    End Function

    Public ReadOnly Property Query As String
        Get
            If Current = "custom" Then Return "range=custom&from=" & From.ToString("yyyy-MM-dd") & "&to=" & [To].ToString("yyyy-MM-dd")
            Return "range=" & Current
        End Get
    End Property

    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        If Width <> PreferredWidth() Then
            Width = PreferredWidth()
            TryCast(FindForm(), MainForm)?.RefreshHeader()
            Return
        End If
        Dim tw = Math.Min(160, Tr.MeasureText(Label, Font).Width)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(If(_hover, Theme.G50, Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, "fa-calendar-days", New RectangleF(12, 13, 14, 14), Theme.Primary)
        Tr.DrawText(g, Label, Font, New Rectangle(34, 0, tw + 2, Height), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Icons.Draw(g, "fa-chevron-down", New RectangleF(34 + tw + 8, 15, 11, 11), Theme.G400)
    End Sub

    Protected Overrides Sub OnClick(e As EventArgs)
        MyBase.OnClick(e)
        Dim items = Presets.Select(Function(p) If(p.StartsWith(Current & "|"), "*", "") & p).ToList()
        items.Add("-")
        items.Add(If(Current = "custom", "*", "") & "custom|Custom range…")
        WebMenu.Show(Me, items, Sub(k)
                                    If k = "custom" Then
                                        Dim f As New FormDialog("Custom range", 320, "Apply")
                                        f.AddDate("from", "From", From)
                                        f.AddDate("to", "To", [To])
                                        If f.ShowDialog(FindForm()) <> DialogResult.OK Then Return
                                        Dim a = f.DateOf("from").GetValueOrDefault(Date.Today), b = f.DateOf("to").GetValueOrDefault(Date.Today)
                                        If b < a Then
                                            Dim t = a : a = b : b = t
                                        End If
                                        From = a : [To] = b : Current = "custom"
                                        Label = RangeChips.LongDate(a) & " – " & RangeChips.LongDate(b)
                                    Else
                                        Current = k
                                        Label = If(k = "7days", "Last 7 Days", Presets.First(Function(p) p.StartsWith(k & "|")).Split("|"c)(1))
                                    End If
                                    Invalidate()
                                    RaiseEvent Changed()
                                End Sub, userStyle:=True, alignRight:=True)
    End Sub
End Class

''' <summary>The header search (GlobalSearchBar, toolbar variant): orders by number, customers by name / mobile / id,
''' due receipts by number — 5 of each, from 2 characters, from the data on this computer (works offline).</summary>
Public Class GlobalSearch
    Inherits UserControl
    Private ReadOnly _box As New TextBox With {.BorderStyle = BorderStyle.None}
    Private ReadOnly _timer As New Timer With {.Interval = 250}
    Private _dd As ToolStripDropDown

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 40 : Width = 260
        _box.Font = Theme.Px(14)
        _box.PlaceholderText = "Order ID, receipt no., name, mobile…"
        Controls.Add(_box)
        AddHandler _box.GotFocus, Sub() Invalidate()
        AddHandler _box.LostFocus, Sub() Invalidate()
        AddHandler _box.TextChanged, Sub()
                                         _timer.Stop() : _timer.Start()
                                     End Sub
        AddHandler _timer.Tick, Sub()
                                    _timer.Stop()
                                    ShowResults()
                                End Sub
    End Sub

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        _box.SetBounds(34, (Height - _box.PreferredHeight) \ 2, Width - 34 - 12, _box.PreferredHeight)
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Dim f = _box.Focused
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(f, Theme.Primary, Theme.G200)) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, "fa-magnifying-glass", New RectangleF(12, 13, 14, 14), Theme.G400)
    End Sub

    Protected Overrides Sub OnClick(e As EventArgs)
        _box.Focus()
        MyBase.OnClick(e)
    End Sub

    Private Sub ShowResults()
        _dd?.Close()
        Dim q = _box.Text.Trim()
        If q.Length < 2 Then Return
        Dim ql = q.ToLowerInvariant()
        Dim res As New List(Of (Type As String, Title As String, [Sub] As String, Go As Action))
        Dim p = AppState.I.Perm
        Dim mf = TryCast(FindForm(), MainForm)
        If p.Has("orders", "view") OrElse {"manage_customers", "manage_billing", "manage_credits"}.Any(Function(k) p.Has("ecommerce", k)) Then
            For Each o In AppState.I.AllOrders().Where(Function(x) Js.Str(x, "number").ToLowerInvariant().Contains(ql)).OrderByDescending(Function(x) Js.Str(x, "createdAt")).Take(5)
                Dim id = Js.Int(o, "id")
                res.Add(("order", Js.Str(o, "number"), If(Js.Str(o, "customer") = "", "Walk-in", Js.Str(o, "customer")) & " · ₹" & Js.Num(o, "total").ToString("0.00") & " · " & Js.Str(o, "status"), Sub() mf?.Push(New OrderDetailPage(id))))
            Next
            Dim dues = AppState.I.List("dues")
            For Each c In AppState.I.List("customers").Where(Function(x) Js.Str(x, "name").ToLowerInvariant().Contains(ql) OrElse Js.Str(x, "phone").Contains(q) OrElse Js.Int(x, "id").ToString() = q).OrderByDescending(Function(x) Js.Str(x, "since")).Take(5)
                Dim cid = Js.Int(c, "id")
                Dim due = dues.Where(Function(d) Js.Int(d, "customerId") = cid).Sum(Function(d) Js.Num(d, "balance"))
                res.Add(("customer", Js.Str(c, "name") & " (#" & cid & ")", If(Js.Str(c, "phone") = "", "No phone", Js.Str(c, "phone")) & If(due > 0, " · Due ₹" & due.ToString("0.00"), ""), Sub() mf?.Push(New CustomerProfilePage(cid))))
            Next
            Dim n = 0
            For Each d In dues
                For Each pay In Js.Objs(Js.Arr(d, "payments"))
                    If n >= 5 OrElse Not Js.Str(pay, "receipt").ToLowerInvariant().Contains(ql) Then Continue For
                    n += 1
                    Dim cid = Js.Int(d, "customerId")
                    res.Add(("receipt", Js.Str(pay, "receipt"), Js.Str(d, "customer") & " · ₹" & Js.Num(pay, "amount").ToString("0.00"), Sub()
                                                                                                                                             If cid > 0 Then mf?.Push(New CustomerProfilePage(cid)) Else mf?.Pick("/admin/ecommerce/due")
                                                                                                                                         End Sub))
                Next
            Next
        End If
        Dim list As New SearchList(res, q, Sub() _dd?.Close())
        Dim w = Math.Max(Width, 320)
        list.Width = w
        Dim host As New ToolStripControlHost(list) With {.Margin = Padding.Empty, .Padding = Padding.Empty, .AutoSize = False, .Size = New Size(w, list.Height)}
        _dd = New ToolStripDropDown With {.Padding = Padding.Empty, .DropShadowEnabled = True, .AutoClose = True}
        _dd.Items.Add(host)
        _dd.Show(Me, New Point(Width - w, Height + 6))
        _box.Focus()
    End Sub

    Private Class SearchList
        Inherits Control
        Private ReadOnly _res As List(Of (Type As String, Title As String, [Sub] As String, Go As Action))
        Private ReadOnly _q As String
        Private ReadOnly _close As Action
        Private _hover As Integer = -1
        Public Sub New(res As List(Of (Type As String, Title As String, [Sub] As String, Go As Action)), q As String, close As Action)
            SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
            _res = res : _q = q : _close = close
            Cursor = Cursors.Hand
            Height = If(res.Count = 0, 48, Math.Min(340, res.Count * 52))
        End Sub
        Protected Overrides Sub OnPaint(e As PaintEventArgs)
            Dim g = e.Graphics
            g.Clear(Color.White)
            Theme.Smooth(g)
            Using pen As New Pen(Theme.G200) : g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1) : End Using
            If _res.Count = 0 Then
                Tr.DrawText(g, "No matches for """ & _q & """", Theme.Px(13.6F), New Rectangle(0, 0, Width, Height), Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
                Return
            End If
            For k = 0 To _res.Count - 1
                Dim r = _res(k)
                Dim y = k * 52
                If k = _hover Then
                    Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, 1, y, Width - 2, 52) : End Using
                End If
                Dim ic = If(r.Type = "order", "fa-receipt", If(r.Type = "receipt", "fa-hand-holding-dollar", "fa-user"))
                Icons.Draw(g, ic, New RectangleF(14, y + 11, 12, 12), Theme.Primary)
                Tr.DrawText(g, r.Title, Theme.Px(14, 600), New Rectangle(32, y + 8, Width - 46, 20), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                Tr.DrawText(g, r.Sub, Theme.Px(12), New Rectangle(14, y + 29, Width - 28, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                If k < _res.Count - 1 Then
                    Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 0, y + 51, Width, y + 51) : End Using
                End If
            Next
        End Sub
        Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
            MyBase.OnMouseMove(e)
            Dim k = e.Y \ 52
            If k <> _hover Then _hover = k : Invalidate()
        End Sub
        Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
            MyBase.OnMouseClick(e)
            Dim k = e.Y \ 52
            If k < 0 OrElse k >= _res.Count Then Return
            _close()
            _res(k).Go()
        End Sub
    End Class
End Class
