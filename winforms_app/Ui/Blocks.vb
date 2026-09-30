Imports System.Diagnostics
Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Label on the left, value on the right, one per line (payment details, bill totals…).</summary>
Public Class KeyValues
    Inherits Control
    Implements IFlowHeight
    Public Rows As New List(Of (Label As String, Value As String, Bold As Boolean, Colour As Color))
    Public Property LineHeight As Integer = 26
    ''' <summary>Values sit in the right part only (bill totals under a table).</summary>
    Public Property RightPart As Boolean
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
    End Sub
    Public Function Add(label As String, value As String, Optional bold As Boolean = False, Optional colour As Color = Nothing) As KeyValues
        Rows.Add((label, value, bold, colour))
        Return Me
    End Function
    Public Sub Clear()
        Rows.Clear()
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return Rows.Sum(Function(r) If(r.Label = "-", 12, If(r.Bold, LineHeight + 6, LineHeight)))
    End Function
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Dim y = 0
        Dim x0 = If(RightPart, Width * 3 \ 5, 0)
        For Each r In Rows
            If r.Label = "-" Then
                Using p As New Pen(Theme.G200) : g.DrawLine(p, x0, y + 6, Width, y + 6) : End Using
                y += 12
                Continue For
            End If
            Dim h = If(r.Bold, LineHeight + 6, LineHeight)
            Dim f = If(r.Bold, Theme.UiFont(12.0F, FontStyle.Bold), Theme.Body)
            TextRenderer.DrawText(g, r.Label, f, New Rectangle(x0, y, Width - x0, h), If(r.Bold, Theme.G900, Theme.G600), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            TextRenderer.DrawText(g, r.Value, If(r.Bold, f, Theme.BodyBold), New Rectangle(x0, y, Width - x0, h), If(r.Colour = Color.Empty, Theme.G900, r.Colour), TextFormatFlags.VerticalCenter Or TextFormatFlags.Right Or TextFormatFlags.NoPadding)
            y += h
        Next
    End Sub
End Class

''' <summary>A dated list with dots (order history, activity).</summary>
Public Class Timeline
    Inherits Control
    Implements IFlowHeight
    Public Items As New List(Of (Title As String, Meta As String, Note As String))
    Public EmptyText As String = "No history yet."
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
    End Sub
    Private Function ItemH(it As (Title As String, Meta As String, Note As String), w As Integer) As Integer
        Dim h = 20 + 18
        If Not String.IsNullOrEmpty(it.Note) Then h += TextRenderer.MeasureText(it.Note, Theme.Body, New Size(Math.Max(20, w - 26), 1000), TextFormatFlags.WordBreak).Height
        Return h + 12
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        If Items.Count = 0 Then Return 24
        Return Items.Sum(Function(i) ItemH(i, width))
    End Function
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        If Items.Count = 0 Then
            TextRenderer.DrawText(g, EmptyText, Theme.Body, New Point(0, 2), Theme.G500)
            Return
        End If
        Dim y = 0
        For k = 0 To Items.Count - 1
            Dim it = Items(k)
            Dim h = ItemH(it, Width)
            If k < Items.Count - 1 Then
                Using p As New Pen(Theme.G200, 2) : g.DrawLine(p, 5, y + 14, 5, y + h + 4) : End Using
            End If
            Using b As New SolidBrush(Theme.Blue) : g.FillEllipse(b, 0, y + 4, 10, 10) : End Using
            TextRenderer.DrawText(g, it.Title, Theme.BodyBold, New Rectangle(24, y, Width - 24, 20), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            TextRenderer.DrawText(g, it.Meta, Theme.Small, New Rectangle(24, y + 20, Width - 24, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            If Not String.IsNullOrEmpty(it.Note) Then
                TextRenderer.DrawText(g, it.Note, Theme.Body, New Rectangle(24, y + 38, Width - 26, h - 50), Theme.G700, TextFormatFlags.WordBreak Or TextFormatFlags.NoPadding)
            End If
            y += h
        Next
    End Sub
End Class

''' <summary>A drawn block (the page draws it; height fixed or by a function).</summary>
Public Class Drawn
    Inherits Control
    Implements IFlowHeight
    Public PaintIt As Action(Of Graphics, Rectangle)
    Public HeightOf As Func(Of Integer, Integer)
    Public Sub New(h As Integer, paintIt As Action(Of Graphics, Rectangle))
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw Or ControlStyles.SupportsTransparentBackColor, True)
        BackColor = Color.Transparent
        Height = h
        Me.PaintIt = paintIt
    End Sub
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        Return If(HeightOf Is Nothing, Height, HeightOf(width))
    End Function
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Theme.Smooth(e.Graphics)
        PaintIt?.Invoke(e.Graphics, ClientRectangle)
    End Sub
End Class

Partial Public Module Ui
    ''' <summary>Opens a link / phone number / map with Windows (browser, WhatsApp, phone app).</summary>
    Public Sub OpenUrl(url As String)
        Try
            Process.Start(New ProcessStartInfo(url) With {.UseShellExecute = True})
        Catch
        End Try
    End Sub

    Public Function WhatsApp(phone As String) As String
        Dim d = System.Text.RegularExpressions.Regex.Replace(If(phone, ""), "\D", "")
        If d.Length = 12 AndAlso d.StartsWith("91") Then d = d.Substring(2)
        Return "https://wa.me/91" & d
    End Function

    ''' <summary>A small square icon button (call, WhatsApp, map…).</summary>
    Public Function IconBtn(glyph As String, tip As String, click As Action, Optional colour As Color = Nothing) As WButton
        Dim b = WButton.Make("", glyph, Theme.Primary, outline:=True)
        b.GlyphColor = If(colour = Color.Empty, Theme.G700, colour)
        b.Width = 40 : b.Height = 38
        Dim t As New ToolTip()
        t.SetToolTip(b, tip)
        AddHandler b.Click, Sub() click()
        Return b
    End Function
End Module
