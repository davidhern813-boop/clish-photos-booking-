# Free deployment: Render + Supabase (database only)

## 1. Create the database
Create a Supabase project on the Free plan and copy its Postgres connection string
(use the "Transaction pooler" connection string, which works over standard IPv4 —
required for Render's free plan). Use it as `DATABASE_URL`.

Note: this version no longer uses Supabase Storage. Clients send their payment
proof directly to you on WhatsApp instead of uploading a file, so no storage
bucket or service_role key is needed.

## 2. Put this folder in GitHub
Create a new GitHub repository and upload all files in this folder, including:
- server.js
- package.json
- render.yaml
- public/index.html

Do NOT upload passwords or a `.env` file.

## 3. Deploy on Render
Create a Render Web Service and connect the GitHub repository.

Settings:
- Runtime: Node
- Build Command: npm install
- Start Command: npm start
- Plan: Free

Environment variables:
- NODE_ENV = production
- ADMIN_PIN = choose a new private PIN
- DATABASE_URL = your Supabase Postgres pooler connection string
- WHATSAPP_NUMBER = your WhatsApp number in international format with no + or spaces (e.g. 2347016040813)

The app creates its `orders` table automatically on first start.

## 4. Test
Open your Render URL.
Then test:
1. Choose a package.
2. Submit a test booking.
3. Click "Send payment proof on WhatsApp" and confirm it opens a chat with your number.
4. Open Admin.
5. Enter the new PIN.
6. Confirm the test payment.
7. View/print the receipt.

## Important
The Free Render web service can sleep after 15 minutes of inactivity, so the first visit after inactivity can take about a minute.
Supabase Free currently includes a 500 MB Postgres database but may pause after inactivity. Check the current Supabase terms before relying on it for long-term business records.

For real production use, upgrade the database/hosting once the booking system becomes business-critical.
