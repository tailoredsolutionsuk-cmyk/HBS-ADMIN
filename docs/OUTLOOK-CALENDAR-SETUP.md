# HBS CRM Outlook Calendar setup

The Calendar tab displays due client tasks immediately. Outlook appointments
remain unavailable until the CRM owner completes Microsoft consent. The
connection is read-only and available only to the `owner` role.

1. In [Microsoft Entra](https://entra.microsoft.com/), open **Entra ID → App registrations → New registration**. Name it `HBS Admin Calendar`.
2. Choose **Any Entra ID tenant + personal Microsoft accounts** so the sign-in works whether the HBS mailbox is Microsoft 365 or a personal Outlook account. The CRM uses Microsoft's `common` authority.
3. Under **Authentication**, add a **Web** redirect URI exactly:
   `https://www.hbsmarketing.online/api/admin/calendar/callback`
4. Under **API permissions**, add delegated Microsoft Graph permissions `Calendars.Read` and `User.Read`. The sign-in also requests `offline_access` to keep the connection active. No write permission is requested.
5. Under **Certificates & secrets**, create a client secret. Copy the **Value**, not the secret ID. Do not paste it in chat or commit it to Git.
6. In the existing **hbs-admin** Vercel project, add `OUTLOOK_CLIENT_ID` as Config and `OUTLOOK_CLIENT_SECRET` as Secret, both scoped to Production. `OUTLOOK_REDIRECT_URI` and `OUTLOOK_TOKEN_ENCRYPTION_KEY` are already prepared in Production. Never prefix any of these with `NEXT_PUBLIC_`.
7. Redeploy the CRM after adding the environment variables. Sign in as the CRM owner, open **Calendar → Connect Outlook**, and choose the intended Microsoft account. Check that the expected email and appointments appear. If your organisation requires admin consent, its Microsoft administrator must approve the delegated permissions.

The HBS Supabase project has the `outlook_calendar_connections` table with RLS
enabled and no client grants. OAuth tokens are AES-256-GCM encrypted before
storage. Disconnecting removes the stored tokens; reconnecting requires a new
Microsoft consent flow. If the Vercel encryption key is lost or changed,
existing connections cannot be decrypted and must be reconnected.
