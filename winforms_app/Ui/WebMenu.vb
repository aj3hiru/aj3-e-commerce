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
    Private Const MaxH As Integer = 380
    Private _full As Integer, _scroll As Integer
    Private ReadOnly _bold As Font = Theme.Px(14, 600)

    Public Shared Sub Show(anchor As Control, items As IEnumerable(Of String), picked As Action(Of String), Optional at As Point? = Nothing, Optional userStyle As Boolean = False, Optional alignRight As Boolean = False)
        ' The native Windows menu (the user prefers it): ticked = checked, "!" = red, "-" = separator, icons drawn in.
        ' the compact Windows menu of v0.2.0.3 (what the user asked for): body font, check margin only when ticked
        Dim list = items.ToList()
        Dim cm As New ContextMenuStrip With {.Font = Theme.Body, .ShowImageMargin = list.Any(Function(i) i.Split("|"c).Length > 2), .ShowCheckMargin = list.Any(Function(i) i.StartsWith("*"))}
        For Each it In list
            If it = "-" Then cm.Items.Add(New ToolStripSeparator()) : Continue For
            Dim danger = it.StartsWith("!"), ticked = it.StartsWith("*")
            Dim p = it.TrimStart("!"c, "*"c).Split("|"c)
            Dim key = p(0), label = If(p.Length > 1, p(1), p(0)), icon = If(p.Length > 2, p(2), "")
            Dim mi As New ToolStripMenuItem(label.Replace("&", "&&")) With {.Checked = ticked, .Padding = New Padding(4, 3, 4, 3)}
            If danger Then mi.ForeColor = Color.FromArgb(&HDC, &H35, &H45)
            If icon <> "" Then
                Dim bmp As New Bitmap(16, 16)
                Using g = Graphics.FromImage(bmp)
                    Icons.Draw(g, icon, New RectangleF(0, 0, 16, 16), If(danger, mi.ForeColor, Theme.G700))
                End Using
                mi.Image = bmp
            End If
            AddHandler mi.Click, Sub() picked(key)
            cm.Items.Add(mi)
        Next
        AddHandler cm.Closed, Sub() cm.BeginInvoke(Sub() cm.Dispose())
        If at.HasValue Then
            cm.Show(at.Value)
        ElseIf anchor IsNot Nothing Then
            cm.Show(anchor, New Point(If(alignRight, anchor.Width - cm.PreferredSize.Width, 0), anchor.Height + 2))
        Else
            cm.Show(Cursor.Position)
        End If
    End Sub

    Private Sub New(items As IEnumerable(Of String), picked As Action(Of String), user As Boolean)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _picked = picked
        _user = user
        BackColor = Color.White
        Cursor = Cursors.Hand
        Dim y = 6
        Dim w = 180
        For Each it In items
            If it = "-" Then
                _rows.Add(New Row With {.Divider = True, .Y = y, .H = 9}) : y += 9
                Continue For
            End If
            Dim r As New Row With {.Danger = it.StartsWith("!"), .Ticked = it.StartsWith("*")}
            Dim p = it.TrimStart("!"c, "*"c).Split("|"c)
            r.Key = p(0) : r.Label = If(p.Length > 1, p(1), p(0)) : r.Icon = If(p.Length > 2, p(2), "")
            r.Y = y : r.H = If(user, 37, 36)
            _rows.Add(r)
            y += r.H
            w = Math.Max(w, Tr.MeasureText(r.Label, If(r.Ticked, _bold, _font)).Width + 6 * 2 + 11 * 2 + If(r.Icon <> "", 26, 0) + If(r.Ticked, 26, 0))
        Next
        _full = y + 6
        ' long lists (customers, products) scroll inside the popover instead of running off the screen
        Size = New Size(If(user, Math.Max(190, w), Math.Min(420, w + If(_full > MaxH, 8, 0))), Math.Min(_full, MaxH))
        Dim tick = _rows.FindIndex(Function(r) r.Ticked)
        If tick >= 0 AndAlso _full > Height Then _scroll = Math.Max(0, Math.Min(_full - Height, _rows(tick).Y - Height \ 2))
    End Sub

    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        Theme.Smooth(g)
        g.Clear(Color.White)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius + 2)
            Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
        End Using
        Dim clip = g.Clip
        g.SetClip(New Rectangle(1, 1, Width - 2, Height - 2))
        Dim sw = If(_full > Height, 8, 0)
        For k = 0 To _rows.Count - 1
            Dim r = _rows(k)
            Dim ry = r.Y - _scroll
            If ry + r.H < 0 OrElse ry > Height Then Continue For
            If r.Divider Then
                Using pen As New Pen(Theme.G100) : g.DrawLine(pen, 10, ry + 4, Width - 10 - sw, ry + 4) : End Using
                Continue For
            End If
            Dim rr As New Rectangle(6, ry, Width - 12 - sw, r.H)
            Dim picked = r.Ticked AndAlso Not _user
            If picked OrElse k = _hover Then
                Using p = Theme.RoundRect(New RectangleF(rr.X, rr.Y, rr.Width, rr.Height), Theme.Radius)
                    Using b As New SolidBrush(If(picked, Color.FromArgb(&HF5, &HF3, &HFF), Theme.G50)) : g.FillPath(b, p) : End Using
                End Using
            End If
            Dim fg = If(r.Danger, Color.FromArgb(&HDC, &H35, &H45), If(picked, Theme.Primary, Theme.G800))
            Dim x = rr.X + 11
            If r.Icon <> "" Then
                Icons.Draw(g, r.Icon, New RectangleF(x, rr.Y + (rr.Height - 14) / 2.0F, 16, 14), fg)
                x += 26
            End If
            Dim right = rr.Right - 11
            If r.Ticked Then
                Icons.Draw(g, "check", New RectangleF(right - 12, rr.Y + (rr.Height - 12) / 2.0F, 12, 12), Theme.Primary, 2.5F)
                right -= 20
            End If
            Tr.DrawText(g, r.Label, If(r.Ticked, _bold, _font), New Rectangle(x, rr.Y, right - x, rr.Height), fg, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Next
        g.Clip = clip
        If sw > 0 Then
            ' thin scroll thumb
            Dim th = Math.Max(30, CInt(Height * Height / CDbl(_full)))
            Dim ty = CInt((Height - th) * _scroll / CDbl(_full - Height))
            Using p = Theme.RoundRect(New RectangleF(Width - 7, ty + 3, 4, th - 6), 2)
                Using b As New SolidBrush(Theme.G300) : g.FillPath(b, p) : End Using
            End Using
        End If
    End Sub

    Protected Overrides Sub OnMouseWheel(e As MouseEventArgs)
        MyBase.OnMouseWheel(e)
        If _full <= Height Then Return
        _scroll = Math.Max(0, Math.Min(_full - Height, _scroll - Math.Sign(e.Delta) * 72))
        _hover = RowAt(PointToClient(Cursor.Position))
        Invalidate()
    End Sub

    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        MyBase.OnMouseEnter(e)
        Focus() ' so the wheel scrolls the list
    End Sub

    Private Function RowAt(p As Point) As Integer
        For k = 0 To _rows.Count - 1
            If Not _rows(k).Divider AndAlso p.Y + _scroll >= _rows(k).Y AndAlso p.Y + _scroll < _rows(k).Y + _rows(k).H Then Return k
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
