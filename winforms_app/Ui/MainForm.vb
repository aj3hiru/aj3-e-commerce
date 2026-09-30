Imports System.Drawing
Imports System.Windows.Forms

''' <summary>A page of the software (built once, kept alive — switching pages is instant).</summary>
Public MustInherit Class PageBase
    Inherits UserControl
    Public MustOverride ReadOnly Property PageTitle As String
    Public MustOverride ReadOnly Property PageSubtitle As String
    ''' <summary>Buttons shown on the right of the header for this page.</summary>
    Public Overridable ReadOnly Property Actions As Control()
        Get
            Return {}
        End Get
    End Property
    Public Sub New()
        DoubleBuffered = True
        BackColor = Theme.Page
        Dock = DockStyle.Fill
    End Sub
    ''' <summary>Called when the page comes on screen.</summary>
    Public Overridable Sub OnOpened()
    End Sub
    ''' <summary>F-keys etc. while this page is open. Return True when handled.</summary>
    Public Overridable Function HandleKey(k As Keys) As Boolean
        Return False
    End Function
    Protected Sub Toast(text As String, Optional isError As Boolean = False)
        TryCast(FindForm(), MainForm)?.Toast(text, isError)
    End Sub
End Class

''' <summary>The main window: the website's sidebar, header (title, page buttons, sync icon, user) and the page.</summary>
Public Class MainForm
    Inherits Form

    Public LoggedOut As Boolean
    Private ReadOnly _sidebar As New Sidebar()
    Private ReadOnly _header As New Panel With {.Dock = DockStyle.Top, .Height = 64, .BackColor = Color.White}
    Private ReadOnly _actions As New FlowLayoutPanel With {.FlowDirection = FlowDirection.RightToLeft, .WrapContents = False, .BackColor = Color.White, .AutoSize = False}
    Private ReadOnly _host As New Panel With {.Dock = DockStyle.Fill, .BackColor = Theme.Page}
    Private ReadOnly _pages As New Dictionary(Of String, PageBase)
    Private _current As PageBase
    Private ReadOnly _toast As New Label With {.AutoSize = False, .Visible = False, .Font = Theme.BodyBold, .ForeColor = Color.White, .TextAlign = ContentAlignment.MiddleLeft, .Padding = New Padding(14, 0, 14, 0)}
    Private ReadOnly _toastTimer As New Timer With {.Interval = 3200}

    Public Sub New()
        Text = "Sri Andal Staff"
        StartPosition = FormStartPosition.CenterScreen
        MinimumSize = New Size(1100, 700)
        Size = New Size(1440, 900)
        WindowState = FormWindowState.Maximized
        BackColor = Theme.Page
        Font = Theme.Body
        KeyPreview = True
        DoubleBuffered = True

        AddHandler _header.Paint, AddressOf PaintHeader
        AddHandler _header.Resize, Sub() LayoutHeader()
        _header.Controls.Add(_actions)
        Ui.DoubleBuffer(_header)
        Ui.DoubleBuffer(_host)
        Controls.Add(_host)
        Controls.Add(_header)
        Controls.Add(_sidebar)
        _host.Controls.Add(_toast)

        _sidebar.Add("MAIN", "dashboard", "Dashboard", Theme.IcHome)
        _sidebar.Add("SALES", "billing", "Billing / POS", Theme.IcShop)
        _sidebar.Add("CATALOG", "addproduct", "Add Product", Theme.IcAdd)
        _sidebar.Add("ACCOUNT", "logout", "Logout", Theme.IcSignOut)
        AddHandler _sidebar.Picked, AddressOf Pick

        AddHandler _toastTimer.Tick, Sub()
                                         _toastTimer.Stop()
                                         _toast.Visible = False
                                     End Sub
        AddHandler AppState.I.StatusChanged, Sub() _header.Invalidate()
        Pick("dashboard")
    End Sub

    Private Function Page(key As String) As PageBase
        Dim p As PageBase = Nothing
        If _pages.TryGetValue(key, p) Then Return p
        Select Case key
            Case "billing" : p = New BillingPage()
            Case "addproduct" : p = New AddProductPage()
            Case Else : p = New DashboardPage()
        End Select
        p.Visible = False
        _host.Controls.Add(p)
        _pages(key) = p
        Return p
    End Function

    Public Sub Pick(key As String)
        If key = "logout" Then
            Dim msg = If(AppState.I.Pending > 0, AppState.I.Pending & " change(s) have not reached the server yet. They stay safe on this computer and are sent when you log in again with internet.", "You can log in again any time.")
            If MessageBox.Show(msg, "Log out?", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) <> DialogResult.OK Then Return
            AppState.I.Logout()
            LoggedOut = True
            Close()
            Return
        End If
        Dim p = Page(key)
        SuspendLayout()
        If _current IsNot Nothing AndAlso _current IsNot p Then _current.Visible = False
        _current = p
        p.Visible = True
        p.BringToFront()
        _toast.BringToFront()
        _actions.Controls.Clear()
        For Each a In p.Actions.Reverse()
            a.Margin = New Padding(8, 13, 0, 0)
            _actions.Controls.Add(a)
        Next
        _sidebar.Current = key
        LayoutHeader()
        ResumeLayout()
        _header.Invalidate()
        p.OnOpened()
    End Sub

    Private Sub LayoutHeader()
        Dim w = 0
        For Each c As Control In _actions.Controls : w += c.Width + 8 : Next
        _actions.SetBounds(_header.Width - 220 - w, 0, w + 4, _header.Height)
    End Sub

    Private Sub PaintHeader(sender As Object, e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Using p As New Pen(Theme.G200) : g.DrawLine(p, 0, _header.Height - 1, _header.Width, _header.Height - 1) : End Using
        If _current IsNot Nothing Then
            TextRenderer.DrawText(g, _current.PageTitle, Theme.Title, New Point(22, 10), Theme.G900, TextFormatFlags.NoPadding)
            TextRenderer.DrawText(g, _current.PageSubtitle, Theme.Small, New Point(23, 38), Theme.G500, TextFormatFlags.NoPadding)
        End If
        ' Sync status: just an icon (no "offline" text), with the number waiting to be sent.
        Dim s = AppState.I
        Dim x = _header.Width - 206
        Dim box As New Rectangle(x, 14, 36, 36)
        Using p = Theme.RoundRect(New RectangleF(box.X, box.Y, box.Width, box.Height), 8)
            Using b As New SolidBrush(If(s.Online, Theme.PrimarySoft, Color.FromArgb(&HFE, &HF2, &HF2))) : g.FillPath(b, p) : End Using
        End Using
        Using f = Theme.IconFont(12)
            Theme.DrawCentered(g, If(s.Online, Theme.IcCloud, Theme.IcOffline), f, If(s.Online, Theme.Primary, Theme.Danger), box)
        End Using
        If s.Pending > 0 Then
            Using b As New SolidBrush(Theme.Danger) : g.FillEllipse(b, x + 24, 8, 18, 18) : End Using
            Theme.DrawCentered(g, s.Pending.ToString(), Theme.UiFont(7.5F, FontStyle.Bold), Color.White, New Rectangle(x + 24, 8, 18, 18))
        End If
        ' User chip
        Dim name = Js.Str(s.User, "name", Js.Str(s.User, "username"))
        Dim role = Js.Str(s.User, "roleLabel", Js.Str(s.User, "role"))
        Dim cx = _header.Width - 160
        Using p = Theme.RoundRect(New RectangleF(cx, 12, 148, 40), 20)
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Using b As New SolidBrush(Theme.Primary) : g.FillEllipse(b, cx + 5, 17, 30, 30) : End Using
        Theme.DrawCentered(g, If(name = "", "?", name.Substring(0, 1).ToUpperInvariant()), Theme.BodyBold, Color.White, New Rectangle(cx + 5, 17, 30, 30))
        TextRenderer.DrawText(g, name, Theme.BodyBold, New Rectangle(cx + 42, 15, 100, 18), Theme.G900, TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
        TextRenderer.DrawText(g, role, Theme.Small, New Rectangle(cx + 42, 32, 100, 16), Theme.G500, TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
    End Sub

    Protected Overrides Function ProcessCmdKey(ByRef msg As Message, keyData As Keys) As Boolean
        If _current IsNot Nothing AndAlso _current.HandleKey(keyData) Then Return True
        If keyData = Keys.F5 Then
            Dim unused = AppState.I.SyncNowAsync()
            Return True
        End If
        Return MyBase.ProcessCmdKey(msg, keyData)
    End Function

    Public Sub Toast(text As String, Optional isError As Boolean = False)
        _toast.Text = text
        _toast.BackColor = If(isError, Theme.Danger, Theme.G900)
        Dim w = Math.Min(560, TextRenderer.MeasureText(text, _toast.Font).Width + 40)
        _toast.SetBounds(_host.Width - w - 24, _host.Height - 70, w, 44)
        _toast.Visible = True
        _toast.BringToFront()
        _toastTimer.Stop()
        _toastTimer.Start()
    End Sub
End Class

''' <summary>The website's white sidebar: brand, section headings, links with icons (active = soft purple).</summary>
Public Class Sidebar
    Inherits Control
    Public Event Picked(key As String)
    Private ReadOnly _items As New List(Of (Section As String, Key As String, Label As String, Glyph As String))
    Private _rects As New List(Of (Key As String, Rect As Rectangle))
    Private _current As String = ""
    Private _hover As String = ""

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Dock = DockStyle.Left
        Width = 240
        BackColor = Color.White
        Cursor = Cursors.Hand
    End Sub

    Public Sub Add(section As String, key As String, label As String, glyph As String)
        _items.Add((section, key, label, glyph))
        Invalidate()
    End Sub

    Public Property Current As String
        Get
            Return _current
        End Get
        Set(value As String)
            _current = value
            Invalidate()
        End Set
    End Property

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Using p As New Pen(Theme.G200) : g.DrawLine(p, Width - 1, 0, Width - 1, Height) : End Using
        TextRenderer.DrawText(g, Js.Str(AppState.I.Settings, "businessName", "Sri Andal Traders"), Theme.UiFont(13.0F, FontStyle.Bold), New Rectangle(20, 18, Width - 30, 30), Theme.Primary, TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
        Using p As New Pen(Theme.G100) : g.DrawLine(p, 0, 64, Width, 64) : End Using
        _rects = New List(Of (String, Rectangle))
        Dim y = 80
        Dim lastSection = ""
        For Each it In _items
            If it.Section <> lastSection Then
                If lastSection <> "" Then y += 8
                TextRenderer.DrawText(g, it.Section, Theme.UiFont(7.5F, FontStyle.Bold), New Point(22, y), Theme.G500, TextFormatFlags.NoPadding)
                y += 22
                lastSection = it.Section
            End If
            Dim r As New Rectangle(10, y, Width - 22, 38)
            Dim active = it.Key = _current
            If active OrElse it.Key = _hover Then
                Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), 6)
                    Using b As New SolidBrush(If(active, Theme.PrimaryLight, Theme.G50)) : g.FillPath(b, p) : End Using
                End Using
            End If
            Dim fg = If(active, Theme.Primary, Theme.G700)
            Using f = Theme.IconFont(11)
                TextRenderer.DrawText(g, it.Glyph, f, New Rectangle(r.X + 8, r.Y, 24, r.Height), If(active, Theme.Primary, Theme.G500), TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter)
            End Using
            TextRenderer.DrawText(g, it.Label, If(active, Theme.BodyBold, Theme.Body), New Rectangle(r.X + 40, r.Y, r.Width - 44, r.Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            _rects.Add((it.Key, r))
            y += 42
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        Dim k = ""
        For Each r In _rects
            If r.Rect.Contains(e.Location) Then k = r.Key
        Next
        If k <> _hover Then _hover = k : Invalidate()
        MyBase.OnMouseMove(e)
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = "" : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        For Each r In _rects
            If r.Rect.Contains(e.Location) Then RaiseEvent Picked(r.Key) : Exit For
        Next
        MyBase.OnMouseClick(e)
    End Sub
End Class
