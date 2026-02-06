import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function SetupGuidePage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/integrations">
          <Button variant="outline" size="sm">
            &larr; Back to Integrations
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Google Service Account Setup Guide</h1>
        <p className="mt-2 text-muted-foreground">
          Follow these steps to create and configure a Google Service Account for
          DragonHub. This enables calendar sync, Drive access, and budget sheet
          integration.
        </p>
      </div>

      {/* Overview */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">What is a Service Account?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A Google Service Account is a special type of account used by applications
          (like DragonHub) to access Google services programmatically. Unlike a
          regular user account, it doesn&apos;t require human interaction to
          authenticate.
        </p>
        <div className="mt-4 rounded-md bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
          <strong>Tip:</strong> Use your PTA&apos;s Google account (e.g.,
          pta@yourschool.org) to create the service account. This ensures the PTA
          retains ownership even as board members change.
        </div>
      </section>

      {/* Step 1 */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            1
          </span>
          <h2 className="text-lg font-semibold">Create a Google Cloud Project</h2>
        </div>

        <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
          <li>
            Go to{" "}
            <a
              href="https://console.cloud.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              console.cloud.google.com
            </a>{" "}
            and sign in with your PTA Google account.
          </li>
          <li>
            Click the project dropdown at the top of the page (it may say &quot;Select
            a project&quot; or show an existing project name).
          </li>
          <li>
            Click <strong>New Project</strong> in the popup window.
          </li>
          <li>
            Enter <strong>DragonHub</strong> as the project name.
          </li>
          <li>
            Leave the organization and location as default (or select your school&apos;s
            organization if applicable).
          </li>
          <li>
            Click <strong>Create</strong> and wait for the project to be created.
          </li>
          <li>
            Make sure the new <strong>DragonHub</strong> project is selected in the
            project dropdown.
          </li>
        </ol>
      </section>

      {/* Step 2 */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            2
          </span>
          <h2 className="text-lg font-semibold">Enable Required APIs</h2>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          You need to enable the Google APIs that DragonHub uses.
        </p>

        <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
          <li>
            In the Google Cloud Console, go to{" "}
            <strong>APIs &amp; Services</strong> &rarr; <strong>Library</strong> (use
            the left sidebar navigation menu).
          </li>
          <li>
            Search for and enable each of the following APIs:
            <ul className="ml-6 mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              <li>
                <strong>Google Calendar API</strong> - for syncing calendar events
              </li>
              <li>
                <strong>Google Drive API</strong> - for accessing Drive files and
                folders
              </li>
              <li>
                <strong>Google Sheets API</strong> - for syncing budget data
              </li>
            </ul>
          </li>
          <li>
            For each API, click on it, then click the <strong>Enable</strong> button.
          </li>
        </ol>

        <div className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> It may take a few minutes for the APIs to become
          fully active after enabling.
        </div>
      </section>

      {/* Step 3 */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            3
          </span>
          <h2 className="text-lg font-semibold">Create a Service Account</h2>
        </div>

        <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
          <li>
            Go to <strong>APIs &amp; Services</strong> &rarr;{" "}
            <strong>Credentials</strong>.
          </li>
          <li>
            Click <strong>Create Credentials</strong> at the top of the page.
          </li>
          <li>
            Select <strong>Service account</strong> from the dropdown.
          </li>
          <li>
            Enter the following details:
            <ul className="ml-6 mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              <li>
                <strong>Service account name:</strong> DragonHub
              </li>
              <li>
                <strong>Service account ID:</strong> dragonhub (auto-generated from
                name)
              </li>
              <li>
                <strong>Description:</strong> Service account for DragonHub PTA app
              </li>
            </ul>
          </li>
          <li>
            Click <strong>Create and Continue</strong>.
          </li>
          <li>
            Skip the &quot;Grant this service account access to project&quot; step
            (click <strong>Continue</strong>).
          </li>
          <li>
            Skip the &quot;Grant users access to this service account&quot; step
            (click <strong>Done</strong>).
          </li>
        </ol>
      </section>

      {/* Step 4 */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            4
          </span>
          <h2 className="text-lg font-semibold">Generate and Download the Key</h2>
        </div>

        <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
          <li>
            In the <strong>Credentials</strong> page, find your new service account
            under &quot;Service Accounts&quot;.
          </li>
          <li>Click on the service account email to open its details.</li>
          <li>
            Go to the <strong>Keys</strong> tab.
          </li>
          <li>
            Click <strong>Add Key</strong> &rarr; <strong>Create new key</strong>.
          </li>
          <li>
            Select <strong>JSON</strong> as the key type and click{" "}
            <strong>Create</strong>.
          </li>
          <li>
            A JSON file will be downloaded to your computer. Keep this file safe -
            you&apos;ll need it in the next step.
          </li>
        </ol>

        <div className="mt-4 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          <strong>Security Warning:</strong> This JSON file contains sensitive
          credentials. Never share it publicly or commit it to version control.
          After entering the credentials in DragonHub, you can delete the downloaded
          file.
        </div>
      </section>

      {/* Step 5 */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            5
          </span>
          <h2 className="text-lg font-semibold">Enter Credentials in DragonHub</h2>
        </div>

        <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
          <li>Open the downloaded JSON file in a text editor.</li>
          <li>
            Find the <code className="rounded bg-muted px-1">client_email</code>{" "}
            field - this is your <strong>Service Account Email</strong>.
          </li>
          <li>
            Find the <code className="rounded bg-muted px-1">private_key</code> field
            - this is your <strong>Private Key</strong>.
          </li>
          <li>
            Go to the{" "}
            <Link href="/admin/integrations" className="text-primary underline">
              Integrations page
            </Link>{" "}
            and click <strong>Configure</strong> under Google Service Account.
          </li>
          <li>
            Paste the <strong>Service Account Email</strong> and{" "}
            <strong>Private Key</strong> into the form.
          </li>
          <li>
            Click <strong>Save Credentials</strong>.
          </li>
        </ol>

        <div className="mt-4 rounded-md bg-muted p-4">
          <p className="mb-2 text-sm font-medium">Example JSON structure:</p>
          <pre className="overflow-x-auto rounded bg-background p-3 text-xs">
            {`{
  "type": "service_account",
  "client_email": "dragonhub@your-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  ...
}`}
          </pre>
        </div>
      </section>

      {/* Step 6 */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            6
          </span>
          <h2 className="text-lg font-semibold">Grant Access to Google Resources</h2>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          The service account needs permission to access your calendars, folders,
          and sheets. You&apos;ll share each resource with the service account email
          address.
        </p>

        <div className="mt-6 space-y-6">
          {/* Calendar */}
          <div>
            <h3 className="font-medium">Google Calendar</h3>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-sm">
              <li>
                Open{" "}
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Google Calendar
                </a>
                .
              </li>
              <li>
                Find the calendar you want to sync in the left sidebar under
                &quot;My calendars&quot; or &quot;Other calendars&quot;.
              </li>
              <li>
                Click the three dots next to the calendar name and select{" "}
                <strong>Settings and sharing</strong>.
              </li>
              <li>
                Scroll down to <strong>Share with specific people or groups</strong>.
              </li>
              <li>
                Click <strong>Add people and groups</strong>.
              </li>
              <li>
                Enter your <strong>service account email</strong> (e.g.,
                dragonhub@your-project.iam.gserviceaccount.com).
              </li>
              <li>
                Set permission to <strong>See all event details</strong>.
              </li>
              <li>
                Click <strong>Send</strong>.
              </li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Repeat for each calendar you want to sync.
            </p>
          </div>

          {/* Drive */}
          <div>
            <h3 className="font-medium">Google Drive Folders</h3>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-sm">
              <li>
                Open{" "}
                <a
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Google Drive
                </a>
                .
              </li>
              <li>Navigate to the folder you want DragonHub to access.</li>
              <li>Right-click the folder and select <strong>Share</strong>.</li>
              <li>
                Enter your <strong>service account email</strong>.
              </li>
              <li>
                Set permission to <strong>Viewer</strong> (for read-only access).
              </li>
              <li>
                Click <strong>Send</strong> (uncheck &quot;Notify people&quot; since
                service accounts can&apos;t receive emails).
              </li>
            </ol>
          </div>

          {/* Sheets */}
          <div>
            <h3 className="font-medium">Budget Google Sheet</h3>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-sm">
              <li>Open your budget spreadsheet in Google Sheets.</li>
              <li>
                Click <strong>Share</strong> in the top right.
              </li>
              <li>
                Enter your <strong>service account email</strong>.
              </li>
              <li>
                Set permission to <strong>Viewer</strong>.
              </li>
              <li>
                Click <strong>Send</strong>.
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Step 7 - File Upload Folder */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            7
          </span>
          <h2 className="text-lg font-semibold">
            Configure File Upload Folder (Optional)
          </h2>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          If you want DragonHub to be able to upload files (e.g., event resources,
          meeting minutes), you&apos;ll need to grant <strong>write access</strong>{" "}
          to a specific folder.
        </p>

        <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
          <li>
            Create a dedicated folder in Google Drive for DragonHub uploads (e.g.,
            &quot;DragonHub Uploads&quot;).
          </li>
          <li>Right-click the folder and select <strong>Share</strong>.</li>
          <li>
            Enter your <strong>service account email</strong>.
          </li>
          <li>
            Set permission to <strong>Editor</strong> (this allows file creation).
          </li>
          <li>
            Click <strong>Send</strong>.
          </li>
          <li>
            Copy the folder ID from the URL (the long string after{" "}
            <code className="rounded bg-muted px-1">/folders/</code>).
          </li>
          <li>
            Configure this folder ID in the Drive Integrations section of the{" "}
            <Link href="/admin/integrations" className="text-primary underline">
              Integrations page
            </Link>
            .
          </li>
        </ol>

        <div className="mt-4 rounded-md bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
          <strong>Why a separate folder?</strong> For security, we recommend only
          granting write access to a dedicated upload folder. All other folders
          should remain read-only (Viewer access).
        </div>
      </section>

      {/* Resources Outside PTA Drive */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
            !
          </span>
          <h2 className="text-lg font-semibold">
            Accessing Resources Outside Your PTA Drive
          </h2>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Sometimes you may need to access calendars, folders, or sheets that belong
          to other Google accounts (e.g., the school&apos;s main Google account or a
          previous PTA board member&apos;s account).
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <h3 className="font-medium">Option 1: Have the owner share with the service account</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask the resource owner to share the calendar/folder/sheet with your
              service account email. They can grant Viewer access for reading or
              Editor access for writing.
            </p>
          </div>

          <div>
            <h3 className="font-medium">Option 2: Transfer ownership</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              For long-term access, consider having resources transferred to your
              PTA Google account. This is especially important for calendars and
              documents that should persist across board member transitions.
            </p>
          </div>

          <div>
            <h3 className="font-medium">Option 3: Copy to your PTA Drive</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              For documents, you can make a copy to your PTA&apos;s Google Drive,
              then share that copy with the service account.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <strong>School District Accounts:</strong> If resources are in a Google
          Workspace account managed by the school district, you may need to contact
          the district IT administrator to grant external sharing permissions.
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Troubleshooting</h2>

        <div className="mt-4 space-y-4">
          <div>
            <h3 className="font-medium">&quot;Access denied&quot; or &quot;Permission denied&quot; errors</h3>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              <li>
                Verify the service account email was entered correctly when sharing
              </li>
              <li>
                Wait a few minutes after sharing - permissions can take time to
                propagate
              </li>
              <li>Check that the correct API is enabled in Google Cloud Console</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium">&quot;API not enabled&quot; errors</h3>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              <li>
                Go back to the Google Cloud Console and verify all required APIs are
                enabled
              </li>
              <li>Make sure you&apos;re looking at the correct project</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium">&quot;Invalid credentials&quot; errors</h3>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              <li>
                Make sure you copied the entire private key, including{" "}
                <code className="rounded bg-muted px-1">-----BEGIN PRIVATE KEY-----</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1">-----END PRIVATE KEY-----</code>
              </li>
              <li>
                Check that you&apos;re using the correct service account email
              </li>
              <li>Try generating a new key if the current one isn&apos;t working</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium">Calendar ID not found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The Calendar ID is usually the calendar owner&apos;s email address, or
              for created calendars, a long string ending in{" "}
              <code className="rounded bg-muted px-1">@group.calendar.google.com</code>.
              You can find it in Calendar Settings under &quot;Integrate
              calendar&quot;.
            </p>
          </div>

          <div>
            <h3 className="font-medium">Folder ID not found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the folder in Google Drive and look at the URL. The folder ID is
              the string after{" "}
              <code className="rounded bg-muted px-1">drive.google.com/drive/folders/</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="rounded-lg border border-green-500/50 bg-green-500/10 p-6">
        <h2 className="font-semibold text-green-700 dark:text-green-400">
          Summary of Required Permissions
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Resource</th>
                <th className="pb-2 font-medium">Permission Level</th>
                <th className="pb-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2">Google Calendars</td>
                <td className="py-2">See all event details</td>
                <td className="py-2">Sync calendar events</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Drive Folders (read)</td>
                <td className="py-2">Viewer</td>
                <td className="py-2">Access knowledge base files</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Drive Folder (uploads)</td>
                <td className="py-2">Editor</td>
                <td className="py-2">Upload new files</td>
              </tr>
              <tr>
                <td className="py-2">Budget Sheet</td>
                <td className="py-2">Viewer</td>
                <td className="py-2">Sync budget data</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="pb-8">
        <Link href="/admin/integrations">
          <Button>&larr; Back to Integrations</Button>
        </Link>
      </div>
    </div>
  );
}
