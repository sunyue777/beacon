import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDemoAccountById } from "@/lib/auth/accounts";
import { sessionCookieName } from "@/lib/auth/constants";
import { verifySessionCookieValue } from "@/lib/auth/session-cookie";

export async function getOptionalCurrentAccount() {
  const cookieStore = await cookies();
  const rmId = await verifySessionCookieValue(cookieStore.get(sessionCookieName)?.value);
  return getDemoAccountById(rmId);
}

export async function getCurrentAccount() {
  const account = await getOptionalCurrentAccount();
  if (!account) {
    redirect("/login");
  }
  return account;
}
