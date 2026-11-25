import { classifyEmail, otpMatches, personalEmailMessage } from "@/lib/crewmark";
import { query } from "@/lib/db";
import { bad, ok, reject, withUser } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const code = String(body.code || "").trim();
    if (!/^\d{6}$/.test(code)) return bad(new Error("Enter the 6-digit code."));

    const classification = classifyEmail(auth.user.email);
    if (classification.kind !== "academic" && classification.kind !== "corporate") {
      return ok({ ok: false, tier: 1, verifiedPeer: false, message: personalEmailMessage() });
    }

    const rows = await query<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts
       from crewmark_otps
       where user_id = $1 and consumed_at is null and expires_at > now()
       order by created_at desc
       limit 1`,
      [auth.user.id],
    );
    const otp = rows[0];
    if (!otp) return bad(new Error("That code has expired. Send a new one."));
    if (otp.attempts >= 5) {
      await query(`update crewmark_otps set consumed_at = now() where id = $1`, [otp.id]);
      return bad(new Error("That code has expired. Send a new one."));
    }
    if (!otpMatches(code, otp.code_hash)) {
      await query(`update crewmark_otps set attempts = attempts + 1 where id = $1`, [otp.id]);
      return bad(new Error("That code does not match."));
    }

    await query(`update crewmark_otps set consumed_at = now() where id = $1`, [otp.id]);
    await query(
      `update profiles
       set trust_tier = 2,
           crewmark_badge = $2,
           organisation_name = $3,
           organisation_domain = $4,
           email_verified_at = now()
       where id = $1`,
      [auth.user.id, classification.badge, classification.organisation, classification.registrable],
    );
    return ok({
      ok: true,
      tier: 2,
      verifiedPeer: true,
      badge: classification.badge,
      organisation: classification.organisation,
    });
  } catch (error) {
    return bad(error, 500);
  }
}
