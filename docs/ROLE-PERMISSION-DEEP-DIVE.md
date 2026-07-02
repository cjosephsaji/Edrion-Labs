# Role and Permission Deep Dive

This document explains the two authorization systems in Edrion:

- Platform permissions: used by Edrion employees in `apps/super-admin-web` and enforced by the platform API guards.
- Institution permissions: used by tenant users in `apps/institution-web` and enforced by portal guards plus campus scope.

The source of truth is code, not this document:

- Platform permission catalogue: `packages/permissions/src/catalogue.ts`
- Platform default roles: `packages/permissions/src/roles.ts`
- Institution permission catalogue: `packages/permissions/src/institution/catalogue.ts`
- Institution default roles: `packages/permissions/src/institution/roles.ts`
- Campus-admin assignable role allowlist: `packages/permissions/src/institution/assignable-roles.ts`
- Platform guard: `apps/api/src/common/guards/permissions.guard.ts`
- Portal guard: `apps/api/src/modules/portal/portal-permissions.guard.ts`
- Portal scope guard: `apps/api/src/modules/portal/portal-auth.guard.ts`

## Core Model

Roles are bags of permission keys. The application checks permission keys, not role names.

Effective access is resolved as:

1. Collect permissions from assigned roles.
2. Add direct grants.
3. Remove direct denies.
4. Treat `*` as wildcard access unless a deny removed a concrete key.

For platform employees, permissions answer "what can this Edrion employee do?"

For institution users, permissions answer "what can this tenant user do?" and campus scope answers "where can they do it?"

Sensitive permissions are marked in the catalogues. When `RECENT_AUTH_ENABLED=true`, sensitive actions require the authenticated session's `lastAuthAt` to be inside `RECENT_AUTH_WINDOW_SECONDS`. The UI may hide buttons, but the API guard is the real boundary.

## Platform Roles

Platform roles apply to Edrion employees using the super-admin control plane.

### Platform Owner

Key: `platform_owner`

Purpose: break-glass/full owner role.

Access:

- Holds `*`, the wildcard permission.
- Can perform every platform action, including the highest-risk operations: employee disabling, AI kill switch, subscription cancellation, institution suspension/archive, billing refunds, audit export, role assignment, and support access.

Operational note:

- This role should be rare because it bypasses normal separation-of-duty design.
- Sensitive actions are still subject to recent-auth if that feature is enabled.

### Super Administrator

Key: `super_administrator`

Purpose: broad platform administrator without the two most dangerous powers.

Access:

- Receives every platform permission except:
  - `ai.disable`
  - `employees.disable`

Can:

- Manage institutions, registration requests, campuses, users, plans, subscriptions, billing, entitlements, feature controls, support, audit, security, integrations, and platform settings.
- Configure AI policies and approve sensitive AI actions.

Cannot:

- Trigger AI kill switches.
- Disable Edrion employee accounts.

Operational note:

- This is the practical day-to-day top admin role.
- It intentionally leaves employee disablement and global AI shutdown to narrower, more accountable roles.

### Institution Onboarding Specialist

Key: `onboarding_specialist`

Purpose: handles new institution intake and setup.

Can:

- View dashboard.
- Create, view, update, and activate institutions.
- View, review, approve, and reject registration requests.
- View, create, and update campuses.
- View, invite, and update institution users.
- View plans, subscriptions, feature controls, support cases, and audit records.

Cannot:

- Suspend, restrict, or archive institutions.
- Manage billing, refunds, credits, discounts, entitlements, feature rollouts, employees, AI governance, integrations, or platform settings.

Sensitive permissions:

- `institutions.activate`
- `registration.approve`
- `registration.reject`
- `campuses.create`

Operational note:

- This role can provision real customer workspaces through registration approval, so approval paths should be audited carefully.

### Customer Support Administrator

Key: `support_administrator`

Purpose: handles support cases and time-boxed support entry into institution portals.

Can:

- View dashboard.
- View institutions and registration requests.
- Start support-access sessions through `institutions.access_portal`.
- View campuses and institution users.
- Update institution users.
- View independent users.
- View and manage support cases.
- Operate inside an institution portal through `support.access_institution`.
- View audit records.

Cannot:

- Create or activate institutions.
- Manage billing, subscriptions, employees, feature rollout, AI governance, or platform settings.

Sensitive permissions:

- `institutions.access_portal`
- `support.access_institution`

Operational note:

- Support access is identified, time-boxed, and audited. Actions inside a portal carry the support session id so attribution survives the context switch.

### Customer Success Manager

Key: `customer_success`

Purpose: owns account relationship and customer health.

Can:

- View dashboard.
- View registration requests.
- View and update institutions.
- View campuses and institution users.
- View subscriptions, feature controls, support cases, and audit records.

Cannot:

- Create institutions.
- Activate, restrict, suspend, or archive institutions.
- Change billing, issue credits/refunds, alter plans, manage users' permissions, enter portals, manage support cases, configure AI, or change platform settings.

Operational note:

- This is a mostly read/relationship role with limited institution profile edit authority.

### Finance and Billing Administrator

Key: `finance_administrator`

Purpose: owns commercial configuration, subscriptions, invoices, payments, credits, refunds, and entitlements.

Can:

- View dashboard, institutions, campuses, and audit records.
- Configure campus billing.
- View independent users and manage their subscriptions.
- View, create, update, publish, and archive plans.
- View and mutate subscriptions: plan/cycle changes, cancellation, credits, pricing overrides.
- View and manage billing: invoices, payments, discounts, refunds, voids.
- View and manage entitlements.

Cannot:

- Create/suspend institutions.
- Manage institution user permissions.
- Manage platform employees.
- Configure AI guardrails, feature controls, integrations, security, or support access.

Sensitive permissions:

- `campuses.configure_billing`
- `independent_users.manage_subscription`
- `plans.publish`
- `plans.archive`
- `subscriptions.update`
- `subscriptions.cancel`
- `subscriptions.issue_credit`
- `subscriptions.override_pricing`
- `billing.manage`
- `billing.refund`
- `billing.void_invoice`
- `entitlements.manage`

Operational note:

- Most mutations here affect money or entitlements. Idempotency keys protect financial operations from duplicate execution.

### Technical Operations Administrator

Key: `technical_operations`

Purpose: runs platform operations, integrations, webhooks, jobs, and settings.

Can:

- View dashboard, institutions, campuses, features, support, audit, and security posture.
- View and manage integrations.
- View and manage platform settings.

Cannot:

- Mutate billing/subscriptions.
- Create or suspend institutions.
- Manage employees.
- Manage institution users or support portal access.
- Configure AI guardrails.

Sensitive permissions:

- `integrations.manage`
- `platform_settings.manage`

Operational note:

- This role owns operational wiring, not customer lifecycle or commercial state.

### Security and Compliance Administrator

Key: `security_compliance`

Purpose: security oversight, audit review, and compliance export.

Can:

- View dashboard, institutions, employees, support cases, audit records, and security posture.
- Export audit records.
- Manage security configuration and reviews.

Cannot:

- Mutate institutions, campuses, users, subscriptions, billing, plans, features, integrations, or AI settings.

Sensitive permissions:

- `audit.export`
- `security.manage`

Operational note:

- This role is intentionally audit/security focused and avoids broad operational mutation.

### Product and Feature Administrator

Key: `product_administrator`

Purpose: owns feature registry and rollout configuration.

Can:

- View dashboard, institutions, campuses, plans, and audit records.
- View feature controls.
- Manage feature assignments at global, plan, institution, campus, and user scopes.

Cannot:

- Manage billing, subscriptions, users, employees, support access, integrations, AI governance, or platform settings.

Sensitive permissions:

- `features.manage_global`
- `features.manage_plan`
- `features.manage_institution`
- `features.manage_campus`
- `features.manage_user`

Operational note:

- Feature resolution is deterministic: kill switch, lifecycle state, rollouts, scoped assignments, then default.

### AI Safety Administrator

Key: `ai_safety`

Purpose: owns AI policy, approvals, and emergency shutdown.

Can:

- View dashboard.
- View AI usage, policies, and audit.
- Configure AI policies and guardrails.
- Approve sensitive AI-prepared actions.
- Trigger AI kill switches.
- View audit and security posture.

Cannot:

- Manage institutions, subscriptions, billing, features, users, employees, integrations, or platform settings except through AI governance surfaces.

Sensitive permissions:

- `ai.configure`
- `ai.approve_sensitive_action`
- `ai.disable`

Operational note:

- This role can stop AI platform-wide or at scoped policy levels. AI still cannot execute state changes without human confirmation.

### Read-only Auditor

Key: `read_only_auditor`

Purpose: oversight role with broad read access and no mutations.

Can view:

- Dashboard
- Institutions
- Registration requests
- Campuses
- Institution users
- Independent users
- Employees
- Plans
- Subscriptions
- Billing
- Entitlements
- Features
- Support
- Audit
- Security
- AI
- Integrations
- Platform settings

Cannot:

- Perform any create/update/delete/action endpoints.
- Export audit records because `audit.export` is not included.

Operational note:

- This role is safe for review, compliance read-through, demos, and incident investigation where mutation is not needed.

## Platform Permission Catalogue

| Permission | Sensitive | Meaning |
| --- | --- | --- |
| `platform.dashboard.view` | No | View the platform dashboard and overview. |
| `institutions.view` | No | View institutions and their details. |
| `institutions.create` | No | Create new institutions. |
| `institutions.update` | No | Edit institution profile and configuration. |
| `institutions.activate` | Yes | Activate an institution. |
| `institutions.restrict` | Yes | Restrict an institution's access. |
| `institutions.suspend` | Yes | Suspend an institution. |
| `institutions.archive` | Yes | Archive an institution. |
| `institutions.access_portal` | Yes | Start a support-access session into an institution. |
| `registration.view` | No | View public institution registration requests. |
| `registration.review` | No | Start review, assign reviewer, and add internal notes. |
| `registration.approve` | Yes | Approve a registration and provision institution plus primary admin. |
| `registration.reject` | Yes | Reject a registration request. |
| `campuses.view` | No | View campuses. |
| `campuses.create` | Yes | Add campuses, potentially generating charges. |
| `campuses.update` | No | Edit campus configuration. |
| `campuses.activate` | Yes | Activate a campus. |
| `campuses.suspend` | Yes | Suspend a campus. |
| `campuses.configure_billing` | Yes | Configure campus pricing and billing. |
| `institution_users.view` | No | View institution users. |
| `institution_users.create` | No | Invite institution users. |
| `institution_users.update` | No | Edit institution users. |
| `institution_users.disable` | Yes | Disable institution users. |
| `institution_users.reset_security` | Yes | Reset institution user security. |
| `institution_users.manage_permissions` | Yes | Manage institution user roles, campus access, and overrides. |
| `independent_users.view` | No | View independent users. |
| `independent_users.update` | No | Edit independent users. |
| `independent_users.disable` | Yes | Disable independent users. |
| `independent_users.manage_subscription` | Yes | Manage independent-user subscriptions. |
| `independent_users.manage_entitlements` | Yes | Grant or revoke independent-user entitlements. |
| `employees.view` | No | View Edrion employees and roles. |
| `employees.create` | Yes | Create employee accounts. |
| `employees.update` | No | Edit employee accounts. |
| `employees.disable` | Yes | Disable employee accounts. |
| `employees.assign_roles` | Yes | Assign platform roles to employees. |
| `plans.view` | No | View plans and plan versions. |
| `plans.create` | No | Create plans. |
| `plans.update` | No | Edit draft plans and create versions. |
| `plans.publish` | Yes | Publish a plan version. |
| `plans.archive` | Yes | Archive a plan. |
| `subscriptions.view` | No | View subscriptions and billing. |
| `subscriptions.update` | Yes | Change plans, cycles, and add-ons. |
| `subscriptions.cancel` | Yes | Cancel a subscription. |
| `subscriptions.issue_credit` | Yes | Issue subscription credits. |
| `subscriptions.override_pricing` | Yes | Override subscription pricing. |
| `billing.view` | No | View invoices, payments, credits, and billing history. |
| `billing.manage` | Yes | Create invoices, record payments, issue credits and discounts. |
| `billing.refund` | Yes | Issue refunds against payments. |
| `billing.void_invoice` | Yes | Void an invoice. |
| `entitlements.view` | No | View resolved plan entitlements. |
| `entitlements.manage` | Yes | Override entitlements for an institution. |
| `features.view` | No | View feature registry and assignments. |
| `features.manage_global` | Yes | Manage global feature defaults. |
| `features.manage_plan` | Yes | Manage plan-level feature overrides. |
| `features.manage_institution` | Yes | Manage institution feature overrides. |
| `features.manage_campus` | Yes | Manage campus feature overrides. |
| `features.manage_user` | Yes | Manage user-level feature overrides. |
| `support.view` | No | View support cases and access sessions. |
| `support.manage` | No | Manage support cases. |
| `support.access_institution` | Yes | Operate inside an institution portal. |
| `audit.view` | No | View audit and activity records. |
| `audit.export` | Yes | Export audit records. |
| `security.view` | No | View security events and posture. |
| `security.manage` | Yes | Manage security configuration and reviews. |
| `ai.view` | No | View AI usage, policies, and audit. |
| `ai.configure` | Yes | Configure AI policies and guardrails. |
| `ai.approve_sensitive_action` | Yes | Approve sensitive AI-prepared actions. |
| `ai.disable` | Yes | Trigger AI kill switches. |
| `integrations.view` | No | View webhook endpoints and delivery history. |
| `integrations.manage` | Yes | Create or edit webhook endpoints, rotate secrets, and send tests. |
| `platform_settings.view` | No | View platform settings. |
| `platform_settings.manage` | Yes | Manage platform settings. |

## Institution Portal Roles

Institution roles apply to tenant users inside one institution. A user belongs to exactly one institution. Some users are institution-wide; others are confined to campuses via `campus_user_access`.

### Institution Owner

Key: `institution_owner`

Purpose: tenant-side full owner.

Access:

- Holds `*`, the wildcard permission.
- Institution-wide access across every campus.
- Can manage every ERP module, users, roles, settings, billing visibility, audit, documents, AI, and all functional staff areas.

Operational note:

- This is the tenant equivalent of top ownership. It should usually be assigned only to the legal/operational owner account.

### Institution Admin

Key: `institution_admin`

Purpose: full institution administrator.

Access:

- Receives every institution permission key.
- Institution-wide access across all campuses.
- Can manage academics, people, admissions, attendance, timetable, exams, gradebook, assignments, finance, operations, communication, health, counseling, facilities, security, IT, settings, users, roles, documents, audit, billing view, and AI configuration.

Operational note:

- Unlike `institution_owner`, this role stores the concrete full catalogue rather than `*`.
- This makes future audit/preview screens show explicit keys.

### Campus Admin

Key: `campus_admin`

Purpose: broad administrator for assigned campuses only.

Can:

- Manage academic setup, campuses view, students, conduct, teachers, staff, parents, admissions, attendance, timetable, exams, assignments, fees, expenses, library, transport, inventory, hostel, announcements, reports, documents, AI use, audit view, and campus settings.
- Invite users and assign a limited set of scoped operational staff roles.

Cannot:

- Manage institution-wide settings.
- Manage full roles/permissions.
- Manage all user access freely.
- Configure AI policies.
- View billing.
- Manage payroll.
- Manage gradebook entries, despite viewing gradebook.
- Delete students.

Scope:

- Usually confined by `campus_user_access`.
- In institution scope, confined users resolve to their allowed campus ids rather than every campus.

Special governance:

- With `users.assign_scoped_roles`, a campus admin may assign only:
  - `school_nurse`
  - `counselor`
  - `lab_staff`
  - `receptionist`
  - `it_staff`
  - `maintenance_staff`
  - `security_staff`

### Principal

Key: `principal`

Purpose: academic and operational leader for a campus.

Can:

- Manage academic structure.
- View/manage students and student conduct.
- Manage teachers.
- View staff and parents.
- Manage admissions, attendance, timetable, exams, and gradebook.
- View assignments.
- Publish announcements.
- Use messaging and AI.
- View reports, users, documents, billing, and audit.

Cannot:

- Manage fees, payroll, expenses, library, transport, inventory, hostel, settings, user roles, campuses, facilities, security, IT, health, counseling, or documents.
- Create or grade assignments because it only has `assignments.view`.

Scope:

- May be institution-wide or campus-confined depending on campus access grants.

### Academic Coordinator

Key: `academic_coordinator`

Purpose: owns academic structure, timetable, exams, gradebook, and assignments.

Can:

- Manage academics.
- View students and teachers.
- View attendance.
- Manage timetable.
- Manage exams.
- Manage gradebook.
- Manage assignments.
- View reports.
- Use messaging and AI.

Cannot:

- Create/update students.
- Manage admissions.
- Manage fees/payroll/expenses.
- Manage users, settings, documents, audit, transport, library, hostel, health, counseling, or facilities.

Scope:

- Usually campus or academic-area scoped depending on assignment.

### Finance Manager

Key: `finance_manager`

Purpose: owns money-in and money-out workflows for the institution.

Can:

- View dashboard and students.
- View/manage fees, fee invoices, and fee payments.
- View/manage school expenses.
- View tenant billing summary and Edrion invoices.
- View/export reports.
- Use messaging and AI.
- View audit logs.

Cannot:

- Manage students, admissions, academics, payroll, users, roles, settings, documents, or operational modules.

Sensitive permissions:

- `fees.manage`
- `expenses.manage`
- `reports.export`

Operational note:

- Tenant billing (`billing.view`) is read-only over the Edrion subscription; it does not grant platform billing mutation.

### HR Manager

Key: `hr_manager`

Purpose: owns teachers, staff, and payroll.

Can:

- Manage teachers.
- Manage staff.
- View/manage payroll.
- View/export reports.
- Use messaging and AI.
- View audit logs.

Cannot:

- Manage students, admissions, fees, expenses, academic structure, users, roles, settings, documents, or operational modules.

Sensitive permissions:

- `payroll.manage`
- `reports.export`

### Teacher

Key: `teacher`

Purpose: teaching role for class-level academic work.

Can:

- View dashboard.
- View academic structure.
- View students.
- View and manage student conduct.
- View and mark attendance.
- View timetable and exams.
- View/manage gradebook entries.
- View/manage assignments.
- View announcements.
- Use messages and AI.

Cannot:

- Create/update/delete students.
- Manage admissions, fees, payroll, library, transport, inventory, hostel, users, roles, settings, documents, or audit.

Sensitive permissions:

- `student_conduct.manage`
- `gradebook.manage`

Operational note:

- The catalogue grants capability; actual row-level teacher/class restrictions would need to be enforced in service logic if required beyond campus scope.

### Librarian

Key: `librarian`

Purpose: library catalogue and loan operator.

Can:

- View dashboard.
- View students.
- View/manage library books and loans.
- Use messages and AI.

Cannot:

- Manage academics, admissions, fees, users, settings, reports, or audit.

### Transport Manager

Key: `transport_manager`

Purpose: transport route, vehicle, and assignment operator.

Can:

- View dashboard.
- View students.
- View/manage transport routes, vehicles, and assignments.
- Use messages and AI.

Cannot:

- Manage academics, fees, users, settings, reports, or audit.

### Parent

Key: `parent`

Purpose: guardian-facing view role.

Can:

- View dashboard.
- View attendance.
- View fees.
- View gradebook.
- View announcements.
- Use messages and AI.

Cannot:

- Mutate academic, financial, or profile records.
- View all students by permission alone; child linkage must be enforced by service-level data filtering.

### Student

Key: `student`

Purpose: learner-facing view role.

Can:

- View dashboard.
- View timetable, exams, gradebook, assignments, and announcements.
- Use messages and AI.

Cannot:

- Mutate records.
- View fees or attendance.
- View other students by permission alone; self-scope must be enforced by service-level data filtering.

### School Nurse

Key: `school_nurse`

Purpose: health office role.

Can:

- View dashboard.
- View, create, and update health records.
- Manage medical incidents.
- Manage medication logs.
- View reduced student basic profile.
- View emergency contacts.
- View health reports.
- View reports.
- Use messages and AI.

Cannot:

- View full student academic/financial profile unless another role grants it.
- Manage counseling, fees, admissions, users, settings, or audit.

Sensitive permissions:

- `health_records.update`
- `medical_incidents.manage`
- `medication_logs.manage`

### Counselor

Key: `counselor`

Purpose: wellbeing and counseling role.

Can:

- View dashboard.
- View/create/update counseling notes and sessions.
- Manage counseling cases.
- View wellbeing reports.
- Manage appointments.
- View reduced student basic profile.
- View/manage student conduct.
- View reports.
- Use messages and AI.

Cannot:

- Manage health records, fees, payroll, users, settings, or audit unless granted separately.

Sensitive permissions:

- `counseling.update`
- `counseling_cases.manage`
- `student_conduct.manage`

Operational note:

- Counseling read access is called out in code comments as sensitive and auditable.

### Lab Staff

Key: `lab_staff`

Purpose: laboratory operations.

Can:

- View dashboard.
- View labs overview.
- Manage lab inventory.
- Manage lab equipment.
- View lab schedule.
- Report lab incidents.
- Use messages and AI.

Cannot:

- Manage general inventory, academics, users, settings, or audit unless separately granted.

### Receptionist

Key: `receptionist`

Purpose: front desk operations.

Can:

- View dashboard.
- View and manage visitors.
- Manage appointments.
- Check students/staff in and out.
- View reduced student and staff basic profiles.
- View announcements.
- Use messages and AI.

Cannot:

- View full academic, financial, medical, or payroll records unless separately granted.

### IT Staff

Key: `it_staff`

Purpose: tenant-side IT operations and account-security support.

Can:

- View dashboard.
- Manage devices.
- Reset user security.
- Revoke user sessions.
- Manage access requests.
- View integrations.
- View limited security events.
- Use messages and AI.

Cannot:

- Manage roles, normal user access, billing, academics, finance, or full audit unless separately granted.

Sensitive permissions:

- `users.reset_security`
- `users.revoke_sessions`

### Maintenance Staff

Key: `maintenance_staff`

Purpose: facilities and maintenance operations.

Can:

- View dashboard.
- View facilities.
- Manage work orders.
- Manage maintenance tasks.
- View facility assets.
- Request inventory or supplies.
- Use messages and AI.

Cannot:

- Manage general inventory stock, finance, people, users, settings, or audit unless separately granted.

### Security Staff

Key: `security_staff`

Purpose: campus security operations.

Can:

- View dashboard.
- View visitors.
- Manage gate passes.
- Manage security incidents.
- View emergency alerts.
- View campus access logs.
- Use messages and AI.

Cannot:

- Manage users, settings, full audit, academics, finance, or health/counseling records unless separately granted.

Sensitive permissions:

- `security_incidents.manage`

## Institution Permission Catalogue

| Permission | Sensitive | Meaning |
| --- | --- | --- |
| `portal.dashboard.view` | No | View the institution dashboard. |
| `academics.view` | No | View academic structure. |
| `academics.manage` | Yes | Create and edit academic structure. |
| `campuses.view` | No | View campuses in the institution. |
| `campuses.manage` | Yes | Create and configure campuses. |
| `students.view` | No | View students and profiles. |
| `students.create` | No | Enrol or create students. |
| `students.update` | No | Edit student records. |
| `students.delete` | Yes | Delete or archive students. |
| `student_conduct.view` | No | View student conduct incidents and complaints. |
| `student_conduct.manage` | Yes | Record and resolve student conduct incidents and complaints. |
| `teachers.view` | No | View teachers. |
| `teachers.manage` | No | Create and edit teachers and assignments. |
| `staff.view` | No | View non-teaching staff. |
| `staff.manage` | No | Create and edit staff. |
| `parents.view` | No | View parents and guardian links. |
| `parents.manage` | No | Create and edit parents and guardian links. |
| `admissions.view` | No | View admission applications. |
| `admissions.manage` | No | Process and decide admissions. |
| `attendance.view` | No | View attendance. |
| `attendance.manage` | No | Mark and edit attendance. |
| `timetable.view` | No | View timetables. |
| `timetable.manage` | No | Create and edit timetables. |
| `exams.view` | No | View exams and schedules. |
| `exams.manage` | No | Create and edit exams. |
| `gradebook.view` | No | View grades. |
| `gradebook.manage` | Yes | Enter and edit grades. |
| `assignments.view` | No | View assignments. |
| `assignments.manage` | No | Create, edit, and grade assignments. |
| `fees.view` | No | View fee structures and invoices. |
| `fees.manage` | Yes | Create fee structures, invoices, and record payments. |
| `expenses.view` | No | View school expenses. |
| `expenses.manage` | Yes | Record and edit school expenses. |
| `payroll.view` | No | View payroll. |
| `payroll.manage` | Yes | Run payroll and edit salaries. |
| `library.view` | No | View library catalogue and loans. |
| `library.manage` | No | Manage catalogue and issue/return loans. |
| `transport.view` | No | View transport routes and assignments. |
| `transport.manage` | No | Manage routes, vehicles, and assignments. |
| `inventory.view` | No | View inventory and assets. |
| `inventory.manage` | No | Manage inventory and stock. |
| `hostel.view` | No | View hostel blocks and allocations. |
| `hostel.manage` | No | Manage hostel allocations. |
| `announcements.view` | No | View announcements. |
| `announcements.send` | Yes | Publish announcements. |
| `messages.use` | No | Use direct messaging. |
| `reports.view` | No | View reports and analytics. |
| `reports.export` | Yes | Export reports. |
| `users.view` | No | View institution users. |
| `users.invite` | No | Invite institution users. |
| `users.manage` | Yes | Edit and disable institution users. |
| `users.manage_roles` | Yes | Assign roles and campus access. |
| `users.assign_scoped_roles` | Yes | Assign limited operational staff roles within own campuses. |
| `roles.view` | No | View roles and permissions. |
| `roles.manage` | Yes | Create and edit roles. |
| `institution_settings.view` | No | View institution settings. |
| `institution_settings.manage` | Yes | Manage institution settings. |
| `campus_settings.manage` | Yes | Manage campus-level settings. |
| `documents.view` | No | View institution documents and policies. |
| `documents.manage` | Yes | Upload and manage institution documents and policies. |
| `billing.view` | No | View the institution's Edrion plan, subscription, and invoices. |
| `ai.use` | No | Use AI Copilot. |
| `ai.configure` | Yes | Configure AI settings and guardrails. |
| `audit.view` | No | View audit logs. |
| `audit.export` | Yes | Export audit logs. |
| `student_basic_profile.view` | No | View reduced student profile: name, class, contact. |
| `staff_basic_profile.view` | No | View reduced staff profile: name, role, contact. |
| `health_records.view` | No | View student health records. |
| `health_records.create` | No | Create student health records. |
| `health_records.update` | Yes | Edit student health records. |
| `medical_incidents.manage` | Yes | Record and manage medical incidents. |
| `medication_logs.manage` | Yes | Record and manage medication logs. |
| `emergency_contacts.view` | No | View student emergency contacts. |
| `health_reports.view` | No | View health summary reports. |
| `counseling.view` | No | View counseling notes and sessions. |
| `counseling.create` | No | Create counseling notes and sessions. |
| `counseling.update` | Yes | Edit counseling notes and sessions. |
| `counseling_cases.manage` | Yes | Open, update, and close counseling cases. |
| `wellbeing_reports.view` | No | View wellbeing summary reports. |
| `labs.view` | No | View labs overview. |
| `labs.manage_inventory` | No | Manage lab consumables and inventory. |
| `labs.manage_equipment` | No | Manage lab equipment. |
| `labs.view_schedule` | No | View lab usage schedule. |
| `labs.report_incidents` | No | Report lab safety incidents. |
| `visitors.view` | No | View visitor log. |
| `visitors.manage` | No | Check visitors in and out. |
| `appointments.manage` | No | Manage front-desk appointments. |
| `facilities.view` | No | View facilities. |
| `work_orders.manage` | No | Create and manage work orders. |
| `maintenance_tasks.manage` | No | Manage scheduled maintenance tasks. |
| `assets.view` | No | View facility assets. |
| `inventory.request` | No | Request inventory or supplies. |
| `gate_passes.manage` | No | Issue and manage gate passes. |
| `security_incidents.manage` | Yes | Record and manage security incidents. |
| `emergency_alerts.view` | No | View emergency alerts. |
| `campus_access_logs.view` | No | View campus access logs. |
| `devices.manage` | No | Register and manage devices. |
| `users.reset_security` | Yes | Reset a user's security. |
| `users.revoke_sessions` | Yes | Revoke a user's active sessions. |
| `access_requests.manage` | No | Triage and resolve access requests. |
| `integrations.view` | No | View configured integrations. |
| `security_events.view_limited` | No | View a limited security-events feed. |
| `attendance.check_in_out` | No | Check students or staff in and out at the front desk. |

## Scope Notes for Institution Roles

Institution permissions alone do not prove a user can see every row. The portal request path carries an active scope header:

- `institution`
- `campus:<campusId>`

The guard resolves it against the user's campus access:

- Institution-wide user plus `institution` scope means all campuses.
- Confined user plus `institution` scope means only that user's allowed campuses.
- Campus scope requires that the campus is in the user's allowed campuses unless the user is institution-wide.

Database RLS is then bound with `app.institution_id`, so even a mis-scoped query cannot cross institutions. Campus confinement is still enforced in service/repository filtering.

## Important Separation Rules

- Platform employees and institution users are separate identity domains.
- Independent users and institution users are separate product domains.
- Platform permissions never automatically become portal permissions.
- Portal permissions never grant platform control-plane access.
- UI navigation filtering is convenience only. The API guard decides.
- Sensitive action handling is centralized through recent-auth checks when enabled.
- Audit/security/activity records are append-only at the database layer.
- AI cannot use permissions the human actor does not have. Tool execution re-checks the underlying permission before running.
