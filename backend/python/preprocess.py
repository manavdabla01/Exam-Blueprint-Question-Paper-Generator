#!/usr/bin/env python3
"""
preprocess.py

Image preprocessing microservice for the AI OCR pipeline. Invoked by
Node's ai.service.js via child_process.execFile (never via a shell), so
this script receives its inputs strictly as positional command-line
arguments (sys.argv) — it never reads environment variables, stdin, or
any other implicit input channel for the file paths it operates on.

Responsibilities:
  - Validate the input file exists and is readable.
  - Correct image orientation using embedded EXIF data (a photo taken on
    a phone in portrait mode is very commonly stored "sideways" with a
    rotation flag; auto-orienting it up front means downstream Claude
    Vision always receives an upright image).
  - Convert to RGB (source images may be RGBA, grayscale, palette-based,
    or CMYK; a single consistent color mode simplifies everything
    downstream).
  - Resize overly large images while preserving aspect ratio (very large
    phone-camera photos waste bandwidth/tokens without adding legibility
    beyond a reasonable resolution ceiling).
  - Apply light denoising and contrast improvement to make handwritten
    text easier for Claude Vision to read.
  - Write the processed image to the given output path.
  - Print exactly one JSON object to stdout describing the result, and
    exit 0 on success or exit 1 on failure — nothing else is ever
    printed to stdout, so the Node caller can safely JSON.parse it
    verbatim.

Security:
  - No `os.system`, `subprocess` with shell=True, `eval`, or any other
    shell-interpreting call is used anywhere in this file.
  - Input/output paths are used exactly as given (already validated as
    safe, tenant-scoped paths by the Node layer that constructs them);
    this script does not itself construct paths from untrusted strings
    beyond taking the two argv values it is given.

Usage:
  python3 preprocess.py <input_path> <output_path>
"""

import sys
import os
import json

MAX_DIMENSION_PX = 2000
JPEG_QUALITY = 90


def emit_result(payload):
    """
    Prints exactly one JSON object to stdout and nothing else, so the
    Node caller can parse stdout directly as JSON.

    Args:
        payload (dict): The result payload to serialize and print.
    """
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def fail(message):
    """
    Emits a JSON failure result to stdout and exits with a non-zero
    status code.

    Args:
        message (str): Human-readable description of what went wrong.
    """
    emit_result({"success": False, "error": message})
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        fail("Expected exactly 2 arguments: <input_path> <output_path>")
        return

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.isfile(input_path):
        fail("Input file does not exist: {}".format(input_path))
        return

    try:
        # Imported here (rather than at module scope) so that a missing
        # Pillow installation is reported through the same structured
        # JSON error contract as any other failure, instead of an
        # unhandled ImportError traceback on stderr.
        from PIL import Image, ImageOps, ImageFilter, ImageEnhance
    except ImportError as import_error:
        fail("Required imaging library is not available: {}".format(str(import_error)))
        return

    try:
        with Image.open(input_path) as source_image:
            # Force Pillow to actually read the pixel data now, so a
            # truncated/corrupted file fails here with a clear error
            # rather than later during save().
            source_image.load()

            original_width, original_height = source_image.size

            # Correct orientation using embedded EXIF rotation data.
            image = ImageOps.exif_transpose(source_image)

            # Convert to a consistent RGB color mode.
            if image.mode != "RGB":
                image = image.convert("RGB")

            # Resize if either dimension exceeds the maximum, preserving
            # aspect ratio.
            width, height = image.size
            if width > MAX_DIMENSION_PX or height > MAX_DIMENSION_PX:
                scale_factor = min(MAX_DIMENSION_PX / width, MAX_DIMENSION_PX / height)
                new_width = max(1, int(width * scale_factor))
                new_height = max(1, int(height * scale_factor))
                image = image.resize((new_width, new_height), Image.LANCZOS)

            # Light denoise: a small median filter smooths sensor noise
            # and JPEG artifacts without meaningfully blurring text
            # strokes.
            image = image.filter(ImageFilter.MedianFilter(size=3))

            # Improve contrast so faint pencil/pen strokes stand out
            # more clearly against the page background.
            image = ImageOps.autocontrast(image, cutoff=1)
            contrast_enhancer = ImageEnhance.Contrast(image)
            image = contrast_enhancer.enhance(1.2)

            image.save(output_path, format="JPEG", quality=JPEG_QUALITY)

            final_width, final_height = image.size

    except Exception as processing_error:  # noqa: BLE001 - intentionally broad: any failure must produce structured JSON, never a raw traceback
        fail("Image preprocessing failed: {}".format(str(processing_error)))
        return

    emit_result(
        {
            "success": True,
            "outputPath": output_path,
            "originalWidth": original_width,
            "originalHeight": original_height,
            "width": final_width,
            "height": final_height,
        }
    )


if __name__ == "__main__":
    main()
