import { bad, ok, withUser } from "@/lib/http";

export async function GET() {
  try {
    const auth = await withUser();
    if (auth.error) return ok({ user: null });
    return ok({ user: auth.user });
  } catch (error) {
    return bad(error, 500);
  }
}
