import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_state.dart';
import '../core/display_defs.dart';
import '../core/format.dart';
import '../ds/adaptive.dart';
import '../ds/dialog.dart';
import '../ds/display_options.dart';
import '../ds/field.dart';
import '../features/native/kit.dart';
import '../features/reports/report_export.dart';
import '../widgets/common.dart';
import '../widgets/web.dart';
import 'list_kit.dart';

List<Map<String, dynamic>> _rows(dynamic v) => ((v as List?) ?? const []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

String _bytes(num? b) {
  if (b == null) return 'Missing';
  if (b < 1024) return '$b B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
  if (b < 1024 * 1024 * 1024) return '${(b / 1024 / 1024).toStringAsFixed(1)} MB';
  return '${(b / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}

/* ───────────────────────── Static pages ───────────────────────── */

/// "Pages" as on the website: 3 numbers, All / Published / Draft tabs, search, and the table
/// (title, link, status, last updated, actions: edit / view / delete); the editor with slug,
/// status and SEO. Offline edits show at once and are sent later.
class StaticPagesWeb extends StatelessWidget {
  const StaticPagesWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'pages', builder: (context, data, reload) => _Pages(rows: _rows(data), reload: reload));
}

class _Pages extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _Pages({required this.rows, required this.reload});
  @override
  State<_Pages> createState() => _PagesState();
}

class _PagesState extends State<_Pages> {
  static final _def = displayDefs['ecom_pages_display']!;
  final _prefs = DisplayPrefs(_def.key);
  static final _edPrefs = DisplayPrefs(displayDefs['ecom_page_editor_display']!.key);
  String _q = '', _tab = 'all';

  String get _site {
    final u = Uri.parse(context.read<AppState>().api.server);
    return u.replace(host: u.host.replaceFirst('admin.', '')).origin;
  }

  Future<void> _edit(Map<String, dynamic>? p) async {
    final title = TextEditingController(text: p?['title'] ?? ''), slug = TextEditingController(text: p?['slug'] ?? ''), content = TextEditingController(text: p?['content'] ?? '');
    final metaTitle = TextEditingController(text: p?['metaTitle'] ?? ''), metaDesc = TextEditingController(text: p?['metaDescription'] ?? '');
    var status = '${p?['status'] ?? 'published'}';
    final ok = await showAppDialog<bool>(
      context,
      title: p == null ? 'New Page' : 'Edit Page',
      icon: LucideIcons.fileText,
      width: 820,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(flex: 3, child: DTextField(controller: title, label: 'Title', required: true, autofocus: true)),
            if (_edPrefs.on('pe-form', 'pe-slug')) ...[const SizedBox(width: 12), Expanded(flex: 2, child: DTextField(controller: slug, label: 'Link (slug)', labelHint: 'blank = from title', prefixText: '/'))],
            if (_edPrefs.on('pe-form', 'pe-status')) ...[const SizedBox(width: 12), SizedBox(width: 150, child: WebSelect<String>(label: 'Status', value: status, options: const [('published', 'Published'), ('draft', 'Draft')], onChanged: (v) => set(() => status = v)))],
          ]),
          const SizedBox(height: 12),
          DTextField(controller: content, label: 'Content', labelHint: 'text or HTML', maxLines: 16, minLines: 12),
          if (_edPrefs.on('pe-form', 'pe-seo')) ...[
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: DTextField(controller: metaTitle, label: 'Meta title', labelHint: 'SEO')),
              const SizedBox(width: 12),
              Expanded(flex: 2, child: DTextField(controller: metaDesc, label: 'Meta description', labelHint: 'SEO')),
            ]),
          ],
        ]),
      ),
      actions: [
        const DAction.cancel(),
        DAction(p == null ? 'Create Page' : 'Save Changes', primary: true, onPressed: () async {
          if (title.text.trim().isEmpty) return toast(context, 'Give the page a title.', error: true);
          popDialog(context, true);
        }),
      ],
    );
    if (ok != true || !mounted) return;
    final body = {'title': title.text.trim(), 'content': content.text, 'status': status, 'slug': slug.text.trim(), 'metaTitle': metaTitle.text.trim(), 'metaDescription': metaDesc.text.trim()};
    await nativeSend(
      context,
      OutboxItem(
        id: newId(), method: p == null ? 'POST' : 'PATCH', path: p == null ? '/api/pages' : '/api/pages/${p['id']}', label: 'Page ${title.text.trim()}', body: body,
        effect: p == null
            ? {'kind': 'page_row_new', 'page': 'pages', 'row': {...body, 'id': -DateTime.now().millisecondsSinceEpoch, 'localRef': newId(), 'updatedAt': DateTime.now().toUtc().toIso8601String()}}
            : {'kind': 'page_row', 'page': 'pages', 'id': p['id'], 'fields': {...body, 'updatedAt': DateTime.now().toUtc().toIso8601String()}},
      ),
      reload: widget.reload,
      done: p == null ? 'Page created.' : 'Page saved.',
    );
  }

  Future<void> _delete(Map p) async {
    if (!await confirm(context, 'Delete “${p['title']}”?', 'The page disappears from the shop.', ok: 'Delete', danger: true) || !mounted) return;
    await nativeSend(context, OutboxItem(id: newId(), method: 'DELETE', path: '/api/pages/${p['id']}', label: 'Delete page ${p['title']}', effect: {'kind': 'page_row_delete', 'page': 'pages', 'ids': [p['id']]}), reload: widget.reload, done: 'Page deleted.');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final on = _prefs.on;
    final all = widget.rows;
    final pub = all.where((p) => p['status'] == 'published').length;
    final q = _q.trim().toLowerCase();
    final list = all.where((p) => (_tab == 'all' || p['status'] == _tab) && (q.isEmpty || '${p['title']} ${p['slug']}'.toLowerCase().contains(q))).toList();
    bool col(String k) => on('pg-table', k);
    return WebPage(
      title: 'Pages',
      subtitle: 'About us, policies and other pages of the shop',
      onRefresh: widget.reload,
      actions: [DisplayOptionsButton(_def), WebButton('New Page', icon: LucideIcons.plus, color: const Color(0xFF2563EB), onPressed: () => _edit(null))],
      children: [
        ...webCardsRow(columns: 3, [
          if (on('pg-stats', 'pg-k-total')) WebMetric(icon: LucideIcons.files, color: const Color(0xFF7C3AED), value: '${all.length}', label: 'All pages', selected: _tab == 'all', onTap: () => setState(() => _tab = 'all')),
          if (on('pg-stats', 'pg-k-published')) WebMetric(icon: LucideIcons.globe, color: const Color(0xFF059669), value: '$pub', label: 'Published', selected: _tab == 'published', onTap: () => setState(() => _tab = 'published')),
          if (on('pg-stats', 'pg-k-draft')) WebMetric(icon: LucideIcons.fileClock, color: const Color(0xFFD97706), value: '${all.length - pub}', label: 'Drafts', selected: _tab == 'draft', onTap: () => setState(() => _tab = 'draft')),
        ]),
        if (on('pg-table')) ...[
          if (col('pg-t-tabs')) ...[
            DSegmented<String>(options: [('all', 'All (${all.length})'), ('published', 'Published ($pub)'), ('draft', 'Draft (${all.length - pub})')], value: _tab, onChanged: (v) => setState(() => _tab = v)),
            const SizedBox(height: 10),
          ],
          WebList(
            rows: list,
            total: all.length,
            search: col('pg-t-search') ? WebSearch(width: 240, hint: 'Search pages…', onChanged: (v) => setState(() => _q = v)) : null,
            empty: 'No pages yet.',
            onTap: _edit,
            cols: [
              if (col('pg-c-title')) ListCol(const WebCol('Title', flex: 2), (p) => Text('${p['title']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: W.g900)), sort: (p) => lower(p['title'])),
              if (col('pg-c-slug')) ListCol(const WebCol('Link', flex: 1.6), (p) => Text('/${p['slug'] ?? ''}', style: const TextStyle(fontSize: 13, color: W.g500)), sort: (p) => lower(p['slug'])),
              if (col('pg-c-status')) ListCol(const WebCol('Status', flex: .9), (p) => Align(alignment: Alignment.centerLeft, child: statusPill(p['status'] == 'published', yes: 'Published', no: 'Draft')), sort: (p) => lower(p['status'])),
              if (col('pg-c-updated')) ListCol(const WebCol('Last updated', flex: 1.1), (p) => Text(dateTime(p['updatedAt']), style: const TextStyle(fontSize: 13, color: W.g600)), sort: (p) => '${p['updatedAt'] ?? ''}'),
              if (col('pg-c-actions'))
                ListCol(const WebCol('Actions', width: 124), (p) => Row(children: [
                      WebIconAction(LucideIcons.squarePen, color: const Color(0xFF4F6EF7), tooltip: 'Edit', onTap: () => _edit(p)),
                      WebIconAction(LucideIcons.externalLink, color: W.g600, tooltip: 'View on the shop', onTap: () => launchUrl(Uri.parse('$_site/${p['slug']}'), mode: LaunchMode.externalApplication)),
                      WebIconAction(LucideIcons.trash2, color: const Color(0xFFDC2626), tooltip: 'Delete', onTap: toInt(p['id']) < 0 ? null : () => _delete(p)),
                    ])),
            ],
          ),
        ],
      ],
    );
  }
}

/* ───────────────────────── File manager ───────────────────────── */

/// "File Manager" as on the website: 4 numbers, upload zone, search / type / category / sort,
/// grid or list view, select + delete, and the details panel (rename, copy link, delete).
class FilesWeb extends StatelessWidget {
  const FilesWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'files', builder: (context, data, reload) => _Files(rows: _rows(data), reload: reload));
}

class _Files extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _Files({required this.rows, required this.reload});
  @override
  State<_Files> createState() => _FilesState();
}

class _FilesState extends State<_Files> {
  static final _def = displayDefs['file_manager2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _type = 'all', _cat = 'all', _sort = 'newest', _view = 'grid';
  bool _selecting = false;
  final Set<String> _sel = {};
  Map<String, dynamic>? _active;

  String _media(Map f) => '${f['id']}'.split(':').last;

  Future<void> _upload() async {
    final files = await openFiles();
    if (files.isEmpty || !mounted) return;
    for (final x in files) {
      await context.read<AppState>().sendNow(OutboxItem(id: newId(), method: 'POST', path: '/api/media', label: 'Upload ${x.name}', multipart: true, files: {'file': x.path}));
    }
    if (!mounted) return;
    toast(context, files.length == 1 ? '“${files.first.name}” uploaded.' : '${files.length} files uploaded.');
    widget.reload();
  }

  Future<void> _delete(List<Map<String, dynamic>> fs) async {
    final mine = fs.where((f) => f['editable'] == true).toList();
    if (mine.isEmpty) return toast(context, 'Only Media Library files can be deleted here.', error: true);
    if (!await confirm(context, mine.length == 1 ? 'Delete “${mine.first['name']}”?' : 'Delete ${mine.length} files?', 'Pages that show ${mine.length == 1 ? 'it' : 'them'} will lose the picture.', ok: 'Delete', danger: true) || !mounted) return;
    for (final f in mine) {
      await context.read<AppState>().sendNow(OutboxItem(id: newId(), method: 'DELETE', path: '/api/media/${_media(f)}', label: 'Delete ${f['name']}', effect: {'kind': 'page_row_delete', 'page': 'files', 'ids': [f['id']]}));
    }
    if (!mounted) return;
    setState(() {
      _sel.clear();
      _active = null;
    });
    toast(context, mine.length == 1 ? 'File deleted.' : '${mine.length} files deleted.');
  }

  Future<void> _rename(Map<String, dynamic> f) async {
    final name = TextEditingController(text: '${f['name']}');
    final ok = await showAppDialog<bool>(context, title: 'Rename file', icon: LucideIcons.pencil, builder: (c) => DTextField(controller: name, label: 'Name', autofocus: true), actions: [const DAction.cancel(), DAction('Save', primary: true, onPressed: () async => popDialog(context, true))]);
    if (ok != true || !mounted || name.text.trim().isEmpty) return;
    await nativeSend(context, OutboxItem(id: newId(), method: 'PATCH', path: '/api/media/${_media(f)}', label: 'Rename ${f['name']}', body: {'title': name.text.trim()}, effect: {'kind': 'page_row', 'page': 'files', 'id': f['id'], 'fields': {'name': name.text.trim()}}),
        reload: widget.reload, done: 'Renamed.');
    if (mounted) setState(() => _active = {...f, 'name': name.text.trim()});
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final s = context.watch<AppState>();
    final on = _prefs.on;
    final all = widget.rows;
    final q = _q.trim().toLowerCase();
    final list = all.where((f) => (_type == 'all' || f['fileType'] == _type) && (_cat == 'all' || f['category'] == _cat) && (q.isEmpty || '${f['name']} ${f['usedBy'] ?? ''} ${f['relPath']}'.toLowerCase().contains(q))).toList();
    list.sort((a, b) => switch (_sort) {
          'oldest' => '${a['createdAt'] ?? ''}'.compareTo('${b['createdAt'] ?? ''}'),
          'largest' => toInt(b['sizeBytes'] ?? 0).compareTo(toInt(a['sizeBytes'] ?? 0)),
          'name' => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()),
          _ => '${b['createdAt'] ?? ''}'.compareTo('${a['createdAt'] ?? ''}'),
        });
    final shown = list.take(300).toList();
    String url(Map f) => s.api.fileUrl('${f['relPath']}') ?? '';
    void pick(Map<String, dynamic> f) => setState(() => _selecting ? (_sel.contains(f['id']) ? _sel.remove(f['id']) : _sel.add('${f['id']}')) : _active = f);
    Widget thumb(Map f, double size) => f['fileType'] == 'image'
        ? NetImage(url(f), size: size, radius: 6, placeholder: LucideIcons.image)
        : Container(width: size, height: size, decoration: BoxDecoration(color: W.g100, borderRadius: BorderRadius.circular(6)), child: Icon(f['fileType'] == 'pdf' ? LucideIcons.fileType : LucideIcons.fileText, color: f['fileType'] == 'pdf' ? const Color(0xFFDC2626) : W.g500, size: size * .4));

    final grid = Wrap(spacing: 12, runSpacing: 12, children: [
      for (final f in shown)
        InkWell(
          onTap: () => pick(f),
          child: Container(
            width: 150,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _active?['id'] == f['id'] || _sel.contains(f['id']) ? const Color(0xFF2563EB) : W.g200, width: 1.5), borderRadius: BorderRadius.circular(8)),
            child: Stack(children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Center(child: thumb(f, 132)),
                const SizedBox(height: 6),
                Text('${f['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: W.g900)),
                Text('${f['categoryLabel']} · ${_bytes(f['sizeBytes'] as num?)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: W.g500)),
              ]),
              if (_selecting) Positioned(left: 0, top: 0, child: IgnorePointer(child: Checkbox(value: _sel.contains(f['id']), onChanged: (_) {}))),
            ]),
          ),
        ),
    ]);
    final table = WebTable(
      cols: [if (_selecting) const WebCol('', width: 44), const WebCol('File', flex: 2.4), const WebCol('Category', flex: 1.2), const WebCol('Size', flex: .7), const WebCol('Used by', flex: 1.3), const WebCol('Added', flex: 1)],
      onRowTap: [for (final f in shown) () => pick(f)],
      rows: [
        for (final f in shown)
          [
            if (_selecting) IgnorePointer(child: Checkbox(value: _sel.contains(f['id']), onChanged: (_) {})),
            Row(children: [thumb(f, 34), const SizedBox(width: 10), Expanded(child: Text('${f['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)))]),
            Text('${f['categoryLabel']}', style: const TextStyle(fontSize: 12.5, color: W.g600)),
            Text(_bytes(f['sizeBytes'] as num?), style: TextStyle(fontSize: 12.5, color: f['sizeBytes'] == null ? const Color(0xFFDC2626) : W.g600)),
            Text('${f['usedBy'] ?? '—'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g600)),
            Text(dateShort(f['createdAt']), style: const TextStyle(fontSize: 12.5, color: W.g600)),
          ],
      ],
      empty: const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No files match.', style: TextStyle(color: W.g400)))),
    );

    Widget details(Map<String, dynamic> f) => WebCard(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Stack(children: [
              Container(height: 200, color: W.g50, alignment: Alignment.center, child: f['fileType'] == 'image' ? Image.network(url(f), fit: BoxFit.contain, errorBuilder: (_, _, _) => const Icon(LucideIcons.imageOff, color: W.g400)) : thumb(f, 90)),
              Positioned(right: 6, top: 6, child: IconButton(onPressed: () => setState(() => _active = null), icon: const Icon(LucideIcons.x, size: 16))),
            ]),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('${f['name']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: W.g900)),
                const SizedBox(height: 10),
                for (final (l, v) in [('Category', '${f['categoryLabel']}'), ('Size', _bytes(f['sizeBytes'] as num?)), if (f['createdAt'] != null) ('Created', dateTime(f['createdAt'])), ('Location', '/${f['relPath']}'), if (f['usedBy'] != null) ('Used by', '${f['usedBy']}')])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 72, child: Text(l, style: const TextStyle(fontSize: 12.5, color: W.g500))), Expanded(child: SelectableText(v, style: const TextStyle(fontSize: 12.5, color: W.g800)))]),
                  ),
                const Divider(height: 18, color: W.g100),
                if (f['editable'] == true) TextButton.icon(onPressed: () => _rename(f), icon: const Icon(LucideIcons.pencil, size: 15), label: const Text('Rename')),
                TextButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: url(f)));
                    toast(context, 'Link copied.');
                  },
                  icon: const Icon(LucideIcons.link2, size: 15),
                  label: const Text('Copy link'),
                ),
                TextButton.icon(onPressed: () => launchUrl(Uri.parse(url(f)), mode: LaunchMode.externalApplication), icon: const Icon(LucideIcons.externalLink, size: 15), label: const Text('Open')),
                if (f['editable'] == true) TextButton.icon(onPressed: () => _delete([f]), icon: const Icon(LucideIcons.trash2, size: 15, color: Color(0xFFDC2626)), label: const Text('Delete', style: TextStyle(color: Color(0xFFDC2626)))),
              ]),
            ),
          ]),
        );

    bool tb(String k) => on('fm2-toolbar', k);
    return WebPage(
      title: 'File Manager',
      subtitle: 'Every image and file used on the site',
      onRefresh: widget.reload,
      actions: [DisplayOptionsButton(_def), WebButton('Upload', icon: LucideIcons.upload, color: const Color(0xFF2563EB), onPressed: _upload)],
      children: [
        ...webCardsRow([
          if (on('fm2-cards', 'fm2-k-total')) WebMetric(icon: LucideIcons.fileText, color: const Color(0xFF7C3AED), value: '${all.length}', label: 'Total Files'),
          if (on('fm2-cards', 'fm2-k-images')) WebMetric(icon: LucideIcons.image, color: const Color(0xFF059669), value: '${all.where((f) => f['fileType'] == 'image').length}', label: 'Images'),
          if (on('fm2-cards', 'fm2-k-pdfs')) WebMetric(icon: LucideIcons.fileType, color: const Color(0xFFEF4444), value: '${all.where((f) => f['fileType'] == 'pdf').length}', label: 'PDFs'),
          if (on('fm2-cards', 'fm2-k-assets')) WebMetric(icon: LucideIcons.folder, color: const Color(0xFFD97706), value: '${all.where((f) => f['category'] != 'media').length}', label: 'Site Assets'),
        ]),
        if (on('fm2-upload', 'fm2-upload-zone')) ...[
          InkWell(
            onTap: _upload,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 22),
              decoration: BoxDecoration(color: const Color(0xFFF8FAFF), border: Border.all(color: const Color(0xFFBFDBFE), width: 1.5), borderRadius: BorderRadius.circular(10)),
              child: const Column(children: [
                Icon(LucideIcons.cloudUpload, size: 26, color: Color(0xFF2563EB)),
                SizedBox(height: 6),
                Text.rich(TextSpan(style: TextStyle(fontSize: 13.5, color: W.g600), children: [TextSpan(text: 'Click to choose files — '), TextSpan(text: 'Browse to upload', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF2563EB)))])),
              ]),
            ),
          ),
          const SizedBox(height: 12),
        ],
        WebCard(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            if (tb('fm2-f-search')) ...[Expanded(child: WebSearch(hint: 'Search files…', onChanged: (v) => setState(() => _q = v))), const SizedBox(width: 10)],
            if (tb('fm2-f-type')) ...[SizedBox(width: 160, child: WebSelect<String>(value: _type, options: const [('all', 'All Types'), ('image', 'Images'), ('pdf', 'PDFs'), ('video', 'Videos'), ('document', 'Documents'), ('archive', 'Archives')], onChanged: (v) => setState(() => _type = v))), const SizedBox(width: 10)],
            if (tb('fm2-f-category')) ...[
              SizedBox(
                width: 190,
                child: WebSelect<String>(value: _cat, options: const [('all', 'All Categories'), ('media', 'Media Library'), ('product', 'Product Images'), ('category', 'Category Icons'), ('brand', 'Brand Logos'), ('banner', 'Homepage Banners'), ('payment', 'Payment Icons'), ('logo', 'Site Logo'), ('author', 'Author Photos')], onChanged: (v) => setState(() => _cat = v)),
              ),
              const SizedBox(width: 10),
            ],
            if (tb('fm2-f-sort')) ...[SizedBox(width: 180, child: WebSelect<String>(value: _sort, options: const [('newest', 'Sort by: Newest'), ('oldest', 'Sort by: Oldest'), ('largest', 'Sort by: Largest'), ('name', 'Sort by: Name')], onChanged: (v) => setState(() => _sort = v))), const SizedBox(width: 10)],
            if (!tb('fm2-f-search')) const Spacer(),
            WebButton(_selecting ? 'Cancel' : 'Select', icon: LucideIcons.squareCheck, onPressed: () => setState(() {
                  _selecting = !_selecting;
                  _sel.clear();
                })),
            if (_selecting && _sel.isNotEmpty) ...[const SizedBox(width: 8), WebButton('Delete (${_sel.length})', icon: LucideIcons.trash2, color: const Color(0xFFDC2626), onPressed: () => _delete(all.where((f) => _sel.contains(f['id'])).toList()))],
            const SizedBox(width: 8),
            DSegmented<String>(options: const [('grid', 'Grid'), ('list', 'List')], value: _view, onChanged: (v) => setState(() => _view = v)),
          ]),
        ),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _view == 'grid' ? (shown.isEmpty ? const WebCard(child: Center(child: Text('No files match.', style: TextStyle(color: W.g400)))) : grid) : WebCard(padding: EdgeInsets.zero, child: table)),
          if (_active != null) ...[const SizedBox(width: 12), SizedBox(width: 320, child: details(_active!))],
        ]),
        if (list.length > shown.length) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Showing ${shown.length} of ${list.length} — search to narrow down.', style: const TextStyle(fontSize: 12.5, color: W.g500))),
      ],
    );
  }
}

/* ───────────────────────── Activity logs ───────────────────────── */

const _high = ['login_blocked', 'login_denied', 'logs_clear', 'user_delete', 'ecom_product_delete', 'ecom_category_delete', 'ecom_customer_delete', 'ecom_coupon_delete', 'ecom_brand_delete', 'ecom_subcategory_delete', 'ecom_tag_delete', 'ecom_campaign_delete', 'ecom_review_delete'];
const _medium = ['user_create', 'user_edit', 'ecom_payment_update', 'ecom_business_settings_update', 'ecom_homepage_update', 'ecom_coupon_pause', 'ecom_coupon_resume', 'ecom_gst_update', 'ecom_product_stock_update'];
const _security = ['login_success', 'login_blocked', 'login_denied', 'logs_clear', 'user_create', 'user_delete', 'user_edit'];
const _failed = ['login_blocked', 'login_denied'];

String _severity(String a) => _high.contains(a) ? 'high' : _medium.contains(a) ? 'medium' : 'low';
String _actionLabel(String a) {
  final w = a.replaceFirst(RegExp(r'^ecom_'), '').split('_');
  const past = {'create': 'Created', 'update': 'Updated', 'delete': 'Deleted', 'edit': 'Updated'};
  return [for (final (i, x) in w.indexed) i == w.length - 1 && past[x] != null ? past[x]! : x.isEmpty ? x : '${x[0].toUpperCase()}${x.substring(1)}'].join(' ');
}

(String, String) _ua(String? ua) {
  if (ua == null || ua.isEmpty) return ('Unknown', 'Unknown');
  final b = RegExp(r'edg/', caseSensitive: false).hasMatch(ua)
      ? 'Edge'
      : RegExp(r'chrome/', caseSensitive: false).hasMatch(ua)
          ? 'Chrome'
          : RegExp(r'firefox/', caseSensitive: false).hasMatch(ua)
              ? 'Firefox'
              : RegExp(r'safari/', caseSensitive: false).hasMatch(ua)
                  ? 'Safari'
                  : ua.startsWith('Dart') || ua.contains('SriAndal')
                      ? 'Staff app'
                      : 'Unknown';
  final o = RegExp(r'windows', caseSensitive: false).hasMatch(ua)
      ? 'Windows'
      : RegExp(r'android', caseSensitive: false).hasMatch(ua)
          ? 'Android'
          : RegExp(r'iphone|ipad', caseSensitive: false).hasMatch(ua)
              ? 'iOS'
              : RegExp(r'mac os', caseSensitive: false).hasMatch(ua)
                  ? 'macOS'
                  : RegExp(r'linux', caseSensitive: false).hasMatch(ua)
                      ? 'Linux'
                      : 'Unknown';
  return (b, o);
}

/// "Activity Logs" as on the website: 4 numbers (total, today, security events, failed in 24 h),
/// Action / User / Severity / date filters, search, and the log table with tech info and severity.
class ActivityWeb extends StatelessWidget {
  const ActivityWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'activity', builder: (context, data, reload) => _Activity(rows: _rows(data), reload: reload));
}

class _Activity extends StatefulWidget {
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() reload;
  const _Activity({required this.rows, required this.reload});
  @override
  State<_Activity> createState() => _ActivityState();
}

class _ActivityState extends State<_Activity> {
  static final _def = displayDefs['activity_logs2_display']!;
  final _prefs = DisplayPrefs(_def.key);
  String _q = '', _action = 'all', _user = 'all', _sev = 'all';
  DateRange? _range;

  bool get _filtersOn => _q.isNotEmpty || _action != 'all' || _user != 'all' || _sev != 'all' || _range != null;

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _prefs, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final on = _prefs.on;
    final all = widget.rows;
    final today = DateRange.preset('today');
    final dayAgo = DateTime.now().toUtc().subtract(const Duration(hours: 24));
    final actions = {for (final l in all) '${l['action']}'}.toList()..sort();
    final users = {for (final l in all) '${l['user'] ?? 'System'}'}.toList()..sort();
    final q = _q.trim().toLowerCase();
    final list = all.where((l) {
      if (_action != 'all' && l['action'] != _action) return false;
      if (_user != 'all' && '${l['user'] ?? 'System'}' != _user) return false;
      if (_sev != 'all' && _severity('${l['action']}') != _sev) return false;
      if (_range != null && !_range!.contains(l['at'])) return false;
      return q.isEmpty || '${l['text']} ${l['user'] ?? ''} ${l['ip'] ?? ''} ${l['action']}'.toLowerCase().contains(q);
    }).toList();
    bool col(String k) => on('al2-table', k);
    const sevColor = {'high': (Color(0xFFB91C1C), Color(0xFFFEE2E2)), 'medium': (Color(0xFFB45309), Color(0xFFFEF3C7)), 'low': (Color(0xFF047857), Color(0xFFD1FAE5))};

    return WebPage(
      title: 'Activity Logs',
      subtitle: 'Who did what, and when',
      onRefresh: widget.reload,
      actions: [
        DisplayOptionsButton(_def),
        WebButton('Export', icon: LucideIcons.download, onPressed: () => exportTable(context, 'Activity Logs', const ['Date', 'User', 'Action', 'Description', 'Severity', 'IP', 'Browser', 'OS'], [
              for (final l in list) [dateTime(l['at']), l['user'] ?? 'System', _actionLabel('${l['action']}'), l['text'], _severity('${l['action']}'), l['ip'], _ua(l['ua'] as String?).$1, _ua(l['ua'] as String?).$2],
            ])),
      ],
      children: [
        ...webCardsRow([
          if (on('al2-cards', 'al2-k-total')) WebMetric(icon: LucideIcons.activity, color: const Color(0xFF7C3AED), value: '${all.length}', label: 'Total Events', sub: 'last ${all.length} kept here'),
          if (on('al2-cards', 'al2-k-today')) WebMetric(icon: LucideIcons.calendar, color: const Color(0xFF2563EB), value: '${all.where((l) => today.contains(l['at'])).length}', label: 'Today', onTap: () => setState(() => _range = today)),
          if (on('al2-cards', 'al2-k-security')) WebMetric(icon: LucideIcons.shieldAlert, color: const Color(0xFFD97706), value: '${all.where((l) => _security.contains(l['action'])).length}', label: 'Security Events'),
          if (on('al2-cards', 'al2-k-failed'))
            WebMetric(icon: LucideIcons.triangleAlert, color: const Color(0xFFEF4444), value: '${all.where((l) => _failed.contains(l['action']) && (DateTime.tryParse('${l['at']}')?.isAfter(dayAgo) ?? false)).length}', label: 'Failed Actions', sub: 'Last 24 hours'),
        ]),
        WebCard(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Expanded(child: WebSelect<String>(label: 'Action', value: _action, options: [('all', 'All actions'), for (final a in actions) (a, _actionLabel(a))], onChanged: (v) => setState(() => _action = v))),
            const SizedBox(width: 12),
            Expanded(child: WebSelect<String>(label: 'User', value: _user, options: [('all', 'All users'), for (final u in users) (u, u)], onChanged: (v) => setState(() => _user = v))),
            const SizedBox(width: 12),
            Expanded(child: WebSelect<String>(label: 'Severity', value: _sev, options: const [('all', 'All'), ('high', 'High'), ('medium', 'Medium'), ('low', 'Low')], onChanged: (v) => setState(() => _sev = v))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Dates', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                const SizedBox(height: 6),
                WebButton(_range == null ? 'Any time' : _range!.label, icon: LucideIcons.calendarRange, onPressed: () async {
                  final r = await showDateRangePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime.now());
                  if (r != null) setState(() => _range = DateRange('custom', DateTime(r.start.year, r.start.month, r.start.day), DateTime(r.end.year, r.end.month, r.end.day)));
                }),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        WebList(
          rows: list,
          total: all.length,
          rowHeight: 58,
          filtersOn: _filtersOn,
          onClearFilters: () => setState(() {
            _q = '';
            _action = _user = _sev = 'all';
            _range = null;
          }),
          search: WebSearch(width: 260, hint: 'Search description, user, IP…', onChanged: (v) => setState(() => _q = v)),
          empty: 'No activity yet.',
          cols: [
            if (col('al2-c-user'))
              ListCol(const WebCol('User', flex: 1), (l) => Row(children: [Avatar('${l['user'] ?? 'S'}', size: 28), const SizedBox(width: 8), Flexible(child: Text('${l['user'] ?? 'System'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)))]),
                  sort: (l) => lower(l['user'])),
            if (col('al2-c-action')) ListCol(const WebCol('Action', flex: 1.1), (l) => Text(_actionLabel('${l['action']}'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: W.g800)), sort: (l) => lower(l['action'])),
            if (col('al2-c-description')) ListCol(const WebCol('Description', flex: 2.6), (l) => Text('${l['text'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: W.g700))),
            if (col('al2-c-tech'))
              ListCol(const WebCol('Tech Info', flex: 1.1), (l) {
                final (b, o) = _ua(l['ua'] as String?);
                return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${l['ip'] ?? '—'}', style: const TextStyle(fontSize: 12, color: W.g700)),
                  Text('$b · $o', style: const TextStyle(fontSize: 11.5, color: W.g500)),
                ]);
              }),
            if (col('al2-c-severity'))
              ListCol(const WebCol('Severity', flex: .7), (l) {
                final sv = _severity('${l['action']}');
                return Align(alignment: Alignment.centerLeft, child: WebBadge('${sv[0].toUpperCase()}${sv.substring(1)}', color: sevColor[sv]!.$1, bg: sevColor[sv]!.$2));
              }, sort: (l) => lower(_severity('${l['action']}'))),
            if (col('al2-c-date')) ListCol(const WebCol('Date', flex: 1), (l) => Text(dateTime(l['at']), style: const TextStyle(fontSize: 12.5, color: W.g600)), sort: (l) => '${l['at']}'),
          ],
        ),
      ],
    );
  }
}

/* ───────────────────────── Cache manager ───────────────────────── */

/// "Cache Manager" as on the website: size / clears / last cleared, the Redis panel, the section
/// cards (Homepage, Storefront, Admin Dashboard, Everything) and the clear history.
class CacheWeb extends StatelessWidget {
  const CacheWeb({super.key});
  @override
  Widget build(BuildContext context) => NativeData(name: 'cache', builder: (context, data, reload) => _Cache(data: Map<String, dynamic>.from((data as Map?) ?? const {}), reload: reload));
}

class _Cache extends StatelessWidget {
  final Map<String, dynamic> data;
  final Future<void> Function() reload;
  const _Cache({required this.data, required this.reload});
  static final _def = displayDefs['cache_manager2_display']!;

  @override
  Widget build(BuildContext context) {
    final prefs = DisplayPrefs(_def.key);
    return ListenableBuilder(
      listenable: prefs,
      builder: (context, _) {
        final on = prefs.on;
        final last = data['lastCleared'] as Map?;
        final redis = Map<String, dynamic>.from((data['redis'] as Map?) ?? const {});
        final history = _rows(data['history']);
        Future<void> clear(String section, String label) async {
          if (!await confirm(context, 'Clear $label?', 'Pages are rebuilt fresh on the next visit. Uploaded files, products and orders are never touched.', ok: 'Clear')) return;
          if (!context.mounted) return;
          await nativeSend(context, OutboxItem(id: newId(), method: 'POST', path: '/api/cache2', label: 'Clear cache: $label', body: {'section': section}), reload: reload, done: '$label cleared.');
        }

        Widget section(String key, String label, String blurb, IconData icon, Color c) => WebCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(width: 40, height: 40, decoration: BoxDecoration(color: c.withValues(alpha: .1), borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 19, color: c)),
                  const SizedBox(width: 12),
                  Expanded(child: Text(label, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: W.g900))),
                ]),
                const SizedBox(height: 8),
                Text(blurb, style: const TextStyle(fontSize: 12.5, color: W.g500)),
                const SizedBox(height: 12),
                WebButton('Clear $label', icon: LucideIcons.refreshCw, color: key == 'all' ? const Color(0xFFDC2626) : const Color(0xFF2563EB), onPressed: () => clear(key, label)),
              ]),
            );

        return WebPage(
          title: 'Cache Manager',
          subtitle: 'Refresh the shop when a change does not show up',
          onRefresh: reload,
          actions: [DisplayOptionsButton(_def)],
          children: [
            ...webCardsRow(columns: 3, [
              if (on('cm2-cards', 'cm2-k-size')) WebMetric(icon: LucideIcons.hardDrive, color: const Color(0xFF7C3AED), value: _bytes(data['cacheSizeBytes'] as num?), label: 'Cache Size'),
              if (on('cm2-cards', 'cm2-k-total')) WebMetric(icon: LucideIcons.rotateCcw, color: const Color(0xFF2563EB), value: '${data['totalClears'] ?? 0}', label: 'Total Clears'),
              if (on('cm2-cards', 'cm2-k-last')) WebMetric(icon: LucideIcons.clock, color: const Color(0xFFD97706), value: last == null ? 'Never' : ago(last['at']), label: 'Last Cleared', sub: last == null ? null : '${last['section']}${last['by'] != null ? ' · by ${last['by']}' : ''}'),
            ]),
            if (on('cm2-redis', 'cm2-redis-panel')) ...[
              WebCard(
                child: Row(children: [
                  Container(width: 40, height: 40, decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(10)), child: const Icon(LucideIcons.database, size: 19, color: Color(0xFFDC2626))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Redis Cache', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: W.g900)),
                      Text(
                        redis['configured'] != true
                            ? 'Not set up on this server.'
                            : redis['connected'] == true
                                ? 'Connected · ${redis['keyCount'] ?? 0} keys${redis['memoryUsedBytes'] != null ? ' · ${_bytes(redis['memoryUsedBytes'] as num)}' : ''}'
                                : 'Not connected${redis['error'] != null ? ' — ${redis['error']}' : ''}',
                        style: const TextStyle(fontSize: 12.5, color: W.g500),
                      ),
                    ]),
                  ),
                  if (redis['connected'] == true) WebButton('Flush Redis', icon: LucideIcons.trash2, color: const Color(0xFFDC2626), onPressed: () => clear('redis', 'Redis Cache')),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            if (on('cm2-sections', 'cm2-sections-list')) ...[
              WebGrid(columns: 4, minWidth: 230, children: [
                section('home', 'Homepage', 'The storefront landing page (/).', LucideIcons.house, const Color(0xFF2563EB)),
                section('shop', 'Storefront Pages', 'Shop, categories, product pages, cart, checkout.', LucideIcons.store, const Color(0xFF059669)),
                section('dashboard', 'Admin Dashboard', 'Your own dashboard stats view.', LucideIcons.layoutDashboard, const Color(0xFF7C3AED)),
                section('all', 'Everything', 'Every cached page at once.', LucideIcons.flame, const Color(0xFFDC2626)),
              ]),
              const SizedBox(height: 8),
              const Text("This clears the website's page cache and Redis only — uploaded files, product data, and orders are never touched. Use it after changing homepage sections or business settings, if the update doesn't appear right away.",
                  style: TextStyle(fontSize: 12, color: W.g500)),
              const SizedBox(height: 12),
            ],
            if (on('cm2-history', 'cm2-history-panel'))
              WebCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('Clear History', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: W.g900)),
                  const SizedBox(height: 10),
                  if (history.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Nothing cleared yet.', style: TextStyle(color: W.g400))),
                  for (final h in history)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      decoration: const BoxDecoration(border: Border(top: BorderSide(color: W.g100))),
                      child: Row(children: [
                        const Icon(LucideIcons.rotateCcw, size: 14, color: W.g400),
                        const SizedBox(width: 10),
                        Expanded(child: Text('${h['description']}', style: const TextStyle(fontSize: 13, color: W.g800))),
                        Text('${h['by'] ?? ''}  ·  ${dateTime(h['at'])}', style: const TextStyle(fontSize: 12, color: W.g500)),
                      ]),
                    ),
                ]),
              ),
          ],
        );
      },
    );
  }
}
