/**
 * Here only so the agenda detail page gets a browser-tab title: it is a client
 * component and cannot export metadata itself. The list page under here
 * overrides this with its own plural title.
 */
export const metadata = { title: "Agenda" };

export default function AgendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
