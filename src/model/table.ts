import type { Table, TableCell } from './types';

export interface PlacedCell {
  cell: TableCell;
  row: number;
  col: number;
  colspan: number;
  rowspan: number;
}

/**
 * HTML 식 표(병합으로 가려진 칸 없음)를 격자 좌표로 배치한다.
 * HWPX 는 cellAddr(colAddr,rowAddr), DOCX 는 gridSpan / vMerge 를 쓰므로 둘 다 이 결과를 기반으로 한다.
 */
export function placeCells(table: Pick<Table, 'rows'>): { placed: PlacedCell[][]; rowCount: number; colCount: number } {
  const occupied: boolean[][] = [];
  const placed: PlacedCell[][] = [];
  let colCount = 0;
  table.rows.forEach((row, r) => {
    occupied[r] ??= [];
    const out: PlacedCell[] = [];
    let c = 0;
    for (const cell of row) {
      while (occupied[r][c]) c++;
      const colspan = Math.max(1, cell.colspan | 0);
      const rowspan = Math.max(1, cell.rowspan | 0);
      for (let dr = 0; dr < rowspan; dr++) {
        occupied[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) occupied[r + dr][c + dc] = true;
      }
      out.push({ cell, row: r, col: c, colspan, rowspan });
      c += colspan;
      colCount = Math.max(colCount, c);
    }
    placed.push(out);
  });
  // 행 병합이 표 아래로 넘친 경우 잘라낸다
  const rowCount = table.rows.length;
  for (const row of placed) for (const p of row) p.rowspan = Math.min(p.rowspan, rowCount - p.row);
  for (const row of occupied) for (let c = 0; c < row.length; c++) if (row[c]) colCount = Math.max(colCount, c + 1);
  return { placed, rowCount, colCount };
}

/**
 * 열 너비 정리.
 *  - 모든 열 너비를 알고 합이 본문 폭 이하 → 그대로 (본문보다 좁은 표 유지)
 *  - 일부만 알면 → 남은 폭을 모르는 열에 나눠 줌
 *  - 하나도 모르면 → 본문 폭을 균등 분배
 *  - 합이 본문 폭을 넘으면 → 본문 폭에 맞게 줄임
 */
export function normalizeWidths(widths: (number | undefined)[], colCount: number, totalMm: number): number[] {
  const ws = Array.from({ length: colCount }, (_, i) => (widths[i] && widths[i]! > 0 ? widths[i] : undefined));
  const known = ws.filter((w): w is number => w !== undefined);
  const knownSum = known.reduce((a, b) => a + b, 0);
  const unknownCount = colCount - known.length;
  let fill = 0;
  if (unknownCount) {
    const remaining = totalMm - knownSum;
    fill = remaining > unknownCount * 5 ? remaining / unknownCount : known.length ? knownSum / known.length : totalMm / colCount;
  }
  const filled = ws.map((w) => w ?? fill);
  const sum = filled.reduce((a, b) => a + b, 0);
  // 편집기는 열 너비를 정수 px 로 다루므로 본문 폭에 맞춘 표도 열마다 1px 안쪽 오차가 생긴다 → 본문 폭으로 맞춤
  if (!unknownCount && Math.abs(sum - totalMm) > 0.001 && Math.abs(sum - totalMm) <= colCount * 0.27) return filled.map((w) => (w / sum) * totalMm);
  return sum > totalMm + 0.5 ? filled.map((w) => (w / sum) * totalMm) : filled;
}
