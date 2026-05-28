// NextAuth (Auth.js v5) — login Google + allowlist por email.
// Mapea las env vars del proyecto (GOOGLE_OAUTH_* / NEXTAUTH_SECRET) a la
// config de Auth.js. Si no hay allowlist, en dev se permite cualquier cuenta.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowedEmails } from "./auth-guards";

export {
  allowedEmails,
  authConfigured,
  assertAuthConfiguredInProd,
  assertAllowlistConfiguredInProd,
} from "./auth-guards";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (allowedEmails.length === 0) return true; // dev: sin allowlist
      return Boolean(
        user.email && allowedEmails.includes(user.email.toLowerCase()),
      );
    },
  },
});
