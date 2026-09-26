import 'package:flutter/material.dart';

/// Colours and type — the same violet as the admin panel, Inter everywhere.
class AppColors {
  static const primary = Color(0xFF7C3AED);
  static const primaryDark = Color(0xFF6D28D9);
  static const primarySoft = Color(0xFFF3EEFF);
  static const bg = Color(0xFFF4F5FB);
  static const indigo = Color(0xFF4F46E5);
  static const heroGradient = LinearGradient(colors: [Color(0xFF6D28D9), Color(0xFF4F46E5)], begin: Alignment.topLeft, end: Alignment.bottomRight);
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

ThemeData buildTheme() {
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
      focusedBorder: const OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.primary, width: 1.6)),
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
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.primary, foregroundColor: Colors.white, elevation: 3, focusElevation: 3, hoverElevation: 5, highlightElevation: 4,
      shape: StadiumBorder(), extendedTextStyle: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700, fontSize: 14.5),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: radius)),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Colors.white, showDragHandle: true, shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18)))),
    dialogTheme: const DialogThemeData(backgroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(14)))),
  );
}
