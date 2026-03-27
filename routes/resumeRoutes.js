import express from 'express'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import { GoogleGenerativeAI } from '@google/generative-ai'
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

// ─── Uploads directory ────────────────────────────────────────────────────────
const uploadsDir = join(__dirname, '../uploads')
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error)

// ─── Multer config ────────────────────────────────────────────────────────────
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
  limits: { fileSize: 10 * 1024 * 1024 },
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

// ─── AI-based resume/CV validator ─────────────────────────────────────────────
// Sends the first ~1500 characters of extracted text to Gemini and asks it to
// decide whether the document is a resume or CV.  Non-resume documents are
// rejected before any heavy processing happens.
async function validateIsResume(extractedText) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const snippet = extractedText.substring(0, 1500)

  const prompt = `You are a document classifier. 
Your ONLY job is to decide whether the text below is from a resume or CV (curriculum vitae).

A resume/CV typically contains some of these elements:
- Candidate name and contact details (email, phone, LinkedIn, location)
- Work experience or professional history
- Education section (degrees, institutions, dates)
- Skills section (technical skills, tools, languages)
- Certifications, projects, or achievements

Reply with ONLY one of these two words — nothing else:
  RESUME   (if the document is a resume or CV)
  NOT_RESUME  (if the document is anything else, such as a cover letter, academic paper, report, invoice, article, etc.)

Document text:
"""
${snippet}
"""`

  const result = await model.generateContent(prompt)
  const verdict = result.response.text().trim().toUpperCase()

  // Accept any response that starts with "RESUME" (guards against stray punctuation)
  return verdict.startsWith('RESUME')
}

// ─── Helper: clean up uploaded file ──────────────────────────────────────────
async function cleanupFile(filePath) {
  if (!filePath) return
  try {
    await fs.unlink(filePath)
  } catch (err) {
    console.error('Error deleting file:', err)
  }
}

// ─── POST /analyze ────────────────────────────────────────────────────────────
router.post('/analyze', authenticate, upload.single('resume'), async (req, res) => {
  const startTime = Date.now()
  let resume = null

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log(`[${new Date().toISOString()}] Starting analysis for user ${req.user._id}`)

    // ── Step 1: Extract text ──────────────────────────────────────────────────
    console.log(`[${new Date().toISOString()}] Extracting text from: ${req.file.originalname} (${req.file.size} bytes)`)

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

    // Basic text quality checks
    if (!resumeText || resumeText.trim().length < 50) {
      throw new Error('Could not extract sufficient text from the document. The file might be scanned or corrupted. Please use a text-based PDF or Word document.')
    }

    const trimmedText = resumeText.trim()
    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
      throw new Error('Text extraction failed — received metadata instead of document content.')
    }

    const wordCount = resumeText.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount < 20) {
      throw new Error('Document contains insufficient text. Please ensure your file has substantial readable text.')
    }

    console.log(`[${new Date().toISOString()}] Extracted ${resumeText.length} characters, ${wordCount} words`)

    // ── Step 2: AI resume/CV validation ──────────────────────────────────────
    console.log(`[${new Date().toISOString()}] Validating document type with AI...`)

    let isResume = false
    try {
      isResume = await validateIsResume(resumeText)
    } catch (validationError) {
      // If the classification call itself fails, log and reject safely
      console.error(`[${new Date().toISOString()}] Resume validation error:`, validationError.message)
      await cleanupFile(req.file.path)
      return res.status(500).json({
        error: 'Could not validate document type. Please try again.'
      })
    }

    if (!isResume) {
      console.warn(`[${new Date().toISOString()}] Rejected non-resume document: ${req.file.originalname}`)
      await cleanupFile(req.file.path)
      return res.status(422).json({
        error: 'The uploaded document does not appear to be a resume or CV. Please upload a valid resume or curriculum vitae.'
      })
    }

    console.log(`[${new Date().toISOString()}] Document validated as resume/CV. Proceeding with analysis.`)

    // ── Step 3: Full AI analysis ──────────────────────────────────────────────
    console.log(`[${new Date().toISOString()}] Text preview: ${resumeText.substring(0, 150).replace(/\n/g, ' ')}...`)
    console.log(`[${new Date().toISOString()}] Starting AI analysis with ${resumeText.length} characters`)

    const analysis = await analyzeResume(resumeText)
    console.log(`[${new Date().toISOString()}] AI analysis completed in ${Date.now() - startTime}ms`)

    // ── Step 4: Persist to database ───────────────────────────────────────────
    resume = new Resume({
      user: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      analysis: analysis
    })
    await resume.save()

    const analysisResult = await AnalysisResult.create({
      resume: resume._id,
      ats_score: analysis.atsScore,
      grammar_score: null,
      keyword_match_score: analysis.keywordScore,
      overall_score: analysis.overallScore,
      strengths: JSON.stringify(analysis.strengths || []),
      weaknesses: JSON.stringify(analysis.improvements || []),
      suggestions: JSON.stringify(analysis.recommendations || [])
    })

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
    await cleanupFile(req.file?.path)

    const errorMessage = error.message || 'Failed to analyze resume'
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// ─── GET /history ─────────────────────────────────────────────────────────────
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

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id })
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' })
    }
    res.json({ success: true, ...resume.analysis, resumeId: resume._id })
  } catch (error) {
    console.error('Error fetching resume:', error)
    res.status(500).json({ error: 'Failed to fetch resume analysis' })
  }
})

// ─── GET /:id/download ────────────────────────────────────────────────────────
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