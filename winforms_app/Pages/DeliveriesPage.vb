Imports System.Drawing
Imports System.Text.Json.Nodes
Imports System.Windows.Forms

''' <summary>"Deliveries Board" as on the website: Live now (on the road, numbers, waiting for an agent with
''' assign, one card per agent), History (every delivery: delivered, failed attempts, cancelled) and Agent
''' report (per agent, any dates). History / report use the last 90 days kept on this computer — offline too.</summary>
Public Class DeliveriesPage
    Inherits ScrollPage

    Private ReadOnly _display As DisplayOptions = DisplayOptions.For("ecom_deliveries_display")
    Private ReadOnly _mode As New PillTabs("live|Live now|radio", "history|History|history", "report|Agent report|bar-chart-3")
    Private ReadOnly _export As New HeadButton("Export", "download")
    Private ReadOnly _range As New RangeBar("today,yesterday,week,7d,this_month,30d,custom", "today")
    Private ReadOnly _agent As ComboBox = Ui.Filter({"0|All delivery agents"}, 220)
    Private ReadOnly _status As New Tabs("all|All", "delivered|Delivered", "failed|Failed", "canceled|Cancelled", "active|Out now")
    Private ReadOnly _search As WInput = WInput.Make("Order, customer, phone, agent", Theme.IcSearch)
    Private _rows As New List(Of JsonObject)
    Private _report As New List(Of JsonObject)

    Public Overrides ReadOnly Property PageTitle As String = "Deliveries Board"
    Public Overrides ReadOnly Property PageSubtitle As String
        Get
            Select Case _mode.Current
                Case "live" : Return "Who is carrying which order right now — assign new ones, follow every delivery"
                Case "report" : Return "How many deliveries each agent made — today, this week, this month or any dates"
                Case Else : Return "Every delivery: delivered, failed attempts and cancelled"
            End Select
        End Get
    End Property
    Public Overrides ReadOnly Property Actions As Control()
        Get
            If _mode.Current = "live" Then Return {_display.Button}
            Return {_export}
        End Get
    End Property

    Public Sub New()
        _search.Width = 280
        AddHandler _mode.Changed, Sub()
                                      Refresh_()
                                      HeaderChanged()
                                  End Sub
        AddHandler _range.Changed, Sub() Refresh_()
        AddHandler _agent.SelectedIndexChanged, Sub() Refresh_()
        AddHandler _status.Changed, Sub() Refresh_()
        AddHandler _search.TextChanged, Sub() Refresh_()
        AddHandler _display.Changed, Sub() Refresh_()
        AddHandler _export.Click, Sub() DoExport()
    End Sub

    Private Sub Open(o As JsonObject)
        If Js.Int(o, "id") > 0 Then Main?.Push(New OrderDetailPage(Js.Int(o, "id")))
    End Sub

    Protected Overrides Sub Reload()
        Body.SuspendLayout()
        Dim typing = _search.Box.Focused
        ClearBody(_mode, _range, _agent, _status, _search)
        Body.Add(_mode)
        If _mode.Current = "live" Then Live() Else History()
        Body.ResumeLayout()
        If typing Then
            _search.Box.Focus()
            _search.Box.SelectionStart = _search.Box.TextLength
        End If
    End Sub

    Private Shared Function Since(t As DateTime?) As String
        If Not t.HasValue Then Return "—"
        Dim m = Math.Max(0, CInt((DateTime.Now - t.Value).TotalMinutes))
        Return If(m < 60, m & " min", (m \ 60) & "h " & (m Mod 60) & "m")
    End Function

    ' ───────── Live now ─────────
    Private Sub Live()
        Dim s = AppState.I
        Dim on_ = Function(g As String, k As String) _display.IsOn(g, k)
        Dim orders = s.List("orders").Where(Function(o) Js.Str(o, "type") = "online").ToList()
        Dim agents = s.List("agents")
        Dim today = Function(d As DateTime?) d.HasValue AndAlso d.Value.Date = DateTime.Today
        Dim waiting = orders.Where(Function(o) Js.Str(o, "status") = "In Progress" AndAlso Js.IsNull(o, "agentId")).ToList()
        Dim onWay = orders.Where(Function(o) Js.Str(o, "status") = "Out for Delivery").ToList()
        Dim withAgent = orders.Where(Function(o) Not Js.IsNull(o, "agentId") AndAlso (Js.Str(o, "status") = "Out for Delivery" OrElse Js.Str(o, "status") = "In Progress")).ToList()
        Dim doneToday = orders.Where(Function(o) Js.Str(o, "status") = "Delivered" AndAlso today(Js.Time(o, "deliveredAt"))).ToList()
        Dim toCollect = withAgent.Where(Function(o) Js.Str(o, "paymentStatus") <> "Paid").Sum(Function(o) Js.Num(o, "total"))
        Dim cashToday = doneToday.Where(Function(o) Not Js.IsNull(o, "agentId") AndAlso Js.Str(o, "paymentStatus") = "Paid").Sum(Function(o) Js.Num(o, "total"))
        Dim busy = agents.Where(Function(a) withAgent.Any(Function(o) Js.Int(o, "agentId") = Js.Int(a, "id"))).Count()

        If withAgent.Count > 0 Then
            Dim card As New CardBox("On the road now", Theme.IcTruck)
            Dim t As New WebTable() With {.RowHeight = 52, .RowClickable = True, .Modern = True}
            t.Cols.Add(New TCol("Order", Function(o) Js.Str(o, "number"), 0, CellKind.Link) With {.Flex = 10, .Colour = Function(o) Theme.Blue})
            t.Cols.Add(New TCol("Delivery agent", Function(o) OrderActions.AgentName(Js.Int(o, "agentId")), 0, CellKind.Bold) With {.Flex = 10})
            t.Cols.Add(New TCol("Customer", Function(o) Js.Str(o, "customer"), 0) With {.Flex = 22, .Sub = Function(o) Js.Str(o, "address").Replace(vbLf, ", ")})
            t.Cols.Add(New TCol("Status", Function(o) If(Js.Str(o, "status") = "Out for Delivery", "On the way", "Not picked up"), 0, CellKind.Badge) With {.Flex = 10,
                .Colour = Function(o) If(Js.Str(o, "status") = "Out for Delivery", Color.FromArgb(3, &H69, &HA1), Fmt.AmberText)})
            t.Cols.Add(New TCol("With the agent for", Function(o) Since(Js.Time(o, "assignedAt")), 0) With {.Flex = 10, .Colour = Function(o) Theme.G600})
            t.Cols.Add(New TCol("To collect", Function(o) If(Js.Str(o, "paymentStatus") = "Paid", "Paid", Theme.Money(Js.Num(o, "total"))), 0, CellKind.Bold) With {.Flex = 10, .Right = True,
                .Colour = Function(o) If(Js.Str(o, "paymentStatus") = "Paid", Theme.Green, Theme.G900)})
            Dim agentOrder = agents.Select(Function(a) Js.Int(a, "id")).ToList()
            t.Rows = withAgent.OrderBy(Function(o)
                                           Dim ix = agentOrder.IndexOf(Js.Int(o, "agentId"))
                                           Return If(ix < 0, Integer.MaxValue, ix)
                                       End Function).ThenBy(Function(o) Js.Str(o, "assignedAt")).ToList()
            AddHandler t.RowClick, Sub(o) Open(o)
            card.Add(t)
            Body.Add(card)
        End If

        Dim stats As New Columns(6, 150, 12)
        Dim stat = Sub(key As String, caption As String, glyph As String, colour As Color, value As String)
                       If Not on_("dv-stats", key) Then Return
                       Dim m As New MiniStat(caption, glyph, colour) With {.Height = 84}
                       m.SetValue(value)
                       stats.Add(m)
                   End Sub
        stat("dv-k-waiting", "Waiting for an agent", Theme.IcClock, Color.FromArgb(&HD9, &H77, 6), waiting.Count.ToString())
        stat("dv-k-onway", "On the way", Theme.IcTruck, Color.FromArgb(2, &H84, &HC7), onWay.Count.ToString())
        stat("dv-k-delivered", "Delivered today", Theme.IcDone, Color.FromArgb(5, &H96, &H69), doneToday.Count.ToString())
        stat("dv-k-collect", "Cash to collect", ChrW(&HE8C7), Theme.Danger, Theme.Money(toCollect))
        stat("dv-k-cash", "Cash collected today", Theme.IcMoney, Theme.Primary, Theme.Money(cashToday))
        stat("dv-k-agents", "Agents busy", Theme.IcPeople, Theme.G700, busy & " / " & agents.Count)
        If stats.Controls.Count > 0 AndAlso _display.IsOn("dv-stats") Then stats.Count = stats.Controls.Count : Body.Add(stats)

        If _display.IsOn("dv-waiting") Then
            Dim card As New CardBox("Waiting for a delivery agent (" & waiting.Count & ")", Theme.IcClock) With {.Accent = Color.FromArgb(&H92, &H40, &HE)}
            If waiting.Count = 0 Then
                card.Add(New TextBlock("All accepted orders have an agent.", Theme.Body, Theme.G600))
            Else
                Dim w = Function(k As String) on_("dv-waiting", k)
                Dim t As New WebTable() With {.RowHeight = 58, .RowClickable = True, .Modern = True}
                t.Cols.Add(New TCol("Order", Function(o) "#" & Js.Str(o, "number"), 0, CellKind.Link) With {.Flex = 22, .Colour = Function(o) Theme.Blue,
                    .Sub = Function(o)
                               Dim parts As New List(Of String)
                               If w("dv-w-customer") Then parts.Add(Js.Str(o, "customer"))
                               If w("dv-w-amount") Then parts.Add(Theme.Money(Js.Num(o, "total")))
                               If w("dv-w-payment") Then parts.Add(If(Js.Str(o, "paymentStatus") = "Paid", "paid", "to collect"))
                               If w("dv-w-items") Then parts.Add(Js.Arr(o, "items").Count & " items")
                               parts.Add(Fmt.Ago(Js.Time(o, "createdAt")))
                               Return String.Join(" · ", parts)
                           End Function})
                If w("dv-w-address") Then t.Cols.Add(New TCol("Address", Function(o) Js.Str(o, "address").Replace(vbLf, ", "), 0) With {.Flex = 20, .Colour = Function(o) Theme.G600})
                Dim btns As New TCol("", Nothing, 0, CellKind.Actions) With {.Flex = 10, .Right = True,
                    .ButtonsFor = Function(o)
                                      Dim l As New List(Of String)
                                      If w("dv-w-contact") AndAlso Js.Str(o, "phone") <> "" Then l.Add("call")
                                      If w("dv-w-contact") AndAlso (Not Js.IsNull(o, "lat") OrElse Js.Str(o, "address") <> "") Then l.Add("map")
                                      If w("dv-w-assign") AndAlso s.Perm.Has("orders", "assign_delivery") AndAlso agents.Count > 0 Then l.Add("assign")
                                      Return l
                                  End Function}
                btns.Btn("call", Theme.IcPhone, "Call", Theme.G600).Btn("map", ChrW(&HE707), "Map", Theme.Blue).Btn("assign", Theme.IcTruck, "Assign agent…", Theme.Primary)
                t.Cols.Add(btns)
                t.Rows = waiting
                AddHandler t.RowClick, Sub(o) Open(o)
                AddHandler t.ActionClick, Sub(o, k)
                                              Select Case k
                                                  Case "call" : Ui.OpenUrl("tel:" & Js.Str(o, "phone"))
                                                  Case "map"
                                                      Dim dest = If(Js.IsNull(o, "lat"), Uri.EscapeDataString(Js.Str(o, "address")), Js.Str(o, "lat") & "," & Js.Str(o, "lng"))
                                                      Ui.OpenUrl("https://www.google.com/maps/dir/?api=1&destination=" & dest)
                                                  Case "assign" : OrderActions.AgentMenu(o, Cursor.Position, Me)
                                              End Select
                                          End Sub
                card.Add(t)
            End If
            Body.Add(card)
        End If

        If _display.IsOn("dv-agents") Then
            If agents.Count = 0 Then
                Body.Add(New CardBox()).Add(New TextBlock("No delivery agents yet — add staff with the Delivery Agent role.", Theme.Body, Theme.G600))
            Else
                Dim grid As New Columns(3, 300, 16) With {.Stretch = False}
                For Each a In agents : grid.Add(AgentCard(a, orders)) : Next
                Body.Add(grid)
            End If
        End If
    End Sub

    Private Function AgentCard(a As JsonObject, orders As List(Of JsonObject)) As Control
        Dim on_ = Function(k As String) _display.IsOn("dv-agents", k)
        Dim today = Function(d As DateTime?) d.HasValue AndAlso d.Value.Date = DateTime.Today
        Dim mine = orders.Where(Function(o) Js.Int(o, "agentId") = Js.Int(a, "id")).ToList()
        Dim active = mine.Where(Function(o) Js.Str(o, "status") = "Out for Delivery" OrElse Js.Str(o, "status") = "In Progress").ToList()
        Dim done = mine.Where(Function(o) Js.Str(o, "status") = "Delivered" AndAlso today(Js.Time(o, "deliveredAt"))).ToList()
        Dim collect = active.Where(Function(o) Js.Str(o, "paymentStatus") <> "Paid").Sum(Function(o) Js.Num(o, "total"))
        Dim cash = done.Where(Function(o) Js.Str(o, "paymentStatus") = "Paid").Sum(Function(o) Js.Num(o, "total"))
        Dim card As New CardBox(Js.Str(a, "name"), ChrW(&HE806), 16) With {.Accent = Color.FromArgb(3, &H69, &HA1)}
        If on_("dv-a-summary") Then card.Subtitle = active.Count & " active · " & done.Count & " delivered today"
        Dim phone = Js.Str(a, "phone")
        If phone <> "" Then card.Tools.Add(Ui.IconBtn(Theme.IcPhone, "Call " & phone, Sub() Ui.OpenUrl("tel:" & phone), Theme.Green))
        If on_("dv-a-collect") OrElse on_("dv-a-cash") Then
            Dim boxes As New Drawn(52, Sub(g, r)
                                           Dim parts As New List(Of (String, String, Color, Color))
                                           If on_("dv-a-collect") Then parts.Add((Theme.Money(collect), "to collect", Fmt.AmberText, Fmt.AmberSoft))
                                           If on_("dv-a-cash") Then parts.Add((Theme.Money(cash), "cash today", Color.FromArgb(4, &H78, &H57), Color.FromArgb(&HD1, &HFA, &HE5)))
                                           Dim bw = (r.Width - 8 * (parts.Count - 1)) \ Math.Max(1, parts.Count)
                                           For k = 0 To parts.Count - 1
                                               Dim br As New Rectangle(k * (bw + 8), 0, bw, 50)
                                               Using p = Theme.RoundRect(New RectangleF(br.X, br.Y, br.Width, br.Height), 6)
                                                   Using b As New SolidBrush(parts(k).Item4) : g.FillPath(b, p) : End Using
                                               End Using
                                               Tr.DrawText(g, parts(k).Item1, Theme.UiFont(10.5F, FontStyle.Bold), New Rectangle(br.X, br.Y + 6, br.Width, 20), parts(k).Item3, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
                                               Tr.DrawText(g, parts(k).Item2, Theme.Small, New Rectangle(br.X, br.Y + 28, br.Width, 16), parts(k).Item3, TextFormatFlags.HorizontalCenter Or TextFormatFlags.NoPadding)
                                           Next
                                       End Sub)
            card.Add(boxes)
        End If
        If on_("dv-a-orders") Then
            For Each o In active
                Dim oo = o
                Dim line As New Drawn(42, Sub(g, r)
                                              Tr.DrawText(g, "#" & Js.Str(oo, "number"), Theme.BodyBold, New Point(0, 2), Theme.Blue, TextFormatFlags.NoPadding)
                                              If on_("dv-a-status") Then
                                                  If Js.Str(oo, "status") = "Out for Delivery" Then
                                                      Dim w = Tr.MeasureText("On the way", Theme.UiFont(8.0F, FontStyle.Bold)).Width + 12
                                                      Gfx.Badge(g, "On the way", r.Right - w, 11, Color.FromArgb(3, &H69, &HA1), Color.FromArgb(&HE0, &HF2, &HFE))
                                                  Else
                                                      Dim w = Tr.MeasureText("To pick up", Theme.UiFont(8.0F, FontStyle.Bold)).Width + 12
                                                      Gfx.Badge(g, "To pick up", r.Right - w, 11, Fmt.AmberText, Fmt.AmberSoft)
                                                  End If
                                              End If
                                              Dim parts As New List(Of String)
                                              If on_("dv-a-customer") Then parts.Add(Js.Str(oo, "customer") & " · " & Theme.Money(Js.Num(oo, "total")) & If(Js.Str(oo, "paymentStatus") <> "Paid", " (collect)", ""))
                                              If on_("dv-a-time") Then parts.Add("assigned " & Fmt.Ago(If(Js.Time(oo, "assignedAt"), Js.Time(oo, "createdAt"))))
                                              Tr.DrawText(g, String.Join(" · ", parts), Theme.Small, New Rectangle(0, 22, r.Width, 18), Theme.G500, TextFormatFlags.NoPadding Or TextFormatFlags.EndEllipsis)
                                          End Sub) With {.Cursor = Cursors.Hand}
                AddHandler line.Click, Sub() Open(oo)
                card.Add(line)
            Next
        End If
        Return card
    End Function

    ' ───────── History / Agent report ─────────
    Private Shared Function Fails(r As JsonObject) As List(Of JsonObject)
        Return Js.Objs(Js.Arr(r, "failedAttempts"))
    End Function

    Private Shared Function Dur(m As JsonNode) As String
        If m Is Nothing Then Return "—"
        Dim n = CInt(Js.ToNum(m))
        Return If(n < 60, n & " min", (n \ 60) & "h " & (n Mod 60) & "m")
    End Function

    Private Sub History()
        Dim data = AppState.I.PageObj("deliveries")
        Dim all = Js.Objs(Js.Arr(data, "rows"))
        Dim agents = Js.Objs(Js.Arr(data, "agents"))
        Ui.Refill(_agent, {"0|All delivery agents"}.Concat(agents.Select(Function(a) Js.Int(a, "id") & "|" & Js.Str(a, "name"))))
        Dim agentId = CInt(Ui.Val(_agent))
        Dim bar As New Card With {.Padding = New Padding(12), .Height = 60}
        bar.Controls.Add(_range)
        bar.Controls.Add(_agent)
        AddHandler bar.Layout, Sub()
                                   _range.SetBounds(12, 12, Math.Min(_range.PreferredW(), bar.Width - 250), 36)
                                   _agent.SetBounds(bar.Width - 12 - 220, 17, 220, 28)
                               End Sub
        Body.Add(bar)
        Dim inside = Function(d As DateTime?) _range.Contains(d) AndAlso d.HasValue
        Dim dated = all.Where(Function(r) (agentId = 0 OrElse Js.Int(r, "agentId") = agentId) AndAlso (inside(Js.Time(r, "assignedAt")) OrElse inside(Js.Time(r, "deliveredAt")) OrElse inside(Js.Time(r, "finishedAt")) OrElse Fails(r).Any(Function(a) inside(Js.Time(a, "at"))))).ToList()
        Dim status = _status.Current
        Dim q = _search.Text.Trim().ToLowerInvariant()
        _rows = dated.Where(Function(r)
                                Dim st = Js.Str(r, "status")
                                Dim ok = status = "all" OrElse (status = "delivered" AndAlso st = "Delivered") OrElse (status = "canceled" AndAlso st = "Canceled") OrElse
                                         (status = "failed" AndAlso Fails(r).Count > 0) OrElse (status = "active" AndAlso (st = "In Progress" OrElse st = "Out for Delivery"))
                                Return ok AndAlso (q = "" OrElse (Js.Str(r, "number") & " " & Js.Str(r, "customer") & " " & Js.Str(r, "phone") & " " & Js.Str(r, "address") & " " & Js.Str(r, "agent")).ToLowerInvariant().Contains(q))
                            End Function).ToList()
        ' per agent (every agent listed, even with nothing in these dates)
        Dim rep As New Dictionary(Of String, JsonObject)
        Dim blank = Function(id As JsonNode, name As String) Js.Obj("id", id, "name", name, "assigned", 0, "delivered", 0, "failed", 0, "canceled", 0, "active", 0, "collected", 0.0, "cash", 0.0, "upi", 0.0, "other", 0.0, "mins", 0.0, "minsN", 0)
        For Each a In agents
            If agentId = 0 OrElse Js.Int(a, "id") = agentId Then rep(Js.Int(a, "id").ToString()) = blank(JsonValue.Create(Js.Int(a, "id")), Js.Str(a, "name"))
        Next
        For Each r In dated
            Dim key = If(Js.IsNull(r, "agentId"), "none", Js.Int(r, "agentId").ToString())
            If Not rep.ContainsKey(key) Then rep(key) = blank(If(key = "none", Nothing, JsonValue.Create(Js.Int(r, "agentId"))), Js.Str(r, "agent", "No agent"))
            Dim x = rep(key)
            If inside(Js.Time(r, "assignedAt")) Then x("assigned") = Js.Int(x, "assigned") + 1
            If Js.Str(r, "status") = "Delivered" AndAlso Js.Time(r, "deliveredAt").HasValue Then
                x("delivered") = Js.Int(x, "delivered") + 1
                If Not Js.IsNull(r, "minutes") Then x("mins") = Js.Num(x, "mins") + Js.Num(r, "minutes") : x("minsN") = Js.Int(x, "minsN") + 1
                For Each c In Js.Objs(Js.Arr(r, "collected"))
                    Dim amt = Js.Num(c, "amount")
                    x("collected") = Js.Num(x, "collected") + amt
                    Dim m = Js.Str(c, "method")
                    Dim k = If(m = "Cash", "cash", If(m = "UPI", "upi", "other"))
                    x(k) = Js.Num(x, k) + amt
                Next
            End If
            If Js.Str(r, "status") = "Canceled" Then x("canceled") = Js.Int(x, "canceled") + 1
            If Js.Str(r, "status") = "In Progress" OrElse Js.Str(r, "status") = "Out for Delivery" Then x("active") = Js.Int(x, "active") + 1
            x("failed") = Js.Int(x, "failed") + Fails(r).Count
        Next
        _report = rep.Values.OrderByDescending(Function(r) Js.Int(r, "delivered")).ThenBy(Function(r) Js.Str(r, "name")).ToList()
        Dim tot = Function(k As String) _report.Sum(Function(r) Js.Int(r, k))
        Dim collected = _report.Sum(Function(r) Js.Num(r, "collected"))

        Dim cards As New Columns(6, 150, 12)
        For Each c In {("all", "Handed to agents", Theme.IcTruck, Theme.Blue, tot("assigned").ToString()), ("delivered", "Delivered", Theme.IcDone, Color.FromArgb(5, &H96, &H69), tot("delivered").ToString()),
                       ("failed", "Failed attempts", ChrW(&HE7BA), Color.FromArgb(&HEA, &H58, &HC), tot("failed").ToString()), ("canceled", "Cancelled", Theme.IcBlock, Theme.Danger, tot("canceled").ToString()),
                       ("active", "Still out / waiting", ChrW(&HE806), Color.FromArgb(2, &H84, &HC7), tot("active").ToString()), ("", "Collected on delivery", Theme.IcMoney, Theme.Primary, Theme.Money(collected))}
            Dim m As New MiniStat(c.Item2, c.Item3, c.Item4) With {.Height = 84}
            m.SetValue(c.Item5)
            Dim key = c.Item1
            If key <> "" AndAlso _mode.Current = "history" Then
                m.Cursor = Cursors.Hand
                m.Selected = _status.Current = key
                AddHandler m.Click, Sub()
                                        _status.Current = key
                                        _status.Invalidate()
                                        Refresh_()
                                    End Sub
            End If
            cards.Add(m)
        Next
        Body.Add(cards)

        If _mode.Current = "report" Then
            Dim t As New WebTable() With {.RowHeight = 52, .EmptyText = "No delivery agents yet.", .Modern = True}
            t.Cols.Add(New TCol("Delivery agent", Function(r) Js.Str(r, "name"), 0, CellKind.Bold) With {.Flex = 16})
            For Each c In {("Assigned", "assigned", Theme.G800), ("Delivered", "delivered", Color.FromArgb(5, &H96, &H69)), ("Failed", "failed", Color.FromArgb(&HEA, &H58, &HC)), ("Cancelled", "canceled", Theme.Danger), ("Still out", "active", Color.FromArgb(2, &H84, &HC7))}
                Dim k = c.Item2, col = c.Item3
                t.Cols.Add(New TCol(c.Item1, Function(r) Js.Int(r, k).ToString(), 0) With {.Flex = 8, .Right = True, .Colour = Function(r) col})
            Next
            t.Cols.Add(New TCol("Collected", Function(r) Theme.Money(Js.Num(r, "collected")), 0, CellKind.Money) With {.Flex = 11, .Right = True})
            t.Cols.Add(New TCol("Cash / UPI / Other", Function(r) Theme.Money(Js.Num(r, "cash")) & " / " & Theme.Money(Js.Num(r, "upi")) & " / " & Theme.Money(Js.Num(r, "other")), 0) With {.Flex = 20, .Right = True, .Colour = Function(r) Theme.G600})
            t.Cols.Add(New TCol("Avg time", Function(r) If(Js.Int(r, "minsN") = 0, "—", Dur(JsonValue.Create(Math.Round(Js.Num(r, "mins") / Js.Int(r, "minsN"))))), 0) With {.Flex = 8, .Right = True})
            t.Cols.Add(New TCol("Success", Function(r)
                                               Dim f = Js.Int(r, "delivered") + Js.Int(r, "canceled")
                                               Return If(f = 0, "—", CInt(Js.Int(r, "delivered") / f * 100) & "%")
                                           End Function, 0) With {.Flex = 7, .Right = True})
            t.Cols.Add(New TCol("", Nothing, 70, CellKind.Actions) With {.ButtonsFor = Function(r) If(Js.IsNull(r, "id"), New String() {}, {"orders"})}.Btn("orders", ChrW(&HE8FD), "Their orders", Theme.Blue))
            t.Rows = _report
            AddHandler t.ActionClick, Sub(r, k)
                                          _mode.Current = "history"
                                          Ui.SetVal(_agent, Js.Int(r, "id").ToString())
                                          _mode.Invalidate()
                                          Refresh_()
                                          HeaderChanged()
                                      End Sub
            Dim card As New CardBox(Nothing, "", 12)
            card.Add(t)
            Body.Add(card)
        Else
            Dim card As New CardBox(Nothing, "", 12)
            Dim tools As New Panel With {.Height = 44, .BackColor = Color.White}
            tools.Controls.Add(_status)
            tools.Controls.Add(_search)
            AddHandler tools.Layout, Sub()
                                         _status.SetBounds(0, 0, Math.Max(200, tools.Width - 300), 42)
                                         _search.SetBounds(tools.Width - 280, 2, 280, 38)
                                     End Sub
            card.Add(tools)
            Dim badge = Function(r As JsonObject)
                            Select Case Js.Str(r, "status")
                                Case "Delivered" : Return "Delivered"
                                Case "Canceled" : Return "Cancelled"
                                Case "Out for Delivery" : Return "On the way"
                                Case Else : Return "Waiting"
                            End Select
                        End Function
            Dim t As New WebTable() With {.RowHeight = 64, .RowClickable = True, .EmptyText = "No deliveries match these filters.", .Modern = True}
            t.Cols.Add(New TCol("Order", Function(r) Js.Str(r, "number"), 0, CellKind.Link) With {.Flex = 10, .Colour = Function(r) Theme.Blue, .Sub = Function(r) Js.Int(r, "items") & " item" & If(Js.Int(r, "items") = 1, "", "s")})
            t.Cols.Add(New TCol("Customer", Function(r) Js.Str(r, "customer"), 0) With {.Flex = 18, .Sub = Function(r) String.Join(" · ", {Js.Str(r, "phone"), Js.Str(r, "address")}.Where(Function(x) x <> ""))})
            t.Cols.Add(New TCol("Delivery agent", Function(r) Js.Str(r, "agent", "—"), 0, CellKind.Bold) With {.Flex = 10})
            t.Cols.Add(New TCol("Status", Function(r) badge(r), 0, CellKind.Badge) With {.Flex = 11,
                .Colour = Function(r) If(badge(r) = "Delivered", Color.FromArgb(4, &H78, &H57), If(badge(r) = "Cancelled", Color.FromArgb(&HB9, &H1C, &H1C), If(badge(r) = "On the way", Color.FromArgb(3, &H69, &HA1), Fmt.AmberText)))})
            t.Cols.Add(New TCol("Handed over", Function(r) If(Js.Time(r, "assignedAt").HasValue, Fmt.Stamp(Js.Time(r, "assignedAt")), "—"), 0) With {.Flex = 12, .Colour = Function(r) Theme.G600})
            t.Cols.Add(New TCol("Finished", Function(r) If(Js.Time(r, "finishedAt").HasValue, Fmt.Stamp(Js.Time(r, "finishedAt")), "—"), 0) With {.Flex = 12, .Colour = Function(r) Theme.G600,
                .Sub = Function(r) If(Js.Str(r, "status") = "Canceled", Js.Str(r, "cancelReason"), "")})
            t.Cols.Add(New TCol("Time taken", Function(r) Dur(Js.Field(r, "minutes")), 0) With {.Flex = 9})
            t.Cols.Add(New TCol("Failed attempts", Function(r) If(Fails(r).Count = 0, "—", Fmt.Stamp(Js.Time(Fails(r).Last(), "at")) & " — " & Js.Str(Fails(r).Last(), "note")), 0) With {.Flex = 16,
                .Colour = Function(r) If(Fails(r).Count = 0, Theme.G300, Color.FromArgb(&HC2, &H41, &HC)), .Sub = Function(r) If(Fails(r).Count > 1, Fails(r).Count & " attempts", "")})
            t.Cols.Add(New TCol("Amount", Function(r) Theme.Money(Js.Num(r, "total")), 0, CellKind.Money) With {.Flex = 10, .Right = True,
                .Sub = Function(r) If(Js.Str(r, "paymentStatus") = "Paid", If(Js.Arr(r, "collected").Count = 0, "Paid", String.Join(" + ", Js.Objs(Js.Arr(r, "collected")).Select(Function(c) Js.Str(c, "method")))), "Not collected")})
            t.Rows = _rows
            AddHandler t.RowClick, Sub(r) Open(r)
            card.Add(t)
            Body.Add(card)
        End If
    End Sub

    Private Sub DoExport()
        If _mode.Current = "report" Then
            Export.Csv(Me, "Deliveries report", {"Agent", "Assigned", "Delivered", "Failed attempts", "Cancelled", "Still out", "Collected", "Cash", "UPI", "Other"},
                       _report.Select(Function(r) CType({Js.Str(r, "name"), CObj(Js.Int(r, "assigned")), CObj(Js.Int(r, "delivered")), CObj(Js.Int(r, "failed")), CObj(Js.Int(r, "canceled")), CObj(Js.Int(r, "active")),
                            CObj(Js.Num(r, "collected")), CObj(Js.Num(r, "cash")), CObj(Js.Num(r, "upi")), CObj(Js.Num(r, "other"))}, IEnumerable(Of Object))))
        Else
            Export.Csv(Me, "Deliveries history", {"Order", "Customer", "Phone", "Agent", "Status", "Assigned", "Finished", "Time (min)", "Failed attempts", "Amount", "Collected"},
                       _rows.Select(Function(r) CType({Js.Str(r, "number"), Js.Str(r, "customer"), Js.Str(r, "phone"), Js.Str(r, "agent"), Js.Str(r, "status"), Fmt.Stamp(Js.Time(r, "assignedAt")), Fmt.Stamp(Js.Time(r, "finishedAt")),
                            Js.Str(r, "minutes"), String.Join(" | ", Fails(r).Select(Function(a) Js.Str(a, "note"))), CObj(Js.Num(r, "total")), CObj(Js.Objs(Js.Arr(r, "collected")).Sum(Function(c) Js.Num(c, "amount")))}, IEnumerable(Of Object))))
        End If
    End Sub
End Class
