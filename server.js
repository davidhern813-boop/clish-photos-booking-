const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Receipts are held in memory only long enough to stream them to Supabase
// Storage — nothing is written to the local disk, which is wiped on every
// restart/redeploy on Render's free plan.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "CHANGE-ME";
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECEIPTS_BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || "receipts";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for receipt storage.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// Service-role key — used server-side only, never sent to the browser.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const packages = {
  Regular: 200000,
  Silver: 325000,
  Gold: 420000,
  Platinum: 510000,
  Diamond: 1405000
};

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      receipt_no TEXT UNIQUE,
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      event_date DATE NOT NULL,
      location TEXT NOT NULL,
      package_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_reference TEXT,
      payment_receipt TEXT,
      payment_amount INTEGER,
      payment_date DATE,
      payment_note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ
    );
  `);
}

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, "public")));
// Note: no more app.use("/uploads", ...) — receipts are no longer served
// from local disk. They live in a private Supabase Storage bucket and are
// only ever accessed through the signed-URL admin endpoint below.

app.get("/api/packages", (_, res) => res.json(packages));

app.post("/api/orders", upload.single("payment_receipt"), async (req,res) => {
  try {
    const {client_name, phone, email, event_date, location, package_name, payment_amount, payment_date, payment_note} = req.body;
    if (!client_name || !phone || !event_date || !location || !packages[package_name]) {
      return res.status(400).json({error:"Please complete all required fields."});
    }

    let payment_receipt = "";
    if (req.file) {
      const ext = path.extname(req.file.originalname || "").slice(0, 10);
      const objectPath = `${new Date().getFullYear()}/${crypto.randomUUID()}${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(objectPath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });
      if (uploadError) {
        console.error("Supabase storage upload failed:", uploadError);
        return res.status(500).json({error:"Unable to upload payment receipt right now."});
      }
      // Store the object path, not a public URL — the bucket is private.
      payment_receipt = objectPath;
    }

    const q = `
      INSERT INTO orders
      (client_name,phone,email,event_date,location,package_name,amount,payment_reference,payment_receipt,payment_amount,payment_date,payment_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`;
    const r = await pool.query(q, [
      client_name, phone, email || "", event_date, location, package_name, packages[package_name],
      "", payment_receipt, payment_amount ? Number(payment_amount) : null,
      payment_date || null, payment_note || ""
    ]);
    res.json({ok:true, order_id:r.rows[0].id, message:"Payment submission received. It will be confirmed after bank transfer verification."});
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Unable to submit booking right now."});
  }
});

function admin(req,res,next){
  if(req.headers["x-admin-pin"] !== ADMIN_PIN) return res.status(401).json({error:"Unauthorized"});
  next();
}

app.post("/api/admin/login",(req,res)=>{
  if(String(req.body.pin||"") !== ADMIN_PIN) return res.status(401).json({error:"Invalid PIN"});
  res.json({ok:true});
});

app.get("/api/admin/orders", admin, async (req,res)=>{
  try {
    const r = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(r.rows);
  } catch(e) { res.status(500).json({error:"Unable to load orders."}); }
});

// Receipts are private, so the admin dashboard asks for a short-lived
// signed URL on demand rather than linking straight to a static path.
app.get("/api/admin/orders/:id/receipt-url", admin, async (req,res)=>{
  try {
    const r = await pool.query("SELECT payment_receipt FROM orders WHERE id=$1", [req.params.id]);
    const order = r.rows[0];
    if (!order || !order.payment_receipt) return res.status(404).json({error:"No receipt on file."});
    const { data, error } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(order.payment_receipt, 300); // link expires in 5 minutes
    if (error) {
      console.error("Supabase signed URL failed:", error);
      return res.status(500).json({error:"Unable to generate receipt link."});
    }
    res.json({ url: data.signedUrl });
  } catch(e) { res.status(500).json({error:"Unable to generate receipt link."}); }
});

app.post("/api/admin/orders/:id/confirm", admin, async (req,res)=>{
  try {
    const r = await pool.query("SELECT * FROM orders WHERE id=$1", [req.params.id]);
    const order = r.rows[0];
    if(!order) return res.status(404).json({error:"Order not found"});
    const receiptNo = order.receipt_no || `CLISH-${new Date().getFullYear()}-${String(order.id).padStart(5,"0")}`;
    await pool.query("UPDATE orders SET status='confirmed', receipt_no=$1, confirmed_at=NOW() WHERE id=$2", [receiptNo,order.id]);
    res.json({ok:true, receipt_no:receiptNo});
  } catch(e) { res.status(500).json({error:"Unable to confirm payment."}); }
});

app.post("/api/admin/orders/:id/reject", admin, async (req,res)=>{
  try {
    await pool.query("UPDATE orders SET status='rejected' WHERE id=$1", [req.params.id]);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:"Unable to reject payment."}); }
});

app.get("/api/orders/:id", async (req,res)=>{
  try {
    const r = await pool.query("SELECT * FROM orders WHERE id=$1", [req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:"Order not found"});
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({error:"Unable to load receipt."}); }
});

app.get("/healthz", (_,res)=>res.json({ok:true}));

initDb()
  .then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`Clish Photos running on port ${PORT}`)))
  .catch(err=>{console.error("Database initialization failed:",err);process.exit(1);});
