type KisUsDebugEntry = {
  id: number;
  at: string;
  tag: string;
  data: any;
};

const MAX_ENTRIES = 200;

function maskSecret(value: string | undefined) {
  if (!value) return value;
  if (value.length <= 8) return "[MASKED]";
  return `${value.slice(0, 4)}...[MASKED]...${value.slice(-4)}`;
}

function sanitizeHeaders(headers: Record<string, string | undefined>) {
  const out: Record<string, string | undefined> = { ...headers };
  if (out.Authorization) out.Authorization = maskSecret(out.Authorization);
  if (out.appsecret) out.appsecret = maskSecret(out.appsecret);
  if (out.appkey) out.appkey = maskSecret(out.appkey);
  return out;
}

function getStore() {
  const g = globalThis as any;
  if (!g.__kisUsDebugStore) {
    g.__kisUsDebugStore = { nextId: 1, entries: [] as KisUsDebugEntry[] };
  }
  return g.__kisUsDebugStore as { nextId: number; entries: KisUsDebugEntry[] };
}

export function pushKisUsDebugLog(tag: string, data: any) {
  const store = getStore();
  const entry: KisUsDebugEntry = {
    id: store.nextId++,
    at: new Date().toISOString(),
    tag,
    data,
  };
  store.entries.push(entry);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries.splice(0, store.entries.length - MAX_ENTRIES);
  }
}

export function getKisUsDebugLogs(sinceId?: number) {
  const store = getStore();
  if (!sinceId) return store.entries;
  return store.entries.filter((e) => e.id > sinceId);
}

export function buildKisUsRequestDebug(method: string, url: string, headers: Record<string, string | undefined>) {
  return {
    method,
    url,
    headers: sanitizeHeaders(headers),
  };
}
