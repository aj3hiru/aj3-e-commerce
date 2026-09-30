Imports System.Drawing

''' <summary>Code 128 barcodes (what the website prints on labels), drawn natively — no internet needed.</summary>
Public Module Barcode
    Private ReadOnly Patterns As String() = {
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
        "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
        "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
        "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
        "114131", "311141", "411131", "211412", "211214", "211232", "2331112"}

    ''' <summary>Bar / space widths (in modules), starting with a bar. Nothing when the text can't be encoded.</summary>
    Public Function Modules(data As String) As List(Of Integer)
        If String.IsNullOrEmpty(data) Then Return Nothing
        Dim codes As New List(Of Integer)
        Dim allDigits = data.All(Function(ch) Char.IsDigit(ch))
        If allDigits AndAlso data.Length >= 4 AndAlso data.Length Mod 2 = 0 Then
            codes.Add(105) ' Start C: two digits per symbol (shorter bars)
            For k = 0 To data.Length - 1 Step 2
                codes.Add(Integer.Parse(data.Substring(k, 2)))
            Next
        Else
            codes.Add(104) ' Start B
            For Each ch In data
                Dim v = AscW(ch) - 32
                If v < 0 OrElse v > 95 Then Return Nothing
                codes.Add(v)
            Next
        End If
        Dim sum = codes(0)
        For k = 1 To codes.Count - 1 : sum += k * codes(k) : Next
        codes.Add(sum Mod 103)
        codes.Add(106)
        Dim widths As New List(Of Integer)
        For Each c In codes
            For Each w In Patterns(c) : widths.Add(AscW(w) - 48) : Next
        Next
        Return widths
    End Function

    ''' <summary>Draws the bars filling the rectangle (with the quiet zone inside it).</summary>
    Public Function Draw(g As Graphics, r As RectangleF, data As String) As Boolean
        Dim m = Modules(data)
        If m Is Nothing Then Return False
        Dim total = m.Sum() + 10 ' quiet zones
        Dim unit = r.Width / total
        Dim x = r.X + 5 * unit
        Dim bar = True
        For Each w In m
            If bar Then g.FillRectangle(Brushes.Black, x, r.Y, w * unit, r.Height)
            x += w * unit
            bar = Not bar
        Next
        Return True
    End Function
End Module
