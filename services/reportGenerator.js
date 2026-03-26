import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function generatePDFReport(analysisData, userData) {
  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport
    })

    const page = await browser.newPage()
    const htmlContent = generateHTMLReport(analysisData, userData)
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      }
    })

    await browser.close()
    return pdf
  } catch (error) {
    console.error('Error generating PDF report:', error)
    throw new Error('Failed to generate PDF report')
  }
}

function generateHTMLReport(analysis, user) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Resume Analysis Report</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
          line-height: 1.6;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          border-radius: 10px;
          margin-bottom: 30px;
          text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { font-size: 1.1em; opacity: 0.9; }
        .report-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .info-item { margin: 10px 0; }
        .info-label { font-weight: 600; color: #666; }
        .scores-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .score-card {
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          padding: 20px;
          text-align: center;
        }
        .score-card h3 { color: #667eea; margin-bottom: 15px; font-size: 1.1em; }
        .score-value { font-size: 3em; font-weight: bold; color: #333; margin: 10px 0; }
        .score-label { color: #666; font-size: 0.9em; }
        .section {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 25px;
          margin-bottom: 25px;
        }
        .section h2 {
          color: #667eea;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #667eea;
        }
        .section ul { list-style: none; padding-left: 0; }
        .section li {
          padding: 10px;
          margin-bottom: 8px;
          background: #f8f9fa;
          border-left: 4px solid #667eea;
          border-radius: 4px;
        }
        .skills-tags { display: flex; flex-wrap: wrap; gap: 10px; }
        .skill-tag {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9em;
        }
        .footer {
          text-align: center;
          color: #666;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Resume Analysis Report</h1>
        <p>Comprehensive AI-Powered Resume Analysis</p>
      </div>

      <div class="report-info">
        <div class="info-item"><span class="info-label">Generated for:</span> ${user?.name || 'User'}</div>
        <div class="info-item"><span class="info-label">Date:</span> ${currentDate}</div>
        <div class="info-item"><span class="info-label">Overall Score:</span> ${analysis.overallScore || 'N/A'}/100</div>
      </div>

      <div class="scores-grid">
        ${['Overall', 'ATS', 'Keyword', 'Formatting', 'Contact', 'Education', 'Experience', 'Skills', 'Structure']
          .map(label => {
            const key = label.toLowerCase() + 'Score'
            return `
            <div class="score-card">
              <h3>${label} Score</h3>
              <div class="score-value">${analysis[key] || 'N/A'}</div>
              <div class="score-label">/ 100</div>
            </div>`
          }).join('')}
      </div>

      <div class="section">
        <h2>Strengths</h2>
        <ul>${(analysis.strengths || []).map(s => `<li>${s}</li>`).join('')}</ul>
      </div>

      <div class="section">
        <h2>Areas for Improvement</h2>
        <ul>${(analysis.improvements || []).map(i => `<li>${i}</li>`).join('')}</ul>
      </div>

      ${analysis.skills?.length > 0 ? `
      <div class="section">
        <h2>Skills Identified</h2>
        <div class="skills-tags">
          ${analysis.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="section">
        <h2>Detailed Analysis</h2>
        <p>${analysis.detailedAnalysis || 'No detailed analysis available.'}</p>
      </div>

      <div class="section">
        <h2>Recommendations</h2>
        <ul>${(analysis.recommendations || []).map(r => `<li>${r}</li>`).join('')}</ul>
      </div>

      ${analysis.atsRecommendations?.length > 0 ? `
      <div class="section">
        <h2>ATS Optimization Tips</h2>
        <ul>${analysis.atsRecommendations.map(r => `<li>${r}</li>`).join('')}</ul>
      </div>` : ''}

      ${analysis.missingKeywords?.length > 0 ? `
      <div class="section">
        <h2>Suggested Keywords</h2>
        <div class="skills-tags">
          ${analysis.missingKeywords.map(k => `<span class="skill-tag">${k}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="footer">
        <p>Generated by AI Resume Analyzer</p>
        <p>This report is confidential and intended for the recipient only.</p>
      </div>
    </body>
    </html>
  `
}