import type { Environment, CollectionConfig } from '@cheongyak-moa/contracts';
import { koreaToday } from '@cheongyak-moa/domain';
export function collectionConfig(
  env: Environment = process.env,
  today = koreaToday(),
): CollectionConfig {
  const days = Number(env.COLLECT_LOOKBACK_DAYS || 180);
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new Error('수집 기간은 1~3650일의 정수로 설정해 주세요.');
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  const configured = (key: unknown) => typeof key === 'string' && !!key.trim();
  return {
    lookbackDays: days,
    from: from.toISOString().slice(0, 10),
    to: today,
    configured: {
      applyhome: configured(env.APPLYHOME_SERVICE_KEY),
      lh: configured(env.LH_SERVICE_KEY),
    },
  };
}
