/** AI 다듬기 방식 (1.2 에서 채움) */
import type { Editor } from '@tiptap/core';
import type { PolishMode } from './polishDialog';
export function aiModes(_editor: Editor, _hooks: { setTitle: (t: string) => void }): PolishMode[] {
  return [];
}
