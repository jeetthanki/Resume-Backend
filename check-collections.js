import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Resume from './models/Resume.js'
import User from './models/User.js'
import AnalysisResult from './models/AnalysisResult.js'
import SkillExtracted from './models/SkillExtracted.js'
import Feedback from './models/Feedback.js'
import AdminLog from './models/AdminLog.js'
import ResumeParsedData from './models/ResumeParsedData.js'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-analyzer'

async function checkCollections() {
  try {
    console.log('🔍 Checking MongoDB Collections...\n')
    console.log(`📡 Connecting to: ${MONGODB_URI}\n`)
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    
    console.log('✅ Connected to MongoDB\n')
    console.log('=' .repeat(60))
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName
    console.log(`📊 Database: ${dbName}\n`)
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log(`📁 Total Collections Found: ${collections.length}\n`)
    
    // Expected collections (MongoDB pluralizes model names)
    const expectedCollections = [
      { name: 'users', model: User, description: 'User accounts' },
      { name: 'resumes', model: Resume, description: 'Resume documents' },
      { name: 'analysisresults', model: AnalysisResult, description: 'Per-resume analysis scores' },
      { name: 'skillextracteds', model: SkillExtracted, description: 'Skills extracted from resumes' },
      { name: 'feedbacks', model: Feedback, description: 'User feedback on analyses' },
      { name: 'adminlogs', model: AdminLog, description: 'Admin audit log' },
      { name: 'resumeparseddatas', model: ResumeParsedData, description: 'Structured parsed resume data' }
    ]
    
    console.log('📋 Collection Status:\n')
    
    for (const expected of expectedCollections) {
      const exists = collections.some(c => c.name === expected.name)
      const collection = mongoose.connection.db.collection(expected.name)
      const count = exists ? await collection.countDocuments() : 0
      
      const status = exists ? '✅ EXISTS' : '❌ NOT FOUND'
      const countInfo = exists ? `(${count} documents)` : '(collection not created yet)'
      
      console.log(`${status} ${expected.name.padEnd(25)} ${expected.description.padEnd(35)} ${countInfo}`)
    }
    
    console.log('\n' + '=' .repeat(60))
    console.log('\n💡 Note: Collections are created automatically when first document is inserted.')
    console.log('   If a collection shows "NOT FOUND", analyze a resume to create it.\n')
    
    // Show sample data if collections exist
    const hasData = collections.length > 0
    if (hasData) {
      console.log('📊 Sample Data Preview:\n')
      
      // Check each collection
      for (const expected of expectedCollections) {
        const collection = mongoose.connection.db.collection(expected.name)
        const count = await collection.countDocuments()
        
        if (count > 0) {
          const sample = await collection.findOne({})
          console.log(`\n📄 ${expected.name} (${count} total):`)
          console.log(JSON.stringify(sample, null, 2).substring(0, 500) + '...\n')
        }
      }
    }
    
    await mongoose.connection.close()
    console.log('\n✅ Check complete!')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

checkCollections()

