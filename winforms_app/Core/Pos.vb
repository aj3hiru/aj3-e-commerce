Imports System.Globalization
Imports System.Text.Json.Nodes
Imports System.Text.RegularExpressions

''' <summary>The website's billing rules (usePosCart.ts, product-variants-shared.ts, tax-mode-shared.ts), so a bill here
''' comes out exactly as it would on the website.</summary>
Public Module Pos
    ''' <summary>"500 Gram" from quantity + unit; the unit alone when there's no quantity; Nothing when neither.</summary>
    Public Function PackLabel(quantity As Double?, unit As String) As String
        Dim u = If(unit, "").Trim()
        If Not quantity.HasValue OrElse quantity.Value <= 0 Then Return If(u = "", Nothing, u)
        Dim q = quantity.Value
        Dim n = If(q = Math.Floor(q), CLng(q).ToString(CultureInfo.InvariantCulture), Math.Round(q, 3).ToString(CultureInfo.InvariantCulture))
        Return If(u = "", n, n & " " & u)
    End Function

    Public Function PackLabel(p As JsonObject) As String
        Return PackLabel(If(Js.IsNull(p, "quantity"), CType(Nothing, Double?), Js.Num(p, "quantity")), Js.Str(p, "unit"))
    End Function

    ''' <summary>Sort key so variants go small → large (kg / litre / metre count ×1000).</summary>
    Public Function PackSortKey(p As JsonObject) As Double
        If Js.IsNull(p, "quantity") Then Return Double.MaxValue
        Dim u = Js.Str(p, "unit").ToLowerInvariant()
        Return Js.Num(p, "quantity") * If({"kg", "liter", "litre", "l", "meter", "m"}.Contains(u), 1000, 1)
    End Function

    Private ReadOnly UnitWords As (Re As Regex, Name As String)() = {
        (New Regex("^(kg|kgs|kilo|kilogram|kilograms)$", RegexOptions.IgnoreCase), "KG"), (New Regex("^(g|gm|gms|gram|grams|grm)$", RegexOptions.IgnoreCase), "g"),
        (New Regex("^(l|lt|ltr|litre|liter|litres|liters)$", RegexOptions.IgnoreCase), "L"), (New Regex("^(ml|mls)$", RegexOptions.IgnoreCase), "ml"),
        (New Regex("^(pc|pcs|piece|pieces|nos)$", RegexOptions.IgnoreCase), "Pcs"), (New Regex("^(m|mtr|meter|metre)$", RegexOptions.IgnoreCase), "m"),
        (New Regex("^(cm)$", RegexOptions.IgnoreCase), "cm"), (New Regex("^(tab|tabs|tablets?)$", RegexOptions.IgnoreCase), "Tablets"), (New Regex("^(caps?|capsules?)$", RegexOptions.IgnoreCase), "Capsules")}

    ''' <summary>"Clinic Plus Shampoo 80ml" → "80 ml" (the size written in a product name), or Nothing.</summary>
    Public Function PackFromName(name As String) As String
        Dim ms = Regex.Matches(name, "(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|kilo|gms?|grams?|grm|g|litres?|liters?|ltr|lt|l|mls?|pcs|pc|pieces?|nos|mtr|metre|meter|m|cm|tabs?|tablets?|caps?|capsules?)\b", RegexOptions.IgnoreCase)
        If ms.Count = 0 Then Return Nothing
        Dim m = ms(ms.Count - 1)
        Dim unit = m.Groups(2).Value
        For Each w In UnitWords
            If w.Re.IsMatch(unit) Then unit = w.Name : Exit For
        Next
        Return Double.Parse(m.Groups(1).Value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture) & " " & unit
    End Function

    ''' <summary>The short size of a variant: its quantity + unit, else the size in its name, else its unit.</summary>
    Public Function VariantLabel(p As JsonObject) As String
        If Not Js.IsNull(p, "quantity") AndAlso Js.Num(p, "quantity") > 0 Then Return If(PackLabel(p), Js.Str(p, "name"))
        Dim fromName = PackFromName(Js.Str(p, "name"))
        If fromName IsNot Nothing Then Return fromName
        Dim u = Js.Str(p, "unit").Trim()
        Return If(u = "", "Option", u)
    End Function

    ''' <summary>Sale price when it is a real, lower price; otherwise the price (effectivePrice).</summary>
    Public Function ShelfPrice(p As JsonObject) As Double
        Dim price = Js.Num(p, "price"), sale = Js.Num(p, "salePrice")
        Return If(sale > 0 AndAlso sale < price, sale, price)
    End Function

    Public Function SizePrice(z As JsonObject) As Double
        Dim mrp = Js.Num(z, "mrp")
        If Js.IsNull(z, "price") Then Return mrp
        Dim pr = Js.Num(z, "price")
        Return If(pr > 0 AndAlso pr < mrp, pr, mrp)
    End Function

    ''' <summary>A product with its own Quantity sells as itself; otherwise its default size row (or the first).</summary>
    Public Function DefaultSize(p As JsonObject) As JsonObject
        If Not Js.IsNull(p, "quantity") AndAlso Js.Num(p, "quantity") > 0 Then Return Nothing
        Dim sizes = Js.Objs(Js.Arr(p, "sizes"))
        Return If(sizes.FirstOrDefault(Function(z) Js.Bool(z, "isDefault")), sizes.FirstOrDefault())
    End Function

    ''' <summary>GST inside / on top of an amount (a line total after its share of any discount).</summary>
    Public Function LineTax(amount As Double, rate As Double, inclusive As Boolean) As Double
        If Not rate > 0 OrElse Not amount > 0 Then Return 0
        Return If(inclusive, amount - amount / (1 + rate / 100), amount * (rate / 100))
    End Function
End Module
