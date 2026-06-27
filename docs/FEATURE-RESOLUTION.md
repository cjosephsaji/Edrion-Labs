# Feature resolution

Features live in a registry (not scattered `if` checks). Each `feature_definitions` row has a
key, name, module, status, default value, available scopes, dependencies, release stage and
owner. Assignments (`feature_assignments`) attach values at scopes; rollouts
(`feature_rollouts`) add percentage/allow-list/block-list/environment/schedule + kill switch.

## Deterministic priority (most specific wins)

```
global default → plan → institution → campus → user override
```

Then rollout modifiers apply, and the **emergency kill switch** short-circuits to OFF
regardless of any override.

## Effective value preview

The resolver returns not just the boolean but the **winning layer + reason**, e.g.
"ON — institution override set by Finance Admin on 2026-06-01" or "OFF — kill switch active".
This powers the UI's *Effective Value* explainer so an admin can see exactly why a given
user does or doesn't have a feature.

## Scopes

global · plan · institution · campus · independent_user · institution_user · employee_role ·
cohort (percentage/experiment).

## Auditing

Every change to a definition, assignment or rollout writes an audit event
(`feature.manage_*`, all `sensitive`), including the scope, previous/new value and reason.

> Status: data model + resolution design are defined here and in `@edrion/shared-types`
> (`FeatureScope`, `FeatureReleaseStage`). The `feature-controls` API module and the
> `packages/feature-flags` engine are implemented in Phase 7.
