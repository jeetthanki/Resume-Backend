import mongoose from 'mongoose'

const adminLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  log_time: {
    type: Date,
    default: Date.now
  }
})

const AdminLog = mongoose.model('AdminLog', adminLogSchema)

export default AdminLog


