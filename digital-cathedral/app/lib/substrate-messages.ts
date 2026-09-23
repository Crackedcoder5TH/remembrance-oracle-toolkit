/**
 * Client messages on the substrate (opt-in).
 *
 * Routes portal-message reads/writes to the field's `legacy` record store via
 * the bridge instead of the relational adapter — one message = one record
 * (id `msg:<numericId>`). database.ts delegates here when SUBSTRATE_MESSAGES is
 * enabled; otherwise the relational adapter is used. A deliberate, reversible
 * opt-in — the relational adapter stays the DEFAULT, so production is unchanged
 * unless the operator sets the flag.
 *
 * STORAGE SHAPE — compressor-native. The record's `content` is the message
 * TEXT (subject + body); the structured ClientMessage lives in `meta.message`.
 * This is deliberate: the field waveforms `name + "\n" + content`, so putting
 * the message text there (not a JSON blob) makes the record's OWN coherence and
 * resonance about the message — which is what makes `recall`/`resonant` over
 * messages meaningful, the whole reason to put them on the substrate. It is
 * also what makes resonance-based dedup work (see findDuplicateMessage): an
 * identical resubmit produces an identical waveform, so it resonates at ~1.0
 * with the record that already landed. (Measured: with JSON content the true
 * twin did not even rank — unrelated text out-resonated it. Text content fixed
 * it.)
 *
 * The routes' id contract is a POSITIVE INTEGER (markMessageRead validates
 * Number.isInteger(id) && id > 0), so ids are minted as a time-ordered integer
 * (Date.now()), bumped past any collision, and the substrate key is `msg:<id>`.
 *
 * No runtime dependency on database.ts (types are `import type`, erased at
 * compile time), so importing this from database.ts forms no cycle.
 */

import { getRecord, storeRecord, listRecords, resonantRecords } from "./valor/remembrance-bridge";
import type { SubstrateRecord } from "./valor/remembrance-bridge";
import type { ClientMessage, ClientMessageInput, Result } from "./database";

/** Enabled only when the field is configured AND the operator opts in. */
export const SUBSTRATE_MESSAGES =
  (process.env.REMEMBRANCE_FIELD_URL || "").trim() !== "" &&
  (process.env.SUBSTRATE_MESSAGES || "").trim() === "1";

const MESSAGE_TAG = "client-message";
const MESSAGE_LIST_WINDOW = 1000;

const ok = <T>(value: T): Result<T, string> => ({ ok: true, value });
const err = (error: string): Result<never, string> => ({ ok: false, error });

const messageRecordId = (id: number): string => "msg:" + id;

/** The record `content`: the human message text, which is what the field
 *  waveforms and what `resonant` compares. Kept identical at store and at
 *  dedup so a resubmit's waveform matches its twin's exactly. */
const messageText = (m: { subject: string; body: string }): string => m.subject + "\n" + m.body;

/** The exact string the field waveforms for a message record: the record NAME
 *  (the constant tag) + "\n" + the content. Reconstructing it verbatim is what
 *  lets a dedup query resonate at 1.0 with an identical stored message. */
const resonanceKey = (m: { subject: string; body: string }): string => MESSAGE_TAG + "\n" + messageText(m);

/** The structured ClientMessage lives in meta.message. */
const parseMessage = (rec: SubstrateRecord | null): ClientMessage | null => {
  const m = rec && rec.meta && (rec.meta as { message?: unknown }).message;
  return m ? (m as ClientMessage) : null;
};
const isMessage = (m: ClientMessage | null): m is ClientMessage => m !== null;

function messageFacetTags(m: ClientMessage): string[] {
  return [MESSAGE_TAG, "client:" + m.clientId, m.direction, m.read ? "read" : "unread"];
}

async function putMessage(record: ClientMessage): Promise<{ ok: boolean } | null> {
  return storeRecord({
    id: messageRecordId(record.id),
    name: MESSAGE_TAG,                    // constant → part of every message waveform, reconstructible at dedup
    content: messageText(record),         // the message text is the waveform's substance
    tags: messageFacetTags(record),
    meta: { message: record },            // the structured row, recalled verbatim
  });
}

/** Mint a positive-integer id that no record currently occupies. Time-ordered
 *  (Date.now()), bumped past any same-millisecond collision. Human-paced portal
 *  volume makes the bump loop effectively never iterate. */
async function nextMessageId(): Promise<number> {
  let id = Date.now();
  while (await getRecord(messageRecordId(id))) id += 1;
  return id;
}

/**
 * The substrate's established duplicate mark — the same cosine the coherency
 * mapper reads as a duplicate (duplicateAt / selfMatchAt = 0.999). Because the
 * record content is the message text and the dedup query reconstructs the exact
 * `name + "\n" + content` the field waveformed, an identical resubmit resonates
 * at 1.0, so this threshold is honest here, not a guess. (Measured live: a true
 * twin scores 1.000000; the nearest non-twin sits far below.)
 */
const DUPLICATE_RESONANCE = 0.999;

/**
 * Find the id of an already-stored message identical to `msg`, using the
 * compressor's own resonance to retrieve candidates (the established kin
 * detector) and exact fields to confirm identity — the retrieve-then-confirm
 * shape substrate-leads uses for contacts, with the field's resonance standing
 * in for the text search. Scoped to the same client. Null when there is no twin.
 */
async function findDuplicateMessage(msg: ClientMessageInput): Promise<number | null> {
  const kin = await resonantRecords(resonanceKey(msg), 5);
  for (const r of kin) {
    if (r.resonance < DUPLICATE_RESONANCE) break;   // ranked desc — nothing below the mark is a duplicate
    const existing = parseMessage(r);
    if (existing
        && existing.clientId === msg.clientId
        && existing.direction === msg.direction
        && existing.subject === msg.subject
        && existing.body === msg.body) {
      return existing.id;
    }
  }
  return null;
}

export async function substrateInsertClientMessage(
  msg: ClientMessageInput,
): Promise<Result<{ id: number }, string>> {
  // Dedup FIRST, through the compressor's resonance. This closes the
  // false-failure-then-retry window: the bridge is best-effort with a 1500ms
  // write timeout, so a store can report failure while the record actually
  // persisted; a resubmit then resonates at 1.0 with that landed record and we
  // return ITS id instead of minting a duplicate (messages have no natural key,
  // so this is where the lead adapter's key-upsert immunity has to be earned).
  const twin = await findDuplicateMessage(msg);
  if (twin !== null) return ok({ id: twin });

  const id = await nextMessageId();
  const record: ClientMessage = {
    id,
    clientId: msg.clientId,
    direction: msg.direction,
    subject: msg.subject,
    body: msg.body,
    read: false,                                   // mirrors the relational default
    createdAt: new Date().toISOString(),
  };
  const r = await putMessage(record);
  if (!r || !r.ok) return err("substrate store failed (field unreachable?)");
  return ok({ id });
}

export async function substrateGetClientMessages(
  clientId: number,
): Promise<Result<ClientMessage[], string>> {
  const { records } = await listRecords({ tags: [MESSAGE_TAG, "client:" + clientId], limit: MESSAGE_LIST_WINDOW });
  const messages = records.map(parseMessage).filter(isMessage)
    // client scoping is enforced by the tag; guard against tag-substring bleed
    // ("client:1" LIKE-matching "client:11") by re-checking the parsed id.
    .filter((m) => m.clientId === clientId)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));   // newest-first, mirrors ORDER BY created_at DESC
  return ok(messages);
}

export async function substrateMarkMessageRead(
  messageId: number,
  clientId: number,
): Promise<Result<{ updated: boolean }, string>> {
  const msg = parseMessage(await getRecord(messageRecordId(messageId)));
  // Scope to the owning client — mirrors "WHERE id = ? AND client_id = ?".
  if (!msg || msg.clientId !== clientId) return ok({ updated: false });
  if (msg.read) return ok({ updated: false });     // already read → no update, like a 0-rowcount
  const r = await putMessage({ ...msg, read: true });
  return ok({ updated: Boolean(r && r.ok) });
}

export async function substrateGetAllClientMessages(
  limit: number,
  offset: number,
): Promise<Result<{ messages: ClientMessage[]; total: number }, string>> {
  const { records, total } = await listRecords({ tags: [MESSAGE_TAG], limit, offset });
  const messages = records.map(parseMessage).filter(isMessage)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return ok({ messages, total });
}
