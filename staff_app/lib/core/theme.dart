import 'package:flutter/material.dart';

/// Colours and type — the same violet as the admin panel, Inter everywhere.
class AppColors {
  /// Phone app: warm orange (delivery-app style). Windows app: the website admin's violet.
  static bool mobile = false;
  static Color primary = const Color(0xFF7C3AED);
  static Color primaryDark = const Color(0xFF6D28D9);
  static Color primarySoft = const Color(0xFFF3EEFF);
  static Color bg = const Color(0xFFF4F5FB);
  static LinearGradient heroGradient = const LinearGradient(colors: [Color(0xFF6D28D9), Color(0xFF4F46E5)], begin: Alignment.topLeft, end: Alignment.bottomRight);

  static void useMobileStyle(bool on) {
    mobile = on;
    if (on) {
      primary = const Color(0xFFFF7A1A);
      primaryDark = const Color(0xFFE8650A);
      primarySoft = const Color(0xFFFFF1E6);
      bg = const Color(0xFFF7F7FA);
      heroGradient = const LinearGradient(colors: [Color(0xFFFF8A2B), Color(0xFFFF6A00)], begin: Alignment.topLeft, end: Alignment.bottomRight);
    } else {
      primary = const Color(0xFF7C3AED);
      primaryDark = const Color(0xFF6D28D9);
      primarySoft = const Color(0xFFF3EEFF);
      bg = const Color(0xFFF4F5FB);
      heroGradient = const LinearGradient(colors: [Color(0xFF6D28D9), Color(0xFF4F46E5)], begin: Alignment.topLeft, end: Alignment.bottomRight);
    }
  }

  // Soft tile colours (mobile dashboard).
  static const mint = Color(0xFFE7F7F1);
  static const cream = Color(0xFFFFF7E3);
  static const blush = Color(0xFFFDEBEF);
  static const sky = Color(0xFFEAF2FD);
  static const lilac = Color(0xFFF1EEFD);
  static const indigo = Color(0xFF4F46E5);
  static const pink = Color(0xFFDB2777);
  static const pinkSoft = Color(0xFFFDEBF4);
  static const shadow = [BoxShadow(color: Color(0x0A1B1B3A), blurRadius: 12, offset: Offset(0, 4)), BoxShadow(color: Color(0x05000000), blurRadius: 2, offset: Offset(0, 1))];
  static const card = Colors.white;
  static const border = Color(0xFFE9EAF2);
  static const text = Color(0xFF111827);
  static const muted = Color(0xFF6B7280);
  static const faint = Color(0xFF9CA3AF);
  static const green = Color(0xFF16A34A);
  static const greenSoft = Color(0xFFE8F8EE);
  static const red = Color(0xFFDC2626);
  static const redSoft = Color(0xFFFDECEC);
  static const amber = Color(0xFFD97706);
  static const amberSoft = Color(0xFFFFF4DE);
  static const blue = Color(0xFF2563EB);
  static const blueSoft = Color(0xFFEAF1FF);
  static const cyan = Color(0xFF0891B2);
  static const cyanSoft = Color(0xFFE6F7FB);
}

ThemeData buildTheme() => AppColors.mobile ? _mobileTheme() : _desktopTheme();

ThemeData _mobileTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.primary, primary: AppColors.primary, surface: AppColors.card, brightness: Brightness.light);
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: 'Inter', scaffoldBackgroundColor: AppColors.bg);
  const radius = BorderRadius.all(Radius.circular(10));
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: AppColors.text, displayColor: AppColors.text),
    appBarTheme: const AppBarTheme(backgroundColor: Colors.white, foregroundColor: AppColors.text, elevation: 0, scrolledUnderElevation: 0.5, centerTitle: false,
        titleTextStyle: TextStyle(fontFamily: 'Inter', fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
    cardTheme: const CardThemeData(color: Colors.white, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(12)), side: BorderSide(color: AppColors.border))),
    dividerTheme: const DividerThemeData(color: AppColors.border, space: 1, thickness: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Colors.white, isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: const OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.border)),
      enabledBorder: const OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.primary, width: 1.6)),
      errorBorder: const OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.red)),
      labelStyle: const TextStyle(color: AppColors.muted), hintStyle: const TextStyle(color: AppColors.faint),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(0, 46), shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600, fontSize: 15))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46), shape: const RoundedRectangleBorder(borderRadius: radius),
        side: const BorderSide(color: AppColors.border), foregroundColor: AppColors.text, textStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600))),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: AppColors.primary, textStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600))),
    chipTheme: base.chipTheme.copyWith(shape: const StadiumBorder(side: BorderSide(color: AppColors.border)), backgroundColor: Colors.white, selectedColor: AppColors.primarySoft,
        labelStyle: const TextStyle(fontFamily: 'Inter', fontSize: 13, color: AppColors.text)),
    navigationBarTheme: NavigationBarThemeData(backgroundColor: Colors.white, indicatorColor: AppColors.primarySoft, height: 66,
        labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontFamily: 'Inter', fontSize: 11.5, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: s.contains(WidgetState.selected) ? AppColors.primary : AppColors.muted))),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: AppColors.primary, foregroundColor: Colors.white, elevation: 3, focusElevation: 3, hoverElevation: 5, highlightElevation: 4,
      shape: StadiumBorder(), extendedTextStyle: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700, fontSize: 14.5),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: radius)),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Colors.white, showDragHandle: true, shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18)))),
    dialogTheme: const DialogThemeData(backgroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(14)))),
  );
}


/// Windows: the Material parts that remain (date pickers, menus, snack bars, remaining
/// Material fields) follow the desktop design system — compact, 4–6 px corners,
/// Windows programs switch screens and open dialogs at once — no Android-style slide/fade.
class _Instant extends PageTransitionsBuilder {
  const _Instant();
  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) => child;
}

/// Inter 13, visible scrollbars, quick tooltips. Windows feel: no click ripple, instant page changes.
ThemeData _desktopTheme() {
  const primary = Color(0xFF7C3AED);
  final scheme = ColorScheme.fromSeed(seedColor: primary, primary: primary, surface: Colors.white, brightness: Brightness.light);
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: 'Inter', scaffoldBackgroundColor: const Color(0xFFF9FAFB), visualDensity: VisualDensity.compact);
  const r4 = BorderRadius.all(Radius.circular(4));
  OutlineInputBorder b(Color c, [double w = 1]) => OutlineInputBorder(borderRadius: r4, borderSide: BorderSide(color: c, width: w));
  const btnText = TextStyle(fontFamily: 'Inter', fontSize: 13, fontWeight: FontWeight.w600);
  const btnShape = RoundedRectangleBorder(borderRadius: r4);
  return base.copyWith(
    splashFactory: NoSplash.splashFactory,
    highlightColor: const Color(0x0F111827),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.windows: _Instant(), TargetPlatform.macOS: _Instant(), TargetPlatform.linux: _Instant(),
      TargetPlatform.android: _Instant(), TargetPlatform.iOS: _Instant(), TargetPlatform.fuchsia: _Instant(),
    }),
    textTheme: () {
      final t = base.textTheme.apply(fontFamily: 'Inter', bodyColor: const Color(0xFF111827), displayColor: const Color(0xFF111827));
      return t.copyWith(
        bodyMedium: t.bodyMedium!.copyWith(fontSize: 13),
        bodyLarge: t.bodyLarge!.copyWith(fontSize: 13.5),
        titleMedium: t.titleMedium!.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      );
    }(),
    appBarTheme: const AppBarTheme(backgroundColor: Colors.white, foregroundColor: Color(0xFF111827), elevation: 0, scrolledUnderElevation: 0, centerTitle: false, toolbarHeight: 52,
        shape: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))), titleTextStyle: TextStyle(fontFamily: 'Inter', fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
    cardTheme: const CardThemeData(color: Colors.white, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(6)), side: BorderSide(color: Color(0xFFE5E7EB)))),
    dividerTheme: const DividerThemeData(color: Color(0xFFE5E7EB), space: 1, thickness: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Colors.white, isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      border: b(const Color(0xFFD1D5DB)), enabledBorder: b(const Color(0xFFD1D5DB)), focusedBorder: b(primary, 1.5), errorBorder: b(const Color(0xFFDC2626)),
      labelStyle: const TextStyle(color: Color(0xFF6B7280), fontSize: 13), hintStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 13),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 12), shape: btnShape, textStyle: btnText)),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 12), shape: btnShape,
        side: const BorderSide(color: Color(0xFFD1D5DB)), foregroundColor: const Color(0xFF374151), textStyle: btnText)),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 10), shape: btnShape, foregroundColor: primary, textStyle: btnText)),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(32, 32), iconSize: 18, shape: btnShape)),
    chipTheme: base.chipTheme.copyWith(shape: const RoundedRectangleBorder(borderRadius: r4, side: BorderSide(color: Color(0xFFD1D5DB))), backgroundColor: Colors.white,
        selectedColor: const Color(0xFFF5F3FF), labelStyle: const TextStyle(fontFamily: 'Inter', fontSize: 12.5, color: Color(0xFF374151)), padding: const EdgeInsets.symmetric(horizontal: 6)),
    popupMenuTheme: const PopupMenuThemeData(color: Colors.white, elevation: 6, surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: r4, side: BorderSide(color: Color(0xFFE5E7EB))), textStyle: TextStyle(fontFamily: 'Inter', fontSize: 13, color: Color(0xFF111827))),
    menuTheme: const MenuThemeData(style: MenuStyle(backgroundColor: WidgetStatePropertyAll(Colors.white), elevation: WidgetStatePropertyAll(6),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: r4, side: BorderSide(color: Color(0xFFE5E7EB)))))),
    tooltipTheme: const TooltipThemeData(waitDuration: Duration(milliseconds: 500), textStyle: TextStyle(fontFamily: 'Inter', fontSize: 12, color: Colors.white),
        padding: EdgeInsets.symmetric(horizontal: 8, vertical: 5), decoration: BoxDecoration(color: Color(0xE6111827), borderRadius: r4)),
    scrollbarTheme: const ScrollbarThemeData(thumbVisibility: WidgetStatePropertyAll(true), thickness: WidgetStatePropertyAll(8), radius: Radius.circular(4),
        thumbColor: WidgetStatePropertyAll(Color(0x40111827))),
    listTileTheme: const ListTileThemeData(dense: true, contentPadding: EdgeInsets.symmetric(horizontal: 10), minVerticalPadding: 4, horizontalTitleGap: 10,
        shape: RoundedRectangleBorder(borderRadius: r4)),
    checkboxTheme: CheckboxThemeData(shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(3))), visualDensity: VisualDensity.compact),
    switchTheme: const SwitchThemeData(materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
    dialogTheme: const DialogThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(6))),
        titleTextStyle: TextStyle(fontFamily: 'Inter', fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
    datePickerTheme: const DatePickerThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(6))), backgroundColor: Colors.white, surfaceTintColor: Colors.transparent),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(6)))),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Colors.white, showDragHandle: false, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(6)))),
    segmentedButtonTheme: SegmentedButtonThemeData(style: SegmentedButton.styleFrom(visualDensity: VisualDensity.compact, textStyle: const TextStyle(fontSize: 12.5), shape: btnShape)),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: primary),
  );
}
