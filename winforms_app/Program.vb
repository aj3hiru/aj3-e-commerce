Imports System.Windows.Forms

Public Module Program
    <STAThread>
    Public Sub Main()
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2)
        Application.EnableVisualStyles()
        Application.SetCompatibleTextRenderingDefault(False)
        AddHandler Application.ThreadException, Sub(s, e) MessageBox.Show("Something went wrong: " & e.Exception.Message & vbCrLf & "Your data is safe.", "Sri Andal Staff", MessageBoxButtons.OK, MessageBoxIcon.Warning)
        AppState.I.Init()
        Do
            If Not AppState.I.SignedIn Then
                Using login As New LoginForm()
                    If login.ShowDialog() <> DialogResult.OK Then Return
                End Using
            Else
                AppState.I.StartLoop()
            End If
            Dim main As New MainForm()
            Application.Run(main)
            If Not main.LoggedOut Then Return
        Loop
    End Sub
End Module
