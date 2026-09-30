Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>A change waiting to be sent (a bill, a new product, an edit…). Kept on disk until the server
''' confirms it. Its Id is sent as the Idempotency-Key, so sending it twice never repeats it.</summary>
Public Class OutboxItem
    Public Id As String = Js.NewId()
    Public Method As String = "POST"
    Public Path As String
    Public Label As String
    Public Body As JsonNode
    Public Multipart As Boolean
    Public Fields As New Dictionary(Of String, String)
    Public Files As New Dictionary(Of String, String)
    Public Failed As Boolean
    Public [Error] As String
    Public Attempts As Integer
    Public Refresh As New List(Of String)
    ''' <summary>How the change shows in the software before the server confirms it (see AppState.ApplyEffect).</summary>
    Public Effect As JsonObject
    Public CreatedAt As DateTime = DateTime.UtcNow

    Public Function ToJson() As JsonObject
        Dim f As New JsonObject(), fi As New JsonObject(), rf As New JsonArray()
        For Each kv In Fields : f(kv.Key) = kv.Value : Next
        For Each kv In Files : fi(kv.Key) = kv.Value : Next
        For Each r In Refresh : rf.Add(r) : Next
        Return New JsonObject From {
            {"id", Id}, {"method", Method}, {"path", Path}, {"label", Label}, {"body", Js.Copy(Body)}, {"multipart", Multipart},
            {"fields", f}, {"files", fi}, {"failed", Failed}, {"error", [Error]}, {"attempts", Attempts}, {"refresh", rf},
            {"effect", Js.Copy(Effect)}, {"createdAt", CreatedAt.ToString("o")}}
    End Function

    Public Shared Function FromJson(o As JsonObject) As OutboxItem
        Dim x As New OutboxItem With {
            .Id = Js.Str(o, "id"), .Method = Js.Str(o, "method", "POST"), .Path = Js.Str(o, "path"), .Label = Js.Str(o, "label"),
            .Body = Js.Copy(Js.Field(o, "body")), .Multipart = Js.Bool(o, "multipart"), .Failed = Js.Bool(o, "failed"), .Error = Js.Str(o, "error"), .Attempts = Js.Int(o, "attempts"),
            .Effect = TryCast(Js.Copy(Js.Field(o, "effect")), JsonObject)}
        Dim t = Js.Time(o, "createdAt")
        If t.HasValue Then x.CreatedAt = t.Value.ToUniversalTime()
        Dim f = TryCast(Js.Field(o, "fields"), JsonObject)
        If f IsNot Nothing Then
            For Each kv In f : x.Fields(kv.Key) = If(kv.Value?.ToString(), "") : Next
        End If
        Dim fi = TryCast(Js.Field(o, "files"), JsonObject)
        If fi IsNot Nothing Then
            For Each kv In fi : x.Files(kv.Key) = If(kv.Value?.ToString(), "") : Next
        End If
        For Each r In Js.Arr(o, "refresh") : x.Refresh.Add(r.ToString()) : Next
        Return x
    End Function
End Class

''' <summary>What the signed-in person may do (the website's own permission set).</summary>
Public Class Perms
    Private ReadOnly _raw As JsonObject
    Public ReadOnly Role As String
    Public Sub New(user As JsonObject)
        _raw = TryCast(Js.Field(user, "permissions"), JsonObject)
        Role = Js.Str(user, "role")
    End Sub
    Public Function Has(group As String, key As String) As Boolean
        Return Js.Bool(Js.Field(_raw, group), key)
    End Function
    Public ReadOnly Property IsAdmin As Boolean
        Get
            Return Role = "admin"
        End Get
    End Property
    Public Function Billing() As Boolean
        Return Has("ecommerce", "manage_billing")
    End Function
    Public Function Products() As Boolean
        Return Has("ecommerce", "manage_products")
    End Function
    Public Function OrdersView() As Boolean
        Return Has("orders", "view")
    End Function
    Public Function OrdersAdmin() As Boolean
        Return Has("ecommerce", "manage_orders")
    End Function
End Class

''' <summary>The whole software's data: who is signed in, the synced lists (products, orders, customers…),
''' every page's data, and the changes waiting to be sent. Pages read from here, so they open instantly,
''' with or without internet. Nothing is ever deleted on logout.</summary>
Public Class AppState
    Public Shared ReadOnly I As New AppState()

    ''' <summary>Data behind the website's other admin pages (/api/app/v1/page/&lt;name&gt;), all kept on the computer.</summary>
    Public Shared ReadOnly PageNames As String() = {"brands", "tags", "reviews", "campaigns", "coupons", "pages", "files", "activity", "push", "business", "customizer", "cache", "backups", "deliveries", "dues_paid", "addresses", "customer_orders", "coupon_activity", "sales_ledger", "payments"}
    Private Shared ReadOnly SetupKey As String = "w1:" & String.Join(",", PageNames)

    Public ReadOnly Api As New ApiClient()
    Public User As JsonObject
    Public Perm As New Perms(Nothing)
    Public Sets As New Dictionary(Of String, JsonNode)
    Public Hashes As New Dictionary(Of String, String)
    Public Allowed As New List(Of String)
    Public Outbox As New List(Of OutboxItem)
    Public Online As Boolean = True
    Public LastSync As DateTime?
    Public LastError As String
    Public DeviceId As String
    ''' <summary>The website's admin menu for this person (sections → links → submenus).</summary>
    Public Menu As New JsonArray()
    ''' <summary>Page name → its data (kept on the computer).</summary>
    Public ReadOnly Pages As New Dictionary(Of String, JsonNode)
    Public ReadOnly PageAt As New Dictionary(Of String, DateTime)
    Private ReadOnly _rawPage As New Dictionary(Of String, String)
    Public SetupNeeded As Boolean
    Public Syncing As Boolean

    ''' <summary>Data that pages show changed (raised on the UI thread, only when something really changed).</summary>
    Public Event DataChanged()
    ''' <summary>Online / waiting-to-send / syncing changed (for the small status in the header).</summary>
    Public Event StatusChanged()
    ''' <summary>Menu or the signed-in person changed.</summary>
    Public Event MenuChanged()
    ''' <summary>Something to tell the person (a new online order, a delivery for them…).</summary>
    Public Event Announce(title As String, text As String)
    ''' <summary>The server no longer accepts this login (password changed / account turned off).</summary>
    Public Event NeedLogin()

    Private WithEvents Timer As Timer
    Private _syncing As Boolean
    Private _again As Boolean
    Private _changed As Boolean
    Private _liveGen As Integer
    Private _lastMe As DateTime = DateTime.MinValue
    Private _lastPages As DateTime = DateTime.MinValue
    Private _pagesBusy As Boolean

    Public ReadOnly Property SignedIn As Boolean
        Get
            Return User IsNot Nothing AndAlso Api.Token IsNot Nothing
        End Get
    End Property

    Public ReadOnly Property Pending As Integer
        Get
            Return Outbox.Where(Function(o) Not o.Failed).Count()
        End Get
    End Property

    Public ReadOnly Property FailedCount As Integer
        Get
            Return Outbox.Where(Function(o) o.Failed).Count()
        End Get
    End Property

    Public ReadOnly Property Settings As JsonObject
        Get
            Dim v As JsonNode = Nothing
            Sets.TryGetValue("settings", v)
            Return If(TryCast(v, JsonObject), New JsonObject())
        End Get
    End Property

    Public Function List(name As String) As List(Of JsonObject)
        Dim v As JsonNode = Nothing
        Sets.TryGetValue(name, v)
        Return Js.Objs(TryCast(v, JsonArray))
    End Function

    ''' <summary>Orders on this computer: the synced recent ones plus the older sales ledger (15 months).</summary>
    Public Function AllOrders() As List(Of JsonObject)
        Dim recent = List("orders")
        Dim ids = recent.Select(Function(o) Js.Int(o, "id")).ToHashSet()
        Return PageList("sales_ledger").Where(Function(o) Not ids.Contains(Js.Int(o, "id"))).Concat(recent).ToList()
    End Function

    ''' <summary>A sale: a store bill, or an online order once delivered (not cancelled).</summary>
    Public Shared Function IsSale(o As JsonObject) As Boolean
        Return Js.Str(o, "status") <> "Canceled" AndAlso (Js.Str(o, "type") <> "online" OrElse Js.Str(o, "status") = "Delivered")
    End Function

    ''' <summary>A page's data (Nothing when it was never downloaded).</summary>
    Public Function Page(name As String) As JsonNode
        Dim v As JsonNode = Nothing
        Pages.TryGetValue(name, v)
        Return v
    End Function

    Public Function PageObj(name As String) As JsonObject
        Return If(TryCast(Page(name), JsonObject), New JsonObject())
    End Function

    Public Function PageList(name As String, Optional key As String = Nothing) As List(Of JsonObject)
        Dim v = Page(name)
        If key IsNot Nothing Then v = Js.Field(v, key)
        Return Js.Objs(TryCast(v, JsonArray))
    End Function

    ' ───────────── start-up ─────────────
    Public Sub Init()
        Store.Init()
        DeviceId = Js.Str(Store.Read("device_box"), "id")
        If DeviceId = "" Then
            DeviceId = Js.NewId()
            Store.Write("device_box", New JsonObject From {{"id", DeviceId}})
        End If
        Dim srv = Store.ReadSecret("server")
        If Not String.IsNullOrEmpty(srv) Then Api.Server = srv
        Api.Token = Store.ReadSecret("token")
        SetUser(TryCast(Store.Read("user"), JsonObject))
        Dim sets = TryCast(Store.Read("sets"), JsonObject)
        If sets IsNot Nothing Then
            For Each kv In sets : Me.Sets(kv.Key) = Js.Copy(kv.Value) : Next
        End If
        Dim h = TryCast(Store.Read("hashes"), JsonObject)
        If h IsNot Nothing Then
            For Each kv In h : Hashes(kv.Key) = If(kv.Value?.ToString(), "") : Next
        End If
        For Each o In Js.Objs(TryCast(Store.Read("outbox"), JsonArray)) : Outbox.Add(OutboxItem.FromJson(o)) : Next
        Menu = If(TryCast(Js.Copy(Store.Read("menu")), JsonArray), New JsonArray())
        For Each n In PageNames
            Dim v = TryCast(Store.Read("page_" & n), JsonObject)
            If v IsNot Nothing AndAlso v.ContainsKey("data") Then
                Pages(n) = Js.Copy(v("data"))
                _rawPage(n) = If(v("data")?.ToJsonString(), "null")
                Dim at = Js.Time(v, "at")
                If at.HasValue Then PageAt(n) = at.Value
            End If
        Next
        Dim ls = Js.Time(Store.Read("last_sync_box"), "at")
        If ls.HasValue Then LastSync = ls
        ApplyEffects()
        SetupNeeded = SignedIn AndAlso Js.Str(Store.Read("setup_box"), "key") <> SetupKey
    End Sub

    Private Sub SetUser(u As JsonObject)
        User = u
        Perm = New Perms(u)
    End Sub

    Public Sub StartLoop()
        If Timer Is Nothing Then Timer = New Timer With {.Interval = 20000}
        Timer.Start()
        Dim unused = SyncNowAsync()
        Dim unused2 = ListenLiveAsync()
    End Sub

    Private Sub Timer_Tick(sender As Object, e As EventArgs) Handles Timer.Tick
        Dim unused = SyncNowAsync()
    End Sub

    ' ───────────── login (Remember me, offline re-login, nothing ever deleted) ─────────────
    Private Function LoginCheck(identity As String, password As String) As String
        Return Store.Sha(identity.Trim().ToLowerInvariant() & "|" & password & "|" & DeviceId)
    End Function

    Public Function Remembered() As (String, String)
        Dim id = Store.ReadSecret("remember_identity")
        If id Is Nothing Then Return (Nothing, Nothing)
        Return (id, If(Store.ReadSecret("remember_password"), ""))
    End Function

    ''' <summary>Returns Nothing when signed in, otherwise the message to show.</summary>
    Public Async Function LoginAsync(identity As String, password As String, remember As Boolean) As Task(Of String)
        Api.Token = Nothing
        Dim r = Await Api.SendAsync("POST", "/api/app/v1/login", New JsonObject From {
            {"identity", identity.Trim()}, {"password", password}, {"device", DeviceId}, {"platform", "windows"}})
        If r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
            ' No internet: the same person can come back in with the password that worked last time.
            Dim check = Store.ReadSecret("login_check"), parked = Store.ReadSecret("token_parked")
            Dim last = TryCast(Store.Read("user"), JsonObject)
            If check IsNot Nothing AndAlso parked IsNot Nothing AndAlso last IsNot Nothing AndAlso check = LoginCheck(identity, password) Then
                Api.Token = parked
                Store.WriteSecret("token", parked)
                SaveRemember(identity, password, remember)
                SetUser(last)
                UnparkOutbox(Js.Int(last, "id"))
                Online = False
                Return Nothing
            End If
            Return "No internet connection. Log in once with internet, or use the same username and password as last time."
        End If
        If Not r.IsOk Then Return r.Message
        Dim newUser = TryCast(Js.Copy(Js.Field(r.Data, "user")), JsonObject)
        Dim last2 = TryCast(Store.Read("user"), JsonObject)
        If last2 IsNot Nothing AndAlso Js.Int(last2, "id") <> Js.Int(newUser, "id") Then
            ' A different person: park the previous person's unsent changes (never deleted), start this person clean.
            ParkOutbox(Js.Int(last2, "id"))
            Sets.Clear() : Hashes.Clear() : Outbox.Clear() : Pages.Clear() : _rawPage.Clear() : PageAt.Clear()
            Menu = New JsonArray()
            Store.Write("sets", New JsonObject()) : Store.Write("hashes", New JsonObject()) : SaveOutbox()
            Store.Write("menu", New JsonArray())
            For Each n In PageNames : Store.Remove("page_" & n) : Next
            Store.Remove("setup_box")
        End If
        UnparkOutbox(Js.Int(newUser, "id"))
        Api.Token = Js.Str(r.Data, "token")
        Store.WriteSecret("token", Api.Token)
        Store.WriteSecret("server", Api.Server)
        Store.WriteSecret("login_check", LoginCheck(identity, password))
        SaveRemember(identity, password, remember)
        SetUser(newUser)
        Store.Write("user", User)
        Online = True
        SetupNeeded = Js.Str(Store.Read("setup_box"), "key") <> SetupKey
        Return Nothing
    End Function

    Private Sub SaveRemember(identity As String, password As String, on_ As Boolean)
        Store.WriteSecret("remember_identity", If(on_, identity.Trim(), Nothing))
        Store.WriteSecret("remember_password", If(on_, password, Nothing))
    End Sub

    ''' <summary>Log out: nothing is deleted — data and unsent changes stay, and logging back in (even without
    ''' internet) continues exactly where it was.</summary>
    Public Sub Logout()
        _liveGen += 1
        Timer?.Stop()
        SaveOutbox()
        If Api.Token IsNot Nothing Then Store.WriteSecret("token_parked", Api.Token)
        Store.WriteSecret("token", Nothing)
        Api.Token = Nothing
    End Sub

    Private Sub ParkOutbox(userId As Integer)
        If Outbox.Count = 0 Then Return
        Dim had = If(TryCast(Js.Copy(Store.Read("outbox_parked_" & userId)), JsonArray), New JsonArray())
        For Each o In Outbox : had.Add(o.ToJson()) : Next
        Store.Write("outbox_parked_" & userId, had)
    End Sub

    Private Sub UnparkOutbox(userId As Integer)
        Dim had = TryCast(Store.Read("outbox_parked_" & userId), JsonArray)
        If had Is Nothing OrElse had.Count = 0 Then Return
        For Each o In Js.Objs(had)
            Dim x = OutboxItem.FromJson(o)
            If Not Outbox.Any(Function(y) y.Id = x.Id) Then Outbox.Add(x)
        Next
        SaveOutbox()
        Store.Remove("outbox_parked_" & userId)
        ApplyEffects()
    End Sub

    ' ───────────── changes (outbox) ─────────────
    Public Sub SaveOutbox()
        Dim a As New JsonArray()
        For Each o In Outbox : a.Add(o.ToJson()) : Next
        Store.Write("outbox", a)
    End Sub

    Private Sub SaveSets()
        Dim o As New JsonObject()
        For Each kv In Sets : o(kv.Key) = Js.Copy(kv.Value) : Next
        Store.Write("sets", o)
        Dim h As New JsonObject()
        For Each kv In Hashes : h(kv.Key) = kv.Value : Next
        Store.Write("hashes", h)
    End Sub

    Private Sub SavePage(name As String)
        Dim at As DateTime = DateTime.UtcNow
        PageAt.TryGetValue(name, at)
        Store.Write("page_" & name, New JsonObject From {{"data", Js.Copy(Page(name))}, {"at", at.ToUniversalTime().ToString("o")}})
    End Sub

    ''' <summary>Records a change: it shows in the software at once and is sent when possible (never lost).</summary>
    Public Sub Enqueue(item As OutboxItem)
        Outbox.Add(item)
        If item.Effect IsNot Nothing Then ApplyEffect(item.Effect, True)
        SaveOutbox()
        RaiseEvent StatusChanged()
        RaiseEvent DataChanged()
        Dim unused = SyncNowAsync()
    End Sub

    ''' <summary>Sends now when online and waits for the answer; otherwise it waits in the outbox (never lost).</summary>
    Public Async Function SendNowAsync(item As OutboxItem) As Task(Of ApiResult)
        Dim r = Await Deliver(item)
        If r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
            If r.Outcome = ApiOutcome.Offline Then SetOnline(False)
            Enqueue(item)
        ElseIf r.IsOk Then
            SetOnline(True)
            If item.Effect IsNot Nothing AndAlso Not {"product_new", "customer_new", "page_row_new", "set_row_new"}.Contains(Js.Str(item.Effect, "kind")) Then
                ApplyEffect(item.Effect, True)
                RaiseEvent DataChanged()
            End If
            Dim unused = SyncNowAsync()
        End If
        Return r
    End Function

    Private Function Deliver(o As OutboxItem) As Task(Of ApiResult)
        If o.Multipart OrElse o.Files.Count > 0 Then Return Api.MultipartAsync(o.Method, o.Path, o.Fields, o.Files, o.Id)
        Return Api.SendAsync(o.Method, o.Path, o.Body, o.Id)
    End Function

    Public Sub Retry(o As OutboxItem)
        o.Failed = False
        o.Error = Nothing
        SaveOutbox()
        RaiseEvent StatusChanged()
        Dim unused = SyncNowAsync()
    End Sub

    Public Sub Discard(o As OutboxItem)
        Outbox.Remove(o)
        SaveOutbox()
        RaiseEvent StatusChanged()
        Dim unused = SyncNowAsync(True)
    End Sub

    Private Sub SetOnline(v As Boolean)
        If Online = v Then Return
        Online = v
        RaiseEvent StatusChanged()
    End Sub

    ' ───────────── sync ─────────────
    ''' <summary>Sends waiting changes, then fetches only the lists that changed. Pages redraw only if data changed.</summary>
    Public Async Function SyncNowAsync(Optional force As Boolean = False, Optional only As String() = Nothing) As Task
        If Not SignedIn Then Return
        If _syncing Then _again = True : Return
        _syncing = True
        Syncing = True
        RaiseEvent StatusChanged()
        Try
            Do
                _again = False
                Dim sent = Await PushAsync()
                If Not Online AndAlso sent < 0 Then Exit Do
                Await PullAsync(If(force, Nothing, only), force)
                If Online AndAlso DateTime.Now - _lastMe > TimeSpan.FromMinutes(10) Then Await RefreshMeAsync()
            Loop While _again
            If Online Then Await LoadPagesAsync()
        Finally
            _syncing = False
            Syncing = False
            RaiseEvent StatusChanged()
            If _changed Then
                _changed = False
                RaiseEvent DataChanged()
            End If
        End Try
    End Function

    ''' <summary>Sends the outbox. Returns how many were sent, or -1 when the connection is down.</summary>
    Private Async Function PushAsync() As Task(Of Integer)
        Dim sent = 0
        For Each o In Outbox.ToList()
            If o.Failed Then Continue For
            Dim r = Await Deliver(o)
            Select Case r.Outcome
                Case ApiOutcome.Ok
                    Outbox.Remove(o) : SaveOutbox() : sent += 1 : _changed = True : SetOnline(True)
                Case ApiOutcome.Offline
                    SetOnline(False) : Return -1
                Case ApiOutcome.Busy
                    o.Attempts += 1 : SaveOutbox() : Return sent
                Case ApiOutcome.Unauthorized
                    RaiseEvent NeedLogin() : Return sent
                Case Else
                    o.Attempts += 1 : o.Failed = True : o.Error = r.Message : SaveOutbox() : _changed = True
            End Select
        Next
        Return sent
    End Function

    Private Async Function PullAsync(only As String(), force As Boolean) As Task
        Dim have As New JsonObject()
        If Not force Then
            For Each kv In Hashes : have(kv.Key) = kv.Value : Next
        End If
        Dim body As New JsonObject From {{"have", have}}
        If only IsNot Nothing AndAlso only.Length > 0 Then
            Dim a As New JsonArray()
            For Each s In only : a.Add(s) : Next
            body("only") = a
        End If
        Dim wasOnline = Online
        Dim p = Await Api.SendAsync("POST", "/api/app/v1/sync", body)
        If p.Outcome = ApiOutcome.Offline Then
            SetOnline(False)
            Return
        End If
        If p.Outcome = ApiOutcome.Unauthorized Then
            RaiseEvent NeedLogin()
            Return
        End If
        If Not p.IsOk Then
            LastError = p.Message
            Return
        End If
        LastError = Nothing
        SetOnline(True)
        If Not wasOnline Then _changed = True
        Allowed = Js.Arr(p.Data, "allowed").Select(Function(x) x.ToString()).ToList()
        Dim changed = False
        Dim incoming = TryCast(Js.Field(p.Data, "sets"), JsonObject)
        If incoming IsNot Nothing Then
            For Each kv In incoming
                Dim v = TryCast(kv.Value, JsonObject)
                If v Is Nothing Then Continue For
                If v.ContainsKey("data") Then
                    Sets(kv.Key) = Js.Copy(v("data"))
                    changed = True
                End If
                Hashes(kv.Key) = Js.Str(v, "hash")
            Next
        End If
        ' Lists this role no longer has (permissions changed) are removed.
        If only Is Nothing AndAlso Allowed.Count > 0 Then
            For Each k In Sets.Keys.ToList()
                If Not Allowed.Contains(k) Then Sets.Remove(k) : Hashes.Remove(k) : changed = True
            Next
        End If
        If changed Then
            _changed = True
            ApplyEffects(setsOnly:=True) ' changes not sent yet stay visible
        End If
        SaveSets()
        LastSync = DateTime.Now
        Store.Write("last_sync_box", New JsonObject From {{"at", DateTime.UtcNow.ToString("o")}})
    End Function

    Public Async Function RefreshMeAsync() As Task
        Dim r = Await Api.GetAsync("/api/app/v1/me")
        If r.Outcome = ApiOutcome.Unauthorized Then RaiseEvent NeedLogin() : Return
        If Not r.IsOk Then Return
        _lastMe = DateTime.Now
        Dim u = TryCast(Js.Copy(Js.Field(r.Data, "user")), JsonObject)
        If u IsNot Nothing Then SetUser(u) : Store.Write("user", User)
        Dim t = Js.Str(r.Data, "token")
        If t <> "" Then Api.Token = t : Store.WriteSecret("token", t)
        Await LoadMenuAsync()
    End Function

    ''' <summary>Same menu as the website sidebar (kept on the computer for offline starts).</summary>
    Public Async Function LoadMenuAsync() As Task
        Dim r = Await Api.GetAsync("/api/app/v1/menu")
        Dim m = TryCast(Js.Field(r.Data, "menu"), JsonArray)
        If Not r.IsOk OrElse m Is Nothing Then Return
        Dim raw = m.ToJsonString()
        If raw = Menu.ToJsonString() Then Return
        Menu = TryCast(Js.Copy(m), JsonArray)
        Store.Write("menu", Js.Copy(Menu))
        RaiseEvent MenuChanged()
    End Function

    ' ───────────── live order feed ─────────────
    ''' <summary>The server answers the moment anyone places, accepts, changes or assigns an order, so this
    ''' computer updates at once and the right people get a notification.</summary>
    Private Async Function ListenLiveAsync() As Task
        _liveGen += 1
        Dim gen = _liveGen
        Dim after = 0, fails = 0
        While gen = _liveGen AndAlso SignedIn
            Dim r = Await Api.GetAsync("/api/app/v1/events?after=" & after & "&wait=25", 40)
            If gen <> _liveGen Then Return
            If Not r.IsOk Then
                If r.Outcome = ApiOutcome.Unauthorized Then Return
                fails += 1
                Await Task.Delay(TimeSpan.FromSeconds(If(fails > 6, 30, 3 * fails)))
                Continue While
            End If
            fails = 0
            Dim first = after = 0
            after = Js.Int(r.Data, "last")
            Dim events = Js.Objs(Js.Arr(r.Data, "events"))
            If first OrElse events.Count = 0 Then Continue While
            Dim unused = SyncNowAsync(only:={"orders", "deliveries", "dues", "customers", "products"})
            For Each e In events : TellAbout(e) : Next
        End While
    End Function

    Private Sub TellAbout(e As JsonObject)
        Dim me_ = Js.Int(User, "id")
        If Not Js.IsNull(e, "actorId") AndAlso Js.Int(e, "actorId") = me_ Then Return
        Dim no = Js.Str(e, "orderNumber"), who = Js.Str(e, "customer").Trim(), amount = Theme.Money(Js.Num(e, "total"))
        Dim type = Js.Str(e, "type"), [to] = Js.Str(e, "to")
        If who = "" Then who = "Customer"
        If type = "assign" AndAlso [to] = Js.Str(User, "username") Then
            RaiseEvent Announce("New delivery for you", no & " · " & who & " · " & amount)
        ElseIf type = "placed" AndAlso Js.Str(e, "orderType") = "online" AndAlso Perm.OrdersView() Then
            RaiseEvent Announce("New online order", no & " · " & who & " · " & amount)
        ElseIf type = "status" AndAlso (Perm.OrdersView() OrElse Js.Int(e, "agentId") = me_) Then
            RaiseEvent Announce(no & " → " & [to], Js.Str(e, "actor") & " changed it · " & who)
        End If
    End Sub

    ' ───────────── every page's data ─────────────
    ''' <summary>Downloads every page's data in the background (at most every few minutes unless force).</summary>
    Public Async Function LoadPagesAsync(Optional force As Boolean = False) As Task
        If Not SignedIn OrElse _pagesBusy Then Return
        If Not force AndAlso DateTime.Now - _lastPages < TimeSpan.FromMinutes(3) Then Return
        _pagesBusy = True
        Dim changed = False
        Try
            Dim off = False
            Await Pool(PageNames.ToList(), 5, Async Function(n)
                                                   Dim o = Await ReloadPageAsync(n, False)
                                                   If o = ApiOutcome.Offline Then off = True
                                                   If o = ApiOutcome.Ok Then changed = True
                                                   Return Not off
                                               End Function)
            If Not off Then Await RefreshExtrasAsync()
            If Not off Then Await LoadProductDetailsAsync()
            If Not off Then Await LoadOrderHistoriesAsync()
            If Not off Then Await LoadReportsAsync()
            _lastPages = DateTime.Now
        Finally
            _pagesBusy = False
            If _pagesChangedFlag Then
                _pagesChangedFlag = False
                RaiseEvent DataChanged()
            End If
        End Try
    End Function

    Private _pagesChangedFlag As Boolean

    ''' <summary>Fresh copy of one page's data. Returns Ok also when nothing changed (then nothing redraws).</summary>
    Public Async Function ReloadPageAsync(name As String, Optional notify As Boolean = True) As Task(Of ApiOutcome)
        Dim r = Await Api.GetAsync("/api/app/v1/page/" & name)
        If r.IsOk Then
            Dim d = Js.Field(r.Data, "data")
            Dim raw = If(d Is Nothing, "null", d.ToJsonString())
            Dim had As String = Nothing
            If _rawPage.TryGetValue(name, had) AndAlso had = raw AndAlso Pages.ContainsKey(name) Then Return ApiOutcome.Ok
            _rawPage(name) = raw
            Pages(name) = Js.Copy(d)
            Dim at = Js.Time(r.Data, "at")
            PageAt(name) = If(at, DateTime.Now)
            ' Changes still waiting to be sent stay visible on the fresh copy.
            For Each o In Outbox
                If o.Effect IsNot Nothing AndAlso Not o.Failed AndAlso Js.Str(o.Effect, "page") = name Then ApplyEffect(o.Effect, False)
            Next
            SavePage(name)
            _pagesChangedFlag = True
            If notify Then _pagesChangedFlag = False : RaiseEvent DataChanged()
        ElseIf r.Outcome = ApiOutcome.Offline Then
            SetOnline(False)
        End If
        Return r.Outcome
    End Function

    ''' <summary>Runs work for every item, lanes at a time (downloads in parallel, much faster).</summary>
    Private Shared Async Function Pool(Of T)(items As List(Of T), lanes As Integer, work As Func(Of T, Task(Of Boolean)), Optional tick As Action(Of Integer) = Nothing) As Task
        Dim [next] = 0, done = 0
        Dim [stop] = False
        Dim lane = Async Function() As Task
                       While Not [stop] AndAlso [next] < items.Count
                           Dim it = items([next])
                           [next] += 1
                           If Not Await work(it) Then [stop] = True
                           done += 1
                           tick?.Invoke(done)
                       End While
                   End Function
        Dim all As New List(Of Task)
        For ix = 1 To lanes : all.Add(lane()) : Next
        Await Task.WhenAll(all)
    End Function

    Private _lastExtras As DateTime = DateTime.MinValue
    ''' <summary>Dashboard numbers and the product form's choices, kept on the computer.</summary>
    Private Async Function RefreshExtrasAsync(Optional force As Boolean = False) As Task
        If Not force AndAlso DateTime.Now - _lastExtras < TimeSpan.FromMinutes(3) Then Return
        _lastExtras = DateTime.Now
        Dim d = Await Api.GetAsync("/api/app/v1/dashboard")
        If d.IsOk Then
            Dim v = Js.Field(d.Data, "dashboard")
            If v IsNot Nothing AndAlso v.ToJsonString() <> Store.Read("dashboard")?.ToJsonString() Then
                Store.Write("dashboard", Js.Copy(v))
                _pagesChangedFlag = True
            End If
        End If
        Dim f = Await Api.GetAsync("/api/app/v1/product-form")
        If f.IsOk Then Store.Write("product_form", Js.Copy(Js.Field(f.Data, "form")))
    End Function

    ''' <summary>The full product form of every product, kept on the computer so a product can be fully edited
    ''' offline. Only products that changed are fetched again.</summary>
    Private Async Function LoadProductDetailsAsync(Optional tick As Action(Of Integer, Integer) = Nothing) As Task
        If Not Perm.Products() Then Return
        Dim todo As New List(Of JsonObject)
        For Each p In List("products")
            Dim id = Js.Int(p, "id")
            If id <= 0 Then Continue For
            Dim have = Store.Read("product_" & id)
            If have IsNot Nothing AndAlso Js.Str(have, "updatedAt") = Js.Str(p, "updatedAt") Then Continue For
            todo.Add(p)
        Next
        Await Pool(todo, 6, Async Function(p)
                                Dim r = Await Api.GetAsync("/api/app/v1/products/" & Js.Int(p, "id"))
                                If r.Outcome = ApiOutcome.Offline Then Return False
                                If r.IsOk Then Store.Write("product_" & Js.Int(p, "id"), New JsonObject From {{"updatedAt", Js.Str(p, "updatedAt")}, {"product", Js.Copy(Js.Field(r.Data, "product"))}})
                                Return True
                            End Function, Sub(d) tick?.Invoke(d, todo.Count))
    End Function

    ''' <summary>Each order's history, payments and receipts (the order page), fetched again only when it changed.</summary>
    Private Async Function LoadOrderHistoriesAsync(Optional tick As Action(Of Integer, Integer) = Nothing) As Task
        If Not Perm.OrdersView() Then Return
        Dim todo As New List(Of JsonObject)
        For Each o In List("orders").Take(1000)
            Dim id = Js.Int(o, "id")
            If id <= 0 Then Continue For
            Dim have = Store.Read("order_" & id)
            If have IsNot Nothing AndAlso Js.Str(have, "rev") = Js.Str(o, "rev") Then Continue For
            todo.Add(o)
        Next
        Await Pool(todo, 6, Async Function(o)
                                Dim r = Await Api.GetAsync("/api/app/v1/orders/" & Js.Int(o, "id"))
                                If r.Outcome = ApiOutcome.Offline Then Return False
                                If r.IsOk Then Store.Write("order_" & Js.Int(o, "id"), New JsonObject From {{"rev", Js.Str(o, "rev")}, {"order", Js.Copy(Js.Field(r.Data, "order"))}})
                                Return True
                            End Function, Sub(d) tick?.Invoke(d, todo.Count))
    End Function

    ''' <summary>Where a report (Report Builder) for these filters is kept on the computer.</summary>
    Public Shared Function ReportKey(q As String) As String
        Return "report_" & q
    End Function

    Private Async Function LoadReportsAsync() As Task
        If Not Perm.OrdersAdmin() AndAlso Not Perm.Billing() Then Return
        Await Pool({"today", "yesterday", "this_month", "prev_month"}.ToList(), 4, Async Function(range)
                                                                                   Dim q = "range=" & range
                                                                                   Dim r = Await Api.GetAsync("/api/app/v1/report?" & q)
                                                                                   If r.IsOk Then Store.Write(ReportKey(q), Js.Copy(Js.Field(r.Data, "report")))
                                                                                   Return r.Outcome <> ApiOutcome.Offline
                                                                               End Function)
    End Function

    Public Function SavedOrder(id As Integer) As JsonObject
        Return TryCast(Js.Field(Store.Read("order_" & id), "order"), JsonObject)
    End Function

    Public Sub SaveOrder(id As Integer, order As JsonObject, rev As String)
        Store.Write("order_" & id, New JsonObject From {{"rev", rev}, {"order", Js.Copy(order)}})
    End Sub

    Public Function SavedProduct(id As Integer) As JsonObject
        Return TryCast(Js.Field(Store.Read("product_" & id), "product"), JsonObject)
    End Function

    Public Sub SaveProduct(id As Integer, product As JsonObject)
        Store.Write("product_" & id, New JsonObject From {{"updatedAt", ""}, {"product", Js.Copy(product)}})
    End Sub

    ''' <summary>Everything the software can show, downloaded once after login (with a % shown): data, menu,
    ''' dashboard, every page, reports, product forms and order histories. False when the internet dropped.</summary>
    Public Async Function DownloadAllAsync(progress As Action(Of Double, String)) As Task(Of Boolean)
        progress(0.02, "Connecting")
        Await PushAsync()
        progress(0.05, "Products, orders and customers")
        LastError = Nothing
        Await PullAsync(Nothing, True)
        If Not Online OrElse LastError IsNot Nothing Then Return False
        progress(0.18, "Menu and your account")
        Await RefreshMeAsync()
        Await RefreshExtrasAsync(True)
        progress(0.22, "Pages")
        Dim off = False
        Await Pool(PageNames.ToList(), 5, Async Function(n)
                                              Dim o = Await ReloadPageAsync(n, False)
                                              If o = ApiOutcome.Offline Then off = True
                                              Return Not off
                                          End Function, Sub(d) progress(0.22 + 0.28 * d / PageNames.Length, "Pages (" & d & " of " & PageNames.Length & ")"))
        If off Then Return False
        progress(0.5, "Reports")
        Await LoadReportsAsync()
        progress(0.55, "Product details")
        Await LoadProductDetailsAsync(Sub(d, t) progress(0.55 + 0.25 * d / Math.Max(1, t), "Product details (" & d & " of " & t & ")"))
        progress(0.8, "Order histories")
        Await LoadOrderHistoriesAsync(Sub(d, t) progress(0.8 + 0.19 * d / Math.Max(1, t), "Order histories (" & d & " of " & t & ")"))
        If Not Online Then Return False
        Store.Write("setup_box", New JsonObject From {{"key", SetupKey}})
        _lastPages = DateTime.Now
        progress(1, "Ready")
        SetupNeeded = False
        _pagesChangedFlag = False
        RaiseEvent DataChanged()
        Return True
    End Function

    ' ───────────── changes that show at once (before the server confirms) ─────────────
    Private Sub ApplyEffects(Optional setsOnly As Boolean = False)
        For Each o In Outbox
            If o.Effect Is Nothing OrElse o.Failed Then Continue For
            If setsOnly AndAlso Js.Str(o.Effect, "page") <> "" Then Continue For
            ApplyEffect(o.Effect, False)
        Next
    End Sub

    Private Sub PatchIn(setName As String, id As JsonNode, fields As JsonObject)
        For Each m In List(setName)
            If Js.Same(Js.Field(m, "id"), id) Then Js.Merge(m, fields)
        Next
    End Sub

    Private Function SetArray(name As String) As JsonArray
        Dim cur As JsonNode = Nothing
        Sets.TryGetValue(name, cur)
        Dim a = TryCast(cur, JsonArray)
        If a Is Nothing Then a = New JsonArray() : Sets(name) = a
        Return a
    End Function

    ''' <summary>Makes a change visible at once. save=True writes the result to disk.</summary>
    Public Sub ApplyEffect(e As JsonObject, save As Boolean)
        Dim kind = Js.Str(e, "kind")
        Dim pageName = Js.Str(e, "page")
        Select Case kind
            Case "order"
                Dim f = TryCast(Js.Field(e, "fields"), JsonObject)
                PatchIn("orders", Js.Field(e, "id"), f)
                PatchIn("deliveries", Js.Field(e, "id"), f)
            Case "pos_sale"
                Dim order = TryCast(Js.Field(e, "order"), JsonObject)
                Dim orders = SetArray("orders")
                If Not Js.Objs(orders).Any(Function(o) Js.Str(o, "localRef") = Js.Str(order, "localRef")) Then orders.Insert(0, Js.Copy(order))
            Case "due_payment"
                Dim paid = TryCast(Js.Field(e, "amounts"), JsonObject)
                Dim dues = SetArray("dues")
                For Each d In Js.Objs(dues)
                    Dim a = Js.Num(paid, Js.Str(d, "id"))
                    If a <= 0 Then Continue For
                    Dim bal = Math.Max(0, Js.Num(d, "balance") - a)
                    d("paid") = Js.Num(d, "paid") + a
                    d("balance") = bal
                    If bal <= 0.004 Then d("status") = "paid"
                    Dim pays = TryCast(Js.Field(d, "payments"), JsonArray)
                    If pays Is Nothing Then pays = New JsonArray() : d("payments") = pays
                    pays.Add(New JsonObject From {{"receipt", Nothing}, {"amount", a}, {"method", Js.Str(e, "method", "Cash")}, {"at", DateTime.UtcNow.ToString("o")}})
                Next
                For ix = dues.Count - 1 To 0 Step -1
                    If Js.Num(dues(ix), "balance") <= 0.004 Then dues.RemoveAt(ix)
                Next
            Case "product", "set_row", "customer", "staff", "due"
                Dim setName = Select_(kind, Js.Str(e, "set"))
                PatchIn(setName, Js.Field(e, "id"), TryCast(Js.Field(e, "fields"), JsonObject))
            Case "order_items"
                For Each setName In {"orders", "deliveries"}
                    For Each o In List(setName)
                        If Not Js.Same(Js.Field(o, "id"), Js.Field(e, "id")) Then Continue For
                        Dim items = TryCast(Js.Field(o, "items"), JsonArray)
                        If items Is Nothing Then items = New JsonArray() : o("items") = items
                        Dim before = Js.Objs(items).Sum(Function(x) Js.Num(x, "qty") * Js.Num(x, "price"))
                        If Js.Str(e, "op") = "remove" Then
                            For ix = items.Count - 1 To 0 Step -1
                                If Js.Int(items(ix), "id") = Js.Int(e, "itemId") Then items.RemoveAt(ix)
                            Next
                        ElseIf Js.Str(e, "op") = "add" Then
                            Dim it = TryCast(Js.Field(e, "item"), JsonObject)
                            Dim same = Js.Objs(items).FirstOrDefault(Function(x) Js.Int(x, "productId") = Js.Int(it, "productId"))
                            If same IsNot Nothing Then same("qty") = Js.Int(same, "qty") + Js.Int(it, "qty") Else items.Add(Js.Copy(it))
                        End If
                        Dim diff = Js.Objs(items).Sum(Function(x) Js.Num(x, "qty") * Js.Num(x, "price")) - before
                        o("subtotal") = Js.Num(o, "subtotal") + diff
                        o("total") = Js.Num(o, "total") + diff
                    Next
                Next
            Case "product_new"
                Dim np = TryCast(Js.Field(e, "product"), JsonObject)
                Dim l = SetArray("products")
                If Not Js.Objs(l).Any(Function(x) Js.Str(x, "localRef") <> "" AndAlso Js.Str(x, "localRef") = Js.Str(np, "localRef")) Then l.Insert(0, Js.Copy(np))
            Case "set_row_new"
                Dim row = TryCast(Js.Field(e, "row"), JsonObject)
                Dim l = SetArray(Js.Str(e, "set"))
                If Not Js.Objs(l).Any(Function(x) Js.Str(x, "localRef") <> "" AndAlso Js.Str(x, "localRef") = Js.Str(row, "localRef")) Then l.Insert(0, Js.Copy(row))
            Case "customer_new"
                Dim nc = TryCast(Js.Field(e, "customer"), JsonObject)
                Dim l = SetArray("customers")
                If Not Js.Objs(l).Any(Function(x) Js.Str(x, "localRef") <> "" AndAlso Js.Str(x, "localRef") = Js.Str(nc, "localRef")) Then l.Insert(0, Js.Copy(nc))
            Case "product_delete", "set_row_delete"
                Dim setName = If(kind = "product_delete", "products", Js.Str(e, "set"))
                Dim ids = Js.Arr(e, "ids").Select(Function(x) x?.ToJsonString()).ToHashSet()
                Dim l = SetArray(setName)
                For ix = l.Count - 1 To 0 Step -1
                    If ids.Contains(Js.Field(l(ix), "id")?.ToJsonString()) Then l.RemoveAt(ix)
                Next
            Case "stock_add"
                For Each p In List("products")
                    If Js.Same(Js.Field(p, "id"), Js.Field(e, "id")) AndAlso Not Js.IsNull(p, "stock") Then p("stock") = Js.Int(p, "stock") + Js.Int(e, "qty")
                Next
            Case "page_row", "page_row_new", "page_row_delete"
                Dim data = Page(pageName)
                If data Is Nothing Then Exit Select
                Dim rows = TryCast(If(Js.Str(e, "list") = "", data, Js.Field(data, Js.Str(e, "list"))), JsonArray)
                If rows Is Nothing Then Exit Select
                If kind = "page_row" Then
                    Dim f = TryCast(Js.Field(e, "fields"), JsonObject)
                    For Each r In Js.Objs(rows)
                        If Js.Same(Js.Field(r, "id"), Js.Field(e, "id")) Then Js.Merge(r, f)
                    Next
                ElseIf kind = "page_row_delete" Then
                    Dim ids = Js.Arr(e, "ids").Select(Function(x) x?.ToJsonString()).ToHashSet()
                    For ix = rows.Count - 1 To 0 Step -1
                        If ids.Contains(Js.Field(rows(ix), "id")?.ToJsonString()) Then rows.RemoveAt(ix)
                    Next
                Else
                    Dim row = TryCast(Js.Field(e, "row"), JsonObject)
                    If Not Js.Objs(rows).Any(Function(r) Js.Str(r, "localRef") <> "" AndAlso Js.Str(r, "localRef") = Js.Str(row, "localRef")) Then rows.Insert(0, Js.Copy(row))
                End If
            Case "page_row_key"
                For Each r In PageList(pageName)
                    If Js.Str(r, "key") = Js.Str(e, "key") Then Js.Merge(r, TryCast(Js.Field(e, "fields"), JsonObject))
                Next
            Case "page_set"
                Dim data = TryCast(Page(pageName), JsonObject)
                Dim path = Js.Arr(e, "path").Select(Function(x) x.ToString()).ToList()
                If data Is Nothing OrElse path.Count = 0 Then Exit Select
                Dim cur = data
                For Each k In path.Take(path.Count - 1)
                    Dim nxt = TryCast(Js.Field(cur, k), JsonObject)
                    If nxt Is Nothing Then nxt = New JsonObject() : cur(k) = nxt
                    cur = nxt
                Next
                cur(path.Last()) = Js.Copy(Js.Field(e, "value"))
        End Select
        If save Then
            If pageName <> "" Then SavePage(pageName) Else SaveSets()
        End If
    End Sub

    Private Shared Function Select_(kind As String, setName As String) As String
        Select Case kind
            Case "product" : Return "products"
            Case "customer" : Return "customers"
            Case "staff" : Return "staff"
            Case "due" : Return "dues"
            Case Else : Return setName
        End Select
    End Function

    ''' <summary>Adds a record to a synced list right away (a new product / a bill made offline).</summary>
    Public Sub AddLocal(setName As String, row As JsonObject)
        SetArray(setName).Insert(0, row)
        SaveSets()
        RaiseEvent DataChanged()
    End Sub

    ''' <summary>Stock goes down at once after a bill (the server does the same when it receives it).</summary>
    Public Sub TakeStock(productId As Integer, sizeId As Integer?, qty As Integer)
        For Each p In List("products")
            If Js.Int(p, "id") <> productId Then Continue For
            If sizeId.HasValue Then
                For Each z In Js.Objs(Js.Arr(p, "sizes"))
                    If Js.Int(z, "id") = sizeId.Value AndAlso Not Js.IsNull(z, "stock") Then z("stock") = Js.Int(z, "stock") - qty
                Next
            ElseIf Js.Str(p, "type") = "physical" AndAlso Not Js.IsNull(p, "stock") Then
                p("stock") = Js.Int(p, "stock") - qty
            End If
        Next
        SaveSets()
    End Sub

    Public Sub Notify()
        RaiseEvent DataChanged()
    End Sub
End Class
