Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Categories" as on the website: 4 cards, Status / Sort filters, select + Bulk Actions (activate,
''' deactivate, export, delete), the table (image, name, slug, products, serial, status, last updated,
''' actions) and the add / edit form. From the synced list — works offline.</summary>
Public Class CategoriesPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_categories2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _add As WButton = Ui.Btn("Add Category", Theme.IcAdd, Theme.Blue)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All", "active|Active", "inactive|Inactive"})
    Private ReadOnly _sort As ComboBox = Ui.Filter({"newest|Newest First", "oldest|Oldest First", "name-asc|Name (A–Z)", "name-desc|Name (Z–A)", "serial|Serial", "products|Most Products"})
    Private ReadOnly _list As New ListCard("categories")
    Private _counts As New Dictionary(Of Integer, Integer)
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Categories"
    Public Overrides ReadOnly Property PageSubtitle As String = "Manage and organize your product catalog"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export, _add}
        End Get
    End Property

    Public Sub New()
        For Each m In {("c2-k-total", "Total Categories", Theme.IcGrid, Theme.Primary), ("c2-k-active", "Active Categories", Theme.IcDone, Color.FromArgb(5, &H96, &H69)),
                       ("c2-k-inactive", "Inactive Categories", Theme.IcBlock, Color.FromArgb(&HEF, &H44, &H44)), ("c2-k-products", "Products Assigned", Theme.IcPackage, Theme.Blue)}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     Select Case key
                                         Case "c2-k-total" : Ui.SetVal(_status, "all") : _list.Search.Text = ""
                                         Case "c2-k-active" : Ui.SetVal(_status, If(Ui.Val(_status) = "active", "all", "active"))
                                         Case "c2-k-inactive" : Ui.SetVal(_status, If(Ui.Val(_status) = "inactive", "all", "inactive"))
                                         Case Else : Main?.Pick("/admin/ecommerce/products")
                                     End Select
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("c2-f-status", "Status", _status)
        _filters.Add("c2-f-sort", "Sort", _sort)
        AddHandler _filters.Changed, Sub() Refresh_()
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Search categories…"
        _list.BulkItems.AddRange({"active|Activate", "inactive|Deactivate", "export|Export selected (Excel)", "-", "!delete|Delete"})
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           Ui.SetVal(_status, "all")
                                       End Sub
        AddHandler _list.Bulk, Async Sub(k, rows)
                                   Select Case k
                                       Case "active", "inactive" : Patch(rows, k)
                                       Case "export" : DoExport(rows)
                                       Case "delete" : Await DeleteAsync(rows)
                                   End Select
                               End Sub
        AddHandler _list.Table.RowClick, Sub(c) Edit(c)
        AddHandler _list.Table.CellClick, Sub(c, col, cell)
                                              Select Case col.Key
                                                  Case "status"
                                                      Ui.PopMenu(Me, {If(Js.Str(c, "status") = "active", "*", "") & "active|Active", If(Js.Str(c, "status") <> "active", "*", "") & "inactive|Inactive"}, Sub(v) Patch({c}.ToList(), v), New Point(cell.X + 10, cell.Bottom - 8))
                                                  Case "products" : ViewProducts(c)
                                                  Case Else : Edit(c)
                                              End Select
                                          End Sub
        AddHandler _list.Table.ActionClick, Async Sub(c, k)
                                                Select Case k
                                                    Case "edit" : Edit(c)
                                                    Case "products" : ViewProducts(c)
                                                    Case "delete" : Await DeleteAsync({c}.ToList())
                                                End Select
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport(_shown)
        AddHandler _add.Click, Sub() Edit(Nothing)
        BuildCols()
    End Sub

    Private Function Count(c As JsonObject) As Integer
        Dim n = 0
        _counts.TryGetValue(Js.Int(c, "id"), n)
        Return n
    End Function

    Private Shared Function Updated(c As JsonObject) As String
        Return Js.Str(c, "updatedAt", Js.Str(c, "createdAt"))
    End Function

    Private Sub ViewProducts(c As JsonObject)
        Dim pp = TryCast(Main?.Go("/admin/ecommerce/products"), ProductsPage)
        pp?.ShowFilter(category:=Js.Int(c, "id"))
    End Sub

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("c2-table", k)
        _list.Selectable = col("c2-c-select")
        _list.ShowSearch = col("c2-t-search")
        If col("c2-c-image") Then t.Cols.Add(New TCol("Image", Nothing, 80, CellKind.Thumb) With {.Picture = Function(c) Js.Str(c, "image")})
        If col("c2-c-name") Then t.Cols.Add(New TCol("Category Name", Function(c) Js.Str(c, "name"), 0, CellKind.Bold) With {.Flex = 16}.WithSort())
        If col("c2-c-slug") Then t.Cols.Add(New TCol("Slug", Function(c) Js.Str(c, "slug"), 0) With {.Flex = 11, .Colour = Function(c) Theme.G500}.WithSort())
        If col("c2-c-products") Then t.Cols.Add(New TCol("Products", Function(c) Count(c).ToString(), 0, CellKind.Link) With {.Flex = 7, .Key = "products", .Colour = Function(c) Theme.Blue, .Sort = Function(c) Count(c)})
        If col("c2-c-serial") Then t.Cols.Add(New TCol("Serial", Function(c) Js.Int(c, "serial").ToString("000"), 0) With {.Flex = 6, .Sort = Function(c) Js.Int(c, "serial")})
        If col("c2-c-status") Then
            t.Cols.Add(New TCol("Status", Function(c) If(Js.Str(c, "status") = "active", "Active", "Inactive"), 0, CellKind.PillMenu) With {.Flex = 9, .Key = "status",
                .Colour = Function(c) If(Js.Str(c, "status") = "active", Theme.Green, Theme.Grey)})
        End If
        If col("c2-c-updated") Then t.Cols.Add(New TCol("Last Updated", Function(c) Fmt.Day(If(Js.Time(c, "updatedAt"), Js.Time(c, "createdAt"))), 0) With {.Flex = 10, .Colour = Function(c) Theme.G600, .Sort = Function(c) Updated(c)})
        If col("c2-c-actions") Then
            t.Cols.Add(New TCol("Actions", Nothing, 124, CellKind.Actions).Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("products", Theme.IcPackage, "View products", Theme.G700).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        End If
        t.RowHeight = 62
        t.RowClickable = True
        t.EmptyText = "No categories yet."
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim cats = s.List("categories")
        Dim products = s.List("products")
        _counts = products.Where(Function(p) Not Js.IsNull(p, "categoryId")).GroupBy(Function(p) Js.Int(p, "categoryId")).ToDictionary(Function(g) g.Key, Function(g) g.Count())
        Dim status = Ui.Val(_status)
        Dim list = cats.Where(Function(c) (status = "all" OrElse (Js.Str(c, "status") = "active") = (status = "active")) AndAlso _list.Matches(Js.Str(c, "name") & " " & Js.Str(c, "slug"))).ToList()
        Select Case Ui.Val(_sort)
            Case "oldest" : list = list.OrderBy(Function(c) Updated(c)).ToList()
            Case "name-asc" : list = list.OrderBy(Function(c) Js.Str(c, "name").ToLowerInvariant()).ToList()
            Case "name-desc" : list = list.OrderByDescending(Function(c) Js.Str(c, "name").ToLowerInvariant()).ToList()
            Case "serial" : list = list.OrderBy(Function(c) Js.Int(c, "serial")).ToList()
            Case "products" : list = list.OrderByDescending(Function(c) Count(c)).ToList()
            Case Else : list = list.OrderByDescending(Function(c) Updated(c)).ToList()
        End Select
        _list.Table.SortCol = Nothing
        _shown = list
        _list.SetRows(list, cats.Count, status <> "all")
        _m("c2-k-total").SetValue(cats.Count.ToString())
        _m("c2-k-active").SetValue(cats.Where(Function(c) Js.Str(c, "status") = "active").Count().ToString())
        _m("c2-k-inactive").SetValue(cats.Where(Function(c) Js.Str(c, "status") <> "active").Count().ToString())
        _m("c2-k-products").SetValue(products.Where(Function(p) Not Js.IsNull(p, "categoryId")).Count().ToString())
        _m("c2-k-total").Selected = status = "all" AndAlso _list.Query = ""
        _m("c2-k-active").Selected = status = "active"
        _m("c2-k-inactive").Selected = status = "inactive"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("c2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("c2-cards"))
        _filters.Apply(_display, "c2-filters")
        If Not _display.IsOn("c2-filters") Then Kit.Show(_filters, False)
        Kit.Show(_list, _display.IsOn("c2-table"))
    End Sub

    Private Sub Patch(rows As List(Of JsonObject), status As String)
        Dim change = rows.Where(Function(c) Js.Str(c, "status") <> status AndAlso Js.Int(c, "id") > 0).ToList()
        For Each c In change
            AppState.I.Enqueue(New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/categories2/" & Js.Int(c, "id"), .Body = Js.Obj("status", status),
                .Label = Js.Str(c, "name") & ": " & If(status = "active", "activated", "deactivated"),
                .Effect = New JsonObject From {{"kind", "set_row"}, {"set", "categories"}, {"id", Js.Int(c, "id")}, {"fields", Js.Obj("status", status)}}, .Refresh = New List(Of String) From {"categories"}})
        Next
        Toast(If(change.Count = 0, "Nothing to change.", If(change.Count = 1, """" & Js.Str(change(0), "name") & """", change.Count & " categories") & " " & If(status = "active", "activated", "deactivated") & "."))
    End Sub

    Private Async Function DeleteAsync(rows As List(Of JsonObject)) As Task
        rows = rows.Where(Function(c) Js.Int(c, "id") > 0).ToList()
        If rows.Count = 0 Then Return
        Dim used = rows.Sum(Function(c) Count(c))
        Dim what = If(rows.Count = 1, """" & Js.Str(rows(0), "name") & """", rows.Count & " categories")
        If Not Ui.Confirm(Me, If(used > 0, used & " product" & If(used = 1, " is", "s are") & " in " & If(rows.Count = 1, "this category", "these categories") & " — they will stay, just without a category.", "This cannot be undone."), "Delete " & what & "?") Then Return
        Dim failed = 0
        For Each c In rows
            Dim r = Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/categories2/" & Js.Int(c, "id") & If(Count(c) > 0, "?detach=1", ""), .Label = "Delete category: " & Js.Str(c, "name"),
                .Effect = New JsonObject From {{"kind", "set_row_delete"}, {"set", "categories"}, {"ids", New JsonArray(JsonValue.Create(Js.Int(c, "id")))}}, .Refresh = New List(Of String) From {"categories", "products"}})
            If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden Then failed += 1
        Next
        _list.Table.Selected.Clear()
        Toast(If(failed > 0, "Couldn't delete " & failed & " of them.", what & " deleted."), failed > 0)
    End Function

    Private Sub Edit(cat As JsonObject)
        If cat IsNot Nothing AndAlso Js.Int(cat, "id") <= 0 Then Toast("This category is still being added — change it in a moment.") : Return
        Dim f As New FormDialog(If(cat Is Nothing, "Add category", "Edit category"), 560)
        f.AddImage("image", "Picture", Js.Str(cat, "image"))
        f.AddText("name", "Category name", Js.Str(cat, "name"), required:=True)
        f.AddText("slug", "Slug", Js.Str(cat, "slug"), hint:="Leave blank to make it from the name.", half:=True)
        f.AddNumber("serial", "Serial (order in the shop)", If(cat Is Nothing, CType(Nothing, Double?), Js.Int(cat, "serial")), half:=True)
        f.AddText("meta_keywords", "Meta keywords (SEO)", Js.Str(cat, "metaKeywords"))
        f.AddMulti("meta_description", "Meta description (SEO)", Js.Str(cat, "metaDescription"), 70)
        f.AddCheck("active", "Active — shown in the shop", Js.Str(cat, "status", "active") = "active")
        f.OnSave = Async Function(d)
                       Dim name = d.Val("name").Trim()
                       Dim status = If(d.Bool("active"), "active", "inactive")
                       Dim fields As New Dictionary(Of String, String) From {{"name", name}, {"status", status}, {"slug", d.Val("slug").Trim()},
                           {"serial", If(d.Val("serial").Trim() = "", "0", CInt(d.Num("serial")).ToString())}, {"meta_keywords", d.Val("meta_keywords").Trim()}, {"meta_description", d.Val("meta_description").Trim()}}
                       Dim files As New Dictionary(Of String, String)
                       Dim pic = d.FileOf("image")
                       If Not String.IsNullOrEmpty(pic) Then files("image") = pic
                       If pic = "" AndAlso cat IsNot Nothing Then fields("remove_image") = "1"
                       Dim item As New OutboxItem With {.Method = If(cat Is Nothing, "POST", "PUT"), .Path = If(cat Is Nothing, "/api/ecommerce/categories2", "/api/ecommerce/categories2/" & Js.Int(cat, "id")),
                           .Multipart = True, .Fields = fields, .Files = files, .Label = If(cat Is Nothing, "New", "Edit") & " category: " & name, .Refresh = New List(Of String) From {"categories"}}
                       If cat Is Nothing Then
                           item.Effect = New JsonObject From {{"kind", "set_row_new"}, {"set", "categories"}, {"row", Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "name", name, "slug", fields("slug"), "status", status,
                               "serial", CInt(fields("serial")), "image", If(String.IsNullOrEmpty(pic), Nothing, pic), "createdAt", DateTime.UtcNow)}}
                       Else
                           item.Effect = New JsonObject From {{"kind", "set_row"}, {"set", "categories"}, {"id", Js.Int(cat, "id")}, {"fields", Js.Obj("name", name, "status", status, "slug", If(fields("slug") = "", Js.Str(cat, "slug"), fields("slug")),
                               "serial", CInt(fields("serial")), "metaKeywords", fields("meta_keywords"), "metaDescription", fields("meta_description"), "updatedAt", DateTime.UtcNow)}}
                       End If
                       Dim r = Await AppState.I.SendNowAsync(item)
                       If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden Then Return r.Message
                       Toast(If(r.IsOk, "Saved.", "Saved on this computer — it goes to the website when the internet is back."))
                       Return Nothing
                   End Function
        f.ShowDialog(FindForm())
    End Sub

    Private Sub DoExport(rows As List(Of JsonObject))
        Export.Csv(Me, "Categories", {"ID", "Name", "Slug", "Products", "Serial", "Status", "Last Updated"},
                   rows.Select(Function(c) CType({CObj(Js.Int(c, "id")), Js.Str(c, "name"), Js.Str(c, "slug"), CObj(Count(c)), CObj(Js.Int(c, "serial")), If(Js.Str(c, "status") = "active", "Active", "Inactive"), Fmt.Stamp(If(Js.Time(c, "updatedAt"), Js.Time(c, "createdAt")))}, IEnumerable(Of Object))))
    End Sub
End Class
