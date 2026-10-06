import assert from 'node:assert/strict';
import test from 'node:test';

const { buildTable, FACILITY_TYPES } = await import('../src/game/facilities.js');
const { DEV_BUILD_MAX_MS, DEV_BUILD_MIN_MS, limitBuildMs } = await import('../src/game/devBuildClock.js');

test('dev build clock keeps the monte carlo order inside 3 to 15 seconds', () => {
  const rows = FACILITY_TYPES.flatMap((type) => buildTable(type.id));
  const lows = rows.map((row) => row.low);
  const highs = rows.map((row) => row.high);
  const shortest = Math.min(...lows);
  const longest = Math.max(...highs);
  assert.equal(limitBuildMs(shortest), DEV_BUILD_MIN_MS);
  assert.equal(limitBuildMs(longest), DEV_BUILD_MAX_MS);
  assert.equal(limitBuildMs(shortest - 20), DEV_BUILD_MIN_MS);
  assert.equal(limitBuildMs(longest + 20), DEV_BUILD_MAX_MS);
  const times = rows.map((row) => limitBuildMs(row.median));
  assert.ok(times.every((ms) => ms >= DEV_BUILD_MIN_MS && ms <= DEV_BUILD_MAX_MS));
  assert.ok(new Set(times).size > 1);
  const ordered = [...rows].sort((left, right) => left.median - right.median);
  assert.ok(limitBuildMs(ordered[0].median) <= limitBuildMs(ordered.at(-1).median));
});
