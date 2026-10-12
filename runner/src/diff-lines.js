import { relative, resolve } from 'node:path';

// Which lines of a unified diff GitHub will take an inline comment on: every line inside a
// hunk, on the new side (RIGHT) or the old side (LEFT), per file.
export function hunkRanges(diffText) {
  const files = new Map();
  let cur = null;
  const unquote = (p) => p.replace(/^"(.*)"$/, '$1');
  for (const line of String(diffText).split('\n')) {
    if (line.startsWith('diff --git ')) { cur = { RIGHT: [], LEFT: [], oldPath: null }; continue; }
    if (!cur) continue;
    if (line.startsWith('--- ')) { const p = unquote(line.slice(4)); cur.oldPath = p === '/dev/null' ? null : p.replace(/^a\//, ''); continue; }
    if (line.startsWith('+++ ')) {
      const p = unquote(line.slice(4));
      const name = p === '/dev/null' ? cur.oldPath : p.replace(/^b\//, '');
      if (name) files.set(name, cur);
      continue;
    }
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (h) {
      const [a, b, c, d] = [h[1], h[2] ?? '1', h[3], h[4] ?? '1'].map(Number);
      if (b > 0) cur.LEFT.push([a, a + b - 1]);
      if (d > 0) cur.RIGHT.push([c, c + d - 1]);
    }
  }
  return files;
}

// null when GitHub would anchor it; otherwise why not, with the lines it would take.
export function anchorProblem(files, { path: raw, line, startLine, side = 'RIGHT' }, checkout = null) {
  // Named as the poster resolves it: relative to the checkout, so ./a.ts and /abs/checkout/a.ts match.
  const path = checkout ? relative(checkout, resolve(checkout, String(raw))) : String(raw).replace(/^\.\//, '');
  const f = files.get(path);
  if (!f) return `${path} is not in this review's diff; comment on a changed file (${[...files.keys()].slice(0, 12).join(', ')})`;
  const ranges = f[side] ?? [];
  const inside = (n) => ranges.some(([lo, hi]) => n >= lo && n <= hi);
  if (!Number.isInteger(line)) return null; // a file-level comment on a changed file
  const bad = [line, startLine].filter((n) => Number.isInteger(n) && !inside(n));
  // GitHub takes a range only within one hunk.
  const hunk = ranges.find(([lo, hi]) => line >= lo && line <= hi);
  if (!bad.length && Number.isInteger(startLine) && !(startLine >= hunk[0] && startLine <= hunk[1])) {
    return `lines ${startLine}-${line} of ${path} span two hunks; GitHub takes a range only within one (${hunk[0]}-${hunk[1]}). Re-file on lines inside one hunk`;
  }
  if (bad.length) {
    const where = ranges.map(([lo, hi]) => (lo === hi ? `${lo}` : `${lo}-${hi}`)).join(', ') || 'none';
    return `line ${bad[0]} of ${path} is outside the diff on the ${side} side; the diff's ${side} lines are ${where}. Re-file the finding on the line where the defect is`;
  }
  return null;
}
