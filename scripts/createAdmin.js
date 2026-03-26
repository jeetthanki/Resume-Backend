import mongoose from 'mongoose'
import User from '../models/User.js'
import dotenv from 'dotenv'

dotenv.config()

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-analyzer')
    
    const adminEmail = process.argv[2] || 'admin@example.com'
    const adminPassword = process.argv[3] || 'admin123'
    const adminName = process.argv[4] || 'Admin User'
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail })
    if (existingAdmin) {
      if (existingAdmin.role === 'admin') {
        console.log('Admin user already exists!')
        process.exit(0)
      } else {
        // Update existing user to admin
        existingAdmin.role = 'admin'
        existingAdmin.password = adminPassword // Will be hashed by pre-save hook
        await existingAdmin.save()
        console.log('User updated to admin!')
        process.exit(0)
      }
    }
    
    // Create new admin
    const admin = new User({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin'
    })
    
    await admin.save()
    console.log('Admin user created successfully!')
    console.log(`Email: ${adminEmail}`)
    console.log(`Password: ${adminPassword}`)
    console.log('\nYou can now login with these credentials.')
    
    process.exit(0)
  } catch (error) {
    console.error('Error creating admin:', error)
    process.exit(1)
  }
}

createAdmin()

