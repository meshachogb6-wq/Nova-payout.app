

```js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { toEmail, userName } = req.body || {};
    if (!toEmail) return res.status(400).json({ error: "Missing toEmail" });

    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const nums = "23456789";
    const pick = (s) => s[Math.floor(Math.random() * s.length)];
    const code = `${pick(letters)}${pick(letters)}${pick(letters)}-${pick(letters)}${pick(nums)}${pick(letters)}${pick(nums)}${pick(letters)}${pick(nums)}`;

    const minutesValid = 10;
    const siteName = process.env.SITE_NAME || "NovaPayout";
    const fromEmail = process.env.FROM_EMAIL || `${siteName} <onboarding@resend.dev>`;
    const subject = `Your ${siteName} Withdrawal ID (Valid for ${minutesValid} Minutes)`;

    const html =
      `<h3>Your Withdrawal ID</h3>` +
      `<p>Dear ${userName || "User"}, your ${siteName} Withdrawal ID is <b>${code}</b>.</p>` +
      `<p>Please use before ${minutesValid} minutes.</p>` +
      `<p>Thanks — ${siteName} Family</p>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, html }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: "Resend failed", details: data });

    return res.status(200).json({ ok: true, code, minutesValid, resend: data });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
```

