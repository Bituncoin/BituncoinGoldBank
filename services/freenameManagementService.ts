/**
 * services/freenameManagementService.ts
 * Freename Web2/Web3 Mirroring API — Authenticated Management
 *
 * Controllers:
 *  1. Authentication  — POST /api/v1/auth/login  (→ auth0ApiService.ts)
 *  2. Zones           — 8 endpoints (GET/POST/PATCH)
 *  3. Users           — GET (read-only via Auth0)
 *  4. Records         — GET/POST/PUT/DELETE
 *  5. Profile Registries — GET/POST/PUT
 *
 * All mutating operations require: Authorization: Bearer <access_token>
 *
 * Pagination params: page (0-based), pageSize (default 25), sortBy (default "name")
 * Zone statuses: OK | INACTIVE | LOCK | PENDING | ERROR
 *
 * Base: https://apis.freename.io
 */

const MGMT_BASE = 'https://apis.freename.io';
const TIMEOUT_MS = 8000;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function abort(ms: number) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Authenticated fetch — extracts json.data for single-object endpoints. */
async function mgmtFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const { signal, clear } = abort(TIMEOUT_MS);
  try {
    const res = await fetch(`${MGMT_BASE}${path}`, {
      ...options,
      headers: { ...bearer(token), ...(options?.headers ?? {}) },
      signal,
    });
    clear();
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      return { data: null, error: `HTTP ${res.status}: ${body}` };
    }
    const json = await res.json();
    // Single-object endpoints return { data: {...} }
    const payload = json?.data !== undefined ? json.data : json;
    return { data: payload as T, error: null };
  } catch (e: any) {
    clear();
    return { data: null, error: e?.message ?? 'Network error' };
  }
}

/** Authenticated fetch — returns full raw JSON for paginated list endpoints. */
async function mgmtFetchRaw(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<{ json: any | null; error: string | null }> {
  const { signal, clear } = abort(TIMEOUT_MS);
  try {
    const res = await fetch(`${MGMT_BASE}${path}`, {
      ...options,
      headers: { ...bearer(token), ...(options?.headers ?? {}) },
      signal,
    });
    clear();
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      return { json: null, error: `HTTP ${res.status}: ${body}` };
    }
    const json = await res.json();
    return { json, error: null };
  } catch (e: any) {
    clear();
    return { json: null, error: e?.message ?? 'Network error' };
  }
}

// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// SHARED TYPES
// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

/** Zone lifecycle states (includes LOCK — not just the 4 from the overview docs). */
export type ZoneStatus = 'OK' | 'INACTIVE' | 'LOCK' | 'PENDING' | 'ERROR';

/**
 * Inline DNS/crypto record embedded inside a zone detail response.
 * Differs from FreenameRecordMgmt (which comes from the /records API).
 */
export interface FreenameZoneInlineRecord {
  uuid:     string;
  /** Record type: A, NS, SOA, ETH, BTC, MATIC, SOL, etc. */
  type:     string;
  /** Record name / label */
  name:     string;
  /** Record value (wallet address, IP, CNAME target…) */
  value:    string;
  ttl:      number;
  // SOA-specific fields (only present when type === 'SOA')
  serial?:  number;
  refresh?: number;
  retry?:   number;
  expire?:  number;
  mname?:   string;
  rname?:   string;
}

/** Registrar / registrant contact block returned in zone details. */
export interface FreenameContact {
  name?:          string;
  street?:        string;
  city?:          string;
  postalCode?:    string;
  country?:       string;
  phone?:         string;
  email?:         string;
  web?:           string;
  walletAddress?: string;
}

/** Full zone object from management API (GET /api/v1/zones/{uuid} etc.). */
export interface FreenameZoneMgmt {
  uuid:              string;
  name:              string;
  asciiName?:        string;
  status:            ZoneStatus;
  chain?:            string;
  tld?:              string;
  sld?:              string;
  registrationDate?: string | null;
  createdAt?:        string;
  updatedAt?:        string;
  expirationDate?:   string | null;
  /** Inline DNS/crypto records — present on single-zone endpoints. */
  records?:          FreenameZoneInlineRecord[];
  registrar?:        FreenameContact;
  registrant?:       FreenameContact;
  registry?:         Record<string, any>;
  /** Associated profile registry — if assigned. */
  profileRegistry?:  { uuid: string; name: string; type: string } | null;
}

/** Paginated zone list envelope returned by list endpoints. */
export interface FreenamePageResponse<T> {
  data:           T[];
  size:           number;
  page:           number;
  totalPages:     number;
  totalElements?: number;
}

// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// 2. ZONES — 8 endpoints
// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

/**
 * 1. Fetch zone details by UUID.
 * GET /api/v1/zones/{uuid}
 * Response includes inline records[], registrar, registrant.
 */
export async function getZoneByUuid(
  uuid: string,
  token: string,
): Promise<{ zone: FreenameZoneMgmt | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameZoneMgmt>(
    `/api/v1/zones/${encodeURIComponent(uuid)}`,
    token,
  );
  return { zone: data, error };
}

/**
 * 2. Fetch zones with pagination.
 * GET /api/v1/zones?page=0&pageSize=25&sortBy=name
 * Returns paginated list envelope: { data: [...], size, page, totalPages }
 */
export async function getAllZones(
  token: string,
  page    = 0,
  pageSize = 25,
  sortBy  = 'name',
): Promise<{ zones: FreenameZoneMgmt[]; totalPages: number; error: string | null }> {
  const { json, error } = await mgmtFetchRaw(
    `/api/v1/zones?page=${page}&pageSize=${pageSize}&sortBy=${encodeURIComponent(sortBy)}`,
    token,
  );
  if (!json) return { zones: [], totalPages: 0, error };
  const zones      = Array.isArray(json.data) ? (json.data as FreenameZoneMgmt[]) : [];
  const totalPages = json.totalPages ?? 1;
  return { zones, totalPages, error: null };
}

/**
 * 3. Create zone.
 * POST /api/v1/zones?mint=false
 * mintingAddress + chain are mandatory when mint=true.
 */
export interface CreateZoneInput {
  name:               string;
  status?:            ZoneStatus;
  /** 'TLD' or 'SLD' */
  level?:             string;
  chain?:             string;
  description?:       string;
  image?:             string;
  url?:               string;
  records?:           Array<{ type: string; name: string; value: string; ttl?: string }>;
  registryUuid?:      string;
  registrarUuid?:     string;
  registrantUuid?:    string;
  mintingAddress?:    string;
  registrationDate?:  string;
}

export async function createZone(
  input: CreateZoneInput,
  token: string,
  mint = false,
): Promise<{ zone: FreenameZoneMgmt | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameZoneMgmt>(
    `/api/v1/zones?mint=${mint}`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return { zone: data, error };
}

/**
 * 4. Update zone status.
 * PATCH /api/v1/zones/{uuid}/?status={new_status}
 * Acceptable: OK | INACTIVE | LOCK | PENDING | ERROR
 */
export async function updateZoneStatus(
  uuid:   string,
  status: ZoneStatus,
  token:  string,
): Promise<{ zone: FreenameZoneMgmt | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameZoneMgmt>(
    `/api/v1/zones/${encodeURIComponent(uuid)}/?status=${encodeURIComponent(status)}`,
    token,
    { method: 'PATCH' },
  );
  return { zone: data, error };
}

/**
 * 5. Fetch zones of logged-in user.
 * GET /api/v1/zones/self?page=0&pageSize=25&sortBy=name
 */
export async function getMyZones(
  token: string,
  page     = 0,
  pageSize = 50,
  sortBy   = 'name',
): Promise<FreenameZoneMgmt[]> {
  const { json } = await mgmtFetchRaw(
    `/api/v1/zones/self?page=${page}&pageSize=${pageSize}&sortBy=${encodeURIComponent(sortBy)}`,
    token,
  );
  if (!json) return [];
  // Response: { data: [...] } where data is the array
  return Array.isArray(json.data) ? (json.data as FreenameZoneMgmt[]) : [];
}

/**
 * 6. Fetch zone by name (Whois-style lookup).
 * GET /api/v1/zones/name/{zone_name}
 * Returns full zone detail including inline records, registrar, registrant.
 */
export async function getZoneByName(
  zoneName: string,
  token:    string,
): Promise<{ zone: FreenameZoneMgmt | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameZoneMgmt>(
    `/api/v1/zones/name/${encodeURIComponent(zoneName)}`,
    token,
  );
  return { zone: data, error };
}

/**
 * 7. Check name availability.
 * GET /api/v1/zones/availability/{zone_name}
 * Response: { data: boolean }  — true = available.
 * Public endpoint (no auth required), but token accepted if present.
 */
export async function checkZoneAvailability(
  name: string,
): Promise<{ available: boolean; error: string | null }> {
  const { signal, clear } = abort(TIMEOUT_MS);
  try {
    const res = await fetch(
      `${MGMT_BASE}/api/v1/zones/availability/${encodeURIComponent(name)}`,
      { signal },
    );
    clear();
    if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    // Response: { data: false } — data is the boolean directly
    const available = typeof json?.data === 'boolean' ? json.data : Boolean(json?.data?.available ?? false);
    return { available, error: null };
  } catch (e: any) {
    clear();
    return { available: false, error: e?.message ?? 'Network error' };
  }
}

/**
 * 8. Transfer zone (registrar/registrant).
 * PATCH /api/v1/zones/transfer/{uuid}
 * Body: { registrar: "<uuid>", registrant: "<uuid>" }
 */
export interface TransferZoneInput {
  /** UUID of the new registrar */
  registrar?: string;
  /** UUID of the new registrant */
  registrant?: string;
}

export async function transferZone(
  uuid:  string,
  input: TransferZoneInput,
  token: string,
): Promise<{ zone: FreenameZoneMgmt | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameZoneMgmt>(
    `/api/v1/zones/transfer/${encodeURIComponent(uuid)}`,
    token,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return { zone: data, error };
}

/**
 * Convenience: search user's zones by name.
 * Uses the Whois endpoint (getZoneByName) for an exact name lookup.
 * Falls back to paginated scan if the name endpoint fails.
 */
export async function searchZoneByName(
  name:  string,
  token: string,
): Promise<FreenameZoneMgmt | null> {
  // Prefer the direct name endpoint
  const { zone } = await getZoneByName(name, token);
  if (zone) return zone;

  // Fallback: scan user's zones
  const myZones = await getMyZones(token);
  return myZones.find(z => z.name === name) ?? null;
}

// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// 3. USERS
// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

export interface FreenameUserMgmt {
  uuid:       string;
  username:   string;
  email:      string;
  role:       string;
  createdAt?: string;
}

/** GET /api/v1/users/me — current logged-in user. */
export async function getCurrentFreenameUser(
  token: string,
): Promise<FreenameUserMgmt | null> {
  const { data } = await mgmtFetch<FreenameUserMgmt>('/api/v1/users/me', token);
  return data;
}

/** GET /api/v1/users/{uuid} */
export async function getFreenameUserByUuid(
  uuid:  string,
  token: string,
): Promise<FreenameUserMgmt | null> {
  const { data } = await mgmtFetch<FreenameUserMgmt>(
    `/api/v1/users/${encodeURIComponent(uuid)}`,
    token,
  );
  return data;
}

/** GET /api/v1/users?page=0&pageSize=25 */
export async function getAllFreenameUsers(
  token: string,
  page     = 0,
  pageSize = 25,
): Promise<{ users: FreenameUserMgmt[]; totalPages: number; error: string | null }> {
  const { json, error } = await mgmtFetchRaw(
    `/api/v1/users?page=${page}&pageSize=${pageSize}`,
    token,
  );
  if (!json) return { users: [], totalPages: 0, error };
  const users      = Array.isArray(json.data) ? (json.data as FreenameUserMgmt[]) : [];
  const totalPages = json.totalPages ?? 1;
  return { users, totalPages, error: null };
}

// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// 4. RECORDS
// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

/** Record from the /records management API (includes zone reference). */
export interface FreenameRecordMgmt {
  uuid:       string;
  /** Record type: ETH, BTC, MATIC, A, CNAME, NS, SOL, etc. */
  type:       string;
  /** Record key: e.g. "token.ETH.0", "record.A.0" */
  key:        string;
  value:      string;
  zone:       { uuid: string; name: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface RecordInput {
  type:  string;
  key:   string;
  value: string;
}

export interface CreateRecordsInput {
  zoneUuid: string;
  records:  RecordInput[];
}

export interface CreateRecordsResult {
  success:  boolean;
  records?: FreenameRecordMgmt[];
  error?:   string;
}

export interface RecordOperationResult {
  success: boolean;
  record?: FreenameRecordMgmt;
  error?:  string;
}

/** GET /api/v1/records/{uuid} */
export async function getRecordByUuid(
  uuid:  string,
  token: string,
): Promise<{ record: FreenameRecordMgmt | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameRecordMgmt>(
    `/api/v1/records/${encodeURIComponent(uuid)}`,
    token,
  );
  return { record: data, error };
}

/** POST /api/v1/records — create records for a zone (records cannot exist without a zone). */
export async function createZoneRecords(
  input: CreateRecordsInput,
  token: string,
): Promise<CreateRecordsResult> {
  const { signal, clear } = abort(TIMEOUT_MS);
  try {
    const res = await fetch(`${MGMT_BASE}/api/v1/records`, {
      method:  'POST',
      headers: bearer(token),
      body:    JSON.stringify({
        zone:    { uuid: input.zoneUuid },
        records: input.records,
      }),
      signal,
    });
    clear();
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      return { success: false, error: `HTTP ${res.status}: ${body}` };
    }
    const json    = await res.json();
    const records = json?.data ?? json;
    return { success: true, records: Array.isArray(records) ? records : [] };
  } catch (e: any) {
    clear();
    return { success: false, error: e?.message ?? 'Network error' };
  }
}

/** PUT /api/v1/records/{uuid} */
export async function updateZoneRecord(
  uuid:  string,
  input: RecordInput,
  token: string,
): Promise<RecordOperationResult> {
  const { data, error } = await mgmtFetch<FreenameRecordMgmt>(
    `/api/v1/records/${encodeURIComponent(uuid)}`,
    token,
    { method: 'PUT', body: JSON.stringify(input) },
  );
  return { success: !error, record: data ?? undefined, error: error ?? undefined };
}

/** DELETE /api/v1/records/{uuid} */
export async function deleteZoneRecord(
  uuid:  string,
  token: string,
): Promise<{ success: boolean; error: string | null }> {
  const { signal, clear } = abort(TIMEOUT_MS);
  try {
    const res = await fetch(`${MGMT_BASE}/api/v1/records/${encodeURIComponent(uuid)}`, {
      method:  'DELETE',
      headers: bearer(token),
      signal,
    });
    clear();
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      return { success: false, error: `HTTP ${res.status}: ${body}` };
    }
    return { success: true, error: null };
  } catch (e: any) {
    clear();
    return { success: false, error: e?.message ?? 'Network error' };
  }
}

// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// 5. PROFILE REGISTRIES
// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

export interface FreenameProfileRegistry {
  uuid:       string;
  name:       string;
  type:       string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileRegistryInput {
  name: string;
  type: string;
}

/** GET /api/v1/profile-registries/{uuid} */
export async function getProfileRegistryByUuid(
  uuid:  string,
  token: string,
): Promise<FreenameProfileRegistry | null> {
  const { data } = await mgmtFetch<FreenameProfileRegistry>(
    `/api/v1/profile-registries/${encodeURIComponent(uuid)}`,
    token,
  );
  return data;
}

/** GET /api/v1/profile-registries?page=0&pageSize=25 */
export async function getAllProfileRegistries(
  token: string,
  page     = 0,
  pageSize = 25,
): Promise<FreenameProfileRegistry[]> {
  const { json } = await mgmtFetchRaw(
    `/api/v1/profile-registries?page=${page}&pageSize=${pageSize}`,
    token,
  );
  if (!json) return [];
  return Array.isArray(json.data) ? (json.data as FreenameProfileRegistry[]) : [];
}

/** GET /api/v1/profile-registries?type={type} */
export async function getProfileRegistriesByType(
  type:  string,
  token: string,
): Promise<FreenameProfileRegistry[]> {
  const { json } = await mgmtFetchRaw(
    `/api/v1/profile-registries?type=${encodeURIComponent(type)}&page=0&pageSize=50`,
    token,
  );
  if (!json) return [];
  return Array.isArray(json.data) ? (json.data as FreenameProfileRegistry[]) : [];
}

/** POST /api/v1/profile-registries */
export async function createProfileRegistry(
  input: ProfileRegistryInput,
  token: string,
): Promise<{ registry: FreenameProfileRegistry | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameProfileRegistry>(
    '/api/v1/profile-registries',
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return { registry: data, error };
}

/** PUT /api/v1/profile-registries/{uuid} */
export async function updateProfileRegistry(
  uuid:  string,
  input: ProfileRegistryInput,
  token: string,
): Promise<{ registry: FreenameProfileRegistry | null; error: string | null }> {
  const { data, error } = await mgmtFetch<FreenameProfileRegistry>(
    `/api/v1/profile-registries/${encodeURIComponent(uuid)}`,
    token,
    { method: 'PUT', body: JSON.stringify(input) },
  );
  return { registry: data, error };
}

// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// Composite helpers (zone + records together)
// ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

/**
 * Fetch the full Freename zone object for a given domain name.
 *
 * Resolution order:
 *  1. GET /api/v1/zones/name/{domainName}  (Whois endpoint — exact match, returns inline records)
 *  2. Fallback: scan user's own zones via GET /api/v1/zones/self
 */
export async function fetchZoneForDomain(
  domainName: string,
  token:      string,
): Promise<{ zone: FreenameZoneMgmt | null; error: string | null }> {
  // Primary: Whois-style name lookup (returns full zone with inline records)
  const { zone, error } = await getZoneByName(domainName, token);
  if (zone) return { zone, error: null };

  // Fallback: scan the user's zone list
  const myZones = await getMyZones(token);
  const found   = myZones.find(z => z.name === domainName) ?? null;
  if (found) return { zone: found, error: null };

  return {
    zone:  null,
    error: error ?? `Zone "${domainName}" not found in your Freename account`,
  };
}

/**
 * Sync Freename management records for a domain.
 *
 * Prefers inline records from the zone detail (getZoneByName).
 * Falls back to a separate /records API call when the zone detail has no inline records.
 *
 * Returns FreenameRecordMgmt-shaped objects so the caller can upsert into local DB.
 * DNS-only records (A, NS, SOA, CNAME, MX, TXT) are included — filter on the caller side.
 */
export async function syncZoneRecords(
  domainName: string,
  token:      string,
): Promise<{ records: FreenameRecordMgmt[]; zone: FreenameZoneMgmt | null; error: string | null }> {
  const { zone, error } = await fetchZoneForDomain(domainName, token);
  if (!zone || error) return { records: [], zone: null, error: error ?? 'Zone not found' };

  // Use inline records when available (from getZoneByName response)
  if (zone.records && zone.records.length > 0) {
    // Shape FreenameZoneInlineRecord → FreenameRecordMgmt for caller compatibility
    const shaped: FreenameRecordMgmt[] = zone.records.map(r => ({
      uuid:  r.uuid,
      type:  r.type,
      key:   r.name,          // name maps to key
      value: r.value,
      zone:  { uuid: zone.uuid, name: zone.name },
    }));
    return { records: shaped, zone, error: null };
  }

  // Fallback: fetch from /records API scoped to zone UUID
  const { json, error: recErr } = await mgmtFetchRaw(
    `/api/v1/records?zoneUuid=${encodeURIComponent(zone.uuid)}&page=0&pageSize=100`,
    token,
  );
  if (recErr) return { records: [], zone, error: recErr };

  const list = Array.isArray(json?.data) ? json.data : (json?.content ?? []);
  return { records: list as FreenameRecordMgmt[], zone, error: null };
}
