// server.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

// Load environment variables
dotenv.config();

// Initialize app
const app = express();
app.use(cors());
app.use(express.json());

// Connect to Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
console.log("✅ Connected to Supabase successfully");

// Root route (for browser check)
app.get("/", (req, res) => {
  res.send("✅ Shiv Shakti Steel Tubes Backend is running!");
});

// ➕ Route to create a new Purchase Order (PO)
app.post("/po", async (req, res) => {
  try {
    const { po_number, customer_name, material, quantity, pending_qty, date } = req.body;

    const { data, error } = await supabase
      .from("purchase_orders")
      .insert([{ po_number, customer_name, material, quantity, pending_qty, date }]);

    if (error) {
      console.error("Insert error:", error.message);
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: "PO added successfully", data });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 📋 Route to fetch all POs
app.get("/po", async (req, res) => {
  try {
    const { data, error } = await supabase.from("purchase_orders").select("*");
    if (error) {
      console.error("Fetch error:", error.message);
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Test route
app.get("/api/ping", (req, res) => {
  res.json({ message: "Server is live!" });
});

// Start the server
const PORT = process.env.PORT || 10000;
// -----------------------------------------
// Helper function to calculate weight, price, gst
// -----------------------------------------
// ===================== HELPER FUNCTION =====================
// ===================== HELPER FUNCTION =====================

// This function detects the shape type and calculates the weight per piece
function calculatePO(poData) {
  const { size, quantity, rate } = poData;
  let weight_per_pc = 0;

  if (!size) throw new Error("Size is required");

  const sizeLower = size.toLowerCase();

  // Detect round, square, or rectangle
  if (sizeLower.includes("od")) {
    // Round format: e.g., 373ODx4.5mm
    const match = size.match(/(\d+)odx(\d+)/i);
    if (match) {
      const od = parseFloat(match[1]);
      const thickness = parseFloat(match[2]);
      weight_per_pc = (od * thickness) / 6.8;
    }
  } else {
    // Square/Rectangle format: e.g., 400x400x12mm or 600x300x12mm
    const match = size.match(/(\d+)x(\d+)x(\d+)/i);
    if (match) {
      const length = parseFloat(match[1]);
      const breadth = parseFloat(match[2]);
      const thickness = parseFloat(match[3]);
      weight_per_pc = ((length + breadth) * thickness) / 10.8;
    }
  }

  // Now calculate price, GST, and totals (rounded)
  const qty = Number(quantity) || 0;
  const rt = Number(rate) || 0;
  const price = qty * rt;
  const gst_18 = price * 0.18;
  const total_price = price + gst_18;

  const weight_per_pc_rounded = Math.round(weight_per_pc * 100) / 100;
  const total_weight_rounded = Math.round(weight_per_pc * qty * 100) / 100;

  return {
    ...poData,
    weight_per_pc: weight_per_pc_rounded,
    total_weight: total_weight_rounded,
    price: Math.round(price * 100) / 100,
    gst_18: Math.round(gst_18 * 100) / 100,
    total_price: Math.round(total_price * 100) / 100,
  };
}



// -----------------------------------------
// API route to add a new Customer PO
// -----------------------------------------
// ===================== CUSTOMER PO =====================
app.post("/api/customer-po", async (req, res) => {
  try {
    const poData = calculatePO(req.body);

    const { data, error } = await supabase
      .from("customer_pos")
      .insert([poData])
      .select();

    if (error) throw error;
    res.json({ success: true, message: "Customer PO added successfully", data });
  } catch (err) {
    console.error("❌ Error adding Customer PO:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===================== SUPPLIER PO =====================
app.post("/api/supplier-po", async (req, res) => {
  try {
    const poData = calculatePO(req.body);

    const { data, error } = await supabase
      .from("supplier_pos")
      .insert([poData])
      .select();

    if (error) throw error;
    res.json({ success: true, message: "Supplier PO added successfully", data });
  } catch (err) {
    console.error("❌ Error adding Supplier PO:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// ===================== REPORTS =====================

// 1️⃣ Most sold materials by quantity/weight
app.get("/api/reports/top-materials", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customer_pos")
      .select("size, total_weight");

    if (error) throw error;

    const summary = {};

    data.forEach(row => {
      if (!summary[row.size]) summary[row.size] = 0;
      summary[row.size] += row.total_weight || 0;
    });

    const sorted = Object.entries(summary)
      .sort((a, b) => b[1] - a[1])
      .map(([size, total_weight]) => ({ size, total_weight }));

    res.json({ success: true, top_materials: sorted });
  } catch (err) {
    console.error("❌ Error generating report:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2️⃣ Monthly Sales (Customer POS)
app.get("/api/reports/monthly-sales", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customer_pos")
      .select("date, total_price");

    if (error) throw error;

    const monthly = {};

    data.forEach(row => {
      const month = new Date(row.date).toLocaleString("default", { month: "short", year: "numeric" });
      if (!monthly[month]) monthly[month] = 0;
      monthly[month] += row.total_price || 0;
    });

    const result = Object.entries(monthly).map(([month, total]) => ({ month, total }));

    res.json({ success: true, monthly_sales: result });
  } catch (err) {
    console.error("❌ Error generating monthly sales:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3️⃣ Pending POs (Customer & Supplier)
app.get("/api/reports/pending-pos", async (req, res) => {
  try {
    const { data: custData, error: custErr } = await supabase
      .from("customer_pos")
      .select("*")
      .eq("status", "Pending");

    const { data: suppData, error: suppErr } = await supabase
      .from("supplier_pos")
      .select("*")
      .eq("status", "Pending");

    if (custErr || suppErr) throw custErr || suppErr;

    res.json({
      success: true,
      pending_customers: custData,
      pending_suppliers: suppData
    });
  } catch (err) {
    console.error("❌ Error fetching pending POs:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


