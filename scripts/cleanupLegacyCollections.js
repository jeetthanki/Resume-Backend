import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-analyzer'

const LEGACY_COLLECTIONS = [
  'analysislogs',
  'skillsnapshots',
  'recommendationsets',
  'useractivities'
]

async function cleanupLegacyCollections() {
  try {
    console.log('🧹 Cleaning up legacy MongoDB collections...\n')
    console.log(`📡 Connecting to: ${MONGODB_URI}\n`)

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })

    const db = mongoose.connection.db
    const existingCollections = await db.listCollections().toArray()
    const existingNames = existingCollections.map(c => c.name)

    for (const name of LEGACY_COLLECTIONS) {
      if (existingNames.includes(name)) {
        console.log(`🚨 Dropping collection: ${name}`)
        await db.dropCollection(name)
      } else {
        console.log(`✅ Collection not found (already removed): ${name}`)
      }
    }

    await mongoose.connection.close()
    console.log('\n✅ Legacy collections cleanup complete. Only your 7 new tables should remain.')
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message)
    process.exit(1)
  }
}

cleanupLegacyCollections()


