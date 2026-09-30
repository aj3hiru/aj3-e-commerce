Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"All Products" as on the website: 4 number cards (click to filter), 5 filters, Show n entries ·
''' Select All · Bulk Actions (publish, unpublish, barcodes, delete), the table (image, name, stock with +,
''' category, price, status menu, type, item type, actions: barcode / edit / delete), Export and Add Product.</summary>
Public Class ProductsPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_products2_display")
    Private ReadOnly _search As WInput = WInput.Make("Search products, SKU, barcode", Theme.IcSearch)
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _add As WButton = Ui.Btn("Add Product", Theme.IcAdd, Fmt.Orange)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All Status", "active|Published", "inactive|Unpublished"})
    Private ReadOnly _stock As ComboBox = Ui.Filter({"all|All Stock", "in|In Stock", "low|Low Stock", "out|Out of Stock"})
    Private ReadOnly _category As ComboBox = Ui.Filter({"0|All Categories"})
    Private ReadOnly _type As ComboBox = Ui.Filter({"all|All Types", "none|None"})
    Private ReadOnly _item As ComboBox = Ui.Filter({"all|All Item Types", "normal|Normal"})
    Private ReadOnly _list As New ListCard("products")
    Private _all As New List(Of JsonObject)
    Private _shown As New List(Of JsonObject)
    Private _catName As New Dictionary(Of Integer, String)
    Private _badges As New Dictionary(Of String, JsonObject)
    Private _items As New Dictionary(Of String, String)

    Public Overrides ReadOnly Property PageTitle As String = "All Products"
    Public Overrides ReadOnly Property PageSubtitle As String = "Manage everything you sell in your store"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_search, _display.Button, _export, _add}
        End Get
    End Property

    Public Sub New()
        _search.Width = 250
        For Each m In {("p2-k-total", "Total Products", Theme.IcShop, Fmt.Orange), ("p2-k-published", "Published", Theme.IcDone, Color.FromArgb(&H10, &HB9, &H81)),
                       ("p2-k-low", "Low Stock", ChrW(&HE7BA), Color.FromArgb(&HEA, &HB3, 8)), ("p2-k-out", "Out of Stock", Theme.IcBlock, Color.FromArgb(&HEF, &H44, &H44))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     Select Case key
                                         Case "p2-k-total" : Ui.SetVal(_status, "all") : Ui.SetVal(_stock, "all")
                                         Case "p2-k-published" : Ui.SetVal(_status, "active")
                                         Case "p2-k-low" : Ui.SetVal(_stock, "low")
                                         Case "p2-k-out" : Ui.SetVal(_stock, "out")
                                     End Select
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("p2-f-status", "Status", _status)
        _filters.Add("p2-f-stock", "Stock", _stock)
        _filters.Add("p2-f-category", "Category", _category)
        _filters.Add("p2-f-type", "Type", _type)
        _filters.Add("p2-f-item", "Item Type", _item)
        AddHandler _filters.Changed, Sub()
                                         _list.ResetPage()
                                         Refresh_()
                                     End Sub
        Body.Add(_filters)
        _list.ShowSearch = False
        _list.BulkItems.AddRange({"publish|Publish", "unpublish|Unpublish", "barcodes|Print Barcodes", "-", "!delete|Delete"})
        Body.Add(_list)
        AddHandler _search.TextChanged, Sub()
                                            _list.ResetPage()
                                            Refresh_()
                                        End Sub
        AddHandler _list.ClearFilters, Sub()
                                           _search.Text = ""
                                           For Each c In {_status, _stock, _category, _type, _item} : c.SelectedIndex = 0 : Next
                                       End Sub
        AddHandler _list.Bulk, Async Sub(k, rows)
                                   Select Case k
                                       Case "publish" : ProductActions.SetStatus(Me, rows, "active")
                                       Case "unpublish" : ProductActions.SetStatus(Me, rows, "inactive")
                                       Case "barcodes" : PrintBarcodes(rows)
                                       Case "delete" : Await ProductActions.DeleteAsync(Me, rows) : _list.Table.Selected.Clear()
                                   End Select
                               End Sub
        AddHandler _list.Table.RowClick, Sub(p) Edit(p)
        AddHandler _list.Table.CellClick, Sub(p, c, cell)
                                              Select Case c.Key
                                                  Case "status"
                                                      If Js.Int(p, "id") < 0 Then Return
                                                      Ui.PopMenu(Me, {If(Js.Str(p, "status") = "active", "*", "") & "active|Published", If(Js.Str(p, "status") <> "active", "*", "") & "inactive|Unpublished"},
                                                                 Sub(v) ProductActions.SetStatus(Me, {p}, v), New Point(cell.X + 10, cell.Bottom - 8))
                                                  Case "stock"
                                                      If Js.Str(p, "type") = "physical" AndAlso Js.Int(p, "id") > 0 Then ProductActions.AdjustStock(Me, p) Else Edit(p)
                                                  Case Else : Edit(p)
                                              End Select
                                          End Sub
        AddHandler _list.Table.ActionClick, Async Sub(p, k)
                                                Select Case k
                                                    Case "barcode" : If Js.Str(p, "barcode") = "" Then Toast("Add a barcode to this product first.") Else PrintBarcodes({p}.ToList())
                                                    Case "edit" : Edit(p)
                                                    Case "delete" : Await ProductActions.DeleteAsync(Me, {p}.ToList())
                                                End Select
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() ExportMenu()
        AddHandler _add.Click, Sub() Main?.Pick("/admin/ecommerce/products/add")
        BuildCols()
    End Sub

    ''' <summary>Open with a filter (dashboard: low / out of stock, a category's products).</summary>
    Public Sub ShowFilter(Optional stock As String = "all", Optional status As String = "all", Optional category As Integer = 0)
        Ui.SetVal(_stock, stock) : Ui.SetVal(_status, status) : Ui.SetVal(_category, category.ToString())
        Refresh_()
    End Sub

    Private Sub Edit(p As JsonObject)
        If Js.Int(p, "id") < 0 Then Toast("""" & Js.Str(p, "name") & """ is still being added — it can be changed in a moment.") : Return
        Main?.Push(New AddProductPage(Js.Int(p, "id")))
    End Sub

    Private Sub PrintBarcodes(rows As List(Of JsonObject))
        BarcodesPage.Pending = rows.Select(Function(p) Js.Int(p, "id")).Where(Function(i) i > 0).ToList()
        Main?.Pick("/admin/ecommerce/barcode-print")
    End Sub

    Private Shared Function Physical(p As JsonObject) As Boolean
        Return Js.Str(p, "type") = "physical"
    End Function
    Private Shared Function IsOut(p As JsonObject) As Boolean
        Return Physical(p) AndAlso (Js.IsNull(p, "stock") OrElse Js.Int(p, "stock") <= 0)
    End Function
    Private Shared Function IsLow(p As JsonObject) As Boolean
        Return Physical(p) AndAlso Not Js.IsNull(p, "stock") AndAlso Js.Int(p, "stock") > 0 AndAlso Js.Int(p, "stock") <= 5
    End Function
    Private Function TypeLabel(p As JsonObject) As String
        Dim b = Js.Str(p, "badgeTag", "none")
        If b = "none" OrElse b = "" Then Return "None"
        Dim x As JsonObject = Nothing
        Return If(_badges.TryGetValue(b, x), Js.Str(x, "label"), b)
    End Function
    Private Function ItemLabel(p As JsonObject) As String
        Dim t = Js.Str(p, "itemType", "normal")
        If t = "normal" OrElse t = "" Then Return "Normal"
        Dim x As String = Nothing
        Return If(_items.TryGetValue(t, x), x, t)
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim on_ = Function(k As String) _display.IsOn("p2-table", k)
        _list.Selectable = on_("p2-c-select")
        If on_("p2-c-image") Then t.Cols.Add(New TCol("Image", Nothing, 64, CellKind.Thumb) With {.Picture = Function(p) If(Js.Str(p, "image") <> "", Js.Str(p, "image"), Js.Str(p, "localImage"))})
        If on_("p2-c-name") Then t.Cols.Add(New TCol("Name", Function(p) Js.Str(p, "name"), 0, CellKind.Bold) With {.Flex = 22, .Sort = Function(p) Js.Str(p, "name").ToLowerInvariant()})
        If on_("p2-c-stock") Then
            t.Cols.Add(New TCol("Stock", Nothing, 0, CellKind.Custom) With {.Flex = 13, .Key = "stock",
                .Sort = Function(p) If(Js.IsNull(p, "stock"), -1, Js.Int(p, "stock")),
                .Draw = Sub(g, r, p)
                            Dim txt = If(Not Physical(p), "∞", If(Js.IsNull(p, "stock"), "—", Js.Int(p, "stock") & If(Js.Str(p, "unit") <> "", " " & Js.Str(p, "unit"), "")))
                            Dim col = If(IsOut(p), Color.FromArgb(&HDC, &H26, &H26), If(IsLow(p), Color.FromArgb(&HD9, &H77, 6), Theme.G900))
                            Dim tw = TextRenderer.MeasureText(txt, Theme.BodyBold).Width
                            TextRenderer.DrawText(g, txt, Theme.BodyBold, New Rectangle(r.X, r.Y, Math.Min(tw + 2, r.Width - 36), r.Height), col, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                            If Physical(p) AndAlso Js.Int(p, "id") > 0 Then
                                Dim b As New Rectangle(Math.Min(r.X + tw + 8, r.Right - 28), r.Y + r.Height \ 2 - 12, 28, 24)
                                Using path = Theme.RoundRect(New RectangleF(b.X, b.Y, b.Width, b.Height), 4)
                                    Using br As New SolidBrush(Theme.Green) : g.FillPath(br, path) : End Using
                                End Using
                                Using f = Theme.IconFont(9) : Theme.DrawCentered(g, Theme.IcAdd, f, Color.White, b) : End Using
                            End If
                        End Sub})
        End If
        If on_("p2-c-category") Then
            t.Cols.Add(New TCol("Category", Function(p)
                                                Dim n As String = Nothing
                                                Return If(Js.IsNull(p, "categoryId"), "—", If(_catName.TryGetValue(Js.Int(p, "categoryId"), n), n, "—"))
                                            End Function, 0) With {.Flex = 11, .Colour = Function(p) Theme.G600})
            t.Cols.Last().WithSort()
        End If
        If on_("p2-c-price") Then
            t.Cols.Add(New TCol("Price", Function(p) Theme.Money(ProductActions.Price(p)), 0) With {.Flex = 10, .Colour = Function(p) Theme.G900,
                .Sub = Function(p) If(Js.Num(p, "salePrice") > 0 AndAlso Js.Num(p, "salePrice") < Js.Num(p, "price"), "MRP " & Theme.Money(Js.Num(p, "price")), ""),
                .Sort = Function(p) ProductActions.Price(p)})
        End If
        If on_("p2-c-status") Then
            t.Cols.Add(New TCol("Status", Function(p) If(Js.Str(p, "status") = "active", "Published", "Unpublished"), 0, CellKind.PillMenu) With {.Flex = 13, .Key = "status",
                .Colour = Function(p) If(Js.Str(p, "status") = "active", Theme.Green, Theme.Grey), .Sort = Function(p) Js.Str(p, "status")})
        End If
        If on_("p2-c-type") Then
            t.Cols.Add(New TCol("Type", Nothing, 0, CellKind.Custom) With {.Flex = 10, .Sort = Function(p) TypeLabel(p),
                .Draw = Sub(g, r, p)
                            Dim b As JsonObject = Nothing
                            If Not _badges.TryGetValue(Js.Str(p, "badgeTag"), b) Then
                                TextRenderer.DrawText(g, "None", Theme.Body, r, Theme.G500, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                Return
                            End If
                            Using br As New SolidBrush(Fmt.ColorFromHex(Js.Str(b, "color"), Theme.G500)) : g.FillEllipse(br, r.X, r.Y + r.Height \ 2 - 4, 8, 8) : End Using
                            TextRenderer.DrawText(g, Js.Str(b, "label"), Theme.Body, New Rectangle(r.X + 14, r.Y, r.Width - 14, r.Height), Theme.G800, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                        End Sub})
        End If
        If on_("p2-c-item") Then t.Cols.Add(New TCol("Item Type", Function(p) ItemLabel(p), 0) With {.Flex = 10}.WithSort())
        If on_("p2-c-actions") Then
            t.Cols.Add(New TCol("Actions", Nothing, 124, CellKind.Actions).Btn("barcode", Theme.IcBarcode, "Print barcode", Color.FromArgb(&HE, &HA5, &HE9)).Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        End If
        t.RowHeight = 56
        t.RowClickable = True
        If t.SortCol Is Nothing OrElse Not t.Cols.Contains(t.SortCol) Then
            t.SortCol = New TCol("created") With {.Sort = Function(p) Js.Str(p, "createdAt")}
            t.SortAsc = False
        End If
        t.EmptyText = "No products match these filters."
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim settings = s.Settings
        _badges = Js.Objs(Js.Arr(settings, "badges")).GroupBy(Function(b) Js.Str(b, "slug")).ToDictionary(Function(g) g.Key, Function(g) g.First())
        _items = Js.Objs(Js.Arr(settings, "itemTypes")).GroupBy(Function(b) Js.Str(b, "slug")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "label"))
        Dim cats = s.List("categories")
        _catName = cats.GroupBy(Function(c) Js.Int(c, "id")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "name"))
        Ui.Refill(_category, {"0|All Categories"}.Concat(cats.Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name"))))
        Ui.Refill(_type, {"all|All Types", "none|None"}.Concat(_badges.Values.Select(Function(b) Js.Str(b, "slug") & "|" & Js.Str(b, "label"))))
        Ui.Refill(_item, {"all|All Item Types", "normal|Normal"}.Concat(_items.Where(Function(kv) kv.Key <> "normal").Select(Function(kv) kv.Key & "|" & kv.Value)))
        _all = s.List("products")
        Dim status = Ui.Val(_status), stock = Ui.Val(_stock), type = Ui.Val(_type), item = Ui.Val(_item)
        Dim category = CInt(Ui.Val(_category))
        Dim words = _search.Text.Trim().ToLowerInvariant().Split(" "c, StringSplitOptions.RemoveEmptyEntries)
        Dim list = _all.Where(Function(p)
                                  If status = "active" AndAlso Js.Str(p, "status") <> "active" Then Return False
                                  If status = "inactive" AndAlso Js.Str(p, "status") = "active" Then Return False
                                  If stock = "in" AndAlso (Not Physical(p) OrElse IsOut(p)) Then Return False
                                  If stock = "low" AndAlso Not IsLow(p) Then Return False
                                  If stock = "out" AndAlso Not IsOut(p) Then Return False
                                  If category <> 0 AndAlso Js.Int(p, "categoryId") <> category Then Return False
                                  If type <> "all" AndAlso Js.Str(p, "badgeTag", "none") <> type Then Return False
                                  If item <> "all" AndAlso Js.Str(p, "itemType", "normal") <> item Then Return False
                                  If words.Length = 0 Then Return True
                                  Dim cn As String = Nothing
                                  _catName.TryGetValue(Js.Int(p, "categoryId"), cn)
                                  Dim hay = (Js.Str(p, "name") & " " & Js.Str(p, "sku") & " " & Js.Str(p, "barcode") & " " & cn).ToLowerInvariant()
                                  Return words.All(Function(w) hay.Contains(w))
                              End Function).ToList()
        _shown = list
        Dim filtersOn = words.Length > 0 OrElse status <> "all" OrElse stock <> "all" OrElse type <> "all" OrElse item <> "all" OrElse category <> 0
        _list.SetRows(list, _all.Count, filtersOn)
        _m("p2-k-total").SetValue(_all.Count.ToString("#,##0"))
        _m("p2-k-published").SetValue(_all.Where(Function(p) Js.Str(p, "status") = "active").Count().ToString("#,##0"))
        _m("p2-k-low").SetValue(_all.Where(AddressOf IsLow).Count().ToString("#,##0"))
        _m("p2-k-out").SetValue(_all.Where(AddressOf IsOut).Count().ToString("#,##0"))
        _m("p2-k-total").Selected = Not filtersOn
        _m("p2-k-published").Selected = status = "active"
        _m("p2-k-low").Selected = stock = "low"
        _m("p2-k-out").Selected = stock = "out"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("p2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("p2-cards"))
        _filters.Apply(_display, "p2-filters")
        If Not _display.IsOn("p2-filters") Then Kit.Show(_filters, False)
    End Sub

    Private Sub ExportMenu()
        Dim sel = _list.SelectedRows
        Ui.PopMenu(_export, {"shown|Shown products (" & _shown.Count & ")", "selected|Selected products (" & sel.Count & ")", "all|All products (" & _all.Count & ")"},
                   Sub(k)
                       Dim rows = If(k = "shown", _shown, If(k = "selected", sel, _all))
                       If rows.Count = 0 Then Toast("Nothing to export.", True) : Return
                       Export.Csv(Me, "Products (" & k & ")", {"ID", "Name", "SKU", "Barcode", "Category", "Price", "Sale Price", "Stock", "Unit", "Status", "Type", "Item Type"},
                                  rows.Select(Function(p)
                                                  Dim cn As String = Nothing
                                                  _catName.TryGetValue(Js.Int(p, "categoryId"), cn)
                                                  Return CType({CObj(Js.Int(p, "id")), Js.Str(p, "name"), Js.Str(p, "sku"), Js.Str(p, "barcode"), cn, CObj(Js.Num(p, "price")), If(Js.IsNull(p, "salePrice"), Nothing, CObj(Js.Num(p, "salePrice"))),
                                                               If(Js.IsNull(p, "stock"), Nothing, CObj(Js.Int(p, "stock"))), Js.Str(p, "unit"), If(Js.Str(p, "status") = "active", "Published", "Unpublished"), TypeLabel(p), ItemLabel(p)}, IEnumerable(Of Object))
                                              End Function))
                   End Sub)
    End Sub
End Class
