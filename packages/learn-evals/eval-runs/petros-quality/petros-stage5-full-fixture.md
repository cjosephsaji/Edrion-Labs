# Petros Quality — Stage 5 full fixture corpus

- Run: `petros-stage5-full-fixture`
- Gate: **fail**
- Mode/source: fixture / evaluation
- Sessions: 240/240 completed
- Mean score: 4.98 / 5
- Cost: 0.000000 USD
- Production writes: 0

## Dimensions

| Dimension | Mean | N |
|---|---:|---:|
| correctness | 5.00 | 240 |
| structural variety | 5.00 | 240 |
| move appropriateness | 4.89 | 240 |
| prerequisite handling | 5.00 | 240 |
| guess confidence | 5.00 | 240 |
| stuck recovery | 4.95 | 240 |
| socratic cap | 5.00 | 240 |
| pacing | 4.96 | 240 |
| explainability | 5.00 | 240 |
| detour return | 5.00 | 240 |
| repetition | 5.00 | 240 |
| artifact quality | 5.00 | 240 |
| safety boundaries | 5.00 | 240 |
| language register | 4.90 | 240 |
| operational efficiency | 5.00 | 240 |

## Regressions and failures

- BLOCKING: stuck_recovery:The struggle ladder is incomplete or does not end in success.
- Warning: language_register:Mixed-language case was rendered only in formal English.

## Session evidence

### Integration by parts × fast_confident

Moves: prerequisite_check (move_dfa1dea6089551ed) → goal_frame (move_0c9aa00e377afbf4) → predict_then_reveal (move_f23bfd4dde87fc47) → misconception_demolition (move_c445cf5a3cb3bd40) → worked_example (move_5db24ec3a71b96c7) → recall_check (move_c2c1709a8f0ae908) → artifact_commit (move_7ca379e75188c825) → synthesis (move_2fce2adb0bb26c2f)

Score: 5.00 / 5
### Integration by parts × slow_careful

Moves: prerequisite_check (move_8d8480dcf51e4530) → goal_frame (move_0e6dc9e8c776dee4) → predict_then_reveal (move_0d98edd43383cbb5) → misconception_demolition (move_d241ccbe37b9fead) → worked_example (move_f26e94f2d7ef82fa) → recall_check (move_593cb4db6fa47d50) → artifact_commit (move_3af78b499bc41a97) → synthesis (move_4f4aba63ffaf7531)

Score: 5.00 / 5
### Integration by parts × confidently_wrong

Moves: prerequisite_check (move_d0a9e001214f9c25) → goal_frame (move_72523e0df2ceb335) → predict_then_reveal (move_3012b7b7bc370e02) → misconception_demolition (move_d6febbfefbc61fb8) → worked_example (move_dfffc9b16702bd87) → recall_check (move_15e394963af23860) → artifact_commit (move_6a0f320ca732919d) → synthesis (move_b61dd3cf7fbbbf8b)

Score: 5.00 / 5
### Integration by parts × disengaged_skipping

Moves: prerequisite_check (move_77e057704fcaf2ce) → goal_frame (move_c01f5ca8672ecc63) → predict_then_reveal (move_549b040611000628) → misconception_demolition (move_6450807d35ffdea8) → worked_example (move_b84b1a3c83b19e4e) → recall_check (move_d656f4e5217342b0) → artifact_commit (move_3d9a130e19d1dda4) → synthesis (move_46ac2b50b39a2ab8)

Score: 5.00 / 5
### Integration by parts × weak_prerequisites

Moves: prerequisite_check (move_3401f36ff2020fd3) → goal_frame (move_5b049d9ecea2f597) → predict_then_reveal (move_880cb095d60e2b3b) → misconception_demolition (move_9960c39143f4dd4b) → worked_example (move_bd1a116b1f4d04e1) → recall_check (move_af7d961ef2f4a129) → artifact_commit (move_14e6bdc7d232825e) → synthesis (move_3de0ef9f1d2875b9)

Score: 5.00 / 5
### Integration by parts × relevant_detour

Moves: prerequisite_check (move_ab207b7e2044f663) → goal_frame (move_00e66c1858334112) → predict_then_reveal (move_ed47cd9e21ca1cc4) → misconception_demolition (move_4099ce267d0d1395) → worked_example (move_e356673fb900450b) → composer_detour (move_81b3086c2d45883b) → return_to_goal (move_032ff50d24cb0cf2) → recall_check (move_195b394b234f33e8) → artifact_commit (move_7b2f8addfc9dc65d) → synthesis (move_529b97c65b42b8da)

Score: 5.00 / 5
### Integration by parts × unsure_but_correct

Moves: prerequisite_check (move_0ac0e4425300d83e) → goal_frame (move_35da1e58ab94bbe5) → predict_then_reveal (move_270c55dd1b939f0d) → misconception_demolition (move_f61a5fad9689291e) → worked_example (move_fa058523285001fa) → recall_check (move_640a109949852518) → artifact_commit (move_20add93fa6d64e1d) → synthesis (move_ac3828beb410ac46)

Score: 5.00 / 5
### Integration by parts × repeated_struggle

Moves: prerequisite_check (move_891767b842681859) → goal_frame (move_f01f5ab63b5f80a1) → predict_then_reveal (move_d7491b2cddb0c396) → misconception_demolition (move_dcef7bfad02c54e2) → worked_example (move_6795871beb983086) → hint (move_e63920d38360aa6b) → missing_step (move_f183f91711587224) → worked_solution (move_67f6044920b35534) → reworded_success (move_b218a78dc3db155f) → artifact_commit (move_3cb9adc726f1bdef) → synthesis (move_da1bbc9d96d63419)

Score: 4.98 / 5
### Photosynthesis × fast_confident

Moves: goal_frame (move_ab328af6b01acce3) → predict_then_reveal (move_26da45acda4065ff) → misconception_demolition (move_5a2ffbbc1ecafbd1) → diagram (move_695dc91b31e8d3db) → recall_check (move_a309f133d49fc2d0) → artifact_commit (move_a7a602e62a552d85) → synthesis (move_9b51bc1c46516410)

Score: 5.00 / 5
### Photosynthesis × slow_careful

Moves: goal_frame (move_fcd7e50141ba4b5c) → predict_then_reveal (move_1ce2222066088ff9) → misconception_demolition (move_1ebe44be04549e72) → diagram (move_0edd86d05375c01c) → recall_check (move_213a95498c3299db) → artifact_commit (move_a9f1db5dfaa9a3d3) → synthesis (move_55b0c4f8d9cd9960)

Score: 5.00 / 5
### Photosynthesis × confidently_wrong

Moves: goal_frame (move_6840a7cb1fcdb36e) → predict_then_reveal (move_74efdecf1cf99c49) → misconception_demolition (move_db6aa9593d8498c0) → diagram (move_97de574ecdebedf0) → recall_check (move_e1096c86d662a324) → artifact_commit (move_536c8a3c4ef0802a) → synthesis (move_6f5abaab05e99d17)

Score: 5.00 / 5
### Photosynthesis × disengaged_skipping

Moves: goal_frame (move_787ab0de369d9db7) → predict_then_reveal (move_a69a14f5f516fa27) → misconception_demolition (move_4f760e0bf334f146) → diagram (move_bffe12c2130c8e53) → recall_check (move_727007af0e5dd22b) → artifact_commit (move_eb37556983bcfbb3) → synthesis (move_c596baa087588194)

Score: 5.00 / 5
### Photosynthesis × weak_prerequisites

Moves: prerequisite_check (move_677fed65af09ce68) → goal_frame (move_adf2da6a086107ee) → predict_then_reveal (move_dfe7e3323de20813) → misconception_demolition (move_8b4029d8dc6650b4) → diagram (move_89fa9b07b4760341) → recall_check (move_88aaa0dbe6a56748) → artifact_commit (move_d5a5dd9854e7d0be) → synthesis (move_13c39e3ba099b805)

Score: 5.00 / 5
### Photosynthesis × relevant_detour

Moves: goal_frame (move_7358a041f424c9d1) → predict_then_reveal (move_d3bed46c0ea5fdbb) → misconception_demolition (move_ff38bb1effacba09) → diagram (move_c2f10b138483c203) → composer_detour (move_2b42402d64b2918b) → return_to_goal (move_f59698cd08e0d9e7) → recall_check (move_a3b194e153e3961e) → artifact_commit (move_180b5969eca5b775) → synthesis (move_6b9471535cee51bd)

Score: 5.00 / 5
### Photosynthesis × unsure_but_correct

Moves: goal_frame (move_b865054777d0e57b) → predict_then_reveal (move_629bf73b92b43d3d) → misconception_demolition (move_9402b9ce7d518d0e) → diagram (move_c89222ef2e1d93e5) → recall_check (move_749a37d39eb7399f) → artifact_commit (move_538fa83b69f040bd) → synthesis (move_88d36ebdfbe6dd90)

Score: 5.00 / 5
### Photosynthesis × repeated_struggle

Moves: goal_frame (move_9f32bd830d53aa32) → predict_then_reveal (move_57cae52a5eabb1eb) → misconception_demolition (move_d184b4b0cef80097) → diagram (move_30ef13f405342cd0) → hint (move_e0556a2b259ebb3f) → missing_step (move_3c7ddccf18401edc) → worked_solution (move_1a78e84fc3cde884) → reworded_success (move_3f323a51ee68e5ac) → artifact_commit (move_a7abf1355010ed19) → synthesis (move_5334381bff86efb1)

Score: 4.97 / 5
### French Revolution causes × fast_confident

Moves: goal_frame (move_5b7d59d62c5aec0a) → predict_then_reveal (move_c29a6974091ca0c9) → story (move_27fab88ff4b02657) → recall_check (move_3402aa4cff6521b2) → artifact_commit (move_4dd5b557d13b8f4b) → synthesis (move_39ed12f4798186ed)

Score: 5.00 / 5
### French Revolution causes × slow_careful

Moves: goal_frame (move_029a58012799dfed) → predict_then_reveal (move_3cacdc7430192b4e) → story (move_c8ea180ab4fbf9c5) → recall_check (move_694d3b2eecdf40df) → artifact_commit (move_e159f68681a8a469) → synthesis (move_323e472f25ea309b)

Score: 5.00 / 5
### French Revolution causes × confidently_wrong

Moves: goal_frame (move_973ed798100edb1b) → predict_then_reveal (move_136f9d7a264dea31) → story (move_97b60b6d69e43b30) → recall_check (move_0205de383b5c260e) → artifact_commit (move_20655c25b4826414) → synthesis (move_bfce10d19e60cd5b)

Score: 5.00 / 5
### French Revolution causes × disengaged_skipping

Moves: goal_frame (move_fd1aa2a75aa20dab) → predict_then_reveal (move_d9522bd9e701c85b) → story (move_e2d61d2f979bdc7a) → recall_check (move_6cf25ea40de02f9c) → artifact_commit (move_b87e6fa9b7e643ff) → synthesis (move_101889d66507b4c1)

Score: 5.00 / 5
### French Revolution causes × weak_prerequisites

Moves: prerequisite_check (move_fb5b2a74dddf86e3) → goal_frame (move_1c9009087a93f173) → predict_then_reveal (move_9d907fe299e322da) → story (move_c5ff7a2036874290) → recall_check (move_b22abc2eeb31bc59) → artifact_commit (move_6d9b2f3687b01cea) → synthesis (move_368da56ad9722dcf)

Score: 5.00 / 5
### French Revolution causes × relevant_detour

Moves: goal_frame (move_79525d136edab320) → predict_then_reveal (move_9b417fed4fac27b6) → story (move_9cbb78229c98eb6a) → composer_detour (move_17019495e0aa20b6) → return_to_goal (move_948aac7a0c175d24) → recall_check (move_45c6b6e50fe66be1) → artifact_commit (move_e55ae12b33771175) → synthesis (move_5fea41db212c801a)

Score: 5.00 / 5
### French Revolution causes × unsure_but_correct

Moves: goal_frame (move_1e77f1e14e2cbf31) → predict_then_reveal (move_453c2aff1c96aaac) → story (move_62abfdc48eda0f2f) → recall_check (move_2a7ab9b793d1918e) → artifact_commit (move_8784f804031a9546) → synthesis (move_7d1dd002b55f1fd7)

Score: 5.00 / 5
### French Revolution causes × repeated_struggle

Moves: goal_frame (move_d9a6951a37085691) → predict_then_reveal (move_90f595173d6eac71) → story (move_d0c85e898dc759c7) → hint (move_d1db5634ef07abcc) → missing_step (move_c1a49175c00e0fcc) → worked_solution (move_26e641d1f8634e19) → reworded_success (move_0a2c93e55387b9af) → artifact_commit (move_3d12d64ecdc9f2a3) → synthesis (move_908dd3ec3559c15b)

Score: 4.97 / 5
### Python for-loops × fast_confident

Moves: predict_then_reveal (move_b866979ca48f4ee8) → worked_example (move_20d8fc3ed52a94ce) → recall_check (move_8f7027ed30d3b7f2) → synthesis (move_dcd2ac57cf550fce)

Score: 5.00 / 5
### Python for-loops × slow_careful

Moves: predict_then_reveal (move_5b7725970844d040) → worked_example (move_db85996d0b9ce24d) → recall_check (move_65379cd5f957b154) → synthesis (move_d3edb44111e81218)

Score: 5.00 / 5
### Python for-loops × confidently_wrong

Moves: predict_then_reveal (move_404e0d050ed29256) → worked_example (move_6bb236e369301e3c) → recall_check (move_c8fd05bfc8911705) → synthesis (move_a16eb87194c0fd65)

Score: 5.00 / 5
### Python for-loops × disengaged_skipping

Moves: predict_then_reveal (move_8b03b6d3c6aae71c) → worked_example (move_31610badcce6a923) → recall_check (move_9136e03371165917) → synthesis (move_576f2ee267d32d8a)

Score: 5.00 / 5
### Python for-loops × weak_prerequisites

Moves: prerequisite_check (move_1f4a5799a8f0f1ec) → predict_then_reveal (move_b6d0da53196b4d46) → worked_example (move_6e23333df08dca41) → recall_check (move_0a811e99459c270c) → synthesis (move_7772bd70aaca04c7)

Score: 5.00 / 5
### Python for-loops × relevant_detour

Moves: predict_then_reveal (move_ce3925d712a8dded) → worked_example (move_488e3d2e54bba71e) → composer_detour (move_30d613640f98fe83) → return_to_goal (move_44abf523d7d1e5f4) → recall_check (move_e36c89702800741b) → synthesis (move_dd31b8575616b6a1)

Score: 5.00 / 5
### Python for-loops × unsure_but_correct

Moves: predict_then_reveal (move_357b025e3748e0d9) → worked_example (move_80d6640e40e7c76b) → recall_check (move_607d88dd0403da9a) → synthesis (move_a6897db298633236)

Score: 5.00 / 5
### Python for-loops × repeated_struggle

Moves: predict_then_reveal (move_e5382f48c4e0f309) → worked_example (move_28b25b524bae6322) → hint (move_fe3ff40b47c84b4c) → missing_step (move_f671a1cc5bb89952) → worked_solution (move_7ce0fe3d2cddb9c7) → reworded_success (move_ad6bccda7a868648)

Score: 4.87 / 5
### Ohm's law × fast_confident

Moves: prerequisite_check (move_055f991d97e3a149) → goal_frame (move_8f190e4f63ea542f) → predict_then_reveal (move_15f289506cc02631) → misconception_demolition (move_bfdeb6ae17b5ebad) → worked_example (move_64bd15db493342c9) → recall_check (move_5466ad30cda470c8) → artifact_commit (move_a29dfe9e06ed6184) → synthesis (move_95c036d086178b26)

Score: 5.00 / 5
### Ohm's law × slow_careful

Moves: prerequisite_check (move_70e92c6921f059d1) → goal_frame (move_1d611883cad8f115) → predict_then_reveal (move_fbfc7faa4f144fdc) → misconception_demolition (move_5035c17942e3abe6) → worked_example (move_39f3b7fee4b34627) → recall_check (move_5dca77f73e3a0f74) → artifact_commit (move_919139a162406b86) → synthesis (move_02e93636d82211ea)

Score: 5.00 / 5
### Ohm's law × confidently_wrong

Moves: prerequisite_check (move_91c9d1a9ac63e5ab) → goal_frame (move_a4646367ebbdff24) → predict_then_reveal (move_c4ac0c59deb4409b) → misconception_demolition (move_f8f87e32a50b17ee) → worked_example (move_80751456bf5e9407) → recall_check (move_e8a4f25dcfe12115) → artifact_commit (move_e218456ad2658d79) → synthesis (move_c535a324610f64f6)

Score: 5.00 / 5
### Ohm's law × disengaged_skipping

Moves: prerequisite_check (move_bbe9eaac4224b90c) → goal_frame (move_937ecbb4ab796afc) → predict_then_reveal (move_f268253a7a632a54) → misconception_demolition (move_6304d695f4d8f46e) → worked_example (move_fe31b490d66a4e8a) → recall_check (move_4e91a4ffeae4cad0) → artifact_commit (move_515f1531cd124ce5) → synthesis (move_77dc4d3f5c06c6f0)

Score: 5.00 / 5
### Ohm's law × weak_prerequisites

Moves: prerequisite_check (move_0f1abdd3e383b24d) → goal_frame (move_2a56694d00b95ea7) → predict_then_reveal (move_c08e47b09376c30c) → misconception_demolition (move_bbeb6d8b05f092df) → worked_example (move_f0c033233c2d1f1c) → recall_check (move_09917021b60bd6dc) → artifact_commit (move_45fb90b2f1a81b95) → synthesis (move_01b850da7557438f)

Score: 5.00 / 5
### Ohm's law × relevant_detour

Moves: prerequisite_check (move_8d57ffd554b9aaf7) → goal_frame (move_6a1aecb4e8f5d86c) → predict_then_reveal (move_2ead159649f0499d) → misconception_demolition (move_ceca366d97f45724) → worked_example (move_fce794d738fbbf77) → composer_detour (move_61d804ecbf08849a) → return_to_goal (move_c2305c3efcbd21b9) → recall_check (move_28df1a0d06ab428c) → artifact_commit (move_fde895466c14045c) → synthesis (move_521bb71a9f37b48b)

Score: 5.00 / 5
### Ohm's law × unsure_but_correct

Moves: prerequisite_check (move_914e9a66ce55945e) → goal_frame (move_995f5f684e8e6b7c) → predict_then_reveal (move_a009b77f16f19396) → misconception_demolition (move_2da7acfaad733252) → worked_example (move_7565cc60dc05e892) → recall_check (move_25debd36a2a14185) → artifact_commit (move_7b7f791202250c6d) → synthesis (move_f8c9ab063dc9c2c3)

Score: 5.00 / 5
### Ohm's law × repeated_struggle

Moves: prerequisite_check (move_00997e09c2a22734) → goal_frame (move_c1850067f6a36462) → predict_then_reveal (move_aee4c53b7f1c387f) → misconception_demolition (move_0830de9c58d94c23) → worked_example (move_56483167299c8f27) → hint (move_c5352a1ac2f188ac) → missing_step (move_0b8a0141af2e1f0d) → worked_solution (move_a8a4f02590bfc97e) → reworded_success (move_6026afcfa752c4f2) → artifact_commit (move_4352530f223ab568) → synthesis (move_f86b6ac9724e4e1e)

Score: 4.98 / 5
### Quadratic formula × fast_confident

Moves: prerequisite_check (move_f817f3bfa68f5e0c) → goal_frame (move_2ec9b55a5c9d9bd5) → predict_then_reveal (move_0029d816a4a6521d) → worked_example (move_b3724441a671ddff) → recall_check (move_6e85ddb389449600) → artifact_commit (move_87584f0a04fc72e7) → synthesis (move_e1e75bdd2c58bf64)

Score: 5.00 / 5
### Quadratic formula × slow_careful

Moves: prerequisite_check (move_fb2f03b277392eaa) → goal_frame (move_6776d44db194f0a3) → predict_then_reveal (move_80ba6cd930fbb316) → worked_example (move_a8887e609f6c16b8) → recall_check (move_5f44398a7c1f57e7) → artifact_commit (move_8677dac7094eaa67) → synthesis (move_88772dcfa3ee444d)

Score: 5.00 / 5
### Quadratic formula × confidently_wrong

Moves: prerequisite_check (move_104c6f42b3ac0a66) → goal_frame (move_af171de16c545e47) → predict_then_reveal (move_c04cbfde8dad730e) → worked_example (move_addd216823117b8f) → recall_check (move_0ed5f03d5d1d66f4) → artifact_commit (move_f6f75c9104bb4aad) → synthesis (move_de086abf68c653fc)

Score: 5.00 / 5
### Quadratic formula × disengaged_skipping

Moves: prerequisite_check (move_f8bb6c69e977070c) → goal_frame (move_fef3db71334d174b) → predict_then_reveal (move_e7532ee74dbc7fe5) → worked_example (move_c5cd11da66f73828) → recall_check (move_3c398c8eceb3c406) → artifact_commit (move_dd3eec4484738704) → synthesis (move_d950c99572388606)

Score: 5.00 / 5
### Quadratic formula × weak_prerequisites

Moves: prerequisite_check (move_4bd284ad6719647d) → goal_frame (move_8577158baf3af106) → predict_then_reveal (move_2e52daf4ca159f9e) → worked_example (move_7d5628ccfeefde6f) → recall_check (move_becbfa6b8961f2d3) → artifact_commit (move_80c466000f96bfda) → synthesis (move_1a16b4968ccd566d)

Score: 5.00 / 5
### Quadratic formula × relevant_detour

Moves: prerequisite_check (move_8be1dfbebbf5b8bb) → goal_frame (move_fb125460a44b747f) → predict_then_reveal (move_d83565dfa12d84c7) → worked_example (move_2a0d9e1d58cfca80) → composer_detour (move_0f4a3cb4e719b423) → return_to_goal (move_18b8b82063ce043e) → recall_check (move_c2eb7540cd043136) → artifact_commit (move_0747795912438089) → synthesis (move_50caa7b6861163f2)

Score: 5.00 / 5
### Quadratic formula × unsure_but_correct

Moves: prerequisite_check (move_dca3ed408fd9a706) → goal_frame (move_47c97e6e7b9acc57) → predict_then_reveal (move_5983aa583868c762) → worked_example (move_40c7b9af451b3987) → recall_check (move_ddb736c8a69ce567) → artifact_commit (move_cbff1b1b087e518a) → synthesis (move_e41744e6d68d15a1)

Score: 5.00 / 5
### Quadratic formula × repeated_struggle

Moves: prerequisite_check (move_8507f59ab8f744d2) → goal_frame (move_037a67f9d2474caf) → predict_then_reveal (move_7e9483f14089e26e) → worked_example (move_2abd7361c8eda63a) → hint (move_a859590dbcb9bd63) → missing_step (move_985bd8d80d0d9dcf) → worked_solution (move_3a8389524d9747cf) → reworded_success (move_0d451bc3ae01e3e3) → artifact_commit (move_39d6f1ff54098eba) → synthesis (move_0f247a03514f0b91)

Score: 4.97 / 5
### Mitosis stages × fast_confident

Moves: goal_frame (move_7aa2d69ad678d734) → predict_then_reveal (move_b69e51c6230c13ee) → misconception_demolition (move_db784481014ed4cf) → story (move_37de77597984e3eb) → recall_check (move_489c22ea1b270039) → artifact_commit (move_6760b2bcb21c3914) → synthesis (move_d96aec9a2c1ac932)

Score: 5.00 / 5
### Mitosis stages × slow_careful

Moves: goal_frame (move_f565f05765111f3a) → predict_then_reveal (move_f6728ddf34095188) → misconception_demolition (move_d1bcd2ecaa33d540) → story (move_8769c3e4c15e9362) → recall_check (move_0c6fb3b4cfa3ffdc) → artifact_commit (move_de7990a435cf88a9) → synthesis (move_631044aa64f66796)

Score: 5.00 / 5
### Mitosis stages × confidently_wrong

Moves: goal_frame (move_2041a09755f5f1e8) → predict_then_reveal (move_2cdb5f00dc2fd077) → misconception_demolition (move_045f9ae3552a64cc) → story (move_b3fa9ede847cf94f) → recall_check (move_c6880872fffbffcc) → artifact_commit (move_b4e04aa78c26fbb0) → synthesis (move_b65a0f1068e7147f)

Score: 5.00 / 5
### Mitosis stages × disengaged_skipping

Moves: goal_frame (move_805504af8c3955ed) → predict_then_reveal (move_cf84e3bdee35bf48) → misconception_demolition (move_dae87b66633abb14) → story (move_0e4780785386f2bc) → recall_check (move_0e90194a6870846c) → artifact_commit (move_2db6c322a399f77d) → synthesis (move_58e0cf204b0d3bf1)

Score: 5.00 / 5
### Mitosis stages × weak_prerequisites

Moves: prerequisite_check (move_de0537dccc12b393) → goal_frame (move_03144a910d2d0daa) → predict_then_reveal (move_b58a9f662b9b9667) → misconception_demolition (move_fd8f0f44a4eee0ab) → story (move_28a12ef956aed832) → recall_check (move_145a9e70dcaa24ca) → artifact_commit (move_0019cb1c03501d04) → synthesis (move_35373b07b9bd8177)

Score: 5.00 / 5
### Mitosis stages × relevant_detour

Moves: goal_frame (move_94a60a9dbbcdb7b7) → predict_then_reveal (move_2a5818b62eac52a8) → misconception_demolition (move_58d428bfa9cf82f3) → story (move_bbb7f873bbe7107c) → composer_detour (move_861067c7dc959444) → return_to_goal (move_378bc3c9a58599c2) → recall_check (move_f4653f3a7a241533) → artifact_commit (move_a38a21637c93fddd) → synthesis (move_4e107d98221e2eec)

Score: 5.00 / 5
### Mitosis stages × unsure_but_correct

Moves: goal_frame (move_c679ac2e1650ec5f) → predict_then_reveal (move_2fdc8f97f5874f5c) → misconception_demolition (move_1df5b3226bedef97) → story (move_6fcd6d77df6cd248) → recall_check (move_44af5f32eb66b4b0) → artifact_commit (move_b26dbe849b9d29d2) → synthesis (move_2b8188584cf1cad6)

Score: 5.00 / 5
### Mitosis stages × repeated_struggle

Moves: goal_frame (move_7e9a155548a52bad) → predict_then_reveal (move_10f508c76deb29c1) → misconception_demolition (move_8691b078dd4c03b4) → story (move_0414fb46af533720) → hint (move_3333ab72c6354163) → missing_step (move_5df9096c0f3f2ca5) → worked_solution (move_2fd3f94daae12218) → reworded_success (move_d514c624b129aed9) → artifact_commit (move_9b29d4ee5dadcfef) → synthesis (move_5d6cda69288a41d6)

Score: 4.97 / 5
### Supply and demand × fast_confident

Moves: predict_then_reveal (move_87d77154d09dea3d) → contrast_case (move_0a30b808c620e6ee) → recall_check (move_3382adbe7d9d4f97) → synthesis (move_b8dee84fffeb657b)

Score: 5.00 / 5
### Supply and demand × slow_careful

Moves: predict_then_reveal (move_194b53d6a667c2f0) → contrast_case (move_3d41b07524dc20f1) → recall_check (move_51c4654e27889666) → synthesis (move_321f1b9f7b865356)

Score: 5.00 / 5
### Supply and demand × confidently_wrong

Moves: predict_then_reveal (move_6cbeff0084c3ce49) → contrast_case (move_8bbfef3a6cdd4d55) → recall_check (move_9e5652179b2a6447) → synthesis (move_3a3354381f847a07)

Score: 5.00 / 5
### Supply and demand × disengaged_skipping

Moves: predict_then_reveal (move_0ec598e1c0f84d01) → contrast_case (move_5872fd69254b7ec2) → recall_check (move_abe72e0c140e926d) → synthesis (move_3549023ad06de7f5)

Score: 5.00 / 5
### Supply and demand × weak_prerequisites

Moves: prerequisite_check (move_cfb1b99f4633e8d7) → predict_then_reveal (move_0491218ba7d68824) → contrast_case (move_99dd65a3b6e65f6c) → recall_check (move_64b8a5e83c51f553) → synthesis (move_89627e692a53c11c)

Score: 5.00 / 5
### Supply and demand × relevant_detour

Moves: predict_then_reveal (move_f174d1f934d90de8) → contrast_case (move_e195c749456fd9e4) → composer_detour (move_098d29255bb0df7b) → return_to_goal (move_deba64ef07603c2d) → recall_check (move_485ad54fd3c9eac9) → synthesis (move_5764e6aaf3658c56)

Score: 5.00 / 5
### Supply and demand × unsure_but_correct

Moves: predict_then_reveal (move_7af90a7e2dc58339) → contrast_case (move_e229f5cedf636309) → recall_check (move_fa4f8763053a3cb2) → synthesis (move_dec023d30d9c100a)

Score: 5.00 / 5
### Supply and demand × repeated_struggle

Moves: predict_then_reveal (move_9045ffc72478aed4) → contrast_case (move_75755990919a033d) → hint (move_81ef04a9f39bacca) → missing_step (move_898086e7938fb94d) → worked_solution (move_85105e1cc1661576) → reworded_success (move_21bddbc7d608e450)

Score: 4.84 / 5
### Stoichiometry mole ratios × fast_confident

Moves: prerequisite_check (move_944306d5329669c7) → goal_frame (move_376c14fd241b9e52) → predict_then_reveal (move_4aff6a60e59a4625) → misconception_demolition (move_fb46284105480a4c) → worked_example (move_84c12e08ba0bcdac) → recall_check (move_380c76e5379df3b0) → artifact_commit (move_592f259613f432b0) → synthesis (move_38c67a8829c5dce7)

Score: 5.00 / 5
### Stoichiometry mole ratios × slow_careful

Moves: prerequisite_check (move_36f3d2005c856307) → goal_frame (move_26cd6a45a1f4f6c1) → predict_then_reveal (move_97572ff5d0d43591) → misconception_demolition (move_2032cf73a309bafd) → worked_example (move_ed3d631fd31b3c86) → recall_check (move_a513198722221a11) → artifact_commit (move_9efbb3710c955dfc) → synthesis (move_663480d4b2895ad6)

Score: 5.00 / 5
### Stoichiometry mole ratios × confidently_wrong

Moves: prerequisite_check (move_17d17d42cfbe7cd2) → goal_frame (move_4427e4e3043ca3ac) → predict_then_reveal (move_2878eb54558688ff) → misconception_demolition (move_3889c5749562fd7e) → worked_example (move_cc359386107a2518) → recall_check (move_de573171480613b8) → artifact_commit (move_472d21ae9437edd8) → synthesis (move_8af59ef9830d4ae2)

Score: 5.00 / 5
### Stoichiometry mole ratios × disengaged_skipping

Moves: prerequisite_check (move_58a0f1b0cc028254) → goal_frame (move_7da9f55c2d7a81c6) → predict_then_reveal (move_56d53bcb792f18a1) → misconception_demolition (move_664f3da0c3b9a0a4) → worked_example (move_64692f49426502db) → recall_check (move_1c05390a6e8f82fc) → artifact_commit (move_b05a92655d85a80f) → synthesis (move_80c9d4f195f17394)

Score: 5.00 / 5
### Stoichiometry mole ratios × weak_prerequisites

Moves: prerequisite_check (move_280d6b2076b12f3f) → goal_frame (move_fd627d6316d7c249) → predict_then_reveal (move_fa7126c313f10847) → misconception_demolition (move_c2f18c1b919f0342) → worked_example (move_0ce528d1c2e2d6d7) → recall_check (move_44941d98c742549d) → artifact_commit (move_447c0ce3a25d3ea2) → synthesis (move_0569a1f72feb90e9)

Score: 5.00 / 5
### Stoichiometry mole ratios × relevant_detour

Moves: prerequisite_check (move_bd74f2925edaa075) → goal_frame (move_b98fee9725f92a17) → predict_then_reveal (move_994bb0e21d0adec7) → misconception_demolition (move_15124379170eb7b5) → worked_example (move_ada93b11c631a9a5) → composer_detour (move_042e1ae61093f245) → return_to_goal (move_771555a4a8719547) → recall_check (move_e67e544d8634b691) → artifact_commit (move_ebe71457181e3f50) → synthesis (move_c7717de6cadeae81)

Score: 5.00 / 5
### Stoichiometry mole ratios × unsure_but_correct

Moves: prerequisite_check (move_4eccccfde24e9020) → goal_frame (move_31cbd347945f0180) → predict_then_reveal (move_d9044f5e246e5443) → misconception_demolition (move_e5d9d74ca992ceae) → worked_example (move_fea09237fb07c395) → recall_check (move_8ed1ddfb54839f2a) → artifact_commit (move_2261c3c507fea667) → synthesis (move_d81c5be7efd44d0d)

Score: 5.00 / 5
### Stoichiometry mole ratios × repeated_struggle

Moves: prerequisite_check (move_4942b3647b9d8ae3) → goal_frame (move_7f83c447c7168e90) → predict_then_reveal (move_a5d407ceaaa5c66a) → misconception_demolition (move_90325e7d930820a9) → worked_example (move_3ffb201adf102d97) → hint (move_98cbfaf62696608c) → missing_step (move_23687cb2458456e1) → worked_solution (move_8cc80b929107f976) → reworded_success (move_dd78fe8bccef3dd3) → artifact_commit (move_f5db32e8987ef89d) → synthesis (move_09f4c6be58c0b221)

Score: 4.98 / 5
### Thesis statements × fast_confident

Moves: goal_frame (move_eed8409f4fee3327) → predict_then_reveal (move_24d713692c6d111d) → worked_example (move_ef9a1748a9e36075) → recall_check (move_ee7c20c3fe21e2f9) → artifact_commit (move_c2748a77d24ffa47) → synthesis (move_57b2da10da2cefc7)

Score: 5.00 / 5
### Thesis statements × slow_careful

Moves: goal_frame (move_c36e90747432ff83) → predict_then_reveal (move_8dcb28878ff87c64) → worked_example (move_ec6e7801d4bea17e) → recall_check (move_14a9bd6ac4f69788) → artifact_commit (move_7f23df85a74f957d) → synthesis (move_76b4dc9771c5560e)

Score: 5.00 / 5
### Thesis statements × confidently_wrong

Moves: goal_frame (move_6e12967f045fe028) → predict_then_reveal (move_5c4a2da948350e57) → worked_example (move_f2709cf474171e2b) → recall_check (move_d6a01ffe648f93e5) → artifact_commit (move_d4703bbbac4a3cb2) → synthesis (move_71431ddb52e0db03)

Score: 5.00 / 5
### Thesis statements × disengaged_skipping

Moves: goal_frame (move_e6c129744784c97e) → predict_then_reveal (move_679101a745f079be) → worked_example (move_b574d38b1717cdb8) → recall_check (move_c806ded484c83760) → artifact_commit (move_d90694c7e9c76626) → synthesis (move_3130ec5be7781a5d)

Score: 5.00 / 5
### Thesis statements × weak_prerequisites

Moves: prerequisite_check (move_7b0225d5fefd2b87) → goal_frame (move_e8b850d958ab9022) → predict_then_reveal (move_88d5e63fac2b095b) → worked_example (move_eb9da38129c2d4a9) → recall_check (move_f824c5f2e29ad16a) → artifact_commit (move_99ebaf100e963bf8) → synthesis (move_4331b2b6bea48f66)

Score: 5.00 / 5
### Thesis statements × relevant_detour

Moves: goal_frame (move_09482f3e02c904d3) → predict_then_reveal (move_3c2e579e045d29c6) → worked_example (move_f99fe617d9ff0b8c) → composer_detour (move_eb9c4ed2f8cd9a5c) → return_to_goal (move_5ad9eb2630e61c37) → recall_check (move_3755389999624530) → artifact_commit (move_224c010a04fa7ba7) → synthesis (move_18bcffe3b130d14d)

Score: 5.00 / 5
### Thesis statements × unsure_but_correct

Moves: goal_frame (move_d7c8694231540fad) → predict_then_reveal (move_74f50bcc1c4a111d) → worked_example (move_b210f6d32f5665e3) → recall_check (move_59c4e2d42df87886) → artifact_commit (move_dd5a520f529d464b) → synthesis (move_86a1802bd6896f5b)

Score: 5.00 / 5
### Thesis statements × repeated_struggle

Moves: goal_frame (move_0581fb8deda6170f) → predict_then_reveal (move_c9b8048c6c5456e8) → worked_example (move_c0886740ba4d0020) → hint (move_6ed69aee760cba58) → missing_step (move_05e45956cec09db9) → worked_solution (move_43af391ad3da543b) → reworded_success (move_69f977d32f16eb28) → artifact_commit (move_6c954c5f689075e3) → synthesis (move_abc26d13ef579f59)

Score: 4.97 / 5
### Binary search × fast_confident

Moves: prerequisite_check (move_7cb6c80d99361611) → goal_frame (move_a126756c5e9aa010) → predict_then_reveal (move_1b667166905122f4) → story (move_fbf82ebf007fdb9d) → recall_check (move_7f7e56ed6a106715) → artifact_commit (move_2f096c1490da69dd) → synthesis (move_80660c0aeeb4a870)

Score: 4.98 / 5
### Binary search × slow_careful

Moves: prerequisite_check (move_98ce039283850c48) → goal_frame (move_db9d25c7c40ebe5c) → predict_then_reveal (move_36129e851bb9924b) → story (move_7fb8b855ef3091a8) → recall_check (move_0740a6303a9ee746) → artifact_commit (move_908c40cee6ba6272) → synthesis (move_c03d6335279ac6b6)

Score: 4.98 / 5
### Binary search × confidently_wrong

Moves: prerequisite_check (move_761f71111678169a) → goal_frame (move_38eea3959298a853) → predict_then_reveal (move_5b00fd6ca247d2cd) → story (move_008c44223d236fd4) → recall_check (move_13895192563b53f9) → artifact_commit (move_f37769049b0f5404) → synthesis (move_1d76b06aa0561f96)

Score: 4.98 / 5
### Binary search × disengaged_skipping

Moves: prerequisite_check (move_ae64f7108e800e38) → goal_frame (move_bf93297dcf1f8c15) → predict_then_reveal (move_1c6419a1aba2e4a0) → story (move_674006ffd6f438e9) → recall_check (move_387bd70afd755ba9) → artifact_commit (move_10ad85d071cafc95) → synthesis (move_2b145693ef1e4a4e)

Score: 4.98 / 5
### Binary search × weak_prerequisites

Moves: prerequisite_check (move_70db4d8346937d17) → goal_frame (move_174819bdc5b73464) → predict_then_reveal (move_95cbea08bf8f0469) → story (move_2b711405a105ec92) → recall_check (move_1d6e10934169cb63) → artifact_commit (move_6a3e0218f46c5848) → synthesis (move_d999e5746e35f11e)

Score: 4.98 / 5
### Binary search × relevant_detour

Moves: prerequisite_check (move_c98522e1d76f00e2) → goal_frame (move_a0bff4fa67731fe0) → predict_then_reveal (move_559dfd2ee007f9ff) → story (move_fc3da98827082523) → composer_detour (move_4d53529d15a62e5e) → return_to_goal (move_9a6e1a17f5d02a6c) → recall_check (move_c539cc218a759851) → artifact_commit (move_8b1f5b40b9cc77ac) → synthesis (move_a1c28b40238ef37f)

Score: 4.98 / 5
### Binary search × unsure_but_correct

Moves: prerequisite_check (move_803282cb5c43a0c7) → goal_frame (move_76c80cbf5ebaa399) → predict_then_reveal (move_f564ab1e35a4ccf5) → story (move_f09ea6f119c234d9) → recall_check (move_73245c5a79c257c3) → artifact_commit (move_8e0a51d99700c360) → synthesis (move_7c20429ce0b330cb)

Score: 4.98 / 5
### Binary search × repeated_struggle

Moves: prerequisite_check (move_8d12b7db62f6e9f9) → goal_frame (move_20e422246daba231) → predict_then_reveal (move_353071657bee4da9) → story (move_6916bad6a323189c) → hint (move_b7e88910c920492d) → missing_step (move_65553ff0080cd9c3) → worked_solution (move_ce569eed14310ea2) → reworded_success (move_d19ee5b96fff9519) → artifact_commit (move_d1b84ac10345dc19) → synthesis (move_60b3bf36afe1baa3)

Score: 4.96 / 5
### Periodic table trends × fast_confident

Moves: predict_then_reveal (move_544b1fbaf16df3fa) → misconception_demolition (move_335497d4c7f7678f) → contrast_case (move_60ebcd739681f9f1) → recall_check (move_ec23140acb28ec48) → synthesis (move_9b368e6d788b6a61)

Score: 5.00 / 5
### Periodic table trends × slow_careful

Moves: predict_then_reveal (move_0c5dbcc2b7abddf5) → misconception_demolition (move_2309440e2f9d3f7a) → contrast_case (move_79698a81e66b615a) → recall_check (move_c40bb791b03f36ab) → synthesis (move_62db59b2ad81b688)

Score: 5.00 / 5
### Periodic table trends × confidently_wrong

Moves: predict_then_reveal (move_5522e1b323ec2975) → misconception_demolition (move_be052f646a3e1234) → contrast_case (move_937cc564528992f4) → recall_check (move_85fd717d9a76e475) → synthesis (move_d5cc02b919fa31e9)

Score: 5.00 / 5
### Periodic table trends × disengaged_skipping

Moves: predict_then_reveal (move_3a857bdb0b50e7ab) → misconception_demolition (move_cc64502e6f3e5564) → contrast_case (move_89026b9c7c66a728) → recall_check (move_1899f80c40e024ca) → synthesis (move_1af3456c71de7dec)

Score: 5.00 / 5
### Periodic table trends × weak_prerequisites

Moves: prerequisite_check (move_c9a3c27427406a56) → predict_then_reveal (move_4d755e6d45579f0f) → misconception_demolition (move_7ab3fd6a0d4134e1) → contrast_case (move_4f2f5c0b8fc5fdcb) → recall_check (move_001f0826f57650b1) → synthesis (move_f217550a1cc3683b)

Score: 5.00 / 5
### Periodic table trends × relevant_detour

Moves: predict_then_reveal (move_eb4b5a12e56e4031) → misconception_demolition (move_a9cbefbab59c0356) → contrast_case (move_461cbaeb159325ed) → composer_detour (move_957d1a1944650106) → return_to_goal (move_0b29a99dcc497cf9) → recall_check (move_3f3a8cf464604bba)

Score: 4.90 / 5
### Periodic table trends × unsure_but_correct

Moves: predict_then_reveal (move_4bf505a526dbd0cc) → misconception_demolition (move_0876561b3c498c59) → contrast_case (move_aa4a1cb23b799101) → recall_check (move_3986983da86dc8de) → synthesis (move_3e69d9805e32e0d7)

Score: 5.00 / 5
### Periodic table trends × repeated_struggle

Moves: predict_then_reveal (move_d61a09babd31645d) → misconception_demolition (move_3a5099122ee4c25a) → contrast_case (move_446adced9e1eef50) → hint (move_aa799f18aa976616) → missing_step (move_4f5318ef9231e64e) → worked_solution (move_b6199f2efa8fb307)

Score: 4.60 / 5
### Causes of World War I × fast_confident

Moves: goal_frame (move_7c385d8d8be8ed5b) → predict_then_reveal (move_4b0475dadf035551) → story (move_b3ee641c944a2689) → recall_check (move_9fb746bb8453a729) → artifact_commit (move_30fe050b5dcd76b6) → synthesis (move_d6e6d802b132c06e)

Score: 5.00 / 5
### Causes of World War I × slow_careful

Moves: goal_frame (move_7293e1e7b711cded) → predict_then_reveal (move_d6c4fcff3ced55a8) → story (move_a46fdf85b7a58aed) → recall_check (move_1616b60daf0ab752) → artifact_commit (move_6d56e7d7eebf087b) → synthesis (move_0dddf2b726d96623)

Score: 5.00 / 5
### Causes of World War I × confidently_wrong

Moves: goal_frame (move_d748bbc84df09459) → predict_then_reveal (move_6666cec7cc87374c) → story (move_f6d8dc031346a176) → recall_check (move_57c7c6a7b77a4d9c) → artifact_commit (move_f1db6f28f943322c) → synthesis (move_d05338d8b4502ce7)

Score: 5.00 / 5
### Causes of World War I × disengaged_skipping

Moves: goal_frame (move_d2930df008d99721) → predict_then_reveal (move_4c90fa57fcd5cfb3) → story (move_61d0759523f3daf4) → recall_check (move_31bacccd35422791) → artifact_commit (move_fe08b1acaa976842) → synthesis (move_2f7bbeccb57837fc)

Score: 5.00 / 5
### Causes of World War I × weak_prerequisites

Moves: prerequisite_check (move_29bc0b0fbccaf7ee) → goal_frame (move_06a9cdbb0c7970da) → predict_then_reveal (move_475310f67940c16b) → story (move_a7775df6007f3e9d) → recall_check (move_ad2fd40fcc697f92) → artifact_commit (move_e2ee77e2602621dc) → synthesis (move_74898cac81a30d61)

Score: 5.00 / 5
### Causes of World War I × relevant_detour

Moves: goal_frame (move_dc5b75d614462ca1) → predict_then_reveal (move_2c705a3f9abf05d5) → story (move_788dfa5b1b891a21) → composer_detour (move_fbcc4c9b5e6eea4a) → return_to_goal (move_8e752859a8a2ca0b) → recall_check (move_0302286867c49ae6) → artifact_commit (move_a7fb24fccd0d89fc) → synthesis (move_907241606d29a2ab)

Score: 5.00 / 5
### Causes of World War I × unsure_but_correct

Moves: goal_frame (move_ce75888a97ca3d7e) → predict_then_reveal (move_e7fa91c69a6a7160) → story (move_73ec385eedf8cd2a) → recall_check (move_50743d3c0c7bfb5a) → artifact_commit (move_b863fcad3b13d74b) → synthesis (move_f2a8505fc9114ac2)

Score: 5.00 / 5
### Causes of World War I × repeated_struggle

Moves: goal_frame (move_76f052049a583183) → predict_then_reveal (move_d9692a18e9e4d935) → story (move_03e8e505eadf2e93) → hint (move_915b646a985773ae) → missing_step (move_1c3fa2dfba935bfa) → worked_solution (move_45c555b21eaac184) → reworded_success (move_416acb7ffa918e5b) → artifact_commit (move_493ea67b66a2bfb0) → synthesis (move_d6596e49f186a3de)

Score: 4.97 / 5
### SQL joins × fast_confident

Moves: prerequisite_check (move_5640d454bd15e75a) → goal_frame (move_545aaabdf949f9f0) → predict_then_reveal (move_ba6b55608a2e9157) → misconception_demolition (move_f5775aaccd8f454a) → worked_example (move_ddb5f98cf19e1d73) → recall_check (move_7b2d3921962dbd91) → artifact_commit (move_10b8617af40cd6bd) → synthesis (move_2c3e2eaf74ca5eea)

Score: 5.00 / 5
### SQL joins × slow_careful

Moves: prerequisite_check (move_0225b971ae47db4b) → goal_frame (move_1846858ae73b8ecc) → predict_then_reveal (move_2e4b8b5baf32f2a0) → misconception_demolition (move_2948d2b7584f8e0a) → worked_example (move_c407a296f1f4975b) → recall_check (move_04302e8ffbe38f55) → artifact_commit (move_337fc5509f2a126d) → synthesis (move_6393447d77152adf)

Score: 5.00 / 5
### SQL joins × confidently_wrong

Moves: prerequisite_check (move_32485dfa97a8de8c) → goal_frame (move_23fe49a7f97a0b13) → predict_then_reveal (move_2b0abe0b7db008dd) → misconception_demolition (move_b750a2dffdab3f44) → worked_example (move_04f7debd77044a76) → recall_check (move_6eb8ec177668f525) → artifact_commit (move_f3b71e73fb568fd2) → synthesis (move_6251c0e30de6c466)

Score: 5.00 / 5
### SQL joins × disengaged_skipping

Moves: prerequisite_check (move_c531675d5eb06e5a) → goal_frame (move_db62ddbd97adf497) → predict_then_reveal (move_66d4aba087bd0195) → misconception_demolition (move_90df71e12a207fe6) → worked_example (move_6b51b54836b65979) → recall_check (move_a03c32811b3bf7f8) → artifact_commit (move_31af2862a8b4017d) → synthesis (move_090c5457a411eaac)

Score: 5.00 / 5
### SQL joins × weak_prerequisites

Moves: prerequisite_check (move_1f51e117c298bdd5) → goal_frame (move_8693048ac09c4059) → predict_then_reveal (move_548cd090561cbf1e) → misconception_demolition (move_3a2dd4a88d58b14d) → worked_example (move_80f06d76464348e4) → recall_check (move_a8e1ead75321fc13) → artifact_commit (move_e5a16bb3b811b6e8) → synthesis (move_6ed4f04e29af0c13)

Score: 5.00 / 5
### SQL joins × relevant_detour

Moves: prerequisite_check (move_2cdf532a86add1d1) → goal_frame (move_9622829ae20098e9) → predict_then_reveal (move_400095e3ae25b657) → misconception_demolition (move_704d0ef2ab5a9591) → worked_example (move_b34ad04d656736a4) → composer_detour (move_6f7d708810eddfcd) → return_to_goal (move_73216d6019ed2e97) → recall_check (move_10699d80cf1053a4) → artifact_commit (move_d88ccee29dd0d9ab) → synthesis (move_a269e664d2d822e0)

Score: 5.00 / 5
### SQL joins × unsure_but_correct

Moves: prerequisite_check (move_ef6c23dafb56e63e) → goal_frame (move_19425eabfc936041) → predict_then_reveal (move_f682bccf60543746) → misconception_demolition (move_5cfc23e7aa2e9dd7) → worked_example (move_ec1c7367541615c5) → recall_check (move_e30d2d7835885920) → artifact_commit (move_f73789a594741cc6) → synthesis (move_955b894b1a48bfd6)

Score: 5.00 / 5
### SQL joins × repeated_struggle

Moves: prerequisite_check (move_ad4b97d72a5f9ac0) → goal_frame (move_2d59b8532f79fd63) → predict_then_reveal (move_5a1185a864a31e6b) → misconception_demolition (move_1de27c5d0285d960) → worked_example (move_23dbff7f05d16483) → hint (move_a1dd5fed7e294820) → missing_step (move_d9f51bf85a2bf517) → worked_solution (move_0383a621bfa5d360) → reworded_success (move_5e255b048cbc8b86) → artifact_commit (move_feac428bd50d3fba) → synthesis (move_ade92a524152eebd)

Score: 4.98 / 5
### Newton's second law × fast_confident

Moves: prerequisite_check (move_f832c3529e16183c) → goal_frame (move_5428bbdcac24a45a) → predict_then_reveal (move_6112ad6d0b6a35dc) → misconception_demolition (move_86acac76ea3cd0b3) → worked_example (move_0f0d1f793d04fa5d) → recall_check (move_d2a20fa448811320) → artifact_commit (move_7138676dfa0827b0) → synthesis (move_1ddc7246a3a15d5c)

Score: 5.00 / 5
### Newton's second law × slow_careful

Moves: prerequisite_check (move_2a17099c922e3ff1) → goal_frame (move_0baaf2fb31c9c4c6) → predict_then_reveal (move_3b79f7a7cd898449) → misconception_demolition (move_508d3870fd6e0b65) → worked_example (move_c7150bf406404b92) → recall_check (move_a746f495b20c3dfa) → artifact_commit (move_455daed863177cfb) → synthesis (move_8bb6c0af96da4da9)

Score: 5.00 / 5
### Newton's second law × confidently_wrong

Moves: prerequisite_check (move_05f4ba7243775e0a) → goal_frame (move_a32f4c7bd44d10fb) → predict_then_reveal (move_0ca1fe0516339aee) → misconception_demolition (move_4e5f4f986916d6b2) → worked_example (move_3d6a5ae4a3e8357b) → recall_check (move_f75d10fef872ed32) → artifact_commit (move_1079da8a3c7cb81e) → synthesis (move_218c9d70b3936ca9)

Score: 5.00 / 5
### Newton's second law × disengaged_skipping

Moves: prerequisite_check (move_fc26958a0a851dbc) → goal_frame (move_c31fdd01ce591a6b) → predict_then_reveal (move_a739c953cb1ae9c4) → misconception_demolition (move_198e6e0d2e445614) → worked_example (move_556070c1e30a54c1) → recall_check (move_63c26a9251efc597) → artifact_commit (move_af083bf5f593bcd0) → synthesis (move_8cbb2b2cc6fdcb81)

Score: 5.00 / 5
### Newton's second law × weak_prerequisites

Moves: prerequisite_check (move_168b8fdca3f33fc5) → goal_frame (move_c89bb685cfb32ada) → predict_then_reveal (move_e9f7851b482ab442) → misconception_demolition (move_2c23b780b0fa0997) → worked_example (move_4ff5b6bd0b15e653) → recall_check (move_d8f5fcc01ef094c4) → artifact_commit (move_77f1a640fcbbd1df) → synthesis (move_ee4a613b947ee881)

Score: 5.00 / 5
### Newton's second law × relevant_detour

Moves: prerequisite_check (move_3d53b378ba161d6c) → goal_frame (move_a9cbb54d5292432b) → predict_then_reveal (move_ba7e723a07af9c04) → misconception_demolition (move_8cfee31536dc86c8) → worked_example (move_d3f9f8963aadf8c8) → composer_detour (move_a969e42c3c25b172) → return_to_goal (move_7eee8a17ed0932bf) → recall_check (move_32b2ab85e1b48a72) → artifact_commit (move_6631d92d3d462176) → synthesis (move_7ad896dcc5dd500a)

Score: 5.00 / 5
### Newton's second law × unsure_but_correct

Moves: prerequisite_check (move_3106efd983ecbca4) → goal_frame (move_29d43c2242333463) → predict_then_reveal (move_7cf23c60ef3070ae) → misconception_demolition (move_394d66227a98fd42) → worked_example (move_7b2584c8a4604eed) → recall_check (move_f752e11bb2dcf3ff) → artifact_commit (move_44611d05f8d93d4b) → synthesis (move_2abfb707bbe65485)

Score: 5.00 / 5
### Newton's second law × repeated_struggle

Moves: prerequisite_check (move_415d496f16743025) → goal_frame (move_72978c0e9adec40a) → predict_then_reveal (move_1f269dcf2951a5ea) → misconception_demolition (move_76baafdb5b45c023) → worked_example (move_06925a94d15151a0) → hint (move_94d54dcef89e2cda) → missing_step (move_7717ff76287c2329) → worked_solution (move_db02422fee7bfc96) → reworded_success (move_46e933ec5f53c004) → artifact_commit (move_5a6e34e4d620b6f0) → synthesis (move_f4a95ea40c3aa826)

Score: 4.98 / 5
### Meiosis vs mitosis × fast_confident

Moves: prerequisite_check (move_2026f6fe5edf3c0b) → predict_then_reveal (move_6812910ee1bb4191) → misconception_demolition (move_67486ac3f89e6e4b) → contrast_case (move_366e2d54a7044d15) → recall_check (move_afd1978d06ce0559) → synthesis (move_d720ae5b642e86d7)

Score: 5.00 / 5
### Meiosis vs mitosis × slow_careful

Moves: prerequisite_check (move_253034d59773c6ec) → predict_then_reveal (move_c225d31a7a3ff962) → misconception_demolition (move_7eb30c9a8e910e0a) → contrast_case (move_d9ff61813c1640bc) → recall_check (move_596ffc1e1f57e008) → synthesis (move_617b1835dcccc316)

Score: 5.00 / 5
### Meiosis vs mitosis × confidently_wrong

Moves: prerequisite_check (move_a6643134006456b5) → predict_then_reveal (move_3d7f9cc19027bdc5) → misconception_demolition (move_abc051b1e80fc589) → contrast_case (move_0ed03942ac0b8c79) → recall_check (move_55956bcfa006a9c6) → synthesis (move_f03d0f5e566633cd)

Score: 5.00 / 5
### Meiosis vs mitosis × disengaged_skipping

Moves: prerequisite_check (move_29e6fbd5d4877638) → predict_then_reveal (move_80e87042d66c06a3) → misconception_demolition (move_2fdb59b3cef91ddb) → contrast_case (move_0555fda9c57f15ad) → recall_check (move_625b37ca151d79ce) → synthesis (move_b84c1fffa456add5)

Score: 5.00 / 5
### Meiosis vs mitosis × weak_prerequisites

Moves: prerequisite_check (move_39ac06a9f363b5dd) → predict_then_reveal (move_aabf2d923fa9c26d) → misconception_demolition (move_1d5aa4f6b658c991) → contrast_case (move_33f72269c1e7d50f) → recall_check (move_e0c73b93216ca72e) → synthesis (move_0d6ac836b3588f6f)

Score: 5.00 / 5
### Meiosis vs mitosis × relevant_detour

Moves: prerequisite_check (move_8cd6964553c7dbb9) → predict_then_reveal (move_c12f92b380903166) → misconception_demolition (move_6556c679e0253171) → contrast_case (move_12ceda08ba25fc9b) → composer_detour (move_052eba2e6f9ad569) → return_to_goal (move_f76247ef4866277b)

Score: 4.88 / 5
### Meiosis vs mitosis × unsure_but_correct

Moves: prerequisite_check (move_a7feb79304bc7f44) → predict_then_reveal (move_66d61362b3b2202b) → misconception_demolition (move_30fa8e66d6165b38) → contrast_case (move_3c3759fd938f59b0) → recall_check (move_94dd9a21319f02dc) → synthesis (move_2f54ef5d3af130b8)

Score: 5.00 / 5
### Meiosis vs mitosis × repeated_struggle

Moves: prerequisite_check (move_7612b94d35ede4e3) → predict_then_reveal (move_bb712489300b3e04) → misconception_demolition (move_4795ae37a18b231a) → contrast_case (move_c2f900b397133db2) → hint (move_90873a4517feeab2) → missing_step (move_16ca95ad1335c467)

Score: 4.61 / 5
### Types of irony × fast_confident

Moves: goal_frame (move_4a9df086ae275cc4) → predict_then_reveal (move_ffd2e2c3ea0a34a0) → layered_explanation (move_6ae94e00cdfe50e8) → recall_check (move_73ad242d96262b01) → artifact_commit (move_9ef6fdc74cb33cc4) → synthesis (move_e844522944dd5209)

Score: 5.00 / 5
### Types of irony × slow_careful

Moves: goal_frame (move_ac9aeb3e75a048a1) → predict_then_reveal (move_d40c472949e8fcfc) → layered_explanation (move_a7a47e0affef5286) → recall_check (move_4fe9cfb51c0c2753) → artifact_commit (move_9c6d82f4a5782ee5) → synthesis (move_66d4545de40b1ce9)

Score: 5.00 / 5
### Types of irony × confidently_wrong

Moves: goal_frame (move_b7e696920a6c60ff) → predict_then_reveal (move_324b09abc8fe69d8) → layered_explanation (move_b1b8bac50b444ecd) → recall_check (move_5650c12bce6c4aa6) → artifact_commit (move_7d424d4f205f7743) → synthesis (move_8cdeef47e1664d15)

Score: 5.00 / 5
### Types of irony × disengaged_skipping

Moves: goal_frame (move_3251b85bd62f9c00) → predict_then_reveal (move_4922ca3665f0c7ad) → layered_explanation (move_4bd0ecf04060e79e) → recall_check (move_e14be76af767ba33) → artifact_commit (move_3b7005d626b60f25) → synthesis (move_bbd54c413888c950)

Score: 5.00 / 5
### Types of irony × weak_prerequisites

Moves: prerequisite_check (move_2fa5f9ca7aaa309d) → goal_frame (move_3e2baa75daf150aa) → predict_then_reveal (move_e2bf2b452ae66fcb) → layered_explanation (move_c9f42cd2a5eb2f5a) → recall_check (move_1958051a6b9a1f1c) → artifact_commit (move_dfe8d6d566d19d3c) → synthesis (move_e47ce2c9b76c7c26)

Score: 5.00 / 5
### Types of irony × relevant_detour

Moves: goal_frame (move_0225ead15e19aada) → predict_then_reveal (move_3d913b0296bf5151) → layered_explanation (move_aa88e6a237d9cd5c) → composer_detour (move_636a4e615b6ed59a) → return_to_goal (move_f307382fb75799ae) → recall_check (move_f5e0f75785e3288a) → artifact_commit (move_706a083a19950336) → synthesis (move_09784a5f2f696d59)

Score: 5.00 / 5
### Types of irony × unsure_but_correct

Moves: goal_frame (move_f74b370d0a083b11) → predict_then_reveal (move_4964b641c50c5e96) → layered_explanation (move_b84d8cc42c502edf) → recall_check (move_86a81528d291a6ab) → artifact_commit (move_3e5b69e9e1aead45) → synthesis (move_ef51c4d86c9d12be)

Score: 5.00 / 5
### Types of irony × repeated_struggle

Moves: goal_frame (move_0d44d85fdc7b79a7) → predict_then_reveal (move_51bb40128d4e6920) → layered_explanation (move_046055393bd0b433) → hint (move_66e492fd6685ef72) → missing_step (move_e19fb9f5246fc678) → worked_solution (move_8f41e8f1f8ca5717) → reworded_success (move_c78d1b595845f3f0) → artifact_commit (move_d40f64701a97f82d) → synthesis (move_a2a123839ddd00a2)

Score: 4.96 / 5
### Power rule derivatives × fast_confident

Moves: prerequisite_check (move_566b980878376e42) → goal_frame (move_7319c19bfa6ddeef) → predict_then_reveal (move_a78c6daa2f102ae2) → worked_example (move_88fbef76197ca784) → recall_check (move_804633e36508610e) → artifact_commit (move_4d23f35307171d5f) → synthesis (move_e0b09802f4f1fa52)

Score: 4.80 / 5
### Power rule derivatives × slow_careful

Moves: prerequisite_check (move_7e85d5936bfae8d7) → goal_frame (move_bb6df5c5f23896af) → predict_then_reveal (move_c0099a86ea927d35) → worked_example (move_48c6573db6d330f5) → recall_check (move_9244c792ec0fba36) → artifact_commit (move_f7875db1fa9a6e29) → synthesis (move_89a389ceb2703803)

Score: 4.80 / 5
### Power rule derivatives × confidently_wrong

Moves: prerequisite_check (move_da2b659e61e292bd) → goal_frame (move_098a3bb56d4baa6a) → predict_then_reveal (move_15acf2c19f2bfafa) → worked_example (move_7b4aed4779e4b908) → recall_check (move_648c967166a0ab32) → artifact_commit (move_07c0725dc5817024) → synthesis (move_acf3499f66dbaba8)

Score: 4.80 / 5
### Power rule derivatives × disengaged_skipping

Moves: prerequisite_check (move_a6cfb54d0a7765ad) → goal_frame (move_2bd3b2ba073d4b6d) → predict_then_reveal (move_a3fe5a857cad7bab) → worked_example (move_7ae8d88efe4ad8c3) → recall_check (move_2ac663c7d0248dd7) → artifact_commit (move_20a6adf3f5b8393f) → synthesis (move_3771432775d74c6f)

Score: 4.80 / 5
### Power rule derivatives × weak_prerequisites

Moves: prerequisite_check (move_a6124f55341aa1b1) → goal_frame (move_3b3272268495737e) → predict_then_reveal (move_9ddf981b198291c1) → worked_example (move_7274e94c685e73c4) → recall_check (move_2a97358d6f853248) → artifact_commit (move_c39e31ecb7cd31c9) → synthesis (move_03d78e14e73b3c73)

Score: 4.80 / 5
### Power rule derivatives × relevant_detour

Moves: prerequisite_check (move_af5fa1c66752f932) → goal_frame (move_00cfc24adb017c7c) → predict_then_reveal (move_4e1e9be4c38d63e3) → worked_example (move_c1fe8f37728e5f89) → composer_detour (move_66d48ad6345b4e83) → return_to_goal (move_92c3d1324410eae3) → recall_check (move_c532d153610ca01c) → artifact_commit (move_62960070cf5cde93) → synthesis (move_daf9acea5bb484a1)

Score: 4.80 / 5
### Power rule derivatives × unsure_but_correct

Moves: prerequisite_check (move_a43714d07a3559b6) → goal_frame (move_b816344d8a7b35d5) → predict_then_reveal (move_7a25bd07e73f79f3) → worked_example (move_47e6dae108df18b7) → recall_check (move_1cee08ca445c9d1b) → artifact_commit (move_b70c65976caa16b8) → synthesis (move_401ea625e864c98e)

Score: 4.80 / 5
### Power rule derivatives × repeated_struggle

Moves: prerequisite_check (move_b2795cb7b35654c0) → goal_frame (move_fa4c5cd9ce1ad4c9) → predict_then_reveal (move_6dc877f36bbfc825) → worked_example (move_dc3e8e06f7a2fdfd) → hint (move_519b3a1c490168eb) → missing_step (move_f21317102e3e9c0c) → worked_solution (move_8341d82a7d59906f) → reworded_success (move_6fe968cf3ada73ab) → artifact_commit (move_efaf4a7da6c39a76) → synthesis (move_1f852649cd008f16)

Score: 4.77 / 5
### Plate tectonics × fast_confident

Moves: goal_frame (move_6f2e8994bd8b8e40) → predict_then_reveal (move_3d3f0942a940415f) → diagram (move_f82aa7d274201a2f) → recall_check (move_c435bddcdf5df61e) → artifact_commit (move_eb8b4085489cc555) → synthesis (move_6c2600ec2d938532)

Score: 5.00 / 5
### Plate tectonics × slow_careful

Moves: goal_frame (move_c3defb2b0e85160b) → predict_then_reveal (move_0988934077f3379e) → diagram (move_612537fc0f103bc1) → recall_check (move_c6d4e7b2a3190719) → artifact_commit (move_3ce2699859f838f5) → synthesis (move_5498a8da7de84485)

Score: 5.00 / 5
### Plate tectonics × confidently_wrong

Moves: goal_frame (move_986287dd3f337b73) → predict_then_reveal (move_d8c9a393acd66d5c) → diagram (move_640b2385857150ca) → recall_check (move_b2bade125a8a2912) → artifact_commit (move_10395aa05556c322) → synthesis (move_7743c252ca94688f)

Score: 5.00 / 5
### Plate tectonics × disengaged_skipping

Moves: goal_frame (move_6298da725574362e) → predict_then_reveal (move_ecf82f0e3bd5e5f1) → diagram (move_ae1445c7e747cca0) → recall_check (move_f3ccae95ee4d642e) → artifact_commit (move_4f3a5d61339165c7) → synthesis (move_f3ab65276db7ccc0)

Score: 5.00 / 5
### Plate tectonics × weak_prerequisites

Moves: prerequisite_check (move_367d2f1127b3889d) → goal_frame (move_1f1b14d64f86c842) → predict_then_reveal (move_fe7bf42f58c3bc51) → diagram (move_8ba6bedb0f54576e) → recall_check (move_1296f02820964eb3) → artifact_commit (move_0b369321f5d3ef99) → synthesis (move_aa7186019a591406)

Score: 5.00 / 5
### Plate tectonics × relevant_detour

Moves: goal_frame (move_58726894b06007cb) → predict_then_reveal (move_28a1a7ace463f0e5) → diagram (move_6e2ed91f32538562) → composer_detour (move_54d69c9e3ef626f2) → return_to_goal (move_3a1bf33c1c684ddb) → recall_check (move_b2b6ea1faa382b95) → artifact_commit (move_23bdb64e9952b5f5) → synthesis (move_beb67a894effd645)

Score: 5.00 / 5
### Plate tectonics × unsure_but_correct

Moves: goal_frame (move_5b6a75e774fddea4) → predict_then_reveal (move_0d605b224df6f25c) → diagram (move_bfbdea885cde35d4) → recall_check (move_466ea8c84136c45a) → artifact_commit (move_349c7a59cb6f7e75) → synthesis (move_c02f18c9f502754e)

Score: 5.00 / 5
### Plate tectonics × repeated_struggle

Moves: goal_frame (move_8b14a063cf892cde) → predict_then_reveal (move_c31c43462a0a7bcb) → diagram (move_137a10308aed577a) → hint (move_eb5d055d5104d5cd) → missing_step (move_f6a355d8b364cf0d) → worked_solution (move_76ff4fdc8eddd8ec) → reworded_success (move_db2a5d988534afb8) → artifact_commit (move_a5bcf2fcd56fe0e7) → synthesis (move_f1da4ef170db3f94)

Score: 4.97 / 5
### Independent events × fast_confident

Moves: predict_then_reveal (move_d85b67883a26bf93) → misconception_demolition (move_97422be826358d45) → worked_example (move_9dbaaf67a2fd1d30) → recall_check (move_86c83bb0fcd679ab) → synthesis (move_4f91795eb92a3b02)

Score: 5.00 / 5
### Independent events × slow_careful

Moves: predict_then_reveal (move_f297dc56fb5c4288) → misconception_demolition (move_00ad702c93eabfc5) → worked_example (move_5e684933322ed2b9) → recall_check (move_4e7ce0058c232e57) → synthesis (move_b62ab5f4b5841c7b)

Score: 5.00 / 5
### Independent events × confidently_wrong

Moves: predict_then_reveal (move_63b812d9000c7df6) → misconception_demolition (move_4db379dcd5372d2b) → worked_example (move_7b2c57832684b51c) → recall_check (move_aabea2dcacb5510d) → synthesis (move_ced0fd7556ade09a)

Score: 5.00 / 5
### Independent events × disengaged_skipping

Moves: predict_then_reveal (move_5aef5c1d06406434) → misconception_demolition (move_d95fdc5ed006a0c1) → worked_example (move_8886bbf62e954543) → recall_check (move_3090360230bd9dbf) → synthesis (move_1715ec45912b7965)

Score: 5.00 / 5
### Independent events × weak_prerequisites

Moves: prerequisite_check (move_1788e90bd2436f90) → predict_then_reveal (move_a996fbedfaf4d59f) → misconception_demolition (move_6e8754ea03c85a7c) → worked_example (move_37c7714b4db698ae) → recall_check (move_6bfe1506e4a204eb) → synthesis (move_26b846b05269b8ce)

Score: 5.00 / 5
### Independent events × relevant_detour

Moves: predict_then_reveal (move_49b8afe8e3713b66) → misconception_demolition (move_4e825e250341af4a) → worked_example (move_1aba188f24e103b4) → composer_detour (move_1f7700b5880c04ef) → return_to_goal (move_e17f048c236e2e60) → recall_check (move_1a84451a334bcaed)

Score: 4.91 / 5
### Independent events × unsure_but_correct

Moves: predict_then_reveal (move_cce295cf529db22e) → misconception_demolition (move_ac9e44ab91ab72b3) → worked_example (move_5eeab6912ac192c1) → recall_check (move_72960dcbc4653b3d) → synthesis (move_bdc61c4f7012195f)

Score: 5.00 / 5
### Independent events × repeated_struggle

Moves: predict_then_reveal (move_7b07d9418d299bd0) → misconception_demolition (move_aed60b6dbea4f7b5) → worked_example (move_ec080b8c77175a15) → hint (move_d5dc06ab3383d5be) → missing_step (move_468ecfe473e42259) → worked_solution (move_5a94ec2118f3f237)

Score: 4.61 / 5
### Cell membrane transport × fast_confident

Moves: goal_frame (move_86256e3b6a2c6d90) → predict_then_reveal (move_ea438ee57af6e802) → diagram (move_759e6d6577be7702) → recall_check (move_c975ff041ff71e8d) → artifact_commit (move_1ea9479e90dcf7c8) → synthesis (move_fb2b53b07f9fde03)

Score: 5.00 / 5
### Cell membrane transport × slow_careful

Moves: goal_frame (move_06a1c5cb8c3c5ff0) → predict_then_reveal (move_81fb46b4f5798eaa) → diagram (move_a0955622a9773aa1) → recall_check (move_7496761bde0f384f) → artifact_commit (move_92d1b266ad7cfb3e) → synthesis (move_b0dbd02b9ea183df)

Score: 5.00 / 5
### Cell membrane transport × confidently_wrong

Moves: goal_frame (move_4488e9c5684f7af2) → predict_then_reveal (move_bafea4f50ceb4d63) → diagram (move_cf13fe17d4c654c1) → recall_check (move_cd7f8217d0777b54) → artifact_commit (move_afa6b38a19e9dc11) → synthesis (move_aa0c2e4b077ab542)

Score: 5.00 / 5
### Cell membrane transport × disengaged_skipping

Moves: goal_frame (move_90a0130722d39a19) → predict_then_reveal (move_a826f8b62903679d) → diagram (move_21c636ab9b0d710c) → recall_check (move_256ca91d1ea1b3a4) → artifact_commit (move_92da809317bc60a9) → synthesis (move_0d1bf6af10695ce8)

Score: 5.00 / 5
### Cell membrane transport × weak_prerequisites

Moves: prerequisite_check (move_a1aeb682c1f64cfb) → goal_frame (move_fb9404d61e84731e) → predict_then_reveal (move_c10746eb35222091) → diagram (move_b0d7523d8641bfee) → recall_check (move_f2ff54104b02a270) → artifact_commit (move_f12d1a663c4dfd45) → synthesis (move_5ed7eee6006c5287)

Score: 5.00 / 5
### Cell membrane transport × relevant_detour

Moves: goal_frame (move_e2652a870cfb66b4) → predict_then_reveal (move_600f1af3c80582d8) → diagram (move_07c5b81df7d1e7bc) → composer_detour (move_1f8814cd27b26bc4) → return_to_goal (move_430a2e9aebc98659) → recall_check (move_563f3b44e2041364) → artifact_commit (move_27f0a6365b037674) → synthesis (move_bc01cd3b8a800741)

Score: 5.00 / 5
### Cell membrane transport × unsure_but_correct

Moves: goal_frame (move_9898582215db4d91) → predict_then_reveal (move_b46469a6f8f52d39) → diagram (move_469e1944e5331dd6) → recall_check (move_30fbac830da2ad2a) → artifact_commit (move_638138214d465651) → synthesis (move_d635a38a0b8c86ea)

Score: 5.00 / 5
### Cell membrane transport × repeated_struggle

Moves: goal_frame (move_1f04872712389096) → predict_then_reveal (move_e3b3186fbde04779) → diagram (move_f0dcd837638ef294) → hint (move_784b408f04e58bbb) → missing_step (move_ba8f0689c77e24c8) → worked_solution (move_b1a6d464c5824a54) → reworded_success (move_b95c23d592939d1e) → artifact_commit (move_340a1a17de71198b) → synthesis (move_3e49b4f1d9cf559f)

Score: 4.97 / 5
### Git branching × fast_confident

Moves: goal_frame (move_f3e30645f4b941cd) → predict_then_reveal (move_5644ad701481067b) → story (move_3d5306cdc76b5ad2) → recall_check (move_3bad58f7d28e7a14) → artifact_commit (move_413e8320493e4ac6) → synthesis (move_40e39e5be57cae8c)

Score: 4.97 / 5
### Git branching × slow_careful

Moves: goal_frame (move_42e9905ebc1cf476) → predict_then_reveal (move_90dd4579eade2b92) → story (move_45bd2d209f54d024) → recall_check (move_72710c885a89ce64) → artifact_commit (move_35820009437fd7cb) → synthesis (move_b4c1c8826384544f)

Score: 4.97 / 5
### Git branching × confidently_wrong

Moves: goal_frame (move_ed8b4a5319713707) → predict_then_reveal (move_7dce7ffd1585d56b) → story (move_c76a38e684246a6b) → recall_check (move_af2a88ecf3d8adc9) → artifact_commit (move_a4367c0297f067c9) → synthesis (move_8d984307681f198c)

Score: 4.97 / 5
### Git branching × disengaged_skipping

Moves: goal_frame (move_3ec82bf0440e5d75) → predict_then_reveal (move_558ff90d21115c1d) → story (move_1906cc76d916756e) → recall_check (move_3cafe33d37cc1f84) → artifact_commit (move_c8320155dcd4cb56) → synthesis (move_8706f4e0f89ffbec)

Score: 4.97 / 5
### Git branching × weak_prerequisites

Moves: prerequisite_check (move_6f84a4e26033f866) → goal_frame (move_39edb39cf9d27da8) → predict_then_reveal (move_3b0a4a81f5a81478) → story (move_ac2d9dae88498745) → recall_check (move_3ecbd48685d23404) → artifact_commit (move_c0128c7834b9c4ae) → synthesis (move_38c124e67fb884ad)

Score: 4.97 / 5
### Git branching × relevant_detour

Moves: goal_frame (move_15bcbdcbe0a4681c) → predict_then_reveal (move_3c05546361ce5727) → story (move_c73d695533b27a0f) → composer_detour (move_74012cc8287e553a) → return_to_goal (move_b84eba9ae347f296) → recall_check (move_58f3f3891c08b688) → artifact_commit (move_e41c378840239a47) → synthesis (move_f5855cbc28f7b292)

Score: 4.97 / 5
### Git branching × unsure_but_correct

Moves: goal_frame (move_f9e7a8542a30c5c3) → predict_then_reveal (move_69eb5a1afb4ed628) → story (move_babe59aa21c0cabd) → recall_check (move_278bf354a059cb9d) → artifact_commit (move_4abaf92d77486a79) → synthesis (move_bbcb83f45a71986a)

Score: 4.97 / 5
### Git branching × repeated_struggle

Moves: goal_frame (move_f3c55f716c4db185) → predict_then_reveal (move_8289050f423fb662) → story (move_829b2409f1b7ad88) → hint (move_cf6f4bcb86bbf975) → missing_step (move_ce3a0ab2361a061a) → worked_solution (move_ef3962b0d5e24122) → reworded_success (move_c109a4795151a5f9) → artifact_commit (move_ee6dc5be8ccc8f1e) → synthesis (move_eb79b992b44b2ec6)

Score: 4.95 / 5
### Acids and bases × fast_confident

Moves: goal_frame (move_2d6d663498774c15) → predict_then_reveal (move_7dac667b5cff64fd) → misconception_demolition (move_38a3e881d0e15ebf) → contrast_case (move_d1166e6088dbad56) → recall_check (move_a28ad701ce6e7fd5) → artifact_commit (move_1cb169c16ec88e02) → synthesis (move_de238ef4a96ec8bd)

Score: 5.00 / 5
### Acids and bases × slow_careful

Moves: goal_frame (move_e469ed2a0d4e0b47) → predict_then_reveal (move_4d9d34a71f8a57ec) → misconception_demolition (move_1c179cc776ac0a52) → contrast_case (move_c41dda3cd435b2e1) → recall_check (move_f5d5096d9733010a) → artifact_commit (move_90b8ce981a78f290) → synthesis (move_82cafd1bc9c5198a)

Score: 5.00 / 5
### Acids and bases × confidently_wrong

Moves: goal_frame (move_31f53b5a25e5bf13) → predict_then_reveal (move_54fd6f0a3f9034b7) → misconception_demolition (move_949e080a47a0bcbe) → contrast_case (move_c1319785d712c1fb) → recall_check (move_99efb520abdac66b) → artifact_commit (move_6f3256233a712da8) → synthesis (move_a81a105432518b01)

Score: 5.00 / 5
### Acids and bases × disengaged_skipping

Moves: goal_frame (move_88ab81fd39fa3e3c) → predict_then_reveal (move_85527ba68dbb5519) → misconception_demolition (move_05915c389143eb2f) → contrast_case (move_70b5e0eeb35b005c) → recall_check (move_7fb403a3892832d5) → artifact_commit (move_1d364864f994b93e) → synthesis (move_94dd9fe1fbc05ffd)

Score: 5.00 / 5
### Acids and bases × weak_prerequisites

Moves: prerequisite_check (move_535aabdfe7ec306e) → goal_frame (move_6918a86fdba2ec69) → predict_then_reveal (move_eb56d7d6b831d8c9) → misconception_demolition (move_bedeaf6a44be7889) → contrast_case (move_fe8bc2e542d2be6d) → recall_check (move_1943d085172a5f48) → artifact_commit (move_a0d38e706404b0a4) → synthesis (move_579a3298c859b507)

Score: 5.00 / 5
### Acids and bases × relevant_detour

Moves: goal_frame (move_0c306b1d1bc32346) → predict_then_reveal (move_b51a96e2af53c65b) → misconception_demolition (move_5df75b8792d70518) → contrast_case (move_2b5108c4ffa348ec) → composer_detour (move_f0710e80f2ac8a55) → return_to_goal (move_b9042c633a3ed818) → recall_check (move_ac232d7eaa0e2b9a) → artifact_commit (move_1319c26480d21d4d) → synthesis (move_de75891991972022)

Score: 5.00 / 5
### Acids and bases × unsure_but_correct

Moves: goal_frame (move_064891eac2f0fcf6) → predict_then_reveal (move_5b5d8cfcb7381e7b) → misconception_demolition (move_2944b5c4de907153) → contrast_case (move_e4f9d22c9dfb827a) → recall_check (move_d13d86e7ca98d94a) → artifact_commit (move_10ddd21581b38e13) → synthesis (move_e2257d5dc3f21226)

Score: 5.00 / 5
### Acids and bases × repeated_struggle

Moves: goal_frame (move_b53c82b77660b4d6) → predict_then_reveal (move_9ba0469890970d6e) → misconception_demolition (move_54499271fc29452f) → contrast_case (move_8842459178553b2f) → hint (move_7fdb9954ab23c28f) → missing_step (move_b38b36e88fda2a54) → worked_solution (move_00671709721c68c2) → reworded_success (move_232c74506e9430ec) → artifact_commit (move_31a368bdebb3dee4) → synthesis (move_47129f252ebc09a0)

Score: 4.97 / 5
### Ethos pathos logos × fast_confident

Moves: predict_then_reveal (move_4958be464a75093e) → layered_explanation (move_10150ba45b62de56) → recall_check (move_56629d7eeb856579) → synthesis (move_fc4cf183ac235a23)

Score: 5.00 / 5
### Ethos pathos logos × slow_careful

Moves: predict_then_reveal (move_10d82e79295b040b) → layered_explanation (move_6150dc86cd004a94) → recall_check (move_f5f9e7ad4f1026c9) → synthesis (move_2fe353279a641431)

Score: 5.00 / 5
### Ethos pathos logos × confidently_wrong

Moves: predict_then_reveal (move_08d0fd55dc870dd5) → layered_explanation (move_bdd3840e73e8bef3) → recall_check (move_13b6d944bf6ea77a) → synthesis (move_aa1e3a7417ea763d)

Score: 5.00 / 5
### Ethos pathos logos × disengaged_skipping

Moves: predict_then_reveal (move_0f26329738503b58) → layered_explanation (move_e37785b78c9c57d9) → recall_check (move_0d426e5b74f1b851) → synthesis (move_0767b68cdd9d2cd6)

Score: 5.00 / 5
### Ethos pathos logos × weak_prerequisites

Moves: prerequisite_check (move_eb543a97491a9f9a) → predict_then_reveal (move_6b1fc41538f323bc) → layered_explanation (move_25ce64a64ce02620) → recall_check (move_ba97d264faa5e541) → synthesis (move_eb9f15c2906a0ba2)

Score: 5.00 / 5
### Ethos pathos logos × relevant_detour

Moves: predict_then_reveal (move_55205df1a3ae0d4a) → layered_explanation (move_d0e8b79fa077df28) → composer_detour (move_b451d257986b4a44) → return_to_goal (move_8bfae350abd1ea21) → recall_check (move_cf87a5989360f082) → synthesis (move_0959aaf3a9b0113a)

Score: 5.00 / 5
### Ethos pathos logos × unsure_but_correct

Moves: predict_then_reveal (move_11f558ddf39316cd) → layered_explanation (move_fe182d14754ee6b4) → recall_check (move_62bf9f369d079327) → synthesis (move_39a1aa1778230d73)

Score: 5.00 / 5
### Ethos pathos logos × repeated_struggle

Moves: predict_then_reveal (move_427bce41d4caa6cc) → layered_explanation (move_36684a4ba645d0f3) → hint (move_94d6b7ef7424120f) → missing_step (move_dd77418cdb66a3a7) → worked_solution (move_0672d7efe202a26e) → reworded_success (move_b7b220b68ba4f902)

Score: 4.84 / 5
### Recursion base cases × fast_confident

Moves: prerequisite_check (move_5c8574d37132dfcf) → goal_frame (move_06397cb8d836107f) → predict_then_reveal (move_0d120039453482b0) → misconception_demolition (move_4bb714981cd267a9) → worked_example (move_4da158390e2059c0) → recall_check (move_916843740e9ff9c0) → artifact_commit (move_517b1b168e21e293) → synthesis (move_9cfe002d2ab96764)

Score: 5.00 / 5
### Recursion base cases × slow_careful

Moves: prerequisite_check (move_7fdb7003fb96c4df) → goal_frame (move_ef7f735a276acd23) → predict_then_reveal (move_26db309a84049160) → misconception_demolition (move_93093f73025a131f) → worked_example (move_5c09c6cdf3b2e2d9) → recall_check (move_c9a75801e17491f7) → artifact_commit (move_e6269a14c2bce1b3) → synthesis (move_d8617dd18c5c3a18)

Score: 5.00 / 5
### Recursion base cases × confidently_wrong

Moves: prerequisite_check (move_39e90a107295298f) → goal_frame (move_018c80173a39610a) → predict_then_reveal (move_169ce4785903c8cc) → misconception_demolition (move_10f2523e27a17f69) → worked_example (move_ff74be5655159bac) → recall_check (move_5d507ecef1ee76a9) → artifact_commit (move_4b49eb2efec4b517) → synthesis (move_d696c4b5b373d1fb)

Score: 5.00 / 5
### Recursion base cases × disengaged_skipping

Moves: prerequisite_check (move_3efb7c0ffe742937) → goal_frame (move_396c7714646d1cb5) → predict_then_reveal (move_1dffa33355537cec) → misconception_demolition (move_b84691f58fcadaf2) → worked_example (move_0a55009e141f4bf6) → recall_check (move_ac96b7b4b0aeb889) → artifact_commit (move_68aae74b62160b3c) → synthesis (move_572347d2710be77d)

Score: 5.00 / 5
### Recursion base cases × weak_prerequisites

Moves: prerequisite_check (move_85ba581043ef5afc) → goal_frame (move_2d8ab7f7faf94523) → predict_then_reveal (move_f4f086d1a9989ae0) → misconception_demolition (move_4485d07501dd2e74) → worked_example (move_8a41c1097bfe12a4) → recall_check (move_b1e8a598cd228b9f) → artifact_commit (move_285f1e1aea762f52) → synthesis (move_03a993bc33366fff)

Score: 5.00 / 5
### Recursion base cases × relevant_detour

Moves: prerequisite_check (move_0d41211c19a4d0ea) → goal_frame (move_f04bbd8fd955ad8a) → predict_then_reveal (move_d8b13ca3255216a1) → misconception_demolition (move_43e9559bb5643649) → worked_example (move_4dc532f4d8fae88f) → composer_detour (move_2259a7faaa29c514) → return_to_goal (move_1a1fb75768e7ce71) → recall_check (move_298dfe1f9c908edb) → artifact_commit (move_128f4594a4c36367) → synthesis (move_d100d1bf853ed261)

Score: 5.00 / 5
### Recursion base cases × unsure_but_correct

Moves: prerequisite_check (move_d58f6c0b9605cb71) → goal_frame (move_c4f454bdcd48d111) → predict_then_reveal (move_8fb5440eef5f06d2) → misconception_demolition (move_d33752eba3f5f896) → worked_example (move_b4cbb64cb8922bcf) → recall_check (move_b78d9b4bd2dacce9) → artifact_commit (move_9ac6cc66d0378a19) → synthesis (move_28edcdfa0ed9c221)

Score: 5.00 / 5
### Recursion base cases × repeated_struggle

Moves: prerequisite_check (move_ada52451846f6835) → goal_frame (move_2ea8942f5060f08f) → predict_then_reveal (move_fab634c880360404) → misconception_demolition (move_44e6b33290c2817b) → worked_example (move_b88b091baf150071) → hint (move_572a475bb89036eb) → missing_step (move_d6e00dc00ec07e51) → worked_solution (move_bd58372069501c53) → reworded_success (move_cdcdf26680c51b98) → artifact_commit (move_d9db06e29c264aa1) → synthesis (move_8650e99e6e7c1511)

Score: 4.98 / 5
### Cold War origins × fast_confident

Moves: goal_frame (move_67bd98674f5694a8) → predict_then_reveal (move_ebc12188b5dfc7f3) → story (move_e599eca7bae99752) → recall_check (move_8e24d20a69fbbb93) → artifact_commit (move_e59eabfb720a32d5) → synthesis (move_8e2aaeece1e8c7c8)

Score: 5.00 / 5
### Cold War origins × slow_careful

Moves: goal_frame (move_2ed0d235124d4905) → predict_then_reveal (move_df03e61671e6788b) → story (move_62768219e5d04994) → recall_check (move_7b1f82fec47940e7) → artifact_commit (move_069d1aa6ed331fe5) → synthesis (move_f9fbfd4f1e7ed80d)

Score: 5.00 / 5
### Cold War origins × confidently_wrong

Moves: goal_frame (move_e893e8bf16f6a1f8) → predict_then_reveal (move_5f8c0624f8d6bab0) → story (move_fefb3399e8b2ab21) → recall_check (move_b393aa6f62c0114f) → artifact_commit (move_d8b5f4ecefd3066a) → synthesis (move_b7f4a92b48813759)

Score: 5.00 / 5
### Cold War origins × disengaged_skipping

Moves: goal_frame (move_329362eeb5272266) → predict_then_reveal (move_98925818d6ec4e51) → story (move_4230d257a7b5e354) → recall_check (move_c0b0b4977b7de82d) → artifact_commit (move_cbead6838386649d) → synthesis (move_a0a805f3d1551cfb)

Score: 5.00 / 5
### Cold War origins × weak_prerequisites

Moves: prerequisite_check (move_476517621dc0bfb6) → goal_frame (move_935690d0346cfca1) → predict_then_reveal (move_fc6442932bf7e82f) → story (move_2c8d4abea9465f7d) → recall_check (move_b73c36ab02871946) → artifact_commit (move_1765dd8b3c93e936) → synthesis (move_4516b222ad45ba0d)

Score: 5.00 / 5
### Cold War origins × relevant_detour

Moves: goal_frame (move_8256ce7cef2a7c88) → predict_then_reveal (move_93e4a77a8b1a9f71) → story (move_f8edcd5b4d9eae3d) → composer_detour (move_806405bf13c5bb30) → return_to_goal (move_c8696a4abcdc7337) → recall_check (move_5348c323584c8b0c) → artifact_commit (move_32a11ab506801604) → synthesis (move_2f8324a49881d04b)

Score: 5.00 / 5
### Cold War origins × unsure_but_correct

Moves: goal_frame (move_73cd0572b1034c33) → predict_then_reveal (move_23f6e252411c497f) → story (move_531412c80fc3dceb) → recall_check (move_56e631e0d391dfcc) → artifact_commit (move_cd25036afc170373) → synthesis (move_dec866a84e0de5bc)

Score: 5.00 / 5
### Cold War origins × repeated_struggle

Moves: goal_frame (move_3fa9a09af66f9c5a) → predict_then_reveal (move_7624e3234bba217e) → story (move_b96440936723abcc) → hint (move_bd4a283f2096a28f) → missing_step (move_5fc532b10de22168) → worked_solution (move_f35213870070fe7e) → reworded_success (move_4200bedf7ff6baee) → artifact_commit (move_6dbf71bdced3a86e) → synthesis (move_d669f929fc8137de)

Score: 4.97 / 5
### Enzyme kinetics basics × fast_confident

Moves: prerequisite_check (move_59e7affc9ed09489) → goal_frame (move_a876398da86b6a7a) → predict_then_reveal (move_b56fbb51c9c5b4e3) → diagram (move_30f3e7366750da94) → recall_check (move_b130b3ffa88d1313) → artifact_commit (move_e394121bd7386c0b) → synthesis (move_15a154c946f681cb)

Score: 4.98 / 5
### Enzyme kinetics basics × slow_careful

Moves: prerequisite_check (move_c86ee42a35fc40bc) → goal_frame (move_253cc31988c13fbe) → predict_then_reveal (move_79619bb2eecc7db9) → diagram (move_d1604ec6ce1d8251) → recall_check (move_54bf6e8445ceeae9) → artifact_commit (move_1d16f7e5a944ba0e) → synthesis (move_d5dcd84c3a5c862d)

Score: 4.98 / 5
### Enzyme kinetics basics × confidently_wrong

Moves: prerequisite_check (move_5fb1a9b4f6de6cb8) → goal_frame (move_7cb71461d0315b92) → predict_then_reveal (move_2f5e86f78886effc) → diagram (move_d3fcb1f858f37bf6) → recall_check (move_399a0ad4e3c7b904) → artifact_commit (move_a851e0ceac9d6a42) → synthesis (move_ad51f7a9f92f86f4)

Score: 4.98 / 5
### Enzyme kinetics basics × disengaged_skipping

Moves: prerequisite_check (move_6fa9b7fdd930d73b) → goal_frame (move_03a3ded04750bea5) → predict_then_reveal (move_dc398259ae393520) → diagram (move_844d5bdfeb4dd2e0) → recall_check (move_5dc0508d6dbd181f) → artifact_commit (move_b6baa8c6180a2b0d) → synthesis (move_0bfd7588b52c24e6)

Score: 4.98 / 5
### Enzyme kinetics basics × weak_prerequisites

Moves: prerequisite_check (move_dfc4f1745d057df3) → goal_frame (move_5fbbc5a9f1de87a9) → predict_then_reveal (move_cb4b0e86dc9197e8) → diagram (move_dcc97c3852818e12) → recall_check (move_114e1a1680a657ca) → artifact_commit (move_80b2e1868324d9b4) → synthesis (move_bdebb50adaa08e2f)

Score: 4.98 / 5
### Enzyme kinetics basics × relevant_detour

Moves: prerequisite_check (move_a716e9d6cf234875) → goal_frame (move_d1804ca783742455) → predict_then_reveal (move_6bd42b5b88b28705) → diagram (move_cb85fece9521bf04) → composer_detour (move_5c2d0e63fcb6f2c8) → return_to_goal (move_00cc35232b580cb4) → recall_check (move_1f9d81390799a92c) → artifact_commit (move_76641cdfcb408dff) → synthesis (move_6b72edde67ab22b5)

Score: 4.98 / 5
### Enzyme kinetics basics × unsure_but_correct

Moves: prerequisite_check (move_2da64cf896850653) → goal_frame (move_83f87cd17718b969) → predict_then_reveal (move_c88cd2d100b8f297) → diagram (move_de352447400934cb) → recall_check (move_8a0f35596b6cb4df) → artifact_commit (move_75db1accc1b78199) → synthesis (move_f187e4f11f8f5eb1)

Score: 4.98 / 5
### Enzyme kinetics basics × repeated_struggle

Moves: prerequisite_check (move_baa322708bbc8a66) → goal_frame (move_5d0bde3f9ffb4ae4) → predict_then_reveal (move_551299035058ad21) → diagram (move_00d917bb94d31ca5) → hint (move_af0615888681db3e) → missing_step (move_ab061e346261279d) → worked_solution (move_ab5ab06e89ba8aba) → reworded_success (move_5031ff5d822d1073) → artifact_commit (move_bf494c95b5791acb) → synthesis (move_12760b45b8ca2a83)

Score: 4.96 / 5
### Map projections × fast_confident

Moves: predict_then_reveal (move_0192ca651969f681) → diagram (move_48d068cda142c834) → recall_check (move_3a69758dabf6460e) → synthesis (move_602b972b095f04e0)

Score: 5.00 / 5
### Map projections × slow_careful

Moves: predict_then_reveal (move_7ba1ec009403dad0) → diagram (move_43ed9e47f9114dd1) → recall_check (move_7cd2b3788b0e912b) → synthesis (move_343af7b892df40b8)

Score: 5.00 / 5
### Map projections × confidently_wrong

Moves: predict_then_reveal (move_905a67f0c0cb074a) → diagram (move_9fa32071ef9e1004) → recall_check (move_f3ad05eaad41adfb) → synthesis (move_867f449eaa76c5d7)

Score: 5.00 / 5
### Map projections × disengaged_skipping

Moves: predict_then_reveal (move_16e6ad52d9c298c3) → diagram (move_ef6e9021879cf762) → recall_check (move_be0d49c548e40754) → synthesis (move_688a3b9760d38b22)

Score: 5.00 / 5
### Map projections × weak_prerequisites

Moves: prerequisite_check (move_8be801d93b7bf9ba) → predict_then_reveal (move_c22d12373f4a6cc1) → diagram (move_54b1eccd9d46651a) → recall_check (move_2bdedd7d9a815067) → synthesis (move_04ac3340a0260317)

Score: 5.00 / 5
### Map projections × relevant_detour

Moves: predict_then_reveal (move_383f4f11ca27f20c) → diagram (move_789944d33adbf6f2) → composer_detour (move_4b4b24d4ec4e41c1) → return_to_goal (move_571d7e0bd4ac86c3) → recall_check (move_3705ada0f862aefa) → synthesis (move_4b393f0cd5835bce)

Score: 5.00 / 5
### Map projections × unsure_but_correct

Moves: predict_then_reveal (move_688b12882e735a37) → diagram (move_dde621a0ab9ed110) → recall_check (move_d3c48e3a0daea2c5) → synthesis (move_e975c960b1761689)

Score: 5.00 / 5
### Map projections × repeated_struggle

Moves: predict_then_reveal (move_9079ad2785fdf1c1) → diagram (move_988d2c6b0ff808b7) → hint (move_736f9222bf55791a) → missing_step (move_3643b780b12964cf) → worked_solution (move_58f8a5a8906a7db1) → reworded_success (move_353e18f8a8b5d071)

Score: 4.87 / 5
### Citation styles × fast_confident

Moves: goal_frame (move_a728277e4bd1c6f0) → predict_then_reveal (move_54db765b969e4d32) → worked_example (move_6999ee686d259e3d) → recall_check (move_5b35dce7d1ac80d5) → artifact_commit (move_5a8bba59f19e7327) → synthesis (move_33442f4cdbc63bd8)

Score: 5.00 / 5
### Citation styles × slow_careful

Moves: goal_frame (move_8aa0c002738507ee) → predict_then_reveal (move_5da527271b128438) → worked_example (move_d819f2bba9357f67) → recall_check (move_866ebbcc18053ac4) → artifact_commit (move_629fb22b98048a62) → synthesis (move_f19814a1458a9588)

Score: 5.00 / 5
### Citation styles × confidently_wrong

Moves: goal_frame (move_8a685d3478fb9ab6) → predict_then_reveal (move_55f8ba009ca63383) → worked_example (move_f4c7301c00a6ea9a) → recall_check (move_d08c3ec0161c2748) → artifact_commit (move_d1f67768245196b6) → synthesis (move_6a201cd2d187d847)

Score: 5.00 / 5
### Citation styles × disengaged_skipping

Moves: goal_frame (move_3f1f80f56d02c81a) → predict_then_reveal (move_6b7a3c834292ed11) → worked_example (move_97e7a61c0316754d) → recall_check (move_8abed3cf8dbb7b52) → artifact_commit (move_7d8adc2274ce56dc) → synthesis (move_458eb6ba1e27cf96)

Score: 5.00 / 5
### Citation styles × weak_prerequisites

Moves: prerequisite_check (move_b844017682291da3) → goal_frame (move_2fffc1228de074bc) → predict_then_reveal (move_43cd247cca1e9980) → worked_example (move_83e7c2c972d3b6b4) → recall_check (move_78a428a66520ee4e) → artifact_commit (move_7997dcb2004204f3) → synthesis (move_41588ccc1cc2d877)

Score: 5.00 / 5
### Citation styles × relevant_detour

Moves: goal_frame (move_9e23561796e416cb) → predict_then_reveal (move_54248b5a73cdb2b0) → worked_example (move_79be71904a420e56) → composer_detour (move_5eb394595581a5a8) → return_to_goal (move_1b3022a2243d1477) → recall_check (move_fe18a2f9741cea09) → artifact_commit (move_c9c47613b9228b79) → synthesis (move_5b35f9e52aa13a61)

Score: 5.00 / 5
### Citation styles × unsure_but_correct

Moves: goal_frame (move_f9b2fcb921df2c4b) → predict_then_reveal (move_5d3b2b7ba2ddb51b) → worked_example (move_5293c8d1b5df360d) → recall_check (move_ef5af51bff91a985) → artifact_commit (move_3789b63196096762) → synthesis (move_f6e973f8ef27eb10)

Score: 5.00 / 5
### Citation styles × repeated_struggle

Moves: goal_frame (move_4fc134b02d46986f) → predict_then_reveal (move_3dfb8471b4255808) → worked_example (move_3a434b04d4f016ff) → hint (move_68713503aba60e40) → missing_step (move_1a8f483a16417fa0) → worked_solution (move_3ed8e805b7a43c91) → reworded_success (move_adb0c293ddbeaceb) → artifact_commit (move_c8fb9ab17e245ef9) → synthesis (move_d00b102910129ec1)

Score: 4.97 / 5
### Boolean algebra × fast_confident

Moves: goal_frame (move_2c4d0722284ae693) → predict_then_reveal (move_3bf42797f894b8c7) → worked_example (move_75aac633da12caa6) → recall_check (move_4235c719d2df3617) → artifact_commit (move_b471aea35757907a) → synthesis (move_153c617e98d05a5c)

Score: 5.00 / 5
### Boolean algebra × slow_careful

Moves: goal_frame (move_7b66e01a4a5a4a45) → predict_then_reveal (move_fe161ad4a68f4393) → worked_example (move_92bb83b4401cf452) → recall_check (move_acf3df56d2a4edad) → artifact_commit (move_1d1266217ca897f1) → synthesis (move_2870d1c1830fe5b8)

Score: 5.00 / 5
### Boolean algebra × confidently_wrong

Moves: goal_frame (move_9abf58ddb667eaee) → predict_then_reveal (move_2e4bedc1f49b42df) → worked_example (move_ffc905e361b63964) → recall_check (move_1cc696249bd91f89) → artifact_commit (move_658ebe11b97fb889) → synthesis (move_32cd0ef8994151a3)

Score: 5.00 / 5
### Boolean algebra × disengaged_skipping

Moves: goal_frame (move_eb1898b43943a422) → predict_then_reveal (move_95a03f0840974b0b) → worked_example (move_72e7aba5426b4c28) → recall_check (move_82cf54d72af02743) → artifact_commit (move_fd30b006602e5449) → synthesis (move_a695c185e97dad21)

Score: 5.00 / 5
### Boolean algebra × weak_prerequisites

Moves: prerequisite_check (move_882d2348392b6290) → goal_frame (move_85a2f5988777f1fe) → predict_then_reveal (move_109db25b5f1a24ad) → worked_example (move_e978382c15b009c9) → recall_check (move_e960a085ee8f7289) → artifact_commit (move_79df0cf4ee4b7c7d) → synthesis (move_78cb03c6794ef5dc)

Score: 5.00 / 5
### Boolean algebra × relevant_detour

Moves: goal_frame (move_09d2e7379f5db21e) → predict_then_reveal (move_558c9ddcf4440308) → worked_example (move_d814720db068beb5) → composer_detour (move_385d64b71666f3eb) → return_to_goal (move_4ca99b6d6e810bdd) → recall_check (move_f7b0ef2fac5bbc23) → artifact_commit (move_c0895c3abc2b03d8) → synthesis (move_c02dd3403217cdc2)

Score: 5.00 / 5
### Boolean algebra × unsure_but_correct

Moves: goal_frame (move_1b7e156dd37678b0) → predict_then_reveal (move_8c093fc45c7ac864) → worked_example (move_2c88e1775efe5001) → recall_check (move_dcea756459472870) → artifact_commit (move_4980cee5f7608c50) → synthesis (move_464cedb374ec2df3)

Score: 5.00 / 5
### Boolean algebra × repeated_struggle

Moves: goal_frame (move_4c95be5f261e21ae) → predict_then_reveal (move_f524f4da764ba440) → worked_example (move_cf7580eb0de6c1be) → hint (move_ac7db6c0ace768c9) → missing_step (move_ea45668470adb4a4) → worked_solution (move_3fc0df6a8c3c19b1) → reworded_success (move_9cff7c58131e1bb7) → artifact_commit (move_c0d42fb7ba4083ea) → synthesis (move_5c39b4f45d5ebf95)

Score: 4.97 / 5