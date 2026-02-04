/**
 * Fundraiser sync placeholder.
 *
 * 32auctions API integration can be added here when API access is confirmed.
 * For now, fundraiser data is managed manually via the PTA board UI.
 */
export async function syncFundraisers() {
  const apiKey = process.env.AUCTIONS_32_API_KEY;

  if (!apiKey) {
    console.log(
      "No 32auctions API key configured, skipping sync. Fundraisers are managed manually."
    );
    return { synced: 0 };
  }

  // TODO: Implement 32auctions API integration when API docs are available
  // const response = await fetch('https://api.32auctions.com/...', {
  //   headers: { Authorization: `Bearer ${apiKey}` },
  // });
  // Parse response and upsert into fundraisers + fundraiser_stats tables

  return { synced: 0 };
}
