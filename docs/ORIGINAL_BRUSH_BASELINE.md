# Original brush baseline tablet test

This branch intentionally builds from the post-v0.1.1 commit `35b904337167d9fa92681b0dfe4d4a45ca2571e5`.

Its purpose is diagnostic: verify the last known-good simple EMA brush stabilizer on the Samsung tablet before any further brush-engine work.

The baseline excludes:

- the v0.1.2 velocity-adaptive rope/directional-bias stabilizer;
- later S Pen sample quarantine and cadence normalization experiments;
- velocity-dynamics runtime interception.

Tablet test:

1. Draw slow circles and spirals.
2. Draw fast diagonals and flicks.
3. Draw repeated tight curves.
4. Compare jaggedness and long spikes with PR builds #7–#10.

Do not merge this diagnostic branch into `main` as-is. Use the result to prepare a minimal restoration patch on the current application code.
