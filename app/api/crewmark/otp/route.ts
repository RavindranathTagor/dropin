import { classifyEmail, hashOtp, newOtp, organisationalMx, personalEmailMessage } from "@/lib/crewmark";
import { query } from "@/lib/db";
import { bad, ok, reject, withUser } from "@/lib/http";
import { includeOtpInResponse, sendOtpEmail } from "@/lib/mail";

export async function POST() {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const classification = classifyEmail(auth.user.email);
    if (classification.kind === "invalid") return bad(new Error("email_required"));
    if (classification.kind === "personal") {
      return ok({
        ok: true,
        tier: 1,
        verifiedPeer: false,
        badge: "personal",
        message: personalEmailMessage(),
      });
    }

    const mx = classification.kind === "corporate" ? await organisationalMx(classification.registrable) : { note: null };
    const code = newOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await query(
      `update crewmark_otps set consumed_at = now() where user_id = $1 and consumed_at is null`,
      [auth.user.id],
    );
    await query(
      `insert into crewmark_otps (user_id, email, code_hash, expires_at) values ($1, $2, $3, $4)`,
      [auth.user.id, classification.email, hashOtp(code), expires],
    );

    let delivery: "smtp" | "demo" = "demo";
    if (process.env.SMTP_URL) {
      try {
        await sendOtpEmail(classification.email, code);
        delivery = "smtp";
      } catch {
        if (!includeOtpInResponse()) return bad(new Error("The code could not be sent."), 502);
      }
    }

    return ok({
      ok: true,
      delivery,
      tier: 1,
      badge: classification.badge,
      organisation: classification.organisation,
      domain_note: mx.note,
      ...(includeOtpInResponse() ? { otp: code } : {}),
    });
  } catch (error) {
    return bad(error, 500);
  }
}
