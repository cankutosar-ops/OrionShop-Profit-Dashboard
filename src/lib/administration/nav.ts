/**
 * Sprint 11.1 — Administration navigation tree (shell only).
 * No business logic. Future modules mount under these routes.
 */

export type AdminNavItem = {
  name: string;
  href: string;
  description: string;
  /** Placeholder sprint label shown on empty pages */
  comingInSprint: string;
};

export type AdminNavSection = {
  id: string;
  label: string | null;
  items: AdminNavItem[];
};

export const ADMIN_ROOT = "/administration";

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: "overview",
    label: null,
    items: [
      {
        name: "Overview",
        href: ADMIN_ROOT,
        description: "Operational control center landing — platform status at a glance.",
        comingInSprint: "11.1",
      },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    items: [
      {
        name: "Companies",
        href: `${ADMIN_ROOT}/companies`,
        description: "Create, edit, and archive companies. Tax and currency defaults.",
        comingInSprint: "11.2",
      },
      {
        name: "Marketplace Connections",
        href: `${ADMIN_ROOT}/connections`,
        description: "Connect marketplaces, credentials, backfill and incremental status.",
        comingInSprint: "11.2",
      },
    ],
  },
  {
    id: "warehouse",
    label: "Warehouse",
    items: [
      {
        name: "Overview",
        href: `${ADMIN_ROOT}/warehouse`,
        description: "Warehouse health, historical and incremental sync posture.",
        comingInSprint: "11.3",
      },
      {
        name: "Sync Sessions",
        href: `${ADMIN_ROOT}/warehouse/sessions`,
        description: "Historical and incremental sync session history.",
        comingInSprint: "11.3",
      },
      {
        name: "Scheduler",
        href: `${ADMIN_ROOT}/warehouse/scheduler`,
        description: "Entity schedules, pause/resume, and manual runs.",
        comingInSprint: "11.3",
      },
      {
        name: "Queue",
        href: `${ADMIN_ROOT}/warehouse/queue`,
        description: "Current jobs, retry queue, and failed jobs.",
        comingInSprint: "11.3",
      },
      {
        name: "Checkpoints",
        href: `${ADMIN_ROOT}/warehouse/checkpoints`,
        description: "Per-entity checkpoint progress and resume state.",
        comingInSprint: "11.3",
      },
    ],
  },
  {
    id: "access",
    label: "Access",
    items: [
      {
        name: "Users",
        href: `${ADMIN_ROOT}/users`,
        description: "Invite and manage platform users.",
        comingInSprint: "11.4",
      },
      {
        name: "Roles",
        href: `${ADMIN_ROOT}/roles`,
        description: "Platform roles (Administrator, Manager, Operator, Viewer).",
        comingInSprint: "11.4",
      },
      {
        name: "Audit Logs",
        href: `${ADMIN_ROOT}/audit-logs`,
        description: "Immutable administrative action history.",
        comingInSprint: "11.5",
      },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [
      {
        name: "Security",
        href: `${ADMIN_ROOT}/security`,
        description: "Authentication, authorization, RLS, and credential health.",
        comingInSprint: "11.5",
      },
      {
        name: "Alerts",
        href: `${ADMIN_ROOT}/alerts`,
        description: "Sync failures, rate limits, delays, and credential expiry.",
        comingInSprint: "11.3",
      },
      {
        name: "System Health",
        href: `${ADMIN_ROOT}/system-health`,
        description: "Warehouse, database, scheduler, queue, and monitoring status.",
        comingInSprint: "11.3",
      },
      {
        name: "Settings",
        href: `${ADMIN_ROOT}/settings`,
        description: "Platform preferences, localization, theme, flags, and retention.",
        comingInSprint: "11.6",
      },
    ],
  },
];

export function flattenAdminNav(): AdminNavItem[] {
  return ADMIN_NAV_SECTIONS.flatMap((section) => section.items);
}

export function findAdminNavItem(pathname: string): AdminNavItem | null {
  const companyWorkspace = pathname.match(/^\/administration\/companies\/[^/]+$/);
  if (companyWorkspace) {
    return {
      name: "Company Workspace",
      href: pathname,
      description:
        "Operational landing page for a company — connections, warehouse summary, and quick actions.",
      comingInSprint: "11.2",
    };
  }

  const items = flattenAdminNav();
  const exact = items.find((item) => item.href === pathname);
  if (exact) return exact;
  const ranked = items
    .filter((item) => item.href !== ADMIN_ROOT && pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length);
  return ranked[0] ?? null;
}

export function buildAdminBreadcrumbs(
  pathname: string
): { label: string; href: string }[] {
  const crumbs: { label: string; href: string }[] = [
    { label: "Administration", href: ADMIN_ROOT },
  ];
  if (pathname === ADMIN_ROOT) {
    crumbs.push({ label: "Overview", href: ADMIN_ROOT });
    return crumbs;
  }

  const companyWorkspace = pathname.match(/^\/administration\/companies\/[^/]+$/);
  if (companyWorkspace) {
    crumbs.push({ label: "Organization", href: `${ADMIN_ROOT}/companies` });
    crumbs.push({ label: "Companies", href: `${ADMIN_ROOT}/companies` });
    crumbs.push({ label: "Workspace", href: pathname });
    return crumbs;
  }

  const item = findAdminNavItem(pathname);
  if (!item) return crumbs;

  const section = ADMIN_NAV_SECTIONS.find((s) =>
    s.items.some((i) => i.href === item.href)
  );
  if (section?.label) {
    crumbs.push({
      label: section.label,
      href: section.items[0]?.href ?? item.href,
    });
  }
  if (item.href !== ADMIN_ROOT) {
    crumbs.push({ label: item.name, href: item.href });
  }
  return crumbs;
}

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === ADMIN_ROOT) return pathname === ADMIN_ROOT;
  return pathname === href || pathname.startsWith(`${href}/`);
}
