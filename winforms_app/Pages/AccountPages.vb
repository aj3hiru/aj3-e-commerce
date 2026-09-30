Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Users Manager" (Staff &amp; Roles) as on the website: 4 cards, role filter, the users table, and the
''' staff form with role, suspend / activate, delete and Advanced Access (each permission).</summary>
Public Class StaffPage
    Inherits ScrollPage

    Public Shared ReadOnly Roles As (Id As String, Label As String)() = {("admin", "Admin"), ("manager", "Store Manager"), ("order_manager", "Order Manager"), ("delivery_agent", "Delivery Agent"), ("cashier", "Billing / Cashier"), ("catalog_manager", "Product Manager"), ("marketing", "Marketing")}

    ''' <summary>The website's permission editor (group → fields shown).</summary>
    Public Shared ReadOnly PermGroups As (Key As String, Label As String, Fields As (String, String)())() = {
        ("dashboard_access", "Dashboard", Nothing),
        ("ecommerce", "Store", {("manage_billing", "Billing / POS"), ("manage_credits", "Due payments"), ("manage_customers", "Customers"), ("manage_products", "Products, brands & stock"), ("manage_categories", "Categories"), ("manage_coupons", "Offers & coupons"), ("manage_homepage", "Store customizer"), ("manage_payment", "Business & payment settings"), ("manage_orders", "Reports, analytics & GST")}),
        ("orders", "Online Orders", {("view", "View orders"), ("accept_reject", "Accept / Reject"), ("update_status", "Change status"), ("assign_delivery", "Assign delivery agent"), ("mark_paid", "Mark paid / unpaid"), ("edit_items", "Edit items"), ("cancel", "Cancel orders")}),
        ("delivery", "Delivery", {("deliver", "Is a delivery agent (own deliveries)"), ("view_all", "Deliveries board (all agents)")}),
        ("push_notifications", "Push Notifications", {("send", "Send notifications"), ("manage_templates", "Subscribers & settings")}),
        ("pages", "Static Pages", {("create", "Create"), ("edit", "Edit"), ("delete", "Delete")}),
        ("files", "Files", {("access_file_manager", "File manager")}),
        ("users", "Staff & Roles", {("create", "Add staff"), ("edit", "Edit staff"), ("delete", "Delete staff"), ("suspend", "Suspend"), ("change_roles", "Change roles"), ("manage_permissions", "Change permissions")}),
        ("security", "System", {("view_logs", "Activity logs")}),
        ("settings", "Maintenance", {("maintenance_mode", "Cache manager")})}

    Private Shared ReadOnly AvatarColors As Color() = {Color.FromArgb(&HBE, &H18, &H5D), Color.FromArgb(&H1D, &H4E, &HD8), Color.FromArgb(&HA1, &H62, 7), Color.FromArgb(&H37, &H30, &HA3), Color.FromArgb(4, &H78, &H57), Theme.Primary, Color.FromArgb(&HB9, &H1C, &H1C)}

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("user_manager2_display")
    Private ReadOnly _add As New HeadButton("Add Staff", "plus", Theme.Magenta)
    Private ReadOnly _cards As New Columns(4, 200, 14)
    Private ReadOnly _m As New Dictionary(Of String, MiniStat)
    Private ReadOnly _filters As New FilterCard()
    Private ReadOnly _role As ComboBox = Ui.Filter({"all|All roles"}.Concat(Roles.Select(Function(r) r.Id & "|" & r.Label)))
    Private ReadOnly _list As New ListCard("staff")
    Private _card As String = "all"

    Public Overrides ReadOnly Property PageTitle As String = "Users Manager"
    Public Overrides ReadOnly Property PageSubtitle As String = "Staff accounts, roles and what each person can do"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _add}
        End Get
    End Property

    Public Sub New()
        For Each m In {("u2-k-total", "Total Users", Theme.IcPeople, Theme.Blue, "all"), ("u2-k-admins", "Admins", ChrW(&HEA18), Theme.Primary, "admins"),
                       ("u2-k-active", "Active", Theme.IcDone, Color.FromArgb(&H16, &HA3, &H4A), "active"), ("u2-k-suspended", "Suspended / Pending", Theme.IcBlock, Color.FromArgb(&HD9, &H77, 6), "off")}
            Dim ms As New MiniStat(m.Item2, m.Item3, m.Item4) With {.Height = 86, .Cursor = Cursors.Hand}
            Dim c = m.Item5
            AddHandler ms.Click, Sub()
                                     _card = c
                                     Refresh_()
                                 End Sub
            _m(m.Item1) = ms
            _cards.Add(ms)
        Next
        Body.Add(_cards)
        _filters.Add("role", "Role", _role)
        AddHandler _filters.Changed, Sub() Refresh_()
        Body.Add(_filters)
        _list.Search.Box.PlaceholderText = "Search name or email..."
        Body.Add(_list)
        AddHandler _list.SearchChanged, Sub() Refresh_()
        AddHandler _list.ClearFilters, Sub()
                                           _list.Search.Text = ""
                                           _role.SelectedIndex = 0
                                           _card = "all"
                                           Refresh_()
                                       End Sub
        AddHandler _list.Table.RowClick, Sub(u) If Not IsMe(u) Then Edit(u)
        AddHandler _list.Table.ActionClick, Sub(u, k) Edit(u)
        AddHandler _display.Changed, Sub()
                                         BuildCols()
                                         Refresh_()
                                     End Sub
        AddHandler _add.Click, Sub() Edit(Nothing)
        BuildCols()
    End Sub

    Private Shared Function IsMe(u As JsonObject) As Boolean
        Return Js.Int(u, "id") = Js.Int(AppState.I.User, "id")
    End Function

    Private Sub BuildCols()
        Dim t = _list.Table
        t.Cols.Clear()
        Dim col = Function(k As String) _display.IsOn("u2-table", k)
        _list.ShowSearch = col("u2-t-search")
        If col("u2-c-user") Then
            t.Cols.Add(New TCol("User", Nothing, 0, CellKind.Custom) With {.Flex = 30, .Sort = Function(u) Js.Str(u, "name").ToLowerInvariant(),
                .Draw = Sub(g, r, u)
                            Dim name = Js.Str(u, "name")
                            Dim av As New Rectangle(r.X, r.Y + r.Height \ 2 - 18, 36, 36)
                            Dim idx = Js.Int(u, "id")
                            Dim im = Img.Get(Js.Str(u, "avatar"), 72, Sub() _list.Table.Invalidate())
                            Gfx.Avatar(g, av, name, im, AvatarColors(Math.Abs(idx) Mod AvatarColors.Length))
                            Tr.DrawText(g, name & If(IsMe(u), "  (you)", ""), Theme.BodyBold, New Rectangle(r.X + 48, r.Y + r.Height \ 2 - 19, r.Width - 48, 19), Theme.G900, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                            Tr.DrawText(g, "@" & Js.Str(u, "username") & If(Js.Str(u, "phone") <> "", " · " & Js.Str(u, "phone"), "") & If(Js.Str(u, "email") <> "", " · " & Js.Str(u, "email"), ""), Theme.Small, New Rectangle(r.X + 48, r.Y + r.Height \ 2 + 1, r.Width - 48, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                        End Sub})
        End If
        If col("u2-c-role") Then
            t.Cols.Add(New TCol("Role", Function(u) If(Js.Str(u, "role") = "admin", "Admin", If(Js.Str(u, "role") = "delivery_agent", "Delivery Agent", If(Js.Str(u, "role") = "cashier", "Billing / Cashier", Js.Str(u, "roleLabel")))), 0, CellKind.Badge) With {.Flex = 12,
                .Colour = Function(u) If(Js.Str(u, "role") = "admin", Theme.Primary, If(Js.Str(u, "role") = "delivery_agent", Color.FromArgb(4, &H78, &H57), If(Js.Str(u, "role") = "cashier", Fmt.AmberText, Theme.Blue))), .Sort = Function(u) Js.Str(u, "roleLabel")})
        End If
        If col("u2-c-status") Then t.Cols.Add(New TCol("Status", Function(u) If(Js.Str(u, "status") = "active", "Active", If(Js.Str(u, "status") = "suspended", "Suspended", Fmt.Title(Js.Str(u, "status")))), 0, CellKind.Pill) With {.Flex = 10, .Colour = Function(u) If(Js.Str(u, "status") = "active", Theme.Green, Theme.Grey), .Sort = Function(u) Js.Str(u, "status")})
        If col("u2-c-permissions") Then t.Cols.Add(New TCol("Permissions", Function(u) If(Js.Str(u, "role") = "admin", "Full access", Js.Int(u, "permCount") & " permissions"), 0) With {.Flex = 11, .Colour = Function(u) Theme.G700, .Sort = Function(u) Js.Int(u, "permCount")})
        If col("u2-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 90, CellKind.Actions) With {.ButtonsFor = Function(u) If(Not IsMe(u) AndAlso (AppState.I.Perm.Has("users", "edit") OrElse AppState.I.Perm.Has("users", "create")), {"edit"}, New String() {})}.Btn("edit", ChrW(&HE70F), "Edit", Theme.Blue))
        t.RowHeight = 62
        t.RowClickable = True
        t.EmptyText = "No staff yet."
    End Sub

    Protected Overrides Sub Reload()
        Dim all = AppState.I.List("staff")
        Dim role = Ui.Val(_role)
        Dim list = all.Where(Function(u)
                                 If role <> "all" AndAlso Js.Str(u, "role") <> role Then Return False
                                 If _card = "admins" AndAlso Js.Str(u, "role") <> "admin" Then Return False
                                 If _card = "active" AndAlso Js.Str(u, "status") <> "active" Then Return False
                                 If _card = "off" AndAlso Js.Str(u, "status") = "active" Then Return False
                                 Return _list.Matches(Js.Str(u, "name") & " " & Js.Str(u, "username") & " " & Js.Str(u, "email") & " " & Js.Str(u, "phone"))
                             End Function).ToList()
        _list.SetRows(list, all.Count, role <> "all" OrElse _card <> "all")
        _m("u2-k-total").SetValue(all.Count.ToString()) : _m("u2-k-total").Selected = _card = "all"
        _m("u2-k-admins").SetValue(all.Where(Function(u) Js.Str(u, "role") = "admin").Count().ToString()) : _m("u2-k-admins").Selected = _card = "admins"
        _m("u2-k-active").SetValue(all.Where(Function(u) Js.Str(u, "status") = "active").Count().ToString()) : _m("u2-k-active").Selected = _card = "active"
        _m("u2-k-suspended").SetValue(all.Where(Function(u) Js.Str(u, "status") <> "active").Count().ToString()) : _m("u2-k-suspended").Selected = _card = "off"
        For Each kv In _m : Kit.Show(kv.Value, _display.IsOn("u2-cards", kv.Key)) : Next
        Kit.Show(_cards, _display.IsOn("u2-cards"))
        Kit.Show(_list, _display.IsOn("u2-table"))
    End Sub

    Private Sub Edit(u As JsonObject)
        If u IsNot Nothing AndAlso IsMe(u) Then Main?.Pick("/admin/my-profile") : Return
        Dim p = AppState.I.Perm
        Dim canRole = p.Has("users", "change_roles")
        Dim canPerms = p.Has("users", "manage_permissions") AndAlso (u Is Nothing OrElse Js.Field(u, "permissions") IsNot Nothing)
        Dim f As New FormDialog(If(u Is Nothing, "Add staff member", "Edit " & Js.Str(u, "name")), 640)
        Dim names = Js.Str(u, "name").Split(" "c)
        f.AddText("first", "First name", If(u Is Nothing, "", Js.Str(u, "firstName", names(0))), half:=True)
        f.AddText("last", "Last name", If(u Is Nothing, "", Js.Str(u, "lastName", String.Join(" ", names.Skip(1)))), half:=True)
        f.AddText("username", "Username", Js.Str(u, "username"), required:=True, half:=True)
        f.AddText("email", "Email", Js.Str(u, "email"), required:=True, half:=True)
        f.AddText("phone", "Mobile", Js.Str(u, "phone"), hint:="Can log in with it", half:=True)
        f.AddPassword("password", If(u Is Nothing, "Password", "New password"), hint:=If(u Is Nothing, "Min 6 characters", "Leave blank to keep"), half:=True)
        Dim curRole = Js.Str(u, "role", "cashier")
        Dim roleItems = Roles.Where(Function(r) r.Id <> "admin" OrElse p.IsAdmin OrElse curRole = "admin").Select(Function(r) r.Id & "|" & r.Label).ToList()
        If Not Roles.Any(Function(r) r.Id = curRole) Then roleItems.Add(curRole & "|Old role (" & curRole & ") — pick a new one")
        Dim roleBox = f.AddPick("role", "Role", roleItems, curRole, hint:=If(canRole, Nothing, "You can't change roles"))
        roleBox.Enabled = canRole
        ' Advanced Access: every permission, as on the website
        Dim perms As JsonObject = If(TryCast(Js.Copy(Js.Field(u, "permissions")), JsonObject), New JsonObject())
        Dim customized = False
        Dim checks As New Dictionary(Of String, Switch)
        If canPerms Then
            Dim adv = f.AddCheck("advanced", "Advanced Access (customize individual permissions)", False)
            Dim grid As New Columns(2, 220, 12) With {.Stretch = False}
            For Each g In PermGroups
                Dim box As New CardBox(g.Label, "", 10)
                If g.Fields Is Nothing Then
                    Dim sw As New Switch(g.Label, Js.Bool(perms, g.Key) OrElse (u Is Nothing))
                    checks(g.Key) = sw
                    box.Add(sw)
                Else
                    For Each fld In g.Fields
                        Dim sw As New Switch(fld.Item2, Js.Bool(Js.Field(perms, g.Key), fld.Item1))
                        checks(g.Key & "." & fld.Item1) = sw
                        box.Add(sw)
                    Next
                End If
                grid.Add(box)
            Next
            For Each sw In checks.Values
                AddHandler sw.Toggled, Sub() customized = True
            Next
            Kit.Show(grid, False)
            f.AddControl(grid)
            AddHandler adv.Toggled, Sub()
                                        Kit.Show(grid, adv.Checked)
                                        f.Relayout()
                                    End Sub
            AddHandler roleBox.SelectedIndexChanged, Sub()
                                                         ' a new role starts from its preset on the server; unticking custom choices
                                                         If Not customized Then adv.Checked = False : Kit.Show(grid, False) : f.Relayout()
                                                     End Sub
        End If
        f.Validator = Function(d)
                          If u Is Nothing AndAlso d.Val("password").Length < 6 Then Return "A password (min 6 characters) is required."
                          If d.Val("password").Length > 0 AndAlso d.Val("password").Length < 6 Then Return "The new password must be at least 6 characters."
                          Return Nothing
                      End Function
        f.OnSave = Async Function(d)
                       Dim body = Js.Obj("username", d.Val("username").Trim(), "email", d.Val("email").Trim(), "firstName", d.Val("first").Trim(), "lastName", d.Val("last").Trim(), "phone", d.Val("phone").Trim(), "role", d.Val("role"))
                       If d.Val("password") <> "" Then
                           body("password") = d.Val("password") : body("confirmPassword") = d.Val("password") : body("confirm_password") = d.Val("password")
                       End If
                       If canPerms AndAlso customized Then
                           For Each kv In checks
                               Dim parts = kv.Key.Split("."c)
                               If parts.Length = 1 Then
                                   perms(parts(0)) = kv.Value.Checked
                               Else
                                   Dim grp = TryCast(Js.Field(perms, parts(0)), JsonObject)
                                   If grp Is Nothing Then grp = New JsonObject() : perms(parts(0)) = grp
                                   grp(parts(1)) = kv.Value.Checked
                               End If
                           Next
                           body("permissions") = Js.Copy(perms)
                       End If
                       Dim r = Await AppState.I.Api.SendAsync(If(u Is Nothing, "POST", "PATCH"), If(u Is Nothing, "/api/users", "/api/users/" & Js.Int(u, "id")), body, Js.NewId())
                       If Not r.IsOk Then Return If(r.Outcome = ApiOutcome.Offline, "Adding or editing staff needs the internet.", r.Message)
                       Toast("Saved.")
                       Await AppState.I.SyncNowAsync(only:={"staff", "agents"})
                       Return Nothing
                   End Function
        If u IsNot Nothing Then
            Dim row As New HRow(8)
            If p.Has("users", "suspend") Then
                Dim active = Js.Str(u, "status") = "active"
                row.Add(Ui.Btn(If(active, "Suspend", "Activate"), If(active, Theme.IcBlock, Theme.IcDone), If(active, Theme.Danger, Theme.Green), outline:=active, click:=Async Sub()
                                                                                                                                                                                If active AndAlso Not Ui.Confirm(f, "They will be logged out and cannot log in until re-activated.", "Suspend " & Js.Str(u, "name") & "?") Then Return
                                                                                                                                                                                Dim status = If(active, "suspended", "active")
                                                                                                                                                                                Dim r = Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "PATCH", .Path = "/api/users/" & Js.Int(u, "id"), .Body = Js.Obj("status", status), .Label = If(active, "Suspend ", "Activate ") & Js.Str(u, "name"),
                                                                                                                                                                                    .Effect = New JsonObject From {{"kind", "staff"}, {"id", Js.Int(u, "id")}, {"fields", Js.Obj("status", status)}}, .Refresh = New List(Of String) From {"staff", "agents"}})
                                                                                                                                                                                Toast(If(r.IsOk OrElse r.Outcome = ApiOutcome.Offline, "Done.", r.Message), Not r.IsOk AndAlso r.Outcome <> ApiOutcome.Offline)
                                                                                                                                                                                f.DialogResult = DialogResult.Cancel
                                                                                                                                                                            End Sub))
            End If
            If p.Has("users", "delete") Then
                row.Add(Ui.Btn("Delete staff", Theme.IcDelete, Theme.Danger, outline:=True, click:=Async Sub()
                                                                                                        If Not Ui.Confirm(f, "Their account is removed. Past orders and bills keep their name.", "Delete " & Js.Str(u, "name") & "?") Then Return
                                                                                                        Dim r = Await AppState.I.Api.SendAsync("DELETE", "/api/users/" & Js.Int(u, "id"), Nothing, Js.NewId())
                                                                                                        If Not r.IsOk Then Toast(If(r.Outcome = ApiOutcome.Offline, "Deleting staff needs the internet.", r.Message), True) : Return
                                                                                                        Toast("Deleted.")
                                                                                                        f.DialogResult = DialogResult.Cancel
                                                                                                        Await AppState.I.SyncNowAsync(only:={"staff", "agents"})
                                                                                                    End Sub))
            End If
            If row.Controls.Count > 0 Then f.AddControl(row)
        End If
        f.ShowDialog(FindForm())
    End Sub
End Class

''' <summary>"My Profile" as on the website: photo card, personal details, change password — plus this
''' computer's settings (printing, sync, download everything again, version).</summary>
Public Class ProfilePage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_my_profile_display")
    Private ReadOnly _first As WInput = WInput.Make("")
    Private ReadOnly _last As WInput = WInput.Make("")
    Private ReadOnly _phone As WInput = WInput.Make("10-digit mobile", Theme.IcPhone)
    Private ReadOnly _email As WInput = WInput.Make("", ChrW(&HE715))
    Private ReadOnly _username As WInput = WInput.Make("", "@")
    Private ReadOnly _cur As WInput = WInput.Make("", ChrW(&HE72E))
    Private ReadOnly _next As WInput = WInput.Make("", ChrW(&HE72E))
    Private ReadOnly _again As WInput = WInput.Make("", ChrW(&HE72E))
    Private _filled As Boolean

    Public Overrides ReadOnly Property PageTitle As String = "My Profile"
    Public Overrides ReadOnly Property PageSubtitle As String = "Your details, photo and password"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New()
        For Each b In {_cur, _next, _again} : b.Box.UseSystemPasswordChar = True : Next
        AddHandler _display.Changed, Sub() Refresh_()
    End Sub

    Private Sub Fill()
        Dim u = AppState.I.User
        Dim names = Js.Str(u, "name").Split(" "c)
        _first.Text = Js.Str(u, "firstName", names(0))
        _last.Text = Js.Str(u, "lastName", String.Join(" ", names.Skip(1)))
        _phone.Text = Js.Str(u, "phone")
        _email.Text = Js.Str(u, "email")
        _username.Text = Js.Str(u, "username")
    End Sub

    Protected Overrides Sub Reload()
        If Not _filled Then Fill() : _filled = True
        ClearBody(_first, _last, _phone, _email, _username, _cur, _next, _again)
        Dim u = AppState.I.User
        Dim name = Js.Str(u, "name", Js.Str(u, "username"))
        Dim on_ = Function(k As String) _display.IsOn("mp-sections", k)
        Dim col As New VStack(12)
        If on_("mp-card") Then
            Dim card As New Card With {.Padding = New Padding(0), .Height = 250}
            Dim im = Img.Get(Js.Str(u, "avatar"), 200, Sub() card.Invalidate())
            Dim photoRect As Rectangle
            AddHandler card.Paint, Sub(s, e)
                                       Dim g = e.Graphics
                                       Theme.Smooth(g)
                                       Using path = Theme.RoundRect(New RectangleF(1, 1, card.Width - 3, 80), 9)
                                           Using b As New LinearGradientBrush(New Rectangle(0, 0, card.Width, 80), Color.FromArgb(&H8B, &H1A, &H72), Theme.Magenta, LinearGradientMode.Horizontal) : g.FillPath(b, path) : End Using
                                       End Using
                                       Using b As New SolidBrush(Color.White) : g.FillRectangle(b, 1, 70, card.Width - 3, 12) : End Using
                                       Dim cx = card.Width \ 2
                                       photoRect = New Rectangle(cx - 45, 30, 90, 90)
                                       Using b As New SolidBrush(Color.White) : g.FillEllipse(b, photoRect) : End Using
                                       Gfx.Avatar(g, New Rectangle(cx - 42, 33, 84, 84), name, im, Color.FromArgb(&HF5, &HE6, &HF2))
                                       Using b As New SolidBrush(Theme.Magenta) : g.FillEllipse(b, cx + 18, 92, 26, 26) : End Using
                                       Using f = Theme.IconFont(8) : Theme.DrawCentered(g, ChrW(&HE722), f, Color.White, New Rectangle(cx + 18, 92, 26, 26)) : End Using
                                       Tr.DrawText(g, If(Js.Str(u, "avatar") = "", "Add photo", "Change photo"), Theme.Small, New Rectangle(0, 124, card.Width, 16), Theme.G500, TextFormatFlags.HorizontalCenter)
                                       Tr.DrawText(g, name, Theme.UiFont(12.5F, FontStyle.Bold), New Rectangle(0, 146, card.Width, 26), Theme.G800, TextFormatFlags.HorizontalCenter)
                                       Dim role = Js.Str(u, "roleLabel", Fmt.Title(Js.Str(u, "role")))
                                       Dim w = Tr.MeasureText(role, Theme.UiFont(8.0F, FontStyle.Bold)).Width + 12
                                       Gfx.Badge(g, role, cx - w \ 2, 188, Theme.Primary, Color.FromArgb(&HF3, &HE8, &HFF))
                                       If Js.Time(u, "since").HasValue Then Tr.DrawText(g, "Member since " & Js.Time(u, "since").Value.ToString("MMMM yyyy"), Theme.Small, New Rectangle(0, 212, card.Width, 16), Theme.G500, TextFormatFlags.HorizontalCenter)
                                   End Sub
            AddHandler card.MouseClick, Async Sub(s, e)
                                            If photoRect.Contains(e.Location) OrElse (e.Y > 120 AndAlso e.Y < 142) Then Await ChangePhotoAsync()
                                        End Sub
            AddHandler card.MouseMove, Sub(s, e) card.Cursor = If(photoRect.Contains(e.Location), Cursors.Hand, Cursors.Default)
            col.Add(card)
        End If
        If on_("mp-details") Then
            Dim card As New CardBox("Personal details", Theme.IcUser) With {.Accent = Theme.Magenta}
            Dim g1 As New Columns(2, 200, 14)
            g1.Add(New Field("First name", _first)) : g1.Add(New Field("Last name", _last))
            g1.Add(New Field("Mobile number (you can log in with it)", _phone)) : g1.Add(New Field("Email", _email))
            g1.Add(New Field("Username", _username))
            card.Add(g1)
            card.Add(Ui.Btn("Save details", Theme.IcSave, Theme.Magenta, click:=Async Sub() Await SaveDetailsAsync()))
            col.Add(card)
        End If
        If on_("mp-password") Then
            Dim card As New CardBox("Change password", ChrW(&HE8D7)) With {.Accent = Theme.Magenta}
            card.Add(New Field("Current password", _cur))
            Dim g2 As New Columns(2, 200, 14)
            g2.Add(New Field("New password (min 6 characters)", _next)) : g2.Add(New Field("Confirm new password", _again))
            card.Add(g2)
            card.Add(Ui.Btn("Update password", ChrW(&HEA18), Theme.Magenta, click:=Async Sub() Await SavePasswordAsync()))
            col.Add(card)
        End If
        Dim comp As New CardBox("This computer", ChrW(&HE7F8)) With {.Accent = Theme.Magenta}
        Dim app = AppState.I
        Dim rowBtn = Function(glyph As String, title As String, subtitle As String, click As Action) As Control
                         Dim d As New Drawn(58, Sub(g, r)
                                                    Using p = Theme.RoundRect(New RectangleF(0, 10, 38, 38), 8)
                                                        Using b As New SolidBrush(Color.FromArgb(&HFC, &HE7, &HF6)) : g.FillPath(b, p) : End Using
                                                    End Using
                                                    Using f = Theme.IconFont(11) : Theme.DrawCentered(g, glyph, f, Theme.Magenta, New Rectangle(0, 10, 38, 38)) : End Using
                                                    Tr.DrawText(g, title, Theme.BodyBold, New Point(52, 12), Theme.G900, TextFormatFlags.NoPadding)
                                                    Tr.DrawText(g, subtitle, Theme.Small, New Point(52, 32), Theme.G500, TextFormatFlags.NoPadding)
                                                    Using f = Theme.IconFont(9) : Tr.DrawText(g, ChrW(&HE76C), f, New Rectangle(r.Right - 20, 0, 20, r.Height), Theme.G400, TextFormatFlags.VerticalCenter) : End Using
                                                End Sub) With {.Cursor = Cursors.Hand}
                         AddHandler d.Click, Sub() click()
                         Return d
                     End Function
        comp.Add(rowBtn(Theme.IcPrint, "Printing", "Paper size, printers and automatic receipt", Sub() PrintPrefs.Edit(Me)))
        comp.Add(rowBtn(Theme.IcSync, "Sync", If(app.Pending > 0, app.Pending & " change(s) waiting to upload", "Everything is saved on the server"), Sub()
                                                                                                                                             Using d As New SyncCenter() : d.ShowDialog(FindForm()) : End Using
                                                                                                                                         End Sub))
        comp.Add(rowBtn(ChrW(&HE896), "Download everything again", "Refresh every page, product and order saved on this computer", Async Sub()
                                                                                                                                         Using d As New SetupForm() : d.ShowDialog(FindForm()) : End Using
                                                                                                                                         Toast("Everything on this computer is up to date.")
                                                                                                                                     End Sub))
        comp.Add(rowBtn(ChrW(&HE895), "Software version", "v" & Application.ProductVersion.Split("+"c)(0), Sub() Main?.Pick("/admin/staff-app")))
        col.Add(comp)
        Dim center As New Columns(3, 200, 0) With {.Weights = {1, 3, 1}, .Stretch = False}
        center.Add(New Spacer(1))
        center.Add(col)
        center.Add(New Spacer(1))
        Body.Add(center)
    End Sub

    Private Async Function ChangePhotoAsync() As Task
        Using d As New OpenFileDialog With {.Filter = "Pictures|*.jpg;*.jpeg;*.png;*.webp;*.gif"}
            If d.ShowDialog(FindForm()) <> DialogResult.OK Then Return
            Dim up = Await AppState.I.Api.MultipartAsync("POST", "/api/users/avatar", New Dictionary(Of String, String), New Dictionary(Of String, String) From {{"file", d.FileName}})
            If Not up.IsOk Then Toast(If(up.Outcome = ApiOutcome.Offline, "Changing the photo needs the internet.", up.Message), True) : Return
            Dim u = AppState.I.User
            Dim r = Await AppState.I.Api.SendAsync("POST", "/api/users/me", Js.Obj("username", Js.Str(u, "username"), "email", Js.Str(u, "email"), "firstName", _first.Text.Trim(), "lastName", _last.Text.Trim(), "phone", Js.Str(u, "phone"), "avatar", Js.Str(up.Data, "path")), Js.NewId())
            If r.IsOk Then
                Await AppState.I.RefreshMeAsync()
                Toast("Photo updated.")
                Refresh_()
            Else
                Toast(r.Message, True)
            End If
        End Using
    End Function

    Private Async Function SaveDetailsAsync() As Task
        Dim r = Await AppState.I.Api.SendAsync("POST", "/api/users/me", Js.Obj("username", _username.Text.Trim(), "email", _email.Text.Trim(), "firstName", _first.Text.Trim(), "lastName", _last.Text.Trim(), "phone", _phone.Text.Trim()), Js.NewId())
        If r.IsOk Then
            Await AppState.I.RefreshMeAsync()
            Toast("Saved.")
            Main?.RefreshHeader()
        Else
            Toast(If(r.Outcome = ApiOutcome.Offline, "Saving your details needs the internet.", r.Message), True)
        End If
    End Function

    Private Async Function SavePasswordAsync() As Task
        If _cur.Text = "" OrElse _next.Text.Length < 6 OrElse _next.Text <> _again.Text Then Toast("New passwords must match and be at least 6 characters.", True) : Return
        Dim u = AppState.I.User
        Dim r = Await AppState.I.Api.SendAsync("POST", "/api/users/me", Js.Obj("username", Js.Str(u, "username"), "email", Js.Str(u, "email"), "currentPassword", _cur.Text, "password", _next.Text, "confirmPassword", _again.Text), Js.NewId())
        If r.IsOk Then
            MessageBox.Show(FindForm(), "Password changed. Please log in again with the new password.", "My Profile", MessageBoxButtons.OK, MessageBoxIcon.Information)
            Main?.Pick("logout-now")
        Else
            Toast(If(r.Outcome = ApiOutcome.Offline, "Changing the password needs the internet.", r.Message), True)
        End If
    End Function
End Class

''' <summary>"Backup &amp; Restore": back up now (with live progress), each backup with Scan / Restore (type
''' RESTORE to confirm). Download / upload of backup files stays on the website.</summary>
Public Class BackupPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("app_backup_display")
    Private ReadOnly _backup As New HeadButton("Back up now", "save", Web.Blue)
    Private ReadOnly _poll As New Timer With {.Interval = 1000}
    Private _job As JsonObject
    Private ReadOnly _log As New List(Of JsonObject)
    Private _jobId As String
    Private _from As Integer

    Public Overrides ReadOnly Property PageTitle As String = "Backup & Restore"
    Public Overrides ReadOnly Property PageSubtitle As String = "A complete copy of your store — download it, keep it safe, and restore it whenever you need"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button, _backup}
        End Get
    End Property

    Public Sub New()
        AddHandler _display.Changed, Sub() Refresh_()
        AddHandler _backup.Click, Async Sub() Await StartAsync(Js.Obj("action", "backup"))
        AddHandler _poll.Tick, Async Sub() Await PollAsync()
    End Sub

    Private ReadOnly Property Running As Boolean
        Get
            Return Js.Str(_job, "status") = "running"
        End Get
    End Property

    Private Async Function StartAsync(body As JsonObject) As Task
        Dim r = Await AppState.I.Api.SendAsync("POST", "/api/system/backup", body)
        If Not r.IsOk Then Toast(If(r.Outcome = ApiOutcome.Offline, "This needs the internet.", r.Message), True) : Return
        If Js.IsNull(r.Data, "job") Then Await AppState.I.ReloadPageAsync("backups") : Return
        _log.Clear()
        _from = 0
        _jobId = Js.Str(r.Data, "job")
        _job = Js.Obj("status", "running", "step", "Starting…", "percent", 0)
        _poll.Start()
        Refresh_()
    End Function

    Private _polling As Boolean
    Private Async Function PollAsync() As Task
        If _polling OrElse _jobId Is Nothing Then Return
        _polling = True
        Try
            Dim j = Await AppState.I.Api.GetAsync("/api/system/backup?job=" & Uri.EscapeDataString(_jobId) & "&from=" & _from)
            If Not j.IsOk Then Return
            _job = TryCast(Js.Copy(Js.Field(j.Data, "job")), JsonObject)
            _from = Js.Int(_job, "logTotal")
            _log.AddRange(Js.Objs(Js.Arr(_job, "log")))
            If Not Running Then
                _poll.Stop()
                Await AppState.I.ReloadPageAsync("backups")
            End If
            Refresh_()
        Finally
            _polling = False
        End Try
    End Function

    Protected Overrides Sub Reload()
        ClearBody()
        _backup.Enabled = Not Running
        If _job IsNot Nothing AndAlso _display.Item("bk-progress") Then
            Dim card As New CardBox(Js.Str(_job, "step"))
            Dim pct = Js.Int(_job, "percent")
            Dim st = Js.Str(_job, "status")
            card.Add(New Drawn(44, Sub(g, r)
                                       Tr.DrawText(g, pct & "%", Theme.UiFont(15.0F, FontStyle.Bold), New Rectangle(0, 0, r.Width, 26), Theme.G900, TextFormatFlags.Right)
                                       Using p = Theme.RoundRect(New RectangleF(0, 30, r.Width, 10), 5)
                                           Using b As New SolidBrush(Theme.G100) : g.FillPath(b, p) : End Using
                                       End Using
                                       Using p = Theme.RoundRect(New RectangleF(0, 30, CSng(r.Width * Math.Max(0.02, pct / 100.0)), 10), 5)
                                           Using b As New SolidBrush(If(st = "failed", Theme.Danger, If(st = "done", Color.FromArgb(&H16, &HA3, &H4A), Theme.Primary))) : g.FillPath(b, p) : End Using
                                       End Using
                                   End Sub))
            Dim tl As New Timeline() With {.EmptyText = ""}
            For Each l In _log.AsEnumerable().Reverse().Take(6)
                tl.Items.Add(((If(Js.Str(l, "level") = "ok", "✓ ", If(Js.Str(l, "level") = "error", "✗ ", "")) & Js.Str(l, "text").Trim()), Fmt.Clock(Js.Time(l, "at")), Nothing))
            Next
            card.Add(tl)
            Body.Add(card)
        End If
        Dim rows = AppState.I.PageList("backups")
        Dim col = Function(k As String) _display.IsOn("bk-table", k)
        Dim t As New WebTable() With {.RowHeight = 52, .EmptyText = "No backups yet. Press ""Back up now""."}
        t.Cols.Add(New TCol("Backup file", Function(b) Js.Str(b, "name"), 0, CellKind.Bold) With {.Flex = 24})
        If col("bk-c-size") Then t.Cols.Add(New TCol("Size", Function(b) (Js.Num(b, "size") / 1048576).ToString("0.0") & " MB", 0) With {.Flex = 7})
        If col("bk-c-made") Then t.Cols.Add(New TCol("Made", Function(b) Fmt.Stamp(Js.Time(b, "createdAt")), 0) With {.Flex = 11, .Colour = Function(b) Theme.G600})
        If col("bk-c-actions") Then t.Cols.Add(New TCol("Actions", Nothing, 110, CellKind.Actions) With {.ButtonsFor = Function(b) If(Running, New String() {}, {"scan", "restore"})}.Btn("scan", ChrW(&HEA18), "Scan (check the file)", Theme.Blue).Btn("restore", Theme.IcRefresh, "Restore", Theme.Danger))
        t.Rows = rows
        AddHandler t.ActionClick, Async Sub(b, k)
                                      If k = "scan" Then
                                          Await StartAsync(Js.Obj("action", "validate", "file", Js.Str(b, "name")))
                                      Else
                                          Dim typed = Dialogs.Ask(Me, "Restore " & Js.Str(b, "name") & "?", "Everything on the site is replaced with this backup. A safety backup is saved first so you can undo. Type RESTORE to continue.")
                                          If typed Is Nothing OrElse typed.Trim() <> "RESTORE" Then Return
                                          Await StartAsync(Js.Obj("action", "restore", "file", Js.Str(b, "name"), "confirm", "RESTORE"))
                                      End If
                                  End Sub
        Dim card2 As New CardBox(Nothing, "", 12)
        card2.Add(t)
        Body.Add(card2)
        If _display.Item("bk-note") Then Body.Add(Ui.Note("Download or upload backup files from the website (System → Backup & Restore)."))
    End Sub
End Class

''' <summary>"Staff App": this software's version (and updates), and the Android / Windows apps for other devices.</summary>
Public Class StaffAppPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("app_staffapp_display")
    Private _latest As JsonObject
    Private _checked As Boolean

    Public Overrides ReadOnly Property PageTitle As String = "Staff App"
    Public Overrides ReadOnly Property PageSubtitle As String = "Billing, orders, deliveries and more on your phone and computer — works offline"
    Public Overrides ReadOnly Property Actions As Control()
        Get
            Return {_display.Button}
        End Get
    End Property

    Public Sub New()
        AddHandler _display.Changed, Sub() Refresh_()
    End Sub

    Public Overrides Sub OnOpened()
        MyBase.OnOpened()
        If Not _checked Then
            _checked = True
            Dim unused = CheckAsync()
        End If
    End Sub

    ''' <summary>The newest Windows software on GitHub (winforms-v…).</summary>
    Private Async Function CheckAsync() As Task
        Try
            Using http As New Net.Http.HttpClient() With {.Timeout = TimeSpan.FromSeconds(15)}
                http.DefaultRequestHeaders.UserAgent.ParseAdd("SriAndalStaff")
                Dim text = Await http.GetStringAsync("https://api.github.com/repos/aj3hiru/aj3-e-commerce/releases?per_page=100")
                Dim arr = TryCast(JsonNode.Parse(text), JsonArray)
                ' GitHub's order is not by version: take the highest winforms-v… number
                For Each r In Js.Objs(arr).Where(Function(x) Js.Str(x, "tag_name").StartsWith("winforms-v"))
                    If _latest Is Nothing OrElse Newer(Js.Str(r, "tag_name").Replace("winforms-v", ""), Js.Str(_latest, "tag_name").Replace("winforms-v", "")) Then _latest = r
                Next
            End Using
        Catch
        End Try
        If Not IsDisposed Then Refresh_()
    End Function

    Private Shared Function Newer(a As String, b As String) As Boolean
        Dim pa = a.Split("."c).Select(Function(x) If(Integer.TryParse(x, Nothing), CInt(x), 0)).ToList()
        Dim pb = b.Split("."c).Select(Function(x) If(Integer.TryParse(x, Nothing), CInt(x), 0)).ToList()
        For k = 0 To Math.Max(pa.Count, pb.Count) - 1
            Dim x = If(k < pa.Count, pa(k), 0), y = If(k < pb.Count, pb(k), 0)
            If x <> y Then Return x > y
        Next
        Return False
    End Function

    Protected Overrides Sub Reload()
        ClearBody()
        Dim mine = Application.ProductVersion.Split("+"c)(0)
        If _display.Item("sa-version") Then
            Dim card As New CardBox("This computer: version " & mine, ChrW(&HE7F8))
            If _latest Is Nothing Then
                card.Add(Ui.Note(If(_checked, "Couldn't check for updates (no internet?).", "Checking for the newest version…")))
            Else
                Dim latest = Js.Str(_latest, "tag_name").Replace("winforms-v", "")
                Dim exes = Js.Objs(Js.Arr(_latest, "assets")).Where(Function(a) Js.Str(a, "name").EndsWith(".exe")).ToList()
                Dim asset = If(exes.FirstOrDefault(Function(a) Js.Str(a, "name").Contains("Setup")), exes.FirstOrDefault()) ' the installer updates the installed copy
                If Newer(latest, mine) Then
                    card.Add(New TextBlock("Version " & latest & " is available.", Theme.BodyBold, Fmt.AmberText))
                    Dim url = If(asset Is Nothing, Js.Str(_latest, "html_url"), Js.Str(asset, "browser_download_url"))
                    card.Add(Ui.Btn("Download the update", ChrW(&HE896), Theme.Primary, click:=Sub() Ui.OpenUrl(url)))
                    card.Add(Ui.Note("After downloading, close this software and open the new file. Your data stays on this computer."))
                Else
                    card.Add(Ui.Note("You have the newest version (" & latest & ")."))
                End If
            End If
            Body.Add(card)
        End If
        Dim r = AppState.I.Release
        If _display.Item("sa-install") Then
            Dim card As New CardBox("Install on another device", Theme.IcPhone)
            Dim row As New HRow(8)
            If Js.Str(r, "android") <> "" Then
                Dim a = Js.Str(r, "android")
                row.Add(Ui.Btn("Android app (APK)", Theme.IcPhone, outline:=True, click:=Sub() Ui.OpenUrl(a)))
            End If
            row.Add(Ui.Btn("Windows software (this)", ChrW(&HE7F8), outline:=True, click:=Sub() Ui.OpenUrl("https://github.com/aj3hiru/aj3-e-commerce/releases")))
            card.Add(row)
            card.Add(Ui.Note("Staff sign in with the same username and password as the website."))
            Body.Add(card)
        End If
    End Sub
End Class
