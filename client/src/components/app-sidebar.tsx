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
import { getAppName } from "@/lib/appMeta";
import { getCurrentLicensePool } from "@/lib/licenseValidation";
import { getCachedStoreProfile, storeIconUrl } from "@/lib/storeProfile";
import { useTheme } from "@/hooks/useTheme";

const items = [
  { title: "입실 관리",   url: "/",               icon: Home        },
  { title: "상세 기록",   url: "/logs",            icon: FileText    },
  { title: "정산하기",    url: "/closing",          icon: Calculator  },
  { title: "시재금관리",  url: "/cash-register",    icon: Banknote    },
  { title: "지출관리",    url: "/expenses",         icon: Receipt     },
  { title: "매출리포트",  url: "/sales-report",     icon: BarChart3   },
  { title: "시스템 설정", url: "/settings",         icon: Settings    },
  { title: "직원근무일지", url: "/staff-logs",       icon: Users       },
  { title: "스캔정보",    url: "/scan-logs",        icon: ScanBarcode },
];

const appName = getAppName();

/** 기존 3개 매장(v1/v2/v3 prefix 풀) 하위호환용 기본 로고 — 새 매장은 프로필의 logo 아이콘을 우선한다. */
const POOL_LOGO: Record<string, string> = {
  v1: "/icon-v1.png",
  v2: "/icon-v2.png",
  v3: "/icon-v3.png",
};

/** v2 풀만 라이트/다크 아이콘 분리 */
const V2_LOGO = {
  light: "/icon-v2-light.png",
  dark: "/icon-v2.png",
} as const;

export function AppSidebar() {
  const [location] = useLocation();
  const { isDark } = useTheme();

  const profile = getCachedStoreProfile();
  const pool = getCurrentLicensePool();

  const logoSrc = profile?.icons.logo
    ? storeIconUrl(profile, "logo")
    : pool === "v2"
      ? (isDark ? V2_LOGO.dark : V2_LOGO.light)
      : (pool ? POOL_LOGO[pool] : undefined) ?? "/icon-demo.png";

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-center px-2 py-4 border-b border-sidebar-border">
          <img
            src={logoSrc}
            alt={appName}
            className="w-[84px] h-[84px] rounded-2xl object-cover"
            data-testid="sidebar-logo"
          />
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
