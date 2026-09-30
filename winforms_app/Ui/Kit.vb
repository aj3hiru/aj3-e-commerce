Imports System.ComponentModel
Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Globalization
Imports System.IO
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

' ═══════════════════════════════════════════════════════════════════════════════════════════════
'  Building blocks every page is made of (the website admin's pieces, drawn natively):
'  vertical stacks and column grids that size themselves, cards with titles, the list table with
'  "Show n entries / Select All / Bulk Actions / search / pager", filter cards, the date-range bar,
'  tabs, status pills, the edit dialog, pictures kept on the computer, popup menus.
' ═══════════════════════════════════════════════════════════════════════════════════════════════

''' <summary>A block whose height depends on the width it gets (text that wraps, a grid of cards…).</summary>
Public Interface IFlowHeight
    Function HeightFor(width As Integer) As Integer
End Interface

Public Module Flow
    Public Function HeightOf(c As Control, width As Integer) As Integer
        Dim f = TryCast(c, IFlowHeight)
        Return If(f Is Nothing, c.Height, f.HeightFor(width))
    End Function
End Module

''' <summary>Children one under another, each the full width (the website's page column).</summary>
Public Class VStack
    Inherits Panel
    Implements IFlowHeight
    Public Property Gap As Integer = 16
    Public Sub New(Optional gap As Integer = 16)
        Me.Gap = gap
        DoubleBuffered = True
        BackColor = Color.Transparent
        Padding = New Padding(0)
    End Sub
    Public Function Add(Of T As Control)(c As T) As T
        Controls.Add(c)
        Return c
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Dim w = width - Padding.Horizontal
        Dim h = Padding.Vertical, n = 0
        For Each c As Control In Controls
            If Not c.Visible AndAlso Not IsHiddenByParent(c) Then Continue For
            h += Flow.HeightOf(c, w) + If(n > 0, Gap, 0)
            n += 1
        Next
        Return h
    End Function
    ''' <summary>A child is "on" when its own Visible flag is set (even while this page is not on screen).</summary>
    Friend Shared Function IsHiddenByParent(c As Control) As Boolean
        Return Kit.WantsVisible(c)
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Dim w = ClientSize.Width - Padding.Horizontal
        Dim y = Padding.Top
        For Each c As Control In Controls
            If Not Kit.WantsVisible(c) Then Continue For
            Dim h = Flow.HeightOf(c, w)
            c.SetBounds(Padding.Left, y, w, h)
            y += h + Gap
        Next
    End Sub
End Class

''' <summary>Children side by side in equal columns (or by weights), wrapping to more rows when narrow.</summary>
Public Class Columns
    Inherits Panel
    Implements IFlowHeight
    Public Property Count As Integer
    Public Property MinWidth As Integer = 220
    Public Property Gap As Integer = 16
    Public Weights As Integer()
    ''' <summary>All cells in a row get the row's tallest height (cards line up, as on the website).</summary>
    Public Property Stretch As Boolean = True
    Public Sub New(count As Integer, Optional minWidth As Integer = 220, Optional gap As Integer = 16)
        Me.Count = count : Me.MinWidth = minWidth : Me.Gap = gap
        DoubleBuffered = True
        BackColor = Color.Transparent
    End Sub
    Public Function Add(Of T As Control)(c As T) As T
        Controls.Add(c)
        Return c
    End Function
    Private Function Shown() As List(Of Control)
        Return Controls.Cast(Of Control)().Where(Function(c) Kit.WantsVisible(c)).ToList()
    End Function
    Private Function ColsFor(width As Integer, n As Integer) As Integer
        Dim cols = Math.Max(1, Math.Min(Count, n))
        While cols > 1 AndAlso (width - Gap * (cols - 1)) \ cols < MinWidth
            cols -= 1
        End While
        Return cols
    End Function
    ''' <summary>x and width of each cell in a row of `cols` columns.</summary>
    Private Function CellSpans(width As Integer, cols As Integer, n As Integer) As List(Of (X As Integer, W As Integer))
        Dim res As New List(Of (Integer, Integer))
        Dim useW = Weights IsNot Nothing AndAlso cols = Count AndAlso Weights.Length >= cols
        Dim total = If(useW, Weights.Take(cols).Sum(), cols)
        Dim avail = width - Gap * (cols - 1)
        Dim x = 0
        For k = 0 To cols - 1
            Dim w = If(k = cols - 1, width - x, CInt(avail * If(useW, Weights(k), 1) / total))
            res.Add((x, w))
            x += w + Gap
        Next
        Return res
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Dim s = Shown()
        If s.Count = 0 Then Return 0
        Dim cols = ColsFor(width, s.Count)
        Dim cells = CellSpans(width, cols, s.Count)
        Dim h = 0
        For r = 0 To (s.Count - 1) \ cols
            Dim rh = 0
            For k = 0 To cols - 1
                Dim idx = r * cols + k
                If idx >= s.Count Then Exit For
                rh = Math.Max(rh, Flow.HeightOf(s(idx), cells(k).W))
            Next
            h += rh + If(r > 0, Gap, 0)
        Next
        Return h
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Dim s = Shown()
        If s.Count = 0 Then Return
        Dim width = ClientSize.Width
        Dim cols = ColsFor(width, s.Count)
        Dim cells = CellSpans(width, cols, s.Count)
        Dim y = 0
        For r = 0 To (s.Count - 1) \ cols
            Dim rh = 0
            For k = 0 To cols - 1
                Dim idx = r * cols + k
                If idx >= s.Count Then Exit For
                rh = Math.Max(rh, Flow.HeightOf(s(idx), cells(k).W))
            Next
            For k = 0 To cols - 1
                Dim idx = r * cols + k
                If idx >= s.Count Then Exit For
                s(idx).SetBounds(cells(k).X, y, cells(k).W, If(Stretch, rh, Flow.HeightOf(s(idx), cells(k).W)))
            Next
            y += rh + Gap
        Next
    End Sub
End Class

''' <summary>Controls in a row from the left (buttons, filters), wrapping when there's no room.</summary>
Public Class HRow
    Inherits Panel
    Implements IFlowHeight
    Public Property Gap As Integer = 8
    Public Property RightAlign As Boolean
    Public Sub New(Optional gap As Integer = 8)
        Me.Gap = gap
        DoubleBuffered = True
        BackColor = Color.Transparent
    End Sub
    Public Function Add(Of T As Control)(c As T) As T
        Controls.Add(c)
        Return c
    End Function
    Private Function Place(width As Integer, apply As Boolean) As Integer
        Dim x = 0, y = 0, rowH = 0
        Dim row As New List(Of Control)
        Dim flush = Sub()
                        If apply AndAlso RightAlign AndAlso row.Count > 0 Then
                            Dim used = row.Sum(Function(c) c.Width) + Gap * (row.Count - 1)
                            Dim sx = width - used
                            For Each c In row
                                c.Location = New Point(sx, y + (rowH - c.Height) \ 2)
                                sx += c.Width + Gap
                            Next
                        End If
                        row.Clear()
                    End Sub
        For Each c As Control In Controls
            If Not Kit.WantsVisible(c) Then Continue For
            If x > 0 AndAlso x + c.Width > width Then
                flush()
                y += rowH + Gap : x = 0 : rowH = 0
            End If
            If apply AndAlso Not RightAlign Then c.Location = New Point(x, y)
            row.Add(c)
            x += c.Width + Gap
            rowH = Math.Max(rowH, c.Height)
        Next
        flush()
        Return y + rowH
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return Place(width, False)
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Place(ClientSize.Width, True)
    End Sub
End Class

''' <summary>A white card with an optional title row (icon, title, buttons on the right) and a body.</summary>
Public Class CardBox
    Inherits Card
    Implements IFlowHeight
    Public ReadOnly Body As New VStack(12)
    Public ReadOnly Tools As New HRow() With {.RightAlign = True}
    Public Property Title As String
    Public Property Glyph As String
    Public Property Accent As Color = Theme.Primary
    Public Property Subtitle As String
    Private Const HeadH As Integer = 34
    Public Sub New(Optional title As String = Nothing, Optional glyph As String = "", Optional pad As Integer = 18)
        Me.Title = title : Me.Glyph = glyph
        Padding = New Padding(pad)
        Controls.Add(Body)
        Controls.Add(Tools)
    End Sub
    Public Function Add(Of T As Control)(c As T) As T
        Body.Controls.Add(c)
        Return c
    End Function
    Private ReadOnly Property Top_ As Integer
        Get
            If String.IsNullOrEmpty(Title) Then Return Padding.Top
            Return Padding.Top + HeadH + If(String.IsNullOrEmpty(Subtitle), 8, 26)
        End Get
    End Property
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return Top_ + Body.HeightFor(width - Padding.Horizontal) + Padding.Bottom
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        If Body Is Nothing OrElse Tools Is Nothing Then Return
        Dim w = Width - Padding.Horizontal
        If Not String.IsNullOrEmpty(Title) Then
            Dim tw = Math.Min(w \ 2 + 80, Tools.Controls.Cast(Of Control)().Where(Function(c) Kit.WantsVisible(c)).Sum(Function(c) c.Width + 8))
            Tools.SetBounds(Width - Padding.Right - tw, Padding.Top, tw, HeadH)
        Else
            Tools.SetBounds(0, 0, 0, 0)
        End If
        Body.SetBounds(Padding.Left, Top_, w, Body.HeightFor(w))
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        MyBase.OnPaint(e)
        If String.IsNullOrEmpty(Title) Then Return
        Dim g = e.Graphics
        Dim x = Padding.Left
        If Not String.IsNullOrEmpty(Glyph) Then
            Using f = Theme.IconFont(11)
                Tr.DrawText(g, Glyph, f, New Rectangle(x, Padding.Top, 22, HeadH), Accent, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter)
            End Using
            x += 28
        End If
        Tr.DrawText(g, Title, Theme.CardTitle, New Rectangle(x, Padding.Top, Width - x - Padding.Right - Tools.Width, HeadH), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        If Not String.IsNullOrEmpty(Subtitle) Then
            Tr.DrawText(g, Subtitle, Theme.Small, New Rectangle(Padding.Left, Padding.Top + HeadH - 2, Width - Padding.Horizontal, 20), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        End If
    End Sub
End Class

''' <summary>Text that wraps to the width it gets.</summary>
Public Class TextBlock
    Inherits Control
    Implements IFlowHeight
    Public Property Color_ As Color = Theme.G600
    Public Property Center As Boolean
    Public Sub New(text As String, Optional font As Font = Nothing, Optional color As Color = Nothing)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Me.Text = text
        Me.Font = If(font, Theme.Body)
        If color <> Color.Empty Then Color_ = color
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        If String.IsNullOrEmpty(Text) Then Return 0
        Return Tr.MeasureText(Text, Font, New Size(Math.Max(10, width), 10000), TextFormatFlags.WordBreak Or TextFormatFlags.NoPadding).Height + 2
    End Function
    Protected Overrides Sub OnTextChanged(e As EventArgs)
        MyBase.OnTextChanged(e)
        Invalidate()
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Tr.DrawText(e.Graphics, Text, Font, ClientRectangle, Color_, TextFormatFlags.WordBreak Or TextFormatFlags.NoPadding Or If(Center, TextFormatFlags.HorizontalCenter, TextFormatFlags.Left))
    End Sub
End Class

''' <summary>A label above a control (form field). Height = label + control.</summary>
Public Class Field
    Inherits Panel
    Implements IFlowHeight
    Public ReadOnly Input As Control
    Public ReadOnly Caption As FieldLabel
    Public ReadOnly Hint As TextBlock
    Public Sub New(label As String, input As Control, Optional hint As String = Nothing, Optional required As Boolean = False)
        Me.Input = input
        BackColor = Color.Transparent
        Caption = New FieldLabel(label, required)
        Controls.Add(Caption)
        Controls.Add(input)
        If Not String.IsNullOrEmpty(hint) Then
            Me.Hint = New TextBlock(hint, Theme.Small, Theme.G500)
            Controls.Add(Me.Hint)
        End If
    End Sub
    Private ReadOnly Property InputH As Integer
        Get
            If TypeOf Input Is ComboBox OrElse TypeOf Input Is DateTimePicker OrElse TypeOf Input Is NumericUpDown Then Return 32
            Return Input.Height
        End Get
    End Property
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Dim h = If(Caption.Text = "", 0, 24) + Flow.HeightOf(Input, width)
        If TypeOf Input Is ComboBox OrElse TypeOf Input Is DateTimePicker Then h = If(Caption.Text = "", 0, 24) + 32
        If Hint IsNot Nothing Then h += 4 + Hint.HeightFor(width)
        Return h
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        Dim top = 0
        If Caption.Text <> "" Then
            Caption.Location = New Point(0, 0)
            top = 24
        End If
        Dim ih = If(TypeOf Input Is ComboBox OrElse TypeOf Input Is DateTimePicker, Input.Height, Flow.HeightOf(Input, Width))
        Input.SetBounds(0, top, Width, ih)
        If Hint IsNot Nothing Then Hint.SetBounds(0, top + If(TypeOf Input Is ComboBox OrElse TypeOf Input Is DateTimePicker, 32, ih) + 4, Width, Hint.HeightFor(Width))
    End Sub
End Class

''' <summary>A fixed-height blank space / divider line.</summary>
Public Class Spacer
    Inherits Control
    Public Property Line As Boolean
    Public Sub New(h As Integer, Optional line As Boolean = False)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Height = h : Me.Line = line
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        If Line Then
            Using p As New Pen(Theme.G200) : e.Graphics.DrawLine(p, 0, Height \ 2, Width, Height \ 2) : End Using
        End If
    End Sub
End Class

''' <summary>A page that scrolls: the website's page column (cards one under another). Pages fill Body,
''' then call Relayout() after showing/hiding things. Reload() runs when data changes (only while on screen;
''' otherwise once when the page is opened again).</summary>
Public MustInherit Class ScrollPage
    Inherits PageBase
    Protected ReadOnly Scroller As New Panel With {.Dock = DockStyle.Fill, .AutoScroll = True, .BackColor = Theme.Page}
    Protected ReadOnly Body As New VStack(16) With {.Padding = New Padding(24)}
    Private _dirty As Boolean = True
    Private _laying As Boolean

    Public Sub New()
        Controls.Add(Scroller)
        Scroller.Controls.Add(Body)
        Ui.DoubleBuffer(Scroller)
        AddHandler Scroller.Resize, Sub() Relayout()
        AddHandler AppState.I.DataChanged, AddressOf OnData
    End Sub

    Private Sub OnData()
        If IsDisposed Then Return
        If Visible AndAlso Parent IsNot Nothing Then
            Reload()
            Relayout()
        Else
            _dirty = True
        End If
    End Sub

    ''' <summary>Fill the page from the data on this computer.</summary>
    Protected MustOverride Sub Reload()

    Public Overrides Sub OnOpened()
        If _dirty Then
            _dirty = False
            Reload()
        End If
        Relayout()
    End Sub

    Public Sub Refresh_()
        Reload()
        Relayout()
    End Sub

    Public Overrides Function ContentHeight() As Integer
        Return Body.Height
    End Function

    ''' <summary>Empties the page (for pages rebuilt on every change). Controls in keep are detached, not destroyed.</summary>
    Protected Sub ClearBody(ParamArray keep As Control())
        For Each k In keep
            k.Parent?.Controls.Remove(k)
        Next
        For Each c As Control In Body.Controls.Cast(Of Control)().ToList()
            Body.Controls.Remove(c)
            c.Dispose()
        Next
    End Sub

    Public Sub Relayout()
        If _laying Then Return
        _laying = True
        Try
            Dim w = Scroller.ClientSize.Width
            If w < 50 Then Return
            Dim h = Body.HeightFor(w)
            ' The vertical scroll bar takes room: measure again without it when it appears.
            If h > Scroller.ClientSize.Height AndAlso Not Scroller.VerticalScroll.Visible Then
                w -= SystemInformation.VerticalScrollBarWidth
                h = Body.HeightFor(w)
            End If
            Scroller.SuspendLayout()
            Body.SetBounds(0, Scroller.AutoScrollPosition.Y, w, h)
            Body.PerformLayout()
            PerformNested(Body)
            Scroller.AutoScrollMinSize = New Size(0, h)
            Scroller.ResumeLayout()
        Finally
            _laying = False
        End Try
    End Sub

    Private Shared Sub PerformNested(c As Control)
        For Each k As Control In c.Controls
            If TypeOf k Is VStack OrElse TypeOf k Is Columns OrElse TypeOf k Is CardBox OrElse TypeOf k Is HRow OrElse TypeOf k Is Field OrElse TypeOf k Is ListCard OrElse TypeOf k Is FilterCard OrElse TypeOf k Is FlowBox OrElse TypeOf k Is Card Then
                k.PerformLayout()
                PerformNested(k)
            End If
        Next
    End Sub
End Class

Public Module Kit
    Private ReadOnly _want As New ConditionalWeakTable(Of Control, Object)()

    ''' <summary>Show / hide a block inside a page (works while the page itself is hidden).</summary>
    Public Sub Show(c As Control, on_ As Boolean)
        If on_ Then _want.Remove(c) Else _want.AddOrUpdate(c, True)
        c.Visible = on_
    End Sub

    Public Function WantsVisible(c As Control) As Boolean
        Dim o As Object = Nothing
        Return Not _want.TryGetValue(c, o)
    End Function
End Module

Friend Class ConditionalWeakTable(Of TKey As Class, TValue As Class)
    Private ReadOnly _t As New System.Runtime.CompilerServices.ConditionalWeakTable(Of TKey, TValue)()
    Public Sub AddOrUpdate(k As TKey, v As TValue)
        _t.AddOrUpdate(k, v)
    End Sub
    Public Sub Remove(k As TKey)
        _t.Remove(k)
    End Sub
    Public Function TryGetValue(k As TKey, ByRef v As TValue) As Boolean
        Return _t.TryGetValue(k, v)
    End Function
End Class

' ═══════════════════════════ status pills, formats ═══════════════════════════
Public Module Fmt
    Public ReadOnly Yellow As Color = Color.FromArgb(&HF6, &HC2, &H3E)
    Public ReadOnly Indigo As Color = Color.FromArgb(&H43, &H61, &HEE)
    Public ReadOnly Orange As Color = Color.FromArgb(&HF9, &H73, &H16)
    Public ReadOnly BlueSoft As Color = Color.FromArgb(&HEF, &HF6, &HFF)
    Public ReadOnly GreenText As Color = Color.FromArgb(&H15, &H80, &H3D)
    Public ReadOnly GreenSoft As Color = Color.FromArgb(&HDC, &HFC, &HE7)
    Public ReadOnly RedSoft As Color = Color.FromArgb(&HFE, &HE2, &HE2)
    Public ReadOnly AmberText As Color = Color.FromArgb(&HB4, &H53, &H9)
    Public ReadOnly AmberSoft As Color = Color.FromArgb(&HFE, &HF3, &HC7)

    ''' <summary>Order / payment / record status → pill colour (the website's StatusDropdown colours).</summary>
    Public Function StatusColor(s As String) As Color
        Select Case s
            Case "Pending" : Return Yellow
            Case "In Progress" : Return Theme.Cyan
            Case "Out for Delivery" : Return Color.FromArgb(&H3B, &H82, &HF6)
            Case "Delivered", "Paid", "Active", "Published", "active", "published", "paid", "Approved", "approved", "Sent", "sent", "Completed", "completed", "Yes", "Enabled", "On"
                Return Theme.Green
            Case "Canceled", "Cancelled", "Failed", "failed", "Rejected", "rejected", "Unpaid", "unpaid", "Blocked", "blocked", "Expired", "expired"
                Return Theme.Red
            Case "Partly", "Partial", "Partially Paid", "partial", "Scheduled", "scheduled", "Paused", "paused"
                Return Yellow
            Case Else : Return Theme.Grey
        End Select
    End Function

    ' The website shows every date in India time (IST), whatever the computer's own clock is set to.
    Private _ist As TimeZoneInfo
    Public Function ToIst(v As DateTime) As DateTime
        If _ist Is Nothing Then
            Try
                _ist = TimeZoneInfo.FindSystemTimeZoneById("India Standard Time")
            Catch
                _ist = TimeZoneInfo.CreateCustomTimeZone("IST", TimeSpan.FromMinutes(330), "IST", "IST")
            End Try
        End If
        Return TimeZoneInfo.ConvertTime(v, _ist)
    End Function

    ''' <summary>"30 Sep 2026, 8:47 PM" in India time (the website's fmtDateTime).</summary>
    Public Function IstStamp(v As DateTime?) As String
        If Not v.HasValue Then Return ""
        Dim d = ToIst(v.Value)
        Return d.ToString("dd MMM yyyy, h:mm ", Globalization.CultureInfo.InvariantCulture) & If(d.Hour < 12, "AM", "PM")
    End Function

    ''' <summary>The India-time calendar day of an instant.</summary>
    Public Function IstDay(v As DateTime?) As Date
        If Not v.HasValue Then Return Date.MinValue
        Return ToIst(v.Value).Date
    End Function

    Public Function IstToday() As Date
        Return ToIst(DateTime.Now).Date
    End Function

    Public Function Day(v As DateTime?) As String
        If Not v.HasValue Then Return ""
        Return v.Value.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)
    End Function

    Public Function Stamp(v As DateTime?) As String
        If Not v.HasValue Then Return ""
        Return v.Value.ToString("dd MMM yyyy, hh:mm tt", CultureInfo.InvariantCulture)
    End Function

    Public Function Clock(v As DateTime?) As String
        If Not v.HasValue Then Return ""
        Return v.Value.ToString("hh:mm tt", CultureInfo.InvariantCulture)
    End Function

    Public Function Ago(v As DateTime?) As String
        If Not v.HasValue Then Return ""
        Dim s = DateTime.Now - v.Value
        If s.TotalSeconds < 60 Then Return "just now"
        If s.TotalMinutes < 60 Then Return CInt(s.TotalMinutes) & " min ago"
        If s.TotalHours < 24 Then Return CInt(s.TotalHours) & " h ago"
        If s.TotalDays < 30 Then Return CInt(Math.Floor(s.TotalDays)) & " days ago"
        Return Day(v)
    End Function

    Public Function Num(v As Double) As String
        Return v.ToString("#,##0.##", Theme.India)
    End Function

    Public Function Money0(v As Double) As String
        Return ChrW(&H20B9) & v.ToString("#,##0", Theme.India)
    End Function

    Public Function Title(s As String) As String
        If String.IsNullOrEmpty(s) Then Return ""
        Return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s.Replace("_", " ").ToLowerInvariant())
    End Function

    Public Function Bytes(n As Double) As String
        If n >= 1024 * 1024 * 1024 Then Return (n / 1024 / 1024 / 1024).ToString("0.0") & " GB"
        If n >= 1024 * 1024 Then Return (n / 1024 / 1024).ToString("0.0") & " MB"
        If n >= 1024 Then Return (n / 1024).ToString("0") & " KB"
        Return n.ToString("0") & " B"
    End Function

    Public Function ParseNum(s As String) As Double
        Dim v As Double
        If Double.TryParse((If(s, "")).Replace(",", "").Replace(ChrW(&H20B9), "").Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, v) Then Return v
        Return 0
    End Function

    Public Function ColorFromHex(hex As String, fallback As Color) As Color
        Try
            If String.IsNullOrEmpty(hex) Then Return fallback
            Return ColorTranslator.FromHtml(If(hex.StartsWith("#"), hex, "#" & hex))
        Catch
            Return fallback
        End Try
    End Function

    Public Function Hex(c As Color) As String
        Return "#" & c.R.ToString("X2") & c.G.ToString("X2") & c.B.ToString("X2")
    End Function
End Module

Public Module Gfx
    ''' <summary>Solid status pill ("Paid ▾"); returns its rectangle.</summary>
    Public Function Pill(g As Graphics, text As String, x As Integer, cy As Integer, bg As Color, Optional caret As Boolean = False, Optional fg As Color = Nothing) As Rectangle
        Dim f = Theme.UiFont(8.25F, FontStyle.Bold)
        Dim tw = Tr.MeasureText(text, f).Width
        Dim w = tw + If(caret, 22, 12)
        Dim r As New Rectangle(x, cy - 11, w, 22)
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), 3)
            Using b As New SolidBrush(bg) : g.FillPath(b, p) : End Using
        End Using
        Dim c = If(fg = Color.Empty, Color.White, fg)
        Tr.DrawText(g, text, f, New Rectangle(r.X + 6, r.Y, tw + 2, r.Height), c, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
        If caret Then
            Using fi = Theme.IconFont(6.5F)
                Tr.DrawText(g, Theme.IcChevronDown, fi, New Rectangle(r.Right - 16, r.Y, 12, r.Height), c, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
            End Using
        End If
        Return r
    End Function

    ''' <summary>Soft badge ("Admin", "Online", "Walk-in").</summary>
    Public Function Badge(g As Graphics, text As String, x As Integer, cy As Integer, fg As Color, bg As Color) As Rectangle
        Dim f = Theme.UiFont(8.0F, FontStyle.Bold)
        Dim w = Tr.MeasureText(text, f).Width + 12
        Dim r As New Rectangle(x, cy - 10, w, 20)
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), 3)
            Using b As New SolidBrush(bg) : g.FillPath(b, p) : End Using
        End Using
        Tr.DrawText(g, text, f, r, fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
        Return r
    End Function

    Public Function PillWidth(text As String, Optional caret As Boolean = False) As Integer
        Return Tr.MeasureText(text, Theme.UiFont(8.25F, FontStyle.Bold)).Width + If(caret, 22, 12)
    End Function

    Public Sub Toggle(g As Graphics, r As Rectangle, on_ As Boolean)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), r.Height / 2.0F)
            Using b As New SolidBrush(If(on_, Theme.Primary, Theme.G300)) : g.FillPath(b, p) : End Using
        End Using
        Dim d = r.Height - 4
        Using b As New SolidBrush(Color.White) : g.FillEllipse(b, If(on_, r.Right - d - 2, r.X + 2), r.Y + 2, d, d) : End Using
    End Sub

    Public Sub Check(g As Graphics, r As Rectangle, on_ As Boolean, Optional partial_ As Boolean = False)
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), 3)
            If on_ OrElse partial_ Then
                Using b As New SolidBrush(Theme.Primary) : g.FillPath(b, p) : End Using
            Else
                Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                Using pen As New Pen(Theme.G400) : g.DrawPath(pen, p) : End Using
            End If
        End Using
        If on_ Then
            Using f = Theme.IconFont(7.5F) : Theme.DrawCentered(g, Theme.IcCheck, f, Color.White, r) : End Using
        ElseIf partial_ Then
            Using pen As New Pen(Color.White, 2) : g.DrawLine(pen, r.X + 4, r.Y + r.Height \ 2, r.Right - 4, r.Y + r.Height \ 2) : End Using
        End If
    End Sub

    ''' <summary>Round picture (or initials) for people.</summary>
    Public Sub Avatar(g As Graphics, r As Rectangle, name As String, img As Image, Optional color As Color = Nothing)
        Theme.Smooth(g)
        If img IsNot Nothing Then
            Using path As New GraphicsPath()
                path.AddEllipse(r)
                Dim clip = g.Clip
                g.SetClip(path)
                g.DrawImage(img, r)
                g.Clip = clip
            End Using
            Return
        End If
        Using b As New SolidBrush(If(color = Color.Empty, Theme.PrimaryLight, color)) : g.FillEllipse(b, r) : End Using
        Dim ini = If(String.IsNullOrWhiteSpace(name), "?", String.Concat(name.Split(" "c, StringSplitOptions.RemoveEmptyEntries).Take(2).Select(Function(w) Char.ToUpperInvariant(w(0)))))
        Theme.DrawCentered(g, ini, Theme.UiFont(Math.Max(7.0F, r.Height / 3.2F), FontStyle.Bold), If(color = Color.Empty, Theme.Primary, Color.White), r)
    End Sub

    ''' <summary>A picture fitted inside a rounded box (product photos), or a soft placeholder.</summary>
    Public Sub Thumb(g As Graphics, r As Rectangle, img As Image, Optional radius As Single = 6)
        Theme.Smooth(g)
        Using path = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), radius)
            Using b As New SolidBrush(Theme.G100) : g.FillPath(b, path) : End Using
            If img IsNot Nothing Then
                Dim clip = g.Clip
                g.SetClip(path)
                Dim s = Math.Max(r.Width / img.Width, r.Height / img.Height)
                Dim w = CInt(img.Width * s), h = CInt(img.Height * s)
                g.InterpolationMode = InterpolationMode.HighQualityBicubic
                g.DrawImage(img, r.X + (r.Width - w) \ 2, r.Y + (r.Height - h) \ 2, w, h)
                g.Clip = clip
            Else
                Using f = Theme.IconFont(Math.Max(8.0F, r.Height / 3.0F)) : Theme.DrawCentered(g, Theme.IcPhoto, f, Theme.G400, r) : End Using
            End If
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, path) : End Using
        End Using
    End Sub
End Module

' ═══════════════════════════ pictures kept on the computer ═══════════════════════════
''' <summary>Pictures from the website (product photos, logos, avatars) are saved on the computer the first
''' time they are seen, so they show instantly — also offline. Local files (picked offline) load directly.</summary>
Public Module Img
    Private ReadOnly Mem As New Dictionary(Of String, Image)
    Private ReadOnly Loading As New Dictionary(Of String, List(Of Action(Of Image)))
    Private ReadOnly Dir_ As String = Path.Combine(Store.Folder, "img")

    Private Function Key(src As String, size As Integer) As String
        Return size & "|" & src
    End Function

    ''' <summary>The picture if it is ready now (else Nothing; `ready` runs on the UI thread when it is).</summary>
    Public Function [Get](src As String, size As Integer, ready As Action(Of Image)) As Image
        If String.IsNullOrEmpty(src) Then Return Nothing
        Dim k = Key(src, size)
        Dim im As Image = Nothing
        If Mem.TryGetValue(k, im) Then Return im
        Dim waiting As List(Of Action(Of Image)) = Nothing
        If Loading.TryGetValue(k, waiting) Then
            If ready IsNot Nothing Then waiting.Add(ready)
            Return Nothing
        End If
        waiting = New List(Of Action(Of Image))
        If ready IsNot Nothing Then waiting.Add(ready)
        Loading(k) = waiting
        Dim unused = LoadAsync(src, size, k)
        Return Nothing
    End Function

    Private Async Function LoadAsync(src As String, size As Integer, k As String) As Task
        Dim im As Image = Nothing
        Try
            Dim bytes As Byte() = Nothing
            If File.Exists(src) Then
                bytes = Await File.ReadAllBytesAsync(src)
            Else
                Dim url = AppState.I.Api.FileUrl(src)
                Directory.CreateDirectory(Dir_)
                Dim f = Path.Combine(Dir_, Store.Sha(url).Substring(0, 32) & ".bin")
                If File.Exists(f) Then
                    bytes = Await File.ReadAllBytesAsync(f)
                Else
                    bytes = Await AppState.I.Api.GetBytesAsync(url)
                    If bytes IsNot Nothing AndAlso bytes.Length > 0 Then Await File.WriteAllBytesAsync(f, bytes)
                End If
            End If
            If bytes IsNot Nothing AndAlso bytes.Length > 0 Then
                im = Await Task.Run(Function() Shrink(bytes, size))
            End If
        Catch
        End Try
        If im IsNot Nothing Then Mem(k) = im
        Dim waiting As List(Of Action(Of Image)) = Nothing
        If Loading.TryGetValue(k, waiting) Then
            Loading.Remove(k)
            If im IsNot Nothing Then
                For Each a In waiting
                    Try
                        a(im)
                    Catch
                    End Try
                Next
            End If
        End If
    End Function

    Private Function Shrink(bytes As Byte(), size As Integer) As Image
        Try
            Using ms As New MemoryStream(bytes)
                Using src = Image.FromStream(ms)
                    If size <= 0 OrElse (src.Width <= size AndAlso src.Height <= size) Then Return New Bitmap(src)
                    Dim s = Math.Min(size / src.Width, size / src.Height)
                    Dim bmp As New Bitmap(Math.Max(1, CInt(src.Width * s)), Math.Max(1, CInt(src.Height * s)))
                    Using g = Graphics.FromImage(bmp)
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic
                        g.DrawImage(src, 0, 0, bmp.Width, bmp.Height)
                    End Using
                    Return bmp
                End Using
            End Using
        Catch
            Return Nothing ' webp and other formats Windows can't open: placeholder instead
        End Try
    End Function
End Module

' ═══════════════════════════ the list table ═══════════════════════════
Public Enum CellKind
    Text
    Bold
    Link
    Pill
    PillMenu
    Badge
    Money
    Thumb
    Avatar
    Actions
    Toggle
    Custom
End Enum

''' <summary>One column of a list table.</summary>
Public Class TCol
    Public Header As String
    Public Width As Integer ' fixed px (0 = shares what's left by Flex)
    Public Flex As Integer = 1
    Public Kind As CellKind = CellKind.Text
    Public Right As Boolean
    Public Center As Boolean
    ''' <summary>Main text of the cell.</summary>
    Public Value As Func(Of JsonObject, String)
    ''' <summary>Small grey second line (optional).</summary>
    Public [Sub] As Func(Of JsonObject, String)
    ''' <summary>Pill / badge / text colour.</summary>
    Public Colour As Func(Of JsonObject, Color)
    ''' <summary>Picture (url or local path) for Thumb / Avatar.</summary>
    Public Picture As Func(Of JsonObject, String)
    ''' <summary>Sort value when the heading is clicked (Nothing = not sortable).</summary>
    Public Sort As Func(Of JsonObject, IComparable)
    ''' <summary>Row buttons for Actions: key, glyph, tip, colour.</summary>
    Public Buttons As New List(Of (Key As String, Glyph As String, Tip As String, Colour As Color))
    ''' <summary>Text shown on a button (a pill like "Collect"), by key; a function of the row for counts.</summary>
    Public ButtonText As New Dictionary(Of String, Func(Of JsonObject, String))
    ''' <summary>Which Actions buttons a row gets (Nothing = all).</summary>
    Public ButtonsFor As Func(Of JsonObject, IEnumerable(Of String))
    ''' <summary>Drawn by the page itself.</summary>
    Public Draw As Action(Of Graphics, Rectangle, JsonObject)
    Public Key As String

    Public Sub New(header As String, Optional value As Func(Of JsonObject, String) = Nothing, Optional width As Integer = 0, Optional kind As CellKind = CellKind.Text)
        Me.Header = header : Me.Value = value : Me.Width = width : Me.Kind = kind
    End Sub
    Public Function Text(r As JsonObject) As String
        Return If(Value Is Nothing, "", If(Value(r), ""))
    End Function
    ''' <summary>The website's IconAction colours: grey (view / print), blue (edit), red (delete), green (add), amber (warn).</summary>
    Public Shared Function WebTone(c As Color) As Color
        If c = Color.Empty Then Return Web.PillSecondary
        Dim hue = c.GetHue(), sat = c.GetSaturation()
        If sat < 0.2 Then Return Web.PillSecondary
        If hue >= 345 OrElse hue < 15 Then Return Web.PillDanger
        If hue >= 90 AndAlso hue < 170 Then Return Web.PillSuccess
        If hue >= 30 AndAlso hue < 60 Then Return Web.PillWarning
        If hue >= 190 AndAlso hue < 250 Then Return Web.PillPrimary
        Return c
    End Function

    Public Function WithSort(Optional f As Func(Of JsonObject, IComparable) = Nothing) As TCol
        If f IsNot Nothing Then
            Sort = f
        Else
            Sort = Function(r) CType(Text(r).ToLowerInvariant(), IComparable)
        End If
        Return Me
    End Function
    Public Function Btn(key As String, glyph As String, tip As String, Optional colour As Color = Nothing, Optional text As Func(Of JsonObject, String) = Nothing) As TCol
        Buttons.Add((key, glyph, tip, WebTone(colour)))
        If text IsNot Nothing Then ButtonText(key) = text
        Return Me
    End Function
End Class

''' <summary>The website's gridded table: sortable headings, a select column, pills, row buttons, hover.</summary>
Public Class WebTable
    Inherits Control
    Implements IFlowHeight
    Public Cols As New List(Of TCol)
    Public Rows As New List(Of JsonObject)
    Public Selectable As Boolean
    Public ReadOnly Selected As New HashSet(Of String)
    Public Property RowHeight As Integer = 52
    Public Property HeadHeight As Integer = 42
    Public EmptyText As String = "Nothing here yet."
    Public SortCol As TCol
    Public SortAsc As Boolean = True
    Public RowColour As Func(Of JsonObject, Color)
    Public Event RowClick(r As JsonObject)
    Public Event RowDoubleClick(r As JsonObject)
    Public Event CellClick(r As JsonObject, c As TCol, cell As Rectangle)
    ''' <summary>A click inside a Custom cell, with the cell and the point (both in the table's own coordinates).</summary>
    Public Event CellClickAt(r As JsonObject, c As TCol, cell As Rectangle, pt As Point)
    ''' <summary>The newer website tables (Orders…): light heading, uppercase 12px titles, lucide sort arrows, no
    ''' column lines or stripes, hairline rows, blue ticks.</summary>
    Public Modern As Boolean
    ''' <summary>DataTables look (Sales ledger): white header, normal-case bold labels with the sort icon at the right
    ''' of the column, zebra rows, no outer border.</summary>
    Public Ledger As Boolean
    ''' <summary>Bordered DataTables grid (Products): light grey header, cell borders, grey odd rows. Implies Ledger.</summary>
    Public Grid As Boolean
    Private Shared ReadOnly GridLine As Color = Color.FromArgb(&HDE, &HE2, &HE6)
    Private ReadOnly _gridHead As Font = Theme.Px(14, 700)
    Private ReadOnly _ledHead As Font = Theme.Px(13, 600)
    ''' <summary>Hand cursor over these spots of a Custom cell (cell and point in table coordinates).</summary>
    Public HotSpot As Func(Of JsonObject, TCol, Rectangle, Point, Boolean)
    Public Event ActionClick(r As JsonObject, key As String)
    Public Event SortChanged()
    Public Event SelectionChanged()
    Private _hoverRow As Integer = -1
    Private _hoverBtn As (Row As Integer, Key As String) = (-1, Nothing)
    Private ReadOnly _tip As New ToolTip()
    Private _tipText As String = ""

    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.Selectable, True)
        BackColor = Color.White
    End Sub

    Public Shared Function IdOf(r As JsonObject) As String
        Dim v = Js.Field(r, "id")
        If v Is Nothing Then v = Js.Field(r, "key")
        If v Is Nothing Then Return Js.Str(r, "localRef")
        Return v.ToJsonString().Trim(""""c)
    End Function

    ''' <summary>Room kept for at least this many rows (the website keeps the table's height while filtering).</summary>
    Public MinRows As Integer
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return HeadHeight + Math.Max(If(Rows.Count = 0, If(Modern, 120, 90), Rows.Count * RowHeight), MinRows * RowHeight) + 1
    End Function

    Private Function Widths() As List(Of Integer)
        Dim all As New List(Of TCol)(Cols)
        Dim fixedW = If(Selectable, 44, 0) + all.Where(Function(c) c.Width > 0).Sum(Function(c) c.Width)
        Dim flex = Math.Max(1, all.Where(Function(c) c.Width = 0).Sum(Function(c) c.Flex))
        Dim rest = Math.Max(0, Width - fixedW)
        Dim res As New List(Of Integer)
        For Each c In all
            res.Add(If(c.Width > 0, c.Width, Math.Max(60, rest * c.Flex \ flex)))
        Next
        Return res
    End Function

    Private Function ColRects() As List(Of (Col As TCol, X As Integer, W As Integer))
        Dim ws = Widths()
        Dim x = If(Selectable, 44, 0)
        Dim res As New List(Of (TCol, Integer, Integer))
        For k = 0 To Cols.Count - 1
            res.Add((Cols(k), x, ws(k)))
            x += ws(k)
        Next
        Return res
    End Function

    Private Shared ReadOnly BtnFont As Font = Theme.Px(13, 600)
    Private Shared Function BtnWidth(c As TCol, key As String, r As JsonObject) As Integer
        Dim f As Func(Of JsonObject, String) = Nothing
        If Not c.ButtonText.TryGetValue(key, f) Then Return 34
        Return 10 + 14 + 6 + Tr.MeasureText(f(r), BtnFont).Width + 10
    End Function

    Private Function BtnRects(c As TCol, r As JsonObject, cell As Rectangle) As List(Of (Key As String, Rect As Rectangle, Glyph As String, Tip As String, Colour As Color))
        Dim keys = If(c.ButtonsFor Is Nothing, c.Buttons.Select(Function(b) b.Key), c.ButtonsFor(r)).ToHashSet()
        Dim res As New List(Of (String, Rectangle, String, String, Color))
        Dim shown = c.Buttons.Where(Function(b) keys.Contains(b.Key)).ToList()
        ' the website's IconAction: 34px coloured squares (or a pill with its text), 6px apart
        Dim widths = shown.Select(Function(b) BtnWidth(c, b.Key, r)).ToList()
        Dim total = widths.Sum() + Math.Max(0, shown.Count - 1) * 6
        Dim x = If(c.Right, cell.Right - 10 - total, If(c.Center, cell.X + (cell.Width - total) \ 2, cell.X + 10))
        For k = 0 To shown.Count - 1
            Dim b = shown(k)
            res.Add((b.Key, New Rectangle(x, cell.Y + (cell.Height - 34) \ 2, widths(k), 34), b.Glyph, b.Tip, b.Colour))
            x += widths(k) + 6
        Next
        Return res
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Dim rects = ColRects()
        Dim border = Color.FromArgb(&HDE, &HE2, &HE6)
        ' heading
        If Modern Then
            PaintModern(g, e, rects)
            Return
        End If
        Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, 0, 0, Width, HeadHeight) : End Using
        If Selectable Then
            Dim all = Rows.Count > 0 AndAlso Rows.All(Function(r) Selected.Contains(IdOf(r)))
            Dim some = Not all AndAlso Rows.Any(Function(r) Selected.Contains(IdOf(r)))
            Gfx.Check(g, New Rectangle(14, HeadHeight \ 2 - 8, 16, 16), all, some)
        End If
        For Each c In rects
            Dim hr As New Rectangle(c.X + 10, 0, c.W - 20, HeadHeight)
            Dim flags = TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or If(c.Col.Right, TextFormatFlags.Right, If(c.Col.Center, TextFormatFlags.HorizontalCenter, TextFormatFlags.Left))
            Dim label = c.Col.Header
            If c.Col.Sort IsNot Nothing Then
                If c.Col Is SortCol Then label &= If(SortAsc, "  " & ChrW(&H25B2), "  " & ChrW(&H25BC)) Else label &= "  " & ChrW(&H21C5)
            End If
            Tr.DrawText(g, label, Theme.UiFont(8.75F, FontStyle.Bold), hr, If(c.Col Is SortCol, Theme.G900, Theme.G600), flags)
        Next
        Using p As New Pen(border)
            g.DrawLine(p, 0, HeadHeight - 1, Width, HeadHeight - 1)
        End Using
        If Rows.Count = 0 Then
            Tr.DrawText(g, EmptyText, Theme.Body, New Rectangle(0, HeadHeight, Width, 90), Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
            Using p As New Pen(border) : g.DrawRectangle(p, 0, 0, Width - 1, Height - 1) : End Using
            Return
        End If
        Dim clip = e.ClipRectangle
        Dim first = Math.Max(0, (clip.Top - HeadHeight) \ RowHeight)
        Dim last = Math.Min(Rows.Count - 1, (clip.Bottom - HeadHeight) \ RowHeight + 1)
        For i = first To last
            Dim r = Rows(i)
            Dim y = HeadHeight + i * RowHeight
            Dim sel = Selectable AndAlso Selected.Contains(IdOf(r))
            Dim bg = If(sel, Theme.PrimarySoft, If(i = _hoverRow, Color.FromArgb(&HF6, &HF7, &HF9), If(i Mod 2 = 1, Color.FromArgb(&HFC, &HFC, &HFD), Color.White)))
            If RowColour IsNot Nothing Then
                Dim rc = RowColour(r)
                If rc <> Color.Empty AndAlso Not sel Then bg = rc
            End If
            Using b As New SolidBrush(bg) : g.FillRectangle(b, 0, y, Width, RowHeight) : End Using
            If Selectable Then Gfx.Check(g, New Rectangle(14, y + RowHeight \ 2 - 8, 16, 16), sel)
            For Each c In rects
                Dim cell As New Rectangle(c.X, y, c.W, RowHeight)
                DrawCell(g, c.Col, r, cell, i)
            Next
            Using p As New Pen(border) : g.DrawLine(p, 0, y + RowHeight - 1, Width, y + RowHeight - 1) : End Using
        Next
        Using p As New Pen(Color.FromArgb(&HEE, &HEF, &HF2))
            For Each c In rects.Skip(1)
                g.DrawLine(p, c.X, 0, c.X, HeadHeight + Rows.Count * RowHeight)
            Next
            If Selectable Then g.DrawLine(p, 44, 0, 44, HeadHeight + Rows.Count * RowHeight)
        End Using
        Using p As New Pen(border) : g.DrawRectangle(p, 0, 0, Width - 1, Height - 1) : End Using
    End Sub

    Private ReadOnly _modHead As Font = Theme.Px(12, 600)
    Private Sub PaintModern(g As Graphics, e As PaintEventArgs, rects As List(Of (Col As TCol, X As Integer, W As Integer)))
        Theme.Smooth(g)
        If Grid Then Ledger = True
        Using b As New SolidBrush(If(Grid, Color.FromArgb(&HF8, &HF9, &HFA), If(Ledger, Color.White, Web.HeadBg))) : g.FillRectangle(b, 0, 0, Width, HeadHeight) : End Using
        If Selectable Then
            Dim all = Rows.Count > 0 AndAlso Rows.All(Function(r) Selected.Contains(IdOf(r)))
            Web.DrawCheck(g, New Rectangle(14, HeadHeight \ 2 - 8, 16, 16), all)
        End If
        For Each c In rects
            If Ledger Then
                Tr.DrawText(g, c.Col.Header, If(Grid, _gridHead, _ledHead), New Rectangle(c.X + 12, 0, c.W - 36, HeadHeight), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                If c.Col.Sort IsNot Nothing Then
                    Dim ic = If(c.Col Is SortCol, If(SortAsc, "arrow-up", "arrow-down"), "chevrons-up-down")
                    Icons.Draw(g, ic, New RectangleF(c.X + c.W - 24, HeadHeight \ 2 - 7, 14, 14), If(c.Col Is SortCol, Theme.G600, Theme.G300))
                End If
                Continue For
            End If
            Dim x = c.X + 12
            Tr.DrawSpaced(g, c.Col.Header.ToUpperInvariant(), _modHead, New Point(x, HeadHeight \ 2 - 8), If(c.Col Is SortCol, Theme.G800, Theme.G500), 0.6F)
            If c.Col.Sort IsNot Nothing Then
                Dim tw = 0
                For Each ch In c.Col.Header.ToUpperInvariant() : tw += Tr.MeasureText(g, ch.ToString(), _modHead, New Size(100, 100), TextFormatFlags.NoPadding).Width + 1 : Next
                Dim ic = If(c.Col Is SortCol, If(SortAsc, "arrow-up", "arrow-down"), "chevrons-up-down")
                Icons.Draw(g, ic, New RectangleF(x + tw + 5, HeadHeight \ 2 - 7, 14, 14), If(c.Col Is SortCol, Web.Blue, Theme.G300))
            End If
        Next
        Using p As New Pen(Color.FromArgb(&HE6, &HE8, &HEF)) : g.DrawLine(p, 0, HeadHeight - 1, Width, HeadHeight - 1) : End Using
        If Rows.Count = 0 Then
            Tr.DrawText(g, EmptyText, Theme.Px(14), New Rectangle(0, HeadHeight, Width, Height - HeadHeight), Theme.G500, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
        Else
            Dim clip = e.ClipRectangle
            Dim first = Math.Max(0, (clip.Top - HeadHeight) \ RowHeight)
            Dim last = Math.Min(Rows.Count - 1, (clip.Bottom - HeadHeight) \ RowHeight + 1)
            For i = first To last
                Dim r = Rows(i)
                Dim y = HeadHeight + i * RowHeight
                Dim sel = Selectable AndAlso Selected.Contains(IdOf(r))
                Dim bg = If(sel, Color.FromArgb(&HF1, &HF6, &HFF), If(i = _hoverRow, If(Ledger, Color.FromArgb(&HF3, &HFB, &HF7), Web.RowHover), If(Ledger AndAlso i Mod 2 = 1, Color.FromArgb(&HFA, &HFA, &HFB), Color.White)))
                If Grid AndAlso Not sel Then bg = If(i = _hoverRow, Color.FromArgb(&HEC, &HEC, &HEC), If(i Mod 2 = 0, Color.FromArgb(&HF2, &HF2, &HF2), Color.White))
                Using b As New SolidBrush(bg) : g.FillRectangle(b, 0, y, Width, RowHeight) : End Using
                If RowColour IsNot Nothing Then
                    Dim rc = RowColour(r)
                    If rc <> Color.Empty Then
                        Using b As New SolidBrush(rc) : g.FillRectangle(b, 0, y, 3, RowHeight) : End Using
                    End If
                End If
                If Selectable Then Web.DrawCheck(g, New Rectangle(14, y + RowHeight \ 2 - 8, 16, 16), sel)
                For Each c In rects
                    DrawCell(g, c.Col, r, New Rectangle(c.X + 2, y, c.W - 4, RowHeight), i)
                Next
                Using p As New Pen(Web.Line) : g.DrawLine(p, 0, y + RowHeight - 1, Width, y + RowHeight - 1) : End Using
            Next
        End If
        If Grid Then
            Dim bottom = If(Rows.Count = 0, Height - 1, Math.Min(Height - 1, HeadHeight + Rows.Count * RowHeight))
            Using pen As New Pen(GridLine)
                For y = HeadHeight To bottom Step RowHeight : g.DrawLine(pen, 0, y, Width, y) : Next
                If Selectable Then g.DrawLine(pen, 44, 0, 44, bottom)
                For Each c In rects : g.DrawLine(pen, c.X + c.W, 0, c.X + c.W, bottom) : Next
                g.DrawRectangle(pen, 0, 0, Width - 1, bottom)
            End Using
        End If
        If Ledger Then Return
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using pen As New Pen(Web.Line) : g.DrawPath(pen, p) : End Using
        End Using
    End Sub

    Private Sub DrawCell(g As Graphics, c As TCol, r As JsonObject, cell As Rectangle, rowIndex As Integer)
        Dim inner As New Rectangle(cell.X + 10, cell.Y, cell.Width - 20, cell.Height)
        Dim hAlign = If(c.Right, TextFormatFlags.Right, If(c.Center, TextFormatFlags.HorizontalCenter, TextFormatFlags.Left))
        Dim txt = c.Text(r)
        Dim subText = If(c.Sub Is Nothing, "", If(c.Sub(r), ""))
        Select Case c.Kind
            Case CellKind.Custom
                c.Draw?.Invoke(g, inner, r)
            Case CellKind.Pill, CellKind.PillMenu
                If txt = "" Then Return
                Dim col = If(c.Colour Is Nothing, Fmt.StatusColor(txt), c.Colour(r))
                Dim w = Gfx.PillWidth(txt, c.Kind = CellKind.PillMenu)
                Dim x = If(c.Right, inner.Right - w, If(c.Center, inner.X + (inner.Width - w) \ 2, inner.X))
                Dim cy = cell.Y + cell.Height \ 2 - If(subText <> "", 8, 0)
                Gfx.Pill(g, txt, x, cy, col, c.Kind = CellKind.PillMenu)
                If subText <> "" Then Tr.DrawText(g, subText, Theme.Small, New Rectangle(inner.X, cy + 13, inner.Width, 16), Theme.G500, hAlign Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            Case CellKind.Badge
                If txt = "" Then Return
                Dim col = If(c.Colour Is Nothing, Theme.Primary, c.Colour(r))
                Dim w = Tr.MeasureText(txt, Theme.UiFont(8.0F, FontStyle.Bold)).Width + 12
                Dim x = If(c.Right, inner.Right - w, If(c.Center, inner.X + (inner.Width - w) \ 2, inner.X))
                Gfx.Badge(g, txt, x, cell.Y + cell.Height \ 2, col, Theme.Tint(col, 30))
            Case CellKind.Toggle
                Dim on_ = txt = "1" OrElse txt.ToLowerInvariant() = "true"
                Dim tr As New Rectangle(If(c.Center, inner.X + (inner.Width - 36) \ 2, inner.X), cell.Y + cell.Height \ 2 - 10, 36, 20)
                Gfx.Toggle(g, tr, on_)
            Case CellKind.Thumb, CellKind.Avatar
                Dim sz = Math.Min(cell.Height - 12, 40)
                Dim pr As New Rectangle(inner.X, cell.Y + (cell.Height - sz) \ 2, sz, sz)
                Dim src = If(c.Picture Is Nothing, "", c.Picture(r))
                Dim idx = rowIndex
                Dim im = Img.Get(src, 96, Sub(x) If Not IsDisposed Then Invalidate(New Rectangle(0, HeadHeight + idx * RowHeight, Width, RowHeight)))
                If c.Kind = CellKind.Avatar Then Gfx.Avatar(g, pr, txt, im) Else Gfx.Thumb(g, pr, im)
                If txt <> "" OrElse subText <> "" Then
                    Dim tx As New Rectangle(pr.Right + 10, cell.Y, inner.Right - pr.Right - 10, cell.Height)
                    DrawTwoLines(g, tx, txt, subText, Theme.BodyBold, Theme.G900, TextFormatFlags.Left)
                End If
            Case CellKind.Actions
                For Each b In BtnRects(c, r, cell)
                    Dim hot = _hoverBtn.Row = rowIndex AndAlso _hoverBtn.Key = b.Key
                    Using p = Theme.RoundRect(New RectangleF(b.Rect.X, b.Rect.Y, b.Rect.Width, b.Rect.Height), Theme.Radius)
                        Using br As New SolidBrush(If(hot, Color.FromArgb(217, b.Colour), b.Colour)) : g.FillPath(br, p) : End Using
                    End Using
                    Dim fg = If(b.Colour = Web.PillWarning, Theme.G800, Color.White)
                    Dim label As Func(Of JsonObject, String) = Nothing
                    Dim hasText = c.ButtonText.TryGetValue(b.Key, label)
                    Dim ir = If(hasText, New RectangleF(b.Rect.X + 10, b.Rect.Y + 10, 14, 14), New RectangleF(b.Rect.X + 10, b.Rect.Y + 10, 14, 14))
                    If Icons.Has(b.Glyph) Then
                        Icons.Draw(g, b.Glyph, ir, fg)
                    Else
                        Using f = Theme.IconFont(9.5F) : Theme.DrawCentered(g, b.Glyph, f, fg, Rectangle.Round(ir)) : End Using
                    End If
                    If hasText Then Tr.DrawText(g, label(r), BtnFont, New Rectangle(b.Rect.X + 30, b.Rect.Y, b.Rect.Width - 34, b.Rect.Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                Next
            Case Else
                Dim font = If(c.Kind = CellKind.Bold OrElse c.Kind = CellKind.Link OrElse c.Kind = CellKind.Money, Theme.BodyBold, Theme.Body)
                Dim col = If(c.Colour IsNot Nothing, c.Colour(r), If(c.Kind = CellKind.Link, Theme.Primary, If(c.Kind = CellKind.Bold OrElse c.Kind = CellKind.Money, Theme.G900, Theme.G700)))
                DrawTwoLines(g, inner, txt, subText, font, col, hAlign)
        End Select
    End Sub

    Private Shared Sub DrawTwoLines(g As Graphics, r As Rectangle, main As String, second As String, font As Font, col As Color, align As TextFormatFlags)
        Dim flags = align Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or TextFormatFlags.SingleLine
        If second = "" Then
            Tr.DrawText(g, main, font, r, col, flags Or TextFormatFlags.VerticalCenter)
        Else
            Dim mid = r.Y + r.Height \ 2
            Tr.DrawText(g, main, font, New Rectangle(r.X, mid - 19, r.Width, 19), col, flags Or TextFormatFlags.Bottom)
            Tr.DrawText(g, second, Theme.Small, New Rectangle(r.X, mid + 1, r.Width, 18), Theme.G500, flags Or TextFormatFlags.Top)
        End If
    End Sub

    Private Function RowAt(y As Integer) As Integer
        If y < HeadHeight Then Return -1
        Dim i = (y - HeadHeight) \ RowHeight
        Return If(i >= 0 AndAlso i < Rows.Count, i, -1)
    End Function

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim i = RowAt(e.Y)
        Dim hb As (Integer, String) = (-1, Nothing)
        Dim tip = ""
        Dim hand = e.Y < HeadHeight
        If i >= 0 Then
            For Each c In ColRects()
                If e.X < c.X OrElse e.X >= c.X + c.W Then Continue For
                Dim cell As New Rectangle(c.X, HeadHeight + i * RowHeight, c.W, RowHeight)
                If c.Col.Kind = CellKind.Actions Then
                    For Each b In BtnRects(c.Col, Rows(i), cell)
                        If b.Rect.Contains(e.Location) Then hb = (i, b.Key) : tip = b.Tip : hand = True
                    Next
                ElseIf c.Col.Kind = CellKind.PillMenu OrElse c.Col.Kind = CellKind.Toggle OrElse c.Col.Kind = CellKind.Link Then
                    hand = True
                ElseIf c.Col.Kind = CellKind.Custom AndAlso HotSpot IsNot Nothing Then
                    Dim inner = If(Modern, New Rectangle(cell.X + 12, cell.Y, cell.Width - 24, cell.Height), New Rectangle(cell.X + 10, cell.Y, cell.Width - 20, cell.Height))
                    If HotSpot(Rows(i), c.Col, inner, e.Location) Then hand = True : HoverPoint = e.Location
                End If
            Next
            If _rowClickable Then hand = True
        End If
        Cursor = If(hand, Cursors.Hand, Cursors.Default)
        If i <> _hoverRow OrElse hb.Item1 <> _hoverBtn.Row OrElse hb.Item2 <> _hoverBtn.Key Then
            Dim old = _hoverRow
            _hoverRow = i
            _hoverBtn = hb
            InvalidateRow(old) : InvalidateRow(i)
        End If
        If tip <> _tipText Then
            _tipText = tip
            If tip = "" Then _tip.Hide(Me) Else _tip.Show(tip, Me, e.X + 12, e.Y + 18, 2500)
        End If
    End Sub

    ''' <summary>Where the mouse is over the table (Custom cells use it for hover looks).</summary>
    Public HoverPoint As Point
    Private _rowClickable As Boolean
    ''' <summary>The whole row opens something (pointer cursor over rows).</summary>
    Public Property RowClickable As Boolean
        Get
            Return _rowClickable
        End Get
        Set(value As Boolean)
            _rowClickable = value
        End Set
    End Property

    Private Sub InvalidateRow(i As Integer)
        If i >= 0 Then Invalidate(New Rectangle(0, HeadHeight + i * RowHeight, Width, RowHeight))
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        Dim old = _hoverRow
        _hoverRow = -1
        _hoverBtn = (-1, Nothing)
        InvalidateRow(old)
        _tip.Hide(Me)
        _tipText = ""
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        If e.Button <> MouseButtons.Left Then Return
        If e.Y < HeadHeight Then
            If Selectable AndAlso e.X < 44 Then
                Dim all = Rows.Count > 0 AndAlso Rows.All(Function(r) Selected.Contains(IdOf(r)))
                For Each r In Rows
                    If all Then Selected.Remove(IdOf(r)) Else Selected.Add(IdOf(r))
                Next
                Invalidate()
                RaiseEvent SelectionChanged()
                Return
            End If
            For Each c In ColRects()
                If e.X >= c.X AndAlso e.X < c.X + c.W AndAlso c.Col.Sort IsNot Nothing Then
                    If SortCol Is c.Col Then SortAsc = Not SortAsc Else SortCol = c.Col : SortAsc = True
                    RaiseEvent SortChanged()
                    Return
                End If
            Next
            Return
        End If
        Dim i = RowAt(e.Y)
        If i < 0 Then Return
        Dim row = Rows(i)
        If Selectable AndAlso e.X < 44 Then
            Dim id = IdOf(row)
            If Selected.Contains(id) Then Selected.Remove(id) Else Selected.Add(id)
            InvalidateRow(i)
            Invalidate(New Rectangle(0, 0, 44, HeadHeight))
            RaiseEvent SelectionChanged()
            Return
        End If
        For Each c In ColRects()
            If e.X < c.X OrElse e.X >= c.X + c.W Then Continue For
            Dim cell As New Rectangle(c.X, HeadHeight + i * RowHeight, c.W, RowHeight)
            If c.Col.Kind = CellKind.Actions Then
                For Each b In BtnRects(c.Col, row, cell)
                    If b.Rect.Contains(e.Location) Then
                        RaiseEvent ActionClick(row, b.Key)
                        Return
                    End If
                Next
                Return
            End If
            If c.Col.Kind = CellKind.Custom Then
                Dim inner As New Rectangle(cell.X + 10, cell.Y, cell.Width - 20, cell.Height)
                If Modern Then inner = New Rectangle(cell.X + 12, cell.Y, cell.Width - 24, cell.Height)
                If HotSpot IsNot Nothing AndAlso HotSpot(row, c.Col, inner, e.Location) Then
                    RaiseEvent CellClickAt(row, c.Col, inner, e.Location)
                    Return
                End If
            End If
            If c.Col.Kind = CellKind.PillMenu OrElse c.Col.Kind = CellKind.Toggle OrElse c.Col.Kind = CellKind.Link OrElse c.Col.Kind = CellKind.Custom Then
                RaiseEvent CellClick(row, c.Col, RectangleToScreen(cell))
                If c.Col.Kind <> CellKind.Custom Then Return
            End If
        Next
        RaiseEvent RowClick(row)
    End Sub

    Protected Overrides Sub OnMouseDoubleClick(e As MouseEventArgs)
        MyBase.OnMouseDoubleClick(e)
        Dim i = RowAt(e.Y)
        If i >= 0 AndAlso Not (Selectable AndAlso e.X < 44) Then RaiseEvent RowDoubleClick(Rows(i))
    End Sub
End Class

''' <summary>The website's list card: "Show [n] entries · Select All (n) · Bulk Actions · Clear filters ·· search",
''' the table, and "Showing a–b of n (filtered from m total entries)" with page buttons.</summary>
Public Class ListCard
    Inherits Card
    Implements IFlowHeight
    Public ReadOnly Table As New WebTable()
    Public ReadOnly Search As WInput = WInput.Make("Search...", Theme.IcSearch)
    Private ReadOnly _per As ComboBox = Ui.Combo({"10", "25", "50", "100", "All"}, 70)
    Private ReadOnly _bulk As WButton = WButton.Make("Bulk Actions", ChrW(&HE8FD), Theme.Primary, outline:=True)
    Private ReadOnly _clearSel As New LinkLabel With {.Text = "Clear selection", .AutoSize = True, .LinkColor = Theme.G500, .ActiveLinkColor = Theme.G700, .LinkBehavior = LinkBehavior.HoverUnderline, .Font = Theme.Body}
    Private ReadOnly _clearFilters As New LinkLabel With {.Text = "✕ Clear filters", .AutoSize = True, .LinkColor = Theme.Blue, .ActiveLinkColor = Theme.Blue, .LinkBehavior = LinkBehavior.HoverUnderline, .Font = Theme.BodyBold}
    Private ReadOnly _selectAll As New CheckBox With {.Text = "Select All (0)", .AutoSize = True, .Font = Theme.Body, .ForeColor = Theme.G800, .BackColor = Color.White}
    Private ReadOnly _showL As New Label With {.Text = "Show", .AutoSize = True, .Font = Theme.Body, .ForeColor = Theme.G800, .BackColor = Color.White}
    Private ReadOnly _entriesL As New Label With {.Text = "entries", .AutoSize = True, .Font = Theme.Body, .ForeColor = Theme.G800, .BackColor = Color.White}
    Private ReadOnly _info As New Label With {.AutoSize = True, .Font = Theme.Body, .ForeColor = Theme.G700, .BackColor = Color.White}
    Private ReadOnly _pager As New FlowLayoutPanel With {.FlowDirection = FlowDirection.LeftToRight, .WrapContents = False, .BackColor = Color.White, .AutoSize = True}
    Private ReadOnly _extra As New HRow(8)
    Private _all As New List(Of JsonObject)
    Private _total As Integer
    Private _page As Integer
    Private _perN As Integer = 25
    Private _filtersOn As Boolean
    Private _searchOn As Boolean = True
    Private _building As Boolean

    ''' <summary>Bulk Actions menu for the selected rows: key|label (or "-" for a line, "!key|label" for red).</summary>
    Public BulkItems As New List(Of String)
    Public Event Bulk(key As String, rows As List(Of JsonObject))
    Public Event ClearFilters()
    Public Event SearchChanged()
    Public Property StateKey As String

    Public Sub New(Optional stateKey As String = Nothing)
        Me.StateKey = stateKey
        Padding = New Padding(16)
        Search.Width = 260
        Controls.AddRange(New Control() {_showL, _per, _entriesL, _selectAll, _bulk, _clearSel, _clearFilters, Search, Table, _info, _pager, _extra})
        _per.SelectedIndex = 1
        If stateKey IsNot Nothing Then
            Dim saved = Js.Int(Store.Read("list_" & stateKey), "per", 25)
            _perN = saved
            _per.SelectedIndex = Math.Max(0, Array.IndexOf({10, 25, 50, 100, 0}, saved))
        End If
        AddHandler _per.SelectedIndexChanged, Sub()
                                                  _perN = {10, 25, 50, 100, 0}(_per.SelectedIndex)
                                                  _page = 0
                                                  If Me.StateKey IsNot Nothing Then Store.Write("list_" & Me.StateKey, New JsonObject From {{"per", _perN}})
                                                  Rebuild()
                                              End Sub
        AddHandler _selectAll.Click, Sub()
                                         Dim allOn = _all.Count > 0 AndAlso _all.All(Function(r) Table.Selected.Contains(WebTable.IdOf(r)))
                                         For Each r In _all
                                             If allOn Then Table.Selected.Remove(WebTable.IdOf(r)) Else Table.Selected.Add(WebTable.IdOf(r))
                                         Next
                                         SyncSelection()
                                         Table.Invalidate()
                                     End Sub
        AddHandler Table.SelectionChanged, Sub() SyncSelection()
        AddHandler Table.SortChanged, Sub() Rebuild()
        AddHandler _clearSel.LinkClicked, Sub()
                                              Table.Selected.Clear()
                                              SyncSelection()
                                              Table.Invalidate()
                                          End Sub
        AddHandler _clearFilters.LinkClicked, Sub() RaiseEvent ClearFilters()
        AddHandler _bulk.Click, AddressOf ShowBulk
        AddHandler Search.TextChanged, Sub() RaiseEvent SearchChanged()
        Selectable = False
    End Sub

    Public Property Selectable As Boolean
        Get
            Return Table.Selectable
        End Get
        Set(value As Boolean)
            Table.Selectable = value
            _selectAll.Visible = value
            _bulk.Visible = value AndAlso BulkItems.Count > 0
        End Set
    End Property

    Public Property ShowSearch As Boolean
        Get
            Return _searchOn
        End Get
        Set(value As Boolean)
            _searchOn = value
            Search.Visible = value
        End Set
    End Property

    ''' <summary>Extra controls on the toolbar (left, after the standard ones).</summary>
    Public Function AddTool(Of T As Control)(c As T) As T
        _extra.Controls.Add(c)
        Return c
    End Function

    Public ReadOnly Property Query As String
        Get
            Return Search.Text.Trim().ToLowerInvariant()
        End Get
    End Property

    ''' <summary>True when the row matches the search box (any of the texts contains it).</summary>
    Public Function Matches(ParamArray texts As String()) As Boolean
        Dim q = Query
        If q = "" Then Return True
        For Each t In texts
            If t IsNot Nothing AndAlso t.ToLowerInvariant().Contains(q) Then Return True
        Next
        Return False
    End Function

    Public ReadOnly Property SelectedRows As List(Of JsonObject)
        Get
            Return _all.Where(Function(r) Table.Selected.Contains(WebTable.IdOf(r))).ToList()
        End Get
    End Property

    ''' <summary>Give the rows after the page's filters (total = before filters). Page / sort / selection stay.</summary>
    Public Sub SetRows(rows As List(Of JsonObject), total As Integer, Optional filtersOn As Boolean = False)
        _all = rows
        _total = total
        _filtersOn = filtersOn OrElse Query <> ""
        Dim ids = rows.Select(Function(r) WebTable.IdOf(r)).ToHashSet()
        Table.Selected.RemoveWhere(Function(id) Not ids.Contains(id))
        Rebuild()
    End Sub

    Public Sub ResetPage()
        _page = 0
    End Sub

    Private Sub SyncSelection()
        _selectAll.Checked = _all.Count > 0 AndAlso _all.All(Function(r) Table.Selected.Contains(WebTable.IdOf(r)))
        _selectAll.Text = "Select All (" & Table.Selected.Count & ")"
        _bulk.Text = If(Table.Selected.Count = 0, "Bulk Actions", "Bulk Actions (" & Table.Selected.Count & ")")
        _bulk.Width = _bulk.PreferredWidth()
        _bulk.Enabled = Table.Selected.Count > 0
        _clearSel.Visible = Table.Selected.Count > 0
        PerformLayout()
    End Sub

    Private Sub Rebuild()
        Dim rows = _all
        If Table.SortCol IsNot Nothing AndAlso Table.SortCol.Sort IsNot Nothing Then
            Dim key = Table.SortCol.Sort
            rows = If(Table.SortAsc, rows.OrderBy(Function(r) key(r)).ToList(), rows.OrderByDescending(Function(r) key(r)).ToList())
        End If
        Dim pages = If(_perN = 0, 1, Math.Max(1, CInt(Math.Ceiling(rows.Count / _perN))))
        If _page >= pages Then _page = pages - 1
        Table.Rows = If(_perN = 0, rows, rows.Skip(_page * _perN).Take(_perN).ToList())
        Dim a = If(rows.Count = 0, 0, _page * If(_perN = 0, 0, _perN) + 1)
        Dim b = If(_perN = 0, rows.Count, Math.Min(rows.Count, (_page + 1) * _perN))
        Dim filtered = If(rows.Count <> _total, " (filtered from " & _total.ToString("#,##0") & " total entries)", "")
        _info.Text = If(_perN = 0 OrElse rows.Count = 0, "Showing " & rows.Count.ToString("#,##0") & " entries" & filtered, "Showing " & a.ToString("#,##0") & " to " & b.ToString("#,##0") & " of " & rows.Count.ToString("#,##0") & " entries" & filtered)
        _clearFilters.Visible = _filtersOn
        BuildPager(pages)
        SyncSelection()
        Table.Invalidate()
        ' Height changes with the number of rows: the page lays itself out again.
        Dim sp = FindScrollPage()
        If sp IsNot Nothing Then sp.Relayout() Else PerformLayout()
    End Sub

    Private Function FindScrollPage() As ScrollPage
        Dim p = Parent
        While p IsNot Nothing
            If TypeOf p Is ScrollPage Then Return DirectCast(p, ScrollPage)
            p = p.Parent
        End While
        Return Nothing
    End Function

    Private Sub BuildPager(pages As Integer)
        _pager.SuspendLayout()
        For Each c As Control In _pager.Controls.Cast(Of Control)().ToList() : c.Dispose() : Next
        _pager.Controls.Clear()
        If pages > 1 Then
            _pager.Controls.Add(PageBtn("Previous", _page - 1, _page > 0, False))
            Dim shown As New SortedSet(Of Integer) From {0, pages - 1, _page, Math.Max(0, _page - 1), Math.Min(pages - 1, _page + 1)}
            Dim last = -1
            For Each p In shown
                If last >= 0 AndAlso p > last + 1 Then _pager.Controls.Add(New Label With {.Text = "…", .AutoSize = False, .Width = 22, .Height = 32, .TextAlign = ContentAlignment.MiddleCenter, .ForeColor = Theme.G500})
                _pager.Controls.Add(PageBtn((p + 1).ToString(), p, True, p = _page))
                last = p
            Next
            _pager.Controls.Add(PageBtn("Next", _page + 1, _page < pages - 1, False))
        End If
        _pager.ResumeLayout()
    End Sub

    Private Function PageBtn(text As String, target As Integer, enabled As Boolean, current As Boolean) As WButton
        Dim b = WButton.Make(text, "", Theme.Primary, outline:=Not current)
        b.Height = 32
        b.Width = Math.Max(34, b.PreferredWidth() - 6)
        b.Margin = New Padding(0, 0, 4, 0)
        b.Enabled = enabled
        AddHandler b.Click, Sub()
                                If Not enabled OrElse current Then Return
                                _page = target
                                Rebuild()
                            End Sub
        Return b
    End Function

    Private Sub ShowBulk(sender As Object, e As EventArgs)
        If Table.Selected.Count = 0 OrElse BulkItems.Count = 0 Then Return
        Dim rows = SelectedRows
        Ui.PopMenu(_bulk, BulkItems, Sub(k) RaiseEvent Bulk(k, rows))
    End Sub

    Private Const ToolH As Integer = 38
    Private Function ToolRows(width As Integer) As Integer
        ' toolbar wraps below the search box when narrow
        Return If(width < 760, 2, 1)
    End Function

    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Dim extraH = If(_extra.Controls.Count > 0, _extra.HeightFor(width - Padding.Horizontal) + 10, 0)
        Return Padding.Top + ToolRows(width) * (ToolH + 10) + extraH + Table.HeightFor(width) + 12 + 34 + Padding.Bottom
    End Function

    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        If Table Is Nothing Then Return
        If _building Then Return
        Dim w = Width - Padding.Horizontal
        Dim x = Padding.Left, y = Padding.Top
        Dim cy = Function(h As Integer) y + (ToolH - h) \ 2
        _showL.Location = New Point(x, cy(_showL.Height)) : x += _showL.Width + 4
        _per.Location = New Point(x, cy(_per.Height)) : x += _per.Width + 4
        _entriesL.Location = New Point(x, cy(_entriesL.Height)) : x += _entriesL.Width + 16
        If _selectAll.Visible Then _selectAll.Location = New Point(x, cy(_selectAll.Height)) : x += _selectAll.Width + 12
        If _bulk.Visible Then _bulk.Location = New Point(x, cy(_bulk.Height)) : x += _bulk.Width + 12
        If _clearSel.Visible Then _clearSel.Location = New Point(x, cy(_clearSel.Height)) : x += _clearSel.Width + 12
        If _clearFilters.Visible Then _clearFilters.Location = New Point(x, cy(_clearFilters.Height)) : x += _clearFilters.Width + 12
        If ToolRows(Width) = 2 Then
            y += ToolH + 10
            Search.SetBounds(Padding.Left, y, w, ToolH)
        Else
            Search.SetBounds(Width - Padding.Right - Search.Width, y, Search.Width, ToolH)
        End If
        y += ToolH + 10
        If _extra.Controls.Count > 0 Then
            Dim eh = _extra.HeightFor(w)
            _extra.SetBounds(Padding.Left, y, w, eh)
            y += eh + 10
        Else
            _extra.SetBounds(0, 0, 0, 0)
        End If
        Table.SetBounds(Padding.Left, y, w, Table.HeightFor(w))
        y += Table.Height + 12
        _info.Location = New Point(Padding.Left, y + 8)
        _pager.Location = New Point(Width - Padding.Right - _pager.PreferredSize.Width, y)
    End Sub
End Class

' ═══════════════════════════ date range bar ═══════════════════════════
''' <summary>The website's range buttons (Today · Yesterday · 7 days · 30 days · This month · Last month · Custom)
''' with the dates shown. Fixed widths: nothing jumps when switching.</summary>
Public Class RangeBar
    Inherits Control
    Public Shared ReadOnly Presets As String() = {"today|Today", "yesterday|Yesterday", "7d|7 Days", "week|This Week", "30d|30 Days", "this_month|This Month", "prev_month|Last Month", "this_year|This Year", "all|All Time", "custom|Custom"}
    Public Keys As New List(Of String)
    Public Current As String = "this_month"
    Public CustomFrom As DateTime = DateTime.Today.AddDays(-30)
    Public CustomTo As DateTime = DateTime.Today
    Public Event Changed()
    Private _rects As New List(Of (Key As String, R As Rectangle))
    Private _hover As String = ""
    Public ShowDates As Boolean = True
    Private _lastWant As Integer = -1

    Public Sub New(Optional keys As String = "today,yesterday,7d,30d,this_month,prev_month,custom", Optional current As String = "this_month")
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Me.Keys = keys.Split(","c).ToList()
        Me.Current = current
        Height = 36
        Cursor = Cursors.Hand
        Width = PreferredW()
    End Sub

    Public Shared Function Label(k As String) As String
        For Each p In Presets
            If p.StartsWith(k & "|") Then Return p.Substring(k.Length + 1)
        Next
        Return k
    End Function

    Private Shared ReadOnly ChipFont As Font = Theme.Px(13, 500)
    Private Shared ReadOnly ShowFont As Font = Theme.Px(14)
    Private Shared ReadOnly ShowBold As Font = Theme.Px(14, 700)

    Private Function ChipText(k As String) As String
        If k = "custom" AndAlso Current = "custom" Then Return Fmt.Day(CustomFrom) & " – " & Fmt.Day(CustomTo)
        Return Label(k)
    End Function

    Private Function BtnW(k As String) As Integer
        Return Tr.MeasureText(ChipText(k), ChipFont).Width + 24 + If(k = "custom", 20, 0)
    End Function

    ''' <summary>"Showing: This Month" (the website's range bar), shown before the chips.</summary>
    Private Function ShowingW() As Integer
        If Not ShowDates Then Return 0
        Return 24 + Tr.MeasureText("Showing:", ShowFont).Width + 6 + Tr.MeasureText(If(Current = "custom", "Custom dates", Label(Current)), ShowBold).Width + 16
    End Function

    Public Function PreferredW() As Integer
        Return ShowingW() + Keys.Sum(Function(k) BtnW(k) + 6)
    End Function

    Public ReadOnly Property From As DateTime?
        Get
            Return Bounds_().Item1
        End Get
    End Property
    Public ReadOnly Property [To] As DateTime?
        Get
            Return Bounds_().Item2
        End Get
    End Property

    ''' <summary>First and last day of the chosen range (Nothing = no limit).</summary>
    Public Function Bounds_() As (DateTime?, DateTime?)
        Return RangeOf(Current, CustomFrom, CustomTo)
    End Function

    Public Shared Function RangeOf(k As String, cf As DateTime, ct As DateTime) As (DateTime?, DateTime?)
        Dim t = DateTime.Today
        Select Case k
            Case "today" : Return (t, t)
            Case "yesterday" : Return (t.AddDays(-1), t.AddDays(-1))
            Case "7d" : Return (t.AddDays(-6), t)
            Case "week" : Return (t.AddDays(-CInt(t.DayOfWeek)), t)
            Case "30d" : Return (t.AddDays(-29), t)
            Case "this_month" : Return (New DateTime(t.Year, t.Month, 1), t)
            Case "prev_month"
                Dim f = New DateTime(t.Year, t.Month, 1).AddMonths(-1)
                Return (f, f.AddMonths(1).AddDays(-1))
            Case "this_year" : Return (New DateTime(t.Year, 1, 1), t)
            Case "last_year" : Return (New DateTime(t.Year - 1, 1, 1), New DateTime(t.Year - 1, 12, 31))
            Case "custom" : Return (cf.Date, ct.Date)
            Case Else : Return (Nothing, Nothing)
        End Select
    End Function

    Public Function Contains(d As DateTime?) As Boolean
        If Not d.HasValue Then Return Current = "all"
        Dim b = Bounds_()
        If b.Item1.HasValue AndAlso d.Value.Date < b.Item1.Value Then Return False
        If b.Item2.HasValue AndAlso d.Value.Date > b.Item2.Value Then Return False
        Return True
    End Function

    ''' <summary>The previous range of the same length (for "vs. previous period").</summary>
    Public Function Previous() As (DateTime?, DateTime?)
        Dim b = Bounds_()
        If Not b.Item1.HasValue OrElse Not b.Item2.HasValue Then Return (Nothing, Nothing)
        If Current = "this_month" OrElse Current = "prev_month" Then
            Dim f = New DateTime(b.Item1.Value.Year, b.Item1.Value.Month, 1).AddMonths(-1)
            Return (f, f.AddDays((b.Item2.Value - b.Item1.Value).Days))
        End If
        Dim days = (b.Item2.Value - b.Item1.Value).Days + 1
        Return (b.Item1.Value.AddDays(-days), b.Item1.Value.AddDays(-1))
    End Function

    Public ReadOnly Property Text_ As String
        Get
            Dim b = Bounds_()
            If Not b.Item1.HasValue Then Return "All time"
            If b.Item1 = b.Item2 Then Return Fmt.Day(b.Item1)
            Return Fmt.Day(b.Item1) & " – " & Fmt.Day(b.Item2)
        End Get
    End Property

    ''' <summary>Query for the website's report APIs (range=… or from=…&amp;to=…).</summary>
    Public Function QueryString() As String
        If Current = "custom" Then Return "range=custom&from=" & CustomFrom.ToString("yyyy-MM-dd") & "&to=" & CustomTo.ToString("yyyy-MM-dd")
        Return "range=" & Current
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        ' Resize only when the wanted width itself changes (e.g. a new range label) — never just because the parent
        ' gave a different width, or paint and layout would keep undoing each other (the Due page hung on this).
        Dim want = PreferredW()
        If want <> _lastWant Then
            _lastWant = want
            If Width <> want Then BeginInvoke(Sub()
                                                  Width = want
                                                  Parent?.PerformLayout()
                                              End Sub)
        End If
        _rects = New List(Of (String, Rectangle))
        Dim x = 0
        If ShowDates Then
            Icons.Draw(g, "calendar-days", New RectangleF(0, (Height - 16) / 2.0F, 16, 16), Theme.G500)
            x = 24
            Tr.DrawText(g, "Showing:", ShowFont, New Rectangle(x, 0, 200, Height), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            x += Tr.MeasureText("Showing:", ShowFont).Width + 6
            Dim t = If(Current = "custom", "Custom dates", Label(Current))
            Tr.DrawText(g, t, ShowBold, New Rectangle(x, 0, 300, Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            x += Tr.MeasureText(t, ShowBold).Width + 16
        End If
        For Each k In Keys
            Dim w = BtnW(k)
            Dim r As New Rectangle(x, (Height - 32) \ 2, w, 32)
            Dim on_ = k = Current
            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y, r.Width, r.Height), Theme.Radius)
                Using b As New SolidBrush(If(on_, Web.Blue, If(k = _hover, Theme.G200, Theme.G100))) : g.FillPath(b, p) : End Using
            End Using
            Dim tx = r.X + 12
            If k = "custom" Then
                Icons.Draw(g, "calendar", New RectangleF(tx, r.Y + 9, 14, 14), If(on_, Color.White, Theme.G700))
                tx += 20
            End If
            Tr.DrawText(g, ChipText(k), ChipFont, New Rectangle(tx, r.Y, w, 32), If(on_, Color.White, Theme.G700), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            _rects.Add((k, r))
            x += w + 6
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim k = ""
        For Each r In _rects
            If r.R.Contains(e.Location) Then k = r.Key
        Next
        If k <> _hover Then _hover = k : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = "" : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each r In _rects
            If Not r.R.Contains(e.Location) Then Continue For
            If r.Key = "custom" Then
                Dim picked = Dialogs.PickRange(FindForm(), CustomFrom, CustomTo)
                If Not picked.HasValue Then Return
                CustomFrom = picked.Value.Item1 : CustomTo = picked.Value.Item2
            ElseIf r.Key = Current Then
                Return
            End If
            Current = r.Key
            Invalidate()
            RaiseEvent Changed()
            Return
        Next
    End Sub
End Class

' ═══════════════════════════ tabs ═══════════════════════════
''' <summary>The website's underlined tabs (with counts). Fixed widths: no jumping.</summary>
Public Class Tabs
    Inherits Control
    Public Items As New List(Of (Key As String, Label As String))
    Public Counts As New Dictionary(Of String, Integer)
    Public Current As String
    Public Event Changed()
    Private _rects As New List(Of (Key As String, R As Rectangle))
    Private _hover As String = ""

    Public Sub New(ParamArray items As String())
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        For Each it In items
            Dim p = it.Split("|"c)
            Me.Items.Add((p(0), If(p.Length > 1, p(1), p(0))))
        Next
        If Me.Items.Count > 0 Then Current = Me.Items(0).Key
        Height = 42
        Cursor = Cursors.Hand
    End Sub

    Private Function Caption(k As String, l As String) As String
        Dim n As Integer
        If Counts.TryGetValue(k, n) Then Return l & "  " & n.ToString("#,##0")
        Return l
    End Function

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Using p As New Pen(Theme.G200) : g.DrawLine(p, 0, Height - 1, Width, Height - 1) : End Using
        _rects = New List(Of (String, Rectangle))
        Dim x = 0
        For Each it In Items
            Dim t = Caption(it.Key, it.Label)
            Dim w = Tr.MeasureText(t, Theme.BodyBold).Width + 28
            Dim r As New Rectangle(x, 0, w, Height)
            Dim on_ = it.Key = Current
            If Not on_ AndAlso it.Key = _hover Then
                Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, r.X, r.Y, r.Width, r.Height - 1) : End Using
            End If
            Theme.DrawCentered(g, t, Theme.BodyBold, If(on_, Theme.Primary, Theme.G600), r)
            If on_ Then
                Using b As New SolidBrush(Theme.Primary) : g.FillRectangle(b, r.X + 6, Height - 3, r.Width - 12, 3) : End Using
            End If
            _rects.Add((it.Key, r))
            x += w
        Next
    End Sub

    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        Dim k = ""
        For Each r In _rects
            If r.R.Contains(e.Location) Then k = r.Key
        Next
        If k <> _hover Then _hover = k : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = "" : Invalidate()
    End Sub

    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For Each r In _rects
            If r.R.Contains(e.Location) AndAlso r.Key <> Current Then
                Current = r.Key
                Invalidate()
                RaiseEvent Changed()
                Return
            End If
        Next
    End Sub
End Class

' ═══════════════════════════ small number cards (list pages) ═══════════════════════════
''' <summary>The list pages' small summary card: icon, label, value (e.g. "Total Brands 24").</summary>
Public Class MiniStat
    Inherits Control
    Public Property Glyph As String = Theme.IcList
    Public Property Accent As Color = Theme.Primary
    Public Property Caption As String = ""
    Public Property Value As String = ""
    Public Property Note As String = ""
    Public Property NoteColor As Color = Theme.G500
    ''' <summary>Picked (a filter card that is on): blue border.</summary>
    Public Property Selected As Boolean
    Public Sub New(caption As String, glyph As String, accent As Color)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Me.Caption = caption : Me.Glyph = glyph : Me.Accent = accent
        Height = 84
    End Sub
    Public Sub SetValue(v As String, Optional note As String = "")
        Value = v : Me.Note = note
        Invalidate()
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), 10)
            Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(Selected, Color.FromArgb(&H93, &HC5, &HFD), Theme.G200), If(Selected, 2.0F, 1.0F)) : g.DrawPath(pen, p) : End Using
        End Using
        Dim ir As New Rectangle(16, (Height - 44) \ 2, 44, 44)
        Using p = Theme.RoundRect(New RectangleF(ir.X, ir.Y, ir.Width, ir.Height), 10)
            Using b As New SolidBrush(Theme.Tint(Accent, 32)) : g.FillPath(b, p) : End Using
        End Using
        Using f = Theme.IconFont(14) : Theme.DrawCentered(g, Glyph, f, Accent, ir) : End Using
        Tr.DrawText(g, Caption, Theme.UiFont(8.75F), New Rectangle(72, ir.Y - 2, Width - 80, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, Value, Theme.UiFont(14.0F, FontStyle.Bold), New Rectangle(71, ir.Y + 15, Width - 80, 28), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        If Note <> "" Then Tr.DrawText(g, Note, Theme.Small, New Rectangle(72, ir.Y + 42, Width - 80, 16), NoteColor, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class

''' <summary>A plain toggle switch (the website's on/off switches).</summary>
Public Class Switch
    Inherits Control
    Private _on As Boolean
    Public Event Toggled()
    Public Sub New(Optional text As String = "", Optional on_ As Boolean = False)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Me.Text = text
        _on = on_
        Height = 26
        Cursor = Cursors.Hand
        Width = 44 + If(text = "", 0, Tr.MeasureText(text, Theme.Body).Width + 10)
    End Sub
    Public Property Checked As Boolean
        Get
            Return _on
        End Get
        Set(value As Boolean)
            If _on = value Then Return
            _on = value
            Invalidate()
        End Set
    End Property
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Gfx.Toggle(e.Graphics, New Rectangle(0, (Height - 20) \ 2, 38, 20), _on)
        If Text <> "" Then Tr.DrawText(e.Graphics, Text, Theme.Body, New Rectangle(46, 0, Width - 46, Height), If(Enabled, Theme.G800, Theme.G400), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub
    Protected Overrides Sub OnClick(e As EventArgs)
        MyBase.OnClick(e)
        If Not Enabled Then Return
        _on = Not _on
        Invalidate()
        RaiseEvent Toggled()
    End Sub
End Class

''' <summary>A picture box that loads from the website (kept on the computer) or a local file.</summary>
Public Class WebPicture
    Inherits Control
    Private _src As String
    Private _img As Image
    Public Property Round As Boolean
    Public Property Contain As Boolean = True
    Public Sub New(Optional size As Integer = 80)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Width = size : Height = size
    End Sub
    Public Property Source As String
        Get
            Return _src
        End Get
        Set(value As String)
            If value = _src Then Return
            _src = value
            _img = Img.Get(value, 400, Sub(im)
                                           If _src = value AndAlso Not IsDisposed Then _img = im : Invalidate()
                                       End Sub)
            Invalidate()
        End Set
    End Property
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Dim r As New Rectangle(0, 0, Width - 1, Height - 1)
        If Round Then
            Gfx.Avatar(g, r, Text, _img)
        ElseIf Contain AndAlso _img IsNot Nothing Then
            Theme.Smooth(g)
            Using path = Theme.RoundRect(New RectangleF(0, 0, r.Width, r.Height), 6)
                Using b As New SolidBrush(Theme.G50) : g.FillPath(b, path) : End Using
                Dim s = Math.Min(r.Width / _img.Width, r.Height / _img.Height)
                Dim w = CInt(_img.Width * s), h = CInt(_img.Height * s)
                g.InterpolationMode = InterpolationMode.HighQualityBicubic
                g.DrawImage(_img, (r.Width - w) \ 2, (r.Height - h) \ 2, w, h)
                Using pen As New Pen(Theme.G200) : g.DrawPath(pen, path) : End Using
            End Using
        Else
            Gfx.Thumb(g, r, _img)
        End If
    End Sub
End Class

' ═══════════════════════════ menus, questions ═══════════════════════════
Partial Public Module Ui
    ''' <summary>Popup menu under a control. Items "key|Label", "-" (line), "!key|Label" (red), "*key|Label" (ticked).</summary>
    Public Sub PopMenu(anchor As Control, items As IEnumerable(Of String), picked As Action(Of String), Optional at As Point? = Nothing)
        WebMenu.Show(anchor, items, picked, at)
    End Sub

    Public Function Confirm(owner As Control, text As String, Optional title As String = "Are you sure?") As Boolean
        Return MessageBox.Show(owner?.FindForm(), text, title, MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) = DialogResult.Yes
    End Function

    Public Sub Info(owner As Control, text As String, Optional title As String = "Sri Andal Staff")
        MessageBox.Show(owner?.FindForm(), text, title, MessageBoxButtons.OK, MessageBoxIcon.Information)
    End Sub

    ''' <summary>Filter drop-down with "All" first; values are "value|Label" or plain.</summary>
    Public Function Filter(items As IEnumerable(Of String), Optional width As Integer = 180) As ComboBox
        Dim c As New WebCombo With {.Width = width, .DisplayMember = "Label", .ValueMember = "Value"}
        For Each i In items
            Dim p = i.Split("|"c)
            c.Items.Add(New Opt(p(0), If(p.Length > 1, p(1), p(0))))
        Next
        If c.Items.Count > 0 Then c.SelectedIndex = 0
        Return c
    End Function

    Public Function Val(c As ComboBox) As String
        Dim o = TryCast(c.SelectedItem, Opt)
        Return If(o Is Nothing, If(c.SelectedItem?.ToString(), ""), o.Value)
    End Function

    Public Sub SetVal(c As ComboBox, value As String)
        For k = 0 To c.Items.Count - 1
            Dim o = TryCast(c.Items(k), Opt)
            If (o IsNot Nothing AndAlso o.Value = value) OrElse (o Is Nothing AndAlso c.Items(k).ToString() = value) Then c.SelectedIndex = k : Return
        Next
        If c.Items.Count > 0 Then c.SelectedIndex = 0
    End Sub

    ''' <summary>Replace a drop-down's choices, keeping the chosen one when it's still there.</summary>
    Public Sub Refill(c As ComboBox, items As IEnumerable(Of String))
        Dim cur = Val(c)
        Dim newItems = items.ToList()
        Dim same = newItems.Count = c.Items.Count
        If same Then
            For k = 0 To newItems.Count - 1
                If c.Items(k).ToString() <> newItems(k).Split("|"c).Last() Then same = False : Exit For
            Next
        End If
        If same Then Return
        c.BeginUpdate()
        c.Items.Clear()
        For Each i In newItems
            Dim p = i.Split("|"c)
            c.Items.Add(New Opt(p(0), If(p.Length > 1, p(1), p(0))))
        Next
        c.EndUpdate()
        SetVal(c, cur)
    End Sub

    Public Function Btn(text As String, Optional glyph As String = "", Optional fill As Color = Nothing, Optional outline As Boolean = False, Optional click As Action = Nothing) As WButton
        Dim b = WButton.Make(text, glyph, If(fill = Color.Empty, Theme.Primary, fill), outline)
        If click IsNot Nothing Then AddHandler b.Click, Sub() click()
        Return b
    End Function

    Public Function Note(text As String, Optional color As Color = Nothing) As TextBlock
        Return New TextBlock(text, Theme.Body, If(color = Color.Empty, Theme.G500, color))
    End Function

    Public Function Heading(text As String) As TextBlock
        Return New TextBlock(text, Theme.CardTitle, Theme.G900)
    End Function
End Module

Public Class Opt
    Public Value As String
    Public Label As String
    Public Sub New(v As String, l As String)
        Value = v : Label = l
    End Sub
    Public Overrides Function ToString() As String
        Return Label
    End Function
End Class

' ═══════════════════════════ dialogs ═══════════════════════════
Public Module Dialogs
    ''' <summary>Two date pickers (custom range). Nothing when cancelled.</summary>
    Public Function PickRange(owner As Form, from As DateTime, [to] As DateTime) As (DateTime, DateTime)?
        Dim f As New FormDialog("Custom range", 380)
        f.AddDate("from", "From", from)
        f.AddDate("to", "To", [to])
        If f.ShowDialog(owner) <> DialogResult.OK Then Return Nothing
        Dim a = f.DateOf("from").Value, b = f.DateOf("to").Value
        If b < a Then Dim t = a : a = b : b = t
        Return (a, b)
    End Function

    ''' <summary>Asks for one line of text (Nothing when cancelled).</summary>
    Public Function Ask(owner As Control, title As String, label As String, Optional value As String = "", Optional multiline As Boolean = False) As String
        Dim f As New FormDialog(title, 460)
        If multiline Then f.AddMulti("v", label, value) Else f.AddText("v", label, value)
        If f.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return Nothing
        Return f.Val("v")
    End Function
End Module

''' <summary>The website's modal form: title, fields (text, number, choice, switch, date, picture, colour…),
''' Cancel / Save. Fields with half:=True sit two to a row.</summary>
Public Class FormDialog
    Inherits Form
    Private ReadOnly _body As New VStack(14) With {.Padding = New Padding(24, 18, 24, 12)}
    Private ReadOnly _scroll As New Panel With {.AutoScroll = True, .BackColor = Color.White}
    Private ReadOnly _foot As New Panel With {.Height = 66, .Dock = DockStyle.Bottom, .BackColor = Theme.G50}
    Private ReadOnly _head As New Panel With {.Height = 58, .Dock = DockStyle.Top, .BackColor = Color.White}
    Private ReadOnly _error As New Label With {.ForeColor = Theme.Danger, .Font = Theme.Body, .AutoSize = False, .TextAlign = ContentAlignment.MiddleLeft, .BackColor = Theme.G50}
    Public ReadOnly SaveButton As WButton
    Public ReadOnly CancelButton_ As WButton
    Private ReadOnly _inputs As New Dictionary(Of String, Control)
    Private ReadOnly _required As New List(Of (Key As String, Label As String))
    Private ReadOnly _files As New Dictionary(Of String, String)
    Private _pendingHalf As Field
    ''' <summary>Extra check before closing with Save: return an error message, or Nothing when fine.</summary>
    Public Validator As Func(Of FormDialog, String)
    ''' <summary>Runs on Save (may talk to the server); return an error message to stay open.</summary>
    Public OnSave As Func(Of FormDialog, Task(Of String))
    Private ReadOnly _title As String

    Public Sub New(title As String, Optional width As Integer = 560, Optional saveText As String = "Save")
        Icon = Theme.AppIcon
        Tr.KeepAmpersands(Me)
        _title = title
        Text = title
        FormBorderStyle = FormBorderStyle.FixedDialog
        MaximizeBox = False : MinimizeBox = False
        ShowInTaskbar = False
        StartPosition = FormStartPosition.CenterParent
        BackColor = Color.White
        Font = Theme.Body
        KeyPreview = True
        ClientSize = New Size(width, 300)
        AddHandler _head.Paint, Sub(s, e)
                                    Tr.DrawText(e.Graphics, _title, Theme.UiFont(12.0F, FontStyle.Bold), New Rectangle(24, 0, _head.Width - 48, _head.Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                    Using p As New Pen(Theme.G200) : e.Graphics.DrawLine(p, 0, _head.Height - 1, _head.Width, _head.Height - 1) : End Using
                                End Sub
        AddHandler _foot.Paint, Sub(s, e)
                                    Using p As New Pen(Theme.G200) : e.Graphics.DrawLine(p, 0, 0, _foot.Width, 0) : End Using
                                End Sub
        SaveButton = WButton.Make(saveText, Theme.IcSave, Theme.Primary)
        CancelButton_ = WButton.Make("Cancel", "", Theme.Primary, outline:=True)
        _foot.Controls.AddRange(New Control() {_error, CancelButton_, SaveButton})
        AddHandler CancelButton_.Click, Sub() DialogResult = DialogResult.Cancel
        AddHandler SaveButton.Click, Async Sub() Await SubmitAsync()
        _scroll.Controls.Add(_body)
        Controls.Add(_scroll)
        Controls.Add(_foot)
        Controls.Add(_head)
    End Sub

    Protected Overrides Sub OnKeyDown(e As KeyEventArgs)
        MyBase.OnKeyDown(e)
        If e.KeyCode = Keys.Escape Then DialogResult = DialogResult.Cancel
        If e.KeyCode = Keys.S AndAlso e.Control Then
            e.SuppressKeyPress = True
            Dim unused = SubmitAsync()
        End If
        If e.KeyCode = Keys.Enter AndAlso Not (TypeOf ActiveControl Is TextBox AndAlso DirectCast(ActiveControl, TextBox).Multiline) Then
            e.SuppressKeyPress = True
            Dim unused = SubmitAsync()
        End If
    End Sub

    Private _busy As Boolean
    Private Async Function SubmitAsync() As Task
        If _busy Then Return
        For Each r In _required
            If Val(r.Key).Trim() = "" Then ShowError(r.Label & " is required.") : _inputs(r.Key).Focus() : Return
        Next
        Dim msg = Validator?.Invoke(Me)
        If Not String.IsNullOrEmpty(msg) Then ShowError(msg) : Return
        If OnSave IsNot Nothing Then
            _busy = True
            SaveButton.Enabled = False
            Dim oldText = SaveButton.Text
            SaveButton.Text = "Saving..."
            Try
                msg = Await OnSave(Me)
            Finally
                _busy = False
                If Not IsDisposed Then
                    SaveButton.Enabled = True
                    SaveButton.Text = oldText
                End If
            End Try
            If Not String.IsNullOrEmpty(msg) Then ShowError(msg) : Return
        End If
        DialogResult = DialogResult.OK
    End Function

    Public Sub ShowError(msg As String)
        _error.Text = msg
        _error.Visible = True
    End Sub

    Protected Overrides Sub OnLoad(e As EventArgs)
        MyBase.OnLoad(e)
        _error.Visible = False
        Relayout()
        CenterToParent()
        Dim first = _inputs.Values.FirstOrDefault()
        If first IsNot Nothing Then
            ActiveControl = If(TypeOf first Is WInput, DirectCast(first, WInput).Box, first)
        End If
    End Sub

    ''' <summary>Sizes the dialog to its fields (call after showing / hiding fields).</summary>
    Public Sub Relayout()
        Dim w = ClientSize.Width
        Dim bh = _body.HeightFor(w)
        Dim maxH = CInt(Screen.FromControl(Me).WorkingArea.Height * 0.85) - _head.Height - _foot.Height
        Dim sh = Math.Min(bh, Math.Max(120, maxH))
        ClientSize = New Size(w, sh + _head.Height + _foot.Height)
        _scroll.SetBounds(0, _head.Height, w, sh)
        Dim bw = If(bh > sh, w - SystemInformation.VerticalScrollBarWidth, w)
        _body.SetBounds(0, _scroll.AutoScrollPosition.Y, bw, _body.HeightFor(bw))
        _scroll.AutoScrollMinSize = New Size(0, _body.Height)
        LayoutNested(_body)
        LayoutButtons()
    End Sub

    Public Sub LayoutButtons()
        Dim w = ClientSize.Width
        SaveButton.Location = New Point(w - 24 - SaveButton.Width, 14)
        CancelButton_.Location = New Point(SaveButton.Left - 10 - CancelButton_.Width, 14)
        _error.SetBounds(24, 8, Math.Max(10, CancelButton_.Left - 36), 50)
    End Sub

    Private Shared Sub LayoutNested(c As Control)
        c.PerformLayout()
        For Each k As Control In c.Controls
            If TypeOf k Is VStack OrElse TypeOf k Is Columns OrElse TypeOf k Is Field OrElse TypeOf k Is HRow Then LayoutNested(k)
        Next
    End Sub

    Private Sub Place(label As String, input As Control, hint As String, half As Boolean, required As Boolean)
        Dim f As New Field(label, input, hint, required)
        If half Then
            If _pendingHalf Is Nothing Then
                _pendingHalf = f
                Dim cols As New Columns(2, 150, 14)
                cols.Add(f)
                _body.Controls.Add(cols)
                Return
            End If
            _pendingHalf.Parent.Controls.Add(f)
            _pendingHalf = Nothing
            Return
        End If
        _pendingHalf = Nothing
        _body.Controls.Add(f)
    End Sub

    Private Sub Track(key As String, c As Control, label As String, required As Boolean)
        _inputs(key) = c
        If required Then _required.Add((key, label))
    End Sub

    Public Function AddText(key As String, label As String, Optional value As String = "", Optional required As Boolean = False, Optional hint As String = Nothing, Optional half As Boolean = False, Optional placeholder As String = "") As WInput
        Dim w = WInput.Make(placeholder)
        w.Text = If(value, "")
        Place(label, w, hint, half, required)
        Track(key, w, label, required)
        Return w
    End Function

    Public Function AddPassword(key As String, label As String, Optional hint As String = Nothing, Optional half As Boolean = False) As WInput
        Dim w = WInput.Make("")
        w.Box.UseSystemPasswordChar = True
        Place(label, w, hint, half, False)
        Track(key, w, label, False)
        Return w
    End Function

    Public Function AddNumber(key As String, label As String, Optional value As Double? = Nothing, Optional required As Boolean = False, Optional hint As String = Nothing, Optional half As Boolean = False) As WInput
        Dim w = WInput.Make("0")
        w.Text = If(value.HasValue, value.Value.ToString("0.##", CultureInfo.InvariantCulture), "")
        AddHandler w.Box.KeyPress, Sub(s, e)
                                       If Not Char.IsControl(e.KeyChar) AndAlso Not Char.IsDigit(e.KeyChar) AndAlso e.KeyChar <> "."c AndAlso e.KeyChar <> "-"c Then e.Handled = True
                                   End Sub
        Place(label, w, hint, half, required)
        Track(key, w, label, required)
        Return w
    End Function

    Public Function AddMulti(key As String, label As String, Optional value As String = "", Optional height As Integer = 110, Optional hint As String = Nothing, Optional required As Boolean = False) As WInput
        Dim w = WInput.Make("", "", True)
        w.Height = height
        w.Text = If(value, "").Replace(vbLf, vbCrLf).Replace(vbCr & vbCrLf, vbCrLf)
        Place(label, w, hint, False, required)
        Track(key, w, label, required)
        Return w
    End Function

    ''' <summary>Choice: options "value|Label".</summary>
    Public Function AddPick(key As String, label As String, options As IEnumerable(Of String), Optional value As String = "", Optional hint As String = Nothing, Optional half As Boolean = False, Optional required As Boolean = False) As ComboBox
        Dim c = Ui.Filter(options, 200)
        Ui.SetVal(c, value)
        Place(label, c, hint, half, required)
        Track(key, c, label, required)
        Return c
    End Function

    ''' <summary>A choice you can also type (autocomplete).</summary>
    Public Function AddCombo(key As String, label As String, options As IEnumerable(Of String), Optional value As String = "", Optional hint As String = Nothing, Optional half As Boolean = False) As ComboBox
        Dim c As New ComboBox With {.DropDownStyle = ComboBoxStyle.DropDown, .Font = Theme.Body, .AutoCompleteMode = AutoCompleteMode.SuggestAppend, .AutoCompleteSource = AutoCompleteSource.ListItems}
        For Each o In options : c.Items.Add(o) : Next
        c.Text = value
        Place(label, c, hint, half, False)
        Track(key, c, label, False)
        Return c
    End Function

    Public Function AddCheck(key As String, label As String, value As Boolean, Optional hint As String = Nothing, Optional half As Boolean = False) As Switch
        Dim s As New Switch(label, value)
        Place("", s, hint, half, False)
        Track(key, s, label, False)
        Return s
    End Function

    Public Function AddDate(key As String, label As String, value As DateTime?, Optional withTime As Boolean = False, Optional optional_ As Boolean = False, Optional half As Boolean = False, Optional hint As String = Nothing) As DateTimePicker
        Dim p As New DateTimePicker With {.Font = Theme.Body, .Format = DateTimePickerFormat.Custom, .CustomFormat = If(withTime, "dd MMM yyyy  hh:mm tt", "dd MMM yyyy"), .ShowCheckBox = optional_}
        If value.HasValue Then p.Value = value.Value Else If optional_ Then p.Checked = False
        Place(label, p, hint, half, False)
        Track(key, p, label, False)
        Return p
    End Function

    Public Function AddColor(key As String, label As String, value As String, Optional half As Boolean = False) As WButton
        Dim c = Fmt.ColorFromHex(value, Theme.Primary)
        Dim b = WButton.Make(Fmt.Hex(c), "", c)
        b.Tag = Fmt.Hex(c)
        AddHandler b.Click, Sub()
                                Using d As New ColorDialog With {.Color = b.Fill, .FullOpen = True}
                                    If d.ShowDialog(Me) = DialogResult.OK Then
                                        b.Fill = d.Color : b.Text = Fmt.Hex(d.Color) : b.Tag = b.Text : b.Invalidate()
                                    End If
                                End Using
                            End Sub
        Place(label, b, Nothing, half, False)
        Track(key, b, label, False)
        Return b
    End Function

    ''' <summary>Pick a picture from the computer; shows the current one. The picked file is copied into the
    ''' software's folder, so it can still be sent later when offline.</summary>
    Public Function AddImage(key As String, label As String, current As String, Optional hint As String = Nothing) As WebPicture
        Dim row As New HRow(10)
        Dim pic As New WebPicture(96)
        pic.Source = current
        Dim pick = WButton.Make("Choose picture", Theme.IcPhoto, Theme.Primary, outline:=True)
        Dim clear = WButton.Make("Remove", "", Theme.Danger, outline:=True)
        clear.Visible = Not String.IsNullOrEmpty(current)
        row.Controls.AddRange(New Control() {pic, pick, clear})
        row.Height = 96
        AddHandler pick.Click, Sub()
                                   Using d As New OpenFileDialog With {.Filter = "Pictures|*.jpg;*.jpeg;*.png;*.webp;*.gif|All files|*.*"}
                                       If d.ShowDialog(Me) <> DialogResult.OK Then Return
                                       Dim kept = Store.KeepFile(d.FileName)
                                       _files(key) = kept
                                       pic.Source = kept
                                       clear.Visible = True
                                       row.PerformLayout()
                                   End Using
                               End Sub
        AddHandler clear.Click, Sub()
                                    _files(key) = ""
                                    pic.Source = Nothing
                                    clear.Visible = False
                                End Sub
        Place(label, row, hint, False, False)
        _inputs(key) = row
        Return pic
    End Function

    Public Sub AddNote(text As String, Optional color As Color = Nothing)
        _pendingHalf = Nothing
        _body.Controls.Add(New TextBlock(text, Theme.Body, If(color = Color.Empty, Theme.G500, color)))
    End Sub

    Public Sub AddHeading(text As String)
        _pendingHalf = Nothing
        _body.Controls.Add(New TextBlock(text, Theme.UiFont(10.5F, FontStyle.Bold), Theme.G900))
    End Sub

    Public Sub AddControl(c As Control, Optional label As String = "")
        _pendingHalf = Nothing
        If label = "" Then _body.Controls.Add(c) Else _body.Controls.Add(New Field(label, c))
    End Sub

    Public Function Val(key As String) As String
        Dim c As Control = Nothing
        If Not _inputs.TryGetValue(key, c) Then Return ""
        If TypeOf c Is WInput Then Return DirectCast(c, WInput).Text
        If TypeOf c Is ComboBox Then
            Dim cb = DirectCast(c, ComboBox)
            If cb.DropDownStyle = ComboBoxStyle.DropDown Then Return cb.Text
            Return Ui.Val(cb)
        End If
        If TypeOf c Is Switch Then Return If(DirectCast(c, Switch).Checked, "1", "0")
        If TypeOf c Is DateTimePicker Then
            Dim p = DirectCast(c, DateTimePicker)
            If p.ShowCheckBox AndAlso Not p.Checked Then Return ""
            Return p.Value.ToString("yyyy-MM-dd")
        End If
        If TypeOf c Is WButton Then Return CStr(c.Tag)
        Return ""
    End Function

    Public Function Num(key As String) As Double
        Return Fmt.ParseNum(Val(key))
    End Function

    Public Function Bool(key As String) As Boolean
        Return Val(key) = "1"
    End Function

    Public Function DateOf(key As String) As DateTime?
        Dim c As Control = Nothing
        If Not _inputs.TryGetValue(key, c) Then Return Nothing
        Dim p = TryCast(c, DateTimePicker)
        If p Is Nothing OrElse (p.ShowCheckBox AndAlso Not p.Checked) Then Return Nothing
        Return p.Value
    End Function

    ''' <summary>The picture picked for a field: Nothing = unchanged, "" = removed, else a local file.</summary>
    Public Function FileOf(key As String) As String
        Dim v As String = Nothing
        If _files.TryGetValue(key, v) Then Return v
        Return Nothing
    End Function

    Public Function Input(key As String) As Control
        Dim c As Control = Nothing
        _inputs.TryGetValue(key, c)
        Return c
    End Function

    ''' <summary>Shows / hides a field (with its label); call Relayout after.</summary>
    Public Sub ShowField(key As String, on_ As Boolean)
        Dim c = Input(key)
        If c Is Nothing Then Return
        Dim f = TryCast(c.Parent, Field)
        Kit.Show(If(CType(f, Control), c), on_)
    End Sub
End Class

''' <summary>The list pages' filter card: labelled drop-downs side by side (wrapping when narrow).</summary>
Public Class FilterCard
    Inherits Card
    Implements IFlowHeight
    Public ReadOnly Grid As New Columns(5, 160, 12)
    Public ReadOnly Fields As New Dictionary(Of String, Field)
    Public Event Changed()
    Public Sub New()
        Padding = New Padding(14)
        Controls.Add(Grid)
    End Sub
    Public Function Add(Of T As Control)(key As String, label As String, input As T) As T
        Dim f As New Field(label, input)
        Fields(key) = f
        Grid.Add(f)
        Dim cb = TryCast(input, ComboBox)
        If cb IsNot Nothing Then AddHandler cb.SelectedIndexChanged, Sub() RaiseEvent Changed()
        Return input
    End Function
    ''' <summary>Shows the filters the page's Display Options allow; hides the card when none are left.</summary>
    Public Sub Apply(display As DisplayOptions, group As String)
        Dim n = 0
        For Each kv In Fields
            Dim on_ = display.IsOn(group, kv.Key)
            Kit.Show(kv.Value, on_)
            If on_ Then n += 1
        Next
        Grid.Count = Math.Max(1, n)
        Kit.Show(Me, n > 0)
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return Padding.Vertical + Grid.HeightFor(width - Padding.Horizontal)
    End Function
    Protected Overrides Sub OnLayout(levent As LayoutEventArgs)
        If Grid Is Nothing Then Return
        Dim w = Width - Padding.Horizontal
        Grid.SetBounds(Padding.Left, Padding.Top, w, Grid.HeightFor(w))
        Grid.PerformLayout()
        For Each f In Fields.Values : f.PerformLayout() : Next
    End Sub
End Class

''' <summary>Simple bar chart (campaign sales by day, analytics by payment method…) with a hover tooltip.</summary>
Public Class BarChart
    Inherits Control
    Public Values As New List(Of Double)
    Public Labels As New List(Of String)
    Public Tips As New List(Of String)
    Public Property BarColor As Color = Theme.Blue
    Public EmptyText As String = "Nothing yet."
    Private _hover As Integer = -1
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 230
    End Sub
    Private Function Plot() As RectangleF
        Return New RectangleF(58, 10, Width - 70, Height - 40)
    End Function
    Protected Overrides Sub OnMouseMove(e As MouseEventArgs)
        MyBase.OnMouseMove(e)
        If Values.Count = 0 Then Return
        Dim p = Plot()
        Dim i = CInt(Math.Floor((e.X - p.Left) / Math.Max(1, p.Width) * Values.Count))
        If i < 0 OrElse i >= Values.Count Then i = -1
        If i <> _hover Then _hover = i : Invalidate()
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = -1 : Invalidate()
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        If Values.Count = 0 OrElse Values.All(Function(v) v = 0) Then
            Tr.DrawText(g, EmptyText, Theme.Body, ClientRectangle, Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
            Return
        End If
        Dim p = Plot()
        Dim top = Math.Max(1.0, Values.Max() * 1.2)
        Using pen As New Pen(Theme.G100)
            For k = 0 To 4
                Dim y = p.Bottom - p.Height * k / 4
                g.DrawLine(pen, p.Left, y, p.Right, y)
                Tr.DrawText(g, LineChart.ShortMoney(top * k / 4), Theme.Small, New Rectangle(0, CInt(y) - 8, 52, 16), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
            Next
        End Using
        Dim slot = p.Width / Values.Count
        Dim bw = CSng(Math.Max(3, Math.Min(28, slot * 0.6)))
        Dim labelEvery = Math.Max(1, CInt(Math.Ceiling(Values.Count / 12.0)))
        For i = 0 To Values.Count - 1
            Dim h = CSng(Values(i) / top * p.Height)
            Dim x = p.Left + slot * i + (slot - bw) / 2
            Using path = Theme.RoundRect(New RectangleF(x, p.Bottom - h, bw, Math.Max(1, h)), 3)
                Using b As New SolidBrush(If(i = _hover, Theme.Darker(BarColor, 0.85), BarColor)) : g.FillPath(b, path) : End Using
            End Using
            If i < Labels.Count AndAlso i Mod labelEvery = 0 Then
                Tr.DrawText(g, Labels(i), Theme.Small, New Rectangle(CInt(p.Left + slot * i + slot / 2) - 40, CInt(p.Bottom) + 6, 80, 16), Theme.G500, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
            End If
        Next
        If _hover >= 0 Then
            Dim t = If(_hover < Tips.Count, Tips(_hover), Theme.Money(Values(_hover)))
            Dim sz = Tr.MeasureText(t, Theme.BodyBold)
            Dim x = CSng(Math.Min(Math.Max(0, p.Left + slot * _hover + slot / 2 - sz.Width / 2 - 8), Width - sz.Width - 16))
            Using path = Theme.RoundRect(New RectangleF(x, 4, sz.Width + 16, 26), 5)
                Using b As New SolidBrush(Theme.G900) : g.FillPath(b, path) : End Using
            End Using
            Tr.DrawText(g, t, Theme.BodyBold, New Rectangle(CInt(x), 4, sz.Width + 16, 26), Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
        End If
    End Sub
End Class

''' <summary>A big clickable choice (the website's page tabs with a hint line): icon, title, hint.</summary>
Public Class ChoiceCard
    Inherits Control
    Public Property Glyph As String
    Public Property Hint As String
    Public Property Selected As Boolean
    Private _hover As Boolean
    Public Sub New(title As String, hint As String, glyph As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        Text = title : Me.Hint = hint : Me.Glyph = glyph
        Height = 60 : Width = 316
        Cursor = Cursors.Hand
    End Sub
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        MyBase.OnMouseEnter(e)
        _hover = True : Invalidate()
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        MyBase.OnMouseLeave(e)
        _hover = False : Invalidate()
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(1, 1, Width - 3, Height - 3), 10)
            Using b As New SolidBrush(If(_hover AndAlso Not Selected, Theme.G50, Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(Selected, Theme.Blue, Theme.G200), If(Selected, 1.8F, 1.0F)) : g.DrawPath(pen, p) : End Using
        End Using
        Dim ir As New Rectangle(14, (Height - 34) \ 2, 34, 34)
        Using p = Theme.RoundRect(New RectangleF(ir.X, ir.Y, ir.Width, ir.Height), 8)
            Using b As New SolidBrush(If(Selected, Theme.Blue, Theme.G100)) : g.FillPath(b, p) : End Using
        End Using
        Using f = Theme.IconFont(12) : Theme.DrawCentered(g, Glyph, f, If(Selected, Color.White, Theme.G600), ir) : End Using
        Tr.DrawText(g, Text, Theme.BodyBold, New Rectangle(58, 11, Width - 66, 20), If(Selected, Color.FromArgb(&H1D, &H4E, &HD8), Theme.G800), TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, Hint, Theme.Small, New Rectangle(58, 32, Width - 66, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class
