import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dragon-blue-900 px-4">
      <div className="text-center">
        <h1 className="mb-2 text-5xl font-bold text-white">Dragon Hub</h1>
        <p className="mb-8 text-lg text-dragon-blue-200">
          Draper Dragons PTA Connect
        </p>
        <Link
          href="/sign-in"
          className="inline-block rounded-md bg-dragon-gold-400 px-8 py-3 text-sm font-semibold text-dragon-blue-900 transition-colors hover:bg-dragon-gold-300"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
