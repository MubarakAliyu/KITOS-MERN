import CredentialsProvider from "next-auth/providers/credentials";
import { authApi } from "@/_lib/api/auth";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        identifier: {
          label: "Email or Admission Number",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          return null;
        }

        try {
          const result = await authApi.login({
            email: credentials.identifier,
            password: credentials.password,
          });

          if (!result) return null;

          if (result.must_reset_password) {
            return {
              id: result.user?.id || `temp_${credentials.identifier}`,
              email: result.user?.email || credentials.identifier,
              name: result.user?.name || "",
              role: result.user?.role || "student",
              admission_no: result.user?.admission_no || null,
              language_preference: "en",
              must_reset_password: true,
              temp_token: result.temp_token || "",
              accessToken: result.temp_token || "",
            };
          }

          if (result.user) {
            return {
              id: result.user.id || "user_1",
              email: result.user.email || "",
              name: result.user.name || "",
              role: result.user.role || "student",
              admission_no: result.user.admission_no || null,
              language_preference: result.user.language_preference || "en",
              must_reset_password: false,
              temp_token: null,
              accessToken: result.access || "",
            };
          }

          return null;
        } catch (error) {
          console.error("Auth error:", error.message);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
        token.admission_no = user.admission_no;
        token.language_preference = user.language_preference;
        token.must_reset_password = user.must_reset_password;
        token.temp_token = user.temp_token;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.admission_no = token.admission_no;
        session.user.language_preference = token.language_preference;
        session.user.must_reset_password = token.must_reset_password;
        session.user.temp_token = token.temp_token;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
