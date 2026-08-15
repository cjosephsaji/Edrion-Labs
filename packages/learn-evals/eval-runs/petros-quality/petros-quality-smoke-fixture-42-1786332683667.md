# Petros Quality — smoke fixture (repetitive_moves)

- Run: `petros-quality-smoke-fixture-42-1786332683667`
- Gate: **fail**
- Mode/source: fixture / evaluation
- Sessions: 16/16 completed
- Mean score: 4.52 / 5
- Cost: 0.000000 USD
- Production writes: 0

## Dimensions

| Dimension | Mean | N |
|---|---:|---:|
| correctness | 5.00 | 16 |
| structural variety | 4.13 | 16 |
| move appropriateness | 4.09 | 16 |
| prerequisite handling | 5.00 | 16 |
| guess confidence | 4.50 | 16 |
| stuck recovery | 4.00 | 16 |
| socratic cap | 5.00 | 16 |
| pacing | 5.00 | 16 |
| explainability | 5.00 | 16 |
| detour return | 4.00 | 16 |
| repetition | 2.06 | 16 |
| artifact quality | 5.00 | 16 |
| safety boundaries | 5.00 | 16 |
| language register | 5.00 | 16 |
| operational efficiency | 5.00 | 16 |

## Regressions and failures

- BLOCKING: stuck_recovery:The struggle ladder is incomplete or does not end in success.
- BLOCKING: regression:dimension:stuck_recovery:-1
- Warning: guess_confidence:Guess-first or confidence evidence is missing.
- Warning: repetition:Longest identical streak: 4; generic repeated reasons: 4.
- Warning: structural_variety:5 distinct move types across 10 moves.
- Warning: detour_return:Detour lacks an explicit return to goal.
- Warning: repetition:Longest identical streak: 6; generic repeated reasons: 6.
- Warning: structural_variety:5 distinct move types across 11 moves.
- Warning: repetition:Longest identical streak: 7; generic repeated reasons: 7.
- Warning: repetition:Longest identical streak: 3; generic repeated reasons: 3.
- Warning: repetition:Longest identical streak: 5; generic repeated reasons: 5.
- Warning: regression:dimension:structural_variety:-0.87
- Warning: regression:dimension:move_appropriateness:-0.77
- Warning: regression:dimension:guess_confidence:-0.5
- Warning: regression:dimension:detour_return:-1
- Warning: regression:dimension:repetition:-2.94
- Warning: regression:topic:topic:integration-by-parts:-0.72
- Warning: regression:topic:topic:photosynthesis:-0.55
- Warning: regression:topic:topic:french-revolution:-0.39
- Warning: regression:persona:fast_confident:-0.27
- Warning: regression:persona:confidently_wrong:-0.27
- Warning: regression:persona:relevant_detour:-0.64
- Warning: regression:persona:repeated_struggle:-0.69

## Session evidence

### Integration by parts × fast_confident

Moves: prerequisite_check (move_dfa1dea6089551ed) → goal_frame (move_0c9aa00e377afbf4) → layered_explanation (move_1f70740047b69d0d) → layered_explanation (move_55aa4e60df80d75f) → layered_explanation (move_f40b78bfd7f0adcb) → layered_explanation (move_359605c13c663285) → artifact_commit (move_7ca379e75188c825) → synthesis (move_2fce2adb0bb26c2f)

Score: 4.44 / 5
### Integration by parts × confidently_wrong

Moves: prerequisite_check (move_d0a9e001214f9c25) → goal_frame (move_72523e0df2ceb335) → layered_explanation (move_d42af32c3e9d54ba) → layered_explanation (move_e423d2527c970e98) → layered_explanation (move_26f91d5477d50d92) → layered_explanation (move_d7b8e6d56d1341b1) → artifact_commit (move_6a0f320ca732919d) → synthesis (move_b61dd3cf7fbbbf8b)

Score: 4.44 / 5
### Integration by parts × relevant_detour

Moves: prerequisite_check (move_ab207b7e2044f663) → goal_frame (move_00e66c1858334112) → layered_explanation (move_c76a661dc846d127) → layered_explanation (move_7caeadf92ed4339c) → layered_explanation (move_af868ece2bf78ff9) → layered_explanation (move_698b8a81feaa495f) → layered_explanation (move_d7c896c82e2f3bc3) → layered_explanation (move_d8e5a381f6710315) → artifact_commit (move_7b2f8addfc9dc65d) → synthesis (move_529b97c65b42b8da)

Score: 4.11 / 5
### Integration by parts × repeated_struggle

Moves: prerequisite_check (move_891767b842681859) → goal_frame (move_f01f5ab63b5f80a1) → layered_explanation (move_9314d5ce97febc58) → layered_explanation (move_7e390c2a2e4a50a9) → layered_explanation (move_547cceab850f02bf) → layered_explanation (move_3f26aa2608505045) → layered_explanation (move_d56ac133dc5697b2) → layered_explanation (move_58e0849a5b879a27) → layered_explanation (move_2920ed294919ccb7) → artifact_commit (move_3cb9adc726f1bdef) → synthesis (move_da1bbc9d96d63419)

Score: 4.11 / 5
### Photosynthesis × fast_confident

Moves: goal_frame (move_ab328af6b01acce3) → predict_then_reveal (move_26da45acda4065ff) → layered_explanation (move_48e9ea3975fe0276) → layered_explanation (move_a0ccfcef61c61a29) → layered_explanation (move_e8d232190fa83ff2) → artifact_commit (move_a7a602e62a552d85) → synthesis (move_9b51bc1c46516410)

Score: 4.59 / 5
### Photosynthesis × confidently_wrong

Moves: goal_frame (move_6840a7cb1fcdb36e) → predict_then_reveal (move_74efdecf1cf99c49) → layered_explanation (move_01b9e6d8635e087b) → layered_explanation (move_c36587af89d8edd4) → layered_explanation (move_eca0a3f8632c2519) → artifact_commit (move_536c8a3c4ef0802a) → synthesis (move_6f5abaab05e99d17)

Score: 4.59 / 5
### Photosynthesis × relevant_detour

Moves: goal_frame (move_7358a041f424c9d1) → predict_then_reveal (move_d3bed46c0ea5fdbb) → layered_explanation (move_96aadcf491790adb) → layered_explanation (move_571998f2c75a935f) → layered_explanation (move_84bd46da8a7cb1f3) → layered_explanation (move_8df692c64aa75dfe) → layered_explanation (move_d7a5a89d30272524) → artifact_commit (move_180b5969eca5b775) → synthesis (move_6b9471535cee51bd)

Score: 4.32 / 5
### Photosynthesis × repeated_struggle

Moves: goal_frame (move_9f32bd830d53aa32) → predict_then_reveal (move_57cae52a5eabb1eb) → layered_explanation (move_dd886413a498e03f) → layered_explanation (move_c03b6137b2b441e9) → layered_explanation (move_0d52cd97d8f962d6) → layered_explanation (move_1dd791bbbaa0cf36) → layered_explanation (move_d78ab9811a3459ac) → layered_explanation (move_892f72071619c9e7) → artifact_commit (move_a7abf1355010ed19) → synthesis (move_5334381bff86efb1)

Score: 4.25 / 5
### French Revolution causes × fast_confident

Moves: goal_frame (move_5b7d59d62c5aec0a) → predict_then_reveal (move_c29a6974091ca0c9) → layered_explanation (move_62264bc41fa6b1e7) → layered_explanation (move_5176bf08869f654b) → artifact_commit (move_4dd5b557d13b8f4b) → synthesis (move_39ed12f4798186ed)

Score: 4.87 / 5
### French Revolution causes × confidently_wrong

Moves: goal_frame (move_973ed798100edb1b) → predict_then_reveal (move_136f9d7a264dea31) → layered_explanation (move_7757c67d98c6d89b) → layered_explanation (move_980db23a9dabaf1d) → artifact_commit (move_20655c25b4826414) → synthesis (move_bfce10d19e60cd5b)

Score: 4.87 / 5
### French Revolution causes × relevant_detour

Moves: goal_frame (move_79525d136edab320) → predict_then_reveal (move_9b417fed4fac27b6) → layered_explanation (move_1b20317caad6027d) → layered_explanation (move_fb9a78ae1a460335) → layered_explanation (move_170b68d89b5fcd0e) → layered_explanation (move_d0cf069313c514a1) → artifact_commit (move_e55ae12b33771175) → synthesis (move_5fea41db212c801a)

Score: 4.33 / 5
### French Revolution causes × repeated_struggle

Moves: goal_frame (move_d9a6951a37085691) → predict_then_reveal (move_90f595173d6eac71) → layered_explanation (move_8329f34de0842c0d) → layered_explanation (move_0d6075b28a7521a8) → layered_explanation (move_917b43fc7be0fd33) → layered_explanation (move_262c7968aa4be36f) → layered_explanation (move_fc28d8ffd6a78c6d) → artifact_commit (move_3d12d64ecdc9f2a3) → synthesis (move_908dd3ec3559c15b)

Score: 4.33 / 5
### Python for-loops × fast_confident

Moves: predict_then_reveal (move_b866979ca48f4ee8) → worked_example (move_20d8fc3ed52a94ce) → recall_check (move_8f7027ed30d3b7f2) → synthesis (move_dcd2ac57cf550fce)

Score: 5.00 / 5
### Python for-loops × confidently_wrong

Moves: predict_then_reveal (move_404e0d050ed29256) → worked_example (move_6bb236e369301e3c) → recall_check (move_c8fd05bfc8911705) → synthesis (move_a16eb87194c0fd65)

Score: 5.00 / 5
### Python for-loops × relevant_detour

Moves: predict_then_reveal (move_ce3925d712a8dded) → worked_example (move_488e3d2e54bba71e) → layered_explanation (move_6326a4b33767955b) → layered_explanation (move_3eb394b7001b4285) → recall_check (move_e36c89702800741b) → synthesis (move_dd31b8575616b6a1)

Score: 4.67 / 5
### Python for-loops × repeated_struggle

Moves: predict_then_reveal (move_e5382f48c4e0f309) → worked_example (move_28b25b524bae6322) → layered_explanation (move_2ca9d8bc87989245) → layered_explanation (move_caa8f54a003ba2c4) → layered_explanation (move_148a2a0b2d1ccdc6) → reworded_success (move_ad6bccda7a868648) → synthesis (move_628af896cd86e819)

Score: 4.37 / 5