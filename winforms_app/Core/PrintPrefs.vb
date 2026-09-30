Imports System.Drawing.Printing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>This computer's printing choices (My Profile → This computer → Printing).</summary>
Public Module PrintPrefs
    Private Function Box() As JsonObject
        Return If(TryCast(Store.Read("print_prefs"), JsonObject), New JsonObject())
    End Function

    ''' <summary>"thermal_80", "thermal_58", "a4" or "ask".</summary>
    Public Function Paper() As String
        Dim p = Js.Str(Box(), "paper")
        If p <> "" Then Return p
        Dim mode = Js.Str(AppState.I.Settings, "posPrintMode", "both")
        Return If(mode = "a4", "a4", If(mode = "both", "ask", Js.Str(AppState.I.Settings, "printerFormat", "thermal_80")))
    End Function

    Public Function AutoPrint() As Boolean
        Dim b = Box()
        Return Not b.ContainsKey("autoPrint") OrElse Js.Bool(b, "autoPrint")
    End Function

    Public Function Printer() As String
        Return Js.Str(Box(), "printer")
    End Function

    Public Function LabelPrinter() As String
        Return Js.Str(Box(), "labelPrinter")
    End Function

    Public Sub Save(paper As String, autoPrint As Boolean, printer As String, labelPrinter As String)
        Store.Write("print_prefs", Js.Obj("paper", paper, "autoPrint", autoPrint, "printer", printer, "labelPrinter", labelPrinter))
    End Sub

    ''' <summary>The printing settings window.</summary>
    Public Sub Edit(owner As Control)
        Dim printers = PrinterSettings.InstalledPrinters.Cast(Of String)().ToList()
        Dim f As New FormDialog("Printing", 520)
        f.AddPick("paper", "Bill paper", {"ask|Ask each time", "thermal_80|Thermal 80 mm", "thermal_58|Thermal 58 mm", "a4|A4 invoice"}, Paper())
        f.AddPick("printer", "Bill printer", {"|Windows default printer"}.Concat(printers.Select(Function(p) p & "|" & p)), Printer())
        f.AddPick("labelPrinter", "Barcode label printer", {"|Ask each time"}.Concat(printers.Select(Function(p) p & "|" & p)), LabelPrinter())
        f.AddCheck("auto", "Print the receipt automatically after each bill", AutoPrint())
        If f.ShowDialog(owner?.FindForm()) = DialogResult.OK Then
            Save(f.Val("paper"), f.Bool("auto"), f.Val("printer"), f.Val("labelPrinter"))
            TryCast(owner?.FindForm(), MainForm)?.Toast("Printing settings saved.")
        End If
    End Sub

    ''' <summary>Paper for one print: the saved choice, or asks (with an optional preview).</summary>
    Public Function Choose(owner As Control, title As String, ByRef preview As Boolean) As String
        Dim size = Paper()
        If size <> "ask" AndAlso Not preview Then Return size
        If size = "ask" Then size = Js.Str(AppState.I.Settings, "printerFormat", "thermal_80")
        Dim f As New FormDialog(title, 420, "Print")
        f.AddPick("size", "Paper", {"thermal_80|Thermal 80 mm", "thermal_58|Thermal 58 mm", "a4|A4 invoice"}, size)
        f.AddCheck("preview", "Show a preview first", preview)
        If f.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return Nothing
        preview = f.Bool("preview")
        Return f.Val("size")
    End Function
End Module
