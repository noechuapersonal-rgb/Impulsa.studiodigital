import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import PasswordForm from "./PasswordForm";

export const metadata = { title: "Contraseña — Impulsa Studio" };

export default async function PasswordPage() {
  await connection();
  if (!accountsEnabled()) redirect("/editor");
  const account = await getAccount();
  if (!account) redirect("/login?next=/cuenta/clave");
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-extrabold">
          <span className="grad grid h-8 w-8 place-items-center rounded-lg text-white">▶</span>
          Impulsa <span className="grad-text">Studio</span>
        </Link>
        <div className="panel rounded-2xl p-6">
          <PasswordForm email={account.email ?? ""} />
        </div>
      </div>
    </main>
  );
}
