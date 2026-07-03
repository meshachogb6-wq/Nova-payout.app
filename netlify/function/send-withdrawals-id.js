

```js
// Netlify Function: send-withdrawal-id
// Env vars required in Netlify:
// - RESEND_API_KEY
// - FROM_EMAIL (e.g. "NovaPayout <no-reply@yourdomain.com>")  [optional]
// - SITE_NAME (optional)

function randomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums = "23456789";
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  // AAA-AAAAAA
  return `${pick(letters)}${pick(letters)}${pick(letters)}-${pick(letters)}${pick(nums)}${pick(letters)}${pick(nums)}${pick(letters)}${pick(nums)}`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const { toEmail, userName } = body;

    if (!toEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing toEmail" }) };
    }

    const code = randomCode();
    const minutesValid = 10;
    const siteName = process.env.SITE_NAME || "NovaPayout";
    const fromEmail = process.env.FROM_EMAIL || `${siteName} <onboarding@resend.dev>`;

    const subject = `Your ${siteName} Withdrawal ID (Valid for ${minutesValid} Minutes)`;

    const html =
      `<h3>Your Withdrawal ID</h3>` +
      `<p>Dear ${userName || "User"}, your ${siteName} Withdrawal ID is <b>${code}</b>.</p>` +
      `<p>Please use before ${minutesValid} minutes.</p>` +
      `<p>Thanks — ${siteName} Family</p>`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      }),
    });

    const resendData = await resendResp.json();

    if (!resendResp.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Resend failed", details: resendData }),
      };
    }

    // Return code so your admin panel can also display it (optional)
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        code,
        minutesValid,
        resend: resendData,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
```

