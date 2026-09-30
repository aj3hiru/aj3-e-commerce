Imports System.Text.Json.Nodes

''' <summary>Which page each website menu link opens in the software.</summary>
Public Module Routes
    Public Function Make(href As String) As PageBase
        Select Case href
            Case "/admin/dashboard" : Return New DashboardPage()
            Case "/admin/ecommerce/billing" : Return New BillingPage()
            Case "/admin/ecommerce/products/add" : Return New AddProductPage()
            Case "/admin/ecommerce/orders" : Return New OrdersPage()
            Case "/admin/ecommerce/customers" : Return New CustomersPage()
            Case "/admin/ecommerce/products" : Return New ProductsPage()
            Case "/admin/ecommerce/barcode-print" : Return New BarcodesPage()
            Case "/admin/deliveries?view=all" : Return New DeliveriesPage()
            Case "/admin/ecommerce/due" : Return New DuesPage()
            Case "/admin/ecommerce/sales-history" : Return New SalesHistoryPage()
            Case "/admin/ecommerce/categories" : Return New CategoriesPage()
            Case "/admin/ecommerce/brands" : Return New BrandsPage()
            Case "/admin/ecommerce/product-tags" : Return New TagsPage()
            Case "/admin/ecommerce/product-reviews" : Return New ReviewsPage()
            Case "/admin/ecommerce/stock-out-products" : Return New StockOutPage()
            Case "/admin/ecommerce/offers" : Return New OffersPage()
            Case "/push-notifications/push-manager2" : Return New PushPage()
            Case "/admin/ecommerce/reports" : Return New ReportsPage()
            Case "/admin/ecommerce/analytics" : Return New AnalyticsPage()
            Case "/admin/ecommerce/gst-report" : Return New GstPage()
            Case "/admin/ecommerce/tax-settings" : Return New TaxPage()
            Case "/admin/pages" : Return New StaticPagesPage()
            Case "/admin/file-manager" : Return New FilesPage()
            Case "/admin/activity-logs" : Return New ActivityPage()
            Case "/admin/cache-manager" : Return New CachePage()
            Case "/admin/user-manager" : Return New StaffPage()
            Case "/admin/my-profile" : Return New ProfilePage()
            Case "/admin/backup" : Return New BackupPage()
            Case "/admin/staff-app" : Return New StaffAppPage()
            Case "/admin/ecommerce/business-settings" : Return New BusinessPage()
            Case "app:deliveries" : Return New MyDeliveriesPage()
            Case "/admin/ecommerce/payment-settings" : Return New BusinessPage("payment")
            Case "/admin/ecommerce/login-settings" : Return New BusinessPage("login")
            Case "/admin/ecommerce/campaign-offer", "/admin/ecommerce/coupons" : Return New OffersPage()
            Case "/admin/customizer", "/admin/customizer?tab=home" : Return New CustomizerPage("home")
            Case "/admin/customizer?tab=product" : Return New CustomizerPage("product")
            Case "/admin/customizer?tab=header" : Return New CustomizerPage("header")
            Case "/admin/customizer?tab=footer" : Return New CustomizerPage("footer")
        End Select
        Return Nothing
    End Function

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
        If Not AppState.I.Allowed.Contains("deliveries") Then Return menu
        If Js.Objs(menu).Any(Function(sec) Js.Objs(Js.Arr(sec, "links")).Any(Function(l) Js.Str(l, "href") = "app:deliveries")) Then Return menu
        Dim copy = TryCast(Js.Copy(menu), JsonArray)
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
