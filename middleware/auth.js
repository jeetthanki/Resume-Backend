import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided, authorization denied' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production')
    const user = await User.findById(decoded.userId).select('-password')
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    next()
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
}

