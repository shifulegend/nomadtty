#!/usr/bin/env node
/**
 * NomadTTY — deterministic streaming-text generator for mobile stress tests.
 *
 * Stands in for a real local LLM / AI CLI (e.g. `claude -p`) in the
 * automated Playwright suite (tests/specs/android-mobile-stress.spec.js).
 * The suite needs long, continuously-arriving PTY output to stress-test
 * scrolling/typing/rotation/keyboard-toggle concurrency with real terminal
 * behavior -- what matters for that is the *traffic pattern* (small chunks,
 * arriving over real wall-clock time, wrapping across many terminal rows),
 * not that the text is produced by an actual model. Using a real LLM here
 * would make the suite slow, non-deterministic, network-dependent, and
 * metered against a real API for every CI run -- see docs/ai/decision-log.md
 * for the full rationale, including a one-off manual spot-check against the
 * real `claude` CLI (already installed in this environment) confirming this
 * script's traffic pattern is representative.
 *
 * Usage:
 *   node scripts/simulate-model-stream.mjs [wordCount] [delayMs]
 *
 * Writes wrapping prose to stdout, one word at a time, flushing
 * immediately, with a small delay between words (default ~35ms, matching
 * the rough per-token cadence of a real streaming LLM response).
 */

const WORDS = (
  'the quick brown fox jumps over the lazy dog while considering ocean ' +
  'currents temperature gradients salinity thermohaline circulation deep ' +
  'water formation surface winds equatorial upwelling coastal boundary ' +
  'layers atmospheric pressure systems seasonal variation climate patterns ' +
  'marine ecosystems nutrient transport carbon sequestration ' +
  'biogeochemical cycles phytoplankton photosynthesis oxygen production ' +
  'continental shelf bathymetry sediment transport erosion deposition ' +
  'tidal forces lunar gravitational influence spring tides neap tides ' +
  'storm surge coastal flooding wave mechanics wind driven currents ' +
  'geostrophic balance coriolis effect planetary rotation angular momentum'
).split(' ');

const wordCount = parseInt(process.argv[2], 10) || 400;
const delayMs = parseInt(process.argv[3], 10) || 35;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let i = 0; i < wordCount; i++) {
    const word = WORDS[i % WORDS.length];
    process.stdout.write((i === 0 ? '' : ' ') + word);
    if ((i + 1) % 14 === 0) process.stdout.write('\n');
    await sleep(delayMs);
  }
  process.stdout.write('\n[stream complete]\n');
}

main();
