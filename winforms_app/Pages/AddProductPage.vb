Imports System.Drawing
Imports System.IO
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Add Product" as on the website: Basic Info, Pricing &amp; Stock, Categorization, Sizes / Units and
''' Specifications on the left; Product Images and Organization on the right. Saved at once when online;
''' offline it is kept on this computer (photos too), shows in Billing straight away and uploads later.</summary>
Public Class AddProductPage
    Inherits PageBase

    Private ReadOnly _display As New DisplayOptions("ecom_add_product2_display",
        New DisplayGroup("ap2-basic", "Basic Info", "ap2-slug|Slug", "ap2-sku|SKU", "ap2-hsn|HSN Code", "ap2-barcode|Barcode / QR Code", "ap2-desc|Description"),
        New DisplayGroup("ap2-price", "Pricing & Stock", "ap2-sale|Sale Price", "ap2-stock|Stock Quantity", "ap2-gst|GST Rate", "ap2-qty|Quantity"),
        New DisplayGroup("ap2-cat", "Categorization", "ap2-category|Category", "ap2-brand|Brand", "ap2-unit|Unit"),
        New DisplayGroup("ap2-sizes", "Sizes / Units"),
        New DisplayGroup("ap2-specs", "Specifications"),
        New DisplayGroup("ap2-media", "Product Images", "ap2-image|Featured Image", "ap2-gallery|Gallery"),
        New DisplayGroup("ap2-org", "Organization", "ap2-status|Status", "ap2-badge|Badge Tag", "ap2-itemtype|Item Type", "ap2-home|Show on Home"))

    Private ReadOnly _scroll As New Panel With {.Dock = DockStyle.Fill, .AutoScroll = True, .BackColor = Theme.Page}

    ' fields
    Private ReadOnly _name As WInput = WInput.Make("e.g. Aashirvaad Atta 5kg")
    Private ReadOnly _slug As WInput = WInput.Make("auto-generated")
    Private ReadOnly _sku As WInput = WInput.Make("e.g. SKU-00123")
    Private ReadOnly _hsn As WInput = WInput.Make("For GST")
    Private ReadOnly _barcode As WInput = WInput.Make("Scan or leave blank (automatic)", Theme.IcBarcode)
    Private ReadOnly _desc As WInput = WInput.Make("What should customers know about this product?", "", multiline:=True)
    Private ReadOnly _unit As ComboBox = Ui.Combo({"No unit"})
    Private ReadOnly _qty As WInput = WInput.Make("e.g. 10")
    Private ReadOnly _price As WInput = WInput.Make("0.00", ChrW(&H20B9))
    Private ReadOnly _sale As WInput = WInput.Make("Optional", ChrW(&H20B9))
    Private ReadOnly _stock As WInput = WInput.Make("0")
    Private ReadOnly _gst As ComboBox = Ui.Combo({"0%"})
    Private ReadOnly _category As ComboBox = Ui.Combo({"Select category…"})
    Private ReadOnly _brand As ComboBox = Ui.Combo({"Select brand…"})
    Private ReadOnly _sizes As New DataGridView()
    Private ReadOnly _specs As New DataGridView()
    Private ReadOnly _photo As New PictureBox With {.SizeMode = PictureBoxSizeMode.Zoom, .BackColor = Color.FromArgb(&HF4, &HF4, &HF7)}
    Private ReadOnly _choosePhoto As WButton = WButton.Make("Choose photo", Theme.IcPhoto, Theme.Primary, outline:=True)
    Private ReadOnly _removePhoto As WButton = WButton.Make("Remove", Theme.IcDelete, Theme.Danger, outline:=True)
    Private ReadOnly _gallery As New FlowLayoutPanel With {.AutoScroll = True, .BackColor = Color.White}
    Private ReadOnly _addGallery As WButton = WButton.Make("Add photos", Theme.IcAdd, Theme.Primary, outline:=True)
    Private ReadOnly _published As New RadioButton With {.Text = "Published", .Checked = True, .AutoSize = True, .Font = Theme.Body, .BackColor = Color.White}
    Private ReadOnly _unpublished As New RadioButton With {.Text = "Unpublished", .AutoSize = True, .Font = Theme.Body, .BackColor = Color.White}
    Private ReadOnly _badge As ComboBox = Ui.Combo({"None"})
    Private ReadOnly _itemType As ComboBox = Ui.Combo({"Normal"})
    Private ReadOnly _home As New CheckBox With {.Text = "Show on home page", .AutoSize = True, .Font = Theme.Body, .BackColor = Color.White}
    Private ReadOnly _saveAnother As WButton = WButton.Make("Save & add another", Theme.IcAdd, Theme.Primary, outline:=True)
    Private ReadOnly _create As WButton = WButton.Make("Create Product", Theme.IcSave, Theme.Primary)
    Private ReadOnly _error As New Label With {.AutoSize = False, .ForeColor = Theme.Danger, .Font = Theme.BodyBold, .BackColor = Theme.Page}

    Private _photoPath As String
    Private ReadOnly _galleryPaths As New List(Of String)
    Private _cats As New List(Of JsonObject), _brands As New List(Of JsonObject)
    Private _badges As New List(Of (String, String)), _types As New List(Of (String, String)), _rates As New List(Of Double)

    ' sections: (group key, card, rows of controls laid out inside)
    Private ReadOnly _basic As New Card(), _pricing As New Card(), _catCard As New Card(), _sizesCard As New Card(), _specsCard As New Card(), _images As New Card(), _org As New Card()

    ' editing an existing product (0 = new)
    Private ReadOnly _productId As Integer
    Private _row As JsonObject
    Private _full As Boolean = True
    Private _serverPhoto As String
    Private _removePhotoFlag As Boolean
    Private ReadOnly _serverGallery As New List(Of JsonObject)
    Private ReadOnly _removedGallery As New List(Of Integer)
    Private _variantIds As String = ""
    Private _type As String = "physical"
    Private _campaignOn As Boolean
    Private _campaignPrice As String = ""
    Private ReadOnly _delete As WButton = WButton.Make("Delete", Theme.IcDelete, Theme.Danger, outline:=True)

    Public Overrides ReadOnly Property PageTitle As String
        Get
            Return If(_productId = 0, "Add Product", "Edit Product")
        End Get
    End Property
    Public Overrides ReadOnly Property PageSubtitle As String
        Get
            Return If(_productId = 0, "Fill in the details for your new product", Js.Str(_row, "name", "Change the details and save"))
        End Get
    End Property
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New(Optional productId As Integer = 0)
        _productId = productId
        Controls.Add(_scroll)
        Ui.DoubleBuffer(_scroll)
        For Each c In {_basic, _pricing, _catCard, _sizesCard, _specsCard, _images, _org}
            _scroll.Controls.Add(c)
        Next
        _scroll.Controls.AddRange(New Control() {_saveAnother, _create, _error, _delete})
        _delete.Visible = productId <> 0
        AddHandler _delete.Click, Async Sub() Await DeleteAsync()
        If productId <> 0 Then
            _create.Text = "Save Changes"
            _create.Width = _create.PreferredWidth()
            _saveAnother.Visible = False
        End If

        _basic.Controls.Add(New CardHeading("Basic Info", Theme.IcInfo))
        _pricing.Controls.Add(New CardHeading("Pricing & Stock", Theme.IcMoney))
        _catCard.Controls.Add(New CardHeading("Categorization", Theme.IcList))
        _sizesCard.Controls.Add(New CardHeading("Sizes / Units (optional)", Theme.IcPackage))
        _specsCard.Controls.Add(New CardHeading("Specifications (optional)", Theme.IcList))
        _images.Controls.Add(New CardHeading("Product Images", Theme.IcPhoto))
        _org.Controls.Add(New CardHeading("Organization", Theme.IcSettings))

        Ui.StyleGrid(_sizes)
        _sizes.AllowUserToAddRows = True
        _sizes.SelectionMode = DataGridViewSelectionMode.CellSelect
        _sizes.EditMode = DataGridViewEditMode.EditOnEnter
        _sizes.Columns.Add("label", "Size (e.g. 500 Gram)")
        _sizes.Columns.Add("mrp", "MRP (₹)")
        _sizes.Columns.Add("price", "Selling Price (₹)")
        _sizes.Columns.Add("stock", "Stock")
        _sizes.Columns.Add(New DataGridViewCheckBoxColumn With {.Name = "def", .HeaderText = "Default", .FillWeight = 50})
        Ui.StyleGrid(_specs)
        _specs.AllowUserToAddRows = True
        _specs.SelectionMode = DataGridViewSelectionMode.CellSelect
        _specs.EditMode = DataGridViewEditMode.EditOnEnter
        _specs.Columns.Add("name", "Name (e.g. Material)")
        _specs.Columns.Add("value", "Value (e.g. Cotton)")

        AddHandler _choosePhoto.Click, Sub() PickPhoto()
        AddHandler _removePhoto.Click, Sub()
                                           _photoPath = Nothing
                                           _photo.Image = Nothing
                                           _removePhotoFlag = True
                                       End Sub
        AddHandler _addGallery.Click, Sub() PickGallery()
        AddHandler _create.Click, Async Sub() Await SaveAsync(False)
        AddHandler _saveAnother.Click, Async Sub() Await SaveAsync(True)
        AddHandler _name.Box.TextChanged, Sub() _slug.Box.PlaceholderText = If(_name.Text.Trim() = "", "auto-generated", Slugify(_name.Text))
        AddHandler _barcode.Box.Leave, Sub() CheckBarcode()
        AddHandler _display.Changed, Sub() LayoutAll()
        AddHandler _scroll.Resize, Sub() LayoutAll()
        AddHandler AppState.I.DataChanged, Sub() If Not Visible Then LoadChoices()
        LoadChoices()
        If productId <> 0 Then LoadProduct()
    End Sub

    Public Overrides Sub OnOpened()
        If _name.Text = "" AndAlso _productId = 0 Then LoadChoices()
        LayoutAll()
        _name.Box.Focus()
    End Sub

    Public Overrides Function HandleKey(k As Keys) As Boolean
        If k = (Keys.Control Or Keys.S) Then
            Dim unused = SaveAsync(False)
            Return True
        End If
        Return False
    End Function

    ' ───────── choices (categories, brands, GST, badges — from this computer) ─────────
    Private Sub LoadChoices()
        Dim s = AppState.I
        Dim form = Store.Read("product_form")
        _cats = s.List("categories").Where(Function(c) Js.Str(c, "status", "active") = "active").ToList()
        _brands = s.List("brands").Where(Function(b) Js.Str(b, "status", "active") = "active").ToList()
        Refill(_category, {"Select category…"}.Concat(_cats.Select(Function(c) Js.Str(c, "name"))))
        Refill(_brand, {"Select brand…"}.Concat(_brands.Select(Function(b) Js.Str(b, "name"))))
        Dim units = Js.Arr(form, "units").Select(Function(u) u.ToString()).ToList()
        If units.Count = 0 Then units = New List(Of String) From {"KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"}
        Refill(_unit, {"No unit"}.Concat(units))
        _rates = Js.Objs(Js.Arr(form, "gstRates")).Select(Function(g) Js.Num(g, "rate")).ToList()
        If _rates.Count = 0 Then _rates = New List(Of Double) From {0, 5, 12, 18, 28}
        Dim def = Js.Objs(Js.Arr(form, "gstRates")).FirstOrDefault(Function(g) Js.Bool(g, "isDefault"))
        Refill(_gst, _rates.Select(Function(r) r.ToString("0.##") & "%"))
        If def IsNot Nothing Then _gst.SelectedIndex = Math.Max(0, _rates.IndexOf(Js.Num(def, "rate")))
        _badges = Js.Objs(Js.Arr(form, "badges")).Where(Function(b) Js.Str(b, "slug") <> "none").Select(Function(b) (Js.Str(b, "slug"), Js.Str(b, "label"))).ToList()
        _types = Js.Objs(Js.Arr(form, "itemTypes")).Where(Function(b) Js.Str(b, "slug") <> "normal").Select(Function(b) (Js.Str(b, "slug"), Js.Str(b, "label"))).ToList()
        Refill(_badge, {"None"}.Concat(_badges.Select(Function(b) b.Item2)))
        Refill(_itemType, {"Normal"}.Concat(_types.Select(Function(b) b.Item2)))
    End Sub

    Private Shared Sub Refill(c As ComboBox, items As IEnumerable(Of String))
        Dim keep = c.SelectedIndex
        c.BeginUpdate()
        c.Items.Clear()
        For Each i In items : c.Items.Add(i) : Next
        c.EndUpdate()
        c.SelectedIndex = If(keep > 0 AndAlso keep < c.Items.Count, keep, 0)
    End Sub

    Private Shared Function Slugify(s As String) As String
        Return System.Text.RegularExpressions.Regex.Replace(s.ToLowerInvariant().Trim(), "[^a-z0-9]+", "-").Trim("-"c)
    End Function

    Private Sub CheckBarcode()
        Dim code = _barcode.Text.Trim()
        If code = "" Then Return
        Dim other = AppState.I.List("products").FirstOrDefault(Function(p) String.Equals(Js.Str(p, "barcode"), code, StringComparison.OrdinalIgnoreCase))
        If other IsNot Nothing Then Toast("This barcode is already used by '" & Js.Str(other, "name") & "'.", True)
    End Sub

    ' ───────── photos ─────────
    Private Sub PickPhoto()
        Using d As New OpenFileDialog With {.Filter = "Pictures|*.jpg;*.jpeg;*.png;*.webp;*.gif", .Title = "Choose the product photo"}
            If d.ShowDialog(Me) <> DialogResult.OK Then Return
            _photoPath = d.FileName
            _removePhotoFlag = False
            Try
                Using fs As New FileStream(d.FileName, FileMode.Open, FileAccess.Read)
                    Using im = Image.FromStream(fs) : _photo.Image = New Bitmap(im) : End Using
                End Using
            Catch
                _photo.Image = Nothing
            End Try
        End Using
    End Sub

    Private Sub PickGallery()
        Using d As New OpenFileDialog With {.Filter = "Pictures|*.jpg;*.jpeg;*.png;*.webp;*.gif", .Multiselect = True, .Title = "Choose gallery photos"}
            If d.ShowDialog(Me) <> DialogResult.OK Then Return
            For Each f In d.FileNames
                _galleryPaths.Add(f)
                Dim pb As New PictureBox With {.Size = New Size(72, 72), .SizeMode = PictureBoxSizeMode.Zoom, .BackColor = Color.FromArgb(&HF4, &HF4, &HF7), .Margin = New Padding(0, 0, 8, 8), .Cursor = Cursors.Hand, .Tag = f}
                Try
                    Using fs As New FileStream(f, FileMode.Open, FileAccess.Read)
                        Using im = Image.FromStream(fs) : pb.Image = New Bitmap(im) : End Using
                    End Using
                Catch
                End Try
                AddHandler pb.Click, Sub()
                                         _galleryPaths.Remove(CStr(pb.Tag))
                                         _gallery.Controls.Remove(pb)
                                     End Sub
                _gallery.Controls.Add(pb)
            Next
        End Using
    End Sub

    ' ───────── save ─────────
    Private _busy As Boolean
    Private Async Function SaveAsync(another As Boolean) As Task
        If _busy Then Return
        _error.Text = ""
        Dim name = _name.Text.Trim()
        Dim sizes = ReadSizes()
        Dim price = Num(_price.Text), sale = Num(_sale.Text)
        If name = "" Then ShowError("Product Name is required.") : _name.Box.Focus() : Return
        If sizes.Count = 0 AndAlso Not price.HasValue Then ShowError("Price is required (or add Sizes / Units).") : _price.Box.Focus() : Return
        If sale.HasValue AndAlso price.HasValue AndAlso sale.Value > 0 AndAlso sale.Value >= price.Value Then ShowError("Sale Price must be lower than Price.") : Return
        Dim stockTxt = _stock.Text.Trim()
        Dim stockN As Integer
        If stockTxt <> "" AndAlso (Not Integer.TryParse(stockTxt, stockN) OrElse stockN < 0) Then ShowError("Stock must be a whole number.") : Return

        Dim unit = If(_unit.SelectedIndex > 0, CStr(_unit.SelectedItem), "")
        Dim catId = If(_category.SelectedIndex > 0, Js.Int(_cats(_category.SelectedIndex - 1), "id").ToString(), "")
        Dim brandId = If(_brand.SelectedIndex > 0, Js.Int(_brands(_brand.SelectedIndex - 1), "id").ToString(), "")
        Dim gst = If(_gst.SelectedIndex >= 0 AndAlso _gst.SelectedIndex < _rates.Count, _rates(_gst.SelectedIndex), 0)
        Dim badge = If(_badge.SelectedIndex > 0, _badges(_badge.SelectedIndex - 1).Item1, "none")
        Dim itemType = If(_itemType.SelectedIndex > 0, _types(_itemType.SelectedIndex - 1).Item1, "normal")
        Dim sizesJson As New JsonArray()
        For Each z In sizes : sizesJson.Add(z) : Next
        Dim specs As New JsonArray()
        For Each r As DataGridViewRow In _specs.Rows
            If r.IsNewRow Then Continue For
            Dim n = If(CStr(r.Cells("name").Value), "").Trim()
            Dim v = If(CStr(r.Cells("value").Value), "").Trim()
            If Not String.IsNullOrEmpty(n) AndAlso Not String.IsNullOrEmpty(v) Then specs.Add(New JsonObject From {{"name", n}, {"value", v}})
        Next

        ' Same fields the website's form sends.
        Dim fields As New Dictionary(Of String, String) From {
            {"name", name}, {"slug", _slug.Text.Trim()}, {"sku", _sku.Text.Trim()}, {"hsn_code", _hsn.Text.Trim()}, {"barcode", _barcode.Text.Trim()},
            {"description", _desc.Text.Trim()}, {"category_id", catId}, {"subcategory_id", ""}, {"brand_id", brandId}, {"unit", unit}, {"product_type", "physical"},
            {"price", If(price.HasValue, price.Value.ToString(Globalization.CultureInfo.InvariantCulture), "")}, {"sale_price", If(sale.HasValue, sale.Value.ToString(Globalization.CultureInfo.InvariantCulture), "")},
            {"stock_qty", If(stockTxt = "", "0", stockTxt)}, {"gst_rate", gst.ToString(Globalization.CultureInfo.InvariantCulture)},
            {"status", If(_published.Checked, "active", "inactive")}, {"badge_tag", badge}, {"item_type", itemType},
            {"campaign_price", ""}, {"quantity", _qty.Text.Trim()}, {"variant_ids", _variantIds}, {"sizes", sizesJson.ToJsonString()}, {"specs", specs.ToJsonString()}}
        If _home.Checked Then fields("show_on_home") = "on"
        If _productId <> 0 Then
            fields("product_type") = _type
            fields("variant_ids") = _variantIds
            If _campaignOn Then fields("is_campaign") = "on"
            fields("campaign_price") = _campaignPrice
            If _removePhotoFlag AndAlso _photoPath Is Nothing Then fields("remove_image") = "1"
            If _removedGallery.Count > 0 Then fields("removed_gallery_ids") = String.Join(",", _removedGallery)
        End If
        ' Photos are copied into the app's folder, so they upload even if the originals are moved.
        Dim files As New Dictionary(Of String, String)
        If _photoPath IsNot Nothing Then files("image") = Store.KeepFile(_photoPath)
        For i = 0 To _galleryPaths.Count - 1
            files("gallery_images#" & i) = Store.KeepFile(_galleryPaths(i))
        Next

        _busy = True : _create.Enabled = False : _saveAnother.Enabled = False
        Try
            Dim status = If(_published.Checked, "active", "inactive")
            Dim catNode = If(catId = "", Nothing, JsonValue.Create(CInt(catId)))
            Dim brandNode = If(brandId = "", Nothing, JsonValue.Create(CInt(brandId)))
            Dim saleNode = If(sale.HasValue, JsonValue.Create(sale.Value), Nothing)
            Dim item As OutboxItem
            If _productId = 0 Then
                item = New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/products2", .Label = "New product: " & name, .Multipart = True, .Fields = fields, .Files = files, .Refresh = New List(Of String) From {"products"}}
                ' Shows in Billing and lists at once; uploads when the internet is back.
                item.Effect = New JsonObject From {{"kind", "product_new"}, {"product", New JsonObject From {
                    {"id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}, {"localRef", item.Id}, {"name", name}, {"sku", _sku.Text.Trim()}, {"barcode", _barcode.Text.Trim()},
                    {"price", If(price, 0)}, {"salePrice", saleNode}, {"gstRate", gst}, {"stock", If(stockTxt = "", 0, stockN)},
                    {"unit", unit}, {"categoryId", catNode}, {"brandId", brandNode}, {"status", status}, {"type", "physical"},
                    {"localImage", If(files.ContainsKey("image"), files("image"), Nothing)},
                    {"sizes", New JsonArray()}, {"updatedAt", DateTime.UtcNow.ToString("o")}}}}
            ElseIf _full Then
                item = New OutboxItem With {.Method = "PUT", .Path = "/api/ecommerce/products2/" & _productId, .Label = "Edit product: " & name, .Multipart = True, .Fields = fields, .Files = files, .Refresh = New List(Of String) From {"products"}}
                item.Effect = New JsonObject From {{"kind", "product"}, {"id", _productId}, {"fields", New JsonObject From {
                    {"name", name}, {"price", If(price, 0)}, {"salePrice", Js.Copy(saleNode)}, {"stock", If(stockTxt = "", 0, stockN)}, {"unit", unit}, {"sku", _sku.Text.Trim()},
                    {"barcode", _barcode.Text.Trim()}, {"categoryId", Js.Copy(catNode)}, {"brandId", Js.Copy(brandNode)}, {"status", status}, {"gstRate", gst}}}}
            Else
                ' Offline and the full form was never downloaded: the main details still change.
                Dim changes As New JsonObject From {{"name", name}, {"price", If(price, 0)}, {"salePrice", Js.Copy(saleNode)}, {"gstRate", gst}, {"unit", unit}, {"sku", _sku.Text.Trim()},
                    {"barcode", _barcode.Text.Trim()}, {"hsn", _hsn.Text.Trim()}, {"categoryId", Js.Copy(catNode)}, {"brandId", Js.Copy(brandNode)}, {"status", status}}
                If Not Js.IsNull(_row, "stock") Then changes("stock") = If(stockTxt = "", 0, stockN)
                item = New OutboxItem With {.Method = "PATCH", .Path = "/api/app/v1/products/" & _productId, .Label = "Edit product: " & name, .Body = changes, .Refresh = New List(Of String) From {"products"}}
                item.Effect = New JsonObject From {{"kind", "product"}, {"id", _productId}, {"fields", Js.Copy(changes)}}
            End If
            Dim r = Await AppState.I.SendNowAsync(item)
            If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden OrElse r.Outcome = ApiOutcome.Unauthorized Then
                ShowError(r.Message)
                Return
            End If
            If _productId <> 0 AndAlso Not _full AndAlso _photoPath IsNot Nothing Then
                Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "POST", .Path = "/api/app/v1/products/" & _productId & "/image", .Label = "New photo: " & name, .Files = New Dictionary(Of String, String) From {{"image", files("image")}}, .Refresh = New List(Of String) From {"products"}})
            End If
            If r.IsOk Then
                Toast(If(_productId = 0, "Product added.", "Saved."))
                If _productId = 0 AndAlso another Then
                    ' the next product (usually the next size) stays linked to the one just made
                    Dim nid = Js.Int(r.Data, "id")
                    If nid > 0 Then _variantIds = If(_variantIds = "", nid.ToString(), _variantIds & "," & nid)
                End If
            Else
                Toast("Saved on this computer — it goes to the website when the internet is back.")
            End If
            If _productId <> 0 Then
                Main?.Back()
                Return
            End If
            ClearForm(keepChoices:=another)
            If Not another Then Main?.Pick("/admin/ecommerce/products")
        Finally
            _busy = False : _create.Enabled = True : _saveAnother.Enabled = True
        End Try
    End Function

    ' ───────── editing: fill the form ─────────
    Private Sub LoadProduct()
        _row = AppState.I.List("products").FirstOrDefault(Function(p) Js.Int(p, "id") = _productId)
        If _row IsNot Nothing Then Fill(_row, False)
        Dim saved = AppState.I.SavedProduct(_productId)
        If saved IsNot Nothing Then
            Fill(saved, True)
        Else
            _full = False
            Dim unused = FetchFullAsync()
        End If
    End Sub

    Private Async Function FetchFullAsync() As Task
        Dim r = Await AppState.I.Api.GetAsync("/api/app/v1/products/" & _productId)
        If Not r.IsOk OrElse IsDisposed Then Return
        Dim x = TryCast(Js.Copy(Js.Field(r.Data, "product")), JsonObject)
        If x Is Nothing Then Return
        AppState.I.SaveProduct(_productId, x)
        Fill(x, True)
        LayoutAll()
    End Function

    Private Shared Function N(v As JsonNode) As String
        If v Is Nothing Then Return ""
        Dim d = Js.ToNum(v, Double.NaN)
        If Double.IsNaN(d) Then Return ""
        Return d.ToString("0.##", Globalization.CultureInfo.InvariantCulture)
    End Function

    Private Sub Fill(x As JsonObject, full As Boolean)
        _full = full
        _name.Text = Js.Str(x, "name")
        _sku.Text = Js.Str(x, "sku")
        _hsn.Text = Js.Str(x, "hsn")
        _barcode.Text = Js.Str(x, "barcode")
        _price.Text = N(Js.Field(x, "price"))
        _sale.Text = N(Js.Field(x, "salePrice"))
        _stock.Text = If(Js.IsNull(x, "stock"), "", Js.Int(x, "stock").ToString())
        _qty.Text = N(Js.Field(x, "quantity"))
        _type = Js.Str(x, "type", "physical")
        Dim unit = Js.Str(x, "unit").Trim()
        If unit <> "" AndAlso Not _unit.Items.Cast(Of Object)().Any(Function(o) o.ToString() = unit) Then _unit.Items.Add(unit)
        _unit.SelectedIndex = If(unit = "", 0, _unit.Items.Cast(Of Object)().ToList().FindIndex(Function(o) o.ToString() = unit))
        Dim rate = Js.Num(x, "gstRate")
        Dim ri = _rates.IndexOf(rate)
        If ri < 0 Then _rates.Add(rate) : _gst.Items.Add(rate.ToString("0.##") & "%") : ri = _rates.Count - 1
        _gst.SelectedIndex = ri
        Dim ci = _cats.FindIndex(Function(c) Js.Int(c, "id") = Js.Int(x, "categoryId"))
        _category.SelectedIndex = If(ci >= 0, ci + 1, 0)
        Dim bi = _brands.FindIndex(Function(b) Js.Int(b, "id") = Js.Int(x, "brandId"))
        _brand.SelectedIndex = If(bi >= 0, bi + 1, 0)
        _published.Checked = Js.Str(x, "status") <> "inactive"
        _unpublished.Checked = Not _published.Checked
        _serverPhoto = Js.Str(x, "image")
        If _serverPhoto <> "" AndAlso _photoPath Is Nothing Then
            Dim src = _serverPhoto
            Dim im = Img.Get(src, 600, Sub(i) If _photoPath Is Nothing AndAlso Not IsDisposed Then _photo.Image = i)
            If im IsNot Nothing Then _photo.Image = im
        End If
        If Not full Then Return
        _slug.Text = Js.Str(x, "slug")
        _desc.Text = Js.Str(x, "description").Replace(vbLf, vbCrLf).Replace(vbCr & vbCrLf, vbCrLf)
        _variantIds = String.Join(",", Js.Arr(x, "variantIds").Select(Function(v) Js.Text(v)))
        Dim bIdx = _badges.FindIndex(Function(b) b.Item1 = Js.Str(x, "badgeTag"))
        _badge.SelectedIndex = If(bIdx >= 0, bIdx + 1, 0)
        Dim tIdx = _types.FindIndex(Function(b) b.Item1 = Js.Str(x, "itemType"))
        _itemType.SelectedIndex = If(tIdx >= 0, tIdx + 1, 0)
        _home.Checked = Js.Bool(x, "showOnHome")
        _campaignOn = Js.Bool(x, "isCampaign")
        _campaignPrice = N(Js.Field(x, "campaignPrice"))
        ' sizes: the unit is added automatically, so show just the number ("250 Gram" -> "250")
        _sizes.Rows.Clear()
        For Each z In Js.Objs(Js.Arr(x, "sizes"))
            Dim label = Js.Str(z, "label")
            If unit <> "" AndAlso label.EndsWith(" " & unit, StringComparison.OrdinalIgnoreCase) Then
                Dim head = label.Substring(0, label.Length - unit.Length - 1).Trim()
                Dim dummy As Double
                If Double.TryParse(head, Globalization.NumberStyles.Any, Globalization.CultureInfo.InvariantCulture, dummy) Then label = head
            End If
            _sizes.Rows.Add(label, N(Js.Field(z, "mrp")), N(Js.Field(z, "price")), If(Js.IsNull(z, "stock"), "", Js.Int(z, "stock").ToString()), Js.Bool(z, "isDefault"))
        Next
        _specs.Rows.Clear()
        For Each sp In Js.Objs(Js.Arr(x, "specs"))
            _specs.Rows.Add(Js.Str(sp, "name"), Js.Str(sp, "value"))
        Next
        ' gallery already on the website (click to remove)
        _serverGallery.Clear()
        _serverGallery.AddRange(Js.Objs(Js.Arr(x, "gallery")))
        For Each c As Control In _gallery.Controls.Cast(Of Control)().ToList()
            If TypeOf c Is WebPicture Then _gallery.Controls.Remove(c) : c.Dispose()
        Next
        For Each g In _serverGallery
            Dim gid = Js.Int(g, "id")
            Dim wp As New WebPicture(72) With {.Margin = New Padding(0, 0, 8, 8), .Cursor = Cursors.Hand}
            wp.Source = Js.Str(g, "image")
            AddHandler wp.Click, Sub()
                                     _removedGallery.Add(gid)
                                     _gallery.Controls.Remove(wp)
                                 End Sub
            _gallery.Controls.Add(wp)
        Next
    End Sub

    Private Async Function DeleteAsync() As Task
        If _productId = 0 Then Return
        If Not Ui.Confirm(Me, "Delete """ & _name.Text & """? This cannot be undone.") Then Return
        Dim item As New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/products2/" & _productId, .Label = "Delete product: " & _name.Text, .Refresh = New List(Of String) From {"products"},
            .Effect = New JsonObject From {{"kind", "product_delete"}, {"ids", New JsonArray(JsonValue.Create(_productId))}}}
        Dim r = Await AppState.I.SendNowAsync(item)
        If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden Then Toast(r.Message, True) : Return
        Toast("Product deleted.")
        Main?.Back()
    End Function

    Private Function ReadSizes() As List(Of JsonObject)
        Dim l As New List(Of JsonObject)
        For Each r As DataGridViewRow In _sizes.Rows
            If r.IsNewRow Then Continue For
            Dim label = If(CStr(r.Cells("label").Value), "").Trim()
            If String.IsNullOrEmpty(label) Then Continue For
            Dim unit = If(_unit.SelectedIndex > 0, CStr(_unit.SelectedItem), "")
            If unit <> "" AndAlso Double.TryParse(label, Nothing) Then label = label & " " & unit
            Dim mrp = Num(CStr(r.Cells("mrp").Value)), pr = Num(CStr(r.Cells("price").Value))
            Dim st As Integer
            Dim stOk = Integer.TryParse(CStr(r.Cells("stock").Value), st)
            l.Add(New JsonObject From {{"label", label}, {"mrp", If(mrp, 0)}, {"price", If(pr.HasValue, JsonValue.Create(pr.Value), Nothing)}, {"stock", If(stOk, JsonValue.Create(st), Nothing)}, {"isDefault", CBool(If(r.Cells("def").Value, False))}})
        Next
        If l.Count > 0 AndAlso Not l.Any(Function(z) Js.Bool(z, "isDefault")) Then l(0)("isDefault") = True
        Return l
    End Function

    Private Shared Function Num(s As String) As Double?
        Dim d As Double
        If s IsNot Nothing AndAlso Double.TryParse(s.Trim(), Globalization.NumberStyles.Any, Globalization.CultureInfo.InvariantCulture, d) Then Return d
        Return Nothing
    End Function

    Private Sub ShowError(t As String)
        _error.Text = t
        Toast(t, True)
    End Sub

    Private Sub ClearForm(keepChoices As Boolean)
        For Each i In {_name, _slug, _sku, _hsn, _barcode, _desc, _qty, _price, _sale, _stock} : i.Text = "" : Next
        _sizes.Rows.Clear() : _specs.Rows.Clear()
        _photoPath = Nothing : _photo.Image = Nothing
        _galleryPaths.Clear() : _gallery.Controls.Clear()
        _home.Checked = False
        If Not keepChoices Then
            _category.SelectedIndex = 0 : _brand.SelectedIndex = 0 : _unit.SelectedIndex = 0 : _badge.SelectedIndex = 0 : _itemType.SelectedIndex = 0 : _published.Checked = True
        End If
        _name.Box.Focus()
    End Sub

    ' ───────── layout (website: 13/7 columns) ─────────
    Private Function Place(card As Card, x As Integer, y As Integer, w As Integer, rows As List(Of Control())) As Integer
        card.Controls(0).SetBounds(18, 14, w - 36, 34)
        Dim cy = 58
        For Each row In rows
            Dim n = row.Length
            Dim cw = (w - 36 - (n - 1) * 14) \ n
            Dim rowH = 0
            For i = 0 To n - 1
                Dim c = row(i)
                If TypeOf c Is FieldLabel Then Continue For
                c.SetBounds(18 + i * (cw + 14), cy, cw, c.Height)
                rowH = Math.Max(rowH, c.Height)
            Next
            cy += rowH + 12
        Next
        card.SetBounds(x, y, w, cy + 8)
        Return cy + 8
    End Function

    ''' <summary>A label above a control, as one block.</summary>
    Private Function Field(label As String, c As Control, Optional required As Boolean = False) As Control
        Dim p As New Panel With {.BackColor = Color.White, .Height = c.Height + 24}
        Dim l As New FieldLabel(label, required)
        l.Location = New Point(0, 0)
        p.Controls.Add(l)
        c.Location = New Point(0, 22)
        p.Controls.Add(c)
        AddHandler p.Resize, Sub() c.Width = p.Width
        Return p
    End Function

    Private _built As Boolean
    Private _fBlocks As New Dictionary(Of String, Control)
    Private Function Blk(key As String, label As String, c As Control, Optional required As Boolean = False) As Control
        Dim b As Control = Nothing
        If Not _fBlocks.TryGetValue(key, b) Then
            b = Field(label, c, required)
            _fBlocks(key) = b
        End If
        Return b
    End Function

    Private Sub LayoutAll()
        If _scroll.Width < 300 Then Return
        _scroll.SuspendLayout()
        Dim on_ = Function(g As String, i As String) _display.IsOn(g, i)
        Dim pad = 22, gap = 18
        Dim w = _scroll.ClientSize.Width - pad * 2
        Dim lw = (w - gap) * 13 \ 20, rw = w - lw - gap
        Dim y = pad

        ' Basic Info
        Dim rows As New List(Of Control())
        rows.Add({Blk("name", "Product Name", _name, True)})
        If on_("ap2-basic", "ap2-slug") Then rows.Add({Blk("slug", "Slug", _slug)})
        Dim skuHsn = {If(on_("ap2-basic", "ap2-sku"), Blk("sku", "SKU", _sku), Nothing), If(on_("ap2-basic", "ap2-hsn"), Blk("hsn", "HSN Code", _hsn), Nothing)}.Where(Function(c) c IsNot Nothing).ToArray()
        If skuHsn.Length > 0 Then rows.Add(skuHsn)
        If on_("ap2-basic", "ap2-barcode") Then rows.Add({Blk("barcode", "Barcode / QR Code", _barcode)})
        If on_("ap2-basic", "ap2-desc") Then rows.Add({Blk("desc", "Description", _desc)})
        Dim leftY = y
        Dim v_basic = ShowCard(_basic, _display.IsOn("ap2-basic"), rows)
        If v_basic Then leftY += Place(_basic, pad, leftY, lw, rows) + gap

        rows = New List(Of Control())
        Dim r1 = {If(on_("ap2-cat", "ap2-unit"), Blk("unit", "Unit", _unit), Nothing), If(on_("ap2-price", "ap2-qty"), Blk("qty", "Quantity (weight)", _qty), Nothing)}.Where(Function(c) c IsNot Nothing).ToArray()
        If r1.Length > 0 Then rows.Add(r1)
        rows.Add({Blk("price", "Price (₹)", _price, True), If(on_("ap2-price", "ap2-sale"), Blk("sale", "Sale Price (₹)", _sale), Nothing)}.Where(Function(c) c IsNot Nothing).ToArray())
        Dim r3 = {If(on_("ap2-price", "ap2-stock"), Blk("stock", "Stock Quantity", _stock), Nothing), If(on_("ap2-price", "ap2-gst"), Blk("gst", "GST Rate", _gst), Nothing)}.Where(Function(c) c IsNot Nothing).ToArray()
        If r3.Length > 0 Then rows.Add(r3)
        Dim v_pricing = ShowCard(_pricing, _display.IsOn("ap2-price"), rows)
        If v_pricing Then leftY += Place(_pricing, pad, leftY, lw, rows) + gap

        rows = New List(Of Control())
        Dim r4 = {If(on_("ap2-cat", "ap2-category"), Blk("category", "Category", _category), Nothing), If(on_("ap2-cat", "ap2-brand"), Blk("brand", "Brand", _brand), Nothing)}.Where(Function(c) c IsNot Nothing).ToArray()
        If r4.Length > 0 Then rows.Add(r4)
        Dim v_catCard = ShowCard(_catCard, _display.IsOn("ap2-cat") AndAlso r4.Length > 0, rows)
        If v_catCard Then leftY += Place(_catCard, pad, leftY, lw, rows) + gap

        _sizes.Height = 170
        rows = New List(Of Control()) From {New Control() {_sizes}}
        Dim v_sizesCard = ShowCard(_sizesCard, _display.IsOn("ap2-sizes"), rows)
        If v_sizesCard Then leftY += Place(_sizesCard, pad, leftY, lw, rows) + gap

        _specs.Height = 150
        rows = New List(Of Control()) From {New Control() {_specs}}
        Dim v_specsCard = ShowCard(_specsCard, _display.IsOn("ap2-specs"), rows)
        If v_specsCard Then leftY += Place(_specsCard, pad, leftY, lw, rows) + gap

        ' right column
        Dim rightY = y
        rows = New List(Of Control())
        _photo.Height = 220
        _choosePhoto.Height = 36 : _removePhoto.Height = 36
        If on_("ap2-media", "ap2-image") Then rows.Add({_photo}) : rows.Add({_choosePhoto, _removePhoto})
        _gallery.Height = 90 : _addGallery.Height = 36
        If on_("ap2-media", "ap2-gallery") Then rows.Add({Blk("gallery", "Gallery (click a photo to remove it)", _gallery)}) : rows.Add({_addGallery})
        Dim v_images = ShowCard(_images, _display.IsOn("ap2-media") AndAlso rows.Count > 0, rows)
        If v_images Then rightY += Place(_images, pad + lw + gap, rightY, rw, rows) + gap

        rows = New List(Of Control())
        If on_("ap2-org", "ap2-status") Then rows.Add({_published, _unpublished})
        If on_("ap2-org", "ap2-badge") Then rows.Add({Blk("badge", "Badge Tag", _badge)})
        If on_("ap2-org", "ap2-itemtype") Then rows.Add({Blk("itemtype", "Item Type", _itemType)})
        If on_("ap2-org", "ap2-home") Then rows.Add({_home})
        Dim v_org = ShowCard(_org, _display.IsOn("ap2-org") AndAlso rows.Count > 0, rows)
        If v_org Then rightY += Place(_org, pad + lw + gap, rightY, rw, rows) + gap

        Dim by = Math.Max(leftY, rightY)
        _error.SetBounds(pad + If(_delete.Visible, 130, 0), by, w - 420 - If(_delete.Visible, 130, 0), 40)
        _delete.SetBounds(pad, by, 120, 44)
        _saveAnother.SetBounds(pad + w - 380, by, 180, 44)
        _create.SetBounds(pad + w - 190, by, 190, 44)
        _scroll.AutoScrollMinSize = New Size(0, by + 44 + pad)
        _scroll.ResumeLayout()
    End Sub

    Private Shared Function ShowCard(card As Card, visible As Boolean, rows As List(Of Control())) As Boolean
        card.Visible = visible
        ' Everything placed in the card this time is inside it; anything else is hidden.
        Dim wanted As New HashSet(Of Control)
        For Each r In rows
            For Each c In r : wanted.Add(c) : Next
        Next
        For Each c In wanted
            If c.Parent IsNot card Then card.Controls.Add(c)
        Next
        For Each c As Control In card.Controls
            If c Is card.Controls(0) Then Continue For
            c.Visible = wanted.Contains(c)
        Next
        Return visible
    End Function
End Class
