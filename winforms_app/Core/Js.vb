Imports System.Globalization
Imports System.Text.Json
Imports System.Text.Json.Nodes

''' <summary>Small, safe readers for the server's JSON (a missing or odd value never crashes a page).</summary>
Public Module Js
    Public Function Field(n As JsonNode, key As String) As JsonNode
        Dim o = TryCast(n, JsonObject)
        If o Is Nothing Then Return Nothing
        Dim v As JsonNode = Nothing
        If o.TryGetPropertyValue(key, v) Then Return v
        Return Nothing
    End Function

    Public Function Str(n As JsonNode, key As String, Optional def As String = "") As String
        Dim v = Field(n, key)
        If v Is Nothing Then Return def
        Dim jv = TryCast(v, JsonValue)
        If jv Is Nothing Then Return v.ToJsonString()
        Dim s As String = Nothing
        If jv.TryGetValue(Of String)(s) Then Return s
        Return jv.ToJsonString().Trim(""""c)
    End Function

    Public Function Num(n As JsonNode, key As String, Optional def As Double = 0) As Double
        Return ToNum(Field(n, key), def)
    End Function

    Public Function ToNum(v As JsonNode, Optional def As Double = 0) As Double
        Dim jv = TryCast(v, JsonValue)
        If jv Is Nothing Then Return def
        Dim d As Double
        If jv.TryGetValue(Of Double)(d) Then Return d
        Dim s As String = Nothing
        If jv.TryGetValue(Of String)(s) AndAlso Double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, d) Then Return d
        Return def
    End Function

    Public Function Int(n As JsonNode, key As String, Optional def As Integer = 0) As Integer
        Return CInt(Math.Round(Num(n, key, def)))
    End Function

    Public Function Bool(n As JsonNode, key As String) As Boolean
        Dim jv = TryCast(Field(n, key), JsonValue)
        If jv Is Nothing Then Return False
        Dim b As Boolean
        If jv.TryGetValue(Of Boolean)(b) Then Return b
        Return False
    End Function

    Public Function IsNull(n As JsonNode, key As String) As Boolean
        Return Field(n, key) Is Nothing
    End Function

    Public Function Arr(n As JsonNode, key As String) As JsonArray
        Return If(TryCast(Field(n, key), JsonArray), New JsonArray())
    End Function

    Public Function Objs(a As JsonArray) As List(Of JsonObject)
        Dim l As New List(Of JsonObject)
        If a Is Nothing Then Return l
        For Each x In a
            Dim o = TryCast(x, JsonObject)
            If o IsNot Nothing Then l.Add(o)
        Next
        Return l
    End Function

    ''' <summary>An ISO time from the server as this computer's local time (Nothing when missing).</summary>
    Public Function Time(n As JsonNode, key As String) As DateTime?
        Dim s = Str(n, key)
        Dim d As DateTimeOffset
        If s <> "" AndAlso DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, d) Then Return d.LocalDateTime
        Return Nothing
    End Function

    Public Function Copy(n As JsonNode) As JsonNode
        If n Is Nothing Then Return Nothing
        Return JsonNode.Parse(n.ToJsonString())
    End Function

    Public Function Parse(s As String) As JsonNode
        Try
            Return JsonNode.Parse(s)
        Catch
            Return Nothing
        End Try
    End Function

    Public Function NewId() As String
        Return Guid.NewGuid().ToString()
    End Function
End Module
