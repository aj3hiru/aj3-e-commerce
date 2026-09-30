Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>A change waiting to be sent (a bill, a new product…). Kept on disk until the server confirms it.</summary>
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

    Public Function ToJson() As JsonObject
        Dim f As New JsonObject(), fi As New JsonObject(), rf As New JsonArray()
        For Each kv In Fields : f(kv.Key) = kv.Value : Next
        For Each kv In Files : fi(kv.Key) = kv.Value : Next
        For Each r In Refresh : rf.Add(r) : Next
        Return New JsonObject From {
            {"id", Id}, {"method", Method}, {"path", Path}, {"label", Label}, {"body", Js.Copy(Body)}, {"multipart", Multipart},
            {"fields", f}, {"files", fi}, {"failed", Failed}, {"error", [Error]}, {"attempts", Attempts}, {"refresh", rf}}
    End Function

    Public Shared Function FromJson(o As JsonObject) As OutboxItem
        Dim x As New OutboxItem With {
            .Id = Js.Str(o, "id"), .Method = Js.Str(o, "method", "POST"), .Path = Js.Str(o, "path"), .Label = Js.Str(o, "label"),
            .Body = Js.Copy(Js.Field(o, "body")), .Multipart = Js.Bool(o, "multipart"), .Failed = Js.Bool(o, "failed"), .Error = Js.Str(o, "error"), .Attempts = Js.Int(o, "attempts")}
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

''' <summary>The whole software's data: who is signed in, the synced lists (products, orders, customers…),
''' and the changes waiting to be sent. Pages read from here, so they open instantly, with or without internet.</summary>
Public Class AppState
    Public Shared ReadOnly I As New AppState()

    Public ReadOnly Api As New ApiClient()
    Public User As JsonObject
    Public Sets As New Dictionary(Of String, JsonNode)
    Public Hashes As New Dictionary(Of String, String)
    Public Outbox As New List(Of OutboxItem)
    Public Online As Boolean = True
    Public LastSync As DateTime?
    Public DeviceId As String

    ''' <summary>Data that pages show changed (raised on the UI thread, only when something really changed).</summary>
    Public Event DataChanged()
    ''' <summary>Online / waiting-to-send changed (for the small status in the header).</summary>
    Public Event StatusChanged()

    Private WithEvents Timer As Timer
    Private _syncing As Boolean
    Private _again As Boolean

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
        User = TryCast(Store.Read("user"), JsonObject)
        Dim sets = TryCast(Store.Read("sets"), JsonObject)
        If sets IsNot Nothing Then
            For Each kv In sets : Me.Sets(kv.Key) = Js.Copy(kv.Value) : Next
        End If
        Dim h = TryCast(Store.Read("hashes"), JsonObject)
        If h IsNot Nothing Then
            For Each kv In h : Hashes(kv.Key) = If(kv.Value?.ToString(), "") : Next
        End If
        For Each o In Js.Objs(TryCast(Store.Read("outbox"), JsonArray)) : Outbox.Add(OutboxItem.FromJson(o)) : Next
    End Sub

    Public Sub StartLoop()
        If Timer Is Nothing Then Timer = New Timer With {.Interval = 20000}
        Timer.Start()
        Dim unused = SyncNowAsync()
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
                User = last
                Online = False
                StartLoop()
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
            Sets.Clear() : Hashes.Clear() : Outbox.Clear()
            Store.Write("sets", New JsonObject()) : Store.Write("hashes", New JsonObject()) : SaveOutbox()
        End If
        UnparkOutbox(Js.Int(newUser, "id"))
        Api.Token = Js.Str(r.Data, "token")
        Store.WriteSecret("token", Api.Token)
        Store.WriteSecret("server", Api.Server)
        Store.WriteSecret("login_check", LoginCheck(identity, password))
        SaveRemember(identity, password, remember)
        User = newUser
        Store.Write("user", User)
        StartLoop()
        Return Nothing
    End Function

    Private Sub SaveRemember(identity As String, password As String, on_ As Boolean)
        Store.WriteSecret("remember_identity", If(on_, identity.Trim(), Nothing))
        Store.WriteSecret("remember_password", If(on_, password, Nothing))
    End Sub

    ''' <summary>Log out: nothing is deleted — data and unsent changes stay, and logging back in (even without
    ''' internet) continues exactly where it was.</summary>
    Public Sub Logout()
        Timer?.Stop()
        SaveOutbox()
        If Api.Token IsNot Nothing Then Store.WriteSecret("token_parked", Api.Token)
        Store.WriteSecret("token", Nothing)
        Api.Token = Nothing
    End Sub

    Private Sub ParkOutbox(userId As Integer)
        If Outbox.Count = 0 Then Return
        Dim had = If(TryCast(Store.Read("outbox_parked_" & userId), JsonArray), New JsonArray())
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

    ''' <summary>Sends now when online and waits for the answer; otherwise it waits in the outbox (never lost).</summary>
    Public Async Function SendNowAsync(item As OutboxItem) As Task(Of ApiResult)
        Dim r = Await Deliver(item)
        If r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
            If r.Outcome = ApiOutcome.Offline Then SetOnline(False)
            Outbox.Add(item)
            SaveOutbox()
            RaiseEvent StatusChanged()
        ElseIf r.IsOk Then
            SetOnline(True)
            Dim unused = SyncNowAsync()
        End If
        Return r
    End Function

    Private Function Deliver(o As OutboxItem) As Task(Of ApiResult)
        If o.Multipart Then Return Api.MultipartAsync(o.Method, o.Path, o.Fields, o.Files, o.Id)
        Return Api.SendAsync(o.Method, o.Path, o.Body, o.Id)
    End Function

    Private Sub SetOnline(v As Boolean)
        If Online = v Then Return
        Online = v
        RaiseEvent StatusChanged()
    End Sub

    ' ───────────── sync ─────────────
    ''' <summary>Sends waiting changes, then fetches only the lists that changed. Pages redraw only if data changed.</summary>
    Public Async Function SyncNowAsync(Optional force As Boolean = False) As Task
        If Not SignedIn Then Return
        If _syncing Then _again = True : Return
        _syncing = True
        Dim changed = False
        Try
            Do
                _again = False
                For Each o In Outbox.ToList()
                    If o.Failed Then Continue For
                    Dim r = Await Deliver(o)
                    Select Case r.Outcome
                        Case ApiOutcome.Ok
                            Outbox.Remove(o) : SaveOutbox() : changed = True : SetOnline(True)
                        Case ApiOutcome.Offline
                            SetOnline(False) : Exit Do
                        Case ApiOutcome.Busy, ApiOutcome.Unauthorized
                            o.Attempts += 1 : SaveOutbox() : Exit For
                        Case Else
                            o.Attempts += 1 : o.Failed = True : o.Error = r.Message : SaveOutbox() : changed = True
                    End Select
                Next
                Dim have As New JsonObject()
                If Not force Then
                    For Each kv In Hashes : have(kv.Key) = kv.Value : Next
                End If
                Dim p = Await Api.SendAsync("POST", "/api/app/v1/sync", New JsonObject From {{"have", have}})
                If p.Outcome = ApiOutcome.Offline Then SetOnline(False) : Exit Do
                If Not p.IsOk Then Exit Do
                SetOnline(True)
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
                If changed Then SaveSets()
                LastSync = DateTime.Now
            Loop While _again
            If Online Then Await RefreshExtrasAsync()
        Finally
            _syncing = False
            RaiseEvent StatusChanged()
            If changed Then RaiseEvent DataChanged()
        End Try
    End Function

    Private _lastExtras As DateTime = DateTime.MinValue
    ''' <summary>Dashboard numbers and the product form's choices, kept on the computer (every few minutes).</summary>
    Private Async Function RefreshExtrasAsync() As Task
        If DateTime.Now - _lastExtras < TimeSpan.FromMinutes(3) Then Return
        _lastExtras = DateTime.Now
        Dim d = Await Api.GetAsync("/api/app/v1/dashboard")
        If d.IsOk Then Store.Write("dashboard", Js.Copy(Js.Field(d.Data, "dashboard")))
        Dim f = Await Api.GetAsync("/api/app/v1/product-form")
        If f.IsOk Then Store.Write("product_form", Js.Copy(Js.Field(f.Data, "form")))
    End Function

    ' ───────────── changes that show at once (before the server confirms) ─────────────
    ''' <summary>Adds a record to a synced list right away (a new product / a bill made offline).</summary>
    Public Sub AddLocal(setName As String, row As JsonObject)
        Dim cur As JsonNode = Nothing
        Sets.TryGetValue(setName, cur)
        Dim a = TryCast(cur, JsonArray)
        If a Is Nothing Then a = New JsonArray() : Sets(setName) = a
        a.Insert(0, row)
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
