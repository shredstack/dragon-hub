import "server-only";
import { db } from "@/lib/db";
import { pushTokens } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// Mobile push notification dispatch.
//
// iOS tokens (issued by APNs via @capacitor/push-notifications) are sent
// directly through APNs HTTP/2 using `apn`.
// Android tokens (issued by FCM via @capacitor/push-notifications) are sent
// through Firebase Cloud Messaging using firebase-admin.
//
// Required env vars (all optional — missing creds make the relevant platform
// a no-op rather than crashing):
//   APNS_KEY_ID            10-char Auth Key ID from Apple Developer
//   APNS_TEAM_ID           10-char Team ID from Apple Developer
//   APNS_BUNDLE_ID         net.shredstack.dragonhub
//   APNS_PRIVATE_KEY       Contents of the .p8 Auth Key file (newlines as \n)
//   APNS_PRODUCTION        "true" to send to production APNs; default sandbox
//   FIREBASE_PROJECT_ID    Firebase project ID
//   FIREBASE_CLIENT_EMAIL  Service account email
//   FIREBASE_PRIVATE_KEY   Service account private key (newlines as \n)

export interface PushPayload {
  title: string;
  body: string;
  // Optional URL to open when the notification is tapped. The mobile app's
  // CapacitorBridge reads notification.data.url and navigates the WebView.
  url?: string;
  // Optional badge count (iOS).
  badge?: number;
}

type Platform = "ios" | "android";

interface SendResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

let apnProviderPromise: Promise<unknown> | null = null;
async function getApnProvider() {
  if (apnProviderPromise) return apnProviderPromise;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !privateKey) return null;

  apnProviderPromise = (async () => {
    const apn = await import("apn");
    return new apn.Provider({
      token: { key: privateKey, keyId, teamId },
      production: process.env.APNS_PRODUCTION === "true",
    });
  })();
  return apnProviderPromise;
}

let firebaseAppPromise: Promise<unknown> | null = null;
async function getFirebaseMessaging() {
  if (firebaseAppPromise) return firebaseAppPromise;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;

  firebaseAppPromise = (async () => {
    const admin = await import("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    return admin.messaging();
  })();
  return firebaseAppPromise;
}

async function sendApns(
  tokens: string[],
  payload: PushPayload
): Promise<SendResult> {
  const provider = (await getApnProvider()) as
    | { send: (n: unknown, t: string[]) => Promise<{ failed: { device: string; status?: string; response?: { reason?: string } }[]; sent: { device: string }[] }> }
    | null;
  if (!provider || tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }
  const bundleId = process.env.APNS_BUNDLE_ID || "net.shredstack.dragonhub";

  const apn = await import("apn");
  const note = new apn.Notification();
  note.topic = bundleId;
  note.alert = { title: payload.title, body: payload.body };
  note.sound = "default";
  if (typeof payload.badge === "number") note.badge = payload.badge;
  if (payload.url) note.payload = { url: payload.url };

  const result = await provider.send(note, tokens);
  const invalid: string[] = [];
  for (const f of result.failed) {
    // 410 Gone or BadDeviceToken / Unregistered → drop the token
    const reason = f.response?.reason;
    if (
      f.status === "410" ||
      reason === "Unregistered" ||
      reason === "BadDeviceToken"
    ) {
      invalid.push(f.device);
    }
  }
  return {
    sent: result.sent.length,
    failed: result.failed.length,
    invalidTokens: invalid,
  };
}

async function sendFcm(
  tokens: string[],
  payload: PushPayload
): Promise<SendResult> {
  const messaging = (await getFirebaseMessaging()) as
    | {
        sendEachForMulticast: (m: unknown) => Promise<{
          successCount: number;
          failureCount: number;
          responses: { success: boolean; error?: { code?: string } }[];
        }>;
      }
    | null;
  if (!messaging || tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const message = {
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.url ? { url: payload.url } : undefined,
    android: { priority: "high" as const },
  };

  const result = await messaging.sendEachForMulticast(message);
  const invalid: string[] = [];
  result.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalid.push(tokens[i]);
      }
    }
  });
  return {
    sent: result.successCount,
    failed: result.failureCount,
    invalidTokens: invalid,
  };
}

// Public API ─────────────────────────────────────────────────────────────────

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<SendResult> {
  const rows = await db
    .select({ token: pushTokens.token, platform: pushTokens.platform })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));

  return sendToTokens(rows, payload);
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<SendResult> {
  if (userIds.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }
  const rows = await db
    .select({ token: pushTokens.token, platform: pushTokens.platform })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));

  return sendToTokens(rows, payload);
}

async function sendToTokens(
  rows: { token: string; platform: Platform }[],
  payload: PushPayload
): Promise<SendResult> {
  const iosTokens = rows.filter((r) => r.platform === "ios").map((r) => r.token);
  const androidTokens = rows
    .filter((r) => r.platform === "android")
    .map((r) => r.token);

  const [iosResult, androidResult] = await Promise.all([
    sendApns(iosTokens, payload),
    sendFcm(androidTokens, payload),
  ]);

  const allInvalid = [
    ...iosResult.invalidTokens,
    ...androidResult.invalidTokens,
  ];
  if (allInvalid.length > 0) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, allInvalid));
  }

  return {
    sent: iosResult.sent + androidResult.sent,
    failed: iosResult.failed + androidResult.failed,
    invalidTokens: allInvalid,
  };
}
