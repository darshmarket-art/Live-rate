import { boardFor, inr, rowDef, statusOf, type RowId, type Tick } from '../shared/rates';
import { logger } from './logger';
import { newId } from './http';
import { scoped, type Store } from './store';
import type { StoreCache, StoreRecord } from './stores';
import type { Messenger } from './whatsapp';

export interface Alert { id: string; phone: string; row: RowId; above: boolean; mark: number; active: boolean; createdAt: string; triggeredAt?: string; triggeredRate?: number }

export const MAX_ACTIVE_ALERTS = 10;

export const crossed = (a: Pick<Alert, 'above' | 'mark'>, rate: number) => (a.above ? rate >= a.mark : rate <= a.mark);

/**
 * Checks every store's active alerts against its own board (its margins, its rounding). Run by rate-ingest once a minute: one instance,
 * so each alert fires once. Each alert is switched off in the same transaction that records the firing.
 */
export async function checkAlerts(store: Store, cache: StoreCache, tick: Tick | null, messenger: Messenger, now = Date.now()) {
  if (!tick || statusOf(tick, now) !== 'live' || tick.sample) return 0;
  let fired = 0;
  const stores = await store.list<StoreRecord>('stores');
  for (const st of stores) {
    const alerts = await store.list<Alert>(scoped(st.id, 'alerts'), { where: [{ field: 'active', op: '==', value: true }] });
    if (!alerts.length) continue;
    const { desk, profile } = await cache.get(st.id, st.name);
    const board = boardFor(tick, desk, now);
    for (const a of alerts) {
      const row = board.rows.find((r) => r.id === a.row);
      if (!row || !crossed(a, row.buy)) continue;
      const won = await store.transact(async (tx) => {
        const cur = await tx.get<Alert>(scoped(st.id, 'alerts'), a.id);
        if (!cur?.active) return false;
        tx.set(scoped(st.id, 'alerts'), a.id, { ...cur, active: false, triggeredAt: new Date(now).toISOString(), triggeredRate: row.buy });
        const n = newId('n');
        tx.set(scoped(st.id, 'notifications'), n, { id: n, phone: a.phone, at: new Date(now).toISOString(), text: `${rowDef(a.row).name} is ₹${inr(row.buy)} per ${rowDef(a.row).unit}, ${a.above ? 'above' : 'below'} your ₹${inr(a.mark)}.` });
        return true;
      });
      if (!won) continue;
      fired++;
      await messenger.sendAlert(a.phone, profile.name, `${rowDef(a.row).name} per ${rowDef(a.row).unit}`, `₹${inr(row.buy)}`).catch((e) => logger.warn('alert message failed', { error: String(e?.message ?? e) }));
    }
  }
  return fired;
}
