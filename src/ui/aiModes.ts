/**
 * AI 다듬기 방식 (Claude API 키가 있을 때) — 맞춤법, 공문체(AI), 요약, 한 줄로, 제목 추천, 직접 지시, AI 설정.
 * 고른 글만 보내고, 결과는 비교 창에서 보고 "바꾸기"를 눌러야 들어간다.
 */
import type { Editor } from '@tiptap/core';
import { AI_MODELS, askClaude, costWon, loadAi, maskKey, numbered, parseNumbered, saveAi, type AiAnswer, type AiConfig } from '../ai/claude';
import { OBJ, type Block } from '../editor/polish';
import type { PolishMode, Preview } from './polishDialog';

const SYSTEM = `너는 한국 공공기관 보고서를 다듬는 편집자다.
- 요청한 결과만 출력한다. 인사말, 설명, 따옴표, 마크다운 기호(**, #)를 붙이지 않는다.
- 사실, 숫자, 날짜, 기관·사람 이름, 고유명사는 바꾸지 않는다. 없는 내용을 지어내지 않는다.
- 문단 앞 개조식 기호(□ ○ - · ※)와 "[그림]" 표시는 그대로 둔다.
- 답은 문단마다 [1], [2] … 번호를 붙여 한 줄씩 쓴다.`;

const PIC = '[그림]';
const MAX_CHARS = 15000;

const noKey: Preview = { kind: 'message', text: 'AI 키가 없습니다. 오른쪽 "AI 설정" 탭에서 Claude API 키를 넣으세요 (console.anthropic.com 에서 발급, 쓴 만큼 요금).' };

function prep(blocks: Block[]) {
  return blocks.map((b) => b.text.split(OBJ).join(PIC));
}
const back = (t: string) => t.split(PIC).join(OBJ);

function note(cfg: AiConfig, sent: number, a: AiAnswer) {
  const won = costWon(cfg.model, a);
  return `${sent.toLocaleString()}자를 Anthropic 에 보냄 · 약 ${won < 1 ? '1원 미만' : `${Math.round(won)}원`}`;
}

/** AI 를 부르는 공통 틀 */
async function call(blocks: Block[], signal: AbortSignal, build: (paras: string[]) => string, maxTokens?: number) {
  const cfg = loadAi();
  if (!cfg) return { cfg: null, preview: noKey } as const;
  const paras = prep(blocks);
  const sent = paras.join('').length;
  if (!sent) return { cfg: null, preview: { kind: 'message', text: '고른 글이 비어 있습니다.' } as Preview } as const;
  if (sent > MAX_CHARS) return { cfg: null, preview: { kind: 'message', text: `한 번에 ${MAX_CHARS.toLocaleString()}자까지 보낼 수 있습니다 (지금 ${sent.toLocaleString()}자). 나눠서 고르세요.` } as Preview } as const;
  const a = await askClaude(cfg, SYSTEM, build(paras), signal, maxTokens);
  return { cfg, paras, sent, answer: a, out: parseNumbered(a.text) } as const;
}

/** 문단 수를 지키는 결과 → 문단마다 새 글 */
function asTexts(blocks: Block[], out: string[]): Preview {
  if (out.length !== blocks.length) throw new Error(`AI 답의 문단 수(${out.length})가 고른 문단 수(${blocks.length})와 다릅니다. "다시"를 눌러 보세요`);
  return { kind: 'texts', texts: out.map((t, i) => (back(t) === blocks[i].text ? null : back(t))) };
}

export function aiModes(editor: Editor, hooks: { setTitle: (t: string) => void }): PolishMode[] {
  const texts = (id: string, label: string, hint: string, ask: string): PolishMode => ({
    id,
    label,
    hint,
    ai: true,
    run: async (blocks, _o, signal) => {
      const r = await call(blocks, signal, (p) => `${ask}\n문단 수와 번호를 그대로 지킨다.\n\n${numbered(p)}`);
      if (!r.cfg) return r.preview;
      return { ...asTexts(blocks, r.out), note: note(r.cfg, r.sent, r.answer) };
    },
  });

  return [
    texts('ai-spell', '맞춤법', '맞춤법·띄어쓰기·문장부호만 고침 (AI)', '다음 문단들의 맞춤법, 띄어쓰기, 문장부호만 바로잡아라. 낱말 선택과 문체는 바꾸지 않는다. 고칠 것이 없는 문단은 그대로 쓴다.'),
    texts('ai-gongmun', '공문체 (AI)', '규칙으로 안 되는 문장까지 보고서 문체로 다듬음 (AI)', '다음 문단들을 공문서 보고서 문체로 다듬어라. 문장 끝은 명사형(~함, ~임, ~음, ~예정, ~필요)으로 끝내고, 군더더기와 중복 표현은 줄이되 내용은 빠뜨리지 않는다.'),
    {
      id: 'ai-summary',
      label: '요약',
      hint: '고른 글을 몇 줄 개조식으로 요약해 그 자리를 바꿈 (AI)',
      ai: true,
      options: [
        { key: 'lines', label: '줄 수', type: 'select', value: '5', options: ['3', '5', '7', '10'].map((v) => ({ value: v, label: `${v}줄 이내` })) },
        { key: 'form', label: '형식', type: 'select', value: 'gaejo', options: [{ value: 'gaejo', label: '개조식 (□ ○)' }, { value: 'prose', label: '문장' }] },
      ],
      run: async (blocks, o, signal) => {
        const form =
          o.form === 'gaejo'
            ? '보고서 개조식으로 쓴다: 핵심은 "□ ", 그 아래 세부는 "○ " 로 시작하고 명사형(~함, ~임)으로 끝낸다.'
            : '완결된 문장으로 쓴다.';
        const r = await call(blocks, signal, (p) => `다음 글을 ${o.lines}줄 이내로 요약하라. ${form} 한 줄을 한 문단으로 [1]부터 번호를 붙인다.\n\n${p.join('\n')}`);
        if (!r.cfg) return r.preview;
        if (!r.out.length) throw new Error('AI 답을 읽지 못했습니다. "다시"를 눌러 보세요');
        return { kind: 'replace', paragraphs: r.out, note: note(r.cfg, r.sent, r.answer) };
      },
    },
    {
      id: 'ai-oneline',
      label: '한 줄로',
      hint: '고른 글의 핵심을 공문체 한 문장으로 (AI)',
      ai: true,
      run: async (blocks, _o, signal) => {
        const r = await call(blocks, signal, (p) => `다음 글의 핵심을 공문체 한 문장(~함, ~임으로 끝냄)으로 줄여라. [1] 하나로 답한다.\n\n${p.join('\n')}`);
        if (!r.cfg) return r.preview;
        if (!r.out.length) throw new Error('AI 답을 읽지 못했습니다. "다시"를 눌러 보세요');
        return { kind: 'replace', paragraphs: [r.out.join(' ')], note: note(r.cfg, r.sent, r.answer) };
      },
    },
    {
      id: 'ai-title',
      label: '제목 추천',
      hint: '고른 글(조금만 골랐으면 문서 전체)에 맞는 보고서 제목 3개 (AI)',
      ai: true,
      okText: '넣기',
      options: [
        { key: 'where', label: '넣을 곳', type: 'select', value: 'title', options: [{ value: 'title', label: '문서 제목 칸 (맨 위)' }, { value: 'insert', label: '고른 곳 위에 새 줄' }] },
      ],
      run: async (blocks, _o, signal) => {
        // 조금만 골랐으면 문서 전체를 본다
        const picked = prep(blocks).join('\n');
        const whole = picked.length < 80 ? editor.getText({ blockSeparator: '\n' }).slice(0, 6000) : picked;
        const r = await call([{ ...blocks[0], text: whole }], signal, (p) => `다음 글에 맞는 보고서 제목을 3개 제안하라. 공공기관 보고서 제목 관례(예: "○○ 추진 결과 보고", "○○ 계획(안)")를 따르고 25자 이내로 쓴다. [1]~[3] 번호로 답한다.\n\n${p.join('\n')}`, 400);
        if (!r.cfg) return r.preview;
        const choices = r.out.map((t) => t.replace(/^["'「『]|["'」』]$/g, '').trim()).filter(Boolean).slice(0, 5);
        if (!choices.length) throw new Error('AI 답을 읽지 못했습니다. "다시"를 눌러 보세요');
        return { kind: 'choices', choices, note: note(r.cfg, r.sent, r.answer) };
      },
      apply: (choice, blocks, o) => {
        if (o.where === 'insert' && blocks[0]) {
          const { state } = editor;
          const node = state.schema.nodes.paragraph.create({ textAlign: 'center' }, state.schema.text(choice));
          editor.view.dispatch(state.tr.insert(blocks[0].pos, node).scrollIntoView());
        } else hooks.setTitle(choice);
      },
    },
    {
      id: 'ai-custom',
      label: '직접 지시',
      hint: '원하는 대로 시키기: "더 짧게", "쉬운 말로", "존댓말로" 등 (AI)',
      ai: true,
      options: [{ key: 'ask', label: '지시', type: 'text', value: '', placeholder: '예: 더 짧게 / 어려운 한자어를 쉬운 말로 / 숫자를 앞에 오게 — 쓰고 Enter' }],
      run: async (blocks, o, signal) => {
        const ask = String(o.ask ?? '').trim();
        if (!ask) return { kind: 'message', text: '위 칸에 지시를 쓰고 Enter 를 누르세요.' };
        const r = await call(blocks, signal, (p) => `다음 문단들을 이 지시대로 고쳐라: ${ask}\n문단 수를 지킬 수 있으면 같은 번호로 답하고, 문단 수가 바뀌어야 하면 [1]부터 새로 번호를 붙인다.\n\n${numbered(p)}`);
        if (!r.cfg) return r.preview;
        if (!r.out.length) throw new Error('AI 답을 읽지 못했습니다. "다시"를 눌러 보세요');
        const n = note(r.cfg, r.sent, r.answer);
        return r.out.length === blocks.length ? { ...asTexts(blocks, r.out), note: n } : { kind: 'replace', paragraphs: r.out.map(back), note: n };
      },
    },
    {
      id: 'ai-setup',
      label: 'AI 설정',
      hint: 'Claude API 키·모델 (이 PC 에만 저장)',
      options: [
        { key: 'key', label: 'API 키', type: 'password', value: '', placeholder: loadAi() ? `저장됨 ${maskKey(loadAi()!.key)} — 바꾸려면 새 키를 넣고 Enter` : 'sk-ant-… 를 붙여넣고 Enter' },
        { key: 'model', label: '모델', type: 'select', value: loadAi()?.model ?? AI_MODELS[0].value, options: AI_MODELS },
        { key: 'forget', label: '저장된 키 지우기', type: 'check', value: false },
      ],
      run: async (_blocks, o, signal) => {
        if (o.forget) {
          saveAi(null);
          o.forget = false;
          return { kind: 'message', text: '저장된 키를 지웠습니다. AI 방식은 키를 다시 넣어야 쓸 수 있습니다.' };
        }
        const typed = String(o.key ?? '').trim();
        const cur = loadAi();
        if (!typed) {
          if (cur && cur.model !== o.model) saveAi({ ...cur, model: o.model });
          return {
            kind: 'message',
            text: cur
              ? `키 ${maskKey(cur.key)} · 모델 ${o.model} 로 씁니다. AI 방식을 쓰면 고른 글이 Anthropic 에 보내지고 쓴 만큼 요금이 듭니다.`
              : 'Claude API 키를 넣으세요. console.anthropic.com → API Keys 에서 만들 수 있습니다. 키는 이 PC 에만 저장됩니다.',
          };
        }
        const cfg = { key: typed, model: o.model };
        await askClaude(cfg, '짧게 답한다.', '"확인"이라고만 답하라.', signal, 10); // 키 확인
        saveAi(cfg);
        o.key = '';
        return { kind: 'message', text: `연결됐습니다. 키 ${maskKey(typed)} 를 이 PC 에 저장했습니다. 이제 AI 탭을 쓸 수 있습니다.` };
      },
    },
  ];
}
