const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "CHANGE-ME";
const DATABASE_URL = process.env.DATABASE_URL;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "2347016040813";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
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

app.get("/api/packages", (_, res) => res.json(packages));
app.get("/api/config", (_, res) => res.json({ whatsappNumber: WHATSAPP_NUMBER }));

app.post("/api/orders", async (req,res) => {
  try {
    const {client_name, phone, email, event_date, location, package_name, payment_amount, payment_date, payment_note} = req.body;
    if (!client_name || !phone || !event_date || !location || !packages[package_name]) {
      return res.status(400).json({error:"Please complete all required fields."});
    }

    const q = `
      INSERT INTO orders
      (client_name,phone,email,event_date,location,package_name,amount,payment_amount,payment_date,payment_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`;
    const r = await pool.query(q, [
      client_name, phone, email || "", event_date, location, package_name, packages[package_name],
      payment_amount ? Number(payment_amount) : null,
      payment_date || null, payment_note || ""
    ]);
    res.json({ok:true, order_id:r.rows[0].id, message:"Booking received. It will be confirmed once we verify your payment proof on WhatsApp."});
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
