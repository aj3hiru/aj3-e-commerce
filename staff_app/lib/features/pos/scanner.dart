import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Camera barcode scanner (Android). Returns the first code seen.
/// On Windows a USB barcode scanner simply types into the search box instead.
class ScannerScreen extends StatefulWidget {
  final String title;
  const ScannerScreen({super.key, this.title = 'Scan barcode'});
  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final _controller = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black, foregroundColor: Colors.white, title: Text(widget.title, style: const TextStyle(color: Colors.white)),
          actions: [IconButton(icon: const Icon(Icons.flashlight_on_rounded), onPressed: () => _controller.toggleTorch())],
        ),
        body: Stack(children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              final code = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
              if (code == null || _done) return;
              _done = true;
              Navigator.pop(context, code);
            },
          ),
          Center(
            child: Container(
              width: 260, height: 160,
              decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 2.5), borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const Positioned(left: 0, right: 0, bottom: 40, child: Text('Point the camera at the barcode', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 15))),
        ]),
      );
}
