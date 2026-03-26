import express from 'express'
import { authenticate, isAdmin } from '../middleware/auth.js'
import AdminLog from '../models/AdminLog.js'

const router = express.Router()

// All admin log routes require admin
router.use(authenticate)
router.use(isAdmin)

// List recent admin logs
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50
    const logs = await AdminLog.find()
      .sort({ log_time: -1 })
      .limit(limit)

    res.json({ success: true, logs })
  } catch (error) {
    console.error('Error fetching admin logs:', error)
    res.status(500).json({ error: 'Failed to fetch admin logs' })
  }
})

// Simple endpoint to add an admin log entry
router.post('/', async (req, res) => {
  try {
    const { action } = req.body
    if (!action) {
      return res.status(400).json({ error: 'action is required' })
    }

    const log = await AdminLog.create({ action })
    res.status(201).json({ success: true, log })
  } catch (error) {
    console.error('Error creating admin log:', error)
    res.status(500).json({ error: 'Failed to create admin log' })
  }
})

export default router


