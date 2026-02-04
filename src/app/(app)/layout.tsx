import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPtaBoard } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const userIsPtaBoard = session.user.id
    ? await isPtaBoard(session.user.id)
    : false;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isPtaBoard={userIsPtaBoard} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userName={session.user.name ?? null}
          userEmail={session.user.email ?? ""}
          isPtaBoard={userIsPtaBoard}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
