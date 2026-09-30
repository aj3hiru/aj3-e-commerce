Imports System.Drawing
Imports System.Text.Json.Nodes
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
        Main?.Toast(text, isError)
    End Sub
    Protected ReadOnly Property Main As MainForm
        Get
            Return TryCast(FindForm(), MainForm)
        End Get
    End Property
    ''' <summary>How tall the page's content is (for full-length pictures in the test run); 0 = fits the window.</summary>
    Public Overridable Function ContentHeight() As Integer
        Return 0
    End Function
    ''' <summary>Tell the header the title / buttons changed.</summary>
    Protected Sub HeaderChanged()
        Main?.RefreshHeader()
    End Sub
End Class

''' <summary>The main window: the website's sidebar (same menu as the website for this person), header
''' (title, page buttons, back, sync icon, user) and the page.</summary>
Public Class MainForm
    Inherits Form

    Public LoggedOut As Boolean
    Private ReadOnly _sidebar As New Sidebar()
    Private ReadOnly _header As New Panel With {.Dock = DockStyle.Top, .Height = 88, .BackColor = Color.White}
    Private ReadOnly _actions As New FlowLayoutPanel With {.FlowDirection = FlowDirection.RightToLeft, .WrapContents = False, .BackColor = Color.White, .AutoSize = False}
    Private ReadOnly _host As New Panel With {.Dock = DockStyle.Fill, .BackColor = Theme.Page}
    Private ReadOnly _pages As New Dictionary(Of String, PageBase)
    Private _current As PageBase
    Private _currentKey As String = ""

    Public ReadOnly Property CurrentPage As PageBase
        Get
            Return _current
        End Get
    End Property

    Public ReadOnly Property HeaderHeight As Integer
        Get
            Return _header.Height
        End Get
    End Property
    ''' <summary>Detail pages opened from a list (order, customer…): Back returns to the one before.</summary>
    Private ReadOnly _stack As New List(Of (Key As String, Page As PageBase))
    Private ReadOnly _toast As New Label With {.AutoSize = False, .Visible = False, .Font = Theme.BodyBold, .ForeColor = Color.White, .TextAlign = ContentAlignment.MiddleLeft, .Padding = New Padding(14, 0, 14, 0)}
    Private ReadOnly _toastTimer As New Timer With {.Interval = 3200}
    Private ReadOnly _tray As New NotifyIcon With {.Icon = SystemIcons.Application, .Text = "Sri Andal Staff", .Visible = True}
    Private _syncRect As Rectangle, _userRect As Rectangle, _backRect As Rectangle
    Private _titleLeft As Integer = 22

    Public Sub New()
        Icon = Theme.AppIcon
        Tr.KeepAmpersands(Me)
        Text = "Sri Andal Staff"
        StartPosition = FormStartPosition.CenterScreen
        MinimumSize = New Size(1100, 700)
        Size = New Size(1440, 900)
        WindowState = FormWindowState.Maximized
        BackColor = Theme.Page
        Font = Theme.Body
        KeyPreview = True
        DoubleBuffered = True
        Try
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath)
            _tray.Icon = Icon
        Catch
        End Try

        AddHandler _header.Paint, AddressOf PaintHeader
        AddHandler _header.Resize, Sub()
                                       ' header buttons follow the window width (Display Options label ≥1536px)
                                       For Each c As Control In _actions.Controls
                                           Dim d = TryCast(c, DisplayButton)
                                           If d IsNot Nothing Then d.Width = d.PreferredWidth() : d.Invalidate()
                                       Next
                                       LayoutHeader()
                                   End Sub
        AddHandler _header.MouseClick, AddressOf HeaderClick
        AddHandler _header.MouseMove, AddressOf HeaderMove
        AddHandler _header.MouseLeave, Sub()
                                           _hoverHead = ""
                                           _header.Invalidate()
                                       End Sub
        _header.Controls.Add(_actions)
        Ui.DoubleBuffer(_header)
        Ui.DoubleBuffer(_host)
        Controls.Add(_host)
        Controls.Add(_header)
        Controls.Add(_sidebar)
        _host.Controls.Add(_toast)

        _sidebar.Build()
        AddHandler _sidebar.Picked, AddressOf Pick
        AddHandler _toastTimer.Tick, Sub()
                                         _toastTimer.Stop()
                                         _toast.Visible = False
                                     End Sub
        AddHandler AppState.I.StatusChanged, Sub() _header.Invalidate(New Rectangle(_header.Width - 260, 0, 260, _header.Height))
        AddHandler AppState.I.MenuChanged, Sub()
                                               _sidebar.Build()
                                               _header.Invalidate()
                                           End Sub
        AddHandler AppState.I.Announce, Sub(t, b)
                                            _tray.ShowBalloonTip(6000, t, b, ToolTipIcon.Info)
                                            Toast(t & " — " & b)
                                        End Sub
        AddHandler AppState.I.NeedLogin, AddressOf OnNeedLogin
        AddHandler _tray.BalloonTipClicked, Sub()
                                                If WindowState = FormWindowState.Minimized Then WindowState = FormWindowState.Maximized
                                                Activate()
                                            End Sub
        Pick("/admin/dashboard")
    End Sub

    Protected Overrides Sub OnFormClosed(e As FormClosedEventArgs)
        _tray.Visible = False
        _tray.Dispose()
        MyBase.OnFormClosed(e)
    End Sub

    Private _askedLogin As Boolean
    Private Sub OnNeedLogin()
        If _askedLogin Then Return
        _askedLogin = True
        MessageBox.Show(Me, "Your login has expired or was changed on the website. Please log in again — nothing on this computer is lost.", "Log in again", MessageBoxButtons.OK, MessageBoxIcon.Information)
        AppState.I.Logout()
        LoggedOut = True
        Close()
    End Sub

    Private Function Page(key As String) As PageBase
        Dim p As PageBase = Nothing
        If _pages.TryGetValue(key, p) Then Return p
        p = Routes.Make(key)
        If p Is Nothing Then Return Nothing
        p.Visible = False
        _host.Controls.Add(p)
        _pages(key) = p
        Return p
    End Function

    ''' <summary>Open a menu page (by the website link).</summary>
    Public Sub Pick(key As String)
        If key = "logout-now" Then
            AppState.I.Logout()
            LoggedOut = True
            Close()
            Return
        End If
        If key = "logout" OrElse key = "/api/auth/logout" Then
            AskLogout()
            Return
        End If
        Dim p = Page(key)
        If p Is Nothing Then
            Toast("This page is not in the software yet.", True)
            Return
        End If
        For Each s In _stack
            If s.Page IsNot p Then s.Page.Visible = False : _host.Controls.Remove(s.Page) : s.Page.Dispose()
        Next
        _stack.Clear()
        _currentKey = key
        _sidebar.Current = key
        Showing(p)
    End Sub

    ''' <summary>Open a menu page and get it (to set a filter on it).</summary>
    Public Function Go(key As String) As PageBase
        Pick(key)
        Return _current
    End Function

    ''' <summary>Open a detail page on top of the current one (Back / Esc returns).</summary>
    Public Sub Push(p As PageBase)
        If _current IsNot Nothing Then _stack.Add((_currentKey, _current))
        p.Visible = False
        _host.Controls.Add(p)
        Showing(p)
    End Sub

    Public Sub Back()
        If _stack.Count = 0 Then Return
        Dim top = _current
        Dim prev = _stack(_stack.Count - 1)
        _stack.RemoveAt(_stack.Count - 1)
        Showing(prev.Page)
        If top IsNot Nothing AndAlso Not _pages.ContainsValue(top) Then
            _host.Controls.Remove(top)
            top.Dispose()
        End If
    End Sub

    Private Sub Showing(p As PageBase)
        SuspendLayout()
        If _current IsNot Nothing AndAlso _current IsNot p Then _current.Visible = False
        _current = p
        Crash.CurrentPage = p.PageTitle
        p.Visible = True
        p.BringToFront()
        _toast.BringToFront()
        RefreshHeader()
        ResumeLayout()
        p.OnOpened()
    End Sub

    Public Sub RefreshHeader()
        If _current Is Nothing Then Return
        _actions.SuspendLayout()
        _actions.Controls.Clear()
        For Each a In _current.Actions.Reverse()
            a.Margin = New Padding(12, (_header.Height - a.Height) \ 2, 0, 0)
            _actions.Controls.Add(a)
        Next
        _actions.ResumeLayout()
        LayoutHeader()
        _header.Invalidate()
    End Sub

    Private Sub AskLogout()
        Dim msg = If(AppState.I.Pending > 0, AppState.I.Pending & " change(s) have not reached the server yet. They stay safe on this computer and are sent when you log in again with internet.", "You can log in again any time — everything stays on this computer.")
        If MessageBox.Show(Me, msg, "Log out?", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) <> DialogResult.OK Then Return
        AppState.I.Logout()
        LoggedOut = True
        Close()
    End Sub

    ' ── header: the website's .top-nav (AdminHeader.tsx) ──
    Private ReadOnly _titleFont As Font = Theme.Px(24, 700)
    Private ReadOnly _subFont As Font = Theme.Px(14)
    Private ReadOnly _nameFont As Font = Theme.Px(14, 700)
    Private ReadOnly _roleFont As Font = Theme.Px(12)
    Private _hoverHead As String = ""

    Private Function UserPillWidth() As Integer
        Dim s = AppState.I
        Dim name = Js.Str(s.User, "username", Js.Str(s.User, "name"))
        Dim role = Js.Str(s.User, "roleLabel", Fmt.Title(Js.Str(s.User, "role")))
        Dim tw = Math.Max(Tr.MeasureText(name, _nameFont).Width, Tr.MeasureText(role, _roleFont).Width)
        Return 6 + 36 + 11 + tw + 12
    End Function

    Private Sub LayoutHeader()
        Dim w = 0
        For Each c As Control In _actions.Controls : w += c.Width + 12 : Next
        Dim right = _header.Width - 7 - UserPillWidth() - 12 - 40 - 12
        _actions.SetBounds(right - w, 0, w, _header.Height)
    End Sub

    Private Sub PaintHeader(sender As Object, e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Using p As New Pen(Theme.G200) : g.DrawLine(p, 0, _header.Height - 1, _header.Width, _header.Height - 1) : End Using
        _titleLeft = 7
        If _stack.Count > 0 Then
            ' back to the list (detail pages) — the website's 40×40 grey icon button
            _backRect = New Rectangle(7 + 16, (_header.Height - 40) \ 2, 40, 40)
            Using p = Theme.RoundRect(New RectangleF(_backRect.X, _backRect.Y, 40, 40), Theme.Radius)
                Using b As New SolidBrush(If(_hoverHead = "back", Theme.G200, Theme.G100)) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, "arrow-left", New RectangleF(_backRect.X + 11, _backRect.Y + 11, 18, 18), Theme.G700)
            _titleLeft = _backRect.Right + 16
        Else
            _titleLeft = 7 + 16
        End If
        Dim room = Math.Max(160, _actions.Left - _titleLeft - 16)
        If _current IsNot Nothing Then
            Tr.DrawText(g, _current.PageTitle, _titleFont, New Rectangle(_titleLeft, 7, room, 30), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            Tr.DrawText(g, _current.PageSubtitle, _subFont, New Rectangle(_titleLeft, 7 + 29 + 8, room, 21), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        End If
        Dim s = AppState.I
        ' user pill: .header-user (bg gray-50, round) — avatar (purple gradient, first letter), name, role
        Dim pw = UserPillWidth()
        _userRect = New Rectangle(_header.Width - 7 - pw, (_header.Height - 48) \ 2, pw, 48)
        Using p = Theme.RoundRect(New RectangleF(_userRect.X, _userRect.Y, pw, 48), 24)
            Using b As New SolidBrush(If(_hoverHead = "user", Theme.G100, Theme.G50)) : g.FillPath(b, p) : End Using
        End Using
        Dim av As New Rectangle(_userRect.X + 6, _userRect.Y + 6, 36, 36)
        Dim pic = Img.Get(Js.Str(s.User, "avatar"), 72, Sub() _header.Invalidate())
        If pic IsNot Nothing Then
            Gfx.Avatar(g, av, "", pic)
        Else
            Using b As New Drawing2D.LinearGradientBrush(av, Theme.Primary, Theme.PrimaryDark, Drawing2D.LinearGradientMode.ForwardDiagonal) : g.FillEllipse(b, av) : End Using
            Dim uname = Js.Str(s.User, "username", "?")
            Tr.DrawText(g, uname.Substring(0, 1).ToUpperInvariant(), Theme.Px(15, 700), av, Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        End If
        Dim tx = av.Right + 11
        Tr.DrawText(g, Js.Str(s.User, "username", Js.Str(s.User, "name")), _nameFont, New Point(tx, _userRect.Y + 7), Theme.G900, TextFormatFlags.NoPadding)
        Tr.DrawText(g, Js.Str(s.User, "roleLabel", Fmt.Title(Js.Str(s.User, "role"))), _roleFont, New Point(tx, _userRect.Y + 26), Theme.G500, TextFormatFlags.NoPadding)
        ' sync (this software's): the website's .icon-btn — 40×40, primary-lighter, primary icon; red when something failed
        Dim bad = s.FailedCount > 0
        _syncRect = New Rectangle(_userRect.X - 12 - 40, (_header.Height - 40) \ 2, 40, 40)
        Using p = Theme.RoundRect(New RectangleF(_syncRect.X, _syncRect.Y, 40, 40), Theme.Radius)
            Using b As New SolidBrush(If(bad OrElse Not s.Online, Color.FromArgb(&HFE, &HF2, &HF2), Theme.PrimarySoft)) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, If(s.Syncing, "refresh-cw", If(s.Online, "cloud", "cloud-off")), New RectangleF(_syncRect.X + 11, _syncRect.Y + 11, 18, 18), If(s.Online AndAlso Not bad, Theme.Primary, Theme.Danger))
        Dim n = s.Pending + s.FailedCount
        If n > 0 Then
            Dim t = If(n > 99, "99+", n.ToString())
            Dim bf = Theme.Px(10, 700)
            Dim bw = Math.Max(18, Tr.MeasureText(t, bf).Width + 8)
            Dim br As New Rectangle(_syncRect.Right - bw + 6, _syncRect.Y - 6, bw, 18)
            Using p = Theme.RoundRect(New RectangleF(br.X, br.Y, br.Width, br.Height), 9)
                Using b As New SolidBrush(Theme.Danger) : g.FillPath(b, p) : End Using
            End Using
            Tr.DrawText(g, t, bf, br, Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        End If
    End Sub

    Private Sub HeaderMove(sender As Object, e As MouseEventArgs)
        Dim h = If(_stack.Count > 0 AndAlso _backRect.Contains(e.Location), "back", If(_syncRect.Contains(e.Location), "sync", If(_userRect.Contains(e.Location), "user", "")))
        _header.Cursor = If(h = "", Cursors.Default, Cursors.Hand)
        If h <> _hoverHead Then _hoverHead = h : _header.Invalidate()
    End Sub

    Private Sub HeaderClick(sender As Object, e As MouseEventArgs)
        If _stack.Count > 0 AndAlso _backRect.Contains(e.Location) Then Back() : Return
        If _syncRect.Contains(e.Location) Then
            Using d As New SyncCenter() : d.ShowDialog(Me) : End Using
            _header.Invalidate()
            Return
        End If
        If _userRect.Contains(e.Location) Then
            ' .header-user-menu: Edit Profile · Logout (as on the website)
            WebMenu.Show(_header, {"profile|Edit Profile|fa-user-pen", "-", "logout|Logout|fa-right-from-bracket"},
                       Sub(k)
                           Select Case k
                               Case "profile" : Pick("/admin/my-profile")
                               Case "logout" : AskLogout()
                           End Select
                       End Sub, _header.PointToScreen(New Point(_userRect.Right - 190, _userRect.Bottom + 12)), userStyle:=True)
        End If
    End Sub

    Private Async Function SyncAllAsync() As Task
        Toast("Syncing…")
        Await AppState.I.SyncNowAsync()
        Await AppState.I.LoadPagesAsync(True)
        Toast(If(AppState.I.Online, "Everything is up to date.", "No internet — your changes are safe and will be sent later."), Not AppState.I.Online)
    End Function

    Protected Overrides Function ProcessCmdKey(ByRef msg As Message, keyData As Keys) As Boolean
        If _current IsNot Nothing AndAlso _current.HandleKey(keyData) Then Return True
        If keyData = Keys.F5 Then
            Dim unused = SyncAllAsync()
            Return True
        End If
        If keyData = (Keys.Alt Or Keys.Left) OrElse (keyData = Keys.Escape AndAlso _stack.Count > 0 AndAlso Not (TypeOf ActiveControl Is TextBoxBase)) Then
            Back()
            Return True
        End If
        If keyData = (Keys.Control Or Keys.K) Then
            Using d As New QuickFind(Me) : d.ShowDialog(Me) : End Using
            Return True
        End If
        Return MyBase.ProcessCmdKey(msg, keyData)
    End Function

    Public Sub Toast(text As String, Optional isError As Boolean = False)
        _toast.Text = text
        _toast.BackColor = If(isError, Theme.Danger, Theme.G900)
        Dim w = Math.Min(620, Tr.MeasureText(text, _toast.Font).Width + 40)
        _toast.SetBounds(_host.Width - w - 24, _host.Height - 70, w, 44)
        _toast.Visible = True
        _toast.BringToFront()
        _toastTimer.Stop()
        _toastTimer.Start()
    End Sub
End Class

''' <summary>Changes made on this computer that have not reached the server yet (and any the server refused),
''' with Retry / Discard — the Sync Center.</summary>
Public Class SyncCenter
    Inherits Form
    Private ReadOnly _table As New WebTable() With {.RowHeight = 56}
    Private ReadOnly _info As New Label With {.AutoSize = False, .Font = Theme.Body, .ForeColor = Theme.G600, .BackColor = Color.White}
    Private ReadOnly _scroll As New Panel With {.AutoScroll = True, .BackColor = Color.White}

    Public Sub New()
        Icon = Theme.AppIcon
        Tr.KeepAmpersands(Me)
        Text = "Changes waiting to be sent"
        StartPosition = FormStartPosition.CenterParent
        ClientSize = New Size(860, 560)
        MinimizeBox = False
        ShowInTaskbar = False
        BackColor = Color.White
        Font = Theme.Body
        Dim sendNow = WButton.Make("Send now", Theme.IcSync, Theme.Primary)
        Dim close = WButton.Make("Close", "", Theme.Primary, outline:=True)
        _info.SetBounds(20, 16, 560, 44)
        sendNow.Location = New Point(ClientSize.Width - 20 - sendNow.Width, 18)
        close.Location = New Point(sendNow.Left - 10 - close.Width, 18)
        sendNow.Anchor = AnchorStyles.Top Or AnchorStyles.Right
        close.Anchor = AnchorStyles.Top Or AnchorStyles.Right
        _scroll.SetBounds(20, 72, ClientSize.Width - 40, ClientSize.Height - 92)
        _scroll.Anchor = AnchorStyles.Top Or AnchorStyles.Left Or AnchorStyles.Right Or AnchorStyles.Bottom
        _scroll.Controls.Add(_table)
        Controls.AddRange(New Control() {_info, close, sendNow, _scroll})
        _table.EmptyText = "Nothing waiting — everything has reached the server."
        _table.Cols.Add(New TCol("Change", Function(r) Js.Str(r, "label"), 0, CellKind.Bold) With {.Flex = 3, .Sub = Function(r) Js.Str(r, "path")})
        _table.Cols.Add(New TCol("Made", Function(r) Fmt.Stamp(Js.Time(r, "createdAt")), 190))
        _table.Cols.Add(New TCol("Status", Function(r) If(Js.Bool(r, "failed"), "Refused", "Waiting"), 150, CellKind.Pill) With {.Colour = Function(r) If(Js.Bool(r, "failed"), Theme.Red, Fmt.Yellow), .Sub = Function(r) Js.Str(r, "error")})
        _table.Cols.Add(New TCol("", Nothing, 90, CellKind.Actions).Btn("retry", Theme.IcRefresh, "Send again", Theme.Primary).Btn("discard", Theme.IcDelete, "Discard this change", Theme.Danger))
        AddHandler _table.ActionClick, Sub(r, k)
                                           Dim o = AppState.I.Outbox.FirstOrDefault(Function(x) x.Id = Js.Str(r, "id"))
                                           If o Is Nothing Then Return
                                           If k = "retry" Then
                                               AppState.I.Retry(o)
                                           ElseIf Ui.Confirm(Me, "Discard """ & o.Label & """? It will not be sent to the server.") Then
                                               AppState.I.Discard(o)
                                           End If
                                           Fill()
                                       End Sub
        AddHandler sendNow.Click, Async Sub()
                                      sendNow.Enabled = False
                                      Await AppState.I.SyncNowAsync()
                                      sendNow.Enabled = True
                                      Fill()
                                  End Sub
        AddHandler close.Click, Sub() Me.Close()
        AddHandler _scroll.Resize, Sub() Fill()
        Fill()
    End Sub

    Private Sub Fill()
        Dim s = AppState.I
        _table.Rows = s.Outbox.Select(Function(o) o.ToJson()).ToList()
        _info.Text = If(s.Online, "Connected. ", "No internet right now — changes are kept safely on this computer. ") &
            s.Pending & " waiting, " & s.FailedCount & " refused by the server." & If(s.LastSync.HasValue, "  Last sync " & Fmt.Ago(s.LastSync) & ".", "")
        Dim w = _scroll.ClientSize.Width
        _table.SetBounds(0, 0, w, _table.HeightFor(w))
        _table.Invalidate()
    End Sub
End Class

''' <summary>Ctrl+K: jump to any page, product, order or customer by typing.</summary>
Public Class QuickFind
    Inherits Form
    Private ReadOnly _q As WInput = WInput.Make("Search pages, products, orders, customers…", Theme.IcSearch)
    Private ReadOnly _list As New ListBox With {.BorderStyle = BorderStyle.None, .Font = Theme.Body, .IntegralHeight = False, .ItemHeight = 34, .DrawMode = DrawMode.OwnerDrawFixed}
    Private ReadOnly _main As MainForm
    Private _hits As New List(Of (Kind As String, Label As String, [Sub] As String, Go As Action))

    Public Sub New(main As MainForm)
        Icon = Theme.AppIcon
        Tr.KeepAmpersands(Me)
        _main = main
        FormBorderStyle = FormBorderStyle.None
        StartPosition = FormStartPosition.CenterParent
        ClientSize = New Size(640, 440)
        BackColor = Color.White
        ShowInTaskbar = False
        KeyPreview = True
        _q.SetBounds(16, 16, 608, 42)
        _list.SetBounds(16, 70, 608, 354)
        Controls.Add(_q)
        Controls.Add(_list)
        AddHandler Paint, Sub(s, e)
                              Using p As New Pen(Theme.G300) : e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1) : End Using
                          End Sub
        AddHandler _q.TextChanged, Sub() Search()
        AddHandler _list.DrawItem, AddressOf DrawHit
        AddHandler _list.DoubleClick, Sub() Go()
        AddHandler Deactivate, Sub() Close()
        Search()
    End Sub

    Protected Overrides Sub OnShown(e As EventArgs)
        MyBase.OnShown(e)
        _q.Box.Focus()
    End Sub

    Protected Overrides Sub OnKeyDown(e As KeyEventArgs)
        MyBase.OnKeyDown(e)
        Select Case e.KeyCode
            Case Keys.Escape : Close()
            Case Keys.Down : If _list.SelectedIndex < _list.Items.Count - 1 Then _list.SelectedIndex += 1
                e.Handled = True
            Case Keys.Up : If _list.SelectedIndex > 0 Then _list.SelectedIndex -= 1
                e.Handled = True
            Case Keys.Enter : Go() : e.SuppressKeyPress = True
        End Select
    End Sub

    Private Sub Go()
        Dim i = _list.SelectedIndex
        If i < 0 OrElse i >= _hits.Count Then Return
        Dim a = _hits(i).Go
        Close()
        a()
    End Sub

    Private Sub Search()
        Dim q = _q.Text.Trim().ToLowerInvariant()
        _hits = New List(Of (String, String, String, Action))
        Dim menu = Routes.WithAppLinks(AppState.I.Menu)
        For Each sec In Js.Objs(menu)
            For Each l In Js.Objs(Js.Arr(sec, "links")).Concat(Js.Objs(Js.Arr(sec, "links")).SelectMany(Function(x) Js.Objs(Js.Arr(x, "submenu"))))
                Dim label = Js.Str(l, "label"), href = Js.Str(l, "href")
                If Js.Bool(l, "toggleOnly") OrElse Js.Bool(l, "logout") Then Continue For
                If q = "" OrElse label.ToLowerInvariant().Contains(q) Then _hits.Add(("Page", label, Js.Str(sec, "title"), Sub() _main.Pick(href)))
            Next
        Next
        If q.Length >= 2 Then
            For Each p In AppState.I.List("products").Where(Function(x) Js.Str(x, "name").ToLowerInvariant().Contains(q) OrElse Js.Str(x, "sku").ToLowerInvariant().Contains(q) OrElse Js.Str(x, "barcode").ToLowerInvariant() = q).Take(8)
                Dim id = Js.Int(p, "id")
                _hits.Add(("Product", Js.Str(p, "name"), Theme.Money(Js.Num(p, "price")) & "  ·  stock " & Js.Str(p, "stock"), Sub() _main.Push(New AddProductPage(id))))
            Next
            For Each o In AppState.I.List("orders").Where(Function(x) Js.Str(x, "number").ToLowerInvariant().Contains(q) OrElse Js.Str(x, "customer").ToLowerInvariant().Contains(q) OrElse Js.Str(x, "phone").Contains(q)).Take(8)
                Dim oid = Js.Int(o, "id")
                _hits.Add(("Order", Js.Str(o, "number") & "  ·  " & Js.Str(o, "customer"), Theme.Money(Js.Num(o, "total")) & "  ·  " & Js.Str(o, "status"), Sub() _main.Push(New OrderDetailPage(oid))))
            Next
            For Each c In AppState.I.List("customers").Where(Function(x) Js.Str(x, "name").ToLowerInvariant().Contains(q) OrElse Js.Str(x, "phone").Contains(q)).Take(8)
                Dim cid = Js.Int(c, "id")
                _hits.Add(("Customer", Js.Str(c, "name"), Js.Str(c, "phone"), Sub() _main.Push(New CustomerProfilePage(cid))))
            Next
        End If
        _list.BeginUpdate()
        _list.Items.Clear()
        For Each h In _hits.Take(60) : _list.Items.Add(h.Label) : Next
        _list.EndUpdate()
        If _list.Items.Count > 0 Then _list.SelectedIndex = 0
    End Sub

    Private Sub DrawHit(sender As Object, e As DrawItemEventArgs)
        If e.Index < 0 OrElse e.Index >= _hits.Count Then Return
        Dim h = _hits(e.Index)
        Dim sel = (e.State And DrawItemState.Selected) = DrawItemState.Selected
        Using b As New SolidBrush(If(sel, Theme.PrimarySoft, Color.White)) : e.Graphics.FillRectangle(b, e.Bounds) : End Using
        Gfx.Badge(e.Graphics, h.Kind, e.Bounds.X + 8, e.Bounds.Y + e.Bounds.Height \ 2, Theme.Primary, Theme.PrimaryLight)
        Tr.DrawText(e.Graphics, h.Label, Theme.BodyBold, New Rectangle(e.Bounds.X + 84, e.Bounds.Y, 300, e.Bounds.Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
        Tr.DrawText(e.Graphics, h.Sub, Theme.Small, New Rectangle(e.Bounds.X + 390, e.Bounds.Y, e.Bounds.Width - 396, e.Bounds.Height), Theme.G500, TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding Or TextFormatFlags.Right)
    End Sub
End Class

''' <summary>After login (first time, or after an update with new pages): everything is downloaded once with a
''' % bar, so every page opens offline afterwards. Without internet it retries by itself.</summary>
Public Class SetupForm
    Inherits Form
    Private _pct As Double
    Private _step As String = "Connecting"
    Private _waiting As Boolean
    Private ReadOnly _skip As WButton = WButton.Make("Open with what is saved", "", Theme.Primary, outline:=True)
    Private ReadOnly _retry As New Timer With {.Interval = 5000}

    Public Sub New()
        Icon = Theme.AppIcon
        Tr.KeepAmpersands(Me)
        Text = "Sri Andal Staff"
        FormBorderStyle = FormBorderStyle.FixedSingle
        MaximizeBox = False
        StartPosition = FormStartPosition.CenterScreen
        ClientSize = New Size(520, 300)
        BackColor = Color.FromArgb(&HF3, &HF3, &HF3)
        DoubleBuffered = True
        Font = Theme.Body
        _skip.Location = New Point(ClientSize.Width - 50 - _skip.Width, 222)
        _skip.Visible = AppState.I.Sets.Count > 0
        Controls.Add(_skip)
        AddHandler _skip.Click, Sub()
                                    DialogResult = DialogResult.OK
                                End Sub
        AddHandler _retry.Tick, Async Sub()
                                    _retry.Stop()
                                    Await RunAsync()
                                End Sub
    End Sub

    Protected Overrides Async Sub OnShown(e As EventArgs)
        MyBase.OnShown(e)
        Await RunAsync()
    End Sub

    Private Async Function RunAsync() As Task
        _waiting = False
        Invalidate()
        Dim ok = Await AppState.I.DownloadAllAsync(Sub(p, s)
                                                       _pct = p : _step = s
                                                       Invalidate()
                                                   End Sub)
        If IsDisposed Then Return
        If ok Then
            DialogResult = DialogResult.OK
            Return
        End If
        _waiting = True
        Invalidate()
        _retry.Start()
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Dim card As New Rectangle(30, 24, ClientSize.Width - 60, ClientSize.Height - 48)
        Using p = Theme.RoundRect(New RectangleF(card.X, card.Y, card.Width, card.Height), 8)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Color.FromArgb(&HE5, &HE5, &HE5)) : g.DrawPath(pen, p) : End Using
        End Using
        Using p = Theme.RoundRect(New RectangleF(card.X + 24, card.Y + 24, 36, 36), 8)
            Using b As New SolidBrush(Theme.Primary) : g.FillPath(b, p) : End Using
        End Using
        Using f = Theme.IconFont(14) : Theme.DrawCentered(g, Theme.IcShop, f, Color.White, New Rectangle(card.X + 24, card.Y + 24, 36, 36)) : End Using
        Tr.DrawText(g, "Getting everything ready", Theme.UiFont(12.5F, FontStyle.Bold), New Point(card.X + 72, card.Y + 22), Theme.G900, TextFormatFlags.NoPadding)
        Tr.DrawText(g, "One time only — after this every page opens instantly, even offline.", Theme.Small, New Point(card.X + 72, card.Y + 46), Theme.G500, TextFormatFlags.NoPadding)
        Dim bar As New Rectangle(card.X + 24, card.Y + 94, card.Width - 48, 10)
        Using p = Theme.RoundRect(New RectangleF(bar.X, bar.Y, bar.Width, bar.Height), 5)
            Using b As New SolidBrush(Theme.G100) : g.FillPath(b, p) : End Using
        End Using
        Dim fw = CInt(bar.Width * Math.Max(0.02, _pct))
        Using p = Theme.RoundRect(New RectangleF(bar.X, bar.Y, fw, bar.Height), 5)
            Using b As New SolidBrush(Theme.Primary) : g.FillPath(b, p) : End Using
        End Using
        Tr.DrawText(g, CInt(Math.Floor(_pct * 100)) & "%", Theme.UiFont(18.0F, FontStyle.Bold), New Point(card.X + 22, card.Y + 116), Theme.G900, TextFormatFlags.NoPadding)
        Tr.DrawText(g, If(_waiting, "Waiting for internet… trying again by itself.", _step), Theme.Body, New Rectangle(card.X + 100, card.Y + 122, card.Width - 124, 24), If(_waiting, Theme.Danger, Theme.G600), TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class
