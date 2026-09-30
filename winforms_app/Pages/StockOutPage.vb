Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Stock Out Products" as on the website: 4 cards, 4 filters, select + Bulk Actions (active, inactive,
''' export), the table (image, name, category, price, status menu, stock — click to restock, actions).
''' From the synced products — offline too; restocks wait in the outbox.</summary>
Public Class StockOutPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_stock_out2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All Status", "active|Active", "inactive|Inactive"})
    Private ReadOnly _category As ComboBox = Ui.Filter({"all|All Categories"})
    Private ReadOnly _units As ComboBox = Ui.Filter({"all|All Products", "yes|With Units", "no|Without Units"})
    Private ReadOnly _stock As ComboBox = Ui.Filter({"all|All", "zero|Zero stock", "unset|Stock not set"})
    Private ReadOnly _list As New ListCard("stockout")
    Private _catName As New Dictionary(Of Integer, String)
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Stock Out Products"
    Public Overrides ReadOnly Property PageSubtitle As String = "Physical products that are currently out of stock"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export}
        End Get
    End Property

    Public Sub New()
        For Each m In {("so2-k-total", "Out of Stock", Theme.IcBlock, Color.FromArgb(&HEF, &H44, &H44)), ("so2-k-active", "Active (Live in Shop)", Theme.IcDone, Color.FromArgb(5, &H96, &H69)),
                       ("so2-k-inactive", "Inactive", Theme.IcBlock, Theme.G500), ("so2-k-units", "With Units", Theme.IcPackage, Theme.Primary)}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     Select Case key
                                         Case "so2-k-total" : _list.Search.Text = "" : For Each c In {_status, _category, _units, _stock} : c.SelectedIndex = 0 : Next
                                         Case "so2-k-active" : Ui.SetVal(_status, If(Ui.Val(_status) = "active", "all", "active"))
                                         Case "so2-k-inactive" : Ui.SetVal(_status, If(Ui.Val(_status) = "inactive", "all", "inactive"))
                                         Case "so2-k-units" : Ui.SetVal(_units, If(Ui.Val(_units) = "yes", "all", "yes"))
                                     End Select
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("so2-f-status", "Status", _status)
        _filters.Add("so2-f-category", "Category", _category)
        _filters.Add("so2-f-units", "Units", _units)
        _filters.Add("so2-f-stock", "Stock", _stock)
        AddHandler _filters.Changed, Sub() Refresh_()
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Name, SKU, barcode…"
        _list.BulkItems.AddRange({"active|Set Active", "inactive|Set Inactive", "export|Export selected (Excel)"})
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           For Each c In {_status, _category, _units, _stock} : c.SelectedIndex = 0 : Next
                                       End Sub
        AddHandler _list.Bulk, Sub(k, rows)
                                   If k = "export" Then DoExport(rows, "selected") Else ProductActions.SetStatus(Me, rows, k)
                               End Sub
        AddHandler _list.Table.RowClick, Sub(p) Edit(p)
        AddHandler _list.Table.CellClick, Sub(p, c, cell)
                                              Select Case c.Key
                                                  Case "status" : PageActions.OnOffMenu(Me, New Point(cell.X + 10, cell.Bottom - 8), Js.Str(p, "status") = "active", "Active", "Inactive", Sub(v) ProductActions.SetStatus(Me, {p}, If(v, "active", "inactive")))
                                                  Case "stock" : ProductActions.AdjustStock(Me, p)
                                                  Case "category" : If Not Js.IsNull(p, "categoryId") Then Ui.SetVal(_category, Js.Int(p, "categoryId").ToString())
                                                  Case Else : Edit(p)
                                              End Select
                                          End Sub
        AddHandler _list.Table.ActionClick, Sub(p, k)
                                                If k = "restock" Then ProductActions.AdjustStock(Me, p) Else Edit(p)
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport(_shown, "shown")
        BuildCols()
    End Sub

    Private Sub Edit(p As JsonObject)
        If Js.Int(p, "id") > 0 Then Main?.Push(New AddProductPage(Js.Int(p, "id")))
    End Sub

    Private Function CatOf(p As JsonObject) As String
        Dim n As String = Nothing
        Return If(_catName.TryGetValue(Js.Int(p, "categoryId"), n), n, "—")
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("so2-table", k)
        _list.Selectable = col("so2-c-select")
        _list.ShowSearch = col("so2-t-search")
        If col("so2-c-image") Then t.Cols.Add(New TCol("Image", Nothing, 64, CellKind.Thumb) With {.Picture = Function(p) Js.Str(p, "image")})
        If col("so2-c-name") Then t.Cols.Add(New TCol("Name", Function(p) Js.Str(p, "name"), 0, CellKind.Bold) With {.Flex = 24, .Sub = Function(p) If(Js.Str(p, "sku") <> "", "SKU " & Js.Str(p, "sku"), ""), .Sort = Function(p) Js.Str(p, "name").ToLowerInvariant()})
        If col("so2-c-category") Then t.Cols.Add(New TCol("Category", Function(p) If(Js.IsNull(p, "categoryId"), "Uncategorized", CatOf(p)), 0, CellKind.Link) With {.Flex = 12, .Key = "category", .Colour = Function(p) If(Js.IsNull(p, "categoryId"), Theme.G400, Theme.G600), .Sort = Function(p) CatOf(p)})
        If col("so2-c-price") Then t.Cols.Add(New TCol("Price", Function(p) Theme.Money(ProductActions.Price(p)), 0) With {.Flex = 9, .Sort = Function(p) ProductActions.Price(p)})
        If col("so2-c-status") Then t.Cols.Add(New TCol("Status", Function(p) If(Js.Str(p, "status") = "active", "Active", "Inactive"), 0, CellKind.PillMenu) With {.Flex = 11, .Key = "status", .Colour = Function(p) If(Js.Str(p, "status") = "active", Theme.Green, Theme.Grey), .Sort = Function(p) Js.Str(p, "status")})
        If col("so2-c-stock") Then
            t.Cols.Add(New TCol("Stock", Function(p) If(Js.IsNull(p, "stock"), "Not set", Js.Int(p, "stock") & If(Js.Str(p, "unit") <> "", " " & Js.Str(p, "unit"), "")), 0, CellKind.PillMenu) With {.Flex = 11, .Key = "stock",
                .Colour = Function(p) Color.FromArgb(&HDC, &H35, &H45), .Sort = Function(p) If(Js.IsNull(p, "stock"), -1, Js.Int(p, "stock"))})
        End If
        If col("so2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Actions).Btn("restock", ChrW(&HE7B8), "Restock", Theme.Green).Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)))
        t.RowClickable = True
        t.EmptyText = "Nothing is out of stock. 🎉"
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim cats = s.List("categories")
        _catName = cats.GroupBy(Function(c) Js.Int(c, "id")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "name"))
        Dim all = s.List("products").Where(Function(p) Js.Str(p, "type") = "physical" AndAlso (Js.IsNull(p, "stock") OrElse Js.Int(p, "stock") <= 0)).OrderByDescending(Function(p) Js.Str(p, "updatedAt")).ToList()
        Dim used = all.Select(Function(p) Js.Int(p, "categoryId")).ToHashSet()
        Ui.Refill(_category, {"all|All Categories"}.Concat(cats.Where(Function(c) used.Contains(Js.Int(c, "id"))).Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name"))).Concat(If(all.Any(Function(p) Js.IsNull(p, "categoryId")), {"none|Uncategorized"}, New String() {})))
        Dim hasUnits = Function(p As JsonObject) Js.Arr(p, "sizes").Count > 0
        Dim status = Ui.Val(_status), category = Ui.Val(_category), units = Ui.Val(_units), stock = Ui.Val(_stock)
        Dim list = all.Where(Function(p)
                                 If status <> "all" AndAlso (Js.Str(p, "status") = "active") <> (status = "active") Then Return False
                                 If category = "none" AndAlso Not Js.IsNull(p, "categoryId") Then Return False
                                 If category <> "all" AndAlso category <> "none" AndAlso Js.Str(p, "categoryId") <> category Then Return False
                                 If units <> "all" AndAlso hasUnits(p) <> (units = "yes") Then Return False
                                 If stock = "zero" AndAlso Js.IsNull(p, "stock") Then Return False
                                 If stock = "unset" AndAlso Not Js.IsNull(p, "stock") Then Return False
                                 Return _list.Matches(Js.Str(p, "name") & " " & Js.Str(p, "sku") & " " & Js.Str(p, "barcode"))
                             End Function).ToList()
        _shown = list
        Dim filtersOn = status <> "all" OrElse category <> "all" OrElse units <> "all" OrElse stock <> "all"
        _list.SetRows(list, all.Count, filtersOn)
        _m("so2-k-total").SetValue(all.Count.ToString())
        _m("so2-k-active").SetValue(all.Where(Function(p) Js.Str(p, "status") = "active").Count().ToString())
        _m("so2-k-inactive").SetValue(all.Where(Function(p) Js.Str(p, "status") <> "active").Count().ToString())
        _m("so2-k-units").SetValue(all.Where(hasUnits).Count().ToString())
        _m("so2-k-total").Selected = Not filtersOn AndAlso _list.Query = ""
        _m("so2-k-active").Selected = status = "active"
        _m("so2-k-inactive").Selected = status = "inactive"
        _m("so2-k-units").Selected = units = "yes"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("so2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("so2-cards"))
        _filters.Apply(_display, "so2-filters")
        If Not _display.IsOn("so2-filters") Then Kit.Show(_filters, False)
        Kit.Show(_list, _display.IsOn("so2-table"))
    End Sub

    Private Sub DoExport(rows As List(Of JsonObject), which As String)
        Export.Csv(Me, "Stock out (" & which & ")", {"ID", "Name", "SKU", "Barcode", "Category", "Price", "Status", "Stock", "Units"},
                   rows.Select(Function(p) CType({CObj(Js.Int(p, "id")), Js.Str(p, "name"), Js.Str(p, "sku"), Js.Str(p, "barcode"), CatOf(p), CObj(ProductActions.Price(p)),
                        If(Js.Str(p, "status") = "active", "Active", "Inactive"), If(Js.IsNull(p, "stock"), "Not set", Js.Str(p, "stock")), CObj(Js.Arr(p, "sizes").Count)}, IEnumerable(Of Object))))
    End Sub
End Class
