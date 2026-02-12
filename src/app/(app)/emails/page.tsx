import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCampaigns, users } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Mail } from "lucide-react";
import { CampaignList } from "@/components/emails/campaign-list";

export default async function EmailsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Fetch all email campaigns with section count
  const campaigns = await db
    .select({
      id: emailCampaigns.id,
      title: emailCampaigns.title,
      weekStart: emailCampaigns.weekStart,
      weekEnd: emailCampaigns.weekEnd,
      status: emailCampaigns.status,
      createdBy: emailCampaigns.createdBy,
      creatorName: users.name,
      createdAt: emailCampaigns.createdAt,
      sentAt: emailCampaigns.sentAt,
      sectionCount: sql<number>`(select count(*) from email_sections where campaign_id = ${emailCampaigns.id})`,
    })
    .from(emailCampaigns)
    .leftJoin(users, eq(emailCampaigns.createdBy, users.id))
    .where(eq(emailCampaigns.schoolId, schoolId))
    .orderBy(desc(emailCampaigns.createdAt));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Emails</h1>
          <p className="text-muted-foreground">
            Create and manage weekly PTA email updates
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/emails/submit">
            <Button variant="outline">
              <Mail className="h-4 w-4" /> Submit Content
            </Button>
          </Link>
          <Link href="/emails/new">
            <Button>
              <Plus className="h-4 w-4" /> New Email
            </Button>
          </Link>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Mail className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">No weekly emails yet</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Create your first weekly email to get started.
          </p>
          <Link href="/emails/new">
            <Button>
              <Plus className="h-4 w-4" /> Create Email
            </Button>
          </Link>
        </div>
      ) : (
        <CampaignList
          campaigns={campaigns.map((c) => ({
            id: c.id,
            title: c.title,
            weekStart: c.weekStart,
            weekEnd: c.weekEnd,
            status: c.status,
            creatorName: c.creatorName,
            createdAt: c.createdAt?.toISOString() ?? null,
            sentAt: c.sentAt?.toISOString() ?? null,
            sectionCount: Number(c.sectionCount),
          }))}
        />
      )}
    </div>
  );
}
