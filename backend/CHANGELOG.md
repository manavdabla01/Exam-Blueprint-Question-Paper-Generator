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