import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  // ❗ cookies() must be awaited in Next.js 15
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (accessToken) {
    redirect("/patientform");
  }

  redirect("/login");
}
