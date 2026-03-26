import mongoose from 'mongoose'

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  analysis: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AnalysisResult',
    required: true
  },
  feedback_text: {
    type: String
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  created_at: {
    type: Date,
    default: Date.now
  }
})

const Feedback = mongoose.model('Feedback', feedbackSchema)

export default Feedback


