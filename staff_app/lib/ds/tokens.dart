import 'package:flutter/material.dart';

/// Desktop design system — one place for the sizes, colours and type of every
/// control in the Windows app. Same colours and identity as the website admin
/// (violet #7C3AED, Inter, gray scale), with compact desktop-software spacing.
class DS {
  // ── colours (website admin palette) ──
  static const primary = Color(0xFF7C3AED);
  static const primaryHover = Color(0xFF6D28D9);
  static const primaryPressed = Color(0xFF5B21B6);
  static const primarySoft = Color(0xFFF5F3FF);
  static const primaryTint = Color(0xFFEDE9FE);
  static const text = Color(0xFF111827);
  static const text2 = Color(0xFF374151);
  static const muted = Color(0xFF6B7280);
  static const faint = Color(0xFF9CA3AF);
  static const border = Color(0xFFD1D5DB); // control borders
  static const line = Color(0xFFE5E7EB); // card / table lines
  static const lineSoft = Color(0xFFF3F4F6);
  static const bg = Color(0xFFF9FAFB); // content area
  static const surface = Colors.white;
  static const hover = Color(0xFFF3F4F6);
  static const pressed = Color(0xFFE5E7EB);
  static const selected = Color(0xFFF5F3FF);
  static const danger = Color(0xFFDC2626);
  static const dangerHover = Color(0xFFB91C1C);
  static const success = Color(0xFF16A34A);
  static const successHover = Color(0xFF15803D);
  static const warning = Color(0xFFD97706);
  static const info = Color(0xFF2563EB);
  static const focusRing = Color(0x737C3AED); // primary @ 45%

  // ── sizes ──
  static const controlH = 32.0; // buttons, inputs, selects
  static const controlHSm = 28.0;
  static const rowH = 36.0; // table rows
  static const headerRowH = 34.0;
  static const menuItemH = 30.0; // dropdown / context menu items
  static const radius = 4.0; // controls
  static const radiusCard = 6.0; // cards, dialogs
  static const icon = 16.0;
  static const iconSm = 14.0;

  // ── spacing (4-pt grid) ──
  static const s1 = 4.0, s2 = 8.0, s3 = 12.0, s4 = 16.0, s5 = 20.0, s6 = 24.0;

  // ── type ──
  static const fBody = 13.0, fSmall = 12.0, fLabel = 12.5, fTitle = 14.0, fDialogTitle = 13.5, fPage = 20.0;
  static const body = TextStyle(fontSize: fBody, color: text, height: 1.35);
  static const small = TextStyle(fontSize: fSmall, color: muted, height: 1.3);
  static const label = TextStyle(fontSize: fLabel, color: text2, fontWeight: FontWeight.w500);
  static const cardTitle = TextStyle(fontSize: fTitle, color: text, fontWeight: FontWeight.w600);
  static const pageTitle = TextStyle(fontSize: fPage, color: text, fontWeight: FontWeight.w700, height: 1.2);
  static const tableHead = TextStyle(fontSize: fSmall, color: text2, fontWeight: FontWeight.w600);
  static const num = TextStyle(fontSize: fBody, color: text, fontFeatures: [FontFeature.tabularFigures()]);

  // ── elevation ──
  static const cardShadow = [BoxShadow(color: Color(0x0A000000), blurRadius: 2, offset: Offset(0, 1))];
  static const popupShadow = [
    BoxShadow(color: Color(0x1F000000), blurRadius: 16, offset: Offset(0, 6)),
    BoxShadow(color: Color(0x14000000), blurRadius: 3, offset: Offset(0, 1)),
  ];
  static const dialogShadow = [BoxShadow(color: Color(0x33000000), blurRadius: 32, offset: Offset(0, 12))];

  static const fast = Duration(milliseconds: 90);
  static const anim = Duration(milliseconds: 140);

  static BorderRadius get r => BorderRadius.circular(radius);
  static BorderRadius get rCard => BorderRadius.circular(radiusCard);
}
