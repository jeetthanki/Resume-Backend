import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import resumeRoutes from './routes/resumeRoutes.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import feedbackRoutes from './routes/feedbackRoutes.js'
import adminLogRoutes from './routes/adminLogRoutes.js'
import User from './models/User.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/resume', resumeRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/admin-logs', adminLogRoutes)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' })
})

// ── Auto admin seeding ────────────────────────────────────────────────────────
// Runs once after MongoDB connects. Uses ADMIN_* env vars if set,
// otherwise falls back to these safe defaults.
async function seedAdminIfNeeded() {
  try {
    const adminExists = await User.findOne({ role: 'admin' })

    if (adminExists) {
      console.log('[Admin Seed] Admin user already exists. Skipping.')
      return
    }

    const adminData = {
      name:     process.env.ADMIN_NAME     || 'Admin',
      email:    process.env.ADMIN_EMAIL    || 'admin@resumeanalyzer.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
      role:     'admin',
    }

    const admin = new User(adminData)
    await admin.save() // password hashed automatically by User.js pre-save hook

    console.log('[Admin Seed] ✅ Admin user created successfully!')
    console.log(`[Admin Seed]    Name  : ${admin.name}`)
    console.log(`[Admin Seed]    Email : ${admin.email}`)
    console.log(`[Admin Seed]    ID    : ${admin._id}`)
    console.log('[Admin Seed] ⚠️  Change the default password after first login.')
  } catch (error) {
    // Seeding failure should never crash the server
    console.error('[Admin Seed] ❌ Failed to seed admin:', error.message)
  }
}

// ── Connect to MongoDB, then start server ─────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-analyzer', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('Connected to MongoDB')

  await seedAdminIfNeeded()

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  })
})
.catch((error) => {
  console.error('MongoDB connection error:', error)
  process.exit(1)
})

export default app