Imports System.Drawing
Imports System.Drawing.Printing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Label stock (sizes in mm, printed true to size) — same list as the website.</summary>
Public Class LabelStock
    Public Id, Name, Hint As String
    Public Roll As Boolean
    Public Cols As Integer
    Public W, H, GapX, GapY, MarginX, MarginY As Double
    Public Sub New(id As String, name As String, hint As String, roll As Boolean, cols As Integer, w As Double, h As Double, gapX As Double, gapY As Double, marginX As Double, marginY As Double)
        Me.Id = id : Me.Name = name : Me.Hint = hint : Me.Roll = roll : Me.Cols = cols : Me.W = w : Me.H = h : Me.GapX = gapX : Me.GapY = gapY : Me.MarginX = marginX : Me.MarginY = marginY
    End Sub
    Public ReadOnly Property PageWidth As Double
        Get
            Return If(Roll, MarginX * 2 + Cols * W + (Cols - 1) * GapX, 210)
        End Get
    End Property
    Public ReadOnly Property RowsPerPage As Integer
        Get
            Return If(Roll, 1, Math.Max(1, Math.Min(99, CInt(Math.Floor((297 - MarginY * 2 + GapY) / (H + GapY))))))
        End Get
    End Property
    Public Shared ReadOnly All As LabelStock() = {
        New LabelStock("roll-1-50x25", "Roll · 1 across · 50 × 25 mm", "Most common single-row label printers", True, 1, 50, 25, 0, 3, 0, 0),
        New LabelStock("roll-1-38x25", "Roll · 1 across · 38 × 25 mm", "Small single-row labels", True, 1, 38, 25, 0, 3, 0, 0),
        New LabelStock("roll-1-100x50", "Roll · 1 across · 100 × 50 mm", "Big labels / 4-inch printers", True, 1, 100, 50, 0, 3, 0, 0),
        New LabelStock("roll-2-38x25", "Roll · 2 across · 38 × 25 mm", "2-up retail labels (≈ 80 mm roll)", True, 2, 38, 25, 2, 3, 1, 0),
        New LabelStock("roll-2-50x25", "Roll · 2 across · 50 × 25 mm", "2-up labels (≈ 104 mm roll)", True, 2, 50, 25, 2, 3, 1, 0),
        New LabelStock("roll-3-32x25", "Roll · 3 across · 32 × 25 mm", "3-up retail labels (≈ 104 mm roll)", True, 3, 32, 25, 2, 3, 1, 0),
        New LabelStock("roll-3-33x15", "Roll · 3 across · 33 × 15 mm", "Small 3-up (jewellery, cosmetics)", True, 3, 33, 15, 2, 2, 1, 0),
        New LabelStock("a4-65", "A4 sheet · 65 labels (5 × 13)", "38.1 × 21.2 mm", False, 5, 38.1, 21.2, 2.5, 0, 4.7, 10.7),
        New LabelStock("a4-40", "A4 sheet · 40 labels (4 × 10)", "48.5 × 25.4 mm", False, 4, 48.5, 25.4, 0, 0, 8, 21.5),
        New LabelStock("a4-24", "A4 sheet · 24 labels (3 × 8)", "64 × 33.9 mm", False, 3, 64, 33.9, 2.5, 0, 7.2, 12.9),
        New LabelStock("a4-21", "A4 sheet · 21 labels (3 × 7)", "63.5 × 38.1 mm", False, 3, 63.5, 38.1, 2.5, 0, 7.2, 15.1)}
End Class

''' <summary>"Print Barcodes" as on the website: date range (new / changed products come into the list), label
''' preview with its options and label stock, six numbers, "Add products" (search + category) and the print
''' list. Printed true to size on roll printers or A4 label sheets. Works offline.</summary>
Public Class BarcodesPage
    Inherits ScrollPage

    ''' <summary>Products to start the list with (from the Products page).</summary>
    Public Shared Pending As List(Of Integer)

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_barcodes2_display")
    Private ReadOnly _printTop As New HeadButton("Print 0 labels", "printer", Web.Blue)
    Private ReadOnly _range As New RangeBar("today,yesterday,7d,this_month,custom", "today")
    Private ReadOnly _top As New Columns(2, 480, 12) With {.Stretch = False}
    Private ReadOnly _preview As New CardBox("Label Preview", Theme.IcBarcode) With {.Accent = Theme.Blue}
    Private ReadOnly _label As New Drawn(160, Nothing)
    Private ReadOnly _checks As New List(Of (Key As String, Box As Switch))
    Private ReadOnly _stock As ComboBox = Ui.Filter(LabelStock.All.Select(Function(k) k.Id & "|" & k.Name & If(k.Roll, "", " — " & k.Hint)), 360)
    Private ReadOnly _stockNote As New TextBlock("", Theme.Small, Theme.G500)
    Private ReadOnly _cards As New Columns(3, 190, 12)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _picker As New CardBox("Add Products")
    Private ReadOnly _q As WInput = WInput.Make("Search by name, SKU or barcode…", Theme.IcSearch)
    Private ReadOnly _cat As ComboBox = Ui.Filter({"0|All categories"}, 240)
    Private ReadOnly _found As New WebTable() With {.RowHeight = 46}
    Private ReadOnly _listCard As New CardBox("Print List")
    Private ReadOnly _lines As New WebTable() With {.RowHeight = 50}
    Private ReadOnly _printList As WButton = Ui.Btn("Print 0 labels", Theme.IcPrint, Theme.Blue)
    Private ReadOnly _clear As WButton = Ui.Btn("Clear list", "", outline:=True)
    Private ReadOnly _qty As New Dictionary(Of Integer, Integer)
    Private _opt As New JsonObject()
    Private _started As Boolean

    Public Overrides ReadOnly Property PageTitle As String = "Print Barcodes"
    Public Overrides ReadOnly Property PageSubtitle As String = "Print price labels for the products you added or restocked"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _printTop}
        End Get
    End Property

    Public Sub New()
        _opt = If(TryCast(Js.Copy(Store.Read("label_options")), JsonObject), New JsonObject())
        Body.Add(_range)
        _label.PaintIt = AddressOf PaintPreview
        _label.HeightOf = Function(w) 180
        Dim previewRow As New Columns(2, 200, 18) With {.Weights = {5, 6}, .Stretch = False}
        previewRow.Add(_label)
        Dim opts As New VStack(6)
        For Each c In {("name", "Product name on top"), ("barcode", "Barcode"), ("code", "Barcode number"), ("price", "Price at the bottom"), ("offer", "   Print the offer price when there is one"), ("unit", "Unit beside the price"), ("footer", "Shop line at the very bottom")}
            Dim sw As New Switch(c.Item2, Opt(c.Item1))
            Dim key = c.Item1
            AddHandler sw.Toggled, Sub()
                                       _opt(key) = sw.Checked
                                       Store.Write("label_options", Js.Copy(_opt))
                                       Refresh_()
                                   End Sub
            _checks.Add((key, sw))
            opts.Add(sw)
        Next
        opts.Add(New Spacer(8, True))
        opts.Add(New Field("Label stock / printer", _stock))
        opts.Add(_stockNote)
        previewRow.Add(opts)
        _preview.Add(previewRow)
        Ui.SetVal(_stock, Js.Str(_opt, "stock", LabelStock.All(0).Id))
        AddHandler _stock.SelectedIndexChanged, Sub()
                                                    _opt("stock") = Ui.Val(_stock)
                                                    Store.Write("label_options", Js.Copy(_opt))
                                                    Refresh_()
                                                End Sub
        _top.Add(_preview)
        For Each m In {("bc2-k-added", "Added Today", ChrW(&HE7B8), Color.FromArgb(5, &H96, &H69)), ("bc2-k-updated", "Updated Today", Theme.IcSync, Theme.Blue),
                       ("bc2-k-range", "In This Range", Theme.IcCalendar, Color.FromArgb(&H1E, &H3A, &H8A)), ("bc2-k-queue", "Labels to Print", Theme.IcPrint, Color.FromArgb(5, &H96, &H69)),
                       ("bc2-k-missing", "No Barcode Yet", ChrW(&HE7BA), Color.FromArgb(&HD9, &H77, 6)), ("bc2-k-total", "All Products", Theme.IcPackage, Theme.Blue)}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 92}
            _m(m.Item1) = ms
            _cards.Add(ms)
        Next
        _top.Add(_cards)
        Body.Add(_top)

        Dim searchRow As New Columns(2, 200, 12) With {.Weights = {3, 1}}
        searchRow.Add(_q)
        searchRow.Add(New FlowBox(_cat, Function(w) 32))
        _picker.Add(searchRow)
        _found.Cols.Add(New TCol("Product", Function(p) Js.Str(p, "name"), 0, CellKind.Bold) With {.Flex = 24})
        _found.Cols.Add(New TCol("Barcode", Function(p) Js.Str(p, "barcode"), 0) With {.Flex = 12, .Colour = Function(p) Theme.G600})
        _found.Cols.Add(New TCol("Price", Function(p) Theme.Money(Pos.ShelfPrice(p)), 0) With {.Flex = 8})
        _found.Cols.Add(New TCol("", Function(p) If(_qty.ContainsKey(Js.Int(p, "id")), "In the list ✓", ""), 130) With {.Colour = Function(p) Theme.Green})
        _found.Cols.Add(New TCol("", Nothing, 60, CellKind.Actions) With {.ButtonsFor = Function(p) If(_qty.ContainsKey(Js.Int(p, "id")), New String() {}, {"add"})}.Btn("add", Theme.IcAdd, "Add to the list", Theme.Blue))
        AddHandler _found.ActionClick, Sub(p, k)
                                           _qty(Js.Int(p, "id")) = 1
                                           Refresh_()
                                       End Sub
        _picker.Add(_found)
        Body.Add(_picker)

        _listCard.Tools.Add(_clear)
        _listCard.Tools.Add(_printList)
        _lines.EmptyText = "No products in the list — add them above, or pick dates to bring in new / changed ones."
        _lines.Cols.Add(New TCol("Product", Function(p) Js.Str(p, "name"), 0, CellKind.Bold) With {.Flex = 24})
        _lines.Cols.Add(New TCol("Barcode", Function(p) Js.Str(p, "barcode"), 0) With {.Flex = 12, .Colour = Function(p) Theme.G600})
        _lines.Cols.Add(New TCol("Label price", Function(p) PriceLine(p), 0) With {.Flex = 10})
        _lines.Cols.Add(New TCol("Labels", Nothing, 170, CellKind.Custom) With {.Draw = Sub(g, r, p)
                                                                                           Dim n = 0
                                                                                           _qty.TryGetValue(Js.Int(p, "id"), n)
                                                                                           Using f = Theme.IconFont(11)
                                                                                               Tr.DrawText(g, ChrW(&HE738), f, New Rectangle(r.X, r.Y, 30, r.Height), Theme.G600, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter)
                                                                                               Tr.DrawText(g, Theme.IcAdd, f, New Rectangle(r.X + 80, r.Y, 30, r.Height), Theme.G600, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter)
                                                                                           End Using
                                                                                           Tr.DrawText(g, n.ToString(), Theme.BodyBold, New Rectangle(r.X + 30, r.Y, 50, r.Height), Theme.G900, TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter)
                                                                                       End Sub, .Key = "qty"})
        _lines.Cols.Add(New TCol("", Nothing, 56, CellKind.Actions).Btn("remove", Theme.IcCancel, "Remove", Theme.Danger))
        AddHandler _lines.CellClick, Sub(p, c, cell)
                                         If c.Key <> "qty" Then Return
                                         Dim local = _lines.PointToClient(Cursor.Position)
                                         Dim cellLeft = _lines.PointToClient(cell.Location).X + 10
                                         Dim id = Js.Int(p, "id")
                                         If local.X < cellLeft + 30 Then
                                             _qty(id) -= 1
                                             If _qty(id) <= 0 Then _qty.Remove(id)
                                         ElseIf local.X >= cellLeft + 80 AndAlso local.X < cellLeft + 110 Then
                                             _qty(id) += 1
                                         Else
                                             Dim v = Dialogs.Ask(Me, "Labels", "How many labels?", _qty(id).ToString())
                                             Dim n As Integer
                                             If v IsNot Nothing AndAlso Integer.TryParse(v, n) Then If n <= 0 Then _qty.Remove(id) Else _qty(id) = n
                                         End If
                                         Refresh_()
                                     End Sub
        AddHandler _lines.ActionClick, Sub(p, k)
                                           _qty.Remove(Js.Int(p, "id"))
                                           Refresh_()
                                       End Sub
        _listCard.Add(_lines)
        Body.Add(_listCard)

        AddHandler _range.Changed, Sub()
                                       FillFromRange()
                                       Refresh_()
                                   End Sub
        AddHandler _q.TextChanged, Sub() Refresh_()
        AddHandler _cat.SelectedIndexChanged, Sub() Refresh_()
        AddHandler _clear.Click, Sub()
                                     _qty.Clear()
                                     Refresh_()
                                 End Sub
        AddHandler _printList.Click, Sub() PrintLabels()
        AddHandler _printTop.Click, Sub() PrintLabels()
        AddHandler _display.Changed, Sub() Refresh_()
    End Sub

    Public Overrides Sub OnOpened()
        If Pending IsNot Nothing Then
            _qty.Clear()
            Dim have = AppState.I.List("products").Where(Function(p) Js.Str(p, "barcode") <> "").Select(Function(p) Js.Int(p, "id")).ToHashSet()
            For Each id In Pending
                If have.Contains(id) Then _qty(id) = 1
            Next
            Pending = Nothing
            _started = True
            Refresh_()
        End If
        MyBase.OnOpened()
    End Sub

    Private Function Opt(k As String) As Boolean
        Dim v = Js.Field(_opt, k)
        Return v Is Nothing OrElse Js.Bool(_opt, k)
    End Function

    Private ReadOnly Property Layout As LabelStock
        Get
            Dim id = Js.Str(_opt, "stock", LabelStock.All(0).Id)
            Return If(LabelStock.All.FirstOrDefault(Function(k) k.Id = id), LabelStock.All(0))
        End Get
    End Property

    Private Function LabelPrice(p As JsonObject) As Double
        Return If(Opt("offer"), Pos.ShelfPrice(p), Js.Num(p, "price"))
    End Function

    Private Function PriceLine(p As JsonObject) As String
        Dim unit = Js.Str(p, "pack", Js.Str(p, "unit"))
        Return Theme.Money(LabelPrice(p)) & If(Opt("unit") AndAlso unit <> "", " / " & unit, "")
    End Function

    Private Sub FillFromRange()
        _qty.Clear()
        For Each p In AppState.I.List("products")
            If Js.Str(p, "barcode") <> "" AndAlso (_range.Contains(Js.Time(p, "createdAt")) OrElse _range.Contains(Js.Time(p, "updatedAt"))) Then _qty(Js.Int(p, "id")) = 1
        Next
    End Sub

    Protected Overrides Sub Reload()
        Dim s = AppState.I
        Dim all = s.List("products")
        If Not _started Then
            _started = True
            FillFromRange()
        End If
        Dim withCode = all.Where(Function(p) Js.Str(p, "barcode") <> "").ToList()
        Ui.Refill(_cat, {"0|All categories"}.Concat(s.List("categories").Select(Function(c) Js.Int(c, "id") & "|" & Js.Str(c, "name"))))
        Dim lines = withCode.Where(Function(p) _qty.ContainsKey(Js.Int(p, "id"))).ToList()
        Dim total = _qty.Values.Sum()
        Dim today = Function(d As DateTime?) d.HasValue AndAlso d.Value.Date = DateTime.Today
        _m("bc2-k-added").SetValue(all.Where(Function(p) today(Js.Time(p, "createdAt"))).Count().ToString(), "new products")
        _m("bc2-k-updated").SetValue(all.Where(Function(p) today(Js.Time(p, "updatedAt")) AndAlso Not today(Js.Time(p, "createdAt"))).Count().ToString(), "restock or price change")
        Dim added = all.Where(Function(p) _range.Contains(Js.Time(p, "createdAt"))).Count()
        Dim changed = all.Where(Function(p) _range.Contains(Js.Time(p, "updatedAt")) AndAlso Not _range.Contains(Js.Time(p, "createdAt"))).Count()
        _m("bc2-k-range").SetValue((added + changed).ToString(), added & " added · " & changed & " changed")
        _m("bc2-k-queue").SetValue(total.ToString(), lines.Count & " product" & If(lines.Count = 1, "", "s") & " in the list")
        _m("bc2-k-missing").SetValue((all.Count - withCode.Count).ToString(), "can't be printed")
        _m("bc2-k-total").SetValue(all.Count.ToString(), withCode.Count & " have a barcode")
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("bc2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("bc2-cards"))
        Kit.Show(_preview, _display.Item("bc2-preview"))
        Kit.Show(_top, _display.Item("bc2-preview") OrElse _display.IsOn("bc2-cards"))
        Kit.Show(_range, _display.Item("bc2-range"))
        Kit.Show(_picker, _display.Item("bc2-picker"))
        Kit.Show(_listCard, _display.Item("bc2-list"))
        For Each c In _checks
            c.Box.Checked = Opt(c.Key)
            If c.Key = "offer" Then Kit.Show(c.Box, Opt("price"))
        Next
        Dim l = Layout
        _stockNote.Text = If(l.Roll, l.Hint & ". Printer page size: " & l.PageWidth.ToString("0") & " × " & l.H.ToString("0") & " mm.", (l.Cols * l.RowsPerPage) & " labels per A4 page.")
        _label.Invalidate()

        Dim q = _q.Text.Trim().ToLowerInvariant()
        Dim cat = CInt(Ui.Val(_cat))
        _found.Rows = If(q = "" AndAlso cat = 0, New List(Of JsonObject), withCode.Where(Function(p) (cat = 0 OrElse Js.Int(p, "categoryId") = cat) AndAlso (q = "" OrElse (Js.Str(p, "name") & " " & Js.Str(p, "sku") & " " & Js.Str(p, "barcode")).ToLowerInvariant().Contains(q))).Take(30).ToList())
        Kit.Show(_found, _found.Rows.Count > 0)
        _found.Invalidate()
        _lines.Rows = lines
        _lines.Invalidate()
        Dim txt = "Print " & total & " label" & If(total = 1, "", "s")
        For Each b As Control In {CType(_printTop, Control), _printList}
            b.Text = txt : b.Enabled = total > 0 : b.Invalidate()
        Next
        _printList.Width = _printList.PreferredWidth()
        _listCard.Title = "Print List (" & lines.Count & ")"
        _listCard.Invalidate()
        Kit.Show(_clear, lines.Count > 0)
        HeaderChanged()
    End Sub

    Private Function Sample() As JsonObject
        Dim all = AppState.I.List("products").Where(Function(p) Js.Str(p, "barcode") <> "").ToList()
        Return If(all.FirstOrDefault(Function(p) _qty.ContainsKey(Js.Int(p, "id"))), If(all.FirstOrDefault(), Js.Obj("name", "Sample product", "barcode", "8901234567890", "price", 199, "unit", "pc")))
    End Function

    Private Sub PaintPreview(g As Graphics, r As Rectangle)
        Dim l = Layout
        Dim k = Math.Max(2.0, Math.Min(6.0, Math.Min(220 / l.W, (r.Height - 20) / l.H)))
        Dim box As New RectangleF(10, 10, CSng(l.W * k), CSng(l.H * k))
        Using b As New SolidBrush(Theme.G50) : g.FillRectangle(b, 0, 0, box.Right + 10, box.Bottom + 10) : End Using
        g.FillRectangle(Brushes.White, box)
        Using p As New Pen(Color.FromArgb(&HC8, &HC8, &HD4)) : g.DrawRectangle(p, box.X, box.Y, box.Width, box.Height) : End Using
        DrawLabel(g, box, Sample(), CSng(k))
    End Sub

    Private Shared Function Mm(k As Single, ParamArray v As Double()) As Single
        Return CSng(v.Min() * k)
    End Function

    ''' <summary>One label's face inside r (unitsPerMm: pixels per mm on screen, 1 when printing in mm).</summary>
    Private Sub DrawLabel(g As Graphics, r As RectangleF, p As JsonObject, unitsPerMm As Single)
        Dim l = Layout
        Dim k = unitsPerMm
        Dim small = l.H < 20
        Dim padX = CSng(Math.Min(2, l.W * 0.05) * k), padY = CSng(Math.Min(1.5, l.H * 0.06) * k)
        Dim inner As New RectangleF(r.X + padX, r.Y + padY, r.Width - padX * 2, r.Height - padY * 2)
        Dim shop = Js.Str(AppState.I.Settings, "businessName")
        Dim code = Js.Str(p, "barcode")
        Dim center As New StringFormat With {.Alignment = StringAlignment.Center, .Trimming = StringTrimming.EllipsisCharacter}
        Dim parts As New List(Of (Text As String, Font As Font, H As Single))
        Dim nameF As Font = Nothing, codeF As Font = Nothing, priceF As Font = Nothing, footF As Font = Nothing
        Try
            If Opt("name") Then nameF = New Font("Segoe UI", Mm(k, 3.4, l.H * If(small, 0.16, 0.12), l.W * 0.075), FontStyle.Bold, GraphicsUnit.World)
            If Opt("code") AndAlso code <> "" Then codeF = New Font("Segoe UI", Mm(k, 2.8, l.H * 0.1), FontStyle.Regular, GraphicsUnit.World)
            If Opt("price") Then priceF = New Font("Segoe UI", Mm(k, 4.6, l.H * If(small, 0.19, 0.15), l.W * 0.1), FontStyle.Bold, GraphicsUnit.World)
            If Opt("footer") AndAlso shop <> "" Then footF = New Font("Segoe UI", Mm(k, 2.4, l.H * 0.085), FontStyle.Regular, GraphicsUnit.World)
            Dim used = 0.0F
            Dim nameH = 0.0F
            If nameF IsNot Nothing Then
                Dim sz = g.MeasureString(Js.Str(p, "name"), nameF, CInt(Math.Max(1, inner.Width)))
                nameH = Math.Min(sz.Height, nameF.GetHeight(g) * If(small, 1, 2))
                used += nameH
            End If
            Dim codeH = If(codeF Is Nothing, 0.0F, codeF.GetHeight(g))
            Dim priceH = If(priceF Is Nothing, 0.0F, priceF.GetHeight(g))
            Dim footH = If(footF Is Nothing, 0.0F, footF.GetHeight(g))
            used += codeH + priceH + footH
            Dim barH = If(Opt("barcode"), Math.Max(0, inner.Height - used - 2 * k), 0)
            Dim y = inner.Y + Math.Max(0, (inner.Height - used - barH) / 2)
            If nameF IsNot Nothing Then g.DrawString(Js.Str(p, "name"), nameF, Brushes.Black, New RectangleF(inner.X, y, inner.Width, nameH), center) : y += nameH
            If Opt("barcode") Then
                If code = "" Then
                    Using f As New Font("Segoe UI", Mm(k, 2.8, l.H * 0.1), FontStyle.Regular, GraphicsUnit.World)
                        Using b As New SolidBrush(Color.FromArgb(&HB9, &H1C, &H1C)) : g.DrawString("No barcode on this product", f, b, New RectangleF(inner.X, y, inner.Width, barH), center) : End Using
                    End Using
                Else
                    Barcode.Draw(g, New RectangleF(inner.X + inner.Width * 0.04F, y + k * 0.5F, inner.Width * 0.92F, Math.Max(1, barH - k)), code)
                End If
                y += barH
            End If
            If codeF IsNot Nothing Then g.DrawString(code, codeF, Brushes.Black, New RectangleF(inner.X, y, inner.Width, codeH), center) : y += codeH
            If priceF IsNot Nothing Then g.DrawString(PriceLine(p), priceF, Brushes.Black, New RectangleF(inner.X, y, inner.Width, priceH), center) : y += priceH
            If footF IsNot Nothing Then g.DrawString(shop, footF, Brushes.Black, New RectangleF(inner.X, y, inner.Width, footH), center)
        Finally
            nameF?.Dispose() : codeF?.Dispose() : priceF?.Dispose() : footF?.Dispose()
        End Try
    End Sub

    Private Sub PrintLabels()
        Dim all = AppState.I.List("products")
        Dim labels As New List(Of JsonObject)
        For Each p In all.Where(Function(x) Js.Str(x, "barcode") <> "" AndAlso _qty.ContainsKey(Js.Int(x, "id")))
            For n = 1 To _qty(Js.Int(p, "id")) : labels.Add(p) : Next
        Next
        If labels.Count = 0 Then Toast("Add at least one product to the print list.", True) : Return
        Dim l = Layout
        Dim perPage = l.Cols * l.RowsPerPage
        Dim doc As New PrintDocument With {.DocumentName = "Barcode labels"}
        Dim toHundredths = Function(mm As Double) CInt(Math.Round(mm / 25.4 * 100))
        If l.Roll Then
            doc.DefaultPageSettings.PaperSize = New PaperSize("Labels " & l.PageWidth.ToString("0") & "x" & l.H.ToString("0") & "mm", toHundredths(l.PageWidth), toHundredths(l.H))
        Else
            doc.DefaultPageSettings.PaperSize = New PaperSize("A4", 827, 1169)
        End If
        doc.DefaultPageSettings.Margins = New Margins(0, 0, 0, 0)
        doc.OriginAtMargins = False
        Dim index = 0
        AddHandler doc.PrintPage, Sub(s, e)
                                      Dim g = e.Graphics
                                      g.PageUnit = GraphicsUnit.Millimeter
                                      g.SmoothingMode = Drawing2D.SmoothingMode.None
                                      g.TextRenderingHint = Drawing.Text.TextRenderingHint.AntiAliasGridFit
                                      ' the printer's own unprintable edge is subtracted so labels land true to size
                                      Dim offX = CSng(e.PageSettings.HardMarginX / 100.0 * 25.4), offY = CSng(e.PageSettings.HardMarginY / 100.0 * 25.4)
                                      Dim page = labels.Skip(index).Take(perPage).ToList()
                                      For j = 0 To page.Count - 1
                                          Dim x = CSng(l.MarginX + (j Mod l.Cols) * (l.W + l.GapX)) - offX
                                          Dim y = CSng(If(l.Roll, 0, l.MarginY + (j \ l.Cols) * (l.H + l.GapY))) - offY
                                          DrawLabel(g, New RectangleF(x, y, CSng(l.W), CSng(l.H)), page(j), 1.0F)
                                      Next
                                      index += page.Count
                                      e.HasMorePages = index < labels.Count
                                  End Sub
        Using d As New PrintDialog With {.Document = doc, .UseEXDialog = True}
            If d.ShowDialog(FindForm()) <> DialogResult.OK Then Return
        End Using
        Try
            index = 0
            doc.Print()
            Toast(labels.Count & " label" & If(labels.Count = 1, "", "s") & " sent to the printer.")
        Catch ex As Exception
            Toast("Printer not available: " & ex.Message, True)
        End Try
    End Sub
End Class
