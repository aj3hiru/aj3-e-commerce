import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/nav.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/mobile.dart';

/// Categories: product counts, add / rename / hide, change the picture.
class CategoriesScreen extends StatelessWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final cats = s.list('categories');
    final products = s.list('products');
    int count(Map c) => products.where((p) => toInt(p['categoryId']) == toInt(c['id']) && p['status'] == 'active').length;
    final wide = isWide(context);
    return Scaffold(
      appBar: AppBar(leading: menuButton(context), title: const Text('Categories'), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: SyncBadge(onTap: () => s.syncNow(force: true)))]),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => editCategory(context, null), icon: const Icon(Icons.add_rounded), label: const Text('Add category')),
      body: RefreshIndicator(
        onRefresh: () => s.syncNow(only: const ['categories', 'products']),
        child: cats.isEmpty
            ? ListView(children: const [SizedBox(height: 60), EmptyState(icon: Icons.category_outlined, title: 'No categories yet')])
            : GridView.builder(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: wide ? 300 : 220, mainAxisExtent: 196, crossAxisSpacing: 12, mainAxisSpacing: 12),
                itemCount: cats.length,
                itemBuilder: (c, i) {
                  final cat = cats[i];
                  final n = count(cat);
                  return AppCard(
                    padding: const EdgeInsets.all(12),
                    onTap: () => editCategory(context, cat),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(child: Center(child: NetImage(cat['image'], size: 86, radius: 16, placeholder: Icons.category_outlined))),
                      const SizedBox(height: 8),
                      Text('${cat['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Row(children: [
                        InkWell(
                          onTap: () => context.read<NavController>().go('products', {'category': toInt(cat['id'])}),
                          child: Text('$n product${n == 1 ? '' : 's'} ›', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 12.5)),
                        ),
                        const Spacer(),
                        if (cat['status'] != 'active') const StatusChip('Inactive'),
                      ]),
                    ]),
                  );
                },
              ),
      ),
    );
  }
}

/// Add (cat == null) or edit a category. Sends every field back (the website form replaces them all),
/// so SEO text and sort order made on the website are kept.
Future<void> editCategory(BuildContext context, Map<String, dynamic>? cat) async {
  final s = context.read<AppState>();
  final name = TextEditingController(text: cat?['name'] ?? '');
  var active = (cat?['status'] ?? 'active') == 'active';
  String? photo;
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => StatefulBuilder(
      builder: (d, set) => AlertDialog(
        title: Text(cat == null ? 'Add category' : 'Edit category'),
        content: SizedBox(
          width: 400,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () async {
                try {
                  final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1200, imageQuality: 88);
                  if (x != null) set(() => photo = x.path);
                } catch (_) {}
              },
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(width: 110, height: 110, child: photo != null ? Image.file(File(photo!), fit: BoxFit.cover) : NetImage(cat?['image'], size: 110, radius: 16, placeholder: Icons.add_photo_alternate_outlined)),
              ),
            ),
            const SizedBox(height: 6),
            const Text('Tap to choose a picture', style: TextStyle(color: AppColors.muted, fontSize: 12)),
            const SizedBox(height: 14),
            TextField(controller: name, autofocus: cat == null, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Category name *')),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Active (shown in the shop)'), value: active, onChanged: (v) => set(() => active = v)),
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Save'))],
      ),
    ),
  );
  if (ok != true || !context.mounted) return;
  if (name.text.trim().isEmpty) return toast(context, 'Enter the category name.', error: true);
  final fields = <String, String>{
    'name': name.text.trim(), 'status': active ? 'active' : 'inactive',
    if (cat != null) ...{
      'slug': '${cat['slug'] ?? ''}', 'serial': '${cat['serial'] ?? 0}',
      'meta_keywords': '${cat['metaKeywords'] ?? ''}', 'meta_description': '${cat['metaDescription'] ?? ''}',
    },
  };
  final r = await s.sendNow(OutboxItem(
    id: newId(), method: cat == null ? 'POST' : 'PUT', path: cat == null ? '/api/ecommerce/categories2' : '/api/ecommerce/categories2/${cat['id']}',
    multipart: true, fields: fields, files: {if (photo != null) 'image': photo!}, label: '${cat == null ? 'New' : 'Edit'} category: ${fields['name']}', refresh: const ['categories'],
  ));
  if (!context.mounted) return;
  if (r.outcome == ApiOutcome.rejected || r.outcome == ApiOutcome.forbidden) {
    toast(context, r.message, error: true);
  } else {
    toast(context, r.ok ? 'Saved.' : 'Saved offline — will sync when online.');
  }
}
