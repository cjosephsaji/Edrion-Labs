-- Plan 03: institutional seeds.
-- Permission catalogues are code-level; this migration seeds institution setting defaults only.

INSERT INTO "institution_settings" (
	"institution_id",
	"category",
	"key",
	"label",
	"value_type",
	"value",
	"description",
	"version",
	"created_at",
	"updated_at"
)
SELECT
	i."id",
	'student_ai',
	'student_ai.homework_default_policy',
	'Homework AI default policy',
	'string',
	'off',
	'Default AI assistance policy for new homework (off|hints_only|full)',
	1,
	now(),
	now()
FROM "institutions" i
WHERE NOT EXISTS (
	SELECT 1
	FROM "institution_settings" s
	WHERE s."institution_id" = i."id"
		AND s."key" = 'student_ai.homework_default_policy'
);
