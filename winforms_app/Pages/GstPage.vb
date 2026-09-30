Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"GST Report": tax on sales by rate, HSN, product and invoice — this month, last month, this
''' quarter, this financial year or any dates; store / online. From the sales on this computer (15 months).</summary>
Public Class GstPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("app_gst_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export sheet", ChrW(&HE9F9), outline:=True)
    Private ReadOnly _print As WButton = Ui.Btn("Print / PDF", Theme.IcPrint, outline:=True)
    Private ReadOnly _period As New Tabs("month|This month", "prev|Last month", "quarter|This quarter", "year|This financial year", "custom|Custom dates…")
    Private ReadOnly _channel As New Tabs("all|All sales", "offline|Store", "online|Online")
    Private ReadOnly _tabs As New Tabs("rate|Rate-wise", "hsn|HSN-wise", "product|Product-wise", "invoice|Invoice-wise")
    Private _from As DateTime, _to As DateTime
    Private _head As New List(Of String)
    Private _rows As New List(Of List(Of Object))

    Public Overrides ReadOnly Property PageTitle As String = "GST Report"
    Public Overrides ReadOnly Property PageSubtitle As String = "Tax on your sales — by rate, HSN, product and invoice"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _print, _export}
        End Get
    End Property

    Public Sub New()
        SetPeriod("month")
        AddHandler _period.Changed, Sub()
                                        If _period.Current = "custom" Then
                                            Dim r = Dialogs.PickRange(FindForm(), _from, _to)
                                            If r.HasValue Then _from = r.Value.Item1 : _to = r.Value.Item2
                                        Else
                                            SetPeriod(_period.Current)
                                        End If
                                        Refresh_()
                                    End Sub
        AddHandler _channel.Changed, Sub() Refresh_()
        AddHandler _tabs.Changed, Sub() Refresh_()
        AddHandler _display.Changed, Sub() Refresh_()
        AddHandler _export.Click, Sub()
                                      Export.Csv(Me, "GST " & _tabs.Current.ToUpperInvariant() & " " & _from.ToString("d MMM yyyy") & " - " & _to.ToString("d MMM yyyy"), _head, _rows.Select(Function(r) CType(r, IEnumerable(Of Object))))
                                  End Sub
        AddHandler _print.Click, Sub() PrintIt()
    End Sub

    Private Sub SetPeriod(p As String)
        Dim t = DateTime.Today
        Dim fy = If(t.Month >= 4, t.Year, t.Year - 1)
        Select Case p
            Case "month" : _from = New DateTime(t.Year, t.Month, 1) : _to = _from.AddMonths(1).AddDays(-1)
            Case "prev" : _from = New DateTime(t.Year, t.Month, 1).AddMonths(-1) : _to = _from.AddMonths(1).AddDays(-1)
            Case "quarter"
                Dim idx = ((t.Month - 4 + 12) Mod 12) \ 3
                Dim startMonth = New DateTime(fy, 4, 1).AddMonths(idx * 3)
                _from = startMonth : _to = startMonth.AddMonths(3).AddDays(-1)
            Case "year" : _from = New DateTime(fy, 4, 1) : _to = New DateTime(fy + 1, 3, 31)
        End Select
    End Sub

    Protected Overrides Sub Reload()
        ClearBody(_period, _channel, _tabs)
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)
        Dim s = AppState.I
        Dim products = s.List("products").GroupBy(Function(p) Js.Int(p, "id")).ToDictionary(Function(g) g.Key, Function(g) g.First())
        Dim ch = _channel.Current
        Dim orders = s.AllOrders().Where(Function(o)
                                              Dim t = Js.Time(o, "createdAt")
                                              Return AppState.IsSale(o) AndAlso (ch = "all" OrElse Js.Str(o, "type") = ch) AndAlso t.HasValue AndAlso t.Value.Date >= _from AndAlso t.Value.Date <= _to
                                          End Function).OrderBy(Function(o) Js.Str(o, "createdAt")).ToList()
        Dim byRate As New SortedDictionary(Of Double, Double())
        Dim byHsn As New SortedDictionary(Of String, Double())
        Dim hsnName As New Dictionary(Of String, String)
        Dim byProduct As New Dictionary(Of String, Double())
        Dim invoices As New List(Of List(Of Object))
        Dim tTax = 0.0, tTaxable = 0.0
        For Each o In orders
            Dim oTaxable = 0.0, oTax = 0.0
            Dim items = Js.Objs(Js.Arr(o, "items"))
            Dim subT = items.Sum(Function(i) Js.Num(i, "price") * Js.Num(i, "qty"))
            Dim disc = Js.Num(o, "discount")
            For Each i In items
                Dim rate = Js.Num(i, "gstRate"), tax = Js.Num(i, "gst")
                Dim line = Js.Num(i, "price") * Js.Num(i, "qty")
                Dim taxable = If(rate > 0 AndAlso tax > 0, tax * 100 / rate, If(subT > 0, line - disc * line / subT, line))
                oTaxable += taxable : oTax += tax
                If Not byRate.ContainsKey(rate) Then byRate(rate) = {0, 0, 0}
                byRate(rate)(0) += taxable : byRate(rate)(1) += tax : byRate(rate)(2) += taxable + tax
                Dim p As JsonObject = Nothing
                products.TryGetValue(Js.Int(i, "productId"), p)
                Dim hsn = Js.Str(p, "hsn").Trim()
                Dim hk = If(hsn = "", "—", hsn) & " @ " & rate.ToString("0.#") & "%"
                If Not hsnName.ContainsKey(hk) Then hsnName(hk) = Js.Str(i, "name")
                If Not byHsn.ContainsKey(hk) Then byHsn(hk) = {0, 0, 0}
                byHsn(hk)(0) += Js.Num(i, "qty") : byHsn(hk)(1) += taxable : byHsn(hk)(2) += tax
                Dim pn = Js.Str(i, "name")
                If Not byProduct.ContainsKey(pn) Then byProduct(pn) = {0, 0, 0}
                byProduct(pn)(0) += Js.Num(i, "qty") : byProduct(pn)(1) += taxable : byProduct(pn)(2) += tax
            Next
            tTax += oTax : tTaxable += oTaxable
            invoices.Add(New List(Of Object) From {Js.Str(o, "number"), Fmt.Day(Js.Time(o, "createdAt")), Js.Str(o, "customer", "Walk-in"), If(Js.Str(o, "type") = "online", "Online", "Store"), Math.Round(oTaxable, 2), Math.Round(oTax / 2, 2), Math.Round(oTax / 2, 2), Math.Round(oTaxable + oTax, 2)})
        Next
        Dim r2 = Function(v As Double) CObj(Math.Round(v, 2))
        Select Case _tabs.Current
            Case "rate"
                _head = New List(Of String) From {"GST %", "Taxable", "CGST", "SGST", "Total tax", "Value"}
                _rows = byRate.Select(Function(e) New List(Of Object) From {e.Key & "%", r2(e.Value(0)), r2(e.Value(1) / 2), r2(e.Value(1) / 2), r2(e.Value(1)), r2(e.Value(2))}).ToList()
            Case "hsn"
                _head = New List(Of String) From {"HSN", "Description", "Qty", "Taxable", "CGST", "SGST"}
                _rows = byHsn.Select(Function(e) New List(Of Object) From {e.Key, hsnName(e.Key), r2(e.Value(0)), r2(e.Value(1)), r2(e.Value(2) / 2), r2(e.Value(2) / 2)}).ToList()
            Case "product"
                _head = New List(Of String) From {"Product", "Qty", "Taxable", "GST", "Value"}
                _rows = byProduct.OrderByDescending(Function(e) e.Value(1)).Select(Function(e) New List(Of Object) From {e.Key, r2(e.Value(0)), r2(e.Value(1)), r2(e.Value(2)), r2(e.Value(1) + e.Value(2))}).ToList()
            Case Else
                _head = New List(Of String) From {"Invoice", "Date", "Customer", "Sale", "Taxable", "CGST", "SGST", "Value"}
                _rows = invoices.AsEnumerable().Reverse().ToList()
        End Select

        Dim bar As New CardBox(Nothing, "", 12)
        _period.Items.RemoveAll(Function(x) x.Key = "custom")
        _period.Items.Add(("custom", If(_period.Current = "custom", _from.ToString("d MMM") & " – " & _to.ToString("d MMM yyyy"), "Custom dates…")))
        If on_("gst-filters", "gst-f-period") Then bar.Add(_period)
        If on_("gst-filters", "gst-f-channel") Then bar.Add(_channel)
        If on_("gst-filters", "gst-f-dates") Then bar.Add(New TextBlock(_from.ToString("d MMM yyyy") & " – " & _to.ToString("d MMM yyyy"), Theme.Body, Theme.G500))
        If bar.Body.Controls.Count > 0 AndAlso _display.IsOn("gst-filters") Then Body.Add(bar)
        _period.Invalidate() : _channel.Invalidate()

        If _display.IsOn("gst-cards") Then
            Dim cards As New Columns(4, 200, 14)
            Dim card = Sub(key As String, caption As String, glyph As String, colour As Color, value As String, note As String)
                           If Not on_("gst-cards", key) Then Return
                           Dim m As New MiniStat(caption, glyph, colour) With {.Height = 92}
                           m.SetValue(value, note)
                           cards.Add(m)
                       End Sub
            card("gst-k-invoices", "Invoices", ChrW(&HE9F9), Theme.Blue, orders.Count.ToString(), "")
            card("gst-k-taxable", "Taxable value", Theme.IcMoney, Color.FromArgb(&H16, &HA3, &H4A), Theme.Money(tTaxable), "")
            card("gst-k-gst", "Total GST", ChrW(&HE8C1), Theme.Primary, Theme.Money(tTax), "CGST " & Theme.Money(tTax / 2) & " + SGST " & Theme.Money(tTax / 2))
            card("gst-k-value", "Invoice value", ChrW(&HE8C7), Color.FromArgb(&HD9, &H77, 6), Theme.Money(tTaxable + tTax), "")
            If cards.Controls.Count > 0 Then cards.Count = cards.Controls.Count : Body.Add(cards)
        End If

        Dim card2 As New CardBox(Nothing, "", 12)
        Dim keep = _tabs.Items.ToList()
        _tabs.Items.Clear()
        For Each it In {("rate", "Rate-wise"), ("hsn", "HSN-wise"), ("product", "Product-wise"), ("invoice", "Invoice-wise")}
            If on_("gst-tabs", "gst-t-" & it.Item1) Then _tabs.Items.Add(it)
        Next
        If _tabs.Items.Count > 0 AndAlso Not _tabs.Items.Any(Function(x) x.Key = _tabs.Current) Then _tabs.Current = _tabs.Items(0).Key
        If _tabs.Items.Count > 0 AndAlso _display.IsOn("gst-tabs") Then card2.Add(_tabs)
        _tabs.Invalidate()
        Dim tbl As New WebTable() With {.RowHeight = 42, .EmptyText = "No sales in this period."}
        For c = 0 To _head.Count - 1
            Dim idx = c
            Dim isNum = _rows.Count > 0 AndAlso TypeOf _rows(0)(idx) Is Double
            Dim wide = idx = 0 OrElse {"Description", "Product", "Customer"}.Contains(_head(idx))
            tbl.Cols.Add(New TCol(_head(idx), Function(r) Cell(r, idx), 0, If(idx = 0, CellKind.Bold, CellKind.Text)) With {.Flex = If(wide, 16, 10), .Right = isNum})
        Next
        tbl.Rows = _rows.Select(Function(r, i)
                                  Dim o As New JsonObject From {{"id", i}}
                                  For c = 0 To r.Count - 1 : o("c" & c) = Js.ToNode(r(c)) : Next
                                  Return o
                              End Function).ToList()
        card2.Add(tbl)
        Body.Add(card2)
    End Sub

    Private Shared Function Cell(r As JsonObject, i As Integer) As String
        Dim v = Js.Field(r, "c" & i)
        Dim jv = TryCast(v, JsonValue)
        Dim d As Double
        If jv IsNot Nothing AndAlso jv.TryGetValue(Of Double)(d) Then Return d.ToString("#,##0.##", Theme.India)
        Return If(Js.Text(v) = "", "—", Js.Text(v))
    End Function

    Private Sub PrintIt()
        Dim sec As New ReportPrint.Section With {.Heading = _tabs.Items.FirstOrDefault(Function(x) x.Key = _tabs.Current).Label}
        sec.Head.AddRange(_head)
        For c = 0 To _head.Count - 1
            If _rows.Count > 0 AndAlso TypeOf _rows(0)(c) Is Double Then sec.Right.Add(c)
        Next
        For Each r In _rows
            sec.Rows.Add(r.Select(Function(v) If(TypeOf v Is Double, DirectCast(v, Double).ToString("#,##0.00", Theme.India), If(v?.ToString(), ""))).ToArray())
        Next
        Dim biz = AppState.I.Settings
        ReportPrint.Print(Me, Js.Str(biz, "businessName") & " — GST Report", _from.ToString("d MMM yyyy") & " – " & _to.ToString("d MMM yyyy"),
                          {If(Js.Str(biz, "gstin") <> "", "GSTIN: " & Js.Str(biz, "gstin"), ""), "Sales: " & _channel.Items.First(Function(x) x.Key = _channel.Current).Label}.Where(Function(x) x <> ""), New List(Of ReportPrint.Section) From {sec})
    End Sub
End Class
