// The decaying cat. Shared by rot-cat.html (the design board) and rot-frame.html (PNG frame renderer).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ramp = (t, from, to) => smooth((t - from) / (to - from));
function hex(c) { return '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, k) { return hex([0, 1, 2].map(i => lerp(a[i], b[i], k))); }
const FUR_FRESH = [0x33, 0x32, 0x2E], FUR_SICK = [0x44, 0x5E, 0x38], FUR_ROT = [0x5C, 0x7A, 0x40];
const BONE = [0xE6, 0xE1, 0xD2], EYE = [0xF2, 0xF1, 0xEC];
const MOLD = ['#8FB23C', '#B5C64A', '#6F9636', '#D0DC5A'];

function stageName(t) {
  if (t >= 1) return 'Gone';
  if (t >= 0.9) return 'Rotting';
  if (t >= 0.65) return 'Mouldy';
  if (t >= 0.35) return 'Wilting';
  return 'Fresh';
}

// t = minutes / limit. 0 = fresh, 1 = at the limit, >1 = over.
function cat(t, opts = {}) {
  const anim = opts.anim !== false;
  const over = t >= 1;
  const sick = ramp(t, 0.2, 0.7);             // fur colour drift, greens early
  const droop = ramp(t, 0.25, 0.85) * 42;      // ear droop degrees, sags hard
  const lid = ramp(t, 0.25, 0.75) * 0.55;      // eyelid coverage 0..0.55
  const cloud = ramp(t, 0.5, 0.65);            // right eye clouds
  const mouthK = clamp(t / 0.9, 0, 1);         // smile -> frown
  const skullK = ramp(t, 0.72, 1.0);           // bone patch growth, earlier and bigger
  const rotK = ramp(t, 0.65, 1);
  const fur = over ? hex(BONE) : hex([0, 1, 2].map(i => lerp(lerp(FUR_FRESH[i], FUR_SICK[i], sick), FUR_ROT[i], rotK)));
  const face = over ? hex(BONE) : fur;
  const xLeft = t >= 0.84, xRight = over;

  // mould spots: [cx, cy, rx, ry, start, colorIndex]
  const spots = [
    [84, 152, 16, 11, 0.42, 0], [176, 94, 13, 9, 0.48, 1], [66, 110, 11, 8, 0.55, 2],
    [152, 176, 19, 12, 0.6, 3], [110, 196, 13, 8, 0.66, 0], [190, 152, 11, 11, 0.72, 1],
    [102, 74, 14, 9, 0.78, 2], [140, 120, 9, 7, 0.84, 3],
  ];
  const spotSvg = over ? '' : spots.map(([x, y, rx, ry, s, c]) => {
    const o = ramp(t, s, s + 0.08);
    if (o <= 0) return '';
    return `<ellipse cx="${x}" cy="${y}" rx="${rx * (0.7 + 0.3 * o)}" ry="${ry * (0.7 + 0.3 * o)}" fill="${MOLD[c]}" opacity="${0.85 * o}"/>`;
  }).join('');

  // eyes
  const bead = ramp(t, 0.2, 0.75);              // pupils shrink from big and shiny to a bead
  const eye = (cx, cy, x, cloudy, look) => {
    if (x) {
      const c = over ? '#2A2A27' : hex(EYE);
      return `<g stroke="${c}" stroke-width="7" stroke-linecap="round">
        <line x1="${cx - 11}" y1="${cy - 11}" x2="${cx + 11}" y2="${cy + 11}"/>
        <line x1="${cx + 11}" y1="${cy - 11}" x2="${cx - 11}" y2="${cy + 11}"/></g>`;
    }
    const pupil = cloudy > 0.5 ? '#7A8B8F' : '#151513';
    const iris = mix(EYE, [0xB9, 0xC4, 0xB8], cloudy);
    const pr = lerp(12, 5, bead);
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="17" fill="${iris}"/>
      <circle cx="${cx + look}" cy="${cy + 1}" r="${pr}" fill="${pupil}" opacity="${1 - cloudy * 0.35}"/>
      <circle cx="${cx + look - pr * 0.35}" cy="${cy - pr * 0.4}" r="${lerp(4.5, 1.8, bead)}" fill="#fff" opacity="${1 - cloudy}"/>
      <circle cx="${cx + look + pr * 0.4}" cy="${cy + pr * 0.35}" r="${lerp(2.2, 0, bead)}" fill="#fff" opacity="${(1 - cloudy) * 0.9}"/>
      <rect x="${cx - 19}" y="${cy - 19}" width="38" height="${38 * lid}" fill="${face}"/>
    </g>`;
  };

  // mouth: smile -> flat -> frown -> open
  const gape = ramp(t, 0.8, 0.98);
  let mouth = '';
  if (over) {
    mouth = `<path d="M96 170 h64" stroke="#2A2A27" stroke-width="5" stroke-linecap="round"/>
      <g fill="#2A2A27"><rect x="104" y="166" width="7" height="12" rx="1"/><rect x="118" y="166" width="7" height="14" rx="1"/><rect x="132" y="166" width="7" height="14" rx="1"/><rect x="146" y="166" width="7" height="12" rx="1"/></g>`;
  } else {
    const dy = lerp(8, -20, mouthK);            // control point: +smile, -frown, deep
    const stroke = mix([0x38, 0xC7, 0x86], [0xD2, 0x54, 0x2F], ramp(t, 0.3, 0.8));
    const cute = 1 - ramp(t, 0.22, 0.4);        // the ω mouth gives way to a single line
    if (cute > 0) {
      mouth = `<path d="M110 164 q9 12 18 0 q9 12 18 0" fill="none" stroke="#38C786" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity="${cute}"/>`;
    }
    mouth = (mouth || '') + `<path d="M104 ${172 - dy * 0.35} q24 ${dy} 48 0" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" opacity="${1 - cute}"/>`;
    if (gape > 0) {
      mouth += `<ellipse cx="128" cy="${176 + gape * 3}" rx="${10 * gape}" ry="${8 * gape}" fill="#5A1F16"/>
        <ellipse cx="128" cy="${180 + gape * 4}" rx="${6 * gape}" ry="${5 * gape}" fill="#C44A3F"/>`;
    }
  }
  const nose = over
    ? `<path d="M120 148 l8 12 l8 -12 z" fill="#2A2A27"/>`
    : `<path d="M121 150 h14 a2 2 0 0 1 1.6 3.2 l-6.6 7.6 a2.4 2.4 0 0 1 -3.6 0 l-6.6 -7.6 a2 2 0 0 1 1.6 -3.2z" fill="${mix([0x38, 0xC7, 0x86], [0xD2, 0x54, 0x2F], ramp(t, 0.3, 0.7))}"/>`;

  // skull patch: a jagged opening top-right that grows until it is the whole head
  let patch = '';
  if (!over && skullK > 0) {
    const r = lerp(30, 150, skullK);
    patch = `<clipPath id="head${opts.id}"><circle cx="128" cy="128" r="80"/></clipPath>
      <g clip-path="url(#head${opts.id})">
        <path d="M ${168 - r * 0.2} ${74 - r * 0.1} l ${r * 0.35} ${-r * 0.1} l ${r * 0.2} ${r * 0.3} l ${-r * 0.1} ${r * 0.35} l ${-r * 0.4} ${r * 0.1} l ${-r * 0.25} ${-r * 0.35} z"
          fill="${hex(BONE)}" opacity="${0.6 + 0.4 * skullK}"/>
        <path d="M ${172 - r * 0.15} ${86 - r * 0.05} l ${r * 0.12} ${r * 0.18} l ${r * 0.1} ${-r * 0.05}" stroke="#8A8574" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </g>`;
  }
  const cracks = over ? `<g stroke="#8A8574" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M150 62 l10 18 l-8 10 l9 12"/><path d="M92 92 l-8 14 l6 8"/><path d="M128 40 l4 12 l-6 8"/></g>` : '';

  // ears: rounder, pink inside while healthy, drooping by rotating about the base
  const pink = `<path d="M84 76 Q72 46 68 34 Q92 50 104 66 Z" fill="#E08A97" opacity="${0.9 * (1 - ramp(t, 0.15, 0.5))}"/>`;
  const pinkR = `<path d="M172 76 Q184 46 188 34 Q164 50 152 66 Z" fill="#E08A97" opacity="${0.9 * (1 - ramp(t, 0.15, 0.5))}"/>`;
  const earL = `<g transform="rotate(${-droop} 78 84)"><path d="M78 88 Q66 50 60 24 Q92 40 114 62 Z" fill="${fur}"/>${over ? '' : pink}</g>`;
  const notch = t >= 0.7 ? `<path d="M178 40 l12 -6 l-4 12 z" fill="var(--ink)"/>` : '';
  const earR = `<g transform="rotate(${droop} 178 84)"><path d="M178 88 Q190 50 196 24 Q164 40 142 62 Z" fill="${fur}"/>${over ? '' : pinkR}${notch}</g>`;

  // blush and whiskers: the first things to go
  const blushO = 1 - ramp(t, 0.15, 0.45);
  const blush = over ? '' : `<ellipse cx="82" cy="150" rx="11" ry="6" fill="#E08A97" opacity="${0.55 * blushO}"/><ellipse cx="174" cy="150" rx="11" ry="6" fill="#E08A97" opacity="${0.55 * blushO}"/>`;
  const wd = ramp(t, 0.3, 0.9) * 10;           // whiskers droop
  const wo = lerp(0.85, 0.35, ramp(t, 0.3, 0.9));
  const whiskers = over ? '' : `<g stroke="${mix(EYE, [0x8A, 0x92, 0x84], sick)}" stroke-width="2.4" stroke-linecap="round" opacity="${wo}">
      <g transform="rotate(${wd} 86 156)"><line x1="86" y1="150" x2="48" y2="140"/><line x1="86" y1="158" x2="46" y2="158"/><line x1="86" y1="166" x2="50" y2="176"/></g>
      <g transform="rotate(${-wd} 170 156)"><line x1="170" y1="150" x2="208" y2="140"/><line x1="170" y1="158" x2="210" y2="158"/><line x1="170" y1="166" x2="206" y2="176"/></g></g>`;

  // flies + stink + drip (animated decorations)
  let extras = '';
  const flyCount = t >= 1 ? 3 : t >= 0.9 ? 2 : t >= 0.78 ? 1 : 0;
  if (anim && flyCount) {
    const flies = ['a', 'b', 'c'].slice(0, flyCount).map((k, i) =>
      `<g class="fly ${k}"><g transform="translate(${128 + [92, -88, 70][i]} ${118 + [-70, 40, 84][i]})">
        <circle r="3" fill="#111"/><ellipse cx="-3" cy="-3" rx="3" ry="1.6" fill="#9aa" opacity=".7"/><ellipse cx="3" cy="-3" rx="3" ry="1.6" fill="#9aa" opacity=".7"/></g></g>`).join('');
    extras += flies;
  }
  if (anim && t >= 0.62) {
    const o = ramp(t, 0.62, 0.8);
    extras += ['a', 'b', 'c'].map((k, i) =>
      `<path class="stink ${k}" d="M${96 + i * 30} 34 q4 -6 0 -12 q-4 -6 0 -12" fill="none" stroke="#8FA13F" stroke-width="2.5" stroke-linecap="round" opacity="${o}"/>`).join('');
  }
  if (anim && t >= 0.9) {
    extras += `<ellipse class="drop" cx="152" cy="178" rx="3.5" ry="5" fill="#8FA13F"/>`;
  }
  const tear = (!over && t >= 0.8) ? `<path d="M182 92 q0 -14 6 -22 q6 8 6 22 a6 6 0 0 1 -12 0z" fill="#6FB3E6" opacity="${ramp(t, 0.8, 0.9)}"/>` : ''; 

  return `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    ${earL}${earR}
    <circle cx="128" cy="128" r="80" fill="${fur}"/>
    ${patch}${cracks}${spotSvg}
    <g class="eyes">${eye(102, 128, xLeft, 0, lerp(2, 0, cloud))}${eye(154, 128, xRight, cloud, lerp(2, 0, cloud))}</g>
    ${blush}${whiskers}${nose}${mouth}${tear}${extras}
  </svg>`;
}

