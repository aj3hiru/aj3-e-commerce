Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Tax Settings" as on the website: prices include / exclude GST, 4 cards (slabs, default, highest,
''' products without a matching slab) and the GST Slabs table (products per slab, set as default, edit,
''' delete). Changes show at once and wait for the internet when offline.</summary>
Public Class TaxPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_tax_settings2_display")
    Private ReadOnly _add As New HeadButton("Add Slab", "plus", Web.Blue)
    Private ReadOnly _modes As New Columns(2, 260, 12)
    Private ReadOnly _incl As New ChoiceCard("Prices include GST", "₹118 at 18% → customer pays ₹118", ChrW(&HE73E)) With {.Height = 64}
    Private ReadOnly _excl As New ChoiceCard("GST added on top", "₹100 at 18% → customer pays ₹118", ChrW(&HE710)) With {.Height = 64}
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _list As New ListCard("tax")

    Public Overrides ReadOnly Property PageTitle As String = "Tax Settings"
    Public Overrides ReadOnly Property PageSubtitle As String = "GST / tax rates used across products, billing and checkout"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _add}
        End Get
    End Property

    Public Sub New()
        Body.Add(New TextBlock("Prices and GST", Theme.UiFont(10.5F, FontStyle.Bold), Theme.G900))
        _modes.Add(_incl)
        _modes.Add(_excl)
        Body.Add(_modes)
        AddHandler _incl.Click, Async Sub() Await SetModeAsync(True)
        AddHandler _excl.Click, Async Sub() Await SetModeAsync(False)
        For Each m In {("tx2-k-total", "Total Slabs", ChrW(&HE8C1), Theme.Primary), ("tx2-k-default", "Default Rate", ChrW(&HE734), Color.FromArgb(&HD9, &H77, 6)),
                       ("tx2-k-highest", "Highest Rate", ChrW(&HE9D2), Theme.Blue), ("tx2-k-orphan", "Products Without a Matching Slab", Theme.IcSearch, Color.FromArgb(&HEF, &H44, &H44))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86}
            _m(m.Item1) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _list.Search.Box.PlaceholderText = "Search slabs…"
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.Table.RowClick, Sub(g) Edit(g)
        AddHandler _list.Table.CellClick, Async Sub(g, c, cell)
                                              If c.Key = "default" AndAlso Not Js.Bool(g, "isDefault") AndAlso Js.Int(g, "id") > 0 Then
                                                  Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/tax-rates2/" & Js.Int(g, "id"), .Label = "Default GST " & Js.Str(g, "label"), .Refresh = New List(Of String) From {"settings"}}, "business", """" & Js.Str(g, "label") & """ is now the default.")
                                              Else
                                                  Edit(g)
                                              End If
                                          End Sub
        AddHandler _list.Table.ActionClick, Async Sub(g, k)
                                                If k = "edit" Then Edit(g) Else Await DeleteAsync(g)
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _add.Click, Sub() Edit(Nothing)
        BuildCols()
    End Sub

    Private Shared Function Pct(v As Double) As String
        Return v.ToString("0.##", Globalization.CultureInfo.InvariantCulture)
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("tx2-table", k)
        _list.ShowSearch = col("tx2-t-search")
        If col("tx2-c-label") Then t.Cols.Add(New TCol("Label", Function(g) Js.Str(g, "label"), 0, CellKind.Bold) With {.Flex = 16}.WithSort())
        If col("tx2-c-rate") Then t.Cols.Add(New TCol("Rate", Function(g) Pct(Js.Num(g, "rate")) & "%", 0) With {.Flex = 8, .Sort = Function(g) Js.Num(g, "rate")})
        If col("tx2-c-products") Then t.Cols.Add(New TCol("Products", Function(g) Js.Int(g, "products").ToString(), 0) With {.Flex = 8, .Colour = Function(g) If(Js.Int(g, "products") > 0, Theme.G900, Theme.G400), .Sort = Function(g) Js.Int(g, "products")})
        If col("tx2-c-default") Then t.Cols.Add(New TCol("Default", Function(g) If(Js.Bool(g, "isDefault"), "★ Default", "Set as default"), 0, CellKind.Link) With {.Flex = 10, .Key = "default", .Colour = Function(g) If(Js.Bool(g, "isDefault"), Color.FromArgb(&HD9, &H77, 6), Theme.Blue)})
        If col("tx2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Actions).Btn("edit", ChrW(&HE70F), "Edit", Theme.Blue).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        t.RowClickable = True
        t.EmptyText = "No GST slabs yet."
        If t.SortCol Is Nothing Then t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Header = "Rate") : t.SortAsc = True
    End Sub

    Protected Overrides Sub Reload()
        Dim data = AppState.I.PageObj("business")
        Dim products = AppState.I.List("products")
        Dim rates = Js.Objs(Js.Arr(data, "gstRates")).Select(Function(g)
                                                                  Dim x = TryCast(Js.Copy(g), JsonObject)
                                                                  x("products") = products.Where(Function(p) Math.Abs(Js.Num(p, "gstRate") - Js.Num(g, "rate")) < 0.001).Count()
                                                                  Return x
                                                              End Function).OrderBy(Function(g) Js.Num(g, "rate")).ToList()
        Dim slab = rates.Select(Function(g) Js.Num(g, "rate")).ToList()
        Dim orphans = products.Where(Function(p) Not slab.Any(Function(r) Math.Abs(r - Js.Num(p, "gstRate")) < 0.001)).Count()
        Dim def = rates.FirstOrDefault(Function(g) Js.Bool(g, "isDefault"))
        Dim list = rates.Where(Function(g) _list.Matches(Js.Str(g, "label") & " " & Pct(Js.Num(g, "rate")) & "%")).ToList()
        _list.SetRows(list, rates.Count)
        Dim inclusive = Js.Bool(Js.Field(data, "tax"), "pricesIncludeTax")
        _incl.Selected = inclusive : _excl.Selected = Not inclusive
        _incl.Invalidate() : _excl.Invalidate()
        _m("tx2-k-total").SetValue(rates.Count.ToString())
        _m("tx2-k-default").SetValue(If(def Is Nothing, "None", Js.Str(def, "label")))
        _m("tx2-k-highest").SetValue(If(rates.Count = 0, "—", Pct(Js.Num(rates.Last(), "rate")) & "%"))
        _m("tx2-k-orphan").SetValue(orphans.ToString())
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("tx2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("tx2-cards"))
        Kit.Show(_list, _display.IsOn("tx2-table"))
    End Sub

    Private Async Function SetModeAsync(v As Boolean) As Task
        Dim inclusive = Js.Bool(Js.Field(AppState.I.Page("business"), "tax"), "pricesIncludeTax")
        If inclusive = v Then Return
        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/tax-mode", .Label = "Prices " & If(v, "include", "exclude") & " GST", .Body = Js.Obj("pricesIncludeTax", v),
            .Refresh = New List(Of String) From {"settings"}, .Effect = New JsonObject From {{"kind", "page_set"}, {"page", "business"}, {"path", New JsonArray("tax", "pricesIncludeTax")}, {"value", v}}}, "business")
    End Function

    Private Async Function DeleteAsync(g As JsonObject) As Task
        If Js.Int(g, "id") < 0 Then Return
        Dim n = Js.Int(g, "products")
        If Not Ui.Confirm(Me, "This can't be undone." & If(n > 0, " " & n & " product" & If(n = 1, "", "s") & " currently " & If(n = 1, "has", "have") & " this exact rate — they keep their own rate value, only this named slab goes away.", "") &
                          If(Js.Bool(g, "isDefault"), " This is the current default rate — deleting it leaves no default set.", ""), "Delete """ & Js.Str(g, "label") & """?") Then Return
        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/tax-rates2/" & Js.Int(g, "id"), .Label = "Delete GST slab " & Js.Str(g, "label"), .Refresh = New List(Of String) From {"settings"},
            .Effect = PageActions.PageRowDelete("business", Js.Field(g, "id"), "gstRates")}, "business", """" & Js.Str(g, "label") & """ deleted.")
    End Function

    Private Sub Edit(g As JsonObject)
        Dim f As New FormDialog(If(g Is Nothing, "Add GST Slab", "Edit GST Slab"), 440, If(g Is Nothing, "Add Slab", "Save Changes"))
        f.AddText("label", "Label", Js.Str(g, "label"), required:=True, placeholder:="e.g. GST 5%")
        f.AddNumber("rate", "Rate (%)", If(g Is Nothing, CType(Nothing, Double?), Js.Num(g, "rate")), required:=True)
        f.Validator = Function(d) If(d.Num("rate") < 0 OrElse d.Num("rate") > 100, "Type a rate between 0 and 100.", Nothing)
        f.OnSave = Async Function(d)
                       Dim body = Js.Obj("label", d.Val("label").Trim(), "rate", d.Num("rate"))
                       Dim item As New OutboxItem With {.Method = If(g Is Nothing, "POST", "PUT"), .Path = If(g Is Nothing, "/api/ecommerce/tax-rates2", "/api/ecommerce/tax-rates2/" & Js.Int(g, "id")), .Label = "GST slab " & d.Val("label").Trim(), .Body = body, .Refresh = New List(Of String) From {"settings"}}
                       If g Is Nothing Then
                           Dim row = TryCast(Js.Copy(body), JsonObject)
                           Js.Merge(row, Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id))
                           item.Effect = PageActions.PageRowNew("business", row, "gstRates")
                       Else
                           item.Effect = PageActions.PageRow("business", Js.Field(g, "id"), TryCast(Js.Copy(body), JsonObject), "gstRates")
                       End If
                       Return Await PageActions.SendAsync(Me, item, "business", """" & d.Val("label").Trim() & """ " & If(g Is Nothing, "added.", "saved."))
                   End Function
        f.ShowDialog(FindForm())
    End Sub
End Class
