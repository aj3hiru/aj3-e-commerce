Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>The website's Report Builder: presets (today, yesterday, this / previous month, a month, custom
''' range), staff and channel filters; the report (header, numbers, product-wise timeline, product / day /
''' collections / new dues / added / agents / staff / activity tables) and the right panel (payments donut,
''' channels, online status, due aging, PDF / Excel export). Every report made is kept on this computer.</summary>
Public Class ReportsPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_report_builder_display")
    Private ReadOnly _params As New SortedDictionary(Of String, String) From {{"range", "today"}}
    Private _r As JsonObject
    Private _loading As Boolean
    Private _error As String
    Private _seq As Integer

    Public Overrides ReadOnly Property PageTitle As String = "Report Builder"
    Public Overrides ReadOnly Property PageSubtitle As String = "Generate and analyze your sales performance"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New()
        AddHandler _display.Changed, Sub() Refresh_()
        Dim unused = LoadAsync()
    End Sub

    Private Function Query() As String
        Return String.Join("&", _params.Select(Function(kv) kv.Key & "=" & Uri.EscapeDataString(kv.Value)))
    End Function

    Private Function CacheKey() As String
        Return AppState.ReportKey(String.Join("&", _params.Select(Function(kv) kv.Key & "=" & kv.Value)))
    End Function

    ''' <summary>The saved copy at once; a fresh one from the server when online.</summary>
    Private Async Function LoadAsync() As Task
        _seq += 1
        Dim mine = _seq
        Dim saved = TryCast(Store.Read(CacheKey()), JsonObject)
        _r = saved
        _loading = saved Is Nothing
        _error = Nothing
        Refresh_()
        Dim q = Query()
        Dim key = CacheKey()
        Dim r = Await AppState.I.Api.GetAsync("/api/app/v1/report?" & q, 60)
        If mine <> _seq OrElse IsDisposed Then Return
        _loading = False
        If r.IsOk Then
            _r = TryCast(Js.Copy(Js.Field(r.Data, "report")), JsonObject)
            Store.Write(key, Js.Copy(_r))
        ElseIf r.Outcome <> ApiOutcome.Offline AndAlso r.Outcome <> ApiOutcome.Busy Then
            _error = r.Message
        End If
        Refresh_()
    End Function

    Private Sub SetRange(ParamArray kv As String())
        Dim keep = _params.Where(Function(p) p.Key = "channel" OrElse p.Key = "user").ToList()
        _params.Clear()
        For i = 0 To kv.Length - 2 Step 2 : _params(kv(i)) = kv(i + 1) : Next
        For Each p In keep : _params(p.Key) = p.Value : Next
        Dim unused = LoadAsync()
    End Sub

    Private Sub SetParam(k As String, v As String)
        If String.IsNullOrEmpty(v) Then _params.Remove(k) Else _params(k) = v
        Dim unused = LoadAsync()
    End Sub

    Private Sub PickMonth()
        Dim f As New FormDialog("Choose a month", 380, "Open")
        Dim years = Enumerable.Range(2023, DateTime.Today.Year - 2022).Reverse().Select(Function(y) y.ToString() & "|" & y).ToList()
        f.AddPick("y", "Year", years, DateTime.Today.Year.ToString(), half:=True)
        f.AddPick("m", "Month", Enumerable.Range(1, 12).Select(Function(m) m.ToString("00") & "|" & New DateTime(2000, m, 1).ToString("MMMM")), DateTime.Today.Month.ToString("00"), half:=True)
        f.Validator = Function(d) If(New DateTime(CInt(d.Val("y")), CInt(d.Val("m")), 1) > DateTime.Today, "That month has not started yet.", Nothing)
        If f.ShowDialog(FindForm()) <> DialogResult.OK Then Return
        SetRange("range", "month", "m", f.Val("y") & "-" & f.Val("m"))
    End Sub

    Private Sub PickRange()
        Dim r = Dialogs.PickRange(FindForm(), DateTime.Today.AddDays(-7), DateTime.Today)
        If r.HasValue Then SetRange("range", "custom", "from", r.Value.Item1.ToString("yyyy-MM-dd"), "to", r.Value.Item2.ToString("yyyy-MM-dd"))
    End Sub

    Protected Overrides Sub Reload()
        ClearBody()
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)
        Dim r = _r
        Dim preset = If(_params.ContainsKey("range"), _params("range"), "today")
        Dim staffList = Js.Objs(Js.Arr(r, "staffList"))

        ' presets + filters
        Dim top As New CardBox(Nothing, "", 14)
        Dim row As New HRow(10)
        Dim presetBtn = Function(label As String, range As String, click As Action) As WButton
                            Dim b = Ui.Btn(label, "", Theme.Primary, outline:=preset <> range, click:=click)
                            Return b
                        End Function
        If on_("rb-filters", "rb-f-presets") OrElse on_("rb-filters", "rb-f-month") OrElse on_("rb-filters", "rb-f-range") Then
            row.Add(New Label With {.Text = "Date Presets", .AutoSize = True, .Font = Theme.BodyBold, .ForeColor = Theme.G900, .BackColor = Color.Transparent, .Padding = New Padding(0, 10, 8, 0)})
        End If
        If on_("rb-filters", "rb-f-presets") Then
            For Each p In {("Today", "today"), ("Yesterday", "yesterday"), ("This Month", "this_month"), ("Previous Month", "prev_month")}
                Dim range = p.Item2
                row.Add(presetBtn(p.Item1, range, Sub() SetRange("range", range)))
            Next
        End If
        If on_("rb-filters", "rb-f-month") Then row.Add(presetBtn(If(preset = "month", Js.Str(r, "rangeLabel", "Month"), "Month"), "month", Sub() PickMonth()))
        If on_("rb-filters", "rb-f-range") Then row.Add(presetBtn(If(preset = "custom", Js.Str(r, "rangeLabel", "Custom Range"), "Custom Range"), "custom", Sub() PickRange()))
        top.Add(row)
        Dim showStaff = on_("rb-filters", "rb-f-staff") AndAlso (staffList.Count > 1 OrElse _params.ContainsKey("user"))
        Dim showChannel = on_("rb-filters", "rb-f-channel")
        If showStaff OrElse showChannel Then
            Dim row2 As New HRow(10) With {.RightAlign = True}
            If showStaff Then
                Dim staff = Ui.Filter({"|Whole business"}.Concat(staffList.Select(Function(u) Js.Str(u, "id") & "|" & Js.Str(u, "name") & " · " & Js.Str(u, "role"))), 260)
                Ui.SetVal(staff, If(_params.ContainsKey("user"), _params("user"), ""))
                AddHandler staff.SelectionChangeCommitted, Sub() SetParam("user", Ui.Val(staff))
                row2.Add(staff)
            End If
            If showChannel Then
                Dim ch = If(_params.ContainsKey("channel"), _params("channel"), "")
                For Each c In {("All Sales", "", ChrW(&HE71C)), ("In-store", "offline", Theme.IcShop), ("Online", "online", Theme.IcGlobe)}
                    Dim v = c.Item2
                    row2.Add(Ui.Btn(c.Item1, c.Item3, Theme.Primary, outline:=ch <> v, click:=Sub() SetParam("channel", v)))
                Next
            End If
            top.Add(row2)
        End If
        Body.Add(top)
        If _loading Then Body.Add(New TextBlock("Making the report…", Theme.Body, Theme.Primary))
        If _error IsNot Nothing AndAlso r Is Nothing Then Body.Add(New TextBlock(_error, Theme.Body, Theme.Danger))
        If r Is Nothing Then
            If Not _loading Then Body.Add(New CardBox()).Add(New TextBlock("This report opens here as soon as it has been made once (with internet).", Theme.Body, Theme.G600))
            Return
        End If
        Dim cols As New Columns(2, 420, 12) With {.Weights = {64, 36}, .Stretch = False}
        cols.Add(ReportCard(r))
        Dim side = SidePanel(r)
        If side IsNot Nothing Then cols.Add(side) Else cols.Count = 1 : cols.Weights = Nothing
        Body.Add(cols)
    End Sub

    ' ───────── the report ─────────
    Private Function ReportCard(r As JsonObject) As Control
        Dim on_ = Function(grp As String, key As String) _display.IsOn(grp, key)
        Dim card As New CardBox(Nothing, "", 16)
        Dim k = TryCast(Js.Field(r, "kpis"), JsonObject)
        Dim biz = TryCast(Js.Field(r, "business"), JsonObject)
        If _display.IsOn("rb-head") Then
            Dim logo = Js.Str(biz, "logo")
            Dim head As New Drawn(96, Sub(g, rr)
                                          Dim x = 0
                                          If on_("rb-head", "rb-h-logo") AndAlso logo <> "" Then
                                              Dim im = Img.Get(logo, 120, Sub() card.Invalidate(True))
                                              If im IsNot Nothing Then Gfx.Thumb(g, New Rectangle(0, 0, 54, 54), im, 8) : x = 66
                                          End If
                                          Dim y = 0
                                          If on_("rb-head", "rb-h-name") Then
                                              Tr.DrawText(g, Js.Str(biz, "name"), Theme.UiFont(13.0F, FontStyle.Bold), New Point(x, y), Theme.Primary, TextFormatFlags.NoPadding) : y += 24
                                              If Js.Str(biz, "tagline") <> "" Then Tr.DrawText(g, Js.Str(biz, "tagline"), Theme.Small, New Point(x, y), Theme.G500, TextFormatFlags.NoPadding) : y += 16
                                          End If
                                          If on_("rb-head", "rb-h-address") AndAlso Js.Str(biz, "address") <> "" Then Tr.DrawText(g, Js.Str(biz, "address"), Theme.Small, New Rectangle(x, y, rr.Width \ 2, 16), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis) : y += 16
                                          Dim phones = String.Join(", ", Js.Arr(biz, "phones").Select(Function(p) Js.Text(p)))
                                          If on_("rb-head", "rb-h-contact") AndAlso (phones <> "" OrElse Js.Str(biz, "email") <> "") Then
                                              Tr.DrawText(g, String.Join("  ·  ", {If(phones <> "", "Mobile: " & phones, ""), Js.Str(biz, "email")}.Where(Function(t) t <> "")), Theme.Small, New Rectangle(x, y, rr.Width \ 2, 16), Theme.G700, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis) : y += 16
                                          End If
                                          If on_("rb-head", "rb-h-gstin") AndAlso Js.Str(biz, "gstin") <> "" Then Tr.DrawText(g, "GSTIN: " & Js.Str(biz, "gstin"), Theme.UiFont(8.5F, FontStyle.Bold), New Point(x, y), Theme.G700, TextFormatFlags.NoPadding)
                                          Dim title = If(Js.Field(r, "selectedUser") IsNot Nothing, "Staff Report · " & Js.Str(Js.Field(r, "selectedUser"), "name"), "Sales Report")
                                          Tr.DrawText(g, title, Theme.UiFont(13.0F, FontStyle.Bold), New Rectangle(rr.Width \ 2, 0, rr.Width \ 2, 24), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                          Tr.DrawText(g, Js.Str(r, "rangeLabel"), Theme.Body, New Rectangle(rr.Width \ 2, 26, rr.Width \ 2, 20), Theme.G700, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                          If on_("rb-head", "rb-h-generated") Then Tr.DrawText(g, "Generated on " & Fmt.Stamp(Js.Time(r, "generatedAt")), Theme.Small, New Rectangle(rr.Width \ 2, 48, rr.Width \ 2, 18), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                          Using p As New Pen(Theme.G300) With {.DashPattern = {4, 4}} : g.DrawLine(p, 0, rr.Height - 4, rr.Width, rr.Height - 4) : End Using
                                      End Sub)
            card.Add(head)
        End If
        If _display.IsOn("rb-kpi") Then
            Dim kpis As New Columns(4, 150, 12)
            Dim kpi = Sub(key As String, caption As String, glyph As String, colour As Color, value As String, note As String)
                          If Not on_("rb-kpi", key) Then Return
                          Dim m As New MiniStat(caption, glyph, colour) With {.Height = 84}
                          m.SetValue(value, note)
                          kpis.Add(m)
                      End Sub
            kpi("rb-k-sales", "Total Sales", Theme.IcMoney, Theme.Primary, Theme.Money(Js.Num(k, "sales")), Js.Int(k, "orders") & " Orders")
            kpi("rb-k-units", "Products Sold", Theme.IcShop, Theme.Blue, Js.Int(k, "units").ToString(), "Units")
            kpi("rb-k-due", "Total Dues", ChrW(&HE7BA), Theme.Danger, Theme.Money(Js.Num(k, "due")), Js.Int(k, "dueOrders") & " Orders")
            kpi("rb-k-collected", "Due Collected", ChrW(&HE8C7), Color.FromArgb(&H16, &HA3, &H4A), Theme.Money(Js.Num(k, "collected")), Js.Int(k, "collections") & " Payments")
            If kpis.Controls.Count > 0 Then kpis.Count = kpis.Controls.Count : card.Add(kpis)
            Dim avg = If(Js.Int(k, "orders") > 0, Js.Num(k, "sales") / Js.Int(k, "orders"), 0)
            Dim chips As New List(Of String)
            If on_("rb-kpi", "rb-k-added") Then chips.Add("Products Added  " & Js.Int(k, "productsAdded"))
            If on_("rb-kpi", "rb-k-newdue") Then chips.Add("New Dues  " & Theme.Money(Js.Num(k, "newDues")) & " · " & Js.Int(k, "newDueCount"))
            If on_("rb-kpi", "rb-k-avg") Then chips.Add("Average Order  " & Theme.Money(avg))
            If on_("rb-kpi", "rb-k-discount") Then chips.Add("Discount Given  " & Theme.Money(Js.Num(k, "discount")))
            If on_("rb-kpi", "rb-k-gst") Then chips.Add("GST Collected  " & Theme.Money(Js.Num(k, "gst")))
            If on_("rb-kpi", "rb-k-online") Then chips.Add("Online Orders Placed  " & Js.Int(k, "onlinePlaced"))
            If chips.Count > 0 Then
                Dim chipRow As New HRow(8)
                For Each c In chips
                    Dim text = c
                    Dim w = Tr.MeasureText(text, Theme.BodyBold).Width + 24
                    chipRow.Add(New Drawn(32, Sub(g, rr)
                                                  Using p = Theme.RoundRect(New RectangleF(0.5F, 0.5F, rr.Width - 1, rr.Height - 1), 8)
                                                      Using pen As New Pen(Theme.G200) : g.DrawPath(pen, p) : End Using
                                                  End Using
                                                  Tr.DrawText(g, text, Theme.Body, rr, Theme.G800, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
                                              End Sub) With {.Width = w})
                Next
                card.Add(chipRow)
            End If
        End If
        Dim opt = Function(v As String) If(v = "", "—", v)
        AddSection(card, "rb-tl", "Product-wise Sales Timeline", Js.Objs(Js.Arr(r, "timeline")).Take(300).ToList(), Js.Arr(r, "timeline").Count & " entries", False, {
            ("rb-c-time", "Time", 11, False, Function(t As JsonObject) Fmt.Stamp(Js.Time(t, "at"))),
            ("rb-c-order", "Order ID", 11, False, Function(t As JsonObject) Js.Str(t, "orderNumber")),
            ("rb-c-channel", "Channel", 8, False, Function(t As JsonObject) If(Js.Str(t, "channel") = "online", "Online", "In-store")),
            ("rb-c-customer", "Customer", 12, False, Function(t As JsonObject) Js.Str(t, "customer")),
            ("rb-c-phone", "Mobile", 10, False, Function(t As JsonObject) opt(Js.Str(t, "phone"))),
            ("rb-c-product", "Product", 13, False, Function(t As JsonObject) Js.Str(t, "product")),
            ("rb-c-sku", "SKU", 8, False, Function(t As JsonObject) opt(Js.Str(t, "sku"))),
            ("rb-c-category", "Category", 10, False, Function(t As JsonObject) opt(Js.Str(t, "category"))),
            ("rb-c-qty", "Qty", 5, True, Function(t As JsonObject) Fmt.Num(Js.Num(t, "qty"))),
            ("rb-c-price", "Unit Price", 9, True, Function(t As JsonObject) Theme.Money(Js.Num(t, "unitPrice"))),
            ("rb-c-total", "Total", 10, True, Function(t As JsonObject) Theme.Money(Js.Num(t, "total"))),
            ("rb-c-gst", "GST", 8, True, Function(t As JsonObject) Theme.Money(Js.Num(t, "gst"))),
            ("rb-c-payment", "Payment", 9, False, Function(t As JsonObject) opt(Js.Str(t, "payment"))),
            ("rb-c-due", "Due", 8, True, Function(t As JsonObject) If(Js.IsNull(t, "due"), "—", Theme.Money(Js.Num(t, "due")))),
            ("rb-c-status", "Status", 9, False, Function(t As JsonObject) opt(Js.Str(t, "status"))),
            ("rb-c-staff", "Sold / delivered by", 11, False, Function(t As JsonObject) opt(Js.Str(t, "staff")))})
        AddSection(card, "rb-g-products", "Product Summary", Js.Objs(Js.Arr(r, "products")), Js.Arr(r, "products").Count & " entries", False, {
            ("rb-p-name", "Product", 20, False, Function(p As JsonObject) Js.Str(p, "name")),
            ("rb-p-sku", "SKU", 10, False, Function(p As JsonObject) opt(Js.Str(p, "sku"))),
            ("rb-p-category", "Category", 11, False, Function(p As JsonObject) opt(Js.Str(p, "category"))),
            ("rb-p-orders", "Orders", 7, True, Function(p As JsonObject) Js.Str(p, "orders")),
            ("rb-p-qty", "Qty sold", 8, True, Function(p As JsonObject) Fmt.Num(Js.Num(p, "qty"))),
            ("rb-p-revenue", "Revenue", 11, True, Function(p As JsonObject) Theme.Money(Js.Num(p, "revenue"))),
            ("rb-p-last", "Last sold", 14, False, Function(p As JsonObject) If(Js.Time(p, "lastSoldAt").HasValue, Fmt.Stamp(Js.Time(p, "lastSoldAt")), "—"))})
        Dim daily = Js.Objs(Js.Arr(r, "daily"))
        If daily.Count > 1 Then
            AddSection(card, "rb-g-daily", "Day-wise Summary", daily, Nothing, False, {
                ("rb-d-day", "Date", 10, False, Function(d As JsonObject) Fmt.Day(Js.Time(New JsonObject From {{"x", Js.Str(d, "day") & "T06:30:00Z"}}, "x"))),
                ("rb-d-orders", "Orders", 10, True, Function(d As JsonObject) Js.Int(d, "orders").ToString()),
                ("rb-d-offline", "In-store", 10, True, Function(d As JsonObject) Js.Int(d, "offline").ToString()),
                ("rb-d-online", "Online", 10, True, Function(d As JsonObject) Js.Int(d, "online").ToString()),
                ("rb-d-units", "Units", 10, True, Function(d As JsonObject) Js.Str(d, "units")),
                ("rb-d-sales", "Sales", 10, True, Function(d As JsonObject) Theme.Money(Js.Num(d, "sales"))),
                ("rb-d-due", "Due", 10, True, Function(d As JsonObject) Theme.Money(Js.Num(d, "due"))),
                ("rb-d-collected", "Collected", 10, True, Function(d As JsonObject) Theme.Money(Js.Num(d, "collected")))})
        End If
        AddSection(card, "rb-g-collections", "Due Collections", Js.Objs(Js.Arr(r, "collections")), Js.Arr(r, "collections").Count & " payments", True, {
            ("rb-col-time", "Time", 13, False, Function(c As JsonObject) Fmt.Stamp(Js.Time(c, "at"))),
            ("rb-col-receipt", "Receipt", 10, False, Function(c As JsonObject) opt(Js.Str(c, "receipt"))),
            ("rb-col-customer", "Customer", 13, False, Function(c As JsonObject) Js.Str(c, "customer")),
            ("rb-col-order", "Order", 10, False, Function(c As JsonObject) opt(Js.Str(c, "orderNumber"))),
            ("rb-col-method", "Method", 8, False, Function(c As JsonObject) Js.Str(c, "method")),
            ("rb-col-amount", "Amount", 10, True, Function(c As JsonObject) Theme.Money(Js.Num(c, "amount"))),
            ("rb-col-by", "Received by", 10, False, Function(c As JsonObject) opt(Js.Str(c, "by")))})
        AddSection(card, "rb-g-dues", "New Dues", Js.Objs(Js.Arr(r, "newDues")), Js.Arr(r, "newDues").Count & " dues", True, {
            ("rb-du-time", "Time", 12, False, Function(d As JsonObject) Fmt.Stamp(Js.Time(d, "at"))),
            ("rb-du-order", "Order", 10, False, Function(d As JsonObject) Js.Str(d, "orderNumber")),
            ("rb-du-customer", "Customer", 12, False, Function(d As JsonObject) Js.Str(d, "customer")),
            ("rb-du-phone", "Mobile", 10, False, Function(d As JsonObject) opt(Js.Str(d, "phone"))),
            ("rb-du-amount", "Due amount", 10, True, Function(d As JsonObject) Theme.Money(Js.Num(d, "amount"))),
            ("rb-du-paid", "Paid since", 10, True, Function(d As JsonObject) Theme.Money(Js.Num(d, "paid"))),
            ("rb-du-balance", "Balance", 10, True, Function(d As JsonObject) Theme.Money(Js.Num(d, "balance"))),
            ("rb-du-promised", "Promised", 10, False, Function(d As JsonObject) If(Js.Time(d, "promised").HasValue, Fmt.Day(Js.Time(d, "promised")), "—")),
            ("rb-du-status", "Status", 8, False, Function(d As JsonObject) Js.Str(d, "status"))})
        AddSection(card, "rb-g-added", "Products Added", Js.Objs(Js.Arr(r, "added")), Nothing, True, {
            ("rb-a-time", "Time", 13, False, Function(x As JsonObject) Fmt.Stamp(Js.Time(x, "at"))),
            ("rb-a-name", "Product", 16, False, Function(x As JsonObject) Js.Str(x, "name")),
            ("rb-a-sku", "SKU", 10, False, Function(x As JsonObject) opt(Js.Str(x, "sku"))),
            ("rb-a-category", "Category", 10, False, Function(x As JsonObject) opt(Js.Str(x, "category"))),
            ("rb-a-price", "Price", 10, True, Function(x As JsonObject) Theme.Money(Js.Num(x, "price"))),
            ("rb-a-stock", "Stock", 10, True, Function(x As JsonObject) opt(Js.Str(x, "stock"))),
            ("rb-a-by", "Added by", 10, False, Function(x As JsonObject) opt(Js.Str(x, "by")))})
        AddSection(card, "rb-g-agents", "Deliveries by Agent", Js.Objs(Js.Arr(r, "agents")), Nothing, True, {
            ("rb-ag-name", "Agent", 14, False, Function(a As JsonObject) Js.Str(a, "name")),
            ("rb-ag-assigned", "Assigned", 10, True, Function(a As JsonObject) Js.Str(a, "assigned")),
            ("rb-ag-delivered", "Delivered", 10, True, Function(a As JsonObject) Js.Str(a, "delivered")),
            ("rb-ag-pending", "Pending", 10, True, Function(a As JsonObject) Js.Str(a, "pending")),
            ("rb-ag-canceled", "Canceled", 10, True, Function(a As JsonObject) Js.Int(a, "canceled").ToString()),
            ("rb-ag-value", "Delivered value", 10, True, Function(a As JsonObject) Theme.Money(Js.Num(a, "deliveredValue"))),
            ("rb-ag-avg", "Avg. time", 10, True, Function(a As JsonObject) If(Js.IsNull(a, "avgMinutes"), "—", CInt(Js.Num(a, "avgMinutes")) & " min"))})
        AddSection(card, "rb-g-staff", "Staff Performance", Js.Objs(Js.Arr(r, "staff")), Nothing, True, {
            ("rb-st-name", "Staff", 14, False, Function(x As JsonObject) Js.Str(x, "name")),
            ("rb-st-role", "Role", 10, False, Function(x As JsonObject) Js.Str(x, "role")),
            ("rb-st-pos", "Store sales", 10, True, Function(x As JsonObject) Js.Str(x, "posSales")),
            ("rb-st-posamt", "Amount", 10, True, Function(x As JsonObject) Theme.Money(Js.Num(x, "posAmount"))),
            ("rb-st-col", "Collections", 10, True, Function(x As JsonObject) Js.Int(x, "collections").ToString()),
            ("rb-st-colamt", "Collected", 10, True, Function(x As JsonObject) Theme.Money(Js.Num(x, "collectedAmount"))),
            ("rb-st-delivered", "Delivered", 10, True, Function(x As JsonObject) Js.Str(x, "delivered")),
            ("rb-st-added", "Added", 10, True, Function(x As JsonObject) Js.Int(x, "productsAdded").ToString())})
        AddSection(card, "rb-g-activity", "What they did", Js.Objs(Js.Arr(r, "activity")), Nothing, True, {
            ("rb-ac-time", "Time", 12, False, Function(x As JsonObject) Fmt.Stamp(Js.Time(x, "at"))),
            ("rb-ac-action", "Action", 10, False, Function(x As JsonObject) Js.Str(x, "action").Replace("ecom_", "").Replace("_", " ")),
            ("rb-ac-details", "Details", 24, False, Function(x As JsonObject) Js.Str(x, "description"))})
        Return card
    End Function

    ''' <summary>One summary table: hidden columns drop out; the whole table hides when its group is off.</summary>
    Private Sub AddSection(card As CardBox, group As String, title As String, rows As List(Of JsonObject), right As String, hideEmpty As Boolean,
                           cols As IEnumerable(Of (Key As String, Head As String, Flex As Integer, RightAlign As Boolean, Value As Func(Of JsonObject, String))))
        Dim shown = cols.Where(Function(c) _display.IsOn(group, c.Key)).ToList()
        If Not _display.IsOn(group) OrElse shown.Count = 0 OrElse (hideEmpty AndAlso rows.Count = 0) Then Return
        card.Add(New Spacer(10))
        card.Add(New TextBlock(title & If(right IsNot Nothing, "   ·   " & right, ""), Theme.UiFont(10.5F, FontStyle.Bold), Theme.Primary))
        Dim t As New WebTable() With {.RowHeight = 40, .HeadHeight = 38, .EmptyText = "Nothing in this period."}
        For Each c In shown
            Dim f = c.Value
            t.Cols.Add(New TCol(c.Head, Function(x) f(x), 0) With {.Flex = c.Flex, .Right = c.RightAlign, .Colour = If(c.Key = "rb-c-order", Function(x As JsonObject) Theme.Primary, CType(Nothing, Func(Of JsonObject, Color)))})
        Next
        t.Rows = rows
        card.Add(t)
    End Sub

    ' ───────── right panel ─────────
    Private Function SidePanel(r As JsonObject) As Control
        Dim on_ = Function(k As String) _display.IsOn("rb-side", k)
        If Not _display.IsOn("rb-side") Then Return Nothing
        Dim stack As New VStack(12)
        Dim palette = {Color.FromArgb(&H22, &HC5, &H5E), Theme.Blue, Color.FromArgb(&HF5, &H9E, &HB), Theme.Primary, Color.FromArgb(&HEF, &H44, &H44), Theme.Cyan}
        If on_("rb-r-payment") Then
            Dim pays = Js.Objs(Js.Arr(r, "payments"))
            Dim total = pays.Sum(Function(p) Js.Num(p, "amount"))
            Dim card As New CardBox("Payment Summary", ChrW(&HE71C))
            Dim donut As New Drawn(Math.Max(160, pays.Count * 36 + 10), Sub(g, rr)
                                                                            Dim box As New Rectangle(6, 6, 148, 148)
                                                                            If total <= 0 Then
                                                                                Using pen As New Pen(Theme.G200, 14) : g.DrawEllipse(pen, box.X + 7, box.Y + 7, box.Width - 14, box.Height - 14) : End Using
                                                                            Else
                                                                                Dim a = -90.0F
                                                                                For i = 0 To pays.Count - 1
                                                                                    Dim sweep = CSng(Js.Num(pays(i), "amount") / total * 360)
                                                                                    Using pen As New Pen(palette(i Mod palette.Length), 14) : g.DrawArc(pen, box.X + 7, box.Y + 7, box.Width - 14, box.Height - 14, a, sweep) : End Using
                                                                                    a += sweep
                                                                                Next
                                                                            End If
                                                                            Tr.DrawText(g, Theme.Money(total), Theme.BodyBold, New Rectangle(box.X, box.Y + 58, box.Width, 20), Theme.G900, TextFormatFlags.HorizontalCenter)
                                                                            Tr.DrawText(g, "Total Sales", Theme.Small, New Rectangle(box.X, box.Y + 78, box.Width, 16), Theme.G500, TextFormatFlags.HorizontalCenter)
                                                                            Dim x = 172
                                                                            If pays.Count = 0 Then Tr.DrawText(g, "No sales.", Theme.Body, New Point(x, 10), Theme.G500)
                                                                            For i = 0 To pays.Count - 1
                                                                                Dim y = 8 + i * 36
                                                                                Using b As New SolidBrush(palette(i Mod palette.Length)) : g.FillRectangle(b, x, y + 4, 11, 11) : End Using
                                                                                Tr.DrawText(g, Js.Str(pays(i), "method"), Theme.Body, New Point(x + 18, y), Theme.G800, TextFormatFlags.NoPadding)
                                                                                Tr.DrawText(g, Theme.Money(Js.Num(pays(i), "amount")), Theme.Body, New Rectangle(x, y, rr.Width - x, 18), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                                                Tr.DrawText(g, "(" & If(total > 0, (Js.Num(pays(i), "amount") / total * 100).ToString("0.0"), "0") & "%)", Theme.Small, New Rectangle(x, y + 17, rr.Width - x, 16), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                                            Next
                                                                        End Sub)
            card.Add(donut)
            stack.Add(card)
        End If
        If on_("rb-r-channel") Then
            Dim ch = TryCast(Js.Field(r, "channels"), JsonObject)
            Dim off = TryCast(Js.Field(ch, "offline"), JsonObject), onl = TryCast(Js.Field(ch, "online"), JsonObject)
            Dim tot = Js.Num(off, "amount") + Js.Num(onl, "amount")
            Dim card As New CardBox("Sales Channel Summary", ChrW(&HE9D2))
            Dim grid As New Columns(2, 120, 12)
            For Each c In {("In-store Sales", off, Theme.IcShop), ("Online Sales", onl, Theme.IcGlobe)}
                Dim x = c.Item2
                Dim m As New MiniStat(c.Item1, c.Item3, Theme.Blue) With {.Height = 96}
                m.SetValue(Theme.Money(Js.Num(x, "amount")), If(tot > 0, (Js.Num(x, "amount") / tot * 100).ToString("0.0"), "0.0") & "% · " & Js.Int(x, "orders") & " Orders")
                grid.Add(m)
            Next
            card.Add(grid)
            stack.Add(card)
        End If
        Dim status = Js.Objs(Js.Arr(r, "onlineStatus"))
        If on_("rb-r-online") AndAlso status.Count > 0 Then
            Dim card As New CardBox("Online Orders by Status", Theme.IcTruck)
            Dim kv As New KeyValues()
            For Each x In status : kv.Add(Js.Str(x, "status"), Js.Int(x, "count").ToString()) : Next
            card.Add(kv)
            stack.Add(card)
        End If
        Dim aging = Js.Objs(Js.Arr(r, "aging"))
        If on_("rb-r-aging") AndAlso aging.Count > 0 Then
            Dim card As New CardBox("Due Aging Summary", Theme.IcClock)
            Dim colours = {Color.FromArgb(&HDC, &H26, &H26), Color.FromArgb(&HEA, &H58, &HC), Color.FromArgb(&HCA, &H8A, 4), Theme.Primary}
            Dim kv As New KeyValues()
            For i = 0 To aging.Count - 1
                kv.Add(Js.Str(aging(i), "bucket") & "  ·  " & Js.Int(aging(i), "orders") & " Orders", Theme.Money(Js.Num(aging(i), "amount")), False, colours(i Mod 4))
            Next
            kv.Add("-", "")
            kv.Add("Total Dues", Theme.Money(aging.Sum(Function(a) Js.Num(a, "amount"))), True, Theme.Danger)
            card.Add(kv)
            stack.Add(card)
        End If
        If on_("rb-r-export") Then
            Dim card As New CardBox("Export Report", ChrW(&HE8A5))
            Dim row As New Columns(2, 100, 10)
            row.Add(Ui.Btn("PDF / Print", ChrW(&HE749), Color.FromArgb(&HDC, &H26, &H26), click:=Sub() PrintReport(r)))
            row.Add(Ui.Btn("Excel", ChrW(&HE9F9), Color.FromArgb(&H16, &HA3, &H4A), click:=Sub() ExcelReport(r)))
            card.Add(row)
            stack.Add(card)
        End If
        Return If(stack.Controls.Count = 0, Nothing, stack)
    End Function

    Private Function FileBase(r As JsonObject) As String
        Return "Report " & Js.Str(r, "rangeLabel")
    End Function

    Private Sub ExcelReport(r As JsonObject)
        Dim k = TryCast(Js.Field(r, "kpis"), JsonObject)
        Dim sheets As New List(Of Xlsx.Sheet)
        Dim s1 As New Xlsx.Sheet("Summary", {"Item", "Value"})
        s1.Add("Business", Js.Str(Js.Field(r, "business"), "name")) : s1.Add("Period", Js.Str(r, "rangeLabel"))
        For Each it In {("Total sales", "sales"), ("Orders", "orders"), ("Units sold", "units"), ("Total dues", "due"), ("Due collected", "collected"), ("New dues", "newDues"), ("Products added", "productsAdded"), ("Discount", "discount"), ("GST", "gst")}
            s1.Add(it.Item1, Js.Num(k, it.Item2))
        Next
        For Each p In Js.Objs(Js.Arr(r, "payments")) : s1.Add("Payment · " & Js.Str(p, "method"), Js.Num(p, "amount")) : Next
        sheets.Add(s1)
        Dim tl As New Xlsx.Sheet("Sales Timeline", {"Date & time", "Order", "Channel", "Status", "Customer", "Mobile", "Product", "SKU", "Qty", "Unit price", "Total", "GST", "Payment", "Due", "Sold/delivered by"})
        For Each x In Js.Objs(Js.Arr(r, "timeline"))
            tl.Add(Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "orderNumber"), If(Js.Str(x, "channel") = "online", "Online", "Store"), Js.Str(x, "status"), Js.Str(x, "customer"), Js.Str(x, "phone"), Js.Str(x, "product"), Js.Str(x, "sku"),
                   Js.Num(x, "qty"), Js.Num(x, "unitPrice"), Js.Num(x, "total"), Js.Num(x, "gst"), Js.Str(x, "payment"), If(Js.IsNull(x, "due"), Nothing, CObj(Js.Num(x, "due"))), Js.Str(x, "staff"))
        Next
        sheets.Add(tl)
        Dim pr As New Xlsx.Sheet("Products", {"Product", "SKU", "Category", "Orders", "Qty", "Revenue", "Last sold"})
        For Each x In Js.Objs(Js.Arr(r, "products")) : pr.Add(Js.Str(x, "name"), Js.Str(x, "sku"), Js.Str(x, "category"), Js.Num(x, "orders"), Js.Num(x, "qty"), Js.Num(x, "revenue"), Fmt.Stamp(Js.Time(x, "lastSoldAt"))) : Next
        sheets.Add(pr)
        Dim dw As New Xlsx.Sheet("Day-wise", {"Date", "Orders", "In-store", "Online", "Units", "Sales", "Due", "Collected"})
        For Each x In Js.Objs(Js.Arr(r, "daily")) : dw.Add(Js.Str(x, "day"), Js.Num(x, "orders"), Js.Num(x, "offline"), Js.Num(x, "online"), Js.Num(x, "units"), Js.Num(x, "sales"), Js.Num(x, "due"), Js.Num(x, "collected")) : Next
        sheets.Add(dw)
        Dim dc As New Xlsx.Sheet("Due Collections", {"Date & time", "Receipt", "Customer", "Order", "Method", "Amount", "Received by"})
        For Each x In Js.Objs(Js.Arr(r, "collections")) : dc.Add(Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "receipt"), Js.Str(x, "customer"), Js.Str(x, "orderNumber"), Js.Str(x, "method"), Js.Num(x, "amount"), Js.Str(x, "by")) : Next
        sheets.Add(dc)
        Dim nd As New Xlsx.Sheet("New Dues", {"Date & time", "Order", "Customer", "Mobile", "Amount", "Paid since", "Balance", "Promised", "Status"})
        For Each x In Js.Objs(Js.Arr(r, "newDues")) : nd.Add(Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "orderNumber"), Js.Str(x, "customer"), Js.Str(x, "phone"), Js.Num(x, "amount"), Js.Num(x, "paid"), Js.Num(x, "balance"), Fmt.Day(Js.Time(x, "promised")), Js.Str(x, "status")) : Next
        sheets.Add(nd)
        Dim pa As New Xlsx.Sheet("Products Added", {"Date & time", "Product", "SKU", "Category", "Price", "Stock", "Added by"})
        For Each x In Js.Objs(Js.Arr(r, "added")) : pa.Add(Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "name"), Js.Str(x, "sku"), Js.Str(x, "category"), Js.Num(x, "price"), If(Js.IsNull(x, "stock"), Nothing, CObj(Js.Num(x, "stock"))), Js.Str(x, "by")) : Next
        sheets.Add(pa)
        Dim ag As New Xlsx.Sheet("Deliveries", {"Agent", "Assigned", "Delivered", "Pending", "Canceled", "Delivered value", "Avg minutes"})
        For Each x In Js.Objs(Js.Arr(r, "agents")) : ag.Add(Js.Str(x, "name"), Js.Num(x, "assigned"), Js.Num(x, "delivered"), Js.Num(x, "pending"), Js.Num(x, "canceled"), Js.Num(x, "deliveredValue"), If(Js.IsNull(x, "avgMinutes"), Nothing, CObj(Js.Num(x, "avgMinutes")))) : Next
        sheets.Add(ag)
        Dim st As New Xlsx.Sheet("Staff", {"Staff", "Role", "Store sales", "Sales amount", "Collections", "Collected", "Delivered", "Products added"})
        For Each x In Js.Objs(Js.Arr(r, "staff")) : st.Add(Js.Str(x, "name"), Js.Str(x, "role"), Js.Num(x, "posSales"), Js.Num(x, "posAmount"), Js.Num(x, "collections"), Js.Num(x, "collectedAmount"), Js.Num(x, "delivered"), Js.Num(x, "productsAdded")) : Next
        sheets.Add(st)
        If Js.Arr(r, "activity").Count > 0 Then
            Dim ac As New Xlsx.Sheet("Activity", {"Date & time", "Action", "Details"})
            For Each x In Js.Objs(Js.Arr(r, "activity")) : ac.Add(Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "action"), Js.Str(x, "description")) : Next
            sheets.Add(ac)
        End If
        Xlsx.SaveAs(Me, FileBase(r), sheets)
    End Sub

    Private Sub PrintReport(r As JsonObject)
        Dim k = TryCast(Js.Field(r, "kpis"), JsonObject)
        Dim biz = TryCast(Js.Field(r, "business"), JsonObject)
        Dim secs As New List(Of ReportPrint.Section)
        Dim sum As New ReportPrint.Section With {.Heading = "Summary"}
        sum.Lines.Add(("Total sales", Theme.Money(Js.Num(k, "sales")) & "  (" & Js.Int(k, "orders") & " orders)"))
        sum.Lines.Add(("Products sold", Js.Int(k, "units") & " units"))
        sum.Lines.Add(("Total dues", Theme.Money(Js.Num(k, "due"))))
        sum.Lines.Add(("Due collected", Theme.Money(Js.Num(k, "collected"))))
        sum.Lines.Add(("Discount given", Theme.Money(Js.Num(k, "discount"))))
        sum.Lines.Add(("GST collected", Theme.Money(Js.Num(k, "gst"))))
        For Each p In Js.Objs(Js.Arr(r, "payments")) : sum.Lines.Add(("Paid by " & Js.Str(p, "method"), Theme.Money(Js.Num(p, "amount")))) : Next
        secs.Add(sum)
        Dim add = Sub(title As String, head As String(), right As Integer(), rows As IEnumerable(Of String()), weights As Single())
                      Dim s As New ReportPrint.Section With {.Heading = title}
                      s.Head.AddRange(head)
                      For Each i In right : s.Right.Add(i) : Next
                      s.Rows.AddRange(rows)
                      s.Weights.AddRange(weights)
                      secs.Add(s)
                  End Sub
        add("Product-wise Sales Timeline", {"Time", "Order", "Customer", "Product", "Qty", "Total", "Payment"}, {4, 5},
            Js.Objs(Js.Arr(r, "timeline")).Select(Function(x) {Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "orderNumber"), Js.Str(x, "customer"), Js.Str(x, "product"), Fmt.Num(Js.Num(x, "qty")), Theme.Money(Js.Num(x, "total")), Js.Str(x, "payment")}),
            {1.4F, 1.1F, 1.3F, 1.8F, 0.5F, 1, 0.9F})
        add("Product Summary", {"Product", "SKU", "Qty sold", "Revenue"}, {2, 3}, Js.Objs(Js.Arr(r, "products")).Select(Function(x) {Js.Str(x, "name"), Js.Str(x, "sku"), Fmt.Num(Js.Num(x, "qty")), Theme.Money(Js.Num(x, "revenue"))}), {3, 1, 1, 1})
        If Js.Arr(r, "daily").Count > 1 Then add("Day-wise Summary", {"Date", "Orders", "Sales", "Due", "Collected"}, {1, 2, 3, 4}, Js.Objs(Js.Arr(r, "daily")).Select(Function(x) {Js.Str(x, "day"), Js.Str(x, "orders"), Theme.Money(Js.Num(x, "sales")), Theme.Money(Js.Num(x, "due")), Theme.Money(Js.Num(x, "collected"))}), {1, 1, 1, 1, 1})
        If Js.Arr(r, "collections").Count > 0 Then add("Due Collections", {"Time", "Receipt", "Customer", "Method", "Amount"}, {4}, Js.Objs(Js.Arr(r, "collections")).Select(Function(x) {Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "receipt"), Js.Str(x, "customer"), Js.Str(x, "method"), Theme.Money(Js.Num(x, "amount"))}), {1.4F, 1, 1.4F, 0.8F, 1})
        If Js.Arr(r, "newDues").Count > 0 Then add("New Dues", {"Time", "Order", "Customer", "Amount", "Balance"}, {3, 4}, Js.Objs(Js.Arr(r, "newDues")).Select(Function(x) {Fmt.Stamp(Js.Time(x, "at")), Js.Str(x, "orderNumber"), Js.Str(x, "customer"), Theme.Money(Js.Num(x, "amount")), Theme.Money(Js.Num(x, "balance"))}), {1.4F, 1, 1.4F, 1, 1})
        Dim phones = String.Join(", ", Js.Arr(biz, "phones").Select(Function(p) Js.Text(p)))
        ReportPrint.Print(Me, Js.Str(biz, "name") & " — " & If(Js.Field(r, "selectedUser") IsNot Nothing, "Staff Report · " & Js.Str(Js.Field(r, "selectedUser"), "name"), "Sales Report"), Js.Str(r, "rangeLabel"),
                          {Js.Str(biz, "address"), If(phones <> "", "Mobile: " & phones, ""), If(Js.Str(biz, "gstin") <> "", "GSTIN: " & Js.Str(biz, "gstin"), ""), "Generated on " & Fmt.Stamp(Js.Time(r, "generatedAt"))}.Where(Function(x) x <> ""), secs)
    End Sub
End Class
