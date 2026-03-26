import express from 'express'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import Resume from '../models/Resume.js'
import AnalysisResult from '../models/AnalysisResult.js'
import SkillExtracted from '../models/SkillExtracted.js'
import ResumeParsedData from '../models/ResumeParsedData.js'
import { extractTextFromResume, parseResumeData } from '../services/resumeParser.js'
import { analyzeResume } from '../services/aiAnalyzer.js'
import { authenticate } from '../middleware/auth.js'
import { generatePDFReport } from '../services/reportGenerator.js'

const router = express.Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Ensure uploads directory exists
const uploadsDir = join(__dirname, '../uploads')
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error)

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname)
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'), false)
    }
  }
})

// Analyze resume endpoint
router.post('/analyze', authenticate, upload.single('resume'), async (req, res) => {
  const startTime = Date.now()
  let resume = null
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`[${new Date().toISOString()}] Starting analysis for user ${req.user._id}`)

    // Extract text from resume (with timeout)
    console.log(`[${new Date().toISOString()}] Extracting text from file: ${req.file.originalname} (${req.file.size} bytes)`)
    
    const extractPromise = extractTextFromResume(req.file.path, req.file.mimetype)
    const extractTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Text extraction timeout after 15 seconds')), 15000)
    )
    
    let resumeText
    try {
      resumeText = await Promise.race([extractPromise, extractTimeout])
    } catch (extractError) {
      console.error(`[${new Date().toISOString()}] Text extraction failed:`, extractError.message)
      throw extractError
    }
    
    // Validate extracted text quality
    if (!resumeText || resumeText.trim().length < 50) {
      console.error(`[${new Date().toISOString()}] Insufficient text extracted: ${resumeText?.length || 0} characters`)
      throw new Error('Could not extract sufficient text from resume. The file might be scanned (image-based) or corrupted. Please use a text-based PDF or Word document.')
    }
    
    // Additional validation: ensure it's not JSON/metadata
    const trimmedText = resumeText.trim()
    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
      console.error(`[${new Date().toISOString()}] ERROR: Extracted text appears to be JSON/metadata!`)
      console.error(`[${new Date().toISOString()}] Text preview: ${trimmedText.substring(0, 200)}`)
      throw new Error('Text extraction failed - received metadata instead of resume content. Please try uploading a different file format or ensure your PDF contains selectable text.')
    }
    
    // Check word count
    const wordCount = resumeText.split(/\s+/).filter(w => w.length > 0).length
    console.log(`[${new Date().toISOString()}] Successfully extracted ${resumeText.length} characters, ${wordCount} words`)
    
    if (wordCount < 20) {
      throw new Error('Resume contains insufficient text content. Please ensure your resume has substantial readable text.')
    }
    
    // Log text preview for verification
    console.log(`[${new Date().toISOString()}] Text preview: ${resumeText.substring(0, 150).replace(/\n/g, ' ')}...`)
    console.log(`[${new Date().toISOString()}] Starting AI analysis with ${resumeText.length} characters`)

    // Analyze with AI (Gemini) - this is the main bottleneck
    const analysis = await analyzeResume(resumeText)
    
    console.log(`[${new Date().toISOString()}] AI analysis completed in ${Date.now() - startTime}ms`)

    // Save to database (main resume document – now focused on file metadata)
    resume = new Resume({
      user: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      // keep legacy embedded analysis for backward compatibility
      analysis: analysis
    })

    await resume.save()

    // New normalized data tables (collections)
    const analysisResult = await AnalysisResult.create({
      resume: resume._id,
      ats_score: analysis.atsScore,
      grammar_score: null, // not currently provided by AI
      keyword_match_score: analysis.keywordScore,
      overall_score: analysis.overallScore,
      strengths: JSON.stringify(analysis.strengths || []),
      weaknesses: JSON.stringify(analysis.improvements || []),
      suggestions: JSON.stringify(analysis.recommendations || [])
    })

    // Store extracted skills as separate documents
    const skills = analysis.skills || []
    if (skills.length > 0) {
      const skillDocs = skills.map(skill => ({
        resume: resume._id,
        skill_name: skill,
        skills_path: null,
        category: null
      }))
      await SkillExtracted.insertMany(skillDocs)
    }

    // Parse structured data from resume text
    const parsedData = parseResumeData(resumeText)
    await ResumeParsedData.create({
      resume: resume._id,
      full_name: parsedData.full_name,
      email: parsedData.email,
      phone: parsedData.phone,
      location: parsedData.location,
      education_data: parsedData.education_data.length > 0 ? parsedData.education_data : null,
      experience_data: parsedData.experience_data.length > 0 ? parsedData.experience_data : null,
      project_data: parsedData.project_data.length > 0 ? parsedData.project_data : null,
      parsing_status: parsedData.parsing_status
    })
    
    console.log(`[Resume Parser] Parsing status: ${parsedData.parsing_status}`)
    if (parsedData.parsing_status === 'SUCCESS') {
      console.log(`[Resume Parser] Extracted - Name: ${parsedData.full_name || 'N/A'}, Email: ${parsedData.email || 'N/A'}, Phone: ${parsedData.phone || 'N/A'}`)
    }

    const totalTime = Date.now() - startTime
    console.log(`[${new Date().toISOString()}] Analysis complete in ${totalTime}ms`)

    res.json({
      success: true,
      ...resume.analysis,
      resumeId: resume._id,
      meta: {
        analysisResultId: analysisResult._id,
        processingTime: totalTime
      }
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing resume:`, error.message)
    
    // Clean up file on error
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path)
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError)
      }
    }

    const errorMessage = error.message || 'Failed to analyze resume'
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Get analysis history (optional endpoint)
router.get('/history', authenticate, async (req, res) => {
  try {
    const resumes = await Resume.find({ user: req.user._id })
      .select('originalName uploadedAt analysis.overallScore')
      .sort({ uploadedAt: -1 })
      .limit(10)
    
    res.json({ resumes })
  } catch (error) {
    console.error('Error fetching history:', error)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

// Get specific resume analysis
router.get('/:id', authenticate, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id })
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' })
    }
    res.json({
      success: true,
      ...resume.analysis,
      resumeId: resume._id
    })
  } catch (error) {
    console.error('Error fetching resume:', error)
    res.status(500).json({ error: 'Failed to fetch resume analysis' })
  }
})

// Download analysis report as PDF
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id })
      .populate('user', 'name email')
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' })
    }
    
    const pdfBuffer = await generatePDFReport(resume.analysis, resume.user)
    
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="resume-analysis-${resume._id}.pdf"`)
    res.send(pdfBuffer)
  } catch (error) {
    console.error('Error generating PDF report:', error)
    res.status(500).json({ error: 'Failed to generate PDF report' })
  }
})

export default router

