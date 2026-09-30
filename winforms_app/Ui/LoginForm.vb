Imports System.Drawing
Imports System.Windows.Forms

''' <summary>The website's staff login card: username / mobile / email, password, Remember me.</summary>
Public Class LoginForm
    Inherits Form

    Private ReadOnly _id As WInput = WInput.Make("", Theme.IcUser)
    Private ReadOnly _pw As WInput = WInput.Make("", Theme.IcSettings)
    Private ReadOnly _remember As New CheckBox With {.Text = "Remember me", .Checked = True, .Font = Theme.Body, .ForeColor = Theme.G600, .AutoSize = True, .BackColor = Color.White}
    Private ReadOnly _error As New Label With {.ForeColor = Theme.Danger, .Font = Theme.Body, .AutoSize = False, .Height = 40, .Visible = False, .BackColor = Color.White}
    Private ReadOnly _go As WButton = WButton.Make("Log In", "", Theme.Magenta)
    Private ReadOnly _card As New Panel With {.BackColor = Color.White}

    Public Sub New()
        Text = "Sri Andal Staff — Log in"
        StartPosition = FormStartPosition.CenterScreen
        ClientSize = New Size(520, 560)
        FormBorderStyle = FormBorderStyle.FixedSingle
        MaximizeBox = False
        BackColor = Color.FromArgb(&HF2, &HF2, &HF7)
        Font = Theme.Body
        DoubleBuffered = True
        _pw.Box.UseSystemPasswordChar = True
        _pw.Glyph = ChrW(&HE72E)

        _card.SetBounds(81, 60, 358, 430)
        AddHandler _card.Paint, Sub(s, e)
                                    Using b As New SolidBrush(Theme.Magenta) : e.Graphics.FillRectangle(b, 0, 0, _card.Width, 3) : End Using
                                End Sub
        Controls.Add(_card)

        Dim biz = Js.Str(AppState.I.Settings, "businessName", "Sri Andal Traders")
        Dim title As New Label With {.Text = biz, .Font = Theme.UiFont(15.0F, FontStyle.Bold), .ForeColor = Theme.Magenta, .TextAlign = ContentAlignment.MiddleCenter, .BackColor = Color.White}
        title.SetBounds(0, 30, 358, 32)
        Dim l1 As New FieldLabel("Username, mobile or email")
        l1.Location = New Point(24, 88)
        _id.SetBounds(24, 112, 310, 40)
        Dim l2 As New FieldLabel("Password")
        l2.Location = New Point(24, 168)
        _pw.SetBounds(24, 192, 310, 40)
        _remember.Location = New Point(24, 246)
        _error.SetBounds(24, 276, 310, 40)
        _go.SetBounds(24, 330, 310, 44)
        _card.Controls.AddRange(New Control() {title, l1, _id, l2, _pw, _remember, _error, _go})

        Dim remembered = AppState.I.Remembered()
        If remembered.Item1 IsNot Nothing Then
            _id.Text = remembered.Item1
            _pw.Text = remembered.Item2
        ElseIf AppState.I.User IsNot Nothing Then
            _id.Text = Js.Str(AppState.I.User, "username")
        End If

        AddHandler _go.Click, Async Sub() Await SubmitAsync()
        AddHandler _pw.Box.KeyDown, Async Sub(s, e)
                                        If e.KeyCode = Keys.Enter Then e.SuppressKeyPress = True : Await SubmitAsync()
                                    End Sub
        AddHandler _id.Box.KeyDown, Sub(s, e)
                                        If e.KeyCode = Keys.Enter Then e.SuppressKeyPress = True : _pw.Box.Focus()
                                    End Sub
    End Sub

    Protected Overrides Sub OnShown(e As EventArgs)
        MyBase.OnShown(e)
        If _id.Text = "" Then _id.Box.Focus() Else _pw.Box.Focus()
    End Sub

    Private _busy As Boolean
    Private Async Function SubmitAsync() As Task
        If _busy Then Return
        If _id.Text.Trim() = "" OrElse _pw.Text = "" Then
            ShowError("Enter your username / mobile / email and password.")
            Return
        End If
        _busy = True
        _go.Text = "Logging in…" : _go.Enabled = False
        Dim err = Await AppState.I.LoginAsync(_id.Text, _pw.Text, _remember.Checked)
        _busy = False
        _go.Text = "Log In" : _go.Enabled = True
        If err Is Nothing Then
            DialogResult = DialogResult.OK
            Close()
        Else
            ShowError(err)
        End If
    End Function

    Private Sub ShowError(t As String)
        _error.Text = t
        _error.Visible = True
    End Sub
End Class
