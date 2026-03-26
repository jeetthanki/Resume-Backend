import express from 'express'
import { authenticate } from '../middleware/auth.js'
import Feedback from '../models/Feedback.js'
import AnalysisResult from '../models/AnalysisResult.js'

const router = express.Router()

// Create feedback for a given analysis result
router.post('/', authenticate, async (req, res) => {
  try {
    const { analysisId, feedback_text, rating } = req.body

    if (!analysisId) {
      return res.status(400).json({ error: 'analysisId is required' })
    }

    const analysis = await AnalysisResult.findById(analysisId)
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis result not found' })
    }

    const feedback = await Feedback.create({
      user: req.user._id,
      analysis: analysisId,
      feedback_text: feedback_text || '',
      rating: rating || undefined
    })

    res.status(201).json({ success: true, feedback })
  } catch (error) {
    console.error('Error creating feedback:', error)
    res.status(500).json({ error: 'Failed to create feedback' })
  }
})

// Get feedback for the current user
router.get('/mine', authenticate, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ user: req.user._id })
      .populate('analysis', 'overall_score ats_score keyword_match_score analyzed_at')
      .sort({ created_at: -1 })

    res.json({ success: true, feedbacks })
  } catch (error) {
    console.error('Error fetching feedback:', error)
    res.status(500).json({ error: 'Failed to fetch feedback' })
  }
})

export default router


