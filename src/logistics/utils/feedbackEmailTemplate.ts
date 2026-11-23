/**
 * Feedback Email Template Generator
 * 
 * Generates formal, institutional transactional emails for student service milestones.
 * Engineered for maximum deliverability and anti-spam compliance:
 * - Hidden pre-header snippet for clean inbox previews
 * - Balanced text-to-HTML ratio with semantic tables
 * - Multi-part plain-text alignment
 * - Corporate navy call-to-action (eliminates alert-color spam triggers)
 * - CAN-SPAM compliant institutional footer with physical office address
 * - Publicly hosted company logo with crisp retina dimensions & alt text
 */

export interface FeedbackEmailTemplateParams {
  studentName?: string;
  taskTitle: string;
  taskId: string;
  feedbackUrl: string;
  completedDateStr: string;
  officerName: string;
  origin?: string;
}

export interface FeedbackEmailPayload {
  subject: string;
  text: string;
  html: string;
}

// Public site address (set VITE_PUBLIC_URL to your Express Tracker domain); falls back to the current origin.
const PRODUCTION_DOMAIN = (import.meta.env.VITE_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');

/**
 * Resolves the logo source for emails.
 * Uses the live, publicly accessible Firebase Hosting CDN URL:
 * <VITE_PUBLIC_URL>/pioneer-logo.png
 * This ensures email clients (Gmail, Apple Mail, Outlook) fetch and display the logo reliably.
 */
export function resolveLogoUrl(origin?: string): string {
  if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1') && !origin.includes('pioneer-4ss.com')) {
    const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    return `${cleanOrigin}/pioneer-logo.png`;
  }
  return `${PRODUCTION_DOMAIN}/pioneer-logo.png`;
}

/**
 * Generates a formal, spam-neutral subject line.
 * Eliminates bracketed tags (e.g. "[Pioneer Logistics]") which are penalized
 * by automated spam filters (SpamAssassin, Barracuda, Microsoft 365).
 */
export function getFeedbackEmailSubject(taskTitle: string): string {
  const sanitizedTitle = (taskTitle || 'Logistics Service').trim();
  return `Pioneer Education Services — Service Completion Notice: ${sanitizedTitle}`;
}

/**
 * Generates high-fidelity plain text alternative matching the HTML structure.
 * Prevents MIME desynchronization penalties.
 */
export function getFeedbackEmailText(params: FeedbackEmailTemplateParams): string {
  const studentName = params.studentName?.trim() || 'Valued Student';
  const taskTitle = params.taskTitle?.trim() || 'Logistics Service';
  const officerName = params.officerName?.trim() || 'Operations Officer';
  const completedDate = params.completedDateStr || 'Recently';
  const referenceCode = params.taskId ? `TASK-${params.taskId.slice(-6).toUpperCase()}` : 'N/A';

  return [
    `Dear ${studentName},`,
    '',
    `We are pleased to inform you that your scheduled logistics service milestone, "${taskTitle}", has been successfully fulfilled by the Pioneer Logistics Operations Team.`,
    '',
    'SERVICE RECORD DETAILS',
    `• Reference ID: ${referenceCode}`,
    `• Service Milestone: ${taskTitle}`,
    `• Date Completed: ${completedDate}`,
    `• Assigned Officer: ${officerName}`,
    '• Status: Completed',
    '',
    'At Pioneer Education Services, we are committed to maintaining the highest standards of student support and operational excellence. To ensure that our services consistently meet your expectations, we kindly invite you to evaluate your recent experience.',
    '',
    'Please complete your service evaluation via the secure link below:',
    params.feedbackUrl,
    '',
    'Sincerely,',
    'Pioneer Student Support & Logistics Department',
    'Pioneer Education Services Sdn. Bhd.',
    'D-02-02, Biro, Cyber Square, Jalan Teknokrat 6, Cyber 5, 63000 Cyberjaya, Selangor, Malaysia',
    'Official Support: edu@pioneer4ss.com',
    '',
    '--------------------------------------------------',
    'This is an automated operational notification regarding your recent logistics service.',
    'Please do not reply directly to this message. For assistance, contact edu@pioneer4ss.com.',
  ].join('\n');
}

/**
 * Generates the formal responsive HTML email with embedded logo.
 */
export function getFeedbackEmailHtml(params: FeedbackEmailTemplateParams): string {
  const studentName = params.studentName?.trim() || 'Valued Student';
  const taskTitle = params.taskTitle?.trim() || 'Logistics Service';
  const officerName = params.officerName?.trim() || 'Operations Officer';
  const completedDate = params.completedDateStr || 'Recently';
  const referenceCode = params.taskId ? `TASK-${params.taskId.slice(-6).toUpperCase()}` : 'N/A';
  const logoUrl = resolveLogoUrl(params.origin);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Service Completion Notice</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Hidden Inbox Preheader Text (Avoids snippet corruption in mail clients) -->
  <div style="display: none; font-size: 1px; color: #f8fafc; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    Official service completion notice and feedback evaluation invitation for ${taskTitle}.
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto;">
          
          <!-- Brand Header with Logo -->
          <tr>
            <td align="center" style="padding: 0 0 24px 0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <img 
                      src="${logoUrl}" 
                      alt="Pioneer Education Services" 
                      width="120" 
                      style="display: block; border: 0; outline: none; text-decoration: none; margin: 0 auto; max-width: 120px; height: auto;"
                    />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; display: inline-block;">
                      Student Logistics &amp; Arrival Operations
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td style="background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);">
              
              <!-- Salutation -->
              <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0 0 16px 0; letter-spacing: -0.2px;">
                Dear ${studentName},
              </h2>

              <!-- Formal Statement -->
              <p style="color: #334155; font-size: 15px; line-height: 1.65; margin: 0 0 24px 0;">
                We are pleased to inform you that your scheduled logistics service milestone, <strong>"${taskTitle}"</strong>, has been successfully fulfilled by the Pioneer Operations Team.
              </p>

              <!-- Operational Service Summary Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 26px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px; color: #475569;">
                  <tr>
                    <td style="padding: 5px 0; font-weight: 600; color: #64748b; width: 38%;">Reference ID:</td>
                    <td style="padding: 5px 0; font-weight: 700; color: #0f172a; font-family: monospace, monospace;">${referenceCode}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-weight: 600; color: #64748b;">Service Milestone:</td>
                    <td style="padding: 5px 0; font-weight: 700; color: #0f172a;">${taskTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-weight: 600; color: #64748b;">Completion Date:</td>
                    <td style="padding: 5px 0; font-weight: 600; color: #334155;">${completedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-weight: 600; color: #64748b;">Assigned Officer:</td>
                    <td style="padding: 5px 0; font-weight: 600; color: #334155;">${officerName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-weight: 600; color: #64748b;">Service Status:</td>
                    <td style="padding: 5px 0;">
                      <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 700; color: #166534; background-color: #dcfce7; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                        Completed
                      </span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Formal Feedback Request -->
              <p style="color: #334155; font-size: 14px; line-height: 1.65; margin: 0 0 24px 0;">
                At Pioneer Education Services, we are committed to upholding the highest standards of student support and operational excellence. To ensure our services consistently meet your expectations, we cordially invite you to evaluate your recent experience. Your feedback provides vital guidance for our ongoing quality assurance.
              </p>

              <!-- Outlook-Safe Executive Navy Call to Action Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px auto 20px auto;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #0f172a;">
                    <a 
                      href="${params.feedbackUrl}" 
                      target="_blank" 
                      style="font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; border: 1px solid #0f172a; display: inline-block; letter-spacing: 0.2px;"
                    >
                      Complete Service Evaluation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; text-align: center;">
                If the button above does not open directly, please access the evaluation form via the following link:<br/>
                <a href="${params.feedbackUrl}" style="color: #0284c7; text-decoration: underline; word-break: break-all; font-size: 12px;">
                  ${params.feedbackUrl}
                </a>
              </p>

              <!-- Formal Sign-Off -->
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #475569; font-size: 14px; line-height: 1.6;">
                <p style="margin: 0;">Sincerely,</p>
                <p style="margin: 4px 0 0 0; font-weight: 700; color: #0f172a;">Pioneer Operations &amp; Student Support</p>
                <p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px;">Pioneer Education Services Sdn. Bhd.</p>
              </div>

            </td>
          </tr>

          <!-- Standard Transactional & Compliance Footer -->
          <tr>
            <td style="text-align: center; padding: 24px 16px 0 16px; color: #64748b; font-size: 11px; line-height: 1.65;">
              <p style="margin: 0; font-weight: 600; color: #475569;">
                Pioneer Education Services Sdn. Bhd. &bull; Logistics &amp; Arrival Operations
              </p>
              <p style="margin: 4px 0 0 0;">
                D-02-02, Biro, Cyber Square, Jalan Teknokrat 6, Cyber 5, 63000 Cyberjaya, Selangor, Malaysia
              </p>
              <p style="margin: 4px 0 0 0;">
                Official Support: <a href="mailto:edu@pioneer4ss.com" style="color: #0f172a; text-decoration: underline; font-weight: 600;">edu@pioneer4ss.com</a>
              </p>
              <p style="margin: 14px auto 0 auto; color: #94a3b8; font-size: 10px; max-width: 480px; line-height: 1.5;">
                You are receiving this official operational update regarding a scheduled logistics service delivered to your student account. Please do not reply directly to this automated dispatch. For assistance, kindly contact our support team.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Returns full email dispatch payload (subject, text, html) for Firestore 'mail' collection.
 */
export function getFeedbackEmailPayload(params: FeedbackEmailTemplateParams): FeedbackEmailPayload {
  return {
    subject: getFeedbackEmailSubject(params.taskTitle),
    text: getFeedbackEmailText(params),
    html: getFeedbackEmailHtml(params),
  };
}
