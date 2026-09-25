import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

/// Everything about syncing in one place: connection, last update, and each
/// change still waiting to reach the server (with Retry / Discard for any the
/// server refused).
class SyncCenter extends StatelessWidget {
  const SyncCenter({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final busy = s.phase != SyncPhase.idle;
    return Scaffold(
      appBar: AppBar(title: const Text('Sync')),
      body: PageBody(
        maxWidth: 820,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          AppCard(
            child: Row(children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(color: s.online ? AppColors.greenSoft : AppColors.redSoft, borderRadius: BorderRadius.circular(12)),
                child: Icon(s.online ? Icons.wifi_rounded : Icons.wifi_off_rounded, color: s.online ? AppColors.green : AppColors.red),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.online ? 'Online' : 'Offline — keep working', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(s.lastSync == null ? 'Not synced yet' : 'Last updated ${ago(s.lastSync)}', style: const TextStyle(color: AppColors.muted)),
                  if (s.lastError != null) Text(s.lastError!, style: const TextStyle(color: AppColors.red, fontSize: 12.5)),
                ]),
              ),
              FilledButton.icon(
                onPressed: busy ? null : () => s.syncNow(force: true),
                icon: busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.sync_rounded, size: 18),
                label: Text(busy ? (s.phase == SyncPhase.sending ? 'Sending…' : 'Updating…') : 'Sync now'),
              ),
            ]),
          ),
          const SizedBox(height: 18),
          SectionTitle('Waiting to send (${s.outbox.length})', icon: Icons.outbox_rounded),
          if (s.outbox.isEmpty)
            const AppCard(child: Row(children: [Icon(Icons.check_circle_rounded, color: AppColors.green), SizedBox(width: 10), Expanded(child: Text('Everything is saved on the server.'))]))
          else
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(children: [
                for (final o in s.outbox) ...[
                  ListTile(
                    leading: Icon(o.failed ? Icons.error_outline_rounded : Icons.schedule_rounded, color: o.failed ? AppColors.red : AppColors.amber),
                    title: Text(o.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(o.failed ? (o.error ?? 'Refused by the server') : 'Made ${ago(o.createdAt)}${o.attempts > 0 ? ' · tried ${o.attempts}×' : ''}',
                        style: TextStyle(color: o.failed ? AppColors.red : AppColors.muted)),
                    trailing: o.failed
                        ? Wrap(spacing: 4, children: [
                            TextButton(onPressed: () => s.retry(o), child: const Text('Retry')),
                            TextButton(
                              style: TextButton.styleFrom(foregroundColor: AppColors.red),
                              onPressed: () async {
                                if (await confirm(context, 'Discard this change?', '“${o.label}” will not be saved to the system.', ok: 'Discard', danger: true)) s.discard(o);
                              },
                              child: const Text('Discard'),
                            ),
                          ])
                        : null,
                  ),
                  if (o != s.outbox.last) const Divider(),
                ],
              ]),
            ),
          const SizedBox(height: 18),
          const Text('Changes made without internet are kept safely on this device and sent automatically, in order, as soon as the connection is back. Each one is saved only once, even if it is sent again.',
              style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ]),
      ),
    );
  }
}
