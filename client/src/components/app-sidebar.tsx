import { Home, FileText, Settings, Receipt, Calculator, ScanBarcode, BarChart3, Banknote, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "입실 관리",   url: "/",               icon: Home        },
  { title: "상세 기록",   url: "/logs",            icon: FileText    },
  { title: "스캔정보",    url: "/scan-logs",        icon: ScanBarcode },
  { title: "시스템 설정", url: "/settings",         icon: Settings    },
  { title: "정산하기",    url: "/closing",          icon: Calculator  },
  { title: "시재금관리",  url: "/cash-register",    icon: Banknote    },
  { title: "지출관리",    url: "/expenses",         icon: Receipt     },
  { title: "매출리포트",  url: "/sales-report",     icon: BarChart3   },
  { title: "직원근무일지", url: "/staff-logs",       icon: Users       },
];

const skin = import.meta.env.VITE_SKIN || "v1";
const appName = import.meta.env.VITE_APP_NAME || "LOCKER MANAGER";

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex flex-col items-center gap-2 px-2 py-4 border-b border-sidebar-border">
          <img
            src="/icon-192.png"
            alt={appName}
            className="w-14 h-14 rounded-xl object-cover"
            data-testid="sidebar-logo"
          />
          <div className="text-center leading-tight">
            {skin === "v2" ? (
              <>
                <p className="text-xs font-extrabold tracking-widest text-sidebar-foreground uppercase">He&apos;s</p>
                <p className="text-[10px] text-muted-foreground tracking-wide">입실관리매니저</p>
              </>
            ) : (
              <>
                <p className="text-xs font-extrabold tracking-widest text-sidebar-foreground uppercase">EQUUS</p>
                <p className="text-[10px] text-muted-foreground tracking-wide">Locker Manager</p>
              </>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="pt-2">
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`nav-${item.url}`}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
