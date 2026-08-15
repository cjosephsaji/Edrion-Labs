# Petros Quality — Stage 5 live preflight v7

- Run: `petros-stage5-live-preflight-v7`
- Gate: **warn**
- Mode/source: live / evaluation
- Sessions: 1/1 completed
- Mean score: 4.50 / 5
- Cost: 0.031248 USD
- Production writes: 0

## Dimensions

| Dimension | Mean | N |
|---|---:|---:|
| correctness | 4.00 | 1 |
| structural variety | 5.00 | 1 |
| move appropriateness | 4.50 | 1 |
| prerequisite handling | 5.00 | 1 |
| guess confidence | 3.50 | 1 |
| stuck recovery | 4.50 | 1 |
| socratic cap | 4.50 | 1 |
| pacing | 4.50 | 1 |
| explainability | 5.00 | 1 |
| detour return | 4.50 | 1 |
| repetition | 4.50 | 1 |
| artifact quality | 3.00 | 1 |
| safety boundaries | 5.00 | 1 |
| language register | 5.00 | 1 |
| operational efficiency | 5.00 | 1 |

## Regressions and failures

- No blocking failures.
- Warning: guess_confidence:Guess-first or confidence evidence is missing.
- Warning: artifact_quality:No artifact proposal appears.

## Session evidence

### Integration by parts × fast_confident

Moves: prerequisite_check (live_move_1_cdc4b6d2) → goal_frame (live_move_2_7919cc43) → worked_example (live_move_3_39251e9a) → predict_then_reveal (live_move_4_8d194e56)

Score: 4.50 / 5