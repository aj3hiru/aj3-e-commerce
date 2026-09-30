Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Brands" as on the website: 4 cards, 4 filters, select + Bulk Actions (enable, disable, popular,
''' export, delete), the table (name, logo, slug, products, status, popular, actions) and the brand form.</summary>
Public Class BrandsPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_brands2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _add As WButton = Ui.Btn("Add Brand", Theme.IcAdd, Theme.Blue)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All Status", "active|Enabled", "inactive|Disabled"})
    Private ReadOnly _popular As ComboBox = Ui.Filter({"all|All Brands", "yes|Popular", "no|Not Popular"})
    Private ReadOnly _logo As ComboBox = Ui.Filter({"all|Any Logo", "yes|With Logo", "no|No Logo"})
    Private ReadOnly _products As ComboBox = Ui.Filter({"all|All", "yes|Has Products", "no|No Products"})
    Private ReadOnly _list As New ListCard("brands")
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Brands"
    Public Overrides ReadOnly Property PageSubtitle As String = "Manage the brands products can be tagged with"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export, _add}
        End Get
    End Property

    Public Sub New()
        For Each m In {("b2-k-total", "Total Brands", Theme.IcTag, Theme.Primary), ("b2-k-enabled", "Enabled", Theme.IcDone, Color.FromArgb(5, &H96, &H69)),
                       ("b2-k-popular", "Popular", ChrW(&HE734), Color.FromArgb(&HF5, &H9E, &HB)), ("b2-k-unused", "No Products", Theme.IcPackage, Theme.G500)}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     Select Case key
                                         Case "b2-k-total" : For Each c In {_status, _popular, _logo, _products} : c.SelectedIndex = 0 : Next
                                         Case "b2-k-enabled" : Ui.SetVal(_status, If(Ui.Val(_status) = "active", "all", "active"))
                                         Case "b2-k-popular" : Ui.SetVal(_popular, If(Ui.Val(_popular) = "yes", "all", "yes"))
                                         Case "b2-k-unused" : Ui.SetVal(_products, If(Ui.Val(_products) = "no", "all", "no"))
                                     End Select
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("b2-f-status", "Status", _status)
        _filters.Add("b2-f-popular", "Popular", _popular)
        _filters.Add("b2-f-logo", "Logo", _logo)
        _filters.Add("b2-f-products", "Products", _products)
        AddHandler _filters.Changed, Sub() Refresh_()
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Search brands…"
        _list.BulkItems.AddRange({"enable|Enable", "disable|Disable", "popular|Mark Popular", "unpopular|Remove Popular", "export|Export selected (Excel)", "-", "!delete|Delete"})
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           For Each c In {_status, _popular, _logo, _products} : c.SelectedIndex = 0 : Next
                                       End Sub
        AddHandler _list.Bulk, Async Sub(k, rows)
                                   Select Case k
                                       Case "enable" : Await PatchAsync(rows, Js.Obj("status", "active"), "enabled")
                                       Case "disable" : Await PatchAsync(rows, Js.Obj("status", "inactive"), "disabled")
                                       Case "popular" : Await PatchAsync(rows, Js.Obj("isPopular", True), "marked popular")
                                       Case "unpopular" : Await PatchAsync(rows, Js.Obj("isPopular", False), "no longer popular")
                                       Case "export" : DoExport(rows)
                                       Case "delete" : Await DeleteAsync(rows)
                                   End Select
                               End Sub
        AddHandler _list.Table.RowClick, Sub(b) Edit(b)
        AddHandler _list.Table.CellClick, Sub(b, c, cell)
                                              Dim at As New Point(cell.X + 10, cell.Bottom - 8)
                                              If Js.Int(b, "id") < 0 Then Return
                                              Select Case c.Key
                                                  Case "status" : PageActions.OnOffMenu(Me, at, Js.Str(b, "status") = "active", "Enabled", "Disabled", Async Sub(v) Await PatchAsync({b}.ToList(), Js.Obj("status", If(v, "active", "inactive")), If(v, "enabled", "disabled")))
                                                  Case "popular" : PageActions.OnOffMenu(Me, at, Js.Bool(b, "isPopular"), "Enabled", "Disabled", Async Sub(v) Await PatchAsync({b}.ToList(), Js.Obj("isPopular", v), If(v, "marked popular", "no longer popular")))
                                                  Case Else : Edit(b)
                                              End Select
                                          End Sub
        AddHandler _list.Table.ActionClick, Async Sub(b, k)
                                                If k = "edit" Then Edit(b) Else Await DeleteAsync({b}.ToList())
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport(_shown)
        AddHandler _add.Click, Sub() Edit(Nothing)
        BuildCols()
    End Sub

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("b2-table", k)
        _list.Selectable = col("b2-c-select")
        _list.ShowSearch = col("b2-t-search")
        If col("b2-c-name") Then t.Cols.Add(New TCol("Name", Function(b) Js.Str(b, "name"), 0, CellKind.Bold) With {.Flex = 20}.WithSort())
        If col("b2-c-logo") Then t.Cols.Add(New TCol("Logo", Nothing, 80, CellKind.Thumb) With {.Picture = Function(b) Js.Str(b, "logo")})
        If col("b2-c-slug") Then t.Cols.Add(New TCol("Slug", Function(b) Js.Str(b, "slug"), 0) With {.Flex = 14, .Colour = Function(b) Theme.G500}.WithSort())
        If col("b2-c-products") Then t.Cols.Add(New TCol("Products", Function(b) Js.Int(b, "products").ToString(), 0) With {.Flex = 8, .Sort = Function(b) Js.Int(b, "products")})
        If col("b2-c-status") Then t.Cols.Add(New TCol("Status", Function(b) If(Js.Str(b, "status") = "active", "Enabled", "Disabled"), 0, CellKind.PillMenu) With {.Flex = 10, .Key = "status", .Colour = Function(b) If(Js.Str(b, "status") = "active", Theme.Green, Theme.Grey)})
        If col("b2-c-popular") Then t.Cols.Add(New TCol("Popular", Function(b) If(Js.Bool(b, "isPopular"), "Enabled", "Disabled"), 0, CellKind.PillMenu) With {.Flex = 10, .Key = "popular", .Colour = Function(b) If(Js.Bool(b, "isPopular"), Theme.Green, Theme.Grey)})
        If col("b2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Actions).Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        t.RowClickable = True
        t.EmptyText = "No brands yet."
    End Sub

    Protected Overrides Sub Reload()
        Dim all = AppState.I.PageList("brands")
        Dim status = Ui.Val(_status), popular = Ui.Val(_popular), logo = Ui.Val(_logo), products = Ui.Val(_products)
        Dim list = all.Where(Function(b)
                                 If status <> "all" AndAlso Js.Str(b, "status") <> status Then Return False
                                 If popular <> "all" AndAlso Js.Bool(b, "isPopular") <> (popular = "yes") Then Return False
                                 If logo <> "all" AndAlso (Js.Str(b, "logo") <> "") <> (logo = "yes") Then Return False
                                 If products <> "all" AndAlso (Js.Int(b, "products") > 0) <> (products = "yes") Then Return False
                                 Return _list.Matches(Js.Str(b, "name") & " " & Js.Str(b, "slug"))
                             End Function).ToList()
        _shown = list
        Dim filtersOn = status <> "all" OrElse popular <> "all" OrElse logo <> "all" OrElse products <> "all"
        _list.SetRows(list, all.Count, filtersOn)
        _m("b2-k-total").SetValue(all.Count.ToString())
        _m("b2-k-enabled").SetValue(all.Where(Function(b) Js.Str(b, "status") = "active").Count().ToString())
        _m("b2-k-popular").SetValue(all.Where(Function(b) Js.Bool(b, "isPopular")).Count().ToString())
        _m("b2-k-unused").SetValue(all.Where(Function(b) Js.Int(b, "products") = 0).Count().ToString())
        _m("b2-k-total").Selected = Not filtersOn AndAlso _list.Query = ""
        _m("b2-k-enabled").Selected = status = "active"
        _m("b2-k-popular").Selected = popular = "yes"
        _m("b2-k-unused").Selected = products = "no"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("b2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("b2-cards"))
        _filters.Apply(_display, "b2-filters")
        If Not _display.IsOn("b2-filters") Then Kit.Show(_filters, False)
        Kit.Show(_list, _display.IsOn("b2-table"))
    End Sub

    Private Function PatchAsync(rows As List(Of JsonObject), change As JsonObject, word As String) As Task
        Return PageActions.EachAsync(Me, rows.Where(Function(b) Js.Int(b, "id") > 0), Function(b) New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/brands2/" & Js.Int(b, "id"), .Body = Js.Copy(change),
            .Label = Js.Str(b, "name") & ": " & word, .Refresh = New List(Of String) From {"brands"}, .Effect = PageActions.PageRow("brands", Js.Field(b, "id"), TryCast(Js.Copy(change), JsonObject))},
            If(rows.Count = 1, """" & Js.Str(rows(0), "name") & """ " & word & ".", rows.Count & " brands " & word & "."))
    End Function

    Private Async Function DeleteAsync(rows As List(Of JsonObject)) As Task
        rows = rows.Where(Function(b) Js.Int(b, "id") > 0).ToList()
        If rows.Count = 0 Then Return
        Dim used = rows.Sum(Function(b) Js.Int(b, "products"))
        Dim what = If(rows.Count = 1, """" & Js.Str(rows(0), "name") & """", rows.Count & " brands")
        If Not Ui.Confirm(Me, If(used > 0, used & " product" & If(used = 1, " uses", "s use") & " " & If(rows.Count = 1, "this brand", "these brands") & " — they will keep everything else and just have no brand.", "This cannot be undone."), "Delete " & what & "?") Then Return
        Await PageActions.EachAsync(Me, rows, Function(b) New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/brands2/" & Js.Int(b, "id") & If(Js.Int(b, "products") > 0, "?detach=1", ""),
            .Label = "Delete brand: " & Js.Str(b, "name"), .Refresh = New List(Of String) From {"brands"}, .Effect = PageActions.PageRowDelete("brands", Js.Field(b, "id"))}, what & " deleted.")
        _list.Table.Selected.Clear()
    End Function

    Private Sub Edit(b As JsonObject)
        Dim f As New FormDialog(If(b Is Nothing, "Add brand", "Edit brand"), 480)
        f.AddText("name", "Brand name", Js.Str(b, "name"), required:=True)
        f.AddImage("logo", "Logo", Js.Str(b, "logo"))
        f.AddCheck("popular", "Popular brand", Js.Bool(b, "isPopular"))
        f.AddCheck("active", "Active", b Is Nothing OrElse Js.Str(b, "status") = "active")
        f.OnSave = Async Function(d)
                       Dim name = d.Val("name").Trim()
                       Dim fields As New Dictionary(Of String, String) From {{"name", name}, {"is_popular", If(d.Bool("popular"), "1", "0")}, {"status", If(d.Bool("active"), "active", "inactive")}}
                       Dim files As New Dictionary(Of String, String)
                       If Not String.IsNullOrEmpty(d.FileOf("logo")) Then files("logo") = d.FileOf("logo")
                       Dim item As New OutboxItem With {.Method = If(b Is Nothing, "POST", "PUT"), .Path = If(b Is Nothing, "/api/ecommerce/brands2", "/api/ecommerce/brands2/" & Js.Int(b, "id")),
                           .Label = If(b Is Nothing, "New", "Edit") & " brand: " & name, .Multipart = True, .Fields = fields, .Files = files, .Refresh = New List(Of String) From {"brands"}}
                       If b Is Nothing Then
                           item.Effect = PageActions.PageRowNew("brands", Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "name", name, "slug", "", "logo", If(files.ContainsKey("logo"), files("logo"), Nothing),
                               "isPopular", d.Bool("popular"), "status", fields("status"), "products", 0))
                       Else
                           item.Effect = PageActions.PageRow("brands", Js.Field(b, "id"), Js.Obj("name", name, "isPopular", d.Bool("popular"), "status", fields("status")))
                       End If
                       Return Await PageActions.SendAsync(Me, item, "brands")
                   End Function
        f.ShowDialog(FindForm())
    End Sub

    Private Sub DoExport(rows As List(Of JsonObject))
        Export.Csv(Me, "Brands", {"ID", "Name", "Slug", "Products", "Status", "Popular"},
                   rows.Select(Function(b) CType({CObj(Js.Int(b, "id")), Js.Str(b, "name"), Js.Str(b, "slug"), CObj(Js.Int(b, "products")), If(Js.Str(b, "status") = "active", "Enabled", "Disabled"), If(Js.Bool(b, "isPopular"), "Yes", "No")}, IEnumerable(Of Object))))
    End Sub
End Class

''' <summary>"Badge Tags &amp; Item Types" as on the website: 8 cards, untagged-values notice, 3 filters, the table
''' (tag with colour, type, products, units sold, sales, status, actions) and the tag form.</summary>
Public Class TagsPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_product_tags2_display")
    Private ReadOnly _addType As WButton = Ui.Btn("Add Item Type", Theme.IcAdd, outline:=True)
    Private ReadOnly _addBadge As WButton = Ui.Btn("Add Badge", Theme.IcAdd, Theme.Blue)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _orphans As New CardBox(Nothing, "", 12)
    Private ReadOnly _orphanText As New TextBlock("", Theme.Body, Color.FromArgb(&H92, &H40, &HE))
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _group As ComboBox = Ui.Filter({"all|Badges and item types", "badge|Badge tags only", "item_type|Item types only"})
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All status", "active|Active", "inactive|Inactive"})
    Private ReadOnly _usage As ComboBox = Ui.Filter({"all|All tags", "used|Used by products", "unused|Not used", "sold|Sold (12 months)", "nosales|No sales (12 months)"})
    Private ReadOnly _list As New ListCard("tags")

    Public Overrides ReadOnly Property PageTitle As String = "Badge Tags & Item Types"
    Public Overrides ReadOnly Property PageSubtitle As String = "Badges shown on product photos, and the kinds of items you sell (sales: last 12 months)"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _addType, _addBadge}
        End Get
    End Property

    Public Sub New()
        For Each m In {("tg2-k-badges", "Badge Tags", Theme.IcTag, Theme.Primary), ("tg2-k-types", "Item Types", Theme.IcTag, Theme.Blue), ("tg2-k-active", "Active", Theme.IcDone, Color.FromArgb(5, &H96, &H69)),
                       ("tg2-k-unused", "Not Used", Theme.IcBlock, Theme.G500), ("tg2-k-tagged", "Tagged Products", Theme.IcPackage, Color.FromArgb(2, &H84, &HC7)), ("tg2-k-units", "Units Sold", Theme.IcCart, Color.FromArgb(&HD9, &H77, 6)),
                       ("tg2-k-revenue", "Sales from Badges", Theme.IcMoney, Color.FromArgb(5, &H96, &H69)), ("tg2-k-top", "Best Performing", Theme.IcTag, Theme.Danger)}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 92, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     Select Case key
                                         Case "tg2-k-badges" : Clear() : Ui.SetVal(_group, "badge")
                                         Case "tg2-k-types" : Clear() : Ui.SetVal(_group, "item_type")
                                         Case "tg2-k-active" : Ui.SetVal(_status, If(Ui.Val(_status) = "active", "all", "active"))
                                         Case "tg2-k-unused" : Ui.SetVal(_usage, If(Ui.Val(_usage) = "unused", "all", "unused"))
                                         Case "tg2-k-tagged" : Ui.SetVal(_usage, "used")
                                         Case "tg2-k-units", "tg2-k-revenue" : Ui.SetVal(_usage, "sold")
                                     End Select
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _orphans.Add(_orphanText)
        Body.Add(_orphans)
        _filters.Add("tg2-f-group", "Tag Type", _group)
        _filters.Add("tg2-f-status", "Status", _status)
        _filters.Add("tg2-f-usage", "Usage", _usage)
        AddHandler _filters.Changed, Sub() Refresh_()
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Name or code…"
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub() Clear()
        AddHandler _list.Table.RowClick, Sub(t) Edit(t, Js.Str(t, "tagGroup"))
        AddHandler _list.Table.CellClick, Sub(t, c, cell)
                                              If c.Key = "status" Then
                                                  PageActions.OnOffMenu(Me, New Point(cell.X + 10, cell.Bottom - 8), Js.Str(t, "status") = "active", "Active", "Inactive", Async Sub(v) Await SetStatusAsync(t, If(v, "active", "inactive")))
                                              Else
                                                  Edit(t, Js.Str(t, "tagGroup"))
                                              End If
                                          End Sub
        AddHandler _list.Table.ActionClick, Async Sub(t, k)
                                                If k = "edit" Then Edit(t, Js.Str(t, "tagGroup")) Else Await DeleteAsync(t)
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _addType.Click, Sub() Edit(Nothing, "item_type")
        AddHandler _addBadge.Click, Sub() Edit(Nothing, "badge")
        BuildCols()
    End Sub

    Private Sub Clear()
        _list.Search.Text = ""
        For Each c In {_group, _status, _usage} : c.SelectedIndex = 0 : Next
    End Sub

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("tg2-table", k)
        _list.ShowSearch = col("tg2-t-search")
        If col("tg2-c-tag") Then
            t.Cols.Add(New TCol("Tag", Nothing, 0, CellKind.Custom) With {.Flex = 20, .Sort = Function(x) Js.Str(x, "label").ToLowerInvariant(),
                .Draw = Sub(g, r, x)
                            Using b As New SolidBrush(Fmt.ColorFromHex(Js.Str(x, "color"), Theme.G400)) : g.FillEllipse(b, r.X, r.Y + r.Height \ 2 - 6, 12, 12) : End Using
                            Tr.DrawText(g, Js.Str(x, "label"), Theme.BodyBold, New Rectangle(r.X + 20, r.Y + r.Height \ 2 - 18, r.Width - 20, 18), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis Or TextFormatFlags.Bottom)
                            Tr.DrawText(g, Js.Str(x, "slug"), Theme.Small, New Rectangle(r.X + 20, r.Y + r.Height \ 2 + 1, r.Width - 20, 16), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                        End Sub})
        End If
        If col("tg2-c-group") Then t.Cols.Add(New TCol("Type", Function(x) If(Js.Str(x, "tagGroup") = "badge", "Badge", "Item type"), 0, CellKind.Badge) With {.Flex = 10, .Colour = Function(x) If(Js.Str(x, "tagGroup") = "badge", Theme.PrimaryDark, Color.FromArgb(&H1D, &H4E, &HD8))}.WithSort())
        If col("tg2-c-products") Then t.Cols.Add(New TCol("Products", Function(x) Js.Int(x, "products").ToString(), 0) With {.Flex = 8, .Sort = Function(x) Js.Int(x, "products")})
        If col("tg2-c-sales") Then t.Cols.Add(New TCol("Units Sold", Function(x) Js.Int(x, "unitsSold").ToString(), 0) With {.Flex = 9, .Sort = Function(x) Js.Int(x, "unitsSold")})
        If col("tg2-c-revenue") Then t.Cols.Add(New TCol("Sales", Function(x) Theme.Money(Js.Num(x, "revenue")), 0) With {.Flex = 10, .Sort = Function(x) Js.Num(x, "revenue")})
        If col("tg2-c-status") Then t.Cols.Add(New TCol("Status", Function(x) If(Js.Str(x, "status") = "active", "Active", "Inactive"), 0, CellKind.PillMenu) With {.Flex = 10, .Key = "status", .Colour = Function(x) If(Js.Str(x, "status") = "active", Theme.Green, Theme.Grey)})
        If col("tg2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Actions).Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        t.RowClickable = True
        t.EmptyText = "No tags yet."
    End Sub

    Protected Overrides Sub Reload()
        Dim all = AppState.I.PageList("tags")
        Dim badges = all.Where(Function(t) Js.Str(t, "tagGroup") = "badge").ToList()
        Dim products = AppState.I.List("products")
        Dim tagged = products.Where(Function(p) Js.Str(p, "badgeTag", "none") <> "none" AndAlso Js.Str(p, "badgeTag") <> "").Count()
        Dim top = badges.Where(Function(t) Js.Int(t, "unitsSold") > 0).OrderByDescending(Function(t) Js.Int(t, "unitsSold")).FirstOrDefault()
        Dim slugs = all.Select(Function(t) Js.Str(t, "tagGroup") & ":" & Js.Str(t, "slug")).ToHashSet()
        Dim orphans As New SortedSet(Of String)
        For Each p In products
            Dim b = Js.Str(p, "badgeTag", "none"), it = Js.Str(p, "itemType", "normal")
            If b <> "none" AndAlso b <> "" AndAlso Not slugs.Contains("badge:" & b) Then orphans.Add("Badge """ & b & """")
            If it <> "normal" AndAlso it <> "" AndAlso Not slugs.Contains("item_type:" & it) Then orphans.Add("Item type """ & it & """")
        Next
        _orphanText.Text = "⚠  Some products use a tag that no longer exists: " & String.Join(", ", orphans.Take(6)) & If(orphans.Count > 6, " and " & (orphans.Count - 6) & " more", "") & ". Add it again, or change those products."
        Kit.Show(_orphans, orphans.Count > 0 AndAlso _display.Item("tg2-orphans"))
        Dim group = Ui.Val(_group), status = Ui.Val(_status), usage = Ui.Val(_usage)
        Dim list = all.Where(Function(t)
                                 If group <> "all" AndAlso Js.Str(t, "tagGroup") <> group Then Return False
                                 If status <> "all" AndAlso Js.Str(t, "status") <> status Then Return False
                                 If usage = "used" AndAlso Js.Int(t, "products") = 0 Then Return False
                                 If usage = "unused" AndAlso Js.Int(t, "products") > 0 Then Return False
                                 If usage = "sold" AndAlso Js.Int(t, "unitsSold") = 0 Then Return False
                                 If usage = "nosales" AndAlso Js.Int(t, "unitsSold") > 0 Then Return False
                                 Return _list.Matches(Js.Str(t, "label") & " " & Js.Str(t, "slug"))
                             End Function).ToList()
        _list.SetRows(list, all.Count, group <> "all" OrElse status <> "all" OrElse usage <> "all")
        _m("tg2-k-badges").SetValue(badges.Count.ToString(), "shown on product cards")
        _m("tg2-k-types").SetValue((all.Count - badges.Count).ToString(), "how products are grouped")
        _m("tg2-k-active").SetValue(all.Where(Function(t) Js.Str(t, "status") = "active").Count().ToString(), all.Where(Function(t) Js.Str(t, "status") <> "active").Count() & " inactive")
        _m("tg2-k-unused").SetValue(all.Where(Function(t) Js.Int(t, "products") = 0).Count().ToString(), "no product has these")
        _m("tg2-k-tagged").SetValue(tagged.ToString(), (products.Count - tagged) & " with no badge")
        _m("tg2-k-units").SetValue(badges.Sum(Function(t) Js.Int(t, "unitsSold")).ToString(), "from badged products")
        _m("tg2-k-revenue").SetValue(Theme.Money(badges.Sum(Function(t) Js.Num(t, "revenue"))), "last 12 months")
        _m("tg2-k-top").SetValue(If(top Is Nothing, "—", Js.Str(top, "label")), If(top Is Nothing, "no sales yet", Js.Int(top, "unitsSold") & " units sold"))
        _m("tg2-k-badges").Selected = group = "badge"
        _m("tg2-k-types").Selected = group = "item_type"
        _m("tg2-k-active").Selected = status = "active"
        _m("tg2-k-unused").Selected = usage = "unused"
        _m("tg2-k-units").Selected = usage = "sold"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("tg2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("tg2-cards"))
        _filters.Apply(_display, "tg2-filters")
        If Not _display.IsOn("tg2-filters") Then Kit.Show(_filters, False)
        Kit.Show(_list, _display.IsOn("tg2-table"))
    End Sub

    Private Function SetStatusAsync(t As JsonObject, status As String) As Task
        Return PageActions.EachAsync(Me, {t}, Function(x) New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/product-tags2/" & Js.Int(x, "id"), .Body = Js.Obj("status", status),
            .Label = "Tag " & Js.Str(x, "label") & ": " & status, .Refresh = New List(Of String) From {"settings"}, .Effect = PageActions.PageRow("tags", Js.Field(x, "id"), Js.Obj("status", status))},
            """" & Js.Str(t, "label") & """ is " & If(status = "active", "active", "turned off") & ".")
    End Function

    Private Async Function DeleteAsync(t As JsonObject) As Task
        Dim used = Js.Int(t, "products")
        If Not Ui.Confirm(Me, If(used > 0, used & " product" & If(used = 1, " uses", "s use") & " this tag — they will go back to ""None"" / ""Normal"".", "This cannot be undone."), "Delete """ & Js.Str(t, "label") & """?") Then Return
        Await PageActions.EachAsync(Me, {t}, Function(x) New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/product-tags2/" & Js.Int(x, "id") & If(used > 0, "?force=1", ""),
            .Label = "Delete tag: " & Js.Str(x, "label"), .Refresh = New List(Of String) From {"settings", "products"}, .Effect = PageActions.PageRowDelete("tags", Js.Field(x, "id"))}, """" & Js.Str(t, "label") & """ deleted.")
    End Function

    Private Sub Edit(t As JsonObject, group As String)
        Dim f As New FormDialog(If(t Is Nothing, If(group = "badge", "Add badge tag", "Add item type"), "Edit " & Js.Str(t, "label")), 460)
        f.AddText("label", "Name", Js.Str(t, "label"), required:=True, placeholder:=If(group = "badge", "e.g. Best Seller", "e.g. Combo Pack"))
        f.AddColor("color", "Colour", Js.Str(t, "color", If(group = "badge", "#16A34A", "#2563EB")), half:=True)
        f.AddNumber("order", "Order", If(t Is Nothing, 0, Js.Int(t, "sortOrder")), half:=True)
        f.OnSave = Async Function(d)
                       Dim body = Js.Obj("label", d.Val("label").Trim(), "tagGroup", Js.Str(t, "tagGroup", group), "color", d.Val("color"), "sortOrder", CInt(d.Num("order")), "slug", Js.Str(t, "slug"))
                       Dim item As New OutboxItem With {.Method = If(t Is Nothing, "POST", "PUT"), .Path = If(t Is Nothing, "/api/ecommerce/product-tags2", "/api/ecommerce/product-tags2/" & Js.Int(t, "id")),
                           .Label = "Tag: " & d.Val("label").Trim(), .Body = body, .Refresh = New List(Of String) From {"settings"}}
                       If t Is Nothing Then
                           item.Effect = PageActions.PageRowNew("tags", Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "label", d.Val("label").Trim(), "slug", "", "tagGroup", group,
                               "color", d.Val("color"), "sortOrder", CInt(d.Num("order")), "status", "active", "products", 0, "unitsSold", 0, "revenue", 0))
                       Else
                           item.Effect = PageActions.PageRow("tags", Js.Field(t, "id"), Js.Obj("label", d.Val("label").Trim(), "color", d.Val("color"), "sortOrder", CInt(d.Num("order"))))
                       End If
                       Return Await PageActions.SendAsync(Me, item, "tags")
                   End Function
        f.ShowDialog(FindForm())
    End Sub
End Class

''' <summary>"Product Reviews" as on the website: date range (optional filter), 8 cards, ratings breakdown,
''' 5 filters, the table (product, name, stars, review, status menu, actions) and the review form.</summary>
Public Class ReviewsPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_reviews2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _add As WButton = Ui.Btn("Add Review", Theme.IcAdd, Theme.Blue)
    Private ReadOnly _rangeCard As New CardBox(Nothing, "", 1)
    Private ReadOnly _range As New RangeChips() With {.Outline = True, .ToggleText = "Filter the table by this range"}
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _spread As New IconCard("star", "Ratings Breakdown", Color.FromArgb(&HF5, &H9E, &HB))
    Private ReadOnly _bars As New Drawn(146, Nothing)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _status As ComboBox = Ui.Filter({"all|All status", "pending|Pending", "approved|Approved", "rejected|Rejected"})
    Private ReadOnly _rating As ComboBox = Ui.Filter({"all|All ratings", "high|4★ and above", "low|2★ and below", "5|5 stars", "4|4 stars", "3|3 stars", "2|2 stars", "1|1 star"})
    Private ReadOnly _category As ComboBox = Ui.Filter({"0|All categories"})
    Private ReadOnly _product As ComboBox = Ui.Filter({"0|All products"})
    Private ReadOnly _text As ComboBox = Ui.Filter({"all|All reviews", "with|With a message", "without|Rating only"})
    Private ReadOnly _list As New ListCard("reviews")
    Private _all As New List(Of JsonObject)
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Product Reviews"
    Public Overrides ReadOnly Property PageSubtitle As String = "Read, approve and manage what customers say about your products"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export, _add}
        End Get
    End Property

    Public Sub New()
        _rangeCard.Add(_range)
        Body.Add(_rangeCard)
        For Each m In {("rv2-k-total", "All Reviews", ChrW(&HE8BD), Theme.Blue), ("rv2-k-today", "Today", Theme.IcClock, Theme.Primary), ("rv2-k-pending", "Pending Reviews", Theme.IcClock, Color.FromArgb(&HD9, &H77, 6)),
                       ("rv2-k-approved", "Approved", Theme.IcDone, Color.FromArgb(5, &H96, &H69)), ("rv2-k-rejected", "Rejected", Theme.IcBlock, Theme.G500), ("rv2-k-average", "Average Rating", ChrW(&HE734), Color.FromArgb(&HF5, &H9E, &HB)),
                       ("rv2-k-low", "Low Ratings (1–2★)", ChrW(&HE7BA), Theme.Danger), ("rv2-k-range", "In Selected Range", Theme.IcCalendar, Color.FromArgb(2, &H84, &HC7))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 92, .Cursor = Cursors.Hand}
            Dim key = m.Item1
            AddHandler ms.Click, Sub()
                                     ClearFilters()
                                     Select Case key
                                         Case "rv2-k-today" : _range.SetRange(Fmt.IstToday(), Fmt.IstToday(), False) : _range.ToggleOn = True : _range.Invalidate()
                                         Case "rv2-k-pending" : Ui.SetVal(_status, "pending")
                                         Case "rv2-k-approved" : Ui.SetVal(_status, "approved")
                                         Case "rv2-k-rejected" : Ui.SetVal(_status, "rejected")
                                         Case "rv2-k-low" : Ui.SetVal(_rating, "low")
                                         Case "rv2-k-range" : _range.ToggleOn = True : _range.Invalidate()
                                     End Select
                                     Refresh_()
                                 End Sub
            _m(key) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _bars.PaintIt = AddressOf PaintBars
        AddHandler _bars.MouseClick, Sub(s, e)
                                         Dim n = 5 - Math.Min(4, Math.Max(0, e.Y \ 30))
                                         ClearFilters()
                                         Ui.SetVal(_rating, n.ToString())
                                     End Sub
        _bars.Cursor = Cursors.Hand
        _spread.Add(_bars)
        Body.Add(_spread)
        _filters.Add("rv2-f-status", "Status", _status)
        _filters.Add("rv2-f-rating", "Rating", _rating)
        _filters.Add("rv2-f-category", "Category", _category)
        _filters.Add("rv2-f-product", "Product", _product)
        _filters.Add("rv2-f-text", "Message", _text)
        AddHandler _filters.Changed, Sub() Refresh_()
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Name, phone, order, product, words…"
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub()
                                           ClearFilters()
                                           Refresh_()
                                       End Sub
        AddHandler _range.Changed, Sub() Refresh_()
        AddHandler _range.Toggled, Sub() Refresh_()
        AddHandler _list.Table.RowClick, Sub(r) Edit(r)
        AddHandler _list.Table.CellClick, Sub(r, c, cell)
                                              If c.Key = "status" AndAlso Js.Int(r, "id") > 0 Then
                                                  Dim st = Js.Str(r, "status", "pending")
                                                  Ui.PopMenu(Me, {If(st = "pending", "*", "") & "pending|Pending", If(st = "approved", "*", "") & "approved|Approved", If(st = "rejected", "*", "") & "!rejected|Rejected"},
                                                             Async Sub(v)
                                                                 If v <> st Then Await SetStatusAsync(r, v)
                                                             End Sub, New Point(cell.X + 10, cell.Bottom - 8))
                                              Else
                                                  Edit(r)
                                              End If
                                          End Sub
        AddHandler _list.Table.ActionClick, Async Sub(r, k)
                                                If k = "edit" Then Edit(r) Else Await DeleteAsync(r)
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() DoExport()
        AddHandler _add.Click, Sub() Edit(Nothing)
        BuildCols()
    End Sub

    Private Sub ClearFilters()
        _list.Search.Text = ""
        For Each c In {_status, _rating, _category, _product, _text} : c.SelectedIndex = 0 : Next
        _range.ToggleOn = False : _range.Invalidate()
    End Sub

    Private Function InRange(t As DateTime?) As Boolean
        If Not t.HasValue Then Return False
        Dim d = Fmt.IstDay(t)
        Return d >= _range.From AndAlso d <= _range.To
    End Function

    ''' <summary>5 to 1 stars as on the website: amber bars against the most common rating, the count on the right.</summary>
    Private Sub PaintBars(g As Graphics, r As Rectangle)
        Theme.Smooth(g)
        Dim counts = Enumerable.Range(1, 5).ToDictionary(Function(n) n, Function(n) _all.Where(Function(x) Js.Int(x, "rating") = n).Count())
        Dim top = Math.Max(1, counts.Values.Max())
        Dim amber = Color.FromArgb(&HFB, &HBF, &H24)
        For n = 5 To 1 Step -1
            Dim c = counts(n)
            Dim y = (5 - n) * 30
            Tr.DrawText(g, n.ToString(), Theme.Px(14), New Rectangle(0, y, 14, 22), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
            Icons.Draw(g, "fa-star", New RectangleF(14, y + 5, 12, 12), amber)
            Dim bw = r.Width - 60 - 50
            Using p = Theme.RoundRect(New RectangleF(60, y + 7, bw, 8), 4)
                Using b As New SolidBrush(Theme.G100) : g.FillPath(b, p) : End Using
            End Using
            If c > 0 Then
                Using p = Theme.RoundRect(New RectangleF(60, y + 7, CSng(bw * c / top), 8), 4)
                    Using b As New SolidBrush(amber) : g.FillPath(b, p) : End Using
                End Using
            End If
            Tr.DrawText(g, c.ToString(), Theme.Px(14), New Rectangle(r.Width - 40, y, 40, 22), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.Right Or TextFormatFlags.NoPadding)
        Next
    End Sub

    Private Shared Function StatusLabel(r As JsonObject) As String
        Select Case Js.Str(r, "status")
            Case "approved" : Return "Approved"
            Case "rejected" : Return "Rejected"
            Case Else : Return "Pending"
        End Select
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("rv2-table", k)
        _list.ShowSearch = col("rv2-t-search")
        If col("rv2-c-product") Then t.Cols.Add(New TCol("Product", Function(r) Js.Str(r, "productName"), 0, CellKind.Thumb) With {.Flex = 17, .Picture = Function(r) Js.Str(r, "productImage"), .Sub = Function(r) Js.Str(r, "categoryName"), .Sort = Function(r) Js.Str(r, "productName").ToLowerInvariant()})
        If col("rv2-c-customer") Then
            t.Cols.Add(New TCol("Name", Function(r) Js.Str(r, "customerName"), 0, CellKind.Bold) With {.Flex = 13, .Sort = Function(r) Js.Str(r, "customerName").ToLowerInvariant(),
                .Sub = Function(r) Js.Str(r, "customerPhone", "No phone") & If(Js.Bool(r, "phoneFromName"), " (by name)", "") & " · " & If(Js.Str(r, "orderNumber") <> "", Js.Str(r, "orderNumber"), Fmt.Day(Js.Time(r, "createdAt")))})
        End If
        If col("rv2-c-rating") Then
            t.Cols.Add(New TCol("Rating", Nothing, 0, CellKind.Custom) With {.Flex = 10, .Sort = Function(r) Js.Int(r, "rating"),
                .Draw = Sub(g, rr, r)
                            Dim n = Js.Int(r, "rating")
                            Using f As New Font("Segoe UI Symbol", 11)
                                For k = 1 To 5
                                    Tr.DrawText(g, "★", f, New Rectangle(rr.X + (k - 1) * 17, rr.Y, 17, rr.Height), If(k <= n, Color.FromArgb(&HF5, &H9E, &HB), Theme.G200), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                Next
                            End Using
                        End Sub})
        End If
        If col("rv2-c-review") Then t.Cols.Add(New TCol("Review", Function(r) If(Js.Str(r, "reviewText").Trim() = "", "Rating only", Js.Str(r, "reviewText").Replace(vbLf, " ")), 0) With {.Flex = 24, .Colour = Function(r) If(Js.Str(r, "reviewText").Trim() = "", Theme.G400, Theme.G800)})
        If col("rv2-c-status") Then
            t.Cols.Add(New TCol("Status", Function(r) StatusLabel(r), 0, CellKind.PillMenu) With {.Flex = 11, .Key = "status", .Sort = Function(r) Js.Str(r, "status"),
                .Colour = Function(r) If(StatusLabel(r) = "Approved", Theme.Green, If(StatusLabel(r) = "Rejected", Color.FromArgb(&HDC, &H26, &H26), Fmt.Yellow))})
        End If
        If col("rv2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Actions).Btn("edit", ChrW(&HE70F), "Edit review", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("delete", Theme.IcDelete, "Delete review", Color.FromArgb(&HDC, &H26, &H26)))
        t.RowHeight = 64
        t.RowClickable = True
        t.EmptyText = "No reviews yet."
    End Sub

    Protected Overrides Sub Reload()
        _all = AppState.I.PageList("reviews", "rows")
        Dim all = _all
        Ui.Refill(_category, {"0|All categories"}.Concat(all.Where(Function(r) Not Js.IsNull(r, "categoryId")).GroupBy(Function(r) Js.Int(r, "categoryId")).Select(Function(g) g.Key & "|" & Js.Str(g.First(), "categoryName"))))
        Ui.Refill(_product, {"0|All products"}.Concat(all.GroupBy(Function(r) Js.Int(r, "productId")).Select(Function(g) g.Key & "|" & Js.Str(g.First(), "productName"))))
        Dim status = Ui.Val(_status), rating = Ui.Val(_rating), text = Ui.Val(_text)
        Dim category = CInt(Ui.Val(_category)), product = CInt(Ui.Val(_product))
        Dim list = all.Where(Function(r)
                                 Dim n = Js.Int(r, "rating")
                                 If status <> "all" AndAlso Js.Str(r, "status") <> status Then Return False
                                 If rating = "high" AndAlso n < 4 Then Return False
                                 If rating = "low" AndAlso n > 2 Then Return False
                                 Dim want As Integer
                                 If Integer.TryParse(rating, want) AndAlso n <> want Then Return False
                                 If category <> 0 AndAlso Js.Int(r, "categoryId") <> category Then Return False
                                 If product <> 0 AndAlso Js.Int(r, "productId") <> product Then Return False
                                 Dim hasText = Js.Str(r, "reviewText").Trim() <> ""
                                 If text <> "all" AndAlso hasText <> (text = "with") Then Return False
                                 If _range.ToggleOn AndAlso Not InRange(Js.Time(r, "createdAt")) Then Return False
                                 Return _list.Matches(Js.Str(r, "customerName") & " " & Js.Str(r, "customerPhone") & " " & Js.Str(r, "orderNumber") & " " & Js.Str(r, "orderId") & " " & Js.Str(r, "productName") & " " & Js.Str(r, "categoryName") & " " & Js.Str(r, "brandName") & " " & Js.Str(r, "reviewText"))
                             End Function).ToList()
        _shown = list
        Dim filtersOn = status <> "all" OrElse rating <> "all" OrElse text <> "all" OrElse category <> 0 OrElse product <> 0 OrElse _range.ToggleOn
        _list.SetRows(list, all.Count, filtersOn)
        Dim isDay = Function(r As JsonObject, d As DateTime) Js.Time(r, "createdAt").HasValue AndAlso Js.Time(r, "createdAt").Value.Date = d
        Dim avg = If(all.Count = 0, 0, all.Average(Function(r) Js.Num(r, "rating")))
        _m("rv2-k-total").SetValue(all.Count.ToString(), all.Where(Function(r) Js.Str(r, "reviewText").Trim() <> "").Count() & " with a message")
        _m("rv2-k-today").SetValue(all.Where(Function(r) isDay(r, DateTime.Today)).Count().ToString(), all.Where(Function(r) isDay(r, DateTime.Today.AddDays(-1))).Count() & " yesterday")
        _m("rv2-k-pending").SetValue(all.Where(Function(r) Js.Str(r, "status") = "pending").Count().ToString(), "not shown on the shop yet")
        _m("rv2-k-approved").SetValue(all.Where(Function(r) Js.Str(r, "status") = "approved").Count().ToString(), "live on the shop")
        _m("rv2-k-rejected").SetValue(all.Where(Function(r) Js.Str(r, "status") = "rejected").Count().ToString(), "hidden from the shop")
        _m("rv2-k-average").SetValue(If(all.Count = 0, "—", avg.ToString("0.0") & "★"), "across all reviews")
        _m("rv2-k-low").SetValue(all.Where(Function(r) Js.Int(r, "rating") <= 2).Count().ToString(), "worth a look")
        _m("rv2-k-range").SetValue(all.Where(Function(r) InRange(Js.Time(r, "createdAt"))).Count().ToString(), RangeChips.LongDate(_range.From) & " – " & RangeChips.LongDate(_range.To))
        _m("rv2-k-total").Selected = Not filtersOn
        _m("rv2-k-pending").Selected = status = "pending"
        _m("rv2-k-approved").Selected = status = "approved"
        _m("rv2-k-rejected").Selected = status = "rejected"
        _m("rv2-k-low").Selected = rating = "low"
        _m("rv2-k-range").Selected = _range.ToggleOn
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("rv2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("rv2-cards"))
        Kit.Show(_rangeCard, _display.Item("rv2-range"))
        Kit.Show(_spread, _display.Item("rv2-spread") AndAlso all.Count > 0)
        _bars.Invalidate()
        _filters.Apply(_display, "rv2-filters")
        If Not _display.IsOn("rv2-filters") Then Kit.Show(_filters, False)
        Kit.Show(_list, _display.IsOn("rv2-table"))
    End Sub

    Private Function SetStatusAsync(r As JsonObject, status As String) As Task
        Return PageActions.EachAsync(Me, {r}, Function(x) New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/reviews2/" & Js.Int(x, "id"), .Body = Js.Obj("status", status),
            .Label = "Review " & Js.Str(x, "customerName") & ": " & status, .Effect = PageActions.PageRow("reviews", Js.Field(x, "id"), Js.Obj("status", status), "rows")},
            If(status = "approved", "Approved — it shows on the product page.", If(status = "rejected", "Rejected — hidden from the shop.", "Set back to pending.")))
    End Function

    Private Async Function DeleteAsync(r As JsonObject) As Task
        If Js.Int(r, "id") < 0 Then Return
        If Not Ui.Confirm(Me, "The review by " & Js.Str(r, "customerName") & " will be removed. This cannot be undone.", "Delete this review?") Then Return
        Await PageActions.EachAsync(Me, {r}, Function(x) New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/reviews2/" & Js.Int(x, "id"), .Label = "Delete review",
            .Effect = PageActions.PageRowDelete("reviews", Js.Field(x, "id"), "rows")}, "Review deleted.")
    End Function

    ''' <summary>Add / edit a review (the website's form): product, name, phone, order no., stars, text, status.</summary>
    Private Sub Edit(r As JsonObject)
        Dim products = AppState.I.List("products")
        Dim f As New FormDialog(If(r Is Nothing, "Add Review", "Edit Review"), 600)
        Dim label = Function(p As JsonObject) Js.Str(p, "name") & If(Js.Str(p, "sku") <> "", " (" & Js.Str(p, "sku") & ")", "")
        If r Is Nothing Then
            f.AddCombo("product", "Product", products.Select(label))
        Else
            f.AddNote("Product: " & Js.Str(r, "productName"), Theme.G900)
        End If
        f.AddText("name", "Name", Js.Str(r, "customerName"), required:=True)
        f.AddText("phone", "Phone (optional)", Js.Str(r, "customerPhone"), half:=True)
        f.AddText("order", "Order id (optional)", If(Js.IsNull(r, "orderId"), "", Js.Str(r, "orderId")), half:=True)
        f.AddPick("rating", "Rating", {"5|★★★★★  5", "4|★★★★  4", "3|★★★  3", "2|★★  2", "1|★  1"}, If(r Is Nothing, "5", Js.Int(r, "rating").ToString()), half:=True)
        f.AddPick("status", "Status", {"approved|Approved", "pending|Pending", "rejected|Rejected"}, Js.Str(r, "status", "approved"), half:=True)
        f.AddMulti("text", "Review (optional)", Js.Str(r, "reviewText"), 90)
        f.Validator = Function(d) If(r Is Nothing AndAlso Not products.Any(Function(p) label(p) = d.Val("product")), "Choose the product from the list.", Nothing)
        f.OnSave = Async Function(d)
                       Dim p = If(r Is Nothing, products.First(Function(x) label(x) = d.Val("product")), products.FirstOrDefault(Function(x) Js.Int(x, "id") = Js.Int(r, "productId")))
                       Dim productId = If(r Is Nothing, Js.Int(p, "id"), Js.Int(r, "productId"))
                       Dim orderNo As Integer
                       Dim body As New JsonObject From {{"productId", productId}, {"customerName", d.Val("name").Trim()}, {"customerPhone", d.Val("phone").Trim()},
                           {"orderId", If(Integer.TryParse(d.Val("order").Trim(), orderNo), JsonValue.Create(orderNo), Nothing)}, {"rating", CInt(d.Val("rating"))}, {"reviewText", d.Val("text").Trim()},
                           {"status", d.Val("status")}, {"customerId", Js.Copy(Js.Field(r, "customerId"))}, {"createdAt", Js.Copy(Js.Field(r, "createdAt"))}}
                       Dim item As New OutboxItem With {.Method = If(r Is Nothing, "POST", "PUT"), .Path = If(r Is Nothing, "/api/ecommerce/reviews2", "/api/ecommerce/reviews2/" & Js.Int(r, "id")), .Body = body, .Label = "Review: " & d.Val("name").Trim()}
                       If r Is Nothing Then
                           Dim row = TryCast(Js.Copy(body), JsonObject)
                           Js.Merge(row, Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "productName", Js.Str(p, "name"), "productImage", Js.Str(p, "image"), "categoryId", Js.Int(p, "categoryId"), "createdAt", DateTime.UtcNow))
                           item.Effect = PageActions.PageRowNew("reviews", row, "rows")
                       Else
                           Dim fields = TryCast(Js.Copy(body), JsonObject)
                           fields.Remove("createdAt")
                           item.Effect = PageActions.PageRow("reviews", Js.Field(r, "id"), fields, "rows")
                       End If
                       Return Await PageActions.SendAsync(Me, item, "reviews")
                   End Function
        f.ShowDialog(FindForm())
    End Sub

    Private Sub DoExport()
        Export.Csv(Me, "Reviews", {"ID", "Date", "Product", "Category", "Customer", "Phone", "Order", "Rating", "Status", "Review"},
                   _shown.Select(Function(r) CType({CObj(Js.Int(r, "id")), Fmt.Stamp(Js.Time(r, "createdAt")), Js.Str(r, "productName"), Js.Str(r, "categoryName"), Js.Str(r, "customerName"), Js.Str(r, "customerPhone"),
                        Js.Str(r, "orderNumber"), CObj(Js.Int(r, "rating")), Js.Str(r, "status"), Js.Str(r, "reviewText")}, IEnumerable(Of Object))))
    End Sub
End Class
