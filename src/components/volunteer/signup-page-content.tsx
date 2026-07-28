import type { SignupPageContent } from "@/lib/signup-page-content";
import { CollapsibleHtmlSections } from "@/components/volunteer/collapsible-html-sections";

/**
 * The board-editable copy at the top of the public volunteer sign-up page.
 *
 * Split out so the admin editor's live preview renders the exact same markup as
 * the real page — a preview that only approximates the page is worse than none,
 * because the VP tunes wording against it.
 *
 * `html` fields must already be sanitized: the public page runs them through
 * resolveSignupPageContent, and the editor preview shows the editor's own output.
 *
 * Both rich-text fields fold at their headings — see CollapsibleHtmlSections.
 */

interface Props {
  content: SignupPageContent;
}

export function SignupPageHeader({ content }: Props) {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-3xl font-bold text-dragon-blue-500">
        {content.headline}
      </h1>
      {content.tagline && (
        <p className="mt-2 text-lg text-muted-foreground">{content.tagline}</p>
      )}
    </div>
  );
}

export function SignupPageIntro({ content }: Props) {
  return (
    <>
      <div className="mb-6">
        {content.welcomeHeading && (
          <h2 className="text-xl font-semibold">{content.welcomeHeading}</h2>
        )}
        {content.introHtml && (
          <CollapsibleHtmlSections
            html={content.introHtml}
            className="meeting-notes mt-2 space-y-2 text-sm text-muted-foreground"
          />
        )}
      </div>

      {content.showRolesPanel && content.rolesHtml && (
        <CollapsibleHtmlSections
          html={content.rolesHtml}
          className="meeting-notes mb-6 space-y-2 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground [&_h3]:text-foreground"
        />
      )}
    </>
  );
}
