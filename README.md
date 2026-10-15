# Meemu Move

Book a ride or hire a vessel across Meemu Atoll: Dhiggaru, Maduvvari, Raiymandhoo, Veyvah, Mulah, Muli, Naalaafushi and Kolhufushi.
Built on Cloudflare Workers + D1, with the code in GitHub.

| Page | Address |
|---|---|
| Rider app | `/` |
| Driver app | `/driver.html` |
| Driver and captain registration | `/register.html` |
| Admin dashboard | `/admin.html` |

## Repo layout
```
meemu-move/
├── .gitignore
├── README.md
├── wrangler.toml        Cloudflare config (paste your D1 database_id here)
├── schema.sql           database tables, places, ride types
├── src/
│   └── worker.js        backend API
└── public/
    ├── index.html  driver.html  admin.html  register.html
    ├── logo.svg  icon-192.png  icon-512.png  manifest.webmanifest
```

## Setup
1. **GitHub:** create a repo named `meemu-move` and upload these files, keeping `src/` and `public/` as folders.
2. **Database:** Cloudflare dashboard > Storage & Databases > D1 > Create database named `meemu-move`. Copy its Database ID into `wrangler.toml` (`database_id`) and commit. (CLI: `npx wrangler d1 create meemu-move`.)
3. **Tables:** open the database > Console, paste all of `schema.sql` and run it. (CLI: `npx wrangler d1 execute meemu-move --remote --file=schema.sql`.)
4. **Deploy:** Workers & Pages > Create > Import a repository > pick `meemu-move`. Leave the build command empty. The Worker name must match `name` in `wrangler.toml` (`meemu-move`).
5. **Secrets** (Worker > Settings > Variables and Secrets; never put these in GitHub):
   - `AUTH_SECRET` and `ADMIN_KEY`: long random strings. `ADMIN_KEY` is your admin password.
   - SMS, one of: Twilio (`TWILIO_SID`, `TWILIO_TOKEN`, and `TWILIO_FROM` or `TWILIO_MSG_SERVICE`) or a local gateway (`SMS_WEBHOOK_URL`, optional `SMS_WEBHOOK_TOKEN`; the Worker POSTs `{"to":"+9607xxxxxxx","text":"..."}`).
   - Bot check: create a free Turnstile widget. Put the site key in `CFG.turnstileKey` (`public/index.html`) and `TS_KEY` (`public/register.html`), and add the secret as `TURNSTILE_SECRET`.
   - Testing without SMS: set the variable `DEV_OTP` to `1` (the code shows on screen). Delete it before going live.
6. **Domain:** Worker > Settings > Domains & Routes > add your custom domain.
7. **Fill in the data** at `/admin.html` (sign in with `ADMIN_KEY`):
   - Vehicles: set your real fares (the seeded fares are placeholders, especially boats).
   - Places: pick each place and tap the map where it is. Riders only see places that have a location.
   - Drivers: add drivers, or let people register and approve them.
8. **Test** a full ride on two phones (instant, scheduled, and a boat trip between islands), then go live.

Each push to GitHub redeploys the app.

## How it works
- **Booking:** pickup and drop-off come from island-grouped places, "Choose on map" or "My location". Same island: land vehicles. Different islands: boats and vessels. Ride now, or Book for later (10 minutes to 30 days ahead, up to 5 upcoming). A note field carries hire details. Fares are calculated on the server (base + per km x distance, never below the minimum).
- **Tracking:** riders see the driver's position (polled every 3 seconds). The pin and driver marker show the ride type's icon.
- **Login:** riders sign in with a 6-digit SMS code. Drivers sign in with ID and PIN (PINs are stored hashed). Admin signs in with `ADMIN_KEY`.
- **Registration:** `/register.html` collects name, mobile, island, ID card number, licence number and expiry, ride type, vehicle or vessel details, seats, experience and three photos. In admin > Applications you review and Approve or Reject. Approving creates the driver (Driver ID is their mobile number, plus a random 6-digit PIN sent by SMS and shown once). Applications hold sensitive data: only the admin can read them, so delete records you no longer need and follow your local data-protection rules.
- **Admin:** Drivers, Rides (cancel stuck rides), Places, Vehicles (ride types and fares, land or boat), Applications.

## Map
Default is OpenStreetMap (free, no card) with a Satellite layer (Esri; check their terms). The start view shows the whole atoll (`CFG.center` and `CFG.zoom` in `public/index.html`). For Google, set `provider:'google'` and `googleKey`, and restrict the key to your domain.

## Logo and install
`public/logo.svg` is the logo. Replace it, `icon-192.png` and `icon-512.png` with your own artwork anytime. `manifest.webmanifest` lets riders add the app to their home screen.
