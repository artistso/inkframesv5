#!/usr/bin/env node

/**
 * Convert an InkFrame semantic version plus a release slot into a monotonic
 * Android versionCode.
 *
 * Layout: MMMmmppss
 *   major * 1,000,000
 *   minor *    10,000
 *   patch *       100
 *   slot  *         1
 *
 * Examples:
 *   0.5.0 slot 1  -> 50001  (Play candidate)
 *   0.5.0 slot 99 -> 50099  (production tag)
 *   0.5.1 slot 0  -> 50100
 */
export function androidVersionCode(version, slot = 0) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(String(version || '').trim());
  if (!match) throw new Error(`Invalid semantic version: ${version}`);

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const resolvedSlot = Number(slot);

  if (!Number.isInteger(major) || major < 0 || major > 2100) {
    throw new Error(`Android version major must be between 0 and 2100: ${major}`);
  }
  if (!Number.isInteger(minor) || minor < 0 || minor > 99) {
    throw new Error(`Android version minor must be between 0 and 99: ${minor}`);
  }
  if (!Number.isInteger(patch) || patch < 0 || patch > 99) {
    throw new Error(`Android version patch must be between 0 and 99: ${patch}`);
  }
  if (!Number.isInteger(resolvedSlot) || resolvedSlot < 0 || resolvedSlot > 99) {
    throw new Error(`Android release slot must be between 0 and 99: ${slot}`);
  }

  const code = major * 1_000_000 + minor * 10_000 + patch * 100 + resolvedSlot;
  if (code < 1 || code > 2_100_000_000) {
    throw new Error(`Android versionCode is outside the supported range: ${code}`);
  }
  return code;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${androidVersionCode(process.argv[2], process.argv[3] ?? 0)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
