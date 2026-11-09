import type { CoverageUnit } from '@cheongyak-moa/contracts';
import { COVERAGE_UNITS } from './coverage.js';

export function refreshPolicy(units: CoverageUnit[], startedAt: string, priceFailures: number) {
  const fresh = (unit: CoverageUnit) =>
    unit.status === 'success' &&
    !!unit.startedAt &&
    unit.startedAt >= startedAt &&
    !!unit.endedAt &&
    unit.endedAt >= unit.startedAt;
  const required = COVERAGE_UNITS.filter((unit) => unit.implemented && unit.channel === 'api');
  const blocked = required
    .filter((spec) => {
      const unit = units.find((item) => item.sourceId === spec.sourceId && item.unit === spec.unit);
      return !unit || !fresh(unit);
    })
    .map((unit) => `${unit.sourceId}/${unit.unit}`);
  const limited = COVERAGE_UNITS.filter((unit) => unit.channel === 'web')
    .filter((spec) => {
      const unit = units.find((item) => item.sourceId === spec.sourceId && item.unit === spec.unit);
      return !spec.implemented || !unit || !fresh(unit);
    })
    .map((unit) => `${unit.sourceId}/${unit.unit}`);
  return {
    snapshotAllowed: blocked.length === 0 && priceFailures === 0,
    nationwideComplete: false as const,
    blocked,
    limited,
    priceFailures,
  };
}
