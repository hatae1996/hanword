/**
 * 다듬기 방식 — 규칙(인터넷 안 씀). AI 방식은 aiModes.ts
 */
import { stripMarker, toGaejoItems, toGongmun } from '../ai/polish';
import { LEVEL_OF } from '../editor/gaejo';
import { OBJ } from '../editor/polish';
import type { PolishMode } from './polishDialog';

export function ruleModes(): PolishMode[] {
  return [
    {
      id: 'gongmun',
      label: '공문체로',
      hint: '문장 끝을 ~함·~임·~음 으로 (확인합니다 → 확인함). 인터넷을 쓰지 않습니다',
      options: [{ key: 'period', label: '문단 끝 마침표 남기기', type: 'check', value: false }],
      run: async (blocks, o) => ({
        kind: 'texts',
        texts: blocks.map((b) => {
          const t = toGongmun(b.text, { keepPeriod: !!o.period });
          return t === b.text ? null : t;
        }),
      }),
    },
    {
      id: 'gaejo',
      label: '개조식으로 나누기',
      hint: '문장마다 □ ○ 항목 하나씩 + 공문체. 인터넷을 쓰지 않습니다',
      options: [
        {
          key: 'symbol',
          label: '기호',
          type: 'select',
          value: 'auto',
          options: [
            { value: 'auto', label: '원래 기호 (없으면 □)' },
            { value: '□', label: '□ 1단계' },
            { value: '○', label: '○ 2단계' },
            { value: '-', label: '- 3단계' },
            { value: '·', label: '· 4단계' },
          ],
        },
      ],
      run: async (blocks, o) => ({
        kind: 'items',
        items: blocks.map((b) => {
          if (b.text.includes(OBJ)) return null; // 그림이 든 문단은 나누지 않는다
          const { marker, rest } = stripMarker(b.text);
          const items = toGaejoItems(b.text);
          if (!items.length) return null;
          const symbol = o.symbol === 'auto' ? (marker && LEVEL_OF[marker] !== undefined ? marker : '□') : o.symbol;
          // 한 문장이고 이미 공문체·같은 기호면 바꿀 것 없음
          if (items.length === 1 && marker === symbol && items[0] === rest.trim()) return null;
          return items.map((text) => ({ symbol, text }));
        }),
      }),
    },
  ];
}
