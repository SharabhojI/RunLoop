require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;

// Serve source files
app.use(express.static("src"));

// API endpoint for serving Google Maps API key
app.get("/api/maps-api-key", (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY });
});

// Start server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});