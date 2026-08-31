# Free deployment: Render + Supabase

## 1. Create the database
Create a Supabase project on the Free plan and copy its Postgres connection string.

Use the database connection string as `DATABASE_URL`.

## 2. Create a Storage bucket for payment receipts
In the same Supabase project, go to **Storage** and create a new bucket named `receipts`.
- Leave it **Private** (do not make it public) — receipts contain client payment details.
- No policies need to be added manually: the server talks to Storage using the service role key, which bypasses Row Level Security.

Then go to **Project Settings → API** and copy:
- The **Project URL** → this is `SUPABASE_URL`.
- The **service_role** key (not the `anon` key — keep this secret, never put it in frontend code) → this is `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Put this folder in GitHub
Create a new GitHub repository and upload all files in this folder, including:
- server.js
- package.json
- render.yaml
- public/index.html

Do NOT upload passwords or a `.env` file.

## 4. Deploy on Render
Create a Render Web Service and connect the GitHub repository.

Settings:
- Runtime: Node
- Build Command: npm install
- Start Command: npm start
- Plan: Free

Environment variables:
- NODE_ENV = production
- ADMIN_PIN = choose a new private PIN
- DATABASE_URL = your Supabase Postgres connection string
- SUPABASE_URL = your Supabase project URL
- SUPABASE_SERVICE_ROLE_KEY = your Supabase service_role key
- SUPABASE_RECEIPTS_BUCKET = receipts (or the bucket name you chose)

The app creates its `orders` table automatically on first start.

## 5. Test
Open your Render URL.
Then test:
1. Choose a package.
2. Submit a test booking.
3. Open Admin.
4. Enter the new PIN.
5. Confirm the test payment.
6. View/print the receipt.

## Important
The Free Render web service can sleep after 15 minutes of inactivity, so the first visit after inactivity can take about a minute.
Supabase Free currently includes a 500 MB Postgres database but may pause after inactivity. Check the current Supabase terms before relying on it for long-term business records.

For real production use, upgrade the database/hosting once the booking system becomes business-critical.


## Payment receipt upload
Clients no longer enter a transfer reference. They must upload a PalmPay payment receipt (image or PDF, max 5 MB). Uploaded receipts are stored in the private Supabase Storage bucket, not on the Render filesystem, so they survive restarts and redeploys. The admin dashboard requests a short-lived (5-minute) signed link to view a receipt for manual verification before confirmation — the bucket itself is never made public.
