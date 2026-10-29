import type { SelectOption } from '@edrion/ui';

export const STAFF_EMPLOYMENT_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'visiting', label: 'Visiting' },
];

export const STAFF_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On leave' },
];

type StaffProfileField = {
  name: string;
  label: string;
  required?: boolean;
  nullable?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string;
} & ({ type: 'text' | 'date' | 'phone' } | { type: 'select'; options: SelectOption[] });

/** Keep onboarding and the staff directory's create/edit forms in sync. */
export const STAFF_PROFILE_FIELDS: StaffProfileField[] = [
  { name: 'firstName', label: 'First name', type: 'text', required: true },
  {
    name: 'middleName',
    label: 'Middle name',
    type: 'text',
    nullable: true,
    placeholder: 'Optional',
  },
  { name: 'lastName', label: 'Last name', type: 'text', required: true },
  {
    name: 'employeeNo',
    label: 'Employee no.',
    type: 'text',
    nullable: true,
    placeholder: 'e.g. EMP-512 (optional)',
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'text',
    nullable: true,
    placeholder: 'e.g. Teacher, Accountant (optional)',
  },
  {
    name: 'departmentId',
    label: 'Department',
    type: 'select',
    options: [],
    nullable: true,
    help: 'Optional — choose a staff department, separate from student courses and streams.',
  },
  {
    name: 'employmentType',
    label: 'Employment',
    type: 'select',
    required: true,
    options: STAFF_EMPLOYMENT_OPTIONS,
    defaultValue: 'full_time',
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    options: STAFF_STATUS_OPTIONS,
    defaultValue: 'active',
  },
  { name: 'joinDate', label: 'Join date', type: 'date', nullable: true },
  { name: 'email', label: 'Email', type: 'text', nullable: true, placeholder: 'Optional' },
  { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
];

export const STAFF_PROFILE_DEFAULTS = Object.fromEntries(
  STAFF_PROFILE_FIELDS.filter((field) => field.defaultValue).map((field) => [
    field.name,
    field.defaultValue!,
  ]),
);
