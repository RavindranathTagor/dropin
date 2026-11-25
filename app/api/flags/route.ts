import { getFlags } from "@/lib/flags";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function GET() {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const flags = await getFlags(auth.user.id);
    return ok({
      ok: true,
      flags,
      sponsors: {
        sarvam: Boolean(process.env.SARVAM_API_KEY),
        flagsmith: Boolean(process.env.FLAGSMITH_SERVER_KEY || process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY),
        nudgebee: Boolean(process.env.NUDGEBEE_WEBHOOK_URL || process.env.NUDGEBEE_API_TOKEN),
      },
    });
  } catch (error) {
    return bad(error, 500);
  }
}
