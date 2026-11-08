const types='feat|fix|refactor|perf|docs|test|build|ci|chore|style|revert';
const pattern=new RegExp(`^(${types})(\\([a-z0-9][a-z0-9/-]*\\))?(!)?: \\S.{0,99}$`);
export function validateCommitMessage(message){
  const header=message.split(/\r?\n/,1)[0];
  if(!pattern.test(header))return 'Use type(scope): summary, for example feat(api): validate imported notices';
  if(header.length>100)return 'Commit header must be 100 characters or fewer.';
  return null;
}
