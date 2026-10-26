import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Skill artifact is complete and references resolve; does not test model activation', async () => {
  const base = new URL('./atlas-version-usage/', import.meta.url);
  const skill = await readFile(new URL('SKILL.md', base), 'utf8');
  assert.match(skill, /^---\nname: atlas-version-usage\ndescription: .+\n---/);
  const paths = [...skill.matchAll(/references\/[a-z-]+\.md/g)].map(m => m[0]);
  assert.equal(paths.length, 1);
  const reference = await readFile(new URL(paths[0], base), 'utf8');
  assert.match(reference, /不是权威组件数据库/);
  assert.match(reference, /C-B14@r1/);
  assert.match(skill, /不执行分享或保存/);
});
