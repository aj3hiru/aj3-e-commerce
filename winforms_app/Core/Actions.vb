Imports System.Drawing
Imports System.Drawing.Printing
Imports System.IO
Imports System.Text
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Order actions usable from any page (lists, detail, deliveries): they show at once and are sent
''' when possible — offline too. Same rules as the website's status menu.</summary>
Public Module OrderActions
    Private ReadOnly Property P As Perms
        Get
            Return AppState.I.Perm
        End Get
    End Property

    ''' <summary>A change to an order: shows at once, then reaches the server.</summary>
    Public Sub Act(o As JsonObject, label As String, body As JsonObject, fields As JsonObject, Optional delivery As Boolean = False, Optional owner As Control = Nothing)
        AppState.I.Enqueue(New OutboxItem With {
            .Method = If(delivery, "POST", "PATCH"),
            .Path = If(delivery, "/api/ecommerce/deliveries/" & Js.Int(o, "id"), "/api/ecommerce/orders/" & Js.Int(o, "id") & "/status"),
            .Body = body, .Label = label,
            .Effect = New JsonObject From {{"kind", "order"}, {"id", Js.Int(o, "id")}, {"fields", fields}},
            .Refresh = New List(Of String) From {"orders", "deliveries"}})
        Dim mf = TryCast(owner?.FindForm(), MainForm)
        mf?.Toast(label & " ✓")
    End Sub

    ''' <summary>Asks why (with quick choices). Nothing when cancelled.</summary>
    Public Function AskReason(owner As Control, title As String, presets As String()) As String
        Dim f As New FormDialog(title, 480, "Confirm")
        f.SaveButton.Fill = Theme.Danger
        Dim row As New HRow(6)
        Dim box As WInput = Nothing
        For Each p_ In presets
            Dim b = WButton.Make(p_, "", Theme.Primary, outline:=True)
            b.Height = 30
            Dim t = p_
            AddHandler b.Click, Sub() box.Text = t
            row.Controls.Add(b)
        Next
        f.AddControl(row)
        box = f.AddMulti("reason", "Reason", "", 70)
        f.Validator = Function(d) If(d.Val("reason").Trim().Length < 3, "Write a short reason (or pick one).", Nothing)
        If f.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return Nothing
        Return f.Val("reason").Trim()
    End Function

    Public Sub Accept(o As JsonObject, Optional owner As Control = Nothing)
        Act(o, "Accept " & Js.Str(o, "number"), Js.Obj("action", "update_status", "orderStatus", "In Progress"), Js.Obj("status", "In Progress"), owner:=owner)
    End Sub

    Public Sub Reject(o As JsonObject, owner As Control)
        Dim r = AskReason(owner, "Reject " & Js.Str(o, "number") & "?", {"Out of stock", "Address not serviceable", "Customer not reachable", "Duplicate order"})
        If r Is Nothing Then Return
        Act(o, "Reject " & Js.Str(o, "number"), Js.Obj("action", "update_status", "orderStatus", "Canceled", "note", r), Js.Obj("status", "Canceled", "cancelReason", r), owner:=owner)
    End Sub

    ''' <summary>Hand an online order to a delivery agent (marks it Out for Delivery).</summary>
    Public Sub Assign(o As JsonObject, agent As JsonObject, Optional owner As Control = Nothing)
        Dim id = Js.Int(agent, "id")
        Act(o, "Assign " & Js.Str(o, "number") & " to " & Js.Str(agent, "name"), Js.Obj("action", "assign", "agentId", id),
            Js.Obj("agentId", id, "status", "Out for Delivery", "assignedAt", DateTime.UtcNow), owner:=owner)
    End Sub

    Public Sub Unassign(o As JsonObject, Optional owner As Control = Nothing)
        Dim f = New JsonObject From {{"agentId", Nothing}}
        If Js.Str(o, "status") = "Out for Delivery" Then f("status") = "In Progress"
        Act(o, Js.Str(o, "number") & ": agent removed", New JsonObject From {{"action", "assign"}, {"agentId", Nothing}}, f, owner:=owner)
    End Sub

    ''' <summary>Cash / UPI / Card / Other. Nothing when cancelled.</summary>
    Public Function PickMethod(owner As Control, title As String) As String
        Dim f As New FormDialog(title, 400, "OK")
        f.AddPick("m", "Payment method", {"Cash|Cash", "UPI|UPI", "Card|Card", "Other|Other"}, "Cash")
        If f.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return Nothing
        Return f.Val("m")
    End Function

    Public Sub MarkPaid(o As JsonObject, owner As Control)
        Dim m = PickMethod(owner, "Received " & Theme.Money(Js.Num(o, "total")) & " by")
        If m Is Nothing Then Return
        Act(o, "Paid " & Js.Str(o, "number"), Js.Obj("action", "update_payment", "paymentStatus", "Paid", "method", m), Js.Obj("paymentStatus", "Paid", "paymentMethod", m, "due", 0), owner:=owner)
    End Sub

    ''' <summary>Status choices this person may pick (as on the website's status menu), current first.</summary>
    Public Function StatusChoices(o As JsonObject) As List(Of String)
        Dim st = Js.Str(o, "status")
        Dim l As New List(Of String) From {st}
        If Js.Str(o, "type") <> "online" Then Return l
        If st = "Pending" AndAlso (P.Has("orders", "accept_reject") OrElse P.Has("orders", "update_status")) Then l.Add("In Progress")
        If (st = "In Progress" OrElse st = "Out for Delivery") AndAlso P.Has("orders", "update_status") Then l.Add("Delivered")
        If st <> "Delivered" AndAlso st <> "Canceled" AndAlso (P.Has("orders", "cancel") OrElse (st = "Pending" AndAlso P.Has("orders", "accept_reject"))) Then l.Add("Canceled")
        Return l
    End Function

    Public Sub SetStatus(o As JsonObject, [to] As String, owner As Control)
        Select Case [to]
            Case "In Progress" : Accept(o, owner)
            Case "Canceled"
                Dim r = AskReason(owner, "Cancel " & Js.Str(o, "number") & "?", {"Customer cancelled", "Out of stock", "Address not serviceable", "Payment issue"})
                If r IsNot Nothing Then Act(o, "Cancel " & Js.Str(o, "number"), Js.Obj("action", "update_status", "orderStatus", "Canceled", "note", r), Js.Obj("status", "Canceled", "cancelReason", r), owner:=owner)
            Case "Delivered"
                If Ui.Confirm(owner, "Mark " & Js.Str(o, "number") & " as delivered to " & Js.Str(o, "customer") & "?", "Delivered?") Then
                    Act(o, "Delivered " & Js.Str(o, "number"), Js.Obj("action", "update_status", "orderStatus", "Delivered"), Js.Obj("status", "Delivered", "deliveredAt", DateTime.UtcNow), owner:=owner)
                End If
        End Select
    End Sub

    ''' <summary>Status pill menu at a screen point (only the allowed next states).</summary>
    Public Sub StatusMenu(o As JsonObject, at As Point, owner As Control)
        If Js.Str(o, "localRef") <> "" Then Return
        Dim choices = StatusChoices(o).Skip(1).ToList()
        If choices.Count = 0 Then Return
        Ui.PopMenu(owner, choices.Select(Function(c) If(c = "Canceled", "!", "") & c & "|" & c), Sub(k) SetStatus(o, k, owner), at)
    End Sub

    Public Sub PaymentMenu(o As JsonObject, at As Point, owner As Control)
        If Js.Str(o, "paymentStatus") = "Paid" OrElse Js.Str(o, "status") = "Canceled" OrElse Not P.Has("orders", "mark_paid") OrElse Js.Str(o, "localRef") <> "" Then Return
        Ui.PopMenu(owner, {"paid|Mark as Paid…"}, Sub(k) MarkPaid(o, owner), at)
    End Sub

    Public Function AgentName(id As Integer) As String
        Dim a = AppState.I.List("agents").FirstOrDefault(Function(x) Js.Int(x, "id") = id)
        Return If(a Is Nothing, If(id = 0, "", "Agent"), Js.Str(a, "name"))
    End Function

    Public Sub AgentMenu(o As JsonObject, at As Point, owner As Control)
        Dim st = Js.Str(o, "status")
        If st = "Delivered" OrElse st = "Canceled" OrElse Js.Str(o, "type") <> "online" OrElse Not P.Has("orders", "assign_delivery") Then Return
        Dim agents = AppState.I.List("agents")
        Dim items As New List(Of String)
        For Each a In agents
            items.Add(If(Js.Int(a, "id") = Js.Int(o, "agentId"), "*", "") & Js.Int(a, "id") & "|" & Js.Str(a, "name"))
        Next
        If Not Js.IsNull(o, "agentId") Then items.Add("-") : items.Add("!0|Remove agent")
        Ui.PopMenu(owner, items, Sub(k)
                                     Dim id = CInt(k)
                                     If id = Js.Int(o, "agentId") Then Return
                                     If id = 0 Then Unassign(o, owner) Else Assign(o, agents.First(Function(a) Js.Int(a, "id") = id), owner)
                                 End Sub, at)
    End Sub

    ''' <summary>What is still owed on an order.</summary>
    Public Function DueOf(o As JsonObject) As Double
        Dim d = Js.Num(o, "due")
        If d > 0.004 Then Return d
        If Js.Str(o, "paymentStatus") <> "Paid" AndAlso Js.Str(o, "status") <> "Canceled" Then Return Js.Num(o, "total")
        Return 0
    End Function

    ''' <summary>The payment pill: Paid ↔ Unpaid (as the website's pill, the server keeps its rules).</summary>
    Public Sub SetPayment(o As JsonObject, status As String, Optional owner As Control = Nothing)
        Dim f = Js.Obj("paymentStatus", status)
        If status = "Paid" Then f("due") = 0 : f("paid") = Js.Num(o, "total")
        Act(o, Js.Str(o, "number") & " marked " & status, Js.Obj("action", "update_payment", "paymentStatus", status), f, owner:=owner)
    End Sub

    ''' <summary>The status pill: any status (the server refuses what this person may not do).</summary>
    Public Sub SetStatusAny(o As JsonObject, status As String, Optional owner As Control = Nothing)
        If status = "Canceled" Then RejectWithReason(o, owner, "Cancel") : Return
        Dim f = Js.Obj("status", status)
        If status = "Delivered" Then f("deliveredAt") = DateTime.UtcNow.ToString("o")
        Act(o, Js.Str(o, "number") & " is now " & status, Js.Obj("action", "update_status", "orderStatus", status), f, owner:=owner)
    End Sub

    Public ReadOnly RejectReasons As String() = {"Out of stock", "Can't deliver to this area", "Customer asked to cancel", "Duplicate order", "Suspicious / fake order"}

    ''' <summary>The website's Reject box: "Why reject …?", the reasons (or Other + text), then Reject order.</summary>
    Public Sub RejectWithReason(o As JsonObject, owner As Control, Optional verb As String = "Reject")
        Dim f As New FormDialog("Why " & verb.ToLowerInvariant() & " " & Js.Str(o, "number") & "?", 380, verb & " order")
        f.SaveButton.Fill = Color.FromArgb(&HDC, &H26, &H26)
        f.AddPick("reason", "Reason", RejectReasons.Concat({"Other"}).Select(Function(r) r & "|" & r), RejectReasons(0))
        Dim other = f.AddText("other", "Type the reason", "")
        f.ShowField("other", False)
        AddHandler CType(f.Input("reason"), ComboBox).SelectedIndexChanged, Sub()
                                                                               f.ShowField("other", f.Val("reason") = "Other")
                                                                               f.Relayout()
                                                                           End Sub
        f.Validator = Function(d) If(d.Val("reason") = "Other" AndAlso d.Val("other").Trim() = "", "Type the reason.", Nothing)
        If f.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return
        Dim why = If(f.Val("reason") = "Other", f.Val("other").Trim(), f.Val("reason"))
        Act(o, Js.Str(o, "number") & " " & If(verb = "Reject", "rejected", "canceled"), Js.Obj("action", "update_status", "orderStatus", "Canceled", "note", why), Js.Obj("status", "Canceled", "cancelReason", why), owner:=owner)
    End Sub

    ''' <summary>The payment method as the website shows it: a shop order's key ("cod") becomes its name.</summary>
    Public Function MethodLabel(m As String) As String
        If m = "" Then Return "—"
        Dim names = TryCast(Js.Field(AppState.I.Settings, "paymentNames"), JsonObject)
        Dim n = Js.Str(names, m)
        If n <> "" Then Return n
        If m.ToLowerInvariant() = "cod" Then Return "Cash On Delivery"
        Return m
    End Function

    ''' <summary>Print an order's bill on the paper chosen in Business Settings (thermal 58 / 80 mm or A4).</summary>
    Public Sub PrintOrder(o As JsonObject, owner As Control, Optional preview As Boolean = False)
        Dim size = PrintPrefs.Choose(owner, "Print " & Js.Str(o, "number", "bill"), preview)
        If size Is Nothing Then Return
        Receipts.Print(Receipts.FromOrder(o), size, owner, preview)
    End Sub
End Module

Public Class ReceiptData
    Public Number As String
    Public At As DateTime
    Public Customer As String
    Public Phone As String
    Public Lines As New List(Of (Name As String, Qty As Double, Price As Double, Unit As String))
    Public Subtotal, Discount, Gst, Total, Due As Double
    Public Payments As New List(Of (Method As String, Amount As Double))
    Public Offline As Boolean
End Class

''' <summary>The shop's bill on thermal 58 / 80 mm paper or A4 (Windows printing, works offline).</summary>
Public Module Receipts
    Public Function FromOrder(o As JsonObject) As ReceiptData
        Dim r As New ReceiptData With {
            .Number = If(Js.Str(o, "localRef") <> "", "Offline", Js.Str(o, "number")), .At = If(Js.Time(o, "createdAt"), DateTime.Now), .Customer = Js.Str(o, "customer"), .Phone = Js.Str(o, "phone"),
            .Subtotal = Js.Num(o, "subtotal"), .Discount = Js.Num(o, "discount"), .Gst = Js.Num(o, "gst"), .Total = Js.Num(o, "total"), .Due = Js.Num(o, "due"), .Offline = Js.Str(o, "localRef") <> ""}
        For Each it In Js.Objs(Js.Arr(o, "items"))
            r.Lines.Add((Js.Str(it, "name"), Js.Num(it, "qty"), Js.Num(it, "price"), Js.Str(it, "unit")))
        Next
        If r.Subtotal = 0 Then r.Subtotal = r.Lines.Sum(Function(l) l.Qty * l.Price)
        Dim pays = Js.Objs(Js.Arr(o, "pays"))
        If pays.Count > 0 Then
            For Each p In pays : r.Payments.Add((Js.Str(p, "method"), Js.Num(p, "amount"))) : Next
        Else
            r.Payments.Add((Js.Str(o, "paymentMethod"), r.Total - r.Due))
        End If
        Return r
    End Function

    Public Sub Print(r As ReceiptData, size As String, owner As Control, Optional preview As Boolean = False)
        Dim shop = AppState.I.Settings
        Dim doc As New PrintDocument With {.DocumentName = "Bill " & r.Number}
        If PrintPrefs.Printer() <> "" Then doc.PrinterSettings.PrinterName = PrintPrefs.Printer()
        Dim a4 = size = "a4"
        Dim widthIn = If(size = "thermal_58", 2.28, 3.15)
        If Not a4 Then
            doc.DefaultPageSettings.PaperSize = New PaperSize("Receipt", CInt(widthIn * 100), 3000)
            doc.DefaultPageSettings.Margins = New Margins(8, 8, 8, 8)
        Else
            doc.DefaultPageSettings.Margins = New Margins(50, 50, 50, 50)
        End If
        Dim fs = If(a4, 10.0F, If(size = "thermal_58", 7.2F, 8.0F))
        AddHandler doc.PrintPage, Sub(s, e)
                                      Dim g = e.Graphics
                                      Dim w = CSng(e.MarginBounds.Width), x = CSng(e.MarginBounds.Left)
                                      Dim y = CSng(e.MarginBounds.Top)
                                      Dim center As New StringFormat With {.Alignment = StringAlignment.Center}
                                      Dim right As New StringFormat With {.Alignment = StringAlignment.Far}
                                      Using f As New Font("Segoe UI", fs), fb As New Font("Segoe UI", fs, FontStyle.Bold), fbig As New Font("Segoe UI", fs * 1.45F, FontStyle.Bold)
                                          Dim lh = f.GetHeight(g) + 1
                                          Dim line = Sub(t As String, font As Font, fmt As StringFormat)
                                                         Dim sz = g.MeasureString(t, font, CInt(w))
                                                         g.DrawString(t, font, Brushes.Black, New RectangleF(x, y, w, sz.Height + 2), fmt)
                                                         y += sz.Height
                                                     End Sub
                                          Dim row = Sub(l As String, v As String, bold As Boolean)
                                                        Dim font = If(bold, fb, f)
                                                        g.DrawString(l, font, Brushes.Black, New RectangleF(x, y, w * 0.62F, lh * 2))
                                                        g.DrawString(v, font, Brushes.Black, New RectangleF(x, y, w, lh), right)
                                                        y += lh
                                                    End Sub
                                          Dim dash = Sub()
                                                         y += 2
                                                         Using pen As New Pen(Color.Black, 0.6F) With {.DashStyle = Drawing2D.DashStyle.Dash}
                                                             g.DrawLine(pen, x, y, x + w, y)
                                                         End Using
                                                         y += 4
                                                     End Sub
                                          line(Js.Str(shop, "businessName", "Sri Andal Traders"), fbig, center)
                                          Dim addr = Js.Str(shop, "address")
                                          If addr <> "" Then line(addr, f, center)
                                          Dim phones = Js.Arr(shop, "phones").Select(Function(p) Js.Text(p)).Where(Function(p) p <> "").ToList()
                                          If phones.Count > 0 Then line("Mob: " & String.Join(", ", phones), f, center)
                                          Dim gstin = Js.Str(shop, "gstin")
                                          If gstin <> "" Then line("GSTIN: " & gstin, f, center)
                                          y += 3
                                          line(If(a4, "TAX INVOICE", "BILL"), fb, center)
                                          dash()
                                          row("Bill no.", r.Number, False)
                                          row("Date", r.At.ToString("dd MMM yyyy, hh:mm tt"), False)
                                          row("Customer", If(r.Customer = "", "Walk-in Customer", r.Customer), False)
                                          If Not String.IsNullOrEmpty(r.Phone) Then row("Mobile", r.Phone, False)
                                          dash()
                                          For Each l In r.Lines
                                              line(l.Name & If(String.IsNullOrEmpty(l.Unit), "", " (" & l.Unit & ")"), f, StringFormat.GenericDefault)
                                              row("   " & Fmt.Num(l.Qty) & " × " & Theme.Money(l.Price), Theme.Money(l.Qty * l.Price), False)
                                          Next
                                          dash()
                                          row("Subtotal", Theme.Money(r.Subtotal), False)
                                          If r.Discount > 0 Then row("Discount", "-" & Theme.Money(r.Discount), False)
                                          If r.Gst > 0 Then row("GST", Theme.Money(r.Gst), False)
                                          row("TOTAL", Theme.Money(r.Total), True)
                                          For Each p In r.Payments.Where(Function(q) q.Amount > 0)
                                              row("Paid (" & p.Method & ")", Theme.Money(p.Amount), False)
                                          Next
                                          If r.Due > 0.004 Then row("Due", Theme.Money(r.Due), True)
                                          y += 6
                                          If r.Offline Then line("Billed offline — uploads automatically", f, center)
                                          line("Thank you! Visit again.", f, center)
                                      End Using
                                  End Sub
        Try
            If preview Then
                Using d As New PrintPreviewDialog With {.Document = doc, .Width = 900, .Height = 900, .UseAntiAlias = True}
                    d.ShowDialog(owner?.FindForm())
                End Using
            Else
                doc.Print()
            End If
        Catch ex As Exception
            TryCast(owner?.FindForm(), MainForm)?.Toast("Printer not available: " & ex.Message, True)
        End Try
    End Sub
End Module

''' <summary>Saves a table as an Excel file (or CSV), like the website's Export button.</summary>
Public Module Export
    Public Sub Csv(owner As Control, title As String, headers As IEnumerable(Of String), rows As IEnumerable(Of IEnumerable(Of Object)))
        Dim head = headers.ToList()
        Dim data = rows.Select(Function(r) r.ToList()).ToList()
        Using d As New SaveFileDialog With {.Filter = "Excel workbook|*.xlsx|CSV (comma separated)|*.csv", .FileName = title.Replace("/", "-").Replace(":", "-") & " " & DateTime.Now.ToString("yyyy-MM-dd")}
            If d.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return
            Try
                If d.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase) Then
                    Dim sb As New StringBuilder()
                    sb.AppendLine(String.Join(",", head.Select(AddressOf Cell)))
                    For Each r In data : sb.AppendLine(String.Join(",", r.Select(AddressOf Cell))) : Next
                    File.WriteAllText(d.FileName, sb.ToString(), New UTF8Encoding(True))
                Else
                    Dim sh As New Xlsx.Sheet(title, head)
                    For Each r In data : sh.Rows.Add(r) : Next
                    Xlsx.Save(d.FileName, {sh})
                End If
                TryCast(owner?.FindForm(), MainForm)?.Toast("Saved " & Path.GetFileName(d.FileName))
            Catch ex As Exception
                MessageBox.Show(owner?.FindForm(), "Could not save the file: " & ex.Message, "Export", MessageBoxButtons.OK, MessageBoxIcon.Warning)
            End Try
        End Using
    End Sub

    Private Function Cell(v As Object) As String
        Dim s As String
        If v Is Nothing Then
            s = ""
        ElseIf TypeOf v Is Double Then
            s = DirectCast(v, Double).ToString("0.##", Globalization.CultureInfo.InvariantCulture)
        Else
            s = v.ToString()
        End If
        If s.IndexOfAny({","c, """"c, ControlChars.Cr, ControlChars.Lf}) >= 0 Then s = """" & s.Replace("""", """""") & """"
        Return s
    End Function
End Module

''' <summary>Add / edit a customer, turn one on or off (shows at once, sent when possible).</summary>
Public Module CustomerActions
    Public Sub Edit(owner As Control, c As JsonObject)
        Dim f As New FormDialog(If(c Is Nothing, "Add customer", "Edit customer"), 500)
        f.AddText("name", "Name", Js.Str(c, "name"), required:=True)
        f.AddText("phone", "Mobile", Js.Str(c, "phone"), half:=True)
        f.AddText("email", "Email", Js.Str(c, "email"), half:=True)
        f.AddMulti("address", "Address", Js.Str(c, "address"), 70)
        f.AddPick("type", "Customer type", {"offline|Store", "online|Online"}, Js.Str(c, "type", "offline"))
        f.OnSave = Async Function(d)
                       Dim body = Js.Obj("name", d.Val("name").Trim(), "phone", d.Val("phone").Trim(), "email", d.Val("email").Trim(), "address", d.Val("address").Trim(), "customerType", d.Val("type"))
                       Dim item As New OutboxItem With {.Method = If(c Is Nothing, "POST", "PUT"), .Path = If(c Is Nothing, "/api/ecommerce/customers2", "/api/ecommerce/customers2/" & Js.Int(c, "id")), .Body = body,
                           .Label = If(c Is Nothing, "New", "Edit") & " customer: " & d.Val("name").Trim(), .Refresh = New List(Of String) From {"customers"}}
                       If c Is Nothing Then
                           item.Effect = New JsonObject From {{"kind", "customer_new"}, {"customer", Js.Obj("id", -DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), "localRef", item.Id, "name", d.Val("name").Trim(),
                               "phone", If(d.Val("phone").Trim() = "", Nothing, d.Val("phone").Trim()), "email", If(d.Val("email").Trim() = "", Nothing, d.Val("email").Trim()), "address", d.Val("address").Trim(),
                               "type", d.Val("type"), "status", "active", "since", DateTime.UtcNow, "due", 0, "orders", 0, "spent", 0)}}
                       Else
                           Dim fields = Js.Obj("name", d.Val("name").Trim(), "phone", d.Val("phone").Trim(), "email", d.Val("email").Trim(), "address", d.Val("address").Trim(), "type", d.Val("type"))
                           item.Effect = New JsonObject From {{"kind", "customer"}, {"id", Js.Int(c, "id")}, {"fields", fields}}
                       End If
                       Dim r = Await AppState.I.SendNowAsync(item)
                       If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden Then Return r.Message
                       Return Nothing
                   End Function
        If f.ShowDialog(owner?.FindForm()) = DialogResult.OK Then TryCast(owner?.FindForm(), MainForm)?.Toast("Saved.")
    End Sub

    Public Sub SetStatus(c As JsonObject, active As Boolean, owner As Control)
        Dim status = If(active, "active", "inactive")
        If Js.Str(c, "status") = status Then Return
        AppState.I.Enqueue(New OutboxItem With {.Method = "PATCH", .Path = "/api/ecommerce/customers/" & Js.Int(c, "id"), .Body = Js.Obj("status", status),
            .Label = Js.Str(c, "name") & ": " & If(active, "active", "inactive"), .Effect = New JsonObject From {{"kind", "customer"}, {"id", Js.Int(c, "id")}, {"fields", Js.Obj("status", status)}},
            .Refresh = New List(Of String) From {"customers"}})
        TryCast(owner?.FindForm(), MainForm)?.Toast(If(active, "Customer is active again.", "Customer set to inactive."))
    End Sub

    Public Sub StatusMenu(c As JsonObject, at As Point, owner As Control)
        If Not AppState.I.Perm.Has("ecommerce", "manage_customers") Then Return
        Ui.PopMenu(owner, {If(Js.Str(c, "status") = "active", "*", "") & "active|Active", If(Js.Str(c, "status") <> "active", "*", "") & "inactive|Inactive"}, Sub(k) SetStatus(c, k = "active", owner), at)
    End Sub
End Module

''' <summary>Collect a customer's due (one or several bills at once, part or full). Works offline: it shows as
''' paid here and is recorded when the internet is back. Prints a receipt if wanted.</summary>
Public Module DueActions
    Public Sub Collect(owner As Control, dues As List(Of JsonObject))
        If dues.Count = 0 Then Return
        Dim customer = Js.Str(dues(0), "customer")
        Dim many = dues.Select(Function(d) Js.Str(d, "customer")).Distinct().Count() > 1
        Dim f As New FormDialog(If(dues.Count = 1, "Collect from " & customer, "Collect from " & dues.Count & " dues"), 560, "Receive")
        Dim rows As New List(Of (Due As JsonObject, OnOff As Switch, Amount As WInput))
        For Each d In dues
            Dim row As New Panel With {.Height = 46, .BackColor = Color.White}
            Dim sw As New Switch("", True)
            Dim amt = WInput.Make("0", ChrW(&H20B9))
            amt.Text = Js.Num(d, "balance").ToString("0.00", Globalization.CultureInfo.InvariantCulture)
            amt.Width = 140
            Dim label As New Drawn(44, Sub(g, r)
                                           Tr.DrawText(g, Js.Str(d, "orderNumber", "Due"), Theme.BodyBold, New Point(0, 4), Theme.G900, TextFormatFlags.NoPadding)
                                           Tr.DrawText(g, "Balance " & Theme.Money(Js.Num(d, "balance")) & " · " & Fmt.Day(Js.Time(d, "createdAt")), Theme.Small, New Point(0, 24), Theme.G500, TextFormatFlags.NoPadding)
                                       End Sub)
            row.Controls.AddRange(New Control() {sw, label, amt})
            AddHandler row.Layout, Sub()
                                       sw.SetBounds(0, 10, 44, 26)
                                       amt.SetBounds(row.Width - 140, 4, 140, 38)
                                       label.SetBounds(52, 0, row.Width - 200, 44)
                                   End Sub
            AddHandler sw.Toggled, Sub() UpdateTotal(f, rows)
            AddHandler amt.TextChanged, Sub() UpdateTotal(f, rows)
            rows.Add((d, sw, amt))
            f.AddControl(row)
        Next
        f.AddPick("method", "Payment method", {"Cash|Cash", "UPI|UPI", "Card|Card", "Other|Other"}, "Cash")
        If dues.Count > 1 Then f.AddCheck("combine", "One receipt number for all of these", True)
        f.AddCheck("print", "Print receipt", True)
        UpdateTotal(f, rows)
        f.OnSave = Async Function(dlg)
                       Dim ids As New JsonArray(), amounts As New JsonArray(), map As New JsonObject()
                       Dim lines As New List(Of (String, Double))
                       For Each r In rows
                           Dim a = Fmt.ParseNum(r.Amount.Text)
                           If Not r.OnOff.Checked OrElse a <= 0 Then Continue For
                           a = Math.Min(a, Js.Num(r.Due, "balance")) ' never more than owed
                           ids.Add(Js.Int(r.Due, "id")) : amounts.Add(a) : map(Js.Int(r.Due, "id").ToString()) = a
                           lines.Add(("Due for " & Js.Str(r.Due, "orderNumber") & If(many, " (" & Js.Str(r.Due, "customer") & ")", ""), a))
                       Next
                       If ids.Count = 0 Then Return "Enter an amount."
                       Dim method = dlg.Val("method")
                       Dim total = lines.Sum(Function(l) l.Item2)
                       Dim item As New OutboxItem With {.Method = "POST", .Path = "/api/ecommerce/due-payment", .Label = "Due collected · " & Theme.Money(total) & " · " & If(many, dues.Count & " dues", customer),
                           .Body = New JsonObject From {{"creditIds", ids}, {"amounts", amounts}, {"paymentMethod", method}, {"combineReceipt", dues.Count = 1 OrElse dlg.Bool("combine")}},
                           .Effect = New JsonObject From {{"kind", "due_payment"}, {"method", method}, {"amounts", map}}, .Refresh = New List(Of String) From {"dues", "customers", "orders"}}
                       Dim res = Await AppState.I.SendNowAsync(item)
                       If res.Outcome = ApiOutcome.Rejected OrElse res.Outcome = ApiOutcome.Forbidden Then Return res.Message
                       Dim m = System.Text.RegularExpressions.Regex.Match(Js.Str(res.Data, "redirect"), "RCPT\d+")
                       Dim receiptNo = If(res.IsOk, If(m.Success, m.Value, "Receipt"), "Pending")
                       TryCast(owner?.FindForm(), MainForm)?.Toast(If(res.IsOk, "Payment recorded (" & receiptNo & ").", "Payment recorded — it is sent when the internet is back."))
                       If dlg.Bool("print") Then
                           Dim rd As New ReceiptData With {.Number = receiptNo, .At = DateTime.Now, .Customer = customer, .Phone = Js.Str(dues(0), "phone"), .Subtotal = total, .Total = total, .Offline = Not res.IsOk}
                           For Each l In lines : rd.Lines.Add((l.Item1, 1, l.Item2, "")) : Next
                           rd.Payments.Add((method, total))
                           Receipts.Print(rd, Js.Str(AppState.I.Settings, "printerFormat", "thermal_80"), owner)
                       End If
                       Return Nothing
                   End Function
        f.ShowDialog(owner?.FindForm())
    End Sub

    Private Sub UpdateTotal(f As FormDialog, rows As List(Of (Due As JsonObject, OnOff As Switch, Amount As WInput)))
        Dim t = rows.Where(Function(r) r.OnOff.Checked).Sum(Function(r) Math.Min(Fmt.ParseNum(r.Amount.Text), Js.Num(r.Due, "balance")))
        f.SaveButton.Text = "Receive " & Theme.Money(t)
        f.SaveButton.Width = f.SaveButton.PreferredWidth()
        f.LayoutButtons()
        f.SaveButton.Invalidate()
    End Sub
End Module

''' <summary>Product changes from any list: stock received / set, publish, delete (show at once, sent when possible).</summary>
Public Module ProductActions
    Public Sub AdjustStock(owner As Control, p As JsonObject)
        Dim current = Js.Int(p, "stock")
        Dim unit = Js.Str(p, "unit")
        Dim f As New FormDialog("Update stock — " & Js.Str(p, "name"), 440)
        f.AddNote("Now in stock: " & current & If(unit <> "", " " & unit, ""))
        f.AddPick("mode", "What happened", {"add|Add received", "set|Set exact"}, "add")
        f.AddNumber("n", "Quantity", Nothing, required:=True)
        f.Validator = Function(d)
                          Dim n As Integer
                          If Not Integer.TryParse(d.Val("n").Trim(), n) OrElse n < 0 Then Return "Enter a whole number, 0 or more."
                          Return Nothing
                      End Function
        If f.ShowDialog(owner?.FindForm()) <> DialogResult.OK Then Return
        Dim qty = CInt(f.Num("n"))
        Dim add = f.Val("mode") = "add"
        Dim newStock = If(add, current + qty, qty)
        AppState.I.Enqueue(New OutboxItem With {.Method = "PATCH", .Path = "/api/app/v1/products/" & Js.Int(p, "id"),
            .Body = If(add, Js.Obj("stockAdd", qty), Js.Obj("stock", qty)),
            .Label = If(add, "Received " & qty & " × " & Js.Str(p, "name"), "Stock of " & Js.Str(p, "name") & " set to " & qty),
            .Effect = If(add, Js.Obj("kind", "stock_add", "id", Js.Int(p, "id"), "qty", qty), New JsonObject From {{"kind", "product"}, {"id", Js.Int(p, "id")}, {"fields", Js.Obj("stock", newStock)}}),
            .Refresh = New List(Of String) From {"products"}})
        TryCast(owner?.FindForm(), MainForm)?.Toast("Stock is now " & newStock & ".")
    End Sub

    Public Sub SetStatus(owner As Control, rows As IEnumerable(Of JsonObject), status As String)
        Dim word = If(status = "active", "published", "unpublished")
        Dim change = rows.Where(Function(p) Js.Int(p, "id") > 0 AndAlso Js.Str(p, "status") <> status).ToList()
        Dim mf = TryCast(owner?.FindForm(), MainForm)
        If change.Count = 0 Then mf?.Toast("Already " & word & ".") : Return
        For Each p In change
            AppState.I.Enqueue(New OutboxItem With {.Method = "PATCH", .Path = "/api/app/v1/products/" & Js.Int(p, "id"), .Body = Js.Obj("status", status), .Label = Js.Str(p, "name") & ": " & word,
                .Effect = New JsonObject From {{"kind", "product"}, {"id", Js.Int(p, "id")}, {"fields", Js.Obj("status", status)}}, .Refresh = New List(Of String) From {"products"}})
        Next
        mf?.Toast(If(change.Count = 1, "Product " & word & ".", change.Count & " products " & word & "."))
    End Sub

    Public Async Function DeleteAsync(owner As Control, rows As List(Of JsonObject)) As Task
        rows = rows.Where(Function(p) Js.Int(p, "id") > 0).ToList()
        If rows.Count = 0 Then Return
        Dim label = If(rows.Count = 1, """" & Js.Str(rows(0), "name") & """", rows.Count & " selected products")
        If Not Ui.Confirm(owner, "Delete " & label & "? This cannot be undone.", "Confirm Delete?") Then Return
        Dim gone = 0
        Dim refused As New List(Of String)
        For Each p In rows
            Dim r = Await AppState.I.SendNowAsync(New OutboxItem With {.Method = "DELETE", .Path = "/api/ecommerce/products/" & Js.Int(p, "id"), .Label = "Delete product: " & Js.Str(p, "name"),
                .Effect = New JsonObject From {{"kind", "product_delete"}, {"ids", New JsonArray(JsonValue.Create(Js.Int(p, "id")))}}, .Refresh = New List(Of String) From {"products"}})
            If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden Then refused.Add("""" & Js.Str(p, "name") & """") Else gone += 1
        Next
        Dim mf = TryCast(owner?.FindForm(), MainForm)
        If refused.Count = 0 Then
            mf?.Toast(If(gone = 1, "Product deleted.", gone & " products deleted."))
        Else
            mf?.Toast(If(gone > 0, gone & " deleted. ", "") & "Couldn't delete " & String.Join(", ", refused.Take(2)) & If(refused.Count > 2, " and " & (refused.Count - 2) & " more", "") &
                      ". A product that already appears in orders can't be deleted — set it to Unpublish to hide it instead.", True)
        End If
    End Function

    Public Function Price(p As JsonObject) As Double
        Return If(Js.Num(p, "salePrice") > 0, Js.Num(p, "salePrice"), Js.Num(p, "price"))
    End Function
End Module

''' <summary>Sending a page's change (brands, tags, reviews, coupons…): shows at once, the page's fresh copy is
''' fetched after the server confirms; offline it waits in the outbox.</summary>
Public Module PageActions
    ''' <summary>Returns Nothing when done (or queued), else the server's message.</summary>
    Public Async Function SendAsync(owner As Control, item As OutboxItem, Optional pageName As String = Nothing, Optional done As String = "Saved.") As Task(Of String)
        Dim r = Await AppState.I.SendNowAsync(item)
        Dim mf = TryCast(owner?.FindForm(), MainForm)
        If r.Outcome = ApiOutcome.Rejected OrElse r.Outcome = ApiOutcome.Forbidden OrElse r.Outcome = ApiOutcome.Unauthorized Then
            mf?.Toast(r.Message, True)
            Return r.Message
        End If
        If r.IsOk Then
            mf?.Toast(done)
            If pageName IsNot Nothing Then Await AppState.I.ReloadPageAsync(pageName)
        Else
            mf?.Toast(done & " It reaches the website when the internet is back.")
        End If
        Return Nothing
    End Function

    ''' <summary>One change per row (queued when offline), one message at the end.</summary>
    Public Async Function EachAsync(owner As Control, rows As IEnumerable(Of JsonObject), make As Func(Of JsonObject, OutboxItem), done As String, Optional pageName As String = Nothing) As Task
        Dim ok = 0, queued = 0
        Dim err As String = Nothing
        For Each row In rows.ToList()
            Dim r = Await AppState.I.SendNowAsync(make(row))
            If r.IsOk Then
                ok += 1
            ElseIf r.Outcome = ApiOutcome.Offline OrElse r.Outcome = ApiOutcome.Busy Then
                queued += 1
            ElseIf err Is Nothing Then
                err = r.Message
            End If
        Next
        Dim mf = TryCast(owner?.FindForm(), MainForm)
        If err IsNot Nothing Then
            mf?.Toast(If(ok + queued > 0, (ok + queued) & " done. " & err, err), True)
        Else
            mf?.Toast(done)
        End If
        If ok > 0 AndAlso pageName IsNot Nothing Then Await AppState.I.ReloadPageAsync(pageName)
    End Function

    Public Function PageRow(page As String, id As JsonNode, fields As JsonObject, Optional list As String = Nothing) As JsonObject
        Dim e As New JsonObject From {{"kind", "page_row"}, {"page", page}, {"id", Js.Copy(id)}, {"fields", fields}}
        If list IsNot Nothing Then e("list") = list
        Return e
    End Function

    Public Function PageRowDelete(page As String, id As JsonNode, Optional list As String = Nothing) As JsonObject
        Dim e As New JsonObject From {{"kind", "page_row_delete"}, {"page", page}, {"ids", New JsonArray(Js.Copy(id))}}
        If list IsNot Nothing Then e("list") = list
        Return e
    End Function

    Public Function PageRowNew(page As String, row As JsonObject, Optional list As String = Nothing) As JsonObject
        Dim e As New JsonObject From {{"kind", "page_row_new"}, {"page", page}, {"row", row}}
        If list IsNot Nothing Then e("list") = list
        Return e
    End Function

    ''' <summary>Active / Inactive style menu at a point; picked(value).</summary>
    Public Sub OnOffMenu(owner As Control, at As Point, isOn As Boolean, onLabel As String, offLabel As String, picked As Action(Of Boolean))
        Ui.PopMenu(owner, {If(isOn, "*", "") & "1|" & onLabel, If(Not isOn, "*", "") & "0|" & offLabel}, Sub(k)
                                                                                                          If (k = "1") <> isOn Then picked(k = "1")
                                                                                                      End Sub, at)
    End Sub
End Module
