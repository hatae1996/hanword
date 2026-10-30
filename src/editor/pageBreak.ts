/**
 * 쪽 나누기 — 한글·Word 와 같은 Ctrl+Enter (표 안에서는 줄 추가라 여기서 처리하지 않음)
 *  - 커서 자리에서 문단을 나누고, 뒤 문단을 새 쪽에서 시작
 *  - 문단 맨 앞에서 Ctrl+Enter → 그 문단을 새 쪽에서 시작
 *  - 쪽 나누기가 있는 문단 맨 앞에서 Backspace → 쪽 나누기만 지움
 */
import { Extension, type Editor } from '@tiptap/core';

export function insertPageBreak(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || editor.isActive('table')) return false;
  const type = $from.parent.type.name;
  if (type !== 'paragraph' && type !== 'heading') return false;
  if ($from.parentOffset === 0) {
    return editor.commands.command(({ tr }) => {
      tr.setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, pageBreak: true });
      return true;
    });
  }
  return editor.chain().splitBlock().updateAttributes(type, { pageBreak: true }).scrollIntoView().run();
}

export const PageBreak = Extension.create({
  name: 'pageBreakKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => insertPageBreak(this.editor),
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || !$from.parent.attrs?.pageBreak) return false;
        return this.editor.commands.command(({ tr }) => {
          tr.setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, pageBreak: false });
          return true;
        });
      },
    };
  },
});
