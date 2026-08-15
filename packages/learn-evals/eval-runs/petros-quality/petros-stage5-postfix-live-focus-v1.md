# Petros Quality — Stage 5 post-fix live focus v1

- Run: `petros-stage5-postfix-live-focus-v1`
- Gate: **warn**
- Mode/source: live / evaluation
- Sessions: 1/1 completed
- Mean score: 4.12 / 5
- Cost: 0.026345 USD
- Production writes: 0

## Dimensions

| Dimension | Mean | N |
|---|---:|---:|
| correctness | 4.00 | 1 |
| structural variety | 4.50 | 1 |
| move appropriateness | 3.84 | 1 |
| prerequisite handling | 3.50 | 1 |
| guess confidence | 2.50 | 1 |
| stuck recovery | 5.00 | 1 |
| socratic cap | 4.00 | 1 |
| pacing | 4.00 | 1 |
| explainability | 4.50 | 1 |
| detour return | 5.00 | 1 |
| repetition | 4.00 | 1 |
| artifact quality | 2.50 | 1 |
| safety boundaries | 5.00 | 1 |
| language register | 5.00 | 1 |
| operational efficiency | 4.50 | 1 |

## Regressions and failures

- No blocking failures.
- Warning: guess_confidence:Guess-first or confidence evidence is missing.
- Warning: artifact_quality:No artifact proposal appears.

## Session evidence

### Integration by parts × repeated_struggle

Moves: prerequisite_check (live_move_1_4110add3) → hint (live_move_recovery_2_hint) → missing_step (live_move_recovery_3_missing_step) → worked_solution (live_move_recovery_4_worked_solution) → reworded_success (live_move_recovery_5_reworded_success) → goal_frame (live_move_2_fb6d7bba) → worked_example (live_move_3_44240afe)

Score: 4.12 / 5