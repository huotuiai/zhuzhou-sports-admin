import type { AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'
import { csvExportFilename, mapCsvExportResponse } from './csv-export'

describe('CSV export response mapping', () => {
  it('reads the server filename and truncation metadata', () => {
    const blob = new Blob(['csv'], { type: 'text/csv' })
    const response = {
      data: blob,
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''gate%20list.csv",
        'x-export-truncated': '1',
        'x-export-count': '5000',
        'x-export-total': '6200',
      },
    } as unknown as AxiosResponse<Blob>

    expect(mapCsvExportResponse(response, 'gates.csv')).toEqual({
      content: blob,
      filename: 'gate list.csv',
      truncated: true,
      count: 5000,
      total: 6200,
    })
  })

  it('falls back safely when optional headers are unavailable', () => {
    const blob = new Blob(['csv'], { type: 'text/csv' })
    const response = { data: blob, headers: {} } as unknown as AxiosResponse<Blob>
    expect(mapCsvExportResponse(response, 'gates.csv')).toMatchObject({
      filename: 'gates.csv', truncated: false, count: null, total: null,
    })
    expect(csvExportFilename('attachment; filename="../../bad.csv"', 'gates.csv')).toBe('.._.._bad.csv')
  })
})
