/**
 * 자동 저장·복구 — 한글의 "복구용 임시 파일"처럼, 저장하지 않은 변경이 있으면 1분마다 복구본을 둔다.
 * 앱이 갑자기 꺼졌다 다시 켜지면 복구할지 묻는다. 저장하거나 "저장하지 않고 닫기"를 고르면 지운다.
 *
 * 복구본은 이 PC 의 앱 저장소(IndexedDB)에만 있다. 그림이 든 문서도 담을 수 있도록 localStorage 대신 IndexedDB.
 */
const DB = 'hanword';
const STORE = 'kv';
const KEY = 'recovery';

export interface Snapshot {
  json: unknown;
  title: string;
  page: unknown;
  path?: string;
  fileName?: string;
  format?: string;
  savedAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const kvGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key));
export const kvDel = (key: string) => run('readwrite', (s) => s.delete(key));

export const loadRecovery = () => kvGet<Snapshot>(KEY).catch(() => undefined);
export const clearRecovery = () => kvDel(KEY).catch(() => undefined);

export function setupAutosave(opts: { isDirty: () => boolean; snapshot: () => Snapshot; intervalMs?: number }) {
  let last = '';
  const save = async () => {
    if (!opts.isDirty()) return;
    const snap = opts.snapshot();
    const key = JSON.stringify(snap.json) + snap.title;
    if (key === last) return; // 바뀐 게 없으면 다시 쓰지 않는다
    try {
      await kvSet(KEY, snap);
      last = key;
    } catch (e) {
      console.warn('복구본 저장 실패', e);
    }
  };
  const timer = window.setInterval(() => void save(), opts.intervalMs ?? 60_000);
  // 창을 내리거나 닫기 직전에도 한 번
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void save();
  });
  return {
    saveNow: save,
    /** 저장했을 때 — 복구본을 지우고 기억도 비운다 */
    reset: () => {
      last = '';
      return clearRecovery();
    },
    stop: () => window.clearInterval(timer),
  };
}
