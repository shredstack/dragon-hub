export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-dragon-blue-500">Dragon Hub</h1>
          <p className="mt-2 text-muted-foreground">Draper Dragons PTA</p>
        </div>
        {children}
      </div>
    </div>
  );
}
