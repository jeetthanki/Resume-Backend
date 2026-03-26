import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import resumeRoutes from './routes/resumeRoutes.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import feedbackRoutes from './routes/feedbackRoutes.js'
import adminLogRoutes from './routes/adminLogRoutes.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/resume', resumeRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/admin-logs', adminLogRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' })
})

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-analyzer', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB')
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  })
})
.catch((error) => {
  console.error('MongoDB connection error:', error)
  process.exit(1)
})

export default app

