import { ProfileContent } from "./profile-content";
import { RelayAccountBanner } from "./relay-account-banner";

/**
 * A thin server wrapper around the (client) profile form.
 *
 * It exists only so `RelayAccountBanner` can be a server component — it reads
 * the signed-in user's email address, which the client has no business
 * fetching for a banner.
 */
export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-lg">
      <RelayAccountBanner />
      <ProfileContent />
    </div>
  );
}
