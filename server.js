import express from "express";
import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ Missing STRIPE_SECRET_KEY in .env");
  process.exit(1);
}

const app = express();

const BUILD_STAMP = `build-${new Date().toISOString()}`;
console.log("Starting server with", { BUILD_STAMP });

app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "checkout-server", stamp: BUILD_STAMP });
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { products } = req.body || {};
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "No products provided." });
    }

    const line_items = products.map((p, i) => {
      const name = p?.name || p?.title || `Item ${i + 1}`;
      const priceNum = Number(p?.price);
      const qty = Number(p?.quantity ?? 1);

      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        throw new Error(`Invalid price for "${name}" → ${p?.price}`);
      }
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error(`Invalid quantity for "${name}" → ${p?.quantity}`);
      }

      return {
        price_data: {
          currency: process.env.CURRENCY || "usd",
          product_data: { name },
          unit_amount: Math.round(priceNum * 100),
        },
        quantity: qty,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: process.env.SUCCESS_URL,
      cancel_url: process.env.CANCEL_URL,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT} with ${BUILD_STAMP}`);
});
