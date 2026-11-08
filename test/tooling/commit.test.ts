import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommitMessage } from '../../scripts/commit-convention.mjs';
test('Conventional Commits accepts features, fixes, scopes and breaking changes', () => {
  for (const text of [
    'feat(api): add imports',
    'fix(web): preserve filters',
    'refactor!: split workspaces',
    'docs: update setup',
  ])
    assert.equal(validateCommitMessage(text), null);
});
test('Commit convention rejects ambiguous messages and missing summaries', () => {
  for (const text of ['update files', 'Feat: add', 'fix: ', 'feat(api): ' + 'x'.repeat(110)])
    assert.ok(validateCommitMessage(text));
});
