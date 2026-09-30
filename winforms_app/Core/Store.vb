Imports System.IO
Imports System.Security.Cryptography
Imports System.Text
Imports System.Text.Json.Nodes
Imports System.Text.RegularExpressions

''' <summary>Everything kept on this computer (%LocalAppData%\SriAndalStaff): data, pages, changes waiting
''' to be sent, photos picked offline. Written to a temp file then renamed, so a power cut never leaves a
''' half-written file. Secrets (login) are encrypted with Windows' own protection (DPAPI).</summary>
Public Module Store
    Public ReadOnly Folder As String = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SriAndalStaff")
    Public ReadOnly DataDir As String = Path.Combine(Folder, "data")
    Public ReadOnly FilesDir As String = Path.Combine(Folder, "files")
    Private ReadOnly Cache As New Dictionary(Of String, JsonNode)
    Private ReadOnly Gate As New Object()

    Public Sub Init()
        Directory.CreateDirectory(DataDir)
        Directory.CreateDirectory(FilesDir)
    End Sub

    Private Function FileOf(name As String) As String
        Return Path.Combine(DataDir, Regex.Replace(name, "[<>:""/\\|?*=&\s]", "_") & ".json")
    End Function

    Public Function Read(name As String) As JsonNode
        SyncLock Gate
            Dim v As JsonNode = Nothing
            If Cache.TryGetValue(name, v) Then Return v
            Dim f = FileOf(name)
            If Not File.Exists(f) Then Return Nothing
            Try
                v = JsonNode.Parse(File.ReadAllText(f, Encoding.UTF8))
                Cache(name) = v
                Return v
            Catch
                Return Nothing
            End Try
        End SyncLock
    End Function

    Public Sub Write(name As String, value As JsonNode)
        SyncLock Gate
            Cache(name) = value
            Dim f = FileOf(name)
            Dim tmp = f & ".tmp"
            Try
                File.WriteAllText(tmp, If(value Is Nothing, "null", value.ToJsonString()), Encoding.UTF8)
                File.Move(tmp, f, True)
            Catch
            End Try
        End SyncLock
    End Sub

    Public Sub Remove(name As String)
        SyncLock Gate
            Cache.Remove(name)
            Dim f = FileOf(name)
            If File.Exists(f) Then File.Delete(f)
        End SyncLock
    End Sub

    ''' <summary>A picked photo copied into the app's folder, so it is still there when it uploads later.</summary>
    Public Function KeepFile(src As String) As String
        Dim dst = Path.Combine(FilesDir, Guid.NewGuid().ToString("N") & Path.GetExtension(src))
        File.Copy(src, dst, True)
        Return dst
    End Function

    ' ── secrets (Windows DPAPI: only this Windows user on this computer can read them) ──
    Public Sub WriteSecret(name As String, value As String)
        Dim f = Path.Combine(Folder, name & ".bin")
        If value Is Nothing Then
            If File.Exists(f) Then File.Delete(f)
            Return
        End If
        File.WriteAllBytes(f, ProtectedData.Protect(Encoding.UTF8.GetBytes(value), Nothing, DataProtectionScope.CurrentUser))
    End Sub

    Public Function ReadSecret(name As String) As String
        Dim f = Path.Combine(Folder, name & ".bin")
        If Not File.Exists(f) Then Return Nothing
        Try
            Return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(f), Nothing, DataProtectionScope.CurrentUser))
        Catch
            Return Nothing
        End Try
    End Function

    Public Function Sha(s As String) As String
        Return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)))
    End Function
End Module
