import {
  Activity,
  Bot,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  School,
  Settings,
  ShieldCheck,
  Sparkles,
  ToggleRight,
  Users,
  UserCog,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Minimum permission to see this item; hidden if the employee lacks it. */
  permission: string;
  /** Optional pending-count badge key. */
  badgeKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Super Admin navigation. Mirrors docs/ROUTE-MAP.md. Filtered by permission at render. */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'platform.dashboard.view' },
      { label: 'Copilot', href: '/copilot', icon: Sparkles, permission: 'platform.dashboard.view' },
      { label: 'Pending Actions', href: '/pending-actions', icon: Activity, permission: 'platform.dashboard.view', badgeKey: 'pending' },
      { label: 'Activity Centre', href: '/activity', icon: Activity, permission: 'audit.view' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Institutions', href: '/institutions', icon: Building2, permission: 'institutions.view' },
      { label: 'Registration Requests', href: '/registration-requests', icon: ClipboardList, permission: 'registration.view' },
      { label: 'Campuses', href: '/campuses', icon: School, permission: 'campuses.view' },
      { label: 'Institution Users', href: '/institution-users', icon: Users, permission: 'institution_users.view' },
    ],
  },
  {
    label: 'Individual Product',
    items: [
      { label: 'Independent Users', href: '/independent-users', icon: Users, permission: 'independent_users.view' },
      { label: 'Individual Subscriptions', href: '/individual-subscriptions', icon: CreditCard, permission: 'subscriptions.view' },
    ],
  },
  {
    label: 'Edrion Team',
    items: [
      { label: 'Employees', href: '/employees', icon: UserCog, permission: 'employees.view' },
      { label: 'Platform Roles', href: '/platform-roles', icon: ShieldCheck, permission: 'employees.view' },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { label: 'Plans & Pricing', href: '/plans', icon: CreditCard, permission: 'plans.view' },
      { label: 'Subscriptions', href: '/subscriptions', icon: CreditCard, permission: 'subscriptions.view' },
    ],
  },
  {
    label: 'Product Control',
    items: [{ label: 'Feature Controls', href: '/features', icon: ToggleRight, permission: 'features.view' }],
  },
  {
    label: 'Support & Operations',
    items: [
      { label: 'Support Cases', href: '/support', icon: LifeBuoy, permission: 'support.view' },
      { label: 'Access Sessions', href: '/access-sessions', icon: ShieldCheck, permission: 'support.view' },
      { label: 'Integrations', href: '/integrations', icon: Webhook, permission: 'integrations.view' },
    ],
  },
  {
    label: 'Communication',
    items: [{ label: 'Announcements', href: '/announcements', icon: Megaphone, permission: 'platform_settings.view' }],
  },
  {
    label: 'AI Administration',
    items: [
      { label: 'AI Control Centre', href: '/ai', icon: Bot, permission: 'ai.view' },
      { label: 'AI Audit', href: '/ai/audit', icon: Bot, permission: 'ai.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Platform Settings', href: '/settings', icon: Settings, permission: 'platform_settings.view' },
      { label: 'System Health', href: '/system-health', icon: Activity, permission: 'platform_settings.view' },
      { label: 'Security Centre', href: '/security', icon: ShieldCheck, permission: 'security.view' },
      { label: 'Audit Logs', href: '/audit', icon: ShieldCheck, permission: 'audit.view' },
    ],
  },
];
