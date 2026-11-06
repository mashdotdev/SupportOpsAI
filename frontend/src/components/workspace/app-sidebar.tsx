"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  Bot,
  ChartNoAxesCombined,
  ChevronsUpDown,
  CreditCard,
  Database,
  Ellipsis,
  FlaskConical,
  LayoutDashboard,
  MessagesSquare,
  Orbit,
  Settings,
  UserRound,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

const sidebarTheme = {
  "--sidebar": "#ffffff",
  "--sidebar-foreground": "#000000",
  "--sidebar-primary": "#0593c6",
  "--sidebar-primary-foreground": "#111800",
  "--sidebar-accent": "#f5f5f5",
  "--sidebar-accent-foreground": "#000000",
  "--sidebar-border": "#e5e5e5",
  "--sidebar-ring": "#737373",
  "--muted": "#e5e5e5",
  "--muted-foreground": "#000000",
  "--border": "#eeeeee",
} as CSSProperties;

const navigation: {
  label: string;
  items: { label: string; icon: LucideIcon; href?: string; badge?: string }[];
}[] = [
  {
    label: "WORKSPACE",
    items: [
      { label: "Overview", icon: LayoutDashboard, href: "/workspace" },
      {
        label: "Conversations",
        icon: MessagesSquare,
        href: "/workspace/conversations",
      },
      { label: "AI Agents", icon: Bot, href: "/workspace/ai-agent" },
      {
        label: "Knowledge Base",
        icon: Database,
        href: "/workspace/knowledge-base",
      },
      {
        label: "Playground",
        icon: FlaskConical,
        href: "/workspace/playground",
      },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { label: "Tools & Integrations", icon: Workflow },
      { label: "Evaluations", icon: ChartNoAxesCombined },
      { label: "Activity & Logs", icon: Activity },
    ],
  },
  {
    label: "WORKSPACE MANAGEMENT",
    items: [
      { label: "Members", icon: UsersRound },
      { label: "Usage & Billing", icon: CreditCard },
      { label: "Settings", icon: Settings },
    ],
  },
];

export function AppSidebar({ ownerName }: { ownerName: ReactNode }) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      style={sidebarTheme}
      className="text-sidebar-foreground [&>[data-slot=sidebar-inner]]:rounded-[12px]"
    >
      <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex min-w-0 items-center gap-2 py-1 group-data-[collapsible=icon]:justify-center">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:size-8"
            aria-hidden="true"
          >
            <Orbit className="size-5" />
          </span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-lg font-medium leading-[22px]">
              SupportOps AI
            </p>
            <p className="truncate text-sm leading-[18px] text-muted-foreground">
              WORKSPACE
            </p>
          </div>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-3 shrink-0 group-data-[collapsible=icon]:hidden"
          />
        </div>
      </SidebarHeader>
      <SidebarSeparator className="bg-border" />
      <SidebarContent className="gap-0">
        <nav aria-label="Workspace navigation">
          {navigation.map((group, index) => (
            <Fragment key={group.label}>
              {index > 0 && <SidebarSeparator className="bg-border" />}
              <SidebarGroup className="py-3">
                <SidebarGroupLabel className="text-sm font-medium text-muted-foreground">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          href={item.href}
                          isDisabled={!item.href}
                          size="lg"
                          className="data-disabled:cursor-not-allowed data-disabled:opacity-100 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
                          tooltip={item.label}
                          aria-label={item.label}
                          aria-current={item.href ? "page" : undefined}
                          onPress={() => setOpenMobile(false)}
                        >
                          <item.icon aria-hidden="true" />
                          <span className="group-data-[collapsible=icon]:hidden">
                            {item.label}
                          </span>
                        </SidebarMenuButton>
                        {item.badge && (
                          <SidebarMenuBadge
                            className="top-1/2! -translate-y-1/2 rounded-full bg-sidebar-accent"
                            aria-label="12 conversations (sample)"
                          >
                            {item.badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </Fragment>
          ))}
        </nav>
      </SidebarContent>
      <SidebarSeparator className="bg-border" />
      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sidebar-accent-foreground"
            aria-hidden="true"
          >
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="h-[22px] truncate text-lg font-medium leading-[22px]">
              {ownerName}
            </div>
            <p className="truncate text-sm leading-[18px] text-muted-foreground">
              Owner
            </p>
          </div>
          <Ellipsis
            aria-hidden="true"
            className="size-4 shrink-0 group-data-[collapsible=icon]:hidden"
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
