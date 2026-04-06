/**
 * Client-side image compression utility.
 * Ensures images are ≤ 1MB and max 1200px on longest side.
 */

export interface CompressResult {
  blob: Blob
  width: number
  height: number
  originalSize: number
  compressedSize: number
}

export async function compressImage(
  file: File,
  maxDimension = 1200,
  maxBytes = 1024 * 1024, // 1 MB
  quality = 0.85,
): Promise<CompressResult> {
  const originalSize = file.size

  // If already small enough and is JPEG/WebP, skip compression
  if (originalSize <= maxBytes && /\.(jpe?g|webp)$/i.test(file.name)) {
    return {
      blob: file,
      width: 0,
      height: 0,
      originalSize,
      compressedSize: originalSize,
    }
  }

  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap

  // Scale down if needed
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // Try WebP first, fall back to JPEG
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  if (blob.size > maxBytes) {
    // Reduce quality iteratively
    let q = quality - 0.1
    while (blob.size > maxBytes && q > 0.3) {
      blob = await canvas.convertToBlob({ type: 'image/webp', quality: q })
      q -= 0.1
    }
  }
  // If still too large, try JPEG
  if (blob.size > maxBytes) {
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
  }

  return {
    blob,
    width,
    height,
    originalSize,
    compressedSize: blob.size,
  }
}
