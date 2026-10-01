/**
 * Client messages and documents on the substrate (opt-in).
 *
 * Routes portal-message and portal-document reads/writes to the field's
 * `legacy` record store instead of the relational adapter — one message = one
 * record (id `msg:<numericId>`), one document = one record (id `doc:<numericId>`).
 * database.ts delegates here when SUBSTRATE_MESSAGES is enabled; otherwise the
 * relational adapter is used. A deliberate, reversible opt-in — the relational
 * adapter stays the DEFAULT, so production is unchanged unless the operator
 * sets the flag.
 *
 * STORAGE SHAPE — compressor-native. A message record's `content` is the
 * message TEXT (subject + body); the structured ClientMessage lives in
 * `meta.message`. The field waveforms `name + "\n" + content`, so the record's
 * OWN coherence and resonance are about the message — which is what makes
 * `recall`/`resonant` over messages meaningful, and what makes the retry
 * dedup below work: an identical resubmit resonates at ~1.0 with its twin.
 * (Measured: with JSON content the true twin did not even rank.)
 *
 * Every read and write goes through the bridge's strict record store:
 * an outage is an error, never an empty inbox or a silent "not updated".
 *
 * The routes' id contract is a POSITIVE INTEGER (markMessageRead validates
 * Number.isInteger(id) && id > 0), so ids are minted time-ordered (Date.now())
 * and inserted atomically — a same-millisecond collision bumps, never overwrites.
 *
 * No runtime dependency on database.ts (types are `import type`, erased at
 * compile time), so importing this from database.ts forms no cycle.
 */

import {
  getRecordStrict, listAllStrict, listPageStrict, newestFirst, parseJson, resonantRecords, storeGuardedStrict, storeStrict,
  type FieldResult, type RecordInput, type SubstrateRecord,
} from "./valor/remembrance-bridge";
import type { ClientDocument, ClientDocumentInput, ClientMessage, ClientMessageInput, Result } from "./database";

/** Enabled only when the field is configured AND the operator opts in. */
export const SUBSTRATE_MESSAGES =
  (process.env.REMEMBRANCE_FIELD_URL || "").trim() !== "" &&
  (process.env.SUBSTRATE_MESSAGES || "").trim() === "1";

const MESSAGE_TAG = "client-message";
const DOCUMENT_TAG = "client-document";
const PAGE = 200;

const ok = <T>(value: T): Result<T, string> => ({ ok: true, value });
const err = (error: string): Result<never, string> => ({ ok: false, error });

/**
 * Mint a positive-integer id (time-ordered, collision-bumped) and insert the
 * record under it atomically: the guarded insert refuses an id already taken,
 * so two writers in the same millisecond never overwrite each other.
 */
async function insertWithMintedId(toRecord: (id: number) => RecordInput, uniqueTag: string): Promise<FieldResult<number>> {
  let id = Date.now();
  for (let attempt = 0; attempt < 50; attempt++, id++) {
    const r = await storeGuardedStrict(toRecord(id), { tags: [uniqueTag], max: Number.MAX_SAFE_INTEGER });
    if (!r.ok) return r;
    if (r.value.outcome === "inserted") return { ok: true, value: id };
  }
  return { ok: false, error: "could not mint a free id after 50 attempts" };
}

const messageRecordId = (id: number): string => "msg:" + id;
const documentRecordId = (id: number): string => "doc:" + id;
const byCreated = (row: { createdAt: string }) => row.createdAt;

/** The record `content`: the human message text, which is what the field
 *  waveforms and what `resonant` compares. Kept identical at store and at
 *  dedup so a resubmit's waveform matches its twin's exactly. */
const messageText = (m: { subject: string; body: string }): string => m.subject + "\n" + m.body;

/** The exact string the field waveforms for a message record: the record NAME
 *  (the constant tag) + "\n" + the content. */
const resonanceKey = (m: { subject: string; body: string }): string => MESSAGE_TAG + "\n" + messageText(m);

/** The structured ClientMessage lives in meta.message. */
const parseMessage = (rec: SubstrateRecord | null): ClientMessage | null => {
  const m = rec && rec.meta && (rec.meta as { message?: unknown }).message;
  return m ? (m as ClientMessage) : null;
};
const isMessage = (m: ClientMessage | null): m is ClientMessage => m !== null;
const toMessages = (records: SubstrateRecord[]): ClientMessage[] => records.map(parseMessage).filter(isMessage);

function messageRecord(m: ClientMessage) {
  return {
    id: messageRecordId(m.id),
    name: MESSAGE_TAG,                    // constant → part of every message waveform, reconstructible at dedup
    content: messageText(m),              // the message text is the waveform's substance
    tags: [MESSAGE_TAG, "client:" + m.clientId, m.direction, m.read ? "read" : "unread"],
    meta: { message: m },                 // the structured row, recalled verbatim
  };
}

/**
 * The substrate's established duplicate mark — the same cosine the coherency
 * mapper reads as a duplicate (duplicateAt / selfMatchAt = 0.999). An
 * identical resubmit resonates at 1.0 (measured live), so the threshold is
 * honest here, not a guess.
 */
const DUPLICATE_RESONANCE = 0.999;

/**
 * How long an identical message counts as a RETRY of one that already landed.
 * SQL keeps every message; the dedup exists only to absorb a write that timed
 * out after persisting and was resubmitted. A client who writes "Thank you"
 * again tomorrow is sending a new message, so the window is short.
 */
const RETRY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Find the id of a message identical to `msg` that landed within the retry
 * window — the compressor's resonance retrieves candidates, exact fields
 * confirm identity. Best-effort by design: if resonance is unavailable, no
 * twin is found and the message is stored (SQL itself never dedups).
 */
async function findRetriedMessage(msg: ClientMessageInput): Promise<number | null> {
  const kin = await resonantRecords(resonanceKey(msg), 10);
  const cutoff = Date.now() - RETRY_WINDOW_MS;
  for (const r of kin) {
    if (r.resonance < DUPLICATE_RESONANCE) break;   // ranked desc — nothing below the mark is a twin
    const existing = parseMessage(r);
    if (existing
        && existing.clientId === msg.clientId
        && existing.direction === msg.direction
        && existing.subject === msg.subject
        && existing.body === msg.body
        && Date.parse(existing.createdAt) > cutoff) {
      return existing.id;
    }
  }
  return null;
}

export async function substrateInsertClientMessage(
  msg: ClientMessageInput,
): Promise<Result<{ id: number }, string>> {
  if (!msg || !Number.isInteger(msg.clientId) || typeof msg.subject !== "string" || typeof msg.body !== "string") {
    return err("clientId, subject and body are required");
  }
  const twin = await findRetriedMessage(msg);
  if (twin !== null) return ok({ id: twin });

  const createdAt = new Date().toISOString();
  const r = await insertWithMintedId((id) => messageRecord({
    id,
    clientId: msg.clientId,
    direction: msg.direction,
    subject: msg.subject,
    body: msg.body,
    read: false,                                   // mirrors the relational default
    createdAt,
  }), MESSAGE_TAG);
  return r.ok ? ok({ id: r.value }) : err(r.error);
}

/** SQL: WHERE client_id = ? ORDER BY created_at DESC — every message, unbounded. */
export async function substrateGetClientMessages(
  clientId: number,
): Promise<Result<ClientMessage[], string>> {
  const found = await listAllStrict([MESSAGE_TAG, "client:" + clientId]);
  if (!found.ok) return err(found.error);
  return ok(newestFirst(toMessages(found.value).filter((m) => m.clientId === clientId), byCreated));
}

/** SQL: UPDATE ... SET read = TRUE WHERE id = ? AND client_id = ? → updated = the row matched. */
export async function substrateMarkMessageRead(
  messageId: number,
  clientId: number,
): Promise<Result<{ updated: boolean }, string>> {
  const rec = await getRecordStrict(messageRecordId(messageId));
  if (!rec.ok) return err(rec.error);
  const msg = parseMessage(rec.value);
  if (!msg || msg.clientId !== clientId) return ok({ updated: false });
  if (msg.read) return ok({ updated: true });     // the row matched; setting read again changes nothing
  const r = await storeStrict(messageRecord({ ...msg, read: true }));
  return r.ok ? ok({ updated: true }) : err(r.error);
}

/** SQL: ORDER BY created_at DESC LIMIT ? OFFSET ?, total = COUNT(*). */
export async function substrateGetAllClientMessages(
  limit: number,
  offset: number,
): Promise<Result<{ messages: ClientMessage[]; total: number }, string>> {
  const want = Math.max(0, Math.floor(Number(limit) || 0));
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const out: ClientMessage[] = [];
  let at = start;
  let total = -1;
  do {
    const n = Math.max(1, Math.min(PAGE, want - out.length));
    const page = await listPageStrict([MESSAGE_TAG], n, at);
    if (!page.ok) return err(page.error);
    total = page.value.total;
    out.push(...toMessages(page.value.records));
    at += n;
    if (page.value.records.length === 0) break;
  } while (out.length < want && at < total);
  return ok({ messages: newestFirst(out, byCreated).slice(0, want), total });
}

// --- Documents -----------------------------------------------------------------

const isDocument = (d: ClientDocument | null): d is ClientDocument => d !== null;

function documentRecord(d: ClientDocument) {
  return {
    id: documentRecordId(d.id),
    name: d.name || documentRecordId(d.id),
    content: JSON.stringify(d),
    tags: [DOCUMENT_TAG, "client:" + d.clientId],
  };
}

export async function substrateInsertClientDocument(
  doc: ClientDocumentInput,
): Promise<Result<{ id: number }, string>> {
  if (!doc || !Number.isInteger(doc.clientId) || !doc.name || !doc.url) return err("clientId, name and url are required");
  const createdAt = new Date().toISOString();
  const r = await insertWithMintedId((id) => documentRecord({
    id, clientId: doc.clientId, name: doc.name, url: doc.url, type: doc.type, createdAt,
  }), DOCUMENT_TAG);
  return r.ok ? ok({ id: r.value }) : err(r.error);
}

/** SQL: WHERE client_id = ? ORDER BY created_at DESC. */
export async function substrateGetClientDocuments(
  clientId: number,
): Promise<Result<ClientDocument[], string>> {
  const found = await listAllStrict([DOCUMENT_TAG, "client:" + clientId]);
  if (!found.ok) return err(found.error);
  const docs = found.value.map((r) => parseJson<ClientDocument>(r.content)).filter(isDocument)
    .filter((d) => d.clientId === clientId);
  return ok(newestFirst(docs, byCreated));
}
