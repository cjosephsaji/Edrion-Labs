-- Least-privilege: application role must not SELECT sealed payloads directly.
REVOKE ALL ON sensitive_report_seals FROM PUBLIC;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON sensitive_report_seals TO edrion_app;
--> statement-breakpoint
REVOKE SELECT ON sensitive_report_seals FROM edrion_app;
