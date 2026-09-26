import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_state.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';
import '../../widgets/web.dart';

/// A website admin page shown inside the app, already signed in (one-time code →
/// admin cookie) and without the website's own sidebar — the app's menu is used.
/// Every option on the page works exactly as on the website. Needs the internet.
class WebPageScreen extends StatefulWidget {
  final String path; // website path, e.g. /admin/ecommerce/brands
  final String title;
  final bool section; // opened from the menu (☰ on phones) rather than pushed (back arrow)
  final bool bare; // no app bar at all (inside a desktop window)
  const WebPageScreen({super.key, required this.path, required this.title, this.section = false, this.bare = false});
  @override
  State<WebPageScreen> createState() => _WebPageScreenState();
}

class _WebPageScreenState extends State<WebPageScreen> {
  InAppWebViewController? _web;
  String? _url;
  String? _error;
  double _progress = 0;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    final s = context.read<AppState>();
    setState(() {
      _error = null;
      _url = null;
    });
    final r = await s.api.send('POST', '/api/app/v1/web-code');
    if (!mounted) return;
    if (!r.ok) {
      setState(() => _error = r.outcome == ApiOutcome.offline ? 'This page opens from the website — connect to the internet and try again.' : r.message);
      return;
    }
    final next = Uri.encodeQueryComponent(widget.path);
    setState(() => _url = '${s.api.server}/api/app/v1/web-login?code=${Uri.encodeQueryComponent('${r.data['code']}')}&next=$next');
  }

  bool _ours(Uri? u) {
    if (u == null) return true;
    if (u.scheme == 'about' || u.scheme == 'blob' || u.scheme == 'data' || u.scheme == 'javascript') return true;
    final server = Uri.tryParse(context.read<AppState>().api.server);
    if (server == null) return true;
    // Same site (admin / login hosts share the base domain) stays inside; anything else opens outside.
    final base = server.host.split('.').skip(1).join('.');
    return u.host == server.host || (base.isNotEmpty && u.host.endsWith(base) && !u.host.startsWith('www.') && u.host != base);
  }

  @override
  Widget build(BuildContext context) {
    final body = Column(children: [
      if (_url != null && _progress < 1) LinearProgressIndicator(value: _progress == 0 ? null : _progress, minHeight: 2.5),
      Expanded(
        child: _error != null
            ? EmptyState(icon: Icons.cloud_off_rounded, title: 'Could not open ${widget.title}', message: _error, action: FilledButton(onPressed: _open, child: const Text('Try again')))
            : _url == null
                ? const Center(child: CircularProgressIndicator())
                : InAppWebView(
                    initialUrlRequest: URLRequest(url: WebUri(_url!)),
                    initialSettings: InAppWebViewSettings(
                      javaScriptEnabled: true,
                      useShouldOverrideUrlLoading: true,
                      supportZoom: false,
                      transparentBackground: false,
                      useOnDownloadStart: true,
                      allowFileAccessFromFileURLs: false,
                      mediaPlaybackRequiresUserGesture: true,
                    ),
                    onWebViewCreated: (c) => _web = c,
                    onProgressChanged: (c, p) => setState(() => _progress = p / 100),
                    shouldOverrideUrlLoading: (c, a) async {
                      final u = a.request.url;
                      if (u != null && (u.scheme == 'tel' || u.scheme == 'mailto' || u.scheme == 'whatsapp' || u.host == 'wa.me' || u.host.contains('google.') && u.path.contains('/maps'))) {
                        await launchUrl(u, mode: LaunchMode.externalApplication);
                        return NavigationActionPolicy.CANCEL;
                      }
                      if (!_ours(u)) {
                        await launchUrl(u!, mode: LaunchMode.externalApplication);
                        return NavigationActionPolicy.CANCEL;
                      }
                      return NavigationActionPolicy.ALLOW;
                    },
                    onDownloadStartRequest: (c, req) async {
                      if (req.url.scheme.startsWith('http')) await launchUrl(req.url, mode: LaunchMode.externalApplication);
                    },
                    // Android: the page's Print button → Android's print screen (printer or PDF).
                    // Windows uses Edge's own print dialog, so nothing to do there.
                    onPrintRequest: Platform.isAndroid
                        ? (c, url, job) async {
                            await c.printCurrentPage();
                            return true;
                          }
                        : null,
                    onReceivedError: (c, req, err) {
                      if (req.isForMainFrame == true) setState(() => _error = 'The page could not load (${err.description}).');
                    },
                  ),
      ),
    ]);

    if (widget.bare) return body;
    final wide = isWide(context);
    final actions = [
      IconButton(tooltip: 'Reload', icon: const Icon(LucideIcons.refreshCw, size: 19), onPressed: () => _web == null ? _open() : _web!.reload()),
      IconButton(
        tooltip: 'Open in browser',
        icon: const Icon(LucideIcons.externalLink, size: 19),
        onPressed: () => launchUrl(Uri.parse('${context.read<AppState>().api.server}${widget.path}'), mode: LaunchMode.externalApplication),
      ),
    ];
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (_web != null && await _web!.canGoBack()) {
          await _web!.goBack();
        } else if (context.mounted && Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: wide ? W.g50 : AppColors.bg,
        // Desktop: the website page brings its own header (title and buttons), so only a thin bar.
        appBar: wide
            ? PreferredSize(
                preferredSize: const Size.fromHeight(40),
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: W.g200))),
                  child: Row(children: [
                    if (!widget.section && Navigator.of(context).canPop()) IconButton(iconSize: 18, tooltip: 'Back', icon: const Icon(LucideIcons.arrowLeft), onPressed: () => Navigator.of(context).maybePop()),
                    IconButton(iconSize: 18, tooltip: 'Previous page', icon: const Icon(LucideIcons.chevronLeft), onPressed: () async {
                      if (_web != null && await _web!.canGoBack()) await _web!.goBack();
                    }),
                    const SizedBox(width: 6),
                    Expanded(child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, color: W.g500, fontWeight: FontWeight.w500))),
                    ...actions,
                  ]),
                ),
              )
            : AppBar(leading: widget.section ? menuButton(context) : null, title: Text(widget.title), actions: actions),
        body: body,
      ),
    );
  }
}
