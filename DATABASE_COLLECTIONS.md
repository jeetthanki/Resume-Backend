# Database Collections Reference

## Overview
This application uses **7 MongoDB collections** to store resume analysis data, aligned with the new table design.

## Collections List

### 1. **users** (user_tbl equivalent)
- Stores user registration and authentication data
- Fields: `name`, `email`, `password`, `role`, `createdAt`

### 2. **resumes** (resume_tbl equivalent)
- Stores uploaded resume files and analysis metadata
- Fields: `user`, `filename`, `originalName`, `filePath`, `fileSize`, `mimeType`, `analysis` (legacy), `uploadedAt`
- New normalized scores are stored in `analysisresults` instead of this embedded `analysis` field.

### 3. **analysisresults** (analysis_results_tbl)
- Stores per-resume analysis scores and summary text
- Fields: `resume`, `ats_score`, `grammar_score`, `keyword_match_score`, `overall_score`, `strengths`, `weaknesses`, `suggestions`, `analyzed_at`

### 4. **skillextracteds** (skill_extracted_tbl)
- Stores skills identified in each resume
- Fields: `resume`, `skill_name`, `skills_path`, `category`

### 5. **feedbacks** (feedback_tbl)
- Stores feedback users give about analyses
- Fields: `user`, `analysis`, `feedback_text`, `rating`, `created_at`

### 6. **adminlogs** (admin_logs_tbl)
- Stores admin actions for auditing
- Fields: `action`, `log_time`

### 7. **resumeparseddatas** (resume_Parsed_Data_tbl)
- Stores structured parsing output for resumes
- Fields: `resume`, `full_name`, `email`, `phone`, `location`, `education_data`, `experience_data`, `project_data`, `parsing_status`

## How Collections Are Created

**Important:** MongoDB collections are created automatically when the first document is inserted. 

- Collections appear in MongoDB Compass **only after** you analyze at least one resume
- If you don't see a collection, it means no data has been inserted yet
- After analyzing a resume, all 6 collections will be created/updated

## Viewing Collections in MongoDB Compass

1. **Connect to:** `mongodb://localhost:27017`
2. **Select database:** `resume-analyzer`
3. **Refresh** if collections don't appear (F5 or refresh button)
4. **Click on collection name** to view documents

## Collection Naming

MongoDB automatically pluralizes model names:
- `User` model → `users` collection
- `Resume` model → `resumes` collection
- `AnalysisResult` model → `analysisresults` collection
- `SkillExtracted` model → `skillextracteds` collection
- `Feedback` model → `feedbacks` collection
- `AdminLog` model → `adminlogs` collection
- `ResumeParsedData` model → `resumeparseddatas` collection

## Checking Collections

Run this command to check all collections:
```bash
node check-collections.js
```

## Current Status

Based on the last check:
- ✅ All 6 collections exist
- ✅ Collections contain data from previous analyses
- ✅ Collections are properly linked via ObjectId references

