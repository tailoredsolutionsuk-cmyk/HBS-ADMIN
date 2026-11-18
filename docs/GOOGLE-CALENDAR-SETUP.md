# HBS owner Google Calendar

The Calendar tab displays the owner's primary Google Calendar next to dated client tasks. The selected account is `tailoredsolutionsuk@gmail.com`. Appointments are read-only, and server routes require the existing CRM `owner` role. Client portal access and Google Sheets imports are unchanged.

## Google Cloud setup

Use the OAuth web application already used by HBS Google Sheets, or create a separate Calendar OAuth web application. In the matching Cloud project, enable Google Calendar API. Add this exact authorized redirect URI to the OAuth web client without removing existing URIs:

`https://www.hbsmarketing.online/api/admin/calendar/google/callback`

Include the read-only `https://www.googleapis.com/auth/calendar.events.readonly` scope in the Google Auth Platform data access configuration. The connection also requests `openid email` to confirm the selected account. A user must explicitly approve calendar access. If the consent app is External and Testing, keep `tailoredsolutionsuk@gmail.com` as an approved test user. Google Testing refresh tokens normally expire after seven days for Calendar permissions, requiring reconnect. A lasting production connection requires the applicable Google publishing/verification process.

## Server configuration

Optional dedicated settings are `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`, and `GOOGLE_CALENDAR_ACCOUNT_EMAIL`.

When neither dedicated client setting is present, the server uses the existing `GOOGLE_SHEETS_CLIENT_ID` and `GOOGLE_SHEETS_CLIENT_SECRET`. The encryption source falls back to `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` with an HKDF-derived Calendar-specific key. No Sheets access token is reused. The redirect and expected email default to the production callback above and `tailoredsolutionsuk@gmail.com`. Partial dedicated client settings are rejected.

Apply `db/google-calendar.sql` to the existing HBS Supabase database. It creates server-only encrypted token storage with RLS enabled and explicit grants only to `service_role`. Do not put any credentials in `NEXT_PUBLIC_` variables or Git. Do not replace existing encryption keys. Environment changes require a new deployment.

## Connect and verify

After deployment, sign in as the CRM owner, open Calendar, and click Connect Google Calendar. Select `tailoredsolutionsuk@gmail.com` and approve read-only event access. The callback rejects other accounts or missing calendar permission. Verify the displayed account and compare a real appointment, all-day event and recurring event against Google Calendar. Refresh or change the month to fetch updated events.

Times display in Europe/London, with Monday-first weeks. Multi-day appointments appear on each covered visible day. Google events remain private to the CRM owner and are fetched on demand rather than stored as CRM activities. Disconnect deletes the Calendar connection only. It does not delete events or revoke the shared Google app's Sheets grant. No event creation, editing, invitations, background synchronization, shared-calendar selection or Outlook-to-Google migration is included.

## Official references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
