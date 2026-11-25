export function smtpUrl() {
  return process.env.SMTP_URL || "";
}

export function includeOtpInResponse() {
  return process.env.CREWMARK_DEMO_OTP === "1" || !smtpUrl();
}

export async function sendOtpEmail(to: string, code: string) {
  const url = smtpUrl();
  if (!url) return { sent: false as const };
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({
    from: process.env.SMTP_FROM || "Crewmark <crewmark@ghardrop.dev>",
    to,
    subject: "Your Crewmark code",
    text: `Your Crewmark code is ${code}. It expires in 10 minutes.`,
  });
  return { sent: true as const };
}
