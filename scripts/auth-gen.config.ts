// Used only to generate src/db/auth-schema.ts with `npx auth generate`.
// Mirrors the plugin list in src/lib/auth.ts; keep the two in step.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, username } from "better-auth/plugins";
import { sso } from "@better-auth/sso";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      mustChangePassword: { type: "boolean", defaultValue: false, input: false },
    },
  },
  plugins: [username(), admin(), sso()],
});
