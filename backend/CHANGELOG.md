# Changelog

All notable changes to this project will be documented here.

---

## v0.1.0

### Added

- Project architecture
- Database schema
- Backend bootstrap
- Security foundation

---

## v0.2.0 - Authentication Complete

### Added

- Teacher registration
- Secure login
- JWT access token authentication
- Refresh token rotation
- Logout endpoint
- Login audit logging
- Repository-Service-Controller implementation
- Joi request validation
- Rate limiting
- Secure public DTO mapping

### Security

- SHA-256 hashed refresh tokens
- Generic authentication failure responses
- Transactional token rotation
- Audit trail for every login attempt
- Parameterized SQL queries


## v0.3.0 - Academic Domain

### Added

- Subject CRUD
- Source Material metadata CRUD
- Search, pagination and sorting
- Tenant-scoped repositories
- Soft delete support
- Source material DTO mapping

### Changed

- Added title and description fields to source_materials
- Introduced migration 002

### Security

- Cross-tenant requests return 404
- Repository-level ownership enforcement
- Immutable source content after creation


## v0.4.0 - Secure Upload Pipeline

### Added

- Secure multipart file upload
- PDF, DOCX and image support
- Tenant-isolated file storage
- MIME and extension validation
- Filename sanitization
- UUID-based stored filenames

### Security

- Path traversal protection
- Executable file rejection
- Source type ↔ MIME verification
- Best-effort orphan cleanup
- Hidden filesystem paths

## v0.5.0 - Processing Pipeline

### Added

- Processing module
- Transactional processing state machine
- Row-level locking
- Processing lifecycle management
- Retry attempt tracking
- Failure reason tracking

### Security

- Race-condition safe processing
- Tenant-scoped processing
- Duplicate processing prevention

### Database

- Added processing timestamps
- Added retry counters
- Added processing index


## v0.6.0 - AI Engine

### Added

- Python image preprocessing
- Claude Vision OCR
- Handwriting legibility gatekeeper
- Automatic self-correction pass
- OCR pipeline integration
- AI transcription endpoint

### Improved

- Processing pipeline now performs complete OCR lifecycle
- Infrastructure failures automatically recover processing state

### Security

- argv-only Python execution
- Temporary file cleanup
- No OCR hallucination policy
- Distinct handling for infrastructure vs legibility failures


## v0.7.0 - Exam Blueprint Foundation

### Added

- Exam blueprint CRUD
- Blueprint structure validation
- Queued exam generation requests
- AI context builder
- Processed source selection
- Generated exam metadata management

### Validation

- Difficulty distribution totals
- Question type totals
- Chapter weightage totals

### Security

- Tenant ownership validation
- Processed-source enforcement
- Queue-only generation workflow

## v0.8.0 - AI Exam Generation

### Added

- Claude-powered exam generation
- Blueprint-aware validation
- Structured AI prompting
- Generation retry mechanism
- Exam persistence
- Generation metrics

### Validation

- Strict JSON validation
- Question count validation
- Marks validation
- Blueprint consistency validation

### Security

- Tenant ownership enforcement
- No partial exam persistence
- Retry only for transient AI failures

## v0.9.0 - PDF Export

### Added

- Print-ready PDF generation
- Unicode font embedding
- Multi-page exam rendering
- A4 portrait layout
- Page numbering
- Teacher-owned PDF downloads

### Performance

- In-memory PDF generation
- No temporary files

### Security

- Tenant ownership validation
- Public IDs only
- Binary PDF response