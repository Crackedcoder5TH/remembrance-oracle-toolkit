/**
 * Client messages on the substrate (opt-in).
 *
 * Routes portal-message reads/writes to the field's `legacy` record store via
 * the bridge (storeRecord / getRecord / listRecords) instead of the relational
 * adapter — one message = one record (id `msg:<numericId>`, content = JSON,
 * facet tags for client-scoped + read/unread queries). database.ts delegates
 * here when SUBSTRATE_MESSAGES is enabled; otherwise the relational adapter is
 * used. A deliberate, reversible opt-in — the relational adapter stays the
 * DEFAULT, so production is unchanged unless the operator sets the flag.
 *
 * Why messages fit the substrate: free-form support threads are exactly the
 * kind of text the field scores and (later) resonance-searches — the value the
 * relational LIKE cannot give. Portal message volume is human-paced, so the
 * store's tag-scoped list is the right retrieval shape.
 *
 * The routes' id contract is a POSITIVE INTEGER (markMessageRead validates
 * Number.isInteger(id) && id > 0), so ids are minted as a time-ordered integer
 * (Date.now()), bumped past any collision, and the substrate key is
 * `msg:<id>`. No UUIDs cross the wire — the numeric contract is preserved.
 *
 * No runtime dependency on database.ts (types are `import type`, erased at
 * compile time), so importing this from database.ts forms no cycle.
 */

import { getRecord, storeRecord, listRecords } from "./valor/remembrance-bridge";
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
const parseMessage = (content: string): ClientMessage | null => {
  try { return JSON.parse(content) as ClientMessage; } catch { return null; }
};
const isMessage = (m: ClientMessage | null): m is ClientMessage => m !== null;

function messageFacetTags(m: ClientMessage): string[] {
  return [MESSAGE_TAG, "client:" + m.clientId, m.direction, m.read ? "read" : "unread"];
}

/** Mint a positive-integer id that no record currently occupies. Time-ordered
 *  (Date.now()), bumped past any same-millisecond collision. Human-paced portal
 *  volume makes the bump loop effectively never iterate. */
async function nextMessageId(): Promise<number> {
  let id = Date.now();
  // A record already at this key means two writes landed in the same ms — step
  // forward until the slot is free so an upsert never clobbers a real message.
  while (await getRecord(messageRecordId(id))) id += 1;
  return id;
}

export async function substrateInsertClientMessage(
  msg: ClientMessageInput,
): Promise<Result<{ id: number }, string>> {
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
  const r = await storeRecord({
    id: messageRecordId(id),
    name: messageRecordId(id),
    content: JSON.stringify(record),
    tags: messageFacetTags(record),
  });
  if (!r || !r.ok) return err("substrate store failed (field unreachable?)");
  return ok({ id });
}

export async function substrateGetClientMessages(
  clientId: number,
): Promise<Result<ClientMessage[], string>> {
  const { records } = await listRecords({ tags: [MESSAGE_TAG, "client:" + clientId], limit: MESSAGE_LIST_WINDOW });
  const messages = records.map((r) => parseMessage(r.content)).filter(isMessage)
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
  const rec = await getRecord(messageRecordId(messageId));
  const msg = rec ? parseMessage(rec.content) : null;
  // Scope to the owning client — mirrors "WHERE id = ? AND client_id = ?".
  if (!msg || msg.clientId !== clientId) return ok({ updated: false });
  if (msg.read) return ok({ updated: false });     // already read → no update, like a 0-rowcount
  const updated: ClientMessage = { ...msg, read: true };
  const r = await storeRecord({
    id: messageRecordId(messageId),
    name: messageRecordId(messageId),
    content: JSON.stringify(updated),
    tags: messageFacetTags(updated),
  });
  return ok({ updated: Boolean(r && r.ok) });
}

export async function substrateGetAllClientMessages(
  limit: number,
  offset: number,
): Promise<Result<{ messages: ClientMessage[]; total: number }, string>> {
  const { records, total } = await listRecords({ tags: [MESSAGE_TAG], limit, offset });
  const messages = records.map((r) => parseMessage(r.content)).filter(isMessage)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return ok({ messages, total });
}
