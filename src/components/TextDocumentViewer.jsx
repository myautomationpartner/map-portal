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
          <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{fileName}</p>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            {mimeType === 'text/csv' || mimeType === 'text/tab-separated-values'
              ? 'Inline spreadsheet-style preview'
              : 'Inline text preview'}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all"
        >
          Open Original
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {status === 'loading' && (
        <div className="portal-surface-strong flex items-center justify-center gap-3 rounded-[24px] p-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Loading document preview…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="portal-status-danger flex items-start gap-3 rounded-[24px] p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Preview unavailable</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      {status === 'ready' && tableModel ? (
        <div className="overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: 'var(--portal-border)' }}>
          <div className="overflow-auto max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead style={{ background: 'rgba(244, 247, 255, 0.96)' }}>
                <tr>
                  {tableModel.headers.map((header) => (
                    <th
                      key={header}
                      className="px-3 py-2 text-left text-xs uppercase tracking-widest font-medium whitespace-nowrap"
                      style={{ color: 'var(--portal-text-soft)', borderBottom: '1px solid var(--portal-border)' }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableModel.rows.map((row, rowIndex) => (
                  <tr key={`${fileName}-row-${rowIndex}`} style={{ borderBottom: '1px solid rgba(109, 115, 196, 0.12)' }}>
                    {row.map((value, columnIndex) => (
                      <td
                        key={`${fileName}-${rowIndex}-${columnIndex}`}
                        className="px-3 py-2 align-top whitespace-pre-wrap"
                        style={{ color: 'var(--portal-text-muted)' }}
                      >
                        {value || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs" style={{ background: 'rgba(244, 247, 255, 0.96)', color: 'var(--portal-text-muted)', borderTop: '1px solid var(--portal-border)' }}>
            Showing {Math.min(tableModel.totalRows, TABLE_ROW_LIMIT)} of {tableModel.totalRows} row{tableModel.totalRows === 1 ? '' : 's'}
            {tableModel.hasMore ? ' in the inline preview.' : '.'}
          </div>
        </div>
      ) : null}

      {status === 'ready' && !tableModel ? (
        <div className="overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: 'var(--portal-border)' }}>
          <pre
            className="p-4 overflow-auto max-h-[70vh] text-sm whitespace-pre-wrap break-words"
            style={{ color: 'var(--portal-text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            {normalizedContent || 'This document is empty.'}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
