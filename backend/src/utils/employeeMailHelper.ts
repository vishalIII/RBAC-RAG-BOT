import { sendEmail } from "./sendEmail.js";

export async function sendEmployeeCredentials(
  email: string,
  password: string
) {
  await sendEmail({
    to: email,
    subject: "Your Account Credentials",

    html: `
      <h2>Welcome</h2>

      <p>Your account has been created.</p>

      <p>
        <strong>Email:</strong> ${email}
      </p>

      <p>
        <strong>Temporary Password:</strong> ${password}
      </p>

      <p>
        You will be asked to change your password
        after login.
      </p>
    `,
  });
}