Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>All Products — a port of the website's Products2Body.tsx: header search ("/" jumps to it), Export menu
''' (shown / selected / all) and Add Product; 4 number cards (click to filter); 5 labelled filters; Show n entries ·
''' Select All · Bulk Actions (publish, unpublish, barcodes, delete) · Clear filters; the bordered table (image, name,
''' stock with +, category (click to filter), price, status menu, type, item type, barcode / edit / delete) and pages.</summary>
Public Class ProductsPage
    Inherits ScrollPage

    Private Const LowLimit As Integer = 5
    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_products2_display")
    Private ReadOnly _search As New SearchField("Search products, SKU, barcode…", 250) With {.Height = 40}
    Private ReadOnly _export As New HeadButton("Export", "download") With {.Caret = True}
    Private ReadOnly _add As New HeadButton("Add Product", "plus", Color.FromArgb(&HF9, &H73, &H16))
    Private ReadOnly _cards As New Columns(4, 200, 16)
    Private ReadOnly _m As New Dictionary(Of String, ProdStatCard)
    Private ReadOnly _filterCard As New CardBox(Nothing, "", 14)
    Private ReadOnly _filterRow As New Columns(5, 170, 12)
    Private ReadOnly _fStatus As New LabelSelect("circle-dot", "Status")
    Private ReadOnly _fStock As New LabelSelect("boxes", "Stock")
    Private ReadOnly _fCategory As New LabelSelect("folder-tree", "Category")
    Private ReadOnly _fType As New LabelSelect("tag", "Type")
    Private ReadOnly _fItem As New LabelSelect("layout-grid", "Item Type")
    Private ReadOnly _section As New CardBox(Nothing, "", 20)
    Private ReadOnly _tools As New ToolRow()
    Private ReadOnly _perPage As ComboBox = Ui.Filter({"10|10", "20|20", "50|50", "100|100", "0|All"}, 88)
    Private ReadOnly _selAll As New CheckLabel()
    Private ReadOnly _bulk As New HeadButton("Bulk Actions", "layers", Web.PillSecondary) With {.Height = 30}
    Private ReadOnly _clearSel As New LinkLabel2("Clear selection", Theme.G500)
    Private ReadOnly _clearFilters As New LinkLabel2("Clear filters", Color.FromArgb(&HEA, &H58, &HC), "x")
    Private ReadOnly _table As New WebTable() With {.Modern = True, .Grid = True, .HeadHeight = 42, .RowHeight = 54}
    Private ReadOnly _foot As New LedgerFooter(15)
    Private _all As New List(Of JsonObject)
    Private _shown As New List(Of JsonObject)
    Private _catName As New Dictionary(Of Integer, String)
    Private _badges As New Dictionary(Of String, JsonObject)
    Private _items As New Dictionary(Of String, String)
    Private ReadOnly _picked As New HashSet(Of Integer)
    Private _page As Integer = 1
    Private _sortKey As String = "created", _sortDesc As Boolean = True

    Public Overrides ReadOnly Property PageTitle As String = "All Products"
    Public Overrides ReadOnly Property PageSubtitle As String = "Manage everything you sell in your store"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_search, _display.Button, _export, _add}
        End Get
    End Property

    Private Function Show(k As String) As Boolean
        Return Not _display.Hidden.Contains(k)
    End Function

    Public Sub New()
        _export.Width = _export.PreferredWidth()
        For Each m In {("p2-k-total", "shopping-bag", "orange"), ("p2-k-published", "badge-check", "green"), ("p2-k-low", "triangle-alert", "amber"), ("p2-k-out", "package-x", "red")}
            Dim key = m.Item1
            Dim c = _cards.Add(New ProdStatCard(m.Item2, m.Item3))
            AddHandler c.Click, Sub() CardClick(key)
            _m(key) = c
        Next
        Body.Add(_cards)
        _fStatus.SetOptions({"all|All Status", "active|Published", "inactive|Unpublished"})
        _fStock.SetOptions({"all|All Stock", "in|In Stock", "low|Low Stock (≤ " & LowLimit & ")", "out|Out of Stock"})
        For Each f In {_fStatus, _fStock, _fCategory, _fType, _fItem}
            _filterRow.Add(f)
            AddHandler f.Changed, Sub() Refresh_(True)
        Next
        _filterCard.Add(_filterRow)
        Body.Add(_filterCard)

        Ui.SetVal(_perPage, "20")
        _perPage.ItemHeight = 28
        _tools.Left.AddRange({Lbl("Show"), _perPage, Lbl("entries"), _selAll, _bulk, _clearSel})
        _tools.Right = _clearFilters
        _section.Add(_tools)
        _section.Add(_table)
        _section.Add(_foot)
        Body.Add(_section)

        AddHandler _search.Changed, Sub() Refresh_(True)
        AddHandler _perPage.SelectedIndexChanged, Sub() Refresh_(True)
        AddHandler _foot.Pager.PageChanged, Sub()
                                                _page = _foot.Pager.Page
                                                Refresh_()
                                            End Sub
        AddHandler _selAll.Click, Sub()
                                      Dim all = _shown.Count > 0 AndAlso _shown.All(Function(p) _picked.Contains(Js.Int(p, "id")))
                                      For Each p In _shown
                                          If all Then _picked.Remove(Js.Int(p, "id")) Else _picked.Add(Js.Int(p, "id"))
                                      Next
                                      Refresh_()
                                  End Sub
        AddHandler _bulk.Click, Sub() BulkMenu()
        AddHandler _clearSel.Click, Sub()
                                        _picked.Clear()
                                        Refresh_()
                                    End Sub
        AddHandler _clearFilters.Click, Sub() ClearFilters()
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() ExportMenu()
        AddHandler _add.Click, Sub() Main?.Pick("/admin/ecommerce/products/add")
        AddHandler _table.SortChanged, Sub()
                                           Dim k = CStr(_table.SortCol?.Key)
                                           If k <> _sortKey Then _sortDesc = k = "price" Else _sortDesc = Not _table.SortAsc
                                           _sortKey = k
                                           Refresh_(True)
                                       End Sub
        AddHandler _table.SelectionChanged, Sub()
                                                For Each p In _table.Rows
                                                    Dim id = Js.Int(p, "id")
                                                    If _table.Selected.Contains(id.ToString()) Then _picked.Add(id) Else _picked.Remove(id)
                                                Next
                                                Refresh_()
                                            End Sub
        AddHandler _table.CellClickAt, AddressOf CellClick
        _table.HotSpot = Function(o, c, cell, pt) Spots(o, c, cell).Any(Function(s) s.R.Contains(pt))
        BuildCols()
    End Sub

    Private Shared Function Lbl(text As String) As Label
        Return New Label With {.Text = text, .AutoSize = False, .Font = Theme.Px(14), .ForeColor = Theme.G800, .BackColor = Color.White,
                               .TextAlign = ContentAlignment.MiddleLeft, .Width = Tr.MeasureText(text, Theme.Px(14)).Width + 2, .Height = 36}
    End Function

    ''' <summary>"/" jumps to the header search, as on the website.</summary>
    Protected Overrides Function ProcessCmdKey(ByRef msg As Message, keyData As Keys) As Boolean
        If keyData = Keys.OemQuestion AndAlso Not (TypeOf ActiveControl Is TextBoxBase) AndAlso Not _search.Box.Focused Then
            _search.Box.Focus()
            Return True
        End If
        If keyData = Keys.Escape AndAlso _search.Box.Focused Then
            _search.Text = ""
            Return True
        End If
        Return MyBase.ProcessCmdKey(msg, keyData)
    End Function

    Private Overloads Sub Refresh_(Optional firstPage As Boolean = False)
        If firstPage Then _page = 1
        MyBase.Refresh_()
    End Sub

    Private Sub CardClick(key As String)
        Select Case key
            Case "p2-k-total" : ClearFilters() : Return
            Case "p2-k-published" : _fStatus.Value = If(_fStatus.Value = "active", "all", "active")
            Case "p2-k-low" : _fStock.Value = If(_fStock.Value = "low", "all", "low")
            Case "p2-k-out" : _fStock.Value = If(_fStock.Value = "out", "all", "out")
        End Select
        Refresh_(True)
    End Sub

    Private Sub ClearFilters()
        _search.Text = ""
        For Each f In {_fStatus, _fStock, _fCategory, _fType, _fItem} : f.Value = "all" : Next
        Refresh_(True)
    End Sub

    ''' <summary>Open with a filter (dashboard: low / out of stock, a category's products).</summary>
    Public Sub ShowFilter(Optional stock As String = "all", Optional status As String = "all", Optional category As Integer = 0)
        _fStock.Value = stock : _fStatus.Value = status : _fCategory.Value = If(category = 0, "all", category.ToString())
        Refresh_(True)
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
        Return Physical(p) AndAlso Not Js.IsNull(p, "stock") AndAlso Js.Int(p, "stock") > 0 AndAlso Js.Int(p, "stock") <= LowLimit
    End Function
    Private Shared Function HasSale(p As JsonObject) As Boolean
        Return Not Js.IsNull(p, "salePrice") AndAlso Js.Num(p, "salePrice") > 0 AndAlso Js.Num(p, "salePrice") < Js.Num(p, "price")
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
    Private Function CatName(p As JsonObject) As String
        Dim n As String = Nothing
        If Js.IsNull(p, "categoryId") OrElse Not _catName.TryGetValue(Js.Int(p, "categoryId"), n) Then Return ""
        Return n
    End Function

    ' ── columns (widths as on the website; Name takes what is left) ──
    Private Sub BuildCols()
        Dim t = _table
        t.Cols.Clear()
        Dim col = Function(k As String) Show("p2-table") AndAlso Show(k)
        t.Selectable = col("p2-c-select")
        If col("p2-c-image") Then t.Cols.Add(New TCol("Image", Nothing, 58, CellKind.Custom) With {.Key = "image", .Draw = AddressOf DrawImage})
        If col("p2-c-name") Then t.Cols.Add(New TCol("Name", Nothing, 0, CellKind.Custom) With {.Key = "name", .Sort = Function(p) Js.Str(p, "name").ToLowerInvariant(), .Draw = AddressOf DrawName})
        If col("p2-c-stock") Then t.Cols.Add(New TCol("Stock", Nothing, 112, CellKind.Custom) With {.Key = "stock", .Sort = Function(p) If(Physical(p), If(Js.IsNull(p, "stock"), 0, Js.Int(p, "stock")), Integer.MaxValue), .Draw = AddressOf DrawStock})
        If col("p2-c-category") Then t.Cols.Add(New TCol("Category", Nothing, 150, CellKind.Custom) With {.Key = "category", .Sort = Function(p) If(CatName(p) = "", ChrW(&HFFFF), CatName(p).ToLowerInvariant()), .Draw = AddressOf DrawCategory})
        If col("p2-c-price") Then t.Cols.Add(New TCol("Price", Nothing, 120, CellKind.Custom) With {.Key = "price", .Sort = Function(p) ProductActions.Price(p), .Draw = AddressOf DrawPrice})
        If col("p2-c-status") Then t.Cols.Add(New TCol("Status", Nothing, 150, CellKind.Custom) With {.Key = "status", .Sort = Function(p) Js.Str(p, "status"), .Draw = AddressOf DrawStatus})
        If col("p2-c-type") Then t.Cols.Add(New TCol("Type", Nothing, 116, CellKind.Custom) With {.Key = "type", .Sort = Function(p) TypeLabel(p).ToLowerInvariant(), .Draw = AddressOf DrawType})
        If col("p2-c-item") Then t.Cols.Add(New TCol("Item Type", Nothing, 124, CellKind.Custom) With {.Key = "item", .Sort = Function(p) ItemLabel(p).ToLowerInvariant(), .Draw = Sub(g, c, p) Tr.DrawText(g, ItemLabel(p), _f14, c, Theme.G700, TextFormatFlags.VerticalCenter Or TF)})
        If col("p2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 148, CellKind.Custom) With {.Key = "actions", .Draw = AddressOf DrawActions})
        t.RowClickable = False
        t.SortCol = t.Cols.FirstOrDefault(Function(c) c.Key = _sortKey)
        t.SortAsc = Not _sortDesc
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim settings = s.Settings
        _badges = Js.Objs(Js.Arr(settings, "badges")).GroupBy(Function(b) Js.Str(b, "slug")).ToDictionary(Function(g) g.Key, Function(g) g.First())
        _items = Js.Objs(Js.Arr(settings, "itemTypes")).GroupBy(Function(b) Js.Str(b, "slug")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "label"))
        Dim cats = s.List("categories")
        _catName = cats.GroupBy(Function(c) Js.Int(c, "id")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "name"))
        _all = s.List("products")
        Dim uncategorised = _all.Any(Function(p) Js.IsNull(p, "categoryId"))
        _fCategory.SetOptions({"all|All Categories"}.Concat(cats.Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name"))).Concat(If(uncategorised OrElse _fCategory.Value = "none", {"none|Uncategorized"}, Array.Empty(Of String)())))
        _fType.SetOptions({"all|All Types", "none|None"}.Concat(_badges.Values.Where(Function(b) Js.Str(b, "slug") <> "none").Select(Function(b) Js.Str(b, "slug") & "|" & Js.Str(b, "label"))))
        _fItem.SetOptions({"all|All Item Types", "normal|Normal"}.Concat(_items.Where(Function(kv) kv.Key <> "normal").Select(Function(kv) kv.Key & "|" & kv.Value)))
        _fStatus.Dot = If(_fStatus.Value = "active", Color.FromArgb(&H10, &HB9, &H81), If(_fStatus.Value = "inactive", Theme.G400, Color.Empty))
        _fStock.Dot = If(_fStock.Value = "in", Color.FromArgb(&H10, &HB9, &H81), If(_fStock.Value = "low", Color.FromArgb(&HF5, &H9E, &HB), If(_fStock.Value = "out", Color.FromArgb(&HEF, &H44, &H44), Color.Empty)))

        Dim status = _fStatus.Value, stock = _fStock.Value, category = _fCategory.Value, type = _fType.Value, item = _fItem.Value
        Dim term = _search.Text.Trim().ToLowerInvariant()
        Dim list = _all.Where(Function(p)
                                  If status <> "all" AndAlso Js.Str(p, "status") <> status Then Return False
                                  If stock = "out" AndAlso Not IsOut(p) Then Return False
                                  If stock = "low" AndAlso Not IsLow(p) Then Return False
                                  If stock = "in" AndAlso IsOut(p) Then Return False
                                  If category = "none" AndAlso Not Js.IsNull(p, "categoryId") Then Return False
                                  If category <> "all" AndAlso category <> "none" AndAlso Js.Int(p, "categoryId").ToString() <> category Then Return False
                                  If type <> "all" AndAlso Js.Str(p, "badgeTag", "none") <> type Then Return False
                                  If item <> "all" AndAlso Js.Str(p, "itemType", "normal") <> item Then Return False
                                  If term <> "" AndAlso Not (Js.Str(p, "name") & " " & Js.Str(p, "sku") & " " & Js.Str(p, "barcode") & " " & CatName(p) & " " & Js.Str(p, "brand")).ToLowerInvariant().Contains(term) Then Return False
                                  Return True
                              End Function)
        Dim key As Func(Of JsonObject, IComparable) = _table.Cols.FirstOrDefault(Function(c) c.Key = _sortKey)?.Sort
        If key Is Nothing Then key = Function(p) Js.Str(p, "createdAt")
        _shown = If(_sortDesc, list.OrderByDescending(key).ThenByDescending(Function(p) Js.Int(p, "id")), list.OrderBy(key).ThenBy(Function(p) Js.Int(p, "id"))).ToList()
        Dim ids = New HashSet(Of Integer)(_all.Select(Function(p) Js.Int(p, "id")))
        _picked.RemoveWhere(Function(id) Not ids.Contains(id))

        ' cards
        Dim filtersOn = term <> "" OrElse {status, stock, category, type, item}.Any(Function(v) v <> "all")
        _m("p2-k-total").SetValue(_all.Count, "Total Products", Not filtersOn)
        _m("p2-k-published").SetValue(_all.Where(Function(p) Js.Str(p, "status") = "active").Count(), "Published", status = "active")
        _m("p2-k-low").SetValue(_all.Where(AddressOf IsLow).Count(), "Low Stock (≤ " & LowLimit & ")", stock = "low")
        _m("p2-k-out").SetValue(_all.Where(AddressOf IsOut).Count(), "Out of Stock", stock = "out")

        ' page
        Dim size = CInt(Ui.Val(_perPage))
        Dim pages = If(size = 0, 1, Math.Max(1, CInt(Math.Ceiling(_shown.Count / size))))
        _page = Math.Min(_page, pages)
        Dim start = If(size = 0, 0, (_page - 1) * size)
        Dim pageRows = If(size = 0, _shown, _shown.Skip(start).Take(size).ToList())
        _table.Rows = pageRows
        _table.Selected.Clear()
        For Each id In _picked : _table.Selected.Add(id.ToString()) : Next
        _table.MinRows = If(size = 0, 0, Math.Min(size, 10))
        _table.EmptyText = If(_all.Count = 0, "No products yet. Add your first product.", "No products match these filters.")
        _table.Invalidate()
        _foot.Text_ = If(_shown.Count = 0, "Showing 0 entries", "Showing " & (start + 1) & " to " & (start + pageRows.Count) & " of " & _shown.Count & " entries") &
                      If(_shown.Count <> _all.Count, " (filtered from " & _all.Count & " total entries)", "")
        _foot.Pager.PageCount = pages
        _foot.Pager.Page = _page
        _foot.Pager.Visible = pages > 1
        _foot.Invalidate()
        _foot.PerformLayout()

        ' toolbar
        _selAll.Checked = _shown.Count > 0 AndAlso _shown.All(Function(p) _picked.Contains(Js.Int(p, "id")))
        _selAll.Text = "Select All (" & _picked.Count & ")"
        _bulk.Enabled = _picked.Count > 0
        Dim sel = Show("p2-c-select")
        Kit.Show(_selAll, sel) : Kit.Show(_bulk, sel) : Kit.Show(_clearSel, sel AndAlso _picked.Count > 0)
        Kit.Show(_clearFilters, filtersOn)
        _tools.PerformLayout()

        ' Display Options
        Dim anyCard = False
        For Each kv In _m
            Kit.Show(kv.Value, Show(kv.Key))
            anyCard = anyCard OrElse Show(kv.Key)
        Next
        Kit.Show(_cards, Show("p2-cards") AndAlso anyCard)
        Dim anyFilter = False
        For Each f In {("p2-f-status", _fStatus), ("p2-f-stock", _fStock), ("p2-f-category", _fCategory), ("p2-f-type", _fType), ("p2-f-item", _fItem)}
            Kit.Show(f.Item2, Show(f.Item1))
            anyFilter = anyFilter OrElse Show(f.Item1)
        Next
        Kit.Show(_filterCard, Show("p2-filters") AndAlso anyFilter)
        Kit.Show(_section, Show("p2-table"))
        Kit.Show(_table, _table.Cols.Count > 0)
    End Sub

    ' ── cells ──
    Private ReadOnly _f14 As Font = Theme.Px(14)
    Private ReadOnly _f14m As Font = Theme.Px(14, 500)
    Private ReadOnly _f14b As Font = Theme.Px(14, 700)
    Private ReadOnly _f11 As Font = Theme.Px(11)
    Private Const TF As TextFormatFlags = TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or TextFormatFlags.SingleLine

    Private Sub DrawImage(g As Graphics, c As Rectangle, p As JsonObject)
        Dim r As New Rectangle(c.X - 4, c.Y + (c.Height - 36) \ 2, 36, 36)
        Dim src = If(Js.Str(p, "image") <> "", Js.Str(p, "image"), Js.Str(p, "localImage"))
        Dim row = _table.Rows.IndexOf(p)
        Dim im = If(src = "", Nothing, Img.Get(src, 72, Sub(x) If Not _table.IsDisposed Then _table.Invalidate()))
        Using path = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, 35, 35), Theme.Radius)
            Using b As New SolidBrush(If(im Is Nothing, Theme.G50, Color.White)) : g.FillPath(b, path) : End Using
            If im IsNot Nothing Then
                Dim old = g.Clip
                g.SetClip(path)
                g.DrawImage(im, r)
                g.Clip = old
            Else
                Icons.Draw(g, "image", New RectangleF(r.X + 10, r.Y + 10, 16, 16), Theme.G300)
            End If
            Using pen As New Pen(Theme.G100) : g.DrawPath(pen, path) : End Using
        End Using
    End Sub

    Private Sub DrawName(g As Graphics, c As Rectangle, p As JsonObject)
        If Show("p2-c-stock") Then
            Tr.DrawText(g, Js.Str(p, "name"), _f14m, c, Theme.G900, TextFormatFlags.VerticalCenter Or TF)
        Else
            Dim y = c.Y + (c.Height - 36) \ 2
            Tr.DrawText(g, Js.Str(p, "name"), _f14m, New Rectangle(c.X, y, c.Width, 20), Theme.G900, TF)
            Dim note = If(Not Physical(p), "Stock not tracked", If(IsOut(p), "Out of stock", Js.Int(p, "stock") & If(Js.Str(p, "unit") <> "", " " & Js.Str(p, "unit"), "") & " in stock"))
            Tr.DrawText(g, note, Theme.Px(12), New Rectangle(c.X, y + 20, c.Width, 16), If(IsOut(p), Color.FromArgb(&HDC, &H26, &H26), If(IsLow(p), Color.FromArgb(&HD9, &H77, 6), Theme.G500)), TF)
        End If
    End Sub

    Private Function PlusRect(p As JsonObject, c As Rectangle) As Rectangle
        If Not Physical(p) OrElse Js.Int(p, "id") <= 0 Then Return Rectangle.Empty
        Return New Rectangle(c.Right - 30, c.Y + (c.Height - 24) \ 2, 30, 24)
    End Function

    Private Sub DrawStock(g As Graphics, c As Rectangle, p As JsonObject)
        If Not Physical(p) Then Tr.DrawText(g, "—", _f14, c, Theme.G400, TextFormatFlags.VerticalCenter Or TF) : Return
        Dim qty = If(Js.IsNull(p, "stock"), "0", Js.Int(p, "stock").ToString())
        Dim col = If(IsOut(p), Color.FromArgb(&HDC, &H26, &H26), If(IsLow(p), Color.FromArgb(&HD9, &H77, 6), Theme.G900))
        Dim qw = Tr.MeasureText(qty, _f14b).Width
        Tr.DrawText(g, qty, _f14b, New Rectangle(c.X, c.Y, qw + 2, c.Height), col, TextFormatFlags.VerticalCenter Or TF)
        If Js.Str(p, "unit") <> "" Then Tr.DrawText(g, Js.Str(p, "unit"), _f11, New Rectangle(c.X + qw + 4, c.Y + 2, Math.Max(0, c.Width - qw - 40), c.Height), Theme.G500, TextFormatFlags.VerticalCenter Or TF)
        Dim b = PlusRect(p, c)
        If Not b.IsEmpty Then
            Using br As New SolidBrush(If(b.Contains(_table.HoverPoint), Color.FromArgb(&H17, &HA6, &H73), Web.PillSuccess)) : g.FillRectangle(br, b) : End Using
            Icons.Draw(g, "plus", New RectangleF(b.X + 8, b.Y + 5, 14, 14), Color.White)
        End If
    End Sub

    Private Sub DrawCategory(g As Graphics, c As Rectangle, p As JsonObject)
        Dim n = CatName(p)
        If n = "" Then Tr.DrawText(g, "—", _f14, c, Theme.G400, TextFormatFlags.VerticalCenter Or TF) : Return
        Dim hot = New Rectangle(c.X, c.Y, Math.Min(c.Width, Tr.MeasureText(n, _f14).Width + 2), c.Height).Contains(_table.HoverPoint)
        Tr.DrawText(g, n, _f14, c, If(hot, Web.Blue, Theme.G700), TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Sub DrawPrice(g As Graphics, c As Rectangle, p As JsonObject)
        Dim sale = HasSale(p)
        Dim y = c.Y + (c.Height - If(sale, 34, 20)) \ 2
        Tr.DrawText(g, Theme.Money(ProductActions.Price(p)), _f14, New Rectangle(c.X, y, c.Width, 20), Theme.G900, TF)
        If sale Then
            Dim t = Theme.Money(Js.Num(p, "price"))
            Tr.DrawText(g, t, _f11, New Rectangle(c.X, y + 20, c.Width, 14), Theme.G400, TF)
            Dim w = Tr.MeasureText(t, _f11).Width
            Using pen As New Pen(Theme.G400) : g.DrawLine(pen, c.X, y + 27, c.X + w, y + 27) : End Using
        End If
    End Sub

    Private Function StatusText(p As JsonObject) As String
        Return If(Js.Str(p, "status") = "active", "Published", "Unpublished")
    End Function

    Private Sub DrawStatus(g As Graphics, c As Rectangle, p As JsonObject)
        Dim t = StatusText(p)
        Web.DrawPill(g, t, c.X, c.Y + c.Height \ 2, If(t = "Published", Web.PillSuccess, Web.PillSecondary), Js.Int(p, "id") > 0)
    End Sub

    Private Sub DrawType(g As Graphics, c As Rectangle, p As JsonObject)
        Dim b As JsonObject = Nothing
        If Js.Str(p, "badgeTag", "none") = "none" OrElse Not _badges.TryGetValue(Js.Str(p, "badgeTag"), b) Then
            Tr.DrawText(g, TypeLabel(p), _f14, c, Theme.G500, TextFormatFlags.VerticalCenter Or TF)
            Return
        End If
        Using br As New SolidBrush(Fmt.ColorFromHex(Js.Str(b, "color"), Theme.G500)) : g.FillEllipse(br, c.X, c.Y + c.Height \ 2 - 4, 8, 8) : End Using
        Tr.DrawText(g, Js.Str(b, "label"), _f14, New Rectangle(c.X + 14, c.Y, c.Width - 14, c.Height), Theme.G800, TextFormatFlags.VerticalCenter Or TF)
    End Sub

    Private Function ActionRects(c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim y = c.Y + (c.Height - 34) \ 2
        Return New List(Of (String, Rectangle)) From {("barcode", New Rectangle(c.X, y, 34, 34)), ("edit", New Rectangle(c.X + 40, y, 34, 34)), ("delete", New Rectangle(c.X + 80, y, 34, 34))}
    End Function

    Private Sub DrawActions(g As Graphics, c As Rectangle, p As JsonObject)
        For Each a In ActionRects(c)
            Dim icon = If(a.Key = "barcode", "barcode", If(a.Key = "edit", "square-pen", "trash-2"))
            Dim bg = If(a.Key = "barcode", Web.PillSecondary, If(a.Key = "edit", Web.PillPrimary, Web.PillDanger))
            Web.DrawIconAction(g, a.R, icon, bg, a.R.Contains(_table.HoverPoint))
        Next
    End Sub

    Private Function Spots(p As JsonObject, col As TCol, c As Rectangle) As List(Of (Key As String, R As Rectangle))
        Dim l As New List(Of (String, Rectangle))
        Select Case col.Key
            Case "image" : l.Add(("edit", New Rectangle(c.X - 4, c.Y + (c.Height - 36) \ 2, 36, 36)))
            Case "name" : l.Add(("edit", New Rectangle(c.X, c.Y + 8, Math.Min(c.Width, Tr.MeasureText(Js.Str(p, "name"), _f14m).Width + 2), c.Height - 16)))
            Case "stock"
                Dim b = PlusRect(p, c)
                If Not b.IsEmpty Then l.Add(("stock", b))
            Case "category"
                If CatName(p) <> "" Then l.Add(("category", New Rectangle(c.X, c.Y + 8, Math.Min(c.Width, Tr.MeasureText(CatName(p), _f14).Width + 2), c.Height - 16)))
            Case "status"
                If Js.Int(p, "id") > 0 Then l.Add(("status", New Rectangle(c.X, c.Y + c.Height \ 2 - 15, Web.PillWidth(StatusText(p), True), 30)))
            Case "actions" : l.AddRange(ActionRects(c))
        End Select
        Return l
    End Function

    Private Async Sub CellClick(p As JsonObject, col As TCol, cell As Rectangle, pt As Point)
        Dim hit = Spots(p, col, cell).FirstOrDefault(Function(s) s.R.Contains(pt))
        If hit.Key Is Nothing Then Return
        Select Case hit.Key
            Case "edit" : Edit(p)
            Case "stock" : ProductActions.AdjustStock(Me, p)
            Case "category"
                _fCategory.Value = Js.Int(p, "categoryId").ToString()
                Refresh_(True)
            Case "status"
                Dim cur = Js.Str(p, "status")
                WebMenu.Show(_table, {If(cur = "active", "*", "") & "active|Published", If(cur <> "active", "*", "") & "inactive|Unpublished"},
                             Sub(v) If v <> cur Then ProductActions.SetStatus(Me, {p}, v), _table.PointToScreen(New Point(hit.R.X, hit.R.Bottom + 2)))
            Case "barcode"
                If Js.Str(p, "barcode") = "" Then Toast("Add a barcode to this product first.") Else PrintBarcodes({p}.ToList())
            Case "delete" : Await ProductActions.DeleteAsync(Me, {p}.ToList())
        End Select
    End Sub

    Private Function PickedRows() As List(Of JsonObject)
        Return _all.Where(Function(p) _picked.Contains(Js.Int(p, "id"))).ToList()
    End Function

    Private Sub BulkMenu()
        If _picked.Count = 0 Then Return
        Dim n = _picked.Count
        WebMenu.Show(_bulk, {"publish|Publish (" & n & ")", "unpublish|Unpublish (" & n & ")", "barcodes|Print Barcodes (" & n & ")", "-", "!delete|Delete (" & n & ")"},
                     Async Sub(k)
                         Dim rows = PickedRows()
                         Select Case k
                             Case "publish" : ProductActions.SetStatus(Me, rows, "active")
                             Case "unpublish" : ProductActions.SetStatus(Me, rows, "inactive")
                             Case "barcodes" : PrintBarcodes(rows)
                             Case "delete"
                                 Await ProductActions.DeleteAsync(Me, rows)
                                 _picked.Clear()
                                 Refresh_()
                         End Select
                     End Sub)
    End Sub

    Private Sub ExportMenu()
        Dim sel = PickedRows()
        WebMenu.Show(_export, {"shown|Shown products (" & _shown.Count & ")|file-text", "selected|Selected products (" & sel.Count & ")|file-text", "all|All products (" & _all.Count & ")|file-text"},
                     Sub(k)
                         Dim rows = If(k = "shown", _shown, If(k = "selected", sel, _all))
                         If rows.Count = 0 Then Toast("Nothing to export.", True) : Return
                         Export.Csv(Me, "products-" & If(k = "shown", "filtered", k) & "-" & Date.Today.ToString("yyyy-MM-dd"), {"ID", "Name", "Category", "SKU", "Barcode", "Price", "Sale Price", "Stock", "Unit", "Status", "Type", "Item Type"},
                                    rows.Select(Function(p) CType({CObj(Js.Int(p, "id")), Js.Str(p, "name"), CatName(p), Js.Str(p, "sku"), Js.Str(p, "barcode"), CObj(Js.Num(p, "price").ToString("0.00")),
                                                                   If(Js.IsNull(p, "salePrice"), "", Js.Num(p, "salePrice").ToString("0.00")), If(Js.IsNull(p, "stock"), "", Js.Int(p, "stock").ToString()),
                                                                   Js.Str(p, "unit"), StatusText(p), TypeLabel(p), ItemLabel(p)}, IEnumerable(Of Object))))
                     End Sub, alignRight:=True)
    End Sub
End Class

''' <summary>A Products number card: tinted round icon, big number and label; orange ring when it is the active filter.</summary>
Public Class ProdStatCard
    Inherits Control
    Private ReadOnly _icon As String, _tint As Color, _ink As Color
    Private _value As Integer, _label As String = "", _active As Boolean, _hover As Boolean
    Public Sub New(icon As String, tone As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _icon = icon
        Select Case tone
            Case "orange" : _tint = Color.FromArgb(&HFF, &HF7, &HED) : _ink = Color.FromArgb(&HF9, &H73, &H16)
            Case "green" : _tint = Color.FromArgb(&HEC, &HFD, &HF5) : _ink = Color.FromArgb(&H10, &HB9, &H81)
            Case "amber" : _tint = Color.FromArgb(&HFF, &HFB, &HEB) : _ink = Color.FromArgb(&HF5, &H9E, &HB)
            Case Else : _tint = Color.FromArgb(&HFE, &HF2, &HF2) : _ink = Color.FromArgb(&HEF, &H44, &H44)
        End Select
        Height = 84
        Cursor = Cursors.Hand
    End Sub
    Public Sub SetValue(v As Integer, label As String, active As Boolean)
        _value = v : _label = label : _active = active
        Invalidate()
    End Sub
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(If(_active, Color.FromArgb(&HFF, &HFB, &HF7), Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(_active, Color.FromArgb(&HFD, &HBA, &H74), If(_hover, Theme.G300, Theme.G200)), If(_active, 2, 1)) : g.DrawPath(pen, p) : End Using
        End Using
        Dim cy = Height \ 2
        Using b As New SolidBrush(_tint) : g.FillEllipse(b, 20, cy - 24, 48, 48) : End Using
        Icons.Draw(g, _icon, New RectangleF(32, cy - 12, 24, 24), _ink)
        Tr.DrawText(g, _value.ToString("#,##0"), Theme.Px(24, 700), New Point(84, cy - 28), Theme.G900, TextFormatFlags.NoPadding)
        Tr.DrawText(g, _label, Theme.Px(14), New Rectangle(84, cy + 4, Width - 96, 20), Theme.G600, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
    End Sub
End Class

''' <summary>The website's labelled filter box: icon, a small grey label above the chosen value, a coloured dot when it
''' filters and a chevron; opens the choices as a website menu.</summary>
Public Class LabelSelect
    Inherits Control
    Public Event Changed()
    Private ReadOnly _icon As String, _label As String
    Private _opts As New List(Of (Value As String, Text As String))
    Private _value As String = "all"
    Private _hover As Boolean
    Public Dot As Color = Color.Empty
    ''' <summary>Blue border, light blue fill and blue icon while it filters (Due page style).</summary>
    Public Highlight As Boolean
    Public Sub New(icon As String, label As String)
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        _icon = icon : _label = label
        Height = 48
        Cursor = Cursors.Hand
    End Sub
    Public Sub SetOptions(items As IEnumerable(Of String))
        _opts = items.Select(Function(i)
                                 Dim k = i.IndexOf("|"c)
                                 Return (i.Substring(0, k), i.Substring(k + 1))
                             End Function).ToList()
        If Not _opts.Any(Function(o) o.Value = _value) AndAlso _opts.Count > 0 Then _value = _opts(0).Value
        Invalidate()
    End Sub
    Public Property Value As String
        Get
            Return _value
        End Get
        Set(v As String)
            _value = If(_opts.Count = 0 OrElse _opts.Any(Function(o) o.Value = v), v, _opts(0).Value)
            Invalidate()
        End Set
    End Property
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnClick(e As EventArgs)
        MyBase.OnClick(e)
        WebMenu.Show(Me, _opts.Select(Function(o) If(o.Value = _value, "*", "") & o.Value & "|" & o.Text), Sub(k)
                                                                                                          If k = _value Then Return
                                                                                                          _value = k : Invalidate()
                                                                                                          RaiseEvent Changed()
                                                                                                      End Sub, PointToScreen(New Point(0, Height + 2)))
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Behind(Me))
        Theme.Smooth(g)
        Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, Width - 1.5F, Height - 1.5F), Theme.Radius)
            Using b As New SolidBrush(If(Highlight, Color.FromArgb(&HF5, &HF9, &HFF), Color.White)) : g.FillPath(b, p) : End Using
            Using pen As New Pen(If(Highlight, Color.FromArgb(&H9C, &HBD, &HF5), If(_hover, Theme.G300, Theme.G200))) : g.DrawPath(pen, p) : End Using
        End Using
        Icons.Draw(g, _icon, New RectangleF(12, (Height - 16) / 2.0F, 16, 16), If(Highlight, Web.Blue, Theme.G500))
        Dim x = 38
        Tr.DrawText(g, _label, Theme.Px(12), New Point(x, 7), Theme.G500, TextFormatFlags.NoPadding)
        Dim vx = x
        If Dot <> Color.Empty Then
            Using b As New SolidBrush(Dot) : g.FillEllipse(b, vx, 29, 8, 8) : End Using
            vx += 14
        End If
        Dim t = _opts.FirstOrDefault(Function(o) o.Value = _value).Text
        Tr.DrawText(g, If(t, ""), Theme.Px(14, 500), New Rectangle(vx, 24, Width - vx - 32, 20), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Icons.Draw(g, "chevron-down", New RectangleF(Width - 26, (Height - 16) / 2.0F, 16, 16), Theme.G500)
    End Sub
End Class

''' <summary>A checkbox with its label (website "Select All (n)").</summary>
Public Class CheckLabel
    Inherits Control
    Public Checked As Boolean
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Height = 36
        Cursor = Cursors.Hand
    End Sub
    Protected Overrides Sub OnTextChanged(e As EventArgs)
        MyBase.OnTextChanged(e)
        Width = 16 + 8 + Tr.MeasureText(Text, Theme.Px(14)).Width + 16
        Parent?.PerformLayout()
        Invalidate()
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Theme.Smooth(g)
        Using pen As New Pen(Theme.G200) : g.DrawLine(pen, 0, 6, 0, 30) : End Using
        Web.DrawCheck(g, New Rectangle(16, 10, 16, 16), Checked, Web.Blue)
        Tr.DrawText(g, Text, Theme.Px(14), New Rectangle(40, 0, Width - 40, Height), Theme.G800, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub
End Class

''' <summary>A small text button (Clear selection / Clear filters).</summary>
Public Class LinkLabel2
    Inherits Control
    Private ReadOnly _ink As Color, _icon As String
    Private _hover As Boolean
    Public Sub New(text As String, ink As Color, Optional icon As String = "")
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Color.White
        Me.Text = text : _ink = ink : _icon = icon
        Height = 36
        Width = If(icon = "", 0, 18) + Tr.MeasureText(text, Theme.Px(13, 500)).Width + 4
        Cursor = Cursors.Hand
    End Sub
    Protected Overrides Sub OnMouseEnter(e As EventArgs)
        _hover = True : Invalidate() : MyBase.OnMouseEnter(e)
    End Sub
    Protected Overrides Sub OnMouseLeave(e As EventArgs)
        _hover = False : Invalidate() : MyBase.OnMouseLeave(e)
    End Sub
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Color.White)
        Dim c = If(_hover, Theme.Darker(_ink, 0.8), _ink)
        Dim x = 0
        If _icon <> "" Then Icons.Draw(g, _icon, New RectangleF(0, 11, 14, 14), c) : x = 18
        Tr.DrawText(g, Text, Theme.Px(13, 500), New Rectangle(x, 0, Width - x, Height), c, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub
End Class
