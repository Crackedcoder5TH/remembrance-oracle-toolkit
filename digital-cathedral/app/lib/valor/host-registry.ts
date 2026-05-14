/**
 * Host Registry — `is_host` opt-in flag for merit subjects.
 *
 * Implements the Abundance Hosts portion of the Remembrance Agent
 * Access Spec v1.1.0. A subject (agent or human) at MERIT tier may
 * flip `is_host = true` here to receive routed submissions; demoting
 * to BASIC implicitly disables hosting at routing time even if the
 * flag is still on.
 *
 * Storage: small JSON file co-located with the lead-ledger config dir.
 * On Vercel this won't persist across cold starts — that's a known
 * limitation we share with pricing-config and agent-analytics. A blob
 * adapter mirroring lead-ledger's pattern is the obvious upgrade and
 * is tracked separately. For local dev / single-instance deploys the
 * file is fine.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const HOSTS_DIR = process.env.HOST_REGISTRY_DIR
  ?? join(process.cwd(), ".valor", "hosts");
const HOSTS_FILE = join(HOSTS_DIR, "host-registry.json");

interface HostEntry {
  readonly subjectId: string;
  readonly enabledAt: string;
  readonly note?: string;
}

interface HostFile {
  readonly hosts: Record<string, HostEntry>;
}

async function readFileSafe(): Promise<HostFile> {
  try {
    const raw = await readFile(HOSTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as HostFile;
    if (!parsed.hosts || typeof parsed.hosts !== "object") return { hosts: {} };
    return parsed;
  } catch {
    return { hosts: {} };
  }
}

async function writeFileSafe(file: HostFile): Promise<void> {
  await mkdir(HOSTS_DIR, { recursive: true });
  await writeFile(HOSTS_FILE, JSON.stringify(file, null, 2), "utf-8");
}

/** Is this subject currently flagged as a host? Tier check happens elsewhere. */
export async function isHost(subjectId: string): Promise<boolean> {
  const file = await readFileSafe();
  return Boolean(file.hosts[subjectId]);
}

/** Toggle host status. Tier validation MUST happen at the call site. */
export async function setHost(
  subjectId: string,
  enabled: boolean,
  note?: string,
): Promise<void> {
  const file = await readFileSafe();
  const next: HostFile = { hosts: { ...file.hosts } };
  if (enabled) {
    next.hosts[subjectId] = {
      subjectId,
      enabledAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    };
  } else {
    delete next.hosts[subjectId];
  }
  await writeFileSafe(next);
}

/** List every subject_id currently flagged as host. */
export async function listHosts(): Promise<readonly string[]> {
  const file = await readFileSafe();
  return Object.keys(file.hosts);
}
