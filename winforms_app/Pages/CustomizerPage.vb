Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Store Customizer": homepage blocks, product page, header menus and footer — saved through
''' the website's own draft / publish APIs (needs the internet to save; opens offline).</summary>
Public Class CustomizerPage
    Inherits ScrollPage

    Private Shared ReadOnly BlockLabel As New Dictionary(Of String, String) From {{"banner", "Banner slider"}, {"categories", "Category circles"}, {"products", "Product row"}, {"image", "Image banner"}, {"feed", "Products For You"}}
    Private Shared ReadOnly PpLabel As New Dictionary(Of String, String) From {
        {"breadcrumb", "Breadcrumb"}, {"gallery", "Photos"}, {"trust", "Trust strip"}, {"thumbs", "Photo thumbnails"}, {"info", "Name, price & offers"}, {"sizes", "Sizes & specifications"},
        {"soldBy", "Sold by"}, {"highlights", "Highlights"}, {"reviews", "Ratings & reviews"}, {"assurance", "Assurance badges"}, {"actions", "Add to Cart / Buy Now"}, {"related", "Related products"}}

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_customizer_display")
    Private ReadOnly _view As WButton = Ui.Btn("View shop", ChrW(&HE8A7), outline:=True)
    Private ReadOnly _draft As WButton = Ui.Btn("Save draft", Theme.IcSave, outline:=True)
    Private ReadOnly _publish As WButton = Ui.Btn("Publish", ChrW(&HE724), Theme.Magenta)
    Private _tabs As Tabs
    Private _tab As String
    Private _home, _product, _store, _header As JsonObject
    Private _loadedFrom As String
    Private _dirty, _saving As Boolean
    Private ReadOnly _open As New HashSet(Of String)

    Public Overrides ReadOnly Property PageTitle As String = "Store Customizer"
    Public Overrides ReadOnly Property PageSubtitle As String = "How your shop looks — homepage, product page, menus and footer"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _view, _draft, _publish}
        End Get
    End Property

    Public Sub New(Optional tab As String = "home")
        _tab = tab
        AddHandler _display.Changed, Sub() Refresh_()
        AddHandler _view.Click, Sub()
                                    Dim shop = AppState.I.Api.Server.Replace("://admin.", "://")
                                    Ui.OpenUrl(If(_tab = "home", shop & "/?hc=draft", shop))
                                End Sub
        AddHandler _draft.Click, Async Sub() Await SaveAsync(False)
        AddHandler _publish.Click, Async Sub() Await SaveAsync(True)
    End Sub

    Private ReadOnly Property Data As JsonObject
        Get
            Return AppState.I.PageObj("customizer")
        End Get
    End Property

    Private Shared Function Copy(n As JsonNode) As JsonObject
        Return If(TryCast(Js.Copy(n), JsonObject), New JsonObject())
    End Function

    Protected Overrides Sub Reload()
        Dim d = Data
        If d IsNot Nothing Then
            Dim stamp = d.ToJsonString()
            If Not _dirty AndAlso stamp <> _loadedFrom Then
                _loadedFrom = stamp
                _home = Copy(Js.Field(d, "home")) : _product = Copy(Js.Field(d, "product"))
                _store = Copy(Js.Field(d, "store")) : _header = Copy(Js.Field(d, "header"))
            End If
        End If
        Rebuild()
    End Sub

    Private Sub Touch(Optional rebuild_ As Boolean = False)
        _dirty = True
        If rebuild_ Then
            Rebuild()
            Relayout()
        End If
    End Sub

    Private Sub Rebuild()
        ClearBody()
        Dim d = Data
        Dim canStore = Js.Bool(d, "canStore")
        Dim publishable = _tab = "home" OrElse _tab = "product"
        Kit.Show(_view, _display.IsOn("cz-toolbar", "cz-b-open"))
        Kit.Show(_draft, publishable)
        _publish.Text = If(_saving, "Saving…", If(publishable, "Publish", "Save"))
        _publish.Enabled = Not _saving AndAlso d IsNot Nothing
        _draft.Enabled = Not _saving AndAlso d IsNot Nothing
        HeaderChanged()
        If d Is Nothing Then
            Body.Add(Ui.Note("The shop design hasn't been downloaded yet. Connect to the internet and press F5."))
            Return
        End If
        Dim items As New List(Of String) From {"home|Homepage", "product|Product page"}
        If canStore Then items.Add("header|Header & menus") : items.Add("footer|Footer")
        If Not canStore AndAlso (_tab = "header" OrElse _tab = "footer") Then _tab = "home"
        _tabs = New Tabs(items.ToArray()) With {.Current = _tab}
        AddHandler _tabs.Changed, Sub()
                                      _tab = _tabs.Current
                                      Rebuild()
                                      Relayout()
                                  End Sub
        Body.Add(_tabs)
        If _dirty Then Body.Add(New TextBlock("Unsaved changes", Theme.BodyBold, Fmt.AmberText))
        If Js.Bool(d, "unpublished") AndAlso _tab = "home" AndAlso _display.Item("cz-draft-note") Then Body.Add(Ui.Note("The homepage has a saved draft that is not published yet."))
        Select Case _tab
            Case "product" : ProductTab()
            Case "header" : HeaderTab()
            Case "footer" : FooterTab()
            Case Else : HomeTab()
        End Select
    End Sub

    ' ── small form helpers ──
    Private Shared Function Obj(m As JsonObject, k As String) As JsonObject
        Dim o = TryCast(m(k), JsonObject)
        If o Is Nothing Then o = New JsonObject() : m(k) = o
        Return o
    End Function

    Private Shared Function Arr(m As JsonObject, k As String) As JsonArray
        Dim a = TryCast(m(k), JsonArray)
        If a Is Nothing Then a = New JsonArray() : m(k) = a
        Return a
    End Function

    Private Function Txt(m As JsonObject, k As String, label As String, Optional hint As String = "", Optional lines As Integer = 1) As Control
        Dim w = WInput.Make(hint, "", lines > 1)
        If lines > 1 Then w.Height = 22 * lines + 14
        w.Text = Js.Str(m, k)
        AddHandler w.TextChanged, Sub()
                                      m(k) = w.Text
                                      Touch()
                                  End Sub
        Return New Field(label, w)
    End Function

    Private Function Num(m As JsonObject, k As String, label As String) As Control
        Dim w = WInput.Make("")
        w.Text = Js.Str(m, k)
        AddHandler w.TextChanged, Sub()
                                      Dim n As Integer
                                      If Integer.TryParse(w.Text.Trim(), n) Then m(k) = n : Touch()
                                  End Sub
        Return New Field(label, w)
    End Function

    Private Function Sw(m As JsonObject, k As String, label As String, Optional rebuild_ As Boolean = False) As Switch
        Dim s As New Switch(label, Js.Bool(m, k))
        AddHandler s.Toggled, Sub()
                                  m(k) = s.Checked
                                  Touch(rebuild_)
                              End Sub
        Return s
    End Function

    Private Function Card(title As String, ParamArray children As Control()) As CardBox
        Dim c As New CardBox(title, "", 18)
        For Each x In children
            If x IsNot Nothing Then c.Add(x)
        Next
        Body.Add(c)
        Return c
    End Function

    Private Shared Function Grid(ParamArray children As Control()) As Columns
        Dim c As New Columns(2, 220, 12)
        For Each x In children
            If x IsNot Nothing Then c.Add(x)
        Next
        Return c
    End Function

    Private Shared Function NewId() As String
        Return (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() * 1000 + Random.Shared.Next(1000)).ToString("x")
    End Function

    Private Async Function UploadAsync() As Task(Of String)
        Using d As New OpenFileDialog With {.Filter = "Pictures|*.jpg;*.jpeg;*.png;*.webp;*.gif"}
            If d.ShowDialog(FindForm()) <> DialogResult.OK Then Return Nothing
            Dim r = Await AppState.I.Api.MultipartAsync("POST", "/api/ecommerce/home-customizer/upload", New Dictionary(Of String, String), New Dictionary(Of String, String) From {{"file", d.FileName}})
            If Not r.IsOk Then Toast(If(r.Outcome = ApiOutcome.Offline, "Uploading needs the internet.", r.Message), True) : Return Nothing
            Return Js.Str(r.Data, "path")
        End Using
    End Function

    ' ── Homepage ──
    Private Sub HomeTab()
        Dim promo = Obj(_home, "promo"), strip = Obj(_home, "strip"), cardCfg = Obj(_home, "card")
        Card("Colours", Txt(_home, "accent", "Accent colour", "#9f2089"))
        Dim p = Card("Offer bar at the top", Sw(promo, "enabled", "Show the offer bar", True))
        If Js.Bool(promo, "enabled") Then
            p.Add(Grid(Txt(promo, "title", "Title"), Txt(promo, "subtitle", "Second line"), Txt(promo, "buttonLabel", "Button text"), Txt(promo, "buttonUrl", "Button link"), Txt(promo, "bgColor", "Background colour")))
        End If
        Dim s = Card("Info strip", Sw(strip, "enabled", "Show the info strip", True))
        If Js.Bool(strip, "enabled") Then s.Add(Grid(Txt(strip, "text", "Text", "Free delivery on shopping above ₹500"), Txt(strip, "href", "Link")))
        Dim blocks = Arr(_home, "blocks")
        Dim sec = Card("Homepage sections")
        Dim add = Ui.Btn("Add a section", Theme.IcAdd, outline:=True)
        AddHandler add.Click, Sub()
                                  Ui.PopMenu(add, BlockLabel.Select(Function(kv) kv.Key & "|" & kv.Value), Sub(t)
                                                                                                               Dim nb = NewBlock(t)
                                                                                                               blocks.Add(nb)
                                                                                                               _open.Add(Js.Str(nb, "id"))
                                                                                                               Touch(True)
                                                                                                           End Sub)
                              End Sub
        sec.Tools.Add(add)
        Dim list = Js.Objs(blocks).ToList()
        If list.Count = 0 Then sec.Add(Ui.Note("No sections yet."))
        For ix = 0 To list.Count - 1
            sec.Add(BlockEditor(blocks, list(ix), ix, list.Count))
        Next
        Card("Product cards", Grid(Sw(cardCfg, "showWishlist", "Wishlist heart"), Sw(cardCfg, "showRating", "Rating"), Sw(cardCfg, "showDiscount", "% off"), Sw(cardCfg, "showDealTimer", "Deal timer"), Sw(cardCfg, "showBadge", "Badge tag"), Sw(cardCfg, "gap", "Rounded cards with a small gap")))
        Card("Phones", Sw(_home, "bottomNav", "Bottom menu bar on phones"))
    End Sub

    Private Shared Function NewBlock(type As String) As JsonObject
        Dim id = NewId()
        Select Case type
            Case "banner" : Return New JsonObject From {{"id", id}, {"type", type}, {"enabled", True}, {"slides", New JsonArray()}, {"autoplay", 5}, {"rounded", True}}
            Case "categories" : Return New JsonObject From {{"id", id}, {"type", type}, {"enabled", True}, {"source", "all"}, {"slugs", New JsonArray()}, {"limit", 12}, {"showAllButton", True}}
            Case "products" : Return New JsonObject From {{"id", id}, {"type", type}, {"enabled", True}, {"title", "Deals of the Day"}, {"source", "deals"}, {"category", ""}, {"productIds", New JsonArray()}, {"limit", 10}}
            Case "image" : Return New JsonObject From {{"id", id}, {"type", type}, {"enabled", True}, {"image", ""}, {"href", "/"}}
            Case Else : Return New JsonObject From {{"id", id}, {"type", "feed"}, {"enabled", True}, {"title", "Products For You"}, {"showSort", True}, {"showCategory", True}, {"showBrand", True}, {"showFilters", True}}
        End Select
    End Function

    ''' <summary>One homepage section: on/off, move, remove, and (opened) its own settings.</summary>
    Private Function BlockEditor(blocks As JsonArray, b As JsonObject, ix As Integer, count As Integer) As Control
        Dim id = Js.Str(b, "id", ix.ToString())
        Dim box As New CardBox(Nothing, "", 12) With {.BackColor = Color.White}
        Dim head As New Columns(3, 40, 8) With {.Weights = {1, 8, 3}}
        Dim en As New Switch("", Js.Bool(b, "enabled"))
        AddHandler en.Toggled, Sub()
                                   b("enabled") = en.Checked
                                   Touch(True)
                               End Sub
        Dim label = If(BlockLabel.ContainsKey(Js.Str(b, "type")), BlockLabel(Js.Str(b, "type")), Js.Str(b, "type"))
        Dim isOpen = _open.Contains(id)
        Dim title As New Drawn(40, Sub(g, r)
                                       Using f = Theme.IconFont(8) : TextRenderer.DrawText(g, If(isOpen, ChrW(&HE70D), ChrW(&HE76C)), f, New Rectangle(0, 0, 16, 40), Theme.G500, TextFormatFlags.VerticalCenter) : End Using
                                       TextRenderer.DrawText(g, label, Theme.BodyBold, New Point(22, If(Js.Str(b, "title") = "", 12, 3)), If(Js.Bool(b, "enabled"), Theme.G900, Theme.G400), TextFormatFlags.NoPadding)
                                       If Js.Str(b, "title") <> "" Then TextRenderer.DrawText(g, Js.Str(b, "title"), Theme.Small, New Rectangle(22, 22, r.Width - 22, 16), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                   End Sub) With {.Cursor = Cursors.Hand}
        AddHandler title.Click, Sub()
                                    If Not _open.Remove(id) Then _open.Add(id)
                                    Rebuild()
                                    Relayout()
                                End Sub
        Dim tools As New HRow(4) With {.RightAlign = True}
        Dim up = Ui.IconBtn(ChrW(&HE74A), "Move up", Sub()
                                                          blocks.RemoveAt(ix) : blocks.Insert(ix - 1, b)
                                                          Touch(True)
                                                      End Sub)
        up.Enabled = ix > 0
        Dim down = Ui.IconBtn(ChrW(&HE74B), "Move down", Sub()
                                                              blocks.RemoveAt(ix) : blocks.Insert(ix + 1, b)
                                                              Touch(True)
                                                          End Sub)
        down.Enabled = ix < count - 1
        tools.Add(up) : tools.Add(down)
        tools.Add(Ui.IconBtn(Theme.IcDelete, "Remove section", Sub()
                                                                    If Not Ui.Confirm(Me, "Remove """ & label & """ from the homepage?") Then Return
                                                                    blocks.RemoveAt(ix)
                                                                    Touch(True)
                                                                End Sub, Theme.Danger))
        head.Add(en) : head.Add(title) : head.Add(tools)
        box.Add(head)
        If Not isOpen Then Return box
        Select Case Js.Str(b, "type")
            Case "banner"
                Dim slides = Arr(b, "slides")
                Dim row As New HRow(8)
                For Each sl In Js.Objs(slides).ToList()
                    Dim cur = sl
                    Dim pic As New WebPicture(96) With {.Cursor = Cursors.Hand}
                    pic.Source = Js.Str(cur, "image")
                    Dim tip As New ToolTip()
                    tip.SetToolTip(pic, "Click to remove this slide")
                    AddHandler pic.Click, Sub()
                                              If Not Ui.Confirm(Me, "Remove this slide?") Then Return
                                              slides.Remove(cur)
                                              Touch(True)
                                          End Sub
                    row.Add(pic)
                Next
                row.Add(Ui.Btn("Add slide", Theme.IcPhoto, outline:=True, click:=Async Sub()
                                                                                    Dim p = Await UploadAsync()
                                                                                    If p Is Nothing Then Return
                                                                                    slides.Add(Js.Obj("id", NewId(), "image", p, "href", "/"))
                                                                                    Touch(True)
                                                                                End Sub))
                box.Add(row)
                box.Add(Grid(Num(b, "autoplay", "Seconds per slide"), Sw(b, "rounded", "Rounded corners")))
            Case "categories"
                box.Add(Grid(Num(b, "limit", "How many categories"), Sw(b, "showAllButton", """All"" button")))
            Case "products"
                Dim src = Ui.Filter({"deals|Biggest discounts", "latest|Newest", "top_rated|Top rated", "category|From a category"}, 220)
                Ui.SetVal(src, Js.Str(b, "source", "deals"))
                AddHandler src.SelectedIndexChanged, Sub()
                                                         b("source") = Ui.Val(src)
                                                         Touch(True)
                                                     End Sub
                Dim g = Grid(Txt(b, "title", "Title"), New Field("Which products", src))
                If Js.Str(b, "source") = "category" Then
                    Dim cat = Ui.Filter({"|Choose…"}.Concat(AppState.I.List("categories").Select(Function(c) Js.Str(c, "slug") & "|" & Js.Str(c, "name"))), 220)
                    Ui.SetVal(cat, Js.Str(b, "category"))
                    AddHandler cat.SelectedIndexChanged, Sub()
                                                             b("category") = Ui.Val(cat)
                                                             Touch()
                                                         End Sub
                    g.Add(New Field("Category", cat))
                End If
                g.Add(Num(b, "limit", "How many products"))
                box.Add(g)
            Case "image"
                Dim row As New HRow(10)
                Dim pic As New WebPicture(96)
                pic.Source = Js.Str(b, "image")
                row.Add(pic)
                row.Add(Ui.Btn("Choose picture", Theme.IcPhoto, outline:=True, click:=Async Sub()
                                                                                         Dim p = Await UploadAsync()
                                                                                         If p Is Nothing Then Return
                                                                                         b("image") = p
                                                                                         Touch(True)
                                                                                     End Sub))
                box.Add(row)
                box.Add(Txt(b, "href", "Link"))
            Case Else
                box.Add(Txt(b, "title", "Title"))
                box.Add(Grid(Sw(b, "showSort", "Sort"), Sw(b, "showCategory", "Category filter"), Sw(b, "showBrand", "Brand filter"), Sw(b, "showFilters", "More filters")))
        End Select
        Return box
    End Function

    ' ── Product page ──
    Private Sub ProductTab()
        Dim order = Arr(_product, "order")
        Dim hidden = Arr(_product, "hidden")
        Dim m = Function(k As String) Obj(_product, k)
        Card("Colour", Txt(_product, "accent", "Accent colour"))
        Dim sec = Card("Sections (top to bottom)")
        Dim keys = order.Select(Function(x) x?.ToString()).ToList()
        For ix = 0 To keys.Count - 1
            Dim k = keys(ix), pos = ix
            If k = "soldBy" OrElse k = "highlights" Then Continue For
            Dim row As New Columns(3, 40, 8) With {.Weights = {1, 8, 2}}
            Dim shown As New Switch("", Not hidden.Any(Function(h) h?.ToString() = k))
            AddHandler shown.Toggled, Sub()
                                          Dim ex = hidden.FirstOrDefault(Function(h) h?.ToString() = k)
                                          If shown.Checked Then
                                              If ex IsNot Nothing Then hidden.Remove(ex)
                                          ElseIf ex Is Nothing Then
                                              hidden.Add(k)
                                          End If
                                          Touch()
                                      End Sub
            row.Add(shown)
            row.Add(New TextBlock(If(PpLabel.ContainsKey(k), PpLabel(k), k), Theme.Body, Theme.G800))
            Dim tools As New HRow(4) With {.RightAlign = True}
            Dim up = Ui.IconBtn(ChrW(&HE74A), "Move up", Sub()
                                                              Dim n = order(pos) : order.RemoveAt(pos) : order.Insert(pos - 1, n?.DeepClone())
                                                              Touch(True)
                                                          End Sub)
            up.Enabled = pos > 0
            Dim down = Ui.IconBtn(ChrW(&HE74B), "Move down", Sub()
                                                                  Dim n = order(pos) : order.RemoveAt(pos) : order.Insert(pos + 1, n?.DeepClone())
                                                                  Touch(True)
                                                              End Sub)
            down.Enabled = pos < keys.Count - 1
            tools.Add(up) : tools.Add(down)
            row.Add(tools)
            sec.Add(row)
        Next
        Card("Price area", Grid(Sw(m("info"), "showOffer", "Coupons under the price"), Sw(m("info"), "showDeal", "Deal timer"), Sw(m("info"), "showDescription", "Description (2 lines, then ""See more"")"), Sw(m("info"), "showStock", """Only a few left"" when stock is low"),
                                Sw(m("info"), "showRating", "Rating"), Sw(m("info"), "showWishlist", "Wishlist"), Sw(m("info"), "showShare", "Share")),
             Grid(Txt(m("cart"), "lowStockText", "Low stock text (also on product cards)", "Only a few left — order soon"), Txt(m("info"), "deliveryText", "Delivery line", "Free Delivery")))
        Card("Sizes", Grid(Txt(m("sizes"), "title", "Title", "Select Size"), Sw(m("sizes"), "showPrice", "Show price on each size")))
        Card("Buttons", Grid(Sw(m("actions"), "showCart", "Add to Cart"), Txt(m("actions"), "cartLabel", "Add to Cart text"), Sw(m("actions"), "showBuy", "Buy Now"), Txt(m("actions"), "buyLabel", "Buy Now text")),
             Sw(m("actions"), "sticky", "Keep the buttons at the bottom of the screen"))
        Dim latest As New Switch("Show newest products (off = best sellers)", Js.Str(m("reviews"), "sideSource") = "latest")
        AddHandler latest.Toggled, Sub()
                                       m("reviews")("sideSource") = If(latest.Checked, "latest", "trending")
                                       Touch()
                                   End Sub
        Card("Reviews", Grid(Txt(m("reviews"), "title", "Title"), Num(m("reviews"), "perPage", "Reviews shown")), Sw(m("reviews"), "allowWrite", "Customers who bought it can review (one per purchase)"),
             Sw(m("reviews"), "side", "Computer screens: products beside the reviews"), Txt(m("reviews"), "sideTitle", "Title of those products", "Trending now"), latest)
        Card("Related products", Grid(Txt(m("related"), "title", "Title"), Num(m("related"), "limit", "How many")))
        Card("Cart (whole shop)", Grid(Sw(m("cart"), "tileButton", "Add to Cart button on product cards"), Sw(m("cart"), "stepper", "− / + quantity after adding"), Sw(m("cart"), "floatingBar", "Floating ""View Cart"" bar"),
                                      Sw(m("cart"), "tileLowStock", """Only a few left"" on product cards"), Sw(m("cart"), "notify", "Out of stock: ""Notify me"" button instead of Add to Cart")),
             Grid(Txt(m("cart"), "barLabel", "View Cart bar text"), Txt(m("cart"), "notifyLabel", "Notify button text", "Notify me")))
    End Sub

    ' ── Header & menus ──
    Private Sub HeaderTab()
        Card("Header strip", Grid(Sw(_header, "showLocation", "Show address block"), Sw(_header, "showDeliveryInfo", "Show opening time"),
                                 Txt(_header, "deliveryLabel", "Status label", "We're open"), Txt(_header, "deliveryTimeText", "Time text", "Blank = business hours"), Txt(_header, "searchPlaceholder", "Search box text")))
        Body.Add(MenuEditor("Header menu", Arr(_store, "headerMenu"), False))
        Body.Add(MenuEditor("Side menu (phones)", Arr(_store, "sidebarMenu"), False))
        Dim md = Obj(_store, "menuDesign"), pu = Obj(_store, "push")
        Card("Menu look", Txt(md, "accent", "Highlight colour"), Grid(Sw(md, "showIcons", "Icons"), Sw(md, "dividers", "Lines between items")))
        Card("Notifications", Grid(Sw(pu, "showBell", "Bell in the header"), Sw(pu, "autoPrompt", "Ask to allow on the first visit")))
    End Sub

    ''' <summary>A list of menu links: label + link, on/off, reorder, add, remove.</summary>
    Private Function MenuEditor(title As String, items As JsonArray, simple As Boolean) As Control
        Dim c As New CardBox(title, "", If(simple, 0, 18))
        c.Tools.Add(Ui.Btn("Add link", Theme.IcAdd, outline:=True, click:=Sub() EditLink(items, Nothing, simple)))
        Dim list = Js.Objs(items).ToList()
        If list.Count = 0 Then c.Add(Ui.Note("No links."))
        For ix = 0 To list.Count - 1
            Dim it = list(ix), pos = ix
            Dim row As New Columns(If(simple, 2, 3), 40, 8) With {.Weights = If(simple, {9, 2}, {1, 8, 2})}
            If Not simple Then
                Dim en As New Switch("", Js.Field(it, "enabled") Is Nothing OrElse Js.Bool(it, "enabled"))
                AddHandler en.Toggled, Sub()
                                           it("enabled") = en.Checked
                                           Touch()
                                       End Sub
                row.Add(en)
            End If
            Dim txt As New Drawn(40, Sub(g, r)
                                         TextRenderer.DrawText(g, Js.Str(it, "label"), Theme.BodyBold, New Point(0, 3), Theme.G900, TextFormatFlags.NoPadding)
                                         TextRenderer.DrawText(g, Js.Str(it, "href") & If(Js.Bool(it, "autoCategories"), " · lists every category", ""), Theme.Small, New Rectangle(0, 22, r.Width, 16), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                     End Sub) With {.Cursor = Cursors.Hand}
            AddHandler txt.Click, Sub() EditLink(items, it, simple)
            row.Add(txt)
            Dim tools As New HRow(4) With {.RightAlign = True}
            Dim up = Ui.IconBtn(ChrW(&HE74A), "Move up", Sub()
                                                              items.RemoveAt(pos) : items.Insert(pos - 1, it)
                                                              Touch(True)
                                                          End Sub)
            up.Enabled = pos > 0
            tools.Add(up)
            tools.Add(Ui.IconBtn(ChrW(&HE711), "Remove", Sub()
                                                              items.RemoveAt(pos)
                                                              Touch(True)
                                                          End Sub, Theme.Danger))
            row.Add(tools)
            c.Add(row)
        Next
        Return c
    End Function

    Private Sub EditLink(items As JsonArray, item As JsonObject, simple As Boolean)
        Dim f As New FormDialog(If(item Is Nothing, "Add link", "Edit link"), 460)
        f.AddText("label", "Text", Js.Str(item, "label"), required:=True)
        f.AddText("href", "Link", If(item Is Nothing, "/", Js.Str(item, "href")), placeholder:="/category?slug=…")
        f.OnSave = Function(d)
                       If item Is Nothing Then
                           If simple Then
                               items.Add(Js.Obj("id", NewId(), "label", d.Val("label").Trim(), "href", d.Val("href").Trim()))
                           Else
                               Dim n = Js.Obj("id", NewId(), "label", d.Val("label").Trim(), "href", d.Val("href").Trim(), "icon", "link", "visibility", "all", "enabled", True, "newTab", False, "autoCategories", False)
                               n("children") = New JsonArray()
                               items.Add(n)
                           End If
                       Else
                           item("label") = d.Val("label").Trim()
                           item("href") = d.Val("href").Trim()
                       End If
                       Touch(True)
                       Return Task.FromResult(Of String)(Nothing)
                   End Function
        f.ShowDialog(FindForm())
    End Sub

    ' ── Footer ──
    Private Sub FooterTab()
        Dim f = Obj(_store, "footer")
        Dim cols = Arr(f, "columns")
        Card("Footer", Txt(f, "description", "About text", "Blank = your tagline", 3),
             Grid(Txt(f, "bgColor", "Background colour"), Txt(f, "accentColor", "Accent colour"), Txt(f, "copyright", "Copyright line", "© {year} {name}"), Sw(f, "showContactColumn", "Contact column")))
        Dim list = Js.Objs(cols).ToList()
        For ix = 0 To list.Count - 1
            Dim col = list(ix)
            Dim c = Card("Column " & (ix + 1), Txt(col, "title", "Column title"), MenuEditor("Links", Arr(col, "links"), True))
            c.Tools.Add(Ui.IconBtn(Theme.IcDelete, "Remove column", Sub()
                                                                       cols.Remove(col)
                                                                       Touch(True)
                                                                   End Sub, Theme.Danger))
        Next
        Body.Add(Ui.Btn("Add footer column", Theme.IcAdd, outline:=True, click:=Sub()
                                                                                   Dim n = Js.Obj("id", NewId(), "title", "Links")
                                                                                   n("links") = New JsonArray()
                                                                                   cols.Add(n)
                                                                                   Touch(True)
                                                                               End Sub))
        Dim cta = Card("Call-to-action box", Sw(f, "ctaEnabled", "Show it", True))
        If Js.Bool(f, "ctaEnabled") Then cta.Add(Grid(Txt(f, "ctaTitle", "Title"), Txt(f, "ctaSubtitle", "Second line"), Txt(f, "ctaButtonLabel", "Button text"), Txt(f, "ctaButtonUrl", "Button link", "Blank = WhatsApp")))
    End Sub

    ' ── Save / publish ──
    Private Async Function SaveAsync(publish As Boolean) As Task
        If _saving OrElse Data Is Nothing Then Return
        _saving = True
        Rebuild() : Relayout()
        Dim ok = True
        Dim post = Async Function(path As String, body As JsonNode) As Task
                       Dim r = Await AppState.I.Api.SendAsync("POST", path, body, Js.NewId())
                       If Not r.IsOk Then
                           ok = False
                           Toast(If(r.Outcome = ApiOutcome.Offline, "Saving the shop design needs the internet.", r.Message), True)
                       End If
                   End Function
        Try
            Select Case _tab
                Case "home"
                    Dim b As New JsonObject From {{"config", Js.Copy(_home)}, {"action", If(publish, "publish", "draft")}}
                    Await post("/api/ecommerce/home-customizer", b)
                Case "product"
                    Dim b As New JsonObject From {{"config", Js.Copy(_product)}, {"action", If(publish, "publish", "draft")}}
                    Await post("/api/ecommerce/product-page-customizer", b)
                Case "header"
                    Await post("/api/ecommerce/storefront-config", Js.Copy(_store))
                    If ok Then Await post("/api/ecommerce/header-settings", Js.Copy(_header))
                Case Else
                    Await post("/api/ecommerce/storefront-config", Js.Copy(_store))
            End Select
        Finally
            _saving = False
        End Try
        If ok Then
            _dirty = False
            Toast(If(publish OrElse _tab = "header" OrElse _tab = "footer", "Live on your shop now.", "Draft saved — Publish to show it to shoppers."))
            _loadedFrom = Nothing
            Await AppState.I.ReloadPageAsync("customizer")
        End If
        Rebuild() : Relayout()
    End Function
End Class
