/**
 * ============================================================================
 * CODE POLICE - EMAIL SERVICE
 * ============================================================================
 * Send analysis reports via email using Nodemailer (Gmail SMTP).
 * Features:
 * - Inline SVG Protocol Zero logo
 * - Mobile-responsive design
 * - "Fix with PR" button linking to dashboard
 * - Enhanced visual styling
 */

import nodemailer from "nodemailer";
import type { AnalysisRun, CodeIssue, IssueSeverity } from "@/types";

let transporter: nodemailer.Transporter | null = null;

/**
 * Get Nodemailer transporter instance
 */
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!host || !user || !pass) {
      throw new Error(
        "Email configuration missing. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS"
      );
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });
  }
  return transporter;
}

/**
 * Inline SVG Ghost Logo for email
 * Simple, clean ghost icon that works in email clients
 */
const GHOST_LOGO_SVG = `
<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ghostGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a78bfa;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Ghost body -->
  <path d="M24 4C14.059 4 6 12.059 6 22v18c0 1.5 1.5 2.5 2.8 1.8l3.2-1.6c0.5-0.25 1.1-0.25 1.6 0l3.4 1.7c0.6 0.3 1.4 0.3 2 0l3.4-1.7c0.5-0.25 1.1-0.25 1.6 0l3.4 1.7c0.6 0.3 1.4 0.3 2 0l3.4-1.7c0.5-0.25 1.1-0.25 1.6 0l3.2 1.6c1.3 0.7 2.8-0.3 2.8-1.8V22C42 12.059 33.941 4 24 4z" fill="url(#ghostGradient)"/>
  <!-- Left eye -->
  <ellipse cx="18" cy="20" rx="3.5" ry="4" fill="#1e1e2e"/>
  <!-- Right eye -->
  <ellipse cx="30" cy="20" rx="3.5" ry="4" fill="#1e1e2e"/>
  <!-- Cute smile -->
  <path d="M20 28c0 0 2 3 4 3s4-3 4-3" stroke="#1e1e2e" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>
`;

/**
 * Send analysis report email
 */
export async function sendAnalysisReport(input: {
  to: string;
  run: AnalysisRun;
  issues: CodeIssue[];
  summary: string;
  repoName: string;
  commitUrl: string;
  // New optional fields for enhanced emails
  projectId?: string;
  commitMessage?: string;
  diffSummary?: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    summary: string;
    filesByType: Record<string, number>;
  };
  dashboardUrl?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const transport = getTransporter();
  const fromAddress = process.env.EMAIL_USER || "noreply@protocolzero.dev";

  const html = generateReportHtml(input);

  try {
    const result = await transport.sendMail({
      from: `Protocol Zero Code Police <${fromAddress}>`,
      to: input.to,
      subject: getEmailSubject(input.run, input.issues),
      html,
    });

    console.log("[Email] Sent successfully to:", input.to, "MessageId:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


/**
 * Generate email subject based on analysis results
 */
function getEmailSubject(run: AnalysisRun, issues: CodeIssue[]): string {
  const { critical, high } = run.issueCounts;
  const commitShort = run.commitSha.slice(0, 7);

  if (critical > 0) {
    return `🚨 Critical Issues Found - ${commitShort}`;
  }
  if (high > 0) {
    return `⚠️ High Priority Issues - ${commitShort}`;
  }
  if (issues.length > 0) {
    return `📋 Code Review Report - ${commitShort}`;
  }
  return `✅ Clean Commit - ${commitShort}`;
}

/**
 * Generate HTML email content - Mobile-responsive design
 */
function generateReportHtml(input: {
  run: AnalysisRun;
  issues: CodeIssue[];
  summary: string;
  repoName: string;
  commitUrl: string;
  projectId?: string;
  commitMessage?: string;
  diffSummary?: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    summary: string;
    filesByType: Record<string, number>;
  };
  dashboardUrl?: string;
}): string {
  const { run, issues, summary, repoName, commitUrl } = input;
  const commitShort = run.commitSha.slice(0, 7);
  const appUrl = input.dashboardUrl || process.env.NEXT_PUBLIC_APP_URL || "https://protocolzero.dev";

  const severityColors: Record<IssueSeverity, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
    info: "#6b7280",
  };

  const severityBgColors: Record<IssueSeverity, string> = {
    critical: "rgba(239, 68, 68, 0.15)",
    high: "rgba(249, 115, 22, 0.15)",
    medium: "rgba(234, 179, 8, 0.15)",
    low: "rgba(59, 130, 246, 0.15)",
    info: "rgba(107, 114, 128, 0.15)",
  };

  const severityEmoji: Record<IssueSeverity, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🔵",
    info: "ℹ️",
  };

  // Total issues
  const totalIssues = Object.values(run.issueCounts).reduce((a, b) => a + b, 0);
  const hasIssues = totalIssues > 0;

  /**
   * Format code snippet with VS Code-style dark theme
   */
  const formatCodeSnippet = (snippet: string | undefined): string => {
    if (!snippet) return '';

    // Escape HTML entities
    const escaped = snippet
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `
      <div style="margin-top: 12px; border-radius: 8px; overflow: hidden; border: 1px solid #3c3c3c;">
        <div style="background-color: #252526; padding: 8px 12px; border-bottom: 1px solid #3c3c3c;">
          <span style="color: #858585; font-size: 11px; font-family: 'SF Mono', Consolas, monospace;">Code Snippet</span>
        </div>
        <pre style="margin: 0; padding: 12px 16px; background-color: #1e1e1e; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;"><code style="color: #d4d4d4; font-size: 12px; font-family: 'SF Mono', 'Fira Code', Consolas, 'Courier New', monospace; line-height: 1.5;">${escaped}</code></pre>
      </div>
    `;
  };

  // Generate detailed issue cards with code snippets
  const issueCards = issues
    .slice(0, 8) // Limit to 8 detailed issues in email for brevity
    .map(
      (issue) => `
        <div style="background-color: #18181b; border: 1px solid #27272a; border-left: 4px solid ${severityColors[issue.severity]}; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 700; color: ${severityColors[issue.severity]}; background-color: ${severityBgColors[issue.severity]}; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${severityEmoji[issue.severity]} ${issue.severity}
                </span>
                <span style="color: #52525b; font-size: 11px; margin-left: 8px; text-transform: capitalize;">${issue.category}</span>
              </td>
            </tr>
          </table>
          <h3 style="color: #fafafa; font-size: 14px; font-weight: 600; margin: 12px 0 8px 0; line-height: 1.4;">
            ${issue.message}
          </h3>
          <p style="color: #71717a; font-size: 12px; margin: 0 0 8px 0; font-family: 'SF Mono', Consolas, monospace; word-break: break-all;">
            📁 ${issue.filePath}:${issue.line}${issue.endLine ? `-${issue.endLine}` : ''}
          </p>
          <p style="color: #a1a1aa; font-size: 13px; line-height: 1.5; margin: 0;">
            ${issue.explanation}
          </p>
          ${formatCodeSnippet(issue.codeSnippet)}
          ${issue.suggestedFix ? `
            <div style="margin-top: 12px; padding: 12px; background-color: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.25); border-radius: 6px;">
              <p style="color: #4ade80; font-size: 12px; margin: 0; line-height: 1.5;">
                <strong>💡 Fix:</strong> ${issue.suggestedFix}
              </p>
            </div>
          ` : ''}
        </div>
      `
    )
    .join("");

  // Generate diff summary section if available
  const diffSection = input.diffSummary ? `
    <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <h2 style="color: #fafafa; font-size: 16px; margin: 0 0 16px 0; font-weight: 600;">
        📊 Changes Overview
      </h2>
      <table width="100%" border="0" cellpadding="0" cellspacing="8">
        <tr>
          <td style="background-color: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.25); border-radius: 8px; padding: 12px; text-align: center; width: 33%;">
            <div style="color: #4ade80; font-weight: 700; font-size: 20px;">+${input.diffSummary.totalAdditions}</div>
            <div style="color: #71717a; font-size: 11px; margin-top: 4px;">additions</div>
          </td>
          <td style="background-color: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.25); border-radius: 8px; padding: 12px; text-align: center; width: 33%;">
            <div style="color: #f87171; font-weight: 700; font-size: 20px;">-${input.diffSummary.totalDeletions}</div>
            <div style="color: #71717a; font-size: 11px; margin-top: 4px;">deletions</div>
          </td>
          <td style="background-color: rgba(167, 139, 250, 0.1); border: 1px solid rgba(167, 139, 250, 0.25); border-radius: 8px; padding: 12px; text-align: center; width: 33%;">
            <div style="color: #a78bfa; font-weight: 700; font-size: 20px;">${input.diffSummary.totalFiles}</div>
            <div style="color: #71717a; font-size: 11px; margin-top: 4px;">files</div>
          </td>
        </tr>
      </table>
      <p style="color: #a1a1aa; font-size: 13px; margin: 16px 0 0 0; line-height: 1.5;">
        ${input.diffSummary.summary}
      </p>
    </div>
  ` : '';

  // Generate commit message section if available
  const commitMessageSection = input.commitMessage ? `
    <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <h2 style="color: #fafafa; font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">
        💬 Commit
      </h2>
      <p style="color: #e4e4e7; line-height: 1.5; margin: 0; font-size: 14px;">
        "${input.commitMessage.split('\n')[0]}"
      </p>
      ${input.commitMessage.includes('\n') ? `
        <p style="color: #71717a; font-size: 12px; margin: 8px 0 0 0; line-height: 1.5;">
          ${input.commitMessage.split('\n').slice(1).join('<br>')}
        </p>
      ` : ''}
    </div>
  ` : '';

  // Generate Fix with PR button - prominent call to action
  const fixWithPrSection = (hasIssues && input.projectId) ? `
    <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15)); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 24px; margin-bottom: 20px; text-align: center;">
      <h3 style="color: #10b981; font-size: 18px; margin: 0 0 8px 0; font-weight: 600;">
        🔧 Auto-Fix Available
      </h3>
      <p style="color: #a1a1aa; font-size: 13px; margin: 0 0 16px 0; line-height: 1.5;">
        We can automatically fix some of these issues and create a pull request for you.
      </p>
      <a href="${appUrl}/dashboard/code-police/${input.projectId}?action=fix&runId=${run.id}" 
         style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
        Fix Issues with PR →
      </a>
    </div>
  ` : '';

  // Issue count stats for header
  const statsSection = `
    <table width="100%" border="0" cellpadding="4" cellspacing="0" style="margin-bottom: 20px;">
      <tr>
        ${Object.entries(run.issueCounts)
      .map(
        ([severity, count]) => `
              <td style="background-color: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 18px; font-weight: 700; color: ${severityColors[severity as IssueSeverity]};">
                  ${count}
                </div>
                <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">
                  ${severity}
                </div>
              </td>
            `
      )
      .join("")}
      </tr>
    </table>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Code Police Report</title>
        <!--[if mso]>
        <noscript>
          <xml>
            <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
          </xml>
        </noscript>
        <![endif]-->
        <style>
          /* Reset styles */
          body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
          
          /* Mobile styles */
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; padding: 16px !important; }
            .mobile-padding { padding: 12px !important; }
            .mobile-text { font-size: 13px !important; }
            .mobile-hide { display: none !important; }
            .stats-cell { padding: 8px !important; }
            .stats-value { font-size: 16px !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        
        <!-- Wrapper Table -->
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #09090b;">
          <tr>
            <td align="center" style="padding: 40px 16px;">
              
              <!-- Main Container -->
              <table role="presentation" class="container" width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
                
                <!-- Logo Header -->
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          ${GHOST_LOGO_SVG}
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top: 12px;">
                          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #a78bfa;">
                            Protocol Zero
                          </h1>
                          <p style="margin: 4px 0 0 0; font-size: 13px; color: #71717a; font-weight: 500;">
                            Code Police Report
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Status Banner -->
                <tr>
                  <td>
                    <div style="background: ${hasIssues ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(249, 115, 22, 0.1))' : 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(16, 185, 129, 0.1))'}; border: 1px solid ${hasIssues ? 'rgba(239, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.2)'}; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
                      <h2 style="margin: 0 0 8px 0; font-size: 20px; color: ${hasIssues ? '#f87171' : '#4ade80'}; font-weight: 600;">
                        ${hasIssues ? `${totalIssues} Issue${totalIssues > 1 ? 's' : ''} Found` : '✨ All Clear!'}
                      </h2>
                      <p style="margin: 0; color: #a1a1aa; font-size: 13px;">
                        ${repoName} • ${run.branch} • <a href="${commitUrl}" style="color: #a78bfa; text-decoration: none;">${commitShort}</a>
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Stats Grid -->
                <tr>
                  <td>
                    ${statsSection}
                  </td>
                </tr>

                <!-- Fix with PR Section -->
                <tr>
                  <td>
                    ${fixWithPrSection}
                  </td>
                </tr>

                <!-- Commit Message -->
                <tr>
                  <td>
                    ${commitMessageSection}
                  </td>
                </tr>

                <!-- Diff Summary -->
                <tr>
                  <td>
                    ${diffSection}
                  </td>
                </tr>

                <!-- AI Summary -->
                <tr>
                  <td>
                    <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                      <h2 style="color: #fafafa; font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">
                        🤖 AI Analysis
                      </h2>
                      <p style="color: #d4d4d8; line-height: 1.6; margin: 0; font-size: 14px;">
                        ${summary.replace(/\\n/g, "<br>")}
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Issues List -->
                ${issues.length > 0 ? `
                  <tr>
                    <td>
                      <h2 style="color: #fafafa; font-size: 16px; margin: 0 0 16px 0; font-weight: 600;">
                        🔍 Issues Breakdown
                      </h2>
                      ${issueCards}
                      ${issues.length > 8 ? `
                        <div style="padding: 16px; text-align: center; color: #71717a; font-size: 13px; background-color: #18181b; border: 1px solid #27272a; border-radius: 8px; margin-bottom: 20px;">
                          <strong>+ ${issues.length - 8} more issues</strong>
                          <br>
                          <a href="${appUrl}/dashboard/code-police/${input.projectId || ''}" style="color: #a78bfa; text-decoration: none;">View full report on dashboard →</a>
                        </div>
                      ` : ""}
                    </td>
                  </tr>
                ` : `
                  <tr>
                    <td>
                      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 40px; text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                        <h3 style="color: #4ade80; margin: 0 0 8px 0; font-size: 18px;">Great Job!</h3>
                        <p style="color: #71717a; margin: 0; font-size: 14px;">No issues found in this commit. Your code looks clean!</p>
                      </div>
                    </td>
                  </tr>
                `}

                <!-- CTA Buttons -->
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding-right: 12px;">
                          <a href="${appUrl}/dashboard/code-police/${input.projectId || ''}" 
                             style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
                            View Dashboard
                          </a>
                        </td>
                        <td>
                          <a href="${commitUrl}" 
                             style="display: inline-block; padding: 12px 24px; background-color: #27272a; border: 1px solid #3f3f46; color: #e4e4e7; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">
                            View Commit
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding-top: 32px; border-top: 1px solid #27272a;">
                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <p style="margin: 0 0 8px 0; color: #52525b; font-size: 12px;">
                            Sent by <a href="https://protocolzero.dev" style="color: #a78bfa; text-decoration: none; font-weight: 500;">Protocol Zero</a> Code Police
                          </p>
                          <p style="margin: 0; color: #3f3f46; font-size: 11px;">
                            ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
