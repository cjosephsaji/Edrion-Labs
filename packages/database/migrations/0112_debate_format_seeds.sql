-- Seed debate formats (buildable + coming-soon).

INSERT INTO debate_formats (
  key, version, origin, name, short_name, spec, adjudication_template_key, score_scale,
  calibration_state, is_buildable, published_at
) VALUES
(
  'spar_1v1', 1, 'system', '1v1 Spar', 'Spar',
  '{
    "teams": [
      {"key": "prop", "name": "Proposition", "side": "proposition", "rank_eligible": true},
      {"key": "opp", "name": "Opposition", "side": "opposition", "rank_eligible": true}
    ],
    "roles": [
      {"key": "prop_1", "team_key": "prop", "display_name": "Proposition", "short_name": "Prop", "expectations": [], "forbidden": []},
      {"key": "opp_1", "team_key": "opp", "display_name": "Opposition", "short_name": "Opp", "expectations": [], "forbidden": []}
    ],
    "speech_order": [
      {"index": 0, "role_key": "prop_1", "kind": "constructive", "duration_ms": 180000},
      {"index": 1, "role_key": "opp_1", "kind": "constructive", "duration_ms": 180000},
      {"index": 2, "role_key": "opp_1", "kind": "rebuttal", "duration_ms": 120000},
      {"index": 3, "role_key": "prop_1", "kind": "rebuttal", "duration_ms": 120000}
    ],
    "poi": {"enabled": false},
    "reply": {"enabled": false},
    "prep": {"seconds": 300, "private_pads": true, "ai_assist_allowed": false},
    "signals": [],
    "adjudication": {"template_key": "two_side_winner", "rank_teams": false, "speaker_scores": true},
    "score_scale": {"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []},
    "floor_vote": {"enabled": false, "before": false, "after": false}
  }'::jsonb,
  'two_side_winner',
  '{"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []}'::jsonb,
  '{"confidence": "beta"}'::jsonb,
  true,
  now()
),
(
  'practice_solo', 1, 'system', 'Practice vs AI', 'Practice',
  '{
    "teams": [
      {"key": "prop", "name": "Proposition", "side": "proposition", "rank_eligible": true},
      {"key": "opp", "name": "Opposition", "side": "opposition", "rank_eligible": true}
    ],
    "roles": [
      {"key": "prop_1", "team_key": "prop", "display_name": "You", "short_name": "You", "expectations": [], "forbidden": []},
      {"key": "opp_1", "team_key": "opp", "display_name": "Opponent", "short_name": "Opp", "expectations": [], "forbidden": []}
    ],
    "speech_order": [
      {"index": 0, "role_key": "prop_1", "kind": "constructive", "duration_ms": 180000},
      {"index": 1, "role_key": "opp_1", "kind": "constructive", "duration_ms": 180000},
      {"index": 2, "role_key": "opp_1", "kind": "rebuttal", "duration_ms": 120000},
      {"index": 3, "role_key": "prop_1", "kind": "rebuttal", "duration_ms": 120000}
    ],
    "poi": {"enabled": false},
    "reply": {"enabled": false},
    "prep": {"seconds": 300, "private_pads": true, "ai_assist_allowed": true},
    "signals": [],
    "adjudication": {"template_key": "two_side_winner", "rank_teams": false, "speaker_scores": true},
    "score_scale": {"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []},
    "floor_vote": {"enabled": false, "before": false, "after": false}
  }'::jsonb,
  'two_side_winner',
  '{"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []}'::jsonb,
  '{"confidence": "beta"}'::jsonb,
  true,
  now()
),
(
  'bp', 1, 'system', 'British Parliamentary', 'BP',
  '{"teams":[],"roles":[],"speech_order":[],"poi":{"enabled":true},"reply":{"enabled":false},"prep":{"seconds":900,"private_pads":true,"ai_assist_allowed":false},"signals":[],"adjudication":{"template_key":"bp_rank_four","rank_teams":true,"speaker_scores":true},"score_scale":{"min":50,"max":100,"step":1,"label":"WUDC","bands":[]},"floor_vote":{"enabled":false,"before":false,"after":false}}'::jsonb,
  'bp_rank_four',
  '{"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []}'::jsonb,
  '{"confidence": "beta"}'::jsonb,
  false,
  now()
),
(
  'ap', 1, 'system', 'Asian Parliamentary', 'AP',
  '{"teams":[],"roles":[],"speech_order":[],"poi":{"enabled":true},"reply":{"enabled":true},"prep":{"seconds":900,"private_pads":true,"ai_assist_allowed":false},"signals":[],"adjudication":{"template_key":"two_side_winner","rank_teams":true,"speaker_scores":true},"score_scale":{"min":50,"max":100,"step":1,"label":"WUDC","bands":[]},"floor_vote":{"enabled":false,"before":false,"after":false}}'::jsonb,
  'two_side_winner',
  '{"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []}'::jsonb,
  '{"confidence": "beta"}'::jsonb,
  false,
  now()
),
(
  'oxford', 1, 'system', 'Oxford', 'Oxford',
  '{"teams":[],"roles":[],"speech_order":[],"poi":{"enabled":false},"reply":{"enabled":false},"prep":{"seconds":600,"private_pads":true,"ai_assist_allowed":false},"signals":[],"adjudication":{"template_key":"oxford_swing","rank_teams":false,"speaker_scores":false},"score_scale":{"min":50,"max":100,"step":1,"label":"WUDC","bands":[]},"floor_vote":{"enabled":true,"before":true,"after":true}}'::jsonb,
  'oxford_swing',
  '{"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []}'::jsonb,
  '{"confidence": "beta"}'::jsonb,
  false,
  now()
),
(
  'ld', 1, 'system', 'Lincoln-Douglas', 'LD',
  '{"teams":[],"roles":[],"speech_order":[],"poi":{"enabled":false},"reply":{"enabled":true},"prep":{"seconds":600,"private_pads":true,"ai_assist_allowed":false},"signals":[],"adjudication":{"template_key":"ld_value","rank_teams":false,"speaker_scores":true},"score_scale":{"min":50,"max":100,"step":1,"label":"WUDC","bands":[]},"floor_vote":{"enabled":false,"before":false,"after":false}}'::jsonb,
  'ld_value',
  '{"min": 50, "max": 100, "step": 1, "label": "WUDC", "bands": []}'::jsonb,
  '{"confidence": "beta"}'::jsonb,
  false,
  now()
)
ON CONFLICT (key, version) DO NOTHING;
