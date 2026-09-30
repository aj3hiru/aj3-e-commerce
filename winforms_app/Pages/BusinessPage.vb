Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Text.RegularExpressions
Imports System.Windows.Forms

''' <summary>"Business Settings" as on the website: a menu of sections on the left — Business Identity,
''' Contact Information, Logo &amp; Branding, Social Media, Tax &amp; Legal, Invoice Settings, POS Shortcuts,
''' Barcode &amp; Orders, Delivery Charge, Payment Methods, GST / Tax Rates, Login &amp; OTP — and one
''' "Save Settings" that saves the first eight together. Opens offline; a save made offline goes out later.</summary>
Public Class BusinessPage
    Inherits ScrollPage

    Private Shared ReadOnly Social As String() = {"facebook|Facebook", "instagram|Instagram", "youtube|YouTube", "x|X (Twitter)", "linkedin|LinkedIn", "whatsapp|WhatsApp", "telegram|Telegram", "pinterest|Pinterest", "other|Other"}
    Private Shared ReadOnly FKeys As String() = {"F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"}
    Private Shared ReadOnly Accents As String() = {"#9f2089", "#2563eb", "#16a34a", "#dc2626", "#d97706", "#0891b2", "#111827"}
    Private Shared ReadOnly Soft As Color = Color.FromArgb(&HFD, &HF0, &HF9)

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_business_settings_display")
    Private ReadOnly _layout As New Columns(2, 200, 16) With {.Weights = {1, 3}, .Stretch = False}
    Private ReadOnly _menu As Drawn
    Private ReadOnly _host As New VStack(12)
    Private ReadOnly _saveBar As New CardBox(Nothing, "", 12)
    Private ReadOnly _saveNote As TextBlock = Ui.Note("Changes in every section are saved together.")
    Private ReadOnly _saveBtn As WButton = Ui.Btn("Save Settings", Theme.IcSave, Theme.Magenta)
    Private ReadOnly _panels As New Dictionary(Of String, Control)
    Private _active As String = "identity"
    Private _items As New List(Of (Key As String, Label As String, Glyph As String))
    Private _rects As New List(Of (Key As String, R As Rectangle))

    ' form state (kept while moving between sections, like the website)
    Private _loaded As Boolean
    Private ReadOnly _t As New Dictionary(Of String, WInput)
    Private ReadOnly _choice As New Dictionary(Of String, ComboBox)
    Private ReadOnly _phones As New List(Of (Box As WInput, OnInvoice As Switch))
    Private ReadOnly _social As New List(Of (Platform As ComboBox, Url As WInput))
    Private _logoWidth As NumericUpDown
    Private _newLogo As String
    Private _inv As JsonObject
    Private _invStart As String
    Private _saving As Boolean

    Public Overrides ReadOnly Property PageTitle As String = "Business Settings"
    Public Overrides ReadOnly Property PageSubtitle As String = "Your shop details, invoices, tax and delivery"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New(Optional section As String = "identity")
        _active = section
        _menu = New Drawn(100, AddressOf PaintMenu) With {.Cursor = Cursors.Hand}
        AddHandler _menu.MouseClick, Sub(s, e)
                                         Dim hit = _rects.FirstOrDefault(Function(x) x.R.Contains(e.Location))
                                         If hit.Key Is Nothing Then Return
                                         If hit.Key = "gst" Then Main?.Push(New TaxPage()) : Return
                                         _active = hit.Key
                                         ShowSection()
                                     End Sub
        Dim menuCard As New CardBox(Nothing, "", 8)
        menuCard.Add(_menu)
        _layout.Add(menuCard)
        _layout.Add(_host)
        Body.Add(_layout)
        Dim row As New HRow(12) With {.RightAlign = True}
        row.Add(_saveNote)
        row.Add(_saveBtn)
        _saveBar.Add(row)
        Body.Add(_saveBar)
        AddHandler _saveBtn.Click, Async Sub() Await SaveAsync()
        AddHandler _display.Changed, Sub() ShowSection()
    End Sub

    Private Sub PaintMenu(g As Graphics, r As Rectangle)
        _rects = New List(Of (String, Rectangle))
        Dim y = 0
        For Each it In _items
            Dim rr As New Rectangle(0, y, r.Width, 40)
            Dim on_ = it.Key = _active
            If on_ Then
                Using p = Theme.RoundRect(New RectangleF(rr.X, rr.Y, rr.Width, rr.Height), 8)
                    Using b As New SolidBrush(Soft) : g.FillPath(b, p) : End Using
                End Using
            End If
            Using f = Theme.IconFont(10) : TextRenderer.DrawText(g, it.Glyph, f, New Rectangle(8, y, 24, 40), If(on_, Theme.Magenta, Theme.G500), TextFormatFlags.VerticalCenter Or TextFormatFlags.HorizontalCenter) : End Using
            TextRenderer.DrawText(g, it.Label, If(on_, Theme.BodyBold, Theme.Body), New Rectangle(40, y, r.Width - 60, 40), If(on_, Theme.Magenta, Theme.G700), TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis)
            If it.Key = "gst" Then
                Using f = Theme.IconFont(8) : TextRenderer.DrawText(g, ChrW(&HE76C), f, New Rectangle(r.Width - 24, y, 20, 40), Theme.G400, TextFormatFlags.VerticalCenter) : End Using
            End If
            _rects.Add((it.Key, rr))
            y += 42
        Next
    End Sub

    Private ReadOnly Property Data As JsonObject
        Get
            Return If(AppState.I.PageObj("business"), New JsonObject())
        End Get
    End Property

    Private ReadOnly Property B As JsonObject
        Get
            Return If(TryCast(Js.Field(Data, "business"), JsonObject), New JsonObject())
        End Get
    End Property

    Protected Overrides Sub Reload()
        If Not _loaded AndAlso Js.Field(Data, "business") IsNot Nothing Then
            _loaded = True
            LoadForm()
        End If
        ' sections that show saved data straight away are rebuilt from it
        For Each k In {"payment", "login", "delivery"}
            If _panels.ContainsKey(k) AndAlso _active <> k Then _panels(k).Dispose() : _panels.Remove(k)
        Next
        If _active = "payment" AndAlso _panels.ContainsKey("payment") Then _panels("payment").Dispose() : _panels.Remove("payment")
        ShowSection()
    End Sub

    Private Sub LoadForm()
        Dim bz = B
        For Each n In Js.Arr(bz, "contactNumbers")
            AddPhone(n?.ToString(), Js.Arr(bz, "invoiceContactNumbers").Any(Function(x) x?.ToString() = n?.ToString()))
        Next
        For Each x In Js.Objs(Js.Arr(bz, "socialMediaJson"))
            AddSocial(Js.Str(x, "platform", "other"), Js.Str(x, "url"))
        Next
        _logoWidth = New NumericUpDown With {.Minimum = 40, .Maximum = 400, .Increment = 10, .Value = Math.Max(40, Math.Min(400, Js.Int(bz, "logoDisplayWidth", 150))), .Font = Theme.Body, .Width = 120}
        _inv = If(TryCast(Js.Copy(Js.Field(Data, "invoice")), JsonObject), New JsonObject())
        _invStart = _inv.ToJsonString()
    End Sub

    Private Function T(k As String, Optional placeholder As String = "", Optional multi As Boolean = False, Optional upper As Boolean = False) As WInput
        Dim w As WInput = Nothing
        If Not _t.TryGetValue(k, w) Then
            w = WInput.Make(placeholder, "", multi)
            If multi Then w.Height = 64
            w.Text = Js.Str(B, k)
            If upper Then w.Box.CharacterCasing = CharacterCasing.Upper
            _t(k) = w
        End If
        Return w
    End Function

    Private Function Pick(k As String, opts As IEnumerable(Of String)) As ComboBox
        Dim c As ComboBox = Nothing
        If Not _choice.TryGetValue(k, c) Then
            c = Ui.Filter(opts, 220)
            Dim v = Js.Str(B, k)
            If v <> "" Then Ui.SetVal(c, v)
            _choice(k) = c
        End If
        Return c
    End Function

    Private Sub AddPhone(n As String, onInvoice As Boolean)
        Dim w = WInput.Make("Phone number", Theme.IcPhone)
        w.Text = n
        _phones.Add((w, New Switch("On invoice", onInvoice)))
    End Sub

    Private Sub AddSocial(platform As String, url As String)
        Dim c = Ui.Filter(Social, 170)
        Ui.SetVal(c, platform)
        Dim w = WInput.Make("https://...")
        w.Text = url
        _social.Add((c, w))
    End Sub

    Private Shared Function Two(a As Control, bb As Control) As Columns
        Dim c As New Columns(2, 200, 12)
        c.Add(a) : c.Add(bb)
        Return c
    End Function

    Private Shared Function Panel(glyph As String, title As String, Optional hint As String = Nothing) As CardBox
        Return New CardBox(title, glyph, 20) With {.Accent = Theme.Magenta, .Subtitle = hint}
    End Function

    Private Sub ShowSection()
        Dim m = Function(k As String) _display.IsOn("bs-menu", "bs-m-" & k)
        _items = New List(Of (String, String, String))
        If m("identity") Then _items.Add(("identity", "Business Identity", ChrW(&HE731)))
        If m("contact") Then _items.Add(("contact", "Contact Information", ChrW(&HE77B)))
        If m("branding") Then _items.Add(("branding", "Logo & Branding", Theme.IcPhoto))
        If m("social") Then _items.Add(("social", "Social Media", ChrW(&HE72D)))
        If m("tax") Then _items.Add(("tax", "Tax & Legal", ChrW(&HE8A5)))
        If m("invoice") Then _items.Add(("invoice", "Invoice Settings", Theme.IcPrint))
        If m("pos") Then _items.Add(("pos", "POS Shortcuts", ChrW(&HE765)))
        If m("orders") Then _items.Add(("orders", "Barcode & Orders", ChrW(&HE8B3)))
        _items.Add(("delivery", "Delivery Charge", ChrW(&HE7C0)))
        If m("payment") Then _items.Add(("payment", "Payment Methods", ChrW(&HE8C7)))
        If m("gst") Then _items.Add(("gst", "GST / Tax Rates", ChrW(&HE8EF)))
        If m("login") Then _items.Add(("login", "Login & OTP", ChrW(&HE72E)))
        If Not _items.Any(Function(x) x.Key = _active) AndAlso _items.Count > 0 Then _active = _items(0).Key
        _menu.Height = _items.Count * 42
        _menu.Invalidate()
        For Each c As Control In _host.Controls.Cast(Of Control)().ToList() : _host.Controls.Remove(c) : Next
        If _loaded Then
            Dim p As Control = Nothing
            If Not _panels.TryGetValue(_active, p) Then
                p = Build(_active)
                _panels(_active) = p
            End If
            _host.Add(p)
        Else
            _host.Add(Ui.Note("Business settings haven't been downloaded yet. Connect to the internet and press F5."))
        End If
        Kit.Show(_saveBar, _loaded AndAlso Not {"delivery", "payment", "login"}.Contains(_active))
        Kit.Show(_saveNote, _display.Item("bs-savenote"))
        Relayout()
    End Sub

    Private Function Build(k As String) As Control
        Select Case k
            Case "contact" : Return BuildContact()
            Case "branding" : Return BuildBranding()
            Case "social" : Return BuildSocial()
            Case "tax"
                Dim p = Panel(ChrW(&HE8A5), "GST & Tax Details", "Just the values here — whether each one prints on your invoice is set in Invoice Settings.")
                p.Add(Two(New Field("GSTIN", T("gstin", upper:=True)), New Field("PAN Number", T("panNumber", upper:=True))))
                p.Add(Two(New Field("FSSAI Number", T("fssaiNumber")), New Field("State", T("state"))))
                p.Add(New Field("Return Policy", T("returnPolicy", multi:=True), "Shown to customers on the storefront."))
                Return p
            Case "invoice" : Return BuildInvoice()
            Case "pos"
                Dim p = Panel(ChrW(&HE765), "POS Shortcuts", "Keyboard keys on the billing screen. A4 / thermal printing is set in Invoice Settings.")
                Dim c As New Columns(3, 150, 12)
                c.Add(New Field("Complete Sale", Pick("shortcutCompleteSale", FKeys)))
                c.Add(New Field("Print", Pick("shortcutPrint", FKeys)))
                c.Add(New Field("New Sale", Pick("shortcutNewSale", FKeys)))
                p.Add(c)
                Return p
            Case "orders"
                Dim p = Panel(ChrW(&HE8B3), "Barcode Label & Order ID Format")
                p.Add(Two(New Field("Barcode Footer Text", T("barcodeFooterText"), "Printed under each barcode label."), New Field("Order ID Prefix", T("orderIdPrefix", upper:=True), "Order numbers are this prefix plus a running sequence.")))
                Return p
            Case "delivery" : Return BuildDelivery()
            Case "payment" : Return BuildPayments()
            Case "login" : Return BuildLogin()
            Case Else
                Dim p = Panel(ChrW(&HE731), "Business Identity")
                p.Add(Two(New Field("Business Name", T("businessName"), required:=True), New Field("Tagline", T("tagline"))))
                p.Add(New Field("SEO Description", T("seoDescription", multi:=True), "Used as the storefront's meta description."))
                p.Add(Two(New Field("Location", T("location"), "The short place name shown in the storefront header."), New Field("Business Hours", T("businessHours", "e.g. 9 AM - 9 PM"), "Falls back into the header's delivery-time line when that is left blank.")))
                p.Add(New Field("Address", T("address", multi:=True)))
                Return p
        End Select
    End Function

    Private Function BuildContact() As Control
        Dim p = Panel(ChrW(&HE77B), "Contact Information", "Tick a number to have it printed on invoices.")
        p.Add(Two(New Field("Email", T("email")), New Field("Website URL", T("websiteUrl"))))
        p.Add(New TextBlock("Contact Numbers", Theme.BodyBold, Theme.G600))
        Dim list As New VStack(8)
        Dim fill As Action = Nothing
        fill = Sub()
                   For Each c As Control In list.Controls.Cast(Of Control)().ToList() : list.Controls.Remove(c) : Next
                   For Each ph In _phones
                       Dim row As New Columns(3, 60, 8) With {.Weights = {6, 2, 1}}
                       row.Add(ph.Box) : row.Add(ph.OnInvoice)
                       Dim cur = ph
                       row.Add(Ui.IconBtn(Theme.IcDelete, "Remove number", Sub()
                                                                              _phones.Remove(cur)
                                                                              fill()
                                                                              Relayout()
                                                                          End Sub, Theme.Danger))
                       list.Add(row)
                   Next
               End Sub
        fill()
        p.Add(list)
        p.Add(Ui.Btn("ADD NUMBER", Theme.IcAdd, Theme.Magenta, outline:=True, click:=Sub()
                                                                                     AddPhone("", False)
                                                                                     fill()
                                                                                     Relayout()
                                                                                 End Sub))
        Return p
    End Function

    Private Function BuildBranding() As Control
        Dim p = Panel(Theme.IcPhoto, "Logo & Branding")
        Dim pic As New WebPicture(120) With {.Height = 120}
        pic.Source = If(_newLogo, Js.Str(B, "logo"))
        Dim hint = Ui.Note(If(_newLogo Is Nothing, "", "New logo — it is uploaded when you press Save Settings."))
        p.Add(pic)
        p.Add(Ui.Btn(If(Js.Str(B, "logo") = "", "Upload logo", "Change logo"), Theme.IcPhoto, Theme.Magenta, outline:=True, click:=Sub()
                                                                                                                                   Using d As New OpenFileDialog With {.Filter = "Pictures|*.jpg;*.jpeg;*.png;*.webp;*.svg"}
                                                                                                                                       If d.ShowDialog(FindForm()) <> DialogResult.OK Then Return
                                                                                                                                       _newLogo = Store.KeepFile(d.FileName)
                                                                                                                                       pic.Source = _newLogo
                                                                                                                                       hint.Text = "New logo — it is uploaded when you press Save Settings."
                                                                                                                                       Relayout()
                                                                                                                                   End Using
                                                                                                                               End Sub))
        p.Add(hint)
        p.Add(Two(New Field("Site Header Display", Pick("siteHeaderDisplay", {"both|Both", "title|Title only", "logo|Logo only"})), New Field("Logo Display Width (px)", _logoWidth)))
        Return p
    End Function

    Private Function BuildSocial() As Control
        Dim p = Panel(ChrW(&HE72D), "Social Media Accounts", "Shown as the circular icons in the storefront footer.")
        Dim list As New VStack(8)
        Dim fill As Action = Nothing
        fill = Sub()
                   For Each c As Control In list.Controls.Cast(Of Control)().ToList() : list.Controls.Remove(c) : Next
                   If _social.Count = 0 Then list.Add(Ui.Note("No links yet."))
                   For Each s In _social
                       Dim row As New Columns(3, 60, 8) With {.Weights = {2, 6, 1}}
                       row.Add(s.Platform) : row.Add(s.Url)
                       Dim cur = s
                       row.Add(Ui.IconBtn(Theme.IcDelete, "Remove link", Sub()
                                                                            _social.Remove(cur)
                                                                            fill()
                                                                            Relayout()
                                                                        End Sub, Theme.Danger))
                       list.Add(row)
                   Next
               End Sub
        fill()
        p.Add(list)
        p.Add(Ui.Btn("ADD SOCIAL LINK", Theme.IcAdd, Theme.Magenta, outline:=True, click:=Sub()
                                                                                          AddSocial("facebook", "")
                                                                                          fill()
                                                                                          Relayout()
                                                                                      End Sub))
        Return p
    End Function

    ' ── Invoice settings ──
    Private Function IB(k As String) As Boolean
        Return Js.Bool(_inv, k)
    End Function

    Private Function ISwitch(k As String, label As String, Optional changed As Action = Nothing) As Switch
        Dim s As New Switch(label, IB(k))
        AddHandler s.Toggled, Sub()
                                  _inv(k) = s.Checked
                                  changed?.Invoke()
                              End Sub
        Return s
    End Function

    Private Function IText(k As String, label As String, Optional placeholder As String = "", Optional multi As Boolean = False, Optional fallback As String = Nothing) As Control
        Dim w = WInput.Make(placeholder, "", multi)
        If multi Then w.Height = 64
        w.Text = Js.Str(_inv, k, If(fallback, ""))
        AddHandler w.TextChanged, Sub() _inv(k) = w.Text
        Return New Field(label, w)
    End Function

    ''' <summary>A business detail printed on invoices: tick = print it, text = print something other than the profile.</summary>
    Private Function ProfileField(k As String, label As String, fallback As String, Optional multi As Boolean = False) As Control
        Dim v = If(TryCast(Js.Field(_inv, k), JsonObject), Js.Obj("show", True, "value", ""))
        _inv(k) = Js.Copy(v)
        Dim sw As New Switch("", Js.Field(v, "show") Is Nothing OrElse Js.Bool(v, "show"))
        Dim w = WInput.Make(If(fallback = "", "Not set", fallback), "", multi)
        If multi Then w.Height = 60
        w.Text = Js.Str(v, "value")
        AddHandler sw.Toggled, Sub() CType(_inv(k), JsonObject)("show") = sw.Checked
        AddHandler w.TextChanged, Sub() CType(_inv(k), JsonObject)("value") = w.Text
        Dim row As New Columns(2, 40, 10) With {.Weights = {1, 12}, .Stretch = False}
        Dim cell As New VStack(0) With {.Padding = New Padding(0, 24, 0, 0)}
        cell.Add(sw)
        row.Add(cell)
        row.Add(New Field(label, w))
        Return row
    End Function

    Private Function BuildInvoice() As Control
        Dim col As New VStack(12)
        Dim bz = B
        ' what opens after a bill
        Dim p1 = Panel(Theme.IcPrint, "When an invoice is generated", "What opens after a bill is completed and from the Print buttons on orders.")
        Dim choices As New Columns(3, 150, 8)
        Dim cards As New List(Of (String, ChoiceCard))
        For Each c In {("a4", "A4 invoice", "Full page, for records", ChrW(&HE8A5)), ("thermal", "Thermal receipt", "Till slip on a receipt printer", Theme.IcPrint), ("ask", "Ask every time", "Choose A4 or thermal each time", ChrW(&HE897))}
            Dim cc As New ChoiceCard(c.Item2, c.Item3, c.Item4) With {.Height = 64, .Selected = Js.Str(_inv, "defaultPrint") = c.Item1}
            Dim id = c.Item1
            cards.Add((id, cc))
            AddHandler cc.Click, Sub()
                                     _inv("defaultPrint") = id
                                     For Each x In cards : x.Item2.Selected = x.Item1 = id : x.Item2.Invalidate() : Next
                                 End Sub
            choices.Add(cc)
        Next
        p1.Add(choices)
        p1.Add(ISwitch("autoPrint", "Open the print dialog straight away"))
        col.Add(p1)
        ' thermal
        Dim p2 = Panel(ChrW(&HE8A1), "Thermal receipt", "Pick a template — every option below applies to it.")
        Dim tpl As New Columns(4, 130, 8)
        Dim tcards As New List(Of (String, ChoiceCard))
        For Each c In {("classic", "Classic", "Monospace, dashed lines"), ("modern", "Modern", "Clean with a bold total box"), ("compact", "Compact", "Two-line items, least paper"), ("gst", "GST Detailed", "HSN, GST % and a tax summary")}
            Dim cc As New ChoiceCard(c.Item2, c.Item3, "") With {.Height = 60, .Selected = Js.Str(_inv, "thermalTemplate") = c.Item1}
            Dim id = c.Item1
            tcards.Add((id, cc))
            AddHandler cc.Click, Sub()
                                     _inv("thermalTemplate") = id
                                     For Each x In tcards : x.Item2.Selected = x.Item1 = id : x.Item2.Invalidate() : Next
                                 End Sub
            tpl.Add(cc)
        Next
        p2.Add(tpl)
        Dim width_ = Ui.Filter({"58mm|58 mm", "80mm|80 mm"}, 140)
        Ui.SetVal(width_, Js.Str(_inv, "thermalWidth", "80mm"))
        AddHandler width_.SelectedIndexChanged, Sub() _inv("thermalWidth") = Ui.Val(width_)
        Dim font_ = Ui.Filter({"sm|Small", "md|Normal", "lg|Large"}, 140)
        Ui.SetVal(font_, Js.Str(_inv, "thermalFont", "md"))
        AddHandler font_.SelectedIndexChanged, Sub() _inv("thermalFont") = Ui.Val(font_)
        p2.Add(Two(New Field("Paper width", width_), New Field("Text size", font_)))
        col.Add(p2)
        ' A4
        Dim p3 = Panel(ChrW(&HE790), "A4 invoice", "Colour, signature, terms and the amount in words.")
        Dim sw As New HRow(8)
        For Each c In Accents
            Dim hex = c
            Dim d As New Drawn(30, Sub(g, r)
                                       Theme.Smooth(g)
                                       Dim on_ = Js.Str(_inv, "accent").ToLowerInvariant() = hex
                                       Using br As New SolidBrush(Fmt.ColorFromHex(hex, Theme.Primary)) : g.FillEllipse(br, 2, 2, 26, 26) : End Using
                                       If on_ Then
                                           Using pen As New Pen(Theme.G900, 2.5F) : g.DrawEllipse(pen, 1, 1, 28, 28) : End Using
                                           TextRenderer.DrawText(g, "✓", Theme.BodyBold, New Rectangle(0, 0, 30, 30), Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
                                       End If
                                   End Sub) With {.Width = 30, .Cursor = Cursors.Hand}
            AddHandler d.Click, Sub()
                                    _inv("accent") = hex
                                    For Each x As Control In sw.Controls : x.Invalidate() : Next
                                End Sub
            sw.Add(d)
        Next
        p3.Add(New Field("Invoice colour", sw))
        Dim sigField = IText("signatureLabel", "Signature label")
        Dim checks As New HRow(18)
        checks.Add(ISwitch("showAmountInWords", "Amount in words"))
        checks.Add(ISwitch("showSignature", "Signature box", Sub()
                                                                 Kit.Show(sigField, IB("showSignature"))
                                                                 Relayout()
                                                             End Sub))
        p3.Add(checks)
        Kit.Show(sigField, IB("showSignature"))
        p3.Add(sigField)
        p3.Add(IText("terms", "Terms & conditions", "e.g. Goods once sold will not be taken back.", multi:=True))
        col.Add(p3)
        ' header
        Dim p4 = Panel(ChrW(&HE8D2), "Invoice header")
        Dim logoW As New NumericUpDown With {.Minimum = 40, .Maximum = 220, .Increment = 5, .Value = Math.Max(40, Math.Min(220, Js.Int(_inv, "logoWidth", 120))), .Font = Theme.Body, .Width = 120}
        AddHandler logoW.ValueChanged, Sub() _inv("logoWidth") = CInt(logoW.Value)
        Dim logoField As New Field("Logo width (px)", logoW)
        Dim h As New HRow(18)
        h.Add(ISwitch("showName", "Business name"))
        h.Add(ISwitch("showLogo", "Logo", Sub()
                                              Kit.Show(logoField, IB("showLogo"))
                                              Relayout()
                                          End Sub))
        h.Add(ISwitch("showTagline", "Tagline"))
        p4.Add(h)
        Kit.Show(logoField, IB("showLogo"))
        p4.Add(Two(IText("title", "Invoice title", "Tax Invoice", fallback:="Tax Invoice"), logoField))
        col.Add(p4)
        ' details
        Dim p5 = Panel(ChrW(&HE8EF), "Invoice details", "Tick what to print.")
        Dim d5 As New HRow(18)
        For Each c In {("showInvoiceNo", "Invoice No."), ("showDate", "Date"), ("showTime", "Time"), ("showCustomer", "Customer"), ("showPaymentMode", "Payment mode"), ("showBarcode", "Barcode"), ("showHsn", "HSN code"), ("showTaxBreakup", "GST summary")}
            d5.Add(ISwitch(c.Item1, c.Item2))
        Next
        p5.Add(d5)
        col.Add(p5)
        ' business details
        Dim phones = String.Join(", ", _phones.Select(Function(x) x.Box.Text.Trim()).Where(Function(x) x <> ""))
        Dim p6 = Panel(ChrW(&HE707), "Business details", "Filled from your business profile. Type here to print something different on invoices only.")
        p6.Add(ProfileField("address", "Address", Js.Str(bz, "address"), multi:=True))
        p6.Add(ProfileField("location", "Location", Js.Str(bz, "location")))
        p6.Add(ProfileField("phones", "Contact number(s)", phones))
        p6.Add(ProfileField("email", "Email", Js.Str(bz, "email")))
        col.Add(p6)
        ' tax ids
        Dim p7 = Panel(ChrW(&HE8A5), "GST / Tax details", "From Tax & Legal when filled there — or type them here.")
        p7.Add(ProfileField("gstin", "GSTIN", Js.Str(bz, "gstin")))
        p7.Add(ProfileField("pan", "PAN", Js.Str(bz, "panNumber")))
        p7.Add(ProfileField("fssai", "FSSAI Lic. No.", Js.Str(bz, "fssaiNumber")))
        Dim extras As New VStack(8)
        Dim addExtra = Ui.Btn("ADD ANOTHER ID (SSI, UDYAM, CIN…)", Theme.IcAdd, Theme.Magenta, outline:=True)
        Dim fillExtras As Action = Nothing
        fillExtras = Sub()
                         For Each c As Control In extras.Controls.Cast(Of Control)().ToList() : extras.Controls.Remove(c) : c.Dispose() : Next
                         Dim arr = TryCast(Js.Field(_inv, "extraIds"), JsonArray)
                         If arr Is Nothing Then arr = New JsonArray() : _inv("extraIds") = arr
                         For Each x In Js.Objs(arr).ToList()
                             Dim cur = x
                             Dim row As New Columns(4, 40, 8) With {.Weights = {1, 5, 7, 1}}
                             Dim s As New Switch("", Js.Field(cur, "show") Is Nothing OrElse Js.Bool(cur, "show"))
                             AddHandler s.Toggled, Sub() cur("show") = s.Checked
                             Dim l = WInput.Make("Label (e.g. Udyam / SSI)") : l.Text = Js.Str(cur, "label")
                             AddHandler l.TextChanged, Sub() cur("label") = l.Text
                             Dim v = WInput.Make("Number") : v.Text = Js.Str(cur, "value")
                             AddHandler v.TextChanged, Sub() cur("value") = v.Text
                             row.Add(s) : row.Add(l) : row.Add(v)
                             row.Add(Ui.IconBtn(Theme.IcDelete, "Remove", Sub()
                                                                            arr.Remove(cur)
                                                                            fillExtras()
                                                                            Relayout()
                                                                        End Sub, Theme.Danger))
                             extras.Add(row)
                         Next
                         Kit.Show(addExtra, arr.Count < 6)
                     End Sub
        AddHandler addExtra.Click, Sub()
                                       TryCast(_inv("extraIds"), JsonArray)?.Add(Js.Obj("label", "", "value", "", "show", True))
                                       fillExtras()
                                       Relayout()
                                   End Sub
        fillExtras()
        p7.Add(extras)
        p7.Add(addExtra)
        col.Add(p7)
        Dim p8 = Panel(ChrW(&HE8BD), "Footer")
        p8.Add(IText("footerNote", "Thank-you message", "Thank you, visit again!", multi:=True))
        col.Add(p8)
        Return col
    End Function

    Private Async Function SaveAsync() As Task
        If _saving OrElse Not _loaded Then Return
        If T("businessName").Text.Trim() = "" Then
            _active = "identity"
            ShowSection()
            Toast("Business name is required.", True)
            Return
        End If
        _saving = True
        _saveBtn.Text = "Saving…" : _saveBtn.Enabled = False
        Try
            Dim body As New JsonObject()
            For Each kv In _t : body(kv.Key) = kv.Value.Text : Next
            For Each kv In _choice : body(kv.Key) = Ui.Val(kv.Value) : Next
            Dim nums = _phones.Select(Function(x) x.Box.Text.Trim()).Where(Function(x) x <> "").ToList()
            Dim onInv = _phones.Where(Function(x) x.OnInvoice.Checked AndAlso x.Box.Text.Trim() <> "").Select(Function(x) x.Box.Text.Trim()).ToList()
            body("contactNumbers") = New JsonArray(nums.Select(Function(x) CType(JsonValue.Create(x), JsonNode)).ToArray())
            body("invoiceNumbers") = New JsonArray(onInv.Select(Function(x) CType(JsonValue.Create(x), JsonNode)).ToArray())
            Dim soc As New JsonArray()
            For Each s In _social
                If s.Url.Text.Trim() <> "" Then soc.Add(Js.Obj("platform", Ui.Val(s.Platform), "url", s.Url.Text.Trim()))
            Next
            body("socialMedia") = soc
            body("logoDisplayWidth") = CInt(_logoWidth.Value)
            ' shows at once on this computer
            Dim local = TryCast(Js.Copy(body), JsonObject)
            local("contactNumbers") = Js.Copy(body("contactNumbers"))
            local("invoiceContactNumbers") = Js.Copy(body("invoiceNumbers"))
            local("socialMediaJson") = Js.Copy(soc)
            Dim merged = TryCast(Js.Copy(B), JsonObject)
            Js.Merge(merged, local)
            Dim r = Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "PATCH", .Path = "/api/app/v1/business", .Label = "Business settings", .Body = body, .Refresh = New List(Of String) From {"settings"},
                .Effect = New JsonObject From {{"kind", "page_set"}, {"page", "business"}, {"path", New JsonArray("business")}, {"value", merged}}})
            If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden Then Toast(r.Message, True) : Return
            If _inv.ToJsonString() <> _invStart Then
                Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/invoice-settings", .Label = "Invoice settings", .Body = Js.Copy(_inv),
                    .Effect = New JsonObject From {{"kind", "page_set"}, {"page", "business"}, {"path", New JsonArray("invoice")}, {"value", Js.Copy(_inv)}}})
                _invStart = _inv.ToJsonString()
            End If
            If _newLogo IsNot Nothing Then
                Dim it As New OutboxItem With {.Method = "POST", .Path = "/api/app/v1/business", .Label = "Business logo", .Multipart = True, .Refresh = New List(Of String) From {"settings"}}
                it.Files("logo") = _newLogo
                Await AppState.I.SendNowAsync(it)
                _newLogo = Nothing
            End If
            Toast(If(r.IsOk, "Settings saved.", "Saved — it will be sent when you are online."))
            If r.IsOk Then Await AppState.I.ReloadPageAsync("business")
        Finally
            _saving = False
            _saveBtn.Text = "Save Settings" : _saveBtn.Enabled = True
        End Try
    End Function

    ' ── Delivery charge (own save) ──
    Private Function BuildDelivery() As Control
        Dim d = If(TryCast(Js.Field(Data, "delivery"), JsonObject), New JsonObject())
        Dim p = Panel(ChrW(&HE7C0), "Delivery Charge", "What online orders pay for delivery.")
        Dim on_ As New Switch("Charge for delivery on online orders", Js.Bool(d, "enabled"))
        Dim charge = WInput.Make("0", "₹") : charge.Text = Js.Num(d, "charge").ToString("0.##")
        Dim free = WInput.Make("Empty = never free", "₹") : free.Text = If(Js.IsNull(d, "freeAbove"), "", Js.Num(d, "freeAbove").ToString("0.##"))
        Dim note = WInput.Make("") : note.Text = Js.Str(d, "note")
        Dim more As New VStack(12)
        more.Add(Two(New Field("Delivery charge (₹)", charge), New Field("Free delivery above (₹)", free)))
        more.Add(New Field("Note at checkout (optional)", note))
        Kit.Show(more, on_.Checked)
        AddHandler on_.Toggled, Sub()
                                    Kit.Show(more, on_.Checked)
                                    Relayout()
                                End Sub
        p.Add(on_)
        p.Add(more)
        p.Add(Ui.Btn("Save", Theme.IcSave, Theme.Magenta, click:=Async Sub()
                                                                      Dim body = Js.Obj("enabled", on_.Checked, "charge", Fmt.ParseNum(charge.Text), "note", note.Text.Trim())
                                                                      body("freeAbove") = If(free.Text.Trim() = "", Nothing, JsonValue.Create(Fmt.ParseNum(free.Text)))
                                                                      Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/delivery-settings", .Label = "Delivery charge", .Body = body,
                                                                          .Effect = New JsonObject From {{"kind", "page_set"}, {"page", "business"}, {"path", New JsonArray("delivery")}, {"value", Js.Copy(body)}}}, "business", "Saved.")
                                                                  End Sub))
        Return p
    End Function

    ' ── Payment methods ──
    Private Shared ReadOnly PayBlurb As New Dictionary(Of String, String) From {
        {"cod", "Customer pays in cash when the order is delivered — no gateway credentials needed."},
        {"paytm", "Accept UPI, wallet and card payments through the Paytm gateway."},
        {"phonepe", "Accept UPI and card payments through the PhonePe gateway."},
        {"razorpay", "Accept UPI, cards, netbanking and wallets through Razorpay."},
        {"bank_transfer", "Customer transfers directly to your bank account — you confirm payment manually."}}

    Private Function BuildPayments() As Control
        Dim prefs = DisplayOptions.For("ecom_payment_settings2_display")
        Dim methods = AppState.I.PageList("payments")
        Dim def = methods.FirstOrDefault(Function(m) Js.Bool(m, "isDefault"))
        Dim col As New VStack(12)
        col.Add(New Drawn(40, Sub(g, r)
                                  Theme.Smooth(g)
                                  Using p = Theme.RoundRect(New RectangleF(0, 0, r.Width - 1, 39), 10)
                                      Using br As New SolidBrush(Color.FromArgb(&HF0, &HFD, &HF4)) : g.FillPath(br, p) : End Using
                                      Using pen As New Pen(Color.FromArgb(&HBB, &HF7, &HD0)) : g.DrawPath(pen, p) : End Using
                                  End Using
                                  TextRenderer.DrawText(g, "Credentials are stored server-side and never shown to customers.", Theme.BodyBold, New Rectangle(14, 0, r.Width - 20, 40), Color.FromArgb(4, &H78, &H57), TextFormatFlags.VerticalCenter)
                              End Sub))
        Dim cards As New Columns(3, 160, 12)
        If prefs.IsOn("pm2-cards", "pm2-k-enabled") Then
            Dim m As New MiniStat("Enabled Methods", Theme.IcDone, Color.FromArgb(5, &H96, &H69)) With {.Height = 86}
            m.SetValue(methods.Where(Function(x) Js.Bool(x, "isEnabled")).Count().ToString())
            cards.Add(m)
        End If
        If prefs.IsOn("pm2-cards", "pm2-k-configured") Then
            Dim m As New MiniStat("Configured Methods", ChrW(&HE713), Theme.Blue) With {.Height = 86}
            m.SetValue(methods.Where(Function(x) Js.Bool(x, "configured")).Count().ToString())
            cards.Add(m)
        End If
        If prefs.IsOn("pm2-cards", "pm2-k-default") Then
            Dim m As New MiniStat("Default Method", ChrW(&HEA18), Color.FromArgb(&H7C, &H3A, &HED)) With {.Height = 86}
            m.SetValue(If(def Is Nothing, "None set", Js.Str(def, "label")))
            cards.Add(m)
        End If
        If cards.Controls.Count > 0 Then col.Add(cards)
        Dim list = Panel(ChrW(&HE8C7), "Payment Methods", "Turn methods on and configure their gateway credentials.")
        If methods.Count = 0 Then list.Add(Ui.Note("Payment methods haven't been downloaded yet (press F5 when online)."))
        For Each m In methods
            Dim cur = m
            Dim row As New Columns(3, 60, 10) With {.Weights = {8, 2, 2}}
            Dim info As New Drawn(46, Sub(g, r)
                                          Dim x = 0
                                          TextRenderer.DrawText(g, Js.Str(cur, "label"), Theme.BodyBold, New Point(0, 2), Theme.G900, TextFormatFlags.NoPadding)
                                          x = TextRenderer.MeasureText(Js.Str(cur, "label"), Theme.BodyBold).Width + 8
                                          If Js.Bool(cur, "isDefault") Then x = Gfx.Badge(g, "Default", x, 11, Color.FromArgb(&H6D, &H28, &HD9), Color.FromArgb(&HF5, &HF3, &HFF)).Right + 6
                                          If Js.Bool(cur, "isEnabled") AndAlso Not Js.Bool(cur, "configured") Then Gfx.Badge(g, "Needs setup", x, 11, Color.FromArgb(&HB4, &H53, 9), Color.FromArgb(&HFF, &HFB, &HEB))
                                          Dim txt = Js.Str(cur, "text")
                                          If txt = "" Then PayBlurb.TryGetValue(Js.Str(cur, "key"), txt)
                                          TextRenderer.DrawText(g, If(txt, ""), Theme.Small, New Rectangle(0, 24, r.Width, 20), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                      End Sub)
            Dim sw As New Switch(If(Js.Bool(cur, "isEnabled"), "Active", "Inactive"), Js.Bool(cur, "isEnabled"))
            AddHandler sw.Toggled, Async Sub()
                                       sw.Checked = Js.Bool(cur, "isEnabled")
                                       If Not Js.Bool(cur, "isEnabled") AndAlso Not Js.Bool(cur, "configured") Then Configure(cur) : Return
                                       Dim turnOn = Not Js.Bool(cur, "isEnabled")
                                       Dim fields = Js.Obj("isEnabled", turnOn)
                                       If Not turnOn Then fields("isDefault") = False
                                       Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/payment-settings2/" & Js.Str(cur, "key"), .Label = Js.Str(cur, "label") & ": " & If(turnOn, "on", "off"), .Body = Js.Obj("isEnabled", turnOn),
                                           .Effect = New JsonObject From {{"kind", "page_row_key"}, {"page", "payments"}, {"key", Js.Str(cur, "key")}, {"fields", fields}}}, "payments", Js.Str(cur, "label") & If(turnOn, " turned on.", " turned off."))
                                   End Sub
            row.Add(info)
            row.Add(sw)
            row.Add(Ui.Btn("Configure", ChrW(&HE713), outline:=True, click:=Sub() Configure(cur)))
            list.Add(New Spacer(1, True))
            list.Add(row)
        Next
        Dim two As New Columns(2, 260, 16) With {.Weights = {3, 1}, .Stretch = False}
        two.Add(list)
        If prefs.IsOn("pm2-default", "pm2-default-panel") Then
            Dim dp = Panel(ChrW(&HEA18), "Default Payment Method", "Pre-selected at checkout. Customers can still choose another.")
            For Each m In methods
                Dim cur = m
                Dim d As New Drawn(30, Sub(g, r)
                                           Dim en = Js.Bool(cur, "isEnabled")
                                           Dim isDef = Js.Bool(cur, "isDefault")
                                           Theme.Smooth(g)
                                           Using pen As New Pen(If(isDef, Theme.Blue, Theme.G400), 1.6F) : g.DrawEllipse(pen, 1, 7, 16, 16) : End Using
                                           If isDef Then
                                               Using br As New SolidBrush(Theme.Blue) : g.FillEllipse(br, 5, 11, 8, 8) : End Using
                                           End If
                                           TextRenderer.DrawText(g, Js.Str(cur, "label"), Theme.Body, New Point(26, 7), If(en, Theme.G800, Theme.G400), TextFormatFlags.NoPadding)
                                           If Not en Then TextRenderer.DrawText(g, "Disabled", Theme.Small, New Rectangle(0, 0, r.Width, 30), Theme.G400, TextFormatFlags.Right Or TextFormatFlags.VerticalCenter)
                                       End Sub) With {.Cursor = If(Js.Bool(cur, "isEnabled"), Cursors.Hand, Cursors.Default)}
                AddHandler d.Click, Async Sub()
                                        If Not Js.Bool(cur, "isEnabled") OrElse Js.Bool(cur, "isDefault") Then Return
                                        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/payment-settings2/" & Js.Str(cur, "key") & "/default", .Label = "Default payment " & Js.Str(cur, "label")}, "payments", Js.Str(cur, "label") & " is now the default.")
                                    End Sub
                dp.Add(d)
            Next
            two.Add(dp)
        End If
        col.Add(two)
        Return col
    End Function

    Private Sub Configure(m As JsonObject)
        Dim fields = Js.Objs(Js.Arr(m, "fields")).ToList()
        Dim filled = If(TryCast(Js.Field(m, "filled"), JsonObject), New JsonObject())
        Dim f As New FormDialog("Configure " & Js.Str(m, "label"), 520)
        f.AddMulti("text", "Text shown at checkout (optional)", Js.Str(m, "text"), 60)
        For Each fd In fields
            Dim k = Js.Str(fd, "key")
            Dim opts = Js.Arr(fd, "options")
            If opts.Count > 0 Then
                f.AddPick("field_" & k, Js.Str(fd, "label"), {"|" & If(Js.Bool(filled, k), "Keep saved value", "Choose…")}.Concat(opts.Select(Function(o) o?.ToString() & "|" & o?.ToString())), "")
            Else
                f.AddText("field_" & k, Js.Str(fd, "label"), "", placeholder:=If(Js.Bool(filled, k), "•••••• saved — leave blank to keep", "Not set"))
            End If
        Next
        f.AddCheck("enable", "Enable this method", Js.Bool(m, "isEnabled"))
        f.Validator = Function(d)
                          If d.Bool("enable") AndAlso fields.Any(Function(fd) Not Js.Bool(filled, Js.Str(fd, "key")) AndAlso d.Val("field_" & Js.Str(fd, "key")).Trim() = "") Then Return "Fill in every field before enabling this method."
                          Return Nothing
                      End Function
        f.OnSave = Async Function(d)
                       Dim it As New OutboxItem With {.Method = "PUT", .Path = "/api/ecommerce/payment-settings2/" & Js.Str(m, "key"), .Label = "Payment " & Js.Str(m, "label"), .Multipart = True}
                       it.Fields("name") = Js.Str(m, "label")
                       it.Fields("text") = d.Val("text").Trim()
                       it.Fields("is_enabled") = If(d.Bool("enable"), "1", "0")
                       it.Fields("keep_blank") = "1"
                       For Each fd In fields
                           it.Fields("field_" & Js.Str(fd, "key")) = d.Val("field_" & Js.Str(fd, "key")).Trim()
                       Next
                       Dim configured = fields.All(Function(fd) Js.Bool(filled, Js.Str(fd, "key")) OrElse d.Val("field_" & Js.Str(fd, "key")).Trim() <> "")
                       it.Effect = New JsonObject From {{"kind", "page_row_key"}, {"page", "payments"}, {"key", Js.Str(m, "key")}, {"fields", Js.Obj("text", d.Val("text").Trim(), "isEnabled", d.Bool("enable"), "configured", configured)}}
                       Return Await PageActions.SendAsync(Me, it, "payments", Js.Str(m, "label") & " settings saved.")
                   End Function
        f.ShowDialog(FindForm())
    End Sub

    ' ── Login & OTP ──
    Private Function BuildLogin() As Control
        Dim prefs = DisplayOptions.For("ecom_login_settings_display")
        Dim d = If(TryCast(Js.Field(Data, "auth"), JsonObject), New JsonObject())
        Dim fbData = If(TryCast(Js.Field(d, "firebase"), JsonObject), New JsonObject())
        Dim col As New VStack(12)
        Dim otp As New Switch("", Js.Bool(d, "otpEnabled"))
        Dim pw As New Switch("", Js.Field(d, "passwordLogin") Is Nothing OrElse Js.Bool(d, "passwordLogin"))
        Dim cc = WInput.Make("+91") : cc.Text = Js.Str(d, "countryCode", "+91")
        Dim fb As New Dictionary(Of String, WInput)
        For Each k In {"apiKey", "authDomain", "projectId", "appId", "messagingSenderId"}
            Dim w = WInput.Make() : w.Text = Js.Str(fbData, k)
            fb(k) = w
        Next
        fb("apiKey").Box.PlaceholderText = "AIzaSy…" : fb("authDomain").Box.PlaceholderText = "your-project.firebaseapp.com"
        fb("projectId").Box.PlaceholderText = "your-project" : fb("appId").Box.PlaceholderText = "1:1234567890:web:abc123" : fb("messagingSenderId").Box.PlaceholderText = "1234567890"
        Dim configured = Function() {"apiKey", "authDomain", "projectId", "appId"}.All(Function(k) fb(k).Text.Trim() <> "")
        Dim status As New Drawn(46, Sub(g, r)
                                        Dim live = otp.Checked AndAlso configured()
                                        Theme.Smooth(g)
                                        Using p = Theme.RoundRect(New RectangleF(0, 0, r.Width - 1, 45), 10)
                                            Using br As New SolidBrush(If(live, Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(&HFF, &HFB, &HEB))) : g.FillPath(br, p) : End Using
                                            Using pen As New Pen(If(live, Color.FromArgb(&HA7, &HF3, &HD0), Color.FromArgb(&HFD, &HE6, &H8A))) : g.DrawPath(pen, p) : End Using
                                        End Using
                                        TextRenderer.DrawText(g, If(live, "Mobile OTP login is live on your store.", "Customers log in with email/mobile + password. Set up Firebase to turn on OTP login."), Theme.BodyBold, New Rectangle(14, 0, r.Width - 20, 46), If(live, Color.FromArgb(6, &H5F, &H46), Color.FromArgb(&H92, &H40, &HE)), TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis)
                                    End Sub)
        AddHandler otp.Toggled, Sub() status.Invalidate()
        For Each w In fb.Values
            AddHandler w.TextChanged, Sub() status.Invalidate()
        Next
        If prefs.IsOn("ls-sections", "ls-status") Then col.Add(status)
        If prefs.IsOn("ls-sections", "ls-options") Then
            Dim p = Panel(ChrW(&HE72E), "Login options")
            Dim row = Function(title As String, subtitle As String, right As Control) As Control
                          Dim c As New Columns(2, 60, 12) With {.Weights = {6, 1}}
                          Dim v As New VStack(2)
                          v.Add(New TextBlock(title, Theme.BodyBold, Theme.G800))
                          v.Add(New TextBlock(subtitle, Theme.Small, Theme.G500))
                          c.Add(v) : c.Add(right)
                          Return c
                      End Function
            p.Add(row("Mobile OTP login & sign-up", "Customers enter their mobile number and verify with an OTP. New numbers get an account and then fill in their name, email and addresses.", otp))
            p.Add(New Spacer(1, True))
            p.Add(row("Allow password login for customers", "Customers who have set a password can log in with mobile/email + password. Staff login is never affected.", pw))
            p.Add(New Spacer(1, True))
            p.Add(row("Country code", "Added in front of the number customers type.", cc))
            col.Add(p)
        End If
        If prefs.IsOn("ls-sections", "ls-firebase") Then
            Dim p = Panel(ChrW(&HE753), "Firebase web config", "These values identify your Firebase project; they are public (they go to the browser) — no secret key is needed.")
            Dim paste = WInput.Make("const firebaseConfig = { apiKey: ""AIza…"", authDomain: ""…"", projectId: ""…"", appId: ""1:…"" };", "", True)
            AddHandler paste.TextChanged, Sub()
                                              For Each k In fb.Keys
                                                  Dim mm = Regex.Match(paste.Text, k & "\s*:\s*[""']([^""']+)[""']")
                                                  If mm.Success Then fb(k).Text = mm.Groups(1).Value
                                              Next
                                          End Sub
            p.Add(New Field("Quick fill: paste the whole firebaseConfig code here", paste))
            p.Add(Two(New Field("API key", fb("apiKey")), New Field("Auth domain", fb("authDomain"))))
            p.Add(Two(New Field("Project ID", fb("projectId")), New Field("App ID", fb("appId"))))
            p.Add(New Field("Messaging sender ID (optional)", fb("messagingSenderId")))
            col.Add(p)
        End If
        If prefs.IsOn("ls-sections", "ls-steps") Then
            Dim p = Panel(ChrW(&HE897), "How to set up Firebase OTP", "About 10 minutes, one time.")
            Dim n = 0
            For Each s In {"Open console.firebase.google.com and create a project (any name).", "Add a Web app (the </> icon) and copy its firebaseConfig.", "Build → Authentication → Sign-in method → turn on Phone.", "Authentication → Settings → Authorized domains → add your shop domain.", "Paste the config above, turn on Mobile OTP login and Save."}
                n += 1
                Dim num = n, txt = s
                p.Add(Of Control)(New Drawn(26, Sub(g, r)
                                        Theme.Smooth(g)
                                        Using br As New SolidBrush(Theme.Magenta) : g.FillEllipse(br, 0, 2, 22, 22) : End Using
                                        TextRenderer.DrawText(g, num.ToString(), Theme.BodyBold, New Rectangle(0, 2, 22, 22), Color.White, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
                                        TextRenderer.DrawText(g, txt, Theme.Body, New Rectangle(32, 0, r.Width - 32, 26), Theme.G700, TextFormatFlags.VerticalCenter Or TextFormatFlags.EndEllipsis)
                                    End Sub))
            Next
            col.Add(p)
        End If
        Dim bar As New CardBox(Nothing, "", 12)
        Dim br_ As New HRow(8) With {.RightAlign = True}
        br_.Add(Ui.Btn("Save Settings", Theme.IcSave, Theme.Magenta, click:=Async Sub()
                                                                                If otp.Checked AndAlso Not configured() Then Toast("Fill in the Firebase config first, or keep OTP login off.", True) : Return
                                                                                Dim fbo As New JsonObject()
                                                                                For Each kv In fb : fbo(kv.Key) = kv.Value.Text.Trim() : Next
                                                                                Dim body = Js.Obj("otpEnabled", otp.Checked, "passwordLogin", pw.Checked, "countryCode", cc.Text.Trim())
                                                                                body("firebase") = fbo
                                                                                Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/auth-settings", .Label = "Login settings", .Body = body,
                                                                                    .Effect = New JsonObject From {{"kind", "page_set"}, {"page", "business"}, {"path", New JsonArray("auth")}, {"value", Js.Copy(body)}}}, "business", "Saved — the store's login page uses these settings now.")
                                                                            End Sub))
        bar.Add(br_)
        col.Add(bar)
        Return col
    End Function
End Class
