#!/usr/bin/env node
// Run: node setup-calls-collection.mjs
// Adds all attributes for the calls collection in Appwrite.

import { Client, Databases } from "node-appwrite";

const ENDPOINT = "https://sfo.cloud.appwrite.io/v1"; // from .env
const PROJECT_ID = ""; // VITE_APPWRITE_PROJECT_ID from .env
const API_KEY = ""; // Appwrite Console → Settings → API Keys
const DATABASE_ID = ""; // VITE_APPWRITE_DATABASE_ID from .env
const CALLS_COLLECTION = "calls"; // VITE_APPWRITE_CALLS_COLLECTION_ID from .env

if (!PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("❌  Fill in PROJECT_ID, API_KEY, and DATABASE_ID at the top of this file first.");
  process.exit(1);
}

const db = new Databases(
  new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
);

const attributes = [
  { kind: "string", key: "callerId", size: 36, required: true },
  { kind: "string", key: "receiverId", size: 36, required: true },
  { kind: "string", key: "callerName", size: 100, required: true },
  { kind: "string", key: "callerAvatar", size: 500, required: false },
  { kind: "string", key: "type", size: 10, required: true },
  { kind: "string", key: "status", size: 20, required: true },
  { kind: "string", key: "offer", size: 10000, required: false },
  { kind: "string", key: "answer", size: 10000, required: false },
  { kind: "string", key: "callerIce", size: 10000, required: false },
  { kind: "string", key: "receiverIce", size: 10000, required: false },
];

for (const attr of attributes) {
  try {
    let result;
    if (attr.kind === "string") {
      result = await db.createStringAttribute(
        DATABASE_ID,
        CALLS_COLLECTION,
        attr.key,
        attr.size,
        attr.required
      );
    }
    console.log(`✅  Added "${attr.key}"`);
    console.log("   ", result?.status || "ok");
  } catch (err) {
    if (err.code === 409) {
      console.log(`ℹ️   "${attr.key}" already exists`);
    } else {
      console.error(`❌  "${attr.key}":`, err.message);
    }
  }
}

console.log("\nNext steps in Appwrite Console → Databases → calls → Settings → Permissions:");
console.log("  Add role: Users → Create, Read, Update");
console.log("Wait ~30 seconds for attributes to finish building, then restart npm run dev.");
