import { transporter } from "../config/mail.js";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_FROM) {
    console.warn("SMTP is not configured. Skipping email delivery.");
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}
