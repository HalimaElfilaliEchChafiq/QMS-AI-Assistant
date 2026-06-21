import { z } from 'zod';

const PathsSchema = z.object({
  auth: z.object({
    signIn: z.string().min(1),
    signUp: z.string().min(1),
    verifyMfa: z.string().min(1),
    callback: z.string().min(1),
    passwordReset: z.string().min(1),
    passwordUpdate: z.string().min(1),
  }),
  app: z.object({
    home: z.string().min(1),
    chat: z.string().min(1),
    pfmea: z.string().min(1),
    verify: z.string().min(1),
    audit: z.string().min(1),
    profileSettings: z.string().min(1),
    adminDocuments: z.string().min(1),
    adminUsers: z.string().min(1),
    adminAuditTrail: z.string().min(1),
    adminInsights: z.string().min(1),
    adminSettings: z.string().min(1),
  }),
});

const pathsConfig = PathsSchema.parse({
  auth: {
    signIn: '/auth/sign-in',
    signUp: '/auth/sign-up',
    verifyMfa: '/auth/verify',
    callback: '/auth/callback',
    passwordReset: '/auth/password-reset',
    passwordUpdate: '/update-password',
  },
  app: {
    home: '/home',
    chat: '/home/chat',
    pfmea: '/home/pfmea',
    verify: '/home/verify',
    audit: '/home/audit',
    profileSettings: '/home/settings',
    adminDocuments: '/home/admin/documents',
    adminUsers: '/home/admin/users',
    adminAuditTrail: '/home/admin/audit-trail',
    adminInsights: '/home/admin/insights',
    adminSettings: '/home/admin/settings',
  },
} satisfies z.infer<typeof PathsSchema>);

export default pathsConfig;

