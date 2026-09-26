import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'common.dart';
import 'web.dart';

/// Windows: something opened on top (an invoice to print, a form…) comes up as a
/// window with its own title bar — title, maximise / restore and close — like a
/// normal desktop program. Phones get a full-screen page instead.
Future<T?> showAppWindow<T>(BuildContext context, {required String title, required Widget child, double width = 980, double height = 720, IconData icon = LucideIcons.appWindow}) {
  if (!isWide(context)) {
    return Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(title: Text(title)), body: child)));
  }
  return showDialog<T>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: false,
    barrierColor: Colors.black26,
    builder: (_) => _AppWindow(title: title, width: width, height: height, icon: icon, child: child),
  );
}

class _AppWindow extends StatefulWidget {
  final String title;
  final Widget child;
  final double width, height;
  final IconData icon;
  const _AppWindow({required this.title, required this.child, required this.width, required this.height, required this.icon});
  @override
  State<_AppWindow> createState() => _AppWindowState();
}

class _AppWindowState extends State<_AppWindow> {
  bool _max = false;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final w = _max ? size.width : widget.width.clamp(360.0, size.width - 40);
    final h = _max ? size.height : widget.height.clamp(300.0, size.height - 40);
    Widget btn(IconData i, String tip, VoidCallback onTap, {bool close = false}) => Tooltip(
          message: tip,
          child: InkWell(
            onTap: onTap,
            hoverColor: close ? const Color(0xFFE81123) : W.g200,
            child: SizedBox(width: 46, height: 34, child: Icon(i, size: 15, color: W.g700)),
          ),
        );
    return Dialog(
      insetPadding: _max ? EdgeInsets.zero : const EdgeInsets.all(20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_max ? 0 : 8), side: const BorderSide(color: Color(0x33000000))),
      clipBehavior: Clip.antiAlias,
      backgroundColor: Colors.white,
      child: SizedBox(
        width: w,
        height: h,
        child: Column(children: [
          // Title bar
          GestureDetector(
            onDoubleTap: () => setState(() => _max = !_max),
            child: Container(
              height: 34,
              color: const Color(0xFFF3F3F3),
              child: Row(children: [
                const SizedBox(width: 12),
                Icon(widget.icon, size: 15, color: W.primary),
                const SizedBox(width: 10),
                Expanded(child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g800))),
                btn(_max ? LucideIcons.copy : LucideIcons.square, _max ? 'Restore' : 'Maximise', () => setState(() => _max = !_max)),
                btn(LucideIcons.x, 'Close', () => Navigator.of(context).pop(), close: true),
              ]),
            ),
          ),
          const Divider(height: 1, color: W.g200),
          Expanded(child: widget.child),
        ]),
      ),
    );
  }
}
