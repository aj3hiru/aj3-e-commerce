Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Text.RegularExpressions
Imports System.Windows.Forms

''' <summary>"Pages" as on the website: 3 numbers, All / Published / Draft tabs, search, the table (title, link,
''' status, last updated, actions: edit / view / delete) and the editor (slug, status, SEO).</summary>
Public Class StaticPagesPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_pages_display")
    Private ReadOnly _edDisplay As DisplayOptions = DisplayOptions.For("ecom_page_editor_display")
    Private ReadOnly _add As WButton = Ui.Btn("New Page", Theme.IcAdd, Theme.Blue)
    Private ReadOnly _cards As New Columns(3, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _tabs As New Tabs("all|All", "published|Published", "draft|Draft")
    Private ReadOnly _list As New ListCard("pages")

    Public Overrides ReadOnly Property PageTitle As String = "Pages"
    Public Overrides ReadOnly Property PageSubtitle As String = "About us, policies and other pages of the shop"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _edDisplay.Button, _add}
        End Get
    End Property

    Public Sub New()
        _edDisplay.Button.Text = "Editor Options"
        _edDisplay.Button.Width = _edDisplay.Button.PreferredWidth()
        For Each m In {("pg-k-total", "All pages", ChrW(&HE8A5), Theme.Primary, "all"), ("pg-k-published", "Published", Theme.IcGlobe, Color.FromArgb(5, &H96, &H69), "published"), ("pg-k-draft", "Drafts", Theme.IcClock, Color.FromArgb(&HD9, &H77, 6), "draft")}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86, .Cursor = Cursors.Hand}
            Dim tab = m.Item5
            AddHandler ms.Click, Sub()
                                     _tabs.Current = tab
                                     _tabs.Invalidate()
                                     Refresh_()
                                 End Sub
            _m(m.Item1) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _tabs.Height = 42
        Body.Add(_tabs)
        _list.Search.Box.PlaceholderText = "Search pages…"
        Body.Add(_list)
        AddHandler _tabs.Changed, Sub() Refresh_()
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.Table.RowClick, Sub(p) Edit(p)
        AddHandler _list.Table.ActionClick, Async Sub(p, k)
                                                Select Case k
                                                    Case "edit" : Edit(p)
                                                    Case "view" : Ui.OpenUrl(Site() & "/" & Js.Str(p, "slug"))
                                                    Case "delete"
                                                        If Not Ui.Confirm(Me, "The page disappears from the shop.", "Delete """ & Js.Str(p, "title") & """?") Then Return
                                                        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "DELETE", .Path = "/api/pages/" & Js.Int(p, "id"), .Label = "Delete page " & Js.Str(p, "title"), .Effect = PageActions.PageRowDelete("pages", Js.Field(p, "id"))}, "pages", "Page deleted.")
                                                End Select
                                            End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _add.Click, Sub() Edit(Nothing)
        BuildCols()
    End Sub

    Private Shared Function Site() As String
        Dim u = New Uri(AppState.I.Api.Server)
        Return u.Scheme & "://" & u.Host.Replace("admin.", "")
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("pg-table", k)
        _list.ShowSearch = col("pg-t-search")
        If col("pg-c-title") Then t.Cols.Add(New TCol("Title", Function(p) Js.Str(p, "title"), 0, CellKind.Bold) With {.Flex = 20}.WithSort())
        If col("pg-c-slug") Then t.Cols.Add(New TCol("Link", Function(p) "/" & Js.Str(p, "slug"), 0) With {.Flex = 16, .Colour = Function(p) Theme.G500}.WithSort())
        If col("pg-c-status") Then t.Cols.Add(New TCol("Status", Function(p) If(Js.Str(p, "status") = "published", "Published", "Draft"), 0, CellKind.Pill) With {.Flex = 9, .Colour = Function(p) If(Js.Str(p, "status") = "published", Theme.Green, Theme.Grey)})
        If col("pg-c-updated") Then t.Cols.Add(New TCol("Last updated", Function(p) Fmt.Stamp(Js.Time(p, "updatedAt")), 0) With {.Flex = 11, .Colour = Function(p) Theme.G600, .Sort = Function(p) Js.Str(p, "updatedAt")})
        If col("pg-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 124, CellKind.Actions) With {.ButtonsFor = Function(p) If(Js.Int(p, "id") > 0, {"edit", "view", "delete"}, {"edit"})}.Btn("edit", ChrW(&HE70F), "Edit", Color.FromArgb(&H4F, &H6E, &HF7)).Btn("view", ChrW(&HE8A7), "View on the shop", Theme.G600).Btn("delete", Theme.IcDelete, "Delete", Color.FromArgb(&HDC, &H26, &H26)))
        t.RowClickable = True
        t.EmptyText = "No pages yet."
    End Sub

    Protected Overrides Sub Reload()
        Dim all = AppState.I.PageList("pages")
        Dim pub = all.Where(Function(p) Js.Str(p, "status") = "published").Count()
        _tabs.Items(0) = ("all", "All (" & all.Count & ")")
        _tabs.Items(1) = ("published", "Published (" & pub & ")")
        _tabs.Items(2) = ("draft", "Draft (" & (all.Count - pub) & ")")
        _tabs.Invalidate()
        Dim tab = _tabs.Current
        _list.SetRows(all.Where(Function(p) (tab = "all" OrElse Js.Str(p, "status") = tab) AndAlso _list.Matches(Js.Str(p, "title") & " " & Js.Str(p, "slug"))).ToList(), all.Count)
        _m("pg-k-total").SetValue(all.Count.ToString()) : _m("pg-k-total").Selected = tab = "all"
        _m("pg-k-published").SetValue(pub.ToString()) : _m("pg-k-published").Selected = tab = "published"
        _m("pg-k-draft").SetValue((all.Count - pub).ToString()) : _m("pg-k-draft").Selected = tab = "draft"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("pg-stats", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("pg-stats"))
        Kit.Show(_tabs, _display.IsOn("pg-table", "pg-t-tabs"))
        Kit.Show(_list, _display.IsOn("pg-table"))
    End Sub

    Private Sub Edit(p As JsonObject)
        Dim f As New FormDialog(If(p Is Nothing, "New Page", "Edit Page"), 860, If(p Is Nothing, "Create Page", "Save Changes"))
        f.AddText("title", "Title", Js.Str(p, "title"), required:=True)
        If _edDisplay.IsOn("pe-form", "pe-slug") Then f.AddText("slug", "Link (slug) — blank = from title", Js.Str(p, "slug"), half:=True)
        If _edDisplay.IsOn("pe-form", "pe-status") Then f.AddPick("status", "Status", {"published|Published", "draft|Draft"}, Js.Str(p, "status", "published"), half:=True)
        f.AddMulti("content", "Content (text or HTML)", Js.Str(p, "content"), 300)
        If _edDisplay.IsOn("pe-form", "pe-seo") Then
            f.AddText("metaTitle", "Meta title (SEO)", Js.Str(p, "metaTitle"))
            f.AddMulti("metaDescription", "Meta description (SEO)", Js.Str(p, "metaDescription"), 60)
        End If
        If p IsNot Nothing Then
            Dim slug = Js.Str(p, "slug")
            f.AddControl(Ui.Btn("Preview on the shop", ChrW(&HE8A7), outline:=True, click:=Sub() Ui.OpenUrl(Site() & "/" & slug)))
        End If
        f.OnSave = Async Function(d)
                       Dim body = Js.Obj("title", d.Val("title").Trim(), "content", d.Val("content").Replace(vbCrLf, vbLf), "status", If(d.Val("status") = "", Js.Str(p, "status", "published"), d.Val("status")),
                                         "slug", If(f.Input("slug") Is Nothing, Js.Str(p, "slug"), d.Val("slug").Trim()), "metaTitle", If(f.Input("metaTitle") Is Nothing, Js.Str(p, "metaTitle"), d.Val("metaTitle").Trim()),
                                         "metaDescription", If(f.Input("metaDescription") Is Nothing, Js.Str(p, "metaDescription"), d.Val("metaDescription").Trim()))
                       Dim item As New OutboxItem With {.Method = If(p Is Nothing, "POST", "PATCH"), .Path = If(p Is Nothing, "/api/pages", "/api/pages/" & Js.Int(p, "id")), .Label = "Page " & d.Val("title").Trim(), .Body = body}
                       Dim fields = TryCast(Js.Copy(body), JsonObject)
                       fields("updatedAt") = DateTime.UtcNow.ToString("o")
                       If p Is Nothing Then
                           Js.Merge(fields, Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id))
                           item.Effect = PageActions.PageRowNew("pages", fields)
                       Else
                           item.Effect = PageActions.PageRow("pages", Js.Field(p, "id"), fields)
                       End If
                       Return Await PageActions.SendAsync(Me, item, "pages", If(p Is Nothing, "Page created.", "Page saved."))
                   End Function
        f.ShowDialog(FindForm())
    End Sub
End Class

''' <summary>A grid of file tiles (thumbnail, name, category · size), click to pick, tick to select.</summary>
Public Class FileGrid
    Inherits Control
    Implements IFlowHeight
    Public Files As New List(Of JsonObject)
    Public Selecting As Boolean
    Public ReadOnly Selected As New HashSet(Of String)
    Public Active As String
    Public Event Picked(f As JsonObject)
    Private Const TileW As Integer = 156, TileH As Integer = 196, GapPx As Integer = 12
    Public Sub New()
        SetStyle(ControlStyles.AllPaintingInWmPaint Or ControlStyles.OptimizedDoubleBuffer Or ControlStyles.UserPaint Or ControlStyles.ResizeRedraw, True)
        BackColor = Theme.Page
        Cursor = Cursors.Hand
    End Sub
    Private Function Cols(w As Integer) As Integer
        Return Math.Max(1, (w + GapPx) \ (TileW + GapPx))
    End Function
    Public Function HeightFor(width As Integer) As Integer Implements IFlowHeight.HeightFor
        If Files.Count = 0 Then Return 60
        Dim rows = CInt(Math.Ceiling(Files.Count / Cols(width)))
        Return rows * (TileH + GapPx)
    End Function
    Private Function RectOf(i As Integer) As Rectangle
        Dim c = Cols(Width)
        Return New Rectangle((i Mod c) * (TileW + GapPx), (i \ c) * (TileH + GapPx), TileW, TileH)
    End Function
    Protected Overrides Sub OnPaint(e As PaintEventArgs)
        Dim g = e.Graphics
        g.Clear(Theme.Page)
        Theme.Smooth(g)
        If Files.Count = 0 Then
            TextRenderer.DrawText(g, "No files match.", Theme.Body, ClientRectangle, Theme.G400, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter)
            Return
        End If
        For i = 0 To Files.Count - 1
            Dim r = RectOf(i)
            If Not r.IntersectsWith(e.ClipRectangle) Then Continue For
            Dim f = Files(i)
            Dim id = Js.Str(f, "id")
            Dim sel = id = Active OrElse Selected.Contains(id)
            Using p = Theme.RoundRect(New RectangleF(r.X + 0.5F, r.Y + 0.5F, r.Width - 1, r.Height - 1), 8)
                Using b As New SolidBrush(Color.White) : g.FillPath(b, p) : End Using
                Using pen As New Pen(If(sel, Theme.Blue, Theme.G200), 1.5F) : g.DrawPath(pen, p) : End Using
            End Using
            Dim th As New Rectangle(r.X + 8, r.Y + 8, r.Width - 16, 132)
            If Js.Str(f, "fileType") = "image" Then
                Dim idx = i
                Dim im = Img.Get(Js.Str(f, "relPath"), 200, Sub() If Not IsDisposed Then Invalidate(RectOf(idx)))
                Gfx.Thumb(g, th, im)
            Else
                Using p = Theme.RoundRect(New RectangleF(th.X, th.Y, th.Width, th.Height), 6)
                    Using b As New SolidBrush(Theme.G100) : g.FillPath(b, p) : End Using
                End Using
                Using fnt = Theme.IconFont(26) : Theme.DrawCentered(g, ChrW(&HE8A5), fnt, If(Js.Str(f, "fileType") = "pdf", Theme.Danger, Theme.G500), th) : End Using
            End If
            TextRenderer.DrawText(g, Js.Str(f, "name"), Theme.UiFont(8.5F, FontStyle.Bold), New Rectangle(r.X + 8, r.Y + 146, r.Width - 16, 18), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            TextRenderer.DrawText(g, Js.Str(f, "categoryLabel") & " · " & If(Js.IsNull(f, "sizeBytes"), "Missing", Fmt.Bytes(Js.Num(f, "sizeBytes"))), Theme.UiFont(7.5F), New Rectangle(r.X + 8, r.Y + 166, r.Width - 16, 16), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
            If Selecting Then Gfx.Check(g, New Rectangle(r.X + 12, r.Y + 12, 18, 18), Selected.Contains(id))
        Next
    End Sub
    Protected Overrides Sub OnMouseClick(e As MouseEventArgs)
        MyBase.OnMouseClick(e)
        For i = 0 To Files.Count - 1
            If RectOf(i).Contains(e.Location) Then RaiseEvent Picked(Files(i)) : Return
        Next
    End Sub
End Class

''' <summary>"File Manager" as on the website: 4 numbers, upload zone, search / type / category / sort, grid or
''' list view, select + delete, and the details panel (rename, copy link, open, delete).</summary>
Public Class FilesPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("file_manager2_display")
    Private ReadOnly _upload As WButton = Ui.Btn("Upload", ChrW(&HE898), Theme.Blue)
    Private ReadOnly _search As WInput = WInput.Make("Search files…", Theme.IcSearch)
    Private ReadOnly _type As ComboBox = Ui.Filter({"all|All Types", "image|Images", "pdf|PDFs", "video|Videos", "document|Documents", "archive|Archives"}, 150)
    Private ReadOnly _cat As ComboBox = Ui.Filter({"all|All Categories", "media|Media Library", "product|Product Images", "category|Category Icons", "brand|Brand Logos", "banner|Homepage Banners", "payment|Payment Icons", "logo|Site Logo", "author|Author Photos"}, 180)
    Private ReadOnly _sort As ComboBox = Ui.Filter({"newest|Sort by: Newest", "oldest|Sort by: Oldest", "largest|Sort by: Largest", "name|Sort by: Name"}, 170)
    Private ReadOnly _view As New Tabs("grid|Grid", "list|List")
    Private ReadOnly _grid As New FileGrid()
    Private _selecting As Boolean
    Private _active As JsonObject

    Public Overrides ReadOnly Property PageTitle As String = "File Manager"
    Public Overrides ReadOnly Property PageSubtitle As String = "Every image and file used on the site"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _upload}
        End Get
    End Property

    Public Sub New()
        _search.Width = 260
        _view.Width = 150 : _view.Height = 38
        AddHandler _search.TextChanged, Sub() Refresh_()
        For Each c In {_type, _cat, _sort}
            AddHandler c.SelectedIndexChanged, Sub() Refresh_()
        Next
        AddHandler _view.Changed, Sub() Refresh_()
        AddHandler _display.Changed, Sub() Refresh_()
        AddHandler _upload.Click, Async Sub() Await UploadAsync()
        AddHandler _grid.Picked, AddressOf Pick
    End Sub

    Private Shared Function MediaId(f As JsonObject) As String
        Return Js.Str(f, "id").Split(":"c).Last()
    End Function

    Private Sub Pick(f As JsonObject)
        If _selecting Then
            Dim id = Js.Str(f, "id")
            If _grid.Selected.Contains(id) Then _grid.Selected.Remove(id) Else _grid.Selected.Add(id)
        Else
            _active = f
        End If
        Refresh_()
    End Sub

    Protected Overrides Sub Reload()
        Dim typing = _search.Box.Focused
        ClearBody(_search, _type, _cat, _sort, _view, _grid)
        Dim all = AppState.I.PageList("files")
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)
        If _display.IsOn("fm2-cards") Then
            Dim cards As New Columns(4, 200, 14)
            Dim card = Sub(key As String, caption As String, glyph As String, colour As Color, value As Integer)
                           If Not on_("fm2-cards", key) Then Return
                           Dim m As New MiniStat(caption, glyph, colour) With {.Height = 84}
                           m.SetValue(value.ToString())
                           cards.Add(m)
                       End Sub
            card("fm2-k-total", "Total Files", ChrW(&HE8A5), Theme.Primary, all.Count)
            card("fm2-k-images", "Images", Theme.IcPhoto, Color.FromArgb(5, &H96, &H69), all.Where(Function(f) Js.Str(f, "fileType") = "image").Count())
            card("fm2-k-pdfs", "PDFs", ChrW(&HE8A5), Color.FromArgb(&HEF, &H44, &H44), all.Where(Function(f) Js.Str(f, "fileType") = "pdf").Count())
            card("fm2-k-assets", "Site Assets", ChrW(&HE8B7), Color.FromArgb(&HD9, &H77, 6), all.Where(Function(f) Js.Str(f, "category") <> "media").Count())
            If cards.Controls.Count > 0 Then cards.Count = cards.Controls.Count : Body.Add(cards)
        End If
        If on_("fm2-upload", "fm2-upload-zone") Then
            Dim zone As New Drawn(84, Sub(g, r)
                                          Using p = Theme.RoundRect(New RectangleF(1, 1, r.Width - 3, r.Height - 3), 10)
                                              Using b As New SolidBrush(Color.FromArgb(&HF8, &HFA, &HFF)) : g.FillPath(b, p) : End Using
                                              Using pen As New Pen(Color.FromArgb(&HBF, &HDB, &HFE), 1.5F) With {.DashPattern = {4, 3}} : g.DrawPath(pen, p) : End Using
                                          End Using
                                          Using f = Theme.IconFont(16) : Theme.DrawCentered(g, ChrW(&HE898), f, Theme.Blue, New Rectangle(0, 12, r.Width, 30)) : End Using
                                          TextRenderer.DrawText(g, "Click to choose files — Browse to upload", Theme.Body, New Rectangle(0, 46, r.Width, 22), Theme.G600, TextFormatFlags.HorizontalCenter)
                                      End Sub) With {.Cursor = Cursors.Hand}
            AddHandler zone.Click, Async Sub() Await UploadAsync()
            Body.Add(zone)
        End If
        Dim bar As New CardBox(Nothing, "", 12)
        Dim row As New HRow(10)
        If on_("fm2-toolbar", "fm2-f-search") Then row.Add(_search)
        If on_("fm2-toolbar", "fm2-f-type") Then row.Add(_type)
        If on_("fm2-toolbar", "fm2-f-category") Then row.Add(_cat)
        If on_("fm2-toolbar", "fm2-f-sort") Then row.Add(_sort)
        row.Add(Ui.Btn(If(_selecting, "Cancel", "Select"), ChrW(&HE73A), outline:=True, click:=Sub()
                                                                                                 _selecting = Not _selecting
                                                                                                 _grid.Selected.Clear()
                                                                                                 Refresh_()
                                                                                             End Sub))
        If _selecting AndAlso _grid.Selected.Count > 0 Then row.Add(Ui.Btn("Delete (" & _grid.Selected.Count & ")", Theme.IcDelete, Theme.Danger, click:=Async Sub() Await DeleteAsync(all.Where(Function(f) _grid.Selected.Contains(Js.Str(f, "id"))).ToList())))
        row.Add(_view)
        bar.Add(row)
        Body.Add(bar)

        Dim q = _search.Text.Trim().ToLowerInvariant()
        Dim type = Ui.Val(_type), cat = Ui.Val(_cat)
        Dim list = all.Where(Function(f) (type = "all" OrElse Js.Str(f, "fileType") = type) AndAlso (cat = "all" OrElse Js.Str(f, "category") = cat) AndAlso (q = "" OrElse (Js.Str(f, "name") & " " & Js.Str(f, "usedBy") & " " & Js.Str(f, "relPath")).ToLowerInvariant().Contains(q))).ToList()
        Select Case Ui.Val(_sort)
            Case "oldest" : list = list.OrderBy(Function(f) Js.Str(f, "createdAt")).ToList()
            Case "largest" : list = list.OrderByDescending(Function(f) Js.Num(f, "sizeBytes")).ToList()
            Case "name" : list = list.OrderBy(Function(f) Js.Str(f, "name").ToLowerInvariant()).ToList()
            Case Else : list = list.OrderByDescending(Function(f) Js.Str(f, "createdAt")).ToList()
        End Select
        Dim shown = list.Take(300).ToList()
        Dim main As Control
        If _view.Current = "grid" Then
            _grid.Files = shown
            _grid.Selecting = _selecting
            _grid.Active = Js.Str(_active, "id")
            _grid.Invalidate()
            main = _grid
        Else
            Dim card As New CardBox(Nothing, "", 12)
            Dim t As New WebTable() With {.RowHeight = 50, .RowClickable = True, .Selectable = _selecting, .EmptyText = "No files match."}
            For Each id In _grid.Selected : t.Selected.Add(id) : Next
            t.Cols.Add(New TCol("File", Function(f) Js.Str(f, "name"), 0, CellKind.Thumb) With {.Flex = 24, .Picture = Function(f) If(Js.Str(f, "fileType") = "image", Js.Str(f, "relPath"), "")})
            t.Cols.Add(New TCol("Category", Function(f) Js.Str(f, "categoryLabel"), 0) With {.Flex = 12, .Colour = Function(f) Theme.G600})
            t.Cols.Add(New TCol("Size", Function(f) If(Js.IsNull(f, "sizeBytes"), "Missing", Fmt.Bytes(Js.Num(f, "sizeBytes"))), 0) With {.Flex = 7, .Colour = Function(f) If(Js.IsNull(f, "sizeBytes"), Theme.Danger, Theme.G600)})
            t.Cols.Add(New TCol("Used by", Function(f) Js.Str(f, "usedBy", "—"), 0) With {.Flex = 13, .Colour = Function(f) Theme.G600})
            t.Cols.Add(New TCol("Added", Function(f) Fmt.Day(Js.Time(f, "createdAt")), 0) With {.Flex = 10, .Colour = Function(f) Theme.G600})
            t.Rows = shown
            AddHandler t.RowClick, AddressOf Pick
            AddHandler t.SelectionChanged, Sub()
                                               _grid.Selected.Clear()
                                               For Each id In t.Selected : _grid.Selected.Add(id) : Next
                                               Refresh_()
                                           End Sub
            card.Add(t)
            main = card
        End If
        If _active IsNot Nothing Then
            Dim cols As New Columns(2, 300, 12) With {.Weights = {3, 1}, .Stretch = False}
            cols.Add(main)
            cols.Add(Details(_active))
            Body.Add(cols)
        Else
            Body.Add(main)
        End If
        If list.Count > shown.Count Then Body.Add(Ui.Note("Showing " & shown.Count & " of " & list.Count & " — search to narrow down."))
        If typing Then
            _search.Box.Focus()
            _search.Box.SelectionStart = _search.Box.TextLength
        End If
    End Sub

    Private Function Url(f As JsonObject) As String
        Return AppState.I.Api.FileUrl(Js.Str(f, "relPath"))
    End Function

    Private Function Details(f As JsonObject) As Control
        Dim card As New CardBox(Js.Str(f, "name"), "", 14)
        card.Tools.Add(Ui.IconBtn(Theme.IcCancel, "Close", Sub()
                                                               _active = Nothing
                                                               Refresh_()
                                                           End Sub))
        If Js.Str(f, "fileType") = "image" Then
            Dim pic As New WebPicture(200) With {.Height = 200}
            pic.Source = Js.Str(f, "relPath")
            card.Add(pic)
        End If
        Dim kv As New KeyValues()
        kv.Add("Category", Js.Str(f, "categoryLabel"))
        kv.Add("Size", If(Js.IsNull(f, "sizeBytes"), "Missing", Fmt.Bytes(Js.Num(f, "sizeBytes"))))
        If Js.Time(f, "createdAt").HasValue Then kv.Add("Created", Fmt.Stamp(Js.Time(f, "createdAt")))
        If Js.Str(f, "usedBy") <> "" Then kv.Add("Used by", Js.Str(f, "usedBy"))
        card.Add(kv)
        card.Add(New TextBlock("/" & Js.Str(f, "relPath"), Theme.Small, Theme.G500))
        Dim editable = Js.Bool(f, "editable")
        If editable Then card.Add(Ui.Btn("Rename", ChrW(&HE70F), outline:=True, click:=Async Sub() Await RenameAsync(f)))
        card.Add(Ui.Btn("Copy link", ChrW(&HE71B), outline:=True, click:=Sub()
                                                                              Clipboard.SetText(Url(f))
                                                                              Toast("Link copied.")
                                                                          End Sub))
        card.Add(Ui.Btn("Open", ChrW(&HE8A7), outline:=True, click:=Sub() Ui.OpenUrl(Url(f))))
        If editable Then card.Add(Ui.Btn("Delete", Theme.IcDelete, Theme.Danger, outline:=True, click:=Async Sub() Await DeleteAsync({f}.ToList())))
        Return card
    End Function

    Private Async Function UploadAsync() As Task
        Using d As New OpenFileDialog With {.Multiselect = True, .Title = "Choose files to upload"}
            If d.ShowDialog(FindForm()) <> DialogResult.OK Then Return
            For Each path In d.FileNames
                Dim kept = Store.KeepFile(path)
                Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "POST", .Path = "/api/media", .Label = "Upload " & IO.Path.GetFileName(path), .Multipart = True, .Files = New Dictionary(Of String, String) From {{"file", kept}}})
            Next
            Toast(If(d.FileNames.Length = 1, """" & IO.Path.GetFileName(d.FileNames(0)) & """ uploaded.", d.FileNames.Length & " files uploaded."))
            Await AppState.I.ReloadPageAsync("files")
        End Using
    End Function

    Private Async Function DeleteAsync(fs As List(Of JsonObject)) As Task
        Dim mine = fs.Where(Function(f) Js.Bool(f, "editable")).ToList()
        If mine.Count = 0 Then Toast("Only Media Library files can be deleted here.", True) : Return
        If Not Ui.Confirm(Me, "Pages that show " & If(mine.Count = 1, "it", "them") & " will lose the picture.", If(mine.Count = 1, "Delete """ & Js.Str(mine(0), "name") & """?", "Delete " & mine.Count & " files?")) Then Return
        For Each f In mine
            Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "DELETE", .Path = "/api/media/" & MediaId(f), .Label = "Delete " & Js.Str(f, "name"), .Effect = PageActions.PageRowDelete("files", Js.Field(f, "id"))})
        Next
        _grid.Selected.Clear()
        _active = Nothing
        Toast(If(mine.Count = 1, "File deleted.", mine.Count & " files deleted."))
        Refresh_()
    End Function

    Private Async Function RenameAsync(f As JsonObject) As Task
        Dim name = Dialogs.Ask(Me, "Rename file", "Name", Js.Str(f, "name"))
        If String.IsNullOrWhiteSpace(name) Then Return
        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "PATCH", .Path = "/api/media/" & MediaId(f), .Label = "Rename " & Js.Str(f, "name"), .Body = Js.Obj("title", name.Trim()),
            .Effect = PageActions.PageRow("files", Js.Field(f, "id"), Js.Obj("name", name.Trim()))}, "files", "Renamed.")
        _active = AppState.I.PageList("files").FirstOrDefault(Function(x) Js.Str(x, "id") = Js.Str(f, "id"))
        Refresh_()
    End Function
End Class

''' <summary>"Activity Logs" as on the website: 4 numbers, Action / User / Severity / dates filters, search, and
''' the log table (user, action, description, tech info, severity, date).</summary>
Public Class ActivityPage
    Inherits ScrollPage

    Private Shared ReadOnly High As String() = {"login_blocked", "login_denied", "logs_clear", "user_delete", "ecom_product_delete", "ecom_category_delete", "ecom_customer_delete", "ecom_coupon_delete", "ecom_brand_delete", "ecom_subcategory_delete", "ecom_tag_delete", "ecom_campaign_delete", "ecom_review_delete"}
    Private Shared ReadOnly Medium As String() = {"user_create", "user_edit", "ecom_payment_update", "ecom_business_settings_update", "ecom_homepage_update", "ecom_coupon_pause", "ecom_coupon_resume", "ecom_gst_update", "ecom_product_stock_update"}
    Private Shared ReadOnly Security As String() = {"login_success", "login_blocked", "login_denied", "logs_clear", "user_create", "user_delete", "user_edit"}
    Private Shared ReadOnly FailedActs As String() = {"login_blocked", "login_denied"}

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("activity_logs2_display")
    Private ReadOnly _export As WButton = Ui.Btn("Export", ChrW(&HE896), outline:=True)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _action As ComboBox = Ui.Filter({"all|All actions"})
    Private ReadOnly _user As ComboBox = Ui.Filter({"all|All users"})
    Private ReadOnly _sev As ComboBox = Ui.Filter({"all|All", "high|High", "medium|Medium", "low|Low"})
    Private ReadOnly _dates As WButton = Ui.Btn("Any time", Theme.IcCalendar, outline:=True)
    Private ReadOnly _list As New ListCard("activity")
    Private _range As (DateTime, DateTime)?
    Private _shown As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Activity Logs"
    Public Overrides ReadOnly Property PageSubtitle As String = "Who did what, and when"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _export}
        End Get
    End Property

    Public Sub New()
        For Each m In {("al2-k-total", "Total Events", ChrW(&HE9D2), Theme.Primary), ("al2-k-today", "Today", Theme.IcCalendar, Theme.Blue),
                       ("al2-k-security", "Security Events", ChrW(&HEA18), Color.FromArgb(&HD9, &H77, 6)), ("al2-k-failed", "Failed Actions", ChrW(&HE7BA), Color.FromArgb(&HEF, &H44, &H44))}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86}
            If m.Item1 = "al2-k-today" Then
                ms.Cursor = Cursors.Hand
                AddHandler ms.Click, Sub()
                                         _range = (DateTime.Today, DateTime.Today)
                                         Refresh_()
                                     End Sub
            End If
            _m(m.Item1) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("action", "Action", _action)
        _filters.Add("user", "User", _user)
        _filters.Add("sev", "Severity", _sev)
        _filters.Add("dates", "Dates", _dates)
        AddHandler _filters.Changed, Sub() Refresh_()
        AddHandler _dates.Click, Sub()
                                     Dim r = Dialogs.PickRange(FindForm(), If(_range.HasValue, _range.Value.Item1, DateTime.Today.AddDays(-7)), If(_range.HasValue, _range.Value.Item2, DateTime.Today))
                                     If r.HasValue Then _range = r.Value : Refresh_()
                                 End Sub
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Search description, user, IP…"
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           For Each c In {_action, _user, _sev} : c.SelectedIndex = 0 : Next
                                           _range = Nothing
                                           Refresh_()
                                       End Sub
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _export.Click, Sub() Export.Csv(Me, "Activity Logs", {"Date", "User", "Action", "Description", "Severity", "IP", "Browser", "OS"},
                                                   _shown.Select(Function(l) CType({Fmt.Stamp(Js.Time(l, "at")), Js.Str(l, "user", "System"), ActionLabel(Js.Str(l, "action")), Js.Str(l, "text"), Severity(Js.Str(l, "action")), Js.Str(l, "ip"), Ua(Js.Str(l, "ua")).Item1, Ua(Js.Str(l, "ua")).Item2}, IEnumerable(Of Object))))
        BuildCols()
    End Sub

    Private Shared Function Severity(a As String) As String
        Return If(High.Contains(a), "high", If(Medium.Contains(a), "medium", "low"))
    End Function

    Private Shared Function ActionLabel(a As String) As String
        Dim w = Regex.Replace(a, "^ecom_", "").Split("_"c)
        Dim past As New Dictionary(Of String, String) From {{"create", "Created"}, {"update", "Updated"}, {"delete", "Deleted"}, {"edit", "Updated"}}
        Return String.Join(" ", w.Select(Function(x, i) If(i = w.Length - 1 AndAlso past.ContainsKey(x), past(x), If(x = "", x, Char.ToUpperInvariant(x(0)) & x.Substring(1)))))
    End Function

    Private Shared Function Ua(s As String) As (String, String)
        If String.IsNullOrEmpty(s) Then Return ("Unknown", "Unknown")
        Dim l = s.ToLowerInvariant()
        Dim b = If(l.Contains("edg/"), "Edge", If(l.Contains("chrome/"), "Chrome", If(l.Contains("firefox/"), "Firefox", If(l.Contains("safari/"), "Safari", If(s.StartsWith("Dart") OrElse s.Contains("SriAndal"), "Staff app", "Unknown")))))
        Dim o = If(l.Contains("windows"), "Windows", If(l.Contains("android"), "Android", If(l.Contains("iphone") OrElse l.Contains("ipad"), "iOS", If(l.Contains("mac os"), "macOS", If(l.Contains("linux"), "Linux", "Unknown")))))
        Return (b, o)
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("al2-table", k)
        If col("al2-c-user") Then t.Cols.Add(New TCol("User", Function(l) Js.Str(l, "user", "System"), 0, CellKind.Avatar) With {.Flex = 11, .Sort = Function(l) Js.Str(l, "user").ToLowerInvariant()})
        If col("al2-c-action") Then t.Cols.Add(New TCol("Action", Function(l) ActionLabel(Js.Str(l, "action")), 0) With {.Flex = 11, .Colour = Function(l) Theme.G800, .Sort = Function(l) Js.Str(l, "action")})
        If col("al2-c-description") Then t.Cols.Add(New TCol("Description", Function(l) Js.Str(l, "text"), 0) With {.Flex = 26, .Colour = Function(l) Theme.G700})
        If col("al2-c-tech") Then t.Cols.Add(New TCol("Tech Info", Function(l) Js.Str(l, "ip", "—"), 0) With {.Flex = 11, .Colour = Function(l) Theme.G700, .Sub = Function(l) Ua(Js.Str(l, "ua")).Item1 & " · " & Ua(Js.Str(l, "ua")).Item2})
        If col("al2-c-severity") Then
            t.Cols.Add(New TCol("Severity", Function(l) Fmt.Title(Severity(Js.Str(l, "action"))), 0, CellKind.Badge) With {.Flex = 7, .Sort = Function(l) Severity(Js.Str(l, "action")),
                .Colour = Function(l) If(Severity(Js.Str(l, "action")) = "high", Color.FromArgb(&HB9, &H1C, &H1C), If(Severity(Js.Str(l, "action")) = "medium", Fmt.AmberText, Color.FromArgb(4, &H78, &H57)))})
        End If
        If col("al2-c-date") Then t.Cols.Add(New TCol("Date", Function(l) Fmt.Stamp(Js.Time(l, "at")), 0) With {.Flex = 10, .Colour = Function(l) Theme.G600, .Sort = Function(l) Js.Str(l, "at")})
        t.RowHeight = 58
        t.EmptyText = "No activity yet."
    End Sub

    Protected Overrides Sub Reload()
        Dim all = AppState.I.PageList("activity")
        Ui.Refill(_action, {"all|All actions"}.Concat(all.Select(Function(l) Js.Str(l, "action")).Distinct().OrderBy(Function(a) a).Select(Function(a) a & "|" & ActionLabel(a))))
        Ui.Refill(_user, {"all|All users"}.Concat(all.Select(Function(l) Js.Str(l, "user", "System")).Distinct().OrderBy(Function(u) u).Select(Function(u) u & "|" & u)))
        _dates.Text = If(_range.HasValue, Fmt.Day(_range.Value.Item1) & " – " & Fmt.Day(_range.Value.Item2), "Any time")
        _dates.Width = _dates.PreferredWidth()
        Dim action = Ui.Val(_action), user = Ui.Val(_user), sev = Ui.Val(_sev)
        Dim list = all.Where(Function(l)
                                 If action <> "all" AndAlso Js.Str(l, "action") <> action Then Return False
                                 If user <> "all" AndAlso Js.Str(l, "user", "System") <> user Then Return False
                                 If sev <> "all" AndAlso Severity(Js.Str(l, "action")) <> sev Then Return False
                                 If _range.HasValue Then
                                     Dim t = Js.Time(l, "at")
                                     If Not t.HasValue OrElse t.Value.Date < _range.Value.Item1 OrElse t.Value.Date > _range.Value.Item2 Then Return False
                                 End If
                                 Return _list.Matches(Js.Str(l, "text") & " " & Js.Str(l, "user") & " " & Js.Str(l, "ip") & " " & Js.Str(l, "action"))
                             End Function).ToList()
        _shown = list
        _list.SetRows(list, all.Count, action <> "all" OrElse user <> "all" OrElse sev <> "all" OrElse _range.HasValue)
        Dim dayAgo = DateTime.Now.AddHours(-24)
        _m("al2-k-total").SetValue(all.Count.ToString(), "last " & all.Count & " kept here")
        _m("al2-k-today").SetValue(all.Where(Function(l) Js.Time(l, "at").HasValue AndAlso Js.Time(l, "at").Value.Date = DateTime.Today).Count().ToString())
        _m("al2-k-security").SetValue(all.Where(Function(l) Security.Contains(Js.Str(l, "action"))).Count().ToString())
        _m("al2-k-failed").SetValue(all.Where(Function(l) FailedActs.Contains(Js.Str(l, "action")) AndAlso Js.Time(l, "at").HasValue AndAlso Js.Time(l, "at").Value > dayAgo).Count().ToString(), "Last 24 hours")
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("al2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("al2-cards"))
        Kit.Show(_list, _display.IsOn("al2-table"))
    End Sub
End Class

''' <summary>"Cache Manager" as on the website: size / clears / last cleared, the Redis panel, the section
''' cards (Homepage, Storefront, Admin Dashboard, Everything) and the clear history.</summary>
Public Class CachePage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("cache_manager2_display")

    Public Overrides ReadOnly Property PageTitle As String = "Cache Manager"
    Public Overrides ReadOnly Property PageSubtitle As String = "Refresh the shop when a change does not show up"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New()
        AddHandler _display.Changed, Sub() Refresh_()
    End Sub

    Private Async Function ClearAsync(section As String, label As String) As Task
        If Not Ui.Confirm(Me, "Pages are rebuilt fresh on the next visit. Uploaded files, products and orders are never touched.", "Clear " & label & "?") Then Return
        Await PageActions.SendAsync(Me, New OutboxItem With {.Method = "POST", .Path = "/api/cache2", .Label = "Clear cache: " & label, .Body = Js.Obj("section", section)}, "cache", label & " cleared.")
    End Function

    Protected Overrides Sub Reload()
        ClearBody()
        Dim d = AppState.I.PageObj("cache")
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)
        Dim last = TryCast(Js.Field(d, "lastCleared"), JsonObject)
        If _display.IsOn("cm2-cards") Then
            Dim cards As New Columns(3, 200, 14)
            If on_("cm2-cards", "cm2-k-size") Then cards.Add(New MiniStat("Cache Size", ChrW(&HEDA2), Theme.Primary) With {.Height = 86}).SetValue(If(Js.IsNull(d, "cacheSizeBytes"), "Missing", Fmt.Bytes(Js.Num(d, "cacheSizeBytes"))))
            If on_("cm2-cards", "cm2-k-total") Then cards.Add(New MiniStat("Total Clears", Theme.IcRefresh, Theme.Blue) With {.Height = 86}).SetValue(Js.Int(d, "totalClears").ToString())
            If on_("cm2-cards", "cm2-k-last") Then cards.Add(New MiniStat("Last Cleared", Theme.IcClock, Color.FromArgb(&HD9, &H77, 6)) With {.Height = 86}).SetValue(If(last Is Nothing, "Never", Fmt.Ago(Js.Time(last, "at"))), If(last Is Nothing, "", Js.Str(last, "section") & If(Js.Str(last, "by") <> "", " · by " & Js.Str(last, "by"), "")))
            If cards.Controls.Count > 0 Then cards.Count = cards.Controls.Count : Body.Add(cards)
        End If
        If on_("cm2-redis", "cm2-redis-panel") Then
            Dim redis = TryCast(Js.Field(d, "redis"), JsonObject)
            Dim card As New CardBox("Redis Cache", ChrW(&HE8B7)) With {.Accent = Color.FromArgb(&HDC, &H26, &H26)}
            card.Add(New TextBlock(If(Not Js.Bool(redis, "configured"), "Not set up on this server.", If(Js.Bool(redis, "connected"), "Connected · " & Js.Int(redis, "keyCount") & " keys" & If(Js.IsNull(redis, "memoryUsedBytes"), "", " · " & Fmt.Bytes(Js.Num(redis, "memoryUsedBytes"))), "Not connected" & If(Js.Str(redis, "error") <> "", " — " & Js.Str(redis, "error"), ""))), Theme.Body, Theme.G500))
            If Js.Bool(redis, "connected") Then card.Tools.Add(Ui.Btn("Flush Redis", Theme.IcDelete, Theme.Danger, click:=Async Sub() Await ClearAsync("redis", "Redis Cache")))
            Body.Add(card)
        End If
        If on_("cm2-sections", "cm2-sections-list") Then
            Dim grid As New Columns(4, 230, 14)
            For Each sct In {("home", "Homepage", "The storefront landing page (/).", Theme.IcHome, Theme.Blue), ("shop", "Storefront Pages", "Shop, categories, product pages, cart, checkout.", Theme.IcShop, Color.FromArgb(5, &H96, &H69)),
                             ("dashboard", "Admin Dashboard", "Your own dashboard stats view.", Theme.IcGrid, Theme.Primary), ("all", "Everything", "Every cached page at once.", ChrW(&HE945), Color.FromArgb(&HDC, &H26, &H26))}
                Dim key = sct.Item1, label = sct.Item2
                Dim card As New CardBox(label, sct.Item4) With {.Accent = sct.Item5}
                card.Add(New TextBlock(sct.Item3, Theme.Body, Theme.G500))
                card.Add(Ui.Btn("Clear " & label, Theme.IcRefresh, If(key = "all", Color.FromArgb(&HDC, &H26, &H26), Theme.Blue), click:=Async Sub() Await ClearAsync(key, label)))
                grid.Add(card)
            Next
            Body.Add(grid)
            Body.Add(Ui.Note("This clears the website's page cache and Redis only — uploaded files, product data, and orders are never touched. Use it after changing homepage sections or business settings, if the update doesn't appear right away."))
        End If
        If on_("cm2-history", "cm2-history-panel") Then
            Dim card As New CardBox("Clear History")
            Dim tl As New Timeline() With {.EmptyText = "Nothing cleared yet."}
            For Each h In Js.Objs(Js.Arr(d, "history"))
                tl.Items.Add((Js.Str(h, "description"), Js.Str(h, "by") & "  ·  " & Fmt.Stamp(Js.Time(h, "at")), Nothing))
            Next
            card.Add(tl)
            Body.Add(card)
        End If
    End Sub
End Class
