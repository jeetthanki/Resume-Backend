import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRE = '7d'

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please provide all fields' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    // Check if user exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' })
    }

    // Create user
    const user = new User({ name, email, password })
    await user.save()

    // Generate token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRE })

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Server error during registration' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' })
    }

    // Find user
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Check password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRE })

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Server error during login' })
  }
})

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.userId).select('-password')
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

// Forgot password - generate reset token
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      // Do not reveal whether user exists
      return res.json({ success: true, message: 'If this email exists, a reset link has been created.' })
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    user.resetPasswordToken = hashedToken
    user.resetPasswordExpires = expires
    await user.save()

    // In production, send email. For now, return token so frontend can build reset link.
    res.json({
      success: true,
      message: 'Password reset link has been created.',
      resetToken: rawToken
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Server error while processing forgot password' })
  }
})

// Reset password using token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    })

    if (!user) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' })
    }

    user.password = password
    user.resetPasswordToken = null
    user.resetPasswordExpires = null
    await user.save()

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Server error while resetting password' })
  }
})

// Get profile (authenticated)
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Update profile (authenticated)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' })
    }

    const existing = await User.findOne({ email, _id: { $ne: req.user._id } })
    if (existing) {
      return res.status(400).json({ error: 'Another account already uses this email' })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    user.name = name
    user.email = email
    await user.save()

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

export default router

