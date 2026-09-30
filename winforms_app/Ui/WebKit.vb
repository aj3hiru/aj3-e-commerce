Imports System.Drawing
Imports System.Windows.Forms

' The website's recurring pieces (Orders2Body.tsx, campaigns2/ui.tsx …), drawn with the same sizes and colours.
' Blue #2563eb is the website's accent inside page bodies (tabs, chips, pager, focus).

Public Module Web
    Public ReadOnly Blue As Color = Color.FromArgb(&H25, &H63, &HEB)
    Public ReadOnly BlueDark As Color = Color.FromArgb(&H1D, &H4E, &HD8)
    Public ReadOnly Blue50 As Color = Color.FromArgb(&HEF, &HF6, &HFF)
    Public ReadOnly Blue200 As Color = Color.FromArgb(&HBF, &HDB, &HFE)
    Public ReadOnly Line As Color = Color.FromArgb(&HEE, &HF0, &HF4)
    Public ReadOnly HeadBg As Color = Color.FromArgb(&HF8, &HF9, &HFB)
    Public ReadOnly RowHover As Color = Color.FromArgb(&HF8, &HF9, &HFE)
    ' status pill palette (StatusDropdown.tsx STATUS_BTN_STYLES)
    Public ReadOnly PillSuccess As Color = Color.FromArgb(&H1C, &HC8, &H8A)
    Public ReadOnly PillSecondary As Color = Color.FromArgb(&H85, &H87, &H96)
    Public ReadOnly PillWarning As Color = Color.FromArgb(&HF6, &HC2, &H3E)
    Public ReadOnly PillDanger As Color = Color.FromArgb(&HEF, &H44, &H44)
    Public ReadOnly PillInfo As Color = Color.FromArgb(&H3B, &H82, &HF6)
    Public ReadOnly PillPrimary As Color = Color.FromArgb(&H4E, &H73, &HDF)

    Public Function OrderStatusColor(status As String) As Color
        Select Case status
            Case "Pending" : Return PillWarning
            Case "In Progress", "Out for Delivery" : Return PillInfo
            Case "Delivered" : Return PillSuccess
            Case "Canceled" : Return PillDanger
            Case Else : Return PillSecondary
        End Select
    End Function

    Public Function PaymentStatusColor(status As String) As Color
        Return If(status = "Paid", PillSuccess, PillSecondary)
    End Function

    ''' <summary>Text on a pill: dark on the amber one, white on the rest.</summary>
    Public Function PillText(bg As Color) As Color
        Return If(bg = PillWarning, Color.FromArgb(&H1F, &H29, &H37), Color.White)
    End Function

    ''' <summary>The status pill (.btn-sm .status-btn): 14px medium, padding 4/8, optional caret. Returns its box.</summary>
    Public Function DrawPill(g As Graphics, text As String, x As Integer, cy As Integer, bg As Color, Optional caret As Boolean = False) As Rectangle
        Dim f = PillFont
        Dim tw = Tr.MeasureText(text, f).Width
        Dim w = 8 + tw + If(caret, 6 + 8, 0) + 8
        Dim r As New Rectangle(x, cy - 15, w, 30)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
            Using b As New SolidBrush(bg) : g.FillPath(b, p) : End Using
        End Using
        Dim fg = PillText(bg)
        Tr.DrawText(g, text, f, New Rectangle(r.X + 8, r.Y, tw + 2, r.Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        If caret Then
            Dim cx = r.X + 8 + tw + 6, ccy = r.Y + r.Height \ 2 + 1
            Using b As New SolidBrush(fg) : g.FillPolygon(b, {New Point(cx, ccy - 2), New Point(cx + 8, ccy - 2), New Point(cx + 4, ccy + 2)}) : End Using
        End If
        Return r
    End Function

    Public ReadOnly PillFont As Font = Theme.Px(14, 500)

    Public Function PillWidth(text As String, Optional caret As Boolean = False) As Integer
        Return 8 + Tr.MeasureText(text, PillFont).Width + If(caret, 14, 0) + 8
    End Function

    ''' <summary>IconAction: the 34px square coloured icon button (view / print grey, edit blue, delete red).</summary>
    Public Sub DrawIconAction(g As Graphics, r As Rectangle, icon As String, bg As Color, Optional hover As Boolean = False, Optional fg As Color = Nothing)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
            Using b As New SolidBrush(If(hover, Color.FromArgb(217, bg), bg)) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, icon, New RectangleF(r.X + (r.Width - 14) / 2.0F, r.Y + (r.Height - 14) / 2.0F, 14, 14), If(fg = Color.Empty, Color.White, fg))
    End Sub

    ''' <summary>A checkbox (accent colour), 16px.</summary>
    Public Sub DrawCheck(g As Graphics, r As Rectangle, on_ As Boolean, Optional accent As Color = Nothing)
        Dim a = If(accent = Color.Empty, Blue, accent)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), 3)
            If on_ Then
                Using b As New SolidBrush(a) : g.FillPath(b, p) : End Using
                Icons.Draw(g, "check", New RectangleF(r.X + 2, r.Y + 2, r.Width - 4, r.Height - 4), Color.White, 3)
            Else
                Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                Using pen As New Pen(Color.FromArgb(&H76, &H76, &H76)) : g.DrawPath(pen, p) : End Using
            End If
        End Using
    End Sub
End Module

''' <summary>The website's white section (rounded-[10px] border gray-200 shadow-sm) holding a stack of parts.</summary>
Public Class WebSection
    Inherits CardBox
    Public Sub New(Optional pad As Integer = 16)
        MyBase.New(Nothing, "", pad)
    End Sub
End Class

''' <summary>Orders-style range bar: "Showing: This Month", the preset chips, from / to dates and Apply.</summary>
Public Class RangeChips
    Inherits Control
    Implements IFlowHeight
    Public Event Changed()
    Public From As Date = New Date(Date.Today.Year, Date.Today.Month, 1)
    Public [To] As Date = Date.Today
    Private ReadOnly _from As New DateTimePicker With {.Format = DateTimePickerFormat.Custom, .CustomFormat = "dd/MM/yyyy", .Width = 130}
    Private ReadOnly _to As New DateTimePicker With {.Format = DateTimePickerFormat.Custom, .CustomFormat = "dd/MM/yyyy", .Width = 130}
    Private ReadOnly _apply As New HeadButton("Apply", "", Web.Blue) With {.Height = 32}
    Private _chips As New List(Of (Key As String, R As Rectangle))
    Private _hover As String = ""
    Private ReadOnly _chipFont As Font = Theme.Px(13, 500)
    Private ReadOnly _f14 As Font = Theme.Px(14)
    Private ReadOnly _f14b As Font = Theme.Px(14, 700)

    Public Shared ReadOnly Presets As String() = {"today|Today", "yesterday|Yesterday", "7days|7 Days", "this_month|This Month", "prev_month|Previous Month"}

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 58
        _from.Font = Theme.Px(13) : _to.Font = Theme.Px(13)
        Controls.AddRange(New Control() {_from, _to, _apply})
        AddHandler _apply.Click, Sub()
                                     If _from.Value.Date > _to.Value.Date Then Return
                                     From = _from.Value.Date : [To] = _to.Value.Date
                                     Changed_()
                                 End Sub
        AddHandler _from.ValueChanged, Sub() UpdateApply()
        AddHandler _to.ValueChanged, Sub() UpdateApply()
        SyncPickers()
    End Sub

    ''' <summary>Width of "Showing: …" and the chips (the dates go on the same line when they fit, as on the website).</summary>
    Private Function ChipsWidth() As Integer
        Dim w = 16 + 24 + Tr.MeasureText("Showing:", _f14).Width + 6 + Tr.MeasureText(Showing, _f14b).Width + 16
        For Each p In Presets : w += Tr.MeasureText(p.Split("|"c)(1), _chipFont).Width + 24 + 6 : Next
        Return w
    End Function
    Private Function DatesWidth() As Integer
        Return 16 + 130 + 8 + 18 + 8 + 130 + 8 + _apply.Width + 16
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return If(ChipsWidth() + DatesWidth() > width, 100, 58)
    End Function

    Private Sub UpdateApply()
        _apply.Enabled = _from.Value.Date <> From OrElse _to.Value.Date <> [To]
    End Sub

    Private Sub SyncPickers()
        _from.Value = From : _to.Value = [To]
        UpdateApply()
    End Sub

    Private Sub Changed_()
        SyncPickers()
        Invalidate()
        RaiseEvent Changed()
    End Sub

    Public Shared Function RangeOf(key As String) As (Date, Date)
        Dim t = Date.Today
        Dim first As New Date(t.Year, t.Month, 1)
        Select Case key
            Case "today" : Return (t, t)
            Case "yesterday" : Return (t.AddDays(-1), t.AddDays(-1))
            Case "7days" : Return (t.AddDays(-6), t)
            Case "this_month" : Return (first, t)
            Case "prev_month" : Return (first.AddMonths(-1), first.AddDays(-1))
        End Select
        Return (t, t)
    End Function

    Public ReadOnly Property ActiveKey As String
        Get
            For Each p In Presets
                Dim k = p.Split("|"c)(0)
                Dim r = RangeOf(k)
                If r.Item1 = From AndAlso r.Item2 = [To] Then Return k
            Next
            Return ""
        End Get
    End Property

    Public Shared Function LongDate(d As Date) As String
        Return d.ToString("dd MMM yyyy", Globalization.CultureInfo.GetCultureInfo("en-GB"))
    End Function

    Public ReadOnly Property Showing As String
        Get
            Dim k = ActiveKey
            If k <> "" Then Return Presets.First(Function(p) p.StartsWith(k & "|")).Split("|"c)(1)
            If From = [To] Then Return LongDate(From)
            Return LongDate(From) & " – " & LongDate([To])
        End Get
    End Property

    Public Sub SetRange(a As Date, b As Date, Optional raise As Boolean = True)
        From = a.Date : [To] = b.Date
        SyncPickers()
        Invalidate()
        If raise Then RaiseEvent Changed()
    End Sub

    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        MyBase.OnLayout(levent)
        Dim y = If(Height > 70, 58, 13)
        Dim x = Width - 16 - _apply.Width
        _apply.SetBounds(x, y, _apply.Width, 32)
        x -= 8 + 130 : _to.SetBounds(x, y + 2, 130, 28)
        x -= 8 + 18 + 8 + 130 : _from.SetBounds(x, y + 2, 130, 28)
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Dim x = 16, cy = 29
        Icons.Draw(g, "calendar-days", New RectangleF(x, cy - 8, 16, 16), Theme.G500)
        x += 24
        Tr.DrawText(g, "Showing:", _f14, New Point(x, cy - 10), Theme.G700, TextFormatFlags.NoPadding)
        x += Tr.MeasureText("Showing:", _f14).Width + 6
        Dim sh = Showing
        Tr.DrawText(g, sh, _f14b, New Point(x, cy - 10), Theme.G900, TextFormatFlags.NoPadding)
        x += Tr.MeasureText(sh, _f14b).Width + 16
        _chips = New List(Of (String, Rectangle))
        Dim act = ActiveKey
        For Each p In Presets
            Dim kl = p.Split("|"c)
            Dim w = Tr.MeasureText(kl(1), _chipFont).Width + 24
            Dim r As New Rectangle(x, cy - 16, w, 32)
            Dim on_ = kl(0) = act
            Using path = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                Using b As New SolidBrush(If(on_, Web.Blue, If(_hover = kl(0), Theme.G200, Theme.G100))) : g.FillPath(b, path) : End Using
            End Using
            Tr.DrawText(g, kl(1), _chipFont, r, If(on_, Color.White, Theme.G700), TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            _chips.Add((kl(0), r))
            x += w + 6
        Next
        ' "to" between the dates
        Tr.DrawText(g, "to", _f14, New Rectangle(_from.Right, _from.Top, _to.Left - _from.Right, _from.Height), Theme.G500, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim h = _chips.FirstOrDefault(Function(c) c.R.Contains(e.Location)).Key
        If h Is Nothing Then h = ""
        Cursor = If(h = "", Cursors.Default, Cursors.Hand)
        If h <> _hover Then _hover = h : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each c In _chips
            If c.R.Contains(e.Location) Then
                Dim r = RangeOf(c.Key)
                SetRange(r.Item1, r.Item2)
                Return
            End If
        Next
    End Sub
End Class

''' <summary>Status tabs with a coloured dot and a count badge; the active one blue and underlined.</summary>
Public Class UnderTabs
    Inherits Control
    Public Event Changed()
    Public Items As New List(Of (Key As String, Label As String, Dot As Color))
    Public Counts As New Dictionary(Of String, Integer)
    Public Current As String = ""
    Private _rects As New List(Of (Key As String, R As Rectangle))
    Private _hover As String = ""
    Private ReadOnly _f As Font = Theme.Px(14, 500)
    Private ReadOnly _cf As Font = Theme.Px(12, 600)

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 44
    End Sub

    Public Sub Add(key As String, label As String, Optional dot As Color = Nothing)
        Items.Add((key, label, dot))
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        _rects = New List(Of (String, Rectangle))
        Dim x = 12
        For Each it In Items
            Dim on_ = it.Key = Current
            Dim n = 0
            Counts.TryGetValue(it.Key, n)
            Dim ct = n.ToString("#,##0")
            Dim lw = Tr.MeasureText(it.Label, _f).Width
            Dim cw = Tr.MeasureText(ct, _cf).Width + 12
            Dim w = 12 + If(it.Dot <> Color.Empty, 8 + 8, 0) + lw + 8 + cw + 12
            Dim r As New Rectangle(x, 0, w, Height)
            Dim fg = If(on_, Web.Blue, If(_hover = it.Key, Theme.G900, Theme.G600))
            Dim tx = x + 12
            If it.Dot <> Color.Empty Then
                Using b As New SolidBrush(it.Dot) : g.FillEllipse(b, tx, Height \ 2 - 4, 8, 8) : End Using
                tx += 16
            End If
            Tr.DrawText(g, it.Label, _f, New Rectangle(tx, 0, lw + 2, Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            tx += lw + 8
            Dim br As New Rectangle(tx, Height \ 2 - 10, cw, 20)
            Using p = Theme.RoundRect(New RectangleF(br.X, br.Y, br.Width, br.Height), Theme.Radius)
                Using b As New SolidBrush(If(on_, Web.Blue50, Theme.G100)) : g.FillPath(b, p) : End Using
            End Using
            Tr.DrawText(g, ct, _cf, br, If(on_, Web.Blue, Theme.G600), TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            If on_ Then
                Using b As New SolidBrush(Web.Blue) : g.FillRectangle(b, r.X, Height - 2, r.Width, 2) : End Using
            End If
            _rects.Add((it.Key, r))
            x += w + 4
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim h = _rects.FirstOrDefault(Function(c) c.R.Contains(e.Location)).Key
        If h Is Nothing Then h = ""
        Cursor = If(h = "", Cursors.Default, Cursors.Hand)
        If h <> _hover Then _hover = h : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = "" : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each c In _rects
            If c.R.Contains(e.Location) AndAlso c.Key <> Current Then
                Current = c.Key
                Invalidate()
                RaiseEvent Changed()
                Return
            End If
        Next
    End Sub
End Class

''' <summary>Compact summary card: tinted icon tile, big value + label on one line, grey note below.</summary>
Public Class MetricCard
    Inherits Control
    Public Property Icon As String
    Public Property Tint As Color
    Public Property Ink As Color
    Public Property Value As String = ""
    Public Property Label As String = ""
    Public Property Note As String = ""
    Private ReadOnly _vf As Font = Theme.Px(18, 700)
    Private ReadOnly _lf As Font = Theme.Px(13)
    Private ReadOnly _nf As Font = Theme.Px(12)

    Public Sub New(icon As String, tint As Color, ink As Color)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Me.Icon = icon : Me.Tint = tint : Me.Ink = ink
        Height = 64
    End Sub

    Public Sub SetValue(value As String, label As String, note As String)
        Me.Value = value : Me.Label = label : Me.Note = note
        Invalidate()
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Dim t As New Rectangle(14, (Height - 36) \ 2, 36, 36)
        Using p = Theme.RoundRect(New RectangleF(t.X, t.Y, 36, 36), Theme.Radius)
            Using b As New SolidBrush(Tint) : g.FillPath(b, p) : End Using
        End Using
        Icons.Draw(g, Icon, New RectangleF(t.X + 9, t.Y + 9, 18, 18), Ink)
        Dim x = t.Right + 12
        Dim room = Width - x - 10
        Dim vw = Math.Min(room, Tr.MeasureText(Value, _vf).Width)
        Dim top = Height \ 2 - 20
        Tr.DrawText(g, Value, _vf, New Rectangle(x, top, vw + 2, 26), Theme.G900, TextFormatFlags.Bottom Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        If room - vw > 20 Then Tr.DrawText(g, Label, _lf, New Rectangle(x + vw + 6, top, room - vw - 6, 24), Theme.G600, TextFormatFlags.Bottom Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, Note, _nf, New Rectangle(x, top + 27, room, 18), Theme.G400, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class

''' <summary>The website's filter dropdown: icon, chosen option, chevron; blue when a filter is on.</summary>
Public Class IconSelect
    Inherits Control
    Public Event Changed()
    Public Property Icon As String
    Public Options As New List(Of (Value As String, Label As String))
    Private _value As String = ""
    Private _hover As Boolean
    Public DefaultValue As String = "all"
    Private ReadOnly _f As Font = Theme.Px(14, 500)

    Public Sub New(icon As String, ParamArray opts As String())
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Cursor = Cursors.Hand
        Me.Icon = icon
        Height = 36
        SetOptions(opts)
    End Sub

    Public Sub SetOptions(opts As IEnumerable(Of String))
        Options = opts.Select(Function(o)
                                     Dim p = o.Split("|"c)
                                     Return (p(0), If(p.Length > 1, p(1), p(0)))
                                 End Function).ToList()
        If Options.Count > 0 AndAlso Not Options.Any(Function(o) o.Value = _value) Then _value = Options(0).Value
        Width = PreferredWidth()
        Invalidate()
    End Sub

    Public Property Value As String
        Get
            Return _value
        End Get
        Set(v As String)
            If v = _value Then Return
            _value = v
            Width = PreferredWidth()
            Invalidate()
        End Set
    End Property

    Public ReadOnly Property IsOn As Boolean
        Get
            Return _value <> DefaultValue
        End Get
    End Property

    Private ReadOnly Property Shown As String
        Get
            Return Options.FirstOrDefault(Function(o) o.Value = _value).Label
        End Get
    End Property

    Public Function PreferredWidth() As Integer
        Return 10 + 14 + 6 + Math.Min(160, Tr.MeasureText(If(Shown, ""), _f).Width) + 28
    End Function

    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Dim on_ = IsOn
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(If(on_, Web.Blue50, Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(on_, Color.FromArgb(102, Web.Blue), If(_hover, Theme.G300, Theme.G200))) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, Icon, New RectangleF(10, (Height - 14) / 2.0F, 14, 14), If(on_, Web.Blue, Theme.G400))
        Tr.DrawText(g, If(Shown, ""), _f, New Rectangle(30, 0, Width - 30 - 26, Height), If(on_, Web.BlueDark, Theme.G700), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Icons.Draw(g, "chevron-down", New RectangleF(Width - 22, (Height - 14) / 2.0F, 14, 14), Theme.G400)
    End Sub

    Protected Overrides Sub OnClick(e As EventArgs)
        MyBase.OnClick(e)
        WebMenu.Show(Me, Options.Select(Function(o) If(o.Value = _value, "*", "") & o.Value & "|" & o.Label), Sub(k)
                                                                                                                  If k = _value Then Return
                                                                                                                  Value = k
                                                                                                                  RaiseEvent Changed()
                                                                                                              End Sub)
    End Sub
End Class

''' <summary>The website's search box: 36px, grey hairline border, magnifier, blue focus ring.</summary>
Public Class SearchField
    Inherits UserControl
    Public ReadOnly Box As New TextBox With {.BorderStyle = BorderStyle.None}
    Public Event Changed()
    Private ReadOnly _debounce As New Timer With {.Interval = 180}

    Public Sub New(placeholder As String, Optional width As Integer = 320)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Box.Font = Theme.Px(14)
        Box.PlaceholderText = placeholder
        Height = 36 : Me.Width = width
        Controls.Add(Box)
        AddHandler Box.GotFocus, Sub() Invalidate()
        AddHandler Box.LostFocus, Sub() Invalidate()
        AddHandler Box.TextChanged, Sub()
                                        _debounce.Stop() : _debounce.Start()
                                    End Sub
        AddHandler _debounce.Tick, Sub()
                                       _debounce.Stop()
                                       RaiseEvent Changed()
                                   End Sub
    End Sub

    Public Overrides Property Text As String
        Get
            Return Box.Text
        End Get
        Set(v As String)
            Box.Text = v
        End Set
    End Property

    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        Box.SetBounds(32, (Height - Box.PreferredHeight) \ 2, Width - 32 - 10, Box.PreferredHeight)
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Dim focus = Box.Focused
        If focus Then
            Using p = Theme.RoundRect(New RectangleF(0, 0, Width - 1, Height - 1), Theme.Radius + 2)
                Using b As New SolidBrush(Color.FromArgb(26, Web.Blue)) : g.FillPath(b, p) : End Using
            End Using
        End If
        Using p = Theme.RoundRect(New RectangleF(If(focus, 2.5F, 0.5F), If(focus, 2.5F, 0.5F), Width - If(focus, 5.5F, 1.5F), Height - If(focus, 5.5F, 1.5F)), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(focus, Web.Blue, Theme.G200)) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, "search", New RectangleF(10, (Height - 16) / 2.0F, 16, 16), Theme.G400)
    End Sub

    Protected Overrides Sub OnClick(e As EventArgs)
        Box.Focus()
        MyBase.OnClick(e)
    End Sub
End Class

''' <summary>DataTables-style pager: ‹ Previous · 1 … 4 5 6 … 9 · Next ›</summary>
Public Class Pager
    Inherits Control
    Public Event PageChanged()
    Private _page As Integer = 1
    Private _count As Integer = 1
    Private _rects As New List(Of (Page As Integer, R As Rectangle))
    Private _hover As Integer = 0
    Private ReadOnly _f As Font = Theme.Px(14)

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Height = 40
    End Sub

    Public Property Page As Integer
        Get
            Return _page
        End Get
        Set(v As Integer)
            _page = Math.Max(1, Math.Min(_count, v))
            Width = PreferredWidth()
            Invalidate()
        End Set
    End Property

    Public Property PageCount As Integer
        Get
            Return _count
        End Get
        Set(v As Integer)
            _count = Math.Max(1, v)
            If _page > _count Then _page = _count
            Width = PreferredWidth()
            Invalidate()
        End Set
    End Property

    Private Function Items() As List(Of (Label As String, Page As Integer, Kind As String))
        Dim res As New List(Of (String, Integer, String)) From {("Previous", _page - 1, "prev")}
        Dim lastWasGap = False
        For k = 1 To _count
            If k = 1 OrElse k = _count OrElse Math.Abs(k - _page) <= 1 Then
                res.Add((k.ToString(), k, "num")) : lastWasGap = False
            ElseIf Not lastWasGap Then
                res.Add(("…", 0, "gap")) : lastWasGap = True
            End If
        Next
        res.Add(("Next", _page + 1, "next"))
        Return res
    End Function

    Private Function ItemWidth(label As String, kind As String) As Integer
        Return Math.Max(40, Tr.MeasureText(label, _f).Width + 24 + If(kind = "prev" OrElse kind = "next", 20, 0))
    End Function

    Public Function PreferredWidth() As Integer
        Return Items().Sum(Function(i) ItemWidth(i.Label, i.Kind) - 1) + 1
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        _rects = New List(Of (Integer, Rectangle))
        Dim border = Color.FromArgb(&HDE, &HE2, &HE6)
        Dim all = Items()
        Dim total As New Rectangle(0, 0, Width - 1, Height - 1)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
        End Using
        Dim x = 0
        For Each it In all
            Dim w = ItemWidth(it.Label, it.Kind)
            Dim r As New Rectangle(x, 0, w, Height - 1)
            Dim disabled = (it.Kind = "prev" AndAlso _page = 1) OrElse (it.Kind = "next" AndAlso _page = _count)
            Dim cur = it.Kind = "num" AndAlso it.Page = _page
            If cur Then
                Using b As New SolidBrush(Web.Blue) : g.FillRectangle(b, r) : End Using
            ElseIf _hover = it.Page AndAlso it.Kind <> "gap" AndAlso Not disabled Then
                Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, r) : End Using
            End If
            Dim fg = If(cur, Color.White, If(it.Kind = "num", Web.Blue, If(disabled OrElse it.Kind = "gap", Theme.G300, Theme.G700)))
            If it.Kind = "prev" Then
                Icons.Draw(g, "chevron-left", New RectangleF(r.X + 10, (Height - 16) / 2.0F, 16, 16), fg)
                Tr.DrawText(g, it.Label, _f, New Rectangle(r.X + 28, 0, w - 28, Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            ElseIf it.Kind = "next" Then
                Tr.DrawText(g, it.Label, _f, New Rectangle(r.X + 12, 0, w, Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                Icons.Draw(g, "chevron-right", New RectangleF(r.Right - 26, (Height - 16) / 2.0F, 16, 16), fg)
            Else
                Tr.DrawText(g, it.Label, _f, r, fg, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            End If
            Using pen As New Pen(If(cur, Web.Blue, border)) : g.DrawRectangle(pen, r) : End Using
            If Not disabled AndAlso it.Kind <> "gap" Then _rects.Add((it.Page, r))
            x += w - 1
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim h = _rects.FirstOrDefault(Function(c) c.R.Contains(e.Location)).Page
        Cursor = If(h = 0, Cursors.Default, Cursors.Hand)
        If h <> _hover Then _hover = h : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = 0 : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each c In _rects
            If c.R.Contains(e.Location) AndAlso c.Page <> _page Then
                Page = c.Page
                RaiseEvent PageChanged()
                Return
            End If
        Next
    End Sub
End Class

''' <summary>A toolbar: controls from the left (wrapping, 8px apart) and one control on the right (ml-auto).</summary>
Public Class ToolRow
    Inherits Panel
    Implements IFlowHeight
    Public ReadOnly Left As New List(Of Control)
    Private _right As Control
    Public Sub New()
        BackColor = Color.White
    End Sub
    Public Property Right As Control
        Get
            Return _right
        End Get
        Set(v As Control)
            _right = v
            If v IsNot Nothing AndAlso Not Controls.Contains(v) Then Controls.Add(v)
        End Set
    End Property
    Private Sub Ensure()
        For Each c In Left
            If Not Controls.Contains(c) Then Controls.Add(c)
        Next
    End Sub
    Private Function Place(width As Integer, apply As Boolean) As Integer
        Ensure()
        Dim x = 0, y = 0, lineH = 36
        Dim rightW = If(_right IsNot Nothing AndAlso Kit.WantsVisible(_right), _right.Width + 8, 0)
        For Each c In Left
            If Not Kit.WantsVisible(c) Then Continue For
            If x > 0 AndAlso x + c.Width > width - If(y = 0, rightW, 0) Then x = 0 : y += lineH + 8
            If apply Then c.SetBounds(x, y, c.Width, 36)
            x += c.Width + 8
        Next
        If rightW > 0 Then
            If x + rightW > width AndAlso x > 0 Then y += lineH + 8
            If apply Then _right.SetBounds(width - _right.Width, If(x + rightW > width, y, 0), _right.Width, 36)
        End If
        Return y + lineH
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return If(Left.Any(Function(c) Kit.WantsVisible(c)) OrElse (_right IsNot Nothing AndAlso Kit.WantsVisible(_right)), Place(width, False), 0)
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Place(Width, True)
    End Sub
End Class

''' <summary>The blue bar shown when orders are ticked: "n selected", Accept new ones, agent + Assign &amp; send out, Clear.</summary>
Public Class BulkBar
    Inherits Control
    Public Event Accept()
    Public Event Assign(agentId As Integer)
    Public Event ClearPicked()
    Public Count As Integer
    Public CanDecide As Boolean
    Public Agents As New List(Of System.Text.Json.Nodes.JsonObject)
    Private _agent As Integer
    Private _spots As New List(Of (Key As String, R As Rectangle))
    Private ReadOnly _fb As Font = Theme.Px(14, 700)
    Private ReadOnly _f As Font = Theme.Px(14, 600)
    Private ReadOnly _f13 As Font = Theme.Px(13, 500)

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 58
        Cursor = Cursors.Default
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        _spots = New List(Of (String, Rectangle))
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Web.Blue50) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Web.Blue200) : g.DrawPath(pen, p) : End Using
        End Using
        Dim x = 12, cy = Height \ 2
        Dim t = Count & " selected"
        Tr.DrawText(g, t, _fb, New Point(x, cy - 10), Color.FromArgb(&H1E, &H40, &HAF), TextFormatFlags.NoPadding)
        x += Tr.MeasureText(t, _fb).Width + 10
        If CanDecide Then
            Dim w = 12 + 16 + 6 + Tr.MeasureText("Accept new ones", _f).Width + 12
            Dim r As New Rectangle(x, cy - 18, w, 36)
            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                Using b As New SolidBrush(Color.FromArgb(5, &H96, &H69)) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, "circle-check", New RectangleF(r.X + 12, r.Y + 10, 16, 16), Color.White)
            Tr.DrawText(g, "Accept new ones", _f, New Rectangle(r.X + 34, r.Y, w - 34, 36), Color.White, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            _spots.Add(("accept", r))
            x += w + 8
        End If
        If Agents.Count > 0 Then
            Dim name = If(_agent = 0, "Choose agent…", Agents.Where(Function(a) Js.Int(a, "id") = _agent).Select(Function(a) Js.Str(a, "name")).FirstOrDefault())
            Dim sw = Math.Max(150, Tr.MeasureText(name, Theme.Px(14)).Width + 40)
            Dim s As New Rectangle(x, cy - 18, sw, 36)
            Using p = Theme.RoundRect(New RectangleF(s.X + 0.5F, s.Y + 0.5F, s.Width - 1, s.Height - 1), Theme.Radius)
                Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                Using pen As New Pen(Web.Blue200) : g.DrawPath(pen, p) : End Using
            End Using
            Tr.DrawText(g, name, Theme.Px(14), New Rectangle(s.X + 10, s.Y, sw - 34, 36), Theme.G800, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            Icons.Draw(g, "chevron-down", New RectangleF(s.Right - 24, s.Y + 11, 14, 14), Theme.G500)
            _spots.Add(("pick", s))
            x += sw + 6
            Dim w = 12 + 16 + 6 + Tr.MeasureText("Assign & send out", _f).Width + 12
            Dim r As New Rectangle(x, cy - 18, w, 36)
            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                Using b As New SolidBrush(If(_agent = 0, Color.FromArgb(128, Web.Blue), Web.Blue)) : g.FillPath(b, p) : End Using
            End Using
            Icons.Draw(g, "truck", New RectangleF(r.X + 12, r.Y + 10, 16, 16), Color.White)
            Tr.DrawText(g, "Assign & send out", _f, New Rectangle(r.X + 34, r.Y, w - 34, 36), Color.White, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            If _agent <> 0 Then _spots.Add(("assign", r))
        End If
        Dim cw = Tr.MeasureText("Clear", _f13).Width
        Dim c As New Rectangle(Width - 12 - cw, cy - 10, cw, 20)
        Tr.DrawText(g, "Clear", _f13, c, Color.FromArgb(&H1D, &H4E, &HD8), TextFormatFlags.NoPadding)
        _spots.Add(("clear", c))
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Cursor = If(_spots.Any(Function(s) s.R.Contains(e.Location)), Cursors.Hand, Cursors.Default)
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        Dim hit = _spots.FirstOrDefault(Function(s) s.R.Contains(e.Location))
        Select Case hit.Key
            Case "accept" : RaiseEvent Accept()
            Case "clear" : _agent = 0 : RaiseEvent ClearPicked()
            Case "assign" : RaiseEvent Assign(_agent)
            Case "pick"
                WebMenu.Show(Me, {"0|Choose agent…"}.Concat(Agents.Select(Function(a) If(Js.Int(a, "id") = _agent, "*", "") & Js.Int(a, "id") & "|" & Js.Str(a, "name"))), Sub(k)
                                                                                                                                                                              _agent = CInt(k)
                                                                                                                                                                              Invalidate()
                                                                                                                                                                          End Sub, PointToScreen(New Point(hit.R.X, hit.R.Bottom + 2)))
        End Select
    End Sub
End Class

''' <summary>Under a table: "1–10 of 42 orders (filtered from 50) · Value ₹…" on the left, the pages on the right.</summary>
Public Class FooterRow
    Inherits Control
    Implements IFlowHeight
    Public ReadOnly Pager As New Pager()
    Public Summary As String = ""
    Public Value As String = ""
    Public ShowSummary As Boolean = True
    Private ReadOnly _f As Font = Theme.Px(13)
    Private ReadOnly _fb As Font = Theme.Px(13, 700)
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 40
        Controls.Add(Pager)
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return If(ShowSummary OrElse Pager.Visible, 40, 0)
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Pager.SetBounds(Width - Pager.Width, 0, Pager.Width, 40)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        If Not ShowSummary Then Return
        Dim x = 0
        Tr.DrawText(g, Summary, _f, New Point(x, 11), Theme.G600, TextFormatFlags.NoPadding)
        x += Tr.MeasureText(Summary, _f).Width
        If Value <> "" Then
            Dim t = "  · Value "
            Tr.DrawText(g, t, _f, New Point(x, 11), Theme.G600, TextFormatFlags.NoPadding)
            x += Tr.MeasureText(t, _f).Width
            Tr.DrawText(g, Value, _fb, New Point(x, 11), Theme.G900, TextFormatFlags.NoPadding)
        End If
    End Sub
End Class

''' <summary>The website's segmented page tabs: a white bar, each tab an icon + label; the active one purple.</summary>
Public Class PillTabs
    Inherits Control
    Public Event Changed()
    Public Items As New List(Of (Key As String, Label As String, Icon As String))
    Public Current As String = ""
    Private _rects As New List(Of (Key As String, R As Rectangle))
    Private _hover As String = ""
    Private ReadOnly _f As Font = Theme.Px(14, 600)

    Public Sub New(ParamArray items As String())
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        For Each it In items
            Dim p = it.Split("|"c)
            Me.Items.Add((p(0), p(1), If(p.Length > 2, p(2), "")))
        Next
        If Me.Items.Count > 0 Then Current = Me.Items(0).Key
        Height = 46
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Dim total = 4 + Items.Sum(Function(i) 16 + If(i.Icon <> "", 24, 0) + Tr.MeasureText(i.Label, _f).Width + 16 + 4)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        _rects = New List(Of (String, Rectangle))
        Dim x = 5
        For Each it In Items
            Dim w = 16 + If(it.Icon <> "", 24, 0) + Tr.MeasureText(it.Label, _f).Width + 16
            Dim r As New Rectangle(x, 5, w, Height - 10)
            Dim on_ = it.Key = Current
            If on_ OrElse it.Key = _hover Then
                Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                    Using b As New SolidBrush(If(on_, Theme.Primary, Theme.G50)) : g.FillPath(b, p) : End Using
                End Using
            End If
            Dim fg = If(on_, Color.White, Theme.G600)
            Dim tx = r.X + 16
            If it.Icon <> "" Then
                Icons.Draw(g, it.Icon, New RectangleF(tx, r.Y + (r.Height - 16) / 2.0F, 16, 16), fg)
                tx += 24
            End If
            Tr.DrawText(g, it.Label, _f, New Rectangle(tx, r.Y, w, r.Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            _rects.Add((it.Key, r))
            x += w + 4
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim h = _rects.FirstOrDefault(Function(c) c.R.Contains(e.Location)).Key
        If h Is Nothing Then h = ""
        Cursor = If(h = "", Cursors.Default, Cursors.Hand)
        If h <> _hover Then _hover = h : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = "" : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each c In _rects
            If c.R.Contains(e.Location) AndAlso c.Key <> Current Then
                Current = c.Key
                Invalidate()
                RaiseEvent Changed()
                Return
            End If
        Next
    End Sub
End Class
