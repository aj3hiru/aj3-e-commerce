Imports System.Drawing
Imports System.Drawing.Printing
Imports System.IO
Imports System.IO.Compression
Imports System.Security
Imports System.Text
Imports System.Windows.Forms

''' <summary>A real Excel file (.xlsx) with one or more sheets — written directly, no Excel needed.</summary>
Public Module Xlsx
    Public Class Sheet
        Public Name As String
        Public Head As List(Of String)
        Public Rows As New List(Of List(Of Object))
        Public Sub New(name As String, head As IEnumerable(Of String))
            Me.Name = name
            Me.Head = head.ToList()
        End Sub
        Public Sub Add(ParamArray cells As Object())
            Rows.Add(cells.ToList())
        End Sub
    End Class

    Private Function Col(i As Integer) As String
        Dim s = ""
        i += 1
        While i > 0
            Dim m = (i - 1) Mod 26
            s = ChrW(65 + m) & s
            i = (i - 1) \ 26
        End While
        Return s
    End Function

    Private Function Cell(ref As String, v As Object, bold As Boolean) As String
        If v Is Nothing Then Return ""
        If TypeOf v Is Double OrElse TypeOf v Is Integer OrElse TypeOf v Is Long OrElse TypeOf v Is Decimal OrElse TypeOf v Is Single Then
            Return "<c r=""" & ref & """" & If(bold, " s=""1""", "") & "><v>" & Convert.ToDouble(v).ToString(Globalization.CultureInfo.InvariantCulture) & "</v></c>"
        End If
        Dim s = v.ToString()
        If s = "" Then Return ""
        Return "<c r=""" & ref & """ t=""inlineStr""" & If(bold, " s=""1""", "") & "><is><t xml:space=""preserve"">" & SecurityElement.Escape(s) & "</t></is></c>"
    End Function

    Public Sub Save(path As String, sheets As IEnumerable(Of Sheet))
        Dim list = sheets.ToList()
        If File.Exists(path) Then File.Delete(path)
        Using zip = ZipFile.Open(path, ZipArchiveMode.Create)
            Dim put = Sub(name As String, text As String)
                          Dim e = zip.CreateEntry(name, CompressionLevel.Optimal)
                          Using w As New StreamWriter(e.Open(), New UTF8Encoding(False))
                              w.Write(text)
                          End Using
                      End Sub
            Dim ct As New StringBuilder("<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Types xmlns=""http://schemas.openxmlformats.org/package/2006/content-types""><Default Extension=""rels"" ContentType=""application/vnd.openxmlformats-package.relationships+xml""/><Default Extension=""xml"" ContentType=""application/xml""/><Override PartName=""/xl/workbook.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml""/><Override PartName=""/xl/styles.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml""/>")
            For k = 1 To list.Count
                ct.Append("<Override PartName=""/xl/worksheets/sheet" & k & ".xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml""/>")
            Next
            ct.Append("</Types>")
            put("[Content_Types].xml", ct.ToString())
            put("_rels/.rels", "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships""><Relationship Id=""rId1"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"" Target=""xl/workbook.xml""/></Relationships>")
            Dim wb As New StringBuilder("<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><workbook xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main"" xmlns:r=""http://schemas.openxmlformats.org/officeDocument/2006/relationships""><sheets>")
            Dim rels As New StringBuilder("<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships"">")
            Dim used As New HashSet(Of String)
            For k = 1 To list.Count
                Dim nm = New String(list(k - 1).Name.Where(Function(ch) Not "[]:*?/\".Contains(ch)).ToArray())
                If nm.Length > 31 Then nm = nm.Substring(0, 31)
                If nm = "" OrElse used.Contains(nm) Then nm = "Sheet" & k
                used.Add(nm)
                wb.Append("<sheet name=""" & SecurityElement.Escape(nm) & """ sheetId=""" & k & """ r:id=""rId" & k & """/>")
                rels.Append("<Relationship Id=""rId" & k & """ Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"" Target=""worksheets/sheet" & k & ".xml""/>")
            Next
            wb.Append("</sheets></workbook>")
            rels.Append("<Relationship Id=""rId" & (list.Count + 1) & """ Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"" Target=""styles.xml""/></Relationships>")
            put("xl/workbook.xml", wb.ToString())
            put("xl/_rels/workbook.xml.rels", rels.ToString())
            put("xl/styles.xml", "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><styleSheet xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main""><fonts count=""2""><font><sz val=""11""/><name val=""Calibri""/></font><font><b/><sz val=""11""/><name val=""Calibri""/></font></fonts><fills count=""2""><fill><patternFill patternType=""none""/></fill><fill><patternFill patternType=""gray125""/></fill></fills><borders count=""1""><border/></borders><cellStyleXfs count=""1""><xf/></cellStyleXfs><cellXfs count=""2""><xf fontId=""0""/><xf fontId=""1"" applyFont=""1""/></cellXfs></styleSheet>")
            For k = 1 To list.Count
                Dim sh = list(k - 1)
                Dim sb As New StringBuilder("<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><worksheet xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main""><sheetViews><sheetView workbookViewId=""0""><pane ySplit=""1"" topLeftCell=""A2"" activePane=""bottomLeft"" state=""frozen""/></sheetView></sheetViews><cols>")
                For c = 0 To sh.Head.Count - 1
                    Dim w = Math.Min(60, Math.Max(10, Math.Max(sh.Head(c).Length, sh.Rows.Take(200).Select(Function(r) If(c < r.Count AndAlso r(c) IsNot Nothing, r(c).ToString().Length, 0)).DefaultIfEmpty(0).Max()) + 2))
                    sb.Append("<col min=""" & (c + 1) & """ max=""" & (c + 1) & """ width=""" & w & """ customWidth=""1""/>")
                Next
                sb.Append("</cols><sheetData><row r=""1"">")
                For c = 0 To sh.Head.Count - 1 : sb.Append(Cell(Col(c) & "1", sh.Head(c), True)) : Next
                sb.Append("</row>")
                For r = 0 To sh.Rows.Count - 1
                    sb.Append("<row r=""" & (r + 2) & """>")
                    For c = 0 To sh.Rows(r).Count - 1 : sb.Append(Cell(Col(c) & (r + 2), sh.Rows(r)(c), False)) : Next
                    sb.Append("</row>")
                Next
                sb.Append("</sheetData></worksheet>")
                put("xl/worksheets/sheet" & k & ".xml", sb.ToString())
            Next
        End Using
    End Sub

    ''' <summary>Asks where to save, writes the sheets, tells the person.</summary>
    Public Sub SaveAs(owner As Control, fileBase As String, sheets As IEnumerable(Of Sheet))
        Using d As New SaveFileDialog With {.Filter = "Excel workbook|*.xlsx", .FileName = fileBase.Replace("/", "-").Replace(":", "-") & ".xlsx"}
            If d.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return
            Try
                Save(d.FileName, sheets)
                TryCast(owner?.FindForm(), MainForm)?.Toast("Saved " & Path.GetFileName(d.FileName))
            Catch ex As Exception
                MessageBox.Show(owner?.FindForm(), "Could not save the file: " & ex.Message, "Export", MessageBoxButtons.OK, MessageBoxIcon.Warning)
            End Try
        End Using
    End Sub
End Module

''' <summary>Prints (or saves as PDF with "Microsoft Print to PDF") a report: a title block and sections of
''' tables, across as many A4 pages as needed.</summary>
Public Module ReportPrint
    Public Class Section
        Public Heading As String
        Public Head As New List(Of String)
        Public Right As New HashSet(Of Integer)
        Public Rows As New List(Of String())
        Public Weights As New List(Of Single)
        Public Lines As New List(Of (String, String))
    End Class

    Public Sub Print(owner As Control, title As String, subtitle As String, headerLines As IEnumerable(Of String), sections As List(Of Section), Optional landscape As Boolean = False)
        Dim doc As New PrintDocument With {.DocumentName = title}
        doc.DefaultPageSettings.Landscape = landscape
        doc.DefaultPageSettings.Margins = New Margins(40, 40, 40, 40)
        Dim secIndex = 0, rowIndex = -1, pageNo = 0
        Dim hdr = headerLines.ToList()
        AddHandler doc.BeginPrint, Sub()
                                       secIndex = 0 : rowIndex = -1 : pageNo = 0
                                   End Sub
        AddHandler doc.PrintPage, Sub(s, e)
                                      pageNo += 1
                                      Dim g = e.Graphics
                                      Dim m = e.MarginBounds
                                      Dim y = CSng(m.Top)
                                      Using f As New Font("Segoe UI", 8), fb As New Font("Segoe UI", 8, FontStyle.Bold), fh As New Font("Segoe UI", 10.5F, FontStyle.Bold), ft As New Font("Segoe UI", 14, FontStyle.Bold)
                                          Dim lh = f.GetHeight(g) + 5
                                          If pageNo = 1 Then
                                              g.DrawString(title, ft, Brushes.Black, m.Left, y) : y += ft.GetHeight(g) + 2
                                              If subtitle <> "" Then g.DrawString(subtitle, f, Brushes.DimGray, m.Left, y) : y += lh
                                              For Each l In hdr
                                                  g.DrawString(l, f, Brushes.Black, New RectangleF(m.Left, y, m.Width, lh * 2)) : y += lh
                                              Next
                                              y += 6
                                          Else
                                              g.DrawString(title & " (continued)", fb, Brushes.DimGray, m.Left, y) : y += lh + 4
                                          End If
                                          While secIndex < sections.Count
                                              Dim sec = sections(secIndex)
                                              Dim n = Math.Max(1, sec.Head.Count)
                                              Dim ws = If(sec.Weights.Count = n, sec.Weights, Enumerable.Repeat(1.0F, n).ToList())
                                              Dim tot = ws.Sum()
                                              Dim xs As New List(Of Single)
                                              Dim cx = CSng(m.Left)
                                              For c = 0 To n - 1 : xs.Add(cx) : cx += m.Width * ws(c) / tot : Next
                                              xs.Add(m.Right)
                                              If rowIndex = -1 Then
                                                  If y + fh.GetHeight(g) + lh * 3 > m.Bottom Then e.HasMorePages = True : Return
                                                  y += 6
                                                  g.DrawString(sec.Heading, fh, New SolidBrush(Color.FromArgb(&H7C, &H3A, &HED)), m.Left, y) : y += fh.GetHeight(g) + 4
                                                  For Each kv In sec.Lines
                                                      g.DrawString(kv.Item1, f, Brushes.Black, m.Left, y)
                                                      g.DrawString(kv.Item2, fb, Brushes.Black, New RectangleF(m.Left, y, m.Width * 0.5F, lh), New StringFormat With {.Alignment = StringAlignment.Far})
                                                      y += lh
                                                  Next
                                                  rowIndex = 0
                                              End If
                                              If sec.Head.Count > 0 Then
                                                  ' heading row (repeated on each page)
                                                  g.FillRectangle(New SolidBrush(Color.FromArgb(&HF3, &HF4, &HF6)), m.Left, y, m.Width, lh)
                                                  For c = 0 To sec.Head.Count - 1
                                                      Dim fmt As New StringFormat With {.Alignment = If(sec.Right.Contains(c), StringAlignment.Far, StringAlignment.Near), .Trimming = StringTrimming.EllipsisCharacter, .FormatFlags = StringFormatFlags.NoWrap}
                                                      g.DrawString(sec.Head(c), fb, Brushes.Black, New RectangleF(xs(c) + 3, y + 2, xs(c + 1) - xs(c) - 6, lh), fmt)
                                                  Next
                                                  y += lh
                                                  While rowIndex < sec.Rows.Count
                                                      If y + lh > m.Bottom Then e.HasMorePages = True : Return
                                                      Dim row = sec.Rows(rowIndex)
                                                      For c = 0 To Math.Min(row.Length, sec.Head.Count) - 1
                                                          Dim fmt As New StringFormat With {.Alignment = If(sec.Right.Contains(c), StringAlignment.Far, StringAlignment.Near), .Trimming = StringTrimming.EllipsisCharacter, .FormatFlags = StringFormatFlags.NoWrap}
                                                          g.DrawString(If(row(c), ""), f, Brushes.Black, New RectangleF(xs(c) + 3, y + 2, xs(c + 1) - xs(c) - 6, lh), fmt)
                                                      Next
                                                      g.DrawLine(Pens.Gainsboro, m.Left, y + lh, m.Right, y + lh)
                                                      y += lh
                                                      rowIndex += 1
                                                  End While
                                                  If sec.Rows.Count = 0 Then g.DrawString("Nothing in this period.", f, Brushes.Gray, m.Left + 3, y + 2) : y += lh
                                              End If
                                              secIndex += 1
                                              rowIndex = -1
                                          End While
                                          g.DrawString("Page " & pageNo, f, Brushes.Gray, New RectangleF(m.Left, m.Bottom + 10, m.Width, lh), New StringFormat With {.Alignment = StringAlignment.Far})
                                      End Using
                                      e.HasMorePages = False
                                  End Sub
        Try
            Using d As New PrintPreviewDialog With {.Document = doc, .Width = 1000, .Height = 900, .UseAntiAlias = True}
                d.ShowDialog(owner?.FindForm())
            End Using
        Catch ex As Exception
            TryCast(owner?.FindForm(), MainForm)?.Toast("Printer not available: " & ex.Message, True)
        End Try
    End Sub
End Module
