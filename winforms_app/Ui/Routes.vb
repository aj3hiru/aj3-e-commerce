Imports System.Text.Json.Nodes

''' <summary>Which page each website menu link opens in the software.</summary>
Public Module Routes
    ''' <summary>Every page in the software, by the website's link.</summary>
    Public ReadOnly Table As New Dictionary(Of String, Func(Of PageBase)) From {
        {"/admin/dashboard", Function() New DashboardPage()},
        {"/admin/ecommerce/billing", Function() New BillingPage()},
        {"/admin/ecommerce/products/add", Function() New AddProductPage()},
        {"/admin/ecommerce/orders", Function() New OrdersPage()},
        {"/admin/ecommerce/customers", Function() New CustomersPage()},
        {"/admin/ecommerce/products", Function() New ProductsPage()},
        {"/admin/ecommerce/barcode-print", Function() New BarcodesPage()},
        {"/admin/deliveries?view=all", Function() New DeliveriesPage()},
        {"/admin/ecommerce/due", Function() New DuesPage()},
        {"/admin/ecommerce/sales-history", Function() New SalesHistoryPage()},
        {"/admin/ecommerce/categories", Function() New CategoriesPage()},
        {"/admin/ecommerce/brands", Function() New BrandsPage()},
        {"/admin/ecommerce/product-tags", Function() New TagsPage()},
        {"/admin/ecommerce/product-reviews", Function() New ReviewsPage()},
        {"/admin/ecommerce/stock-out-products", Function() New StockOutPage()},
        {"/admin/ecommerce/offers", Function() New OffersPage()},
        {"/push-notifications/push-manager2", Function() New PushPage()},
        {"/admin/ecommerce/reports", Function() New ReportsPage()},
        {"/admin/ecommerce/analytics", Function() New AnalyticsPage()},
        {"/admin/ecommerce/gst-report", Function() New GstPage()},
        {"/admin/ecommerce/tax-settings", Function() New TaxPage()},
        {"/admin/file-manager", Function() New FilesPage()},
        {"/admin/activity-logs", Function() New ActivityPage()},
        {"/admin/cache-manager", Function() New CachePage()},
        {"/admin/user-manager", Function() New StaffPage()},
        {"/admin/my-profile", Function() New ProfilePage()},
        {"/admin/backup", Function() New BackupPage()},
        {"/admin/staff-app", Function() New StaffAppPage()},
        {"/admin/ecommerce/business-settings", Function() New BusinessPage()},
        {"app:deliveries", Function() New MyDeliveriesPage()},
        {"/admin/ecommerce/payment-settings", Function() New BusinessPage("payment")},
        {"/admin/ecommerce/login-settings", Function() New BusinessPage("login")},
        {"/admin/ecommerce/campaign-offer", Function() New OffersPage()},
        {"/admin/ecommerce/coupons", Function() New OffersPage()},
        {"/admin/customizer", Function() New CustomizerPage("home")},
        {"/admin/customizer?tab=home", Function() New CustomizerPage("home")},
        {"/admin/customizer?tab=product", Function() New CustomizerPage("product")},
        {"/admin/customizer?tab=header", Function() New CustomizerPage("header")},
        {"/admin/customizer?tab=footer", Function() New CustomizerPage("footer")}
    }

    Public Function Make(href As String) As PageBase
        Dim f As Func(Of PageBase) = Nothing
        If Table.TryGetValue(href, f) Then Return f()
        Return Nothing
    End Function

    ''' <summary>Links the software leaves out of the website's menu (Static Pages stay on the website).</summary>
    Private ReadOnly Skip As New HashSet(Of String) From {"/admin/pages"}

    ''' <summary>The website's admin menu (used before the first download; afterwards the website's own copy is used).</summary>
    Private Const NavJson As String = "[" &
        "{""title"":""Main"",""links"":[{""href"":""/admin/dashboard"",""label"":""Dashboard"",""icon"":""house""}]}," &
        "{""title"":""Sales"",""links"":[{""href"":""/admin/ecommerce/billing"",""label"":""Billing / POS"",""icon"":""cash-register"",""perm"":""ecommerce.manage_billing""},{""href"":""/admin/ecommerce/orders"",""label"":""Orders"",""icon"":""receipt"",""perm"":""orders.view""},{""href"":""/admin/deliveries?view=all"",""label"":""Deliveries"",""icon"":""truck"",""perm"":""delivery.view_all""},{""href"":""/admin/ecommerce/due"",""label"":""Due Payments"",""icon"":""hand-holding-dollar"",""perm"":""ecommerce.manage_credits""},{""href"":""/admin/ecommerce/sales-history"",""label"":""Sales History"",""icon"":""clock-rotate-left"",""perm"":""ecommerce.manage_billing""}]}," &
        "{""title"":""Catalog"",""links"":[{""href"":""/admin/ecommerce/products"",""label"":""Products"",""icon"":""boxes-stacked"",""perm"":""ecommerce.manage_products"",""submenu"":[{""href"":""/admin/ecommerce/products/add"",""label"":""Add Product"",""icon"":""square-plus"",""perm"":""ecommerce.manage_products""},{""href"":""/admin/ecommerce/stock-out-products"",""label"":""Stock Out"",""icon"":""box-open"",""perm"":""ecommerce.manage_products""},{""href"":""/admin/ecommerce/product-reviews"",""label"":""Reviews"",""icon"":""star-half-stroke"",""perm"":""ecommerce.manage_products""},{""href"":""/admin/ecommerce/brands"",""label"":""Brands"",""icon"":""copyright"",""perm"":""ecommerce.manage_products""},{""href"":""/admin/ecommerce/product-tags"",""label"":""Badge Tags & Item Types"",""icon"":""tags"",""perm"":""ecommerce.manage_products""},{""href"":""/admin/ecommerce/barcode-print"",""label"":""Print Barcodes"",""icon"":""barcode"",""perm"":""ecommerce.manage_products""}]},{""href"":""/admin/ecommerce/categories"",""label"":""Categories"",""icon"":""list"",""perm"":""ecommerce.manage_categories""}]}," &
        "{""title"":""Customers & Marketing"",""links"":[{""href"":""/admin/ecommerce/customers"",""label"":""Customers"",""icon"":""user-group"",""perm"":""ecommerce.manage_customers""},{""href"":""/admin/ecommerce/offers"",""label"":""Offers & Coupons"",""icon"":""percent"",""perm"":""offers.any""},{""href"":""/push-notifications/push-manager2"",""label"":""Push Notifications"",""icon"":""bell"",""perm"":""push_notifications.send""}]}," &
        "{""title"":""Reports"",""links"":[{""href"":""/admin/ecommerce/reports"",""label"":""Report Builder"",""icon"":""file-invoice-dollar"",""perm"":""reports.any""},{""href"":""/admin/ecommerce/analytics"",""label"":""Sales Analytics"",""icon"":""chart-line"",""perm"":""ecommerce.manage_orders""},{""href"":""/admin/ecommerce/gst-report"",""label"":""Tax / GST"",""icon"":""percent"",""perm"":""reports.any"",""submenu"":[{""href"":""/admin/ecommerce/gst-report"",""label"":""GST Report"",""icon"":""file-invoice-dollar"",""perm"":""reports.any""},{""href"":""/admin/ecommerce/tax-settings"",""label"":""GST / Tax Settings"",""icon"":""gear"",""perm"":""ecommerce.manage_products""}]}]}," &
        "{""title"":""Online Store"",""links"":[{""href"":""/admin/customizer"",""label"":""Store Customizer"",""icon"":""brush"",""perm"":""ecommerce.manage_homepage"",""submenu"":[{""href"":""/admin/customizer?tab=home"",""label"":""Homepage"",""icon"":""house"",""perm"":""ecommerce.manage_homepage""},{""href"":""/admin/customizer?tab=product"",""label"":""Product Page"",""icon"":""box"",""perm"":""ecommerce.manage_homepage""},{""href"":""/admin/customizer?tab=header"",""label"":""Header & Menus"",""icon"":""bars"",""perm"":""ecommerce.manage_payment""},{""href"":""/admin/customizer?tab=footer"",""label"":""Footer"",""icon"":""grip-lines"",""perm"":""ecommerce.manage_payment""}]},{""href"":""/admin/pages"",""label"":""Static Pages"",""icon"":""file-lines"",""perm"":""pages.create""},{""href"":""/admin/file-manager"",""label"":""File Manager"",""icon"":""images"",""perm"":""files.access_file_manager""}]}," &
        "{""title"":""Settings"",""links"":[{""href"":""/admin/ecommerce/business-settings"",""label"":""Business Settings"",""icon"":""building"",""perm"":""ecommerce.manage_payment""},{""href"":""/admin/user-manager"",""label"":""Staff & Roles"",""icon"":""users-gear"",""perm"":""users.create""},{""href"":""#system"",""label"":""System"",""icon"":""gear"",""toggleOnly"":true,""submenu"":[{""href"":""/admin/activity-logs"",""label"":""Activity Logs"",""icon"":""clock-rotate-left"",""perm"":""security.view_logs""},{""href"":""/admin/cache-manager"",""label"":""Cache Manager"",""icon"":""bolt"",""perm"":""settings.maintenance_mode""},{""href"":""/admin/backup"",""label"":""Backup & Restore"",""icon"":""database"",""perm"":""users.manage_permissions""}]}]}," &
        "{""title"":""Account"",""links"":[{""href"":""/admin/my-profile"",""label"":""My Profile"",""icon"":""user""},{""href"":""/admin/staff-app"",""label"":""Staff App"",""icon"":""mobile-screen-button""},{""href"":""/api/auth/logout"",""label"":""Logout"",""icon"":""right-from-bracket"",""logout"":true}]}]"

    Private Function Allowed(perm As String) As Boolean
        If perm = "" Then Return True
        Dim p = AppState.I.Perm
        If perm = "reports.any" Then Return p.Has("ecommerce", "manage_orders") OrElse p.Has("ecommerce", "manage_billing")
        If perm = "offers.any" Then Return p.Has("ecommerce", "manage_products") OrElse p.Has("ecommerce", "manage_coupons")
        Dim parts = perm.Split("."c)
        Return p.Has(parts(0), parts(1))
    End Function

    ''' <summary>The menu to show: the website's (or the built-in copy), plus "My Deliveries" at the top of
    ''' Sales for delivery agents (as in the Android app).</summary>
    Public Function WithAppLinks(menu As JsonArray) As JsonArray
        If menu Is Nothing OrElse menu.Count = 0 Then menu = FallbackMenu()
        menu = TryCast(Js.Copy(menu), JsonArray)
        For Each sec In Js.Objs(menu)
            Dim links = TryCast(sec("links"), JsonArray)
            If links Is Nothing Then Continue For
            For Each l In Js.Objs(links).ToList()
                If Skip.Contains(Js.Str(l, "href")) Then links.Remove(l) : Continue For
                Dim subs = TryCast(l("submenu"), JsonArray)
                If subs IsNot Nothing Then
                    For Each x In Js.Objs(subs).ToList()
                        If Skip.Contains(Js.Str(x, "href")) Then subs.Remove(x)
                    Next
                End If
            Next
        Next
        ' Only delivery agents (people who deliver but don't run the orders) — the website shows admins no such link.
        If Not AppState.I.Allowed.Contains("deliveries") OrElse AppState.I.Perm.OrdersView() Then Return menu
        If Js.Objs(menu).Any(Function(sec) Js.Objs(Js.Arr(sec, "links")).Any(Function(l) Js.Str(l, "href") = "app:deliveries")) Then Return menu
        Dim copy = menu
        Dim mine = Js.Obj("href", "app:deliveries", "label", "My Deliveries", "icon", "motorcycle")
        Dim sales = Js.Objs(copy).FirstOrDefault(Function(sec) Js.Str(sec, "title").ToLowerInvariant() = "sales")
        If sales IsNot Nothing Then
            Dim links = TryCast(sales("links"), JsonArray)
            If links Is Nothing Then links = New JsonArray() : sales("links") = links
            links.Insert(0, mine)
        Else
            Dim sec = Js.Obj("title", "Delivery")
            sec("links") = New JsonArray(mine)
            copy.Insert(Math.Min(1, copy.Count), sec)
        End If
        Return copy
    End Function

    Public Function FallbackMenu() As JsonArray
        Dim res As New JsonArray()
        For Each sec In Js.Objs(TryCast(JsonNode.Parse(NavJson), JsonArray))
            Dim links As New JsonArray()
            For Each l In Js.Objs(Js.Arr(sec, "links"))
                If Not Allowed(Js.Str(l, "perm")) Then Continue For
                Dim subs As New JsonArray()
                For Each s In Js.Objs(Js.Arr(l, "submenu"))
                    If Allowed(Js.Str(s, "perm")) Then subs.Add(Js.Copy(s))
                Next
                If Js.Bool(l, "toggleOnly") AndAlso subs.Count = 0 Then Continue For
                Dim c = TryCast(Js.Copy(l), JsonObject)
                c("submenu") = subs
                links.Add(c)
            Next
            If links.Count > 0 Then res.Add(New JsonObject From {{"title", Js.Str(sec, "title")}, {"links", links}})
        Next
        Return res
    End Function
End Module
