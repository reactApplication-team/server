// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ Missing STRIPE_SECRET_KEY in .env");
  process.exit(1);
}

const app = express();

// Allow your Vite dev origin
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// Parse JSON AFTER webhook routes (we have no webhooks here, so it's fine)
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
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
          currency: "usd",
          product_data: { name },
          unit_amount: Math.round(priceNum * 100), // cents
        },
        quantity: qty,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      // Point back to your Vite dev server
      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/cancel",
      // Optional niceties:
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
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
