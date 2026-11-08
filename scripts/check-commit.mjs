import { readFileSync } from 'node:fs';
import { validateCommitMessage } from './commit-convention.mjs';
const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/check-commit.mjs COMMIT_MESSAGE_FILE');
  process.exitCode = 1;
} else {
  const failure = validateCommitMessage(readFileSync(path, 'utf8'));
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  }
}
