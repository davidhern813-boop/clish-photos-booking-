# Clish Photos — Client Booking & Receipt System

This is a ready-to-deploy full-stack booking/payment-confirmation system based on the package information supplied for Clish Photos.

## Included packages
- Regular — ₦200,000
- Silver — ₦325,000
- Gold — ₦420,000
- Platinum — ₦510,000
- Diamond — ₦1,405,000

## Payment
Bank: PALMPAY
Account Name: EDIOMO EDDY EDUOK
Account Number: 7016040813

The client submits their transfer information, but a receipt is NOT generated as confirmed until an administrator verifies the bank transfer.

## Admin
Default PIN supplied for this build: 3238

For deployment, set an environment variable:
ADMIN_PIN=your-new-pin

## Run locally
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:
   npm install
   npm start
4. Open:
   http://localhost:3000

## Deployment
Deploy this Node/Express application to a service that supports persistent storage. SQLite is used for the prototype; for multi-instance production hosting, move the database to PostgreSQL or another managed database.

## Security
Do not expose the admin PIN in frontend JavaScript. The PIN is checked server-side through /api/admin endpoints.
For a public production deployment, use HTTPS and change the default PIN immediately.


## Production version
This version uses PostgreSQL via the `DATABASE_URL` environment variable, suitable for Render + Supabase. The database table is created automatically. Do not use the original SQLite version for public deployment because Render's free filesystem is ephemeral.


## Payment receipt upload
Clients submit an uploaded PalmPay payment receipt instead of a transfer reference. Admin reviews the uploaded receipt and confirms payment before a receipt is generated.
