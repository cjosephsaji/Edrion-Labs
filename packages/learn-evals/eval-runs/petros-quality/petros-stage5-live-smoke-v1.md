# Petros Quality — Stage 5 live smoke v1

- Run: `petros-stage5-live-smoke-v1`
- Gate: **fail**
- Mode/source: live / evaluation
- Sessions: 16/16 completed
- Mean score: 4.39 / 5
- Cost: 0.303288 USD
- Production writes: 0

## Dimensions

| Dimension | Mean | N |
|---|---:|---:|
| correctness | 3.94 | 16 |
| structural variety | 4.69 | 16 |
| move appropriateness | 4.36 | 16 |
| prerequisite handling | 4.75 | 16 |
| guess confidence | 2.75 | 16 |
| stuck recovery | 4.06 | 16 |
| socratic cap | 4.47 | 16 |
| pacing | 4.44 | 16 |
| explainability | 4.97 | 16 |
| detour return | 4.34 | 16 |
| repetition | 4.78 | 16 |
| artifact quality | 3.47 | 16 |
| safety boundaries | 5.00 | 16 |
| language register | 4.97 | 16 |
| operational efficiency | 4.84 | 16 |

## Regressions and failures

- BLOCKING: stuck_recovery:The struggle ladder is incomplete or does not end in success.
- BLOCKING: regression:dimension:correctness:-1.06
- BLOCKING: regression:dimension:stuck_recovery:-0.94
- BLOCKING: regression:dimension:socratic_cap:-0.53
- Warning: guess_confidence:Guess-first or confidence evidence is missing.
- Warning: artifact_quality:No artifact proposal appears.
- Warning: detour_return:Detour lacks an explicit return to goal.
- Warning: regression:dimension:structural_variety:-0.31
- Warning: regression:dimension:move_appropriateness:-0.5
- Warning: regression:dimension:prerequisite_handling:-0.25
- Warning: regression:dimension:guess_confidence:-2.25
- Warning: regression:dimension:pacing:-0.5
- Warning: regression:dimension:detour_return:-0.66
- Warning: regression:dimension:artifact_quality:-1.53
- Warning: regression:topic:topic:integration-by-parts:-0.62
- Warning: regression:topic:topic:photosynthesis:-0.63
- Warning: regression:topic:topic:french-revolution:-0.61
- Warning: regression:topic:topic:python-for-loops:-0.53
- Warning: regression:persona:fast_confident:-0.47
- Warning: regression:persona:confidently_wrong:-0.66
- Warning: regression:persona:relevant_detour:-0.64
- Warning: regression:persona:repeated_struggle:-0.62

## Session evidence

### Integration by parts × fast_confident

Moves: prerequisite_check (live_move_1_e9c59900) → goal_frame (live_move_2_144194c3) → worked_example (live_move_3_92bc8620)

Score: 4.42 / 5
### Integration by parts × confidently_wrong

Moves: prerequisite_check (live_move_1_be24e84f) → goal_frame (live_move_2_32171c77) → worked_example (live_move_3_ec9b7add)

Score: 4.46 / 5
### Integration by parts × relevant_detour

Moves: prerequisite_check (live_move_1_836fb108) → goal_frame (live_move_2_506d633c) → worked_example (live_move_3_b00db2e9)

Score: 4.36 / 5
### Integration by parts × repeated_struggle

Moves: prerequisite_check (live_move_1_a23a0c53) → goal_frame (live_move_2_d6d6c1b6) → worked_example (live_move_3_ac652d08)

Score: 4.26 / 5
### Photosynthesis × fast_confident

Moves: misconception_demolition (live_move_1_a7196034) → goal_frame (live_move_2_7ad3d575) → diagram (live_move_3_ef4eb5d6)

Score: 4.49 / 5
### Photosynthesis × confidently_wrong

Moves: misconception_demolition (live_move_1_0570e83b) → goal_frame (live_move_2_8549ac8f) → diagram (live_move_3_c3cf2c6a)

Score: 4.39 / 5
### Photosynthesis × relevant_detour

Moves: misconception_demolition (live_move_1_4431ce83) → goal_frame (live_move_2_621cd0eb) → diagram (live_move_3_3b60a275)

Score: 4.29 / 5
### Photosynthesis × repeated_struggle

Moves: misconception_demolition (live_move_1_2e9d9640) → goal_frame (live_move_2_302ef691) → diagram (live_move_3_01dca176)

Score: 4.26 / 5
### French Revolution causes × fast_confident

Moves: goal_frame (live_move_1_8f59368f) → story (live_move_2_9799b1e8) → contrast_case (live_move_3_f2f601d9)

Score: 4.52 / 5
### French Revolution causes × confidently_wrong

Moves: goal_frame (live_move_1_ec82e9f7) → hook (live_move_2_a77cb107) → story (live_move_3_2e80a3d3)

Score: 4.45 / 5
### French Revolution causes × relevant_detour

Moves: goal_frame (live_move_1_fcc41a7e) → story (live_move_2_2cb6b32a) → recall_check (live_move_3_7b79fe0d)

Score: 4.27 / 5
### French Revolution causes × repeated_struggle

Moves: goal_frame (live_move_1_a61485f2) → story (live_move_2_898eb7b8) → contrast_case (live_move_3_85ac6eb1)

Score: 4.28 / 5
### Python for-loops × fast_confident

Moves: prerequisite_check (live_move_1_db496e4c) → predict_then_reveal (live_move_2_04a9c5c4) → worked_example (live_move_3_0d3d4916)

Score: 4.67 / 5
### Python for-loops × confidently_wrong

Moves: prerequisite_check (live_move_1_11843c28) → predict_then_reveal (live_move_2_1bc47c2b) → worked_example (live_move_3_a9b61044)

Score: 4.07 / 5
### Python for-loops × relevant_detour

Moves: prerequisite_check (live_move_1_f94bb722) → predict_then_reveal (live_move_2_42c3b942) → worked_example (live_move_3_1420a9ab)

Score: 4.50 / 5
### Python for-loops × repeated_struggle

Moves: prerequisite_check (live_move_1_d1300429) → predict_then_reveal (live_move_2_1ecb7f0c) → worked_example (live_move_3_2e012c12)

Score: 4.53 / 5