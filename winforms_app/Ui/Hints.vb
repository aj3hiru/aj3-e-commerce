Imports System.Drawing
Imports System.Runtime.CompilerServices
Imports System.Windows.Forms

''' <summary>Grey placeholder text for borderless text boxes. Windows doesn't draw a TextBox's PlaceholderText
''' when it has no border (our website-style inputs), so a label is shown over the box while it is empty and
''' not focused. AttachAll walks a page / dialog (and whatever is added to it later).</summary>
Public Module Hints
    Private ReadOnly _hooked As New ConditionalWeakTable(Of Control, Object)

    Public Sub AttachAll(root As Control)
        If root Is Nothing OrElse root.IsDisposed Then Return
        Dim dummy As Object = Nothing
        If Not _hooked.TryGetValue(root, dummy) Then
            _hooked.AddOrUpdate(root, True)
            AddHandler root.ControlAdded, Sub(s, e) AttachAll(e.Control)
        End If
        Dim tb = TryCast(root, TextBox)
        If tb IsNot Nothing Then Attach(tb)
        For Each c As Control In root.Controls
            AttachAll(c)
        Next
    End Sub

    Private ReadOnly _labels As New ConditionalWeakTable(Of TextBox, Label)

    ''' <summary>Only parents that place their children themselves: a stacking panel would lay the label out too.</summary>
    Private Function Manual(p As Control) As Boolean
        Return Not (TypeOf p Is FlowLayoutPanel OrElse TypeOf p Is TableLayoutPanel OrElse TypeOf p Is VStack OrElse TypeOf p Is HRow OrElse
                    TypeOf p Is Columns OrElse TypeOf p Is ToolRow OrElse TypeOf p Is WInput OrElse TypeOf p Is SearchField)
    End Function

    Public Sub Attach(tb As TextBox)
        If tb.BorderStyle <> BorderStyle.None OrElse tb.Multiline Then Return
        Dim lbl As Label = Nothing
        If _labels.TryGetValue(tb, lbl) Then Return
        lbl = New Label With {.AutoSize = False, .ForeColor = Theme.G400, .Cursor = Cursors.IBeam, .Visible = False, .UseMnemonic = False}
        _labels.AddOrUpdate(tb, lbl)
        Dim text = ""
        Dim sync = Sub()
                       If tb.PlaceholderText <> "" Then text = tb.PlaceholderText : tb.PlaceholderText = ""
                       If tb.Parent Is Nothing OrElse Not Manual(tb.Parent) Then Return
                       If lbl.Parent IsNot tb.Parent Then tb.Parent.Controls.Add(lbl)
                       lbl.Text = text
                       lbl.Font = tb.Font
                       lbl.BackColor = tb.BackColor
                       lbl.TextAlign = If(tb.TextAlign = HorizontalAlignment.Center, ContentAlignment.MiddleCenter, ContentAlignment.MiddleLeft)
                       lbl.Bounds = New Rectangle(tb.Left + 1, tb.Top, tb.Width - 1, tb.Height)
                       lbl.Visible = text <> "" AndAlso tb.Visible AndAlso tb.Text = ""
                       If lbl.Visible Then lbl.BringToFront()
                   End Sub
        AddHandler lbl.Click, Sub() tb.Focus()
        For Each ev In {"TextChanged", "GotFocus", "LostFocus", "LocationChanged", "SizeChanged", "VisibleChanged", "ParentChanged", "FontChanged"}
            Dim ei = GetType(Control).GetEvent(ev)
            ei.AddEventHandler(tb, New EventHandler(Sub(s, e) sync()))
        Next
        sync()
    End Sub
End Module
