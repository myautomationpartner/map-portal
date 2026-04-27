/**
 * Google Picker integration for Publisher media selection.
 *
 * Uses Google Identity Services for a short-lived browser access token and
 * Google Picker for user-selected Drive images. Selected images are downloaded
 * in-browser and returned as File objects so the existing Publisher upload/R2
 * flow can treat them like normal computer uploads.
 */

const GOOGLE_PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY || ''
const GOOGLE_PICKER_CLIENT_ID = import.meta.env.VITE_GOOGLE_PICKER_CLIENT_ID || ''
const GOOGLE_PICKER_APP_ID = import.meta.env.VITE_GOOGLE_PICKER_APP_ID || ''
const GOOGLE_PICKER_SCOPE = 'https://www.googleapis.com/auth/drive.file'

let gapiPromise = null
let gisPromise = null
let pickerPromise = null
let tokenClient = null
let accessToken = ''

function loadScript({ id, src }) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker is only available in the browser.'))
  }

  if (document.getElementById(id)) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google media picker.'))
    document.head.appendChild(script)
  })
}

async function loadGapiPicker() {
  if (!gapiPromise) {
    gapiPromise = loadScript({ id: 'google-api-js', src: 'https://apis.google.com/js/api.js' })
  }
  await gapiPromise

  if (!pickerPromise) {
    pickerPromise = new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Could not load Google Picker.')),
        timeout: 10000,
        ontimeout: () => reject(new Error('Google Picker timed out while loading.')),
      })
    })
  }

  await pickerPromise
}

async function loadGoogleIdentityServices() {
  if (!gisPromise) {
    gisPromise = loadScript({ id: 'google-identity-services', src: 'https://accounts.google.com/gsi/client' })
  }
  await gisPromise
}

async function requestAccessToken() {
  await loadGoogleIdentityServices()

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google authorization is unavailable. Please reload and try again.')
  }

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_PICKER_CLIENT_ID,
      scope: GOOGLE_PICKER_SCOPE,
      callback: () => undefined,
    })
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response?.error) {
        reject(new Error(response.error_description || response.error || 'Google authorization was cancelled.'))
        return
      }
      accessToken = response?.access_token || ''
      if (!accessToken) {
        reject(new Error('Google did not return an access token.'))
        return
      }
      resolve(accessToken)
    }

    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' })
  })
}

function getPickerDocs(data) {
  const picker = window.google?.picker
  if (!picker) return []
  return data?.[picker.Response.DOCUMENTS] || []
}

function openPicker(token) {
  const picker = window.google.picker

  return new Promise((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId.DOCS_IMAGES)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false)
      .setMimeTypes('image/png,image/jpeg,image/webp,image/gif')

    const builder = new picker.PickerBuilder()
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setOAuthToken(token)
      .setTitle('Choose images from Google')
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data) => {
        if (data?.[picker.Response.ACTION] === picker.Action.CANCEL) {
          resolve([])
          return
        }
        if (data?.[picker.Response.ACTION] === picker.Action.PICKED) {
          resolve(getPickerDocs(data))
        }
      })

    if (GOOGLE_PICKER_APP_ID) builder.setAppId(GOOGLE_PICKER_APP_ID)

    try {
      builder.build().setVisible(true)
    } catch (error) {
      reject(error)
    }
  })
}

function getGoogleDocName(doc, index) {
  return doc?.name || doc?.[window.google.picker.Document.NAME] || `Google image ${index + 1}`
}

function getGoogleDocId(doc) {
  return doc?.id || doc?.[window.google.picker.Document.ID] || ''
}

function getGoogleDocMimeType(doc) {
  return doc?.mimeType || doc?.[window.google.picker.Document.MIME_TYPE] || ''
}

async function downloadGoogleImage(doc, index, token) {
  const id = getGoogleDocId(doc)
  if (!id) throw new Error('Google did not return a file id.')

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error('Could not download the selected Google image.')
  }

  const blob = await response.blob()
  const mimeType = blob.type || getGoogleDocMimeType(doc) || 'image/jpeg'
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(mimeType)) {
    throw new Error('Choose image files from Google for post creative.')
  }

  return new File([blob], getGoogleDocName(doc, index), { type: mimeType })
}

export function isGooglePickerConfigured() {
  return Boolean(GOOGLE_PICKER_API_KEY && GOOGLE_PICKER_CLIENT_ID)
}

export async function openGoogleImagePicker() {
  if (!isGooglePickerConfigured()) {
    throw new Error('Google media picker needs VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_PICKER_CLIENT_ID configured.')
  }

  await loadGapiPicker()
  const token = await requestAccessToken()
  const docs = await openPicker(token)
  if (!docs.length) return []

  return Promise.all(docs.map((doc, index) => downloadGoogleImage(doc, index, token)))
}
