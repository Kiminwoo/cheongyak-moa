import { isRecord } from '@cheongyak-moa/contracts';
import type { CloudRefreshJob, Environment } from '@cheongyak-moa/contracts';

const startCommand = 'npm run data:cloud';
const statuses = ['pending', 'running', 'succeeded', 'failed', 'canceled'] as const;
const active = (job: CloudRefreshJob) => job.status === 'pending' || job.status === 'running';

export function cloudRefreshJobs(env: Environment, fetchFn = fetch) {
  const service = env.RENDER_REFRESH_SERVICE_ID?.trim() ?? '';
  const token = env.RENDER_REFRESH_API_KEY?.trim();
  if (!/^crn-[a-z0-9]+$/.test(service) || !token) return null;
  const endpoint = new URL(`https://api.render.com/v1/services/${service}/jobs`);
  let starting: Promise<CloudRefreshJob> | undefined;

  function parseJob(input: unknown): CloudRefreshJob {
    if (
      !isRecord(input) ||
      input.serviceId !== service ||
      input.startCommand !== startCommand ||
      typeof input.id !== 'string' ||
      !/^job-[a-z0-9]{20}$/.test(input.id) ||
      typeof input.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(input.createdAt))
    )
      throw new Error('클라우드 작업 응답 형식 오류');
    const status = statuses.find((value) => value === input.status);
    if (!status) throw new Error('클라우드 작업 상태를 확인할 수 없습니다.');
    return { id: input.id, status, createdAt: input.createdAt };
  }

  async function request(url: URL, body?: string): Promise<unknown> {
    const response = await fetchFn(url, {
      method: body ? 'POST' : 'GET',
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(3500),
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('클라우드 작업 서비스 오류');
    return response.json();
  }

  async function status() {
    const url = new URL(endpoint);
    url.searchParams.set('limit', '20');
    const payload = await request(url);
    if (!Array.isArray(payload)) throw new Error('클라우드 작업 목록 형식 오류');
    const jobs = payload
      .flatMap((row) =>
        isRecord(row) && isRecord(row.job) && row.job.startCommand === startCommand
          ? [parseJob(row.job)]
          : [],
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return jobs.find(active) ?? jobs[0] ?? null;
  }

  async function enqueue() {
    const job = await status();
    if (job && active(job)) return job;
    return parseJob(await request(endpoint, JSON.stringify({ startCommand })));
  }

  return {
    status,
    start() {
      starting ??= enqueue().finally(() => {
        starting = undefined;
      });
      return starting;
    },
  };
}
