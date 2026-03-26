import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { isAdmin } from '../middleware/auth.js'
import User from '../models/User.js'
import Resume from '../models/Resume.js'
import AnalysisResult from '../models/AnalysisResult.js'
import Feedback from '../models/Feedback.js'
import mongoose from 'mongoose'

const router = express.Router()

// All admin routes require authentication and admin role
router.use(authenticate)
router.use(isAdmin)

// Get dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' })
    const totalAdmins = await User.countDocuments({ role: 'admin' })
    const totalResumes = await Resume.countDocuments()
    
    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentUsers = await User.countDocuments({
      role: 'user',
      createdAt: { $gte: sevenDaysAgo }
    })
    
    // Get recent resumes (last 7 days)
    const recentResumes = await Resume.countDocuments({
      uploadedAt: { $gte: sevenDaysAgo }
    })
    
    // Average scores (now from AnalysisResult collection)
    const avgScores = await AnalysisResult.aggregate([
      {
        $group: {
          _id: null,
          avgOverallScore: { $avg: '$overall_score' },
          avgAtsScore: { $avg: '$ats_score' },
          avgKeywordScore: { $avg: '$keyword_match_score' }
        }
      }
    ])
    
    // Users with most resumes
    const topUsers = await Resume.aggregate([
      {
        $group: {
          _id: '$user',
          resumeCount: { $sum: 1 }
        }
      },
      {
        $sort: { resumeCount: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: '$userInfo'
      },
      {
        $project: {
          name: '$userInfo.name',
          email: '$userInfo.email',
          resumeCount: 1
        }
      }
    ])
    
    // Daily activity (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const dailyActivity = await Resume.aggregate([
      {
        $match: {
          uploadedAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$uploadedAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ])
    
    // Score distribution (bucket by overall_score from AnalysisResult)
    const scoreDistribution = await AnalysisResult.aggregate([
      {
        $bucket: {
          groupBy: '$overall_score',
          boundaries: [0, 40, 60, 80, 100],
          default: 'Other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ])
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalAdmins,
        totalResumes,
        recentUsers,
        recentResumes,
        averageScores: avgScores[0] || {
          avgOverallScore: 0,
          avgAtsScore: 0,
          avgKeywordScore: 0
        },
        topUsers,
        dailyActivity,
        scoreDistribution
      }
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' })
  }
})

// Get all users with their resume count
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit
    
    const users = await User.find({ role: 'user' })
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
    
    const totalUsers = await User.countDocuments({ role: 'user' })
    
    // Get resume count for each user
    const usersWithResumeCount = await Promise.all(
      users.map(async (user) => {
        const resumeCount = await Resume.countDocuments({ user: user._id })
        return {
          ...user.toObject(),
          resumeCount
        }
      })
    )
    
    res.json({
      success: true,
      users: usersWithResumeCount,
      pagination: {
        page,
        limit,
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Get all resumes with user info
router.get('/resumes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit
    
    const resumes = await Resume.find()
      .populate('user', 'name email')
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-filePath')
    
    const totalResumes = await Resume.countDocuments()
    
    res.json({
      success: true,
      resumes,
      pagination: {
        page,
        limit,
        total: totalResumes,
        pages: Math.ceil(totalResumes / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching resumes:', error)
    res.status(500).json({ error: 'Failed to fetch resumes' })
  }
})

// Get user activity (resumes by user)
router.get('/users/:userId/activity', async (req, res) => {
  try {
    const userId = req.params.userId
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' })
    }
    
    const user = await User.findById(userId).select('-password')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const resumes = await Resume.find({ user: userId })
      .sort({ uploadedAt: -1 })
      .select('-filePath')
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      },
      resumes,
      totalResumes: resumes.length
    })
  } catch (error) {
    console.error('Error fetching user activity:', error)
    res.status(500).json({ error: 'Failed to fetch user activity' })
  }
})

// Get all user feedback for admin review
router.get('/feedback', async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .populate('user', 'name email')
      .populate('analysis', 'overall_score ats_score keyword_match_score analyzed_at')
      .sort({ created_at: -1 })

    res.json({
      success: true,
      feedbacks
    })
  } catch (error) {
    console.error('Error fetching feedback:', error)
    res.status(500).json({ error: 'Failed to fetch feedback' })
  }
})

export default router

