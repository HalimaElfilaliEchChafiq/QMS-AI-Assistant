import { BarChart3, ClipboardCheck, FileSearch, FileUp, Home, LineChart, MessageSquare, ScrollText, Settings, Shield, ShieldCheck, User, Users } from 'lucide-react';
import { z } from 'zod';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

const routes = [
  {
    label: 'common:routes.application',
    children: [
      {
        label: 'common:routes.home',
        path: pathsConfig.app.home,
        Icon: <Home className={iconClasses} />,
        end: true,
      },
      {
        label: 'common:routes.chat',
        path: pathsConfig.app.chat,
        Icon: <MessageSquare className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common:routes.qmsTools',
    collapsible: true,
    collapsed: false,
    children: [
      {
        label: 'common:routes.pfmea',
        path: pathsConfig.app.pfmea,
        Icon: <ShieldCheck className={iconClasses} />,
      },
      {
        label: 'common:routes.verify',
        path: pathsConfig.app.verify,
        Icon: <FileSearch className={iconClasses} />,
      },
      {
        label: 'common:routes.audit',
        path: pathsConfig.app.audit,
        Icon: <ClipboardCheck className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common:routes.settings',
    children: [
      {
        label: 'common:routes.profile',
        path: pathsConfig.app.profileSettings,
        Icon: <User className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common:routes.admin',
    collapsible: true,
    collapsed: false,
    children: [
      {
        label: 'common:routes.adminDocuments',
        path: pathsConfig.app.adminDocuments,
        Icon: <FileUp className={iconClasses} />,
      },
      {
        label: 'common:routes.adminUsers',
        path: pathsConfig.app.adminUsers,
        Icon: <Users className={iconClasses} />,
      },
      {
        label: 'common:routes.adminAuditTrail',
        path: pathsConfig.app.adminAuditTrail,
        Icon: <ScrollText className={iconClasses} />,
      },
      {
        label: 'common:routes.adminInsights',
        path: pathsConfig.app.adminInsights,
        Icon: <LineChart className={iconClasses} />,
      },
      {
        label: 'LLM Settings',
        path: pathsConfig.app.adminSettings,
        Icon: <Settings className={iconClasses} />,
      },
    ],
  },
] satisfies z.infer<typeof NavigationConfigSchema>['routes'];

export const navigationConfig = NavigationConfigSchema.parse({
  routes,
  style: process.env.NEXT_PUBLIC_NAVIGATION_STYLE,
  sidebarCollapsed: process.env.NEXT_PUBLIC_HOME_SIDEBAR_COLLAPSED,
});


