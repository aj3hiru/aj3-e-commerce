Imports System.ComponentModel
Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>White rounded card with a hairline border (the website's .card). Children sit inside Padding.</summary>
Public Class Card
    Inherits Panel
    Public Sub New()
        ' No layout while the card is being made: subclasses (CardBox, ListCard, FilterCard) lay out their own
        ' parts, which don't exist yet at this point (this was the "Object reference not set" error).
        SuspendLayout()
        DoubleBuffered = True
        ResizeRedraw = True
        BackColor = Color.White
        Padding = New Padding(18)
        ResumeLayout(False)
    End Sub
    Protected Overrides Sub OnPaintBackground(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(If(Parent?.BackColor, Theme.Page))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), 10)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
    End Sub
End Class

''' <summary>Owner-drawn button: filled (primary / colour) or outline. Instant states, no animation.</summary>
Public Class WButton
    Inherits Control
    Public Property Glyph As String = ""
    Public Property Fill As Color = Theme.Primary
    Public Property Outline As Boolean
    ''' <summary>Icon colour on outline buttons (default: the text colour).</summary>
    Public Property GlyphColor As Color = Color.Empty
    Private _hover As Boolean, _down As Boolean
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        Cursor = Cursors.Hand
        Height = 38
        Font = Theme.BodyBold
        BackColor = Color.Transparent
    End Sub
    Public Shared Function Make(text As String, glyph As String, fill As Color, Optional outline As Boolean = False) As WButton
        Dim b As New WButton With {.Text = text, .Glyph = glyph, .Fill = fill, .Outline = outline}
        b.Width = b.PreferredWidth()
        Return b
    End Function
    Public Function PreferredWidth() As Integer
        Dim w = Tr.MeasureText(Text, Font).Width + 28
        If Glyph <> "" Then w += 22
        Return w
    End Function
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True
        Invalidate()
        MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False
        _down = False
        Invalidate()
        MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnMouseDown(e As MouseEventArgs)
        _down = True
        Invalidate()
        MyBase.OnMouseDown(e)
    End Sub
    Protected Overrides Sub OnMouseUp(e As MouseEventArgs)
        _down = False
        Invalidate()
        MyBase.OnMouseUp(e)
    End Sub
    Protected Overrides Sub OnEnabledChanged(e As EventArgs)
        Invalidate()
        MyBase.OnEnabledChanged(e)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        Dim r As New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F)
        Dim fg As Color
        Using p = Theme.RoundRect(r, 7)
            If Outline Then
                Using b As New SolidBrush(If(_hover, Theme.G50, Color.White)) : g.FillPath(b, p) : End Using
                Using pen As New Pen(Theme.G300) : g.DrawPath(pen, p) : End Using
                fg = If(Enabled, Theme.G700, Theme.G400)
            Else
                Dim c = If(Not Enabled, Theme.Tint(Fill, 110), If(_down, Theme.Darker(Fill, 0.82), If(_hover, Theme.Darker(Fill, 0.9), Fill)))
                Using b As New SolidBrush(c) : g.FillPath(b, p) : End Using
                fg = Color.White
            End If
        End Using
        Dim tw = Tr.MeasureText(Text, Font).Width
        Dim total = tw + If(Glyph <> "", 22, 0)
        Dim x = (Width - total) \ 2
        If Glyph <> "" Then
            Using f = Theme.IconFont(10)
                Tr.DrawText(g, Glyph, f, New Rectangle(x, 0, 18, Height), If(Outline AndAlso GlyphColor <> Color.Empty AndAlso Enabled, GlyphColor, fg), TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
            End Using
            x += 22
        End If
        Tr.DrawText(g, Text, Font, New Rectangle(x, 0, tw + 2, Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.Left Or TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>Text box with the website's rounded border (purple when focused).</summary>
Public Class WInput
    Inherits UserControl
    Public ReadOnly Box As New TextBox With {.BorderStyle = BorderStyle.None, .Font = Theme.Body}
    Public Property Glyph As String = ""
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 38
        Controls.Add(Box)
        AddHandler Box.GotFocus, Sub() Invalidate()
        AddHandler Box.LostFocus, Sub() Invalidate()
        AddHandler Box.TextChanged, Sub() OnTextChanged(EventArgs.Empty)
    End Sub
    Public Shared Function Make(Optional placeholder As String = "", Optional glyph As String = "", Optional multiline As Boolean = False) As WInput
        Dim w As New WInput With {.Glyph = glyph}
        w.Box.PlaceholderText = placeholder
        If multiline Then w.Box.Multiline = True : w.Box.ScrollBars = ScrollBars.Vertical : w.Height = 90
        Return w
    End Function
    <Browsable(False), DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)>
    Public Overrides Property Text As String
        Get
            Return Box.Text
        End Get
        Set(value As String)
            Box.Text = value
        End Set
    End Property
    Protected Overrides Sub OnLayout(e As LayoutEventArgs)
        MyBase.OnLayout(e)
        Dim left = If(Glyph <> "", 34, 11)
        If Box.Multiline Then
            Box.SetBounds(left, 8, Width - left - 8, Height - 14)
        Else
            Box.SetBounds(left, (Height - Box.PreferredHeight) \ 2, Width - left - 10, Box.PreferredHeight)
        End If
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(If(Parent?.BackColor, Color.White))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), 6)
            Using b As New SolidBrush(If(Enabled, Color.White, Theme.G50)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(Box.Focused, Theme.Primary, Theme.G300), If(Box.Focused, 1.5F, 1.0F)) : g.DrawPath(pen, p) : End Using
        End Using
        If Glyph <> "" Then
            Using f = Theme.IconFont(10)
                Tr.DrawText(g, Glyph, f, New Rectangle(8, 0, 22, If(Box.Multiline, 38, Height)), Theme.G400, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter)
            End Using
        End If
    End Sub
    Protected Overrides Sub OnClick(e As EventArgs)
        Box.Focus()
        MyBase.OnClick(e)
    End Sub
End Class

''' <summary>Label above a field (the website's form labels).</summary>
Public Class FieldLabel
    Inherits Label
    Public Sub New(text As String, Optional required As Boolean = False)
        Me.Text = text & If(required, " *", "")
        Font = Theme.UiFont(9.0F, FontStyle.Bold)
        ForeColor = Theme.G700
        AutoSize = True
        BackColor = Color.Transparent
    End Sub
End Class

''' <summary>The website dashboard's number card: coloured icon square, label, big value, change vs. previous period.</summary>
Public Class StatCard
    Inherits Control
    Public Property Glyph As String = Theme.IcCart
    Public Property Accent As Color = Theme.Green
    Public Property Caption As String = ""
    Public Property Value As String = "0"
    Public Property Trend As Double? = 0
    Public Property ShowTrend As Boolean = True
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Height = 100
        Cursor = Cursors.Hand
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(If(Parent?.BackColor, Theme.Page))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), 10)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            ' soft decorative circle in the corner (as on the website)
            Dim clip = g.Clip
            g.SetClip(p)
            Using b As New SolidBrush(Theme.Tint(Accent, 20)) : g.FillEllipse(b, Width - 60, -30, 90, 90) : End Using
            g.Clip = clip
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Using p = Theme.RoundRect(New RectangleF(16, 22, 40, 40), 8)
            Using b As New SolidBrush(Accent) : g.FillPath(b, p) : End Using
        End Using
        Using f = Theme.IconFont(13)
            Theme.DrawCentered(g, Glyph, f, Color.White, New Rectangle(16, 22, 40, 40))
        End Using
        Tr.DrawText(g, Caption, Theme.UiFont(9.0F), New Rectangle(68, 16, Width - 76, 18), Theme.G600, TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
        Tr.DrawText(g, Value, Theme.UiFont(15.0F, FontStyle.Bold), New Point(66, 36), Theme.G900, TextFormatFlags.NoPadding)
        If ShowTrend Then
            Dim txt = If(Trend.HasValue, If(Trend.Value >= 0, ChrW(&H2191) & " ", ChrW(&H2193) & " ") & Math.Abs(Math.Round(Trend.Value)).ToString() & "%", ChrW(&H2191) & " New")
            If Trend.HasValue AndAlso Trend.Value = 0 Then txt = "0%"
            Dim up = Not Trend.HasValue OrElse Trend.Value >= 0
            Dim c = If(up, Color.FromArgb(&H15, &H80, &H3D), Theme.Danger)
            Dim bg = If(up, Color.FromArgb(&HDC, &HFC, &HE7), Color.FromArgb(&HFE, &HE2, &HE2))
            Dim f = Theme.UiFont(8.0F, FontStyle.Bold)
            Dim w = Tr.MeasureText(txt, f).Width + 10
            Using p = Theme.RoundRect(New RectangleF(68, 70, w, 18), 4)
                Using b As New SolidBrush(bg) : g.FillPath(b, p) : End Using
            End Using
            Tr.DrawText(g, txt, f, New Rectangle(68, 70, w, 18), c, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            Tr.DrawText(g, "vs. previous period", Theme.UiFont(8.0F), New Point(68 + w + 6, 72), Theme.G500, TextFormatFlags.NoPadding)
        End If
    End Sub
End Class

''' <summary>Small tile: icon + label + value (Earnings / Due / Store overview boxes).</summary>
Public Class Tile
    Inherits Control
    Public Property Glyph As String = Theme.IcMoney
    Public Property Accent As Color = Theme.Green
    Public Property Caption As String = ""
    Public Property Value As String = ""
    Public Property Stacked As Boolean ' big icon above (store overview) instead of inline
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Height = 90
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(If(Parent?.BackColor, Color.White))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), 8)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        If Stacked Then
            Using p = Theme.RoundRect(New RectangleF(16, 16, 46, 46), 8)
                Using b As New SolidBrush(Theme.Tint(Accent, 28)) : g.FillPath(b, p) : End Using
            End Using
            Using f = Theme.IconFont(15) : Theme.DrawCentered(g, Glyph, f, Accent, New Rectangle(16, 16, 46, 46)) : End Using
            Tr.DrawText(g, Caption, Theme.UiFont(9.0F), New Point(16, 72), Theme.G600, TextFormatFlags.NoPadding)
            Tr.DrawText(g, Value, Theme.UiFont(15.0F, FontStyle.Bold), New Point(15, 92), Accent, TextFormatFlags.NoPadding)
        Else
            Using p = Theme.RoundRect(New RectangleF(16, 16, 30, 30), 6)
                Using b As New SolidBrush(Theme.Tint(Accent, 28)) : g.FillPath(b, p) : End Using
            End Using
            Using f = Theme.IconFont(10) : Theme.DrawCentered(g, Glyph, f, Accent, New Rectangle(16, 16, 30, 30)) : End Using
            Tr.DrawText(g, Caption, Theme.UiFont(9.0F), New Rectangle(56, 16, Width - 60, 30), Theme.G600, TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis Or TextFormatFlags.NoPadding)
            Tr.DrawText(g, Value, Theme.UiFont(14.0F, FontStyle.Bold), New Point(15, 56), Theme.G900, TextFormatFlags.NoPadding)
        End If
    End Sub
End Class

''' <summary>Card heading with an icon (and an optional "View all" link).</summary>
Public Class CardHeading
    Inherits Control
    Public Property Glyph As String = ""
    Public Property Accent As Color = Theme.Primary
    Public Sub New(text As String, glyph As String, Optional accent As Color = Nothing)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Me.Text = text : Me.Glyph = glyph
        If accent <> Color.Empty Then Me.Accent = accent
        Height = 34
        BackColor = Color.White
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Dim x = 0
        If Glyph <> "" Then
            Using f = Theme.IconFont(11) : Tr.DrawText(g, Glyph, f, New Rectangle(0, 0, 22, Height), Accent, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter) : End Using
            x = 28
        End If
        Tr.DrawText(g, Text, Theme.CardTitle, New Rectangle(x, 0, Width - x, Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>Smooth line chart with a soft fill (the website's Sales Overview).</summary>
Public Class LineChart
    Inherits Control
    Public Values As New List(Of Double)
    Public Labels As New List(Of String)
    Public Property LineColor As Color = Theme.Primary
    ''' <summary>Optional second line (previous period), drawn thinner behind the first.</summary>
    Public Values2 As New List(Of Double)
    Public Property Color2 As Color = Theme.Blue
    ''' <summary>How axis / tooltip numbers are written (default: short money).</summary>
    Public Formatter As Func(Of Double, String)
    Public TipFormatter As Func(Of Double, String)
    ''' <summary>Tooltip text for a point by its index (overrides the formatters).</summary>
    Public TipAt As Func(Of Integer, String)
    Private _hover As Integer = -1
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
    End Sub
    Private Function Pts(plot As RectangleF, top As Double, Optional vals As List(Of Double) = Nothing) As PointF()
        If vals Is Nothing Then vals = Values
        Dim n = vals.Count
        Dim slots = Math.Max(Values.Count, Values2.Count)
        Dim a(n - 1) As PointF
        For i = 0 To n - 1
            Dim x = XAt(plot, i, slots)
            Dim y = plot.Bottom - CSng(vals(i) / top) * plot.Height
            a(i) = New PointF(CSng(x), y)
        Next
        Return a
    End Function
    Private Shared Function XAt(plot As RectangleF, i As Integer, slots As Integer) As Single
        Return CSng(plot.Left + If(slots <= 1, plot.Width / 2, plot.Width * i / (slots - 1)))
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        If Values.Count > 0 Then
            Dim plotW = Width - 70
            Dim i = CInt(Math.Round((e.X - 58) / Math.Max(1, plotW) * (Math.Max(Values.Count, Values2.Count) - 1)))
            i = Math.Max(0, Math.Min(Values.Count - 1, i))
            If i <> _hover Then _hover = i : Invalidate()
        End If
        MyBase.OnMouseMove(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = -1 : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Dim plot As New RectangleF(58, 10, Width - 70, Height - 40)
        Dim max = If(Values.Count = 0, 0, Values.Max())
        If Values2.Count > 0 Then max = Math.Max(max, Values2.Max())
        Dim top = If(max <= 0, 100, max * 1.25)
        Using pen As New Pen(Theme.G100)
            For k = 0 To 4
                Dim y = plot.Bottom - plot.Height * k / 4
                g.DrawLine(pen, plot.Left, y, plot.Right, y)
                Tr.DrawText(g, If(Formatter Is Nothing, ShortMoney(top * k / 4), Formatter(top * k / 4)), Theme.Small, New Rectangle(0, CInt(y) - 8, 52, 16), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
            Next
        End Using
        If Values.Count = 0 Then Return
        If Values2.Count > 1 Then
            Using pen As New Pen(Color2, 1.8F) : g.DrawCurve(pen, Pts(plot, top, Values2), 0.4F) : End Using
        End If
        Dim p = Pts(plot, top)
        If p.Length > 1 Then
            Using path As New GraphicsPath()
                path.AddCurve(p, 0.4F)
                Using fill As New GraphicsPath()
                    fill.AddCurve(p, 0.4F)
                    fill.AddLine(p(p.Length - 1).X, plot.Bottom, p(0).X, plot.Bottom)
                    fill.CloseFigure()
                    Using b As New LinearGradientBrush(New PointF(0, plot.Top), New PointF(0, plot.Bottom), Color.FromArgb(46, LineColor), Color.FromArgb(0, LineColor))
                        g.FillPath(b, fill)
                    End Using
                End Using
                Using pen As New Pen(LineColor, 2.5F) : g.DrawPath(pen, path) : End Using
            End Using
        End If
        Dim slots = Math.Max(Values.Count, Values2.Count)
        For i = 0 To Math.Min(Labels.Count, slots) - 1
            Dim lx = XAt(plot, i, slots)
            Tr.DrawText(g, Labels(i), Theme.Small, New Rectangle(CInt(lx) - 45, CInt(plot.Bottom) + 8, 90, 16), Theme.G500, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
        Next
        If _hover >= 0 AndAlso _hover < p.Length Then
            Using b As New SolidBrush(LineColor) : g.FillEllipse(b, p(_hover).X - 4, p(_hover).Y - 4, 8, 8) : End Using
            Dim t = If(TipAt IsNot Nothing, TipAt(_hover), If(TipFormatter IsNot Nothing, TipFormatter(Values(_hover)), If(Formatter IsNot Nothing, Formatter(Values(_hover)), Theme.Money(Values(_hover)))))
            Dim w = Tr.MeasureText(t, Theme.BodyBold).Width + 16
            Dim bx = Math.Min(Math.Max(0, p(_hover).X - w / 2), Width - w)
            Using path = Theme.RoundRect(New RectangleF(CSng(bx), p(_hover).Y - 36, w, 26), 5)
                Using b As New SolidBrush(Theme.G900) : g.FillPath(b, path) : End Using
            End Using
            Tr.DrawText(g, t, Theme.BodyBold, New Rectangle(CInt(bx), CInt(p(_hover).Y) - 36, w, 26), Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
        End If
    End Sub
    Public Shared Function ShortMoney(v As Double) As String
        If v >= 100000 Then Return ChrW(&H20B9) & (v / 100000).ToString("0.#") & "L"
        If v >= 1000 Then Return ChrW(&H20B9) & (v / 1000).ToString("0.#") & "K"
        Return ChrW(&H20B9) & Math.Round(v).ToString()
    End Function
End Class

Public Class DisplayGroup
    Public Key As String, Label As String
    Public Items As New List(Of (Key As String, Label As String))
    ''' <param name="items">"key|Label" for each part of this group.</param>
    Public Sub New(key As String, label As String, ParamArray items As String())
        Me.Key = key : Me.Label = label
        For Each it In items
            Dim parts = it.Split("|"c)
            Me.Items.Add((parts(0), parts(1)))
        Next
    End Sub
End Class

''' <summary>The website's "Display Options" button: tick the parts of the page to show (remembered on this
''' computer). Stays open while ticking several parts.</summary>
Public Class DisplayOptions
    Public ReadOnly Key As String
    Public ReadOnly Hidden As New HashSet(Of String)
    Public Event Changed()
    Public ReadOnly Button As DisplayButton
    Private ReadOnly _groups As List(Of DisplayGroup)
    Private ReadOnly _singles As New List(Of (Key As String, Label As String))

    ''' <summary>The page's options from the website's list (DisplayDefs).</summary>
    Public Shared Function [For](key As String) As DisplayOptions
        Return New DisplayOptions(key, DisplayDefs.Groups(key))
    End Function

    Public Sub New(key As String, ParamArray groups As DisplayGroup())
        Me.Key = key
        _groups = groups.ToList()
        For Each s In DisplayDefs.Singles(key)
            Dim p = s.Split("|"c)
            _singles.Add((p(0), p(1)))
        Next
        Dim saved = TryCast(Store.Read("display_" & key), JsonArray)
        If saved IsNot Nothing Then
            For Each x In saved : Hidden.Add(x.ToString()) : Next
        Else
            Dim def As String() = Nothing
            If DisplayDefs.DefaultHidden.TryGetValue(key, def) Then
                For Each h In def : Hidden.Add(h) : Next
            End If
        End If
        Button = New DisplayButton()
        AddHandler Button.Click, AddressOf ShowMenu
    End Sub

    Friend ReadOnly Property Groups As List(Of DisplayGroup)
        Get
            Return _groups
        End Get
    End Property

    Friend ReadOnly Property Singles As List(Of (Key As String, Label As String))
        Get
            Return _singles
        End Get
    End Property

    ''' <summary>Groups opened in the panel (stay open while the software runs).</summary>
    Friend ReadOnly Expanded As New HashSet(Of String)

    Friend Sub SetOn(k As String, on_ As Boolean)
        If on_ Then Hidden.Remove(k) Else Hidden.Add(k)
        Save()
        RaiseEvent Changed()
    End Sub

    Public Function IsOn(group As String, Optional item As String = Nothing) As Boolean
        Return Not Hidden.Contains(group) AndAlso (item Is Nothing OrElse Not Hidden.Contains(item))
    End Function

    ''' <summary>A single item (not in a group) is shown.</summary>
    Public Function Item(k As String) As Boolean
        Return Not Hidden.Contains(k)
    End Function

    ''' <summary>Everything hidden (True) or everything shown (False) — used by the test run.</summary>
    Public Sub SetAll(hide As Boolean)
        Hidden.Clear()
        If hide Then
            For Each g In _groups
                Hidden.Add(g.Key)
                For Each it In g.Items : Hidden.Add(it.Key) : Next
            Next
            For Each s In _singles : Hidden.Add(s.Key) : Next
        End If
        RaiseEvent Changed()
    End Sub

    Private Sub Toggle(k As String)
        If Hidden.Contains(k) Then Hidden.Remove(k) Else Hidden.Add(k)
        Save()
        RaiseEvent Changed()
    End Sub

    Private Sub Save()
        Dim a As New JsonArray()
        For Each h In Hidden : a.Add(h) : Next
        Store.Write("display_" & Key, a)
    End Sub

    Private Sub ShowMenu(sender As Object, e As EventArgs)
        DisplayPanel.Open(Me, Button)
    End Sub
End Class

''' <summary>The website's "Display Options" button (header variant): white, grey hairline border,
''' sliders icon + label + chevron.</summary>
Public Class DisplayButton
    Inherits Control
    Private _hover As Boolean
    Public Property Open As Boolean
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Cursor = Cursors.Hand
        Text = "Display Options"
        Font = Theme.UiFont(9.75F)
        Height = 36
        Width = PreferredWidth()
    End Sub
    Public Function PreferredWidth() As Integer
        Return 12 + 14 + 8 + Tr.MeasureText(Text, Font).Width + 8 + 12 + 12
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
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(If(_hover OrElse Open, Theme.G50, Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, "sliders-horizontal", New RectangleF(12, (Height - 14) / 2.0F, 14, 14), Theme.G700)
        Dim tw = Tr.MeasureText(Text, Font).Width
        Tr.DrawText(g, Text, Font, New Rectangle(12 + 14 + 8, 0, tw + 2, Height), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        Icons.Draw(g, If(Open, "chevron-up", "chevron-down"), New RectangleF(12 + 14 + 8 + tw + 8, (Height - 12) / 2.0F, 12, 12), Theme.G700)
    End Sub
End Class

''' <summary>The website's Display Options panel: "SECTIONS", each section with its checkbox and a chevron that
''' opens its parts (in a light grey box), then the single options. Stays open while ticking.</summary>
Public Class DisplayPanel
    Inherits Control
    Private Const RowH As Integer = 34
    Private Const Pad As Integer = 12
    Private ReadOnly _opt As DisplayOptions
    Private _rows As New List(Of Row)
    Private _hover As Integer = -1
    Public Relayout As Action

    Private Class Row
        Public Kind As String ' head | group | item | single
        Public Key As String
        Public Label As String
        Public Y As Integer
        Public H As Integer
        Public Chevron As Rectangle
    End Class

    Public Shared Sub Open(opt As DisplayOptions, anchor As DisplayButton)
        Dim panel As New DisplayPanel(opt)
        Dim host As New ToolStripControlHost(panel) With {.Margin = Padding.Empty, .Padding = Padding.Empty, .AutoSize = False, .Size = panel.Size}
        Dim dd As New ToolStripDropDown With {.Padding = Padding.Empty, .DropShadowEnabled = True, .AutoClose = True, .BackColor = Color.White}
        dd.Items.Add(host)
        panel.Relayout = Sub()
                             panel.Build()
                             host.Size = panel.Size
                             dd.Size = panel.Size
                         End Sub
        AddHandler dd.Closed, Sub()
                                  anchor.Open = False
                                  anchor.Invalidate()
                                  dd.BeginInvoke(Sub() dd.Dispose())
                              End Sub
        anchor.Open = True
        anchor.Invalidate()
        ' right-aligned under the button, like the website
        dd.Show(anchor, New Point(anchor.Width - panel.Width, anchor.Height + 6))
    End Sub

    Public Sub New(opt As DisplayOptions)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _opt = opt
        BackColor = Color.White
        Font = Theme.UiFont(9.75F)
        Cursor = Cursors.Hand
        Build()
    End Sub

    Friend Sub Build()
        _rows = New List(Of Row)
        Dim y = Pad
        Dim w = 240
        Dim add = Sub(kind As String, key As String, label As String, h As Integer)
                      _rows.Add(New Row With {.Kind = kind, .Key = key, .Label = label, .Y = y, .H = h})
                      y += h + 2
                  End Sub
        If _opt.Groups.Count > 0 Then add("head", "", "SECTIONS", 24)
        For Each g In _opt.Groups
            add("group", g.Key, g.Label, RowH)
            If _opt.Expanded.Contains(g.Key) Then
                For Each it In g.Items : add("item", it.Key, it.Label, RowH) : Next
            End If
        Next
        For Each s In _opt.Singles : add("single", s.Key, s.Label, RowH) : Next
        For Each r In _rows
            Dim tw = Tr.MeasureText(r.Label, Font).Width
            w = Math.Max(w, tw + 15 + 10 + 10 + 30 + Pad * 2 + If(r.Kind = "item", 40, 0))
        Next
        Dim maxH = CInt(Screen.PrimaryScreen.WorkingArea.Height * 0.7)
        Size = New Size(Math.Min(w, 460), Math.Min(y + Pad - 2, maxH))
        Invalidate()
    End Sub

    Private Function IsOnKey(k As String) As Boolean
        Return Not _opt.Hidden.Contains(k)
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        g.Clear(Color.White)
        Using pen As New Pen(Theme.G200) : g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1) : End Using
        ' a light grey box behind each opened section's parts
        Dim ix = 0
        While ix < _rows.Count
            If _rows(ix).Kind = "item" Then
                Dim j = ix
                While j + 1 < _rows.Count AndAlso _rows(j + 1).Kind = "item" : j += 1 : End While
                Using p = Theme.RoundRect(New RectangleF(Pad + 4, _rows(ix).Y - 2, Width - Pad * 2 - 8, _rows(j).Y + _rows(j).H - _rows(ix).Y + 4), Theme.Radius)
                    Using b As New SolidBrush(Theme.G50) : g.FillPath(b, p) : End Using
                End Using
                ix = j + 1
            Else
                ix += 1
            End If
        End While
        For k = 0 To _rows.Count - 1
            Dim r = _rows(k)
            If r.Kind = "head" Then
                Tr.DrawText(g, r.Label, Theme.UiFont(8.0F, FontStyle.Bold), New Rectangle(Pad + 10, r.Y, Width, r.H - 4), Theme.G400, TextFormatFlags.Bottom Or TextFormatFlags.NoPadding)
                Continue For
            End If
            Dim inset = If(r.Kind = "item", 4, 0)
            Dim rr As New Rectangle(Pad + inset, r.Y, Width - Pad * 2 - inset * 2, r.H)
            If k = _hover Then
                Using p = Theme.RoundRect(New RectangleF(rr.X, rr.Y, rr.Width, rr.Height), Theme.Radius)
                    Using b As New SolidBrush(If(r.Kind = "item", Theme.G100, Theme.G50)) : g.FillPath(b, p) : End Using
                End Using
            End If
            Dim tw = Tr.MeasureText(r.Label, Font).Width
            Dim x = rr.X + 10
            If r.Kind = "item" Then x = rr.X + Math.Max(24, (rr.Width - (15 + 10 + tw)) \ 2)
            Gfx.Check(g, New Rectangle(x, rr.Y + (rr.Height - 15) \ 2, 15, 15), IsOnKey(r.Key))
            Tr.DrawText(g, r.Label, Font, New Rectangle(x + 25, rr.Y, rr.Right - x - 25 - If(r.Kind = "group", 28, 4), rr.Height), Theme.G800, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            If r.Kind = "group" Then
                r.Chevron = New Rectangle(rr.Right - 28, rr.Y + (rr.Height - 20) \ 2, 20, 20)
                Icons.Draw(g, If(_opt.Expanded.Contains(r.Key), "chevron-up", "chevron-down"), New RectangleF(r.Chevron.X + 4, r.Chevron.Y + 4, 12, 12), Theme.G400)
            End If
        Next
    End Sub

    Private Function RowAt(p As Point) As Integer
        For k = 0 To _rows.Count - 1
            If _rows(k).Kind <> "head" AndAlso p.Y >= _rows(k).Y AndAlso p.Y < _rows(k).Y + _rows(k).H Then Return k
        Next
        Return -1
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim k = RowAt(e.Location)
        If k <> _hover Then _hover = k : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = -1 : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        Dim k = RowAt(e.Location)
        If k < 0 Then Return
        Dim r = _rows(k)
        If r.Kind = "group" AndAlso Rectangle.Inflate(r.Chevron, 6, 6).Contains(e.Location) Then
            If Not _opt.Expanded.Remove(r.Key) Then _opt.Expanded.Add(r.Key)
            Relayout?.Invoke()
            Return
        End If
        _opt.SetOn(r.Key, Not IsOnKey(r.Key))
        Invalidate()
    End Sub
End Class

Partial Public Module Ui
    ''' <summary>The website's table look for a DataGridView: light header, row lines, no heavy borders.</summary>
    Public Sub StyleGrid(g As DataGridView)
        g.BackgroundColor = Color.White
        g.BorderStyle = BorderStyle.None
        g.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal
        g.GridColor = Theme.G200
        g.EnableHeadersVisualStyles = False
        g.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None
        g.ColumnHeadersDefaultCellStyle.BackColor = Theme.G50
        g.ColumnHeadersDefaultCellStyle.ForeColor = Theme.G600
        g.ColumnHeadersDefaultCellStyle.Font = Theme.UiFont(8.5F, FontStyle.Bold)
        g.ColumnHeadersDefaultCellStyle.SelectionBackColor = Theme.G50
        g.ColumnHeadersDefaultCellStyle.Padding = New Padding(8, 0, 8, 0)
        g.ColumnHeadersHeight = 40
        g.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing
        g.DefaultCellStyle.Font = Theme.Body
        g.DefaultCellStyle.ForeColor = Theme.G800
        g.DefaultCellStyle.SelectionBackColor = Theme.PrimarySoft
        g.DefaultCellStyle.SelectionForeColor = Theme.G900
        g.DefaultCellStyle.Padding = New Padding(8, 0, 8, 0)
        g.RowTemplate.Height = 46
        g.RowHeadersVisible = False
        g.AllowUserToAddRows = False
        g.AllowUserToResizeRows = False
        g.SelectionMode = DataGridViewSelectionMode.FullRowSelect
        g.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        ' Smooth scrolling / no flicker.
        Dim prop = GetType(DataGridView).GetProperty("DoubleBuffered", Reflection.BindingFlags.Instance Or Reflection.BindingFlags.NonPublic)
        prop?.SetValue(g, True)
    End Sub

    ''' <summary>A native Windows drop-down with the app's font.</summary>
    Public Function Combo(items As IEnumerable(Of String), Optional width As Integer = 200) As ComboBox
        Dim c As New ComboBox With {.DropDownStyle = ComboBoxStyle.DropDownList, .Font = Theme.Body, .Width = width, .FlatStyle = FlatStyle.System}
        For Each i In items : c.Items.Add(i) : Next
        If c.Items.Count > 0 Then c.SelectedIndex = 0
        Return c
    End Function

    Public Sub DoubleBuffer(c As Control)
        Dim prop = GetType(Control).GetProperty("DoubleBuffered", Reflection.BindingFlags.Instance Or Reflection.BindingFlags.NonPublic)
        prop?.SetValue(c, True)
    End Sub
End Module
