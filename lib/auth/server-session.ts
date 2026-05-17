import { cookies } from "next/headers";
import { getDemoAccount } from "@/lib/auth/accounts";
import { sessionCookieName } from "@/lib/auth/constants";

export async function getCurrentAccount() {
  const cookieStore = await cookies();
  return getDemoAccount(cookieStore.get(sessionCookieName)?.value);
}
