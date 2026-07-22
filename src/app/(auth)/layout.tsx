import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src="/dragon-hub-logo.png"
            alt=""
            width={112}
            height={112}
            priority
            className="mx-auto h-20 w-20 sm:h-28 sm:w-28"
          />
          <h1 className="mt-3 text-3xl font-bold text-dragon-blue-500">
            Dragon Hub
          </h1>
          <p className="mt-2 text-muted-foreground">Draper Dragons PTA</p>
        </div>
        {children}
      </div>
    </div>
  );
}
