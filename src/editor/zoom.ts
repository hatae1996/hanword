/**
 * 화면 확대/축소 — 문서(종이)만 키우고 메뉴는 그대로 둔다. 저장되는 문서에는 영향 없음.
 *
 *  - Ctrl + 마우스 휠: 마우스가 가리키는 곳을 중심으로 확대/축소 (노트북 터치패드 손가락 벌리기도 동작)
 *  - Ctrl + = / Ctrl + - : 10% 씩,  Ctrl + 0 : 100%
 *  - 상태 표시줄의 배율 표시를 누르면 100% 로
 * 브라우저/앱 자체의 화면 확대(메뉴까지 커지는 것)는 막는다.
 */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
const STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];
const STORAGE_KEY = 'hanword.zoom';

export interface ZoomOptions {
  desk: HTMLElement; // 스크롤되는 영역
  page: HTMLElement; // 확대할 종이
  onChange?: (zoom: number) => void;
}

export function setupZoom({ desk, page, onChange }: ZoomOptions) {
  let zoom = 1;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_ZOOM && saved <= MAX_ZOOM) zoom = saved;
  } catch {
    /* 저장소를 못 쓰는 환경 — 100% 로 시작 */
  }

  const apply = (z: number, anchor?: { x: number; y: number }) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
    if (next === zoom && page.style.zoom) return;
    // 기준점(마우스 위치)이 확대 후에도 같은 자리에 오도록 스크롤을 보정
    const rect = desk.getBoundingClientRect();
    const ax = anchor ? anchor.x - rect.left : desk.clientWidth / 2;
    const ay = anchor ? anchor.y - rect.top : desk.clientHeight / 2;
    const contentX = desk.scrollLeft + ax;
    const contentY = desk.scrollTop + ay;
    const ratio = next / zoom;
    zoom = next;
    page.style.zoom = String(zoom);
    desk.scrollLeft = contentX * ratio - ax;
    desk.scrollTop = contentY * ratio - ay;
    try {
      localStorage.setItem(STORAGE_KEY, String(zoom));
    } catch {
      /* 무시 */
    }
    onChange?.(zoom);
  };

  const step = (dir: 1 | -1) => {
    const pct = Math.round(zoom * 100);
    const next = dir > 0 ? STEPS.find((s) => s > pct) ?? STEPS[STEPS.length - 1] : [...STEPS].reverse().find((s) => s < pct) ?? STEPS[0];
    apply(next / 100);
  };

  // Ctrl + 휠: 휠 한 칸(약 100)에 10% 남짓, 터치패드는 작은 값이 연속으로 들어와 부드럽게 바뀐다
  desk.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // 줄 단위 → 픽셀 근사
      apply(zoom * Math.exp(-delta * 0.001), { x: e.clientX, y: e.clientY });
    },
    { passive: false },
  );
  // 문서 밖(메뉴 위)에서 Ctrl+휠 을 굴려도 앱 전체가 확대되지 않게
  window.addEventListener(
    'wheel',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !desk.contains(e.target as Node)) e.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
      e.preventDefault();
      step(1);
    } else if (e.key === '-' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      step(-1);
    } else if (e.key === '0' || e.code === 'Numpad0') {
      e.preventDefault();
      apply(1);
    }
  });

  page.style.zoom = String(zoom);
  onChange?.(zoom);
  return { get: () => zoom, set: (z: number) => apply(z), step };
}
