#!/usr/bin/env node
import { Client, Databases } from "node-appwrite";
import fs from "fs";
import path from "path";

// Read values from .env
const envPath = path.resolve(process.cwd(), ".env");
let envContent = "";
try {
  envContent = fs.readFileSync(envPath, "utf-8");
} catch (err) {
  console.error("❌ Could not read .env file");
  process.exit(1);
}

const getEnvValue = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
};

const ENDPOINT = getEnvValue("VITE_APPWRITE_URL") || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = getEnvValue("VITE_APPWRITE_PROJECT_ID");
const DATABASE_ID = getEnvValue("VITE_APPWRITE_DATABASE_ID");
const CALLS_COLLECTION = getEnvValue("VITE_APPWRITE_CALLS_COLLECTION_ID") || "calls";

// Get API Key from arguments or prompt
const API_KEY = process.argv[2];

if (!PROJECT_ID || !DATABASE_ID) {
  console.error("❌ PROJECT_ID or DATABASE_ID is missing in your .env file.");
  process.exit(1);
}

if (!API_KEY) {
  console.log("❌ Please provide your Appwrite API Key as an argument.");
  console.log("Usage: node add-call-status-attribute.mjs YOUR_API_KEY");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

try {
  console.log(`Adding 'status' attribute to collection '${CALLS_COLLECTION}'...`);
  const result = await db.createStringAttribute(
    DATABASE_ID,
    CALLS_COLLECTION,
    "status",   // attribute key
    20,         // max length
    true,       // required? yes
    undefined   // default value
  );
  console.log("✅ 'status' attribute added successfully:", result);
  console.log("Wait ~10 seconds for Appwrite to finish indexing, then try calling again!");
} catch (err) {
  if (err.code === 409) {
    console.log("ℹ️  'status' attribute already exists — no action needed.");
  } else {
    console.error("❌ Error adding attribute:", err.message);
  }
}
