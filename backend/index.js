const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const dbPath = process.env.DB_PATH || path.join(__dirname, "family_notes.db");

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", dbPath });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
