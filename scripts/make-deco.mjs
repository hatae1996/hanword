// 감성 테마 장식 그림 만들기 — SVG(직접 그림) → 커버는 JPG, 아이콘·구분선은 투명 PNG
// 그림마다 "HanWordDeco=<종류>" 표식을 넣는다 (JPG 주석 / PNG tEXt). 한글·Word 로 저장했다 다시 열어도 장식인 줄 알아본다.
// 결과: src/design/decoAssets.ts  (사용: node scripts/make-deco.mjs [미리보기폴더])
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// 늘 같은 그림이 나오도록 정해진 난수
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const W = 1500, H = 300;

// ── 공통 조각 ─────────────────────────────────────────────
const cloud = (x, y, s, fill = '#fff', op = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${op}">
    <circle cx="0" cy="0" r="30"/><circle cx="34" cy="-14" r="38"/><circle cx="76" cy="-4" r="32"/><circle cx="104" cy="10" r="22"/>
    <rect x="-22" y="0" width="140" height="32" rx="16"/>
  </g>`;
const sparkle = (x, y, r, fill) => `<path d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z" fill="${fill}"/>`;
const blossom = (x, y, r, rot = 0, petal = '#F7A8C4', center = '#E0688F', op = 1) => {
  let s = `<g transform="translate(${x} ${y}) rotate(${rot})" opacity="${op}">`;
  for (let i = 0; i < 5; i++) s += `<ellipse cx="0" cy="${-r * 0.62}" rx="${r * 0.42}" ry="${r * 0.6}" fill="${petal}" transform="rotate(${i * 72})"/>`;
  s += `<circle r="${r * 0.22}" fill="${center}"/>`;
  for (let i = 0; i < 5; i++) s += `<circle cx="0" cy="${-r * 0.34}" r="${r * 0.06}" fill="#fff" opacity=".8" transform="rotate(${i * 72 + 36})"/>`;
  return s + '</g>';
};
const petal = (x, y, r, rot, fill = '#F9B9CF', op = 0.85) => `<ellipse cx="${x}" cy="${y}" rx="${r * 0.45}" ry="${r * 0.75}" fill="${fill}" opacity="${op}" transform="rotate(${rot} ${x} ${y})"/>`;
const tree = (x, y, s, c1 = '#5DAE5B', c2 = '#7CC46F') => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-7" y="-10" width="14" height="46" rx="5" fill="#8B5E3C"/>
    <circle cx="0" cy="-42" r="40" fill="${c1}"/><circle cx="-24" cy="-24" r="26" fill="${c1}"/><circle cx="24" cy="-24" r="26" fill="${c1}"/>
    <circle cx="-10" cy="-54" r="16" fill="${c2}" opacity=".9"/>
  </g>`;
const pine = (x, y, s, c = '#3F8F4E') => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-5" y="0" width="10" height="20" rx="3" fill="#7A5133"/>
    <path d="M0 -92 L34 -30 L18 -30 L42 6 L-42 6 L-18 -30 L-34 -30Z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>
  </g>`;

// ── 커버 ────────────────────────────────────────────────
function coverSky() {
  const r = rng(7);
  let birds = '';
  for (const [x, y, s] of [[980, 92, 1], [1020, 70, 0.8], [1050, 104, 0.7]])
    birds += `<path d="M${x - 10 * s} ${y} q${5 * s} ${-7 * s} ${10 * s} 0 q${5 * s} ${-7 * s} ${10 * s} 0" fill="none" stroke="#5B8DB8" stroke-width="${3 * s}" stroke-linecap="round" opacity=".7"/>`;
  let dots = '';
  for (let i = 0; i < 26; i++) dots += `<circle cx="${r() * W}" cy="${r() * 150}" r="${1.5 + r() * 2.5}" fill="#fff" opacity="${0.35 + r() * 0.4}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DB9EC"/><stop offset=".65" stop-color="#BFE0F8"/><stop offset="1" stop-color="#E6F4FD"/></linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4C2"/><stop offset="1" stop-color="#FFF4C2" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>${dots}
    <circle cx="1280" cy="86" r="110" fill="url(#sun)"/><circle cx="1280" cy="86" r="44" fill="#FFE07A"/><circle cx="1268" cy="74" r="14" fill="#FFF3B8" opacity=".8"/>
    ${birds}
    ${cloud(150, 92, 0.9, '#fff', 0.75)}${cloud(560, 60, 0.6, '#fff', 0.6)}${cloud(860, 130, 0.75, '#fff', 0.7)}
    ${cloud(-30, 268, 1.5)}${cloud(230, 290, 1.3)}${cloud(480, 272, 1.6)}${cloud(760, 296, 1.2)}${cloud(980, 270, 1.5)}${cloud(1250, 292, 1.4)}${cloud(1420, 268, 1.3)}
    <rect y="286" width="${W}" height="14" fill="#fff"/>
  </svg>`;
}
function coverNight() {
  const r = rng(11);
  let stars = '';
  for (let i = 0; i < 120; i++) stars += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * 230).toFixed(1)}" r="${(0.8 + r() * 1.8).toFixed(1)}" fill="#fff" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
  for (const [x, y, s] of [[180, 70, 12], [420, 150, 8], [700, 52, 10], [905, 168, 7], [1080, 60, 9], [1390, 150, 11], [300, 210, 6], [1210, 210, 6]]) stars += sparkle(x, y, s, '#FFF3C4');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14123A"/><stop offset=".55" stop-color="#3A2D7A"/><stop offset="1" stop-color="#7A5BBE"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3C4" stop-opacity=".45"/><stop offset="1" stop-color="#FFF3C4" stop-opacity="0"/></radialGradient>
    <mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="1263" cy="70" r="46" fill="#000"/></mask></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>${stars}
    <circle cx="1240" cy="90" r="120" fill="url(#glow)"/>
    <circle cx="1240" cy="90" r="52" fill="#FFF1B8" mask="url(#m)"/>
    <g transform="translate(470 96)"><ellipse rx="64" ry="14" fill="none" stroke="#F6C1E0" stroke-width="5" opacity=".8" transform="rotate(-14)"/>
      <circle r="30" fill="#F2A7D0"/><path d="M-30 0 A30 30 0 0 0 30 0" fill="#E48DBD" opacity=".6"/>
      <path d="M-62 15 A64 14 -14 0 0 62 -15" fill="none" stroke="#F6C1E0" stroke-width="5" transform="rotate(-14) rotate(14)" opacity="0"/></g>
    <path d="M0 250 Q160 205 330 238 T680 232 T1040 236 T1500 226 V300 H0Z" fill="#2B2264" opacity=".9"/>
    <path d="M0 272 Q220 240 460 266 T940 262 T1500 258 V300 H0Z" fill="#1B1648"/>
    ${[[220, 262], [252, 266], [1120, 254], [1150, 258]].map(([x, y]) => `<rect x="${x}" y="${y - 16}" width="22" height="16" fill="#3B2F7F"/><path d="M${x - 3} ${y - 16} L${x + 11} ${y - 28} L${x + 25} ${y - 16}Z" fill="#3B2F7F"/><rect x="${x + 8}" y="${y - 11}" width="6" height="6" fill="#FFD97A"/>`).join('')}
  </svg>`;
}
function coverBlossom() {
  const r = rng(23);
  let s = '';
  // 위 왼쪽·오른쪽에서 내려오는 가지
  const branches = [
    'M-20 40 C120 30 220 80 330 70 S520 40 600 58',
    'M180 64 C210 110 250 130 300 140',
    'M420 60 C450 30 480 22 520 20',
    'M1520 30 C1400 34 1300 90 1180 84 S980 60 900 80',
    'M1260 82 C1240 130 1210 150 1170 160',
    'M1060 70 C1040 40 1010 26 970 24',
  ];
  for (const d of branches) s += `<path d="${d}" fill="none" stroke="#7A4A3A" stroke-width="7" stroke-linecap="round"/>`;
  const flowers = [[60, 34, 22], [120, 40, 18], [170, 54, 24], [230, 72, 20], [290, 74, 26], [350, 66, 19], [410, 60, 23], [470, 46, 17], [520, 24, 18], [560, 54, 21], [205, 100, 18], [260, 128, 22], [300, 142, 16], [440, 34, 15],
    [1460, 32, 22], [1400, 42, 18], [1340, 64, 24], [1280, 84, 20], [1220, 86, 25], [1160, 82, 19], [1100, 72, 23], [1040, 64, 18], [980, 70, 20], [930, 78, 17], [1250, 120, 20], [1215, 148, 18], [1175, 160, 15], [1010, 30, 16], [1050, 48, 14]];
  for (const [x, y, rr] of flowers) s += blossom(x, y, rr, r() * 72, r() > 0.5 ? '#F7A8C4' : '#FBC6D8', '#E0688F');
  for (const [x, y] of [[150, 30], [330, 60], [500, 36], [1370, 50], [1190, 90], [1000, 58]]) s += `<circle cx="${x}" cy="${y}" r="7" fill="#9BD08A"/>`;
  let pet = '';
  for (let i = 0; i < 46; i++) pet += petal(r() * W, 120 + r() * 170, 7 + r() * 7, r() * 180, r() > 0.5 ? '#F9B9CF' : '#F7A1BF', 0.55 + r() * 0.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE7FA"/><stop offset=".6" stop-color="#F6E6F1"/><stop offset="1" stop-color="#FFF4F8"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    ${cloud(640, 120, 0.7, '#fff', 0.8)}${cloud(780, 170, 0.5, '#fff', 0.7)}
    <path d="M0 262 Q300 236 620 254 T1220 250 T1500 246 V300 H0Z" fill="#FBD3E2"/>
    <path d="M0 280 Q380 262 760 276 T1500 270 V300 H0Z" fill="#F7BCD2"/>
    ${s}${pet}
  </svg>`;
}
function coverForest() {
  const r = rng(31);
  let flowers = '';
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = 262 + r() * 34, c = ['#FFFFFF', '#FFE07A', '#F7A8C4'][i % 3];
    flowers += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${[0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-3.2" r="2.6" fill="${c}" transform="rotate(${a})"/>`).join('')}<circle r="1.8" fill="#E59A2F"/></g>`;
  }
  let fence = '';
  for (let x = 40; x < W; x += 54) fence += `<rect x="${x}" y="232" width="12" height="46" rx="3" fill="#C8945E"/><path d="M${x} 236 L${x + 6} 226 L${x + 12} 236Z" fill="#C8945E"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE6F2"/><stop offset=".7" stop-color="#E5F5E8"/><stop offset="1" stop-color="#F4FBF2"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <circle cx="1310" cy="70" r="36" fill="#FFE07A"/>
    ${cloud(220, 70, 0.6, '#fff', 0.8)}${cloud(900, 54, 0.5, '#fff', 0.75)}
    <path d="M0 190 Q200 120 420 170 T860 150 T1260 160 T1500 140 V300 H0Z" fill="#BFE3B5"/>
    ${pine(1160, 176, 0.9, '#6FB07A')}${pine(1210, 182, 0.7, '#7CBC86')}${pine(330, 186, 0.8, '#6FB07A')}
    <path d="M0 232 Q260 186 560 220 T1100 212 T1500 206 V300 H0Z" fill="#8ECF85"/>
    ${tree(130, 222, 1.05)}${tree(250, 232, 0.8, '#4C9A4C', '#6DB863')}${tree(690, 220, 0.95)}${tree(1010, 216, 1.1, '#4C9A4C', '#6DB863')}${tree(1390, 214, 0.9)}${pine(860, 228, 0.85)}
    <rect x="0" y="244" width="${W}" height="9" rx="4" fill="#B98250"/><rect x="0" y="262" width="${W}" height="9" rx="4" fill="#B98250"/>${fence}
    <path d="M0 276 Q400 266 800 276 T1500 272 V300 H0Z" fill="#7CC46F"/>${flowers}
  </svg>`;
}

// ── 아이콘 (128×128) ──────────────────────────────────────
const I = 128;
const icon = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${I}" height="${I}" viewBox="0 0 128 128">${body}</svg>`;
const icons = {
  'icon:sky': icon(`<g transform="translate(4 78)">${cloud(22, 0, 0.78, '#6FB2EA')}</g><g transform="translate(14 74)">${cloud(22, 0, 0.6, '#BFE0F8')}</g><circle cx="52" cy="50" r="7" fill="#fff" opacity=".9"/>`),
  'box:sky': icon(`<circle cx="64" cy="64" r="26" fill="#FFD25A"/>${Array.from({ length: 8 }, (_, i) => `<rect x="60" y="14" width="8" height="18" rx="4" fill="#FFB938" transform="rotate(${i * 45} 64 64)"/>`).join('')}<circle cx="56" cy="58" r="7" fill="#FFF0B0"/>`),
  'icon:night': icon(`<path d="M64 10 L78 46 L116 48 L86 72 L96 110 L64 88 L32 110 L42 72 L12 48 L50 46Z" fill="#FFD25A" stroke="#FFB938" stroke-width="6" stroke-linejoin="round"/><circle cx="54" cy="52" r="7" fill="#FFF0B0"/>`),
  'box:night': icon(`<defs><mask id="mm"><rect width="128" height="128" fill="#fff"/><circle cx="82" cy="46" r="34" fill="#000"/></mask></defs><circle cx="62" cy="66" r="40" fill="#8D7BE0" mask="url(#mm)"/>${sparkle(98, 86, 12, '#FFD25A')}`),
  'icon:blossom': icon(blossom(64, 66, 52, 0, '#F7A8C4', '#E0688F')),
  'box:blossom': icon(`${petal(52, 64, 46, -30, '#F7A8C4', 1)}${petal(80, 60, 40, 28, '#FBC6D8', 1)}<circle cx="66" cy="96" r="5" fill="#E0688F"/>`),
  'icon:forest': icon(`<path d="M64 112 C64 80 66 60 64 36" stroke="#5B8A3C" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M64 60 C30 62 18 40 22 18 C48 16 66 34 64 60Z" fill="#6DBE5F"/><path d="M64 74 C96 76 110 56 106 32 C80 30 62 48 64 74Z" fill="#4CA251"/>`),
  'box:forest': icon(`${[0, 90, 180, 270].map((a) => `<circle cx="64" cy="40" r="22" fill="#5DB65A" transform="rotate(${a} 64 64)"/>`).join('')}<circle cx="64" cy="64" r="10" fill="#3F9147"/><path d="M64 70 Q74 96 92 112" stroke="#3F9147" stroke-width="7" fill="none" stroke-linecap="round"/>`),
};

// ── 구분선 (1500×48, 투명) ───────────────────────────────
const DW = 1500, DH = 48;
const div = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${DW}" height="${DH}" viewBox="0 0 ${DW} ${DH}">${body}</svg>`;
const dividers = {
  'divider:sky': div(`<line x1="40" y1="26" x2="660" y2="26" stroke="#B9DAF5" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/><line x1="840" y1="26" x2="1460" y2="26" stroke="#B9DAF5" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>${cloud(690, 30, 0.22, '#9CCBF2')}${cloud(735, 22, 0.3, '#7DB9EC')}${cloud(785, 30, 0.22, '#9CCBF2')}`),
  'divider:night': div(`<line x1="40" y1="24" x2="680" y2="24" stroke="#C9C0F0" stroke-width="2"/><line x1="820" y1="24" x2="1460" y2="24" stroke="#C9C0F0" stroke-width="2"/>${sparkle(710, 24, 9, '#B6A6EE')}${sparkle(750, 24, 15, '#8D7BE0')}${sparkle(790, 24, 9, '#B6A6EE')}${[100, 250, 400, 550, 950, 1100, 1250, 1400].map((x) => `<circle cx="${x}" cy="24" r="4" fill="#B6A6EE"/>`).join('')}`),
  'divider:blossom': div(`<path d="M40 26 Q380 18 690 26" stroke="#F3B8CC" stroke-width="2.5" fill="none"/><path d="M810 26 Q1120 34 1460 26" stroke="#F3B8CC" stroke-width="2.5" fill="none"/>${blossom(750, 24, 18, 10, '#F7A8C4', '#E0688F')}${petal(700, 24, 10, 60, '#F9B9CF', 1)}${petal(800, 24, 10, -60, '#F9B9CF', 1)}${[200, 420, 1080, 1300].map((x, i) => petal(x, 23, 9, i * 50, '#F9B9CF', 0.9)).join('')}`),
  'divider:forest': div(`${Array.from({ length: 27 }, (_, i) => 60 + i * 53).map((x) => `<rect x="${x}" y="8" width="9" height="34" rx="3" fill="#D1A06D"/><path d="M${x} 11 L${x + 4.5} 3 L${x + 9} 11Z" fill="#D1A06D"/>`).join('')}<rect x="40" y="16" width="1420" height="6" rx="3" fill="#C08A55"/><rect x="40" y="30" width="1420" height="6" rx="3" fill="#C08A55"/>`),
};

const covers = { 'cover:sky': coverSky(), 'cover:night': coverNight(), 'cover:blossom': coverBlossom(), 'cover:forest': coverForest() };

// ── 표식 넣기 ───────────────────────────────────────────
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngMark(png, text) {
  const data = Buffer.from(`HanWordDeco\0${text};`, 'latin1');
  const type = Buffer.from('tEXt');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const ihdrEnd = 8 + 25; // 서명 + IHDR
  return Buffer.concat([png.subarray(0, ihdrEnd), len, type, data, crc, png.subarray(ihdrEnd)]);
}
function jpgMark(jpg, text) {
  const body = Buffer.from(`HanWordDeco=${text};`, 'latin1');
  const seg = Buffer.alloc(4); seg[0] = 0xff; seg[1] = 0xfe; seg.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpg.subarray(0, 2), seg, body, jpg.subarray(2)]);
}

const preview = process.argv[2];
if (preview) mkdirSync(preview, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shot(svg, w, h, type) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.locator('svg').screenshot({ type, quality: type === 'jpeg' ? 86 : undefined, omitBackground: type === 'png' });
}
const out = {};
for (const [k, svg] of Object.entries(covers)) {
  const b = jpgMark(await shot(svg, W, H, 'jpeg'), k);
  out[k] = { mime: 'image/jpeg', data: b.toString('base64'), aspect: W / H };
  if (preview) writeFileSync(`${preview}/${k.replace(':', '-')}.jpg`, b);
}
for (const [k, svg] of Object.entries(icons)) {
  const b = pngMark(await shot(svg, I, I, 'png'), k);
  out[k] = { mime: 'image/png', data: b.toString('base64'), aspect: 1 };
  if (preview) writeFileSync(`${preview}/${k.replace(':', '-')}.png`, b);
}
for (const [k, svg] of Object.entries(dividers)) {
  const b = pngMark(await shot(svg, DW, DH, 'png'), k);
  out[k] = { mime: 'image/png', data: b.toString('base64'), aspect: DW / DH };
  if (preview) writeFileSync(`${preview}/${k.replace(':', '-')}.png`, b);
}
await browser.close();
const kb = Math.round(Object.values(out).reduce((n, x) => n + x.data.length, 0) / 1024);
writeFileSync(
  new URL('../src/design/decoAssets.ts', import.meta.url),
  `// 자동 생성 — scripts/make-deco.mjs (손으로 고치지 말 것). 감성 테마 장식 그림 ${Object.keys(out).length}개, ${kb}KB\n` +
    `export interface DecoAsset { mime: 'image/png' | 'image/jpeg'; data: string; aspect: number }\n` +
    `export const DECO_ASSETS: Record<string, DecoAsset> = ${JSON.stringify(out, null, 0)};\n`,
);
console.log(`✓ src/design/decoAssets.ts (${Object.keys(out).length}개, ${kb}KB)`);
