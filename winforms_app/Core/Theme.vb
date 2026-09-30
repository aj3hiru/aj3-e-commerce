Imports System.Drawing
Imports System.Drawing.Drawing2D
Imports System.Drawing.Text
Imports System.Globalization
Imports System.Windows.Forms

''' <summary>The website's admin colours, fonts and small drawing helpers.</summary>
Public Module Theme
    ' admin theme (same hexes as the website / tailwind config)
    Public ReadOnly Primary As Color = Color.FromArgb(&H7C, &H3A, &HED)
    Public ReadOnly PrimaryDark As Color = Color.FromArgb(&H6D, &H28, &HD9)
    Public ReadOnly PrimarySoft As Color = Color.FromArgb(&HF5, &HF3, &HFF)
    Public ReadOnly PrimaryLight As Color = Color.FromArgb(&HED, &HE9, &HFE)
    Public ReadOnly Magenta As Color = Color.FromArgb(&HA2, &H1C, &H87)
    Public ReadOnly G50 As Color = Color.FromArgb(&HF9, &HFA, &HFB)
    Public ReadOnly G100 As Color = Color.FromArgb(&HF3, &HF4, &HF6)
    Public ReadOnly G200 As Color = Color.FromArgb(&HE5, &HE7, &HEB)
    Public ReadOnly G300 As Color = Color.FromArgb(&HD1, &HD5, &HDB)
    Public ReadOnly G400 As Color = Color.FromArgb(&H9C, &HA3, &HAF)
    Public ReadOnly G500 As Color = Color.FromArgb(&H6B, &H72, &H80)
    Public ReadOnly G600 As Color = Color.FromArgb(&H4B, &H55, &H63)
    Public ReadOnly G700 As Color = Color.FromArgb(&H37, &H41, &H51)
    Public ReadOnly G800 As Color = Color.FromArgb(&H1F, &H29, &H37)
    Public ReadOnly G900 As Color = Color.FromArgb(&H11, &H18, &H27)
    Public ReadOnly Green As Color = Color.FromArgb(&H1C, &HC8, &H8A)
    Public ReadOnly Red As Color = Color.FromArgb(&HE7, &H4A, &H5B)
    Public ReadOnly Yellow As Color = Color.FromArgb(&HF6, &HC2, &H3E)
    Public ReadOnly Cyan As Color = Color.FromArgb(&H36, &HB9, &HCC)
    Public ReadOnly Grey As Color = Color.FromArgb(&H85, &H87, &H96)
    Public ReadOnly Blue As Color = Color.FromArgb(&H25, &H63, &HEB)
    Public ReadOnly Coral As Color = Color.FromArgb(&HEE, &H6A, &H4D)
    Public ReadOnly CoralLight As Color = Color.FromArgb(&HF0, &H7E, &H62)
    Public ReadOnly CoralBorder As Color = Color.FromArgb(&HF3, &HB6, &HA6)
    Public ReadOnly Danger As Color = Color.FromArgb(&HDC, &H26, &H26)
    Public ReadOnly Page As Color = Color.FromArgb(&HF9, &HFA, &HFB)

    ' Inter — the website's font (fonts\Inter-*.ttf, SIL Open Font License, built into the .exe). Loaded for
    ' both GDI+ (Font objects) and GDI (TextRenderer); falls back to Segoe UI if that ever fails.
    Private _fonts As PrivateFontCollection
    Private ReadOnly _fontMem As New List(Of IntPtr)
    Private _fontsTried As Boolean

    <Runtime.InteropServices.DllImport("gdi32.dll")>
    Private Function AddFontMemResourceEx(pbFont As IntPtr, cbFont As UInteger, pdv As IntPtr, ByRef pcFonts As UInteger) As IntPtr
    End Function

    Private Sub LoadFonts()
        If _fontsTried Then Return
        _fontsTried = True
        Try
            Dim asm = Reflection.Assembly.GetExecutingAssembly()
            Dim pfc As New PrivateFontCollection()
            For Each name In asm.GetManifestResourceNames().Where(Function(n) n.EndsWith(".ttf", StringComparison.OrdinalIgnoreCase))
                Using st = asm.GetManifestResourceStream(name), ms As New IO.MemoryStream()
                    st.CopyTo(ms)
                    Dim data = ms.ToArray()
                    Dim ptr = Runtime.InteropServices.Marshal.AllocCoTaskMem(data.Length)
                    Runtime.InteropServices.Marshal.Copy(data, 0, ptr, data.Length)
                    pfc.AddMemoryFont(ptr, data.Length)
                    Dim n As UInteger = 0
                    AddFontMemResourceEx(ptr, CUInt(data.Length), IntPtr.Zero, n)
                    _fontMem.Add(ptr)
                End Using
            Next
            If pfc.Families.Length > 0 Then _fonts = pfc
        Catch
            _fonts = Nothing
        End Try
    End Sub

    Private Function Family(weight As Integer) As FontFamily
        LoadFonts()
        If _fonts Is Nothing Then Return Nothing
        Dim want = If(weight >= 800, "Inter ExtraBold", If(weight >= 700, "Inter", If(weight >= 600, "Inter SemiBold", If(weight >= 500, "Inter Medium", "Inter"))))
        Return _fonts.Families.FirstOrDefault(Function(f) f.Name = want)
    End Function

    ''' <summary>Inter at <paramref name="size"/> points (Bold = weight 700).</summary>
    Public Function UiFont(size As Single, Optional style As FontStyle = FontStyle.Regular) As Font
        Return Px(size / 0.75F, If(style.HasFlag(FontStyle.Bold), 700, 400), style And Not FontStyle.Bold)
    End Function

    ''' <summary>Inter the way the website writes it: <paramref name="px"/> CSS pixels and a CSS font-weight
    ''' (400 regular, 500 medium, 600 semibold, 700 bold, 800 extrabold).</summary>
    Public Function Px(size As Single, Optional weight As Integer = 400, Optional extra As FontStyle = FontStyle.Regular) As Font
        Dim fam = Family(weight)
        Dim style = extra Or If(weight >= 700 AndAlso weight < 800, FontStyle.Bold, FontStyle.Regular)
        If fam Is Nothing Then Return New Font("Segoe UI", size * 0.75F, If(weight >= 600, FontStyle.Bold, FontStyle.Regular) Or extra, GraphicsUnit.Point)
        If Not fam.IsStyleAvailable(style) Then style = If(fam.IsStyleAvailable(FontStyle.Regular), FontStyle.Regular, FontStyle.Bold)
        Return New Font(fam, size * 0.75F, style, GraphicsUnit.Point)
    End Function

    Public ReadOnly Body As Font = UiFont(9.75F)
    Public ReadOnly BodyBold As Font = UiFont(9.75F, FontStyle.Bold)
    Public ReadOnly Small As Font = UiFont(8.5F)
    Public ReadOnly Title As Font = UiFont(15.0F, FontStyle.Bold)
    Public ReadOnly CardTitle As Font = UiFont(11.0F, FontStyle.Bold)
    Public ReadOnly Big As Font = UiFont(15.0F, FontStyle.Bold)

    ' Windows' own icon font (Segoe Fluent Icons on Windows 11, Segoe MDL2 Assets on Windows 10).
    Private _iconFamily As String = Nothing
    Public Function IconFont(size As Single) As Font
        If _iconFamily Is Nothing Then
            _iconFamily = "Segoe MDL2 Assets"
            Using fonts As New InstalledFontCollection()
                For Each f In fonts.Families
                    If f.Name = "Segoe Fluent Icons" Then _iconFamily = f.Name : Exit For
                Next
            End Using
        End If
        Return New Font(_iconFamily, size, FontStyle.Regular, GraphicsUnit.Point)
    End Function

    ' Icon glyphs (MDL2 / Fluent code points).
    Public Const IcHome As String = ChrW(&HE80F)
    Public Const IcShop As String = ChrW(&HE719)
    Public Const IcCart As String = ChrW(&HE7BF)
    Public Const IcAdd As String = ChrW(&HE710)
    Public Const IcPackage As String = ChrW(&HE7B8)
    Public Const IcSync As String = ChrW(&HE895)
    Public Const IcCloud As String = ChrW(&HE753)
    Public Const IcOffline As String = ChrW(&HF384)
    Public Const IcUser As String = ChrW(&HE77B)
    Public Const IcPeople As String = ChrW(&HE716)
    Public Const IcSignOut As String = ChrW(&HF3B1)
    Public Const IcSearch As String = ChrW(&HE721)
    Public Const IcDelete As String = ChrW(&HE74D)
    Public Const IcPrint As String = ChrW(&HE749)
    Public Const IcPhoto As String = ChrW(&HEB9F)
    Public Const IcCheck As String = ChrW(&HE73E)
    Public Const IcCancel As String = ChrW(&HE711)
    Public Const IcClock As String = ChrW(&HE823)
    Public Const IcTag As String = ChrW(&HE8EC)
    Public Const IcGlobe As String = ChrW(&HE774)
    Public Const IcMoney As String = ChrW(&HE8C7)
    Public Const IcCalendar As String = ChrW(&HE787)
    Public Const IcChart As String = ChrW(&HE9D2)
    Public Const IcList As String = ChrW(&HE8FD)
    Public Const IcGrid As String = ChrW(&HF0E2)
    Public Const IcTicket As String = ChrW(&HE8C1)
    Public Const IcSettings As String = ChrW(&HE713)
    Public Const IcBarcode As String = ChrW(&HEE6F)
    Public Const IcInfo As String = ChrW(&HE946)
    Public Const IcCard As String = ChrW(&HE8C7)
    Public Const IcPhone As String = ChrW(&HE717)
    Public Const IcHourglass As String = ChrW(&HE916)
    Public Const IcDone As String = ChrW(&HE930)
    Public Const IcBlock As String = ChrW(&HE733)
    Public Const IcAddUser As String = ChrW(&HE8FA)
    Public Const IcTruck As String = ChrW(&HE806)
    Public Const IcOptions As String = ChrW(&HE9E9)
    Public Const IcSave As String = ChrW(&HE74E)
    Public Const IcChevronDown As String = ChrW(&HE70D)
    Public Const IcRefresh As String = ChrW(&HE72C)

    Public ReadOnly India As CultureInfo = CultureInfo.GetCultureInfo("en-IN")

    ''' <summary>₹1,23,456.00 (Indian grouping, as on the website).</summary>
    Public Function Money(v As Double) As String
        Return ChrW(&H20B9) & v.ToString("N2", India)
    End Function

    ''' <summary>Corner radius of every box, button, input, card and menu (owner's choice: 5).</summary>
    Public Const Radius As Single = 5

    ''' <summary>A rounded box. Every corner is <see cref="Radius"/>; only pills and circles (radius = half the
    ''' height or more) stay fully round.</summary>
    Public Function RoundRect(r As RectangleF, radius As Single) As GraphicsPath
        If radius > 0 AndAlso radius < Math.Min(r.Width, r.Height) / 2 - 0.5F Then radius = Theme.Radius
        Dim p As New GraphicsPath()
        Dim d = Math.Min(radius * 2, Math.Min(r.Width, r.Height))
        If d <= 0 Then p.AddRectangle(r) : Return p
        p.AddArc(r.X, r.Y, d, d, 180, 90)
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90)
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90)
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90)
        p.CloseFigure()
        Return p
    End Function

    Public Sub Smooth(g As Graphics)
        g.SmoothingMode = SmoothingMode.AntiAlias
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit
        g.PixelOffsetMode = PixelOffsetMode.HighQuality
    End Sub

    ''' <summary>Soft tint of a colour (icon backgrounds): colour at [alpha] over white.</summary>
    Public Function Tint(c As Color, Optional alpha As Integer = 26) As Color
        Return Color.FromArgb(255, 255 - (255 - c.R) * alpha \ 255, 255 - (255 - c.G) * alpha \ 255, 255 - (255 - c.B) * alpha \ 255)
    End Function

    Public Function Darker(c As Color, Optional f As Double = 0.9) As Color
        Return Color.FromArgb(c.A, CInt(c.R * f), CInt(c.G * f), CInt(c.B * f))
    End Function

    Public Sub DrawCentered(g As Graphics, text As String, f As Font, c As Color, r As Rectangle)
        Tr.DrawText(g, text, f, r, c, TextFormatFlags.HorizontalCenter Or TextFormatFlags.VerticalCenter Or TextFormatFlags.NoPadding)
    End Sub
    Private _appIcon As Icon
    ''' <summary>The software's icon (from the .exe) for every window's title bar and the taskbar.</summary>
    Public ReadOnly Property AppIcon As Icon
        Get
            If _appIcon Is Nothing Then
                Try
                    _appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath)
                Catch
                End Try
            End If
            Return _appIcon
        End Get
    End Property
End Module
