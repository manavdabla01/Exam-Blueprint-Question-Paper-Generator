-- ============================================================
-- DATABASE INITIALIZATION
-- ============================================================
CREATE DATABASE IF NOT EXISTS exam_saas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE exam_saas;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- TABLE: teachers
-- ============================================================
CREATE TABLE teachers (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    public_id           CHAR(36)        NOT NULL,
    email               VARCHAR(255)    NOT NULL,
    password_hash       VARCHAR(255)    NOT NULL,
    institute_name      VARCHAR(150)    NOT NULL,
    phone               VARCHAR(20)     DEFAULT NULL,
    status              ENUM('active', 'suspended', 'pending_verification') NOT NULL DEFAULT 'pending_verification',
    email_verified_at   DATETIME        DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        DEFAULT NULL,

    UNIQUE KEY uq_teachers_email (email),
    UNIQUE KEY uq_teachers_public_id (public_id),
    KEY idx_teachers_status (status),
    KEY idx_teachers_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: refresh_tokens
-- ============================================================
CREATE TABLE refresh_tokens (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    teacher_id          INT UNSIGNED    NOT NULL,
    token_hash          VARCHAR(255)    NOT NULL,
    expires_at          DATETIME        NOT NULL,
    revoked_at          DATETIME        DEFAULT NULL,
    ip_address          VARCHAR(45)     DEFAULT NULL,
    user_agent          VARCHAR(255)    DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_refresh_token_hash (token_hash),
    KEY idx_refresh_teacher_id (teacher_id),
    KEY idx_refresh_expires_at (expires_at),

    CONSTRAINT fk_refresh_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: login_audit_logs
-- Purpose: login attempts, failed logins, suspicious activity,
--          future admin analytics, security investigations
-- ============================================================
CREATE TABLE login_audit_logs (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    teacher_id          INT UNSIGNED    DEFAULT NULL,
    email_attempted     VARCHAR(255)    NOT NULL,
    status              ENUM('success', 'failed_password', 'failed_not_found', 'failed_suspended', 'failed_unverified') NOT NULL,
    ip_address          VARCHAR(45)     NOT NULL,
    user_agent          VARCHAR(255)    DEFAULT NULL,
    failure_reason      VARCHAR(255)    DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_login_audit_teacher_id (teacher_id),
    KEY idx_login_audit_email (email_attempted),
    KEY idx_login_audit_created_at (created_at),
    KEY idx_login_audit_status (status),
    KEY idx_login_audit_ip (ip_address),

    CONSTRAINT fk_login_audit_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: subjects
-- ============================================================
CREATE TABLE subjects (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    public_id           CHAR(36)        NOT NULL,
    teacher_id          INT UNSIGNED    NOT NULL,
    name                VARCHAR(100)    NOT NULL,
    grade               VARCHAR(30)     NOT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        DEFAULT NULL,

    UNIQUE KEY uq_subjects_public_id (public_id),
    UNIQUE KEY uq_subjects_teacher_name_grade (teacher_id, name, grade),
    KEY idx_subjects_teacher_id (teacher_id),
    KEY idx_subjects_deleted_at (deleted_at),

    CONSTRAINT fk_subjects_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: source_materials
-- ============================================================
CREATE TABLE source_materials (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    public_id           CHAR(36)        NOT NULL,
    teacher_id          INT UNSIGNED    NOT NULL,   -- denormalized for tenant-scoped hot reads
    subject_id          INT UNSIGNED    NOT NULL,
    source_type         ENUM('text', 'file', 'image') NOT NULL,
    original_filename    VARCHAR(255)    DEFAULT NULL,
    file_path           VARCHAR(500)    DEFAULT NULL,
    file_size_bytes      INT UNSIGNED    DEFAULT NULL,
    mime_type           VARCHAR(100)    DEFAULT NULL,
    raw_text_content     LONGTEXT        DEFAULT NULL,  -- used only when source_type = 'text'
    status              ENUM('pending', 'processing', 'processed', 'failed_legibility', 'error') NOT NULL DEFAULT 'pending',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        DEFAULT NULL,

    UNIQUE KEY uq_source_public_id (public_id),
    KEY idx_source_teacher_id (teacher_id),
    KEY idx_source_subject_id (subject_id),
    KEY idx_source_status (status),
    KEY idx_source_teacher_subject (teacher_id, subject_id),
    KEY idx_source_deleted_at (deleted_at),

    CONSTRAINT fk_source_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_source_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_source_file_size
        CHECK (file_size_bytes IS NULL OR file_size_bytes <= 5242880)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: transcriptions
-- ============================================================
CREATE TABLE transcriptions (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source_material_id  BIGINT UNSIGNED NOT NULL,
    transcribed_text     LONGTEXT        DEFAULT NULL,
    legibility_score     DECIMAL(4,3)    DEFAULT NULL, -- 0.000 to 1.000
    gatekeeper_status    ENUM('passed', 'failed', 'pending_review') NOT NULL DEFAULT 'pending_review',
    self_correction_attempted TINYINT(1) NOT NULL DEFAULT 0,
    claude_model_used     VARCHAR(100)    DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_transcription_source (source_material_id),
    KEY idx_transcription_status (gatekeeper_status),

    CONSTRAINT fk_transcription_source
        FOREIGN KEY (source_material_id) REFERENCES source_materials(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_legibility_score
        CHECK (legibility_score IS NULL OR (legibility_score >= 0 AND legibility_score <= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: exam_blueprints
-- ============================================================
CREATE TABLE exam_blueprints (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    public_id           CHAR(36)        NOT NULL,
    teacher_id          INT UNSIGNED    NOT NULL,
    subject_id          INT UNSIGNED    NOT NULL,
    name                VARCHAR(150)    NOT NULL,
    board_reference      VARCHAR(100)    DEFAULT NULL,  -- e.g. 'CBSE', 'ICSE', 'State Board'
    structure_json       JSON            NOT NULL,       -- section/marks/question-type schema
    total_marks          SMALLINT UNSIGNED NOT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        DEFAULT NULL,

    UNIQUE KEY uq_blueprint_public_id (public_id),
    KEY idx_blueprint_teacher_id (teacher_id),
    KEY idx_blueprint_subject_id (subject_id),
    KEY idx_blueprint_deleted_at (deleted_at),

    CONSTRAINT fk_blueprint_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_blueprint_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_blueprint_total_marks
        CHECK (total_marks > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: generated_exams
-- ============================================================
CREATE TABLE generated_exams (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    public_id           CHAR(36)        NOT NULL,
    teacher_id          INT UNSIGNED    NOT NULL,   -- denormalized for tenant-scoped hot reads
    subject_id          INT UNSIGNED    NOT NULL,   -- denormalized to avoid join through blueprint
    blueprint_id        INT UNSIGNED    NOT NULL,
    title               VARCHAR(200)    NOT NULL,
    content_json         JSON            NOT NULL,   -- full question paper structure
    status              ENUM('generating', 'completed', 'failed', 'regenerating') NOT NULL DEFAULT 'generating',
    claude_model_used     VARCHAR(100)    DEFAULT NULL,
    generation_attempts   TINYINT UNSIGNED NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME        DEFAULT NULL,

    UNIQUE KEY uq_generated_exam_public_id (public_id),
    KEY idx_generated_teacher_id (teacher_id),
    KEY idx_generated_subject_id (subject_id),
    KEY idx_generated_blueprint_id (blueprint_id),
    KEY idx_generated_status (status),
    KEY idx_generated_teacher_created (teacher_id, created_at),
    KEY idx_generated_deleted_at (deleted_at),

    CONSTRAINT fk_generated_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_generated_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_generated_blueprint
        FOREIGN KEY (blueprint_id) REFERENCES exam_blueprints(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_generation_attempts
        CHECK (generation_attempts >= 1 AND generation_attempts <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;