import { saveFamilyContact } from "@/lib/amma";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as { contact_name?: string; language?: string };
    const saved = await saveFamilyContact({
      passengerId: auth.user.id,
      contactName: body.contact_name || "",
      language: body.language || "",
    });
    return ok({ ok: true, ...saved, path: `/family/${saved.token}` });
  } catch (error) {
    return bad(error);
  }
}
