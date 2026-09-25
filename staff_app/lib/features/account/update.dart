import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../widgets/common.dart';

/// Opens the download for the new version (APK on Android, installer on Windows).
Future<void> openUpdate(BuildContext context, Map<String, dynamic> release) async {
  final url = (Platform.isAndroid ? release['android'] : release['windows']) as String? ?? release['page'] as String?;
  if (url == null) {
    toast(context, 'Ask your admin for the new version.');
    return;
  }
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) toast(context, 'Could not open the download link.', error: true);
}
