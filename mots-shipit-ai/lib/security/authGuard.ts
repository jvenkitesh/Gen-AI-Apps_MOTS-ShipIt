import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUserRole, type UserRole } from "@/types/userRole";

export type AuthContext = { userId: string; email: string; role: UserRole };

// Usage in a route handler:
//   const auth = await requireAuth(["administrator"]);
//   if (auth instanceof NextResponse) return auth;
// The role is read fresh from data_foundation.user_profiles on every call, so a role
// change takes effect on the user's next request.
export async function requireAuth(allowedRoles?: UserRole[]): Promise<AuthContext | NextResponse> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Please log in." }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .schema("data_foundation")
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[requireAuth] could not read user profile:", error.code, error.message);
    return NextResponse.json(
      { error: "PROFILE_UNAVAILABLE", message: "Your profile could not be loaded. Please try again." },
      { status: 503 }
    );
  }

  if (!profile || !isUserRole(profile.role)) {
    return NextResponse.json(
      { error: "NO_ROLE", message: "Your account has no role yet. Contact an administrator." },
      { status: 403 }
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Your role does not have access to this action." },
      { status: 403 }
    );
  }

  return { userId: user.id, email: user.email ?? "", role: profile.role };
}
