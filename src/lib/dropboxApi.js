/**
 * dropboxApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All Dropbox Chooser logic for the Dancescapes Portal.
 *
 * Responsibilities:
 *  - Lazily inject the Dropbox dropins.js script (once per page lifecycle)
 *  - Expose openDropboxChooser() — a Promise-based wrapper around Dropbox.choose()
 *
 * What this module does NOT do:
 *  - OAuth / user auth
 *  - File uploads to any server
 *  - Folder browsing / embedding
 *  - SDK usage beyond the Chooser dropin
 *
 * All selected Dropbox files are treated as link-based attachments only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DROPBOX_APP_KEY = 's0hnp0b7frldcbb'
const DROPBOX_WEEK_MEDIA_ENDPOINT = '/api/dropbox/week-media'

/** File types accepted by the Chooser — mirrors social media requirements. */
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif']

/**
 * Cached load promise — ensures the script tag is only injected once,
 * even if openDropboxChooser() is called multiple times before the script loads.
 * Reset to null on network failure so callers can retry.
 */
let _loadPromise = null

/**
 * Lazily injects the Dropbox Chooser dropin script into <head>.
 * Subsequent calls return the same Promise until it resolves.
 *
 * @returns {Promise<void>}
 */
function loadDropboxScript() {
  // Already resolved or in-flight
  if (_loadPromise) return _loadPromise

  _loadPromise = new Promise((resolve, reject) => {
    // Script already present and Dropbox global available (e.g., HMR reload)
    if (typeof window !== 'undefined' && window.Dropbox?.choose) {
      resolve()
      return
    }

    // Prevent duplicate <script> tags (e.g., React strict-mode double-mount)
    if (document.getElementById('dropboxjs')) {
      // Tag exists but Dropbox global not yet ready — wait via polling
      const poll = setInterval(() => {
        if (window.Dropbox?.choose) {
          clearInterval(poll)
          resolve()
        }
      }, 100)
      // Give up after 10 s
      setTimeout(() => {
        clearInterval(poll)
        _loadPromise = null
        reject(new Error('Dropbox Chooser timed out while loading.'))
      }, 10_000)
      return
    }

    const script = document.createElement('script')
    script.id = 'dropboxjs'
    script.src = 'https://www.dropbox.com/static/api/2/dropins.js'
    script.setAttribute('data-app-key', DROPBOX_APP_KEY)
    script.async = true

    script.onload = () => resolve()
    script.onerror = () => {
      _loadPromise = null // allow retry on next call
      reject(
        new Error(
          'Could not load Dropbox Chooser. Check your internet connection and try again.'
        )
      )
    }

    document.head.appendChild(script)
  })

  return _loadPromise
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the Dropbox Chooser and resolves with an array of structured file
 * metadata objects once the user confirms their selection.
 *
 * Resolves with [] if the user cancels — this is NOT treated as an error.
 *
 * @param {Object}  [options]
 * @param {boolean} [options.multiselect=true]
 *   Allow the user to pick more than one file at a time.
 * @param {'preview'|'direct'} [options.linkType='preview']
 *   'preview' → Dropbox preview page URL (default, works for all file types)
 *   'direct'  → direct-download URL (only for files the app has access to)
 *
 * @returns {Promise<Array<{
 *   name:      string,       // e.g. "hero-photo.jpg"
 *   size:      number,       // bytes (0 if unavailable)
 *   link:      string,       // Dropbox preview or direct-download URL
 *   thumbnail: string|null,  // 64×64 thumbnail URL for images, else null
 * }>>}
 *
 * @throws {Error} if the Dropbox script fails to load or the Chooser throws
 */
export async function openDropboxChooser(options = {}) {
  await loadDropboxScript()

  if (!window.Dropbox || typeof window.Dropbox.choose !== 'function') {
    throw new Error(
      'Dropbox Chooser is unavailable. Please reload the page and try again.'
    )
  }

  const { multiselect = true, linkType = 'preview' } = options

  return new Promise((resolve, reject) => {
    try {
      window.Dropbox.choose({
        /**
         * Called when the user selects files and clicks "Choose".
         * @param {Array} files — raw Dropbox Chooser file objects
         */
        success(files) {
          const attachments = files
            .filter(f => !f.isDir) // never accept folder objects
            .map(f => ({
              name: f.name,
              size: typeof f.bytes === 'number' ? f.bytes : 0,
              link: f.link,
              // thumbnailLink is only present for image files
              thumbnail: f.thumbnailLink || null,
            }))
          resolve(attachments)
        },

        /** Called when the user closes the Chooser without selecting. */
        cancel() {
          resolve([]) // not an error — caller checks array length
        },

        linkType,
        multiselect,
        extensions: ALLOWED_EXTENSIONS,
      })
    } catch (err) {
      reject(err)
    }
  })
}

export async function fetchDropboxWeekSuggestions({ dateString, postType = '', mediaHint = '' }) {
  if (!dateString) {
    return {
      weekFolder: '',
      suggestions: [],
      message: 'Pick a dated calendar slot to load Dropbox suggestions.',
    }
  }

  const url = new URL(DROPBOX_WEEK_MEDIA_ENDPOINT, window.location.origin)
  url.searchParams.set('date', dateString)
  if (postType) url.searchParams.set('postType', postType)
  if (mediaHint) url.searchParams.set('mediaHint', mediaHint)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load Dropbox media suggestions.')
  }

  return {
    weekFolder: payload.weekFolder || '',
    folderPath: payload.folderPath || '',
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
    message: payload.message || '',
    totalCandidates: Number(payload.totalCandidates || 0),
  }
}
