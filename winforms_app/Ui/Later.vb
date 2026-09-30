Imports System.Windows.Forms

''' <summary>Runs work once things settle: while a window is being resized / dragged, a page is laid out
''' again only when the size stops changing for a moment (not on every pixel — that froze the window).</summary>
Public Module Later
    Public Function Debounced(work As Action, Optional ms As Integer = 70) As Action
        Dim t As New Timer With {.Interval = ms}
        AddHandler t.Tick, Sub()
                               t.Stop()
                               work()
                           End Sub
        Return Sub()
                   t.Stop()
                   t.Start()
               End Sub
    End Function
End Module
