# Projectile motion: educator review packet v1

Status: prepared under the user's delegated product choice on 25 September 2026. **Not educator-approved, not a runtime pack, not a qualification record.** Do not distribute this packet to a learner as the source document: it contains assessment prompts and keys.

Learner source: `output/pdf/petros-projectile-source-v1.pdf`. Human-readable counterpart: `docs/petros-phase2-source/projectile-source-v1.md`. Its exact PDF hash and section/page map are in `source-manifest.json`. Runtime source fingerprint, UTF-16 spans, object/unit IDs, course/subject/objective IDs and pack ID must be obtained through the canonical owners during an authorized import. No production identifiers are invented here.

## Selected objective

Given the initial horizontal and vertical velocity components, positive constant gravity and an elapsed time within flight, predict horizontal displacement and vertical velocity in SI units; explain why zero vertical velocity at the apex does not usually mean zero speed; identify when the no-drag, equal-height model is inapplicable.

Canonical objective version: pending registration and approval by the curriculum owner. A generated outline, this packet, or an assistant's selection cannot approve a curriculum alignment.

## Concept and prerequisite map

| Source-local concept key | Meaning | Source support | Required prior knowledge |
|---|---|---|---|
| component_motion | Horizontal and vertical components share time but have different acceleration | Page 1 S2-S3 | Signed quantities, velocity versus acceleration |
| constant_horizontal_velocity | vx remains vx0 when horizontal acceleration is zero | Page 1 S2-S3 | Multiplication, units |
| vertical_gravity | vy changes at rate -g; y follows the quadratic expression | Page 1 S3-S4 | Substitution, squared time |
| apex_not_rest | vy is zero at the apex; vx may remain nonzero; acceleration stays downward | Page 1 S4; page 2 S5-S6 | component_motion, constant_horizontal_velocity, vertical_gravity |
| model_boundary | First contact, level ground, no drag/wind/propulsion | Page 1 S1/S4; page 2 S6/S8 | Interpretation of assumptions |

These keys are local to this source version; matching labels in another source do not establish identity. The prerequisite graph has no edge returning from a later concept to an earlier one.

## Explanations and examples

Start with the source's two-component explanation before a diagnostic probe. Use S5 as the worked example. If a learner confuses the two components, contrast ordinary oblique flight with the vertical-launch exception in S6. If confusion repeats, show the linked trajectory, velocity/acceleration and height-time views, then ask a fresh question. A diagram interaction is never an evidence event. Explain the model boundary before treating a numeric answer as applicable.

The selected non-examples are a feather in wind, a powered drone, and landing on a higher platform. Do not label a mathematically valid calculation as a physically valid prediction for these cases.

## Diagnostic and transfer tasks

| Task / variant | Prompt | Key and interpretation | Source basis |
|---|---|---|---|
| apex_component / a | For an oblique projectile with nonzero horizontal launch velocity, which velocity component is zero at its apex: horizontal, vertical, both, or neither? | `vertical`. A confident `both` is a candidate for the reviewed apex-stops-all-motion discriminator, not a misconduct signal. Low certainty remains tentative | S2-S4, S6 |
| apex_acceleration / b | At the apex of the declared model, does gravitational acceleration become zero or remain downward? | `remain downward`. Any mismatch alone does not establish its cause | S4, S7 |
| horizontal_transfer / c | A launcher gives a projectile horizontal velocity 7.5 m/s and upward velocity 15 m/s. Take g = 10 m/s^2. What is its horizontal displacement at t = 1.6 s? Include units. | `12 m`, absolute tolerance 0.01 m; require `m`. Flight duration 3 s, so the time is valid. This exact instance is absent from the learner source | S1-S4 |
| vertical_transfer / d | With horizontal velocity 3 m/s, upward velocity 11 m/s and g = 10 m/s^2, what is the vertical velocity at t = 0.8 s? Include units and sign. | `3 m/s`, tolerance 0.01 m/s; require `m/s`. A positive result means upward. This is a separate task, not a retry renamed as unseen | S2-S4 |

Keep held-out prompts and answer contracts on the server until the selected task is rendered. Persist exposure before accepting a response. Reuse in another session is repeated evidence, even when a response was never submitted. Retire the task's unseen status after exposure. Do not show a worked transfer solution before collecting the independent response. Hints and answer exposure must be recorded and invalidate unassisted eligibility as appropriate. External assistance is unknown unless declared.

## Qualitative draft, feedback, revision and rubric

Prompt: "Explain what happens to horizontal velocity, vertical velocity and acceleration at the apex of an oblique projectile. Use the model assumptions and contrast the special case of a vertical launch."

Retain the learner's first draft exactly. A qualified educator returns feedback linked to the full rubric and exact draft spans; the learner creates a new revision. The educator explicitly approves or rejects that exact revision. Approval of an older revision does not apply to a later edit.

| Criterion key | Descriptor | Evidence required |
|---|---|---|
| component_distinction | Distinguishes horizontal from vertical velocity | Explicitly states vy = 0 and vx = vx0 at the apex for the oblique case |
| acceleration_distinction | Separates instantaneous velocity from acceleration | States acceleration remains downward and explains why zero vy does not stop gravity |
| boundary_and_exception | Applies the declared model and recognizes the vertical case | Identifies equal-height/no-drag scope and explains that vx0 = 0 makes total velocity zero at the vertical-launch apex |

Feedback labels are `observed`, `not_observed` or uncertainty, with text spans where applicable. There is no invented numeric score, plagiarism inference, cohort ranking or automatic mastery conversion. Approval verifies the educator's judgment of the exact submitted work; it does not prove no outside help was used.

## Required independent educator authority

Choose an active institution-authorized physics educator with subject qualification evidence recorded by the institution, current course/student scope, current pack-review permission and `homework.grade` for qualitative work. One qualified person may fill both roles if the institution authorizes that combination. Do not substitute the assistant, a synthetic fixture identity, a software reviewer or the user merely delegating product choices.

The review must cover source/scientific fidelity, assumptions and edge cases, prerequisite suitability, explanations and misconceptions, evaluator keys/tolerances, rubric and transfer validity, and the adult English-language accessibility scope. Record reviewer identity, qualification version, content hash, rubric version, exact decision and date through the production owner. Until then all review IDs remain absent and admission remains disabled.
