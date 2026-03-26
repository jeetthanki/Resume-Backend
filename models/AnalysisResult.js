import mongoose from 'mongoose'

const analysisResultSchema = new mongoose.Schema({
  resume: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    required: true
  },
  ats_score: { type: Number },
  grammar_score: { type: Number },
  keyword_match_score: { type: Number },
  overall_score: { type: Number },
  strengths: { type: String },   // store as JSON/stringified array
  weaknesses: { type: String },  // store as JSON/stringified array
  suggestions: { type: String }, // store as JSON/stringified array
  analyzed_at: {
    type: Date,
    default: Date.now
  }
})

const AnalysisResult = mongoose.model('AnalysisResult', analysisResultSchema)

export default AnalysisResult


