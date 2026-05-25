export function emailLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#111827;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Hygiene Hub</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">Confidence in Every Glow</p>
    </div>
    <div style="padding:32px 24px;">
      ${content}
    </div>
    <div style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#6b7280;font-size:12px;">&copy; ${new Date().getFullYear()} Hygiene Hub. All rights reserved.</p>
      <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">Questions? Contact us at info@hygienhub.com</p>
    </div>
  </div>
</body>
</html>`
}
