// The guild bank TRANSACTION HISTORY statement: one page of one guild's
// bank_ledger rows, newest first, for the in-game guild-visible history
// (server/guild_bank_log.ts owns the projection, the gate, and the cache; this
// is only the statement). Extracted from server/db.ts when the read grew a
// cursor: db.ts is a monolith under the ratchet, and a paged reader with its
// own timeout and row shape is a domain module, not coordinator wiring.
//
// PRIVACY IS THE COLUMN LIST. This is the one read whose result reaches
// players, so it selects the narrowest set that can render a sentence:
// bank_ledger.account_id, realm, and the instance payload are NOT selected at
// all, and character_id is resolved to a display name here rather than shipped.
// Nothing account-scoped can leak through a projection bug downstream, because
// nothing account-scoped is in the row.
//
// The predicate rides bank_ledger_container_recent (container, container_id,
// id DESC), added through the CONCURRENTLY seam with this reader: see
// server/bank_ledger_indexes.ts for why the third column carries its weight.
// `id DESC` (not created_at) is the paging order: BIGSERIAL cannot tie, and it
// is exactly the index's trailing column, so this is a bounded backwards index
// scan whose cost is the LIMIT rather than the guild's lifetime row count. The
// OLDER-PAGE cursor is the same column (`id < $before`), so an older page is
// the same bounded scan starting further back, never an OFFSET that would
// re-walk everything newer than the page.
//
// The op filter is applied HERE rather than in JS so a suppressed row never
// crosses the wire into this process at all, and so the LIMIT counts only rows
// a player can actually see (filtering after the fact would silently return
// fewer than the window it promised).

import { runWithStatementTimeout } from './db';
import { REALM } from './realm';

export interface GuildBankLogDbRow {
  id: number;
  /** Epoch milliseconds (the column is TIMESTAMPTZ; pg hands back a Date). */
  at: number;
  /** The acting character's display name, or null when the character row is
   *  gone. Never an id. */
  characterName: string | null;
  op: string;
  itemId: string | null;
  count: number | null;
  copperDelta: number;
}

/** One page of the history plus the one fact a cursor needs: whether rows
 *  OLDER than the page's last row exist. Learned by fetching one row past the
 *  window and dropping it, so a page that happens to be exactly full never
 *  offers a "show older" that answers with nothing. */
export interface GuildBankLogDbPage {
  rows: GuildBankLogDbRow[];
  more: boolean;
}

/**
 * The per-statement bound for the history read, deliberately far BELOW the
 * pool default rather than above it.
 *
 * Intended cost is a bounded backward index scan of one page, i.e. single-digit
 * milliseconds. The cost without its index is a sequential scan of a
 * keep-forever table, and at the 15s pool default roughly ten of those in
 * flight would exhaust DB_POOL_MAX_CLIENTS and make every login and autosave on
 * the realm fail its checkout. That window is reachable now that the
 * CONCURRENTLY builds run after listen (runConcurrentIndexMigrations), and it
 * is also what a dropped index or an unhealed INVALID carcass looks like. Two
 * seconds is ~3 orders of magnitude of headroom over the intended cost and
 * still fails this ONE read instead of the realm: the caller answers the
 * player a refusal, which the pane renders.
 */
export const GUILD_BANK_LOG_TIMEOUT_MS = 2_000;

/**
 * Read one page. `beforeId` null is the NEWEST window; a positive id asks for
 * the rows strictly older than it (the client hands back the oldest id it
 * holds). The predicate is `<`, never `<=`, so a page can never repeat the
 * cursor row, and the cursor is a bind parameter like everything else.
 */
export async function loadGuildBankLogPage(
  guildId: number,
  limit: number,
  visibleOps: readonly string[],
  beforeId: number | null,
): Promise<GuildBankLogDbPage> {
  // One row past the window is the `more` probe; a non-positive cursor is
  // treated as "no cursor" rather than as a page that can only be empty.
  const before = beforeId !== null && beforeId > 0 ? beforeId : null;
  // Two statement TEXTS rather than one `($5 IS NULL OR id < $5)` predicate:
  // a generic plan for the OR form can demote the cursor from an index
  // condition to a filter, and a filter arm walks every newer row before it
  // finds the page. With the predicate present only when there is a cursor,
  // both shapes stay the bounded backward index scan the index was built for.
  const cursorClause = before === null ? '' : '\n        AND bl.id < $5';
  const params: unknown[] = [guildId, visibleOps, limit + 1, REALM];
  if (before !== null) params.push(before);
  const res = await runWithStatementTimeout(GUILD_BANK_LOG_TIMEOUT_MS, (query) =>
    query(
      `SELECT bl.id,
            bl.created_at,
            bl.op,
            bl.item_id,
            bl.count,
            bl.copper_delta,
            c.name AS character_name
       FROM bank_ledger bl
       LEFT JOIN characters c ON c.id = bl.character_id
      WHERE bl.container = 'guild'
        AND bl.container_id = $1
        -- Realm discipline, matching every sibling statement. A guild lives on
        -- exactly one realm and guild ids are globally unique, so this cannot
        -- change which rows match today and cannot make the LIMIT scan wider;
        -- it is here so a cross-realm row could never be projected into a
        -- guild's history if that ever stopped being true.
        AND bl.realm = $4
        AND bl.op = ANY($2::text[])${cursorClause}
      ORDER BY bl.id DESC
      LIMIT $3`,
      params,
    ),
  );
  const rows = res.rows.map((r) => ({
    id: Number(r.id),
    at: r.created_at instanceof Date ? r.created_at.getTime() : Number(new Date(r.created_at)),
    characterName: typeof r.character_name === 'string' ? r.character_name : null,
    op: String(r.op),
    itemId: r.item_id === null || r.item_id === undefined ? null : String(r.item_id),
    count: r.count === null || r.count === undefined ? null : Number(r.count),
    // BIGINT arrives as a string from pg; Number() is safe here because every
    // legitimate copper magnitude is far inside the safe-integer range (the
    // treasury cap alone is 1e9).
    copperDelta: Number(r.copper_delta) || 0,
  }));
  const more = rows.length > limit;
  if (more) rows.length = limit;
  return { rows, more };
}

/** The newest-window read in its original shape (rows only), kept for the
 *  callers and tests that never page: the same statement with no cursor. */
export async function loadGuildBankLogRows(
  guildId: number,
  limit: number,
  visibleOps: readonly string[],
): Promise<GuildBankLogDbRow[]> {
  return (await loadGuildBankLogPage(guildId, limit, visibleOps, null)).rows;
}
