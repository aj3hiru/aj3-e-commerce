Imports System.Drawing
Imports System.Windows.Forms

''' <summary>The website's dropdown lists: the status pill / Bulk Actions / Export list (Bootstrap .dropdown-menu)
''' and the header user menu (rounder, with icons). Items: "key|Label", "key|Label|icon" (a lucide or
''' "fa-…" icon), "!key|…" = red, "*key|…" = ticked, "-" = divider.</summary>
Public Class WebMenu
    Inherits Control
    Private Class Row
        Public Key As String, Label As String, Icon As String
        Public Danger As Boolean, Ticked As Boolean, Divider As Boolean
        Public Y As Integer, H As Integer
    End Class
    Private ReadOnly _rows As New List(Of Row)
    Private ReadOnly _picked As Action(Of String)
    Private ReadOnly _user As Boolean
    Private _hover As Integer = -1
    Private _dd As ToolStripDropDown
    Private ReadOnly _font As Font = Theme.Px(14)
    Private ReadOnly _bold As Font = Theme.Px(14, 600)

    Public Shared Sub Show(anchor As Control, items As IEnumerable(Of String), picked As Action(Of String), Optional at As Point? = Nothing, Optional userStyle As Boolean = False, Optional alignRight As Boolean = False)
        Dim m As New WebMenu(items, picked, userStyle)
        Dim host As New ToolStripControlHost(m) With {.Margin = Padding.Empty, .Padding = Padding.Empty, .AutoSize = False, .Size = m.Size}
        Dim dd As New ToolStripDropDown With {.Padding = Padding.Empty, .DropShadowEnabled = True, .BackColor = Color.White}
        dd.Items.Add(host)
        m._dd = dd
        AddHandler dd.Closed, Sub() dd.BeginInvoke(Sub() dd.Dispose())
        Dim p As Point
        If at.HasValue Then
            p = at.Value
        Else
            p = anchor.PointToScreen(New Point(If(alignRight, anchor.Width - m.Width, 0), anchor.Height + 2))
        End If
        ' open upwards when there's no room below (as on the website)
        Dim wa = Screen.FromPoint(p).WorkingArea
        If p.Y + m.Height > wa.Bottom AndAlso anchor IsNot Nothing Then p = New Point(p.X, anchor.PointToScreen(Point.Empty).Y - m.Height - 2)
        If p.X + m.Width > wa.Right Then p = New Point(wa.Right - m.Width - 8, p.Y)
        dd.Show(p)
    End Sub

    Private Sub New(items As IEnumerable(Of String), picked As Action(Of String), user As Boolean)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _picked = picked
        _user = user
        BackColor = Color.White
        Cursor = Cursors.Hand
        Dim y = If(user, 6, 8)
        Dim w = 160
        For Each it In items
            If it = "-" Then
                _rows.Add(New Row With {.Divider = True, .Y = y, .H = 9}) : y += 9
                Continue For
            End If
            Dim r As New Row With {.Danger = it.StartsWith("!"), .Ticked = it.StartsWith("*")}
            Dim p = it.TrimStart("!"c, "*"c).Split("|"c)
            r.Key = p(0) : r.Label = If(p.Length > 1, p(1), p(0)) : r.Icon = If(p.Length > 2, p(2), "")
            r.Y = y : r.H = If(user, 37, 29)
            _rows.Add(r)
            y += r.H
            w = Math.Max(w, Tr.MeasureText(r.Label, If(r.Ticked, _bold, _font)).Width + If(user, 21, 32) * 2 + If(r.Icon <> "" OrElse r.Ticked, 26, 0))
        Next
        Size = New Size(If(user, Math.Max(190, w), w), y + If(user, 6, 8))
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        g.Clear(Color.White)
        Using pen As New Pen(Color.FromArgb(45, 0, 0, 0)) : g.DrawRectangle(pen, 0, 0, Width - 1, Height - 1) : End Using
        For k = 0 To _rows.Count - 1
            Dim r = _rows(k)
            If r.Divider Then
                Using pen As New Pen(If(_user, Theme.G100, Color.FromArgb(&HE9, &HEC, &HEF))) : g.DrawLine(pen, If(_user, 10, 0), r.Y + 4, Width - If(_user, 10, 0), r.Y + 4) : End Using
                Continue For
            End If
            Dim rr = If(_user, New Rectangle(6, r.Y, Width - 12, r.H), New Rectangle(1, r.Y, Width - 2, r.H))
            If k = _hover Then
                Using p = Theme.RoundRect(New RectangleF(rr.X, rr.Y, rr.Width, rr.Height), If(_user, Theme.Radius, 0))
                    Using b As New SolidBrush(If(_user, Theme.G50, Color.FromArgb(&HE9, &HEC, &HEF))) : g.FillPath(b, p) : End Using
                End Using
            End If
            Dim fg = If(r.Danger, Color.FromArgb(&HDC, &H35, &H45), If(_user, Theme.G800, Color.FromArgb(&H21, &H25, &H29)))
            Dim x = rr.X + If(_user, 10, 16)
            If r.Icon <> "" Then
                Icons.Draw(g, r.Icon, New RectangleF(x, rr.Y + (rr.Height - 14) / 2.0F, 16, 14), fg)
                x += 26
            ElseIf r.Ticked Then
                Icons.Draw(g, "check", New RectangleF(x, rr.Y + (rr.Height - 14) / 2.0F, 14, 14), Theme.Primary)
                x += 26
            End If
            Tr.DrawText(g, r.Label, If(r.Ticked, _bold, _font), New Rectangle(x, rr.Y, rr.Right - x - 8, rr.Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Next
    End Sub

    Private Function RowAt(p As Point) As Integer
        For k = 0 To _rows.Count - 1
            If Not _rows(k).Divider AndAlso p.Y >= _rows(k).Y AndAlso p.Y < _rows(k).Y + _rows(k).H Then Return k
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
        _dd?.Close()
        _picked(_rows(k).Key)
    End Sub
End Class
