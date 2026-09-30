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

    ''' <summary>Two ids equal (number 5 and "5" count as the same).</summary>
    Public Function Same(a As JsonNode, b As JsonNode) As Boolean
        If a Is Nothing OrElse b Is Nothing Then Return False
        Return a.ToJsonString().Trim(""""c) = b.ToJsonString().Trim(""""c)
    End Function

    ''' <summary>Copies every field of [fields] into [target] (deep copies: a value can only live in one place).</summary>
    Public Sub Merge(target As JsonObject, fields As JsonObject)
        If target Is Nothing OrElse fields Is Nothing Then Return
        For Each kv In fields.ToList()
            target(kv.Key) = Copy(kv.Value)
        Next
    End Sub

    ''' <summary>A JSON object from "key", value pairs: Js.Obj("name", "x", "price", 5).</summary>
    Public Function Obj(ParamArray kv As Object()) As JsonObject
        Dim o As New JsonObject()
        For i = 0 To kv.Length - 2 Step 2
            o(CStr(kv(i))) = ToNode(kv(i + 1))
        Next
        Return o
    End Function

    Public Function ToNode(v As Object) As JsonNode
        If v Is Nothing Then Return Nothing
        If TypeOf v Is JsonNode Then Return Copy(DirectCast(v, JsonNode))
        If TypeOf v Is String Then Return JsonValue.Create(DirectCast(v, String))
        If TypeOf v Is Boolean Then Return JsonValue.Create(DirectCast(v, Boolean))
        If TypeOf v Is Integer Then Return JsonValue.Create(DirectCast(v, Integer))
        If TypeOf v Is Long Then Return JsonValue.Create(DirectCast(v, Long))
        If TypeOf v Is Double Then Return JsonValue.Create(DirectCast(v, Double))
        If TypeOf v Is Decimal Then Return JsonValue.Create(DirectCast(v, Decimal))
        If TypeOf v Is DateTime Then Return JsonValue.Create(DirectCast(v, DateTime).ToUniversalTime().ToString("o"))
        If TypeOf v Is IEnumerable(Of String) Then
            Dim a As New JsonArray()
            For Each s In DirectCast(v, IEnumerable(Of String)) : a.Add(s) : Next
            Return a
        End If
        If TypeOf v Is IEnumerable(Of Integer) Then
            Dim a As New JsonArray()
            For Each s In DirectCast(v, IEnumerable(Of Integer)) : a.Add(s) : Next
            Return a
        End If
        Return JsonValue.Create(v.ToString())
    End Function

    ''' <summary>Text of any value (numbers as written, nulls as "").</summary>
    Public Function Text(v As JsonNode) As String
        If v Is Nothing Then Return ""
        Dim jv = TryCast(v, JsonValue)
        If jv Is Nothing Then Return v.ToJsonString()
        Dim s As String = Nothing
        If jv.TryGetValue(Of String)(s) Then Return s
        Return jv.ToJsonString()
    End Function

    Public Function NewId() As String
        Return Guid.NewGuid().ToString()
    End Function
End Module
