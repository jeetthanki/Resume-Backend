import mongoose from 'mongoose'

const skillExtractedSchema = new mongoose.Schema({
  resume: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    required: true
  },
  skill_name: {
    type: String,
    required: true,
    maxlength: 120
  },
  skills_path: {
    type: String,
    maxlength: 150
  },
  category: {
    type: String,
    maxlength: 80
  }
}, {
  timestamps: false
})

const SkillExtracted = mongoose.model('SkillExtracted', skillExtractedSchema)

export default SkillExtracted


