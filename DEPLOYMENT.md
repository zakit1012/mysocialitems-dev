# Deploying WidgetPop

| Host                  | What it serves                               | Runs on                  |
| --------------------- | -------------------------------------------- | ------------------------ |
| `widgetpop.com`       | Home page, pricing, terms, privacy, refunds  | Next.js (`frontend/`)    |
| `app.widgetpop.com`   | Sign in, sign up, the dashboard, invoices    | the same Next.js server  |
| `admin.widgetpop.com` | The super admin panel                        | the same Next.js server  |
| `api.widgetpop.com`   | The API, `widget.js` and payment webhooks    | NestJS (`backend/`)      |
| `www.widgetpop.com`   | Redirects to `widgetpop.com`                 | the same Next.js server  |

One Next.js server answers all four website hosts. `frontend/src/proxy.ts`
sends each page to its own host: `widgetpop.com/login` goes to
`app.widgetpop.com/login`, `app.widgetpop.com/terms` goes back to
`widgetpop.com/terms`, and so on.

A sign-in belongs to one host. Customers sign in on `app.`; admins sign in
once more on `admin.`.

## 1. DNS

Point all five names at the server:

| Type | Name    | Value          |
| ---- | ------- | -------------- |
| A    | `@`     | your server IP |
| A    | `www`   | your server IP |
| A    | `app`   | your server IP |
| A    | `admin` | your server IP |
| A    | `api`   | your server IP |

## 2. Environment

`backend/.env` (only the lines that change for the domains):

```
NODE_ENV=production
TRUST_PROXY=true
FRONTEND_URL=https://widgetpop.com
SITE_URL=https://widgetpop.com
APP_URL=https://app.widgetpop.com
ADMIN_URL=https://admin.widgetpop.com
PUBLIC_API_URL=https://api.widgetpop.com
SMTP_HOST=mail.widgetpop.com
SMTP_PORT=587
SMTP_USER=support@widgetpop.com
SMTP_PASS="<the mailbox password>"
SMTP_FROM="WidgetPop <support@widgetpop.com>"
```

Each setting is one `NAME=value` line (not `SMTP Host: ...` as the mail panel
shows it), and the password stays in double quotes: an unquoted `#` starts a
comment and cuts it off.

`SMTP_FROM` must be the same mailbox as `SMTP_USER`: most mail servers refuse
to send as any other address. After `pm2 restart`, the backend log says
`SMTP ready` or `SMTP check failed: <reason>`. **Admin → Emails** shows the
same, every email sent with the mail server's answer, and a test-email button.

`frontend/.env`:

```
NEXT_PUBLIC_SITE_URL=https://widgetpop.com
NEXT_PUBLIC_APP_URL=https://app.widgetpop.com
NEXT_PUBLIC_ADMIN_URL=https://admin.widgetpop.com
NEXT_PUBLIC_API_URL=https://api.widgetpop.com
```

`NEXT_PUBLIC_` values are built into the pages. Run `npm run build` in
`frontend/` again after changing any of them.

## 3. nginx

Put this in a new file, `/etc/nginx/conf.d/widgetpop.conf`. Leave the
config of any old domain in place: widgets pasted on customer sites
still load from the old API address.

Use the same ports the app already runs on. Look them up in the old
config (`sudo grep -rn "server_name\|proxy_pass" /etc/nginx/conf.d/`):
`FRONTEND_PORT` is the Next.js one, `BACKEND_PORT` the API's `PORT`.

Start with plain http; certbot adds https in the next step. A
`listen 443 ssl` block without a certificate fails `nginx -t`.

```nginx
# Website: widgetpop.com, www., app. and admin.
server {
    listen 80;
    server_name widgetpop.com www.widgetpop.com app.widgetpop.com admin.widgetpop.com;

    location / {
        proxy_pass http://127.0.0.1:FRONTEND_PORT;
        # The site sends each page to its own host, so it must see the
        # host the visitor typed.
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# API
server {
    listen 80;
    server_name api.widgetpop.com;

    location / {
        proxy_pass http://127.0.0.1:BACKEND_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Rate limiting reads the visitor's IP from this (TRUST_PROXY=true).
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```
sudo nginx -t && sudo systemctl reload nginx
```

## 4. HTTPS

Once `ping app.widgetpop.com` (and the other names) answer with the
server's IP, get one certificate for every name. certbot adds the https
blocks to the file above; say yes when it offers to redirect http to https.

```
sudo certbot --nginx -d widgetpop.com -d www.widgetpop.com -d app.widgetpop.com -d admin.widgetpop.com -d api.widgetpop.com
```

## 5. After it is live

- **Dodo Payments**: set the webhook URL to the one shown in Admin → Dodo
  Payments (it uses `PUBLIC_API_URL`, so `https://api.widgetpop.com/...`).
- **Google Maps browser key**: allow `https://app.widgetpop.com/*` and
  `https://widgetpop.com/*`.
- **Email**: add the SPF and DKIM records your mail provider gives you for
  `widgetpop.com`, or mail from `noreply@widgetpop.com` lands in spam.
- **Google Search Console**: add `widgetpop.com` as a *Domain* property
  (verified with a DNS TXT record; it covers every subdomain), then submit
  `https://widgetpop.com/sitemap.xml`.
- **Legal details**: fill in the blanks in `frontend/src/lib/legal.ts`
  (owner, address, email, grievance officer, city).
- **Old embed snippets**: widgets that customers pasted before the move load
  `widget.js` from the old API address. Keep that address pointing at the
  API, or redirect it to `api.widgetpop.com`, until they are updated.

## Admin 2-step sign-in

The admin panel asks for a code from Google Authenticator (or any
authenticator app) after the password, again every 12 hours. The first
visit shows a QR code to scan. The admin API refuses every call without a
recent code, and each admin change is written to the log as
`[AdminAudit] who METHOD /path from IP` (`pm2 logs <backend-name>`).

Lost the phone? On the server, from `backend/`:

```
node make-admin.js --reset-2fa you@example.com
```

The next visit to the admin panel sets the app up again.

## What search engines see

- `widgetpop.com`: every page indexed. The sitemap is at `/sitemap.xml`.
- `app.widgetpop.com`: sign in and sign up can be indexed. The dashboard and
  invoices send `noindex`, both as a meta tag and as an `X-Robots-Tag`
  header, so they never show in results.
- `admin.widgetpop.com`: `robots.txt` blocks everything.

## Updating the server

After merging to `main`:

```
cd ~/mysocialitems && git pull
cd backend
npm ci --include=dev     # NODE_ENV=production would skip the build tools
npx prisma db push       # applies schema changes; safe when there are none
npm run build
cd ../frontend
npm ci --include=dev
npm run build
pm2 list                 # find WidgetPop's two apps
pm2 restart <backend-name> <frontend-name>   # not "all": other apps may share the server
```
