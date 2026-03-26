import mongoose from 'mongoose'

const resumeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  analysis: {
    overallScore: Number,
    atsScore: Number,
    keywordScore: Number,
    formattingScore: Number,
    contactScore: Number,
    educationScore: Number,
    experienceScore: Number,
    skillsScore: Number,
    structureScore: Number,
    strengths: [String],
    improvements: [String],
    detailedAnalysis: String,
    skills: [String],
    recommendations: [String],
    atsRecommendations: [String],
    missingKeywords: [String]
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
})

const Resume = mongoose.model('Resume', resumeSchema)

export default Resume

