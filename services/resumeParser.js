import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import fs from 'fs/promises'

export function parseResumeData(resumeText) {
  const parsed = {
    full_name: null,
    email: null,
    phone: null,
    location: null,
    education_data: [],
    experience_data: [],
    project_data: []
  }

  try {
    const lines = resumeText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    const text = resumeText.toLowerCase()

    // Extract email (common pattern)
    const emailMatch = resumeText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
    if (emailMatch) {
      parsed.email = emailMatch[0]
    }

    // Extract phone (various formats)
    const phonePatterns = [
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
      /\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b/,
      /\b\+\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
      /\b\d{10}\b/
    ]
    for (const pattern of phonePatterns) {
      const match = resumeText.match(pattern)
      if (match) {
        parsed.phone = match[0].replace(/\s+/g, '').substring(0, 20)
        break
      }
    }

    // Extract location (look for common location keywords)
    const locationKeywords = ['city', 'state', 'country', 'address', 'location', 'based in', 'residing in']
    const locationPattern = new RegExp(`(${locationKeywords.join('|')}):?\\s*([^\\n]+)`, 'i')
    const locationMatch = resumeText.match(locationPattern)
    if (locationMatch && locationMatch[2]) {
      parsed.location = locationMatch[2].trim().substring(0, 100)
    } else {
      // Try to find common location patterns at the top
      const topLines = lines.slice(0, 5).join(' ')
      const cityStateMatch = topLines.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)\b/)
      if (cityStateMatch) {
        parsed.location = cityStateMatch[0].substring(0, 100)
      }
    }

    // Extract full name (usually first line or before email)
    if (lines.length > 0) {
      const firstLine = lines[0]
      // Name is usually before email/phone, and contains 2-4 capitalized words
      if (!firstLine.includes('@') && !firstLine.match(/\d{3}/)) {
        const nameWords = firstLine.split(/\s+/).filter(w => w.length > 1)
        if (nameWords.length >= 2 && nameWords.length <= 4) {
          // Check if it looks like a name (starts with capital, no special chars except hyphens)
          if (nameWords.every(w => /^[A-Z][a-z-]+$/.test(w))) {
            parsed.full_name = firstLine.substring(0, 100)
          }
        }
      }
    }

    // Extract education data
    const educationKeywords = ['education', 'academic', 'qualification', 'degree', 'university', 'college', 'school']
    let educationStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (educationKeywords.some(keyword => line.includes(keyword))) {
        educationStartIndex = i
        break
      }
    }

    if (educationStartIndex !== -1) {
      const educationLines = []
      for (let i = educationStartIndex + 1; i < Math.min(educationStartIndex + 20, lines.length); i++) {
        const line = lines[i]
        // Stop at next major section
        if (line.match(/^(experience|work|projects|skills|summary|objective)/i)) {
          break
        }
        if (line.length > 5 && !line.match(/^[-•\s]+$/)) {
          educationLines.push(line)
        }
      }
      
      if (educationLines.length > 0) {
        parsed.education_data = educationLines.slice(0, 10).map(line => ({
          institution: line.substring(0, 200),
          details: line
        }))
      }
    }

    // Extract experience data
    const experienceKeywords = ['experience', 'work', 'employment', 'career', 'professional']
    let experienceStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (experienceKeywords.some(keyword => line.includes(keyword))) {
        experienceStartIndex = i
        break
      }
    }

    if (experienceStartIndex !== -1) {
      const experienceLines = []
      for (let i = experienceStartIndex + 1; i < Math.min(experienceStartIndex + 30, lines.length); i++) {
        const line = lines[i]
        // Stop at next major section
        if (line.match(/^(education|projects|skills|summary|objective|references)/i)) {
          break
        }
        if (line.length > 5 && !line.match(/^[-•\s]+$/)) {
          experienceLines.push(line)
        }
      }
      
      if (experienceLines.length > 0) {
        parsed.experience_data = experienceLines.slice(0, 15).map(line => ({
          position: line.substring(0, 200),
          details: line
        }))
      }
    }

    // Extract project data
    const projectKeywords = ['projects', 'project', 'portfolio', 'work samples']
    let projectStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (projectKeywords.some(keyword => line.includes(keyword))) {
        projectStartIndex = i
        break
      }
    }

    if (projectStartIndex !== -1) {
      const projectLines = []
      for (let i = projectStartIndex + 1; i < Math.min(projectStartIndex + 20, lines.length); i++) {
        const line = lines[i]
        // Stop at next major section
        if (line.match(/^(education|experience|skills|summary|objective|references)/i)) {
          break
        }
        if (line.length > 5 && !line.match(/^[-•\s]+$/)) {
          projectLines.push(line)
        }
      }
      
      if (projectLines.length > 0) {
        parsed.project_data = projectLines.slice(0, 10).map(line => ({
          name: line.substring(0, 200),
          details: line
        }))
      }
    }

    // Determine parsing status
    const hasData = parsed.full_name || parsed.email || parsed.phone || 
                    parsed.education_data.length > 0 || parsed.experience_data.length > 0 || 
                    parsed.project_data.length > 0

    return {
      ...parsed,
      parsing_status: hasData ? 'SUCCESS' : 'FAILED'
    }
  } catch (error) {
    console.error('[Resume Parser] Error parsing resume data:', error)
    return {
      ...parsed,
      parsing_status: 'FAILED'
    }
  }
}

export async function extractTextFromResume(filePath, mimeType) {
  try {
    // Verify file exists
    try {
      await fs.access(filePath)
    } catch (accessError) {
      throw new Error(`File not found at path: ${filePath}`)
    }
    
    const fileBuffer = await fs.readFile(filePath)
    console.log(`[Text Extraction] File size: ${fileBuffer.length} bytes, MIME type: ${mimeType}`)
    
    if (fileBuffer.length === 0) {
      throw new Error('File is empty (0 bytes)')
    }
    
    if (mimeType === 'application/pdf') {
      // Verify it's actually a PDF by checking magic bytes
      const pdfHeader = fileBuffer.toString('ascii', 0, 4)
      if (pdfHeader !== '%PDF') {
        console.warn(`[Text Extraction] File doesn't start with PDF magic bytes. Got: ${pdfHeader}`)
        // Continue anyway, might still be valid
      }
      
      // Parse PDF - pdf-parse handles all pages by default
      let data
      try {
        data = await pdfParse(fileBuffer)
      } catch (parseError) {
        console.error('[Text Extraction] PDF parse error:', parseError.message)
        if (parseError.message.includes('password') || parseError.message.includes('encrypted')) {
          throw new Error('PDF is password-protected or encrypted. Please remove password protection and try again.')
        }
        throw new Error(`PDF parsing failed: ${parseError.message}`)
      }
      
      let extractedText = data.text || ''
      
      console.log(`[Text Extraction] PDF parsed: ${data.numpages} pages, text length: ${extractedText.length}`)
      
      // Validate that we got actual text content, not metadata
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('This appears to be a scanned PDF (image-based) or the PDF contains no extractable text. Please use a text-based PDF or convert the file to text format.')
      }
      
      // Check if extracted text looks like JSON/metadata (common issue)
      const trimmedText = extractedText.trim()
      if (trimmedText.startsWith('{') && trimmedText.includes('"') && trimmedText.includes(':')) {
        console.error('[Text Extraction] ERROR: Extracted text appears to be JSON metadata, not resume content!')
        throw new Error('PDF text extraction failed - received metadata instead of resume text. The PDF may be corrupted or in an unsupported format. Please try a different PDF file or convert it to a Word document.')
      }
      
      // Clean up the text (preserve structure but normalize whitespace)
      extractedText = extractedText
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\r/g, '\n')   // Handle Mac line endings
        .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
        .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
        .trim()
      
      // Validate minimum content quality
      const wordCount = extractedText.split(/\s+/).filter(w => w.length > 0).length
      console.log(`[Text Extraction] Extracted ${extractedText.length} characters, ${wordCount} words from PDF (${data.numpages} pages)`)
      
      if (extractedText.length < 50) {
        throw new Error('PDF appears to contain very little text. Please ensure it is a text-based PDF with readable content.')
      }
      
      if (wordCount < 20) {
        throw new Error('PDF contains insufficient text content. Please ensure your resume has substantial text content.')
      }
      
      // Log a preview of extracted text for debugging (first 200 chars)
      console.log(`[Text Extraction] Text preview: ${extractedText.substring(0, 200).replace(/\n/g, ' ')}...`)
      
      return extractedText
      
    } else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer })
      let extractedText = result.value || ''
      
      // Clean up the text
      extractedText = extractedText
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      
      console.log(`[Text Extraction] Extracted ${extractedText.length} characters from Word document`)
      
      if (extractedText.length < 10) {
        throw new Error('Word document appears to be empty or unreadable. Please ensure it contains text content.')
      }
      
      if (result.messages && result.messages.length > 0) {
        console.warn('[Text Extraction] Word parsing warnings:', result.messages)
      }
      
      return extractedText
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`)
    }
  } catch (error) {
    console.error('[Text Extraction] Error details:', {
      message: error.message,
      stack: error.stack,
      filePath: filePath,
      mimeType: mimeType
    })
    
    // Provide more helpful error messages
    if (error.message.includes('scanned') || error.message.includes('image-based')) {
      throw error
    } else if (error.message.includes('empty') || error.message.includes('unreadable')) {
      throw error
    } else if (error.message.includes('timeout')) {
      throw new Error('File processing timed out. The file might be too large or corrupted.')
    } else {
      throw new Error(`Failed to extract text: ${error.message}. Please ensure the file is not corrupted and contains readable text.`)
    }
  }
}

