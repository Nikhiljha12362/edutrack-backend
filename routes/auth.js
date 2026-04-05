const express = require("express");
const router = express.Router();
const User = require("../models/User");

// SIMPLE TEST REGISTER (NO HASH, NO COMPLEX LOGIC)
router.post("/register", async (req, res) => {
  try {
    console.log("DATA AA RAHA:", req.body);

    const { name, email, password } = req.body;

    // basic check
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const newUser = new User({
      name,
      email,
      password   // direct save (temporary fix)
    });

    await newUser.save();

    res.json({ message: "Signup success ✅" });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;