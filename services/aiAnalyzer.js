import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

dotenv.config()

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Resume analysis will fail until it is configured.')
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null

// Timeout helper
function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), ms)
  })
}

// Manual field extraction helper for malformed JSON
function extractFieldsManually(text) {
  const result = {}
  
  // Extract numeric scores
  const scorePatterns = {
    overallScore: /"overallScore"\s*:\s*(\d+)/i,
    atsScore: /"atsScore"\s*:\s*(\d+)/i,
    keywordScore: /"keywordScore"\s*:\s*(\d+)/i,
    formattingScore: /"formattingScore"\s*:\s*(\d+)/i,
    contactScore: /"contactScore"\s*:\s*(\d+)/i,
    educationScore: /"educationScore"\s*:\s*(\d+)/i,
    experienceScore: /"experienceScore"\s*:\s*(\d+)/i,
    skillsScore: /"skillsScore"\s*:\s*(\d+)/i,
    structureScore: /"structureScore"\s*:\s*(\d+)/i
  }
  
  for (const [key, pattern] of Object.entries(scorePatterns)) {
    const match = text.match(pattern)
    if (match) {
      result[key] = parseInt(match[1], 10)
    }
  }
  
  // Extract arrays (strengths, improvements, etc.) - use non-greedy but handle multiline
  const arrayPatterns = {
    strengths: /"strengths"\s*:\s*\[(.*?)(?=\]\s*[,}])/is,
    improvements: /"improvements"\s*:\s*\[(.*?)(?=\]\s*[,}])/is,
    skills: /"skills"\s*:\s*\[(.*?)(?=\]\s*[,}])/is,
    recommendations: /"recommendations"\s*:\s*\[(.*?)(?=\]\s*[,}])/is,
    atsRecommendations: /"atsRecommendations"\s*:\s*\[(.*?)(?=\]\s*[,}])/is,
    missingKeywords: /"missingKeywords"\s*:\s*\[(.*?)(?=\]\s*[,}])/is
  }
  
  for (const [key, pattern] of Object.entries(arrayPatterns)) {
    const match = text.match(pattern)
    if (match) {
      // Extract strings from array - handle multiline strings
      const arrayContent = match[1]
      // Match quoted strings that may span multiple lines
      const stringMatches = arrayContent.match(/"([^"\\]*(\\.[^"\\]*)*)"/g)
      if (stringMatches) {
        result[key] = stringMatches.map(s => {
          // Remove quotes and unescape
          return s.slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
        }).filter(s => s.trim().length > 0)
      } else {
        result[key] = []
      }
    }
  }
  
  // Extract detailedAnalysis (text between quotes, may span multiple lines)
  // Try multiline string first
  const analysisMatch = text.match(/"detailedAnalysis"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/is)
  if (analysisMatch) {
    result.detailedAnalysis = analysisMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim()
  } else {
    // Try without quotes or with single quotes
    const analysisMatch2 = text.match(/"detailedAnalysis"\s*:\s*["']([^"']+)["']/is)
    if (analysisMatch2) {
      result.detailedAnalysis = analysisMatch2[1].trim()
    } else {
      // Try to find text after detailedAnalysis: until next field or end
      const analysisMatch3 = text.match(/"detailedAnalysis"\s*:\s*([^,}]+?)(?=\s*[,}])/is)
      if (analysisMatch3) {
        result.detailedAnalysis = analysisMatch3[1].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  
  return result
}

export async function analyzeResume(resumeText) {
  if (!genAI) {
    throw new Error('Gemini AI is not configured. Please set GEMINI_API_KEY in your environment.')
  }

  try {
    // Validate that we have actual resume text, not JSON/metadata
    const trimmedText = resumeText.trim()
    if (trimmedText.startsWith('{') || trimmedText.startsWith('[') || trimmedText.includes('"metadata"')) {
      console.error('[AI Analysis] ERROR: Received JSON/metadata instead of resume text!')
      throw new Error('Invalid input: Received metadata instead of resume text. Please ensure your PDF contains selectable text content.')
    }
    
    // Check minimum content quality
    const wordCount = resumeText.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount < 20) {
      throw new Error('Resume text is too short or invalid. Please ensure your resume contains substantial readable text.')
    }
    
    // Analyze more text for better results (up to 8000 chars)
    const textToAnalyze = resumeText.substring(0, 8000)
    
    console.log(`[AI Analysis] Analyzing ${textToAnalyze.length} characters (${wordCount} words) of resume text`)
    console.log(`[AI Analysis] Text preview: ${textToAnalyze.substring(0, 150).replace(/\n/g, ' ')}...`)
    
    // Comprehensive but concise prompt to avoid truncation
    const prompt = `Analyze this resume and return ONLY valid JSON (no markdown, no explanations):

{
  "overallScore": <0-100>,
  "atsScore": <0-100>,
  "keywordScore": <0-100>,
  "formattingScore": <0-100>,
  "contactScore": <0-100>,
  "educationScore": <0-100>,
  "experienceScore": <0-100>,
  "skillsScore": <0-100>,
  "structureScore": <0-100>,
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3", "specific strength 4", "specific strength 5"],
  "improvements": ["specific improvement 1", "specific improvement 2", "specific improvement 3", "specific improvement 4", "specific improvement 5"],
  "detailedAnalysis": "2-3 paragraph analysis mentioning specific details from the resume",
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"],
  "atsRecommendations": ["ATS tip 1", "ATS tip 2", "ATS tip 3"],
  "missingKeywords": ["keyword1", "keyword2", "keyword3"]
}

Resume:
${textToAnalyze}

Analyze the ACTUAL resume content above. Provide SPECIFIC feedback based on what you see.`

    // Use Gemini 2.5 Flash model (fast and reliable)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7, // Higher temperature for more creative, detailed analysis
        maxOutputTokens: 4000, // Increased to prevent truncation
        topP: 0.95,
        topK: 40
      }
    })

    console.log('[AI Analysis] Sending request to Gemini API...')
    const startTime = Date.now()
    
    // Add 45 second timeout for more detailed analysis
    const analysisPromise = model.generateContent(prompt)
    const timeoutPromise_45s = timeoutPromise(45000)
    
    const result = await Promise.race([analysisPromise, timeoutPromise_45s])
    const responseText = result.response.text()
    
    const analysisTime = Date.now() - startTime
    console.log(`[AI Analysis] Received response in ${analysisTime}ms, length: ${responseText.length} chars`)
    console.log(`[AI Analysis] Response preview: ${responseText.substring(0, 500)}`)

    // Try to extract JSON from the response (handle markdown code blocks and extra text)
    let jsonText = responseText.trim()
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    
    // Try to find JSON object - look for the first { and try to match to the last }
    let jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    
    // If no match, try to find incomplete JSON and fix it
    if (!jsonMatch) {
      // Look for JSON-like structure starting with {
      const startIndex = jsonText.indexOf('{')
      if (startIndex !== -1) {
        // Try to extract from { to end, then try to fix missing closing brace
        let potentialJson = jsonText.substring(startIndex)
        
        // Count braces to see if it's balanced
        const openBraces = (potentialJson.match(/\{/g) || []).length
        const closeBraces = (potentialJson.match(/\}/g) || []).length
        
        // If missing closing braces, try to add them
        if (openBraces > closeBraces) {
          console.warn(`[AI Analysis] JSON appears incomplete (${openBraces} open, ${closeBraces} close braces). Attempting to fix...`)
          // Try to find the last complete field and add closing braces
          const lastCommaIndex = potentialJson.lastIndexOf(',')
          if (lastCommaIndex !== -1) {
            // Remove trailing comma and add closing braces
            potentialJson = potentialJson.substring(0, lastCommaIndex) + 
                          '}' + 
                          '}'.repeat(openBraces - closeBraces - 1)
            jsonMatch = [potentialJson]
          }
        } else {
          // Try to extract what we have
          jsonMatch = [potentialJson]
        }
      }
    }
    
    if (jsonMatch && jsonMatch[0]) {
      try {
        let jsonString = jsonMatch[0].trim()
        
        // Try to fix common JSON issues
        // Remove trailing commas before closing braces/brackets
        jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1')
        
        // Try parsing
        let parsed
        try {
          parsed = JSON.parse(jsonString)
        } catch (parseError) {
          // If parsing fails, try to extract individual fields manually
          console.warn('[AI Analysis] JSON parse failed, attempting manual extraction...')
          parsed = extractFieldsManually(jsonString)
        }
        
        console.log('[AI Analysis] Successfully parsed JSON response')
        console.log(`[AI Analysis] Scores - Overall: ${parsed.overallScore || 'N/A'}, ATS: ${parsed.atsScore || 'N/A'}, Skills found: ${parsed.skills?.length || 0}`)
        
        // Validate and ensure all required fields exist with proper defaults
        const analysis = {
          overallScore: typeof parsed.overallScore === 'number' ? Math.max(0, Math.min(100, parsed.overallScore)) : 0,
          atsScore: typeof parsed.atsScore === 'number' ? Math.max(0, Math.min(100, parsed.atsScore)) : 0,
          keywordScore: typeof parsed.keywordScore === 'number' ? Math.max(0, Math.min(100, parsed.keywordScore)) : 0,
          formattingScore: typeof parsed.formattingScore === 'number' ? Math.max(0, Math.min(100, parsed.formattingScore)) : 0,
          contactScore: typeof parsed.contactScore === 'number' ? Math.max(0, Math.min(100, parsed.contactScore)) : 0,
          educationScore: typeof parsed.educationScore === 'number' ? Math.max(0, Math.min(100, parsed.educationScore)) : 0,
          experienceScore: typeof parsed.experienceScore === 'number' ? Math.max(0, Math.min(100, parsed.experienceScore)) : 0,
          skillsScore: typeof parsed.skillsScore === 'number' ? Math.max(0, Math.min(100, parsed.skillsScore)) : 0,
          structureScore: typeof parsed.structureScore === 'number' ? Math.max(0, Math.min(100, parsed.structureScore)) : 0,
          strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 
            ? parsed.strengths.filter(s => s && s.trim().length > 0)
            : [],
          improvements: Array.isArray(parsed.improvements) && parsed.improvements.length > 0
            ? parsed.improvements.filter(i => i && i.trim().length > 0)
            : [],
          detailedAnalysis: parsed.detailedAnalysis && parsed.detailedAnalysis.trim().length > 0
            ? parsed.detailedAnalysis.trim()
            : 'Analysis completed. Please review the scores and recommendations below.',
          skills: Array.isArray(parsed.skills) && parsed.skills.length > 0
            ? parsed.skills.filter(s => s && s.trim().length > 0)
            : [],
          recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
            ? parsed.recommendations.filter(r => r && r.trim().length > 0)
            : [],
          atsRecommendations: Array.isArray(parsed.atsRecommendations) && parsed.atsRecommendations.length > 0
            ? parsed.atsRecommendations.filter(a => a && a.trim().length > 0)
            : [],
          missingKeywords: Array.isArray(parsed.missingKeywords) && parsed.missingKeywords.length > 0
            ? parsed.missingKeywords.filter(k => k && k.trim().length > 0)
            : []
        }
        
        // Log if we got meaningful analysis
        if (analysis.detailedAnalysis.length > 50 && analysis.strengths.length > 0) {
          console.log('[AI Analysis] ✅ Received detailed, personalized analysis')
        } else {
          console.warn('[AI Analysis] ⚠️ Analysis may be too generic, check prompt')
        }
        
        return analysis
      } catch (parseError) {
        console.error('[AI Analysis] JSON parse error:', parseError.message)
        console.error('[AI Analysis] Full response:', responseText)
        
        // Try manual field extraction as last resort
        try {
          console.log('[AI Analysis] Attempting manual field extraction...')
          const manualParsed = extractFieldsManually(responseText)
          if (manualParsed && manualParsed.overallScore !== undefined) {
            console.log('[AI Analysis] Manual extraction successful!')
            parsed = manualParsed
          } else {
            throw new Error('Manual extraction also failed')
          }
        } catch (manualError) {
          throw new Error(`Failed to parse AI response: ${parseError.message}. Response preview: ${responseText.substring(0, 300)}`)
        }
      }
    } else {
      console.error('[AI Analysis] No JSON found in response')
      console.error('[AI Analysis] Full response:', responseText)
      
      // Last attempt: try to extract fields manually from the raw response
      try {
        console.log('[AI Analysis] Attempting manual field extraction from raw response...')
        const manualParsed = extractFieldsManually(responseText)
        if (manualParsed && manualParsed.overallScore !== undefined) {
          console.log('[AI Analysis] Manual extraction from raw response successful!')
          parsed = manualParsed
        } else {
          throw new Error('No valid data found')
        }
      } catch (manualError) {
        throw new Error(`Invalid response format from Gemini (no JSON found). Response: ${responseText.substring(0, 500)}`)
      }
    }
    
    // Ensure parsed exists before proceeding
    if (!parsed) {
      throw new Error('Failed to extract any data from AI response')
    }
  } catch (error) {
    console.error('Error analyzing resume with Gemini:', error.message)
    if (error.message === 'Request timeout') {
      throw new Error('Analysis timed out. Please try again with a shorter resume.')
    }
    throw new Error(`Failed to analyze resume: ${error.message}`)
  }
}

