# Email templates

Supabase writes the sign-in emails from these templates. Paste each one into
the Supabase dashboard under **Authentication → Emails → Templates**:

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm signup | `first-sign-in.html` | Your Family Tree sign-in |
| Magic Link | `sign-in.html` | Your Family Tree sign-in |
| Change Email Address | `keep-your-access.html` | Confirm your email for the Family Tree |

"Confirm signup" is used the first time an email address signs in; "Magic
Link" every time after. "Change Email Address" is sent when a guest uses
"Keep your access: add your email".
