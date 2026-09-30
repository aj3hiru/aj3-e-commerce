Imports System.IO
Imports System.Windows.Forms

Public Module Program
    <STAThread>
    Public Sub Main(args As String())
        ' The pages are laid out in pixels (like the website). Windows scales the whole window at 125%/150%, with
        ' GDI text drawn sharp — per-monitor mode made text bigger than its boxes (cropped titles and rows).
        Application.SetHighDpiMode(HighDpiMode.DpiUnawareGdiScaled)
        Application.EnableVisualStyles()
        Application.SetCompatibleTextRenderingDefault(False)
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException)
        If args.Length >= 2 AndAlso args(0) = "--smoke" Then
            Smoke.Run(args(1))
            Return
        End If
        AddHandler Application.ThreadException, Sub(s, e) Crash.Show(e.Exception)
        AddHandler AppDomain.CurrentDomain.UnhandledException, Sub(s, e) Crash.Log(TryCast(e.ExceptionObject, Exception))
        AppState.I.Init()
        Do
            If Not AppState.I.SignedIn Then
                Using login As New LoginForm()
                    If login.ShowDialog() <> DialogResult.OK Then Return
                End Using
            End If
            ' One-time full download (first login / after an update with new pages), with a % bar.
            If AppState.I.SetupNeeded AndAlso AppState.I.Online Then
                Using setup As New SetupForm()
                    If setup.ShowDialog() <> DialogResult.OK Then Return
                End Using
            End If
            AppState.I.StartLoop()
            Dim main As New MainForm()
            Application.Run(main)
            If Not main.LoggedOut Then Return
        Loop
    End Sub
End Module

''' <summary>An error the software didn't expect: written to crash.log (with where it happened) and shown
''' with a "Copy details" button, so it can be sent to be fixed. The data on the computer is untouched.</summary>
Public Module Crash
    Public ReadOnly LogFile As String = Path.Combine(Store.Folder, "crash.log")
    Public CurrentPage As String = ""
    Private _showing As Boolean

    Public Function Details(ex As Exception) As String
        Return "Sri Andal Staff " & Application.ProductVersion.Split("+"c)(0) & " · " & DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") & vbCrLf &
               "Page: " & CurrentPage & vbCrLf & If(ex?.ToString(), "(no details)")
    End Function

    Public Sub Log(ex As Exception)
        Try
            Directory.CreateDirectory(Store.Folder)
            File.AppendAllText(LogFile, Details(ex) & vbCrLf & New String("-"c, 60) & vbCrLf)
        Catch
        End Try
    End Sub

    Public Sub Show(ex As Exception)
        Log(ex)
        If _showing Then Return
        _showing = True
        Try
            Dim text = Details(ex)
            Using f As New Form With {.Text = "Sri Andal Staff", .Width = 560, .Height = 300, .StartPosition = FormStartPosition.CenterScreen, .FormBorderStyle = FormBorderStyle.FixedDialog, .MinimizeBox = False, .MaximizeBox = False, .BackColor = Theme.Page, .Font = Theme.Body, .Icon = Theme.AppIcon}
                Dim msg As New Label With {.Text = "Something went wrong: " & ex.Message & vbCrLf & vbCrLf & "Your data is safe. Press ""Copy details"" and send it to get this fixed.", .Dock = DockStyle.Top, .Height = 110, .Padding = New Padding(18, 18, 18, 0)}
                Dim row As New FlowLayoutPanel With {.Dock = DockStyle.Bottom, .Height = 56, .FlowDirection = FlowDirection.RightToLeft, .Padding = New Padding(12)}
                Dim ok = WButton.Make("OK", "", Theme.Primary)
                AddHandler ok.Click, Sub() f.Close()
                Dim copy = WButton.Make("Copy details", "", Theme.Primary, outline:=True)
                AddHandler copy.Click, Sub()
                                           Try
                                               Clipboard.SetText(text)
                                               copy.Text = "Copied"
                                           Catch
                                           End Try
                                       End Sub
                row.Controls.Add(ok) : row.Controls.Add(copy)
                f.Controls.Add(msg) : f.Controls.Add(row)
                f.ShowDialog()
            End Using
        Catch
        Finally
            _showing = False
        End Try
    End Sub
End Module
