import type { RMRole } from "@/lib/repo/types";

export type RoleAccentKey = "role-junior" | "role-mid" | "role-manager";

export interface DemoAccount {
  rmId: string;
  name: string;
  role: RMRole;
  title: string;
  scope: string;
  permissions: string[];
  recommendedPath: string;
  /** Tailwind color key (without hsl()), used for accent borders, badges, icons. */
  accent: RoleAccentKey;
}

export const demoAccounts: DemoAccount[] = [
  {
    rmId: "rm_junior_01",
    name: "Jensen Parker",
    role: "Junior",
    title: "Junior Relationship Manager",
    scope: "Smaller mass-affluent book, Standard tier",
    permissions: ["View assigned customers", "Generate briefs and drafts", "Client-facing drafts require review"],
    recommendedPath: "/workspace",
    accent: "role-junior"
  },
  {
    rmId: "rm_mid_01",
    name: "Adrian Lim",
    role: "MidLevel",
    title: "Mid-level Relationship Manager",
    scope: "Larger affluent book, Premium and VIP tier",
    permissions: ["View assigned affluent customers", "Use next best action", "Approve routine drafts"],
    recommendedPath: "/workspace",
    accent: "role-mid"
  },
  {
    rmId: "rm_manager_01",
    name: "Sofia Tan",
    role: "Manager",
    title: "Relationship Management Supervisor",
    scope: "Full team view, approvals, activity, audit trail",
    permissions: ["View all team customers", "Inspect approval queue", "Review audit events"],
    // Manager and RMs both enter /workspace; the workspace surface itself
    // swaps content based on role rather than splitting routes.
    recommendedPath: "/workspace",
    accent: "role-manager"
  }
];

export function getDemoAccount(rmId?: string | null) {
  return demoAccounts.find((account) => account.rmId === rmId) ?? demoAccounts[0];
}

export function getRoleLabel(role: RMRole) {
  if (role === "MidLevel") {
    return "Mid-level";
  }
  return role;
}

export function getRoleAccent(role: RMRole): RoleAccentKey {
  if (role === "Junior") return "role-junior";
  if (role === "Manager") return "role-manager";
  return "role-mid";
}
