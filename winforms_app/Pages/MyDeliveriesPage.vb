Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>Delivery agent's page (as in the Android app): my orders to deliver, cash to collect, done today.
''' Opening an order shows the agent view (picked up / delivered / collect payment).</summary>
Public Class MyDeliveriesPage
    Inherits ScrollPage

    Private ReadOnly _cards As New Columns(3, 180, 14)
    Private ReadOnly _toDeliver As New MiniStat("To deliver", ChrW(&HE806), Color.FromArgb(8, &H91, &HB2)) With {.Height = 86, .Cursor = Cursors.Hand}
    Private ReadOnly _doneToday As New MiniStat("Done today", Theme.IcDone, Color.FromArgb(&H16, &HA3, &H4A)) With {.Height = 86, .Cursor = Cursors.Hand}
    Private ReadOnly _collect As New MiniStat("Cash to collect", Theme.IcMoney, Color.FromArgb(&HD9, &H77, 6)) With {.Height = 86}
    Private ReadOnly _tabs As New Tabs("active|To deliver", "done|Finished")
    Private ReadOnly _list As New VStack(10)

    Public Overrides ReadOnly Property PageTitle As String = "My Deliveries"
    Public Overrides ReadOnly Property PageSubtitle As String = "Orders given to you — deliver, collect cash and mark them done"

    Public Sub New()
        _cards.Add(_toDeliver) : _cards.Add(_doneToday) : _cards.Add(_collect)
        Body.Add(_cards)
        Body.Add(_tabs)
        Body.Add(_list)
        AddHandler _toDeliver.Click, Sub()
                                         _tabs.Current = "active" : _tabs.Invalidate()
                                         Refresh_()
                                     End Sub
        AddHandler _doneToday.Click, Sub()
                                         _tabs.Current = "done" : _tabs.Invalidate()
                                         Refresh_()
                                     End Sub
        AddHandler _tabs.Changed, Sub() Refresh_()
    End Sub

    Private Shared Function Finished(o As JsonObject) As Boolean
        Return Js.Str(o, "status") = "Delivered" OrElse Js.Str(o, "status") = "Canceled"
    End Function

    Protected Overrides Sub Reload()
        Dim all = AppState.I.List("deliveries")
        Dim active = all.Where(Function(o) Not Finished(o)).OrderBy(Function(o) If(Js.Str(o, "status") = "Out for Delivery", 0, 1)).ToList()
        Dim done = all.Where(Function(o) Finished(o)).OrderByDescending(Function(o) If(Js.Time(o, "deliveredAt"), Js.Time(o, "createdAt"))).ToList()
        Dim today = DateTime.Today
        _toDeliver.SetValue(active.Count.ToString()) : _toDeliver.Selected = _tabs.Current = "active"
        _doneToday.SetValue(done.Where(Function(o) Js.Time(o, "deliveredAt").HasValue AndAlso Js.Time(o, "deliveredAt").Value.ToLocalTime().Date = today).Count().ToString()) : _doneToday.Selected = _tabs.Current = "done"
        _collect.SetValue(Theme.Money(active.Where(Function(o) Js.Str(o, "paymentStatus") <> "Paid").Sum(Function(o) Js.Num(o, "total"))), "from customers on your list")
        _tabs.Counts("active") = active.Count
        _tabs.Counts("done") = done.Count
        _tabs.Invalidate()
        For Each c As Control In _list.Controls.Cast(Of Control)().ToList() : _list.Controls.Remove(c) : c.Dispose() : Next
        Dim rows = If(_tabs.Current = "done", done, active)
        If rows.Count = 0 Then
            Dim empty As New CardBox(Nothing, "", 26)
            empty.Add(New TextBlock(If(_tabs.Current = "done", "Nothing finished yet", "No deliveries right now"), Theme.UiFont(11.0F, FontStyle.Bold), Theme.G800) With {.Center = True})
            If _tabs.Current <> "done" Then empty.Add(New TextBlock("New orders assigned to you will appear here.", Theme.Body, Theme.G500) With {.Center = True})
            _list.Add(empty)
        End If
        For Each o In rows
            _list.Add(DeliveryCard(o))
        Next
    End Sub

    Private Function DeliveryCard(o As JsonObject) As Control
        Dim id = Js.Int(o, "id")
        Dim card As New CardBox(Nothing, "", 16) With {.Cursor = Cursors.Hand}
        Dim items = Js.Arr(o, "items").Count
        Dim paid = Js.Str(o, "paymentStatus") = "Paid"
        Dim top As New Drawn(64, Sub(g, r)
                                     Tr.DrawText(g, Js.Str(o, "number"), Theme.UiFont(11.0F, FontStyle.Bold), New Point(0, 0), Theme.G900, TextFormatFlags.NoPadding)
                                     Dim st = Js.Str(o, "status")
                                     Dim w = Gfx.PillWidth(st)
                                     Gfx.Pill(g, st, r.Width - w, 10, Fmt.StatusColor(st))
                                     Tr.DrawText(g, Js.Str(o, "customer"), Theme.BodyBold, New Point(0, 26), Theme.G800, TextFormatFlags.NoPadding)
                                     Tr.DrawText(g, Js.Str(o, "address"), Theme.Small, New Rectangle(0, 45, r.Width, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                 End Sub)
        card.Add(top)
        Dim bottom As New Columns(2, 60, 10) With {.Weights = {3, 2}}
        bottom.Add(New Drawn(34, Sub(g, r)
                                     Dim txt = items & " item" & If(items = 1, "", "s") & " · "
                                     Tr.DrawText(g, txt, Theme.Body, New Point(0, 8), Theme.G500, TextFormatFlags.NoPadding)
                                     Dim x = Tr.MeasureText(txt, Theme.Body).Width
                                     Dim money = Theme.Money(Js.Num(o, "total"))
                                     Tr.DrawText(g, money, Theme.BodyBold, New Point(x, 8), Theme.G900, TextFormatFlags.NoPadding)
                                     x += Tr.MeasureText(money, Theme.BodyBold).Width + 10
                                     Gfx.Badge(g, If(paid, "Paid", "Collect " & OrderActions.MethodLabel(Js.Str(o, "paymentMethod"))), x, 17, If(paid, Color.FromArgb(4, &H78, &H57), Fmt.AmberText), If(paid, Color.FromArgb(&HEC, &HFD, &HF5), Color.FromArgb(&HFF, &HFB, &HEB)))
                                 End Sub))
        Dim tools As New HRow(6) With {.RightAlign = True}
        If Js.Str(o, "phone") <> "" Then
            Dim ph = Js.Str(o, "phone")
            tools.Add(Ui.Btn(ph, Theme.IcPhone, outline:=True, click:=Sub()
                                                                         Clipboard.SetText(ph)
                                                                         Toast("Number copied.")
                                                                     End Sub))
            tools.Add(Ui.IconBtn(ChrW(&HE8BD), "WhatsApp", Sub() Ui.OpenUrl(Ui.WhatsApp(ph))))
        End If
        If Not Js.IsNull(o, "lat") OrElse Js.Str(o, "address") <> "" Then
            tools.Add(Ui.IconBtn(ChrW(&HE707), "Open in Google Maps", Sub()
                                                                         Dim dest = If(Not Js.IsNull(o, "lat"), Js.Str(o, "lat") & "," & Js.Str(o, "lng"), Uri.EscapeDataString(Js.Str(o, "address")))
                                                                         Ui.OpenUrl("https://www.google.com/maps/dir/?api=1&destination=" & dest & "&travelmode=two-wheeler")
                                                                     End Sub))
        End If
        bottom.Add(tools)
        card.Add(bottom)
        Dim open_ As Action = Sub() Main?.Push(New OrderDetailPage(id, agentView:=True))
        AddHandler card.Click, Sub() open_()
        AddHandler top.Click, Sub() open_()
        Return card
    End Function
End Class
