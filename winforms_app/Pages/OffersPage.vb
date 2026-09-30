Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Offers &amp; Coupons" as on the website: two big tabs — Campaign Offers (sales chart, 6 numbers,
''' campaigns &amp; history with pause / resume / end / duplicate, products on offer, the campaign editor) and
''' Coupons (4 numbers, coupon cards with copy / pause / duplicate / delete, recent activity, the coupon form).</summary>
Public Class OffersPage
    Inherits ScrollPage

    Private ReadOnly _campDisplay As DisplayOptions = DisplayOptions.For("ecom_campaign_offer2_display")
    Private ReadOnly _coupDisplay As DisplayOptions = DisplayOptions.For("ecom_coupons2_display")
    Private ReadOnly _tabCamp As New ChoiceCard("Campaign Offers", "Automatic price drops — no code needed", ChrW(&HE8C1))
    Private ReadOnly _tabCoup As New ChoiceCard("Coupons", "Codes customers enter at checkout", Theme.IcTicket)
    Private ReadOnly _export As New HeadButton("Export", "download")
    Private ReadOnly _newCamp As New HeadButton("New Campaign", "plus", Web.Blue)
    Private ReadOnly _newCoup As New HeadButton("New Coupon", "plus", Web.Blue)
    Private ReadOnly _campSearch As WInput = WInput.Make("Search campaigns…", Theme.IcSearch)
    Private ReadOnly _offerSearch As WInput = WInput.Make("Search products on offer…", Theme.IcSearch)
    Private ReadOnly _coupSearch As WInput = WInput.Make("Search coupons…", Theme.IcSearch)
    Private ReadOnly _campView As New Tabs("all|All", "running|Running", "ended|Ended")
    Private ReadOnly _coupTab As New Tabs("all|All", "active|Active", "scheduled|Scheduled", "expired|Expired", "paused|Paused")
    Private _mode As String
    Private _coupPage As Integer
    Private _campaigns As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Offers & Coupons"
    Public Overrides ReadOnly Property PageSubtitle As String
        Get
            Return If(Mode = "campaigns", "Campaign offers — timed price drops on products, categories or brands", "Coupon codes customers enter at checkout")
        End Get
    End Property
    Public Overrides ReadOnly Property Actions As Control()
        Get
            If Mode = "campaigns" Then Return {_campDisplay.Button, _export, _newCamp}
            Return {_coupDisplay.Button, _newCoup}
        End Get
    End Property

    Private ReadOnly Property CanCampaigns As Boolean
        Get
            Return AppState.I.Perm.Products()
        End Get
    End Property
    Private ReadOnly Property CanCoupons As Boolean
        Get
            Return AppState.I.Perm.Has("ecommerce", "manage_coupons")
        End Get
    End Property
    Private ReadOnly Property Mode As String
        Get
            If _mode Is Nothing Then Return If(CanCampaigns, "campaigns", "coupons")
            Return _mode
        End Get
    End Property

    Public Sub New()
        _campSearch.Width = 260 : _offerSearch.Width = 260 : _coupSearch.Width = 260
        AddHandler _tabCamp.Click, Sub() SetMode("campaigns")
        AddHandler _tabCoup.Click, Sub() SetMode("coupons")
        For Each s In {_campSearch, _offerSearch, _coupSearch}
            AddHandler s.TextChanged, Sub()
                                          _coupPage = 0
                                          Refresh_()
                                      End Sub
        Next
        AddHandler _campView.Changed, Sub() Refresh_()
        AddHandler _coupTab.Changed, Sub()
                                         _coupPage = 0
                                         Refresh_()
                                     End Sub
        AddHandler _campDisplay.Changed, Sub() Refresh_()
        AddHandler _coupDisplay.Changed, Sub() Refresh_()
        AddHandler _export.Click, Sub() ExportCampaigns()
        AddHandler _newCamp.Click, Sub() EditCampaign(Nothing, False)
        AddHandler _newCoup.Click, Sub() EditCoupon(Nothing)
    End Sub

    Private Sub SetMode(m As String)
        If m = Mode Then Return
        _mode = m
        Refresh_()
        HeaderChanged()
    End Sub

    Protected Overrides Sub Reload()
        Dim focused = {_campSearch, _offerSearch, _coupSearch}.FirstOrDefault(Function(x) x.Box.Focused)
        ClearBody(_tabCamp, _tabCoup, _campSearch, _offerSearch, _coupSearch, _campView, _coupTab)
        Dim tabs As New HRow(8)
        _tabCamp.Selected = Mode = "campaigns" : _tabCoup.Selected = Mode = "coupons"
        If CanCampaigns Then tabs.Add(_tabCamp)
        If CanCoupons Then tabs.Add(_tabCoup)
        _tabCamp.Invalidate() : _tabCoup.Invalidate()
        Body.Add(tabs)
        If Mode = "campaigns" Then Campaigns() Else Coupons()
        If focused IsNot Nothing Then
            focused.Box.Focus()
            focused.Box.SelectionStart = focused.Box.TextLength
        End If
    End Sub

    ' ═══════════════════ Campaign offers ═══════════════════
    Private Shared Function AtTime(o As JsonObject, k As String) As DateTime?
        Return Js.Time(o, k)
    End Function

    Private Shared Function CampaignState(c As JsonObject) As String
        Dim now = DateTime.Now
        Dim ends = AtTime(c, "endsAt"), starts = AtTime(c, "startsAt")
        If ends.HasValue AndAlso ends.Value < now Then Return "ended"
        If Js.Bool(c, "isPaused") Then Return "paused"
        If starts.HasValue AndAlso starts.Value > now Then Return "scheduled"
        Return "live"
    End Function

    Private Shared Function N(v As Double) As String
        Return v.ToString("0.##", Globalization.CultureInfo.InvariantCulture)
    End Function

    Private Shared Function OfferLabel(c As JsonObject) As String
        Select Case Js.Str(c, "discountType")
            Case "percent" : Return N(Js.Num(c, "discountValue")) & "% off"
            Case "amount" : Return Theme.Money(Js.Num(c, "discountValue")) & " off"
            Case Else : Return "Special prices"
        End Select
    End Function

    Private Shared Function Left(d As TimeSpan) As String
        If d.TotalDays >= 1 Then Return CInt(Math.Floor(d.TotalDays)) & "d " & d.Hours & "h"
        If d.TotalHours >= 1 Then Return CInt(Math.Floor(d.TotalHours)) & "h " & d.Minutes & "m"
        Return Math.Max(1, d.Minutes) & "m"
    End Function

    Private Function Applies(c As JsonObject) As (Short_ As String, Long_ As String)
        Dim targets = Js.Objs(Js.Arr(c, "targets"))
        Dim scope = Js.Str(c, "scope")
        If scope = "all" OrElse scope = "" Then Return ("All products", "Every active product")
        Dim setName = If(scope = "category", "categories", If(scope = "brand", "brands", "products"))
        Dim names = AppState.I.List(setName).GroupBy(Function(x) Js.Int(x, "id")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "name"))
        Dim kind = If(scope = "category", If(targets.Count = 1, "category", "categories"), scope & If(targets.Count = 1, "", "s"))
        Return (targets.Count & " " & kind, String.Join(", ", targets.Select(Function(x)
                                                                               Dim n As String = Nothing
                                                                               Return If(names.TryGetValue(Js.Int(x, "id"), n), n, "#" & Js.Str(x, "id"))
                                                                           End Function)))
    End Function

    Private Sub Campaigns()
        Dim s = AppState.I
        Dim d = s.PageObj("campaigns")
        _campaigns = Js.Objs(Js.Arr(d, "campaigns"))
        Dim offers = Js.Objs(Js.Arr(d, "offers"))
        Dim range = TryCast(Js.Field(d, "range"), JsonObject)
        Dim points = Js.Objs(Js.Arr(Js.Field(d, "chart"), "points"))
        Dim products = s.List("products").GroupBy(Function(p) Js.Int(p, "id")).ToDictionary(Function(g) g.Key, Function(g) g.First())
        Dim on_ = Function(g As String, k As String) _campDisplay.IsOn(g, k)
        Dim live = _campaigns.Where(Function(c) CampaignState(c) = "live").Count()
        Dim scheduled = _campaigns.Where(Function(c) CampaignState(c) = "scheduled").Count()

        ' chart + numbers
        Dim top As New Columns(2, 520, 12) With {.Stretch = True}
        If _campDisplay.Item("co2-chart") Then
            Dim card As New CardBox("Campaign Sales") With {.Subtitle = "This month, day by day"}
            Dim bc As New BarChart() With {.EmptyText = "No campaign sales yet."}
            For Each p In points
                bc.Values.Add(Js.Num(p, "revenue"))
                bc.Labels.Add(Js.Str(p, "label"))
                bc.Tips.Add(Js.Str(p, "label") & " · " & Theme.Money(Js.Num(p, "revenue")) & " · " & Js.Int(p, "units") & " units")
            Next
            card.Add(bc)
            top.Add(card)
        End If
        Dim metrics As New Columns(3, 180, 12)
        Dim metric = Sub(key As String, caption As String, glyph As String, colour As Color, value As String, note As String)
                         If Not on_("co2-metrics", key) Then Return
                         Dim m As New MiniStat(caption, glyph, colour) With {.Height = 92}
                         m.SetValue(value, note)
                         metrics.Add(m)
                     End Sub
        metric("co2-m-live", "Active Campaigns", Theme.IcDone, Color.FromArgb(5, &H96, &H69), live.ToString(), If(scheduled > 0, scheduled & " scheduled", "None scheduled"))
        metric("co2-m-products", "Products on Offer", Theme.IcPackage, Theme.Blue, offers.Count.ToString(), "of " & products.Values.Where(Function(p) Js.Str(p, "status") = "active").Count() & " active products")
        metric("co2-m-sales", "Campaign Sales", Theme.IcMoney, Color.FromArgb(5, &H96, &H69), Theme.Money(Js.Num(range, "revenue")), "This month")
        metric("co2-m-units", "Units Sold", ChrW(&HE81E), Color.FromArgb(&H1E, &H3A, &H8A), Js.Int(range, "units").ToString(), "at a campaign price")
        metric("co2-m-discount", "Discount Given", ChrW(&HE8C1), Color.FromArgb(&HD9, &H77, 6), Theme.Money(Js.Num(range, "discount")), "off the usual price")
        metric("co2-m-orders", "Orders with Offer", Theme.IcCart, Theme.Blue, Js.Int(range, "orders").ToString(), "completed sales")
        If metrics.Controls.Count > 0 AndAlso _campDisplay.IsOn("co2-metrics") Then top.Add(metrics)
        If top.Controls.Count > 0 Then Body.Add(top)

        ' campaigns & history
        If _campDisplay.IsOn("co2-campaigns") Then
            Dim cc = Function(k As String) on_("co2-campaigns", k)
            Dim card As New CardBox("Campaigns & History")
            _campView.Counts("all") = _campaigns.Count
            _campView.Height = 42
            Dim tools As New Columns(2, 200, 12) With {.Weights = {3, 2}}
            tools.Add(_campView)
            If cc("co2-c-search") Then tools.Add(New FlowBox(_campSearch, Function(w) 38))
            card.Add(tools)
            Dim q = _campSearch.Text.Trim().ToLowerInvariant()
            Dim view = _campView.Current
            Dim rows = _campaigns.Where(Function(c)
                                            Dim st = CampaignState(c)
                                            If view = "running" AndAlso st = "ended" Then Return False
                                            If view = "ended" AndAlso st <> "ended" Then Return False
                                            Return q = "" OrElse (Js.Str(c, "name") & " " & Applies(c).Long_).ToLowerInvariant().Contains(q)
                                        End Function).ToList()
            Dim t As New WebTable() With {.RowHeight = 66, .RowClickable = True, .EmptyText = "No campaigns yet. Create one to offer a discount for a period of time."}
            t.Cols.Add(New TCol("Campaign", Function(c) Js.Str(c, "name"), 0, CellKind.Bold) With {.Flex = 16, .Sub = Function(c) "Created " & Fmt.Stamp(AtTime(c, "createdAt"))})
            If cc("co2-c-applies") Then t.Cols.Add(New TCol("Applies To", Function(c) Applies(c).Short_, 0) With {.Flex = 14, .Colour = Function(c) Theme.G800, .Sub = Function(c) Applies(c).Long_})
            If cc("co2-c-offer") Then t.Cols.Add(New TCol("Offer", Function(c) OfferLabel(c), 0, CellKind.Bold) With {.Flex = 9})
            If cc("co2-c-schedule") Then
                t.Cols.Add(New TCol("Schedule", Function(c) "From " & Fmt.Stamp(If(AtTime(c, "startsAt"), AtTime(c, "createdAt"))), 0) With {.Flex = 17, .Colour = Function(c) Theme.G800,
                    .Sub = Function(c)
                               Dim st = CampaignState(c)
                               Dim ends = AtTime(c, "endsAt"), starts = AtTime(c, "startsAt")
                               Dim line = If(ends.HasValue, "Until " & Fmt.Stamp(ends), "No end date")
                               If st = "scheduled" AndAlso starts.HasValue Then line &= " · starts in " & Left(starts.Value - DateTime.Now)
                               If st = "live" AndAlso ends.HasValue Then line &= " · ends in " & Left(ends.Value - DateTime.Now)
                               Return line
                           End Function})
            End If
            If cc("co2-c-status") Then
                t.Cols.Add(New TCol("Status", Function(c)
                                                  Dim st = CampaignState(c)
                                                  If st = "ended" Then Return "Ended"
                                                  If Js.Bool(c, "isPaused") Then Return "Paused"
                                                  Return If(st = "scheduled", "Scheduled", "Live")
                                              End Function, 0, CellKind.PillMenu) With {.Flex = 10, .Key = "status",
                    .Colour = Function(c) If(CampaignState(c) = "ended", Theme.Grey, If(Js.Bool(c, "isPaused"), Fmt.Yellow, If(CampaignState(c) = "scheduled", Color.FromArgb(&HE, &HA5, &HE9), Theme.Green)))})
            End If
            If cc("co2-c-sales") Then
                t.Cols.Add(New TCol("Sales", Function(c) Theme.Money(Js.Num(Js.Field(c, "stats"), "revenue")), 0, CellKind.Bold) With {.Flex = 10,
                    .Sub = Function(c) Js.Int(Js.Field(c, "stats"), "units") & " units · " & Js.Int(Js.Field(c, "stats"), "orders") & " orders"})
            End If
            If cc("co2-c-actions") Then
                t.Cols.Add(New TCol("Actions", Nothing, 160, CellKind.Actions) With {
                    .ButtonsFor = Function(c)
                                      Dim st = CampaignState(c)
                                      Dim l As New List(Of String) From {"edit"}
                                      If st <> "ended" Then l.Add(If(Js.Bool(c, "isPaused"), "resume", "pause"))
                                      l.Add("copy")
                                      If st <> "ended" Then l.Add("end") Else If Js.Int(Js.Field(c, "stats"), "orders") = 0 Then l.Add("delete")
                                      Return l
                                  End Function}.Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("resume", ChrW(&HE768), "Resume", Theme.Green).Btn("pause", ChrW(&HE769), "Pause", Color.FromArgb(&HD9, &H77, 6)).Btn("copy", ChrW(&HE8C8), "Duplicate", Color.FromArgb(&HE, &HA5, &HE9)).Btn("end", Theme.IcCancel, "End now", Color.FromArgb(&HDC, &H26, &H26)).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
            End If
            t.Rows = rows
            AddHandler t.RowClick, Sub(c) EditCampaign(c, False)
            AddHandler t.CellClick, Sub(c, col, cell)
                                        If col.Key <> "status" OrElse CampaignState(c) = "ended" OrElse Js.Int(c, "id") < 0 Then Return
                                        Dim run = If(CampaignState(c) = "scheduled", "Scheduled", "Live")
                                        Ui.PopMenu(Me, {If(Not Js.Bool(c, "isPaused"), "*", "") & "run|" & run, If(Js.Bool(c, "isPaused"), "*", "") & "pause|Paused", "-", "!end|End now"},
                                                   Async Sub(k)
                                                       If k = "end" Then
                                                           Await EndNowAsync(c)
                                                       ElseIf (k = "pause") <> Js.Bool(c, "isPaused") Then
                                                           Await QuickAsync(c, If(k = "pause", "pause", "resume"))
                                                       End If
                                                   End Sub, New Point(cell.X + 10, cell.Bottom - 8))
                                    End Sub
            AddHandler t.ActionClick, Async Sub(c, k)
                                          Select Case k
                                              Case "edit" : EditCampaign(c, False)
                                              Case "copy" : EditCampaign(c, True)
                                              Case "pause", "resume" : Await QuickAsync(c, k)
                                              Case "end" : Await EndNowAsync(c)
                                              Case "delete"
                                                  If Not Ui.Confirm(Me, "It has no sales, so it can be removed completely.", "Delete """ & Js.Str(c, "name") & """?") Then Return
                                                  Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/campaigns2/" & Js.Int(c, "id"), .Label = "Delete campaign " & Js.Str(c, "name"),
                                                      .Effect = PageActions.PageRowDelete("campaigns", Js.Field(c, "id"), "campaigns")}, "campaigns", "Deleted.")
                                          End Select
                                      End Sub
            card.Add(t)
            Body.Add(card)
        End If

        ' products on offer
        If _campDisplay.IsOn("co2-offers") Then
            Dim pc = Function(k As String) on_("co2-offers", k)
            Dim byId = _campaigns.GroupBy(Function(c) Js.Int(c, "id")).ToDictionary(Function(g) g.Key, Function(g) g.First())
            Dim card As New CardBox("Products on Offer")
            If pc("co2-p-search") Then card.Tools.Add(_offerSearch)
            Dim pq = _offerSearch.Text.Trim().ToLowerInvariant()
            Dim rows = offers.Where(Function(o) products.ContainsKey(Js.Int(o, "productId")) AndAlso (pq = "" OrElse (Js.Str(products(Js.Int(o, "productId")), "name") & " " & Js.Str(o, "campaignName")).ToLowerInvariant().Contains(pq))).ToList()
            Dim t As New WebTable() With {.RowHeight = 64, .EmptyText = "No product is on offer right now."}
            Dim prod = Function(o As JsonObject) products(Js.Int(o, "productId"))
            If pc("co2-p-image") Then
                t.Cols.Add(New TCol("Name", Function(o) Js.Str(prod(o), "name"), 0, CellKind.Thumb) With {.Flex = 20, .Picture = Function(o) Js.Str(prod(o), "image")})
            Else
                t.Cols.Add(New TCol("Name", Function(o) Js.Str(prod(o), "name"), 0, CellKind.Bold) With {.Flex = 20})
            End If
            If pc("co2-p-price") Then
                t.Cols.Add(New TCol("Price", Function(o) Theme.Money(Js.Num(o, "unitPrice")), 0, CellKind.Bold) With {.Flex = 14, .Colour = Function(o) Color.FromArgb(&HDC, &H35, &H45),
                    .Sub = Function(o)
                               Dim before = Js.Num(o, "beforePrice"), now = Js.Num(o, "unitPrice")
                               Dim pct = If(before > 0, CInt(Math.Round((before - now) * 100 / before)), 0)
                               Return "was " & Theme.Money(before) & If(pct > 0, " · " & pct & "% off", "")
                           End Function})
            End If
            If pc("co2-p-campaign") Then
                t.Cols.Add(New TCol("Campaign", Function(o) Js.Str(o, "campaignName"), 0) With {.Flex = 14, .Colour = Function(o) Theme.G800,
                    .Sub = Function(o)
                               Dim c As JsonObject = Nothing
                               Return If(byId.TryGetValue(Js.Int(o, "campaignId"), c), OfferLabel(c), "")
                           End Function})
            End If
            If pc("co2-p-ends") Then
                t.Cols.Add(New TCol("Ends", Function(o)
                                                Dim c As JsonObject = Nothing
                                                If Not byId.TryGetValue(Js.Int(o, "campaignId"), c) OrElse Not AtTime(c, "endsAt").HasValue Then Return "No end date"
                                                Return Fmt.Stamp(AtTime(c, "endsAt"))
                                            End Function, 0) With {.Flex = 11,
                    .Sub = Function(o)
                               Dim c As JsonObject = Nothing
                               If Not byId.TryGetValue(Js.Int(o, "campaignId"), c) OrElse Not AtTime(c, "endsAt").HasValue Then Return ""
                               Return "in " & Left(AtTime(c, "endsAt").Value - DateTime.Now)
                           End Function})
            End If
            If pc("co2-p-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 96, CellKind.Actions).Btn("product", ChrW(&HE70F), "Edit product", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("campaign", Theme.IcTag, "Open campaign", Theme.Primary))
            t.Rows = rows
            AddHandler t.ActionClick, Sub(o, k)
                                          If k = "product" Then
                                              Main?.Push(New AddProductPage(Js.Int(o, "productId")))
                                          Else
                                              Dim c As JsonObject = Nothing
                                              If byId.TryGetValue(Js.Int(o, "campaignId"), c) Then EditCampaign(c, False)
                                          End If
                                      End Sub
            card.Add(t)
            Body.Add(card)
        End If
    End Sub

    Private Function QuickAsync(c As JsonObject, action As String) As Task
        Dim word = If(action = "pause", "paused", If(action = "resume", "resumed", "ended"))
        Dim fields = If(action = "end", Js.Obj("endsAt", DateTime.UtcNow), Js.Obj("isPaused", action = "pause"))
        Return PageActions.SendAsync(Me, New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/campaigns2/" & Js.Int(c, "id"), .Body = Js.Obj("action", action),
            .Label = "Campaign " & Js.Str(c, "name") & ": " & word, .Refresh = New List(Of String) From {"products"}, .Effect = PageActions.PageRow("campaigns", Js.Field(c, "id"), fields, "campaigns")},
            "campaigns", """" & Js.Str(c, "name") & """ " & word & ".")
    End Function

    Private Async Function EndNowAsync(c As JsonObject) As Task
        If Ui.Confirm(Me, "Prices go back to normal straight away.", "End """ & Js.Str(c, "name") & """ now?") Then Await QuickAsync(c, "end")
    End Function

    ''' <summary>New / edit / duplicate a campaign — the website's editor: name, applies to (all / categories /
    ''' brands / products, with a fixed price per product), offer, start, end, paused, homepage banner.</summary>
    Private Sub EditCampaign(c As JsonObject, copy As Boolean)
        Dim editing = If(copy, Nothing, c)
        Dim s = AppState.I
        Dim f As New FormDialog(If(editing Is Nothing, "New Campaign", "Edit Campaign"), 720, If(editing Is Nothing, "Create Campaign", "Save Changes"))
        f.AddText("name", "Campaign name", If(c Is Nothing, "", If(copy, Js.Str(c, "name") & " (copy)", Js.Str(c, "name"))), required:=True, placeholder:="e.g. Diwali Sale")
        Dim scope = f.AddPick("scope", "Applies to", {"all|All products", "category|Categories", "brand|Brands", "product|Products"}, Js.Str(c, "scope", "all"))
        Dim search = WInput.Make("Search…", Theme.IcSearch)
        Dim grid As New DataGridView() With {.Height = 220}
        Ui.StyleGrid(grid)
        grid.RowTemplate.Height = 34
        grid.EditMode = DataGridViewEditMode.EditOnEnter
        grid.SelectionMode = DataGridViewSelectionMode.CellSelect
        grid.Columns.Add(New DataGridViewCheckBoxColumn With {.Name = "use", .HeaderText = "", .FillWeight = 12})
        grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "name", .HeaderText = "Name", .ReadOnly = True, .FillWeight = 100})
        grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "price", .HeaderText = "Price", .ReadOnly = True, .FillWeight = 30})
        grid.Columns.Add(New DataGridViewTextBoxColumn With {.Name = "fixed", .HeaderText = "Offer price (₹)", .FillWeight = 36})
        Dim chosenNote As New TextBlock("", Theme.Small, Theme.G500)
        f.AddControl(search, "Choose")
        f.AddControl(grid)
        f.AddControl(chosenNote)
        Dim targets As New Dictionary(Of Integer, String) ' id → fixed price text
        For Each x In Js.Objs(Js.Arr(c, "targets"))
            targets(Js.Int(x, "id")) = If(Js.IsNull(x, "fixedPrice"), "", N(Js.Num(x, "fixedPrice")))
        Next
        Dim type = f.AddPick("type", "Offer", {"percent|Percentage off (%)", "amount|Amount off (₹)", "fixed|Fixed price per product"}, Js.Str(c, "discountType", "percent"), half:=True)
        f.AddNumber("value", "Percent / Amount", If(Js.IsNull(c, "discountValue"), CType(Nothing, Double?), Js.Num(c, "discountValue")), half:=True)
        f.AddDate("starts", "Starts (untick = now)", If(copy, Nothing, AtTime(c, "startsAt")), withTime:=True, optional_:=True, half:=True)
        f.AddDate("ends", "Ends (untick = no end)", If(copy, Nothing, AtTime(c, "endsAt")), withTime:=True, optional_:=True, half:=True)
        Dim quick As New HRow(6)
        For Each q In {("24 h", 1), ("7 days", 7), ("30 days", 30)}
            Dim days = q.Item2
            Dim b = WButton.Make("Ends in " & q.Item1, "", Theme.Primary, outline:=True)
            b.Height = 30
            AddHandler b.Click, Sub()
                                    Dim st = DirectCast(f.Input("starts"), DateTimePicker)
                                    Dim en = DirectCast(f.Input("ends"), DateTimePicker)
                                    Dim base = If(st.Checked, st.Value, DateTime.Now)
                                    en.Value = base.AddDays(days)
                                    en.Checked = True
                                End Sub
            quick.Add(b)
        Next
        f.AddControl(quick)
        f.AddCheck("paused", "Paused — save it now, start it later", Not copy AndAlso Js.Bool(c, "isPaused"))
        Dim home = If(TryCast(Js.Copy(Js.Field(c, "home")), JsonObject), Js.Obj("show", False, "template", "bold", "title", "", "subtitle", "", "color", "#9f2089", "cta", "Shop Now"))
        Dim showHome = f.AddCheck("home", "Show a banner on the homepage", Js.Bool(home, "show"))
        f.AddPick("template", "Design", {"bold|Bold — colour gradient", "soft|Soft — light tint", "ticket|Coupon ticket"}, Js.Str(home, "template", "bold"), half:=True)
        f.AddColor("color", "Colour", Js.Str(home, "color", "#9f2089"), half:=True)
        f.AddText("cta", "Button", Js.Str(home, "cta", "Shop Now"), half:=True)
        f.AddText("htitle", "Headline (blank = campaign name)", Js.Str(home, "title"), half:=True)
        f.AddText("hsub", "Second line (blank = automatic)", Js.Str(home, "subtitle"))

        Dim fill = Sub()
                       grid.Rows.Clear()
                       Dim sc = Ui.Val(scope)
                       Dim pool As IEnumerable(Of (Id As Integer, Name As String, Price As String))
                       Select Case sc
                           Case "category" : pool = s.List("categories").Select(Function(x) (Js.Int(x, "id"), Js.Str(x, "name"), ""))
                           Case "brand" : pool = s.List("brands").Select(Function(x) (Js.Int(x, "id"), Js.Str(x, "name"), ""))
                           Case "product" : pool = s.List("products").Where(Function(p) Js.Str(p, "status") = "active").Select(Function(x) (Js.Int(x, "id"), Js.Str(x, "name"), Theme.Money(Js.Num(x, "price"))))
                           Case Else : pool = Enumerable.Empty(Of (Integer, String, String))()
                       End Select
                       Dim q = search.Text.Trim().ToLowerInvariant()
                       For Each x In pool.Where(Function(p) targets.ContainsKey(p.Id) OrElse q = "" OrElse p.Name.ToLowerInvariant().Contains(q)).Take(200)
                           Dim fp As String = Nothing
                           targets.TryGetValue(x.Id, fp)
                           Dim i = grid.Rows.Add(targets.ContainsKey(x.Id), x.Name, x.Price, If(fp, ""))
                           grid.Rows(i).Tag = x.Id
                       Next
                       chosenNote.Text = targets.Count & " chosen"
                   End Sub
        Dim sync = Sub()
                       Dim sc = Ui.Val(scope)
                       Dim tp = Ui.Val(type)
                       If sc <> "product" AndAlso tp = "fixed" Then Ui.SetVal(type, "percent") : tp = "percent"
                       For Each k In {"choose"} : Next
                       Kit.Show(search.Parent, sc <> "all")
                       Kit.Show(grid, sc <> "all")
                       Kit.Show(chosenNote, sc <> "all")
                       grid.Columns("price").Visible = sc = "product"
                       grid.Columns("fixed").Visible = sc = "product" AndAlso tp = "fixed"
                       f.ShowField("value", tp <> "fixed")
                       For Each k In {"template", "color", "cta", "htitle", "hsub"} : f.ShowField(k, showHome.Checked) : Next
                       If f.IsHandleCreated Then f.Relayout()
                   End Sub
        AddHandler grid.CurrentCellDirtyStateChanged, Sub()
                                                          If grid.IsCurrentCellDirty Then grid.CommitEdit(DataGridViewDataErrorContexts.Commit)
                                                      End Sub
        AddHandler grid.CellValueChanged, Sub(sender, e)
                                              If e.RowIndex < 0 Then Return
                                              Dim id = CInt(grid.Rows(e.RowIndex).Tag)
                                              Dim use = CBool(If(grid.Rows(e.RowIndex).Cells("use").Value, False))
                                              If use Then targets(id) = CStr(If(grid.Rows(e.RowIndex).Cells("fixed").Value, "")) Else targets.Remove(id)
                                              chosenNote.Text = targets.Count & " chosen"
                                          End Sub
        AddHandler scope.SelectedIndexChanged, Sub()
                                                   targets.Clear()
                                                   fill()
                                                   sync()
                                               End Sub
        AddHandler type.SelectedIndexChanged, Sub() sync()
        AddHandler showHome.Toggled, Sub() sync()
        AddHandler search.TextChanged, Sub() fill()
        fill()
        sync()
        f.Validator = Function(d)
                          Dim sc = d.Val("scope"), tp = d.Val("type")
                          If sc <> "all" AndAlso targets.Count = 0 Then Return "Choose at least one " & If(sc = "category", "category", sc) & "."
                          If tp <> "fixed" AndAlso d.Num("value") <= 0 Then Return "Type the discount."
                          If tp = "percent" AndAlso d.Num("value") >= 100 Then Return "The percentage must be below 100."
                          Dim st = d.DateOf("starts"), en = d.DateOf("ends")
                          If en.HasValue AndAlso en.Value < If(st, DateTime.Now) Then Return "The end must be after the start."
                          Return Nothing
                      End Function
        f.OnSave = Async Function(d)
                       Dim sc = d.Val("scope"), tp = d.Val("type")
                       Dim tg As New JsonArray()
                       For Each kv In targets
                           Dim o = Js.Obj("type", sc, "id", kv.Key)
                           If sc = "product" AndAlso tp = "fixed" Then o("fixedPrice") = If(kv.Value.Trim() = "", Nothing, JsonValue.Create(Fmt.ParseNum(kv.Value)))
                           tg.Add(o)
                       Next
                       Dim homeObj = Js.Obj("show", d.Bool("home"), "template", d.Val("template"), "title", d.Val("htitle").Trim(), "subtitle", d.Val("hsub").Trim(), "color", d.Val("color"), "cta", d.Val("cta").Trim())
                       Dim body As New JsonObject From {{"name", d.Val("name").Trim()}, {"scope", sc}, {"discountType", tp}, {"discountValue", If(tp = "fixed", Nothing, JsonValue.Create(d.Num("value")))},
                           {"startsAt", If(d.DateOf("starts").HasValue, JsonValue.Create(d.DateOf("starts").Value.ToUniversalTime().ToString("o")), Nothing)},
                           {"endsAt", If(d.DateOf("ends").HasValue, JsonValue.Create(d.DateOf("ends").Value.ToUniversalTime().ToString("o")), Nothing)},
                           {"isPaused", d.Bool("paused")}, {"home", homeObj}, {"targets", tg}}
                       Dim item As New OutboxItem With {.Method = If(editing Is Nothing, "POST", "PUT"), .Path = If(editing Is Nothing, "/api/ecommerce/campaigns2", "/api/ecommerce/campaigns2/" & Js.Int(editing, "id")),
                           .Label = "Campaign " & d.Val("name").Trim(), .Body = body, .Refresh = New List(Of String) From {"products"}}
                       If editing Is Nothing Then
                           Dim row = TryCast(Js.Copy(body), JsonObject)
                           Js.Merge(row, Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "createdAt", DateTime.UtcNow, "stats", New JsonObject()))
                           item.Effect = PageActions.PageRowNew("campaigns", row, "campaigns")
                       Else
                           item.Effect = PageActions.PageRow("campaigns", Js.Field(editing, "id"), TryCast(Js.Copy(body), JsonObject), "campaigns")
                       End If
                       Return Await PageActions.SendAsync(Me, item, "campaigns", If(editing Is Nothing, "Campaign created — prices change on time.", "Campaign saved."))
                   End Function
        f.ShowDialog(FindForm())
    End Sub

    Private Sub ExportCampaigns()
        Export.Csv(Me, "Campaigns", {"ID", "Name", "Applies to", "Offer", "Starts", "Ends", "Status", "Orders", "Units sold", "Sales", "Discount given"},
                   _campaigns.Select(Function(c) CType({CObj(Js.Int(c, "id")), Js.Str(c, "name"), Applies(c).Long_, OfferLabel(c), Fmt.Stamp(If(AtTime(c, "startsAt"), AtTime(c, "createdAt"))),
                        If(AtTime(c, "endsAt").HasValue, Fmt.Stamp(AtTime(c, "endsAt")), "No end date"), CampaignState(c), CObj(Js.Int(Js.Field(c, "stats"), "orders")), CObj(Js.Int(Js.Field(c, "stats"), "units")),
                        CObj(Js.Num(Js.Field(c, "stats"), "revenue")), CObj(Js.Num(Js.Field(c, "stats"), "discount"))}, IEnumerable(Of Object))))
    End Sub

    ' ═══════════════════ Coupons ═══════════════════
    Private Shared Function CouponStatus(c As JsonObject) As String
        If Js.Bool(c, "paused") Then Return "paused"
        If Js.Str(c, "status") = "inactive" Then Return "inactive"
        Dim ends = AtTime(c, "endsAt"), starts = AtTime(c, "startsAt")
        If ends.HasValue AndAlso ends.Value < DateTime.Now Then Return "expired"
        If starts.HasValue AndAlso starts.Value > DateTime.Now Then Return "scheduled"
        Return "active"
    End Function

    Private Shared Function CouponMeta(st As String) As (Label As String, Colour As Color)
        Select Case st
            Case "scheduled" : Return ("Scheduled", Color.FromArgb(&HF5, &H9E, &HB))
            Case "expired" : Return ("Expired", Theme.G500)
            Case "paused" : Return ("Paused", Color.FromArgb(&HE, &HA5, &HE9))
            Case "inactive" : Return ("Disabled", Color.FromArgb(&HDC, &H26, &H26))
            Case Else : Return ("Active", Color.FromArgb(&H10, &HB9, &H81))
        End Select
    End Function

    Private Sub Coupons()
        Dim all = AppState.I.PageList("coupons")
        Dim on_ = Function(g As String, k As String) _coupDisplay.IsOn(g, k)
        Dim cards As New Columns(4, 200, 14)
        Dim card = Sub(key As String, caption As String, glyph As String, colour As Color, value As String, tab As String)
                       If Not on_("cp2-cards", key) Then Return
                       Dim m As New MiniStat(caption, glyph, colour) With {.Height = 84}
                       m.SetValue(value)
                       If tab IsNot Nothing Then
                           m.Cursor = Cursors.Hand
                           m.Selected = _coupTab.Current = tab
                           AddHandler m.Click, Sub()
                                                   _coupTab.Current = tab
                                                   _coupPage = 0
                                                   Refresh_()
                                               End Sub
                       End If
                       cards.Add(m)
                   End Sub
        card("cp2-k-active", "Active Coupons", Theme.IcTag, Color.FromArgb(5, &H96, &H69), all.Where(Function(c) CouponStatus(c) = "active").Count().ToString(), "active")
        card("cp2-k-scheduled", "Scheduled Coupons", Theme.IcCalendar, Color.FromArgb(&HD9, &H77, 6), all.Where(Function(c) CouponStatus(c) = "scheduled").Count().ToString(), "scheduled")
        card("cp2-k-expired", "Expired Coupons", Theme.IcClock, Color.FromArgb(&HEF, &H44, &H44), all.Where(Function(c) CouponStatus(c) = "expired").Count().ToString(), "expired")
        card("cp2-k-redemptions", "Total Redemptions", ChrW(&HE9D2), Theme.Primary, all.Sum(Function(c) Js.Int(c, "used")).ToString(), Nothing)
        If cards.Controls.Count > 0 AndAlso _coupDisplay.IsOn("cp2-cards") Then Body.Add(cards)

        Dim q = _coupSearch.Text.Trim().ToLowerInvariant()
        Dim list = all.Where(Function(c) (_coupTab.Current = "all" OrElse CouponStatus(c) = _coupTab.Current) AndAlso (q = "" OrElse (Js.Str(c, "title") & " " & Js.Str(c, "code")).ToLowerInvariant().Contains(q))).ToList()
        Const per As Integer = 8
        Dim pages = Math.Max(1, CInt(Math.Ceiling(list.Count / per)))
        If _coupPage >= pages Then _coupPage = pages - 1
        Dim shown = list.Skip(_coupPage * per).Take(per).ToList()

        Dim grid As New VStack(12)
        If on_("cp2-grid", "cp2-search") Then
            Dim bar As New CardBox(Nothing, "", 12)
            Dim tools As New Columns(2, 200, 12) With {.Weights = {3, 2}}
            _coupTab.Height = 42
            tools.Add(_coupTab)
            tools.Add(New FlowBox(_coupSearch, Function(w) 38))
            bar.Add(tools)
            grid.Add(bar)
        End If
        If shown.Count = 0 Then
            Dim empty As New CardBox(Nothing, "", 36)
            empty.Add(New TextBlock(If(all.Count = 0, "No coupons yet. Create your first coupon with New Coupon.", "No coupons match this filter."), Theme.Body, Theme.G400) With {.Center = True})
            grid.Add(empty)
        Else
            Dim cg As New Columns(2, 360, 12) With {.Stretch = True}
            For Each c In shown : cg.Add(CouponCard(c)) : Next
            grid.Add(cg)
        End If
        Dim pager As New HRow(8)
        pager.Add(New Label With {.AutoSize = True, .Font = Theme.Body, .ForeColor = Theme.G700, .BackColor = Color.Transparent, .Text = If(list.Count = 0, "Showing 0 results", "Showing " & (_coupPage * per + 1) & " to " & (_coupPage * per + shown.Count) & " of " & list.Count & " results")})
        If pages > 1 Then
            Dim prev = Ui.Btn("Previous", "", outline:=True, click:=Sub()
                                                                         _coupPage -= 1
                                                                         Refresh_()
                                                                     End Sub)
            prev.Enabled = _coupPage > 0
            Dim nxt = Ui.Btn("Next", "", outline:=True, click:=Sub()
                                                                    _coupPage += 1
                                                                    Refresh_()
                                                                End Sub)
            nxt.Enabled = _coupPage + 1 < pages
            pager.Add(prev)
            pager.Add(New Label With {.AutoSize = True, .Font = Theme.Body, .BackColor = Color.Transparent, .Text = (_coupPage + 1) & " / " & pages, .Padding = New Padding(0, 10, 0, 0)})
            pager.Add(nxt)
        End If
        grid.Add(pager)

        Dim showGrid = _coupDisplay.IsOn("cp2-grid"), showPanel = on_("cp2-activity", "cp2-activity-panel")
        Dim row As New Columns(2, 320, 16) With {.Weights = {3, 1}, .Stretch = False}
        If showGrid Then row.Add(grid)
        If showPanel Then row.Add(ActivityPanel())
        If row.Controls.Count > 0 Then
            row.Count = row.Controls.Count
            If row.Count = 1 Then row.Weights = Nothing
            Body.Add(row)
        End If
    End Sub

    Private Function CouponCard(c As JsonObject) As Control
        Dim st = CouponStatus(c)
        Dim running = If(st = "paused", CouponStatus(New JsonObject From {{"status", Js.Str(c, "status")}, {"startsAt", Js.Copy(Js.Field(c, "startsAt"))}, {"endsAt", Js.Copy(Js.Field(c, "endsAt"))}}), st)
        Dim meta = CouponMeta(running)
        Dim pct = Js.Str(c, "discountType") = "percentage"
        Dim card As New CardBox(Nothing, "", 16)
        Dim pillRect As Rectangle, codeRect As Rectangle
        Dim head As New Drawn(96, Sub(g, r)
                                      Using p = Theme.RoundRect(New RectangleF(0, 0, 42, 42), 8)
                                          Using b As New SolidBrush(Color.FromArgb(&HF5, &HF3, &HFF)) : g.FillPath(b, p) : End Using
                                      End Using
                                      Using f = Theme.IconFont(13) : Theme.DrawCentered(g, Theme.IcTicket, f, Theme.Primary, New Rectangle(0, 0, 42, 42)) : End Using
                                      Dim title = Js.Str(c, "title")
                                      Dim tf = Theme.UiFont(10.5F, FontStyle.Bold)
                                      Dim offer = If(pct, N(Js.Num(c, "discountValue")) & "%", Theme.Money(Js.Num(c, "discountValue"))) & " OFF"
                                      Dim ofw = Tr.MeasureText(offer, Theme.UiFont(13.0F, FontStyle.Bold)).Width
                                      Tr.DrawText(g, offer, Theme.UiFont(13.0F, FontStyle.Bold), New Point(r.Right - ofw, 0), Theme.G900, TextFormatFlags.NoPadding)
                                      Tr.DrawText(g, If(pct, "Percentage", "Fixed Amount"), Theme.Small, New Rectangle(r.Right - 120, 24, 120, 16), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                      Dim tw = Math.Min(Tr.MeasureText(title, tf).Width, r.Width - 56 - ofw - 120)
                                      Tr.DrawText(g, title, tf, New Rectangle(54, 0, tw + 2, 22), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                      pillRect = Gfx.Pill(g, If(Js.Bool(c, "paused"), "Paused", meta.Label), 54 + tw + 8, 11, If(Js.Bool(c, "paused"), Color.FromArgb(&HE, &HA5, &HE9), meta.Colour), True)
                                      Dim code = Js.Str(c, "code")
                                      Dim cw = Tr.MeasureText(code, New Font("Consolas", 10, FontStyle.Bold)).Width + 34
                                      codeRect = New Rectangle(54, 28, cw, 26)
                                      Using p = Theme.RoundRect(New RectangleF(codeRect.X, codeRect.Y, codeRect.Width, codeRect.Height), 6)
                                          Using b As New SolidBrush(Fmt.BlueSoft) : g.FillPath(b, p) : End Using
                                          Using pen As New Pen(Color.FromArgb(&H93, &HC5, &HFD)) : g.DrawPath(pen, p) : End Using
                                      End Using
                                      Using f As New Font("Consolas", 10, FontStyle.Bold)
                                          Tr.DrawText(g, code, f, New Rectangle(codeRect.X + 8, codeRect.Y, cw, codeRect.Height), Theme.Blue, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
                                      End Using
                                      Using f = Theme.IconFont(8) : Tr.DrawText(g, ChrW(&HE8C8), f, New Rectangle(codeRect.Right - 22, codeRect.Y, 18, codeRect.Height), Theme.Blue, TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding) : End Using
                                      Dim info = If(Js.Str(c, "appliesTo") = "all", "All Products", Js.Str(c, "target", Js.Str(c, "appliesTo"))) & "     " & Js.Int(c, "used") & " / " & Js.Int(c, "limit") & " used"
                                      Tr.DrawText(g, info, Theme.Body, New Rectangle(54, 60, r.Width - 54, 18), Theme.G600, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                      If AtTime(c, "startsAt").HasValue OrElse AtTime(c, "endsAt").HasValue Then
                                          Tr.DrawText(g, If(AtTime(c, "startsAt").HasValue, Fmt.Day(AtTime(c, "startsAt")), "No start date") & " – " & If(AtTime(c, "endsAt").HasValue, Fmt.Day(AtTime(c, "endsAt")), "No end date"), Theme.Body, New Rectangle(54, 78, r.Width - 54, 18), Theme.G600, TextFormatFlags.NoPadding)
                                      End If
                                  End Sub)
        AddHandler head.MouseMove, Sub(s, e) head.Cursor = If(pillRect.Contains(e.Location) OrElse codeRect.Contains(e.Location), Cursors.Hand, Cursors.Default)
        AddHandler head.MouseClick, Async Sub(s, e)
                                        If codeRect.Contains(e.Location) Then
                                            Clipboard.SetText(Js.Str(c, "code"))
                                            Toast("Code " & Js.Str(c, "code") & " copied.")
                                        ElseIf pillRect.Contains(e.Location) AndAlso Js.Int(c, "id") > 0 Then
                                            Await PauseAsync(c)
                                        End If
                                    End Sub
        card.Add(head)
        card.Add(New Spacer(8, True))
        Dim btns As New HRow(6)
        btns.Add(Ui.Btn("Edit", ChrW(&HE70F), outline:=True, click:=Sub() EditCoupon(c)))
        If Js.Int(c, "id") > 0 Then
            btns.Add(Ui.Btn("Duplicate", ChrW(&HE8C8), outline:=True, click:=Async Sub() Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/coupons2/" & Js.Int(c, "id") & "/duplicate", .Label = "Duplicate coupon " & Js.Str(c, "code")}, "coupons", "Copy made — it starts paused.")))
            btns.Add(Ui.Btn(If(Js.Bool(c, "paused"), "Resume", "Pause"), If(Js.Bool(c, "paused"), ChrW(&HE768), ChrW(&HE769)), outline:=True, click:=Async Sub() Await PauseAsync(c)))
            btns.Add(Ui.Btn("Delete", Theme.IcDelete, Theme.Danger, outline:=True, click:=Async Sub() Await DeleteCouponAsync(c)))
        End If
        card.Add(btns)
        Return card
    End Function

    Private Function PauseAsync(c As JsonObject) As Task
        Dim paused = Js.Bool(c, "paused")
        Return PageActions.SendAsync(Me, New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/coupons2/" & Js.Int(c, "id"), .Body = Js.Obj("isPaused", Not paused),
            .Label = "Coupon " & Js.Str(c, "code") & ": " & If(paused, "resumed", "paused"), .Refresh = New List(Of String) From {"coupons"}, .Effect = PageActions.PageRow("coupons", Js.Field(c, "id"), Js.Obj("paused", Not paused))},
            "coupons", """" & Js.Str(c, "title") & """ " & If(paused, "resumed.", "paused."))
    End Function

    Private Async Function DeleteCouponAsync(c As JsonObject) As Task
        Dim used = Js.Int(c, "used")
        If Not Ui.Confirm(Me, "This can't be undone." & If(used > 0, " It has been used " & used & " time" & If(used = 1, "", "s") & " — past orders keep their discount, only the code stops working.", ""), "Delete """ & Js.Str(c, "title") & """?") Then Return
        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/coupons2/" & Js.Int(c, "id"), .Label = "Delete coupon " & Js.Str(c, "code"), .Refresh = New List(Of String) From {"coupons"},
            .Effect = PageActions.PageRowDelete("coupons", Js.Field(c, "id"))}, "coupons", "Coupon deleted.")
    End Function

    Private Function ActivityPanel() As Control
        Dim card As New CardBox("Recent Activity")
        Dim acts = AppState.I.PageList("coupon_activity")
        Dim tl As New Timeline() With {.EmptyText = "No coupon activity logged yet."}
        For Each a In acts
            tl.Items.Add((Js.Str(a, "description"), If(Js.Str(a, "byUsername") <> "", "By " & Js.Str(a, "byUsername") & " · ", "") & Fmt.Ago(AtTime(a, "createdAt")), Nothing))
        Next
        card.Add(tl)
        Return card
    End Function

    ''' <summary>The website's coupon form: title, code, type, value, times, applies to, start / end, status.</summary>
    Private Sub EditCoupon(c As JsonObject)
        Dim s = AppState.I
        Dim products = s.List("products"), cats = s.List("categories")
        Dim f As New FormDialog(If(c Is Nothing, "Create Coupon", "Edit Coupon"), 580, If(c Is Nothing, "Create Coupon", "Save Changes"))
        f.AddText("title", "Title", Js.Str(c, "title"), required:=True, placeholder:="e.g. Welcome Offer")
        Dim code = f.AddText("code", "Code", Js.Str(c, "code"), required:=True, placeholder:="WELCOME10")
        code.Box.CharacterCasing = CharacterCasing.Upper
        f.AddPick("type", "Discount type", {"percentage|Percentage (%)", "fixed|Fixed Amount (₹)"}, Js.Str(c, "discountType", "percentage"), half:=True)
        f.AddNumber("value", "Discount value", If(c Is Nothing, CType(Nothing, Double?), Js.Num(c, "discountValue")), required:=True, half:=True)
        f.AddNumber("limit", "Number of times", If(c Is Nothing, 100, Js.Int(c, "limit")), half:=True)
        f.AddPick("status", "Status", {"active|Active", "inactive|Disabled"}, If(Js.Str(c, "status") = "inactive", "inactive", "active"), half:=True)
        Dim applies = f.AddPick("applies", "Applies to", {"all|All Products", "product|Specific Product", "category|Specific Category"}, Js.Str(c, "appliesTo", "all"))
        f.AddPick("product", "Product", {"0|Select a product…"}.Concat(products.Select(Function(p) Js.Int(p, "id") & "|" & Js.Str(p, "name"))), Js.Int(c, "productId").ToString())
        f.AddPick("category", "Category", {"0|Select a category…"}.Concat(cats.Select(Function(x) Js.Int(x, "id") & "|" & Js.Str(x, "name"))), Js.Int(c, "categoryId").ToString())
        f.AddDate("starts", "Starts", AtTime(c, "startsAt"), withTime:=True, optional_:=True, half:=True)
        f.AddDate("ends", "Ends", AtTime(c, "endsAt"), withTime:=True, optional_:=True, half:=True)
        Dim sync = Sub()
                       f.ShowField("product", Ui.Val(applies) = "product")
                       f.ShowField("category", Ui.Val(applies) = "category")
                       If f.IsHandleCreated Then f.Relayout()
                   End Sub
        AddHandler applies.SelectedIndexChanged, Sub() sync()
        sync()
        f.Validator = Function(d)
                          If d.Num("value") <= 0 Then Return "Type the discount value."
                          If d.Val("applies") = "product" AndAlso d.Val("product") = "0" Then Return "Choose the product."
                          If d.Val("applies") = "category" AndAlso d.Val("category") = "0" Then Return "Choose the category."
                          Return Nothing
                      End Function
        f.OnSave = Async Function(d)
                       Dim ap = d.Val("applies")
                       Dim pid = If(ap = "product", JsonValue.Create(CInt(d.Val("product"))), Nothing)
                       Dim cid = If(ap = "category", JsonValue.Create(CInt(d.Val("category"))), Nothing)
                       Dim starts = d.DateOf("starts"), ends = d.DateOf("ends")
                       Dim body As New JsonObject From {{"title", d.Val("title").Trim()}, {"code", d.Val("code").Trim().ToUpperInvariant()}, {"discountType", d.Val("type")}, {"discountValue", d.Num("value")},
                           {"appliesTo", ap}, {"productId", pid}, {"categoryId", cid}, {"numberOfTimes", Math.Max(1, CInt(d.Num("limit")))}, {"status", d.Val("status")}, {"isPaused", Js.Bool(c, "paused")},
                           {"startsAt", If(starts.HasValue, JsonValue.Create(starts.Value.ToUniversalTime().ToString("o")), Nothing)}, {"endsAt", If(ends.HasValue, JsonValue.Create(ends.Value.ToUniversalTime().ToString("o")), Nothing)}}
                       Dim target = If(ap = "product", Js.Str(products.FirstOrDefault(Function(p) Js.Int(p, "id").ToString() = d.Val("product")), "name"), If(ap = "category", Js.Str(cats.FirstOrDefault(Function(x) Js.Int(x, "id").ToString() = d.Val("category")), "name"), Nothing))
                       Dim row As New JsonObject From {{"title", Js.Copy(body("title"))}, {"code", Js.Copy(body("code"))}, {"discountType", d.Val("type")}, {"discountValue", d.Num("value")}, {"appliesTo", ap},
                           {"productId", Js.Copy(pid)}, {"categoryId", Js.Copy(cid)}, {"limit", Js.Copy(body("numberOfTimes"))}, {"status", d.Val("status")}, {"startsAt", Js.Copy(body("startsAt"))}, {"endsAt", Js.Copy(body("endsAt"))}, {"target", target}}
                       Dim item As New OutboxItem With {.Method = If(c Is Nothing, "POST", "PUT"), .Path = If(c Is Nothing, "/api/ecommerce/coupons2", "/api/ecommerce/coupons2/" & Js.Int(c, "id")),
                           .Label = "Coupon " & Js.Str(body, "code"), .Body = body, .Refresh = New List(Of String) From {"coupons"}}
                       If c Is Nothing Then
                           Js.Merge(row, Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "used", 0, "paused", False, "createdAt", DateTime.UtcNow))
                           item.Effect = PageActions.PageRowNew("coupons", row)
                       Else
                           item.Effect = PageActions.PageRow("coupons", Js.Field(c, "id"), row)
                       End If
                       Return Await PageActions.SendAsync(Me, item, "coupons", """" & d.Val("title").Trim() & """ " & If(c Is Nothing, "created.", "saved."))
                   End Function
        f.ShowDialog(FindForm())
    End Sub
End Class
