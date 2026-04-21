import { useEffect, useMemo, useState } from 'react'
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react'

const TABLE_ROW_LIMIT = 25

function escapeCell(value) {
  return String(value ?? '').trim()
}

function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      row.push(escapeCell(cell))
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(escapeCell(cell))
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(escapeCell(cell))
    rows.push(row)
  }

  return rows.filter((currentRow) => currentRow.some((value) => value !== ''))
}

function buildTableModel(text, mimeType) {
  const delimiter = mimeType === 'text/tab-separated-values' ? '\t' : ','
  const rows = parseDelimited(text, delimiter)

  if (rows.length === 0) return null

  const [headerRow, ...bodyRows] = rows
  const headers = headerRow.map((value, index) => value || `Column ${index + 1}`)
  const normalizedRows = bodyRows.map((currentRow) =>
    headers.map((_, index) => currentRow[index] || ''),
  )

  return {
    headers,
    rows: normalizedRows.slice(0, TABLE_ROW_LIMIT),
    hasMore: normalizedRows.length > TABLE_ROW_LIMIT,
    totalRows: normalizedRows.length,
  }
}

function normalizeText(text, mimeType) {
  if (mimeType === 'application/json') {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }

  return text
}

export default function TextDocumentViewer({ url, fileName, mimeType }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const normalizedContent = useMemo(() => normalizeText(content, mimeType), [content, mimeType])
  const tableModel = useMemo(() => {
    if (!content) return null
    if (mimeType !== 'text/csv' && mimeType !== 'text/tab-separated-values') return null
    return buildTableModel(content, mimeType)
  }, [content, mimeType])

  useEffect(() => {
    let cancelled = false

    async function loadText() {
      if (!url) return

      setStatus('loading')
      setError('')
      setContent('')

      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Could not load this document (${response.status}).`)
        }

        const text = await response.text()
        if (!cancelled) {
          setContent(text)
          setStatus('ready')
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Could not load this document preview.')
          setStatus('error')
        }
      }
    }

    loadText()

    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>{fileName}</p>
          <p className="text-xs" style={{ color: '#8a7858' }}>
            {mimeType === 'text/csv' || mimeType === 'text/tab-separated-values'
              ? 'Inline spreadsheet-style preview'
              : 'Inline text preview'}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-px"
          style={{ background: '#252015', border: '1px solid #3d3420', color: '#d4a83a' }}
        >
          Open Original
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {status === 'loading' && (
        <div className="rounded-2xl p-8 flex items-center justify-center gap-3" style={{ background: '#141109', border: '1px solid #3d3420' }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4a83a' }} />
          <span className="text-sm" style={{ color: '#c8b898' }}>Loading document preview…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Preview unavailable</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      {status === 'ready' && tableModel ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #3d3420', background: '#141109' }}>
          <div className="overflow-auto max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead style={{ background: '#1e1910' }}>
                <tr>
                  {tableModel.headers.map((header) => (
                    <th
                      key={header}
                      className="px-3 py-2 text-left text-xs uppercase tracking-widest font-medium whitespace-nowrap"
                      style={{ color: '#8a7858', borderBottom: '1px solid #3d3420' }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableModel.rows.map((row, rowIndex) => (
                  <tr key={`${fileName}-row-${rowIndex}`} style={{ borderBottom: '1px solid #2b2416' }}>
                    {row.map((value, columnIndex) => (
                      <td
                        key={`${fileName}-${rowIndex}-${columnIndex}`}
                        className="px-3 py-2 align-top whitespace-pre-wrap"
                        style={{ color: '#c8b898' }}
                      >
                        {value || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs" style={{ background: '#1e1910', color: '#8a7858', borderTop: '1px solid #3d3420' }}>
            Showing {Math.min(tableModel.totalRows, TABLE_ROW_LIMIT)} of {tableModel.totalRows} row{tableModel.totalRows === 1 ? '' : 's'}
            {tableModel.hasMore ? ' in the inline preview.' : '.'}
          </div>
        </div>
      ) : null}

      {status === 'ready' && !tableModel ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #3d3420', background: '#141109' }}>
          <pre
            className="p-4 overflow-auto max-h-[70vh] text-sm whitespace-pre-wrap break-words"
            style={{ color: '#c8b898', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            {normalizedContent || 'This document is empty.'}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
