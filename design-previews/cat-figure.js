// The dressed cat: body and wearable items around the head from rot-cat.js (load that first).
// Shared by cat-closet.html (the mockup) and cat-layer.html (single-layer PNG renderer for
// res/drawable-nodpi, see scripts/render-cat-layers.sh).
//
// Five layers, stacked in this order everywhere the cat is drawn:
//   base   tail, legs, feet, torso, mould spots, ribs, arms, paws
//   bottom the bottom item
//   body   the body item: hood, torso piece, sleeves, scarf
//   head   cat(t) from rot-cat.js
//   top    the top item (headwear)
// Every layer is drawn in the same box so the PNGs stack exactly.

// The t each stage (1..6) is rendered at. Must match STAGE_T in components/catdecay.ts.
const STAGE_T = [0.05, 0.5, 0.72, 0.87, 0.96, 1.0];

const FIGURE_LAYERS = ['base', 'bottom', 'body', 'head', 'top'];
const PILL_LAYERS = ['head', 'top'];
const BOXES = {
  figure: { view: '0 -40 256 440', layers: FIGURE_LAYERS }, // rendered at 360 x 619
  pill: { view: '-8 -40 272 272', layers: PILL_LAYERS },     // rendered at 192 x 192
};

// fur, matching rot-cat.js
function furOf(t) {
  if (t >= 1) return hex(BONE);
  const sick = ramp(t, 0.2, 0.7), rotK = ramp(t, 0.65, 1);
  return hex([0, 1, 2].map(i => lerp(lerp(FUR_FRESH[i], FUR_SICK[i], sick), FUR_ROT[i], rotK)));
}
// clothes drain toward a dead grey as the cat wilts
function h2r(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function dull(h, t) { const k = t >= 1 ? 0.8 : ramp(t, 0.35, 1) * 0.6; return mix(h2r(h), [0x5a, 0x5a, 0x53], k); }
const earDroop = (t) => ramp(t, 0.25, 0.85) * 42;

function topSvg(id, t) {
  const c = (h) => dull(h, t);
  switch (id) {
    case 'beanie': return `<path d="M50 106 C50 34 206 34 206 106 Z" fill="${c('#C44A3F')}"/>
      <rect x="46" y="92" width="164" height="22" rx="11" fill="${c('#A63A31')}"/>
      <g stroke="${c('#8E2F27')}" stroke-width="3">${[64, 80, 96, 112, 128, 144, 160, 176, 192].map(x => `<line x1="${x}" y1="96" x2="${x}" y2="110"/>`).join('')}</g>
      <circle cx="128" cy="34" r="15" fill="${c('#F2F1EC')}"/>`;
    case 'cap': return `<path d="M58 104 C58 42 198 42 198 104 Z" fill="${c('#38C786')}"/>
      <path d="M150 96 C182 88 220 92 232 106 C206 112 176 110 150 106 Z" fill="${c('#2A9C69')}"/>
      <circle cx="128" cy="46" r="6" fill="${c('#2A9C69')}"/>
      <path d="M128 46 L128 104" stroke="${c('#2A9C69')}" stroke-width="2.5"/>`;
    case 'crown': return `<path d="M88 64 L84 26 L106 44 L128 18 L150 44 L172 26 L168 64 Z" fill="${c('#E5B53A')}"/>
      <rect x="86" y="58" width="84" height="10" rx="4" fill="${c('#C9962A')}"/>
      <circle cx="128" cy="44" r="5" fill="${c('#D2542F')}"/><circle cx="104" cy="52" r="4" fill="${c('#38C786')}"/><circle cx="152" cy="52" r="4" fill="${c('#6FB3E6')}"/>`;
    case 'party': return `<path d="M128 -14 L98 58 L158 58 Z" fill="${c('#6FB3E6')}"/>
      <path d="M118 10 L138 6 M108 34 L148 28" stroke="${c('#F2F1EC')}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="128" cy="-16" r="9" fill="${c('#E5B53A')}"/>`;
    case 'flower': return `<g transform="translate(164 58)">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-13" rx="9" ry="13" fill="${c('#F2A6B4')}" transform="rotate(${a})"/>`).join('')}<circle r="8" fill="${c('#E5B53A')}"/></g>
      <path d="M150 74 q-8 10 -20 12" stroke="${c('#38C786')}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'phones': return `<path d="M42 132 C42 22 214 22 214 132" fill="none" stroke="${c('#2A2A27')}" stroke-width="12" stroke-linecap="round"/>
      <rect x="28" y="108" width="28" height="50" rx="12" fill="${c('#38C786')}"/><rect x="200" y="108" width="28" height="50" rx="12" fill="${c('#38C786')}"/>`;
    case 'bow': return `<g transform="translate(92 54) rotate(-18)"><path d="M0 0 L-26 -14 L-26 14 Z M0 0 L26 -14 L26 14 Z" fill="${c('#E08A97')}"/><circle r="7" fill="${c('#C86A79')}"/></g>`;
    case 'halo': return `<ellipse cx="128" cy="22" rx="46" ry="11" fill="none" stroke="${c('#E5B53A')}" stroke-width="7"/>`;
    default: return '';
  }
}

const TORSO = 'M84 214 C76 252 76 300 90 332 L166 332 C180 300 180 252 172 214 C158 200 98 200 84 214 Z';
const TEE = 'M84 214 C78 246 78 284 84 312 L172 312 C178 284 178 246 172 214 C158 200 98 200 84 214 Z';
const ARM_L = 'M90 224 C70 238 62 266 68 292', ARM_R = 'M166 224 C186 238 194 266 188 292';

const arms = (fur) => `<path d="${ARM_L}" stroke="${fur}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${ARM_R}" stroke="${fur}" stroke-width="20" fill="none" stroke-linecap="round"/>`;
const paws = (fur) => `<circle cx="68" cy="292" r="12" fill="${fur}"/><circle cx="188" cy="292" r="12" fill="${fur}"/>`;

function bodyUnder(id, t, uidp) { // the torso piece, over the torso
  const c = (h) => dull(h, t);
  const holes = t >= 1 ? `<circle cx="108" cy="262" r="5" fill="#0D0D0C"/><circle cx="150" cy="292" r="4" fill="#0D0D0C"/><circle cx="140" cy="236" r="3" fill="#0D0D0C"/>` : '';
  switch (id) {
    case 'tee': return `<path d="${TEE}" fill="${c('#E8E3D3')}"/><path d="M122 254 c-6 -8 -16 -2 -10 6 l10 10 l10 -10 c6 -8 -4 -14 -10 -6z" fill="${c('#D2542F')}"/>${holes}`;
    case 'hoodie': return `<path d="M84 214 C76 252 76 296 86 324 L170 324 C180 296 180 252 172 214 C158 200 98 200 84 214 Z" fill="${c('#4A6FA5')}"/>
      <path d="M102 284 h52 v18 a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8z" fill="${c('#3D5E8E')}"/>
      <path d="M116 212 v30 M140 212 v30" stroke="${c('#F2F1EC')}" stroke-width="3" stroke-linecap="round"/>${holes}`;
    case 'stripes': return `<defs><pattern id="st${uidp}" width="10" height="16" patternUnits="userSpaceOnUse"><rect width="10" height="16" fill="${c('#F2F1EC')}"/><rect width="10" height="8" fill="${c('#D2542F')}"/></pattern></defs>
      <path d="${TEE}" fill="url(#st${uidp})"/>${holes}`;
    case 'raincoat': return `<path d="M82 214 C74 256 72 306 84 340 L172 340 C184 306 182 256 174 214 C158 200 98 200 82 214 Z" fill="${c('#E5B53A')}"/>
      <path d="M128 212 V338" stroke="${c('#C9962A')}" stroke-width="3"/>
      ${[236, 262, 288, 314].map(y => `<circle cx="138" cy="${y}" r="4" fill="${c('#2A2A27')}"/>`).join('')}${holes}`;
    case 'suit': return `<path d="${TEE}" fill="${c('#2B2E3A')}"/>
      <path d="M108 206 L128 268 L148 206 Z" fill="${c('#F2F1EC')}"/>
      <path d="M128 222 l-14 -8 v16 z M128 222 l14 -8 v16 z" fill="${c('#D2542F')}"/>
      <circle cx="128" cy="286" r="3.5" fill="${c('#62625B')}"/>${holes}`;
    default: return '';
  }
}
function sleeves(id, t) {
  const c = (h) => dull(h, t);
  const s = (col, l, r) => `<path d="${l}" stroke="${col}" stroke-width="26" fill="none" stroke-linecap="round"/><path d="${r}" stroke="${col}" stroke-width="26" fill="none" stroke-linecap="round"/>`;
  const shortL = 'M90 224 C80 232 74 244 72 254', shortR = 'M166 224 C176 232 182 244 184 254';
  const longL = 'M90 224 C70 238 62 262 66 282', longR = 'M166 224 C186 238 194 262 190 282';
  switch (id) {
    case 'tee': return s(c('#E8E3D3'), shortL, shortR);
    case 'stripes': return s(c('#D2542F'), longL, longR);
    case 'hoodie': return s(c('#4A6FA5'), longL, longR);
    case 'raincoat': return s(c('#E5B53A'), longL, longR);
    case 'suit': return s(c('#2B2E3A'), longL, longR);
    default: return '';
  }
}
function scarf(id, t) {
  if (id !== 'scarf') return '';
  const c = (h) => dull(h, t);
  return `<path d="M76 196 C100 214 156 214 180 196 L182 214 C156 232 100 232 74 214 Z" fill="${c('#C44A3F')}"/>
    <path d="M150 220 l6 54 l-18 2 l-2 -50z" fill="${c('#A63A31')}"/>
    <g stroke="${c('#A63A31')}" stroke-width="3">${[140, 146, 152].map(x => `<line x1="${x}" y1="276" x2="${x}" y2="286"/>`).join('')}</g>`;
}
function bottomSvg(id, t) {
  const c = (h) => dull(h, t);
  const legs = (col, to) => `<rect x="94" y="296" width="32" height="${to - 296}" rx="10" fill="${col}"/><rect x="130" y="296" width="32" height="${to - 296}" rx="10" fill="${col}"/>`;
  const waist = (col) => `<path d="M86 300 C100 308 156 308 170 300 L168 322 C150 330 106 330 88 322 Z" fill="${col}"/>`;
  switch (id) {
    case 'jeans': return legs(c('#3B5B8A'), 362) + waist(c('#3B5B8A')) + `<path d="M128 306 V352" stroke="${c('#2D4870')}" stroke-width="2.5"/><path d="M90 306 C110 312 146 312 166 306" stroke="${c('#E5B53A')}" stroke-width="2" fill="none" stroke-dasharray="4 4"/>`;
    case 'shorts': return legs(c('#8A7F6A'), 334) + waist(c('#8A7F6A'));
    case 'tutu': return `<path d="M70 318 ${Array.from({ length: 12 }, (_, i) => `q${5} ${i % 2 ? -10 : 10} ${10} 0`).join(' ')} L190 318 C170 296 86 296 70 318 Z" fill="${c('#F2A6B4')}"/>`;
    case 'joggers': return legs(c('#62625B'), 356) + waist(c('#62625B')) + `<rect x="94" y="350" width="32" height="10" rx="5" fill="${c('#4A4A44')}"/><rect x="130" y="350" width="32" height="10" rx="5" fill="${c('#4A4A44')}"/>`;
    case 'sneakers': return `<path d="M84 370 a22 12 0 0 1 44 0 v6 h-44z" fill="${c('#F2F1EC')}"/><path d="M128 370 a22 12 0 0 1 44 0 v6 h-44z" fill="${c('#F2F1EC')}"/>
      <path d="M96 368 l18 -6 M140 368 l18 -6" stroke="${c('#38C786')}" stroke-width="4" stroke-linecap="round"/>`;
    default: return '';
  }
}

// The bare cat below the head. Ribs show once over; any torso piece covers them.
function baseSvg(t) {
  const fur = furOf(t), over = t >= 1;
  const spots = over ? '' : [[110, 300, 12, 8, 0.5, 0], [150, 240, 10, 7, 0.62, 1], [118, 352, 9, 6, 0.75, 2]].map(([x, y, rx, ry, s, ci]) => {
    const k = ramp(t, s, s + 0.08); return k > 0 ? `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${MOLD[ci]}" opacity="${0.85 * k}"/>` : '';
  }).join('');
  const ribs = over ? `<g stroke="#8A8574" stroke-width="4" stroke-linecap="round" fill="none">${[236, 256, 276, 296].map(y => `<path d="M100 ${y} q14 6 22 0 M134 ${y} q8 6 22 0"/>`).join('')}<path d="M128 220 V310"/></g>` : '';
  const tail = `<path d="M166 318 C212 320 232 282 216 248 C208 232 192 234 196 246" fill="none" stroke="${fur}" stroke-width="14" stroke-linecap="round" ${over ? 'stroke-dasharray="10 6"' : ''} transform="rotate(${earDroop(t) * 0.6} 166 318)"/>`;
  return `${tail}
    <rect x="96" y="296" width="28" height="70" rx="14" fill="${fur}"/><rect x="132" y="296" width="28" height="70" rx="14" fill="${fur}"/>
    <ellipse cx="106" cy="370" rx="20" ry="10" fill="${fur}"/><ellipse cx="150" cy="370" rx="20" ry="10" fill="${fur}"/>
    <path d="${TORSO}" fill="${fur}"/>${spots}${ribs}
    ${arms(fur)}${paws(fur)}`;
}

// The body item. A torso piece sits over the arms in the base, so the arms and paws are
// drawn again on top of it (fur, then sleeves, then paws), as the cat always looked.
function bodySvg(id, t, uidp) {
  if (id === 'none' || !id) return '';
  const fur = furOf(t);
  const hood = id === 'hoodie' ? `<ellipse cx="128" cy="204" rx="66" ry="22" fill="${dull('#3D5E8E', t)}"/>` : '';
  const piece = bodyUnder(id, t, uidp);
  const limbs = piece ? `${arms(fur)}${sleeves(id, t)}${paws(fur)}` : '';
  return `${hood}${piece}${limbs}${scarf(id, t)}`;
}

function headSvg(t, uidp) {
  return cat(t, { id: 'h' + uidp, anim: false }).replace('<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">', '<svg x="0" y="0" width="256" height="256" viewBox="0 0 256 256" overflow="visible">');
}

function topLayerSvg(id, t) {
  const inner = topSvg(id, t);
  return inner ? `<g transform="rotate(${earDroop(t) * 0.3 + (t >= 1 ? 12 : 0)} 128 96)">${inner}</g>` : '';
}

// One layer's markup, no <svg> wrapper. uidp keeps SVG ids unique within a page.
function layerInner(layer, t, item, uidp) {
  switch (layer) {
    case 'base': return baseSvg(t);
    case 'bottom': return bottomSvg(item, t);
    case 'body': return bodySvg(item, t, uidp);
    case 'head': return headSvg(t, uidp);
    case 'top': return topLayerSvg(item, t);
    default: throw new Error('unknown layer ' + layer);
  }
}

const boxOf = (box) => typeof box === 'string' ? BOXES[box] : box;
const wrap = (view, inner) => `<svg viewBox="${view}" xmlns="http://www.w3.org/2000/svg" overflow="visible">${inner}</svg>`;

// One layer in its box. opts = { item, box: 'figure' | 'pill', id }.
function figureLayer(layer, t, opts) {
  const b = boxOf(opts.box || 'figure');
  return wrap(b.view, layerInner(layer, t, opts.item || 'none', opts.id));
}

// Every layer of the box, stacked. box is 'figure', 'pill', or { view, layers } for a crop.
let figureUid = 0;
function fullFigure(t, outfit, box = 'figure') {
  const b = boxOf(box), id = 'ff' + (++figureUid);
  return wrap(b.view, b.layers.map(l => layerInner(l, t, l === 'base' || l === 'head' ? 'none' : outfit[l], id)).join(''));
}
