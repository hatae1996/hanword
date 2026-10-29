/**
 * 자동 업데이트 (데스크톱 앱 전용)
 *
 * 앱을 켜면 GitHub Releases 의 latest.json 을 확인해 새 버전이 있으면 알림 줄을 띄운다.
 * "지금 업데이트" → 내려받기(진행률 표시) → 서명 확인 → 설치 → 앱 다시 시작.
 * 업데이트 파일은 개인 키로 서명되어 있고, 앱에 든 공개 키로 검증하므로 위조된 파일은 설치되지 않는다.
 */
import { isDesktop } from './platform';

declare const __APP_VERSION__: string;

export async function appVersion(): Promise<string> {
  if (!isDesktop) return __APP_VERSION__;
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

interface Ui {
  isDirty: () => boolean;
  /** 저장 시도. 저장이 끝나 수정 사항이 없으면 true */
  save: () => Promise<boolean>;
  confirm: (text: string, ok: string, cancel: string) => Promise<boolean>;
  toast: (msg: string, isError?: boolean) => void;
}

const $ = (id: string) => document.getElementById(id)!;

let checking = false;

/** @param manual 사용자가 직접 눌렀으면 "최신 버전입니다" 같은 결과도 알려 준다 */
export async function checkForUpdates(ui: Ui, manual = false): Promise<void> {
  if (!isDesktop) {
    if (manual) ui.toast('웹 버전은 항상 최신입니다.');
    return;
  }
  if (checking) return;
  checking = true;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 15000 });
    if (!update) {
      if (manual) ui.toast(`최신 버전입니다 (v${await appVersion()})`);
      return;
    }

    const bar = $('update-bar');
    const text = $('update-text');
    const now = $('update-now') as HTMLButtonElement;
    const later = $('update-later') as HTMLButtonElement;
    const notes = (update.body ?? '').split('\n').map((l) => l.replace(/^[-*#\s]+/, '').trim()).filter(Boolean).slice(0, 2).join(' · ');
    text.textContent = `새 버전 v${update.version} 이 나왔습니다${notes ? ` — ${notes}` : ''}`;
    bar.hidden = false;

    later.onclick = () => (bar.hidden = true);
    now.onclick = async () => {
      if (ui.isDirty()) {
        const ok = await ui.confirm('저장하지 않은 변경 내용이 있습니다.\n저장한 뒤 업데이트할까요?', '저장하고 업데이트', '취소');
        if (!ok || !(await ui.save())) return;
      }
      now.disabled = later.disabled = true;
      let total = 0;
      let got = 0;
      try {
        await update.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? 0;
          else if (e.event === 'Progress') {
            got += e.data.chunkLength;
            text.textContent = total ? `업데이트 내려받는 중… ${Math.round((got / total) * 100)}%` : `업데이트 내려받는 중… ${(got / 1048576).toFixed(1)}MB`;
          } else if (e.event === 'Finished') text.textContent = '설치 중입니다. 잠시 후 HanWord 가 다시 켜집니다.';
        });
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (err) {
        now.disabled = later.disabled = false;
        const msg = String((err as Error)?.message ?? err);
        text.textContent = /signature/i.test(msg)
          ? '업데이트 파일의 서명이 맞지 않아 설치하지 않았습니다 (파일이 손상되었거나 위조됨). 나중에 다시 시도하세요.'
          : /network|connect|timed? ?out|dns|request/i.test(msg)
            ? '업데이트를 내려받지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.'
            : `업데이트하지 못했습니다: ${msg}`;
      }
    };
  } catch (err) {
    // 인터넷이 없거나 서버에 닿지 않으면 조용히 넘어간다 (직접 눌렀을 때만 알림)
    if (manual) ui.toast(`업데이트를 확인하지 못했습니다: ${(err as Error)?.message ?? err}`, true);
  } finally {
    checking = false;
  }
}
