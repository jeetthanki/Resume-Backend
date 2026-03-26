import mongoose from 'mongoose'

const resumeParsedDataSchema = new mongoose.Schema({
  resume: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    required: true
  },
  full_name: { type: String, maxlength: 100 },
  email: { type: String, maxlength: 100 },
  phone: { type: String, maxlength: 20 },
  location: { type: String, maxlength: 100 },
  education_data: { type: mongoose.Schema.Types.Mixed },
  experience_data: { type: mongoose.Schema.Types.Mixed },
  project_data: { type: mongoose.Schema.Types.Mixed },
  parsing_status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    required: true
  }
})

const ResumeParsedData = mongoose.model('ResumeParsedData', resumeParsedDataSchema)

export default ResumeParsedData


