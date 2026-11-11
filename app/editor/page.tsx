import { connection } from "next/server";
import { redirect } from "next/navigation";
import Editor from "@/components/Editor";
import { daysLeft, getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";

export const metadata = { title: "Editor — Impulsa Studio" };

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await connection();
  const { p } = await searchParams;
  const projectId = p && /^[0-9a-f-]{36}$/i.test(p) ? p : undefined;
  if (!accountsEnabled()) return <Editor projectId={projectId} />;
  const account = await getAccount();
  if (!account) redirect(`/login?next=${encodeURIComponent(projectId ? `/editor?p=${projectId}` : "/editor")}`);
  if (!account.active) redirect("/cuenta");
  return (
    <Editor
      projectId={projectId}
      account={{
        email: account.email,
        used: account.used,
        limit: account.limit,
        trialDaysLeft: account.onTrial ? daysLeft(account.trialEndsAt) : null,
      }}
    />
  );
}
