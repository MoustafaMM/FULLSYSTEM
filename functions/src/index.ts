import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";

// Express Tracker: Logistics module database + public site URL (feedback links, push click-through)
const LOGISTICS_DB_ID = process.env.LOGISTICS_DB_ID || "logistics";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Enterprise SMTP Pooled Transporter
 * Utilizes environment secrets with connection timeout guards
 */
const transporter = nodemailer.createTransport({
  pool: true,
  host: process.env.SMTP_HOST || "smtp.sendgrid.net",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT || 465) === 465,
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
  connectionTimeout: 10000,
});

/**
 * Outbound Queue Processor & Idempotent Mail Dispatcher
 */
async function handleMailEvent(snap: FirebaseFirestore.DocumentSnapshot | undefined) {
  if (!snap) return;

  const data = snap.data();
  if (!data) return;

  // Idempotency: Skip if already delivered successfully
  if (data.delivery?.state === "SUCCESS") {
    console.log(`[Mail Queue] Message ${snap.id} already processed. Skipping duplicate dispatch.`);
    return;
  }

  const recipients = Array.isArray(data.to) ? data.to.join(", ") : data.to;
  if (!recipients) {
    console.warn(`[Mail Queue] Message ${snap.id} missing recipient 'to' address.`);
    await snap.ref.update({
      delivery: {
        state: "ERROR",
        error: "Missing recipient 'to' field",
        attemptedAt: new Date().toISOString(),
      },
    });
    return;
  }

  // Subject Sanitation: Use natural operational confirmation tone instead of survey trigger words
  let subject = data.message?.subject || "Pioneer Education Services — Service Completion Notice";
  if (subject.includes("[Pioneer Logistics] Service Completed:")) {
    subject = subject.replace(/\[Pioneer Logistics\]\s*Service Completed:\s*/i, "Pioneer Education Services — Service Completion Notice: ");
  } else if (subject.includes("Feedback Request:")) {
    subject = subject.replace(/.*Feedback Request:\s*/i, "Pioneer Education Services — Service Completion Notice: ");
  } else if (subject.toLowerCase().includes("feedback request")) {
    subject = subject.replace(/feedback request/i, "Service Completion Notice");
  }
  if (!subject.startsWith("Pioneer Education Services") && !subject.startsWith("[Pioneer Logistics]")) {
    subject = `Pioneer Education Services — ${subject}`;
  }

  // Multi-Part MIME: Ensure complete, cleanly formatted plain-text alternative
  let textContent = data.message?.text;
  const studentName = data.studentName || "Valued Student";
  const presetTitle = data.taskTitle || data.presetTitle || "Logistics Service";
  const feedbackUrl = data.feedbackUrl || (data.taskId ? `${PUBLIC_URL}/?view=feedback&taskId=${data.taskId}` : "");
  const referenceCode = data.taskId ? `TASK-${data.taskId.slice(-6).toUpperCase()}` : "N/A";

  if (!textContent || !textContent.includes("Cyberjaya")) {
    textContent = [
      `Dear ${studentName},`,
      "",
      `We are pleased to inform you that your scheduled logistics service milestone, "${presetTitle}", has been successfully fulfilled by the Pioneer Logistics Operations Team.`,
      "",
      "SERVICE RECORD DETAILS",
      `• Reference ID: ${referenceCode}`,
      `• Service Milestone: ${presetTitle}`,
      "• Status: Completed",
      "",
      "At Pioneer Education Services, we are committed to maintaining the highest standards of student support and operational excellence. To ensure that our services consistently meet your expectations, we kindly invite you to evaluate your recent experience.",
      "",
      "Please complete your service evaluation via the secure link below:",
      feedbackUrl,
      "",
      "Sincerely,",
      "Pioneer Student Support & Logistics Department",
      "Pioneer Education Services Sdn. Bhd.",
      "D-02-02, Biro, Cyber Square, Jalan Teknokrat 6, Cyber 5, 63000 Cyberjaya, Selangor, Malaysia",
      "Official Support: edu@pioneer4ss.com",
      "",
      "--------------------------------------------------",
      "This is an automated operational notification regarding your recent logistics service.",
      "Please do not reply directly to this message. For assistance, contact edu@pioneer4ss.com.",
    ].filter(Boolean).join("\n");
  }

  // Normalize HTML logo reference to the live, publicly accessible Firebase CDN URL
  let html = data.message?.html;
  if (html) {
    html = html
      .replace(/https?:\/\/pioneer-4ss\.com\/pioneer-logo\.png/g, `${PUBLIC_URL}/pioneer-logo.png`)
      .replace(/cid:pioneerLogo/g, `${PUBLIC_URL}/pioneer-logo.png`);
  }

  const mailOptions: nodemailer.SendMailOptions = {
    from: process.env.FROM_EMAIL || '"Pioneer Education Services" <it.pioneer4ss@gmail.com>',
    replyTo: process.env.REPLY_TO_EMAIL || 'edu@pioneer4ss.com',
    to: recipients,
    subject: subject,
    text: textContent,
    html: html,
    headers: {
      'X-Auto-Response-Suppress': 'All',
      'Auto-Submitted': 'auto-generated',
      'X-Entity-Ref-ID': data.taskId || data.id || snap.id,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    const sentAt = new Date().toISOString();
    await snap.ref.update({
      delivery: {
        state: "SUCCESS",
        sentAt,
        attempts: (data.delivery?.attempts || 0) + 1,
      },
    });
    console.log(`[Mail Queue] Successfully delivered message ${snap.id} to: ${recipients} at ${sentAt}`);
  } catch (err: any) {
    const attemptedAt = new Date().toISOString();
    console.error(`[Mail Queue Error] Failed to deliver message ${snap.id}:`, err);
    await snap.ref.update({
      delivery: {
        state: "ERROR",
        error: err.message || "Unknown SMTP dispatch error",
        attemptedAt,
        attempts: (data.delivery?.attempts || 0) + 1,
      },
    });
  }
}

/**
 * Primary Trigger: Document creation in /mail/{mailId}
 * Region: asia-southeast1 (Singapore)
 * Memory: 256MiB
 * Target Database: the Logistics database (Configured in Pioneer-4ss platform)
 */
export const processOutboundMail = onDocumentCreated(
  {
    document: "mail/{mailId}",
    database: LOGISTICS_DB_ID,
    region: "asia-southeast1",
    memory: "256MiB",
  },
  async (event) => {
    await handleMailEvent(event.data);
  }
);

/**
 * Real-Time Mobile & Desktop Push Notification Dispatcher
 * Trigger: Document creation in /notifications/{notificationId}
 * Target Database: the Logistics database
 * Region: asia-southeast1 (Singapore)
 */
export const dispatchPushNotification = onDocumentCreated(
  {
    document: "notifications/{notificationId}",
    database: LOGISTICS_DB_ID,
    region: "asia-southeast1",
    memory: "256MiB",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notifData = snap.data();
    if (!notifData || !notifData.userId) {
      console.log(`[Push Notification] Skipped: notification ${snap.id} has no recipient userId.`);
      return;
    }

    // Suppress any delayed task notification push completely
    if (
      notifData.type === "task_delayed" ||
      notifData.title === "Task Delayed" ||
      (typeof notifData.title === "string" && notifData.title.toLowerCase().includes("delayed")) ||
      (typeof notifData.message === "string" && notifData.message.toLowerCase().includes("delayed")) ||
      (typeof notifData.title === "string" && notifData.title.includes("متأخر")) ||
      (typeof notifData.message === "string" && notifData.message.includes("متأخر"))
    ) {
      console.log(`[Push Notification] Suppressed delayed task notification: ${snap.id}`);
      await snap.ref.delete().catch(() => {});
      return;
    }

    try {
      const db = getFirestore(LOGISTICS_DB_ID);
      const userRef = db.doc(`users/${notifData.userId}`);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        console.warn(`[Push Notification] User ${notifData.userId} not found.`);
        return;
      }

      const userData = userSnap.data();
      const fcmTokens: string[] = userData?.fcmTokens || [];

      if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) {
        console.log(`[Push Notification] No registered FCM tokens for user ${notifData.userId}.`);
        return;
      }

      // Determine the target deep link based on user role and notification type
      const isFieldOfficer = userData?.role === "field_officer";
      let viewParam = "dashboard";
      if (notifData.type === "task_assigned") {
        viewParam = isFieldOfficer ? "tasks" : "live_ops";
      } else if (notifData.type === "low_balance") {
        viewParam = isFieldOfficer ? "wallet" : "wallet_history";
      } else if (notifData.type === "maintenance_due") {
        viewParam = "vehicles";
      } else if (notifData.type === "task_requested") {
        viewParam = "live_ops";
      } else if (
        notifData.type === "counselor_task_assigned" ||
        notifData.type === "counselor_task_reminder" ||
        notifData.type === "counselor_task_comment"
      ) {
        viewParam = "counselor_tasks";
      }

      const targetUrl = `${PUBLIC_URL}/logistics/${viewParam}`;
      const title = notifData.title || "Pioneer Operations Notice";
      const body = notifData.message || "";

      const payload: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: {
          title,
          body,
        },
        data: {
          notificationId: snap.id,
          type: notifData.type || "general",
          url: targetUrl,
          click_action: targetUrl,
        },
        webpush: {
          fcmOptions: {
            link: targetUrl,
          },
          notification: {
            title,
            body,
            icon: `${PUBLIC_URL}/pwa-192x192.png`,
            badge: `${PUBLIC_URL}/pwa-192x192.png`,
            vibrate: [200, 100, 200],
            requireInteraction: notifData.type === "low_balance",
          },
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            priority: "high",
            clickAction: targetUrl,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(payload);
      console.log(`[Push Notification] Dispatched for ${notifData.userId}: ${response.successCount} succeeded, ${response.failureCount} failed.`);

      // Automatically prune dead/unregistered tokens
      const deadTokens: string[] = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            deadTokens.push(fcmTokens[index]);
          }
        }
      });

      if (deadTokens.length > 0) {
        console.log(`[Push Notification] Pruning ${deadTokens.length} obsolete tokens for user ${notifData.userId}`);
        await userRef.update({
          fcmTokens: FieldValue.arrayRemove(...deadTokens),
        });
      }
    } catch (err) {
      console.error(`[Push Notification Error] Failed to process notification ${snap.id}:`, err);
    }
  }
);
