Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.IO
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Push Notification Manager" as on the website: 5 numbers, setup notice, and the Compose (what to
''' promote, templates, details, UTM, lock-screen preview), History (progress, use again, delete),
''' Subscribers (by browser, export, list) and Settings (VAPID keys) tabs. A push written offline is sent
''' as soon as the internet is back.</summary>
Public Class PushPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("push_manager2_display")
    Private ReadOnly _exportBtn As New HeadButton("Export", "download")
    Private ReadOnly _importBtn As New HeadButton("Import", "upload")
    Private ReadOnly _newBtn As New HeadButton("New Push", "plus", Web.Blue)
    Private ReadOnly _tabs As New Tabs("compose|Compose", "history|History", "subscribers|Subscribers", "settings|Settings")
    Private ReadOnly _url As WInput = WInput.Make("https://example.com/my-page")
    Private ReadOnly _title As WInput = WInput.Make("Notification Title")
    Private ReadOnly _body As WInput = WInput.Make("Short description...", "", True)
    Private ReadOnly _image As WInput = WInput.Make("https://...")
    Private ReadOnly _utm As New Switch("Add UTM tracking — tags links to your site so visits from this push show up in analytics.", True)
    Private ReadOnly _public As WInput = WInput.Make("Starts with B… (about 87 characters)")
    Private ReadOnly _private As WInput = WInput.Make("Paste the private key")
    Private ReadOnly _subject As WInput = WInput.Make("mailto:you@example.com")
    Private ReadOnly _timer As New Timer With {.Interval = 5000}
    Private _kind As String = "product"
    Private _target As (Kind As String, Name As String, Kicker As String, Meta As String, Url As String, Image As String, Raw As JsonObject)?
    Private _lastAuto As (String, String)?
    Private _replacing As Boolean
    Private _sending As Boolean
    Private _tick As Integer
    Private _preview As Drawn

    Public Overrides ReadOnly Property PageTitle As String = "Push Notification Manager"
    Public Overrides ReadOnly Property PageSubtitle As String = "Promote products, categories and offers with browser push"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Dim l As New List(Of Control) From {_display.Button}
            Dim can = Js.Bool(AppState.I.Page("push"), "canManage")
            If _display.IsOn("pm2-header") Then
                If can AndAlso _display.IsOn("pm2-header", "pm2-b-export") Then l.Add(_exportBtn)
                If can AndAlso _display.IsOn("pm2-header", "pm2-b-import") Then l.Add(_importBtn)
                If _display.IsOn("pm2-header", "pm2-b-new") Then l.Add(_newBtn)
            End If
            Return l.ToArray()
        End Get
    End Property

    Public Sub New()
        _body.Height = 80
        _private.Box.UseSystemPasswordChar = True
        _body.Box.MaxLength = 300 : _title.Box.MaxLength = 120
        AddHandler _tabs.Changed, Sub() Refresh_()
        AddHandler _display.Changed, Sub()
                                         Refresh_()
                                         HeaderChanged()
                                     End Sub
        AddHandler _newBtn.Click, Sub()
                                      _tabs.Current = "compose"
                                      Refresh_()
                                  End Sub
        AddHandler _importBtn.Click, Sub() Ui.OpenUrl(AppState.I.Api.Server & "/push-notifications/push-manager2?tab=subscribers")
        AddHandler _exportBtn.Click, Sub() Ui.PopMenu(_exportBtn, {"csv|Subscribers (CSV)", "json|Subscribers (JSON)"}, Async Sub(k) Await ExportSubsAsync(k))
        For Each i In {_url, _title, _body, _image}
            AddHandler i.TextChanged, Sub()
                                          _preview?.Invalidate()
                                          UpdateSendState()
                                      End Sub
        Next
        AddHandler _utm.Toggled, Sub() Refresh_()
        AddHandler _timer.Tick, Async Sub()
                                    If Not Visible OrElse _tabs.Current <> "history" Then Return
                                    _tick += 1
                                    Dim live = AppState.I.PageList("push", "history").Any(Function(c) IsLive(Js.Str(c, "status")))
                                    If live OrElse _tick Mod 6 = 0 Then Await AppState.I.ReloadPageAsync("push")
                                End Sub
        _timer.Start()
    End Sub

    Private Shared Function IsLive(s As String) As Boolean
        Return s = "pending" OrElse s = "processing" OrElse s = "sending"
    End Function

    Private ReadOnly Property Origin As String
        Get
            Dim u = New Uri(AppState.I.Api.Server)
            Return u.Scheme & "://" & u.Host.Replace("admin.", "") & If(u.IsDefaultPort, "", ":" & u.Port)
        End Get
    End Property

    Private Function Abs(p As String) As String
        If String.IsNullOrEmpty(p) OrElse p.StartsWith("http") Then Return If(p, "")
        Return Origin & "/" & p.TrimStart("/"c)
    End Function

    Private Function WithUtm(url As String, title As String) As String
        Try
            Dim u As New Uri(url)
            If u.Host <> New Uri(Origin).Host Then Return url
            Dim slug = System.Text.RegularExpressions.Regex.Replace(title.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim("-"c)
            If slug.Length > 60 Then slug = slug.Substring(0, 60)
            Dim q = System.Web.HttpUtility.ParseQueryString(u.Query)
            q("utm_source") = "push" : q("utm_medium") = "web_push" : q("utm_campaign") = If(slug = "", "push", slug)
            Dim b As New UriBuilder(u) With {.Query = q.ToString()}
            Return b.Uri.ToString()
        Catch
            Return url
        End Try
    End Function

    Private Function FinalUrl() As String
        Return If(_utm.Checked AndAlso _display.IsOn("pm2-compose", "pm2-c-utm"), WithUtm(_url.Text.Trim(), _title.Text.Trim()), _url.Text.Trim())
    End Function

    Protected Overrides Sub Reload()
        Dim focused = {_url, _title, _body, _image, _public, _private, _subject}.FirstOrDefault(Function(x) x.Box.Focused)
        ClearBody(_tabs, _url, _title, _body, _image, _utm, _public, _private, _subject)
        Dim d = AppState.I.PageObj("push")
        Dim canManage = Js.Bool(d, "canManage"), configured = Js.Bool(d, "configured")
        Dim subs = Js.Int(d, "subscribers")
        Dim history = Js.Objs(Js.Arr(d, "history"))
        Dim sent = If(Js.IsNull(d, "sent"), history.Sum(Function(h) Js.Int(h, "sent")), Js.Int(d, "sent"))
        Dim failed = If(Js.IsNull(d, "failed"), history.Sum(Function(h) Js.Int(h, "failed")), Js.Int(d, "failed"))
        Dim rate = If(sent + failed > 0, CInt(Math.Round(sent * 100.0 / (sent + failed))), 0)

        Dim cards As New Columns(5, 160, 12)
        Dim card = Sub(key As String, caption As String, glyph As String, colour As Color, value As String)
                       If Not _display.IsOn("pm2-cards", key) Then Return
                       Dim m As New MiniStat(caption, glyph, colour) With {.Height = 84}
                       m.SetValue(value)
                       cards.Add(m)
                   End Sub
        card("pm2-k-subs", "Subscribers", Theme.IcPeople, Theme.Blue, subs.ToString())
        card("pm2-k-campaigns", "Campaigns", ChrW(&HE789), Theme.Primary, If(Js.IsNull(d, "campaigns"), history.Count, Js.Int(d, "campaigns")).ToString())
        card("pm2-k-sent", "Delivered", Theme.IcDone, Color.FromArgb(5, &H96, &H69), sent.ToString())
        card("pm2-k-failed", "Failed", Theme.IcBlock, Color.FromArgb(&HEF, &H44, &H44), failed.ToString())
        card("pm2-k-rate", "Delivery Rate", ChrW(&HE8C1), Color.FromArgb(&HD9, &H77, 6), rate & "%")
        If cards.Controls.Count > 0 AndAlso _display.IsOn("pm2-cards") Then cards.Count = cards.Controls.Count : Body.Add(cards)

        If _display.Item("pm2-notice") AndAlso Not configured Then
            Dim note As New CardBox(Nothing, "", 12)
            Dim row As New HRow(10)
            row.Add(New Label With {.AutoSize = True, .Font = Theme.Body, .ForeColor = Color.FromArgb(&H92, &H40, &HE), .BackColor = Color.Transparent, .Text = "⚠  Push notifications aren't configured yet — sending is disabled until the VAPID keys are saved.", .Padding = New Padding(0, 9, 0, 0)})
            If canManage AndAlso _tabs.Current <> "settings" Then row.Add(Ui.Btn("Open Settings", "", outline:=True, click:=Sub()
                                                                                                                              _tabs.Current = "settings"
                                                                                                                              Refresh_()
                                                                                                                          End Sub))
            note.Add(row)
            Body.Add(note)
        End If

        _tabs.Items.Clear()
        _tabs.Items.Add(("compose", "Compose"))
        _tabs.Items.Add(("history", "History"))
        If canManage Then _tabs.Items.Add(("subscribers", "Subscribers")) : _tabs.Items.Add(("settings", "Settings"))
        If Not _tabs.Items.Any(Function(t) t.Key = _tabs.Current) Then _tabs.Current = "compose"
        Dim tabCard As New CardBox(Nothing, "", 8)
        tabCard.Add(_tabs)
        Body.Add(tabCard)
        _tabs.Invalidate()
        Select Case _tabs.Current
            Case "compose" : If _display.IsOn("pm2-compose") Then Compose(configured, subs)
            Case "history" : If _display.IsOn("pm2-history") Then HistoryTab(history, d)
            Case "subscribers" : If _display.IsOn("pm2-subs") Then Subscribers(d)
            Case "settings" : If _display.IsOn("pm2-settings") Then Settings(d, configured, subs)
        End Select
        If focused IsNot Nothing AndAlso focused.Parent IsNot Nothing Then
            focused.Box.Focus()
            focused.Box.SelectionStart = focused.Box.TextLength
        End If
    End Sub

    ' ───────── Compose ─────────
    Private Function Templates(shop As String) As List(Of (Label As String, Title As String, Body As String))
        Dim l As New List(Of (String, String, String))
        If _target Is Nothing Then
            If _kind = "custom" Then
                l.Add(("📢 Announcement", "📢 News from " & shop, "Tap to see what's new."))
                l.Add(("🎉 Store-wide sale", "🎉 Sale is live at " & shop & "!", "Big discounts across the store. Shop now before it ends!"))
            End If
            Return l
        End If
        Dim t = _target.Value
        Dim r = t.Raw
        Select Case t.Kind
            Case "product"
                Dim price = Js.Num(r, "price"), sale = Js.Num(r, "salePrice")
                Dim fin = If(sale > 0 AndAlso sale < price, sale, price)
                Dim pct = If(sale > 0 AndAlso sale < price, CInt(Math.Round((price - sale) * 100 / price)), 0)
                Dim stock = If(Js.IsNull(r, "stock"), -1, Js.Int(r, "stock"))
                Dim n = Js.Str(r, "name")
                If pct > 0 Then l.Add(("🔥 Deal", "🔥 " & pct & "% OFF — " & n, "Now " & Theme.Money(fin) & " (was " & Theme.Money(price) & "). Grab it before the offer ends!"))
                l.Add(("✨ New arrival", "✨ New arrival: " & n, "Just landed at " & shop & " for " & Theme.Money(fin) & ". Tap to check it out."))
                If stock > 0 AndAlso stock <= 5 Then l.Add(("⏳ Few left", "⏳ Only " & stock & " left — " & n, "Selling fast! Get yours now for " & Theme.Money(fin) & " before it's gone."))
                l.Add(("✅ Back in stock", "✅ Back in stock: " & n, "It's back! Order now for " & Theme.Money(fin) & " before it sells out again."))
                l.Add(("⭐ Top pick", "⭐ Today's pick: " & n, "Customers love it — just " & Theme.Money(fin) & " at " & shop & ". Tap to shop."))
            Case "category"
                Dim n = Js.Str(r, "name")
                Dim c = If(Js.Int(r, "count") > 0, Js.Int(r, "count") & "+ ", "")
                l.Add(("🛍️ Explore", "🛍️ Explore " & n, c & "products in " & n & " at " & shop & ". Tap to shop now."))
                l.Add(("🔥 Sale", "🔥 Big savings on " & n, "Top picks in " & n & " at great prices. Limited time only!"))
                l.Add(("✨ New stock", "✨ Fresh arrivals in " & n, "New " & n & " just added at " & shop & ". Be the first to shop!"))
            Case "brand"
                Dim n = Js.Str(r, "name")
                l.Add(("⭐ Featured brand", "⭐ " & n & " at " & shop, "Shop " & Js.Int(r, "count") & " " & n & " products. Tap to explore."))
                l.Add(("🔥 Brand sale", "🔥 Deals on " & n, "Special prices on " & n & " — for a limited time only!"))
            Case "offer"
                Dim ends = If(Js.Time(r, "endsAt").HasValue, " Ends " & Fmt.Day(Js.Time(r, "endsAt")) & ".", "")
                If Js.Str(r, "code") <> "" Then
                    Dim off = If(Js.Str(r, "discountType") = "percentage", Js.Str(r, "discountValue") & "% OFF", Theme.Money(Js.Num(r, "discountValue")) & " OFF")
                    Dim code = Js.Str(r, "code")
                    l.Add(("🎟️ Coupon code", "🎟️ " & off & " — use " & code, "Apply code " & code & " at checkout on " & shop & "." & ends))
                    l.Add(("⏳ Hurry", "⏳ Your " & off & " code is waiting", "Use " & code & " before it runs out!" & ends))
                Else
                    l.Add(("🔥 Sale is live", "🔥 " & Js.Str(r, "name") & ": " & t.Meta, "Prices already dropped at " & shop & " — no code needed." & ends))
                    l.Add(("⏰ Last chance", "⏰ Last chance: " & t.Meta, Js.Str(r, "name") & " ends soon. Shop now!" & ends))
                End If
        End Select
        Return l
    End Function

    Private Sub Choose(t As (Kind As String, Name As String, Kicker As String, Meta As String, Url As String, Image As String, Raw As JsonObject), shop As String)
        Dim untouched = (_title.Text = "" AndAlso _body.Text = "") OrElse (_lastAuto.HasValue AndAlso _title.Text = _lastAuto.Value.Item1 AndAlso _body.Text = _lastAuto.Value.Item2)
        _kind = t.Kind
        _target = t
        If t.Url <> "" Then _url.Text = t.Url
        If t.Image <> "" Then _image.Text = t.Image
        Dim tpl = Templates(shop).FirstOrDefault()
        If tpl.Title IsNot Nothing AndAlso untouched Then
            _title.Text = tpl.Title
            _body.Text = tpl.Body
            _lastAuto = (tpl.Title, tpl.Body)
        End If
        Refresh_()
    End Sub

    ''' <summary>The website's pickers: search a product / category / brand / offer from this computer's lists.</summary>
    Private Sub Pick(kind As String, shop As String)
        Dim s = AppState.I
        Dim products = s.List("products")
        Dim items As New List(Of (Kind As String, Name As String, Kicker As String, Meta As String, Url As String, Image As String, Raw As JsonObject))
        Select Case kind
            Case "product"
                For Each p In products.Where(Function(x) Js.Str(x, "status") = "active" AndAlso Js.Int(x, "id") > 0)
                    Dim price = Js.Num(p, "price"), sale = Js.Num(p, "salePrice")
                    Dim stock = If(Js.Str(p, "type") = "physical", If(Js.IsNull(p, "stock"), "Stock not set", If(Js.Int(p, "stock") <= 0, "Out of stock", Js.Int(p, "stock") & " in stock")), "")
                    items.Add(("product", Js.Str(p, "name"), "Product", Theme.Money(If(sale > 0 AndAlso sale < price, sale, price)) & If(stock = "", "", " · " & stock),
                               Origin & "/product?slug=" & Uri.EscapeDataString(Js.Str(p, "slug", Js.Str(p, "id"))), Abs(Js.Str(p, "image")), p))
                Next
            Case "category"
                For Each c In s.List("categories").Where(Function(x) Js.Str(x, "status") = "active")
                    Dim n = products.Where(Function(p) Js.Int(p, "categoryId") = Js.Int(c, "id")).Count()
                    Dim raw = TryCast(Js.Copy(c), JsonObject)
                    raw("count") = n
                    items.Add(("category", Js.Str(c, "name"), "Category", n & " products", Origin & "/category?slug=" & Uri.EscapeDataString(Js.Str(c, "slug")), Abs(Js.Str(c, "image")), raw))
                Next
            Case "brand"
                For Each b In s.List("brands").Where(Function(x) Js.Str(x, "status") = "active")
                    Dim n = products.Where(Function(p) Js.Int(p, "brandId") = Js.Int(b, "id")).Count()
                    Dim raw = TryCast(Js.Copy(b), JsonObject)
                    raw("count") = n
                    items.Add(("brand", Js.Str(b, "name"), "Brand", n & " products", Origin & "/?q=" & Uri.EscapeDataString(Js.Str(b, "name")), Abs(Js.Str(b, "logo")), raw))
                Next
            Case "offer"
                For Each c In s.PageList("campaigns", "campaigns").Where(Function(x) Not Js.Bool(x, "isPaused") AndAlso (Not Js.Time(x, "endsAt").HasValue OrElse Js.Time(x, "endsAt").Value > DateTime.Now))
                    Dim meta = If(Js.Str(c, "discountType") = "percent", CInt(Js.Num(c, "discountValue")) & "% OFF", If(Js.Str(c, "discountType") = "amount", Theme.Money(Js.Num(c, "discountValue")) & " OFF", "Special prices"))
                    items.Add(("offer", Js.Str(c, "name"), "Campaign offer", meta, Origin, "", c))
                Next
                For Each c In s.List("coupons")
                    items.Add(("offer", Js.Str(c, "title"), "Coupon · " & Js.Str(c, "code"), If(Js.Str(c, "discountType") = "percentage", Js.Str(c, "discountValue") & "% OFF", Theme.Money(Js.Num(c, "discountValue")) & " OFF"), Origin, "", c))
                Next
        End Select
        Dim f As New FormDialog("Choose a " & If(kind = "offer", "offer or coupon", kind), 600, "Choose")
        Dim search = WInput.Make("Search…", Theme.IcSearch)
        Dim t As New WebTable() With {.RowHeight = 52, .RowClickable = True, .EmptyText = "Nothing found."}
        t.Cols.Add(New TCol("", Function(x) Js.Str(x, "name"), 0, CellKind.Thumb) With {.Picture = Function(x) Js.Str(x, "image"), .Sub = Function(x) Js.Str(x, "kicker") & " · " & Js.Str(x, "meta")})
        Dim rows = items.Select(Function(x, i) Js.Obj("id", i, "name", x.Name, "kicker", x.Kicker, "meta", x.Meta, "image", x.Image)).ToList()
        Dim fill = Sub()
                       Dim q = search.Text.Trim().ToLowerInvariant()
                       t.Rows = rows.Where(Function(x) q = "" OrElse (Js.Str(x, "name") & " " & Js.Str(x, "kicker")).ToLowerInvariant().Contains(q)).Take(80).ToList()
                       t.Height = t.HeightFor(t.Width)
                       If f.IsHandleCreated Then f.Relayout()
                       t.Invalidate()
                   End Sub
        f.AddControl(search)
        f.AddControl(t)
        fill()
        Dim chosen As Integer = -1
        AddHandler search.TextChanged, Sub() fill()
        AddHandler t.RowClick, Sub(x)
                                   chosen = Js.Int(x, "id")
                                   f.DialogResult = DialogResult.OK
                               End Sub
        f.SaveButton.Visible = False
        If f.ShowDialog(FindForm()) = DialogResult.OK AndAlso chosen >= 0 Then Choose(items(chosen), shop)
    End Sub

    Private _sendBtn As WButton
    Private Sub UpdateSendState()
        If _sendBtn Is Nothing Then Return
        Dim d = AppState.I.PageObj("push")
        _sendBtn.Enabled = Js.Bool(d, "configured") AndAlso _title.Text.Trim() <> "" AndAlso _url.Text.Trim() <> "" AndAlso Not _sending
    End Sub

    Private Sub Compose(configured As Boolean, subs As Integer)
        Dim c = Function(k As String) _display.IsOn("pm2-compose", k)
        Dim shop = Js.Str(AppState.I.Settings, "businessName", "our store")
        Dim kinds = {("product", "Product", Theme.IcPackage), ("offer", "Offer / Coupon", ChrW(&HE8C1)), ("category", "Category", Theme.IcGrid), ("brand", "Brand", Theme.IcTag), ("custom", "Custom URL", ChrW(&HE71B))}.
            Where(Function(k) _display.IsOn("pm2-types", "pm2-t-" & k.Item1)).ToList()
        Dim left As New CardBox("Compose Notification", ChrW(&HE70F)) With {.Accent = Theme.Blue}
        Dim label = Function(t As String) New TextBlock(t.ToUpperInvariant(), Theme.UiFont(8.25F, FontStyle.Bold), Theme.G500)
        If c("pm2-c-target") AndAlso kinds.Count > 0 Then
            left.Add(label("1. What are you promoting?"))
            Dim row As New Columns(kinds.Count, 90, 6)
            For Each k In kinds
                Dim key = k.Item1
                Dim cc As New ChoiceCard(k.Item2, "", k.Item3) With {.Selected = _kind = key, .Height = 56}
                AddHandler cc.Click, Sub()
                                         _kind = key
                                         If _target.HasValue AndAlso _target.Value.Kind <> key Then _target = Nothing
                                         If key <> "custom" Then Pick(key, shop) Else Refresh_()
                                     End Sub
                row.Add(cc)
            Next
            left.Add(row)
            If _target.HasValue Then
                Dim tg = _target.Value
                Dim box As New CardBox(Nothing, "", 10)
                Dim info As New Drawn(58, Sub(g, r)
                                              Dim im = Img.Get(tg.Image, 120, Sub() _preview?.Invalidate())
                                              Gfx.Thumb(g, New Rectangle(0, 1, 56, 56), im)
                                              Tr.DrawText(g, tg.Kicker.ToUpperInvariant(), Theme.UiFont(7.5F, FontStyle.Bold), New Point(68, 2), Theme.G500, TextFormatFlags.NoPadding)
                                              Tr.DrawText(g, tg.Name, Theme.BodyBold, New Rectangle(68, 18, r.Width - 68, 20), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                              Tr.DrawText(g, tg.Meta, Theme.Small, New Rectangle(68, 38, r.Width - 68, 18), Theme.G600, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                          End Sub)
                box.Add(info)
                box.Tools.Add(Ui.Btn("Change", "", outline:=True, click:=Sub() Pick(_kind, shop)))
                box.Tools.Add(Ui.IconBtn(Theme.IcCancel, "Remove", Sub()
                                                                        _target = Nothing
                                                                        Refresh_()
                                                                    End Sub))
                box.Title = " "
                left.Add(box)
            ElseIf _kind <> "custom" Then
                Dim k = kinds.FirstOrDefault(Function(x) x.Item1 = _kind)
                left.Add(Ui.Btn("Choose a " & If(k.Item2, "product").ToLowerInvariant(), Theme.IcChevronDown, outline:=True, click:=Sub() Pick(_kind, shop)))
            Else
                left.Add(Ui.Note("Custom link — type any URL below (your own site or elsewhere)."))
            End If
        End If
        Dim tpls = Templates(shop)
        If c("pm2-c-templates") AndAlso tpls.Count > 0 Then
            left.Add(label("2. Message template"))
            Dim row As New HRow(6)
            For Each tp In tpls
                Dim t = tp
                Dim b = WButton.Make(t.Label, "", Theme.Primary, outline:=Not (_title.Text = t.Title AndAlso _body.Text = t.Body))
                b.Height = 32
                AddHandler b.Click, Sub()
                                        _title.Text = t.Title
                                        _body.Text = t.Body
                                        _lastAuto = (t.Title, t.Body)
                                        Refresh_()
                                    End Sub
                row.Add(b)
            Next
            left.Add(row)
        End If
        If c("pm2-c-fields") Then
            left.Add(label("3. Notification details"))
            left.Add(New Field("Target URL *", _url))
            left.Add(New Field("Title *" & If(c("pm2-c-counters"), "   (" & _title.Text.Length & "/50)", ""), _title))
            left.Add(New Field("Message Body" & If(c("pm2-c-counters"), "   (" & _body.Text.Length & "/120)", ""), _body))
            left.Add(New Field("Banner Image URL", _image))
        End If
        If c("pm2-c-utm") Then
            left.Add(_utm)
            Dim fu = FinalUrl()
            If _utm.Checked AndAlso _url.Text.Trim() <> "" AndAlso fu <> _url.Text.Trim() Then left.Add(New TextBlock(fu, Theme.Small, Theme.G600))
        End If
        If c("pm2-c-actions") Then
            _sendBtn = Ui.Btn(If(_sending, "Sending…", "Send to All Subscribers"), ChrW(&HE724), Color.FromArgb(5, &H96, &H69), click:=Async Sub() Await SendAsync(subs))
            _sendBtn.Height = 46
            left.Add(_sendBtn)
            UpdateSendState()
            left.Add(Ui.Btn("View Live Progress", ChrW(&HE81C), outline:=True, click:=Sub()
                                                                                             _tabs.Current = "history"
                                                                                             Refresh_()
                                                                                         End Sub))
            If Not configured Then left.Add(Ui.Note("Sending is disabled until VAPID keys are saved in Settings.", Fmt.AmberText))
            If configured AndAlso subs = 0 Then left.Add(Ui.Note("No subscribers yet — shoppers subscribe from the ""Allow Notifications"" prompt on the store.", Fmt.AmberText))
        End If
        Dim cols As New Columns(2, 300, 20) With {.Weights = {7, 5}, .Stretch = False}
        cols.Add(left)
        If c("pm2-c-preview") Then
            Dim right As New VStack(10)
            right.Add(New TextBlock("📱  LIVE LOCK SCREEN PREVIEW", Theme.UiFont(8.25F, FontStyle.Bold), Theme.G500) With {.Center = True})
            _preview = New Drawn(580, AddressOf PaintPhone)
            right.Add(_preview)
            If c("pm2-c-note") Then right.Add(New TextBlock("*Preview renders roughly how it appears on modern Android devices.", Theme.Small, Theme.G500) With {.Center = True})
            cols.Add(right)
        End If
        Body.Add(cols)
    End Sub

    Private Sub PaintPhone(g As Graphics, r As Rectangle)
        Dim shop = Js.Str(AppState.I.Settings, "businessName", "our store")
        Dim w = 292, h = 560
        Dim x0 = Math.Max(0, (r.Width - w) \ 2)
        Dim phone As New Rectangle(x0, 0, w, h)
        Using p = Theme.RoundRect(New RectangleF(phone.X, phone.Y, phone.Width, phone.Height), 40)
            Using b As New SolidBrush(Theme.G900) : g.FillPath(b, p) : End Using
        End Using
        Dim screen As New Rectangle(x0 + 10, 10, w - 20, h - 20)
        Using p = Theme.RoundRect(New RectangleF(screen.X, screen.Y, screen.Width, screen.Height), 31)
            Using b As New LinearGradientBrush(screen, Color.FromArgb(&H66, &H7E, &HEA), Color.FromArgb(&H76, &H4B, &HA2), LinearGradientMode.ForwardDiagonal)
                g.FillPath(b, p)
            End Using
        End Using
        Dim now = DateTime.Now
        Using f = Theme.UiFont(34.0F, FontStyle.Regular)
            Tr.DrawText(g, now.ToString("h:mm"), f, New Rectangle(screen.X, screen.Y + 50, screen.Width, 60), Color.FromArgb(220, 255, 255, 255), TextFormatFlags.HorizontalCenter)
        End Using
        Tr.DrawText(g, now.ToString("dddd, MMMM d", Globalization.CultureInfo.InvariantCulture), Theme.Body, New Rectangle(screen.X, screen.Y + 112, screen.Width, 20), Color.FromArgb(220, 255, 255, 255), TextFormatFlags.HorizontalCenter)
        Dim imgUrl = _image.Text.Trim()
        Dim im = If(imgUrl = "", Nothing, Img.Get(imgUrl, 400, Sub() _preview?.Invalidate()))
        Dim cardH = 76 + If(im IsNot Nothing, 128, 0)
        Dim card As New Rectangle(screen.X + 14, screen.Y + 150, screen.Width - 28, cardH)
        Using p = Theme.RoundRect(New RectangleF(card.X, card.Y, card.Width, card.Height), 12)
            Using b As New SolidBrush(Color.FromArgb(242, 255, 255, 255)) : g.FillPath(b, p) : End Using
        End Using
        Using p = Theme.RoundRect(New RectangleF(card.X + 12, card.Y + 10, 16, 16), 4)
            Using b As New SolidBrush(Theme.Blue) : g.FillPath(b, p) : End Using
        End Using
        Using f = Theme.IconFont(6.5F) : Theme.DrawCentered(g, ChrW(&HEA8F), f, Color.White, New Rectangle(card.X + 12, card.Y + 10, 16, 16)) : End Using
        Tr.DrawText(g, shop, Theme.UiFont(7.5F, FontStyle.Bold), New Rectangle(card.X + 33, card.Y + 10, card.Width - 80, 16), Color.FromArgb(&H55, &H55, &H55), TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, "now", Theme.UiFont(7.5F), New Rectangle(card.Right - 40, card.Y + 10, 28, 16), Color.FromArgb(&H55, &H55, &H55), TextFormatFlags.VerticalCenter Or TextFormatFlags.Right Or TextFormatFlags.NoPadding)
        Tr.DrawText(g, If(_title.Text = "", "Notification Title", _title.Text), Theme.BodyBold, New Rectangle(card.X + 12, card.Y + 30, card.Width - 24, 18), Color.FromArgb(&H22, &H22, &H22), TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
        Tr.DrawText(g, If(_body.Text = "", "Notification body text...", _body.Text), Theme.Small, New Rectangle(card.X + 12, card.Y + 49, card.Width - 24, 26), Color.FromArgb(&H44, &H44, &H44), TextFormatFlags.NoPadding Or TextFormatFlags.WordBreak Or TextFormatFlags.EndEllipsis)
        If im IsNot Nothing Then Gfx.Thumb(g, New Rectangle(card.X + 12, card.Y + 76, card.Width - 24, 120), im, 8)
    End Sub

    Private Async Function SendAsync(subs As Integer) As Task
        Dim url = FinalUrl()
        If Not Ui.Confirm(Me, """" & _title.Text.Trim() & """ will be sent to " & subs & " subscriber" & If(subs = 1, "", "s") & "." & vbCrLf & url, "Send this notification?") Then Return
        _sending = True
        UpdateSendState()
        Dim item As New OutboxItem With {.Method = "POST", .Path = "/api/push2/send", .Label = "Push: " & _title.Text.Trim(),
            .Body = New JsonObject From {{"title", _title.Text.Trim()}, {"body", _body.Text.Trim()}, {"url", url}, {"image", If(_image.Text.Trim() = "", Nothing, JsonValue.Create(_image.Text.Trim()))}, {"postId", Nothing}}}
        Dim r = Await AppState.I.SendNowAsync(item)
        _sending = False
        If r.IsOk OrElse r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
            Toast(If(r.IsOk, "Queued for " & If(Js.IsNull(r.Data, "totalSubscribers"), subs, Js.Int(r.Data, "totalSubscribers")) & " subscriber" & If(subs = 1, "", "s") & " — it goes out after any campaign already sending.", "It will be sent as soon as the internet is back."))
            _title.Text = "" : _body.Text = "" : _url.Text = "" : _image.Text = ""
            _target = Nothing : _lastAuto = Nothing
            If r.IsOk Then Await AppState.I.ReloadPageAsync("push")
            Refresh_()
        Else
            Toast(If(Js.Str(r.Data, "error") <> "", Js.Str(r.Data, "error"), r.Message), True)
            UpdateSendState()
        End If
    End Function

    ' ───────── History ─────────
    Private Shared Function Meta(s As String) As (Label As String, Fg As Color, Bg As Color)
        Select Case s
            Case "pending" : Return ("Pending", Color.FromArgb(&H85, &H64, 4), Color.FromArgb(&HFF, &HF3, &HCD))
            Case "processing", "sending" : Return ("Processing", Color.FromArgb(8, &H42, &H98), Color.FromArgb(&HCF, &HE2, &HFF))
            Case "completed", "sent" : Return ("Completed", Color.FromArgb(&HF, &H51, &H32), Color.FromArgb(&HD1, &HE7, &HDD))
            Case "failed" : Return ("Failed", Color.FromArgb(&H84, &H20, &H29), Color.FromArgb(&HF8, &HD7, &HDA))
            Case Else : Return (If(s = "", "—", Fmt.Title(s)), Theme.G600, Theme.G100)
        End Select
    End Function

    Private Sub HistoryTab(rows As List(Of JsonObject), d As JsonObject)
        Dim h = Function(k As String) _display.IsOn("pm2-history", k)
        If rows.Count = 0 Then
            Dim empty As New CardBox(Nothing, "", 40)
            empty.Add(New TextBlock("No campaigns yet", Theme.CardTitle, Theme.G800) With {.Center = True})
            empty.Add(New TextBlock("Start sending notifications from the manager", Theme.Body, Theme.G500) With {.Center = True})
            empty.Add(Ui.Btn("Create First Push", "", Theme.Blue, click:=Sub()
                                                                            _tabs.Current = "compose"
                                                                            Refresh_()
                                                                        End Sub))
            Body.Add(empty)
            Return
        End If
        Dim live = rows.Any(Function(c) IsLive(Js.Str(c, "status")))
        If h("pm2-h-live") Then
            Body.Add(New TextBlock(If(live, "●  Sending in progress • refreshing every 5s", "●  Live status • auto-refresh every 30s") & "        Showing " & rows.Count & " of " & If(Js.IsNull(d, "campaigns"), rows.Count, Js.Int(d, "campaigns")) & " campaigns", Theme.Body, If(live, Color.FromArgb(&H10, &HB9, &H81), Theme.G600)))
        End If
        Dim card As New CardBox(Nothing, "", 12)
        Dim t As New WebTable() With {.RowHeight = 64}
        If h("pm2-h-image") Then
            t.Cols.Add(New TCol("Campaign / Post", Function(c) Js.Str(c, "title", "Custom Push"), 0, CellKind.Thumb) With {.Flex = 24, .Picture = Function(c) Js.Str(c, "image"), .Sub = Function(c) Js.Str(c, "body")})
        Else
            t.Cols.Add(New TCol("Campaign / Post", Function(c) Js.Str(c, "title", "Custom Push"), 0, CellKind.Bold) With {.Flex = 24, .Sub = Function(c) Js.Str(c, "body")})
        End If
        If h("pm2-h-status") Then t.Cols.Add(New TCol("Status", Function(c) Meta(Js.Str(c, "status")).Label, 0, CellKind.Badge) With {.Flex = 9, .Colour = Function(c) Meta(Js.Str(c, "status")).Fg})
        If h("pm2-h-progress") Then
            t.Cols.Add(New TCol("Progress", Nothing, 0, CellKind.Custom) With {.Flex = 12,
                .Draw = Sub(g, r, c)
                            Dim total = Js.Int(c, "totalSubscribers")
                            Dim pct = If(total > 0, Math.Min(1.0, Js.Int(c, "sent") / total), 0)
                            Using p = Theme.RoundRect(New RectangleF(r.X, r.Y + r.Height \ 2 - 10, r.Width - 10, 8), 4)
                                Using b As New SolidBrush(Color.FromArgb(&HE9, &HEC, &HEF)) : g.FillPath(b, p) : End Using
                            End Using
                            If pct > 0 Then
                                Using p = Theme.RoundRect(New RectangleF(r.X, r.Y + r.Height \ 2 - 10, CSng((r.Width - 10) * pct), 8), 4)
                                    Using b As New SolidBrush(Theme.Blue) : g.FillPath(b, p) : End Using
                                End Using
                            End If
                            Tr.DrawText(g, (Math.Round(pct * 1000) / 10) & "%", Theme.Small, New Point(r.X, r.Y + r.Height \ 2 + 2), Theme.G500, TextFormatFlags.NoPadding)
                        End Sub})
        End If
        If h("pm2-h-counts") Then t.Cols.Add(New TCol("Sent / Failed", Function(c) Js.Int(c, "sent") & " / " & Js.Int(c, "failed"), 0, CellKind.Bold) With {.Flex = 9, .Colour = Function(c) Color.FromArgb(5, &H96, &H69)})
        If h("pm2-h-total") Then t.Cols.Add(New TCol("Total", Function(c) Js.Int(c, "totalSubscribers").ToString(), 0) With {.Flex = 6})
        If h("pm2-h-time") Then t.Cols.Add(New TCol("Time", Function(c) Fmt.Stamp(Js.Time(c, "createdAt")), 0) With {.Flex = 10, .Colour = Function(c) Theme.G600})
        If h("pm2-h-actions") Then
            t.Cols.Add(New TCol("Actions", Nothing, 124, CellKind.Actions) With {.ButtonsFor = Function(c) If(Js.Str(c, "url") <> "", {"reuse", "url", "delete"}, {"reuse", "delete"})}.Btn("reuse", ChrW(&HE7A7), "Use again", Theme.Blue).Btn("url", ChrW(&HE71B), "View URL", Theme.G600).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        End If
        t.Rows = rows
        AddHandler t.ActionClick, Async Sub(c, k)
                                      Select Case k
                                          Case "reuse"
                                              Dim url = Js.Str(c, "url")
                                              Try
                                                  Dim u As New Uri(url)
                                                  Dim q = System.Web.HttpUtility.ParseQueryString(u.Query)
                                                  For Each key In q.AllKeys.Where(Function(x) x IsNot Nothing AndAlso x.StartsWith("utm_")).ToList() : q.Remove(key) : Next
                                                  url = New UriBuilder(u) With {.Query = q.ToString()}.Uri.ToString().TrimEnd("?"c)
                                              Catch
                                              End Try
                                              _kind = "custom" : _target = Nothing
                                              _url.Text = url : _title.Text = Js.Str(c, "title") : _body.Text = Js.Str(c, "body") : _image.Text = Js.Str(c, "image")
                                              _tabs.Current = "compose"
                                              Refresh_()
                                          Case "url" : Ui.OpenUrl(Js.Str(c, "url"))
                                          Case "delete"
                                              If Not Ui.Confirm(Me, """" & Js.Str(c, "title") & """ and its sending log will be removed.", "Delete this campaign?") Then Return
                                              Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "DELETE", .Path = "/api/push2/campaigns/" & Js.Int(c, "id"), .Label = "Delete push " & Js.Str(c, "title"),
                                                  .Effect = PageActions.PageRowDelete("push", Js.Field(c, "id"), "history")}, "push", """" & Js.Str(c, "title") & """ deleted.")
                                      End Select
                                  End Sub
        card.Add(t)
        Body.Add(card)
    End Sub

    ' ───────── Subscribers ─────────
    Private Shared ReadOnly BrowserColors As New Dictionary(Of String, Color) From {{"chrome", Theme.Blue}, {"firefox", Fmt.Orange}, {"safari", Color.FromArgb(&HE, &HA5, &HE9)}, {"edge", Color.FromArgb(&H14, &HB8, &HA6)}, {"other", Color.FromArgb(&H94, &HA3, &HB8)}}

    Private Function BrowserColor(b As String) As Color
        Dim c As Color
        Return If(BrowserColors.TryGetValue(b, c), c, Theme.G400)
    End Function

    Private Sub Subscribers(d As JsonObject)
        Dim sOn = Function(k As String) _display.IsOn("pm2-subs", k)
        Dim breakdown = Js.Objs(Js.Arr(d, "breakdown")).Where(Function(b) Js.Int(b, "count") > 0 OrElse Js.Str(b, "browser") <> "other").ToList()
        Dim rows = Js.Objs(Js.Arr(d, "subscriberRows"))
        Dim top As New Columns(2, 320, 16) With {.Weights = {2, 1}, .Stretch = True}
        If sOn("pm2-s-breakdown") Then
            Dim card As New CardBox("Subscribers by browser") With {.Subtitle = Js.Int(d, "subscribers") & " total · +" & Js.Int(d, "newThisWeek") & " this week"}
            Dim max = Math.Max(1, breakdown.Select(Function(b) Js.Int(b, "count")).DefaultIfEmpty(1).Max())
            Dim bars As New Drawn(breakdown.Count * 30, Sub(g, r)
                                                            For k = 0 To breakdown.Count - 1
                                                                Dim b = breakdown(k)
                                                                Dim y = k * 30
                                                                Tr.DrawText(g, Js.Str(b, "label"), Theme.Body, New Rectangle(0, y, 130, 20), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                                                Dim bw = r.Width - 200
                                                                Using p = Theme.RoundRect(New RectangleF(130, y + 5, bw, 10), 5)
                                                                    Using br As New SolidBrush(Theme.G100) : g.FillPath(br, p) : End Using
                                                                End Using
                                                                If Js.Int(b, "count") > 0 Then
                                                                    Using p = Theme.RoundRect(New RectangleF(130, y + 5, CSng(bw * Js.Int(b, "count") / max), 10), 5)
                                                                        Using br As New SolidBrush(BrowserColor(Js.Str(b, "browser"))) : g.FillPath(br, p) : End Using
                                                                    End Using
                                                                End If
                                                                Tr.DrawText(g, Js.Int(b, "count").ToString(), Theme.BodyBold, New Rectangle(r.Width - 60, y, 60, 20), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                            Next
                                                        End Sub)
            card.Add(bars)
            top.Add(card)
        End If
        If sOn("pm2-s-tools") Then
            Dim card As New CardBox("Import / Export")
            card.Add(Ui.Note("Back up or move subscribers. Every row is verified before saving — works only with this site's VAPID keys."))
            card.Add(Ui.Btn("Import Subscribers", ChrW(&HE898), Theme.Blue, click:=Sub() Ui.OpenUrl(AppState.I.Api.Server & "/push-notifications/push-manager2?tab=subscribers")))
            Dim row As New HRow(8)
            Dim csv = Ui.Btn("CSV", ChrW(&HE896), outline:=True, click:=Async Sub() Await ExportSubsAsync("csv"))
            Dim json = Ui.Btn("JSON", ChrW(&HE896), outline:=True, click:=Async Sub() Await ExportSubsAsync("json"))
            csv.Enabled = Js.Int(d, "subscribers") > 0 : json.Enabled = csv.Enabled
            row.Add(csv) : row.Add(json)
            card.Add(row)
            top.Add(card)
        End If
        If top.Controls.Count > 0 Then
            top.Count = top.Controls.Count
            If top.Count = 1 Then top.Weights = Nothing
            Body.Add(top)
        End If
        If sOn("pm2-s-table") Then
            Dim card As New CardBox(Nothing, "", 12)
            Dim t As New WebTable() With {.RowHeight = 46, .EmptyText = "No subscribers yet."}
            t.Cols.Add(New TCol("#", Function(r) Js.Str(r, "id"), 70) With {.Colour = Function(r) Theme.G500})
            t.Cols.Add(New TCol("Browser", Nothing, 0, CellKind.Custom) With {.Flex = 12, .Draw = Sub(g, rr, r)
                                                                                                   Using b As New SolidBrush(BrowserColor(Js.Str(r, "browser"))) : g.FillEllipse(b, rr.X, rr.Y + rr.Height \ 2 - 4, 8, 8) : End Using
                                                                                                   Tr.DrawText(g, Js.Str(r, "browserLabel"), Theme.Body, New Rectangle(rr.X + 16, rr.Y, rr.Width - 16, rr.Height), Theme.G800, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                                                                               End Sub})
            t.Cols.Add(New TCol("Push service", Function(r) Js.Str(r, "host"), 0) With {.Flex = 16, .Colour = Function(r) Theme.G600})
            t.Cols.Add(New TCol("Subscribed", Function(r) Fmt.Stamp(Js.Time(r, "createdAt")), 0) With {.Flex = 10, .Colour = Function(r) Theme.G600})
            t.Cols.Add(New TCol("", Nothing, 56, CellKind.Actions).Btn("remove", Theme.IcDelete, "Remove", Color.FromArgb(&HDC, &H26, &H26)))
            t.Rows = rows
            AddHandler t.ActionClick, Async Sub(r, k)
                                          If Not Ui.Confirm(Me, "This browser stops getting your notifications.", "Remove this subscriber?") Then Return
                                          Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "DELETE", .Path = "/api/push2/subscribers/" & Js.Int(r, "id"), .Label = "Remove push subscriber",
                                              .Effect = PageActions.PageRowDelete("push", Js.Field(r, "id"), "subscriberRows")}, "push", "Subscriber removed.")
                                      End Sub
            card.Add(t)
            Body.Add(card)
            If sOn("pm2-s-pager") AndAlso Js.Int(d, "subscribers") > rows.Count Then Body.Add(Ui.Note("Showing the newest " & rows.Count & " of " & Js.Int(d, "subscribers") & " subscribers."))
        End If
    End Sub

    Private Async Function ExportSubsAsync(format As String) As Task
        Dim r = Await AppState.I.Api.DownloadAsync("/api/push2/subscribers/export?format=" & format)
        If r.Bytes Is Nothing Then Toast(If(r.Status = 0, "Export needs the internet.", "Couldn't export subscribers."), True) : Return
        Using d As New SaveFileDialog With {.FileName = "push-subscribers." & format, .Filter = If(format = "csv", "CSV|*.csv", "JSON|*.json")}
            If d.ShowDialog(FindForm()) <> DialogResult.OK Then Return
            File.WriteAllBytes(d.FileName, r.Bytes)
            Toast("Saved " & Path.GetFileName(d.FileName))
        End Using
    End Function

    ' ───────── Settings (VAPID keys) ─────────
    Private Sub Settings(d As JsonObject, configured As Boolean, subs As Integer)
        Dim show = Function(k As String) _display.IsOn("pm2-settings", k)
        Dim keys = TryCast(Js.Field(d, "keys"), JsonObject)
        If _public.Text = "" Then _public.Text = Js.Str(keys, "publicKey")
        If _subject.Text = "" Then _subject.Text = If(Js.Str(keys, "subject") = "", "mailto:", Js.Str(keys, "subject"))
        If Not Js.Bool(keys, "hasPrivateKey") Then _replacing = True
        Dim cols As New Columns(2, 320, 16) With {.Weights = {2, 1}, .Stretch = False}
        If show("pm2-st-form") Then
            Dim form As New CardBox("VAPID Keys", ChrW(&HE8D7)) With {.Accent = Theme.Blue, .Subtitle = If(configured, "Configured · " & subs & " subscribers", "Not configured")}
            If Not configured Then
                Dim tip As New CardBox(Nothing, "", 12)
                tip.Add(Ui.Note("✨  No keys yet. The quickest way: Generate new keys — one click, nothing to copy.", Color.FromArgb(&H1E, &H3A, &H8A)))
                tip.Add(Ui.Btn("Generate new keys", "", Theme.Blue, click:=Async Sub() Await GenerateAsync(subs)))
                form.Add(tip)
            End If
            Dim pubRow As New Columns(2, 60, 8) With {.Weights = {12, 1}}
            pubRow.Add(_public)
            pubRow.Add(Ui.IconBtn(ChrW(&HE8C8), "Copy public key", Sub()
                                                                        Clipboard.SetText(_public.Text)
                                                                        Toast("Public key copied.")
                                                                    End Sub))
            form.Add(New Field("Public Key *" & If(Js.Str(keys, "publicFingerprint") <> "", "   (ID " & Js.Str(keys, "publicFingerprint") & ")", ""), pubRow))
            If _replacing Then
                form.Add(New Field("Private Key *" & If(Js.Str(keys, "privateFingerprint") <> "", "   (ID " & Js.Str(keys, "privateFingerprint") & ")", ""), _private))
            Else
                Dim row As New HRow(8)
                row.Add(New Label With {.AutoSize = True, .Text = "🔒  Private key: saved on the server — never shown.", .Font = Theme.Body, .ForeColor = Theme.G600, .BackColor = Color.Transparent, .Padding = New Padding(0, 9, 0, 0)})
                row.Add(Ui.Btn("Replace", "", outline:=True, click:=Sub()
                                                                         _replacing = True
                                                                         Refresh_()
                                                                     End Sub))
                form.Add(row)
            End If
            form.Add(New Field("Contact (subject)", _subject))
            Dim btns As New HRow(8)
            btns.Add(Ui.Btn("Save Settings", Theme.IcSave, Theme.Blue, click:=Async Sub() Await SaveKeysAsync()))
            If configured Then btns.Add(Ui.Btn("Generate new keys", Theme.IcRefresh, outline:=True, click:=Async Sub() Await GenerateAsync(subs)))
            form.Add(btns)
            cols.Add(form)
        End If
        If show("pm2-st-status") OrElse show("pm2-st-help") Then
            Dim help As New CardBox("Where do keys come from?")
            For Each t In {"Easiest: press ""Generate new keys"" — they are made and saved on the server.",
                           "Moving from another site? Paste that site's public and private key here so existing subscribers keep working.",
                           "The contact is an email (mailto:) or your website address — push services use it if something goes wrong.",
                           "Changing keys means existing subscribers must subscribe again."}
                help.Add(New TextBlock("•  " & t, Theme.Body, Theme.G700))
            Next
            cols.Add(help)
        End If
        If cols.Controls.Count > 0 Then
            cols.Count = cols.Controls.Count
            If cols.Count = 1 Then cols.Weights = Nothing
            Body.Add(cols)
        End If
    End Sub

    Private Async Function SaveKeysAsync() As Task
        Dim r = Await AppState.I.Api.SendAsync("POST", "/api/push2/settings", Js.Obj("publicKey", _public.Text.Trim(), "privateKey", _private.Text.Trim(), "subject", _subject.Text.Trim()))
        If r.IsOk Then
            Toast("Push settings saved.")
            _private.Text = ""
            _replacing = False
            Await AppState.I.ReloadPageAsync("push")
        Else
            Toast(If(r.Outcome = ApiOutcome.Offline, "Saving the keys needs the internet.", If(Js.Str(r.Data, "error") <> "", Js.Str(r.Data, "error"), r.Message)), True)
        End If
    End Function

    Private Async Function GenerateAsync(subs As Integer) As Task
        If Not Ui.Confirm(Me, If(subs > 0, "Current subscribers (" & subs & ") were made with the old keys and will stop receiving notifications until they subscribe again. Download a backup first if you may need the old keys.", "A new key pair is created and saved at once."), "Generate new keys?") Then Return
        Dim r = Await AppState.I.Api.SendAsync("POST", "/api/push2/settings/generate", New JsonObject())
        If r.IsOk Then
            Toast("New keys generated (ID " & Js.Str(r.Data, "fingerprint") & ").")
            _public.Text = ""
            Await AppState.I.ReloadPageAsync("push")
        Else
            Toast(If(r.Outcome = ApiOutcome.Offline, "This needs the internet.", If(Js.Str(r.Data, "error") <> "", Js.Str(r.Data, "error"), r.Message)), True)
        End If
    End Function
End Class
