Imports System.Drawing
Imports System.Windows.Forms

''' <summary>TextRenderer that shows "&amp;" as "&amp;" (Windows otherwise hides it and underlines the next letter:
''' "Customers &amp; Marketing" came out as "Customers _Marketing").</summary>
Public Module Tr
    Private Const F As TextFormatFlags = TextFormatFlags.NoPrefix

    Public Sub DrawText(dc As IDeviceContext, text As String, font As Font, pt As Point, color As Color)
        TextRenderer.DrawText(dc, text, font, pt, color, F)
    End Sub
    Public Sub DrawText(dc As IDeviceContext, text As String, font As Font, r As Rectangle, color As Color)
        TextRenderer.DrawText(dc, text, font, r, color, F Or TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
    End Sub
    Public Sub DrawText(dc As IDeviceContext, text As String, font As Font, pt As Point, color As Color, flags As TextFormatFlags)
        TextRenderer.DrawText(dc, text, font, pt, color, flags Or F)
    End Sub
    Public Sub DrawText(dc As IDeviceContext, text As String, font As Font, r As Rectangle, color As Color, flags As TextFormatFlags)
        TextRenderer.DrawText(dc, text, font, r, color, flags Or F)
    End Sub
    Public Sub DrawText(dc As IDeviceContext, text As String, font As Font, r As Rectangle, color As Color, back As Color, flags As TextFormatFlags)
        TextRenderer.DrawText(dc, text, font, r, color, back, flags Or F)
    End Sub

    Public Function MeasureText(text As String, font As Font) As Size
        Return TextRenderer.MeasureText(text, font, New Size(Integer.MaxValue, Integer.MaxValue), F)
    End Function
    Public Function MeasureText(text As String, font As Font, proposed As Size) As Size
        Return TextRenderer.MeasureText(text, font, proposed, F)
    End Function
    Public Function MeasureText(text As String, font As Font, proposed As Size, flags As TextFormatFlags) As Size
        Return TextRenderer.MeasureText(text, font, proposed, flags Or F)
    End Function
    Public Function MeasureText(dc As IDeviceContext, text As String, font As Font, proposed As Size, flags As TextFormatFlags) As Size
        Return TextRenderer.MeasureText(dc, text, font, proposed, flags Or F)
    End Function

    ''' <summary>Text with letter-spacing (CSS tracking), e.g. the sidebar's section titles.</summary>
    Public Sub DrawSpaced(g As Graphics, text As String, font As Font, at As Point, color As Color, spacing As Single)
        Dim x As Single = at.X
        For Each ch In text
            Dim s = ch.ToString()
            TextRenderer.DrawText(g, s, font, New Point(CInt(x), at.Y), color, F Or TextFormatFlags.NoPadding)
            x += TextRenderer.MeasureText(g, s, font, New Size(1000, 100), F Or TextFormatFlags.NoPadding).Width + spacing
        Next
    End Sub

    ''' <summary>Labels, check boxes and buttons under <paramref name="root"/> (now and later) show "&amp;" too.</summary>
    Public Sub KeepAmpersands(root As Control)
        Fix(root)
        AddHandler root.ControlAdded, Sub(s, e) KeepAmpersands(e.Control)
        For Each c As Control In root.Controls : KeepAmpersands(c) : Next
    End Sub

    Private Sub Fix(c As Control)
        Dim l = TryCast(c, Label)
        If l IsNot Nothing Then l.UseMnemonic = False : Return
        Dim b = TryCast(c, ButtonBase)
        If b IsNot Nothing Then b.UseMnemonic = False
    End Sub
End Module
