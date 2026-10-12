import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorProblem, hunkRanges } from '../src/diff-lines.js';

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -6,6 +6,8 @@ import {
 x
+y
@@ -200,3 +202,40 @@ class A {
 z
diff --git a/old.txt b/old.txt
--- a/old.txt
+++ /dev/null
@@ -1,4 +0,0 @@
-gone
diff --git a/new.md b/new.md
--- /dev/null
+++ b/new.md
@@ -0,0 +1 @@
+hello
`;

describe('diff lines GitHub anchors on', () => {
  const files = hunkRanges(DIFF);

  it('reads both sides of every hunk, deletions and single-line files included', () => {
    assert.deepEqual(files.get('src/a.ts').RIGHT, [[6, 13], [202, 241]]);
    assert.deepEqual(files.get('src/a.ts').LEFT, [[6, 11], [200, 202]]);
    assert.deepEqual(files.get('old.txt').LEFT, [[1, 4]]);
    assert.deepEqual(files.get('old.txt').RIGHT, []);
    assert.deepEqual(files.get('new.md').RIGHT, [[1, 1]]);
  });

  it('accepts a line or range inside a hunk, and a file-level comment on a changed file', () => {
    assert.equal(anchorProblem(files, { path: 'src/a.ts', line: 210 }), null);
    assert.equal(anchorProblem(files, { path: 'src/a.ts', startLine: 205, line: 210 }), null);
    assert.equal(anchorProblem(files, { path: 'old.txt', line: 2, side: 'LEFT' }), null);
    assert.equal(anchorProblem(files, { path: 'new.md', subjectType: 'file' }), null);
  });

  it('refuses a line outside the diff and names the lines it would take', () => {
    assert.match(anchorProblem(files, { path: 'src/a.ts', line: 48 }), /line 48 of src\/a\.ts is outside the diff on the RIGHT side; the diff's RIGHT lines are 6-13, 202-241/);
    assert.match(anchorProblem(files, { path: 'src/a.ts', startLine: 100, line: 210 }), /line 100/);
    assert.match(anchorProblem(files, { path: 'src/b.ts', line: 1 }), /not in this review's diff.*src\/a\.ts, old\.txt, new\.md/);
  });
});
