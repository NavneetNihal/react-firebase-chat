#!/usr/bin/env node
// Run: node add-status-attribute.mjs
// This adds the 'status' string attribute to your Appwrite users collection.

import { Client, Databases } from "node-appwrite";

// ─── FILL THESE IN ─────────────────────────────────────
const ENDPOINT          = "https://sfo.cloud.appwrite.io/v1"; // your Appwrite URL from .env
const PROJECT_ID        = "";  // VITE_APPWRITE_PROJECT_ID from .env
const API_KEY           = "";  // paste your Appwrite API key here
const DATABASE_ID       = "";  // VITE_APPWRITE_DATABASE_ID from .env
const USERS_COLLECTION  = "users"; // VITE_APPWRITE_USERS_COLLECTION_ID from .env
// ───────────────────────────────────────────────────────

if (!PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("❌  Fill in PROJECT_ID, API_KEY, and DATABASE_ID at the top of this file first.");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

try {
  const result = await db.createStringAttribute(
    DATABASE_ID,
    USERS_COLLECTION,
    "status",   // attribute key
    255,        // max length
    false,      // required? no
    "Available" // default value
  );
  console.log("✅  'status' attribute added successfully:", result);
  console.log("   Wait ~10 seconds for Appwrite to finish indexing, then try saving status in the app.");
} catch (err) {
  if (err.code === 409) {
    console.log("ℹ️   'status' attribute already exists — no action needed.");
  } else {
    console.error("❌  Error:", err.message);
  }
}
