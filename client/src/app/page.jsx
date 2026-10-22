import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/_lib/auth/auth-options";
import { roleToPath } from "@/_lib/auth/role-routing";

// Auth-aware root: a signed-in user goes to their role dashboard,
// everyone else lands on the login screen.
export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role) {
    redirect(roleToPath(session.user.role));
  }
  redirect("/login");
}
