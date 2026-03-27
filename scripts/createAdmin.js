/**
 * createAdmin.js
 * -------------
 * Seeds an admin user into the database.
 *
 * Usage:
 *   node backend/scripts/createAdmin.js
 *
 * Optional overrides via env vars (or edit the DEFAULTS below):
 *   ADMIN_NAME="Super Admin" ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret node backend/scripts/createAdmin.js
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import User from '../models/User.js'

// ── Load .env from the backend root ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../.env') })

// ── Admin defaults (override with env vars at run-time) ──────────────────────
const DEFAULTS = {
  name: 'Admin',
  email: 'admin@resumeanalyzer.com',
  password: 'Admin@123456',
}

const adminData = {
  name:     process.env.ADMIN_NAME     || DEFAULTS.name,
  email:    process.env.ADMIN_EMAIL    || DEFAULTS.email,
  password: process.env.ADMIN_PASSWORD || DEFAULTS.password,
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateAdminData({ name, email, password }) {
  const errors = []

  if (!name || name.trim().length < 2) {
    errors.push('Name must be at least 2 characters.')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    errors.push('A valid email address is required.')
  }

  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters.')
  }

  return errors
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function createAdmin() {
  const MONGO_URI = process.env.MONGODB_URI

  if (!MONGO_URI) {
    console.error('❌  MONGODB_URI is not set. Check your .env file.')
    process.exit(1)
  }

  // Validate input before connecting
  const errors = validateAdminData(adminData)
  if (errors.length > 0) {
    console.error('❌  Invalid admin data:')
    errors.forEach(e => console.error(`   • ${e}`))
    process.exit(1)
  }

  try {
    console.log('🔌  Connecting to MongoDB...')
    await mongoose.connect(MONGO_URI)
    console.log('✅  Connected to MongoDB.')

    // Check for existing admin with this email
    const existing = await User.findOne({ email: adminData.email.toLowerCase() })

    if (existing) {
      if (existing.role === 'admin') {
        console.log(`ℹ️   An admin with email "${adminData.email}" already exists. No changes made.`)
      } else {
        // Promote existing user to admin
        existing.role = 'admin'
        await existing.save()
        console.log(`✅  Existing user "${adminData.email}" has been promoted to admin.`)
      }
      return
    }

    // Create new admin user
    // Password is hashed automatically by the pre-save hook in User.js
    const admin = new User({
      name: adminData.name.trim(),
      email: adminData.email.toLowerCase().trim(),
      password: adminData.password,
      role: 'admin',
    })

    await admin.save()

    console.log('✅  Admin user created successfully!')
    console.log('─────────────────────────────────────')
    console.log(`   Name  : ${admin.name}`)
    console.log(`   Email : ${admin.email}`)
    console.log(`   Role  : ${admin.role}`)
    console.log(`   ID    : ${admin._id}`)
    console.log('─────────────────────────────────────')
    console.log('⚠️   Change the default password after first login.')

  } catch (error) {
    console.error('❌  Error creating admin:', error.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('🔌  Disconnected from MongoDB.')
  }
}

createAdmin()