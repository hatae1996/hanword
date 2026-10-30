/** 최근 문서 — 데스크톱 앱에서 열거나 저장한 파일 경로 10개 (이 PC 에만) */
const KEY = 'hanword.recent';
const MAX = 10;

export interface RecentFile {
  path: string;
  name: string;
  at: string;
}

export function recentFiles(): RecentFile[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.path === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecent(path: string, name: string) {
  const same = (a: string) => a.toLowerCase() === path.toLowerCase(); // Windows 경로는 대소문자 구분 없음
  const list = [{ path, name, at: new Date().toISOString() }, ...recentFiles().filter((r) => !same(r.path))].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function removeRecent(path: string) {
  localStorage.setItem(KEY, JSON.stringify(recentFiles().filter((r) => r.path !== path)));
}

export function whenText(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `오늘 ${hm}` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}
