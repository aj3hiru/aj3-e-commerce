import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/barcode.dart';

/// What happened with one scanned code (shown on the camera screen in multi-scan).
class ScanResult {
  final bool ok;
  final String message;
  const ScanResult(this.ok, this.message);
}

/// Camera barcode scanner (Android).
/// - Single scan: returns the first confirmed code.
/// - Multi scan ([onCode] given): the camera stays open; every product you scan is
///   handled at once (added to the bill, counted…) until you tap Done.
/// A code is accepted only after it is read the same way twice in a row, which
/// stops half-read barcodes from turning into "no product with this barcode".
/// On Windows a USB barcode scanner simply types into the search box instead.
class ScannerScreen extends StatefulWidget {
  final String title;
  final Future<ScanResult> Function(String code)? onCode;
  const ScannerScreen({super.key, this.title = 'Scan barcode', this.onCode});
  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    detectionTimeoutMs: 150,
    formats: const [
      BarcodeFormat.ean13, BarcodeFormat.ean8, BarcodeFormat.upcA, BarcodeFormat.upcE, BarcodeFormat.code128, BarcodeFormat.code39,
      BarcodeFormat.code93, BarcodeFormat.itf14, BarcodeFormat.codabar, BarcodeFormat.qrCode, BarcodeFormat.dataMatrix,
    ],
    autoZoom: true,
  );
  String? _candidate; // last raw read, waiting for a second identical read
  DateTime _candidateAt = DateTime(2000);
  final Map<String, DateTime> _recent = {}; // accepted codes → when (ignore the same code for a moment)
  bool _done = false, _busy = false;
  ScanResult? _last;
  int _count = 0;
  Timer? _hide;

  bool get _multi => widget.onCode != null;

  @override
  void dispose() {
    _hide?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _detect(BarcodeCapture capture) async {
    if (_done || _busy) return;
    final b = capture.barcodes.where((x) => (x.rawValue ?? '').trim().isNotEmpty).firstOrNull;
    if (b == null) return;
    final code = cleanCode(b.rawValue!);
    final now = DateTime.now();
    // 2D codes carry a checksum per block and are read reliably; 1D codes need two equal reads.
    final twoD = b.format == BarcodeFormat.qrCode || b.format == BarcodeFormat.dataMatrix;
    if (!twoD && (_candidate != code || now.difference(_candidateAt) > const Duration(milliseconds: 1500))) {
      _candidate = code;
      _candidateAt = now;
      return;
    }
    _candidate = null;
    final seen = _recent[code];
    if (seen != null && now.difference(seen) < const Duration(milliseconds: 1600)) return;
    _recent[code] = now;
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
    if (!_multi) {
      _done = true;
      Navigator.pop(context, code);
      return;
    }
    _busy = true;
    final r = await widget.onCode!(code);
    if (!mounted) return;
    if (!r.ok) HapticFeedback.heavyImpact();
    _hide?.cancel();
    setState(() {
      _busy = false;
      _last = r;
      if (r.ok) _count++;
    });
    _hide = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _last = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final window = Rect.fromCenter(center: Offset(size.width / 2, size.height * .38), width: size.width * .82, height: 190);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title, style: const TextStyle(color: Colors.white)),
        actions: [
          IconButton(tooltip: 'Torch', icon: const Icon(Icons.flashlight_on_rounded), onPressed: () => _controller.toggleTorch()),
          IconButton(tooltip: 'Switch camera', icon: const Icon(Icons.cameraswitch_rounded), onPressed: () => _controller.switchCamera()),
        ],
      ),
      body: Stack(children: [
        MobileScanner(
          controller: _controller,
          scanWindow: window,
          onDetect: _detect,
          errorBuilder: (c, e) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                e.errorCode == MobileScannerErrorCode.permissionDenied ? 'Allow camera access for this app in Settings to scan barcodes.' : 'The camera could not start (${e.errorCode.name}).',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 15),
              ),
            ),
          ),
        ),
        // Dim everything outside the scan window.
        IgnorePointer(child: CustomPaint(size: Size.infinite, painter: _Frame(window))),
        Positioned(
          left: 0,
          right: 0,
          top: window.bottom + 18,
          child: Text(_multi ? 'Scan one item after another — each one is added at once' : 'Hold the barcode inside the box', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15)),
        ),
        if (_last != null)
          Positioned(
            left: 16,
            right: 16,
            top: 16,
            child: Material(
              color: _last!.ok ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
              borderRadius: BorderRadius.circular(14),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Icon(_last!.ok ? Icons.check_circle_rounded : Icons.error_rounded, color: Colors.white),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_last!.message, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600))),
                ]),
              ),
            ),
          ),
        if (_multi)
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: SafeArea(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 54), backgroundColor: Colors.white, foregroundColor: Colors.black),
                onPressed: () {
                  _done = true;
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.check_rounded),
                label: Text(_count == 0 ? 'Done' : 'Done · $_count scanned', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
      ]),
    );
  }
}

class _Frame extends CustomPainter {
  final Rect window;
  _Frame(this.window);
  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(window, const Radius.circular(16));
    canvas.drawPath(Path.combine(PathOperation.difference, Path()..addRect(Offset.zero & size), Path()..addRRect(r)), Paint()..color = const Color(0x99000000));
    canvas.drawRRect(r, Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5);
    canvas.drawLine(Offset(window.left + 20, window.center.dy), Offset(window.right - 20, window.center.dy), Paint()
      ..color = const Color(0xCCFF3B30)
      ..strokeWidth = 2);
  }

  @override
  bool shouldRepaint(covariant _Frame old) => old.window != window;
}
