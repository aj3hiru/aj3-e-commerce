Imports System.Drawing
Imports System.Drawing.Imaging
Imports System.IO
Imports System.Reflection
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Test run (used by the build, never by staff): SriAndalStaff.exe --smoke &lt;folder&gt; with SRI_STORE
''' pointing at a folder of test data. Opens every page and detail page offline, turns every Display Option
''' off and on, and writes report.txt (each error with where it happened) plus a full-length picture of each page.</summary>
Public Module Smoke
    Private _out As String
    Private _report As StreamWriter
    Private _where As String = ""
    Private _errors As Integer

    Private Sub Note(line As String)
        _report.WriteLine(line)
        _report.Flush()
    End Sub

    Private Sub Fail(ex As Exception)
        _errors += 1
        Note("ERROR in " & _where & ": " & ex.ToString())
    End Sub

    Private Sub Pump(ms As Integer)
        Dim until = DateTime.Now.AddMilliseconds(ms)
        While DateTime.Now < until
            Application.DoEvents()
            Threading.Thread.Sleep(10)
        End While
    End Sub

    Public Sub Run(outDir As String)
        _out = outDir
        Directory.CreateDirectory(_out)
        _report = New StreamWriter(Path.Combine(_out, "report.txt"), False)
        AddHandler Application.ThreadException, Sub(s, e) Fail(e.Exception)
        AddHandler AppDomain.CurrentDomain.UnhandledException, Sub(s, e) Fail(TryCast(e.ExceptionObject, Exception))
        ' Never hang the build: stop after 12 minutes whatever happens.
        Dim watchdog As New Threading.Thread(Sub()
                                                  Threading.Thread.Sleep(TimeSpan.FromMinutes(12))
                                                  Try : Note("TIMEOUT at " & _where) : Catch : End Try
                                                  Environment.Exit(3)
                                              End Sub) With {.IsBackground = True}
        watchdog.Start()
        Try
            _where = "start"
            AppState.I.Init()
            AppState.I.Api.Server = "http://127.0.0.1:9"
            Note("User: " & Js.Str(AppState.I.User, "username") & " (" & Js.Str(AppState.I.User, "role") & ")")
            Dim main As New MainForm With {.WindowState = FormWindowState.Normal, .StartPosition = FormStartPosition.Manual, .Location = New Point(0, 0)}
            main.Size = New Size(1440, 900)
            main.Show()
            Pump(800)
            Shot(main, "00_start")
            Dim hrefs As New List(Of String)
            For Each sec In Js.Objs(Routes.WithAppLinks(AppState.I.Menu))
                For Each l In Js.Objs(Js.Arr(sec, "links"))
                    If Not Js.Bool(l, "toggleOnly") AndAlso Not Js.Bool(l, "logout") Then hrefs.Add(Js.Str(l, "href"))
                    For Each x In Js.Objs(Js.Arr(l, "submenu")) : hrefs.Add(Js.Str(x, "href")) : Next
                Next
            Next
            Note("Menu links: " & hrefs.Count)
            Dim n = 0
            For Each h In hrefs.Distinct()
                n += 1
                Visit(main, n.ToString("00") & "_" & Slug(h), h, Sub() main.Pick(h))
            Next
            ' Detail pages
            Dim o = AppState.I.List("orders").FirstOrDefault(Function(x) Js.Str(x, "type") = "online")
            If o IsNot Nothing Then Visit(main, "90_order_online", "order " & Js.Int(o, "id"), Sub() main.Push(New OrderDetailPage(Js.Int(o, "id"))))
            Dim o2 = AppState.I.List("orders").FirstOrDefault(Function(x) Js.Str(x, "type") <> "online")
            If o2 IsNot Nothing Then Visit(main, "91_order_store", "order " & Js.Int(o2, "id"), Sub() main.Push(New OrderDetailPage(Js.Int(o2, "id"))))
            Dim d = AppState.I.List("deliveries").FirstOrDefault()
            If d IsNot Nothing Then Visit(main, "92_delivery_agent", "delivery " & Js.Int(d, "id"), Sub() main.Push(New OrderDetailPage(Js.Int(d, "id"), agentView:=True)))
            Dim c = AppState.I.List("customers").FirstOrDefault()
            If c IsNot Nothing Then Visit(main, "93_customer", "customer " & Js.Int(c, "id"), Sub() main.Push(New CustomerProfilePage(Js.Int(c, "id"))))
            Dim p = AppState.I.List("products").FirstOrDefault()
            If p IsNot Nothing Then Visit(main, "94_product_edit", "product " & Js.Int(p, "id"), Sub() main.Push(New AddProductPage(Js.Int(p, "id"))))
            _where = "close"
            main.Close()
            Pump(200)
        Catch ex As Exception
            Fail(ex)
        End Try
        Note("DONE errors=" & _errors)
        _report.Close()
        Environment.Exit(If(_errors = 0, 0, 1))
    End Sub

    Private Function Slug(h As String) As String
        Return System.Text.RegularExpressions.Regex.Replace(h.Replace("/admin/", "").Replace("/ecommerce/", ""), "[^a-zA-Z0-9]+", "-").Trim("-"c)
    End Function

    Private Sub Visit(main As MainForm, name As String, what As String, open As Action)
        _where = what
        Dim before = _errors
        Try
            open()
            Pump(700)
            Shot(main, name)
            ' Every Display Option off, then back on.
            Dim page = main.CurrentPage
            If page IsNot Nothing Then
                For Each fld In page.GetType().GetFields(BindingFlags.Instance Or BindingFlags.NonPublic Or BindingFlags.Public)
                    If fld.FieldType IsNot GetType(DisplayOptions) Then Continue For
                    Dim dopt = TryCast(fld.GetValue(page), DisplayOptions)
                    If dopt Is Nothing Then Continue For
                    _where = what & " (display options off)"
                    dopt.SetAll(True)
                    Pump(250)
                    Shot(main, name & "_hidden", fullLength:=False)
                    _where = what & " (display options on)"
                    dopt.SetAll(False)
                    Pump(250)
                Next
            End If
        Catch ex As Exception
            Fail(ex)
        End Try
        Note(If(_errors = before, "OK    ", "FAILED") & " " & name & "  (" & what & ")")
    End Sub

    ''' <summary>The whole window; for scrolling pages the window is made as tall as the page first.</summary>
    Private Sub Shot(main As MainForm, name As String, Optional fullLength As Boolean = True)
        Try
            Dim h = 900
            If fullLength AndAlso main.CurrentPage IsNot Nothing Then
                Dim need = main.CurrentPage.ContentHeight()
                If need > 0 Then h = Math.Max(900, Math.Min(7000, need + main.HeaderHeight + 40))
            End If
            If main.Height <> h Then main.Height = h : Pump(250)
            Using bmp As New Bitmap(main.Width, main.Height)
                main.DrawToBitmap(bmp, New Rectangle(0, 0, main.Width, main.Height))
                bmp.Save(Path.Combine(_out, name & ".png"), ImageFormat.Png)
            End Using
            If main.Height <> 900 Then main.Height = 900 : Pump(100)
        Catch ex As Exception
            Note("shot failed " & name & ": " & ex.Message)
        End Try
    End Sub
End Module
