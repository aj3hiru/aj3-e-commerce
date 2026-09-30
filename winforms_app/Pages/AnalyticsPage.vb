Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Analytics" as on the website: Today / 7 Days / 30 Days / This Year or any dates, All / Online /
''' In-store, compare with the previous period; Gross / Net sales, Orders, Avg order (change + trend line),
''' Revenue &amp; Orders chart (daily / weekly), Sales by Payment Method, Top Products, the insight card,
''' New vs Returning, Revenue by Category. From the orders on this computer — offline too.</summary>
Public Class AnalyticsPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_analytics2_display")
    Private ReadOnly _range As New RangeBar("today,7d,30d,this_year,custom", "30d")
    Private ReadOnly _type As New Tabs("all|All orders", "online|Online", "offline|In-store")
    Private ReadOnly _compare As New Switch("Compare with the previous period", True)
    Private ReadOnly _grain As ComboBox = Ui.Filter({"daily|Daily", "weekly|Weekly"}, 110)

    Public Overrides ReadOnly Property PageTitle As String = "Analytics"
    Public Overrides ReadOnly Property PageSubtitle As String = "Sales performance from real orders"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New()
        AddHandler _range.Changed, Sub() Refresh_()
        AddHandler _type.Changed, Sub() Refresh_()
        AddHandler _compare.Toggled, Sub() Refresh_()
        AddHandler _grain.SelectedIndexChanged, Sub() Refresh_()
        AddHandler _display.Changed, Sub() Refresh_()
    End Sub

    Private Shared ReadOnly PayColors As New Dictionary(Of String, Color) From {{"UPI", Theme.Primary}, {"Card", Theme.Blue}, {"Cash", Color.FromArgb(&H16, &HA3, &H4A)}, {"Split", Color.FromArgb(&HF5, &H9E, &HB)}, {"Other", Theme.G500}}

    Private Shared Function PayColor(m As String) As Color
        Dim c As Color
        Return If(PayColors.TryGetValue(m, c), c, Color.FromArgb(&H94, &HA3, &HB8))
    End Function

    Protected Overrides Sub Reload()
        ClearBody(_range, _type, _compare, _grain)
        Dim s = AppState.I
        Dim w = Function(k As String) _display.IsOn("a2-widgets", k)
        Dim type = _type.Current
        Dim all = s.AllOrders().Where(Function(o) Js.Str(o, "status") <> "Canceled" AndAlso (type = "all" OrElse Js.Str(o, "type") = type)).ToList()
        Dim bnds = _range.Bounds_()
        Dim from = If(bnds.Item1, DateTime.Today.AddDays(-29)), [to] = If(bnds.Item2, DateTime.Today)
        Dim cur = all.Where(Function(o) _range.Contains(Js.Time(o, "createdAt"))).ToList()
        Dim pr = _range.Previous()
        Dim prev = all.Where(Function(o)
                                 Dim t = Js.Time(o, "createdAt")
                                 Return t.HasValue AndAlso pr.Item1.HasValue AndAlso t.Value.Date >= pr.Item1.Value AndAlso t.Value.Date <= pr.Item2.Value
                             End Function).ToList()
        Dim net = Function(l As List(Of JsonObject)) l.Sum(Function(o) Js.Num(o, "total"))
        Dim gross = Function(l As List(Of JsonObject)) l.Sum(Function(o) Js.Num(o, "subtotal") + Js.Num(o, "gst"))
        Dim aov = Function(l As List(Of JsonObject)) If(l.Count = 0, 0, net(l) / l.Count)
        Dim delta = Function(now As Double, before As Double) As Double?
                        If before > 0 Then Return (now - before) * 100 / before
                        Return If(now > 0, CType(Nothing, Double?), 0)
                    End Function

        ' series
        Dim days = CInt(([to] - from).TotalDays) + 1
        Dim weekly = Ui.Val(_grain) = "weekly"
        Dim buckets = If(weekly, Math.Max(1, Math.Min(60, CInt(Math.Ceiling(days / 7.0)))), Math.Max(1, Math.Min(400, days)))
        Dim rev(buckets - 1) As Double, ord(buckets - 1) As Integer
        For Each o In cur
            Dim t = Js.Time(o, "createdAt").Value.Date
            Dim i = CInt((t - from).TotalDays)
            If weekly Then i \= 7
            If i >= 0 AndAlso i < buckets Then rev(i) += Js.Num(o, "total") : ord(i) += 1
        Next
        Dim bucketLabel = Function(i As Integer) from.AddDays(If(weekly, i * 7, i)).ToString("d MMM")

        ' filters bar
        Dim bar As New CardBox(Nothing, "", 12)
        bar.Add(_range)
        Dim row As New HRow(14)
        _type.Width = 330 : _type.Height = 40
        row.Add(_type)
        _compare.Top = 8
        row.Add(_compare)
        bar.Add(row)
        Body.Add(bar)

        ' cards
        If _display.IsOn("a2-cards") Then
            Dim cards As New Columns(4, 230, 14)
            Dim card = Sub(key As String, glyph As String, colour As Color, label As String, value As String, d As Double?, line As IEnumerable(Of Double))
                           If Not _display.IsOn("a2-cards", key) Then Return
                           Dim pts = line.ToList()
                           cards.Add(New CardBox(Nothing, "", 14) With {.Height = 96}).Add(New Drawn(66, Sub(g, r)
                                                                                                             Using p = Theme.RoundRect(New RectangleF(0, 8, 42, 42), 10)
                                                                                                                 Using br As New SolidBrush(Theme.Tint(colour, 28)) : g.FillPath(br, p) : End Using
                                                                                                             End Using
                                                                                                             Using f = Theme.IconFont(13) : Theme.DrawCentered(g, glyph, f, colour, New Rectangle(0, 8, 42, 42)) : End Using
                                                                                                             Tr.DrawText(g, label, Theme.Body, New Point(54, 0), Theme.G600, TextFormatFlags.NoPadding)
                                                                                                             Tr.DrawText(g, value, Theme.UiFont(14.0F, FontStyle.Bold), New Point(53, 18), Theme.G900, TextFormatFlags.NoPadding)
                                                                                                             If _compare.Checked Then
                                                                                                                 Dim up = If(d, 1) >= 0
                                                                                                                 Dim txt = If(up, "↗ ", "↘ ") & If(d.HasValue, Math.Abs(d.Value).ToString("0.0") & "%", "New")
                                                                                                                 Dim c = If(up, Color.FromArgb(5, &H96, &H69), Color.FromArgb(&HDC, &H26, &H26))
                                                                                                                 Tr.DrawText(g, txt, Theme.UiFont(8.25F, FontStyle.Bold), New Point(54, 46), c, TextFormatFlags.NoPadding)
                                                                                                                 Tr.DrawText(g, "vs previous period", Theme.Small, New Point(54 + Tr.MeasureText(txt, Theme.UiFont(8.25F, FontStyle.Bold)).Width + 6, 46), Theme.G500, TextFormatFlags.NoPadding)
                                                                                                             End If
                                                                                                             Spark(g, New Rectangle(r.Right - 84, 14, 80, 30), pts, colour)
                                                                                                         End Sub))
                       End Sub
            card("a2-k-gross", Theme.IcMoney, Theme.Primary, "Gross Sales", Theme.Money(gross(cur)), delta(gross(cur), gross(prev)), rev)
            card("a2-k-net", ChrW(&HE8C7), Color.FromArgb(5, &H96, &H69), "Net Sales", Theme.Money(net(cur)), delta(net(cur), net(prev)), rev)
            card("a2-k-orders", Theme.IcCart, Theme.Blue, "Orders", cur.Count.ToString(), delta(cur.Count, prev.Count), ord.Select(Function(x) CDbl(x)))
            card("a2-k-aov", ChrW(&HE9F9), Color.FromArgb(&HD9, &H77, 6), "Avg Order Value", Theme.Money(aov(cur)), delta(aov(cur), aov(prev)), rev)
            If cards.Controls.Count > 0 Then cards.Count = cards.Controls.Count : Body.Add(cards)
        End If

        ' chart
        If w("a2-chart") Then
            Dim card As New CardBox("Revenue & Orders Overview")
            card.Tools.Add(_grain)
            Dim chart As New LineChart() With {.Height = 250, .LineColor = Theme.Primary, .Color2 = Color.FromArgb(&HE, &HA5, &HE9)}
            Dim maxRev = If(rev.Length = 0, 0, rev.Max()), maxOrd = If(ord.Length = 0, 0, ord.Max())
            Dim revTop = If(maxRev <= 0, 1000.0, maxRev), ordTop = Math.Max(1.0, maxOrd)
            chart.Values = rev.ToList()
            chart.Values2 = ord.Select(Function(x) x / ordTop * revTop).ToList()
            Dim stepN = Math.Max(1, CInt(Math.Ceiling(buckets / 8.0)))
            chart.Labels = Enumerable.Range(0, buckets).Select(Function(i) If(i Mod stepN = 0, bucketLabel(i), "")).ToList()
            chart.TipAt = Function(i) bucketLabel(i) & " · " & Theme.Money(rev(i)) & " · " & ord(i) & " orders"
            card.Subtitle = "● Revenue (purple)    ● Orders (blue)"
            If cur.Count = 0 Then card.Add(New TextBlock("No sales in this period", Theme.Body, Theme.G400) With {.Center = True}) Else card.Add(chart)
            Body.Add(card)
        End If

        If Not _display.IsOn("a2-widgets") Then Return
        ' payments (Split broken into its parts)
        Dim pay As New Dictionary(Of String, Double)
        For Each o In cur
            Dim parts = Js.Objs(Js.Arr(o, "pays"))
            If Js.Str(o, "paymentMethod") = "Split" AndAlso parts.Count > 0 Then
                For Each p In parts
                    Dim m = Js.Str(p, "method", "Other")
                    pay(m) = If(pay.ContainsKey(m), pay(m), 0) + Js.Num(p, "amount")
                Next
            Else
                Dim m = Js.Str(o, "paymentMethod", "Other")
                If m = "" Then m = "Other"
                pay(m) = If(pay.ContainsKey(m), pay(m), 0) + Js.Num(o, "total")
            End If
        Next
        Dim payRows = pay.OrderByDescending(Function(kv) kv.Value).ToList()
        Dim payGrand = payRows.Sum(Function(kv) kv.Value)
        Dim products = s.List("products").GroupBy(Function(p) Js.Int(p, "id")).ToDictionary(Function(g) g.Key, Function(g) g.First())
        Dim cats = s.List("categories").GroupBy(Function(c) Js.Int(c, "id")).ToDictionary(Function(g) g.Key, Function(g) Js.Str(g.First(), "name"))
        Dim byProduct As New Dictionary(Of Integer, (Name As String, Qty As Double, Revenue As Double))
        Dim byCat As New Dictionary(Of Integer, Double) ' -1 = uncategorized
        For Each o In cur
            For Each i In Js.Objs(Js.Arr(o, "items"))
                Dim id = Js.Int(i, "productId")
                Dim line = Js.Num(i, "price") * Js.Num(i, "qty")
                Dim c As (String, Double, Double) = Nothing
                If Not byProduct.TryGetValue(id, c) Then c = (Js.Str(i, "name"), 0, 0)
                byProduct(id) = (c.Item1, c.Item2 + Js.Num(i, "qty"), c.Item3 + line)
                Dim p As JsonObject = Nothing
                Dim cat = If(products.TryGetValue(id, p) AndAlso Not Js.IsNull(p, "categoryId"), Js.Int(p, "categoryId"), -1)
                byCat(cat) = If(byCat.ContainsKey(cat), byCat(cat), 0) + line
            Next
        Next
        Dim top = byProduct.OrderByDescending(Function(kv) kv.Value.Revenue).Take(6).ToList()
        Dim catRows = byCat.OrderByDescending(Function(kv) kv.Value).Take(6).ToList()
        Dim since = s.List("customers").GroupBy(Function(c) Js.Int(c, "id")).ToDictionary(Function(g) g.Key, Function(g) Js.Time(g.First(), "since"))
        Dim buyers = cur.Where(Function(o) Not Js.IsNull(o, "customerId")).Select(Function(o) Js.Int(o, "customerId")).Distinct().ToList()
        Dim newC = buyers.Where(Function(id) since.ContainsKey(id) AndAlso _range.Contains(since(id))).Count()
        Dim retC = buyers.Count - newC

        Dim left As New VStack(16), right As New VStack(16)
        If w("a2-payment") Then
            Dim card As New CardBox("Sales by Payment Method")
            If payRows.Count = 0 Then
                card.Add(New TextBlock("No paid orders in this period.", Theme.Body, Theme.G400) With {.Center = True})
            Else
                card.Add(New Drawn(Math.Max(170, 40 + payRows.Count * 34), Sub(g, r)
                                                                              Dim box As New Rectangle(4, 4, 160, 160)
                                                                              Dim a = -90.0F
                                                                              For Each kv In payRows
                                                                                  Dim sweep = CSng(kv.Value / Math.Max(0.01, payGrand) * 360)
                                                                                  Using pen As New Pen(PayColor(kv.Key), 16) : g.DrawArc(pen, box.X + 8, box.Y + 8, box.Width - 16, box.Height - 16, a, sweep) : End Using
                                                                                  a += sweep
                                                                              Next
                                                                              Tr.DrawText(g, Theme.Money(payGrand), Theme.BodyBold, New Rectangle(box.X, box.Y + 62, box.Width, 20), Theme.G900, TextFormatFlags.HorizontalCenter)
                                                                              Tr.DrawText(g, "Net Sales", Theme.Small, New Rectangle(box.X, box.Y + 82, box.Width, 16), Theme.G500, TextFormatFlags.HorizontalCenter)
                                                                              Dim x = 190, cw = (r.Width - x) \ 3
                                                                              Tr.DrawText(g, "METHOD", Theme.Small, New Point(x, 6), Theme.G400, TextFormatFlags.NoPadding)
                                                                              Tr.DrawText(g, "AMOUNT", Theme.Small, New Point(x + cw, 6), Theme.G400, TextFormatFlags.NoPadding)
                                                                              Tr.DrawText(g, "% SHARE", Theme.Small, New Rectangle(x, 6, r.Width - x, 16), Theme.G400, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                                              Dim y = 28
                                                                              For Each kv In payRows
                                                                                  Using p As New Pen(Theme.G100) : g.DrawLine(p, x, y, r.Width, y) : End Using
                                                                                  Using br As New SolidBrush(PayColor(kv.Key)) : g.FillEllipse(br, x, y + 11, 10, 10) : End Using
                                                                                  Tr.DrawText(g, If(kv.Key = "Split", "Split Payment", kv.Key), Theme.Body, New Point(x + 16, y + 8), Theme.G800, TextFormatFlags.NoPadding)
                                                                                  Tr.DrawText(g, Theme.Money(kv.Value), Theme.Body, New Point(x + cw, y + 8), Theme.G700, TextFormatFlags.NoPadding)
                                                                                  Tr.DrawText(g, (Math.Round(kv.Value * 1000 / Math.Max(0.01, payGrand)) / 10) & "%", Theme.BodyBold, New Rectangle(x, y + 8, r.Width - x, 18), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                                                  y += 34
                                                                              Next
                                                                              Using p As New Pen(Theme.G200) : g.DrawLine(p, x, y, r.Width, y) : End Using
                                                                              Tr.DrawText(g, "Total", Theme.BodyBold, New Point(x, y + 8), Theme.G900, TextFormatFlags.NoPadding)
                                                                              Tr.DrawText(g, Theme.Money(payGrand), Theme.BodyBold, New Point(x + cw, y + 8), Theme.G900, TextFormatFlags.NoPadding)
                                                                              Tr.DrawText(g, "100%", Theme.BodyBold, New Rectangle(x, y + 8, r.Width - x, 18), Theme.G900, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                                          End Sub))
            End If
            left.Add(card)
        End If
        If w("a2-top") Then
            Dim card As New CardBox("Top Products")
            card.Tools.Add(Ui.Btn("View All Products ›", "", outline:=True, click:=Sub() Main?.Pick("/admin/ecommerce/products")))
            Dim t As New WebTable() With {.RowHeight = 52, .EmptyText = "No sales in this period."}
            t.Cols.Add(New TCol("Product", Function(x) Js.Str(x, "name"), 0, CellKind.Thumb) With {.Flex = 24, .Picture = Function(x) Js.Str(x, "image")})
            t.Cols.Add(New TCol("Units Sold", Function(x) Fmt.Num(Js.Num(x, "qty")), 0) With {.Flex = 8, .Colour = Function(x) Theme.G600})
            t.Cols.Add(New TCol("Revenue", Function(x) Theme.Money(Js.Num(x, "revenue")), 0, CellKind.Money) With {.Flex = 10, .Right = True})
            t.Rows = top.Select(Function(kv)
                                    Dim p As JsonObject = Nothing
                                    products.TryGetValue(kv.Key, p)
                                    Return Js.Obj("id", kv.Key, "name", kv.Value.Name, "qty", kv.Value.Qty, "revenue", kv.Value.Revenue, "image", Js.Str(p, "image"))
                                End Function).ToList()
            card.Add(t)
            left.Add(card)
        End If
        If w("a2-insight") AndAlso _compare.Checked Then
            Dim d = delta(net(cur), net(prev))
            Dim up = If(d, 1) > 0, down = d.HasValue AndAlso d.Value < 0
            Dim card As New CardBox(Nothing, "", 16)
            card.Add(New Drawn(150, Sub(g, r)
                                        Dim cx = r.Width \ 2
                                        Using br As New SolidBrush(If(up, Color.FromArgb(&HD1, &HFA, &HE5), Color.FromArgb(&HFE, &HE2, &HE2))) : g.FillEllipse(br, cx - 20, 0, 40, 40) : End Using
                                        Using f = Theme.IconFont(13) : Theme.DrawCentered(g, If(up, ChrW(&HE70E), Theme.IcChevronDown), f, If(up, Color.FromArgb(5, &H96, &H69), Theme.Danger), New Rectangle(cx - 20, 0, 40, 40)) : End Using
                                        Tr.DrawText(g, If(up, "Great job! Your revenue is up", If(down, "Your revenue is down", "Revenue is steady")), Theme.BodyBold, New Rectangle(0, 46, r.Width, 20), Theme.G900, TextFormatFlags.HorizontalCenter)
                                        If d.HasValue Then Tr.DrawText(g, Math.Abs(d.Value).ToString("0.0") & "%", Theme.UiFont(17.0F, FontStyle.Bold), New Rectangle(0, 66, r.Width, 32), If(up, Color.FromArgb(5, &H96, &H69), Theme.Danger), TextFormatFlags.HorizontalCenter)
                                        Tr.DrawText(g, "vs previous period", Theme.Small, New Rectangle(0, 100, r.Width, 16), Theme.G500, TextFormatFlags.HorizontalCenter)
                                        Spark(g, New Rectangle(cx - 40, 118, 80, 28), rev.ToList(), If(up, Color.FromArgb(&H10, &HB9, &H81), Color.FromArgb(&HEF, &H44, &H44)))
                                    End Sub))
            right.Add(card)
        End If
        If w("a2-customers") Then
            Dim card As New CardBox("New vs Returning Customers", Theme.IcPeople) With {.Accent = Theme.G400}
            card.Add(New Drawn(110, Sub(g, r)
                                        Dim bw = (r.Width - 12) \ 2
                                        For Each it In {(0, "New", newC, Theme.Primary, Color.FromArgb(&HF5, &HF3, &HFF)), (1, "Returning", retC, Theme.Blue, Fmt.BlueSoft)}
                                            Dim br As New Rectangle(it.Item1 * (bw + 12), 0, bw, 84)
                                            Using p = Theme.RoundRect(New RectangleF(br.X, br.Y, br.Width, br.Height), 8)
                                                Using b As New SolidBrush(it.Item5) : g.FillPath(b, p) : End Using
                                            End Using
                                            Using f = Theme.IconFont(12) : Theme.DrawCentered(g, If(it.Item1 = 0, Theme.IcAddUser, Theme.IcPeople), f, it.Item4, New Rectangle(br.X, br.Y + 8, br.Width, 20)) : End Using
                                            Tr.DrawText(g, it.Item3.ToString(), Theme.UiFont(14.0F, FontStyle.Bold), New Rectangle(br.X, br.Y + 30, br.Width, 28), Theme.G900, TextFormatFlags.HorizontalCenter)
                                            Tr.DrawText(g, it.Item2, Theme.Small, New Rectangle(br.X, br.Y + 60, br.Width, 16), Theme.G600, TextFormatFlags.HorizontalCenter)
                                        Next
                                        If newC + retC > 0 Then
                                            Using p = Theme.RoundRect(New RectangleF(0, 94, r.Width, 8), 4)
                                                Using b As New SolidBrush(Theme.G100) : g.FillPath(b, p) : End Using
                                            End Using
                                            Using p = Theme.RoundRect(New RectangleF(0, 94, CSng(r.Width * newC / (newC + retC)), 8), 4)
                                                Using b As New SolidBrush(Color.FromArgb(&H8B, &H5C, &HF6)) : g.FillPath(b, p) : End Using
                                            End Using
                                        End If
                                    End Sub))
            right.Add(card)
        End If
        If w("a2-category") Then
            Dim card As New CardBox("Revenue by Category")
            Dim colours = {Theme.Primary, Theme.Blue, Color.FromArgb(&H16, &HA3, &H4A), Color.FromArgb(&HF5, &H9E, &HB), Color.FromArgb(&HEF, &H44, &H44), Color.FromArgb(8, &H91, &HB2)}
            If catRows.Count = 0 Then
                card.Add(New TextBlock("No sales in this period.", Theme.Body, Theme.G400) With {.Center = True})
            Else
                Dim max = Math.Max(1.0, catRows.Max(Function(kv) kv.Value))
                card.Add(New Drawn(catRows.Count * 44, Sub(g, r)
                                                           For i = 0 To catRows.Count - 1
                                                               Dim kv = catRows(i)
                                                               Dim y = i * 44
                                                               Dim name As String = Nothing
                                                               If kv.Key = -1 OrElse Not cats.TryGetValue(kv.Key, name) Then name = If(kv.Key = -1, "Uncategorized", "—")
                                                               Tr.DrawText(g, name, Theme.Body, New Point(0, y), Theme.G800, TextFormatFlags.NoPadding)
                                                               Tr.DrawText(g, Theme.Money(kv.Value), Theme.Body, New Rectangle(0, y, r.Width, 18), Theme.G500, TextFormatFlags.Right Or TextFormatFlags.NoPadding)
                                                               Using p = Theme.RoundRect(New RectangleF(0, y + 22, r.Width, 8), 4)
                                                                   Using b As New SolidBrush(Theme.G100) : g.FillPath(b, p) : End Using
                                                               End Using
                                                               Using p = Theme.RoundRect(New RectangleF(0, y + 22, CSng(r.Width * Math.Max(0.03, kv.Value / max)), 8), 4)
                                                                   Using b As New SolidBrush(colours(i Mod colours.Length)) : g.FillPath(b, p) : End Using
                                                               End Using
                                                           Next
                                                       End Sub))
            End If
            right.Add(card)
        End If
        Dim cols As New Columns(2, 400, 16) With {.Weights = {2, 1}, .Stretch = False}
        If left.Controls.Count > 0 Then cols.Add(left)
        If right.Controls.Count > 0 Then cols.Add(right)
        If cols.Controls.Count > 0 Then
            cols.Count = cols.Controls.Count
            If cols.Count = 1 Then cols.Weights = Nothing
            Body.Add(cols)
        End If
        Body.Add(New TextBlock("Showing data for " & _range.Text_ & ". Figures are computed from real orders — no visit/page-view tracking exists yet, so top-of-funnel metrics (visits, product views, add-to-cart) aren't shown.", Theme.Small, Theme.G400) With {.Center = True})
    End Sub

    Private Shared Sub Spark(g As Graphics, r As Rectangle, v As List(Of Double), c As Color)
        If v.Count < 2 Then Return
        Dim max = Math.Max(0.0001, v.Max()), min = v.Min()
        Dim pts = v.Select(Function(x, i) New PointF(CSng(r.X + r.Width * i / (v.Count - 1)), CSng(r.Bottom - (x - min) / Math.Max(0.0001, max - min) * r.Height))).ToArray()
        Theme.Smooth(g)
        Using p As New Pen(c, 2) : g.DrawLines(p, pts) : End Using
    End Sub
End Class
