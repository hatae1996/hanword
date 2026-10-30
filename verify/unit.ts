/** 작은 단위 검사 — 문장 다듬기 규칙 (npm run unit) */
import { diffEdits, nominalize, splitSentences, toGaejoItems, toGongmun } from '../src/ai/polish';
import { numbered, parseNumbered } from '../src/ai/claude';
import { matchKo, rank } from '../src/ui/commandPalette';

let bad = 0;
let n = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    bad++;
    console.log(`❌ ${name}: ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`);
  }
};

const endings: [string, string][] = [
  ['확인합니다', '확인함'], ['완료되었습니다', '완료되었음'], ['예정입니다', '예정임'], ['협조 바랍니다', '협조 바람'],
  ['제출하여 주십시오', '제출하여 주시기 바람'], ['검토하세요', '검토하기 바람'], ['추진한다', '추진함'], ['개선된다', '개선됨'],
  ['기록물을 옮긴다', '기록물을 옮김'], ['자료를 찾는다', '자료를 찾음'], ['필요한 것이다', '필요한 것임'], ['문제가 있다', '문제가 있음'],
  ['문제가 없다', '문제가 없음'], ['시스템을 만들다', '시스템을 만듦'], ['효과가 크다', '효과가 큼'], ['포함되지 않았다', '포함되지 않았음'],
  ['반영하였다', '반영하였음'], ['이관을 완료함', '이관을 완료함'], ['다음 달 시행 예정', '다음 달 시행 예정'], ['가능합니까', '가능합니까'],
  ['붙임 참조', '붙임 참조'], ['"중요하다"', '"중요함"'], ['것으로 보인다', '것으로 보임'], ['해야 한다', '해야 함'],
  ['아닙니다', '아님'], ['할 수 있습니다', '할 수 있음'], ['많다', '많음'], ['좋습니다', '좋음'], ['갑니다', '감'], ['Word 입니다', 'Word 임'],
];
for (const [a, b] of endings) eq(`공문체 ${a}`, nominalize(a), b);

eq('문장 나누기 (날짜 마침표는 문장 끝 아님)', splitSentences('2026. 10. 30. 이관을 완료하였습니다. 총 120개를 옮겼습니다.'), ['2026. 10. 30. 이관을 완료하였습니다.', '총 120개를 옮겼습니다.']);
eq('공문체 문단 (안쪽 마침표 유지, 끝 마침표 뺌)', toGongmun('이관을 완료하였습니다. 바구니를 옮겼습니다.'), '이관을 완료하였음. 바구니를 옮겼음');
eq('공문체 문단 (끝 마침표 남기기)', toGongmun('이관을 완료하였습니다.', { keepPeriod: true }), '이관을 완료하였음.');
eq('공문체 문단 (기호 유지)', toGongmun('□ 다음 주에 배치할 예정입니다.'), '□ 다음 주에 배치할 예정임');
eq('개조식 항목', toGaejoItems('○ 기록물 이관을 완료하였습니다. 총 120개 바구니를 옮겼습니다.'), ['기록물 이관을 완료하였음', '총 120개 바구니를 옮겼음']);

eq('AI 문단 번호 붙이기', numbered(['가', '나']), '[1] 가\n[2] 나');
eq('AI 답 읽기 (순서·이어진 줄·앞뒤 말)', parseNumbered('네, 고쳤습니다.\n[2] 둘째\n[1] 첫째\n이어짐\n\n[3] 셋째'), ['첫째 이어짐', '둘째', '셋째']);
eq('AI 답 읽기 (첫째 뒤 이어진 줄)', parseNumbered('[1] 첫째\n이어짐\n[2] 둘째'), ['첫째 이어짐', '둘째']);

eq('초성 찾기 ㅉㅂㅎ → 쪽 번호', matchKo('쪽 번호', 'ㅉㅂㅎ'), 0);
eq('초성+글자 섞어 찾기 모ㄷ → 모던 테마', matchKo('모던 테마로 바꾸기', '모ㄷ'), 0);
eq('띄어쓰기 무시', matchKo('한글로 저장', '한글로저장'), 0);
eq('영문 대소문자 무시', matchKo('Word로 저장', 'word'), 0);
eq('없는 말', matchKo('쪽 번호', 'ㅁㅁ'), -1);
{
  const items = ['다듬기: 공문체로', '쪽 번호', '쪽 나누기', '공문 테마로 바꾸기'].map((label) => ({ id: label, label, group: 'g', run: () => {} }));
  eq('순위: 앞에서 맞을수록 위', rank(items, 'ㄱㅁ').map((i) => i.label), ['공문 테마로 바꾸기', '다듬기: 공문체로']);
  eq('순위: 쪽', rank(items, '쪽').map((i) => i.label), ['쪽 번호', '쪽 나누기']);
}

for (let k = 0; k < 500; k++) {
  const rnd = (len: number) => Array.from({ length: len }, () => '가나다라 .'[(Math.random() * 6) | 0]).join('');
  const x = rnd((Math.random() * 40) | 0);
  const y = rnd((Math.random() * 40) | 0);
  let z = x;
  for (const d of [...diffEdits(x, y)].reverse()) z = z.slice(0, d.from) + d.insert + z.slice(d.to);
  if (z !== y) {
    bad++;
    console.log(`❌ diffEdits ${JSON.stringify(x)} → ${JSON.stringify(y)} = ${JSON.stringify(z)}`);
    break;
  }
}
n++;
console.log(bad ? `\n${bad}개 실패` : `${n}/${n} 통과 (diff 500회 포함)`);
process.exit(bad ? 1 : 0);
