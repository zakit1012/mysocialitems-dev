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
SMTP_FROM=WidgetPop <noreply@widgetpop.com>
```

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

The Next.js server must see the host the visitor typed, so pass `Host`
through. The API needs `X-Forwarded-For` for rate limiting (with
`TRUST_PROXY=true`).

```nginx
# Website: widgetpop.com, www., app. and admin.
server {
    listen 443 ssl;
    server_name widgetpop.com www.widgetpop.com app.widgetpop.com admin.widgetpop.com;
    # ssl_certificate / ssl_certificate_key: see step 4

    location / {
        proxy_pass http://127.0.0.1:3000;   # next start (default port 3000)
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# API
server {
    listen 443 ssl;
    server_name api.widgetpop.com;

    location / {
        proxy_pass http://127.0.0.1:3001;   # backend PORT
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Plain http -> https
server {
    listen 80;
    server_name widgetpop.com www.widgetpop.com app.widgetpop.com admin.widgetpop.com api.widgetpop.com;
    return 301 https://$host$request_uri;
}
```

## 4. HTTPS

One certificate for every name:

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

## What search engines see

- `widgetpop.com`: every page indexed. The sitemap is at `/sitemap.xml`.
- `app.widgetpop.com`: sign in and sign up can be indexed. The dashboard and
  invoices send `noindex`, both as a meta tag and as an `X-Robots-Tag`
  header, so they never show in results.
- `admin.widgetpop.com`: `robots.txt` blocks everything.
