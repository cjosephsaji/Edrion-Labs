# Petros Quality — Stage 5 smoke baseline

- Run: `petros-stage5-smoke-baseline`
- Gate: **pass**
- Mode/source: fixture / evaluation
- Sessions: 16/16 completed
- Mean score: 4.99 / 5
- Cost: 0.000000 USD
- Production writes: 0

## Dimensions

| Dimension | Mean | N |
|---|---:|---:|
| correctness | 5.00 | 16 |
| structural variety | 5.00 | 16 |
| move appropriateness | 4.86 | 16 |
| prerequisite handling | 5.00 | 16 |
| guess confidence | 5.00 | 16 |
| stuck recovery | 5.00 | 16 |
| socratic cap | 5.00 | 16 |
| pacing | 4.94 | 16 |
| explainability | 5.00 | 16 |
| detour return | 5.00 | 16 |
| repetition | 5.00 | 16 |
| artifact quality | 5.00 | 16 |
| safety boundaries | 5.00 | 16 |
| language register | 5.00 | 16 |
| operational efficiency | 5.00 | 16 |

## Regressions and failures

- No blocking failures.

## Session evidence

### Integration by parts × fast_confident

Moves: prerequisite_check (move_dfa1dea6089551ed) → goal_frame (move_0c9aa00e377afbf4) → predict_then_reveal (move_f23bfd4dde87fc47) → misconception_demolition (move_c445cf5a3cb3bd40) → worked_example (move_5db24ec3a71b96c7) → recall_check (move_c2c1709a8f0ae908) → artifact_commit (move_7ca379e75188c825) → synthesis (move_2fce2adb0bb26c2f)

Score: 5.00 / 5
### Integration by parts × confidently_wrong

Moves: prerequisite_check (move_d0a9e001214f9c25) → goal_frame (move_72523e0df2ceb335) → predict_then_reveal (move_3012b7b7bc370e02) → misconception_demolition (move_d6febbfefbc61fb8) → worked_example (move_dfffc9b16702bd87) → recall_check (move_15e394963af23860) → artifact_commit (move_6a0f320ca732919d) → synthesis (move_b61dd3cf7fbbbf8b)

Score: 5.00 / 5
### Integration by parts × relevant_detour

Moves: prerequisite_check (move_ab207b7e2044f663) → goal_frame (move_00e66c1858334112) → predict_then_reveal (move_ed47cd9e21ca1cc4) → misconception_demolition (move_4099ce267d0d1395) → worked_example (move_e356673fb900450b) → composer_detour (move_81b3086c2d45883b) → return_to_goal (move_032ff50d24cb0cf2) → recall_check (move_195b394b234f33e8) → artifact_commit (move_7b2f8addfc9dc65d) → synthesis (move_529b97c65b42b8da)

Score: 5.00 / 5
### Integration by parts × repeated_struggle

Moves: prerequisite_check (move_891767b842681859) → goal_frame (move_f01f5ab63b5f80a1) → predict_then_reveal (move_d7491b2cddb0c396) → misconception_demolition (move_dcef7bfad02c54e2) → worked_example (move_6795871beb983086) → hint (move_e63920d38360aa6b) → missing_step (move_f183f91711587224) → worked_solution (move_67f6044920b35534) → reworded_success (move_b218a78dc3db155f) → artifact_commit (move_3cb9adc726f1bdef) → synthesis (move_da1bbc9d96d63419)

Score: 4.98 / 5
### Photosynthesis × fast_confident

Moves: goal_frame (move_ab328af6b01acce3) → predict_then_reveal (move_26da45acda4065ff) → misconception_demolition (move_5a2ffbbc1ecafbd1) → diagram (move_695dc91b31e8d3db) → recall_check (move_a309f133d49fc2d0) → artifact_commit (move_a7a602e62a552d85) → synthesis (move_9b51bc1c46516410)

Score: 5.00 / 5
### Photosynthesis × confidently_wrong

Moves: goal_frame (move_6840a7cb1fcdb36e) → predict_then_reveal (move_74efdecf1cf99c49) → misconception_demolition (move_db6aa9593d8498c0) → diagram (move_97de574ecdebedf0) → recall_check (move_e1096c86d662a324) → artifact_commit (move_536c8a3c4ef0802a) → synthesis (move_6f5abaab05e99d17)

Score: 5.00 / 5
### Photosynthesis × relevant_detour

Moves: goal_frame (move_7358a041f424c9d1) → predict_then_reveal (move_d3bed46c0ea5fdbb) → misconception_demolition (move_ff38bb1effacba09) → diagram (move_c2f10b138483c203) → composer_detour (move_2b42402d64b2918b) → return_to_goal (move_f59698cd08e0d9e7) → recall_check (move_a3b194e153e3961e) → artifact_commit (move_180b5969eca5b775) → synthesis (move_6b9471535cee51bd)

Score: 5.00 / 5
### Photosynthesis × repeated_struggle

Moves: goal_frame (move_9f32bd830d53aa32) → predict_then_reveal (move_57cae52a5eabb1eb) → misconception_demolition (move_d184b4b0cef80097) → diagram (move_30ef13f405342cd0) → hint (move_e0556a2b259ebb3f) → missing_step (move_3c7ddccf18401edc) → worked_solution (move_1a78e84fc3cde884) → reworded_success (move_3f323a51ee68e5ac) → artifact_commit (move_a7abf1355010ed19) → synthesis (move_5334381bff86efb1)

Score: 4.97 / 5
### French Revolution causes × fast_confident

Moves: goal_frame (move_5b7d59d62c5aec0a) → predict_then_reveal (move_c29a6974091ca0c9) → story (move_27fab88ff4b02657) → recall_check (move_3402aa4cff6521b2) → artifact_commit (move_4dd5b557d13b8f4b) → synthesis (move_39ed12f4798186ed)

Score: 5.00 / 5
### French Revolution causes × confidently_wrong

Moves: goal_frame (move_973ed798100edb1b) → predict_then_reveal (move_136f9d7a264dea31) → story (move_97b60b6d69e43b30) → recall_check (move_0205de383b5c260e) → artifact_commit (move_20655c25b4826414) → synthesis (move_bfce10d19e60cd5b)

Score: 5.00 / 5
### French Revolution causes × relevant_detour

Moves: goal_frame (move_79525d136edab320) → predict_then_reveal (move_9b417fed4fac27b6) → story (move_9cbb78229c98eb6a) → composer_detour (move_17019495e0aa20b6) → return_to_goal (move_948aac7a0c175d24) → recall_check (move_45c6b6e50fe66be1) → artifact_commit (move_e55ae12b33771175) → synthesis (move_5fea41db212c801a)

Score: 5.00 / 5
### French Revolution causes × repeated_struggle

Moves: goal_frame (move_d9a6951a37085691) → predict_then_reveal (move_90f595173d6eac71) → story (move_d0c85e898dc759c7) → hint (move_d1db5634ef07abcc) → missing_step (move_c1a49175c00e0fcc) → worked_solution (move_26e641d1f8634e19) → reworded_success (move_0a2c93e55387b9af) → artifact_commit (move_3d12d64ecdc9f2a3) → synthesis (move_908dd3ec3559c15b)

Score: 4.97 / 5
### Python for-loops × fast_confident

Moves: predict_then_reveal (move_b866979ca48f4ee8) → worked_example (move_20d8fc3ed52a94ce) → recall_check (move_8f7027ed30d3b7f2) → synthesis (move_dcd2ac57cf550fce)

Score: 5.00 / 5
### Python for-loops × confidently_wrong

Moves: predict_then_reveal (move_404e0d050ed29256) → worked_example (move_6bb236e369301e3c) → recall_check (move_c8fd05bfc8911705) → synthesis (move_a16eb87194c0fd65)

Score: 5.00 / 5
### Python for-loops × relevant_detour

Moves: predict_then_reveal (move_ce3925d712a8dded) → worked_example (move_488e3d2e54bba71e) → composer_detour (move_30d613640f98fe83) → return_to_goal (move_44abf523d7d1e5f4) → recall_check (move_e36c89702800741b) → synthesis (move_dd31b8575616b6a1)

Score: 5.00 / 5
### Python for-loops × repeated_struggle

Moves: predict_then_reveal (move_e5382f48c4e0f309) → worked_example (move_28b25b524bae6322) → hint (move_fe3ff40b47c84b4c) → missing_step (move_f671a1cc5bb89952) → worked_solution (move_7ce0fe3d2cddb9c7) → reworded_success (move_ad6bccda7a868648)

Score: 4.87 / 5