Imports System.IO
Imports System.Net
Imports System.Net.Http
Imports System.Net.Http.Headers
Imports System.Text
Imports System.Text.Json.Nodes

Public Enum ApiOutcome
    Ok
    Rejected
    Unauthorized
    Forbidden
    Busy
    Offline
End Enum

Public Class ApiResult
    Public Outcome As ApiOutcome
    Public Status As Integer
    Public Data As JsonObject
    Public Sub New(o As ApiOutcome, s As Integer, d As JsonObject)
        Outcome = o : Status = s : Data = If(d, New JsonObject())
    End Sub
    Public ReadOnly Property IsOk As Boolean
        Get
            Return Outcome = ApiOutcome.Ok
        End Get
    End Property
    Public ReadOnly Property Message As String
        Get
            Dim m = Js.Str(Data, "message")
            If m = "" Then m = Js.Str(Data, "error")
            If m <> "" Then Return m
            Select Case Outcome
                Case ApiOutcome.Offline : Return "No internet connection."
                Case ApiOutcome.Unauthorized : Return "Please log in again."
                Case ApiOutcome.Forbidden : Return "You don't have permission for this."
                Case ApiOutcome.Busy : Return "The server is busy. Trying again shortly."
                Case Else : Return "Something went wrong."
            End Select
        End Get
    End Property
End Class

''' <summary>Talks to the website's staff API (the same one the Android app uses). Every call has a time
''' limit, so the software never hangs on a bad connection — it reports Offline and the change waits.</summary>
Public Class ApiClient
    Public Server As String = "https://admin.sriandaltraders.co.in"
    Public Token As String

    Private Shared ReadOnly Http As New HttpClient(New SocketsHttpHandler With {.PooledConnectionLifetime = TimeSpan.FromMinutes(5), .AutomaticDecompression = DecompressionMethods.All}) With {.Timeout = TimeSpan.FromSeconds(25)}

    Private Function Make(method As HttpMethod, path As String, Optional idem As String = Nothing) As HttpRequestMessage
        Dim req As New HttpRequestMessage(method, Server & path)
        req.Headers.Accept.Add(New MediaTypeWithQualityHeaderValue("application/json"))
        req.Headers.Add("X-Staff-App", "1")
        If Token IsNot Nothing Then req.Headers.Authorization = New AuthenticationHeaderValue("Bearer", Token)
        If idem IsNot Nothing Then req.Headers.Add("Idempotency-Key", idem)
        Return req
    End Function

    Public Async Function GetAsync(path As String) As Task(Of ApiResult)
        Return Await Run(Make(HttpMethod.Get, path))
    End Function

    Public Async Function SendAsync(method As String, path As String, body As JsonNode, Optional idem As String = Nothing) As Task(Of ApiResult)
        Dim req = Make(New HttpMethod(method), path, idem)
        req.Content = New StringContent(If(body Is Nothing, "{}", body.ToJsonString()), Encoding.UTF8, "application/json")
        Return Await Run(req)
    End Function

    ''' <summary>Form upload (product with photos). Files: field name → path; "name#2" sends several under one name.</summary>
    Public Async Function MultipartAsync(method As String, path As String, fields As Dictionary(Of String, String), files As Dictionary(Of String, String), Optional idem As String = Nothing) As Task(Of ApiResult)
        Dim req = Make(New HttpMethod(method), path, idem)
        Dim form As New MultipartFormDataContent()
        For Each kv In fields
            form.Add(New StringContent(If(kv.Value, "")), kv.Key)
        Next
        If files IsNot Nothing Then
            For Each kv In files
                If File.Exists(kv.Value) Then
                    Dim c As New ByteArrayContent(File.ReadAllBytes(kv.Value))
                    c.Headers.ContentType = New MediaTypeHeaderValue(MimeOf(kv.Value))
                    form.Add(c, kv.Key.Split("#"c)(0), IO.Path.GetFileName(kv.Value))
                End If
            Next
        End If
        req.Content = form
        Return Await Run(req, 90)
    End Function

    Private Shared Function MimeOf(p As String) As String
        Select Case Path.GetExtension(p).ToLowerInvariant()
            Case ".png" : Return "image/png"
            Case ".webp" : Return "image/webp"
            Case ".gif" : Return "image/gif"
            Case Else : Return "image/jpeg"
        End Select
    End Function

    Private Async Function Run(req As HttpRequestMessage, Optional seconds As Integer = 20) As Task(Of ApiResult)
        Dim res As HttpResponseMessage
        Try
            Using cts As New Threading.CancellationTokenSource(TimeSpan.FromSeconds(seconds))
                res = Await Http.SendAsync(req, cts.Token).ConfigureAwait(True)
            End Using
        Catch ex As TaskCanceledException
            Return New ApiResult(ApiOutcome.Offline, 0, New JsonObject From {{"message", "The connection is too slow right now."}})
        Catch ex As HttpRequestException
            Return New ApiResult(ApiOutcome.Offline, 0, Nothing)
        Catch ex As Exception
            Return New ApiResult(ApiOutcome.Offline, 0, Nothing)
        End Try
        Dim data As JsonObject = Nothing
        Try
            Dim text = Await res.Content.ReadAsStringAsync().ConfigureAwait(True)
            Dim n = JsonNode.Parse(text)
            data = TryCast(n, JsonObject)
            If data Is Nothing AndAlso n IsNot Nothing Then data = New JsonObject From {{"data", n}}
        Catch
        End Try
        data = If(data, New JsonObject())
        Dim s = CInt(res.StatusCode)
        If s = 401 Then Return New ApiResult(ApiOutcome.Unauthorized, s, data)
        If s = 403 Then Return New ApiResult(ApiOutcome.Forbidden, s, data)
        If s = 502 OrElse s = 503 OrElse s = 504 OrElse s = 429 OrElse s >= 500 Then Return New ApiResult(ApiOutcome.Busy, s, data)
        If s >= 400 OrElse (data.ContainsKey("success") AndAlso Not Js.Bool(data, "success")) Then Return New ApiResult(ApiOutcome.Rejected, s, data)
        Return New ApiResult(ApiOutcome.Ok, s, data)
    End Function

    ''' <summary>Full address of an uploaded file ("uploads/…" → https://…/uploads/…).</summary>
    Public Function FileUrl(p As String) As String
        If String.IsNullOrEmpty(p) Then Return Nothing
        If p.StartsWith("http") Then Return p
        Return Server & "/" & p.TrimStart("/"c)
    End Function

    Public Async Function GetBytesAsync(url As String) As Task(Of Byte())
        Try
            Using cts As New Threading.CancellationTokenSource(TimeSpan.FromSeconds(20))
                Return Await Http.GetByteArrayAsync(url, cts.Token)
            End Using
        Catch
            Return Nothing
        End Try
    End Function
End Class
