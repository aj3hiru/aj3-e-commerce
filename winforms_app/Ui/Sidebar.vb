Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>The website's sidebar (AdminSidebar.tsx), same sizes and colours: brand + "Sidebar menus" button on top,
''' section titles, links with their Font Awesome icons, submenus opened with the chevron (remembered), the
''' person's hidden sections / links (SidebarMenuOptions). Same links as the website for this person.</summary>
Public Class Sidebar
    Inherits Control
    Public Event Picked(key As String)

    Friend Class Item
        Public Section As String, Href As String, Label As String, Icon As String
        Public Children As New List(Of Item)
        Public ToggleOnly As Boolean
        Public Logout As Boolean
        Public Parent As Item
        Public ReadOnly Property Id As String
            Get
                Return Section & "|" & Label
            End Get
        End Property
    End Class

    Friend Class Section
        Public Title As String
        Public Links As New List(Of Item)
    End Class

    Private Const W As Integer = 280
    Private Const HeadH As Integer = 89
    Private Shared ReadOnly Idle As Color = Color.FromArgb(&H4B, &H55, &H63)
    Private Shared ReadOnly HoverText As Color = Color.FromArgb(&H11, &H18, &H27)
    Private Shared ReadOnly ActiveBg As Color = Color.FromArgb(&HF5, &HF3, &HFF)
    Private Shared ReadOnly ActiveText As Color = Color.FromArgb(&H7C, &H3A, &HED)
    Private ReadOnly _linkFont As Font = Theme.Px(15, 500)
    Private ReadOnly _linkActive As Font = Theme.Px(15, 600)
    Private ReadOnly _subFont As Font = Theme.Px(14, 500)
    Private ReadOnly _subActive As Font = Theme.Px(14, 600)
    Private ReadOnly _titleFont As Font = Theme.Px(11, 700)
    Private ReadOnly _brandFont As Font = Theme.Px(18.4F, 800)

    Friend ReadOnly Sections As New List(Of Section)
    Private _rects As New List(Of (It As Item, Rect As Rectangle, Chevron As Rectangle))
    Private _current As String = ""
    Private _hover As Item
    Private _hoverChevron As Item
    Private _hoverOptions As Boolean
    Private _scroll As Integer
    Private _contentH As Integer
    Private ReadOnly _open As New HashSet(Of String)
    Friend ReadOnly Hidden As New HashSet(Of String)
    Private _optionsRect As Rectangle
    Private _optionsOpen As Boolean

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.Selectable, True)
        Dock = DockStyle.Left
        Width = W
        BackColor = Color.White
        Dim saved = TryCast(Store.Read("sidebar_open"), JsonArray)
        If saved IsNot Nothing Then
            For Each x In saved : _open.Add(x.ToString()) : Next
        End If
        Dim hid = TryCast(Store.Read("admin_sidebar_hidden_v1"), JsonArray)
        If hid IsNot Nothing Then
            For Each x In hid : Hidden.Add(x.ToString()) : Next
        End If
    End Sub

    ' keys exactly as the website's SidebarMenuOptions
    Friend Shared Function SectionKey(s As String) As String
        Return "s:" & s
    End Function
    Friend Shared Function LinkKey(s As String, label As String) As String
        Return "l:" & s & "|" & label
    End Function
    Friend Shared Function SubKey(s As String, parent As String, label As String) As String
        Return "u:" & s & "|" & parent & "|" & label
    End Function

    Friend Sub SaveHidden()
        Dim a As New JsonArray()
        For Each h In Hidden : a.Add(h) : Next
        Store.Write("admin_sidebar_hidden_v1", a)
        Invalidate()
    End Sub

    ''' <summary>Builds the menu from the website's menu for this person (or a built-in copy before the first download).</summary>
    Public Sub Build()
        Sections.Clear()
        For Each sec In Js.Objs(Routes.WithAppLinks(AppState.I.Menu))
            Dim s As New Section With {.Title = Js.Str(sec, "title")}
            For Each l In Js.Objs(Js.Arr(sec, "links"))
                Dim it = MakeItem(s.Title, l)
                For Each x In Js.Objs(Js.Arr(l, "submenu"))
                    Dim c = MakeItem(s.Title, x)
                    c.Parent = it
                    it.Children.Add(c)
                Next
                If it.ToggleOnly AndAlso it.Children.Count = 0 Then Continue For
                s.Links.Add(it)
            Next
            If s.Links.Count > 0 Then Sections.Add(s)
        Next
        Invalidate()
    End Sub

    Private Shared Function MakeItem(section As String, l As JsonObject) As Item
        Return New Item With {.Section = section, .Href = Js.Str(l, "href"), .Label = Js.Str(l, "label"), .Icon = Js.Str(l, "icon"), .ToggleOnly = Js.Bool(l, "toggleOnly"), .Logout = Js.Bool(l, "logout")}
    End Function

    Public Property Current As String
        Get
            Return _current
        End Get
        Set(value As String)
            _current = value
            ' the group you're in opens (as on the website)
            For Each s In Sections
                For Each it In s.Links
                    If it.Children.Any(Function(c) IsHere(c)) Then _open.Add(it.Id)
                Next
            Next
            Invalidate()
        End Set
    End Property

    ''' <summary>Is this link the page on screen? (Customizer: no ?tab = Homepage.)</summary>
    Private Function IsHere(it As Item) As Boolean
        If it.Href = _current Then Return True
        If it.Href = "/admin/customizer?tab=home" AndAlso _current = "/admin/customizer" Then Return True
        Return False
    End Function

    Private Function IsActive(it As Item) As Boolean
        If it.Parent Is Nothing AndAlso it.Children.Any(Function(c) IsHere(c)) Then Return False ' highlight the sub-page, not both
        Return IsHere(it)
    End Function

    Private Function VisibleChildren(it As Item) As List(Of Item)
        Return it.Children.Where(Function(c) Not Hidden.Contains(SubKey(it.Section, it.Label, c.Label))).ToList()
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        _rects = New List(Of (Item, Rectangle, Rectangle))
        Dim y = HeadH + 16 - _scroll
        For Each s In Sections
            If Hidden.Contains(SectionKey(s.Title)) Then Continue For
            Dim links = s.Links.Where(Function(l) Not Hidden.Contains(LinkKey(s.Title, l.Label))).ToList()
            If links.Count = 0 Then Continue For
            ' .nav-title: 11px / 700 / uppercase / letter-spacing .1em / gray-400
            Tr.DrawSpaced(g, s.Title.ToUpperInvariant(), _titleFont, New Point(16 + 16, y), Theme.G400, 1.1F)
            y += 17 + 12
            For Each it In links
                Dim subs = VisibleChildren(it)
                If it.ToggleOnly AndAlso subs.Count = 0 Then Continue For
                Dim hasSub = subs.Count > 0
                y = DrawLink(g, it, y, False, hasSub)
                If hasSub AndAlso _open.Contains(it.Id) Then
                    For Each c In subs : y = DrawLink(g, c, y, True, False) : Next
                End If
            Next
            y += 24 - 4
        Next
        _contentH = y + _scroll + 16
        ' header on top (the list scrolls under it)
        Using b As New SolidBrush(Color.White) : g.FillRectangle(b, 0, 0, Width, HeadH) : End Using
        DrawBrand(g)
        Using p As New Pen(Color.FromArgb(&HF3, &HF4, &HF6)) : g.DrawLine(p, 0, HeadH - 1, Width, HeadH - 1) : End Using
        Using p As New Pen(Theme.G200) : g.DrawLine(p, Width - 1, 0, Width - 1, Height) : End Using
        If _contentH > Height Then
            Dim trackH = Height - HeadH - 8
            Dim barH = Math.Max(30, trackH * (Height - HeadH) \ Math.Max(1, _contentH - HeadH))
            Dim barY = HeadH + 4 + (trackH - barH) * _scroll \ Math.Max(1, _contentH - Height)
            Using p = Theme.RoundRect(New RectangleF(Width - 7, barY, 4, barH), 2)
                Using b As New SolidBrush(Theme.G200) : g.FillPath(b, p) : End Using
            End Using
        End If
    End Sub

    Private Function Kit_Img(src As String) As Image
        Return Global.SriAndalStaff.Img.Get(src, 340, Sub() Invalidate())
    End Function

    Private Sub DrawBrand(g As Graphics)
        Dim name = Js.Str(AppState.I.Settings, "businessName", "Sri Andal Traders")
        Dim logo = Js.Str(AppState.I.Settings, "logo")
        Dim x = 24
        Dim pic As Image = If(logo = "", Nothing, Kit_Img(logo))
        If pic IsNot Nothing Then
            Dim s = Math.Min(170.0F / pic.Width, 40.0F / pic.Height)
            Dim iw = CInt(pic.Width * s), ih = CInt(pic.Height * s)
            g.InterpolationMode = Drawing2D.InterpolationMode.HighQualityBicubic
            g.DrawImage(pic, x, (HeadH - ih) \ 2, iw, ih)
        Else
            Tr.DrawText(g, name, _brandFont, New Rectangle(x, 0, W - 24 - 8 - 32 - 24, HeadH), ActiveText, TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
        End If
        ' "Sidebar menus" (show / hide menus) — 32×32, grey sliders icon
        _optionsRect = New Rectangle(W - 24 - 32, (HeadH - 32) \ 2, 32, 32)
        If _optionsOpen OrElse _hoverOptions Then
            Using p = Theme.RoundRect(New RectangleF(_optionsRect.X, _optionsRect.Y, 32, 32), Theme.Radius)
                Using b As New SolidBrush(If(_optionsOpen, ActiveBg, Theme.G100)) : g.FillPath(b, p) : End Using
            End Using
        End If
        Icons.Draw(g, "sliders-horizontal", New RectangleF(_optionsRect.X + 8, _optionsRect.Y + 8, 16, 16), If(_optionsOpen, ActiveText, If(_hoverOptions, HoverText, Theme.G500)))
    End Sub

    Private Function DrawLink(g As Graphics, it As Item, y As Integer, isSub As Boolean, hasSub As Boolean) As Integer
        Dim h = If(isSub, 49, 51)
        Dim right = W - 16 - If(hasSub, 36, 0)
        Dim r As New Rectangle(16, y, right - 16, h)
        Dim chev As Rectangle = Rectangle.Empty
        If hasSub Then chev = New Rectangle(right, y + (h - 36) \ 2, 36, 36)
        Dim active = Not it.ToggleOnly AndAlso IsActive(it)
        Dim hover = it Is _hover
        If y + h > HeadH AndAlso y < Height Then
            If active OrElse hover Then
                Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                    Using b As New SolidBrush(If(active, ActiveBg, Theme.G50)) : g.FillPath(b, p) : End Using
                End Using
            End If
            Dim fg = If(active, ActiveText, If(hover, HoverText, Idle))
            Dim x = r.X + If(isSub, 44, 16)
            Dim ic = "fa-" & it.Icon
            If Icons.Has(ic) Then Icons.Draw(g, ic, New RectangleF(x + 3, r.Y + (h - 18) / 2.0F, 18, 18), fg)
            Tr.DrawText(g, it.Label, If(isSub, If(active, _subActive, _subFont), If(active, _linkActive, _linkFont)), New Rectangle(x + 24 + 14, r.Y, r.Right - x - 38 - 8, h), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            If hasSub Then
                If it Is _hoverChevron Then
                    Using p = Theme.RoundRect(New RectangleF(chev.X, chev.Y, 36, 36), Theme.Radius)
                        Using b As New SolidBrush(Theme.G50) : g.FillPath(b, p) : End Using
                    End Using
                End If
                Icons.Draw(g, If(_open.Contains(it.Id), "chevron-up", "chevron-down"), New RectangleF(chev.X + 12, chev.Y + 12, 12, 12), Theme.G400)
            End If
        End If
        _rects.Add((it, r, chev))
        Return y + h + 4
    End Function

    Protected Overrides Sub OnMouseWheel(e As MouseEventArgs)
        MyBase.OnMouseWheel(e)
        Dim max = Math.Max(0, _contentH - Height)
        _scroll = Math.Max(0, Math.Min(max, _scroll - e.Delta \ 2))
        Invalidate()
    End Sub

    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        MyBase.OnMouseEnter(e)
        Focus()
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim k As Item = Nothing, kc As Item = Nothing
        If e.Y > HeadH Then
            For Each r In _rects
                If r.Rect.Contains(e.Location) Then k = r.It
                If r.Chevron.Contains(e.Location) Then kc = r.It
            Next
        End If
        Dim ho = _optionsRect.Contains(e.Location)
        Cursor = If(k IsNot Nothing OrElse kc IsNot Nothing OrElse ho, Cursors.Hand, Cursors.Default)
        If k IsNot _hover OrElse kc IsNot _hoverChevron OrElse ho <> _hoverOptions Then
            _hover = k : _hoverChevron = kc : _hoverOptions = ho
            Invalidate()
        End If
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = Nothing : _hoverChevron = Nothing : _hoverOptions = False
        Invalidate()
        MyBase.OnMouseLeave(e)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        If _optionsRect.Contains(e.Location) Then
            _optionsOpen = True
            Invalidate()
            SidebarMenuPanel.Open(Me, PointToScreen(New Point(_optionsRect.X - 8, _optionsRect.Bottom + 6)), Sub()
                                                                                                                     _optionsOpen = False
                                                                                                                     Invalidate()
                                                                                                                 End Sub)
            Return
        End If
        If e.Y <= HeadH Then
            If e.X < _optionsRect.X Then RaiseEvent Picked("/admin/dashboard")
            Return
        End If
        For Each r In _rects
            If r.Chevron.Contains(e.Location) OrElse (r.It.ToggleOnly AndAlso r.Rect.Contains(e.Location)) Then
                If Not _open.Remove(r.It.Id) Then _open.Add(r.It.Id)
                Dim a As New JsonArray()
                For Each o In _open : a.Add(o) : Next
                Store.Write("sidebar_open", a)
                Invalidate()
                Return
            End If
            If r.Rect.Contains(e.Location) Then
                RaiseEvent Picked(If(r.It.Logout, "logout", r.It.Href))
                Return
            End If
        Next
    End Sub
End Class

''' <summary>The website's "Sidebar menus" panel: tick which sections, menus and sub-menus the sidebar shows.</summary>
Public Class SidebarMenuPanel
    Inherits Control
    Private ReadOnly _bar As Sidebar
    Private ReadOnly _expanded As New HashSet(Of String)
    Private _rows As New List(Of Row)
    Private _hover As Integer = -1
    Private _showAll As Rectangle
    Public Relayout As Action
    Private ReadOnly _f As Font = Theme.Px(13)
    Private ReadOnly _fb As Font = Theme.Px(13, 600)

    Private Class Row
        Public Key As String, Label As String, Strong As Boolean, Indent As Integer
        Public Y As Integer
        Public ExpandKey As String
        Public Chevron As Rectangle
        Public Last As Boolean
    End Class

    Public Shared Sub Open(bar As Sidebar, at As Point, closed As Action)
        Dim p As New SidebarMenuPanel(bar)
        Dim host As New ToolStripControlHost(p) With {.Margin = Padding.Empty, .Padding = Padding.Empty, .AutoSize = False, .Size = p.Size}
        Dim dd As New ToolStripDropDown With {.Padding = Padding.Empty, .DropShadowEnabled = True, .BackColor = Color.White}
        dd.Items.Add(host)
        p.Relayout = Sub()
                         p.Build()
                         host.Size = p.Size : dd.Size = p.Size
                     End Sub
        AddHandler dd.Closed, Sub()
                                  closed()
                                  dd.BeginInvoke(Sub() dd.Dispose())
                              End Sub
        dd.Show(at)
    End Sub

    Public Sub New(bar As Sidebar)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _bar = bar
        BackColor = Color.White
        Build()
    End Sub

    Friend Sub Build()
        _rows = New List(Of Row)
        Dim y = 49 + 8
        For Each s In _bar.Sections
            Dim sk = Sidebar.SectionKey(s.Title)
            _rows.Add(New Row With {.Key = sk, .Label = s.Title.Substring(0, 1) & s.Title.Substring(1).ToLowerInvariant(), .Strong = True, .Y = y}) : y += 30
            If Not _bar.Hidden.Contains(sk) Then
                For Each l In s.Links
                    Dim lk = Sidebar.LinkKey(s.Title, l.Label)
                    Dim r As New Row With {.Key = lk, .Label = l.Label, .Indent = 24, .Y = y}
                    If l.Children.Count > 0 AndAlso Not _bar.Hidden.Contains(lk) Then r.ExpandKey = lk
                    _rows.Add(r) : y += 30
                    If _expanded.Contains(lk) AndAlso Not _bar.Hidden.Contains(lk) Then
                        For Each c In l.Children
                            _rows.Add(New Row With {.Key = Sidebar.SubKey(s.Title, l.Label, c.Label), .Label = c.Label, .Indent = 48, .Y = y}) : y += 30
                        Next
                    End If
                Next
            End If
            _rows(_rows.Count - 1).Last = True
            y += 12
        Next
        Size = New Size(280, Math.Min(y + 4, Math.Min(560, CInt(Screen.PrimaryScreen.WorkingArea.Height * 0.7))))
        Invalidate()
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        g.Clear(Color.White)
        Using pen As New Pen(Theme.G200) : g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1) : End Using
        Tr.DrawText(g, "Sidebar menus", Theme.Px(13, 700), New Rectangle(16, 0, 160, 49), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        Dim anyHidden = _bar.Hidden.Count > 0
        Dim sw = Tr.MeasureText("Show all", Theme.Px(12, 500)).Width + 14 + 4 + 16
        _showAll = New Rectangle(Width - 16 - sw, 12, sw, 25)
        Icons.Draw(g, "rotate-ccw", New RectangleF(_showAll.X + 8, _showAll.Y + 5.5F, 14, 14), If(anyHidden, Theme.Primary, Theme.G400))
        Tr.DrawText(g, "Show all", Theme.Px(12, 500), New Rectangle(_showAll.X + 26, _showAll.Y, sw, 25), If(anyHidden, Theme.Primary, Theme.G400), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        Using p As New Pen(Theme.G100) : g.DrawLine(p, 0, 48, Width, 48) : End Using
        For k = 0 To _rows.Count - 1
            Dim r = _rows(k)
            Dim x = 16 + r.Indent
            If k = _hover Then
                Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, 8, r.Y, Width - 16, 30) : End Using
            End If
            Gfx.Check(g, New Rectangle(x, r.Y + 7, 16, 16), Not _bar.Hidden.Contains(r.Key))
            Tr.DrawText(g, r.Label, If(r.Strong, _fb, _f), New Rectangle(x + 26, r.Y, Width - x - 26 - 40, 30), If(r.Strong, Theme.G900, Idle), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            If r.ExpandKey IsNot Nothing Then
                r.Chevron = New Rectangle(Width - 16 - 24, r.Y + 3, 24, 24)
                Icons.Draw(g, If(_expanded.Contains(r.ExpandKey), "chevron-up", "chevron-down"), New RectangleF(r.Chevron.X + 5, r.Chevron.Y + 5, 14, 14), Theme.G400)
            End If
            If r.Last AndAlso k < _rows.Count - 1 Then
                Using p As New Pen(Theme.G100) : g.DrawLine(p, 16, r.Y + 30 + 6, Width - 16, r.Y + 30 + 6) : End Using
            End If
        Next
    End Sub

    Private Shared ReadOnly Idle As Color = Color.FromArgb(&H4B, &H55, &H63)

    Private Function RowAt(p As Point) As Integer
        For k = 0 To _rows.Count - 1
            If p.Y >= _rows(k).Y AndAlso p.Y < _rows(k).Y + 30 Then Return k
        Next
        Return -1
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim k = RowAt(e.Location)
        Cursor = If(k >= 0 OrElse _showAll.Contains(e.Location), Cursors.Hand, Cursors.Default)
        If k <> _hover Then _hover = k : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        If _showAll.Contains(e.Location) Then
            _bar.Hidden.Clear()
            _bar.SaveHidden()
            Relayout?.Invoke()
            Return
        End If
        Dim k = RowAt(e.Location)
        If k < 0 Then Return
        Dim r = _rows(k)
        If r.ExpandKey IsNot Nothing AndAlso Rectangle.Inflate(r.Chevron, 4, 4).Contains(e.Location) Then
            If Not _expanded.Remove(r.ExpandKey) Then _expanded.Add(r.ExpandKey)
        ElseIf Not _bar.Hidden.Remove(r.Key) Then
            _bar.Hidden.Add(r.Key)
        End If
        _bar.SaveHidden()
        Relayout?.Invoke()
    End Sub
End Class
